import * as React from 'react';
/** Native top layer preserves host variables; fallback reparents one owned node and restores it before React removal. */
export function ChartPopover({anchor,onClose,children}:{anchor:Element;onClose():void;children:React.ReactNode}){
  const ref=React.useRef<HTMLDivElement>(null),native=typeof HTMLElement.prototype.showPopover==='function';
  const tokens:React.CSSProperties={};if(!native){const css=getComputedStyle(anchor);for(const name of ['bg','panel','text','muted','border','hover','accent'])Object.assign(tokens,{['--me-'+name]:css.getPropertyValue('--me-'+name)});}
  React.useLayoutEffect(()=>{
    const node=ref.current!,parent=node.parentNode!,next=node.nextSibling;if(native){node.setAttribute('popover','manual');node.showPopover();}else node.closest('.model-eval')!.appendChild(node);
    const place=()=>{if(!anchor.isConnected){onClose();return;}const a=anchor.getBoundingClientRect();if(a.bottom<0||a.top>innerHeight){onClose();return;}const width=Math.min(310,innerWidth-24),height=Math.min(node.scrollHeight,innerHeight-32);node.style.width=width+'px';node.style.maxHeight='calc(100dvh - 32px)';node.style.left=Math.max(12,Math.min(a.left+12,innerWidth-width-12))+'px';node.style.top=Math.max(16,Math.min(a.bottom+10,innerHeight-height-16))+'px';};
    place();const resize=new ResizeObserver(place);resize.observe(node);resize.observe(anchor);
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}},outside=(e:PointerEvent)=>{if(!node.contains(e.target as Node)&&!anchor.contains(e.target as Node))onClose();};
    document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside);window.addEventListener('scroll',place,true);window.addEventListener('resize',place);
    return()=>{resize.disconnect();document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);if(native&&node.matches(':popover-open'))node.hidePopover();if(!native)parent.insertBefore(node,next?.parentNode===parent?next:null);};
  },[anchor,native,onClose]);
  const node=<div ref={ref} className={(native?'':'me-chart-portal ')+ 'me-chart-popover'} role="region" aria-label="配置观测详情" style={tokens}>{children}</div>;
  return <span style={{display:'contents'}}>{node}</span>;
}
