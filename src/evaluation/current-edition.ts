import type {ProtocolRefs} from '../contracts.ts';
import {isFiveCapabilitySchema,type FiveCapabilitySchema} from './five-schema.ts';

export const generalEvaluationName = '通用能力评测';

export interface PublicEvaluationRelease {
  version: string;
  current: boolean;
}

type GeneralReleaseRefs = Pick<ProtocolRefs,'generalId'|'resourceVersion'>;

export interface GeneralRelease extends PublicEvaluationRelease, GeneralReleaseRefs {
  tier: 'light'|'deep';
  preview?: true;
  schema: FiveCapabilitySchema;
}

/** Each tier has its own current release, even when their resource bundle is shared. */
export const generalReleases: readonly GeneralRelease[] = [
  {tier:'light',version:'1.0',current:false,preview:true,generalId:'general-task-five-v3-r3-light',
    resourceVersion:'task-five-v3-r3',schema:'task-five-v3-r3'},
  {tier:'deep',version:'1.0',current:false,preview:true,generalId:'general-task-five-v3-r3-deep',
    resourceVersion:'task-five-v3-r3',schema:'task-five-v3-r3'},
  {tier:'light',version:'1.0',current:true,generalId:'general-task-five-original-v1-light',
    resourceVersion:'task-five-original-v1',schema:'task-five-original-v1'},
  {tier:'deep',version:'1.1',current:false,preview:true,generalId:'general-task-five-original-v1-deep',
    resourceVersion:'task-five-original-v1',schema:'task-five-original-v1'},
  {tier:'deep',version:'1.0',current:true,generalId:'general-task-five-original-v1-deep-r2',
    resourceVersion:'task-five-original-v1-deep-r2',schema:'task-five-original-v1'},
];

export function generalReleaseFor(refs:GeneralReleaseRefs, releases=generalReleases):GeneralRelease|undefined {
  return releases.find(release=>release.generalId===refs.generalId&&release.resourceVersion===refs.resourceVersion);
}

export function isCurrentGeneralRelease(refs:GeneralReleaseRefs, releases=generalReleases):boolean {
  return generalReleaseFor(refs,releases)?.current===true;
}

export function generalSchemaFor(refs:GeneralReleaseRefs, releases=generalReleases):FiveCapabilitySchema|undefined {
  return generalReleaseFor(refs,releases)?.schema??(isFiveCapabilitySchema(refs.resourceVersion)?refs.resourceVersion:undefined);
}
