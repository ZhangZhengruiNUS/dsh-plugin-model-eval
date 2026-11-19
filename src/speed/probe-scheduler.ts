import {isProbeProgramId} from '../estimation/calibration-contracts.ts';
import {randomUUID} from 'node:crypto';
import {ESTIMATION_METHOD_ID,probeProgramHash} from './program-identity.ts';
import {speedClock} from './clock.ts';
import type {ProbeProgramV3,ProbeScheduleContext,ProbeRunV3,ProbeDefinitionV3,TimingEventV1} from '../estimation/calibration-contracts.ts';
import {isRunConcurrency,type Track} from '../contracts.ts';

export const probeCallLimit=(tracks:readonly Track[])=>tracks.includes('general')?12:4;
export async function scheduleProbes(program:ProbeProgramV3,ctx:ProbeScheduleContext):Promise<ProbeRunV3> {
  if(!isProbeProgramId(program.id)||program.methodId!==undefined&&(program.id!=='speed-probe-v4'||program.methodId!==ESTIMATION_METHOD_ID)||program.hash!==probeProgramHash(program)||new Set(program.probes.map(p=>p.id)).size!==program.probes.length)throw Error('PROBE_IDENTITY_CHANGED');
  if(!isRunConcurrency(ctx.concurrency)||!Number.isSafeInteger(ctx.budgetMs)||ctx.budgetMs<1000||ctx.budgetMs>(ctx.mode==='calibration'?120000:300000)||!ctx.tracks.length||new Set(ctx.tracks).size!==ctx.tracks.length||ctx.tracks.some(t=>!['general','writing'].includes(t)))throw Error('PROBE_CONTEXT_INVALID');
  const clock=ctx.clock??speedClock,start=clock.monotonicMs(),controller=new AbortController(),startedAt=clock.now(),deadline=start+ctx.budgetMs;
  const pool=program.probes.map((p,index)=>({p,index})).filter(x=>ctx.tracks.includes(x.p.track));
  const used=new Set<string>(),seen=new Set<string>(),finished=new Map<string,TimingEventV1['outcome']>(),events:TimingEventV1[]=[];
  const active=new Map<string,{p:ProbeDefinitionV3;id:string;startedAt:string;start:number;dispatchSequence:number}>();
  const limit=probeCallLimit(ctx.tracks);let calls=0,tools=0,expired=false,blocked=false,first30Events:TimingEventV1[]|undefined,first30At:string|undefined;
  const parentAbort=()=>controller.abort();ctx.signal.addEventListener('abort',parentAbort,{once:true});if(ctx.signal.aborted)parentAbort();
  const takeSnapshot=()=>{if(first30Events)return;first30At=clock.now();first30Events=structuredClone(events);for(const a of [...active.values()].sort((a,b)=>a.dispatchSequence-b.dispatchSequence))first30Events.push({eventId:a.id,sequence:first30Events.length+1,dispatchSequence:a.dispatchSequence,itemId:a.p.id,probeId:a.p.id,datasetId:a.p.datasetId,phase:a.p.phase,startedAt:a.startedAt,endedAt:first30At,durationMs:Math.max(0,clock.monotonicMs()-a.start),outcome:'censored'});};
  const cancelSnapshot=clock.schedule(Math.min(30000,ctx.budgetMs),takeSnapshot);
  const cancelDeadline=clock.schedule(ctx.budgetMs,()=>{if(controller.signal.aborted)return;expired=true;takeSnapshot();controller.abort();ctx.onBudget?.();});
  let writeTail:Promise<void>=Promise.resolve();
  function select(){
    if(controller.signal.aborted||clock.monotonicMs()>=deadline||calls>=limit||blocked)return;
    const available=pool.filter(({p})=>!used.has(p.id)&&(p.kind!=='tool'||tools<2)&&(!p.followupOf||finished.get(p.followupOf)==='completed'));
    available.sort((a,b)=>Number(seen.has(a.p.bucket))-Number(seen.has(b.p.bucket))||Number(ctx.knownBuckets?.has(a.p.bucket)??false)-Number(ctx.knownBuckets?.has(b.p.bucket)??false)||(ctx.priorityWeights?.[b.p.bucket]??0)-(ctx.priorityWeights?.[a.p.bucket]??0)||a.index-b.index);
    const next=available[0]?.p;if(!next)return;
    if(ctx.reserve&&!ctx.reserve()){blocked=true;return;}
    used.add(next.id);seen.add(next.bucket);calls++;if(next.kind==='tool')tools++;return next;
  }
  try {
    const settled=await Promise.allSettled(Array.from({length:Math.min(ctx.concurrency,pool.length,limit)},async()=>{
      for(;;){const p=select();if(!p)return;
        const a={p,id:randomUUID(),startedAt:clock.now(),start:clock.monotonicMs(),dispatchSequence:calls};active.set(a.id,a);
        let result:Awaited<ReturnType<ProbeScheduleContext['dispatch']>>;
        try{result=await ctx.dispatch(p,controller.signal);}catch{result={outcome:controller.signal.aborted?'cancelled':'failed'};}
        const event:TimingEventV1={eventId:a.id,sequence:events.length+1,dispatchSequence:a.dispatchSequence,itemId:p.id,probeId:p.id,datasetId:p.datasetId,phase:p.phase,
          startedAt:a.startedAt,endedAt:clock.now(),durationMs:Math.max(0,clock.monotonicMs()-a.start),outcome:controller.signal.aborted?(expired?'timeout':'cancelled'):result.outcome};
        if(result.usage)event.usage=structuredClone(result.usage);if(result.timing)event.timing=structuredClone(result.timing);
        active.delete(a.id);events.push(event);finished.set(p.id,event.outcome);
        if(ctx.onEvent){const work=writeTail.then(()=>ctx.onEvent!(event));writeTail=work.catch(()=>{controller.abort();});await work;}
      }
    }));
    await writeTail;const failure=settled.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
    takeSnapshot();
    return {programHash:program.hash,startedAt,endedAt:clock.now(),calls,events,status:controller.signal.aborted||blocked||calls>=limit&&used.size<pool.length?'stopped':'completed',...(expired?{budgetReached:true}:{}),first30Events:first30Events!,first30At:first30At!};
  }finally{cancelSnapshot();cancelDeadline();ctx.signal.removeEventListener('abort',parentAbort);}
}
