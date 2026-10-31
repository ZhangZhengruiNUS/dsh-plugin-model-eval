export interface SpeedClock {monotonicMs():number;now():string;schedule(delayMs:number,callback:()=>void):()=>void}
export const speedClock:SpeedClock={monotonicMs:()=>performance.now(),now:()=>new Date().toISOString(),schedule(ms,fn){const timer=setTimeout(fn,Math.max(0,ms));return()=>clearTimeout(timer);}};
