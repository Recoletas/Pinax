# R2-B - 画布拖拽与视频入口

## 工作区

- Worktree: `/tmp/pinax-r2-canvas`
- Branch: `round2/canvas-video`
- Product base: `635a439038a16a3306ab9b30c45c4d3412250957`

先按 [总览](./README.md) 核对 git，再读 `AGENTS.md`、`docs/STATUS.md` 和非空 `LOCAL.md`。不要使用 brainstorming / Superpowers，不启动 dev server。

## 目标

修复 `ProseEssay` 当前拖拽回归，并把已经存在的视频生成能力放到分镜工作表面的可见位置，不能继续只藏在导出菜单里。

## 可修改

- `src/pages/ProseEssay.vue`
- `src/components/canvas/*`
- `src/composables/useCanvasViewport.js`
- `src/services/canvasGeometry.js`
- `src/__tests__/canvasOptimization.test.js`，只能向现有单一 test body 合并断言
- 结果：`docs/agent-runs/2026-07-16-round2-integration/result-b-canvas-video.md`

只读：`StoryboardVideoPanel.vue`、`useDirector.js`。禁止修改 Notes、Experience、Advisor、Comic、server、共享状态文档和其他窗口文件。

## 必须完成

1. 先记录根因。当前卡片同时绑定 pointer drag 与原生 `draggable`；每次交互只能有一个权威拖拽状态机。
2. 覆盖无移动点击、自由移动、进入新牌堆、牌堆之间移动、移出牌堆、同牌堆落下、pointer cancel、pointer capture release。
3. 移出牌堆必须有明确手势，不能因为任意自由移动或落回自身而意外拆堆。
4. pointermove 不得每次全量 `layoutCards + computeEdgePaths`。每帧只更新拖动卡片和相连边，结束时做一次最终 flush。
5. DOM 位置更新后再算边；取消或卸载时清理 RAF、listener 与 capture。
6. 保留卡片选择、连线模式、素材 HTML5 drop、时间轴拖放、键盘行为及现有 card/pile 存储 schema。
7. 在分镜/时间轴工作表面增加一个持续可见的紧凑视频操作；不得打开 export menu 才能找到，不增加第二个 drawer，继续复用现有 `StoryboardVideoPanel`、版本状态和 stale 检查。
8. 不重做整页视觉；固定控件尺寸，沿用当前 token，按钮数量克制。

## 验证与交付

- 保持 `canvasOptimization.test.js` 仍只有一个 test，合入必要断言。
- 运行该测试、`npm run build`、`git diff --check`。
- 写不超过 400 字结果摘要并创建一个 conventional commit；不含 `Co-Authored-By`。
- 最终只报告 commit hash、结果文件路径和验证状态。
