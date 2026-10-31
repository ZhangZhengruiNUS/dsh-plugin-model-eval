import type {PhaseMetrics,RunMetrics,Track} from '../contracts.ts';
import type {AttemptRecord} from '../history/store.ts';
const percentile=(values:number[],p:number):number|undefined=>{if(!values.length)return undefined;const sorted=[...values].sort((a,b)=>a-b);return p===.5?(sorted[Math.floor((sorted.length-1)/2)]!+sorted[Math.ceil((sorted.length-1)/2)]!)/2:sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];};
export function summarizeMetrics(attempts:readonly AttemptRecord[],activeIntervals:RunMetrics['activeIntervals'],gradingMs:Partial<Record<Track,number>>={}):RunMetrics {
  function phase(track:Track,phase:'answer'|'judge'):PhaseMetrics {
    const records=attempts.filter(x=>x.phase===phase&&x.observations?.track===track),normal=records.filter(x=>x.status==='completed'&&!x.validationError),latency:number[]=[],ttft:number[]=[];
    let tokens=0,seconds=0;
    for(const record of normal){const o=record.observations!,elapsed=Date.parse(o.endedAt)-Date.parse(o.startedAt);if(elapsed>=0&&Number.isFinite(elapsed))latency.push(elapsed);
      if(o.firstContentAt){const first=Date.parse(o.firstContentAt)-Date.parse(o.startedAt);if(first>=0&&first<=elapsed){ttft.push(first);if(o.usage.outputTokens!==undefined&&elapsed>first){tokens+=o.usage.outputTokens;seconds+=(elapsed-first)/1000;}}}}
    const result:PhaseMetrics={calls:records.length,failures:records.filter(x=>x.status!=='completed'||x.validationError).length,usageCoverage:records.length?records.filter(x=>x.observations?.usage.available).length/records.length:0,latencySamples:latency.length,ttftSamples:ttft.length};
    if(latency.length){result.latencyMedianMs=percentile(latency,.5)!;result.latencyP95Ms=percentile(latency,.95)!;}
    if(ttft.length){result.ttftMedianMs=percentile(ttft,.5)!;result.ttftP95Ms=percentile(ttft,.95)!;}
    if(seconds>0)result.outputTokensPerSecond=tokens/seconds;
    for(const field of ['inputTokens','outputTokens','totalTokens','reasoningTokens','cacheReadTokens','cacheWriteTokens'] as const){const known=records.flatMap(x=>x.observations?.usage[field]!==undefined?[x.observations.usage[field]!]:[]);if(known.length)result[field]=known.reduce((n,x)=>n+x,0);}
    return result;
  }
  const tracks:RunMetrics['tracks']={};for(const track of ['general','writing'] as const)if(attempts.some(x=>x.observations?.track===track)||gradingMs[track]!==undefined)tracks[track]={answer:phase(track,'answer'),judge:phase(track,'judge'),gradingMs:gradingMs[track]??0};
  return {tracks,activeIntervals:structuredClone(activeIntervals),incompleteTiming:activeIntervals.some(x=>!x.endedAt)};
}
export function activeMilliseconds(metrics:RunMetrics):number {return metrics.activeIntervals.reduce((sum,x)=>sum+(x.endedAt?Math.max(0,Date.parse(x.endedAt)-Date.parse(x.startedAt)):0),0);}
