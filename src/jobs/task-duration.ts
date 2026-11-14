import type {PhaseMetrics,Track} from '../contracts.ts';
import type {ItemRecord,RequiredItem,AttemptRecord} from '../history/store.ts';
type Timing=NonNullable<PhaseMetrics['taskTiming']>;
type Domain={id:string;weight:number;itemIds:readonly string[]};
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function toolTaskDuration(item:ItemRecord):number|undefined{
  if(item.reuse)return valid(item.reuse.sourceToolTaskMs)?item.reuse.sourceToolTaskMs:undefined;
  if(item.toolTimingIncomplete||item.toolActiveStage||item.toolTaskTimingVersion!==1||item.toolObservation?.outcome!=='completed'||!valid(item.toolActiveMs)||!valid(item.toolLocalGradingMs)||item.toolLocalGradingMs>item.toolActiveMs)return;
  return item.toolActiveMs-item.toolLocalGradingMs;
}
function duration(item:ItemRecord,required:RequiredItem):number|undefined{
  if(!item.answer?.complete)return;
  if(required.datasetId==='bfcl-v4-multi-turn-selected')return toolTaskDuration(item);
  const attempts=(item.reuse?.sourceAttempts??item.attempts).filter(a=>a.phase==='answer').sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)||a.attemptId.localeCompare(b.attemptId));
  if(!attempts.length||new Set(attempts.map(a=>a.attemptId)).size!==attempts.length)return;
  let total=0;let previous:AttemptRecord|undefined;
  for(const a of attempts){
    if(a.status==='started')return;
    const end=Date.parse(a.endedAt??a.observations?.endedAt??''),start=Date.parse(a.observations?.startedAt??a.startedAt);
    if(!Number.isFinite(end)||!Number.isFinite(start)||end<start)return;
    const ms=a.performance?.durationMs??end-start;if(!valid(ms))return;
    total+=ms;
    // Only explicit automatic retries include the intervening backoff. Manual resume never does.
    if(a.retryIndex&&!previous)return;
    if(a.retryIndex&&previous){if(previous.status==='completed'||a.retryIndex!==(previous.retryIndex??0)+1)return;const wait=Date.parse(a.startedAt)-Date.parse(previous.endedAt??previous.observations?.endedAt??'');if(!valid(wait))return;total+=wait;}
    previous=a;
  }
  return valid(total)?total:undefined;
}
/** Full committed item records, never the truncated recent-performance window or predicted time. */
export function summarizeTaskTiming(required:readonly RequiredItem[],items:readonly ItemRecord[],domains?:readonly Domain[]):Partial<Record<Track,Timing>>{
  const result:Partial<Record<Track,Timing>>={};
  for(const track of ['general','writing'] as const){
    const selected=required.filter(q=>q.track===track);if(!selected.length)continue;
    const values=new Map<string,number>();
    for(const q of selected){const matches=items.filter(i=>i.itemId===q.id);const n=matches.length===1?duration(matches[0]!,q):undefined;if(n!==undefined)values.set(q.id,n);}
    const t:Timing={schema:'task-duration-v1',required:selected.length,measured:values.size,complete:false};result[track]=t;
    if(track==='writing'){t.complete=values.size===selected.length;if(t.complete)t.meanMs=[...values.values()].reduce((a,b)=>a+b,0)/selected.length;continue;}
    if(!domains?.length)continue;
    t.domains=domains.map(d=>{const ns=d.itemIds.flatMap(id=>values.has(id)?[values.get(id)!]:[]);return {id:d.id,weight:d.weight,required:d.itemIds.length,measured:ns.length,...(ns.length===d.itemIds.length&&ns.length?{meanMs:ns.reduce((a,b)=>a+b,0)/ns.length}:{})};});
    const ids=domains.flatMap(d=>[...d.itemIds]);
    t.complete=values.size===selected.length&&ids.length===selected.length&&new Set(ids).size===ids.length&&selected.every(q=>ids.includes(q.id))&&Math.abs(domains.reduce((a,d)=>a+d.weight,0)-1)<1e-9&&t.domains.every(d=>valid(d.weight)&&d.meanMs!==undefined);
    if(t.complete)t.meanMs=t.domains.reduce((sum,d)=>sum+d.weight*d.meanMs!,0);
  }
  return result;
}
