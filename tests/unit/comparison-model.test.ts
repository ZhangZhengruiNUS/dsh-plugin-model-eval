import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonRun as run,comparisonSnapshot as snapshot} from '../support/comparison-fixture.ts';
import {buildComparison,selectHistory} from '../../src/client/comparison/model.ts';
import {frontier} from '../../src/client/comparison/geometry.ts';

test('unknown explicit domains stay read-only and cannot form a known frontier',()=>{
  const a=run('future-a',88),b=run('future-b',90);for(const r of [a,b]){r.protocols.generalId='future-protocol';r.generalDefinition={tier:'deep',label:'Future',definitionHash:'future',domains:[{id:'unknown-domain' as any,weight:1,itemIds:['x']}]};r.tracks.general!.measures.knowledge={required:1,graded:1,score:88};}b.metrics.tracks.general!.answer.latencyMedianMs=20000;
  const group=buildComparison(snapshot([a,b]),'general')[0]!;assert.equal(group.known,false);assert.deepEqual(group.rows.map(r=>r.dimensions),[[null,null,null,null],[null,null,null,null]]);assert.deepEqual(frontier(group.rows,'latencyMs'),[]);assert.equal(group.rows[0]!.score,90);
});

test('supported explicit domains map by semantic id regardless of definition order',()=>{
  const r=run('supported');r.protocols.generalId='explicit-v1';r.generalDefinition={tier:'light',label:'Light',definitionHash:'known',domains:['coding','instructions','math','knowledge'].map(id=>({id:id as any,weight:.25,itemIds:[id]}))};r.tracks.general!.measures=Object.fromEntries(['knowledge','math','instructions','coding'].map((id,i)=>[id,{required:1,graded:1,score:81+i}]));const group=buildComparison(snapshot([r]),'general')[0]!;assert.equal(group.known,true);assert.deepEqual(group.rows[0]!.dimensions,[81,82,83,84]);
});
test('groups full protocols and keeps newest complete configuration without merging deployments',()=>{
  const old=run('old',70,'same'),latest=run('latest',80,'same'),pending=run('pending',99,'same'),other=run('other',85,'same');
  old.tracks.general!.completedAt='2026-01-01';pending.tracks.general!.status='pending';other.target.deployment={value:'Q4',source:'user'};
  const different=run('different',90,'same');different.protocols.generalId='other-protocol';
  const groups=buildComparison(snapshot([old,latest,pending,other,different]),'general');assert.equal(groups.length,2);
  const known=groups.find(g=>g.known)!;assert.deepEqual(known.rows.map(r=>r.runId).sort(),['latest','other']);
  assert.equal(known.rows.find(r=>r.runId==='latest')!.score,80);
  assert.deepEqual(selectHistory([old,latest,pending,other,different],latest.target,known.key,'general').map(r=>r.runId),['old','latest']);
});
test('missing dimensions and usage never become zero or a false complete total',()=>{
  const r=run('missing');delete r.tracks.general!.measures.ifeval;delete r.metrics.tracks.general!.answer.latencyMedianMs;
  const row=buildComparison(snapshot([r]),'general')[0]!.rows[0]!;
  assert.equal(row.dimensions[2],null);assert.equal(row.latencyMs,null);assert.equal(row.usage.totalTokens,null);assert.equal(row.usage.completeness,'unknown');assert.equal(row.usage.inputTokens,100);
  assert.equal(row.latencySamples,null);
});
test('judge identity includes parameters and only scored judges determine comparability',()=>{
  const a=run('a'),b=run('b');for(const r of [a,b]){r.tracks.writing={status:'completed',required:12,graded:12,score:80,measures:{}};r.judges=[{snapshot:{target:run('judge').target,rubricId:'r',promptId:'p'},itemIds:['x']}];}
  b.judges[0]!.snapshot.target.controls.temperature={state:'known',value:1,source:'override'};
  const rows=buildComparison(snapshot([a,b]),'writing')[0]!.rows;assert.notEqual(rows[0]!.judgeKey,rows[1]!.judgeKey);
  a.judges.push({snapshot:{target:run('other-judge').target,rubricId:'r',promptId:'p'},itemIds:['y']});
  assert.equal(buildComparison(snapshot([a]),'writing')[0]!.rows[0]!.judgeKey,null);
});
