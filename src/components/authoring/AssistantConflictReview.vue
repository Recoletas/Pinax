<script setup>
import { ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { getItem, STORAGE_KEYS } from '../../composables/useStorage.js'
import { previewAssistantConflict } from '../../services/agents/storyagent/assistantEditConflict.js'

const props = defineProps({ change: { type: Object, required: true }, proposal: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['resolve', 'keep'])
const preview = ref(null), desired = ref(''), error = ref('')
function load() {
  error.value = ''; preview.value = null
  try {
    const book = (getItem(STORAGE_KEYS.WRITING_BOOKS, []) || []).find(item => String(item.id) === props.proposal.bookId)
    if (!book) throw new Error('找不到这本作品，建议已保留。')
    const worldbook = book.worldbookId ? getItem(`worldbook_${book.worldbookId}`) : null
    preview.value = previewAssistantConflict(props.change, { book, worldbook })
    desired.value = preview.value.desired
  } catch (failure) { error.value = failure.message }
}
watch(() => `${props.proposal.id}:${props.change.changeId}`, load, { immediate: true })
const selection = () => ({ proposalId: props.proposal.id, changeIds: [props.change.changeId] })
function resolve() {
  emit('resolve', { ...selection(), acknowledge: { action: 'resolve-conflict', reconsiderDiscarded: props.change.status === 'discarded', resolutions: [{ changeId: props.change.changeId, expected: preview.value.expected, after: desired.value }] } })
}
</script>
<template>
  <div class="assistant-conflict">
    <p>{{ tr('对比后保存所选字段；未选中的字段及其他属性保持原样。') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="preview">
      <div class="assistant-conflict__versions">
        <label>{{ tr('当前内容') }} · {{ preview.expected.title }}<textarea :value="preview.expected.text" readonly :aria-label="tr('当前内容')" /></label>
        <label>{{ tr('保存版本（可编辑合并）') }}<textarea v-model="desired" :disabled="busy" :aria-label="tr('保存版本（可编辑合并）')" /></label>
      </div>
      <small>{{ tr('保存会替换上方所选字段的完整内容，可在保存版本中合并两边内容。') }}</small>
    </template>
    <div class="assistant-conflict__actions">
      <button type="button" :disabled="busy" @click="emit('keep', selection())">{{ tr('保留现有，忽略建议') }}</button>
      <button type="button" :disabled="busy" @click="load">{{ tr('重新读取对比') }}</button>
      <button v-if="preview" type="button" :disabled="busy" @click="resolve">{{ tr('保存右侧版本') }}</button>
    </div>
  </div>
</template>
<style scoped>
.assistant-conflict { padding: 8px 12px 12px; color: var(--text-secondary); font: 12px/1.5 var(--font-sans); }
.assistant-conflict p { margin: 0 0 8px; }
.assistant-conflict__versions { display: flex; flex-wrap: wrap; gap: 8px; }
.assistant-conflict label { flex: 1 1 240px; min-width: 0; }
.assistant-conflict textarea { display: block; box-sizing: border-box; width: 100%; min-height: 200px; margin-top: 5px; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench); color: var(--text-primary); font: 12px/1.7 var(--font-sans); resize: vertical; }
.assistant-conflict textarea:focus-visible, .assistant-conflict button:focus-visible { outline: 2px solid var(--workbench-focus); outline-offset: 1px; }
.assistant-conflict small { display: block; margin-top: 6px; color: var(--text-muted); }
.assistant-conflict__actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.assistant-conflict button { min-height: 32px; padding: 5px 8px; border: 0; border-radius: var(--radius-control); color: var(--text-primary); background: transparent; font: inherit; cursor: pointer; }
.assistant-conflict button:hover { background: var(--nav-hover); }
.assistant-conflict button:last-child { font-weight: 600; }
.assistant-conflict button:disabled { opacity: .5; cursor: default; }
@media(max-width:720px) { .assistant-conflict button { min-height: 44px; } }
</style>
