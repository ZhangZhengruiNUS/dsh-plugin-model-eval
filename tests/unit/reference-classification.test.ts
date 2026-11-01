import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyUpstreamReferences} from '../../scripts/support/reference-classification.ts';
test('reference_role_correction_is_bound_to_language_source_and_exact_program',async()=>{
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const negatives=JSON.parse(await readFile('.local/tier-candidates/artifacts/negative-references.json','utf8'));
  const programs=negatives.find((x:any)=>x.index===77).incorrectPython3,source=rows[77];
  const result=classifyUpstreamReferences(source,programs);
  assert.equal(result.corrected.length,1);assert.equal(result.corrected[0]!.originalClassification,'incorrect');assert.equal(result.corrected[0]!.effectiveRole,'positive');assert.equal(result.corrected[0]!.language,'PYTHON3');
  assert.equal(result.negativePrograms.length,2);assert.ok(result.positivePrograms.some(x=>x.required===true&&x.origin==='reviewed-upstream-role-correction'));
  for(const codes of [[programs[0]+'\n',...programs.slice(1)],programs.slice(1)])assert.throws(()=>classifyUpstreamReferences(source,codes),/REFERENCE_CORRECTION_MISMATCH/);
  assert.throws(()=>classifyUpstreamReferences({...source,sourceRecordHash:'f'.repeat(64)},programs),/REFERENCE_CORRECTION_MISMATCH/);
  const unchanged=classifyUpstreamReferences(rows[11],negatives.find((x:any)=>x.index===11).incorrectPython3);assert.equal(unchanged.corrected.length,0);assert.equal(unchanged.negativePrograms.length,3);
});
