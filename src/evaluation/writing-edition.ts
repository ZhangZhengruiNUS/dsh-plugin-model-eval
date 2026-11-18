import type {PublicEvaluationRelease} from './current-edition.ts';

interface WritingEdition extends Omit<PublicEvaluationRelease,'version'> {
  id: string;
  questionCount: number;
  version?: string;
}

const legacyWritingEdition: WritingEdition = {id:'work-writing-12-v1',questionCount:12,current:false};
export const writingV2Edition = {id:'work-writing-12-v2',questionCount:12,version:'1.0',current:false} as const;
export const currentWritingEdition = {id:'work-writing-12-v3',questionCount:12,version:'1.1',current:true} as const;
const writingEditions: readonly WritingEdition[] = [legacyWritingEdition,writingV2Edition,currentWritingEdition];
export const LEGACY_WRITING_ID=legacyWritingEdition.id;
export const CURRENT_WRITING_ID=currentWritingEdition.id;

export function writingEditionFor(id:string|undefined):WritingEdition|undefined {
  return writingEditions.find(edition=>edition.id===id);
}

/** A writing revision does not change the identity of the general track or its runtime. */
export function generalWritingRef(id:string):string {
  return writingEditionFor(id)?LEGACY_WRITING_ID:id;
}

export function writingEditionName(id:string|undefined, full=true):string|undefined {
  const edition=writingEditionFor(id);
  if(!edition)return undefined;
  const version=edition.version??'旧版';
  return full?(edition.version?'中文写作 '+version:'中文写作 · '+version):version;
}
