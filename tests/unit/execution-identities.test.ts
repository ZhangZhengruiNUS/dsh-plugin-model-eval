import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExecutionIdentities,REQUIRED_EXECUTION_FILES} from '../../scripts/support/execution-identities.ts';
test('freeze_binds_the_complete_explicit_execution_chain_including_frames_and_legacy_matchers',()=>{
  const actual=Object.fromEntries(REQUIRED_EXECUTION_FILES.map(path=>[path,'a'.repeat(64)]));
  const snapshot={schemaVersion:1,files:REQUIRED_EXECUTION_FILES.map(path=>({path,sha256:actual[path]!}))};
  assert.doesNotThrow(()=>assertExecutionIdentities(snapshot,actual));
  for(const path of ['src/runtime/contest-frames.ts','src/runtime/values.ts','src/evaluation/numeric-answer.ts','tests/fixtures/find-zero-reference.py']){
    assert.ok(REQUIRED_EXECUTION_FILES.includes(path));
    assert.throws(()=>assertExecutionIdentities(snapshot,{...actual,[path]:'b'.repeat(64)}),/EXECUTION_IMPLEMENTATION_CHANGED/);
  }
  assert.throws(()=>assertExecutionIdentities({...snapshot,files:snapshot.files.slice(1)},actual),/EXECUTION_IDENTITY_INCOMPLETE/);
  assert.throws(()=>assertExecutionIdentities({...snapshot,files:[...snapshot.files,snapshot.files[0]!]},actual),/EXECUTION_IDENTITY_INCOMPLETE/);
});
