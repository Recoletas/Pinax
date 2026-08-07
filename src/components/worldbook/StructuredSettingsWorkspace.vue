<template>
  <div class="settings-workspace">
    <details v-if="sourceDocuments.length && !isKao" class="source-archive">
      <summary>
        <span>原始资料</span>
        <small>{{ sourceDocuments.length }} 份 · {{ sourceCharacterCount.toLocaleString('zh-CN') }} 字</small>
      </summary>
      <div class="source-archive__body">
        <section v-for="document in sourceDocuments" :key="document.id" class="source-document">
          <header>
            <strong>{{ document.title }}</strong>
            <span>{{ document.sourceLabel || '导入资料' }}</span>
            <span v-if="document.truncated">已保留前 {{ document.content.length.toLocaleString('zh-CN') }} 字</span>
          </header>
          <pre>{{ document.content }}</pre>
        </section>
      </div>
    </details>
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

const { hintsOpen } = useSettingKeyboardShortcuts({
  save: () => panelRef.value?.flushAll?.(),
  undo: () => panelRef.value?.undoCurrentField?.(),
  redo: () => panelRef.value?.redoCurrentField?.()
})

const sourceDocuments = computed(() => Array.isArray(props.worldbook?.sourceDocuments)
  ? props.worldbook.sourceDocuments.filter((document) => String(document?.content || '').trim())
  : [])
const sourceCharacterCount = computed(() => sourceDocuments.value.reduce(
  (total, document) => total + String(document.content || '').length,
  0
))
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

.source-archive {
  flex: 0 0 auto;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 74%, transparent);
}

.source-archive > summary {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}

.source-archive > summary::-webkit-details-marker {
  display: none;
}

.source-archive > summary::before {
  content: '›';
  color: var(--accent);
  font-size: 16px;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

.source-archive[open] > summary::before {
  transform: rotate(90deg);
}

.source-archive > summary small {
  color: var(--text-muted);
  font-weight: 500;
}

.source-archive__body {
  max-height: 260px;
  overflow: auto;
  padding: 0 14px 10px 36px;
}

.source-document + .source-document {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
}

.source-document header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 13px;
}

.source-document header strong {
  color: var(--text-primary);
  font-size: 16px;
}

.source-document pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font: inherit;
  font-size: 16px;
  line-height: 1.7;
}

</style>
