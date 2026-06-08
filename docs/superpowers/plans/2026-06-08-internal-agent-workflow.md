# Internal Agent Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the project's AI dev workflow as first-class repo assets — multi-platform entry points (`AGENTS.md` + `CLAUDE.md`), 7 repo-internal skills with symlink shims, `docs/STATUS.md` for multi-session coordination, `LOCAL.md` for user-only personal notes — so any agent starting in this repo knows the project, the rules, and the in-flight work without re-deriving.

**Architecture:**
- **Stage 1** (commit 1): entry points only — `AGENTS.md`, `CLAUDE.md`, `.gitignore` update, `docs/STATUS.md` template. No symlinks, no skills yet.
- **Stage 2** (commit 2): 7 canonical `agent-skills/<name>/SKILL.md` files plus 14 symlink shims (7 × 2 platforms) created in the same commit. Symlinks must not be broken; canonical files must exist before shim links are created.

**Tech Stack:** Markdown (docs), YAML frontmatter (SKILL.md), bash `ln -s` (symlinks), git conventional commits.

**Spec:** `docs/superpowers/specs/2026-06-08-internal-agent-workflow-design.md`

---

## File Structure

**New (committed):**
- `AGENTS.md` — multi-platform entry point, shared rules
- `CLAUDE.md` — Claude Code entry, `@AGENTS.md` + Claude-specific comment
- `docs/STATUS.md` — multi-session shared state, 4-section template
- `agent-skills/commit-conventions/SKILL.md`
- `agent-skills/ui-style-check/SKILL.md`
- `agent-skills/testing-verification/SKILL.md`
- `agent-skills/docs-status-handoff/SKILL.md`
- `agent-skills/map-engine-workflow/SKILL.md`
- `agent-skills/worldbook-workflow/SKILL.md`
- `agent-skills/agent-maintenance/SKILL.md`
- 7 × `.agents/skills/<name>` symlinks → `../../agent-skills/<name>` (Codex discovery)
- 7 × `.claude/skills/<name>` symlinks → `../../agent-skills/<name>` (Claude Code discovery)

**Modified:**
- `.gitignore` — replace existing `# Agent skills` block with the new structure

**Local-only (gitignored, not created by this plan):**
- `LOCAL.md` — convention documented in `AGENTS.md`; user creates on demand

**总原则：** Stage 1 跑通 → commit → Stage 2 跑通 → commit。每个 stage 完成后必须有 verification 通过记录才能进下一个。

---

## Phase 1 — Stage 1: Agent entry points

### Task 1: Update `.gitignore`

**Files:**
- Modify: `.gitignore` (replace the existing `# Agent skills` block at the bottom of the file)

- [ ] **Step 1: Read current `.gitignore`**

Run: `cat -n .gitignore`
Expected: existing block visible near end of file:

```
# Agent skills
.agents/
.claude/
.superpowers/
skills-lock.json
```

- [ ] **Step 2: Replace the `# Agent skills` block**

The exact existing block to find (in `.gitignore`):

```
# Agent skills
.agents/
.claude/
.superpowers/
skills-lock.json
```

Replace it with:

```gitignore
# Agent runtime/config (local state, not tracked)
.codex/
.agents/*
.claude/*
.superpowers/
skills-lock.json

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
- `dir/*` + `!subpath/**` is the stable Git pattern; re-include from an already-ignored parent directory (`dir/` form) is unreliable
- `.superpowers/` and `skills-lock.json` are preserved (superpowers framework state)
- `agent-skills/` is brand-new top-level; not gitignored, no re-include needed

- [ ] **Step 3: Verify `.gitignore` syntax**

Run: `git check-ignore -v .agents/skills/foo .claude/skills/foo agent-skills/foo 2>&1; echo "---"; git check-ignore -v .agents/skills 2>&1`
Expected output:
- `agent-skills/foo` → NOT ignored (exit non-zero, no output line, or "not ignored")
- `.agents/skills/foo` and `.claude/skills/foo` → NOT ignored (the re-include should make the shim subpath trackable)
- `.agents/skills` itself as a directory → still ignored (we only re-include the *contents*, not the directory; the directory becomes trackable when its first child is added in Stage 2)

If the output shows `.agents/skills/foo` is still ignored, the re-include pattern is wrong — re-check the block.

- [ ] **Step 4: No commit yet**

This task does not commit. The full Stage 1 commit happens in Task 5.

---

### Task 2: Create `AGENTS.md`

**Files:**
- Create: `AGENTS.md` (root)

- [ ] **Step 1: Write `AGENTS.md`**

Create `AGENTS.md` at repo root with this exact content:

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

- [ ] **Step 2: Verify content**

Run: `wc -l AGENTS.md && head -5 AGENTS.md`
Expected: ~70+ lines, first line `# AGENTS.md — Pinax / text-game-framework`

- [ ] **Step 3: No commit yet**

---

### Task 3: Create `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md` (root)

- [ ] **Step 1: Write `CLAUDE.md`**

Create `CLAUDE.md` at repo root with this exact content:

```markdown
@AGENTS.md

<!-- Claude Code-specific 补充暂时为空，后续按需加；不与 AGENTS.md 重复 -->
```

- [ ] **Step 2: Verify content**

Run: `cat CLAUDE.md`
Expected: 3 lines (`@AGENTS.md`, blank, HTML comment)

- [ ] **Step 3: No commit yet**

---

### Task 4: Create `docs/STATUS.md` template

**Files:**
- Create: `docs/STATUS.md`

- [ ] **Step 1: Write `docs/STATUS.md`**

Create `docs/STATUS.md` with this exact content:

```markdown
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
- (none)

## Blocked / questions
- (none)

## Recently done
<!--
  Keep the latest 5-10 completed handoffs, newest first.
  Remove entries once they are reflected in docs/LOG.md, docs/PLAN.md, known issues, or commits.
-->
- (none)

## Next up
<!--
  Things planned but not yet started. Move into "In flight" when picked up.
-->
- (none)
```

- [ ] **Step 2: Verify content**

Run: `cat docs/STATUS.md`
Expected: 4 sections (In flight, Blocked / questions, Recently done, Next up), each starting with `- (none)`

- [ ] **Step 3: No commit yet**

---

### Task 5: Stage 1 verification + commit

**Files:** (none new)

- [ ] **Step 1: Confirm all 4 Stage 1 files exist and are tracked or will-be-tracked**

Run:
```bash
ls -la AGENTS.md CLAUDE.md docs/STATUS.md
git status -sb -- AGENTS.md CLAUDE.md .gitignore docs/STATUS.md
```

Expected:
- All 3 new files exist on disk
- `git status` shows them as untracked (they will be added in this commit)
- `.gitignore` shows as modified

- [ ] **Step 2: Confirm `.gitignore` changes are correct**

Run: `git diff .gitignore | head -30`
Expected: shows the `# Agent skills` block replaced with the new structure from Task 1

- [ ] **Step 3: Stage all Stage 1 files**

Run:
```bash
git add AGENTS.md CLAUDE.md .gitignore docs/STATUS.md
git status -sb
```

Expected: 4 entries staged (1 modified, 3 new), nothing else.

- [ ] **Step 4: Commit Stage 1**

Run:
```bash
git commit -m "docs(agents): add shared agent workflow entrypoints"
```

Expected: commit succeeds, no `Co-Authored-By` footer added.

- [ ] **Step 5: Verify commit**

Run: `git log -1 --stat`
Expected:
- 1 commit with the message above
- 4 files changed (AGENTS.md, CLAUDE.md, .gitignore, docs/STATUS.md)
- No `Co-Authored-By` line in commit body

If `Co-Authored-By` is present, run `git config --get-all user.email` and check git config; do not amend to remove it — create a new commit on top after fixing config. (Per project commit convention: NO Co-Authored-By footer.)

---

## Phase 2 — Stage 2: Skills + discovery shims

### Task 6: Create `agent-skills/` directory

**Files:**
- Create: `agent-skills/` directory + 7 subdirectories

- [ ] **Step 1: Create the directory structure**

Run:
```bash
mkdir -p agent-skills/{commit-conventions,ui-style-check,testing-verification,docs-status-handoff,map-engine-workflow,worldbook-workflow,agent-maintenance}
ls -d agent-skills/*/
```

Expected: 7 directories listed, alphabetically:
```
agent-skills/agent-maintenance/
agent-skills/commit-conventions/
agent-skills/docs-status-handoff/
agent-skills/map-engine-workflow/
agent-skills/testing-verification/
agent-skills/ui-style-check/
agent-skills/worldbook-workflow/
```

---

### Task 7: Create `commit-conventions/SKILL.md`

**Files:**
- Create: `agent-skills/commit-conventions/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/commit-conventions/SKILL.md` with this exact content:

```markdown
---
name: commit-conventions
description: Use when about to create a git commit - enforces no Co-Authored-By footer, conventional-commit format, scoped commits, and finish-and-squash discipline
---

# commit-conventions

Pre-commit guardrail. Run before `git commit` is finalized.

1. Verify the message has **no** `Co-Authored-By:` footer. If present, remove it before committing.
2. Verify format: `<type>(<scope>): <subject>` where `type` is `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style` / `perf` and `scope` matches an existing subdirectory name (e.g., `world-map`, `engine`, `agents`, `ai`).
3. Verify the change is a **finished handoff** — not a mid-stage checkpoint. If multiple commits are planned for one feature, squash before pushing.
4. Verify `npm run test:run` passes locally for the staged scope; if it doesn't, do not commit.
5. Default 1 commit per feature, max 2. Multiple WIP commits before "finish" violate the convention; squash them.
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/commit-conventions/SKILL.md`
Expected: lines starting with `---`, `name: commit-conventions`, `description: Use when...`

---

### Task 8: Create `ui-style-check/SKILL.md`

**Files:**
- Create: `agent-skills/ui-style-check/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/ui-style-check/SKILL.md` with this exact content:

```markdown
---
name: ui-style-check
description: Use when adding or modifying a UI component, style, interaction, or responsive layout - verifies alignment with existing component patterns, dark-mode tokens, and responsive breakpoints
---

# ui-style-check

Pre-merge guardrail for UI work. Run before claiming a UI change done.

1. Read 2-3 sibling components in the same module under `src/components/` for the local pattern (props shape, slot usage, naming).
2. Verify dark-mode tokens are used (no hard-coded colors); cross-check `src/styles/` for the canonical token names.
3. Verify responsive breakpoints match the existing components in the same view; do not introduce a new breakpoint without reason.
4. Reuse primitives in `src/components/` (button, input, modal, etc.) instead of duplicating markup.
5. If the change is behaviorally new (new state, new interaction), add or update a visual snapshot test under `src/__tests__/`.
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/ui-style-check/SKILL.md`
Expected: `name: ui-style-check`, `description: Use when adding or modifying...`

---

### Task 9: Create `testing-verification/SKILL.md`

**Files:**
- Create: `agent-skills/testing-verification/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/testing-verification/SKILL.md` with this exact content:

```markdown
---
name: testing-verification
description: Use when about to claim any code or documentation task done - requires running verification commands and confirming output before making any success claims
---

# testing-verification

Pre-claim guardrail. Evidence before assertions, always.

1. Run `npm run test:run` and confirm exit code 0. Capture the output line count if relevant.
2. Run `npm run build` and confirm exit code 0.
3. If UI changed, run the visual snapshot tests (`npm run test:run -- src/__tests__/visual-verification.test.js`) and confirm no unintended diff.
4. State the verification commands and their results in the completion message — paste the exit codes, not a vague "tests pass".
5. If any check fails, do not claim completion. Either fix the failure or report the failure to the user with the exact error.
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/testing-verification/SKILL.md`
Expected: `name: testing-verification`, `description: Use when about to claim...`

---

### Task 10: Create `docs-status-handoff/SKILL.md`

**Files:**
- Create: `agent-skills/docs-status-handoff/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/docs-status-handoff/SKILL.md` with this exact content:

```markdown
---
name: docs-status-handoff
description: Use when a code change affects documentation, behavior, status, plans, or known issues - keeps docs and multi-session state in sync
---

# docs-status-handoff

Coordination guardrail for handoffs. Run after any behavior-affecting change.

**Pre-action:** read `docs/STATUS.md` to know what's in flight and avoid colliding with other sessions.

**Post-action:**

1. Update `docs/STATUS.md` with the change: move entries between `In flight` / `Recently done` / `Next up` / `Blocked` as appropriate. New work → add to `In flight` before starting; completed work → move to `Recently done` with date, branch, and verification notes.
2. If behavior or known issues changed, also update `docs/PLAN.md` / `docs/LOG.md` / `docs/src/known-issues.md` (whichever is canonical for that fact).
3. If a preference or rule is not mature enough for `AGENTS.md` or formal docs, **suggest** to the user that they record it in `LOCAL.md`. Do not edit `LOCAL.md` unless the user explicitly asks.
4. Remove `Recently done` entries once they are reflected in `docs/LOG.md`, `docs/PLAN.md`, known issues, or commits. Keep at most 10 entries.
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/docs-status-handoff/SKILL.md`
Expected: `name: docs-status-handoff`, `description: Use when a code change...`

---

### Task 11: Create `map-engine-workflow/SKILL.md`

**Files:**
- Create: `agent-skills/map-engine-workflow/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/map-engine-workflow/SKILL.md` with this exact content:

```markdown
---
name: map-engine-workflow
description: Use when modifying world-map, geography, map renderer, or map worker code - anchors to canonical docs and current behavior classification
---

# map-engine-workflow

Workflow guardrail for world-map subsystem work.

1. **Read first** (as relevant to the change):
   - `docs/src/code-map.md §world-map`
   - `docs/src/decisions/ADR-0003-azgaar-pipeline.md`
   - `docs/src/known-issues.md §地图引擎`
   - `docs/src/rfcs/azgaar-pipeline/index.md`
2. **Identify the affected surface**: heightmap / tectonics / coast / rivers / nations / renderer / worker / AI adapter / UI.
3. **Status check**: is the current behavior `accepted` / `superseded` / `active issue` in the docs? Do not reintroduce behaviors marked `superseded` (e.g., `realism.level` is superseded — do not reintroduce).
4. **Keep changes scoped**: a bug fix is not a refactor. A new feature is not a "while I'm here" cleanup.
5. **For algorithm / perf rewrites**: use `?debug=perf` and the perf docs first; do not guess. If you cannot find a canonical reference, stop and ask the user.
6. **Verification**: run targeted map tests, then broader verification (`npm run verify`) if behavior changed.
7. Update `docs/STATUS.md` when behavior or known issues changed (delegate to `docs-status-handoff`).
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/map-engine-workflow/SKILL.md`
Expected: `name: map-engine-workflow`, `description: Use when modifying world-map...`

---

### Task 12: Create `worldbook-workflow/SKILL.md`

**Files:**
- Create: `agent-skills/worldbook-workflow/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/worldbook-workflow/SKILL.md` with this exact content:

```markdown
---
name: worldbook-workflow
description: Use when modifying worldbook, worldbook imports, or context builder code - matches work to the canonical worldbook workflow doc
---

# worldbook-workflow

Workflow guardrail for worldbook subsystem work.

1. **Read first**: `docs/guides/worldbook-workflow.md` — this is the canonical reference for all worldbook work.
2. **Classify the surface** of the change: quick import / advanced editor / SillyTavern import-export / context injection / structured settings. Each surface has its own conventions; do not mix them.
3. **Verify** the affected paths: import preview, conflict handling, active-worldbook selection. If context injection changed, run one generation smoke test.
4. **Three import paths** must remain working: preset import, novel-text import, AI-driven (说明驱动) generation. If any is broken, the change is not done.
5. Update `docs/STATUS.md` when workflow or behavior changed (delegate to `docs-status-handoff`).
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/worldbook-workflow/SKILL.md`
Expected: `name: worldbook-workflow`, `description: Use when modifying worldbook...`

---

### Task 13: Create `agent-maintenance/SKILL.md`

**Files:**
- Create: `agent-skills/agent-maintenance/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `agent-skills/agent-maintenance/SKILL.md` with this exact content:

```markdown
---
name: agent-maintenance
description: Use when modifying AGENTS.md, CLAUDE.md, agent-skills, .agents shim, .claude shim, or docs/STATUS.md structure - keeps agent infrastructure healthy
---

# agent-maintenance

Meta-skill for agent infrastructure changes. Run when touching any of: `AGENTS.md`, `CLAUDE.md`, `agent-skills/`, `.agents/` shim, `.claude/` shim, `docs/STATUS.md` structure.

1. **Symlink integrity**: verify every `.agents/skills/<name>` and `.claude/skills/<name>` symlink target exists in `agent-skills/<name>/SKILL.md`. Run `readlink -f .agents/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` and confirm all paths point inside `agent-skills/`.
2. **Frontmatter completeness**: verify every `SKILL.md` has YAML frontmatter with `name` and `description`. No exceptions.
3. **No drift**: confirm `docs/STATUS.md` / `docs/PLAN.md` / `docs/LOG.md` reflect current behavior, not stale state.
4. **Platform-specific rules**: a new rule that applies to multiple agents should go in `AGENTS.md`. A rule that is truly Claude-Code-specific goes in `CLAUDE.md`. Do not duplicate; do not leave empty placeholder sections in either file.
5. **Renamed or removed skill**: update both the `AGENTS.md` Hard-rules table and the corresponding shim symlinks. A removed skill = remove both symlinks; a renamed skill = re-link under the new name.
```

- [ ] **Step 2: Verify frontmatter**

Run: `head -3 agent-skills/agent-maintenance/SKILL.md`
Expected: `name: agent-maintenance`, `description: Use when modifying AGENTS.md...`

---

### Task 14: Verify all 7 SKILL.md files exist and have frontmatter

**Files:** (none new; verification only)

- [ ] **Step 1: List all canonical skills**

Run:
```bash
ls -la agent-skills/
find agent-skills -name SKILL.md | sort
```

Expected: 7 SKILL.md files listed in alphabetical order:
```
agent-skills/agent-maintenance/SKILL.md
agent-skills/commit-conventions/SKILL.md
agent-skills/docs-status-handoff/SKILL.md
agent-skills/map-engine-workflow/SKILL.md
agent-skills/testing-verification/SKILL.md
agent-skills/ui-style-check/SKILL.md
agent-skills/worldbook-workflow/SKILL.md
```

- [ ] **Step 2: Verify every file has YAML frontmatter with `name` and `description`**

Run:
```bash
for f in agent-skills/*/SKILL.md; do
  if ! head -1 "$f" | grep -q '^---$'; then echo "MISSING FRONTMATTER: $f"; fi
  if ! grep -q '^name: ' "$f"; then echo "MISSING name: $f"; fi
  if ! grep -q '^description: ' "$f"; then echo "MISSING description: $f"; fi
done
echo "done"
```

Expected: only `done` is printed; no `MISSING` lines.

---

### Task 15: Create 14 symlink shims (Codex + Claude Code)

**Files:**
- Create: 7 × `.agents/skills/<name>` symlinks
- Create: 7 × `.claude/skills/<name>` symlinks

- [ ] **Step 1: Create the symlink directories**

Run:
```bash
mkdir -p .agents/skills .claude/skills
```

- [ ] **Step 2: Create 7 Codex shims under `.agents/skills/`**

Run:
```bash
cd .agents/skills
ln -s ../../agent-skills/agent-maintenance     agent-maintenance
ln -s ../../agent-skills/commit-conventions    commit-conventions
ln -s ../../agent-skills/docs-status-handoff   docs-status-handoff
ln -s ../../agent-skills/map-engine-workflow   map-engine-workflow
ln -s ../../agent-skills/testing-verification  testing-verification
ln -s ../../agent-skills/ui-style-check        ui-style-check
ln -s ../../agent-skills/worldbook-workflow    worldbook-workflow
ls -la
```

Expected: 7 entries, each a symlink (starting with `l` in the perms column) pointing to `../../agent-skills/<name>`.

- [ ] **Step 3: Create 7 Claude Code shims under `.claude/skills/`**

Run:
```bash
cd ../.claude/skills
ln -s ../../agent-skills/agent-maintenance     agent-maintenance
ln -s ../../agent-skills/commit-conventions    commit-conventions
ln -s ../../agent-skills/docs-status-handoff   docs-status-handoff
ln -s ../../agent-skills/map-engine-workflow   map-engine-workflow
ln -s ../../agent-skills/testing-verification  testing-verification
ln -s ../../agent-skills/ui-style-check        ui-style-check
ln -s ../../agent-skills/worldbook-workflow    worldbook-workflow
ls -la
```

Expected: 7 symlinks, same pattern.

- [ ] **Step 4: Verify all 14 shim symlink targets resolve correctly**

Run:
```bash
echo "--- .agents/skills ---"
for name in agent-maintenance commit-conventions docs-status-handoff map-engine-workflow testing-verification ui-style-check worldbook-workflow; do
  target=$(readlink -f ".agents/skills/$name/SKILL.md")
  if [ "$target" = "/home/recoletas/jiuguan/text-game-framework/agent-skills/$name/SKILL.md" ]; then
    echo "OK .agents/skills/$name -> $target"
  else
    echo "BROKEN .agents/skills/$name -> $target"
  fi
done
echo "--- .claude/skills ---"
for name in agent-maintenance commit-conventions docs-status-handoff map-engine-workflow testing-verification ui-style-check worldbook-workflow; do
  target=$(readlink -f ".claude/skills/$name/SKILL.md")
  if [ "$target" = "/home/recoletas/jiuguan/text-game-framework/agent-skills/$name/SKILL.md" ]; then
    echo "OK .claude/skills/$name -> $target"
  else
    echo "BROKEN .claude/skills/$name -> $target"
  fi
done
```

Expected: 14 `OK` lines, no `BROKEN` lines. If any `BROKEN`, re-check the symlink target path; the issue is usually a typo or wrong relative-path depth.

---

### Task 16: Stage 2 verification + commit

**Files:** (none new; verification + commit only)

- [ ] **Step 1: Full file/link integrity check**

Run:
```bash
echo "=== 7 canonical SKILL.md ==="
find agent-skills -name SKILL.md | wc -l
echo "=== 14 shim symlinks ==="
find .agents/skills .claude/skills -name SKILL.md -type l | wc -l
```

Expected: `7` and `14` respectively.

- [ ] **Step 2: Frontmatter completeness check (re-run for all 14 shim-resolved files)**

Run:
```bash
for f in $(find .agents/skills .claude/skills -name SKILL.md); do
  if ! head -1 "$f" | grep -q '^---$'; then echo "MISSING FRONTMATTER: $f"; fi
  if ! grep -q '^name: ' "$f"; then echo "MISSING name: $f"; fi
  if ! grep -q '^description: ' "$f"; then echo "MISSING description: $f"; fi
done
echo "done"
```

Expected: only `done` printed; the shim symlinks resolve to the canonical files (frontmatter is in the canonical).

- [ ] **Step 3: Multi-platform discovery — Codex**

This step requires a real Codex CLI session. Open one in a separate terminal at the repo root and verify the skill list shows all 7 skills. **Document the result here**: if Codex is unavailable in this environment, note it and skip the manual check; this is the one step that cannot be auto-verified.

Acceptance: Codex startup context lists all 7 skills: `agent-maintenance`, `commit-conventions`, `docs-status-handoff`, `map-engine-workflow`, `testing-verification`, `ui-style-check`, `worldbook-workflow`.

- [ ] **Step 4: Multi-platform discovery — Claude Code**

This session IS a Claude Code session. The system reminder for skills should list all 7 `agent-skills` (in addition to any superpowers skills already loaded). If the current system reminder does not show them, the shims are not in scope; the cause is usually that the project-level `.claude/skills/` shim is not where the harness looks (it looks at user-global or another path). Do not proceed; report to the user.

Acceptance: 7 new skills visible in the system reminder.

- [ ] **Step 5: E2E behavior trigger mini-scenario**

Pick one skill (suggested: `commit-conventions`) and run it via the Skill tool to confirm the body is reachable and produces a sensible response. Paste a short excerpt of the response as evidence.

- [ ] **Step 6: Stage 2 gitignore + symlink status**

Run:
```bash
git status -sb | grep -E '(agent-skills|\.agents/skills|\.claude/skills)'
```

Expected: 7 untracked canonical files under `agent-skills/`, 7 untracked symlinks under `.agents/skills/`, 7 untracked symlinks under `.claude/skills/`. If any is missing, go back to Task 14 / 15.

- [ ] **Step 7: Stage all Stage 2 files**

Run:
```bash
git add agent-skills/ .agents/skills/ .claude/skills/
git status -sb | head -25
```

Expected: 21 entries staged (7 canonical + 14 symlinks), nothing else new. (`.gitignore` should not appear here — it was already committed in Stage 1.)

- [ ] **Step 8: Commit Stage 2**

Run:
```bash
git commit -m "docs(agents): add repository workflow skills"
```

Expected: commit succeeds, no `Co-Authored-By` footer. 21 files changed (7 SKILL.md + 14 symlinks).

- [ ] **Step 9: Final verification**

Run:
```bash
git log --oneline -3
echo "---"
git show --stat HEAD | tail -25
echo "---"
echo "shim symlinks still resolve:"
for name in agent-maintenance commit-conventions docs-status-handoff map-engine-workflow testing-verification ui-style-check worldbook-workflow; do
  readlink -f ".agents/skills/$name/SKILL.md" > /dev/null && echo "  .agents/skills/$name OK" || echo "  .agents/skills/$name BROKEN"
  readlink -f ".claude/skills/$name/SKILL.md" > /dev/null && echo "  .claude/skills/$name OK" || echo "  .claude/skills/$name BROKEN"
done
```

Expected:
- `git log` shows the Stage 1 commit on top of the design spec commit, then this Stage 2 commit
- `git show --stat HEAD` shows 21 files changed
- All 14 shim symlinks still resolve

---

## 总原则回顾

- Stage 1 → Stage 2 必须串行；Stage 2 失败时回滚只动 symlinks + skills，不影响 Stage 1 的 entry points
- 每个 task 完成后**记录 evidence**（哪个 verification step 通过了，paste 输出）
- 如果 verification 失败，不要"fix and continue"——先停，读失败输出，判断是 plan 写得不对还是 environment 问题，回到对应 task 重做
- 不引入 stage plan 之外的额外改动（YAGNI）
