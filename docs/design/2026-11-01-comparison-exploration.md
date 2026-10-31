# 模型比较升级：调研与只读观察

2026-11-01。用户希望把跑完后的选型比较作为核心展示，允许代理参考主流实践选择雷达、二维帕累托等组件及动效。当前为设计研究，不是产品变更；未更新DESIGN.md或安装包、未调用模型或修改真实记录。

## 当前实现与实机观察

`src/client/pages/Compare.tsx`仅有完整成绩表及单项细条；`store.ts/latestCompleted`按配置/轨道协议取最近完整，`targetKey`保留供应商、模型、实际参数/路由及部署身份。`Report.tsx`有单模型维度条、性能摘要和条件。`metrics.ts`已有响应中位/P95、正文首字等待、用量字段，但旧吞吐值和用量字段完整性不能被无条件当作可靠横轴。

独立screen_operator通过Computer Use只读查看1280×753深色DSH；双侧栏后内容区约766px，表格横滚，部分性能/用量列在视野外。实机只有一份完整通用成绩；报告另一轨道未完成。未实看多模型、移动和浅色，不把建议写成这些场景的验收。没有公开真实分数、模型配置或回答；截图仅在工具会话内查看，未存进仓库。

三个主要缺口：跨模型能力需逐格拼接；能力与响应分列而无全景；窄宿主横滚增加比较负担。建议让图表与身份/筛选/精确表格联动，并为0/1模型保留诚实状态。

## 官方资料

- [Artificial Analysis模型对比](https://artificialanalysis.ai/models)：取得官方页面文字/结构，包含二维能力—时间/用量/成本关系、Pareto line和候选选择；未视觉验收其图表，不复制分数/价格/代码。
- [Datawrapper雷达图说明](https://www.datawrapper.de/blog/radar-chart-personalities)：取得官方关于面积/轴顺序误读和条形辅助比较的说明；借鉴少量轮廓与固定量尺。
- [Carbon简单图表](https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts)、[颜色规范](https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes)：取得scatter/grouped bar的用途及分类/顺序色盘规则；用于语义和可辨识性，不搬入Carbon组件或品牌。
- [W3C交互动效](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)：取得非必要交互动效可禁用的要求，沿用reduced-motion。

以上均为公开text-only资料；Apple HIG仅得到JS壳及工具无法解析的Markdown入口，不作为已读设计依据。没有登录、购买、外发项目数据或获取/执行外部代码。

## 主代理推荐，尚待确认

采用“选型工作台”：关注配置条 → 能力/响应散点与条件成立时的观测前沿 → 雷达/精确差值切换 → 精确矩阵 → 按需同配置历史趋势。另考虑强化排行榜和逐模型大卡，分别无法充分解释权衡、过度重复且占宽，不作主方向。

通用雷达4轴0—100，写作5轴0—4，最多3轮廓；不凑六轴，不按面积判胜。主散点默认响应中位秒，另可看正文首字等待；当前可比组才能连前沿，未知/不同条件照常可看点但不伪造最优结论。无价格不估金额，Token缺失不补0；旧用量覆盖不能代替字段级完整性。

关注/图例/表格联动，稳定配置色标配形状/文字；动效用于选中和变化，保持坐标/数值稳定，不滚动分数或随轮询重播。足宽双列、766px宿主与390px纵排，玻璃限控件/浮层，数据面实底。现有DESIGN.md仍是实施规范；本记录不是新规范。

总控保存完整待审设计及fresh builder check结果；该设计不依赖待放行新题，亦不批准CodeContests适配。整体批准后另写实施计划，实际绘图、交互、主题/窄屏、多模型和安装仍未验证。
