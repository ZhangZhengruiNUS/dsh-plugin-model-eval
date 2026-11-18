import * as React from 'react';
import type {RunSummary} from '../../contracts.ts';
import {zh as t} from '../locales.ts';
import {Checkbox} from '../primitives/primitives.tsx';
import {Badge,Icon,MetaTime} from '../ui.tsx';
import {DataValue} from './DataReadout.tsx';

type Selection = {checked:boolean; disabled:boolean; change(checked:boolean):void};

export function BatchRecord({batchId,runs,createdAt,status,readout,open,toggle,selection,children}:{
  batchId:string;
  runs:readonly RunSummary[];
  createdAt:string|undefined;
  status:string;
  readout:React.ReactNode;
  open:boolean;
  toggle():void;
  selection?:Selection;
  children:React.ReactNode;
}){
  const detailId=React.useId();
  const batchLabel=t.batch+' '+batchId.slice(0,8);
  const models=[...new Set(runs.map(run=>run.target.modelId))];
  const modelSummary=models.slice(0,2).join(' · ')+(models.length>2?' …':'');
  return <li className="me-batch-record">
    <div className="me-batch-record-head" data-expanded={open}>
      {selection&&<label className="me-batch-record-select">
        <Checkbox aria-label={'选择 '+batchLabel} checked={selection.checked} disabled={selection.disabled}
          onChange={event=>selection.change(event.currentTarget.checked)}/>
      </label>}
      <button type="button" className="me-batch-record-toggle" data-batch-focus={batchId}
        aria-expanded={open} aria-controls={detailId} onClick={toggle}>
        <span className="me-batch-record-identity">
          <strong>{batchLabel}</strong>
          {modelSummary&&<small title={models.join(' · ')}>{modelSummary}</small>}
        </span>
        <MetaTime value={createdAt}/>
        <Badge status={status}/>
        <span className="me-batch-record-count"><DataValue value={runs.length} unit={t.configCount}/></span>
        <span className="me-batch-record-readout">{readout}</span>
        <span className="me-batch-record-chevron"><Icon name="chevron"/></span>
      </button>
    </div>
    <div id={detailId} className="me-batch-record-panel" role="region" aria-label={batchLabel} hidden={!open}>
      {open&&children}
    </div>
  </li>;
}
