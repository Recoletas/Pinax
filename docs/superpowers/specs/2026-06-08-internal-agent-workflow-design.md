# Internal Agent Workflow Infrastructure — Design

**Date**: 2026-06-08
**Status**: Draft (pending review)

## Context

This repository (Pinax / WriterHelper / text-game-framework) has reached a point where AI agents (Codex, Claude Code) are the primary collaborators. Today the project has:

- An uncommitted `.agents/` directory and an uncommitted `.codex/` directory
- `.claude/settings.json` and `.claude/settings.local.json` for the user-global Claude Code setup
- No repo-level agent instructions, no project skills, no shared status, no personal-notes convention
- 4 prior `docs/superpowers/specs/` and `docs/superpowers/plans/` files from past features (3 specs, 1 plan), none touching agent infrastructure

When a new agent session starts, it has no project context, doesn't know what other sessions are doing, can't reach for specialized workflows, and is left to re-derive conventions from scratch every time. This design codifies the AI dev workflow as first-class repo assets.

## Goals

- **Multi-platform**: works for both Codex and Claude Code with zero extra setup after `git clone`
- **Lean skills**: each skill is a flow guardrail (3-6 steps + canonical doc references), not historical narrative
- **Resilient rules**: directives degrade gracefully if a tool or skill is unavailable
- **Auditable shared state**: multi-session coordination via `docs/STATUS.md` updated manually by agents, not via auto-hooks
- **Clear ownership**: shared rules in `AGENTS.md`, platform-specific rules in their own file, personal notes in `LOCAL.md`

## Non-goals

- Windows symlink compatibility for first version (project is Linux/WSL/macOS only)
- Auto-recording `STATUS.md` via hooks (manual edits only)
- `LOCAL.md` visualization, sync, or backup
- New CLI tools for agent infrastructure
- Promot­ing personal preferences from `LOCAL.md` to `AGENTS.md` or skills

## Architecture

### File layout (post Stage 2)

```
AGENTS.md                              # multi-platform entry, shared rules
CLAUDE.md                              # Claude Code entry, @AGENTS.md + Claude-specific
agent-skills/                          # canonical skills (committed)
  agent-maintenance/SKILL.md
  commit-conventions/SKILL.md
  docs-status-handoff/SKILL.md
  map-engine-workflow/SKILL.md
  testing-verification/SKILL.md
  ui-style-check/SKILL.md
  worldbook-workflow/SKILL.md
.agents/skills/<name> -> ../../agent-skills/<name>      # Codex discovery (symlink, Stage 2)
.claude/skills/<name> -> ../../agent-skills/<name>      # Claude Code discovery (symlink, Stage 2)
docs/STATUS.md                         # multi-session shared state
LOCAL.md                               # user-only personal notes (gitignored)
.gitignore                             # updated to allow shim paths
```

### Shim mechanism

- `agent-skills/<name>/SKILL.md` is the single source of truth
- Codex discovers skills under `.agents/skills/<name>/SKILL.md` (symlink to canonical)
- Claude Code discovers skills under `.claude/skills/<name>/SKILL.md` (symlink to canonical)
- Symlinks are **per-skill directory** (not per-file), so adding a new skill only requires creating the canonical directory plus two new symlinks
- Symlinks are created in Stage 2 alongside the canonical `SKILL.md` files; never committed broken

### `.gitignore` updates

Replace the existing `# Agent skills` block with:

```gitignore
# Agent runtime/config (local state, not tracked)
.codex/
.agents/*
.claude/*

# Shared project skills (re-include shim subpaths)
!.agents/skills/
!.agents/skills/**
!.claude/skills/
!.claude/skills/**

# Local notes (user-only, not tracked)
LOCAL.md
CLAUDE.local.md
```

Notes:
- Using `dir/*` (not `dir/`) and re-including subpaths is the stable Git pattern; re-include from an already-ignored parent directory is unreliable
- `agent-skills/` is a brand-new top-level path; no gitignore change needed for it
- `AGENTS.md` and `CLAUDE.md` are at root, not in any ignored path; no re-include needed

## Entry points — `AGENTS.md` and `CLAUDE.md`

### `AGENTS.md` content

```markdown
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
1. If available, invoke `superpowers:using-superpowers`.
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

## Local notes
`LOCAL.md` 在根目录、gitignored；放用户私人 todo / 偏好 / 备注。agent first action 读，但不写——只有用户写。
如果发现"用户偏好 X 可能值得记录"，agent 在回复里建议用户写入；不要直接写。
`docs/STATUS.md` 反过来：agent 可以写，因为是多 session 协作状态，不是私人偏好。
```

### `CLAUDE.md` content

```markdown
@AGENTS.md

<!-- Claude Code-specific 补充暂时为空，后续按需加；不与 AGENTS.md 重复 -->
```

## Skills (7) — flow guardrails

All skills follow the same pattern:
- YAML frontmatter with `name` and `description` (description is the trigger)
- 3-6 step body, lean
- Reference canonical live docs by path; never copy commit history or invented workflows
- If a fact changes, update the canonical doc, not the skill

### `commit-conventions`

- **Trigger**: 准备创建 git commit
- **Body**:
  1. Check for absent `Co-Authored-By` footer
  2. Check conventional-commit format (type/scope/subject)
  3. Check scope is an existing subdirectory name
  4. Confirm this is a finished handoff, not a mid-stage commit
  5. If multiple commits planned for a feature, squash before pushing

### `ui-style-check`

- **Trigger**: 新增 / 修改 UI、样式、交互、响应式布局
- **Body**:
  1. Read 2-3 sibling components in the same module for pattern
  2. Verify dark-mode tokens are used (no hard-coded colors)
  3. Verify responsive breakpoints match existing components
  4. Reuse primitives in `src/components/` if applicable
  5. Add or update visual snapshot test if behavior is new

### `testing-verification`

- **Trigger**: 声明代码 / 文档任务完成前
- **Body**:
  1. Run `npm run test:run`; confirm exit code 0
  2. Run `npm run build`; confirm exit code 0
  3. If UI changed, run visual snapshot tests; confirm no unintended diff
  4. State the verification commands and their results when claiming done
  5. If any check fails, do not claim completion

### `docs-status-handoff`

- **Trigger**: 代码变更影响文档、行为、状态、计划、已知问题
- **Pre-action**: read `docs/STATUS.md` to know what's in flight
- **Post-action**:
  1. Update `docs/STATUS.md` with the change (move entries between In flight / Recently done / Next up / Blocked)
  2. If behavior or known issues changed, also update `docs/PLAN.md` / `docs/LOG.md` / `docs/src/known-issues.md`
  3. If a preference is not mature enough for `AGENTS.md` or docs, suggest recording it in `LOCAL.md`. Do not edit `LOCAL.md` unless the user explicitly asks.

### `map-engine-workflow`

- **Trigger**: 修改 world-map / geography / map renderer / map worker
- **Body**:
  1. Read first: `docs/src/code-map.md §world-map`, `docs/src/decisions/ADR-0003-azgaar-pipeline.md`, `docs/src/known-issues.md §地图引擎`, `docs/src/rfcs/azgaar-pipeline/index.md` (as needed)
  2. Identify affected surface: heightmap / tectonics / coast / rivers / nations / renderer / worker / AI adapter / UI
  3. Status check: is the current behavior `accepted` / `superseded` / `active issue` in the docs?
  4. Keep changes scoped; do not reintroduce `realism.level`
  5. For algorithm / perf rewrites, use `?debug=perf` and perf docs first; do not guess
  6. Run targeted map tests; run broader verification if behavior changed
  7. Update `docs/STATUS.md` when behavior or known issues changed

### `worldbook-workflow`

- **Trigger**: 修改 worldbook / 世界书导入 / context builder
- **Body**:
  1. Read first: `docs/guides/worldbook-workflow.md`
  2. Classify surface: quick import / advanced editor / SillyTavern import-export / context injection / structured settings
  3. Verify import preview, conflict handling, active-worldbook selection
  4. If context injection changed, run one generation smoke test
  5. Update `docs/STATUS.md` when workflow or behavior changed

### `agent-maintenance`

- **Trigger**: 修改 `AGENTS.md` / `CLAUDE.md` / `agent-skills/` / `.agents/` / `.claude/` shim / `docs/STATUS.md` 结构时
- **Body**:
  1. Verify all `.agents/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` symlink targets exist
  2. Verify each `SKILL.md` has `name` + `description` frontmatter
  3. Verify `docs/STATUS.md` / `docs/PLAN.md` / `docs/LOG.md` are not drifting from current behavior
  4. New platform-specific rule? Prefer shared in `AGENTS.md`; put in `CLAUDE.md` only if truly Claude-only
  5. Removed or renamed skill? Update both `AGENTS.md` Hard rules table and the shim symlinks

## `docs/STATUS.md` — multi-session shared state

### Format (4 sections, newest first within each)

```markdown
# Status

## In flight
- Owner/session: Codex / Claude / user
- Worktree: `/abs/path`
- Branch: `feature/foo`
- Scope: `src/services/world-map/engine/heightmap.ts`
- Intent: 正在修 Round 2.1 heightmap residual bug
- Last touched: 2026-06-08 15:30 CST
- Do not touch: `...`（可选）

## Blocked / questions
- 阻塞点 / 提给用户的问题

## Recently done
Keep the latest 5-10 completed handoffs, newest first.
Remove entries once they are reflected in `docs/LOG.md`, `docs/PLAN.md`, known issues, or commits.

- 2026-06-08 — Round 2.5 hotfix landed on `main`.
  Verified: `npm run test:run -- src/__tests__/heightmap-azgaar.test.js ...`
  Follow-up: `docs/src/known-issues.md` still lists Round 2.1 residuals.

## Next up
- 计划做但还没开始的事
```

### Write rules

- Agent **may write** `docs/STATUS.md` (it is shared coordination state, not personal)
- Update "In flight" before substantive non-trivial work
- Update "Recently done" and "Next up" / "Blocked" on completion, pause, or handoff
- Long-term history does NOT live in `STATUS.md`; migrate to `docs/LOG.md` / `docs/PLAN.md` / `docs/src/known-issues.md`
- Manual edits only for first version; no auto-hooks

## `LOCAL.md` — personal notes

### Location and ownership

- `LOCAL.md` at repo root, gitignored
- **User is the only writer**
- Agent reads it as part of first action but never creates, modifies, or commits it
- Agent may suggest in conversation that the user write something
- Agent may only write if the user explicitly asks

### Format

Free-form. Suggested categories (user may use or ignore):

- Personal TODO
- Un-precipitated preferences ("I don't like X style; consider switching next time")
- Private notes ("Codex tends to make this mistake in this project")

## Verification (4 levels)

| Level | Item | How |
|---|---|---|
| File / link | All `.agents/skills/*` and `.claude/skills/*` symlink targets exist | `readlink -f .agents/skills/*/SKILL.md` returns canonical path |
| Frontmatter | Each `SKILL.md` has `name` + `description` | simple grep / one-shot script |
| Multi-platform discovery | Codex startup shows 7 skills | real Codex session, check skill list |
| | Claude Code startup shows 7 skills | real Claude Code session, check system reminder |
| Behavior trigger | Each skill's trigger fires correctly | mini-scenario: simulate commit, invoke `commit-conventions`, check output |
| E2E | Real small feature flows through First action → skill trigger → STATUS update → commit | run one feature end-to-end |

**Non-goals for first version** (explicitly not verified):
- Windows symlink compatibility
- STATUS.md auto-hooks
- LOCAL.md sync / visualization

## Rollout (2 stages, 2 commits)

### Stage 1 — Agent entry points

Files in commit:
- `AGENTS.md` (new)
- `CLAUDE.md` (new, content is `@AGENTS.md` + comment)
- `.gitignore` (updated)
- `docs/STATUS.md` (new, empty 4-section template)

Verification before Stage 2:
- `AGENTS.md` and `CLAUDE.md` readable, expected content
- `.gitignore` syntax valid, `git check-ignore` confirms shim paths will be tracked once Stage 2 files exist
- `docs/STATUS.md` template renders correctly

Commit message:
```
docs(agents): add shared agent workflow entrypoints
```

### Stage 2 — Skills + discovery shims

Files in commit:
- 7 `agent-skills/<name>/SKILL.md` (new)
- 7 `.agents/skills/<name>` symlinks (new)
- 7 `.claude/skills/<name>` symlinks (new)

Verification before declaring done:
- All 4 verification levels pass
- Real Codex session + real Claude Code session both see 7 skills
- One end-to-end mini-scenario runs

Commit message:
```
docs(agents): add repository workflow skills
```

Both commits follow project conventions: NO Co-Authored-By footer, conventional-commit format, max 2 commits per feature.

## Open questions / future considerations

These are explicitly **out of scope** for the first version. Recording them so we don't lose the thread:

- **Windows sync script**: if Windows users become a real audience, replace symlink shims with a sync script that copies canonical `agent-skills/<name>/SKILL.md` into `.agents/skills/<name>/SKILL.md` and `.claude/skills/<name>/SKILL.md`, with a drift check
- **STATUS.md auto-hooks**: explore git hook or pre-action lint that prompts agent to update `STATUS.md` on commit / branch change
- **Skill count budget review**: after a few months of use, audit which skills are rarely triggered and consider merging (e.g., `agent-maintenance` may fold into `docs-status-handoff` if rarely used)
- **`feature-to-server-version` skill**: the user has not yet requested a dedicated skill for the "main → server-version" promotion workflow; currently this lives in `AGENTS.md` Branch model. Add a dedicated skill only when the workflow gains enough complexity to warrant it.
- **Visual review support**: visual review difficulty was raised as a concern; the first version's answer is `testing-verification` step 3 (run visual snapshot tests). A dedicated `visual-verification` skill may be warranted if visual issues become a recurring blocker.
