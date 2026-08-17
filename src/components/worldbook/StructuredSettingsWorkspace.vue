<template>
  <div class="settings-workspace">
    <section v-if="sourceDocuments.length && !isKao" class="source-rail" aria-label="来源资料">
      <div class="source-rail__lead">
        <span class="source-rail__mark">来源</span>
        <strong>{{ sourceDocuments.length }} 份资料</strong>
        <small>{{ sourceCharacterCount.toLocaleString('zh-CN') }} 字 · 生成时按分区筛选</small>
      </div>
      <div class="source-rail__items" role="list">
        <button
          v-for="document in sourceDocuments"
          :key="document.id"
          type="button"
          class="source-chip"
          :class="{ active: activeSourceId === document.id }"
          :aria-pressed="activeSourceId === document.id"
          @click="toggleSource(document.id)"
        >
          <span class="source-chip__kind">{{ sourceKindLabel(document.sourceLabel) }}</span>
          <span class="source-chip__title">{{ document.title }}</span>
          <span v-if="document.truncated" class="source-chip__mark">截取</span>
        </button>
      </div>
      <div v-if="activeSource" class="source-preview">
        <div class="source-preview__head">
          <div>
            <strong>{{ activeSource.title }}</strong>
            <span>{{ activeSource.sourceLabel || '导入资料' }} · {{ sourceLength(activeSource).toLocaleString('zh-CN') }} 字{{ activeSource.truncated ? ' · 当前为预览' : '' }}</span>
          </div>
          <button type="button" class="source-preview__close" aria-label="关闭资料预览" title="关闭资料预览" @click="activeSourceId = ''">×</button>
        </div>
        <pre>{{ sourcePreview(activeSource) }}</pre>
      </div>
    </section>
    <StructuredSettingsPanel
      v-if="worldbook"
      ref="panelRef"
      :worldbook="worldbook"
    />
    <div v-else class="empty-state">
      <p>请选择一个世界书开始编辑结构化设定</p>
    </div>

    <SettingKeyboardHints :open="hintsOpen" @close="hintsOpen = false" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingKeyboardShortcuts } from '../../composables/useSettingKeyboardShortcuts'
import { useTheme } from '../../composables/useTheme'
import StructuredSettingsPanel from './StructuredSettingsPanel.vue'
import SettingKeyboardHints from './SettingKeyboardHints.vue'

const props = defineProps({
  worldbook: { type: Object, default: null }
})
const { isKao } = useTheme()

const panelRef = ref(null)
const activeSourceId = ref('')

const { hintsOpen } = useSettingKeyboardShortcuts({
  save: () => panelRef.value?.flushAll?.(),
  undo: () => panelRef.value?.undoCurrentField?.(),
  redo: () => panelRef.value?.redoCurrentField?.()
})

const sourceDocuments = computed(() => Array.isArray(props.worldbook?.sourceDocuments)
  ? props.worldbook.sourceDocuments.filter((document) => sourcePreview(document).trim())
  : [])
const sourceCharacterCount = computed(() => sourceDocuments.value.reduce(
  (total, document) => total + sourceLength(document),
  0
))
const activeSource = computed(() => sourceDocuments.value.find((document) => document.id === activeSourceId.value) || null)

function sourceLength(document) {
  return Math.max(
    sourcePreview(document).length,
    Number(document?.normalizedLength) || 0,
    Number(document?.originalLength) || 0
  )
}

function sourcePreview(document) {
  return String(document?.content || document?.contentPreview || document?.preview || '').trim()
}

function toggleSource(sourceId) {
  activeSourceId.value = activeSourceId.value === sourceId ? '' : sourceId
}

function sourceKindLabel(label) {
  const value = String(label || '').toLowerCase()
  if (value.includes('pdf')) return 'PDF'
  if (value.includes('doc')) return 'DOC'
  if (value.includes('粘贴')) return '文本'
  return '资料'
}
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

.source-rail {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
}

.source-rail__lead {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  column-gap: 7px;
  row-gap: 2px;
  min-width: 190px;
}

.source-rail__lead strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 680;
}

.source-rail__lead small {
  grid-column: 2;
  color: var(--text-muted);
  font-size: 10px;
}

.source-rail__mark {
  grid-row: span 2;
  align-self: center;
  padding: 4px 5px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 72%, var(--border));
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.08em;
  writing-mode: vertical-rl;
}

.source-rail__items {
  display: flex;
  min-width: 0;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: max-content;
  max-width: 240px;
  padding: 7px 9px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.source-chip:hover,
.source-chip.active {
  border-bottom-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--text-primary);
}

.source-chip__kind,
.source-chip__mark {
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.source-chip__title {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-preview {
  grid-column: 1 / -1;
  min-width: 0;
  padding: 12px 14px 14px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 3%, transparent);
}

.source-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.source-preview__head > div {
  display: grid;
  gap: 2px;
}

.source-preview__head strong {
  color: var(--text-primary);
  font-size: 13px;
}

.source-preview__head span {
  color: var(--text-muted);
  font-size: 10px;
}

.source-preview__close {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.source-preview__close:hover {
  color: var(--text-primary);
}

.source-preview pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 1.65;
}

@media (max-width: 720px) {
  .source-rail {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .source-rail__lead {
    min-width: 0;
  }

  .source-rail__items {
    margin-inline: -2px;
  }
}
</style>
