# Window D Prompt - OpenCode - Canvas Optimization

你负责优化现有卡片关系画布的稳定性、连线性能和操作完整性。请在当前视觉风格内做一轮实质优化，不要重写 `ProseEssay.vue`，也不要把任务扩大到漫画自由格框。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读 `src/pages/ProseEssay.vue` 的画布、拖动、缩放和 edge geometry 部分，以及 `useCanvasBoard.js`、`relationCanvas.js`、`src/components/canvas/**`。
3. 在独立 worktree/分支工作，建议 `feature/canvas-viewport-stability`。不启动 dev server。

你的文件所有权仅限：

- `src/services/canvasGeometry.js`
- `src/composables/useCanvasViewport.js`
- `src/composables/useCanvasBoard.js`
- `src/components/canvas/**`
- `src/pages/ProseEssay.vue`
- 你新增的定向测试文件
- 你的总结 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-d-canvas-optimization.md`

必须实现：

1. 提取纯 `canvasGeometry`：屏幕/画布坐标转换、缩放锚点、节点 bounds、拖动 clamp、edge anchors/path、可见区域判断。消除页面内重复的临时几何计算。
2. 新增 `useCanvasViewport`：统一 pan/zoom、ResizeObserver、transform 状态、容器尺寸、requestAnimationFrame 调度和清理。
3. 连线更新按帧合并；拖动期间只重算与当前节点相连的边，结束拖动再做一次完整校正。避免每个 pointermove 都触发全部 DOM 测量和边重建。
4. 节点拖动使用 pointer capture，处理 pointercancel/窗口失焦；节点不能完全拖出画布，缩放后 clamp 仍正确。
5. 容器 resize、侧栏开合、缩放变化后边和节点保持对齐；没有尺寸时不产生 NaN/Infinity。
6. 为选中节点补方向键微调，Shift 加速；输入框/textarea 内按键不得移动节点。保持既有点击、双击和拖动语义。
7. 改进 `useCanvasBoard`，让其复用纯几何/视口逻辑；保留现有 API，不能破坏 Notes 等调用方。
8. 只在必要区域修改 `ProseEssay.vue`，不改主信息架构、卡片视觉语言或业务数据模型。

性能目标：

- pointermove 热路径不查询全部节点 DOM。
- 同一帧内多次变化只安排一次 edge flush。
- 100 个节点、200 条边的纯几何计算可在单元测试中稳定完成，不使用脆弱的绝对耗时断言。
- 所有 observer、RAF 和全局 listener 在卸载时清理。

测试与验收：

- 最多新增 3 个高价值测试：坐标/缩放 round-trip；clamp/edge 有限值；RAF 合并或键盘行为。
- 运行定向测试、`npm run build` 和 `git diff --check`。
- 按 `ui-style-check` 自查现有浅/深色和 360/768/1280 宽布局；不启动 dev server，不要求截图服务。

交付时：

- 自审并修复你发现的问题，特别检查 stale closure、listener 泄漏和拖动结束状态。
- 在 result 文件写：性能问题根因、修改点、测试结果、仍保留在页面内的画布债务、给窗口 F 的冲突提示。
- 如果在独立 worktree，创建一个 scoped commit；共享 worktree则不要提交。
- 不修改联机、Agent 或视频文件。
