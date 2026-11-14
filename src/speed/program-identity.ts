import {identityHash} from '../evaluation/protocol-identity.ts';
import type {ProbeProgramV3} from '../estimation/calibration-contracts.ts';

// Bump when prediction semantics change, even if probe prompts stay identical.
// Unversioned historic v3/v4 programs retain their original content hashes.
export const ESTIMATION_METHOD_ID='estimate-v3-first-pass-cost-v1';
export function probeProgramHash(program:Pick<ProbeProgramV3,'id'|'probes'|'methodId'>){
 return identityHash({id:program.id,probes:program.probes,...(program.methodId!==undefined?{methodId:program.methodId}:{})});
}
