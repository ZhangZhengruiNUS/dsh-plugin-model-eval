import * as React from 'react';
import {zh as t} from '../locales.ts';
import {Icon} from '../ui.tsx';

export function ComparisonTable({children,heading,beforeTable,empty}:{
 children:React.ReactNode;heading?:React.ReactNode;beforeTable?:React.ReactNode;empty?:React.ReactNode;
}){
 const hasTable=Boolean(children);
 const region=React.useRef<HTMLDivElement>(null),regionId=React.useId();
 const [edges,setEdges]=React.useState({left:false,right:false});
 const measure=React.useCallback(()=>{
  const node=region.current;
  if(!node)return;
  const left=node.scrollLeft>1,right=node.scrollLeft+node.clientWidth<node.scrollWidth-1;
  setEdges(current=>current.left===left&&current.right===right?current:{left,right});
 },[]);
 React.useLayoutEffect(()=>{
  const node=region.current;
  if(!node)return;
  const observer=new ResizeObserver(measure);
  observer.observe(node);
  const table=node.querySelector('table');
  if(table)observer.observe(table);
  measure();
  return()=>observer.disconnect();
 },[hasTable,measure]);
 const overflow=hasTable&&(edges.left||edges.right);
 const scroll=(direction:-1|1)=>{
  const node=region.current;
  if(node)node.scrollBy({left:direction*Math.round(node.clientWidth/2)});
 };
 return <>
  {heading&&<div className="me-matrix-heading">
   {heading}
   {overflow&&<div className="me-table-arrows">
    <button type="button" aria-label="向左查看更多列" aria-controls={regionId} aria-disabled={!edges.left} tabIndex={edges.left?0:-1} onClick={()=>{if(edges.left)scroll(-1);}}><Icon name="arrow" size={15}/></button>
    <button type="button" aria-label="向右查看更多列" aria-controls={regionId} aria-disabled={!edges.right} tabIndex={edges.right?0:-1} onClick={()=>{if(edges.right)scroll(1);}}><Icon name="arrow" size={15}/></button>
   </div>}
  </div>}
  {beforeTable}
  {hasTable?<div className="me-table-wrap" id={regionId} role="region" aria-label={t.tableRegion} data-horizontal-overflow={overflow||undefined} aria-description={overflow&&heading?'可用左右方向键横向滚动':undefined} tabIndex={0} ref={region} onScroll={measure}>
   {overflow&&!heading&&<div className="me-table-hint">{t.horizontalHint}</div>}
   {children}
  </div>:empty}
 </>;
}
