<script setup>
const props = defineProps({
  timelineItems: { type: Array, default: () => [] },
  outlineLength: { type: Number, default: 0 },
  selectedCardId: { type: String, default: '' },
  directorMode: { type: Boolean, default: false },
  directorExportStatus: { type: Object, default: null },
  directorExportButtonTitle: { type: String, default: '' },
  directorActionDisabled: { type: Boolean, default: false },
  directorActionLabel: { type: String, default: '' },
  directorActionTitle: { type: String, default: '' }
})

const emit = defineEmits(['jump', 'move-up', 'move-down', 'remove', 'reorder', 'drop', 'clear', 'director-action'])
</script>

<template>
  <div class="canvas-timeline">
    <div class="timeline-header">
      <span class="timeline-count">{{ outlineLength }} 镜</span>
      <button
        v-if="directorMode"
        class="director-action-btn"
        :disabled="directorActionDisabled"
        :title="directorActionTitle"
        @click="emit('director-action')"
      >
        {{ directorActionLabel }}
      </button>
    </div>
    <div class="timeline-items">
      <div
        v-for="(item, index) in timelineItems"
        :key="item.cardId || index"
        class="timeline-item"
        :class="{ selected: item.cardId === selectedCardId }"
        @click="emit('jump', index)"
      >
        <span class="item-index">{{ index + 1 }}</span>
        <span class="item-label">{{ item.label || item.cardId?.slice(-4) || '' }}</span>
        <button class="item-btn" @click.stop="emit('move-up', index)">↑</button>
        <button class="item-btn" @click.stop="emit('move-down', index)">↓</button>
        <button class="item-btn remove" @click.stop="emit('remove', index)">×</button>
      </div>
    </div>
    <div class="timeline-footer">
      <button class="footer-btn" @click="emit('clear')">清空</button>
    </div>
  </div>
</template>

<style scoped>
.canvas-timeline {
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-count {
  font-size: 12px;
  color: var(--text-secondary, #bbb);
}

.director-action-btn {
  padding: 4px 12px;
  background: var(--accent-color, #6366f1);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.director-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.timeline-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-hover, #2d2d44);
  border-radius: 4px;
  cursor: pointer;
}

.timeline-item.selected {
  background: var(--accent-color, #6366f1);
}

.item-index {
  font-size: 10px;
  color: var(--text-muted, #888);
  min-width: 16px;
}

.item-label {
  flex: 1;
  font-size: 11px;
  color: var(--text-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-btn {
  padding: 2px 6px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 3px;
  color: var(--text-secondary, #bbb);
  cursor: pointer;
  font-size: 10px;
}

.item-btn:hover {
  background: var(--bg-hover, #3d3d54);
}

.item-btn.remove:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.timeline-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #2d2d44);
}

.footer-btn {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-secondary, #bbb);
  cursor: pointer;
  font-size: 11px;
}

.footer-btn:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}
</style>