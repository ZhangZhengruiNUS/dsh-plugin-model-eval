/** Approved gate: correct witnesses, all known errors, mandatory semantic gap proofs. */
import type {CodeOutcome} from '../../src/runtime/runner.ts';
import {isAssertionCoverage} from './logic-coverage.ts';
type Positive={outcome:CodeOutcome;required?:boolean};
type Negative={outcome:CodeOutcome;logicGap?:unknown;coverageOutcome?:CodeOutcome};
export function referenceVerdict(positives:readonly Positive[],negatives:readonly Negative[]):{status:'passed'|'failed';reason?:string}{
  if(!positives.some(p=>p.outcome.kind==='passed')||positives.some(p=>p.required&&p.outcome.kind!=='passed'))return {status:'failed',reason:'CORRECT_REFERENCE_NOT_PASSED'};
  if(negatives.some(n=>n.outcome.kind!=='failed'))return {status:'failed',reason:'INCORRECT_REFERENCE_NOT_REJECTED'};
  if(negatives.some(n=>n.logicGap&&(!n.coverageOutcome||!isAssertionCoverage(n.coverageOutcome))))return {status:'failed',reason:'SEMANTIC_COUNTEREXAMPLE_NOT_REJECTED'};
  return {status:'passed'};
}
