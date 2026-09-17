<template>
  <div class="world-map-page">
    <div class="world-map-page__topbar">
      <SettingsSectionNav />
      <SettingsReturnToManuscript :worldbook-id="context?.worldbookId || ''" />
    </div>
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
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'
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

.world-map-page__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  min-height: var(--workspace-toolbar-height, 46px);
  padding: 0 20px;
  border-bottom: 1px solid var(--archive-paper-strong);
  background: var(--archive-paper-soft);
}

.world-map-page__topbar :deep(.settings-section-nav) { padding: 0; border: 0; }

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
@media (max-width: 760px) {
  .world-map-page__topbar { padding-inline: 12px; flex-wrap: wrap; gap: 4px; }
}

.world-map-page__loading {
  margin: 18px 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
