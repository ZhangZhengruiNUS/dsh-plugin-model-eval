# 随包资料来源与许可

本项目源码按 MIT 许可分发。下列数据与运行工具沿用其各自来源条款。评测题集是固定子集和独立评分适配；分数不代表来源基准的官方结果。包内的许可证和数据卡是来源证据，不扩大原作者授权。

| 数据或工具 | 来源及实际使用 | 随包材料 |
| --- | --- | --- |
| MMLU-Pro | [TIGER-Lab 固定数据卡](https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro/blob/b189ec765aa7ed75c8acfea42df31fdae71f97be/README.md)和[论文 A.5](https://papers.nips.cc/paper/2024/file/ad236edc564f3e3156e1b2feafb99a24-Paper-Datasets_and_Benchmarks_Track.pdf)声明数据集 MIT。选取原题，适配答题格式和判分。上游材料沿用各自适用条款。 | [固定数据卡](resources/licenses/benchmark-sources/mmlu-pro.README.md)、[MIT 文本](resources/licenses/benchmark-sources/MMLU-Pro-MIT.txt)、[MMLU](resources/licenses/MMLU-MIT.txt)、[TheoremQA](resources/licenses/benchmark-sources/TheoremQA-MIT.txt)、[SciBench](resources/licenses/benchmark-sources/SciBench-MIT.txt) |
| OlympiadBench | [Hothan 固定数据卡](https://huggingface.co/datasets/Hothan/OlympiadBench/blob/91184b52131e7fc9455fef848035173aea8cc01a/README.md)标注 Apache-2.0。选取英文纯文本数学题，固定终答格式和数值判分；引用 He 等（2024），arXiv:2402.14008。 | [固定数据卡](resources/licenses/benchmark-sources/olympiad-text-math.README.md) · [Apache-2.0](resources/licenses/IFEval-Apache-2.0.txt) |
| 通用能力评测原创题 | 70 道独立编程题与 28 道独立知识选择题。参考解、标准答案和判分用例由本项目编写。 | [来源映射](resources/licenses/benchmark-sources/selected-sources.json) · [MIT](LICENSE) |
| LongBench v2 | [固定数据版](https://huggingface.co/datasets/zai-org/LongBench-v2/tree/ac35867b9c9436dc81c4c7535fe640ba7cf47877)，保留原文，选用限定长度的资料并适配单轮终答。 | [数据卡](resources/suites/task-five-v1/LongBench-v2-dataset-card.md) · [Apache-2.0](resources/suites/task-five-v1/LongBench-v2-Apache-2.0.txt) |
| IFEval | [Google Research](https://github.com/google-research/google-research/tree/e6890f85757dd84e27ca6df2dd30651dafad28e0/instruction_following_eval)，选题、提示与本地规则评分适配。 | [Apache-2.0](resources/licenses/IFEval-Apache-2.0.txt) |
| BFCL V4 | [Berkeley Gorilla](https://github.com/ShishirPatil/gorilla/tree/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/berkeley-function-call-leaderboard)，选取基础多轮工具场景，在封闭模拟中判分；不连接场景所描绘的真实系统。 | [Apache-2.0](resources/suites/task-five-v1/bfcl/LICENSE) · [适配摘要](resources/suites/task-five-v1/NOTICE.txt) |
| 中文写作 1.0 | Ziya 10 题＋项目原创虚构题 2 道。旧 WritingBench 题面不进入这套写作资源。 | [固定来源与差异](resources/licenses/writing-provenance.md) · [Ziya 数据卡](resources/licenses/Ziya-data-card.md) |
| 旧通用套题 | tinyBenchmarks/MMLU、GSM8K、IFEval、HumanEval/HumanEval+。旧协议为本地记录的历史身份，独立于当前系列。 | [Tiny 来源说明](resources/licenses/tiny-provenance.md) · [HumanEval MIT](resources/licenses/HumanEval-OpenAI-MIT.txt) · [HumanEval+ 许可](resources/licenses/HumanEvalPlus-LICENSE.txt) |
| 离线评分运行时 | Windows x64 CPython、Wasmtime、WASI Python 与规则依赖。 | [运行组件及固定版本](resources/licenses/runtime-components.json) · 许可与 notice 文件见 `resources/licenses/` 及各组件目录。 |

来源映射保留套题使用的上游记录标识、数据版本和指纹，便于核对哪一份材料来自哪里。模型参考分属于本项目按公开评测口径整理的观测统计；不附原答卷、账号、凭据或会话数据。
