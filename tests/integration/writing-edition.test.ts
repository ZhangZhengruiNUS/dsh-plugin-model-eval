import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createProtocolRegistry} from '../../src/evaluation/registry.ts';
import {CURRENT_WRITING_ID,LEGACY_WRITING_ID,writingV2Edition} from '../../src/evaluation/writing-edition.ts';
import {builtInReferences} from '../../src/client/comparison/reference-data.ts';
import {buildComparison,currentComparisonGroups} from '../../src/client/comparison/model.ts';
import {selectProbeQuestions} from '../../src/speed/probe-set.ts';
import {buildWorkloadPlan} from '../../src/estimation/workload.ts';

const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const removedId='writing/ziya:13';
const replacementId='writing/dsh-original:community-fund-report-01';

test('new writing uses the replacement while v2 and legacy fallback retain the former topic',async()=>{
  const registry=await createProtocolRegistry(packageRoot);
  const generalId='general-task-five-original-v1-light';
  const current=await registry.forNewRun(generalId,['writing']);
  assert.equal(current.writingId,CURRENT_WRITING_ID);
  const old=await registry.resolveForRead!({...current.descriptor.refs,writingId:writingV2Edition.id});
  const legacy=await registry.resolveForRead!({...current.descriptor.refs,writingId:LEGACY_WRITING_ID});
  const before=old.items.filter(question=>question.track==='writing');
  const after=current.items.filter(question=>question.track==='writing');
  assert.equal(before.length,12);
  assert.equal(after.length,12);
  assert(before.some(question=>question.id===removedId));
  assert(!after.some(question=>question.id===removedId));
  assert(after.some(question=>question.id===replacementId));
  assert.deepEqual(after.filter(question=>question.id!==replacementId),before.filter(question=>question.id!==removedId));
  for(const question of after.filter(question=>question.id!==replacementId)){
    assert.deepEqual(current.compatibility[question.id],old.compatibility[question.id]);
  }
  assert.deepEqual(legacy.items.filter(question=>question.track==='writing'),before.filter(question=>question.sourceId.startsWith('ziya:')));
  assert.notEqual(buildWorkloadPlan(current,['writing']).workloadHash,buildWorkloadPlan(old,['writing']).workloadHash);
});

test('the legacy timing probe selects the replacement only on the new writing edition',async()=>{
  const registry=await createProtocolRegistry(packageRoot);
  const id='general-chat-root-stable-rule-tokenizer-v3';
  const current=await registry.forNewRun(id,['writing']);
  const archived=await registry.resolveForRead!({...current.descriptor.refs,writingId:writingV2Edition.id});
  assert.deepEqual(selectProbeQuestions(current,['writing']).map(question=>question.id),[replacementId,'writing/ziya:94']);
  assert.deepEqual(selectProbeQuestions(archived,['writing']).map(question=>question.id),[removedId,'writing/ziya:94']);
});

test('comparison shows each built-in writing reference only in its own edition',()=>{
  const metadata={rootId:'synthetic',rootEpoch:1,summaries:[],runs:[]};
  const groups=buildComparison(metadata,'writing',builtInReferences);
  assert.equal(groups.length,2);
  for(const [version,writingId,itemId] of [
    ['1.0',writingV2Edition.id,removedId],
    ['1.1',CURRENT_WRITING_ID,replacementId],
  ] as const){
    const group=groups.find(entry=>entry.label===version);
    assert.equal(group?.rows.length,1);
    const row=group!.rows[0]!;
    assert.equal(row.source.protocols.writingId,writingId);
    assert.equal(row.reference,'ChatGPT 订阅');
    assert(row.source.judges[0]?.itemIds.includes(itemId));
    assert.equal(row.taskTiming?.measured,12);
  }
  assert.deepEqual(currentComparisonGroups([],CURRENT_WRITING_ID,'writing').map(group=>[group.label,group.rows.length]),[['1.1',0]]);
});
