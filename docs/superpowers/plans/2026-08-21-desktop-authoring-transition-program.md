# Desktop Authoring Transition Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Pinax into a desktop-first, local-folder-owned novel authoring application with TXT manuscript truth, a compact SQLite sidecar, one unified editable writing/simulation surface, and bounded AI-derived data.

**Architecture:** Deliver the transition through eight compatibility-preserving increments. Establish the Electron and project-repository boundary first; migrate legacy data and plain-text editing next; then merge Writing and Experience, add direct AI edits and automatic narrative state, migrate derivatives, and finally make desktop the default. Every increment keeps one authoritative owner for each datum and leaves the current browser build usable until its replacement passes parity gates.

**Tech Stack:** Electron Forge + Vite, Vue 3, Tiptap 3, Node.js filesystem APIs, better-sqlite3, Express/provider adapters, Vitest, Playwright/UI audit, existing Pinax provenance and narrative-agent contracts.

---

## Program invariants

These rules apply to every task and are release blockers, not aspirations:

1. `manuscript/**/*.txt` owns current manuscript characters and line breaks. No durable Markdown, HTML, or Tiptap JSON mirror may become a second manuscript truth.
2. `reference/**/*.txt` owns editable character, place, event, and research prose. Stable IDs, structured fields, relationships, timeline facts, annotations, revisions, and provenance belong in `.pinax/project.sqlite`.
3. The renderer never receives raw filesystem, database, shell, or unrestricted IPC access. Each preload method maps to one validated operation.
4. Experience generation and manual writing edit the same chapter document. A generated passage is an editor transaction, not a chat transcript, candidate card, or scene branch.
5. Persist only the accepted patch, request-level undo patch, bounded operation metadata, source IDs/revisions, and failure class. Do not persist expanded prompts, model reasoning, stream fragments, transport envelopes, or rejected alternatives.
6. Routine derived character/relationship/event observations are usable without confirmation. Only ambiguous identity, locked-fact conflict, destructive timeline change, or cross-scene retcon enters an exception queue.
7. Materials and canvas data are derivatives. They keep `sourceRefs[]`, compute staleness from source revisions, and never overwrite source prose automatically.
8. Cache cleanup may delete only rebuildable or unaccepted data. It must never delete manuscript, reference files, named history, or accepted project media.
9. Migration is copy-first, dry-runnable, idempotent, and leaves browser data untouched until the user independently removes it.
10. No phase performs a big-bang rewrite of `Experience.vue`, `Writing.vue`, `gameStore.js`, or `useStorage.js`.

## Dependency and delivery map

```text
P1 Desktop project foundation
├── P2 Legacy migration
└── P3 Plain-text manuscript editor
    └── P4 Unified authoring workbench
        └── P5 Direct AI authoring
            └── P6 Automatic narrative state
                └── P7 Materials/canvas migration

P1 + P2 + P3 + P4 + P5 + P6 + P7
└── P8 Desktop release transition
```

P2 and P3 may run in parallel only after P1's repository contract and schema v1 are merged. P6 contract work may begin alongside the latter half of P5, but its automatic write path cannot merge until AI transaction and source-revision semantics are stable. P7 may inventory old assets early, but database migration waits for P6's stable source identity.

## Ownership rules for parallel workers

| Lane | Exclusive write ownership | May read | Must not edit |
|---|---|---|---|
| Integration | `package.json`, lockfile, `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, router/app shell during merge | entire repository | feature internals while their owner is active |
| Desktop foundation | `electron/**`, `shared/desktopProjectContract.js`, Electron/Vite/Forge configs, `src/services/platform/**`, `src/services/storage/**` | current storage and backup code | Writing/Experience pages |
| Legacy migration | `src/utils/backupExport.js`, `src/services/migration/**`, `electron/migration/**`, migration UI slice | storage contract | editor and narrative runtime |
| Manuscript editor | `src/services/writing/plainTextDocument.js`, anchor/history/reconciliation services, `WritingNotebookEditor.vue` | desktop repository | Experience and project shell |
| Workbench | desktop shell components, router compatibility, `Writing.vue` after editor owner hands off | all feature services | repository internals |
| AI authoring | narrative transaction services, orchestrator adapter, Experience parity removal | editor/repository contracts | storage schema without integration approval |
| Narrative state | derived-state contracts/services and inspector exception slice | manuscript and AI receipts | material/canvas stores |
| Derivatives | material/canvas/media repository migration and center views | source identity/state services | manuscript editor internals |

If two tasks need the same exclusive file, they are sequential. The integration owner stages shared-file edits after the owning worker has passed focused tests; workers do not resolve shared-file conflicts independently.

## Milestone 0: Freeze contracts and baseline

**Source:** `docs/superpowers/specs/2026-08-21-desktop-authoring-workspace-design.md`

- [ ] Confirm the design invariants above remain identical to the approved specification.
- [ ] Record the starting test/build baseline in `docs/agent-runs/desktop-authoring-transition/current.md`.
- [ ] Inventory direct `localStorage` reads/writes into four classes: project content, application preferences, provider credentials/configuration, and disposable diagnostics/cache.
- [ ] Mark which class owns each `STORAGE_KEYS` entry; do not infer that every browser key belongs inside a novel project.
- [ ] Create the phase task board with branch/worktree, owner, write set, dependency, focused test, and summary path for each worker.

Exit gate: the inventory has no unclassified durable key, and no worker has overlapping write ownership.

## Milestone 1: Desktop project foundation

**Detailed execution plan:** `docs/superpowers/plans/2026-08-21-desktop-project-foundation.md`

Deliver:

- Electron Forge packaging with sandboxed/context-isolated renderer and narrow preload methods;
- project-directory selection, creation, opening, locking, and recent-project metadata;
- `.pinax/project.json`, SQLite schema migrations, atomic UTF-8 text I/O, write receipts, integrity checks, and managed backup primitives;
- renderer platform and repository adapters while preserving browser behavior;
- cache root and byte-budget enforcement that cannot touch accepted project files.

Exit gate:

```bash
npm run test:desktop
npm run desktop:package
npm run verify:full
```

Expected: all exit 0; the packaged application can create, close, and reopen a temporary project; a browser build still loads without `window.pinaxDesktop`.

## Milestone 2: Legacy migration

Create the detailed plan `docs/superpowers/plans/2026-08-21-legacy-project-migration.md` only after P1 exports `DesktopProjectRepository` and schema v1. Its contract must include:

- backup schema v3 with an immutable source inventory, per-record type, byte length, and SHA-256;
- browser-side explicit “Move project to desktop” export without deleting local data;
- desktop dry run that reports supported, converted, detached, orphaned, and rejected records;
- deterministic stable-ID assignment and an import journal keyed by bundle ID plus source record ID;
- staging-directory import, count/hash validation, atomic finalization, and rollback;
- v2 backup compatibility and duplicate-import idempotency;
- conversion fixtures for worldbooks, books/chapters, Experience turns, writing units, annotations, history, materials, and canvas data.

Exit gate: importing the same fixture twice creates no duplicate logical records; cancelling or failing leaves no partially openable project; the original browser data remains readable.

## Milestone 3: Plain-text manuscript editor

Create the detailed plan `docs/superpowers/plans/2026-08-21-plain-text-manuscript-editor.md` after P1 repository APIs stabilize. It must implement:

- a pure TXT ↔ Tiptap paragraph serializer preserving empty paragraphs and line breaks;
- sidecar anchors containing chapter ID, source revision, start/end, exact quote, prefix, and suffix;
- deterministic re-anchoring with explicit `needs_relocation` on zero or multiple matches;
- debounce plus flush on blur, chapter switch, explicit save, and application close;
- file watcher as a hint plus focus/open hash reconciliation;
- three-way conflict state when disk and editor both diverge from the loaded base;
- compact patch history, periodic compressed checkpoints, retention tiers, named snapshots, and request-level transactions;
- transient AI decorations that do not survive reload.

Exit gate: the same TXT bytes survive open/save without edits; external edits never disappear; annotations either relocate uniquely or remain visibly unresolved; no current manuscript is stored as durable editor JSON.

## Milestone 4: Unified authoring workbench

Create `docs/superpowers/plans/2026-08-21-unified-authoring-workbench.md` after P3's editor API merges. Build one desktop window with:

- project navigator destinations for manuscript, characters, places, events, research, materials, and canvas;
- one center view host and one collapsible contextual inspector;
- a restrained manuscript surface, focus mode, and a minimal save/sync status line;
- existing setting, material, and canvas capabilities mounted as contextual destinations rather than duplicate top-level products;
- compatibility routes that preserve deep links during transition;
- command mapping for continue, selected-character drive, multi-character scene, event/pressure advance, insert, rewrite, and undo.

Exit gate: 1440, 1024, and 390-width audits show no duplicated global navigation, inaccessible modal/drawer, horizontal clipping, or hidden save/conflict status. Experience remains available behind a compatibility flag until P5 parity.

## Milestone 5: Direct AI authoring

Create `docs/superpowers/plans/2026-08-21-direct-ai-authoring.md` after P3 transaction semantics and P4 command surfaces stabilize. It must:

- adapt the existing NarrativeKernel/orchestrator to a bounded editor selection/cursor target;
- insert accepted continuation/simulation output directly in one editor transaction;
- perform insertion and rewrite against an expected chapter revision and reject stale writes;
- save the minimal durable receipt defined by the design specification;
- show a transient highlight, compact context-source summary, and “Undo this generation” affordance;
- preserve current planning/prose transcript isolation, evidence budgets, paragraph normalization, dialogue quote normalization, authenticity constraints, recovery, and typed failure behavior;
- stop persisting duplicate Experience transcripts once migration and parity pass.

Exit gate: continuation, selected speaker, multi-character simulation, advance, insertion, rewrite, cancellation, stale revision, provider failure, crash recovery, and request-level undo pass with real editable prose. No flow requires “收进稿件”.

## Milestone 6: Automatic narrative state

Create `docs/superpowers/plans/2026-08-21-automatic-narrative-state.md` after P5 receipt/source revisions stabilize. Define four states—`locked`, `derived`, `stale`, `conflict`—and implement:

- extraction jobs keyed by source chapter revision and bounded ranges;
- identity resolution against stable character/place/event IDs;
- automatic availability of non-conflicting observations to later AI context;
- invalidation and bounded recomputation when source ranges change;
- exception-only inspector items for ambiguous identity, locked-fact contradiction, destructive timeline mutation, and cross-scene retcon;
- author operations to lock, override, dismiss, or relocate, without a routine confirmation inbox.

Exit gate: ordinary prose edits update usable observations without user confirmation; deleting their evidence invalidates them; locked facts cannot be overwritten by inference.

## Milestone 7: Materials and canvas migration

Create `docs/superpowers/plans/2026-08-21-project-derivatives-migration.md` after stable source revisions exist. Preserve the current source-ref direction and add:

- project-scoped material/canvas/storyboard records using stable IDs and revisions;
- accepted binary storage by SHA-256 with separate logical-use records;
- computed `current`, `stale`, `detached`, and `archived` states;
- explicit stale review/regeneration, never automatic overwrite;
- detached-source repair without fabricated provenance;
- global 1 GiB rebuildable cache with LRU pruning and project-size reporting.

Exit gate: identical accepted media occupies one physical project object; stale status changes after source revision; cache clearing preserves accepted assets and all source text.

## Milestone 8: Desktop release transition

Create `docs/superpowers/plans/2026-08-21-desktop-release-transition.md` after P1–P7 exit gates pass. Include:

- Windows packaging, signing/update preparation, native-module rebuild, clean-machine install, upgrade, and uninstall checks;
- crash, power-loss, locked-file, read-only-directory, non-ASCII path, long path, moved project, stale lock, corrupt DB, and low-disk recovery matrices;
- provider process lifecycle and secret-storage audit;
- project backup/restore and text-only emergency extraction documentation;
- web trial conversion to in-memory/temporary state plus legacy migration export;
- one stable desktop release cycle retaining browser export;
- release notes that distinguish project files, project database, accepted media, application preferences, secrets, logs, and rebuildable cache.

Exit gate: a clean Windows machine can install, import an existing project, author/edit/generate, back up, restore, upgrade, and recover text without developer tools. The public web build cannot silently create a durable browser-only project.

## Cross-phase verification matrix

Run focused tests at every red/green step. Before each phase merge, run:

```bash
npm run test:run
npm run build
npm run docs:build
git diff --check
```

From P1 onward also run:

```bash
npm run test:desktop
npm run desktop:package
```

From P4 onward run the project-shell UI audit at 1440, 1024, and 390 widths. From P5 onward run the deterministic narrative recovery and production dry-run smokes. Real provider and clean-machine packaging gates must be reported separately; deterministic tests cannot be presented as substitutes.

## Program review checklist

- [ ] Each phase has one canonical data owner and names temporary compatibility copies.
- [ ] All cross-process inputs and outputs use serializable validated contracts.
- [ ] No renderer code imports Node filesystem, Electron main-process modules, or better-sqlite3.
- [ ] No migration deletes or mutates its source.
- [ ] No phase stores full AI prompts/responses merely for debugging convenience.
- [ ] External text edits preserve prose even when sidecar metadata cannot relocate.
- [ ] Browser application preferences are not accidentally copied into every novel project.
- [ ] Provider credentials are not stored in the project directory or migration bundle.
- [ ] Accepted media and named snapshots are excluded from automatic cache/history deletion.
- [ ] Phase summaries update `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, and known issues when behavior changes.
