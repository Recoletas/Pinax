<template>
  <Teleport to="body">
    <dialog ref="dialogRef" class="assistant-regenerate" role="dialog" aria-modal="true" :aria-label="tr('换参数重答')" tabindex="-1" @cancel.prevent="close" @click="backdrop">
      <header>
        <strong>{{ tr('换参数重答') }}</strong>
        <button ref="closeRef" type="button" :aria-label="tr('关闭')" :title="tr('关闭')" @click="close"><WorkbenchIcon name="close" :size="16" /></button>
      </header>
      <p class="assistant-regenerate__question" :title="question">{{ question }}</p>

      <div class="assistant-regenerate__body">
        <label class="assistant-regenerate__field"><span>{{ tr('参考侧重') }}</span>
          <select v-model="selectedIntent" aria-label="参考侧重"><option v-for="intent in intents" :key="intent.id" :value="intent.id">{{ tr(intent.label) }}</option></select>
          <small>{{ tr(intents.find(item => item.id === selectedIntent)?.hint || '') }}</small>
        </label>
        <fieldset class="assistant-regenerate__group">
          <legend>{{ tr('创意程度') }}</legend>
          <div class="assistant-regenerate__temperatures">
            <label v-for="tier in temperatures" :key="tier.id" :class="{ 'is-selected': selectedTemperature === tier.id }">
              <input v-model="selectedTemperature" type="radio" name="assistant-regenerate-temperature" :value="tier.id" :data-test="`regenerate-temperature-${tier.id}`" />{{ tr(tier.label) }}
            </label>
          </div>
          <p class="assistant-regenerate__hint">{{ tr(temperatures.find(item => item.id === selectedTemperature)?.hint || '') }}</p>
        </fieldset>
        <p class="assistant-regenerate__note">{{ tr('在当前对话重新回答，原回答可通过版本箭头查看。') }}</p>
      </div>

      <footer>
        <button type="button" class="assistant-regenerate__cancel" @click="close">{{ tr('取消') }}</button>
        <button type="button" class="assistant-regenerate__confirm" data-test="assistant-regenerate-confirm" :disabled="busy" @click="confirm">{{ tr('开始重答') }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import {
  ASSISTANT_REGENERATE_INTENTS,
  ASSISTANT_REGENERATE_TEMPERATURES,
  isRegenerateIntent
} from '../../services/agents/authoring/assistantRegenerateOptions.js'

const props = defineProps({
  question: { type: String, default: '' },
  initialIntent: { type: String, default: 'whole-book' },
  busy: Boolean
})
const emit = defineEmits(['close', 'confirm'])
const intents = ASSISTANT_REGENERATE_INTENTS
const temperatures = ASSISTANT_REGENERATE_TEMPERATURES
const selectedIntent = ref(isRegenerateIntent(props.initialIntent) ? props.initialIntent : 'whole-book')
const selectedTemperature = ref('default')
const closeRef = ref(null), dialogRef = ref(null)
onMounted(() => { dialogRef.value?.showModal(); nextTick(() => closeRef.value?.focus({ preventScroll: true })) })
onBeforeUnmount(() => dialogRef.value?.close())
function backdrop(event) { if (event.target !== dialogRef.value) return; const r = dialogRef.value.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close() }
function close() { emit('close') }
function confirm() {
  const tier = temperatures.find((item) => item.id === selectedTemperature.value) || temperatures[0]
  emit('confirm', { intent: selectedIntent.value, temperatureOverride: tier.value, tierId: tier.id })
}
</script>

<style scoped>
.assistant-regenerate::backdrop { background:var(--surface-workbench-scrim); }
.assistant-regenerate { margin:0; position: fixed; top: 50%; left: 50%; z-index: var(--z-floating-dock, 240); display: flex; width: min(440px, calc(100vw - 28px)); max-height: min(80vh, 620px); overflow: hidden; transform: translate(-50%, -50%); flex-direction: column; gap: 14px; padding: 16px; border: 1px solid var(--hairline-soft); border-radius: var(--workspace-radius, 12px); background: var(--surface-workbench-raised); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); font: 14px/1.5 var(--font-interface, var(--font-sans)); outline: none; }
/* 面板自身不再整体滚动：选项区滚动，标题、原问题与操作行始终在位。 */
.assistant-regenerate > * { flex: none; }
.assistant-regenerate__body { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 14px; overflow-y: auto; }
.assistant-regenerate header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.assistant-regenerate header strong { font-size: 14px; font-weight: 600; }
.assistant-regenerate header button, .assistant-regenerate footer button { display: inline-flex; min-height: var(--workspace-control-height, 36px); align-items: center; justify-content: center; gap: 6px; padding: 5px 12px; border: 0; border-radius: var(--workspace-radius, 10px); cursor: pointer; font: 13px/1.4 var(--font-interface, var(--font-sans)); }
.assistant-regenerate header button { width: 32px; padding: 5px; background: transparent; color: var(--text-secondary); }
.assistant-regenerate header button:hover { background: var(--nav-hover); color: var(--text-primary); }
.assistant-regenerate__question { margin: 0; padding: 8px 10px; border-inline-start: 2px solid var(--hairline-soft); color: var(--text-secondary); font-size: 13px; line-height: 1.55; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.assistant-regenerate__group { margin: 0; padding: 0; border: 0; }
.assistant-regenerate__group legend { margin-bottom: 8px; color: var(--text-secondary); font-size: 12px; font-weight: 560; }
.assistant-regenerate__field { display:grid; gap:8px; color:var(--text-secondary); font-size:12px; }
.assistant-regenerate__field select { width:100%; min-height:38px; padding:8px 10px; border:1px solid var(--hairline-soft); border-radius:var(--radius-control); background:var(--surface-workbench-input); color:var(--text-primary); font:13px var(--font-interface); }
.assistant-regenerate__field small, .assistant-regenerate__hint { margin:0; color:var(--text-muted); font-size:12px; line-height:1.6; }
.assistant-regenerate__temperatures { display:flex; padding:3px; gap:3px; border-radius:var(--radius-control); background:var(--surface-workbench-input); }
.assistant-regenerate__temperatures label { display:flex; flex:1; justify-content:center; align-items:center; gap:5px; min-height:34px; padding:4px; border-radius:var(--radius-control); color:var(--text-secondary); cursor:pointer; font-size:12px; }
.assistant-regenerate__temperatures input { width:12px; margin:0; accent-color:var(--accent); }
.assistant-regenerate__temperatures .is-selected { background:var(--nav-selected); color:var(--accent); }
.assistant-regenerate__hint { padding-top:8px; }
.assistant-regenerate__note { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.55; }
.assistant-regenerate footer { display: flex; justify-content: flex-end; gap: 8px; }
.assistant-regenerate__cancel { border: 1px solid var(--hairline-soft) !important; background: transparent; color: var(--text-secondary); }
.assistant-regenerate__cancel:hover { background: var(--nav-hover); color: var(--text-primary); }
.assistant-regenerate__confirm { background: var(--accent); color: var(--accent-text); font-weight: 560; }
.assistant-regenerate__confirm:disabled { opacity: .5; cursor: default; }
.assistant-regenerate button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer:coarse) { .assistant-regenerate__temperatures label { min-height:44px; } }

.assistant-regenerate { padding: 24px; gap: 20px; border-radius: var(--radius-popover); }
.assistant-regenerate__body { gap: 20px; }
.assistant-regenerate__group legend { margin-bottom: 12px; font-size: 13px; }
.assistant-regenerate__temperatures .is-selected { background: var(--surface-workbench-raised); color: var(--text-primary); box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent); }
.assistant-regenerate__confirm { background: var(--control-accent-bg); color: var(--control-accent-text); }
.assistant-regenerate__field select { border-color: transparent; }
.assistant-regenerate__field select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.assistant-regenerate footer { padding-top: 4px; }
@media (max-width: 720px) { .assistant-regenerate { padding: 20px; } }
</style>
