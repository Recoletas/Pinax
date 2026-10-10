<template>
  <section class="unified-entry-browser" :aria-label="tr('世界书条目总览（只读）')">
    <header class="ueb-toolbar">
      <b class="ueb-title">{{ tr('条目总览') }}</b>
      <BrowserSearchBar
        v-model:query="query"
        :result-count="searchError ? 0 : searchResult ? (searchResult.hits?.length || 0) : visible.length"
        :searching="searching"
        @submit="runSearch"
      />
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
        <div class="ueb-status ueb-tier" role="group" :aria-label="tr('档位过滤')">
          <button
            v-for="option in TIER_OPTIONS"
            :key="option.value"
            type="button"
            :class="['ueb-status-chip', { on: tier === option.value }]"
            @click="tier = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </aside>

      <div class="ueb-main">
        <p class="ueb-count" role="status">
          {{ searchResult
            ? tr('kit 检索「{query}」：命中 {shown} 条 + 扩展 {extra} 条', { query: searchResult.query || '', shown: searchResult.hits?.length || 0, extra: searchResult.expansion?.length || 0 })
            : tr('显示 {shown} / {total} 条', { shown: visible.length, total: tree.total }) }}
        </p>
        <div class="ueb-view">
          <div v-if="searchError" class="ueb-search-error" role="alert">
            <b>{{ tr('知识检索服务不可用') }}</b>
            <span>{{ searchError.message }}</span>
            <code>{{ searchError.code }}</code>
          </div>
          <EntryWiki v-if="selected" :entry="selected" :entries="entries" @back="selected = null" @jump="jumpTo" />
          <template v-else-if="mode === 'cards'">
            <template v-if="searchResult">
              <ol class="ueb-hits">
                <li v-for="hit in searchResult.hits" :key="`hit-${hit.id}`" class="ueb-hit">
                  <button
                    v-if="entriesById.has(hit.id)"
                    type="button"
                    class="ueb-hit-main"
                    @click="openEntry(hit)"
                  >
                    <span class="ueb-hit-title">{{ hit.title }}</span>
                    <span class="ueb-hit-cat" :style="{ color: kitCatColor(hit.cat) }">{{ hit.cat }}</span>
                    <span class="ueb-hit-score">{{ tr('score {score}', { score: hit.score }) }}</span>
                    <span v-if="hit.relations?.length" class="ueb-hit-rel">{{ tr('{count} 条关系', { count: hit.relations.length }) }}</span>
                  </button>
                  <div v-else class="ueb-hit-main is-static">
                    <span class="ueb-hit-title">{{ hit.title }}</span>
                    <span class="ueb-hit-cat" :style="{ color: kitCatColor(hit.cat) }">{{ hit.cat }}</span>
                    <span class="ueb-hit-score">{{ tr('score {score}', { score: hit.score }) }}</span>
                    <span class="ueb-hit-missing">{{ tr('不在当前世界书快照，无法打开详情') }}</span>
                  </div>
                  <p v-if="hit.summary" class="ueb-hit-summary">{{ hit.summary }}</p>
                </li>
              </ol>
              <p v-if="!searchResult.hits?.length" class="ueb-empty">{{ tr('无命中') }}</p>
              <section v-if="searchResult.expansion?.length" class="ueb-expansion">
                <h4 class="ueb-expansion-title">{{ tr('一跳扩展（沿关系边，weight 降序）') }}</h4>
                <ol class="ueb-expansion-list">
                  <li v-for="item in searchResult.expansion" :key="`exp-${item.id}`" class="ueb-expansion-item">
                    <button
                      v-if="entriesById.has(item.id)"
                      type="button"
                      class="ueb-hit-main"
                      @click="openEntry(item)"
                    >
                      <span class="ueb-hit-title">{{ item.title }}</span>
                      <span class="ueb-hit-cat" :style="{ color: kitCatColor(item.cat) }">{{ item.cat }}</span>
                    </button>
                    <div v-else class="ueb-hit-main is-static">
                      <span class="ueb-hit-title">{{ item.title }}</span>
                      <span class="ueb-hit-cat" :style="{ color: kitCatColor(item.cat) }">{{ item.cat }}</span>
                    </div>
                    <p class="ueb-expansion-src">
                      {{ expansionSourceOf(item) }}
                      <code>{{ item.from }} —({{ item.via }})→ {{ item.id }}</code>
                    </p>
                  </li>
                </ol>
              </section>
            </template>
            <template v-else>
              <EntryCards :entries="visible" :selected-id="selected?.id || ''" @select="openEntry" />
              <p v-if="!visible.length" class="ueb-empty">{{ tr('暂无匹配条目') }}</p>
            </template>
          </template>
          <GraphCanvas
            v-else
            :graph="graph"
            :cat="cat"
            :visible-ids="visibleIds"
            :highlight-ids="hitIds"
            @update:cat="cat = $event"
            @select="openEntry"
            @create-edge="(payload) => emit('create-edge', payload)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { tr } from '../../i18n/index.js'
import {
  buildCategoryTree,
  buildGraph,
  catColorOf,
  filterEntries,
  hitIdsOf,
  visibleIdsOf
} from '../../services/worldbook/entryBrowserModel.js'
import { searchWorldbookEntries } from '../../services/worldbook/knowledgeSearchClient.js'
import BrowserSearchBar from './BrowserSearchBar.vue'
import CategoryTree from './CategoryTree.vue'
import EntryCards from './EntryCards.vue'
import EntryWiki from './EntryWiki.vue'
import GraphCanvas from './GraphCanvas.vue'

/**
 * 统一条目浏览器（W2·B1 只读壳；W1-A 检索接线；W2-A-2 过滤与命中同驱图谱）——kit 四合一浏览面蓝本：
 * 左分类树带计数 + 状态/档位过滤 / 中词条卡墙 / 图谱模式 / 顶栏 kit 代理检索（hits + 一跳扩展分区，
 * 渲染 kit 返回的 score/relations/expansion，前端不重算） / wiki 详情关联 chips 就地跳转 / status 徽标。
 * 三个过滤轴（cat/status/tier）是一份真相：词条墙按它筛，图谱按它隐藏节点（布局不重排，原位收窄）。
 * 宿主（知识控制台）可传入 filters 把这份真相收到自己手里，表格视图据此同步收窄；不传则本件自持。
 * 检索命中集合下发图谱描环；档位单源注入端 entryTierOf，本处不另定档位规则。
 * 纯只读：props 进 worldbook 对象，选中条目时 emit('select', entry)；无写操作、无路由跳转副作用。
 * 检索目标：route.query.bookId → 项目注册表解析 projectId（knowledgeSearchClient 内做）。
 */
const props = defineProps({
  /** 世界书对象（worldStore 运行时形状，{ name, entries } 即可） */
  worldbook: { type: Object, default: null },
  /**
   * 跨视图共享的过滤真相（知识控制台持有同一份，表格视图跟着收窄）。
   * 不传时浏览器自持一份——独立挂载（编辑台等）行为与之前完全一致。
   */
  filters: { type: Object, default: null }
})

const emit = defineEmits(['select', 'create-edge', 'update:filters'])

const route = useRoute()
const query = ref('')
const localFilters = reactive({ cat: '', status: '', tier: '' })

/** 一条轴的读写：有宿主就读写宿主那份，没宿主就写自己的抽屉 */
function filterAxis(key) {
  return computed({
    get: () => String(props.filters?.[key] ?? ''),
    set: (value) => {
      if (props.filters) emit('update:filters', { ...props.filters, [key]: value })
      else localFilters[key] = value
    }
  })
}
const cat = filterAxis('cat')
const status = filterAxis('status')
const tier = filterAxis('tier')
const mode = ref('cards')
const selected = ref(null)
const searching = ref(false)
const searchResult = ref(null)
const searchError = ref(null)

const STATUS_OPTIONS = [
  { value: '', label: tr('全部') },
  { value: 'draft', label: tr('草稿') },
  { value: 'active', label: tr('激活') },
  { value: 'retired', label: tr('退役') }
]

const TIER_OPTIONS = [
  { value: '', label: tr('全部档位') },
  { value: 'core', label: tr('核心') },
  { value: 'support', label: tr('支撑') },
  { value: 'background', label: tr('背景') }
]

const entries = computed(() => (Array.isArray(props.worldbook?.entries) ? props.worldbook.entries : []))
const graph = computed(() => buildGraph(props.worldbook))
const tree = computed(() => buildCategoryTree(entries.value))
const axisSnapshot = computed(() => ({ cat: cat.value, status: status.value, tier: tier.value }))
const visible = computed(() => filterEntries(entries.value, axisSnapshot.value))
const entriesById = computed(() => new Map(entries.value.map((entry) => [entry.id, entry]).filter(([, entry]) => entry.id)))

/** 词条墙与图谱共用同一份过滤真相（无过滤 = null，图谱按全量显示总数） */
const visibleIds = computed(() => visibleIdsOf(entries.value, axisSnapshot.value))

/** kit 命中 + 一跳扩展节点集合：图谱据此描环（渲染 kit 结果，不重算打分） */
const hitIds = computed(() => hitIdsOf(searchResult.value))

/** kit 命中的 cat 是 graph.json 的目录名（kit canonical 原样展示）；配色复用本地目录表 */
function kitCatColor(catName) {
  return catColorOf(String(catName || '').trim())
}

/** 扩展项来源说明（渲染 kit 的 via/weight/from，不重算） */
function expansionSourceOf(item) {
  const fromTitle = searchResult.value?.hits?.find((hit) => hit.id === item.from)?.title || item.from
  return tr('由「{from}」沿边一跳（weight {weight}）', { from: fromTitle, weight: item.weight })
}

/** 提交检索：cat 取目录一级（kit cat 是等值过滤，「目录/分组」二级不可表达，随目录收窄） */
async function runSearch() {
  const q = query.value.trim()
  if (!q || searching.value) return
  searching.value = true
  searchError.value = null
  searchResult.value = null
  const slash = cat.value.indexOf('/')
  const kitCat = cat.value && cat.value !== '全部' ? (slash >= 0 ? cat.value.slice(0, slash) : cat.value) : ''
  const response = await searchWorldbookEntries({
    bookId: String(route.query.bookId || ''),
    q,
    cat: kitCat
  })
  searching.value = false
  if (response.ok) {
    searchResult.value = response.result
  } else {
    searchError.value = response.error
  }
}

watch(query, (value) => {
  if (!value.trim()) {
    searchResult.value = null
    searchError.value = null
  }
})

watch(cat, () => {
  // 分类树切换后旧检索结果不再代表当前过滤口径，回到浏览态
  searchResult.value = null
  searchError.value = null
})

/** 图谱节点/chips/kit 命中解析（kit hit.id == 契约 graph 节点 id == 运行时条目 id）→ 就地打开 wiki */
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

.ueb-search-error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--warning);
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  font-size: 13px;
}

.ueb-search-error b {
  color: var(--warning);
}

.ueb-search-error code {
  font-size: 11px;
  color: var(--text-muted);
}

.ueb-hits,
.ueb-expansion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ueb-hit {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.ueb-hit-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ueb-hit-main.is-static {
  cursor: default;
}

.ueb-hit-title {
  font-weight: 600;
}

.ueb-hit-cat {
  font-size: 11px;
}

.ueb-hit-score {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.ueb-hit-rel {
  font-size: 11px;
  color: var(--text-muted);
}

.ueb-hit-missing {
  font-size: 11px;
  color: var(--text-muted);
}

.ueb-hit-summary {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.ueb-expansion {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

.ueb-expansion-title {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-secondary);
}

.ueb-expansion-item {
  padding: 6px 10px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}

.ueb-expansion-src {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.ueb-expansion-src code {
  margin-left: 8px;
  font-size: 10px;
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
