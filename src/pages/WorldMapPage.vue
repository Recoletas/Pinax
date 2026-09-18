<template>
  <div class="world-map-page">
    <SettingsWorkspaceHeader>
      <SettingsContextBar
        :model-value="context?.worldbookId || ''"
        :worldbooks-index="worldStore.worldbooksIndex"
        :active-worldbook="worldbook"
        :project-label="context?.book?.title || ''"
        :project-locked="context?.mode === 'project'"
        :route-mismatch-notice="context?.notice || ''"
        @change="id => router.push({ name: 'settings-world-map', query: { worldbookId: String(id) } })"
      >
        <template #actions><SettingsReturnToManuscript :worldbook-id="context?.worldbookId || ''" /></template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>
    <div class="world-map-page__body">
      <WorldMapPanel
        v-if="mapContextReady"
        :focus-place-id="focusPlaceId"
        :focus-history-node-id="focusHistoryNodeId"
        :focus-entry-id="focusEntryId"
        @open-settings="openFocusedPlaceSettings"
        @open-entry="openProjectWorldbookAdvanced"
        @open-worldbook="openWorldbookImport"
      />
      <p v-else class="world-map-page__loading" role="status">{{ mapContextError || '正在打开这本书的地图…' }}</p>
      <PerfOverlay />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { useSettingsProjectContext } from '../composables/useSettingsProjectContext'
import WorldMapPanel from '../components/geography/WorldMapPanel.vue'
import PerfOverlay from '../components/debug/PerfOverlay.vue'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
// 与另两个设定页共用同一项目上下文解析（bookId -> book.worldbookId，竞态令牌内聚）。
const { context, worldbook, loadError } = useSettingsProjectContext({ worldStore })
const mapContextReady = computed(() => {
  if (context.value?.mode === 'global') return Boolean(worldStore.activeWorldbook)
  return Boolean(worldbook.value)
})
const mapContextError = computed(() => {
  if (context.value?.status === 'missing-worldbook' || loadError.value) return '这本书关联的世界书已不可用。'
  if (context.value?.status === 'unbound') return '这本书还没有关联世界书。'
  return loadError.value || ''
})
const focusPlaceId = computed(() => String(route.query.placeId || ''))
const focusHistoryNodeId = computed(() => String(route.query.historyNodeId || ''))
const focusEntryId = computed(() => String(route.query.entryId || ''))

function openFocusedPlaceSettings(placeId) {
  router.push({
    name: 'settings-structured',
    query: {
      ...(route.query.bookId ? { bookId: String(route.query.bookId) } : {}),
      ...(route.query.worldbookId ? { worldbookId: String(route.query.worldbookId) } : {}),
      ...(placeId ? { placeId } : {})
    }
  })
}

function openProjectWorldbookAdvanced(entryId) {
  // 地图 → 条目：同一 canonical entry，保留项目上下文与回程。
  router.push({
    name: 'settings-worldbook-advanced',
    query: {
      ...(route.query.bookId ? { bookId: String(route.query.bookId) } : {}),
      ...(route.query.worldbookId ? { worldbookId: String(route.query.worldbookId) } : {}),
      ...(entryId ? { entryId: String(entryId) } : {})
    }
  })
}

function openWorldbookImport() {
  router.push({ name: 'settings-worldbook' })
}
</script>

<style scoped>
.world-map-page {
  /* W4c.5: bounded height + overflow:hidden so the .world-map-page__body
     below becomes a real scroll container (otherwise the inner overflow:auto
     is dead and sticky descendants bind to <html> instead of the page). */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0;
}





.world-map-page__body {
  /* Mirror W4b + StructuredSettings .settings-body so the map panel
     scrolls inside the bounded AppShell instead of being clipped. */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: auto;
}


.world-map-page__loading {
  margin: 18px 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
