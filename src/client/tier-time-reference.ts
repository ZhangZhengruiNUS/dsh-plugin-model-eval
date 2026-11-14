import type {SpeedConfigRecord,SpeedSession} from '../estimation/contracts.ts';
import {validSpeedBudget} from '../speed/budget.ts';

export type PlanningTier='light'|'deep';

// Rounded provider-reported output totals for the matching 1.0 questions.
// Light uses the median of three reference runs. Deep has one reference run.
export const tierOutputTokens:Record<PlanningTier,number>={light:270_000,deep:2_400_000};

function measuredOutputRate(config:SpeedConfigRecord,budgetMs:number){
  const reachedBudget=config.status==='stopped'&&config.errorCode==='SPEED_BUDGET_REACHED';
  if(config.status!=='completed'&&!reachedBudget)return;

  const replies=config.performance.samples.filter(sample=>sample.phase==='answer'&&sample.outcome==='completed');
  if(replies.length<2)return;
  const firstStart=Math.min(...replies.map(reply=>Date.parse(reply.startedAt)));
  const cutoff=firstStart+budgetMs;
  const measured=replies.filter(reply=>Date.parse(reply.endedAt)<=cutoff);
  if(measured.length<2)return;

  let tokens=0;
  let lastEnd=firstStart;
  for(const reply of measured){
    const output=reply.usage?.outputTokens;
    const started=Date.parse(reply.startedAt);
    const ended=Date.parse(reply.endedAt);
    if(output===undefined||!Number.isSafeInteger(output)||output<0||!Number.isFinite(started)||ended<=started)return;
    tokens+=output;
    lastEnd=Math.max(lastEnd,ended);
  }
  const elapsedMs=(reachedBudget?cutoff:lastEnd)-firstStart;
  if(tokens>0&&Number.isFinite(elapsedMs)&&elapsedMs>0)return tokens*1000/elapsedMs;
}

export function tierTimeReference(tier:PlanningTier,concurrency:number,configurationCount:number,row?:SpeedSession){
  if(row?.status!=='completed'||row.probeMethod!=='speed-probe-v4'||!validSpeedBudget(row.budgetMinutes)
    ||configurationCount<1||row.configs.length!==configurationCount)return;
  const rates=[];
  for(const config of row.configs){
    if(config.execution.concurrency!==concurrency||config.protocols.generalId!=='general-task-five-v3-r3-'+tier
      ||config.tracks.length!==1||config.tracks[0]!=='general')return;
    const rate=measuredOutputRate(config,Math.round(row.budgetMinutes*60_000));
    if(rate===undefined)return;
    rates.push(rate);
  }
  // The probe ran at the selected concurrency. Each rate already includes
  // overlap between calls. Configurations run in sequence.
  return {rates,durationMs:rates.reduce((sum,rate)=>sum+tierOutputTokens[tier]*1000/rate,0)};
}

export function formatPlanningTime(ms:number){
  const raw=ms/60_000;
  const step=raw<5?1:raw<60?5:raw<180?30:60;
  const minutes=Math.max(1,Math.round(raw/step)*step);
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return '约 '+[hours?hours+' 小时':'',rest?rest+' 分钟':''].filter(Boolean).join(' ');
}
