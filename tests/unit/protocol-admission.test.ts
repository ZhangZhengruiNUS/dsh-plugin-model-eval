
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtocolAdmission,resolveProtocolForRead} from '../../src/evaluation/protocol-resolution.ts';
import type {ProtocolRefs,ProtocolRegistry,ResolvedProtocolSet} from '../../src/contracts.ts';
import {validateEnvelope} from '../../src/host/api.ts';

const refs={generalId:'g',writingId:'w',resourceVersion:'r'};
const descriptor={refs,general:{tier:'legacy' as const,label:'fixture',definitionHash:'fixture',domains:[]},allowNewRuns:true,questionCount:0};
const resolved=(key:ProtocolRefs):ResolvedProtocolSet=>({...key,items:[],compatibility:{},descriptor:{...descriptor,refs:key}});

test('one admission shares exact verified refs, including new-run resolution, and a later admission reads fresh',async()=>{
  let fullReads=0;
  const registry:ProtocolRegistry={
    list:()=>[descriptor],
    async resolve(key){fullReads++;return resolved(key);},
    async forNewRun(){fullReads++;return resolved(refs);},
  };
  const scope=createProtocolAdmission(registry);
  const histories=await Promise.all(Array.from({length:8},()=>scope.resolve({...refs})));
  assert.equal(fullReads,1);
  assert(histories.every(value=>value===histories[0]));
  await scope.resolve({...refs,writingId:'different'});
  assert.equal(fullReads,2);
  const subsequent=createProtocolAdmission(registry);
  const selected=await subsequent.forNewRun('g',['general']);
  assert.equal(await subsequent.forNewRun('g',['general']),selected);
  assert.equal(await subsequent.resolve(refs),selected);
  assert.equal(fullReads,3);
  await createProtocolAdmission(registry).resolve(refs);
  assert.equal(fullReads,4);
});

test('failed admission is not kept, and read-only consumers use the question path',async()=>{
  let fullReads=0,readOnly=0;
  const registry:ProtocolRegistry={
    list:()=>[descriptor],
    async resolve(key){if(++fullReads===1)throw Error('RESOURCE_HASH_MISMATCH');return resolved(key);},
    async resolveForRead(key){readOnly++;return resolved(key);},
    async forNewRun(){return resolved(refs);},
  };
  const scope=createProtocolAdmission(registry);
  await assert.rejects(scope.resolve(refs),/RESOURCE_HASH_MISMATCH/);
  await scope.resolve(refs);
  await resolveProtocolForRead(registry,refs);
  assert.equal(fullReads,2);
  assert.equal(readOnly,1);
});

test('report summary selection remains explicit and defaults retain compatibility',()=>{
  const base={schemaVersion:1,requestId:'report',action:'report',payload:{runId:'00000000-0000-4000-8000-000000000000'}};
  assert.deepEqual(validateEnvelope(base).payload,base.payload);
  assert.equal(validateEnvelope({...base,payload:{...base.payload,includeQuestions:false}}).payload.includeQuestions,false);
  assert.throws(()=>validateEnvelope({...base,payload:{...base.payload,includeQuestions:'false'}}),{code:'INVALID_REQUEST'});
});
