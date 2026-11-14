/** Verify an additive edition without rewriting any earlier acceptance report. */
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';}
const hash=v=>sha(canonical(v)),same=(a,b,label)=>assert.equal(hash(a),hash(b),label);
const version='task-five-v3',domains=['knowledge','reading','instructions','coding','tools'];
export function fiveV3Projection(catalog){return {...catalog,entries:catalog.entries.filter(e=>e.refs.resourceVersion!==version),bundles:catalog.bundles.filter(b=>b.id!==version)};}
export function fiveV3AdmissionHash(catalog){
 const entries=catalog.entries.filter(e=>e.refs.resourceVersion===version).map(e=>({...e,allowNewRuns:false})),bundle=catalog.bundles.find(b=>b.id===version);assert.ok(bundle);
 return sha(JSON.stringify({entries,bundle:{...bundle,runtimePassed:false}}));
}
export function verifyFiveV3(catalog,get){
 const entries=catalog.entries.filter(e=>e.refs.resourceVersion===version),bundles=catalog.bundles.filter(b=>b.id===version);if(!entries.length&&!bundles.length)return;
 assert.equal(entries.length,2);assert.equal(bundles.length,1);const bundle=bundles[0],parent=catalog.bundles.find(b=>b.id==='task-five-v2');assert.ok(parent?.runtimePassed);
 assert.equal(bundle.resourceVersion,version);assert.equal(bundle.questionPath,'suites/task-five-v3/questions.json');same(bundle.grading,parent.grading,'unchanged grading');same(bundle.runtime,parent.runtime,'unchanged runtime');
 for(const [tier,counts]of [['light',[20,8,20,8,8]],['deep',[100,50,100,70,30]]]){
  const e=entries.find(e=>e.general.tier===tier);assert.ok(e);assert.equal(e.bundleId,version);assert.equal(e.refs.generalId,'general-task-five-v3-'+tier);assert.equal(e.refs.writingId,catalog.legacyRefs.writingId);assert.equal(e.allowNewRuns,bundle.runtimePassed);
  const {definitionHash,...definition}=e.general;assert.equal(definitionHash,hash(definition));assert.equal(definition.schema,version);assert.equal(definition.executionPolicy,'long-tasks-first-v1');
  assert.deepEqual(definition.domains.map(d=>d.id),domains);assert.ok(definition.domains.every(d=>d.weight===.2));assert.deepEqual(definition.domains.map(d=>d.itemIds.length),counts);
  const ids=definition.domains.flatMap(d=>d.itemIds);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,e.questionCount);
 }
 const light=entries.find(e=>e.general.tier==='light'),deep=entries.find(e=>e.general.tier==='deep'),deepIds=new Set(deep.general.domains.flatMap(d=>d.itemIds));
 assert.equal(deep.general.parentGeneralId,light.refs.generalId);assert.ok(light.general.domains.every(d=>d.itemIds.every(id=>deepIds.has(id))));
 const packedBundle=JSON.parse(get('resources/suites/task-five-v3/bundle.json'));same(packedBundle,bundle,'packed v3 bundle');
 const checked=path=>{const pin=bundle.files.find(f=>f.path===path);assert.ok(pin,path);const bytes=get('resources/'+path);assert.equal(bytes.length,pin.size,path);assert.equal(sha(bytes),pin.sha256,path);return bytes;};
 const parentBytes=get('resources/'+parent.questionPath),parentPin=parent.files.find(f=>f.path===parent.questionPath);assert.ok(parentPin,'parent question pin');assert.equal(parentBytes.length,parentPin.size,'parent question size');assert.equal(sha(parentBytes),parentPin.sha256,'parent question hash');
 const questions=JSON.parse(checked(bundle.questionPath)),oldQuestions=JSON.parse(parentBytes),byId=new Map(questions.map(q=>[q.id,q])),oldById=new Map(oldQuestions.map(q=>[q.id,q]));
 assert.equal(byId.size,350);assert.equal(questions.length,350);assert.equal(deepIds.size,350);
 for(const q of questions){assert.ok(deepIds.has(q.id));assert.equal(q.track,'general');assert.match(q.sourceHash,/^[a-f0-9]{64}$/);if(oldById.has(q.id))same(q,oldById.get(q.id),'shared old question');}
 const selections=JSON.parse(checked('suites/task-five-v3/selection.json'));
 for(const [tier,e]of [['light',light],['deep',deep]])same(selections[tier],Object.fromEntries(e.general.domains.map(d=>[d.id,d.itemIds])),'selection membership');
 const selectionHash=s=>sha(JSON.stringify(Object.fromEntries(Object.entries(s).sort(([a],[b])=>a<b?-1:a>b?1:0))));
 assert.equal(selections.schemaVersion,1);assert.equal(selections.selectionHash,selectionHash(selections.light));assert.equal(selections.deepSelectionHash,selectionHash(selections.deep));
 const from=catalog.entries.find(e=>e.refs.generalId==='general-task-five-v2-light');assert.ok(from?.allowNewRuns);
 const leftIds=new Set(from.general.domains.flatMap(d=>d.itemIds)),rightIds=new Set(light.general.domains.flatMap(d=>d.itemIds));
 const left=oldQuestions.filter(q=>leftIds.has(q.id)),right=questions.filter(q=>rightIds.has(q.id));
 const mapped=domains.map(id=>({id,itemIds:from.general.domains.find(d=>d.id===id).itemIds.filter(x=>light.general.domains.find(d=>d.id===id).itemIds.includes(x))})),common=mapped.flatMap(d=>d.itemIds);
 assert.ok([...leftIds].every(id=>!rightIds.has(id)||common.includes(id)),'shared domain cannot move');
 const compatibility={};for(const id of common){
  const q=oldById.get(id);assert.ok(['mmlu-pro-selected','olympiad-text-selected','longbench-v2-selected','ifeval','code-contests-selected','bfcl-v4-multi-turn-selected'].includes(q.datasetId));
  // These selected datasets have no automatic suffix in buildPrompt. Whole-question
  // equality above also preserves every embedded prompt and grading condition.
  const parts={contentHash:hash({datasetId:q.datasetId,sourceId:q.sourceId,sourceHash:q.sourceHash,prompt:q.prompt}),promptHash:hash(q.prompt),gradingHash:hash({definition:parent.grading,question:q.grading}),runtimeHash:hash(parent.runtime)};
  compatibility[id]={...parts,combinedHash:hash(parts)};
 }
 const body={schemaVersion:1,id:'task-five-v2-to-v3-light',fromRefs:from.refs,toRefs:light.refs,fromDefinitionHash:from.general.definitionHash,toDefinitionHash:light.general.definitionHash,domains:mapped,common,fromOnly:left.map(q=>q.id).filter(id=>!rightIds.has(id)),toOnly:right.map(q=>q.id).filter(id=>!leftIds.has(id)),compatibility,questionHashes:Object.fromEntries(common.map(id=>[id,hash(oldById.get(id))]))};
 const declaration=JSON.parse(checked('edition-maps.json'));assert.equal(declaration.schemaVersion,1);assert.equal(declaration.maps.length,1);same(declaration.maps[0],{...body,mapHash:hash(body)},'reviewed common map matches actual resources');
 if(bundle.runtimePassed){const admission=JSON.parse(get('resources/task-five-v3-admission.json'));assert.equal(admission.schemaVersion,1);assert.equal(admission.status,'passed');assert.equal(admission.scope,'task-five-v3-product-runtime');assert.equal(admission.newProtocolSha256,fiveV3AdmissionHash(catalog));assert.match(admission.runtimeAcceptanceSha256,/^[a-f0-9]{64}$/);assert.equal(admission.selectionHash,selections.selectionHash);assert.equal(admission.deepSelectionHash,selections.deepSelectionHash);assert.equal(admission.editionMapHash,declaration.maps[0].mapHash);}
}
