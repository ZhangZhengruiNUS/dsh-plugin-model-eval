/** Developer evidence only. Never infer truth from a publisher's non-AC label. */
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
interface Program {code:string;referenceIndex:number;origin:string;required?:boolean;proof?:string}
interface Source {sourceId:string;sourceRecordHash:string;raw:{python3_references:string[]}}
const correction={sourceId:'77',sourceHash:'088d479830e12cb994d0f1aa2ff5180c1c8dd2a25f807edc83bf9f04c15aa023',referenceIndex:0,codeHash:'3209245a910c9dd83f97e8f0a9887a2876b6a71bc82e483afa3d0372201acd4a',language:'PYTHON3',originalClassification:'incorrect',effectiveRole:'positive',proofVersion:'robot-factory-dsu-proof-v1',proof:'docs/evidence/tiers/reference-role-review.json'} as const;
export function classifyUpstreamReferences(source:Source,incorrect:string[]){
  const positivePrograms:Program[]=source.raw.python3_references.map((code,referenceIndex)=>({code,referenceIndex,origin:'upstream-python3'}));
  const corrected:typeof correction[]=[];
  const negativePrograms:Program[]=[];
  if(source.sourceId===correction.sourceId&&(source.sourceRecordHash!==correction.sourceHash||typeof incorrect[correction.referenceIndex]!=='string'||identityHash(incorrect[correction.referenceIndex])!==correction.codeHash))throw Error('REFERENCE_CORRECTION_MISMATCH');
  incorrect.forEach((code,referenceIndex)=>{
    if(source.sourceId===correction.sourceId&&source.sourceRecordHash===correction.sourceHash&&identityHash(code)===correction.codeHash){
      corrected.push(correction);positivePrograms.push({code,referenceIndex,origin:'reviewed-upstream-role-correction',required:true,proof:correction.proof});
    }else negativePrograms.push({code,referenceIndex,origin:'upstream-incorrect-python3'});
  });
  return {positivePrograms,negativePrograms,corrected};
}
