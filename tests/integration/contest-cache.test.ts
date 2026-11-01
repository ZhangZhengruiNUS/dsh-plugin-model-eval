import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withTempRoot} from '../support/temp.ts';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
const limits={wallMs:10000,memoryBytes:536870912,computeBudget:200000000000};
test('contest_loads_checked_stdlib_cache_in_each_fresh_readonly_guest',{timeout:30000},async()=>{
  const code=`import importlib._bootstrap_external as b
loaded=[]
compiled=[]
original=b._compile_bytecode
original_source=b.SourceLoader.source_to_code
def cached(*a,**kw):
 loaded.append(kw.get('name'))
 return original(*a,**kw)
def source(self,*a,**kw):
 compiled.append(a[1] if len(a)>1 else None)
 return original_source(self,*a,**kw)
b._compile_bytecode=cached
b.SourceLoader.source_to_code=source
import collections, builtins
assert 'collections' in loaded and not compiled
assert collections.__cached__.startswith('/bytecode/')
try:
 open(collections.__cached__,'wb').write(b'bad')
 raise AssertionError('cache writable')
except OSError: pass
assert not hasattr(builtins,'previous_case')
builtins.previous_case=True
print(3)`;
  const result=await createContestRunner(resolve('resources/runtime')).runContest({id:'cache-hit',cases:[{stdin:'',expected:'3'},{stdin:'',expected:'3'}],limits},code,new AbortController().signal);
  assert.equal(result.kind,'passed',JSON.stringify(result));
});
test('missing_and_tampered_cache_fail_before_any_guest_program',{timeout:30000},async()=>{
  await withTempRoot(async root=>{
    const runner=createContestRunner(root),q={id:'cache-integrity',cases:[{stdin:'',expected:'3'}],limits};
    const missing=await runner.runContest(q,'while True:pass',new AbortController().signal);
    assert.equal(missing.kind,'environment-error');if(missing.kind==='environment-error')assert.match(missing.code,/CONTEST_CACHE_/);
    await cp('resources/runtime/contest-cache',join(root,'contest-cache'),{recursive:true});
    const path=join(root,'contest-cache/python/lib/python3.13/collections/__init__.cpython-313.pyc');
    const original=await readFile(path);await writeFile(path,Buffer.concat([original,Buffer.from('tampered')]));
    const changed=await runner.runContest(q,'while True:pass',new AbortController().signal);
    assert.equal(changed.kind,'environment-error');if(changed.kind==='environment-error')assert.equal(changed.code,'CONTEST_CACHE_RUNTIME_HASH_MISMATCH');
  });
});
