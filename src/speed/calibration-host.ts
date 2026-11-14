import type {BatchView} from '../jobs/queue.ts';
import {open,lstat,realpath} from 'node:fs/promises';import {join,resolve} from 'node:path';
import type {HostAdapter,EvaluationRequest} from '../contracts.ts';import type {Action} from '../host/api.ts';
import type {createCalibrationExperiment} from './calibration-experiment.ts';
import {readRecord,writeRecord} from '../history/atomic.ts';import {identityHash} from '../evaluation/protocol-identity.ts';
import {assertCalibrationGrant,type CalibrationGrant} from './calibration-grant.ts';import {readBaselineCatalog} from '../estimation/baseline-registry.ts';
import {calibrationAuthority} from './calibration-authority.ts';
interface Service {dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown>;readonly experiment:ReturnType<typeof createCalibrationExperiment>|undefined}
const missing=(e:unknown)=>(e as NodeJS.ErrnoException).code==='ENOENT';
/** Developer candidate only. Local exact-arm + durable one-shot marker; no new network endpoint. */
export function launchCalibrationHost(service:Service,adapter:HostAdapter,directory:string,options:{pollMs?:number;authorizationRoot?:string}={}){
 const stop=new AbortController();let consumed=false,phase='preparing',batch:BatchView|undefined,tail:Promise<unknown>=Promise.resolve();
 const save=(extra:Record<string,unknown>={})=>{const row={version:1,phase,updatedAt:new Date().toISOString(),...extra,...(batch?{batch}:{}),...(consumed?{experiment:service.experiment?.status()}: {})};const next=tail.then(()=>writeRecord(join(directory,'progress.json'),row));tail=next.catch(()=>{});return next;};
 const wait=()=>new Promise<void>(r=>{const finish=()=>{clearTimeout(timer);stop.signal.removeEventListener('abort',finish);r();};const timer=setTimeout(finish,options.pollMs??1000);stop.signal.addEventListener('abort',finish,{once:true});if(stop.signal.aborted)finish();});
 async function checkedRead<T>(name:string):Promise<T>{const path=join(directory,name),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||resolve(await realpath(path))!==resolve(path)||s.size>65536)throw Error('CALIBRATION_FILE_UNSAFE');return readRecord<T>(path);}
 async function run(){
  const dir=await lstat(directory);if(!dir.isDirectory()||dir.isSymbolicLink()||resolve(await realpath(directory))!==resolve(directory))throw Error('CALIBRATION_PATH_UNSAFE');
  try{await lstat(join(directory,'started.json'));return;}catch(e){if(!missing(e))throw e;}
  const rawGrant=await checkedRead<unknown>('grant.json');assertCalibrationGrant(rawGrant);const grant:CalibrationGrant=rawGrant;
  if(grant.version===2&&!options.authorizationRoot)throw Error('CALIBRATION_AUTHORITY_REQUIRED');
  const authority=options.authorizationRoot?await calibrationAuthority(options.authorizationRoot,directory):undefined;
  if(grant.version===1&&authority&&!authority.isLegacySession)throw Error('CALIBRATION_LEGACY_GRANT_SCOPE');
  if(grant.version===2)await authority!.assertUnused(grant.grantId);
  const experiment=service.experiment;if(!experiment)throw Error('CALIBRATION_DISABLED');
  await service.dispatch('prepare',{});if(stop.signal.aborted)return;
  const status=await service.dispatch('status',{}) as {rootId:string;rootPath:string};
  async function binding(){const choice=(await adapter.catalog()).find(c=>c.providerId===grant.providerId&&c.modelId===grant.modelId);if(!choice)throw Error('MODEL_NOT_CONFIGURED');
   const target=await adapter.snapshot(choice,{}),request:EvaluationRequest={targets:[target],tracks:['general'],generalId:grant.generalId,execution:grant.execution};
   const prepared=await experiment!.prepare(request);if(prepared.questionCount!==100||grant.version===2&&prepared.programId!==grant.programId)throw Error('CALIBRATION_SCOPE_INVALID');
   const profiles=grant.version===2&&grant.mode==='validation'?await readBaselineCatalog(join(directory,'baseline')):[];
   if(grant.version===2&&(identityHash(profiles.map(p=>p.id).sort())!==identityHash([...grant.baselineIds].sort())||profiles.some(p=>(p.durationScope??'all-scored')!==(grant.durationScope??'all-scored')||p.conditionKey!==prepared.conditionKey||p.machineKey!==prepared.machineKey||p.programHash!==prepared.programHash||p.protocolHash!==prepared.protocolHash||p.workloadHash!==prepared.workloadHash||p.concurrency!==request.execution.concurrency)))throw Error('CALIBRATION_BASELINE_CHANGED');
   const body={version:1,grantId:grant.grantId,grantHash:identityHash(grant),rootId:status.rootId,providerId:grant.providerId,modelId:grant.modelId,controls:target.controls,execution:grant.execution,...(authority?{sessionKey:authority.sessionKey}:{}),...prepared};
   return {request,body,profiles,preparedHash:identityHash(body)};
  }
  const initial=await binding();await writeRecord(join(directory,'prepared.json'),{...initial.body,preparedHash:initial.preparedHash});phase='awaiting-exact-arm';await save();
  let arm:{grantId:string;preparedHash:string}|undefined;
  while(!stop.signal.aborted){try{arm=await checkedRead('arm.json');break;}catch(e){if(!missing(e))throw e;}await wait();}
  if(stop.signal.aborted)return;
  if(identityHash(await checkedRead('grant.json'))!==identityHash(grant))throw Error('CALIBRATION_GRANT_CHANGED');
  const fresh=await binding(),current=await service.dispatch('status',{}) as {rootId:string};
  if(!arm||Object.keys(arm).sort().join(',')!=='grantId,preparedHash'||arm.grantId!==grant.grantId||arm.preparedHash!==initial.preparedHash||fresh.preparedHash!==initial.preparedHash||current.rootId!==status.rootId)throw Error('CALIBRATION_ARM_CHANGED');
  if(grant.version===2)await authority!.consume(grant.grantId,initial.preparedHash);
  const marker=await open(join(directory,'started.json'),'wx');try{await marker.writeFile(JSON.stringify({grantId:grant.grantId,preparedHash:initial.preparedHash,startedAt:new Date().toISOString()}));await marker.sync();}finally{await marker.close();}consumed=true;
  const interval=setInterval(()=>void save().catch(()=>{experiment.cancel();}),options.pollMs??1000);
  try{
   phase='local-check';await save();const local=await experiment.measureLocal(fresh.request);await writeRecord(join(directory,'local-check.json'),local);
   if(stop.signal.aborted)return;
   phase='development-probe';await save();await experiment.startPreview(fresh.request,{conditionKey:fresh.body.conditionKey,...grant.limits},grant.version===2&&grant.mode==='validation'?'preview':'calibration');await experiment.idle();
   if(grant.version===2&&grant.mode==='validation'&&!stop.signal.aborted){phase='freeze-forecast';await save();const forecast=await experiment.forecast(fresh.request,fresh.profiles);await writeRecord(join(directory,'forecast.json'),forecast);}
   if(stop.signal.aborted)return;
   phase='formal-100';batch=await experiment.startFormal(fresh.request,grant.version===2?grant.durationScope:undefined);await save();await experiment.idle();phase=grant.version===1?'finished':grant.durationScope==='first-pass'&&experiment.status().firstPassTraceId?'first-pass-completed':experiment.status().formal?.batches.find(b=>b.batchId===batch!.batchId)?.status==='completed'?'completed':'formal-incomplete';
  }finally{clearInterval(interval);await save();}
 }
 const done=run().catch(async e=>{if(consumed){service.experiment?.cancel();await service.experiment?.idle().catch(()=>{});}phase=stop.signal.aborted?'stopped':'failed';const code=String(e?.code??e?.message??'CALIBRATION_FAILED');await save({errorCode:/^[A-Z][A-Z0-9_]{1,70}$/.test(code)?code:'CALIBRATION_FAILED'}).catch(()=>{});});
 return {done,async dispose(){stop.abort();if(consumed)service.experiment?.cancel();await done;await tail;}};
}
