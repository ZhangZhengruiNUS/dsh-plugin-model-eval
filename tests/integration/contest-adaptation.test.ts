import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {withTempRoot} from '../support/temp.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('adaptation_audit_preserves_frozen_resources_and_blocks_incomplete_release',async()=>{
  await withTempRoot(async root=>{
    const protectedPaths=['resources/suites/two-tier-v1/questions.json','resources/protocol-registry.json','docs/evidence/tiers/coding-quality-gate.json','.local/tier-candidates/sources/code-contests-test.json'];
    const before=await Promise.all(protectedPaths.map(async path=>sha(await readFile(path))));
    const result=spawnSync(process.execPath,[resolve('scripts/audit-contest-adaptation.mjs'),'--report',join(root,'audit.json'),'--out',join(root,'adapted.json')],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,2,result.stderr+'\n'+result.stdout);
    const report=JSON.parse(await readFile(join(root,'audit.json'),'utf8'));
    assert.equal(report.releaseAllowed,false);assert.equal(report.counts.selected,100);
    assert.equal(report.counts.missingReferences,35);assert.equal(report.counts.inputPending+report.counts.inputAudited,100);
    const sort=report.items.find((i:any)=>i.sourceId==='0');
    assert.ok(sort.excluded.some((x:any)=>x.sourceIndex===166&&x.origin==='generated'));
    const coverage=report.items.find((i:any)=>i.sourceId==='19');
    assert.equal(coverage.added[0].subcases,413);assert.equal(coverage.added[0].caseHash.length,64);
    const candidate=JSON.parse(await readFile(join(root,'adapted.json'),'utf8'));
    assert.equal(candidate.questions.length,100);assert.equal(candidate.releaseAllowed,false);
    assert.equal(candidate.questions.find((q:any)=>q.sourceId==='19').grading.cases.length,coverage.originalCount-coverage.excluded.length+1);
    const after=await Promise.all(protectedPaths.map(async path=>sha(await readFile(path))));assert.deepEqual(after,before);
  });
});
