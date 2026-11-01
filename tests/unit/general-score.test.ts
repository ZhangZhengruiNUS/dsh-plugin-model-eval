import test from 'node:test';
import assert from 'node:assert/strict';
import type {GradeResult,ProtocolSet,Question} from '../../src/contracts.ts';
import {summarizeGeneral} from '../../src/evaluation/aggregate.ts';
import {legacyGeneralDefinition} from '../../src/evaluation/definitions.ts';
import {extractFinalLetter,numericEquivalent,extractCode} from '../../src/evaluation/grade-general.ts';
test('equal_domain_weights_and_fixed_denominator',()=>{
  const items:Question[]=[],grades:GradeResult[]=[];
  for(const [datasetId,count,passed] of [['tiny-mmlu',100,80],['tiny-gsm8k',100,70],['ifeval',541,325],['humaneval-plus',164,148]] as const){
    for(let i=0;i<count;i++){const id=datasetId+'/'+i;items.push({id,track:'general',datasetId,sourceId:id,sourceHash:'fixture',prompt:[],grading:null});grades.push({kind:'scored',track:'general',itemId:id,passed:i<passed,evidence:null});}
  }
  const required:ProtocolSet={generalId:'fixture',writingId:'fixture',resourceVersion:'fixture',items};
  const summary=summarizeGeneral(grades,legacyGeneralDefinition(required.items));
  assert.equal(summary.score,(80+70+325/541*100+148/164*100)/4);
  assert.equal(summary.measures['humaneval-plus']!.score,148/164*100);
  assert.equal(summarizeGeneral(grades.slice(0,900),legacyGeneralDefinition(required.items)).score,undefined);
  assert.throws(()=>summarizeGeneral([...grades,grades[0]!],legacyGeneralDefinition(required.items)),/DUPLICATE_GRADE/);
  const simple={...required,items:items.filter(x=>!['ifeval','humaneval-plus'].includes(x.datasetId))};
  assert.equal(summarizeGeneral(grades,legacyGeneralDefinition(simple.items)).score,undefined,'all four fixed domains required');
});
test('final answers are explicit and numeric comparison is exact',()=>{
  assert.equal(extractFinalLetter('Reason A was wrong.\nFinal answer: C.'),'C');
  assert.equal(extractFinalLetter('The best is A or B'),undefined);
  assert.ok(numericEquivalent('We used 50 and 6\n#### 1,200.00','1200'));
  assert.ok(numericEquivalent('#### -3/2','-1.5'));
  assert.ok(numericEquivalent('#### 1e3','1000'));
  assert.ok(!numericEquivalent('There are 1200 apples.','1200'));
  assert.ok(!numericEquivalent('#### 9007199254740992','9007199254740993'));
  assert.equal(extractCode('```python\ndef f(): return 1\n```'),'def f(): return 1');
  assert.equal(extractCode('```python\na\n```\n```python\nb\n```'),undefined);
});
