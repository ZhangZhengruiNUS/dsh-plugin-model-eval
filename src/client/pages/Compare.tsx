import {generalReleaseFor} from '../../evaluation/current-edition.ts';
import {writingEditionFor,writingEditionName} from '../../evaluation/writing-edition.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {Select} from '../primitives/Select.tsx';
import * as React from 'react';import type {Track} from '../../contracts.ts';
import {ComparisonToolbar} from '../components/comparison/ComparisonToolbar.tsx';
import {zh as t} from '../locales.ts';import {ActionButton,Button,Empty,Icon,Modal,ModelLabel,reasoningEffortLabel,type PageProps} from '../ui.tsx';
import {buildComparison,modelDisplayName,currentComparisonGroups,scopeKeyFor,stable,type BuiltInReference,type ComparisonRow} from '../comparison/model.ts';
import {readChartSelection,refreshPresetKeys,writeChartSelection} from '../comparison/chart-preferences.ts';
import {builtInReferences} from '../comparison/reference-data.ts';
import {generalTierLabel,time} from '../store.ts';
import {ChartSelectionDialog} from '../components/comparison/ChartSelectionDialog.tsx';
import {PerformanceScatter} from '../components/comparison/PerformanceScatter.tsx';import {AbilityProfile,type ProfileMode} from '../components/comparison/AbilityProfile.tsx';import {ScoreMatrix} from '../components/comparison/ScoreMatrix.tsx';
import {EvaluationBasis,WritingEvaluationBasis} from '../components/EvaluationBasis.tsx';
import {HelpDisclosureButton} from '../components/Disclosure.tsx';
import {CommonComparison} from '../components/comparison/CommonComparison.tsx';
import {isArchivedProtocol} from '../protocol-archive.ts';
import {generalEditionLabel,generalReleaseName} from '../protocol-editions.ts';
import {writingGuideGroups} from '../comparison/geometry.ts';
const categories = [{id:'general',label:t.general},{id:'writing',label:t.writing}] as const;
export function Compare(props:PageProps&{references?:readonly BuiltInReference[]|undefined}){
  const {data}=props,savedRuns=data.comparison?.summaries??[];
  const [track,setTrack]=React.useState<Track>('general'),[protocol,setProtocol]=React.useState<Partial<Record<Track,string>>>({}),[method,setMethod]=React.useState(false),[mode,setMode]=React.useState<ProfileMode>('radar'),[highlighted,setHighlight]=React.useState<string|null>(null);
  const [referenceDetail,setReferenceDetail]=React.useState<ComparisonRow>();
  const [commonOpen,setCommonOpen]=React.useState(false);
  const [pickerScope,setPickerScope]=React.useState<string>();
  const [chartSelections,setChartSelections]=React.useState<Record<string,string[]>>({});
  const [baselineChoice,setBaselineChoice]=React.useState<{scope:string;key:string}>();
  const [storageWarning,setStorageWarning]=React.useState<string>();
  const [judgeScope,setJudgeScope]=React.useState<{scope:string;key:string}>();
  const methodId=React.useId();
  const panelId=React.useId();
  const archiveApplies=(run:typeof savedRuns[number])=>track==='general'&&isArchivedProtocol(run.protocols,props.protocolArchive);
  const references=(props.references??builtInReferences).filter(reference=>{
    if(reference.nativeRun&&reference.summary.tracks.writing)
      return !!writingEditionFor(reference.summary.protocols.writingId);
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
  const allRows=group?.rows??[];
  const scope=stable([data.status.rootId,group?.key??track]);
  React.useEffect(()=>setPickerScope(undefined),[scope]);
  const savedSelection=React.useMemo(()=>readChartSelection(scope),[scope]);
  const selectedKeys=chartSelections[scope]??savedSelection;
  const selected=selectedKeys&&new Set(refreshPresetKeys(selectedKeys,new Set(allRows.map(row=>row.configKey))));
  const chartRows=selected?allRows.filter(row=>selected.has(row.configKey)):allRows;
  const baseKey=baselineChoice?.scope===scope&&chartRows.some(row=>row.configKey===baselineChoice.key)
    ?baselineChoice.key:chartRows[0]?.configKey??null;
  const judgeGroups=track==='writing'?writingGuideGroups(chartRows):[];
  const activeJudge=judgeGroups.find(group=>judgeScope?.scope===scope&&judgeScope.key===group.key)??judgeGroups[0];
  const guideRows=activeJudge?activeJudge.rows:chartRows;
  const filterLabel=track==='general'?t.evaluationTier:t.evaluationVersion;
  const report=(id:string)=>{const reference=groups.flatMap(g=>g.rows).find(row=>row.runId===id&&row.reference);if(reference)setReferenceDetail(reference);else props.report(id);};
  const colors=React.useRef({scope:'',map:new Map<string,string>()});if(colors.current.scope!==scope)colors.current={scope,map:new Map()};for(const r of [...allRows].sort((a,b)=>a.configKey.localeCompare(b.configKey)))if(!colors.current.map.has(r.configKey))colors.current.map.set(r.configKey,'var(--comparison-'+colors.current.map.size%7+')');const color=(key:string)=>colors.current.map.get(key)??'var(--me-accent)';
  const baseline=(key:string)=>{setBaselineChoice({scope,key});setMode('delta');};
  const incomplete=savedRuns.some(r=>!archiveApplies(r)&&r.tracks[track]&&r.tracks[track]?.status!=='completed'&&
    (group?scopeKeyFor(r,track)===group.key:track==='general'?r.protocols.resourceVersion===data.status.resourceVersion:r.protocols.writingId===data.status.writingId));
  const offlineOnly=allRows.length>0&&allRows.every(r=>(r.source.regradeOrigin||r.wallReplay)&&r.taskMeanMs==null);
  const scoresOnly=allRows.length>0&&allRows.every(row=>row.wallReplay);
  const applySelection=(keys:string[])=>{
    setChartSelections(previous=>({...previous,[scope]:keys}));
    setStorageWarning(writeChartSelection(scope,keys)?undefined:scope);
    setHighlight(null);
    setPickerScope(undefined);
  };
  const activeBatch = Boolean(data.queue.activeBatchId);
  const refresh=<Button kind="text" className="me-local-refresh" icon="refresh" aria-label="刷新对比结果" title="刷新对比结果" onClick={()=>void props.refresh()} disabled={props.busy}/>;
  if(track==='general'&&!data.status.prepared&&!savedRuns.length&&!groups.length&&!data.comparisonError)return <Empty title={t.firstTitle} body={t.firstBody}><Button kind="primary" icon="arrow" onClick={()=>props.navigate('settings')}>{t.prepare}</Button><small>{t.firstHint}</small></Empty>;
  if(!data.comparison)return <Empty title={data.comparisonError?'暂时无法加载比较数据':'正在读取比较数据'} body={data.comparisonError??''}><Button icon="refresh" onClick={()=>void props.refresh()} disabled={props.busy}>{data.comparisonError?t.retry:'刷新'}</Button></Empty>;
  return <div className="me-compare-view me-chart-first">
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
        <p>{t.latestNote}在「图表配置」中选择两张图显示的评测配置。成绩矩阵列出当前评测范围内的全部配置。</p>
        <p>{t.wholeRunHint}</p>
        {track==='general'?<EvaluationBasis definition={group?.definition} questionCount={group?.questionCount} expanded/>:
          <><WritingEvaluationBasis writingId={group?.rows[0]?.source.protocols.writingId??data.status.writingId} questionCount={group?.questionCount} expanded/><p>{t.judgeLimit}</p></>}
        <h3>耗时与用量</h3>
        <p>{track==='writing'?'平均作答耗时只计待测模型作答，整轮耗时包含裁判评分。换题补测沿用已保存的作答计时，并标为分阶段计时。':'平均任务耗时按完整任务计时计算，受实际运行条件影响。只换写作题的批次沿用原批次通用计时，并在图中标明。'}</p>
        <h3>帕累托前沿</h3>
        <p>前沿上的配置找不到用时更短且得分至少相同，或用时相同且得分更高的配置。前沿和绿区使用图中已选、同裁判口径且计时完整的本地成绩。绿区以同组分数和耗时的中位数为界。</p>
        <p>用量只统计接口返回的待测模型 Token，旧记录可能缺少部分用量。评分修订分别标注原答卷计时和复判新增用量。</p>
      </>}
    </section>
    {!allRows.length?<Empty title={track==='general'?t.noScores:t.noWriting} body={activeBatch ? '有评测任务正在运行，完成后可在对应类别查看成绩。' : incomplete?`已有未完成的${track==='general'?t.general:t.writing}评测，可前往评测页查看。`:track==='general'?t.noScoresBody:t.noWritingBody}>
      {!activeBatch&&(incomplete?<Button kind="primary" onClick={()=>props.navigate('jobs')} icon="arrow">查看评测任务</Button>:<ActionButton kind="primary" onClick={props.newRun} icon="plus" hintAlign="start" unavailableReason={props.newRunUnavailable}>{t.newRun}</ActionButton>)}
    </Empty>:<>
      <PerformanceScatter key={scope} track={track} rows={chartRows} guideRows={guideRows} selectionOpen={pickerScope===scope}
        onReport={report} onHighlight={setHighlight} highlighted={highlighted} color={color}
        selectionControl={<>
          <Button className="me-chart-picker-trigger" onClick={()=>{setHighlight(null);setPickerScope(scope);}}
            aria-haspopup="dialog">图表配置 <span>{chartRows.length} / {allRows.length}</span></Button>
          {storageWarning===scope&&<small role="status">已应用到当前页面，浏览器未能保存选择。</small>}
        </>}
        guideControl={judgeGroups.length>1&&activeJudge?<Select label="前沿裁判" value={activeJudge.key}
          onChange={key=>{setJudgeScope({scope,key});setHighlight(null);}}
          options={judgeGroups.map((entry,index)=>({value:entry.key,label:entry.label+(judgeGroups.some(other=>other!==entry&&other.label===entry.label)?` · 口径 ${index+1}`:'')}))}/>:null}
      />
      <AbilityProfile rows={chartRows} baseKey={baseKey} mode={mode} canCompare={chartRows.length>1}
        onMode={setMode} onBaseline={baseline} onHighlight={setHighlight} highlighted={highlighted} color={color}/>
      <ScoreMatrix rows={allRows} track={track} scoresOnly={scoresOnly} missingRegradeTiming={offlineOnly} onReport={report}/>
    </>}
    </div>
    {commonOpen&&commonAvailable&&<CommonComparison rows={editionRows} initialIds={chartRows.map(row=>row.runId)} api={props.api} rootId={data.status.rootId} rootEpoch={data.status.rootEpoch} onClose={()=>setCommonOpen(false)} onReport={id=>{setCommonOpen(false);report(id);}}/>}
    {referenceDetail&&<ReferenceDetails row={referenceDetail} onClose={()=>setReferenceDetail(undefined)}/>}
    {pickerScope===scope&&allRows.length>0&&<ChartSelectionDialog key={scope} scope={scope} rows={allRows}
      selected={chartRows.map(row=>row.configKey)} onApply={applySelection} onClose={()=>setPickerScope(undefined)}/>}
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

  return <Modal title="预置成绩" onClose={onClose}>
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
