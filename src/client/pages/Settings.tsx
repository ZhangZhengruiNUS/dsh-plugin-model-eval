import {Disclosure,StorageBasis} from '../components/Disclosure.tsx';
import {StorageValue} from '../components/DataReadout.tsx';
import {Checkbox,TextInput} from '../primitives/primitives.tsx';
import {Select} from '../primitives/Select.tsx';
import {isArchivedProtocol,protocolArchiveOptions} from '../protocol-archive.ts';
import {generalEditionLabel,generalEditionOrder,generalReleaseName} from '../protocol-editions.ts';
import {generalEvaluationName} from '../../evaluation/current-edition.ts';
import {writingEditionFor,writingEditionName} from '../../evaluation/writing-edition.ts';
import * as React from 'react';import {ActionButton,activityUnavailable,Button,Icon,type PageProps} from '../ui.tsx';import {zh as t} from '../locales.ts';import type {HistoryUsage} from '../../history/cleanup.ts';
export function Settings(props:PageProps){
  const [path,setPath]=React.useState(props.data.status.rootPath),[usage,setUsage]=React.useState<HistoryUsage>(),[usageRevision,setUsageRevision]=React.useState(0);
  const [checkingResources,setCheckingResources]=React.useState(false);
  const {status,queue,protocols}=props.data;
  const {setProtocolArchive}=props;
  const resourceHint=setProtocolArchive?t.resourceHintLegacy:t.resourceHint;
  const rootHintId=React.useId(),resourceHintId=React.useId(),archiveHintId=React.useId(),diagnosticHintId=React.useId();
  const diagnostics=status.codingDiagnostics;
  const preparing=checkingResources||status.preparing;
  const currentWriting=writingEditionFor(status.writingId)?.current?writingEditionName(status.writingId):undefined;
  const writingReady=protocols.some(({descriptor,prepared})=>descriptor.refs.generalId===status.generalId&&descriptor.allowNewRuns&&prepared);
  const editions=new Map<string,typeof protocols>();
  for(const protocol of protocols){
    const {refs}=protocol.descriptor;
    if(isArchivedProtocol(refs,props.protocolArchive))continue;
    const key=generalReleaseName(refs)?generalEvaluationName:refs.resourceVersion;
    const group=editions.get(key);
    if(group)group.push(protocol);
    else editions.set(key,[protocol]);
  }
  React.useEffect(()=>{
    // Preparation can add protocols without changing the already-ready flag.
    // Wait for writes to settle; cleanup prevents an older measurement replacing the new one.
    if(props.busy||props.data.status.preparing)return;
    let live=true;setUsage(undefined);
    void props.api<HistoryUsage>('usage').then(x=>{if(live)setUsage(x);}).catch(()=>{});
    return()=>{live=false;};
  },[props.api,props.data.status.rootPath,props.data.status.rootId,props.data.status.rootEpoch,props.data.status.prepared,props.data.status.preparing,props.busy,usageRevision]);
  async function prepareEnvironment(){
    setCheckingResources(true);
    try{await props.act(()=>props.api('prepare'));}
    finally{setCheckingResources(false);setUsageRevision(v=>v+1);}
  }
  return <div className="me-settings-grid"><section className="me-card me-settings-main"><div className="me-card-heading"><h2>{t.root}</h2><Icon name="settings"/></div><div className="me-card-body"><label><span className="sr-only">{t.root}</span><TextInput aria-describedby={rootHintId} value={path} onChange={e=>setPath(e.target.value)} spellCheck={false} disabled={props.busy||!!props.data.queue.activeBatchId}/></label><p id={rootHintId} className="me-help">{t.rootHint}</p><ActionButton hintAlign="start" aria-describedby={rootHintId} disabled={props.busy} unavailableReason={activityUnavailable(status,queue.activeBatchId)??(!path.trim()||path===status.rootPath?'请输入新的数据目录。':undefined)} onClick={()=>void props.act(()=>props.api('setRoot',{path}))}>{t.changeRoot}</ActionButton></div></section>
  <section className="me-card">
    <div className="me-card-heading">
      <h2>{t.resources}</h2>
      <ActionButton hintSide="below" aria-describedby={status.prepared?undefined:resourceHintId} kind={status.prepared?'':'primary'} icon={status.prepared?'refresh':'arrow'} disabled={props.busy||preparing} unavailableReason={!status.writable?'数据目录为只读，请先切换到可写目录。':activityUnavailable(status,queue.activeBatchId)} onClick={()=>void prepareEnvironment()}>
        {preparing?t.preparing:status.prepared?'校验离线资源':t.prepare}
      </ActionButton>
    </div>
    <div className="me-card-body">
      <div className="me-resource-status"><strong className="me-environment-title">{status.prepared?t.ready:t.needsPrepare}</strong><span>Windows x64</span></div>
      {!status.prepared&&<p id={resourceHintId} className="me-param-help me-resource-hint">{resourceHint}</p>}
      {[...editions].sort(([a],[b])=>a===generalEvaluationName?-1:b===generalEvaluationName?1:generalEditionOrder(b)-generalEditionOrder(a)).map(([version,items])=><section key={version} className="me-resource-edition">
        <h3>{generalEditionLabel(version)??version}</h3>
        <div className="me-resource-states">{items.map(p=><div key={p.descriptor.refs.generalId}>
          <span className="me-record-meta">
            <span>{generalReleaseName(p.descriptor.refs)??(p.descriptor.general.tier==='light'?'轻量':p.descriptor.general.tier==='deep'?'深入':'通用')}</span>
          </span>
          <b title={p.errorCode??''}>{p.prepared?'已就绪':p.descriptor.allowNewRuns?'尚未准备':'尚未开放'}{p.errorCode&&p.errorCode!=='PROTOCOL_NOT_VERIFIED'?' · 准备未通过':''}</b>
        </div>)}</div>
      </section>)}
      {currentWriting&&<section className="me-resource-edition">
        <div className="me-resource-states"><div><h3>{currentWriting}</h3><b>{writingReady?'已就绪':'按需准备'}</b></div></div>
      </section>}
      {status.prepared&&<Disclosure kind="help" title="资源准备范围"><p>{resourceHint}</p></Disclosure>}
    </div>
  </section>
  <section className="me-card">
    <div className="me-card-heading">
      <h2>{t.storage}</h2>
      <Button kind="text" icon="refresh" aria-label="刷新存储占用" onClick={()=>setUsageRevision(v=>v+1)} disabled={props.busy||preparing}>刷新占用</Button>
    </div>
    <div className="me-card-body">
      <dl className="me-storage-values">
        <div className="me-storage-row"><dt>{t.historyBytes}</dt><dd>{usage?<StorageValue bytes={usage.historyBytes}/>:'—'}</dd></div>
        <div className="me-storage-row me-storage-subrow"><dt><span className="dsh-sr-only">历史记录中的</span>估时记录</dt><dd>{usage?<StorageValue bytes={usage.timingBytes??0}/>:'—'}</dd></div>
        <div className="me-storage-row"><dt>{t.resourceBytes}</dt><dd>{usage?<StorageValue bytes={usage.resourceBytes}/>:'—'}</dd></div>
      </dl>
      <div className="me-storage-actions">
        <StorageBasis/>
        <Button onClick={()=>props.navigate('history')}>{t.history}</Button>
      </div>
    </div>
  </section>
  {setProtocolArchive&&<section className="me-card">
    <div className="me-card-heading"><h2>协议归档</h2></div>
    <div className="me-card-body">
      <Select aria-describedby={archiveHintId} label="历史通用协议" value={props.protocolArchive} options={protocolArchiveOptions} onChange={value=>{
        const option=protocolArchiveOptions.find(option=>option.value===value);
        if(option)setProtocolArchive(option.value);
      }}/>
      <p id={archiveHintId} className="me-help">仅显示当前协议时，各档位只显示当前版本。切回「显示全部协议」可查看旧版资源和通用评测记录。</p>
    </div>
  </section>}
  <section className="me-card me-diagnostics-card">
    <Disclosure kind="settings" title="开发诊断" value={diagnostics?.errorCode?'读取失败 · 已关闭':diagnostics?.enabled?'已开启':'已关闭'}>
      <label className="me-diagnostic-toggle"><Checkbox aria-describedby={diagnosticHintId} checked={diagnostics?.enabled??false} disabled={props.busy||!!status.activeActivity||!status.writable} onChange={event=>void props.act(()=>props.api('setCodingDiagnostics',{enabled:event.target.checked}))}/>允许本地编程诊断</label>
      <p id={diagnosticHintId} className="me-param-help">可在报告的编程题明细中运行诊断。每题只保留最近一次，随明细一起清理。</p>
    </Disclosure>
    {diagnostics?.errorCode&&<p className="me-inline-warning me-diagnostic-warning">诊断已关闭。展开后重新开启，即可保存设置。</p>}
  </section></div>;
}
