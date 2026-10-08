<template>
  <section class="unified-entry-browser" :aria-label="tr('世界书条目总览（只读）')">
    <header class="ueb-toolbar">
      <b class="ueb-title">{{ tr('条目总览') }}</b>
      <BrowserSearchBar v-model:query="query" :result-count="visible.length" />
      <div class="ueb-modes" role="tablist" :aria-label="tr('视图切换')">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'cards'"
          :class="['ueb-mode', { on: mode === 'cards' }]"
          @click="mode = 'cards'"
        >
          {{ tr('词条') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'graph'"
          :class="['ueb-mode', { on: mode === 'graph' }]"
          @click="mode = 'graph'"
        >
          {{ tr('图谱') }}
        </button>
      </div>
    </header>

    <div class="ueb-body">
      <aside class="ueb-side">
        <CategoryTree :tree="tree" :selected="cat" @select="cat = $event" />
        <div class="ueb-status" role="group" :aria-label="tr('状态过滤')">
          <button
            v-for="option in STATUS_OPTIONS"
            :key="option.value"
            type="button"
            :class="['ueb-status-chip', `is-${option.value || 'all'}`, { on: status === option.value }]"
            @click="status = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </aside>

      <div class="ueb-main">
        <p class="ueb-count" role="status">
          {{ tr('显示 {shown} / {total} 条', { shown: visible.length, total: tree.total }) }}
        </p>
        <div class="ueb-view">
          <EntryWiki v-if="selected" :entry="selected" :entries="entries" @back="selected = null" @jump="jumpTo" />
          <template v-else-if="mode === 'cards'">
            <EntryCards :entries="visible" :selected-id="selected?.id || ''" @select="openEntry" />
            <p v-if="!visible.length" class="ueb-empty">{{ tr('暂无匹配条目') }}</p>
          </template>
          <GraphCanvas v-else :graph="graph" @select="openEntry" @create-edge="(payload) => emit('create-edge', payload)" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  buildCategoryTree,
  buildGraph,
  filterEntries
} from '../../services/worldbook/entryBrowserModel.js'
import BrowserSearchBar from './BrowserSearchBar.vue'
import CategoryTree from './CategoryTree.vue'
import EntryCards from './EntryCards.vue'
import EntryWiki from './EntryWiki.vue'
import GraphCanvas from './GraphCanvas.vue'

/**
 * 统一条目浏览器（W2·B1 只读壳）——kit 四合一浏览面蓝本：
 * 左分类树带计数 / 中词条卡墙 / 图谱模式 / 顶栏本地轨检索 / wiki 详情关联 chips 就地跳转 / status 徽标。
 * 纯只读：props 进 worldbook 对象，选中条目时 emit('select', entry)；无写操作、无路由跳转副作用。
 */
const props = defineProps({
  /** 世界书对象（worldStore 运行时形状，{ name, entries } 即可） */
  worldbook: { type: Object, default: null }
})

const emit = defineEmits(['select', 'create-edge'])

const query = ref('')
const cat = ref('')
const status = ref('')
const mode = ref('cards')
const selected = ref(null)

const STATUS_OPTIONS = [
  { value: '', label: tr('全部') },
  { value: 'draft', label: tr('草稿') },
  { value: 'active', label: tr('激活') },
  { value: 'retired', label: tr('退役') }
]

const entries = computed(() => (Array.isArray(props.worldbook?.entries) ? props.worldbook.entries : []))
const graph = computed(() => buildGraph(props.worldbook))
const tree = computed(() => buildCategoryTree(entries.value))
const visible = computed(() => filterEntries(entries.value, { q: query.value, cat: cat.value, status: status.value }))
const entriesById = computed(() => new Map(entries.value.map((entry) => [entry.id, entry]).filter(([, entry]) => entry.id)))

/** 图谱节点/chips 解析结果（契约 graph 节点）→ 运行时条目，就地打开 wiki */
function openEntry(target) {
  if (!target?.id) return
  const runtime = entriesById.value.get(target.id)
  if (!runtime) return
  selected.value = runtime
  emit('select', runtime)
}

function jumpTo(graphNode) {
  openEntry(graphNode)
}
</script>

<style scoped>
.unified-entry-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: 14px/1.6 var(--font-sans);
}

.ueb-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.ueb-title {
  flex-shrink: 0;
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--text-primary);
}

.ueb-modes {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ueb-mode {
  padding: 3px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.ueb-mode.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.ueb-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ueb-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 180px;
  flex-shrink: 0;
  padding: 10px 8px;
  border-right: 1px solid var(--border);
  overflow: auto;
}

.ueb-status {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px 2px 2px;
  border-top: 1px solid var(--border);
}

.ueb-status-chip {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ueb-status-chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.ueb-status-chip.is-draft.on {
  border-color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--warning);
}

.ueb-status-chip.is-retired.on {
  color: var(--text-muted);
}

.ueb-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.ueb-count {
  margin: 0;
  padding: 8px 14px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.ueb-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 10px 14px 14px;
  overflow: auto;
}

.ueb-empty {
  margin: 0;
  padding: 20px 0;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 920px) {
  .ueb-body {
    flex-direction: column;
  }

  .ueb-side {
    width: auto;
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .ueb-side :deep(.cat-tree) {
    flex-direction: row;
    flex-wrap: nowrap;
  }

  .ueb-status {
    border-top: 0;
    padding: 0;
    flex-wrap: nowrap;
  }
}
</style>
