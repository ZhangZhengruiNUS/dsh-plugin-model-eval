import type {HistoryStore} from '../history/store.ts';
import type {ComparisonExecution,ComparisonMetadata} from './contracts.ts';
function execution(value:unknown):ComparisonExecution {
  const v=value as {concurrency?:number;callTimeoutMs?:number}|undefined;
  return v&&Number.isInteger(v.concurrency)&&v.concurrency!>=1&&v.concurrency!<=4&&Number.isInteger(v.callTimeoutMs)&&v.callTimeoutMs!>=1000&&v.callTimeoutMs!<=1800000
    ?{state:'known',concurrency:v.concurrency!,callTimeoutMs:v.callTimeoutMs!}:{state:'unknown'};
}
/** Read committed summaries and manifests only; never open item directories. */
export async function readComparisonMetadata(store:HistoryStore,rootEpoch:number):Promise<ComparisonMetadata>{
  const result:ComparisonMetadata={rootId:store.rootId,rootEpoch,summaries:[],runs:[]};
  for(const summary of await store.listSummaries()){
    try{const run=await store.getRun(summary.runId);result.summaries.push(run.summary);result.runs.push({runId:run.summary.runId,revision:run.summary.revision,execution:execution(run.manifest.execution),conditionAvailable:true});}
    catch(error){if(['HISTORY_CLOSED','SERVICE_DISPOSED'].includes((error as {code?:string}).code??''))throw error;
      result.summaries.push(summary);result.runs.push({runId:summary.runId,revision:summary.revision,execution:{state:'unknown'},conditionAvailable:false});}
  }
  return result;
}
