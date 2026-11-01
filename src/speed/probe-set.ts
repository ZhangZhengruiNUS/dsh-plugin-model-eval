import {createHash} from 'node:crypto';import type {ResolvedProtocolSet,Question,Track} from '../contracts.ts';import {PROBE_MANIFEST,TIER_PROBE_MANIFESTS} from './probe-manifest.ts';import {identityHash} from '../evaluation/protocol-identity.ts';
export function selectProbeQuestions(p:ResolvedProtocolSet,tracks:readonly Track[]):readonly Question[]{
  const manifest=[PROBE_MANIFEST,...TIER_PROBE_MANIFESTS].find(m=>p.generalId===m.generalId&&p.writingId===m.writingId&&p.resourceVersion===m.resourceVersion);
  if(!manifest)throw Error('PROBE_PROTOCOL_CHANGED');
  return manifest.items.filter(x=>tracks.includes(x.datasetId==='writing'?'writing':'general')).map(x=>{const q=p.items.find(q=>q.id===x.id);if(!q||q.sourceHash!==x.sourceHash||createHash('sha256').update(JSON.stringify(q.prompt)).digest('hex')!==x.promptHash||'questionHash' in x&&(identityHash(q)!==x.questionHash||identityHash(p.compatibility[q.id])!==x.compatibilityHash))throw Error('PROBE_SOURCE_CHANGED');return q;});
}
