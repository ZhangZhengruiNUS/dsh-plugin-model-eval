import {Disclosure} from './Disclosure.tsx';
import * as React from 'react';
import type {EstimateSnapshot} from '../../estimation/contracts.ts';
import {estimateDisplay} from '../estimation-view.ts';
import {formatElapsed} from '../batch-metrics.ts';
import {zh as t} from '../locales.ts';
export function Estimate({snapshot,elapsedMs}:{snapshot?:EstimateSnapshot;elapsedMs:number}){
 const display=estimateDisplay(snapshot),total=estimateDisplay(snapshot,'total'),done=snapshot?.state==='completed',first=snapshot?.algorithm==='estimate-v3',mixed=!!snapshot?.reasons.includes('EXECUTION_CHANGED');
 return <section className={'me-estimate '+(snapshot?.state??'legacy')} aria-label="耗时预估">
  <div className="me-estimate-main"><span>{snapshot?.state==='paused'?'暂停时参考':display.title}</span><strong data-testid="remaining-estimate">{first?display.text:done?formatElapsed(0):display.kind!=='missing'?display.text:'—'}</strong><small>{snapshot?display.description:'暂无预估记录'}</small></div>
  <div className="me-estimate-secondary">{!mixed&&display.kind!=='partial'&&<span>{first?'首轮总时长':'预计总耗时'} <b>{total.kind==='full'?total.text:'—'}</b></span>}<span>已用 {formatElapsed(elapsedMs)}</span>{snapshot&&!mixed&&<span>{first?'首轮已处理':'阶段覆盖'} {snapshot.coverage.known} / {snapshot.coverage.required}</span>}</div>
  {snapshot&&<Disclosure kind="help" title="预估依据" className="me-estimate-basis">{mixed?<p>等待规则已变更，因此不沿用旧条件估时；实际进度见上方已判分数量，累计运行时间照常记录。</p>:<><p>{first?'依据同配置、本机的历史首轮记录和本次测速，按实际进度更新。':t.speed.range} 更新于 {new Date(snapshot.asOf).toLocaleTimeString('zh-CN',{hour12:false})}。</p>{first?<p className="me-help">参照 {snapshot.basis?.baselineIds.length??0} 轮 · 首轮估时 v3 · 不提供尚未校准的时间区间</p>:<ul>{snapshot.sources.length?snapshot.sources.map((source,i)=><li key={i}>{(source==='preview'||source.startsWith('preview:'))?'本轮关联测速':source.startsWith('history:')?'匹配条件的历史观测 · '+source.slice(8):source==='current'?'本轮实际观测':source==='approximation'?'未完成阶段的粗略范围':source}</li>):<li>尚无可用阶段样本</li>}</ul>}</>}</Disclosure>}
 </section>;
}
