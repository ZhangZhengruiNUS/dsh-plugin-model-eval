import * as React from 'react';import {frontier,clusterPoints} from '../../comparison/geometry.ts';
import {CountBadge} from '../DataReadout.tsx';
import {zh as t} from '../../locales.ts';
import {modelName,rowName,rowSourceLabel,type ComparisonRow} from '../../comparison/model.ts';import {Button} from '../../ui.tsx';import {ChartPopover} from './ChartPopover.tsx';
const pointHitRadius = 18;
interface Props {rows:ComparisonRow[];selected:string[];onToggle:((key:string)=>void)|undefined;onReport(id:string):void;onHighlight(key:string|null):void;highlighted:string|null;color(key:string):string}
export function PerformanceScatter({rows,selected,onToggle,onReport,onHighlight,highlighted,color}:Props){
  const stage=React.useRef<HTMLDivElement>(null),[width,setWidth]=React.useState(600),[tip,setTip]=React.useState<{keys:string[];key:string;anchor:SVGElement;pinned:boolean}|null>(null),suppressFocus=React.useRef(false);
  React.useLayoutEffect(()=>{const node=stage.current;if(!node)return;const measure=()=>setWidth(Math.max(280,node.clientWidth));const ob=new ResizeObserver(measure);ob.observe(node);measure();return()=>ob.disconnect();},[]);
  const W=width,H=320,L=42,R=23,T=34,B=43,groups=clusterPoints(rows),maxValue=Math.max(1,...groups.map(g=>g.value/1000)),unit=maxValue>15?5:maxValue>8?2:maxValue>3?1:.5,max=Math.ceil(maxValue*1.15/unit)*unit;
  const x=(seconds:number)=>L+seconds/max*(W-L-R),y=(score:number)=>T+(100-score)/100*(H-T-B),border=frontier(rows),front=rows.filter(r=>border.includes(r.configKey)).sort((a,b)=>a.taskMeanMs!-b.taskMeanMs!);
  const close=React.useCallback(()=>{setTip(null);onHighlight(null);},[onHighlight]);
  const focusPoint=React.useCallback((anchor:SVGElement)=>{
    suppressFocus.current=true;
    anchor.focus({preventScroll:true});
    suppressFocus.current=false;
  },[]);
  const escape=React.useCallback(()=>{const anchor=tip?.anchor;close();if(anchor)focusPoint(anchor);},[tip?.anchor,close,focusPoint]);
  const show=(group:ComparisonRow[],anchor:SVGElement,pinned:boolean)=>{const current=group.find(r=>selected.includes(r.configKey))??group[0]!;setTip({keys:group.map(r=>r.configKey),key:current.configKey,anchor,pinned});onHighlight(current.configKey);};

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
  const chosen=rows.find(r=>r.configKey===tip?.key),plotted=groups.reduce((n,g)=>n+g.rows.length,0),occupied:{left:number;right:number;top:number;bottom:number}[]=[];
  const writing=rows[0]?.track==='writing';
  const chartTitle=writing?'写作成绩与作答耗时':'能力与任务耗时';
  const timeLabel=writing?'平均作答耗时':'平均任务耗时';
  const scoreLabel=writing?'写作分':'能力分';
  const observations=groups.flatMap(g=>g.rows).filter(row=>!row.reference),conditionsDiffer=observations.some(r=>r.execution.state==='unknown')||new Set(observations.map(r=>JSON.stringify(r.execution))).size>1,judgesDiffer=observations[0]?.track==='writing'&&(observations.some(r=>!r.judgeKey)||new Set(observations.map(r=>r.judgeKey)).size>1);
  const boundaryNote=border.length?'┄ 当前观测候选边界':observations.some(r=>!r.protocolKnown)?'未知协议，仅展示观测，不连接统一边界':groups.filter(group=>group.rows.some(row=>!row.reference)).length<2?'至少两个不同坐标的可比配置才能形成边界':conditionsDiffer?'条件不同或未记录，不连接统一边界':judgesDiffer?'裁判不同或未记录，不连接统一边界':'当前只有一个非支配观测点，无需连线';
  const labels=new Map<string,{tx:number;ty:number;anchor:'start'|'end'}>();
  for(const g of [...groups].sort((a,b)=>Number(b.rows.some(r=>selected.includes(r.configKey)))-Number(a.rows.some(r=>selected.includes(r.configKey))))){const r=g.rows.find(r=>selected.includes(r.configKey))??g.rows[0]!,px=x(g.value/1000),py=y(g.score),lw=Math.min(r.reference?185:155,Math.max(modelName(r).length,rowSourceLabel(r).length)*5.3);
    for(const [dx,dy,align] of [[12,-24,'start'],[12,22,'start'],[-12,-24,'end'],[-12,23,'end']] as const){const tx=px+dx,ty=py+dy,left=align==='start'?tx:tx-lw,box={left,right:left+lw,top:ty-10,bottom:ty+15};if(box.left<L||box.right>W-R||box.top<T-20||box.bottom>H-B||occupied.some(b=>!(box.right+6<b.left||box.left-6>b.right||box.bottom+4<b.top||box.top-4>b.bottom)))continue;labels.set(g.score+'|'+g.value,{tx,ty,anchor:align});occupied.push(box);break;}}
  return <section className="me-card me-scatter-card">
    <div className="me-chart-heading">
      <h2>{chartTitle}</h2>
      {plotted<rows.length&&<span className="me-count-with-label">
        <small aria-hidden="true">已绘制</small>
        <CountBadge count={plotted} total={rows.length} description={`已绘制 ${plotted} 个配置，共 ${rows.length} 个配置`}/>
      </span>}
    </div>
    <div className="me-chart-controls"><small>← {writing?'作答':'任务'}耗时更短 · 分数更高 ↑</small></div>
    <div className="me-scatter-stage" ref={stage}><svg role="group" aria-label={chartTitle+'散点图'} viewBox={`0 0 ${W} ${H}`}
      onPointerMove={previewPoint} onPointerLeave={event=>{
        event.currentTarget.style.cursor='';
        if(tip&&!tip.pinned)close();
      }} onClick={pinPoint}>
      {Array.from({length:6},(_,i)=><g key={'y'+i}><line className="me-chart-grid" x1={L} x2={W-R} y1={y(i*20)} y2={y(i*20)}/><text className="me-chart-tick" x={L-10} y={y(i*20)+3} textAnchor="end">{i*20}</text></g>)}
      {Array.from({length:6},(_,i)=><g key={'x'+i}><line className="me-chart-grid" y1={T} y2={H-B} x1={x(max*i/5)} x2={x(max*i/5)}/><text className="me-chart-tick" x={x(max*i/5)} y={H-B+19} textAnchor="middle">{Number((max*i/5).toFixed(1))}</text></g>)}
      <text className="me-chart-tick" x={L-10} y={15}>{scoreLabel}</text><text className="me-chart-tick" x={W-R} y={H-3} textAnchor="end">{timeLabel} · 秒/题</text>
      {!!front.length&&<path className="me-frontier" d={front.map((r,i)=>(i?'L':'M')+x(r.taskMeanMs!/1000)+','+y(r.score!)).join(' ')}/>}
      {groups.map((g,index)=>{const r=g.rows.find(r=>selected.includes(r.configKey))??g.rows[0]!,px=x(g.value/1000),py=y(g.score),label=labels.get(g.score+'|'+g.value),source=rowSourceLabel(r),dim=highlighted&&!g.rows.some(r=>r.configKey===highlighted);return <g key={g.score+'|'+g.value} className={'me-plot-point'+(r.reference?' me-reference-point':'')+(dim?' me-dim':'')} role="button" tabIndex={0} data-scatter-index={index} data-inspected={g.rows.some(row=>row.configKey===tip?.key)||undefined} aria-label={`${rowName(r)}${r.reference?'，内置参考':''}，${g.score.toFixed(1)}分，${(g.value/1000).toFixed(2)}秒${g.rows.length>1?'，同坐标 '+g.rows.length+' 个配置':''}`} style={{'--comparison-color':color(r.configKey)} as React.CSSProperties} onFocus={e=>{if(!suppressFocus.current)show(g.rows,e.currentTarget,true);}} onClick={e=>{if(e.detail===0)show(g.rows,e.currentTarget,true);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(g.rows,e.currentTarget,true);}}}>
        <circle className="me-point-ring" cx={px} cy={py} r={13}/><circle className="me-point-shape" cx={px} cy={py} r={g.rows.length>1?9:selected.includes(r.configKey)?7:5}/>{g.rows.length>1&&<text className="me-point-count" x={px} y={py+3} textAnchor="middle">{g.rows.length}</text>}{label&&<line className="me-point-leader" x1={px} y1={py} x2={label.tx} y2={label.ty-3}/>}<React.Fragment>{label&&<text className={'me-point-label'+(selected.includes(r.configKey)?' selected':'')} x={label.tx} y={label.ty} textAnchor={label.anchor}><tspan x={label.tx}>{modelName(r).length>28?modelName(r).slice(0,26)+'…':modelName(r)}{r.reference?' · 参考':''}</tspan><tspan className='me-point-provider' x={label.tx} dy='12'>{!r.reference&&source.length>28?source.slice(0,26)+'…':source}</tspan></text>}</React.Fragment></g>;})}
      {!groups.length&&<text className="me-chart-empty" x={W/2} y={H/2} textAnchor="middle">缺少完整任务计时，暂无法绘制</text>}
    </svg></div><div className="me-chart-footer"><span>{boundaryNote}{rows.some(row=>row.reference)&&' · 参考点单列'}</span>{border.length>0&&front[0]?.execution.state==='known'&&<small>并发 {front[0].execution.concurrency} · {front[0].execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'} {front[0].execution.callTimeoutMs/1000}秒</small>}</div>
    {tip&&chosen&&<ChartPopover anchor={tip.anchor} pointerArea={stage.current} preview={!tip.pinned} onClose={escape}><div className="me-tip-heading"><strong>{chosen.reference?modelName(chosen):rowName(chosen)}</strong><button aria-label="关闭配置详情" onClick={escape}>×</button></div>{tip.keys.length>1&&<div className="me-tip-cluster">{tip.keys.map(k=>{const row=rows.find(r=>r.configKey===k);return row&&<button key={k} onClick={()=>{setTip({...tip,key:k});onHighlight(k);}}>查看配置 {rowName(row)}</button>;})}</div>}<dl><div><dt>{scoreLabel}</dt><dd>{chosen.score?.toFixed(1)??'—'}</dd></div><div><dt>{timeLabel}</dt><dd>{(chosen.taskMeanMs!/1000).toFixed(2)}秒/题</dd></div>{chosen.taskTimingSource&&<div><dt>计时来源</dt><dd>沿用原答卷计时</dd></div>}<div><dt>已计时任务</dt><dd>{chosen.taskTiming?.measured??'未记录'}</dd></div><div><dt>调用中位 / P95</dt><dd>{chosen.latencyMs===null?'—':(chosen.latencyMs/1000).toFixed(2)} / {chosen.latencyP95Ms===null?'—':(chosen.latencyP95Ms/1000).toFixed(2)}秒</dd></div><div><dt>TTFT</dt><dd>{chosen.ttftMs===null?'未记录':(chosen.ttftMs/1000).toFixed(2)+'秒'}</dd></div><div><dt>评测完成</dt><dd>{chosen.completedAt?new Date(chosen.completedAt).toLocaleString('zh-CN'):'未记录'}</dd></div><div><dt>运行条件</dt><dd>{chosen.execution.state==='known'?`并发${chosen.execution.concurrency} · ${chosen.execution.failurePolicy==='output-idle-v1'?'无输出等待':'调用超时'}${chosen.execution.callTimeoutMs/1000}秒`:chosen.execution.reason==='mixed'?'分阶段执行，见报告':'未记录'}</dd></div>{chosen.reference&&<div><dt>测试渠道</dt><dd>{chosen.reference}</dd></div>}{chosen.track==='writing'&&<div><dt>{t.judge}</dt><dd>{chosen.judgeLabel}</dd></div>}</dl>{chosen.reference&&<p>内置参考</p>}<details><summary>参数快照</summary><pre>{JSON.stringify(chosen.target.controls,null,2)}</pre></details><div className="me-tip-actions">{onToggle&&<Button onClick={()=>onToggle(chosen.configKey)}>{selected.includes(chosen.configKey)?'移出对比':'加入对比'}</Button>}<Button onClick={()=>{close();onReport(chosen.runId);}}>{chosen.reference?'查看参考详情':'查看报告'}</Button></div></ChartPopover>}
  </section>;
}
