# Workbench Strong Visual Redesign Design

Status: Draft v1  
Date: 2026-06-19  
Owner: Codex orchestrator  
Research inputs:
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-R0.report.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-W1.report.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-N1.report.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`
- Baselines: `writing-baseline-1280.png`, `notes-baseline-1280.png`, `experience-baseline-1280.png`

## 1. Problem

The last UI round changed surface details but did not change page identity enough. The user feedback is accurate: Writing still feels largely unchanged, Experience recently regressed at load time, and Notes is only partially accepted.

The root issue is not a missing border, button style, or font size. The three workbench pages still share the same skeleton:

- a product toolbar at the top,
- a left or right utility rail,
- a central empty paper/card area,
- SaaS input and action controls,
- archive/folio styling applied as a skin rather than as page composition.

The next round must change composition and object grammar. A worker that only tunes `font-size`, `padding`, `border`, `box-shadow`, or button labels has failed the brief.

## 2. Page Roles

### Writing: Pinax Wall / 编辑室资料墙

Writing is not a generic editor with a toolbar. It should read as an editing room wall:

- central manuscript dossier pinned to a board,
- chapter list as physical shelf or stacked folders,
- character art as a wall dossier card, not a floating decoration,
- top area as wall trim / cork board band, not a 44px toolbar,
- save state as stamp/marking, not toast/product status.

The first read should be: "I am standing in front of a writing wall with the current manuscript pinned up."

### Notes: Archive Drawer / 档案抽屉索引盒

Notes is the most accepted direction so far, but it is still too close to CMS. It should become a card catalog / archive drawer:

- left side is a drawer system, not a collapsible list,
- material groups are drawer fronts with handles, Roman numbers, and index cards,
- the central editor is a reading deck / active card,
- empty state is an opened empty archive drawer, not centered illustration plus CTA,
- batch actions are tickets/stamps attached to the drawer.

The first read should be: "I am pulling index cards out of an archive cabinet."

### Experience: Site Record Book / 现场记录本

Experience must not be a chat app with a decorative right sidebar. It should become a field record book / case log:

- main area carries a visible case header with case number, volume, time, place, present characters, and current objective,
- message flow sits inside a record-book page,
- input action is "记入 / 落笔", not "发送",
- right rail internals are archive sections, not dashboard KPI cards,
- empty state is a filled record header waiting for first entry, not a blank paper rectangle.

The first read should be: "I am writing a live field record into an open case book."

## 3. Global Hard Constraints

1. No WorkbenchPageHero on Writing / Notes / Experience.
2. No large explanatory copy such as "当前正在处理..." on these pages. Operational surfaces should show real state, not describe themselves.
3. No scoped `:global(.theme-kao)` in page components. This previously compiled into a bare `.theme-kao` selector and broke `/experience`.
4. No unlayered `!important` theme overrides unless Codex explicitly approves during integration.
5. No third-party UI library.
6. No store, generation, worldbook context builder, server, or route changes in this visual pass.
7. No new bitmap texture over 50 KB. Use existing assets, CSS gradients, SVG masks, or generated image assets only after explicit approval.
8. All new colors must use existing Kao archive tokens unless the spec section explicitly declares a new token.
9. LXGW WenKai / display type may be used for manuscript titles, page marks, drawer labels, and prose text. It must not be used for counters, chips, technical metadata, or dense controls.
10. All major interactive elements must keep native button/input semantics and visible focus states.
11. `prefers-reduced-motion: reduce` must disable paper rotation, drawer pull, pin wobble, and stamp animations.
12. Desktop screenshot gates are required before acceptance. Text-only self-review is not enough.

## 4. Anti-Micro-Tweak Gate

A change is rejected if it only does any of the following:

- changes spacing, font size, line height, or border radius without changing layout semantics,
- changes button labels without changing input/action composition,
- adds hover scale or a new shadow to existing cards,
- swaps one token color for another while keeping the same dashboard skeleton,
- adds a decorative badge/label but leaves the page skeleton unchanged,
- moves a sidebar by less than 40px and calls that a redesign,
- keeps the same 240px sidebar + flex main + rail structure across all three pages.

Each page implementation must include at least three of these structural moves:

- new named region in the template,
- repositioned character art with a narrative role,
- empty state replaced with a page-specific object,
- action/input area rebuilt around a page-specific verb,
- central work surface changed from card/editor to page object,
- sidebar/rail converted into a physical object with altered layout.

## 5. Page-Specific Acceptance

### Writing Acceptance

Required first slice:

- top 160-220px reads as wall/cork-board band, not toolbar,
- current chapter is physically pinned or placed as dossier sheet,
- left chapter navigation reads as shelf/folders, not list/card stack,
- character portrait is attached to wall or dossier card with visible pins/tape,
- empty state includes unfinished manuscript marks and two true work actions,
- no generic round icon buttons dominate the first viewport.

Suggested screenshot gates:

- `writing-wall-1280.png`
- `writing-wall-1440.png`
- `writing-wall-empty-1280.png`
- `writing-wall-long-chapter-1280.png`

### Notes Acceptance

Required first slice:

- left rail becomes `material-drawer` or equivalent drawer object,
- seven material kinds read as drawer fronts or index groups,
- central surface becomes reading deck / active index card,
- ArchiveStrip moves to a pinned/floating position, not a normal header row,
- batch state appears as ticket/stamp attached to the drawer,
- empty state visibly shows an empty archive drawer/card catalog.

Suggested screenshot gates:

- `notes-drawer-empty-1280.png`
- `notes-drawer-list-1280.png`
- `notes-drawer-batch-1280.png`
- `notes-drawer-detail-1280.png`
- `notes-drawer-dark-1280.png`

### Experience Acceptance

Required first slice:

- `/experience` loads correctly after refresh and route switching,
- main area contains a case/record header with at least six real fields,
- input area no longer looks like a generic chat box,
- send action copy changes to a record-book verb and the visual shape supports it,
- right rail labels and internals remove dashboard/KPI language where possible,
- empty state is a field record header waiting for first log entry.

Suggested screenshot gates:

- `experience-record-book-empty-1280.png`
- `experience-record-book-1280.png`
- `experience-record-book-long-1280.png`
- `experience-record-book-1440.png`
- `experience-record-book-980.png`
- `experience-record-book-640.png`

## 6. Implementation Boundary

Allowed files for first implementation pass:

- `src/pages/Writing.vue`
- `src/pages/Notes.vue`
- `src/pages/Experience.vue`
- `src/styles/themes/kao.css`
- focused UI contract tests under `src/__tests__/`

Conditionally allowed, only if the page cannot reach the target without a reusable variant:

- `src/components/folio/FolioSurface.vue`
- `src/components/folio/ArchiveStrip.vue`
- `src/components/folio/CharacterPortrait.vue`
- `src/components/workbench/WorkbenchPageHero.vue` only for tests proving these pages no longer use it, not for visual expansion.

Forbidden in this pass:

- `src/stores/**`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`
- `server/**`
- routing files
- theme variant runtime logic

## 7. Worker Model

Codex remains integrator and final verifier. Claude workers may research and implement in parallel only with isolated scopes.

Recommended workers:

- `UI-W2`: Writing Pinax Wall prototype.
- `UI-N2`: Notes Archive Drawer prototype.
- `UI-E2`: Experience Site Record Book prototype.
- `UI-QA`: screenshot/test reviewer, read-only.

Each implementation worker must:

- read this spec plus its page report,
- produce screenshots,
- run focused tests and build,
- self-review against anti-micro-tweak gate,
- report exact file changes and unresolved risks.

Workers must not edit each other's page files. Shared `kao.css` edits must be isolated by page-prefixed class names and integrated by Codex.

## 8. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| CSS scope regression breaks `/experience` again | High | Ban scoped `:global(.theme-kao)`; smoke test route width after refresh |
| Workers overdecorate instead of changing composition | High | Anti-micro-tweak gate and screenshot gates |
| Writing wall becomes too theatrical and diverges from Notes/Experience | Medium | Keep archive material tokens and manuscript function density |
| Notes drawer becomes normal accordion | Medium | Require drawer handle, index card stack, active reading deck |
| Experience still reads as chat app | High | Main record header and input rewrite are mandatory in first slice |
| Shared `kao.css` becomes a conflict magnet | Medium | Page-prefixed blocks; Codex integration pass |
| Mobile collapses after desktop-heavy design | Medium | 980px and 640px screenshots for Experience; at least 1024px fallback for Writing/Notes |

## 9. Self-Review

- No placeholders or TBD remain.
- Scope is intentionally limited to three workbench pages and Kao visual CSS.
- The spec rejects micro-tuning explicitly and defines structural requirements.
- The spec preserves the user's current workflow: Claude spends tokens researching/implementing; Codex keeps context, integrates, and verifies.
- The spec does not authorize code implementation without a separate plan and user approval.
