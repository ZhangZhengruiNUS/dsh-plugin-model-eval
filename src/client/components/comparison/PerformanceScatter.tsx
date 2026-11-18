import * as React from 'react';
import {scatterGuides,clusterPoints,layoutScatterLabels,scatterLabelFontSize,scatterScoreAxis,plottable} from '../../comparison/geometry.ts';
import {PresetTag} from '../DataReadout.tsx';
import type {Track} from '../../../contracts.ts';
import {zh as t} from '../../locales.ts';
import {modelName,restoredTaskTiming,rowName,type ComparisonRow} from '../../comparison/model.ts';import {Button} from '../../ui.tsx';import {ChartPopover} from './ChartPopover.tsx';
const pointHitRadius = 18;
const labelText=(text:string)=>text.length>28?text.slice(0,26)+'…':text;
// Account for full-width and wide Latin glyphs, with padding for semibold labels.
const labelWidth=(text:string,size:number)=>Array.from(text).reduce((width,char)=>width+size*(/[^\x00-\x7f]|[MmWw@%&]/.test(char)?1:.69),0);
type TipAnchor=SVGElement|HTMLButtonElement;
interface Props {
  track:Track;rows:ComparisonRow[];guideRows:ComparisonRow[];guideControl:React.ReactNode;selectionControl:React.ReactNode;selectionOpen:boolean;
  onReport(id:string):void;onHighlight(key:string|null):void;highlighted:string|null;color(key:string):string;
}
export function PerformanceScatter({track,rows,guideRows,guideControl,selectionControl,selectionOpen,onReport,onHighlight,highlighted,color}:Props){
  const stage=React.useRef<HTMLDivElement>(null),[width,setWidth]=React.useState(600),[tip,setTip]=React.useState<{keys:string[];key:string;anchor:TipAnchor;pinned:boolean}|null>(null),suppressFocus=React.useRef(false);
  React.useLayoutEffect(()=>{const node=stage.current;if(!node)return;const measure=()=>setWidth(Math.max(280,node.clientWidth));const ob=new ResizeObserver(measure);ob.observe(node);measure();return()=>ob.disconnect();},[]);
  const W=width,H=320,L=42,R=23,T=34,B=43,groups=clusterPoints(rows),maxValue=Math.max(1,...groups.map(g=>g.value/1000)),unit=maxValue>15?5:maxValue>8?2:maxValue>3?1:.5,max=Math.ceil(maxValue*1.15/unit)*unit;
  const scoreAxis=scatterScoreAxis(groups);
  const x=(seconds:number)=>L+seconds/max*(W-L-R);
  const y=(score:number)=>T+(100-score)/(100-scoreAxis.min)*(H-T-B);
  const {frontier,region,execution,unavailable}=scatterGuides(guideRows);
  const guideCandidates=plottable(guideRows).filter(row=>!row.reference);
  const guideKeys=new Set(guideCandidates.map(row=>row.configKey));
  const comparingJudge=guideRows!==rows;
  const close=React.useCallback(()=>{setTip(null);onHighlight(null);},[onHighlight]);
  React.useEffect(()=>{if(selectionOpen)close();},[selectionOpen,close]);
  const focusPoint=React.useCallback((anchor:TipAnchor)=>{
    suppressFocus.current=true;
    anchor.focus({preventScroll:true});
    suppressFocus.current=false;
  },[]);
  const escape=React.useCallback(()=>{const anchor=tip?.anchor;close();if(anchor)focusPoint(anchor);},[tip?.anchor,close,focusPoint]);
  const show=(group:ComparisonRow[],anchor:TipAnchor,pinned:boolean)=>{const current=group[0]!;setTip({keys:group.map(r=>r.configKey),key:current.configKey,anchor,pinned});onHighlight(current.configKey);};

  function pointAtPointer({currentTarget:svg,clientX,clientY}:React.MouseEvent<SVGSVGElement>) {
    const toScreen=svg.getScreenCTM();
    if(!toScreen)return;
    const pointer=new DOMPoint(clientX,clientY).matrixTransform(toScreen.inverse());
    let nearest=-1;
    let shortest=Infinity;
    for(const [index,group] of groups.entries()){
      const px=x(group.value/1000),py=y(group.score);
      // Keep the plot radius and compare eligible centers in screen pixels.
      if((px-pointer.x)**2+(py-pointer.y)**2>pointHitRadius**2)continue;
      const screen=new DOMPoint(px,py).matrixTransform(toScreen);
      const distance=(screen.x-clientX)**2+(screen.y-clientY)**2;
      if(distance<shortest){shortest=distance;nearest=index;}
    }
    if(nearest<0)return;
    const anchor=svg.querySelector<SVGGElement>(`[data-scatter-index="${nearest}"]`);
    if(anchor)return {anchor,group:groups[nearest]!.rows};
  }

  function previewPoint(event:React.PointerEvent<SVGSVGElement>) {
    if(event.pointerType==='touch')return;
    const point=pointAtPointer(event);
    event.currentTarget.style.cursor=point?'pointer':'';
    if(tip?.pinned)return;
    if(point){
      if(tip?.anchor!==point.anchor)show(point.group,point.anchor,false);
    }else if(tip)close();
  }

  function pinPoint(event:React.MouseEvent<SVGSVGElement>) {
    // Assistive-technology clicks are handled by the focused point.
    if(event.detail===0)return;
    const point=pointAtPointer(event);
    if(point){
      focusPoint(point.anchor);
      show(point.group,point.anchor,true);
    }else if(tip)escape();
  }
  const chosen=rows.find(r=>r.configKey===tip?.key),plotted=groups.reduce((n,g)=>n+g.rows.length,0);
  const writing=track==='writing';
  const chartTitle=writing?'写作成绩与作答耗时':'能力与任务耗时';
  const timeLabel=writing?'平均作答耗时':'平均任务耗时';
  const scoreLabel=writing?'写作分':'能力分';
  const staged=groups.some(g=>g.rows.some(restoredTaskTiming));
  const frontierKeys=new Set(frontier.map(point=>point.score+'|'+point.seconds));
  const unavailableNote=unavailable==='protocol'?'协议未核定，暂不绘制前沿':unavailable==='judge'?'裁判不同或未记录，暂不绘制前沿':'';
  const otherJudges=comparingJudge&&groups.some(group=>group.rows.some(row=>!row.reference&&!guideKeys.has(row.configKey)));
  const provenance=[staged?(writing?'○ 分阶段计时':'○ 沿用原批次计时'):'',rows.some(row=>row.reference)?'预置点单列':'',
    comparingJudge&&!guideControl?`裁判 ${guideCandidates[0]?.judgeLabel}`:'',
    otherJudges?'淡色为其他裁判口径':''].filter(Boolean).join(' · ');
  const representatives=groups.map(group=>group.rows[0]!);
  const titles=representatives.map(row=>labelText(modelName(row)));
  const titleCounts=new Map<string,number>();
  for(const title of titles)titleCounts.set(title,(titleCounts.get(title)??0)+1);
  const points=groups.map((group,index)=>{
    const row=representatives[index]!;
    const name=titles[index]!;
    const title=(titleCounts.get(name)??0)>1&&!row.reference?name+' · '+labelText(row.target.providerId):name;
    const selectedPoint=Boolean(row.reference)||frontierKeys.has(group.score+'|'+group.value/1000);
    const markRadius=group.rows.length>1?9:selectedPoint?7:5;
    return {group,row,title,markRadius,key:group.score+'|'+group.value,
      x:x(group.value/1000),y:y(group.score),radius:row.reference?15:markRadius+3,
      width:Math.ceil(labelWidth(title,scatterLabelFontSize))+(row.reference?31:0),selected:selectedPoint};
  });
  const labels=layoutScatterLabels(points,{left:L,right:W-R,top:T-20,bottom:H-B});
  const unlabelled=points.filter(point=>!labels.has(point.key));
  return <section className="me-card me-scatter-card">
    <div className="me-chart-heading me-primary-chart-heading">
      <h2>{chartTitle}</h2>
      {guideControl&&<div className="me-guide-control">{guideControl}</div>}
      <div className="me-chart-selection-controls">{selectionControl}</div>
    </div>
    <div className="me-chart-controls">
      <small>← {writing?'作答':'任务'}耗时更短 · 分数更高 ↑</small>
      {scoreAxis.min>0&&<small>纵轴从 {scoreAxis.min} 分起</small>}
    </div>
    <div className="me-scatter-stage" ref={stage}><svg role="group"
      aria-label={`${chartTitle}散点图，纵轴 ${scoreAxis.min} 至 100 分`} viewBox={`0 0 ${W} ${H}`}
      onPointerMove={previewPoint} onPointerLeave={event=>{
        event.currentTarget.style.cursor='';
        if(tip&&!tip.pinned)close();
      }} onClick={pinPoint}>
      {region&&<rect className="me-chart-advantage" aria-hidden="true" x={L} y={T}
        width={x(region.seconds)-L} height={y(region.score)-T}/>}
      {scoreAxis.ticks.map(score=><g key={'y'+score}><line className="me-chart-grid" x1={L} x2={W-R} y1={y(score)} y2={y(score)}/><text className="me-chart-tick" x={L-10} y={y(score)+3} textAnchor="end">{score}</text></g>)}
      {Array.from({length:6},(_,i)=><g key={'x'+i}><line className="me-chart-grid" y1={T} y2={H-B} x1={x(max*i/5)} x2={x(max*i/5)}/><text className="me-chart-tick" x={x(max*i/5)} y={H-B+19} textAnchor="middle">{Number((max*i/5).toFixed(1))}</text></g>)}
      <text className="me-chart-tick" x={L-10} y={15}>{scoreLabel}</text><text className="me-chart-tick" x={W-R} y={H-3} textAnchor="end">{timeLabel} · 秒/题</text>
      {frontier.length>1&&<path className="me-frontier" aria-hidden="true"
        d={frontier.map(({seconds,score},i)=>(i?'L':'M')+x(seconds)+','+y(score)).join(' ')}/>}
      {points.map((point,index)=>{
        const {group:g,row:r,x:px,y:py,key,title,markRadius}=point,label=labels.get(key);
        const linked=g.rows.some(row=>row.configKey===highlighted);
        const outsideJudge=comparingJudge&&g.rows.every(row=>!row.reference&&!guideKeys.has(row.configKey));
        const onFrontier=g.rows.some(row=>guideKeys.has(row.configKey))&&frontierKeys.has(g.score+'|'+g.value/1000);
        return <g key={key} className={'me-plot-point'+(r.reference?' me-reference-point':'')+(g.rows.every(restoredTaskTiming)?' me-staged-point':'')+(highlighted&&!linked?' me-dim':'')} role="button" tabIndex={0} data-scatter-index={index}
          data-linked={linked||undefined} data-outside-judge={outsideJudge||undefined}
          data-inspected={g.rows.some(row=>row.configKey===tip?.key)||undefined}
          aria-label={`${rowName(r)}${r.reference?'，预置':''}${r.taskTimingSource==='writing-replacement'?'，分阶段计时':r.taskTimingSource==='original-general'?'，沿用原批次计时':''}，${g.score.toFixed(1)}分，${(g.value/1000).toFixed(2)}秒${onFrontier?'，帕累托前沿':''}${outsideJudge?'，其他裁判口径':''}${g.rows.length>1?'，同坐标 '+g.rows.length+' 个配置':''}`}
          style={{'--comparison-color':color(r.configKey)} as React.CSSProperties}
          onFocus={e=>{if(!suppressFocus.current)show(g.rows,e.currentTarget,true);}}
          onClick={e=>{if(e.detail===0)show(g.rows,e.currentTarget,true);}}
          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(g.rows,e.currentTarget,true);}}}>
          <circle className="me-point-ring" cx={px} cy={py} r={13}/>
          {onFrontier&&frontier.length===1&&<circle className="me-frontier me-frontier-point" aria-hidden="true" cx={px} cy={py} r={markRadius+3}/>}
          <circle className="me-point-shape" cx={px} cy={py} r={markRadius}/>
          {g.rows.length>1&&<text className="me-point-count" x={px} y={py+3} textAnchor="middle">{g.rows.length}</text>}
          {label&&<>
            <line className="me-point-leader" x1={label.leaderStartX} y1={label.leaderStartY} x2={label.leaderX} y2={label.leaderY}/>
            {r.reference?<foreignObject aria-hidden="true" className="me-plot-preset me-point-label"
              x={label.tx-(label.anchor==='end'?point.width:label.anchor==='middle'?point.width/2:0)}
              y={label.ty-10} width={point.width} height={14}>
              <div className="me-preset-name" style={{fontSize:scatterLabelFontSize}}>{title}<PresetTag/></div>
            </foreignObject>:<text className={'me-point-label'+(point.selected?' selected':'')} x={label.tx} y={label.ty}
              textAnchor={label.anchor} fontSize={scatterLabelFontSize}>{title}</text>}
          </>}
        </g>;
      })}
      {!groups.length&&<text className="me-chart-empty" x={W/2} y={H/2} textAnchor="middle">{rows.length?'所选配置缺少完整计时':'请在「图表配置」中选择要显示的配置'}</text>}
    </svg>
    {!!unlabelled.length&&<ul className="me-scatter-overflow" aria-label="未在图内标注的配置">
      {unlabelled.map(point=><li key={point.key}><Button kind="text"
        style={{'--comparison-color':color(point.row.configKey)} as React.CSSProperties}
        onClick={event=>show(point.group.rows,event.currentTarget,true)}>
        <span className="me-scatter-swatch" aria-hidden="true"/><span className="me-preset-name">{rowName(point.row)}{point.row.reference&&<PresetTag/>}</span>
      </Button></li>)}
    </ul>}
    </div>
    {(frontier.length>0||region||provenance||unavailableNote||plotted<rows.length)&&<div className="me-chart-footer">
      <div className="me-chart-legend">
        {frontier.length>0&&<span><span className={frontier.length>1?'me-frontier-swatch':'me-frontier-dot'} aria-hidden="true"/>
          {frontier.length>1?'帕累托前沿':'帕累托最优点'}{execution?'':' · 按观测值'} · {guideCandidates.length} 个配置
        </span>}
        {region&&<span><span className="me-advantage-swatch" aria-hidden="true"/>
          高分短耗时区 · ≥ {Number(region.score.toFixed(1))} 分 · ≤ {Number(region.seconds.toFixed(2))} 秒/题
        </span>}
        {unavailableNote&&<span>{unavailableNote}</span>}
      </div>
      {plotted<rows.length&&<span>{rows.length-plotted} 个配置缺少可绘制计时，见成绩矩阵</span>}
      {(provenance||execution)&&<span>{[provenance,execution?`并发 ${execution.concurrency} · ${execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'} ${execution.callTimeoutMs/1000}秒`:''].filter(Boolean).join(' · ')}</span>}
    </div>}
    {tip&&chosen&&<ChartPopover anchor={tip.anchor.querySelector('.me-point-shape')??tip.anchor} pointerArea={stage.current} preview={!tip.pinned} onClose={escape}><div className="me-tip-heading"><span className="me-preset-name"><strong>{chosen.reference?modelName(chosen):rowName(chosen)}</strong>{chosen.reference&&<PresetTag/>}</span><button aria-label="关闭配置详情" onClick={escape}>×</button></div>{tip.keys.length>1&&<div className="me-tip-cluster">{tip.keys.map(k=>{const row=rows.find(r=>r.configKey===k);return row&&<button key={k} onClick={()=>{setTip({...tip,key:k});onHighlight(k);}}>查看配置 {rowName(row)}</button>;})}</div>}<dl><div><dt>{scoreLabel}</dt><dd>{chosen.score?.toFixed(1)??'—'}</dd></div><div><dt>{timeLabel}</dt><dd>{(chosen.taskMeanMs!/1000).toFixed(2)}秒/题</dd></div>{chosen.taskTimingSource&&<div><dt>计时来源</dt><dd>{chosen.taskTimingSource==='writing-replacement'?'沿用题和补测题的实测作答时间':chosen.taskTimingSource==='original-general'?'原批次的实测任务时间':'沿用原答卷计时'}</dd></div>}<div><dt>已计时任务</dt><dd>{chosen.taskTiming?.measured??'未记录'}</dd></div>{chosen.taskTimingSource!=='writing-replacement'&&<><div><dt>调用中位 / P95</dt><dd>{chosen.latencyMs===null?'—':(chosen.latencyMs/1000).toFixed(2)} / {chosen.latencyP95Ms===null?'—':(chosen.latencyP95Ms/1000).toFixed(2)}秒</dd></div><div><dt>TTFT</dt><dd>{chosen.ttftMs===null?'未记录':(chosen.ttftMs/1000).toFixed(2)+'秒'}</dd></div></>}<div><dt>评测完成</dt><dd>{chosen.completedAt?new Date(chosen.completedAt).toLocaleString('zh-CN'):'未记录'}</dd></div><div><dt>运行条件</dt><dd>{chosen.taskTimingSource==='original-general'?'见原批次报告':chosen.execution.state==='known'?`并发${chosen.execution.concurrency} · ${chosen.execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'}${chosen.execution.callTimeoutMs/1000}秒`:chosen.execution.reason==='mixed'?'分阶段执行，见报告':'未记录'}</dd></div>{chosen.reference&&<div><dt>测试渠道</dt><dd>{chosen.reference}</dd></div>}{chosen.track==='writing'&&<div><dt>{t.judge}</dt><dd>{chosen.judgeLabel}</dd></div>}</dl><details><summary>参数快照</summary><pre>{JSON.stringify(chosen.target.controls,null,2)}</pre></details><div className="me-tip-actions">
      <Button kind="text" onClick={()=>{close();onReport(chosen.runId);}}>{chosen.reference?'查看预置成绩':'查看报告'}</Button>
    </div></ChartPopover>}
  </section>;
}
