import {Checkbox} from '../../primitives/primitives.tsx';
import {CountBadge} from '../DataReadout.tsx';
import {isFiveCapabilitySchema} from '../../../evaluation/five-schema.ts';
import * as React from 'react';import type {Track} from '../../../contracts.ts';
import {dimensionNames,modelDisplayName,rowName,rowSourceLabel,type ComparisonRow} from '../../comparison/model.ts';import type {ComparisonSelection} from '../../comparison/state.ts';
import {ComparisonTable} from '../ComparisonTable.tsx';import {ModelLabel} from '../../ui.tsx';import {time,targetKey} from '../../store.ts';import {zh as t} from '../../locales.ts';

function WritingJudgeReadout({row}:{row:ComparisonRow}){
  const scoredJudges=row.source.judges.filter(judge=>judge.itemIds.length>0);
  const [judge]=scoredJudges;
  const mixed=!row.judgeKey&&scoredJudges.length>1;
  const sameConfiguration=scoredJudges.some(judge=>targetKey(judge.snapshot.target)===targetKey(row.target));
  const judgeName=mixed?'混合裁判':sameConfiguration?'同模型':judge?.snapshot.target.modelId??'未记录';
  return <dl className="me-matrix-judge">
    <dt>{t.judge}</dt>
    <dd>{judgeName}{mixed&&sameConfiguration&&<span>包含自评</span>}</dd>
  </dl>;
}
type SortField='score'|'taskMeanMs'|'name'|`dim${number}`;
interface Props {
  rows:ComparisonRow[];selection:ComparisonSelection;track:Track;searchTotal?:number;
  scoresOnly:boolean;missingRegradeTiming:boolean;canCompare:boolean;
  tools:React.ReactNode;selectionTools:React.ReactNode;empty:React.ReactNode;
  onToggle(key:string):void;onReport(id:string):void;onHighlight(key:string|null):void;
  highlighted:string|null;color(key:string):string;
}
export function ScoreMatrix({rows,selection,track,searchTotal,scoresOnly,missingRegradeTiming,canCompare,tools,selectionTools,empty,onToggle,onReport,onHighlight,highlighted,color}:Props){
  const [preferredSort,setSort]=React.useState<{field:SortField;descending:boolean}>({field:'score',descending:true});
  const names=dimensionNames(rows[0]?.source,track);
  const field=preferredSort.field;
  const unavailableSort=(scoresOnly&&field==='taskMeanMs')||(field.startsWith('dim')&&Number(field.slice(3))>=names.length);
  const sort=unavailableSort?{field:'score' as const,descending:true}:preferredSort;
  const value=(r:ComparisonRow)=>sort.field==='name'?modelDisplayName(r):sort.field.startsWith('dim')?r.dimensions[Number(sort.field.slice(3))]??null:r[sort.field as 'score'|'taskMeanMs']??null;
  const ordered=[...rows].sort((a,b)=>{const av=value(a),bv=value(b);if(av===null)return bv===null?a.configKey.localeCompare(b.configKey):1;if(bv===null)return -1;return (typeof av==='string'?av.localeCompare(String(bv)):av-Number(bv))*(sort.descending?-1:1)||a.configKey.localeCompare(b.configKey);});
  const body=React.useRef<HTMLTableSectionElement>(null),positions=React.useRef(new Map<string,number>()),order=JSON.stringify(ordered.map(r=>r.configKey));
  React.useLayoutEffect(()=>{const animations:Animation[]=[],next=new Map<string,number>();for(const row of body.current?.rows??[]){const key=row.dataset.key!,top=row.offsetTop,previous=positions.current.get(key);next.set(key,top);if(previous!==undefined&&previous!==top&&!matchMedia('(prefers-reduced-motion: reduce)').matches)animations.push(row.animate([{transform:`translateY(${previous-top}px)`},{transform:'translateY(0)'}],{duration:240,easing:'ease-out'}));}positions.current=next;return()=>animations.forEach(a=>a.cancel());},[order]);
  const header=(label:string,field:SortField,unit?:string)=>{
    const active=sort.field===field;
    return <th scope="col" aria-sort={active?(sort.descending?'descending':'ascending'):undefined}>
      <button onClick={()=>setSort({field,descending:active?!sort.descending:field!=='name'&&field!=='taskMeanMs'})}>{label}<span className="me-matrix-sort" aria-hidden="true">{active?(sort.descending?'↓':'↑'):''}</span></button>
      {unit&&<small>{unit}</small>}
    </th>;
  };
  const number=(v:number|null)=>v===null?'—':v.toLocaleString('zh-CN'),seconds=(v:number|null)=>v===null?'—':(v/1000).toFixed(1);
  return <section className="me-card me-matrix-card" aria-label="成绩矩阵">
    <ComparisonTable heading={<>
      <div className="me-matrix-title">
        <div className="me-count-heading">
          <h2>成绩矩阵</h2>
          <div className="me-count-with-label me-matrix-count" role="status">
            {searchTotal !== undefined && <small aria-hidden="true">匹配</small>}
            <CountBadge count={rows.length} total={searchTotal}
              description={searchTotal === undefined ? `当前显示 ${rows.length} 个配置` : `匹配 ${rows.length} 个配置，共 ${searchTotal} 个配置`}/>
          </div>
        </div>
        {!scoresOnly&&missingRegradeTiming&&<p>旧答卷复判 · 无完整计时</p>}
      </div>
      <div className="me-matrix-tools">{tools}</div>
    </>} beforeTable={selectionTools} empty={empty}>{rows.length>0&&<table className={scoresOnly?'me-comparison me-scores-only':'me-comparison'}><thead><tr>
      {header('模型配置','name')}{header(track==='general'?(isFiveCapabilitySchema(rows[0]?.source.generalDefinition?.schema)?'任务综合分':'综合分'):'写作分','score')}{names.map((name,i)=><React.Fragment key={name}>{header(name,`dim${i}`)}</React.Fragment>)}
      {!scoresOnly&&<>{header(track==='writing'?'平均作答耗时':'平均任务耗时','taskMeanMs','秒/题')}<th scope="col">已知用量<small>Token · 含重试，不含裁判</small></th></>}
    </tr></thead><tbody ref={body}>{ordered.map(row=><tr data-key={row.configKey} key={row.configKey} className={(canCompare&&selection.selected.includes(row.configKey)?'selected ':'')+(highlighted===row.configKey?'highlighted':'')} onPointerEnter={()=>onHighlight(row.configKey)} onPointerLeave={()=>onHighlight(null)} style={{'--comparison-color':color(row.configKey)} as React.CSSProperties}>
    <td>
      <div className="me-matrix-model">
        {canCompare&&<Checkbox aria-label={`对比 ${rowName(row)}`}
          checked={selection.selected.includes(row.configKey)} onChange={()=>onToggle(row.configKey)}/>}
        <div>
          <ModelLabel target={row.target} displayName={modelDisplayName(row)} secondaryLabel={rowSourceLabel(row)} showParams nameAction={{
            label:`${row.reference?'查看内置参考':'查看报告'} ${modelDisplayName(row)}`,
            onClick:()=>onReport(row.runId),
          }}/>
          <div className="me-matrix-meta">
            {row.source.regradeOrigin&&<span className="me-reference-badge">旧答卷离线复判</span>}
            {row.reference&&<span className="me-reference-badge">内置参考</span>}
            <small className="me-date">{time(row.completedAt??undefined)}</small>
          </div>
          {track==='writing'&&<WritingJudgeReadout row={row}/>}
        </div>
      </div>
    </td>
    <td className="me-primary-score"><span className="me-score large">{row.score?.toFixed(1)??'—'}</span></td>{row.dimensions.map((v,i)=><td key={i} className="me-matrix-value">{v?.toFixed(1)??'—'}</td>)}
    {!scoresOnly&&<>
      <td className="me-matrix-metric"><span>{seconds(row.taskMeanMs??null)}</span>{row.taskTimingSource&&<small>沿用原答卷计时</small>}{!row.wallReplay&&<small>{row.execution.state==='known'?`并发${row.execution.concurrency}`:row.execution.reason==='mixed'?'分阶段执行':'并发未记录'}</small>}</td><td className="me-matrix-metric">{row.wallReplay?<span>—</span>:<><span>输入 {number(row.usage.inputTokens)}</span><span>输出 {number(row.usage.outputTokens)}</span>{row.usage.totalTokens!==null&&<span>已知总量 {number(row.usage.totalTokens)}</span>}<small>{row.source.regradeOrigin?'复判新增用量为 0':row.referenceEdition?`仅新增 ${row.referenceEdition.newItems} 题`:row.usage.completeness==='partial'?'部分用量':'完整性未知'}</small></>}</td>
    </>}
  </tr>)}</tbody></table>}</ComparisonTable></section>;
}
