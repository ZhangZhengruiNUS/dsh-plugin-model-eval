import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,symlink,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withTempRoot} from '../support/temp.ts';
import {assertArtifactDestination,writeArtifact} from '../../scripts/support/adaptation-artifacts.ts';
test('adaptation_outputs_cannot_target_source_resources_archives_or_role_mismatches',async()=>{
  for(const path of ['resources/suites/two-tier-v1/questions.json','.local/tier-candidates/sources/code-contests-test.json','docs/evidence/tiers/coding-quality-gate.json','README.md'])await assert.rejects(assertArtifactDestination(path,'audit'),/OUTPUT_NOT_OWNED/);
  await assert.rejects(assertArtifactDestination('docs/evidence/tiers/coding-adaptation-audit.json','runtime'),/OUTPUT_NOT_OWNED/);
  await assert.rejects(assertArtifactDestination('docs/evidence/tiers/coding-adaptation-runtime.json','runtime',['docs/evidence/tiers/CODING-ADAPTATION-RUNTIME.JSON']),/OUTPUT_COLLISION/);
});
test('adaptation_atomic_outputs_reject_linked_parent_and_preserve_existing_input',async()=>{
  await withTempRoot(async root=>{
    const path=join(root,'runtime.json');await writeArtifact(path,'runtime',{status:'pending'});
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{status:'pending'});
    await assert.rejects(writeArtifact(path,'runtime',{status:'passed'},[path]),/OUTPUT_COLLISION/);
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{status:'pending'});
    const target=join(root,'real');await mkdir(target);await writeFile(join(target,'keep.json'),'original');
    const link=join(root,'linked');await symlink(target,link,'junction');
    await assert.rejects(writeArtifact(join(link,'keep.json'),'runtime',{status:'passed'}),/OUTPUT_LINK_REJECTED/);
    assert.equal(await readFile(join(target,'keep.json'),'utf8'),'original');
  });
});
