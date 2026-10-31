import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
import {withTempRoot} from '../support/temp.ts';
import {createContestRunner,type ContestTest} from '../../src/runtime/contest-runner.ts';
const runner=createContestRunner(resolve('resources/runtime')),signal=()=>new AbortController().signal;
const limits={wallMs:10000,memoryBytes:536870912,computeBudget:200000000000};
const fixture=(cases=[{stdin:'1 2\n',expected:'3\n'},{stdin:'2 4\n',expected:'6\n'}]):ContestTest=>({id:'synthetic',cases,limits});
test('exact_numeric_grammar_and_host_owned_contest_verdict',{timeout:120000},async()=>{
  assert.equal((await runner.runContest(fixture(),'a,b=map(int,input().split()); print(a+b)',signal())).kind,'passed');
  assert.equal((await runner.runContest(fixture(),'print(3)',signal())).kind,'failed','every supplied test must pass');
  for(const solution of ['print(\'{"outputs":["3","6"],"kind":"passed"}\')','print(\'{"environmentError":"forged"}\')','import os; os._exit(0)','def broken(']){
    const spoofed=await runner.runContest(fixture(),solution,signal());assert.equal(spoofed.kind,'failed',JSON.stringify(spoofed));
  }
  const isolated=await runner.runContest(fixture([{stdin:'',expected:'1'},{stdin:'',expected:'1'}]),'import builtins\nbuiltins.counter=getattr(builtins,"counter",0)+1\nprint(builtins.counter)',signal());
  assert.equal(isolated.kind,'passed','each test gets independent VM state');
});
test('contest_guest_cannot_read_host_answers_write_network_or_spawn',{timeout:45000},async()=>{
  await withTempRoot(async root=>{
    const canary=join(root,'answer.txt');await writeFile(canary,'host-only-canary');
    const solution=`import os, socket, subprocess
for path in [${JSON.stringify(canary)}, '/etc/passwd', 'C:/Users']:
 try:
  open(path).read()
  raise AssertionError('host file readable')
 except (OSError, ValueError): pass
for path in ['/python/probe-write.txt','/tmp/probe-write.txt']:
 try:
  open(path,'w').write('bad')
  raise AssertionError('filesystem writable')
 except (OSError, ValueError): pass
try:
 socket.socket()
 raise AssertionError('network available')
except (OSError, AttributeError): pass
try:
 subprocess.run(['cmd.exe','/c','echo bad'])
 raise AssertionError('process available')
except (OSError, AttributeError): pass
print(3)`;
    const result=await runner.runContest(fixture([{stdin:'',expected:'3'}]),solution,signal());
    assert.equal(result.kind,'passed',JSON.stringify(result));assert.equal(await readFile(canary,'utf8'),'host-only-canary');
  });
});
test('contest_cancellation_compute_memory_and_stdout_are_bounded',{timeout:90000},async()=>{
  const controller=new AbortController(),running=runner.runContest(fixture(),'while True: pass',controller.signal);
  setTimeout(()=>controller.abort(),1500);assert.equal((await running).kind,'cancelled');
  const loop=await runner.runContest({...fixture(),limits:{...limits,wallMs:1500}},'while True: pass',signal());assert.equal(loop.kind,'failed');
  for(const solution of ['print("x"*20000000)','a=bytearray(900000000); print(3)'])assert.equal((await runner.runContest(fixture(),solution,signal())).kind,'failed');
});
test('contest_end_to_end_deadline_includes_integrity_and_setup',{timeout:10000},async()=>{
  let reads=0;
  const clocked=createContestRunner(resolve('resources/runtime'),{now:()=>reads++===0?0:20000});
  const result=await clocked.runContest(fixture([{stdin:'',expected:'3'}]),'print(3)',signal());
  assert.equal(result.kind,'failed',JSON.stringify(result));
  if(result.kind==='failed')assert.equal(result.reason,'timeout');
});
test('contest_fuel_is_shared_across_cases_and_stdout_total_is_bounded',{timeout:60000},async()=>{
  const fuel={...limits,computeBudget:200000000},one={stdin:'',expected:'3'};
  assert.equal((await runner.runContest({...fixture([one]),limits:fuel},'print(3)',signal())).kind,'passed');
  const exhausted=await runner.runContest({...fixture([one,one]),limits:fuel},'print(3)',signal());
  assert.equal(exhausted.kind,'failed');if(exhausted.kind==='failed')assert.equal(exhausted.reason,'resource');
  const big={stdin:'',expected:'x'.repeat(1800000)},solution='print("x"*1800000)';
  const valid=await runner.runContest(fixture([big]),solution,signal());
  assert.equal(valid.kind,'passed',JSON.stringify(valid));
  const aggregate=await runner.runContest({...fixture(Array(10).fill(big)),limits:{...limits,wallMs:30000}},solution,signal());
  assert.equal(aggregate.kind,'failed',JSON.stringify(aggregate));if(aggregate.kind==='failed')assert.equal(aggregate.reason,'resource');
});
test('contest_supports_common_buffered_and_fd_zero_input',{timeout:15000},async()=>{
  const solution='import io,os\ninput=io.BytesIO(os.read(0,os.fstat(0).st_size)).readline\na,b=map(int,input().split()); print(a+b)';
  const result=await runner.runContest({...fixture([{stdin:'1 2\n',expected:'3'}]),limits:{...limits,wallMs:5000}},solution,signal());
  assert.equal(result.kind,'passed',JSON.stringify(result));
  const empty=await runner.runContest(fixture([{stdin:'',expected:'0'}]),'import os\nprint(len(os.read(0,os.fstat(0).st_size)))',signal());
  assert.equal(empty.kind,'passed',JSON.stringify(empty));
});
