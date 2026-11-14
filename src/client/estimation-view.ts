import type {EstimateSnapshot,SpeedSession,TimeRange} from '../estimation/contracts.ts';
import {recordedUsage} from '../estimation/usage.ts';
export const estimateLabels:Record<EstimateSnapshot['state'],string>={calibrating:'正在校准',available:'根据当前数据预估',partial:'部分阶段样本不足，暂无法估计全程',stalled:'当前调用慢于样本，正在重新估算',paused:'暂停时预估',pending:'处理后继续评测，再校准剩余时间',completed:'已完成'};
function duration(ms:number,upper:boolean){if(ms<1000)return '不足1秒';if(ms<60000)return `${upper?Math.ceil(ms/1000):Math.floor(ms/1000)}秒`;if(ms<3600000)return `${Math.max(1,upper?Math.ceil(ms/60000):Math.floor(ms/60000))}分钟`;const minutes=upper?Math.ceil(ms/60000):Math.floor(ms/60000);return `${Math.floor(minutes/60)}小时${minutes%60?`${minutes%60}分钟`:''}`;}
export function formatEstimate(range:TimeRange){const lo=duration(range.low,false),hi=duration(range.high,true);return '约'+(lo===hi?lo:`${lo}—${hi}`);}
export function speedUsage(row:SpeedSession){let input:number|undefined,output:number|undefined,total:number|undefined,partial=false;for(const c of row.configs){for(const s of [...c.performance.samples,...(c.performance.recentFailures??[])])if(s.phase==='answer'||s.phase==='judge'){if(s.usage?.inputTokens!==undefined)input=(input??0)+s.usage.inputTokens;if(s.usage?.outputTokens!==undefined)output=(output??0)+s.usage.outputTokens;const usage=recordedUsage(s.usage);if(usage.tokens!==undefined)total=(total??0)+usage.tokens;if(!usage.complete)partial=true;}if(['running','stopping'].includes(c.status)||c.performance.activeStages.some(s=>s.phase==='answer'||s.phase==='judge'))partial=true;}return {input,output,total,partial};}

export function formatSpeedBudget(minutes:number){const seconds=Math.round(minutes*60);return seconds<60?`${seconds}秒`:`${Math.floor(seconds/60)}分钟${seconds%60?`${seconds%60}秒`:''}`;}
export function formatReference(ms:number){if(ms<60000)return `约${Math.max(5,Math.round(ms/5000)*5)}秒`;const minutes=Math.max(1,Math.round(ms/60000));return minutes<60?`约${minutes}分钟`:`约${Math.floor(minutes/60)}小时${minutes%60?`${minutes%60}分钟`:''}`;}
export function missingStageLabels(snapshot:EstimateSnapshot){return [...new Set(snapshot.reasons.flatMap(reason=>{const [,dataset,phase]=reason.split(':');if(!/^(MISSING_STAGE|CENSORED_STAGE|RETRY_OVERHEAD_UNKNOWN):/.test(reason))return [];if(dataset==='code-contests-selected'||dataset==='humaneval-plus')return [phase==='local-grade'?'编程判分':'编程作答'];if(dataset==='bfcl-v4-multi-turn-selected')return ['工具任务'];if(dataset==='longbench-v2-selected')return ['资料理解'];if(dataset==='writing')return [phase==='judge'?'写作裁判':'写作作答'];return ['部分任务'];}))];}
export function estimateDisplay(snapshot:EstimateSnapshot|undefined,mode:'remaining'|'total'|'preview'='remaining'){
 if(snapshot?.algorithm==='estimate-v3'){
  const title=mode==='remaining'?(snapshot.state==='completed'?'首轮状态':'预计剩余'):'预计首轮耗时',basis=snapshot.basis;
  if(basis?.phase==='makeup')return {kind:'missing' as const,title:'补测耗时',text:'补测中',description:'补测单独计时，首轮耗时保留在报告中。'};
  const point=mode==='remaining'?snapshot.referenceRemainingMs:snapshot.referenceTotalMs;
  if(basis?.durationScope==='first-pass'&&['available','paused','completed'].includes(snapshot.state)&&typeof point==='number'&&Number.isFinite(point)&&point>=0)return {kind:'full' as const,title,text:snapshot.state==='completed'&&mode==='remaining'?'首轮已跑完':formatReference(point),description:snapshot.state==='completed'?(basis.deferredItems?`${basis.deferredItems}题待补测；补齐后才出完整成绩。`:'全部题目已完成判分。'):snapshot.state==='paused'?'暂停时的初步估计；补测另计。':'初步估计，运行中更新；补测另计。'};
  if(snapshot.reasons.includes('EXECUTION_CHANGED'))return {kind:'missing' as const,title:snapshot.state==='completed'?'评测状态':title,text:snapshot.state==='completed'?'本轮已完成':'续跑耗时暂不估计',description:'本轮等待规则已变更，保留实际计时和原预测，不混用不同条件估算。'};
  if(snapshot.reasons.includes('TIMING_UNAVAILABLE'))return {kind:'missing' as const,title,text:'估时暂不可用',description:'本地计时记录暂不可用；能力评测和成绩保存可继续。'};const noBaseline=snapshot.reasons.includes('NO_APPLICABLE_BASELINE');
  return {kind:'missing' as const,title,text:snapshot.state==='stalled'?'重新估算中':noBaseline?'待建立参照':snapshot.state==='pending'?'已中断':'校准中',description:noBaseline?'暂无匹配的历史参照；本轮跑完后可用于后续估时。':snapshot.state==='stalled'?'当前任务慢于已有观测，完成后继续更新。':snapshot.state==='pending'?'已保存进度，继续评测后再更新剩余时间。':mode==='preview'?'正在积累有效观测；可直接开始评测。':'正在积累有效观测，稍后更新耗时预估。'};
 }
 const missing={kind:'missing' as const,title:mode==='remaining'?'预计剩余':'参考总时长',text:'待校准',description:snapshot?estimateLabels[snapshot.state]:'测速数据不足，可直接开始评测，运行中会自动估时。'};
 if(!snapshot||!['available','partial','paused','completed'].includes(snapshot.state))return missing;
 if(snapshot.algorithm==='estimate-v2'){
  const point=mode==='total'?snapshot.referenceTotalMs:snapshot.referenceRemainingMs;
  if(point!==undefined&&Number.isFinite(point)&&point>=0)return {kind:'full' as const,title:mode==='remaining'?'预计剩余':'参考总时长',text:formatReference(point),description:snapshot.state==='paused'?'暂停时预估':'根据实测样本推算，运行中持续更新。'};
  if(snapshot.observedRemainingMs!==undefined&&Number.isFinite(snapshot.observedRemainingMs)&&snapshot.observedRemainingMs>=0){const labels=missingStageLabels(snapshot);return {kind:'partial' as const,title:mode==='remaining'?'已测部分剩余参考':'已测部分参考用时',text:formatReference(snapshot.observedRemainingMs)+'＋待校准',description:`待校准：${labels.join('、')||'部分任务'}；此数值不含这些部分。`};}
  return missing;
 }
 const range=mode==='total'?snapshot.totalMs:snapshot.remainingMs;
 if(snapshot.approximate||range&&(!Number.isFinite(range.low)||!Number.isFinite(range.high)||range.low<0||range.high<range.low||range.low===0&&range.high>0||range.low>0&&range.high/range.low>3))return {...missing,description:'旧版宽区间已停用，可重新测速或直接开始评测。'};
 return range?{kind:'full' as const,title:mode==='remaining'?'预计剩余':'预计总耗时',text:formatEstimate(range),description:estimateLabels[snapshot.state]}:missing;
}
export function estimateDescription(snapshot:EstimateSnapshot){return estimateDisplay(snapshot).description;}
