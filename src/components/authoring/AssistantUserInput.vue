<template>
  <form class="assistant-user-input" :aria-label="tr('回答助手的问题')" @submit.prevent="submit">
    <fieldset v-for="question in questions" :key="question.id" :disabled="busy">
      <legend>{{ question.question }}</legend>
      <label v-for="option in question.options" :key="option.label" class="assistant-user-input__option" :class="{ 'is-selected': selected[question.id] === option.label && !custom[question.id]?.trim() }">
        <input v-model="selected[question.id]" type="radio" :name="`${groupId}-${question.id}`" :value="option.label" @change="custom[question.id] = ''" />
        <span><span>{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small></span>
      </label>
      <textarea v-model="custom[question.id]" rows="1" maxlength="4000" :aria-label="`${question.question} — ${tr('自行填写')}`" :placeholder="tr(question.options.length ? '也可以直接写下你的想法' : '写下你的回答')" @input="selected[question.id] = ''" />
    </fieldset>
    <button type="submit" :disabled="busy || !ready">{{ tr('继续') }}<WorkbenchIcon name="arrow-right" :size="15" /></button>
  </form>
</template>

<script setup>
import { computed, reactive, useId } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ questions: { type: Array, required: true }, busy: Boolean })
const emit = defineEmits(['answer'])
const selected = reactive(Object.create(null)), custom = reactive(Object.create(null)), groupId = useId()
const answers = computed(() => Object.fromEntries(props.questions.map(question => [question.id, custom[question.id]?.trim() || selected[question.id] || ''])))
const ready = computed(() => props.questions.length > 0 && props.questions.every(question => answers.value[question.id]))
function submit() { if (!props.busy && ready.value) emit('answer', { ...answers.value }) }
</script>

<style scoped>
.assistant-user-input { display: grid; gap: 22px; margin-block: 14px 8px; color: var(--text-primary); }
.assistant-user-input fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.assistant-user-input legend { margin-bottom: 12px; padding: 0; font-size: 14px; font-weight: 550; line-height: 1.65; }
.assistant-user-input__option { display: flex; align-items: center; gap: 10px; margin-block: 3px; padding: 9px 10px; border-radius: 7px; cursor: pointer; font-size: 13px; line-height: 1.55; }
.assistant-user-input__option:hover, .assistant-user-input__option.is-selected { background: var(--nav-hover); }
.assistant-user-input__option input { flex: none; accent-color: var(--text-primary); }
.assistant-user-input__option > span:first-of-type { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.assistant-user-input__option small { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 12px; }
.assistant-user-input textarea { box-sizing: border-box; width: 100%; min-height: 44px; margin-top: 8px; padding: 9px 10px; resize: vertical; border: 1px solid var(--hairline-soft); border-radius: 7px; background: transparent; color: var(--text-primary); font: inherit; font-size: 13px; line-height: 1.6; }
.assistant-user-input textarea:focus-visible, .assistant-user-input button:focus-visible { outline: 2px solid var(--text-secondary); outline-offset: 2px; }
.assistant-user-input textarea::placeholder { color: var(--text-muted); }
.assistant-user-input > button { justify-self: end; display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 6px 13px; border: 0; border-radius: 7px; background: var(--text-primary); color: var(--surface-workbench-raised); font: inherit; font-size: 13px; cursor: pointer; }
.assistant-user-input > button:disabled { opacity: .4; cursor: default; }
@media (pointer: coarse) { .assistant-user-input__option, .assistant-user-input > button { min-height: 44px; } }
</style>
