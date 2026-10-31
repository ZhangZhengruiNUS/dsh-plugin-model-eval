import { createHash } from 'node:crypto';
import type { JsonValue, ParamValue, TargetSnapshot } from '../contracts.ts';

const sensitive = (key: string) => /^(?:apikey|accesskey|secret|authorization|password|credentials?|privatekey|sessiontoken|bearertoken|token|headers?)$/.test(key.replace(/[_-]/g,'').toLowerCase());
const invalid = (): never => { throw new Error('INVALID_TARGET_SNAPSHOT'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value) || (Object.getPrototypeOf(value)!==Object.prototype && Object.getPrototypeOf(value)!==null)) return invalid();
  if (Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(x=>x.get || x.set)) return invalid();
  return value as Record<string,unknown>;
}
function keys(value: Record<string,unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key=>!allowed.includes(key))) invalid();
}
function text(value: unknown): string { if (typeof value!=='string' || !value.length) return invalid(); return value; }

/** JSON key order is immaterial; arrays, string case, null and zero are not. */
function canonical(value: unknown, ancestors=new Set<object>(), depth=0): JsonValue {
  if (depth>64) return invalid();
  if (value===null || typeof value==='string' || typeof value==='boolean') return value;
  if (typeof value==='number') { if (!Number.isFinite(value)) return invalid(); return value; }
  if (typeof value!=='object' || !value || ancestors.has(value)) return invalid();
  const next=new Set(ancestors);next.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length!==value.length) return invalid();
    return value.map(x=>canonical(x,next,depth+1));
  }
  const item=record(value);
  return Object.fromEntries(Object.keys(item).sort().map(key=>{
    if (sensitive(key)) throw new Error('TARGET_SECRET_REJECTED');
    return [key,canonical(item[key],next,depth+1)];
  }));
}
function parameter(input: unknown): JsonValue {
  const value=record(input);
  if (value.state==='unset' || value.state==='unknown') {keys(value,['state']);return {state:value.state};}
  if (value.state!=='known' || !['user','override','adapter'].includes(value.source as string)) return invalid();
  keys(value,['state','value','source']);
  return {state:'known',value:canonical(value.value)};
}
function checkRoute(route: ParamValue): void {
  if (route.state!=='known' || typeof route.value!=='string' || !/^https?:\/\//i.test(route.value)) return;
  let url: URL;
  try { url=new URL(route.value); } catch { return invalid(); }
  if (url.username || url.password || [...url.searchParams.keys()].some(sensitive)) throw new Error('TARGET_SECRET_REJECTED');
}
export function fingerprintTarget(target: TargetSnapshot): string {
  const value=record(target);keys(value,['scopeId','providerId','modelId','routeTarget','controls','deployment','origin']);
  if (value.origin!==undefined) {
    const origin=record(value.origin);keys(origin,['adapterInstance','settingsNs','settingsRevision','adapterEpoch']);
    text(origin.adapterInstance);
    if (origin.settingsNs!==undefined) text(origin.settingsNs);
    for (const key of ['settingsRevision','adapterEpoch']) if (origin[key]!==undefined && (!Number.isSafeInteger(origin[key]) || Number(origin[key])<0)) invalid();
  }
  const controls=record(value.controls);
  const normalizedControls=Object.fromEntries(Object.keys(controls).sort().map(key=>{
    if (sensitive(key)) throw new Error('TARGET_SECRET_REJECTED');
    return [key,parameter(controls[key])];
  }));
  const route=parameter(value.routeTarget);checkRoute(target.routeTarget);
  let deployment: string | null=null;
  if (value.deployment!==undefined) {
    const item=record(value.deployment);keys(item,['value','source']);
    if (!['user','service'].includes(item.source as string)) return invalid();
    deployment=text(item.value);
  }
  const normalized={scopeId:text(value.scopeId),providerId:text(value.providerId),modelId:text(value.modelId),
    routeTarget:route,controls:normalizedControls,deployment};
  return 'target-v1:'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
