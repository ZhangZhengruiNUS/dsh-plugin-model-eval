import {restoredTaskTiming,stable,type ComparisonRow} from './model.ts';
export type ResponseMetric='taskMeanMs'|'latencyMs'|'ttftMs';
export function plottable(rows:readonly ComparisonRow[],metric:ResponseMetric='taskMeanMs'):ComparisonRow[]{return rows.filter(r=>(!r.source.reuse?.mixedPeriod||metric==='taskMeanMs'&&restoredTaskTiming(r))&&r.score!==null&&Number.isFinite(r.score)&&r[metric]!=null&&Number.isFinite(r[metric])&&r[metric]!>=0);}
interface ScatterGuides {
  frontier:{score:number;seconds:number}[];
  region:{score:number;seconds:number}|null;
  execution:Extract<ComparisonRow['execution'],{state:'known'}>|null;
  unavailable?:'protocol'|'judge';
}

function median(values:number[]):number {
  values.sort((a,b)=>a-b);
  return (values[Math.floor((values.length-1)/2)]!+values[Math.floor(values.length/2)]!)/2;
}

export function writingGuideGroups(rows:readonly ComparisonRow[]) {
  const groups=new Map<string,{key:string;label:string;rows:ComparisonRow[]}>();
  for(const row of plottable(rows)){
    const key=row.judgeKey;
    if(row.reference||!row.protocolKnown||!key)continue;
    const group=groups.get(key)??{key,label:row.judgeLabel,rows:[]};
    group.rows.push(row);
    groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>b.rows.length-a.rows.length||a.key.localeCompare(b.key));
}

/** Compare displayed observations within one scoring protocol. Timing conditions remain visible. */
export function scatterGuides(rows:readonly ComparisonRow[]):ScatterGuides {
  const candidates=plottable(rows).filter(row=>!row.reference);
  const first=candidates[0];
  const empty={frontier:[],region:null,execution:null};
  if(!first)return empty;
  if(candidates.some(row=>!row.protocolKnown))return {...empty,unavailable:'protocol'};
  if(first.track==='writing'&&candidates.some(row=>!row.judgeKey||row.judgeKey!==first.judgeKey)){
    return {...empty,unavailable:'judge'};
  }
  const condition=stable(first.execution);
  const execution=first.execution.state==='known'&&candidates.every(row=>!restoredTaskTiming(row)&&stable(row.execution)===condition)
    ?first.execution:null;
  const observations=candidates.map(row=>({score:row.score!,seconds:row.taskMeanMs!/1000}));
  const region=observations.length<2?null:{
    score:median(observations.map(point=>point.score)),
    seconds:median(observations.map(point=>point.seconds)),
  };

  // Shortest time first. At a tied time, consider the highest score first.
  observations.sort((a,b)=>a.seconds-b.seconds||b.score-a.score);
  const frontier:ScatterGuides['frontier']=[];
  for(const point of observations){
    if(point.score>(frontier.at(-1)?.score??-Infinity))frontier.push(point);
  }
  return {frontier,region,execution};
}
export function clusterPoints(rows:readonly ComparisonRow[],metric:ResponseMetric='taskMeanMs'):{score:number;value:number;rows:ComparisonRow[]}[]{
  const clusters=new Map<string,{score:number;value:number;rows:ComparisonRow[]}>();for(const r of plottable(rows,metric)){const key=r.score+'|'+r[metric];let group=clusters.get(key);if(!group){group={score:r.score!,value:r[metric]!,rows:[]};clusters.set(key,group);}group.rows.push(r);}return [...clusters.values()];
}

export function scatterScoreAxis(points:readonly {score:number}[]):{min:number;ticks:number[]} {
  const lowest=points.length<2?0:Math.min(...points.map(point=>point.score));
  const padded=lowest-5;
  const step=padded>=50?10:20;
  // Round down to leave space below the lowest point and show at least 30 score points.
  const min=Math.max(0,Math.min(70,Math.floor(padded/step)*step));
  const ticks=Array.from({length:(100-min)/step+1},(_,index)=>min+index*step);
  return {min,ticks};
}

interface PlotBox {left:number;right:number;top:number;bottom:number}
interface ScatterLabelItem {key:string;x:number;y:number;width:number;radius:number;selected:boolean}
interface ScatterLabel {tx:number;ty:number;anchor:'start'|'end'|'middle';leaderStartX:number;leaderStartY:number;leaderX:number;leaderY:number}
export const scatterLabelFontSize=9.5;
const labelPositions=[
  [16,3,'start'],[-16,3,'end'],[16,-12,'start'],[16,16,'start'],
  [-16,-12,'end'],[-16,16,'end'],[0,-16,'middle'],[0,24,'middle'],
  [16,-24,'start'],[16,32,'start'],[-16,-24,'end'],[-16,32,'end'],
] as const;
const labelOffsets=[0,8,16,28,38,44,68,96,128] as const;
const labelStretches=[[1,1],[1,0],[0,1]] as const;
function intersects(a:PlotBox,b:PlotBox):boolean {
  return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
}
interface Leader {x1:number;y1:number;x2:number;y2:number}
function crosses({x1,y1,x2,y2}:Leader,box:PlotBox):boolean {
  const dx=x2-x1,dy=y2-y1;
  if((dx===0&&(x1<box.left||x1>box.right))||(dy===0&&(y1<box.top||y1>box.bottom)))return false;
  const xs=dx===0?[0,1]:[(box.left-x1)/dx,(box.right-x1)/dx];
  const ys=dy===0?[0,1]:[(box.top-y1)/dy,(box.bottom-y1)/dy];
  return Math.max(0,Math.min(...xs),Math.min(...ys))<=Math.min(1,Math.max(...xs),Math.max(...ys));
}

function crossesMarker({x1,y1,x2,y2}:Leader,{x,y,radius}:ScatterLabelItem):boolean {
  const dx=x2-x1,dy=y2-y1;
  const squaredLength=dx*dx+dy*dy;
  const fraction=squaredLength>0?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/squaredLength)):0;
  return Math.hypot(x-x1-fraction*dx,y-y1-fraction*dy)<radius;
}

/** Find space around the point while keeping all markers and placed labels clear. */
export function layoutScatterLabels(points:readonly ScatterLabelItem[],bounds:PlotBox):Map<string,ScatterLabel> {
  const markerBoxes=points.map(({x,y,radius})=>({
    left:x-radius,right:x+radius,top:y-radius,bottom:y+radius,
  }));
  const crowded=new Set(points.filter(point=>points.some(other=>other!==point&&
    Math.hypot(point.x-other.x,point.y-other.y)<Math.min(point.radius,other.radius))));
  const comparePriority=(a:ScatterLabelItem,b:ScatterLabelItem)=>
    Number(crowded.has(b))-Number(crowded.has(a))||Number(b.selected)-Number(a.selected);
  const priority=[...points].sort(comparePriority);
  const preferred=placeScatterLabels(priority,bounds,markerBoxes);
  if(preferred.size===points.length)return preferred;

  // A different placement order can free a path that an earlier label occupied.
  priority.sort((a,b)=>comparePriority(a,b)||b.y-a.y);
  const alternate=placeScatterLabels(priority,bounds,markerBoxes);
  return alternate.size>preferred.size?alternate:preferred;
}

function placeScatterLabels(priority:readonly ScatterLabelItem[],bounds:PlotBox,markerBoxes:readonly PlotBox[]):Map<string,ScatterLabel> {
  const labels=new Map<string,ScatterLabel>(),leaders:Leader[]=[],labelBoxes:PlotBox[]=[];
  for(const point of priority){
    positions:for(const offset of labelOffsets){
      for(const [dx,dy,anchor] of labelPositions){
        // Keep nearby candidates first, then search each axis independently.
        for(const [horizontal,vertical] of labelStretches){
          const targetX=point.x+dx+Math.sign(dx)*offset*horizontal;
          const ty=point.y+dy+(Math.abs(dy)>3?Math.sign(dy)*offset*vertical:0);
          const inset=anchor==='start'?0:anchor==='end'?point.width:point.width/2;
          const left=Math.max(bounds.left+2,Math.min(targetX-inset,bounds.right-point.width-2));
          const tx=left+inset;
          const box={left:left-2,right:left+point.width+2,top:ty-10,bottom:ty+4};
          if(box.left<bounds.left||box.right>bounds.right||box.top<bounds.top||box.bottom>bounds.bottom||
            markerBoxes.some(marker=>intersects(box,marker))||labelBoxes.some(other=>intersects(box,other)))continue;
          const leaderX=Math.max(box.left,Math.min(point.x,box.right));
          const leaderY=Math.max(box.top,Math.min(point.y,box.bottom));
          // Leave from the outside of the marker so overlapping centers do not block every direction.
          const dxToLabel=leaderX-point.x,dyToLabel=leaderY-point.y;
          const start=point.radius/Math.hypot(dxToLabel,dyToLabel);
          const leaderStartX=point.x+dxToLabel*start,leaderStartY=point.y+dyToLabel*start;
          const leader={x1:leaderStartX,y1:leaderStartY,x2:leaderX,y2:leaderY};
          if(priority.some(other=>other!==point&&crossesMarker(leader,other))||
            labelBoxes.some(other=>crosses(leader,other))||leaders.some(other=>crosses(other,box)))continue;
          labels.set(point.key,{tx,ty,anchor,leaderStartX,leaderStartY,leaderX,leaderY});
          leaders.push(leader);
          labelBoxes.push({left:box.left-4,right:box.right+4,top:box.top-3,bottom:box.bottom+3});
          break positions;
        }
      }
    }
  }
  return labels;
}
