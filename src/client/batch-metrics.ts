import type {RunMetrics} from '../contracts.ts';
export function summarizeBatchMetrics(metrics:readonly RunMetrics[],active:boolean,now:number){
  let inputTokens:number|undefined,outputTokens:number|undefined,partialUsage=false,incompleteTiming=metrics.some(x=>x.incompleteTiming);
  const intervals:[number,number][]=[];
  for(const run of metrics){
    for(const track of Object.values(run.tracks))for(const phase of [track.answer,track.judge]){
      if(!phase.calls)continue;
      if(phase.inputTokens!==undefined)inputTokens=(inputTokens??0)+phase.inputTokens;
      if(phase.outputTokens!==undefined)outputTokens=(outputTokens??0)+phase.outputTokens;
      if(phase.usageCoverage<1||phase.inputTokens===undefined||phase.outputTokens===undefined)partialUsage=true;
    }
    for(const interval of run.activeIntervals){
      if(!interval.endedAt&&!active){incompleteTiming=true;continue;}
      const start=Date.parse(interval.startedAt),end=interval.endedAt?Date.parse(interval.endedAt):now;
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<start){incompleteTiming=true;continue;}intervals.push([start,end]);
    }
  }
  intervals.sort((a,b)=>a[0]-b[0]);let elapsedMs=0,end=-Infinity;
  for(const [start,stop] of intervals){elapsedMs+=Math.max(0,stop-Math.max(start,end));end=Math.max(end,stop);}
  return {inputTokens,outputTokens,tokens:inputTokens===undefined&&outputTokens===undefined?undefined:(inputTokens??0)+(outputTokens??0),partialUsage,incompleteTiming,elapsedMs};
}
export function formatElapsed(ms:number):string {const seconds=Math.max(0,Math.floor(ms/1000));return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0')).join(':');}
