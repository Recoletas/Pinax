<template>
  <div class="browser-search">
    <input
      class="browser-search-input"
      type="search"
      :value="query"
      :placeholder="tr('检索：标题 / 触发词 / 标签 / 摘要（kit 知识检索）')"
      :aria-label="tr('检索条目')"
      @input="emit('update:query', $event.target.value)"
      @keydown.enter="emit('submit')"
    />
    <button
      type="button"
      class="browser-search-go"
      :disabled="searching || !query.trim()"
      @click="emit('submit')"
    >
      {{ searching ? tr('检索中…') : tr('检索') }}
    </button>
    <span class="browser-search-count" role="status">{{ tr('命中 {count}', { count: resultCount }) }}</span>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'

/**
 * 检索输入条（W1-A 起走 kit worldbook_search 同源代理）：纯受控输入 + 提交按钮，
 * 打分/一跳扩展全部来自 kit 返回值（UnifiedEntryBrowser 调 knowledgeSearchClient）；
 * 本地只剩 cat/status 过滤。无任何写副作用。
 */
defineProps({
  query: { type: String, default: '' },
  resultCount: { type: Number, default: 0 },
  searching: { type: Boolean, default: false }
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

.browser-search-go {
  flex-shrink: 0;
  min-height: 34px;
  padding: 4px 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.browser-search-go:disabled {
  opacity: 0.55;
  cursor: default;
}

.browser-search-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
