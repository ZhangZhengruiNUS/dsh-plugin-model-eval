import type {RunSummary,ReuseOrigin} from '../../src/contracts.ts';
import type {ItemRecord,RunManifest} from '../../src/history/store.ts';
import {reuseFixture} from './reuse-fixture.ts';
export function reusedMetricsFixture(){
  const f=reuseFixture(),origin:ReuseOrigin={operationId:'fixture-operation',sourceRunId:f.source.manifest.runId,sourceActivity:{scope:'source-run',tracks:['general','writing'],activeIntervals:f.source.summary.metrics.activeIntervals,incompleteTiming:false},sourceCreatedAt:f.source.manifest.createdAt};
  const imported:ItemRecord[]=f.source.items.map((item,i)=>({...item,attempts:[],reuse:{sourceRunId:origin.sourceRunId,sourceItemId:item.itemId,sourceRevision:1,sourceRecordHash:'fixture-source-record',compatibility:f.deep.compatibility[item.itemId]!,sourceAnswerCommittedAt:item.answerCommittedAt!,sourceGradeCommittedAt:item.gradeCommittedAt!,importedAt:'2026-11-01T02:00:00.000Z',sourceAttempts:item.attempts.map(a=>({...a,performance:{sampleId:`source-sample-${i}`,itemId:item.itemId,conditionKey:'source-only',datasetId:'knowledge',phase:'answer' as const,outcome:'completed' as const,startedAt:a.startedAt,endedAt:a.endedAt!,durationMs:1000}}))}}));
  const manifest:RunManifest={...f.source.manifest,protocols:f.deep.descriptor.refs,generalDefinition:f.deep.descriptor.general,requiredItems:f.deep.items.filter(q=>q.track==='general').map(({id,track,datasetId})=>({id,track,datasetId})),reuseOrigin:origin,execution:{concurrency:4,callTimeoutMs:300000}};
  const {completedAt,...oldSummary}=f.source.summary;const summary:RunSummary={...oldSummary,protocols:manifest.protocols,generalDefinition:f.deep.descriptor.general,tracks:{general:{status:'pending',required:400,graded:120,measures:{}}},metrics:{tracks:{},activeIntervals:[],incompleteTiming:false}};
  return {f,origin,imported,manifest,summary};
}
