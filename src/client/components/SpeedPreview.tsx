import * as React from 'react';
import type {ClientApi} from '../api.ts';
import type {ActivityView} from '../../jobs/activity.ts';
import type {EstimateSnapshot,SpeedSession,TimeAdvisorResult} from '../../estimation/contracts.ts';
import {formatReference,speedUsage} from '../estimation-view.ts';
import {formatPlanningTime,tierOutputTokens,tierTimeReference,type PlanningTier} from '../tier-time-reference.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {zh as t} from '../locales.ts';
import {Button,Icon,Modal} from '../ui.tsx';
import {Disclosure} from './Disclosure.tsx';
import {Field,TextInput} from '../primitives/primitives.tsx';
import {MIN_SPEED_SECONDS,MAX_SPEED_SECONDS,validSpeedSeconds} from '../../speed/budget.ts';

export interface SpeedPayload {
  generalId?:string; handles:string[]; tracks:string[];
  execution:{concurrency:number;callTimeoutMs:number}; judgeHandle?:string;
}
type Offer=NonNullable<TimeAdvisorResult['offer']>;
type Check={key:string;seconds:number;payload:SpeedPayload;result:TimeAdvisorResult};
type ReadIssue={key:string;kind:'draft'|'host-version'|'read'|'timeout'};
export type SpeedPreviewSession={id:string;key:string;intent:Offer['intent']};
interface Props {
  id:string; open:boolean; locked:boolean; returnFocusTo:HTMLElement|null; onClose:()=>void; scope:string; names:string[]; ready:boolean; prepared:boolean; canProbe:boolean;
  planningTier?:PlanningTier; concurrency:number;
  budget:string; onBudgetChange:(value:string)=>void;
  hostSupportsAdvisor:boolean; draftKey:string; request:(signal?:AbortSignal)=>Promise<SpeedPayload>; api:ClientApi; activity?:ActivityView;
  onAdopt:(key:string,id:string|undefined)=>void;
  onRunningChange:(running:boolean,starting?:boolean)=>void;
  initialSession?:SpeedPreviewSession;
  onBackground:(session:SpeedPreviewSession)=>void;
  registerCancel:(handler:()=>Promise<boolean>)=>void; onRefresh:()=>void;
}
const terminal=(row:SpeedSession)=>!['running','stopping'].includes(row.status);
const date=(time:string)=>new Date(time).toLocaleDateString('zh-CN');
const point=(s:EstimateSnapshot|undefined)=>s?.algorithm==='estimate-v3'&&s.basis?.durationScope==='first-pass'
  &&s.state==='available'&&typeof s.referenceTotalMs==='number'&&Number.isFinite(s.referenceTotalMs)&&s.referenceTotalMs>0
  ?s.referenceTotalMs:undefined;
function reason(row:SpeedSession){
  const codes=[...(row.estimate?.reasons??[]),...row.configs.flatMap(c=>c.errorCode?[c.errorCode]:[])];
  if(codes.includes('UPSTREAM_ERROR'))return '模型服务返回错误。请稍后重试。';
  if(codes.includes('SPEED_BUDGET_REACHED'))return '达到测速上限，样本仍不足。可调高上限后重试。';
  if(codes.includes('NO_APPLICABLE_BASELINE'))return '同配置的历史参照已不可用。';
  if(codes.some(c=>/TIMEOUT|CENSORED|BUDGET/.test(c)))return '有请求未在测速预算内完成，样本不足。';
  if(codes.some(c=>/AUTH|MODEL|TARGET/.test(c)))return '请检查模型是否可用。';
  if(codes.some(c=>/STORAGE|TIMING/.test(c)))return '本机无法保存或读取计时记录。';
  return '本次没有取得足以估算首轮用时的样本。';
}

export function SpeedPreview(p:Props){
  const [check,setCheck]=React.useState<Check>(),[readError,setReadError]=React.useState<ReadIssue>(),[reload,setReload]=React.useState(0);
  const [showReading,setShowReading]=React.useState(false);
  const [used,setUsed]=React.useState<string>();
  const [session,setSession]=React.useState(p.initialSession),[row,setRow]=React.useState<SpeedSession>();
  const [creating,setCreating]=React.useState(false),[stopped,setStopped]=React.useState<string>();
  const [problem,setProblem]=React.useState<string>(),[now,setNow]=React.useState(Date.now);
  const mounted=React.useRef(true),pending=React.useRef(false),latest=React.useRef(p);
  const sessionRef=React.useRef(p.initialSession),rowRef=React.useRef<SpeedSession>();
  const panel=React.useRef<HTMLElement>(null);
  const billingId=React.useId();
  const budgetSeconds=Number(p.budget);
  const budgetValid=validSpeedSeconds(budgetSeconds);
  const current=check?.key===p.draftKey&&check.seconds===budgetSeconds?check:undefined;
  const offer=current?.result.offer?.id!==used?current?.result.offer:undefined;
  const sessionRow=session&&row?.previewId===session.id?row:undefined;
  const associatedActivity=p.activity?.kind==='speed-preview'&&p.activity.id===session?.id?p.activity:undefined;
  const active=creating||!!session&&(!sessionRow||!terminal(sessionRow)||!!associatedActivity);
  const stopping=!!session&&(stopped===session.id||sessionRow?.status==='stopping'||associatedActivity?.state==='stopping'||sessionRow?.configs.some(c=>c.status==='stopping'));
  const stale=!!session&&session.key!==p.draftKey;
  const result=active?undefined:sessionRow;
  const stoppedResult=result?.status==='stopped'||!!result&&stopped===result.previewId;
  const collected=!!result&&result.status==='completed'&&session?.intent==='collect'&&result.configs.every(c=>c.performance.samples.some(s=>s.outcome==='completed'));
  const total=result&&!stale&&!stoppedResult&&!['failed','interrupted'].includes(result.status)&&session?.intent==='estimate'?point(result.estimate):undefined;

  React.useLayoutEffect(()=>{latest.current=p;});
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  React.useEffect(()=>{
    if(!p.open||!p.ready||!budgetValid)return;
    const key=p.draftKey,controller=new AbortController();
    const obsolete=()=>controller.signal.aborted||key!==latest.current.draftKey||budgetSeconds!==Number(latest.current.budget);
    setReadError(undefined);setCheck(undefined);setShowReading(false);
    const reveal=setTimeout(()=>{if(!obsolete())setShowReading(true);},700);
    const deadline=setTimeout(()=>{
      if(obsolete())return;
      controller.abort();
      setReadError({key,kind:'timeout'});
    },6000);
    const lookup=setTimeout(async()=>{
      let phase:ReadIssue['kind']='draft';
      try{
        const payload=await latest.current.request(controller.signal);
        if(obsolete())return;
        phase='read';
        const result=await p.api<TimeAdvisorResult>('checkTimeAdvisor',{...payload,budgetMinutes:budgetSeconds/60},controller.signal);
        if(!obsolete())setCheck({key,seconds:budgetSeconds,payload,result});
      }catch(error){
        if(obsolete())return;
        const code=(error as {code?:string}).code;
        // The first advisor version accepted this read without advertising a capability.
        const legacy=phase==='read'&&!latest.current.hostSupportsAdvisor&&code==='INVALID_REQUEST';
        setReadError({key,kind:code==='TIME_ADVISOR_READ_TIMEOUT'?'timeout':legacy?'host-version':phase});
      }finally{clearTimeout(reveal);clearTimeout(deadline);}
    },180);
    return()=>{controller.abort();clearTimeout(lookup);clearTimeout(reveal);clearTimeout(deadline);};
  },[p.open,p.ready,p.prepared,p.draftKey,p.api,reload,budgetSeconds,budgetValid]);
  React.useLayoutEffect(()=>{p.onRunningChange(active,creating);},[active,creating,p.onRunningChange]);
  React.useLayoutEffect(()=>{
    const attach=result&&!stale&&stopped!==result.previewId&&result.status==='completed'&&(session?.intent!=='collect'||collected);
    p.onAdopt(p.draftKey,attach?result.previewId:undefined);
  },[p.draftKey,result,stale,stopped,session?.intent,collected,p.onAdopt]);
  React.useEffect(()=>{
    if(!session||!active)return;
    let ignore=false;let timer:ReturnType<typeof setTimeout>|undefined;
    let notified=false;
    const poll=async()=>{
      try{
        const value=await p.api<SpeedSession>('speedPreviewStatus',{previewId:session.id});
        if(ignore)return;
        rowRef.current=value;setRow(value);setNow(Date.now());setProblem(undefined);
        if(terminal(value)&&!notified){notified=true;latest.current.onRefresh();}
      }catch{if(!ignore)setProblem('暂时读不到测速状态，正在重新查询。');}
      if(!ignore)timer=setTimeout(()=>void poll(),1000);
    };
    void poll();
    return()=>{ignore=true;clearTimeout(timer);};
  },[session,active,p.api]);

  const stop=React.useCallback(async()=>{
    if(pending.current)return false;
    const s=sessionRef.current;
    if(!s||rowRef.current&&terminal(rowRef.current))return true;
    try{
      await latest.current.api('cancelSpeedPreview',{previewId:s.id});
      if(mounted.current)setStopped(s.id);
      latest.current.onRefresh();return true;
    }catch{if(mounted.current)setProblem('未能停止测速，可稍后重试。');return false;}
  },[]);
  React.useEffect(()=>p.registerCancel(stop),[p.registerCancel,stop]);

  const focusReturn=()=>panel.current?.closest('.me-dialog')?.querySelector<HTMLElement>('[data-dialog-close]')?.focus({preventScroll:true});
  function retry(){
    focusReturn();setCheck(undefined);setReadError(undefined);setShowReading(false);setReload(n=>n+1);
  }
  function close(){
    setCheck(undefined);
    setReadError(undefined);
    setShowReading(false);
    p.onClose();
  }

  React.useLayoutEffect(()=>{
    if(creating||result){
      const root=panel.current?.getRootNode();
      const focused=root instanceof ShadowRoot?root.activeElement:document.activeElement;
      if(focused===document.body||focused===null)panel.current?.focus({preventScroll:true});
    }
  },[creating,result?.previewId]);

  async function start(){
    if(!offer||!current||pending.current||active||!p.canProbe||current.key!==latest.current.draftKey
      ||offer.budgetMinutes!==Number(latest.current.budget)/60)return;
    const snapshot=current,chosen=offer;
    pending.current=true;
    setUsed(chosen.id);setProblem(undefined);setStopped(undefined);
    sessionRef.current=undefined;rowRef.current=undefined;setSession(undefined);setRow(undefined);
    p.onAdopt(p.draftKey,undefined);p.onRunningChange(true,true);setCreating(true);
    try{
      const {previewId}=await p.api<{previewId:string}>('startSpeedPreview',{
        ...snapshot.payload,offerId:chosen.id,intent:chosen.intent,budgetMinutes:chosen.budgetMinutes,
      });
      if(!mounted.current){await p.api('cancelSpeedPreview',{previewId});return;}
      const next={id:previewId,key:snapshot.key,intent:chosen.intent};
      sessionRef.current=next;rowRef.current=undefined;setRow(undefined);setSession(next);setNow(Date.now());
      latest.current.onRefresh();
    }catch(error){
      if(mounted.current){
        latest.current.onRefresh();
        const code=(error as {code?:string}).code;
        setProblem(code==='TIME_ADVISOR_OFFER_INVALID'||code==='TIME_ADVISOR_OFFER_STALE'
          ?'测速条件已变更，本次未调用模型。请重新检查。':'暂时无法确认测速状态，可在「测速记录」中查看。');
      }
    }finally{pending.current=false;if(mounted.current)setCreating(false);}
  }

  if(!p.open)return null;
  const observations=current?.result.configs??[];
  const hasObserved=observations.some(c=>c.observation);
  const planningTier=p.ready?p.planningTier:undefined;
  const forecast=planningTier?tierTimeReference(planningTier,p.concurrency,p.names.length,
    result&&!stale&&!stoppedResult?result:undefined):undefined;
  const formatRate=(rate:number)=>'约 '+(rate<1?rate.toPrecision(1):Math.round(rate).toLocaleString('zh-CN'))+' Token/秒';
  const unavailable=current?.result.unavailable;
  const noReference=unavailable==='conditions'?'暂时无法核对这份配置的条件'
    :unavailable==='timing'?'本机计时记录不可用。'
    :unavailable==='unsupported'?'这项评测暂无可用的用时参考'
    :'暂无同配置的用时记录';
  const usage=result?speedUsage(result):undefined;
  const runningIndex=sessionRow?.configs.findIndex(c=>c.status==='running'||c.status==='stopping')??-1;
  const runningStart=runningIndex>=0?sessionRow?.configs[runningIndex]?.startedAt:undefined;
  const eligibleToRetry=!active&&p.ready&&!!current?.result.offer&&used===current.result.offer.id;
  const issue=readError?.key===p.draftKey?readError.kind:undefined;
  const probeOffer=!active&&p.canProbe&&offer?.budgetMinutes===budgetSeconds/60?offer:undefined;
  const showEmptyReference=!planningTier&&p.ready&&!!current&&!issue&&!unavailable&&!hasObserved&&!result;
  const recordingNoteId=billingId+'-recording';
  const recordingNote=!planningTier&&probeOffer?.intent==='collect'
    ?<p id={recordingNoteId} className="me-advisor-recording-note">本次测速只记录结果，无法预估评测用时。</p>
    :null;
  const subtitle=[p.scope,p.names.length>1?p.names.length+' 个配置':''].filter(Boolean).join(' · ');
  return <Modal title="评测用时参考" {...(planningTier?{}:{subtitle})} closeLabel="返回评测设置" variant="time-advisor" layer="child"
    locked={p.locked} onClose={close} returnFocusTo={p.returnFocusTo}>
  <div className="me-dialog-body me-advisor-page"><section id={p.id} ref={panel} aria-label="评测用时参考" tabIndex={-1} className="me-time-advisor">
    {planningTier&&<dl className="me-advisor-forecast" aria-live="polite" aria-atomic="true">
      <div className="me-advisor-forecast-main"><dt>当前评测配置预计耗时</dt>
        <dd data-testid="speed-estimate" className={forecast?undefined:'pending'}>{forecast?formatPlanningTime(forecast.durationMs):'待测速'}</dd></div>
      <div><dt>{t.evaluationTier}</dt><dd>{p.scope}</dd></div>
      {p.names.length>1&&<div><dt>配置数</dt><dd>{p.names.length}</dd></div>}
      <div><dt>并发数</dt><dd>{p.concurrency}{p.names.length>1?'（每个配置）':''}</dd></div>
      <div><dt>档位参考输出量</dt><dd>约 {tierOutputTokens[planningTier]/10_000} 万 Token{p.names.length>1?'（每个配置）':''}</dd></div>
      {forecast?.rates.length===1&&<div><dt>本次实测输出吞吐</dt><dd>{formatRate(forecast.rates[0]!)}</dd></div>}
      {forecast&&<div><dt>估算依据</dt><dd>档位参考输出量 ÷ 本次实测吞吐</dd></div>}
    </dl>}
    {!active&&!result&&(!p.ready?<div className="me-advisor-message"><Icon name="clock"/><div>
      <strong>请先选好模型和评测内容</strong><p>含中文写作时，还需选择裁判。</p>
    </div></div>
      :issue?<div className="me-advisor-message"><Icon name="info"/><div role="status">
        <strong>{issue==='host-version'?'请重新打开 DSH 以查看用时':issue==='draft'?'请检查模型和参数':issue==='timeout'?'查询用时过长':'暂时无法读取本机用时记录。'}</strong>
        {issue==='timeout'&&<p>可以重试，也可以返回评测设置。</p>}
      </div>{(issue==='read'||issue==='timeout')&&<Button icon="refresh" onClick={retry}>{issue==='timeout'?'重试查询':'重新查看'}</Button>}</div>
      :budgetValid&&!current&&(!planningTier||showReading)?<div className={'me-advisor-message me-advisor-loading'+(planningTier?' compact':'')}>{!planningTier&&<Icon name="clock"/>}
        <div role="status">{showReading&&'正在查找本机用时记录…'}</div></div>
      :!hasObserved&&(!planningTier||unavailable)&&!!current&&<div className={unavailable?'me-advisor-message':'me-advisor-message me-advisor-message--empty'}>
        {unavailable&&<Icon name="info"/>}<div role="status">
        <strong>{noReference}</strong>{showEmptyReference&&recordingNote}
      </div></div>)}
    {active&&<div className="me-advisor-state">
      <div role="status"><strong>{creating?'正在启动测速…':stopping?'正在收尾':'正在测速'+(p.names.length>1&&runningIndex>=0?' · 配置 '+(runningIndex+1)+'/'+p.names.length:'')}</strong>
      <p>{stopping?'已停止派发，等待接口结束并保存记录。':session?'可切到后台继续测速。':'正在连接测速服务。'}</p></div>
      {!stopping&&runningStart&&<span className="me-help">本配置已用 {formatElapsed(Math.max(0,now-Date.parse(runningStart)))}</span>}
      {!creating&&!stopping&&<Button onClick={()=>void stop()}>停止测速</Button>}
    </div>}
    {result&&<div className="me-advisor-result">
      {forecast?null
        :planningTier&&!stale&&!stoppedResult&&result.status==='completed'?<p role="status" className="me-advisor-note">{result.configs.some(c=>c.errorCode==='SPEED_BUDGET_REACHED')?reason(result):'本次测速未取得足够的输出 Token 数据，暂无法估算耗时。'}</p>
        :total!==undefined?<><p className="me-advisor-caption">预计首轮用时</p><strong className="me-advisor-time" data-testid="speed-estimate">{formatReference(total)}</strong>
        <p>结合本机同配置记录与本次短测速；待补测另计。</p></>
        :<div role="status"><strong>{stale?'配置已变更':stoppedResult?'测速已停止':result.status==='failed'||result.status==='interrupted'?'测速未完成':collected?'测速记录已保存':session?.intent==='collect'?'本次测速未取得可用结果':'测速已结束，暂不能估算首轮用时'}</strong>
          <p>{stale?'下面的用量来自上一次测速。':stoppedResult?'可以直接开始评测。':collected?'完成一次同配置的评测后，这条记录才可用于以后估时。':reason(result)}</p></div>}
      {forecast&&forecast.rates.length>1&&<ul className="me-advisor-breakdown">
        {forecast.rates.map((rate,i)=><li key={i}><span>{p.names[i]}</span><b>{formatRate(rate)}</b></li>)}
      </ul>}
      {!planningTier&&!stale&&session?.intent==='estimate'&&!stoppedResult&&p.names.length>1&&<ul className="me-advisor-breakdown">
        {result.configs.map((c,i)=>{const prediction=c.probe?.prediction,ms=prediction?.centerMs;
          return <li key={i}><span>{p.names[i]??c.target.modelId}</span><b>{prediction?.state==='available'&&typeof ms==='number'&&Number.isFinite(ms)&&ms>0?formatReference(ms):'样本不足'}</b></li>;})}
      </ul>}
      <Disclosure kind="help" title="本次测速用量">
        <p>{usage?.total===undefined?'供应商未返回可记录的用量。':('已记录 '+usage.total.toLocaleString()+' Token'+(usage.partial?' · 用量不完整':'')+'，与正式评测分开。')}</p>
        <p>请求明细见历史中的「测速记录」。</p>
      </Disclosure>
    </div>}
    {hasObserved&&<div className={'me-advisor-history'+(planningTier||total!==undefined?' secondary':'')}>
      <h3>上次同配置首轮实测</h3>
      <ul className="me-advisor-breakdown">{observations.map((c,i)=><li key={i}>
        {p.names.length>1&&<span>{p.names[i]}</span>}
        {c.observation?<><b className={!planningTier&&p.names.length===1&&total===undefined?'me-advisor-time':undefined}>{formatReference(c.observation.durationMs)}</b>
          <small>{date(c.observation.capturedAt)}{c.observation.deferredItems?' · '+c.observation.deferredItems+' 题待补测（另计）':''}</small></>:<small>无同配置记录</small>}
      </li>)}</ul>
    </div>}
    {problem&&<p role="alert" className="me-advisor-note">{problem}</p>}
    {!active&&p.ready&&p.canProbe&&(!current||current.result.offer)&&<div className="me-advisor-probe">
      <Field label="每配置测速上限（秒）" className="me-advisor-budget"
        hint={`可输入 ${MIN_SPEED_SECONDS}–${MAX_SPEED_SECONDS} 秒。`}
        {...(!budgetValid&&{error:'请输入范围内的整数秒。'})}>
        <TextInput type="number" min={MIN_SPEED_SECONDS} max={MAX_SPEED_SECONDS} step={1} value={p.budget}
          disabled={p.locked} onChange={event=>p.onBudgetChange(event.target.value)}/>
      </Field>
      {!showEmptyReference&&recordingNote}
      {probeOffer&&<div className="me-advisor-probe-actions">
        <Button aria-describedby={recordingNote?recordingNoteId+' '+billingId:billingId} onClick={()=>void start()}>开始测速</Button>
        <Disclosure kind="help" title="测速与计费">
          <p id={billingId}>每个配置最多测速 {budgetSeconds} 秒，最多调用 {probeOffer.callsPerConfig} 次{current?.payload.tracks.includes('writing')?'（含裁判）':''}
            {p.names.length>1&&<>，本次合计最多 {probeOffer.totalCalls} 次</>}，按供应商规则计费。</p>
          <p>采样完成会提前结束，已发出的请求可能需要额外时间收尾。</p>
          <p>{planningTier?'按当前并发测量输出 Token 吞吐，再用档位参考输出量估算。实际用时随题目和服务状态变化，本地判分另计。':probeOffer.intent==='collect'
            ?'完成一次同配置评测后，可结合这次的测速记录估算用时。'
            :'用本次测速和同配置的历史记录更新首轮用时预估。'}</p>
        </Disclosure>
      </div>}
    </div>}
    {eligibleToRetry&&<Button className="me-advisor-recheck" icon="refresh" onClick={retry}>重新检查测速条件</Button>}
    {!active&&offer&&!p.canProbe&&<p className="me-advisor-note">等评测环境就绪且没有其他活动后，可选择测速。</p>}
  </section></div>
  {active&&session&&!stale&&<footer className="me-dialog-foot">
    <Button disabled={p.locked} onClick={()=>p.onBackground(session)}>后台继续</Button>
  </footer>}
  </Modal>;
}
