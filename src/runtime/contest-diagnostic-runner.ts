import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {verifyRuntime} from './integrity.ts';
import {RUNTIME_PINS} from './pins.ts';
import {CONTEST_DIAGNOSTIC_SHA256} from './contest-diagnostic-pin.ts';
import {CONTEST_CACHE_SHA256} from './contest-cache-pin.ts';
import {ContestFrames} from './contest-frames.ts';
import {DriverDiagnostics,type ContestDiagnostics} from './contest-diagnostics.ts';
import type {ContestOutcome,ContestRunner} from './contest-runner.ts';
const unreaped=new Set<ChildProcess>();
const SETTLE_GRACE_MS=2000;
function bounded<T>(work:Promise<T>,ms:number,fallback:T,signal?:AbortSignal):Promise<T>{
  let timer:ReturnType<typeof setTimeout>,abort:()=>void;
  return new Promise<T>((done,reject)=>{
    abort=()=>done(fallback);
    timer=setTimeout(abort,Math.max(1,ms));
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    work.then(done,reject);
  }).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);});
}
/** Guest output is opaque text. The Host owns every expected answer and comparison. */
export function createContestDiagnosticRunner(runtimeRoot:string,driverRoot:string,options:{policy?:'wall-safety-v1';io?:{verify?:typeof verifyRuntime;cleanup?:typeof rm};now?:()=>number;onDiagnostics?:(trace:ContestDiagnostics)=>void|Promise<void>}={}):ContestRunner {
  const root=resolve(runtimeRoot);
  return {async runContest(test,solution,signal){
    const now=options.now??(()=>performance.now()),start=now(),elapsedMs=()=>Math.round(now()-start),limits=test.limits;
    const trace:ContestDiagnostics={matchedCases:0,driver:{status:'missing'}};
    const safety=options.policy==='wall-safety-v1';
    const wall=(wallPhase:'setup'|'process'):ContestOutcome=>safety?{kind:'environment-error',code:'CONTEST_WALL_LIMIT',wallPhase,elapsedMs:elapsedMs()}:{kind:'failed',reason:'timeout',elapsedMs:elapsedMs()};
    const finish=(outcome:ContestOutcome):ContestOutcome=>{
      try {void Promise.resolve(options.onDiagnostics?.(trace)).catch(()=>{});} catch {/* Optional observer. */}
      return outcome;
    };
    if(signal.aborted){trace.hostTrigger='cancelled';return finish({kind:'cancelled',elapsedMs:elapsedMs()});}
    if(process.platform!=='win32'||process.arch!=='x64')return {kind:'environment-error',code:'UNSUPPORTED_RUNTIME',elapsedMs:elapsedMs()};
    if(!limits||!Number.isSafeInteger(limits.wallMs)||limits.wallMs<100||limits.wallMs>300000||!Number.isSafeInteger(limits.memoryBytes)||limits.memoryBytes<67108864||limits.memoryBytes>1073741824||!Number.isSafeInteger(limits.computeBudget)||limits.computeBudget<1||!test.cases.length||test.cases.length>3000||solution.length>1024*1024||test.cases.some(c=>typeof c.stdin!=='string'||typeof c.expected!=='string'||Buffer.byteLength(c.stdin)>2*1024*1024||Buffer.byteLength(c.expected)>2*1024*1024)||test.cases.reduce((n,c)=>n+Buffer.byteLength(c.stdin),0)>32*1024*1024)return {kind:'environment-error',code:'INVALID_CONTEST_REQUEST',elapsedMs:elapsedMs()};
    if(safety&&unreaped.size)return finish({kind:'environment-error',code:'CONTEST_CHILD_UNREAPED',elapsedMs:elapsedMs()});
    const verify=options.io?.verify??verifyRuntime,remove=options.io?.cleanup??rm;
    let sandbox:string|undefined,abandoned=false,lateClose:Promise<void>|undefined;
    const cleanup=()=>sandbox?remove(sandbox,{recursive:true,force:true}):Promise.resolve();
    const outcome=await (async():Promise<ContestOutcome>=>{try{
      const host=join(root,'code-host'),guest=join(root,'wasi'),driver=resolve(driverRoot),cacheRoot=join(root,'contest-cache');
      const prepare=async()=>{
      const verifyStart=performance.now();
      try{
        await verify(cacheRoot,'contest-cache',CONTEST_CACHE_SHA256);if(abandoned)return false;
        const metadata=JSON.parse(await readFile(join(cacheRoot,'runtime.json'),'utf8')).generation;
        if(metadata?.baseWasiManifestSha256!==RUNTIME_PINS.wasi||metadata?.compiler?.magic!=='f30d0d0a'||metadata?.compiler?.cacheTag!=='cpython-313'||metadata?.compiler?.optimization!==0||metadata?.compiler?.hashMode!=='checked-hash')throw Error('BASE_IDENTITY_MISMATCH');
      }catch(error){throw Error('CONTEST_CACHE_'+((error as NodeJS.ErrnoException).code??(error as Error).message));}
      await verify(host,'code-host',RUNTIME_PINS['code-host']);if(abandoned)return false;
      await verify(guest,'wasi',RUNTIME_PINS.wasi);if(abandoned)return false;
      await verify(driver,'contest',CONTEST_DIAGNOSTIC_SHA256);if(abandoned)return false;
      trace.verifyMs=Math.round(performance.now()-verifyStart);
      const prepareStart=performance.now();
      sandbox=await mkdtemp(join(tmpdir(),'dsh-eval-contest-'));if(abandoned)return false;
      const inputPath=join(sandbox,'input.json');
      await writeFile(inputPath,JSON.stringify({solution,inputs:test.cases.map(c=>c.stdin)}),{flag:'wx'});
      trace.prepareMs=Math.round(performance.now()-prepareStart);
      return true;
      };
      const preparation=prepare();
      if(safety&&!(await bounded(preparation,limits.wallMs,false,signal))){
        abandoned=true;
        if(!signal.aborted)trace.hostTrigger='setup-deadline';
        void preparation.catch(()=>{}).then(cleanup).catch(()=>{});
        return signal.aborted?{kind:'cancelled',elapsedMs:elapsedMs()}:wall('setup');
      }
      if(!safety)await preparation;
      const inputPath=join(sandbox!,'input.json');
      if(signal.aborted){trace.hostTrigger='cancelled';return {kind:'cancelled',elapsedMs:elapsedMs()};}
      const remainingMs=limits.wallMs-(now()-start);
      if(remainingMs<=0){trace.hostTrigger='setup-deadline';return wall('setup');}
      const frames=new ContestFrames(test.cases);
      const diagnostic=safety||options.onDiagnostics?new DriverDiagnostics():undefined;
      let diagnosticFailed=false;
      const childStart=performance.now();
      const result=await new Promise<{code:number|null;stopped?:'cancelled'|'timeout'|'resource'|'assertion'|'frame';spawnFailed:boolean;unreaped?:true}>(done=>{
        const child=spawn(join(host,'python.exe'),['-I','-B','-X','utf8',join(driver,'execute_contest_wasi.py')],{shell:false,windowsHide:true,cwd:host,env:{},stdio:['pipe','pipe','pipe']});
        let bytes=0,stopped:'cancelled'|'timeout'|'resource'|'assertion'|'frame'|undefined,spawnFailed=false;
        let grace:ReturnType<typeof setTimeout>|undefined;
        let closed!:()=>void;const closure=new Promise<void>(resolve=>closed=resolve);
        const stop=(why:typeof stopped)=>{
          if(safety&&stopped)return;
          stopped??=why;child.kill('SIGKILL');
          if(safety)grace=setTimeout(()=>{
            unreaped.add(child);lateClose=closure;signal.removeEventListener('abort',cancel);clearTimeout(timer);
            done({code:null,spawnFailed,unreaped:true});
          },SETTLE_GRACE_MS);
        },cancel=()=>stop('cancelled');
        const timer=setTimeout(()=>stop('timeout'),remainingMs);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
        child.stdout.on('data',(chunk:Buffer)=>{if(stopped)return;bytes+=chunk.length;if(bytes>24*1024*1024){stop('resource');return;}try{if(frames.push(chunk.toString('utf8')))stop('assertion');}catch{stop('frame');}});
        child.stderr.on('data',(chunk:Buffer)=>{
          if(!diagnostic||diagnosticFailed)return;
          try{diagnostic.push(chunk,Math.round(performance.now()-childStart));}catch{diagnosticFailed=true;}
        });child.stdin.on('error',()=>{});child.on('error',()=>{spawnFailed=true;});
        child.on('close',code=>{clearTimeout(timer);clearTimeout(grace);unreaped.delete(child);closed();signal.removeEventListener('abort',cancel);done({code,spawnFailed,...(stopped?{stopped}:{})});});
        child.stdin.end(JSON.stringify({runtimeRoot:guest,cacheRoot,inputPath,...limits,wallMs:remainingMs,...(diagnostic?{diagnostics:true}:{})}));
      });
      trace.childMs=Math.round(performance.now()-childStart);
      trace.matchedCases=frames.matchedCases;
      try{
        trace.driver=diagnosticFailed?{status:'invalid'}:diagnostic?.finish(test.cases.length,trace.matchedCases)??trace.driver;
      }catch{trace.driver={status:'invalid'};}
      if(result.stopped){
        const triggers={cancelled:'cancelled',timeout:'process-deadline',resource:'host-output',assertion:'mismatch',frame:'invalid-frame'} as const;
        trace.hostTrigger=triggers[result.stopped];
      }
      if(result.unreaped)return {kind:'environment-error',code:'CONTEST_CHILD_UNREAPED',elapsedMs:elapsedMs()};
      if(result.spawnFailed)return {kind:'environment-error',code:'SPAWN_FAILED',elapsedMs:elapsedMs()};
      if(result.stopped==='cancelled')return {kind:'cancelled',elapsedMs:elapsedMs()};
      if(result.stopped==='frame')return {kind:'environment-error',code:'INVALID_HOST_FRAME',elapsedMs:elapsedMs()};
      if(safety&&result.stopped==='timeout')return wall('process');
      if(safety&&result.stopped==='resource')return {kind:'environment-error',code:'CONTEST_HOST_OUTPUT_LIMIT',elapsedMs:elapsedMs()};
      if(result.stopped)return {kind:'failed',reason:result.stopped,elapsedMs:elapsedMs()};
      if(result.code!==0)return {kind:'environment-error',code:'HOST_DRIVER_FAILED',elapsedMs:elapsedMs()};
      try{
        const verdict=frames.finish();
        if(safety&&verdict.kind==='failed'){
          if(verdict.reason==='timeout')return wall('process');
          if(verdict.reason==='resource'&&!(trace.driver.status==='complete'&&['fuel','guest-case-output','guest-total-output'].includes(trace.driver.cause??'')))return {kind:'environment-error',code:'CONTEST_RESOURCE_UNCONFIRMED',elapsedMs:elapsedMs()};
        }
        return {...verdict,elapsedMs:elapsedMs()};
      }catch{trace.hostTrigger='invalid-or-missing-terminal';return {kind:'environment-error',code:'INVALID_HOST_FRAME',elapsedMs:elapsedMs()};}
    }catch(error){return {kind:'environment-error',code:(error as NodeJS.ErrnoException).code??(error as Error).message,elapsedMs:elapsedMs()};}})();
    if(sandbox&&!abandoned){
      const cleanupStart=performance.now();
      try{
        if(lateClose){void lateClose.then(cleanup).catch(()=>{});outcome.cleanupFailed=true;}
        else if(safety){if(!await bounded(cleanup().then(()=>true),SETTLE_GRACE_MS,false))outcome.cleanupFailed=true;}
        else await cleanup();
      }catch(error){
        if(!safety)throw error;
        outcome.cleanupFailed=true;
      }
      trace.cleanupMs=Math.round(performance.now()-cleanupStart);
    }
    if(outcome.kind==='passed'&&now()-start>limits.wallMs){
      trace.hostTrigger='post-run-deadline';
      if(!safety)return finish(wall('process'));
      if(outcome.elapsedMs>limits.wallMs)return finish(wall('process'));
      outcome.wallPhase='cleanup';
    }
    return finish({...outcome,elapsedMs:elapsedMs()});
  }};
}
