# AGENTS.md — Pinax / text-game-framework

## Project snapshot
- **Name**: Pinax (公网) / WriterHelper / text-game-framework (代码)
- **Stack**: Vue 3 + Vite + Express
- **Form**: AI 辅助小说创作 + 文字冒险框架；数据存浏览器 localStorage
- **关键目录**：
  - `src/` — Vue 前端
  - `server/` — Express 后端
  - `docs/` — VitePress 文档 + `superpowers/specs/` 模式
  - `docs/PLAN.md` `docs/LOG.md` — 持续维护的项目计划 / 日志
  - `docs/STATUS.md` — 多 session 共享状态（每次启动必读）
  - `agent-skills/` — canonical 仓库内 skills

## First action
At session start, before task work or clarification:
1. Try to invoke `superpowers:using-superpowers` (Claude plugin name) or `using-superpowers` (Codex global skill name). **如果两者都不可用，第一条回复里显式说**"superpowers 套件不可用，本 session 按裸 `AGENTS.md` 流程执行"。
2. Read `docs/STATUS.md`.
3. Read `LOCAL.md` only if it exists and is non-empty.

If a required tool/skill is unavailable, say so briefly and continue with the remaining steps.

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
- Codex user/global: `~/.codex/skills/<name>/SKILL.md`（used for installed third-party skills such as Superpowers）
- Claude Code: `.claude/skills/<name>/SKILL.md`（symlink 到 canonical）
- 项目内 brainstorm scratch: `.superpowers/brainstorm/`（**不是** skill discovery 路径；不要在它下面建 `SKILL.md`，那只是 session 临时产物）
- Claude plugin 入口: `.claude/settings.json` 的 `enabledPlugins`（当前 `{ superpowers, context7 }`）是 Claude 插件真正生效入口；不在 `agent-skills/` 目录里

## Local notes
`LOCAL.md` 在根目录、gitignored；放用户私人 todo / 偏好 / 备注。agent first action 读，但不写——只有用户写。
如果发现"用户偏好 X 可能值得记录"，agent 在回复里建议用户写入；不要直接写。
`docs/STATUS.md` 反过来：agent 可以写，因为是多 session 协作状态，不是私人偏好。
