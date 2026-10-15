<template>
  <div class="entry-cards">
    <button
      v-for="entry in entries"
      :key="entry.id"
      type="button"
      :class="['entry-card', { on: entry.id === selectedId }]"
      :style="{ '--card-signal': catColorOf(entryCatDirOf(entry)) }"
      @click="emit('select', entry)"
    >
      <span class="card-head">
        <b class="card-title">{{ entry.name || tr('未命名条目') }}</b>
        <span :class="['status-badge', `is-${entryStatusOf(entry)}`]">{{ statusLabel(entryStatusOf(entry)) }}</span>
      </span>
      <span class="card-meta">
        <span class="card-cat" :style="{ color: catColorOf(entryCatDirOf(entry)), borderColor: catColorOf(entryCatDirOf(entry)) }">
          {{ entryCatDirOf(entry) }}
        </span>
        <span class="card-kind">{{ kindLabelOf(entry) }}</span>
        <span v-if="entry.injection?.group" class="card-group">{{ entry.injection.group }}</span>
      </span>
      <span v-if="entryTagsOf(entry).length" class="card-tags">{{ entryTagsOf(entry).join(' · ') }}</span>
      <span class="card-foot">{{ tr('关联 {count} 条', { count: relationRefsOf(entry).length }) }}</span>
    </button>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import {
  catColorOf,
  entryCatDirOf,
  entryStatusOf,
  entryTagsOf,
  kindLabelOf,
  relationRefsOf
} from '../../services/worldbook/entryBrowserModel.js'

defineProps({
  /** 可见条目（filterEntries 产物，运行时 Entry 形状） */
  entries: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' }
})

const emit = defineEmits(['select'])

const STATUS_LABELS = { draft: '草稿', active: '激活', retired: '退役' }
function statusLabel(status) {
  return tr(STATUS_LABELS[status] || status)
}
</script>

<style scoped>
.entry-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--card-signal);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.entry-card:hover {
  border-color: color-mix(in srgb, var(--card-signal) 45%, var(--border));
}

.entry-card.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.card-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  justify-content: space-between;
}

.card-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.card-cat {
  font-size: 11px;
  line-height: 1;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 999px;
}

.card-kind,
.card-group {
  font-size: 11px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.card-group {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.card-tags {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-foot {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
