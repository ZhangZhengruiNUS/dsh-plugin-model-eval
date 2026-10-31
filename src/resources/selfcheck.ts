import {join} from 'node:path';import {createCodeRunner} from '../runtime/runner.ts';import {createRuleGrader} from '../runtime/rule-grader.ts';
/** Fixed environment fixtures, never user/model code or benchmark scores. */
export async function selfcheckEnvironment(resourcesPath:string):Promise<void>{
  const code=await createCodeRunner(join(resourcesPath,'runtime')).runCode({id:'environment-selfcheck-v1',entryPoint:'f',cases:[{args:[],expected:{t:'int',v:'42'}}]},'def f(): return 42',{wallMs:10000,memoryBytes:268435456,computeBudget:8000000000},new AbortController().signal);
  const rule=await createRuleGrader(join(resourcesPath,'runtime','rules')).gradeRules({itemId:'environment-selfcheck-v1',key:0,prompt:'alpha',instruction_id_list:['keywords:existence'],kwargs:[{keywords:['alpha']}],answer:'alpha 你好'});
  if(code.kind!=='passed'||rule.kind!=='scored'||rule.track!=='general'||!rule.passed)throw Object.assign(new Error('ENVIRONMENT_SELFCHECK_FAILED'),{code:'ENVIRONMENT_SELFCHECK_FAILED'});
}
