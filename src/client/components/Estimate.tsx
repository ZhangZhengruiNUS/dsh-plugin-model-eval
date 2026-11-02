import * as React from 'react';
import type {EstimateSnapshot} from '../../estimation/contracts.ts';
import {estimateDisplay} from '../estimation-view.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {zh as t} from '../locales.ts';
export function Estimate({snapshot,elapsedMs}:{snapshot?:EstimateSnapshot;elapsedMs:number}){
 const display=estimateDisplay(snapshot),total=estimateDisplay(snapshot,'total'),done=snapshot?.state==='completed';
 return <section className={'me-estimate '+(snapshot?.state??'legacy')} aria-label="耗时预估">
  <div className="me-estimate-main"><span>{snapshot?.state==='paused'?'暂停时参考':display.title}</span><strong data-testid="remaining-estimate">{done?formatElapsed(0):display.kind!=='missing'?display.text:'—'}</strong><small>{snapshot?display.description:'暂无预估记录'}</small></div>
  <div className="me-estimate-secondary">{display.kind!=='partial'&&<span>预计总耗时 <b>{total.kind==='full'?total.text:'—'}</b></span>}<span>已用 {formatElapsed(elapsedMs)}</span>{snapshot&&<span>阶段覆盖 {snapshot.coverage.known} / {snapshot.coverage.required}</span>}</div>
  {snapshot&&<details className="me-estimate-basis"><summary>预估依据</summary><p>{t.speed.range} 更新于 {new Date(snapshot.asOf).toLocaleTimeString('zh-CN',{hour12:false})}。</p><ul>{snapshot.sources.length?snapshot.sources.map((source,i)=><li key={i}>{(source==='preview'||source.startsWith('preview:'))?'本轮关联测速':source.startsWith('history:')?'匹配条件的历史观测 · '+source.slice(8):source==='current'?'本轮实际观测':source==='approximation'?'未完成阶段的粗略范围':source}</li>):<li>尚无可用阶段样本</li>}</ul></details>}
 </section>;
}
