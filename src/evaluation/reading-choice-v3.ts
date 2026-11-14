import {extractReadingAnswer} from './reading-answer.ts';
type Choice='A'|'B'|'C'|'D';
type Result={answer?:Choice;reason:'parsed'|'no-final-choice'|'ambiguous-choice'|'choice-text-conflict'|'invalid-options'|'invalid-response-type';formatConforming:boolean};
export function validReadingOptions(value:unknown):value is Record<Choice,string>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('')==='ABCD'&&Object.values(value).every(v=>typeof v==='string'&&v.trim().length>0);}
const prefix=/^(?:the correct answer is\s+|(?:final answer|answer)\s*:\s*|答案(?:\s*[:：]|是)\s*)/i;
const normalize=(s:string)=>s.normalize('NFKC').replace(/^\*\*([\s\S]*)\*\*$/,'$1').replace(/\s+/g,' ').trim();
function choiceLine(text:string,options:Record<Choice,string>):{answer?:Choice;conflict?:boolean}{
 const line=text.replace(prefix,''),match=/^(?:\(\s*([A-D])\s*\)|（\s*([A-D])\s*）|([A-D]))/i.exec(line);if(!match)return{};
 const answer=(match[1]??match[2]??match[3])!.toUpperCase() as Choice,raw=line.slice(match[0].length);
 if(!raw.trim()||/^[.。!！]$/.test(raw.trim()))return{answer};
 if(!/^[\s.:：—-]/.test(raw))return{};
 const rest=raw.trim().replace(/^[.:：—-]\s*/,'');
 return normalize(rest)===normalize(options[answer])?{answer}:{conflict:true};
}
/** Option text is checked against the stated letter, never against the gold answer. */
export function extractReadingChoiceV3(text:string,options:unknown):Result{
 if(typeof text!=='string')return{reason:'invalid-response-type',formatConforming:false};
 if(!validReadingOptions(options))return{reason:'invalid-options',formatConforming:false};
 const formatConforming=extractReadingAnswer(text).answer!==undefined;let fence:string|undefined,depth=0,final='',conflict=false;const answers=new Set<Choice>();
 for(const raw of text.split(/\r?\n/)){
  const trimmed=raw.trim(),boundary=/^(`{3,}|~{3,})(.*)$/.exec(trimmed);
  if(fence){const marker=boundary?.[1];if(marker&&marker[0]===fence[0]&&marker.length>=fence.length&&!boundary?.[2]?.trim())fence=undefined;continue;}
  if(!depth&&trimmed.startsWith('>'))continue;
  if(!depth&&boundary&&!(boundary[1]![0]==='`'&&boundary[2]!.includes('`'))){fence=boundary[1];continue;}
  let visible='',offset=0;for(const tag of raw.matchAll(/<think\b[^>]*>|<\/think\s*>/gi)){if(!depth)visible+=raw.slice(offset,tag.index)+' ';if(tag[0].startsWith('</'))depth=Math.max(0,depth-1);else depth++;offset=tag.index!+tag[0].length;}if(!depth)visible+=raw.slice(offset);
  let line=visible.trim();if(!line||line.startsWith('>'))continue;if(line.startsWith('**')&&line.endsWith('**'))line=line.slice(2,-2).trim();final=line;
  if(prefix.test(line)){const parsed=choiceLine(line,options);if(parsed.answer)answers.add(parsed.answer);if(parsed.conflict)conflict=true;}
 }
 if(fence||depth)return{reason:'no-final-choice',formatConforming};const parsed=choiceLine(final,options);if(parsed.conflict||conflict)return{reason:'choice-text-conflict',formatConforming};if(!parsed.answer)return{reason:'no-final-choice',formatConforming};answers.add(parsed.answer);if(answers.size>1)return{reason:'ambiguous-choice',formatConforming};return{answer:parsed.answer,reason:'parsed',formatConforming};
}
