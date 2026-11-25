import * as React from 'react';
import type {ProviderFinishReason, TechnicalError} from '../../contracts.ts';
import {zh as t} from '../locales.ts';
import {Disclosure} from './Disclosure.tsx';

const providerEndLabels: Record<ProviderFinishReason, string> = {
  content_filter: '内容过滤',
  network_error: '网络错误',
};

const httpStatus = (error: TechnicalError) => error.upstream?.httpStatus ?? error.status;

function isRateLimited(error: TechnicalError): boolean {
  return httpStatus(error) === 429 || error.code === 'RATE_LIMIT' || error.code === 'RATE_LIMITED';
}

function failureTitle(error: TechnicalError): string {
  const status = httpStatus(error);
  if (isRateLimited(error)) return '模型接口限流';
  if (error.upstreamCause === 'overload' || error.code === 'OVERLOADED') return '模型服务过载';
  if (status === 503 || error.code === 'SERVICE_UNAVAILABLE') return '模型服务暂不可用';
  if (status !== undefined && status >= 500) return '模型接口服务端错误';
  if (status === 401) return '模型接口认证失败';
  if (status === 403) return '模型接口拒绝访问';
  if (error.upstreamCause === 'transport' || error.code === 'NETWORK_ERROR') return '模型调用传输异常';
  if (error.code === 'UPSTREAM_ERROR') return '模型接口调用中断，原因未明';
  if (error.code === 'ABORTED') return t.abortedHelp;
  return error.message;
}

export function upstreamDiagnosticRows(error: TechnicalError): [string, React.ReactNode][] {
  const diagnostic = error.upstream;
  const status = httpStatus(error);
  const finish = diagnostic?.finishReason;
  const codes = diagnostic?.codes?.filter(code => code !== error.code);
  const rows: [string, React.ReactNode][] = [];
  if (status !== undefined) rows.push(['HTTP 状态', `${status}${diagnostic?.statusFromMessage?'（从错误文本提取）':''}`]);
  if (codes?.length) rows.push(['底层错误码', <code>{codes.join(' · ')}</code>]);
  if (diagnostic?.requestId) rows.push(['上游请求 ID', <code>{diagnostic.requestId}</code>]);
  if (diagnostic?.parameter) rows.push(['相关参数', <code>{diagnostic.parameter}</code>]);
  if (finish && Object.hasOwn(providerEndLabels, finish)) rows.push(['上游结束原因', <>{providerEndLabels[finish]} · <code>{finish}</code></>]);
  if (diagnostic?.detail) rows.push(['接口详情', diagnostic.detail]);
  else if (diagnostic?.detailFiltered) rows.push(['接口详情', '接口错误原文未保留']);
  return rows;
}

export function TaskFailure({error, className}: {error: TechnicalError; className?: string}) {
  const status = httpStatus(error);
  const rows = [['错误码', <code>{error.code}</code>] as const, ...upstreamDiagnosticRows(error)];
  if (status === undefined && (error.upstream || error.upstreamCause || error.code === 'UPSTREAM_ERROR'
    || error.code === 'NETWORK_ERROR' || isRateLimited(error))) rows.push(['HTTP 状态', '未记录']);
  return <div className={['me-inline-warning','me-task-failure',className].filter(Boolean).join(' ')}>
    <div className="me-task-failure-summary">
      <strong>{failureTitle(error)}</strong>
      <span>{t.errorPhases[error.phase]}</span>
      {status !== undefined && <span className="me-task-failure-status">HTTP {status}</span>}
    </div>
    <Disclosure kind="help" title={status !== undefined || error.upstream || error.upstreamCause ? '接口诊断' : '错误详情'}
      className="me-task-failure-details">
      <dl>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Disclosure>
    {isRateLimited(error) && <p className="me-task-failure-hint">可降低题目并发，或稍后继续。</p>}
  </div>;
}
