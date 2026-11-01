import test from 'node:test';
import assert from 'node:assert/strict';
import type {GradeResult,RunSummary} from '../../src/contracts.ts';
import type {RunManifest,ItemRecord} from '../../src/history/store.ts';
import {summarizeGeneral} from '../../src/evaluation/aggregate.ts';
import {rebuildRunSummary} from '../../src/evaluation/aggregate-run.ts';
import {makeTierFixture} from '../support/tier-fixture.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
const iso='2026-11-01T08:00:00.000Z';
const target={scopeId:'fixture',providerId:'fixture',modelId:'fixture',routeTarget:{state:'unknown' as const},controls:{}};

test('score_selected_definition_and_resume_legacy_refs',()=>{
  for(const tier of ['light','deep'] as const){
    const set=makeTierFixture(tier),definition=set.descriptor.general,counts=tier==='light'?[14,16,13,17]:[40,60,30,70];
    const grades:GradeResult[]=definition.domains.flatMap((domain,i)=>domain.itemIds.map((itemId,j)=>({kind:'scored' as const,track:'general' as const,itemId,passed:j<counts[i]!,evidence:null})));
    const value=summarizeGeneral(grades,definition);assert.equal(value.score,50);assert.equal(value.required,tier==='light'?120:400);
    assert.equal(value.measures.knowledge!.required,tier==='light'?30:100);
    assert.equal(summarizeGeneral(grades.slice(1),definition).score,undefined);
    assert.throws(()=>summarizeGeneral([...grades,grades[0]!],definition),/DUPLICATE_GRADE/);
    const manifest:RunManifest={schemaVersion:1,runId:'run',batchId:'batch',createdAt:iso,target,protocols:set.descriptor.refs,requiredItems:set.items.filter(q=>q.track==='general').map(({id,track,datasetId})=>({id,track,datasetId})),generalDefinition:definition};
    const summary:RunSummary={runId:'run',batchId:'batch',createdAt:iso,target,protocols:manifest.protocols,revision:1,details:'available',resumeAllowed:true,generalDefinition:definition,judges:[],metrics:{tracks:{},activeIntervals:[],incompleteTiming:false},tracks:{general:{status:'pending',required:value.required,graded:grades.length,measures:{}}}};
    const items:ItemRecord[]=grades.map((grade,i)=>({schemaVersion:1,revision:1,sequence:i+1,updatedAt:iso,itemId:grade.itemId,gradeCommittedAt:iso,grade,attempts:[]}));
    const rebuilt=rebuildRunSummary(manifest,summary,items);assert.equal(rebuilt.tracks.general!.score,50);assert.equal(rebuilt.tracks.general!.completedAt,iso);
    const legacy=structuredClone(summary);legacy.tracks.general={status:'completed',required:905,graded:905,score:95.5,completedAt:iso,measures:{}};legacy.completedAt=iso;delete legacy.generalDefinition;
    const {generalDefinition:omitted,...oldManifest}=manifest;assert.deepEqual(rebuildRunSummary(oldManifest,legacy,[]).tracks.general,legacy.tracks.general);
    assert.equal(rebuildRunSummary(oldManifest,summary,items).tracks.general?.score,undefined,'unknown protocol without a snapshot cannot invent a score');
  }
});

test('invalid_domain_snapshots_cannot_change_denominators_or_weights',()=>{
  const definition=makeTierFixture('light').descriptor.general;
  assert.throws(()=>summarizeGeneral([],{...definition,definitionHash:'0'.repeat(64)}),/INVALID_GENERAL_DEFINITION/);
  const wrong=structuredClone(definition);(wrong.domains[0] as any).weight=.5;
  const {definitionHash:oldHash,...wrongValue}=wrong;wrong.definitionHash=identityHash(wrongValue);
  assert.throws(()=>summarizeGeneral([],wrong),/INVALID_GENERAL_DEFINITION/);
  const duplicate=structuredClone(definition);(duplicate.domains[0]!.itemIds as string[])[0]=duplicate.domains[1]!.itemIds[0]!;
  const {definitionHash:duplicateHash,...duplicateValue}=duplicate;duplicate.definitionHash=identityHash(duplicateValue);
  assert.throws(()=>summarizeGeneral([],duplicate),/INVALID_GENERAL_DEFINITION/);
});
