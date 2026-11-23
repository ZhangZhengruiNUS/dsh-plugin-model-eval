import {Checkbox} from './primitives/primitives.tsx';
import {RunConcurrencyInput} from './components/ConcurrencyInput.tsx';
import {batchRunStatus,runIsSettling,canResumeRun,runIsComplete} from './task-batches.ts';
import {Button as PrimitiveButton} from './primitives/primitives.tsx';
import {createPortal} from 'react-dom';
import * as React from 'react';import type {ModelChoice,RunConcurrency,RunSummary,TargetSnapshot,TechnicalError,Track} from '../contracts.ts';import {generalReleaseName} from './protocol-editions.ts';import {writingEditionName} from '../evaluation/writing-edition.ts';import type {BatchView,CreateBatchResult,QueueView,RunOperation} from '../jobs/queue.ts';import type {ClientApi} from './api.ts';import {zh as t} from './locales.ts';import {formatScore,time,generalTierLabel} from './store.ts';
export function taskFailureText(error:TechnicalError):string {
  if(error.code==='ABORTED')return t.abortedHelp;
  const cause=error.upstreamCause??(error.code==='UPSTREAM_ERROR'?'unknown':undefined);
  return cause&&Object.hasOwn(t.upstreamCauses,cause)?t.upstreamCauses[cause]:error.message;
}
export interface Status {timeAdvisorVersion?:number;codingDiagnostics?:import('../diagnostics/contracts.ts').CodingDiagnosticSettings;rootId:string;rootEpoch:number;ready:boolean;prepared:boolean;preparing:boolean;writable:boolean;rootPath:string;resourceVersion:string;generalId:string;writingId:string;packageBytes:number;activeActivity?:import('../jobs/activity.ts').ActivityView}
export interface ViewData {status:Status;models:ModelChoice[];modelsLoading?:boolean;runs:RunSummary[];protocols:import('../contracts.ts').ProtocolCatalogItem[];comparison?:import('../comparison/contracts.ts').ComparisonMetadata;comparisonError?:string|undefined;queue:QueueView&{estimates?:Record<string,import('../estimation/contracts.ts').EstimateSnapshot>;roughWork?:{batchId:string;excludesDeferredWork:boolean;estimate?:import('../estimation/rough-remaining.ts').RoughRemaining|undefined;sampling?:{ready:number;total:number}}}}
export type LocalPreparation={phase:'pending'}|{phase:'failed';code?:string|undefined;reason?:string;verifyOnly?:boolean};
export interface PageProps {data:ViewData;api:ClientApi;busy:boolean;canCreateRun:boolean;newRunUnavailable?:string|undefined;protocolArchive:import('./protocol-archive.ts').ProtocolArchive;setProtocolArchive?(value:import('./protocol-archive.ts').ProtocolArchive):void;refresh():Promise<void>;act<T>(fn:()=>Promise<T>):Promise<T|undefined>;actQueue(fn:()=>Promise<ViewData['queue']>):Promise<ViewData['queue']|undefined>;actCreateBatch(fn:()=>Promise<CreateBatchResult>):Promise<CreateBatchResult|undefined>;loadModels():Promise<void>;report(id:string):void;newRun():void;navigate(view:'compare'|'jobs'|'history'|'settings',batchId?:string):void}
const iconPaths: Record<string, string> = {
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  jobs: 'M5 4h14v17l-7-4-7 4z M9 8h6 M9 12h5',
  history: 'M3 11a9 9 0 1 1 2 7 M3 5v6h6 M12 7v5l3 2',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  play: 'm8 5 11 7-11 7z',
  pause: 'M8 5v14 M16 5v14',
  arrow: 'M5 12h14 m-5-5 5 5-5 5',
  close: 'm6 6 12 12 M18 6 6 18',
  check: 'm5 12 4 4 10-10',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  info: 'M12 11v6 M12 7h.01',
  refresh: 'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v5l3 2',
  back: 'M19 12H5m5-5-5 5 5 5',
  chevron: 'm6 9 6 6 6-6',
};

export function BrandIcon({size}: {size: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18.45 7.4 12 2.8 3.25 9.25l3.3 10.5h10.9l1.9-5.55"/>
      <path d="m12 7.15 4.55 3.85-1.6 5.35-6.55.85-1.85-6.25Z" strokeWidth="1.55"/>
      <circle cx="20.95" cy="10.5" r="1.6" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function ComparisonIcon({size}: {size: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.25 4.25v13.5a3 3 0 0 0 3 3h14.5" strokeWidth="1.4" opacity=".7"/>
      <path d="M6.7 15.8C7.8 11.2 9.1 8.8 12 7.1S17.6 5.25 20.6 5.25"/>
      <g fill="currentColor" stroke="none">
        <circle cx="6.7" cy="15.8" r="1.6"/>
        <circle cx="12" cy="7.1" r="1.6"/>
        <circle cx="20.6" cy="5.25" r="1.6"/>
      </g>
      <circle cx="14.9" cy="14.4" r="1.25" strokeWidth="1.45"/>
    </svg>
  );
}

export function Icon({name, size = 18}: {name: string; size?: number}) {
  if (name === 'compare') return <ComparisonIcon size={size}/>;
  const path = iconPaths[name];
  if (!path) return <BrandIcon size={size}/>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path}/>
    </svg>
  );
}
type ButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement>&{kind?:string;icon?:string};
export function Button({children,kind="",icon,className,...props}:ButtonProps){
  const variant = kind==="primary" ? "primary" : kind==="text" ? "quiet" : kind==="danger" ? "danger" : "secondary";
  return <PrimitiveButton {...props} variant={variant} className={["me-button",kind,className].filter(Boolean).join(" ")}
    icon={icon ? <Icon name={icon}/> : undefined}><span>{children}</span></PrimitiveButton>;
}
// Keep a blocked action in the tab order so its reason can be discovered without activating it.
export function ActionButton({unavailableReason,hintAlign='end',hintSide='above',onClick,onFocus,onKeyDown,'aria-describedby':describedBy,...props}:ButtonProps&{
  unavailableReason?:string|undefined;hintAlign?:'start'|'end';hintSide?:'above'|'below';
}){
  const hintId=React.useId(),[dismissed,setDismissed]=React.useState(false);
  const reason=props.disabled?undefined:unavailableReason;
  return <span className="me-action-anchor" data-hint-align={hintAlign} data-hint-side={hintSide} onPointerEnter={()=>{if(reason)setDismissed(false);}}>
    <Button {...props} aria-disabled={reason?true:undefined}
      aria-describedby={reason?[hintId,describedBy].filter(Boolean).join(' '):describedBy}
      onClick={event=>{if(reason){event.preventDefault();event.stopPropagation();return;}onClick?.(event);}}
      onFocus={event=>{setDismissed(false);onFocus?.(event);}}
      onKeyDown={event=>{
        if(reason&&!dismissed&&event.key==='Escape'&&(event.currentTarget.matches(':focus-visible')||event.currentTarget.parentElement?.matches(':hover'))){
          event.preventDefault();event.stopPropagation();setDismissed(true);return;
        }
        onKeyDown?.(event);
      }}/>
    {reason&&<span id={hintId} role="tooltip" className="me-action-hint" data-dismissed={dismissed||undefined}>{reason}</span>}
  </span>;
}

export function activityUnavailable(status:Pick<Status,'activeActivity'|'preparing'>,activeBatchId?:string){
  const activity=status.activeActivity;
  if(activity?.state==='faulted')return '当前本地任务状态异常，请查看任务状态。';
  if(activeBatchId||activity?.kind==='evaluation')return '有评测任务正在运行，请等当前任务结束或暂停。';
  if(status.preparing||activity?.kind==='prepare')return '正在准备评测环境，请稍候。';
  if(activity?.kind==='speed-preview')return '测速正在进行，请等测速结束或停止测速。';
  if(activity?.kind==='coding-diagnostic')return '本地诊断正在进行，请等诊断结束。';
  if(activity)return '另一项本地操作正在进行，请稍候。';
  return undefined;
}
export function Empty({title,body,children}:{title:string;body:string;children?:React.ReactNode}){return <section className="me-empty"><span className="me-empty-icon"><BrandIcon size={30}/></span><h2>{title}</h2>{body&&<p>{body}</p>}{children}</section>;}
export function Badge({status}:{status:string}){return <span className={'me-badge '+status}><span/>{t.statuses[status as keyof typeof t.statuses]??status}</span>;}
export function Score({value,large=false}:{value:number|undefined;large?:boolean}){return <span className={'me-score '+(large?'large':'')}>{formatScore(value)}</span>;}
export function reasoningEffortLabel(target:TargetSnapshot){
  const effort=target.controls.reasoningEffort;
  if(effort?.state!=='known'||typeof effort.value!=='string'||!effort.value.trim())return undefined;
  const value=effort.value;
  return /^(max|xhigh|high|medium|low|minimal|none)$/.test(value)
    ? value.charAt(0).toUpperCase()+value.slice(1)
    : value;
}

export function ModelLabel({target,nameAction,displayName=target.modelId,secondaryLabel=target.providerId,showParams=false,compact=false}:{
  target:TargetSnapshot;
  nameAction?:{label:string;onClick():void};
  displayName?:string;
  secondaryLabel?:string;
  showParams?:boolean;
  compact?:boolean;
}){
  const effort=showParams?reasoningEffortLabel(target):undefined;
  const effortId=React.useId();
  const name=nameAction
    ? <button type="button" className="me-model-report" aria-haspopup="dialog" aria-label={nameAction.label}
        aria-describedby={effort?effortId:undefined} onClick={nameAction.onClick}>{displayName}</button>
    : <strong title={target.modelId}>{displayName}</strong>;
  const source=<span>{secondaryLabel}{target.deployment&&<> · <b>{target.deployment.value}</b></>}</span>;
  return <div className={'me-model'+(compact?' me-model-compact':'')}>
    {effort?<div className="me-model-name-line">
      {name}
      <span id={effortId} className="me-reasoning-effort" title={`${t.reasoningEffort}：${effort}`}>
        <span className="dsh-sr-only">{t.reasoningEffort}：</span>{effort}
      </span>
    </div>:name}
    {compact?<div className="me-model-meta">{source}{showParams&&<Params target={target}/>}</div>:
      <>{source}{showParams&&<Params target={target}/>}</>}
  </div>;
}

function Params({target}:{target:TargetSnapshot}){
  const known=Object.entries(target.controls).flatMap(([key,param])=>
    param.state==='known'?[{key,value:param.value}]:[]);
  if(!known.length)return <div className="me-params"><span>{t.inherit}</span></div>;
  const remaining=known.filter(({key})=>key!=='reasoningEffort').slice(0,4);
  if(!remaining.length)return null;
  return <div className="me-params">{remaining.map(({key,value})=>
    <span key={key} title={`${t[key as 'temperature'|'maxTokens'|'stop']??key}: ${JSON.stringify(value)}`}>
      {key==='temperature'?'T':key==='maxTokens'?'Max':key} {typeof value==='string'?value:JSON.stringify(value)}
    </span>
  )}</div>;
}
// Keep fixed overlays outside page scroll and containment while inheriting the plugin theme.
export const ModalHostContext=React.createContext<React.RefObject<HTMLDivElement>|null>(null);
function activeIn(element:HTMLElement){
  const root=element.getRootNode();
  return root instanceof ShadowRoot?root.activeElement:element.ownerDocument.activeElement;
}
export function Modal({title,children,onClose,wide=false,locked=false,variant,returnFocusTo,closeLabel,subtitle,inactive=false,layer}:{title:string;children:React.ReactNode;onClose():void;wide?:boolean;locked?:boolean;variant?:string;returnFocusTo?:HTMLElement|null;closeLabel?:string;subtitle?:string;inactive?:boolean;layer?:'child'}){
  const ref=React.useRef<HTMLDivElement>(null),backdrop=React.useRef<HTMLDivElement>(null);
  const wasLocked=React.useRef(locked),opener=React.useRef<HTMLElement|null>(null);
  React.useLayoutEffect(()=>{
    const active=ref.current?activeIn(ref.current):null;
    opener.current=active instanceof HTMLElement?active:null;
  },[]);
  React.useLayoutEffect(()=>{if(backdrop.current)backdrop.current.inert=inactive;},[inactive]);
  React.useLayoutEffect(()=>{
    const released=wasLocked.current&&!locked;
    wasLocked.current=locked;
    const dialog=ref.current;
    if(!dialog||inactive)return;
    const active=activeIn(dialog);
    const outside=!dialog.contains(active);
    // A submit button loses focus when locking disables it.
    if(locked&&(outside||active?.matches(':disabled')))dialog.focus({preventScroll:true});
    else if(released&&(outside||active===dialog))dialog.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')?.focus();
  },[locked,inactive]);
  React.useEffect(()=>{
    if(!wasLocked.current)ref.current?.querySelector<HTMLElement>('[data-dialog-close]')?.focus({preventScroll:true});
    return ()=>{const target=returnFocusTo?.isConnected?returnFocusTo:opener.current;target?.focus({preventScroll:true});};
  },[]);
  function onKeyDown(e:React.KeyboardEvent<HTMLDivElement>){
    const dialog=ref.current;
    if(inactive||!dialog)return;
    if(e.key==='Escape'&&!locked){e.stopPropagation();onClose();}
    if(e.key!=='Tab')return;
    const nodes=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')].filter(x=>x.offsetParent!==null);
    const first=nodes[0],last=nodes.at(-1),active=activeIn(dialog);
    if(!first||active===dialog||(e.shiftKey?active===first:active===last)){
      e.preventDefault();
      (e.shiftKey?last:first)?.focus();
    }
  }
  const overlay=<div ref={backdrop} className={layer==='child'?'me-overlay me-overlay-child':'me-overlay'} aria-hidden={inactive||undefined}
    onMouseDown={e=>{if(e.target===e.currentTarget&&!locked&&!inactive)onClose();}}>
    <div ref={ref} tabIndex={-1} className={'me-dialog '+(wide?'wide':'')+(variant?' me-dialog-'+variant:'')} role="dialog" aria-modal={inactive?undefined:true} aria-label={title} onKeyDown={onKeyDown}>
      <header className="me-dialog-head">
        {subtitle?<div><h2>{title}</h2><p className="me-dialog-subtitle">{subtitle}</p></div>:<h2>{title}</h2>}
        <Button data-dialog-close onClick={onClose} disabled={locked||inactive} aria-label={closeLabel??t.close} title={closeLabel} icon="close" kind="icon"/>
      </header>
      {children}
    </div>
  </div>;
  const host=React.useContext(ModalHostContext)?.current;
  return host?createPortal(overlay,host):overlay;
}
export const trackNames:Record<Track,string>={general:t.general,writing:t.writing};
const compactRunActions:Record<RunOperation,string>={hold:'暂停',resume:'继续',remove:'移出',rejoin:'重新加入'};

export function BatchRunRow({run,index,bothTracks,report,status,controlled=false,showParams=false,selection,children}:{
  run:RunSummary;
  index:number;
  bothTracks:boolean;
  report(runId:string):void;
  status?:React.ReactNode;
  controlled?:boolean;
  showParams?:boolean;
  selection?:React.ReactNode;
  children?:React.ReactNode;
}){
  return <div className={'me-run-row me-compact-run'+(controlled?' me-controlled-run':'')} role="listitem"
    aria-label={`${t.model} ${index+1} ${run.target.modelId}`}>
    <div className="me-run-model">
      {selection}
      <ModelLabel target={run.target} showParams={showParams} compact nameAction={{
        label:t.report+' '+run.target.modelId,onClick:()=>report(run.runId),
      }}/>
    </div>
    {status&&<div className="me-run-status">{status}</div>}
    <div className={'me-track-results'+(bothTracks?' both-tracks':'')}>
      {(['general','writing'] as const).map(track=>{
        const value=run.tracks[track];
        if(!value)return null;
        const name=track==='general'
          ? generalReleaseName(run.protocols,true)??(trackNames.general+' · '+(run.generalDefinition?generalTierLabel(run):'旧版基线'))
          : writingEditionName(run.protocols.writingId)??trackNames.writing;
        const label=name.replace(/^通用能力(?:评测)?(?= · )/,'通用').replace(/^中文写作(?= )/,'写作');
        return <div key={track} data-track={track}>
          <span title={name}>{label}</span>
          {value.status==='completed'?<Score value={value.score}/>:<span className="me-mono">{value.graded} / {value.required}</span>}
        </div>;
      })}
    </div>
    {children}
  </div>;
}

export function BatchRuns({batch,runs,report,control,unavailableReason,pending,selection,setConcurrency}:{
  batch:BatchView;
  runs:RunSummary[];
  report(runId:string):void;
  control(runId:string,operation:RunOperation):void;
  unavailableReason?:string|undefined;
  pending?:{runId:string;operation:RunOperation}|undefined;
  selection?:{eligible:ReadonlySet<string>;selected:ReadonlySet<string>;toggle(id:string):void};
  setConcurrency(runId:string,value:RunConcurrency):Promise<boolean>;
}){
  const lastAction=React.useRef<{trigger:HTMLButtonElement;row:HTMLElement}>();
  const [removal,setRemoval]=React.useState<{runId:string;trigger:HTMLButtonElement;row:HTMLElement}>();
  const removalRun=removal&&runs.find(run=>run.runId===removal.runId);
  const removalUnavailable=unavailableReason??
    (removal&&runIsSettling(batch,removal.runId)?t.runControl.settling:undefined)??
    (removalRun&&(runIsComplete(removalRun)||batch.runControls?.[removalRun.runId]?.state==='removed')?t.runControl.changed:undefined);
  React.useLayoutEffect(()=>{
    const previous=lastAction.current;
    if(!previous||previous.trigger.isConnected)return;
    lastAction.current=undefined;
    const {row,trigger}=previous;
    if(row.isConnected&&(!activeIn(row)||activeIn(row)===trigger.ownerDocument.body)){
      const nextButton=row.querySelector<HTMLElement>('.me-action-anchor button:not([aria-disabled="true"])')
        ??row.querySelector('button');
      nextButton?.focus();
    }
  });
  const bothTracks=runs.some(run=>run.tracks.general)&&runs.some(run=>run.tracks.writing);
  return <><div className="me-run-list" role="list" aria-label={t.model}>
    {batch.runIds.map((id,index)=>{
      const run=runs.find(entry=>entry.runId===id);
      if(!run)return null;
      const controlState=batch.runControls?.[id];
      const complete=runIsComplete(run);
      const settling=runIsSettling(batch,id);
      let operations:RunOperation[]=[];
      if(!complete){
        if(controlState?.state==='removed')operations=['rejoin'];
        else if(controlState?.state==='held')operations=['resume','remove'];
        else operations=batch.status==='running'?['hold','remove']:['resume','remove'];
      }
      const error=controlState?.state==='held'?controlState.error:undefined;
      const editable=!complete&&controlState?.state!=='removed'&&canResumeRun(run);
      return <BatchRunRow key={id} run={run} index={index} bothTracks={bothTracks} report={report}
        controlled showParams selection={selection&&<span className="me-run-select">
          {selection.eligible.has(id)&&<Checkbox checked={selection.selected.has(id)}
            aria-label={'选择 '+run.target.modelId+(run.target.deployment?' · '+run.target.deployment.value:'')}
            onChange={()=>selection.toggle(id)}/>}
        </span>} status={<Badge status={batchRunStatus(batch,run)}/>}>
        {(operations.length>0||editable)&&<div className="me-run-actions">
          {editable&&<RunConcurrencyInput label={'题目并发数 · '+run.target.modelId}
            value={batch.runConcurrency?.[id]??batch.execution.concurrency}
            disabled={settling||!!unavailableReason} onApply={value=>setConcurrency(id,value)}/>}
          {operations.map(operation=>{
            const needsDetails=operation==='resume'||operation==='rejoin';
            const processing=pending?.runId===id&&pending.operation===operation;
            const reason=processing
              ? needsDetails&&batch.status!=='paused'&&batch.status!=='running'?'正在核对题集和已保存的进度。':'正在更新此配置的队列状态。'
              : settling?t.runControl.settling:unavailableReason
              ??(needsDetails&&!canResumeRun(run)?t.runControl.unavailable:undefined);
            const label=processing?(needsDetails?'正在恢复…':'正在更新…'):t.runControl[operation];
            return <ActionButton key={operation} kind={operation==='remove'?'text':''}
              aria-label={label}
              aria-haspopup={operation==='remove'?'dialog':undefined}
              unavailableReason={reason} onClick={event=>{
                const trigger=event.currentTarget;
                const row=trigger.closest<HTMLElement>('.me-run-row');
                if(operation==='remove'){
                  if(row)setRemoval({runId:id,trigger,row});
                  return;
                }
                if(row&&activeIn(row)===trigger)lastAction.current={trigger,row};
                control(id,operation);
              }}>
              <span className="me-run-action-long">{label}</span>
              <span className="me-run-action-short">{processing?label:compactRunActions[operation]}</span>
            </ActionButton>;
          })}
        </div>}
        {error&&<div className="me-inline-warning me-run-warning">
          <p>{t.errorPhases[error.phase]} · {taskFailureText(error)}</p>
          <code>{error.code}</code>
        </div>}
        {controlState?.state==='removed'&&!settling&&<p className="me-help me-run-preserved">{t.runControl.saved}</p>}
      </BatchRunRow>;
    })}
  </div>
  {removal&&removalRun&&<Modal title={t.runControl.remove} onClose={()=>setRemoval(undefined)} returnFocusTo={removal.trigger}>
    <div className="me-dialog-body me-run-removal-body">
      <ModelLabel target={removalRun.target} showParams/>
      <p className="me-help">{t.runControl.removeBody}</p>
    </div>
    <footer className="me-dialog-foot">
      <Button onClick={()=>setRemoval(undefined)}>{t.cancel}</Button>
      <ActionButton kind="primary" unavailableReason={removalUnavailable} onClick={()=>{
        lastAction.current=removal;
        setRemoval(undefined);
        control(removal.runId,'remove');
      }}>{t.runControl.remove}</ActionButton>
    </footer>
  </Modal>}</>;
}
export function MetaTime({value}:{value:string|undefined}){return <time dateTime={value}>{time(value)}</time>;}
