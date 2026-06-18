# Nova-Inspired Runtime Foundation Design Spec

**Date**: 2026-06-18
**Status**: Draft v1 — pending user review
**Stage**: 方案
**Research source**: `https://github.com/alfredxw/nova` cloned read-only at `/tmp/nova-research`
**Scope (in)**: `src/services/{contextLedger,runtimeEvents,memoryCandidates}.js`, `src/services/worldbookContextBuilder.js`, `src/stores/gameStore.js`, focused tests under `src/__tests__/`
**Scope (out)**: `/opening` visual layout, `/experience` opening-route split, React/Tailwind UI patterns from Nova, Go backend rewrite, filesystem workspace migration, full branch timeline UI.

## 重点

1. **成功标准 1**: Every AI generation can expose a bounded context ledger showing which worldbook, runtime, memory, and chat sections were included or skipped without storing full prompt text.
2. **成功标准 2**: Sessions can persist a small append-only runtime event envelope beside existing `messages` / `runtimeState` without changing current prompt behavior.
3. **成功标准 3**: Local confirmed-memory recall becomes auditable and rankable before any Mem0 fallback, while existing `MemoryIndicator` candidate workflow remains unchanged.

## Context

The user found Nova, an AI-native fiction workspace with a very similar product direction: novel workspace, lore/worldbook, interactive story testing, skills, agents, memory, and versioning. Four parallel read-only research tracks compared Nova with Pinax:

- Nova interactive runtime uses JSONL event envelopes with `turn`, `state_delta`, `branch`, and `hot_choices`; state is projected from events rather than trusted as a mutable blob.
- Nova context/lore code records model-visible context as bounded metadata through a context ledger, separates explicit refs from automatic refs, and keeps lore/memory scope boundaries clear.
- Nova memory tools use a two-step model: list a light index, then read selected memories with scope and byte limits.
- Nova UI/workflow suggests useful future directions: a folio workspace mental model, assistant reference chips, unified assistant tabs, trace grouping, and a branch route map. These are product/UI follow-ups, not this runtime-foundation implementation.
- Pinax currently builds prompt context inside `gameStore.generateAIResponse()`, with worldbook context, runtime context, local memory, optional Mem0 memory, and raw `chatHistory` assembled directly.

Pinax should borrow Nova's runtime semantics, not its implementation stack. Pinax is Vue 3 + Vite + Express + localStorage today; a Go backend, JSONL filesystem store, or React UI shell would be a disruptive rewrite.

## Goals

1. Add a `contextLedger` read model that reports ordered prompt sections with source, title, purpose, char/token estimate, included/skipped state, truncation state, and a short preview.
2. Extend `buildWorldbookContext()` so its result contains ledger parts for worldbook metadata, structured settings, included entries, and truncated entries.
3. Store `gameStore.lastContextLedger` after generation context assembly, including worldbook, runtime context, memory context, and recent chat summaries.
4. Add a pure `runtimeEvents` service with a stable event envelope and state-op validator for future event-sourced sessions.
5. Persist capped runtime events in `runtimeState.runtimeEvents` / sessions without changing existing `messages`, `chatHistory`, `plotJournal`, or UI behavior.
6. Add local confirmed-memory recall ranking and metadata so generation can explain which memory items were included.
7. Add unit tests for ledger privacy, worldbook ledger behavior, session save/load of event envelopes, invalid state-op rejection, and memory recall ranking.

## Non-Goals

- Do not replace Pinax's localStorage persistence with Nova's Go JSONL filesystem store.
- Do not replace the current generation prompt assembly order in this first pass.
- Do not build Nova-style workbench tabs, branch timeline UI, or Agent trace panels.
- Do not reintroduce opening-page logic into `/experience`; `/opening` remains the only route for playable-world opening actions.
- Do not let auto memory candidates mutate worldbook entries; worldbook promotion remains a future reviewed patch flow.
- Do not store full prompt text or full memory/worldbook content inside ledgers or events.
- Do not introduce new dependencies, vector search, CRDT, IndexedDB, or remote sync.

## Approach

Use a compatibility-first 3-commit migration.

Commit 1 adds a pure context ledger and wires it into `worldbookContextBuilder` / `gameStore` without changing `messagesToSend`. This gives immediate observability and avoids behavior drift.

Commit 2 adds a small append-only runtime event envelope with validation, then persists capped events inside existing session runtime snapshots. Existing mutable fields remain the source of UI truth.

Commit 3 improves local memory recall by ranking confirmed scoped memories against the same query already built in `gameStore.generateAIResponse()`. It returns both context text and recall metadata, so `lastContextLedger` can report memory provenance.

This sequence follows Nova's strongest lessons while staying inside Pinax's current architecture. It intentionally delays UI surfaces until the read models are stable.

## Architecture

### A. Context ledger

Create `src/services/contextLedger.js`.

Public API:

```js
export const CONTEXT_PREVIEW_LIMIT = 120
export const CONTEXT_LEDGER_PART_LIMIT = 40

export function createContextLedger({ runId = '', sessionId = '', worldbookId = '', createdAt = Date.now() } = {})
export function createContextLedgerPart(input = {})
export function appendContextLedgerPart(ledger, input = {})
export function mergeContextLedgers(...ledgers)
export function summarizePromptMessage({ message, source, title, purpose, limit } = {})
export function truncateContextPreview(value, limit = CONTEXT_PREVIEW_LIMIT)
```

Part shape:

```js
{
  source: 'worldbook' | 'runtime' | 'memory' | 'chat' | 'generation',
  title: '常驻规则',
  purpose: 'worldbook-entry',
  chars: 128,
  tokens: 43,
  preview: 'short bounded preview...',
  included: true,
  truncated: false,
  limit: 2000,
  entryId: 'entry-id',
  warning: ''
}
```

Hard constraints:

- `preview` is capped at 120 chars by default.
- Ledger never stores full prompt content.
- Parts are capped at 40; extra parts become one skipped summary part.
- Ledger uses existing `estimateTokens()` for token estimates.

### B. Worldbook ledger integration

Modify `src/services/worldbookContextBuilder.js`.

`buildWorldbookContext()` returns one new field:

```js
{
  messages,
  matchedEntries,
  budgetReport,
  warnings,
  contextLedger
}
```

Worldbook ledger parts:

- `worldbook-summary`: world description, writing style, forbidden, examples.
- `structured-settings`: included or skipped with `structured-settings-truncated`.
- `worldbook-entry`: one part per included matched entry.
- `worldbook-entry-truncated`: one part per skipped entry when token budget is exceeded.
- `worldbook-empty`: skipped part for `no-worldbook` or `no-matched-entries`.

No output prompt text changes in this spec.

### C. GameStore ledger assembly

Modify `src/stores/gameStore.js`.

Add state:

```js
lastContextLedger: null
```

After `worldBookMsg`, `contextMsg`, and `memoryContext` are built, assemble a combined ledger:

- worldbook ledger from `buildWorldbookContext()`
- runtime context part from `contextMsg`
- memory context part from local or Mem0 memory text
- recent chat part summarizing the last 6 chat messages by count and bounded preview

Store it on `this.lastContextLedger`. Do not write ledger history to localStorage in v1; only the latest in-memory ledger is needed for debugging and tests.

### D. Runtime event envelope

Create `src/services/runtimeEvents.js`.

Event envelope:

```js
{
  v: 1,
  type: 'turn' | 'state_delta' | 'display_event' | 'hot_choices' | 'branch',
  id: 'evt_...',
  parentId: '',
  branchId: 'main',
  ts: 1710000000000,
  source: 'user' | 'assistant' | 'system' | 'runtime',
  payload: {}
}
```

Supported v1 state ops:

```js
{ op: 'set' | 'merge' | 'push' | 'pull' | 'inc' | 'unset', path: 'goals', value: ... }
```

Allowed path roots:

- `goals`
- `encounteredCharacters`
- `factionRelations`
- `keyChoices`
- `plotJournal`
- `activities`
- `worldMapState`
- `mechanismContext`
- `milestoneEvent`
- `flags`
- `inventory`
- `quests`

Rejected paths never mutate state and return validation errors. Display events are marked `contextual: false` by default.

GameStore changes:

- Add `runtimeEvents: []` state.
- Include `runtimeEvents` in `getRuntimeSnapshot()`.
- Restore `runtimeEvents` in `loadSession()`.
- Add `appendRuntimeEvent(eventInput)` with a cap of 200 events per session.
- Append a user `turn` event in `sendAction()` and an assistant `turn` event after generation completes.

No branch-switch UI, no projection-driven rendering, and no rewrite/regenerate behavior change in v1.

### E. Memory recall ranking

Modify `src/services/memoryCandidates.js`.

Add:

```js
export function rankScopedActiveMemoryCandidates({ authorId = '', projectId = '', sessionId = '', query = '', limitPerScope = 4 } = {})
export function buildScopedMemoryRecallContext({ authorId = '', projectId = '', sessionId = '', query = '', limitPerScope = 4, maxItemChars = 180 } = {})
```

Ranking rules:

- Only `status === 'active'` candidates are eligible.
- Scope filtering remains the same as `listScopedActiveMemoryCandidates()`.
- Memories matching query terms rank before non-matches.
- Recent and higher-confidence memories break ties.
- Returned metadata includes `id`, `scope`, `kind`, `score`, `included`, `preview`, and `contentChars`.

`buildScopedMemoryContext()` remains as a compatibility wrapper, either calling the recall version without query or preserving identical output shape.

Modify `gameStore.generateAIResponse()` to call `buildScopedMemoryRecallContext()` with the existing `memoryQuery`. Mem0 fallback remains unchanged and only runs when local recall returns no context.

### F. Tests

Add focused tests:

- `src/__tests__/contextLedger.test.js`
  - previews are capped
  - full content is not copied into preview
  - part cap creates a skipped summary
- `src/__tests__/worldbookContextBuilder.test.js`
  - worldbook ledger includes included/truncated entries
  - no-worldbook/no-match returns skipped ledger part
- `src/__tests__/runtimeEvents.test.js`
  - event envelope defaults to v1/main branch
  - invalid state-op paths are rejected
  - display events are non-contextual by default
- `src/__tests__/memoryCandidates.test.js`
  - query-matched active memories rank before unrelated active memories
  - pending/stale/rejected memories are excluded
  - recall metadata exposes bounded preview, not unbounded content
- `src/__tests__/gameStoreSession.test.js`
  - `generateAIResponse()` stores `lastContextLedger`
  - sessions save/load capped `runtimeEvents`
  - generation still sends the same ordered prompt sections as before

## Soft Locks

| Lock | Requirement |
|---|---|
| UI lock | Do not touch `OpeningPage.vue`, `Experience.vue`, or route ownership in this plan. |
| Prompt lock | Commit 1 and 2 must not alter `messagesToSend` ordering or content. |
| Privacy lock | Ledger and runtime events store bounded previews only, never full prompt dumps. |
| Storage lock | Runtime events capped at 200 per session; no persistent ledger history in v1. |
| Memory lock | Only active confirmed memories can enter recall context. |
| Worldbook lock | Auto memory does not mutate worldbook entries. |
| Dependency lock | No new npm packages. |

## Risks

| Risk | Mitigation | 残留风险 |
|---|---|---|
| Ledger accidentally leaks full prompt content | Cap previews and test against long secret-like strings | A developer could later add raw payloads unless tests lock shape |
| Event envelope increases localStorage size | Cap runtime events at 200 and store small payload previews | Long-running sessions still need future compaction/IndexedDB |
| GameStore regression due to central file edits | Keep commits narrow and verify `gameStoreSession.test.js` plus full suite | `gameStore.js` remains a high-risk large file |
| Memory ranking changes generation behavior | Make ranking conservative and confirmed-only; retain Mem0 fallback only when local empty | Model output may shift when memory order changes in commit 3 |
| Scope creep into Nova-style IDE/UI | Hard Non-Goals and UI lock | Future work still needs separate spec |

## Self-Application

- **设想（上游）**: Nova read-only research from `/tmp/nova-research` plus user request to borrow practical ideas from `https://github.com/alfredxw/nova`.
- **本 spec（方案）**: `docs/superpowers/specs/2026-06-18-nova-runtime-foundation-design.md`.
- **计划（下游）**: `docs/superpowers/plans/2026-06-18-nova-runtime-foundation.md`.

## Out of scope / future

- Branch timeline UI and same-parent alternate turn versions.
- Projection-driven `runtimeState` as source of truth.
- Explicit pinned worldbook entry references.
- Folio workspace model across routes.
- Assistant reference chips for selected dialogue, worldbook entries, material assets, and style samples.
- Unified advisor panel tabs for chat, sessions, review, and traces.
- Branch timeline as a Pinax archive route map rather than a Nova graph clone.
- Worldbook patch proposals promoted from memory candidates.
- Context/audit panel in `MemoryIndicator` or a future Agent trace panel.
- IndexedDB/session compaction for very long stories.
