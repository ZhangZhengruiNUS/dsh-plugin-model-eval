import type {Action} from '../host/api.ts';
export type ClientApi=<T=unknown>(action:Action,payload?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
export function createClientApi(transport:typeof fetch=fetch):ClientApi {
  return async<T>(action:Action,payload:Record<string,unknown>={},signal?:AbortSignal):Promise<T>=>{
    if(location.protocol==='file:')throw new Error('桌面文件通道尚未验证，请在宿主提供的受保护 Web 界面使用。');
    const requestId=crypto.randomUUID(),response=await transport('/api/aico/model-eval/v1/operation',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,requestId,action,payload}),...(signal?{signal}:{})});
    let reply;try{reply=await response.json();}catch{throw new Error('未连接到评测服务，请检查插件是否启用。');}
    if(!reply.ok)throw Object.assign(new Error(reply.error?.message??'操作未完成。'),{code:reply.error?.code});
    if(reply.requestId!==requestId||reply.schemaVersion!==1)throw new Error('评测服务返回了不匹配的响应，请刷新重试。');return reply.data as T;
  };
}
