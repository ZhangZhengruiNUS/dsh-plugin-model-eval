import {createHash} from 'node:crypto';import type {ResolvedProtocolSet,Question,Track} from '../contracts.ts';import {PROBE_MANIFEST,TIER_PROBE_MANIFESTS} from './probe-manifest.ts';import {identityHash} from '../evaluation/protocol-identity.ts';
import {FIVE_PROBE_MANIFESTS} from './five-probe-manifest.ts';
import {generalWritingRef} from '../evaluation/writing-edition.ts';
export function selectProbeQuestions(p:ResolvedProtocolSet,tracks:readonly Track[]):readonly Question[]{
  // The pinned samples are retained Ziya prompts; source and prompt hashes are still checked below.
  const manifest=[PROBE_MANIFEST,...TIER_PROBE_MANIFESTS,...FIVE_PROBE_MANIFESTS].find(m=>p.generalId===m.generalId&&generalWritingRef(p.writingId)===m.writingId&&p.resourceVersion===m.resourceVersion);
  if(!manifest)throw Error('PROBE_PROTOCOL_CHANGED');
  return manifest.items.filter(x=>tracks.includes(x.datasetId==='writing'?'writing':'general')).map(x=>{const q=p.items.find(q=>q.id===x.id);if(!q||q.sourceHash!==x.sourceHash||createHash('sha256').update(JSON.stringify(q.prompt)).digest('hex')!==x.promptHash||'questionHash' in x&&(identityHash(q)!==x.questionHash||identityHash(p.compatibility[q.id])!==x.compatibilityHash))throw Error('PROBE_SOURCE_CHANGED');return q;});
}
