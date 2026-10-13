<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { openPromptPreview } from '../../composables/usePromptPreview.js'
import { regenerateIntentLabel, regenerateTemperatureLabel } from '../../services/agents/authoring/assistantRegenerateOptions.js'
const AssistantRegenerateDialog = defineAsyncComponent(() => import('./AssistantRegenerateDialog.vue'))
const props = defineProps({ message: { type: Object, required: true }, assistant: Object, messages: { type: Array, default: () => [] }, busy: Boolean, copied: Boolean })
const emit = defineEmits(['copy', 'continue'])
const optionsOpen = ref(false)
const question = computed(() => { const index = props.messages.findIndex(item => item.id === props.message.id); return props.messages.slice(0, index).findLast(item => item.role === 'user') })
function regenerate(params) { optionsOpen.value = false; props.assistant?.regenerateAnswer?.(props.message.id, params) }
</script>
<template>
  <div class="assistant-message-actions">
    <button type="button" @click="emit('copy')">{{ tr(copied ? '已复制' : '复制') }}</button>
    <button v-if="assistant?.regenerateAnswer" type="button" :disabled="busy" :aria-label="tr('重新生成')" :title="tr('重新生成')" @click="regenerate()"><WorkbenchIcon name="refresh" :size="14" /></button>
    <button v-if="assistant?.regenerateAnswer && question" type="button" :disabled="busy" :aria-label="tr('调整后重答')" :title="tr('调整后重答')" @click="optionsOpen = true"><WorkbenchIcon name="settings" :size="14" /></button>
    <button v-if="assistant?.continueFromMessage" type="button" :disabled="busy" @click="emit('continue')"><WorkbenchIcon name="rehearsal" :size="14" />{{ tr('从这里继续') }}</button>
    <button v-if="message.promptSnapshotKey" type="button" :title="tr('查看本轮提示词')" :aria-label="tr('提示词')" @click="openPromptPreview(message.promptSnapshotKey)"><WorkbenchIcon name="search" :size="14" /></button>
    <button v-if="message.narrativePromptKey" type="button" @click="openPromptPreview(message.narrativePromptKey)">{{ tr('正文提示词') }}</button>
    <template v-if="assistant?.rateMessage">
      <button v-for="reaction in ['up', 'down']" :key="reaction" type="button" :disabled="busy" :aria-pressed="message.reaction === reaction" :aria-label="tr(reaction === 'up' ? '有帮助' : '需改进')" :title="tr(reaction === 'up' ? '有帮助' : '需改进')" @click="assistant.rateMessage(message.id, reaction)"><WorkbenchIcon :name="'thumbs-' + reaction" :size="14" /></button>
    </template>
    <span v-if="message.params" class="assistant-message-actions__params">{{ tr(regenerateIntentLabel(message.params.intent)) }} · {{ tr(regenerateTemperatureLabel(message.params.temperatureOverride)) }}</span>
    <AssistantRegenerateDialog v-if="optionsOpen && question" :question="question.question" :initial-intent="question.intent" :busy="busy" @close="optionsOpen = false" @confirm="regenerate" />
  </div>
</template>
<style scoped>
.assistant-message-actions { display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; padding-top:10px; color:var(--text-muted); }
.assistant-message-actions button { display:inline-flex; align-items:center; gap:5px; min-height:28px; padding:3px 2px; border:0; border-radius:var(--radius-control); background:transparent; color:inherit; font:12px/1.5 var(--font-interface); cursor:pointer; }
.assistant-message-actions button:hover { color:var(--text-primary); }
.assistant-message-actions button[aria-pressed="true"] { color:var(--accent); }
.assistant-message-actions button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.assistant-message-actions__params { font-size:11px; }
@media (max-width:720px), (pointer:coarse) { .assistant-message-actions button { min-height:44px; padding-inline:5px; } }
</style>
