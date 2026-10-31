# 玻璃材质与动效

用户要求克制使用液态玻璃并增强操作流畅度。延续DESIGN.md的数据工具结构，只更新交互材质与短动效，不改评测/模型调用/存储。

## 选择

原生CSS背景模糊、半透明填充、内侧亮边，加可测量的共享选中层；属于Web近似材质，不声称是Apple原生液态玻璃或真实光学折射。

- Glass-HQ/liquid-glass：2026-10-31读取根及packages/liquid-glass README、package.json和MIT LICENSE（0.0.2，main未固定commit），并在1280×720浏览器查看Surface演示。React组件要求19+；材质图依赖HTTPS/localhost与WebGPU，使用vgpu/WGSL+SVG滤镜，需显式场景内容层。宿主当前提供React18，移植需额外集成/兼容验证，因此本轮不引入该库，不宣称其不兼容所有Electron。DOM入口存在，但不采用，避免为装饰重组宿主内容层。来源：https://github.com/Glass-HQ/liquid-glass/tree/main/packages/liquid-glass 。许可允许复用，但此次不复制其代码或素材。
- Apple Materials：官方markdown通过HTTPS读取；web提取正文因JS/markdown类型失败，不视为获取成功。指南将Liquid Glass用于导航/控件层、要求节制、正文维持清楚；对此做Web场景适配。https://developer.apple.com/design/human-interface-guidelines/materials 。不复制官方图标/图像/原生API。
- CSS依据：MDN backdrop-filter与prefers-reduced-motion文档已读取。原生Web功能无需新增运行时依赖或远程资源；不把标准支持等同旧版宿主全面兼容。

## 应用边界

导航选中层、分段切换、主要按钮及弹窗框架有玻璃高光与柔和景深；表格、分数、代码、回答和警告保持实底。保留单一青绿强调色，不添加动态背景、跟随鼠标、循环发光或逐项计数动画。玻璃高光允许静态渐变，是DESIGN.md本轮明确覆盖，不把旧“无渐变”扩展为禁止材质高光。

导航/分段选中层约260ms滑移；页面只在导航时短淡入，刷新不重复播放；弹窗短淡入位移，按钮轻微按压反馈，展开帮助短淡入。动作立即响应，不增加业务等待或为了关闭动画延迟取消。减少动态效果时关闭非必要动画/过渡；减少透明度、高对比或不支持背景模糊时使用实底。

## 实施与验收

1. 共用SelectionBar保留现有nav/tablist按钮、名称、回调，测量只随选择或尺寸变化；ResizeObserver在React effect清理，无逐帧React更新。
2. 独立glass.css集中材质Token和动效，基础styles.css与数据区保留；明暗主题和宿主变量照常读取。
3. 验证选中层resize对齐、快速切换、模态键盘与焦点、减弱动效/透明度、静态轮询不重播。桌面/390明暗实看，对比搜索/错题详情/新建表单回归。
4. 实包校验、空闲Desktop备份后更新，使用computer-use实机操作，不新增真实模型调用或清理。

## 验收结果

- PASS：类型/构建，32项单元，46项完整Chromium界面回归；新增9项覆盖选择层快速切换/resize对齐、轮询不重播、减少动态效果、减少透明度、高对比及明暗1440/390视觉与报告键盘。
- PASS：主代理与独立screen_operator实际查看alpha.8七张主要截图，玻璃层次仅在控件/框架可辨，数据与回答实底，未发现必须修复的布局/可读性问题。截图为合成数据。
- PASS：独立computer-use在真实Desktop0.2.1-rc.5操作导航、轨道、历史页签和新建弹窗；选中层稳定后位置正确，本次操作未遇点击阻塞/明显卡住。正文/数字/表单标签清楚，Tab焦点及Escape恢复正常。未逐一修改表单，不能据此声称所有控件验收。
- PASS：实际alpha.8包及1441安装文件一致，1851非锁历史重启前不变；启动后1849一致，两份摘要只增加revision。零新增真实模型调用、续测、清理或设置修改。题集哈希不变，运行时依赖仍0，压缩包较alpha.7增加4206字节。
- 限制：离散截图和这些交互不能测量帧率；未做设备性能基准。旧内核缺失backdrop-filter的条件回退由源码复核，减少透明度与forced-colors分支已在浏览器执行；不声称覆盖所有旧版浏览器。实际宿主普通深色已查看，明暗/窄屏与系统偏好分支为夹具覆盖。

最终安装0.1.0-alpha.8，未发布npm/tag/市场；原始实机资料只在本地忽略目录。截图和包分别见docs/evidence/ui/alpha.8与docs/evidence/versions/0.1.0-alpha.8/package.json。
