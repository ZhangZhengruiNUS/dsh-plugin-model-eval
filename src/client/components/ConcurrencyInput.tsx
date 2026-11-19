import * as React from 'react';
import {isRunConcurrency} from '../../contracts.ts';
import {Button,Field,TextInput} from '../primitives/primitives.tsx';

export const concurrencyError = '请输入大于 0 的整数。';

export function parseConcurrency(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return isRunConcurrency(parsed) ? parsed : undefined;
}

function NumberInput({onValueChange,...props}: Omit<React.ComponentProps<typeof TextInput>,'onChange'> & {
  onValueChange(value:string):void;
}) {
  return <TextInput {...props} value={props.value==='NaN'?'':props.value} type="number" inputMode="numeric" min={1} step={1} max={Number.MAX_SAFE_INTEGER}
    onChange={event=>onValueChange(event.currentTarget.validity.badInput?'NaN':event.currentTarget.value)}/>;
}

export function ConcurrencyField({label,value,onChange,placeholder,className}: {
  label:string;
  value:string;
  onChange(value:string):void;
  placeholder?:string;
  className?:string;
}) {
  const valid = (placeholder !== undefined && value === '') || parseConcurrency(value) !== undefined;
  return <Field label={label} {...(className?{className}:{})} {...(!valid?{error:concurrencyError}:{})}>
    <NumberInput value={value} onValueChange={onChange} placeholder={placeholder} required={placeholder===undefined}/>
  </Field>;
}

export function RunConcurrencyInput({label,value,disabled,onApply}: {
  label:string;
  value:number;
  disabled:boolean;
  onApply(value:number):Promise<boolean>;
}) {
  const [draft,setDraft]=React.useState<string>();
  const errorId=React.useId();
  const parsed=draft===undefined?value:parseConcurrency(draft);
  const changed=draft!==undefined&&parsed!==value;
  const invalid=parsed===undefined;
  async function apply() {
    if(disabled||parsed===undefined||parsed===value)return;
    if(await onApply(parsed))setDraft(undefined);
  }
  return <div className="me-run-concurrency">
    <div className="me-run-concurrency-entry">
      <NumberInput aria-label={label} title={label} aria-invalid={invalid||undefined}
        aria-describedby={invalid?errorId:undefined} disabled={disabled}
        value={draft??String(value)} required onValueChange={setDraft}
        onKeyDown={event=>{
          if(event.key==='Enter'){event.preventDefault();void apply();}
          if(event.key==='Escape'&&draft!==undefined){event.stopPropagation();setDraft(undefined);}
        }}/>
      <span aria-hidden="true">路</span>
    </div>
    {invalid?<span role="alert" id={errorId} className="dsh-field-error">{concurrencyError}</span>:
      changed&&<Button variant="quiet" disabled={disabled}
        aria-label={'应用'+label} onClick={()=>void apply()}>应用</Button>}
  </div>;
}
