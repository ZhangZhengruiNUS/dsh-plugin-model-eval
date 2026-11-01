import type {RunSummary,TargetSnapshot,Track} from '../../contracts.ts';
import type {ComparisonExecution,ComparisonMetadata} from '../../comparison/contracts.ts';
import {targetKey,protocolComparisonKey,generalTierLabel} from '../store.ts';
export const generalNames=['知识与推理','数学推理','指令遵循','编程解题'];
export const writingNames=['忠实与准确','逻辑与结构','任务覆盖','简洁与具体','自然与得体'];
const legacy='general-chat-root-stable-rule-tokenizer-v3';
const abilityKeys=['knowledge','math','instructions','coding'];
function supportedDefinition(run:RunSummary):boolean{const domains=run.generalDefinition?.domains;return Array.isArray(domains)&&domains.length===4&&new Set(domains.map(d=>d.id)).size===4&&domains.every(d=>abilityKeys.includes(d.id)&&d.weight===.25&&Array.isArray(d.itemIds));}
export function stable(value:unknown):string{return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export function scopeKeyFor(run:RunSummary,track:Track):string{
  return protocolComparisonKey(run,track);
}
const finite=(v:unknown,max=Infinity):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null;
export function judgeIdentity(run:RunSummary):string|null{
  const active=run.judges.filter(j=>j.itemIds.length>0);
  const keys=[...new Set(active.map(j=>stable({target:targetKey(j.snapshot.target),rubricId:j.snapshot.rubricId,promptId:j.snapshot.promptId})))];
  return keys.length===1&&active.every(j=>j.snapshot.rubricId&&j.snapshot.promptId)?keys[0]!:null;
}
export interface ComparisonRow {
  protocolKnown:boolean;configKey:string;runId:string;target:TargetSnapshot;completedAt:string|null;score:number|null;dimensions:(number|null)[];
  latencyMs:number|null;latencyP95Ms:number|null;ttftMs:number|null;latencySamples:number|null;ttftSamples:number|null;
  usage:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;completeness:'partial'|'unknown'};
  execution:ComparisonExecution;judgeKey:string|null;judgeLabel:string;track:Track;source:RunSummary;
}
export interface ComparisonGroup {key:string;label:string;known:boolean;rows:ComparisonRow[]}
export function buildComparison(metadata:ComparisonMetadata,track:Track):ComparisonGroup[]{
  const groups=new Map<string,ComparisonGroup>(),latest=new Map<string,RunSummary>();
  for(const r of metadata.summaries){const t=r.tracks[track];if(t?.status!=='completed')continue;const key=scopeKeyFor(r,track)+'|'+targetKey(r.target),old=latest.get(key);
    if(!old||((t.completedAt??'')+'|'+r.runId)>((old.tracks[track]?.completedAt??'')+'|'+old.runId))latest.set(key,r);}
  for(const r of latest.values()){
    const key=scopeKeyFor(r,track),known=track==='writing'?r.protocols?.writingId==='work-writing-12-v1':r.generalDefinition?supportedDefinition(r):r.protocols?.generalId===legacy;
    let group=groups.get(key);if(!group){group={key,label:track==='writing'?`中文写作 · ${r.protocols?.writingId??'未知协议'}`:r.generalDefinition&&known?`${generalTierLabel(r)} · ${r.tracks.general!.required}题`:r.protocols?.generalId===legacy&&!r.generalDefinition?'通用基线 · 905题':`未知协议 · ${r.protocols?.generalId??r.runId}`,known,rows:[]};groups.set(key,group);}
    const metric=r.metrics.tracks[track]?.answer,keys=track==='writing'?['faithfulness','logic','coverage','concision','naturalness']:r.generalDefinition?['knowledge','math','instructions','coding']:['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'];
    const condition=metadata.runs.find(x=>x.runId===r.runId&&x.revision===r.revision),judges=r.judges.filter(j=>j.itemIds.length>0);
    group.rows.push({protocolKnown:known,configKey:targetKey(r.target),runId:r.runId,target:r.target,completedAt:r.tracks[track]?.completedAt??null,score:finite(r.tracks[track]?.score,100),dimensions:keys.map(k=>known?finite(r.tracks[track]?.measures[k]?.score,track==='writing'?4:100):null),
      latencyMs:finite(metric?.latencyMedianMs),latencyP95Ms:finite(metric?.latencyP95Ms),ttftMs:finite(metric?.ttftMedianMs),latencySamples:finite(metric?.latencySamples),ttftSamples:finite(metric?.ttftSamples),
      usage:{inputTokens:finite(metric?.inputTokens),outputTokens:finite(metric?.outputTokens),totalTokens:finite(metric?.totalTokens),completeness:metric&&metric.usageCoverage<1?'partial':'unknown'},execution:condition?.execution??{state:'unknown'},judgeKey:judgeIdentity(r),judgeLabel:judges.length?judges.map(j=>`${j.snapshot.target.providerId} / ${j.snapshot.target.modelId} · ${j.itemIds.length}题`).join('；'):'裁判条件未记录',track,source:r});
  }
  for(const g of groups.values())g.rows.sort((a,b)=>(b.score??-1)-(a.score??-1)||a.configKey.localeCompare(b.configKey));
  return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
export function selectHistory(runs:readonly RunSummary[],target:TargetSnapshot,scopeKey:string,track:Track):RunSummary[]{return runs.filter(r=>targetKey(r.target)===targetKey(target)&&scopeKeyFor(r,track)===scopeKey&&r.tracks[track]?.status==='completed').sort((a,b)=>(a.tracks[track]?.completedAt??'').localeCompare(b.tracks[track]?.completedAt??'')||a.runId.localeCompare(b.runId));}
export const modelName=(r:ComparisonRow)=>r.target.modelId+(r.target.deployment?.value?' · '+r.target.deployment.value:'');
export const rowName=(r:ComparisonRow)=>r.target.providerId+' / '+modelName(r);
