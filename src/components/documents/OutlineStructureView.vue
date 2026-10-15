<script setup>
// outline.json 结构视图（W1-B，只读）：节点按 status 着色、因果边按 kind 列举。
// 数据来自 src/services/documents/outlineView.js buildOutlineView（容错规整后）。
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'

const props = defineProps({
  view: { type: Object, default: null },
  warning: { type: String, default: '' },
  title: { type: String, default: '' }
})

const STATUS_LABELS = { exploring: '推演中', planned: '已计划', drafted: '已成稿', fulfilled: '已兑现', parked: '已搁置' }
const EDGE_LABELS = { causes: '因果', foreshadows: '伏笔', alternative: '另一种可能', parallel: '并行' }
const STATUS_ORDER = ['exploring', 'planned', 'drafted', 'fulfilled', 'parked']
const EDGE_ORDER = ['causes', 'foreshadows', 'alternative', 'parallel']

const nodes = computed(() => props.view?.nodes || [])
const edges = computed(() => props.view?.edges || [])
const edgeGroups = computed(() => EDGE_ORDER
  .map((kind) => ({ kind, label: tr(EDGE_LABELS[kind]), items: props.view?.edgesByKind?.[kind] || [] }))
  .filter((group) => group.items.length))
const statusChips = computed(() => STATUS_ORDER
  .filter((status) => props.view?.statusCounts?.[status])
  .map((status) => ({ status, label: tr(STATUS_LABELS[status]), count: props.view.statusCounts[status] })))

function chapterRefsLabel(node) {
  const count = node.chapterRefs?.length || 0
  if (!count) return ''
  return tr('关联 {count} 章', { count })
}
</script>

<template>
  <section class="outline-view" data-test="doc-outline-view">
    <header class="outline-view__head">
      <h1>{{ title || tr('大纲结构') }}</h1>
      <p v-if="statusChips.length" class="outline-view__chips">
        <span
          v-for="chip in statusChips"
          :key="chip.status"
          class="outline-view__chip"
          :class="`is-${chip.status}`"
        >{{ chip.label }} {{ chip.count }}</span>
      </p>
    </header>

    <p v-if="warning" class="outline-view__warning" role="status" data-test="doc-outline-warning">{{ warning }}</p>

    <p v-if="!nodes.length && !edges.length" class="outline-view__empty" data-test="doc-outline-empty">{{ tr('这份 outline.json 没有可展示的节点。') }}</p>

    <template v-else>
      <ol class="outline-view__nodes" data-test="doc-outline-nodes">
        <li
          v-for="node in nodes"
          :key="node.id"
          class="outline-view__node"
          :class="`is-${node.status}`"
          :data-test="`doc-outline-node-${node.status}`"
        >
          <div class="outline-view__node-head">
            <span class="outline-view__status" :class="`is-${node.status}`">{{ tr(STATUS_LABELS[node.status] || '推演中') }}</span>
            <strong class="outline-view__node-title">{{ node.title }}</strong>
          </div>
          <p v-if="node.intent" class="outline-view__intent">{{ node.intent }}</p>
          <p v-if="node.chapterRefs?.length" class="outline-view__refs">{{ chapterRefsLabel(node) }}</p>
        </li>
      </ol>

      <section v-if="edgeGroups.length" class="outline-view__edges" data-test="doc-outline-edges">
        <h2>{{ tr('叙事关系') }}</h2>
        <div v-for="group in edgeGroups" :key="group.kind" class="outline-view__edge-group">
          <h3 :class="`is-${group.kind}`">{{ group.label }} <small>{{ group.items.length }}</small></h3>
          <ul>
            <li v-for="edge in group.items" :key="edge.id">
              <span>{{ edge.fromTitle }}</span>
              <span class="outline-view__edge-arrow" :class="`is-${edge.kind}`">→</span>
              <span>{{ edge.toTitle }}</span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.outline-view {
  max-width: 720px;
  margin-inline: auto;
  color: var(--text-primary);
}
.outline-view__head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.outline-view__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
}
.outline-view__chip {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
  color: var(--text-secondary);
}
.outline-view__chip.is-exploring { color: var(--info); border-color: color-mix(in srgb, var(--info) 40%, transparent); }
.outline-view__chip.is-planned { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
.outline-view__chip.is-drafted { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 40%, transparent); }
.outline-view__chip.is-fulfilled { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); }
.outline-view__chip.is-parked { color: var(--text-muted); }
.outline-view__warning {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-left: 3px solid var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--text-primary);
  font-size: 12.5px;
  border-radius: 0 4px 4px 0;
}
.outline-view__empty {
  margin: 16px 0;
  color: var(--text-muted);
  font-size: 13px;
}
.outline-view__nodes {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.outline-view__node {
  padding: 10px 14px;
  border: 1px solid var(--hairline-soft);
  border-left-width: 3px;
  border-radius: 6px;
  background: var(--surface-raised);
}
.outline-view__node.is-exploring { border-left-color: var(--info); }
.outline-view__node.is-planned { border-left-color: var(--accent); }
.outline-view__node.is-drafted { border-left-color: var(--warning); }
.outline-view__node.is-fulfilled { border-left-color: var(--success); }
.outline-view__node.is-parked { border-left-color: var(--text-muted); opacity: 0.75; }
.outline-view__node-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.outline-view__status {
  flex: none;
  font-size: 11px;
  font-weight: 600;
}
.outline-view__status.is-exploring { color: var(--info); }
.outline-view__status.is-planned { color: var(--accent); }
.outline-view__status.is-drafted { color: var(--warning); }
.outline-view__status.is-fulfilled { color: var(--success); }
.outline-view__status.is-parked { color: var(--text-muted); }
.outline-view__node-title {
  font-size: 14px;
}
.outline-view__intent {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.7;
}
.outline-view__refs {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 11.5px;
}
.outline-view__edges {
  margin-top: 24px;
}
.outline-view__edges h2 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.outline-view__edge-group {
  margin-bottom: 12px;
}
.outline-view__edge-group h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.outline-view__edge-group h3.is-causes { color: var(--accent); }
.outline-view__edge-group h3.is-foreshadows { color: var(--warning); }
.outline-view__edge-group h3.is-alternative { color: var(--info); }
.outline-view__edge-group h3 small {
  color: var(--text-muted);
  font-weight: 400;
}
.outline-view__edge-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.outline-view__edge-group li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-primary);
}
.outline-view__edge-arrow.is-causes { color: var(--accent); }
.outline-view__edge-arrow.is-foreshadows { color: var(--warning); }
.outline-view__edge-arrow.is-alternative { color: var(--info); }
.outline-view__edge-arrow.is-parallel { color: var(--text-muted); }
</style>
