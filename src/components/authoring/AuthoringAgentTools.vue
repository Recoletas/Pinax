<template>
  <div class="agent-tools">
    <details ref="menuRef" @focusout="leave" @keydown.esc.stop="close">
      <summary :aria-label="tr('参考资料与写作技法')"><WorkbenchIcon name="sources" :size="15" /><span>{{ tr('参考与技法') }}</span></summary>
      <div class="agent-tools__menu">
        <div class="agent-tools__tabs" aria-label="参考与技法分类"><button type="button" :aria-pressed="tab === 'references'" @click="tab = 'references'">{{ tr('参考资料') }}<small v-if="state.refs?.length">{{ state.refs.length }}</small></button><button type="button" :aria-pressed="tab === 'skills'" @click="tab = 'skills'">{{ tr('写作技法') }}<small v-if="state.skills?.length">{{ state.skills.length }}</small></button></div>
        <div class="agent-tools__list">
          <template v-if="tab === 'references'">
            <div class="agent-tools__search"><WorkbenchIcon name="search" :size="14" /><input v-model="query" type="search" :placeholder="tr('搜索正文与设定')" :aria-label="tr('搜索参考资料')" /></div>
            <button v-for="entry in candidates" :key="entry.type + ':' + entry.id" type="button" :aria-pressed="selected(entry)" :disabled="busy || (!selected(entry) && state.refs?.length >= 8)" @click="toggleReference(entry)"><WorkbenchIcon :name="referenceIcon(entry)" :size="16" /><span>{{ entry.title }}<small>{{ referenceType(entry) }}</small></span><WorkbenchIcon v-if="selected(entry)" name="check" :size="14" /></button>
            <button v-if="candidates.length < matchedCandidates.length" type="button" class="agent-tools__show-more" @click="showMore">{{ tr('显示更多') }}</button>
            <p v-if="!candidates.length">{{ tr('当前没有匹配的参考') }}</p>
          </template>
          <template v-else>
            <button v-for="skill in SKILL_PRESETS" :key="skill.id" type="button" :aria-pressed="state.skills?.some(s => s.id === skill.id)" :disabled="busy" @click="toggleSkill(skill)"><WorkbenchIcon name="document" :size="16" /><span>{{ tr(skill.label) }}<small>{{ skillHint(skill.id) }}</small></span><WorkbenchIcon v-if="state.skills?.some(s => s.id === skill.id)" name="check" :size="14" /></button>
            <details class="agent-tools__advanced"><summary><WorkbenchIcon name="chevron-down" :size="14" />{{ tr('更多设置') }}</summary><label class="agent-tools__experience"><input v-model="experienceEnabled" type="checkbox" :disabled="busy" @change="setExperiencePiAgentEnabled(experienceEnabled)" /><span>{{ tr('体验推演也使用写作工具') }}</span></label></details>
          </template>
        </div>
      </div>
    </details>
    <button v-if="state.taskId" type="button" :disabled="busy || state.adoptionBusy" :title="tr('开始空白对话，旧消息保留在对话列表中')" @click="assistant.newAgentTask()">{{ tr('重新开始') }}</button>
    <button v-for="reference in state.refs || []" :key="reference.type + ':' + reference.id" type="button" class="agent-tools__reference" :disabled="busy" :aria-label="tr('移除参考 {title}', { title: reference.title })" :title="reference.title" @click="assistant.setAgentReferences(state.refs.filter(ref => !(ref.id === reference.id && ref.type === reference.type)))"><span>{{ reference.title }}</span><WorkbenchIcon name="close" :size="12" /></button>
    <button v-for="skill in state.skills || []" :key="skill.id" type="button" class="agent-tools__reference" :disabled="busy" :aria-label="tr('移除技法') + ' ' + tr(skill.label)" @click="assistant.setAgentSkills(state.skills.filter(item => item.id !== skill.id))"><span>{{ tr(skill.label) }}</span><WorkbenchIcon name="close" :size="12" /></button>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { experiencePiAgentEnabled, setExperiencePiAgentEnabled } from '../../services/agents/storyagent/experienceAgentRoute.js'
import { SKILL_PRESETS } from '../../services/agents/storyagent/panelComposer.js'
const props = defineProps({ assistant: { type: Object, required: true }, busy: Boolean, projectId: { type: String, default: '' } })
const experienceEnabled = ref(experiencePiAgentEnabled())
const query = ref('')
const tab = ref('references')
const visibleLimit = ref(12)
watch(query, () => { visibleLimit.value = 12 })
const referenceType = entry => tr(({ chapter: '章节', entry: '设定', source: '资料', worldbook: '设定' })[entry.type] || '参考')
const referenceIcon = entry => entry.type === 'chapter' ? 'chapter' : entry.type === 'source' ? 'source-file' : 'setting-file'
const skillHint = id => tr(SKILL_PRESETS.find(skill => skill.id === id)?.description || '用于本轮写作')
const menuRef = ref(null)
// A label/padding press can temporarily blur to null before the click lands.
// Keep its details subtree visible until the pointer action completes.
function leave(event) { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }
function closeOutside(event) { if (menuRef.value && !menuRef.value.contains(event.target)) menuRef.value.open = false }
onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside))
watch(() => props.projectId, () => { query.value = ''; visibleLimit.value = 12; if (menuRef.value) menuRef.value.open = false })
const state = computed(() => unref(props.assistant.agentState) || {})
const matchedCandidates = computed(() => {
  // Consume projectId so the catalogue refreshes when the same component changes books.
  if (!props.projectId) return []
  const context = props.assistant.agentContext()
  const search = query.value.trim().toLowerCase()
  return [...(context.worldEntries || []), ...(context.chapterEntries || []), ...(context.sourceEntries || [])].sort((a, b) => Number(selected(b)) - Number(selected(a))).filter(entry => !search || [entry.title, ...(entry.aliases || [])].some(value => String(value || '').toLowerCase().includes(search)))
})
const candidates = computed(() => matchedCandidates.value.slice(0, visibleLimit.value))
const selected = entry => state.value.refs?.some(ref => ref.id === entry.id && ref.type === entry.type)
function showMore() { menuRef.value?.querySelector('input[type=search]')?.focus({ preventScroll: true }); visibleLimit.value += 12 }
function toggleReference(entry) {
  const refs = state.value.refs || []
  props.assistant.setAgentReferences(selected(entry) ? refs.filter(ref => ref.id !== entry.id || ref.type !== entry.type) : [...refs, entry])
}
function toggleSkill(skill) {
  const skills = state.value.skills || []
  props.assistant.setAgentSkills(skills.some(s => s.id === skill.id) ? skills.filter(s => s.id !== skill.id) : [...skills, skill])
}
function close(event) { const menu = event.currentTarget; menu.open = false; menu.querySelector('summary')?.focus() }
</script>
<style scoped>
.agent-tools { display: flex; position: relative; gap: 8px; align-items: center; flex-wrap: wrap; padding: 2px 4px 8px; color: var(--text-secondary); font: 13px/1.5 var(--font-interface, var(--font-sans)); }
.agent-tools summary, .agent-tools > button { display: flex; align-items: center; gap: 6px; min-height: 32px; border: 0; border-radius: var(--workspace-radius, 10px); padding: 4px 8px; color: inherit; background: transparent; font: inherit; cursor: pointer; list-style: none; }
.agent-tools summary::-webkit-details-marker { display: none; }
.agent-tools summary:hover, .agent-tools button:hover { background: var(--nav-hover); }
.agent-tools__menu { position: absolute; z-index: 8; inset: auto auto 100% 0; display: flex; flex-direction: column; width: min(300px, calc(100vw - 64px)); max-height: min(420px, 55vh); overflow: hidden; padding: 6px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover); background: var(--surface-workbench-raised); box-shadow: var(--shadow-workbench-float); }
.agent-tools__tabs { display:flex; gap:4px; padding:2px 2px 8px; border-bottom:1px solid var(--hairline-soft); }
.agent-tools__tabs button { flex:1; justify-content:center; gap:6px; }
.agent-tools__tabs small { font-size:10px; color:var(--text-muted); }
.agent-tools__list { overflow:auto; min-height:0; padding:6px 2px; }
.agent-tools__list > button { width:100%; }
.agent-tools__list > button > span { flex:1; min-width:0; }
.agent-tools__list > button > svg { flex:none; }
.agent-tools__menu button small { display:block; color:var(--text-muted); font-size:11px; font-weight:400; margin-top:2px; }
.agent-tools__search { display:flex; align-items:center; gap:6px; margin:2px 4px 8px; padding:0 8px; background:var(--surface-workbench-input); border-radius:var(--radius-control); }
.agent-tools__search input { border:0 !important; padding-inline:0 !important; }
.agent-tools__advanced { margin-top:6px; border-top:1px solid var(--hairline-soft); }
.agent-tools__advanced summary { font-size:12px; }
.agent-tools__menu input { box-sizing: border-box; width: 100%; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); padding: 8px; color: var(--text-primary); background: var(--surface-workbench-input); font: inherit; }
.agent-tools__menu button { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; min-height: 36px; padding: 8px; background: transparent; color: var(--text-secondary); text-align: start; font: inherit; cursor: pointer; }
.agent-tools__menu button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-tools__menu button[aria-pressed="true"] { color: var(--accent); background: var(--nav-selected); }
.agent-tools__selection { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
.agent-tools button:disabled { opacity: .5; cursor: default; }
.agent-tools :is(button, summary, input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px) { .agent-tools summary, .agent-tools button { min-height: 44px; } }
.agent-tools__experience { display: flex; gap: 8px; align-items: center; min-height: 36px; padding: 8px; margin-top: 8px; border-top: 1px solid var(--hairline-soft); cursor: pointer; }
.agent-tools__experience input { width: auto; accent-color: var(--accent); }

.agent-tools .agent-tools__reference { display: inline-flex; min-width: 0; gap: 6px; max-width: 180px; background: var(--surface-workbench-muted); border-radius: 6px; }
.agent-tools__reference span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-tools__reference svg { flex: none; }

.agent-tools__menu { padding: 8px; border-radius: 12px; }
.agent-tools__tabs { padding: 0 4px 8px; gap: 12px; }
.agent-tools__tabs button { flex: none; border-radius: 0; padding: 8px 0; border-bottom: 2px solid transparent; color: var(--text-muted); }
.agent-tools__tabs button[aria-pressed=true] { border-bottom-color: var(--accent); background: transparent; color: var(--text-primary); }
.agent-tools__list { padding: 10px 0 4px; }
.agent-tools__list > button { min-height: 40px; gap: 10px; padding: 9px 10px; border-radius: 6px; }
.agent-tools__search { min-height: 34px; margin: 0 2px 10px; border: 1px solid transparent; }
.agent-tools__search:focus-within { border-color: var(--accent); }
.agent-tools__menu .agent-tools__tabs button small { display: inline; margin: 0; }
.agent-tools__list > button[aria-pressed=true] { color: var(--text-primary); background: var(--nav-selected-secondary); }
@media (pointer: coarse) { .agent-tools__menu button { min-height: 44px; } }
</style>
