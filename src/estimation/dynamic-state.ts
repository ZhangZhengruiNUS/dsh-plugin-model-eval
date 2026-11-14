import type {ItemRecord} from '../history/store.ts';import type {WorkloadJobV1} from './calibration-contracts.ts';import type {DynamicPredictionInput} from './profile-dynamic.ts';
/** Queue facts, not bounded performance summaries, define remaining work. A
 * completed answer awaiting the serial grader still owns its queue worker.
 * Internal tool turns belong to one active scene and never add a worker.
 */
export function dynamicWorkState(jobs:readonly WorkloadJobV1[],items:readonly ItemRecord[],now:string):Pick<DynamicPredictionInput,'remainingJobs'|'terminalItems'|'activeStages'>{
 const byId=new Map(items.map(i=>[i.itemId,i])),remainingJobs:WorkloadJobV1[]=[],terminalItems:DynamicPredictionInput['terminalItems'][number][]=[],activeStages:DynamicPredictionInput['activeStages'][number][]=[];
 const age=(stamp:string)=>Math.max(0,Date.parse(now)-Date.parse(stamp));
 for(const job of jobs){const item=byId.get(job.itemId),last=item?.attempts.at(-1);
  if(item?.grade?.kind==='scored'){terminalItems.push({itemId:job.itemId,state:'scored'});continue;}
  if(!item?.toolActiveStage&&!item?.gradingActive&&last?.status==='failed'&&last.error?.code==='OBSERVED_OUTPUT_TIMEOUT'&&last.performance?.outcome==='timeout'){terminalItems.push({itemId:job.itemId,state:'deferred-timeout'});continue;}
  const stages=job.stages.includes('tool-scenario')?job.stages:item?.answer?.complete?job.stages.filter(p=>p!=='answer'):job.stages;
  remainingJobs.push({...job,stages});
  if(item?.toolActiveStage)activeStages.push({itemId:job.itemId,phase:'tool-scenario',ageMs:(item.toolActiveMs??0)+age(item.toolActiveStage.startedAt)});
  else if(item?.gradingActive)activeStages.push({itemId:job.itemId,phase:'local-grade',ageMs:age(item.gradingActive.startedAt)});
  else if(last?.status==='started')activeStages.push({itemId:job.itemId,phase:last.phase,ageMs:age(last.startedAt)});
 }
 return {remainingJobs,terminalItems,activeStages};
}
