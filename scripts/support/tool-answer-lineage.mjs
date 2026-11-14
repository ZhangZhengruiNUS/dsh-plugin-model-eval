/** Package-safe, model-free verification of the single-item R1 -> R2 correction. */
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const version='task-five-v3-r2',parentVersion='task-five-v3-r1',itemId='tools/multi_turn_base_39';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';}
const hash=v=>sha(canonical(v)),same=(a,b,reason)=>assert.equal(hash(a),hash(b),'R2_'+reason),digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const toolAnswerProjection=catalog=>({...catalog,entries:catalog.entries.filter(e=>e.refs.resourceVersion!==version),bundles:catalog.bundles.filter(b=>b.id!==version)});
export function toolAnswerAdmissionHash(catalog){const entries=catalog.entries.filter(e=>e.refs.resourceVersion===version).map(e=>({...e,allowNewRuns:false})),bundle=catalog.bundles.find(b=>b.id===version);assert(bundle,'R2_MISSING');return hash({entries,bundle:{...bundle,runtimePassed:false}});}
export function verifyToolAnswerRevision(catalog,get,{requireAdmission=true}={}){
 const entries=catalog.entries.filter(e=>e.refs.resourceVersion===version),bundles=catalog.bundles.filter(b=>b.id===version);
 if(!entries.length&&!bundles.length)return toolAnswerProjection(catalog);
 assert.equal(entries.length,2,'R2_ENTRIES');assert.equal(bundles.length,1,'R2_BUNDLE');
 const bundle=bundles[0],parent=catalog.bundles.find(b=>b.id===parentVersion);assert(parent?.runtimePassed,'R2_PARENT');assert.equal(typeof bundle.runtimePassed,'boolean');
 for(const [tier,count]of [['light',62],['deep',348]]){
  const row=entries.find(e=>e.general.tier===tier),prior=catalog.entries.find(e=>e.refs.resourceVersion===parentVersion&&e.general.tier===tier);assert(row&&prior?.allowNewRuns,'R2_PARENT');assert.equal(prior.questionCount,count);
  const general={...structuredClone(prior.general),schema:version,label:tier==='light'?'轻量 · 62题（评分修订2）':'深入 · 348题（评分修订2）'};
  if(tier==='deep')general.parentGeneralId='general-'+version+'-light';delete general.definitionHash;general.definitionHash=hash(general);
  same(row,{...structuredClone(prior),refs:{...prior.refs,generalId:'general-'+version+'-'+tier,resourceVersion:version},general,bundleId:version,allowNewRuns:bundle.runtimePassed},'ENTRY_CHANGED');
 }
 const suite='suites/'+version,paths=[suite+'/questions.json',suite+'/scoring-policy.json',suite+'/NOTICE.txt',suite+'/bfcl/tool_worker.py',suite+'/bfcl/runtime.json'];
 const bytes=new Map(paths.map(path=>[path,get('resources/'+path)]));
 const policy={schema:'tool-answer-correction-v1',id:version,sourceVersion:parentVersion,changedItems:[itemId],newQuestions:0,excludedItems:[],profile:'filesystem-answer-list-v3',unchangedGrades:'carry after identity checks; no model calls or unchanged-grader execution'};
 same(JSON.parse(bytes.get(paths[1])),policy,'POLICY_CHANGED');
 const runtime=JSON.parse(bytes.get(paths[4]));same(runtime,{schemaVersion:1,kind:'sealed-bfcl-answer-correction',files:[{path:'tool_worker.py',sha256:sha(bytes.get(paths[3]))}]},'WORKER_PIN');
 const expected={...structuredClone(parent),id:version,resourceVersion:version,questionPath:paths[0],runtimePassed:bundle.runtimePassed,grading:{...structuredClone(parent.grading),scoringCorrection:policy,toolAnswerCorrectionManifest:sha(bytes.get(paths[4]))},files:[...parent.files.filter(f=>f.path!==parent.questionPath),...paths.map(path=>({path,size:bytes.get(path).length,sha256:sha(bytes.get(path))}))]};
 same(bundle,expected,'BUNDLE_CHANGED');same(JSON.parse(get('resources/'+suite+'/bundle.json')),bundle,'PACKED_BUNDLE');
 for(const pin of bundle.files){const b=get('resources/'+pin.path);assert.equal(b.length,pin.size,'R2_RESOURCE_SIZE');assert.equal(sha(b),pin.sha256,'R2_RESOURCE_HASH');}
 const parentPin=parent.files.find(f=>f.path===parent.questionPath),parentBytes=get('resources/'+parent.questionPath);assert(parentPin,'R2_PARENT_PIN');assert.equal(parentBytes.length,parentPin.size);assert.equal(sha(parentBytes),parentPin.sha256);
 const old=JSON.parse(parentBytes),next=JSON.parse(bytes.get(paths[0]));assert.equal(old.length,348);assert.equal(next.length,348);assert.equal(new Set(next.map(q=>q.id)).size,348);
 for(let i=0;i<old.length;i++){
  const prior=structuredClone(old[i]);if(prior.id===itemId){assert.equal(prior.grading.toolProfile,'filesystem-evidence-v2');prior.grading.toolProfile='filesystem-answer-list-v3';}same(next[i],prior,'QUESTION_CHANGED');
 }
 if(requireAdmission)assert.equal(bundle.runtimePassed,true,'R2_ADMISSION_REQUIRED');
 if(bundle.runtimePassed){
  const receipt=JSON.parse(get('resources/tool-answer-revision-admission.json')),reportBytes=get('resources/tool-answer-revision-acceptance.json'),report=JSON.parse(reportBytes),identity=toolAnswerAdmissionHash(catalog),scope='task-five-v3-r2-product-runtime';
  same(receipt,{schemaVersion:1,status:'passed',scope,newProtocolSha256:identity,runtimeAcceptanceSha256:sha(reportBytes)},'ADMISSION_RECEIPT');
  assert.equal(report.schemaVersion,1);assert.equal(report.scope,scope);assert.equal(report.status,'passed');assert.equal(report.newProtocolSha256,identity,'R2_ADMISSION_PROTOCOL');assert.equal(report.workerManifestSha256,bundle.grading.toolAnswerCorrectionManifest,'R2_ADMISSION_WORKER');assert.equal(report.modelCalls,0);assert.equal(report.unchangedGraderCalls,0);
  assert.deepEqual(report.checks.map(c=>c.id).sort(),['comparison','history','legacy','offline','reference','runtime']);assert(report.checks.every(c=>c.status==='passed'&&Number.isSafeInteger(c.tests)&&c.tests>0));
  assert(Array.isArray(report.sourceFiles)&&report.sourceFiles.length>0&&new Set(report.sourceFiles.map(f=>f.path)).size===report.sourceFiles.length);assert(report.sourceFiles.every(f=>/^(?:src|scripts|tests|docs\/evidence)\//.test(f.path)&&!f.path.includes('..')&&!f.path.includes('\\')&&!f.path.includes(':')&&digest(f.sha256)));
  assert(Array.isArray(report.regrades)&&report.regrades.length===6&&new Set(report.regrades.map(r=>r.sourceEvidenceHash)).size===6,'R2_SIX_SOURCES');assert.deepEqual(report.regrades.map(r=>r.count).sort((a,b)=>a-b),[62,62,62,62,348,348]);
  assert(report.regrades.every(r=>digest(r.sourceEvidenceHash)&&r.status==='passed'&&r.modelCalls===0&&Array.isArray(r.changedItems)&&r.changedItems.length<=1&&r.changedItems.every(id=>id===itemId)),'R2_UNIFORM_REGRADE');
 }
 return toolAnswerProjection(catalog);
}
