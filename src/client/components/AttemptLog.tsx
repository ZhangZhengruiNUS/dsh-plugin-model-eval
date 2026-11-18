import * as React from 'react';
import type {ProviderFinishReason,StreamFinishReason} from '../../contracts.ts';
import type {AttemptRecord} from '../../history/store.ts';
import {zh as t} from '../locales.ts';
import {time} from '../store.ts';

const streamEndLabels:Record<StreamFinishReason,string>={
  stop:'正常结束','max-tokens':'达到输出长度限制','tool-calls':'返回工具调用',error:'流返回错误',aborted:'流已中止',
};
const providerEndLabels:Record<ProviderFinishReason,string>={
  content_filter:'内容过滤',network_error:'网络错误',
};
const attemptStatus:Record<AttemptRecord['status'],string>={
  started:'进行中',completed:'调用完成',failed:'调用失败',interrupted:'已中断',
};
const measured=(ms:unknown):ms is number=>typeof ms==='number'&&Number.isFinite(ms)&&ms>=0;
const seconds=(ms:number)=>`${(ms/1000).toFixed(3)} 秒`;

function AttemptDetails({attempt,index}:{attempt:AttemptRecord;index:number}){
  const observation=attempt.observations;
  const timing=observation?.timing;
  const error=attempt.error;
  const diagnostic=error?.upstream;
  const streamEnd=observation?.streamFinishReason;
  const providerEnd=diagnostic?.finishReason;
  const httpStatus=diagnostic?.httpStatus??error?.status;
  const codes=diagnostic?.codes?.filter(code=>code!==error?.code);
  const firstOutput=timing?.firstOutputMs;
  const lastOutput=timing?.lastOutputMs;
  const streamDuration=timing?.streamMs;
  const textSeen=observation?.textReceived??(measured(timing?.firstTextMs)?true:undefined);
  const textStatus=textSeen===true?'已收到':textSeen===false?'未收到':
    attempt.phase==='judge'&&attempt.rawText!==undefined?(attempt.rawText?'已保存':'未保存'):undefined;
  const rows:[string,React.ReactNode][]=[];

  if(streamEnd&&Object.hasOwn(streamEndLabels,streamEnd))rows.push(['响应结束',streamEndLabels[streamEnd]]);
  else if(error)rows.push(['响应结束','未记录']);
  if(providerEnd&&Object.hasOwn(providerEndLabels,providerEnd))rows.push(['上游结束原因',<>{providerEndLabels[providerEnd]} · <code>{providerEnd}</code></>]);
  if(error)rows.push(['错误码',<code>{error.code}</code>]);
  if(codes?.length)rows.push(['底层错误码',<code>{codes.join(' · ')}</code>]);
  if(attempt.validationError)rows.push(['校验错误码',<code>{attempt.validationError.code}</code>]);
  if(httpStatus!==undefined)rows.push(['HTTP 状态',`${httpStatus}${diagnostic?.statusFromMessage?'（从错误文本提取）':''}`]);
  if(diagnostic?.requestId)rows.push(['上游请求 ID',<code>{diagnostic.requestId}</code>]);
  if(diagnostic?.parameter)rows.push(['相关参数',<code>{diagnostic.parameter}</code>]);
  if(diagnostic?.detail)rows.push(['错误详情',diagnostic.detail]);

  if(timing?.sawReasoning)rows.push(['推理输出','已观察到']);
  if(textStatus)rows.push([attempt.phase==='judge'?'评分正文':'正文',textStatus]);
  if(measured(streamDuration))rows.push(['流耗时',seconds(streamDuration)]);
  if(measured(firstOutput))rows.push(['首个输出片段',`流开始后 ${seconds(firstOutput)}`]);
  if(measured(timing?.firstTextMs))rows.push(['首个正文片段',`流开始后 ${seconds(timing.firstTextMs)}`]);
  if(measured(lastOutput)){
    rows.push(['最后输出片段',`流开始后 ${seconds(lastOutput)}`]);
    if(measured(streamDuration)&&streamDuration>=lastOutput)rows.push(['最后输出片段至流结束',seconds(streamDuration-lastOutput)]);
  }
  const usage=observation?.usage;
  if(usage?.available)rows.push(['输入 / 输出 Token',`${usage.inputTokens?.toLocaleString()??'—'} / ${usage.outputTokens?.toLocaleString()??'—'}`]);

  const state=attempt.validationError?'响应完成，校验失败':attemptStatus[attempt.status];
  return <li>
    <div className="me-attempt-header">
      <strong>{index+1} · {attempt.phase==='judge'?'裁判判分':'待测模型作答'} · {state}</strong>
      <time dateTime={attempt.startedAt}>{time(attempt.startedAt)}</time>
    </div>
    {rows.length>0&&<dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
  </li>;
}

export function AttemptLog({attempts}:{attempts:readonly AttemptRecord[]}){
  return <details>
    <summary>{t.attempts} · {attempts.length}</summary>
    {attempts.length>0
      ? <ol className="me-attempt-list" role="list">{attempts.map((attempt,index)=><AttemptDetails key={attempt.attemptId} attempt={attempt} index={index}/>)}</ol>
      : <p className="me-help">暂无调用记录</p>}
  </details>;
}
