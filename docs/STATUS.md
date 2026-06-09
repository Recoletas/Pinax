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
  Scope: src/pages/WorldBookQuickImport.vue; src/pages/Experience.vue; src/stores/gameStore.js; src/services/worldbookContextBuilder.js; docs/plan/playable-worldbook-parallel-plan.md
  Intent: 下一轮主线收窄为“单旗舰世界 + 更有趣入口 + GM 轻状态/剧情日志/2 个 trigger”；Codex 做工程主链路，内容 review/demo 交给并行线程。
  Last touched: 2026-06-09 11:30 CST

## Blocked / questions
- (none)

## Recently done
<!--
  Keep the latest 5-10 completed handoffs, newest first.
  Remove entries once they are reflected in docs/LOG.md, docs/PLAN.md, known issues, or commits.
-->
- 2026-06-09 11:30 CST — Codex on `wip/map-realism-render-docs-20260608`: 收口结构化设定工作台首轮改动，新增字段级控件、dirty/undo、键盘提示、AI 草稿状态与 a11y 测试；同时补齐 Mem0 错误边界和地理面板 UI 打磨。新增下一轮并行计划，明确不再堆种子世界，先做单旗舰世界入口。验证：clean archive 下 `npm ci`、`npm run test:run`（83 files, 565 tests）、视觉测试（12 tests）、`npm run build`、`npm run docs:build` 全部通过；`git diff --check` 通过。
- 2026-06-08 21:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续纠正文档里的实际错误，重写根 `README.md` 的主线叙事，并修正 `docs/user-manual/05-deployment.md`、`04-configuration.md`、`06-faq.md` 中的历史路径、模板假设、备份安全说明和旧 issue 链接。验证：仅做轻量检查 `git diff --check`；未跑全量测试；未做实现层改动。
- 2026-06-08 21:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续收口用户手册剩余旧术语，更新 `docs/user-manual/02-concepts.md`、`04-configuration.md`、`06-faq.md`，把“散文画布 / 诗歌工作坊 / 世界书入口名”等旧叫法降到历史说明或改成当前导航语境。验证：本轮仅做文档事实对齐，未跑全量测试；未做实现层改动。
- 2026-06-08 21:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续收口用户手册和 RFC 入口，重写 `docs/user-manual/README.md`、`01-quickstart.md`、`03-features.md` 的主线叙事，并明确 `docs/src/rfcs/index.md` 不是当前事实入口；同时修正 2 份 accepted RFC 的“待实现”旧状态。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:26 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续精简文档分层，新增 `docs/superpowers/README.md`，并把 `docs/plan/README.md` 的专题状态收口为当前主线 / 活跃技术专题 / 参考计划 / 历史背景；保留 `playable-worldbook-roadmap.md` 为当前产品主线专题。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:18 CST — Codex on `wip/map-realism-render-docs-20260608`: 继续收口文档信息架构，新增 `docs/plan/README.md`，明确 `playable-worldbook-roadmap.md` 是当前主线专题而不是历史材料；同步把 `docs/src/code-map.md` 压成更偏查表的 owning surface。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:11 CST — Codex on `wip/map-realism-render-docs-20260608`: 完成“可玩的世界书”Phase 1 首轮，新增路线图文档，首页和体验页入口收口为“选择世界 -> 开始冒险 -> 写成作品”，快速导入升级为 3 个种子世界；生视频保持后置出口。验证：`npm run test:run` 通过（81 files, 559 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 21:11 CST — Codex on `wip/map-realism-render-docs-20260608`: 精简文档入口和状态文档，重写 `docs/README.md`、`PLAN.md`、`LOG.md`、`docs/src/index.md`、`docs/src/test-status.md`、`docs/src/known-issues.md`，把当前产品主线、近期变化和验证状态前置。验证：`npm run docs:build` 通过；`npm run test:run` 通过（81 files, 559 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:56 CST — Codex on `wip/map-realism-render-docs-20260608`: 优化素材页勾选批量操作，勾选后统一显示导入、采纳、归档、删除；详情工具栏移除“待处理 / 采纳 / 归档”三联状态按钮；新增 UI 契约测试。验证：`npm run test:run` 通过（81 files, 558 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:42 CST — Codex on `wip/map-realism-render-docs-20260608`: 修正素材页左侧活动列表语义，归档/拒绝素材仍保存在存储里，但不再出现在左侧列表；新增 `listActiveNarrativeAssets` 回归测试。验证：`npm run test:run` 通过（81 files, 557 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。
- 2026-06-08 20:33 CST — Codex on `wip/map-realism-render-docs-20260608`: 素材页删除改为永久删除，并同步清理对应画布节点、连线、时间轴/牌堆引用；快速导入预设补齐现代世界书约束条目与基础设定字段；调顺页面切换动画和画布左侧时间轴区分度。验证：`npm run test:run` 通过（81 files, 556 tests）；`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）；`npm run build` 通过；`git diff --check` 通过。

## Next up
<!--
  Things planned but not yet started. Move into "In flight" when picked up.
-->
- Codex 主线程：按 `docs/plan/playable-worldbook-parallel-plan.md` 做单旗舰世界入口 UI、体验页开场卡、GM 轻状态、剧情日志和 2 个 trigger。
- 并行内容线程：只 review `边境王国 · 雾潮暮湾`，产出 10-15 分钟手测记录、demo case 和 UI 参考，不直接改高冲突工程文件。
