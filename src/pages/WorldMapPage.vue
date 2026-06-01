<template>
  <div class="world-map-page">
    <WorldMapPanel />
    <PerfOverlay />
  </div>
</template>

<script setup>
import WorldMapPanel from '../components/geography/WorldMapPanel.vue'
import PerfOverlay from '../components/debug/PerfOverlay.vue'
</script>

<style scoped>
.world-map-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 12px;
}
</style>
