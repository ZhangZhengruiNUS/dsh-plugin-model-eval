import type {EstimationRunInput,StageKey,TimeRange} from './contracts.ts';
import {CONTEST_SCORING_LIMITS} from '../evaluation/contest-budget.ts';
import {stageId} from './observations.ts';

/** Heuristic planning ranges, never confidence intervals or measured stage samples. */
export function approximateStage(run:EstimationRunInput,key:StageKey,unknown:boolean):TimeRange|undefined {
 const prior=run.priorSamples.filter(s=>!(unknown&&(run.priorSources?.[stageId(s)]??run.priorSource)?.startsWith('history')));
 const completed=[...run.performance.samples,...prior].filter(s=>s.conditionKey===key.conditionKey&&s.outcome==='completed'&&Number.isFinite(s.durationMs)&&s.durationMs>=0);
 const tool=key.phase==='tool-scenario',turnId=key.datasetId+':turn';
 const bounds=[...run.performance.censoredBounds,...(run.priorBounds??[]).filter(b=>!(unknown&&(run.priorSources?.[stageId(b)]??run.priorSource)?.startsWith('history')))]
  .filter(b=>b.conditionKey===key.conditionKey&&!b.explained&&Number.isFinite(b.durationMs)&&b.durationMs>=0&&(stageId(b)===stageId(key)||tool&&b.datasetId===turnId&&b.phase==='answer'));
 const lower=Math.max(0,...bounds.map(b=>b.durationMs));
 if(key.phase==='local-grade'&&key.datasetId==='code-contests-selected'){
  if(!completed.some(s=>s.phase==='answer'&&!s.datasetId.endsWith(':turn')))return;
  return {low:lower,high:Math.max(CONTEST_SCORING_LIMITS.wallMs*1.25,lower*2)};
 }
 const pool=completed.filter(s=>tool?s.datasetId===turnId&&s.phase==='answer':s.phase===key.phase&&!s.datasetId.endsWith(':turn'));
 if(!pool.length)return;
 // Long inputs need their own evidence; short answers alone do not establish prefill cost.
 if(key.datasetId==='longbench-v2-selected'&&!lower&&!pool.some(s=>s.datasetId===key.datasetId))return;
 const durations=pool.map(s=>s.durationMs).sort((a,b)=>a-b),median=durations[Math.floor(durations.length/2)]!,slowest=durations.at(-1)!;
 if(tool)return {low:lower,high:Math.max(slowest,lower,1000)*24*2}; // nominal logical-round budget, not a hard bound
 return {low:Math.max(lower,median*.25),high:Math.max(lower*2,slowest*4,key.phase==='local-grade'?1000:run.execution.callTimeoutMs)};
}
