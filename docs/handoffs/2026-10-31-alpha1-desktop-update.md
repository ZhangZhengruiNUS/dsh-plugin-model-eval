# alpha.1 Desktop更新交接

已完成：用户确认原评测停止后，备份5份profile文件、完整history与根元信息；CLI离线更新alpha.1成功、下载0包。1441包文件匹配已验证tgz，1851数据文件哈希未变。仅package.json/pnpm-lock.yaml变化，其他profile配置保留，未开始模型调用或自动补测。

证据：[更新](../evidence/desktop-update-alpha1.json)、[原候选包](../evidence/versions/0.1.0-alpha.1/package.json)。原tgz SHA256仍为cdaf62f9ce4feba8a8458f5f3443f0f9b4daaaf6618336558dcd7127294dd323；安装后的文档修改不重打包、不覆盖原tgz。

待验证：工具初始化报kernel assets路径不存在，不能代为点击Desktop。已向用户请求应用内重载并确认新建评测中有耗时预估、默认1分钟、测速并预估按钮。实际重载/界面/测速未确认，不扩大宿主兼容声明。

下一动作：根据用户反馈核对新版入口；如正常，再验证可跳过的独立一分钟测速、旧记录查看、暂停/恢复与清理流程。保留写作待补测记录，不自动发起整轮评测。没有npm/tag/市场发布。
