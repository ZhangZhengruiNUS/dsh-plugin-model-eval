/** Development-only input audits. Not shipped, and never a model-answer repair. */
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
export const ADAPTATION_VERSION='code-contests-input-audit-v1';
export interface TestCase {stdin:string;expected:string}
interface SourceTests {input:string[];output:string[]}
export interface ContestSource {sourceId:string;sourceRecordHash:string;cases:TestCase[];raw:{public_tests:SourceTests;private_tests:SourceTests;generated_tests:SourceTests}}
type Check={status:'valid'|'pending'}|{status:'invalid';reason:string};
const valid:Check={status:'valid'};
class Input {
  tokens:string[]=[];position=0;lineIndex=0;lineEnds:number[]=[];
  constructor(text:string){for(const line of text.trim().split(/\r?\n/)){this.tokens.push(...line.trim().split(/\s+/u).filter(Boolean));this.lineEnds.push(this.tokens.length);}}
  next(){const token=this.tokens[this.position++];if(token===undefined)throw Error('missing declared token');return token;}
  int(lo:number,hi:number){const s=this.next();if(!/^-?\d+$/.test(s))throw Error('non-integer token');const n=Number(s);if(!Number.isSafeInteger(n)||n<lo||n>hi)throw Error(`integer outside [${lo},${hi}]`);return n;}
  boundary(){if(this.lineEnds[this.lineIndex++]!==this.position)throw Error('declared line length mismatch');}
  end(){if(this.position!==this.tokens.length||this.lineIndex!==this.lineEnds.length)throw Error('extra tokens beyond declared input');}
}
/** Only statement-specific proved contracts may produce invalid. Unknown = pending. */
export function validateInput(sourceId:string,text:string):Check {
  if(!['0','8','19','91'].includes(sourceId))return {status:'pending'};
  try{
    const input=new Input(text);
    if(sourceId==='0'){
      const n=input.int(1,1e6),m=input.int(1,1e6);input.boundary();if(n*m>1e6)throw Error('n*m exceeds 1000000');
      const seen=new Set<string>();
      for(let i=0;i<n;i++){const title=input.next();input.boundary();if(title.length!==m)throw Error('title length differs from m');if(!/^[A-Z]+$/.test(title))throw Error('title is not uppercase Latin');if(seen.has(title))throw Error('titles are not pairwise distinct');seen.add(title);}
    }else if(sourceId==='8'){
      const n=input.int(2,100000),q=input.int(1,100000);input.boundary();
      for(let i=0;i<n;i++)input.int(-1e9,1e9);input.boundary();
      const parent=Array.from({length:n},(_,i)=>i);
      const find=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]!]!;v=parent[v]!;}return v;};
      for(let i=1;i<n;i++){const a=find(input.int(1,n)-1),b=find(input.int(1,n)-1);input.boundary();if(a===b)throw Error('edges do not form a tree');parent[a]=b;}
      for(let i=0;i<q;i++){const kind=input.int(1,2);input.int(1,n);input.int(kind===1?-1e9:1,kind===1?1e9:n);input.boundary();}
    }else{
      const maximum=sourceId==='19'?10000:100000,t=input.int(1,sourceId==='19'?1000:10000);input.boundary();let sum=0;
      for(let test=0;test<t;test++){const n=input.int(1,maximum);input.boundary();sum+=n;if(sum>maximum)throw Error('sum of n exceeds '+maximum);for(let i=0;i<n;i++)input.int(1,sourceId==='19'?1000:100000);input.boundary();}
    }
    input.end();return valid;
  }catch(error){return {status:'invalid',reason:(error as Error).message};}
}

/** Enumerate all directions; this oracle does not use any submitted/reference code. */
function coverageMinimum(values:number[]){
  if(!values.length||values.length>10||values.some(v=>!Number.isInteger(v)||v<1||v>1000))throw Error('ORACLE_INPUT_OUT_OF_BOUNDS');
  let minimum=Infinity;
  for(let mask=0;mask<2**values.length;mask++){
    let x=0,lo=0,hi=0;
    for(let i=0;i<values.length;i++){x+=((mask>>i)&1?1:-1)*values[i]!;lo=Math.min(lo,x);hi=Math.max(hi,x);}
    minimum=Math.min(minimum,hi-lo);
  }
  return {values,minimum,arrangements:2**values.length};
}
export function coverageCases(){
  const values:number[][]=[];
  function enumerate(prefix:number[],n:number){if(prefix.length===n){values.push(prefix);return;}for(let i=1;i<=4;i++)enumerate([...prefix,i],n);}
  for(let n=1;n<=4;n++)enumerate([],n);
  // Fixed formula, no run-time randomness or model-performance selection.
  for(let n=5;n<=10;n++)for(let k=0;k<12;k++)values.push(Array.from({length:n},(_,j)=>1+((k+1)*131+(j+1)*263+j*k*73)%1000));
  values.push([919,262,337,976,347,18,805]);
  const proof=values.map(coverageMinimum);
  const test={stdin:values.length+'\n'+values.map(v=>v.length+'\n'+v.join(' ')).join('\n')+'\n',expected:proof.map(p=>p.minimum).join('\n')+'\n'};
  return {test,proof,oracle:'all 2^n segment orientations, exact integer union width; n<=10',proofHash:identityHash(proof)};
}
export function sortingCases(){
  const corpora=[['Z','A'],['M','Z','A'],['ABA','AZZ','AAA','ZAA','AAZ','MAZ'],['AA','AZ','ZA','ZZ'],['AZAZ','AZZA','AAAA','ZZZZ'],['Z']];
  return corpora.map(titles=>{
    // Direct statement comparator: first differing position determines the order.
    const order=titles.map((_,i)=>i).sort((a,b)=>{
      for(let j=0;j<titles[a]!.length;j++){
        const delta=titles[a]!.charCodeAt(j)-titles[b]!.charCodeAt(j);
        if(delta)return j%2?-delta:delta;
      }return 0;
    });
    return {test:{stdin:titles.length+' '+titles[0]!.length+'\n'+titles.join('\n')+'\n',expected:order.map(i=>i+1).join(' ')+'\n'},
      oracle:'exact first-different-character ordering from statement, alternating ascending/descending per word',proofHash:identityHash({titles,order}),subcases:1};
  });
}
export function adaptContest(source:ContestSource){
  const flattened:TestCase[]=[],origins:('public'|'private'|'generated')[]=[];
  for(const origin of ['public','private','generated'] as const){const tests=source.raw[`${origin}_tests`];
    if(tests.input.length!==tests.output.length)throw Error('SOURCE_CASE_SHAPE');
    tests.input.forEach((stdin,i)=>{flattened.push({stdin,expected:tests.output[i]!});origins.push(origin);});
  }
  if(identityHash(flattened)!==identityHash(source.cases))throw Error('SOURCE_CASE_MISMATCH');
  const cases:TestCase[]=[],excluded:{sourceIndex:number;origin:string;originalHash:string;reason:string}[]=[],kept:{sourceIndex:number;caseHash:string;origin:string}[]=[];
  let pending=false;
  source.cases.forEach((original,sourceIndex)=>{
    const result=validateInput(source.sourceId,original.stdin),origin=origins[sourceIndex]!;
    if(result.status==='invalid'){
      if(origin!=='generated')throw Error('NON_GENERATED_INVALID:'+source.sourceId+':'+sourceIndex+':'+result.reason);
      excluded.push({sourceIndex,origin,originalHash:identityHash(original),reason:result.reason});
    }else{pending||=result.status==='pending';cases.push({...original});kept.push({sourceIndex,caseHash:identityHash(original),origin});}
  });
  if(!cases.length)throw Error('NO_LEGAL_ORIGINAL_TESTS');
  const added:{caseHash:string;oracle:string;proofHash:string;subcases:number}[]=[];
  if(source.sourceId==='19'){
    const extra=coverageCases();if(validateInput('19',extra.test.stdin).status!=='valid')throw Error('INVALID_ORACLE_TEST');
    cases.push(extra.test);added.push({caseHash:identityHash(extra.test),oracle:extra.oracle,proofHash:extra.proofHash,subcases:extra.proof.length});
  }
  if(source.sourceId==='0')for(const extra of sortingCases()){
    if(validateInput('0',extra.test.stdin).status!=='valid')throw Error('INVALID_ORACLE_TEST');
    cases.push(extra.test);added.push({caseHash:identityHash(extra.test),oracle:extra.oracle,proofHash:extra.proofHash,subcases:extra.subcases});
  }
  return {sourceId:source.sourceId,sourceRecordHash:source.sourceRecordHash,policy:ADAPTATION_VERSION,status:pending?'pending' as const:'audited' as const,
    originalHash:identityHash(source.cases),adaptedHash:identityHash(cases),originalCount:source.cases.length,kept,excluded,added,cases};
}
