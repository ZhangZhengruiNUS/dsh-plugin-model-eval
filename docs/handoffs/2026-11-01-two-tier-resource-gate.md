# 两档实施：资源质量门槛检查点

日期2026-11-01。用户已明确批准12任务计划开始实施，主代理逐项执行、关键独立复核。

完成任务1（1263b95）静态题源/许可/固定子集核定、任务2（50054b5）版本化registry/不可变兼容指纹/非破坏准备。工程原型及质量证据检查点为5274dce，分支`codex/model-eval-mvp`；远端仍为既有个人GitHub仓。此检查点没有推送、升版、打包、安装或发布。

Task3未完成：精确数值与隔离stdio评分原型已实现，但CodeContests质量门槛失败。上游错误程序在1579_G原201测试全部通过，在合法反例上答案不匹配；独立穷举128种方向得1152，上游正确参考通过。另有1575_A非法字符串长度输入。静态107候选不是100题运行放行，也不证明容量不足100。

实际验证：22项相关单元/集成全部通过（79178ms），typecheck和diff检查通过。含6项contest隔离/取消/共享fuel/输出上限/统一deadline/stdin兼容、数值、registry、旧协议提示、资源与准备回归；不是全400参考、旧164/541本轮完整自检、完整npm/UI/实包或真实模型校准。`verify-tier-runtime`因确证质量问题退出1是预期门槛失败，`releaseAllowed=false`。

关键实现决定：缺少源Python3参考不是静态排除条件，运行门槛仍需补齐；generic WASI guest适配stdin的fstat长度与零长度read，不改提交程序；30秒按端到端评分deadline计，512MiB指WASI线性内存而非整个Host RSS。旧manifest、题目、execute_wasi.py及旧pins均保持原字节。

新两档catalog仍`allowNewRuns=false`，没有进入队列/API/UI。Desktop保留alpha.11，真实历史没有读写迁移或新调用。原始来源、测试、固定分母和候选缓存保留，未做测试清洗/增补。

证据入口：`docs/evidence/tiers/README.md`及`coding-quality-gate.json`。总控有待用户决定的测试协议修订提议：推荐保持公开题与120/400数量，透明排除确证非法用例、允许独立oracle的固定边界测试、记录差异后重跑正反样例；另一方向为重新选公开编程题源。这两项均未获批准，不能自动执行。

下一条动作：取得测试协议路线决定后，回到Task3资源准入；未经决定不得删/改/补原测试或减100分母。保留`.superpowers/sdd/2026-11-01-two-tier-evaluation/`台账，Task1/2已完成，不重复从头实现。Task4—12未开始，真实模型校准仍要具体配置与预算授权。
