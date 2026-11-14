import {Disclosure} from './Disclosure.tsx';
import {isFiveCapabilitySchema} from '../../evaluation/five-schema.ts';
import {CURRENT_WRITING_ID,LEGACY_WRITING_ID,writingEditionFor} from '../../evaluation/writing-edition.ts';
import * as React from 'react';import type {GeneralDefinition} from '../../contracts.ts';import {zh as t} from '../locales.ts';
const basisTitle='评测依据与计分方式';

export function WritingEvaluationBasis({writingId=CURRENT_WRITING_ID,questionCount,expanded}:{
  writingId?:string;questionCount?:number|undefined;expanded?:boolean;
}={}) {
 const total=questionCount??writingEditionFor(writingId)?.questionCount;
 const content=<div className="me-evaluation-basis me-evaluation-basis--writing">
   <dl>
    {total!==undefined&&<div><dt>题量</dt><dd>{total} 题</dd></div>}
    {writingId==='work-writing-12-v2'&&<div><dt>题目来源</dt><dd>从 <a href="https://huggingface.co/datasets/IDEA-CCNL/Ziya-Writing-Eval-Chinese" target="_blank" rel="noreferrer">Ziya 中文写作评估集</a>精选 10 题，另有 2 道项目原创题。</dd></div>}
    {writingId===LEGACY_WRITING_ID&&<div><dt>题目来源</dt><dd>Ziya 中文写作评估集和 WritingBench 精选题。</dd></div>}
    <div><dt>评分维度</dt><dd>所选裁判按{Object.values(t.dimensions).join('、')}逐项评分，每项 0–4 分。</dd></div>
    <div><dt>写作分</dt><dd>五维等权，单题换算为 0–100 分。全部题目有效判分后取平均，写作分单独展示。</dd></div>
   </dl>
  </div>;
 return expanded?content:<Disclosure kind="help" title={basisTitle} className="me-basis-disclosure">{content}</Disclosure>;
}

/** Provenance belongs below the result and capability profile. */
export function EvaluationBasis({definition,questionCount,expanded}:{definition:GeneralDefinition|undefined;questionCount?:number|undefined;expanded?:boolean}){
 const five=isFiveCapabilitySchema(definition?.schema),deep=definition?.tier==='deep';
 const knowledge=definition?.domains.find(domain=>domain.id==='knowledge')?.itemIds;
 const original=definition?.schema==='task-five-original-v1';
 const originalKnowledge=knowledge?.filter(id=>id.startsWith('knowledge/model-eval-original-v1/')).length;
 const count=(id:string)=>definition?.domains.find(domain=>domain.id===id)?.itemIds.length;
 const total=questionCount??definition?.domains.reduce((sum,domain)=>sum+domain.itemIds.length,0);
 const totalRow=total!==undefined&&<div><dt>题量</dt><dd>{total} 题</dd></div>;
 const content=five?<>
  <p>任务综合分为以下五项成绩的加权平均，五项各占20%。全部题目有效判分后出总分；写作成绩单独展示。</p>
  <dl>{totalRow}<div><dt>知识与推理</dt><dd>{original&&<>原创选择 {originalKnowledge} 题＋</>}MMLU-Pro 精选 {knowledge?.filter(id=>id.startsWith('knowledge/mmlu-pro/')).length??(deep?80:24)} 题＋OlympiadBench 文本数学精选 {knowledge?.filter(id=>id.startsWith('math/')).length??(deep?20:6)} 题</dd></div><div><dt>资料理解</dt><dd>LongBench v2 固定精选 {count('reading')} 题</dd></div><div><dt>指令遵循</dt><dd>IFEval 规则适配版 {count('instructions')} 题</dd></div><div><dt>代码能力</dt><dd>{original?'原创编程':'CodeContests 精选适配版'} {count('coding')} 题</dd></div><div><dt>工具使用</dt><dd>BFCL v4 多轮基础场景精选 {count('tools')} 项 · 封闭模拟工具</dd></div></dl>
  {definition?.schema==='task-five-v3-r1'&&<p className="me-help">评分修订：统一排除2道条件不明确的题；修正符号计数、选项内容识别和2项工具场景判分。旧版成绩保留，分开比较。</p>}{definition?.schema==='task-five-v3-r2'&&<p className="me-help">评分修订2：题目和权重不变，仅修正一项工具答案格式的判分。旧版成绩保留，分开比较。</p>}<p className="me-help">深入档资料50题来自49份材料；轻量档使用其中的固定子集。本工具运行固定精选题集，成绩与原始完整基准或 AA 总分不同尺度；综合分不代表具体业务的成功率。</p>
  <h4>原研究与采用依据</h4><ul className="me-source-links">
   <li><a href="https://github.com/TIGER-AI-Lab/MMLU-Pro" target="_blank" rel="noreferrer">MMLU-Pro 原论文与代码</a> · 知识与推理；<a href="https://docs.nvidia.com/aiperf/accuracy/accuracy-benchmarking" target="_blank" rel="noreferrer">NVIDIA AIPerf 评测实现</a>。</li>
   <li><a href="https://github.com/OpenBMB/OlympiadBench" target="_blank" rel="noreferrer">OlympiadBench 原论文与代码</a> · 数学推导；<a href="https://qwenlm.github.io/blog/qwen2.5-math/" target="_blank" rel="noreferrer">Qwen2.5-Math 评测采用</a>。</li>
   <li><a href="https://github.com/THUDM/LongBench" target="_blank" rel="noreferrer">LongBench v2 原论文与代码</a> · 给定资料理解；<a href="https://github.com/deepseek-ai/DeepSeek-V3" target="_blank" rel="noreferrer">DeepSeek-V3 评测采用</a>。</li>
   <li><a href="https://github.com/google-research/google-research/tree/master/instruction_following_eval" target="_blank" rel="noreferrer">IFEval 原评分代码与研究</a> · 可核验指令约束；<a href="https://huggingface.co/datasets/google/IFEval/blob/main/README.md" target="_blank" rel="noreferrer">Google 数据卡及 Open LLM Leaderboard 采用入口</a>。</li>
   {!original&&<li><a href="https://github.com/google-deepmind/code_contests" target="_blank" rel="noreferrer">CodeContests 原数据、代码与论文</a> · 编程解题，源自 AlphaCode 研究；不等于完整软件工程评测。</li>}
   <li><a href="https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html" target="_blank" rel="noreferrer">BFCL 多轮方法与代码入口</a> · 工具选择和连续操作；<a href="https://gorilla.cs.berkeley.edu/leaderboard.html" target="_blank" rel="noreferrer">Berkeley V4 公开比较</a>。本工具固定离线模拟场景，不调用真实业务工具。</li>
  </ul><p className="me-help">以上说明来源基准的研究或采用基础，不代表这些团队认可本工具的精选题集或综合分。</p>
 </>:<>{totalRow&&<dl>{totalRow}</dl>}<p>{t.methodBody}</p><p className="me-help">{t.adaptation}</p></>;
 return expanded?<section className="me-evaluation-basis">{content}</section>:<Disclosure kind="help" title={basisTitle} className="me-basis-disclosure"><div className="me-evaluation-basis">{content}</div></Disclosure>;
}
