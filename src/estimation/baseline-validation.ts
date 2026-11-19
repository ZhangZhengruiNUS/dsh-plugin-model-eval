import {isRunConcurrency} from '../contracts.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {calibrationHash,validateTimingTrace,traceIdValid,isProbeProgramId,type WorkloadPlanV1,type BaselineProfileV1,type TimingTraceV1} from './calibration-contracts.ts';
export function assertWorkloadPlan(p:WorkloadPlanV1){
 const fields=(value:object,allowed:string[])=>Object.keys(value).every(k=>allowed.includes(k));
 const identifier=(v:unknown)=>typeof v==='string'&&/^[\w./:-]{1,220}$/.test(v)&&!v.includes('://');
 if(!p||p.version!==1||!calibrationHash(p.protocolHash)||!calibrationHash(p.workloadHash)||!Array.isArray(p.jobs)||!Number.isSafeInteger(p.readingSplitBytes)||p.readingSplitBytes<0||
   !fields(p,['version','refs','protocolHash','workloadHash','readingSplitBytes','executionOrderHash','jobs'])||!p.refs||!fields(p.refs,['generalId','writingId','resourceVersion'])||!['generalId','writingId','resourceVersion'].every(k=>identifier(p.refs[k as keyof typeof p.refs]))||
   (p.executionOrderHash!==undefined&&!calibrationHash(p.executionOrderHash))||
   p.workloadHash!==identityHash({executionOrderHash:p.executionOrderHash,protocolHash:p.protocolHash,readingSplitBytes:p.readingSplitBytes,jobs:p.jobs})||new Set(p.jobs.map(j=>j.itemId)).size!==p.jobs.length)throw Error('WORKLOAD_CHANGED');
 for(const j of p.jobs)if(!j||!fields(j,['itemId','datasetId','track','inputBytes','inputGroup','stages'])||!identifier(j.itemId)||!identifier(j.datasetId)||!['general','writing'].includes(j.track)||!['ordinary','reading-short','reading-long'].includes(j.inputGroup)||!Number.isSafeInteger(j.inputBytes)||j.inputBytes<0||!Array.isArray(j.stages)||!j.stages.length||j.stages.some(s=>!['answer','judge','local-grade','tool-scenario'].includes(s)))throw Error('WORKLOAD_CHANGED');
}
export function assertCompleteFormalTrace(plan:WorkloadPlanV1,t:TimingTraceV1){
 if(t.status!=='completed'||t.truthMs===undefined||!Number.isFinite(t.truthMs)||t.truthMs<=0)throw Error('CALIBRATION_TRUTH_MISSING');
 if(t.programId==='formal-first-pass-v1'){
  validateTimingTrace(t);const f=t.firstPass!;if(identityHash([...f.scoredItemIds,...f.deferredItemIds].sort())!==identityHash(plan.jobs.map(j=>j.itemId).sort()))throw Error('FIRST_PASS_COVERAGE_INVALID');
  for(const j of plan.jobs){if(f.deferredItemIds.includes(j.itemId)){const timeoutPhase=j.stages.includes('tool-scenario')?'tool-scenario':j.stages.includes('judge')&&t.events.some(e=>e.itemId===j.itemId&&e.phase==='answer'&&e.outcome==='completed')?'judge':'answer';if(!t.events.some(e=>e.itemId===j.itemId&&e.datasetId===j.datasetId&&e.phase===timeoutPhase&&e.outcome==='timeout'))throw Error('FIRST_PASS_TIMEOUT_MISSING');}
   else for(const phase of j.stages)if(!t.events.some(e=>e.itemId===j.itemId&&e.datasetId===j.datasetId&&e.phase===phase&&e.outcome==='completed'))throw Error('INCOMPLETE_FORMAL_TRACE');
  }return;
 }
 if(t.programId!=='formal-trace-v1')throw Error('FORMAL_PROGRAM_INVALID');
 for(const j of plan.jobs)for(const phase of j.stages)if(!t.events.some(e=>e.itemId===j.itemId&&e.datasetId===j.datasetId&&e.phase===phase&&e.outcome==='completed'))throw Error('INCOMPLETE_FORMAL_TRACE');
}
export function assertBaselineProfile(p:BaselineProfileV1):void {
 if(!p||p.version!==1||p.scope!=='same-configuration'||p.algorithmId!=='estimate-v3'||!Number.isFinite(Date.parse(p.createdAt))||!isRunConcurrency(p.concurrency)||typeof p.validated!=='boolean'||
   p.durationScope!==undefined&&!['all-scored','first-pass'].includes(p.durationScope)||Object.keys(p).some(k=>!['version','id','createdAt','algorithmId','programHash','protocolHash','workloadHash','conditionKey','machineKey','concurrency','scope','trainingTraceIds','formal','probes','residualRatios','validated','rangeValidated','durationScope'].includes(k)))throw Error('BASELINE_INVALID');
 for(const k of ['id','programHash','protocolHash','workloadHash','conditionKey','machineKey'] as const)if(!calibrationHash(p[k]))throw Error('BASELINE_IDENTITY_INVALID');
 const {id,...body}=p;if(id!==identityHash(body))throw Error('BASELINE_IDENTITY_CHANGED');
 // This schema has no independent validation/residual provenance yet. Do not accept a flag as evidence.
 if(p.validated||p.rangeValidated||p.residualRatios?.length)throw Error('BASELINE_VALIDATION_EVIDENCE_UNSUPPORTED');
 if(!Array.isArray(p.formal)||!p.formal.length||!Array.isArray(p.probes)||!p.probes.length||!Array.isArray(p.trainingTraceIds)||!Array.isArray(p.residualRatios)||p.residualRatios.some(n=>!Number.isFinite(n)||n<=0)||
   p.rangeValidated!==undefined&&typeof p.rangeValidated!=='boolean'||p.rangeValidated&&(!p.validated||p.residualRatios.length<2))throw Error('BASELINE_INVALID');
 const ids=new Set<string>();for(const t of [...p.formal,...p.probes]){validateTimingTrace(t);
  if(ids.has(t.traceId)||t.conditionKnown!==true||t.protocolHash!==p.protocolHash||t.workloadHash!==p.workloadHash||t.conditionKey!==p.conditionKey||t.machineKey!==p.machineKey||t.programHash!==p.programHash||t.concurrency!==p.concurrency||Date.parse(t.updatedAt)>Date.parse(p.createdAt)||t.firstPass&&Date.parse(t.firstPass.capturedAt)>Date.parse(p.createdAt))throw Error('BASELINE_SOURCE_INVALID');ids.add(t.traceId);}
 if(p.trainingTraceIds.length!==ids.size||new Set(p.trainingTraceIds).size!==ids.size||p.trainingTraceIds.some(id=>!traceIdValid(id)||!ids.has(id)))throw Error('BASELINE_SOURCE_INVALID');
 for(const t of p.formal){if(t.programId!==(p.durationScope==='first-pass'?'formal-first-pass-v1':'formal-trace-v1')||!p.probes.some(probe=>probe.traceId===(t.previewId??t.pairedTraceId)&&isProbeProgramId(probe.programId)&&Date.parse(probe.updatedAt)<=Date.parse(t.startedAt)))throw Error('BASELINE_PAIR_MISSING');}
}
