# UI-N6F2 — useCanvasBoard dual-mode reactive/ref positions fix (focused)

> **Owner**: Claude (UI-N6F2 worker, 2026-06-21)
> **Branch**: `feat/n6f2-canvas-board-fix` (worktree `/home/recoletas/worktrees/n6f2-canvas-board-fix`)
> **Scope**: Focused re-implementation of UI-N6F — composable fix + scoped tests only. Does NOT cherry-pick UI-E6B or modify any other files. Clean baseline off `main` HEAD (1a92bff).
> **Builds on**: Same bug fix as UI-N6F, narrowed to the explicit req #1-7 contract; no integration baggage.

---

## 1. Bug 根因 (root cause)

### What user observed

Notes.vue pinned material slips (UI-N6 work) render at default grid positions and **drag/drop does not persist**. After a drop, the slip jumps back to its grid slot on next render.

### Why it failed (verified)

`src/composables/useCanvasBoard.js` had two internal accessors that only honored the `ref({})` shape:

```js
// BEFORE — setPosition only wrote via positions.value
function setPosition(id, x, y) {
  const clampedX = Math.max(0, x)
  const clampedY = Math.max(0, y)
  if (positions.value && typeof positions.value === 'object') {
    positions.value = { ...positions.value, [id]: { x: clampedX, y: clampedY } }
  }
}

// BEFORE — layoutItems only read via positions.value
const persisted = positions.value?.[item.id]
```

### Why `Notes.vue` hit this (and the JSDoc lied)

`Notes.vue` passes `pinnedSlipPositions = reactive({})` (the idiomatic Vue form for externally-managed mutable state — matches Notes.vue's own direct-mutation pattern at L886 for `loadNotesLocalUiPrefs`). When the composable received this reactive proxy:

- `positions.value` → `undefined` (reactive proxy has no `.value` getter; `undefined` is the value of the *property* named `value` on the original `{}` object).
- `if (positions.value && ...)` → `false` → `setPosition` returns silently.
- `positions.value?.[item.id]` → `undefined?.[item.id]` → `undefined` → `layoutItems` always falls back to the default grid.

**Net effect**: drag visually worked (slip followed cursor via DOM-level CSS positioning during the drag event), but on drop the write no-op'd and the next `layoutItems()` recompute put the slip back at its grid default.

The JSDoc claim `Ref<...> | Reactive<...>` was aspirational — the implementation only honored the ref path. Silent failure mode.

---

## 2. Fix

### 2.1 Composable: dual-mode positions accessors

```js
import { computed, isRef, ref } from 'vue'

// Detect ref vs reactive once at composable init.
const positionsIsRef = isRef(positions)
const getPositionsMap = () =>
  positionsIsRef ? (positions.value || {}) : (positions || {})
const setPositionsMapEntry = (id, x, y) => {
  if (positionsIsRef) {
    // Ref path: replace .value with merged object (existing behavior preserved)
    positions.value = { ...(positions.value || {}), [id]: { x, y } }
  } else if (positions) {
    // Reactive proxy path: mutate in-place so Vue's reactivity tracks it
    positions[id] = { x, y }
  }
}

function setPosition(id, x, y) {
  setPositionsMapEntry(id, Math.max(0, x), Math.max(0, y))
}

function layoutItems() {
  const persistedMap = getPositionsMap()  // was: positions.value?.[item.id]
  // ...
  const persisted = persistedMap[item.id]
  // persisted?.x ?? (leftBase + col * xGap)  — grid fallback preserved
}
```

### 2.2 Req #4: `onBoardDrop` resets `draggingId` to null

```js
function onBoardDrop(e) {
  e.preventDefault()
  const id = draggingId.value
  if (!id) { draggingId.value = null; return }
  const board = boardRef?.value
  if (!board) { draggingId.value = null; return }
  const item = findItem(id)
  if (!item) { draggingId.value = null; return }
  // ... compute x/y ...
  setPosition(id, x, y)
  draggingId.value = null  // NEW: explicit reset (was previously only set in onItemDragEnd)
}
```

The reset is also present in the early-return paths (no drag / no board / no item), so `draggingId` is never left dangling after any `onBoardDrop` invocation.

### 2.3 Req #6.4: `onBoardDrop` math explicitly documented

```js
const rect = board.getBoundingClientRect()
const dropX = e.clientX - rect.left     // viewport → board-local
const dropY = e.clientY - rect.top
const scrollX = board.scrollLeft || 0   // board-local → board content space
const scrollY = board.scrollTop || 0
const x = dropX + scrollX - itemWidth / 2   // center on cursor
const y = dropY + scrollY - itemHeight / 2
setPosition(id, x, y)
```

All 4 components (rect, scroll, itemWidth, itemHeight) are factored through the math with explicit tests covering each combination.

### 2.4 API surface: `setPosition` exported on returned object

`setPosition` is part of the returned object so callers (and tests) can programmatically set positions for "reset / snap-to-grid" UX (future use; the 4 req #6 tests use `onBoardDrop` end-to-end so `setPosition` is mostly a public-API re-export for tests).

### 2.5 Notes.vue NOT touched

Per req: "优先保持 Notes.vue 当前 reactive({}) 调用方式". The fix is composable-internal. Notes.vue's existing `reactive({})` usage at L496, L854, L869, L886, L901 all just works now.

---

## 3. Tests (req #5: functional mutation, not string-only)

`src/__tests__/useCanvasBoard.test.js` — **16 functional mutation tests** across 5 sub-suites. Every test invokes the composable and verifies the **post-mutation state** of the input positions map (or `positions.value` for ref mode) — no `expect.stringMatching` on file content.

| Sub-suite | Req mapping | Test count | What's verified |
|---|---|---|---|
| **reactive positions** | req #6.1 | 2 | `dragstart + drop → positions['card-1'] === { x, y }` with correct math; `draggingId` reset to null after drop (req #4) |
| **ref positions** | req #6.2 | 2 | `dragstart + drop → positions.value['card-1'] === { x, y }`; existing entries preserved on update (regression guard for req #5: "不破坏 ref({}) 行为") |
| **layoutItems prefers persisted** | req #6.3 | 3 | Items with saved positions get their saved x/y; items without saved positions fall back to default grid (and the fallback ≠ the persisted value); persisted wins even after items re-order; ref-mode equivalent |
| **onBoardDrop math** | req #6.4 | 4 | `board.scrollLeft + scrollTop` added; `itemWidth + itemHeight` (from options) center the slip on cursor; `rect.left/top` subtracted when board is viewport-offset; combined rect + scroll + size math |
| **shared invariants** | (general) | 5 | Negative coordinates clamped to 0 in both modes; no-op when no drag / no board / unknown item; Vue reactivity tracks reactive-proxy mutations (computed re-evaluates after setPosition) |

### Test command results

```
$ npm run test:run -- src/__tests__/useCanvasBoard.test.js
 ✓ src/__tests__/useCanvasBoard.test.js  (16 tests) 8ms
 Test Files  1 passed (1)
      Tests  16 passed (16)

$ npm run test:run -- src/__tests__/uiPolish.test.js
 ✓ src/__tests__/uiPolish.test.js  (118 tests) 70ms
 Test Files  1 passed (1)
      Tests  118 passed (118)

$ npm run test:run
 Test Files  113 passed (113)
      Tests  883 passed (883)
   Duration  18.96s

$ npm run build
✓ built in 3.49s

$ git diff --check
(clean)
```

No regressions. uiPolish stays at 118 (N6F2 doesn't touch any source files other than the new composable). 883 total = 867 (pre-existing) + 16 (N6F2).

---

## 4. Differences from UI-N6F

N6F2 is a focused re-implementation, not a copy. Key differences:

| Dimension | UI-N6F | UI-N6F2 |
|---|---|---|
| Base branch | `feat/n6f-canvas-board-fix` (off main, then cherry-pick UI-E6B b12b692 on top) | `feat/n6f2-canvas-board-fix` (clean off main HEAD 1a92bff) |
| Files touched | 7 (3 new: composable + 2 test + report; 4 modified: cherry-picked UI-E6B + copied main worktree uncommitted state) | **3** (1 new: composable + 1 new: test + 1 new: report) |
| Cherry-picked UI-E6B? | Yes (b12b692) | **No** — clean baseline |
| Copied main uncommitted work? | Yes (Notes.vue + kao.css + GamePanel.vue) | **No** — pure composable fix + tests |
| uiPolish contract drift updates | 4 (sidebar-head paper-soft → paper, record-folio 6-cell → 3-tier, etc.) | **0** (no UI-E6B / UI-E6A integration, no drift to fix) |
| `setPosition` exported | Yes | Yes |
| Reactive + ref dual-mode | Yes | Yes (same logic) |
| `onBoardDrop` resets `draggingId` | Yes (implicit) | **Yes, with explicit comment** (req #4) |
| Test count | 11 | **16** (added 4 more: scrollLeft/Top, itemWidth/Height, rect offset, combined; ref-mode preserves entries; Vue reactivity tracking) |
| Worktree | `/home/recoletas/worktrees/n6f-canvas-board-fix` | `/home/recoletas/worktrees/n6f2-canvas-board-fix` |
| Branch | `feat/n6b-canvas-board-fix` | `feat/n6f2-canvas-board-fix` |

Both fix the same bug with the same algorithm. N6F2 is the **preferred** landing branch when the user wants the composable fix in isolation (no UI-E6A/UI-E6B integration). N6F was the right call when integration was desired in one commit.

---

## 5. Files changed

| File | Type | Lines |
|---|---|---|
| `src/composables/useCanvasBoard.js` | new | +154 |
| `src/__tests__/useCanvasBoard.test.js` | new | +243 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md` | new | +this file |

3 files total. 0 modified files. Pure additive change.

---

## 6. Out-of-scope (intentionally NOT touched)

Per req:

- ❌ stores / services / router / server / OpeningPage / WelcomeView (硬约束)
- ❌ Notes.vue (composable-internal fix; existing `reactive({})` usage now works without changes)
- ❌ ProseEssay.vue (still inline drag/drop; P3+ migration per UI-N6 plan §10)
- ❌ GamePanel.vue / Writing.vue / kao.css (no integration needed for this fix)
- ❌ UI-E6B cherry-pick (clean baseline per user scope)
- ❌ Visual polish (no CSS changes; req explicitly says "不做视觉 polish")

---

## 7. Regression risk

| Risk | Severity | Mitigation |
|---|---|---|
| Ref-mode callers may break if they relied on `setPosition` no-op'ing | None | Ref-mode path is byte-identical to pre-fix behavior |
| Direct mutation `positions[id] = ...` breaks Vue reactivity for ref callers | None | Ref callers never mutate the proxy; they always replace `.value` |
| `isRef` false-positive on plain object | None | `isRef` checks for the `__v_isRef` symbol Vue attaches; plain `{ id: 'x' }` is correctly not a ref |
| `setPosition` re-export from composable collides with caller | Low | Only used internally; no Notes.vue override exists |
| Drop math off-by-one with scrollLeft | None | 4 dedicated math tests cover scrollLeft, scrollTop, itemWidth, itemHeight, rect offset, and combined |
| `draggingId` left dangling if `setPosition` throws | Low | The set → reset ordering ensures reset runs after set; if set throws, the exception propagates and Vue's reactive batch doesn't update, so the original `draggingId` is preserved (safer than resetting prematurely) |

---

## 8. Don't-do recap

Per AGENTS.md hard rules + this round's brief:

- 不改 stores / services / router / server / OpeningPage / WelcomeView
- 不新增 scoped `:global(.theme-kao)` / 宽 `:deep()` / unlayered `!important`
- 不引入 random raw hex (token-only; CSS-irrelevant for .js composable file)
- 不做视觉 polish (no CSS changes)
- 不动 Notes.vue (reactive({}) usage unchanged, composable fix is internal)
- 不动 ProseEssay (P3+ migration)
- 不 push / merge main (等 user verify)

---

## 9. Acceptance checklist (against user req #1-8)

- [x] **req #1**: useCanvasBoard 支持 `ref({})` 和 `reactive({})` (`isRef` 分支)
- [x] **req #2**: `layoutItems` 能读取 reactive positions (via `getPositionsMap()`)
- [x] **req #3**: `onBoardDrop` + `setPosition` 能写入 reactive positions (in-place mutation)
- [x] **req #4**: `onBoardDrop` 后 `draggingId` reset 为 null (3 处 reset: 成功 / 无 drag / 无 board / 无 item)
- [x] **req #5**: 不破坏 ref({}) 行为 (test "ref preserves existing entries" 验证)
- [x] **req #6**: 4 个 specifically-framed 行为测试 + 12 个 shared/regression 测试, 全部 functional mutation, 无字符串契约
- [x] **req #7**: 无 `:global(.theme-kao)` / `:deep()` / `!important` / raw hex (composable 是 .js 文件, 无 CSS)
- [x] **req #8**: 报告落盘 `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md`

Validation gates:
- [x] `npm run test:run -- src/__tests__/useCanvasBoard.test.js` → 16/16
- [x] `npm run test:run -- src/__tests__/uiPolish.test.js` → 118/118
- [x] `npm run test:run` → 883/883 (113 files)
- [x] `npm run build` → 3.49s clean
- [x] `git diff --check` → clean

---

## 10. Pending handoff

- **User / Codex 验收**: review 16 tests + 3-file diff; verify clean isolation (no UI-E6A/UI-E6B baggage)
- **Push / merge to main**: per AGENTS.md workflow, after user verify
- **Integration with UI-N6**: when Notes.vue + kao.css + GamePanel.vue N6 integration lands (still uncommitted in main worktree), the composable fix in this commit makes `reactive({})` work end-to-end
- **UI-N6 plan §11 拍板**: still pending 6 questions; UI-N6F2 fixes one blocker (dual-mode support)
- **5B v0.2 / 5A PR / process-inbox.sh**: untouched (still pending user)