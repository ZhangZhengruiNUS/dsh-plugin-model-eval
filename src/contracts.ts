import type {GenerationTiming,PerformanceState,RunEstimation} from './estimation/contracts.ts';
import type {GeneralDefinition,ReuseSummary} from './evaluation/tier-contracts.ts';
export type {GeneralTier,Ability,GeneralDefinition,QuestionCompatibility,ProtocolDescriptor,ResolvedProtocolSet,ProtocolRegistry,ProtocolCatalogItem,ReuseEvidence,UpgradeCheck,ReuseImportOperation,ReuseOrigin,ReuseSummary,UpgradePreview,UpgradeCommit} from './evaluation/tier-contracts.ts';
/** Serialized, client-safe protocol. No host credentials or Node types. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Track = 'general' | 'writing';
export type ParamValue = { state: 'known'; value: JsonValue; source: 'user' | 'override' | 'adapter' }
  | { state: 'unset' } | { state: 'unknown' };
export interface TargetSnapshot {
  scopeId: string; providerId: string; modelId: string;
  routeTarget: ParamValue; controls: Record<string, ParamValue>;
  deployment?: { value: string; source: 'user' | 'service' };
  origin?: { adapterInstance: string; settingsNs?: string; settingsRevision?: number; adapterEpoch?: number };
}
export interface PromptMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ModelChoice {
  scopeId: string; providerId: string; modelId: string; displayName: string;
  capabilities: Record<string, boolean>;
}
export interface GenerationInput { target: TargetSnapshot; messages: readonly PromptMessage[]; signal: AbortSignal;
  context: { attemptId: string; itemId: string; track: Track; phase: 'answer' | 'judge' } }
export interface GeneratedAnswer { text: string; complete: boolean; truncated: boolean; observations: AttemptObservation; error?: TechnicalError }
export interface HostAdapter {
  catalog(): Promise<ModelChoice[]>;
  snapshot(choice: ModelChoice, overrides: Record<string, ParamValue>): Promise<TargetSnapshot>;
  generateOnce(input: GenerationInput): Promise<GeneratedAnswer>;
  generateTurn?:HostToolAdapter['generateTurn'];
}
export interface NativeTool {name:string;description:string;parameters:JsonValue}
export interface ToolCall {callId:string;name:string;argumentsJson:string}
export type ToolBlock={type:'text';text:string}|{type:'tool-call';id:string;name:string;arguments:string};
export interface ToolMessage {id:string;role:'user'|'assistant'|'tool';content:ToolBlock[];source:{kind:string;provider?:string;model?:string;callId?:string};toolCallId?:string;isError?:boolean}
export interface ToolTurnInput {target:TargetSnapshot;messages:readonly ToolMessage[];tools:readonly NativeTool[];signal:AbortSignal;context?:GenerationInput['context']}
export type ToolTurnResult={kind:'completed';assistant:ToolMessage;calls:ToolCall[];finish:'stop'|'tool-calls'|'max-tokens';observation:AttemptObservation}|{kind:'technical-missing';error:TechnicalError;observation:AttemptObservation};
export interface HostToolAdapter {generateTurn(input:ToolTurnInput):Promise<ToolTurnResult>}
export interface ToolSessionCheckpoint {version:1;scenarioId:string;scenarioHash:string;targetHash:string;userTurn:number;messages:ToolMessage[];logicalRounds:number;roundReserved:boolean;actions:number;committedCallIds:string[];stateSnapshot:JsonValue;callsByTurn:ToolCall[][];pendingCalls:ToolCall[];stage:'model'|'actions'|'judge'|'done';passed?:boolean;finalReason?:string;lastCompletedAttemptId?:string}
export interface ProtocolSet { generalId: string; writingId: string; items: readonly Question[]; resourceVersion: string }
export interface Question {
  id: string; track: Track; datasetId: string; sourceId: string; sourceHash: string;
  prompt: readonly PromptMessage[]; grading: JsonValue;
}
export type RunState = 'queued' | 'checking' | 'running' | 'paused' | 'pending' | 'completed';
export type DetailsState = 'available' | 'cleanup-pending' | 'partial' | 'cleared';
export interface TrackSummary {
  status: RunState; required: number; graded: number; answered?: number; score?: number; completedAt?: string;
  measures: Record<string, { required: number; graded: number; passed?: number; score?: number }>;
}
export interface ProtocolRefs { generalId: string; writingId: string; resourceVersion: string }
export interface JudgeSnapshot { target: TargetSnapshot; rubricId: string; promptId: string }
export interface JudgeUsage { snapshot: JudgeSnapshot; itemIds: string[]; attemptedItemIds?:string[];calls?:number;failedCalls?:number }
export interface RunSummary {
  runId: string; batchId: string; target: TargetSnapshot; revision: number;
  tracks: Partial<Record<Track, TrackSummary>>; details: DetailsState; resumeAllowed: boolean;
  protocols: ProtocolRefs; judges: JudgeUsage[]; metrics: RunMetrics; completedAt?: string;
  createdAt?: string;performance?:PerformanceState;estimation?:RunEstimation;
  generalDefinition?:GeneralDefinition;reuse?:ReuseSummary;
}
export interface WritingDimensions { faithfulness: number; logic: number; coverage: number; concision: number; naturalness: number }
export interface TechnicalError {
  code: string; retryable: boolean; phase: 'answer' | 'judge' | 'grader' | 'resource' | 'config' | 'storage'; message: string;
  status?: number; retryAfterMs?: number;
}
export type GradeResult =
  | { kind: 'scored'; track: 'general'; itemId: string; passed: boolean; evidence: JsonValue }
  | { kind: 'scored'; track: 'writing'; itemId: string; score: number; dimensions: WritingDimensions; evidence: JsonValue;
      assessment: { method: 'model'; judge: JudgeSnapshot } | { method: 'local-rule'; ruleId: 'empty-answer-v1' } }
  | { kind: 'technical-missing'; track: Track; itemId: string; error: TechnicalError; evidence: JsonValue };
export interface EvaluationRequest {
  generalId?:string;
  targets: TargetSnapshot[]; tracks: Track[]; judge?: JudgeSnapshot;initialEstimates?:Record<string,RunEstimation>;
  execution: { concurrency: 1 | 2 | 3 | 4; callTimeoutMs: number };
}
export interface AttemptObservation {
  attemptId: string; itemId: string; track: Track; phase: 'answer' | 'judge';
  startedAt: string; endedAt: string; firstContentAt?: string;
  timing?:GenerationTiming;
  usage: { available: boolean; inputTokens?: number; outputTokens?: number; reasoningTokens?: number;
    cacheReadTokens?: number; cacheWriteTokens?: number; totalTokens?: number };
}
export interface PhaseMetrics {
  calls: number; failures: number; latencyMedianMs?: number; latencyP95Ms?: number;
  inputTokens?: number; outputTokens?: number; usageCoverage: number;
  ttftMedianMs?: number; ttftP95Ms?: number; latencySamples?: number; ttftSamples?: number;
  totalTokens?: number; reasoningTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number;
  outputTokensPerSecond?: number;
}
export interface RunMetrics {
  tracks: Partial<Record<Track, { answer: PhaseMetrics; judge: PhaseMetrics; gradingMs: number }>>;
  activeIntervals: { startedAt: string; endedAt?: string }[]; incompleteTiming: boolean;
}
