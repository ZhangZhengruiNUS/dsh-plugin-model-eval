import type {RunSummary} from '../contracts.ts';
export type ComparisonExecution={state:'known';concurrency:number;callTimeoutMs:number;failurePolicy?:import('../contracts.ts').EvaluationRequest['execution']['failurePolicy']}|{state:'unknown';reason?:'mixed'};
export interface ComparisonMetadata {
  rootId:string;rootEpoch:number;summaries:RunSummary[];
  runs:{runId:string;revision:number;execution:ComparisonExecution;conditionAvailable:boolean}[];
}
