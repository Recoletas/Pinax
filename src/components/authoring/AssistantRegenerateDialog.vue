<template>
  <Teleport to="body">
    <div class="assistant-regenerate__scrim" @pointerdown.self="close"></div>
    <section class="assistant-regenerate" role="dialog" aria-modal="true" :aria-label="tr('换参数重答')" tabindex="-1" @keydown.esc.stop.prevent="close">
      <header>
        <strong>{{ tr('换参数重答') }}</strong>
        <button ref="closeRef" type="button" :aria-label="tr('关闭')" :title="tr('关闭')" @click="close"><WorkbenchIcon name="close" :size="16" /></button>
      </header>
      <p class="assistant-regenerate__question" :title="question">{{ question }}</p>

      <div class="assistant-regenerate__body">
        <fieldset class="assistant-regenerate__group">
          <legend>{{ tr('查阅视角') }}</legend>
          <div class="assistant-regenerate__choices">
            <label v-for="intent in intents" :key="intent.id" class="assistant-regenerate__choice" :class="{ 'is-selected': selectedIntent === intent.id }">
              <input v-model="selectedIntent" type="radio" name="assistant-regenerate-intent" :value="intent.id" :data-test="`regenerate-intent-${intent.id}`" />
              <span>{{ tr(intent.label) }}</span>
              <small>{{ tr(intent.hint) }}</small>
            </label>
          </div>
        </fieldset>

        <fieldset class="assistant-regenerate__group">
          <legend>{{ tr('取样温度') }}</legend>
          <div class="assistant-regenerate__choices">
            <label v-for="tier in temperatures" :key="tier.id" class="assistant-regenerate__choice" :class="{ 'is-selected': selectedTemperature === tier.id }">
              <input v-model="selectedTemperature" type="radio" name="assistant-regenerate-temperature" :value="tier.id" :data-test="`regenerate-temperature-${tier.id}`" />
              <span>{{ tr(tier.label) }}</span>
              <small>{{ tier.value === null ? tr(tier.hint) : tr('{hint}（{value}）', { hint: tier.hint, value: tier.value }) }}</small>
            </label>
          </div>
        </fieldset>

        <p class="assistant-regenerate__note">{{ tr('重答会按本轮授权资料重新查证并原地替换这条回答，不再调用写作工具循环。') }}</p>
      </div>

      <footer>
        <button type="button" class="assistant-regenerate__cancel" @click="close">{{ tr('取消') }}</button>
        <button type="button" class="assistant-regenerate__confirm" data-test="assistant-regenerate-confirm" :disabled="busy" @click="confirm">{{ tr('开始重答') }}</button>
      </footer>
    </section>
  </Teleport>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
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
const closeRef = ref(null)
onMounted(() => nextTick(() => closeRef.value?.focus({ preventScroll: true })))
function close() { emit('close') }
function confirm() {
  const tier = temperatures.find((item) => item.id === selectedTemperature.value) || temperatures[0]
  emit('confirm', { intent: selectedIntent.value, temperatureOverride: tier.value, tierId: tier.id })
}
</script>

<style scoped>
.assistant-regenerate__scrim { position: fixed; inset: 0; z-index: calc(var(--z-floating-dock, 240) - 1); background: color-mix(in srgb, var(--text-primary, #000) 24%, transparent); }
.assistant-regenerate { position: fixed; top: 50%; left: 50%; z-index: var(--z-floating-dock, 240); display: flex; width: min(440px, calc(100vw - 28px)); max-height: min(80vh, 620px); overflow: hidden; transform: translate(-50%, -50%); flex-direction: column; gap: 14px; padding: 16px; border: 1px solid var(--hairline-soft); border-radius: var(--workspace-radius, 12px); background: var(--surface-workbench-raised); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); font: 14px/1.5 var(--font-interface, var(--font-sans)); outline: none; }
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
.assistant-regenerate__choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.assistant-regenerate__choice { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 8px; padding: 7px 9px; border: 1px solid var(--hairline-soft); border-radius: 10px; background: var(--surface-workbench-input); cursor: pointer; }
.assistant-regenerate__choice input { margin: 0; grid-row: span 2; accent-color: var(--accent); }
.assistant-regenerate__choice span { color: var(--text-primary); font-size: 13px; font-weight: 540; }
.assistant-regenerate__choice small { grid-column: 2; color: var(--text-muted); font-size: 11.5px; line-height: 1.45; }
.assistant-regenerate__choice:hover { border-color: var(--border-strong); }
.assistant-regenerate__choice.is-selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-workbench-input)); }
.assistant-regenerate__choice:has(input:checked) { border-color: var(--accent); }
.assistant-regenerate__choice input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.assistant-regenerate__note { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.55; }
.assistant-regenerate footer { display: flex; justify-content: flex-end; gap: 8px; }
.assistant-regenerate__cancel { border: 1px solid var(--hairline-soft) !important; background: transparent; color: var(--text-secondary); }
.assistant-regenerate__cancel:hover { background: var(--nav-hover); color: var(--text-primary); }
.assistant-regenerate__confirm { background: var(--accent); color: var(--surface-workbench-raised); font-weight: 560; }
.assistant-regenerate__confirm:disabled { opacity: .5; cursor: default; }
.assistant-regenerate button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 520px) { .assistant-regenerate__choices { grid-template-columns: minmax(0, 1fr); } }
</style>
