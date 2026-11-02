/** Pinned LongBench selection adaptation: explicit final line, no model judge. */
export function extractReadingAnswer(text:string):{answer?:'A'|'B'|'C'|'D';reason:string} {
  if(typeof text!=='string')return {reason:'invalid-response-type'};
  text=text.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think\s*>|$)/gi,'');
  const unwrap=(line:string)=>line.startsWith('**')&&line.endsWith('**')?line.slice(2,-2).trim():line;
  const marker=/^The correct answer is\s*\(([A-D])\)\s*\.?$/i;
  const final=unwrap(text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).at(-1)??'');
  if(!marker.test(final))return {reason:'missing-final-answer-line'};
  const answers:string[]=[];let fence:{char:string;length:number}|undefined,finalIsTopLevel=false;
  for(let line of text.split(/\r?\n/)){
    line=line.trim();if(!line)continue;finalIsTopLevel=false;
    const boundary=/^(`{3,}|~{3,})(.*)$/.exec(line);
    if(fence){if(boundary&&boundary[1]![0]===fence.char&&boundary[1]!.length>=fence.length&&!boundary[2]!.trim())fence=undefined;continue;}
    if(boundary&&!(boundary[1]![0]==='`'&&boundary[2]!.includes('`'))){fence={char:boundary[1]![0]!,length:boundary[1]!.length};continue;}
    const match=marker.exec(unwrap(line));if(match){answers.push(match[1]!.toUpperCase());finalIsTopLevel=true;}
  }
  if(!finalIsTopLevel||!answers.length)return {reason:'missing-explicit-answer'};
  if(new Set(answers).size!==1)return {reason:'conflicting-explicit-answers'};
  return {answer:answers[0] as 'A'|'B'|'C'|'D',reason:'parsed'};
}
