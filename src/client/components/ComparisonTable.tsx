import * as React from 'react';
import {zh as t} from '../locales.ts';
export function ComparisonTable({children}:{children:React.ReactNode}){
 const region=React.useRef<HTMLDivElement>(null),[overflow,setOverflow]=React.useState(false);
 React.useLayoutEffect(()=>{const node=region.current;if(!node)return;const measure=()=>setOverflow(node.scrollWidth>node.clientWidth+1),observer=new ResizeObserver(measure);observer.observe(node);const table=node.querySelector('table');if(table)observer.observe(table);measure();return()=>observer.disconnect();},[]);
 return <div className="me-table-wrap" role="region" aria-label={t.tableRegion} tabIndex={0} ref={region}>{overflow&&<div className="me-table-hint">{t.horizontalHint}</div>}{children}</div>;
}
