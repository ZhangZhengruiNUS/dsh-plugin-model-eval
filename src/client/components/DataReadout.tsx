import * as React from 'react';
import {formatByteAmount} from '../store.ts';
import {zh as t} from '../locales.ts';

const countText = new Intl.NumberFormat('zh-CN');

export function CountBadge({count, total, description}: {count: number; total?: number | undefined; description: string}) {
  return <>
    <span className="me-count-badge" aria-hidden="true">
      {countText.format(count)}
      {total !== undefined && <span className="me-count-total"> / {countText.format(total)}</span>}
    </span>
    <span className="dsh-sr-only">{description}</span>
  </>;
}

export function DataValue({value, unit}: {value: number | string; unit?: string | undefined}) {
  return <span className="me-data-value">
    {typeof value === 'number' ? countText.format(value) : value}
    {unit && <> <span className="me-data-unit">{unit}</span></>}
  </span>;
}

export function StorageValue({bytes}: {bytes: number}) {
  return <DataValue {...formatByteAmount(bytes)}/>;
}

export function StorageReadout({label, bytes, testId}: {label: string; bytes: number; testId?: string | undefined}) {
  return <dl className="me-inline-readout">
    <dt>{label}</dt>
    <dd data-testid={testId}><StorageValue bytes={bytes}/></dd>
  </dl>;
}

export function SelectedStorage({bytes, testId}: {bytes?: number | undefined; testId?: string}) {
  return <div className="me-selected-storage" role="status">
    {bytes !== undefined && <StorageReadout label={t.estimated} bytes={bytes} testId={testId}/>}
  </div>;
}
