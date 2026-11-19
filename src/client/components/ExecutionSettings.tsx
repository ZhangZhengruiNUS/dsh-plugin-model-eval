import * as React from 'react';
import {Select} from '../primitives/Select.tsx';
import {Field,TextInput} from '../primitives/primitives.tsx';
import {zh as t} from '../locales.ts';
import {Disclosure} from './Disclosure.tsx';
import {ConcurrencyField} from './ConcurrencyInput.tsx';

interface Props {
  concurrency:string;
  timeout:number;
  configurationCount?:number;
  parallelModels?:string;
  peakCalls?:string|undefined;
  onParallelModelsChange?(value:string):void;
  onConcurrencyChange(value:string):void;
  onTimeoutChange(value:number):void;
}

export function ExecutionSettings({concurrency,timeout,configurationCount=1,parallelModels,peakCalls,onParallelModelsChange,onConcurrencyChange,onTimeoutChange}:Props) {
  return <section className="me-form-section">
    <h3 className="me-form-title">{t.execution}</h3>
    <div className="me-fields">
      <ConcurrencyField label={configurationCount>1?'默认题目并发数':'题目并发数'} value={concurrency}
        onChange={onConcurrencyChange}/>
      <Field label={t.timeout}>
        <TextInput type="number" value={timeout} min={1} max={1800} onChange={e=>onTimeoutChange(Number(e.target.value))}/>
      </Field>
      {configurationCount>1&&parallelModels&&onParallelModelsChange&&<Select label="同时运行的模型配置数"
        value={parallelModels} onChange={onParallelModelsChange} options={[
          {value:'1',label:'1 个（顺序运行）'},
          ...Array.from({length:configurationCount-2},(_,index)=>({value:String(index+2),label:(index+2)+' 个'})),
          {value:'all',label:'全部（'+configurationCount+' 个）'},
        ]}/>}
    </div>
    {configurationCount>1&&parallelModels!=='1'&&peakCalls!==undefined&&<p className="me-help">当前设置最多同时派发 {peakCalls} 道题。</p>}
    <Disclosure kind="help" title="运行规则与重试" className="me-execution-rules">
      {configurationCount>1&&<p>同一供应商的配置会共用其限流额度。可在评测任务中调低各配置的题目并发数。</p>}
      <p>收到新的推理、正文或工具调用时，重新计时。</p>
      <p>已有输出但随后超时的题留待补测，其余题继续。始终无输出而超时，或遇到可重试的故障，最多重试 2 次；仍失败则根据故障范围暂停对应配置或整批。</p>
    </Disclosure>
  </section>;
}
