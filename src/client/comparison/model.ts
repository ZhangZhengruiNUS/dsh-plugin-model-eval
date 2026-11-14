import {writingEditionFor,writingEditionName} from '../../evaluation/writing-edition.ts';
import {generalReleaseFor,isCurrentGeneralRelease} from '../../evaluation/current-edition.ts';
import {isFiveCapabilitySchema} from '../../evaluation/five-schema.ts';
import {linkedRegradeTaskTiming} from '../../evaluation/regrade-task-timing.ts';
import {generalEditionLabel,generalReleaseName} from '../protocol-editions.ts';
import type {GeneralDefinition,ProtocolCatalogItem,RunSummary,TargetSnapshot,Track,PhaseMetrics} from '../../contracts.ts';
import type {ComparisonExecution,ComparisonMetadata} from '../../comparison/contracts.ts';
import {targetKey,protocolComparisonKey,generalTierLabel,generalComparisonKey,writingComparisonKey} from '../store.ts';
import {admittedWallReplay,type ContestWallReplay} from './wall-replay.ts';
import {admittedNativeReference,admittedNativeWritingReference,type NativeReferenceCapture} from './native-reference.ts';
export const generalNames=['知识与推理','数学推理','指令遵循','编程解题'];
export const fiveNames=['知识与推理','资料理解','指令遵循','代码能力','工具使用'];
export const dimensionNames=(run:RunSummary|undefined,track:Track)=>track==='writing'?writingNames:isFiveCapabilitySchema(run?.generalDefinition?.schema)?fiveNames:generalNames;
export const writingNames=['忠实与准确','逻辑与结构','任务覆盖','简洁与具体','自然与得体'];
const legacy='general-chat-root-stable-rule-tokenizer-v3';
const abilityKeys=['knowledge','math','instructions','coding'];
function supportedDefinition(run:RunSummary):boolean {
  const definition=run.generalDefinition,five=isFiveCapabilitySchema(definition?.schema);
  const release=generalReleaseFor(run.protocols);
  if(release ? definition?.schema!==release.schema||definition?.tier!==release.tier
    : five&&(run.protocols.resourceVersion!==definition?.schema||run.protocols.generalId!==('general-'+definition?.schema+'-'+definition?.tier)))return false;
  const keys=five?['knowledge','reading','instructions','coding','tools']:abilityKeys,domains=definition?.domains;
  return Array.isArray(domains)&&domains.length===keys.length&&new Set(domains.map(d=>d.id)).size===keys.length&&domains.every(d=>keys.includes(d.id)&&d.weight===(five?.2:.25)&&Array.isArray(d.itemIds));
}
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
  taskMeanMs?:number|null;taskTiming?:PhaseMetrics['taskTiming'];
  taskTimingSource?:'original-answer';
  usage:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;completeness:'partial'|'unknown'};
  execution:ComparisonExecution;judgeKey:string|null;judgeLabel:string;track:Track;source:RunSummary;
  reference?:string;
  referenceBatchActiveMs?:number;
  referenceEdition?:import('../../comparison/reference-evidence.ts').ReferenceItemEvidence['edition'];
  wallReplay?:ContestWallReplay;
}
export interface ComparisonGroup {
  key:string;label:string;known:boolean;rows:ComparisonRow[];
  definition?:GeneralDefinition;questionCount?:number;
}

/** A released scope can exist before any local result has been completed. */
export function currentComparisonGroups(protocols:readonly ProtocolCatalogItem[],writingId:string,track:Track):ComparisonGroup[] {
  if(track==='writing'){
    const edition=writingEditionFor(writingId);
    return edition?.current&&edition.version?[{key:writingComparisonKey(edition.id),label:edition.version,known:true,rows:[],questionCount:edition.questionCount}]:[];
  }
  return protocols.flatMap(({descriptor})=>{
    const {refs,general,allowNewRuns,questionCount}=descriptor;
    const label=generalReleaseName(refs);
    if(!allowNewRuns||!label||!isCurrentGeneralRelease(refs))return [];
    return [{key:generalComparisonKey(refs,general.definitionHash),label,known:true,rows:[],definition:general,questionCount}];
  }).sort((a,b)=>Number(a.definition.tier==='deep')-Number(b.definition.tier==='deep'));
}

function comparisonLabel(run:RunSummary,track:Track,known:boolean):string {
  const {protocols, generalDefinition:definition}=run;
  if(track==='writing')return writingEditionName(protocols?.writingId,false)??(protocols?.writingId||'未知协议');
  if(!known)return '未知协议 · '+(protocols?.generalId??run.runId);
  const release=generalReleaseName(protocols);
  if(release)return release;
  const tier=generalTierLabel(run),schema=definition?.schema;
  if(isFiveCapabilitySchema(schema)){
    const version=schema==='task-five-v3-r2'?'评分修订2':schema==='task-five-v3-r1'?'评分修订':'第'+schema.slice(-1)+'版';
    return tier+' · '+version;
  }
  const edition=definition?.tier!=='legacy'&&definition?generalEditionLabel(protocols.resourceVersion):undefined;
  return edition?tier+' · '+edition:tier;
}
export interface BuiltInReference {summary:RunSummary;execution:ComparisonExecution;channel:string;edition?:import('../../comparison/reference-evidence.ts').ReferenceItemEvidence['edition'];wallReplay?:ContestWallReplay;nativeRun?:NativeReferenceCapture;batchActiveMs?:number}
function displayReferenceChannel(channel:string):string{
  // Older presets put the reasoning setting and production notes in the channel.
  const [service,setting]=channel.split(' · ');
  return service==='ChatGPT 订阅'&&setting==='Max'?service:channel;
}
function admittedReference({summary:r,execution,edition,wallReplay,nativeRun}:BuiltInReference,track:Track):boolean{
  if(track==='writing')return !!nativeRun&&!edition&&!wallReplay&&admittedNativeWritingReference(r,execution,nativeRun);
  if(!supportedDefinition(r)||r.tracks.general?.status!=='completed'||finite(r.tracks.general.score,100)===null)return false;
  if(nativeRun)return !edition&&!wallReplay&&admittedNativeReference(r,execution,nativeRun);
  if(wallReplay)return !edition&&r.protocols.resourceVersion==='task-five-v3-r3'&&admittedWallReplay(r,execution,wallReplay);
  let count:number;
  switch(r.protocols.generalId){
    case 'general-task-five-v2-light':count=64;break;
    case 'general-task-five-v3-light':if(!edition)return false;count=64;break;
    case 'general-task-five-v3-r1-light':if(!r.regradeOrigin)return false;count=62;break;
    case 'general-task-five-v3-r1-deep':if(r.regradeOrigin||edition)return false;count=348;break;
    case 'general-task-five-v3-r2-light':
    case 'general-task-five-v3-r2-deep':{
      const tier=r.generalDefinition?.tier,origin=r.regradeOrigin,correction=origin?.scoringCorrection;
      count=tier==='light'?62:tier==='deep'?348:0;
      if(!count||edition||!origin||!correction||origin.modelCalls!==0||origin.gradedItems!==count||origin.sourceProtocols.resourceVersion!=='task-five-v3-r1'||
        origin.sourceProtocols.generalId!=='general-task-five-v3-r1-'+tier||origin.sourceProtocols.writingId!==r.protocols.writingId||
        correction.schema!=='tool-answer-correction-v1'||correction.carriedItems!==count-1||correction.changedItems.length!==1||correction.changedItems[0]!=='tools/multi_turn_base_39')return false;
      break;
    }
    default:return false;
  }
  return r.tracks.general.required===count&&r.tracks.general.graded===count&&r.generalDefinition?.domains.reduce((n,d)=>n+d.itemIds.length,0)===count;
}
export function buildComparison(metadata:ComparisonMetadata,track:Track,references:readonly BuiltInReference[]=[]):ComparisonGroup[]{
  const groups=new Map<string,ComparisonGroup>(),latest=new Map<string,RunSummary>();
  for(const r of metadata.summaries){const t=r.tracks[track];if(t?.status!=='completed')continue;const key=scopeKeyFor(r,track)+'|'+targetKey(r.target),old=latest.get(key);
    if(!old||((t.completedAt??'')+'|'+r.runId)>((old.tracks[track]?.completedAt??'')+'|'+old.runId))latest.set(key,r);}
  const admitted=references.filter(reference=>admittedReference(reference,track));
  for(const {summary:r,reference} of [...Array.from(latest.values(),summary=>({summary,reference:undefined})),...admitted.map(reference=>({summary:reference.summary,reference}))]){
    const key=scopeKeyFor(r,track),known=track==='writing'?!!writingEditionFor(r.protocols?.writingId):r.generalDefinition?supportedDefinition(r):r.protocols?.generalId===legacy;
    let group=groups.get(key);
    if(!group){
      group={key,label:comparisonLabel(r,track,known),known,rows:[],questionCount:r.tracks[track]!.required,
        ...(track==='general'&&r.generalDefinition?{definition:r.generalDefinition}:{})};
      groups.set(key,group);
    }
    const metric=r.metrics.tracks[track]?.answer,keys=track==='writing'?['faithfulness','logic','coverage','concision','naturalness']:isFiveCapabilitySchema(r.generalDefinition?.schema)?['knowledge','reading','instructions','coding','tools']:r.generalDefinition&&r.generalDefinition.tier!=='legacy'?['knowledge','math','instructions','coding']:['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'];
    const condition=metadata.runs.find(x=>x.runId===r.runId&&x.revision===r.revision),judges=r.judges.filter(j=>j.itemIds.length>0),inherited=track==='general'?linkedRegradeTaskTiming(r):undefined,timing=inherited??metric?.taskTiming;
    const timingAllowed=!!inherited||!r.regradeOrigin&&!reference?.edition;
    const taskMeanMs=timingAllowed&&!r.reuse?.mixedPeriod&&timing?.schema==='task-duration-v1'&&timing.complete===true&&Number.isInteger(timing.required)&&timing.required>0&&timing.measured===timing.required?finite(timing.meanMs):null;
    const judgeLabel=track==='writing'&&reference?.nativeRun?'GPT-6 Astra Max（同模型评分）':judges.length
      ?judges.map(j=>`${j.snapshot.target.providerId} / ${j.snapshot.target.modelId} · ${j.itemIds.length}题`).join('；')
      :'裁判条件未记录';
    group.rows.push({protocolKnown:known,configKey:reference?'reference:'+r.runId:targetKey(r.target),runId:r.runId,target:r.target,completedAt:r.tracks[track]?.completedAt??null,score:finite(r.tracks[track]?.score,100),dimensions:keys.map(k=>known?finite(r.tracks[track]?.measures[k]?.score,track==='writing'?4:100):null),
      latencyMs:finite(metric?.latencyMedianMs),latencyP95Ms:finite(metric?.latencyP95Ms),ttftMs:finite(metric?.ttftMedianMs),latencySamples:finite(metric?.latencySamples),ttftSamples:finite(metric?.ttftSamples),
      taskMeanMs,...(timingAllowed&&timing?.schema==='task-duration-v1'?{taskTiming:timing}:{}),...(inherited?{taskTimingSource:'original-answer' as const}:{}),...(reference?.edition?{referenceEdition:reference.edition}:{}),...(reference?.wallReplay?{wallReplay:reference.wallReplay}:{}),
      usage:{inputTokens:finite(metric?.inputTokens),outputTokens:finite(metric?.outputTokens),totalTokens:finite(metric?.totalTokens),completeness:metric&&metric.usageCoverage<1?'partial':'unknown'},execution:reference?.execution??condition?.execution??{state:'unknown'},judgeKey:judgeIdentity(r),judgeLabel,track,source:r,...(reference?{reference:displayReferenceChannel(reference.channel),...(reference.batchActiveMs===undefined?{}:{referenceBatchActiveMs:reference.batchActiveMs})}:{})});
  }
  for(const g of groups.values())g.rows.sort((a,b)=>(b.score??-1)-(a.score??-1)||a.configKey.localeCompare(b.configKey));
  return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
export function selectHistory(runs:readonly RunSummary[],target:TargetSnapshot,scopeKey:string,track:Track):RunSummary[]{return runs.filter(r=>!r.regradeOrigin&&!r.reuse?.mixedPeriod&&targetKey(r.target)===targetKey(target)&&scopeKeyFor(r,track)===scopeKey&&r.tracks[track]?.status==='completed').sort((a,b)=>(a.tracks[track]?.completedAt??'').localeCompare(b.tracks[track]?.completedAt??'')||a.runId.localeCompare(b.runId));}
export function modelDisplayName({reference,target}: ComparisonRow): string {
  if (reference && target.providerId === 'OpenAI' && target.modelId === 'gpt-6-astra') {
    return 'GPT-6 Astra';
  }
  return target.modelId;
}
export const modelName=(r:ComparisonRow)=>modelDisplayName(r)+(r.target.deployment?.value?' · '+r.target.deployment.value:'');
export const rowSourceLabel=(r:ComparisonRow)=>r.reference??r.target.providerId;
export const rowName=(r:ComparisonRow)=>rowSourceLabel(r)+' / '+modelName(r);
