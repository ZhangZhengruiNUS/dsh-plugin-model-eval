import type {ProtocolRefs} from '../contracts.ts';
import type {CodeLimits,CodeOutcome} from '../runtime/runner.ts';
import type {ContestDiagnostics} from '../runtime/contest-diagnostics.ts';

export interface CodingDiagnosticSource {
  protocols:ProtocolRefs;
  itemRevision:number;
  questionHash:string;
  answerHash:string;
  gradeHash:string;
  limits:CodeLimits;
  cases:number;
}
export interface CodingDiagnosticRecord {
  schemaVersion:1;
  diagnosticId:string;
  runId:string;
  itemId:string;
  startedAt:string;
  endedAt?:string;
  status:'running'|'stopping'|'completed'|'cancelled'|'error'|'interrupted'|'unknown';
  source?:CodingDiagnosticSource;
  outcome?:CodeOutcome;
  trace?:ContestDiagnostics;
  errorCode?:string;
}
export interface CodingDiagnosticSettings {enabled:boolean;errorCode?:string}
export interface CodingDiagnosticView extends CodingDiagnosticSettings {record?:CodingDiagnosticRecord}
