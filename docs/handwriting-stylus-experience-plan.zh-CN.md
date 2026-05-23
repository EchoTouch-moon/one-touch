# 手写体验路线图（S Pen / Apple Pencil 主导）

## 目标

本文是手写功能后续优化的唯一主路线图，合并了早期 `handwriting-roadmap`、画板稳定性计划和手写笔体验计划。目标不是把一触做成通用白板，而是把「收词后立刻写释义，复习时看到同一张手写卡」这条学习链路打磨到稳定、顺手、可持续。

把目前已经稳定的「ink_data 为真实源、矢量橡皮擦、动作级 undo/redo」基础设施，往真正的手写笔体验上推一步。核心是：

1. 把笔的硬件能力榨满：tilt、twist、raw/predicted events、hover。
2. 把笔按键与手势从「PC 思路」改造成「平板手写思路」。
3. 在写字这一动作上把跟手感、笔感、视觉反馈做到位。
4. 让手写变成真正的学习工具，而不是另一个白板控件。

## 现状评估（2026-05-19）

已经稳定的部分：

- `ink_data` 是手写内容的可信源，`canvas_image` 是派生预览。
- 矢量橡皮擦（点到线段距离），擦除可 undo。
- 动作级历史，`add` 与 `remove` 都可撤销/重做。
- coalesced events 取到尽量多采样点。
- penOnly + touch fallback 切换。
- IndexedDB 草稿缓存，带 localStorage fallback。
- WebP 预览导出，带 PNG fallback。
- 高 DPI 适配，resize 重绘。
- `CanvasPad` 已拆分为控制器、渲染、数据迁移、几何计算、草稿存储等模块。

仍偏弱的部分：

- 只用了 `pointerType / pressure / button / buttons`，没有 tilt、twist、tangentialPressure。
- 没有 `pointerrawupdate`、没有预测点。
- 按键映射写死成「橡皮擦」，没有视觉反馈，没有可配置。
- 没有 hover 反馈。
- 没有手势（二指 undo、双指缩放）。
- 没有压感曲线、笔迹平滑、速度衰减。
- 设备能力差异不可见，调试只能靠拍照。

## 近期优先级

当前阶段优先保护内测主链路，不急着做复杂笔刷和识别：

1. 继续验证 `ink_data` 兼容迁移和旧手写卡展示。
2. 观察 IndexedDB 草稿缓存、WebP 预览和数据库体积变化。
3. 补手写数据体积和预览生成失败的可观测性。
4. 再推进设备诊断、笔感和手势。

暂缓：

- Protobuf / FlatBuffers：JSON 仍然更利于调试和迁移。
- 对象存储：当前先优化预览格式和保存频率，避免过早引入鉴权、清理和备份复杂度。
- 原生 Android 手写模块：Web/PWA 还没有到必须分叉技术栈的阶段。
- AI 笔迹分析：先保证采集质量，再谈分析。

## 路线图

按落地顺序排列，每一步独立可部署。

### 第 1 步：设备诊断面板 + ink_data v2 schema

**目的**：把每台设备真实能力暴露出来，为后续优化提供数据底座。

工作项：

1. 新增 `StylusDiagnostics` 组件：
   - 显示 `pointerType / isPrimary / pressure / tiltX / tiltY / twist / tangentialPressure / button / buttons / width / height`。
   - 显示 `getCoalescedEvents` 的采样数和 `getPredictedEvents` 是否可用。
   - 显示 `PointerEvent.prototype` 是否含 `pointerrawupdate` 支持。
   - 提供「按下并写一笔」录制按钮，把一段轨迹的所有字段导出为 JSON 便于排错。
2. 在 Settings 页加入「Handwriting」section，把诊断面板放进去。
3. `ink_data` schema 升到 v2：
   - `Point` 扩展成 `{ x, y, pressure, tiltX, tiltY, twist, t }`。
   - 顶层 `InkDocument.version` 改为 `2`。
   - 解析器兼容 v1：缺失字段以 `0` 填充，仍当成有效文档。
   - 序列化时一律输出 v2。
4. 写入时尽量采集真实字段；浏览器不上报时记 0，便于事后过滤。

验收：

- Apple Pencil / S Pen / 普通鼠标三种输入下面板字段都有合理读数。
- 老的 v1 `ink_data` 仍可正常加载和编辑。
- 新写的手写卡能在数据库里看到 `version: 2`。

### 第 2 步：笔感（压感曲线 + 平滑 + 速度衰减）

工作项：

1. 压感曲线：`width = base + curve(pressure) * gain`，curve 默认 `pow(p, 0.6)`。曲线和 gain 后续做成 Pen profile。
2. 速度衰减：`actualWidth = curveWidth * (1 - clamp((velocity - v0) / vmax, 0, 0.6))`，避免快写时墨块。
3. 笔迹平滑：从 `lineTo` 换 `quadraticCurveTo`，控制点用相邻点中点，相当于轻量 Bezier 平滑；落笔前做一次 1~2 点滑动平均预过滤。
4. tilt 影响：tilt 大时增加宽度并降低透明度，模拟铅笔/马克笔侧锋（默认关，作为 Pen profile 选项）。

验收：

- 标准笔触视觉上更连贯，没有可见折角。
- 快速划线时笔触会自然变细。
- 在 Pen profile 切换下，至少有两种风格能感知差异。

### 第 3 步：跟手感（raw / predicted / hover）

工作项：

1. 接 `pointerrawupdate`：在 capture 阶段挂监听，主流程仍走 `pointermove` 做兜底；优先用 raw 点。
2. 可选地接 `getPredictedEvents()`：在松笔时丢弃预测段并以最后一个真实点收尾。
3. Hover 光标：
   - `pointerType === 'pen'` 且 `buttons === 0` 时显示一个细圈光标。
   - 工具是 eraser 时，光标尺寸等于橡皮擦半径。
4. 桌面/有键盘环境保留 hover；纯触屏设备自动隐藏。

验收：

- 跟手感主观上比当前明显提升。
- 橡皮擦半径可见，避免「擦多了」。
- 预测启用时不会留下抖动残影。

### 第 4 步：按键与手势

工作项：

1. 按键映射可配置（Settings → Handwriting）：
   - 选项：`Eraser` / `Undo` / `Toggle tool` / `Switch pen profile` / `Disabled`。
   - 单独的「按住擦除」选项：按键按下进入橡皮擦，松开立刻回笔。
   - Apple Pencil 双击启发式：在 pen pointerdown 之后 `<300ms` 内出现 pointercancel + pointerdown 视为双击；该启发式默认关闭，需用户在诊断面板里观察到双击信号后再开启。
2. 视觉反馈：按键按下时在画板顶部浮一个高亮 chip「Erasing while button held」。
3. 二指手势（touch pointer，不参与画线）：
   - 二指 tap → undo。
   - 三指 tap → redo。
   - 二指捏合 → 缩放；二指拖动 → 平移。变换只影响渲染矩阵，stroke 数据仍为世界坐标。
4. 键盘快捷键：`P` pen、`E` eraser、`Cmd/Ctrl+Z/Y` undo/redo、`[` `]` 调节笔粗。

验收：

- 切按键映射后行为正确，写完后状态自动复位。
- 二指 undo 在 iPad Safari 与 Android Chrome 都能触发。
- 缩放后落笔位置仍准确，不会偏移。

### 第 5 步：学习工作流

工作项：

1. 纸张模板：横线纸、田字格、四线三格、空白。模板以 canvas pattern 渲染，不写入 `ink_data`。
2. 笔迹回放：基于 `Point.t` 重放写字过程，复习时支持「再写一次」「看我写过」。
3. 描红模式：把旧笔迹做为半透明底图，让用户在上面重写。
4. 多页释义：`InkDocument` 升级支持 `pages: PageDocument[]`，单词支持多页手写。

验收：

- 模板切换不会破坏现有 stroke。
- 回放在两端设备都流畅。
- 多页之间切换不丢笔迹。

## 项目级配套优化（与手写体验互相加强）

- `canvas_image` 改用 `image/webp`，降低最大边长，DB 体积应能下降 60% 以上。
- 草稿迁移到 IndexedDB，仅保留 `localStorage` 索引。
- 服务端用 Pillow / Skia-Python 从 `ink_data` 重建预览，逐步淘汰客户端上传图片。
- 对长内容启用 OffscreenCanvas 渲染。
- 服务端 OCR 可选地把手写内容索引化，让「我手写的字」也能被搜索。
- 离线手写采集队列，弥补当前只覆盖 review 的不足。

## 数据源原则（沿用前一轮）

- `ink_data` 是唯一可信源，schema 升级永远向前兼容。
- `canvas_image` 是可丢弃、可重建的派生物。
- 设备能力差异通过诊断面板暴露，而不是写死。
- 任何手感参数都应可配置（Pen profile），默认值保守稳定。
- 高级特性默认关闭，避免影响主流程。

## 风险

1. `pointerrawupdate` 与 `getPredictedEvents` 各浏览器支持参差，需要 feature detect。
2. Apple Pencil 双击在浏览器没有官方 API，启发式可能误触发，必须可关闭。
3. 二指手势与系统手势（页面缩放、PWA 切换）冲突，需要 `touch-action: none` 并仔细处理穿透。
4. tilt / pressure 在便宜电容笔上恒为默认值，UI 要做 graceful fallback。
5. 高频事件可能拖累主线程，预渲染必须可关闭。
