import * as React from 'react';import {Button,Icon,type PageProps} from '../ui.tsx';import {zh as t} from '../locales.ts';import {formatBytes} from '../store.ts';import type {HistoryUsage} from '../../history/cleanup.ts';
export function Settings(props:PageProps){
  const [path,setPath]=React.useState(props.data.status.rootPath),[usage,setUsage]=React.useState<HistoryUsage>(),[usageRevision,setUsageRevision]=React.useState(0);
  React.useEffect(()=>{
    // Preparation can add protocols without changing the already-ready flag.
    // Wait for writes to settle; cleanup prevents an older measurement replacing the new one.
    if(props.busy||props.data.status.preparing)return;
    let live=true;setUsage(undefined);
    void props.api<HistoryUsage>('usage').then(x=>{if(live)setUsage(x);}).catch(()=>{});
    return()=>{live=false;};
  },[props.api,props.data.status.rootPath,props.data.status.rootId,props.data.status.rootEpoch,props.data.status.prepared,props.data.status.preparing,props.busy,usageRevision]);
  async function prepareEnvironment(){
    try{await props.act(()=>props.api('prepare'));}
    finally{setUsageRevision(v=>v+1);}
  }
  return <div className="me-settings-grid"><section className="me-card me-settings-main"><div className="me-card-heading"><h2>{t.root}</h2><Icon name="settings"/></div><div className="me-card-body"><label><span className="sr-only">{t.root}</span><input value={path} onChange={e=>setPath(e.target.value)} spellCheck={false} disabled={props.busy||!!props.data.queue.activeBatchId}/></label><p className="me-help">{t.rootHint}</p><Button disabled={props.busy||!!props.data.queue.activeBatchId||path===props.data.status.rootPath} onClick={()=>void props.act(()=>props.api('setRoot',{path}))}>{t.changeRoot}</Button></div></section>
  <section className="me-card"><div className="me-card-heading"><h2>{t.resources}</h2><span className={'me-env-dot '+(props.data.status.prepared?'ready':'')}/></div><div className="me-card-body"><strong className="me-environment-title">{props.data.status.prepared?t.ready:t.needsPrepare}</strong><p className="me-help">{t.platform}</p><p className="me-help">{t.resourceHint}</p><div className="me-resource-states">{props.data.protocols.map(p=><div key={p.descriptor.refs.generalId}><span>{p.descriptor.general.tier==='light'?'轻量':p.descriptor.general.tier==='deep'?'深入':'旧版基线'} · {p.descriptor.questionCount}题</span><b title={p.errorCode??''}>{p.prepared?'已就绪':p.descriptor.allowNewRuns?'尚未准备':'尚未开放'}{p.errorCode&&p.errorCode!=='PROTOCOL_NOT_VERIFIED'?' · 准备未通过':''}</b></div>)}</div><Button kind="primary" icon={props.data.status.prepared?'refresh':'arrow'} disabled={props.busy||!!props.data.queue.activeBatchId||!!props.data.status.activeActivity||!props.data.status.writable} onClick={()=>void prepareEnvironment()}>{props.busy||props.data.status.preparing?t.preparing:props.data.status.prepared?t.refresh:t.prepare}</Button></div></section>
  <section className="me-card"><div className="me-card-heading"><h2>{t.storage}</h2></div><div className="me-card-body"><div className="me-storage-row"><span>{t.historyBytes}</span><b>{usage?formatBytes(usage.historyBytes):'—'}</b></div><div className="me-storage-row"><span>{t.resourceBytes}</span><b>{usage?formatBytes(usage.resourceBytes):'—'}</b></div><p className="me-help">{t.fileBytes}</p><Button onClick={()=>props.navigate('history')}>{t.history}</Button></div></section></div>;
}
