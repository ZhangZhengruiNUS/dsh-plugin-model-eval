# 两档评测开发期资源证据

当前：静态准入通过；原始评分质量失败证据保留，测试适配正在独立staging中验证。候选catalog不可新建评测，未安装或发布。这里没有真实模型回答或成绩。

- `source-lock.json`：公开来源固定revision、原文件SHA、许可声明、转换工具、调用预算假设；converter SHA记录任务1实际生成时版本，可在提交1263b95复核。后续converter新增负例提取分支，不改变原正例转换逻辑。
- `admission.json`：仅静态门槛。12032/454/236/107候选，固定30⊂100每类；不是400题运行参考通过或区分度验收。
- `code-contests-review.json`：逐题静态输出/交互审阅与原记录哈希。无Python3参考不自动排除，但必须在独立运行门槛补齐可信实现。
- `coding-quality-gate.json`：已知错误程序通过全部原201测试、合法反例穷举及正误参考WASI结果、非法输入实例。`status=failed`与`releaseAllowed=false`是资源门槛失败，不是自动化测试代码故障。
- `runtime.json`：准入预检因上述确证问题退出1；未运行全部400参考或本轮旧164/541完整自检，不得据此声称通过。
- `coding-adaptation-audit.json`：当前4/100题已做题面约束审计，96题明确pending；430份非法generated输入被排除、合法原测试保留，新增7份独立固定测试输入（其中1份含413个穷举子用例）。全部源索引、内容哈希、原因及oracle哈希留存；此报告不代表发布。
- `coding-adaptation-runtime.json`：隔离验证的逐题正负参考和代码哈希；独立参考明确标来源，不冒充上游。35题上游缺Python3参考，其中1604/E已有独立参考并经84个小数组所有正整数拆分穷举和保留测试验证；其余34题仍待补可信参考。局部passed不等于all100通过，`releaseAllowed=false`固定保留。
- `coding-adaptation-runtime-recheck.json`与`coding-adaptation-runtime-observation.json`：同一173测试/参考在全表和单题复查分别30,040/30,071ms超时，旁路文件名采样时14,227ms通过。原全表仍记3通过/1失败/96待验，不用后续通过覆盖失败。采样只支持该次在约1.28秒已进入第3个用例、之后持续推进；没有失败时CPU或逐阶段数据，不能断言根因或认定预算稳定。

开发期重现（PowerShell，工作目录为本插件根；Python开发工具须来自隔离环境，不是运行时依赖）：

```powershell
node scripts/collect-tier-candidates.mjs --out .local/tier-candidates --python .local/tier-tools/venv/Scripts/python.exe
node scripts/verify-tier-candidates.mjs --input .local/tier-candidates --report .local/tier-candidates/admission-check.json
& .local/tier-tools/venv/Scripts/python.exe scripts/tier-parquet.py .local/tier-candidates/artifacts/code-contests-test.parquet .local/tier-candidates/artifacts/negative-references.json coding-negatives
node scripts/audit-contest-quality.mjs --report .local/tier-candidates/coding-quality-check.json
node scripts/verify-tier-runtime.mjs --report .local/tier-candidates/runtime-check.json
```

后两条应退出1并显示质量门槛失败，不得把退出1改成0来凑发布。`verify-tier-runtime`的`--diagnostic --coding-only --ids 8`仅用于开发定位，仍不允许放行。任何修订测试的动作都须先确认协议变更；原始测试/分母/模型输出未改。

方案A已取得用户批准；继续审计无需再次选择路线。新增适配的开发期重现（与上述原始失败重现分开）：

```powershell
node scripts/audit-contest-adaptation.mjs --report docs/evidence/tiers/coding-adaptation-audit.json --out .local/contest-adaptation/staging.json
node scripts/verify-contest-adaptation.mjs --audit docs/evidence/tiers/coding-adaptation-audit.json --staging .local/contest-adaptation/staging.json --report docs/evidence/tiers/coding-adaptation-runtime.json
```

两条在本检查点应退出2（partial/pending），不是放行。staging从未写入资源目录或注册表。输出只允许专用开发目录、对应角色证据文件或测试临时目录；拒绝链接、输入/输出别名和受保护原件。运行前从锁定来源重算全部100题审计记录，不信任可编辑的外置status；任何篡改都在参考执行前拒绝。

数值/时间预算与隔离运行器不变。负例始终保留具体assertion/timeout/resource等原因；只证明预算拒绝不能解释为语义覆盖充分，当前四题负例需按各自实际原因阅读。独立复核已验证413个覆盖子用例的另一种状态集合oracle，并核对四题排除依据；两项输出/证据边界意见已用失败回归修复。尚未完成96题审计、34个参考、全400/旧164+541准入或真实区分度校准。

本检查点自动化：`npm test`131/131（224850ms）与`npm run typecheck`通过。实际准入报告失败/pending与代码测试通过是两个不同结论。真实历史、原始题卷、catalog、runtime和旧质量证据字节未改，Desktop仍alpha.13；未运行真实模型或校准。临时旁路脚本与完整日志保留在忽略的开发目录，未打入安装包。
