import {Checkbox} from '../../primitives/primitives.tsx';
import * as React from 'react';
import type {ClientApi} from '../../api.ts';
import {modelDisplayName,rowSourceLabel,type ComparisonRow} from '../../comparison/model.ts';
import type {CommonItemsProjection} from '../../../comparison/common-items.ts';
import {Modal,Button} from '../../ui.tsx';
import {ComparisonTable} from '../ComparisonTable.tsx';
const names={knowledge:'知识与推理',reading:'资料理解',instructions:'指令遵循',coding:'代码能力',tools:'工具使用'};
const version=(row:ComparisonRow)=>row.source.generalDefinition?.schema==='task-five-v3'?'新版 · 64题':'旧版 · 64题';
const reason=(code:string)=>({COMMON_DETAILS_UNAVAILABLE:'逐题明细已清理，无法核对共同题。',COMMON_DETAILS_INCOMPLETE:'逐题明细不完整，暂时无法比较。',COMMON_SOURCE_CORRUPT:'这条记录未通过完整性核验。',COMMON_SOURCE_INCOMPLETE:'这条评测尚未完成。',COMMON_REFERENCE_UNAVAILABLE:'参考记录没有可核对的逐题证据。',COMMON_VERSION_UNSUPPORTED:'这两个版本尚不支持共同题比较。',COMMON_PROTOCOL_UNAVAILABLE:'对应题集暂不可用，请先准备评测环境。',COMMON_MAP_INVALID:'版本间的题目身份未通过核验。',COMMON_READ_BUSY:'另一项比较正在核对，请稍后重试。',COMMON_HISTORY_READ_ONLY:'当前目录正由另一个实例使用，请稍后重试。'}[code]??'暂时无法核对共同题，请重试。');
interface Reply {rootId:string;rootEpoch:number;projection?:CommonItemsProjection;reasonCode?:string}
export function CommonComparison({rows,initialIds,api,rootId,rootEpoch,onClose,onReport}:{rows:readonly ComparisonRow[];initialIds:readonly string[];api:ClientApi;rootId:string;rootEpoch:number;onClose():void;onReport(id:string):void}){
 const [selected,setSelected]=React.useState<string[]>(()=>{const first=rows.find(r=>initialIds.includes(r.runId)&&!r.reference)??rows.find(r=>initialIds.includes(r.runId))??rows[0],different=(r:ComparisonRow)=>r.source.protocols.resourceVersion!==first?.source.protocols.resourceVersion,other=rows.find(r=>different(r)&&!r.reference&&r.target.providerId===first?.target.providerId&&r.target.modelId===first?.target.modelId)??rows.find(r=>different(r)&&!r.reference)??rows.find(different);return [first?.runId,other?.runId].filter((s):s is string=>!!s);});
 const [projection,setProjection]=React.useState<CommonItemsProjection>(),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),[retry,setRetry]=React.useState(0);
 const tail=React.useRef<Promise<unknown>>(Promise.resolve()),chosen=selected.flatMap(id=>rows.filter(r=>r.runId===id));
 const key=JSON.stringify([rootId,rootEpoch,retry,chosen.map(r=>[r.runId,r.source.revision,r.source.details,r.source.generalDefinition?.definitionHash])]);
 const valid=chosen.length>=2&&new Set(chosen.map(r=>r.source.protocols.resourceVersion)).size===2;
 React.useEffect(()=>{
  let current=true;setProjection(undefined);setError('');setLoading(valid);if(!valid)return;
  const payload={runIds:chosen.filter(r=>!r.reference).map(r=>r.runId),referenceIds:chosen.filter(r=>r.reference).map(r=>r.runId)};
  // Serialize selection changes. Aborting a fetch does not stop the server's bounded evidence read.
  const task=tail.current.catch(()=>{}).then(async()=>{
   if(!current)return;const value=await api<Reply>('comparisonCommon',payload);if(!current)return;
   if(value.rootId!==rootId||value.rootEpoch!==rootEpoch)throw Error('数据目录已变化，请重新打开比较。');
   if(value.reasonCode)setError(reason(value.reasonCode));else if(value.projection)setProjection(value.projection);else setError(reason(''));
  });tail.current=task.catch(()=>{});
  void task.catch(e=>{if(current)setError(e instanceof Error?e.message:reason(''));}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[key,api]);
 function toggle(id:string){setSelected(previous=>previous.includes(id)?previous.filter(x=>x!==id):previous.length<3?[...previous,id]:previous);}
 return <Modal title="跨版本比较" onClose={onClose} wide><div className="me-dialog-body me-common-view">
  <p className="me-help">只比较题目和评分条件相同的部分，各版本原成绩保留。</p>
  <fieldset className="me-common-picker"><legend>对比配置 · {selected.length} / 3</legend><div className="me-common-options">{rows.map(row=><label key={row.runId} className={selected.includes(row.runId)?'selected':''}><Checkbox checked={selected.includes(row.runId)} disabled={selected.length>=3&&!selected.includes(row.runId)} onChange={()=>toggle(row.runId)}/><span><strong>{rowSourceLabel(row)} / {modelDisplayName(row)}</strong><small>{version(row)}{row.target.deployment?.value?' · '+row.target.deployment.value:''}{row.reference?' · 内置参考':''}</small></span></label>)}</div></fieldset>
  {!valid&&<p className="me-help" role="status">选择 2—3 个配置，至少包含两个版本。</p>}
  {loading&&<p role="status" aria-live="polite">正在核对共同题…</p>}
  {error&&<div className="me-inline-warning" role="alert">{error}<Button kind="text" onClick={()=>setRetry(n=>n+1)}>重试</Button></div>}
  {projection&&<section className="me-common-results"><h3>{projection.commonCount} 道共同题</h3>{projection.atCeiling&&<p className="me-help">所选模型在共同部分均已满分，暂时无法拉开差距。</p>}<ComparisonTable><table><caption>各项通过题数 / 共同题数</caption><thead><tr><th scope="col">模型配置</th>{Object.values(names).map(name=><th key={name} scope="col">{name}</th>)}<th scope="col">原记录</th></tr></thead><tbody>{chosen.map(row=>{const value=projection.runs.find(r=>r.runId===row.runId);return <tr key={row.runId}><th scope="row"><strong>{rowSourceLabel(row)} / {modelDisplayName(row)}</strong><small>{version(row)}{row.reference?' · 内置参考':''}</small></th>{value?.available?Object.keys(names).map(id=>{const domain=value.domains.find(d=>d.id===id);return <td key={id}>{domain?.required?`${domain.passed} / ${domain.required}`:'无共同题'}</td>;}):<td colSpan={5}>{reason(value&&!value.available?value.reasonCode:'')}</td>}<td><Button kind="text" aria-label={'查看原报告 '+rowSourceLabel(row)+' / '+modelDisplayName(row)} onClick={()=>onReport(row.runId)}>查看原报告</Button></td></tr>;})}</tbody></table></ComparisonTable><p className="me-help">共同部分的题量不同于完整题集，此处不计算新的综合分或耗时排名。</p></section>}
 </div><footer className="me-dialog-foot"><Button onClick={onClose}>完成</Button></footer></Modal>;
}
