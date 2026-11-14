import * as React from 'react';
import type {ModelChoice} from '../../contracts.ts';
import {Select} from '../primitives/Select.tsx';

/** Business identity adapter. The shared control never reads model snapshots. */
export function ModelSelect({label,value,models,disabled,onChange,placeholder,defaultLabel}:{label:string;value:string;models:ModelChoice[];disabled:boolean;onChange(value:string):void;placeholder:string;defaultLabel?:string}){
 const modelOptions=models.map(m=>({value:JSON.stringify([m.providerId,m.modelId]),label:m.displayName,description:m.providerId+(m.displayName!==m.modelId?' · '+m.modelId:''),selectedDescription:m.providerId,searchText:`${m.providerId} / ${m.displayName} ${m.modelId}`}));
 const options=defaultLabel?[{value:'',label:defaultLabel},...modelOptions]:modelOptions;
 return <Select className="me-model-select" label={label} value={value} disabled={disabled} placeholder={placeholder} onChange={onChange} onReselect={onChange} options={options}/>;
}
