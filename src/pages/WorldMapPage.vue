<template>
  <div class="world-map-page">
    <SettingsSectionNav />
    <div class="world-map-page__body">
      <WorldMapPanel
        :focus-place-id="focusPlaceId"
        :focus-history-node-id="focusHistoryNodeId"
        :focus-entry-id="focusEntryId"
        @open-settings="openFocusedPlaceSettings"
      />
      <PerfOverlay />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorldMapPanel from '../components/geography/WorldMapPanel.vue'
import PerfOverlay from '../components/debug/PerfOverlay.vue'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'

const route = useRoute()
const router = useRouter()
const focusPlaceId = computed(() => String(route.query.placeId || ''))
const focusHistoryNodeId = computed(() => String(route.query.historyNodeId || ''))
const focusEntryId = computed(() => String(route.query.entryId || ''))

function openFocusedPlaceSettings(placeId) {
  if (!placeId) return
  router.push({ name: 'settings-structured', query: { placeId } })
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
</style>
