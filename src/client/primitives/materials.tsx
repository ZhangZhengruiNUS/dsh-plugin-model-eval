import * as React from 'react';

/** Local specular feedback, capped at one update per animation frame and idle at rest. */
export function useGlassInteraction(root:React.RefObject<HTMLElement>) {
  React.useEffect(()=>{
    const node=root.current;if(!node)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse=window.matchMedia('(pointer: coarse)');
    let frame=0,active:HTMLElement|null=null,x=0,y=0;
    const clear=()=>{if(frame)cancelAnimationFrame(frame);frame=0;active?.style.removeProperty('--dsh-light-x');active?.style.removeProperty('--dsh-light-y');active=null;};
    const move=(event:PointerEvent)=>{
      if(reduced.matches||coarse.matches||event.pointerType==='touch')return;
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('.dsh-button,.dsh-select-trigger,[data-dsh-local-light]'):null;
      if(!target||!node.contains(target)||target.matches(':disabled')){clear();return;}
      if(active!==target){clear();active=target;}
      x=event.clientX;y=event.clientY;
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!active)return;const box=active.getBoundingClientRect();active.style.setProperty('--dsh-light-x',`${x-box.left}px`);active.style.setProperty('--dsh-light-y',`${y-box.top}px`);});
    };
    node.addEventListener('pointermove',move,{passive:true});node.addEventListener('pointerleave',clear);
    reduced.addEventListener('change',clear);coarse.addEventListener('change',clear);
    return()=>{clear();node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',clear);reduced.removeEventListener('change',clear);coarse.removeEventListener('change',clear);};
  },[root]);
}

export type GlassSurfaceProps=React.HTMLAttributes<HTMLDivElement>&{weight?:'control'|'floating'|'content'};
export const GlassSurface=React.forwardRef<HTMLDivElement,GlassSurfaceProps>(function GlassSurface({weight='control',className='',...props},ref){
  return <div {...props} ref={ref} className={`dsh-glass ${className}`} data-weight={weight}/>;
});

export type ScrollAreaProps=React.HTMLAttributes<HTMLDivElement>&{label:string;viewportClassName?:string};
/** Fixed-height wrapper. Decorative blur disappears at the corresponding scroll boundary. */
export function ScrollArea({label,children,className='',viewportClassName='',...props}:ScrollAreaProps){
  const viewport=React.useRef<HTMLDivElement>(null),content=React.useRef<HTMLDivElement>(null);
  const [edges,setEdges]=React.useState({top:false,bottom:false});
  React.useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const measure=()=>{const next={top:element.scrollTop>1,bottom:element.scrollHeight-element.clientHeight-element.scrollTop>1};setEdges(old=>old.top===next.top&&old.bottom===next.bottom?old:next);};
    element.addEventListener('scroll',measure,{passive:true});measure();
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);
    observer?.observe(element);if(content.current)observer?.observe(content.current);
    return()=>{element.removeEventListener('scroll',measure);observer?.disconnect();};
  },[]);
  return <div {...props} className={`dsh-scroll-area ${className}`}><div ref={viewport} className={`dsh-scroll-viewport ${viewportClassName}`} tabIndex={0} role="region" aria-label={label}><div ref={content}>{children}</div></div>{(['top','bottom'] as const).map(edge=><span key={edge} className="dsh-scroll-edge" data-edge={edge} data-visible={edges[edge]} aria-hidden="true"><i/><i/><i/></span>)}</div>;
}
