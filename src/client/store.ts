import type {RunSummary,TargetSnapshot,Track} from '../contracts.ts';
export function targetKey(target:TargetSnapshot):string {
  const param=(x:any):unknown=>x?.state==='known'?{state:x.state,value:x.value}:x;
  const sorted=(x:any):any=>x&&typeof x==='object'?Array.isArray(x)?x.map(sorted):Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
  return JSON.stringify(sorted({scopeId:target.scopeId,providerId:target.providerId,modelId:target.modelId,routeTarget:param(target.routeTarget),controls:Object.fromEntries(Object.entries(target.controls).map(([k,v])=>[k,param(v)])),...(target.deployment?{deployment:target.deployment.value}:{})}));
}
export function latestCompleted(runs:readonly RunSummary[],track:Track,protocol?:string):RunSummary[] {
  const groups=new Map<string,RunSummary>();
  for(const run of runs){const value=run.tracks[track],key=targetKey(run.target)+'|'+(track==='general'?run.protocols.generalId:run.protocols.writingId)+'|'+run.protocols.resourceVersion;
    if(value?.status!=='completed'||value.score===undefined||protocol&&run.protocols.resourceVersion!==protocol)continue;
    const old=groups.get(key);if(!old||(value.completedAt??'')>(old.tracks[track]?.completedAt??''))groups.set(key,run);
  }return [...groups.values()].sort((a,b)=>b.tracks[track]!.score!-a.tracks[track]!.score!);
}
export const formatBytes=(bytes:number):string=>bytes<1024?`${bytes} B`:bytes<1024**2?`${(bytes/1024).toFixed(1)} KB`:bytes<1024**3?`${(bytes/1024**2).toFixed(1)} MB`:`${(bytes/1024**3).toFixed(2)} GB`;
export const formatScore=(score:number|undefined):string=>score===undefined?'—':score.toFixed(1);
export const time=(value:string|undefined):string=>value?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
