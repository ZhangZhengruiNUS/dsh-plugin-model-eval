import {Checkbox} from '../primitives/primitives.tsx';
import {ExecutionSettings} from './ExecutionSettings.tsx';
import * as React from 'react';
import type {ParamValue,TargetSnapshot,UpgradePreview as DeepPreview,UpgradeCommit} from '../../contracts.ts';
import {ActionButton,activityUnavailable,Button,Modal,ModelLabel,type PageProps} from '../ui.tsx';
import {ConfigEditor,emptyDraft,resolveDraft,type Draft} from '../pages/NewRun.tsx';
import type {EditionUpgradePreview} from '../../evaluation/tier-contracts.ts';
import {time} from '../store.ts';
import {zh as t} from '../locales.ts';
import {PreparationNotice} from './PreparationNotice.tsx';
type Preview=DeepPreview|EditionUpgradePreview;
const reasons:Record<string,string>={UPGRADE_DETAILS_UNAVAILABLE:'来源明细已清理，无法复用此前回答。',UPGRADE_DETAILS_INCOMPLETE:'来源明细不完整，无法复用此前回答。',UPGRADE_SOURCE_CORRUPT:'来源记录无法完整校验。',UPGRADE_IDENTITY_UNVERIFIED:'无法核定路由或配置来源，不能复用此前回答。',UPGRADE_TARGET_CHANGED:'当前模型、路由或参数与来源记录不一致。',UPGRADE_SOURCE_INCOMPLETE:'请先完成轻量档通用评测。',UPGRADE_PROTOCOL_CHANGED:'共享题目或评分条件不同，不能复用。',UPGRADE_TIER_MISMATCH:'来源记录与目标深入档不匹配。',UPGRADE_CHAIN_UNSUPPORTED:'这条结果已复用过其他记录，请从原始实测记录补测，或另建完整评测。'};
const fields=['temperature','maxTokens','reasoningEffort','stop'];
function sourceParameters(target:TargetSnapshot){const values:Record<string,string>={},overrides:Record<string,ParamValue>={};for(const key of fields){const p=target.controls[key];if(p?.state==='known'){values[key]=typeof p.value==='string'?p.value:JSON.stringify(p.value);overrides[key]={state:'known',value:p.value,source:'override'};}else if(p?.state==='unset'){values[key]='';overrides[key]={state:'unset'};}}return {values,overrides};}
export function UpgradePreview({sourceRunId,onClose,onStarted,onIndependent,editionGeneralId,...props}:PageProps&{sourceRunId:string;editionGeneralId?:string;onClose():void;onStarted():void;onIndependent():void}){
  const source=props.data.runs.find(r=>r.runId===sourceRunId),edition=!!editionGeneralId,deep=props.data.protocols.find(p=>edition?p.descriptor.refs.generalId===editionGeneralId:p.descriptor.allowNewRuns&&p.descriptor.general.tier==='deep'&&p.descriptor.general.parentGeneralId===source?.protocols.generalId),ready=!!deep?.prepared&&deep.descriptor.allowNewRuns;
  const [draft,setDraft]=React.useState<Draft>(emptyDraft),[preview,setPreview]=React.useState<Preview>(),[concurrency,setConcurrency]=React.useState(4),[timeout,setTimeoutValue]=React.useState(300),[working,setWorking]=React.useState(''),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true),[now,setNow]=React.useState(Date.now);
  const [confirmed,setConfirmed]=React.useState(false);
  const usageNoticeId=React.useId();
  const alive=React.useRef(true),key=JSON.stringify({model:draft.model,fields:draft.fields,deployment:draft.deployment,concurrency,timeout,deep:deep?.descriptor.refs.generalId});
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  React.useEffect(()=>{const cancel=new AbortController();setLoading(true);if(!source){setError('来源记录不在当前目录中。');setLoading(false);return()=>cancel.abort();}
    const choice=props.data.models.find(m=>m.providerId===source.target.providerId&&m.modelId===source.target.modelId);if(!choice){setError('宿主中已找不到来源模型，请重新选择配置。');setLoading(false);return()=>cancel.abort();}
    const {values,overrides}=sourceParameters(source.target),deployment=source.target.deployment?.value??'';
    void props.api<{handle:string;target:TargetSnapshot}>('snapshot',{providerId:choice.providerId,modelId:choice.modelId,overrides,deployment},cancel.signal).then(snapshot=>{if(!cancel.signal.aborted)setDraft({...emptyDraft(),model:JSON.stringify([choice.providerId,choice.modelId]),deployment,fields:values,snapshot});}).catch(e=>{if(!cancel.signal.aborted)setError(e.message);}).finally(()=>{if(!cancel.signal.aborted)setLoading(false);});return()=>cancel.abort();
  },[sourceRunId,props.data.status.rootId,props.data.status.rootEpoch,props.api]);
  React.useEffect(()=>setPreview(undefined),[key]);
  React.useEffect(()=>{if(!preview)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[preview?.token]);
  async function inspect(){if(!source||!deep)return;setWorking('preview');setError('');try{const handle=await resolveDraft(props.api,draft),result=await props.api<Preview>(edition?'previewEditionUpgrade':'previewUpgrade',{sourceRunId,...(edition?{destinationGeneralId:deep.descriptor.refs.generalId}:{deepGeneralId:deep.descriptor.refs.generalId}),handle,execution:{concurrency,callTimeoutMs:timeout*1000}});if(alive.current){setNow(Date.now());setPreview(result);}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setWorking('');}}
  async function commit(){if(!preview?.check.eligible||working||edition&&!confirmed)return;setWorking('commit');setError('');try{const result=await props.api<UpgradeCommit>(edition?'commitEditionUpgrade':'commitUpgrade',{token:preview.token,...(edition?{confirmSameDeployment:true}:{})});if(alive.current){await props.act(async()=>result);if(alive.current)onStarted();}}catch(e){if(alive.current){setError((e as Error).message);setPreview(undefined);}}finally{if(alive.current)setWorking('');}}
  const expired=!!preview&&Date.parse(preview.expiresAt)<=now,locked=!!working||props.busy,reason=preview&&!preview.check.eligible?(reasons[(preview.check.reasonCode??'').replace(/^EDITION_/, 'UPGRADE_')]??'当前条件不能复用，请核对来源记录与模型配置。'):undefined;
  const previewUnavailable=loading?'正在读取来源配置，请稍候。':
    !source?'当前目录没有这条来源记录。':
    !draft.snapshot?'请先选择模型。':
    !deep||!deep.descriptor.allowNewRuns?'当前没有可用的补测协议。':
    !props.data.status.writable?'数据目录为只读，请在设置中切换到可写目录。':
    activityUnavailable(props.data.status,props.data.queue.activeBatchId)??
    (!ready?'请先准备补测环境。':props.busy?'正在处理当前操作，请稍候。':
     !Number.isInteger(timeout)||timeout<1||timeout>1800?'请将无输出等待上限设为 1–1800 秒。':undefined);
  const commitUnavailable=previewUnavailable??(expired?'预览已过期，请重新预览。':
    reason??(!preview?'请先预览补测范围。':edition&&!confirmed?'请先确认使用同一部署且模型参数未变。':undefined));
  return <Modal title={edition?"补测到新版":"补测为深入"} onClose={onClose} locked={locked} wide variant="new-run"><div className="me-dialog-body">
    {source&&<div className="me-upgrade-source"><ModelLabel target={source.target}/><strong>轻量 {source.tracks.general?.required}题 → {edition?'新版':'深入'} {deep?.descriptor.questionCount??'—'}题</strong></div>}
    <fieldset className="me-run-fields" disabled={locked||loading}>
      <section className="me-form-section me-model-config-section">
        <h3 className="me-form-title">{t.model}</h3>
        <div className="me-config-card">
          <ConfigEditor draft={draft} models={props.data.models} api={props.api} change={setDraft} reportError={setError} label={t.chooseModel}/>
        </div>
      </section>
      <ExecutionSettings concurrency={concurrency} timeout={timeout}
        onConcurrencyChange={setConcurrency} onTimeoutChange={setTimeoutValue}/>
    </fieldset>
    {!deep?<div className="me-inline-warning">{edition?'当前没有可补测的新版本。':'当前版本没有与此轻量记录对应的深入协议。'}</div>:!ready&&<PreparationNotice generalId={deep.descriptor.refs.generalId} api={props.api} act={props.act} disabled={locked||!!props.data.status.activeActivity} externalPreparing={props.data.status.preparing} message={edition?'新版环境尚未准备。':'深入档环境尚未准备。'}/>}
    {edition&&source&&<section className="me-form-section"><p className="me-help">来源完成于 {time(source.tracks.general?.completedAt)}；复用与新增分别计量，结果标记为分阶段完成。</p><label className="me-confirm-deployment"><Checkbox checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={locked}/>确认供应商仍提供同一部署，模型参数未变</label></section>}
    <section className="me-form-section"><div className="me-upgrade-preview-head"><h3 className="me-form-title">补测范围</h3><ActionButton hintSide="below" onClick={()=>void inspect()} disabled={!!working} unavailableReason={previewUnavailable}>{working==='preview'?'正在核对…':preview?'重新预览':'预览补测'}</ActionButton></div>
      {preview?.check.eligible?<><div className="me-upgrade-counts"><div><span>复用题目</span><strong data-testid="reuse-count">{preview.check.reusedItems}</strong></div><div><span>本次新增题目</span><strong data-testid="new-count">{preview.check.newItems}</strong></div></div><p id={usageNoticeId} className="me-help">已答错的题也计入复用。本次只补通用题，会产生模型用量。</p><p className="me-help">{expired?'预览已过期，请重新预览。':`预览有效至 ${new Date(preview.expiresAt).toLocaleTimeString('zh-CN',{hour12:false})}`}</p></>:reason?<div className="me-inline-warning">{reason}</div>:<p className="me-help">预览会核对配置与本地记录，不调用模型。</p>}
    </section>{error&&<p role="alert" className="me-inline-error">{error}</p>}
  </div><footer className="me-dialog-foot"><Button onClick={onClose} disabled={locked}>返回报告</Button>{(reason||!deep||error&&!draft.snapshot)&&<Button onClick={onIndependent} disabled={locked}>新建独立评测</Button>}<ActionButton kind="primary" icon="play" aria-describedby={preview?.check.eligible?usageNoticeId:undefined} disabled={!!working} unavailableReason={commitUnavailable} onClick={()=>void commit()}>{working==='commit'?'正在创建补测…':'开始补测'}</ActionButton></footer></Modal>;
}
