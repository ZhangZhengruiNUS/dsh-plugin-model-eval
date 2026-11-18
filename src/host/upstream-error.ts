
import type {ProviderFinishReason,UpstreamDiagnostic,UpstreamFailureCause} from '../contracts.ts';

const MAX_INPUT=16_384;
const requestHeaders=['x-request-id','request-id','x-tt-logid','x-volc-request-id','x-ark-request-id','x-amzn-requestid'];
const requestFields=['requestId','requestID','request_id','RequestId','RequestID'];
const codeFields=['code','Code','error_code','errorCode','providerCode','type'];
const childFields=['cause','failure','error','Error','response','data','body','ResponseMetadata','responseMetadata'];
const parameters=new Set(['max_tokens','max_completion_tokens','max_output_tokens','temperature','top_p','reasoning_effort',
  'model','messages','reasoning_content','tools','tool_choice','tool_call_id','stream','stop']);
const transportCodes=[
  'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','UND_ERR_ABORTED',
  'UND_ERR_RESPONSE_STATUS_CODE','UND_ERR_RES_CONTENT_LENGTH_MISMATCH','UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
  'UND_ERR_DESTROYED','UND_ERR_CLOSED','UND_ERR_RES_EXCEEDED_MAX_SIZE','UND_ERR_HTTP_PARSER',
  'ERR_TLS_CERT_ALTNAME_INVALID','ERR_TLS_HANDSHAKE_TIMEOUT','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ECONNRESET','ECONNREFUSED','ECONNABORTED',
  'ENETUNREACH','EHOSTUNREACH','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','EPIPE',
];
const codeToken=new RegExp('\\b(?:'+transportCodes.join('|')+')\\b','g');
const knownCodes=new Set([
  ...transportCodes,
  'UPSTREAM_ERROR','PI_AI_ERROR','SERVER','TRANSPORT','TIMEOUT','NETWORK_ERROR','LLM_STREAM_IDLE_TIMEOUT',
  'INCOMPLETE_STREAM','ABORTED','AUTH','AUTHENTICATION_ERROR','AUTHENTICATION_FAILED','PERMISSION_DENIED',
  'INVALID_REQUEST','MODEL_NOT_FOUND','RATE_LIMIT','RATE_LIMITED','OVERLOADED','SERVICE_UNAVAILABLE',
  'INVALID_CONFIG','CONTEXT_LENGTH_EXCEEDED','CONTEXT_WINDOW_EXCEEDED','UNSUPPORTED_OPTION','UNSUPPORTED_REASONING_EFFORT',
  'INVALID_MODEL_MAX_TOKENS','MISSING_CREDENTIAL','NO_ADAPTER','UNKNOWN_MODEL','TOOLS_NOT_SUPPORTED',
  'invalid_request_error','authentication_error','permission_error','rate_limit_error','server_error','api_error',
  'overloaded_error','insufficient_quota','context_length_exceeded','model_not_found','invalid_api_key',
  'unsupported_value','unsupported_parameter','invalid_parameter','content_policy_violation',
]);
const providerCode=/^(?:InvalidParameter|InvalidParameterValue|InvalidArgument|MissingParameter|UnsupportedParameter|UnsupportedOperation|InvalidRequest|AuthenticationError|AccessDenied|Forbidden|Unauthorized|ResourceNotFound|ModelNotFound|ModelNotOpen|Throttling|RateLimitExceeded|RequestTimeout|GatewayTimeout|BadGateway|ServiceUnavailable|InternalServerError|InternalServiceError|InternalError|Overloaded|QuotaExceeded)(?:\.(?:InvalidValue|Missing|Unsupported|Exceeded|NotFound|ValueOutOfRange|ContextLengthExceeded|InvalidModel|ModelNotFound|AccessDenied))?$/;
const requestIdPattern=/^(?:(?:req(?:uest)?|rqt|resp|logid)[-_][a-zA-Z0-9_-]{8,112}|[0-9a-f]{16,96}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const requestIdSuffix=/^\s*\((?:request[ _-]?id|x-request-id|x-tt-logid)[ \t]*[:=][ \t]*([A-Za-z0-9_-]{16,128})\)[ \t]*$/i;
const httpReason=/^(?:bad gateway|service unavailable|internal server error|too many requests|rate limit exceeded|invalid request|bad request|gateway timeout|unauthorized|forbidden|status code \(no body\))[ \t]*/i;
const detailPatterns=[
  /\b(?:connect|connection|request|gateway|upstream|read|headers|response) (?:timed out|timeout)(?: error)?\b/i,
  /\b(?:connection reset by peer|connection refused|connection closed|socket hang up|other side closed|premature close|fetch failed)\b/i,
  /\b(?:stream ended before completion|stream ended without a finish reason|incomplete stream|no response headers|status code \(no body\))\b/i,
  /\b(?:bad gateway|service unavailable|service temporarily unavailable|internal server error|server overloaded|too many requests|rate limit exceeded)\b/i,
  /\b(?:invalid parameter|missing required parameter|unsupported parameter|invalid request|model not found|context length exceeded|permission denied|authentication failed|quota exceeded)\b/i,
  /\b(?:reasoning_content|tool_call_id) (?:is required|is missing|must be present|must be passed back)\b/i,
  /\b(?:max_tokens|max_output_tokens|max_completion_tokens) must be (?:between \d{1,8} and \d{1,8}|(?:at most|less than or equal to|greater than or equal to) \d{1,8})(?!\d)/i,
  /\b(?:max_tokens|max_output_tokens|max_completion_tokens) (?:cannot|must not) exceed \d{1,8}(?!\d)/i,
];

function own(value:unknown,key:string):unknown {
  if(!value||typeof value!=='object')return undefined;
  try{return Object.getOwnPropertyDescriptor(value,key)?.value;}
  catch{return undefined;}
}
function short(value:unknown):string|undefined {
  return typeof value==='string'&&value.length<=160?value.trim():undefined;
}
function asStatus(value:unknown):number|undefined {
  if(typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=599)return value;
  if(typeof value==='string'&&/^[1-5]\d{2}$/.test(value))return Number(value);
}
function knownId(value:unknown):string|undefined {
  const id=short(value);
  return id&&requestIdPattern.test(id)?id:undefined;
}
function requestFromHeaders(headers:unknown):string|undefined {
  for(const name of requestHeaders){
    try{
      const value=headers instanceof Headers?headers.get(name):
        own(headers,name)??own(headers,name.toUpperCase())??own(headers,name.replace(/(^|-)[a-z]/g,m=>m.toUpperCase()));
      const id=knownId(value);
      if(id)return id;
    }catch{/* No arbitrary header enumeration or fallback serialization. */}
  }
}
/** Read only a leading, complete JSON object in an SDK-formatted error. */
function jsonPrefix(text:string):{value:unknown;end:number}|undefined {
  if(text[0]!=='{')return undefined;
  let depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(c==='\\')escaped=true;
      else if(c==='"')quoted=false;
    }else if(c==='"')quoted=true;
    else if(c==='{')depth++;
    else if(c==='}'&&--depth===0){
      try{return {value:JSON.parse(text.slice(0,i+1)),end:i+1};}catch{return undefined;}
    }
  }
}

/** Project an error across the persistence boundary. Arbitrary provider prose is never saved. */
export function captureUpstreamDiagnostic(input:unknown):UpstreamDiagnostic|undefined {
  const codes=new Set<string>(),detail=new Set<string>();
  const seen=new WeakSet<object>();
  let httpStatus:number|undefined,inferredStatus:number|undefined,requestId:string|undefined,inferredRequestId:string|undefined,parameter:string|undefined;
  let finishReason:ProviderFinishReason|undefined;
  let detailFiltered=false,nodes=0;
  function addCode(value:unknown){
    const code=short(typeof value==='number'&&Number.isSafeInteger(value)?String(value):value);
    if(code&&codes.size<8&&(knownCodes.has(code)||providerCode.test(code)||/^[1-9][0-9]{2,7}$/.test(code)))codes.add(code);
  }
  function keepFinishReason(reason:unknown):void {
    if(reason==='content_filter'||reason==='network_error')finishReason??=reason;
  }
  function inspectText(value:string,depth:number):void {
    // Parse only complete bounded messages. A partial prefix may end inside a secret or a prompt.
    if(value.length>MAX_INPUT){detailFiltered=true;return;}
    if(!value.trim())return;
    detailFiltered=true;
    const text=value.trim();
    const header=/^(?:(?:HTTP(?:\s+status(?:\s+code)?)?|Error)\s*[: ]+\s*)?([45]\d{2})(?=\s|:|\{|$)\s*:?\s*/i.exec(text);
    if(header)inferredStatus??=Number(header[1]);
    const body=header?text.slice(header[0].length):text;
    // The SDK emits this exact terminal message. Only preserve known values.
    const terminal=/^Provider finish_reason: (content_filter|network_error)$/.exec(body);
    if(terminal)keepFinishReason(terminal[1]);
    const json=jsonPrefix(body);
    if(json){
      inspect(json.value,depth+1);
      if(header)inferredRequestId??=knownId(requestIdSuffix.exec(body.slice(json.end))?.[1]);
      return;
    }
    const reason=header&&httpReason.exec(body);
    if(reason)inferredRequestId??=knownId(requestIdSuffix.exec(body.slice(reason[0].length))?.[1]);
    // Preserve original wording only for closed diagnostic phrases and numeric limits.
    for(const pattern of detailPatterns){
      const phrase=pattern.exec(text)?.[0];
      if(phrase&&detail.size<5)detail.add(phrase.replace(/\s+/g,' '));
    }
    for(const match of text.matchAll(codeToken)){addCode(match[0]);if(codes.size>=8)break;}
  }
  function inspect(value:unknown,depth:number):void {
    if(depth>4||nodes++>=24){detailFiltered=true;return;}
    if(typeof value==='string'){inspectText(value,depth);return;}
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    keepFinishReason(own(value,'finish_reason'));
    for(const key of codeFields)addCode(own(value,key));
    httpStatus??=asStatus(own(value,'status'))??asStatus(own(value,'statusCode'))??asStatus(own(value,'httpStatus'));
    for(const key of requestFields)requestId??=knownId(own(value,key));
    requestId??=requestFromHeaders(own(value,'headers'));
    const param=short(own(value,'param'))??short(own(value,'parameter'));
    if(param&&parameters.has(param))parameter??=param;
    for(const key of ['message','Message','detail','errorMessage']){
      const message=own(value,key);
      if(typeof message==='string')inspectText(message,depth);
    }
    for(const key of childFields){
      const child=own(value,key);
      if(child!==undefined)inspect(child,depth+1);
    }
  }
  inspect(input,0);
  const status=httpStatus??inferredStatus;
  requestId??=inferredRequestId;
  if(!codes.size&&!detail.size&&!status&&!requestId&&!parameter&&!finishReason&&!detailFiltered)return undefined;
  return {
    ...(codes.size?{codes:[...codes]}:{}),
    ...(status?{httpStatus:status,...(!httpStatus?{statusFromMessage:true as const}:{})}:{}),
    ...(requestId?{requestId}:{}),
    ...(parameter?{parameter}:{}),
    ...(detail.size?{detail:[...detail].join(' · ')}:{}),
    ...(finishReason?{finishReason}:{}),
    ...(detailFiltered?{detailFiltered:true as const}:{}),
  };
}

export const configFailureCodes=new Set(['TOOLS_NOT_SUPPORTED','UNSUPPORTED_TOOLS','CONTEXT_LENGTH_EXCEEDED','CONTEXT_WINDOW_EXCEEDED','UNSUPPORTED_OPTION','UNSUPPORTED_REASONING_EFFORT','INVALID_CONFIG','INVALID_PREPARED_CALL','MISSING_CREDENTIAL','NO_ADAPTER','UNKNOWN_MODEL','REGISTRATION_DISPOSED','INVALID_MODEL_MAX_TOKENS','AUTHENTICATION_ERROR','AUTHENTICATION_FAILED','PERMISSION_DENIED','INVALID_REQUEST','MODEL_NOT_FOUND']);

const definitiveErrorCodes=new Set(['ABORTED','AUTH','invalid_request_error','invalid_api_key','permission_error','invalid_parameter','unsupported_parameter']);
const certificateErrorCodes=new Set(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);

export function diagnosticBlocksRetry(diagnostic:UpstreamDiagnostic|undefined):boolean {
  return diagnostic?.codes?.some(code=>configFailureCodes.has(code.toUpperCase())||
    definitiveErrorCodes.has(code)||certificateErrorCodes.has(code))??false;
}

export function hasInferredOverload(status:number|undefined,diagnostic:UpstreamDiagnostic|undefined):boolean {
  const diagnosticStatus=diagnostic?.httpStatus;
  return status===undefined&&(diagnosticStatus===undefined||diagnosticStatus>=500)&&
    (diagnosticStatus===529||diagnostic?.codes?.includes('overloaded_error')===true)&&!diagnosticBlocksRetry(diagnostic);
}

export function upstreamFailureCause(code:string,providerCode:string|undefined,status:number|undefined,diagnostic:UpstreamDiagnostic|undefined):UpstreamFailureCause|undefined {
  if(code==='OVERLOADED')return 'overload';
  if(code!=='UPSTREAM_ERROR')return undefined;
  if(status===529||hasInferredOverload(status,diagnostic))return 'overload';
  if(providerCode==='TRANSPORT')return 'transport';
  return 'unknown';
}
