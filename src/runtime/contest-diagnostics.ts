const prefix = 'DSH_DIAG_V1 ';
const causes = ['driver-deadline','wasi-epoch','fuel','guest-case-output','guest-total-output','unknown'] as const;
type DriverCause = typeof causes[number];

export type DriverTrace =
  | {status:'missing'|'invalid'}
  | {status:'partial'; startupMs:number; readyObservedMs:number}
  | {status:'complete'; startupMs:number; readyObservedMs:number; caseMs:number; completedCases:number; cause?:DriverCause};

export interface ContestDiagnostics {
  verifyMs?: number;
  prepareMs?: number;
  childMs?: number;
  cleanupMs?: number;
  matchedCases: number;
  hostTrigger?: 'setup-deadline'|'process-deadline'|'post-run-deadline'|'host-output'|'cancelled'|'mismatch'|'invalid-frame'|'invalid-or-missing-terminal';
  driver: DriverTrace;
}

function count(value:unknown, max:number): value is number {
  return typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=max;
}

/** The pipe is always drained. Diagnostic data is capped and never sent to the verdict parser. */
export class DriverDiagnostics {
  private data = Buffer.alloc(0);
  private overflow = false;
  private firstLineMs: number|undefined;

  push(chunk:Buffer, elapsedMs:number):void {
    if(this.overflow) return;
    if(this.data.length+chunk.length>1024){
      this.overflow=true;
      this.data=Buffer.alloc(0);
      return;
    }
    this.data=Buffer.concat([this.data,chunk]);
    if(this.firstLineMs===undefined&&this.data.includes(10)) this.firstLineMs=elapsedMs;
  }

  finish(maxCases:number, matchedCases:number):DriverTrace {
    if(this.overflow) return {status:'invalid'};
    if(!this.data.length) return {status:'missing'};
    const raw=this.data.toString('utf8');
    if(!raw.endsWith('\n')||this.firstLineMs===undefined) return {status:'invalid'};
    const lines=raw.slice(0,-1).split('\n');
    if(lines.length>2||lines.some(line=>!line.startsWith(prefix))) return {status:'invalid'};
    try{
      const [start,end]=lines.map(line=>JSON.parse(line.slice(prefix.length)));
      if(!start||Object.keys(start).sort().join(',')!=='phase,startupMs'||start.phase!=='ready'||!count(start.startupMs,600000)) return {status:'invalid'};
      const ready={startupMs:start.startupMs,readyObservedMs:this.firstLineMs};
      if(lines.length===1) return {status:'partial',...ready};
      if(!end||Object.keys(end).sort().join(',')!=='caseMs,cause,completedCases,phase'||end.phase!=='end'||!count(end.caseMs,600000)||!count(end.completedCases,maxCases)||end.completedCases<matchedCases) return {status:'invalid'};
      if(end.cause!==null&&!causes.includes(end.cause)) return {status:'invalid'};
      return {status:'complete',...ready,caseMs:end.caseMs,completedCases:end.completedCases,...(end.cause===null?{}:{cause:end.cause})};
    }catch{return {status:'invalid'};}
  }
}
