import type {GradeResult,ProtocolSet,TrackSummary} from '../contracts.ts';
export function summarizeGeneral(results:readonly GradeResult[],required:ProtocolSet):TrackSummary {
  const questions=required.items.filter(x=>x.track==='general'),ids=new Set(questions.map(x=>x.id));
  const grades=new Map<string,Extract<GradeResult,{kind:'scored';track:'general'}>>();
  for(const result of results)if(ids.has(result.itemId)&&result.kind==='scored'&&result.track==='general'){
    if(grades.has(result.itemId))throw new Error('DUPLICATE_GRADE');grades.set(result.itemId,result);
  }
  const measures:TrackSummary['measures']={};
  for(const dataset of ['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus']){
    const rows=questions.filter(x=>x.datasetId===dataset),valid=rows.flatMap(x=>grades.has(x.id)?[grades.get(x.id)!]:[]),passed=valid.filter(x=>x.passed).length;
    measures[dataset]={required:rows.length,graded:valid.length,passed,...(rows.length&&valid.length===rows.length?{score:passed/rows.length*100}:{})};
  }
  const complete=questions.length>0&&grades.size===questions.length&&Object.values(measures).every(x=>x.required>0&&x.score!==undefined);
  return {status:complete?'completed':'pending',required:questions.length,graded:grades.size,measures,
    ...(complete?{score:Object.values(measures).reduce((n,x)=>n+x.score!,0)/4}:{})};
}
