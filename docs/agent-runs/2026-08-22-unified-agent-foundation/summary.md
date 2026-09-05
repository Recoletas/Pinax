# Unified Agent Foundation — Handoff Summary

Date: 2026-08-22
Branch: `feature/unified-agent-foundation`
Commit range consumed by downstream tracks (Settings / Authoring Runtime): `15b0580..4051414`

## Frozen canonical catalog

- File: `shared/agentCapabilityContract.js`
- Canonical task count: **44**
- Catalog blob hash: `247e2a3364d24acd93363cd5a9201bcc92b0e8bc`
- Workflow kinds: `local`, `structured-one-shot`, `validated-chain`, `agent-loop`, `background-derive`, `shadow-observer`
- Owners: settings(12), authoring(17), observer(6), materials(4), canvas(3), storyboard(2)
- Effect policies: `local-cache`, `review-draft`, `review-only`, `direct-text`, `ephemeral`, `derived-state`, `metrics-only`
- Legacy aliases retained via `LEGACY_CAPABILITY_ALIASES` + `resolveLegacyTaskAlias`: **18** (`worldbook.import.structure` → `settings.import.extract`; `experience.*` → `authoring.*` / `observer.*`; `writing.*`/`advisor.*` → `authoring.*`)
- After this commit the catalog is frozen. Only the integration owner may amend it; workers must request a catalog amendment instead of editing it.

## Exported entry points

| Layer | Module | Exports |
|---|---|---|
| Request contract | `shared/agentTaskRequestContract.js` | `AGENT_TASK_REQUEST_VERSION`, `createTaskRequest()`, `validateTaskRequest()` |
| Capability catalog | `shared/agentCapabilityContract.js` | `CANONICAL_AGENT_TASKS`, `WORKFLOW_KINDS`, `LEGACY_CAPABILITY_ALIASES`, `getCanonicalAgentTask()`, `listCanonicalAgentTaskIds()`, `resolveLegacyTaskAlias()` |
| Legacy compat | `shared/agentTaskContract.js` | re-exports catalog; legacy alias table now delegates to canonical aliases |
| Project facade | `src/services/project/projectKnowledgeFacade.js` | `createProjectKnowledgeFacade({ projectId, projectRevision, readers })` — authority order locked > canonical > accepted > derived > imported, explicit block reads |
| Context profiles | `src/services/agents/agentContextProfiles.js` | `AGENT_CONTEXT_PROFILES` (22 profiles covering every catalog row) |
| Context resolver | `src/services/agents/agentContextResolver.js` | `resolveAgentContext({ taskId, request, facade })` — returns envelope + privacy ledger, clips in profile order |
| Router | `src/services/agents/agentTaskRouter.js` | `resolveAgentRoute(taskId)` — deterministic, no model call |
| Execution engine | `src/services/agents/agentExecutionEngine.js` | `createAgentExecutionEngine({ workflows })` — typed failures `AGENT_TASK_UNKNOWN` / `AGENT_WORKFLOW_UNAVAILABLE` / `AGENT_ABORTED` / `AGENT_EXECUTION_FAILED` |
| Result transaction | `src/services/agents/agentResultTransaction.js` | `applyAgentResultTransaction({ taskId, result, target, currentRevision, adapter })` — stale check + effect-policy allowlist before any adapter write |
| Metrics | `src/services/agents/agentExecutionMetrics.js` | `createAgentExecutionMetric(...)` — fixed allowlist, no prompt/manuscript/content-hash fields |

Registry consolidation: `src/services/agents/agentTaskRegistry.js` and `server/services/agentTaskAllowlist.js` are now thin adapters over the shared catalog with exact set parity (`getExecutableTaskTypes()` ≡ `getServerTaskTypes()` ≡ canonical ids). Server advisor templates keep working through an explicit canonical→template-key map (commit `4051414`).

## Known behavior impacts for downstream tracks

- Client/server validation now returns **canonical ids** (`authoring.rewrite` etc.); legacy strings still resolve via aliases.
- `getTask()` no longer exposes `maxContextChars`/`actionTypes`/`targetTypes`; advisor clip falls back to default budget. Context budgets now come from `AGENT_CONTEXT_PROFILES`.
- Server 501 `UNAVAILABLE` only for tasks without instruction templates; unknown tasks → 400 `AGENT_TASK_UNKNOWN`.
- Full client/server id migration at UI call sites belongs to Settings Migration / Authoring Runtime / Workspace tracks.

## Verification

- Focused foundation tests:
  `npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/projectKnowledgeFacade.test.js src/__tests__/agentExecutionEngine.test.js src/__tests__/agentContracts.test.js`
  → 4 files / 13 tests passed.
- Full verification in isolated worktree:
  `npm run verify:full` → exit 0 (Vitest 28 files / 448 tests, Vite build OK, `git diff --check` clean, VitePress build OK).
- Note on counts vs pre-Foundation baseline: baseline run in the main checkout includes untracked WIP test files; no committed test file was removed or deleted by this track.

## Commits

```
03a61a8 feat(agents): define canonical capability catalog
4fa16b0 feat(agents): validate shared task requests
dfac818 feat(agents): add project knowledge facade
84f8286 feat(agents): resolve sparse project context
1cc286c feat(agents): route capability workflows deterministically
bdbcfda feat(agents): enforce result effect transactions
adbec9a feat(agents): record privacy-safe execution metrics
e9cfb50 refactor(agents): share capability registry across runtimes
4051414 fix(agents): resolve canonical task keys in server advisor templates
```

Plan deviations recorded during execution:

1. Task 1 scope split: full collapse of the second executable list in `shared/agentTaskContract.js` landed in Task 8's commit because existing tests pinned legacy ids until registry conversion.
2. Commit `4051414` (outside original file list): server advisor/openclaw services needed a canonical→template-key map after `validateServerTaskType` began returning canonical ids.
3. Minor: added `buildAgentContextEnvelope` helper to `shared/agentContextContract.js`; context resolver assigns block priorities from profile order so clipping preserves profile sequence.
