<template>
  <section class="entry-md-editor" aria-labelledby="entry-md-title">
    <header class="entry-md-head">
      <div>
        <span class="panel-kicker">{{ tr("条目正文") }}</span>
        <h3 id="entry-md-title">{{ tr("Markdown 稿面") }}</h3>
      </div>
      <div class="entry-md-actions">
        <button
          type="button"
          class="ghost-btn small"
          :aria-pressed="previewing.toString()"
          @click="previewing = !previewing"
        >
          {{ previewing ? tr("返回编辑") : tr("预览") }}
        </button>
      </div>
    </header>
    <p class="entry-md-hint">{{ tr("保存的原文即注入真相：预览仅供校对，不会改写正文。支持 # 标题、**加粗**、*斜体*、- 列表、[文字](链接) 与 [[词条引用]]。") }}</p>
    <textarea
      v-if="!previewing"
      :value="modelValue"
      class="entry-md-textarea"
      rows="14"
      spellcheck="false"
      :placeholder="tr('输入条目内容（Markdown）')"
      :aria-label="tr('条目正文')"
      @input="emit('update:modelValue', $event.target.value)"
    ></textarea>
    <div v-else class="entry-md-preview" data-test="md-preview" v-html="previewHtml"></div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n/index.js'

const props = defineProps({
  /** 条目正文（注入真相）；v-model:content 双向 */
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const previewing = ref(false)

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInline(text) {
  let html = escapeHtml(text)
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, ref) => `<span class="md-wikilink" title="${tr('词条引用')}">[[${ref}]]</span>`)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return html
}

/**
 * 极简 md 预览渲染器（≤80 行，零依赖）：标题/无序有序列表/引用/粗斜体/行内代码/
 * 链接/[[词条引用]] 高亮。输入先整体 HTML 转义再替换标记，无注入面。
 */
function renderMarkdownPreview(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n')
  const html = []
  let listMode = '' // 'ul' | 'ol'
  const closeList = () => {
    if (listMode) { html.push(`</${listMode}>`); listMode = '' }
  }
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level} class="md-h md-h${level}">${renderInline(heading[2])}</h${level}>`)
      continue
    }
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      if (listMode !== 'ul') { closeList(); html.push('<ul>'); listMode = 'ul' }
      html.push(`<li>${renderInline(unordered[1])}</li>`)
      continue
    }
    const ordered = /^\s*\d+[.、]\s+(.*)$/.exec(line)
    if (ordered) {
      if (listMode !== 'ol') { closeList(); html.push('<ol>'); listMode = 'ol' }
      html.push(`<li>${renderInline(ordered[1])}</li>`)
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      closeList()
      html.push(`<blockquote class="md-quote">${renderInline(quote[1])}</blockquote>`)
      continue
    }
    closeList()
    if (!line.trim()) { html.push('<p class="md-blank">&nbsp;</p>'); continue }
    html.push(`<p class="md-p">${renderInline(line)}</p>`)
  }
  closeList()
  return html.join('')
}

const previewHtml = computed(() => renderMarkdownPreview(props.modelValue))
</script>

<style scoped>
.entry-md-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 0 6px;
  border-top: 1px dashed var(--border, var(--border-subtle));
}

.entry-md-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry-md-head h3 {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-md-actions {
  display: flex;
  gap: 8px;
}

.entry-md-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--authoring-catalog-meta-size, 11px);
  line-height: 1.5;
}

.entry-md-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 240px;
  padding: 12px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
  background: var(--surface-workbench-muted, var(--bg-secondary));
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: 0;
}

.entry-md-textarea:focus {
  border-color: var(--accent-primary, var(--accent, #1677ff));
}

.entry-md-preview {
  box-sizing: border-box;
  min-height: 200px;
  max-height: 480px;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
  background: var(--surface-workbench-raised, var(--bg-primary));
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.8;
  word-break: break-word;
}

.entry-md-preview :deep(.md-h) {
  margin: 10px 0 4px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-md-preview :deep(.md-h1) { font-size: 18px; }
.entry-md-preview :deep(.md-h2) { font-size: 16px; }
.entry-md-preview :deep(.md-h3),
.entry-md-preview :deep(.md-h4) { font-size: 14px; }

.entry-md-preview :deep(.md-p) { margin: 2px 0; }
.entry-md-preview :deep(.md-blank) { margin: 0; height: 8px; }
.entry-md-preview :deep(ul),
.entry-md-preview :deep(ol) { margin: 4px 0; padding-left: 22px; }
.entry-md-preview :deep(.md-quote) {
  margin: 6px 0;
  padding: 4px 10px;
  border-left: 3px solid var(--accent-primary, var(--accent, #1677ff));
  color: var(--text-secondary);
}
.entry-md-preview :deep(a) { color: var(--accent-primary, var(--accent, #1677ff)); }
.entry-md-preview :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-primary) 8%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.entry-md-preview :deep(.md-wikilink) {
  padding: 0 3px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent-primary, var(--accent, #1677ff)) 14%, transparent);
  color: var(--accent-primary, var(--accent, #1677ff));
}

@media (max-width: 720px) {
  .entry-md-textarea { min-height: 180px; }
  .entry-md-preview { max-height: 360px; }
}

@media (pointer: coarse) {
  .entry-md-actions .ghost-btn { min-height: 44px; }
}
</style>
