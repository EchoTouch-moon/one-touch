# 手写笔记技术报告

## 概述

一触的手写释义功能允许用户在收集单词和复习单词时直接在界面上书写释义，这些手写内容会作为单词定义的一部分持久化存储。本报告详细说明了手写功能的架构设计、技术实现和关键决策。

当前实现已经从早期的“PNG 手写图片”演进为“双表示”：

- `ink_data`：可编辑的笔画源数据，是长期可信源。
- `canvas_image`：用于列表和复习页快速展示的派生预览。

因此本文以当前实现为准；旧版只描述 `canvas_image` 的英文报告已归档删除。

## 架构设计

### 前端：CanvasPad 模块

手写功能基于 HTML5 Canvas 和 Pointer Events API 构建。当前 `CanvasPad` 已从单个大组件拆成多个模块：

- `CanvasPad.tsx`：组件入口和工具栏。
- `canvas-pad/useCanvasPadController.ts`：状态编排、事件处理、保存节奏。
- `canvas-pad/strokeRenderer.ts`：画布渲染和预览导出。
- `canvas-pad/inkDocument.ts`：`ink_data` 解析、序列化和迁移。
- `canvas-pad/inkGeometry.ts`：笔画边界和橡皮擦命中计算。
- `canvas-pad/draftStore.ts`：IndexedDB 草稿缓存和 localStorage fallback。
- `canvas-pad/gesture.ts`：缩放、平移等手势计算。

#### 关键技术点

1. **Pointer Events API**
   - 使用 `onPointerDown`, `onPointerMove`, `onPointerUp` 替代传统的 Mouse/Touch Events
   - 通过 `pointerType === 'pen'` 优先处理手写笔输入
   - 忽略非笔触输入（`e.pointerType !== 'pen' && e.pointerType !== 'touch'`），防止误触

2. **压感支持**
   - 读取 `e.pressure` 属性（范围 0-1）
   - 线条宽度动态计算：`baseWidth * pressure`
   - 对于不支持压感的设备，默认 pressure = 0.5

3. **笔/橡皮擦切换**
   - 状态管理：`tool: 'pen' | 'eraser'`
   - 当前橡皮擦为整笔画级矢量擦除，不破坏纸张背景
   - 擦除动作可撤销和重做

4. **数据存储**
   - `ink_data` 保存笔画 JSON，是真实源数据
   - `canvas_image` 保存 WebP/PNG 预览，是派生展示数据
   - 草稿优先写入 IndexedDB，必要时回退 localStorage

#### 核心代码流程

```
PointerDown → 开始新 stroke → 记录起始点
PointerMove → 采集 coalesced points → 根据 pressure/速度计算线宽 → 实时渲染
PointerUp   → 提交 stroke → 更新 ink_data → 异步导出预览 → 提交后端
```

### 后端：Definition 模型

#### 数据库设计

```python
class Definition(Base):
    __tablename__ = "definitions"
    
    id = Column(Integer, primary_key=True)
    word_id = Column(Integer, ForeignKey("words.id"))
    pos = Column(String)           # 词性
    meaning_zh = Column(String)    # 中文释义
    canvas_image = Column(Text)    # 手写预览 Data URL
    ink_data = Column(Text)        # 手写笔画 JSON
```

#### 迁移策略

- 通过 `PRAGMA table_info(definitions)` 检测列是否存在
- 动态执行 `ALTER TABLE definitions ADD COLUMN canvas_image TEXT`
- 动态执行 `ALTER TABLE definitions ADD COLUMN ink_data TEXT`
- 兼容已有数据库，无需手动迁移脚本

### API 接口

#### 提交手写笔记

```http
POST /api/words/{word_id}/definitions
Authorization: Bearer <token>

{
  "pos": "n.",
  "meaning_zh": "苹果",
  "canvas_image": "data:image/webp;base64,...",
  "ink_data": "{\"version\":2,\"strokes\":[...]}"
}
```

#### 获取单词详情（含手写）

```http
GET /api/review/due
Authorization: Bearer <token>

Response:
{
  "items": [
    {
      "word_id": 1,
      "text": "apple",
      "definitions": [
        {
          "pos": "n.",
          "meaning_zh": "苹果",
          "canvas_image": "data:image/webp;base64,...",
          "ink_data": "{\"version\":2,\"strokes\":[...]}"
        }
      ]
    }
  ]
}
```

## 关键决策

### 1. 为什么选择 Pointer Events 而非 Mouse/Touch Events？

- **统一 API**：一套代码处理鼠标、触摸、手写笔
- **压感支持**：`pressure` 属性是 Pointer Events 独有
- **误触过滤**：通过 `pointerType` 区分输入源
- **性能更好**：减少事件监听器数量

### 2. 为什么暂时使用 Data URL 而非文件存储？

- **简化架构**：无需额外的文件存储服务
- **事务一致性**：手写内容与单词定义在同一事务中提交
- **SQLite 友好**：TEXT 字段直接存储，无需 BLOB 处理
- **前端友好**：Data URL 可直接用于 `<img src>` 渲染

长期如果手写数据量显著增长，可以再迁移到对象存储或服务端预览生成。

### 3. 压感与渲染方案

```typescript
// 线条宽度计算
const lineWidth = baseWidth * Math.max(pressure, 0.1);

// Canvas 上下文设置
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.strokeStyle = '#111827';
ctx.globalCompositeOperation = 'source-over';
```

### 4. 移动端优化

- **触摸手势冲突处理**：使用 `touch-action: none` 阻止浏览器默认手势
- **滚动锁定**：手写时禁用页面滚动（`document.body.style.overflow = 'hidden'`）
- **DPR 适配**：Canvas 分辨率匹配设备像素比，避免模糊

## 未来改进方向

1. **按需 OCR**：用户主动点击后把手写释义识别成可编辑文本。
2. **更完整笔感**：压感曲线、速度衰减、笔迹平滑、hover 光标。
3. **手势与按键**：笔按键映射、二指 undo、缩放和平移。
4. **服务端预览重建**：从 `ink_data` 重建 `canvas_image`，降低客户端预览失败影响。
5. **更多学习模板**：横线纸、田字格、四线三格、描红和回放。

## 参考

- [Pointer Events API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [Canvas MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [SuperMemo-2 Algorithm](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)
