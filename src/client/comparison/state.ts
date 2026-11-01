import type {ComparisonRow} from './model.ts';
export interface ComparisonSelection {scopeKey:string;selected:string[];baseline:string|null}
export function reconcileSelection(previous:ComparisonSelection|undefined,scopeKey:string,rows:readonly ComparisonRow[]):ComparisonSelection{
  if(previous?.scopeKey===scopeKey){const selected=previous.selected.filter(k=>rows.some(r=>r.configKey===k));return {...previous,selected,baseline:selected.includes(previous.baseline??'')?previous.baseline:selected[0]??null};}
  const scored=rows.filter(r=>r.score!==null),highest=[...scored].sort((a,b)=>b.score!-a.score!||a.configKey.localeCompare(b.configKey))[0],fastest=[...scored].filter(r=>r.latencyMs!==null).sort((a,b)=>a.latencyMs!-b.latencyMs!||a.configKey.localeCompare(b.configKey))[0];
  const selected=[...new Set([highest?.configKey,fastest?.configKey].filter((x):x is string=>!!x))];return {scopeKey,selected,baseline:selected[0]??null};
}
export function toggleSelection(previous:ComparisonSelection,key:string):ComparisonSelection{
  if(!previous.selected.includes(key)&&previous.selected.length>=3)return previous;
  const selected=previous.selected.includes(key)?previous.selected.filter(k=>k!==key):[...previous.selected,key];
  return {...previous,selected,baseline:selected.includes(previous.baseline??'')?previous.baseline:selected[0]??null};
}
