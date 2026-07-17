改动文件：src/pages/ProseEssay.vue、src/components/canvas/CanvasTimeline.vue、src/__tests__/canvasOptimization.test.js。

行为：(1) 卡片拖拽权威状态机改为 pointer events，移除 `draggable=true` 与原生 dragstart/dragover/drop/dragend，避免与 pointer 重复触发；(2) 新增 `pointerDragDelta`、`_suppressLayoutWatch` 抑制深度监听：拖动时每帧只 `updateConnectedEdges`，结尾一次 `flushEdgesImmediate` + `updateLayout`；(3) 仅在「原始牌堆 + 命中其他牌堆的明确落点」时拆堆，自由移动或同堆落回不再误拆；(4) `onPointerDragUp` 统一 releasePointerCapture、清理 window listener；(5) CanvasTimeline header 增加紧凑「视频」按钮（含 current/stale/warning/error/empty 五态色与徽章），复用现有 `StoryboardVideoPanel` 与版本状态，不新增 drawer，未修改导出菜单路径；(6) 保留选择 / 连线 / 素材 drop / 时间轴原生 drag / 键盘操作 / card+pile 存储 schema。

验证：`npm run test:run` 200/200 通过（核心 188 + 视觉 12，单一 `it()` 块并入新断言）；`npm run build` 通过；`git diff --check` 干净。

残余风险：堆外但无落点的自由移动明确保留 pileId；若后续要支持「拖到空白拆堆」需引入专用「移除」手势（Alt+拖等）。

修订：修正 onCardPointerDown / cancelPointerDrag 的卸载-清理路径——将 dragEl + pointerId 提升为模块级 let（与 pointerDragOriginalPileId 同层），onCardPointerDown 在 setPointerCapture 后写入，cancelPointerDrag 据此真正移除 pointermove/pointerup/pointercancel 监听并 releasePointerCapture（吞错）；happy path 不变。
