import {resolve,join} from 'node:path';
import type {JsonValue,ProtocolRefs,Question,Track} from '../contracts.ts';
import type {ProtocolDescriptor,ProtocolRegistry,ResolvedProtocolSet} from './tier-contracts.ts';
import {readProtocolCatalog,readCatalogFile,verifyBundle,bytesHash,readBundleCache} from '../resources/catalog.ts';
import {usesContestWallSafety} from './five-schema.ts';
import {loadProtocolSet,readResourceManifest,writingQuestions} from './protocols.ts';
import {identityHash,protocolKey,questionCompatibility} from './protocol-identity.ts';
import {CONTEST_WALL_SAFETY_ID,CONTEST_WALL_SAFETY_LIMITS} from './contest-budget.ts';
import {CONTEST_DIAGNOSTIC_SHA256} from '../runtime/contest-diagnostic-pin.ts';
import {RUNTIME_PINS} from '../runtime/pins.ts';
import {validateGeneralDefinition} from './definitions.ts';
import {CURRENT_WRITING_ID,generalWritingRef,LEGACY_WRITING_ID,writingEditionFor,writingV2Edition} from './writing-edition.ts';
export async function createProtocolRegistry(packageRoot:string,previousWriting?:()=>Promise<readonly Question[]|undefined>,localRoot?:()=>string|undefined):Promise<ProtocolRegistry> {
  packageRoot=resolve(packageRoot);
  const catalog=await readProtocolCatalog(packageRoot);
  const descriptor=(entry:typeof catalog.entries[number]):ProtocolDescriptor=>{
    const {bundleId,...value}=entry;return structuredClone(value);
  };
  const resources=join(packageRoot,'resources');
  async function packagedWriting(writingId:string){
    const manifest=await readResourceManifest(resources);
    if(manifest.writingId!==CURRENT_WRITING_ID)throw Error('WRITING_EDITION_MISMATCH');
    const dataset=writingId===manifest.writingId?manifest.datasets.find(d=>d.id==='writing')
      :manifest.writingArchives?.find(d=>d.writingId===writingId);
    if(!dataset)throw Error(writingId===manifest.writingId?'WRITING_EDITION_MISMATCH':'ARCHIVED_WRITING_UNAVAILABLE');
    const file=manifest.files.find(f=>f.path===dataset.path&&f.kind!=='runtime');
    if(!file||dataset.count!==writingEditionFor(writingId)?.questionCount)throw Error('WRITING_EDITION_MISMATCH');
    const bytes=await readCatalogFile(resources,file.path);
    if(bytes.length!==file.size||bytesHash(bytes)!==file.sha256)throw Error('RESOURCE_HASH_MISMATCH');
    const rows=JSON.parse(bytes.toString('utf8'));
    if(!Array.isArray(rows)||rows.length!==dataset.count)throw Error('RESOURCE_COUNT_MISMATCH');
    return writingQuestions(rows);
  }
  async function resolveProtocol(refs:ProtocolRefs,usage:'run'|'advisor'):Promise<ResolvedProtocolSet>{
    // Recheck the pinned catalog on every resolution rather than trust a mutable file cache.
    await readProtocolCatalog(packageRoot);
    const baseRefs={...refs,writingId:generalWritingRef(refs.writingId)};
    const entry=catalog.entries.find(e=>protocolKey(e.refs)===protocolKey(baseRefs));if(!entry)throw Error('UNKNOWN_PROTOCOL');
    // Advice needs the exact questions and identities, but never executes a scorer.
    const readOnly=usage==='advisor'&&entry.bundleId!=='legacy';
    const legacy=readOnly?undefined:await loadProtocolSet(resources);
    if(legacy&&legacy.writingId!==CURRENT_WRITING_ID)throw Error('WRITING_EDITION_MISMATCH');
    let writing:readonly Question[];
    if(refs.writingId===CURRENT_WRITING_ID){
      writing=legacy?legacy.items.filter(question=>question.track==='writing'):await packagedWriting(CURRENT_WRITING_ID);
    }else if(refs.writingId===LEGACY_WRITING_ID){
      writing=(await previousWriting?.())??(await packagedWriting(writingV2Edition.id)).filter(question=>question.sourceId.startsWith('ziya:'));
    }else{
      writing=await packagedWriting(refs.writingId);
    }
    let items:readonly Question[],grading:JsonValue,runtime:JsonValue;
    if(entry.bundleId==='legacy'){
      if(!legacy||protocolKey(baseRefs)!==protocolKey(catalog.legacyRefs))throw Error('UNKNOWN_PROTOCOL');
      items=legacy.items.filter(q=>q.track==='general');grading={version:legacy.generalId};runtime={pins:RUNTIME_PINS,wallMs:30000,memoryBytes:536870912,computeBudget:200000000000};
    }else{
      const bundle=catalog.bundles.find(b=>b.id===entry.bundleId)!;
      const localOnly=catalog.localOnlyBundles?.includes(bundle.id)===true;
      if(!readOnly&&!localOnly)await verifyBundle(packageRoot,bundle);
      if(bundle.resourceVersion!==refs.resourceVersion||entry.allowNewRuns&&!bundle.runtimePassed)throw Error('PROTOCOL_NOT_VERIFIED');
      let bytes:Buffer;
      try {
        const questionRoot=localOnly?(await readBundleCache(localRoot?.(),bundle)).path:resources;
        bytes=await readCatalogFile(questionRoot,bundle.questionPath);
      }
      catch(error) {
        if(localOnly){
          const missing=(error as NodeJS.ErrnoException).code==='ENOENT'||(error as Error).message==='ARCHIVED_GENERAL_UNAVAILABLE';
          throw Object.assign(new Error(missing?'ARCHIVED_GENERAL_UNAVAILABLE':'ARCHIVED_GENERAL_CORRUPT'),
            {code:missing?'ARCHIVED_GENERAL_UNAVAILABLE':'ARCHIVED_GENERAL_CORRUPT'});
        }
        throw error;
      }
      {
        const question=bundle.files.find(f=>f.path===bundle.questionPath)!;
        if(bytes.length!==question.size||bytesHash(bytes)!==question.sha256){
          if(localOnly)throw Object.assign(new Error('ARCHIVED_GENERAL_CORRUPT'),{code:'ARCHIVED_GENERAL_CORRUPT'});
          throw Error('RESOURCE_HASH_MISMATCH');
        }
      }
      const all=JSON.parse(bytes.toString('utf8')) as Question[];
      const required=new Set(entry.general.domains.flatMap(d=>d.itemIds));
      if(!Array.isArray(all)||new Set(all.map(q=>q.id)).size!==all.length||all.some(q=>q.track!=='general'||!q.prompt?.length)||[...required].some(id=>!all.some(q=>q.id===id)))throw Error('PROTOCOL_QUESTION_MISMATCH');
      items=all.filter(q=>required.has(q.id));grading=bundle.grading;runtime=bundle.runtime;
    }
    if(items.length!==entry.questionCount||refs.writingId!==LEGACY_WRITING_ID&&writing.length!==writingEditionFor(refs.writingId)?.questionCount)throw Error('PROTOCOL_QUESTION_MISMATCH');
    validateGeneralDefinition(entry.general,items);
    items=[...items,...writing];
    const resolvedDescriptor={...descriptor(entry),refs:{...refs}};
    const contestPolicy=usesContestWallSafety(entry.general.schema)?CONTEST_WALL_SAFETY_ID:undefined;
    if(!contestPolicy)return {...refs,items,descriptor:resolvedDescriptor,compatibility:Object.fromEntries(items.map(q=>[q.id,questionCompatibility(q,grading,runtime)]))};
    if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))throw Error('CONTEST_POLICY_MISMATCH');
    const {contestWallSafety,...priorRuntime}=runtime;
    if(identityHash(contestWallSafety??null)!==identityHash({id:contestPolicy,wallMs:CONTEST_WALL_SAFETY_LIMITS.wallMs,diagnosticManifestSha256:CONTEST_DIAGNOSTIC_SHA256}))throw Error('CONTEST_POLICY_MISMATCH');
    return {...refs,items,contestPolicy,descriptor:resolvedDescriptor,compatibility:Object.fromEntries(items.map(q=>[q.id,
      questionCompatibility(q,grading,q.datasetId==='code-contests-selected'?runtime:priorRuntime)]))};
  }
  function newRunRefs(generalId:string,tracks?:readonly Track[]){
    const entry=catalog.entries.find(e=>e.refs.generalId===generalId);if(!entry)throw Error('UNKNOWN_PROTOCOL');
    if(!entry.allowNewRuns)throw Error('PROTOCOL_NOT_VERIFIED');
    return tracks?.includes('writing')?{...entry.refs,writingId:CURRENT_WRITING_ID}:entry.refs;
  }
  return {list:()=>catalog.entries.map(descriptor),
    resolve:refs=>resolveProtocol(refs,'run'),
    resolveForRead:refs=>resolveProtocol(refs,'advisor'),
    async forNewRun(id,tracks){return resolveProtocol(newRunRefs(id,tracks),'run');},
    async forTimeAdvisor(id,tracks){return resolveProtocol(newRunRefs(id,tracks),'advisor');},
  };
}
