import test from 'node:test';import assert from 'node:assert/strict';import {comparisonRun,comparisonSnapshot} from '../support/comparison-fixture.ts';import {makeTierFixture} from '../support/tier-fixture.ts';import {protocolComparisonKey,latestCompleted} from '../../src/client/store.ts';import {buildComparison} from '../../src/client/comparison/model.ts';
import * as React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {BatchRuns} from '../../src/client/ui.tsx';
import {fiveFixture} from '../support/five-fixture.ts';import {dimensionNames} from '../../src/client/comparison/model.ts';
test('new five axes map semantic measures, preserve missing values and stay separate from old scores',()=>{
 const r=comparisonRun('five',76,'same'),old=comparisonRun('old',95,'same'),p=fiveFixture();r.protocols=p.descriptor.refs;r.generalDefinition=p.descriptor.general;r.tracks.general!.required=100;r.tracks.general!.graded=100;r.tracks.general!.measures=Object.fromEntries(['knowledge','reading','instructions','coding','tools'].map((id,i)=>[id,{required:10,graded:10,score:[80,70,90,80,60][i]!}]));
 const groups=buildComparison(comparisonSnapshot([r,old]),'general');assert.equal(groups.length,2);const g=groups.find(g=>g.rows[0]!.runId==='five')!;assert.equal(g.known,true);assert.deepEqual(g.rows[0]!.dimensions,[80,70,90,80,60]);assert.deepEqual(dimensionNames(r,'general'),['知识与推理','资料理解','指令遵循','代码能力','工具使用']);
 delete r.tracks.general!.measures.tools;assert.equal(buildComparison(comparisonSnapshot([r]),'general')[0]!.rows[0]!.dimensions[4],null);
});
test('complete_general_refs_separate_tiers_but_writing_identity_does_not_include_general_tier',()=>{
  const light=comparisonRun('light',75,'same'),deep=comparisonRun('deep',80,'same'),legacy=comparisonRun('legacy',95,'same');
  for(const row of [light,deep,legacy])row.tracks.writing={status:'completed',required:12,graded:12,score:80,completedAt:'2026-01-02',measures:{}};
  for(const [row,tier] of [[light,'light'],[deep,'deep']] as const){const set=makeTierFixture(tier);row.protocols={...set.descriptor.refs,writingId:legacy.protocols.writingId};row.generalDefinition=set.descriptor.general;row.tracks.general!.required=tier==='light'?120:400;row.tracks.general!.graded=row.tracks.general!.required;row.tracks.general!.measures=Object.fromEntries(['knowledge','math','instructions','coding'].map(id=>[id,{required:tier==='light'?30:100,graded:tier==='light'?30:100,score:80}]));}
  deep.tracks.writing!.completedAt='2026-11-02';light.tracks.writing!.completedAt='2026-11-01';legacy.tracks.writing!.completedAt='2026-10-31';
  const rows=[light,deep,legacy];assert.equal(new Set(rows.map(r=>protocolComparisonKey(r,'general'))).size,3);assert.equal(new Set(rows.map(r=>protocolComparisonKey(r,'writing'))).size,1);assert.equal(latestCompleted(rows,'general').length,3);assert.equal(latestCompleted(rows,'writing').length,1);assert.equal(latestCompleted(rows,'writing')[0]!.runId,'deep');assert.equal(buildComparison(comparisonSnapshot(rows),'general').length,3);assert.equal(buildComparison(comparisonSnapshot(rows),'writing').length,1);
});
test('legacy_definition_keeps_legacy_dimensions_and_batch_label',()=>{
  const run=comparisonRun('legacy-snapshot',80);run.generalDefinition=makeTierFixture('legacy').descriptor.general;
  const row=buildComparison(comparisonSnapshot([run]),'general')[0]!.rows[0]!;assert.deepEqual(row.dimensions,[80,80,80,80]);
  const html=renderToStaticMarkup(React.createElement(BatchRuns,{batch:{batchId:run.batchId,runIds:[run.runId],createdAt:'2026-01-02',status:'completed',execution:{concurrency:4,callTimeoutMs:300000}},runs:[run],report(){}}));assert.match(html,/通用基线/);assert.doesNotMatch(html,/深入/);
});
