import * as React from 'react';
import type {ModelChoice} from '../../contracts.ts';
import {Icon} from '../ui.tsx';

/** Select-only combobox. The popup stays inside the dialog's focus boundary. */
export function ModelSelect({label,value,models,disabled,onChange,placeholder}:{label:string;value:string;models:ModelChoice[];disabled:boolean;onChange(value:string):void;placeholder:string}){
  const id=React.useId(),root=React.useRef<HTMLDivElement>(null),trigger=React.useRef<HTMLButtonElement>(null),popup=React.useRef<HTMLDivElement>(null);
  const [open,setOpen]=React.useState(false),[active,setActive]=React.useState(0),[position,setPosition]=React.useState<React.CSSProperties>();
  const search=React.useRef({text:'',at:0});
  const key=(m:ModelChoice)=>JSON.stringify([m.providerId,m.modelId]),selected=models.findIndex(m=>key(m)===value),chosen=models[selected];
  const host=root.current?.closest<HTMLElement>('.me-dialog');
  function show(index=selected<0?0:selected){if(disabled||!models.length||trigger.current?.matches(':disabled'))return;setActive(index);setOpen(true);}
  function commit(index:number){const model=models[index];if(model)onChange(key(model));setOpen(false);}
  React.useLayoutEffect(()=>{
    if(!open||!host)return;
    const layer=popup.current!,native=typeof layer.showPopover==='function';if(native){layer.setAttribute('popover','manual');layer.showPopover();}
    const place=()=>{
      const anchor=trigger.current!.getBoundingClientRect(),body=host.querySelector('.me-dialog-body')!.getBoundingClientRect();
      if(anchor.bottom<=body.top||anchor.top>=body.bottom){setOpen(false);return;}
      const bottom=Math.min(body.bottom,innerHeight-12),top=Math.max(body.top,12),below=bottom-anchor.bottom-8,above=anchor.top-top-8;
      const up=below<Math.min(240,models.length*60+12)&&above>below,height=Math.min(324,Math.max(60,up?above:below));
      const origin=native?{left:0,top:0}:root.current!.getBoundingClientRect();
      setPosition({position:native?'fixed':'absolute',left:anchor.left-origin.left,top:(up?anchor.top-8:anchor.bottom+8)-origin.top,width:anchor.width,maxHeight:height,...(up?{transform:'translateY(-100%)'}:{})});
    };
    place();const observer=new ResizeObserver(place);observer.observe(host);observer.observe(trigger.current!);
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);};
    const scroll=(event:Event)=>{if(!popup.current?.contains(event.target as Node))place();};
    window.addEventListener('resize',place);host.addEventListener('scroll',scroll,true);document.addEventListener('pointerdown',outside);
    return()=>{if(native&&layer.isConnected)layer.hidePopover();observer.disconnect();window.removeEventListener('resize',place);host.removeEventListener('scroll',scroll,true);document.removeEventListener('pointerdown',outside);};
  },[open,host,models.length]);
  React.useLayoutEffect(()=>{if(open){const option=popup.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);if(option&&popup.current){const box=popup.current;box.scrollTop=Math.max(option.offsetTop+option.offsetHeight-box.clientHeight,Math.min(box.scrollTop,option.offsetTop));}}},[active,open,position]);
  React.useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  function keyboard(event:React.KeyboardEvent){
    const k=event.key;
    if(k==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);return;}
    if(k==='Tab'){if(open)commit(active);return;}
    if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Enter',' '].includes(k)){
      event.preventDefault();event.stopPropagation();
      if(!open){show(k==='End'?models.length-1:k==='Home'?0:undefined);return;}
      if(k==='Enter'||k===' '){commit(active);return;}
      setActive(k==='Home'?0:k==='End'?models.length-1:Math.max(0,Math.min(models.length-1,active+(k==='ArrowDown'?1:k==='ArrowUp'?-1:k==='PageDown'?10:-10))));return;
    }
    if(k.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();const now=Date.now(),text=now-search.current.at>700?k:search.current.text+k;search.current={text,at:now};
      const term=[...text].every(c=>c===text[0])?k:text,start=term.length===1?active+1:active;
      for(let n=0;n<models.length;n++){const index=(start+n)%models.length,m=models[index]!;if(m.displayName.toLowerCase().startsWith(term.toLowerCase())||`${m.providerId} / ${m.displayName}`.toLowerCase().startsWith(term.toLowerCase())){show(index);break;}}
    }
  }
  return <div ref={root} className="me-model-select"><span id={id+'-label'} className="me-select-label">{label}</span><button ref={trigger} type="button" role="combobox" aria-labelledby={id+'-label'} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?id+'-list':undefined} aria-activedescendant={open?id+'-option-'+active:undefined} disabled={disabled||!models.length} className={'me-select-trigger '+(open?'expanded':'')} onClick={()=>open?setOpen(false):show()} onKeyDown={keyboard} onBlur={()=>setOpen(false)}>
    <span className="me-select-value">{chosen?<><strong>{chosen.displayName}</strong><small>{chosen.providerId}</small></>:<span className="me-select-placeholder">{placeholder}</span>}</span><svg className="me-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>{open&&host&&<div ref={popup} id={id+'-list'} role="listbox" aria-labelledby={id+'-label'} className="me-select-popup" style={position} onMouseDown={e=>e.preventDefault()}>{models.map((m,index)=><div id={id+'-option-'+index} data-index={index} key={key(m)} role="option" aria-selected={selected===index} aria-label={`${m.providerId} / ${m.displayName}${m.displayName!==m.modelId?' / '+m.modelId:''}`} className={'me-select-option '+(active===index?'active':'')} onPointerMove={()=>setActive(index)} onClick={()=>commit(index)}><span><strong>{m.displayName}</strong><small>{m.providerId}{m.displayName!==m.modelId?' · '+m.modelId:''}</small></span><Icon name="check" size={17}/></div>)}</div>}</div>;
}
