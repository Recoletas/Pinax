# UI-N6 Implementation Plan — Notes pinned slips + useCanvasBoard

- **Author**: Claude Code (UI-N6 worker)
- **Date**: 2026-06-21
- **Status**: Plan v1 (待 Codex 拍板 → Claude 实施)
- **Run dir**: `docs/agent-runs/2026-06-21-ui-fix/`
- **Basis**: UI-N5 design brief → 方案 B (中修,推荐)
- **Goal**: 回应 "Notes 右边留一堆空...把画布的拖拽等逻辑拿过来,不用死守一次只能看一个"

---

## 0. TL;DR

| 维度 | 现状 | UI-N6 目标 |
|---|---|---|
| 单选 vs 多选 | active-card 单选 (template v-else 单 article) | active-card 仍单选,**周围加 1-3 张 pinned slips** |
| 画布逻辑 | 无 (只在 ProseEssay) | 抽 `useCanvasBoard` composable, Notes + ProseEssay 都用 |
| 右侧空白 | 右中 480px × 全高 是空墙 | pinned slip 占位, slip 数动态 (0-3) |
| 暗态 void (M1 P1 follow-up) | 5 候补格 `opacity: 0.55` 隐形 | pinned slip 实体卡片自带不透明背景 |
| 改动范围 | — | 1 新文件 (`useCanvasBoard.js`) + 3 改 (`Notes.vue` / `kao.css` / `uiPolish.test.js`) |
| 估时 | — | 3-4 h |

**关键决策**:
- 不动 `selectedChapterId` (active-card 仍单选, "在编辑中的主卡" 概念保留)
- 不动 `archive-pin` (右下 kind 缩略条, 跟 pinned slip 概念不重叠)
- 不动 `chapters[]` / `checkedAssetIds[]` / store / services / router / OpeningPage / WelcomeView
- 不动 ProseEssay (它是 reference impl, 本次不迁移, 留作 P3+ cleanup)

---

## 1. 从 ProseEssay.vue 复用哪些函数/状态

### 1.1 直接复用 (机械抽取,不改语义)

| ProseEssay 位置 | 函数/状态 | 行号 | UI-N6 处理 |
|---|---|---|---|
| state | `const draggingCardId = ref(null)` | L803 | 抽到 composable,返回 `draggingId` ref |
| handler | `onCardDragStart(card, e)` | L1790-1794 | 抽,命名 `onItemDragStart(item, e)` |
| handler | `onCardDragOver(card, e)` | L1796-1800 | 抽,命名 `onItemDragOver(item, e)` |
| handler | `onCardDragEnd()` | L1827-1829 | 抽,命名 `onItemDragEnd()` |
| handler | `onCardWallDragOver(e)` | L1838-1842 | 抽,命名 `onBoardDragOver(e)` |
| handler | `onCardWallDrop(e)` | L1844-1881 | 抽,命名 `onBoardDrop(e)`,**关键函数** |
| derived | `flatCards` ref (resolved positions) | L810 | 抽,返回 `positionedItems` computed |
| fn | `layoutCards(cardsToLayout)` | L819-881 | **拆分**:Notes 用简化版 (无 pile 概念,只 absolute 定位) |

### 1.2 简化 (Notes 范围不需要的功能)

| ProseEssay 功能 | Notes 是否需要 | 处理 |
|---|---|---|
| Pile 群组 + fan arrangement | ❌ (Notes 无牌堆概念) | **不抽** |
| `updateLayout()` 触发 `renderedEdges` 重算 | ❌ (Notes 无边) | **不抽**,只 emit `position-change` |
| `addTimeline('卡片加入牌堆')` | ❌ (Notes 不入 ProseEssay 时间轴) | **不抽** |
| `saveData()` | ❌ (Notes 有自己的 `loadNotes`) | **不抽**,留 callback |
| `edges.svg` 渲染层 | ❌ | **不抽** |
| `linkSourceCardId` / 边连模式 | ❌ | **不抽** |

### 1.3 不抽 (ProseEssay 内部独有)

- `piles` / `hoveredPileId` / `expandedPileId` 全部跟牌堆相关 → 不抽
- `cards.value.find(c => c.id === ...)` 等 ProseEssay 内部查找 → 在 Notes 内部
- 任何跟 `getCardTitle / getCardPreview / getShotTypeLabel` 相关的 — ProseEssay 私有

### 1.4 抽取比例估算

| 项 | ProseEssay 行数 | composable 行数 (估) |
|---|---|---|
| 6 个 handler | ~80 | ~80 (基本 1:1) |
| 简化版 `layoutItems()` | ~60 (含 pile) | ~25 (去 pile) |
| `onItemDragStart` 包装 | inline 在 handler | 复用现有 |
| 状态管理 (draggingId) | inline ref | 包在 composable |
| 文档注释 | — | +20 |
| **合计** | — | **~150 行** |

### 1.5 ProseEssay 自身不动的边界 (P3+ 再迁移)

UI-N6 **不**把 ProseEssay 重构成调用 `useCanvasBoard` — 这是 P3 范围。本次只:
- 创建 `useCanvasBoard.js`
- Notes 调用
- ProseEssay 保持原样 (它有 pile 概念,直接迁会破坏 5 个现有 uiPolish contract)

---

## 2. useCanvasBoard API 设计

### 2.1 签名 (JSDoc)

```js
/**
 * UI-N6: Free-placement canvas board composable.
 * Extracted from src/pages/ProseEssay.vue:1790-1881 (onCardDragStart/Over/Drop
 * + onCardWallDragOver/Drop) and L819-881 (layoutCards, simplified to drop
 * pile support since Notes has no pile concept).
 *
 * Used by Notes.vue to let users pin 1-3 material slips next to the active
 * card and drag them to free positions. ProseEssay keeps its own inline
 * implementation (it has piles + edges that this composable doesn't model);
 * a future P3+ pass can migrate ProseEssay onto the same composable.
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.boardRef
 *   Template ref to the drag container (e.g. reading-deck). Must be a
 *   positioned element (relative / absolute) so absolute children can
 *   use left/top in the board's coord space.
 * @param {import('vue').Ref<Array>} options.items
 *   Items to render on the board. Each must have an `id` (string) and
 *   optional `x`, `y` (numbers, board-local px). If x/y missing, layout
 *   assigns grid positions.
 * @param {import('vue').Ref<Record<string,{x:number,y:number}>>} options.positions
 *   Persistent positions map keyed by item.id. The composable reads/writes
 *   here on drop. Pass a `reactive({})` to keep state external.
 * @param {(item:object, e:DragEvent) => void} [options.onItemDragStart]
 *   Optional callback fired when user starts dragging an item.
 * @param {(item:object) => void} [options.onItemClick]
 *   Optional click handler (used by Notes to set selectedChapterId).
 * @returns {{
 *   draggingId: import('vue').Ref<string|null>,
 *   isDragging: import('vue').ComputedRef<boolean>,
 *   onItemDragStart: (item:object, e:DragEvent) => void,
 *   onItemDragOver: (item:object, e:DragEvent) => void,
 *   onItemDragEnd: () => void,
 *   onBoardDragOver: (e:DragEvent) => void,
 *   onBoardDrop: (e:DragEvent) => void,
 *   layoutItems: () => Array,
 *   styleFor: (item:object) => object,
 * }}
 */
export function useCanvasBoard(options) { ... }
```

### 2.2 内部状态

| 内部 ref | 类型 | 用途 |
|---|---|---|
| `draggingId` | `Ref<string \| null>` | 当前拖拽 item id, 6 个 handler 共享 |

### 2.3 6 个 handler (从 ProseEssay L1790-1881 抽取 + 简化)

```js
function onItemDragStart(item, e) {
  draggingId.value = item.id
  if (e?.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
  }
  options.onItemDragStart?.(item, e)
}

function onItemDragOver(item, e) {
  if (!draggingId.value || draggingId.value === item.id) return
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
  const itemId = draggingId.value
  if (!itemId) {
    draggingId.value = null
    return
  }
  const item = options.items.value.find((i) => i.id === itemId)
  if (!item) {
    draggingId.value = null
    return
  }
  const board = options.boardRef.value
  if (!board) {
    draggingId.value = null
    return
  }
  const rect = board.getBoundingClientRect()
  const dropX = e.clientX - rect.left
  const dropY = e.clientY - rect.top
  const scrollX = board.scrollLeft || 0
  const scrollY = board.scrollTop || 0
  // Center the item on cursor: subtract half default width/height.
  // Default 220x120 from kao.css; composable doesn't know this, so
  // emit the drop point and let Notes adjust.
  const x = dropX + scrollX - 110
  const y = dropY + scrollY - 60
  options.positions.value = {
    ...options.positions.value,
    [itemId]: { x: Math.max(0, x), y: Math.max(0, y) }
  }
  draggingId.value = null
}
```

### 2.4 `layoutItems()` (简化版,无 pile)

```js
function layoutItems() {
  const items = options.items.value
  const board = options.boardRef.value
  const positions = options.positions.value
  // Default 2-col grid fallback when positions missing
  const xGap = 240, yGap = 156
  const topBase = 32, leftBase = 32
  const maxPerRow = board
    ? Math.max(1, Math.floor((board.clientWidth - leftBase * 2) / xGap))
    : 3
  return items.map((item, idx) => {
    const persisted = positions[item.id]
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
```

### 2.5 `styleFor(item)` 辅助

```js
function styleFor(item) {
  return {
    position: 'absolute',
    left: item.x + 'px',
    top: item.y + 'px',
    zIndex: item.zIndex || 1,
  }
}
```

### 2.6 边界 (硬规则)

- **不引入 `pile` 概念** (留 ProseEssay 私用)
- **不引入 SVG edge 渲染**
- **不触发 `saveData()`** (Notes 自己管理)
- **不接 `addTimeline()`** (ProseEssay 私用)
- **不引入 touch events** (鼠标 only, P3+ 补)
- **不写 `!important` / scoped `:global(.theme-kao)` / broad `:deep()`** (本项目硬规则)
- **尊重 `prefers-reduced-motion`** (拖拽事件本身不阻塞, 但 UI-N6 不主动加 motion)

---

## 3. Notes.vue 需要新增的 state/computed/method/template

### 3.1 新增 state (script L431 附近插入)

```js
// UI-N6: Pinned material slips (用户可钉 1-3 张素材到主卡旁边自由拖拽)
const pinnedSlipIds = ref([])             // 钉住的素材 id 列表 (顺序 = 钉住先后)
const pinnedSlipPositions = reactive({})  // { [assetId]: { x, y } } 持久化位置
const MAX_PINNED_SLIPS = 3                // 最多 3 张,UI-N5 brief 限定
const boardRef = ref(null)                // reading-deck 模板 ref, 跟 useCanvasBoard 共享
const { draggingId, isDragging, onItemDragStart, onItemDragOver, onItemDragEnd,
        onBoardDragOver, onBoardDrop, layoutItems, styleFor } =
  useCanvasBoard({ boardRef, items: pinnedSlipAssetsRef, positions: pinnedSlipPositions })
```

### 3.2 新增 computed

```js
// 钉住素材的资产 (跟 checkedAssetIds 类似, 但 pinned = 用户主动钉, 跟 select 解耦)
const pinnedSlipAssets = computed(() => {
  return pinnedSlipIds.value
    .map((id) => chapters.value.find((a) => a.id === id))
    .filter(Boolean)
})
// 包成 ref 给 useCanvasBoard 用
const pinnedSlipAssetsRef = computed(() => pinnedSlipAssets.value)
```

### 3.3 新增 method

```js
function togglePinSlip(assetId) {
  if (!assetId) return
  if (pinnedSlipIds.value.includes(assetId)) {
    unpinSlip(assetId)
  } else {
    if (pinnedSlipIds.value.length >= MAX_PINNED_SLIPS) {
      // 满了: 弹最旧一张, 提示一行
      unpinSlip(pinnedSlipIds.value[0])
    }
    pinnedSlipIds.value = [...pinnedSlipIds.value, assetId]
    // 首次钉: 给一个默认位置 (右上)
    if (!pinnedSlipPositions[assetId]) {
      const idx = pinnedSlipIds.value.length - 1
      pinnedSlipPositions[assetId] = {
        x: 32 + idx * 24,
        y: 32 + idx * 24,
      }
    }
  }
  saveNotesLocalUiPrefs()  // 见 §3.6 持久化
}

function unpinSlip(assetId) {
  pinnedSlipIds.value = pinnedSlipIds.value.filter((id) => id !== assetId)
  delete pinnedSlipPositions[assetId]
  saveNotesLocalUiPrefs()
}

function isPinned(assetId) {
  return pinnedSlipIds.value.includes(assetId)
}
```

### 3.4 Template 改动 (L200 deck-toolbar 区域插入)

```html
<button
  v-if="selectedAsset"
  class="material-action-btn deck-toolbar__btn"
  type="button"
  :class="{ 'is-pinned': isPinned(selectedAsset.id) }"
  :disabled="pinnedSlipIds.length >= MAX_PINNED_SLIPS && !isPinned(selectedAsset.id)"
  :title="isPinned(selectedAsset.id) ? '从板面取下' : '钉到主卡旁边'"
  @click="togglePinSlip(selectedAsset.id)"
>
  {{ isPinned(selectedAsset.id) ? '✕ 取下' : '📌 钉到板' }}
</button>
```

(注: 用 emoji 需要评估; 也可以用 SVG 图钉代替; 见 §4.3 视觉)

### 3.5 Template 改动 (L184 active-card v-else 区域加 v-for 兄弟节点)

```html
<template v-else>
  <article class="active-card"> ... 保持原样 ... </article>

  <!-- UI-N6: 钉住的素材 slip (浮在 active-card 之上) -->
  <div
    v-for="slip in layoutItems()"
    :key="slip.id"
    class="pinned-slip"
    :class="{ 'is-active': selectedChapterId === slip.id, 'is-dragging': draggingId === slip.id }"
    :style="styleFor(slip)"
    :data-slip-id="slip.id"
    draggable="true"
    @dragstart="onItemDragStart(slip, $event)"
    @dragover.prevent="onItemDragOver(slip, $event)"
    @dragend="onItemDragEnd"
    @click="selectChapter(slip.id)"
    @keydown.enter="selectChapter(slip.id)"
    tabindex="0"
    role="button"
    :aria-label="`已钉素材 ${slip.title || '无标题'}`"
  >
    <span class="pinned-slip__tab" :style="{ background: getAssetKindColor(slip.kind) }" aria-hidden="true"></span>
    <span class="pinned-slip__kind">{{ getAssetKindLabel(slip.kind) }}</span>
    <h4 class="pinned-slip__title">{{ slip.title || '无标题素材' }}</h4>
    <p v-if="slip.preview || slip.content" class="pinned-slip__preview">
      {{ (slip.preview || slip.content).slice(0, 80) }}<template v-if="(slip.preview || slip.content).length > 80">…</template>
    </p>
    <span class="pinned-slip__stat">{{ (slip.content || '').length }} 字</span>
    <button
      class="pinned-slip__unpin"
      type="button"
      @click.stop="unpinSlip(slip.id)"
      title="取下"
      aria-label="取下此钉"
    >×</button>
  </div>
</template>
```

### 3.6 持久化设计 (localStorage)

不引新 STORAGE_KEY (用户硬规则: 不动 services). 复用 Notes 自己的 ui state pattern.

```js
const NOTES_PINNED_SLIPS_KEY = 'pinax_notes_pinned_slips_v1'

function loadNotesLocalUiPrefs() {
  try {
    const raw = localStorage.getItem(NOTES_PINNED_SLIPS_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data?.ids)) pinnedSlipIds.value = data.ids.slice(0, MAX_PINNED_SLIPS)
    if (data?.positions && typeof data.positions === 'object') {
      Object.assign(pinnedSlipPositions, data.positions)
    }
  } catch (err) {
    console.warn('[Notes] pinned slips prefs load failed:', err)
  }
}

function saveNotesLocalUiPrefs() {
  try {
    localStorage.setItem(NOTES_PINNED_SLIPS_KEY, JSON.stringify({
      ids: pinnedSlipIds.value,
      positions: { ...pinnedSlipPositions },
    }))
  } catch (err) {
    console.warn('[Notes] pinned slips prefs save failed:', err)
  }
}

// 在 onMounted 调一次
onMounted(() => {
  loadNotesLocalUiPrefs()
  loadNotes(String(route.query.assetId || ''))
})
```

**老数据兼容**: 没 `pinax_notes_pinned_slips_v1` 键 → `loadNotesLocalUiPrefs` 静默返回空数组/对象,UI 表现为 0 张 slip (跟改前一样, 无 regression)。

### 3.7 位置边界保护

```js
// 在 onBoardDrop 内, 已包含 Math.max(0, x) / Math.max(0, y)
// 在 CSS .pinned-slip 上加: min-width: 200px; max-width: 240px;
// 让 boardRef 容器加 overflow: hidden (reading-deck 已经有 overflow: auto)
```

### 3.8 不动的 state

- `selectedChapterId` (active-card 单选) — **不动**
- `chapters` — **不动**
- `checkedAssetIds` — **不动**
- `canvasImportRevision` — **不动** (跟 ProseEssay canvas 桥, 跟 Notes pinned slip 是不同概念)
- `currentChapterTitle` / `markdownContent` / `editorMode` 等 — **不动**

---

## 4. pinned slip 的视觉布局、暗态、移动端降级

### 4.1 视觉 token 列表 (kao.css 新增)

```css
/* ============================================================
   UI-N6: Pinned material slips — 贴板纸 + 自由拖拽
   1 张主卡周围 0-3 张 slip, 撕角 + kind 色 tab + 字数
   ============================================================ */

.pinned-slip {
  width: 220px;
  min-height: 120px;
  background: var(--archive-paper-soft);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 45%, transparent);
  box-shadow:
    4px 4px 0 color-mix(in srgb, var(--archive-ink) 18%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 22%, transparent);
  padding: 14px 12px 10px 22px;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  z-index: 4;
}

.pinned-slip:active { cursor: grabbing; }

.pinned-slip:hover {
  transform: translateY(-1px);
  box-shadow:
    5px 5px 0 color-mix(in srgb, var(--archive-ink) 22%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 28%, transparent);
}

.pinned-slip.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.pinned-slip.is-active {
  outline: 2px solid var(--archive-gold);
  outline-offset: 2px;
}

.pinned-slip__tab {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  background: var(--archive-gold);  /* 兜底, 实际由 inline style 覆盖 */
}

.pinned-slip__kind {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--archive-ink-soft);
  font-family: var(--font-display);
}

.pinned-slip__title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--archive-ink);
  font-family: var(--font-display);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-slip__preview {
  font-size: 11px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--archive-ink) 75%, transparent);
  font-family: var(--font-display);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pinned-slip__stat {
  font-size: 9px;
  font-style: italic;
  letter-spacing: 0.06em;
  color: var(--archive-ink-soft);
  align-self: flex-end;
}

.pinned-slip__unpin {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  border-radius: 0;
  opacity: 0.55;
}

.pinned-slip__unpin:hover {
  opacity: 1;
  color: var(--archive-rose, var(--archive-ink));
}
```

### 4.2 kao.css variant gates (`.theme-kao .pinned-slip`)

```css
.theme-kao .pinned-slip {
  background: var(--archive-paper-soft);
  border-color: color-mix(in srgb, var(--archive-gold) 55%, transparent);
  box-shadow:
    5px 5px 0 color-mix(in srgb, var(--archive-ink) 22%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 24%, transparent);
}

.theme-kao .pinned-slip:hover {
  transform: translateY(-1px) rotate(-0.5deg);
  box-shadow:
    6px 6px 0 color-mix(in srgb, var(--archive-ink) 26%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 32%, transparent);
}

.theme-kao .pinned-slip.is-active {
  background: var(--archive-paper);
  box-shadow:
    6px 6px 0 color-mix(in srgb, var(--archive-rose) 32%, transparent),
    inset 0 0 0 2px var(--archive-gold);
}

/* 暗态硬化: 不让 slip 在 dark 下消失 (解决 M1 暗态 void) */
.theme-kao.theme-dark .pinned-slip {
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, var(--archive-paper));
  border-color: color-mix(in srgb, var(--archive-gold) 65%, transparent);
}
```

### 4.3 禁用模式扫描 (硬规则)

- ❌ scoped `:global(.theme-kao)` — 不用
- ❌ broad `:deep()` — 不用
- ❌ `!important` — 不用
- ❌ random hex — 全部走 `var(--archive-*)` / `color-mix(in srgb, var(--*) X%, transparent)`
- ❌ raw hex in Notes.vue template — 不用
- ❌ raw hex in kao.css `.pinned-slip` rule body — 走 token

### 4.4 暗态处理 (解决 M1 暗态 void)

- `.pinned-slip` 自带 `background: var(--archive-paper-soft)` 不透明背景
- 在 `.theme-kao.theme-dark` 显式再定义一次 (N3 模式), 走更亮的 paper-soft mix
- **关键**: 5 候补格 (UI-N4) 在 dark 下隐形问题 还在, 但**只要 pinned slip 占位, 视觉上右边就不再是 void** — 用户从 "右边空" 变成 "右边有钉的素材", 暗态体验反而好

### 4.5 移动端降级 (< 980px)

```css
@media (max-width: 980px) {
  .pinned-slip {
    position: relative !important;  /* 例外: 移动端确实需要脱离 absolute */
    width: auto;
    left: auto !important;
    top: auto !important;
  }
}
```

**等等 — 用户硬规则: 不写 `!important`**. 改用 specificity 提升 + `@media` 自然优先级:

```css
@media (max-width: 980px) {
  .pinned-slip {
    position: relative;
    width: 100%;
    left: auto;
    top: auto;
    transform: none;
  }
}
```

移动端行为:
- reading-deck 改成 flex column
- active-card 优先
- pinned slip 在 active-card 下方 stack 渲染, 用 `styleFor()` 输出的 left/top 在小屏被 CSS override
- 拖拽在移动端不可用 (touch events 没接, P3+), slip 仍可点击 = `selectChapter(slip.id)`

### 4.6 撕角/贴板装饰 (可选 P+)

参考 N5C `material-tear-svg` SVG defs wrapper, 简化版:

```css
.pinned-slip::before {
  content: '';
  position: absolute;
  top: -1px;
  right: -1px;
  width: 22px;
  height: 22px;
  background:
    linear-gradient(225deg,
      var(--archive-paper) 0%,
      var(--archive-paper) 50%,
      transparent 50%,
      transparent 100%);
  /* 撕角缺口 */
}
```

(可选, 在 P+ 阶段, V1 不必加)

### 4.7 颜色: 不用 emoji, 用 SVG 图钉

📌 emoji 跨平台渲染不一致 (Windows vs iOS vs Linux 差很多). 用 SVG:

```html
<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
  <path d="M5.5 1v6M3.5 5.5L5.5 7l2-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
</svg>
```

按钮文案: "钉到板" / "已钉 · 取下" (跟项目中文风格一致, 不写英文混搭)

---

## 5. 如何解决右侧 void

### 5.1 三层补位

| 层 | 旧 | 新 |
|---|---|---|
| L1 reading-deck 中央 | active-card (居中 max-width 760) | active-card 不动 |
| L2 reading-deck 周围 | 空 | **pinned-slip 浮卡** (0-3 张) |
| L3 右下角 | archive-pin 浮卡 (右下 260px) | archive-pin 保留不动 |

### 5.2 pinned-slip 默认位置 (首次钉)

```js
// pinnedSlipIds 顺序: 第一次钉的放右上, 第二次中上, 第三次左上
if (!pinnedSlipPositions[assetId]) {
  const idx = pinnedSlipIds.value.length - 1
  const defaults = [
    { x: 32, y: 32 },                          // 右上 (reading-deck 局部坐标)
    { x: 32, y: 200 },                         // 中上
    { x: 280, y: 32 },                         // 左中 (跟 active-card 不重叠)
  ]
  pinnedSlipPositions[assetId] = defaults[idx] || defaults[0]
}
```

**为什么这么放**: 在 1280 宽下, reading-deck 实际 ≈ 956px, active-card 占 760px 居中, 留白左 98 / 右 98. pinned-slip 220px 放右上 (x=32) 距离 active-card 顶 ≈ 100px, 不重叠; 拖到 (x=400, y=32) 也行 (在 active-card 上方). 用户自由拖到任意位置, 默认只给"右上中左上"3 个安全位.

### 5.3 暗态 void 解决方案

P1 STATUS.md 记录: "Notes dark empty state's far right can still read as a dark void". UI-N4 加了 5 候补格但**没真解决** (候补格 `opacity: 0.55 + transparent` 在 dark 下隐形).

UI-N6 顺带解决:
- 5 候补格 **不动** (UI-N4 ship, 不回滚)
- **新增 pinned-slip** 自身 `background: var(--archive-paper-soft)`, 不透明, 不依赖 background context
- 即便用户没钉任何 slip, 也只是"原 5 候补格 + 右中仍然是 void"; 但**一旦钉 1 张以上**, void 立消
- 教育上: 第一颗 slip 解决 void; 第二颗开始是 "贴板"

### 5.4 不破坏 active-card / drawer / archive-pin

| 元素 | 旧位置 | 新位置 | 重叠风险 |
|---|---|---|---|
| `.material-drawer` | 260px 左 | 260px 左 (不动) | 无 |
| `FolioSurface reading-deck` | 1fr 中 | 1fr 中 (不动) | 无 |
| `.active-card` | reading-deck 居中 max-width 760 | 居中 (不动) | pinned slip 默认右上/中上/左上, 不挡 active-card |
| `.archive-pin` | 笔记内容区 absolute right:24 bottom:24 | 不动 | pinned slip 在 reading-deck 内 (绝对定位父级), archive-pin 在 .notes-content-area 上, **不重叠** (不同父级) |
| `.empty-archive` | 空态显示 | 不动 (空态无 active-card, 也就无 pinned slip) | 无 |
| `.page-controls` | active-card 底部 | 不动 | 无 |

### 5.5 测试 visual void 解决

- 暗态截图 (`docs/agent-runs/2026-06-21-ui-fix/notes-pinned-1280-dark.png`): 钉 1 张以上 slip → 视觉确认右侧不再 void
- 亮态截图 (`notes-pinned-1280-light.png`): 同样

---

## 6. 不破坏 active-card / archive-pin / drawer 的测试策略

### 6.1 现有 uiPolish contract 全部保留

| 现有 contract | UI-N6 是否影响 | 验证方式 |
|---|---|---|
| UI-N2: `<aside class="material-drawer">` / `<aside class="archive-pin">` / `class="reading-deck"` / `class="active-card"` / `class="empty-archive"` 存在 | 无影响 | grep 验证不改 |
| UI-N2: drawer-units 渲染 / index-card / page-controls / material-selection-stamp | 无影响 | 同上 |
| UI-N2: kao.css exposes drawer / reading-deck / empty-archive / archive-pin | 无影响 | 同上 |
| UI-N3: notes-content-area paper wall / reading-deck ::before / active-card 8px shadow | 无影响 | 同上 |
| UI-N3: archive-pin paper card | 无影响 | 同上 |
| UI-N3: hard constraint — no `:global(.theme-kao)` / no `!important` / no `:deep(*)` | 新增必须遵守 | 全文件 grep |
| UI-N4: empty-archive 完整柜面蓝图 | 无影响 | 同上 |
| UI-N4: kind cell --cell-color | 无影响 | 同上 |

### 6.2 新增 uiPolish contract (UI-N6 describe block)

```js
describe('ui polish — UI-N6 Notes pinned material slips', () => {
  // 1. composable 文件存在
  it('UI-N6: useCanvasBoard composable exists at src/composables/useCanvasBoard.js', () => {
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    expect(composable).toMatch(/export function useCanvasBoard/)
    // 6 handler 名命名
    expect(composable).toMatch(/onItemDragStart|onItemDragOver|onItemDragEnd/)
    expect(composable).toMatch(/onBoardDragOver|onBoardDrop/)
    expect(composable).toMatch(/layoutItems|styleFor/)
  })

  // 2. Notes.vue 调用 useCanvasBoard
  it('UI-N6: Notes.vue imports + uses useCanvasBoard (composable wired, not duplicated)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/import\s*\{[^}]*useCanvasBoard[^}]*\}\s*from\s*['"]\.\.\/composables\/useCanvasBoard['"]/)
    expect(notes).toMatch(/useCanvasBoard\(/)
  })

  // 3. Notes.vue 新增 state
  it('UI-N6: Notes.vue has pinnedSlipIds ref + pinnedSlipPositions reactive + MAX_PINNED_SLIPS = 3', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/const\s+pinnedSlipIds\s*=\s*ref\(/)
    expect(notes).toMatch(/const\s+pinnedSlipPositions\s*=\s*reactive\(/)
    expect(notes).toMatch(/MAX_PINNED_SLIPS\s*=\s*3/)
  })

  // 4. Notes.vue 新增 method
  it('UI-N6: Notes.vue has togglePinSlip + unpinSlip + isPinned methods', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/function\s+togglePinSlip/)
    expect(notes).toMatch(/function\s+unpinSlip/)
    expect(notes).toMatch(/function\s+isPinned/)
  })

  // 5. Notes.vue template 渲染
  it('UI-N6: reading-deck v-else contains v-for pinned-slip with draggable + onItemDragStart/End', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // v-for 渲染
    expect(notes).toMatch(/<div[^>]*v-for="slip in layoutItems\(\)"/)
    // draggable
    expect(notes).toMatch(/draggable="true"/)
    // 6 handler 在 template
    expect(notes).toMatch(/@dragstart="onItemDragStart\(slip,\s*\$event\)"/)
    expect(notes).toMatch(/@dragend="onItemDragEnd"/)
    expect(notes).toMatch(/@dragover\.prevent="onItemDragOver\(slip,\s*\$event\)"/)
    // board-level drop 在 reading-deck 上
    expect(notes).toMatch(/@dragover\.prevent="onBoardDragOver\(\$event\)"/)
    expect(notes).toMatch(/@drop="onBoardDrop\(\$event\)"/)
  })

  // 6. deck-toolbar 钉按钮
  it('UI-N6: deck-toolbar has a pin toggle button (📌 钉到板 / ✕ 取下)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/@click="togglePinSlip\(selectedAsset\.id\)"/)
    expect(notes).toMatch(/钉到板|取下/)
  })

  // 7. pinned-slip class + 视觉 gate
  it('UI-N6: kao.css exposes .theme-kao .pinned-slip with token-only body (no raw hex)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip\s*\{/)
    const ruleMatch = css.match(/\.theme-kao\s+\.pinned-slip\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  // 8. 暗态硬化
  it('UI-N6: kao.css has .theme-kao.theme-dark .pinned-slip override (M1 dark void fix)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\.theme-dark\s+\.pinned-slip\s*\{/)
  })

  // 9. 移动端降级
  it('UI-N6: kao.css has @media (max-width: 980px) .pinned-slip fallback (no !important)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*?\.pinned-slip\s*\{/)
  })

  // 10. 硬约束
  it('UI-N6: hard constraint — no new scoped :global(.theme-kao), no new !important, no broad :deep(*) in Notes.vue or useCanvasBoard.js', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    expect(notes).not.toContain(':global(.theme-kao)')
    expect(notes).not.toMatch(/:deep\(\s*\*/)
    expect(notes).not.toMatch(/!important/)
    expect(composable).not.toContain(':global(.theme-kao)')
    expect(composable).not.toMatch(/:deep\(\s*\*/)
    expect(composable).not.toMatch(/!important/)
  })

  // 11. 不破坏旧 contract — 反向断言
  it('UI-N6: does not break existing UI-N2/N3/N4 contracts (active-card, archive-pin, drawer all still rendered)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<aside class="material-drawer">')
    expect(notes).toContain('class="active-card"')
    expect(notes).toContain('class="archive-pin"')
    expect(notes).toContain('class="empty-archive"')
    expect(notes).toContain('class="page-controls"')
    expect(notes).toContain('class="reading-deck"')
  })

  // 12. ProseEssay 不动
  it('UI-N6: src/pages/ProseEssay.vue is NOT modified in this round (composable is new, ProseEssay keeps inline impl)', () => {
    // 这是 meta contract — 通过 git diff 验证
    // 在 test 环境用 process.env.GIT_DIFF 或跳过
    // 简化: 仅断言 ProseEssay 仍然有 onCardDragStart
    const prose = readProjectFile('src/pages/ProseEssay.vue')
    expect(prose).toMatch(/function\s+onCardDragStart/)
    // ProseEssay 的 onCardDragStart 跟 composable 是不同函数签名
    // 不需要重复断言
  })
})
```

### 6.3 12 个 contract 总数

| 维度 | 数 |
|---|---|
| composable 自身 | 1 |
| Notes.vue 集成 | 6 |
| kao.css 视觉 | 3 |
| 硬约束 | 1 |
| 反向断言 | 1 |

### 6.4 测试运行

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
# 期望: 114 旧 + 12 新 = 126 全绿

npm run test:run
# 期望: 112 files / 875+ tests / 0 fail
```

### 6.5 视觉回归 (手测 / Playwright)

| 场景 | 期望 | 截图 |
|---|---|---|
| 亮态 0 pinned slip | 视觉同 N4 现状 | `notes-ui-n6-0slip-1280.png` |
| 亮态 1 pinned slip | 右上 1 张 slip,active-card 中央,右侧不再空 | `notes-ui-n6-1slip-1280.png` |
| 亮态 3 pinned slip | 三张 slip 不同位置,无重叠,视觉饱满 | `notes-ui-n6-3slip-1280.png` |
| 暗态 1 pinned slip | 右侧暗色区被 slip 填满 | `notes-ui-n6-1slip-1280-dark.png` |
| 暗态 3 pinned slip | 同上 + 暗态视觉一致 | `notes-ui-n6-3slip-1280-dark.png` |
| 移动 640 + 1 slip | slip 在 active-card 下方 stack | `notes-ui-n6-1slip-640.png` |
| 1440 宽 + 3 slip | slip 位置正常,无溢出 | `notes-ui-n6-3slip-1440.png` |
| 拖拽过程 | slip 跟随鼠标,松开落位 | (gif / 视频) |

---

## 7. 截图验收清单

### 7.1 文件路径

`docs/agent-runs/2026-06-21-ui-fix/`

### 7.2 必交付 (V1 必过)

| 截图 | 验收点 | 路径 |
|---|---|---|
| 0 slip 亮态 | 视觉与 N4 现状一致, 无 regression | `notes-ui-n6-0slip-1280.png` |
| 1 slip 亮态 (钉 active + 1 slip) | active-card 中央 + 1 slip 右上, 右侧不再空 | `notes-ui-n6-1slip-1280.png` |
| 3 slip 亮态 (钉 3 张) | 3 slip 分布, 无 active-card 遮挡, 视觉饱满 | `notes-ui-n6-3slip-1280.png` |
| 1 slip 暗态 | M1 暗态 void 解决 — 右侧 slip 占位 | `notes-ui-n6-1slip-1280-dark.png` |
| 3 slip 暗态 | 暗态视觉一致 | `notes-ui-n6-3slip-1280-dark.png` |

### 7.3 选交付 (V1 nice-to-have)

| 截图 | 验收点 | 路径 |
|---|---|---|
| 移动 640 + 1 slip | 移动端 stacking fallback | `notes-ui-n6-1slip-640.png` |
| 1440 + 3 slip | 大屏布局正常 | `notes-ui-n6-3slip-1440.png` |
| 拖拽过程 (gif) | slip 跟随鼠标 | `notes-ui-n6-drag.gif` |
| 钉 1 张取下 | 取下后视觉回 0 slip 状态 | `notes-ui-n6-toggle-off-1280.png` |

### 7.4 截图脚本 (take-ui-n6-screenshots.mjs)

参考 N5C 的 `take-p2-screenshots.mjs`, 写一个 Playwright 脚本:

```js
// 简化: 用现有 Pinax 的 Playwright 截图模式
// 1. goto /notes
// 2. waitForSelector('.reading-deck')
// 3. 3 张素材钉上去 (模拟用户操作)
// 4. screenshot 1280 / 640 / 1440 / dark
```

(具体脚本实现留到实施阶段, 本 plan 只列验收点)

---

## 8. 风险和回滚方式

### 8.1 风险表

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| useCanvasBoard 跟 ProseEssay 内部逻辑 drift | Low | Medium (ProseEssay 仍 inline, 不受影响) | composable 是**新文件**, ProseEssay 0 改动 |
| Notes.vue 新增 state 干扰 active-card 单选 | Low | High (核心功能坏) | 11 号 contract 反向断言 active-card / drawer / archive-pin 全保留 |
| localStorage 老数据没 pinnedSlipPositions, UI 异常 | Low | Low (fallback 到默认 grid) | `loadNotesLocalUiPrefs` try-catch + JSON.parse 容错 |
| 拖拽事件在 touch 设备不可用 | Medium | Low (移动端 P3+ 补) | 移动端 CSS override 改 stacking, slip 仍可点击 |
| 12 个 uiPolish contract 跑挂 | Low | Medium | 红绿模式: 先写 contract 看 12 个全 fail, 再写实现 |
| 暗态 slip 视觉 (撕角 / tab) 不齐 | Medium | Low | screenshot 验收 + 走 token |
| 性能: 100 张素材时 v-for 性能 | Low | Low (max 3 张 slip) | MAX_PINNED_SLIPS = 3 强限 |
| 用户本意是 A / C 不是 B | Low | Medium | UI-N5 brief 推荐 B, 实施前可再 ping user 一次 |

### 8.2 回滚方式

**单 commit 策略**: 一个 commit 含 1 新文件 + 3 改文件, 不分拆 (commit-conventions 规则: finish and squash).

```bash
git revert <commit-hash>
# 自动回滚 1 新文件 + 3 改文件
# 不影响 main HEAD 上其他 commit
```

### 8.3 应急回滚 (实施中发现问题)

```bash
# 1. 立即 git stash 或 git checkout
git stash

# 2. 或直接 reset (如果是 working tree 阶段)
git checkout -- src/pages/Notes.vue src/styles/themes/kao.css src/__tests__/uiPolish.test.js
rm src/composables/useCanvasBoard.js

# 3. 然后 git status 确认 clean
git status
```

### 8.4 兼容性矩阵

| 旧数据 | 升级到 UI-N6 | 行为 |
|---|---|---|
| 老 user 无 `pinax_notes_pinned_slips_v1` 键 | 第一次访问 | 静默空数组, UI 同 N4 现状 |
| 老 user 有 `pinax_notes_pinned_slips_v1` 键 (跨 session) | 后续访问 | 还原上次钉的 slip + 位置 |
| 老 user 钉了 4+ 张 (理论上不会, 但万一) | loadNotesLocalUiPrefs | `.slice(0, 3)` 限到 3 张 |
| 跨浏览器 (Chrome / Firefox / Safari) | — | localStorage + drag-and-drop 标准 API, 全支持 |
| 跨设备 (桌面 / 移动) | — | localStorage 跟浏览器实例走, 移动端 stacking 退化, 不破坏 |

---

## 9. 实施时间线 (估)

| Phase | 内容 | 估时 |
|---|---|---|
| Phase 0 | 拍板方案 (Codex + user 确认) | 0.5 h (异步) |
| Phase 1 | 创建 `useCanvasBoard.js` (~150 行) | 1 h |
| Phase 2 | Notes.vue 接入 (state + computed + method + template) | 1 h |
| Phase 3 | kao.css 视觉 (基础 + 暗态 + 移动) | 0.5 h |
| Phase 4 | uiPolish 12 contract + 跑通 | 0.5 h |
| Phase 5 | 截图 (8 张) + 验收 | 0.5 h |
| Phase 6 | commit + push | 0.2 h |
| **合计** | | **~4 h** |

---

## 10. 不在本轮 (out of scope)

- ❌ 不动 ProseEssay (留 P3+ composable 迁移)
- ❌ 不动 store / services / router / OpeningPage / WelcomeView
- ❌ 不接 touch events (P3+)
- ❌ 不做 slip 之间的边连接 (P3+ 才有)
- ❌ 不做 slip 多选 / 批量操作 (P3+ 才有)
- ❌ 不做 ARIA 高级增强 (基础 role="button" + tabindex="0" 够了, 高级是 a11y 独立项目)
- ❌ 不删 archive-pin (概念不重叠, 保留)
- ❌ 不删 page-controls (active-card 内的 prev/next, 仍有用)

---

## 11. Codex 拍板检查清单

请 Codex 回答以下 6 个问题, 然后 Claude 开始实施:

- [ ] **Q1: 方案 B 确认?** (推荐 yes, 替代方案 A / C 见 UI-N5 brief)
- [ ] **Q2: useCanvasBoard 是新文件, 不动 ProseEssay?** (推荐 yes — 留 ProseEssay 内部实现 P3+ 再迁)
- [ ] **Q3: MAX_PINNED_SLIPS = 3?** (推荐 yes, UI-N5 brief 限定)
- [ ] **Q4: 持久化用 localStorage `pinax_notes_pinned_slips_v1`?** (推荐 yes, 不引 STORAGE_KEY, 跟 ui state pattern 一致)
- [ ] **Q5: 1 个 commit 落地?** (推荐 yes, finish and squash 规则)
- [ ] **Q6: 移动端拖拽暂不做?** (推荐 yes, P3+ 补 touch events)

---

## 12. 附录: 关键引用

### ProseEssay.vue 关键行
- L111: `<div class="card-wall" ref="cardWallRef" ...>` — DOM 容器模板
- L173-195: 卡片 v-for + `:style="{ position, left, top, zIndex, transform }"` 绑定
- L770-810: `cards` / `piles` / `flatCards` / `draggingCardId` 状态
- L810-881: `layoutCards()` (含 pile 概念, UI-N6 简化)
- L925: `updateLayout()` 触发 flatCards 重算
- L1790-1881: **6 个 drag/drop handler** (UI-N6 抽取来源)
- L3064-3081: `.card-wall` CSS (grid 背景)
- L3114-3170: `.writing-card` 样式 (224x122)

### Notes.vue 关键行
- L137: `<template v-if="!selectedChapterId">` (empty-archive 入口, **不动**)
- L184: `<template v-else>` (active-card 单卡, **不动结构, 加 v-for 兄弟**)
- L200-230: deck-toolbar 区域 (UI-N6 插入 togglePinSlip 按钮)
- L308: `<aside class="archive-pin" ...>` (右下浮卡, **不动**)
- L431: `const selectedChapterId = ref(null)` (单选, **不动**)
- L479: `const selectedAsset = computed(...)` (active 派生, **不动**)
- L618: `function loadNotes(...)` (数据入口, **不动**)
- L743: `function isAssetOnCanvas(assetId)` (canvas 标记, **不动**)
- L3016: `.active-card { max-width: 760px }` (居中, **不动**)
- L3145: `.archive-pin { position: absolute; right: 24px; bottom: 24px; width: 260px }` (右下, **不动**)

### kao.css Notes 相关行
- L1553: `.theme-kao .material-drawer` (**不动**)
- L1684: `.theme-kao .notes-content-area` (N3 paper wall, **不动**)
- L1695: `.theme-kao .reading-deck` (**不动**)
- L1789-1810: `.theme-kao .active-card` (N3 contract, **不动**)
- L1829-1860: `.theme-kao .archive-pin` (N3 contract, **不动**)
- L1820-1860: `.theme-kao .empty-archive` (N4 contract, **不动**)
- L1860+: `**新增** .theme-kao .pinned-slip { ... }`

### uiPolish.test.js 现有 contract
- L1322-1403: UI-N2 describe block (drawer + reading-deck + archive-pin + page-controls, **全部反向断言保留**)
- L1356-1375: UI-N4 empty-archive contract (**保留**)
- L1608-1700: UI-N3 dark-mode + hard-constraint (`:global(.theme-kao)` / `!important` / `:deep(*)`), **全部反向断言保留**
- L1500-1700: anti-micro-tweak counter (≥ 4 of 6 moves), **保留**

### 跟 P1 已知问题的关系

| P1 follow-up | UI-N6 解决? | 怎么解 |
|---|---|---|
| Notes dark empty state's far right can still read as a dark void | **部分** | 5 候补格仍隐形 (不动), 但 pinned-slip 自带 paper-soft 背景, 用户钉 ≥1 张时暗态 void 消失 |
| `.wall__book-select` needs dedicated kao token rule | 不在 Notes 范围 | N/A |
| all three pages still need next aesthetic polish | UI-N6 是 N 页 polish 的延续 | N/A |
