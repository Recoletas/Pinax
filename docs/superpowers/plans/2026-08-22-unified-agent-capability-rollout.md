# Unified Agent Capability Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 端把设定、体验、写作的 AI 能力迁移到一个可执行任务目录、一个项目知识门面和一个结果事务层，并把体验与写作合并为统一创作工作区。

**Architecture:** 本计划是四份可独立验收的子计划的总执行图。共享基础先冻结合同；设定迁移与创作运行时在合同冻结后并行；统一创作界面最后接入，旧 Experience 在等价门禁通过前保持兼容。Electron、本地目录和 SQLite 不在本轮实现范围内。

**Tech Stack:** Vue 3、Pinia、Vite、Vitest、Express、现有 provider adapters、现有 NarrativeKernel。

---

## Canonical inputs

- Architecture specification: `docs/superpowers/specs/2026-08-22-unified-agent-capability-architecture-design.md`
- Shared status: `docs/STATUS.md`
- Existing task contract: `shared/agentTaskContract.js`
- Existing context contract: `shared/agentContextContract.js`
- Existing narrative runtime: `src/services/agents/narrativeKernel.js`
- Existing writing surface: `src/pages/Writing.vue`
- Existing settings surfaces: `src/pages/WorldbookCreationWorkspace.vue` and `src/components/worldbook/StructuredSettingsPanel.vue`

## Plan suite

1. `2026-08-22-unified-agent-foundation.md`
   - W0-W1: canonical catalog, request contract, project facade, context profiles, router, execution engine and result transaction.
2. `2026-08-22-unified-agent-settings-migration.md`
   - W2: source/import, field/section/revision, place, research and maintenance workflows.
3. `2026-08-22-unified-agent-authoring-runtime.md`
   - W3-W4 and runtime half of W6: writing tasks, NarrativeKernel profile, auxiliary tasks and derived observations.
4. `2026-08-22-unified-authoring-workspace.md`
   - W5, UI half of W6 and W7: one editable authoring surface, transient undo, context inspector, exception review and compatibility retirement.

## Dependency graph

```text
foundation (serial)
    ├── settings migration ───────────────┐
    └── authoring runtime ── workspace UI ├── integration gates
                                         └── compatibility cleanup

Electron persistence adapter: starts only after integration gates pass
```

## Specification coverage

| Architecture requirement | Implementation owner |
|---|---|
| One project identity, revision, authority and provenance view | Foundation Tasks 2-4 |
| One client/server executable task catalog | Foundation Tasks 1 and 8 |
| Deterministic routing without supervisor LLM | Foundation Task 5 |
| Fixed workflow kinds and sparse expert profiles | Foundation Tasks 1, 4 and 5 |
| Revision/effect validation before every durable AI mutation | Foundation Task 6 |
| Low-sensitivity context ledger and operational metrics | Foundation Tasks 4 and 7 |
| Settings source/import/field/section/place/research/maintenance calls | Settings Tasks 1-6 |
| NarrativeKernel retained as the mature narrative expert | Authoring Runtime Task 3 |
| Writing micro-edits, review and inline completion | Authoring Runtime Task 2 |
| Next actions, dialogue, emergence, compaction and asset summary | Authoring Runtime Task 4 |
| Character/relation/event/timeline/memory derivation | Authoring Runtime Tasks 5-6 |
| One editable draft for legacy Experience history and new prose | Workspace Tasks 2 and 4 |
| No page modes or scene-draft branches | Workspace Task 3 |
| Transient origin feedback and request-level Undo | Workspace Task 4 |
| Context inspector without raw prompts | Workspace Task 5 |
| Routine auto-commit and exceptional conflict review | Workspace Task 6 |
| Experience compatibility and retirement gate | Workspace Tasks 7-8 |
| Web-first release before Electron persistence | Workspace Task 9 and this rollout gate |

## Worktree and ownership layout

| Track | Suggested branch | Exclusive ownership | Shared files requiring integration-owner edit |
|---|---|---|---|
| Foundation | `feature/unified-agent-foundation` | `shared/agent*`, `src/services/project/`, core files under `src/services/agents/`, `server/services/agentTaskAllowlist.js` | `src/__tests__/agentContracts.test.js` |
| Settings | `feature/unified-agent-settings` | settings workflow adapters, settings tests, worldbook UI call sites | `docs/STATUS.md` only at integration |
| Authoring runtime | `feature/unified-agent-authoring-runtime` | authoring workflow adapters, narrative bridge, observer services, runtime tests | `src/stores/gameStore.js` |
| Workspace UI | `feature/unified-authoring-workspace` | `Authoring.vue`, authoring components/composables, router/nav and UI audit states | `src/pages/Writing.vue`, `src/pages/Experience.vue` compatibility edits |

Rules:

- Foundation is merged before the other worktrees are created or rebased.
- Settings and Authoring Runtime may run concurrently because they do not edit the same workflow files.
- Only the integration owner changes the frozen catalog after Foundation; workers request a catalog amendment instead of editing it opportunistically.
- Workspace UI starts only after Authoring Runtime focused tests pass.
- No worker stages unrelated research or source-ingestion WIP.

## Integration sequence

- [ ] **Step 1: Execute and merge Foundation**

Run the complete foundation plan. Expected gate: its focused tests and `npm run verify:full` pass on a clean worktree.

- [ ] **Step 2: Create Settings and Authoring Runtime worktrees from the same merged commit**

```bash
git worktree add /tmp/pinax-unified-agent-settings -b feature/unified-agent-settings main
git worktree add /tmp/pinax-unified-agent-runtime -b feature/unified-agent-authoring-runtime main
```

Expected: both worktrees report the Foundation merge commit as `HEAD`.

- [ ] **Step 3: Execute Settings and Authoring Runtime independently**

Each worker runs its own focused tests, self-review, `git diff --check`, and commits only its ownership set.

- [ ] **Step 4: Merge Settings, then Authoring Runtime into the integration branch**

```bash
git merge --no-ff feature/unified-agent-settings
git merge --no-ff feature/unified-agent-authoring-runtime
```

Expected: no shared source conflict. If `docs/STATUS.md` conflicts, the integration owner preserves both completion facts and one current next step.

- [ ] **Step 5: Run the cross-track contract gate**

```bash
npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/settingsAgentWorkflows.test.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/agentContracts.test.js src/__tests__/integration.test.js
```

Expected: all files pass; client and server expose the same canonical task IDs; settings and authoring results cannot exceed their effect policies.

- [ ] **Step 6: Execute Workspace UI from the integrated runtime**

Run `2026-08-22-unified-authoring-workspace.md` in a fresh worktree based on the integrated commit.

- [ ] **Step 7: Run release gates before compatibility cleanup**

```bash
npm run verify:full
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

With an already-running development server only:

```bash
UI_AUDIT_ROUTES=authoring,experience UI_AUDIT_WIDTHS=1440,1024,390 UI_AUDIT_STATES=regular,loading,error,stale npm run audit:ui
```

Expected: deterministic tests and builds pass; live UI audit has zero console errors and zero accessibility failures. Real-provider checks remain separately reported and are never inferred from loopback tests.

## Rollback boundaries

- Foundation rollback: restore legacy adapters while leaving new catalog files unused.
- Settings rollback: restore direct service calls; no canonical worldbook mutation occurs automatically, so drafts remain recoverable.
- Runtime rollback: route task execution back to `NarrativeKernel` and existing writing services through the compatibility adapter.
- UI rollback: point `/writing` back to `Writing.vue`; `/experience` remains intact until final parity.
- W7 cleanup is a separate commit and may be reverted without reverting the unified workspace.

## Definition of done

- every executable task has exactly one workflow kind, context profile, schema, effect policy and owner;
- Settings AI calls use the shared dispatcher but retain explicit draft adoption;
- writing and simulation edit one document and share one project identity/revision;
- narrative prose remains immediately editable with one transient request-level Undo;
- routine observations do not interrupt typing, and locked conflicts remain reviewable;
- Experience compatibility remains until route/content/history parity passes;
- Web behavior is proven before any Electron persistence implementation resumes.
