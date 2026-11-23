import type {RunSummary} from '../contracts.ts';
import type {BatchView,QueueView} from '../jobs/queue.ts';

export function runIsComplete(run:RunSummary){
  const tracks=Object.values(run.tracks);
  return tracks.length>0&&tracks.every(track=>track.status==='completed');
}

export function canResumeRun(run:RunSummary){
  return run.resumeAllowed&&run.details==='available';
}

export function batchStatus(batch:BatchView,active=false){
  if(active){
    const starting=batch.startup&&batch.startup.firstDispatchMs===undefined&&!batch.activeRunIds?.length&&!batch.activeRunId;
    return starting?'queued':'running';
  }
  const states=Object.values(batch.runControls??{});
  if(batch.status==='completed'&&states.some(control=>control.state==='removed'))return 'ended';
  if(batch.status==='pending'&&states.some(control=>control.state==='held'))return 'attention';
  return batch.status;
}

export function runIsSettling(batch:BatchView,id:string){
  return batch.settlingRunIds?.includes(id)??batch.settlingRunId===id;
}
export function runIsActive(batch:BatchView,id:string){
  return batch.activeRunIds?.includes(id)??batch.activeRunId===id;
}
export function batchRunStatus(batch:BatchView,run:RunSummary){
  const control=batch.runControls?.[run.runId];
  if(runIsSettling(batch,run.runId))return 'stopping';
  if(control?.state==='held')return control.error?'attention':'held';
  if(control?.state==='removed')return 'removed';
  if(runIsComplete(run))return 'completed';
  if(runIsActive(batch,run.runId))return 'running';
  if(batch.status==='paused')return 'paused';
  if(batch.status==='running')return 'queued';
  if(Object.values(run.tracks).some(track=>track.status==='pending'))return 'pending';
  return 'queued';
}

export function taskBatches(queue:QueueView,runs:readonly RunSummary[]){
  const byId=new Map(runs.map(run=>[run.runId,run]));
  const superseded=new Set(queue.batches.flatMap(batch=>batch.supersedesBatchId?[batch.supersedesBatchId]:[]));
  const active=queue.batches.find(batch=>batch.batchId===queue.activeBatchId);
  const pending=queue.batches.filter(batch=>batch!==active&&!superseded.has(batch.batchId)&&batch.runIds.some(id=>{
    const run=byId.get(id);
    return run&&!runIsComplete(run)&&canResumeRun(run)&&
      (batch.status!=='completed'||batch.runControls?.[id]?.state==='removed');
  })).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return {active,pending,runsFor:(batch:BatchView)=>batch.runIds.flatMap(id=>byId.get(id)??[])};
}
