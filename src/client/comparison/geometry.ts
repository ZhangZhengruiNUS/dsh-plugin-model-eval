import type {ComparisonRow} from './model.ts';
export type ResponseMetric='taskMeanMs'|'latencyMs'|'ttftMs';
export function plottable(rows:readonly ComparisonRow[],metric:ResponseMetric='taskMeanMs'):ComparisonRow[]{return rows.filter(r=>!r.source.reuse?.mixedPeriod&&r.score!==null&&Number.isFinite(r.score)&&r[metric]!=null&&Number.isFinite(r[metric])&&r[metric]!>=0);}
export function frontier(rows:readonly ComparisonRow[],metric:ResponseMetric='taskMeanMs'):string[]{
  const points=plottable(rows,metric).filter(row=>!row.reference),first=points[0];if(!first||!first.protocolKnown||points.length<2||first.execution.state!=='known')return [];
  const condition=JSON.stringify(first.execution);
  if(points.some(r=>!r.protocolKnown||r.execution.state!=='known'||JSON.stringify(r.execution)!==condition||r.track==='writing'&&(!r.judgeKey||r.judgeKey!==first.judgeKey)))return [];
  const result=points.filter(r=>!points.some(o=>o!==r&&o.score!>=r.score!&&o[metric]!<=r[metric]!&&(o.score!>r.score!||o[metric]!<r[metric]!)));
  return new Set(result.map(r=>r.score+'|'+r[metric])).size<2?[]:result.sort((a,b)=>a[metric]!-b[metric]!).map(r=>r.configKey);
}
export function clusterPoints(rows:readonly ComparisonRow[],metric:ResponseMetric='taskMeanMs'):{score:number;value:number;rows:ComparisonRow[]}[]{
  const clusters=new Map<string,{score:number;value:number;rows:ComparisonRow[]}>();for(const r of plottable(rows,metric)){const key=r.score+'|'+r[metric];let group=clusters.get(key);if(!group){group={score:r.score!,value:r[metric]!,rows:[]};clusters.set(key,group);}group.rows.push(r);}return [...clusters.values()];
}
