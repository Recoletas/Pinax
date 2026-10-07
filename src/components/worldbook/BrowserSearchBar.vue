<template>
  <div class="browser-search">
    <input
      class="browser-search-input"
      type="search"
      :value="query"
      :placeholder="tr('检索：标题 / 触发词 / 标签 / 摘要（本地即时轨）')"
      :aria-label="tr('检索条目')"
      @input="emit('update:query', $event.target.value)"
      @keydown.enter="emit('submit')"
    />
    <span class="browser-search-count" role="status">{{ tr('命中 {count}', { count: resultCount }) }}</span>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'

/**
 * 双轨检索的本地轨输入条（W2·B1，kit 顶栏检索蓝本）：
 * 纯受控输入，打分/过滤在 entryBrowserModel.filterEntries；无任何写副作用。
 */
defineProps({
  query: { type: String, default: '' },
  resultCount: { type: Number, default: 0 }
})

const emit = defineEmits(['update:query', 'submit'])
</script>

<style scoped>
.browser-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.browser-search-input {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.browser-search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.browser-search-input::placeholder {
  color: var(--text-muted);
}

.browser-search-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
