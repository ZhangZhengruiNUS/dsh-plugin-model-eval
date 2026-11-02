import type {GradeResult,TrackSummary} from '../contracts.ts';
import type {GeneralDefinition} from './tier-contracts.ts';
import {ABILITY_DATASETS,validateGeneralDefinition} from './definitions.ts';
export function summarizeGeneral(results:readonly GradeResult[],definition:GeneralDefinition):TrackSummary {
  validateGeneralDefinition(definition);
  const requiredIds=definition.domains.flatMap(d=>d.itemIds),ids=new Set(requiredIds);
  const grades=new Map<string,Extract<GradeResult,{kind:'scored';track:'general'}>>();
  for(const result of results)if(ids.has(result.itemId)&&result.kind==='scored'&&result.track==='general'){
    if(grades.has(result.itemId))throw new Error('DUPLICATE_GRADE');grades.set(result.itemId,result);
  }
  const measures:TrackSummary['measures']={};
  for(const domain of definition.domains){
    const rows=domain.itemIds,valid=rows.flatMap(id=>grades.has(id)?[grades.get(id)!]:[]),passed=valid.filter(x=>x.passed).length;
    const key=definition.tier==='legacy'?ABILITY_DATASETS[domain.id]!:domain.id;
    measures[key]={required:rows.length,graded:valid.length,passed,...(rows.length&&valid.length===rows.length?{score:passed/rows.length*100}:{})};
  }
  const complete=requiredIds.length>0&&grades.size===requiredIds.length&&Object.values(measures).every(x=>x.required>0&&x.score!==undefined);
  return {status:complete?'completed':'pending',required:requiredIds.length,graded:grades.size,measures,
    ...(complete?{score:definition.schema==='task-five-v1'?definition.domains.reduce((n,d)=>n+measures[d.id]!.score!*d.weight,0):Object.values(measures).reduce((n,x)=>n+x.score!,0)/4}:{})};
}
