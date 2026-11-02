import {validSpeedBudget} from '../speed/budget.ts';
import type {JsonValue} from '../contracts.ts';
export interface ApiEnvelope {schemaVersion:1;requestId:string;action:Action;payload:Record<string,JsonValue>}
const fields={status:[],protocolCatalog:[],previewUpgrade:['sourceRunId','deepGeneralId','handle','execution'],commitUpgrade:['token'],catalog:[],settings:[],prepare:[],setRoot:['path'],snapshot:['providerId','modelId','overrides','deployment'],createBatch:['generalId','handles','tracks','judgeHandle','execution','previewId'],startSpeedPreview:['generalId','handles','tracks','judgeHandle','execution','budgetMinutes'],speedPreviewStatus:['previewId'],cancelSpeedPreview:['previewId'],speedHistory:[],previewSpeedCleanup:['previewIds'],commitSpeedCleanup:['token'],speedCleanupStatus:['token'],queue:[],pause:['batchId'],resume:['batchId','judgeHandle'],history:[],comparisonMetadata:[],report:['runId'],item:['runId','itemId'],usage:[],previewCleanup:['batchIds'],commitCleanup:['token'],cleanupStatus:['token']} as const;
export type Action=keyof typeof fields;
const reject=():never=>{throw Object.assign(new Error('INVALID_REQUEST'),{code:'INVALID_REQUEST'});};
function json(value:unknown,depth=0):void {
  if(depth>16)reject();if(value===null||typeof value==='boolean')return;if(typeof value==='number'){if(!Number.isFinite(value))reject();return;}
  if(typeof value==='string'){if(value.length>60000)reject();return;}
  if(!value||typeof value!=='object')return reject();
  if(Array.isArray(value)){if(value.length>1000)reject();for(const row of value)json(row,depth+1);return;}
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)reject();
  for(const [key,item] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))reject();json(item,depth+1);}
}
export function validateEnvelope(value:unknown):ApiEnvelope {
  json(value);const body=value as ApiEnvelope;
  if(!body||Object.keys(body).sort().join(',')!=='action,payload,requestId,schemaVersion'||body.schemaVersion!==1||typeof body.requestId!=='string'||!body.requestId||body.requestId.length>100||!Object.hasOwn(fields,body.action)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return reject();
  const allowed:readonly string[]=fields[body.action];if(Object.keys(body.payload).some(k=>!allowed.includes(k)))return reject();
  for(const key of ['runId','sourceRunId','handle','batchId','token','judgeHandle','previewId'])if(key in body.payload&&(typeof body.payload[key]!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.payload[key] as string)))return reject();
  if(['report','item'].includes(body.action)&&!body.payload.runId||['pause','resume'].includes(body.action)&&!body.payload.batchId||['commitUpgrade','commitCleanup','cleanupStatus','commitSpeedCleanup','speedCleanupStatus'].includes(body.action)&&!body.payload.token)return reject();
  if(['speedPreviewStatus','cancelSpeedPreview'].includes(body.action)&&!body.payload.previewId)return reject();
  if(body.action==='previewSpeedCleanup'&&(!Array.isArray(body.payload.previewIds)||!body.payload.previewIds.length||body.payload.previewIds.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x))))return reject();
  if(body.action==='startSpeedPreview'&&!validSpeedBudget(body.payload.budgetMinutes))return reject();
  if(body.action==='item'&&(typeof body.payload.itemId!=='string'||body.payload.itemId.length>300))return reject();
  if(body.action==='setRoot'&&(typeof body.payload.path!=='string'||!body.payload.path||body.payload.path.length>1000))return reject();
  if(body.action==='snapshot'&&(typeof body.payload.providerId!=='string'||typeof body.payload.modelId!=='string'))return reject();
  if(body.action==='previewCleanup'&&(!Array.isArray(body.payload.batchIds)||!body.payload.batchIds.length||body.payload.batchIds.some(x=>typeof x!=='string'||x.length>100)))return reject();
  if(['createBatch','startSpeedPreview'].includes(body.action)&&(!Array.isArray(body.payload.handles)||!body.payload.handles.length||body.payload.handles.length>20||body.payload.handles.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x))||!Array.isArray(body.payload.tracks)||!body.payload.execution||typeof body.payload.execution!=='object'||Array.isArray(body.payload.execution)))return reject();
  if(['createBatch','startSpeedPreview'].includes(body.action)){
    const execution=body.payload.execution as Record<string,JsonValue>;if(Object.keys(execution).sort().join(',')!=='callTimeoutMs,concurrency'||typeof execution.callTimeoutMs!=='number'||typeof execution.concurrency!=='number')return reject();
    if((body.payload.tracks as JsonValue[]).some(x=>x!=='general'&&x!=='writing'))return reject();
  }
  for(const key of ['generalId','deepGeneralId'])if(key in body.payload&&(typeof body.payload[key]!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(body.payload[key] as string)))return reject();
  if(body.action==='previewUpgrade'){const p=body.payload,e=p.execution as Record<string,JsonValue>;if(!p.sourceRunId||!p.deepGeneralId||!p.handle||!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='callTimeoutMs,concurrency'||![1,2,3,4].includes(Number(e.concurrency))||typeof e.concurrency!=='number'||!Number.isInteger(e.callTimeoutMs)||Number(e.callTimeoutMs)<1000||Number(e.callTimeoutMs)>1800000)return reject();}
  return body;
}
export function safeApiError(error:unknown):{code:string;message:string;retryable:boolean} {
  const code=(error as {code?:unknown})?.code;const safe=typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(code)?code:'OPERATION_FAILED';
  const messages:Record<string,string>={UPGRADE_TOKEN_INVALID:'补测预览已失效，请重新预览。',UPGRADE_PREVIEW_EXPIRED:'补测预览已过期，请重新预览。',UPGRADE_PREVIEW_STALE:'来源记录已有变化，请重新预览补测。',UPGRADE_TARGET_CHANGED:'模型配置或配置来源已有变化，请重新选择配置并预览。',UPGRADE_SOURCE_NOT_FOUND:'当前目录中没有这条来源记录。',UPGRADE_DETAILS_UNAVAILABLE:'来源明细已清理，无法复用；可另建深入评测。',UPGRADE_DETAILS_INCOMPLETE:'来源明细不完整，无法复用；可另建深入评测。',UPGRADE_SOURCE_CORRUPT:'来源记录无法完整校验，已停止补测。',UPGRADE_IDENTITY_UNVERIFIED:'无法核定路由或配置来源，不能复用此前回答。',UPGRADE_SOURCE_INCOMPLETE:'请先完成轻量档的通用评测。',UPGRADE_PROTOCOL_CHANGED:'共享题目或评分条件不同，不能复用此前成绩。',UPGRADE_TIER_MISMATCH:'这条记录不支持补测为所选深入档。',REUSE_IMPORT_NOT_READY:'补测导入尚未完成，请先恢复本地记录。',REUSE_COPY_CORRUPT:'已导入明细无法完整校验，已停止派发。',REUSE_RECOVERY_REQUIRED:'有未完成的补测导入，请先重启恢复后再清理。',PROTOCOL_NOT_VERIFIED:'所选评测协议尚未开放。',UNKNOWN_PROTOCOL:'评测协议不可用，请核对插件版本。',COMPARISON_STALE:'数据目录正在切换，请稍后重试。',PREVIEW_MISMATCH:'测速条件与当前配置不一致，请重新测速或跳过。',PREVIEW_NOT_FOUND:'测速记录不存在或已清理。',ACTIVITY_BUSY:'当前任务正在运行或收尾，请稍后再试。',INVALID_REQUEST:'请求格式不正确，请刷新后重试。',ENVIRONMENT_NOT_PREPARED:'请先在设置中准备评测环境。',QUEUE_BUSY:'已有评测正在进行，请先暂停。',ROOT_BUSY:'当前操作未结束，暂时不能切换目录。',HISTORY_READ_ONLY:'此目录正由另一个实例使用，当前仅可查看。',CLEANUP_PREVIEW_STALE:'记录已有变化，请重新预览清理范围。',BATCH_ACTIVE:'正在评测的批次不能清理。',RUN_CANNOT_RESUME:'本轮明细已清理，无法续测。',TARGET_CHANGED:'宿主模型配置已有变化，请创建新配置评测。',ROOT_NOT_EMPTY:'请选择空目录或本插件创建的数据目录。',ROOT_VERSION_UNSUPPORTED:'此目录使用其他存储版本，未作修改。',JUDGE_REQUIRED:'中文写作需要选择裁判模型。',DUPLICATE_TARGET:'本批次有相同配置，请移除重复项。',INVALID_PARAMETER:'参数格式不受宿主支持，请检查本轮设置。'};
  return {code:safe,message:messages[safe]??'操作未完成，已保留现有记录。请检查状态后重试。',retryable:safe==='COMPARISON_STALE'};
}
