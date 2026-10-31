import type {GeneratedAnswer,GradeResult,PromptMessage,Question} from '../contracts.ts';
import type {CodeRunner,CodeTest} from '../runtime/runner.ts';
import type {RuleGrader,RuleGradeInput} from '../runtime/rule-grader.ts';
export interface PreparedEnvironment {code:CodeRunner;rules:RuleGrader;signal:AbortSignal}
export function buildPrompt(question:Question):readonly PromptMessage[] {
  const suffix:Record<string,string>={
    'tiny-mmlu':'Give your final answer as a single option letter on the last line, in the form Final answer: A.',
    'tiny-gsm8k':'Put the final numeric answer on the last line in the form #### number.',
    'humaneval-plus':'Return one complete implementation, including the requested function. Use a single code block. Do not include tests.'};
  const messages=structuredClone(question.prompt) as PromptMessage[];
  if(suffix[question.datasetId])messages[messages.length-1]!.content+='\n\n'+suffix[question.datasetId];return messages;
}
export function extractFinalLetter(text:string):string|undefined {
  const last=text.trim().split(/\r?\n/).at(-1)??'';
  return /^(?:Final answer:\s*|Answer:\s*)?([A-J])[.]?$/i.exec(last)?.[1]?.toUpperCase();
}
function rational(text:string):[bigint,bigint]|undefined {
  if(text.length>500)return undefined;
  text=text.trim();if(!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d{1,3})?(?:\/-?\d+)?$/i.test(text))return undefined;
  const [left,right]=text.replaceAll(',','').split('/');
  const [base,exp='0']=left!.toLowerCase().split('e');const decimal=base!.split('.')[1]?.length??0;
  const power=Number(exp)-decimal;if(Math.abs(power)>1000)return undefined;
  const numerator=BigInt(base!.replace('.','')),denominator=right?BigInt(right):1n;if(!denominator)return undefined;
  return power>=0?[numerator*10n**BigInt(power),denominator]:[numerator,denominator*10n**BigInt(-power)];
}
export function numericEquivalent(text:string,expected:string):boolean {
  const last=text.trim().split(/\r?\n/).at(-1)??'',match=/^####\s*(.+?)\s*$/.exec(last);if(!match)return false;
  const actual=rational(match[1]!),want=rational(expected);return !!actual&&!!want&&actual[0]*want[1]===want[0]*actual[1];
}
export function extractCode(text:string):string|undefined {
  const blocks=[...text.matchAll(/```(?:python|py)?[ \t]*\r?\n([\s\S]*?)```/g)];
  if(blocks.length===1&&text.split('```').length===3)return blocks[0]![1]!.trim();
  if(!text.includes('```')&&/^\s*(?:from |import |def |#|@)/.test(text))return text.trim();return undefined;
}
export async function gradeGeneral(question:Question,answer:GeneratedAnswer,env:PreparedEnvironment):Promise<GradeResult> {
  const missing=(code:string):GradeResult=>({kind:'technical-missing',track:'general',itemId:question.id,error:{code,retryable:false,phase:'grader',message:'未完成本题评分，可复用已保存回答补判。'},evidence:null});
  const scored=(passed:boolean,evidence:GradeResult['evidence']=null):GradeResult=>({kind:'scored',track:'general',itemId:question.id,passed,evidence});
  if(!answer.complete)return missing('ANSWER_INCOMPLETE');
  const raw=question.grading as Record<string,any>;
  if(question.datasetId==='tiny-mmlu'){
    const want=raw.output??raw.answer??raw.target;const letter=typeof want==='number'?String.fromCharCode(65+want):String(want).trim();
    return scored(extractFinalLetter(answer.text)===letter,{metric:'accuracy',extracted:extractFinalLetter(answer.text)??null});
  }
  if(question.datasetId==='tiny-gsm8k'){
    const want=String(raw.output??raw.answer??raw.target);const expected=want.includes('####')?want.split('####').at(-1)!.trim():want.trim();
    return scored(numericEquivalent(answer.text,expected),{metric:'numeric-exact'});
  }
  if(question.datasetId==='ifeval')return env.rules.gradeRules({...raw,itemId:question.id,answer:answer.text} as RuleGradeInput);
  if(question.datasetId==='humaneval-plus'){
    const code=extractCode(answer.text);if(code===undefined)return scored(false,{reason:'no-single-candidate'});
    const outcome=await env.code.runCode(raw as unknown as CodeTest,code,{wallMs:30000,memoryBytes:536870912,computeBudget:200000000000},env.signal);
    if(outcome.kind==='environment-error'||outcome.kind==='cancelled')return missing(outcome.kind==='cancelled'?'CANCELLED':outcome.code);
    return scored(outcome.kind==='passed',{metric:'all-base-and-plus',outcome:outcome.kind,...(outcome.kind==='failed'?{reason:outcome.reason}:{})});
  }
  return missing('UNKNOWN_DATASET');
}
