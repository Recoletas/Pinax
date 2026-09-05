<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { buildAuthoringTurnIntent } from '../../services/agents/authoring/authoringTurnContract.js'
import {
  SEMI_AUTO_MAX_BEATS,
  shouldPauseSemiAutoBeat
} from '../../services/agents/authoring/authoringSemiAutoPolicy.js'

// Plan Task 2.2 / spec §6：下一拍输入区。
// 只发出标准 turn request（contract 校验后的 shape），绝不在这里拼 prompt；
// 类型选择是文本+下划线分段控件，不是 pill；
// 主按钮三态：空输入"继续下一拍" / 非空"按此推进" / 生成中"停止"。
// 失败不清空任何草稿状态：输入、行动者、对象、导演注全部保留并给一键重试。

const props = defineProps({
  busy: { type: Boolean, default: false },
  actor: { type: Object, default: null },
  target: { type: Object, default: null },
  viewpoint: { type: Object, default: null },
  sourceRefs: { type: Array, default: () => [] },
  // typed 失败结果（phase/code/retryable/generatedTextAvailable）：页面从
  // normalizeAuthoringFailure 归一后传入；这里按 phase 渲染对应的恢复动作。
  failure: { type: Object, default: null },
  applyToken: { type: Number, default: 0 },
  // spec §8：候选短列表（输入区上方）。组件只展示 + 上抛 typed 动作，
  // 填入/推进/纲要/忽略的落点全部由页面决定；绝不在这里写正文。
  directionCandidates: { type: Array, default: () => [] },
  dialogueCandidates: { type: Array, default: () => [] },
  // spec §6.4：环境暂停信号（直接提问/地点切换/机制触发/异常审阅），由页面从共享投影推导。
  semiAutoPauseReason: { type: String, default: '' },
  // Task 9：现场人物名单（来自共享投影）与 Zen 状态，用于行动者/对象选择与续写坞收起。
  people: { type: Array, default: () => [] },
  zenMode: { type: Boolean, default: false }
})

const emit = defineEmits([
  'submit',
  'stop',
  'retry-save',
  'select-actor',
  'select-target',
  'request-reference-summary',
  'request-next-directions',
  'request-dialogue-options',
  'candidate-action'
])

const failureMessage = computed(() => props.failure?.message || '')

const KINDS = [
  { value: 'action', label: '行动' },
  { value: 'dialogue', label: '对话' },
  { value: 'thought', label: '心理' },
  { value: 'scene', label: '场景' }
]

const kind = ref('action')
const instruction = ref('')
const directorNote = ref('')
const moreOpen = ref(false)
const statusMessage = ref('')
const semiAutoEnabled = ref(false)
const semiAutoRemaining = ref(0)
// spec §6.4 硬上限：连续三拍含“启用半自动时已在飞的那一拍”。
// 启用即在飞拍已被计入余量，它落盘的 apply token 不能再扣一次。
let semiAutoInflightCounted = false
const hasLastAttempt = ref(false)
let lastAttempt = null
let applyTokenSeen = props.applyToken

const primaryLabel = computed(() => {
  if (props.busy) return '停止'
  return instruction.value.trim() ? '按此推进' : '继续下一拍'
})

const statusText = computed(() => {
  if (statusMessage.value) return statusMessage.value
  if (props.busy) return '正在生成这一拍…'
  return ''
})

watch(() => props.applyToken, (token) => {
  if (token === applyTokenSeen) return
  applyTokenSeen = token
  // 成功写入后只清空草稿；行动者/对象属于页面现场状态，不由这里重置。
  statusMessage.value = ''
  instruction.value = ''
  directorNote.value = ''
  lastAttempt = null
  hasLastAttempt.value = false
  if (semiAutoEnabled.value) {
    // 每个 apply token = 一拍成功写入，计入连续三拍硬上限；
    // 启用时已在飞的那一拍已提前扣减，这里不再重复计。
    if (semiAutoInflightCounted) {
      semiAutoInflightCounted = false
    } else {
      semiAutoRemaining.value = Math.max(semiAutoRemaining.value - 1, 0)
    }
  }
  maybeRunSemiAutoBeat()
})

// typed 失败/stale/中止（failure 对象由页面统一供给）必须立即暂停半自动：
// 失败不推进 apply token，若只在 token 变化时检查，半自动会在之后一次成功时意外恢复。
watch(failureMessage, (message) => {
  if (message) pauseSemiAuto()
})

function pauseSemiAuto() {
  // 用户键入即接管：有界半自动立即暂停并清零剩余拍数。
  semiAutoInflightCounted = false
  if (semiAutoEnabled.value || semiAutoRemaining.value > 0) {
    semiAutoEnabled.value = false
    semiAutoRemaining.value = 0
  }
}

function onInstructionInput(event) {
  instruction.value = event.target.value
  if (event.target.value.trim()) pauseSemiAuto()
}

function toggleSemiAuto() {
  if (semiAutoEnabled.value) {
    pauseSemiAuto()
    return
  }
  semiAutoEnabled.value = true
  // spec §6.4：硬上限三拍含启用时在飞的那一拍；空闲启用则三拍从下一拍起算。
  semiAutoInflightCounted = props.busy
  semiAutoRemaining.value = props.busy ? SEMI_AUTO_MAX_BEATS - 1 : SEMI_AUTO_MAX_BEATS
}

// spec §6.4：每一拍都先过暂停策略（硬上限三拍 + 用户输入/失败/环境信号），
// 每一拍本身仍是完整回合事务（emit submit → 页面 kernel → unit → 观察器一次）。
function maybeRunSemiAutoBeat() {
  if (!semiAutoEnabled.value || semiAutoRemaining.value <= 0) return
  const verdict = shouldPauseSemiAutoBeat({
    appliedBeats: SEMI_AUTO_MAX_BEATS - semiAutoRemaining.value,
    userTyped: Boolean(instruction.value.trim()),
    busy: props.busy,
    failureReason: failureMessage.value ? 'provider-failure' : '',
    environmentReason: props.semiAutoPauseReason
  })
  if (verdict.pause) {
    pauseSemiAuto()
    return
  }
  submitTurn({ silent: true })
}

function selectKind(value) {
  kind.value = value
  statusMessage.value = ''
}

function onTypeKeydown(event) {
  const index = KINDS.findIndex((item) => item.value === kind.value)
  let next = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(KINDS.length - 1, index + 1)
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1)
  if (next === null) return
  event.preventDefault()
  selectKind(KINDS[next].value)
  event.currentTarget?.querySelector?.(`[data-kind="${KINDS[next].value}"]`)?.focus?.()
}

function submitTurn({ silent = false } = {}) {
  if (props.busy) return
  const result = buildAuthoringTurnIntent({
    kind: kind.value,
    actorId: props.actor?.id || '',
    targetId: props.target?.id || '',
    viewpointCharacterId: props.viewpoint?.id || '',
    instruction: instruction.value,
    directorNote: directorNote.value,
    sourceRefs: props.sourceRefs
  })
  if (!result.ok) {
    statusMessage.value = reasonText(result.reason)
    return
  }
  statusMessage.value = ''
  const payload = {
    kind: result.turn.kind,
    actorId: result.turn.actorId,
    targetId: result.turn.targetId,
    instruction: result.turn.instruction,
    directorNote: result.turn.directorNote,
    sourceRefs: [...result.turn.sourceRefs]
  }
  if (!silent) {
    lastAttempt = payload
    hasLastAttempt.value = true
  }
  emit('submit', payload)
}

// 失败重试：原样重发上一次 attempt，草稿与角色选择保持不变。
function retryLastAttempt() {
  if (!lastAttempt || props.busy) return
  emit('submit', { ...lastAttempt })
}

// 手动停止（spec §6.4）：停止生成的同时取消剩余半自动拍数。
function onPrimaryClick() {
  if (props.busy) {
    pauseSemiAuto()
    emit('stop')
    return
  }
  submitTurn()
}

function reasonText(reason) {
  if (reason === 'dialogue-requires-speaker-and-target') return '对话需要说话人与对象'
  if (reason === 'thought-requires-known-viewpoint') return '心理需要已知视角人物'
  if (reason === 'turn-kind-unknown') return '未知的下一拍类型'
  return '这一拍无法提交，请检查输入'
}

// spec §8：候选动作统一上抛，页面负责填入/推进/纲要/忽略的真实落点。
function emitCandidateAction(list, action, item) {
  emit('candidate-action', { list, action, id: item?.id || '' })
}

// 左栏“以此推进”（spec §5.3）：把事件填入输入区并聚焦，等用户确认后才生成。
function applyAdvanceContext({ kind: nextKind = 'scene', instruction: nextInstruction = '' } = {}) {
  if (nextKind) kind.value = nextKind
  instruction.value = String(nextInstruction || '')
  statusMessage.value = ''
  moreOpen.value = false
  nextTick(() => {
    textareaRef.value?.focus?.()
  })
}

const textareaRef = ref(null)

// —— Task 9：行动者/对象选择收进 Composer ——
// 对话需要说话人+对象且都在投影现场中；行动/场景的行动者可选。
const castPicker = ref('')

function toggleCastPicker(which) {
  castPicker.value = castPicker.value === which ? '' : which
}

function pickPerson(which, person) {
  if (!person?.id) return
  emit(which === 'actor' ? 'select-actor' : 'select-target', person.id)
  castPicker.value = ''
}

function pickerPeople() {
  return (props.people || []).filter((person) => person?.id || person?.name)
}

// Zen 行为（Task 9 Step 6）：.wall.is-zen 时续写坞收成一行“下一拍”，
// 聚焦展开；Escape 先关候选/披露，再收起续写坞，最后交给页面既有 Zen 处理。
const dockExpanded = ref(false)
const isCollapsed = computed(() => props.zenMode && !dockExpanded.value)

function expandDock() {
  dockExpanded.value = true
  nextTick(() => textareaRef.value?.focus?.())
}

function onDockKeydown(event) {
  if (event.key !== 'Escape') return
  // Escape 分层（Task 9 Step 6）：候选/披露 → 收起续写坞 → 放行给页面 Zen 处理。
  if (castPicker.value) {
    castPicker.value = ''
    event.stopPropagation()
    return
  }
  if (moreOpen.value) {
    moreOpen.value = false
    event.stopPropagation()
    return
  }
  if (props.directionCandidates?.length || props.dialogueCandidates?.length) {
    emit('candidate-action', {
      list: props.directionCandidates?.length ? 'direction' : 'dialogue',
      action: 'dismiss-all',
      id: ''
    })
    event.stopPropagation()
    return
  }
  if (props.zenMode && dockExpanded.value) {
    dockExpanded.value = false
    event.stopPropagation()
  }
}

// 页面级请求守卫（spec §8.1/§8.2）需要读取 composer 现场：
// 当前类型（对话说法只在对话模式）与输入框草稿（方向候选只允许空输入）。
function getComposerState() {
  return { kind: kind.value, instruction: instruction.value }
}

defineExpose({ applyAdvanceContext, getComposerState })
</script>

<template>
  <!-- Task 9：编辑器连续的续写坞。Zen 下收成一行“下一拍”，聚焦展开。 -->
  <section
    v-if="!isCollapsed"
    class="turn-composer"
    aria-label="下一拍"
    data-test="turn-dock"
    @keydown="onDockKeydown"
  >
    <div class="turn-composer__row">
      <div class="turn-composer__types" role="radiogroup" aria-label="下一拍类型" @keydown="onTypeKeydown">
        <button
          v-for="item in KINDS"
          :key="item.value"
          type="button"
          role="radio"
          :data-kind="item.value"
          class="turn-composer__kind turn-composer__kind--underline"
          :class="{ 'is-active': kind === item.value }"
          :aria-checked="(kind === item.value).toString()"
          :tabindex="kind === item.value ? 0 : -1"
          @click="selectKind(item.value)"
        >{{ item.label }}</button>
      </div>

      <!-- 行动者/对象选择（Task 9 从左栏移入 Composer）：文字按钮 + 就地列表，无浮层。 -->
      <span class="turn-composer__cast">
        <button
          type="button"
          class="turn-composer__cast-btn"
          data-test="select-actor"
          :aria-expanded="(castPicker === 'actor').toString()"
          @click="toggleCastPicker('actor')"
        >行动者 {{ actor?.name || actor?.id || '未选' }}</button>
        <span class="turn-composer__cast-arrow" aria-hidden="true">→</span>
        <button
          type="button"
          class="turn-composer__cast-btn"
          data-test="select-target"
          :aria-expanded="(castPicker === 'target').toString()"
          @click="toggleCastPicker('target')"
        >对象 {{ target?.name || target?.id || '未选' }}</button>
      </span>

      <button type="button" class="turn-composer__more-btn" :aria-expanded="moreOpen.toString()" @click="moreOpen = !moreOpen">更多</button>
    </div>

    <ul v-if="castPicker" class="turn-composer__cast-list" role="listbox" :aria-label="castPicker === 'actor' ? '选择行动者' : '选择对象'">
      <li v-if="!pickerPeople().length" class="scene-rail__empty turn-composer__cast-empty">当前场没有人物</li>
      <li v-for="person in pickerPeople()" :key="person.id || person.name">
        <button
          type="button"
          role="option"
          :aria-selected="((castPicker === 'actor' ? actor?.id : target?.id) === person.id).toString()"
          :data-id="person.id"
          @click="pickPerson(castPicker, person)"
        >{{ person.name || person.id }}</button>
      </li>
    </ul>

    <!-- spec §8.1：下一步方向候选短列表，位于输入区上方。 -->
    <div
      v-if="directionCandidates.length"
      class="turn-composer__candidates"
      role="list"
      aria-label="下一步方向候选"
      data-test="direction-candidates"
    >
      <div v-for="item in directionCandidates" :key="item.id" role="listitem" class="turn-composer__candidate">
        <span class="turn-composer__candidate-text">{{ item.content }}</span>
        <span class="turn-composer__candidate-actions">
          <button type="button" data-action="fill" @click="emitCandidateAction('direction', 'fill', item)">填入输入框</button>
          <button type="button" data-action="advance" @click="emitCandidateAction('direction', 'advance', item)">按此推进</button>
          <button type="button" data-action="outline" @click="emitCandidateAction('direction', 'outline', item)">加入章节纲要</button>
          <button type="button" data-action="dismiss" @click="emitCandidateAction('direction', 'dismiss', item)">忽略</button>
        </span>
      </div>
    </div>

    <!-- spec §8.2：对话说法候选只在对话模式出现，仅填入不推进。 -->
    <div
      v-if="dialogueCandidates.length"
      class="turn-composer__candidates"
      role="list"
      aria-label="对话说法候选"
      data-test="dialogue-candidates"
    >
      <div v-for="item in dialogueCandidates" :key="item.id" role="listitem" class="turn-composer__candidate">
        <span class="turn-composer__candidate-text">{{ item.content }}</span>
        <span class="turn-composer__candidate-actions">
          <button type="button" data-action="fill" @click="emitCandidateAction('dialogue', 'fill', item)">填入输入框</button>
          <button type="button" data-action="dismiss" @click="emitCandidateAction('dialogue', 'dismiss', item)">忽略</button>
        </span>
      </div>
    </div>

    <div class="turn-composer__row turn-composer__row--input">
      <textarea
        ref="textareaRef"
        v-model="instruction"
        class="turn-composer__input"
        rows="1"
        placeholder="留空则继续下一拍；输入文字按此推进"
        @input="onInstructionInput"
      ></textarea>
      <button
        type="button"
        class="turn-composer__primary"
        data-test="turn-primary"
        @click="onPrimaryClick"
      >{{ primaryLabel }}</button>
    </div>

    <p v-if="failure" class="turn-composer__status is-error" role="alert">
      {{ failure.message }}
      <button v-if="failure.retryable" type="button" class="turn-composer__retry" data-test="turn-retry" @click="retryLastAttempt">重试</button>
      <button v-if="failure.phase === 'persist'" type="button" class="turn-composer__retry" data-test="turn-retry-save" @click="emit('retry-save')">再次保存</button>
    </p>
    <p v-else-if="statusText" class="turn-composer__status" role="status" aria-live="polite">{{ statusText }}</p>

    <div v-if="moreOpen" class="turn-composer__more-panel">
      <label class="turn-composer__note">
        <span>导演注</span>
        <input
          v-model="directorNote"
          class="turn-composer__note-input"
          type="text"
          placeholder="只对本轮生效的一次性指示"
          @input="pauseSemiAuto"
        />
      </label>
      <button
        type="button"
        class="turn-composer__semi"
        :aria-pressed="semiAutoEnabled.toString()"
        data-test="turn-semi-auto"
        @click="toggleSemiAuto"
      >
        <span>半自动</span>
        <span class="turn-composer__semi-count">剩余 {{ semiAutoRemaining }} 拍</span>
      </button>
      <div class="turn-composer__aux">
        <button type="button" class="turn-composer__aux-btn" @click="emit('request-reference-summary')">参考摘要</button>
        <button type="button" class="turn-composer__aux-btn" @click="emit('request-next-directions')">下一步方向</button>
        <button type="button" class="turn-composer__aux-btn" @click="emit('request-dialogue-options')">对话说法</button>
      </div>
    </div>
  </section>

  <!-- Zen 收起态：一行安静的“下一拍”，聚焦展开。 -->
  <div v-else class="turn-composer turn-composer--collapsed">
    <button type="button" class="turn-composer__zen-line" data-test="turn-dock-collapsed" @click="expandDock">下一拍</button>
  </div>
</template>

<style scoped>
/* 与左栏/命令条同一套低干扰文字层级：下划线选中态、短色条、无胶囊。 */
.turn-composer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 6px;
  padding: 4px 2px;
  border-top: 1px solid var(--archive-line, rgba(0, 0, 0, 0.18));
  font-size: 13px;
}
.turn-composer__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.turn-composer__types {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}
.turn-composer__kind {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  padding: 1px 1px;
  cursor: pointer;
}
.turn-composer__kind--underline.is-active {
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--archive-olive, #6b7f3f);
}
.turn-composer__kind:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__cast {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  opacity: 0.75;
}
.turn-composer__more-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
  margin-left: auto;
  padding: 1px 3px;
  font-size: 12px;
  flex-shrink: 0;
}
.turn-composer__more-btn:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__row--input {
  align-items: stretch;
}
.turn-composer__candidates {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px 0;
  border-top: 1px dashed var(--archive-line, rgba(0, 0, 0, 0.14));
}
.turn-composer__candidate {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.turn-composer__candidate-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.turn-composer__candidate-actions {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}
.turn-composer__candidate-actions button {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 1px 2px;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.turn-composer__candidate-actions button:hover {
  color: var(--archive-olive);
}
.turn-composer__candidate-actions button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__input {
  flex: 1;
  min-width: 0;
  resize: none;
  border: none;
  border-bottom: 1px dashed var(--archive-line, rgba(0, 0, 0, 0.18));
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.5;
  padding: 2px 0;
}
.turn-composer__input:focus-visible {
  outline: none;
  border-bottom-color: var(--control-focus, currentColor);
}
.turn-composer__primary {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 3px 8px;
  border-left: 3px solid var(--archive-olive, #6b7f3f);
  flex-shrink: 0;
}
.turn-composer__primary:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__status,
.turn-composer__failure {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}
.turn-composer__retry {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
  margin-left: 6px;
  padding: 0;
}
.turn-composer__retry:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__more-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed var(--archive-line, rgba(0, 0, 0, 0.14));
}
.turn-composer__note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.turn-composer__note-input {
  flex: 1;
  min-width: 0;
  border: none;
  border-bottom: 1px dashed var(--archive-line, rgba(0, 0, 0, 0.18));
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 2px 0;
}
.turn-composer__note-input:focus-visible {
  outline: none;
  border-bottom-color: var(--control-focus, currentColor);
}
.turn-composer__semi {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 1px 2px;
}
.turn-composer__semi[aria-pressed='true'] {
  color: inherit;
  font-weight: 700;
}
.turn-composer__semi:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__semi-count {
  font-size: 11px;
  opacity: 0.75;
}
.turn-composer__aux {
  display: inline-flex;
  gap: 8px;
}
.turn-composer__aux-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 2px;
}
.turn-composer__aux-btn:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
@media (max-width: 760px) {
  .turn-composer__row {
    flex-wrap: wrap;
  }
  /* 移动端：候选动作直接可点（不依赖悬停）。 */
  .turn-composer__candidate-actions {
    display: inline-flex;
  }
}

/* —— Task 9：续写坞补充样式 —— */
.turn-composer__cast-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 1px 2px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.turn-composer__cast-btn:hover {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.turn-composer__cast-btn:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__cast-arrow {
  color: var(--text-secondary);
  opacity: 0.7;
}
.turn-composer__cast-list {
  list-style: none;
  margin: 0;
  padding: 2px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  border-top: 1px dashed var(--archive-line, rgba(0, 0, 0, 0.14));
}
.turn-composer__cast-list button {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 1px 2px;
  cursor: pointer;
}
.turn-composer__cast-list button:hover,
.turn-composer__cast-list button[aria-selected='true'] {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.turn-composer__cast-list button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.turn-composer__cast-empty {
  color: var(--text-secondary);
  font-size: 11px;
}

/* Zen 收起态：一行安静的“下一拍”。 */
.turn-composer--collapsed {
  padding: 4px 2px;
  border-top: 1px solid var(--archive-line, rgba(0, 0, 0, 0.18));
}
.turn-composer__zen-line {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  padding: 2px 0;
  cursor: pointer;
}
.turn-composer__zen-line:hover,
.turn-composer__zen-line:focus-visible {
  color: inherit;
  outline: none;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* 桌面端候选行动作：行悬停/聚焦内出现；移动端常显（上方媒体查询覆盖）。 */
@media (min-width: 761px) {
  .turn-composer__candidate-actions {
    visibility: hidden;
  }
  .turn-composer__candidate:hover .turn-composer__candidate-actions,
  .turn-composer__candidate:focus-within .turn-composer__candidate-actions {
    visibility: visible;
  }
}
</style>
