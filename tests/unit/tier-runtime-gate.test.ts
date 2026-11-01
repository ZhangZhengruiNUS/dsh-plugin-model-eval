import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompleteRuntimeGate} from '../../scripts/support/tier-runtime-gate.ts';
import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';

test('tier_freeze_requires_all400_exact_ids_full_known_error_inventory_and_legacy',()=>{
  const coding=Array.from({length:100},(_,i)=>({id:'coding/'+i})),other=Array.from({length:300},(_,i)=>({id:'other/'+i}));
  const staged={questions:coding,limits:CONTEST_SCORING_LIMITS},audit={stagingHash:identityHash(staged)};
  const runtime={endedAt:'2026-11-01T07:00:00.000Z',stagingHash:audit.stagingHash,limits:CONTEST_SCORING_LIMITS,selectedIds:null,counts:{passed:100,failed:0,pending:0},items:coding.map(q=>({...q,status:'passed',positives:[{outcome:{kind:'passed',elapsedMs:1}}],negatives:[],availableNegativeCount:0}))};
  const noncoding={endedAt:'2026-11-01T07:00:00.000Z',counts:{passed:300,failed:0,pending:0},items:other.map(q=>({...q,status:'passed'}))};
  const legacy={status:'passed',limits:{wallMs:30000,memoryBytes:536870912,computeBudget:200000000000},tasks:Array.from({length:164},(_,i)=>({id:'HumanEval/'+i,kind:'passed'})),rules:{required:541,executed:541,technicalFailures:[]}};
  const check=(r=runtime,n=noncoding,l=legacy,s=staged)=>assertCompleteRuntimeGate({audit,staged:s,runtime:r,noncoding:n,legacy:l,noncodingIds:other.map(q=>q.id)});
  assert.doesNotThrow(()=>check());
  assert.throws(()=>check({...runtime,items:runtime.items.slice(0,4)}),/CODING_GATE_INCOMPLETE/);
  assert.throws(()=>check({...runtime,selectedIds:['0']} as any),/CODING_GATE_INCOMPLETE/);
  assert.throws(()=>check({...runtime,endedAt:undefined} as any),/CODING_GATE_INCOMPLETE/);
  assert.throws(()=>check(runtime,{...noncoding,endedAt:undefined} as any),/NONCODING_GATE_INCOMPLETE/);
  assert.throws(()=>check({...runtime,stagingHash:'changed'}),/GATE_BINDING_MISMATCH/);
  assert.throws(()=>check({...runtime,limits:{...CONTEST_SCORING_LIMITS,wallMs:30000}} as any),/GATE_BINDING_MISMATCH/);
  assert.throws(()=>check({...runtime,items:runtime.items.map((x,i)=>i?x:{...x,id:runtime.items[1]!.id})}),/CODING_GATE_INCOMPLETE/);
  assert.throws(()=>check({...runtime,items:runtime.items.map((x,i)=>i?x:{...x,availableNegativeCount:1})}),/KNOWN_NEGATIVE_INVENTORY_MISMATCH/);
  assert.throws(()=>check({...runtime,items:runtime.items.map((x,i)=>i?x:{...x,positives:[{outcome:{kind:'failed',reason:'resource',elapsedMs:1}}]})} as any),/REFERENCE_GATE_FAILED/);
  assert.throws(()=>check(runtime,{...noncoding,items:noncoding.items.slice(1)}),/NONCODING_GATE_INCOMPLETE/);
  assert.throws(()=>check(runtime,noncoding,{...legacy,tasks:legacy.tasks.slice(1)}),/LEGACY_GATE_INCOMPLETE/);
  assert.throws(()=>check(runtime,noncoding,{...legacy,rules:{...legacy.rules,technicalFailures:['x']}} as any),/LEGACY_GATE_INCOMPLETE/);
  assert.throws(()=>check(runtime,noncoding,{...legacy,limits:CONTEST_SCORING_LIMITS} as any),/LEGACY_BUDGET_CHANGED/);
});
