import type {BatchView,RunOperation} from '../../jobs/queue.ts';
import {JUDGE_ITEM_PENDING,type RunSummary} from '../../contracts.ts';
import {Estimate,RoughEstimate} from '../components/Estimate.tsx';
import {estimateDisplay} from '../estimation-view.ts';
import {CountBadge,DataValue} from '../components/DataReadout.tsx';
import {generalSchemaFor,isCurrentGeneralRelease} from '../../evaluation/current-edition.ts';
import {usesContestWallSafety} from '../../evaluation/five-schema.ts';
import * as React from 'react';
import {zh as t} from '../locales.ts';
import {ActionButton,activityUnavailable,Button,Empty,Badge,BatchRuns,MetaTime,Modal,type PageProps} from '../ui.tsx';
import {TaskFailure} from '../components/TaskFailure.tsx';
import {SelectionBar} from '../components/SelectionBar.tsx';
import {Checkbox} from '../primitives/primitives.tsx';
import {Disclosure} from '../components/Disclosure.tsx';
import {ConfigEditor,emptyDraft,resolveDraft} from './NewRun.tsx';
import {summarizeBatchMetrics} from '../batch-metrics.ts';
import {BatchMetrics} from '../components/BatchMetrics.tsx';
import {BatchRecord} from '../components/BatchRecord.tsx';
import {batchStatus,canResumeRun,runIsComplete,runIsSettling,taskBatches} from '../task-batches.ts';

const taskTabs=[{id:'current',label:'当前评测'},{id:'pending',label:'待处理'}] as const;
type TaskTab=(typeof taskTabs)[number]['id'];

const startupSeconds=(ms:number)=>(ms/1000).toFixed(2)+' 秒';
function readBatchProgress(runs:RunSummary[]){
  const tracks=runs.flatMap(run=>Object.values(run.tracks));
  return {
    graded:tracks.reduce((count,track)=>count+track.graded,0),
    required:tracks.reduce((count,track)=>count+track.required,0),
  };
}

export function Progress(props:PageProps&{targetBatchId?:string|undefined}){const [changing,setChanging]=React.useState<string>(),[judge,setJudge]=React.useState(emptyDraft),[error,setError]=React.useState('');
  const [pending,setPending]=React.useState<{batchId:string;runId:string;operation:RunOperation}>();
  const [batchAction,setBatchAction]=React.useState<{batchId:string;operation:'pause'|'resume'}>();
  const [selection,setSelection]=React.useState<{batchId:string;ids:Set<string>}>();
  const targetBatchId=props.targetBatchId;
  const [tab,setTab]=React.useState<TaskTab>(
    targetBatchId&&targetBatchId!==props.data.queue.activeBatchId?'pending':'current',
  );
  const [expanded,setExpanded]=React.useState(targetBatchId);
  const [focusBatch,setFocusBatch]=React.useState(targetBatchId);
  const workbench=React.useRef<HTMLDivElement>(null);
  const panelId=React.useId();
  function moveToCurrent(batchId:string){
    setTab('current');
    setFocusBatch(batchId);
  }
  function changeBatch(batchId:string,operation:'pause'|'resume'){
    setBatchAction({batchId,operation});
    void props.actQueue(()=>props.api(operation,{batchId})).then(view=>{
      if(view?.activeBatchId===batchId)moveToCurrent(batchId);
      else if(view&&operation==='pause'){setExpanded(batchId);setFocusBatch(batchId);}
    }).finally(()=>setBatchAction(undefined));
  }
  function controlModels(batch:BatchView,ids:string[],operation:'hold'|'resume',runId?:string){
    if(runId)setPending({batchId:batch.batchId,runId,operation});
    void props.actQueue(()=>props.api('controlRuns',{batchId:batch.batchId,runIds:ids,operation})).then(view=>{
      if(view?.activeBatchId===batch.batchId&&batch.status!=='running')moveToCurrent(batch.batchId);
      if(view&&!view.activeBatchId){setExpanded(batch.batchId);setFocusBatch(batch.batchId);}
    }).finally(()=>setPending(undefined));
  }
  const [now,setNow]=React.useState(Date.now),{activeBatchId}=props.data.queue;
  const {active:activeBatch,pending:pendingBatches,runsFor}=taskBatches(props.data.queue,props.data.runs);
  const hasHistory=props.data.runs.length>0;
  const historyLink=<Button kind="text" icon="arrow" onClick={()=>props.navigate('history')}>查看评测历史</Button>;
  React.useLayoutEffect(()=>{
    if(!focusBatch)return;
    const node=workbench.current?.querySelector<HTMLElement>(`[data-batch-focus="${CSS.escape(focusBatch)}"]`);
    if(node){node.focus();setFocusBatch(undefined);}
  },[activeBatchId,focusBatch,tab]);
  React.useEffect(()=>{setNow(Date.now());if(!activeBatchId)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setNow(Date.now());},1000);return()=>clearInterval(timer);},[activeBatchId]);
  if(!activeBatch&&!pendingBatches.length){
    const needsSetup=!props.data.status.prepared&&!props.data.protocols.some(({descriptor})=>descriptor.allowNewRuns&&isCurrentGeneralRelease(descriptor.refs));
    return <Empty title={hasHistory?'暂无待处理评测':t.noJobs} body={needsSetup?t.firstBody:hasHistory?'':t.noJobsBody}>
      <div className="me-actions me-task-empty-actions">
        {needsSetup?<Button kind="primary" icon="arrow" onClick={()=>props.navigate('settings')} disabled={!props.data.status.writable||props.busy}>{t.prepare}</Button>:<ActionButton icon="plus" kind="primary" hintAlign="start" onClick={props.newRun} unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>}
        {hasHistory&&historyLink}
      </div>
    </Empty>;
  }
  const activity=props.data.status.activeActivity;
  const mutationUnavailable=!props.data.status.writable?t.runControl.readonly:props.busy?t.runControl.busy:undefined;
  const resumeUnavailable=mutationUnavailable??activityUnavailable(props.data.status,activeBatchId);
  const selectedTab=activeBatch?tab:'pending';

  function renderBatch(batch:BatchView,runs:RunSummary[]){
    const active=activeBatchId===batch.batchId;
    const pendingBatchAction=batchAction?.batchId===batch.batchId?batchAction.operation:undefined;
    const {graded,required}=readBatchProgress(runs);
    const controls=Object.values(batch.runControls??{});
    const held=controls.filter(control=>control.state==='held'&&!control.error).length;
    const needsAttention=controls.filter(control=>control.state==='held'&&control.error).length;
    const removed=controls.filter(control=>control.state==='removed').length;
    const complete=runs.filter(runIsComplete).length;
    const hasExcluded=held+needsAttention+removed>0;
    const incompleteRunnable=runs.filter(run=>!batch.runControls?.[run.runId]&&!runIsComplete(run));
    const remaining=incompleteRunnable.flatMap(run=>Object.values(run.tracks))
      .reduce((count,track)=>count+Math.max(0,track.required-track.graded),0);
    const eligible=runs.filter(run=>!runIsComplete(run)&&canResumeRun(run)&&
      batch.runControls?.[run.runId]?.state!=='removed'&&!runIsSettling(batch,run.runId));
    const ids=eligible.map(run=>run.runId);
    const selected=selection?.batchId===batch.batchId?ids.filter(id=>selection.ids.has(id)):[];
    const selectedIds=new Set(selected);
    const scope=selected.length?selected:ids;
    const toPause=scope.filter(id=>!batch.runControls?.[id]);
    const toResume=scope.filter(id=>!active||batch.runControls?.[id]?.state==='held');
    const canResume=toResume.length>0;
    const customScheduling=(batch.execution.parallelModels??1)>1||Object.keys(batch.runConcurrency??{}).length>0;
    const canChangeJudge=incompleteRunnable.some(run=>run.tracks.writing&&run.tracks.writing.status!=='completed');
    const judgePending=batch.pendingItems?.filter(item=>item.error.code===JUDGE_ITEM_PENDING).length??0;
    const localPending=batch.pendingItems?.filter(item=>!batch.runControls?.[item.runId]&&item.error.code==='CONTEST_WALL_LIMIT').length??0;
    const slowLocal=active&&runs.some(run=>usesContestWallSafety(generalSchemaFor(run.protocols))&&run.performance?.activeStages.some(
      stage=>stage.phase==='local-grade'&&stage.datasetId==='code-contests-selected'&&now-Date.parse(stage.startedAt)>=60000
    ));
    const metrics=summarizeBatchMetrics(runs.map(run=>run.metrics),active,now);
    const originalMetrics=runs.flatMap(run=>run.reuse?.writingReplacement?[run.reuse.writingReplacement.sourceMetrics]:[]);
    const originalTokens=originalMetrics.length?summarizeBatchMetrics(originalMetrics,false,now).tokens:undefined;
    const estimate=props.data.queue.estimates?.[batch.batchId]??batch.estimate;
    const roughWork=active&&props.data.queue.roughWork?.batchId===batch.batchId?props.data.queue.roughWork:undefined;
    const hasCalibratedRemaining=estimate?.state==='available'&&estimateDisplay(estimate).kind==='full'&&!hasExcluded&&!roughWork?.excludesDeferredWork&&!roughWork?.sampling;
    const status=batchStatus(batch,active);
    const controlUnavailable=active&&(!activity||activity.kind==='evaluation'&&activity.state==='running')
      ? mutationUnavailable
      : resumeUnavailable;
    return <section className={'me-task-detail'+(active?' me-card me-live-task':'')}>
      <div className="me-task-detail-head">
        {active&&<div>
          <div className="me-title-row"><h2 tabIndex={-1} data-batch-focus={batch.batchId}>{t.batch} {batch.batchId.slice(0,8)}</h2><Badge status={status}/></div>
          <div className="me-record-meta">
            <MetaTime value={batch.createdAt}/>
            <DataValue value={runs.length} unit={t.configCount}/>
          </div>
        </div>}
        <div className="me-actions">
          {active&&runs.length===1
            ? <Button icon="pause" onClick={()=>changeBatch(batch.batchId,'pause')} disabled={props.busy}>{pendingBatchAction==='pause'?'正在保存进度…':t.pause}</Button>
            : !active&&batch.status!=='completed'&&canResume&&<>
              {runs.length===1&&<ActionButton kind="primary" icon="play" hintSide="below" unavailableReason={pendingBatchAction==='resume'?'正在核对题集和已保存的进度。':resumeUnavailable}
                onClick={()=>changeBatch(batch.batchId,'resume')}>{pendingBatchAction==='resume'?'正在恢复…':t.resume}</ActionButton>}
              {localPending>0&&<ActionButton hintSide="below" unavailableReason={resumeUnavailable}
                onClick={()=>void props.actQueue(()=>props.api('rejudge',{batchId:batch.batchId,operationId:crypto.randomUUID()})).then(view=>{
                  if(view?.activeBatchId===batch.batchId)moveToCurrent(batch.batchId);
                })}>仅补判</ActionButton>}
              {canChangeJudge&&<ActionButton hintSide="below" unavailableReason={resumeUnavailable}
                onClick={()=>{setChanging(batch.batchId);setJudge(emptyDraft());void props.loadModels();}}>{t.changeJudge}</ActionButton>}
            </>}
        </div>
      </div>
      <div className="me-task-progress">
        {batch.startup&&<Disclosure kind="help" title="启动耗时">
          <p>资源校验 {startupSeconds(batch.startup.verificationMs)}</p>
          <p>收到请求到批次落盘 {startupSeconds(batch.startup.acceptedMs)}</p>
          {batch.startup.firstDispatchMs!==undefined&&<p>收到请求到首个宿主调用 {startupSeconds(batch.startup.firstDispatchMs)}</p>}
        </Disclosure>}
        {active&&<><div className="me-task-progress-readout">
          <span>{t.graded}</span>
          <strong><DataValue value={required?graded:'—'} unit={required?`/ ${required.toLocaleString('zh-CN')} 题`:undefined}/></strong>
        </div>
        {required>0&&<progress max={required} value={graded} aria-label={t.graded} aria-valuetext={`已判分 ${graded} 题，共 ${required} 题`}/>}</>}
        {hasExcluded&&<p className="me-help me-task-progress-note">
          {complete} 个完成{held>0&&` · ${held} 个已暂停`}{needsAttention>0&&` · ${needsAttention} 个待处理`}{removed>0&&` · ${removed} 个已移出`}
          {remaining>0&&` · 队列待评 ${remaining.toLocaleString('zh-CN')} 题`}
        </p>}
        {slowLocal&&<p role="status" className="me-help">本地判分仍在进行</p>}
        {localPending>0&&<p className="me-help">{localPending} 题已保存答卷，待补判</p>}
        {judgePending>0&&<p className="me-help">{judgePending} 道写作题待补判，答卷已保存</p>}
        {runs.some(run=>run.reuse)&&<p className="me-help">复用 {runs.reduce((count,run)=>count+(run.reuse?.reusedItems??0),0)} 题</p>}
        {batch.supersedesBatchId&&<p className="me-help">换题补测 · 原批次 {batch.supersedesBatchId.slice(0,8)} 保留在历史{originalTokens===undefined?'':` · 原批次累计 ${originalTokens.toLocaleString('zh-CN')} Token`}</p>}
        <div className="me-task-readouts">
          {active&&!customScheduling&&(roughWork&&!hasCalibratedRemaining
            ? <RoughEstimate estimate={roughWork.estimate} sampling={roughWork.sampling}/>
            : !hasExcluded&&<Estimate {...(estimate?{snapshot:estimate}:{})} elapsedMs={metrics.elapsedMs} compact/>)}
          <BatchMetrics newWork={runs.some(run=>!!run.reuse)} metrics={metrics}/>
        </div>
        {!active&&!customScheduling&&estimate&&batch.status!=='completed'&&!hasExcluded&&
          <Disclosure kind="help" title="估时记录" className="me-task-estimate-history">
            <Estimate snapshot={estimate} elapsedMs={metrics.elapsedMs} compact/>
          </Disclosure>}
      </div>
      {batch.lastError&&batch.lastError.code!=='CONTEST_WALL_LIMIT'&&batch.lastError.code!==JUDGE_ITEM_PENDING&&<TaskFailure error={batch.lastError}/>}
      {!active&&canResume&&batch.status!=='completed'&&<Disclosure kind="help" title="续测说明" className="me-task-resume-help">
        <p>{t.resumeHelp}</p>
        {canChangeJudge&&<p>{t.judgeChoiceHelp}</p>}
      </Disclosure>}
      {runs.length>1&&ids.length>0&&<div className="me-model-bulk">
        <label><Checkbox checked={selected.length===ids.length} ref={node=>{if(node)node.indeterminate=selected.length>0&&selected.length<ids.length;}}
          onChange={event=>setSelection({batchId:batch.batchId,ids:new Set(event.target.checked?ids:[])})}/>
          <span>全选模型</span>{selected.length>0&&<span className="me-muted">已选 {selected.length}</span>}
        </label>
        <div className="me-inline-actions">
          {canResume&&<ActionButton kind={active?'':'primary'} icon="play" hintSide="below" unavailableReason={controlUnavailable}
            onClick={()=>controlModels(batch,toResume,'resume')}>{selected.length?'继续所选':'继续全部'}</ActionButton>}
          {active&&toPause.length>0&&<ActionButton icon="pause" hintSide="below" unavailableReason={controlUnavailable}
            onClick={()=>selected.length?controlModels(batch,toPause,'hold'):changeBatch(batch.batchId,'pause')}>
            {pendingBatchAction==='pause'?'正在保存进度…':selected.length?'暂停所选':'暂停全部'}
          </ActionButton>}
        </div>
      </div>}
      <BatchRuns batch={batch} runs={runs} report={props.report} unavailableReason={controlUnavailable}
        pending={pending?.batchId===batch.batchId?pending:undefined}
        {...(runs.length>1?{selection:{eligible:new Set(ids),selected:selectedIds,toggle:(id:string)=>{
          const next=new Set(selectedIds);if(next.has(id))next.delete(id);else next.add(id);
          setSelection({batchId:batch.batchId,ids:next});
        }}}:{})}
        setConcurrency={async(runId,concurrency)=>!!await props.actQueue(()=>props.api('setRunConcurrency',{batchId:batch.batchId,runId,concurrency}))}
        control={(runId,operation)=>{
          if(operation==='resume'||operation==='hold'){controlModels(batch,[runId],operation,runId);return;}
          setPending({batchId:batch.batchId,runId,operation});
          void props.actQueue(()=>props.api('controlRun',{batchId:batch.batchId,runId,operation})).then(view=>{
            if(!active&&view?.activeBatchId===batch.batchId)moveToCurrent(batch.batchId);
          }).finally(()=>setPending(undefined));
        }}/>
    </section>;
  }

  function renderPending(){
    return <ul className="me-card me-batch-records" aria-label="待处理批次">
      {pendingBatches.map(batch=>{
        const runs=runsFor(batch);
        const {graded,required}=readBatchProgress(runs);
        const id=batch.batchId;
        const open=expanded===id;
        const progress=<>
          <span className="dsh-sr-only">已判分</span>
          <DataValue value={required?graded:'—'} unit={required?`/ ${required.toLocaleString('zh-CN')} 题`:undefined}/>
        </>;
        return <BatchRecord key={id} batchId={id} runs={runs} createdAt={batch.createdAt} status={batchStatus(batch)}
          readout={progress} open={open} toggle={()=>setExpanded(open?undefined:id)}>
          {open&&renderBatch(batch,runs)}
        </BatchRecord>;
      })}
    </ul>;
  }

  return <div className="me-task-workbench" ref={workbench}>
    <div className="me-task-list-bar">
      {activeBatch?<SelectionBar<TaskTab> label="评测任务视图" value={selectedTab} panelId={panelId} tabs={taskTabs} onChange={setTab}/>:
        <div className="me-count-heading">
          <h2>待处理</h2>
          <CountBadge count={pendingBatches.length} description={`${pendingBatches.length} 个批次`}/>
        </div>}
      <div className="me-inline-actions">
        <Button kind="text" className="me-local-refresh" icon="refresh" aria-label="刷新评测任务" title="刷新评测任务" onClick={()=>void props.refresh()} disabled={props.busy}/>
        <ActionButton hintSide="below" kind="primary" icon="plus" onClick={props.newRun} unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>
      </div>
    </div>
    <div id={panelId} role={activeBatch?'tabpanel':undefined} aria-labelledby={activeBatch?`${panelId}-${selectedTab}`:undefined} tabIndex={activeBatch?0:undefined}>
      {selectedTab==='current'&&activeBatch?renderBatch(activeBatch,runsFor(activeBatch)):
        pendingBatches.length?renderPending():
        <div className="me-card me-task-no-records"><span>暂无待处理评测</span>{hasHistory&&historyLink}</div>}
    </div>
  {changing&&<Modal title={t.resumeJudge} onClose={()=>setChanging(undefined)} locked={props.busy}><div className="me-dialog-body"><ConfigEditor draft={judge} models={props.data.models} modelsLoading={!!props.data.modelsLoading} api={props.api} change={setJudge} reportError={setError} label={t.judge}/><p className="me-help">{t.resumeJudgeHelp}</p>{error&&<p role="alert">{error}</p>}</div><footer className="me-dialog-foot"><Button onClick={()=>setChanging(undefined)}>{t.cancel}</Button><ActionButton kind="primary" disabled={props.busy} unavailableReason={!judge.snapshot?'请先选择写作裁判。':resumeUnavailable} onClick={()=>void props.act(async()=>{const judgeHandle=await resolveDraft(props.api,judge);await props.api('resume',{batchId:changing,judgeHandle});moveToCurrent(changing);setChanging(undefined);})}>{t.resume}</ActionButton></footer></Modal>}</div>;
}
