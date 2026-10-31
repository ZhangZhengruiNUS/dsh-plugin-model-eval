import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {verifyRuntime} from './integrity.ts';
import {RUNTIME_PINS} from './pins.ts';
import {CONTEST_RUNTIME_SHA256} from './contest-pin.ts';
import type {CodeLimits,CodeOutcome} from './runner.ts';
export interface ContestTest {id:string;cases:readonly {stdin:string;expected:string}[];limits:CodeLimits}
export interface ContestRunner {runContest(test:ContestTest,solution:string,signal:AbortSignal):Promise<CodeOutcome>}
const tokens=(text:string)=>text.trim().split(/\s+/u).filter(Boolean);
const sameOutput=(text:string,expected:string)=>{const a=tokens(text),b=tokens(expected);return a.length===b.length&&a.every((x,i)=>x===b[i]);};
/** Guest output is opaque text. The Host owns every expected answer and comparison. */
export function createContestRunner(runtimeRoot:string,options:{now?:()=>number}={}):ContestRunner {
  const root=resolve(runtimeRoot);
  return {async runContest(test,solution,signal){
    const now=options.now??(()=>performance.now()),start=now(),elapsedMs=()=>Math.round(now()-start),limits=test.limits;
    if(signal.aborted)return {kind:'cancelled',elapsedMs:elapsedMs()};
    if(process.platform!=='win32'||process.arch!=='x64')return {kind:'environment-error',code:'UNSUPPORTED_RUNTIME',elapsedMs:elapsedMs()};
    if(!limits||!Number.isSafeInteger(limits.wallMs)||limits.wallMs<100||limits.wallMs>300000||!Number.isSafeInteger(limits.memoryBytes)||limits.memoryBytes<67108864||limits.memoryBytes>1073741824||!Number.isSafeInteger(limits.computeBudget)||limits.computeBudget<1||!test.cases.length||test.cases.length>3000||solution.length>1024*1024||test.cases.some(c=>typeof c.stdin!=='string'||typeof c.expected!=='string'||Buffer.byteLength(c.stdin)>2*1024*1024||Buffer.byteLength(c.expected)>2*1024*1024)||test.cases.reduce((n,c)=>n+Buffer.byteLength(c.stdin),0)>32*1024*1024)return {kind:'environment-error',code:'INVALID_CONTEST_REQUEST',elapsedMs:elapsedMs()};
    let sandbox:string|undefined;
    const outcome=await (async():Promise<CodeOutcome>=>{try{
      const host=join(root,'code-host'),guest=join(root,'wasi'),driver=join(root,'contest');
      await verifyRuntime(host,'code-host',RUNTIME_PINS['code-host']);await verifyRuntime(guest,'wasi',RUNTIME_PINS.wasi);await verifyRuntime(driver,'contest',CONTEST_RUNTIME_SHA256);
      sandbox=await mkdtemp(join(tmpdir(),'dsh-eval-contest-'));const inputPath=join(sandbox,'input.json');
      await writeFile(inputPath,JSON.stringify({solution,inputs:test.cases.map(c=>c.stdin)}),{flag:'wx'});
      if(signal.aborted)return {kind:'cancelled',elapsedMs:elapsedMs()};
      const remainingMs=limits.wallMs-(now()-start);if(remainingMs<=0)return {kind:'failed',reason:'timeout',elapsedMs:elapsedMs()};
      const result=await new Promise<{code:number|null;output:string;stopped?:'cancelled'|'timeout'|'resource';spawnFailed:boolean}>(done=>{
        const child=spawn(join(host,'python.exe'),['-I','-B','-X','utf8',join(driver,'execute_contest_wasi.py')],{shell:false,windowsHide:true,cwd:host,env:{},stdio:['pipe','pipe','pipe']});
        let output='',bytes=0,stopped:'cancelled'|'timeout'|'resource'|undefined,spawnFailed=false;
        const stop=(why:typeof stopped)=>{stopped??=why;child.kill('SIGKILL');},cancel=()=>stop('cancelled');
        const timer=setTimeout(()=>stop('timeout'),remainingMs);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
        child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>24*1024*1024)stop('resource');else output+=chunk.toString('utf8');});
        child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>{spawnFailed=true;});
        child.on('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);done({code,output,spawnFailed,...(stopped?{stopped}:{})});});
        child.stdin.end(JSON.stringify({runtimeRoot:guest,inputPath,...limits,wallMs:remainingMs}));
      });
      if(result.spawnFailed)return {kind:'environment-error',code:'SPAWN_FAILED',elapsedMs:elapsedMs()};
      if(result.stopped==='cancelled')return {kind:'cancelled',elapsedMs:elapsedMs()};
      if(result.stopped)return {kind:'failed',reason:result.stopped,elapsedMs:elapsedMs()};
      if(result.code!==0)return {kind:'environment-error',code:'HOST_DRIVER_FAILED',elapsedMs:elapsedMs()};
      let frame;try{frame=JSON.parse(result.output);}catch{return {kind:'environment-error',code:'INVALID_HOST_FRAME',elapsedMs:elapsedMs()};}
      if(frame?.environmentError)return {kind:'environment-error',code:'WASI_CONTEST_DRIVER_FAILED',elapsedMs:elapsedMs()};
      if(frame?.failure)return {kind:'failed',reason:['timeout','resource','syntax'].includes(frame.failure)?frame.failure:'assertion',elapsedMs:elapsedMs()};
      if(!Array.isArray(frame?.outputs)||frame.outputs.length!==test.cases.length)return {kind:'environment-error',code:'INVALID_HOST_FRAME',elapsedMs:elapsedMs()};
      for(let i=0;i<test.cases.length;i++){
        const encoded=frame.outputs[i];if(typeof encoded!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return {kind:'environment-error',code:'INVALID_HOST_FRAME',elapsedMs:elapsedMs()};
        if(!sameOutput(Buffer.from(encoded,'base64').toString('utf8'),test.cases[i]!.expected))return {kind:'failed',reason:'assertion',elapsedMs:elapsedMs()};
      }
      return {kind:'passed',elapsedMs:elapsedMs()};
    }catch(error){return {kind:'environment-error',code:(error as NodeJS.ErrnoException).code??(error as Error).message,elapsedMs:elapsedMs()};}})();
    if(sandbox)await rm(sandbox,{recursive:true,force:true});
    if(outcome.kind==='passed'&&now()-start>limits.wallMs)return {kind:'failed',reason:'timeout',elapsedMs:elapsedMs()};
    return {...outcome,elapsedMs:elapsedMs()};
  }};
}
