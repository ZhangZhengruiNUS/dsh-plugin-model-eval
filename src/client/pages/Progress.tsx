import {Estimate} from '../components/Estimate.tsx';
import {CountBadge,DataValue} from '../components/DataReadout.tsx';
import {generalSchemaFor,isCurrentGeneralRelease} from '../../evaluation/current-edition.ts';
import {usesContestWallSafety} from '../../evaluation/five-schema.ts';
import * as React from 'react';import {zh as t} from '../locales.ts';import {ActionButton,activityUnavailable,Button,Empty,Badge,BatchRuns,MetaTime,Modal,type PageProps} from '../ui.tsx';import {ConfigEditor,emptyDraft,resolveDraft} from './NewRun.tsx';import {summarizeBatchMetrics,formatElapsed} from '../batch-metrics.ts';
export function Progress(props:PageProps){const [changing,setChanging]=React.useState<string>(),[judge,setJudge]=React.useState(emptyDraft),[error,setError]=React.useState('');
  const [now,setNow]=React.useState(Date.now),{activeBatchId,batches}=props.data.queue;
  React.useEffect(()=>{setNow(Date.now());if(!activeBatchId)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setNow(Date.now());},1000);return()=>clearInterval(timer);},[activeBatchId]);
  if(!batches.length){
    const needsSetup=!props.data.status.prepared&&!props.data.protocols.some(({descriptor})=>descriptor.allowNewRuns&&isCurrentGeneralRelease(descriptor.refs));
    return <Empty title={t.noJobs} body={needsSetup?t.firstBody:t.noJobsBody}>
      {needsSetup?<Button kind="primary" icon="arrow" onClick={()=>props.navigate('settings')} disabled={!props.data.status.writable||props.busy}>{t.prepare}</Button>:<ActionButton icon="plus" kind="primary" hintAlign="start" onClick={props.newRun} unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>}
    </Empty>;
  }
  const activeBatch=batches.find(batch=>batch.batchId===activeBatchId);
  const resumeUnavailable=!props.data.status.writable?'数据目录为只读，请在设置中切换到可写目录。':
    activityUnavailable(props.data.status,activeBatchId)??(props.busy?'正在处理当前操作，请稍候。':undefined);
  const newestFirst=[...batches].reverse();
  const displayedBatches=activeBatch?[activeBatch,...newestFirst.filter(batch=>batch!==activeBatch)]:newestFirst;
  return <>
  {!activeBatchId&&<div className="me-task-list-bar">
    <div className="me-count-heading">
      <h2>评测批次</h2>
      <CountBadge count={batches.length} description={`${batches.length} 个批次`}/>
    </div>
    <div className="me-inline-actions">
      <Button kind="text" className="me-local-refresh" icon="refresh" aria-label="刷新评测任务" title="刷新评测任务" onClick={()=>void props.refresh()} disabled={props.busy}/>
      <ActionButton hintSide="below" kind={batches.every(batch=>batch.status==='completed')?'primary':''} icon="plus" onClick={props.newRun} unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>
    </div>
  </div>}
  <div className="me-batch-list">{displayedBatches.map(batch=>{const estimate=props.data.queue.estimates?.[batch.batchId]??batch.estimate,runs=props.data.runs.filter(x=>batch.runIds.includes(x.runId)),tracks=runs.flatMap(x=>Object.values(x.tracks)),graded=tracks.reduce((n,x)=>n+x.graded,0),required=tracks.reduce((n,x)=>n+x.required,0),active=props.data.queue.activeBatchId===batch.batchId,localPending=batch.pendingItems?.filter(x=>x.error.code==='CONTEST_WALL_LIMIT').length??0,
  slowLocal=active&&runs.some(r=>usesContestWallSafety(generalSchemaFor(r.protocols))&&r.performance?.activeStages.some(stage=>stage.phase==='local-grade'&&stage.datasetId==='code-contests-selected'&&now-Date.parse(stage.startedAt)>=60000)),canResume=runs.every(x=>x.resumeAllowed&&x.details==='available');return <section className="me-card" key={batch.batchId}><div className="me-card-heading"><div><div className="me-title-row"><h2>{t.batch} {batch.batchId.slice(0,8)}</h2><Badge status={active?'running':batch.status}/></div><div className="me-record-meta">
    <MetaTime value={batch.createdAt}/>
    <DataValue value={runs.length} unit={t.configCount}/>
  </div></div><div className="me-actions">{active?<Button icon="pause" onClick={()=>void props.act(()=>props.api('pause',{batchId:batch.batchId}))} disabled={props.busy}>{t.pause}</Button>:batch.status!=='completed'&&canResume&&<><ActionButton kind="primary" icon="play" hintSide="below" unavailableReason={resumeUnavailable} onClick={()=>void props.act(()=>props.api('resume',{batchId:batch.batchId}))}>{t.resume}</ActionButton>{localPending>0&&<ActionButton hintSide="below" unavailableReason={resumeUnavailable} onClick={()=>void props.act(()=>props.api('rejudge',{batchId:batch.batchId,operationId:crypto.randomUUID()}))}>仅补判</ActionButton>}{runs.some(x=>x.tracks.writing?.status!=='completed'&&x.tracks.writing)&&<ActionButton hintSide="below" unavailableReason={resumeUnavailable} onClick={()=>{setChanging(batch.batchId);setJudge(emptyDraft());}}>{t.changeJudge}</ActionButton>}</>}</div></div>
  <div className="me-batch-progress"><div>
    <span>{t.graded}</span>
    <strong><DataValue value={required ? graded : '—'} unit={required ? `/ ${required.toLocaleString('zh-CN')} 题` : undefined}/></strong>
  </div>
  {required>0&&<progress max={required} value={graded} aria-label={t.graded} aria-valuetext={`已判分 ${graded} 题，共 ${required} 题`}/>}
  {slowLocal&&<p role="status" className="me-help">本地判分仍在进行</p>}{localPending>0&&<p className="me-help">{localPending} 题已保存答卷，待补判</p>}{runs.some(r=>r.reuse)&&<p className="me-help">复用 {runs.reduce((n,r)=>n+(r.reuse?.reusedItems??0),0)} 题</p>}<BatchMetrics newWork={runs.some(r=>!!r.reuse)} metrics={summarizeBatchMetrics(runs.map(x=>x.metrics),active,now)}/><Estimate {...(estimate?{snapshot:estimate}:{})} elapsedMs={summarizeBatchMetrics(runs.map(x=>x.metrics),active,now).elapsedMs}/></div>{batch.lastError&&batch.lastError.code!=='CONTEST_WALL_LIMIT'&&<div className="me-inline-warning"><strong>{t.callError}</strong><p>中断环节：{t.errorPhases[batch.lastError.phase]}</p><p>{batch.lastError.code==='ABORTED'?t.abortedHelp:batch.lastError.message}</p><code>{batch.lastError.code}</code></div>}{!active&&canResume&&batch.status!=='completed'&&<div className="me-resume-help"><p>{t.resumeHelp}</p>{runs.some(r=>r.tracks.writing?.status!=='completed'&&r.tracks.writing)&&<p>{t.judgeChoiceHelp}</p>}</div>}<BatchRuns batch={batch} runs={runs} report={props.report}/></section>;})}</div>
  {changing&&<Modal title={t.resumeJudge} onClose={()=>setChanging(undefined)} locked={props.busy}><div className="me-dialog-body"><ConfigEditor draft={judge} models={props.data.models} api={props.api} change={setJudge} reportError={setError} label={t.judge}/><p className="me-help">{t.resumeJudgeHelp}</p>{error&&<p role="alert">{error}</p>}</div><footer className="me-dialog-foot"><Button onClick={()=>setChanging(undefined)}>{t.cancel}</Button><ActionButton kind="primary" disabled={props.busy} unavailableReason={!judge.snapshot?'请先选择写作裁判。':resumeUnavailable} onClick={()=>void props.act(async()=>{const judgeHandle=await resolveDraft(props.api,judge);await props.api('resume',{batchId:changing,judgeHandle});setChanging(undefined);})}>{t.resume}</ActionButton></footer></Modal>}</>;
}
function BatchMetrics({metrics:m,newWork=false}:{metrics:ReturnType<typeof summarizeBatchMetrics>;newWork?:boolean}){const tokens=(n:number|undefined)=>n===undefined?'—':n.toLocaleString();return <dl className="me-batch-stats"><div title={t.batchUsageHint}><dt><span>{newWork?'本次新增 Token':t.batchTokens}</span>{m.partialUsage&&<span className="me-metric-note">{t.partialUsage}</span>}</dt><dd><strong data-testid="batch-tokens">{tokens(m.tokens)}</strong><small>{t.input} {tokens(m.inputTokens)} · {t.output} {tokens(m.outputTokens)}</small>{(m.cacheReadTokens!==undefined||m.cacheWriteTokens!==undefined)&&<small data-testid="batch-cache" className="me-cache-breakdown">{m.cacheReadTokens!==undefined&&<span>缓存读取 {tokens(m.cacheReadTokens)}</span>}{m.cacheReadTokens!==undefined&&m.cacheWriteTokens!==undefined&&' '}{m.cacheWriteTokens!==undefined&&<span>缓存写入 {tokens(m.cacheWriteTokens)}</span>}</small>}</dd></div><div title={t.batchElapsedHint}><dt><span>{newWork?'本次新增耗时':t.batchElapsed}</span>{m.incompleteTiming&&<span className="me-metric-note">{t.incompleteTiming}</span>}</dt><dd><strong data-testid="batch-elapsed">{formatElapsed(m.elapsedMs)}</strong><small>{t.batchElapsedHint}</small></dd></div></dl>;}
