import type {RunSummary} from '../contracts.ts';import type {EstimateSnapshot} from '../estimation/contracts.ts';
export const hasMixedExecution=(s:Pick<RunSummary,'executionChanges'|'reuse'>)=>!!(s.executionChanges?.length||s.reuse?.mixedExecution);
export const executionChangedEstimate=(asOf:string,required:number,completed=false):EstimateSnapshot=>({algorithm:'estimate-v3',asOf,state:completed?'completed':'pending',coverage:{known:0,required},sources:[],reasons:['EXECUTION_CHANGED']});
