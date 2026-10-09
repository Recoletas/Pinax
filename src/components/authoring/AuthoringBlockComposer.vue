<template>
  <section class="authoring-block-composer" data-test="block-composer" :aria-label="tr('长篇推演')">
    <header class="authoring-block-composer__head">
      <strong v-if="emptyChapter">{{ tr('写下开场') }}</strong>
      <p v-else-if="displayTarget?.anchorExcerpt" class="authoring-block-composer__anchor" :title="displayTarget.anchorExcerpt">{{ displayTarget.anchorExcerpt }}</p>
      <button type="button" class="authoring-block-composer__close" :aria-label="tr('收起推演')" @click="cancel">{{ tr("收起") }}</button>
    </header>
    <p v-if="sceneContextSummary" class="authoring-block-composer__scene-context">
      <span>{{ tr("当前场") }}</span>{{ sceneContextSummary }}
    </p>
    <slot name="context" />
    <AuthoringGenerationStatus v-if="generating" />
    <template v-if="!showRetained">
      <div v-if="!emptyChapter" class="authoring-block-composer__operations" role="radiogroup" :aria-label="tr('写作任务')">
        <button type="button" role="radio" :disabled="generating" :aria-checked="operation === 'next-passage'" @click="operation = 'next-passage'">{{ tr("推演下一段") }}</button>
        <button type="button" role="radio" :disabled="generating" :aria-checked="operation === 'rewrite-unit'" @click="operation = 'rewrite-unit'">{{ tr("重写当前块") }}</button>
      </div>
      <div v-if="operation === 'next-passage' && (kind === 'dialogue' || kind === 'thought')" class="authoring-block-composer__people">
        <label>{{ kind === 'thought' ? tr("视角人物") : tr("说话人") }}<select v-model="actorId"><option value="">{{ tr("请选择") }}</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
        <label v-if="kind === 'dialogue'">{{ tr("对象") }}<select v-model="targetId"><option value="">{{ tr("请选择") }}</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
      </div>
      <label class="authoring-block-composer__instruction">
        <textarea ref="instructionInput" v-model="instruction" :readonly="generating" :aria-label="tr('推演要求')" :placeholder="tr(instructionPlaceholder)" @keydown="handleInstructionKeydown" />
      </label>
      <small class="authoring-block-composer__shortcut">{{ tr('Enter 推演 · Ctrl+Enter 换行') }}</small>
      <p v-if="!generating && validationMessage" role="alert">{{ tr(validationMessage) }}</p>
      <p v-else-if="!generating && failure && !staleText" role="alert">{{ failure.message || tr("生成失败，请重试") }}</p>
      <details class="authoring-block-composer__more">
        <summary>{{ tr("推演选项") }}<span v-if="kind !== 'action' || authorNote.trim()"> {{ tr("· 已设置") }}</span></summary>
        <div class="authoring-block-composer__more-body">
          <div v-if="operation === 'next-passage'" class="authoring-block-composer__kinds" role="radiogroup" :aria-label="tr('推进类型')">
            <button v-for="option in kindOptions" :key="option.id" type="button" role="radio" :aria-checked="kind === option.id" @click="kind = option.id">{{ tr(option.label) }}</button>
          </div>
          <label>{{ tr("额外约束") }}<textarea v-model="authorNote" :placeholder="tr('仅用于本次，不写入正文')" /></label>
        </div>
      </details>
      <div class="authoring-block-composer__footer">
        <div class="authoring-block-composer__actions">
          <button v-if="failure?.phase === 'persist'" type="button" @click="$emit('retry-persist')">{{ tr("再次保存") }}</button>
          <button type="button" class="control-primary" data-test="block-primary" @click="generating ? $emit('stop') : submit()">{{ tr(primaryLabel) }}</button>
        </div>
      </div>
      <button v-if="staleText" type="button" class="authoring-block-composer__return-result" @click="editingRetained = false">{{ tr('返回生成结果') }}</button>
    </template>
    <section v-else class="authoring-block-composer__stale-preview" :aria-label="tr('保留的生成正文')">
      <p v-if="!generating" class="authoring-block-composer__result-notice" role="status">{{ tr(failure && failure.phase !== 'stale' ? failure.message || staleNotice : staleNotice) }}</p>
      <div data-test="block-stale-preview" class="authoring-block-composer__retained-prose"><p v-for="(paragraph, index) in staleParagraphs" :key="index">{{ paragraph }}</p></div>
      <div class="authoring-block-composer__retained-actions">
        <button type="button" @click="copyRetained">{{ tr(copyNotice || '复制') }}</button>
        <button type="button" :disabled="staleResult.savedAsExploration" @click="$emit('save-retained')">{{ tr(staleResult.savedAsExploration ? '已留作构思' : '留作构思') }}</button>
        <button v-if="!generating" type="button" @click="editingRetained = true; nextTick(() => { fitInstruction(); focusInstruction() })">{{ tr('修改要求') }}</button>
        <button v-else type="button" @click="$emit('stop')">{{ tr('停止') }}</button>
      </div>
    </section>
  </section>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { buildAuthoringTurnIntent } from '../../services/agents/authoring/authoringTurnContract.js'
import { normalizeNarrativeTransportProse } from '../../services/narrativePresentation.js'
import AuthoringGenerationStatus from './AuthoringGenerationStatus.vue'

const props = defineProps({
  target: { type: Object, required: true },
  emptyChapter: { type: Boolean, default: false },
  projection: { type: Object, default: null },
  people: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false },
  failure: { type: Object, default: null },
  staleResult: { type: Object, default: null },
  initialActorId: { type: String, default: '' },
  initialTargetId: { type: String, default: '' },
  // 预填指令（如现场条“以此推进”）：composer 打开时写入输入框，仍由用户确认后才生成。
  initialInstruction: { type: String, default: '' },
  initialDraft: { type: Object, default: null }
})
const emit = defineEmits(['submit', 'cancel', 'stop', 'retry-persist', 'draft-change', 'save-retained'])
const copyNotice = ref('')
async function copyRetained() {
  try { await navigator.clipboard.writeText(staleText.value); copyNotice.value = '已复制' }
  catch { copyNotice.value = '请选中文字复制' }
}
const kindOptions = Object.freeze([
  { id: 'action', label: '推动行动' }, { id: 'dialogue', label: '人物对话' },
  { id: 'thought', label: '人物内心' }, { id: 'scene', label: '转场铺陈' }
])
const kind = ref(props.initialDraft?.kind || 'action')
const operation = ref(props.initialDraft?.operation || 'next-passage')
const actorId = ref(props.initialDraft?.actorId || '')
const targetId = ref(props.initialDraft?.targetId || '')
const instruction = ref(props.initialDraft?.instruction || '')
const instructionInput = ref(null)
const authorNote = ref(props.initialDraft?.directorNote || '')
const validationMessage = ref('')
const staleText = computed(() => {
  const text = String(props.staleResult?.text || '')
  return text.trim() ? normalizeNarrativeTransportProse(text) : ''
})
const staleParagraphs = computed(() => staleText.value.split(/\n\s*\n/).filter(Boolean))
const editingRetained = ref(false)
const showRetained = computed(() => Boolean(staleText.value) && !editingRetained.value)
const displayTarget = computed(() => showRetained.value ? props.staleResult?.target || props.target : props.target)
watch(() => props.staleResult, () => { copyNotice.value = ''; editingRetained.value = false })
const staleNotice = computed(() => (props.staleResult?.dependencyIssues || []).some(issue => issue.reason === 'revision-missing')
  ? '这份草稿的参考尚未确认，暂未加入正文。'
  : (props.staleResult?.dependencyIssues || []).some(issue => issue.reason === 'revision-changed')
    ? '生成期间正文或参考有改动，这份草稿已保留。'
    : '这份草稿已保留，暂未加入正文。')
const sceneContextSummary = computed(() => {
  const projection = props.projection || {}
  const peopleNames = [
    projection.viewpointCharacter,
    projection.activeActor,
    projection.dialogueTarget,
    ...(projection.presentCharacters || [])
  ].map((person) => person?.name).filter((name, index, values) => name && values.indexOf(name) === index)
  return [
    projection.time?.label,
    projection.location?.name,
    peopleNames.slice(0, 3).join('、')
  ].filter(Boolean).join(' · ')
})
const instructionPlaceholder = computed(() => {
  if (props.emptyChapter) return '例如：从雨夜的码头开场（可留空）'
  if (operation.value === 'rewrite-unit') return '例如：收紧节奏，保留人物的迟疑（可留空）'
  return '例如：她推开门，却先听见屋内的对话（可留空）'
})
watch(() => props.initialInstruction, (value) => {
  // 只在 composer 可见时预填；每次新指令覆盖旧输入（来源是显式的“以此推进”动作）。
  if (!props.generating && value) instruction.value = String(value)
}, { immediate: true })
watch(() => props.initialActorId, (value) => {
  if (value) actorId.value = String(value)
}, { immediate: true })
watch(() => props.initialTargetId, (value) => {
  if (value) targetId.value = String(value)
}, { immediate: true })
watch([kind, () => props.projection, () => props.people], ([nextKind]) => {
  const available = new Set(props.people.map((person) => person.id))
  if (actorId.value && !available.has(actorId.value)) actorId.value = ''
  if (targetId.value && !available.has(targetId.value)) targetId.value = ''
  if (!['dialogue', 'thought'].includes(nextKind)) return
  const projection = props.projection || {}
  const preferredActor = [
    props.initialActorId,
    projection.activeActor?.id,
    projection.viewpointCharacter?.id
  ].find((id) => id && available.has(id)) || ''
  if (!actorId.value) actorId.value = preferredActor
  if (nextKind === 'dialogue' && !targetId.value) {
    targetId.value = [
      props.initialTargetId,
      projection.dialogueTarget?.id,
    ].find((id) => id && id !== actorId.value && available.has(id)) || ''
  }
  validationMessage.value = ''
}, { immediate: true })
watch([kind, operation, actorId, targetId, instruction, authorNote], () => {
  validationMessage.value = ''
  emit('draft-change', {
    instruction: instruction.value,
    directorNote: authorNote.value,
    operation: operation.value,
    kind: kind.value,
    actorId: actorId.value,
    targetId: targetId.value
  })
})
const primaryLabel = computed(() => {
  if (props.generating) return '停止'
  return '生成草稿'
})

function submit() {
  if (props.generating) return
  const built = buildAuthoringTurnIntent({
    operation: operation.value,
    kind: kind.value,
    actorId: actorId.value,
    targetId: targetId.value,
    viewpointCharacterId: kind.value === 'thought' ? actorId.value : '',
    instruction: instruction.value,
    directorNote: authorNote.value
  })
  if (!built.ok) {
    validationMessage.value = built.reason === 'dialogue-requires-speaker-and-target'
      ? '对话推演需要选择说话人和对象。'
      : built.reason === 'thought-requires-known-viewpoint'
        ? '心理推演需要选择视角人物。'
        : '这次推演的信息还不完整。'
    return
  }
  validationMessage.value = ''
  emit('submit', { target: props.target, turn: built.turn, authorNote: authorNote.value })
}

function handleInstructionKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    if (props.generating || event.repeat) return
    if (event.ctrlKey || event.metaKey) {
      const field = event.target
      field.setRangeText('\n', field.selectionStart, field.selectionEnd, 'end')
      instruction.value = field.value
    } else submit()
    return
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  cancel()
}

function cancel() {
  emit('cancel')
}

function focusInstruction() {
  instructionInput.value?.focus?.()
  return document.activeElement === instructionInput.value
}

function fitInstruction() {
  const field = instructionInput.value
  if (!field) return
  field.style.height = 'auto'
  field.style.height = `${Math.min(260, Math.max(88, field.scrollHeight))}px`
}
watch(instruction, () => nextTick(fitInstruction))
onMounted(() => nextTick(() => { fitInstruction(); focusInstruction() }))

defineExpose({ focusInstruction })
</script>

<style scoped>
.authoring-block-composer {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: 16px 16px 14px 38px;
  border-block: 1px solid color-mix(in srgb, var(--accent-primary) 18%, var(--border-subtle));
  background: color-mix(in srgb, var(--accent-primary) 2.5%, transparent);
}
.authoring-block-composer::before {
  position: absolute;
  inset: 16px auto 14px 22px;
  width: 2px;
  content: '';
  background: color-mix(in srgb, var(--accent-primary) 48%, transparent);
}
.authoring-block-composer__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 9px; }
.authoring-block-composer__head > div { display: grid; gap: 2px; }
.authoring-block-composer__head strong { color: var(--text-primary); font-family: var(--font-display); font-size: 16px; font-weight: 650; letter-spacing: 0.01em; }
.authoring-block-composer__head span { color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
.authoring-block-composer__scene-context { margin: -1px 0 8px; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
.authoring-block-composer__anchor { margin: -1px 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
.authoring-block-composer__head .authoring-block-composer__anchor { flex: 1; min-width: 0; margin: 0; font-size: 13px; line-height: 28px; }
.authoring-block-composer__result-notice { margin: 0 0 8px; color: var(--text-secondary); font: 12px/1.7 var(--font-interface); }
.authoring-block-composer__return-result { margin-top: 8px; }
.authoring-block-composer__scene-context span { margin-right: 7px; color: var(--text-primary); font-weight: 600; }
.authoring-block-composer textarea { width: 100%; min-height: 72px; padding: 9px 0 7px; resize: vertical; background: transparent; color: var(--text-primary); border: 0; border-bottom: 1px solid var(--border-default); font: 14px/1.72 var(--notebook-font-family, var(--font-serif, serif)); outline: none; }
.authoring-block-composer textarea:focus { border-bottom-color: var(--accent-primary); }
.authoring-block-composer__instruction { display: grid; gap: 0; margin-top: 5px; color: var(--text-secondary); font-size: 11px; }
.authoring-block-composer__stale-preview { display: grid; min-width: 0; max-width: 100%; gap: 3px; margin-top: 8px; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
 .authoring-block-composer__retained-prose { width:100%; min-width:0; color:var(--text-primary); font:16px/1.9 var(--notebook-font-family,var(--font-body,var(--font-serif))); white-space:pre-wrap; overflow-wrap:anywhere; user-select:text; }
.authoring-block-composer__retained-prose p { margin:14px 0; }
.authoring-block-composer__shortcut { display:block; margin-top:6px; color:var(--text-muted); font:11px/1.5 var(--font-interface); }
.authoring-block-composer__operations, .authoring-block-composer__kinds, .authoring-block-composer__actions, .authoring-block-composer__people { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.authoring-block-composer__operations, .authoring-block-composer__kinds { border-bottom: 1px solid var(--border-subtle); }
.authoring-block-composer__operations { margin-bottom: 4px; }
.authoring-block-composer button { min-height: 32px; padding: 0; border: 0; border-bottom: 1px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-block-composer__operations button, .authoring-block-composer__kinds button { margin-bottom: -1px; }
.authoring-block-composer [aria-checked="true"] { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
.authoring-block-composer__starters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 9px 0 3px;
}
.authoring-block-composer__starters > span {
  flex-basis: 100%;
  color: var(--text-secondary);
  font-size: 10px;
}
.authoring-block-composer__starters button {
  min-height: 28px;
  border-bottom-color: color-mix(in srgb, var(--text-secondary) 24%, transparent);
  font-size: 11px;
}
.authoring-block-composer__starters button:hover { color: var(--accent-primary); border-bottom-color: currentColor; }
.authoring-block-composer__close { min-height: 28px; font-size: 11px; }
.authoring-block-composer__people { padding-top: 10px; }
.authoring-block-composer__people label { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 12px; }
.authoring-block-composer__people select { min-height: 30px; border: 0; border-bottom: 1px solid var(--border-default); background: transparent; color: var(--text-primary); }
.authoring-block-composer__footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-top: 5px; }
.authoring-block-composer__more { min-width: 0; color: var(--text-secondary); font-size: 11px; }
.authoring-block-composer__more summary { width: max-content; cursor: pointer; }
.authoring-block-composer__more-body { display: grid; width: min(480px, 65vw); gap: 10px; padding-top: 8px; }
.authoring-block-composer__more-body label { display: grid; gap: 2px; }
.authoring-block-composer__more-body label:last-child { display: flex; align-items: center; }
.authoring-block-composer__more-body textarea { min-height: 48px; }
.authoring-block-composer__actions { flex-shrink: 0; justify-content: flex-end; }
.authoring-block-composer [data-test="block-primary"] {
  min-width: 112px;
  padding: 7px 18px;
  border: 0;
  border-radius: 3px;
  background: var(--control-accent-bg, var(--accent-primary));
  color: var(--archive-paper-soft, #f5f7f4);
  font-weight: 650;
}
.authoring-block-composer [role="alert"] { margin: 8px 0 0; color: var(--text-danger, var(--text-primary)); font-size: 12px; }
@media (max-width: 640px) {
  .authoring-block-composer { padding: 14px 8px 12px 30px; }
  .authoring-block-composer::before { left: 16px; }
  .authoring-block-composer__head { gap: 10px; }
  .authoring-block-composer__head span { max-width: 26ch; }
  .authoring-block-composer__more-body { width: min(260px, 72vw); }
  .authoring-block-composer__starters { gap: 2px 10px; }
  .authoring-block-composer__starters button { min-height: 40px; }
}
.authoring-block-composer__instruction { margin-top: 14px; }
.authoring-block-composer__more { margin-top: 10px; width: 100%; }
.authoring-block-composer__more-body { width: 100%; box-sizing: border-box; }
.authoring-block-composer__more-body label:last-child { display: grid; align-items: stretch; }
.authoring-block-composer__more-body textarea { box-sizing: border-box; width: 100%; font-family: var(--font-sans); }
.authoring-block-composer__footer { margin-top: 12px; justify-content: flex-end; }
</style>
<style scoped>
.authoring-block-composer__adjust{border-top:1px dashed var(--border-subtle);margin-top:4px;padding-top:2px}
.authoring-block-composer__adjust summary{color:var(--text-secondary);font:500 12px/1 var(--font-sans);cursor:pointer;padding:8px 0;list-style:none;user-select:none}
.authoring-block-composer__adjust summary::before{content:'› ';display:inline-block;transition:transform 120ms}
.authoring-block-composer__adjust[open] summary::before{transform:rotate(90deg)}
.authoring-block-composer__adjust-body{display:grid;gap:10px;padding-bottom:8px}
</style>
