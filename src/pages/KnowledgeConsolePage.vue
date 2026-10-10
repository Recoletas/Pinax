<template>
  <div class="knowledge-page" data-test="knowledge-console">
    <SettingsWorkspaceHeader>
      <SettingsContextBar
        v-model="selectedWorldbookId"
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        :project-label="projectContextLabel"
        :project-locked="isProjectMode"
        :disabled="switchingWorldbook"
        :route-mismatch-notice="contextNotice"
        @change="onWorldbookChange"
      >
        <template #actions>
          <SettingsReturnToManuscript :worldbook-id="context?.worldbookId || ''" />
        </template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>

    <div class="knowledge-bar">
      <nav class="knowledge-views" role="tablist" :aria-label="tr('知识面切换')">
        <button
          v-for="item in views"
          :key="item.key"
          type="button"
          role="tab"
          class="knowledge-view"
          :class="{ active: view === item.key }"
          :aria-selected="(view === item.key).toString()"
          :data-test="`knowledge-view-${item.key}`"
          @click="selectView(item.key)"
        >
          <WorkbenchIcon :name="item.icon" :size="15" />
          {{ tr(item.label) }}
        </button>
      </nav>
      <router-link
        class="knowledge-editor-link"
        data-test="knowledge-open-editor"
        :to="editorRoute"
      >
        <WorkbenchIcon name="list" :size="15" />
        <span>{{ tr('编辑台') }}</span>
      </router-link>
    </div>

    <main class="knowledge-body">
      <template v-if="view === 'method'">
        <KnowledgeMethodPanel />
      </template>
      <template v-else-if="contextLoading">
        <p class="knowledge-hint" role="status">{{ tr('正在打开这本书的知识库…') }}</p>
      </template>
      <template v-else-if="projectContextStatus === 'missing-book'">
        <p class="knowledge-hint">{{ tr('这本书已不存在。') }}</p>
      </template>
      <template v-else-if="projectContextStatus === 'unbound'">
        <div class="knowledge-empty" data-test="settings-unbound">
          <p>{{ tr('这本书还没有关联世界书。') }}</p>
          <p>{{ tr('在写作工作台右栏「关联世界书」完成关联后，这里会打开它的知识面。') }}</p>
          <button
            type="button"
            class="knowledge-empty-action"
            data-test="unbound-add-sources"
            @click="router.push({ name: 'settings-worldbook-create', query: { bookId: context?.bookId || '', mode: 'sources' } })"
          >
            {{ tr('添加资料') }}
          </button>
        </div>
      </template>
      <template v-else-if="loadError">
        <p class="knowledge-hint">{{ tr(loadError) }}</p>
      </template>
      <template v-else-if="activeWorldbook">
        <div v-if="view === 'browse'" class="knowledge-frame">
          <UnifiedEntryBrowser
            :worldbook="activeWorldbook"
            :filters="filters"
            @update:filters="applyFilters"
            @create-edge="onGraphCreateEdge"
          />
        </div>
        <div v-else-if="view === 'graph'" class="knowledge-frame">
          <UnifiedEntryBrowser
            :worldbook="activeWorldbook"
            :filters="filters"
            initial-mode="graph"
            @update:filters="applyFilters"
            @create-edge="onGraphCreateEdge"
          />
        </div>
        <div v-else-if="view === 'table'" class="knowledge-frame knowledge-table-frame" data-test="knowledge-table-view">
          <nav class="table-scope-bar" data-test="table-scope-bar" :aria-label="tr('表格视图')">
            <button
              v-for="item in TABLE_SCOPES"
              :key="item.key"
              type="button"
              class="table-scope-btn"
              :class="{ 'is-active': tableScope === item.key }"
              :data-test="`table-scope-${item.key}`"
              @click="tableScope = item.key"
            >{{ tr(item.label) }}</button>
          </nav>
          <ForeshadowLedgerTable v-if="tableScope === 'foreshadow'" :worldbook="activeWorldbook" />
          <EntryDataTable
            v-else
            :worldbook="activeWorldbook"
            :scope="tableScope"
            :filters="filters"
            @update:filters="applyFilters"
          />
        </div>
        <div v-else class="knowledge-settings-view">
          <section
            v-if="focusedPlace"
            class="place-context-strip"
            data-test="settings-place-context"
            :aria-label="tr('当前地点上下文')"
          >
            <div class="place-context-copy">
              <span class="place-context-kicker">{{ tr('地点上下文') }}</span>
              <strong>{{ focusedPlace.name || focusedPlace.placeId }}</strong>
              <span>{{ tr('历史 {history} · 条目 {entries}', { history: focusedPlace.historyNodeIds?.length || 0, entries: focusedPlace.entryIds?.length || 0 }) }}</span>
            </div>
            <div class="place-context-actions">
              <button type="button" class="place-context-map-btn" @click="openFocusedPlaceMap()">
                {{ tr('在地图查看') }}
              </button>
              <div v-if="focusedPlace.historyNodes?.length" class="place-context-links">
                <span class="place-context-links-label">{{ tr('历史节点') }}</span>
                <button
                  v-for="item in focusedPlace.historyNodes"
                  :key="`history-${item.id}`"
                  type="button"
                  class="place-context-link"
                  data-test="place-history-map-link"
                  :title="tr('在地图查看：{name}', { name: item.title || item.id })"
                  @click="openFocusedPlaceMap('history', item.id)"
                >
                  {{ item.title || item.id }}
                </button>
              </div>
              <div v-if="focusedPlace.entries?.length" class="place-context-links">
                <span class="place-context-links-label">{{ tr('设定条目') }}</span>
                <button
                  v-for="item in focusedPlace.entries"
                  :key="`entry-${item.id}`"
                  type="button"
                  class="place-context-link"
                  data-test="place-entry-map-link"
                  :title="tr('在地图查看：{name}', { name: item.name || item.id })"
                  @click="openFocusedPlaceMap('entry', item.id)"
                >
                  {{ item.name || item.id }}
                </button>
              </div>
            </div>
          </section>
          <StructuredSettingsWorkspace :worldbook="activeWorldbook" />
        </div>
      </template>
      <template v-else>
        <div class="knowledge-empty">
          <WorkbenchIcon name="worldbook" :size="30" />
          <p>{{ tr('还没有可选的世界书。') }}</p>
          <p class="knowledge-empty-hint">{{ tr('到「编辑台」新建一本，或在写作工作台关联已有世界书。') }}</p>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tr } from '../i18n/index.js'
import { useWorldStore } from '../stores/worldStore'
import { useSettingsProjectContext } from '../composables/useSettingsProjectContext'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import UnifiedEntryBrowser from '../components/worldbook/UnifiedEntryBrowser.vue'
import StructuredSettingsWorkspace from '../components/worldbook/StructuredSettingsWorkspace.vue'
import KnowledgeMethodPanel from '../components/knowledge/KnowledgeMethodPanel.vue'
import EntryDataTable from '../components/knowledge/EntryDataTable.vue'
import ForeshadowLedgerTable from '../components/knowledge/ForeshadowLedgerTable.vue'
import { buildPlaceEntityIndex, resolvePlaceEntity } from '../services/worldHistory/placeEntity'

/**
 * 知识控制台（W2-A）：取代「世界书」作为前端知识面入口。
 * 视图全部复用既有件，本页只做面与上下文，不建第二套数据真源：
 * 浏览 = UnifiedEntryBrowser（kit 代理检索 + 词条/图谱），表格 = EntryDataTable（W3-A 人物多维表格，
 * 读写同走 worldStore 的世界书接缝），结构化设定 = StructuredSettingsWorkspace
 * （含 PlaceCatalog 与原独立「设定」页的地点上下文条，W2-A-2b 折入），方法论 = KnowledgeMethodPanel
 * （kit kb_search/kb_read）。
 * 写面（条目 CRUD、分组、注入参数、ST 往返、章回结算）仍在「编辑台」= settings-worldbook-advanced，
 * 本页只外链不复制；表格视图的人物字段编辑是 W3-A 裁定放进控制台的唯一例外写面，落点仍是同一本世界书。
 * 旧 `settings-structured` 独立页已删，同名路由重定向进本页设定视图。
 */

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
const { context, worldbook: activeWorldbook, loading: contextLoading, loadError } = useSettingsProjectContext({ worldStore })

const views = Object.freeze([
  { key: 'browse', label: '浏览', icon: 'list' },
  { key: 'graph', label: '图谱', icon: 'network' },
  { key: 'table', label: '表格', icon: 'columns' },
  { key: 'settings', label: '结构化设定', icon: 'worldbook' },
  { key: 'method', label: '方法论', icon: 'compass' }
])
const VIEW_KEYS = new Set(views.map((item) => item.key))

/**
 * 表格视图的三张表：人物表（W3-A v1）/ 全部词条（混排，未建档行按正文【标签】读写）/ 伏笔台账
 * （行不是条目，是结算链那份台账条目正文里的表格行）。前两张共用 EntryDataTable，
 * 台账单独一个件——它的行形状与写回都是 settlementService 的纯函数，不与 profile 模板搅在一起。
 */
const TABLE_SCOPES = Object.freeze([
  { key: 'characters', label: '人物表' },
  { key: 'all', label: '全部词条' },
  { key: 'foreshadow', label: '伏笔台账' }
])

const selectedWorldbookId = ref('')
const switchingWorldbook = ref(false)
const view = ref(VIEW_KEYS.has(String(route.query.view || '')) ? String(route.query.view) : 'browse')
// 三视图（词条墙／图谱／表格）共享的一份过滤真相：轴的定义与判定全在 entryBrowserModel，本页只持有状态。
const filters = reactive({ cat: '', status: '', tier: '' })
const tableScope = ref('characters')

function applyFilters(next) {
  Object.assign(filters, { cat: '', status: '', tier: '' }, next)
}
const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const isProjectMode = computed(() => context.value?.mode === 'project')
const projectContextLabel = computed(() => context.value?.book?.title || '')
const projectContextStatus = computed(() => context.value?.status || '')
const contextNotice = computed(() => (context.value?.status === 'route-mismatch' ? context.value.notice : ''))
// 地点上下文条（原独立设定页能力）：?placeId= 深链在设定视图内保留，跳地图不丢书与绑定。
const placeEntityIndex = computed(() => buildPlaceEntityIndex(activeWorldbook.value || {}))
const focusedPlace = computed(() => resolvePlaceEntity(placeEntityIndex.value, String(route.query.placeId || '')))

function openFocusedPlaceMap(kind = '', itemId = '') {
  if (!focusedPlace.value?.placeId) return
  const query = { placeId: focusedPlace.value.placeId }
  if (route.query.bookId) query.bookId = String(route.query.bookId)
  if (route.query.worldbookId) query.worldbookId = String(route.query.worldbookId)
  if (kind === 'history' && itemId) query.historyNodeId = itemId
  if (kind === 'entry' && itemId) query.entryId = itemId
  void router.push({ name: 'settings-world-map', query })
}

const editorRoute = computed(() => {
  const query = {}
  const bookId = String(route.query.bookId || '')
  const worldbookId = String(context.value?.worldbookId || '')
  if (bookId) query.bookId = bookId
  if (worldbookId) query.worldbookId = worldbookId
  return { name: 'settings-worldbook-advanced', query }
})

watch(() => context.value?.worldbookId, (id) => {
  selectedWorldbookId.value = String(id || '')
  // 换书时过滤轴不跟着走（cat 是上一本书的目录名，留着会把新书筛成空表）
  applyFilters({})
}, { immediate: true })

function selectView(key) {
  view.value = key
  const query = { ...route.query, view: key }
  if (key === 'browse') delete query.view
  void router.replace({ name: route.name, query })
}

async function onWorldbookChange(worldbookId) {
  // 项目模式的世界书由书稿关联决定，这里不静默换库（与编辑台同一口径）。
  if (isProjectMode.value) return
  switchingWorldbook.value = true
  try {
    const loaded = await worldStore.setActiveWorldbook(worldbookId)
    if (String(loaded?.id || '') !== String(worldbookId) || route.query.bookId) return
    await router.replace({ name: route.name, query: { ...route.query, worldbookId: String(worldbookId) } })
  } finally {
    switchingWorldbook.value = false
  }
}

function onGraphCreateEdge({ fromId }) {
  // 建边是写操作，真源在编辑台的双层关系编辑器；这里带上下文跳转，不在控制台复制写面。
  void router.push({ name: 'settings-worldbook-advanced', query: { ...editorRoute.value.query, entryId: String(fromId || '') } })
}

watch(() => route.query.view, (value) => {
  const key = String(value || 'browse')
  if (VIEW_KEYS.has(key) && key !== view.value) view.value = key
})

onMounted(async () => {
  try {
    await worldStore.loadWorldbooksIndex()
    if (!isProjectMode.value && !context.value?.worldbookId && typeof worldStore.ensureActiveWorldbook === 'function') {
      await worldStore.ensureActiveWorldbook()
    }
  } catch { /* 索引加载失败由上下文错误态兜住，不在这里打断页面。 */ }
})
</script>

<style scoped>
.knowledge-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.knowledge-editor-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12.5px;
  text-decoration: none;
  white-space: nowrap;
  transition: color 140ms ease, background 140ms ease;
}
.knowledge-editor-link:hover,
.knowledge-editor-link:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}
.knowledge-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  flex-wrap: wrap;
  padding: 8px 20px;
  border-bottom: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
}
.knowledge-views {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.knowledge-view {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.knowledge-view.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}
.knowledge-view:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.knowledge-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.knowledge-frame {
  height: 100%;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
}
/* 浏览器自身分栏滚动（.ueb-view/.ueb-side 各带 overflow），给它满高才不空半屏。 */
.knowledge-frame :deep(.unified-entry-browser) {
  height: 100%;
}
/* 人物表格同理：表体在 .edt-scroll 内滚动，表头随页面不脱离容器。 */
.knowledge-frame :deep(.entry-data-table) {
  height: 100%;
}
/* 表格视图多一条表种切换栏：容器改纵向 flex，表体占剩余高度（不能再写 100%，否则整栏溢出一屏）。 */
.knowledge-table-frame {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.knowledge-table-frame :deep(.entry-data-table),
.knowledge-table-frame :deep(.flt) {
  flex: 1;
  min-height: 0;
  height: auto;
}
.table-scope-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.table-scope-btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.table-scope-btn.is-active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}
.table-scope-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.knowledge-hint {
  margin: 0;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
}
.knowledge-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  margin: 12vh auto 0;
  padding: 0 20px;
  color: var(--text-muted);
  text-align: center;
  font-size: 13px;
  line-height: 1.7;
}
.knowledge-empty p {
  margin: 0;
}
.knowledge-empty-hint {
  font-size: 12px;
}
.knowledge-empty-action {
  margin-top: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.knowledge-settings-view {
  min-width: 0;
}
.place-context-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: min(1240px, calc(100% - clamp(28px, 6vw, 84px)));
  margin: 14px auto 0;
  padding: 10px 0 10px 12px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 66%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.place-context-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.place-context-kicker {
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.04em;
}
.place-context-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.place-context-copy > span:last-child {
  color: var(--text-muted);
  font-size: 11px;
}
.place-context-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.place-context-map-btn {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
}
.place-context-map-btn:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
.place-context-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: min(54vw, 620px);
}
.place-context-links-label {
  color: var(--text-muted);
  font-size: 10px;
  margin-right: 2px;
}
.place-context-link {
  max-width: 150px;
  overflow: hidden;
  padding: 3px 5px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.place-context-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
@media (max-width: 760px) {
  .knowledge-bar {
    padding: 8px 12px;
  }
  .knowledge-view {
    min-height: 44px;
  }
  .knowledge-editor-link {
    margin-left: 0;
  }
  .place-context-strip {
    flex-direction: column;
  }
  .place-context-actions,
  .place-context-links {
    justify-content: flex-start;
    max-width: 100%;
  }
}
</style>
