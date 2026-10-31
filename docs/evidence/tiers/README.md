# 两档评测开发期资源证据

当前：静态准入通过；评分质量门槛失败，运行未放行。候选catalog不可新建评测，未安装或发布。这里没有真实模型回答或成绩。

- `source-lock.json`：公开来源固定revision、原文件SHA、许可声明、转换工具、调用预算假设；converter SHA记录任务1实际生成时版本，可在提交1263b95复核。后续converter新增负例提取分支，不改变原正例转换逻辑。
- `admission.json`：仅静态门槛。12032/454/236/107候选，固定30⊂100每类；不是400题运行参考通过或区分度验收。
- `code-contests-review.json`：逐题静态输出/交互审阅与原记录哈希。无Python3参考不自动排除，但必须在独立运行门槛补齐可信实现。
- `coding-quality-gate.json`：已知错误程序通过全部原201测试、合法反例穷举及正误参考WASI结果、非法输入实例。`status=failed`与`releaseAllowed=false`是资源门槛失败，不是自动化测试代码故障。
- `runtime.json`：准入预检因上述确证问题退出1；未运行全部400参考或本轮旧164/541完整自检，不得据此声称通过。

开发期重现（PowerShell，工作目录为本插件根；Python开发工具须来自隔离环境，不是运行时依赖）：

```powershell
node scripts/collect-tier-candidates.mjs --out .local/tier-candidates --python .local/tier-tools/venv/Scripts/python.exe
node scripts/verify-tier-candidates.mjs --input .local/tier-candidates --report .local/tier-candidates/admission-check.json
& .local/tier-tools/venv/Scripts/python.exe scripts/tier-parquet.py .local/tier-candidates/artifacts/code-contests-test.parquet .local/tier-candidates/artifacts/negative-references.json coding-negatives
node scripts/audit-contest-quality.mjs --report .local/tier-candidates/coding-quality-check.json
node scripts/verify-tier-runtime.mjs --report .local/tier-candidates/runtime-check.json
```

后两条应退出1并显示质量门槛失败，不得把退出1改成0来凑发布。`verify-tier-runtime`的`--diagnostic --coding-only --ids 8`仅用于开发定位，仍不允许放行。任何修订测试的动作都须先确认协议变更；原始测试/分母/模型输出未改。
