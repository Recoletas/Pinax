<template>
  <section class="authoring-knowledge" aria-label="作品资料助手">
    <header class="authoring-knowledge__context">
      <span class="authoring-knowledge__status" aria-hidden="true"></span>
      <div><small>当前作品</small><strong>{{ projectTitle || '未命名作品' }}</strong></div>
      <button v-if="messages.length" type="button" class="authoring-knowledge__clear" @click="$emit('clear')">清空</button>
    </header>

    <div ref="threadRef" class="authoring-knowledge__thread" aria-live="polite">
      <div v-if="!messages.length" class="authoring-knowledge__welcome">
        <span>作品资料</span>
        <h3>从全书里找答案</h3>
        <p>问人物、地点、前情、伏笔或设定，回答会附上可回看的原文。</p>
        <div class="authoring-knowledge__tasks" aria-label="助手快捷任务">
          <button v-for="task in primaryTasks" :key="task.id" type="button"
            :class="{ active: selectedIntent === task.id }" @click="chooseTask(task)">{{ task.label }}</button>
        </div>
        <button type="button" class="authoring-knowledge__whole-book"
          :class="{ active: selectedIntent === 'whole-book' }" @click="chooseTask(wholeBookTask)">
          <span>问全书</span><small>跨章节查人物与前情</small><span aria-hidden="true">→</span>
        </button>
      </div>

      <template v-for="message in messages" :key="message.id">
        <div v-if="message.role === 'user'" class="authoring-knowledge__question">
          <small>{{ intentLabel(message.intent) }}</small>
          <p>{{ message.question }}</p>
        </div>
        <article v-else-if="message.answer" class="authoring-knowledge__answer">
          <div class="authoring-knowledge__answer-meta">
            <span :class="message.answer.answerKind === 'free-advice' ? 'is-free' : 'is-grounded'">
              {{ message.answer.answerKind === 'free-advice' ? '自由建议' : '依据作品资料' }}
            </span>
            <time>{{ formatTime(message.answer.createdAt) }}</time>
          </div>
          <p v-if="message.answer.stale" class="authoring-knowledge__stale" role="status">
            资料已更新，这份回答保留供回看；请重新查询后再据此继续创作。
          </p>
          <p class="authoring-knowledge__answer-text">{{ message.answer.answer }}</p>

          <section v-if="message.answer.calculations.length" class="authoring-knowledge__calculations" aria-label="计算过程">
            <div v-for="calculation in message.answer.calculations" :key="calculation.label">
              <strong>{{ calculation.label }}</strong>
              <p>{{ calculation.inputs.map(formatCalculationInput).join('；') }}</p>
              <code>{{ calculation.expression }} = {{ formatCalculationResult(calculation) }}</code>
            </div>
          </section>

          <ul v-if="message.answer.missingInformation.length" class="authoring-knowledge__missing">
            <li v-for="item in message.answer.missingInformation" :key="item">{{ item }}</li>
          </ul>

          <details v-if="message.answer.evidence.length" class="authoring-knowledge__evidence">
            <summary>查看依据 <span>{{ message.answer.evidence.length }}</span></summary>
            <div class="authoring-knowledge__evidence-list">
              <button v-for="evidence in message.answer.evidence" :key="evidence.sourceRef" type="button"
                :class="{ 'is-stale': staleSource(message.answer, evidence.sourceRef) }"
                @click="$emit('open-evidence', evidence)">
                <span><strong>{{ evidence.label }}</strong><small>{{ authorityLabel(evidence.authority) }}</small></span>
                <span class="authoring-knowledge__evidence-excerpt">{{ evidence.excerpt }}</span>
                <span class="authoring-knowledge__evidence-open">回到原文 <span aria-hidden="true">→</span></span>
              </button>
            </div>
          </details>
        </article>
      </template>

      <div v-if="busy" class="authoring-knowledge__thinking" role="status">
        <span aria-hidden="true"></span>正在核对项目资料…
      </div>
      <button v-if="notice?.text" type="button" class="authoring-knowledge__notice" @click="$emit('review-notice')">
        <span>{{ notice.text }}</span><small v-if="notice.reviewable">查看</small>
      </button>
      <div v-if="error" class="authoring-knowledge__error" role="alert">
        <span>{{ error }}</span><button type="button" @click="$emit('retry')">重试</button>
      </div>
    </div>

    <footer class="authoring-knowledge__composer">
      <div class="authoring-knowledge__mode-row">
        <span>{{ intentLabel(selectedIntent) }}</span>
        <button type="button" :class="{ active: selectedIntent === 'free' }" @click="chooseTask(freeTask)">自由问</button>
      </div>
      <div class="authoring-knowledge__input-row">
        <textarea :value="draft" rows="2" :placeholder="placeholder" aria-label="向助手提问"
          @input="$emit('update:draft', $event.target.value)" @compositionstart="composing = true"
          @compositionend="composing = false" @keydown.enter="submitOnEnter"></textarea>
        <button v-if="busy" type="button" class="authoring-knowledge__send is-cancel" aria-label="停止查询" @click="$emit('cancel')">■</button>
        <button v-else type="button" class="authoring-knowledge__send" aria-label="发送问题" :disabled="!draft.trim()" @click="submit">↑</button>
      </div>
      <small>项目问答会附依据；自由建议不会冒充作品事实。</small>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  projectTitle: { type: String, default: '' },
  messages: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  selectedIntent: { type: String, default: 'whole-book' },
  busy: Boolean,
  error: { type: String, default: '' },
  notice: { type: Object, default: null }
})
const emit = defineEmits(['update:draft', 'select-intent', 'ask', 'cancel', 'retry', 'clear', 'open-evidence', 'review-notice'])

const primaryTasks = Object.freeze([
  { id: 'setting', label: '查设定', placeholder: '要核对哪条人物、地点或规则设定？' },
  { id: 'foreshadowing', label: '找伏笔', placeholder: '要找哪条伏笔，或想检查哪些伏笔尚未兑现？' },
  { id: 'clues', label: '理线索', placeholder: '要梳理哪条线索的出现顺序和已有事实？' },
  { id: 'character', label: '挖角色', placeholder: '想看哪位角色的设定、行为与当前状态？' },
  { id: 'calculation', label: '算数值', placeholder: '要根据作品中的哪些数字进行计算？' }
])
const wholeBookTask = Object.freeze({ id: 'whole-book', label: '问全书', placeholder: '问人物、地点、前情、伏笔或设定…' })
const freeTask = Object.freeze({ id: 'free', label: '自由问', placeholder: '聊写法、思路或产品使用；这类回答不会冒充作品事实…' })
const allTasks = Object.freeze([...primaryTasks, wholeBookTask, freeTask])
const threadRef = ref(null)
const composing = ref(false)
const placeholder = computed(() => allTasks.find((task) => task.id === props.selectedIntent)?.placeholder || wholeBookTask.placeholder)

function intentLabel(intent) {
  return allTasks.find((task) => task.id === intent)?.label || '问全书'
}

function authorityLabel(authority) {
  return ({ manuscript: '正文', worldbook: '世界设定', outline: '大纲意图', history: '历史', scene: '当前场', memory: '相关记忆', suggestion: '速记' })[authority] || '项目资料'
}

function formatTime(value) {
  const date = new Date(Number(value) || Date.now())
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function staleSource(answer, sourceRef) {
  return (answer?.staleSources || []).some((item) => item.sourceRef === sourceRef)
}

function formatCalculationInput(item = {}) {
  return `${item.label || '输入'} ${item.value ?? ''}${item.unit || ''}`.trim()
}

function formatCalculationResult(calculation = {}) {
  return `${calculation.result ?? ''}${calculation.unit || ''}`
}

function chooseTask(task) {
  emit('select-intent', task.id)
  nextTick(() => document.querySelector('.authoring-knowledge__composer textarea')?.focus({ preventScroll: true }))
}

function submit() {
  const question = props.draft.trim()
  if (!question || props.busy) return
  emit('ask', { intent: props.selectedIntent, question })
}

function submitOnEnter(event) {
  if (event.shiftKey || event.isComposing || composing.value) return
  event.preventDefault()
  submit()
}

watch(() => [props.messages.length, props.busy], () => nextTick(() => {
  if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
}))
</script>

<style scoped>
.authoring-knowledge { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 100%; height: 100%; color: var(--text-primary); background: var(--surface-primary); }
.authoring-knowledge__context { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); }
.authoring-knowledge__context div { display: grid; min-width: 0; gap: 1px; }
.authoring-knowledge__context small { color: var(--text-tertiary, var(--text-secondary)); font-size: 10px; }
.authoring-knowledge__context strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__status { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: color-mix(in srgb, var(--accent-primary) 72%, #5c8 28%); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 10%, transparent); }
.authoring-knowledge__clear { margin-inline-start: auto; padding: 6px; border: 0; background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer; }
.authoring-knowledge__thread { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 14px 22px; }
.authoring-knowledge__welcome { max-width: 300px; margin: 8px auto 0; }
.authoring-knowledge__welcome > span { color: var(--accent-primary); font-size: 11px; letter-spacing: .08em; }
.authoring-knowledge__welcome h3 { margin: 7px 0 5px; font-family: var(--font-serif, serif); font-size: 20px; font-weight: 650; }
.authoring-knowledge__welcome p { margin: 0 0 18px; color: var(--text-secondary); font-size: 12px; line-height: 1.65; }
.authoring-knowledge__tasks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.authoring-knowledge__tasks button, .authoring-knowledge__whole-book { border: 1px solid var(--border-subtle); border-radius: 8px; background: color-mix(in srgb, var(--surface-secondary) 72%, transparent); color: var(--text-secondary); cursor: pointer; }
.authoring-knowledge__tasks button { min-height: 36px; padding: 7px 4px; font-size: 11px; }
.authoring-knowledge__tasks button:hover, .authoring-knowledge__tasks button.active, .authoring-knowledge__whole-book:hover, .authoring-knowledge__whole-book.active { border-color: color-mix(in srgb, var(--accent-primary) 38%, var(--border-subtle)); background: color-mix(in srgb, var(--accent-primary) 8%, var(--surface-primary)); color: var(--text-primary); }
.authoring-knowledge__whole-book { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 9px; padding: 8px 10px; text-align: start; }
.authoring-knowledge__whole-book small { color: var(--text-tertiary, var(--text-secondary)); font-size: 10px; }
.authoring-knowledge__question { width: fit-content; max-width: 88%; margin: 0 0 14px auto; padding: 8px 10px; border-radius: 10px 10px 3px 10px; background: color-mix(in srgb, var(--accent-primary) 10%, var(--surface-secondary)); }
.authoring-knowledge__question small { color: var(--accent-primary); font-size: 9px; }
.authoring-knowledge__question p { margin: 2px 0 0; font-size: 12px; line-height: 1.55; }
.authoring-knowledge__answer { margin: 0 0 22px; }
.authoring-knowledge__answer-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--text-tertiary, var(--text-secondary)); font-size: 9px; }
.authoring-knowledge__answer-meta > span { padding: 2px 6px; border-radius: 999px; }
.authoring-knowledge__answer-meta .is-grounded { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); color: var(--accent-primary); }
.authoring-knowledge__answer-meta .is-free { background: color-mix(in srgb, var(--text-secondary) 10%, transparent); }
.authoring-knowledge__answer-text { margin: 0; white-space: pre-wrap; font-size: 12px; line-height: 1.75; }
.authoring-knowledge__stale { margin: 0 0 9px; padding: 7px 9px; border-inline-start: 2px solid #c38b2f; background: color-mix(in srgb, #c38b2f 9%, transparent); color: color-mix(in srgb, var(--text-primary) 78%, #9a6a18); font-size: 10px; line-height: 1.5; }
.authoring-knowledge__missing { margin: 10px 0 0; padding: 8px 10px 8px 25px; background: color-mix(in srgb, var(--surface-secondary) 66%, transparent); color: var(--text-secondary); font-size: 10px; line-height: 1.55; }
.authoring-knowledge__calculations { display: grid; gap: 7px; margin-top: 11px; }
.authoring-knowledge__calculations > div { padding: 8px 9px; border: 1px solid var(--border-subtle); border-radius: 7px; }
.authoring-knowledge__calculations strong, .authoring-knowledge__calculations p, .authoring-knowledge__calculations code { display: block; margin: 0 0 4px; font-size: 10px; }
.authoring-knowledge__calculations code { margin: 0; color: var(--accent-primary); white-space: normal; }
.authoring-knowledge__evidence { margin-top: 12px; border-top: 1px solid var(--border-subtle); }
.authoring-knowledge__evidence summary { padding: 10px 2px 5px; color: var(--text-secondary); font-size: 10px; cursor: pointer; list-style: none; }
.authoring-knowledge__evidence summary::-webkit-details-marker { display: none; }
.authoring-knowledge__evidence summary::before { display: inline-block; margin-inline-end: 5px; content: '›'; transition: transform 120ms ease; }
.authoring-knowledge__evidence[open] summary::before { transform: rotate(90deg); }
.authoring-knowledge__evidence summary span { margin-inline-start: 4px; color: var(--text-tertiary, var(--text-secondary)); }
.authoring-knowledge__evidence-list { display: grid; gap: 5px; }
.authoring-knowledge__evidence-list > button { display: grid; gap: 5px; width: 100%; padding: 9px; border: 1px solid var(--border-subtle); border-radius: 7px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.authoring-knowledge__evidence-list > button:hover { border-color: color-mix(in srgb, var(--accent-primary) 34%, var(--border-subtle)); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
.authoring-knowledge__evidence-list > button.is-stale { opacity: .66; }
.authoring-knowledge__evidence-list > button > span:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.authoring-knowledge__evidence-list strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__evidence-list small { flex: 0 0 auto; color: var(--text-tertiary, var(--text-secondary)); font-size: 9px; }
.authoring-knowledge__evidence-excerpt { display: -webkit-box; overflow: hidden; color: var(--text-secondary); font-size: 10px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.authoring-knowledge__evidence-open { color: var(--accent-primary); font-size: 9px; }
.authoring-knowledge__thinking { display: flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 10px; }
.authoring-knowledge__thinking span { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); animation: knowledge-pulse 900ms ease-in-out infinite alternate; }
.authoring-knowledge__notice { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 10px; padding: 8px 9px; border: 1px solid color-mix(in srgb, #c38b2f 24%, var(--border-subtle)); border-radius: 7px; background: color-mix(in srgb, #c38b2f 7%, transparent); color: var(--text-secondary); font-size: 10px; text-align: start; cursor: pointer; }
.authoring-knowledge__notice small { color: var(--accent-primary); }
.authoring-knowledge__error { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; padding: 8px; border-radius: 7px; background: color-mix(in srgb, #b54b43 9%, transparent); color: var(--text-secondary); font-size: 10px; }
.authoring-knowledge__error button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; }
.authoring-knowledge__composer { position: relative; z-index: 1; padding: 9px 12px 11px; border-top: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--surface-primary) 96%, transparent); }
.authoring-knowledge__mode-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; color: var(--text-secondary); font-size: 9px; }
.authoring-knowledge__mode-row > span { color: var(--accent-primary); }
.authoring-knowledge__mode-row button { margin-inline-start: auto; padding: 3px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--text-secondary); font-size: 9px; cursor: pointer; }
.authoring-knowledge__mode-row button.active { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); color: var(--accent-primary); }
.authoring-knowledge__input-row { display: grid; grid-template-columns: 1fr 32px; align-items: end; gap: 7px; padding: 7px; border: 1px solid var(--border-subtle); border-radius: 9px; background: var(--surface-secondary); }
.authoring-knowledge__input-row:focus-within { border-color: color-mix(in srgb, var(--accent-primary) 48%, var(--border-subtle)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 8%, transparent); }
.authoring-knowledge__input-row textarea { box-sizing: border-box; min-height: 36px; max-height: 104px; resize: none; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 11px; line-height: 1.55; }
.authoring-knowledge__send { width: 30px; height: 30px; border: 0; border-radius: 7px; background: var(--accent-primary); color: var(--surface-primary); cursor: pointer; }
.authoring-knowledge__send:disabled { opacity: .38; cursor: default; }
.authoring-knowledge__send.is-cancel { background: color-mix(in srgb, var(--text-primary) 78%, transparent); font-size: 9px; }
.authoring-knowledge__composer > small { display: block; margin-top: 5px; color: var(--text-tertiary, var(--text-secondary)); font-size: 8px; line-height: 1.4; }
@keyframes knowledge-pulse { to { opacity: .28; transform: scale(.72); } }
@media (pointer: coarse) {
  .authoring-knowledge__tasks button, .authoring-knowledge__whole-book, .authoring-knowledge__evidence-list > button, .authoring-knowledge__clear, .authoring-knowledge__mode-row button, .authoring-knowledge__send { min-height: 44px; }
}
@media (max-width: 720px) {
  .authoring-knowledge__tasks button, .authoring-knowledge__whole-book, .authoring-knowledge__evidence-list > button, .authoring-knowledge__clear, .authoring-knowledge__mode-row button, .authoring-knowledge__send { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .authoring-knowledge__thinking span { animation: none; }
  .authoring-knowledge__evidence summary::before { transition: none; }
}
</style>
