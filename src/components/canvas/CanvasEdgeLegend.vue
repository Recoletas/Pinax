<script setup>
const props = defineProps({
  edgeTypes: { type: Array, required: true },
  linkingActive: { type: Boolean, default: false },
  edgeDeleteActive: { type: Boolean, default: false },
  activeLinkType: { type: String, default: '' },
  getPreviewStyle: { type: Function, required: true }
})

const emit = defineEmits(['toggle-linking', 'toggle-delete', 'activate-type'])

const hint = computed(() => {
  if (props.edgeDeleteActive) return '点击关系线删除，Esc 退出'
  if (props.linkingActive) return '拖动节点到目标节点'
  return '选线型后开启连线'
})
</script>

<script>
import { computed } from 'vue'
</script>

<template>
  <div class="canvas-edge-legend" :class="{ active: linkingActive || edgeDeleteActive }">
    <div class="canvas-edge-legend-head">
      <span class="legend-edge-title">关系线</span>
      <div class="legend-head-actions">
        <button class="legend-toggle-btn" :class="{ active: linkingActive }" type="button" @click="emit('toggle-linking')" :title="linkingActive ? '退出连线模式' : '连线模式'">
          <svg class="legend-action-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 12h8M5 12a3 3 0 116 0 3 3 0 01-6 0Zm8 0a3 3 0 116 0 3 3 0 01-6 0Z" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="legend-action-label">{{ linkingActive ? '连线中' : '连线' }}</span>
        </button>
        <button class="legend-delete-btn" :class="{ active: edgeDeleteActive }" type="button" @click="emit('toggle-delete')" :title="edgeDeleteActive ? '退出删线模式' : '删线模式'">
          <svg class="legend-action-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M9 6V4h6v2M6 6v14a2 2 0 002 2h10a2 2 0 002-2V6" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <button
      v-for="edgeType in edgeTypes"
      :key="edgeType.value"
      class="legend-edge-item"
      :class="{ active: activeLinkType === edgeType.value }"
      type="button"
      @click="emit('activate-type', edgeType.value)"
    >
      <span class="legend-line-preview" :style="getPreviewStyle(edgeType.value)"></span>
      <span>{{ edgeType.label }}</span>
    </button>
    <p class="legend-edge-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.canvas-edge-legend {
  position: sticky;
  top: 86px;
  float: right;
  z-index: 6;
  width: 132px;
  margin: 10px 12px 0 0;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--border) 66%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-panel) 94%, transparent);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--shadow-md) 22%, transparent);
  backdrop-filter: blur(12px) saturate(1.05);
  transition: width 0.16s ease, border-radius 0.16s ease, padding 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.canvas-edge-legend:hover,
.canvas-edge-legend.active {
  width: 164px;
  padding: 8px;
  border-radius: 10px;
  border-color: color-mix(in srgb, var(--accent) 18%, var(--border));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--shadow-md) 28%, transparent);
}

.canvas-edge-legend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  margin-bottom: 0;
  color: var(--text-primary);
}

.canvas-edge-legend:hover .canvas-edge-legend-head,
.canvas-edge-legend.active .canvas-edge-legend-head {
  margin-bottom: 6px;
}

.legend-edge-title {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
  font-size: 10px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: 0.25px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex: 1;
}

.legend-edge-title::before {
  content: '';
  width: 10px;
  height: 2px;
  flex-shrink: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 82%, transparent), color-mix(in srgb, var(--accent) 48%, var(--text-primary)));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 8%, transparent);
}

.legend-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.12px;
  cursor: pointer;
  box-shadow: none;
  transition: width 0.15s ease, background 0.15s, border-color 0.15s, color 0.15s;
  overflow: hidden;
}

.legend-action-icon {
  flex-shrink: 0;
}

.legend-action-label {
  display: none;
  white-space: nowrap;
}

.legend-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.canvas-edge-legend:hover .legend-toggle-btn,
.canvas-edge-legend.active .legend-toggle-btn {
  width: auto;
  min-width: 56px;
  height: 24px;
  gap: 5px;
  padding: 0 8px;
  font-size: 10px;
}

.canvas-edge-legend:hover .legend-action-label,
.canvas-edge-legend.active .legend-action-label {
  display: inline;
}

.legend-toggle-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
  color: var(--accent);
}

.legend-toggle-btn.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-primary));
  color: var(--accent);
}

.legend-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.legend-delete-btn:hover {
  border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
  color: var(--danger);
}

.legend-delete-btn.active {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, var(--bg-primary));
  color: var(--danger);
}

.legend-edge-item {
  width: 100%;
  display: none;
  grid-template-columns: 32px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.canvas-edge-legend:hover .legend-edge-item,
.canvas-edge-legend.active .legend-edge-item {
  display: grid;
}

.legend-edge-item:hover,
.legend-edge-item.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.legend-line-preview {
  display: block;
  width: 32px;
  height: 0;
}

.legend-edge-hint {
  display: none;
  margin: 5px 0 0;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.35;
}

.canvas-edge-legend:hover .legend-edge-hint,
.canvas-edge-legend.active .legend-edge-hint {
  display: block;
}
</style>
