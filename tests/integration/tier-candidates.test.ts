import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'tier-admission-'));
  await mkdir(join(root,'sources'));
  const sources:any[]=[];
  for(const domain of ['knowledge','math','instructions','coding']){
    const records=Array.from({length:104},(_,i)=>({id:`${domain}-${i}`,question:`Solve ${domain} question ${i}.`,
      category:`category-${i%4}`,answer:domain==='knowledge'?'B':'42',
      options:domain==='knowledge'?['Wrong 1','Correct','Wrong 2','Wrong 3']:undefined,
      constraints:domain==='instructions'?['keywords:existence','punctuation:no_comma']:undefined,
      cases:domain==='coding'?[{stdin:`${i}\n`,expected:'42\n'}]:undefined,
      review:{status:'eligible',reason:'synthetic fixture',uniqueOutput:true,textOnly:true,singleAnswer:true}}));
    const data=JSON.stringify(records),license=`MIT synthetic ${domain}\n`;
    await writeFile(join(root,'sources',domain+'.json'),data);
    await writeFile(join(root,'sources',domain+'.LICENSE'),license);
    sources.push({id:domain,domain,revision:'a'.repeat(40),url:'https://example.invalid/fixture',
      data:{path:`sources/${domain}.json`,sha256:sha(data)},
      license:{spdx:'MIT',path:`sources/${domain}.LICENSE`,sha256:sha(license),status:'verified'}});
  }
  await writeFile(join(root,'source-lock.json'),JSON.stringify({schemaVersion:1,sources}));
  return {root,sources,async close(){await rm(root,{recursive:true,force:true});}};
}
function verify(root:string){
  const output=spawnSync(process.execPath,[resolve('scripts/verify-tier-candidates.mjs'),'--input',root,'--report',join(root,'report.json')],{encoding:'utf8',windowsHide:true});
  return {status:output.status,stderr:output.stderr};
}
async function mutate(root:string,domain:string,change:(rows:any[])=>void){
  const path=join(root,'sources',domain+'.json'),rows=JSON.parse(await readFile(path,'utf8'));change(rows);
  const data=JSON.stringify(rows);await writeFile(path,data);
  const lock=JSON.parse(await readFile(join(root,'source-lock.json'),'utf8'));
  lock.sources.find((s:any)=>s.domain===domain).data.sha256=sha(data);
  await writeFile(join(root,'source-lock.json'),JSON.stringify(lock));
}

test('reject_ineligible_sources_and_freeze_nested_counts',async()=>{
  const f=await fixture();try{
    const result=verify(f.root);assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    assert.equal(report.status,'passed');assert.equal(report.lightIds.length,120);assert.equal(report.deepIds.length,400);
    assert.equal(new Set(report.deepIds).size,400);assert.ok(report.lightIds.every((id:string)=>report.deepIds.includes(id)));
    for(const domain of ['knowledge','math','instructions','coding']){
      assert.equal(report.domains[domain].lightIds.length,30);assert.equal(report.domains[domain].deepIds.length,100);
      assert.equal(report.domains[domain].lengthUnit,'characters');
    }
    assert.equal(verify(f.root).status,0);
    assert.deepEqual(JSON.parse(await readFile(join(f.root,'report.json'),'utf8')).deepIds,report.deepIds);
    await mutate(f.root,'math',rows=>{rows.splice(99);});
    assert.notEqual(verify(f.root).status,0);
    const failed=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    assert.equal(failed.status,'failed');assert.ok(failed.errors.includes('INSUFFICIENT_ELIGIBLE:math'));
    assert.equal(failed.lightIds.length,0,'no apparently usable partial suite after hard gate failure');
  }finally{await f.close();}
});

test('rejects_hash_tampering_missing_license_and_duplicate_source_ids',async()=>{
  const f=await fixture();try{
    await writeFile(join(f.root,'sources','math.json'),'[]');
    assert.notEqual(verify(f.root).status,0);
    const failed=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    assert.ok(failed.errors.some((s:string)=>s.startsWith('SOURCE_HASH_MISMATCH:')));
  }finally{await f.close();}
  const g=await fixture();try{
    await mutate(g.root,'knowledge',rows=>{rows[1].id=rows[0].id;});
    const lock=JSON.parse(await readFile(join(g.root,'source-lock.json'),'utf8'));
    lock.sources[1].license.status='pending';
    await writeFile(join(g.root,'source-lock.json'),JSON.stringify(lock));
    assert.notEqual(verify(g.root).status,0);
    const report=JSON.parse(await readFile(join(g.root,'report.json'),'utf8'));
    assert.ok(report.errors.includes('DUPLICATE_SOURCE_ID:knowledge:knowledge-0'));
    assert.ok(report.errors.includes('LICENSE_UNVERIFIED:math'));
  }finally{await g.close();}
});

test('excludes_invalid_math_ambiguous_code_pending_reviews_and_answer_leakage',async()=>{
  const f=await fixture();try{
    await mutate(f.root,'math',rows=>{rows[0].answer='sqrt(2)';rows[1].review.singleAnswer=false;rows[2].review.textOnly=false;rows[3].review.status='pending';rows[4].answer='1/0';});
    await mutate(f.root,'coding',rows=>{rows[0].review.uniqueOutput=false;rows[1].cases=[];rows[2].review.status='pending';rows[3].question+='\nSolution: print(42)';rows[4].review.interactive=true;});
    assert.notEqual(verify(f.root).status,0);
    const report=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    assert.equal(report.domains.math.eligible,99);assert.equal(report.domains.coding.eligible,99);
    assert.ok(report.domains.coding.excluded.some((r:any)=>r.reason==='PROMPT_ANSWER_LEAKAGE'));
  }finally{await f.close();}
});

test('rejects_invalid_revision_and_source_path_escape',async()=>{
  const f=await fixture();try{
    const lock=JSON.parse(await readFile(join(f.root,'source-lock.json'),'utf8'));
    lock.sources[0].revision='main';lock.sources[1].data.path='../outside.json';
    await writeFile(join(f.root,'source-lock.json'),JSON.stringify(lock));
    assert.notEqual(verify(f.root).status,0);
    const report=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    assert.ok(report.errors.includes('UNPINNED_SOURCE:knowledge'));
    assert.ok(report.errors.some((s:string)=>s.startsWith('UNSAFE_SOURCE_PATH:')));
  }finally{await f.close();}
});

test('stratifies_subjects_and_prompt_lengths_without_selecting_by_model_results',async()=>{
  const f=await fixture();try{
    await mutate(f.root,'knowledge',rows=>{
      rows.splice(0,rows.length,...Array.from({length:168},(_,i)=>({...rows[i%rows.length],
        id:`subject-${i%14}-item-${Math.floor(i/14)}`,category:`subject-${String(i%14).padStart(2,'0')}`,
        question:'Q'.repeat((Math.floor(i/14)+1)*100)})));
    });
    assert.equal(verify(f.root).status,0);
    const report=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
    const selected=report.domains.knowledge;
    assert.equal(selected.lightCategories.length,14,'light must still cover every source subject');
    assert.deepEqual(Object.keys(selected.lightLengthStrata).sort(),['long','medium','short']);
    assert.ok(Object.values(selected.lightLengthStrata).every((count:any)=>count>=5),'light covers each within-subject length stratum');
    assert.equal(selected.selectionEvidence,'source metadata only; no model outcomes');
  }finally{await f.close();}
});
