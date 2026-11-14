import uiMaterials from './primitives/materials.css';
import materialLayout from './material-layout.css';
import {useGlassInteraction} from './primitives/materials.tsx';
import uiTokens from './primitives/tokens.css';
import uiControls from './primitives/controls.css';
import uiAdapter from './primitives-adapter.css';
import {useHostAppearance} from './primitives-theme.ts';
import comparisonStyle from './comparison.css';
import evaluationBasis from './evaluation-basis.css';
import disclosure from './disclosure.css';
import workbench from './workbench.css';
import dataReadouts from './data-readout.css';
import glass from './glass.css';import surfaces from './surfaces.css';import dialogs from './dialogs.css';
import * as React from 'react';import {createClientApi,type ClientApi} from './api.ts';import {zh as t} from './locales.ts';import {activityUnavailable,Button,Icon,type ViewData,type PageProps,type LocalPreparation,Empty,ModalHostContext} from './ui.tsx';import {Compare} from './pages/Compare.tsx';import {NewRun,type BackgroundSpeedDraft} from './pages/NewRun.tsx';import {Progress} from './pages/Progress.tsx';import {History} from './pages/History.tsx';import {Settings} from './pages/Settings.tsx';import {Report} from './pages/Report.tsx';import styles from './styles.css';
import type {ComparisonMetadata} from '../comparison/contracts.ts';
import {archiveEvaluationLists,isArchivedProtocol,readProtocolArchive,saveProtocolArchive,type ProtocolArchive} from './protocol-archive.ts';
import {isCurrentGeneralRelease} from '../evaluation/current-edition.ts';
import {WorkbenchNav,type WorkbenchView} from './components/WorkbenchNav.tsx';
const currentTiers=(data:ViewData|undefined)=>data?.protocols.filter(({descriptor})=>descriptor.allowNewRuns
  && isCurrentGeneralRelease(descriptor.refs))??[];
const rootScope=(status:ViewData['status'])=>JSON.stringify([status.rootId,status.rootEpoch]);
type BackgroundRun={scope:string;draft:BackgroundSpeedDraft};
// The host can unmount its main panel when switching to a conversation.
let parkedRun:BackgroundRun|undefined;
export function App({api:provided,references}:{api?:ClientApi;references?:readonly import('./comparison/model.ts').BuiltInReference[]}){
  const uiRoot = React.useRef<HTMLDivElement>(null);
  const pageHeadingId = React.useId();
  const pageScroll = React.useRef<HTMLElement>(null);
  const appearance = useHostAppearance(uiRoot);
  useGlassInteraction(uiRoot);
  const api=React.useMemo(()=>provided??createClientApi(),[provided]),[view,setView]=React.useState<WorkbenchView>('compare'),[data,setData]=React.useState<ViewData>(),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[newRun,setNewRun]=React.useState<string>(),[report,setReport]=React.useState<{id:string;rootId:string;rootEpoch:number;openId:string;returnFocusTo:HTMLElement|null}>();const sequence=React.useRef(0),alive=React.useRef(true);
  React.useLayoutEffect(()=>{if(pageScroll.current)pageScroll.current.scrollTop=0;},[view]);
  const [background,setBackground]=React.useState(parkedRun);
  const backgroundAction=React.useRef<HTMLSpanElement>(null);
  const focusBackground=React.useRef(false);
  function rememberBackground(run:BackgroundRun|undefined){
    parkedRun=run;
    setBackground(run);
  }
  React.useEffect(()=>{
    if(focusBackground.current&&!newRun&&backgroundAction.current){
      focusBackground.current=false;
      backgroundAction.current.querySelector('button')?.focus();
    }
  },[newRun,background]);
  const comparisonCache=React.useRef<{signature:string;snapshot:ComparisonMetadata}>();
  const [preparation,setPreparation]=React.useState<{scope:string;state:LocalPreparation}>();
  const preparationRequest=React.useRef<object>();
  const readView=React.useCallback(async(showError=true)=>{const seq=++sequence.current;try{
    const [status,models,runs,queue,protocols]=await Promise.all([api<ViewData['status']>('status'),api<ViewData['models']>('catalog'),api<ViewData['runs']>('history'),api<ViewData['queue']>('queue'),api<ViewData['protocols']>('protocolCatalog')]);
    const signature=JSON.stringify([status.rootId,status.rootEpoch,runs.map(r=>[r.runId,r.revision]).sort()]);let comparison:ComparisonMetadata|undefined,comparisonError:string|undefined;
    try{comparison=comparisonCache.current?.signature===signature?comparisonCache.current.snapshot:await api<ComparisonMetadata>('comparisonMetadata');if(comparison.rootId!==status.rootId||comparison.rootEpoch!==status.rootEpoch){comparison=undefined;comparisonError='数据目录正在切换，请刷新后重试。';}}
    catch(e){comparisonError=(e as Error).message;}
    const snapshot={status,models,runs,queue,protocols,...(comparison?{comparison}:{}),...(comparisonError?{comparisonError}:{})};
    if(alive.current&&seq===sequence.current){if(comparison)comparisonCache.current={signature,snapshot:comparison};else comparisonCache.current=undefined;setData(snapshot);setError('');}
    return snapshot;
  }catch(e){if(showError&&alive.current&&seq===sequence.current)setError((e as Error).message);}},[api]);
  const refresh=React.useCallback(async()=>{await readView();},[readView]);
  React.useEffect(()=>{setReport(undefined);},[data?.status.rootId,data?.status.rootEpoch]);
  React.useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;sequence.current++;};},[refresh]);
  React.useEffect(()=>{const update=()=>{if(document.visibilityState==='visible'&&!preparationRequest.current)void refresh();};const timer=setInterval(()=>{if(data?.queue.activeBatchId||data?.status.activeActivity||data?.status.preparing)update();},1000);document.addEventListener('visibilitychange',update);window.addEventListener('online',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);};},[refresh,data?.queue.activeBatchId,data?.status.activeActivity?.id,data?.status.preparing]);
  async function act<T,>(fn:()=>Promise<T>):Promise<T|undefined>{setBusy(true);setError('');try{const result=await fn();await refresh();return result;}catch(e){setError((e as Error).message);return undefined;}finally{setBusy(false);}}
  const current=currentTiers(data),currentAvailable=current.length>0;
  const scope=data&&rootScope(data.status);
  const savedRun=background?.scope===scope?background?.draft:undefined;
  React.useEffect(()=>{
    if(scope&&background&&background.scope!==scope)rememberBackground(undefined);
  },[scope,background]);
  const speedActivity=data?.status.activeActivity?.kind==='speed-preview'?data.status.activeActivity:undefined;
  const speedInBackground=savedRun&&newRun!==scope;
  function sendToBackground(draft:BackgroundSpeedDraft){
    if(!scope)return;
    focusBackground.current=true;
    rememberBackground({scope,draft});
    setNewRun(undefined);
    void refresh();
  }
  function closeNewRun(){
    if(savedRun)rememberBackground(undefined);
    setNewRun(undefined);
  }
  const scopedPreparation=preparation&&preparation.scope===scope?preparation.state:undefined;
  const verifyOnly=scopedPreparation?.phase==='failed'&&scopedPreparation.verifyOnly;
  const localPending=scopedPreparation?.phase==='pending';
  const hostPreparing=!!data?.status.preparing||data?.status.activeActivity?.kind==='prepare';
  const otherActivity=data?.status.activeActivity&&data.status.activeActivity.kind!=='prepare';
  const canCreateRun=!!data?.status.writable&&!data.queue.activeBatchId&&!busy&&!otherActivity&&
    (currentAvailable||data.status.prepared&&!hostPreparing);
  async function prepareCurrent(retry=false){
    if(!data||!scope||!canCreateRun||preparationRequest.current||!verifyOnly&&!current.some(tier=>!tier.prepared))return;
    if(!retry&&scopedPreparation?.phase==='failed')return;
    if(hostPreparing&&!verifyOnly)return;
    const request={};
    preparationRequest.current=request;
    setPreparation({scope,state:{phase:'pending'}});
    const {rootId,rootEpoch}=data.status;
    let failure:{code?:string|undefined;reason?:string}|undefined;
    if(!verifyOnly){
      void readView(false);
      try{await api('prepare',{expectedRootId:rootId,expectedRootEpoch:rootEpoch});}
      catch(error){const {code,message}=error as Error&{code?:string};failure={code,reason:message};}
    }
    const latest=await readView(false);
    if(preparationRequest.current!==request)return;
    preparationRequest.current=undefined;
    if(!alive.current)return;
    if(latest&&rootScope(latest.status)!==scope){setPreparation(undefined);return;}
    if(!latest){
      setPreparation({scope,state:{phase:'failed',reason:failure?.reason??'暂时无法确认本地评分资源状态，请重试。',code:failure?.code,verifyOnly:true}});
      return;
    }
    if(latest.status.preparing||latest.status.activeActivity?.kind==='prepare'||currentTiers(latest).every(entry=>entry.prepared)){
      setPreparation(undefined);return;
    }
    setPreparation({scope,state:{phase:'failed',...failure}});
  }
  const rootId=data?.status.rootId;
  const [archivePreference,setArchivePreference]=React.useState<{rootId:string;value:ProtocolArchive}>();
  const hasArchivedRuns=!!data?.runs.some(run=>run.tracks.general&&isArchivedProtocol(run.protocols,'current'));
  const savedArchive=rootId&&archivePreference?.rootId===rootId?archivePreference.value:
    rootId?readProtocolArchive(rootId,currentAvailable?'current':'none'):'none';
  const protocolArchive=currentAvailable&&!hasArchivedRuns?'current':savedArchive;
  const props:PageProps|undefined=data?{
    data:view==='jobs'||view==='history'?archiveEvaluationLists(data,protocolArchive):
      localPending?{...data,status:{...data.status,preparing:true}}:data,
    api,busy,act,refresh,canCreateRun,protocolArchive,
    newRunUnavailable:canCreateRun?undefined:!data.status.writable?'数据目录为只读，请在设置中切换到可写目录。':
      activityUnavailable(data.status,data.queue.activeBatchId)??(busy?'正在处理当前操作，请稍候。':'请先到设置中准备评测环境。'),
    ...(hasArchivedRuns&&{setProtocolArchive:(value:ProtocolArchive)=>{
      try{saveProtocolArchive(data.status.rootId,value);setArchivePreference({rootId:data.status.rootId,value});}
      catch{setError('无法保存归档显示设置。');}
    }}),
    report:id=>{
      const active=uiRoot.current?.ownerDocument.activeElement;
      const returnFocusTo=report?.returnFocusTo??(active instanceof HTMLElement?active:null);
      setReport({id,openId:crypto.randomUUID(),rootId:data.status.rootId,rootEpoch:data.status.rootEpoch,returnFocusTo});
    },
    newRun:()=>{if(savedRun||canCreateRun){setNewRun(scope);if(!savedRun)void prepareCurrent();}},navigate:setView,
  }:undefined;
  return <ModalHostContext.Provider value={uiRoot}><div ref={uiRoot} className="model-eval" data-dsh-ui="" data-material="glass" data-palette="moss" data-appearance={appearance}><style>{comparisonStyle+'\n'+styles+'\n'+evaluationBasis+'\n'+glass+'\n'+surfaces+'\n'+dialogs+'\n'+uiTokens+'\n'+uiControls+'\n'+uiAdapter+'\n'+uiMaterials+'\n'+materialLayout+'\n'+disclosure+'\n'+workbench+'\n'+dataReadouts}</style><div className="me-shell">
    <WorkbenchNav view={view} hasActiveJob={Boolean(data?.queue.activeBatchId)} onNavigate={setView}/>
    <main ref={pageScroll} className="me-main" aria-labelledby={pageHeadingId}><header className="me-page-head"><h1 id={pageHeadingId}>{t[view]}</h1></header>{data&&!data.status.writable&&<div className="me-inline-warning">{t.readonly}</div>}{data?.status.preparing&&<div className="me-active-banner" role="status"><span className="me-pulse"/><span>{t.environmentCheckingHelp}</span></div>}{data?.queue.activeBatchId&&view!=='jobs'&&<div className="me-active-banner"><span className="me-pulse"/><strong>{t.active}</strong><span>{data.queue.batches.find(x=>x.batchId===data.queue.activeBatchId)?.batchId.slice(0,8)}</span><Button kind="text" onClick={()=>setView('jobs')} icon="arrow">{t.viewProgress}</Button></div>}
  {(speedActivity||speedInBackground)&&<div className="me-active-banner">
    <span role="status"><strong>{speedActivity?.state==='stopping'?'测速正在收尾':speedActivity?'测速进行中':'测速已结束'}</strong></span>
    {speedInBackground&&<span ref={backgroundAction}>
      <Button onClick={()=>setNewRun(scope)}>{speedActivity?'查看测速进度':'查看测速结果'}</Button>
    </span>}
    {speedActivity&&<Button kind="text" onClick={()=>void act(()=>api('cancelSpeedPreview',{previewId:speedActivity.id}))}
      disabled={busy||speedActivity.state==='stopping'}>停止测速</Button>}
  </div>}{data?.status.activeActivity?.kind==='coding-diagnostic'&&<div className="me-inline-warning me-actions"><span>正在本地诊断编程题</span><Button disabled={busy||data.status.activeActivity.state==='stopping'} onClick={()=>void act(()=>api('cancelCodingDiagnostic',{diagnosticId:data.status.activeActivity!.id}))}>取消诊断</Button></div>}{data?.queue.recoveryIssues?.length?<div className="me-inline-warning">{t.recoveryIssue}</div>:null}<div className="me-page-content" key={view}>{!props?<Empty title={error||t.startupLoading} body={error?'':t.startupHelp}>{error&&<Button onClick={()=>void refresh()}>{t.retry}</Button>}</Empty>:view==='compare'?<Compare {...props} references={references}/>:view==='jobs'?<Progress {...props}/>:view==='history'?<History {...props}/>:<Settings {...props} key={props.data.status.rootPath}/>}</div>
  </main></div>{error&&<div className="me-toast" role="alert"><Icon name="info"/><span>{error}</span><Button kind="icon" icon="close" aria-label={t.close} onClick={()=>setError('')}/></div>}{props&&newRun&&newRun===scope&&<NewRun {...props} preparation={scopedPreparation} onRetryPreparation={()=>void prepareCurrent(true)} onClose={closeNewRun} onBackground={sendToBackground} {...(savedRun?{saved:savedRun}:{})}/>} {props&&report&&report.rootId===data?.status.rootId&&report.rootEpoch===data?.status.rootEpoch&&<Report key={report.openId} {...props} runId={report.id} returnFocusTo={report.returnFocusTo} onClose={()=>setReport(undefined)}/>}</div></ModalHostContext.Provider>;
}
