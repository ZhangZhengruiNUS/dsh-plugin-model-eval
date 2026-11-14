import {join} from 'node:path';import {createCodeRunner} from '../runtime/runner.ts';import {createRuleGrader} from '../runtime/rule-grader.ts';
import type {CodeOutcome} from '../runtime/runner.ts';

/** Keep only a stable phase and bounded diagnostic code; no child output or paths. */
export function selfcheckFailure(stage:'code'|'rule'|'contest',outcome:CodeOutcome|string):never{
  const value=typeof outcome==='string'?outcome:outcome.kind==='environment-error'?outcome.code:outcome.kind==='failed'?outcome.reason:outcome.kind;
  const reason=/^[a-z][a-z0-9_]{0,39}$/i.test(value)?value.toUpperCase():'UNKNOWN';
  const code=`ENVIRONMENT_SELFCHECK_${stage.toUpperCase()}_${reason}`;
  throw Object.assign(new Error(code),{code});
}
/** Fixed environment fixtures, never user/model code or benchmark scores. */
export async function selfcheckEnvironment(resourcesPath:string):Promise<void>{
  const code=await createCodeRunner(join(resourcesPath,'runtime')).runCode({id:'environment-selfcheck-v1',entryPoint:'f',cases:[{args:[],expected:{t:'int',v:'42'}}]},'def f(): return 42',{wallMs:10000,memoryBytes:268435456,computeBudget:8000000000},new AbortController().signal);
  if(code.kind!=='passed')selfcheckFailure('code',code);
  const rule=await createRuleGrader(join(resourcesPath,'runtime','rules')).gradeRules({itemId:'environment-selfcheck-v1',key:0,prompt:'alpha',instruction_id_list:['keywords:existence'],kwargs:[{keywords:['alpha']}],answer:'alpha 你好'});
  if(rule.kind!=='scored')selfcheckFailure('rule',rule.error.code);
  if(rule.track!=='general'||!rule.passed)selfcheckFailure('rule','assertion');
}
