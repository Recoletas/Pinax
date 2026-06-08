# Status

<!--
  docs/STATUS.md — multi-session shared state.
  Read at every session start (per AGENTS.md First action step 2).
  Agent may write; user may write. Manual edits only for first version.
  Long-term history does NOT live here; migrate to docs/LOG.md / docs/PLAN.md / docs/src/known-issues.md.
-->

## In flight
<!--
  Per-entry fields (all required unless noted):
    - Owner/session: Codex / Claude / user
    - Worktree: /abs/path (or "n/a" if on main directly)
    - Branch: feature/foo
    - Scope: src/.../file.ts
    - Intent: 正在做什么 (1 句)
    - Last touched: YYYY-MM-DD HH:MM TZ
    - Do not touch: ... (optional, only when there are specific files/areas to avoid)
-->
- Owner/session: Codex
  Worktree: /home/recoletas/jiuguan/text-game-framework
  Branch: wip/map-realism-render-docs-20260608
  Scope: src/pages/Notes.vue; docs/STATUS.md; docs/LOG.md
  Intent: 优化素材页勾选后的批量操作，让导入、采纳、归档、删除都由选择栏触发。
  Last touched: 2026-06-08 20:55 CST
- Owner/session: Codex
  Worktree: /home/recoletas/jiuguan/text-game-framework
  Branch: wip/map-realism-render-docs-20260608
  Scope: docs/plan/playable-worldbook-roadmap.md; src/components/GamePanel.vue; src/pages/WorldBookQuickImport.vue
  Intent: 将当前产品主线收口为“可玩的世界书”，先落地体验页入口叙事和种子世界冷启动。
  Last touched: 2026-06-08 20:51 CST

## Blocked / questions
- (none)

## Recently done
<!--
  Keep the latest 5-10 completed handoffs, newest first.
  Remove entries once they are reflected in docs/LOG.md, docs/PLAN.md, known issues, or commits.
-->
- 2026-06-08 20:42 CST — Codex on `wip/map-realism-render-docs-20260608`: 修正素材页左侧活动列表语义，归档/拒绝素材仍保存在存储里，但不再出现在左侧列表；新增 `listActiveNarrativeAssets` 回归测试。验证：`npm run test:run` 通过（81 files, 557 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 素材页删除改为永久删除，并同步清理对应画布节点、连线、时间轴/牌堆引用；快速导入预设补齐现代世界书约束条目与基础设定字段；调顺页面切换动画和画布左侧时间轴区分度。验证：`npm run test:run` 通过（81 files, 556 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:12 CST — Codex on `wip/map-realism-render-docs-20260608`: 修复 Mem0 未配置仍请求/错误回显敏感信息、体验页机制触发关闭后无法重新进入回复、小说段落导入多章节时绕过 AI、结构化设定预览切页丢失。验证：`npm run test:run` 通过（81 files, 553 tests）；`npm run build` 通过。

## Next up
<!--
  Things planned but not yet started. Move into "In flight" when picked up.
-->
- (none)
