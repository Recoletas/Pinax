<script setup>
import { computed, onScopeDispose, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { tr } from '../../i18n/index.js'
import { useWorldStore } from '../../stores/worldStore.js'
import { useSettingsProjectContext } from '../../composables/useSettingsProjectContext.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import WorldbookContentWorkspace from '../worldbook/WorldbookContentWorkspace.vue'
const props = defineProps({ resource: { type: Object, required: true }, instanceId: { type: String, required: true } })
const host = useComposableWorkspace()
const route = useRoute()
const editor = ref(null)
const surface = ref(null)
const narrowSurface = ref(false)
const compact = computed(() => narrowSurface.value && host.state.views.find(view => view.id === props.instanceId)?.group !== 'main')
let observer = null
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => { if (surface.value?.clientWidth) narrowSurface.value = surface.value.clientWidth <= 680 })
    observer.observe(surface.value)
  }
})
onScopeDispose(() => observer?.disconnect())
const { worldbook, loading, loadError, refresh } = useSettingsProjectContext({ worldStore: useWorldStore(), bookId: computed(() => props.resource.bookId), worldbookId: computed(() => props.resource.worldbookId) })
const duplicate = computed(() => route.name === 'settings-structured' && route.query.bookId === props.resource.bookId)
const stale = computed(() => props.resource.worldbookId && worldbook.value?.id && String(worldbook.value.id) !== props.resource.worldbookId)
const release = host.registerGuard(props.instanceId, () => editor.value?.flushAll?.() ?? true)
onScopeDispose(release)
</script>
<template>
  <section ref="surface" class="workspace-settings-view" data-test="workspace-settings-view">
    <p v-if="duplicate">{{ tr('设定已在主区打开。') }}<button type="button" class="control-quiet" @click="host.hide()">{{ tr('回到设定') }}</button></p>
    <p v-else-if="stale" role="alert">{{ tr('本书的资料库关联已变化，请重新打开设定。') }}</p>
    <p v-else-if="loading" role="status">{{ tr('加载设定…') }}</p>
    <div v-else-if="loadError" role="alert">{{ tr(loadError) }}<button type="button" class="control-quiet" @click="refresh()">{{ tr('重试') }}</button></div>
    <WorldbookContentWorkspace v-else-if="worldbook" ref="editor" :worldbook="worldbook" :reload="refresh" :book-id="resource.bookId" :initial-entry-id="resource.entryId" :initial-mode="resource.settingsView" :initial-category="resource.settingsCategory" @navigation="host.updateResource(instanceId, $event)" :compact="compact" :focus-entry="resource.focusEntry" :entry-request-id="resource.entryRequestId" />
    <div v-else class="workspace-settings-empty"><h2>{{ tr('还没有设定') }}</h2><p>{{ tr('先导入资料，或关联这本书的资料库。') }}</p><button type="button" class="control-primary" @click="host.openResource({ ...resource, type: 'sources' })">{{ tr('添加资料') }}</button></div>
  </section>
</template>
<style scoped>
.workspace-settings-view { min-width: 0; min-height: 100%; color: var(--text-primary); background: var(--surface-workbench); container-type: inline-size; container-name: workspace-settings; }
.workspace-settings-empty { padding: 48px 24px; }
@container workspace-settings (max-width: 680px) {
  .workspace-settings-view :deep(.section-workbench) { grid-template-columns: minmax(0,1fr); grid-template-rows: max-content auto; }
  .workspace-settings-view :deep(.section-rail) { position: static; height: auto; padding: 12px; gap: 8px; overflow: visible; }
  .workspace-settings-view :deep(.section-tabs) { display: flex; flex-direction: row; overflow-x: auto; }
  .workspace-settings-view :deep(.section-tab) { flex: none; width: auto; min-width: 100px; }
  .workspace-settings-view :deep(.field-directory) { display: none; }
  .workspace-settings-view :deep(.section-canvas) { padding-inline: 20px; }
  .workspace-settings-view :deep(.section-content-heading) { flex-wrap: wrap; }
  .workspace-settings-view :deep(.section-heading-copy h1) { font-size: 23px; }
}
</style>
