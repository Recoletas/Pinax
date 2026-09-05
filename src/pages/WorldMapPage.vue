<template>
  <div class="world-map-page">
    <SettingsSectionNav />
    <div class="world-map-page__body">
      <WorldMapPanel
        v-if="mapContextReady"
        :focus-place-id="focusPlaceId"
        :focus-history-node-id="focusHistoryNodeId"
        :focus-entry-id="focusEntryId"
        @open-settings="openFocusedPlaceSettings"
        @open-worldbook="openWorldbookImport"
      />
      <p v-else class="world-map-page__loading" role="status">{{ mapContextError || '正在打开这本书的地图…' }}</p>
      <PerfOverlay />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { loadWritingBooks } from '../services/writing/writingBooksRepository.js'
import WorldMapPanel from '../components/geography/WorldMapPanel.vue'
import PerfOverlay from '../components/debug/PerfOverlay.vue'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
const mapContextReady = ref(false)
const mapContextError = ref('')
let contextRequestId = 0
const focusPlaceId = computed(() => String(route.query.placeId || ''))
const focusHistoryNodeId = computed(() => String(route.query.historyNodeId || ''))
const focusEntryId = computed(() => String(route.query.entryId || ''))
const requestedWorldbookId = computed(() => {
  const explicit = String(route.query.worldbookId || '')
  if (explicit) return explicit
  const bookId = String(route.query.bookId || '')
  return String(loadWritingBooks().find((book) => String(book?.id || '') === bookId)?.worldbookId || '')
})

watch(
  requestedWorldbookId,
  async (worldbookId) => {
    const requestId = ++contextRequestId
    mapContextReady.value = !worldbookId
    mapContextError.value = ''
    if (!worldbookId) return
    try {
      await worldStore.loadWorldbooksIndex()
      if (requestId !== contextRequestId) return
      const loaded = await worldStore.setActiveWorldbook(worldbookId)
      if (!loaded) throw new Error('worldbook-missing')
    } catch {
      if (requestId === contextRequestId) mapContextError.value = '这本书关联的世界书已不可用。'
    } finally {
      if (requestId === contextRequestId) mapContextReady.value = !mapContextError.value
    }
  },
  { immediate: true }
)

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

function openWorldbookImport() {
  router.push({ name: 'settings-worldbook' })
}
</script>

<style scoped>
.world-map-page {
  /* W4c.5: bounded height + overflow:hidden so the .world-map-page__body
     below becomes a real scroll container (otherwise the inner overflow:auto
     is dead and sticky descendants bind to <html> instead of the page). */
  height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 12px;
}

.world-map-page__body {
  /* Mirror W4b + StructuredSettings .settings-body so the map panel
     scrolls inside the bounded AppShell instead of being clipped. */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.world-map-page__loading {
  margin: 18px 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
