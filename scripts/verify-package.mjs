import assert from 'node:assert/strict';
import {validateGeneralDefinition} from '../src/evaluation/definitions.ts';
import {generalReleases} from '../src/evaluation/current-edition.ts';
import {CURRENT_WRITING_ID,LEGACY_WRITING_ID,generalWritingRef,writingV2Edition} from '../src/evaluation/writing-edition.ts';
import {fiveV2Projection, verifyFiveV2} from './support/five-v2-lineage.mjs';
import {fiveV3Projection,verifyFiveV3} from './support/five-v3-lineage.mjs';
import {projectVerifiedScoringRevisions} from './support/scoring-revision-lineage.mjs';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
import {assertFiveAdmission} from './support/five-lineage.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function text(buffer,start,size){return buffer.subarray(start,start+size).toString('utf8').replace(/\0.*$/s,'');}
export function unpackTar(bytes){
  const raw=gunzipSync(bytes),entries=new Map();let offset=0,pax={};
  while(offset+512<=raw.length){const head=raw.subarray(offset,offset+512);if(head.every(x=>x===0))break;
    const checksum=parseInt(text(head,148,8).trim(),8),actual=[...head].reduce((sum,value,index)=>sum+(index>=148&&index<156?32:value),0);if(checksum!==actual)throw new Error('INVALID_TAR_CHECKSUM');
    const size=parseInt(text(head,124,12).trim()||'0',8);if(!Number.isSafeInteger(size)||size<0)throw new Error('INVALID_TAR');
    const data=raw.subarray(offset+512,offset+512+size);if(data.length!==size)throw new Error('TRUNCATED_TAR');const type=text(head,156,1);
    if(type==='x'){pax={};let cursor=0;const value=data.toString('utf8');while(cursor<value.length){const space=value.indexOf(' ',cursor),length=Number(value.slice(cursor,space));if(!Number.isInteger(length)||length<=0)throw new Error('INVALID_PAX');const item=value.slice(space+1,cursor+length-1),eq=item.indexOf('=');pax[item.slice(0,eq)]=item.slice(eq+1);cursor+=length;}}
    else{const prefix=text(head,345,155),name=pax.path??(prefix?prefix+'/':'')+text(head,0,100);pax={};if(!name.startsWith('package/')||name.includes('\\')||name.split('/').some(x=>x==='..'||x==='.')||name.includes(':'))throw new Error('UNSAFE_TAR_PATH');
      if(type==='0'||type===''){if(entries.has(name))throw new Error('DUPLICATE_TAR_PATH');entries.set(name,data);}else if(type!=='5')throw new Error('UNSUPPORTED_TAR_ENTRY');}
    offset+=512+Math.ceil(size/512)*512;
  }return entries;
}
export function verifyPackage(path){
  const bytes=readFileSync(path),entries=unpackTar(bytes),get=name=>{const value=entries.get('package/'+name);if(!value)throw new Error('PACKAGE_FILE_MISSING: '+name);return value;};
  const pkg=JSON.parse(get('package.json'));if(pkg.name!=='dsh-model-coordinates'||pkg.type!=='module'||Object.keys(pkg.dependencies??{}).length||['preinstall','install','postinstall','prepare'].some(x=>pkg.scripts?.[x]))throw new Error('PACKAGE_CONTRACT');
  const patch=get('cordis.patch.yml').toString(),client=get('lib/client.js').toString(),host=get('lib/index.js').toString(),locale=JSON.parse(get('locale/zh-CN.json'));
  if(!patch.includes(`name: '${pkg.name}'`)||!client.includes(`id:${JSON.stringify(pkg.name)}`)||!locale.meta.title||!locale.meta.description)throw new Error('PACKAGE_IDENTITY');
  if(!client.includes('require("react")')||client.includes('react-dom/client')||client.includes('createRoot('))throw new Error('HOST_REACT_CONTRACT');
  const manifestBytes=get('resources/manifest.json'),manifest=JSON.parse(manifestBytes);if(manifest.gates.runtime!=='passed'||!host.includes(hash(manifestBytes)))throw new Error('MANIFEST_PIN');
  for(const file of manifest.files){const packed=get('resources/'+file.path);if(packed.length!==file.size||hash(packed)!==file.sha256)throw new Error('RESOURCE_PACKAGE_MISMATCH: '+file.path);}
  verifyWritingResources(get,manifest);
  assert.equal(pkg.engines.dsh,'0.2.2-rc.1 || 0.2.2-rc.3 || 0.2.2-rc.4');
  const tiers=verifyTierResources(get,host,manifest,entries);
  const diagnosticPaths=[...entries.keys()].filter(path=>path.startsWith('package/resources/diagnostics/contest/'));
  let diagnostics;
  if(diagnosticPaths.length||host.includes('setCodingDiagnostics')){
    const expected=['package/resources/diagnostics/contest/execute_contest_wasi.py','package/resources/diagnostics/contest/runtime.json'];
    if(diagnosticPaths.length!==2||diagnosticPaths.some(path=>!expected.includes(path)))throw Error('DIAGNOSTIC_PACKAGE_INVENTORY');
    const raw=get('resources/diagnostics/contest/runtime.json'),driver=JSON.parse(raw),code=get('resources/diagnostics/contest/execute_contest_wasi.py');
    if(!host.includes(hash(raw))||driver.schemaVersion!==1||driver.kind!=='contest'||driver.files?.length!==1||driver.files[0].path!=='execute_contest_wasi.py'||driver.files[0].sha256!==hash(code))throw Error('DIAGNOSTIC_PACKAGE_PIN');
    diagnostics={files:2,manifestSha256:hash(raw),driverSha256:hash(code)};
  }
  for(const path of entries.keys())if(/(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]*)?|\.git|node_modules|\.local|\.superpowers|AGENTS\.md|MEMORY\.md|WORKPOOL\.md)(?:\/|$)/i.test(path)||path.startsWith('package/tests/')||path.startsWith('package/docs/policies/'))throw new Error('FORBIDDEN_PACKAGE_FILE');
  return {entries,report:{schemaVersion:1,status:'passed',name:pkg.name,version:pkg.version,sha256:hash(bytes),compressedBytes:bytes.length,unpackedBytes:[...entries.values()].reduce((n,x)=>n+x.length,0),resourceBytes:manifest.files.reduce((n,x)=>n+x.size,0),files:entries.size,resourceManifestSha256:hash(manifestBytes),runtimeDependencies:0,tiers,...(diagnostics?{diagnostics}:{})}};
}
function verifyWritingResources(get,manifest){
  assert.equal(manifest.writingId,CURRENT_WRITING_ID,'WRITING_PACKAGE_VERSION');
  const current=manifest.datasets.find(dataset=>dataset.id==='writing');
  const previous=manifest.writingArchives?.find(archive=>archive.writingId===writingV2Edition.id);
  assert(current&&previous&&current.count===12&&previous.count===12,'WRITING_PACKAGE_COUNT');
  for(const dataset of [current,previous])assert(manifest.files.some(file=>file.path===dataset.path&&file.kind==='dataset'),'WRITING_PACKAGE_MANIFEST');
  const sealed=get('resources/'+previous.path);
  assert.equal(hash(sealed),'c1d63c96fbef1464886dbded0f738d63950cf49cfe950dff23f268873d2eec64','WRITING_V2_ARCHIVE_CHANGED');
  const former=JSON.parse(sealed);
  const rows=JSON.parse(get('resources/'+current.path));
  assert.equal(rows.length,12,'WRITING_PACKAGE_COUNT');
  assert.equal(new Set(rows.map(row=>row.sourceId)).size,12,'WRITING_PACKAGE_ITEM_IDS');
  assert(rows.every(row=>hash(row.query)===row.querySha256),'WRITING_PACKAGE_PROMPT_HASH');
  const retiredIndex=former.findIndex(row=>row.sourceId==='ziya:13');
  assert(retiredIndex>=0);
  assert.equal(rows[retiredIndex]?.sourceId,'dsh-original:community-fund-report-01','WRITING_PACKAGE_REPLACEMENT');
  assert(rows.every(row=>row.sourceId!=='ziya:13'),'WRITING_RETIRED_QUESTION_IN_CURRENT');
  assert.deepEqual(rows.filter((_,index)=>index!==retiredIndex),former.filter((_,index)=>index!==retiredIndex),'WRITING_PACKAGE_UNCHANGED_ITEMS');
  assert.equal(hash(get('resources/protocols/rubric-writing-v1.json')),'b0f5de242e4848f28e7e6238560a43a11c597cfc8ab35d4d722fb1d186b69c06','WRITING_RUBRIC_CHANGED');
}
export function verifyTierResources(get,host,manifest,entries){
  const raw=get('resources/protocol-registry.json'),catalog=JSON.parse(raw),catalogSha256=hash(raw);
  if(!host.includes(catalogSha256))throw Error('CATALOG_PIN');
  if(catalog.localOnlyBundles!==undefined)return verifyLocalArchiveCatalog(catalog,get,manifest,entries,catalogSha256);
  const original=projectVerifiedScoringRevisions(catalog,get);
  verifyFiveV3(original,get);const previous=fiveV3Projection(original);
  const answerCorrection=catalog.bundles.find(b=>b.id==='task-five-v3-r2');if(answerCorrection&&!host.includes(answerCorrection.grading.toolAnswerCorrectionManifest))throw Error('ANSWER_CORRECTION_WORKER_PIN');
  const baseWritingId=generalWritingRef(manifest.writingId);
  if(catalog.schemaVersion!==1||fiveV2Projection(previous).entries.length!==5||catalog.legacyRefs.generalId!==manifest.generalId||catalog.legacyRefs.writingId!==baseWritingId||catalog.legacyRefs.resourceVersion!==manifest.resourceVersion)throw Error('TIER_CATALOG_CONTRACT');
  for(const [tier,count] of [['legacy',905],['light',120],['deep',400]]){const row=fiveV2Projection(previous).entries.find(e=>e.refs.resourceVersion!=='task-five-v1'&&e.general.tier===tier);if(!row?.allowNewRuns||row.questionCount!==count||row.general.domains.length!==4||row.general.domains.some(d=>d.weight!==.25)||row.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==count)throw Error('TIER_ADMISSION_CONTRACT');}
  const five=catalog.entries.filter(e=>e.refs.resourceVersion==='task-five-v1'),bundleFive=catalog.bundles.find(b=>b.id==='task-five-v1');
  if(five.length!==2||!bundleFive||five.some(e=>e.allowNewRuns!==bundleFive.runtimePassed))throw Error('TIER_ADMISSION_CONTRACT');
  if(bundleFive.runtimePassed)assertFiveAdmission(original,JSON.parse(get('resources/task-five-admission.json')));
  for(const [tier,count] of [['light',100],['deep',350]]){const row=five.find(e=>e.general.tier===tier);if(!row||row.refs.generalId!=='general-task-five-v1-'+tier||row.general.schema!=='task-five-v1'||row.questionCount!==count||row.general.domains.length!==5||new Set(row.general.domains.map(d=>d.id)).size!==5||row.general.domains.some(d=>!['knowledge','reading','instructions','coding','tools'].includes(d.id)||d.weight!==.2)||row.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==count)throw Error('FIVE_CAPABILITY_CONTRACT');}
  verifyFiveV2(original,get);
  for(const bundle of catalog.bundles){if(!bundle.runtimePassed&&!['task-five-v1','task-five-v2','task-five-v3','task-five-v3-r3'].includes(bundle.id))throw Error('TIER_RUNTIME_PENDING');for(const file of bundle.files){const bytes=get('resources/'+file.path);if(bytes.length!==file.size||hash(bytes)!==file.sha256)throw Error('TIER_RESOURCE_PACKAGE_MISMATCH: '+file.path);}}
  return {catalogSha256,writingId:manifest.writingId,protocols:catalog.entries.map(e=>({refs:e.refs,tier:e.general.tier,count:e.questionCount})),bundles:catalog.bundles.map(b=>({id:b.id,files:b.files.length,questionSha256:hash(get('resources/'+b.questionPath))}))};
}
function verifyLocalArchiveCatalog(catalog,get,manifest,entries,catalogSha256){
  assert.equal(catalog.schemaVersion,1);
  assert.deepEqual(catalog.legacyRefs,{generalId:manifest.generalId,writingId:LEGACY_WRITING_ID,resourceVersion:manifest.resourceVersion});
  assert.equal(manifest.writingId,CURRENT_WRITING_ID);
  const localOnly=new Set(catalog.localOnlyBundles);
  assert(localOnly.size>0 && localOnly.size===catalog.localOnlyBundles.length);
  const bundles=new Map(catalog.bundles.map(bundle=>[bundle.id,bundle]));
  assert.equal(bundles.size,catalog.bundles.length);
  assert([...localOnly].every(id=>bundles.has(id)));
  const current=generalReleases.filter(release=>release.current);
  const active=catalog.entries.filter(entry=>entry.allowNewRuns&&entry.bundleId!=='legacy');
  assert.equal(active.length,current.length);
  const activeQuestions=new Map();
  for(const bundle of catalog.bundles){
    const files=new Map(bundle.files.map(file=>[file.path,file]));
    assert.equal(files.size,bundle.files.length);
    assert(files.has(bundle.questionPath));
    assert(bundle.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.size)&&file.size>=0));
    if(localOnly.has(bundle.id)){
      assert(!entries.has('package/resources/'+bundle.questionPath),'ARCHIVED_QUESTION_PAYLOAD_PRESENT');
      assert(catalog.entries.filter(entry=>entry.bundleId===bundle.id).every(entry=>!entry.allowNewRuns));
      continue;
    }
    assert(bundle.runtimePassed);
    for(const file of bundle.files){
      const data=get('resources/'+file.path);
      assert(data.length===file.size&&hash(data)===file.sha256,'TIER_RESOURCE_PACKAGE_MISMATCH: '+file.path);
    }
    activeQuestions.set(bundle.id,JSON.parse(get('resources/'+bundle.questionPath)));
  }
  assert.deepEqual(new Set(activeQuestions.keys()),new Set(current.map(release=>release.resourceVersion)));
  for(const questions of activeQuestions.values())assert.equal(questions.length,348);
  const seen=new Set();
  for(const entry of catalog.entries){
    const {refs,general}=entry;
    const key=JSON.stringify([refs.generalId,refs.writingId,refs.resourceVersion]);
    assert(!seen.has(key));seen.add(key);
    assert(entry.bundleId==='legacy'||bundles.has(entry.bundleId));
    validateGeneralDefinition(general);
    assert.equal(entry.questionCount,general.domains.reduce((sum,domain)=>sum+domain.itemIds.length,0));
  }
  const selected=new Map();
  for(const release of current){
    const entry=active.find(item=>item.refs.generalId===release.generalId && item.refs.resourceVersion===release.resourceVersion);
    assert(entry&&entry.bundleId===release.resourceVersion&&entry.refs.writingId===generalWritingRef(manifest.writingId));
    assert.equal(entry.general.schema,release.schema);
    assert.equal(entry.general.tier,release.tier);
    assert.equal(entry.questionCount,release.tier==='light'?62:348);
    const ids=new Set(entry.general.domains.flatMap(domain=>domain.itemIds));
    const questions=activeQuestions.get(entry.bundleId);
    validateGeneralDefinition(entry.general,questions.filter(question=>ids.has(question.id)));
    selected.set(release.tier,{entry,ids,questions});
  }
  const light=selected.get('light'),deep=selected.get('deep');
  assert.equal(deep.entry.general.parentGeneralId,light.entry.refs.generalId);
  assert([...light.ids].every(id=>deep.ids.has(id)));
  const deepById=new Map(deep.questions.map(question=>[question.id,question]));
  for(const question of light.questions.filter(question=>light.ids.has(question.id)))assert.deepEqual(question,deepById.get(question.id));
  const attribution=JSON.parse(get('resources/licenses/benchmark-sources/selected-sources.json'));
  const originals=deep.questions.filter(question=>/^(coding|knowledge)\/model-eval-original-v1\//.test(question.id));
  assert.equal(originals.length,98);
  assert.equal(originals.filter(question=>question.id.startsWith('coding/')).length,70);
  assert.equal(originals.filter(question=>light.ids.has(question.id)).length,14);
  assert.equal(attribution.sources['model-eval-original-v1'].items.length,98);
  assert.equal(attribution.sources['mmlu-pro'].items.length,52);
  assert(attribution.sources['mmlu-pro'].items.every(item=>!item.upstreamSourceTag?.startsWith('stemez-')));
  assert(!attribution.sources['code-contests-test']);
  const questionPaths=[...entries.keys()].filter(path=>/^package\/resources\/suites\/.+\/(?:questions|adapted-questions)\.json$/.test(path));
  assert.deepEqual(questionPaths.sort(),[...activeQuestions.keys()].map(id=>'package/resources/'+bundles.get(id).questionPath).sort());
  for(const [path,bytes] of entries){
    if(path.startsWith('package/resources/suites/')&&path.endsWith('.json')){
      assert(!bytes.includes('coding/code-contests-test/')&&!bytes.includes('stemez-'),'RESTRICTED_SOURCE_PAYLOAD: '+path);
    }
  }
  return {catalogSha256,writingId:manifest.writingId,archivedLocalBundles:[...localOnly],originalQuestions:originals.length,
    protocols:active.map(entry=>({refs:entry.refs,tier:entry.general.tier,count:entry.questionCount,definitionHash:entry.general.definitionHash}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.stdout.write(JSON.stringify(verifyPackage(process.argv[2]).report,null,2)+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
