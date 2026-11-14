import * as React from 'react';

/** Explicit host ancestry wins over OS preference, including explicit light. */
export function useHostAppearance(root:React.RefObject<HTMLElement>):'light'|'dark'{
 const [appearance,setAppearance]=React.useState<'light'|'dark'>(()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
 React.useLayoutEffect(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');
  const update=()=>{let host=root.current?.parentElement;while(host){const explicit=host.getAttribute('data-theme')??host.getAttribute('data-color-mode');if(explicit==='light'||explicit==='dark'){setAppearance(explicit);return;}if(host.classList.contains('dark')){setAppearance('dark');return;}if(host.classList.contains('light')){setAppearance('light');return;}host=host.parentElement;}setAppearance(media.matches?'dark':'light');};
  update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['class','data-theme','data-color-mode']});media.addEventListener('change',update);
  return()=>{observer.disconnect();media.removeEventListener('change',update);};
 },[root]);
 return appearance;
}
