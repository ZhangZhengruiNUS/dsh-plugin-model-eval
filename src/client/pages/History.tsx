import {StorageBasis} from '../components/Disclosure.tsx';
import {CountBadge,DataValue,SelectedStorage,StorageValue} from '../components/DataReadout.tsx';
import {Checkbox} from '../primitives/primitives.tsx';
import {SelectionBar} from '../components/SelectionBar.tsx';
import {TimingHistory} from '../components/TimingHistory.tsx';
import {SpeedHistory} from '../components/SpeedHistory.tsx';
import * as React from 'react';import type {CleanupPreview,RunUsage} from '../../history/cleanup.ts';import {ActionButton,activityUnavailable,Button,Empty,Modal,Badge,ModelLabel,type PageProps} from '../ui.tsx';import {zh as t} from '../locales.ts';import {formatBytes,formatScore,time} from '../store.ts';
interface Operation {operationId:string;status:string;plannedBytes:number;deletedBytes:number;unconfirmedBytes:number;remainingBytes:number;failedFiles:number}
const historyTabs=[{id:'formal',label:t.speed.formal},{id:'speed',label:t.speed.history},{id:'timing',label:'估时记录'}] as const;
export function History(props:PageProps){
  const [tab,setTab]=React.useState<(typeof historyTabs)[number]['id']>('formal'),panelId=React.useId();
  return <div className="me-history-view">
    <SelectionBar<(typeof historyTabs)[number]["id"]> label="历史类型" value={tab} panelId={panelId} tabs={historyTabs} onChange={setTab}/>
    <div className="me-history-content" id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`} tabIndex={0}>
      {tab==='formal'?<FormalHistory {...props} key={props.data.status.rootId}/>:tab==='timing'?<TimingHistory {...props} key={props.data.status.rootId}/>:<SpeedHistory key={props.data.status.rootId} api={props.api} writable={props.data.status.writable} {...(props.data.status.activeActivity?{activeActivity:props.data.status.activeActivity}:{})} onRefresh={()=>void props.act(async()=>true)}/>}
    </div>
  </div>;
}
function FormalHistory(props:PageProps){const [usage,setUsage]=React.useState<{runs:RunUsage[]}>(),[selected,setSelected]=React.useState<string[]>([]),[preview,setPreview]=React.useState<CleanupPreview>(),[operation,setOperation]=React.useState<Operation>(),[working,setWorking]=React.useState(false);
  const cleanupTrigger=React.useRef<HTMLButtonElement|null>(null);
  const measure=React.useCallback(async()=>setUsage(await props.api<{runs:RunUsage[]}>('formalHistoryUsage')),[props.api]);
  React.useEffect(()=>{void measure().catch(()=>{});},[measure,props.data.runs.length]);
  const batches=[...new Set(props.data.runs.map(x=>x.batchId))].reverse(),bytes=(id:string)=>usage?.runs.filter(x=>x.batchId===id).reduce((n,x)=>n+x.detailBytes,0)??0,chosen=selected.reduce((n,id)=>n+bytes(id),0);
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
  <div className="me-batch-list">{batches.map(id=>{const runs=props.data.runs.filter(x=>x.batchId===id),active=props.data.queue.activeBatchId===id,available=bytes(id)>0;return <section className="me-card" key={id}><div className="me-history-heading"><label><Checkbox aria-label={`${t.selected} ${t.batch} ${id.slice(0,8)}`} checked={selected.includes(id)} disabled={active||!available||!props.data.status.writable||working} onChange={e=>setSelected(old=>e.target.checked?[...old,id]:old.filter(x=>x!==id))}/><strong>{t.batch} {id.slice(0,8)}</strong></label><div className="me-record-meta">
    <time dateTime={runs[0]?.createdAt}>{time(runs[0]?.createdAt)}</time>
    <DataValue value={runs.length} unit={t.roundCount}/>
  </div>
  <b>{usage?<StorageValue bytes={usage.runs.filter(x=>x.batchId===id).reduce((n,x)=>n+x.totalBytes,0)}/>:'—'}</b></div>
  {runs.map(run=><div className="me-history-row" key={run.runId}><ModelLabel target={run.target}/><div className="me-history-scores">{run.tracks.general&&<span>{t.general}{run.generalDefinition?.tier==='light'?' · 轻量':run.generalDefinition?.tier==='deep'?' · 深入':' · 旧版基线'} <b>{formatScore(run.tracks.general.score)}</b></span>}{run.tracks.writing&&<span>{t.writing} <b>{formatScore(run.tracks.writing.score)}</b></span>}</div>{run.details!=='available'?<span className="me-muted">{run.details==='cleared'?t.cleared:t.partial}</span>:<Badge status={active?'running':Object.values(run.tracks).every(x=>x.status==='completed')?'completed':'pending'}/>}<Button onClick={()=>props.report(run.runId)}>{t.report}</Button></div>)}</section>;})}</div>
  {preview&&<Modal title={operation?(operation.status==='completed'?t.cleanDone:t.cleanPartial):t.cleanTitle} onClose={()=>setPreview(undefined)} returnFocusTo={cleanupTrigger.current} locked={working}><div className="me-dialog-body"><p>{t.cleanBody}</p>{preview.runs.some(x=>x.losesResume)&&<div className="me-inline-warning">{t.loseResume}</div>}<div className="me-clean-number"><span>{operation?t.actuallyDeleted:t.estimated}</span><strong aria-live="polite">{formatBytes(operation?.deletedBytes??preview.bytes)}</strong></div>{working&&<progress max={preview.bytes||1} value={operation?.deletedBytes??0}/>}<div className="me-storage-row"><span>{t.selected}</span><b>{preview.batchIds.length} {t.batch} / {preview.runs.length} {t.run}</b></div>{operation&&<><div className="me-storage-row"><span>{t.cleanPlanned}</span><b>{formatBytes(operation.plannedBytes)}</b></div><div className="me-storage-row"><span>{t.remaining}</span><b>{formatBytes(operation.remainingBytes)}</b></div>{operation.unconfirmedBytes>0&&<div className="me-storage-row"><span>{t.uncertain}</span><b>{formatBytes(operation.unconfirmedBytes)}</b></div>}</>}<p className="me-help">{t.keepSummary}</p></div><footer className="me-dialog-foot"><Button onClick={()=>setPreview(undefined)} disabled={working}>{operation?t.close:t.cancel}</Button>{operation?.status!=='completed'&&<Button kind="danger" icon="trash" onClick={()=>void clean()} disabled={working}>{working?t.cleaning:operation?t.cleanRetry:t.cleanConfirm}</Button>}</footer></Modal>}</>;
}
