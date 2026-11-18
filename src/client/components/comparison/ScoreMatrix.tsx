import {CountBadge,PresetTag} from '../DataReadout.tsx';
import {isFiveCapabilitySchema} from '../../../evaluation/five-schema.ts';
import * as React from 'react';import type {Track} from '../../../contracts.ts';
import {dimensionNames,modelDisplayName,rowName,rowSourceLabel,type ComparisonRow} from '../../comparison/model.ts';
import {ComparisonTable} from '../ComparisonTable.tsx';import {reasoningEffortLabel} from '../../ui.tsx';

type SortField='score'|'taskMeanMs'|'name'|`dim${number}`;
interface Props {
  rows:ComparisonRow[];track:Track;
  scoresOnly:boolean;missingRegradeTiming:boolean;
  onReport(id:string):void;
}
export function ScoreMatrix({rows,track,scoresOnly,missingRegradeTiming,onReport}:Props){
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
  const seconds=(v:number|null)=>v===null?'—':(v/1000).toFixed(1);
  return <section className="me-card me-matrix-card" aria-label="成绩矩阵">
    <ComparisonTable heading={<>
      <div className="me-matrix-title">
        <div className="me-count-heading">
          <h2>成绩矩阵</h2>
          <CountBadge count={rows.length} description={`共 ${rows.length} 个配置`}/>
        </div>
        {!scoresOnly&&missingRegradeTiming&&<p>旧答卷复判 · 无完整计时</p>}
      </div>
    </>}><table className={scoresOnly?'me-comparison me-scores-only':'me-comparison'}><thead><tr>
      {header('模型配置','name')}
      {header(track==='general'?(isFiveCapabilitySchema(rows[0]?.source.generalDefinition?.schema)?'任务综合分':'综合分'):'写作分','score')}
      {!scoresOnly&&header(track==='writing'?'作答耗时':'任务耗时','taskMeanMs','秒/题')}
      {names.map((name,i)=><React.Fragment key={name}>{header(name,`dim${i}`)}</React.Fragment>)}
    </tr></thead><tbody ref={body}>{ordered.map(row=>{
      const name=modelDisplayName(row);
      const effort=reasoningEffortLabel(row.target);
      const source=[rowSourceLabel(row),row.target.deployment?.value,effort,
        row.source.regradeOrigin?'离线复判':undefined,
        track==='writing'&&!row.judgeKey&&!row.reference?'裁判口径不明':undefined].filter(Boolean).join(' · ');
      return <tr data-key={row.configKey} key={row.configKey}>
        <th scope="row">
          <div className="me-matrix-model">
            <div className="me-compact-identity">
              <div className="me-preset-name">
                <button type="button" className="me-model-report" aria-haspopup="dialog"
                  title={rowName(row)} aria-label={`${row.reference?'查看预置成绩':'查看报告'} ${rowName(row)}`}
                  onClick={()=>onReport(row.runId)}>{name}</button>
                {row.reference&&<PresetTag/>}
              </div>
              <small title={source}>{source}</small>
            </div>
          </div>
        </th>
        <td className="me-primary-score"><span className="me-score large">{row.score?.toFixed(1)??'—'}</span></td>
        {!scoresOnly&&<td className="me-matrix-metric">
          {row.taskMeanMs==null
            ? <><span aria-hidden="true">—</span><span className="dsh-sr-only">缺少完整计时</span></>
            : seconds(row.taskMeanMs)}
        </td>}
        {row.dimensions.map((value,i)=><td key={i} className="me-matrix-value">{value?.toFixed(1)??'—'}</td>)}
      </tr>;
    })}</tbody></table></ComparisonTable></section>;
}
