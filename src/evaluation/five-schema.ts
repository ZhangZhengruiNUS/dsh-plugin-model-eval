export type FiveCapabilitySchema = 'task-five-v1' | 'task-five-v2' | 'task-five-v3' | 'task-five-v3-r1' | 'task-five-v3-r2' | 'task-five-v3-r3' | 'task-five-original-v1';

export function isFiveCapabilitySchema(value: unknown): value is FiveCapabilitySchema {
  return value === 'task-five-v1' || isLongTasksFirstSchema(value);
}
export function isLongTasksFirstSchema(value:unknown):value is Exclude<FiveCapabilitySchema,'task-five-v1'>{
  return value==='task-five-v2'||value==='task-five-v3'||value==='task-five-v3-r1'||value==='task-five-v3-r2'||usesContestWallSafety(value);
}
export function usesContestWallSafety(value:unknown):value is 'task-five-v3-r3'|'task-five-original-v1' {
  return value==='task-five-v3-r3'||value==='task-five-original-v1';
}
