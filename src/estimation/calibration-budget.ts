import {calibrationHash,type CalibrationBudget,type TimingUsage} from './calibration-contracts.ts';
import {speedClock,type SpeedClock} from '../speed/clock.ts';
export function createCalibrationBudget(grant:CalibrationBudget,conditionKey:string,clock:SpeedClock=speedClock){
 if(!calibrationHash(conditionKey)||grant.conditionKey!==conditionKey)throw Error('CALIBRATION_CONDITION_CHANGED');
 if(!Number.isSafeInteger(grant.maxDispatches)||grant.maxDispatches<1||!Number.isSafeInteger(grant.maxWallMs)||grant.maxWallMs<1||grant.maxReportedTokens!==undefined&&(!Number.isSafeInteger(grant.maxReportedTokens)||grant.maxReportedTokens<1))throw Error('CALIBRATION_BUDGET_INVALID');
 const frozen=structuredClone(grant),controller=new AbortController(),start=clock.monotonicMs();let calls=0,reportedTokens:number|undefined,partialUsage=false;
 const cancel=clock.schedule(frozen.maxWallMs,()=>controller.abort());
 const canDispatch=()=>{if(clock.monotonicMs()-start>=frozen.maxWallMs)controller.abort();return !controller.signal.aborted;};
 return {signal:controller.signal,canDispatch,reserve(){if(!canDispatch()||calls>=frozen.maxDispatches)return false;calls++;return true;},
  recordUsage(usage:TimingUsage){
   for(const key of ['inputTokens','outputTokens','reasoningTokens','totalTokens','cacheReadTokens','cacheWriteTokens'] as const)if(usage[key]!==undefined&&(!Number.isSafeInteger(usage[key])||usage[key]!<0)){controller.abort();throw Error('CALIBRATION_USAGE_INVALID');}
   const hasParts=usage.inputTokens!==undefined||usage.outputTokens!==undefined||usage.reasoningTokens!==undefined||usage.cacheReadTokens!==undefined||usage.cacheWriteTokens!==undefined;
   const lower=hasParts?Math.max(usage.inputTokens??0,usage.cacheReadTokens??0,usage.cacheWriteTokens??0)+Math.max(usage.outputTokens??0,usage.reasoningTokens??0):undefined;
   const n=usage.totalTokens!==undefined?Math.max(usage.totalTokens,lower??0):lower;
   if(n!==undefined&&(!Number.isSafeInteger(n)||n<0)){controller.abort();throw Error('CALIBRATION_USAGE_INVALID');}
   if(!usage.available||usage.totalTokens===undefined&&(usage.inputTokens===undefined||usage.outputTokens===undefined))partialUsage=true;
   if(n!==undefined){reportedTokens=(reportedTokens??0)+n;if(!Number.isSafeInteger(reportedTokens)){controller.abort();throw Error('CALIBRATION_USAGE_INVALID');}if(frozen.maxReportedTokens!==undefined&&reportedTokens>=frozen.maxReportedTokens)controller.abort();}
  },snapshot(){return {calls,maxDispatches:frozen.maxDispatches,reportedTokens,partialUsage,elapsedWallMs:Math.max(0,clock.monotonicMs()-start),stopped:controller.signal.aborted};},dispose(){cancel();controller.abort();}};
}
