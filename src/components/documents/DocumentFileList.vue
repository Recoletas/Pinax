<script setup>
// 文档阅读器左栏：项目文件分组列表（只读）。
// 条目由 DocumentReader 组装：本地轨=目录分组；服务器轨=大纲结构/正文/构思/约束分区。
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { tr } from '../../i18n/index.js'

defineProps({
  groups: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})
defineEmits(['select'])
</script>

<template>
  <nav class="doc-file-list" :aria-label="tr('项目文件')" data-test="doc-file-list">
    <p v-if="loading" class="doc-file-list__hint" role="status">{{ tr('正在读取…') }}</p>
    <p v-else-if="!groups.length" class="doc-file-list__hint">{{ tr('没有可展示的文件。') }}</p>
    <template v-else>
      <section v-for="group in groups" :key="group.key" class="doc-file-list__group">
        <h3 class="doc-file-list__group-title">
          <WorkbenchIcon name="folder" :size="14" />
          <span>{{ group.label }}</span>
          <small v-if="group.note">{{ group.note }}</small>
        </h3>
        <ul class="doc-file-list__items">
          <li v-for="entry in group.entries" :key="entry.key">
            <button
              type="button"
              class="doc-file-list__item"
              :class="{ 'is-active': entry.key === activeKey, 'is-disabled': entry.disabled }"
              :disabled="entry.disabled"
              :data-test="`doc-file-${entry.key}`"
              :title="entry.sub || entry.label"
              @click="!entry.disabled && $emit('select', entry)"
            >
              <WorkbenchIcon :name="entry.icon || (entry.kind === 'json' ? 'markdown' : 'document')" :size="15" />
              <span class="doc-file-list__item-label">{{ entry.label }}</span>
              <small v-if="entry.sub" class="doc-file-list__item-sub">{{ entry.sub }}</small>
            </button>
          </li>
        </ul>
      </section>
    </template>
  </nav>
</template>

<style scoped>
.doc-file-list {
  min-width: 0;
  padding: 12px 10px 24px;
  overflow-y: auto;
  background: var(--surface-soft);
}
.doc-file-list__hint {
  margin: 0;
  padding: 10px 6px;
  color: var(--text-muted);
  font-size: 12.5px;
}
.doc-file-list__group {
  margin-bottom: 14px;
}
.doc-file-list__group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  padding: 0 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.doc-file-list__group-title small {
  margin-left: auto;
  overflow: hidden;
  max-width: 55%;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-file-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.doc-file-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  font-size: 12.5px;
  transition: background 140ms ease, color 140ms ease;
}
.doc-file-list__item:hover:not(:disabled),
.doc-file-list__item:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}
.doc-file-list__item.is-active {
  background: var(--accent-light);
  color: var(--text-primary);
}
.doc-file-list__item.is-disabled {
  opacity: 0.55;
  cursor: default;
}
.doc-file-list__item svg {
  flex: none;
}
.doc-file-list__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-file-list__item-sub {
  flex: none;
  margin-left: auto;
  overflow: hidden;
  max-width: 45%;
  color: var(--text-muted);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .doc-file-list__item { transition: none; }
}
</style>
