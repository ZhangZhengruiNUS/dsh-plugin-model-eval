import {SelectionBar} from '../components/SelectionBar.tsx';
import * as React from 'react';
import type {Track} from '../../contracts.ts';
import {ComparisonTable} from '../components/ComparisonTable.tsx';
import {zh as t} from '../locales.ts';
import {latestCompleted,targetKey,time} from '../store.ts';
import {Button,Empty,Icon,ModelLabel,Params,Score,type PageProps} from '../ui.tsx';

export function Compare(props:PageProps){
  const {data}=props;
  const [track,setTrack]=React.useState<Track>('general');
  const [protocol,setProtocol]=React.useState(data.status.resourceVersion);
  const [method,setMethod]=React.useState(false),[query,setQuery]=React.useState('');
  const methodId=React.useId();
  const completed=latestCompleted(data.runs,track,protocol);
  const needle=query.trim().toLocaleLowerCase();
  const rows=completed.filter(run=>[run.target.modelId,run.target.providerId,run.target.deployment?.value??''].some(value=>value.toLocaleLowerCase().includes(needle)));
  const incomplete=data.runs.some(run=>run.protocols.resourceVersion===protocol&&run.tracks[track]&&run.tracks[track]?.status!=='completed');
  const versions=[...new Set([data.status.resourceVersion,...data.runs.map(x=>x.protocols.resourceVersion)])];
  if(!data.status.prepared&&!data.runs.length)return <Empty title={t.firstTitle} body={t.firstBody}><Button kind="primary" icon="arrow" onClick={()=>props.navigate('settings')}>{t.prepare}</Button><small>{t.firstHint}</small></Empty>;
  const metrics=[
    {label:t.models,value:new Set(data.runs.map(x=>targetKey(x.target))).size},
    {label:t.completeRuns,value:data.runs.filter(x=>Object.values(x.tracks).every(v=>v.status==='completed')).length},
    {label:t.pendingRuns,value:data.runs.filter(x=>Object.values(x.tracks).some(v=>v.status!=='completed')).length}
  ];
  return <div className="me-compare-view">
    <section className="me-overview" aria-label="评测概览">
      <dl>{metrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>
      <details className="me-count-definition"><summary aria-label="统计口径" title="统计口径"><Icon name="info" size={14}/><span className="me-definition-label">统计口径</span></summary><p>{t.wholeRunHint}</p></details>
    </section>
    <section className="me-card me-results">
      <div className="me-results-heading"><div><h2>{t.latest}</h2><span role="status" aria-live="polite">{rows.length===completed.length?`${rows.length} 个配置`:`${rows.length} / ${completed.length} 个配置`}</span></div>
        <SelectionBar label={t.tracks} value={track}>{(['general','writing'] as const).map(value=><button key={value} role="tab" aria-selected={track===value} onClick={()=>setTrack(value)}>{value==='general'?t.general:t.writing}</button>)}</SelectionBar>
      </div>
      <div className="me-results-toolbar">
        <div className="me-result-search"><Icon name="search" size={16}/><input type="search" aria-label="搜索模型、供应商或部署" placeholder="搜索模型、供应商或部署" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<Button kind="icon" icon="close" aria-label="清空搜索" onClick={()=>setQuery('')}/>}</div>
        <label className="me-result-protocol"><span>{t.protocol}</span><select aria-label={t.protocol} value={protocol} onChange={e=>setProtocol(e.target.value)}>{versions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <Button kind="text" icon="info" aria-expanded={method} aria-controls={methodId} onClick={()=>setMethod(!method)}>{t.method}</Button>
      </div>
      {method&&<div className="me-method" id={methodId}><strong>{t.methodTitle}</strong><p>{track==='general'?t.generalNote:t.writingNote}。{t.latestNote}</p><p>{t.methodBody}</p><p>{t.adaptation}</p><p>{t.judgeLimit}</p></div>}
      {!completed.length?<Empty title={track==='general'?t.noScores:t.noWriting} body={incomplete?`已有未完成的${track==='general'?t.general:t.writing}评测，可前往评测页查看。`:track==='general'?t.noScoresBody:t.noWritingBody}>{incomplete?<Button onClick={()=>props.navigate('jobs')} icon="arrow">查看评测任务</Button>:<Button onClick={props.newRun} icon="plus" disabled={!data.status.prepared||!data.status.writable||!!data.queue.activeBatchId||!!data.status.activeActivity}>{t.newRun}</Button>}</Empty>:!rows.length?<div className="me-search-empty"><Icon name="search" size={24}/><h3>没有匹配的模型配置</h3><Button onClick={()=>setQuery('')}>清空搜索</Button></div>:
        <ComparisonTable><table className="me-comparison"><thead><tr><th scope="col">{t.model}</th><th scope="col" className="me-primary-score">{track==='general'?t.overall:t.writingScore}</th>{track==='general'?Object.entries(t.domains).map(([key,label])=><th scope="col" key={key}>{label}</th>):<th scope="col">{t.judgeConditions}</th>}<th scope="col" title={t.duration}>{t.latency}<small>中位 / P95 · 秒</small></th><th scope="col" title={t.usagePartial}>{t.usage}<small>Token</small></th></tr></thead>
          <tbody>{rows.map(run=>{const metrics=run.metrics.tracks[track]?.answer;return <tr key={run.runId}>
            <td><div className="me-model-cell"><span className="me-rank">{String(completed.indexOf(run)+1).padStart(2,'0')}</span><div className="me-result-identity"><button className="me-model-report" aria-label={`${t.report} ${run.target.modelId}`} onClick={()=>props.report(run.runId)}><ModelLabel target={run.target}/><Icon name="arrow" size={15}/></button><Params target={run.target}/><small className="me-date">{time(run.tracks[track]?.completedAt)}</small></div></div></td>
            <td className="me-primary-score"><Score value={run.tracks[track]?.score} large/></td>
            {track==='general'?Object.keys(t.domains).map(key=><td key={key}><span className="me-mono">{run.tracks.general?.measures[key]?.score?.toFixed(1)??'—'}</span><span className="me-score-bar"><i style={{width:`${run.tracks.general?.measures[key]?.score??0}%`}}/></span></td>):<td><div className="me-judge-label">{run.judges.filter(x=>x.itemIds.length).map(x=><span key={targetKey(x.snapshot.target)} title={JSON.stringify(x.snapshot.target.controls)}>{x.snapshot.target.modelId} · {x.itemIds.length}{t.sample}</span>)}{run.judges.filter(x=>x.itemIds.length).length>1&&<em>{t.mixedJudge}</em>}{run.judges.some(x=>targetKey(x.snapshot.target)===targetKey(run.target))&&<em>{t.selfJudge}</em>}</div></td>}
            <td><span className="me-mono">{metrics?.latencyMedianMs===undefined?'—':(metrics.latencyMedianMs/1000).toFixed(1)} / {metrics?.latencyP95Ms===undefined?'—':(metrics.latencyP95Ms/1000).toFixed(1)}</span></td>
            <td><span className="me-token">{t.input} {metrics?.inputTokens?.toLocaleString()??'—'}<br/>{t.output} {metrics?.outputTokens?.toLocaleString()??'—'}</span>{metrics&&metrics.usageCoverage<1&&<small className="me-date">{t.coverage} {Math.round(metrics.usageCoverage*100)}%</small>}</td>
          </tr>;})}</tbody>
        </table></ComparisonTable>}
    </section>
  </div>;
}
