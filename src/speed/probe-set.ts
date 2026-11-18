import {createHash} from 'node:crypto';import type {ResolvedProtocolSet,Question,Track} from '../contracts.ts';import {PROBE_MANIFEST,TIER_PROBE_MANIFESTS} from './probe-manifest.ts';import {identityHash} from '../evaluation/protocol-identity.ts';
import {FIVE_PROBE_MANIFESTS} from './five-probe-manifest.ts';
import {CURRENT_WRITING_ID,generalWritingRef} from '../evaluation/writing-edition.ts';

const communityReportProbe={
  id:'writing/dsh-original:community-fund-report-01',
  datasetId:'writing',
  sourceHash:'22fd0437a158c42ff0539e90fb79100e6038a584d90325737195359a577ae8ba',
  promptHash:'3d5e38c48b31abd5f5ac2ffc81a149a436503faea7561adcecbe2cc37e8ec1ca',
};
export function selectProbeQuestions(p:ResolvedProtocolSet,tracks:readonly Track[]):readonly Question[]{
  const manifest=[PROBE_MANIFEST,...TIER_PROBE_MANIFESTS,...FIVE_PROBE_MANIFESTS].find(m=>p.generalId===m.generalId&&generalWritingRef(p.writingId)===m.writingId&&p.resourceVersion===m.resourceVersion);
  if(!manifest)throw Error('PROBE_PROTOCOL_CHANGED');
  return manifest.items.filter(x=>tracks.includes(x.datasetId==='writing'?'writing':'general')).map(base=>{
    const probe=p.writingId===CURRENT_WRITING_ID&&base.id==='writing/ziya:13'?communityReportProbe:base;
    const question=p.items.find(entry=>entry.id===probe.id);
    if(!question||question.sourceHash!==probe.sourceHash||createHash('sha256').update(JSON.stringify(question.prompt)).digest('hex')!==probe.promptHash||
      'questionHash' in probe&&(identityHash(question)!==probe.questionHash||identityHash(p.compatibility[question.id])!==probe.compatibilityHash)){
      throw Error('PROBE_SOURCE_CHANGED');
    }
    return question;
  });
}
