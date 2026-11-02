import type {GeneratedAnswer,GradeResult,Question} from '../contracts.ts';
import {extractReadingAnswer} from './reading-answer.ts';
export function gradeReading(question:Question,answer:GeneratedAnswer):GradeResult {
  const missing=(code:string):GradeResult=>({kind:'technical-missing',track:'general',itemId:question.id,error:{code,retryable:false,phase:'grader',message:'资料评分数据无效，可保留回答补判。'},evidence:null});
  const raw=question.grading as {answer?:unknown}|null;
  if(typeof answer.text!=='string')return missing('INVALID_ANSWER_CARRIER');
  if(!raw||typeof raw.answer!=='string'||!['A','B','C','D'].includes(raw.answer))return missing('INVALID_READING_GOLD');
  const result=extractReadingAnswer(answer.text);
  return {kind:'scored',track:'general',itemId:question.id,passed:result.answer===raw.answer,evidence:{metric:'explicit-final-choice-v1',extracted:result.answer??null,reason:result.reason}};
}
