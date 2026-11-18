import {StorageBasis} from '../components/Disclosure.tsx';
import {CountBadge,SelectedStorage,StorageValue} from '../components/DataReadout.tsx';
import {BatchRecord} from '../components/BatchRecord.tsx';
import {SelectionBar} from '../components/SelectionBar.tsx';
import {TimingHistory} from '../components/TimingHistory.tsx';
import {SpeedHistory} from '../components/SpeedHistory.tsx';
import * as React from 'react';import type {CleanupPreview,RunUsage} from '../../history/cleanup.ts';import {ActionButton,activityUnavailable,Button,Empty,Modal,Badge,BatchRunRow,type PageProps} from '../ui.tsx';import {zh as t} from '../locales.ts';import {formatBytes} from '../store.ts';
import type {RunSummary} from '../../contracts.ts';
import {summarizeBatchMetrics} from '../batch-metrics.ts';
import {BatchMetrics} from '../components/BatchMetrics.tsx';
import {batchRunStatus,batchStatus,runIsComplete,taskBatches} from '../task-batches.ts';
import type {BatchView} from '../../jobs/queue.ts';
interface Operation {operationId:string;status:string;plannedBytes:number;deletedBytes:number;unconfirmedBytes:number;remainingBytes:number;failedFiles:number}
const historyTabs=[{id:'formal',label:t.speed.formal},{id:'speed',label:t.speed.history},{id:'timing',label:'估时记录'}] as const;
export function History(props:PageProps){
  const [tab,setTab]=React.useState<(typeof historyTabs)[number]['id']>('formal'),panelId=React.useId();
  return <div className="me-history-view">
    <SelectionBar<(typeof historyTabs)[number]["id"]> label="历史类型" value={tab} panelId={panelId} tabs={historyTabs} onChange={setTab}/>
    <div className="me-history-content" id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`} tabIndex={0}>
      {tab==='formal'?<FormalHistory {...props} key={props.data.status.rootId}/>:tab==='timing'?<TimingHistory {...props} key={props.data.status.rootId}/>:<SpeedHistory {...props} key={props.data.status.rootId}/>}
    </div>
  </div>;
}
function FormalHistory(props:PageProps){const [usage,setUsage]=React.useState<{runs:RunUsage[]}>(),[selected,setSelected]=React.useState<string[]>([]),[preview,setPreview]=React.useState<CleanupPreview>(),[operation,setOperation]=React.useState<Operation>(),[working,setWorking]=React.useState(false);
  const [expanded,setExpanded]=React.useState<string>();
  const cleanupTrigger=React.useRef<HTMLButtonElement|null>(null);
  const measure=React.useCallback(async()=>setUsage(await props.api<{runs:RunUsage[]}>('formalHistoryUsage')),[props.api]);
  React.useEffect(()=>{void measure().catch(()=>{});},[measure,props.data.runs.length]);
  const runsByBatch=new Map<string,RunSummary[]>();
  for(const run of props.data.runs){
    const batch=runsByBatch.get(run.batchId);
    if(batch)batch.push(run);
    else runsByBatch.set(run.batchId,[run]);
  }
  const queueById=new Map(props.data.queue.batches.map(batch=>[batch.batchId,batch]));
  const batches=[...runsByBatch].map(([id,runs])=>{
    const firstRunAt=runs.reduce<string|undefined>((first,run)=>
      run.createdAt&&(!first||run.createdAt<first)?run.createdAt:first,undefined);
    return {id,runs,createdAt:queueById.get(id)?.createdAt??firstRunAt};
  }).sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||a.id.localeCompare(b.id));

  const {active:activeBatch,pending:pendingBatches}=taskBatches(props.data.queue,props.data.runs);
  const taskIds=new Set(pendingBatches.map(batch=>batch.batchId));
  if(activeBatch)taskIds.add(activeBatch.batchId);
  const usageByBatch=new Map<string,{detailBytes:number;totalBytes:number}>();
  for(const run of usage?.runs??[]){
    const totals=usageByBatch.get(run.batchId)??{detailBytes:0,totalBytes:0};
    totals.detailBytes+=run.detailBytes;
    totals.totalBytes+=run.totalBytes;
    usageByBatch.set(run.batchId,totals);
  }
  const chosen=selected.reduce((total,id)=>total+(usageByBatch.get(id)?.detailBytes??0),0);
  React.useEffect(()=>{if(!working||!preview)return;const timer=setInterval(()=>void props.api<Operation|null>('cleanupStatus',{token:preview.token}).then(op=>{if(op)setOperation(op);}).catch(()=>{}),500);return()=>clearInterval(timer);},[working,preview,props.api]);
  async function clean(){if(!preview)return;setWorking(true);const result=await props.act(()=>props.api<Operation>('commitCleanup',{token:preview.token}));if(result){setOperation(result);setSelected([]);}setWorking(false);await measure().catch(()=>{});}
  const refreshHistory=<Button kind="text" icon="refresh" onClick={()=>void props.act(measure)} disabled={props.busy||working}>刷新评测记录</Button>;
  const cleanupUnavailable=!props.data.status.writable?'数据目录为只读，无法清理记录。':
    activityUnavailable(props.data.status,props.data.queue.activeBatchId)??(props.busy?'正在处理当前操作，请稍候。':
    !usage?'正在读取记录占用，请稍候。':!selected.length?'请先选择要清理的评测批次。':!chosen?'所选批次没有可清理的明细。':undefined);
  if(!batches.length)return <Empty title={t.noHistory} body={t.noHistoryBody}>{refreshHistory}</Empty>;
  return <><div className="me-section-bar me-history-toolbar">
    <div className="me-history-readouts">
      <div className="me-count-heading"><h2>评测批次</h2><CountBadge count={batches.length} description={`${batches.length} 个批次`}/></div>
      <SelectedStorage bytes={selected.length&&usage?chosen:undefined}/>
    </div>
    <div className="me-inline-actions">{refreshHistory}<ActionButton kind={selected.length?'danger':''} icon="trash" unavailableReason={cleanupUnavailable} onClick={event=>{
      cleanupTrigger.current=event.currentTarget;
      void props.act(async()=>{
        const value=await props.api<CleanupPreview>('previewCleanup',{batchIds:selected});
        setPreview(value);setOperation(undefined);
        return value;
      });
    }}>{t.cleanSelected}</ActionButton></div>
  </div>
  <div className="me-history-help"><StorageBasis/></div>
  <ul className="me-card me-batch-records" aria-label="评测批次">
    {batches.map(({id,runs,createdAt})=>{
      const active=props.data.queue.activeBatchId===id;
      const task=taskIds.has(id)?queueById.get(id):undefined;
      const allComplete=runs.every(runIsComplete);
      const status=task?batchStatus(task,active):active?'running':allComplete?'completed':'ended';
      const bytes=usageByBatch.get(id);
      const open=expanded===id;
      return <BatchRecord key={id} batchId={id} runs={runs} createdAt={createdAt} status={status}
        readout={<><span className="dsh-sr-only">记录占用</span>
          {usage?<StorageValue bytes={bytes?.totalBytes??0}/>:'—'}</>}
        open={open} toggle={()=>setExpanded(open?undefined:id)}
        selection={{
          checked:selected.includes(id),
          disabled:active||!bytes?.detailBytes||!props.data.status.writable||working,
          change:checked=>setSelected(old=>checked?[...old,id]:old.filter(value=>value!==id)),
        }}>
        <HistoryBatchDetails runs={runs} allComplete={allComplete} task={task} active={active} report={props.report}
          openTask={()=>props.navigate('jobs',id)}/>
      </BatchRecord>;
    })}
  </ul>
  {preview&&<Modal title={operation?(operation.status==='completed'?t.cleanDone:t.cleanPartial):t.cleanTitle} onClose={()=>setPreview(undefined)} returnFocusTo={cleanupTrigger.current} locked={working}><div className="me-dialog-body"><p>{t.cleanBody}</p>{preview.runs.some(x=>x.losesResume)&&<div className="me-inline-warning">{t.loseResume}</div>}<div className="me-clean-number"><span>{operation?t.actuallyDeleted:t.estimated}</span><strong aria-live="polite">{formatBytes(operation?.deletedBytes??preview.bytes)}</strong></div>{working&&<progress max={preview.bytes||1} value={operation?.deletedBytes??0}/>}<div className="me-storage-row"><span>{t.selected}</span><b>{preview.batchIds.length} {t.batch} / {preview.runs.length} {t.run}</b></div>{operation&&<><div className="me-storage-row"><span>{t.cleanPlanned}</span><b>{formatBytes(operation.plannedBytes)}</b></div><div className="me-storage-row"><span>{t.remaining}</span><b>{formatBytes(operation.remainingBytes)}</b></div>{operation.unconfirmedBytes>0&&<div className="me-storage-row"><span>{t.uncertain}</span><b>{formatBytes(operation.unconfirmedBytes)}</b></div>}</>}<p className="me-help">{t.keepSummary}</p></div><footer className="me-dialog-foot"><Button onClick={()=>setPreview(undefined)} disabled={working}>{operation?t.close:t.cancel}</Button>{operation?.status!=='completed'&&<Button kind="danger" icon="trash" onClick={()=>void clean()} disabled={working}>{working?t.cleaning:operation?t.cleanRetry:t.cleanConfirm}</Button>}</footer></Modal>}</>;
}

function HistoryBatchDetails({runs,allComplete,task,active,report,openTask}:{
  runs:RunSummary[];
  allComplete:boolean;
  task:BatchView|undefined;
  active:boolean;
  report(runId:string):void;
  openTask():void;
}){
  const bothTracks=runs.some(run=>run.tracks.general)&&runs.some(run=>run.tracks.writing);
  const identicalNames=new Map<string,number>();
  const modelKey=(run:RunSummary)=>JSON.stringify([run.target.modelId,run.target.providerId,run.target.deployment?.value]);
  for(const run of runs){
    const key=modelKey(run);
    identicalNames.set(key,(identicalNames.get(key)??0)+1);
  }
  return <div className="me-history-record-detail">
    {task?<div className="me-history-record-actions">
      <Button kind="text" icon="arrow" onClick={openTask}>前往任务</Button>
    </div>:!active&&<div className="me-history-record-metrics">
      <BatchMetrics metrics={summarizeBatchMetrics(runs.map(run=>run.metrics),false,0)}
        newWork={runs.some(run=>!!run.reuse)}/>
    </div>}
    <div className="me-run-list" role="list" aria-label={t.model}>
      {runs.map((run,index)=>{
        const detailStatus=run.details==='cleared'?t.cleared:run.details==='partial'?t.partial:
          run.details!=='available'?t.unavailable:undefined;
        const status=detailStatus?<span className="me-muted">{detailStatus}</span>:
          allComplete?null:<Badge status={task?batchRunStatus(task,run):runIsComplete(run)?'completed':'ended'}/>;
        return <BatchRunRow key={run.runId} run={run} index={index} bothTracks={bothTracks} report={report}
          showParams={(identicalNames.get(modelKey(run))??0)>1} status={status}/>;
      })}
    </div>
  </div>;
}
