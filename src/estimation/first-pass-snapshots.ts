import type {EstimateSnapshot,FirstPassEstimateBasis} from './contracts.ts';
import type {DynamicPrediction} from './profile-dynamic.ts';
import type {ProbePreviewEvidence} from '../speed/ordinary-preview.ts';
interface Context {programHash:string;probeTraceIds:readonly string[];known:number;required:number;deferredItems:number;phase?:'first-pass'|'makeup';previousBaselineIds?:readonly string[]}
const unique=(values:readonly string[])=>[...new Set(values)].sort();
const validPoint=(remaining:unknown,total:unknown):remaining is number=>typeof remaining==='number'&&Number.isFinite(remaining)&&remaining>=0&&typeof total==='number'&&Number.isFinite(total)&&total>=remaining;
function basis(c:Context,baselineIds:readonly string[],phase:FirstPassEstimateBasis['phase']=c.phase??'first-pass'):FirstPassEstimateBasis{return {durationScope:'first-pass',phase,programHash:c.programHash,baselineIds:unique(baselineIds),probeTraceIds:unique(c.probeTraceIds),deferredItems:c.deferredItems};}
function sources(ids:readonly string[],reasons:readonly string[]){return [...ids.map(id=>'local-history:'+id),...(reasons.includes('CURRENT_CATEGORY_UPDATE')?['current']:[])];}
export function initialFirstPassSnapshot(e:ProbePreviewEvidence):EstimateSnapshot{
 const p=e.prediction,available=p.state==='available'&&validPoint(p.centerMs,p.centerMs),c={programHash:e.programHash,probeTraceIds:[e.traceId,e.prefixId],known:0,required:e.requiredItems,deferredItems:0};
 return {algorithm:'estimate-v3',asOf:p.asOf,state:available?'available':'calibrating',coverage:{known:0,required:e.requiredItems},sources:sources(p.baselineIds,p.reasons),reasons:[...p.reasons],basis:basis(c,p.baselineIds,'preview'),...(available?{referenceRemainingMs:p.centerMs,referenceTotalMs:p.centerMs}:{})};
}
export function dynamicFirstPassSnapshot(p:DynamicPrediction,c:Context):EstimateSnapshot{
 const ids=p.baselineIds.length?p.baselineIds:p.state==='completed'?c.previousBaselineIds??[]:[],validCounts=[c.known,c.required,c.deferredItems].every(n=>Number.isSafeInteger(n)&&n>=0)&&c.known<=c.required&&c.deferredItems<=c.known;
 const state:EstimateSnapshot['state']=p.state==='unavailable'?(p.reasons.includes('ACTIVE_TAIL_UNSUPPORTED')?'stalled':'calibrating'):p.state;
 const result:EstimateSnapshot={algorithm:'estimate-v3',asOf:p.asOf,state,coverage:validCounts?{known:c.known,required:c.required}:{known:0,required:0},sources:sources(ids,p.reasons),reasons:[...p.reasons],basis:basis({...c,deferredItems:validCounts?c.deferredItems:0},ids)};
 if(c.phase==='makeup'){result.reasons=unique([...result.reasons,'MAKEUP_EXCLUDED']);return result;}
 if(validCounts&&['available','paused','completed'].includes(state)&&validPoint(p.remainingMs,p.totalMs)&&!(state==='completed'&&p.remainingMs!==0)){result.referenceRemainingMs=p.remainingMs;result.referenceTotalMs=p.totalMs!;}
 else if(state==='available'||state==='completed'){result.state='calibrating';result.reasons=unique([...result.reasons,'INVALID_ESTIMATE']);}
 return result;
}
/** Sequential configurations: every run already includes its own active elapsed
 * once. Do not add batch elapsed a second time or publish a known-only subtotal.
 */
export function aggregateFirstPassSnapshots(rows:readonly EstimateSnapshot[],asOf:string):EstimateSnapshot{
 const first=rows.find(r=>r.basis)?.basis,same=!!first&&rows.length>0&&rows.every(r=>r.algorithm==='estimate-v3'&&r.basis?.durationScope==='first-pass'&&r.basis.programHash===first.programHash),phase=rows.some(r=>r.basis?.phase==='makeup')?'makeup':rows.every(r=>r.basis?.phase==='preview')?'preview':'first-pass';
 const reasons=unique(rows.flatMap(r=>r.reasons)),result:EstimateSnapshot={algorithm:'estimate-v3',asOf,state:'calibrating',coverage:{known:rows.reduce((n,r)=>n+r.coverage.known,0),required:rows.reduce((n,r)=>n+r.coverage.required,0)},sources:unique(rows.flatMap(r=>r.sources)),reasons};
 if(same)result.basis={durationScope:'first-pass',phase,programHash:first.programHash,baselineIds:unique(rows.flatMap(r=>r.basis!.baselineIds)),probeTraceIds:unique(rows.flatMap(r=>r.basis!.probeTraceIds)),deferredItems:rows.reduce((n,r)=>n+r.basis!.deferredItems,0)};
 else {result.reasons=unique([...reasons,'MIXED_DURATION_SCOPE']);return result;}
 if(phase==='makeup'){result.state=rows.every(r=>r.state==='completed')?'completed':'pending';result.reasons=unique([...reasons,'MAKEUP_EXCLUDED']);return result;}
 if(rows.some(r=>r.state==='pending')){result.state='pending';return result;}
 if(rows.some(r=>r.state==='stalled')){result.state='stalled';return result;}
 if(!rows.every(r=>['available','completed','paused'].includes(r.state)&&validPoint(r.referenceRemainingMs,r.referenceTotalMs)&&!(r.state==='completed'&&r.referenceRemainingMs!==0)))return result;
 result.state=rows.every(r=>r.state==='completed')?'completed':rows.some(r=>r.state==='paused')?'paused':'available';result.referenceRemainingMs=rows.reduce((n,r)=>n+r.referenceRemainingMs!,0);result.referenceTotalMs=rows.reduce((n,r)=>n+r.referenceTotalMs!,0);return result;
}
