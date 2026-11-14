import type {ProtocolRefs,RunSummary,TargetSnapshot,Track} from '../contracts.ts';
import {generalWritingRef} from '../evaluation/writing-edition.ts';
export function targetKey(target:TargetSnapshot):string {
  const param=(x:any):unknown=>x?.state==='known'?{state:x.state,value:x.value}:x;
  const sorted=(x:any):any=>x&&typeof x==='object'?Array.isArray(x)?x.map(sorted):Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
  return JSON.stringify(sorted({scopeId:target.scopeId,providerId:target.providerId,modelId:target.modelId,routeTarget:param(target.routeTarget),controls:Object.fromEntries(Object.entries(target.controls).map(([k,v])=>[k,param(v)])),...(target.deployment?{deployment:target.deployment.value}:{})}));
}
export function latestCompleted(runs:readonly RunSummary[],track:Track,protocol?:string):RunSummary[] {
  const groups=new Map<string,RunSummary>();
  for(const run of runs){const value=run.tracks[track],key=targetKey(run.target)+'|'+protocolComparisonKey(run,track);
    if(value?.status!=='completed'||value.score===undefined||protocol&&run.protocols.resourceVersion!==protocol)continue;
    const old=groups.get(key);if(!old||(value.completedAt??'')>(old.tracks[track]?.completedAt??''))groups.set(key,run);
  }return [...groups.values()].sort((a,b)=>b.tracks[track]!.score!-a.tracks[track]!.score!);
}
export function protocolComparisonKey(run:RunSummary,track:Track):string{
  const p=run.protocols;if(track==='writing')return p?.writingId?writingComparisonKey(p.writingId):'unknown:'+run.runId+':'+track;
  if(!p?.generalId||!p.writingId||!p.resourceVersion)return 'unknown:'+run.runId+':'+track;
  return generalComparisonKey(p,run.generalDefinition?.definitionHash);
}
export function generalComparisonKey(refs:ProtocolRefs,definitionHash?:string):string {
  return JSON.stringify(['general',refs.generalId,generalWritingRef(refs.writingId),refs.resourceVersion,definitionHash??null]);
}
export function writingComparisonKey(writingId:string):string {
  return JSON.stringify(['writing',writingId]);
}
export const generalTierLabel=(run:RunSummary)=>run.generalDefinition?.tier==='light'?'轻量':run.generalDefinition?.tier==='deep'?'深入':'通用基线';
export function formatByteAmount(bytes: number) {
  if (bytes < 1024) return {value: String(bytes), unit: 'B'};
  if (bytes < 1024 ** 2) return {value: (bytes / 1024).toFixed(1), unit: 'KB'};
  if (bytes < 1024 ** 3) return {value: (bytes / 1024 ** 2).toFixed(1), unit: 'MB'};
  return {value: (bytes / 1024 ** 3).toFixed(2), unit: 'GB'};
}
export function formatBytes(bytes: number) {
  const {value, unit} = formatByteAmount(bytes);
  return `${value} ${unit}`;
}
export const formatScore=(score:number|undefined):string=>score===undefined?'—':score.toFixed(1);
export const time=(value:string|undefined):string=>value?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
