<script setup>
defineProps({
  edgeTypes: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <div class="canvas-edge-legend">
    <div class="legend-title">剪辑类型</div>
    <div class="legend-items">
      <div v-for="edge in edgeTypes" :key="edge.value" class="legend-item">
        <span class="legend-color" :style="{ background: edge.color }"></span>
        <span class="legend-label">{{ edge.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-edge-legend {
  padding: 12px;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 8px;
  border: 1px solid var(--border-color, #2d2d44);
}

.legend-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #bbb);
  margin-bottom: 8px;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-label {
  font-size: 11px;
  color: var(--text-primary, #fff);
}
</style>