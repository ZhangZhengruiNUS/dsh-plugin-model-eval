import * as React from 'react';
import {Select} from '../primitives/Select.tsx';
import {Field,TextInput} from '../primitives/primitives.tsx';
import {zh as t} from '../locales.ts';
import {Disclosure} from './Disclosure.tsx';

interface Props {
  concurrency:number;
  timeout:number;
  configurationCount?:number;
  onConcurrencyChange(value:number):void;
  onTimeoutChange(value:number):void;
}

const concurrencyOptions=[1,2,3,4].map(n=>({value:String(n),label:String(n)}));

export function ExecutionSettings({concurrency,timeout,configurationCount=1,onConcurrencyChange,onTimeoutChange}:Props) {
  return <section className="me-form-section">
    <h3 className="me-form-title">{t.execution}</h3>
    <div className="me-fields">
      <Select label={t.concurrency} value={String(concurrency)} options={concurrencyOptions}
        onChange={value=>onConcurrencyChange(Number(value))}/>
      <Field label={t.timeout}>
        <TextInput type="number" value={timeout} min={1} max={1800} onChange={e=>onTimeoutChange(Number(e.target.value))}/>
      </Field>
    </div>
    <Disclosure kind="help" title="运行规则与重试" className="me-execution-rules">
      {configurationCount>1&&<p>多个模型配置按顺序运行。</p>}
      <p>收到新的推理、正文或工具调用时，重新计时。</p>
      <p>已有输出但随后超时的题留待补测，其余题继续。始终无输出而超时，或遇到可重试的故障，最多重试 2 次；仍失败则暂停本批次。</p>
    </Disclosure>
  </section>;
}
