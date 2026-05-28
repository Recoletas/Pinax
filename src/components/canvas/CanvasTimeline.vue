<script setup>
const props = defineProps({
  timelineItems: { type: Array, required: true },
  outlineLength: { type: Number, default: 0 },
  selectedCardId: { type: String, default: '' },
  directorMode: { type: Boolean, default: false },
  directorExportStatus: { type: Object, default: null },
  directorExportButtonTitle: { type: String, default: '导出' },
  directorActionDisabled: { type: Boolean, default: true },
  directorActionLabel: { type: String, default: '生成' },
  directorActionTitle: { type: String, default: '' }
})

const emit = defineEmits(['jump', 'move-up', 'move-down', 'remove', 'reorder', 'drop', 'clear', 'director-action'])

const draggingIndex = ref(-1)
const dragOverIndex = ref(-1)

function onDragStart(index, e) {
  draggingIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
}

function onDragOver(index) {
  if (draggingIndex.value === -1 || draggingIndex.value === index) return
  dragOverIndex.value = index
  emit('reorder', draggingIndex.value, index)
  draggingIndex.value = index
}

function onDrop() {
  draggingIndex.value = -1
  dragOverIndex.value = -1
  emit('drop')
}

function onDragEnd() {
  draggingIndex.value = -1
  dragOverIndex.value = -1
}
</script>

<script>
import { ref } from 'vue'
</script>

<template>
  <div class="outline-section">
    <div class="outline-header">
      <div class="outline-title-stack">
        <span class="outline-title">时间轴</span>
        <span class="timeline-summary">{{ timelineItems.length }} 镜 / {{ timelineItems.reduce((s, i) => s + i.duration, 0) }}s</span>
      </div>
      <div class="timeline-header-actions">
        <span
          v-if="directorExportStatus"
          class="timeline-version-chip"
          :class="`is-${directorExportStatus.kind}`"
          :title="directorExportButtonTitle"
        >
          <span class="timeline-version-dot"></span>
          <span class="timeline-version-text">{{ directorExportStatus.title }}</span>
        </span>
        <button
          v-if="directorMode"
          class="timeline-version-action"
          type="button"
          :disabled="directorActionDisabled"
          @click="emit('director-action')"
          :title="directorActionTitle"
        >
          {{ directorActionLabel }}
        </button>
        <button class="timeline-clear-btn" type="button" :disabled="outlineLength === 0" @click="emit('clear')" title="清空时间轴">清空</button>
      </div>
    </div>

    <div class="timeline-view">
      <div class="timeline-track">
        <div
          v-for="item in timelineItems"
          :key="item.key"
          class="timeline-card"
          :class="{ active: selectedCardId === item.cardId, dragging: draggingIndex === item.index, 'drop-target': dragOverIndex === item.index }"
          @click="emit('jump', item)"
          draggable="true"
          @dragstart="onDragStart(item.index, $event)"
          @dragover.prevent="onDragOver(item.index)"
          @drop="onDrop"
          @dragend="onDragEnd"
        >
          <div class="timeline-card-header">
            <span class="timeline-index">{{ item.index + 1 }}</span>
            <span class="timeline-card-title">{{ item.title }}</span>
            <span class="timeline-duration">{{ item.duration }}s</span>
          </div>
          <div v-if="item.metaText" class="timeline-card-meta" :title="item.metaText">
            {{ item.metaText }}
          </div>
          <div class="timeline-card-actions" @click.stop>
            <button type="button" :disabled="item.index === 0" @click="emit('move-up', item.index)" title="上移">↑</button>
            <button type="button" :disabled="item.index === outlineLength - 1" @click="emit('move-down', item.index)" title="下移">↓</button>
            <button type="button" class="danger" @click="emit('remove', item.index)" title="移除">×</button>
          </div>
        </div>
        <div v-if="outlineLength === 0" class="timeline-empty">
          选择画布节点后，在详情中加入时间轴
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Outline Section */
.outline-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
}

.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.outline-title-stack {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.outline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.timeline-summary {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.timeline-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.timeline-version-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 108px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-soft) 70%, transparent);
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
}

.timeline-version-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-muted);
  flex: none;
}

.timeline-version-chip.is-current .timeline-version-dot {
  background: var(--accent);
}

.timeline-version-chip.is-stale .timeline-version-dot,
.timeline-version-chip.is-warning .timeline-version-dot {
  background: #f59f00;
}

.timeline-version-chip.is-error .timeline-version-dot {
  background: var(--danger);
}

.timeline-version-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.timeline-version-action {
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
}

.timeline-version-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.timeline-version-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.timeline-clear-btn {
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.timeline-clear-btn:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.timeline-clear-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

/* Director mode timeline view */
.timeline-view {
  padding: 6px;
}

.timeline-track {
  display: grid;
  gap: 1px;
  overflow-y: auto;
  padding: 2px;
  max-height: 220px;
}

.timeline-card {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  position: relative;
  min-width: 0;
}

.timeline-card:hover {
  background: var(--bg-hover);
  border-color: transparent;
}

.timeline-card.active {
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  background: color-mix(in srgb, var(--accent) 11%, transparent);
  box-shadow: none;
}

.timeline-card.dragging {
  opacity: 0.55;
}

.timeline-card.drop-target {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

.timeline-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 22px;
}

.timeline-index {
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
}

.timeline-duration {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.timeline-card-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.timeline-card-meta {
  margin: 0 46px 0 24px;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-card-actions {
  position: absolute;
  right: 4px;
  top: 5px;
  display: inline-flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.timeline-card:hover .timeline-card-actions,
.timeline-card.active .timeline-card-actions {
  opacity: 1;
  pointer-events: auto;
}

.timeline-card-actions button {
  width: 17px;
  height: 17px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.timeline-card-actions button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.timeline-card-actions button.danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.timeline-card-actions button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.timeline-empty {
  text-align: center;
  padding: 14px 10px;
  font-size: 12px;
  color: var(--text-muted);
  width: 100%;
}
</style>
