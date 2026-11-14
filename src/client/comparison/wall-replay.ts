import type {RunSummary} from '../../contracts.ts';
import type {ComparisonExecution} from '../../comparison/contracts.ts';

/** Public proof metadata only. Raw answer and scoring artifacts stay private. */
export interface ContestWallReplay {
  schema:'contest-wall-replay-v1';
  sourceReferenceId:string;
  sourceEvidenceHash:string;
  rulesHash:string;
  sourceCompletedAt:string;
  carriedItems:number;
  replayedIds:string[];
  modelCalls:0;
  origin:'staged'|'complete-run';
}

export function admittedWallReplay(summary:RunSummary,execution:ComparisonExecution,proof:ContestWallReplay):boolean {
  const definition=summary.generalDefinition,track=summary.tracks.general,tier=definition?.tier;
  if(!definition||!track||(tier!=='light'&&tier!=='deep'))return false;
  const staged=tier==='light',count=staged?62:348,replayed=staged?8:70;
  const effort=summary.target.controls.reasoningEffort;
  if(proof.schema!=='contest-wall-replay-v1'||proof.modelCalls!==0||proof.origin!==(staged?'staged':'complete-run')||
    proof.sourceReferenceId!=='openai-gpt-6.1-sol-max-'+tier+'-r2-2026-11-07'||
    summary.runId!=='openai-gpt-6.1-sol-max-'+tier+'-v1-0'||
    ![proof.sourceEvidenceHash,proof.rulesHash,definition.definitionHash].every(h=>/^[a-f0-9]{64}$/.test(h))||
    !Number.isFinite(Date.parse(proof.sourceCompletedAt))||
    summary.target.scopeId!=='built-in-reference'||summary.target.providerId!=='OpenAI'||summary.target.modelId!=='gpt-6.1-sol'||
    effort?.state!=='known'||effort.value!=='max'||summary.batchId!=='built-in-reference'||
    summary.resumeAllowed||summary.details!=='cleared'||summary.regradeOrigin||summary.reuse||summary.tracks.writing||
    summary.judges.length||Object.keys(summary.metrics.tracks).length||summary.metrics.activeIntervals.length||!summary.metrics.incompleteTiming||
    execution.state!=='unknown'||execution.reason!==(staged?'mixed':undefined))return false;

  const coding=definition.domains.find(d=>d.id==='coding')?.itemIds;
  const ids=definition.domains.flatMap(d=>d.itemIds);
  if(!coding||coding.length!==replayed||ids.length!==count||new Set(ids).size!==count||
    proof.carriedItems!==count-replayed||!Array.isArray(proof.replayedIds)||proof.replayedIds.length!==replayed||
    new Set(proof.replayedIds).size!==replayed||!proof.replayedIds.every(id=>coding.includes(id))||
    track.required!==count||track.graded!==count||Object.keys(track.measures).length!==definition.domains.length)return false;

  let expected=0;
  for(const domain of definition.domains){
    const measure=track.measures[domain.id],size=domain.itemIds.length;
    const passed=measure?.passed,score=measure?.score;
    if(!measure||!size||measure.required!==size||measure.graded!==size||
      passed===undefined||!Number.isInteger(passed)||passed<0||passed>size||
      score===undefined||!Number.isFinite(score)||Math.abs(score-passed/size*100)>1e-7)return false;
    expected+=score*domain.weight;
  }
  return track.score!==undefined&&Math.abs(track.score-expected)<=1e-7;
}
