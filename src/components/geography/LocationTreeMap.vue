<template>
  <div v-if="locations.length === 0" class="empty-state">
    暂无地点数据，请在下方添加地点
  </div>
  <div v-else-if="!treeLayout" class="empty-state">
    地点层级结构有误，请检查父级关系
  </div>
  <div v-else ref="containerRef" class="tree-map-container">
    <svg :width="svgSize.width" :height="svgSize.height">
      <g :transform="`translate(${margin.left},${margin.top})`">
        <line
          v-for="(link, i) in treeLayout.root.links()"
          :key="'l'+i"
          :x1="link.source.x"
          :y1="link.source.y"
          :x2="link.target.x"
          :y2="link.target.y"
          stroke="var(--border)"
          stroke-width="1.5"
        />
        <g
          v-for="(node, i) in descendants"
          :key="'n'+i"
          :transform="`translate(${node.x},${node.y})`"
        >
          <circle r="16" :fill="nodeColor(node.data.type)" fill-opacity="0.2" :stroke="nodeColor(node.data.type)" stroke-width="1.5" />
          <circle r="5" :fill="nodeColor(node.data.type)" />
          <text y="28" text-anchor="middle" font-size="11" fill="var(--text-primary)">
            {{ node.data.name }}
          </text>
        </g>
      </g>
    </svg>
    <div class="legend">
      <div v-for="(label, key) in TYPE_LABELS" :key="key" class="legend-item">
        <span class="legend-dot" :style="{ background: NODE_COLORS[key] }"></span>
        <span :style="{ color: NODE_COLORS[key] }">{{ label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { stratify, tree } from 'd3-hierarchy'
import { LOCATION_TYPES } from '../../config/geography-types'

const props = defineProps({
  locations: { type: Array, default: () => [] }
})

const NODE_COLORS = Object.fromEntries(LOCATION_TYPES.map(t => [t.value, t.color]))
const TYPE_LABELS = Object.fromEntries(LOCATION_TYPES.map(t => [t.value, t.label]))

const containerRef = ref(null)
const svgSize = ref({ width: 700, height: 400 })
let ro = null

onMounted(() => {
  if (!containerRef.value) return
  ro = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width
    if (w) svgSize.value = { width: Math.floor(w), height: Math.max(350, Math.floor(w * 0.55)) }
  })
  ro.observe(containerRef.value)
})

onUnmounted(() => ro?.disconnect())

const margin = { top: 40, right: 20, bottom: 40, left: 20 }

const treeLayout = computed(() => {
  if (props.locations.length === 0) return null
  const allNodes = [
    { id: '__root__', name: '世界', type: 'continent', description: '', significance: '', parentId: null, order: 0 },
    ...props.locations.map(l => ({ ...l, parentId: l.parentId || '__root__' })),
  ]
  try {
    const root = stratify().id(d => d.id).parentId(d => d.parentId)(allNodes)
    const { width, height } = svgSize.value
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const layout = tree().size([innerW, innerH])
    return { root: layout(root) }
  } catch {
    return null
  }
})

const descendants = computed(() => {
  if (!treeLayout.value) return []
  return treeLayout.value.root.descendants().filter(d => d.data.id !== '__root__')
})

function nodeColor(type) { return NODE_COLORS[type] ?? '#94a3b8' }
</script>

<style scoped>
.tree-map-container {
  border-radius: 0;
  overflow: hidden;
  border: none;
  background:
    radial-gradient(circle at 20% 16%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 92%, var(--bg-secondary)), var(--bg-primary));
}

.tree-map-container svg {
  display: block;
  min-height: 240px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 18px;
}

.legend {
  padding: 10px 12px 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
