# Unified Agent Authoring Runtime — Handoff Summary

Date: 2026-08-22
Branch: `feature/unified-agent-authoring-runtime` (worktree `/tmp/pinax-unified-agent-runtime`)
Base: Foundation merge commit `5693d52`
Plan: `docs/superpowers/plans/2026-08-22-unified-agent-authoring-runtime.md`

## What landed

All 7 plan tasks executed TDD-style (failing test → implement → green → commit):

1. **Authoring project adapter** — `src/services/agents/authoring/authoringProjectAdapter.js`: frozen projections of one shared project/document/narrative identity for writing and experience state.
2. **Deterministic writing tasks** — `authoringTextWorkflow.js` (7 fixed task→service mappings; review/ephemeral → suggestions, direct-text → text-insert, review-draft → text-patch bound to baseRevision) + `authoringTaskDispatcher.js` (legacy alias → canonical id at the request boundary, alias metric). `advisorTaskService.ADVISOR_TASK_TYPES` now hold canonical ids and record alias use; inline completion requests use `authoring.complete.inline`.
3. **NarrativeKernel as narrative-scene expert** — thin `narrativeSceneWorkflow.js` adapter maps `authoring.continue/advance/simulate.character/simulate.scene/trigger` to isolated kernel turns with intent modes; planning transcripts never serialize into results. NarrativeKernel gained an additive, behavior-neutral `intentMode` passthrough (`buildNarrativeKernel({ intentMode })` → `kernel.intentMode`); `generationService.runNarrativeAgentTurn` accepts optional `intentMode`. BeatPlan isolation, phase timeouts, lore activation, presentation v5, recovery rollback ordering untouched.
4. **Auxiliary experience calls** — `authoringAuxiliaryWorkflow.js` routes next-actions / dialogue-options / emergence / context.compact / asset.summarize with typed normalizations (suggestions, runtime candidates, derived-upsert, asset drafts). Legacy services emit canonical task labels: `authoring.emergence`, `authoring.context.compact`, `authoring.asset.summarize`, adventure trigger prose → `authoring.trigger`. `Experience.vue` resolves advisor action ids through the dispatcher.
5. **Background observers** — `observers/authoringObservationContract.js` (`normalizeObservation`: authority always `derived`, deduped sourceRefs), `authoringObserverWorkflow.js` (routine facts auto-commit via `applyDerived`; `locked-conflict` / `identity-ambiguity` / `destructive-retcon` become typed exceptions), `authoringObserverScheduler.js` (per-document coalescing by revision, editor-idle delay, supersede/cancel, stale expected-revision guard → zero writes, never blocks persistence).
6. **Legacy gameStore bridge** — `legacyExperienceStateBridge.js` guarantees prose-commit-before-observer-schedule ordering and propagates persistence failures without scheduling. gameStore routes each committed visible prose turn through the bridge (`commitAuthoringProseResult`) after the existing transaction/save ordering; regex-derived goal/choice updates relabeled `ai-extract` → `derived-parse`.
7. **Verification & handoff** — this file plus `docs/STATUS.md`.

## Verification

- Focused runtime matrix (plan Task 7 Step 1): 8 test files / 119 tests passed.
- `npm run smoke:narrative-recovery` → exit 0 (`passed: true`; abort/late-result/typed-error checks all true).
- `npm run smoke:narrative-production -- --dry-run` → exit 0, complete 60-item run, no planner/tool names in prose output.
- `npm run verify:full` → exit 0: Vitest 29 files / 480 tests, Vite build OK, `git diff --check` clean, VitePress build OK.

## Not run (external gates)

MiniMax, OpenAI-compatible and Anthropic-compatible narrative matrices were **not** run: no real credentials or running service were used in this worktree. Same for real-device/browser audits.

## Task IDs ready for Workspace UI

Canonical authoring/observer ids now executable end-to-end and ready for Workspace UI wiring:

- Writing: `authoring.insert`, `authoring.rewrite`, `authoring.expand`, `authoring.shorten`, `authoring.complete.inline`, `authoring.review.selection`, `authoring.review.chapter`
- Narrative scene (via NarrativeKernel adapter): `authoring.continue`, `authoring.advance`, `authoring.simulate.character`, `authoring.simulate.scene`, `authoring.trigger`
- Auxiliary: `authoring.next-actions`, `authoring.dialogue-options`, `authoring.emergence`, `authoring.context.compact`, `authoring.asset.summarize`
- Observers (background derive, no UI write path yet): `observer.entities.derive`, `observer.relations.derive`, `observer.events.derive`, `observer.timeline.derive`, `observer.memory.derive`

## Plan deviations

1. **Task 2**: `agentContracts.test.js` addition implemented as a separate focused `it` (request-boundary alias metric) instead of extending the monolithic contract `it`.
2. **Task 4**: `generationAdventureTriggers.js` storyboard draft keeps its internal label `adventure.trigger.storyboard` — no canonical equivalent exists in the frozen catalog and amending it is out of scope for a worker. Prose trigger was mapped to `authoring.trigger` per plan. Also `src/services/dialogueOptions.js` (`mechanism.dialogue-options`) was left untouched: not in the plan's file list.
3. **Task 4**: two pre-existing pins in `gameStoreSession.test.js` (`emergence.event`, `adventure.trigger.prose`) had to move to the canonical ids in the Task 6 commit because Task 4's focused run did not include that file; caught immediately after and covered by later runs.
4. **Task 6**: observer deltas are recorded in module-scoped in-memory state (`getAuthoringObserverEvents()`) rather than persisted store fields — keeps save/session formats byte-compatible while making scheduling observable and testable.
5. Frozen catalog untouched throughout; all mappings fit existing entries.
