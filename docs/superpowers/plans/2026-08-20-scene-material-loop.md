# Scene Material Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks must also use the repository `ui-style-check` skill; completion must use `testing-verification` and `docs-status-handoff`.

**Goal:** Build a reliable loop from finding source-linked materials, selecting several materials, sending them to the existing card canvas, and organizing them in a bounded relationship-and-beat scene board.

**Architecture:** Keep `narrativeAsset.sourceRefs[]` as the only provenance truth and derive exact reverse lookups by scanning local assets. Keep canvas cards, edges, and `PROSE_OUTLINE_V1` as the existing persistence truths; the new scene board is a projection and editing surface over them, not a second canvas or storage schema. Distinguish active exact matches from archived exact matches, and do not fill an unmatched lookup with arbitrary recent materials or claim generic stale detection until a source-version baseline exists.

**Tech Stack:** Vue 3 Composition API, Vue Router, localStorage services, Vitest/jsdom, Vite UI audit.

---

## 0. Decisions carried into implementation

This plan is the retained decision record for the earlier material-retrieval,
provenance and canvas bakeoffs. Their intermediate briefs were removed during
repository cleanup; Git history remains available if raw evidence is needed.

The accepted decisions are:

1. Implement exact `sourceRefs` reverse lookup first. The research report's hand-written “20/20” table is not treated as executed evidence.
2. Keep exact matches and suggestions separate. A broken or unmatched ref must never turn arbitrary recent materials into apparently related results.
3. Enforce strict project isolation whenever the caller supplies `projectId`.
4. Use full scans through 500 assets. Do not add a persistent inverted index or a runtime cache before an executed benchmark crosses the threshold.
5. Adopt C3 as a bounded scene board inside the existing `/prose-essay` page: relationship group, linear beat slots, and an unplaced-material tray.
6. Reuse `PROSE_CARDS_V1`, `PROSE_EDGES_V1`, and `PROSE_OUTLINE_V1`; do not add `MATERIAL_BEATS_V1` or another ordering truth.
7. On 390px, support viewing, selecting, fixing, and linear reordering. Do not expose free-position dragging.
8. In this slice, provenance state is only `linked | archived | detached | untracked`. Generic `stale` is deferred because existing refs do not consistently capture a comparison baseline.
9. Do not modify `ASSET_KINDS`, `narrativeKernel.cast`, writing schema, or add embeddings, a query DSL, a fixture workspace, or a second free canvas.
10. Do not remove `useCanvasBoard.js` in the same release. Revisit it after the scene board has passed user verification and Notes no longer needs its drag contract.

## 1. File map

### Create

- `src/services/media/narrativeAssetRetrieval.js` — deterministic exact-ref lookup, project isolation, and active/archived result grouping, with injectable assets for pure tests.
- `src/services/sceneMaterialBoard.js` — pure projection and mutations for candidate cards, relationships, source state, and outline ordering.
- `src/components/canvas/SceneMaterialBoard.vue` — bounded desktop/mobile scene-board UI over existing canvas state.
- `src/__tests__/narrativeAssetRetrieval.test.js` — executable 20/100/500 fixtures and lookup contract tests.
- `src/__tests__/sceneMaterialBoard.test.js` — projection, source-state, relationship, and ordering tests.
- `scripts/benchmark-material-retrieval.mjs` — repeatable local benchmark; informational timing, not a flaky CI assertion.

### Modify

- `src/services/canvas/relationCanvas.js` — idempotent ordered batch import into existing canvas cards.
- `src/pages/Notes.vue` — “送入画布” action for the current checked selection and clear post-action feedback.
- `src/pages/ProseEssay.vue` — make the bounded scene board the default organization surface, while preserving the existing free canvas and director/video workflow.
- `src/__tests__/narrativeAssets.test.js` — batch import persistence and deduplication coverage.
- `src/__tests__/uiControlContract.test.js` — source-level integration and keyboard/mobile contract checks.
- `scripts/ui-audit.mjs` — add deterministic `scene-board` audit state using existing mocked localStorage patterns.
- `package.json` — add the retrieval benchmark command.
- `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, `docs/src/known-issues.md`, and `docs/plan/pinax-integrated-product-roadmap.md` — record shipped behavior, external gates, and deferred generic stale detection.

---

### Task 1: Add strict, exact narrative-asset reverse lookup

**Files:**

- Create: `src/services/media/narrativeAssetRetrieval.js`
- Create: `src/__tests__/narrativeAssetRetrieval.test.js`
- Reuse: `src/services/media/narrativeAssets.js`

- [ ] **Step 1: Write failing tests for exact matches and result grouping**

Create fixtures through `createNarrativeAsset()` so old-source fallback and normalization use production behavior. Cover this contract:

```js
const result = findAssetsByContentRefs([
  { refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }
], {
  projectId: 'book-1',
  assets: [activeExact, archivedExact, unrelated]
})

expect(result).toEqual({
  state: 'matched',
  exactMatches: [expect.objectContaining({
    asset: expect.objectContaining({ id: activeExact.id }),
    reasons: ['exact-ref'],
    matchedRefs: [expect.objectContaining({ refType: 'chapter', refId: 'chapter-1' })]
  })],
  archivedMatches: [expect.objectContaining({
    asset: expect.objectContaining({ id: archivedExact.id }),
    reasons: ['archived-exact-ref']
  })]
})
```

Also assert:

```js
expect(findAssetsByContentRefs([missingRef], {
  projectId: 'book-1',
  assets: [recentButUnrelated]
})).toEqual({
  state: 'no-exact-match',
  exactMatches: [],
  archivedMatches: []
})
```

- [ ] **Step 2: Write failing isolation and compatibility tests**

Cover all of these cases explicitly:

```js
it.each([
  ['different project', 'book-2'],
  ['legacy null project', null]
])('does not leak %s assets into a scoped lookup', (_label, assetProjectId) => {
  // An identical refType/refId is insufficient when asset.projectId !== requested projectId.
})
```

- A rejected exact asset is omitted.
- An archived exact asset appears only in `archivedMatches`.
- An asset with old `source.type='chapter'` and no `sourceRefs` is normalized through `normalizeSourceRefs()` and can match.
- Multiple input refs deduplicate the same asset while preserving all matched refs.
- Non-empty `ContentRef.version` survives normalization, but lookup identity remains `refType + refId + projectId`; version is evidence, not a required equality gate in this slice.
- Stable ordering is active status (`accepted` before `inbox`), then `updatedAt`, then asset id.

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```bash
npm run test:run -- src/__tests__/narrativeAssetRetrieval.test.js
```

Expected: FAIL because `narrativeAssetRetrieval.js` and `findAssetsByContentRefs` do not exist.

- [ ] **Step 4: Implement the minimal lookup service**

Use this public shape:

```js
import {
  ACTIVE_ASSET_STATUSES,
  listNarrativeAssets,
  normalizeContentRef,
  normalizeSourceRefs
} from './narrativeAssets'

export function findAssetsByContentRefs(refs, options = {}) {
  const projectId = options.projectId
  const assets = Array.isArray(options.assets)
    ? options.assets
    : listNarrativeAssets({ status: null })
  const requested = normalizeRequestedRefs(refs, projectId)
  const active = []
  const archived = []

  for (const asset of assets) {
    if (!asset || !projectMatches(asset, projectId)) continue
    if (asset.status === 'rejected') continue

    const sourceRefs = normalizeSourceRefs(asset.sourceRefs, {
      source: asset.source,
      projectId: asset.projectId
    })
    const matchedRefs = requested.filter((requestedRef) => (
      sourceRefs.some((sourceRef) => refsMatch(sourceRef, requestedRef, projectId))
    ))
    if (!matchedRefs.length) continue

    const item = {
      asset,
      matchedRefs,
      reasons: [asset.status === 'archived' ? 'archived-exact-ref' : 'exact-ref']
    }
    if (asset.status === 'archived') archived.push(item)
    else if (ACTIVE_ASSET_STATUSES.includes(asset.status)) active.push(item)
  }

  active.sort(compareMatches)
  archived.sort(compareMatches)
  return {
    state: active.length || archived.length ? 'matched' : 'no-exact-match',
    exactMatches: active,
    archivedMatches: archived
  }
}
```

Keep normalization, project comparison, ref comparison, and sorting private to this module. `projectMatches()` must use strict equality when `options.projectId` is supplied, including excluding legacy `null` assets.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run:

```bash
npm run test:run -- src/__tests__/narrativeAssetRetrieval.test.js
```

Expected: PASS with exact lookup, archived grouping, old-source compatibility, and isolation covered.

- [ ] **Step 6: Commit the retrieval contract**

```bash
git add src/services/media/narrativeAssetRetrieval.js src/__tests__/narrativeAssetRetrieval.test.js
git commit -m "feat(materials): add exact source reference lookup"
```

---

### Task 2: Replace simulated retrieval evidence with an executable scale check

**Files:**

- Modify: `src/__tests__/narrativeAssetRetrieval.test.js`
- Create: `scripts/benchmark-material-retrieval.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add deterministic 20/100/500 fixture generation**

Add a helper that creates a fixed number of assets without random ids or timestamps:

```js
function buildAssetCorpus(size, { projectId = 'book-1' } = {}) {
  return Array.from({ length: size }, (_, index) => createNarrativeAsset({
    id: `asset-${String(index + 1).padStart(3, '0')}`,
    title: `素材 ${index + 1}`,
    content: `素材正文 ${index + 1}`,
    projectId: index % 7 === 0 ? 'book-2' : projectId,
    status: index % 11 === 0 ? 'archived' : 'accepted',
    sourceRefs: [{
      refType: index % 3 === 0 ? 'chapter' : 'session-message',
      refId: index % 3 === 0 ? `chapter-${index % 5}` : `session-1:message-${index % 9}`,
      projectId: index % 7 === 0 ? 'book-2' : projectId
    }],
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index
  }))
}
```

For each scale, assert the exact expected ids, zero cross-project results, stable archived grouping, and an empty negative-control lookup. Do not assert that unrelated recency results are relevant.

- [ ] **Step 2: Add a repeatable benchmark script**

The script must:

- Generate 20, 100, and 500 deterministic assets.
- Warm up the lookup 100 times.
- Measure at least 1,000 lookups with `performance.now()`.
- Print JSON with `scale`, `medianMs`, `p95Ms`, and `matchedCount`.
- Exit non-zero only for contract failures such as leakage or unstable result ids; timing is reported, not asserted in CI.

Add this command:

```json
"benchmark:materials-retrieval": "vite-node scripts/benchmark-material-retrieval.mjs"
```

- [ ] **Step 3: Run the executable evidence**

Run:

```bash
npm run test:run -- src/__tests__/narrativeAssetRetrieval.test.js
npm run benchmark:materials-retrieval
```

Expected:

- All three scales return deterministic ids with zero project leakage.
- The missing-ref case returns no exact matches.
- The command prints measured timing for 20/100/500 assets.
- If 500-asset p95 is below 16ms on the execution machine, keep the full scan and do not add a cache. If it exceeds 16ms, stop this plan and document the measurement before designing an index; do not silently add one.

- [ ] **Step 4: Commit the evidence harness**

```bash
git add src/__tests__/narrativeAssetRetrieval.test.js scripts/benchmark-material-retrieval.mjs package.json
git commit -m "test(materials): execute retrieval scale fixtures"
```

---

### Task 3: Add idempotent multi-material transfer to the existing canvas

**Files:**

- Modify: `src/services/canvas/relationCanvas.js`
- Modify: `src/__tests__/narrativeAssets.test.js`
- Modify: `src/pages/Notes.vue`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Write failing batch-import service tests**

Cover ordered creation and idempotency:

```js
const result = ensureAssetCanvasCards([assetB, assetA, assetB])

expect(result.cards.map((card) => card.assetId)).toEqual([assetB.id, assetA.id])
expect(result.createdAssetIds).toEqual([assetB.id, assetA.id])
expect(result.existingAssetIds).toEqual([])

const repeated = ensureAssetCanvasCards([assetA, assetB])
expect(repeated.createdAssetIds).toEqual([])
expect(repeated.existingAssetIds).toEqual([assetA.id, assetB.id])
expect(listRelationCanvasCards()).toHaveLength(2)
```

Also cover missing ids, empty inputs, and preservation of pre-existing card content and position.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm run test:run -- src/__tests__/narrativeAssets.test.js
```

Expected: FAIL because `ensureAssetCanvasCards` is not exported.

- [ ] **Step 3: Implement `ensureAssetCanvasCards` with one storage write**

Use this result contract:

```js
export function ensureAssetCanvasCards(assets = []) {
  return {
    cards: [],
    createdAssetIds: [],
    existingAssetIds: []
  }
}
```

Deduplicate input by asset id while preserving first appearance. Reuse existing cards without rewriting them. Create missing cards using the same field defaults as `ensureAssetCanvasCard`, then write `PROSE_CARDS_V1` once.

- [ ] **Step 4: Add a failing Notes retrieval and transfer contract**

In `uiControlContract.test.js`, assert that Notes:

- imports `findAssetsByContentRefs`;
- keeps explicitly pinned sidekick items first, then fills remaining sidekick slots only with active exact-source matches;
- labels derived entries `同来源` and returns no unrelated recency fill for `no-exact-match`;
- imports `ensureAssetCanvasCards`;
- exposes one checked-selection action labelled `送入画布`;
- disables the action when no selection exists;
- routes to `{ name: 'prose-essay', query: { assetId: primary.id } }` after import;
- announces `已送入画布 N 项，其中 M 项已存在` through a `role="status"` region;
- leaves archive, merge, and delete actions unchanged.

- [ ] **Step 5: Replace the implicit same-kind/recency fill with exact-source results**

Derive sidekick candidates from the current asset's refs:

```js
const exactRelatedAssets = computed(() => {
  const selected = selectedAsset.value
  if (!selected) return []
  const result = findAssetsByContentRefs(selected.sourceRefs, {
    projectId: selected.projectId,
    assets: chapters.value
  })
  return result.exactMatches
    .map((item) => item.asset)
    .filter((asset) => asset.id !== selected.id)
})
```

Build `sidekickItems` from explicitly pinned active assets first, then exact-related assets, deduplicated and capped by `SIDEKICK_MAX_ITEMS`. If no exact relation remains, show the existing empty sidekick state with copy changed to `暂无同来源素材`; do not append same-kind or recent assets.

- [ ] **Step 6: Implement the Notes transfer action**

Add a single handler:

```js
function sendCheckedAssetsToCanvas() {
  const selected = getCheckedAssets()
  if (!selected.length) return
  saveCurrentChapter()
  const result = ensureAssetCanvasCards(selected)
  canvasImportRevision.value += 1
  canvasTransferFeedback.value = `已送入画布 ${result.cards.length} 项，其中 ${result.existingAssetIds.length} 项已存在`
  const primary = selected.find((asset) => asset.id === selectedAsset.value?.id) || selected[0]
  router.push({ name: 'prose-essay', query: { assetId: primary.id } })
}
```

Put the action in the existing checked-selection action strip. Do not add a new modal or a second selection store.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test:run -- src/__tests__/narrativeAssets.test.js src/__tests__/uiControlContract.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the retrieval and transfer slice**

```bash
git add src/services/canvas/relationCanvas.js src/pages/Notes.vue src/__tests__/narrativeAssets.test.js src/__tests__/uiControlContract.test.js
git commit -m "feat(materials): send selected assets to canvas"
```

---

### Task 4: Define the scene-board projection without adding persistence

**Files:**

- Create: `src/services/sceneMaterialBoard.js`
- Create: `src/__tests__/sceneMaterialBoard.test.js`

- [ ] **Step 1: Write failing source-state tests**

Use these exact states:

```js
expect(getCanvasCardSourceState(cardWithActiveAsset, assetsById)).toEqual({
  state: 'linked',
  asset: activeAsset
})
expect(getCanvasCardSourceState(cardWithArchivedAsset, assetsById).state).toBe('archived')
expect(getCanvasCardSourceState(cardWithMissingAsset, assetsById).state).toBe('detached')
expect(getCanvasCardSourceState(cardWithoutAssetId, assetsById).state).toBe('untracked')
```

Do not add a `stale` assertion. Content differences between an editable canvas card and its source are not sufficient evidence of source staleness.

- [ ] **Step 2: Write failing projection tests**

`buildSceneMaterialBoard({ cards, outline, edges, assets })` must return:

```js
{
  beatItems: [
    { outlineItem, card, sequence: 1, sourceState }
  ],
  unplacedItems: [
    { card, sourceState }
  ],
  relationItems: [
    { edge, sourceCard, targetCard }
  ],
  detachedCount: 0,
  archivedCount: 0
}
```

Assert that:

- outline order is the beat order;
- cards already in the outline never appear in `unplacedItems`;
- missing outline cards are ignored but counted as detached outline references;
- unplaced cards sort by creation order and are not capped in the model;
- relationships with a missing endpoint are omitted from display without rewriting storage.

- [ ] **Step 3: Write failing mutation tests**

Add pure helpers and test them:

```js
addCardToOutline(outline, card)
removeCardFromOutline(outline, cardId)
moveOutlineItem(outline, fromIndex, toIndex)
upsertSceneRelationship(edges, { sourceId, targetId, type })
```

Requirements:

- adding the same card twice is idempotent;
- reordering preserves every original item exactly once;
- invalid indices return the original value;
- self-links and unknown relation types are rejected;
- an existing edge for the same unordered pair is updated rather than duplicated, matching the current `connectCards()` behavior;
- relation types are limited to the five existing writing-edge values.

- [ ] **Step 4: Run the focused test and confirm RED**

Run:

```bash
npm run test:run -- src/__tests__/sceneMaterialBoard.test.js
```

Expected: FAIL because the service does not exist.

- [ ] **Step 5: Implement the pure service**

Export only:

```js
export const SCENE_RELATION_TYPES = [
  'continuation',
  'elaboration',
  'contrast',
  'parallel',
  'consciousness'
]

export function getCanvasCardSourceState(card, assetsById) {}
export function buildSceneMaterialBoard(input) {}
export function addCardToOutline(outline, card) {}
export function removeCardFromOutline(outline, cardId) {}
export function moveOutlineItem(outline, fromIndex, toIndex) {}
export function upsertSceneRelationship(edges, relationship) {}
```

Keep every helper pure. `ProseEssay.vue` remains responsible for assigning the returned arrays and persisting them through its existing watchers.

- [ ] **Step 6: Run the focused test and confirm GREEN**

Run:

```bash
npm run test:run -- src/__tests__/sceneMaterialBoard.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the scene-board model**

```bash
git add src/services/sceneMaterialBoard.js src/__tests__/sceneMaterialBoard.test.js
git commit -m "feat(canvas): add bounded scene board model"
```

---

### Task 5: Build the bounded C3 scene-board component

**Files:**

- Create: `src/components/canvas/SceneMaterialBoard.vue`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Add failing component-contract assertions**

Assert that `SceneMaterialBoard.vue` defines:

- props: `model`, `selectedCardId`, `relationTypes`, and `directorExportStatus`;
- emits: `select-card`, `open-source`, `add-to-beats`, `remove-from-beats`, `move-beat`, and `set-relation`;
- desktop regions labelled `关系编组`, `节拍`, and `待选素材`;
- mobile tabs with the same three names;
- move-up and move-down buttons for every beat;
- no pointer, pan, pinch, absolute-position, or touch-drag implementation;
- explicit text for `archived` and `detached` source states;
- an empty beat state that points to the unplaced-material tray;
- an empty relationship state requiring two selected cards.

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js
```

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the component structure**

Use a controlled component. It must not read or write localStorage. The core event shapes are:

```js
emit('move-beat', { fromIndex, toIndex })
emit('set-relation', { sourceId, targetId, type })
emit('select-card', card.id)
emit('open-source', card)
```

Desktop layout:

- Main column: relationship group above linear beats.
- Secondary rail: unplaced-material tray.
- Show at most four unplaced cards initially and a `显示其余 N 项` disclosure for the rest.
- Relationship editing requires two explicitly selected cards; do not infer a link from visual proximity.

Mobile layout at the existing canvas breakpoint:

- Default tab: `节拍`.
- `关系` and `待选素材` are separate tabs.
- Reordering uses buttons, not drag gestures.
- All controls retain visible focus styles and 44px minimum touch targets through existing control classes.

Reuse existing CSS variables and Folio/control primitives. Add no hard-coded theme colors and no new breakpoint.

- [ ] **Step 4: Add keyboard behavior**

- Card buttons are real `<button>` elements.
- `Enter`/`Space` select a card through native button behavior.
- Move buttons have specific labels such as `把第 3 个节拍上移`.
- Relation type buttons expose `aria-pressed` for the selected relationship.
- Source-state text is not color-only.

- [ ] **Step 5: Run the focused contract test and confirm GREEN**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the component**

```bash
git add src/components/canvas/SceneMaterialBoard.vue src/__tests__/uiControlContract.test.js
git commit -m "feat(canvas): add scene material board surface"
```

---

### Task 6: Integrate C3 into the existing card-canvas page

**Files:**

- Modify: `src/pages/ProseEssay.vue`
- Modify: `src/__tests__/uiControlContract.test.js`
- Test: `src/__tests__/sceneMaterialBoard.test.js`
- Test: `src/__tests__/integration.test.js`

- [ ] **Step 1: Add failing integration-contract tests**

Assert that ProseEssay:

- imports `SceneMaterialBoard` and the scene-board pure helpers;
- initializes `canvasSurface` to `scene` when cards exist;
- preserves a desktop `自由画布` switch;
- excludes the free canvas from the 390px pane choices;
- derives the scene-board model from existing `cards`, `outline`, `edges`, and `canvasAssets`;
- assigns and persists returned outline/edge arrays through existing state paths;
- keeps `CanvasTimeline`, director export, video generation, and `openCardMaterial()` wired;
- does not add a new storage key.

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/sceneMaterialBoard.test.js src/__tests__/integration.test.js
```

Expected: FAIL on missing C3 integration.

- [ ] **Step 3: Add scene/free surface state and projection**

Use:

```js
const canvasSurface = ref('scene')

const sceneBoardModel = computed(() => buildSceneMaterialBoard({
  cards: flatCards.value,
  outline: outline.value,
  edges: edges.value,
  assets: canvasAssets.value
}))
```

Do not store `canvasSurface`; a refresh returns to the bounded scene board. Preserve route-query selection through the existing `syncSelectedCardFromRoute()` path.

- [ ] **Step 4: Wire scene-board actions to existing truths**

Use handlers with this shape:

```js
function addSceneCardToBeats(cardId) {
  const card = flatCards.value.find((item) => item.id === cardId)
  if (!card) return
  outline.value = addCardToOutline(outline.value, card)
}

function moveSceneBeat({ fromIndex, toIndex }) {
  outline.value = moveOutlineItem(outline.value, fromIndex, toIndex)
}

function setSceneRelation(relationship) {
  edges.value = upsertSceneRelationship(edges.value, relationship)
}
```

Selecting a board card updates the existing `selectedCard`; opening a source calls `openCardMaterial(card)`. Removing a beat changes only `outline`, never deletes its canvas card.

- [ ] **Step 5: Preserve existing director and export semantics**

- Display the existing `directorExportStatus` in the scene-board header.
- The `生成/更新分镜版本` action continues to call the existing export path.
- The beat list is the existing outline, so shot extraction and video generation see the same order.
- Do not rename or reinterpret the six director transition types.
- Do not remove free-canvas edges, piles, commits, branches, advisor actions, or drag code in this task.

- [ ] **Step 6: Implement responsive behavior**

At desktop widths, show `场景板 / 自由画布` as a local surface switch. At the existing mobile breakpoint, show only the scene board's `关系 / 节拍 / 待选素材` tabs and the existing timeline/director actions. Do not render the free-position wall as an interactive mobile surface.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/sceneMaterialBoard.test.js src/__tests__/integration.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit C3 integration**

```bash
git add src/pages/ProseEssay.vue src/__tests__/uiControlContract.test.js src/__tests__/sceneMaterialBoard.test.js src/__tests__/integration.test.js
git commit -m "feat(canvas): make scene board the default organizer"
```

---

### Task 7: Add deterministic UI-audit coverage and perform visual review

**Files:**

- Modify: `scripts/ui-audit.mjs`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Add a `scene-board` audit fixture**

Seed, using existing audit storage helpers:

- eight materials in one project;
- six canvas cards linked to those materials;
- five outline items;
- two existing relationships;
- one archived source;
- one missing source id to exercise `detached`;
- a current director export fixture if the existing audit helper supports it.

Do not add test-only product branches.

- [ ] **Step 2: Extend audit routing**

Make `UI_AUDIT_ROUTES=prose-essay` and `UI_AUDIT_STATES=scene-board` load `/prose-essay?assetId=<seeded-id>` and wait for the scene-board root marker.

- [ ] **Step 3: Run source contracts and build before browser audit**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/sceneMaterialBoard.test.js
npm run build
```

Expected: PASS and Vite build exit 0.

- [ ] **Step 4: Check for an existing dev server without starting one**

Run:

```bash
pgrep -af 'vite|npm run dev'
```

If no existing server is running, record the 1440/390 browser audit as an external gate and do not start or restart a server. If one is running, continue.

- [ ] **Step 5: Run the scene-board UI audit when a server exists**

Run:

```bash
UI_AUDIT_ROUTES=prose-essay UI_AUDIT_WIDTHS=1440,390 UI_AUDIT_STATES=scene-board UI_AUDIT_OUTPUT=/tmp/pinax-scene-material-board npm run audit:ui
```

Expected:

- 0 console errors.
- 0 accessibility failures.
- No horizontal overflow.
- At 1440px, relationship group, beats, and tray are simultaneously understandable.
- At 390px, the beat tab is initially visible and all five beats can be reordered without free dragging.
- Archived and detached states are readable without relying on color.
- Source return and director export actions remain reachable.

- [ ] **Step 6: Apply `ui-style-check` and fix only observed failures**

Confirm use of existing tokens, controls, focus treatment, and breakpoint. Do not redesign Notes or the entire ProseEssay page during this pass.

- [ ] **Step 7: Commit audit coverage and any bounded fixes**

```bash
git add scripts/ui-audit.mjs src/__tests__/uiControlContract.test.js src/components/canvas/SceneMaterialBoard.vue src/pages/ProseEssay.vue
git commit -m "test(canvas): cover scene board responsive states"
```

---

### Task 8: Update project truth and run final verification

**Files:**

- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`
- Modify: `docs/src/known-issues.md`
- Modify: `docs/plan/pinax-integrated-product-roadmap.md`

- [ ] **Step 1: Update behavior and plan documentation**

Record these exact facts:

- Materials can send a checked selection to the existing card canvas idempotently.
- Exact source-linked material lookup is derived from `sourceRefs[]`, strictly project-scoped, and separates archived matches.
- The canvas defaults to a bounded C3 scene board while retaining the desktop free canvas and existing director/video flow.
- Mobile scene-board work supports viewing, selection, fixing, and linear reordering, not free layout.
- Provenance shown in this slice is `linked/archived/detached/untracked`; generic stale detection remains unresolved until a version/hash baseline is captured.
- Retrieval benchmark results must use the actual numbers printed in Task 2, not the research report's simulated numbers.
- `useCanvasBoard.js` cleanup remains a follow-up after user verification.

- [ ] **Step 2: Run diff and focused verification**

Run:

```bash
git diff --check
npm run test:run -- src/__tests__/narrativeAssetRetrieval.test.js src/__tests__/narrativeAssets.test.js src/__tests__/sceneMaterialBoard.test.js src/__tests__/uiControlContract.test.js src/__tests__/integration.test.js
npm run benchmark:materials-retrieval
```

Expected: no diff errors; all focused tests pass; benchmark prints measured 20/100/500 results with no leakage.

- [ ] **Step 3: Run full repository verification**

Run:

```bash
npm run verify:full
```

Expected: all Vitest files pass, Vite build passes, diff check passes, and VitePress build passes. Record actual counts rather than copying the previous 20-files/200-tests baseline.

- [ ] **Step 4: Inspect the final staged scope**

Run:

```bash
git status --short
git diff --stat
```

Stage only files owned by this plan. Preserve unrelated research and user WIP.

- [ ] **Step 5: Commit the handoff**

```bash
git add docs/STATUS.md docs/PLAN.md docs/LOG.md docs/src/known-issues.md docs/plan/pinax-integrated-product-roadmap.md
git commit -m "docs(canvas): record scene material loop"
```

---

## Acceptance gates

The slice is complete only when all applicable gates pass:

1. Exact lookup never returns a different-project or null-project asset for a scoped project query.
2. A missing ref returns `no-exact-match`; recent suggestions are not labelled as related.
3. Archived exact matches are separated from active exact matches; rejected assets do not appear.
4. The executed 20/100/500 corpus is deterministic and the benchmark records real timings.
5. Sending the same material selection twice creates no duplicate canvas cards.
6. Scene-board beat order and existing outline order are the same data.
7. Relationship edits reuse the existing five writing-edge types and `PROSE_EDGES_V1`.
8. Director export, storyboard version status, source return, and video actions remain intact.
9. At 390px, all core tasks work without free dragging or horizontal overflow.
10. `linked/archived/detached/untracked` labels are accurate; no generic `stale` claim is shown.
11. Focused tests and `npm run verify:full` pass with fresh output.
12. Real browser audit is either passed on an existing server or explicitly recorded as not run; it is never inferred from source tests.

## Explicit follow-ups, not part of this plan

- Generic current/stale/rebased provenance and a source-baseline schema.
- Lossless bidirectional conversion between writing `originRefs` and `ContentRef`; a lookup-only projection may be planned separately.
- Experience and Writing page current-material trays; reuse the exact lookup contract only after the Materials→Canvas loop is user-validated.
- Persistent or runtime reverse indexes unless the measured 500-asset p95 exceeds the agreed threshold.
- Removal of `src/composables/useCanvasBoard.js` and Notes drag wiring after one verified release cycle.
- Semantic retrieval, embeddings, LLM reranking, new asset kinds, or cross-section-specific storage.
