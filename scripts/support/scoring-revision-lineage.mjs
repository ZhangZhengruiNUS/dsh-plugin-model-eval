/* Verify each admitted scoring extension before projecting to the V3 ancestor. */
import {createHash} from 'node:crypto';
import {verifyToolAnswerRevision} from './tool-answer-lineage.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
export function projectVerifiedScoringRevisions(catalog,get){
  const wallRevision='task-five-v3-r3',parentRevision='task-five-v3-r2';
  const revision=catalog.bundles.filter(b=>b.id===wallRevision),wallEntries=catalog.entries.filter(e=>e.refs.resourceVersion===wallRevision);
  if(revision.length||wallEntries.length){
    const parent=catalog.bundles.find(b=>b.id===parentRevision),[candidate]=revision;
    const runtimePassed=candidate?.runtimePassed;
    const policy={id:'wall-safety-v1',wallMs:240000,diagnosticManifestSha256:hash(get('resources/diagnostics/contest/runtime.json'))};
    if(!parent?.runtimePassed||revision.length!==1||wallEntries.length!==2||typeof runtimePassed!=='boolean'||
      JSON.stringify(candidate)!==JSON.stringify({...parent,id:wallRevision,resourceVersion:wallRevision,runtimePassed,runtime:{...parent.runtime,contestWallSafety:policy}}))
      throw Error('CONTEST_WALL_CANDIDATE_CONTRACT');
    for(const tier of ['light','deep']){
      const entry=wallEntries.find(e=>e.general.tier===tier),previous=catalog.entries.find(e=>e.refs.resourceVersion===parentRevision&&e.general.tier===tier);
      if(!entry||!previous)throw Error('CONTEST_WALL_CANDIDATE_CONTRACT');
      const {definitionHash,...general}=previous.general;
      const draft={...general,schema:wallRevision,...(tier==='deep'?{parentGeneralId:'general-'+wallRevision+'-light'}:{})};
      const hashDefinition=hash(canonical(draft));
      if(canonical(entry)!==canonical({...previous,bundleId:wallRevision,allowNewRuns:runtimePassed,refs:{...previous.refs,generalId:'general-'+wallRevision+'-'+tier,resourceVersion:wallRevision},general:{...draft,definitionHash:hashDefinition}}))
        throw Error('CONTEST_WALL_CANDIDATE_CONTRACT');
    }
  }
  const withoutWall={...catalog,entries:catalog.entries.filter(e=>e.refs.resourceVersion!==wallRevision),bundles:catalog.bundles.filter(b=>b.id!==wallRevision)};
  const withoutR2=verifyToolAnswerRevision(withoutWall,get);
  const r1='task-five-v3-r1';
  const entries=withoutR2.entries.filter(e=>e.refs.resourceVersion===r1);
  const bundles=withoutR2.bundles.filter(b=>b.id===r1);
  if(entries.length||bundles.length){
    if(entries.length!==2||bundles.length!==1||
      hash(JSON.stringify({entries,bundle:bundles[0]}))!=='33162fb1243dea6ef3aeadc045f7b203fb42a35db17954c16c714e7111f24435')
      throw Error('SCORING_REVISION_CONTRACT');
    for(const pin of bundles[0].files){
      const bytes=get('resources/'+pin.path);
      if(bytes.length!==pin.size||hash(bytes)!==pin.sha256)throw Error('SCORING_REVISION_RESOURCE_CHANGED: '+pin.path);
    }
  }
  return {...withoutR2,entries:withoutR2.entries.filter(e=>e.refs.resourceVersion!==r1),bundles:withoutR2.bundles.filter(b=>b.id!==r1)};
}
