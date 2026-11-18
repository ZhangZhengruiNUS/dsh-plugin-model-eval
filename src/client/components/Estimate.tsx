import {Disclosure} from './Disclosure.tsx';
import * as React from 'react';
import type {EstimateSnapshot} from '../../estimation/contracts.ts';
import {estimateDisplay} from '../estimation-view.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {formatPlanningTime} from '../tier-time-reference.ts';
import type {RoughRemaining} from '../../estimation/rough-remaining.ts';
import {zh as t} from '../locales.ts';

export function RoughEstimate({estimate,sampling}:{estimate?:RoughRemaining|undefined;sampling?:{ready:number;total:number}|undefined}){
 if(sampling&&(!estimate||sampling.ready<sampling.total))return <section className="me-estimate" aria-label="耗时预估">
   <div className="me-estimate-main"><span>预计剩余</span><strong>待评估</strong>
     <small>{sampling.ready}/{sampling.total} 个配置已取得样本</small>
   </div>
 </section>;
 if(!estimate)return <section className="me-estimate" aria-label="耗时预估">
   <p className="me-help">预计剩余 · 等待可用的输出 Token 样本</p>
 </section>;
 return <section className="me-estimate available" aria-label="耗时预估">
   <div className="me-estimate-main">
     <span>预计剩余 · 粗估</span>
     <strong data-testid="remaining-estimate">{estimate.remainingMs<60_000?'不足 1 分钟':formatPlanningTime(estimate.remainingMs)}</strong>
     <small>{sampling&&estimate.excludesDeferredWork?`仅估算当前队列的 ${sampling.total} 个配置`:
       estimate.excludesDeferredWork?'仅估算本次继续执行的题目':'随实测吞吐和剩余题目更新'}</small>
   </div>
   <Disclosure kind="help" title="预估依据" className="me-estimate-basis">
     <p>按剩余题目的输出量和已测速度推算，有了本轮同类作答后会修正参考输出量。</p>
     {estimate.borrowedConfigurations>0&&<p>{estimate.borrowedConfigurations} 个配置暂借首个有数据的模型速度。</p>}
     {estimate.borrowedJudgeRate&&<p>{sampling?'裁判按待测模型的作答速度粗估。':'裁判暂用作答速度推算，取得裁判样本后会更新。'}</p>}
     {estimate.judgeRetryAdjusted&&<p>已用本批裁判失败和重试记录修正判分耗时。</p>}
   </Disclosure>
 </section>;
}
export function Estimate({snapshot,elapsedMs,compact=false}:{snapshot?:EstimateSnapshot;elapsedMs:number;compact?:boolean}){
 const display=estimateDisplay(snapshot),total=estimateDisplay(snapshot,'total'),done=snapshot?.state==='completed',first=snapshot?.algorithm==='estimate-v3',mixed=!!snapshot?.reasons.includes('EXECUTION_CHANGED');
 const coverage=<div className="me-estimate-secondary">{!mixed&&display.kind!=='partial'&&<span>{first?'首轮总时长':'预计总耗时'} <b>{total.kind==='full'?total.text:'—'}</b></span>}{!compact&&<span>已用 {formatElapsed(elapsedMs)}</span>}{snapshot&&!mixed&&<span>{first?'首轮已处理':'阶段覆盖'} {snapshot.coverage.known} / {snapshot.coverage.required}</span>}</div>;
 return <section className={'me-estimate '+(snapshot?.state??'legacy')} aria-label="耗时预估">
  <div className="me-estimate-main"><span>{snapshot?.state==='paused'?'暂停时参考':display.title}</span><strong data-testid="remaining-estimate">{first?display.text:done?formatElapsed(0):display.kind!=='missing'?display.text:'—'}</strong><small>{snapshot?display.description:'暂无预估记录'}</small></div>
  {!compact&&coverage}
  {snapshot&&<Disclosure kind="help" title="预估依据" className="me-estimate-basis">{compact&&coverage}{mixed?<p>等待规则已变更，因此不沿用旧条件估时；实际进度见上方已判分数量，累计运行时间照常记录。</p>:<><p>{first?'依据同配置、本机的历史首轮记录和本次测速，按实际进度更新。':t.speed.range} 更新于 {new Date(snapshot.asOf).toLocaleTimeString('zh-CN',{hour12:false})}。</p>{first?<p className="me-help">参照 {snapshot.basis?.baselineIds.length??0} 轮 · 首轮估时 v3 · 不提供尚未校准的时间区间</p>:<ul>{snapshot.sources.length?snapshot.sources.map((source,i)=><li key={i}>{(source==='preview'||source.startsWith('preview:'))?'本轮关联测速':source.startsWith('history:')?'匹配条件的历史观测 · '+source.slice(8):source==='current'?'本轮实际观测':source==='approximation'?'未完成阶段的粗略范围':source}</li>):<li>尚无可用阶段样本</li>}</ul>}</>}</Disclosure>}
 </section>;
}
