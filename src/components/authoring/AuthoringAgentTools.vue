<template>
  <div class="agent-tools">
    <details ref="menuRef" @focusout="leave" @keydown.esc.stop="close">
      <summary :aria-label="tr('参考资料与写作技法')"><WorkbenchIcon name="sources" :size="15" /><span>{{ tr('参考与技法') }}</span></summary>
      <div class="agent-tools__menu">
        <strong>{{ tr('本轮参考') }}</strong>
        <input v-model="query" type="search" :placeholder="tr('搜索正文与设定')" :aria-label="tr('搜索参考资料')" />
        <button v-for="entry in candidates" :key="entry.type + ':' + entry.id" type="button" :aria-pressed="selected(entry)" :disabled="busy || (!selected(entry) && state.refs?.length >= 8)" @click="toggleReference(entry)"><WorkbenchIcon :name="selected(entry) ? 'check' : 'document'" :size="14" /><span>{{ entry.title }}</span></button>
        <p v-if="!candidates.length">{{ tr('当前没有匹配的参考') }}</p>
        <strong>{{ tr('写作技法') }}</strong>
        <button v-for="skill in SKILL_PRESETS" :key="skill.id" type="button" :aria-pressed="state.skills?.some(s => s.id === skill.id)" :disabled="busy || (!state.skills?.some(s => s.id === skill.id) && state.skills?.length >= 3)" @click="toggleSkill(skill)"><WorkbenchIcon :name="state.skills?.some(s => s.id === skill.id) ? 'check' : 'plus'" :size="14" /><span>{{ tr(skill.label) }}</span></button>
        <label class="agent-tools__experience"><input v-model="experienceEnabled" type="checkbox" @change="setExperiencePiAgentEnabled(experienceEnabled)" /><span>{{ tr('体验推演也使用写作工具') }}</span></label>
      </div>
    </details>
    <button v-if="state.taskId" type="button" :disabled="busy" :title="tr('后续消息会沿当前任务继续；重新开始保留对话记录')" @click="assistant.newAgentTask()">{{ tr('重新开始任务') }}</button>
    <button v-for="reference in state.refs || []" :key="reference.type + ':' + reference.id" type="button" class="agent-tools__reference" :disabled="busy" :aria-label="tr('移除参考 {title}', { title: reference.title })" :title="reference.title" @click="assistant.setAgentReferences(state.refs.filter(ref => !(ref.id === reference.id && ref.type === reference.type)))"><span>{{ reference.title }}</span><WorkbenchIcon name="close" :size="12" /></button>
    <span v-if="state.skills?.length" class="agent-tools__selection">{{ state.skills.map(skill => tr(skill.label)).join(' · ') }}</span>
  </div>
</template>
<script setup>
import { computed, ref, unref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { experiencePiAgentEnabled, setExperiencePiAgentEnabled } from '../../services/agents/storyagent/experienceAgentRoute.js'
import { SKILL_PRESETS } from '../../services/agents/storyagent/panelComposer.js'
const props = defineProps({ assistant: { type: Object, required: true }, busy: Boolean, projectId: { type: String, default: '' } })
const experienceEnabled = ref(experiencePiAgentEnabled())
const query = ref('')
const menuRef = ref(null)
function leave(event) { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }
watch(() => props.projectId, () => { query.value = ''; if (menuRef.value) menuRef.value.open = false })
const state = computed(() => unref(props.assistant.agentState) || {})
const candidates = computed(() => {
  // Consume projectId so the catalogue refreshes when the same component changes books.
  if (!props.projectId) return []
  const context = props.assistant.agentContext()
  const search = query.value.trim().toLowerCase()
  return [...(context.worldEntries || []), ...(context.chapterEntries || []), ...(context.sourceEntries || [])].filter(entry => !search || String(entry.title).toLowerCase().includes(search)).slice(0, 12)
})
const selected = entry => state.value.refs?.some(ref => ref.id === entry.id && ref.type === entry.type)
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
.agent-tools__menu { position: absolute; z-index: 8; inset: auto auto 100% 0; display: flex; flex-direction: column; width: min(300px, calc(100vw - 64px)); max-height: 340px; overflow: auto; padding: 12px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover); background: var(--surface-workbench-overlay); box-shadow: var(--shadow-workbench-float); }
.agent-tools__menu strong { padding: 8px; font-size: 12px; font-weight: 500; }
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
</style>

<style scoped>
.agent-tools .agent-tools__reference { display: inline-flex; min-width: 0; gap: 6px; max-width: 180px; background: var(--surface-workbench-muted); border-radius: 6px; }
.agent-tools__reference span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-tools__reference svg { flex: none; }
</style>
