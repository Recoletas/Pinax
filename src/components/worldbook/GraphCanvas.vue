<template>
  <div ref="rootRef" class="graph-canvas">
    <div class="graph-legend" role="toolbar" :aria-label="tr('图谱分类图例')">
      <button
        v-for="item in legend"
        :key="item.cat"
        type="button"
        :class="['legend-chip', { on: cat === item.cat }]"
        :aria-pressed="String(cat === item.cat)"
        :style="legendStyle(item.cat)"
        @click="emit('update:cat', cat === item.cat ? '' : item.cat)"
      >
        <span class="legend-dot" :style="{ background: catColorOf(item.cat) }" />
        {{ item.cat }} · {{ item.count }}
      </button>
      <span v-if="legendHint" class="legend-hint">{{ legendHint }}</span>
    </div>
    <div ref="bodyRef" class="graph-body">
      <canvas
        v-if="hasNodes"
        ref="canvasRef"
        class="graph-stage"
        :aria-label="tr('世界书关系图谱')"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @pointerleave="onPointerLeave"
        @dblclick="onDoubleClick"
        @wheel.prevent="onWheel"
      />
      <p v-else class="graph-empty">{{ tr('暂无可绘制的词条') }}</p>
      <!-- 过滤后交集为空：画布保留（原位不重排），但给一句为什么是空的 -->
      <p v-if="hasNodes && visibleNodeCount === 0" class="graph-no-match">
        {{ tr('当前过滤条件下没有词条 — 放宽分类/状态/档位即可原位恢复') }}
      </p>
    </div>
    <p class="graph-foot">
      {{ footerStats }}
      <span class="graph-foot-hint">{{ tr('悬停看邻域 · 点节点打开词条 · Alt+点聚焦邻域 · Shift+拖节点建边 · 拖画布平移 · 滚轮缩放 · 双击空白复位') }}</span>
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { catColorOf } from '../../services/worldbook/entryBrowserModel.js'

/**
 * 世界书关系图谱（W2·B1）——kit WorldbookGraphView 的 Vue 移植，零依赖 Canvas 2D：
 * 环形起点 + 斥力/弹簧预跑收敛、hover 邻域淡化、度数定半径、
 * 节点拖拽 / 画布平移 / 滚轮缩放；节点原地点击 emit('select', graphEntry)。
 * W2·G1 建边：Shift+从节点拖拽拉临时虚线到目标节点，松开命中即 emit('create-edge',
 * { fromId, toId })；不修饰键的拖拽仍是移动节点，两行为用修饰键互斥。
 * W2-A-2 升级（过滤/命中/聚焦全部由父层给数据，本组件不再自持分类状态）：
 * - visibleIds：分类/状态/档位过滤后的可见词条 id（Set），不可见节点与其边一起不绘制；
 *   布局不重跑，过滤=原地聚焦，取消过滤=原位恢复。
 * - highlightIds：kit 检索命中 id（Set），描主色环且标签常显（渲染 kit 结果，不重算）。
 * - Alt+点节点=聚焦该节点邻域（与 hover 同一淡化档），再击或双击空白取消。
 * - 图例分类点击改走 update:cat，与左侧分类树共用同一个 cat（不重复持状态）。
 * 组件自身仍不写任何数据、无路由副作用；建边落库由父层走 EntryLinksEditor 契约。
 */
const props = defineProps({
  /** worldbook-graph@1（entryBrowserModel.buildGraph 产物） */
  graph: { type: Object, default: null },
  /** 当前分类过滤（'' = 全部）：真相在父层，图例只读 + 回写 */
  cat: { type: String, default: '' },
  /** 过滤后可见词条 id（Set）；null = 父层未过滤，全部可见 */
  visibleIds: { type: Object, default: null },
  /** kit 检索命中词条 id（Set）：主色（--accent）环 + 常显标签 */
  highlightIds: { type: Object, default: null }
})

const emit = defineEmits(['select', 'create-edge', 'update:cat'])

const rootRef = ref(null)
const bodyRef = ref(null)
const canvasRef = ref(null)
const focusId = ref('')
const legend = ref([])

const graphEntries = computed(() => (Array.isArray(props.graph?.entries) ? props.graph.entries : []))
const graphRelations = computed(() => (Array.isArray(props.graph?.relations) ? props.graph.relations : []))
const hasNodes = computed(() => graphEntries.value.length > 0)
const nodeCount = computed(() => graphEntries.value.length)

function isVisible(id) {
  return !props.visibleIds || props.visibleIds.has(id)
}

const visibleNodeCount = computed(() => {
  if (!props.visibleIds) return nodeCount.value
  return graphEntries.value.filter((entry) => props.visibleIds.has(entry.id)).length
})
const edgeCount = computed(() => {
  if (!props.visibleIds) return graphRelations.value.length
  return graphRelations.value.filter((r) => props.visibleIds.has(r.a) && props.visibleIds.has(r.b)).length
})
const hitCount = computed(() => (props.highlightIds ? props.highlightIds.size : 0))

const footerStats = computed(() => {
  if (props.visibleIds && visibleNodeCount.value !== nodeCount.value) {
    return tr('{shown} / {total} 词条 · {edges} 关系边（已过滤）', {
      shown: visibleNodeCount.value,
      total: nodeCount.value,
      edges: edgeCount.value
    })
  }
  return tr('{total} 词条 · {edges} 关系边', { total: nodeCount.value, edges: edgeCount.value })
})

const legendHint = computed(() => {
  const title = focusId.value ? String(graphEntries.value.find((e) => e.id === focusId.value)?.title || '') : ''
  if (title) return tr('已聚焦「{title}」邻域 — Alt+再点或双击空白取消', { title })
  if (hitCount.value) return tr('检索命中 {count} 个节点已描环', { count: hitCount.value })
  if (props.cat) return tr('仅显示「{cat}」— 再点图例取消', { cat: props.cat })
  return ''
})

/* 布局与视图为命令式状态（绘制全在 canvas，无需响应式） */
let layout = null
let view = { k: 1, tx: 0, ty: 0 }
let hoverId = null
let drag = null
let edgeDrag = null
let lastSize = { w: 0, h: 0 }
let labelColor = 'rgba(60, 54, 46, 0.92)'
let labelFont = '22px sans-serif'
let hitColor = 'rgba(176, 154, 95, 0.95)'
let resizeObserver = null

const MIN_K = 0.35
const MAX_K = 3
/** 斥力/弹簧预跑拍数（kit 220 拍；大图降拍防长阻塞） */
const PREGO_ITERATIONS = 220
const PREGO_ITERATIONS_LARGE = 110
const LARGE_GRAPH = 300

function radiusOf(node) {
  return 8 + Math.min(node.deg, 20) * 0.5
}

function draw(activeHover) {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || !layout) return
  const { nodes, edges } = layout
  const { k, tx, ty } = view
  const lit = activeHover || focusId.value
  const hits = props.highlightIds
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, tx, ty)

  const neighbors = new Set()
  if (lit) {
    neighbors.add(lit)
    for (const [a, b] of edges) {
      if (a.e.id === lit) neighbors.add(b.e.id)
      if (b.e.id === lit) neighbors.add(a.e.id)
    }
  }
  // 淡化优先级：hover / 聚焦邻域 > 无（过滤不再靠淡化，见 isVisible）
  const dimOf = (id) => {
    if (lit) return neighbors.has(id) ? 1 : 0.14
    return 1
  }
  ctx.lineWidth = 1.4
  for (const [a, b] of edges) {
    if (!isVisible(a.e.id) || !isVisible(b.e.id)) continue
    const on = !lit ? 1 : Math.min(dimOf(a.e.id), dimOf(b.e.id))
    ctx.strokeStyle = on === 1 ? 'rgba(138, 131, 117, 0.5)' : `rgba(138, 131, 117, ${0.35 * on})`
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  // 名称显隐：放大后全显，度数 ≥5 的枢纽与检索命中常显
  const labelAll = k >= 1.2
  for (const n of nodes) {
    if (!isVisible(n.e.id)) continue
    const alpha = dimOf(n.e.id)
    if (alpha === 0) continue
    const r = radiusOf(n)
    const isHit = Boolean(hits && hits.has(n.e.id))
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
    ctx.fillStyle = catColorOf(n.e.cat)
    ctx.fill()
    if (lit && n.e.id === lit) {
      // 明暗两主题都可见的选中环：深色描边打底 + 白色细环
      ctx.lineWidth = 5 / k
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.stroke()
      ctx.lineWidth = 2 / k
      ctx.strokeStyle = '#fff'
      ctx.stroke()
    } else if (isHit) {
      // kit 检索命中：主题主色单环（与选中环区分，不叠双圈）；4px 才在 1x 下压过同色节点填色
      ctx.lineWidth = 4 / k
      ctx.strokeStyle = hitColor
      ctx.stroke()
    }
    if (labelAll || n.deg >= 5 || isHit) {
      ctx.font = labelFont
      ctx.textAlign = 'center'
      ctx.fillStyle = labelColor
      ctx.fillText(n.e.title, n.x, n.y - r - 6 / k)
    }
    ctx.globalAlpha = 1
  }
  // W2·G1 建边拖拽中的临时线（贝塞尔虚线 + 起点/落点圆 + 目标候选环），世界坐标系
  if (edgeDrag) {
    const mx = (edgeDrag.from.x + edgeDrag.x) / 2
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(176, 154, 95, 0.9)'
    ctx.setLineDash([6 / k, 5 / k])
    ctx.lineWidth = 2 / k
    ctx.beginPath()
    ctx.moveTo(edgeDrag.from.x, edgeDrag.from.y)
    ctx.bezierCurveTo(mx, edgeDrag.from.y, mx, edgeDrag.y, edgeDrag.x, edgeDrag.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(edgeDrag.from.x, edgeDrag.from.y, radiusOf(edgeDrag.from) + 4 / k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(edgeDrag.x, edgeDrag.y, 5 / k, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(176, 154, 95, 0.9)'
    ctx.fill()
    if (edgeDrag.target) {
      ctx.beginPath()
      ctx.arc(edgeDrag.target.x, edgeDrag.target.y, radiusOf(edgeDrag.target) + 6 / k, 0, Math.PI * 2)
      ctx.setLineDash([4 / k, 4 / k])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function relayout() {
  const canvas = canvasRef.value
  const body = bodyRef.value
  if (!canvas || !body) return
  const width = body.clientWidth
  const height = body.clientHeight
  if (!width || !height) return
  // 尺寸未变不重排（ResizeObserver 噪声防护）
  if (layout && lastSize.w === width && lastSize.h === height) return
  lastSize = { w: width, h: height }

  const entries = graphEntries.value
  const relations = graphRelations.value
  const W = (canvas.width = width * 2)
  const H = (canvas.height = height * 2)
  view = { k: 1, tx: 0, ty: 0 }

  const deg = {}
  for (const r of relations) {
    deg[r.a] = (deg[r.a] || 0) + 1
    deg[r.b] = (deg[r.b] || 0) + 1
  }
  const nodes = entries.map((e, i) => ({
    e,
    deg: deg[e.id] || 0,
    x: W / 2 + Math.cos((i / entries.length) * Math.PI * 2) * W * 0.36,
    y: H / 2 + Math.sin((i / entries.length) * Math.PI * 2) * H * 0.36,
    vx: 0,
    vy: 0
  }))
  const idx = new Map(nodes.map((n) => [n.e.id, n]))
  const edges = []
  for (const r of relations) {
    const a = idx.get(r.a)
    const b = idx.get(r.b)
    if (a && b) edges.push([a, b])
  }

  const iterations = nodes.length > LARGE_GRAPH ? PREGO_ITERATIONS_LARGE : PREGO_ITERATIONS
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d2 = Math.max(dx * dx + dy * dy, 400)
        const f = 24000 / d2
        const d = Math.sqrt(d2)
        a.vx -= (dx / d) * f
        a.vy -= (dy / d) * f
        b.vx += (dx / d) * f
        b.vy += (dy / d) * f
      }
    }
    for (const [a, b] of edges) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const f = (d - 190) * 0.02
      a.vx += (dx / d) * f
      a.vy += (dy / d) * f
      b.vx -= (dx / d) * f
      b.vy -= (dy / d) * f
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.0012
      n.vy += (H / 2 - n.y) * 0.0012
      n.x += Math.max(-14, Math.min(14, n.vx))
      n.y += Math.max(-14, Math.min(14, n.vy))
      n.vx *= 0.82
      n.vy *= 0.82
    }
  }

  layout = { nodes, edges }
  const counts = new Map()
  for (const n of nodes) counts.set(n.e.cat, (counts.get(n.e.cat) || 0) + 1)
  legend.value = [...counts.entries()]
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => b.count - a.count)
  draw(hoverId)
}

function toWorld(clientX, clientY) {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const { k, tx, ty } = view
  return { x: ((clientX - rect.left) * 2 - tx) / k, y: ((clientY - rect.top) * 2 - ty) / k }
}

function pickNode(clientX, clientY) {
  const p = toWorld(clientX, clientY)
  if (!p || !layout) return null
  const { k } = view
  let best = null
  let bestD = Infinity
  for (const n of layout.nodes) {
    if (!isVisible(n.e.id)) continue
    const r = Math.max(radiusOf(n), 12 / k)
    const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2
    if (d <= r * r && d < bestD) {
      best = n
      bestD = d
    }
  }
  return best
}

function onPointerDown(event) {
  // W2·G1：Shift+按在节点上 = 建边拖拽（与移动节点/平移画布用修饰键互斥）
  if (event.shiftKey) {
    const hit = pickNode(event.clientX, event.clientY)
    if (hit) {
      const p = toWorld(event.clientX, event.clientY)
      edgeDrag = { from: hit, x: p?.x ?? hit.x, y: p?.y ?? hit.y, target: null }
      if (typeof window !== 'undefined') window.addEventListener('keydown', onWindowKeydown)
      try {
        canvasRef.value?.setPointerCapture(event.pointerId)
      } catch {
        /* 捕获失败照走 */
      }
      if (canvasRef.value) canvasRef.value.style.cursor = 'crosshair'
      draw(null)
      return
    }
  }
  const hit = pickNode(event.clientX, event.clientY)
  if (hit) {
    const p = toWorld(event.clientX, event.clientY)
    if (p) drag = { type: 'node', n: hit, ox: p.x - hit.x, oy: p.y - hit.y, moved: false }
  } else {
    drag = { type: 'pan', sx: event.clientX, sy: event.clientY, tx0: view.tx, ty0: view.ty, moved: false }
  }
  try {
    canvasRef.value?.setPointerCapture(event.pointerId)
  } catch {
    /* 捕获失败照走 */
  }
}

function onPointerMove(event) {
  // 建边拖拽：更新临时线端点与目标候选（复用既有节点命中半径）
  if (edgeDrag) {
    const p = toWorld(event.clientX, event.clientY)
    if (p) {
      edgeDrag.x = p.x
      edgeDrag.y = p.y
    }
    const hit = pickNode(event.clientX, event.clientY)
    edgeDrag.target = hit && hit !== edgeDrag.from ? hit : null
    draw(null)
    return
  }
  const current = drag
  if (!current) {
    const hit = pickNode(event.clientX, event.clientY)
    const id = hit?.e.id ?? null
    if (id !== hoverId) {
      hoverId = id
      draw(id)
      if (canvasRef.value) canvasRef.value.style.cursor = id ? 'pointer' : 'grab'
    }
    return
  }
  if (current.type === 'pan') {
    const dx = event.clientX - current.sx
    const dy = event.clientY - current.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
    view.tx = current.tx0 + dx * 2
    view.ty = current.ty0 + dy * 2
    if (current.moved) {
      if (canvasRef.value) canvasRef.value.style.cursor = 'grabbing'
      draw(null)
    }
    return
  }
  const p = toWorld(event.clientX, event.clientY)
  if (!p) return
  current.moved = true
  current.n.x = p.x - current.ox
  current.n.y = p.y - current.oy
  if (canvasRef.value) canvasRef.value.style.cursor = 'grabbing'
  draw(null)
}

function onPointerUp(event) {
  // 建边拖拽收尾：落在目标节点命中半径内 → emit（自环静默忽略）
  if (edgeDrag) {
    const hit = pickNode(event.clientX, event.clientY)
    const fromId = edgeDrag.from.e.id
    edgeDrag = null
    removeEdgeDragKeydown()
    if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
    if (hit && hit.e.id !== fromId) emit('create-edge', { fromId, toId: hit.e.id })
    draw(hoverId)
    return
  }
  const current = drag
  drag = null
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
  // 节点原地点击（未拖动）：Alt+点=聚焦该节点邻域（原地、可继续平移缩放），否则选中词条
  if (current?.type === 'node' && !current.moved) {
    if (event.altKey) {
      focusId.value = focusId.value === current.n.e.id ? '' : current.n.e.id
      draw(hoverId)
      return
    }
    emit('select', current.n.e)
  }
}

function onPointerCancel() {
  // 系统打断（滚轮滚动/手势接管等）：建边取消，移动/平移按既有语义收尾
  if (edgeDrag) {
    cancelEdgeDrag()
    return
  }
  drag = null
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
}

function cancelEdgeDrag() {
  if (!edgeDrag) return
  edgeDrag = null
  removeEdgeDragKeydown()
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
  draw(hoverId)
}

function removeEdgeDragKeydown() {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onWindowKeydown)
}

function onWindowKeydown(event) {
  // ESC 取消建边（监听挂在 window：canvas 无焦点也能收到）
  if (event.key === 'Escape') cancelEdgeDrag()
}

function onPointerLeave() {
  if (!drag && !edgeDrag) {
    hoverId = null
    draw(null)
  }
}

function onDoubleClick(event) {
  // 节点上的双击不承接手势：单次点击已是「打开词条」，再挂双击会先触发两次选中。
  // 聚焦邻域走 Alt+点（见 onPointerUp）；空白双击保持既有复位语义。
  if (pickNode(event.clientX, event.clientY)) return
  focusId.value = ''
  resetView()
}

function resetView() {
  view = { k: 1, tx: 0, ty: 0 }
  draw(null)
}

function onWheel(event) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const px = (event.clientX - rect.left) * 2
  const py = (event.clientY - rect.top) * 2
  const { k, tx, ty } = view
  const nk = Math.max(MIN_K, Math.min(MAX_K, k * (event.deltaY < 0 ? 1.12 : 0.89)))
  view.tx = px - ((px - tx) * nk) / k
  view.ty = py - ((py - ty) * nk) / k
  view.k = nk
  draw(hoverId)
}

function legendStyle(cat) {
  const on = props.cat === cat
  const color = catColorOf(cat)
  return {
    borderColor: on ? color : 'var(--border)',
    background: on ? 'color-mix(in srgb, ' + color + ' 14%, transparent)' : 'transparent',
    color: on ? color : 'var(--text-muted)'
  }
}

watch(
  () => props.graph,
  () => {
    focusId.value = ''
    cancelEdgeDrag()
    layout = null
    lastSize = { w: 0, h: 0 }
    // flush post：等 canvas 随 v-if 出现后再布局
    requestAnimationFrame(() => relayout())
  }
)

// 过滤/命中变化只重绘：布局与节点原位保持不变（过滤=原地收窄，不是重排）
watch(
  () => [props.visibleIds, props.highlightIds],
  () => draw(hoverId)
)

onMounted(() => {
  if (rootRef.value) {
    // 标签颜色/字体随主题：读容器 computed 值（canvas 不认 CSS var）
    const computed = getComputedStyle(rootRef.value)
    labelColor = computed.color || labelColor
    if (computed.fontFamily) labelFont = `22px ${computed.fontFamily}`
    const accent = computed.getPropertyValue('--accent').trim()
    if (accent) hitColor = accent
  }
  relayout()
  if (typeof ResizeObserver !== 'undefined' && bodyRef.value) {
    resizeObserver = new ResizeObserver(() => relayout())
    resizeObserver.observe(bodyRef.value)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  removeEdgeDragKeydown()
  edgeDrag = null
  drag = null
  layout = null
})
</script>

<style scoped>
.graph-canvas {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 380px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.graph-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.legend-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.legend-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.graph-body {
  position: relative;
  flex: 1;
  min-height: 300px;
}

.graph-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: grab;
}

.graph-empty {
  margin: 0;
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

/* 覆盖在空画布中央：不拦截指针，过滤放宽后原位恢复 */
.graph-no-match {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 20px;
  font-size: 12px;
  color: var(--text-muted);
  pointer-events: none;
}

.graph-foot {
  margin: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

.graph-foot-hint {
  font-size: 11px;
  opacity: 0.85;
}

/* 手势说明全是桌面修饰键/滚轮，触屏无对应操作，窄屏不占行 */
@media (max-width: 760px), (pointer: coarse) {
  .graph-foot-hint {
    display: none;
  }
}
</style>
