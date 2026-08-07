<template>
  <section class="card structured-settings-panel" :class="{ 'is-continuous': !isKao }">
    <div class="card-head structured-head">
      <div>
        <span class="panel-kicker">设定工作台</span>
        <h2>结构化设定</h2>
      </div>
      <div class="panel-badges" aria-label="当前分区状态">
        <span>{{ activeSection.label }} · {{ activeSection.fields.length }} 项</span>
        <span v-if="readyDraftCount > 0" class="draft-badge">{{ readyDraftCount }} 草稿</span>
      </div>
    </div>

    <nav class="section-tabs">
      <button
        v-for="section in sections"
        :key="section.key"
        :class="['section-tab', { active: activeSectionKey === section.key }]"
        @click="activeSectionKey = section.key"
      >
        {{ section.label }}
      </button>
      <button
        type="button"
        class="section-ai-btn"
        :class="`is-${sectionGenState}`"
        :aria-label="`为「${activeSection.label}」批量生成 AI 草稿`"
        @click="onSectionAiClick"
      >
        <span class="ai-btn-text">{{ sectionAiButtonText }}</span>
      </button>
      <button
        type="button"
        class="brief-toggle-btn"
        :aria-pressed="showBriefBar"
        :aria-label="showBriefBar ? '收起生成要求' : '补充生成要求'"
        @click="showBriefBar = !showBriefBar"
      >{{ showBriefBar ? '收起要求' : '补充要求' }}</button>
    </nav>

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
      v-if="sectionGenState === 'error' && sectionGenFailedFields.length"
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

    <details v-if="readyDraftCount > 0" class="draft-drawer" :open="false">
      <summary>本节已生成草稿（{{ readyDraftCount }}）</summary>
      <ul class="draft-drawer-list">
        <li
          v-for="entry in readyDraftEntries"
          :key="entry.fieldKey"
          :class="{ active: focusedDraftKey === entry.fieldKey }"
        >
          <button class="draft-drawer-item" @click="focusDraft(entry.fieldKey)">
            <span class="draft-drawer-label">{{ entry.fieldLabel }}</span>
            <span class="draft-drawer-snippet">{{ entry.snippet }}</span>
            <span class="draft-drawer-actions">
              <span
                role="button"
                tabindex="0"
                class="drawer-act"
                :aria-label="`丢弃「${entry.fieldLabel}」草稿`"
                @click.stop="discardDraft(entry.fieldKey)"
              >丢弃</span>
            </span>
          </button>
        </li>
      </ul>
    </details>
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
  const generationRevision = getWorldbookRevision()
  workingKey.value = `${sectionKey}.${fieldKey}`
  feedback.value = ''
  const promptPreview = buildSettingPromptPreview({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey,
    fieldKey,
    userBrief: sectionBrief.value
  })
  const result = await generateSettingFieldDraft({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey,
    fieldKey,
    userBrief: sectionBrief.value
  })
  workingKey.value = ''
  if (!result.ok) {
    feedback.value = result.reason
    return
  }
  if (generationRevision && getWorldbookRevision() !== generationRevision) {
    feedback.value = '世界书已在生成期间更新，本次草稿已丢弃，请重新生成。'
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
// 5 态：idle | pending | success | error | aborted
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
const revisionState = ref('idle')
const revisionError = ref('')
const revisionDraftKey = ref('')

const sectionAiButtonText = computed(() => {
  switch (sectionGenState.value) {
    case 'pending': return `中止${sectionGenPhase.value ? ` · ${sectionGenPhase.value}` : ''}`
    case 'success': return '已生成'
    case 'error': return sectionGenFailedFields.value.length ? `重试失败项（${sectionGenFailedFields.value.length}）` : '重试整节'
    case 'aborted': return '已中止'
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
  if (sectionGenState.value === 'error') {
    runSectionGen({ fieldKeys: sectionGenFailedFields.value })
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
  const results = await generateSettingSectionDraft({
    sectionKey: section.key,
    worldbook: { ...props.worldbook, structuredSettings: form },
    userBrief: sectionBrief.value,
    signal: ac.signal,
    fieldKeys: requestedFields.map((field) => field.key),
    onProgress: ({ index, total, phase }) => {
      sectionGenPhase.value = phase === 'repairing'
        ? '修复失败项'
        : phase === 'validated'
          ? '校验草稿'
          : '请求模型'
      sectionGenProgress.value = phase === 'validated' ? '' : `${Math.min(index + 1, total)}/${total}`
    }
  })

  // 应用成功结果到 multiDrafts；error 原因记录到 error（仅第一个失败的，避免一次性列多个）
  if (ac.signal.aborted) {
    sectionGenState.value = 'aborted'
    sectionGenPhase.value = '已取消'
    sectionGenProgress.value = ''
    sectionAbortController = null
    return
  }
  if (generationRevision && getWorldbookRevision() !== generationRevision) {
    sectionGenState.value = 'error'
    sectionGenPhase.value = '需要刷新'
    sectionGenError.value = '世界书已在生成期间更新，未应用旧草稿。请确认最新内容后重试。'
    sectionGenFailedFields.value = requestedFields.map((field) => field.key)
    sectionAbortController = null
    return
  }
  let firstError = ''
  const failedFields = []
  for (const [fieldKey, result] of results) {
    if (result.ok) {
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
        worldbookRevision: generationRevision
      })
    } else if (!firstError) {
      firstError = `${result.fieldLabel || fieldKey}：${result.reason}`
      failedFields.push(fieldKey)
    } else {
      failedFields.push(fieldKey)
    }
  }
  sectionGenFailedFields.value = failedFields
  if (firstError) {
    sectionGenState.value = 'error'
    sectionGenPhase.value = '需要重试'
    sectionGenError.value = firstError
  } else {
    sectionGenState.value = 'success'
    sectionGenPhase.value = '完成'
    sectionGenProgress.value = ''
    setTimeout(() => {
      if (sectionGenState.value === 'success') {
        sectionGenState.value = 'idle'
        sectionGenPhase.value = ''
      }
    }, 2000)
  }
  sectionAbortController = null
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
  // 复用 sectionGenState，但仅在 focusedDraft 与最近一次生成的 success/error/aborted 相关时
  if (!focusedDraftKey.value) return null
  if (sectionGenState.value === 'pending') {
    return { state: 'pending', progress: sectionGenProgress.value, error: '' }
  }
  if (sectionGenState.value === 'error') {
    return { state: 'error', progress: '', error: sectionGenError.value }
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
  gap: 14px;
  min-height: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 14px;
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary)), var(--bg-secondary));
  box-shadow: 0 14px 34px color-mix(in srgb, #000 7%, transparent);
}

.structured-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 0;
  padding-bottom: 4px;
}

.panel-kicker {
  display: block;
  margin-bottom: 4px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-muted) 82%, var(--accent));
}

.structured-head h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  color: var(--text-primary);
}

.panel-badges {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.panel-badges span {
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  white-space: nowrap;
}

.panel-badges .draft-badge {
  border-color: color-mix(in srgb, var(--success) 38%, var(--border));
  background: color-mix(in srgb, var(--success) 9%, var(--bg-primary));
  color: var(--success);
}

.section-tabs {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-primary) 58%, transparent);
}

.section-tab {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 9px;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.section-tab:hover {
  background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
  color: var(--text-primary);
}

.section-tab.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 14%, transparent) inset;
}

.section-ai-btn {
  margin-left: auto;
  border: 1px solid color-mix(in srgb, var(--accent) 54%, var(--border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--bg-secondary)), color-mix(in srgb, var(--accent) 8%, var(--bg-secondary)));
  color: var(--accent);
  border-radius: 9px;
  padding: 7px 11px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.section-ai-btn:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-secondary));
}

.section-ai-btn.is-pending {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-primary));
  cursor: progress;
}

.section-ai-btn.is-error {
  border-color: var(--danger);
  color: var(--danger);
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
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  color: var(--text-muted);
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.brief-toggle-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.brief-toggle-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.brief-toggle-btn[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
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
  gap: 12px;
  padding: 14px 18px 0;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, var(--bg-primary));
  box-shadow: none;
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

.structured-settings-panel.is-continuous .structured-head h2 {
  font-size: 24px;
}

.structured-settings-panel.is-continuous .panel-kicker {
  font-size: 12px;
}

.structured-settings-panel.is-continuous .panel-badges {
  font-size: 13px;
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
  border-radius: 6px;
  background: color-mix(in srgb, var(--archive-paper-soft) 97%, var(--accent));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--archive-ink) 8%, transparent);
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

  .structured-settings-panel.is-continuous .settings-editor-layout > :deep(.setting-draft-review) {
    position: static;
    max-height: none;
  }
}

@media (max-width: 720px) {
  .structured-settings-panel.is-continuous {
    padding: 12px 12px 0;
    border-radius: 0;
  }

  .structured-settings-panel.is-continuous .structured-head h2 {
    font-size: 22px;
  }

  .structured-settings-panel.is-continuous .fields-grid :deep(textarea) {
    min-height: 124px;
  }
}

.draft-drawer {
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 12px;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}

.draft-drawer summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 650;
  user-select: none;
}

.draft-drawer-list {
  list-style: none;
  padding: 0;
  margin: 6px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-drawer-item {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  color: var(--text-primary);
  border-radius: 9px;
  padding: 8px 9px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: minmax(82px, 0.25fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.draft-drawer-item:hover,
.draft-drawer-list li.active .draft-drawer-item {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.draft-drawer-label {
  font-weight: 500;
}

.draft-drawer-snippet {
  color: var(--text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-drawer-actions {
  display: flex;
  gap: 6px;
  font-size: 11px;
}

.drawer-act {
  color: var(--text-muted);
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 6px;
}

.drawer-act:hover {
  background: var(--surface-raised);
  color: var(--danger);
}

.drawer-act:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

@media (max-width: 720px) {
  .structured-settings-panel {
    padding: 12px;
    border-radius: 12px;
  }

  .structured-head {
    flex-direction: column;
  }

  .section-ai-btn {
    margin-left: 0;
  }

  .section-ai-btn,
  .brief-toggle-btn {
    flex: 1 1 auto;
  }
}
</style>
