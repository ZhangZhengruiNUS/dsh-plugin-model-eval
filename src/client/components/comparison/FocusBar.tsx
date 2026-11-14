import {Checkbox} from '../../primitives/primitives.tsx';
import {CountBadge} from '../DataReadout.tsx';
import * as React from 'react';
import {modelDisplayName,modelName,rowName,rowSourceLabel,type ComparisonRow} from '../../comparison/model.ts';import {comparisonLimit,type ComparisonSelection} from '../../comparison/state.ts';
import {Button} from '../../ui.tsx';
export function FocusBar({rows,candidates,selection,onToggle,onBaseline,onShowCharts,color}:{rows:ComparisonRow[];candidates:ComparisonRow[];selection:ComparisonSelection;onToggle(key:string):void;onBaseline(key:string):void;onShowCharts():void;color(key:string):string}){
  const menu=React.useRef<HTMLDetailsElement>(null),options=React.useRef<HTMLDivElement>(null);
  const [open,setOpen]=React.useState(false),[notice,setNotice]=React.useState('');
  const reposition=React.useRef<()=>void>();
  React.useLayoutEffect(()=>{
    const node=menu.current,layer=options.current,bar=node?.parentElement;
    const doc=node?.ownerDocument,win=doc?.defaultView;
    if(!open||!node||!layer||!bar||!doc||!win)return;
    const ancestors:HTMLElement[]=[];
    for(let parent:HTMLElement|null=bar;parent;parent=parent.parentElement)ancestors.push(parent);
    const viewport=win.visualViewport,clips=/^(auto|scroll|hidden|clip|overlay)$/;
    const gap=6,edge=8;
    const place=()=>{
      if(!node.open)return;
      const anchor=node.getBoundingClientRect(),frame=bar.getBoundingClientRect();
      const vx=viewport?.offsetLeft??0,vy=viewport?.offsetTop??0;
      let left=Math.max(vx+edge,frame.left+edge),right=Math.min(vx+(viewport?.width??doc.documentElement.clientWidth)-edge,frame.right-edge);
      let top=vy+edge,bottom=vy+(viewport?.height??win.innerHeight)-edge;
      for(const parent of ancestors){
        const {overflowX,overflowY}=win.getComputedStyle(parent);
        if(!clips.test(overflowX)&&!clips.test(overflowY))continue;
        const rect=parent.getBoundingClientRect(),x=rect.left+parent.clientLeft,y=rect.top+parent.clientTop;
        if(clips.test(overflowX)){left=Math.max(left,x+edge);right=Math.min(right,x+parent.clientWidth-edge);}
        if(clips.test(overflowY)){top=Math.max(top,y+edge);bottom=Math.min(bottom,y+parent.clientHeight-edge);}
      }
      if(right<=left||bottom<=top||anchor.bottom<=top||anchor.top>=bottom||anchor.right<=left||anchor.left>=right){
        node.open=false;return;
      }
      const width=Math.min(310,right-left);
      layer.style.width=`${width}px`;
      const below=bottom-anchor.bottom-gap,above=anchor.top-top-gap;
      const up=below<Math.min(300,layer.scrollHeight+2)&&above>below;
      const maxHeight=Math.min(300,up?above:below);
      if(maxHeight<1){node.open=false;return;}
      Object.assign(layer.style,{
        left:`${Math.max(left,Math.min(anchor.left,right-width))-anchor.left}px`,
        top:up?'auto':`calc(100% + ${gap}px)`,
        bottom:up?`calc(100% + ${gap}px)`:'auto',
        maxHeight:`${maxHeight}px`,visibility:'visible',
      });
    };
    const scroll=(event:Event)=>{if(event.target!==layer)place();};
    const observer=new win.ResizeObserver(place);
    observer.observe(node);
    ancestors.forEach(parent=>observer.observe(parent));
    win.addEventListener('resize',place);
    doc.addEventListener('scroll',scroll,true);
    viewport?.addEventListener('resize',place);
    viewport?.addEventListener('scroll',place);
    reposition.current=place;
    return()=>{
      reposition.current=undefined;
      observer.disconnect();
      win.removeEventListener('resize',place);
      doc.removeEventListener('scroll',scroll,true);
      viewport?.removeEventListener('resize',place);
      viewport?.removeEventListener('scroll',place);
      layer.removeAttribute('style');
    };
  },[open]);
  // Adding a chip can move the trigger without changing its dimensions.
  React.useLayoutEffect(()=>{reposition.current?.();});
  React.useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[]);
  const toggle=(key:string)=>{if(selection.selected.length>=comparisonLimit&&!selection.selected.includes(key)){setNotice(`最多对比${comparisonLimit}个配置，请先移除一个。`);return;}setNotice('');onToggle(key);};
  return <section className="me-focus-bar" role="region" aria-label="关注配置">
    <span className="me-focus-count me-count-heading">
      <span>对比配置</span>
      <CountBadge count={selection.selected.length} total={comparisonLimit}
        description={`已选 ${selection.selected.length} 个配置，最多 ${comparisonLimit} 个`}/>
    </span>
    <div className="me-focus-chips">{selection.selected.map(key=>{
      const row=rows.find(candidate=>candidate.configKey===key);
      if(!row)return null;
      const isBaseline=key===selection.baseline;
      return <div className="me-focus-chip" key={key} style={{'--comparison-color':color(key)} as React.CSSProperties}>
        <button className="me-baseline" title={isBaseline?'当前差值基准':'设为差值基准'} aria-label={`将 ${rowName(row)} 设为差值基准`} aria-pressed={isBaseline} onClick={()=>onBaseline(key)}>{isBaseline?'★':'☆'}</button>
        <span title={rowName(row)}>{rowSourceLabel(row)} / {modelDisplayName(row)}<small>{row.target.deployment?.value}</small></span>
        <button aria-label={`移除 ${rowName(row)}`} onClick={()=>toggle(key)}>×</button>
      </div>;
    })}</div>
    <details className="me-focus-menu" ref={menu} onToggle={event=>setOpen(event.currentTarget.open)}><summary role="button" aria-label="添加对比">添加对比</summary><div ref={options} className="me-focus-options">{candidates.map(r=><label key={r.configKey}><Checkbox checked={selection.selected.includes(r.configKey)} onChange={()=>toggle(r.configKey)}/><span><strong>{modelName(r)}</strong><small>{rowSourceLabel(r)}</small></span></label>)}{!candidates.length&&<small>没有匹配配置</small>}</div></details>
    <Button kind="text" icon="arrow" className="me-show-charts" onClick={onShowCharts}>查看图表</Button>
    {notice&&<small className="me-focus-notice" role="alert">{notice}</small>}
  </section>;
}
