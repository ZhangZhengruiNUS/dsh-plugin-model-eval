import * as React from 'react';
import {dimensionNames,rowName,type ComparisonRow} from '../../comparison/model.ts';

export type ProfileMode='radar'|'delta';

const signed=(value:number)=>{
  const rounded=Math.round(value*10)/10;
  return (rounded>0?'+':'')+rounded.toFixed(1);
};
const patterns=[undefined,'5 3','2 3','8 3 2 3'];

interface Props {
  rows: ComparisonRow[];
  baseKey: string|null;
  mode: ProfileMode;
  canCompare: boolean;
  onMode(mode:ProfileMode):void;
  onBaseline(key:string):void;
  onHighlight(key:string|null):void;
  highlighted: string|null;
  color(key:string):string;
}

export function AbilityProfile({rows,baseKey,mode,canCompare,onMode,onBaseline,onHighlight,highlighted,color}:Props){
  const track=rows[0]?.track??'general';
  const names=dimensionNames(rows[0]?.source,track);
  const limit=track==='general'?100:4;
  const base=rows.find(row=>row.configKey===baseKey)??rows[0];
  const peers=rows.filter(row=>row!==base);
  const showDelta=mode==='delta'&&canCompare;
  const spacing=Math.max(45,peers.length*16+14);
  const deltaHeight=Math.max(310,60+names.length*spacing);
  let maxDiff=0;
  for(const row of peers){
    row.dimensions.forEach((value,index)=>{
      const origin=base?.dimensions[index];
      if(value!=null&&origin!=null)maxDiff=Math.max(maxDiff,Math.abs(value-origin));
    });
  }
  const range=track==='general'?Math.max(2,Math.ceil(maxDiff/10)*10):Math.max(.5,Math.ceil(maxDiff*2)/2);
  const centerX=200, centerY=149, radius=103;
  const polar=(r:number,index:number)=>{
    const angle=-Math.PI/2+2*Math.PI*index/names.length;
    return [centerX+Math.cos(angle)*r,centerY+Math.sin(angle)*r] as const;
  };
  const radarLabel=track==='writing'?'五轴写作能力雷达图':names.length===5?'五轴任务能力雷达图':'四轴通用能力雷达图';
  const repetitions=new Map<string,number>();
  const dashes=rows.map(row=>{
    const tone=color(row.configKey),previous=repetitions.get(tone)??0;
    repetitions.set(tone,previous+1);
    return patterns[previous%patterns.length];
  });

  return <section className="me-card me-profile-card" aria-label="维度对比">
    <div className="me-chart-heading">
      <h2>维度对比</h2>
      {!showDelta&&rows.length>0&&<small>0–{limit} 分</small>}
      {canCompare&&<div className="me-profile-switch">
        <button aria-pressed={!showDelta} onClick={()=>onMode('radar')}>轮廓</button>
        <button aria-pressed={showDelta} onClick={()=>onMode('delta')}>差值</button>
      </div>}
    </div>
    {showDelta&&base&&<p className="me-profile-caption">差值基准 · {rowName(base)}</p>}
    {!rows.length?<div className="me-profile-empty">请在「图表配置」中选择要显示的配置。</div>:<div className="me-profile-content">
      <div className={showDelta?'me-profile-delta':undefined} tabIndex={showDelta&&deltaHeight>430?0:undefined}
        aria-label={showDelta?'维度差值图':undefined}>
        <svg className="me-profile-svg" role="img" aria-label={showDelta?'相对基准的能力差值':radarLabel}
          aria-description={showDelta?undefined:`分值范围 0–${limit} 分`}
          viewBox={`0 0 400 ${showDelta?deltaHeight:310}`} style={showDelta?{height:deltaHeight}:undefined}>
          {showDelta?<>
            <line className="me-delta-axis" x1="235" x2="235" y1="28" y2={deltaHeight-31}/>
            <text className="me-chart-tick" x="125" y="18" textAnchor="middle">−{range}</text>
            <text className="me-chart-tick" x="235" y="18" textAnchor="middle">0</text>
            <text className="me-chart-tick" x="345" y="18" textAnchor="middle">+{range}</text>
            {names.map((name,i)=>{
              const top=46+i*spacing;
              return <g key={name}>
                <text className="me-delta-name" x="12" y={top+4}>{name}</text>
                {peers.map((row,j)=>{
                  const value=row.dimensions[i], origin=base?.dimensions[i], y=top+j*16;
                  if(value==null||origin==null)return <text key={row.configKey} className="me-chart-tick" x="245" y={y+4}>缺失</text>;
                  const difference=value-origin,x=235+difference/range*110;
                  return <g key={row.configKey} className={highlighted&&highlighted!==row.configKey?'me-dim':''}>
                    <title>{rowName(row)} · {name} {signed(difference)}</title>
                    <line x1="235" x2={x} y1={y} y2={y} stroke={color(row.configKey)} className="me-delta-line"/>
                    <circle cx={x} cy={y} r="3.5" fill={color(row.configKey)}/>
                    <text className="me-delta-value" x={x+(difference>=0?8:-8)} y={y+4}
                      textAnchor={difference>=0?'start':'end'}>{signed(difference)}</text>
                  </g>;
                })}
              </g>;
            })}
            <text className="me-chart-tick" x="235" y={deltaHeight-9} textAnchor="middle">维度分差 · 左负右正</text>
          </>:<>
            {[1,2,3,4].map(level=><g key={level}>
              <polygon className="me-radar-grid" points={names.map((_,i)=>polar(radius*level/4,i).join(',')).join(' ')}/>
              <text className="me-radar-level" x={centerX+5} y={centerY-radius*level/4+4}>{limit*level/4}</text>
            </g>)}
            {names.map((name,i)=>{
              const [x,y]=polar(radius,i),[labelX,labelY]=polar(radius+29,i);
              return <g key={name}>
                <line className="me-radar-grid" x1={centerX} y1={centerY} x2={x} y2={y}/>
                <text className="me-radar-label" x={labelX} y={labelY+4}
                  textAnchor={Math.abs(labelX-centerX)<10?'middle':labelX<centerX?'end':'start'}>{name}</text>
              </g>;
            })}
            {rows.map((row,index)=>{
              const points=row.dimensions.map((value,i)=>value===null?null:polar(radius*value/limit,i));
              const strokeDasharray=dashes[index];
              return <g key={row.configKey} className={'me-radar-series'+(highlighted&&highlighted!==row.configKey?' me-dim':'')}
                onPointerEnter={()=>onHighlight(row.configKey)} onPointerLeave={()=>onHighlight(null)}
                style={{'--comparison-color':color(row.configKey)} as React.CSSProperties}>
                {points.some(point=>point===null)?points.map((point,i)=>{
                  const next=points[(i+1)%points.length];
                  return point&&next&&<line key={i} className="me-radar-outline" strokeDasharray={strokeDasharray}
                    x1={point[0]} y1={point[1]} x2={next[0]} y2={next[1]}/>;
                }):<polygon className="me-radar-outline" strokeDasharray={strokeDasharray} points={points.join(' ')}/>}
                {points.map((point,i)=>point&&<circle key={i} className="me-radar-vertex" cx={point[0]} cy={point[1]} r="3">
                  <title>{rowName(row)} · {names[i]} {row.dimensions[i]!.toFixed(1)}</title>
                </circle>)}
              </g>;
            })}
          </>}
        </svg>
      </div>
      <div className="me-profile-legend" aria-label="配置图例">
        {rows.map((row,index)=>{
          const name=rowName(row);
          const label=<><svg aria-hidden="true" viewBox="0 0 20 8" width="20" height="8">
              <line x1="1" x2="19" y1="4" y2="4" stroke={color(row.configKey)} strokeWidth="2" strokeDasharray={dashes[index]}/>
          </svg><span>{name}</span></>;
          return canCompare?<button key={row.configKey} type="button" title={name}
            onClick={()=>onBaseline(row.configKey)} onPointerEnter={()=>onHighlight(row.configKey)}
            onPointerLeave={()=>onHighlight(null)} onFocus={()=>onHighlight(row.configKey)} onBlur={()=>onHighlight(null)}
            aria-label={`将 ${name} 设为差值基准`} aria-pressed={row.configKey===baseKey}>{label}</button>
            :<span key={row.configKey} className="me-profile-series-label">{label}</span>;
        })}
      </div>
    </div>}
    {rows.some(row=>row.dimensions.some(value=>value===null))&&<p className="me-profile-caption">缺失维度以断线呈现。</p>}
    {showDelta&&base&&<details className="me-profile-summary">
      <summary>综合分与耗时差值</summary>
      <ul>{peers.map(row=>{
        const score=row.score==null||base.score==null?'—':signed(row.score-base.score)+' 分';
        const time=row.source.reuse?.mixedPeriod||base.source.reuse?.mixedPeriod||row.taskMeanMs==null||base.taskMeanMs==null
          ?'—':signed((row.taskMeanMs-base.taskMeanMs)/1000)+' 秒/题';
        return <li key={row.configKey}>{rowName(row)} · {score} · {time}</li>;
      })}</ul>
    </details>}
  </section>;
}
