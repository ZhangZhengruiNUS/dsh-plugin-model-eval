import type {FetchRoute} from '../index.ts';import {safeApiError,validateEnvelope,type Action} from './api.ts';
export interface DispatchService {dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown>;dispose():Promise<void>}
export interface ChannelContext {connection:{fetch:{register(route:FetchRoute):()=>Promise<void>}}}

function acceptsBrowserOrigin(request:Request):boolean {
  if(request.headers.get('sec-fetch-site')==='cross-site')return false;
  const origin=request.headers.get('origin');
  if(origin===null)return true;
  const requestOrigin=new URL(request.url).origin;
  if(requestOrigin!=='http://dsh.internal')return origin===requestOrigin;

  // The Web carrier validates Host/Origin and admits the owner before normalizing
  // the Fetch URL. It preserves the external Host from the admitted request.
  const authority=request.headers.get('host');
  if(!authority||!/^(?:\[[0-9a-f:.]+\]|[0-9a-z.-]+)(?::\d+)?$/i.test(authority))return false;
  try{
    const external=new URL(origin);
    return (external.protocol==='http:'||external.protocol==='https:')&&external.origin===origin&&
      new URL(external.protocol+'//'+authority).host===external.host;
  }catch{return false;}
}
/** This route is registered only with the official owner-only Connection carrier. */
export function registerHostChannel(ctx:ChannelContext,service:DispatchService):()=>Promise<void> {
  const dispose=ctx.connection.fetch.register({path:'/api/dsh-model-coordinates/v1/operation',methods:['POST'],requestBody:'buffered',async fetch(request){
    if(!acceptsBrowserOrigin(request))return new Response('forbidden',{status:403});
    let requestId:string|undefined;
    try{
      if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw Object.assign(new Error(),{code:'INVALID_REQUEST'});
      const reader=request.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024){await reader.cancel();throw Object.assign(new Error(),{code:'INVALID_REQUEST'});}chunks.push(value);}
      let parsed:unknown;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error(),{code:'INVALID_REQUEST'});}
      const envelope=validateEnvelope(parsed);requestId=envelope.requestId;
      const data=await service.dispatch(envelope.action,envelope.payload);return Response.json({schemaVersion:1,requestId,ok:true,data},{headers:{'cache-control':'no-store'}});
    }catch(error){const safe=safeApiError(error);return Response.json({schemaVersion:1,...(requestId?{requestId}:{}),ok:false,error:safe},{status:safe.code==='INVALID_REQUEST'?400:409,headers:{'cache-control':'no-store'}});}
  }});return async()=>{await dispose();await service.dispose();};
}
