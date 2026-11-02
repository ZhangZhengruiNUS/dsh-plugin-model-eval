import * as React from 'react';import type {GeneralDefinition} from '../../contracts.ts';import {zh as t} from '../locales.ts';
/** Provenance belongs below the result and capability profile. */
export function EvaluationBasis({definition,expanded}:{definition:GeneralDefinition|undefined;expanded?:boolean}){
 const five=definition?.schema==='task-five-v1',deep=definition?.tier==='deep';
 return <details className="me-evaluation-basis" open={expanded}><summary>评测依据与计分方式</summary>{five?<>
  <p>任务综合分为以下五项成绩的加权平均，五项各占20%。全部题目有效判分后出总分；写作成绩单独展示。</p>
  <dl><div><dt>知识与推理</dt><dd>MMLU-Pro 精选 {deep?80:24} 题＋OlympiadBench 文本数学精选 {deep?20:6} 题</dd></div><div><dt>资料理解</dt><dd>LongBench v2 固定精选 {deep?50:10} 题</dd></div><div><dt>指令遵循</dt><dd>IFEval 规则适配版 {deep?100:30} 题</dd></div><div><dt>代码能力</dt><dd>CodeContests 精选适配版 {deep?70:20} 题</dd></div><div><dt>工具使用</dt><dd>BFCL v4 多轮基础场景精选 {deep?30:10} 项 · 封闭模拟工具</dd></div></dl>
  <p className="me-help">深入档资料50题来自49份材料，轻量10题包含其中。本工具运行固定精选题集，成绩与原始完整基准或 AA 总分不同尺度；综合分不代表具体业务的成功率。</p>
  <details><summary>查看原研究与采用依据</summary><ul className="me-source-links">
   <li><a href="https://github.com/TIGER-AI-Lab/MMLU-Pro" target="_blank" rel="noreferrer">MMLU-Pro 原论文与代码</a> · 知识与推理；<a href="https://docs.nvidia.com/aiperf/accuracy/accuracy-benchmarking" target="_blank" rel="noreferrer">NVIDIA AIPerf 评测实现</a>。</li>
   <li><a href="https://github.com/OpenBMB/OlympiadBench" target="_blank" rel="noreferrer">OlympiadBench 原论文与代码</a> · 数学推导；<a href="https://qwenlm.github.io/blog/qwen2.5-math/" target="_blank" rel="noreferrer">Qwen2.5-Math 评测采用</a>。</li>
   <li><a href="https://github.com/THUDM/LongBench" target="_blank" rel="noreferrer">LongBench v2 原论文与代码</a> · 给定资料理解；<a href="https://github.com/deepseek-ai/DeepSeek-V3" target="_blank" rel="noreferrer">DeepSeek-V3 评测采用</a>。</li>
   <li><a href="https://github.com/google-research/google-research/tree/master/instruction_following_eval" target="_blank" rel="noreferrer">IFEval 原评分代码与研究</a> · 可核验指令约束；<a href="https://huggingface.co/datasets/google/IFEval/blob/main/README.md" target="_blank" rel="noreferrer">Google 数据卡及 Open LLM Leaderboard 采用入口</a>。</li>
   <li><a href="https://github.com/google-deepmind/code_contests" target="_blank" rel="noreferrer">CodeContests 原数据、代码与论文</a> · 编程解题，源自 AlphaCode 研究；不等于完整软件工程评测。</li>
   <li><a href="https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html" target="_blank" rel="noreferrer">BFCL 多轮方法与代码入口</a> · 工具选择和连续操作；<a href="https://gorilla.cs.berkeley.edu/leaderboard.html" target="_blank" rel="noreferrer">Berkeley V4 公开比较</a>。本工具固定离线模拟场景，不调用真实业务工具。</li>
  </ul><p className="me-help">以上说明来源基准的研究或采用基础，不代表这些团队认可本工具的精选题集或综合分。</p></details>
 </>:<><p>{t.methodBody}</p><p className="me-help">{t.adaptation}</p></>}</details>;
}
