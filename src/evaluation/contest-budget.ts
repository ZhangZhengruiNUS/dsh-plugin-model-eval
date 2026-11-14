/** Approved new contest protocol only. Legacy limits and historical identities stay intact. */
export const CONTEST_BUDGET_VERSION='contest-60s-512m-800b-v1';
export const CONTEST_SCORING_LIMITS=Object.freeze({wallMs:60000,memoryBytes:536870912,computeBudget:800000000000});

export const CONTEST_WALL_SAFETY_ID='wall-safety-v1' as const;
export const CONTEST_WALL_SAFETY_LIMITS=Object.freeze({...CONTEST_SCORING_LIMITS,wallMs:240000});
