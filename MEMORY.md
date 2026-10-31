# 项目记忆

- 这是独立 DSH 插件，开发包名 @aico/dsh-plugin-model-eval。
- 首版为通用能力 905 题与独立中文应用写作 12 题；只用宿主配置模型，参数可改、历史保留。
- 无快速抽样档位，不宣称与机构榜单同尺度；写作目前不覆盖完整操作说明书。
- M0-1 已完成本地最小入口：TypeScript/ESM Host、宿主 React ModuleLoader Client、受保护 Connection 精确路由和卸载清理。源码契约固定 ce7073d，宿主实际往返未验证。
- 固定资源已导入：905 通用题与独立 12 写作题，源映射、许可文件、模板、量表和清单校验已具备；篡改测试通过。
- Windows 原型改用 Wasmtime 官方 Python C API + CPython WASI，guest 只读挂载、Host 判分，已修复独立复核发现的伪造评分与写权限问题。
- 全量参考解中 163/164 通过；HumanEval/32 的上游参考在 Native Python 同样失败 7 个增强输入，另有 3 个输入的精确多项式有效区间位于相邻 binary64 之间。详见 docs/evidence/upstream-reference.json。评分协议变更待用户决定，尚未放行完整运行器或集成评分。
- 没有真实模型成绩或宿主兼容结果。构建与类型检查通过不能代表宿主兼容。
- 本地记录、实际模型调用、安装包及发布状态分别验证，不能以构建通过代替。
