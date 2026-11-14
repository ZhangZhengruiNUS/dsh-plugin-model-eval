import {generalReleaseFor} from '../../evaluation/current-edition.ts';
import {CURRENT_WRITING_ID,writingEditionName} from '../../evaluation/writing-edition.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {TextInput} from '../primitives/primitives.tsx';
import {Select} from '../primitives/Select.tsx';
import * as React from 'react';import type {Track} from '../../contracts.ts';
import {ComparisonToolbar} from '../components/comparison/ComparisonToolbar.tsx';
import {zh as t} from '../locales.ts';import {ActionButton,Button,Empty,Icon,Modal,ModelLabel,reasoningEffortLabel,type PageProps} from '../ui.tsx';
import {buildComparison,modelDisplayName,currentComparisonGroups,scopeKeyFor,stable,type BuiltInReference,type ComparisonRow} from '../comparison/model.ts';import {reconcileSelection,toggleSelection,type ComparisonSelection} from '../comparison/state.ts';
import {builtInReferences} from '../comparison/reference-data.ts';
import {generalTierLabel,time} from '../store.ts';
import {FocusBar} from '../components/comparison/FocusBar.tsx';import {PerformanceScatter} from '../components/comparison/PerformanceScatter.tsx';import {AbilityProfile,type ProfileMode} from '../components/comparison/AbilityProfile.tsx';import {ScoreMatrix} from '../components/comparison/ScoreMatrix.tsx';
import {EvaluationBasis,WritingEvaluationBasis} from '../components/EvaluationBasis.tsx';
import {HelpDisclosureButton} from '../components/Disclosure.tsx';
import {CommonComparison} from '../components/comparison/CommonComparison.tsx';
import {isArchivedProtocol} from '../protocol-archive.ts';
import {generalEditionLabel,generalReleaseName} from '../protocol-editions.ts';
const categories = [{id:'general',label:t.general},{id:'writing',label:t.writing}] as const;
export function Compare(props:PageProps&{references?:readonly BuiltInReference[]|undefined}){
  const {data}=props,savedRuns=data.comparison?.summaries??[];
  const [track,setTrack]=React.useState<Track>('general'),[protocol,setProtocol]=React.useState<Partial<Record<Track,string>>>({}),[query,setQuery]=React.useState(''),[method,setMethod]=React.useState(false),[selection,setSelection]=React.useState<ComparisonSelection>(),[mode,setMode]=React.useState<ProfileMode>('radar'),[highlighted,setHighlight]=React.useState<string|null>(null);
  const [referenceDetail,setReferenceDetail]=React.useState<ComparisonRow>();
  const [commonOpen,setCommonOpen]=React.useState(false);
  const methodId=React.useId();
  const panelId=React.useId();
  const searchInput=React.useRef<HTMLInputElement>(null);
  const chartSection=React.useRef<HTMLElement>(null);
  const archiveApplies=(run:typeof savedRuns[number])=>track==='general'&&isArchivedProtocol(run.protocols,props.protocolArchive);
  const references=(props.references??builtInReferences).filter(reference=>{
    if(reference.nativeRun&&reference.summary.tracks.writing)
      return data.status.writingId===CURRENT_WRITING_ID&&reference.summary.protocols.writingId===data.status.writingId;
    return (reference.nativeRun||reference.wallReplay)
    ? data.protocols.some(({descriptor})=>!!generalReleaseFor(descriptor.refs)&&
      descriptor.refs.generalId===reference.summary.protocols.generalId&&
      descriptor.refs.resourceVersion===reference.summary.protocols.resourceVersion&&
      descriptor.refs.writingId===reference.summary.protocols.writingId&&
      descriptor.general.definitionHash===reference.summary.generalDefinition?.definitionHash)
    : data.status.prepared;
  });
  const resultGroups=data.comparison?buildComparison(data.comparison,track,references)
    .filter(group=>!group.rows.every(row=>archiveApplies(row.source))):[];
  const released=currentComparisonGroups(data.protocols,data.status.writingId,track);
  const releasedKeys=new Set(released.map(group=>group.key));
  const groups=[
    ...released.map(group=>({...group,rows:resultGroups.find(result=>result.key===group.key)?.rows??[]})),
    ...resultGroups.filter(group=>!releasedKeys.has(group.key)),
  ];
  const editionRows=groups.flatMap(g=>g.rows).filter(r=>r.track==='general'&&r.source.generalDefinition?.tier==='light'&&['task-five-v2','task-five-v3'].includes(r.source.generalDefinition?.schema??''));
  const commonAvailable=new Set(editionRows.map(r=>r.source.protocols.resourceVersion)).size===2;
  React.useEffect(()=>setCommonOpen(false),[data.status.rootId,data.status.rootEpoch]);
  const localGroups=groups.filter(candidate=>candidate.rows.some(row=>!row.reference));
  const currentLocalGroups=localGroups.filter(group=>releasedKeys.has(group.key));
  const firstLegacyLight=['task-five-v3-r2','task-five-v3-r1','task-five-v3','task-five-v2','task-five-v1']
    .map(schema=>localGroups.find(group=>group.definition?.tier==='light'&&group.definition.schema===schema))
    .find(Boolean);
  const defaultGroup=track==='writing'?groups[0]:
    currentLocalGroups.find(group=>group.definition?.tier==='light')??currentLocalGroups[0]
    ??groups.find(group=>releasedKeys.has(group.key))??firstLegacyLight
    ??localGroups.find(group=>group.definition?.tier==='light')
    ??localGroups.find(group=>group.rows[0]?.source.protocols.generalId===data.status.generalId&&group.rows[0]?.source.protocols.resourceVersion===data.status.resourceVersion)
    ??localGroups[0]??groups[0];
  const group=groups.find(group=>group.key===protocol[track])??defaultGroup;
  const allRows=group?.rows??[],scope=stable([data.status.rootId,data.status.rootEpoch,group?.key??track]);
  const chosen=reconcileSelection(selection,scope,allRows),needle=query.trim().toLocaleLowerCase();
  const rows=allRows.filter(r=>[modelDisplayName(r),r.target.modelId,r.target.providerId,r.target.deployment?.value??'',JSON.stringify(r.target.controls),r.reference??''].some(v=>v.toLocaleLowerCase().includes(needle)));
  const filterLabel=track==='general'?t.evaluationTier:t.evaluationVersion;
  const report=(id:string)=>{const reference=groups.flatMap(g=>g.rows).find(row=>row.runId===id&&row.reference);if(reference)setReferenceDetail(reference);else props.report(id);};
  const colors=React.useRef({scope:'',map:new Map<string,string>()});if(colors.current.scope!==scope)colors.current={scope,map:new Map()};for(const r of [...allRows].sort((a,b)=>a.configKey.localeCompare(b.configKey)))if(!colors.current.map.has(r.configKey))colors.current.map.set(r.configKey,'var(--comparison-'+colors.current.map.size%7+')');const color=(key:string)=>colors.current.map.get(key)??'var(--me-accent)';
  const toggle=(key:string)=>setSelection(toggleSelection(chosen,key)),baseline=(key:string)=>{setSelection({...chosen,baseline:key});setMode('delta');};
  const incomplete=savedRuns.some(r=>!archiveApplies(r)&&r.tracks[track]&&r.tracks[track]?.status!=='completed'&&
    (group?scopeKeyFor(r,track)===group.key:track==='general'?r.protocols.resourceVersion===data.status.resourceVersion:r.protocols.writingId===data.status.writingId));
  const offlineOnly=rows.length>0&&rows.every(r=>(r.source.regradeOrigin||r.wallReplay)&&r.taskMeanMs==null);
  const scoresOnly=allRows.length>0&&allRows.every(row=>row.wallReplay);
  const canCompare=allRows.length>1;
  const selected=canCompare?chosen.selected:allRows.map(row=>row.configKey);
  const profileRows=selected.flatMap(key=>allRows.filter(row=>row.configKey===key));
  const clearSearch=()=>{searchInput.current?.focus();setQuery('');};
  const showCharts=()=>{
    chartSection.current?.focus({preventScroll:true});
    chartSection.current?.scrollIntoView({block:'start'});
  };
  const activeBatch = Boolean(data.queue.activeBatchId);
  const refresh=<Button kind="text" className="me-local-refresh" icon="refresh" aria-label="刷新对比结果" title="刷新对比结果" onClick={()=>void props.refresh()} disabled={props.busy}/>;
  if(track==='general'&&!data.status.prepared&&!savedRuns.length&&!groups.length&&!data.comparisonError)return <Empty title={t.firstTitle} body={t.firstBody}><Button kind="primary" icon="arrow" onClick={()=>props.navigate('settings')}>{t.prepare}</Button><small>{t.firstHint}</small></Empty>;
  if(!data.comparison)return <Empty title="暂时无法加载比较数据" body={data.comparisonError??t.loading}><Button icon="refresh" onClick={()=>void props.refresh()} disabled={props.busy}>{t.retry}</Button></Empty>;
  return <div className="me-compare-view">
    <ComparisonToolbar label={t.tracks} categories={categories} active={track} panelId={panelId}
      onChange={value=>{if(value!==track){setTrack(value);setMode('radar');setHighlight(null);}}}
      actions={allRows.length > 0 && !activeBatch && (
        <ActionButton className="me-compare-new-run" icon="plus" hintSide="below"
          onClick={props.newRun} unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>
      )}/>
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${track}`} tabIndex={0} className="me-comparison-panel">
      <div className="me-comparison-scope">
        <div className="me-scope-fields">
          {groups.length === 1 && group ? (
            <dl className="me-current-protocol">
              <dt>{track === 'writing' ? '版本' : filterLabel}</dt><dd>{group.label}</dd>
            </dl>
          ) : groups.length > 1 && (
            <div className="me-result-protocol">
              <span aria-hidden="true">{filterLabel}</span>
              <Select label={filterLabel} showLabel={false} value={group?.key ?? ''}
                onChange={value => {
                  setProtocol(previous => ({...previous, [track]: value}));
                  setSelection(undefined);
                  setMode('radar');
                  setHighlight(null);
                }}
                options={groups.map(item => ({value: item.key, label: item.label}))}/>
            </div>
          )}
          <HelpDisclosureButton title={t.method} expanded={method} controls={methodId} onToggle={() => setMethod(!method)}/>
          {commonAvailable && track === 'general' && <Button kind="text" onClick={() => setCommonOpen(true)}>比较不同版本</Button>}
        </div>
        {refresh}
      </div>
    <section className="me-method" id={methodId} aria-label={t.method} hidden={!method}>
      {method&&<>
        <h2>成绩如何比较</h2>
        <p>{t.latestNote}搜索仅筛选候选，保留已选的对比配置。</p>
        <p>{t.wholeRunHint}</p>
        {track==='general'?<EvaluationBasis definition={group?.definition} questionCount={group?.questionCount} expanded/>:
          <><WritingEvaluationBasis writingId={group?.rows[0]?.source.protocols.writingId??data.status.writingId} questionCount={group?.questionCount} expanded/><p>{t.judgeLimit}</p></>}
        <h3>耗时与用量</h3>
        <p>{track==='writing'?'平均作答耗时只计待测模型作答，整轮耗时包含裁判评分。':'平均任务耗时按完整任务计时计算，受实际运行条件影响。'}缺失计时不补零，条件不同或未知的记录不连成同一观测边界。</p>
        <p>用量只统计接口返回的待测模型 Token，旧记录可能缺少部分用量。评分修订分别标注原答卷计时和复判新增用量。</p>
      </>}
    </section>
    {!allRows.length?<Empty title={track==='general'?t.noScores:t.noWriting} body={activeBatch ? '有评测任务正在运行，完成后可在对应类别查看成绩。' : incomplete?`已有未完成的${track==='general'?t.general:t.writing}评测，可前往评测页查看。`:track==='general'?t.noScoresBody:t.noWritingBody}>
      {!activeBatch&&(incomplete?<Button kind="primary" onClick={()=>props.navigate('jobs')} icon="arrow">查看评测任务</Button>:<ActionButton kind="primary" onClick={props.newRun} icon="plus" hintAlign="start" unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>)}
    </Empty>:<>
      <ScoreMatrix rows={rows} track={track} {...(needle?{searchTotal:allRows.length}:{})} scoresOnly={scoresOnly} missingRegradeTiming={offlineOnly}
        selection={chosen} canCompare={canCompare} onToggle={toggle} onReport={report} onHighlight={setHighlight} highlighted={highlighted} color={color}
        tools={<>
          <div className="me-result-search" data-idle={!canCompare&&!query||undefined}>
            <Icon name="search" size={15}/>
            <TextInput ref={searchInput} type="search" aria-label="搜索模型、供应商或备注" placeholder="搜索模型、供应商或备注" title="筛选候选，已选对比配置保留" value={query} onChange={e=>setQuery(e.target.value)}/>
            {query&&<Button kind="text" icon="close" aria-label="清空搜索" onClick={clearSearch}/>}
          </div>
        </>}
        selectionTools={canCompare&&<FocusBar rows={allRows} candidates={rows} selection={chosen} onToggle={toggle} onBaseline={baseline} onShowCharts={showCharts} color={color}/>}
        empty={<div className="me-search-empty"><h3>没有匹配的模型配置</h3><Button onClick={clearSearch}>清空搜索</Button></div>}
      />
      <section className={"me-analysis-grid"+(offlineOnly||!rows.length?" me-offline-analysis":"")} aria-label="对比图表" tabIndex={-1} ref={chartSection}>
        {!offlineOnly&&rows.length>0&&<PerformanceScatter rows={rows} selected={selected} onToggle={canCompare?toggle:undefined} onReport={report} onHighlight={setHighlight} highlighted={highlighted} color={color}/>}
        <AbilityProfile rows={profileRows} selection={chosen} mode={canCompare?mode:'radar'} canCompare={canCompare} onMode={setMode} onBaseline={baseline} onHighlight={setHighlight} highlighted={highlighted} color={color}/>
      </section>
    </>}
    </div>
    {commonOpen&&commonAvailable&&<CommonComparison rows={editionRows} initialIds={chosen.selected.flatMap(key=>allRows.filter(r=>r.configKey===key).map(r=>r.runId))} api={props.api} rootId={data.status.rootId} rootEpoch={data.status.rootEpoch} onClose={()=>setCommonOpen(false)} onReport={id=>{setCommonOpen(false);report(id);}}/>}
    {referenceDetail&&<ReferenceDetails row={referenceDetail} onClose={()=>setReferenceDetail(undefined)}/>}
  </div>;
}

function ReferenceDetails({row,onClose}:{row:ComparisonRow;onClose:()=>void}){
  const {source,target,execution}=row;
  const writing=row.track==='writing';
  const edition=generalEditionLabel(source.protocols.resourceVersion);
  const scope=writing?writingEditionName(source.protocols.writingId):
    generalReleaseName(source.protocols,true)??[edition,generalTierLabel(source)].filter(Boolean).join(' · ');
  const elapsedMs=Date.parse(source.completedAt??'')-Date.parse(source.createdAt??'');
  const activeMs=row.referenceBatchActiveMs;

  return <Modal title="内置参考详情" onClose={onClose}>
    <div className="me-dialog-body">
      <ModelLabel target={target} displayName={modelDisplayName(row)}/>
      <dl className="me-reference-details">
        <dt>测试渠道</dt><dd>{row.reference}</dd>
        <dt>{t.reasoningEffort}</dt><dd>{reasoningEffortLabel(target)??'—'}</dd>
        <dt>{writing?t.evaluationVersion:t.evaluationTier}</dt><dd>{scope}</dd>
        {writing&&<><dt>{t.judge}</dt><dd>{row.judgeLabel}</dd><dt>评分方式</dt><dd>五维等权评分 · 每题 0–20 分，汇总为百分制</dd></>}
        <dt>测试日期</dt><dd>{time(row.completedAt??undefined)}</dd>
        {execution.state==='known'&&<>
          <dt>运行条件</dt>
          <dd>并发 {execution.concurrency} · {execution.callTimeoutMs/1000} 秒{execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'}</dd>
        </>}
        {activeMs!==undefined&&<><dt>累计活跃时长</dt><dd>{formatElapsed(activeMs)}</dd></>}
        {elapsedMs>0&&<><dt>{activeMs===undefined?'整轮耗时':'从开始到完成（含暂停）'}</dt><dd>{formatElapsed(elapsedMs)}</dd></>}
        {row.taskMeanMs!=null&&<><dt>{writing?'平均作答耗时':'平均任务耗时'}</dt><dd>{(row.taskMeanMs/1000).toFixed(1)} 秒/题</dd></>}
        {row.taskTimingSource&&<><dt>计时来源</dt><dd>原始实测记录</dd></>}
      </dl>
    </div>
  </Modal>;
}
