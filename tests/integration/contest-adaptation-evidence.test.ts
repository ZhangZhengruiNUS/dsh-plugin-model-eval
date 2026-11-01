import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {withTempRoot} from '../support/temp.ts';
test('runtime_audit_rejects_changed_staging_before_any_reference_execution',async()=>{
  await withTempRoot(async root=>{
    const report=join(root,'input-audit.json'),out=join(root,'adapted.json');
    const stage=spawnSync(process.execPath,[resolve('scripts/audit-contest-adaptation.mjs'),'--report',report,'--out',out],{encoding:'utf8',windowsHide:true});assert.equal(stage.status,2,stage.stderr);
    const candidate=JSON.parse(await readFile(out,'utf8'));candidate.questions[0].grading.cases[0].expected='tampered';await writeFile(out,JSON.stringify(candidate));
    const check=spawnSync(process.execPath,[resolve('scripts/verify-contest-adaptation.mjs'),'--audit',report,'--staging',out,'--report',join(root,'runtime.json')],{encoding:'utf8',windowsHide:true});
    assert.equal(check.status,1,check.stdout);assert.match(check.stderr,/ADAPTATION_STAGING_MISMATCH/);
  });
});
test('runtime_audit_rejects_forged_input_status_even_outside_requested_subset',async()=>{
  await withTempRoot(async root=>{
    const report=join(root,'input-audit.json'),out=join(root,'adapted.json');
    const stage=spawnSync(process.execPath,[resolve('scripts/audit-contest-adaptation.mjs'),'--report',report,'--out',out],{encoding:'utf8',windowsHide:true});assert.equal(stage.status,2,stage.stderr);
    const audit=JSON.parse(await readFile(report,'utf8'));audit.items.find((i:any)=>i.sourceId==='100').status='audited';await writeFile(report,JSON.stringify(audit));
    const check=spawnSync(process.execPath,[resolve('scripts/verify-contest-adaptation.mjs'),'--audit',report,'--staging',out,'--report',join(root,'runtime.json'),'--ids','91'],{encoding:'utf8',windowsHide:true});
    assert.equal(check.status,1,check.stdout);assert.match(check.stderr,/ADAPTATION_AUDIT_MISMATCH/);
  });
});
test('runtime_report_cannot_overwrite_its_input_audit',async()=>{
  await withTempRoot(async root=>{
    const report=join(root,'input-audit.json'),out=join(root,'adapted.json');
    const stage=spawnSync(process.execPath,[resolve('scripts/audit-contest-adaptation.mjs'),'--report',report,'--out',out],{encoding:'utf8',windowsHide:true});assert.equal(stage.status,2,stage.stderr);
    const before=await readFile(report,'utf8');
    const check=spawnSync(process.execPath,[resolve('scripts/verify-contest-adaptation.mjs'),'--audit',report,'--staging',out,'--report',report,'--ids','91'],{encoding:'utf8',windowsHide:true});
    assert.equal(check.status,1,check.stdout);assert.match(check.stderr,/OUTPUT_(COLLISION|NOT_OWNED)/);
    assert.equal(await readFile(report,'utf8'),before);
  });
});
test('independent_reference_is_identified_and_a_known_logic_error_is_rejected',{timeout:45000},async()=>{
  await withTempRoot(async root=>{
    const report=join(root,'input-audit.json'),out=join(root,'adapted.json'),runtime=join(root,'runtime.json');
    const stage=spawnSync(process.execPath,[resolve('scripts/audit-contest-adaptation.mjs'),'--report',report,'--out',out],{encoding:'utf8',windowsHide:true});assert.equal(stage.status,2,stage.stderr);
    const check=spawnSync(process.execPath,[resolve('scripts/verify-contest-adaptation.mjs'),'--audit',report,'--staging',out,'--report',runtime,'--ids','91'],{encoding:'utf8',windowsHide:true});assert.equal(check.status,2,check.stderr);
    const evidence=JSON.parse(await readFile(runtime,'utf8'));assert.equal(evidence.releaseAllowed,false);
    const item=evidence.items[0];assert.equal(item.status,'passed');
    assert.ok(item.positives.some((p:any)=>p.origin==='independent-reference'&&p.outcome.kind==='passed'));
    assert.ok(item.negatives.some((p:any)=>p.outcome.kind==='failed'&&p.outcome.reason==='assertion'));
  });
});
