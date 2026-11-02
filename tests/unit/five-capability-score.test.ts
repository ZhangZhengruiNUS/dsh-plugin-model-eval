import test from 'node:test';import assert from 'node:assert/strict';import {summarizeGeneral} from '../../src/evaluation/aggregate.ts';import type {GradeResult} from '../../src/contracts.ts';import {fiveFixture} from '../support/five-fixture.ts';
test('five scores80/70/90/80/60 produce76 and no total with any missing item',()=>{
 const p=fiveFixture(),want=[80,70,90,80,60],results:GradeResult[]=p.descriptor.general.domains.flatMap((d,index)=>d.itemIds.map((itemId,i)=>({kind:'scored' as const,track:'general' as const,itemId,passed:i<d.itemIds.length*want[index]!/100,evidence:null})));
 const result=summarizeGeneral(results,p.descriptor.general);assert.equal(result.status,'completed');assert.equal(result.score,76);assert.equal(result.measures.tools!.score,60);
 assert.equal(summarizeGeneral(results.slice(0,-1),p.descriptor.general).score,undefined);
 const missing:GradeResult={kind:'technical-missing',track:'general',itemId:results.at(-1)!.itemId,error:{code:'NETWORK_ERROR',retryable:true,phase:'answer',message:'fixture'},evidence:null};assert.equal(summarizeGeneral([...results.slice(0,-1),missing],p.descriptor.general).score,undefined);
});
test('new total averages unrounded domain scores, not displayed rounded values or item counts',()=>{
 const p=fiveFixture(),results:GradeResult[]=p.items.map(q=>({kind:'scored',track:'general',itemId:q.id,passed:q.id===p.descriptor.general.domains[0]!.itemIds[0],evidence:null}));
 const result=summarizeGeneral(results,p.descriptor.general);assert.equal(result.score,(1/30*100)*.2);assert.equal(result.graded,100);assert.equal(result.measures.coding!.score,0);
});
