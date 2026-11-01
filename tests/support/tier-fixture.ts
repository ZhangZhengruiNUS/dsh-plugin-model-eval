import type {Question} from '../../src/contracts.ts';
import type {GeneralTier,Ability,ResolvedProtocolSet} from '../../src/evaluation/tier-contracts.ts';
import {identityHash,questionCompatibility} from '../../src/evaluation/protocol-identity.ts';
export function makeTierFixture(tier:GeneralTier):ResolvedProtocolSet {
  const sizes=tier==='legacy'?[100,100,541,164]:Array(4).fill(tier==='light'?30:100),abilities:Ability[]=['knowledge','math','instructions','coding'];
  const items:Question[]=abilities.flatMap((ability,index)=>Array.from({length:sizes[index]!},(_,i)=>({id:`fixture/${ability}/${i}`,track:'general' as const,datasetId:ability,sourceId:String(i),sourceHash:identityHash({ability,i}),prompt:[{role:'user' as const,content:`Synthetic ${ability} ${i}`}],grading:{answer:42}})));
  for(let i=0;i<12;i++)items.push({id:`fixture/writing/${i}`,track:'writing',datasetId:'writing',sourceId:String(i),sourceHash:identityHash(i),prompt:[{role:'user',content:`Writing ${i}`}],grading:{}});
  const definition={tier,label:tier,domains:abilities.map(id=>({id,weight:.25,itemIds:items.filter(q=>q.datasetId===id).map(q=>q.id)}))};
  const general={...definition,definitionHash:identityHash(definition)};
  const refs={generalId:`fixture-${tier}`,writingId:'fixture-writing',resourceVersion:'fixture-v1'};
  return {...refs,items,descriptor:{refs,general,questionCount:items.length-12,allowNewRuns:true},compatibility:Object.fromEntries(items.map(q=>[q.id,questionCompatibility(q,{extractor:'fixture-v1'},{limits:42})]))};
}
