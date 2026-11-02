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
  const pkg=JSON.parse(get('package.json'));if(pkg.name!=='@aico/dsh-plugin-model-eval'||pkg.type!=='module'||Object.keys(pkg.dependencies??{}).length||['preinstall','install','postinstall','prepare'].some(x=>pkg.scripts?.[x]))throw new Error('PACKAGE_CONTRACT');
  const patch=get('cordis.patch.yml').toString(),client=get('lib/client.js').toString(),host=get('lib/index.js').toString(),locale=JSON.parse(get('locale/zh-CN.json'));
  if(!patch.includes(`name: '${pkg.name}'`)||!client.includes(`id:${JSON.stringify(pkg.name)}`)||!locale.meta.title||!locale.meta.description)throw new Error('PACKAGE_IDENTITY');
  if(!client.includes('require("react")')||client.includes('react-dom/client')||client.includes('createRoot('))throw new Error('HOST_REACT_CONTRACT');
  const manifestBytes=get('resources/manifest.json'),manifest=JSON.parse(manifestBytes);if(manifest.gates.runtime!=='passed'||!host.includes(hash(manifestBytes)))throw new Error('MANIFEST_PIN');
  for(const file of manifest.files){const packed=get('resources/'+file.path);if(packed.length!==file.size||hash(packed)!==file.sha256)throw new Error('RESOURCE_PACKAGE_MISMATCH: '+file.path);}
  const tiers=verifyTierResources(get,host,manifest);
  for(const path of entries.keys())if(/(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]*)?|\.git|node_modules|\.local|\.superpowers|AGENTS\.md|MEMORY\.md|WORKPOOL\.md)(?:\/|$)/i.test(path)||path.startsWith('package/tests/')||path.startsWith('package/docs/policies/'))throw new Error('FORBIDDEN_PACKAGE_FILE');
  return {entries,report:{schemaVersion:1,status:'passed',name:pkg.name,version:pkg.version,sha256:hash(bytes),compressedBytes:bytes.length,unpackedBytes:[...entries.values()].reduce((n,x)=>n+x.length,0),resourceBytes:manifest.files.reduce((n,x)=>n+x.size,0),files:entries.size,resourceManifestSha256:hash(manifestBytes),runtimeDependencies:0,tiers}};
}
export function verifyTierResources(get,host,manifest){
  const raw=get('resources/protocol-registry.json'),catalog=JSON.parse(raw),catalogSha256=hash(raw);
  if(!host.includes(catalogSha256))throw Error('CATALOG_PIN');
  if(catalog.schemaVersion!==1||catalog.entries.length!==5||catalog.legacyRefs.generalId!==manifest.generalId||catalog.legacyRefs.writingId!==manifest.writingId||catalog.legacyRefs.resourceVersion!==manifest.resourceVersion)throw Error('TIER_CATALOG_CONTRACT');
  for(const [tier,count] of [['legacy',905],['light',120],['deep',400]]){const row=catalog.entries.find(e=>e.refs.resourceVersion!=='task-five-v1'&&e.general.tier===tier);if(!row?.allowNewRuns||row.questionCount!==count||row.general.domains.length!==4||row.general.domains.some(d=>d.weight!==.25)||row.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==count)throw Error('TIER_ADMISSION_CONTRACT');}
  const five=catalog.entries.filter(e=>e.refs.resourceVersion==='task-five-v1'),bundleFive=catalog.bundles.find(b=>b.id==='task-five-v1');
  if(five.length!==2||!bundleFive||five.some(e=>e.allowNewRuns!==bundleFive.runtimePassed))throw Error('TIER_ADMISSION_CONTRACT');
  if(bundleFive.runtimePassed)assertFiveAdmission(catalog,JSON.parse(get('resources/task-five-admission.json')));
  for(const [tier,count] of [['light',100],['deep',350]]){const row=five.find(e=>e.general.tier===tier);if(!row||row.refs.generalId!=='general-task-five-v1-'+tier||row.general.schema!=='task-five-v1'||row.questionCount!==count||row.general.domains.length!==5||new Set(row.general.domains.map(d=>d.id)).size!==5||row.general.domains.some(d=>!['knowledge','reading','instructions','coding','tools'].includes(d.id)||d.weight!==.2)||row.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==count)throw Error('FIVE_CAPABILITY_CONTRACT');}
  for(const bundle of catalog.bundles){if(!bundle.runtimePassed&&bundle.id!=='task-five-v1')throw Error('TIER_RUNTIME_PENDING');for(const file of bundle.files){const bytes=get('resources/'+file.path);if(bytes.length!==file.size||hash(bytes)!==file.sha256)throw Error('TIER_RESOURCE_PACKAGE_MISMATCH: '+file.path);}}
  return {catalogSha256,legacyManifestUnchanged:true,protocols:catalog.entries.map(e=>({refs:e.refs,tier:e.general.tier,count:e.questionCount})),bundles:catalog.bundles.map(b=>({id:b.id,files:b.files.length,questionSha256:hash(get('resources/'+b.questionPath))}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.stdout.write(JSON.stringify(verifyPackage(process.argv[2]).report,null,2)+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
