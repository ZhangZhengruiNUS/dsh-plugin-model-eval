import {isRunConcurrency} from '../contracts.ts';
import type {HistoryStore} from '../history/store.ts';
import type {ComparisonExecution,ComparisonMetadata} from './contracts.ts';
function execution(value:unknown):ComparisonExecution {
  const v=value as {concurrency?:number;callTimeoutMs?:number;failurePolicy?:import('../contracts.ts').EvaluationRequest['execution']['failurePolicy']}|undefined;
  return v&&isRunConcurrency(v.concurrency)&&Number.isInteger(v.callTimeoutMs)&&v.callTimeoutMs!>=1000&&v.callTimeoutMs!<=1800000
    ?{state:'known',concurrency:v.concurrency,callTimeoutMs:v.callTimeoutMs!,...(v.failurePolicy?{failurePolicy:v.failurePolicy}:{})}:{state:'unknown'};
}
/** Read committed summaries and manifests only; never open item directories. */
export async function readComparisonMetadata(store:HistoryStore,rootEpoch:number):Promise<ComparisonMetadata>{
  const result:ComparisonMetadata={rootId:store.rootId,rootEpoch,summaries:[],runs:[]};
  for(const summary of await store.listSummaries()){
    try{const run=await store.getRun(summary.runId);result.summaries.push(run.summary);result.runs.push({runId:run.summary.runId,revision:run.summary.revision,execution:run.summary.regradeOrigin||run.summary.executionChanges?.length||run.summary.reuse?.mixedExecution||run.summary.reuse?.mixedPeriod?{state:'unknown',reason:'mixed'}:execution(run.manifest.execution),conditionAvailable:true});}
    catch(error){if(['HISTORY_CLOSED','SERVICE_DISPOSED'].includes((error as {code?:string}).code??''))throw error;
      result.summaries.push(summary);result.runs.push({runId:summary.runId,revision:summary.revision,execution:{state:'unknown'},conditionAvailable:false});}
  }
  return result;
}
