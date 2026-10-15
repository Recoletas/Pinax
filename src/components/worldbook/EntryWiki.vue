<template>
  <article class="entry-wiki">
    <header class="wiki-head">
      <b class="wiki-title">{{ entry.name || tr('未命名条目') }}</b>
      <span :class="['status-badge', `is-${status}`]">{{ statusLabel(status) }}</span>
      <span class="wiki-cat" :style="{ color: catColor, borderColor: catColor }">{{ catDir }}</span>
      <span class="wiki-kind">{{ kindLabelOf(entry) }}</span>
      <span v-if="entry.injection?.group" class="wiki-group">{{ entry.injection.group }}</span>
      <span class="wiki-spacer" />
      <button type="button" class="wiki-back" @click="emit('back')">{{ tr('← 返回列表') }}</button>
    </header>

    <p v-if="keysText" class="wiki-keys">{{ tr('触发词') }}：{{ keysText }}</p>

    <p v-if="lede" class="wiki-lede" :style="{ borderColor: catColor }">{{ lede }}</p>

    <details v-if="hasMoreBody" class="wiki-full">
      <summary>{{ tr('展开全文') }}</summary>
      <p class="wiki-body">{{ entry.content }}</p>
    </details>

    <footer class="wiki-links">
      <span class="wiki-links-label">{{ tr('关联词条 · {count}（点击就地跳转）', { count: chips.length }) }}</span>
      <div class="wiki-chips">
        <button
          v-for="chip in chips"
          :key="chip.ref"
          type="button"
          :class="['wiki-chip', { unresolved: !chip.resolved }]"
          :disabled="!chip.resolved"
          :title="chipTitle(chip)"
          @click="chip.resolved && emit('jump', chip.entry)"
        >
          <span v-if="chip.resolved" class="chip-dot" :style="{ background: catColorOf(chip.entry.cat) }" />
          <span class="chip-label">{{ chipLabel(chip) }}</span>
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  buildRelationChips,
  catColorOf,
  entryCatDirOf,
  entryLedeOf,
  entryStatusOf,
  kindLabelOf
} from '../../services/worldbook/entryBrowserModel.js'

const props = defineProps({
  /** 选中条目（运行时 Entry 形状，只读展示） */
  entry: { type: Object, required: true },
  /** 全量条目：chips 四级兜底解析的解析域 */
  entries: { type: Array, default: () => [] }
})

const emit = defineEmits(['back', 'jump'])

const status = computed(() => entryStatusOf(props.entry))
const catDir = computed(() => entryCatDirOf(props.entry))
const catColor = computed(() => catColorOf(catDir.value))
const lede = computed(() => entryLedeOf(props.entry))
const hasMoreBody = computed(() => {
  const content = typeof props.entry?.content === 'string' ? props.entry.content : ''
  return Boolean(content) && content.trim() !== lede.value
})
const keysText = computed(() => {
  const keys = [...(Array.isArray(props.entry?.keys) ? props.entry.keys : []), ...(Array.isArray(props.entry?.keysSecondary) ? props.entry.keysSecondary : [])]
    .map((key) => String(key || '').trim())
    .filter(Boolean)
  return keys.join('、')
})
const chips = computed(() => buildRelationChips(props.entry, props.entries))

const STATUS_LABELS = { draft: '草稿', active: '激活', retired: '退役' }
function statusLabel(value) {
  return tr(STATUS_LABELS[value] || value)
}

function chipLabel(chip) {
  if (!chip.resolved) return tr('{ref}（未解析）', { ref: chip.ref })
  return chip.entry.title
}

function chipTitle(chip) {
  if (!chip.resolved) return tr('引用解析不中：{ref}', { ref: chip.ref })
  const tags = Array.isArray(chip.entry.tags) ? chip.entry.tags.join(' · ') : ''
  return `${chip.entry.cat}${tags ? ` · ${tags}` : ''}`
}
</script>

<style scoped>
.entry-wiki {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 980px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-primary);
}

.wiki-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.wiki-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
}

.status-badge.is-active {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}

.status-badge.is-draft {
  border-color: color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--warning);
}

.wiki-cat {
  font-size: 11px;
  line-height: 1;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 999px;
}

.wiki-kind,
.wiki-group {
  font-size: 11px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.wiki-group {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.wiki-spacer {
  flex: 1;
}

.wiki-back {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.wiki-back:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.wiki-keys {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.wiki-lede {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  border-left: 3px solid var(--accent);
  padding-left: 10px;
  white-space: pre-wrap;
}

.wiki-full summary {
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.wiki-body {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.wiki-links {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.wiki-links-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.wiki-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.wiki-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
}

.wiki-chip:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.wiki-chip.unresolved {
  color: var(--text-muted);
  cursor: not-allowed;
  border-style: dashed;
}

.chip-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 999px;
}

.chip-label {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
