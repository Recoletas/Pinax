<template>
  <section class="authoring-knowledge" aria-label="作品资料助手">
    <header class="authoring-knowledge__toolbar">
      <div class="authoring-knowledge__model">
        <strong>{{ projectTitle || '未命名作品' }}</strong>
        <small>基于本书资料回答</small>
      </div>
      <div class="authoring-knowledge__toolbar-actions">
        <button type="button" class="control-icon" :class="{ active: searchOpen }" :aria-pressed="searchOpen" aria-label="搜索当前问答" title="搜索当前问答" @click="toggleSearch">
          <WorkbenchIcon name="search" :size="18" />
        </button>
        <button type="button" class="control-icon" :class="{ active: historyOpen }" :aria-pressed="historyOpen" aria-label="查看问答历史" title="查看问答历史" @click="historyOpen = !historyOpen">
          <WorkbenchIcon name="undo-extension" :size="18" />
        </button>
      </div>
    </header>

    <div v-if="searchOpen" class="authoring-knowledge__search">
      <WorkbenchIcon name="search" :size="15" />
      <input ref="searchInputRef" v-model="searchTerm" type="search" placeholder="搜索问题或回答" aria-label="搜索问题或回答" />
      <button type="button" aria-label="关闭搜索" @click="closeSearch">×</button>
    </div>

    <div v-if="historyOpen" class="authoring-knowledge__history" aria-label="当前问答历史">
      <div><strong>当前会话</strong><button v-if="messages.length" type="button" @click="$emit('clear')">清空</button></div>
      <button v-for="question in historyQuestions" :key="question.id" type="button" @click="reuseQuestion(question.question)">
        {{ question.question }}
      </button>
      <p v-if="!historyQuestions.length">还没有提问记录</p>
    </div>

    <div ref="threadRef" class="authoring-knowledge__thread" aria-live="polite">
      <div v-if="!messages.length" class="authoring-knowledge__welcome">
        <h3>一起梳理这个故事</h3>
        <p>查设定、找伏笔，或讨论下一步。</p>
        <details class="authoring-knowledge__suggestions" aria-label="提问建议">
          <summary>提问示例</summary>
          <button v-for="task in suggestedTasks" :key="task.id" type="button" @click="chooseSuggestion(task)">
            <span>{{ task.suggestion }}</span><span aria-hidden="true">›</span>
          </button>
        </details>
      </div>

      <template v-for="message in visibleMessages" :key="message.id">
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
                @click="onEvidenceClick(evidence)">
                <span><strong>{{ evidence.label }}</strong><small>{{ authorityLabel(evidence.authority) }}</small></span>
                <span class="authoring-knowledge__evidence-excerpt">{{ evidence.excerpt }}</span>
                <span class="authoring-knowledge__evidence-open">回到原文 <span aria-hidden="true">→</span></span>
              </button>
            </div>
          </details>
        </article>
      </template>

      <p v-if="messages.length && !visibleMessages.length" class="authoring-knowledge__no-results">没有找到相关问答</p>

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
      <div class="authoring-knowledge__primary-tools" role="group" aria-label="妙笔工具">
        <button type="button" class="active">问答</button>
        <button type="button" @click="chooseTask(primaryTasks[0])">提取</button>
        <button type="button" @click="$emit('open-illustrator')">生图</button>
      </div>
      <div class="authoring-knowledge__tasks" aria-label="问答范围">
        <select aria-label="问答范围" :value="selectedIntent" @change="chooseTask(allTasks.find(task => task.id === $event.target.value))">
          <option v-for="task in allTasks" :key="task.id" :value="task.id">{{ task.label }}</option>
        </select>
      </div>
      <div class="authoring-knowledge__input-row">
        <textarea :value="draft" rows="2" :placeholder="placeholder" aria-label="向助手提问"
          @input="$emit('update:draft', $event.target.value)" @compositionstart="composing = true"
          @compositionend="composing = false" @keydown.enter="submitOnEnter"></textarea>
        <button v-if="busy" type="button" class="authoring-knowledge__send is-cancel" aria-label="停止查询" @click="$emit('cancel')">■</button>
        <button v-else type="button" class="authoring-knowledge__send" aria-label="发送问题" :disabled="!draft.trim()" @click="submit">↑</button>
      </div>
      <small>项目问答会附原文依据；自由建议不会冒充作品事实。</small>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

import { recordKnowledgeSeamFocus } from '../../composables/useAuthoringKnowledgeAssistant.js'

const props = defineProps({
  projectTitle: { type: String, default: '' },
  messages: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  selectedIntent: { type: String, default: 'whole-book' },
  busy: Boolean,
  error: { type: String, default: '' },
  notice: { type: Object, default: null }
})
const emit = defineEmits(['update:draft', 'select-intent', 'ask', 'cancel', 'retry', 'clear', 'open-evidence', 'review-notice', 'open-illustrator'])
// 点证据既回原文；对 K 可映射的来源（世界设定/历史/相关记忆）同时登记
// 为下一次提问的可信点名来源（受限 I0，默认关）。正文/大纲/现场等不可
// 映射来源不登记——不制造注定失败的接缝请求。
const SEAM_MAPPABLE_AUTHORITIES = ['worldbook', 'history', 'memory']
function onEvidenceClick(evidence) {
  if (evidence && SEAM_MAPPABLE_AUTHORITIES.includes(evidence.authority)) {
    recordKnowledgeSeamFocus(evidence.sourceRef)
  }
  emit('open-evidence', evidence)
}

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
const searchOpen = ref(false)
const historyOpen = ref(false)
const searchTerm = ref('')
const searchInputRef = ref(null)
const suggestedTasks = Object.freeze([
  { ...wholeBookTask, suggestion: '前文埋下的伏笔，哪些还没有兑现？' },
  { ...primaryTasks[3], suggestion: '梳理主要角色已有设定与正文行为。' },
  { ...primaryTasks[2], suggestion: '按出现顺序整理当前线索和已知事实。' }
])
const placeholder = computed(() => allTasks.find((task) => task.id === props.selectedIntent)?.placeholder || wholeBookTask.placeholder)
const historyQuestions = computed(() => props.messages.filter((message) => message.role === 'user' && message.question))
const visibleMessages = computed(() => {
  const query = searchTerm.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return props.messages
  return props.messages.filter((message) => [message.question, message.answer?.answer]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(query)))
})

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

function chooseSuggestion(task) {
  emit('select-intent', task.id)
  emit('update:draft', task.suggestion)
  nextTick(() => document.querySelector('.authoring-knowledge__composer textarea')?.focus({ preventScroll: true }))
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  historyOpen.value = false
  if (searchOpen.value) nextTick(() => searchInputRef.value?.focus())
}

function closeSearch() {
  searchOpen.value = false
  searchTerm.value = ''
}

function reuseQuestion(question) {
  emit('update:draft', question)
  historyOpen.value = false
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
.authoring-knowledge { position: relative; display: flex; min-height: 100%; height: 100%; flex-direction: column; color: var(--text-primary); background: var(--surface-primary); font-size: 14px; }
.authoring-knowledge__toolbar { display: flex; min-height: 50px; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 12px 7px 14px; border-bottom: 1px solid var(--border-subtle); }
.authoring-knowledge__model { display: grid; min-width: 0; gap: 1px; }
.authoring-knowledge__model strong { overflow: hidden; font-size: 14px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__model small { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__toolbar-actions { display: flex; align-items: center; gap: 2px; }
.authoring-knowledge__toolbar-actions button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-knowledge__toolbar-actions button:hover, .authoring-knowledge__toolbar-actions button.active { background: var(--surface-hover); color: var(--text-primary); }
.authoring-knowledge__search { display: grid; min-height: 44px; flex: none; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); }
.authoring-knowledge__search input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; }
.authoring-knowledge__search button { border: 0; background: transparent; color: var(--text-secondary); font-size: 20px; cursor: pointer; }
.authoring-knowledge__history { position: absolute; z-index: 4; inset: 102px 10px auto; max-height: min(360px, 48vh); overflow-y: auto; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-workbench-raised, var(--surface-primary)); box-shadow: var(--shadow-workbench, 0 10px 28px color-mix(in srgb, var(--text-primary) 14%, transparent)); }
.authoring-knowledge__history > div { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.authoring-knowledge__history > div strong { font-size: 13px; }
.authoring-knowledge__history button { width: 100%; padding: 8px 6px; overflow: hidden; border: 0; border-bottom: 1px solid var(--border-subtle); background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; text-align: start; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.authoring-knowledge__history > div button { width: auto; border: 0; color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__history p { margin: 18px 0; color: var(--text-secondary); font-size: 13px; text-align: center; }
.authoring-knowledge__thread { min-height: 0; flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 20px 16px 24px; }
.authoring-knowledge__welcome { max-width: 340px; margin: 28px auto 0; }
.authoring-knowledge__welcome h3 { margin: 0 0 8px; font-size: 19px; font-weight: 600; letter-spacing: -.02em; }
.authoring-knowledge__welcome > p { margin: 0 0 12px; color: var(--text-secondary); font-size: 14px; line-height: 1.7; }
.authoring-knowledge__suggestions { display: grid; gap: 4px; margin-top: 20px; }
.authoring-knowledge__suggestions button { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 2px; border: 0; border-bottom: 1px solid var(--border-subtle); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; line-height: 1.55; text-align: start; cursor: pointer; }
.authoring-knowledge__suggestions button span:last-child { color: var(--text-secondary); font-size: 20px; }
.authoring-knowledge__suggestions button:hover { color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__question { width: fit-content; max-width: 88%; margin: 0 0 18px auto; padding: 9px 11px; border-radius: 8px 8px 2px 8px; background: color-mix(in srgb, var(--accent-primary, var(--accent)) 9%, var(--surface-secondary, var(--bg-secondary))); }
.authoring-knowledge__question small { color: var(--accent-primary, var(--accent)); font-size: 12px; }
.authoring-knowledge__question p { margin: 3px 0 0; font-size: 14px; line-height: 1.7; }
.authoring-knowledge__answer { margin: 0 0 26px; }
.authoring-knowledge__answer-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; color: var(--text-secondary); font-size: 12px; }
.authoring-knowledge__answer-meta > span { padding: 1px 5px; border-radius: 3px; }
.authoring-knowledge__answer-meta .is-grounded { background: color-mix(in srgb, var(--accent-primary, var(--accent)) 9%, transparent); color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__answer-meta .is-free { background: color-mix(in srgb, var(--text-secondary) 9%, transparent); }
.authoring-knowledge__answer-text { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.8; }
.authoring-knowledge__stale { margin: 0 0 10px; padding: 8px 10px; border-inline-start: 2px solid var(--signal-warning); background: color-mix(in srgb, var(--signal-warning) 8%, transparent); color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.authoring-knowledge__missing { margin: 12px 0 0; padding: 9px 10px 9px 28px; background: var(--surface-secondary); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.authoring-knowledge__calculations { display: grid; gap: 8px; margin-top: 12px; }
.authoring-knowledge__calculations > div { padding: 9px 10px; border: 1px solid var(--border-subtle); border-radius: 4px; }
.authoring-knowledge__calculations strong, .authoring-knowledge__calculations p, .authoring-knowledge__calculations code { display: block; margin: 0 0 4px; font-size: 13px; }
.authoring-knowledge__calculations code { margin: 0; color: var(--accent-primary, var(--accent)); white-space: normal; }
.authoring-knowledge__evidence { margin-top: 14px; border-top: 1px solid var(--border-subtle); }
.authoring-knowledge__evidence summary { padding: 11px 2px 6px; color: var(--text-secondary); font-size: 13px; cursor: pointer; list-style: none; }
.authoring-knowledge__evidence summary::-webkit-details-marker { display: none; }
.authoring-knowledge__evidence summary::before { display: inline-block; margin-inline-end: 6px; content: '›'; transition: transform 120ms ease; }
.authoring-knowledge__evidence[open] summary::before { transform: rotate(90deg); }
.authoring-knowledge__evidence summary span { margin-inline-start: 4px; }
.authoring-knowledge__evidence-list { display: grid; gap: 6px; }
.authoring-knowledge__evidence-list > button { display: grid; gap: 6px; width: 100%; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 4px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.authoring-knowledge__evidence-list > button:hover { background: var(--surface-hover); }
.authoring-knowledge__evidence-list > button.is-stale { opacity: .66; }
.authoring-knowledge__evidence-list > button > span:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.authoring-knowledge__evidence-list strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__evidence-list small { flex: 0 0 auto; color: var(--text-secondary); font-size: 12px; }
.authoring-knowledge__evidence-excerpt { display: -webkit-box; overflow: hidden; color: var(--text-secondary); font-size: 13px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.authoring-knowledge__evidence-open { color: var(--accent-primary, var(--accent)); font-size: 12px; }
.authoring-knowledge__thinking { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; }
.authoring-knowledge__thinking span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-primary, var(--accent)); animation: knowledge-pulse 900ms ease-in-out infinite alternate; }
.authoring-knowledge__notice, .authoring-knowledge__error { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 10px; padding: 9px 10px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-secondary); color: var(--text-secondary); font-size: 13px; text-align: start; }
.authoring-knowledge__notice { cursor: pointer; }
.authoring-knowledge__notice small, .authoring-knowledge__error button { border: 0; background: transparent; color: var(--accent-primary, var(--accent)); cursor: pointer; }
.authoring-knowledge__no-results { margin-top: 20vh; color: var(--text-secondary); text-align: center; }
.authoring-knowledge__composer { position: relative; z-index: 1; flex: none; padding: 8px 10px 10px; border-top: 1px solid var(--border-subtle); background: var(--surface-primary); }
.authoring-knowledge__primary-tools { display: flex; align-items: center; gap: 2px; margin-bottom: 5px; }
.authoring-knowledge__primary-tools button { min-height: 30px; padding: 4px 10px; border: 0; border-bottom: 2px solid transparent; border-radius: 4px; background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.authoring-knowledge__primary-tools button:hover, .authoring-knowledge__primary-tools button.active { border-bottom-color: var(--accent-primary, var(--accent)); color: var(--text-primary); }
.authoring-knowledge__tasks { display: flex; gap: 3px; margin-bottom: 6px; overflow-x: auto; scrollbar-width: none; }
.authoring-knowledge__tasks::-webkit-scrollbar { display: none; }
.authoring-knowledge__tasks button { min-height: 28px; flex: 0 0 auto; padding: 3px 7px; border: 0; border-radius: 3px; background: transparent; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.authoring-knowledge__tasks button:hover, .authoring-knowledge__tasks button.active { background: var(--surface-hover); color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__input-row { display: grid; grid-template-columns: 1fr 34px; align-items: end; gap: 7px; padding: 10px; border: 1px solid var(--archive-paper-strong); border-radius: 8px; background: var(--archive-paper); }
.authoring-knowledge__input-row:focus-within { border-color: var(--accent-primary, var(--accent)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary, var(--accent)) 8%, transparent); }
.authoring-knowledge__input-row textarea { box-sizing: border-box; min-height: 44px; max-height: 116px; resize: none; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; line-height: 1.65; }
.authoring-knowledge__send { width: 32px; height: 32px; border: 0; border-radius: 4px; background: var(--accent-primary, var(--accent)); color: var(--accent-text, #fff); cursor: pointer; }
.authoring-knowledge__send:disabled { opacity: .38; cursor: default; }
.authoring-knowledge__send.is-cancel { background: var(--text-secondary); font-size: 11px; }
.authoring-knowledge__composer > small { display: block; margin-top: 6px; color: var(--text-secondary); font-size: 11px; line-height: 1.45; }
@keyframes knowledge-pulse { to { opacity: .28; transform: scale(.72); } }
@media (pointer: coarse) {
  .authoring-knowledge__toolbar-actions button, .authoring-knowledge__suggestions button, .authoring-knowledge__tasks button, .authoring-knowledge__primary-tools button, .authoring-knowledge__evidence-list > button, .authoring-knowledge__send { min-height: 44px; }
}
@media (max-width: 720px) {
  .authoring-knowledge__welcome { margin-top: 5vh; }
  .authoring-knowledge__toolbar-actions button, .authoring-knowledge__suggestions button, .authoring-knowledge__tasks button, .authoring-knowledge__primary-tools button, .authoring-knowledge__evidence-list > button, .authoring-knowledge__send { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .authoring-knowledge__thinking span { animation: none; }
  .authoring-knowledge__evidence summary::before { transition: none; }
}
</style>
