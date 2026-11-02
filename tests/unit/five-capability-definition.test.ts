import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateGeneralDefinition} from '../../src/evaluation/definitions.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
import {createProtocolRegistry} from '../../src/evaluation/registry.ts';
import type {GeneralDefinition} from '../../src/evaluation/tier-contracts.ts';
async function definition(tier:'light'|'deep'){
 const s=JSON.parse(await readFile('resources/suites/task-five-v1/selection.json','utf8'));
 const ids:string[]=s[tier];const d={schema:'task-five-v1',tier,label:tier,domains:['knowledge','reading','instructions','coding','tools'].map(id=>({id,weight:.2,itemIds:ids.filter(q=>id==='knowledge'?q.startsWith('knowledge/')||q.startsWith('math/'):q.startsWith(id+'/'))}))};
 return {...d,definitionHash:identityHash(d)} as unknown as GeneralDefinition;
}
test('five-capability definitions accept exactly 100/350 reviewed items and five equal domains',async()=>{
 for(const tier of ['light','deep'] as const){const d=await definition(tier);assert.doesNotThrow(()=>validateGeneralDefinition(d));}
});
test('new definition rejects changed hash, duplicate IDs, incorrect domains, counts and weights',async()=>{
 const original=await definition('light');
 for(const mutation of [(d:any)=>d.definitionHash='0'.repeat(64),(d:any)=>d.domains[0].itemIds[0]=d.domains[1].itemIds[0],(d:any)=>d.domains[1].id='math',(d:any)=>d.domains[0].weight=.25,(d:any)=>d.domains[0].itemIds.pop(),(d:any)=>d.schema='unknown']){
  const d=structuredClone(original);mutation(d);if(d.definitionHash!=='0'.repeat(64)){const {definitionHash,...value}=d;d.definitionHash=identityHash(value);}assert.throws(()=>validateGeneralDefinition(d),/INVALID_GENERAL_DEFINITION/);
 }
});
test('registry resolves old and new independently and respects explicit runtime admission',async()=>{
 const registry=await createProtocolRegistry(process.cwd());
 for(const tier of ['light','deep'] as const){
  const d=registry.list().find(p=>p.refs.generalId==='general-task-five-v1-'+tier);assert.ok(d);const admitted=await readFile('resources/task-five-admission.json','utf8').then(()=>true).catch((e:any)=>{if(e.code==='ENOENT')return false;throw e;});assert.equal(d.allowNewRuns,admitted);
  const p=await registry.resolve(d.refs);assert.equal(p.items.filter(q=>q.track==='general').length,tier==='light'?100:350);assert.deepEqual(p.descriptor.general.domains.map(d=>d.weight),[.2,.2,.2,.2,.2]);
  if(d.allowNewRuns)assert.equal((await registry.forNewRun(d.refs.generalId)).generalId,d.refs.generalId);else await assert.rejects(()=>registry.forNewRun(d.refs.generalId),/PROTOCOL_NOT_VERIFIED/);
 }
 for(const d of registry.list().filter(p=>p.refs.resourceVersion!=='task-five-v1')){validateGeneralDefinition(d.general);assert.equal(d.general.domains.length,4);assert.ok(d.general.domains.every(d=>d.weight===.25));}
 await assert.rejects(()=>registry.forNewRun('unknown'),/UNKNOWN_PROTOCOL/);
});
