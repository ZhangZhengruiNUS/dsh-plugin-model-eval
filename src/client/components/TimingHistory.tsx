import {RecordRow} from './BatchRecord.tsx';
import {DataValue,SelectedStorage,StorageReadout,StorageValue} from './DataReadout.tsx';
import {Disclosure} from './Disclosure.tsx';
import {zh as t} from '../locales.ts';
import * as React from 'react';import {ActionButton,activityUnavailable,Button,Empty,Modal,type PageProps} from '../ui.tsx';import {formatBytes} from '../store.ts';import {timingCleanupIds,type TimingGroup} from '../../estimation/timing-groups.ts';import type {TimingCleanupPreview,TimingCleanupResult} from '../../estimation/calibration-contracts.ts';
interface View {groups:TimingGroup[];traces:{traceId:string;bytes:number}[];totalBytes:number}
export function TimingHistory(props:PageProps){
 const [data,setData]=React.useState<View>(),[selected,setSelected]=React.useState<string[]>([]),[preview,setPreview]=React.useState<TimingCleanupPreview>(),[result,setResult]=React.useState<TimingCleanupResult>(),[working,setWorking]=React.useState(false),[error,setError]=React.useState('');
 const [expanded,setExpanded]=React.useState<string>();
 const cleanupTrigger=React.useRef<HTMLButtonElement|null>(null);
 const requestSequence=React.useRef(0);
 const refresh=React.useCallback(async()=>{const sequence=++requestSequence.current,next=await props.api<View>('timingHistory');if(sequence!==requestSequence.current)return;setData(next);setSelected(ids=>ids.filter(id=>next.groups.some(g=>g.id===id)));},[props.api]);
 React.useEffect(()=>{void refresh().catch(e=>setError(e.message));const timer=props.data.status.activeActivity?setInterval(()=>void refresh().catch(()=>{}),5000):undefined;return()=>{if(timer)clearInterval(timer);requestSequence.current++;};},[refresh,props.data.status.activeActivity?.id,props.data.status.activeActivity?.state]);
 const busy=working||props.busy||!!props.data.status.activeActivity||!!props.data.queue.activeBatchId,bytes=new Map(data?.traces.map(t=>[t.traceId,t.bytes]));let cleanIds:string[]=[];try{if(data&&selected.length)cleanIds=timingCleanupIds(data.groups,selected);}catch{/* A changing or active selection needs a fresh preview. */}const chosen=cleanIds.reduce((n,id)=>n+(bytes.get(id)??0),0);
 async function prepare(){
   setError('');
   const next=await props.act(()=>props.api<TimingCleanupPreview>('previewTimingCleanup',{groupIds:selected}));
   if(next){setPreview(next);setResult(undefined);}
 }
 async function clean(){if(!preview||working)return;setWorking(true);setError('');try{const op=await props.api<TimingCleanupResult>('commitTimingCleanup',{token:preview.token});setResult(op);if(op.status==='completed')setSelected([]);}catch(e){setError((e as Error).message);}finally{setWorking(false);await refresh().catch(e=>setError(e.message));void props.act(async()=>true);}}
 return <>{error&&<p role="alert" className="me-inline-warning">{error}</p>}{!data?<p>正在读取估时记录…</p>:!data.groups.length?<Empty title="尚无估时记录" body="测速和评测会自动积累本机参照，用于后续估时。"/>:<>
  <div className="me-section-bar me-history-toolbar">
    <div className="me-history-readouts">
      <StorageReadout label="估时记录占用" bytes={data.totalBytes} testId="timing-total-bytes"/>
      <SelectedStorage bytes={selected.length?chosen:undefined} testId="timing-selected-bytes"/>
    </div>
    <ActionButton icon="trash" kind={selected.length?'danger':''} disabled={working} unavailableReason={!props.data.status.writable?'数据目录为只读，无法清理记录。':activityUnavailable(props.data.status,props.data.queue.activeBatchId)??(props.busy?'正在处理当前操作，请稍候。':!selected.length?'请先选择要清理的估时记录。':!chosen?'所选记录没有可单独清理的明细。':undefined)} onClick={event=>{cleanupTrigger.current=event.currentTarget;void prepare();}}>清理估时记录</ActionButton>
  </div>
  <div className="me-history-help"><Disclosure kind="help" title="清理范围"><p>清理后保留成绩和报告，后续估时将不再使用已删除的参照。仍被其他评测引用的测速会保留。</p></Disclosure></div>
  <ul className="me-card me-batch-records" aria-label="估时记录">
    {data.groups.map(group=>{
      const {id,active,traceIds}=group,open=expanded===id;
      const run=group.kind==='run'?props.data.runs.find(row=>row.runId===id):undefined;
      const ownIds=active?[]:timingCleanupIds(data.groups,[id]);
      const totalBytes=traceIds.reduce((total,traceId)=>total+(bytes.get(traceId)??0),0);
      const ownBytes=ownIds.reduce((total,traceId)=>total+(bytes.get(traceId)??0),0);
      return <RecordRow key={id} label={(group.kind==='run'?'评测 ':'独立测速 ')+id.slice(0,8)}
        createdAt={group.createdAt} subtitle={run?{text:run.target.modelId}:undefined} status={active?'running':undefined}
        count={<DataValue value={traceIds.length} unit="份"/>}
        readout={<><span className="dsh-sr-only">{active?"计时数据占用":"可单独清理"}</span><StorageValue bytes={active?totalBytes:ownBytes}/></>}
        open={open} toggle={()=>setExpanded(open?undefined:id)} selection={{
          checked:selected.includes(id),disabled:active||busy||!props.data.status.writable,
          change:checked=>setSelected(ids=>checked?[...ids,id]:ids.filter(value=>value!==id)),
        }}>
        <div className="me-record-details">
          {active?<p className="me-help">计时记录结束后可查看清理范围。</p>:
            <dl className="me-history-facts">
              <div><dt>本组计时占用</dt><dd><StorageValue bytes={totalBytes}/></dd></div>
              {traceIds.length>ownIds.length&&<div><dt>与其他组共用</dt><dd><DataValue value={traceIds.length-ownIds.length} unit="份"/></dd></div>}
            </dl>}
        </div>
      </RecordRow>;
    })}
  </ul>
 </>}{preview&&<Modal title={result?.status==='completed'?'估时记录已清理':'清理估时记录'} locked={working} onClose={()=>setPreview(undefined)} returnFocusTo={cleanupTrigger.current}><div className="me-dialog-body"><p>删除所选计时数据及不再共用的测速参照。成绩、逐题明细和报告中的预估快照保留。</p><div className="me-clean-number"><span>{result?'实际删除':'预计释放'}</span><strong aria-live="polite">{formatBytes(result?.deletedBytes??preview.bytes)}</strong></div><p className="me-help">{preview.traceIds.length} 份记录</p>{working&&<p role="status">正在清理并核对占用…</p>}{result?.status==='partial'&&<p role="alert">尚余 {formatBytes(result.remainingBytes)} 未清理，可重试。</p>}{!!result?.unconfirmedBytes&&<p className="me-help">{formatBytes(result.unconfirmedBytes)} 已不存在，未计入实际删除量。</p>}</div><footer className="me-dialog-foot"><Button disabled={working} onClick={()=>setPreview(undefined)}>{result?.status==='completed'?'关闭':'取消'}</Button>{result?.status!=='completed'&&<Button kind="danger" disabled={working} onClick={()=>void clean()}>{working?'清理中…':result?'重试清理':'确认清理'}</Button>}</footer></Modal>}</>;
}
