import * as React from 'react';

interface Props<T extends string> {
  label:string;value:T;panelId:string;
  tabs:readonly {id:T;label:string}[];onChange(id:T):void;
}
interface Geometry {x:number;y:number;width:number;height:number}
/** One highlight shared by existing controls; no frame loop or new selection state. */
export function SelectionBar<T extends string>({label,value,panelId,tabs,onChange}:Props<T>){
  const ref=React.useRef<HTMLDivElement>(null);
  const [geometry,setGeometry]=React.useState<Geometry>();
  React.useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    const measure=()=>{
      const selected=node.querySelector<HTMLElement>('[aria-selected="true"]');
      if(!selected)return;
      const next={x:selected.offsetLeft,y:selected.offsetTop,width:selected.offsetWidth,height:selected.offsetHeight};
      setGeometry(old=>old&&Object.keys(next).every(key=>old[key as keyof Geometry]===next[key as keyof Geometry])?old:next);
    };
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(node);
    node.querySelectorAll(':scope > button').forEach(button=>observer.observe(button));
    return()=>observer.disconnect();
  },[value]);
  const style:React.CSSProperties=geometry?{width:geometry.width,height:geometry.height,transform:`translate3d(${geometry.x}px,${geometry.y}px,0)`}:{opacity:0};
  return <div ref={ref} className="me-tabs me-selection-bar" role="tablist" aria-label={label}>
    <span className="me-selection-indicator" aria-hidden="true" style={style}/>
    {tabs.map(({id,label:tabLabel},index)=><button key={id} type="button" role="tab" id={`${panelId}-${id}`}
      aria-selected={id===value} aria-controls={panelId} tabIndex={id===value?0:-1} onClick={()=>onChange(id)}
      onKeyDown={event=>{
        const count=tabs.length;
        const next=event.key==='ArrowLeft'?(index+count-1)%count:event.key==='ArrowRight'?(index+1)%count:
          event.key==='Home'?0:event.key==='End'?count-1:undefined;
        if(next===undefined)return;
        event.preventDefault();
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        onChange(tabs[next]!.id);
      }}>{tabLabel}</button>)}
  </div>;
}
