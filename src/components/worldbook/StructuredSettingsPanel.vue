<template>
  <section class="structured-settings-panel" :class="{ 'is-continuous': !isKao }">
    <div class="section-workbench">
      <aside class="section-rail">
        <div class="panel-lead">
          <div>
            <span class="panel-kicker">CURRENT SECTION</span>
            <h2>{{ activeSection.label }}</h2>
            <p>{{ activeSection.description }}</p>
          </div>
          <div class="panel-summary" aria-label="当前分区状态">
            <span>{{ activeSection.fields.length }} 项</span>
            <span v-if="readyDraftCount > 0" class="draft-summary">{{ readyDraftCount }} 待审</span>
          </div>
        </div>

        <nav class="section-tabs" aria-label="结构化设定分区">
          <button
            v-for="section in sections"
            :key="section.key"
            :class="['section-tab', { active: activeSectionKey === section.key }]"
            @click="activeSectionKey = section.key"
          >
            <span>{{ section.label }}</span>
            <i aria-hidden="true"></i>
          </button>
        </nav>

        <div class="section-actions">
          <button
            type="button"
            class="section-ai-btn"
            :class="`is-${sectionGenState}`"
            :aria-label="`为「${activeSection.label}」批量生成 AI 草稿`"
            @click="onSectionAiClick"
          >
            <WorkbenchIcon name="sparkles" :size="15" />
            <span class="ai-btn-text">{{ sectionAiButtonText }}</span>
          </button>
          <button
            type="button"
            class="brief-toggle-btn"
            :aria-pressed="showBriefBar"
            :aria-label="showBriefBar ? '收起生成要求' : '补充生成要求'"
            @click="showBriefBar = !showBriefBar"
          >
            <WorkbenchIcon name="pencil" :size="14" />
            <span>{{ showBriefBar ? '收起要求' : '补充要求' }}</span>
          </button>
        </div>
      </aside>

      <div class="section-canvas">
        <div v-if="showBriefBar" class="brief-bar-wrapper">
          <GenerationBriefBar
            :model-value="sectionBrief"
            :section-key="activeSectionKey"
            @update:model-value="onBriefChange"
          />
        </div>

        <GenerationStatus
          v-if="sectionGenState !== 'idle'"
          :state="sectionGenState"
          :progress="sectionGenProgress"
          :phase="sectionGenPhase"
          :error="sectionGenError"
          :retry-label="sectionRetryLabel"
          @retry="retrySectionGen"
        />
        <div
          v-if="['partial', 'error', 'stale'].includes(sectionGenState) && sectionGenFailedFields.length"
          class="generation-failed-fields"
          role="status"
        >
          未通过校验：{{ failedFieldLabels }}。已生成内容仍保留在草稿中。
        </div>

        <div v-if="feedback" class="feedback-line">{{ feedback }}</div>

        <div class="settings-editor-layout" :class="{ 'has-review': focusedDraft }">
          <div class="fields-grid">
            <SettingFieldCard
              v-for="field in activeSection.fields"
              :ref="(el) => registerFieldRef(field, el)"
              :key="field.key"
              :worldbook-id="props.worldbook.id"
              :section="activeSection"
              :field="field"
              v-model="form[activeSectionKey][field.key]"
              :working="workingKey === `${activeSectionKey}.${field.key}`"
              :has-draft="hasDraftForField(field.key)"
              @generate="generateField"
              @saved="onFieldSaved"
            />
          </div>

          <PlaceCatalog
            v-if="activeSectionKey === 'world'"
            :worldbook="props.worldbook"
            @saved="onFieldSaved"
          />

          <SettingDraftReview
            v-if="focusedDraft"
            :draft="focusedDraft"
            :current-field-value="focusedDraftCurrentValue"
            :status="focusedDraftStatus"
            :revision-instruction="focusedDraft.revisionInstruction || ''"
            :revision-working="revisionState === 'pending' && revisionDraftKey === focusedDraftKey"
            :revision-error="focusedRevisionError"
            :revision-history="focusedDraft.revisionHistory || []"
            :revision-index="focusedDraft.revisionIndex || 0"
            :source-candidate-error="focusedDraft.sourceCandidateError || ''"
            :can-import-to-experience="canImportFocusedDraftToExperience"
            @discard="discardFocusedDraft"
            @update:content="updateFocusedDraftContent"
            @update:revision-instruction="updateFocusedDraftInstruction"
            @save-field="saveDraftToField"
            @copy="copyDraft"
            @retry="retryFocusedDraft"
            @revise="reviseFocusedDraft"
            @previous-revision="previousRevision"
            @next-revision="nextRevision"
            @import-to-experience="importFocusedDraftToExperience"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, provide, reactive, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useWorldStore } from '../../stores/worldStore'
import { useTheme } from '../../composables/useTheme'
import {
  SETTING_SECTIONS,
  getSettingField,
  getSettingSection,
  normalizeStructuredSettings
} from '../../services/settingPanelSchema'
import {
  buildSettingPromptPreview,
  generateSettingDraftRevision,
  generateSettingFieldDraft,
  generateSettingSectionDraft,
  isStructuredSettingRevisionCurrent
} from '../../services/settingFieldGeneration'
import { hashSettingDraftContent } from '../../../shared/settingDraftRevisionContract'
import { parseCharacterCards } from '../../services/characterCard'
import SettingFieldCard from './SettingFieldCard.vue'
import SettingDraftReview from './SettingDraftReview.vue'
import GenerationBriefBar from './GenerationBriefBar.vue'
import GenerationStatus from './GenerationStatus.vue'
import PlaceCatalog from './PlaceCatalog.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  worldbook: { type: Object, required: true }
})

const emit = defineEmits(['saved'])

const worldStore = useWorldStore()
const { isKao } = useTheme()
const sections = SETTING_SECTIONS
const activeSectionKey = ref('world')
const workingKey = ref('')
const feedback = ref('')
const form = reactive(normalizeStructuredSettings(props.worldbook?.structuredSettings))

// dirty registry：card 注册自己 mount/unmount；watcher 同步时跳过
const dirtyRegistry = new Set()
provide('dirtyRegistry', dirtyRegistry)

const activeSection = computed(() => getSettingSection(activeSectionKey.value) || sections[0])

const fieldRefs = new Map()
function getWorldbookRevision(worldbook = props.worldbook) {
  return String(worldbook?.updatedAt || worldbook?.revision || '').trim()
}

function registerFieldRef(field, el) {
  if (el) fieldRefs.set(field.key, el)
  else fieldRefs.delete(field.key)
}

// ---------- 字段级 store 同步 ----------
watch(
  () => props.worldbook?.id,
  () => {
    Object.assign(form, normalizeStructuredSettings(props.worldbook?.structuredSettings))
    sectionBrief.value = loadBrief()
    restoreDraftState()
  }
)

function syncFromStore() {
  const stored = normalizeStructuredSettings(props.worldbook?.structuredSettings)
  for (const sectionKey of Object.keys(stored)) {
    for (const fieldKey of Object.keys(stored[sectionKey])) {
      const key = `${sectionKey}.${fieldKey}`
      if (dirtyRegistry.has(key)) continue
      if (form[sectionKey][fieldKey] !== stored[sectionKey][fieldKey]) {
        form[sectionKey][fieldKey] = stored[sectionKey][fieldKey]
      }
    }
  }
}

watch(
  () => props.worldbook?.structuredSettings,
  syncFromStore,
  { deep: true }
)

// ---------- 单字段 AI 生成（保留向后兼容） ----------
async function saveField({ sectionKey, fieldKey }) {
  const updated = await worldStore.updateStructuredSetting(props.worldbook.id, sectionKey, fieldKey, form[sectionKey][fieldKey])
  emit('saved', updated?.updatedAt ?? Date.now())
  feedback.value = '已保存'
}

function onFieldSaved(savedAt) {
  emit('saved', savedAt || Date.now())
}

async function generateField({ sectionKey, fieldKey }) {
  const field = getSettingField(sectionKey, fieldKey)
  if (!field) return
  abortFieldGeneration()
  const runId = fieldRunSequence
  const ac = new AbortController()
  fieldAbortController = ac
  const generationRevision = getWorldbookRevision()
  workingKey.value = `${sectionKey}.${fieldKey}`
  feedback.value = ''
  const promptPreview = buildSettingPromptPreview({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey,
    fieldKey,
    userBrief: sectionBrief.value
  })
  try {
    const result = await generateSettingFieldDraft({
      worldbook: { ...props.worldbook, structuredSettings: form },
      sectionKey,
      fieldKey,
      userBrief: sectionBrief.value,
      signal: ac.signal
    })
    if (ac.signal.aborted || runId !== fieldRunSequence) return
    if (!result.ok) {
      feedback.value = result.reason
      return
    }
    if (generationRevision && getWorldbookRevision() !== generationRevision) {
      feedback.value = '世界书已在生成期间更新，本次草稿已过期，请重新生成。'
      return
    }
    setDraft(sectionKey, fieldKey, {
      fieldKey,
      fieldLabel: field.label,
      content: result.content,
      promptPreview,
      worldbookRevision: generationRevision
    })
    focusDraft(fieldKey)
  } catch (error) {
    if (!ac.signal.aborted && runId === fieldRunSequence) {
      feedback.value = error?.message || '设定项生成失败，请稍后重试。'
    }
  } finally {
    if (runId === fieldRunSequence) {
      workingKey.value = ''
      fieldAbortController = null
    }
  }
}

function updateDraftContent(content) {
  if (focusedDraftKey.value) {
    updateDraftContentInternal(focusedDraftKey.value, content)
  }
}

function updateDraftContentInternal(fieldKey, content) {
  const sectionMap = multiDrafts.value.get(activeSectionKey.value)
  if (!sectionMap) return
  const draft = sectionMap.get(fieldKey)
  if (draft) {
    const history = normalizeRevisionHistory(draft)
    const currentIndex = Math.min(history.length - 1, Math.max(0, Number(draft.revisionIndex) || 0))
    const nextHistory = history.slice(0, currentIndex + 1)
    nextHistory[currentIndex] = {
      ...nextHistory[currentIndex],
      content: String(content || ''),
      kind: nextHistory[currentIndex]?.kind === 'generated' ? 'edited' : nextHistory[currentIndex]?.kind
    }
    sectionMap.set(fieldKey, {
      ...draft,
      content: String(content || ''),
      revisionHistory: nextHistory,
      revisionIndex: currentIndex,
      sourceDraftHash: hashSettingDraftContent(content)
    })
    multiDrafts.value = new Map(multiDrafts.value)
    saveDraftState()
  }
}

// ---------- 整 section 批量：状态机 + abort ----------
// idle | pending | success | partial | error | aborted | stale
const sectionGenState = ref('idle')
const sectionGenProgress = ref('')
const sectionGenPhase = ref('')
const sectionGenError = ref('')
const sectionGenFailedFields = ref([])
const sectionBrief = ref('')
const showBriefBar = ref(false)
let sectionAbortController = null
let sectionGenStartedAt = 0
let revisionAbortController = null
let fieldAbortController = null
let fieldRunSequence = 0
const revisionState = ref('idle')
const revisionError = ref('')
const revisionDraftKey = ref('')

const sectionAiButtonText = computed(() => {
  switch (sectionGenState.value) {
    case 'pending': return `中止${sectionGenPhase.value ? ` · ${sectionGenPhase.value}` : ''}`
    case 'success': return '已生成'
    case 'partial': return `重试失败项（${sectionGenFailedFields.value.length}）`
    case 'error': return sectionGenFailedFields.value.length ? `重试失败项（${sectionGenFailedFields.value.length}）` : '重试整节'
    case 'aborted': return '已中止'
    case 'stale': return '重新生成（内容已过期）'
    default: return 'AI 补全本节'
  }
})

const sectionRetryLabel = computed(() => sectionGenFailedFields.value.length
  ? `重试失败项（${sectionGenFailedFields.value.length}）`
  : '重试')
const failedFieldLabels = computed(() => sectionGenFailedFields.value
  .map((fieldKey) => getSettingField(activeSectionKey.value, fieldKey)?.label || fieldKey)
  .join('、'))

const BRIEF_LS_PREFIX = 'worldbook:brief:'
function loadBrief() {
  try {
    return localStorage.getItem(`${BRIEF_LS_PREFIX}${props.worldbook.id}:${activeSectionKey.value}`) || ''
  } catch { return '' }
}
function saveBrief(value) {
  try {
    if (value) localStorage.setItem(`${BRIEF_LS_PREFIX}${props.worldbook.id}:${activeSectionKey.value}`, value)
    else localStorage.removeItem(`${BRIEF_LS_PREFIX}${props.worldbook.id}:${activeSectionKey.value}`)
  } catch { /* ignore */ }
}

function onBriefChange(value) {
  sectionBrief.value = value
  saveBrief(value)
}

// 切走 section → abort + 读新 brief + 重置 brief bar 隐藏
watch(activeSectionKey, () => {
  abortSectionGen()
  abortFieldGeneration()
  sectionGenState.value = 'idle'
  sectionGenProgress.value = ''
  sectionGenPhase.value = ''
  sectionGenError.value = ''
  sectionGenFailedFields.value = []
  abortRevision()
  revisionError.value = ''
  revisionDraftKey.value = ''
  sectionBrief.value = loadBrief()
  showBriefBar.value = false
  restoreFocusedDraftForActiveSection()
  saveDraftState()
})

onBeforeUnmount(() => {
  abortSectionGen()
  abortFieldGeneration()
  abortRevision()
  saveDraftState()
})

// 首次挂载：读 worldbook 当前 section 的 brief
sectionBrief.value = loadBrief()

function abortSectionGen() {
  if (sectionAbortController) {
    sectionAbortController.abort()
    sectionAbortController = null
  }
}

function abortFieldGeneration() {
  fieldRunSequence += 1
  if (fieldAbortController) {
    fieldAbortController.abort()
    fieldAbortController = null
  }
  workingKey.value = ''
}

function abortRevision() {
  if (revisionAbortController) {
    revisionAbortController.abort()
    revisionAbortController = null
  }
  if (revisionState.value === 'pending') revisionState.value = 'idle'
}

async function onSectionAiClick() {
  if (sectionGenState.value === 'pending') {
    abortSectionGen()
    sectionGenState.value = 'aborted'
    sectionGenPhase.value = '已取消'
    sectionGenProgress.value = ''
    return
  }
  await runSectionGen()
}

function retrySectionGen() {
  if (['partial', 'error'].includes(sectionGenState.value)) {
    runSectionGen({ fieldKeys: sectionGenFailedFields.value })
  } else if (sectionGenState.value === 'stale') {
    runSectionGen()
  }
}

async function runSectionGen({ fieldKeys = null } = {}) {
  abortSectionGen()
  const ac = new AbortController()
  sectionAbortController = ac
  sectionGenStartedAt = Date.now()
  sectionGenState.value = 'pending'
  sectionGenPhase.value = '准备请求'
  sectionGenError.value = ''
  sectionGenFailedFields.value = []
  const section = activeSection.value
  const generationRevision = getWorldbookRevision()
  const requestedFields = Array.isArray(fieldKeys) && fieldKeys.length
    ? section.fields.filter((field) => fieldKeys.includes(field.key))
    : section.fields
  sectionGenProgress.value = `0/${requestedFields.length}`
  try {
    const results = await generateSettingSectionDraft({
      sectionKey: section.key,
      worldbook: { ...props.worldbook, structuredSettings: form },
      userBrief: sectionBrief.value,
      signal: ac.signal,
      fieldKeys: requestedFields.map((field) => field.key),
      onProgress: ({ index, total, phase }) => {
        if (sectionAbortController !== ac) return
        sectionGenPhase.value = phase === 'repairing'
          ? '修复失败项'
          : phase === 'extracting'
            ? '整理来源事实'
          : phase === 'validated'
            ? '校验草稿'
            : '请求模型'
        sectionGenProgress.value = phase === 'validated' ? '' : `${Math.min(index + 1, total)}/${total}`
      }
    })

    if (sectionAbortController !== ac) return
    if (ac.signal.aborted) {
      sectionGenState.value = 'aborted'
      sectionGenPhase.value = '已取消'
      sectionGenProgress.value = ''
      return
    }
    if (generationRevision && getWorldbookRevision() !== generationRevision) {
      sectionGenState.value = 'stale'
      sectionGenPhase.value = '内容已过期'
      sectionGenError.value = '世界书已在生成期间更新，未应用旧草稿。请确认最新内容后重新生成。'
      sectionGenFailedFields.value = requestedFields.map((field) => field.key)
      return
    }

    let firstError = ''
    const failedFields = []
    const successfulFields = []
    for (const field of requestedFields) {
      const fieldKey = field.key
      const result = results.get(fieldKey)
      if (result?.ok) {
        const promptPreview = buildSettingPromptPreview({
          worldbook: { ...props.worldbook, structuredSettings: form },
          sectionKey: section.key,
          fieldKey,
          userBrief: sectionBrief.value
        })
        setDraft(section.key, fieldKey, {
          fieldKey,
          fieldLabel: result.fieldLabel,
          content: result.content,
          promptPreview,
          worldbookRevision: generationRevision,
          sourceCandidates: result.sourceCandidates || [],
          sourceCandidateError: result.sourceCandidateError || ''
        })
        successfulFields.push(fieldKey)
      } else {
        const reason = result?.reason || '该设定项没有返回可用草稿。'
        if (!firstError) firstError = `${field.label}：${reason}`
        failedFields.push(fieldKey)
      }
    }
    sectionGenFailedFields.value = failedFields
    sectionGenProgress.value = ''
    if (!focusedDraft.value && successfulFields.length) focusDraft(successfulFields[0])
    if (firstError && successfulFields.length) {
      sectionGenState.value = 'partial'
      sectionGenPhase.value = '部分完成'
      sectionGenError.value = firstError
    } else if (firstError) {
      sectionGenState.value = 'error'
      sectionGenPhase.value = '需要重试'
      sectionGenError.value = firstError
    } else {
      sectionGenState.value = 'success'
      sectionGenPhase.value = '完成'
      sectionGenError.value = ''
      setTimeout(() => {
        if (sectionGenState.value === 'success') {
          sectionGenState.value = 'idle'
          sectionGenPhase.value = ''
        }
      }, 2000)
    }
  } catch (error) {
    if (sectionAbortController !== ac) return
    if (ac.signal.aborted || error?.name === 'AbortError') {
      sectionGenState.value = 'aborted'
      sectionGenPhase.value = '已取消'
      sectionGenProgress.value = ''
      return
    }
    sectionGenState.value = 'error'
    sectionGenPhase.value = '请求失败'
    sectionGenError.value = error?.message || '结构化分区生成失败，请稍后重试。'
    sectionGenFailedFields.value = requestedFields.map((field) => field.key)
    sectionGenProgress.value = ''
  } finally {
    if (sectionAbortController === ac) sectionAbortController = null
  }
}

// ---------- multiDrafts: Map<sectionKey, Map<fieldKey, draft>> ----------
const DRAFT_LS_PREFIX = 'worldbook:setting-drafts:'
const MAX_DRAFT_REVISIONS = 8
const multiDrafts = ref(new Map())

function getDraftStorageKey(worldbookId = props.worldbook?.id) {
  const id = String(worldbookId || '').trim()
  return id ? `${DRAFT_LS_PREFIX}${id}` : ''
}

function getSectionDrafts(sectionKey) {
  if (!multiDrafts.value.has(sectionKey)) {
    multiDrafts.value.set(sectionKey, new Map())
  }
  return multiDrafts.value.get(sectionKey)
}

function createDraftId() {
  return `setting_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeRevisionHistory(draft) {
  const content = String(draft?.content || '')
  const source = Array.isArray(draft?.revisionHistory)
    ? draft.revisionHistory
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id || createDraftId()),
        content: String(entry.content || ''),
        instruction: String(entry.instruction || ''),
        createdAt: Number(entry.createdAt) || Date.now(),
        kind: String(entry.kind || 'revision')
      }))
      .filter((entry) => entry.content)
    : []
  if (!source.length) {
    return [{ id: `${draft?.draftId || createDraftId()}_base`, content, instruction: '', createdAt: Date.now(), kind: 'generated' }]
  }
  const index = Math.min(source.length - 1, Math.max(0, Number(draft?.revisionIndex) || 0))
  if (source[index].content !== content) {
    source[index] = { ...source[index], content, kind: source[index].kind === 'generated' ? 'edited' : source[index].kind }
  }
  if (source.length <= MAX_DRAFT_REVISIONS) return source
  const start = Math.max(0, Math.min(index, source.length - MAX_DRAFT_REVISIONS))
  return source.slice(start, start + MAX_DRAFT_REVISIONS)
}

function normalizeDraftRecord(sectionKey, fieldKey, draft) {
  const field = getSettingField(sectionKey, fieldKey)
  const content = String(draft?.content || '')
  const revisionHistory = normalizeRevisionHistory({ ...draft, content })
  let revisionIndex = Math.min(revisionHistory.length - 1, Math.max(0, Number(draft?.revisionIndex) || 0))
  for (let index = revisionHistory.length - 1; index >= 0; index -= 1) {
    if (revisionHistory[index].content === content) {
      revisionIndex = index
      break
    }
  }
  return {
    ...draft,
    draftId: String(draft?.draftId || createDraftId()),
    fieldKey,
    fieldLabel: String(draft?.fieldLabel || field?.label || fieldKey),
    content,
    promptPreview: String(draft?.promptPreview || ''),
    revisionHistory,
    revisionIndex,
    revisionInstruction: String(draft?.revisionInstruction || ''),
    revisionNumber: Number(draft?.revisionNumber) || Math.max(0, revisionHistory.length - 1),
    sourceDraftHash: hashSettingDraftContent(content)
  }
}

function setDraft(sectionKey, fieldKey, draft) {
  const sectionMap = getSectionDrafts(sectionKey)
  sectionMap.set(fieldKey, normalizeDraftRecord(sectionKey, fieldKey, draft))
  // 触发响应式更新
  multiDrafts.value = new Map(multiDrafts.value)
  saveDraftState()
}

function discardDraft(fieldKey) {
  const sectionMap = getSectionDrafts(activeSectionKey.value)
  sectionMap.delete(fieldKey)
  multiDrafts.value = new Map(multiDrafts.value)
  if (focusedDraftKey.value === fieldKey) {
    abortRevision()
    revisionError.value = ''
    revisionDraftKey.value = ''
    focusedDraftKey.value = null
  }
  saveDraftState()
}

const focusedDraftKey = ref(null)
const focusedDraft = computed(() => {
  if (!focusedDraftKey.value) return null
  return getSectionDrafts(activeSectionKey.value).get(focusedDraftKey.value) || null
})
const focusedDraftCurrentValue = computed(() => {
  if (!focusedDraftKey.value) return ''
  return form[activeSectionKey.value]?.[focusedDraftKey.value] || ''
})
const focusedDraftStatus = computed(() => {
  // 审核区只显示当前分区最近一轮生成的可行动状态；成功不占用审核区的纵向空间。
  if (!focusedDraftKey.value) return null
  if (sectionGenState.value === 'pending') {
    return { state: 'pending', progress: sectionGenProgress.value, error: '' }
  }
  if (['partial', 'error', 'stale'].includes(sectionGenState.value)) {
    return { state: sectionGenState.value, progress: '', error: sectionGenError.value }
  }
  return null
})
const focusedRevisionError = computed(() => (
  revisionDraftKey.value === focusedDraftKey.value ? revisionError.value : ''
))
const canImportFocusedDraftToExperience = computed(() => (
  activeSectionKey.value === 'characters'
  && ['protagonists', 'majorSupporting', 'npcs'].includes(focusedDraftKey.value)
))

const readyDraftEntries = computed(() => {
  const sectionMap = getSectionDrafts(activeSectionKey.value)
  return [...sectionMap.entries()].map(([fieldKey, draft]) => ({
    fieldKey,
    fieldLabel: draft.fieldLabel,
    snippet: String(draft.content || '').slice(0, 30) + (String(draft.content || '').length > 30 ? '…' : '')
  }))
})
const readyDraftCount = computed(() => readyDraftEntries.value.length)

function hasDraftForField(fieldKey) {
  return getSectionDrafts(activeSectionKey.value).has(fieldKey)
}

function focusDraft(fieldKey) {
  focusedDraftKey.value = fieldKey
  saveDraftState()
  nextTick(() => {
    const el = document.querySelector('.setting-draft-review')
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function discardFocusedDraft() {
  if (focusedDraftKey.value) discardDraft(focusedDraftKey.value)
}

function updateFocusedDraftContent(content) {
  if (focusedDraftKey.value) updateDraftContentInternal(focusedDraftKey.value, content)
}

function updateFocusedDraftInstruction(instruction) {
  if (!focusedDraftKey.value) return
  const sectionMap = getSectionDrafts(activeSectionKey.value)
  const draft = sectionMap.get(focusedDraftKey.value)
  if (!draft) return
  sectionMap.set(focusedDraftKey.value, {
    ...draft,
    revisionInstruction: String(instruction || '')
  })
  multiDrafts.value = new Map(multiDrafts.value)
  saveDraftState()
}

function retryFocusedDraft() {
  retrySectionGen()
}

function updateDraftRevision(sectionKey, fieldKey, nextContent, instruction, parentDraft) {
  const sectionMap = getSectionDrafts(sectionKey)
  const draft = sectionMap.get(fieldKey)
  if (!draft || draft.draftId !== parentDraft.draftId) return false
  const history = normalizeRevisionHistory(draft)
  const currentIndex = Math.min(history.length - 1, Math.max(0, Number(draft.revisionIndex) || 0))
  const branch = history.slice(0, currentIndex + 1)
  branch.push({
    id: `${draft.draftId}_r${Number(draft.revisionNumber || 0) + 1}`,
    content: String(nextContent || ''),
    instruction: String(instruction || ''),
    createdAt: Date.now(),
    kind: 'revision'
  })
  const trimmed = branch.length > MAX_DRAFT_REVISIONS ? branch.slice(-MAX_DRAFT_REVISIONS) : branch
  sectionMap.set(fieldKey, {
    ...draft,
    content: String(nextContent || ''),
    revisionHistory: trimmed,
    revisionIndex: trimmed.length - 1,
    revisionInstruction: '',
    revisionNumber: Number(draft.revisionNumber || 0) + 1,
    sourceDraftHash: hashSettingDraftContent(nextContent)
  })
  multiDrafts.value = new Map(multiDrafts.value)
  saveDraftState()
  return true
}

async function reviseFocusedDraft() {
  const fieldKey = focusedDraftKey.value
  const draft = focusedDraft.value
  const instruction = String(draft?.revisionInstruction || '').trim()
  if (!fieldKey || !draft || !instruction) {
    revisionDraftKey.value = fieldKey || ''
    revisionError.value = '请先写下要保留、删除或补充的内容。'
    revisionState.value = 'error'
    return
  }

  abortRevision()
  const ac = new AbortController()
  revisionAbortController = ac
  revisionDraftKey.value = fieldKey
  revisionState.value = 'pending'
  revisionError.value = ''
  const sourceContent = String(draft.content || '')
  const sourceHash = hashSettingDraftContent(sourceContent)
  const generationRevision = getWorldbookRevision()
  const result = await generateSettingDraftRevision({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey: activeSectionKey.value,
    fieldKey,
    draftContent: sourceContent,
    revisionInstruction: instruction,
    previousVersions: Array.isArray(draft.revisionHistory)
      ? draft.revisionHistory.slice(0, Math.max(0, Number(draft.revisionIndex) || 0))
      : [],
    sourceDraftHash: sourceHash,
    signal: ac.signal
  })

  if (ac.signal.aborted) return
  revisionAbortController = null
  const currentDraft = getSectionDrafts(activeSectionKey.value).get(fieldKey)
  if (
    !currentDraft ||
    currentDraft.draftId !== draft.draftId ||
    hashSettingDraftContent(currentDraft.content) !== sourceHash ||
    (generationRevision && getWorldbookRevision() !== generationRevision)
  ) {
    revisionState.value = 'error'
    revisionError.value = '草稿或世界书已更新，本次修订未应用。请确认当前内容后重试。'
    return
  }
  if (!result.ok) {
    revisionState.value = 'error'
    revisionError.value = result.reason || '修订失败，请稍后重试。'
    return
  }
  updateDraftRevision(activeSectionKey.value, fieldKey, result.content, instruction, draft)
  revisionState.value = 'success'
  revisionError.value = ''
  feedback.value = '已生成新的设定草稿版本'
}

function moveDraftRevision(direction) {
  const fieldKey = focusedDraftKey.value
  const draft = focusedDraft.value
  if (!fieldKey || !draft) return
  const history = normalizeRevisionHistory(draft)
  const currentIndex = Math.min(history.length - 1, Math.max(0, Number(draft.revisionIndex) || 0))
  const nextIndex = currentIndex + direction
  if (nextIndex < 0 || nextIndex >= history.length) return
  const next = history[nextIndex]
  const sectionMap = getSectionDrafts(activeSectionKey.value)
  sectionMap.set(fieldKey, {
    ...draft,
    content: next.content,
    revisionHistory: history,
    revisionIndex: nextIndex,
    sourceDraftHash: hashSettingDraftContent(next.content)
  })
  multiDrafts.value = new Map(multiDrafts.value)
  revisionState.value = 'idle'
  revisionError.value = ''
  saveDraftState()
}

function previousRevision() {
  moveDraftRevision(-1)
}

function nextRevision() {
  moveDraftRevision(1)
}

async function saveDraftToField() {
  if (!focusedDraft.value || !focusedDraftKey.value) return
  const draftRevision = String(focusedDraft.value.worldbookRevision || '').trim()
  const currentRevision = getWorldbookRevision()
  if (!isStructuredSettingRevisionCurrent(draftRevision, currentRevision)) {
    feedback.value = '世界书已更新，这份草稿已过期，请重新生成后再采纳。'
    return
  }
  const fieldKey = focusedDraftKey.value
  form[activeSectionKey.value][fieldKey] = focusedDraft.value.content
  await saveField({ sectionKey: activeSectionKey.value, fieldKey })
  discardDraft(fieldKey)
  feedback.value = '已更新世界书条目'
}

function copyDraft() {
  if (!focusedDraft.value) return
  navigator.clipboard.writeText(focusedDraft.value.content)
  feedback.value = '已复制'
}

function importFocusedDraftToExperience() {
  const fieldKey = focusedDraftKey.value
  const cards = parseCharacterCards(focusedDraft.value?.content)
  if (!cards.length) {
    feedback.value = '这份草稿没有识别出带姓名的角色卡，请先补充“姓名：”行。'
    return
  }

  if (fieldKey === 'protagonists') {
    const card = cards[0]
    worldStore.saveWritingCharacter({
      ...worldStore.writingCharacter,
      ...card,
      traits: Array.isArray(card.traits) ? card.traits : []
    })
    feedback.value = `已将「${card.name}」导入体验页主角档案`
    return
  }

  cards.forEach((card) => {
    worldStore.addEncounteredCharacter({
      ...card,
      source: 'structured-setting'
    })
  })
  feedback.value = `已将 ${cards.length} 张角色卡导入体验页人物索引`
}

function serializeDraftState() {
  const drafts = {}
  for (const [sectionKey, sectionMap] of multiDrafts.value.entries()) {
    if (!(sectionMap instanceof Map) || sectionMap.size === 0) continue
    const sectionDrafts = {}
    for (const [fieldKey, draft] of sectionMap.entries()) {
      if (!draft || typeof draft !== 'object') continue
      const field = getSettingField(sectionKey, fieldKey)
      sectionDrafts[fieldKey] = {
        ...draft,
        fieldKey,
        fieldLabel: String(draft.fieldLabel || field?.label || fieldKey),
        content: String(draft.content || ''),
        promptPreview: String(draft.promptPreview || '')
      }
    }
    if (Object.keys(sectionDrafts).length > 0) {
      drafts[sectionKey] = sectionDrafts
    }
  }

  return {
    version: 1,
    activeSectionKey: activeSectionKey.value,
    focused: focusedDraftKey.value
      ? { sectionKey: activeSectionKey.value, fieldKey: focusedDraftKey.value }
      : null,
    drafts,
    updatedAt: Date.now()
  }
}

function saveDraftState() {
  const key = getDraftStorageKey()
  if (!key || typeof localStorage === 'undefined') return

  try {
    const payload = serializeDraftState()
    if (Object.keys(payload.drafts).length === 0) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch { /* ignore localStorage failures */ }
}

function restoreDraftState() {
  const key = getDraftStorageKey()
  if (!key || typeof localStorage === 'undefined') {
    multiDrafts.value = new Map()
    focusedDraftKey.value = null
    return
  }

  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      multiDrafts.value = new Map()
      focusedDraftKey.value = null
      return
    }

    const parsed = JSON.parse(raw)
    const rawDrafts = parsed?.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {}
    const restored = new Map()

    for (const [sectionKey, sectionDrafts] of Object.entries(rawDrafts)) {
      if (!getSettingSection(sectionKey) || !sectionDrafts || typeof sectionDrafts !== 'object') continue
      const sectionMap = new Map()
      for (const [fieldKey, draft] of Object.entries(sectionDrafts)) {
        const field = getSettingField(sectionKey, fieldKey)
        if (!field || !draft || typeof draft !== 'object') continue
        sectionMap.set(fieldKey, normalizeDraftRecord(sectionKey, fieldKey, draft))
      }
      if (sectionMap.size > 0) restored.set(sectionKey, sectionMap)
    }

    multiDrafts.value = restored

    const storedSectionKey = getSettingSection(parsed?.activeSectionKey) ? parsed.activeSectionKey : ''
    if (storedSectionKey && restored.has(storedSectionKey)) {
      activeSectionKey.value = storedSectionKey
      sectionBrief.value = loadBrief()
    }

    const focused = parsed?.focused || null
    if (focused?.sectionKey === activeSectionKey.value && restored.get(activeSectionKey.value)?.has(focused.fieldKey)) {
      focusedDraftKey.value = focused.fieldKey
    } else {
      restoreFocusedDraftForActiveSection()
    }
  } catch {
    multiDrafts.value = new Map()
    focusedDraftKey.value = null
  }
}

function restoreFocusedDraftForActiveSection() {
  const sectionMap = multiDrafts.value.get(activeSectionKey.value)
  if (sectionMap?.has(focusedDraftKey.value)) return
  focusedDraftKey.value = sectionMap?.keys().next().value || null
}

restoreDraftState()

// ---------- 暴露给快捷键 / workspace ----------
async function flushAll() {
  const tasks = []
  for (const el of fieldRefs.values()) {
    if (el?.flush) tasks.push(el.flush().catch(() => {}))
  }
  await Promise.all(tasks)
  await nextTick()
}

function undoCurrentField() {
  const el = currentFieldElement()
  if (el?.undo) el.undo()
}

function redoCurrentField() {
  const el = currentFieldElement()
  if (el?.redo) el.redo()
}

function currentFieldElement() {
  const active = document.activeElement
  if (!active) return null
  const card = active.closest('[data-setting-field-card]')
  if (!card) return null
  const key = card.getAttribute('data-setting-field-card')
  const [, fieldKey] = key.split('.')
  return fieldRefs.get(fieldKey)
}

defineExpose({ flushAll, undoCurrentField, redoCurrentField })
</script>

<style scoped>
.structured-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 20px 0 0;
  background: transparent;
}

.panel-lead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 0 2px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
}

.panel-kicker {
  display: block;
  margin-bottom: 4px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-muted) 82%, var(--accent));
}

.panel-lead h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  color: var(--text-primary);
}

.panel-lead p {
  max-width: 620px;
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.panel-summary {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.panel-summary > span {
  padding: 3px 0 3px 8px;
  border-left: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  white-space: nowrap;
}

.panel-summary .draft-summary {
  border-left-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  color: var(--success);
}

.section-tabs {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  align-items: center;
  padding: 0 2px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  background: transparent;
}

.section-tab {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 0;
  padding: 7px 10px 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.section-tab:hover {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  color: var(--text-primary);
}

.section-tab.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
  background: transparent;
}

.section-ai-btn {
  margin-left: auto;
  border: 0;
  border-bottom: 2px solid color-mix(in srgb, var(--accent) 66%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  border-radius: 2px;
  padding: 7px 11px 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.section-ai-btn:hover {
  border-bottom-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 13%, transparent);
}

.section-ai-btn.is-pending {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-primary));
  cursor: progress;
}

.section-ai-btn.is-error {
  border-color: var(--danger);
  color: var(--danger);
}

.section-ai-btn.is-partial {
  border-color: var(--warning);
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.section-ai-btn.is-stale {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.section-ai-btn.is-aborted {
  border-color: var(--text-muted);
  color: var(--text-muted);
}

.section-ai-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.brief-toggle-btn {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 0;
  padding: 7px 8px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.brief-toggle-btn:hover {
  border-bottom-color: color-mix(in srgb, var(--accent) 52%, transparent);
  color: var(--accent);
}

.brief-toggle-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.brief-toggle-btn[aria-pressed="true"] {
  border-bottom-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.brief-bar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brief-bar-toggle {
  align-self: flex-end;
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}

.brief-bar-toggle:hover {
  color: var(--accent);
}

.feedback-line {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--success) 24%, var(--border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--success) 7%, transparent);
}

.generation-failed-fields {
  padding: 7px 10px;
  border-left: 2px solid color-mix(in srgb, var(--danger) 68%, var(--border));
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 12px;
}

.settings-editor-layout {
  display: contents;
}

@media (max-width: 720px) {
  .fields-grid {
    grid-template-columns: 1fr;
  }
}

/* Theme 2 is a continuous setting manuscript, not a dashboard of cards. */
.structured-settings-panel.is-continuous {
  gap: 16px;
  padding: 20px 0 0;
  background: transparent;
}

.structured-settings-panel.is-continuous .section-tabs {
  padding: 0 0 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 17%, var(--border));
  border-radius: 0;
  background: transparent;
}

.structured-settings-panel.is-continuous .section-tab {
  border-radius: 2px;
  padding: 9px 13px;
  font-size: 14px;
}

.structured-settings-panel.is-continuous .section-ai-btn,
.structured-settings-panel.is-continuous .brief-toggle-btn {
  min-height: 36px;
  padding-inline: 14px;
  font-size: 14px;
}

.structured-settings-panel.is-continuous .panel-lead h2 {
  font-size: 24px;
}

.structured-settings-panel.is-continuous .panel-kicker {
  font-size: 12px;
}

.structured-settings-panel.is-continuous .settings-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  min-width: 0;
}

.structured-settings-panel.is-continuous .settings-editor-layout.has-review {
  grid-template-columns: minmax(0, 1.5fr) minmax(360px, 0.8fr);
  grid-template-areas:
    "fields review"
    "places review";
}

.structured-settings-panel.is-continuous .settings-editor-layout.has-review > .fields-grid {
  grid-area: fields;
}

.structured-settings-panel.is-continuous .settings-editor-layout.has-review > :deep(.place-catalog) {
  grid-area: places;
}

.structured-settings-panel.is-continuous .settings-editor-layout.has-review > :deep(.setting-draft-review) {
  grid-area: review;
}

.structured-settings-panel.is-continuous .fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
  width: 100%;
  margin: 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 16%, var(--border));
}

.structured-settings-panel.is-continuous .settings-editor-layout.has-review .fields-grid {
  grid-template-columns: minmax(0, 1fr);
}

.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card) {
  padding: 13px 6px 14px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card:hover),
.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card:focus-within) {
  border-bottom-color: color-mix(in srgb, var(--archive-olive) 50%, var(--border));
  box-shadow: none;
}

.structured-settings-panel.is-continuous .fields-grid :deep(textarea) {
  min-height: 132px;
  border-inline: 0;
  border-radius: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 30px,
    color-mix(in srgb, var(--archive-ink-soft) 9%, transparent) 30px 31px
  );
  font-size: 17px;
  line-height: 34px;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.field-label) {
  font-size: 17px;
  font-weight: 720;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.field-type-pill) {
  display: none;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.action-btn),
.structured-settings-panel.is-continuous .fields-grid :deep(.field-hint),
.structured-settings-panel.is-continuous .fields-grid :deep(.field-status) {
  font-size: 14px;
}

.structured-settings-panel.is-continuous .fields-grid :deep(input) {
  font-size: 16px;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review) {
  position: sticky;
  top: 12px;
  max-height: calc(var(--app-viewport-height, 100vh) - 230px);
  overflow: auto;
  border-radius: 0;
  border: 0;
  border-left: 2px solid color-mix(in srgb, var(--accent) 48%, var(--border));
  padding: 2px 0 12px 18px;
  background: transparent;
  box-shadow: none;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .draft-head h3) {
  font-size: 20px;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .text-area) {
  min-height: 260px;
  font-size: 17px;
  line-height: 1.7;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review summary) {
  font-size: 14px;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .draft-kicker) {
  font-size: 13px;
  letter-spacing: 0;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .card-actions) {
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 12%, var(--border));
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .primary-btn),
.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .ghost-btn) {
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 680;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .primary-btn) {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--archive-paper-soft));
  color: color-mix(in srgb, var(--accent) 86%, var(--archive-ink));
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .ghost-btn) {
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, var(--bg-secondary));
  color: var(--text-secondary);
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .primary-btn:hover),
.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .ghost-btn:hover) {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--archive-paper-soft));
}

.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .primary-btn:focus-visible),
.structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review .ghost-btn:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 1100px) {
  .structured-settings-panel.is-continuous .settings-editor-layout.has-review,
  .structured-settings-panel.is-continuous .fields-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .structured-settings-panel.is-continuous .settings-editor-layout.has-review {
    grid-template-areas:
      "review"
      "fields"
      "places";
  }

  .structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review) {
    position: static;
    max-height: none;
    padding: 0 0 16px;
    border-left: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  }
}

@media (max-width: 720px) {
  .structured-settings-panel.is-continuous {
    padding: 16px 0 0;
  }

  .structured-settings-panel.is-continuous .panel-lead h2 {
    font-size: 22px;
  }

  .panel-lead {
    flex-direction: column;
    gap: 8px;
  }

  .panel-summary {
    justify-content: flex-start;
  }

  .section-tabs {
    gap: 3px;
  }

  .structured-settings-panel.is-continuous .fields-grid :deep(textarea) {
    min-height: 124px;
  }
}

@media (max-width: 720px) {
  .structured-settings-panel {
    padding: 12px;
    border-radius: 12px;
  }

  .section-ai-btn {
    margin-left: 0;
  }

  .section-ai-btn,
  .brief-toggle-btn {
    flex: 1 1 auto;
  }
}

/* Theme 2 redesign: section index on the left, editable dossier on the right. */
.structured-settings-panel.is-continuous {
  padding-top: 22px;
}

.structured-settings-panel.is-continuous .section-workbench {
  display: grid;
  grid-template-columns: minmax(180px, 214px) minmax(0, 1fr);
  gap: clamp(22px, 3vw, 38px);
  align-items: start;
}

.structured-settings-panel.is-continuous .section-rail {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 4px 22px 18px 0;
  border-right: 1px solid color-mix(in srgb, var(--archive-olive) 15%, var(--border));
}

.structured-settings-panel.is-continuous .panel-lead {
  display: grid;
  gap: 13px;
  padding: 0 0 16px;
  border-bottom-color: color-mix(in srgb, var(--archive-olive) 15%, var(--border));
}

.structured-settings-panel.is-continuous .panel-kicker {
  margin-bottom: 7px;
  color: var(--archive-ink-soft);
  font: 600 8px/1 var(--font-mono);
  letter-spacing: .16em;
}

.structured-settings-panel.is-continuous .panel-lead h2 {
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  line-height: 1.1;
}

.structured-settings-panel.is-continuous .panel-lead p {
  margin-top: 8px;
  color: var(--archive-ink-soft);
  font-size: 11px;
  line-height: 1.65;
}

.structured-settings-panel.is-continuous .panel-summary {
  justify-content: flex-start;
}

.structured-settings-panel.is-continuous .panel-summary > span {
  padding: 0 8px 0 0;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 38%, transparent);
}

.structured-settings-panel.is-continuous .section-tabs {
  display: grid;
  gap: 2px;
  padding: 0;
  border: 0;
}

.structured-settings-panel.is-continuous .section-tab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: 0 8px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.structured-settings-panel.is-continuous .section-tab i {
  justify-self: end;
  width: 10px;
  height: 1px;
  background: color-mix(in srgb, var(--archive-gold) 56%, transparent);
  transition: width var(--motion-fast) ease, background var(--motion-fast) ease;
}

.structured-settings-panel.is-continuous .section-tab:hover {
  background: color-mix(in srgb, var(--archive-olive) 4%, transparent);
  color: var(--archive-ink);
}

.structured-settings-panel.is-continuous .section-tab.active {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  color: var(--archive-ink);
}

.structured-settings-panel.is-continuous .section-tab.active i {
  width: 16px;
  background: var(--archive-rose);
}

.section-actions {
  display: grid;
  gap: 5px;
}

.structured-settings-panel.is-continuous .section-ai-btn,
.structured-settings-panel.is-continuous .brief-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 36px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 3px;
  font-size: 12px;
  text-align: left;
}

.structured-settings-panel.is-continuous .section-ai-btn {
  background: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 7px 18px color-mix(in srgb, var(--accent) 15%, transparent);
}

.structured-settings-panel.is-continuous .section-ai-btn:hover {
  background: var(--accent-hover);
}

.structured-settings-panel.is-continuous .brief-toggle-btn {
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
}

.structured-settings-panel.is-continuous .brief-toggle-btn:hover,
.structured-settings-panel.is-continuous .brief-toggle-btn[aria-pressed="true"] {
  border-bottom-color: color-mix(in srgb, var(--accent) 46%, transparent);
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  color: var(--accent);
}

.structured-settings-panel.is-continuous .section-canvas {
  position: relative;
  min-width: 0;
}

.structured-settings-panel.is-continuous .section-canvas::before {
  content: '';
  position: absolute;
  top: 4px;
  right: 0;
  width: 160px;
  height: 72px;
  opacity: .24;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--archive-gold) 56%, transparent) 0 1px, transparent 1.2px);
  background-size: 12px 12px;
  mask-image: linear-gradient(90deg, transparent, #000 40%, transparent);
  pointer-events: none;
}

.structured-settings-panel.is-continuous .brief-bar-wrapper,
.structured-settings-panel.is-continuous .feedback-line,
.structured-settings-panel.is-continuous .generation-failed-fields {
  margin-bottom: 14px;
}

.structured-settings-panel.is-continuous .fields-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  border: 0;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card) {
  min-height: 204px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 13%, var(--border));
  border-top: 2px solid color-mix(in srgb, var(--archive-gold) 58%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 88%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, #fff 66%, transparent) inset;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card:nth-child(3n + 2)) {
  border-top-color: color-mix(in srgb, var(--archive-rose) 48%, var(--archive-gold));
}

.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card:hover),
.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card:focus-within) {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  border-top-color: var(--accent);
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, transparent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--archive-ink) 6%, transparent);
}

.structured-settings-panel.is-continuous .fields-grid :deep(textarea) {
  min-height: 132px;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 12%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
  font-size: 14px;
  line-height: 1.72;
}

.structured-settings-panel.is-continuous .fields-grid :deep(textarea:focus) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  background: var(--archive-paper-soft);
}

.structured-settings-panel.is-continuous .fields-grid :deep(.field-label) {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
}

.structured-settings-panel.is-continuous .fields-grid :deep(.action-btn),
.structured-settings-panel.is-continuous .fields-grid :deep(.field-hint),
.structured-settings-panel.is-continuous .fields-grid :deep(.field-status) {
  font-size: 11px;
}

@media (max-width: 980px) {
  .structured-settings-panel.is-continuous .section-workbench {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .structured-settings-panel.is-continuous .section-rail {
    position: static;
    display: grid;
    grid-template-columns: minmax(170px, .8fr) minmax(320px, 1.4fr) auto;
    align-items: end;
    gap: 14px;
    padding: 0 0 16px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 15%, var(--border));
  }

  .structured-settings-panel.is-continuous .panel-lead {
    padding: 0;
    border: 0;
  }

  .structured-settings-panel.is-continuous .panel-lead p {
    display: none;
  }

  .structured-settings-panel.is-continuous .section-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .structured-settings-panel.is-continuous .section-tab {
    display: flex;
    justify-content: center;
    padding-inline: 8px;
    border-left: 0;
    border-bottom: 2px solid transparent;
    text-align: center;
  }

  .structured-settings-panel.is-continuous .section-tab i {
    display: none;
  }

  .structured-settings-panel.is-continuous .section-tab.active {
    border-bottom-color: var(--accent);
  }

  .section-actions {
    min-width: 150px;
  }
}

@media (max-width: 720px) {
  .structured-settings-panel.is-continuous {
    padding: 14px 0 0;
  }

  .structured-settings-panel.is-continuous .section-rail {
    display: flex;
    gap: 12px;
  }

  .structured-settings-panel.is-continuous .panel-lead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  .structured-settings-panel.is-continuous .panel-lead h2 {
    font-size: 25px;
  }

  .structured-settings-panel.is-continuous .section-tabs {
    display: flex;
    overflow-x: auto;
  }

  .structured-settings-panel.is-continuous .section-tab {
    flex: 1 0 auto;
    min-height: 36px;
  }

  .section-actions {
    grid-template-columns: 1fr 1fr;
  }

  .structured-settings-panel.is-continuous .fields-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card) {
    min-height: 0;
    padding: 14px;
  }

  .structured-settings-panel.is-continuous .fields-grid :deep(textarea) {
    min-height: 116px;
  }
}
</style>
