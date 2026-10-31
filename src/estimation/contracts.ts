import type {AttemptObservation,EvaluationRequest,JudgeSnapshot,ProtocolRefs,TargetSnapshot,Track} from '../contracts.ts';
export type StagePhase='answer'|'judge'|'local-grade';
export interface StageKey {conditionKey:string;datasetId:string;phase:StagePhase}
export interface GenerationTiming {prepareMs:number;streamMs:number;totalMs:number;firstOutputMs?:number;firstTextMs?:number;lastOutputMs?:number;sawReasoning:boolean;outputTokenScope:'observable-generated'|'unknown'}
export interface PerformanceSample extends StageKey {sampleId:string;itemId:string;startedAt:string;endedAt:string;durationMs:number;outcome:'completed'|'failed'|'timeout'|'cancelled';truncated?:boolean;queueWaitMs?:number;timing?:GenerationTiming;usage?:AttemptObservation['usage'];tpotMs?:number}
export interface CensoredBound extends StageKey {durationMs:number;observedAt:string;explained:boolean}
export interface ActiveStage extends StageKey {sampleId:string;itemId:string;startedAt:string}
export interface PerformanceState {version:1;samples:PerformanceSample[];recentFailures?:PerformanceSample[];censoredBounds:CensoredBound[];activeStages:ActiveStage[]}
export interface TimeRange {low:number;high:number}
export interface EstimateSnapshot {algorithm:'estimate-v1';asOf:string;state:'calibrating'|'available'|'partial'|'stalled'|'paused'|'pending'|'completed';remainingMs?:TimeRange;totalMs?:TimeRange;coverage:{known:number;required:number};sources:string[];reasons:string[]}
export interface RunEstimation {current:EstimateSnapshot;originPreview?:SpeedSummary;final?:EstimateSnapshot}
export interface SpeedConfigRecord {conditionKey:string;target:TargetSnapshot;tracks:Track[];protocols:ProtocolRefs;execution:EvaluationRequest['execution'];judge?:JudgeSnapshot;status:'queued'|'running'|'stopping'|'completed'|'stopped'|'failed';startedAt?:string;endedAt?:string;performance:PerformanceState;errorCode?:string}
export interface SpeedSession {version:1;previewId:string;rootId:string;revision:number;createdAt:string;updatedAt:string;budgetMinutes:number;status:'running'|'stopping'|'completed'|'stopped'|'interrupted'|'failed';configs:SpeedConfigRecord[];estimate?:EstimateSnapshot}
export type SpeedSummary=SpeedSession;
export interface PlannedJob {itemId:string;datasetId:string;track:Track;stages:StagePhase[]}
export interface EstimationRunInput {target:TargetSnapshot;protocols:ProtocolRefs;execution:EvaluationRequest['execution'];judge?:JudgeSnapshot;jobs:PlannedJob[];performance:PerformanceState;priorSamples:PerformanceSample[];priorBounds?:CensoredBound[];priorSource?:string;activeElapsedMs:number;status:'running'|'queued'|'paused'|'pending'|'completed';activeWaitMs?:Record<string,number>}
