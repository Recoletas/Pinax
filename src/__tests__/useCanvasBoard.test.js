/**
 * UI-N6F2: useCanvasBoard dual-mode positions — functional mutation tests.
 *
 * Bug context (verified): prior implementation of useCanvasBoard only
 * handled the `ref({})` path for positions (it did `positions.value = ...`).
 * When Notes.vue passes `reactive({})` (a Vue proxy, no `.value`),
 * `positions.value` returned `undefined` so the write was a silent
 * no-op and `layoutItems()` always fell back to the grid default —
 * pinned slips rendered but drag/drop did not persist coordinates.
 *
 * Fix: useCanvasBoard now detects ref vs reactive via Vue's `isRef`
 * helper and writes through the correct accessor for each.
 *
 * These tests exercise BOTH paths with real mutation (no string-only
 * assertions) so the bug cannot regress without these tests failing.
 *
 * Coverage map (against UI-N6F2 req #6):
 *   - reactive positions: dragstart + board drop updates positions[itemId]   ← "1"
 *   - ref positions:       dragstart + board drop updates positions.value[itemId]   ← "2"
 *   - layoutItems prefers persisted positions over default grid   ← "3"
 *   - onBoardDrop considers scrollLeft/scrollTop + itemWidth/itemHeight   ← "4"
 *   - onBoardDrop resets draggingId to null (req #4)   ← inline assertion in each drop test
 *   - ref mode behavior not broken (regression guard)   ← "ref preserves existing entries"
 */
import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { useCanvasBoard } from '../composables/useCanvasBoard'

// ─── fixtures ──────────────────────────────────────────────────────────

/**
 * Stand-in for the real DOM board element. The composable only calls
 * 4 properties on it: `getBoundingClientRect`, `scrollLeft`, `scrollTop`,
 * `clientWidth`. All overridable per-test.
 */
function fakeBoard(overrides = {}) {
  return {
    clientWidth: 1024,
    clientHeight: 768,
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: () => ({
      left: 0, top: 0, right: 1024, bottom: 768, width: 1024, height: 768,
    }),
    ...overrides,
  }
}

/**
 * Minimal DragEvent stub — only the properties the composable touches.
 * preventDefault / dataTransfer.setData are no-ops; dataTransfer is
 * present so `e?.dataTransfer?.effectAllowed = 'move'` works.
 */
function fakeDragEvent({ clientX = 0, clientY = 0 } = {}) {
  return {
    clientX,
    clientY,
    preventDefault: () => {},
    dataTransfer: { setData: () => {}, effectAllowed: '', dropEffect: '' },
  }
}

const FAKE_ITEM = { id: 'card-1' }

// ─── req #6.1: reactive positions ──────────────────────────────────────

describe('UI-N6F2: useCanvasBoard — reactive positions (Notes.vue pattern)', () => {
  it('dragstart + board drop writes positions[itemId] = expected x/y', () => {
    const positions = reactive({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
      itemWidth: 200,
      itemHeight: 100,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent({ clientX: 250, clientY: 180 }))
    board.onBoardDrop(fakeDragEvent({ clientX: 250, clientY: 180 }))

    // dropX = 250 - 0 = 250; scrollX = 0; itemWidth/2 = 100 → x = 150
    // dropY = 180 - 0 = 180; scrollY = 0; itemHeight/2 = 50  → y = 130
    expect(positions['card-1']).toEqual({ x: 150, y: 130 })
  })

  it('onBoardDrop resets draggingId to null after a successful drop', () => {
    const positions = reactive({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    expect(board.draggingId.value).toBe('card-1')

    board.onBoardDrop(fakeDragEvent({ clientX: 100, clientY: 100 }))
    expect(board.draggingId.value).toBeNull()
  })
})

// ─── req #6.2: ref positions ──────────────────────────────────────────

describe('UI-N6F2: useCanvasBoard — ref positions (alternative pattern)', () => {
  it('dragstart + board drop writes positions.value[itemId] = expected x/y', () => {
    const positions = ref({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
      itemWidth: 220,
      itemHeight: 120,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent({ clientX: 300, clientY: 200 }))
    board.onBoardDrop(fakeDragEvent({ clientX: 300, clientY: 200 }))

    // dropX = 300 - 0 = 300; itemWidth/2 = 110 → x = 190
    // dropY = 200 - 0 = 200; itemHeight/2 = 60  → y = 140
    expect(positions.value['card-1']).toEqual({ x: 190, y: 140 })
  })

  it('ref mode preserves existing entries on update (merge, not replace)', () => {
    const positions = ref({ 'card-0': { x: 1, y: 2 } })
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([{ id: 'card-1' }]),
      positions,
    })

    board.onItemDragStart({ id: 'card-1' }, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent({ clientX: 100, clientY: 100 }))

    // dropX = 100; itemWidth/2 = 110 → x = -10 → clamps to 0
    // dropY = 100; itemHeight/2 = 60  → y = 40
    expect(positions.value).toEqual({
      'card-0': { x: 1, y: 2 },
      'card-1': { x: 0, y: 40 },
    })
  })
})

// ─── req #6.3: layoutItems prefers persisted positions ────────────────

describe('UI-N6F2: useCanvasBoard — layoutItems prefers persisted positions', () => {
  it('returns persisted x/y for items that have a saved position (reactive)', () => {
    const positions = reactive({})
    const board = useCanvasBoard({
      boardRef: ref(null),
      items: ref([FAKE_ITEM, { id: 'card-2' }, { id: 'card-3' }]),
      positions,
    })

    board.setPosition('card-1', 88, 99)
    board.setPosition('card-3', 12, 34)

    const laid = board.layoutItems()
    const byId = Object.fromEntries(laid.map((i) => [i.id, i]))

    expect(byId['card-1']).toMatchObject({ x: 88, y: 99 })
    expect(byId['card-3']).toMatchObject({ x: 12, y: 34 })
    // card-2 has no persisted position → falls back to default grid (not 88 / 12)
    expect(typeof byId['card-2'].x).toBe('number')
    expect(byId['card-2'].x).not.toBe(88)
    expect(byId['card-2'].x).not.toBe(12)
  })

  it('returns persisted x/y for items that have a saved position (ref)', () => {
    const positions = ref({})
    const board = useCanvasBoard({
      boardRef: ref(null),
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.setPosition('card-1', 50, 60)
    const laid = board.layoutItems()

    expect(laid[0]).toMatchObject({ x: 50, y: 60 })
  })

  it('persisted position overrides the default grid even when items re-order', () => {
    const positions = reactive({ 'card-1': { x: 100, y: 200 } })
    const items = ref([{ id: 'card-1' }])
    const board = useCanvasBoard({
      boardRef: ref(null),
      items,
      positions,
    })

    // Re-render twice; persisted should still win.
    expect(board.layoutItems()[0]).toMatchObject({ x: 100, y: 200 })
    items.value = [{ id: 'card-1' }, { id: 'card-2' }]
    expect(board.layoutItems()[0]).toMatchObject({ x: 100, y: 200 })
  })
})

// ─── req #6.4: onBoardDrop math — scrollLeft/Top + itemWidth/Height ───

describe('UI-N6F2: useCanvasBoard — onBoardDrop math (scrollLeft/Top + itemWidth/Height)', () => {
  it('adds board.scrollLeft + board.scrollTop to drop coordinates', () => {
    const boardRef = ref(fakeBoard({ scrollLeft: 100, scrollTop: 50 }))
    const positions = reactive({})
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent({ clientX: 200, clientY: 150 }))

    // dropX = 200 - 0 = 200; + scrollX 100 - itemWidth/2 110 = 190
    // dropY = 150 - 0 = 150; + scrollY 50  - itemHeight/2 60  = 140
    expect(positions['card-1']).toEqual({ x: 190, y: 140 })
  })

  it('uses itemWidth / itemHeight (from options) to center the item on cursor', () => {
    const positions = reactive({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
      itemWidth: 400,
      itemHeight: 200,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent({ clientX: 500, clientY: 300 }))

    // dropX = 500 - 0 = 500; itemWidth/2 = 200 → x = 300
    // dropY = 300 - 0 = 300; itemHeight/2 = 100 → y = 200
    expect(positions['card-1']).toEqual({ x: 300, y: 200 })
  })

  it('subtracts board.getBoundingClientRect left/top when board is viewport-offset', () => {
    const boardRef = ref(fakeBoard({
      getBoundingClientRect: () => ({
        left: 200, top: 100, right: 1224, bottom: 868, width: 1024, height: 768,
      }),
    }))
    const positions = reactive({})
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    // clientX 450 = rect.left 200 + board-local 250
    // clientY 250 = rect.top 100  + board-local 150
    board.onBoardDrop(fakeDragEvent({ clientX: 450, clientY: 250 }))

    // dropX = 450 - 200 = 250; - itemWidth/2 110 → x = 140
    // dropY = 250 - 100 = 150; - itemHeight/2 60  → y = 90
    expect(positions['card-1']).toEqual({ x: 140, y: 90 })
  })

  it('combines rect offset + scroll + size options correctly', () => {
    const boardRef = ref(fakeBoard({
      scrollLeft: 40,
      scrollTop: 20,
      getBoundingClientRect: () => ({
        left: 50, top: 30, right: 1074, bottom: 798, width: 1024, height: 768,
      }),
    }))
    const positions = reactive({})
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
      itemWidth: 100,
      itemHeight: 60,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent({ clientX: 300, clientY: 200 }))

    // dropX = 300 - 50 = 250; + scrollX 40 - itemWidth/2 50 = 240
    // dropY = 200 - 30 = 170; + scrollY 20 - itemHeight/2 30 = 160
    expect(positions['card-1']).toEqual({ x: 240, y: 160 })
  })
})

// ─── shared invariants (both modes) ────────────────────────────────────

describe('UI-N6F2: useCanvasBoard — shared invariants', () => {
  it('setPosition clamps negative coordinates to 0 (both modes)', () => {
    const reactivePos = reactive({})
    const refPos = ref({})
    const r = useCanvasBoard({ boardRef: ref(null), items: ref([]), positions: reactivePos })
    const refB = useCanvasBoard({ boardRef: ref(null), items: ref([]), positions: refPos })

    r.setPosition('a', -100, -50)
    refB.setPosition('b', -10, -20)

    expect(reactivePos.a).toEqual({ x: 0, y: 0 })
    expect(refPos.value.b).toEqual({ x: 0, y: 0 })
  })

  it('onBoardDrop is a no-op when no item is being dragged', () => {
    const positions = reactive({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onBoardDrop(fakeDragEvent({ clientX: 200, clientY: 200 }))

    expect(positions['card-1']).toBeUndefined()
    expect(board.draggingId.value).toBeNull()
  })

  it('onBoardDrop is a no-op when boardRef has no element', () => {
    const positions = reactive({})
    const boardRef = ref(null)
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onItemDragStart(FAKE_ITEM, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent())

    expect(positions['card-1']).toBeUndefined()
    expect(board.draggingId.value).toBeNull()
  })

  it('onBoardDrop is a no-op when dragged item is not in items list', () => {
    const positions = reactive({})
    const boardRef = ref(fakeBoard())
    const board = useCanvasBoard({
      boardRef,
      items: ref([FAKE_ITEM]),
      positions,
    })

    board.onItemDragStart({ id: 'unknown' }, fakeDragEvent())
    board.onBoardDrop(fakeDragEvent())

    expect(positions).toEqual({})
    expect(board.draggingId.value).toBeNull()
  })

  it('Vue reactivity tracks in-place mutation on reactive positions', async () => {
    const { nextTick } = await import('vue')
    const positions = reactive({})
    const board = useCanvasBoard({
      boardRef: ref(null),
      items: ref([]),
      positions,
    })

    let observed = null
    const watch = (await import('vue')).computed(() =>
      (observed = positions.a ? { ...positions.a } : null)
    )
    // Prime the computed so it subscribes to positions.a.
    void watch.value

    board.setPosition('a', 7, 14)
    await nextTick()
    void watch.value

    expect(observed).toEqual({ x: 7, y: 14 })
  })
})