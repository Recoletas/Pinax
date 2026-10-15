<script setup>
import { computed, unref } from 'vue'
import { tr } from '../../i18n/index.js'
const props = defineProps({ assistant: Object, busy: Boolean })
const policy = computed(() => unref(props.assistant?.agentState)?.permission || { mode: 'review', scope: 'current' })
const chapters = computed(() => props.assistant?.agentContext?.().chapterEntries || [])
const modes = [{ id: 'read', label: '只读', detail: '查阅资料、讨论内容' }, { id: 'review', label: '审阅修改', detail: '修改先交给你确认' }, { id: 'auto', label: '自动修改', detail: '在授权范围内直接修改' }]
function update(patch) { void props.assistant?.setAgentPermission?.(patch) }
function selectChapter(id, selected) {
  const ids = new Set(policy.value.chapterIds || [])
  if (selected) ids.add(id); else ids.delete(id)
  update({ chapterIds: [...ids] })
}
</script>
<template>
  <div class="assistant-permissions" data-test="assistant-permissions">
    <button v-for="mode in modes" :key="mode.id" type="button" :aria-pressed="policy.mode === mode.id" :disabled="busy" @click="update({ mode: mode.id })"><span>{{ tr(mode.label) }}<small>{{ tr(mode.detail) }}</small></span><span v-if="policy.mode === mode.id" aria-hidden="true">✓</span></button>
    <fieldset :disabled="busy || policy.mode === 'read'">
      <legend>{{ tr('允许修改') }}</legend>
      <label>{{ tr('章节范围') }}<select :value="policy.scope" @change="update({ scope: $event.target.value, ...($event.target.value === 'selected' ? { chapterIds: policy.chapterIds?.length ? policy.chapterIds : chapters.slice(0, 1).map(item => item.id) } : {}) })"><option value="current">{{ tr('当前章节') }}</option><option value="selected">{{ tr('指定章节') }}</option><option value="book">{{ tr('本书章节') }}</option></select></label>
      <div v-if="policy.scope === 'selected'" class="assistant-permissions__chapters"><label v-for="chapter in chapters" :key="chapter.id"><input type="checkbox" :checked="policy.chapterIds?.includes(chapter.id)" @change="selectChapter(chapter.id, $event.target.checked)">{{ chapter.title }}</label></div>
      <label><input type="checkbox" :checked="policy.worldbook" @change="update({ worldbook: $event.target.checked })">{{ tr('角色与设定') }}</label>
      <label><input type="checkbox" :checked="policy.outline" @change="update({ outline: $event.target.checked })">{{ tr('大纲') }}</label>
    </fieldset>
  </div>
</template>
<style scoped>
.assistant-permissions { color: var(--text-primary); font: 13px/1.5 var(--font-sans); }
.assistant-permissions button { display: flex; width: 100%; align-items: center; justify-content: space-between; border: 0; background: transparent; color: inherit; text-align: start; padding: 9px 10px; border-radius: var(--radius-control); cursor: pointer; }
.assistant-permissions button[aria-pressed=true] { background: var(--nav-primary-selected); }
.assistant-permissions small { display: block; color: var(--text-secondary); font-size: 12px; }
.assistant-permissions fieldset { margin: 8px 0 0; padding: 10px; border: 0; border-top: 1px solid var(--hairline-soft); }
.assistant-permissions legend { color: var(--text-secondary); padding: 0 4px; }
.assistant-permissions label { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.assistant-permissions select { margin-inline-start: auto; min-width: 0; max-width: 140px; background: var(--surface-workbench); color: var(--text-primary); border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); padding: 4px; }
.assistant-permissions input { accent-color: var(--accent); }
.assistant-permissions__chapters { max-height: 130px; overflow-y: auto; }
.assistant-permissions :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media(max-width:720px) { .assistant-permissions button,.assistant-permissions label { min-height: 44px; } }
</style>
