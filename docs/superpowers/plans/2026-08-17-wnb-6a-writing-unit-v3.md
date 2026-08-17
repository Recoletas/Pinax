# WNB-6A Writing Unit V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paragraph-as-business-block model with a stable `WritingDocumentV3 -> writingUnit -> editor node` model, migrate existing local chapters without data loss, and make one committed Experience assistant turn importable as one traceable writing unit.

**Architecture:** Keep the structured writing document as the canonical source and Markdown as a publication projection. A `writingUnit` is the stable provenance/version/Agent-context container; its child nodes carry `nodeId` for precise selection, annotation, and patch targets. Perform one read-time v2-to-v3 conversion and persist v3 on the next save; do not keep parallel v2/v3 editor paths. Sidecars are migrated through `unitId + nodeId`, while snapshots remain whole-document recovery checkpoints.

**Tech Stack:** Vue 3, Tiptap 3 / ProseMirror, `@tiptap/extension-unique-id`, Pinax localStorage services, Vitest, Vite, VitePress, Playwright-based UI audit.

---

## Scope and execution order

This plan implements only WNB-6A:

- schema v3 and deterministic v2 migration;
- stable unit/node identities and unit revisions;
- Enter/Shift+Enter plus explicit split/merge/move as undoable editor transactions;
- annotation, candidate, snapshot, fragment-history, recovery, and quality-gate migration;
- explicit committed Experience-turn import with provenance and backlink;
- subtle unit boundary UI and the WNB-6A verification matrix.

The following remain separate follow-up projects: common Markdown list/task-list/fenced-code support, annotation `targets[]`, “find similar”, multi-target rewrite, scene/outline/storyboard projections, collaboration, notebook execution/runtime concepts, `@` syntax, and generic plugin properties.

## Parallel execution contract

This plan is intended to run beside `docs/superpowers/plans/2026-08-17-experience-authenticity-mvp.md` from one identical, user-approved baseline commit.

- WNB branch: `feature/wnb-6a-writing-unit-v3`.
- Experience branch: `feature/experience-authenticity-mvp`.
- WNB exclusively owns `src/pages/Experience.vue`, `src/components/GamePanel.vue`, `src/components/experience/NarrativeTurn.vue`, `src/pages/Writing.vue`, `src/components/writing/**`, writing services/contracts, `src/__tests__/integration.test.js`, `src/__tests__/gameStoreSession.test.js`, `src/__tests__/uiControlContract.test.js`, and the Writing UI-audit fixture.
- Experience exclusively owns `src/pages/WorldBookEditor.vue`, `src/stores/gameStore.js`, character-card/voice services, narrative Kernel/resource/tool/orchestrator/critic services and contracts, `src/composables/useStorage.js`, `src/__tests__/agentContracts.test.js`, and `src/__tests__/worldBookQuickImport.test.js`.
- WNB must not edit `src/stores/gameStore.js`, `src/__tests__/agentContracts.test.js`, `src/__tests__/worldBookQuickImport.test.js`, `src/pages/WorldBookEditor.vue`, `shared/narrativeAgentContract.js`, or `src/composables/useStorage.js`.
- The frozen cross-branch interface is the existing committed assistant message/turn shape: WNB reads `message.id`, `message.role`, `message.content`, `message.branchId`, and committed `turnRecord` provenance. Experience may change how text is produced and traced, but must not rename or reinterpret those fields.
- Neither feature worker updates `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, or the product roadmap. Canonical docs are updated once, by the integration owner, after both branches merge and combined verification passes.
- Each worker stops after its branch handoff summary. The integration owner merges both branches, resolves only integration-level conflicts, runs combined gates, then updates canonical docs.

## Locked data contract

All tasks use these names and shapes:

```js
export const WRITING_DOCUMENT_SCHEMA_VERSION = 3

export const WRITING_UNIT_KINDS = new Set(['passage', 'scene', 'note', 'source'])

// WritingDocumentV3
{
  schemaVersion: 3,
  revision: 7,
  content: [WritingUnitV3],
  meta: { sourceHash, trailingMarkdown, importedAt },
  updatedAt
}

// WritingUnitV3
{
  type: 'writingUnit',
  attrs: {
    unitId: 'unit-...',
    unitRevision: 2,
    kind: 'passage',
    sceneId: null,
    originRefs: []
  },
  content: [
    {
      type: 'paragraph',
      attrs: {
        nodeId: 'node-...',
        nodeRevision: 1,
        kind: 'prose',
        rawMarkdown: null,
        leadingMarkdown: '',
        originalText: null
      },
      content: [{ type: 'text', text: '正文' }]
    }
  ]
}

// WritingOriginRef; v1 only defines the Experience source kind.
{
  type: 'experience-turn',
  sessionId: 'session-id',
  branchId: 'main',
  turnId: 'turn-id',
  messageId: 'assistant-message-id',
  worldbookId: 'worldbook-id-or-empty',
  sourceRevision: 1
}

// WritingTargetV3; used by annotations, candidates, and quality issues.
{
  unitId: 'unit-id',
  unitRevision: 2,
  nodeId: 'node-id',
  nodeRevision: 1,
  start: 4,
  end: 9
}
```

Identity rules:

- `Enter` creates a child paragraph with a new `nodeId`; it never creates a `unitId`.
- Editing any child increments that child’s `nodeRevision` and the enclosing `unitRevision` when the editor document is serialized.
- Splitting retains the old `unitId` on the left and creates one new `unitId` on the right. Existing child `nodeId`s remain stable; if the cursor splits a text node, the left keeps the original `nodeId` and the right receives a new one.
- Merging retains the earlier unit’s `unitId`, unions and de-duplicates `originRefs`, and keeps all child `nodeId`s.
- Moving a unit changes order only. It does not increment content revisions.
- A source fingerprint is `type\0sessionId\0branchId\0turnId\0messageId\0sourceRevision`. Re-importing the exact fingerprint is rejected as `already-imported`; regenerated branches/messages append a new unit and never overwrite an earlier import.

## File map

**Create**

- `src/services/writing/writingUnitExtension.js` — Tiptap top-level document/wrapper nodes, node identity attrs, and split/merge/move commands.
- `src/services/writing/writingExperienceImport.js` — pure Experience-turn-to-unit conversion and atomic `writing_books` update.

**Modify**

- `src/services/writing/writingDocumentSchema.js` — v3 contract, Markdown projection, v2 migration, lookup helpers, validation.
- `src/composables/useWritingDocument.js` — load-time migration and save-time v3 persistence.
- `src/components/writing/WritingNotebookEditor.vue` — mount v3 schema, expose unit commands/selection, emit unit transition metadata, render subtle boundaries.
- `src/services/writing/writingAnnotations.js` — schema v3 targets and v2 sidecar migration/reconciliation.
- `shared/writingCandidateContract.js` and `src/services/writing/writingCandidates.js` — `unitId + nodeId` patch targets and stale checks.
- `shared/writingBlockHistoryContract.js` and `src/services/writing/writingBlockHistory.js` — schema v2 unit/fragment history while retaining the storage key.
- `shared/writingSnapshotContract.js`, `src/services/writing/writingSnapshots.js`, and `src/services/writing/writingRecovery.js` — accept/migrate v3 documents without collapsing recovery layers.
- `src/pages/Writing.vue` — consume v3 targets, unit operations, provenance display/backlink, and wording.
- `src/components/experience/NarrativeTurn.vue`, `src/components/GamePanel.vue`, and `src/pages/Experience.vue` — committed-turn “收进稿件” action and destination dialog.
- `src/__tests__/integration.test.js` — parameterized schema/editor-sidecar/import contracts; consolidate superseded v2 assertions so total tests stay at or below 200.
- `src/__tests__/gameStoreSession.test.js` — committed/current-branch import eligibility.
- `src/__tests__/uiControlContract.test.js` — static UI ownership/accessibility contracts.
- `scripts/ui-audit.mjs` — WNB-6A state fixture and 1440/980/390/200%-zoom captures.
- `docs/agent-runs/2026-08-17-wnb-experience-parallel/wnb-6a-summary.md` — branch-local handoff evidence for the integration owner.

## Task 0: Establish an isolated, reproducible execution base

**Files:**

- Read: `docs/STATUS.md`
- Read: `LOCAL.md`
- Read: `docs/superpowers/research/writing-page-optimization-20260817.md`
- Read: `docs/agent-runs/2026-08-17-wnb-experience-parallel/current.md`
- Read: `docs/engineering/visual-alignment-workflow.md`
- Read: `docs/plan/pinax-integrated-product-roadmap.md`
- No source edits

- [ ] **Step 1: Inspect the shared worktree and record the intended base**

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Expected: the current shared worktree is dirty and the branch/base commit are printed. Do not stash, reset, or commit another session’s changes.

- [ ] **Step 2: Resolve the base before implementation**

Use `using-git-worktrees`. Create `/home/recoletas/jiuguan/worktrees/pinax-wnb-6a` on `feature/wnb-6a-writing-unit-v3` from the exact baseline commit recorded by the integration owner in `docs/agent-runs/2026-08-17-wnb-experience-parallel/current.md`. If the board still says `blocked-on-baseline`, stop; starting from older `main` would silently discard prerequisites.

Expected: an isolated worktree on a feature branch based on `main` or the user-approved prerequisite commit, with a clean `git status --short`.

- [ ] **Step 3: Capture the baseline contract result**

Run:

```bash
npm run verify:contract -- src/__tests__/integration.test.js src/__tests__/gameStoreSession.test.js src/__tests__/uiControlContract.test.js
```

Expected: exit 0. Record file/test counts in the execution notes. A pre-existing failure blocks feature work and must be reported separately.

## Task 1: Freeze v3 fixtures and the deterministic v2 migration contract

**Files:**

- Modify: `src/__tests__/integration.test.js`
- Modify: `src/services/writing/writingDocumentSchema.js`
- Modify: `src/composables/useWritingDocument.js`

- [ ] **Step 1: Replace superseded paragraph-business-block assertions with one parameterized v3 contract test**

Add imports for `createWritingDocument`, `migrateWritingDocumentToV3`, `getWritingNodeLocation`, and `validateWritingDocument`, then add one table-driven test under the existing writing section:

```js
it.each([
  ['empty chapter', '', 1, ['passage']],
  ['plain prose', '甲。\n\n乙。', 1, ['passage']],
  ['scene boundary', '# 第一幕\n\n甲。\n\n---\n\n乙。', 3, ['scene', 'passage', 'passage']],
  ['note and source', '> 作者注：核对时间\n\n> 来源：访谈 A', 2, ['note', 'source']]
])('creates WritingDocumentV3 for %s', (_name, markdown, unitCount, kinds) => {
  const document = createWritingDocument(markdown)
  expect(validateWritingDocument(document)).toEqual({ valid: true, errors: [] })
  expect(document.schemaVersion).toBe(3)
  expect(document.content).toHaveLength(unitCount)
  expect(document.content.map((unit) => unit.attrs.kind)).toEqual(kinds)
  expect(new Set(document.content.map((unit) => unit.attrs.unitId)).size).toBe(unitCount)
  const nodes = document.content.flatMap((unit) => unit.content)
  expect(new Set(nodes.map((node) => node.attrs.nodeId)).size).toBe(nodes.length)
})
```

Add a v2 fixture and assert exact preservation:

```js
it('migrates v2 blocks once and preserves block ids as node ids', () => {
  const v2 = {
    schemaVersion: 2,
    revision: 4,
    content: [
      { type: 'sceneHeading', attrs: { blockId: 'h1', revision: 1, kind: 'scene-heading', level: 1 }, content: [{ type: 'text', text: '第一幕' }] },
      { type: 'paragraph', attrs: { blockId: 'p1', revision: 2, kind: 'prose' }, content: [{ type: 'text', text: '甲。' }] },
      { type: 'paragraph', attrs: { blockId: 'p2', revision: 0, kind: 'prose' }, content: [{ type: 'text', text: '乙。' }] }
    ],
    meta: { trailingMarkdown: '' }
  }
  const migrated = migrateWritingDocumentToV3(v2)
  expect(migrated.schemaVersion).toBe(3)
  expect(migrated.revision).toBe(4)
  expect(migrated.content).toHaveLength(1)
  expect(migrated.content[0].attrs).toMatchObject({
    unitId: 'unit-v2-h1', unitRevision: 2, kind: 'scene', originRefs: []
  })
  expect(migrated.content[0].content.map((node) => node.attrs.nodeId)).toEqual(['h1', 'p1', 'p2'])
  expect(getWritingNodeLocation(migrated, 'p2')).toMatchObject({ unitId: 'unit-v2-h1', nodeId: 'p2' })
})
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing v3 API**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: FAIL because `migrateWritingDocumentToV3` / `getWritingNodeLocation` are not exported or `schemaVersion` is still 2.

- [ ] **Step 3: Implement v3 constructors, grouping, lookup, and validation**

In `writingDocumentSchema.js`, replace the v2 top-level construction path with these public boundaries:

```js
export const WRITING_DOCUMENT_SCHEMA_VERSION = 3
export const WRITING_UNIT_KINDS = new Set(['passage', 'scene', 'note', 'source'])

function createUnitId(seed) {
  return seed
    ? `unit-${hashText(String(seed))}`
    : `unit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createNodeId() {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeWritingOriginRefs(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).filter((ref) => {
    if (!ref || ref.type !== 'experience-turn') return false
    const fingerprint = [ref.type, ref.sessionId, ref.branchId, ref.turnId, ref.messageId, Number(ref.sourceRevision || 1)].join('\u0000')
    if (!ref.sessionId || !ref.turnId || !ref.messageId || seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  }).map((ref) => ({
    type: 'experience-turn',
    sessionId: String(ref.sessionId),
    branchId: String(ref.branchId || 'main'),
    turnId: String(ref.turnId),
    messageId: String(ref.messageId),
    worldbookId: String(ref.worldbookId || ''),
    sourceRevision: Math.max(1, Number(ref.sourceRevision || 1))
  }))
}

function toV3Node(node, index) {
  const attrs = node?.attrs || {}
  return {
    ...node,
    attrs: {
      ...attrs,
      nodeId: attrs.nodeId || attrs.blockId || `node-${index + 1}-${hashText(JSON.stringify(node))}`,
      nodeRevision: Number(attrs.nodeRevision ?? attrs.revision ?? 0),
      kind: attrs.kind || 'prose'
    }
  }
}

function unitKindForNode(node) {
  if (node?.attrs?.kind === 'scene-heading') return 'scene'
  if (node?.attrs?.kind === 'author-note') return 'note'
  if (node?.attrs?.kind === 'source-reference') return 'source'
  return 'passage'
}

function groupV2Nodes(nodes) {
  const units = []
  let pending = []
  const flush = () => {
    if (!pending.length) return
    const kind = unitKindForNode(pending[0])
    const firstId = pending[0].attrs.nodeId
    units.push({
      type: 'writingUnit',
      attrs: {
        unitId: `unit-v2-${firstId}`,
        unitRevision: Math.max(0, ...pending.map((node) => Number(node.attrs.nodeRevision || 0))),
        kind,
        sceneId: null,
        originRefs: []
      },
      content: pending
    })
    pending = []
  }

  nodes.forEach((node) => {
    const special = ['scene-heading', 'divider', 'author-note', 'source-reference'].includes(node.attrs.kind)
    if (special) flush()
    pending.push(node)
    if (['divider', 'author-note', 'source-reference'].includes(node.attrs.kind)) flush()
  })
  flush()
  if (!units.length) {
    units.push({
      type: 'writingUnit',
      attrs: { unitId: createUnitId(), unitRevision: 0, kind: 'passage', sceneId: null, originRefs: [] },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: createNodeId(), nodeRevision: 0, kind: 'prose', rawMarkdown: '', leadingMarkdown: '', originalText: '' },
        content: []
      }]
    })
  }
  return units
}

export function migrateWritingDocumentToV3(document, fallbackMarkdown = '') {
  if (document?.schemaVersion === 3 && validateWritingDocument(document).valid) return document
  if (document?.schemaVersion !== 2 || !Array.isArray(document.content)) {
    return createWritingDocument(fallbackMarkdown)
  }
  return {
    ...document,
    schemaVersion: 3,
    content: groupV2Nodes(document.content.map(toV3Node)),
    meta: { ...(document.meta || {}), migratedFrom: 2 }
  }
}

export function getWritingNodeLocation(document, nodeId) {
  for (let unitIndex = 0; unitIndex < (document?.content || []).length; unitIndex += 1) {
    const unit = document.content[unitIndex]
    const nodeIndex = (unit.content || []).findIndex((node) => node?.attrs?.nodeId === nodeId)
    if (nodeIndex >= 0) return { unitId: unit.attrs.unitId, nodeId, unitIndex, nodeIndex, unit, node: unit.content[nodeIndex] }
  }
  return null
}
```

Adapt Markdown rendering and cursor lookup to flatten `unit.content` only at projection boundaries. Update `validateWritingDocument()` so it rejects duplicate/missing `unitId`, duplicate/missing `nodeId`, invalid kinds, empty units, and negative/non-integer revisions.

- [ ] **Step 4: Make chapter reads migrate in memory and saves persist only v3**

Change `getChapterDocument(chapter)` to call `migrateWritingDocumentToV3(candidate, chapter.content)` after validating the legacy outer shape. In `useWritingDocument`, normalize through migration, not through v3-only validation:

```js
function normalizeDocument(document, fallbackMarkdown = '') {
  const candidate = migrateWritingDocumentToV3(cloneDocument(document), fallbackMarkdown)
  return validateWritingDocument(candidate).valid ? candidate : null
}
```

Do not write localStorage during load. `persistChapterDocument()` remains the first persistence point and sets `editorDocumentSchemaVersion = 3`.

- [ ] **Step 5: Verify schema, migration, Markdown, and 100k projection contracts**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: PASS; existing Markdown round-trip and 100k-character tests remain green. Confirm the total Vitest test count has not increased above 200 by consolidating obsolete v2 cases into the parameterized test.

- [ ] **Step 6: Commit the schema slice**

Before committing, invoke `commit-conventions`.

```bash
git add src/services/writing/writingDocumentSchema.js src/composables/useWritingDocument.js src/__tests__/integration.test.js
git commit -m "feat(writing): add writing unit v3 schema"
```

Expected: one scoped commit containing only schema/migration/tests.

## Task 2: Mount `writingUnit` in Tiptap and freeze editor transactions

**Files:**

- Create: `src/services/writing/writingUnitExtension.js`
- Modify: `src/components/writing/WritingNotebookEditor.vue`
- Modify: `src/services/writing/writingDocumentSchema.js`
- Modify: `src/__tests__/integration.test.js`

- [ ] **Step 1: Add transaction-level tests for Enter, split, merge, move, and undo metadata**

Import `Editor` from `@tiptap/core`, `StarterKit`, `UniqueID`, and the new extension exports. Use one parameterized editor fixture rather than separate test cases:

```js
function makeUnitEditor(document) {
  return new Editor({
    extensions: [
      StarterKit.configure({ document: false }),
      WritingDocumentNode,
      WritingUnitNode,
      WritingNodeAttributes,
      UniqueID.configure({
        types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
        attributeName: 'nodeId'
      })
    ],
    content: { type: 'doc', content: writingDocumentToEditorContent(document) }
  })
}

it('keeps Enter inside one unit and makes unit operations single-step undoable', () => {
  const editor = makeUnitEditor(createWritingDocument('甲。'))
  const original = editor.getJSON()
  editor.commands.setTextSelection(3)
  expect(editor.commands.splitBlock()).toBe(true)
  expect(editor.getJSON().content).toHaveLength(1)
  expect(editor.getJSON().content[0].content).toHaveLength(2)
  expect(editor.commands.splitWritingUnit()).toBe(true)
  expect(editor.getJSON().content).toHaveLength(2)
  expect(editor.commands.undo()).toBe(true)
  expect(editor.getJSON().content).toHaveLength(1)
  expect(editor.commands.mergeWritingUnit('next')).toBe(false)
  editor.commands.setContent(original)
  editor.destroy()
})
```

Add a loop that calls `splitBlock()` 20 times and asserts exactly one distinct `unitId`. Add merge provenance union and move revision-invariance assertions to the same test body.

- [ ] **Step 2: Run the focused test and verify the missing extension fails**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: FAIL because `writingUnitExtension.js` and its commands do not exist.

- [ ] **Step 3: Implement the top node, wrapper node, and node identity attrs**

Create `writingUnitExtension.js` with these exports and command signatures:

```js
import { Extension, Node, mergeAttributes } from '@tiptap/core'

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const WritingDocumentNode = Node.create({
  name: 'doc',
  topNode: true,
  content: 'writingUnit+'
})

export const WritingUnitNode = Node.create({
  name: 'writingUnit',
  group: 'writingUnit',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      unitId: { default: null, parseHTML: (el) => el.dataset.unitId, renderHTML: (attrs) => ({ 'data-unit-id': attrs.unitId }) },
      unitRevision: { default: 0, parseHTML: (el) => Number(el.dataset.unitRevision || 0), renderHTML: (attrs) => ({ 'data-unit-revision': attrs.unitRevision }) },
      kind: { default: 'passage', parseHTML: (el) => el.dataset.unitKind || 'passage', renderHTML: (attrs) => ({ 'data-unit-kind': attrs.kind }) },
      sceneId: { default: null, parseHTML: (el) => el.dataset.sceneId || null, renderHTML: (attrs) => attrs.sceneId ? { 'data-scene-id': attrs.sceneId } : {} },
      originRefs: { default: [], rendered: false }
    }
  },
  parseHTML: () => [{ tag: 'section[data-writing-unit]' }],
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-writing-unit': '' }), 0]
  },
  addCommands() {
    return {
      splitWritingUnit: () => ({ state, dispatch }) => splitUnitTransaction(state, dispatch, makeId),
      mergeWritingUnit: (direction = 'previous') => ({ state, dispatch }) => mergeUnitTransaction(state, dispatch, direction),
      moveWritingUnit: (direction) => ({ state, dispatch }) => moveUnitTransaction(state, dispatch, direction)
    }
  }
})

export const WritingNodeAttributes = Extension.create({
  name: 'writingNodeAttributes',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
    attributes: {
      nodeId: { default: null },
      nodeRevision: { default: 0 },
      nodeKind: { default: 'prose' }
    }
  }]
})
```

In the same file, implement `splitUnitTransaction`, `mergeUnitTransaction`, and `moveUnitTransaction` using one ProseMirror transaction each. Each dispatched transaction must set:

```js
tr.setMeta('writingUnitTransition', {
  type: 'split' | 'merge' | 'move',
  keptUnitId,
  createdUnitId: null,
  removedUnitId: null,
  nodeUnitMap: { [nodeId]: unitId }
})
```

For a mid-paragraph split, cut the selected direct child into two nodes, preserve the old `nodeId` on the left, assign a new `nodeId` to the right, and include `splitNode: { oldNodeId, newNodeId, offset }` in the metadata. Reject split on an empty edge, merge without an adjacent unit, and move beyond the document bounds without dispatching.

- [ ] **Step 4: Convert editor adapters from flat blocks to nested units**

`writingDocumentToEditorContent(document)` must return `writingUnit` nodes. `editorContentToWritingDocument(content, previousDocument)` must compare children by `nodeId`, increment changed `nodeRevision`, and increment `unitRevision` only when serialized child content or unit attrs changed. Moving an unchanged unit must keep `unitRevision`.

Use a stable structural comparison that excludes revisions:

```js
function comparableUnit(unit) {
  return JSON.stringify({
    kind: unit?.attrs?.kind || 'passage',
    sceneId: unit?.attrs?.sceneId || null,
    originRefs: normalizeWritingOriginRefs(unit?.attrs?.originRefs),
    content: (unit?.content || []).map((node) => ({
      type: node.type,
      attrs: { ...node.attrs, nodeRevision: undefined },
      content: node.content || []
    }))
  })
}
```

- [ ] **Step 5: Mount the v3 extensions and emit transition metadata**

In `WritingNotebookEditor.vue`:

- disable StarterKit’s document node;
- insert `WritingDocumentNode`, `WritingUnitNode`, and `WritingNodeAttributes` before decoration extensions;
- change UniqueID from `blockId` to `nodeId`;
- change selection payloads to include `unitId`, `unitRevision`, `nodeId`, and `nodeRevision`;
- emit `unit-transition` when `transaction.getMeta('writingUnitTransition')` exists;
- expose `splitWritingUnit`, `mergeWritingUnit`, and `moveWritingUnit`.

The extension list must have this shape:

```js
StarterKit.configure({ document: false, heading: { levels: [1, 2, 3] }, history: true }),
WritingDocumentNode,
WritingUnitNode,
WritingNodeAttributes,
AnnotationDecorations,
LiveMarkdownInput,
LiveMarkdownDecorations,
WritingCommandMenu,
InlineSuggestionDecorations,
UniqueID.configure({
  types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
  attributeName: 'nodeId',
  generateID: ({ node, pos }) => `node-editor-${node.type.name}-${pos}-${Date.now().toString(36)}`
})
```

- [ ] **Step 6: Verify editor contracts including Chinese composition guards**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js src/__tests__/uiControlContract.test.js
```

Expected: PASS. Existing `event.isComposing || view.composing` command-menu guard remains present; Enter, split, merge, move, and undo assertions pass.

- [ ] **Step 7: Commit the editor transaction slice**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions` before committing.

```bash
git add src/services/writing/writingUnitExtension.js src/services/writing/writingDocumentSchema.js src/components/writing/WritingNotebookEditor.vue src/__tests__/integration.test.js src/__tests__/uiControlContract.test.js
git commit -m "feat(writing): add unit editor transactions"
```

## Task 3: Migrate annotations and candidates to unit/node targets

**Files:**

- Modify: `src/services/writing/writingAnnotations.js`
- Modify: `shared/writingCandidateContract.js`
- Modify: `src/services/writing/writingCandidates.js`
- Modify: `src/components/writing/WritingNotebookEditor.vue`
- Modify: `src/pages/Writing.vue`
- Modify: `src/__tests__/integration.test.js`

- [ ] **Step 1: Add v2-sidecar migration, split/merge, orphan, and stale tests**

Use one explicit fixture to cover legacy normalization, stable-node split/merge, quote relocation, and orphaning:

```js
it('migrates legacy anchors across unit split/merge and orphans ambiguous deletion', () => {
  const previous = createWritingDocument('甲。\n\n唯一锚点。')
  const unit = previous.content[0]
  const targetNode = unit.content[1]
  const annotation = {
    schemaVersion: 2,
    id: 'annotation-legacy',
    chapterId: 'chapter-1',
    blockId: targetNode.attrs.nodeId,
    blockRevision: targetNode.attrs.nodeRevision,
    selector: createWritingSelector({ text: '唯一锚点', start: 0, end: 4, fullText: '唯一锚点。' }),
    kind: 'comment',
    body: '检查这里',
    status: 'open',
    createdBy: 'user',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z'
  }

  const split = {
    ...previous,
    content: [
      { ...unit, content: [unit.content[0]] },
      { ...unit, attrs: { ...unit.attrs, unitId: 'unit-right' }, content: [targetNode] }
    ]
  }
  const afterSplit = reconcileWritingAnnotations([annotation], split, 'chapter-1', previous, {
    type: 'split', keptUnitId: unit.attrs.unitId, createdUnitId: 'unit-right',
    nodeUnitMap: { [targetNode.attrs.nodeId]: 'unit-right' }
  })[0]
  expect(afterSplit).toMatchObject({ status: 'open', target: { unitId: 'unit-right', nodeId: targetNode.attrs.nodeId } })

  const merged = { ...previous, content: [{ ...unit, content: [unit.content[0], targetNode] }] }
  const afterMerge = reconcileWritingAnnotations([afterSplit], merged, 'chapter-1', split, {
    type: 'merge', keptUnitId: unit.attrs.unitId, removedUnitId: 'unit-right',
    nodeUnitMap: { [targetNode.attrs.nodeId]: unit.attrs.unitId }
  })[0]
  expect(afterMerge).toMatchObject({ status: 'open', target: { unitId: unit.attrs.unitId } })

  const deleted = createWritingDocument('没有原锚点。')
  expect(reconcileWritingAnnotations([afterMerge], deleted, 'chapter-1', merged, { type: 'delete' })[0].status).toBe('orphaned')
})
```

In the same test, add a node-scoped candidate and explicit current-node inventory:

```js
const candidate = {
  chapterId: 'chapter-1',
  documentRevision: merged.revision,
  patches: [{
    unitId: unit.attrs.unitId,
    unitRevision: unit.attrs.unitRevision,
    nodeId: targetNode.attrs.nodeId,
    nodeRevision: targetNode.attrs.nodeRevision,
    baseText: '唯一锚点。',
    replacement: '唯一锚点被改写。'
  }]
}
const current = {
  chapterId: 'chapter-1',
  documentRevision: merged.revision,
  nodes: [{
    unitId: unit.attrs.unitId,
    unitRevision: unit.attrs.unitRevision,
    nodeId: targetNode.attrs.nodeId,
    nodeRevision: targetNode.attrs.nodeRevision,
    text: '唯一锚点。'
  }]
}
expect(getWritingCandidateStaleReason(candidate, current)).toBeNull()
expect(getWritingCandidateStaleReason(candidate, {
  ...current,
  nodes: [{ ...current.nodes[0], unitRevision: current.nodes[0].unitRevision + 1 }]
})).toBe('unit-revision-changed')
expect(getWritingCandidateStaleReason(candidate, {
  ...current,
  nodes: [{ ...current.nodes[0], nodeRevision: current.nodes[0].nodeRevision + 1 }]
})).toBe('node-revision-changed')
expect(getWritingCandidateStaleReason(candidate, { ...current, nodes: [] })).toBe('node-missing')
```

The new stale checker consumes `current.nodes`; it never treats a matching `unitId` without the requested `nodeId` as permission to replace a whole unit.

- [ ] **Step 2: Run the focused tests and verify v2 fields fail the new expectations**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: FAIL because annotations/candidates still expose `blockId` and `blockRevision`.

- [ ] **Step 3: Upgrade annotations to schema v3 without adding `targets[]`**

Set `ANNOTATION_SCHEMA_VERSION = 3`. New annotations store one `target` plus existing TextQuote/TextPosition context:

```js
{
  schemaVersion: 3,
  target: { unitId, unitRevision, nodeId, nodeRevision, start, end },
  selector: { start, end, exact, prefix, suffix },
  range: {
    start: { unitId, nodeId, offset },
    end: { unitId, nodeId, offset },
    exact,
    startSelector,
    endSelector
  }
}
```

`normalizeWritingAnnotation(annotation, chapterId, document)` must map legacy `blockId` to the v3 node whose `nodeId` equals that block ID, then derive `unitId` with `getWritingNodeLocation`. `reconcileWritingAnnotations(..., transition)` first follows stable `nodeId`, then uses `splitNode` metadata, then exact/prefix/suffix within the same unit, then the containing scene; zero or multiple matches produce `status: 'orphaned'`.

- [ ] **Step 4: Upgrade candidate patches to schema v3**

Set `WRITING_CANDIDATE_SCHEMA_VERSION = 3` and normalize every patch as:

```js
{
  unitId,
  unitRevision,
  nodeId,
  nodeRevision,
  baseText,
  replacement,
  targetRange,
  editorRange,
  rationale,
  lockedSegments
}
```

`getWritingCandidateStaleReason` checks, in order: chapter, document, missing unit, unit revision, missing node, node revision, base text, locked segments. Return stable reason codes such as `unit-missing`, `unit-revision-changed`, `node-missing`, and `node-revision-changed`. Do not map a missing node to the whole unit.

- [ ] **Step 5: Update editor decorations and Writing page consumers**

Replace block lookup maps with a node map whose value includes the enclosing unit:

```js
const nodePositions = new Map()
let currentUnit = null
doc.descendants((node, pos) => {
  if (node.type.name === 'writingUnit') currentUnit = { node, pos }
  if (node.attrs?.nodeId) nodePositions.set(node.attrs.nodeId, { node, pos, unit: currentUnit })
})
```

Rename bridge methods to `findNodeRange`, `focusNode`, `replaceNodeText`, and `replaceNodeRanges`. Update every `Writing.vue` issue, selection, annotation, candidate, review, and Agent-context path to pass both unit and node identity. Keep temporary input compatibility only inside normalizers; new requests must not emit `blockId`.

- [ ] **Step 6: Verify sidecar and patch contracts**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: PASS; v2 annotation fixtures migrate, ambiguous anchors orphan explicitly, and candidate acceptance remains one transaction/all-or-nothing.

- [ ] **Step 7: Commit the target migration slice**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions`.

```bash
git add src/services/writing/writingAnnotations.js shared/writingCandidateContract.js src/services/writing/writingCandidates.js src/components/writing/WritingNotebookEditor.vue src/pages/Writing.vue src/__tests__/integration.test.js
git commit -m "refactor(writing): target units and editor nodes"
```

## Task 4: Preserve the three recovery layers and migrate fragment history

**Files:**

- Modify: `shared/writingBlockHistoryContract.js`
- Modify: `src/services/writing/writingBlockHistory.js`
- Modify: `shared/writingSnapshotContract.js`
- Modify: `src/services/writing/writingSnapshots.js`
- Modify: `src/services/writing/writingRecovery.js`
- Modify: `src/pages/Writing.vue`
- Modify: `src/__tests__/integration.test.js`

- [ ] **Step 1: Add history/snapshot/recovery migration tests**

Add one test proving all three layers remain distinct:

```js
it('keeps editor undo, named snapshots, and unit fragment history separate in v3', () => {
  const before = createWritingDocument('甲。\n\n乙。')
  const after = structuredClone(before)
  after.revision += 1
  after.content[0].attrs.unitRevision += 1
  after.content[0].content[1].attrs.nodeRevision += 1
  after.content[0].content[1].content = [{ type: 'text', text: '乙，改。' }]

  const entries = buildWritingBlockHistoryEntries({ chapterId: 'c1', previousDocument: before, nextDocument: after })
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ unitId: before.content[0].attrs.unitId, nodeId: before.content[0].content[1].attrs.nodeId })

  const snapshot = createWritingSnapshot({ chapterId: 'c1', document: after, markdown: getWritingDocumentMarkdown(after) })
  expect(cloneWritingSnapshotDocument(snapshot)).toEqual(after)
  const recovery = createWritingSnapshot({ chapterId: 'c1', reason: 'crash-recovery', document: after, markdown: getWritingDocumentMarkdown(after) })
  expect(saveWritingRecoveryDraft(recovery)).toMatchObject({ ok: true })
  expect(listWritingRecoveryDrafts('c1')[0].editorDocument.schemaVersion).toBe(3)
})
```

Also feed a schema-v1 block-history entry and assert normalization maps `blockId` to `nodeId`, sets `unitId: null`, and labels it as a legacy fragment instead of dropping it.

- [ ] **Step 2: Run the focused tests and verify the old history shape fails**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js
```

Expected: FAIL because block history is v1 and flat-document traversal no longer finds nodes.

- [ ] **Step 3: Upgrade block history storage in place**

Keep `STORAGE_KEYS.WRITING_BLOCK_HISTORY` unchanged, set history schema version to 2, and emit:

```js
{
  schemaVersion: 2,
  unitId,
  unitKind,
  nodeId,
  nodeKind,
  previousText,
  currentText,
  fromDocumentRevision,
  toDocumentRevision,
  fromUnitRevision,
  toUnitRevision,
  fromNodeRevision,
  toNodeRevision,
  source,
  createdAt
}
```

Retain exported function names during this slice to avoid a broad storage-service rename, but change visible UI text from “块历史/块恢复” to “片段历史/片段恢复”. `buildWritingBlockHistoryEntries` must walk `unit.content`, match nodes by `nodeId`, and include only changed nodes.

- [ ] **Step 4: Normalize snapshots and crash drafts through v3 migration**

Keep snapshot schema version 1 because its payload is an opaque whole-document checkpoint. Keep `shared/writingSnapshotContract.js` independent of `src/`: its structural check accepts v2 and v3 payloads but does not import the client migration service. In `src/services/writing/writingSnapshots.js`, add and export:

```js
export function normalizeStoredWritingSnapshot(value, chapterId = null) {
  const snapshot = normalizeWritingSnapshot(value, chapterId)
  if (!snapshot) return null
  const editorDocument = migrateWritingDocumentToV3(snapshot.editorDocument, snapshot.markdown)
  if (!validateWritingDocument(editorDocument).valid) return null
  return { ...snapshot, editorDocument, documentRevision: Number(editorDocument.revision || 0) }
}

export function normalizeStoredWritingSnapshots(values, chapterId = null) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeStoredWritingSnapshot(value, chapterId))
    .filter(Boolean)
}
```

Use those service functions in `writingSnapshots.js` reads and in `writingRecovery.js`. Update `Writing.vue` to import `cloneWritingSnapshotDocument` through `writingSnapshots.js`, where it returns a clone of the already-migrated v3 payload. Do not merge snapshot and fragment-history budgets or storage keys.

- [ ] **Step 5: Update restore paths and visible wording**

In `Writing.vue`, locate fragments by `unitId + nodeId`; legacy entries with `unitId: null` may locate by `nodeId` only. Restoring a fragment creates the existing pre-restore snapshot, changes only the target node, and increments document/unit/node revisions.

- [ ] **Step 6: Verify storage budgets and recovery**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js src/__tests__/backupExport.test.js
```

Expected: PASS; storage budget tests remain bounded, old snapshots restore as v3, and backup export retains the complete `editorDocument`.

- [ ] **Step 7: Commit the recovery slice**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions`.

```bash
git add shared/writingBlockHistoryContract.js src/services/writing/writingBlockHistory.js shared/writingSnapshotContract.js src/services/writing/writingSnapshots.js src/services/writing/writingRecovery.js src/pages/Writing.vue src/__tests__/integration.test.js src/__tests__/backupExport.test.js
git commit -m "refactor(writing): migrate unit history and recovery"
```

## Task 5: Import one committed Experience assistant turn as one unit

**Files:**

- Create: `src/services/writing/writingExperienceImport.js`
- Modify: `src/components/experience/NarrativeTurn.vue`
- Modify: `src/components/GamePanel.vue`
- Modify: `src/pages/Experience.vue`
- Modify: `src/pages/Writing.vue`
- Modify: `src/__tests__/integration.test.js`
- Modify: `src/__tests__/gameStoreSession.test.js`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Add pure import contract tests**

Add tests for eligibility, source completeness, dedupe, and branch regeneration:

```js
it('appends one committed assistant turn as one traceable unit', () => {
  const books = [{ id: 'book-1', chapters: [{ id: 'chapter-1', content: '旧文。', contentFormat: 'md' }] }]
  const input = {
    books,
    bookId: 'book-1',
    chapterId: 'chapter-1',
    sessionId: 'session-1',
    branchId: 'main',
    worldbookId: 'world-1',
    turn: { id: 'turn-1', status: 'committed', assistantMessageIds: ['m1'] },
    messages: [{ id: 'm1', role: 'assistant', content: '风穿过门缝。\n\n她抬起头。' }]
  }
  const result = appendExperienceTurnToChapter(input)
  expect(result.ok).toBe(true)
  const imported = result.books[0].chapters[0].editorDocument.content.at(-1)
  expect(imported.type).toBe('writingUnit')
  expect(imported.content).toHaveLength(2)
  expect(imported.attrs.originRefs[0]).toEqual({
    type: 'experience-turn', sessionId: 'session-1', branchId: 'main', turnId: 'turn-1',
    messageId: 'm1', worldbookId: 'world-1', sourceRevision: 1
  })
  expect(appendExperienceTurnToChapter({ ...input, books: result.books }).reason).toBe('already-imported')
})
```

Add a second committed turn on another branch/message and assert it appends rather than replacing. Assert user, pending, failed, superseded, and non-current-branch turns return `ineligible-turn`.

- [ ] **Step 2: Run the tests and verify the missing service fails**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js src/__tests__/gameStoreSession.test.js
```

Expected: FAIL because `writingExperienceImport.js` does not exist.

- [ ] **Step 3: Implement the pure conversion and atomic book update**

Export these functions:

```js
export function getExperienceTurnImportEligibility({ turn, message, activeTurnIds })
export function createWritingUnitFromExperienceTurn(input)
export function appendExperienceTurnToChapter(input)
export function getWritingOriginFingerprint(originRef)
export function getExperienceOriginRoute(originRef)
```

`createWritingUnitFromExperienceTurn` must call `parseNarrativePresentation(message.content, { complete: true, messageId: message.id })`, turn each narration/dialogue/action/thought block into a child paragraph or blockquote, and assign a unique `nodeId`. Transport markers must not enter Markdown. `appendExperienceTurnToChapter` clones `books`, migrates the destination chapter to v3, checks exact origin fingerprints, appends one unit, increments document revision, updates `chapter.content`, `editorDocument`, `editorDocumentSchemaVersion`, `wordCount`, and `updatedAt`, and returns `{ ok, books, unitId }`. It must not call localStorage itself.

- [ ] **Step 4: Add the explicit import UI**

In `NarrativeTurn.vue`, show a text action `收进稿件` only when a prop `canCollectWriting` is true and emit `collect-writing`. `GamePanel.vue` derives eligibility from `gameStore.findTurnByMessageId(msg.id)` plus the current branch chain, and forwards `{ message, turn }` to `Experience.vue`.

In `Experience.vue`, reuse the existing modal visual language but create a focused destination dialog with:

- immutable preview of the selected assistant turn;
- book `<select>` and chapter `<select>` sourced from `STORAGE_KEYS.WRITING_BOOKS`;
- one primary `收进稿件` action and one cancel action;
- an empty-state link to `{ name: 'writing' }` when no chapter exists;
- success text containing destination book/chapter and a `去写作页查看` link.

Keep `{ bookId, chapterId }` only in the dialog's local Vue state. On each open, default to the first existing book/chapter and preserve the selection only until the dialog is closed. Do not add a storage key; the Experience authenticity branch exclusively owns `src/composables/useStorage.js` during this parallel run.

On confirmation, re-read `WRITING_BOOKS`, call the pure append function, and perform exactly one `setItem(WRITING_BOOKS, result.books)`. On storage failure, keep the dialog open and show `写入失败，原稿件未改变`.

- [ ] **Step 5: Add source display and backlink in Writing**

The current unit may show a short edge action only when `originRefs.length > 0`. Label it `来自体验` and route to:

```js
router.push({
  name: 'experience',
  query: { sessionId: ref.sessionId, messageId: ref.messageId }
})
```

Extend Experience bootstrap to honor `sessionId`, call `gameStore.loadSession(sessionId)` only when it exists, then scroll the matching visible message into view after render. Unknown/deleted sessions show a non-blocking `来源会话已不可用` status; they do not remove the origin ref.

- [ ] **Step 6: Verify import and UI contracts**

Run:

```bash
npm run test:run -- src/__tests__/integration.test.js src/__tests__/gameStoreSession.test.js src/__tests__/uiControlContract.test.js
```

Expected: PASS; exact duplicate import is blocked, regenerated branch import appends, only committed assistant turns expose the action, and the dialog has an accessible name and explicit destination controls.

- [ ] **Step 7: Commit the provenance slice**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions`.

```bash
git add src/services/writing/writingExperienceImport.js src/components/experience/NarrativeTurn.vue src/components/GamePanel.vue src/pages/Experience.vue src/pages/Writing.vue src/__tests__/integration.test.js src/__tests__/gameStoreSession.test.js src/__tests__/uiControlContract.test.js
git commit -m "feat(writing): collect experience turns into units"
```

## Task 6: Close the unit UI without introducing notebook cells

**Files:**

- Modify: `src/components/writing/WritingNotebookEditor.vue`
- Modify: `src/pages/Writing.vue`
- Modify: `src/__tests__/uiControlContract.test.js`
- Modify: `scripts/ui-audit.mjs`

- [ ] **Step 1: Add static UI ownership assertions**

Assert the editor contains unit operations and provenance hooks but no cell/runtime chrome:

```js
expect(notebookEditor).toContain('data-writing-unit')
expect(notebookEditor).toContain('splitWritingUnit')
expect(notebookEditor).toContain('mergeWritingUnit')
expect(notebookEditor).not.toMatch(/运行单元|执行序号|输出区|command mode/i)
expect(writingPage).toMatch(/从此处分开|与上一单元合并|来自体验/)
```

Keep this inside an existing UI contract test so the repository stays at 20 test files and no more than 200 cases.

- [ ] **Step 2: Run the UI contract and verify the missing controls fail**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js
```

Expected: FAIL on the absent unit operations/provenance text.

- [ ] **Step 3: Add subtle current-unit and provenance affordances**

Style `section[data-writing-unit]` as continuous prose: no border, card background, radius, shadow, sequence number, run button, or output slot. Only the active unit gets a 2px, 24px-high edge mark. A unit with provenance gets one quiet source action. Put split/merge/move in the existing context/command surface, not in a permanent toolbar.

Required CSS constraints:

```css
.writing-notebook-editor__surface [data-writing-unit] {
  position: relative;
  margin: 0;
  padding: 0;
}

.writing-notebook-editor__surface [data-writing-unit].is-current-writing-unit::before {
  content: "";
  position: absolute;
  inset-inline-start: -14px;
  top: 0.45em;
  width: 2px;
  height: 24px;
  background: color-mix(in srgb, var(--archive-olive) 68%, transparent);
}
```

At 390px and 200% effective zoom, move the marker inside the content gutter and keep all controls at least 44px high when they are rendered in a touch menu.

- [ ] **Step 4: Add deterministic WNB-6A UI audit state**

In `scripts/ui-audit.mjs`, seed one chapter with:

- one 12-paragraph passage unit;
- one source-bearing imported unit;
- one annotation and one candidate targeted to child nodes;
- enough content to scroll the active unit to the middle of the editor.

Capture Writing at 1440, 980, and 390 widths plus the existing 200%-zoom effective viewport. Assert zero horizontal overflow, zero console errors, zero a11y failures, and that command/source menus remain inside the viewport.

- [ ] **Step 5: Run focused and visual verification**

Run:

```bash
npm run test:run -- src/__tests__/uiControlContract.test.js
UI_AUDIT_STATES=writing-unit UI_AUDIT_ROUTES=writing UI_AUDIT_WIDTHS=1440,980,390 UI_AUDIT_OUTPUT=/tmp/pinax-wnb-6a npm run audit:ui
```

Expected: test PASS; audit produces the requested captures with 0 console errors, 0 a11y failures, and no horizontal overflow. Inspect every screenshot, including the 200% effective-width capture, before proceeding.

- [ ] **Step 6: Commit the UI closure**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions`.

```bash
git add src/components/writing/WritingNotebookEditor.vue src/pages/Writing.vue src/__tests__/uiControlContract.test.js scripts/ui-audit.mjs
git commit -m "feat(writing): expose subtle unit controls"
```

## Task 7: Run release gates and write the branch handoff

**Files:**

- Create: `docs/agent-runs/2026-08-17-wnb-experience-parallel/wnb-6a-summary.md`
- Verify: all files changed by Tasks 1–6

- [ ] **Step 1: Run the contract/build/docs gate**

Invoke `testing-verification`, then run:

```bash
npm run verify:full
```

Expected: exit 0; Vitest reports no more than 20 test files / 200 tests, Vite build succeeds, `git diff --check` succeeds, and VitePress build succeeds.

- [ ] **Step 2: Run the WNB-6A manual transaction matrix**

Using the existing dev server without restarting it, verify and record:

1. Type 20 paragraphs with Enter: one `unitId`, 20 child paragraphs.
2. Shift+Enter: soft break, no new node or unit.
3. Split in the middle of a paragraph: two units; left retains unit/node IDs; right gets new IDs; one Undo restores exact text and structure.
4. Merge two source-bearing units: one unit; source refs are a de-duplicated union; one Undo restores both units.
5. Move a unit up/down: text and revisions unchanged; one Undo restores order.
6. Compose Chinese with IME around command-menu triggers: no premature command execution or lost composition text.
7. Annotation across split/merge: exact migration or explicit orphan; never silently attaches to another quote.
8. Candidate target: node-scoped adoption only; stale unit/node revision rejects the entire candidate.
9. Import a committed assistant turn, re-import it, then import a regenerated branch: append / duplicate rejection / append.
10. Follow `来自体验`: correct session/message or explicit unavailable-source notice.
11. Restore a named snapshot and a fragment-history entry independently.
12. Load/save a 100k-character chapter and inspect interaction latency; no frozen input or data loss.

Expected: all 12 rows pass. Any failure blocks status/doc completion claims.

- [ ] **Step 3: Write the WNB branch handoff**

Create `docs/agent-runs/2026-08-17-wnb-experience-parallel/wnb-6a-summary.md` with: branch name, baseline commit, final commit, commit range, changed-file list, v2-to-v3 migration rule, automated test counts, build/docs results, UI-audit capture directory, all 12 manual-matrix outcomes, and any known integration concern. Keep it below 120 lines and do not copy command logs.

Do not edit canonical status/plan/log/roadmap files in this branch. Do not claim that list/task-list/fenced-code support or multi-target annotations shipped in this slice.

- [ ] **Step 4: Verify the documentation handoff**

Run:

```bash
npm run verify:full
git status --short
git log --oneline --max-count=8
```

Expected: `verify:full` exits 0; status contains only intended WNB-6A files plus its unique summary; the log shows scoped incremental commits and no unrelated files.

- [ ] **Step 5: Commit the handoff**

Invoke `commit-conventions`.

```bash
git add docs/agent-runs/2026-08-17-wnb-experience-parallel/wnb-6a-summary.md
git commit -m "docs(writing): record writing unit v3 handoff"
```

After this commit, stop and hand the branch to the integration owner. Do not merge the Experience branch or update shared product docs from this worker.

## Stop conditions

Stop and report instead of broadening the implementation when any of these occurs:

- the intended base commit does not contain the current WNB provider/editor fixes;
- a v2 chapter cannot round-trip to identical publication Markdown;
- v2 annotations cannot map uniquely and are not explicitly marked orphaned;
- split/merge requires more than one undo step or loses marks/content;
- Experience import would require mutating failed/pending/non-current-branch turns;
- localStorage rejects the atomic `WRITING_BOOKS` update;
- test count would exceed 200 without first consolidating superseded cases;
- UI closure requires a card/cell runtime or a second editor surface.

## Completion definition

WNB-6A is complete only when all of the following are true:

- every persisted chapter saves as schema v3 after its next normal save;
- no active editor/annotation/candidate/history path emits new `blockId` targets;
- Enter creates nodes inside a stable unit, while explicit unit operations are one-transaction undoable;
- old Markdown, v2 documents, annotations, snapshots, and history remain readable without silent loss;
- one committed Experience assistant turn imports as one traceable unit and exact duplicates do not append;
- normal prose has no notebook-cell chrome;
- 100k text, Chinese IME, 1440/980/390, and 200% zoom gates pass;
- `npm run verify:full` exits 0 and the WNB branch summary records only verified, shipped behavior; canonical handoff docs remain untouched until combined integration.
