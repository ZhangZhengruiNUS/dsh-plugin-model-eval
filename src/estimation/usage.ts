import type {TimingUsage} from './calibration-contracts.ts';
/** Provider total is authoritative for display. Cache may already be part of input; never add it twice. */
export function recordedUsage(usage:TimingUsage|undefined):{tokens?:number;complete:boolean}{
 if(usage?.totalTokens!==undefined)return {tokens:usage.totalTokens,complete:true};
 if(usage?.inputTokens===undefined&&usage?.outputTokens===undefined)return {complete:false};
 return {tokens:(usage.inputTokens??0)+(usage.outputTokens??0),complete:usage.inputTokens!==undefined&&usage.outputTokens!==undefined&&!usage.cacheReadTokens&&!usage.cacheWriteTokens&&!usage.reasoningTokens};
}
