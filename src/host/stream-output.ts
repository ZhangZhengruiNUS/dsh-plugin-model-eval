import type {DshChunk} from './adapter.ts';
import type {StreamFinishReason} from '../contracts.ts';

export function knownStreamFinishReason(kind:string):StreamFinishReason|undefined {
  switch(kind){
    case 'stop':case 'max-tokens':case 'tool-calls':case 'error':case 'aborted':return kind;
  }
}

export function chunkHasText(chunk:DshChunk):boolean {
  return chunk.type==='text-delta'&&!!chunk.text||
    chunk.type==='block-end'&&chunk.block.type==='text'&&!!chunk.block.text;
}

export function chunkHasModelOutput(chunk:DshChunk):boolean {
  if(chunk.type==='usage'){
    const {outputTokens,reasoningTokens}=chunk.usage;
    return Number.isSafeInteger(outputTokens)&&outputTokens>0||
      reasoningTokens!==undefined&&Number.isSafeInteger(reasoningTokens)&&reasoningTokens>0;
  }
  return chunk.type==='reasoning-delta'||chunk.type==='tool-call-delta'||
    chunkHasText(chunk);
}
