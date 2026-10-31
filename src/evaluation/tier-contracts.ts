import type {JsonValue,PhaseMetrics,ProtocolRefs,ProtocolSet,RunMetrics,Track} from '../contracts.ts';
import type {AttemptRecord} from '../history/store.ts';
export type GeneralTier='legacy'|'light'|'deep';
export type Ability='knowledge'|'math'|'instructions'|'coding';
export interface QuestionCompatibility {contentHash:string;promptHash:string;gradingHash:string;runtimeHash:string;combinedHash:string}
export interface GeneralDefinition {tier:GeneralTier;label:string;definitionHash:string;domains:readonly {id:Ability;weight:number;itemIds:readonly string[]}[];parentGeneralId?:string}
export interface ProtocolDescriptor {refs:ProtocolRefs;general:GeneralDefinition;questionCount:number;allowNewRuns:boolean}
export interface ResolvedProtocolSet extends ProtocolSet {descriptor:ProtocolDescriptor;compatibility:Readonly<Record<string,QuestionCompatibility>>}
export interface ProtocolRegistry {list():readonly ProtocolDescriptor[];resolve(refs:ProtocolRefs):Promise<ResolvedProtocolSet>;forNewRun(generalId:string):Promise<ResolvedProtocolSet>}
export interface ProtocolCatalogItem {descriptor:ProtocolDescriptor;prepared:boolean;errorCode?:string}
export interface ReuseEvidence {sourceRunId:string;sourceItemId:string;sourceRevision:number;sourceRecordHash:string;compatibility:QuestionCompatibility;sourceAnswerCommittedAt:string;sourceGradeCommittedAt:string;importedAt:string;sourceAttempts:readonly AttemptRecord[]}
export interface UpgradeCheck {eligible:boolean;reasonCode?:string;sourceRunId:string;sourceRevision:number;sourceEvidenceHash:string;targetBindingHash:string;deepGeneralId:string;reusedItems:number;newItems:number}
export interface ReuseImportOperation {operationId:string;token:string;sourceRunId:string;destinationRunId:string;destinationBatchId:string;sourceRevision:number;sourceEvidenceHash:string;deepRefs:ProtocolRefs;targetBindingHash:string;state:'copying'|'ready'|'failed';copiedItemIds:string[];errorCode?:string}
export interface ReuseOrigin {sourceRunId:string;sourceActivity:{scope:'source-run';tracks:readonly Track[];activeIntervals:RunMetrics['activeIntervals'];incompleteTiming:boolean};sourceCreatedAt?:string;sourceCompletedAt?:string}
export interface ReuseSummary extends ReuseOrigin {reusedItems:number;sourceAnswerMetrics:PhaseMetrics}
export interface UpgradePreview {token:string;expiresAt:string;check:UpgradeCheck}
export interface UpgradeCommit {batchId:string;runId:string;operationId:string}
export interface ProtocolBundleFile {path:string;sha256:string;size:number}
export interface ProtocolBundle {id:string;resourceVersion:string;files:ProtocolBundleFile[];grading:JsonValue;runtime:JsonValue;questionPath:string;runtimePassed:boolean}
