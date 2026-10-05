<template>
  <div class="settings-workspace">
    <StructuredSettingsPanel
      v-if="worldbook"
      ref="panelRef"
      :worldbook="worldbook"
    >
      <template #sources>
        <section v-if="sourceDocuments.length" class="source-rail" :aria-label="tr('来源资料')">
          <div class="source-rail__lead">
            <span class="source-rail__mark">{{ tr('来源') }}</span>
            <strong :aria-label="tr('{count} 份资料', { count: sourceDocuments.length })">{{ sourceDocuments.length }}</strong>
            <small>{{ tr('{count} 字 · 生成时按分区筛选', { count: formatUiNumber(sourceCharacterCount) }) }}</small>
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
              <span v-if="document.truncated" class="source-chip__mark">{{ tr('截取') }}</span>
            </button>
          </div>
          <div v-if="activeSource" class="source-preview">
            <div class="source-preview__head">
              <div>
                <strong>{{ activeSource.title }}</strong>
                <span>{{ tr(activeSource.sourceLabel || '导入资料') }} · {{ tr('{count} 字', { count: formatUiNumber(sourceLength(activeSource)) }) }}{{ activeSource.truncated ? tr(' · 当前为预览') : '' }}</span>
              </div>
              <button type="button" class="source-preview__close" :aria-label="tr('关闭资料预览')" :title="tr('关闭资料预览')" @click="activeSourceId = ''">×</button>
            </div>
            <pre>{{ sourcePreview(activeSource) }}</pre>
          </div>
        </section>
      </template>
    </StructuredSettingsPanel>
    <div v-else class="empty-state">
      <p>{{ tr('请选择一个世界书开始编辑结构化设定') }}</p>
    </div>

    <SettingKeyboardHints :open="hintsOpen" @close="hintsOpen = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { tr, formatUiNumber } from '../../i18n/index.js'
import { useSettingKeyboardShortcuts } from '../../composables/useSettingKeyboardShortcuts'
import StructuredSettingsPanel from './StructuredSettingsPanel.vue'
import SettingKeyboardHints from './SettingKeyboardHints.vue'

const props = defineProps({
  worldbook: { type: Object, default: null }
})
const panelRef = ref(null)
const activeSourceId = ref('')
watch(() => props.worldbook?.id, () => { activeSourceId.value = '' })

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
  if (value.includes('粘贴') || value.includes('paste')) return tr('文本')
  return tr('资料')
}
</script>

<style scoped>
.settings-workspace { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--surface-workbench-canvas); font-family: var(--font-sans); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font: 14px/1.7 var(--font-sans); }
.source-rail { flex: 0 0 auto; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px; min-height: 40px; padding: 2px 24px; border-radius: 20px 20px 0 0; background: var(--surface-workbench); border-bottom: 1px solid var(--hairline-soft); }
.source-rail__lead { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--text-secondary); font: 12px/1.5 var(--font-sans); white-space: nowrap; }
.source-rail__lead strong { color: var(--text-primary); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.source-rail__lead small { color: var(--text-secondary); font-size: 12px; margin-left: 6px; }
.source-rail__mark { color: var(--text-secondary); font: inherit; }
.source-rail__items { display: flex; min-width: 0; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.source-chip { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; max-width: 240px; min-height: 32px; padding: 5px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; transition: color .16s ease, background .16s ease; }
.source-chip:hover { background: var(--nav-hover); color: var(--text-primary); }
.source-chip.active { background: var(--nav-selected); color: var(--text-primary); }
.source-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.source-chip__kind, .source-chip__mark { color: var(--text-secondary); font: 11px/1.5 var(--font-sans); }
.source-chip__title { overflow: hidden; font: 12px/1.5 var(--font-sans); text-overflow: ellipsis; white-space: nowrap; }
.source-preview { grid-column: 1 / -1; min-width: 0; margin: 6px 0 12px; padding: 16px; border-radius: 16px; background: var(--surface-workbench-muted); }
.source-preview__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.source-preview__head > div { display: grid; min-width: 0; gap: 4px; }
.source-preview__head strong { color: var(--text-primary); font: 500 14px/1.5 var(--font-sans); overflow-wrap: anywhere; }
.source-preview__head span { color: var(--text-secondary); font: 12px/1.5 var(--font-sans); }
.source-preview__close { flex: 0 0 36px; width: 36px; height: 36px; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary); font-size: 22px; cursor: pointer; }
.source-preview__close:hover { color: var(--text-primary); background: var(--nav-hover); }
.source-preview__close:focus-visible { outline: 2px solid var(--accent); }
.source-preview pre { margin: 12px 0 0; max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); font: 14px/1.75 var(--font-sans); }
@media (max-width: 760px) { .source-rail { gap: 8px; padding-inline: 16px; } .source-rail__lead small { display: none; } .source-chip { min-height: 44px; } .source-preview__close { flex-basis: 44px; width: 44px; height: 44px; } }
@media (pointer: coarse) { .source-chip { min-height: 44px; } .source-preview__close { flex-basis: 44px; width: 44px; height: 44px; } }
@media (prefers-reduced-motion: reduce) { .source-chip { transition: none; } }
</style>
