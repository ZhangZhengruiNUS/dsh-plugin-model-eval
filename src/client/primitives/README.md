# DSH Plugin UI · 模型测评使用的源码快照

模型测评使用 [0.2.0-rc.1 快照](snapshot.json)中的七个源码文件。已核对与 rc.71 的组件副本一致。构建在本仓完成，使用 DSH 提供的 React 18；UI 套件样张与光学实验不进入模型测评的安装包。

## 在独立插件中复用

基础接口与令牌都在本目录。CSS 基线顺序为 tokens → controls → materials；测评样式适配写在共享目录外。目标插件应从通用套件选择自己的版本，之后按指纹核对和显式升级。

```tsx
import {Select,Field,TextInput,Button} from './primitives/index.ts';

<div data-dsh-ui="" data-material="glass" data-palette="moss" data-appearance="light">
  <Select label="范围" value={scope} options={scopes} onChange={setScope}/>
  <Field id="deployment" label="部署名称" hint="用于区分同一对象的部署">
    <TextInput value={name} onChange={event=>setName(event.target.value)}/>
  </Field>
  <Button variant="primary" onClick={save}>保存</Button>
</div>
```

配色值为moss/paper/graphite/electric；appearance由宿主明确主题决定，系统偏好仅作回退。不要让OS深色覆盖宿主明确浅色。表面值共用tokens.css，各插件只写业务覆盖。

## 稳定接口与语义

- SelectOption：稳定字符串value、label；可带description、selectedDescription、searchText、disabled。label不作身份。普通与富文本选项共用定位和键盘逻辑。
- Select：受控value/onChange；同值默认不触发onChange。可选onReselect用于重试失败的业务选择，调用方负责保留已有有效配置。空目录禁用；未知值保留原值，不自动选第一项。
- 页面和dialog都可用。原生Popover优先，缺失时用局部绝对定位；按viewport、dialog和overflow祖先交集定位，不portal到body。祖先CSS变换等特殊环境需在对应宿主额外验证。
- 字段集禁用、禁用选项、组件显式disabled均不允许提交。动态选项按value定位；列表滚动不会因同值options数组重建而跳回。
- Field提供标签和hint/error关联；与TextInput/Checkbox/Radio配合时自动关联id、aria-describedby、aria-invalid。多个不同输入不要共享一个Field。
- Button透传原生属性与ref，默认type=button；primary/secondary/quiet/danger；loading保留宽度、防重复点击。Checkbox/Radio保留原生语义、受控状态和ref。

## 验证与升级

### 玻璃材质与滚动区域

```tsx
import * as React from 'react';
import {GlassSurface,ScrollArea,useGlassInteraction} from './primitives/index.ts';

function PluginPanel() {
  const root = React.useRef<HTMLDivElement>(null);
  useGlassInteraction(root); // 可选；一帧至多更新一次，卸载清理，无静止帧循环
  return <div ref={root} data-dsh-ui="" data-material="glass" data-palette="moss" data-appearance="dark">
    <GlassSurface weight="floating">
      <ScrollArea label="可用部署" style={{height:260}}>{/* 实际列表 */}</ScrollArea>
    </GlassSurface>
  </div>;
}
```

- GlassSurface只是div材质容器，weight为control/floating/content；不是Dialog、Menu或焦点管理器。仍需调用方提供相应语义与行为。
- ScrollArea需有明确高度和可识别label。内部region可键盘滚动，监听scroll和容器/内容ResizeObserver，在无溢出或到达边界时关闭该侧模糊；卸载移除监听和observer。
- `data-transparency="reduced"`和系统减少透明偏好均提供实底；减少动态偏好关闭按压缩放/指针高光。forced-colors恢复原生checkbox/radio。
- 原生checkbox/radio状态仍由浏览器管理，材质只改变外观。接入旧CSS必须实测圆形尺寸、checked/disabled/focus和字段集禁用。
- 真实组件展示源码在上一级showcase/，仅开发预览；不打入产品入口。展示背景用于观察透光，不作为业务页面的必选背景。
- 本实现为CSS材质近似，无第三方光学引擎；0.2为视觉候选，实际宿主及用户审查状态另记。

墨青已在本插件的实际 DSH 宿主核验。其他配色、控件组合以及新宿主需在各插件独立验证。

本轮保留已有Modal实现，只验证共享选择器在其中工作；不声称交付了新的通用Dialog、Combobox或MultiSelect。后续按真实需求补齐。

通用修正先回到共享套件，再由各插件选择版本升级并复测。评测导航、数据、弹窗和图表业务留在本仓。
