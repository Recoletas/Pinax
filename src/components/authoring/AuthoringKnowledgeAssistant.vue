<template>
  <section ref="knowledgeRootRef" class="authoring-knowledge" :class="{ 'is-expanded': expanded, 'is-starting': !messages.length && !reviewOpen }" :aria-label="tr('作品资料助手')">
    <header v-if="!reviewOpen" class="authoring-knowledge__toolbar">
      <div v-if="!expanded" class="authoring-knowledge__toolbar-primary"><slot name="workspace-actions"><div class="authoring-knowledge__model">
        <strong>{{ expanded ? tr('当前对话') : projectTitle || tr('未命名作品') }}</strong>
        <small>{{ tr('写作助手') }}</small>
      </div></slot></div>
      <div v-if="!reviewOpen" class="authoring-knowledge__toolbar-actions">
        <button v-if="messages.length" type="button" :class="{ active: searchOpen }" :aria-pressed="searchOpen" :aria-label="tr('搜索当前问答')" :title="tr('搜索当前问答')" @click="toggleSearch">
          <WorkbenchIcon name="search" :size="18" />
        </button>
        <button type="button" class="assistant-conversation-toggle" :class="{ active: historyOpen }" :aria-pressed="historyOpen" :aria-label="tr('对话')" :title="tr('对话')" @click="toggleHistory">
          <WorkbenchIcon name="history" :size="18" /><span>{{ tr('对话') }}</span>
        </button>
      </div>
    </header>
    <AuthoringGoalReview v-if="reviewOpen" ref="goalReviewRef" :workflow="reviewWorkflow" @close="closeReview" />
    <template v-else>
    <div v-if="searchOpen" class="authoring-knowledge__search">
      <WorkbenchIcon name="search" :size="15" />
      <input ref="searchInputRef" v-model="searchTerm" type="search" :placeholder="tr('搜索问题或回答')" :aria-label="tr('搜索问题或回答')" />
      <button type="button" :aria-label="tr('关闭搜索')" @click="closeSearch">×</button>
    </div>

    <div v-if="historyOpen" class="authoring-knowledge__history" :aria-label="tr('作品对话')">
      <div class="assistant-conversation-heading"><strong>{{ tr('对话') }}</strong><button type="button" :disabled="busy || agentState.adoptionBusy" @click="startConversation">{{ tr('新建对话') }}</button></div>
      <div v-for="session in conversations" :key="session.sessionId" class="assistant-conversation-row" :class="{ 'is-active': session.active }">
        <button type="button" class="assistant-conversation-select" :disabled="busy || agentState.adoptionBusy" :aria-current="session.active ? 'true' : undefined" @click="selectConversation(session.sessionId)"><WorkbenchIcon name="message-square" :size="15" /><span>{{ session.title }}</span></button>
        <button type="button" class="assistant-conversation-delete" :disabled="busy || agentState.adoptionBusy" :aria-label="tr('删除对话 {title}', { title: session.title })" :title="tr('删除对话')" @click="deleteConversation(session)"><WorkbenchIcon name="trash" :size="15" /></button>
      </div>
    </div>

    <div class="authoring-knowledge__body">
    <div v-if="!messages.length" class="authoring-knowledge__intro">
      <h3>{{ tr(emptyBook ? '先聊聊你的故事' : '接下来，想写什么？') }}</h3>
    </div>

    <div ref="threadRef" class="authoring-knowledge__thread" aria-live="polite" @scroll.passive="updateActiveQuestion">
      <template v-for="message in visibleMessages" :key="message.id">
        <div v-if="message.role === 'user'" class="authoring-knowledge__question" :data-message-id="message.id" tabindex="-1">
          <p>{{ message.question }}</p>
        </div>
        <article v-else-if="message.kind === 'agent'" class="authoring-knowledge__answer">
          <div class="authoring-knowledge__answer-meta"><span><WorkbenchIcon name="message-square" :size="16" />{{ tr('助手') }}</span><span v-if="message.usage?.totalTokens" class="authoring-knowledge__answer-tokens" :title="tr('输入 {in} · 输出 {out}', { in: message.usage.inputTokens ?? 0, out: message.usage.outputTokens ?? 0 })">{{ tr('用量 {n}', { n: message.usage.totalTokens }) }}</span><button v-if="canRegenerate(message)" type="button" class="authoring-knowledge__regenerate" data-test="assistant-regenerate-open" :aria-label="tr('换参数重答这一问')" :title="tr('换参数重答这一问')" @click="openRegenerate(message)"><WorkbenchIcon name="refresh" :size="14" /></button><time>{{ formatTime(message.createdAt) }}</time></div>
          <details v-if="message.thinking" class="authoring-knowledge__agent-detail"><summary><WorkbenchIcon name="chevron-down" :size="12" />{{ tr('思考过程') }}</summary><p>{{ message.thinking }}</p></details>
          <details v-if="message.tools?.length" class="authoring-knowledge__agent-detail"><summary><WorkbenchIcon name="chevron-down" :size="12" />{{ tr('已使用 {count} 次工具', { count: message.tools.length }) }}</summary><p v-for="(tool, index) in message.tools" :key="index">{{ toolLabel(tool.name) }}</p></details>
          <div class="authoring-knowledge__answer-text authoring-knowledge__answer-md" v-html="renderAnswerHtml(message.text)"></div>
          <section v-if="message.references?.length" class="authoring-knowledge__evidence" :aria-label="tr('本轮检索片段')">
            <div class="authoring-knowledge__evidence-list"><button v-for="source in message.references" :key="source.sourceRef" type="button" :title="tr('生成时的资料片段，资料更新后请重新检索')" @click="onEvidenceClick(source, $event.currentTarget)"><WorkbenchIcon name="document" :size="14" /><span>{{ source.label }}</span></button></div>
          </section>
          <p v-if="['cancelled', 'interrupted', 'failed'].includes(message.status)" class="authoring-knowledge__stale">{{ tr('这次回答未完成，保留的文字不能直接采纳。') }}</p>
          <button v-if="message.status === 'completed' && message.proposal" type="button" class="authoring-knowledge__agent-adopt" :disabled="busy || agentState.adoptionBusy" @click="assistant.reviewProposal(message.id)"><WorkbenchIcon name="writing" :size="14" />{{ tr(message.proposal.status === 'adopted' ? '查看已采用的修改' : '查看修改建议') }}</button>
        </article>
        <article v-else-if="message.answer" class="authoring-knowledge__answer">
          <div class="authoring-knowledge__answer-meta">
            <span :class="message.answer.answerKind === 'free-advice' ? 'is-free' : 'is-grounded'">
              <WorkbenchIcon name="message-square" :size="16" />{{ tr('助手') }}
            </span>
            <button v-if="message.promptSnapshotKey" type="button" class="authoring-knowledge__prompt" :aria-label="tr('查看本轮提示词')" :title="tr('查看本轮提示词')" @click="openPromptPreview(message.promptSnapshotKey)"><WorkbenchIcon name="search" :size="14" /></button>
            <button type="button" class="authoring-knowledge__regenerate" data-test="assistant-regenerate-open" :aria-label="tr('换参数重答这一问')" :title="tr('换参数重答这一问')" @click="openRegenerate(message)"><WorkbenchIcon name="refresh" :size="14" /></button>
            <small v-if="message.params" class="authoring-knowledge__answer-params">{{ tr('按 {params} 重答', { params: regenerateParamsLabel(message.params) }) }}</small>
            <time>{{ formatTime(message.answer.createdAt) }}</time>
          </div>
          <p v-if="message.answer.stale" class="authoring-knowledge__stale" role="status">
            {{ tr('资料已更新，这份回答保留供回看；请重新查询后再据此继续创作。') }}
          </p>
          <div class="authoring-knowledge__answer-text authoring-knowledge__answer-md" v-html="renderAnswerHtml(message.answer.answer)"></div>

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

          <section v-if="message.answer.evidence.length" class="authoring-knowledge__evidence" :aria-label="tr('参考资料')">
            <div class="authoring-knowledge__evidence-list">
              <button v-for="evidence in visibleEvidence(message)" :key="evidence.sourceRef" type="button"
                :class="{ 'is-stale': staleSource(message.answer, evidence.sourceRef) }"
                :title="evidence.excerpt" @click="onEvidenceClick(evidence, $event.currentTarget)">
                <WorkbenchIcon name="document" :size="14" /><span>{{ evidence.label }}</span>
              </button>
              <button v-if="message.answer.evidence.length > 3" type="button" class="authoring-knowledge__more-sources" @click="toggleSources(message.id)">{{ expandedSources.has(message.id) ? tr('收起') : tr('另 {count} 条资料', { count: message.answer.evidence.length - 3 }) }}</button>
            </div>
          </section>
        </article>
      </template>

      <p v-if="messages.length && !visibleMessages.length" class="authoring-knowledge__no-results">{{ tr('没有找到相关问答') }}</p>

      <div v-if="busy" class="authoring-knowledge__thinking" role="status">
        <span aria-hidden="true"></span>{{ tr(selectedIntent === 'free' ? '正在整理思路…' : '正在核对项目资料…') }}
      </div>
      <button v-if="notice?.text" type="button" class="authoring-knowledge__notice" @click="$emit('review-notice')">
        <span>{{ notice.text }}</span><small v-if="notice.reviewable">{{ tr('查看') }}</small>
      </button>
      <div v-if="error" class="authoring-knowledge__error" role="alert">
        <span>{{ tr(error) }}</span><button v-if="!assistant || unref(assistant.lastRequest)" type="button" @click="$emit('retry')">{{ tr('重试') }}</button>
      </div>
      <p v-if="persistenceError" class="authoring-knowledge__persistence-error" role="alert">{{ tr(persistenceError) }}</p>
    </div>

    <footer class="authoring-knowledge__composer">
      <div v-if="documentTitle" class="assistant-document-context"><span>{{ tr('当前文稿') }}</span><button type="button" :title="tr('返回当前文稿')" @click="$emit('direct-writing')">{{ documentTitle }}</button></div>
      <AuthoringAgentTools v-if="selectedIntent === 'agent' && assistant" :assistant="assistant" :busy="busy" :project-id="projectId" />
      <div class="authoring-knowledge__input-row">
        <div v-if="mentionCandidates.length" class="authoring-knowledge__mentions" role="listbox" :aria-label="tr('选择参考资料')">
          <button v-for="(entry, index) in mentionCandidates" :key="entry.type + ':' + entry.id" type="button" role="option" :aria-selected="index === mentionIndex" @pointerdown.prevent="pickMention(entry)">{{ entry.title }}</button>
        </div>
        <textarea ref="draftInputRef" :value="draft" rows="1" :placeholder="tr(placeholder)" :aria-label="tr('向助手提问')"
          @input="updateMentionDraft" @click="updateMention($event.target)" @keyup="updateMentionCursor" @compositionstart="composing = true"
          @compositionend="composing = false; updateMention($event.target)" @keydown="draftKeydown"></textarea>
        <div class="authoring-knowledge__composer-actions">
          <details ref="toolsRef" class="authoring-knowledge__tools" @toggle="placeMenu($event.currentTarget)" @keydown.esc.stop.prevent="closeMenu($event.currentTarget, true)" @focusout="leaveMenu">
            <summary :aria-label="tr('添加参考')" :title="tr('添加文件或章节')" @keydown.down.prevent="focusFirstMenu($event.currentTarget.parentElement)"><WorkbenchIcon name="plus" :size="20" /></summary>
            <div class="authoring-knowledge__tool-menu" :aria-label="tr('添加参考')">
              <button type="button" :disabled="busy || !projectId" @click="openFileImport"><WorkbenchIcon name="sources" :size="18" /><span>{{ tr('添加文件') }}</span></button>
              <button type="button" :disabled="busy || !agentState.enabled" @click="referencePicker = 'chapter'"><WorkbenchIcon name="book" :size="18" /><span>{{ tr('引用章节') }}</span></button>
              <button type="button" :disabled="busy || !agentState.enabled" @click="referencePicker = 'source'"><WorkbenchIcon name="archive" :size="18" /><span>{{ tr('引用已有资料') }}</span></button>
              <template v-if="referencePicker"><input v-model="referenceQuery" type="search" :placeholder="tr('搜索参考资料')" :aria-label="tr('搜索添加参考')" /><button v-for="entry in referenceCandidates" :key="entry.type + entry.id" type="button" :disabled="busy" :aria-pressed="referenceSelected(entry)" @click="toggleReference(entry)"><WorkbenchIcon :name="referenceSelected(entry) ? 'check' : 'document'" :size="15" /><span>{{ entry.title }}</span></button><p v-if="!referenceCandidates.length">{{ tr('当前没有匹配的参考') }}</p></template>
            </div>
          </details>
          <details ref="purposeRef" class="authoring-knowledge__purpose" @toggle="placeMenu($event.currentTarget)" @keydown.esc.stop.prevent="closeMenu($event.currentTarget, true)" @focusout="leaveMenu">
            <summary :aria-label="tr('助手任务')" @keydown.down.prevent="focusFirstMenu($event.currentTarget.parentElement)"><WorkbenchIcon :name="discussing ? 'message-square' : 'search'" :size="15" /><span>{{ tr(selectedIntent === 'agent' ? '写作与修改' : discussing ? '讨论故事' : '查阅资料') }}</span><WorkbenchIcon name="chevron-down" :size="14" /></summary>
            <div class="authoring-knowledge__tool-menu authoring-knowledge__purpose-menu" :aria-label="tr('助手任务')">
              <button type="button" :aria-pressed="discussing" @click="choosePurpose('free')"><WorkbenchIcon name="message-square" :size="18" /><span>{{ tr('讨论故事') }}<small>{{ tr('一起想情节、人物和写法') }}</small></span></button>
              <button v-if="agentState.enabled" type="button" :aria-pressed="selectedIntent === 'agent'" @click="choosePurpose('agent')"><WorkbenchIcon name="assistant" :size="18" /><span>{{ tr('写作与修改') }}<small>{{ tr('查阅参考、运用技法，确认后加入正文') }}</small></span></button>
              <button type="button" :aria-pressed="!discussing && selectedIntent !== 'agent'" @click="choosePurpose('whole-book')"><WorkbenchIcon name="search" :size="18" /><span>{{ tr('查阅资料') }}<small>{{ tr('查正文和设定，附原文出处') }}</small></span></button>
              <button v-if="reviewWorkflow" type="button" :disabled="busy || emptyBook" @click="useTool('review')"><WorkbenchIcon name="guide" :size="18" /><span>{{ tr('检查文稿') }}</span></button>
              <button type="button" @click="useTool('illustrator')"><WorkbenchIcon name="image" :size="18" /><span>{{ tr('生成插图') }}</span></button>
            </div>
          </details>
          <button v-if="busy" type="button" class="authoring-knowledge__send is-cancel" :aria-label="tr('停止查询')" :title="tr('停止查询')" @click="$emit('cancel')"><WorkbenchIcon name="close" :size="20" /></button>
          <button v-else type="button" class="authoring-knowledge__send" :aria-label="tr('发送问题')" :title="tr('发送问题')" :disabled="!draft.trim()" @click="submit"><WorkbenchIcon name="arrow-up" :size="20" /></button>
        </div>
      </div>
    </footer>
    <WorldbookSourceImportDialog v-if="fileImportOpen && projectId" :key="projectId" :book-id="projectId" file-mode @close="fileImportOpen = false" @completed="filesImported" />

    <div v-if="!messages.length" class="authoring-knowledge__start-options">
      <div class="authoring-knowledge__prompt-list" :aria-label="tr('写作起点')">
        <button v-for="task in (emptyBook ? startingPoints : suggestedTasks)" :key="task.suggestion" type="button" @click="chooseSuggestion(task)"><WorkbenchIcon :name="task.id === 'free' ? 'message-square' : 'search'" :size="15" /><span>{{ tr(task.label) }}</span></button>
      </div>
    </div>
    </div>
    </template>

    <PromptPreviewPanel v-if="promptPreviewOpen" :snapshot-key="promptPreviewKey" />
    <AssistantRegenerateDialog
      v-if="regenerateTarget"
      :question="regenerateTarget.question"
      :initial-intent="regenerateTarget.intent"
      :busy="busy"
      @close="closeRegenerate"
      @confirm="applyRegenerate"
    />
  </section>
</template>

<script setup>
import { tr, uiLocale } from '../../i18n/index.js'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const AuthoringAgentTools = defineAsyncComponent(() => import('./AuthoringAgentTools.vue'))
const WorldbookSourceImportDialog = defineAsyncComponent(() => import('../worldbook/WorldbookSourceImportDialog.vue'))
const AuthoringGoalReview = defineAsyncComponent(() => import('./AuthoringGoalReview.vue'))
const AssistantRegenerateDialog = defineAsyncComponent(() => import('./AssistantRegenerateDialog.vue'))

import { mentionAtCursor, filterMentions, applyMention } from '../../services/agents/storyagent/panelComposer.js'
import { recordKnowledgeSeamFocus } from '../../composables/useAuthoringKnowledgeAssistant.js'
import { markdownToHtml } from '../../services/notes/assetMarkdown.js'
import { regenerateIntentLabel, regenerateTemperatureLabel } from '../../services/agents/authoring/assistantRegenerateOptions.js'
import PromptPreviewPanel from '../agent/PromptPreviewPanel.vue'
import { promptPreviewKey, openPromptPreview } from '../../composables/usePromptPreview.js'

const props = defineProps({
  assistant: { type: Object, default: null },
  agentState: { type: Object, default: () => ({}) },
  reviewWorkflow: { type: Object, default: null },
  projectId: { type: String, default: '' },
  projectTitle: { type: String, default: '' },
  documentTitle: { type: String, default: '' },
  expanded: Boolean,
  emptyBook: Boolean,
  messages: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  selectedIntent: { type: String, default: 'free' },
  busy: Boolean,
  error: { type: String, default: '' },
  persistenceError: { type: String, default: '' },
  notice: { type: Object, default: null }
})
const emit = defineEmits(['update:draft', 'select-intent', 'ask', 'cancel', 'retry', 'open-evidence', 'review-notice', 'open-illustrator', 'direct-writing', 'active-question'])
const conversations = computed(() => unref(props.assistant?.sessions) || [])
const referencePicker = ref('')
const referenceQuery = ref('')
const fileImportOpen = ref(false)
let importOwner = ''
const referenceCandidates = computed(() => {
  const context = props.assistant?.agentContext?.() || {}
  const entries = referencePicker.value === 'chapter' ? context.chapterEntries || [] : context.sourceEntries || []
  const query = referenceQuery.value.trim().toLocaleLowerCase()
  return entries.filter(entry => !query || entry.title.toLocaleLowerCase().includes(query))
})
function referenceSelected(entry) { return props.agentState.refs?.some(ref => ref.id === entry.id && ref.type === entry.type) }
function toggleReference(entry) {
  const refs = props.agentState.refs || []
  if (!referenceSelected(entry) && refs.length >= 8) return
  props.assistant?.setAgentReferences(referenceSelected(entry) ? refs.filter(ref => !(ref.id === entry.id && ref.type === entry.type)) : [...refs, entry])
  emit('select-intent', 'agent')
}
function openFileImport() { closeMenu(toolsRef.value, true); importOwner = props.projectId; fileImportOpen.value = true }
async function filesImported(payload) {
  fileImportOpen.value = false
  if (String(payload?.bookId || '') !== props.projectId || importOwner !== props.projectId) return
  await nextTick()
  const refs = props.agentState.refs || []
  const added = (payload.sources || []).map(source => ({ id: String(source.id), type: 'source', title: source.title }))
  props.assistant?.setAgentReferences([...refs, ...added.filter(source => !refs.some(ref => ref.id === source.id && ref.type === source.type))])
  if (props.agentState.enabled) emit('select-intent', 'agent')
}
function startConversation() { if (props.assistant?.newConversation?.()) { historyOpen.value = false; emit('active-question', ''); nextTick(() => draftInputRef.value?.focus()) } }
function selectConversation(id) { if (props.assistant?.selectSession?.(id)) { historyOpen.value = false; emit('active-question', ''); nextTick(() => draftInputRef.value?.focus()) } }
function deleteConversation(session) {
  const owner = props.projectId
  if (!window.confirm(tr('删除对话「{title}」？删除后无法恢复。', { title: session.title }))) return
  if (owner === props.projectId && props.assistant?.deleteConversation?.(session.sessionId)) emit('active-question', '')
}
watch(() => props.projectId, () => { fileImportOpen.value = false; referencePicker.value = ''; referenceQuery.value = ''; historyOpen.value = false })
const knowledgeRootRef = ref(null)
const goalReviewRef = ref(null)
let pendingReviewFocus = false
const reviewOpen = ref(props.reviewWorkflow?.goalMode.value && props.reviewWorkflow?.panelOpen.value)
watch(() => [props.reviewWorkflow?.goalMode.value, props.reviewWorkflow?.panelOpen.value], ([goalMode, open]) => { reviewOpen.value = Boolean(goalMode && open) })
function openReview() {
  if (props.busy || props.emptyBook) return
  if (props.reviewWorkflow?.open({ goalMode: true })) {
    pendingReviewFocus = true
    reviewOpen.value = true
  }
}
watch(goalReviewRef, (review) => {
  if (!review || !pendingReviewFocus) return
  nextTick(() => {
    if (!reviewOpen.value || goalReviewRef.value !== review) return
    pendingReviewFocus = false
    knowledgeRootRef.value?.querySelector('.goal-review-controls textarea:not(:disabled)')?.focus({ preventScroll: true })
  })
})
function closeReview() {
  pendingReviewFocus = false
  reviewOpen.value = false
  nextTick(() => draftInputRef.value?.focus({ preventScroll: true }))
}
// 点证据先在助手内预览；对 K 可映射的来源（世界设定/历史/相关记忆）同时登记
// 为下一次提问的可信点名来源（受限 I0，默认关）。正文/大纲/现场等不可
// 映射来源不登记——不制造注定失败的接缝请求。
const SEAM_MAPPABLE_AUTHORITIES = ['worldbook', 'history', 'memory']
function onEvidenceClick(evidence, trigger) {
  if (evidence && SEAM_MAPPABLE_AUTHORITIES.includes(evidence.authority)) {
    recordKnowledgeSeamFocus(evidence.sourceRef, evidence.projectId)
  }
  emit('open-evidence', evidence, trigger)
}

const threadRef = ref(null)
let activeQuestionFrame = null
let lastActiveQuestionId = ''
let focusedQuestion = null
let lastThreadPosition = null
let positionRestoreFrame = null
let positionRestoreSequence = 0
let threadRestorePending = false
function discardThreadRestore() {
  positionRestoreSequence += 1
  threadRestorePending = false
  if (positionRestoreFrame !== null) window.cancelAnimationFrame(positionRestoreFrame)
  positionRestoreFrame = null
}
function queueThreadRestore(position) {
  discardThreadRestore()
  threadRestorePending = true
  const sequence = positionRestoreSequence
  nextTick(() => {
    if (sequence !== positionRestoreSequence) return
    positionRestoreFrame = window.requestAnimationFrame(() => {
      if (sequence !== positionRestoreSequence) return
      positionRestoreFrame = null
      threadRestorePending = false
      if (reviewOpen.value) return
      restoreThreadPosition(position)
      updateActiveQuestion()
    })
  })
}
function updateActiveQuestion() {
  if (activeQuestionFrame !== null) return
  activeQuestionFrame = window.requestAnimationFrame(() => {
    activeQuestionFrame = null
    if (threadRestorePending) return
    const thread = threadRef.value
    if (!thread?.getClientRects().length) return
    const questions = Array.from(thread.querySelectorAll('[data-message-id]'))
    let active = questions[0]
    if (focusedQuestion && Math.abs(thread.scrollTop - focusedQuestion.scrollTop) < 1) {
      active = questions.find(question => question.dataset.messageId === focusedQuestion.id) || active
    } else {
      focusedQuestion = null
      if (thread.scrollHeight - thread.clientHeight - thread.scrollTop < 8) active = questions[questions.length - 1]
      else for (const question of questions) {
        if (question.offsetTop > thread.scrollTop + 24) break
        active = question
      }
    }
    const id = active?.dataset.messageId || ''
    if (id !== lastActiveQuestionId) { lastActiveQuestionId = id; emit('active-question', id) }
    lastThreadPosition = captureThreadPosition()
  })
}
function captureThreadPosition() {
  const thread = threadRef.value
  if (!thread) return null
  const anchor = Array.from(thread.querySelectorAll('[data-message-id]')).find(question => question.dataset.messageId === lastActiveQuestionId)
  return {
    projectId: props.projectId,
    messageCount: props.messages.length,
    atBottom: !focusedQuestion && thread.scrollHeight - thread.clientHeight - thread.scrollTop < 8,
    id: lastActiveQuestionId,
    offset: anchor ? anchor.offsetTop - thread.scrollTop : 0,
    scrollTop: thread.scrollTop,
    pinned: focusedQuestion?.id === lastActiveQuestionId
  }
}
function restoreThreadPosition(position) {
  const thread = threadRef.value
  if (!position || position.projectId !== props.projectId || position.messageCount !== props.messages.length || !thread?.getClientRects().length) return
  const anchor = Array.from(thread.querySelectorAll('[data-message-id]')).find(question => question.dataset.messageId === position.id)
  thread.scrollTop = position.atBottom ? thread.scrollHeight : anchor ? Math.max(0, anchor.offsetTop - position.offset) : position.scrollTop
  focusedQuestion = position.pinned && anchor ? { id: position.id, scrollTop: thread.scrollTop } : null
  updateActiveQuestion()
}
let reviewThreadPosition = null
watch(reviewOpen, (open) => {
  if (open) {
    discardThreadRestore()
    reviewThreadPosition = lastThreadPosition || captureThreadPosition()
    return
  }
  queueThreadRestore(reviewThreadPosition)
})
watch(() => props.expanded, () => {
  if (reviewOpen.value) return
  const position = lastThreadPosition || captureThreadPosition()
  queueThreadRestore(position)
})
const draftInputRef = ref(null)
const composing = ref(false)
const searchOpen = ref(false)
const historyOpen = ref(false)
const searchTerm = ref('')
const searchInputRef = ref(null)
const toolsRef = ref(null)
const purposeRef = ref(null)
const expandedSources = ref(new Set())
function placeMenu(menu) {
  const panel = menu?.querySelector('.authoring-knowledge__tool-menu')
  if (!panel) return
  panel.classList.remove('is-below', 'is-compact')
  panel.style.maxHeight = ''
  if (menu === toolsRef.value) {
    const composer = menu.closest('.authoring-knowledge__composer')
    composer?.style.removeProperty('--reference-menu-height')
    if (!menu.open) return
    const height = Math.min(panel.scrollHeight + 2, 260, window.innerHeight * 0.35)
    panel.classList.add('is-below')
    panel.style.maxHeight = `${height}px`
    composer?.style.setProperty('--reference-menu-height', `${height}px`)
    return
  }
  if (!menu.open) return
  const root = knowledgeRootRef.value?.querySelector('.authoring-knowledge__body')?.getBoundingClientRect()
  const anchor = panel.offsetParent
  if (!root || !anchor) return
  const anchorRect = anchor.getBoundingClientRect()
  const scale = anchorRect.width / anchor.offsetWidth || 1
  const panelRect = panel.getBoundingClientRect()
  const above = panelRect.bottom - Math.max(0, root.top) - 8
  const below = Math.min(window.innerHeight, root.bottom) - anchorRect.bottom - 14 * scale - 8
  const opensBelow = above < panelRect.height && below > above
  panel.classList.toggle('is-below', opensBelow)
  const available = opensBelow ? below : above
  panel.classList.toggle('is-compact', panel.classList.contains('authoring-knowledge__purpose-menu') && available < panelRect.height)
  // Rects include body.zoom; menu height is expressed in local CSS pixels.
  panel.style.maxHeight = `${Math.max(1, available) / scale}px`
}
function closeMenu(menu, restoreFocus = false) {
  if (!menu?.open) return
  menu.open = false
  if (restoreFocus) menu.querySelector('summary')?.focus({ preventScroll: true })
}
function leaveMenu(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(event.currentTarget)
}
function closeMenusOutside(event) {
  for (const menu of [toolsRef.value, purposeRef.value]) {
    if (!menu?.contains(event.target)) closeMenu(menu)
  }
}
function focusFirstMenu(menu) {
  if (!menu) return
  menu.open = true
  nextTick(() => menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }))
}
function choosePurpose(intent) {
  mention.value = null
  closeMenu(toolsRef.value)
  closeMenu(purposeRef.value)
  emit('select-intent', intent)
  nextTick(() => draftInputRef.value?.focus({ preventScroll: true }))
}
function useTool(tool) {
  closeMenu(toolsRef.value, true)
  closeMenu(purposeRef.value)
  if (tool === 'review') openReview()
  else if (tool === 'illustrator') emit('open-illustrator')
}
function fitDraft() {
  const input = draftInputRef.value
  if (!input?.getClientRects().length) return
  input.style.height = '0px'
  input.style.height = `${Math.min(160, Math.max(28, input.scrollHeight))}px`
  for (const menu of [toolsRef.value, purposeRef.value]) if (menu?.open) placeMenu(menu)
}
function resizeConversation() {
  const position = lastThreadPosition || captureThreadPosition()
  fitDraft()
  if (!reviewOpen.value) queueThreadRestore(position)
}
onMounted(() => { document.addEventListener('pointerdown', closeMenusOutside); window.addEventListener('resize', resizeConversation) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', closeMenusOutside); window.removeEventListener('resize', resizeConversation); discardThreadRestore(); if (activeQuestionFrame !== null) window.cancelAnimationFrame(activeQuestionFrame) })
watch(() => [props.draft, props.expanded, props.projectId, props.selectedIntent], () => nextTick(fitDraft), { immediate: true })
watch(draftInputRef, () => nextTick(fitDraft))
watch(() => [referencePicker.value, referenceQuery.value, referenceCandidates.value.length], () => nextTick(() => placeMenu(toolsRef.value)))
const discussing = computed(() => props.selectedIntent === 'free')
const placeholder = computed(() => props.selectedIntent === 'agent' ? '希望怎样续写、改写或打磨？' : discussing.value ? '说说你的故事想法…' : '想查什么？')
const suggestedTasks = Object.freeze([
  { id: 'whole-book', label: '理清人物关系', suggestion: '请根据已有正文和设定梳理主要人物的关系，并列出出处。没有依据的关系请不要补全。' },
  { id: 'whole-book', label: '回顾前文', suggestion: '请根据已有正文整理前情，按事件先后列出重要变化，并标注对应原文。' },
  { id: 'free', label: '讨论下一段', suggestion: '我想讨论接下来的一段该怎么写。请先问我想推动哪件事，再一起想人物的选择和后果。' }
])
const startingPoints = Object.freeze([
  { id: 'free', label: '构思人物', suggestion: '我想先构思一个人物。请和我讨论他的处境、愿望和冲突，先给几个方向让我选择。' },
  { id: 'free', label: '展开情节', suggestion: '我有一个故事想法，想和你讨论它能怎样展开。先帮我梳理需要想清楚的问题。' },
  { id: 'free', label: '想个开场', suggestion: '我想讨论故事的第一场戏。请先和我确定人物、场景和开场冲突，再一起尝试写出来。' }
])
function visibleEvidence(message) {
  return expandedSources.value.has(message.id) ? message.answer.evidence : message.answer.evidence.slice(0, 3)
}
function toggleSources(id) {
  const next = new Set(expandedSources.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSources.value = next
}
const visibleMessages = computed(() => {
  const query = searchTerm.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return props.messages
  return props.messages.filter((message) => [message.question, message.answer?.answer, message.text]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(query)))
})
const promptPreviewOpen = computed(() => Boolean(promptPreviewKey.value)
  && props.messages.some((message) => message.promptSnapshotKey === promptPreviewKey.value))

function toolLabel(name) { return tr(({ manuscript_search: '检索正文', manuscript_get: '读取章节', world_lookup: '查阅设定', notes_search: '检索构思', outline_lookup: '查阅大纲', calc_evaluate: '复算数值', submit_narrative_beat_plan: '规划场景', submit_edit_proposals: '整理修改建议' })[name] || name) }
// 助手回答按 Markdown 渲染（模型以 md 书写：加粗标题/分隔线/列表）；连续空行折叠为段距，
// 避免流式分段输出在 pre-wrap 下留出大片空白。经 sanitizeHtml 净化后才进 v-html。
function renderAnswerHtml(text) {
  return markdownToHtml(String(text || '').replace(/\n{3,}/g, '\n\n').trim())
}
function formatTime(value) {
  const date = new Date(Number(value) || Date.now())
  return date.toLocaleTimeString(uiLocale.value, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function staleSource(answer, sourceRef) {
  return (answer?.staleSources || []).some((item) => item.sourceRef === sourceRef)
}

// 「换参数重答」：按新意图／温度重跑一次带出处的资料直查，成功后原地替换这条回答。
// 带修改建议的回答不开放——建议已指向正文，替换回答会让建议失去对应对象。
const regenerateTarget = ref(null)
function canRegenerate(message) {
  if (!props.assistant?.regenerateAnswer) return false
  if (message.kind === 'agent') return message.status === 'completed' && !message.proposal
  return Boolean(message.answer)
}
function openRegenerate(message) {
  if (!canRegenerate(message)) return
  const index = props.messages.findIndex((item) => item.id === message.id)
  if (index <= 0) return
  const question = [...props.messages.slice(0, index)].reverse().find((item) => item.role === 'user' && item.question)
  if (!question) return
  regenerateTarget.value = { message, question: question.question, intent: message.params?.intent || question.intent || 'whole-book' }
}
function closeRegenerate() {
  regenerateTarget.value = null
  nextTick(() => draftInputRef.value?.focus({ preventScroll: true }))
}
function applyRegenerate({ intent, temperatureOverride }) {
  const target = regenerateTarget.value
  if (!target) return
  regenerateTarget.value = null
  props.assistant.regenerateAnswer(target.message.id, { intent, temperatureOverride })
}
function regenerateParamsLabel(params) {
  const intent = regenerateIntentLabel(params?.intent)
  const temperature = regenerateTemperatureLabel(params?.temperatureOverride ?? null)
  return [intent, temperature].filter(Boolean).join(' · ')
}

function formatCalculationInput(item = {}) {
  return `${item.label || '输入'} ${item.value ?? ''}${item.unit || ''}`.trim()
}

function formatCalculationResult(calculation = {}) {
  return `${calculation.result ?? ''}${calculation.unit || ''}`
}

function chooseSuggestion(task) {
  emit('select-intent', task.id)
  emit('update:draft', tr(task.suggestion))
  nextTick(() => draftInputRef.value?.focus({ preventScroll: true }))
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  historyOpen.value = false
  if (searchOpen.value) nextTick(() => searchInputRef.value?.focus())
}
function toggleHistory() {
  const open = !historyOpen.value
  closeSearch()
  historyOpen.value = open
}

function closeSearch() {
  searchOpen.value = false
  searchTerm.value = ''
}



async function focusQuestion(id) {
  if (props.reviewWorkflow?.loading?.value || props.reviewWorkflow?.rewrite?.loading?.value) return
  discardThreadRestore()
  closeSearch()
  historyOpen.value = false
  if (reviewOpen.value) props.reviewWorkflow?.close?.({ restore: false })
  reviewOpen.value = false
  await nextTick()
  discardThreadRestore()
  const question = Array.from(threadRef.value?.querySelectorAll('[data-message-id]') || [])
    .find((element) => element.dataset.messageId === String(id))
  if (!question || !threadRef.value) return
  threadRef.value.scrollTop = Math.max(0, question.offsetTop - 20)
  focusedQuestion = { id: String(id), scrollTop: threadRef.value.scrollTop }
  question.focus({ preventScroll: true })
  lastActiveQuestionId = String(id)
  emit('active-question', lastActiveQuestionId)
  lastThreadPosition = captureThreadPosition()
}

watch(() => props.projectId, () => {
  discardThreadRestore()
  regenerateTarget.value = null
  if (reviewOpen.value) props.reviewWorkflow?.close?.({ restore: false })
  reviewOpen.value = false
  closeSearch()
  historyOpen.value = false
  composing.value = false
  pendingReviewFocus = false
  closeMenu(toolsRef.value)
  closeMenu(purposeRef.value)
  expandedSources.value = new Set()
  lastActiveQuestionId = ''
  focusedQuestion = null
  lastThreadPosition = null
  reviewThreadPosition = null
  emit('active-question', '')
})

defineExpose({ focusQuestion, focusDraft: () => {
  const input = reviewOpen.value ? knowledgeRootRef.value?.querySelector('.goal-review-controls textarea') : draftInputRef.value
  input?.focus({ preventScroll: true })
} })

const mention = ref(null)
const mentionIndex = ref(0)
const mentionCandidates = computed(() => {
  if (props.selectedIntent !== 'agent' || !props.projectId || !mention.value || composing.value) return []
  const context = props.assistant?.agentContext?.() || {}
  return filterMentions([...(context.worldEntries || []), ...(context.chapterEntries || [])], mention.value.token)
})
function updateMention(input) {
  if (!input || composing.value || props.selectedIntent !== 'agent') { mention.value = null; return }
  const next = mentionAtCursor(input.value, input.selectionStart)
  if (next?.token !== mention.value?.token) mentionIndex.value = 0
  mention.value = next
}
function updateMentionCursor(event) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) updateMention(event.target) }
function updateMentionDraft(event) { emit('update:draft', event.target.value); updateMention(event.target) }
function pickMention(entry) {
  if (!mention.value || props.busy) return
  const selected = props.agentState.refs || []
  if (!selected.some(ref => ref.id === entry.id && ref.type === entry.type)) {
    if (selected.length >= 8) return
    props.assistant.setAgentReferences([...selected, entry])
  }
  const result = applyMention(props.draft, mention.value.start, mention.value.token.length, entry.title)
  mention.value = null
  emit('update:draft', result.text)
  nextTick(() => { draftInputRef.value?.focus(); draftInputRef.value?.setSelectionRange(result.caret, result.caret) })
}
function draftKeydown(event) {
  if (event.isComposing || composing.value) return
  if (mentionCandidates.value.length) {
    if (event.key === 'Escape') { event.preventDefault(); mention.value = null; return }
    if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); mentionIndex.value = (mentionIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + mentionCandidates.value.length) % mentionCandidates.value.length; return }
    if (['Tab', 'Enter'].includes(event.key) && !event.shiftKey) { event.preventDefault(); pickMention(mentionCandidates.value[mentionIndex.value] || mentionCandidates.value[0]); return }
  }
  if (event.key === 'Enter') submitOnEnter(event)
}
watch(() => props.projectId, () => { mention.value = null; mentionIndex.value = 0 })
function submit() {
  const question = props.draft.trim()
  if (!question || props.busy) return
  emit('ask', { intent: props.selectedIntent === 'agent' ? 'agent' : discussing.value ? 'free' : 'whole-book', question })
}

function submitOnEnter(event) {
  if (event.shiftKey || event.isComposing || composing.value) return
  event.preventDefault()
  submit()
}

watch(() => [props.projectId, props.messages.length, props.busy], () => nextTick(() => {
  discardThreadRestore()
  focusedQuestion = null
  if (!props.messages.length) { lastActiveQuestionId = ''; emit('active-question', '') }
  if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  updateActiveQuestion()
}), { immediate: true })
watch(searchTerm, () => { focusedQuestion = null; nextTick(updateActiveQuestion) })
</script>

<style scoped>
.authoring-knowledge { --assistant-reading-width: 760px; --assistant-gutter: 16px; --assistant-input-padding: 14px; --assistant-input-radius: 20px; --assistant-input-min-height: 98px; position: relative; display: flex; min-width: 0; min-height: 0; height: 100%; flex-direction: column; color: var(--text-primary); background: var(--surface-assistant); font: 14px/1.5 var(--font-interface, var(--font-sans)); }
.authoring-knowledge__toolbar { display: flex; min-height: 52px; box-sizing: border-box; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 12px 7px 14px; border-bottom: 0; }
.authoring-knowledge__toolbar-primary { min-width: 0; }
.authoring-knowledge__toolbar-primary:empty { display: none; }
.authoring-knowledge__toolbar-actions { flex: none; margin-inline-start: auto; }
.authoring-knowledge__body { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; }
.authoring-knowledge__model { display: grid; min-width: 0; gap: 1px; }
.authoring-knowledge__model strong { overflow: hidden; font-size: 14px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__model small { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__toolbar-actions { display: flex; align-items: center; gap: 2px; }
.authoring-knowledge__toolbar-actions button { display: grid; flex: none; width: 36px; height: 36px; place-items: center; border: 0; border-radius: var(--workspace-radius, 10px); background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-knowledge__toolbar-actions button:hover, .authoring-knowledge__toolbar-actions button.active { background: var(--surface-workbench-muted); color: var(--text-primary); }
.authoring-knowledge__search { display: grid; min-height: 44px; flex: none; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 10px; border-bottom: 1px solid var(--archive-paper-strong); color: var(--text-secondary); }
.authoring-knowledge__search input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; }
.authoring-knowledge__search button { min-width: 36px; min-height: 36px; border-radius: 12px; border: 0; background: transparent; color: var(--text-secondary); font-size: 20px; cursor: pointer; }
.authoring-knowledge__history { position: absolute; z-index: 4; inset: 54px var(--assistant-gutter) auto; max-height: min(360px, 48vh); overflow-y: auto; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover, 16px); background: var(--surface-workbench-overlay, var(--surface-workbench-raised)); box-shadow: var(--shadow-workbench-float); }
.authoring-knowledge__history > div { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.authoring-knowledge__history > div strong { font-size: 13px; }
.authoring-knowledge__history button { width: 100%; min-height: 36px; padding: 8px 10px; overflow: hidden; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; text-align: start; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.authoring-knowledge__history > div button { width: auto; border: 0; color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__history p { margin: 18px 0; color: var(--text-secondary); font-size: 13px; text-align: center; }
.authoring-knowledge__thread { position: relative; min-height: 0; flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 20px var(--assistant-gutter) 28px; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
.authoring-knowledge__question { width: fit-content; max-width: 88%; margin: 0 0 22px auto; padding: 10px 16px; border-radius: 18px; background: var(--surface-workbench-input); overflow-wrap: anywhere; }
.authoring-knowledge__question p { margin: 0; font: var(--assistant-question-size, 15px)/1.7 var(--font-interface, var(--font-sans)); }
.authoring-knowledge__answer { margin: 0 0 32px; }
.authoring-knowledge__answer-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: var(--text-secondary); font: 13px/1.5 var(--font-interface, var(--font-sans)); }
.authoring-knowledge__answer-meta > span { display: inline-flex; align-items: center; gap: 6px; color: var(--text-primary); font-weight: 500; }
.authoring-knowledge__answer-meta .is-grounded { color: var(--text-primary); }
.authoring-knowledge__answer-meta time { color: var(--text-muted); font-size: 12px; }
.authoring-knowledge__prompt, .authoring-knowledge__regenerate { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; }
.authoring-knowledge__prompt:hover, .authoring-knowledge__regenerate:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-knowledge__prompt:focus-visible, .authoring-knowledge__regenerate:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.authoring-knowledge__answer-params { margin-inline-start: auto; color: var(--text-muted); font-size: 11.5px; font-weight: 400; }
.authoring-knowledge__answer-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: var(--assistant-answer-size, 15px)/1.85 var(--font-interface, var(--font-sans)); }
.authoring-knowledge__answer-md { white-space: normal; }
.authoring-knowledge__answer-md p { margin: 0 0 10px; }
.authoring-knowledge__answer-md > :last-child { margin-bottom: 0; }
.authoring-knowledge__answer-md h1, .authoring-knowledge__answer-md h2, .authoring-knowledge__answer-md h3, .authoring-knowledge__answer-md h4 { margin: 16px 0 8px; font-size: 1.06em; font-weight: 600; line-height: 1.5; }
.authoring-knowledge__answer-md hr { margin: 14px 0; border: 0; border-top: 1px solid var(--hairline-soft); }
.authoring-knowledge__answer-md ul, .authoring-knowledge__answer-md ol { margin: 0 0 10px; padding-inline-start: 22px; }
.authoring-knowledge__answer-md li { margin: 0 0 4px; }
.authoring-knowledge__answer-md code { padding: 1px 5px; border-radius: 5px; background: var(--surface-workbench-muted); font-size: .88em; }
.authoring-knowledge__answer-md pre { margin: 0 0 10px; padding: 10px 12px; border-radius: 10px; background: var(--surface-workbench-muted); overflow-x: auto; }
.authoring-knowledge__answer-md pre code { padding: 0; background: transparent; }
.authoring-knowledge__answer-md blockquote { margin: 0 0 10px; padding: 2px 0 2px 12px; border-inline-start: 2px solid var(--hairline-soft); color: var(--text-secondary); }
.authoring-knowledge__answer-md a { color: var(--accent-primary, var(--accent)); }
.authoring-knowledge__stale { margin: 0 0 10px; padding: 8px 10px; border-inline-start: 2px solid var(--signal-warm); background: color-mix(in srgb, var(--signal-warm) 8%, transparent); color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.authoring-knowledge__missing { margin: 12px 0 0; padding: 9px 10px 9px 28px; background: var(--archive-paper); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.authoring-knowledge__calculations { display: grid; gap: 8px; margin-top: 12px; }
.authoring-knowledge__calculations > div { padding: 9px 10px; border: 1px solid var(--archive-paper-strong); border-radius: 12px; }
.authoring-knowledge__calculations strong, .authoring-knowledge__calculations p, .authoring-knowledge__calculations code { display: block; margin: 0 0 4px; font-size: 13px; }
.authoring-knowledge__calculations code { margin: 0; color: var(--accent-primary, var(--accent)); white-space: normal; }
.authoring-knowledge__evidence { margin-top: 14px; }
.authoring-knowledge__evidence-list { display: flex; flex-wrap: wrap; gap: 6px; }
.authoring-knowledge__evidence-list button { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; gap: 7px; min-height: 32px; padding: 5px 9px; border: 1px solid var(--hairline-soft); border-radius: var(--workspace-radius, 10px); background: transparent; color: var(--text-secondary); font: 12px/1.5 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-knowledge__evidence-list button span { overflow: hidden; max-width: 250px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__evidence-list button:hover { background: var(--surface-workbench-muted); color: var(--text-primary); }
.authoring-knowledge__evidence-list button.is-stale { opacity: .66; }
.authoring-knowledge__evidence-list button.authoring-knowledge__more-sources { border-color: transparent; }
.authoring-knowledge__thinking { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; }
.authoring-knowledge__thinking span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-primary, var(--accent)); animation: knowledge-pulse 900ms ease-in-out infinite alternate; }
.authoring-knowledge__notice, .authoring-knowledge__error { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 10px; padding: 9px 10px; border: 0; border-radius: 12px; background: var(--archive-paper); color: var(--text-secondary); font-size: 13px; text-align: start; }
.authoring-knowledge__notice { cursor: pointer; }
.authoring-knowledge__notice small, .authoring-knowledge__error button { border: 0; background: transparent; color: var(--accent-primary, var(--accent)); cursor: pointer; }
.authoring-knowledge__no-results { margin-top: 20vh; color: var(--text-secondary); text-align: center; }
.authoring-knowledge__persistence-error { margin: 12px 0 0; color: var(--signal-warm); font-size: 13px; line-height: 1.6; }
.authoring-knowledge__composer { position: relative; z-index: 1; flex: none; padding: 10px var(--assistant-gutter) 16px; background: var(--surface-assistant); }
.authoring-knowledge__composer:has(.authoring-knowledge__tools[open]) { padding-bottom: calc(16px + var(--reference-menu-height, 144px) + 8px); }
.authoring-knowledge__tools > .authoring-knowledge__tool-menu.is-below { top: calc(100% + 8px); box-sizing: border-box; }
.authoring-knowledge__input-row { position: relative; box-sizing: border-box; display: flex; min-height: var(--assistant-input-min-height); flex-direction: column; align-items: stretch; gap: 12px; padding: var(--assistant-input-padding); border: 1px solid var(--hairline-soft); border-radius: var(--assistant-input-radius); background: var(--surface-workbench-input); box-shadow: var(--shadow-workbench); }
.authoring-knowledge__input-row:focus-within { outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent); outline-offset: 1px; border-color: transparent; }
.authoring-knowledge__input-row textarea { display: block; box-sizing: border-box; flex: none; width: 100%; min-width: 0; min-height: 28px; max-height: 160px; resize: none; border: 0; outline: 0; padding: 0 4px; background: transparent; color: var(--text-primary); font: 15px/28px var(--font-interface, var(--font-sans)); }
.authoring-knowledge__composer-actions { display: flex; min-width: 0; align-items: center; gap: 6px; }
.authoring-knowledge__input-row textarea::placeholder { color: var(--text-muted); opacity: 1; }
.authoring-knowledge__tools { position: relative; flex: none; }
.authoring-knowledge__purpose { position: relative; min-width: 0; flex: 0 1 auto; margin-inline-start: auto; }
.authoring-knowledge__tools summary { display: grid; width: var(--workspace-control-height, 36px); height: var(--workspace-control-height, 36px); place-items: center; border-radius: var(--workspace-radius, 10px); color: var(--text-secondary); cursor: pointer; list-style: none; }
.authoring-knowledge__tools summary::-webkit-details-marker, .authoring-knowledge__purpose summary::-webkit-details-marker { display: none; }
.authoring-knowledge__tools[open] summary, .authoring-knowledge__tools summary:hover { background: var(--surface-workbench-muted); color: var(--archive-ink); }
.authoring-knowledge__purpose summary { display: flex; min-width: 0; min-height: var(--workspace-control-height, 36px); box-sizing: border-box; align-items: center; gap: 7px; padding: 4px 9px; border-radius: var(--workspace-radius, 10px); color: var(--text-secondary); font: 13px/1.4 var(--font-interface, var(--font-sans)); white-space: nowrap; cursor: pointer; list-style: none; }
.authoring-knowledge__purpose summary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.authoring-knowledge__purpose summary > svg { flex: none; }
.authoring-knowledge__purpose summary:hover, .authoring-knowledge__purpose[open] summary { background: var(--nav-hover); color: var(--text-primary); }
.authoring-knowledge__tool-menu { position: absolute; z-index: 5; inset-inline-start: 0; bottom: calc(100% + 14px); width: 210px; max-width: calc(100vw - 40px); overflow-y: auto; overscroll-behavior: contain; padding: 6px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover, 16px); background: var(--surface-workbench-overlay, var(--surface-workbench-raised)); box-shadow: var(--shadow-workbench-float); }
.authoring-knowledge__tool-menu.is-below { top: calc(100% + 14px); bottom: auto; }
.authoring-knowledge__purpose-menu { inset-inline-start: auto; inset-inline-end: 0; width: 250px; }
.authoring-knowledge__tool-menu button { display: flex; width: 100%; min-height: 42px; align-items: center; gap: 12px; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; color: var(--archive-ink); font: 14px/1.5 var(--font-interface, var(--font-sans)); text-align: start; cursor: pointer; }
.authoring-knowledge__tool-menu button small { display: block; margin-top: 3px; color: var(--text-muted); font-size: 12px; }
.authoring-knowledge__purpose-menu.is-compact { padding: 4px; }
.authoring-knowledge__purpose-menu.is-compact button small { display: none; }
.authoring-knowledge__tool-menu button:hover { background: var(--nav-hover); }
.authoring-knowledge__tool-menu button[aria-pressed="true"] { background: var(--nav-selected-secondary, var(--nav-selected)); color: var(--text-primary); }
.authoring-knowledge__tool-menu button > svg { flex: none; }
.authoring-knowledge__tool-menu button:disabled { opacity: .45; cursor: default; }
.authoring-knowledge__send { display: grid; flex: none; width: var(--workspace-control-height, 36px); height: var(--workspace-control-height, 36px); margin-inline-start: 0; place-items: center; border: 0; border-radius: 50%; background: var(--text-primary); color: var(--surface-assistant); cursor: pointer; }
.authoring-knowledge__send:hover:not(:disabled) { background: var(--accent); color: var(--bg-primary); }
.authoring-knowledge__send:disabled { background: var(--nav-hover); color: var(--text-muted); cursor: default; }
.authoring-knowledge__send.is-cancel { background: var(--text-secondary); }
.authoring-knowledge button:focus-visible, .authoring-knowledge summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.authoring-knowledge__context { display: flex; flex: 1 1 0; align-items: center; gap: 8px; min-width: 0; margin: 0 4px; color: var(--text-muted); font: 12px/1.5 var(--font-interface, var(--font-sans)); }
.authoring-knowledge__context button { display: inline-flex; flex: 0 1 auto; min-width: 0; align-items: center; gap: 6px; padding: 2px 0; border: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.authoring-knowledge__context button span { overflow: hidden; max-width: min(380px, 100%); text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__context button > svg { flex: none; }
.authoring-knowledge__context > span { flex: none; }
.authoring-knowledge.is-expanded .authoring-knowledge__thread { padding-block: 24px 36px; }
.authoring-knowledge.is-expanded .authoring-knowledge__toolbar { min-height: 48px; padding-inline: var(--assistant-gutter); border-bottom: 0; }
.authoring-knowledge.is-expanded .authoring-knowledge__model strong { display: none; }
.authoring-knowledge.is-expanded .authoring-knowledge__composer { padding-block: 12px 16px; }
.authoring-knowledge.is-expanded { --assistant-gutter: max(32px, calc((100% - var(--assistant-reading-width)) / 2)); --assistant-input-padding: 16px 18px 12px; --assistant-input-radius: 24px; --assistant-input-min-height: 108px; --assistant-answer-size: 16px; --assistant-intro-size: clamp(28px, 2.8vw, 34px); }
.authoring-knowledge.is-expanded .authoring-knowledge__input-row textarea { font-size: 16px; }
.authoring-knowledge.is-expanded .authoring-knowledge__question { margin-bottom: 28px; padding: 11px 18px; }
.authoring-knowledge.is-starting .authoring-knowledge__body { box-sizing: border-box; overflow-y: auto; justify-content: safe center; padding: 32px 18px 64px; }
.authoring-knowledge.is-expanded.is-starting { background: var(--surface-assistant); }
.authoring-knowledge.is-expanded.is-starting .authoring-knowledge__body { padding: 40px 32px clamp(64px, 12vh, 110px); }
.authoring-knowledge__intro { width: 100%; max-width: var(--assistant-reading-width); flex: none; margin: 0 auto 32px; text-align: center; }
.authoring-knowledge__intro h3 { margin: 0; color: var(--archive-ink); font: 500 var(--assistant-intro-size, 21px)/1.45 var(--font-interface, var(--font-sans)); letter-spacing: -.025em; }
.authoring-knowledge.is-starting:not(.is-expanded) .authoring-knowledge__body { justify-content: flex-start; padding-inline: var(--assistant-gutter); padding-top: var(--assistant-start-offset, clamp(48px, 12vh, 120px)); }
.authoring-knowledge.is-starting:not(.is-expanded) .authoring-knowledge__intro { margin-bottom: 20px; }
.authoring-knowledge.is-starting:not(.is-expanded) .authoring-knowledge__intro h3 { line-height: 1.55; text-align: start; }
.authoring-knowledge.is-starting .authoring-knowledge__thread { width: 100%; max-width: var(--assistant-reading-width); flex: none; margin-inline: auto; padding: 0; overflow: visible; }
.authoring-knowledge.is-starting .authoring-knowledge__thread:empty { display: none; }
.authoring-knowledge.is-starting .authoring-knowledge__composer { width: 100%; max-width: var(--assistant-reading-width); margin-inline: auto; padding: 0; background: transparent; }
.authoring-knowledge.is-expanded.is-starting .authoring-knowledge__input-row { background: color-mix(in srgb, var(--accent) 3%, var(--surface-workbench-input)); box-shadow: var(--shadow-workbench), 0 8px 36px color-mix(in srgb, var(--accent) 7%, transparent); }
.authoring-knowledge__start-options { width: 100%; max-width: var(--assistant-reading-width); flex: none; margin: 22px auto 0; }
.authoring-knowledge__prompt-list { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
.authoring-knowledge__prompt-list button { display: inline-flex; min-height: var(--workspace-control-height, 36px); align-items: center; gap: 7px; padding: 7px 13px; border: 1px solid var(--hairline-soft); border-radius: 999px; background: transparent; color: var(--text-secondary); font: 13px/1.5 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-knowledge__prompt-list button:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-knowledge.is-starting:not(.is-expanded) .authoring-knowledge__prompt-list { justify-content: flex-start; gap: 8px; }
.authoring-knowledge:not(.is-expanded) .authoring-knowledge__context > span { display: none; }
.authoring-knowledge:not(.is-expanded) .authoring-knowledge__purpose { position: static; }
.authoring-knowledge:not(.is-expanded) .authoring-knowledge__purpose-menu { inset-inline-end: 12px; max-width: calc(100% - 24px); }
@keyframes knowledge-pulse { to { opacity: .28; transform: scale(.72); } }
@media (pointer: coarse) {
  .authoring-knowledge__toolbar-actions button { width: 44px; min-width: 44px; height: 44px; min-height: 44px; }
  .authoring-knowledge__search button, .authoring-knowledge__history button, .authoring-knowledge__toolbar-actions button, .authoring-knowledge__tool-menu button, .authoring-knowledge__evidence-list button, .authoring-knowledge__context button, .authoring-knowledge__prompt-list button { min-height: 44px; }
  .authoring-knowledge__purpose summary { min-height: 44px; }
  .authoring-knowledge__send, .authoring-knowledge__tools summary { width: 44px; height: 44px; }
}
@media (max-width: 720px) {
  .authoring-knowledge__toolbar-actions button { width: 44px; min-width: 44px; height: 44px; min-height: 44px; }
  .authoring-knowledge__search button, .authoring-knowledge__history button, .authoring-knowledge__toolbar-actions button, .authoring-knowledge__tool-menu button, .authoring-knowledge__evidence-list button, .authoring-knowledge__context button, .authoring-knowledge__prompt-list button { min-height: 44px; }
  .authoring-knowledge__send, .authoring-knowledge__tools summary { width: 44px; height: 44px; }
  .authoring-knowledge__purpose summary { min-height: 44px; }
  .authoring-knowledge.is-expanded { --assistant-gutter: 16px; --assistant-input-padding: 14px 12px 10px; --assistant-input-radius: 22px; }
  .authoring-knowledge.is-expanded .authoring-knowledge__thread { padding-block: 16px 24px; }
  .authoring-knowledge.is-expanded .authoring-knowledge__toolbar { padding-inline: 16px; }
  .authoring-knowledge.is-expanded .authoring-knowledge__composer { padding: 10px 16px max(16px, env(safe-area-inset-bottom)); }
  .authoring-knowledge__composer-actions { flex-wrap: wrap; gap: 4px 6px; }
  .authoring-knowledge__context { order: -1; flex: 1 0 calc(100% - 8px); }
  .authoring-knowledge.is-expanded .authoring-knowledge__purpose, .authoring-knowledge:not(.is-expanded) .authoring-knowledge__purpose { position: static; flex: 1 1 0; margin-inline-start: 0; }
  .authoring-knowledge__purpose summary { width: fit-content; max-width: 100%; }
  .authoring-knowledge .authoring-knowledge__purpose-menu { inset-inline-end: 12px; max-width: calc(100% - 24px); }
  .authoring-knowledge.is-expanded.is-starting .authoring-knowledge__body { padding: 32px 18px 48px; }
  .authoring-knowledge__intro { margin-bottom: 30px; }
  .authoring-knowledge__intro h3 { font-size: 28px; }
  .authoring-knowledge__context > span { display: none; }
  .authoring-knowledge__start-options { margin-top: 12px; }
}
@media (prefers-reduced-motion: no-preference) {
  .authoring-knowledge__send, .authoring-knowledge__purpose summary, .authoring-knowledge__tools summary, .authoring-knowledge__prompt-list button { transition: background-color 140ms ease, color 140ms ease; }
}
@media (forced-colors: active) {
  .authoring-knowledge__input-row, .authoring-knowledge__question, .authoring-knowledge__evidence-list button, .authoring-knowledge__tool-menu, .authoring-knowledge__history { border: 1px solid CanvasText; }
  .authoring-knowledge__send { border: 1px solid ButtonText; }
}
@media (prefers-reduced-motion: reduce) {
  .authoring-knowledge__thinking span { animation: none; }
}
.authoring-knowledge__agent-detail { margin: 10px 0; color: var(--text-muted); font-size: 12px; }
.authoring-knowledge__agent-detail summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; gap: 5px; }
.authoring-knowledge__agent-detail[open] summary svg { transform: rotate(180deg); }
.authoring-knowledge__agent-detail p { white-space: pre-wrap; max-height: 180px; overflow: auto; font-size: 12px; line-height: 1.7; }
.authoring-knowledge__agent-adopt { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px; padding: 7px 12px; min-height: 36px; border: 1px solid var(--hairline-soft); border-radius: var(--workspace-radius, 10px); background: var(--nav-primary-selected); color: var(--accent); font: 500 13px/1.5 var(--font-interface); cursor: pointer; }
.authoring-knowledge__agent-adopt:hover:not(:disabled) { background: var(--nav-focused); }
.authoring-knowledge__agent-adopt:disabled { opacity: .5; cursor: default; }
.authoring-knowledge__agent-adopt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px) { .authoring-knowledge__agent-adopt { min-height: 44px; } }
.authoring-knowledge__input-row { position: relative; }
.authoring-knowledge__mentions { position: absolute; z-index: 9; left: 0; bottom: calc(100% + 6px); width: min(300px, 100%); max-height: 260px; overflow: auto; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover); background: var(--surface-workbench-overlay); box-shadow: var(--shadow-workbench-float); }
.authoring-knowledge__mentions button { display: block; width: 100%; min-height: 36px; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary); font: 13px/1.5 var(--font-interface, var(--font-sans)); text-align: start; cursor: pointer; }
.authoring-knowledge__mentions button[aria-selected="true"] { background: var(--nav-selected); color: var(--text-primary); }
@media (max-width: 720px) { .authoring-knowledge__mentions button { min-height: 44px; } }
</style>

<style scoped>
.authoring-knowledge__toolbar-actions button:has(>span) { display: inline-flex; align-items: center; white-space: nowrap; width: auto; gap: 6px; padding: 0 8px; font: 12px/1.5 var(--font-interface); }
.assistant-document-context { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin: 0 4px 10px; color: var(--text-muted); font: 12px/1.5 var(--font-interface); }
.assistant-document-context button { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.assistant-conversation-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.authoring-knowledge__history .assistant-conversation-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; border-radius: 7px; }
.authoring-knowledge__history .assistant-conversation-row.is-active { background: var(--nav-selected); }
.authoring-knowledge__history .assistant-conversation-select { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; text-align: left; }
.assistant-conversation-select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.authoring-knowledge__history .assistant-conversation-delete { display: grid; place-items: center; width: 32px; min-width: 32px; padding: 6px; }
.authoring-knowledge__history .assistant-conversation-delete:hover { color: var(--signal-danger); }
.authoring-knowledge__tool-menu input { min-width: 0; margin: 8px 0; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: 6px; background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
@media(max-width:720px) { .authoring-knowledge__history .assistant-conversation-delete { width: 44px; min-width: 44px; } }
</style>
