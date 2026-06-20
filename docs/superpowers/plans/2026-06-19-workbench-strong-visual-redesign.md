# Workbench Strong Visual Redesign Plan

Spec: `docs/superpowers/specs/2026-06-19-workbench-strong-visual-redesign-design.md`  
Status: Draft v1  
Date: 2026-06-19  
Owner: Codex orchestrator

## Goal

Turn the rejected "micro-tuning" UI pass into a controlled multi-worker redesign pass. The next implementation must produce obvious composition changes on Writing, Notes, and Experience while avoiding another `/experience` load regression.

## Phase 0 — Preserve Research And Baseline

Commit scope:

- `.gitignore`
- `docs/agent-runs/current.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/*.prompt.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/*.prompt2.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/*.report.md`
- baseline screenshots in the same directory
- this spec and plan

Do not commit:

- `*.claude.json`
- `*.stderr.log`
- `pids.txt`
- `run-workers.sh` unless rewritten, because the async nohup approach failed and would mislead future agents.

Verification:

- `git status --short --untracked-files=all`
- confirm ignored raw Claude logs do not appear as commit candidates.

## Phase 1 — Dispatch Implementation Workers

Run workers in separate worktrees or strict disjoint write sets. Each worker receives only its page brief plus the global spec.

### Worker UI-W2 — Writing Pinax Wall

Read:

- `docs/superpowers/specs/2026-06-19-workbench-strong-visual-redesign-design.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-W1.report.md`

Allowed files:

- `src/pages/Writing.vue`
- `src/styles/themes/kao.css`
- focused tests in `src/__tests__/uiPolish.test.js`
- optionally `src/components/folio/{FolioSurface,ArchiveStrip,CharacterPortrait}.vue` only for additive variants.

Must deliver:

- wall/cork-board top composition,
- chapter shelf/folder left navigation,
- pinned manuscript dossier central surface,
- wall-attached character portrait,
- non-generic empty state,
- screenshots: `writing-wall-1280.png`, `writing-wall-empty-1280.png`.

Must not:

- edit Notes or Experience,
- add marketing copy,
- use bitmap wall/cork textures over 50 KB,
- turn the page into decorative hero art at the expense of editor function.

### Worker UI-N2 — Notes Archive Drawer

Read:

- global spec
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-N1.report.md`

Allowed files:

- `src/pages/Notes.vue`
- `src/styles/themes/kao.css`
- focused tests in `src/__tests__/uiPolish.test.js`

Must deliver:

- `material-drawer` left object,
- drawer fronts for material kinds,
- index cards inside drawers,
- central reading deck / active card,
- empty archive drawer state,
- batch ticket/stamp state,
- screenshots: empty, list, batch, detail.

Must not:

- reintroduce WorkbenchPageHero,
- keep center as ordinary `textarea` card with 8px radius and soft SaaS shadow,
- delete GM persona / advisor / image rail integrations.

### Worker UI-E2 — Experience Site Record Book

Read:

- global spec
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`

Allowed files:

- `src/pages/Experience.vue`
- `src/components/GamePanel.vue` only if empty/message wrapper must change,
- `src/components/InputArea.vue` only for visible copy and input shape,
- `src/styles/themes/kao.css`
- focused tests in `src/__tests__/uiPolish.test.js`

Must deliver:

- refresh-safe `/experience`,
- record/case header with six fields,
- no blank central paper as first read,
- input no longer shaped like generic chat,
- right rail labels less dashboard-like,
- screenshots at 1280 empty, 1280 active, 1280 long, 980, 640.

Must not:

- edit store/service/server/route files,
- use `:deep()` or scoped `:global(.theme-kao)`,
- add `!important`,
- hide existing core functionality.

### Worker UI-QA — Read-Only Review

Read:

- global spec,
- all three worker diffs after delivery,
- screenshots.

Must deliver:

- finding list ordered by severity,
- screenshot gate pass/fail table,
- CSS scope scan,
- route smoke notes.

Must not:

- edit files.

## Phase 2 — Codex Integration

Codex tasks:

1. Inspect each worker diff independently.
2. Reject any micro-tweak-only worker output.
3. Resolve `kao.css` conflicts manually and keep page-prefixed sections.
4. Check for forbidden selectors:
   - `:global(.theme-kao)`
   - broad `.theme-kao` rules in scoped page blocks
   - new unlayered `!important`
5. Check no forbidden business files changed.
6. Keep only screenshots that correspond to accepted implementation.

Acceptance gate per page:

- visible composition changed,
- all required functionality still present,
- focused test passes,
- build passes,
- screenshot exists and matches brief.

## Phase 3 — Verification

Minimum commands:

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
npm run build
```

Preferred before merge:

```bash
npm run verify:full
```

Browser smoke:

- `/writing` at 1280x800
- `/notes` at 1280x800
- `/experience` at 1280x800
- refresh `/experience`
- navigate `/writing` -> `/experience`
- ensure `html`, `body`, and `#app` widths remain non-zero.

## Phase 4 — Commit Shape

Recommended commits:

1. `docs(ui): capture strong workbench redesign research and plan`
2. `style(writing): prototype pinax wall workbench`
3. `style(notes): prototype archive drawer workbench`
4. `style(experience): prototype site record book`
5. `test(ui): lock strong workbench visual contracts`

If worker diffs are messy, Codex may squash per page before committing. Do not create one giant all-page commit unless conflicts make separation impractical.

## Claude Prompt Template

Use this as the base prompt for each implementation worker:

```text
你是 Claude Code worker。Codex 是主控集成者，你只负责本页切片。

目标不是微调，而是让页面第一眼发生构图变化。你必须先读：
- docs/superpowers/specs/2026-06-19-workbench-strong-visual-redesign-design.md
- docs/agent-runs/2026-06-19-ui-redesign-research/UI-<PAGE>.report.md

硬约束：
- 不碰 store / services / server / routes。
- 不使用 scoped :global(.theme-kao)。
- 不使用 !important。
- 不引入第三方 UI 库。
- 不用超过 50KB 的新位图纹理。
- 如果只是改 padding/font/border/shadow/button label，算失败。

交付：
1. 先充分调研当前页面 DOM/CSS 和相关测试。
2. 做实现。
3. 自审：逐条对照 anti-micro-tweak gate 和页面验收。
4. 跑 focused test + build。
5. 截图。
6. 输出报告：改动文件、截图路径、测试结果、风险、未做事项。
```

## Stop Conditions

Stop and hand back to Codex if:

- `/experience` route width collapses or page fails to load,
- a worker needs store/service changes to satisfy visual goals,
- `kao.css` conflicts cannot be resolved without broad global selectors,
- screenshot shows the same SaaS skeleton after claimed implementation,
- test failure is unrelated but blocks verification and cannot be isolated.

## Self-Review

- The plan keeps research and implementation separate.
- Worker ownership is disjoint enough for parallel execution.
- The plan explicitly rewards token-heavy research but requires screenshot evidence.
- The plan protects Codex context by asking for reports, screenshots, diffs, and tests rather than raw worker chat.
- The plan does not ask the user to accept vague aesthetic language without measurable gates.
