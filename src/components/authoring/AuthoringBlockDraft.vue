<template>
  <section class="authoring-block-draft" data-test="block-draft" aria-label="待确认的推演草稿">
    <header class="authoring-block-draft__head">
      <div>
        <strong>{{ operation === 'rewrite-unit' ? '重写草稿' : '推演草稿' }}</strong>
        <span>{{ busy ? actionBusyLabel : locked ? '正文已写入，正在等待保存' : helperLabel }}</span>
      </div>
      <span class="authoring-block-draft__state">{{ stateLabel }}</span>
    </header>

    <p v-if="selectedDirection" class="authoring-block-draft__direction">
      <span>沿“{{ selectedDirection.title }}”推演</span>{{ selectedDirection.action }}
    </p>

    <div class="authoring-block-draft__input-shell">
      <textarea
        ref="draftInput"
        class="authoring-block-draft__input"
        :value="modelValue"
        :readonly="locked || busy"
        aria-label="编辑推演草稿"
        @input="updateDraft"
        @keydown="handleDraftKeydown"
      ></textarea>
      <span v-if="beatDraft.boundaries.length" class="authoring-block-draft__boundary-rail" aria-label="草稿单元边界">
        <button
          v-for="boundary in beatDraft.boundaries"
          :key="boundary.key"
          type="button"
          class="authoring-block-draft__boundary-tick"
          :class="{ 'is-split': boundary.split, 'is-selected': selectedBoundaryKey === boundary.key }"
          :style="{ top: boundaryPosition(boundary) }"
          :aria-label="boundary.split ? '查看已拆分边界' : '查看连续段落边界'"
          :aria-pressed="(selectedBoundaryKey === boundary.key).toString()"
          :disabled="locked || busy"
          @click="selectBoundary(boundary)"
        ></button>
      </span>
    </div>

    <details v-if="beatDraft.units.length" class="authoring-block-draft__structure">
      <summary>调整结构（{{ beatDraft.units.length }} 个写作单元）</summary>
      <div v-if="selectedBoundary" class="authoring-block-draft__boundary-action" role="group" aria-label="调整草稿单元边界">
        <span>{{ selectedBoundary.split ? '这里将开始新的写作单元' : '这两段暂时保持在同一写作单元' }}</span>
        <button type="button" :aria-pressed="selectedBoundary.split.toString()" :disabled="locked || busy" @click="setBoundary(true)">拆分</button>
        <button type="button" :aria-pressed="(!selectedBoundary.split).toString()" :disabled="locked || busy" @click="setBoundary(false)">合并</button>
      </div>
      <ol class="authoring-block-draft__unit-plan">
        <li v-for="(unit, index) in beatDraft.units" :key="unit.id">
          <span>{{ index + 1 }}</span>
          <p>{{ unitPreview(unit) }}</p>
        </li>
      </ol>
    </details>

    <div v-if="ifBranch" class="authoring-block-draft__actions" aria-label="IF 草稿切换">
      <button v-for="branch in ['A', 'B']" :key="branch" type="button"
        :aria-pressed="ifBranch === branch" :disabled="busy || locked"
        @click="emit('switch-if', branch)">{{ branch }} 条件</button>
      <button type="button" :disabled="busy || locked" @click="emit('retry-if')">重试当前条件</button>
    </div>
    <details v-if="previousDraft" class="authoring-block-draft__structure">
      <summary>查看上一份试稿（只读）</summary>
      <p class="authoring-block-draft__previous-text">{{ previousDraft }}</p>
    </details>
    <p v-if="failure || staleResult" class="authoring-block-draft__failure" role="alert">
      {{ failure?.message || '落笔处已经变化，请重新选择位置生成；这份草稿仍为你保留。' }}
    </p>
    <p v-else-if="changed && hasDerivedEffects" class="authoring-block-draft__semantic-note">
      你已修改生成稿；采用时只写入编辑稿，当前场与大纲将按最终正文重新识别。
    </p>

    <footer class="authoring-block-draft__footer">
      <span>{{ characterCount }} 字 · {{ paragraphCount }} 段</span>
      <div class="authoring-block-draft__actions">
        <button v-if="changed && !locked" type="button" :disabled="busy" @click="emit('restore')">恢复生成稿</button>
        <button v-if="!locked" type="button" :disabled="busy" @click="emit('dismiss')">丢弃</button>
        <button v-if="!locked" type="button" :disabled="busy" @click="emit('save-as-exploration')">留作构思</button>
        <button
          type="button"
          class="is-primary"
          :disabled="busy || !modelValue.trim()"
          @click="emit('accept')"
        >{{ locked ? '再次保存' : operation === 'rewrite-unit' ? '替换当前块' : '采用编辑稿' }}</button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { createSceneBeatDraft } from '../../services/agents/authoring/unitSemanticProjection.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  originalText: { type: String, default: '' },
  operation: { type: String, default: 'next-passage' },
  hasDerivedEffects: Boolean,
  locked: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  failure: { type: Object, default: null },
  staleResult: { type: Object, default: null },
  previousDraft: { type: String, default: '' },
  ifBranch: { type: String, default: '' },
  boundaryHints: { type: Array, default: () => [] },
  selectedDirection: { type: Object, default: null },
  sessionFingerprint: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'accept', 'dismiss', 'restore', 'save-as-exploration', 'switch-if', 'retry-if'])
const draftInput = ref(null)
const boundaryCorrections = ref([])
const stableBoundaryHints = ref([])
const selectedBoundaryKey = ref('')
const changed = computed(() => props.modelValue !== props.originalText)
const actionBusyLabel = computed(() => props.operation === 'rewrite-unit' ? '正在替换当前文本块' : '正在纳入正文')
const helperLabel = computed(() => props.operation === 'rewrite-unit'
  ? '先修改，确认后才整体替换当前文本块'
  : '先修改，再决定是否纳入正文')
const characterCount = computed(() => [...String(props.modelValue || '')].length)
const paragraphCount = computed(() => String(props.modelValue || '').trim()
  ? String(props.modelValue).trim().split(/\n\s*\n/).length
  : 0)
const beatDraft = computed(() => createSceneBeatDraft({
  text: props.modelValue,
  corrections: boundaryCorrections.value,
  boundaryHints: stableBoundaryHints.value,
  sessionFingerprint: props.sessionFingerprint,
  direction: props.selectedDirection
}))
const selectedBoundary = computed(() => beatDraft.value.boundaries
  .find((boundary) => boundary.key === selectedBoundaryKey.value) || null)
const stateLabel = computed(() => {
  if (props.busy) return '处理中'
  if (props.locked) return '待保存'
  return changed.value ? '已修改' : '未写入正文'
})

function resizeInput() {
  const input = draftInput.value
  if (!input) return
  input.style.height = '0px'
  input.style.height = `${Math.min(Math.max(input.scrollHeight, 132), window.innerHeight * 0.46)}px`
}

function updateDraft(event) {
  emit('update:modelValue', event.target.value)
  resizeInput()
}

function boundaryPosition(boundary) {
  const length = Math.max(1, String(props.modelValue || '').length)
  return `${Math.max(3, Math.min(97, (Number(boundary?.offset || 0) / length) * 100))}%`
}

function selectBoundary(boundary) {
  if (!boundary?.key || props.locked || props.busy) return
  selectedBoundaryKey.value = boundary.key
  nextTick(() => {
    draftInput.value?.focus?.({ preventScroll: true })
    draftInput.value?.setSelectionRange?.(boundary.offset, boundary.offset)
    const length = Math.max(1, String(props.modelValue || '').length)
    const progress = Math.max(0, Math.min(1, Number(boundary.offset || 0) / length))
    draftInput.value.scrollTop = progress * Math.max(0, draftInput.value.scrollHeight - draftInput.value.clientHeight)
  })
}

function setBoundary(split) {
  const boundary = selectedBoundary.value
  if (!boundary || props.locked || props.busy) return
  boundaryCorrections.value = [
    ...boundaryCorrections.value.filter((item) => item.boundaryKey !== boundary.key),
    { boundaryKey: boundary.key, split: Boolean(split) }
  ]
}

function mapResponseBoundaryHints() {
  const baseline = createSceneBeatDraft({ text: props.originalText || props.modelValue })
  stableBoundaryHints.value = (props.boundaryHints || []).map((hint) => {
    const boundary = baseline.boundaries.find((item) => Number(item.offset) === Number(hint?.offset))
    return boundary ? { ...hint, boundaryKey: boundary.key } : null
  }).filter(Boolean)
}

function unitPreview(unit) {
  const value = String(unit?.preview || '').replace(/\s+/g, ' ').trim()
  const sentence = value.match(/^.*?[。！？!?](?:[”’」』])?/u)?.[0] || value
  return sentence.length > 52 ? `${sentence.slice(0, 52)}…` : sentence
}

function requestDismiss() {
  if (!props.busy) emit('dismiss')
}

function requestAccept() {
  if (!props.busy) emit('accept')
}

function handleDraftKeydown(event) {
  event.stopPropagation()
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    requestDismiss()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    requestAccept()
  }
}

watch(() => props.modelValue, (value, previous) => {
  if (value === props.originalText && previous !== value) boundaryCorrections.value = []
  if (selectedBoundaryKey.value && !beatDraft.value.boundaries.some((boundary) => boundary.key === selectedBoundaryKey.value)) {
    selectedBoundaryKey.value = ''
  }
  nextTick(resizeInput)
})
watch(() => props.originalText, () => {
  boundaryCorrections.value = []
  selectedBoundaryKey.value = ''
  mapResponseBoundaryHints()
})
watch(() => props.boundaryHints, mapResponseBoundaryHints, { deep: true })

onMounted(() => {
  mapResponseBoundaryHints()
  resizeInput()
  if (props.locked) return
  draftInput.value?.focus({ preventScroll: true })
  draftInput.value?.setSelectionRange(0, 0)
  if (draftInput.value) draftInput.value.scrollTop = 0
  draftInput.value?.closest('section')?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
})

defineExpose({ getSceneBeatDraft: () => beatDraft.value })
</script>

<style scoped>
.authoring-block-draft__previous-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
}
.authoring-block-draft {
  width: 100%;
  padding: 14px 12px 12px 36px;
  border-block: 1px solid color-mix(in srgb, var(--accent-primary) 24%, var(--border-subtle));
  background: color-mix(in srgb, var(--accent-soft, #edf5ff) 24%, transparent);
}

.authoring-block-draft__head,
.authoring-block-draft__footer,
.authoring-block-draft__actions {
  display: flex;
  align-items: center;
}

.authoring-block-draft__head {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.authoring-block-draft__head > div {
  display: grid;
  gap: 2px;
}

.authoring-block-draft__head strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.03em;
}

.authoring-block-draft__head span,
.authoring-block-draft__footer,
.authoring-block-draft__state {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.authoring-block-draft__state {
  flex: 0 0 auto;
}

.authoring-block-draft__direction {
  display: flex;
  gap: 8px;
  margin: -1px 0 7px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.authoring-block-draft__direction span {
  flex: 0 0 auto;
  color: var(--text-primary);
}

.authoring-block-draft__input {
  display: block;
  width: 100%;
  min-height: 132px;
  max-height: 46vh;
  padding: 9px 0;
  resize: none;
  overflow-y: auto;
  border: 0;
  border-block: 1px solid var(--border-subtle);
  outline: 0;
  background: transparent;
  color: color-mix(in srgb, var(--text-primary) 82%, var(--accent-primary));
  font: inherit;
  line-height: var(--notebook-line-height, 1.9);
  white-space: pre-wrap;
}

.authoring-block-draft__input-shell {
  position: relative;
}

.authoring-block-draft__boundary-rail {
  position: absolute;
  inset: 9px auto 9px -23px;
  width: 18px;
  pointer-events: none;
}

.authoring-block-draft__boundary-rail::before {
  position: absolute;
  inset: 0 auto 0 7px;
  width: 1px;
  content: '';
  background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
}

.authoring-block-draft__boundary-tick {
  position: absolute;
  left: 4px;
  width: 7px;
  height: 7px;
  min-height: 0 !important;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--text-secondary) 24%, transparent) !important;
  border-radius: 50%;
  transform: translateY(-50%);
  pointer-events: auto;
}

.authoring-block-draft__boundary-tick::before {
  position: absolute;
  inset: -12px;
  content: '';
}

.authoring-block-draft__boundary-tick.is-split {
  left: 1px;
  width: 13px;
  height: 2px;
  border: 0 !important;
  border-radius: 0;
  background: color-mix(in srgb, var(--accent-primary) 58%, transparent);
}

.authoring-block-draft__boundary-tick.is-selected {
  background: var(--accent-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.authoring-block-draft__boundary-action {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-height: 36px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
}

.authoring-block-draft__boundary-action > span {
  margin-right: auto;
}

.authoring-block-draft__boundary-action button[aria-pressed='true'] {
  color: var(--text-primary);
  border-bottom-color: var(--accent-primary);
}

.authoring-block-draft__input:focus {
  border-bottom-color: color-mix(in srgb, var(--accent-primary) 65%, var(--border-default));
}

.authoring-block-draft__unit-plan {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0 2px;
  border-bottom: 1px solid var(--border-subtle);
}

.authoring-block-draft__unit-plan > header {
  display: grid;
  align-content: start;
  gap: 2px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.45;
}

.authoring-block-draft__unit-plan > header strong {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 550;
}

.authoring-block-draft__unit-plan ol {
  max-height: 124px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.authoring-block-draft__unit-plan li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 6px;
  min-height: 26px;
  padding: 3px 0;
  border-top: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
}

.authoring-block-draft__unit-plan li:first-child {
  border-top: 0;
}

.authoring-block-draft__unit-plan li > span {
  color: var(--text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.authoring-block-draft__unit-plan p {
  margin: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.authoring-block-draft__input[readonly] {
  opacity: 0.72;
}

.authoring-block-draft__failure {
  margin: 8px 0 0;
  color: var(--text-danger, var(--text-primary));
  font-size: 12px;
}

.authoring-block-draft__semantic-note {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.authoring-block-draft__footer {
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
}

.authoring-block-draft__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 14px;
}

.authoring-block-draft button {
  min-height: 30px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.authoring-block-draft button:hover,
.authoring-block-draft button:focus-visible {
  color: var(--text-primary);
}

.authoring-block-draft button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-primary) 42%, transparent);
  outline-offset: 2px;
}

.authoring-block-draft button.is-primary {
  color: var(--text-primary);
  border-bottom-color: var(--accent-primary);
}

.authoring-block-draft button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .authoring-block-draft { padding: 12px 8px 10px 32px; }
  .authoring-block-draft__footer { align-items: flex-start; }
  .authoring-block-draft__actions { gap: 10px; }
  .authoring-block-draft__boundary-action { flex-wrap: wrap; gap: 6px 16px; }
  .authoring-block-draft__boundary-action > span { flex-basis: 100%; }
  .authoring-block-draft__boundary-action button { min-height: 44px; }
  .authoring-block-draft__direction { display: grid; gap: 1px; }
  .authoring-block-draft__unit-plan { grid-template-columns: 1fr; gap: 4px; }
  .authoring-block-draft__unit-plan > header { display: flex; justify-content: space-between; gap: 12px; }
}

.authoring-block-draft__prev-note{margin:0 0 6px;color:var(--text-muted);font-size:11px}
</style>
<style scoped>
.authoring-block-draft__structure{margin:0;border-top:1px dashed var(--border-subtle);padding-top:2px}
.authoring-block-draft__structure summary{color:var(--text-secondary);font:500 12px/1 var(--font-sans);cursor:pointer;padding:8px 0;list-style:none;user-select:none}
.authoring-block-draft__structure summary::before{content:'› ';display:inline-block;transition:transform 120ms}
.authoring-block-draft__structure[open] summary::before{transform:rotate(90deg)}
.authoring-block-draft__structure .authoring-block-draft__unit-plan{margin:6px 0;padding-inline-start:24px}
.authoring-block-draft__structure .authoring-block-draft__boundary-action{margin:6px 0}

.authoring-block-draft__prev-note{margin:0 0 6px;color:var(--text-muted);font-size:11px}
</style>
