import type {ProtocolRefs,EvaluationRequest} from '../contracts.ts';
import type {GeneralDefinition,QuestionCompatibility} from '../evaluation/tier-contracts.ts';
/** Public projection: no account, endpoint, local path, answer, prompt or private tool state. */
export interface ReferenceItemEvidence {
 schema:'reference-items-v1';referenceId:string;protocols:ProtocolRefs;definition:GeneralDefinition;
 conditions:{modelId:string;reasoningEffort:string;channel:'chatgpt-subscription-responses';execution:EvaluationRequest['execution'];completedAt:string;attempts?:{schema:'reference-attempt-summary-v1';completed:number;failed:number;cancelled:number;validationErrors:number}};
 score:number;items:{id:string;questionHash:string;compatibility:QuestionCompatibility;passed:boolean}[];
 sourceHashes:{manifest:string;summary:string;items:string};evidenceHash:string;
 regrade?:{schema:'reference-offline-regrade-v1';sourceReferenceId:string;sourceEvidenceHash:string;reusedItems:57;newItems:5;rulesHash:string;modelCalls:0};
 scoringCorrection?:{schema:'reference-tool-answer-correction-v1';sourceReferenceId:string;sourceEvidenceHash:string;sourceScore:number;sourceCompletedAt:string;changedItems:['tools/multi_turn_base_39'];carriedItems:number;rulesHash:string;modelCalls:0};
 edition?:{schema:'reference-edition-reuse-v1';sourceReferenceId:string;sourceEvidenceHash:string;sourceCompletedAt:string;mapHash:string;reusedItems:number;newItems:number;newEvidenceHash:string};
}
