import {isDeepStrictEqual} from 'node:util';
import type {JudgeSnapshot} from '../contracts.ts';
import type {AttemptRecord,ItemRecord} from '../history/store.ts';
import {hasObservedOutput} from './timeout-policy.ts';

function isItemJudgeFailure(attempt:AttemptRecord):boolean {
  if(attempt.status==='completed')return attempt.validationError?.code==='INVALID_JUDGE_RESULT'&&attempt.validationError.phase==='judge';
  const error=attempt.error;
  return attempt.status==='failed'&&error?.phase==='judge'&&error.code==='UPSTREAM_ERROR'&&
    error.status===undefined&&error.upstream?.httpStatus===undefined&&error.upstream?.codes?.length===1&&
    error.upstream.codes[0]==='PI_AI_ERROR'&&
    !!attempt.observations&&hasObservedOutput(attempt.observations,attempt.rawText);
}

/** Two consecutive terminal failures on the same immutable complete answer and judge. */
export function hasRepeatedItemJudgeFailure(item:ItemRecord|undefined,judge:JudgeSnapshot):boolean {
  if(!item?.answer?.complete||item.answer.truncated||item.grade?.kind==='scored'||!item.answerCommittedAt)return false;
  const committed=Date.parse(item.answerCommittedAt);
  if(!Number.isFinite(committed))return false;
  let count=0;
  for(let index=item.attempts.length-1;index>=0;index--){
    const attempt=item.attempts[index]!;
    if(attempt.phase!=='judge'||!attempt.endedAt||!(Date.parse(attempt.startedAt)>=committed)||
      !isDeepStrictEqual(attempt.judge,judge)||!isItemJudgeFailure(attempt))return false;
    if(++count===2)return true;
  }
  return false;
}
