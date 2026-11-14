import {Disclosure} from './Disclosure.tsx';
import * as React from 'react';
import type {CodingDiagnosticRecord,CodingDiagnosticView} from '../../diagnostics/contracts.ts';
import {Button,type PageProps} from '../ui.tsx';
import {time} from '../store.ts';

export function codingDiagnosticOutcome(record:CodingDiagnosticRecord):string {
  if(record.status==='running')return '正在运行本地诊断…';
  if(record.status==='stopping')return '正在停止并保存…';
  if(record.status==='interrupted')return '上次诊断已中断';
  if(record.status==='unknown')return '其他实例的诊断状态尚未确认';
  if(record.status==='cancelled')return '已取消';
  if(record.status==='error')return '诊断未完成';
  if(record.outcome?.kind==='passed')return '本次本地运行通过';
  if(record.outcome?.kind==='failed'){
    if(record.outcome.reason==='assertion')return record.trace?.hostTrigger==='mismatch'?'输出与期望不一致':'代码执行未通过';
    if(record.outcome.reason==='timeout')return '本地运行超时';
    if(record.trace?.driver.status==='complete'){
      const cause=record.trace.driver.cause;
      if(cause==='fuel')return '计算预算已用尽';
      if(cause==='guest-case-output')return '单个用例输出超限';
      if(cause==='guest-total-output')return '累计输出超限';
    }
    return '运行未通过，具体原因待确认';
  }
  return '未取得完整结果';
}
const seconds=(ms:number|undefined)=>ms===undefined?'—':`${(ms/1000).toFixed(2)} 秒`;

export function CodingDiagnostic(props:PageProps&{runId:string;itemId:string;answerAvailable:boolean}) {
  const [view,setView]=React.useState<CodingDiagnosticView>(),[error,setError]=React.useState(''),[revision,setRevision]=React.useState(0);
  const section=React.useRef<HTMLElement>(null),restoreFocus=React.useRef(false);
  const {rootId,rootEpoch,activeActivity,writable}=props.data.status;
  const running=!!view?.record&&['running','stopping'].includes(view.record.status);
  React.useLayoutEffect(()=>{
    if(!restoreFocus.current||props.busy)return;
    if(document.activeElement!==document.body){restoreFocus.current=false;return;}
    const button=section.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    if(button)button.focus();else section.current?.focus();
    restoreFocus.current=false;
  },[props.busy,running,view?.record?.status]);
  React.useEffect(()=>{
    let alive=true,inFlight=false;
    const abort=new AbortController();
    async function refresh(){
      if(inFlight)return;inFlight=true;
      try{
        const next=await props.api<CodingDiagnosticView&{rootId:string;rootEpoch:number}>('codingDiagnostic',{runId:props.runId,itemId:props.itemId},abort.signal);
        if(alive&&next.rootId===rootId&&next.rootEpoch===rootEpoch){setView(next);setError('');}
      }catch(cause){if(alive)setError((cause as Error).message);}
      finally{inFlight=false;}
    }
    void refresh();
    const timer=running||activeActivity?.kind==='coding-diagnostic'?setInterval(()=>void refresh(),1000):undefined;
    return()=>{alive=false;abort.abort();if(timer)clearInterval(timer);};
  },[props.api,props.runId,props.itemId,rootId,rootEpoch,activeActivity?.id,activeActivity?.state,running,revision]);

  const record=view?.record,trace=record?.trace,driver=trace?.driver;
  return <section ref={section} tabIndex={-1} className="me-condition-card me-coding-diagnostic" aria-label="本地编程诊断">
    <div className="me-item-heading"><h3>本地编程诊断</h3>{running&&record?<Button disabled={props.busy||record.status==='stopping'} onClick={()=>{restoreFocus.current=true;void props.act(()=>props.api('cancelCodingDiagnostic',{diagnosticId:record.diagnosticId}));}}>取消诊断</Button>:<Button disabled={props.busy||!!activeActivity||!writable||!props.answerAvailable} onClick={()=>{restoreFocus.current=true;void props.act(async()=>{const result=await props.api('startCodingDiagnostic',{runId:props.runId,itemId:props.itemId});setRevision(value=>value+1);return result;});}}>{record?'重新诊断':'运行诊断'}</Button>}</div>
    <p className="me-help">复用已保存代码，最多约 1 分钟。结果单独记录，原成绩保留。</p>
    {!props.answerAvailable&&<p className="me-help">完整回答不可用。</p>}
    {error&&<p className="me-inline-warning" role="alert">{error}</p>}
    {record&&<><p role="status"><strong>{codingDiagnosticOutcome(record)}</strong> · {time(record.endedAt??record.startedAt)}</p>
      {record.outcome&&<dl><div><dt>本次耗时</dt><dd>{seconds(record.outcome.elapsedMs)}</dd></div><div><dt>已匹配用例</dt><dd>{trace?.matchedCases??'—'} / {record.source?.cases??'—'}</dd></div></dl>}
      {trace&&<dl><div><dt>本地校验</dt><dd>{seconds(trace.verifyMs)}</dd></div><div><dt>沙箱准备</dt><dd>{seconds(trace.prepareMs)}</dd></div><div><dt>启动与加载</dt><dd>{driver?.status==='complete'||driver?.status==='partial'?seconds(driver.readyObservedMs):'—'}</dd></div><div><dt>用例阶段</dt><dd>{driver?.status==='complete'?seconds(driver.caseMs):'—'}</dd></div><div><dt>清理</dt><dd>{seconds(trace.cleanupMs)}</dd></div></dl>}
      <Disclosure kind="help" title="诊断依据"><p className="me-help">用例阶段包含逐次解释器启动和代码执行。诊断会增加少量耗时，接近时限的结果可能波动。</p><pre>{JSON.stringify({source:record.source,outcome:record.outcome,trace:record.trace,errorCode:record.errorCode},null,2)}</pre></Disclosure>
    </>}
  </section>;
}
