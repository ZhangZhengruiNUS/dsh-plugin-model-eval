/** Client-safe validation of timing inherited from an identical, completed task set. */
import type {GeneralDefinition,PhaseMetrics,RegradeOrigin,RunSummary} from '../contracts.ts';
import type {OfflineSource} from './offline-regrade.ts';
type TaskTiming=NonNullable<PhaseMetrics['taskTiming']>;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function validatedTiming(value:TaskTiming|undefined,definition:GeneralDefinition):TaskTiming|undefined{
  const count=definition.domains.reduce((n,d)=>n+d.itemIds.length,0),domains=value?.domains;
  if(!value||value.schema!=='task-duration-v1'||value.complete!==true||![62,348].includes(count)||value.required!==count||value.measured!==count||!finite(value.meanMs)||
    !Array.isArray(domains)||domains.length!==definition.domains.length||new Set(domains.map(d=>d.id)).size!==domains.length)return;
  let mean=0;
  for(const expected of definition.domains){const domain=domains.find(d=>d.id===expected.id);
    if(!domain||domain.weight!==expected.weight||domain.required!==expected.itemIds.length||domain.measured!==domain.required||!finite(domain.meanMs))return;
    mean+=domain.meanMs*expected.weight;
  }
  if(Math.abs(value.meanMs-mean)>Math.max(1e-6,mean*1e-10))return;
  return structuredClone(value);
}

export function sourceTaskTiming(source:OfflineSource,next:GeneralDefinition):RegradeOrigin['sourceTaskTiming']{
  const old=source.manifest.generalDefinition;
  if(next.schema!=='task-five-v3-r2'||source.manifest.protocols.resourceVersion!=='task-five-v3-r1'||old?.schema!=='task-five-v3-r1'||old.tier!==next.tier||
    source.manifest.regradeOrigin||source.manifest.reuseOrigin?.mixedPeriod||JSON.stringify(old.domains)!==JSON.stringify(next.domains)||
    !/^[a-f0-9]{64}$/.test(source.sourceEvidenceHash))return;
  const timing=validatedTiming(source.sourceMetrics?.tracks.general?.answer.taskTiming,next);
  if(!timing)return;
  return{schema:'same-task-timing-v1',sourceRunId:source.manifest.runId,sourceEvidenceHash:source.sourceEvidenceHash,timing};
}

export function linkedRegradeTaskTiming(run:RunSummary):TaskTiming|undefined{
  const origin=run.regradeOrigin,link=origin?.sourceTaskTiming,definition=run.generalDefinition;
  if(!definition||definition.schema!=='task-five-v3-r2'||run.protocols.resourceVersion!=='task-five-v3-r2'||
    run.protocols.generalId!=='general-task-five-v3-r2-'+definition.tier||!origin?.scoringCorrection||
    origin.sourceProtocols.resourceVersion!=='task-five-v3-r1'||origin.sourceProtocols.generalId!=='general-task-five-v3-r1-'+definition.tier||
    origin.sourceProtocols.writingId!==run.protocols.writingId||!link||link.schema!=='same-task-timing-v1'||
    link.sourceRunId!==origin.sourceRunId||link.sourceEvidenceHash!==origin.sourceEvidenceHash||!/^[a-f0-9]{64}$/.test(link.sourceEvidenceHash)||run.reuse?.mixedPeriod)return;
  return validatedTiming(link.timing,definition);
}
