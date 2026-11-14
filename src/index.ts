import {selectCalibrationDirectory} from './speed/calibration-session.ts';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {createHostAdapter,type AdapterContext} from './host/adapter.ts';import {registerHostChannel} from './host/channel.ts';import {createEvaluationService} from './service.ts';import {safeApiError} from './host/api.ts';
import {launchCalibrationHost} from './speed/calibration-host.ts';import {defaultRoot} from './resources/prepare.ts';import {join} from 'node:path';
declare const __ESTIMATION_CALIBRATION__:boolean;
const calibrationEnabled=typeof __ESTIMATION_CALIBRATION__!=='undefined'&&__ESTIMATION_CALIBRATION__;
/** Structural subset of the official Connection contract at ce7073d. */
export interface FetchRoute {
  path: string; methods: readonly ('GET' | 'HEAD' | 'POST')[]; requestBody: 'buffered' | 'streaming';
  fetch(request: Request): Promise<Response>;
}
export interface HostContext {
  connection: { fetch: { register(route: FetchRoute): () => Promise<void> } };
  effect(install: () => () => Promise<void>, label?: string): unknown;
  llm?:AdapterContext['llm'];settings?:AdapterContext['settings']&{documentPath:string};
  on?(event:string,listener:()=>void):()=>void;
}
export const name = 'dsh-model-coordinates';
export const inject = ['connection','llm','settings'];

/** The Connection carrier, not this handler, admits authenticated owner peers. */
export function apply(ctx: HostContext): void {
  ctx.effect(()=>{
    if(!ctx.llm||!ctx.settings?.documentPath)return ctx.connection.fetch.register({path:'/api/dsh-model-coordinates/v1/status',methods:['GET'],requestBody:'buffered',async fetch(){return Response.json({apiVersion:1,plugin:name,ready:false,stage:'host-services-unavailable'},{headers:{'cache-control':'no-store'}});}});
    const scopeId=createHash('sha256').update(ctx.settings.documentPath).digest('hex');
    const adapter=createHostAdapter({scopeId,llm:ctx.llm,settings:ctx.settings,effect:ctx.effect.bind(ctx),...(ctx.on?{subscribeChanges(callback:()=>void){const off=[ctx.on!('settings/document-updated',callback),ctx.on!('app-boot/config-reload',callback)];return ()=>off.forEach(fn=>fn());}}:{})});
    const service=createEvaluationService({adapter,scopeId,packageResources:fileURLToPath(new URL('../resources/',import.meta.url)),...(calibrationEnabled?{estimationExperiment:{enabled:true as const}}:{})});
    const experimental=calibrationEnabled?service.then(async s=>{const root=join(defaultRoot(),'calibration');return launchCalibrationHost(s,adapter,await selectCalibrationDirectory(root),{authorizationRoot:root});}):undefined;
    void experimental?.catch(()=>{});
    // Handlers await startup. Attach a rejection observer immediately so a failed
    // local preparation never creates an unhandled promise during host loading.
    void service.catch(()=>{});
    const status=ctx.connection.fetch.register({path:'/api/dsh-model-coordinates/v1/status',methods:['GET'],requestBody:'buffered',async fetch(){try{return Response.json({plugin:name,...await (await service).dispatch('status',{}) as object},{headers:{'cache-control':'no-store'}});}catch(error){return Response.json({apiVersion:1,plugin:name,ready:false,error:safeApiError(error)},{status:503,headers:{'cache-control':'no-store'}});}}});
    const channel=registerHostChannel(ctx,{async dispatch(action,payload){return (await service).dispatch(action,payload);},async dispose(){await (await service).dispose();}});
    return async()=>{try{await (await experimental?.catch(()=>undefined))?.dispose();}finally{try{await status();}finally{await channel().catch(()=>{});}}};
  },'model-eval: protected service and lifecycle');
}
