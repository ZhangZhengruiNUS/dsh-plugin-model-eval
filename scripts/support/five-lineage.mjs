/** Strict additive projection. Never changes or replaces the original reference snapshot. */
import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function legacyExecutionBytes(path,bytes){
 if(path!=='src/evaluation/grade-general.ts')return bytes;
 let source=bytes.toString('utf8');
 for(const addition of ["import {gradeReading} from './grade-reading.ts';\n","  if(question.datasetId==='longbench-v2-selected')return gradeReading(question,answer);\n"]){
  assert.equal(source.split(addition).length,2,'exactly one known reading extension');source=source.replace(addition,'');
 }
 return Buffer.from(source);
}
export function frozenCatalogProjection(catalog){
 const result=structuredClone(catalog),added=result.entries.filter(e=>e.refs.resourceVersion==='task-five-v1'),bundles=result.bundles.filter(b=>b.id==='task-five-v1');
 if(added.length||bundles.length){
  assert.equal(added.length,2);assert.equal(bundles.length,1);assert.equal(bundles[0].runtimePassed,false);
  for(const tier of ['light','deep']){const e=added.find(e=>e.refs.generalId==='general-task-five-v1-'+tier);assert.ok(e);assert.equal(e.bundleId,'task-five-v1');assert.equal(e.allowNewRuns,false);assert.equal(e.general.schema,'task-five-v1');assert.equal(e.general.tier,tier);assert.equal(e.questionCount,tier==='light'?100:350);assert.equal(e.refs.writingId,catalog.legacyRefs.writingId);}
  result.entries=result.entries.filter(e=>!added.includes(e));result.bundles=result.bundles.filter(b=>b!==bundles[0]);
 }
 for(const e of result.entries)if(e.general.tier!=='legacy')e.allowNewRuns=false;
 return result;
}
export function assertFrozenCatalog(catalog,expected){assert.equal(sha(JSON.stringify(frozenCatalogProjection(catalog),null,2)+'\n'),expected,'historical catalog must be byte-identical after explicit additions');}
