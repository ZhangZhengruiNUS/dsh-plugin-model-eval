import {arch,platform,cpus} from 'node:os';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {speedClock,type SpeedClock} from '../speed/clock.ts';
export interface LocalCalibration {version:1;machineKey:string;runtimeHash:string;measuredAt:string;durationsMs:number[];complete:boolean;mappingValidated:false}
export const localMachineKey=(runtimeHash:string)=>identityHash({runtimeHash,platform:platform(),arch:arch(),cpus:cpus().map(c=>c.model),node:process.versions.node});
export async function measureLocalCalibration(input:{machineKey:string;runtimeHash:string;clock?:SpeedClock;fixtures:readonly ((signal:AbortSignal)=>Promise<void>)[];signal?:AbortSignal}):Promise<LocalCalibration>{
 const clock=input.clock??speedClock,controller=new AbortController(),start=clock.monotonicMs(),durationsMs:number[]=[];
 const abort=()=>controller.abort();input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
 const cancel=clock.schedule(5000,abort);let complete=true;
 try {for(const fixture of input.fixtures.slice(0,3)){if(controller.signal.aborted||clock.monotonicMs()-start>=5000){complete=false;break;}
   const begin=clock.monotonicMs();try{await fixture(controller.signal);}catch{complete=false;break;}
   if(controller.signal.aborted||clock.monotonicMs()-start>=5000){complete=false;break;}durationsMs.push(Math.max(0,clock.monotonicMs()-begin));
  }
  return {version:1,machineKey:input.machineKey,runtimeHash:input.runtimeHash,measuredAt:clock.now(),durationsMs,complete:complete&&durationsMs.length>0,mappingValidated:false};
 }finally{cancel();input.signal?.removeEventListener('abort',abort);}
}
