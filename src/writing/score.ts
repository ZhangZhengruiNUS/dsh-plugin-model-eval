import type {WritingDimensions} from '../contracts.ts';
export const DIMENSIONS=['faithfulness','logic','coverage','concision','naturalness'] as const;
export function scoreWritingDimensions(scores:WritingDimensions):number {
  if(!scores||typeof scores!=='object'||Object.keys(scores).length!==5||DIMENSIONS.some(k=>!Number.isInteger(scores[k])||scores[k]<0||scores[k]>4))throw new Error('INVALID_WRITING_SCORE');
  return DIMENSIONS.reduce((n,k)=>n+scores[k],0)*5;
}
