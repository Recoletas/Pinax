<template>
  <nav class="cat-tree" aria-label="条目分类">
    <button type="button" :class="['cat-node', { on: !selected }]" @click="emit('select', '')">
      <span class="cat-label">{{ tr('全部') }}</span>
      <span class="cat-count">{{ tree.total }}</span>
    </button>
    <template v-for="cat in tree.cats" :key="cat.id">
      <button type="button" :class="['cat-node', { on: selected === cat.id }]" @click="emit('select', cat.id)">
        <span class="cat-dot" :style="{ background: catColorOf(cat.id) }" />
        <span class="cat-label">{{ cat.label }}</span>
        <span class="cat-count">{{ cat.count }}</span>
      </button>
      <button
        v-for="group in cat.groups"
        :key="group.id"
        type="button"
        :class="['cat-node', 'is-group', { on: selected === group.id }]"
        @click="emit('select', group.id)"
      >
        <span class="cat-label">{{ group.label }}</span>
        <span class="cat-count">{{ group.count }}</span>
      </button>
    </template>
  </nav>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { catColorOf } from '../../services/worldbook/entryBrowserModel.js'

defineProps({
  /** buildCategoryTree 产物：{ total, cats: [{ id, label, count, groups }] } */
  tree: { type: Object, default: () => ({ total: 0, cats: [] }) },
  /** 当前选中：'' = 全部；'人物' = 目录；'人物/皇室' = 目录+分组 */
  selected: { type: String, default: '' }
})

const emit = defineEmits(['select'])
</script>

<style scoped>
.cat-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cat-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.cat-node:hover {
  border-color: var(--border);
  color: var(--text-primary);
}

.cat-node.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.cat-node.is-group {
  padding-left: 26px;
}

.cat-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 999px;
}

.cat-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.cat-node.on .cat-count {
  color: var(--accent);
}
</style>
