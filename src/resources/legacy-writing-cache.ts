import {join} from 'node:path';
import {readCatalogFile,bytesHash} from './catalog.ts';
import {writingQuestions} from '../evaluation/protocols.ts';
import {LEGACY_PROTOCOL_REFS} from '../evaluation/definitions.ts';

export const PREVIOUS_WRITING_MANIFEST_SHA256='8b510ec7a2f04543c2fad279d44ee562186de99e92a74f4a1d8fba937f1be16b';
const PREVIOUS_WRITING_DATA_SHA256='bfc98addf418e3a4bb4664fdfacc50d2dd744ddeab5df241b2de7e481d8e75d4';
export const previousWritingCache=(root:string)=>join(root,'resources',LEGACY_PROTOCOL_REFS.resourceVersion+'-'+PREVIOUS_WRITING_MANIFEST_SHA256.slice(0,12));

/** Only an exact previously installed local copy can supply retired prompts. */
export async function readPreviousWritingQuestions(root:string){
  try{
    const bytes=await readCatalogFile(previousWritingCache(root),'protocols/writing.json');
    if(bytesHash(bytes)===PREVIOUS_WRITING_DATA_SHA256)return writingQuestions(JSON.parse(bytes.toString('utf8')));
  }catch{/* A missing, linked or damaged cache cannot provide retired prompts. */}
  return undefined;
}
