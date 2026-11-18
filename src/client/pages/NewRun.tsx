import {ExecutionSettings,concurrencyOptions} from '../components/ExecutionSettings.tsx';
import {Select} from '../primitives/Select.tsx';
import {Checkbox,Field,Radio,TextInput} from '../primitives/primitives.tsx';
import {isFiveCapabilitySchema,isLongTasksFirstSchema} from '../../evaluation/five-schema.ts';
import {generalEditionLabel,generalEditionOrder,generalReleaseName} from '../protocol-editions.ts';
import {generalEvaluationName,isCurrentGeneralRelease} from '../../evaluation/current-edition.ts';
import {CURRENT_WRITING_ID,writingEditionName} from '../../evaluation/writing-edition.ts';
import {isArchivedProtocol} from '../protocol-archive.ts';
import {Disclosure} from '../components/Disclosure.tsx';
import {EvaluationBasis,WritingEvaluationBasis} from '../components/EvaluationBasis.tsx';
import {SpeedPreview,type SpeedPayload,type SpeedPreviewSession} from '../components/SpeedPreview.tsx';
import {ModelSelect} from '../components/ModelSelect.tsx';
import {LocalPreparationNotice,PreparationNotice} from '../components/PreparationNotice.tsx';
import {DEFAULT_SPEED_SECONDS} from '../../speed/budget.ts';
import * as React from 'react';import type {ModelChoice,ParamValue,RunConcurrency,TargetSnapshot,Track} from '../../contracts.ts';import type {ClientApi} from '../api.ts';import {zh as t} from '../locales.ts';import {ActionButton,activityUnavailable,Button,Modal,type LocalPreparation,type PageProps} from '../ui.tsx';
export interface Draft {id:string;concurrency?:RunConcurrency;model:string;deployment:string;fields:Record<string,string>;snapshot?:{handle:string;target:TargetSnapshot}}
export interface BackgroundSpeedDraft {
  session:SpeedPreviewSession;
  drafts:Draft[];
  generalId:string;
  general:boolean;
  writing:boolean;
  judge:Draft;
  concurrency:number;
  timeout:number;
  parallelLimit?:string|undefined;
  speedBudget:string;
  scrollTop:number;
}
export const emptyDraft=():Draft=>({id:crypto.randomUUID(),model:'',deployment:'',fields:{}});
const fields=['temperature','maxTokens','reasoningEffort','stop'] as const;
export function ConfigEditor({draft,models,modelsLoading=false,api,change,reportError,label,defaultModelLabel}:{draft:Draft;models:ModelChoice[];modelsLoading?:boolean;api:ClientApi;change(draft:Draft):void;reportError(message:string):void;label:string;defaultModelLabel?:string|undefined}){
  const [loading,setLoading]=React.useState(false);const generation=React.useRef(0);
  async function select(model:string){if(model===draft.model&&draft.snapshot)return;reportError('');const id=++generation.current;const {snapshot:_previous,...base}=draft;change({...base,model,deployment:'',fields:{}});if(!model)return;setLoading(true);try{const [providerId,modelId]=JSON.parse(model);const snapshot=await api<{handle:string;target:TargetSnapshot}>('snapshot',{providerId,modelId});if(id===generation.current)change({...draft,model,deployment:'',fields:{},snapshot});}catch(error){reportError((error as Error).message);}finally{if(id===generation.current)setLoading(false);}}
  const edited=Object.keys(draft.fields).length;
  return <div className="me-config-editor"><ModelSelect label={label} value={draft.model} models={models} onChange={model=>void select(model)} disabled={loading||modelsLoading} placeholder={modelsLoading?'正在读取模型…':loading?t.loading:'请选择'} {...(defaultModelLabel?{defaultLabel:defaultModelLabel}:{})}/>{!modelsLoading&&!models.length&&<p className="me-help">{t.noModels}</p>}
  {draft.snapshot&&<><Field label={t.configNoteOptional} hint={t.configNoteHint}><TextInput maxLength={100} value={draft.deployment} onChange={e=>change({...draft,deployment:e.target.value})} placeholder={t.configNotePlaceholder}/></Field><Disclosure kind="settings" title={t.params} value={edited?"已调整 "+edited+" 项":"沿用宿主设置"}><p className="me-help">{t.defaults}</p><div className="me-fields">{fields.map(key=>{const p=draft.snapshot!.target.controls[key],value=draft.fields[key]??(p?.state==='known'?typeof p.value==='string'?p.value:JSON.stringify(p.value):'');return <label key={key}>{t[key]}<TextInput type={key==='temperature'||key==='maxTokens'?'number':'text'} step={key==='temperature'?'0.1':'1'} min={key==='temperature'?0:key==='maxTokens'?1:undefined} value={value} onChange={e=>change({...draft,fields:{...draft.fields,[key]:e.target.value}})} placeholder={t.inherit} aria-label={t[key]} aria-describedby={draft.id+'-'+key+'-help'}/><small id={draft.id+'-'+key+'-help'} className="me-param-help">{t.parameterHelp[key]}</small></label>;})}</div></Disclosure></>}
  </div>;
}
export async function resolveDraft(api:ClientApi,draft:Draft,signal?:AbortSignal):Promise<string>{
  signal?.throwIfAborted();
  if(!draft.model||!draft.snapshot)throw new Error(t.selectRequired);
  if(!Object.keys(draft.fields).length&&!draft.deployment)return draft.snapshot.handle;
  const overrides:Record<string,ParamValue>={};
  for(const [key,value] of Object.entries(draft.fields)){if(!value.trim()){overrides[key]={state:'unset'};continue;}let parsed:unknown=value;
    if(key==='temperature'||key==='maxTokens'){parsed=Number(value);if(!Number.isFinite(parsed))throw new Error(t.invalidNumber);}
    if(key==='stop'){try{parsed=JSON.parse(value);}catch{throw new Error(t.invalidStop);}if(!Array.isArray(parsed)||!parsed.every(x=>typeof x==='string'))throw new Error(t.invalidStop);}
    overrides[key]={state:'known',value:parsed as any,source:'override'};
  }
  const [providerId,modelId]=JSON.parse(draft.model),snapshot=await api<{handle:string}>('snapshot',{providerId,modelId,overrides,deployment:draft.deployment},signal);return snapshot.handle;
}
export function NewRun({onClose,onBackground,saved,preparation,onRetryPreparation,...props}:PageProps&{
  onClose():void;onBackground(draft:BackgroundSpeedDraft):void;saved?:BackgroundSpeedDraft;
  preparation:LocalPreparation|undefined;onRetryPreparation():void;
}){
 const tiers=props.data.protocols.filter(({descriptor})=>descriptor.allowNewRuns
   && descriptor.general.tier!=='legacy' && !isArchivedProtocol(descriptor.refs,props.protocolArchive))
   .sort((a,b)=>generalEditionOrder(b.descriptor.refs.resourceVersion)-generalEditionOrder(a.descriptor.refs.resourceVersion));
 const currentTiers=tiers.filter(p=>isCurrentGeneralRelease(p.descriptor.refs));
 const newestSchema=tiers.find(p=>isLongTasksFirstSchema(p.descriptor.general.schema))?.descriptor.general.schema;
 const primaryTiers=currentTiers.length?currentTiers:newestSchema?tiers.filter(p=>p.descriptor.general.schema===newestSchema):tiers;
 const previousTiers=tiers.filter(tier=>!primaryTiers.includes(tier));
 const defaultVersion=primaryTiers[0]?.descriptor.refs.resourceVersion;
 const defaultGeneralId=(primaryTiers.find(p=>p.descriptor.general.tier==='light'&&(currentTiers.length>0||p.descriptor.refs.resourceVersion===defaultVersion))
   ??primaryTiers[0])?.descriptor.refs.generalId??'';
 const [generalId,setGeneralId]=React.useState(saved?.generalId??defaultGeneralId);
 const selectedTier=tiers.find(p=>p.descriptor.refs.generalId===generalId);
 const tierReady=!!selectedTier?.prepared;
 const generalTitle=currentTiers.length?generalEvaluationName:
   isFiveCapabilitySchema(selectedTier?.descriptor.general.schema)?'任务综合能力':t.general;
 const writingTitle=writingEditionName(CURRENT_WRITING_ID)??t.writing;
 const tierName=(item:typeof tiers[number])=>{
   const {general,refs}=item.descriptor;
   const tier=general.tier==='light'?'轻量':'深入';
   const edition=generalEditionLabel(refs.resourceVersion);
   return generalReleaseName(refs)??(edition?tier+' · '+edition:tier);
 };
 const legacyValue=selectedTier&&previousTiers.includes(selectedTier)?tierName(selectedTier):'未选用';
 const tracksId=React.useId();
 const renderTier=(item:typeof tiers[number])=>{
   const {descriptor,prepared}=item;
   const {general,refs}=descriptor;
   const light=general.tier==='light';
   const fiveCapability=isFiveCapabilitySchema(general.schema);
   const description=fiveCapability?(light?'日常选型':'覆盖更全'):'四项能力 · 仅与同版成绩比较';
   return (
     <label className="me-tier-option" key={refs.generalId}>
       <Radio name={tracksId+'-tier'} checked={generalId===refs.generalId}
         disabled={!descriptor.allowNewRuns} onChange={()=>setGeneralId(refs.generalId)}/>
       <span>
         <strong>{tierName(item)}</strong>
         <small>{description}{!prepared?' · 尚未准备':''}</small>
       </span>
     </label>
   );
 };
 React.useEffect(()=>{if(!selectedTier)setGeneralId(defaultGeneralId);},[selectedTier,defaultGeneralId]);
 const [drafts,setDrafts]=React.useState<Draft[]>(()=>saved?.drafts??[emptyDraft()]);
 const [writing,setWriting]=React.useState(saved?.writing??false),[general,setGeneral]=React.useState(saved?.general??true);
 const [judge,setJudge]=React.useState(()=>saved?.judge??emptyDraft());
 const useEvaluationConfigAsJudge=drafts.length===1&&!judge.model;
 const judgeReady=useEvaluationConfigAsJudge?!!drafts[0]?.snapshot:!!judge.snapshot;
 const [concurrency,setConcurrency]=React.useState(saved?.concurrency??4),[timeout,setTimeoutValue]=React.useState(saved?.timeout??300);
 const [speedBudget,setSpeedBudget]=React.useState(saved?.speedBudget??String(DEFAULT_SPEED_SECONDS));
 const [error,setError]=React.useState(''),[preview,setPreview]=React.useState<{key:string;id:string}>();
 const [probing,setProbing]=React.useState(!!saved),[probeStarting,setProbeStarting]=React.useState(false),[closing,setClosing]=React.useState(false);
 const [copyOpen,setCopyOpen]=React.useState(false);
 const [pickerOpen,setPickerOpen]=React.useState(false);
 const pickerOpener=React.useRef<HTMLButtonElement|null>(null);
 const [parallelLimit,setParallelLimit]=React.useState(saved?.parallelLimit);
 const modelCount=drafts.length;
 const limitChoice=modelCount===1?'1':parallelLimit==='all'||Number(parallelLimit??2)>=modelCount?'all':parallelLimit??'2';
 const parallelModels=limitChoice==='all'?modelCount:Number(limitChoice);
 const allocations=drafts.map(draft=>modelCount===1?concurrency:draft.concurrency??concurrency);
 const customScheduling=parallelModels>1||allocations.some(value=>value!==concurrency);
 const [advisorOpen,setAdvisorOpen]=React.useState(!!saved);
 const formBody=React.useRef<HTMLDivElement>(null);
 const advisorTrigger=React.useRef<HTMLDivElement>(null);
 React.useLayoutEffect(()=>{if(saved&&formBody.current)formBody.current.scrollTop=saved.scrollTop;},[saved]);
 React.useEffect(()=>{if(saved&&!advisorOpen)advisorTrigger.current?.querySelector('button')?.focus({preventScroll:true});},[saved,advisorOpen]);
 const advisorId=React.useId(),advisorOpener=React.useRef<HTMLButtonElement|null>(null);
 const adoptPreview=React.useCallback((key:string,id:string|undefined)=>{
   setPreview(old=>id?(old?.key===key&&old.id===id?old:{key,id}):old===undefined?old:undefined);
 },[]);
 function openAdvisor(event:React.MouseEvent<HTMLButtonElement>){if(advisorUnavailable||dialogLocked)return;advisorOpener.current=event.currentTarget;setAdvisorOpen(true);}
 const copyChoicesId=React.useId();
 const copyButton=React.useRef<HTMLButtonElement|null>(null);
 const maxConfigs=20;
 const configurationName=(index:number)=>t.configItem+' '+String(index+1).padStart(2,'0');
 function appendConfig(source?:Draft) {
   const next=source?{...structuredClone(source),id:crypto.randomUUID()}:emptyDraft();
   setDrafts(current=>current.length<maxConfigs?[...current,next]:current);
   if(source&&copyOpen) copyButton.current?.focus({preventScroll:true});
   setCopyOpen(false);
 }
 function chooseCopySource(event:React.MouseEvent<HTMLButtonElement>) {
   copyButton.current=event.currentTarget;
   if(drafts.length===1) appendConfig(drafts[0]);
   else setCopyOpen(!copyOpen);
 }
 function closeCopyChoices() {
   setCopyOpen(false);
   copyButton.current?.focus({preventScroll:true});
 }
 const cancelPreview=React.useRef<()=>Promise<boolean>>(async()=>true),registerCancel=React.useCallback((fn:()=>Promise<boolean>)=>{cancelPreview.current=fn;},[]),runningChange=React.useCallback((running:boolean,starting=false)=>{setProbing(running);setProbeStarting(starting);},[]);
 const refresh=React.useCallback(()=>{void props.refresh();},[props.refresh]);
 const draftKey=JSON.stringify({rootId:props.data.status.rootId,rootEpoch:props.data.status.rootEpoch,drafts:drafts.map(d=>({model:d.model,deployment:d.deployment,fields:d.fields,target:d.snapshot?.target})),generalId,general,writing,writingId:writing?props.data.status.writingId:undefined,judge:writing?judge:undefined,concurrency,timeout});
 const writingReady=props.data.protocols.some(p=>p.descriptor.refs.generalId===props.data.status.generalId&&p.prepared&&p.descriptor.allowNewRuns);
 const currentSelected=general&&!!selectedTier&&isCurrentGeneralRelease(selectedTier.descriptor.refs);
 const hostPreparing=props.data.status.preparing||props.data.status.activeActivity?.kind==='prepare';
 const waiting=preparation?.phase==='pending'||currentSelected&&hostPreparing&&preparation?.phase!=='failed';
 const preparationNotice:LocalPreparation|undefined=waiting?{phase:'pending'}:
   currentSelected&&(!tierReady||preparation?.phase==='failed'&&preparation.verifyOnly)?
     {...(preparation?.phase==='failed'?preparation:{phase:'failed'}),code:preparation?.phase==='failed'&&preparation.code||selectedTier?.errorCode}:undefined;
 const advisorPrerequisite=drafts.some(d=>!d.model)?(drafts.length===1?'请先选择模型。':'请为每个配置选择模型。'):
   drafts.some(d=>!d.snapshot)?'模型配置尚未就绪，请检查所选模型。':
   !general&&!writing?'请至少选择一项评测内容。':
   general&&!selectedTier?'当前没有可用的通用评测协议。':
   writing&&!judgeReady?(judge.model?'裁判配置尚未就绪，请检查所选裁判。':'请先选择写作裁判。'):
   !Number.isInteger(timeout)||timeout<1||timeout>1800?'请将无输出等待上限设为 1–1800 秒。':undefined;
 const advisorReady=!advisorPrerequisite&&!customScheduling;
 const advisorUnavailable=probing?undefined:advisorPrerequisite??(customScheduling?'用时参考适用于顺序运行且题目并发数相同的配置。':undefined);
 const scope=[general&&selectedTier?(generalReleaseName(selectedTier.descriptor.refs,true)??generalTitle+' · '+tierName(selectedTier)):'',
   writing?writingTitle:''].filter(Boolean).join('　/　');
 const advisorNames=drafts.map((draft,i)=>{
   const model=draft.snapshot?.target.modelId;
   return configurationName(i)+(model?' · '+model:'');
 });
 const valid=!drafts.some(x=>!x.snapshot)&&(!writing||judgeReady)&&(general||writing)&&(general?tierReady:writingReady)&&!(currentSelected&&preparation?.phase==='failed'&&preparation.verifyOnly);
 const active=!!props.data.status.activeActivity||!!props.data.queue.activeBatchId||hostPreparing||waiting;
 const startUnavailable=advisorPrerequisite??
   (!props.data.status.writable?'数据目录为只读，请在设置中切换到可写目录。':
    probing?'测速正在进行，请等测速结束或停止测速。':
    waiting?'正在准备评测环境，请稍候。':
    activityUnavailable(props.data.status,props.data.queue.activeBatchId)??
    (preparation?.phase==='failed'&&!valid?'评测环境准备未完成，请重试准备。':
     !valid?'请先完成所选评测的环境准备。':
     props.busy?'正在处理当前操作，请稍候。':undefined));
 const retryDisabled=props.busy||!props.data.status.writable||!!props.data.queue.activeBatchId||
   (!!props.data.status.activeActivity&&props.data.status.activeActivity.kind!=='prepare')||hostPreparing&&!(preparation?.phase==='failed'&&preparation.verifyOnly);
 async function request(signal?:AbortSignal):Promise<SpeedPayload>{
   const handles=[];
   for(const draft of drafts)handles.push(await resolveDraft(props.api,draft,signal));
   const tracks=[...(general?['general']:[]),...(writing?['writing']:[])];
   if(!tracks.length)throw Error(t.selectRequired);
   const judgeHandle=writing?(useEvaluationConfigAsJudge?handles[0]:await resolveDraft(props.api,judge,signal)):undefined;
   return {generalId:general?generalId:props.data.status.generalId,handles,tracks,execution:{concurrency,callTimeoutMs:timeout*1000},...(judgeHandle?{judgeHandle}:{})};
 }
 async function close(){if(closing)return;setClosing(true);if(await cancelPreview.current())onClose();else setClosing(false);}
 const [startingEvaluation,setStartingEvaluation]=React.useState(false);
 async function start(){
   if(startUnavailable||closing||startingEvaluation)return;
   setError('');setStartingEvaluation(true);
   try{
     const result=await props.act(async()=>props.api('createBatch',{...await request(),modelConcurrency:allocations,...(parallelModels>1?{parallelModels}:{}),...(!customScheduling&&preview?.key===draftKey?{previewId:preview.id}:{})}));
     if(result){onClose();props.navigate('jobs');}
   }finally{setStartingEvaluation(false);}
 }
 const dialogLocked=props.busy||probeStarting||closing;
 async function addModels(choices:ModelChoice[]){
   const selected=await Promise.all(choices.map(async choice=>{
     const draft=emptyDraft();
     const snapshot=await props.api<NonNullable<Draft['snapshot']>>('snapshot',{providerId:choice.providerId,modelId:choice.modelId});
     return {...draft,model:JSON.stringify([choice.providerId,choice.modelId]),snapshot};
   }));
   setDrafts(current=>[...current.filter(draft=>draft.model),...selected].slice(0,maxConfigs));
   setPickerOpen(false);
 }
 return <><Modal title={t.newRun} onClose={()=>void close()} wide variant="new-run" inactive={advisorOpen||pickerOpen} locked={dialogLocked}>
 <div ref={formBody} className="me-dialog-body me-run-form">{preparationNotice&&<LocalPreparationNotice state={preparationNotice} retry={onRetryPreparation} settings={()=>{onClose();props.navigate('settings');}} disabled={retryDisabled}/>}<fieldset className="me-run-fields" disabled={probing||props.busy||closing}>
 <section className="me-form-section me-model-config-section">
   <div className="me-model-config-heading">
     <h3 className="me-form-title">{t.model}</h3>
     <Button icon="plus" aria-haspopup="dialog" onClick={event=>{pickerOpener.current=event.currentTarget;setPickerOpen(true);}}
         disabled={props.data.modelsLoading||!props.data.models.length||drafts.filter(draft=>draft.model).length>=maxConfigs}>批量选模型</Button>
   </div>
   <div className="me-config-list">
     {drafts.map((draft,index)=><section className="me-config-card" key={draft.id}>
       <header className="me-config-head">
         <h4 className="me-config-title">{configurationName(index)}</h4>
         <div>
           {drafts.length>1&&<Button kind="text" onClick={()=>{setCopyOpen(false);setDrafts(current=>current.filter(item=>item.id!==draft.id));}}>{t.remove}</Button>}
         </div>
       </header>
       <ConfigEditor draft={draft} models={props.data.models} modelsLoading={!!props.data.modelsLoading} api={props.api}
         change={value=>setDrafts(old=>old.map(x=>x.id===value.id?value:x))}
         reportError={setError} label={t.chooseModel}/>
       {modelCount>1&&<Select className="me-config-concurrency" label="题目并发数"
         value={draft.concurrency===undefined?'default':String(draft.concurrency)}
         options={[{value:'default',label:'沿用默认（'+concurrency+'）'},...concurrencyOptions]}
         onChange={value=>setDrafts(current=>current.map(item=>{
           if(item.id!==draft.id)return item;
           const {concurrency:_previous,...rest}=item;
           return value==='default'?rest:{...rest,concurrency:Number(value) as RunConcurrency};
         }))}/>}
     </section>)}
   </div>
   <div onKeyDown={event=>{
     if(event.key==='Escape'&&copyOpen){
       event.stopPropagation();
       closeCopyChoices();
     }
   }}>
     <div className="me-config-actions">
       <Button onClick={()=>appendConfig()} disabled={drafts.length>=maxConfigs}>{t.addConfig}</Button>
       <Button icon="copy" onClick={chooseCopySource} disabled={drafts.length>=maxConfigs}
         aria-expanded={drafts.length>1?copyOpen:undefined}
         aria-controls={copyOpen?copyChoicesId:undefined}>{t.duplicate}</Button>
     </div>
     {copyOpen&&<fieldset className="me-copy-choices" id={copyChoicesId}>
       <legend>选择要复制的配置</legend>
       <div className="me-copy-options">
         {drafts.map((draft,index)=>{
           const target=draft.snapshot?.target;
           const detail=[target?target.providerId+' / '+target.modelId:'未选择模型',draft.deployment].filter(Boolean).join(' · ');
           return <button type="button" className="me-copy-option" key={draft.id} onClick={()=>appendConfig(draft)}>
             <strong>{configurationName(index)}</strong>
             <span>{detail}</span>
           </button>;
         })}
       </div>
     </fieldset>}
   </div>
 </section>
 <section className="me-form-section" aria-labelledby={tracksId}>
   <h3 className="me-form-title" id={tracksId}>{t.tracks}</h3>
   <div className="me-track-list">
     <div className="me-track-panel" role="group" aria-labelledby={tracksId+'-general'} data-selected={general||undefined}>
       <label className="me-track-toggle">
         <Checkbox checked={general} onChange={event=>setGeneral(event.target.checked)}/>
         <strong id={tracksId+'-general'}>{generalTitle}</strong>
       </label>
       {general&&<div className="me-track-options">
         {selectedTier?<fieldset role="radiogroup" aria-label={`通用${t.evaluationTier}`} className="me-tier-group">
           <legend>{t.evaluationTier}</legend>
           <div className="me-tier-choices">
             {primaryTiers.map(renderTier)}
           </div>
           {previousTiers.length>0&&
             <Disclosure kind="settings" title="旧版评测协议" value={legacyValue}>
               <div role="group" aria-label="旧版评测协议" className="me-tier-choices">
                 {previousTiers.map(renderTier)}
               </div>
             </Disclosure>}
         </fieldset>:<p className="me-help">当前没有开放新建的通用评测协议。</p>}
         {selectedTier&&<EvaluationBasis definition={selectedTier.descriptor.general} questionCount={selectedTier.descriptor.questionCount}/>}
         {selectedTier&&!tierReady&&!currentSelected&&
           <PreparationNotice generalId={generalId} api={props.api} act={props.act} disabled={props.busy||active}
             externalPreparing={props.data.status.preparing} message="所选档位尚未准备。"/>}
       </div>}
     </div>
     <div className="me-track-panel" role="group" aria-labelledby={tracksId+'-writing'} data-selected={writing||undefined}>
       <label className="me-track-toggle">
         <Checkbox checked={writing} onChange={event=>setWriting(event.target.checked)}/>
         <strong id={tracksId+'-writing'}>{writingTitle}</strong>
       </label>
       {writing&&<div className="me-track-options">
         {!general&&!writingReady&&
           <PreparationNotice generalId={props.data.status.generalId} api={props.api} act={props.act} disabled={props.busy||active}
             externalPreparing={props.data.status.preparing} message="单独写作的评测环境尚未准备。"/>}
         <ConfigEditor draft={judge} models={props.data.models} modelsLoading={!!props.data.modelsLoading} api={props.api} change={setJudge} reportError={setError} label={t.judge}
           defaultModelLabel={drafts.length===1?'沿用评测配置':undefined}/>
         <p className="me-help">{drafts.length===1?'可更换裁判，报告会记录实际评分模型。':t.judgeHelp}</p>
         <WritingEvaluationBasis/>
       </div>}
     </div>
   </div>
 </section>
 <ExecutionSettings concurrency={concurrency} timeout={timeout} configurationCount={modelCount} parallelModels={limitChoice} peakCalls={[...allocations].sort((a,b)=>b-a).slice(0,parallelModels).reduce((total,value)=>total+value,0)} onParallelModelsChange={setParallelLimit}
   onConcurrencyChange={setConcurrency} onTimeoutChange={setTimeoutValue}/>
 </fieldset>
 {error&&<p role="alert" className="me-inline-error">{error}</p>}</div>
 <footer className="me-dialog-foot me-new-run-actions">
   <div ref={advisorTrigger} className="me-advisor-trigger">
     <ActionButton icon="clock" disabled={probeStarting||closing} hintAlign="start" unavailableReason={advisorUnavailable}
       onClick={openAdvisor}>{probing?'查看测速进度':'查看用时参考'}</ActionButton>
   </div>
   <div className="me-new-run-submit"><Button onClick={()=>void close()} disabled={props.busy||probeStarting||closing}>{t.cancel}</Button>
     <ActionButton kind="primary" icon="play" disabled={closing} unavailableReason={startUnavailable} onClick={()=>void start()}>{startingEvaluation?'正在启动评测…':t.start}</ActionButton></div>
 </footer></Modal>
 {pickerOpen&&<ModelPicker models={props.data.models} drafts={drafts} maximum={maxConfigs}
   returnFocusTo={pickerOpener.current} close={()=>setPickerOpen(false)} add={addModels}/>}
 <SpeedPreview id={advisorId} open={advisorOpen} scope={scope} names={advisorNames} locked={dialogLocked} returnFocusTo={advisorOpener.current} onClose={()=>setAdvisorOpen(false)}
   ready={advisorReady} prepared={general?tierReady:writingReady} canProbe={valid&&!props.busy&&!active&&!closing} hostSupportsAdvisor={props.data.status.timeAdvisorVersion===1}
   concurrency={concurrency} {...(currentSelected&&!writing&&(generalId==='general-task-five-v3-r3-light'||generalId==='general-task-five-v3-r3-deep')?{planningTier:generalId.endsWith('-deep')?'deep' as const:'light' as const}:{})}
   budget={speedBudget} onBudgetChange={setSpeedBudget}
   draftKey={draftKey} request={request} api={props.api} {...(props.data.status.activeActivity?{activity:props.data.status.activeActivity}:{})}
   {...(saved?{initialSession:saved.session}:{})}
   onBackground={session=>onBackground({session,drafts,generalId,general,writing,judge,concurrency,timeout,parallelLimit,speedBudget,scrollTop:formBody.current?.scrollTop??0})}
   onAdopt={adoptPreview} onRunningChange={runningChange}
   registerCancel={registerCancel} onRefresh={refresh}/></>;
}

function ModelPicker({models,drafts,maximum,returnFocusTo,close,add}:{
  models:ModelChoice[];drafts:Draft[];maximum:number;returnFocusTo:HTMLElement|null;
  close():void;add(models:ModelChoice[]):Promise<void>;
}){
  const [query,setQuery]=React.useState('');
  const [selected,setSelected]=React.useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const key=(model:ModelChoice)=>JSON.stringify([model.providerId,model.modelId]);
  const existing=new Set(drafts.map(draft=>draft.model).filter(Boolean));
  const available=models.filter(model=>!existing.has(key(model)));
  const capacity=maximum-drafts.filter(draft=>draft.model).length;
  const filter=query.trim().toLowerCase();
  const shown=available.filter(model=>[model.displayName,model.modelId,model.providerId].some(value=>value.toLowerCase().includes(filter)));
  async function submit(){
    if(!selected.size||busy)return;
    setBusy(true);setError('');
    try{await add(available.filter(model=>selected.has(key(model))));}
    catch(error){setError((error as Error).message);}
    finally{setBusy(false);}
  }
  return <Modal title="批量选模型" returnFocusTo={returnFocusTo} onClose={close} locked={busy}>
    <div className="me-dialog-body me-model-picker">
      <Field label="搜索模型或供应商"><TextInput type="search" value={query} onChange={event=>setQuery(event.target.value)}/></Field>
      <div className="me-model-picker-list" role="group" aria-label="可添加的模型">
        {shown.map(model=>{
          const id=key(model),checked=selected.has(id);
          return <label key={id}>
            <Checkbox checked={checked} disabled={busy||!checked&&selected.size>=capacity}
              onChange={event=>{const next=new Set(selected);if(event.target.checked)next.add(id);else next.delete(id);setSelected(next);}}/>
            <span><strong>{model.displayName}</strong><small>{model.providerId}{model.displayName!==model.modelId?' · '+model.modelId:''}</small></span>
          </label>;
        })}
        {!shown.length&&<p className="me-help">{filter?'没有匹配的模型。':'没有可添加的新模型。'}</p>}
      </div>
      {selected.size>=capacity&&<p className="me-help">每批最多 {maximum} 个配置。</p>}
      {error&&<p className="me-inline-error" role="alert">{error}</p>}
    </div>
    <footer className="me-dialog-foot">
      <Button onClick={close} disabled={busy}>{t.cancel}</Button>
      <Button kind="primary" onClick={()=>void submit()} disabled={!selected.size||busy}>
        {busy?'正在读取配置…':selected.size?'添加 '+selected.size+' 个模型':'添加模型'}
      </Button>
    </footer>
  </Modal>;
}
