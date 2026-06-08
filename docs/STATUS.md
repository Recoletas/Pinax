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
  Scope: docs/plan/playable-worldbook-roadmap.md; docs/PLAN.md; src/pages/Home.vue; src/pages/Experience.vue; src/pages/WorldBookQuickImport.vue
  Intent: 将当前产品主线收口为“可玩的世界书”；入口首轮已落地，下一步转入 Stage 1.5 的 RPG world.json 到世界书适配。
  Last touched: 2026-06-08 21:22 CST

## Blocked / questions
- (none)

## Recently done
<!--
  Keep the latest 5-10 completed handoffs, newest first.
  Remove entries once they are reflected in docs/LOG.md, docs/PLAN.md, known issues, or commits.
-->
- 2026-06-08 21:26 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续精简文档分层，新增 `docs/superpowers/README.md`，并把 `docs/plan/README.md` 的专题状态收口为当前主线 / 活跃技术专题 / 参考计划 / 历史背景；保留 `playable-worldbook-roadmap.md` 为当前产品主线专题。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:18 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续收口文档信息架构，新增 `docs/plan/README.md`，明确 `playable-worldbook-roadmap.md` 是当前主线专题而不是历史材料；同步把 `docs/src/code-map.md` 压成更偏查表的 owning surface。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:11 CST — Codex on `wip/map-realism-render-docs-20260608`: 完成“可玩的世界书”Phase 1 首轮，新增路线图文档，首页和体验页入口收口为“选择世界 -> 开始冒险 -> 写成作品”，快速导入升级为 3 个种子世界；生视频保持后置出口。验证：`npm run test:run` 通过（81 files, 559 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:11 CST — Codex on `wip/map-realism-render-docs-20260608`: 精简文档入口和状态文档，重写 `docs/README.md`、`PLAN.md`、`LOG.md`、`docs/src/index.md`、`docs/src/test-status.md`、`docs/src/known-issues.md`，把当前产品主线、近期变化和验证状态前置。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:56 CST — Codex on `wip/map-realism-render-docs-20260608`: 优化素材页勾选批量操作，勾选后统一显示导入、采纳、归档、删除；详情工具栏移除“待处理 / 采纳 / 归档”三联状态按钮；新增 UI 契约测试。验证：`npm run test:run` 通过（81 files, 558 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:42 CST — Codex on `wip/map-realism-render-docs-20260608`: 修正素材页左侧活动列表语义，归档/拒绝素材仍保存在存储里，但不再出现在左侧列表；新增 `listActiveNarrativeAssets` 回归测试。验证：`npm run test:run` 通过（81 files, 557 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 素材页删除改为永久删除，并同步清理对应画布节点、连线、时间轴/牌堆引用；快速导入预设补齐现代世界书约束条目与基础设定字段；调顺页面切换动画和画布左侧时间轴区分度。验证：`npm run test:run` 通过（81 files, 556 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:12 CST — Codex on `wip/map-realism-render-docs-20260608`: 修复 Mem0 未配置仍请求/错误回显敏感信息、体验页机制触发关闭后无法重新进入回复、小说段落导入多章节时绕过 AI、结构化设定预览切页丢失。验证：`npm run test:run` 通过（81 files, 553 tests）；`npm run build` 通过。

## Next up
<!--
  Things planned but not yet started. Move into "In flight" when picked up.
-->
- Stage 1.5：审计 `server/data/worlds/*/world.json`，新增只读适配层转换为现代世界书 payload；先覆盖 5 个 fixture 的转换测试，再接快速导入入口。
