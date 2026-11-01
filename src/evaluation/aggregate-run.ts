import {rebuildPerformance} from '../estimation/observations.ts';
import {manifestGeneralDefinition} from './definitions.ts';
import {summarizeReuse} from '../jobs/metrics.ts';
import {isDeepStrictEqual} from 'node:util';import type {GradeResult,JudgeSnapshot,Question,RunSummary} from '../contracts.ts';import type {HistoryStore,HistoryTransaction,ItemRecord,RunManifest} from '../history/store.ts';import {fingerprintTarget} from '../model/identity.ts';import {summarizeGeneral} from './aggregate.ts';import {summarizeMetrics} from '../jobs/metrics.ts';
/** Derive only from committed records. Never calls a model or regrades an answer. */
export function rebuildRunSummary(manifest:RunManifest,summary:RunSummary,items:readonly ItemRecord[]):RunSummary {
  const next=structuredClone(summary),valid=items.flatMap(x=>x.grade?[x.grade]:[]);
  if(manifest.reuseOrigin)next.reuse=summarizeReuse(items,manifest.reuseOrigin);
  for(const track of ['general','writing'] as const){const old=next.tracks[track];if(!old||old.status==='completed')continue;
    const selected=manifest.requiredItems.filter(x=>x.track===track),ids=new Set(selected.map(x=>x.id));
    if(track==='general'){
      const definition=manifestGeneralDefinition(manifest);if(!definition)continue;
      const value=summarizeGeneral(valid,definition);
      next.tracks.general={...value,status:value.status==='completed'?'completed':old.status,answered:items.filter(x=>ids.has(x.itemId)&&x.answer?.complete).length};
    }else{
      const grades=valid.filter((x):x is Extract<GradeResult,{kind:'scored';track:'writing'}>=>x.kind==='scored'&&x.track==='writing'&&ids.has(x.itemId));const complete=grades.length===selected.length;
      const measures=Object.fromEntries(['faithfulness','logic','coverage','concision','naturalness'].map(key=>[key,{required:selected.length,graded:grades.length,...(complete?{score:grades.reduce((n,x)=>n+x.dimensions[key as keyof typeof x.dimensions],0)/selected.length}:{})}]));
      next.tracks.writing={status:complete?'completed':old.status,required:selected.length,graded:grades.length,answered:items.filter(x=>ids.has(x.itemId)&&x.answer?.complete).length,measures,...(complete?{score:grades.reduce((n,x)=>n+x.score,0)/selected.length}:{})};
    }
    const value=next.tracks[track]!;if(value.status==='completed'){
      const last=items.filter(x=>ids.has(x.itemId)&&x.grade?.kind==='scored').map(x=>x.gradeCommittedAt).filter((x):x is string=>!!x).sort().at(-1);
      if(!last)throw Object.assign(new Error('SUMMARY_COMMIT_TIME_MISSING'),{code:'SUMMARY_COMMIT_TIME_MISSING'});value.completedAt=last;
    }
  }
  const allAttempts=items.flatMap(item=>{const required=manifest.requiredItems.find(x=>x.id===item.itemId)!;return item.attempts.map(a=>({...a,itemId:item.itemId,track:required.track}));});
  const previous=next.metrics,calculated=summarizeMetrics(allAttempts,previous.activeIntervals,Object.fromEntries(Object.entries(previous.tracks).map(([k,v])=>[k,v.gradingMs])));calculated.incompleteTiming=previous.incompleteTiming;next.metrics=calculated;
  if(next.performance||items.some(x=>x.gradingObservation||x.attempts.some(a=>a.performance||a.performanceKey)))next.performance=rebuildPerformance(items,next.performance);
  next.judges=[];
  function group(judge:JudgeSnapshot){const key=fingerprintTarget(judge.target)+judge.rubricId+judge.promptId;let found=next.judges.find(x=>fingerprintTarget(x.snapshot.target)+x.snapshot.rubricId+x.snapshot.promptId===key);if(!found){found={snapshot:structuredClone(judge),itemIds:[]};next.judges.push(found);}return found;}
  for(const item of items){const grade=item.grade;if(grade?.kind==='scored'&&grade.track==='writing'&&grade.assessment.method==='model')group(grade.assessment.judge).itemIds.push(item.itemId);}
  for(const attempt of allAttempts){if(!attempt.judge)continue;const found=group(attempt.judge);found.attemptedItemIds??=[];if(!found.attemptedItemIds.includes(attempt.itemId))found.attemptedItemIds.push(attempt.itemId);found.calls=(found.calls??0)+1;if(attempt.status!=='completed'||attempt.validationError)found.failedCalls=(found.failedCalls??0)+1;}
  if(Object.values(next.tracks).every(x=>x.status==='completed')&&!next.completedAt)next.completedAt=Object.values(next.tracks).map(x=>x.completedAt!).sort().at(-1)!;
  return next;
}
export async function refreshRunSummary(store:HistoryStore,tx:HistoryTransaction,runId:string):Promise<void>{
  const {summary,manifest}=await tx.getRun(runId);if(summary.details!=='available')return;
  const next=rebuildRunSummary(manifest,summary,await store.listItems(runId));if(!isDeepStrictEqual(next,summary))await tx.updateSummary(runId,summary.revision,value=>Object.assign(value,next));
}
