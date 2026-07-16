# Result D — Canvas Optimization

**Status**: COMPLETE
**Date**: 2026-07-16
**Window**: D (画布优化) — OpenCode

## 根因分析

### 性能问题

| 问题 | 根因 | 严重度 |
|---|---|---|
| 每次 `saveData()` 触发全量 edge DOM 查询 | `computeEdgePositions()` 同步遍历所有 edge 做 `querySelector`，无批处理 | MEDIUM |
| 卡片拖动用 HTML5 drag API，无 pointer cancel 处理 | 窗口失焦 / pointercancel 时 `draggingCardId` 残留 | LOW |
| 无键盘微调 | `handleKeydown` 仅处理 Ctrl+Z/Y / Esc，无方向键 | LOW |
| 容器 resize / 侧栏开合后 edge 无自动刷新 | 无 ResizeObserver；依赖手动调用 | MEDIUM |
| 几何函数散落在 ProseEssay.vue | `rectToLocalRect` / `getConnectorPoint` / `makeEdgePath` / `getCardWallPoint` 页面内重复定义 | LOW |
| 无 NaN 防护 | canvas 尺寸计算 (`scrollWidth/clientWidth`) 可能在初始状态为 0 | LOW |

### 代码债务

- `handleKeydown` 通过 `document.addEventListener` 注册，但无 `onBeforeUnmount` 清理 → listener 泄漏
- `stopEdgeDraft()` 在导航离开时不清理 → window 级 listener 泄漏

## 修改点

### 新建文件

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/services/canvasGeometry.js` | 98 | 纯几何函数：clamp / screenToCanvas / canvasToScreen / rectToLocalRect / getConnectorPoint / makeEdgePath / clampNodePosition / getNodeBounds / isNodeVisible / getCardWallPoint |
| `src/composables/useCanvasViewport.js` | 112 | 视口状态 composable：zoom / panX / panY / containerSize / ResizeObserver / RAF-batched scheduleEdgeFlush / flushEdgesImmediate / invalidateEdgeFlush / 生命周期清理 |
| `src/__tests__/canvasOptimization.test.js` | 46 | 3 tests：坐标/缩放 round-trip (100 点循环) / clampNodePosition NaN/Infinity 防护 / RAF edge flush 合并 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/pages/ProseEssay.vue` | +onBeforeUnmount / 导入 canvasGeometry + useCanvasViewport / 移除 3 个内联几何函数 / computeEdgePaths 改用导入函数 / updateLayout + computeEdgePositions 改用 viewport.scheduleEdgeFlush / onCardPointerDown 扩展为 pointer capture 自由拖拽 (非 linking 模式) + onPointerDragMove/Up + updateConnectedEdges / handleKeydown 加方向键微调 (Shift 加速，input/textarea 内跳过) |
| `src/composables/useCanvasBoard.js` | 导入 clamp / onBoardDrop 加 NaN 防护 |

### 实现需求对照

| 需求 | 状态 |
|---|---|
| 1. 提取 canvasGeometry | 完成 — 10 个纯函数，0 Vue 依赖 |
| 2. 新增 useCanvasViewport | 完成 — pan/zoom 状态 + ResizeObserver + RAF 合并 + 清理 |
| 3. 连线按帧合并；拖动期间只重算相连边 | 完成 — scheduleEdgeFlush 合并多调用为 1 次 RAF；updateConnectedEdges 仅重算与拖动节点相连的边；drag end 做完整校正 |
| 4. 节点拖动 pointer capture + pointercancel/失焦 + clamp | 完成 — setPointerCapture / pointercancel → onPointerDragUp / clampNodePosition 保护不出画布 |
| 5. resize / 侧栏 / 缩放后边对齐，无 NaN | 完成 — ResizeObserver 自动触发 edge flush；canvasGeometry 所有函数有 NaN/Infinity 防护 |
| 6. 方向键微调 + Shift 加速，输入框内不触发 | 完成 — Arrow 键 8px 步进 / Shift 40px / isInput 检查 |
| 7. useCanvasBoard 复用几何 | 完成 — 导入 clamp，onBoardDrop 加保护 |
| 8. ProseEssay 仅必要修改 | 完成 — 不改信息架构 / CSS / 数据模型 |

## 测试结果

```
canvasOptimization.test.js   3 passed   (new)
useCanvasBoard.test.js      21 passed   (existing, unmodified)
relationCanvas.test.js       2 passed   (existing, unmodified)
storyboardStore.test.js      9 passed   (existing, unmodified)
useDirector.test.js          2 passed   (existing, unmodified)
─────────────────────────────
Total:                      37 passed / 0 failed
```

- `npm run build` 通过 (4.30s)
- `git diff --check` 在修改文件上清洁
- 禁止项扫描 (raw hex / `!important` / `:global`) 0 match

## 仍保留在页面内的画布债务

| 债务 | 说明 |
|---|---|
| HTML5 drag/drop 用于卡片堆叠 | `@dragstart / @drop` 堆叠逻辑保留，未迁移到 pointer capture（堆叠语义比自由拖拽复杂，需检测 drop 目标） |
| pan/zoom CSS transform 未接线 | `useCanvasViewport` 的 zoom/panX/panY 状态已就绪，但 `card-wall` 仍用 scroll 导航而非 `transform: scale(zoom) translate(panX, panY)`。接线需同时调整坐标系统和 overflow 策略 |
| 卡片位置使用绝对像素 | `x` / `y` 存储为 px，未经过 viewport zoom；接线 zoom 时需保存 canvas 坐标并在渲染时转换 |
| `edgeLinkDraft` 每次 pointermove 做 2 次 DOM query | 合理（仅 1 条 draft edge），不在热路径 |
| `canvasWidth` / `canvasHeight` 仅用于 SVG viewport | SVG 尺寸通过 `scrollWidth/Height + 100` 计算，非实际内容边界 |

## 给窗口 F 的冲突提示

- **ProseEssay.vue line 616-628**: 新增导入 `canvasGeometry` + `useCanvasViewport`。F 窗口若同时修改导入块，注意这三个新导入。
- **ProseEssay.vue line 799-816**: 新增 `pointerDragXxx` 状态 + `viewport` composable 初始化。F 窗口若在同区域加状态 ref，按新增顺序合并。
- **ProseEssay.vue line 936-940**: `updateLayout()` / `computeEdgePositions()` 签名不变，内部改为调用 `viewport.scheduleEdgeFlush()`（不再自己做 `nextTick` + DOM 读取）。F 窗口若也改这两个函数，优先保留 viewport 调用。
- **useCanvasBoard.js**: 仅多了 `import { clamp }` + `onBoardDrop` 内部 clamp 调用；API 未变。
- 其他 A/B/C/E 窗口文件 0 冲突（canvasGeometry / useCanvasViewport 为全新文件）。
