import type {RunSummary} from '../contracts.ts';
import type {BatchView,QueueView} from '../jobs/queue.ts';

export function runIsComplete(run:RunSummary){
  const tracks=Object.values(run.tracks);
  return tracks.length>0&&tracks.every(track=>track.status==='completed');
}

export function canResumeRun(run:RunSummary){
  return run.resumeAllowed&&run.details==='available';
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
