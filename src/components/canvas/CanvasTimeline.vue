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
  directorActionTitle: { type: String, default: '' },
  // R2-B: persistent compact video control. Visible whenever a storyboard
  // version exists or can be generated. The compact control replaces the
  // need to dig into the export menu to find "视频生成".
  videoCompact: {
    type: Object,
    default: () => ({ visible: false, label: '视频', title: '打开视频生成', kind: 'empty' })
  }
})

const emit = defineEmits(['jump', 'move-up', 'move-down', 'remove', 'reorder', 'drop', 'clear', 'director-action', 'open-video'])

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
        <button
          v-if="directorMode && videoCompact.visible"
          class="timeline-video-compact"
          type="button"
          :class="`is-${videoCompact.kind}`"
          :title="videoCompact.title"
          :aria-label="videoCompact.title"
          @click="emit('open-video')"
        >
          <svg class="timeline-video-compact-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16 10l5-3v10l-5-3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <span class="timeline-video-compact-label">{{ videoCompact.label }}</span>
          <span v-if="videoCompact.badge" class="timeline-video-compact-badge">{{ videoCompact.badge }}</span>
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
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 44%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 76%, var(--surface-panel));
}

.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 42%, transparent);
  background: transparent;
  flex-shrink: 0;
}

.outline-title-stack {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.outline-title {
  font-family: var(--font-display);
  font-size: 13px;
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
  border-radius: 1px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 30%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 68%, transparent);
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
  background: var(--warning);
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
  border: 1px solid color-mix(in srgb, var(--archive-olive) 38%, transparent);
  border-radius: 1px;
  background: color-mix(in srgb, var(--archive-olive) 8%, transparent);
  color: var(--archive-olive);
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

/* R2-B: persistent compact video control. Lives next to the version
   chip + version action + clear button, never in the export menu, never
   in a second drawer. Reuses the existing StoryboardVideoPanel via the
   `open-video` event. Status colors mirror directorExportStatus kinds. */
.timeline-video-compact {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 48%, var(--border));
  border-radius: 1px;
  background: color-mix(in srgb, var(--archive-olive) 9%, transparent);
  color: var(--archive-olive);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.timeline-video-compact:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-color: var(--accent);
}

.timeline-video-compact-icon {
  flex: none;
}

.timeline-video-compact-label {
  white-space: nowrap;
}

.timeline-video-compact-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}

.timeline-video-compact.is-current {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.timeline-video-compact.is-stale {
  border-color: color-mix(in srgb, var(--warning) 50%, var(--border));
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  color: var(--warning);
}

.timeline-video-compact.is-warning {
  border-color: color-mix(in srgb, var(--warning) 50%, var(--border));
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.timeline-video-compact.is-error {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.timeline-video-compact.is-empty {
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
  background: transparent;
  color: var(--text-secondary);
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
  padding: 8px 10px 10px;
  min-height: 0;
  background: transparent;
}

.timeline-track {
  display: grid;
  gap: 5px;
  overflow-y: auto;
  padding: 2px;
  max-height: 220px;
}

.timeline-card {
  background: color-mix(in srgb, var(--archive-paper-soft) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 34%, transparent);
  border-radius: 1px;
  padding: 5px 6px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  position: relative;
  min-width: 0;
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--archive-ink) 8%, transparent);
}

.timeline-card:hover {
  background: color-mix(in srgb, var(--archive-paper-soft) 88%, var(--archive-olive) 4%);
  border-color: color-mix(in srgb, var(--archive-olive) 38%, var(--archive-gold));
}

.timeline-card.active {
  border-color: color-mix(in srgb, var(--archive-olive) 64%, transparent);
  background: color-mix(in srgb, var(--archive-olive) 10%, var(--archive-paper-soft));
  box-shadow: inset 2px 0 0 var(--archive-olive);
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
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: 1px;
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  background: transparent;
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
  padding: 18px 10px;
  font-size: 12px;
  color: var(--text-muted);
  width: 100%;
  border: 1px dashed color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-soft) 62%, transparent);
}
</style>
