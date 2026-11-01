/** Only the trusted driver writes these frames; guest stdout remains opaque base64. */
type Verdict={kind:'passed'}|{kind:'failed';reason:'resource'|'timeout'|'syntax'|'assertion'}|{kind:'environment-error';code:string};
const MAX_CASE=2*1024*1024,MAX_TOTAL=16*1024*1024,MAX_LINE=Math.ceil(MAX_CASE/3)*4+128;
const invalid=():never=>{throw Error('INVALID_HOST_FRAME');};
const same=(a:string,b:string)=>{const x=a.trim().split(/\s+/u).filter(Boolean),y=b.trim().split(/\s+/u).filter(Boolean);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
export class ContestFrames {
  private buffer='';private index=0;private total=0;private terminal:Verdict|undefined;private mismatch=false;
  private readonly cases:readonly {expected:string}[];
  constructor(cases:readonly {expected:string}[]){this.cases=cases;}
  push(chunk:string):boolean {
    if(this.mismatch)return true;
    // The wire is ASCII JSON, independent of UTF-8 chunk boundaries in guest output.
    if(/[^\x00-\x7f]/u.test(chunk))invalid();
    this.buffer+=chunk;
    for(;;){
      const end=this.buffer.indexOf('\n');if(end<0)break;
      if(end>MAX_LINE)invalid();
      const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);this.accept(line);
      if(this.mismatch){this.buffer='';return true;}
    }
    if(this.buffer.length>MAX_LINE)invalid();
    return false;
  }
  private accept(line:string):void {
    if(this.terminal)invalid();
    let value:unknown;try{value=JSON.parse(line);}catch{invalid();}
    if(!value||typeof value!=='object'||Array.isArray(value))invalid();
    const f=value as Record<string,unknown>,keys=Object.keys(f).sort().join(',');
    if(keys==='case,output'){
      if(f.case!==this.index||this.index>=this.cases.length||typeof f.output!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.output))invalid();
      const bytes=Buffer.from(f.output as string,'base64');this.total+=bytes.length;
      if(bytes.length>MAX_CASE||this.total>MAX_TOTAL||bytes.toString('base64')!==f.output)invalid();
      if(!same(bytes.toString('utf8'),this.cases[this.index]!.expected)){this.mismatch=true;this.terminal={kind:'failed',reason:'assertion'};}
      this.index++;return;
    }
    if(keys==='complete'&&f.complete===true&&this.index===this.cases.length){this.terminal={kind:'passed'};return;}
    if(keys==='failure'&&['resource','timeout','syntax','assertion'].includes(f.failure as string)){this.terminal={kind:'failed',reason:f.failure as 'resource'|'timeout'|'syntax'|'assertion'};return;}
    if(keys==='environmentError'&&f.environmentError==='WASI_CONTEST_DRIVER_FAILED'){this.terminal={kind:'environment-error',code:f.environmentError};return;}
    invalid();
  }
  finish():Verdict {
    if(this.mismatch)return this.terminal!;
    // Every frame is newline-terminated. A partial EOF is a technical failure.
    if(this.buffer.length||!this.terminal)invalid();
    return this.terminal!;
  }
}
