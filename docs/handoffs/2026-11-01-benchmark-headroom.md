# 当前通用协议的天花板评估

2026-11-01，本轮仅分析，未修改产品、题集、判分规则或历史，未调用模型或操作DSH。当前版本仍为alpha.11。

核对固定协议为tinyMMLU100、tinyGSM8k100、IFEval541、HumanEval+164。`src/evaluation/aggregate.ts:2-15`按各项raw准确率/通过率转百分后各25%聚合，全部有效判分才出综合分；tiny不是原作者IRT推估成绩。`src/evaluation/grade-general.ts:5-53`与`src/jobs/queue.ts:41-51`静态检查未发现明显宽松提取或grading答案键传给host。独立只读代理复核摘要和上述路径；未独立重判905题，不能证明不存在其他评分或数据问题。

在分数接近上限时，剩余题对更强模型提供的区分空间较小。原题集更适合作为基础能力基线，其对细小部署退化或前沿模型差异的稳定性没有跨档校准证据。增强测试输入数量也不能当作新增独立解题任务数量。

来源核对：[tinyBenchmarks](https://github.com/felipemaiapolo/tinyBenchmarks)、[GSM8K](https://github.com/openai/grade-school-math)、[EvalPlus](https://github.com/evalplus/evalplus)、[LiveCodeBench论文](https://arxiv.org/abs/2403.07974)、[IFBench](https://github.com/allenai/IFBench)、[AA方法](https://artificialanalysis.ai/methodology/intelligence-benchmarking)。本次AA页面为v5.0，包含复杂任务、工具及私有评测，本插件分数不能与其同数轴比较。来源会更新，本记录不是未来候选许可或兼容通过。

建议尚未获采纳：保留旧协议与历史，另行研究更难主协议，并用跨能力档模型的分差、同题表现、重复稳定性、实际用量与耗时校准。不得为拉开分数修改映射或偷偷替换旧题；不锁定候选、题数、权重或保证一小时。具体真实成绩不进入公开仓。

文档改动经回读、链接和git diff --check检查；无产品代码变化，未运行产品测试或创建新安装包。后续依据用户反馈确定候选研究范围。
