import { computed, isRef, ref } from 'vue'

/**
 * UI-N6 / UI-N6F2: Free-placement canvas board composable.
 *
 * Extracted from src/pages/ProseEssay.vue L1790-1881
 * (onCardDragStart/Over/End + onCardWallDragOver/Drop) and L810-881
 * (layoutCards, simplified to drop pile support — Notes has no pile
 * concept). Used by Notes.vue to let users pin 1-3 material slips next
 * to the active card and drag them to free positions.
 *
 * ProseEssay keeps its own inline implementation (it has piles + edges
 * that this composable doesn't model); a future P3+ pass can migrate
 * ProseEssay onto the same composable.
 *
 * positions input supports BOTH `ref({})` and `reactive({})` forms.
 * Earlier the composable only handled the ref path (`positions.value
 * = ...`) and silently no-op'd on reactive inputs (reactive has no
 * .value, so `positions.value === undefined` and the write was
 * skipped). We detect via `isRef` and:
 *   - ref: replace `positions.value` with a new merged object
 *   - reactive: mutate the proxy in-place so Vue tracks it
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.boardRef
 *   Template ref to the drag container (e.g. reading-deck). Must be a
 *   positioned element (relative / absolute) so absolute children can
 *   use left/top in the board's coord space.
 * @param {import('vue').Ref<Array<{id:string}>>|import('vue').ComputedRef<Array<{id:string}>>} options.items
 *   Items to render on the board. Each must have an `id` (string).
 *   Optional `x`, `y` (numbers, board-local px). If x/y missing, layout
 *   assigns grid positions.
 * @param {import('vue').Ref<Record<string,{x:number,y:number}>>|import('vue').Reactive<Record<string,{x:number,y:number}>>} options.positions
 *   Persistent positions map keyed by item.id. Either `reactive({})`
 *   (default Vue idiom for externally-managed mutable state) or
 *   `ref({})` — both forms supported.
 * @param {(item:object, e:DragEvent) => void} [options.onItemDragStart]
 *   Optional callback fired when user starts dragging an item.
 * @param {(item:object) => void} [options.onItemClick]
 *   Optional click handler (used by Notes to set selectedChapterId).
 * @param {number} [options.itemWidth=220] Width used to center the drop
 *   point on cursor (subtract half-width from dropX).
 * @param {number} [options.itemHeight=120] Height used to center the drop
 *   point on cursor (subtract half-height from dropY).
 * @returns {{
 *   draggingId: import('vue').Ref<string|null>,
 *   isDragging: import('vue').ComputedRef<boolean>,
 *   onItemDragStart: (item:object, e:DragEvent) => void,
 *   onItemDragOver: (item:object, e:DragEvent) => void,
 *   onItemDragEnd: () => void,
 *   onBoardDragOver: (e:DragEvent) => void,
 *   onBoardDrop: (e:DragEvent) => void,
 *   layoutItems: () => Array<object>,
 *   styleFor: (item:object) => object,
 *   setPosition: (id:string, x:number, y:number) => void,
 * }}
 */
export function useCanvasBoard(options) {
  const {
    boardRef,
    items,
    positions,
    itemWidth = 220,
    itemHeight = 120,
  } = options

  const draggingId = ref(null)
  const isDragging = computed(() => draggingId.value !== null)

  // UI-N6F2: dual-mode positions accessors.
  // isRef(positions) → ref path: read/write positions.value
  // otherwise → reactive proxy path: positions[id] = ... (in-place mutation)
  const positionsIsRef = isRef(positions)
  const getPositionsMap = () =>
    positionsIsRef ? (positions.value || {}) : (positions || {})
  const setPositionsMapEntry = (id, x, y) => {
    if (positionsIsRef) {
      positions.value = { ...(positions.value || {}), [id]: { x, y } }
    } else if (positions) {
      // Reactive proxy — mutate in place so Vue's reactivity tracks it.
      positions[id] = { x, y }
    }
  }

  function findItem(id) {
    const list = typeof items === 'function' ? items() : items.value
    return list?.find((i) => i.id === id) || null
  }

  function setPosition(id, x, y) {
    setPositionsMapEntry(id, Math.max(0, x), Math.max(0, y))
  }

  function onItemDragStart(item, e) {
    if (!item?.id) return
    draggingId.value = item.id
    if (e?.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', item.id)
      } catch (err) {
        // some browsers throw on empty setData in certain contexts; safe to ignore
      }
    }
    options.onItemDragStart?.(item, e)
  }

  function onItemDragOver(item, e) {
    if (!draggingId.value || !item || draggingId.value === item.id) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function onItemDragEnd() {
    draggingId.value = null
  }

  function onBoardDragOver(e) {
    if (!draggingId.value) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function onBoardDrop(e) {
    e.preventDefault()
    const id = draggingId.value
    if (!id) {
      draggingId.value = null
      return
    }
    const board = boardRef?.value
    if (!board) {
      draggingId.value = null
      return
    }
    const item = findItem(id)
    if (!item) {
      draggingId.value = null
      return
    }
    // Translate viewport coords (e.clientX/Y) to board-local coords:
    //   drop point in viewport = clientX/Y
    //   drop point relative to board = clientX/Y - rect.left/top
    //   drop point in board content space = above + scrollLeft/Top
    //     (scroll offset is added so positions are stable when the board
    //     scrolls — pinned slips don't drift when the user scrolls the
    //     board underneath them)
    // Then center the item on the cursor using itemWidth/itemHeight
    // (subtract half-width/height from drop point) so the slip
    // appears under the cursor, not offset to the top-left corner.
    const rect = board.getBoundingClientRect()
    const dropX = e.clientX - rect.left
    const dropY = e.clientY - rect.top
    const scrollX = board.scrollLeft || 0
    const scrollY = board.scrollTop || 0
    const x = dropX + scrollX - itemWidth / 2
    const y = dropY + scrollY - itemHeight / 2
    setPosition(id, x, y)
    // UI-N6F2 req #4: clear draggingId so the next drag is recognized
    // as a fresh drag, not a continuation of the previous one.
    draggingId.value = null
  }

  function layoutItems() {
    const list = typeof items === 'function' ? items() : (items.value || [])
    const board = boardRef?.value
    const persistedMap = getPositionsMap()
    const xGap = 240
    const yGap = 156
    const topBase = 32
    const leftBase = 32
    const maxPerRow = board
      ? Math.max(1, Math.floor((board.clientWidth - leftBase * 2) / xGap))
      : 3
    return list.map((item, idx) => {
      // Persisted positions take precedence over the default grid (req #6.3):
      //   persisted?.x ?? (leftBase + col * xGap)
      // means "use the saved x if any, otherwise fall back to the grid".
      // This is the core contract that makes drag/drop actually work —
      // before the fix, persisted was always undefined for reactive
      // inputs, so slips always snapped back to the grid.
      const persisted = persistedMap[item.id]
      const col = idx % maxPerRow
      const row = Math.floor(idx / maxPerRow)
      return {
        ...item,
        x: persisted?.x ?? (leftBase + col * xGap),
        y: persisted?.y ?? (topBase + row * yGap),
        zIndex: 1,
      }
    })
  }

  function styleFor(item) {
    return {
      position: 'absolute',
      left: item.x + 'px',
      top: item.y + 'px',
      zIndex: item.zIndex || 1,
    }
  }

  return {
    draggingId,
    isDragging,
    onItemDragStart,
    onItemDragOver,
    onItemDragEnd,
    onBoardDragOver,
    onBoardDrop,
    layoutItems,
    styleFor,
    setPosition,
  }
}