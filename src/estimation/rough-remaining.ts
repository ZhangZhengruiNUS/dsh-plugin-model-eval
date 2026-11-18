import type {EvaluationRequest, JudgeSnapshot, RunSummary, Track} from '../contracts.ts';
import {generalReleaseFor} from '../evaluation/current-edition.ts';
import type {PerformanceSample, PlannedJob} from './contracts.ts';
import {simulateSchedule} from './engine.ts';
import {performanceConditionKey} from './observations.ts';
import {tierOutputTokens, writingOutputPerItem} from './output-workload.ts';

export interface RoughRemaining {
  remainingMs: number;
  borrowedConfigurations: number;
  borrowedJudgeRate: boolean;
  excludesDeferredWork: boolean;
  judgeRetryAdjusted?: true;
}

type Run = Pick<RunSummary, 'runId' | 'target' | 'protocols' | 'tracks' | 'performance' | 'estimation'>;
type Rate = {tokensPerMs: number; tokensPerCall: number; count: number};

function outputRate(samples: readonly PerformanceSample[]): Rate | undefined {
  let tokens = 0, duration = 0, count = 0;
  for (const sample of samples) {
    const output = sample.usage?.outputTokens;
    if (sample.outcome !== 'completed' || output === undefined || !Number.isSafeInteger(output) || output <= 0 ||
      !Number.isFinite(sample.durationMs) || sample.durationMs <= 0) continue;
    tokens += output;
    duration += sample.durationMs;
    count++;
  }
  // Summed call durations yield one worker's rate. The scheduler applies concurrency.
  if (count && Number.isFinite(duration)) return {tokensPerMs: tokens / duration, tokensPerCall: tokens / count, count};
}

function observedGeneralVolume(answers: readonly PerformanceSample[]) {
  const datasets = new Map<string, PerformanceSample[]>();
  for (const sample of answers) {
    // A tool turn is not a whole question and must not calibrate question size.
    if (sample.datasetId === 'writing' || sample.datasetId.endsWith(':turn')) continue;
    const group = datasets.get(sample.datasetId) ?? [];
    group.push(sample);
    datasets.set(sample.datasetId, group);
  }
  return new Map([...datasets].map(([id, samples]) => [id, outputRate(samples)]));
}

function readRates(run: Run, execution: EvaluationRequest['execution'], judge?: JudgeSnapshot) {
  const samples = run.performance?.samples ?? [];
  const answers = samples.filter(sample => sample.phase === 'answer');
  const preview = run.estimation?.originPreview?.configs[0]?.performance.samples ?? [];
  const previewAnswers = preview.filter(sample => sample.phase === 'answer');
  const judgeKey = judge ? performanceConditionKey(run.target, run.protocols, execution, judge) : undefined;
  return {
    run,
    samples,
    general: outputRate(answers.filter(sample => sample.datasetId !== 'writing')) ??
      outputRate(previewAnswers.filter(sample => sample.datasetId !== 'writing')),
    writing: outputRate(answers.filter(sample => sample.datasetId === 'writing')) ??
      outputRate(previewAnswers.filter(sample => sample.datasetId === 'writing')),
    answer: outputRate(answers) ?? outputRate(previewAnswers),
    generalVolume: observedGeneralVolume(answers),
    judgeSamples: samples.filter(sample => sample.phase === 'judge' && sample.conditionKey === judgeKey),
    judgeFailures: (run.performance?.recentFailures ?? []).filter(sample => sample.phase === 'judge' &&
      sample.conditionKey === judgeKey && (sample.outcome === 'failed' || sample.outcome === 'timeout') &&
      Number.isFinite(sample.durationMs) && sample.durationMs > 0),
  };
}

function expectedAutomaticJudgeRetry(failures: readonly PerformanceSample[], successfulCalls: number) {
  const retries = failures.filter(sample => sample.automaticRetry === true);
  if (!retries.length) return 0;
  const probability = retries.length / (successfulCalls + failures.length + 4);
  const meanRetryCost = retries.reduce((sum, sample) => {
    const wait = sample.retryWaitMs;
    return sum + sample.durationMs + (wait !== undefined && Number.isFinite(wait) && wait >= 0 ? wait : 0);
  }, 0) / retries.length;
  // A normal judge stage can make at most two automatic retries.
  return (probability + probability ** 2) * meanRetryCost;
}

export function estimateRoughRemaining(options: {
  runs: readonly Run[];
  work: ReadonlyMap<string, readonly PlannedJob[]>;
  execution: EvaluationRequest['execution'];
  judge?: JudgeSnapshot;
  sampledAnswerMs?: Readonly<Record<string,number>>;
  singleJudgeAttempts?: ReadonlyMap<string, ReadonlySet<string>>;
  excludesDeferredWork: boolean;
}): RoughRemaining | undefined {
  const {runs, work, execution, judge, sampledAnswerMs, singleJudgeAttempts, excludesDeferredWork} = options;
  const observations = runs.map(run => readRates(run, execution, judge));
  const seed = observations.find(row => row.answer);
  const judgeSamples = observations.flatMap(row => row.judgeSamples);
  const judgeRate = outputRate(judgeSamples);
  const automaticRetryMs = expectedAutomaticJudgeRetry(observations.flatMap(row => row.judgeFailures), judgeSamples.length);
  if (!seed?.answer && !judgeRate && !sampledAnswerMs) return;

  let remainingMs = 0, borrowedConfigurations = 0, borrowedJudgeRate = false, judgeRetryAdjusted = false;
  for (const row of observations) {
    const jobs = work.get(row.run.runId);
    if (!jobs?.length) continue;
    const {protocols, tracks} = row.run;
    const tier = generalReleaseFor(protocols)?.tier;
    const items = tracks.general?.required;
    const generalTokens = tier && items && items > 0 ? tierOutputTokens[tier] / items : undefined;
    const writingTokens = writingOutputPerItem[protocols.writingId];
    const currentJudge = sampledAnswerMs ? undefined : outputRate(row.judgeSamples) ?? judgeRate;
    const sampleMs = sampledAnswerMs?.[row.run.runId];
    const sampleReference = generalTokens ?? writingTokens?.answer ?? 1;
    const sampleRate = sampleMs && sampleMs > 0 ? {tokensPerMs:sampleReference/sampleMs,tokensPerCall:sampleReference,count:1} : undefined;
    const measuredStage = (datasetId: string, phase: 'local-grade' | 'tool-scenario') => {
      for (const observation of phase === 'local-grade' ? [row, seed] : [row]) {
        const matches = observation?.samples.filter(sample => sample.phase === phase && sample.datasetId === datasetId &&
          sample.outcome === 'completed' && Number.isFinite(sample.durationMs) && sample.durationMs >= 0);
        if (matches?.length) return matches.reduce((sum, sample) => sum + sample.durationMs, 0) / matches.length;
      }
      return undefined;
    };

    const answerRate = (track: Track) => row[track] ?? row.answer ?? sampleRate ?? seed?.[track] ?? seed?.answer ?? judgeRate;
    let borrowedAnswer = false;
    const scheduled = jobs.map(job => ({
      track: job.track,
      stages: job.stages.map(phase => {
        if (phase === 'local-grade') return {phase, durationMs: measuredStage(job.datasetId, phase) ?? 0};
        if (phase === 'tool-scenario') {
          const observed = measuredStage(job.datasetId, phase);
          if (observed !== undefined) return {phase, durationMs: observed};
        }
        const answer = answerRate(job.track)!;
        if (phase === 'judge') {
          borrowedJudgeRate ||= !currentJudge;
          const tokens = currentJudge?.tokensPerCall ?? writingTokens?.judge ?? answer.tokensPerCall;
          const typical = tokens / (currentJudge ?? answer).tokensPerMs;
          if (singleJudgeAttempts?.get(row.run.runId)?.has(job.itemId)) {
            const failures = row.judgeFailures.filter(sample => sample.itemId === job.itemId);
            judgeRetryAdjusted ||= failures.length > 0;
            // A user-initiated retry of a deferred item dispatches only once.
            // Blend its observed failures with one ordinary call; omit pauses.
            return {phase, durationMs: (typical + failures.reduce((sum, sample) => sum + sample.durationMs, 0)) / (1 + failures.length)};
          }
          judgeRetryAdjusted ||= automaticRetryMs > 0;
          return {phase, durationMs: typical + automaticRetryMs};
        }
        borrowedAnswer ||= !row.answer&&!sampleRate;
        let expected = row.writing?.tokensPerCall ?? seed?.writing?.tokensPerCall ?? writingTokens?.answer ?? answer.tokensPerCall;
        if (job.track === 'general') {
          const reference = generalTokens ?? answer.tokensPerCall;
          const measured = row.generalVolume.get(job.datasetId);
          // A single reply keeps the original rough estimate. Subsequent ones
          // replace a four-reply prior within their own question family.
          expected = measured && measured.count >= 2
            ? (measured.tokensPerCall * measured.count + reference * 4) / (measured.count + 4)
            : reference;
        }
        return {phase, durationMs: expected / answer.tokensPerMs};
      }),
    }));
    if (borrowedAnswer) borrowedConfigurations++;
    remainingMs += simulateSchedule(scheduled, execution.concurrency);
  }
  if (Number.isFinite(remainingMs) && remainingMs > 0) {
    return {remainingMs, borrowedConfigurations, borrowedJudgeRate, excludesDeferredWork,
      ...(judgeRetryAdjusted ? {judgeRetryAdjusted:true} : {})};
  }
}
