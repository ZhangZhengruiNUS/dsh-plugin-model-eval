import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateInput} from '../../scripts/support/contest-adaptation.ts';
const fixtures:[string,string,string][]=[
 ['77','1 1\n15\n','1 1\n0\n'],['149','1\n2 0 1\na*\n','1\n2 0 2\na*\n'],
 ['157','2 0\n01\n','2 3\n01\n'],['123','2 1\n1 2\n','2 1\n1 1\n'],
 ['82','1 1 1\n1\n1 1\n','1 1 1\n1\n2 2\n'],
 ['43','2 1\n1 2\n1 2 1 1\n1 1\n','2 1\n1 2\n1 1 1 1\n1 1\n'],
 ['47','1\n1 1\n0\n','1\n1 2\n0\n'],['18','1\n1 1\n0\n','1\n1 0\n0\n'],
 ['146','1 1\n1\n2 1 1\n','2 1\n1 2\n1 1 2\n'],
 ['42','1\n1 2\n1\n1\n','1\n1 1\n1\n1\n'],['111','1 0\n0\n','1 0\n-1\n'],
 ['135','1\n1 0\n1\n','1\n1 1\n1\n'],['116','1\n1\n1\n','1\n1\n2\n'],
 ['96','2 1\n','1 1\n'],['70','1 1\n999999999999999999999999999\n1 1 0\n','1 1\n0\n1 1 1000000007\n'],
 ['110','3\n0 0 1\n1 0 2\n0 1 3\n','3\n0 0 1\n1 0 1\n0 1 3\n'],
 ['44','1\n.\n','1\nA\n'],['9','1 1 1\n2\n1\n','1 1 1\n1\n1\n'],
 ['20','1\n5 4\n0000\n0000\n0000\n0000\n0000\n','1\n4 4\n0000\n0000\n0000\n0000\n'],
 ['80','1\n1 1\n1\n1\n','1\n1 1\n0\n1\n'],['63','1\n(\n','1\nx\n'],
 ['5','2 2\n-1 1\n','2 2\n-1 2\n'],
 ['24','2 1 0\n1 1\n1 2 1\n','2 2 0\n1 1\n1 2 1\n1 2 2\n'],
 ['142','1\n\n1 2\n1 2\n','1\n\n2 1\n1\n2\n'],
 ['145','1\n\n1 0\n0 0 0\n','1\n\n1 0\n0 0 -1\n'],
 ['35','2\n1 1\n*/\n','2\n1 1\n**x\n'],
 ['124','1\n2\n??\n01\n','1\n2\n?a\n01\n'],
 ['85','1 100000007\n','1 100000008\n'],['151','1\n1 1\n','1\n2 1 1\n'],
 ['6','2\n1 100000\n','1\n1\n'],['109','1\n??\n','1\nBW?\n'],
 ['84','1\n1 1\n','1\n1 2\n'],['69','1 1\n0\n0\n4 1 1\n','1 1\n0\n0\n3 1 1 1 -1\n'],
 ['108','1\n1\n1\n1\n','1\n2\n1 1\n2 3\n'],['150','1\n1\n1\n','1\n1\n0\n'],
 ['21','1 1 1 1\n','1 2 1 1\n'],['66','1\n2\n0 1\nleft right\n','1\n2\n0 2\nleft right\n'],
 ['68','1\n0 0\n1\n1 0 1\n','2\n0 0\n0 0\n1\n1 0 1\n'],
 ['17','1\n1\n0\n','1\n0\n'],['12','0 0\n1\n','0 0\n0\n'],
 ['97','1\n1\n1 0\n','1\n1\n2 0\n'],['25','2 1\n','1 1\n'],
 ['75','1\n0\n','1\n-1\n'],['11','1\n1\n','1\n200001\n'],
 ['4','2 0\n0 0\n1 2 0\n','2 0\n0 0\n1 1 0\n'],
 ['23','1 1\n1\n','2 1\n1 1\n'],['83','1000000000000\n','1000000000001\n'],
 ['138','1 1 1\n1\n1\n0\n','1 1 1\n1\n1\n-1\n'],
 ['164','1 1\na\n0 0\n','2 1\nab\n0 0\n1 0\n'],
 ['2','1 1 1\n0\n','1 1 4\n0\n'],
 ['112','2 1 1\n1 2 a\na\n1 2 1 1\n','2 1 1\n1 2 a\na\n1 1 1 1\n'],
 ['54','1\n1 0\n','1\n1 1\n1 1 imposter\n'],['73','2 1\n1 2\n','2 1\n1 1\n'],
 ['32','1\n1\n1\n','1\n1\n0\n'],['86','1\n1 0 0\n','1\n1 0 1\n'],
 ['143','1\n1\n0\n','1\n1\n2\n'],['62','1 1 1\n1 1\n','1 1 1\n2 1\n'],
 ['81','1 0\n0 0\n','1 -1\n0 0\n'],
 ['163','1\n2 2 1 1 2 2 99\n','1\n2 2 1 1 2 2 100\n'],
 ['50','1\n1\n','1\n0\n'],['7','1 1\n0\n1\n','1 2\n0\n11\n'],
 ['153','1\naab\n','1\nba\n'],['22','1 2\n1 1\n1 1\n2 1\n','1 1\n1 1\n2 1\n'],
 ['118','2\n1 2\n','2\n1 1\n'],['56','1\n1\n1 red\n','1\n1\n2 red\n'],
 ['34','1\n5000\n','1\n5001\n']
];
test('remaining_pinned_contracts_cover_semantic_and_coupled_constraints',()=>{
  for(const [id,valid,invalid] of fixtures){assert.equal(validateInput(id,valid).status,'valid','valid source '+id);assert.equal(validateInput(id,invalid).status,'invalid','invalid source '+id);}
});
test('all_original_public_examples_satisfy_their_own_statement_contracts',async()=>{
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const questions=JSON.parse(await readFile('resources/suites/two-tier-v1/questions.json','utf8'));
  for(const q of questions.filter((q:any)=>q.datasetId==='code-contests-selected'))for(const [i,text] of rows[+q.sourceId].raw.public_tests.input.entries()){
    assert.equal(validateInput(q.sourceId,text).status,'valid',`${q.id} public${i}: ${JSON.stringify(validateInput(q.sourceId,text))}`);
  }
});
test('nonnegative_range_guarantees_are_preserved_through_clamp_and_add_composition',()=>{
  for(let seed=1;seed<=25;seed++){
    const arrays=[Array(5).fill(5),Array(5).fill(5)],lines:string[]=[];let bad=false;
    for(let i=0;i<30;i++){
      const kind=1+(i+seed)%3,k=(i*seed)%2,l=(i+seed)%5,r=l+(i*7+seed)%(5-l),x=kind===3?((i+seed)%7)-3:(i*seed)%10;
      lines.push(`${kind} ${k+1} ${l+1} ${r+1} ${x}`);
      for(let j=l;j<=r;j++){arrays[k]![j]=kind===1?Math.min(arrays[k]![j]!,x):kind===2?Math.max(arrays[k]![j]!,x):arrays[k]![j]!+x;if(arrays[k]![j]!<0)bad=true;}
    }
    const text='5 30\n5 5 5 5 5\n5 5 5 5 5\n'+lines.join('\n')+'\n';
    assert.equal(validateInput('69',text).status,bad?'invalid':'valid','state composition seed'+seed);
  }
});
