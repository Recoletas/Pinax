<template>
  <div class="marker-editor">
    <div class="editor-header">
      <h3 class="editor-title">标记属性</h3>
      <button class="icon-btn-xs" @click="$emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="editor-body">
      <div class="field">
        <label class="field-label">名称</label>
        <input class="text-input" v-model="name" @blur="commitName" />
      </div>

      <div class="field">
        <label class="field-label">类型</label>
        <select class="text-input" :value="marker.type" @change="updateType">
          <option v-for="opt in MARKER_TYPES" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">重要度 <span class="accent">{{ marker.importance }}</span></label>
        <input
          type="range" min="1" max="5" step="1"
          :value="marker.importance"
          @input="$emit('update', marker.id, { importance: Number($event.target.value) })"
          class="range-input"
        />
        <div class="range-labels">
          <span>1 路边</span>
          <span>3 一般</span>
          <span>5 核心</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">所属势力</label>
        <input class="text-input" v-model="faction" @blur="commitFaction" placeholder="如：天龙帝国、无主之地" />
      </div>

      <div class="field">
        <label class="field-label">备注</label>
        <textarea class="text-area" v-model="note" @blur="commitNote" placeholder="关于这个地点的补充说明..." rows="4"></textarea>
      </div>

      <div class="coord-grid">
        <div class="field">
          <label class="field-label">X</label>
          <input class="text-input readonly" :value="Math.round(marker.x)" readonly />
        </div>
        <div class="field">
          <label class="field-label">Y</label>
          <input class="text-input readonly" :value="Math.round(marker.y)" readonly />
        </div>
      </div>

      <div v-if="marker.userAdded" class="user-badge">用户手动添加</div>
    </div>

    <div class="editor-footer">
      <button class="danger-btn" @click="$emit('delete', marker.id)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        删除标记
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { MARKER_TYPES } from '../../config/geography-types'

const props = defineProps({
  marker: { type: Object, required: true }
})

const emit = defineEmits(['update', 'delete', 'close'])

const name = ref(props.marker.name)
const note = ref(props.marker.note || '')
const faction = ref(props.marker.faction || '')

// Sync local edits when the parent swaps in a different marker
// (e.g. user opens a new marker from the canvas) or when external
// code updates the same marker's fields while the editor is open.
watch(() => props.marker, (next) => {
  name.value = next.name
  note.value = next.note || ''
  faction.value = next.faction || ''
}, { deep: true })

function commitName() {
  if (name.value.trim() && name.value !== props.marker.name) {
    emit('update', props.marker.id, { name: name.value.trim() })
  }
}

function commitNote() {
  if (note.value !== (props.marker.note || '')) {
    emit('update', props.marker.id, { note: note.value })
  }
}

function commitFaction() {
  if (faction.value !== (props.marker.faction || '')) {
    emit('update', props.marker.id, { faction: faction.value })
  }
}

function updateType(e) {
  emit('update', props.marker.id, { type: e.target.value })
}
</script>

<style scoped>
.marker-editor {
  width: 280px;
  background: var(--canvas-overlay-strong);
  border: 1px solid var(--canvas-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: auto;
  max-height: 75vh;
  overflow-y: auto;
  position: absolute;
  top: 48px;
  right: 12px;
  z-index: 20;
  box-shadow: var(--shadow-floating);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--canvas-border);
}

.editor-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--canvas-text);
}

.editor-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--canvas-text-secondary);
}

.accent {
  color: var(--accent);
}

.text-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--canvas-surface);
  border: 1px solid var(--canvas-border);
  border-radius: 8px;
  color: var(--canvas-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-input:focus {
  border-color: var(--accent);
}

.text-input.readonly {
  color: var(--canvas-text-muted);
  font-size: 12px;
}

.text-area {
  width: 100%;
  padding: 8px 10px;
  background: var(--canvas-surface);
  border: 1px solid var(--canvas-border);
  border-radius: 8px;
  color: var(--canvas-text);
  font-size: 13px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-area:focus {
  border-color: var(--accent);
}

.range-input {
  width: 100%;
  accent-color: var(--accent);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--canvas-text-muted);
  margin-top: 2px;
}

.coord-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.user-badge {
  font-size: 10px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-radius: 999px;
  padding: 1px 6px;
  display: inline-block;
}

.editor-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--canvas-border);
}

.danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  color: var(--danger);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.danger-btn:hover {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.icon-btn-xs {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--canvas-text-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.icon-btn-xs:hover {
  background: var(--canvas-border);
  color: var(--canvas-text);
}
</style>
