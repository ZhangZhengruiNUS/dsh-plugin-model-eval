import * as React from 'react';
import {zh as t} from '../locales.ts';

type DisclosureProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
} & ({kind:'settings'; value:string} | {kind:'help'});

function DisclosureLabel({title,value}:{title:string;value?:string|undefined}){
  return <>
    {value===undefined&&<svg className="me-disclosure-info" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>}
    <span className="me-disclosure-title">{title}</span>
    {value!==undefined&&<span className="me-disclosure-value">{value}</span>}
    <svg className="me-disclosure-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </>;
}

/** An editable group's current value is distinct from optional reading. */
export function Disclosure(props:DisclosureProps) {
  const {kind,title,children,className}=props;
  return <details className={['me-disclosure','me-disclosure--'+kind,className].filter(Boolean).join(' ')}>
    <summary className="me-disclosure-trigger">
      <DisclosureLabel title={title} value={kind==='settings'?props.value:undefined}/>
    </summary>
    <div className="me-disclosure-content">{children}</div>
  </details>;
}

export function HelpDisclosureButton({title,expanded,controls,onToggle}:{
  title:string;expanded:boolean;controls:string;onToggle():void;
}){
  return <button className="me-disclosure-trigger me-help-trigger" type="button"
    aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
    <DisclosureLabel title={title}/>
  </button>;
}

export function StorageBasis() {
  return <Disclosure kind="help" title="容量口径"><p>{t.fileBytes}</p></Disclosure>;
}
