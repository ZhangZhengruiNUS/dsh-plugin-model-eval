import type {ProtocolSet,ProtocolRegistry,ResolvedProtocolSet} from '../../src/contracts.ts';
import {legacyGeneralDefinition} from '../../src/evaluation/definitions.ts';
import {protocolKey,questionCompatibility} from '../../src/evaluation/protocol-identity.ts';
export function fixtureRegistry(sets:readonly ResolvedProtocolSet[]):ProtocolRegistry{
  return {list:()=>sets.map(s=>structuredClone(s.descriptor)),async resolve(refs){const set=sets.find(s=>protocolKey(s.descriptor.refs)===protocolKey(refs));if(!set)throw Error('UNKNOWN_PROTOCOL');return structuredClone(set);},async forNewRun(id){const set=sets.find(s=>s.generalId===id);if(!set)throw Error('UNKNOWN_PROTOCOL');if(!set.descriptor.allowNewRuns)throw Error('PROTOCOL_NOT_VERIFIED');return this.resolve(set.descriptor.refs);}};
}
export function legacyFixtureSet(protocols:ProtocolSet):ResolvedProtocolSet{
  const refs={generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},general=legacyGeneralDefinition(protocols.items);
  return {...protocols,descriptor:{refs,general,questionCount:protocols.items.filter(q=>q.track==='general').length,allowNewRuns:true},compatibility:Object.fromEntries(protocols.items.map(q=>[q.id,questionCompatibility(q,{fixture:'legacy'},{fixture:'legacy'})]))};
}
export const legacyFixtureRegistry=(protocols:ProtocolSet)=>fixtureRegistry([legacyFixtureSet(protocols)]);
