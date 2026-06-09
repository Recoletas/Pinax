<template>
  <div class="settings-workspace">
    <StructuredSettingsPanel
      v-if="worldbook"
      ref="panelRef"
      :worldbook="worldbook"
      @saved="onSaved"
    />
    <div v-else class="empty-state">
      <p>请选择一个世界书开始编辑结构化设定</p>
    </div>

    <footer v-if="worldbook" class="status-bar" aria-label="状态栏">
      <div class="status-main">
        <div class="status-segment worldbook-name">
          <span class="status-label">世界书</span>
          <span class="status-value">{{ worldbook.name }}</span>
        </div>
        <div class="status-progress" aria-hidden="true">
          <span :style="{ width: `${filledPercent}%` }"></span>
        </div>
      </div>
      <div class="status-segment">
        <span class="status-label">字段</span>
        <span class="status-value">{{ filledCount }} / {{ totalCount }}</span>
      </div>
      <div class="status-segment">
        <span class="status-label">保存</span>
        <span class="status-value">{{ lastSaveDisplay }}</span>
      </div>
      <button
        type="button"
        class="status-help-btn"
        aria-label="显示快捷键提示"
        @click="hintsOpen = true"
      >?</button>
    </footer>

    <SettingKeyboardHints :open="hintsOpen" @close="hintsOpen = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSettingLastSave } from '../../composables/useSettingLastSave'
import { useSettingKeyboardShortcuts } from '../../composables/useSettingKeyboardShortcuts'
import { normalizeStructuredSettings } from '../../services/settingPanelSchema'
import StructuredSettingsPanel from './StructuredSettingsPanel.vue'
import SettingKeyboardHints from './SettingKeyboardHints.vue'

const props = defineProps({
  worldbook: { type: Object, default: null }
})

const panelRef = ref(null)
const lastSaveTrigger = ref(null)
const _counts = ref({ filled: 0, total: 0 })

const { displayText: lastSaveDisplay } = useSettingLastSave(lastSaveTrigger)

const { hintsOpen } = useSettingKeyboardShortcuts({
  save: () => panelRef.value?.flushAll?.(),
  undo: () => panelRef.value?.undoCurrentField?.(),
  redo: () => panelRef.value?.redoCurrentField?.()
})

const filledCount = computed(() => _counts.value.filled)
const totalCount = computed(() => _counts.value.total)
const filledPercent = computed(() => {
  if (!totalCount.value) return 0
  return Math.round((filledCount.value / totalCount.value) * 100)
})

function updateCounts() {
  if (!props.worldbook) {
    _counts.value = { filled: 0, total: 0 }
    return
  }
  const settings = normalizeStructuredSettings(props.worldbook?.structuredSettings)
  let filled = 0, total = 0
  for (const section of Object.keys(settings)) {
    for (const field of Object.keys(settings[section])) {
      total++
      if (String(settings[section][field] || '').trim()) filled++
    }
  }
  _counts.value = { filled, total }
}

// 监听 structuredSettings 变化 → 每次保存（来自 store 的 reactive 更新）刷新计数 + lastSave 时间
watch(
  () => props.worldbook?.structuredSettings,
  () => {
    updateCounts()
  },
  { deep: true }
)

watch(
  () => props.worldbook?.updatedAt,
  (updatedAt) => {
    if (updatedAt) lastSaveTrigger.value = updatedAt
  },
  { immediate: true }
)

function onSaved(savedAt) {
  lastSaveTrigger.value = savedAt || Date.now()
}

updateCounts()
</script>

<style scoped>
.settings-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  border: 1px dashed color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
}

.status-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, transparent), color-mix(in srgb, var(--bg-primary) 84%, var(--bg-secondary)));
  backdrop-filter: blur(8px);
  font-size: 11px;
  color: var(--text-muted);
  flex-wrap: wrap;
  z-index: 3;
}

.status-main {
  min-width: min(280px, 100%);
  display: grid;
  gap: 5px;
  flex: 1;
}

.status-segment {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.status-label {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 9px;
  white-space: nowrap;
}

.status-value {
  color: var(--text-primary);
  font-weight: 650;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.worldbook-name .status-value {
  max-width: 360px;
}

.status-progress {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 52%, transparent);
}

.status-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent-teal, var(--accent)) 72%, var(--accent)));
  transition: width 0.2s ease;
}

.status-help-btn {
  margin-left: auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
  color: var(--text-muted);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  font-family: ui-monospace, monospace;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.status-help-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.status-help-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

@media (max-width: 720px) {
  .status-bar {
    gap: 8px;
  }

  .status-main {
    flex-basis: 100%;
  }
}
</style>
