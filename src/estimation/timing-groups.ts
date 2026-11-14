import type {TimingTraceV1} from './calibration-contracts.ts';
export interface TimingGroup {id:string;kind:'run'|'preview';createdAt:string;active:boolean;traceIds:string[]}
const isProbe=(r:TimingTraceV1)=>r.programId.startsWith('speed-probe-');
/** Logical groups retain shared support traces until every referring run is
 * selected. Source, first-pass receipt and makeup always belong to one run.
 */
export function timingGroups(rows:readonly TimingTraceV1[]):TimingGroup[]{
 const byId=new Map(rows.map(r=>[r.traceId,r])),runs=new Map<string,TimingTraceV1[]>(),groups:TimingGroup[]=[];
 for(const r of rows)if(r.runId){const a=runs.get(r.runId)??[];a.push(r);runs.set(r.runId,a);}
 function closure(seeds:readonly TimingTraceV1[]){const found=new Set<string>(),queue=[...seeds];for(let r;(r=queue.shift());){if(found.has(r.traceId))continue;found.add(r.traceId);for(const id of [r.previewId,r.pairedTraceId,r.predictionProbeId,r.firstPass?.sourceTraceId]){const child=id?byId.get(id):undefined;if(child)queue.push(child);}if(isProbe(r))queue.push(...rows.filter(p=>isProbe(p)&&p.pairedTraceId===r.traceId));}return [...found].sort();}
 const group=(id:string,kind:TimingGroup['kind'],seeds:TimingTraceV1[])=>{const traceIds=closure(seeds);return {id,kind,createdAt:seeds.map(r=>r.startedAt).sort().at(-1)!,active:traceIds.some(id=>byId.get(id)?.status==='running'),traceIds};};
 for(const [id,seeds]of runs)groups.push(group(id,'run',seeds));const used=new Set(groups.flatMap(g=>g.traceIds)),unused=new Map<string,TimingTraceV1[]>();
 for(const r of rows)if(!used.has(r.traceId)){const id=isProbe(r)&&r.pairedTraceId?r.pairedTraceId:r.traceId,a=unused.get(id)??[];a.push(r);unused.set(id,a);}for(const [id,seeds]of unused)groups.push(group(id,'preview',seeds));
 return groups.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export function timingCleanupIds(groups:readonly TimingGroup[],selection:readonly string[]):string[]{
 if(!selection.length||new Set(selection).size!==selection.length||selection.some(id=>!groups.some(g=>g.id===id)))throw Object.assign(Error('TRACE_NOT_FOUND'),{code:'TRACE_NOT_FOUND'});
 const selected=groups.filter(g=>selection.includes(g.id));if(selected.some(g=>g.active))throw Object.assign(Error('TRACE_ACTIVE'),{code:'TRACE_ACTIVE'});
 const retained=new Set(groups.filter(g=>!selection.includes(g.id)).flatMap(g=>g.traceIds));return [...new Set(selected.flatMap(g=>g.traceIds))].filter(id=>!retained.has(id)).sort();
}
