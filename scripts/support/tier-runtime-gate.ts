/** Developer finalization guard; this function never mutates a catalog or grants run permission. */
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
import {referenceVerdict} from './reference-verdict.ts';
type Item={id:string;status:string};
function exactIds(items:readonly Item[],ids:readonly string[]){
  const expected=new Set(ids);
  return items.length===ids.length&&expected.size===ids.length&&new Set(items.map(x=>x.id)).size===items.length&&items.every(x=>expected.has(x.id)&&x.status==='passed');
}
export function assertCompleteRuntimeGate({audit,staged,runtime,noncoding,legacy,noncodingIds}:{audit:any;staged:any;runtime:any;noncoding:any;legacy:any;noncodingIds:readonly string[]}):void{
  if(identityHash(staged)!==audit.stagingHash||runtime.stagingHash!==audit.stagingHash||identityHash(staged.limits)!==identityHash(CONTEST_SCORING_LIMITS)||identityHash(runtime.limits)!==identityHash(CONTEST_SCORING_LIMITS))throw Error('GATE_BINDING_MISMATCH');
  const codingIds=staged.questions.map((q:any)=>q.id);
  if(codingIds.length!==100||typeof runtime.endedAt!=='string'||!Number.isFinite(Date.parse(runtime.endedAt))||runtime.selectedIds!==null||runtime.counts.passed!==100||runtime.counts.failed!==0||runtime.counts.pending!==0||!exactIds(runtime.items,codingIds))throw Error('CODING_GATE_INCOMPLETE');
  for(const item of runtime.items){
    if(!Array.isArray(item.negatives)||item.availableNegativeCount!==item.negatives.length)throw Error('KNOWN_NEGATIVE_INVENTORY_MISMATCH');
    if(referenceVerdict(item.positives,item.negatives).status!=='passed')throw Error('REFERENCE_GATE_FAILED');
  }
  if(noncodingIds.length!==300||typeof noncoding.endedAt!=='string'||!Number.isFinite(Date.parse(noncoding.endedAt))||noncoding.counts.passed!==300||noncoding.counts.failed!==0||noncoding.counts.pending!==0||!exactIds(noncoding.items,noncodingIds))throw Error('NONCODING_GATE_INCOMPLETE');
  const legacyIds=Array.from({length:164},(_,i)=>'HumanEval/'+i);
  if(identityHash(legacy.limits)!==identityHash({wallMs:30000,memoryBytes:536870912,computeBudget:200000000000}))throw Error('LEGACY_BUDGET_CHANGED');
  if(legacy.status!=='passed'||!exactIds(legacy.tasks.map((x:any)=>({...x,status:x.kind})),legacyIds)||legacy.rules?.required!==541||legacy.rules?.executed!==541||legacy.rules?.technicalFailures?.length!==0)throw Error('LEGACY_GATE_INCOMPLETE');
}
