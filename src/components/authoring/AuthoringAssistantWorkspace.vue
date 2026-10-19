<template>
  <section ref="workspaceRef" class="authoring-assistant-workspace" :class="{ 'is-expanded': expanded }" data-test="authoring-assistant-workspace" :data-expanded="expanded" :aria-label="tr('作品助手')" @focusin="markRead" @pointerdown="markRead">
    <header v-if="expanded" class="authoring-assistant-workspace__header">
        <button type="button" class="authoring-assistant-workspace__back" :aria-label="tr('返回工作台')" :title="tr('返回工作台')" @click="emit('collapse')"><WorkbenchIcon name="arrow-left" :size="17" /><span>{{ tr('返回工作台') }}</span></button>
        <div class="authoring-assistant-workspace__title"><strong :title="projectTitle || tr('未命名作品')">{{ projectTitle || tr('未命名作品') }}</strong><span>{{ tr('写作助手') }}</span></div>
    </header>

    <div class="authoring-assistant-workspace__body" :class="{ 'has-preview': preview }">
      <div class="authoring-assistant-workspace__conversation">
        <AuthoringKnowledgeAssistant
          ref="knowledgeRef"
          :project-id="projectId"
          :project-title="projectTitle"
          :document-title="documentTitle"
          :expanded="expanded"
          :empty-book="emptyBook"
          :review-workflow="reviewWorkflow"
          :assistant="assistant" :agent-state="state.agentState"
          :messages="state.messages"
          :draft="state.draft"
          :selected-intent="state.selectedIntent"
          :busy="state.busy"
          :error="state.error"
          :persistence-error="state.persistenceError"
          :notice="notice"
          @update:draft="updateDraft"
          @select-intent="assistant.selectIntent($event)"
          @ask="assistant.ask($event)"
          @cancel="assistant.cancel()"
          @retry="assistant.retry()"
          @open-evidence="previewEvidence"
          @review-notice="emit('review-notice')"
          @open-illustrator="emit('open-illustrator')"
          @direct-writing="emit('collapse')"
        >
          <template #workspace-actions>
            <div v-if="!expanded" class="authoring-assistant-workspace__inline-actions">
              <button type="button" class="authoring-assistant-workspace__expand" :aria-label="tr('完整助手')" :title="tr('完整助手')" @click="emit('expand')"><WorkbenchIcon name="canvas" :size="16" /><span>{{ tr('完整助手') }}</span></button>
              <button type="button" :disabled="sourcesBusy" :title="sourcesTitle" @click="emit('open-sources')"><WorkbenchIcon name="sources" :size="16" /><span>{{ tr('资料') }}</span></button>
            </div>
          </template>
        </AuthoringKnowledgeAssistant>
      </div>

      <aside v-if="preview" ref="previewRef" class="authoring-assistant-workspace__preview" :aria-label="tr('引用片段')">
        <header>
          <button type="button" class="authoring-assistant-workspace__preview-back" @click="closePreview"><WorkbenchIcon name="arrow-left" :size="16" />{{ tr('返回对话') }}</button>
          <strong>{{ tr('引用片段') }}</strong>
          <button type="button" class="authoring-assistant-workspace__preview-close" :aria-label="tr('关闭引用预览')" :title="tr('关闭引用预览')" @click="closePreview"><WorkbenchIcon name="close" :size="17" /></button>
        </header>
        <div class="authoring-assistant-workspace__preview-scroll">
          <small>{{ tr(authorityLabel(preview.authority)) }}</small>
          <h3>{{ preview.label }}</h3>
          <p v-if="preview.stale" class="authoring-assistant-workspace__stale" role="status">{{ tr('这条引用的来源已更新，打开原文后请核对。') }}</p>
          <blockquote>{{ preview.excerpt }}</blockquote>
          <button type="button" class="authoring-assistant-workspace__open-original" @click="openOriginal"><WorkbenchIcon name="document" :size="16" />{{ tr('打开原文') }}<WorkbenchIcon name="arrow-right" :size="15" /></button>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, unref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import AuthoringKnowledgeAssistant from './AuthoringKnowledgeAssistant.vue'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'

const contentWorkspace = useComposableWorkspace()

const props = defineProps({
  assistant: { type: Object, required: true },
  reviewWorkflow: { type: Object, default: null },
  projectTitle: { type: String, default: '' },
  documentTitle: { type: String, default: '' },
  projectId: { type: String, default: '' },
  emptyBook: Boolean,
  expanded: Boolean,
  notice: { type: Object, default: null }
})
const emit = defineEmits(['expand', 'collapse', 'open-evidence', 'open-settings', 'open-sources', 'review-notice', 'open-illustrator', 'select-surface', 'select-book'])
const knowledgeRef = ref(null)
const workspaceRef = ref(null)
const preview = ref(null)
const previewRef = ref(null)
let previewTrigger = null
const reviewBusy = computed(() => Boolean(unref(props.reviewWorkflow?.loading) || unref(props.reviewWorkflow?.rewrite?.loading)))
const sourcesBusy = computed(() => !contentWorkspace && (state.value.busy || reviewBusy.value))
const sourcesTitle = computed(() => contentWorkspace ? tr('在旁边打开资料') : reviewBusy.value ? tr('检查进行中，请先停止检查再打开资料') : state.value.busy ? tr('查询中，请完成或停止后打开资料') : tr('资料'))
const state = computed(() => ({
  sessions: unref(props.assistant.sessions) || [],
  agentState: unref(props.assistant.agentState) || {},
  messages: unref(props.assistant.messages) || [],
  draft: unref(props.assistant.draft) || '',
  selectedIntent: unref(props.assistant.selectedIntent) || 'free',
  busy: Boolean(unref(props.assistant.busy)),
  error: unref(props.assistant.error) || '',
  persistenceError: unref(props.assistant.persistenceError) || ''
}))

function markRead() {
  props.assistant.markRead?.()
}

function updateDraft(value) {
  props.assistant.updateDraft(value)
}

function previewEvidence(evidence, trigger) {
  if (!evidence || evidence.projectId !== props.projectId) return
  const answers = state.value.messages.map((message) => message.answer).filter(Boolean)
  const answer = answers.find((item) => item.evidence?.includes(evidence))
    || answers.slice().reverse().find((item) => item.evidence?.some((source) => source.sourceRef === evidence.sourceRef && source.revision === evidence.revision))
  preview.value = {
    ...evidence,
    stale: Boolean(answer?.staleSources?.some((source) => source.sourceRef === evidence.sourceRef))
  }
  previewTrigger = trigger || null
  nextTick(() => {
    if (!preview.value || preview.value.projectId !== props.projectId) return
    const back = previewRef.value?.querySelector('.authoring-assistant-workspace__preview-back')
    const control = back?.getClientRects().length ? back : previewRef.value?.querySelector('.authoring-assistant-workspace__preview-close')
    control?.focus({ preventScroll: true })
  })
  markRead()
}

function closePreview({ restoreFocus = true } = {}) {
  const wasOpen = Boolean(preview.value)
  const trigger = previewTrigger
  preview.value = null
  previewTrigger = null
  if (wasOpen && restoreFocus) nextTick(() => {
    if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true })
    else knowledgeRef.value?.focusDraft()
  })
}

function openOriginal() {
  if (!preview.value || preview.value.projectId !== props.projectId) return
  emit('open-evidence', preview.value)
}

function authorityLabel(authority) {
  return ({ manuscript: '正文', worldbook: '世界设定', outline: '大纲意图', history: '历史', scene: '当前', memory: '相关记忆', suggestion: '速记' })[authority] || '项目资料'
}

watch(() => props.projectId, () => closePreview({ restoreFocus: false }))
watch(() => props.expanded, (expanded) => {
  if (expanded) markRead()
})
watch(() => state.value.messages.length, (length) => {
  if (!length) closePreview()
  nextTick(() => {
    if (workspaceRef.value?.getClientRects().length) markRead()
  })
})
watch(() => state.value.messages, (messages) => {
  if (!preview.value) return
  const source = preview.value
  const answer = messages.map(message => message.answer).find(answer => answer?.evidence?.some(evidence => evidence.sourceRef === source.sourceRef && evidence.revision === source.revision))
  if (!answer) closePreview()
  else preview.value = { ...source, stale: Boolean(answer.staleSources?.some(evidence => evidence.sourceRef === source.sourceRef)) }
})
</script>

<style scoped>
.authoring-assistant-workspace { display: flex; min-width: 0; min-height: 0; height: 100%; flex-direction: column; background: var(--surface-assistant); color: var(--text-primary); font-family: var(--font-interface, var(--font-sans)); }
.authoring-assistant-workspace__header { display: flex; min-height: 52px; box-sizing: border-box; flex: none; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 0; background: var(--surface-workbench-muted); }
.authoring-assistant-workspace__header button, .authoring-assistant-workspace__preview header button { display: inline-flex; min-width: var(--workspace-control-height, 36px); min-height: var(--workspace-control-height, 36px); align-items: center; justify-content: center; gap: 7px; padding: 4px 10px; border: 0; border-radius: var(--workspace-radius, 10px); background: transparent; color: var(--text-secondary); font: 14px/1.5 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-assistant-workspace button:disabled { opacity: .5; cursor: default; }
.authoring-assistant-workspace button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.authoring-assistant-workspace__inline-actions { display: flex; align-items: center; gap: 4px; }
.authoring-assistant-workspace__inline-actions button { display: inline-flex; min-height: var(--workspace-control-height, 36px); align-items: center; gap: 7px; padding: 5px 9px; border: 0; border-radius: var(--workspace-radius, 10px); background: transparent; color: var(--text-secondary); font: 14px/1.5 var(--font-interface, var(--font-sans)); white-space: nowrap; cursor: pointer; }
.authoring-assistant-workspace__title { display: flex; min-width: 0; align-items: center; gap: 14px; }
.authoring-assistant-workspace__title strong { overflow: hidden; color: var(--text-primary); font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.authoring-assistant-workspace__title span { flex: none; color: var(--text-muted); font-size: 12px; }
.authoring-assistant-workspace__title span:only-child { color: var(--text-secondary); font-size: 14px; }
.authoring-assistant-workspace__body { position: relative; display: grid; min-width: 0; min-height: 0; flex: 1; grid-template-columns: minmax(0, 1fr); background: var(--surface-assistant-nav); }
.authoring-assistant-workspace__conversation { min-width: 0; min-height: 0; overflow: hidden; background: var(--surface-assistant); }
.authoring-assistant-workspace__body.has-preview { grid-template-columns: minmax(0, 1fr) minmax(260px, 30%); }
.authoring-assistant-workspace:not(.is-expanded) .authoring-assistant-workspace__body.has-preview { grid-template-columns: minmax(0, 1fr); }
.authoring-assistant-workspace:not(.is-expanded) .has-preview .authoring-assistant-workspace__conversation { display: none; }
.authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__header { min-height: 52px; padding-inline: 18px; border-bottom: 0; }
.authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__conversation { margin: 0; border: 0; border-radius: 0; }
.authoring-assistant-workspace__preview { display: flex; min-width: 0; min-height: 0; flex-direction: column; border-inline-start: 1px solid var(--hairline-soft); background: var(--surface-assistant); }
.authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__preview { margin: 0; border: 0; border-inline-start: 1px solid var(--hairline-soft); border-radius: 0; overflow: hidden; }
.authoring-assistant-workspace__preview header { display: flex; min-height: 52px; box-sizing: border-box; flex: none; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 0; }
.authoring-assistant-workspace__preview header > strong { font: 500 14px/1.5 var(--font-interface, var(--font-sans)); }
.authoring-assistant-workspace__preview-close { margin-inline-start: auto; }
.authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__preview-back { display: none; }
.authoring-assistant-workspace:not(.is-expanded) .authoring-assistant-workspace__preview header > strong { display: none; }
.authoring-assistant-workspace__preview-scroll { min-height: 0; overflow-y: auto; padding: 22px 18px; }
.authoring-assistant-workspace__preview-scroll > small { color: var(--text-secondary); font-size: 12px; }
.authoring-assistant-workspace__preview-scroll h3 { margin: 8px 0 18px; font: 500 18px/1.5 var(--font-interface, var(--font-sans)); overflow-wrap: anywhere; }
.authoring-assistant-workspace__preview-scroll blockquote { margin: 0; white-space: pre-wrap; font: 14px/1.85 var(--font-interface, var(--font-sans)); overflow-wrap: anywhere; }
.authoring-assistant-workspace__preview-scroll .authoring-assistant-workspace__open-original { display: inline-flex; min-height: 36px; align-items: center; gap: 6px; margin-top: 24px; padding: 6px 0; border: 0; background: transparent; color: var(--accent); font: 14px/1.5 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-assistant-workspace__stale { margin: 0 0 16px; color: var(--signal-warm); font-size: 13px; line-height: 1.6; }

@media (max-width: 720px) {
  .authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__header { min-height: 54px; gap: 4px; padding-inline: 8px; }
  .authoring-assistant-workspace__header button, .authoring-assistant-workspace__preview header button { min-width: 44px; }
  .authoring-assistant-workspace.is-expanded .has-preview .authoring-assistant-workspace__conversation { display: none; }
  .authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__preview-back { display: inline-flex; }
  .authoring-assistant-workspace__preview header > strong { display: none; }
  .authoring-assistant-workspace__preview { border-inline-start: 0; }
  .authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__conversation, .authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__preview { margin: 0; border-radius: 0; }
  .authoring-assistant-workspace__title { flex: 1; }
  .authoring-assistant-workspace__title span { display: none; }
  .authoring-assistant-workspace__title strong { font-size: 14px; }
  .authoring-assistant-workspace__back span { display: none; }
}

/* Keep the compact toolbar on one row at 320px, including English labels. */
@media (max-width: 360px) {
  .authoring-assistant-workspace__inline-actions .authoring-assistant-workspace__expand { min-width: 44px; justify-content: center; }
  .authoring-assistant-workspace__expand span { display: none; }
}


@media (max-width: 720px) {
  .authoring-assistant-workspace.is-expanded .authoring-assistant-workspace__body.has-preview { grid-template-columns: minmax(0, 1fr); }
  .authoring-assistant-workspace__header button, .authoring-assistant-workspace__preview header button, .authoring-assistant-workspace__inline-actions button { min-height: 44px; }
}
</style>
