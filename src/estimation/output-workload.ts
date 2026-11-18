export type PlanningTier = 'light' | 'deep';

// Rounded output volumes from the measured general 1.0 runs. The light value
// is the median of three runs; the deep value comes from one run.
export const tierOutputTokens: Record<PlanningTier, number> = {light: 270_000, deep: 2_400_000};

// Per-suite volumes from the bundled writing references (12 questions each).
export const writingOutputPerItem: Record<string, {answer: number; judge: number}> = {
  'work-writing-12-v2': {answer: 45_117 / 12, judge: 34_124 / 12},
  'work-writing-12-v3': {answer: 38_430 / 12, judge: 33_098 / 12},
};
