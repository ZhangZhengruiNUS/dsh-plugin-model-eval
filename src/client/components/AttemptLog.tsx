import * as React from 'react';
import type {StreamFinishReason} from '../../contracts.ts';
import type {AttemptRecord} from '../../history/store.ts';
import {zh as t} from '../locales.ts';
import {time} from '../store.ts';
import {upstreamDiagnosticRows} from './TaskFailure.tsx';

const streamEndLabels:Record<StreamFinishReason,string>={
  stop:'正常结束','max-tokens':'达到输出长度限制','tool-calls':'返回工具调用',error:'流返回错误',aborted:'流已中止',
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
  const streamEnd=observation?.streamFinishReason;
  const firstOutput=timing?.firstOutputMs;
  const lastOutput=timing?.lastOutputMs;
  const streamDuration=timing?.streamMs;
  const textSeen=observation?.textReceived??(measured(timing?.firstTextMs)?true:undefined);
  const textStatus=textSeen===true?'已收到':textSeen===false?'未收到':
    attempt.phase==='judge'&&attempt.rawText!==undefined?(attempt.rawText?'已保存':'未保存'):undefined;
  const rows:[string,React.ReactNode][]=[];

  if(streamEnd&&Object.hasOwn(streamEndLabels,streamEnd))rows.push(['响应结束',streamEndLabels[streamEnd]]);
  else if(error)rows.push(['响应结束','未记录']);
  if(error)rows.push(['错误码',<code>{error.code}</code>],...upstreamDiagnosticRows(error));
  if(attempt.validationError)rows.push(['校验错误码',<code>{attempt.validationError.code}</code>]);

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
