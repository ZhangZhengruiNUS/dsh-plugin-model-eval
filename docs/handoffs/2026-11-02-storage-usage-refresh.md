# 题集准备后自动刷新存储占用

alpha.16候选修复设置页停留时占用不更新的问题。旧查询只依赖prepared布尔值：已有题集时，再准备其他题集不会改变这个值。现在准备结束（包括部分失败）后重新测量实际文件占用；等待写入结束，并以effect清理避免旧查询覆盖新值。准备中切走再返回和根目录身份变化也会刷新，不增加定时扫描。

实现：src/client/pages/Settings.tsx；回归：tests/ui/settings-storage.spec.ts。四项检查在旧实现均按预期失败，修复后4/4通过：已就绪时新增资源、部分失败、延迟旧响应、准备中离开再返回。完整合成浏览器界面回归102/102通过，类型/构建和22执行文件lineage检查通过。本轮未重跑全部评分参考或Node全套。

实际alpha.16包1984文件、56835595字节，SHA256 06427412a69c5878fe71d20e5d5d768e5ded6959a56eea8c7a89e676e0a65df0；零运行时依赖。与冻结alpha.15相比仅README、package.json、lib/client.js变化，宿主评分程序及全部资源逐字节相同。见../evidence/storage-refresh.json。

Desktop仍安装alpha.15，候选尚未安装或原生实机验证。零真实模型调用、测速、续测、清理和真实历史修改；未npm/tag/市场发布。下一步取得Computer Use安装当次确认后，通过官方插件入口更新alpha.16，在设置页验证准备完成后自动显示占用；不启动真实评测。

本轮代码及文档正常提交推送到codex/model-eval-mvp，哈希以Git日志为准；原alpha.15包及历史证据保留。
