import {isDeepStrictEqual} from 'node:util';
import type {TimingTraceHistory,TimingTraceV1,WorkloadPlanV1,BaselineProfileV1} from './calibration-contracts.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {buildBaselineProfile} from './baseline-builder.ts';

export async function readFirstPassSource(history:Pick<TimingTraceHistory,'read'>,formal:TimingTraceV1,cutoff:number):Promise<TimingTraceV1|undefined>{
 const receipt=formal.firstPass;
 if(!receipt||formal.programId!=='formal-first-pass-v1'||formal.durationScope!=='first-pass'||formal.status!=='completed'||!formal.runId)return;
 const source=await history.read(receipt.sourceTraceId);
 if(!source||source.programId!=='formal-trace-v1'||!['completed','stopped'].includes(source.status)||receipt.sourceUpdatedAt!==source.updatedAt||receipt.sourceTraceHash!==identityHash(source)||!isDeepStrictEqual(formal.events,source.events))return;
 if((source.status==='completed')!==(receipt.deferredItemIds.length===0)||source.status==='completed'&&source.truthMs!==formal.truthMs||source.status==='stopped'&&source.truthMs!==undefined)return;
 if((['rootId','conditionKnown','conditionKey','programHash','machineKey','protocolHash','workloadHash','concurrency','runId','previewId','pairedTraceId','predictionProbeId','prediction','startedAt'] as const).some(key=>!isDeepStrictEqual(formal[key],source[key])))return;
 if(Math.max(Date.parse(formal.updatedAt),Date.parse(receipt.capturedAt),Date.parse(source.updatedAt))>cutoff)return;
 return source;
}

export async function readPairedBaseline(history:Pick<TimingTraceHistory,'read'>,workload:WorkloadPlanV1,formal:TimingTraceV1,source:TimingTraceV1,cutoff:number):Promise<BaselineProfileV1|undefined>{
 const probe=formal.previewId?await history.read(formal.previewId):undefined;
 if(!probe)return;
 const createdMs=Math.max(Date.parse(formal.updatedAt),Date.parse(formal.firstPass!.capturedAt),Date.parse(source.updatedAt),Date.parse(probe.updatedAt));
 if(!Number.isFinite(createdMs)||createdMs>cutoff)return;
 try{return buildBaselineProfile(workload,[formal,probe],new Date(createdMs).toISOString());}catch{/* An incomplete or incompatible candidate cannot supply a forecast. */}
}

/** Rebuild from currently present metadata, never from bounded performance
 * summaries or an indefinitely cached profile. Deleting a source immediately
 * removes its eligibility; a previously saved report prediction stays separate.
 */
export async function readLocalBaselines(history:Pick<TimingTraceHistory,'list'|'read'>,workload:WorkloadPlanV1,asOf:string,excludeRunIds:readonly string[]=[]):Promise<BaselineProfileV1[]>{
 const cutoff=Date.parse(asOf);if(!Number.isFinite(cutoff))throw Error('CALIBRATION_TIME_INVALID');
 const rows=(await history.list()).filter(t=>t.programId==='formal-first-pass-v1'&&t.durationScope==='first-pass'&&t.status==='completed'&&t.firstPass&&t.runId&&!excludeRunIds.includes(t.runId)&&t.protocolHash===workload.protocolHash&&t.workloadHash===workload.workloadHash)
  .sort((a,b)=>a.firstPass!.capturedAt.localeCompare(b.firstPass!.capturedAt)||a.traceId.localeCompare(b.traceId));
 const seen=new Set<string>(),profiles:BaselineProfileV1[]=[];
 for(const formal of rows){
  if(seen.has(formal.runId!))continue;
  const source=await readFirstPassSource(history,formal,cutoff);
  const profile=source&&await readPairedBaseline(history,workload,formal,source,cutoff);
  if(profile){profiles.push(profile);seen.add(formal.runId!);}
 }
 return profiles.sort((a,b)=>a.id.localeCompare(b.id));
}
