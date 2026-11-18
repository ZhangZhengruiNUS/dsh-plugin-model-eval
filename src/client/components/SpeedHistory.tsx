import {Disclosure,StorageBasis} from './Disclosure.tsx';
import {DataValue,SelectedStorage,StorageReadout,StorageValue} from './DataReadout.tsx';
import {RecordRow} from './BatchRecord.tsx';
import * as React from 'react';
import type {SpeedSession} from '../../estimation/contracts.ts';
import type {SpeedCleanupOperation,SpeedCleanupPreview} from '../../history/speed-cleanup.ts';
import type {HistoryUsage} from '../../history/cleanup.ts';
import {ActionButton,activityUnavailable,Button,Empty,Modal,ModelLabel,type PageProps} from '../ui.tsx';
import {zh as t} from '../locales.ts';
import {formatBytes} from '../store.ts';
import {estimateDisplay,formatSpeedBudget,missingStageLabels,speedUsage} from '../estimation-view.ts';
export function SpeedHistory(props:PageProps){
 const {api,busy:pageBusy}=props,{status,queue}=props.data,{writable,activeActivity}=status;
 const unavailable=activityUnavailable(status,queue.activeBatchId);
 const [expanded,setExpanded]=React.useState<string>();
 const cleanupTrigger=React.useRef<HTMLButtonElement|null>(null);
 const onRefresh=()=>void props.act(async()=>true);
 const [rows,setRows]=React.useState<SpeedSession[]>([]),[usage,setUsage]=React.useState<Pick<HistoryUsage,'previews'>>(),[selected,setSelected]=React.useState<string[]>([]),[preview,setPreview]=React.useState<SpeedCleanupPreview>(),[operation,setOperation]=React.useState<SpeedCleanupOperation>(),[working,setWorking]=React.useState(false),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true);
 const refresh=React.useCallback(async()=>{const [items,bytes]=await Promise.all([api<SpeedSession[]>('speedHistory'),api<Pick<HistoryUsage,'previews'>>('speedHistoryUsage')]);setRows(items);setUsage(bytes);setSelected(ids=>ids.filter(id=>items.some(row=>row.previewId===id)));setLoading(false);},[api]);
 React.useEffect(()=>{void refresh().catch(e=>{setError(e.message);setLoading(false);});},[refresh,activeActivity?.id,activeActivity?.state]);
 React.useEffect(()=>{if(!working||!preview)return;const timer=setInterval(()=>void api<SpeedCleanupOperation|null>('speedCleanupStatus',{token:preview.token}).then(op=>{if(op)setOperation(op);}).catch(()=>{}),500);return()=>clearInterval(timer);},[working,preview,api]);
 const bytes=(id:string)=>usage?.previews?.find(x=>x.previewId===id)?.totalBytes??0,chosen=selected.reduce((n,id)=>n+bytes(id),0),busy=working||pageBusy||!!unavailable;
 async function prepare(){
   setError('');
   const next=await props.act(()=>api<SpeedCleanupPreview>('previewSpeedCleanup',{previewIds:selected}));
   if(next){setPreview(next);setOperation(undefined);}
 }
 async function clean(){if(!preview||working)return;setWorking(true);setError('');try{const pending=api<SpeedCleanupOperation>('commitSpeedCleanup',{token:preview.token});onRefresh();const op=await pending;setOperation(op);if(op.status==='completed')setSelected([]);}catch(e){setError((e as Error).message);}finally{setWorking(false);await refresh().catch(e=>setError(e.message));onRefresh();}}
 return <>{error&&<p role="alert" className="me-inline-warning">{error}</p>}{loading?<p>{t.loading}</p>:!rows.length?<Empty title={t.speed.none} body={t.speed.empty}/>:<>
  <div className="me-section-bar me-history-toolbar">
    <div className="me-history-readouts">
      <StorageReadout label="测速记录占用" bytes={usage?.previews?.reduce((n,x)=>n+x.totalBytes,0)??0}/>
      <SelectedStorage bytes={selected.length?chosen:undefined} testId="speed-clean-bytes"/>
    </div>
    <ActionButton icon="trash" kind={selected.length?'danger':''} disabled={working} unavailableReason={!writable?'数据目录为只读，无法清理记录。':unavailable??(pageBusy?'正在处理当前操作，请稍候。':!selected.length?'请先选择要清理的测速记录。':!chosen?'所选记录没有可清理的明细。':undefined)} onClick={event=>{cleanupTrigger.current=event.currentTarget;void prepare();}}>{t.speed.clean}</ActionButton>
  </div>
  <div className="me-speed-history-help"><StorageBasis/><Disclosure kind="help" title="耗时预估口径"><p>测速用量单列，不计入能力成绩。{t.speed.range}</p></Disclosure></div>
  <ul className="me-card me-batch-records" aria-label="测速记录">
    {[...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>{
      const id=row.previewId,open=expanded===id,active=row.status==='running'||row.status==='stopping';
      const models=[...new Set(row.configs.map(config=>config.target.modelId))];
      return <RecordRow key={id} label={'测速 '+id.slice(0,8)} createdAt={row.createdAt} status={row.status}
        subtitle={models.length?{text:models.slice(0,2).join(' · ')+(models.length>2?' …':''),title:models.join(' · ')}:undefined}
        count={<DataValue value={row.configs.length} unit={t.configCount}/>}
        readout={<><span className="dsh-sr-only">记录占用</span>{usage?<StorageValue bytes={bytes(id)}/>:'—'}</>}
        open={open} toggle={()=>setExpanded(open?undefined:id)} selection={{
          checked:selected.includes(id), disabled:!writable||busy||active||!bytes(id),
          change:checked=>setSelected(ids=>checked?[...ids,id]:ids.filter(value=>value!==id)),
        }}>
        <SpeedRecordDetails row={row} active={active}/>
      </RecordRow>;
    })}
  </ul>
 </>}{preview&&<Modal title={operation?operation.status==='completed'?t.cleanDone:t.cleanPartial:t.speed.clean} onClose={()=>setPreview(undefined)} locked={working} returnFocusTo={cleanupTrigger.current}><div className="me-dialog-body"><p>{t.speed.cleanBody}</p><div className="me-clean-number"><span>{operation?t.actuallyDeleted:t.estimated}</span><strong aria-live="polite">{formatBytes(operation?.deletedBytes??preview.bytes)}</strong></div>{working&&<progress max={preview.bytes||1} value={operation?.deletedBytes??0}/>}<div className="me-storage-row"><span>{t.selected}</span><b>{preview.previewIds.length} 条测速记录</b></div>{operation&&<><div className="me-storage-row"><span>{t.cleanPlanned}</span><b>{formatBytes(operation.plannedBytes)}</b></div><div className="me-storage-row"><span>{t.remaining}</span><b>{formatBytes(operation.remainingBytes)}</b></div>{operation.unconfirmedBytes>0&&<div className="me-storage-row"><span>{t.uncertain}</span><b>{formatBytes(operation.unconfirmedBytes)}</b></div>}</>}{error&&<p role="alert">{error}</p>}</div><footer className="me-dialog-foot"><Button onClick={()=>setPreview(undefined)} disabled={working}>{operation?t.close:t.cancel}</Button>{operation?.status!=='completed'&&<Button kind="danger" onClick={()=>void clean()} disabled={busy}>{working?t.cleaning:operation?t.cleanRetry:'确认清理'}</Button>}</footer></Modal>}</>;
}

function SpeedRecordDetails({row,active}:{row:SpeedSession;active:boolean}){
  const display=estimateDisplay(row.estimate,'preview'),used=speedUsage(row);
  const missing=!active&&display.kind==='missing';
  const partial=!active&&display.kind==='partial';
  const text=missing?'无可用预估':partial?display.text.replace('＋待校准',''):display.text;
  const description=missing?(row.estimate?.reasons.includes('NO_APPLICABLE_BASELINE')?'本次测速缺少匹配的历史参照。':undefined):
    partial&&row.estimate?'缺少样本的阶段：'+(missingStageLabels(row.estimate).join('、')||'部分任务')+'。':
    active?display.description:undefined;
  return <div className="me-record-details">
    <dl className="me-history-facts">
      <div><dt>{display.title}</dt><dd><DataValue value={text}/></dd></div>
      <div><dt>测速 Token</dt><dd><DataValue value={used.total??'—'}/>{used.partial&&<small>{t.partialUsage}</small>}</dd></div>
      <div><dt>每配置预算</dt><dd><DataValue value={formatSpeedBudget(row.budgetMinutes)}/></dd></div>
    </dl>
    {description&&<p className="me-help">{description}</p>}
    <Disclosure kind="help" title="配置与测速条件">
      {row.configs.map((c,i)=><div className="me-condition-card" key={i}>
        <ModelLabel target={c.target} showParams/>
        <p className="me-help">并发 {c.execution.concurrency} · {c.execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'} {c.execution.callTimeoutMs/1000} 秒 · {c.tracks.map(track=>track==='general'?t.general:t.writing).join('、')}</p>
        {c.judge&&<><span className="me-help">{t.judge}</span><ModelLabel target={c.judge.target} showParams/></>}
        <p className="me-help">{c.performance.samples.filter(sample=>sample.phase!=='local-grade').length} 次完整调用 · {c.performance.recentFailures?.filter(sample=>sample.phase!=='local-grade').length??0} 次未正常完成</p>
        <pre>{JSON.stringify(c.protocols,null,2)}</pre>
      </div>)}
    </Disclosure>
  </div>;
}
