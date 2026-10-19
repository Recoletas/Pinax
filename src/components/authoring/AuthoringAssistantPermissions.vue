<script setup>
import { computed, nextTick, ref, unref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ assistant: Object, busy: Boolean })
const emit = defineEmits(['resize'])
const agentState = computed(() => unref(props.assistant?.agentState) || {})
const policy = computed(() => agentState.value.permission || { mode: 'review', scope: 'current' })
const chapters = computed(() => props.assistant?.agentChapterOptions?.() || props.assistant?.agentContext?.().chapterEntries || [])
const modes = [{ id: 'read', label: '只读', detail: '查阅资料、讨论内容' }, { id: 'review', label: '审阅修改', detail: '修改先交给你确认' }, { id: 'auto', label: '自动修改', detail: '在授权范围内直接修改' }]
const customOpen = ref(false)
const query = ref('')
const scopePreset = computed(() => policy.value.scope === 'current' && !policy.value.worldbook && !policy.value.outline ? 'current' : policy.value.scope === 'book' && policy.value.worldbook && policy.value.outline ? 'book' : 'custom')
const selectedIds = computed(() => policy.value.scope === 'book' ? chapters.value.map(chapter => chapter.id) : policy.value.scope === 'current' ? [agentState.value.currentChapterId || chapters.value[0]?.id].filter(Boolean) : policy.value.chapterIds || [])
const visibleChapters = computed(() => chapters.value.filter(chapter => String(chapter.title).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
watch(() => [customOpen.value, query.value, policy.value.mode, agentState.value.permissionPending], () => nextTick(() => emit('resize')))
function update(patch) {
  if (props.busy || Object.entries(patch).every(([key, value]) => policy.value[key] === value)) return
  void props.assistant?.setAgentPermission?.(patch)
}
function selectPreset(scope) {
  if (props.busy || policy.value.mode === 'read') return
  customOpen.value = false
  update({ scope, worldbook: scope === 'book', outline: scope === 'book' })
}
function selectChapter(id, selected) {
  if (props.busy || policy.value.mode === 'read') return
  const ids = new Set(selectedIds.value)
  if (selected) ids.add(id); else ids.delete(id)
  if (!ids.size) return
  update({ scope: 'selected', chapterIds: [...ids] })
}
</script>
<template>
  <div class="assistant-permissions" data-test="assistant-permissions">
    <small v-if="agentState.permissionPending" class="assistant-permissions__pending" role="status">{{ tr('下次发送生效') }}</small>
    <button v-for="mode in modes" :key="mode.id" class="assistant-permissions__mode" type="button" :aria-pressed="policy.mode === mode.id" :disabled="busy" @click="update({ mode: mode.id })"><span>{{ tr(mode.label) }}<small>{{ tr(mode.detail) }}</small></span><WorkbenchIcon v-if="policy.mode === mode.id" name="check" :size="15" /></button>
    <div v-if="policy.mode !== 'read'" class="assistant-permissions__range" role="group" :aria-label="tr('修改范围')">
      <div class="assistant-permissions__presets">
        <button type="button" :aria-pressed="scopePreset === 'current' && !customOpen" :disabled="busy || !chapters.length" @click="selectPreset('current')">{{ tr('当前章节') }}</button>
        <button type="button" :aria-pressed="scopePreset === 'book' && !customOpen" :disabled="busy" :title="tr('本作品的正文、设定和大纲')" @click="selectPreset('book')">{{ tr('本作品') }}</button>
        <button type="button" :aria-expanded="customOpen" :aria-pressed="scopePreset === 'custom' || customOpen" :disabled="busy" @click="customOpen = !customOpen">{{ tr('自定义') }}<WorkbenchIcon name="chevron-down" :size="12" :class="{ 'is-open': customOpen }" /></button>
      </div>
      <div v-if="customOpen" class="assistant-permissions__custom">
        <label><input type="checkbox" :checked="policy.worldbook" :disabled="busy" @change="update({ worldbook: $event.target.checked })">{{ tr('设定') }}</label>
        <label><input type="checkbox" :checked="policy.outline" :disabled="busy" @change="update({ outline: $event.target.checked })">{{ tr('大纲') }}</label>
        <div class="assistant-permissions__chapter-head"><span>{{ tr('正文') }}</span><button type="button" :aria-pressed="policy.scope === 'book'" :disabled="busy || !chapters.length" @click="update({ scope: policy.scope === 'book' ? 'current' : 'book' })">{{ tr('全部章节') }}</button></div>
        <input v-if="chapters.length > 6" v-model="query" type="search" :placeholder="tr('搜索章节')" :aria-label="tr('搜索允许修改的章节')" />
        <div class="assistant-permissions__chapters"><label v-for="chapter in visibleChapters" :key="chapter.id" :title="chapter.title"><input type="checkbox" :checked="selectedIds.includes(chapter.id)" :disabled="busy || selectedIds.length === 1 && selectedIds.includes(chapter.id)" @change="selectChapter(chapter.id, $event.target.checked)"><span>{{ chapter.title }}</span></label><small v-if="!visibleChapters.length">{{ tr('没有匹配的章节') }}</small></div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.assistant-permissions { color: var(--text-primary); font: 13px/1.5 var(--font-sans); }
.assistant-permissions button { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.assistant-permissions .assistant-permissions__mode { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 9px 10px; border-radius: var(--radius-control); text-align: start; }
.assistant-permissions__mode[aria-pressed=true] { background: var(--nav-primary-selected); }
.assistant-permissions small { display: block; color: var(--text-secondary); font-size: 12px; }
.assistant-permissions__pending { padding: 4px 10px 6px; }
.assistant-permissions__range { margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--hairline-soft); }
.assistant-permissions .assistant-permissions__presets { display: flex; gap: 2px; padding: 2px; }
.assistant-permissions .assistant-permissions__presets button { display: inline-flex; width: auto; min-height: 30px; flex: 1; align-items: center; justify-content: center; gap: 3px; padding: 5px 6px; border-radius: var(--radius-control); white-space: nowrap; font-size: 12px; }
.assistant-permissions__presets button[aria-pressed=true] { background: var(--nav-primary-selected); }
.assistant-permissions__presets .is-open { transform: rotate(180deg); }
.assistant-permissions__custom { padding: 8px 10px 4px; }
.assistant-permissions label { display: flex; min-height: 32px; align-items: center; gap: 8px; cursor: pointer; }
.assistant-permissions label:has(input:disabled) { color: var(--text-muted); cursor: default; }
.assistant-permissions input[type=checkbox] { flex: none; margin: 0; accent-color: var(--accent); }
.assistant-permissions .assistant-permissions__custom input[type=search] { box-sizing: border-box; width: 100%; margin: 4px 0; padding: 6px 0; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; color: inherit; font: inherit; }
.assistant-permissions__chapter-head { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; color: var(--text-secondary); font-size: 12px; }
.assistant-permissions .assistant-permissions__chapter-head button { width: auto; min-height: 28px; padding: 2px 0 2px 8px; color: var(--text-secondary); font-size: 11px; }
.assistant-permissions__chapter-head button[aria-pressed=true] { color: var(--text-primary); text-decoration: underline; text-underline-offset: 3px; }
.assistant-permissions__chapters { max-height: 150px; overflow-y: auto; overscroll-behavior: contain; }
.assistant-permissions__chapters label span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-permissions button:disabled { cursor: default; opacity: .5; }
.assistant-permissions :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media(max-width:720px) { .assistant-permissions .assistant-permissions__mode,.assistant-permissions .assistant-permissions__presets button,.assistant-permissions label { min-height: 44px; } }
</style>
