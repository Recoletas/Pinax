<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="authoring-illustrator-layer"
      data-test="authoring-illustrator-layer"
      @pointerdown.self="requestClose"
    >
      <section
        ref="dialogRef"
        class="authoring-illustrator"
        role="dialog"
        aria-modal="true"
        aria-labelledby="authoring-illustrator-title"
        @keydown="handleDialogKeydown"
      >
      <header class="authoring-illustrator__head">
        <div class="authoring-illustrator__identity">
          <WorkbenchIcon name="palette" :size="18" />
          <div>
            <h2 id="authoring-illustrator-title">画师</h2>
            <p>{{ sourceLabel }}</p>
          </div>
        </div>
        <div class="authoring-illustrator__head-actions">
          <span v-if="freshness?.stale" class="authoring-illustrator__stale" role="status">来源已更新</span>
          <button ref="closeButtonRef" type="button" aria-label="关闭画师" title="关闭画师" @click="requestClose">
            <WorkbenchIcon name="close" :size="18" />
          </button>
        </div>
      </header>

      <WorkspacePaneSwitch
        v-if="compact"
        v-model="mobilePane"
        class="authoring-illustrator__switch"
        :items="mobilePaneItems"
        label="画师工作区"
        :breakpoint="1100"
      />

      <div class="authoring-illustrator__body">
        <ImageGenerationWorkbench
          :storage-key="storageKey"
          layout="split"
          :mobile-pane="compact ? mobilePane : 'both'"
          :initial-prompt="initialPrompt"
          :prompt-supplement="generationPromptSupplement"
          :selected-text="initialPrompt"
          :selected-prompt-label="brief?.promptSource?.kind === 'selection' ? '选中文字' : '当前文本块'"
          :source-title="sourceLabel"
          :show-header="false"
          :allow-insert-image-to-editor="true"
          media-purpose="illustration"
          :modes="['illustration']"
          default-mode="illustration"
          :project-id="brief?.projectId || brief?.source?.projectId || null"
          :source-refs="mediaSourceRefs"
          :library-source-refs="[]"
          :reference-candidates="referenceCandidates"
          :context-key="String(brief?.sessionId || brief?.fingerprint || '')"
          :generation-context="generationContext"
          :action-guard="guardResultAction"
          @insert-image="emit('insert-image', $event)"
          @save-to-material="emit('save-to-material', $event)"
          @image-preview="emit('image-preview', $event)"
          @generation-start="emit('generation-start', $event)"
          @generation-complete="emit('generation-complete', $event)"
          @generation-error="emit('generation-error', $event)"
          @generation-cancel="emit('generation-cancel', $event)"
        >
          <template #brief>
            <section class="authoring-illustrator__brief" aria-label="画面来源">
              <div class="authoring-illustrator__brief-title">
                <span>{{ promptSourceLabel }}</span>
                <small>已冻结</small>
              </div>
              <p class="authoring-illustrator__excerpt">{{ sourceExcerpt }}</p>
            </section>

            <section v-if="sceneSources.length" class="authoring-illustrator__scene" aria-label="当前场参考">
              <div class="authoring-illustrator__section-title">
                <span>当前场</span>
                <small>按需加入画面</small>
              </div>
              <label v-for="source in sceneSources" :key="source.id" class="authoring-illustrator__scene-row">
                <input
                  type="checkbox"
                  :disabled="source.available === false"
                  :checked="selectedSceneSourceIds.includes(source.id)"
                  @change="toggleSceneSource(source.id)"
                />
                <span><strong>{{ source.label }}</strong><small>{{ source.available === false ? '设定来源未绑定' : (source.summary || source.kindLabel) }}</small></span>
              </label>
            </section>

            <p v-if="notice" class="authoring-illustrator__notice" role="status">{{ notice }}</p>
            <p v-if="freshness?.stale" class="authoring-illustrator__notice is-warning" role="alert">
              正文或设定已更新。候选仍可查看和保存为素材，但不能插入原章节。
            </p>
          </template>
        </ImageGenerationWorkbench>
      </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import WorkspacePaneSwitch from '../workbench/WorkspacePaneSwitch.vue'
import ImageGenerationWorkbench from '../media/ImageGenerationWorkbench.vue'

const props = defineProps({
  open: Boolean,
  storageKey: { type: String, required: true },
  brief: { type: Object, default: null },
  generationBrief: { type: Object, default: null },
  freshness: { type: Object, default: () => ({ fresh: false, stale: true, reasons: ['source-missing'] }) },
  selectedSceneSourceIds: { type: Array, default: () => [] },
  referenceCandidates: { type: Array, default: () => [] },
  notice: { type: String, default: '' }
})

const emit = defineEmits([
  'close',
  'update:selectedSceneSourceIds',
  'insert-image',
  'save-to-material',
  'image-preview',
  'generation-start',
  'generation-complete',
  'generation-error',
  'generation-cancel'
])

const dialogRef = ref(null)
const closeButtonRef = ref(null)
const compact = ref(false)
const mobilePane = ref('parameters')
const mobilePaneItems = Object.freeze([
  { value: 'parameters', label: '画面与参数' },
  { value: 'results', label: '候选与历史' }
])
let viewportCleanup = null
let appWasInert = false

const promptSourceLabel = computed(() => (
  props.brief?.promptSource?.kind === 'selection' ? '选中文字' : '当前文本块'
))
const initialPrompt = computed(() => String(
  props.brief?.promptSource?.text
    || props.brief?.proseExcerpt
    || props.generationBrief?.prompt
    || ''
).trim())
const sourceExcerpt = computed(() => {
  const value = initialPrompt.value.replace(/\s+/g, ' ')
  if (!value) return '当前落笔处没有可用文字，请在画面描述中补充。'
  return value.length > 180 ? `${value.slice(0, 180)}…` : value
})
const sourceLabel = computed(() => String(
  props.brief?.source?.title
    || props.brief?.target?.title
    || props.brief?.title
    || '当前落笔处'
))
const sceneSources = computed(() => (Array.isArray(props.brief?.scene?.sources) ? props.brief.scene.sources : []).map((source) => ({
  ...source,
  id: String(source?.id || source?.sourceRef || ''),
  label: String(source?.label || source?.name || '未命名参考'),
  summary: String(source?.summary || source?.excerpt || ''),
  kindLabel: ({ character: '人物', location: '地点', time: '时间' })[source?.kind] || '场景'
})).filter((source) => source.id))
const generationContext = computed(() => ({
  sessionId: String(props.brief?.sessionId || ''),
  fingerprint: String(props.generationBrief?.fingerprint || props.brief?.fingerprint || ''),
  sourceRevisions: props.generationBrief?.sourceRevisions || props.brief?.sourceRevisions || {},
  authoringVisualBrief: props.generationBrief || props.brief || null
}))
const generationPromptSupplement = computed(() => (props.generationBrief?.selectedSceneSources || []).map((source) => {
  const prefix = source?.kind === 'character' ? '人物' : (source?.kind === 'location' ? '地点' : '时间')
  return `${prefix}：${source?.label || ''}${source?.summary ? `（${source.summary}）` : ''}`
}).filter(Boolean).join('\n'))
const mediaSourceRefs = computed(() => {
  const projectId = String(props.brief?.projectId || props.brief?.source?.projectId || '')
  const revisions = props.generationBrief?.sourceRevisions || props.brief?.sourceRevisions || {}
  return (props.generationBrief?.sourceRefs || props.brief?.sourceRefs || []).map((ref) => {
    if (ref && typeof ref === 'object') return ref
    const value = String(ref || '')
    const separator = value.indexOf(':')
    if (separator <= 0 || separator >= value.length - 1) return null
    return {
      refType: value.slice(0, separator),
      refId: value.slice(separator + 1),
      projectId,
      version: String(revisions[value] || '')
    }
  }).filter(Boolean)
})

function toggleSceneSource(sourceId) {
  const id = String(sourceId || '')
  const selected = new Set(props.selectedSceneSourceIds.map(String))
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  emit('update:selectedSceneSourceIds', [...selected])
}

function guardResultAction(entry = {}) {
  const entryBrief = entry?.generationContext?.authoringVisualBrief
    || entry?.authoringVisualBrief
    || entry?.generationParams?.authoringVisualBrief
    || null
  if (!entryBrief || String(entryBrief.fingerprint || '') !== String(props.generationBrief?.fingerprint || '')) {
    return { insertDisabled: true, insertReason: '旧候选没有当前落笔位置，不能插入' }
  }
  if (props.freshness?.fresh === true && props.freshness?.stale !== true) return {}
  return {
    insertDisabled: true,
    insertReason: props.freshness?.detached ? '原章节已切换，不能插入' : '来源已更新，不能插入'
  }
}

function requestClose() {
  emit('close')
}

function setApplicationInert(active) {
  const application = document.getElementById('app')
  if (!application) return
  if (active) {
    appWasInert = application.inert === true
    application.inert = true
    return
  }
  if (!appWasInert) application.inert = false
  appWasInert = false
}

function focusableElements() {
  return [...(dialogRef.value?.querySelectorAll?.(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || [])].filter((element) => !element.closest('[hidden]') && element.offsetParent !== null)
}

function handleDialogKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.open, (open) => {
  setApplicationInert(open)
  if (!open) return
  mobilePane.value = 'parameters'
  nextTick(() => closeButtonRef.value?.focus())
})

onMounted(() => {
  const query = window.matchMedia?.('(max-width: 720px), (max-height: 560px)')
  const sync = () => { compact.value = Boolean(query?.matches) }
  sync()
  query?.addEventListener?.('change', sync)
  viewportCleanup = () => query?.removeEventListener?.('change', sync)
})

onBeforeUnmount(() => {
  setApplicationInert(false)
  viewportCleanup?.()
})
</script>

<style scoped>
.authoring-illustrator-layer {
  position: fixed;
  z-index: var(--z-modal, 300);
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #122033 22%, transparent);
  backdrop-filter: blur(1.5px);
}

.authoring-illustrator {
  display: flex;
  width: min(920px, 72vw);
  min-width: 0;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border-inline-start: 1px solid var(--authoring-hairline, var(--border-subtle));
  background: var(--surface-workbench-raised, var(--bg-primary));
  box-shadow: -22px 0 54px color-mix(in srgb, #0c1724 20%, transparent);
  color: var(--text-primary);
}

.authoring-illustrator__head {
  display: flex;
  min-height: 58px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 18px;
  border-bottom: 1px solid var(--authoring-hairline, var(--border-subtle));
  background: var(--surface-workbench-raised, var(--bg-primary));
}

.authoring-illustrator__identity,
.authoring-illustrator__head-actions { display: flex; min-width: 0; align-items: center; gap: 10px; }
.authoring-illustrator__identity > svg { flex: none; color: var(--accent-primary); }
.authoring-illustrator__identity h2 { margin: 0; font-size: 16px; font-weight: 650; }
.authoring-illustrator__identity p { max-width: 36vw; margin: 2px 0 0; overflow: hidden; color: var(--text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-illustrator__head-actions > button { display: grid; width: 36px; height: 36px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-illustrator__head-actions > button:hover { background: var(--surface-hover); color: var(--text-primary); }
.authoring-illustrator__stale { color: var(--signal-warning, #9a641b); font-size: 11px; }

.authoring-illustrator__body { min-width: 0; min-height: 0; flex: 1 1 auto; overflow: hidden; }
.authoring-illustrator__body :deep(.media-generation-inline) { height: 100%; }
.authoring-illustrator__body :deep(.image-generation-workbench) { height: 100%; }

.authoring-illustrator__brief,
.authoring-illustrator__scene { padding-bottom: 14px; border-bottom: 1px solid var(--authoring-hairline, var(--border-subtle)); }
.authoring-illustrator__scene { padding-top: 14px; }
.authoring-illustrator__brief-title,
.authoring-illustrator__section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.authoring-illustrator__brief-title span,
.authoring-illustrator__section-title span { font-size: 12px; font-weight: 650; }
.authoring-illustrator__brief-title small,
.authoring-illustrator__section-title small { color: var(--text-secondary); font-size: 10px; }
.authoring-illustrator__excerpt { margin: 8px 0 0; color: var(--text-secondary); font-family: var(--font-writing); font-size: 13px; line-height: 1.75; }
.authoring-illustrator__scene-row { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 8px; padding: 8px 0; cursor: pointer; }
.authoring-illustrator__scene-row + .authoring-illustrator__scene-row { border-top: 1px solid color-mix(in srgb, var(--authoring-hairline, var(--border-subtle)) 62%, transparent); }
.authoring-illustrator__scene-row input { margin: 3px 0 0; accent-color: var(--accent-primary); }
.authoring-illustrator__scene-row span { display: grid; min-width: 0; gap: 2px; }
.authoring-illustrator__scene-row strong { font-size: 12px; font-weight: 580; }
.authoring-illustrator__scene-row small { overflow: hidden; color: var(--text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-illustrator__notice { margin: 10px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 1.55; }
.authoring-illustrator__notice.is-warning { color: var(--signal-warning, #9a641b); }

@media (max-width: 1024px) and (min-width: 721px) {
  .authoring-illustrator { width: 72vw; }
}

@media (max-width: 720px), (max-height: 560px) {
  .authoring-illustrator-layer { position: fixed; inset: 0; background: var(--surface-workbench-raised, var(--bg-primary)); backdrop-filter: none; }
  .authoring-illustrator { width: 100%; height: 100%; border: 0; box-shadow: none; }
  .authoring-illustrator__head { min-height: 54px; padding-top: env(safe-area-inset-top); }
  .authoring-illustrator__identity p { max-width: 230px; }
  .authoring-illustrator__head-actions > button { width: 44px; height: 44px; }
  .authoring-illustrator__switch :deep(.workspace-pane-switch) { min-height: 52px; }
  .authoring-illustrator__switch :deep(button) { min-height: 44px; }
  .authoring-illustrator__body { padding-bottom: env(safe-area-inset-bottom); overflow-x: hidden; }
  .authoring-illustrator__scene-row { min-height: 44px; align-items: center; }
}

@media (prefers-reduced-motion: reduce) {
  .authoring-illustrator-layer,
  .authoring-illustrator { transition: none !important; }
}
</style>
