import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {createHostAdapter,type AdapterContext} from './host/adapter.ts';import {registerHostChannel} from './host/channel.ts';import {createEvaluationService} from './service.ts';import {safeApiError} from './host/api.ts';
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
export const name = '@aico/dsh-plugin-model-eval';
export const inject = ['connection','llm','settings'];

/** The Connection carrier, not this handler, admits authenticated owner peers. */
export function apply(ctx: HostContext): void {
  ctx.effect(()=>{
    if(!ctx.llm||!ctx.settings?.documentPath)return ctx.connection.fetch.register({path:'/api/aico/model-eval/v1/status',methods:['GET'],requestBody:'buffered',async fetch(){return Response.json({apiVersion:1,plugin:name,ready:false,stage:'host-services-unavailable'},{headers:{'cache-control':'no-store'}});}});
    const scopeId=createHash('sha256').update(ctx.settings.documentPath).digest('hex');
    const adapter=createHostAdapter({scopeId,llm:ctx.llm,settings:ctx.settings,effect:ctx.effect.bind(ctx),...(ctx.on?{subscribeChanges(callback:()=>void){const off=[ctx.on!('settings/document-updated',callback),ctx.on!('app-boot/config-reload',callback)];return ()=>off.forEach(fn=>fn());}}:{})});
    const service=createEvaluationService({adapter,scopeId,packageResources:fileURLToPath(new URL('../resources/',import.meta.url))});
    // Handlers await startup. Attach a rejection observer immediately so a failed
    // local preparation never creates an unhandled promise during host loading.
    void service.catch(()=>{});
    const status=ctx.connection.fetch.register({path:'/api/aico/model-eval/v1/status',methods:['GET'],requestBody:'buffered',async fetch(){try{return Response.json({plugin:name,...await (await service).dispatch('status',{}) as object},{headers:{'cache-control':'no-store'}});}catch(error){return Response.json({apiVersion:1,plugin:name,ready:false,error:safeApiError(error)},{status:503,headers:{'cache-control':'no-store'}});}}});
    const channel=registerHostChannel(ctx,{async dispatch(action,payload){return (await service).dispatch(action,payload);},async dispose(){await (await service).dispose();}});
    return async()=>{await status();await channel().catch(()=>{});};
  },'model-eval: protected service and lifecycle');
}
