import type {GeneratedAnswer,GradeResult,Question} from '../contracts.ts';
import {extractReadingAnswer} from './reading-answer.ts';
import {extractReadingChoiceV2} from './reading-choice-v2.ts';
import {extractReadingChoiceV3,validReadingOptions} from './reading-choice-v3.ts';
export function gradeReading(question:Question,answer:GeneratedAnswer):GradeResult {
  const missing=(code:string):GradeResult=>({kind:'technical-missing',track:'general',itemId:question.id,error:{code,retryable:false,phase:'grader',message:'资料评分数据无效，可保留回答补判。'},evidence:null});
  const raw=question.grading as {answer?:unknown;extractor?:unknown;optionTexts?:unknown}|null;
  if(typeof answer.text!=='string')return missing('INVALID_ANSWER_CARRIER');
  if(!raw||typeof raw.answer!=='string'||!['A','B','C','D'].includes(raw.answer))return missing('INVALID_READING_GOLD');
  if(raw.extractor==='reading-choice-content-v3'){
    if(!answer.complete)return missing('ANSWER_INCOMPLETE');
    if(!validReadingOptions(raw.optionTexts))return missing('INVALID_READING_OPTIONS');
    const result=extractReadingChoiceV3(answer.text,raw.optionTexts);
    return {kind:'scored',track:'general',itemId:question.id,passed:result.answer===raw.answer,evidence:{metric:raw.extractor,extracted:result.answer??null,reason:result.reason,formatConforming:result.formatConforming}};
  }
  if(raw.extractor==='reading-choice-content-v2'){
    const result=extractReadingChoiceV2(answer.text);
    return {kind:'scored',track:'general',itemId:question.id,passed:result.answer===raw.answer,evidence:{metric:raw.extractor,extracted:result.answer??null,reason:result.reason,formatConforming:result.formatConforming}};
  }
  if(raw.extractor!==undefined)return missing('UNKNOWN_READING_EXTRACTOR');
  const result=extractReadingAnswer(answer.text);
  return {kind:'scored',track:'general',itemId:question.id,passed:result.answer===raw.answer,evidence:{metric:'explicit-final-choice-v1',extracted:result.answer??null,reason:result.reason}};
}
