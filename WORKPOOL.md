# 工作池

| 任务 | 状态 | 下一步 |
| --- | --- | --- |
| M0-1 最小插件与宿主契约 | local_pass | 构建/类型检查/2项测试通过；真实宿主与 Desktop 通道未验证，见 docs/evidence/host-contract.json |
| M0-2 固定离线资源 | local_pass | 905+12固定题、原题哈希、parent映射和分发依据已核对；逐字篡改拒绝测试通过 |
| M0-3 Windows 隔离运行器 | needs_protocol_decision | 只读WASI/Host判分原型和安全回归通过；163/164参考解通过，HumanEval/32上游数值问题待用户选择协议处理；IFEval完整约束遍历验证仍在执行 |
| M1—M3 产品与验收 | pending | M0 通过后按实施计划继续 |
