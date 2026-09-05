<template>
  <section class="authoring-block-composer" data-test="block-composer" aria-label="长篇推演">
    <header class="authoring-block-composer__head">
      <div>
        <strong>{{ heading }}</strong>
        <span>{{ operation === 'rewrite-unit' ? '保留原文直到你采用修改稿' : '先确定下一步，再生成可编辑正文' }}</span>
      </div>
      <button type="button" class="authoring-block-composer__close" aria-label="收起推演" @click="cancel">收起</button>
    </header>
    <p v-if="sceneContextSummary" class="authoring-block-composer__scene-context">
      <span>当前场</span>{{ sceneContextSummary }}
    </p>
    <slot name="context" />
    <div v-if="!emptyChapter" class="authoring-block-composer__operations" role="radiogroup" aria-label="写作任务">
      <button type="button" role="radio" :aria-checked="operation === 'next-passage'" @click="operation = 'next-passage'">推演下一段</button>
      <button type="button" role="radio" :aria-checked="operation === 'rewrite-unit'" @click="operation = 'rewrite-unit'">重写当前块</button>
    </div>
    <div v-if="operation === 'next-passage'" class="authoring-block-composer__kinds" role="radiogroup" aria-label="推进类型">
      <button v-for="option in kindOptions" :key="option.id" type="button" role="radio"
        :aria-checked="kind === option.id" @click="kind = option.id">{{ option.label }}</button>
    </div>
    <div class="authoring-block-composer__starters" aria-label="写作起点">
      <span>可以从这里开始</span>
      <button v-for="starter in promptStarters" :key="starter" type="button" @click="useStarter(starter)">{{ starter }}</button>
    </div>
    <div v-if="operation === 'next-passage' && (kind === 'dialogue' || kind === 'thought')" class="authoring-block-composer__people">
      <label>{{ kind === 'thought' ? '视角人物' : '说话人' }}<select v-model="actorId"><option value="">请选择</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
      <label v-if="kind === 'dialogue'">对象<select v-model="targetId"><option value="">请选择</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
    </div>
    <label class="authoring-block-composer__instruction">
      <span>{{ operation === 'rewrite-unit' ? '希望怎样重写' : '接下来想写什么' }}</span>
      <textarea ref="instructionInput" v-model="instruction" :placeholder="instructionPlaceholder" @keydown="handleInstructionKeydown" />
    </label>
    <p v-if="validationMessage" role="alert">{{ validationMessage }}</p>
    <p v-else-if="failure" role="alert">{{ failure.message || '生成失败，请重试' }}</p>
    <p v-if="staleResult" role="alert">目标文本已变化，请重新选择插入位置；生成结果已保留。</p>
    <label v-if="staleText" class="authoring-block-composer__stale-preview">
      <span>生成正文 · 只读，未写入正文</span>
      <textarea
        data-test="block-stale-preview"
        :value="staleText"
        readonly
        wrap="soft"
        aria-label="过期生成正文，只读"
        spellcheck="false"
      ></textarea>
    </label>
    <div class="authoring-block-composer__footer">
      <details class="authoring-block-composer__more">
        <summary>高级设置</summary>
        <div class="authoring-block-composer__more-body">
          <label>导演注<textarea v-model="authorNote" placeholder="只约束这次推演" /></label>
        </div>
      </details>
      <div class="authoring-block-composer__actions">
        <button v-if="failure?.phase === 'persist'" type="button" @click="$emit('retry-persist')">再次保存</button>
        <button type="button" class="control-primary" data-test="block-primary" :disabled="contextLoading && !generating" @click="generating ? $emit('stop') : submit()">{{ primaryLabel }}</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { buildAuthoringTurnIntent } from '../../services/agents/authoring/authoringTurnContract.js'

const props = defineProps({
  target: { type: Object, required: true },
  emptyChapter: { type: Boolean, default: false },
  projection: { type: Object, default: null },
  people: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false },
  failure: { type: Object, default: null },
  staleResult: { type: Object, default: null },
  contextLoading: { type: Boolean, default: false },
  initialActorId: { type: String, default: '' },
  initialTargetId: { type: String, default: '' },
  // 预填指令（如现场条“以此推进”）：composer 打开时写入输入框，仍由用户确认后才生成。
  initialInstruction: { type: String, default: '' }
})
const emit = defineEmits(['submit', 'cancel', 'stop', 'retry-persist', 'draft-change'])
const kindOptions = Object.freeze([
  { id: 'action', label: '推动行动' }, { id: 'dialogue', label: '人物对话' },
  { id: 'thought', label: '人物内心' }, { id: 'scene', label: '转场铺陈' }
])
const kind = ref('action')
const operation = ref('next-passage')
const actorId = ref('')
const targetId = ref('')
const instruction = ref('')
const instructionInput = ref(null)
const authorNote = ref('')
const validationMessage = ref('')
const staleText = computed(() => {
  const text = String(props.staleResult?.text || '')
  return text.trim() ? text : ''
})
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
const heading = computed(() => props.emptyChapter
  ? '这一章从哪里开始？'
  : operation.value === 'rewrite-unit' ? '这段文字想改成什么？' : '接下来会发生什么？')
const instructionPlaceholder = computed(() => {
  if (props.emptyChapter) return '例如：从雨夜的码头开场（可留空）'
  if (operation.value === 'rewrite-unit') return '例如：收紧节奏，保留人物的迟疑（可留空）'
  return '例如：她推开门，却先听见屋内的对话（可留空）'
})
const promptStarters = computed(() => {
  if (operation.value === 'rewrite-unit') return ['收紧节奏，保留关键信息', '减少解释，强化人物反应', '换一个更自然的表达']
  const projection = props.projection || {}
  const lead = projection.viewpointCharacter?.name || props.people[0]?.name || '人物'
  const other = props.people.find((person) => person?.name && person.name !== lead)?.name || '另一人'
  const location = projection.location?.name || '当前地点'
  if (kind.value === 'dialogue') return [`让${lead}主动开口`, `让${other}提出质疑`, '用一句话打破沉默']
  if (kind.value === 'thought') return [`写出${lead}真正担心的事`, `让${lead}想起一个关键细节`, '让判断和情绪发生冲突']
  if (kind.value === 'scene') return [`让${location}出现新的变化`, '把镜头移到更有压力的位置', '用环境变化推动下一步']
  return [`让${lead}立刻采取行动`, '让当前阻力产生后果', '让一个未决问题浮到眼前']
})

function useStarter(starter) {
  instruction.value = starter
  nextTick(() => {
    instructionInput.value?.focus?.({ preventScroll: true })
    instructionInput.value?.setSelectionRange?.(starter.length, starter.length)
  })
}
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
watch([operation, actorId, targetId, instruction, authorNote], () => {
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
  if (props.contextLoading) return '核对参考中'
  return '生成推演稿'
})

function submit() {
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

onMounted(() => nextTick(focusInstruction))

defineExpose({ focusInstruction })
</script>

<style scoped>
.authoring-block-composer {
  position: relative;
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
.authoring-block-composer__scene-context span { margin-right: 7px; color: var(--text-primary); font-weight: 600; }
.authoring-block-composer textarea { width: 100%; min-height: 72px; padding: 9px 0 7px; resize: vertical; background: transparent; color: var(--text-primary); border: 0; border-bottom: 1px solid var(--border-default); font: 14px/1.72 var(--notebook-font-family, var(--font-serif, serif)); outline: none; }
.authoring-block-composer textarea:focus { border-bottom-color: var(--accent-primary); }
.authoring-block-composer__instruction { display: grid; gap: 0; margin-top: 5px; color: var(--text-secondary); font-size: 11px; }
.authoring-block-composer__stale-preview { display: grid; min-width: 0; max-width: 100%; gap: 3px; margin-top: 8px; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
.authoring-block-composer__stale-preview textarea { display: block; min-width: 0; max-width: 100%; min-height: 112px; max-height: 34vh; padding: 8px 0; resize: vertical; overflow-x: hidden; overflow-y: auto; border: 0; border-block: 1px solid var(--border-subtle); line-height: var(--notebook-line-height, 1.9); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; cursor: text; }
.authoring-block-composer__stale-preview textarea:focus { border-block-color: var(--border-subtle); }
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
</style>
