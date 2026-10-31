import * as React from 'react';

interface Props {kind?:'tabs'|'navigation';label:string;value:string;children:React.ReactNode}
interface Geometry {x:number;y:number;width:number;height:number}
/** One highlight shared by existing controls; no frame loop or new selection state. */
export function SelectionBar({kind='tabs',label,value,children}:Props){
  const ref=React.useRef<HTMLDivElement>(null);
  const [geometry,setGeometry]=React.useState<Geometry>();
  React.useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    const measure=()=>{
      const selected=node.querySelector<HTMLElement>('[aria-selected="true"],[aria-current="page"]');
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
  const Tag=kind==='navigation'?'nav':'div';
  const style:React.CSSProperties=geometry?{width:geometry.width,height:geometry.height,transform:`translate3d(${geometry.x}px,${geometry.y}px,0)`}:{opacity:0};
  return <Tag ref={ref} className={(kind==='tabs'?'me-tabs':'me-nav-selection')+' me-selection-bar'} {...(kind==='tabs'?{role:'tablist'}:{})} aria-label={label}>
    <span className="me-selection-indicator" aria-hidden="true" style={style}/>{children}
  </Tag>;
}
