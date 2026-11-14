import type {ToolSessionCheckpoint,ToolCall} from '../contracts.ts';
/** Read-only structural check matching the sealed session's turn/action budgets.
 * Kept separate so inspecting old evidence does not modify the frozen executor.
 */
export function validToolCheckpoint(value:unknown,scenarioId:string,turnCount:number):value is ToolSessionCheckpoint{
 try{
  const s=value as ToolSessionCheckpoint;
  const call=(c:ToolCall)=>!!c&&typeof c.callId==='string'&&!!c.callId&&typeof c.name==='string'&&!!c.name&&typeof c.argumentsJson==='string';
  return !!s&&s.version===1&&s.scenarioId===scenarioId&&Number.isSafeInteger(turnCount)&&turnCount>0&&Number.isSafeInteger(s.logicalRounds)&&s.logicalRounds>=0&&s.logicalRounds<=24&&Number.isSafeInteger(s.actions)&&s.actions>=0&&s.actions<=32&&Array.isArray(s.committedCallIds)&&s.committedCallIds.every(id=>typeof id==='string'&&!!id)&&s.actions===s.committedCallIds.length&&new Set(s.committedCallIds).size===s.actions&&Number.isSafeInteger(s.userTurn)&&s.userTurn>=0&&s.userTurn<=turnCount&&Array.isArray(s.callsByTurn)&&s.callsByTurn.length===turnCount&&s.callsByTurn.every(turn=>Array.isArray(turn)&&turn.every(call))&&s.callsByTurn.flat().length===s.actions&&s.callsByTurn.flat().every(c=>s.committedCallIds.includes(c.callId))&&new Set(s.callsByTurn.flat().map(c=>c.callId)).size===s.actions&&Array.isArray(s.pendingCalls)&&s.pendingCalls.every(call)&&Array.isArray(s.messages)&&typeof s.roundReserved==='boolean'&&['model','actions','judge','done'].includes(s.stage);
 }catch{return false;}
}
