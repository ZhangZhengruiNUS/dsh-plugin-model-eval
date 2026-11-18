import type {ProtocolRefs} from '../contracts.ts';
import type {ProtocolRegistry, ResolvedProtocolSet} from './tier-contracts.ts';
import {protocolKey} from './protocol-identity.ts';

export type ProtocolAdmission = Pick<ProtocolRegistry, 'resolve' | 'forNewRun'>;

/** One dispatch activation shares verified protocol data, never the per-run history checks. */
export function createProtocolAdmission(registry:ProtocolRegistry):ProtocolAdmission {
  const resolved=new Map<string,Promise<ResolvedProtocolSet>>();
  const newRuns=new Map<string,Promise<ResolvedProtocolSet>>();
  function once(map:Map<string,Promise<ResolvedProtocolSet>>,key:string,load:()=>Promise<ResolvedProtocolSet>){
    const current=map.get(key);
    if(current)return current;
    const pending=load().catch(error=>{
      if(map.get(key)===pending)map.delete(key);
      throw error;
    });
    map.set(key,pending);
    return pending;
  }
  return {
    resolve(refs){return once(resolved,protocolKey(refs),()=>registry.resolve(refs));},
    forNewRun(id,tracks){
      return once(newRuns,JSON.stringify([id,tracks??null]),async()=>{
        const value=await registry.forNewRun(id,tracks);
        const key=protocolKey(value.descriptor.refs);
        if(!resolved.has(key))resolved.set(key,Promise.resolve(value));
        return value;
      });
    },
  };
}

/** Pinned question metadata is enough for local views, never for dispatch admission. */
export function resolveProtocolForRead(registry:ProtocolRegistry,refs:ProtocolRefs){
  return registry.resolveForRead?registry.resolveForRead(refs):registry.resolve(refs);
}
