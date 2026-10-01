<template>
  <section class="authoring-knowledge" :aria-label="tr('作品资料助手')">
    <header class="authoring-knowledge__toolbar">
      <div class="authoring-knowledge__model">
        <strong>{{ projectTitle || tr('未命名作品') }}</strong>
        <small>{{ tr('基于本书资料回答') }}</small>
      </div>
      <div class="authoring-knowledge__toolbar-actions">
        <button v-if="agentEnabled" type="button" class="control-icon" :class="{ active: sessionsOpen }" :aria-pressed="sessionsOpen" :aria-label="tr('会话与任务')" :title="tr('会话与任务')" @click="toggleSessions"><span class="authoring-knowledge__sessions-glyph">会话</span></button>
        <button v-if="reviewWorkflow" type="button" :aria-pressed="reviewOpen" :aria-label="tr('目标审稿')" :title="tr('目标审稿')" @click="openReview"><WorkbenchIcon name="guide" :size="18" /></button>
        <button type="button" class="control-icon" :class="{ active: searchOpen }" :aria-pressed="searchOpen" :aria-label="tr('搜索当前问答')" :title="tr('搜索当前问答')" @click="toggleSearch">
          <WorkbenchIcon name="search" :size="18" />
        </button>
        <button type="button" class="control-icon" :class="{ active: historyOpen }" :aria-pressed="historyOpen" :aria-label="tr('查看问答历史')" :title="tr('查看问答历史')" @click="historyOpen = !historyOpen">
          <WorkbenchIcon name="undo-extension" :size="18" />
        </button>
      </div>
    </header>
    <AuthoringGoalReview v-if="reviewOpen" :workflow="reviewWorkflow" @close="reviewOpen = false" />
    <template v-else>
    <div v-if="sessionsOpen" class="authoring-knowledge__sessions" :aria-label="tr('会话与任务')">
      <div><strong>{{ tr('Agent 会话') }}</strong><button type="button" @click="$emit('session-new')">{{ tr('新建') }}</button></div>
      <button v-for="session in agentSessions" :key="session.sessionId" type="button" class="authoring-knowledge__session-row"
        :class="{ 'is-active': session.sessionId === activeAgentSessionId }" @click="$emit('session-switch', session.sessionId)">
        <span class="authoring-knowledge__session-title">{{ session.title }}</span>
        <span class="authoring-knowledge__session-actions" @click.stop>
          <button type="button" :aria-label="tr('重命名会话')" title="重命名" @click="renameSessionInline(session)">✎</button>
          <button type="button" :aria-label="tr('删除会话')" title="删除" @click="$emit('session-delete', session.sessionId)">×</button>
        </span>
      </button>
      <p v-if="!agentSessions.length" class="authoring-knowledge__sessions-empty">{{ tr('暂无会话；发送首条消息即自动建立。') }}</p>
      <div class="authoring-knowledge__sessions-tasks"><strong>{{ tr('适配器任务') }}</strong><button type="button" @click="$emit('refresh-tasks')">{{ tr('刷新') }}</button></div>
      <button v-for="task in agentTasks" :key="task.taskId" type="button" class="authoring-knowledge__session-row" @click="$emit('task-resume', task.taskId)">
        <span class="authoring-knowledge__session-title">{{ task.taskId }}</span>
        <small>{{ task.status }}</small>
      </button>
      <p v-if="!agentTasks.length" class="authoring-knowledge__sessions-empty">{{ tr('（暂无适配器任务）') }}</p>
    </div>
    <div v-if="sessionsOpen && renamingSession" class="authoring-knowledge__rename">
      <input ref="renameInputRef" v-model="renamingTitle" type="text" :aria-label="tr('会话名称')" @keydown.enter="commitRename" @keydown.esc="renamingSession = ''" />
      <button type="button" @click="commitRename">{{ tr('确定') }}</button>
      <button type="button" @click="renamingSession = ''">{{ tr('取消') }}</button>
    </div>
    <div v-if="searchOpen" class="authoring-knowledge__search">
      <WorkbenchIcon name="search" :size="15" />
      <input ref="searchInputRef" v-model="searchTerm" type="search" :placeholder="tr('搜索问题或回答')" :aria-label="tr('搜索问题或回答')" />
      <button type="button" :aria-label="tr('关闭搜索')" @click="closeSearch">×</button>
    </div>

    <div v-if="historyOpen" class="authoring-knowledge__history" :aria-label="tr('当前问答历史')">
      <div><strong>{{ tr('当前会话') }}</strong><button v-if="messages.length" type="button" @click="$emit('clear')">{{ tr('清空') }}</button></div>
      <button v-for="question in historyQuestions" :key="question.id" type="button" @click="reuseQuestion(question.question)">
        {{ question.question }}
      </button>
      <p v-if="!historyQuestions.length">{{ tr('还没有提问记录') }}</p>
    </div>

    <div ref="threadRef" class="authoring-knowledge__thread" aria-live="polite">
      <div v-if="!messages.length" class="authoring-knowledge__welcome">
        <h3>{{ tr('一起梳理这个故事') }}</h3>
        <p>{{ tr('查设定、找伏笔，或讨论下一步。') }}</p>
        <details class="authoring-knowledge__suggestions" :aria-label="tr('提问建议')">
          <summary>{{ tr('提问示例') }}</summary>
          <button v-for="task in suggestedTasks" :key="task.id" type="button" @click="chooseSuggestion(task)">
            <span>{{ tr(task.suggestion) }}</span><span aria-hidden="true">›</span>
          </button>
        </details>
      </div>

      <template v-for="message in visibleMessages" :key="message.id">
        <div v-if="message.role === 'user'" class="authoring-knowledge__question">
          <small>{{ tr(message.kind === 'agent' ? 'StoryAgent' : intentLabel(message.intent)) }}</small>
          <p>{{ message.kind === 'agent' ? message.question : message.question }}</p>
        </div>
        <div v-else-if="message.role === 'system'" class="authoring-knowledge__system-row">{{ message.text }}</div>
        <article v-else-if="message.kind === 'agent'" class="authoring-knowledge__agent">
          <details v-if="message.thinking" class="authoring-knowledge__agent-think" :open="Boolean(message.status)">
            <summary>{{ tr('思维链') }}<span>{{ message.thinking.length }}</span></summary>
            <div class="authoring-knowledge__agent-think-body">{{ message.thinking }}</div>
          </details>
          <p v-if="message.text" class="authoring-knowledge__answer-text">{{ message.text }}</p>
          <ul v-if="message.tools && message.tools.length" class="authoring-knowledge__agent-tools">
            <li v-for="(tool, toolIndex) in message.tools" :key="toolIndex">{{ tool }}</li>
          </ul>
          <p v-if="message.status" class="authoring-knowledge__agent-status" role="status">{{ message.status }}</p>
          <div v-if="message.agentResult" class="authoring-knowledge__agent-meta">
            <span :class="message.agentResult.ok ? 'is-ok' : 'is-fail'">{{ message.agentResult.ok ? '✓' : '✗' }}</span>
            {{ message.agentResult.model }} · {{ message.agentResult.status }} · steps {{ message.agentResult.steps }} · tools {{ message.agentResult.calls }} · tokens {{ message.agentResult.tokens }}
          </div>
        </article>
        <article v-else-if="message.answer" class="authoring-knowledge__answer">
          <div class="authoring-knowledge__answer-meta">
            <span :class="message.answer.answerKind === 'free-advice' ? 'is-free' : 'is-grounded'">
              {{ message.answer.answerKind === 'free-advice' ? tr('自由建议') : tr('依据作品资料') }}
            </span>
            <time>{{ formatTime(message.answer.createdAt) }}</time>
          </div>
          <p v-if="message.answer.stale" class="authoring-knowledge__stale" role="status">
            {{ tr('资料已更新，这份回答保留供回看；请重新查询后再据此继续创作。') }}
          </p>
          <p class="authoring-knowledge__answer-text">{{ message.answer.answer }}</p>

          <section v-if="message.answer.calculations.length" class="authoring-knowledge__calculations" :aria-label="tr('计算过程')">
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
            <summary>{{ tr('查看依据') }}<span>{{ message.answer.evidence.length }}</span></summary>
            <div class="authoring-knowledge__evidence-list">
              <button v-for="evidence in message.answer.evidence" :key="evidence.sourceRef" type="button"
                :class="{ 'is-stale': staleSource(message.answer, evidence.sourceRef) }"
                @click="onEvidenceClick(evidence)">
                <span><strong>{{ evidence.label }}</strong><small>{{ tr(authorityLabel(evidence.authority)) }}</small></span>
                <span class="authoring-knowledge__evidence-excerpt">{{ evidence.excerpt }}</span>
                <span class="authoring-knowledge__evidence-open">{{ tr('回到原文') }}<span aria-hidden="true">→</span></span>
              </button>
            </div>
          </details>
        </article>
      </template>

      <p v-if="messages.length && !visibleMessages.length" class="authoring-knowledge__no-results">{{ tr('没有找到相关问答') }}</p>

      <div v-if="busy" class="authoring-knowledge__thinking" role="status">
        <span aria-hidden="true"></span>正在核对项目资料…
      </div>
      <button v-if="notice?.text" type="button" class="authoring-knowledge__notice" @click="$emit('review-notice')">
        <span>{{ notice.text }}</span><small v-if="notice.reviewable">{{ tr('查看') }}</small>
      </button>
      <div v-if="error" class="authoring-knowledge__error" role="alert">
        <span>{{ error }}</span><button type="button" @click="$emit('retry')">{{ tr('重试') }}</button>
      </div>
    </div>

    <footer class="authoring-knowledge__composer">
      <div class="authoring-knowledge__primary-tools" role="group" :aria-label="tr('妙笔工具')">
        <button type="button" class="active">{{ tr('问答') }}</button>
        <button v-if="reviewWorkflow" type="button" @click="openReview">{{ tr('审稿') }}</button>
        <button type="button" @click="chooseTask(primaryTasks[0])">{{ tr('提取') }}</button>
        <button type="button" @click="$emit('open-illustrator')">{{ tr('生图') }}</button>
      </div>
      <div class="authoring-knowledge__tasks" :aria-label="tr('问答范围')">
        <select :aria-label="tr('问答范围')" :value="selectedIntent" @change="chooseTask(allTasks.find(task => task.id === $event.target.value))">
          <option v-for="task in allTasks" :key="task.id" :value="task.id">{{ tr(task.label) }}</option>
        </select>
      </div>
      <div v-if="agentEnabled && pinnedRefs.length" class="authoring-knowledge__chips" :aria-label="tr('已钉住的 @ 参考')">
        <span v-for="(refItem, refIndex) in pinnedRefs" :key="refItem.id" class="authoring-knowledge__chip" :title="refItem.summary">
          @{{ refItem.title }}<button type="button" :aria-label="tr('移除引用')" @click="$emit('unpin-ref', refIndex)">×</button>
        </span>
      </div>
      <div class="authoring-knowledge__input-row">
        <div class="authoring-knowledge__input-wrap">
          <div v-if="mention" class="authoring-knowledge__pop" role="listbox">
            <div v-for="(candidate, candidateIndex) in mention.list" :key="candidate.id" role="option"
              :aria-selected="candidateIndex === mention.idx" class="authoring-knowledge__pop-item"
              :class="{ 'is-on': candidateIndex === mention.idx }"
              @mousedown.prevent="pickMention(candidate)">@{{ candidate.title }} <small>{{ candidate.type }}</small></div>
          </div>
          <div v-if="slash" class="authoring-knowledge__pop" role="listbox">
            <div v-for="(command, commandIndex) in slash.list" :key="command.name" role="option"
              :aria-selected="commandIndex === slash.idx" class="authoring-knowledge__pop-item"
              :class="{ 'is-on': commandIndex === slash.idx }"
              @mousedown.prevent="runSlash(command)">/{{ command.name }} {{ command.args }} <small>{{ command.desc }}</small></div>
          </div>
          <textarea ref="composerTextarea" :value="draft" rows="2" :placeholder="tr(placeholder)" :aria-label="tr('向助手提问')"
            @input="onDraftInput" @compositionstart="composing = true"
            @compositionend="composing = false" @keydown="onComposerKey" @click="refreshPopovers($event.target)"></textarea>
        </div>
        <button v-if="busy" type="button" class="authoring-knowledge__send is-cancel" :aria-label="tr('停止查询')" @click="$emit('cancel')">■</button>
        <button v-else type="button" class="authoring-knowledge__send" :aria-label="tr('发送问题')" :disabled="!draft.trim()" @click="submit">↑</button>
      </div>
      <small>{{ tr('项目问答会附原文依据；自由建议不会冒充作品事实。') }}</small>
    </footer>
    </template>
  </section>
</template>

<script setup>
import { tr, uiLocale } from '../../i18n/index.js'
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const AuthoringGoalReview = defineAsyncComponent(() => import('./AuthoringGoalReview.vue'))

import {
  applyMention,
  filterMentions,
  mentionAtCursor,
  parseSlashCommand,
  slashMatches
} from '../../services/agents/storyagent/panelComposer.js'
import { recordKnowledgeSeamFocus } from '../../composables/useAuthoringKnowledgeAssistant.js'

const props = defineProps({
  reviewWorkflow: { type: Object, default: null },
  projectTitle: { type: String, default: '' },
  messages: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  selectedIntent: { type: String, default: 'whole-book' },
  busy: Boolean,
  error: { type: String, default: '' },
  notice: { type: Object, default: null },
  // ---- StoryAgent 融合区（agentEnabled=false 时全部惰性，既有调用方零感知） ----
  agentEnabled: { type: Boolean, default: false },
  mentionSources: { type: Array, default: () => [] },
  pinnedRefs: { type: Array, default: () => [] },
  agentSessions: { type: Array, default: () => [] },
  activeAgentSessionId: { type: String, default: '' },
  agentTasks: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:draft', 'select-intent', 'ask', 'cancel', 'retry', 'clear', 'open-evidence', 'review-notice', 'open-illustrator', 'pin-ref', 'unpin-ref', 'agent-command', 'session-new', 'session-switch', 'session-delete', 'session-rename', 'task-resume', 'refresh-tasks'])
const reviewOpen = ref(props.reviewWorkflow?.goalMode.value && props.reviewWorkflow?.panelOpen.value)
watch(() => [props.reviewWorkflow?.goalMode.value, props.reviewWorkflow?.panelOpen.value], ([goalMode, open]) => { reviewOpen.value = Boolean(goalMode && open) })
function openReview() {
  if (props.busy) return
  if (props.reviewWorkflow?.open({ goalMode: true })) reviewOpen.value = true
}
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

// ---- StoryAgent 融合区：@ 弹层 / / 菜单 / 会话抽屉 ----
const mention = ref(null)
const slash = ref(null)
const sessionsOpen = ref(false)
const renamingSession = ref('')
const renamingTitle = ref('')
const renameInputRef = ref(null)
const composerTextarea = ref(null)

function refreshPopovers(target) {
  if (!props.agentEnabled) return
  const value = target?.value ?? props.draft
  const caret = target?.selectionStart ?? value.length
  const m = mentionAtCursor(value, caret)
  const candidates = m ? filterMentions(props.mentionSources, m.token) : []
  mention.value = m && candidates.length ? { ...m, list: candidates, idx: 0 } : null
  if (value.startsWith('/') && !value.includes('\n')) {
    const commands = slashMatches(value.slice(1))
    slash.value = commands.length ? { token: value.slice(1), list: commands, idx: 0 } : null
  } else {
    slash.value = null
  }
}

function pickMention(candidate) {
  const m = mention.value
  if (!m) return
  const applied = applyMention(props.draft, m.start, m.token.length, candidate.title)
  emit('update:draft', applied.text)
  emit('pin-ref', candidate)
  mention.value = null
  nextTick(() => {
    const el = composerTextarea.value
    el?.focus()
    try { el?.setSelectionRange(applied.caret, applied.caret) } catch { /* 老内核不设光标 */ }
  })
}

function runSlash(command) {
  const parsed = parseSlashCommand(props.draft) || { name: command.name, args: '' }
  slash.value = null
  emit('update:draft', '')
  if (command.name === 'sessions') sessionsOpen.value = true
  emit('agent-command', parsed.name || command.name, parsed.args || '')
}

function toggleSessions() {
  sessionsOpen.value = !sessionsOpen.value
  if (sessionsOpen.value) emit('refresh-tasks')
}

function renameSessionInline(session) {
  renamingSession.value = session.sessionId
  renamingTitle.value = session.title
  nextTick(() => renameInputRef.value?.focus())
}

function commitRename() {
  if (renamingSession.value && renamingTitle.value.trim()) {
    emit('session-rename', renamingSession.value, renamingTitle.value.trim())
  }
  renamingSession.value = ''
}

function onDraftInput(event) {
  emit('update:draft', event.target.value)
  refreshPopovers(event.target)
}

function onComposerKey(event) {
  if (event.isComposing || composing.value) return
  const m = mention.value
  if (m) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      mention.value = { ...m, idx: (m.idx + delta + m.list.length) % m.list.length }
      return
    }
    if (event.key === 'Escape') { mention.value = null; return }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      pickMention(m.list[m.idx])
      return
    }
  }
  const s = slash.value
  if (s) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      slash.value = { ...s, idx: (s.idx + delta + s.list.length) % s.list.length }
      return
    }
    if (event.key === 'Escape') { slash.value = null; return }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      runSlash(s.list[s.idx])
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const parsed = parseSlashCommand(props.draft)
    if (parsed && props.agentEnabled) {
      event.preventDefault()
      emit('agent-command', parsed.name, parsed.args)
      emit('update:draft', '')
      return
    }
    submit()
  }
}

function submit() {
  const question = props.draft.trim()
  if (!question || props.busy) return
  emit('ask', { intent: props.selectedIntent, question })
}
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
  return date.toLocaleTimeString(uiLocale.value, { hour: '2-digit', minute: '2-digit', hour12: false })
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
  emit('update:draft', tr(task.suggestion))
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

/* ---- StoryAgent 融合区样式（token 与既有面一致） ---- */
.authoring-knowledge__sessions-glyph { font-size: 11px; letter-spacing: .04em; }
.authoring-knowledge__sessions { position: absolute; z-index: 4; inset: 102px 10px auto; max-height: min(420px, 56vh); overflow-y: auto; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-workbench-raised, var(--surface-primary)); box-shadow: var(--shadow-workbench, 0 10px 28px color-mix(in srgb, var(--text-primary) 14%, transparent)); }
.authoring-knowledge__sessions > div { display: flex; align-items: center; justify-content: space-between; margin: 6px 0; }
.authoring-knowledge__sessions > div strong { font-size: 13px; }
.authoring-knowledge__sessions > div button { border: 0; background: transparent; color: var(--accent-primary, var(--accent)); font-size: 12px; cursor: pointer; }
.authoring-knowledge__session-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 6px; border: 0; border-bottom: 1px solid var(--border-subtle); background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; text-align: start; cursor: pointer; }
.authoring-knowledge__session-row:hover, .authoring-knowledge__session-row.is-active { background: var(--surface-hover); color: var(--text-primary); }
.authoring-knowledge__session-row.is-active { border-inline-start: 2px solid var(--accent-primary, var(--accent)); }
.authoring-knowledge__session-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__session-actions { display: flex; flex: 0 0 auto; gap: 4px; }
.authoring-knowledge__session-actions button { border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 13px; }
.authoring-knowledge__sessions-empty { margin: 8px 0; color: var(--text-secondary); font-size: 12px; text-align: center; }
.authoring-knowledge__sessions-tasks { margin-top: 10px; }
.authoring-knowledge__rename { display: flex; gap: 6px; margin: 8px 10px; }
.authoring-knowledge__rename input { min-width: 0; flex: 1; padding: 6px 8px; border: 1px solid var(--border-subtle); border-radius: 4px; background: transparent; color: var(--text-primary); font: inherit; font-size: 13px; }
.authoring-knowledge__rename button { border: 1px solid var(--border-subtle); border-radius: 4px; background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer; }
.authoring-knowledge__agent { margin: 0 0 26px; }
.authoring-knowledge__agent-think { margin-bottom: 10px; border-inline-start: 2px solid var(--border-subtle); padding-inline-start: 10px; color: var(--text-secondary); font-size: 12px; }
.authoring-knowledge__agent-think summary { padding: 4px 0; cursor: pointer; list-style: none; }
.authoring-knowledge__agent-think summary::-webkit-details-marker { display: none; }
.authoring-knowledge__agent-think summary span { margin-inline-start: 4px; }
.authoring-knowledge__agent-think-body { max-height: 220px; overflow-y: auto; margin-top: 4px; white-space: pre-wrap; word-break: break-word; line-height: 1.6; opacity: .85; }
.authoring-knowledge__agent-tools { margin: 10px 0 0; padding-inline-start: 24px; color: var(--text-secondary); font-size: 12px; list-style: none; }
.authoring-knowledge__agent-tools li::before { content: '· '; }
.authoring-knowledge__agent-status { margin: 8px 0 0; color: var(--text-secondary); font-size: 12px; }
.authoring-knowledge__agent-meta { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--text-secondary); font-size: 12px; flex-wrap: wrap; }
.authoring-knowledge__agent-meta .is-ok { color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__agent-meta .is-fail { color: var(--signal-warning, #b42318); }
.authoring-knowledge__system-row { margin: 0 0 16px; padding-inline-start: 10px; border-inline-start: 2px solid var(--border-subtle); color: var(--text-secondary); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.authoring-knowledge__chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.authoring-knowledge__chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border: 1px solid var(--border-subtle); border-radius: 999px; color: var(--text-secondary); font-size: 11px; }
.authoring-knowledge__chip button { border: 0; background: transparent; color: var(--text-secondary); font-size: 12px; line-height: 1; cursor: pointer; }
.authoring-knowledge__input-wrap { position: relative; min-width: 0; }
.authoring-knowledge__input-wrap textarea { width: 100%; box-sizing: border-box; }
.authoring-knowledge__pop { position: absolute; z-index: 6; inset: auto 0 100%; max-height: 200px; margin-bottom: 4px; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-workbench-raised, var(--surface-primary)); box-shadow: var(--shadow-workbench, 0 10px 28px color-mix(in srgb, var(--text-primary) 14%, transparent)); }
.authoring-knowledge__pop-item { padding: 6px 10px; color: var(--text-primary); font-size: 13px; cursor: pointer; }
.authoring-knowledge__pop-item small { margin-inline-start: 6px; color: var(--text-secondary); font-size: 11px; }
.authoring-knowledge__pop-item:hover, .authoring-knowledge__pop-item.is-on { background: var(--surface-hover); }
@keyframes knowledge-pulse { to { opacity: .28; transform: scale(.72); } }
@media (pointer: coarse) {
  .authoring-knowledge__toolbar-actions button, .authoring-knowledge__suggestions button, .authoring-knowledge__tasks button, .authoring-knowledge__tasks select, .authoring-knowledge__primary-tools button, .authoring-knowledge__evidence-list > button, .authoring-knowledge__send { min-height: 44px; }
}
@media (max-width: 720px) {
  .authoring-knowledge__welcome { margin-top: 5vh; }
  .authoring-knowledge__toolbar-actions button, .authoring-knowledge__suggestions button, .authoring-knowledge__tasks button, .authoring-knowledge__tasks select, .authoring-knowledge__primary-tools button, .authoring-knowledge__evidence-list > button, .authoring-knowledge__send { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .authoring-knowledge__thinking span { animation: none; }
  .authoring-knowledge__evidence summary::before { transition: none; }
}
</style>
