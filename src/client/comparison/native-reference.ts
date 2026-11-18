import type {RunSummary} from '../../contracts.ts';
import type {ComparisonExecution} from '../../comparison/contracts.ts';
import {generalReleaseFor} from '../../evaluation/current-edition.ts';
import {writingEditionFor} from '../../evaluation/writing-edition.ts';
import {DIMENSIONS} from '../../writing/score.ts';

/** Public fingerprints bind the projection to privately retained run records. */
export interface NativeReferenceCapture {
  schema: 'native-run-reference-v1';
  summarySha256: string;
  itemsSha256: string;
  requiredSha256: string;
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function nativePresetModelName(modelId: string): string | undefined {
  if (modelId === 'gpt-6-astra') return 'GPT-6 Astra';
  if (modelId === 'gpt-6.2-astra') return 'GPT-6.2 Astra';
}

function nativePresetRunId(modelId: string, edition: string): string | undefined {
  if (nativePresetModelName(modelId)) return `openai-${modelId}-max-${edition.replace('.', '-')}`;
}

// The capture IDs predate the public edition labels and follow the protocol identity.
const generalCaptureEditions: Readonly<Record<string, string | undefined>> = {
  'general-task-five-original-v1-light': 'light-v1-1',
  'general-task-five-original-v1-deep-r2': 'deep-v1-2',
};

export function admittedNativeWritingReference(
  run: RunSummary, execution: ComparisonExecution, capture: NativeReferenceCapture,
): boolean {
  const result = run.tracks.writing;
  const edition = writingEditionFor(run.protocols.writingId);
  if (!edition?.version) return false;
  const count = edition.questionCount;
  const metrics = run.metrics.tracks.writing;
  const timing = metrics?.answer.taskTiming;
  const effort = run.target.controls.reasoningEffort;
  const [judge] = run.judges;
  const judgeEffort = judge?.snapshot.target.controls.reasoningEffort;
  const ended = Date.parse(run.completedAt ?? '');
  const began = Date.parse(run.createdAt ?? '');
  const expectedRunId = nativePresetRunId(run.target.modelId, `writing-v${edition.version}`);

  if (!expectedRunId || run.runId !== expectedRunId ||
      run.batchId !== 'built-in-reference' || run.details !== 'cleared' || run.resumeAllowed ||
      run.tracks.general || run.generalDefinition || run.regradeOrigin || run.reuse || run.executionChanges?.length ||
      run.target.scopeId !== 'built-in-reference' || run.target.providerId !== 'OpenAI' ||
      run.target.routeTarget.state !== 'unknown' ||
      effort?.state !== 'known' || effort.value !== 'max' ||
      run.judges.length !== 1 || !judge ||
      judge.snapshot.target.scopeId !== run.target.scopeId || judge.snapshot.target.providerId !== run.target.providerId ||
      judge.snapshot.target.modelId !== run.target.modelId || judge.snapshot.target.routeTarget.state !== 'unknown' ||
      judgeEffort?.state !== 'known' || judgeEffort.value !== effort.value ||
      judge.snapshot.rubricId !== 'work-writing-five-dimensions-v1' || judge.snapshot.promptId !== 'writing-judge-json-v1' ||
      judge.itemIds.length !== count || new Set(judge.itemIds).size !== count ||
      capture.schema !== 'native-run-reference-v1' ||
      ![capture.summarySha256, capture.itemsSha256, capture.requiredSha256].every(hash => /^[a-f0-9]{64}$/.test(hash)) ||
      execution.state !== 'known' || execution.failurePolicy !== 'output-idle-v1' ||
      !Number.isInteger(execution.concurrency) || execution.concurrency < 1 || execution.concurrency > count ||
      !Number.isInteger(execution.callTimeoutMs) || execution.callTimeoutMs < 1000 ||
      !metrics || ![metrics.answer, metrics.judge].every(phase=>Number.isInteger(phase.calls)&&phase.calls>=count) ||
      !positive(ended - began) || !result || result.completedAt !== run.completedAt ||
      result.status !== 'completed' || result.required !== count || result.answered !== count || result.graded !== count ||
      timing?.schema !== 'task-duration-v1' || !timing.complete ||
      timing.required !== count || timing.measured !== count || !positive(timing.meanMs) ||
      Object.keys(result.measures).length !== DIMENSIONS.length) return false;

  let score = 0;
  for (const dimension of DIMENSIONS) {
    const measure = result.measures[dimension];
    if (!measure || measure.required !== count || measure.graded !== count ||
        measure.score === undefined || !Number.isFinite(measure.score) || measure.score < 0 || measure.score > 4) return false;
    score += measure.score * 5;
  }
  return result.score !== undefined && Math.abs(result.score - score) < 1e-7;
}

export function admittedNativeReference(
  run: RunSummary, execution: ComparisonExecution, capture: NativeReferenceCapture,
): boolean {
  const release = generalReleaseFor(run.protocols);
  const definition = run.generalDefinition;
  const result = run.tracks.general;
  const timing = run.metrics.tracks.general?.answer.taskTiming;
  const count = release?.tier === 'light' ? 62 : 348;
  const effort = run.target.controls.reasoningEffort;
  const captureEdition = generalCaptureEditions[run.protocols.generalId];

  if (!release?.current || !definition ||
      definition.schema !== release.schema || definition.tier !== release.tier ||
      !captureEdition || run.runId !== nativePresetRunId(run.target.modelId, captureEdition) ||
      run.batchId !== 'built-in-reference' || run.details !== 'cleared' || run.resumeAllowed ||
      run.target.scopeId !== 'built-in-reference' || run.target.providerId !== 'OpenAI' ||
      run.target.routeTarget.state !== 'unknown' ||
      effort?.state !== 'known' || effort.value !== 'max' ||
      capture.schema !== 'native-run-reference-v1' ||
      ![capture.summarySha256, capture.itemsSha256, capture.requiredSha256].every(hash => /^[a-f0-9]{64}$/.test(hash)) ||
      run.regradeOrigin || run.reuse || run.tracks.writing || run.judges.length || run.executionChanges?.length ||
      execution.state !== 'known' || execution.failurePolicy !== 'output-idle-v1' ||
      !Number.isInteger(execution.concurrency) || execution.concurrency < 1 || execution.concurrency > 4 ||
      !Number.isInteger(execution.callTimeoutMs) || execution.callTimeoutMs < 1000 ||
      result?.status !== 'completed' || result.required !== count || result.answered !== count || result.graded !== count ||
      !Number.isFinite(Date.parse(result.completedAt ?? '')) ||
      timing?.schema !== 'task-duration-v1' || timing.complete !== true ||
      timing.required !== count || timing.measured !== count || !positive(timing.meanMs)) return false;

  const questions = definition.domains.flatMap(domain => domain.itemIds);
  if (questions.length !== count || new Set(questions).size !== count ||
      Object.keys(result.measures).length !== definition.domains.length ||
      timing.domains?.length !== definition.domains.length) return false;

  let weightedScore = 0, weightedTime = 0, totalWeight = 0;
  for (const domain of definition.domains) {
    const measure = result.measures[domain.id];
    const observed = timing.domains.find(item => item.id === domain.id);
    const size = domain.itemIds.length;
    if (!size || !positive(domain.weight) || !measure || measure.required !== size ||
        measure.graded !== size || measure.passed === undefined ||
        !Number.isInteger(measure.passed) || measure.passed < 0 || measure.passed > size ||
        !observed || observed.required !== size || observed.measured !== size ||
        observed.weight !== domain.weight || !positive(observed.meanMs)) return false;
    const score = measure.passed / size * 100;
    if (measure.score === undefined || !Number.isFinite(measure.score) || Math.abs(measure.score - score) > 1e-7) return false;
    weightedScore += domain.weight * score;
    weightedTime += domain.weight * observed.meanMs;
    totalWeight += domain.weight;
  }
  return result.score !== undefined && Math.abs(result.score - weightedScore) <= 1e-7 &&
    Math.abs(timing.meanMs - weightedTime) <= 1e-6 && Math.abs(totalWeight - 1) <= 1e-9;
}
