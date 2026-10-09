<template>
  <section class="structured-settings-panel is-continuous">
    <div class="section-workbench">
      <aside class="section-rail workspace-sidebar">
        <span class="section-index-label">{{ tr('设定目录') }}</span>
        <label class="setting-directory-search">
          <WorkbenchIcon name="search" :size="15" />
          <input v-model="directoryQuery" type="search" :aria-label="tr('查找设定')" :placeholder="tr('查找设定…')" />
        </label>

        <nav class="section-tabs" :aria-label="tr('结构化设定分区')">
          <button
            v-for="section in sections"
            :key="section.key"
            :class="['section-tab workspace-nav-item', { active: activeSectionKey === section.key }]"
            :aria-label="tr(section.label)"
            :aria-current="activeSectionKey === section.key ? 'page' : undefined"
            @click="selectSection(section.key)"
          >
            <WorkbenchIcon class="workspace-nav-icon" :name="sectionIcons[section.key] || 'book'" :size="16" />
            <span>{{ tr(section.label) }}</span>
            <small :title="tr('已填写 {filled} 项，共 {total} 项', { filled: populatedCount(section), total: section.fields.length })">{{ populatedCount(section) }}/{{ section.fields.length }}</small>
            <i aria-hidden="true"></i>
          </button>
        </nav>

        <nav v-if="!directoryQuery.trim()" class="field-directory" :aria-label="tr('本节内容')">
          <span class="field-directory-label">{{ tr('本节内容') }}</span>
          <button v-for="field in activeSection.fields" :key="field.key" class="workspace-nav-item workspace-nav-item--tree" type="button" @click="jumpToField(field)">
            <span class="field-presence" :class="{ filled: form[activeSectionKey]?.[field.key]?.trim() }" aria-hidden="true"></span>
            <span>{{ tr(field.label) }}</span>
          </button>
        </nav>
        <nav v-else class="field-directory field-search-results" :aria-label="tr('设定查找结果')">
          <span class="field-directory-label" role="status">{{ tr('{count} 项匹配', { count: directoryMatches.length }) }}</span>
          <button v-for="item in directoryMatches" :key="`${item.section.key}.${item.field.key}`" class="workspace-nav-item" type="button" @click="openDirectoryMatch(item)">
            <span>{{ tr(item.field.label) }}<small>{{ tr(item.section.label) }}</small></span>
          </button>
          <p v-if="!directoryMatches.length" class="directory-empty">{{ tr('没有匹配的设定，试试名称或正文关键词。') }}</p>
        </nav>

      </aside>

      <div class="section-main">
        <slot name="sources" />
        <div class="section-canvas">
          <header class="section-content-heading">
            <div class="section-heading-copy"><h1>{{ tr(activeSection.label) }}</h1><p>{{ tr(activeSection.description) }}</p></div>
          <div class="section-actions">
            <button
              type="button"
              class="section-ai-btn control-primary"
              :class="`is-${sectionGenState}`"
              :aria-label="tr('为「{section}」批量生成 AI 草稿', { section: tr(activeSection.label) })"
              @click="onSectionAiClick"
            >
              <WorkbenchIcon name="sparkles" :size="15" />
              <span class="ai-btn-text">{{ sectionAiButtonText }}</span>
            </button>
            <button
              type="button"
              class="brief-toggle-btn control-secondary"
              :aria-pressed="showBriefBar"
              :aria-label="showBriefBar ? tr('收起生成要求') : tr('补充生成要求')"
              @click="showBriefBar = !showBriefBar"
            >
              <WorkbenchIcon name="pencil" :size="14" />
              <span>{{ showBriefBar ? tr('收起要求') : tr('补充要求') }}</span>
            </button>
          </div>
            <span v-if="readyDraftCount > 0" class="draft-summary">{{ tr('{count} 项草稿待审', { count: readyDraftCount }) }}</span>
          </header>
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
            :phase="tr(sectionGenPhase)"
            :error="displayFeedback(sectionGenError)"
            :retry-label="sectionRetryLabel"
            @retry="retrySectionGen"
          />
          <div
            v-if="['partial', 'error', 'stale'].includes(sectionGenState) && sectionGenFailedFields.length"
            class="generation-failed-fields"
            role="status"
          >
            {{ tr('未通过校验：{fields}。已生成内容仍保留在草稿中。', { fields: failedFieldLabels }) }}
          </div>

          <div v-if="feedback" class="feedback-line">{{ displayFeedback(feedback) }}</div>

          <nav v-if="readyDraftEntries.length" class="draft-queue" :aria-label="tr('待审 AI 草稿')">
            <div class="draft-queue__lead">
              <span>{{ tr('待审草稿') }}</span>
              <strong>{{ readyDraftCount }}</strong>
            </div>
            <div class="draft-queue__items" role="list">
              <button
                v-for="draft in readyDraftEntries"
                :key="draft.fieldKey"
                type="button"
                class="draft-queue__item"
                :class="{ active: focusedDraftKey === draft.fieldKey }"
                :aria-current="focusedDraftKey === draft.fieldKey ? 'true' : undefined"
                @click="focusDraft(draft.fieldKey)"
              >
                <span>{{ tr(getSettingField(activeSectionKey, draft.fieldKey)?.label || draft.fieldLabel) }}</span>
                <small>{{ draft.snippet }}</small>
              </button>
            </div>
          </nav>

          <div class="settings-editor-layout" :class="{ 'has-review': focusedDraft }">
            <div class="fields-grid">
              <SettingFieldCard
                v-for="field in activeSection.fields"
                :ref="(el) => registerFieldRef(field, el)"
                :key="JSON.stringify([props.worldbook.id, activeSectionKey, field.key])"
                :worldbook-id="props.worldbook.id"
                :section="activeSection"
                :field="field"
                :rows="2"
                v-model="form[activeSectionKey][field.key]"
                :working="workingKey === `${activeSectionKey}.${field.key}`"
                :has-draft="hasDraftForField(field.key)"
                @generate="generateField"
                @saved="onFieldSaved"
              />
            </div>

            <PlaceCatalog
              ref="placeCatalogRef"
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
              :revision-error="displayFeedback(focusedRevisionError)"
              :revision-history="focusedDraft.revisionHistory || []"
              :revision-index="focusedDraft.revisionIndex || 0"
              :source-candidate-error="displayFeedback(focusedDraft.sourceCandidateError || '')"
              :can-import-to-experience="canImportFocusedDraftToExperience"
              @close="closeFocusedDraft"
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
    </div>
  </section>
</template>

<script setup>
import { computed, provide, reactive, ref, watch, nextTick, onBeforeUnmount, onMounted, unref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { tr, uiLocale } from '../../i18n/index.js'
import { useWorldStore } from '../../stores/worldStore'
import {
  SETTING_SECTIONS,
  getSettingField,
  getSettingSection,
  normalizeStructuredSettings
} from '../../services/worldbook/settingPanelSchema'
import {
  buildSettingPromptPreview,
  createSettingGenerationServices,
  isStructuredSettingRevisionCurrent
} from '../../services/worldbook/settingFieldGeneration'
import { createSettingsPageDispatcher } from '../../services/agents/settings/settingsTaskDispatcher'
import { createSettingsGenerationWorkflow } from '../../services/agents/settings/settingsGenerationWorkflow'
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
// 设定 Agent 调度入口：字段/分区/修订统一走 canonical 任务分发，草稿仍只进入审核区。
const settingsDispatcher = createSettingsPageDispatcher({
  adapters: {
    settingsGeneration: createSettingsGenerationWorkflow(createSettingGenerationServices())
  }
})

function requireDispatchActions(result, fallbackMessage) {
  if (result?.status !== 'completed') {
    const failure = new Error(
      result?.error?.message || result?.error?.code || fallbackMessage || '设定任务失败。'
    )
    if (result?.error?.code === 'AGENT_ABORTED') failure.name = 'AbortError'
    throw failure
  }
  return result.actions
}

const sections = SETTING_SECTIONS
const activeSectionKey = ref('world')
const placeCatalogRef = ref(null)
async function selectSection(key) {
  if (key === activeSectionKey.value) return true
  if (placeCatalogRef.value?.confirmNavigation?.() === false) return false
  if (!(await flushAll())) return false
  activeSectionKey.value = key
  return true
}
const workingKey = ref('')
const feedback = ref('')
const form = reactive(normalizeStructuredSettings(props.worldbook?.structuredSettings))

// dirty registry：card 注册自己 mount/unmount；watcher 同步时跳过
const dirtyRegistry = new Set()
provide('dirtyRegistry', dirtyRegistry)

const activeSection = computed(() => getSettingSection(activeSectionKey.value) || sections[0])
const sectionIcons = { world: 'compass', story: 'book', characters: 'users', creativeRules: 'list' }
const directoryQuery = ref('')
const directoryMatches = computed(() => {
  const query = directoryQuery.value.trim().toLocaleLowerCase()
  if (!query) return []
  return sections.flatMap(section => section.fields
    .filter(field => `${field.label} ${section.label} ${tr(field.label)} ${tr(section.label)} ${form[section.key]?.[field.key] || ''}`.toLocaleLowerCase().includes(query))
    .map(field => ({ section, field })))
})
async function openDirectoryMatch(item) {
  if (!(await selectSection(item.section.key))) return
  await nextTick()
  jumpToField(item.field)
}
function populatedCount(section) {
  return section.fields.filter(field => String(form[section.key]?.[field.key] || '').trim()).length
}

const fieldRefs = new Map()
function hashStructuredRevision(value) {
  let hash = 2166136261
  for (const character of JSON.stringify(value || {})) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function getWorldbookRevision(worldbook = props.worldbook) {
  const base = String(worldbook?.updatedAt || worldbook?.revision || '').trim()
  const settings = worldbook === props.worldbook ? form : worldbook?.structuredSettings
  return `${base}:${hashStructuredRevision(settings)}`
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
    const actions = requireDispatchActions(await settingsDispatcher.dispatch('settings.field.complete', {
      project: { id: props.worldbook.id, revision: generationRevision },
      target: { type: 'setting-field', id: `${sectionKey}.${fieldKey}`, revision: generationRevision },
      intent: {
        sectionKey,
        fieldKey,
        worldbook: { ...props.worldbook, structuredSettings: form },
        userBrief: sectionBrief.value
      }
    }, { signal: ac.signal }), '结构化设定生成失败。')
    const result = actions[0]?.payload
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
let revisionAbortController = null
let fieldAbortController = null
let fieldRunSequence = 0
const revisionState = ref('idle')
const revisionError = ref('')
const revisionDraftKey = ref('')

const sectionAiButtonText = computed(() => {
  switch (sectionGenState.value) {
    case 'pending': return tr('停止生成')
    case 'success': return tr('已生成')
    case 'partial': return tr('重试失败项（{count}）', { count: sectionGenFailedFields.value.length })
    case 'error': return sectionGenFailedFields.value.length ? tr('重试失败项（{count}）', { count: sectionGenFailedFields.value.length }) : tr('重试整节')
    case 'aborted': return tr('已中止')
    case 'stale': return tr('重新生成（内容已过期）')
    default: return tr('AI 补全本节')
  }
})

const sectionRetryLabel = computed(() => sectionGenFailedFields.value.length
  ? tr('重试失败项（{count}）', { count: sectionGenFailedFields.value.length })
  : tr('重试'))
const failedFieldLabels = computed(() => sectionGenFailedFields.value
  .map((fieldKey) => tr(getSettingField(activeSectionKey.value, fieldKey)?.label || fieldKey))
  .join(uiLocale.value === 'en' ? ', ' : '、'))

function displayFeedback(message) {
  const value = String(message || '')
  const importedCharacter = /^已将「(.+)」导入体验页主角档案$/.exec(value)
  if (importedCharacter) return tr('已将「{name}」导入体验页主角档案', { name: importedCharacter[1] })
  const importedCards = /^已将 (\d+) 张角色卡导入体验页人物索引$/.exec(value)
  if (importedCards) return tr('已将 {count} 张角色卡导入体验页人物索引', { count: importedCards[1] })
  for (const field of sections.flatMap(section => section.fields)) {
    if (value.startsWith(`${field.label}：`)) return `${tr(field.label)}: ${tr(value.slice(field.label.length + 1))}`
  }
  return tr(value)
}

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
  if (typeof window !== 'undefined') window.removeEventListener('resize', onReviewViewportResize)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('settings-review-sheet-open')
    document.body.classList.remove('settings-review-sheet-open')
  }
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
    const actions = requireDispatchActions(await settingsDispatcher.dispatch('settings.section.complete', {
      project: { id: props.worldbook.id, revision: generationRevision },
      target: { type: 'setting-section', id: section.key, revision: generationRevision },
      intent: {
        sectionKey: section.key,
        worldbook: { ...props.worldbook, structuredSettings: form },
        userBrief: sectionBrief.value,
        fieldKeys: requestedFields.map((field) => field.key)
      }
    }, {
      signal: ac.signal,
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
    }), '结构化分区生成失败，请稍后重试。')
    const results = actions[0]?.payload

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
    return { state: sectionGenState.value, progress: '', error: displayFeedback(sectionGenError.value) }
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
const reviewFocusReturn = {
  element: null,
  scrollX: 0,
  scrollY: 0
}

function syncReviewSheetLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const shouldLock = Boolean(focusedDraft.value && window.innerWidth <= 1100)
  document.documentElement.classList.toggle('settings-review-sheet-open', shouldLock)
  document.body.classList.toggle('settings-review-sheet-open', shouldLock)
}

function onReviewViewportResize() {
  syncReviewSheetLock()
}

function hasDraftForField(fieldKey) {
  return getSectionDrafts(activeSectionKey.value).has(fieldKey)
}

function jumpToField(field) {
  const input = document.getElementById(`setting-field-${activeSectionKey.value}-${field.key}`)
  input?.closest('.setting-field-card')?.scrollIntoView({ block: 'start', behavior: 'auto' })
  input?.focus({ preventScroll: true })
}

function focusDraft(fieldKey) {
  if (!focusedDraftKey.value && typeof window !== 'undefined') {
    reviewFocusReturn.element = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    reviewFocusReturn.scrollX = window.scrollX
    reviewFocusReturn.scrollY = window.scrollY
  }
  focusedDraftKey.value = fieldKey
  saveDraftState()
  nextTick(() => {
    const el = document.querySelector('.setting-draft-review')
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    el?.querySelector('.review-close-btn')?.focus({ preventScroll: true })
  })
}

watch(focusedDraft, syncReviewSheetLock)

if (typeof window !== 'undefined') {
  window.addEventListener('resize', onReviewViewportResize)
}

function discardFocusedDraft() {
  if (focusedDraftKey.value) discardDraft(focusedDraftKey.value)
}

function closeFocusedDraft() {
  abortRevision()
  revisionError.value = ''
  revisionDraftKey.value = ''
  focusedDraftKey.value = null
  saveDraftState()
  const focusTarget = reviewFocusReturn.element
  const { scrollX, scrollY } = reviewFocusReturn
  reviewFocusReturn.element = null
  nextTick(() => {
    if (typeof window !== 'undefined'
      && (window.scrollX !== scrollX || window.scrollY !== scrollY)) {
      window.scrollTo(scrollX, scrollY)
    }
    if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true })
  })
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
  let dispatched
  try {
    dispatched = await settingsDispatcher.dispatch('settings.draft.revise', {
      project: { id: props.worldbook.id, revision: generationRevision },
      target: { type: 'setting-field', id: `${activeSectionKey.value}.${fieldKey}`, revision: generationRevision },
      intent: {
        sectionKey: activeSectionKey.value,
        fieldKey,
        worldbook: { ...props.worldbook, structuredSettings: form },
        draftContent: sourceContent,
        revisionInstruction: instruction,
        previousVersions: Array.isArray(draft.revisionHistory)
          ? draft.revisionHistory.slice(0, Math.max(0, Number(draft.revisionIndex) || 0))
          : [],
        sourceDraftHash: sourceHash
      }
    }, { signal: ac.signal })
  } catch (error) {
    if (!ac.signal.aborted) {
      revisionState.value = 'error'
      revisionError.value = error?.message || '修订失败，请稍后重试。'
    }
    return
  }
  if (ac.signal.aborted || dispatched.error?.code === 'AGENT_ABORTED') return
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
  const result = dispatched.status === 'completed'
    ? dispatched.actions[0]?.payload
    : { ok: false, reason: dispatched.error?.message || '修订失败，请稍后重试。' }
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
  const pending = [...fieldRefs.values()].some(el => ['dirty', 'saving', 'error'].includes(unref(el?.state)))
  if (pending) feedback.value = '设定尚未保存，请等保存完成或重试后再切换。'
  else if (feedback.value === '设定尚未保存，请等保存完成或重试后再切换。') feedback.value = ''
  return !pending
}

function guardUnsavedFields(event) {
  if (![...fieldRefs.values()].some(el => ['dirty', 'saving', 'error'].includes(unref(el?.state)))) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', guardUnsavedFields))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnsavedFields))
onBeforeRouteLeave(flushAll)
onBeforeRouteUpdate(flushAll)

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
  min-height: 0;
  flex: 1 0 auto;
  padding: 0;
  color: var(--text-primary);
  font-family: var(--font-sans);
}
.section-workbench { display: grid; grid-template-columns: var(--workspace-sidebar-width, 256px) minmax(0, 1fr); align-items: stretch; min-height: 100%; }
.section-rail { position: sticky; top: 0; align-self: start; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px; height: calc(var(--app-viewport-height, 100vh) - 100px); min-height: 0; padding: 24px 12px; overflow-y: auto; background: var(--surface-workbench-muted); }
.section-index-label { padding-inline: 12px; color: var(--text-secondary); font-size: 12px; }
.setting-directory-search { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 40px; padding: 0 12px; border: 1px solid transparent; border-radius: 12px; background: var(--surface-workbench); color: var(--text-secondary); }
.setting-directory-search:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.setting-directory-search input { width: 100%; min-width: 0; padding: 8px 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: 14px/1.5 var(--font-sans); }
.section-tabs { display: grid; gap: 4px; }
.section-tab { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary); text-align: left; font: 500 15px/1.5 var(--font-sans); cursor: pointer; }
.section-tab:hover { background: var(--nav-hover); color: var(--text-primary); }
.section-tab.active { background: var(--nav-selected); color: var(--text-primary); }
.section-tab > span { min-width: 0; overflow-wrap: anywhere; }
.section-tab small { flex-shrink: 0; margin-left: auto; color: var(--text-secondary); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.section-tab i { display: none; }
.field-directory { display: grid; gap: 2px; padding-top: 8px; }
.field-directory-label { padding: 0 12px 8px; color: var(--text-secondary); font-size: 12px; }
.field-directory button { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 7px 12px; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary); text-align: left; font: 14px/1.5 var(--font-sans); cursor: pointer; }
.field-directory button > span { min-width: 0; overflow-wrap: anywhere; }
.field-directory button:hover { color: var(--text-primary); background: var(--nav-hover); }
.field-presence { flex: 0 0 5px; width: 5px; height: 5px; border: 1px solid var(--text-muted); border-radius: 50%; }
.field-presence.filled { background: var(--text-secondary); border-color: var(--text-secondary); }
.field-search-results small { display: block; margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
.directory-empty { padding: 0 12px; color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.section-main { min-width: 0; min-height: calc(var(--app-viewport-height, 100vh) - 100px); border-radius: 20px 20px 0 0; background: var(--surface-workbench); }
.section-canvas { min-width: 0; min-height: 0; box-sizing: border-box; padding: 36px clamp(24px, 3.5vw, 56px) 56px; background: var(--surface-workbench); }
.section-content-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px 24px; max-width: 880px; margin: 0 auto 32px; }
.section-heading-copy { flex: 1 1 200px; min-width: 0; }
.section-content-heading h1 { margin: 0; color: var(--text-primary); font: 500 24px/1.4 var(--font-sans); letter-spacing: -.02em; }
.section-content-heading p { max-width: 560px; margin: 8px 0 0; color: var(--text-secondary); font: 14px/1.7 var(--font-sans); }
.section-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.section-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; margin: 0; padding: 7px 14px; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary); font: 500 14px/1.5 var(--font-sans); cursor: pointer; white-space: nowrap; }
.section-actions .section-ai-btn { background: var(--accent); color: var(--accent-text); border-radius: 20px; }
.section-actions .section-ai-btn:hover { background: var(--accent-hover); }
.section-actions .brief-toggle-btn:hover { background: var(--nav-hover); color: var(--text-primary); }
.section-actions .brief-toggle-btn[aria-pressed='true'] { color: var(--text-primary); background: var(--nav-selected); }
.section-actions .section-ai-btn.is-pending { cursor: progress; }
.section-actions .section-ai-btn:is(.is-error, .is-partial, .is-stale, .is-aborted) { background: var(--surface-workbench-muted); color: var(--text-primary); }
.draft-summary { width: 100%; color: var(--success); font-size: 12px; }
.brief-bar-wrapper, .feedback-line, .generation-failed-fields { max-width: 880px; margin: 0 auto 20px; }
.feedback-line, .generation-failed-fields { padding: 12px 16px; border-radius: 12px; color: var(--text-secondary); background: var(--surface-workbench-muted); font: 13px/1.7 var(--font-sans); }
.generation-failed-fields { color: var(--danger); }
.draft-queue { display: flex; align-items: flex-start; gap: 16px; max-width: 880px; margin: 0 auto 24px; padding: 12px 16px; border-radius: 12px; background: var(--surface-workbench-muted); }
.draft-queue__lead { flex-shrink: 0; display: flex; gap: 6px; align-items: baseline; padding-top: 4px; color: var(--text-secondary); font-size: 12px; }
.draft-queue__lead strong { color: var(--text-primary); font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
.draft-queue__items { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.draft-queue__item { min-width: 0; max-width: 240px; min-height: 36px; padding: 4px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; }
.draft-queue__item:hover, .draft-queue__item.active { color: var(--text-primary); background: var(--nav-selected); }
.draft-queue__item span, .draft-queue__item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.draft-queue__item span { font-size: 13px; font-weight: 500; }
.draft-queue__item small { margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
.settings-editor-layout { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 32px; min-width: 0; max-width: 880px; margin-inline: auto; }
.fields-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; min-width: 0; }
.fields-grid :deep(.setting-field-card) { min-width: 0; gap: 8px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; scroll-margin-top: 24px; }
.fields-grid :deep(.field-head) { min-height: 36px; align-items: center; gap: 12px; }
.fields-grid :deep(.field-label) { font: 500 15px/1.5 var(--font-sans); }
.fields-grid :deep(.field-type-pill) { display: none; }
.fields-grid :deep(textarea) { min-height: 76px; max-height: none; padding: 12px 14px; border: 1px solid transparent; border-radius: 12px; background: var(--surface-workbench-input, var(--surface-workbench-muted)); color: var(--text-primary); font: 15px/1.8 var(--font-sans); resize: none; }
.fields-grid :deep(textarea::placeholder) { color: var(--text-secondary); opacity: .8; }
.fields-grid :deep(textarea:focus) { border-color: var(--accent); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent); }
.fields-grid :deep(.action-btn) { min-height: 36px; padding: 6px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary); font: 500 14px/1.5 var(--font-sans); }
.fields-grid :deep(.action-btn:hover) { background: var(--nav-hover); color: var(--text-primary); }
.fields-grid :deep(.field-footer) { display: flex; align-items: center; gap: 12px; min-height: 20px; }
.fields-grid :deep(.field-hint) { margin: 0 0 0 auto; color: var(--text-secondary); font: 12px/1.5 var(--font-sans); font-variant-numeric: tabular-nums; }
.fields-grid :deep(.field-status) { margin: 0; padding: 0; border: 0; background: transparent; font: 12px/1.5 var(--font-sans); }
.fields-grid :deep(.draft-ready-dot) { position: static; width: 6px; height: 6px; box-shadow: none; }
.fields-grid :deep(.tag-input), .fields-grid :deep(.chip-input) { border: 1px solid transparent; border-radius: 12px; background: var(--surface-workbench-input, var(--surface-workbench-muted)); box-shadow: none; }
.fields-grid :deep(.tag-input:focus-within), .fields-grid :deep(.chip-input:focus-within) { border-color: var(--accent); }
.fields-grid :deep(.rule-list), .fields-grid :deep(.forbidden-list) { padding: 12px 14px; gap: 8px; border: 0; border-radius: 12px; background: var(--surface-workbench-input, var(--surface-workbench-muted)); box-shadow: none; }
.fields-grid :deep(.rule-item), .fields-grid :deep(.forbidden-item) { padding: 10px 0; gap: 12px; border: 0; border-radius: 0; background: transparent; font: 15px/1.8 var(--font-sans); }
.fields-grid :deep(.rule-text), .fields-grid :deep(.forbidden-text) { color: var(--text-primary); font-weight: 400; }
.fields-grid :deep(.forbidden-icon) { background: transparent; border: 0; color: var(--danger); }
.fields-grid :deep(.rule-index) { font-size: 12px; font-weight: 500; }
.fields-grid :deep(.rule-input-row), .fields-grid :deep(.forbidden-input-row) { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: var(--surface-workbench); }
.fields-grid :deep(.rule-input-row:focus-within), .fields-grid :deep(.forbidden-input-row:focus-within) { outline: 2px solid var(--accent); outline-offset: 2px; }
.fields-grid :deep(.chip-pending), .fields-grid :deep(.tag-pending), .fields-grid :deep(.rule-pending), .fields-grid :deep(.forbidden-pending) { font: 15px/1.6 var(--font-sans); }
.fields-grid :deep(.tag), .fields-grid :deep(.chip) { border-radius: 8px; font-size: 13px; border-color: var(--hairline-soft); background: var(--nav-selected); color: var(--text-primary); }
.fields-grid :deep(.chip-remove), .fields-grid :deep(.tag-remove), .fields-grid :deep(.rule-remove), .fields-grid :deep(.forbidden-remove) { min-width: 32px; min-height: 32px; }
.settings-editor-layout.has-review { max-width: none; grid-template-columns: minmax(0, 1.5fr) minmax(360px, .8fr); grid-template-areas: 'fields review' 'places review'; }
.settings-editor-layout.has-review > .fields-grid { grid-area: fields; }
.settings-editor-layout.has-review > :deep(.place-catalog) { grid-area: places; }
.settings-editor-layout.has-review > :deep(.setting-draft-review) { grid-area: review; position: sticky; top: 12px; max-height: calc(var(--app-viewport-height, 100vh) - 160px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid var(--hairline-soft); border-radius: 16px; background: var(--surface-workbench); box-shadow: var(--shadow-workbench); }
.settings-editor-layout > :deep(.setting-draft-review .draft-head h3) { font: 500 20px/1.4 var(--font-sans); }
.settings-editor-layout > :deep(.setting-draft-review .text-area) { min-height: 260px; padding: 12px; border-radius: 12px; background: var(--surface-workbench-input, var(--surface-workbench-muted)); font: 15px/1.8 var(--font-sans); }
.settings-editor-layout > :deep(.setting-draft-review summary) { font-size: 14px; }
.settings-editor-layout > :deep(.setting-draft-review .draft-kicker) { font: 12px/1.5 var(--font-sans); letter-spacing: 0; }
.settings-editor-layout > :deep(.setting-draft-review .primary-btn), .settings-editor-layout > :deep(.setting-draft-review .ghost-btn) { min-height: 36px; padding: 6px 12px; border-radius: 12px; font: 500 14px/1.5 var(--font-sans); }
.structured-settings-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
:global(html.settings-review-sheet-open), :global(body.settings-review-sheet-open) { overflow: hidden; }
@media (max-width: 1100px) {
  .settings-editor-layout.has-review { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'review' 'fields' 'places'; }
  .settings-editor-layout.has-review > :deep(.setting-draft-review) { position: fixed; z-index: 30; top: calc(54px + env(safe-area-inset-top, 0px)); right: 14px; bottom: 14px; width: min(430px, calc(100vw - 28px)); max-height: none; }
  .section-canvas { padding: 28px 24px 40px; }
}
@media (max-width: 760px) {
  .section-workbench { grid-template-columns: minmax(0, 1fr); grid-template-rows: max-content auto; }
  .section-rail { position: static; gap: 8px; height: auto; padding: 12px; overflow: visible; }
  .section-index-label, .field-directory { display: none; }
  .field-search-results { display: grid; }
  .setting-directory-search { min-height: 44px; }
  .section-tabs { display: flex; overflow-x: auto; scrollbar-width: none; gap: 4px; }
  .section-tab { flex: 1 0 auto; width: auto; justify-content: center; min-height: 44px; padding: 8px 10px; font-size: 14px; }
  .section-tab svg, .section-tab small { display: none; }
  .section-main { min-height: 0; }
  .section-canvas { padding: 24px 16px 40px; }
  .section-content-heading { margin-bottom: 24px; gap: 18px; }
  .section-heading-copy { flex-basis: 100%; }
  .section-content-heading h1 { font-size: 24px; }
  .section-actions { gap: 8px; }
  .section-actions button, .fields-grid :deep(.action-btn) { min-height: 44px; }
  .fields-grid { gap: 24px; }
  .fields-grid :deep(.field-head) { gap: 8px; }
  .fields-grid :deep(.field-label) { font-size: 15px; }
  .fields-grid :deep(.action-btn) { padding-inline: 8px; font-size: 13px; }
  .draft-queue { flex-wrap: wrap; }
  .draft-queue__item { max-width: min(240px, 72vw); min-height: 44px; }
  .settings-editor-layout.has-review > :deep(.setting-draft-review) { top: calc(48px + env(safe-area-inset-top, 0px)); right: 0; bottom: 0; left: 0; width: auto; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); border: 0; border-radius: 0; box-shadow: none; }
}
@media (pointer: coarse) {
  .section-tab, .field-directory button, .section-actions button, .fields-grid :deep(.action-btn) { min-height: 44px; }
  .fields-grid :deep(.chip-remove), .fields-grid :deep(.tag-remove), .fields-grid :deep(.rule-remove), .fields-grid :deep(.forbidden-remove) { min-width: 44px; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .structured-settings-panel :deep(*) { transition: none; animation: none; } }
@media (forced-colors: active) { .fields-grid :deep(textarea:focus) { outline: 2px solid Highlight; } }
</style>

<style scoped>
/* Restore the original continuous setting manuscript; retain current surfaces. */
.structured-settings-panel.is-continuous .section-canvas { padding: 28px 40px 48px; }
.structured-settings-panel.is-continuous .section-content-heading { padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid var(--hairline-soft); }
.structured-settings-panel.is-continuous .section-content-heading,
.structured-settings-panel.is-continuous .settings-editor-layout { width: 100%; max-width: none; margin-inline: 0; }
.structured-settings-panel.is-continuous .section-content-heading h1 { margin: 0 0 10px; font-size: 30px; font-weight: 600; }
.structured-settings-panel.is-continuous .section-content-heading p { font-size: 15px; line-height: 1.7; }
.structured-settings-panel.is-continuous .settings-editor-layout { gap: 24px; }
.structured-settings-panel.is-continuous .fields-grid { gap: 22px; border: 0; }
.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card) { min-width: 0; min-height: 0; gap: 6px; padding: 0 0 18px; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; box-shadow: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(.field-head) { margin-bottom: 4px; min-height: 34px; }
.structured-settings-panel.is-continuous .fields-grid :deep(.field-label) { font-size: 17px; font-weight: 600; }
.structured-settings-panel.is-continuous .fields-grid :deep(textarea) { min-height: 60px; max-height: none; padding: 6px 0; border: 0; border-radius: 0; background: transparent; color: var(--text-primary); font: 400 16px/1.85 var(--font-sans); resize: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(textarea:focus) { border: 0; outline: none; background: transparent; box-shadow: inset 0 -1px var(--accent); }
.structured-settings-panel.is-continuous .fields-grid :deep(.tag-input),
.structured-settings-panel.is-continuous .fields-grid :deep(.chip-input),
.structured-settings-panel.is-continuous .fields-grid :deep(.rule-list),
.structured-settings-panel.is-continuous .fields-grid :deep(.forbidden-list) { border: 0; border-radius: 0; background: transparent; padding: 6px 0; box-shadow: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(.rule-input-row),
.structured-settings-panel.is-continuous .fields-grid :deep(.forbidden-input-row) { padding: 7px 0; border-radius: 0; background: transparent; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags) { display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; column-gap: 18px; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-head) { display: contents; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-title-group) { grid-column: 1; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .setting-field-actions) { grid-column: 3; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .tag-input) { grid-column: 2; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-footer) { grid-column: 2 / -1; }
@media (max-width: 1100px) { .structured-settings-panel.is-continuous .section-canvas { padding: 24px 28px 40px; } }
@media (max-width: 760px) {
 .structured-settings-panel.is-continuous .section-canvas { padding: 20px 18px 32px; }
 .structured-settings-panel.is-continuous .section-content-heading h1 { font-size: 24px; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags) { display: flex; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-head) { display: flex; width: 100%; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .tag-input) { width: 100%; }
}
</style>

<style scoped>
/* Restore the original continuous setting manuscript; retain current surfaces. */
.structured-settings-panel.is-continuous .section-canvas { padding: 28px 40px 48px; }
.structured-settings-panel.is-continuous .section-content-heading { padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid var(--hairline-soft); }
.structured-settings-panel.is-continuous .section-content-heading,
.structured-settings-panel.is-continuous .settings-editor-layout { width: 100%; max-width: none; margin-inline: 0; }
.structured-settings-panel.is-continuous .section-content-heading h1 { margin: 0 0 10px; font-size: 30px; font-weight: 600; }
.structured-settings-panel.is-continuous .section-content-heading p { font-size: 15px; line-height: 1.7; }
.structured-settings-panel.is-continuous .settings-editor-layout { gap: 24px; }
.structured-settings-panel.is-continuous .fields-grid { gap: 22px; border: 0; }
.structured-settings-panel.is-continuous .fields-grid :deep(.setting-field-card) { min-width: 0; min-height: 0; gap: 6px; padding: 0 0 18px; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; box-shadow: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(.field-head) { margin-bottom: 4px; min-height: 34px; }
.structured-settings-panel.is-continuous .fields-grid :deep(.field-label) { font-size: 17px; font-weight: 600; }
.structured-settings-panel.is-continuous .fields-grid :deep(textarea) { min-height: 60px; max-height: none; padding: 6px 0; border: 0; border-radius: 0; background: transparent; color: var(--text-primary); font: 400 16px/1.85 var(--font-sans); resize: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(textarea:focus) { border: 0; outline: none; background: transparent; box-shadow: inset 0 -1px var(--accent); }
.structured-settings-panel.is-continuous .fields-grid :deep(.tag-input),
.structured-settings-panel.is-continuous .fields-grid :deep(.chip-input),
.structured-settings-panel.is-continuous .fields-grid :deep(.rule-list),
.structured-settings-panel.is-continuous .fields-grid :deep(.forbidden-list) { border: 0; border-radius: 0; background: transparent; padding: 6px 0; box-shadow: none; }
.structured-settings-panel.is-continuous .fields-grid :deep(.rule-input-row),
.structured-settings-panel.is-continuous .fields-grid :deep(.forbidden-input-row) { padding: 7px 0; border-radius: 0; background: transparent; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags) { display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; column-gap: 18px; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-head) { display: contents; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-title-group) { grid-column: 1; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .setting-field-actions) { grid-column: 3; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .tag-input) { grid-column: 2; grid-row: 1; }
.structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-footer) { grid-column: 2 / -1; }
@media (max-width: 1100px) { .structured-settings-panel.is-continuous .section-canvas { padding: 24px 28px 40px; } }
@media (max-width: 760px) {
 .structured-settings-panel.is-continuous .section-canvas { padding: 20px 18px 32px; }
 .structured-settings-panel.is-continuous .section-content-heading h1 { font-size: 24px; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags) { display: flex; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .field-head) { display: flex; width: 100%; }
 .structured-settings-panel.is-continuous .fields-grid :deep(.control-tags .tag-input) { width: 100%; }
}
</style>
