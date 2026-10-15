<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { vWorkbenchTooltip } from '../workbench/workbenchTooltip.js'
import { openPromptPreview } from '../../composables/usePromptPreview.js'
import { regenerateIntentLabel, regenerateTemperatureLabel } from '../../services/agents/authoring/assistantRegenerateOptions.js'
const AssistantRegenerateDialog = defineAsyncComponent(() => import('./AssistantRegenerateDialog.vue'))
const props = defineProps({ message: { type: Object, required: true }, assistant: Object, messages: { type: Array, default: () => [] }, busy: Boolean, copied: Boolean })
const emit = defineEmits(['copy', 'continue'])
const optionsOpen = ref(false)
const version = computed(() => props.assistant?.answerVersionInfo?.(props.message.id) || { index: 0, count: 1 })
const question = computed(() => { const index = props.messages.findIndex(item => item.id === props.message.id); return props.messages.slice(0, index).findLast(item => item.role === 'user') })
function regenerate(params) { optionsOpen.value = false; props.assistant?.regenerateAnswer?.(props.message.id, params) }
</script>
<template>
  <div class="assistant-message-actions">
    <span v-if="version.count > 1" class="assistant-message-actions__versions" aria-label="回答版本">
      <button type="button" :disabled="busy || version.index === 0" aria-label="上一个回答" v-workbench-tooltip="tr('上一个回答')" @click="assistant.selectAnswerVersion(message.id, version.index - 1)"><WorkbenchIcon name="arrow-left" :size="14" /></button>
      <span>{{ version.index + 1 }} / {{ version.count }}</span>
      <button type="button" :disabled="busy || version.index === version.count - 1" aria-label="下一个回答" v-workbench-tooltip="tr('下一个回答')" @click="assistant.selectAnswerVersion(message.id, version.index + 1)"><WorkbenchIcon name="arrow-right" :size="14" /></button>
    </span>
    <button type="button" @click="emit('copy')" :aria-label="tr(copied ? '已复制' : '复制')" v-workbench-tooltip="tr(copied ? '已复制' : '复制')"><WorkbenchIcon :name="copied ? 'check' : 'copy'" :size="14" /></button>
    <button v-if="assistant?.regenerateAnswer" type="button" :disabled="busy" :aria-label="tr('重新生成')" v-workbench-tooltip="tr('重新生成')" @click="regenerate()"><WorkbenchIcon name="refresh" :size="14" /></button>
    <button v-if="assistant?.regenerateAnswer && question" type="button" :disabled="busy" :aria-label="tr('调整后重答')" v-workbench-tooltip="tr('调整后重答')" @click="optionsOpen = true"><WorkbenchIcon name="settings" :size="14" /></button>
    <button v-if="assistant?.continueFromMessage" type="button" :disabled="busy" @click="emit('continue')"><WorkbenchIcon name="rehearsal" :size="14" />{{ tr('另开对话') }}</button>
    <button v-if="message.promptSnapshotKey" type="button" v-workbench-tooltip="tr('查看本轮提示词')" :aria-label="tr('提示词')" @click="openPromptPreview(message.promptSnapshotKey)"><WorkbenchIcon name="search" :size="14" /></button>
    <button v-if="message.narrativePromptKey" type="button" @click="openPromptPreview(message.narrativePromptKey)">{{ tr('正文提示词') }}</button>
    <template v-if="assistant?.rateMessage">
      <button v-for="reaction in ['up', 'down']" :key="reaction" type="button" :disabled="busy" :aria-pressed="message.reaction === reaction" :aria-label="tr(reaction === 'up' ? '有帮助' : '需改进')" v-workbench-tooltip="tr(reaction === 'up' ? '有帮助' : '需改进')" @click="assistant.rateMessage(message.id, reaction)"><WorkbenchIcon :name="'thumbs-' + reaction" :size="14" /></button>
    </template>
    <span v-if="message.params" class="assistant-message-actions__params">{{ tr(regenerateIntentLabel(message.params.intent)) }} · {{ tr(regenerateTemperatureLabel(message.params.temperatureOverride)) }}</span>
    <AssistantRegenerateDialog v-if="optionsOpen && question" :question="question.question" :initial-intent="question.intent" :busy="busy" @close="optionsOpen = false" @confirm="regenerate" />
  </div>
</template>
<style scoped>
.assistant-message-actions { display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; padding-top:10px; color:var(--text-muted); }
.assistant-message-actions button { display:inline-flex; align-items:center; gap:5px; min-height:32px; padding:5px 6px; border:0; border-radius:var(--radius-control); background:transparent; color:inherit; font:12px/1.5 var(--font-interface); cursor:pointer; }
.assistant-message-actions button:hover { background:var(--nav-hover); color:var(--text-primary); }
.assistant-message-actions button[aria-pressed="true"] { color:var(--accent); }
.assistant-message-actions button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.assistant-message-actions__versions { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-variant-numeric:tabular-nums; }
.assistant-message-actions button:disabled { opacity:.35; cursor:default; }
.assistant-message-actions__params { font-size:11px; }
@media (max-width:720px), (pointer:coarse) { .assistant-message-actions button { min-height:44px; padding-inline:5px; } }
</style>
