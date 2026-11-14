import type {ProtocolRefs} from '../contracts.ts';
import {generalEvaluationName,generalReleaseFor} from '../evaluation/current-edition.ts';

/** Display and lifecycle metadata. Stored protocol refs still identify the scoring contract. */
const historicalEditions = [
  {resourceVersion:'suite-2026-10-31-v3',label:'旧版基线'},
  {resourceVersion:'two-tier-v1',label:'双档初版'},
  {resourceVersion:'task-five-v1',label:'五项能力第 1 版'},
  {resourceVersion:'task-five-v2',label:'五项能力第 2 版'},
  {resourceVersion:'task-five-v3',label:'五项能力第 3 版'},
  {resourceVersion:'task-five-v3-r1',label:'评分修订 1'},
  {resourceVersion:'task-five-v3-r2',label:'评分修订 2'},
  {resourceVersion:'task-five-original-v1',label:generalEvaluationName},
  {resourceVersion:'task-five-original-v1-deep-r2',label:generalEvaluationName},
] as const;

export function generalEditionLabel(resourceVersion:string):string|undefined {
  return historicalEditions.find(edition=>edition.resourceVersion===resourceVersion)?.label;
}

export function generalEditionOrder(resourceVersion:string):number {
  return historicalEditions.findIndex(edition=>edition.resourceVersion===resourceVersion);
}

export function generalReleaseName(refs:ProtocolRefs, full=false):string|undefined {
  const release=generalReleaseFor(refs);
  if(!release)return undefined;
  return (full?generalEvaluationName+' · ':'')+(release.tier==='light'?'轻量':'深入')+' '+release.version+(release.preview?'（试用版）':'');
}
