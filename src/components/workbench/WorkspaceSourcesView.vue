<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { useWorldStore } from '../../stores/worldStore.js'
import { useSettingsProjectContext } from '../../composables/useSettingsProjectContext.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import WorldbookSourcesPanel from '../worldbook/WorldbookSourcesPanel.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
const DocumentReader = defineAsyncComponent(() => import('../documents/DocumentReader.vue'))
const KnowledgeMethodPanel = defineAsyncComponent(() => import('../knowledge/KnowledgeMethodPanel.vue'))
const view = ref('sources')
const ImportDialog = defineAsyncComponent(() => import('../worldbook/WorldbookSourceImportDialog.vue'))
const props = defineProps({ resource: { type: Object, required: true }, instanceId: { type: String, required: true }, showAddButton: { type: Boolean, default: true } })
watch(() => props.resource.sourcesView, value => { if (['sources', 'files', 'knowledge'].includes(value)) view.value = value }, { immediate: true })
const emit = defineEmits(['sources-changed', 'title'])
watch(view, value => emit('title', tr(({ files: '项目文档', sources: '资料', knowledge: '知识检索' })[value])), { immediate: true })
const host = useComposableWorkspace()
const worldStore = useWorldStore()
const { worldbook, context, loading, loadError, refresh } = useSettingsProjectContext({ worldStore,
  bookId: computed(() => props.resource.bookId), worldbookId: computed(() => props.resource.worldbookId) })
const importOpen = ref(false)
const guard = () => !importOpen.value
let unregister = null
watch(() => props.instanceId, id => { unregister?.(); unregister = host?.registerGuard(id, guard) }, { immediate: true })
onBeforeUnmount(() => unregister?.())
function openSource(source) {
  host?.openResource({ type: 'source', bookId: props.resource.bookId, worldbookId: worldbook.value?.id || '', id: String(source.id), contentHash: source.contentHash || '' })
}
async function changed() { await refresh(); emit('sources-changed') }
async function imported() { importOpen.value = false; await changed() }
defineExpose({ openImport: () => { importOpen.value = true } })
</script>

<template>
  <section class="workspace-sources-view" data-test="workspace-sources-view">
    <header class="workspace-sources-toolbar">
    <nav class="sources-view-modes" aria-label="资料查看方式">
      <button v-for="item in [{ id: 'sources', title: '参考资料' }, { id: 'files', title: '项目文档' }, { id: 'knowledge', title: '知识检索' }]" :key="item.id" type="button" :aria-pressed="view === item.id" :class="{ active: view === item.id }" @click="view = item.id">{{ tr(item.title) }}</button>
    </nav>
      <div class="workspace-sources-actions">
      <button v-if="resource.bookId && showAddButton" type="button" class="control-secondary" @click="importOpen = true"><WorkbenchIcon name="plus" :size="16" />{{ tr('添加资料') }}</button>
      <button type="button" class="control-quiet" :aria-label="tr('刷新资料')" :title="tr('刷新资料')" :disabled="loading" @click="refresh"><WorkbenchIcon name="refresh" :size="16" /></button>
      </div>
    </header>
    <DocumentReader v-if="view === 'files'" :key="resource.bookId" :book-id="resource.bookId" />
    <KnowledgeMethodPanel v-else-if="view === 'knowledge'" :key="resource.bookId" :book-id="resource.bookId" :worldbook="worldbook" />
    <p v-else-if="loading" role="status">{{ tr('正在加载资料…') }}</p>
    <div v-else-if="loadError || context?.status === 'missing-book'" role="alert"><p>{{ tr(loadError || '这本书已不存在。') }}</p></div>
    <WorldbookSourcesPanel v-else-if="worldbook" :worldbook="worldbook" :book-id="resource.bookId" initial-open standalone external-reader @open-source="openSource" @sources-changed="changed" />
    <p v-else>{{ tr('还没有参考资料') }}</p>
    <ImportDialog v-if="importOpen && resource.bookId" :book-id="resource.bookId" @close="importOpen = false" @completed="imported" />
  </section>
</template>

<style scoped>
.sources-view-modes { display: flex; gap: 16px; flex-wrap: wrap; min-width: 0; }
.sources-view-modes button { background: none; color: var(--text-secondary); border: 0; padding: 8px 0; font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.sources-view-modes button.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); }
.workspace-sources-view :deep(.doc-reader), .workspace-sources-view :deep(.kb-panel) { min-height: 360px; height: auto; }
.workspace-sources-view { min-height: 0; padding: 20px; container-type: inline-size; container-name: workspace-sources; color: var(--text-primary); }
.workspace-sources-actions { display: flex; align-items: center; gap: 8px; margin-inline-start: auto; }
.workspace-sources-actions button { display: inline-flex; align-items: center; gap: 6px; }

.workspace-sources-actions button { min-height: 32px; padding: 6px 8px; font: 12px var(--font-sans); }
.workspace-sources-view :deep(.sources-panel__row) { padding: 14px 0; gap: 10px; }
.workspace-sources-view :deep(.sources-panel__file-icon) { width: 24px; }
.workspace-sources-view :deep(.sources-panel__title) { font-size: 14px; }
.workspace-sources-view :deep(.sources-panel__excerpt) { font-size: 12px; }
@container workspace-sources (max-width: 540px) {
  .workspace-sources-view :deep(.sources-panel__row) { display: grid; grid-template-columns: 24px minmax(0, 1fr) 30px; align-items: start; gap: 4px 10px; }
  .workspace-sources-view :deep(.sources-panel__identity) { grid-column: 2; }
  .workspace-sources-view :deep(.sources-panel__meta) { grid-column: 2; grid-row: 2; justify-content: start; max-width: none; gap: 8px; font-size: 11px; }
  .workspace-sources-view :deep(.sources-panel__remove) { grid-column: 3; grid-row: 1; width: 30px; padding: 6px; gap: 0; margin-left: 0; }
  .workspace-sources-view :deep(.sources-panel__remove-label) { display: none; }
  .workspace-sources-view :deep(.sources-panel__remove svg) { display: block; }
  .workspace-sources-view :deep(.sources-panel__file-icon) { height: 32px; }
  .workspace-sources-view :deep(.sources-panel__controls) { flex-wrap: nowrap; gap: 8px; }
  .workspace-sources-view :deep(.sources-panel__controls select) { max-width: 110px; }
}
.workspace-sources-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 16px; border-bottom: 1px solid var(--hairline-soft); }
</style>
