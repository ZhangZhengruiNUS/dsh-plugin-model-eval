import type {JsonValue,TargetSnapshot} from '../contracts.ts';
import {fingerprintTarget} from './identity.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
/** Evidence of the request and stable host settings source, not a claim about hidden server state. */
export function reuseTargetBinding(target:TargetSnapshot):{hash:string;evidence:JsonValue}|undefined{
  try{
    const requestHash=fingerprintTarget(target),origin=target.origin;
    if(!origin?.settingsNs||!Number.isSafeInteger(origin.settingsRevision)||origin.settingsRevision!<0||target.routeTarget.state!=='known'||typeof target.routeTarget.value!=='string'||Object.values(target.controls).some(p=>p.state==='unknown'))return undefined;
    const route=new URL(target.routeTarget.value);
    if(!['http:','https:'].includes(route.protocol)||route.username||route.password||route.search||route.hash)return undefined;
    // Process UUID and epoch detect in-flight mutations, but do not identify a persisted deployment.
    const evidence:JsonValue={version:'reuse-target-v1',requestHash,settingsNs:origin.settingsNs,settingsRevision:origin.settingsRevision!};
    return {hash:identityHash(evidence),evidence};
  }catch{return undefined;}
}
