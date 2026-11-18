import * as React from 'react';
import {formatElapsed,type summarizeBatchMetrics} from '../batch-metrics.ts';
import {zh as t} from '../locales.ts';
import {Disclosure} from './Disclosure.tsx';

export function BatchMetrics({metrics:m,newWork=false}:{metrics:ReturnType<typeof summarizeBatchMetrics>;newWork?:boolean}){
  const tokens=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('zh-CN');
  return <dl className="me-task-stats">
    <div>
      <dt>{newWork?'本次新增耗时':t.batchElapsed}</dt>
      <dd><strong data-testid="batch-elapsed">{formatElapsed(m.elapsedMs)}</strong></dd>
      <dd className="me-task-stat-note">{m.incompleteTiming?t.incompleteTiming:'不含暂停'}</dd>
    </div>
    <div>
      <dt>{newWork?'本次新增 Token':t.batchTokens}</dt>
      <dd><strong data-testid="batch-tokens">{tokens(m.tokens)}</strong></dd>
      {(m.tokens!==undefined||m.partialUsage)&&<dd>
        <Disclosure kind="help" title={m.partialUsage?'部分用量':'用量明细'} className="me-task-usage">
          <p>{t.input} {tokens(m.inputTokens)} · {t.output} {tokens(m.outputTokens)}</p>
          {(m.cacheReadTokens!==undefined||m.cacheWriteTokens!==undefined)&&<p data-testid="batch-cache">
            {m.cacheReadTokens!==undefined&&<span>缓存读取 {tokens(m.cacheReadTokens)}</span>}
            {m.cacheReadTokens!==undefined&&m.cacheWriteTokens!==undefined&&' · '}
            {m.cacheWriteTokens!==undefined&&<span>缓存写入 {tokens(m.cacheWriteTokens)}</span>}
          </p>}
          <p>{t.batchUsageHint}</p>
        </Disclosure>
      </dd>}
    </div>
  </dl>;
}
