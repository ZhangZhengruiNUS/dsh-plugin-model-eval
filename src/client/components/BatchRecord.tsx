import * as React from 'react';
import type {RunSummary} from '../../contracts.ts';
import {zh as t} from '../locales.ts';
import {Checkbox} from '../primitives/primitives.tsx';
import {Badge,Icon,MetaTime} from '../ui.tsx';
import {DataValue} from './DataReadout.tsx';

type Selection = {checked:boolean; disabled:boolean; change(checked:boolean):void};

type RecordRowProps = {
  label:string;
  subtitle?:{text:string;title?:string}|undefined;
  createdAt:string|undefined;
  status?:string|undefined;
  count:React.ReactNode;
  readout:React.ReactNode;
  open:boolean;
  toggle():void;
  selection?:Selection;
  children:React.ReactNode;
};

export function BatchRecord({batchId,runs,...props}:Omit<RecordRowProps,'label'|'subtitle'|'count'>&{
  batchId:string;
  runs:readonly RunSummary[];
}){
  const models=[...new Set(runs.map(run=>run.target.modelId))];
  return <RecordRow {...props} batchId={batchId} label={t.batch+' '+batchId.slice(0,8)}
    subtitle={models.length?{text:models.slice(0,2).join(' · ')+(models.length>2?' …':''),title:models.join(' · ')}:undefined}
    count={<DataValue value={runs.length} unit={t.configCount}/>}/>;
}

export function RecordRow({label,subtitle,batchId,createdAt,status,count,readout,open,toggle,selection,children}:
  RecordRowProps&{batchId?:string}){
  const detailId=React.useId();
  return <li className="me-batch-record">
    <div className="me-batch-record-head" data-expanded={open}>
      {selection&&<label className="me-batch-record-select">
        <Checkbox aria-label={'选择 '+label} checked={selection.checked} disabled={selection.disabled}
          onChange={event=>selection.change(event.currentTarget.checked)}/>
      </label>}
      <button type="button" className="me-batch-record-toggle" data-batch-focus={batchId}
        aria-expanded={open} aria-controls={detailId} onClick={toggle}>
        <span className="me-batch-record-identity">
          <strong>{label}</strong>
          {subtitle&&<small title={subtitle.title}>{subtitle.text}</small>}
        </span>
        <MetaTime value={createdAt}/>
        {status&&<Badge status={status}/>}
        <span className="me-batch-record-count">{count}</span>
        <span className="me-batch-record-readout">{readout}</span>
        <span className="me-batch-record-chevron"><Icon name="chevron"/></span>
      </button>
    </div>
    <div id={detailId} className="me-batch-record-panel" role="region" aria-label={label} hidden={!open}>
      {open&&children}
    </div>
  </li>;
}
