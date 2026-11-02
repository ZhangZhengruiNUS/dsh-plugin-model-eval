import * as React from 'react';import type {GeneralDefinition} from '../../contracts.ts';import {zh as t} from '../locales.ts';
/** Provenance belongs below the result and capability profile. */
export function EvaluationBasis({definition}:{definition:GeneralDefinition|undefined}){
 const five=definition?.schema==='task-five-v1',deep=definition?.tier==='deep';
 return <details className="me-evaluation-basis"><summary>评测依据与计分方式</summary>{five?<>
  <p>任务综合分为以下五项成绩的加权平均，五项各占20%。全部题目有效判分后出总分；写作成绩单独展示。</p>
  <dl><div><dt>知识与推理</dt><dd>MMLU-Pro 精选 {deep?80:24} 题＋OlympiadBench 文本数学精选 {deep?20:6} 题</dd></div><div><dt>资料理解</dt><dd>LongBench v2 固定精选 {deep?50:10} 题</dd></div><div><dt>指令遵循</dt><dd>IFEval 规则适配版 {deep?100:30} 题</dd></div><div><dt>代码能力</dt><dd>CodeContests 精选适配版 {deep?70:20} 题</dd></div><div><dt>工具使用</dt><dd>BFCL v4 多轮基础场景精选 {deep?30:10} 项 · 封闭模拟工具</dd></div></dl>
  <p className="me-help">深入档资料50题来自49份材料，轻量10题包含其中。本工具运行固定精选题集，成绩与原始完整基准或 AA 总分不同尺度。</p>
 </>:<><p>{t.methodBody}</p><p className="me-help">{t.adaptation}</p></>}</details>;
}
