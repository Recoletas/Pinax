# Nova-Inspired Runtime Foundation Implementation Plan

**Date**: 2026-06-18
**Status**: Draft v1 — pending user review
**Stage**: 计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Nova-inspired context auditing, runtime event envelopes, and auditable local memory recall to Pinax without changing route ownership or doing a backend/UI rewrite.

**Architecture:** Three scoped commits. Commit 1 adds a pure context ledger and wires it into generation diagnostics without changing prompt content. Commit 2 adds capped runtime event envelopes beside existing session state. Commit 3 ranks local confirmed memory recall and reports recall metadata before Mem0 fallback.

**Tech Stack:** Vue 3 + Pinia + Vite + Vitest; existing localStorage/session model; no new dependencies.

---

## File Structure

**Create:**
- `src/services/contextLedger.js` — bounded context ledger helpers.
- `src/services/runtimeEvents.js` — runtime event envelope, validation, caps.
- `src/__tests__/contextLedger.test.js` — privacy/cap tests.
- `src/__tests__/runtimeEvents.test.js` — envelope and state-op validation tests.

**Modify:**
- `src/services/worldbookContextBuilder.js` — return `contextLedger` alongside existing fields.
- `src/services/memoryCandidates.js` — add ranked recall helpers while preserving `buildScopedMemoryContext()`.
- `src/stores/gameStore.js` — store `lastContextLedger`, `runtimeEvents`, and use ranked local recall.
- `src/__tests__/worldbookContextBuilder.test.js` — assert worldbook ledger behavior.
- `src/__tests__/memoryCandidates.test.js` — assert recall ranking/metadata.
- `src/__tests__/gameStoreSession.test.js` — assert generation ledger and session event persistence.
- `docs/STATUS.md` / `docs/LOG.md` — final handoff only after implementation.

**Do not touch:**
- `src/pages/OpeningPage.vue`
- `src/pages/Experience.vue`
- route definitions
- `src/components/MemoryIndicator.vue` in this plan
- Nova clone under `/tmp/nova-research`

## Commit 1: Context Ledger, No Prompt Behavior Change

### Task 1.1: Red tests for context ledger privacy and caps

**Files:**
- Create: `src/__tests__/contextLedger.test.js`

- [ ] **Step 1: Add tests for preview cap, full-content exclusion, and part cap.**

Use these assertions:

```js
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_LEDGER_PART_LIMIT,
  CONTEXT_PREVIEW_LIMIT,
  appendContextLedgerPart,
  createContextLedger,
  truncateContextPreview
} from '../services/contextLedger'

describe('contextLedger', () => {
  it('caps previews and never stores the full source text as preview', () => {
    const secret = `SECRET-${'x'.repeat(CONTEXT_PREVIEW_LIMIT + 80)}`
    const preview = truncateContextPreview(secret)

    expect(preview.length).toBeLessThanOrEqual(CONTEXT_PREVIEW_LIMIT + 3)
    expect(preview).not.toBe(secret)
    expect(preview).toContain('SECRET')
  })

  it('normalizes included/skipped parts with metadata only', () => {
    const ledger = createContextLedger({ runId: 'run-1', sessionId: 'sess-1', worldbookId: 'wb-1', createdAt: 100 })
    const next = appendContextLedgerPart(ledger, {
      source: 'worldbook',
      title: '常驻规则',
      purpose: 'worldbook-entry',
      content: '必须遵守世界书设定。',
      included: true,
      entryId: 'entry-1',
      limit: 2000
    })

    expect(next.parts).toHaveLength(1)
    expect(next.parts[0]).toMatchObject({
      source: 'worldbook',
      title: '常驻规则',
      purpose: 'worldbook-entry',
      included: true,
      truncated: false,
      entryId: 'entry-1',
      limit: 2000
    })
    expect(next.parts[0].preview).toContain('必须遵守')
    expect(next.parts[0]).not.toHaveProperty('content')
  })

  it('caps parts and adds one skipped summary part', () => {
    let ledger = createContextLedger()
    for (let index = 0; index < CONTEXT_LEDGER_PART_LIMIT + 3; index += 1) {
      ledger = appendContextLedgerPart(ledger, {
        source: 'chat',
        title: `part-${index}`,
        purpose: 'recent-chat',
        content: `content-${index}`
      })
    }

    expect(ledger.parts).toHaveLength(CONTEXT_LEDGER_PART_LIMIT)
    expect(ledger.parts.at(-1).included).toBe(false)
    expect(ledger.parts.at(-1).purpose).toBe('ledger-overflow')
  })
})
```

- [ ] **Step 2: Run red.**

Run: `npm run test:run -- src/__tests__/contextLedger.test.js`

Expected: fails because `src/services/contextLedger.js` does not exist.

### Task 1.2: Implement context ledger service

**Files:**
- Create: `src/services/contextLedger.js`

- [ ] **Step 1: Implement `contextLedger.js` with no external dependency except `estimateTokens`.**

Implementation requirements:
- Export `CONTEXT_PREVIEW_LIMIT = 120`.
- Export `CONTEXT_LEDGER_PART_LIMIT = 40`.
- Use `estimateTokens` from `../composables/useTokenEstimate`.
- Normalize unknown `source` to `'generation'`.
- Treat `content` as input-only; never copy it onto part objects.
- Add overflow summary when parts exceed the cap.

- [ ] **Step 2: Run green.**

Run: `npm run test:run -- src/__tests__/contextLedger.test.js`

Expected: all context ledger tests pass.

### Task 1.3: Add worldbook ledger tests

**Files:**
- Modify: `src/__tests__/worldbookContextBuilder.test.js`

- [ ] **Step 1: Add a test under existing `describe('worldbookContextBuilder', ...)` that asserts ledger parts for included and truncated entries.**

Test shape:
- Worldbook has one constant rule, one keyword character, and one keyword location that is too long for a tiny budget.
- Assert `result.contextLedger.parts` includes `worldbook-entry` for included entries.
- Assert a skipped/truncated part exists for the budget-truncated entry.
- Assert no part has raw `content`.

- [ ] **Step 2: Add a no-worldbook/no-match ledger test.**

Assertions:
- `buildWorldbookContext({ worldbook: null })` returns `contextLedger.parts[0].included === false`.
- Purpose is `worldbook-empty`.

- [ ] **Step 3: Run red.**

Run: `npm run test:run -- src/__tests__/worldbookContextBuilder.test.js`

Expected: fails because `contextLedger` is not returned yet.

### Task 1.4: Wire ledger into worldbookContextBuilder

**Files:**
- Modify: `src/services/worldbookContextBuilder.js`

- [ ] **Step 1: Import ledger helpers.**

Use:

```js
import { appendContextLedgerPart, createContextLedger } from './contextLedger'
```

- [ ] **Step 2: Create a ledger at the start of `buildWorldbookContext()`.**

Use worldbook id/name when available. Return it in every early return path.

- [ ] **Step 3: Add ledger parts when pushing worldbook sections and entries.**

Rules:
- Include world description/style/forbidden/examples as one `worldbook-summary` part.
- Include structured settings as `structured-settings`; mark skipped when budget-truncated.
- Include matched entries as `worldbook-entry`; mark skipped/truncated when budget excludes them.

- [ ] **Step 4: Run green.**

Run: `npm run test:run -- src/__tests__/worldbookContextBuilder.test.js src/__tests__/contextLedger.test.js`

Expected: both files pass.

### Task 1.5: Store combined ledger in gameStore

**Files:**
- Modify: `src/stores/gameStore.js`
- Modify: `src/__tests__/gameStoreSession.test.js`

- [ ] **Step 1: Add a red test to `gameStoreSession.test.js` near the generation-context tests.**

Scenario:
- Set active worldbook and one active local memory.
- Mock `runGenerationStreamTask`.
- Run `await gameStore.generateAIResponse()`.
- Assert `gameStore.lastContextLedger.parts` contains sources `worldbook`, `runtime`, `memory`, and `chat`.
- Assert the stream task `baseMessages` still has the same relative ordering: `contextMsg`, `memoryMsg`, `worldBookMsg`, then chat history as currently produced by the code.

- [ ] **Step 2: Run red.**

Run: `npm run test:run -- src/__tests__/gameStoreSession.test.js -t "lastContextLedger"`

Expected: fails because `lastContextLedger` is absent.

- [ ] **Step 3: Add `lastContextLedger: null` to Pinia state and assemble it in `generateAIResponse()`.**

Use `worldbookContext.contextLedger` plus `summarizePromptMessage()` parts for:
- `contextMsg`
- `memoryMsg`
- last 6 `chatHistory` messages

Do not alter `messagesToSend` assembly.

- [ ] **Step 4: Run commit 1 verification.**

Run:

```bash
npm run test:run -- src/__tests__/contextLedger.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/gameStoreSession.test.js
npm run build
git diff --check
```

Expected: tests pass, build passes, diff check clean.

- [ ] **Step 5: Commit.**

```bash
git add src/services/contextLedger.js src/services/worldbookContextBuilder.js src/stores/gameStore.js src/__tests__/contextLedger.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(runtime): add bounded context ledger"
```

## Commit 2: Runtime Event Envelope, Compatibility Persistence

### Task 2.1: Red tests for runtime event service

**Files:**
- Create: `src/__tests__/runtimeEvents.test.js`

- [ ] **Step 1: Add tests for envelope defaults, path validation, non-contextual display events, and cap behavior.**

Assertions:
- `createRuntimeEvent({ type: 'turn', payload: { role: 'user' } })` returns `v: 1`, `branchId: 'main'`, generated id, numeric `ts`.
- `validateStateDelta([{ op: 'set', path: 'goals', value: [] }])` is valid.
- `validateStateDelta([{ op: 'set', path: '__proto__.polluted', value: true }])` is invalid.
- `createRuntimeEvent({ type: 'display_event' })` sets `payload.contextual === false`.
- `capRuntimeEvents(Array(205))` returns length 200 and keeps latest items.

- [ ] **Step 2: Run red.**

Run: `npm run test:run -- src/__tests__/runtimeEvents.test.js`

Expected: fails because service does not exist.

### Task 2.2: Implement runtimeEvents service

**Files:**
- Create: `src/services/runtimeEvents.js`

- [ ] **Step 1: Implement exports.**

Required exports:

```js
export const RUNTIME_EVENT_SCHEMA_VERSION = 1
export const RUNTIME_EVENT_LIMIT = 200
export const RUNTIME_EVENT_TYPES = ['turn', 'state_delta', 'display_event', 'hot_choices', 'branch']
export const STATE_OPS = ['set', 'merge', 'push', 'pull', 'inc', 'unset']
export const STATE_PATH_ROOTS = [...]
export function createRuntimeEvent(input = {})
export function normalizeRuntimeEvent(raw = {})
export function validateStateDelta(ops = [])
export function capRuntimeEvents(events = [], limit = RUNTIME_EVENT_LIMIT)
```

- [ ] **Step 2: Run green.**

Run: `npm run test:run -- src/__tests__/runtimeEvents.test.js`

Expected: all runtime event tests pass.

### Task 2.3: Persist runtime events in gameStore sessions

**Files:**
- Modify: `src/stores/gameStore.js`
- Modify: `src/__tests__/gameStoreSession.test.js`

- [ ] **Step 1: Add red session test.**

Scenario:
- Create a session.
- Call `gameStore.appendRuntimeEvent({ type: 'turn', source: 'user', payload: { preview: '先去钟楼' } })`.
- Save, reset, load session.
- Assert `gameStore.runtimeEvents` length is 1 and event survives.
- Add 205 events, save, assert stored `runtimeState.runtimeEvents.length` is 200.

- [ ] **Step 2: Run red.**

Run: `npm run test:run -- src/__tests__/gameStoreSession.test.js -t "runtimeEvents"`

Expected: fails because store has no runtime event state/action.

- [ ] **Step 3: Add store state and persistence.**

Implementation points:
- Import `capRuntimeEvents`, `createRuntimeEvent`, `normalizeRuntimeEvent`.
- Add `runtimeEvents: []` to state.
- Add `runtimeEvents` to `getRuntimeSnapshot()`.
- Restore `runtimeEvents` in `loadSession()`.
- Clear it in `resetRuntimeState()`.
- Add action `appendRuntimeEvent(input)`.

- [ ] **Step 4: Append user/assistant turn events without changing UI.**

In `sendAction()`:
- Append a user turn event after `chatHistory.push`.
- For hidden actions, set payload `hidden: true`.

In `generateAIResponse()` after `fullContent` is complete:
- Append assistant turn event with bounded preview and `messageIndex`.

- [ ] **Step 5: Run commit 2 verification.**

Run:

```bash
npm run test:run -- src/__tests__/runtimeEvents.test.js src/__tests__/gameStoreSession.test.js
npm run build
git diff --check
```

Expected: tests pass, build passes, diff check clean.

- [ ] **Step 6: Commit.**

```bash
git add src/services/runtimeEvents.js src/stores/gameStore.js src/__tests__/runtimeEvents.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(runtime): persist capped runtime event envelopes"
```

## Commit 3: Ranked Local Memory Recall

### Task 3.1: Red tests for ranked memory recall

**Files:**
- Modify: `src/__tests__/memoryCandidates.test.js`

- [ ] **Step 1: Add tests for ranking, exclusion, and bounded metadata.**

Scenario:
- Store active project/session/global memories, plus pending/stale/rejected memories.
- Query contains words from one session memory.
- Assert matching active memory appears before unrelated active memory.
- Assert pending/stale/rejected excluded.
- Assert returned metadata has `preview` capped and no raw unbounded `content` field.

- [ ] **Step 2: Run red.**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js -t "recall"`

Expected: fails because recall helpers do not exist.

### Task 3.2: Implement ranked recall helpers

**Files:**
- Modify: `src/services/memoryCandidates.js`

- [ ] **Step 1: Add exports.**

Add:

```js
export function rankScopedActiveMemoryCandidates({ authorId = '', projectId = '', sessionId = '', query = '', limitPerScope = 4 } = {})
export function buildScopedMemoryRecallContext({ authorId = '', projectId = '', sessionId = '', query = '', limitPerScope = 4, maxItemChars = 180 } = {})
```

- [ ] **Step 2: Keep `buildScopedMemoryContext()` compatible.**

It should return the same string format existing tests expect. It may call `buildScopedMemoryRecallContext()` internally with empty query and return `.content`.

- [ ] **Step 3: Run green.**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js`

Expected: all memory candidate tests pass.

### Task 3.3: Use ranked local recall in generation and ledger

**Files:**
- Modify: `src/stores/gameStore.js`
- Modify: `src/__tests__/gameStoreSession.test.js`

- [ ] **Step 1: Update generation import and local memory path.**

Replace `buildScopedMemoryContext` import with `buildScopedMemoryRecallContext`, or import both if preserving compatibility is clearer.

In `generateAIResponse()`:
- Build `memoryQuery` as it already does.
- Call `buildScopedMemoryRecallContext({ projectId, sessionId, query: memoryQuery, limitPerScope: 4, maxItemChars: 180 })`.
- Use returned `.content` as local memory context.
- Store returned metadata in `lastContextLedger` memory parts.
- Preserve Mem0 fallback only when local recall has no content.

- [ ] **Step 2: Add/adjust gameStore test.**

Assert:
- Query-matched local memory is in the sent memory message.
- Unrelated project/session memory may still appear if within per-scope cap, but pending memory does not.
- `lastContextLedger.parts` includes memory source parts with bounded previews.

- [ ] **Step 3: Run commit 3 verification.**

Run:

```bash
npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/gameStoreSession.test.js src/__tests__/contextLedger.test.js
npm run test:run
npm run build
git diff --check
```

Expected: focused tests pass, full suite passes, build passes, diff check clean.

- [ ] **Step 4: Commit.**

```bash
git add src/services/memoryCandidates.js src/stores/gameStore.js src/__tests__/memoryCandidates.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(memory): rank local recall with audit metadata"
```

## Final Verification And Handoff

- [ ] **Step 1: Run post verification.**

Run:

```bash
npm run test:run
npm run build
git diff --check
```

Expected: all tests pass, build clean, diff check clean.

- [ ] **Step 2: Update docs status.**

Use `docs-status-handoff` requirements:
- Add a concise Recently done entry to `docs/STATUS.md`.
- Add a permanent entry to `docs/LOG.md` if current project convention expects runtime architecture changes there.

- [ ] **Step 3: Commit docs if changed.**

```bash
git add docs/STATUS.md docs/LOG.md
git commit -m "docs(status): record nova runtime foundation"
```

If `docs/LOG.md` does not exist or is not currently maintained in this branch, only update `docs/STATUS.md` and mention that in the final handoff.

## Plan Self-Review

- Spec coverage: Commit 1 covers context ledger and worldbook/gameStore ledger. Commit 2 covers runtime event envelope and session persistence. Commit 3 covers memory recall ranking and audit metadata.
- Scope guard: UI panels, route ownership, branch timeline, Go backend, IndexedDB, and worldbook patch proposals are excluded.
- Placeholder scan: no unresolved implementation markers remain.
- Type consistency: `contextLedger`, `runtimeEvents`, and `buildScopedMemoryRecallContext()` names are consistent across tasks.

Plan complete and saved to `docs/superpowers/plans/2026-06-18-nova-runtime-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per commit/task cluster, review between commits.
2. **Inline Execution** - execute tasks in this session using `executing-plans`, with checkpoints after each commit.
