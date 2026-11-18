import {traceIdValid} from '../estimation/calibration-contracts.ts';
import {validSpeedBudget} from '../speed/budget.ts';
import type {JsonValue} from '../contracts.ts';
export interface ApiEnvelope {schemaVersion:1;requestId:string;action:Action;payload:Record<string,JsonValue>}
const fields={status:[],setCodingDiagnostics:['enabled'],startCodingDiagnostic:['runId','itemId'],codingDiagnostic:['runId','itemId'],cancelCodingDiagnostic:['diagnosticId'],protocolCatalog:[],previewUpgrade:['sourceRunId','deepGeneralId','handle','execution'],commitUpgrade:['token'],previewEditionUpgrade:['sourceRunId','destinationGeneralId','handle','execution'],commitEditionUpgrade:['token','confirmSameDeployment'],catalog:[],settings:[],prepare:['generalId','expectedRootId','expectedRootEpoch'],setRoot:['path'],snapshot:['providerId','modelId','overrides','deployment'],createBatch:['generalId','handles','tracks','judgeHandle','execution','previewId','modelConcurrency','parallelModels'],checkTimeAdvisor:['generalId','handles','tracks','judgeHandle','execution','budgetMinutes'],startSpeedPreview:['generalId','handles','tracks','judgeHandle','execution','budgetMinutes','offerId','intent'],speedPreviewStatus:['previewId'],cancelSpeedPreview:['previewId'],speedHistory:[],speedHistoryUsage:[],previewSpeedCleanup:['previewIds'],commitSpeedCleanup:['token'],speedCleanupStatus:['token'],timingHistory:[],previewTimingCleanup:['groupIds'],commitTimingCleanup:['token'],queue:[],pause:['batchId'],resume:['batchId','judgeHandle'],rejudge:['batchId','operationId'],controlRun:['batchId','runId','operation'],controlRuns:['batchId','runIds','operation'],setRunConcurrency:['batchId','runId','concurrency'],history:[],comparisonMetadata:[],comparisonCommon:['runIds','referenceIds'],report:['runId','includeQuestions'],item:['runId','itemId'],usage:[],formalHistoryUsage:[],previewCleanup:['batchIds'],commitCleanup:['token'],cleanupStatus:['token']} as const;
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
  for(const key of ['runId','sourceRunId','handle','batchId','token','judgeHandle','previewId','diagnosticId','operationId'])if(key in body.payload&&(typeof body.payload[key]!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.payload[key] as string)))return reject();
  if(body.action==='controlRun'&&(!body.payload.batchId||!body.payload.runId||
    !['hold','resume','remove','rejoin'].some(operation=>operation===body.payload.operation)))return reject();
  if(body.action==='controlRuns'){
    const {batchId,runIds,operation}=body.payload;
    if(!batchId||!Array.isArray(runIds)||!runIds.length||runIds.length>20||new Set(runIds).size!==runIds.length||
      runIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))||
      operation!=='hold'&&operation!=='resume')return reject();
  }
  if(body.action==='setRunConcurrency'&&(!body.payload.batchId||!body.payload.runId||
    ![1,2,3,4].some(value=>value===body.payload.concurrency)))return reject();
  if(body.action==='report'&&'includeQuestions' in body.payload&&typeof body.payload.includeQuestions!=='boolean')return reject();
  if(body.action==='rejudge'&&(!body.payload.batchId||!body.payload.operationId))return reject();
  if(body.action==='setCodingDiagnostics'&&typeof body.payload.enabled!=='boolean')return reject();
  if(body.action==='cancelCodingDiagnostic'&&!body.payload.diagnosticId)return reject();
  if(['startCodingDiagnostic','codingDiagnostic'].includes(body.action)&&(!body.payload.runId||typeof body.payload.itemId!=='string'||!body.payload.itemId||body.payload.itemId.length>300))return reject();
  if(['report','item'].includes(body.action)&&!body.payload.runId||['pause','resume'].includes(body.action)&&!body.payload.batchId||['commitUpgrade','commitEditionUpgrade','commitCleanup','cleanupStatus','commitSpeedCleanup','speedCleanupStatus'].includes(body.action)&&!body.payload.token)return reject();
  if(['speedPreviewStatus','cancelSpeedPreview'].includes(body.action)&&!body.payload.previewId)return reject();
  if(body.action==='commitEditionUpgrade'&&body.payload.confirmSameDeployment!==true)return reject();
  if(body.action==='commitTimingCleanup'&&!body.payload.token)return reject();
  if(body.action==='comparisonCommon'){
    const ids=body.payload.runIds,refs=body.payload.referenceIds??[];
    if(!Array.isArray(ids)||!Array.isArray(refs)||ids.length+refs.length<2||ids.length+refs.length>3||new Set(ids).size!==ids.length||new Set(refs).size!==refs.length||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))||refs.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(id)))return reject();
  }
  if(body.action==='previewTimingCleanup'&&(!Array.isArray(body.payload.groupIds)||!body.payload.groupIds.length||new Set(body.payload.groupIds).size!==body.payload.groupIds.length||body.payload.groupIds.some(x=>typeof x!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x))))return reject();
  if(body.action==='previewSpeedCleanup'&&(!Array.isArray(body.payload.previewIds)||!body.payload.previewIds.length||body.payload.previewIds.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x))))return reject();
  if(body.action==='startSpeedPreview'){
    if(!traceIdValid(body.payload.offerId)||body.payload.intent!=='estimate'&&body.payload.intent!=='collect')
      throw Object.assign(new Error('TIME_ADVISOR_OFFER_INVALID'),{code:'TIME_ADVISOR_OFFER_INVALID'});
    if(!validSpeedBudget(body.payload.budgetMinutes))return reject();
  }
  if(body.action==='checkTimeAdvisor'&&'budgetMinutes' in body.payload&&!validSpeedBudget(body.payload.budgetMinutes))return reject();
  if(body.action==='item'&&(typeof body.payload.itemId!=='string'||body.payload.itemId.length>300))return reject();
  if(body.action==='prepare'&&('expectedRootId'in body.payload||'expectedRootEpoch'in body.payload)){const {expectedRootId,expectedRootEpoch}=body.payload;if(typeof expectedRootId!=='string'||!expectedRootId||typeof expectedRootEpoch!=='number'||!Number.isSafeInteger(expectedRootEpoch)||expectedRootEpoch<0)return reject();}
  if(body.action==='setRoot'&&(typeof body.payload.path!=='string'||!body.payload.path||body.payload.path.length>1000))return reject();
  if(body.action==='snapshot'&&(typeof body.payload.providerId!=='string'||typeof body.payload.modelId!=='string'))return reject();
  if(body.action==='previewCleanup'&&(!Array.isArray(body.payload.batchIds)||!body.payload.batchIds.length||body.payload.batchIds.some(x=>typeof x!=='string'||x.length>100)))return reject();
  if(['createBatch','checkTimeAdvisor','startSpeedPreview'].includes(body.action)&&(!Array.isArray(body.payload.handles)||!body.payload.handles.length||body.payload.handles.length>20||body.payload.handles.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x))||!Array.isArray(body.payload.tracks)||!body.payload.execution||typeof body.payload.execution!=='object'||Array.isArray(body.payload.execution)))return reject();
  if(['createBatch','checkTimeAdvisor','startSpeedPreview'].includes(body.action)){
    const execution=body.payload.execution as Record<string,JsonValue>;if(Object.keys(execution).sort().join(',')!=='callTimeoutMs,concurrency'||typeof execution.callTimeoutMs!=='number'||typeof execution.concurrency!=='number')return reject();
    if((body.payload.tracks as JsonValue[]).some(x=>x!=='general'&&x!=='writing'))return reject();
  }
  if(body.action==='createBatch'){
    const {parallelModels,modelConcurrency,handles}=body.payload;
    const count=(handles as JsonValue[]).length;
    if(parallelModels!==undefined&&(typeof parallelModels!=='number'||!Number.isInteger(parallelModels)||parallelModels<1||parallelModels>count))return reject();
    if(modelConcurrency!==undefined&&(!Array.isArray(modelConcurrency)||modelConcurrency.length!==count||
      modelConcurrency.some(concurrency=>![1,2,3,4].some(value=>value===concurrency))))return reject();
  }
  for(const key of ['generalId','deepGeneralId','destinationGeneralId'])if(key in body.payload&&(typeof body.payload[key]!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(body.payload[key] as string)))return reject();
  if(body.action==='previewUpgrade'||body.action==='previewEditionUpgrade'){const p=body.payload,e=p.execution as Record<string,JsonValue>;if(!p.sourceRunId||!(body.action==='previewUpgrade'?p.deepGeneralId:p.destinationGeneralId)||!p.handle||!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='callTimeoutMs,concurrency'||![1,2,3,4].includes(Number(e.concurrency))||typeof e.concurrency!=='number'||!Number.isInteger(e.callTimeoutMs)||Number(e.callTimeoutMs)<1000||Number(e.callTimeoutMs)>1800000)return reject();}
  return body;
}
export function safeApiError(error:unknown):{code:string;message:string;retryable:boolean} {
  const code=(error as {code?:unknown})?.code;const safe=typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(code)?code:'OPERATION_FAILED';
  const messages:Record<string,string>={UPGRADE_TOKEN_INVALID:'补测预览已失效，请重新预览。',UPGRADE_PREVIEW_EXPIRED:'补测预览已过期，请重新预览。',UPGRADE_PREVIEW_STALE:'来源记录已有变化，请重新预览补测。',UPGRADE_TARGET_CHANGED:'模型配置或配置来源已有变化，请重新选择配置并预览。',UPGRADE_SOURCE_NOT_FOUND:'当前目录中没有这条来源记录。',UPGRADE_DETAILS_UNAVAILABLE:'来源明细已清理，无法复用；可另建深入评测。',UPGRADE_DETAILS_INCOMPLETE:'来源明细不完整，无法复用；可另建深入评测。',UPGRADE_SOURCE_CORRUPT:'来源记录无法完整校验，已停止补测。',UPGRADE_IDENTITY_UNVERIFIED:'无法核定路由或配置来源，不能复用此前回答。',UPGRADE_SOURCE_INCOMPLETE:'请先完成轻量档的通用评测。',UPGRADE_PROTOCOL_CHANGED:'共享题目或评分条件不同，不能复用此前成绩。',UPGRADE_TIER_MISMATCH:'这条记录不支持补测为所选深入档。',REUSE_IMPORT_NOT_READY:'补测导入尚未完成，请先恢复本地记录。',REUSE_COPY_CORRUPT:'已导入明细无法完整校验，已停止派发。',REUSE_RECOVERY_REQUIRED:'有未完成的补测导入，请先重启恢复后再清理。',PROTOCOL_NOT_VERIFIED:'所选评测协议尚未开放。',UNKNOWN_PROTOCOL:'评测协议不可用，请核对插件版本。',COMPARISON_STALE:'数据目录正在切换，请稍后重试。',PREVIEW_MISMATCH:'测速条件与当前配置不一致，请重新测速或跳过。',PREVIEW_NOT_FOUND:'测速记录不存在或已清理。',ACTIVITY_BUSY:'当前任务正在运行或收尾，请稍后再试。',INVALID_REQUEST:'请求格式不正确，请刷新后重试。',ENVIRONMENT_NOT_PREPARED:'请先在设置中准备评测环境。',QUEUE_BUSY:'已有评测正在进行，请先暂停。',ROOT_BUSY:'当前操作未结束，暂时不能切换目录。',HISTORY_READ_ONLY:'此目录正由另一个实例使用，当前仅可查看。',CLEANUP_PREVIEW_STALE:'记录已有变化，请重新预览清理范围。',BATCH_ACTIVE:'正在评测的批次不能清理。',ARCHIVED_WRITING_UNAVAILABLE:'本机缺少原版写作题，无法续测此轮。已保存的报告和答卷仍可查看。',RUN_CANNOT_RESUME:'本轮明细已清理，无法续测。',BATCH_RUN_NOT_FOUND:'本批次找不到该配置。',RUN_CONTROL_STALE:'配置状态已变化，请刷新后重试。',NO_RUN_TO_RESUME:'本批次暂无排队的配置，请选择要继续的配置。',TARGET_CHANGED:'宿主模型配置已有变化，请创建新配置评测。',ROOT_NOT_EMPTY:'请选择空目录或本插件创建的数据目录。',ROOT_VERSION_UNSUPPORTED:'此目录使用其他存储版本，未作修改。',JUDGE_REQUIRED:'中文写作需要选择裁判模型。',DUPLICATE_TARGET:'本批次有相同配置，请移除重复项。',INVALID_PARAMETER:'参数格式不受宿主支持，请检查本轮设置。'};
  const timingMessages:Record<string,string>={TIME_ADVISOR_READ_TIMEOUT:'查询本机用时记录超时，请重试。',TIME_ADVISOR_OFFER_INVALID:'本次测速确认已失效，请重新查看用时参考。',TIME_ADVISOR_OFFER_STALE:'评测条件或本机用时记录已有变化，请重新查看用时参考。',TIMING_UNAVAILABLE:'本地估时记录暂不可用；能力评测和已有成绩可继续使用。',TRACE_CLEANUP_STALE:'估时记录或引用已有变化，请重新预览清理。',TRACE_ACTIVE:'所选记录仍在写入，请等待任务结束后清理。',TRACE_NOT_FOUND:'所选估时记录已变化，请刷新后重选。'};
  const editionMessages:Record<string,string>={EDITION_TOKEN_INVALID:'补测预览已失效，请重新预览。',EDITION_PREVIEW_EXPIRED:'补测预览已过期，请重新预览。',EDITION_PREVIEW_STALE:'来源记录或题集已有变化，请重新预览补测。',EDITION_SOURCE_NOT_FOUND:'当前目录中没有这条来源记录。',EDITION_MAPPING_UNAVAILABLE:'这两个版本尚不支持共同题比较和差异补测。',EDITION_DETAILS_UNAVAILABLE:'来源明细已清理，无法复用；可以另建完整评测。',EDITION_DETAILS_INCOMPLETE:'来源明细不完整，暂时无法复用。',EDITION_SOURCE_CORRUPT:'来源记录无法完整校验，已停止补测。',EDITION_SOURCE_INCOMPLETE:'请先完成来源版本的轻量评测。',EDITION_IDENTITY_UNVERIFIED:'无法核定模型配置来源，不能复用此前回答。',EDITION_TARGET_CHANGED:'模型参数或部署标识已有变化，请另建评测。',EDITION_PROTOCOL_CHANGED:'题目或评分条件已有变化，已停止复用。',EDITION_CHAIN_UNSUPPORTED:'这条结果已复用过其他记录。请从原始实测记录补测，或另建完整评测。',UPGRADE_CHAIN_UNSUPPORTED:'这条结果已复用过其他记录。请从原始实测记录升档，或另建深入评测。'};
  const diagnosticMessages:Record<string,string>={CODING_DIAGNOSTIC_DISABLED:'请先在设置中开启开发诊断。',CODING_DIAGNOSTIC_UNSUPPORTED:'这道题不支持本地编程诊断。',CODING_DIAGNOSTIC_ANSWER_UNAVAILABLE:'完整回答不可用，无法运行本地诊断。',CODING_DIAGNOSTIC_CODE_UNAVAILABLE:'无法从回答中提取单份完整代码。',CODING_DIAGNOSTIC_SOURCE_CHANGED:'保存的题目或回答与来源不一致，已停止诊断。',CODING_DIAGNOSTIC_NOT_FOUND:'这次诊断已结束或不在当前目录中。',CODING_DIAGNOSTIC_STORAGE_FAILED:'诊断记录未能保存，请检查数据目录。',CODING_DIAGNOSTIC_RECORD_INVALID:'诊断记录无法校验，可重新运行。'};
  const archiveMessages:Record<string,string>={
    ARCHIVED_GENERAL_UNAVAILABLE:'本机缺少此版本的离线评测资源。已保存的报告和答卷仍可查看。',
    ARCHIVED_GENERAL_CORRUPT:'此版本的离线评测资源未通过校验。已保存的报告和答卷仍可查看。',
  };
  return {code:safe,message:messages[safe]??timingMessages[safe]??editionMessages[safe]??diagnosticMessages[safe]??archiveMessages[safe]??'操作未完成，已保留现有记录。请检查状态后重试。',retryable:safe==='COMPARISON_STALE'||safe==='TIME_ADVISOR_READ_TIMEOUT'};
}
