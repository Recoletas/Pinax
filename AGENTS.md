# AGENTS.md — Pinax / text-game-framework

## Project snapshot
- **Name**: Pinax (公网) / WriterHelper / text-game-framework (代码)
- **Stack**: Vue 3 + Vite + Express
- **Form**: AI 辅助小说创作 + 文字冒险框架；数据存浏览器 localStorage
- **关键目录**：
  - `src/` — Vue 前端
  - `server/` — Express 后端
  - `docs/` — VitePress 文档、产品计划与历史规格
  - `docs/PLAN.md` `docs/LOG.md` — 持续维护的项目计划 / 日志
  - `docs/STATUS.md` — 多 session 共享状态（每次启动必读）
  - `agent-skills/` — canonical 仓库内 skills

## First action
At session start, before task work or clarification:
1. Read `docs/STATUS.md`.
2. Read `LOCAL.md` only if it exists and is non-empty.

If a required tool/skill is unavailable, say so briefly and continue with the remaining steps.

## StoryAgent 能力架构（pi-agent 工具化，2026-10 起）
- **单入口原则**：助手/体验的 agent 回合全部走 `adapters/pinax-adapter`（pi-agent 循环 + dots 真模型）；**不做消息前词表路由**——知识/查证由 agent 的工具环取证，适配器不可达时才回落原生链（助手经 healthz 探测，体验经 experienceAgentRoute 健康门）。
- **能力 → 工具转换接口**：`adapters/pinax-adapter/src/toolManifest.ts` 的 `CapabilityManifest`/`registerCapabilities`——字段对齐 kit 的 `KitOp`（id/desc/kind/model_tier/knowledge/execute）；kit 缺这层运行时接口（kit 的 KitOp 只服务 flow 编排），任何 KitOp 形状清单可直接喂入注册。
- **已注册工具**：五 lookup（world/geo/history/memory/politics，资源快照驱动）+ `manuscript_search/get`（问全书/找伏笔）+ `notes_search`（构思/速记，标注"意图非事实"）+ `outline_lookup` + `calc_evaluate`（确定性算术复算，禁心算）+ `submit_narrative_beat_plan`（节拍规划，init/auto/respond 计划先行）。
- **数据面**：快照域在 `piNarrativeAgentBridge.js` 的 DOMAINS（world/manuscript/notes/outline/…），数据由 Authoring 的 `storyAgentContext()` 供给（章节尾 1600 字/构思/大纲，有界）。新增原生能力 = 快照加域 + 工具清单一条 `registerCapabilities`。
- **质量机制**：BeatPlan 经 `beat.plan` 扩展帧回传（协调器 `applyBeatPlanToSceneThread` 消费）；pi 路径回合结束走本体 transport 的采样 shadow critic + 证据校验报告（观测不拦截，挂 `lastNarrativeAgentTrace`）。扩展帧族：`task.*` / `reasoning.delta` / `beat.plan`（契约枚举外，上游 parser 安全忽略）。
- **验证入口**：`node scripts/storyagent-beta-smoke.mjs`（桥/路由/引擎/体验路由全链断言）；adapter 侧 `adapters/pinax-adapter && npm test`。改工具环/帧族/快照域必须同步两条冒烟与 `d.ts`（桥双副本：`src/services/agents/storyagent/` 与 `adapters/pinax-adapter/pinax-side/` 保持一致）。

## Branch model
- `main` is the development integration branch.
- `server-version` is the downstream production-adapter branch.
- Feature work starts from `main`, preferably in a worktree.
- After feature work passes verification on `main`, sync/merge `main` into `server-version` for production adaptation.
- Do not develop feature work directly on `server-version` unless the user explicitly asks for a production hotfix.

## Multi-agent workflow
When the user requests multi-agent workflow on a non-trivial feature:
1. Codex drafts high-level plan
2. Claude refines + implements
3. Codex verifies
4. User verifies
5. Issues → Codex debugs → Claude fixes → loop back to 3

For small fixes / single-step tasks, do not force this split.

### External Claude CLI worker pattern
When the user explicitly asks to use Claude as a sub-agent or to run broad parallel implementation:
- Codex remains the high-level architect, context keeper, integration owner, and final verifier.
- Prefer assigning most implementation work to Claude Code CLI workers with concrete scopes, file ownership, tests, and expected output.
- Local Claude CLI path discovered on this machine: `/home/recoletas/.nvm/versions/node/v20.20.2/bin/claude` (`2.1.153`, Node `v20.20.2`).
- For bounded non-interactive worker calls, prefer `claude --bare -p --output-format json`; plain `claude -p` can load much more project context and cost more.
- Use isolated git worktrees or disjoint write sets for parallel Claude workers. Do not let multiple workers edit the same files unless Codex is intentionally doing a merge/integration pass.
- Ask Claude workers to self-review and fix their own slice before Codex reviews. Codex must still run project verification before reporting success.
- For multi-worker tasks, maintain a task board such as `docs/agent-runs/current.md` with worker id, worktree, scope, status, and output summary path.
- Claude worker output must be reduced to short summary files, screenshots, diffs, and test results. Codex should not ingest full Claude logs or long research dumps unless debugging a worker failure.
- Do not let Claude call Codex as an implementation or verification sub-agent. Codex is the orchestrator and final verifier.
- For visual UI work, follow [docs/engineering/visual-alignment-workflow.md](./docs/engineering/visual-alignment-workflow.md): convert user annotations into hard constraints, work in small visual slices, require screenshots, and avoid broad page rewrites before direction is visually approved.
- Detailed orchestration rules live in [docs/engineering/agent-orchestration-workflow.md](./docs/engineering/agent-orchestration-workflow.md).

## Hard rules — 触发条件 → 必调 skill
| 触发 | Skill |
|---|---|
| 准备创建 git commit | commit-conventions |
| 新增 / 修改 UI、样式、交互、响应式布局 | ui-style-check |
| 声明代码 / 文档任务完成前 | testing-verification |
| 代码变更影响文档、行为、状态、计划、已知问题 | docs-status-handoff |
| 修改 world-map / geography / map renderer / map worker | map-engine-workflow |
| 修改 worldbook / 世界书导入 / context builder | worldbook-workflow |
| 修改 AGENTS.md / CLAUDE.md / agent-skills / .agents / .claude shim / docs/STATUS.md 结构 | agent-maintenance |

一轮里可能触发多个 skill（例：改 UI 后准备 commit，依次 `ui-style-check` → `testing-verification` → `docs-status-handoff` → `commit-conventions`）。

## Skill discovery paths
- canonical: `agent-skills/<name>/SKILL.md`
- Codex: `.agents/skills/<name>/SKILL.md`（symlink 到 canonical）
- Claude Code: `.claude/skills/<name>/SKILL.md`（symlink 到 canonical）
- 第三方全局 skill 不属于项目约定；项目任务只依赖仓库内 canonical skills 与其 shim
- `.claude/settings.json` 只启用与项目明确相关的插件；Superpowers 不作为本项目工作流依赖

## Local notes
`LOCAL.md` 在根目录、gitignored；放用户私人 todo / 偏好 / 备注。agent first action 读，但不写——只有用户写。
如果发现"用户偏好 X 可能值得记录"，agent 在回复里建议用户写入；不要直接写。
`docs/STATUS.md` 反过来：agent 可以写，因为是多 session 协作状态，不是私人偏好。
