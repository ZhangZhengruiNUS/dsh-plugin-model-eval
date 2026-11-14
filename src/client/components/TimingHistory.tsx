import {Checkbox} from '../primitives/primitives.tsx';
import {DataValue,SelectedStorage,StorageReadout,StorageValue} from './DataReadout.tsx';
import {Disclosure} from './Disclosure.tsx';
import {zh as t} from '../locales.ts';
import * as React from 'react';import {ActionButton,activityUnavailable,Button,Empty,Modal,ModelLabel,type PageProps} from '../ui.tsx';import {formatBytes,time} from '../store.ts';import {timingCleanupIds,type TimingGroup} from '../../estimation/timing-groups.ts';import type {TimingCleanupPreview,TimingCleanupResult} from '../../estimation/calibration-contracts.ts';
interface View {groups:TimingGroup[];traces:{traceId:string;bytes:number}[];totalBytes:number}
export function TimingHistory(props:PageProps){
 const [data,setData]=React.useState<View>(),[selected,setSelected]=React.useState<string[]>([]),[preview,setPreview]=React.useState<TimingCleanupPreview>(),[result,setResult]=React.useState<TimingCleanupResult>(),[working,setWorking]=React.useState(false),[error,setError]=React.useState('');
 const requestSequence=React.useRef(0);
 const refresh=React.useCallback(async()=>{const sequence=++requestSequence.current,next=await props.api<View>('timingHistory');if(sequence!==requestSequence.current)return;setData(next);setSelected(ids=>ids.filter(id=>next.groups.some(g=>g.id===id)));},[props.api]);
 React.useEffect(()=>{void refresh().catch(e=>setError(e.message));const timer=props.data.status.activeActivity?setInterval(()=>void refresh().catch(()=>{}),5000):undefined;return()=>{if(timer)clearInterval(timer);requestSequence.current++;};},[refresh,props.data.status.activeActivity?.id,props.data.status.activeActivity?.state]);
 const busy=working||props.busy||!!props.data.status.activeActivity||!!props.data.queue.activeBatchId,bytes=new Map(data?.traces.map(t=>[t.traceId,t.bytes]));let cleanIds:string[]=[];try{if(data&&selected.length)cleanIds=timingCleanupIds(data.groups,selected);}catch{/* A changing or active selection needs a fresh preview. */}const chosen=cleanIds.reduce((n,id)=>n+(bytes.get(id)??0),0);
 async function prepare(){setError('');try{setPreview(await props.api<TimingCleanupPreview>('previewTimingCleanup',{groupIds:selected}));setResult(undefined);}catch(e){setError((e as Error).message);}}
 async function clean(){if(!preview||working)return;setWorking(true);setError('');try{const op=await props.api<TimingCleanupResult>('commitTimingCleanup',{token:preview.token});setResult(op);if(op.status==='completed')setSelected([]);}catch(e){setError((e as Error).message);}finally{setWorking(false);await refresh().catch(e=>setError(e.message));void props.act(async()=>true);}}
 return <>{error&&<p role="alert" className="me-inline-warning">{error}</p>}{!data?<p>正在读取估时记录…</p>:!data.groups.length?<Empty title="尚无估时记录" body="测速和评测会自动积累本机参照，用于后续估时。"/>:<>
  <div className="me-section-bar me-history-toolbar">
    <div className="me-history-readouts">
      <StorageReadout label="估时记录占用" bytes={data.totalBytes} testId="timing-total-bytes"/>
      <SelectedStorage bytes={selected.length?chosen:undefined} testId="timing-selected-bytes"/>
    </div>
    <ActionButton icon="trash" kind={selected.length?'danger':''} disabled={working} unavailableReason={!props.data.status.writable?'数据目录为只读，无法清理记录。':activityUnavailable(props.data.status,props.data.queue.activeBatchId)??(props.busy?'正在处理当前操作，请稍候。':!selected.length?'请先选择要清理的估时记录。':!chosen?'所选记录没有可单独清理的明细。':undefined)} onClick={()=>void prepare()}>清理估时记录</ActionButton>
  </div>
  <div className="me-history-help"><Disclosure kind="help" title="清理范围"><p>清理后保留成绩和报告，后续估时将不再使用已删除的参照。仍被其他评测引用的测速会保留。</p></Disclosure></div>
  <div className="me-batch-list">{data.groups.map(g=>{const run=props.data.runs.find(r=>r.runId===g.id),ownBytes=g.active?[]:timingCleanupIds(data.groups,[g.id]);return <section className="me-card me-speed-history" key={g.id}><div className="me-history-heading"><label><Checkbox aria-label={'选择估时 '+g.id.slice(0,8)} checked={selected.includes(g.id)} disabled={g.active||busy||!props.data.status.writable} onChange={e=>setSelected(ids=>e.target.checked?[...ids,g.id]:ids.filter(id=>id!==g.id))}/><strong>{g.kind==='run'?'评测':'独立测速'} {g.id.slice(0,8)}</strong></label><time dateTime={g.createdAt}>{time(g.createdAt)}</time><b>{g.active?'记录中':<StorageValue bytes={ownBytes.reduce((n,id)=>n+(bytes.get(id)??0),0)}/>}</b></div><div className="me-card-body">{run&&<ModelLabel target={run.target}/>}
    <div className="me-record-meta">
      <DataValue value={g.traceIds.length} unit="份计时记录"/>
      {g.kind==='run'&&<span>含关联测速、首轮及补测</span>}
    </div>
  </div></section>;})}</div>
 </>}{preview&&<Modal title={result?.status==='completed'?'估时记录已清理':'清理估时记录'} locked={working} onClose={()=>setPreview(undefined)}><div className="me-dialog-body"><p>删除所选计时数据及不再共用的测速参照。成绩、逐题明细和报告中的预估快照保留。</p><div className="me-clean-number"><span>{result?'实际删除':'预计释放'}</span><strong aria-live="polite">{formatBytes(result?.deletedBytes??preview.bytes)}</strong></div><p className="me-help">{preview.traceIds.length} 份记录</p>{working&&<p role="status">正在清理并核对占用…</p>}{result?.status==='partial'&&<p role="alert">尚余 {formatBytes(result.remainingBytes)} 未清理，可重试。</p>}{!!result?.unconfirmedBytes&&<p className="me-help">{formatBytes(result.unconfirmedBytes)} 已不存在，未计入实际删除量。</p>}</div><footer className="me-dialog-foot"><Button disabled={working} onClick={()=>setPreview(undefined)}>{result?.status==='completed'?'关闭':'取消'}</Button>{result?.status!=='completed'&&<Button kind="danger" disabled={working} onClick={()=>void clean()}>{working?'清理中…':result?'重试清理':'确认清理'}</Button>}</footer></Modal>}</>;
}
