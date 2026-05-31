<template>
  <section v-if="draft" class="setting-draft-review">
    <div class="draft-head">
      <div>
        <p class="draft-kicker">AI 草稿</p>
        <h3>{{ draft.fieldLabel }}</h3>
      </div>
      <button class="ghost-btn small" @click="$emit('discard')">丢弃</button>
    </div>

    <textarea
      class="text-area"
      rows="8"
      :value="draft.content"
      @input="$emit('update:content', $event.target.value)"
    ></textarea>

    <details class="prompt-preview">
      <summary>查看本次提示词</summary>
      <pre>{{ draft.promptPreview }}</pre>
    </details>

    <div class="card-actions">
      <button class="primary-btn" @click="$emit('save-field')">采纳到字段</button>
      <button class="ghost-btn" @click="$emit('convert-entry')">转为世界书条目</button>
      <button class="ghost-btn" @click="$emit('copy')">复制</button>
    </div>
  </section>
</template>

<script setup>
defineProps({
  draft: {
    type: Object,
    default: null
  }
})

defineEmits(['discard', 'update:content', 'save-field', 'convert-entry', 'copy'])
</script>

<style scoped>
.setting-draft-review {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.draft-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.draft-kicker {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.draft-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.prompt-preview {
  font-size: 12px;
  color: var(--text-secondary);
}

.prompt-preview summary {
  cursor: pointer;
}

.prompt-preview pre {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  max-height: 200px;
  overflow: auto;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
