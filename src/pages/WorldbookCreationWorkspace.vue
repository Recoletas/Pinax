<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tr, formatUiNumber } from '../i18n'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import { useWorldStore } from '../stores/worldStore'
import {
  buildPendingPayload,
  createWorldbookFromPayload,
  tryAiGenerateFromBrief
} from '../services/worldbook/worldbookQuickImportHelpers'
import { buildWorldbookImportPreview } from '../services/worldbook/worldbookImportGeneration'
import { mergeWorldbookJsonImport } from '../services/worldbook/worldbookImportMerge'
import {
  buildSourceArchiveBundle,
  cleanupUnreferencedSourceArtifacts,
  createCreationWorkspace,
  deleteCreationWorkspace,
  estimateSourceArchiveUsage,
  findSourceArtifactByContentHash,
  loadCreationWorkspace,
  loadSourceArtifacts,
  loadSourceChunks,
  saveCreationWorkspace,
  saveSourceArchiveBundle
} from '../services/worldbook/worldbookSourceArchive'
import { detectSourceKind } from '../services/worldbook/worldbookSourceAdapters'
import {
  appendSourcesToWorldbook,
  bindBookWorldbook,
  ensureBookWorldbook,
  resolveBookSourceContext
} from '../services/worldbook/worldbookProjectSources'
import { parseSourceFilesWithWorker } from '../services/worldbook/worldbookSourceParser'
import { selectSourceChunks } from '../services/worldbook/worldbookSourceSelection'
import { createSettingsPageDispatcher } from '../services/agents/settings/settingsTaskDispatcher'
import { createSettingsImportWorkflow } from '../services/agents/settings/settingsImportWorkflow'
import { createSettingsGenerationWorkflow } from '../services/agents/settings/settingsGenerationWorkflow'
import {
  getCreationGenerationFailure,
  getCreationGenerationLabel,
  getCreationSourceResultState
} from '../services/worldbook/worldbookCreationState'

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
// N-A：项目书上下文。携带 bookId 进入时，确认动作按"未绑定建库绑定 /
// 已绑定追加"处理，不再只切全局 active（NA05）。
const projectBookId = ref(String(route.query.bookId || ''))
const bookContext = ref(null)

function refreshBookContext() {
  projectBookId.value = String(route.query.bookId || '')
  bookContext.value = projectBookId.value
    ? resolveBookSourceContext(projectBookId.value)
    : null
  return bookContext.value
}

const projectReturnQuery = computed(() => (
  projectBookId.value ? { bookId: projectBookId.value } : {}
))
const projectReturnRoute = computed(() => projectBookId.value && route.query.mode === 'sources' ? 'settings-sources' : 'settings-structured')
const projectBindingLabel = computed(() => {
  const context = bookContext.value
  if (!context?.ok) return ''
  if (context.mode === 'project') return tr('本书资料库：{title}（已关联）', { title: context.book.title || tr('未命名书稿') })
  return tr('本书资料库：{title}（确认时建立并关联）', { title: context.book.title || tr('未命名书稿') })
})
// 已绑定书时 JSON/基调确认为"新建为独立世界书"，是否更换本书关联是显式选择。
const rebindAfterCreate = ref(false)
// 同名冲突时的导入方式：默认新建独立世界书；更新 = 按名称+类型并入同名库。
const jsonImportMode = ref('create')
// 确认按钮文案三分：未绑定（建库绑定）/ 已绑定（独立新建）/ 全局（原语义）。
const jsonConfirmLabel = computed(() => {
  if (!bookContext.value?.ok) return '确认导入世界书'
  return bookContext.value.mode === 'unbound' ? '导入并建立本书资料库' : '新建为独立世界书'
})
const foundationConfirmLabel = computed(() => {
  if (!bookContext.value?.ok) return '确认并进入详细设定'
  return bookContext.value.mode === 'unbound' ? '以此基调建立本书资料库' : '新建为独立世界书'
})
const jsonNameConflict = computed(() => {
  const name = String(jsonPreview.value?.name || '').trim()
  if (!name) return null
  return (worldStore.worldbooksIndex || []).find(entry => String(entry.name || '').trim() === name) || null
})
const fileInput = ref(null)
const jsonInput = ref(null)
const dragging = ref(false)
const busy = ref(false)
const brief = ref('')
const pastedText = ref('')
const sourceQueue = ref([])
const pendingPayload = ref(null)
const jsonPreview = ref(null)
const previewSourceId = ref('')
const errorMessage = ref('')
const infoMessage = ref('')
const restoring = ref(true)
const archiveUsage = ref(null)
const archiveCleaning = ref(false)
const removedSourceIds = ref([])
const cancelAvailable = ref(false)
let activeAbortController = null

// 设定 Agent 调度入口：本地解析与基础基调统一走 canonical 任务分发。
const settingsDispatcher = createSettingsPageDispatcher({
  adapters: {
    settingsImport: createSettingsImportWorkflow({
      parseLocal: (files, options) => parseSourceFilesWithWorker(files, options)
    }),
    settingsGeneration: createSettingsGenerationWorkflow({
      generateFoundation: ({ request }) => tryAiGenerateFromBrief({
        brief: request.intent?.basis || '',
        nameHint: request.intent?.nameHint || '',
        genre: 'general',
        genreLabel: request.intent?.genreLabel || '自定义创作',
        signal: request.options?.signal || null
      })
    })
  }
})

function throwDispatchFailure(result, fallbackMessage) {
  const aborted = result?.error?.code === 'AGENT_ABORTED'
  const failure = new Error(result?.error?.message || fallbackMessage)
  if (aborted) failure.name = 'AbortError'
  failure.code = aborted ? 'AbortError' : result?.error?.code
  throw failure
}

const workspace = reactive(createCreationWorkspace({
  id: String(route.query.workspaceId || 'creation-active'),
  mode: ['structured-import', 'brief'].includes(String(route.query.mode)) ? String(route.query.mode) : 'sources'
}))

function isSourceUsable(item) {
  return item?.status === 'ready' || item?.status === 'memory-only'
}

const readySourceCount = computed(() => sourceQueue.value.filter(isSourceUsable).length)
const selectedSourceCount = computed(() => sourceQueue.value.filter((item) => isSourceUsable(item) && item.selected).length)
const sourceCharacterCount = computed(() => sourceQueue.value
  .filter(isSourceUsable)
  .reduce((sum, item) => sum + item.charCount, 0))
const selectedCharacterCount = computed(() => sourceQueue.value
  .filter((item) => isSourceUsable(item) && item.selected)
  .reduce((sum, item) => sum + item.charCount, 0))
const previewSource = computed(() => sourceQueue.value.find((item) => item.id === previewSourceId.value) || null)
const canGenerate = computed(() => Boolean(brief.value.trim()) || selectedSourceCount.value > 0)
const generationState = computed(() => workspace.generationState || 'idle')
const generationLabel = computed(() => tr(getCreationGenerationLabel(generationState.value)))
const generationMessage = computed(() => workspace.generationMessage || '')
const statusLabel = computed(() => {
  if (['preparing', 'generating', 'validating', 'partial', 'error', 'cancelled', 'stale'].includes(generationState.value)) {
    return generationLabel.value
  }
  if (pendingPayload.value || jsonPreview.value) return tr('待确认')
  if (readySourceCount.value) return tr('{count} 份资料已暂存', { count: readySourceCount.value })
  if (generationState.value === 'ready') return generationLabel.value
  return tr('空工作区')
})
const archiveUsageLabel = computed(() => {
  const bytes = Number(archiveUsage.value?.usedBytes || 0)
  const limit = Number(archiveUsage.value?.limitBytes || 0)
  if (!limit) return tr('归档空间读取中')
  return `${(bytes / 1024 / 1024).toFixed(1)} / ${(limit / 1024 / 1024).toFixed(0)} MB`
})
const archiveUsageWarning = computed(() => Number(archiveUsage.value?.usedBytes || 0) >= Number(archiveUsage.value?.warningBytes || Infinity))

// Workspace notices are persisted by the import owner. Localize only their
// presentation, leaving stored messages and error classification unchanged.
const NOTICE_PATTERNS = [
  [/^暂不支持导入 (?<title>.+)。$/s, '暂不支持导入 {title}。'],
  [/^(?<title>.+)超过 (?<size>\d+)MB 限制。$/s, '{title} 超过 {size} MB 限制。'],
  [/^(?<title>.+)读取超过 (?<seconds>\d+) 秒，已停止本次解析。$/s, '{title} 读取超过 {seconds} 秒，已停止。'],
  [/^(?<title>.+)没有可提取的文字。$/s, '{title} 没有可提取的文字。'],
  [/^(?<title>.+) 受密码保护，暂时无法读取。请先解除密码后重试。$/s, '{title} 受密码保护，请解除密码后重试。'],
  [/^(?<title>.+) 无法解析，(?:文件)?可能已损坏或格式不受支持。$/s, '{title} 无法解析，可能已损坏或格式不受支持。'],
  [/^准备读取 (?<count>\d+) 份资料。$/, '准备读取 {count} 份资料。'],
  [/^正在读取资料（(?<done>\d+)\/(?<total>\d+)）$/, '正在读取资料（{done}/{total}）'],
  [/^(?<ready>\d+) 份资料已暂存，(?<failed>\d+) 份失败；可移除失败项后继续。$/, '{ready} 份已暂存，{failed} 份失败；移除失败项后可继续。'],
  [/^(?<count>\d+) 份资料已完成本地提取。$/, '{count} 份资料已完成本地提取。'],
  [/^(?<count>\d+) 份资料已完成本地提取，其中 (?<temporary>\d+) 份暂存于本页。$/, '{count} 份已提取，{temporary} 份仅保留在本页。'],
  [/^(?<count>\d+) 份资料仍可用；本次读取失败的资料已保留错误状态。$/, '{count} 份资料仍可用；失败项已保留，可重试。'],
  [/^(?<title>.+) 与已有资料正文相同，已跳过重复保存。$/s, '{title} 与已有资料相同，已跳过重复保存。'],
  [/^(?<title>.+) 已复用已有本地归档。$/s, '{title} 已复用本地归档。'],
  [/^已导出 (?<title>.+) 的文字内容。$/s, '已导出 {title} 的文字内容。'],
  [/^已清理 (?<count>\d+) 份未引用资料归档，释放 (?<size>[\d.]+) MB。$/, '已清理 {count} 份未引用资料，释放 {size} MB。'],
  [/^已加入本书资料库：新增 (?<added>\d+) 份。$/, '已加入本书：新增 {added} 份资料。'],
  [/^已加入本书资料库：新增 (?<added>\d+) 份，跳过重复 (?<skipped>\d+) 份。$/, '已加入本书：新增 {added} 份，跳过重复 {skipped} 份。'],
  [/^资料库准备失败（(?<reason>.+)）$/s, '资料库准备失败：{reason}'],
  [/^资料写入失败（(?<reason>.+)）；已选资料保留在本页，可重试。$/s, '资料写入失败：{reason}。已选资料保留在本页，可重试。'],
  [/^暂存片段失败：(?<reason>.+)$/s, '暂存片段失败：{reason}'],
  [/^JSON 预览失败：(?<reason>.+)$/s, 'JSON 预览失败：{reason}'],
  [/^导入失败：(?<reason>.+)$/s, '导入失败：{reason}'],
  [/^创建失败：(?<reason>.+)$/s, '创建失败：{reason}'],
  [/^并入同名世界书失败（(?<reason>.+)）$/s, '并入同名世界书失败：{reason}'],
  [/^世界书已更新，但关联本书失败（(?<reason>.+)）；可稍后手动关联。$/s, '世界书已更新，但关联失败：{reason}。可稍后手动关联。'],
  [/^世界书已建立，但关联本书失败（(?<reason>.+)）；可稍后在写作页右栏手动关联。$/s, '世界书已建立，但关联失败：{reason}。可在工作台右栏手动关联。'],
  [/^更换本书关联失败（(?<reason>.+)）。$/s, '更换本书关联失败：{reason}'],
  [/^更换本书关联失败（(?<reason>.+)）；新世界书保持独立，本书仍关联原资料库。$/s, '更换关联失败：{reason}。新世界书保持独立，原关联不变。'],
  [/^资料写入资料库失败（(?<reason>.+)）$/s, '资料写入失败：{reason}']
]
function displayNotice(message = '') {
  for (const [pattern, key] of NOTICE_PATTERNS) {
    const match = String(message).match(pattern)
    if (match) return tr(key, { ...match.groups, ...(match.groups.reason ? { reason: displayNotice(match.groups.reason) } : {}) })
  }
  return tr(message)
}

function setGenerationState(state, options = {}) {
  const nextState = state || 'idle'
  workspace.generationState = nextState
  workspace.generationAction = options.action || workspace.generationAction || ''
  workspace.generationErrorCode = options.errorCode || ''
  workspace.generationMessage = options.message || ''
  workspace.generationStartedAt = options.startedAt || workspace.generationStartedAt || 0
  workspace.generationCompletedAt = ['ready', 'partial', 'error', 'cancelled', 'stale'].includes(nextState)
    ? (options.completedAt || Date.now())
    : 0
  workspace.status = ['preparing', 'generating', 'validating'].includes(nextState)
    ? 'processing'
    : ['error', 'cancelled', 'stale'].includes(nextState)
      ? 'error'
      : ['ready', 'partial'].includes(nextState)
        ? 'ready'
        : 'draft'
}

function setGenerationFailure(error, action) {
  const failure = getCreationGenerationFailure(error)
  setGenerationState(failure.code === 'cancelled' ? 'cancelled' : 'error', {
    action,
    errorCode: failure.code,
    message: failure.message
  })
  errorMessage.value = failure.message
}

function addFailedQueueItem(result, error = null) {
  const failure = error ? getCreationGenerationFailure(error) : null
  const failedItem = {
    id: `failed-${Date.now()}-${sourceQueue.value.length}`,
    title: result?.fileName || '未命名文件',
    kind: 'text-file',
    status: result?.error?.code === 'needs-ocr' ? 'needs-ocr' : 'error',
    error: error
      ? { code: failure.code, message: failure.message }
      : result?.error,
    charCount: 0,
    chunkCount: 0,
    chunks: []
  }
  sourceQueue.value.push(failedItem)
  workspace.sourceFailures = [...(workspace.sourceFailures || []), {
    id: failedItem.id,
    title: failedItem.title,
    kind: failedItem.kind,
    status: failedItem.status,
    error: failedItem.error
  }]
}

function clearMessages() {
  errorMessage.value = ''
  infoMessage.value = ''
}

function openFilePicker() {
  fileInput.value?.click()
}

function openJsonPicker() {
  jsonInput.value?.click()
}

function refreshArchiveUsage() {
  estimateSourceArchiveUsage().then((usage) => {
    archiveUsage.value = usage
  }).catch(() => {})
}

function collectReferencedSourceIds() {
  const ids = new Set(sourceQueue.value.filter((item) => item.status === 'ready').map((item) => item.id))
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || ''
      if (!key.startsWith('worldbook_')) continue
      const parsed = JSON.parse(localStorage.getItem(key) || '{}')
      for (const source of parsed?.sourceDocuments || []) {
        for (const reference of [source?.id, source?.archiveRef]) {
          if (reference) ids.add(String(reference))
        }
      }
    }
  } catch { /* 其他存储项不影响当前清理 */ }
  return [...ids]
}

async function cleanupArchive() {
  if (archiveCleaning.value) return
  archiveCleaning.value = true
  try {
    const result = await cleanupUnreferencedSourceArtifacts({
      preserveSourceIds: collectReferencedSourceIds()
    })
    removedSourceIds.value = []
    infoMessage.value = result.deletedArtifactIds.length
      ? `已清理 ${result.deletedArtifactIds.length} 份未引用资料归档，释放 ${(result.removedBytes / 1024 / 1024).toFixed(1)} MB。`
      : '没有发现可以安全清理的未引用资料。'
    refreshArchiveUsage()
  } catch (error) {
    errorMessage.value = error?.message || '本地归档清理失败。'
  } finally {
    archiveCleaning.value = false
  }
}

function cancelActiveTask() {
  if (!activeAbortController) return
  activeAbortController.abort()
  activeAbortController = null
  cancelAvailable.value = false
}

function sourceKindMark(kind) {
  return { pdf: 'PDF', docx: 'DOC', markdown: 'MD', 'text-file': 'TXT', 'pasted-text': 'TXT' }[kind] || 'TXT'
}

function sourceStatusLabel(status) {
  const label = { ready: '已暂存', 'memory-only': '仅本页', processing: '读取中', error: '失败', 'needs-ocr': '需 OCR' }[status]
  return label ? tr(label) : status
}

function normalizeQueueItem(result) {
  const artifact = result.artifact
  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    status: result.status || 'ready',
    error: result.error || null,
    artifact,
    chunks: result.chunks || [],
    parseProgress: 100,
    parseStatus: result.status || 'ready',
    selected: result.selected !== false,
    charCount: artifact.normalizedLength || 0,
    chunkCount: result.chunks?.length || 0
  }
}

function createProcessingQueueItems(files) {
  const prefix = `processing-${Date.now().toString(36)}`
  return Array.from(files || []).map((file, index) => ({
    id: `${prefix}-${index}`,
    title: String(file?.name || `文件 ${index + 1}`),
    kind: detectSourceKind(file) || 'text-file',
    status: 'processing',
    parseProgress: 0,
    parseStatus: 'queued',
    error: null,
    selected: false,
    charCount: 0,
    chunkCount: 0,
    chunks: []
  }))
}

function removeProcessingQueueItems(ids) {
  const idSet = new Set(ids)
  sourceQueue.value = sourceQueue.value.filter((item) => !idSet.has(item.id))
}

async function addParsedResult(result) {
  if (result.status !== 'ready') {
    addFailedQueueItem(result)
    return false
  }
  const existing = await findSourceArtifactByContentHash(result.artifact.contentHash)
  if (sourceQueue.value.some((item) => item.status === 'ready' && item.artifact?.contentHash === result.artifact.contentHash)) {
    infoMessage.value = `${result.artifact.title} 与已有资料正文相同，已跳过重复保存。`
    return true
  }
  if (existing) {
    const chunks = await loadSourceChunks(existing.chunkIds)
    sourceQueue.value.push(normalizeQueueItem({ artifact: existing, chunks, status: 'ready' }))
    workspace.selectedSourceIds = [...new Set([...workspace.selectedSourceIds, existing.id])]
    infoMessage.value = `${result.artifact.title} 已复用已有本地归档。`
    refreshArchiveUsage()
    return true
  }
  const saved = await saveSourceArchiveBundle(result)
  sourceQueue.value.push(normalizeQueueItem({ ...result, artifact: saved.artifact, status: 'ready' }))
  workspace.selectedSourceIds = [...new Set([...workspace.selectedSourceIds, saved.artifact.id])]
  if (saved.reused) infoMessage.value = `${result.artifact.title} 已复用已有本地归档。`
  refreshArchiveUsage()
  return true
}

function isQuotaError(error) {
  return error?.code === 'quota-exceeded' || error?.name === 'QuotaExceededError'
}

function addMemoryOnlyQueueItem(result, error) {
  const artifact = result?.artifact
  if (!artifact) return
  const item = normalizeQueueItem({
    artifact,
    chunks: result.chunks || [],
    status: 'memory-only',
    selected: true,
    error: {
      code: 'quota-exceeded',
      message: error?.message || '本地归档空间不足，资料暂存在当前页面。'
    }
  })
  item.id = `memory-${artifact.id}`
  item.error = {
    code: 'quota-exceeded',
    message: '归档空间不足，当前仅保留在本页；可先导出文字，清理归档后再确认。'
  }
  sourceQueue.value.push(item)
}

async function parseFiles(files) {
  const list = Array.from(files || [])
  if (!list.length || busy.value) return
  clearMessages()
  busy.value = true
  const processingItems = createProcessingQueueItems(list)
  const processingIds = processingItems.map((item) => item.id)
  sourceQueue.value.push(...processingItems)
  const abortController = new AbortController()
  activeAbortController = abortController
  cancelAvailable.value = true
  setGenerationState('preparing', {
    action: 'sources',
    startedAt: Date.now(),
    message: `准备读取 ${list.length} 份资料。`
  })
  try {
    setGenerationState('generating', {
      action: 'sources',
      message: '正在本地提取文字，不会上传原始文件。'
    })
    const dispatched = await settingsDispatcher.dispatch('source.parse', {
      project: { id: workspace.id, revision: String(workspace.updatedAt || '') },
      target: { type: 'source-batch', revision: String(workspace.updatedAt || '') },
      intent: { files: list }
    }, {
      signal: abortController.signal,
      onProgress: ({ index, status, error }) => {
        const item = sourceQueue.value.find((entry) => entry.id === processingIds[index])
        if (!item) return
        item.parseProgress = Math.min(100, Math.max(0, Math.round(((index + 1) / list.length) * 100)))
        item.parseStatus = status || 'ready'
        item.error = error || null
        const completed = processingItems.filter((entry) => {
          const current = sourceQueue.value.find((queueItem) => queueItem.id === entry.id)
          return current?.parseStatus === 'ready' || current?.parseStatus === 'error'
        }).length
        setGenerationState('generating', {
          action: 'sources',
          message: `正在读取资料（${completed}/${list.length}）`
        })
      },
      onMetrics: (metrics) => {
        if (metrics && typeof metrics === 'object') workspace.sourceParseMetrics = metrics
      }
    })
    if (dispatched.status !== 'completed') throwDispatchFailure(dispatched, '资料读取失败。')
    const results = dispatched.actions[0].payload
    let readyCount = 0
    let failedCount = 0
    let memoryOnlyCount = 0
    for (const [index, result] of results.entries()) {
      removeProcessingQueueItems([processingIds[index]])
      try {
        const added = await addParsedResult(result)
        if (added) readyCount += 1
        else failedCount += 1
      } catch (error) {
        if (isQuotaError(error) && result.status === 'ready') {
          readyCount += 1
          memoryOnlyCount += 1
          addMemoryOnlyQueueItem(result, error)
        } else {
          failedCount += 1
          addFailedQueueItem(result, error)
        }
      }
    }
    const state = getCreationSourceResultState({ readyCount, failedCount })
    setGenerationState(state, {
      action: 'sources',
      message: state === 'partial'
        ? `${readyCount} 份资料已暂存，${failedCount} 份失败；可移除失败项后继续。`
        : state === 'error'
          ? '资料没有成功暂存，请检查失败项后重试。'
        : `${readyCount} 份资料已完成本地提取${memoryOnlyCount ? `，其中 ${memoryOnlyCount} 份暂存于本页` : ''}。`
    })
    if (state === 'error') errorMessage.value = workspace.generationMessage
    else infoMessage.value = workspace.generationMessage
  } catch (error) {
    removeProcessingQueueItems(processingIds)
    const state = getCreationSourceResultState({ readyCount: readySourceCount.value, failedCount: 1 })
    setGenerationFailure(error, 'sources')
    if (state === 'partial') {
      setGenerationState('partial', {
        action: 'sources',
        errorCode: 'partial-failure',
        message: `${readySourceCount.value} 份资料仍可用；本次读取失败的资料已保留错误状态。`
      })
      infoMessage.value = workspace.generationMessage
      errorMessage.value = ''
    }
  } finally {
    removeProcessingQueueItems(processingIds)
    if (activeAbortController === abortController) activeAbortController = null
    cancelAvailable.value = false
    busy.value = false
    dragging.value = false
    refreshArchiveUsage()
  }
}

function onFileChange(event) {
  parseFiles(event.target?.files)
  event.target.value = ''
}

function onDrop(event) {
  parseFiles(event.dataTransfer?.files)
}

async function addPastedSource() {
  const content = pastedText.value.trim()
  if (!content || busy.value) return
  clearMessages()
  const bundle = buildSourceArchiveBundle({
    id: `pasted-${Date.now().toString(36)}`,
    title: workspace.name ? `${workspace.name} · 粘贴片段` : '粘贴片段',
    kind: 'pasted-text',
    sourceLabel: '粘贴文字',
    content
  })
  let consumed = false
  try {
    const saved = await saveSourceArchiveBundle(bundle)
    sourceQueue.value.push(normalizeQueueItem({ ...bundle, artifact: saved.artifact, status: 'ready' }))
    workspace.selectedSourceIds = [...new Set([...workspace.selectedSourceIds, saved.artifact.id])]
    setGenerationState('ready', {
      action: 'sources',
      message: '粘贴片段已暂存，可选择它参与基础基调。'
    })
    infoMessage.value = '粘贴片段已暂存。'
    consumed = true
  } catch (error) {
    if (!isQuotaError(error)) {
      setGenerationFailure(error, 'sources')
      errorMessage.value = `暂存片段失败：${errorMessage.value}`
      return
    }
    addMemoryOnlyQueueItem({ artifact: bundle.artifact, chunks: bundle.chunks }, error)
    setGenerationState('partial', {
      action: 'sources',
      errorCode: 'quota-exceeded',
      message: '归档空间不足，粘贴片段暂存于本页；清理归档后可重新确认。'
    })
    infoMessage.value = workspace.generationMessage
    consumed = true
  } finally {
    if (consumed) pastedText.value = ''
    refreshArchiveUsage()
  }
}

function removeSource(id) {
  sourceQueue.value = sourceQueue.value.filter((item) => item.id !== id)
  workspace.selectedSourceIds = workspace.selectedSourceIds.filter((sourceId) => sourceId !== id)
  workspace.sourceFailures = (workspace.sourceFailures || []).filter((failure) => failure.id !== id)
  if (!removedSourceIds.value.includes(id)) removedSourceIds.value.push(id)
  if (previewSourceId.value === id) previewSourceId.value = ''
  infoMessage.value = '资料已从当前工作区移除；可在右侧清理未引用归档。'
}

function toggleSource(id) {
  const item = sourceQueue.value.find((entry) => entry.id === id)
  if (!item || !isSourceUsable(item)) return
  item.selected = !item.selected
  workspace.selectedSourceIds = sourceQueue.value
    .filter((entry) => entry.status === 'ready' && entry.selected)
    .map((entry) => entry.id)
}

function toggleAllSources() {
  const shouldSelect = selectedSourceCount.value !== readySourceCount.value
  sourceQueue.value.forEach((item) => {
    if (isSourceUsable(item)) item.selected = shouldSelect
  })
  workspace.selectedSourceIds = shouldSelect
    ? sourceQueue.value.filter((item) => item.status === 'ready').map((item) => item.id)
    : []
}

function toggleSourcePreview(id) {
  previewSourceId.value = previewSourceId.value === id ? '' : id
}

function sourceExcerpt() {
  return selectSourceChunks({
    sourceDocuments: sourceQueue.value
      .filter((item) => isSourceUsable(item) && item.selected)
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.chunks.map((chunk) => chunk.text).join('\n\n')
      })),
    sectionLabel: '基础基调',
    fieldLabel: '世界概述与创作约束',
    userBrief: brief.value,
    maxChars: 9000,
    maxChunks: 12,
    maxChunksPerSource: 3
  }).context
}

function selectedSourceDocuments() {
  return sourceQueue.value
    .filter((item) => isSourceUsable(item) && item.selected)
    .map((item) => {
      const preview = item.chunks.map((chunk) => chunk.text).join('\n\n').slice(0, 2400)
      return {
        id: item.artifact.id,
        title: item.artifact.title,
        kind: item.artifact.kind,
        content: preview,
        sourceLabel: item.artifact.sourceLabel,
        originalLength: item.artifact.originalLength,
        normalizedLength: item.artifact.normalizedLength,
        archiveRef: item.artifact.id,
        chunkIds: item.artifact.chunkIds,
        contentHash: item.artifact.contentHash,
        createdAt: item.artifact.createdAt,
        warnings: item.artifact.warnings
      }
    })
    .filter((source) => source.content)
}

async function persistMemoryOnlySources() {
  const memorySources = sourceQueue.value.filter((item) => item.status === 'memory-only' && item.selected)
  for (const item of memorySources) {
    const saved = await saveSourceArchiveBundle({ artifact: item.artifact, chunks: item.chunks })
    const restored = normalizeQueueItem({ artifact: saved.artifact, chunks: saved.chunks, status: 'ready', selected: true })
    sourceQueue.value = sourceQueue.value.map((entry) => entry.id === item.id ? restored : entry)
    workspace.selectedSourceIds = [...new Set([...workspace.selectedSourceIds, restored.id])]
  }
  if (memorySources.length) refreshArchiveUsage()
}

function exportSourceText(item) {
  const content = item?.chunks?.map((chunk) => chunk.text).join('\n\n').trim()
  if (!content || typeof document === 'undefined') return
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${String(item.title || '资料').replace(/[\\/:*?"<>|]+/g, '_')}.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  infoMessage.value = `已导出 ${item.title} 的文字内容。`
}

// 已绑定书：把选中的资料（完整正文）追加进当前资料库，不新建世界书。
function selectedFullSourceDocuments() {
  return sourceQueue.value
    .filter((item) => isSourceUsable(item) && item.selected)
    .map((item) => ({
      id: item.artifact.id,
      title: item.artifact.title,
      kind: item.artifact.kind,
      content: item.chunks.map((chunk) => chunk.text).join('\n\n'),
      sourceLabel: item.artifact.sourceLabel,
      originalLength: item.artifact.originalLength,
      normalizedLength: item.artifact.normalizedLength,
      archiveRef: item.artifact.id,
      chunkIds: item.artifact.chunkIds,
      contentHash: item.artifact.contentHash,
      createdAt: item.artifact.createdAt,
      warnings: item.artifact.warnings
    }))
    .filter((source) => source.content)
}

async function confirmAppendSources() {
  const context = bookContext.value
  if (!context?.ok || busy.value) return
  if (!selectedSourceCount.value) {
    errorMessage.value = '请先选择要加入本书资料库的资料。'
    return
  }
  clearMessages()
  busy.value = true
  setGenerationState('preparing', { action: 'append-sources', startedAt: Date.now(), message: '正在把资料写入本书资料库。' })
  try {
    await persistMemoryOnlySources()
    const target = await ensureBookWorldbook({ bookId: context.book.id, worldStore })
    if (!target.ok) throw new Error(`资料库准备失败（${target.reason}）`)
    const result = await appendSourcesToWorldbook({
      worldbookId: target.worldbookId,
      documents: selectedFullSourceDocuments(),
      worldStore
    })
    if (!result.ok) throw new Error(`资料写入失败（${result.detail || result.reason}）；已选资料保留在本页，可重试。`)
    await worldStore.loadWorldbooksIndex()
    await deleteCreationWorkspace(workspace.id)
    infoMessage.value = `已加入本书资料库：新增 ${result.added} 份${result.skipped ? `，跳过重复 ${result.skipped} 份` : ''}。`
    await router.push({ name: projectReturnRoute.value, query: projectReturnQuery.value })
  } catch (error) {
    setGenerationFailure(error, 'append-sources')
  } finally {
    busy.value = false
  }
}

async function generateFoundation() {
  if (!canGenerate.value || busy.value) return
  clearMessages()
  busy.value = true
  const abortController = new AbortController()
  activeAbortController = abortController
  cancelAvailable.value = true
  setGenerationState('preparing', {
    action: 'foundation',
    startedAt: Date.now(),
    message: '正在整理已选择的资料片段。'
  })
  try {
    const basis = [brief.value.trim(), sourceExcerpt()].filter(Boolean).join('\n\n')
    setGenerationState('generating', {
      action: 'foundation',
      message: '正在生成基础基调草稿，原始文件不会直接上传。'
    })
    const dispatched = await settingsDispatcher.dispatch('settings.foundation.generate', {
      project: { id: workspace.id, revision: String(workspace.updatedAt || '') },
      target: { type: 'setting-foundation', revision: String(workspace.updatedAt || '') },
      intent: {
        basis,
        nameHint: workspace.name,
        genreLabel: '自定义创作'
      }
    }, { signal: abortController.signal })
    if (dispatched.status !== 'completed') throwDispatchFailure(dispatched, 'AI 未返回可用的基础基调。')
    const result = dispatched.actions[0]?.payload
    if (!result.ok || !result.payload) {
      const failure = new Error(result.reason || 'AI 未返回可用的基础基调。')
      failure.code = /配置|配置中|AI 配置/.test(failure.message) ? 'configuration' : 'schema-invalid'
      throw failure
    }
    setGenerationState('validating', {
      action: 'foundation',
      message: '正在校验草稿结构。'
    })
    pendingPayload.value = buildPendingPayload(result.payload)
    workspace.foundationDraft = pendingPayload.value
    setGenerationState('ready', {
      action: 'foundation',
      message: '基础基调已生成，请在确认前检查世界边界和文风。'
    })
    infoMessage.value = '基础基调已生成，请确认后进入详细设定。'
  } catch (error) {
    setGenerationFailure(error, 'foundation')
  } finally {
    if (activeAbortController === abortController) activeAbortController = null
    cancelAvailable.value = false
    busy.value = false
  }
}

async function onJsonChange(event) {
  const file = event.target?.files?.[0]
  event.target.value = ''
  if (!file) return
  clearMessages()
  busy.value = true
  setGenerationState('preparing', {
    action: 'json-import',
    startedAt: Date.now(),
    message: '正在读取结构化 JSON。'
  })
  try {
    setGenerationState('validating', {
      action: 'json-import',
      message: '正在检查条目、分组和注入参数。'
    })
    const parsed = JSON.parse(await file.text())
    jsonPreview.value = {
      rawData: parsed,
      ...buildWorldbookImportPreview(parsed, file.name.replace(/\.json$/i, ''))
    }
    workspace.mode = 'structured-import'
    if (!jsonPreview.value.entryCount) {
      const failure = new Error('没有识别到可导入条目。')
      failure.code = 'schema-invalid'
      throw failure
    }
    setGenerationState('ready', {
      action: 'json-import',
      message: 'JSON 结构预览已就绪，确认后直接导入。'
    })
    infoMessage.value = 'JSON 结构预览已就绪，确认后直接导入，不经过普通文本提炼。'
  } catch (error) {
    setGenerationFailure(error, 'json-import')
    errorMessage.value = `JSON 预览失败：${errorMessage.value}`
  } finally {
    busy.value = false
  }
}

async function confirmJsonImport() {
  if (!jsonPreview.value?.rawData || !jsonPreview.value.entryCount || busy.value) return
  clearMessages()
  busy.value = true
  setGenerationState('preparing', {
    action: 'json-import',
    startedAt: Date.now(),
    message: '正在写入正式世界书。'
  })
  try {
    if (jsonImportMode.value === 'update' && jsonNameConflict.value) {
      // NA07：条目级并入同名世界书（新增/更新/跳过逐条判定，默认不覆盖语义见 UI）。
      const merged = await mergeWorldbookJsonImport({
        worldStore,
        targetId: jsonNameConflict.value.id,
        rawData: jsonPreview.value.rawData
      })
      if (!merged.ok) throw new Error(`并入同名世界书失败（${merged.reason || '未知原因'}）`)
      const context = bookContext.value
      let bindingNote = `已并入同名世界书：新增 ${merged.added}、更新 ${merged.updated}、相同跳过 ${merged.skipped}。`
      if (context?.ok && context.mode === 'unbound') {
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: jsonNameConflict.value.id })
        if (!bound.ok) throw new Error(`世界书已更新，但关联本书失败（${bound.reason}）；可稍后手动关联。`)
        bindingNote += ' 已关联为本书资料库。'
      } else if (context?.ok && context.mode === 'project' && rebindAfterCreate.value) {
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: jsonNameConflict.value.id })
        if (!bound.ok) throw new Error(`更换本书关联失败（${bound.reason}）。`)
        bindingNote += ' 本书关联已更换为该世界书。'
      }
      await worldStore.loadWorldbooksIndex()
      await deleteCreationWorkspace(workspace.id)
      jsonPreview.value = null
      infoMessage.value = bindingNote
      await router.push({ name: projectReturnRoute.value, query: projectReturnQuery.value })
      return
    }
    const created = await worldStore.importFromSillyTavern(jsonPreview.value.rawData)
    await worldStore.loadWorldbooksIndex()
    if (created?.id) await worldStore.setActiveWorldbook(created.id)
    // 项目上下文：未绑定的书在此建立关联（写 book.worldbookId，不再只切全局）。
    let bindingNote = ''
    const context = bookContext.value
    if (created?.id && context?.ok) {
      if (context.mode === 'unbound') {
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: created.id })
        if (!bound.ok) throw new Error(`世界书已建立，但关联本书失败（${bound.reason}）；可稍后在写作页右栏手动关联。`)
        bindingNote = '已关联为本书资料库。'
        // 未绑定流：本页选中的资料随新资料库入册，正文留在归档。
        const selected = selectedFullSourceDocuments()
        if (selected.length) {
          const appended = await appendSourcesToWorldbook({ worldbookId: created.id, documents: selected, worldStore })
          if (!appended.ok) throw new Error(`资料写入资料库失败（${appended.reason || '未知原因'}）`)
          bindingNote += ` 已一并加入 ${appended.added} 份资料。`
        }
      } else if (rebindAfterCreate.value) {
        // 显式更换关联：默认关闭；开启时按计划仍不静默替换。
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: created.id })
        if (!bound.ok) throw new Error(`更换本书关联失败（${bound.reason}）；新世界书保持独立，本书仍关联原资料库。`)
        bindingNote = '本书关联已更换为新世界书。'
        const selectedRebind = selectedFullSourceDocuments()
        if (selectedRebind.length) {
          const appendedRebind = await appendSourcesToWorldbook({ worldbookId: created.id, documents: selectedRebind, worldStore })
          if (!appendedRebind.ok) throw new Error(`资料写入资料库失败（${appendedRebind.reason || '未知原因'}）`)
          bindingNote += ` 已一并加入 ${appendedRebind.added} 份资料。`
        }
      } else {
        bindingNote = '新世界书保持独立；本书仍关联原资料库。'
      }
    }
    await deleteCreationWorkspace(workspace.id)
    jsonPreview.value = null
    infoMessage.value = bindingNote
    await router.push({ name: projectReturnRoute.value, query: projectReturnQuery.value })
  } catch (error) {
    setGenerationFailure(error, 'json-import')
    errorMessage.value = `导入失败：${errorMessage.value}`
  } finally {
    busy.value = false
  }
}

async function confirmFoundation() {
  if (!pendingPayload.value || busy.value) return
  clearMessages()
  busy.value = true
  setGenerationState('preparing', {
    action: 'foundation-confirm',
    startedAt: Date.now(),
    message: '正在创建正式世界书骨架。'
  })
  try {
    await persistMemoryOnlySources()
    const sources = selectedSourceDocuments()
    const created = await createWorldbookFromPayload(worldStore, pendingPayload.value, {
      sourceDocuments: sources,
      archivedSourceDocuments: sources
    })
    if (created?.id) await worldStore.setActiveWorldbook(created.id)
    let bindingNote = ''
    const context = bookContext.value
    if (created?.id && context?.ok) {
      if (context.mode === 'unbound') {
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: created.id })
        if (!bound.ok) throw new Error(`世界书已建立，但关联本书失败（${bound.reason}）；可稍后在写作页右栏手动关联。`)
        bindingNote = '已关联为本书资料库。'
      } else if (rebindAfterCreate.value) {
        const bound = await bindBookWorldbook({ bookId: projectBookId.value, worldbookId: created.id })
        if (!bound.ok) throw new Error(`更换本书关联失败（${bound.reason}）；新世界书保持独立，本书仍关联原资料库。`)
        bindingNote = '本书关联已更换为新世界书。'
      } else {
        bindingNote = '新世界书保持独立；本书仍关联原资料库。'
      }
    }
    await deleteCreationWorkspace(workspace.id)
    infoMessage.value = bindingNote
    await router.push({ name: projectReturnRoute.value, query: projectReturnQuery.value })
  } catch (error) {
    setGenerationFailure(error, 'foundation-confirm')
    errorMessage.value = `创建失败：${errorMessage.value}`
  } finally {
    busy.value = false
  }
}

function goBack() {
  router.push({ name: 'settings-worldbook' })
}

watch(
  () => String(route.query.bookId || ''),
  () => {
    refreshBookContext()
    rebindAfterCreate.value = false
  }
)

watch(
  () => ({
    ...workspace,
    sourceIds: sourceQueue.value.filter((item) => item.status === 'ready').map((item) => item.id),
    selectedSourceIds: sourceQueue.value
      .filter((item) => item.status === 'ready' && item.selected)
      .map((item) => item.id),
    sourceFailures: sourceQueue.value
      .filter((item) => item.status !== 'ready')
      .map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        status: item.status,
        error: item.error
      })),
    brief: brief.value,
    foundationDraft: pendingPayload.value || workspace.foundationDraft
  }),
  (next) => {
    if (restoring.value) return
    saveCreationWorkspace(next).catch(() => {})
  },
  { deep: true }
)

onMounted(async () => {
  refreshBookContext()
  refreshArchiveUsage()
  try {
    const restored = await loadCreationWorkspace(workspace.id)
    if (!restored) return
    Object.assign(workspace, restored)
    if (['preparing', 'generating', 'validating'].includes(workspace.generationState)) {
      setGenerationState('cancelled', {
        action: workspace.generationAction || 'sources',
        errorCode: 'cancelled',
        message: '上次任务在页面离开时已停止，可重新开始。'
      })
    }
    const selectedSourceIds = new Set(Array.isArray(restored.selectedSourceIds) ? restored.selectedSourceIds : restored.sourceIds)
    workspace.selectedSourceIds = [...selectedSourceIds]
    brief.value = restored.brief || ''
    pendingPayload.value = restored.foundationDraft || null

    const artifacts = await loadSourceArtifacts(restored.sourceIds)
    const chunkIds = artifacts.flatMap((artifact) => artifact.chunkIds || [])
    const chunks = await loadSourceChunks(chunkIds)
    const chunksBySource = new Map()
    for (const chunk of chunks) {
      const list = chunksBySource.get(chunk.sourceId) || []
      list.push(chunk)
      chunksBySource.set(chunk.sourceId, list)
    }
    const restoredSources = artifacts.map((artifact) => {
      const sourceChunks = chunksBySource.get(artifact.id) || []
      return normalizeQueueItem({
        artifact,
        chunks: sourceChunks,
        status: 'ready',
        selected: selectedSourceIds.has(artifact.id)
      })
    })
    const restoredFailures = (restored.sourceFailures || []).map((failure) => ({
      id: failure.id,
      title: failure.title,
      kind: failure.kind,
      status: failure.status === 'processing' ? 'error' : failure.status,
      error: failure.status === 'processing'
        ? { code: 'cancelled', message: '页面离开时已停止读取，可重新选择该文件。' }
        : failure.error,
      charCount: 0,
      chunkCount: 0,
      chunks: []
    }))
    sourceQueue.value = [...restoredSources, ...restoredFailures]
  } catch (error) {
    errorMessage.value = error?.message || '创建工作区恢复失败。'
  } finally {
    restoring.value = false
  }
})

onBeforeUnmount(() => {
  activeAbortController?.abort()
  activeAbortController = null
  cancelAvailable.value = false
})
</script>

<template>
  <div class="creation-page">
    <SettingsSectionNav />

    <header class="creation-header">
      <button type="button" class="creation-back" :aria-label="tr(&quot;返回世界书&quot;)" :title="tr(&quot;返回世界书&quot;)" @click="goBack">
        <span aria-hidden="true">‹</span>
        <span>{{ tr("返回世界书") }}</span>
      </button>
      <div>
        <h1>{{ bookContext?.ok ? tr("本书资料导入") : tr("建立一册世界书") }}</h1>
        <p>{{ tr("添加资料后可直接回书稿；需要时再用 AI 建立基调。") }}</p>
        <p v-if="projectBindingLabel" class="creation-binding" data-test="creation-binding-label">{{ projectBindingLabel }}</p>
      </div>
      <div class="creation-state" :class="`is-${generationState}`" aria-live="polite">
        <strong>{{ statusLabel }}</strong>
        <small v-if="generationMessage">{{ displayNotice(generationMessage) }}</small>
      </div>
    </header>

    <main class="creation-main">
      <section class="creation-section creation-sources" aria-labelledby="source-title">
        <div class="section-heading">
          <span class="section-mark" aria-hidden="true"><WorkbenchIcon name="archive" :size="17" /></span>
          <div>
            <h2 id="source-title">{{ tr("资料") }}</h2>
            <p>{{ tr("支持多份 TXT、Markdown、PDF、DOCX，也可以直接粘贴片段。") }}</p>
          </div>
        </div>

        <div
          class="source-dropzone"
          :class="{ 'is-dragging': dragging }"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            multiple
            :aria-label="tr(&quot;导入多文件资料&quot;)"
            accept=".txt,.text,.md,.markdown,.pdf,.docx, text/plain, text/markdown, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            @change="onFileChange"
          />
          <span class="dropzone-mark" aria-hidden="true">＋</span>
          <strong>{{ tr("拖入资料，或选择多个文件") }}</strong>
          <small>{{ tr("文件在本地提取文字；扫描 PDF 会标记为需要 OCR。") }}</small>
          <button type="button" class="text-action" @click="openFilePicker">{{ tr("选择文件") }}</button>
          <button v-if="busy && workspace.generationAction === 'sources'" type="button" class="quiet-action" @click="cancelActiveTask">{{ tr("停止读取") }}</button>
        </div>

        <div class="paste-row">
          <textarea
            v-model="pastedText"
            rows="3"
            :placeholder="tr(&quot;也可以把正文、章节摘要或设定片段粘贴到这里……&quot;)"
           :aria-label="tr(&quot;粘贴资料文本&quot;)"></textarea>
          <button type="button" class="quiet-action" :disabled="!pastedText.trim() || busy" @click="addPastedSource">
            {{ tr("暂存片段") }}
          </button>
        </div>

        <div v-if="sourceQueue.length" class="source-queue" :aria-label="tr(&quot;已添加资料&quot;)">
          <div class="source-queue__head">
            <span>{{ tr('已选 {count} 份 · {chars} 字', { count: selectedSourceCount, chars: formatUiNumber(selectedCharacterCount) }) }}</span>
            <button type="button" class="text-action" @click="toggleAllSources">
              {{ selectedSourceCount === readySourceCount ? tr("取消全选") : tr("全选可用资料") }}
            </button>
          </div>
          <div v-if="bookContext?.ok" class="append-sources-line">
            <button
              type="button"
              class="primary-action"
              data-test="append-sources-confirm"
              :disabled="busy || !selectedSourceCount"
              @click="confirmAppendSources"
            >
              {{ tr('加入本书（{count}）', { count: selectedSourceCount }) }}
            </button>
            <small>{{ bookContext.mode === 'unbound' ? tr("确认时建立随书资料库。") : tr("追加到当前资料库。") }}{{ tr("重复内容自动跳过。") }}</small>
          </div>
          <div v-for="item in sourceQueue" :key="item.id" class="source-row">
            <input
              v-if="isSourceUsable(item)"
              class="source-select"
              type="checkbox"
              :checked="item.selected"
              :aria-label="tr('选用资料 {title}', { title: item.title })"
              @change="toggleSource(item.id)"
            />
            <span v-else class="source-select-placeholder" aria-hidden="true"></span>
            <span class="source-kind" aria-hidden="true">{{ sourceKindMark(item.kind) }}</span>
            <div class="source-row__body">
              <button type="button" class="source-title" :disabled="!isSourceUsable(item)" @click="toggleSourcePreview(item.id)">
                {{ item.title }}
              </button>
              <button v-if="item.status === 'memory-only'" type="button" class="source-export" @click.stop="exportSourceText(item)">
                {{ tr("导出文字") }}
              </button>
              <small v-if="item.status === 'error'" class="is-error">{{ displayNotice(item.error?.message) }}</small>
              <small v-else-if="item.status === 'needs-ocr'" class="is-warning">{{ tr("可能是扫描件，需要 OCR") }}</small>
              <small v-else-if="item.status === 'memory-only'" class="is-warning">{{ displayNotice(item.error?.message) }}</small>
              <small v-else-if="item.status === 'processing'" class="is-processing">
                {{ item.parseStatus === 'error' ? displayNotice(item.error?.message || tr("读取失败，正在整理结果……")) : tr('{progress}% · 正在读取', { progress: item.parseProgress }) }}
              </small>
              <small v-else>{{ tr('{chars} 字 · {chunks} 个片段', { chars: formatUiNumber(item.charCount), chunks: item.chunkCount }) }}</small>
            </div>
            <span class="source-status" :class="`is-${item.status}`">{{ sourceStatusLabel(item.status) }}</span>
            <button type="button" class="icon-action" :aria-label="tr('移除 {title}', { title: item.title })" @click="removeSource(item.id)">×</button>
          </div>
          <div v-if="previewSource" class="source-preview">
            <div class="source-preview__head">
              <strong>{{ previewSource.title }}</strong>
              <span>{{ tr('{count} 字 · 本地抽取预览', { count: formatUiNumber(previewSource.charCount) }) }}</span>
              <button type="button" class="text-action" @click="toggleSourcePreview(previewSource.id)">{{ tr("收起") }}</button>
            </div>
            <pre>{{ previewSource.chunks.map((chunk) => chunk.text).join('\n\n') }}</pre>
          </div>
        </div>
        <p v-else class="source-empty">{{ tr("尚未添加资料。也可以直接从一句构思开始。") }}</p>

        <div class="json-import-line">
          <input ref="jsonInput" class="visually-hidden" type="file" accept=".json,application/json" :aria-label="tr(&quot;导入设定 JSON&quot;)" @change="onJsonChange" />
          <button type="button" class="text-action" :disabled="busy" @click="openJsonPicker">{{ tr("导入 SillyTavern / Pinax JSON") }}</button>
          <span v-if="jsonPreview">{{ tr('已读取：{name} · {count} 条目', { name: jsonPreview.name, count: jsonPreview.entryCount }) }}</span>
        </div>

        <section v-if="jsonPreview" class="json-preview" :aria-label="tr(&quot;JSON 结构化预览&quot;)">
          <div class="json-preview__heading">
            <div>
              <span class="preview-kicker">STRUCTURED IMPORT</span>
              <h3>{{ jsonPreview.name }}</h3>
            </div>
            <span>{{ tr('{count} 条目', { count: jsonPreview.entryCount }) }}</span>
          </div>
          <div class="json-preview__stats">
            <span>{{ tr('{count} 个分组', { count: jsonPreview.groupCount }) }}</span>
            <span>{{ tr('{count} 条有触发词', { count: jsonPreview.keyedEntryCount }) }}</span>
            <span v-if="jsonPreview.configuredEntryCount">{{ tr('{count} 条含注入参数', { count: jsonPreview.configuredEntryCount }) }}</span>
          </div>
          <div v-if="jsonPreview.typeSummary.length" class="json-preview__types">
            <span v-for="item in jsonPreview.typeSummary" :key="item.type">{{ tr(item.label) }} {{ item.count }}</span>
          </div>
          <ol v-if="jsonPreview.previewEntries.length" class="json-preview__entries">
            <li v-for="entry in jsonPreview.previewEntries" :key="entry.id">
              <div>
                <strong>{{ entry.name }}</strong>
                <small>{{ tr(entry.typeLabel) }}<template v-if="entry.group"> · {{ entry.group }}</template></small>
              </div>
              <p>{{ entry.content || tr("未提供正文预览") }}</p>
              <small v-if="entry.keys.length">{{ tr("触发：") }}{{ entry.keys.join('、') }}</small>
            </li>
          </ol>
          <p v-else class="json-preview__empty">{{ tr("没有识别到可导入条目，无法确认导入。") }}</p>
          <div v-if="jsonNameConflict" class="json-conflict" data-test="json-name-conflict" role="status">
            <p class="json-conflict-note">{{ tr('已存在同名世界书「{name}」。选择处理方式：', { name: jsonNameConflict.name }) }}</p>
            <label class="rebind-choice"><input v-model="jsonImportMode" type="radio" value="create" /> {{ tr("新建为独立世界书（默认）") }}</label>
            <label class="rebind-choice"><input v-model="jsonImportMode" type="radio" value="update" /> {{ tr("并入同名世界书（按名称+类型逐条：新增/更新/跳过）") }}</label>
          </div>
          <div v-if="jsonPreview.entryCount" class="json-preview__actions">
            <button type="button" class="primary-action" :disabled="busy" @click="confirmJsonImport">
              {{ tr(jsonImportMode === 'update' && jsonNameConflict ? '并入同名世界书' : jsonConfirmLabel) }}
            </button>
            <label v-if="bookContext?.ok && bookContext.mode === 'project'" class="rebind-choice">
              <input v-model="rebindAfterCreate" type="checkbox" />
              {{ tr("新建后更换本书关联") }}
            </label>
            <span>{{ tr("确认后进入详细设定。") }}</span>
          </div>
        </section>
      </section>

      <section class="creation-section creation-foundation" aria-labelledby="foundation-title">
        <div class="section-heading">
          <span class="section-mark" aria-hidden="true"><WorkbenchIcon name="sparkles" :size="17" /></span>
          <div>
            <h2 id="foundation-title">{{ tr("基础基调") }}</h2>
            <p>{{ tr("这里只建立世界骨架、文风和一致性边界，不一次生成整本世界书。") }}</p>
          </div>
        </div>

        <label class="field-label">
          {{ tr("世界书名称") }}
          <input v-model.trim="workspace.name" type="text" :placeholder="tr(&quot;例如：风雪港调查案&quot;)" :aria-label="tr(&quot;作品名&quot;)" />
        </label>
        <label class="field-label">
          {{ tr("一句构思或提炼方向") }}
          <textarea v-model="brief" rows="6" :placeholder="tr(&quot;例如：蒸汽港城在每次退潮后会露出一段被抹去的历史……&quot;)" :aria-label="tr(&quot;资料简介&quot;)"></textarea>
        </label>

        <div class="foundation-actions">
          <button type="button" class="primary-action" :disabled="!canGenerate || (busy && !cancelAvailable)" @click="cancelAvailable ? cancelActiveTask() : generateFoundation()">
            {{ cancelAvailable ? tr("停止生成") : (busy ? tr("正在整理……") : tr("生成基础基调")) }}
          </button>
          <span>{{ tr("仅发送选中的资料；长文会取开头、中段和结尾代表片段。") }}</span>
        </div>

        <div v-if="pendingPayload" class="foundation-preview" aria-live="polite">
          <div class="preview-heading">
            <div>
              <span class="preview-kicker">DRAFT / FOUNDATION</span>
              <h3>{{ pendingPayload.name }}</h3>
            </div>
            <span>{{ tr("待确认") }}</span>
          </div>
          <p>{{ pendingPayload.worldDescription }}</p>
          <dl>
            <div><dt>{{ tr("文风") }}</dt><dd>{{ pendingPayload.writingStyle || tr("未填写") }}</dd></div>
            <div><dt>{{ tr("禁写") }}</dt><dd>{{ pendingPayload.forbidden || tr("未填写") }}</dd></div>
          </dl>
          <div class="preview-actions">
            <button type="button" class="primary-action" :disabled="busy" @click="confirmFoundation">
              {{ tr(foundationConfirmLabel) }}
            </button>
            <button type="button" class="quiet-action" :disabled="busy" @click="pendingPayload = null">{{ tr("重新生成") }}</button>
            <label v-if="bookContext?.ok && bookContext.mode === 'project'" class="rebind-choice">
              <input v-model="rebindAfterCreate" type="checkbox" />
              {{ tr("新建后更换本书关联") }}
            </label>
          </div>
        </div>
      </section>

      <aside class="creation-summary" :aria-label="tr(&quot;创建进度&quot;)">
        <h2>{{ workspace.name || tr("未命名世界书") }}</h2>
        <dl>
          <div><dt>{{ tr("资料") }}</dt><dd>{{ tr('{selected} / {total} 份参与', { selected: selectedSourceCount, total: readySourceCount }) }}</dd></div>
          <div><dt>{{ tr("文字") }}</dt><dd>{{ tr('{selected} / {total} 字', { selected: formatUiNumber(selectedCharacterCount), total: formatUiNumber(sourceCharacterCount) }) }}</dd></div>
          <div><dt>{{ tr("状态") }}</dt><dd>{{ statusLabel }}</dd></div>
        </dl>
        <div class="summary-storage" :class="{ 'is-warning': archiveUsageWarning }">
          <div class="summary-storage__line">
            <span>{{ tr("本地归档") }}</span>
            <strong>{{ archiveUsageLabel }}</strong>
          </div>
          <small>{{ tr("只保存抽取文字与定位信息，原始文件不会上传。") }}</small>
          <button type="button" class="text-action" :disabled="archiveCleaning" @click="cleanupArchive">
            {{ archiveCleaning ? tr("清理中……") : tr("清理未引用资料") }}
          </button>
        </div>
        <p class="summary-note">{{ tr("刷新或离开页面后，已暂存的创建工作区仍可恢复。") }}</p>
      </aside>
    </main>

    <p v-if="errorMessage" class="creation-message is-error" role="alert">{{ displayNotice(errorMessage) }}</p>
    <p v-if="infoMessage" class="creation-message" aria-live="polite">{{ displayNotice(infoMessage) }}</p>
  </div>
</template>

<style scoped>
.creation-binding { margin-top: 4px; font-size: 13px; color: var(--text-secondary); }
.append-sources-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 0; }
.append-sources-line small { color: var(--text-secondary); }
.rebind-choice { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--text-secondary); }
.json-conflict { display: grid; gap: 6px; }
.json-conflict-note { padding: 8px 10px; border-left: 3px solid var(--warning, #d97706); background: color-mix(in srgb, var(--warning, #d97706) 8%, transparent); font-size: 14px; }

.creation-page {
  min-height: var(--app-viewport-height, 100vh);
  padding: 18px clamp(14px, 3vw, 42px) 42px;
  background:
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--accent-light, #dbeafe) 35%, transparent), transparent 28%),
    var(--bg-primary);
  color: var(--text-primary);
}

.creation-header,
.creation-main {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.creation-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 20px;
  align-items: start;
  padding: 24px 0 20px;
  border-bottom: 1px solid var(--border);
}

.creation-back,
.text-action,
.quiet-action,
.icon-action {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.creation-back,
.text-action {
  padding: 5px 0;
  font-size: 13px;
}

.creation-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: start;
}

.creation-back > span:first-child {
  color: var(--accent);
  font-size: 21px;
  line-height: 0.8;
}

.creation-back:hover,
.text-action:hover,
.quiet-action:hover,
.icon-action:hover { color: var(--accent); }

.creation-kicker,
.summary-kicker,
.preview-kicker {
  color: var(--text-muted);
  font: 600 10px/1.2 var(--font-mono, ui-monospace, monospace);
  letter-spacing: .16em;
}

.creation-header h1 {
  margin: 8px 0 8px;
  font: 650 clamp(26px, 4vw, 42px)/1.12 var(--font-display, Georgia, serif);
}

.creation-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.65;
}

.creation-state {
  display: grid;
  justify-items: end;
  gap: 3px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: right;
}

.creation-state strong {
  color: var(--text-secondary);
  font-weight: 650;
}

.creation-state small {
  max-width: 240px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.creation-state.is-generating strong,
.creation-state.is-preparing strong,
.creation-state.is-validating strong {
  color: var(--accent);
}

.creation-state.is-error strong,
.creation-state.is-cancelled strong,
.creation-state.is-stale strong {
  color: var(--danger, #b44);
}

.creation-state.is-partial strong {
  color: var(--warning, #936d18);
}

.creation-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 38px;
  padding-top: 32px;
}

.creation-section {
  padding: 0 0 34px;
  border-bottom: 1px solid var(--border);
}

.creation-section + .creation-section { padding-top: 34px; }

.section-heading {
  display: flex;
  gap: 12px;
  margin-bottom: 22px;
}

.section-mark {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 68%, var(--border));
  color: var(--accent);
}

.section-heading h2 {
  margin: 0 0 5px;
  font-size: 20px;
  font-weight: 650;
}

.source-dropzone {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 34px 18px 30px;
  border: 1px dashed color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--bg-secondary) 65%, transparent);
  text-align: center;
  transition: background .16s ease, border-color .16s ease;
}

.source-dropzone.is-dragging {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-light, #dbeafe) 45%, var(--bg-secondary));
}

.dropzone-mark {
  color: var(--accent);
  font-size: 28px;
  line-height: 1;
}

.source-dropzone small,
.foundation-actions span,
.summary-note,
.source-row small,
.json-import-line span {
  color: var(--text-muted);
  font-size: 12px;
}

.paste-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  margin-top: 14px;
}
.paste-row .quiet-action { align-self: end; }

textarea,
input[type='text'] {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.6;
  resize: vertical;
}

textarea:focus,
input[type='text']:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-color: var(--accent);
}

.source-queue { margin-top: 18px; }

.source-queue__head,
.source-preview__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.source-queue__head {
  justify-content: space-between;
  padding: 0 0 9px;
}

.source-row {
  display: grid;
  grid-template-columns: 18px 34px minmax(0, 1fr) auto 24px;
  gap: 10px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid var(--border);
}

.source-kind {
  color: var(--accent);
  font: 600 10px var(--font-mono, ui-monospace, monospace);
}

.source-select {
  accent-color: var(--accent);
}

.source-select-placeholder {
  width: 14px;
  height: 14px;
}

.source-row__body { min-width: 0; }
.source-title,
.source-row__body small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-title {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.source-title:disabled { color: var(--text-secondary); cursor: wait; }
.source-title:hover { color: var(--accent); }
.source-export {
  display: block;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.source-status { font-size: 12px; color: var(--text-muted); }
.source-status.is-ready { color: var(--accent); }
.source-status.is-processing { color: var(--accent); }
.source-status.is-error,
.is-error { color: var(--danger, #b44); }
.is-processing { color: var(--accent); }
.source-status.is-memory-only,
.is-memory-only,
.is-warning { color: var(--warning, #936d18); }
.icon-action { font-size: 18px; padding: 0; }
.source-empty { color: var(--text-muted); font-size: 13px; }

.source-preview {
  margin: 4px 0 0 52px;
  padding: 13px 0 4px;
  border-top: 1px solid var(--border);
}

.source-preview__head span { margin-right: auto; }
.source-preview pre {
  max-height: 240px;
  margin: 10px 0 0;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--text-secondary);
  font: 13px/1.75 var(--font-body, inherit);
}

.json-import-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 18px;
}

.json-preview {
  margin-top: 14px;
  padding: 14px 0 2px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
}

.json-preview__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.json-preview__heading h3 {
  margin: 6px 0 0;
  font-size: 16px;
}

.json-preview__heading > span,
.json-preview__stats,
.json-preview__types,
.json-preview__entries small {
  color: var(--text-muted);
  font-size: 11px;
}

.json-preview__stats,
.json-preview__types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 10px;
}

.json-preview__types span {
  color: var(--accent);
}

.json-preview__entries {
  display: grid;
  gap: 0;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

.json-preview__entries li {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.json-preview__entries li > div {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
}

.json-preview__entries strong {
  color: var(--text-primary);
  font-size: 13px;
}

.json-preview__entries p {
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.json-preview__empty {
  color: var(--danger, #b44);
  font-size: 12px;
}

.json-preview__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
}

.json-preview__actions span {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.field-label {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--text-secondary);
  font-size: 13px;
}

.foundation-actions,
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.primary-action,
.quiet-action {
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 2px;
  cursor: pointer;
  font: inherit;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.primary-action {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-contrast, #fff);
}

.primary-action:disabled,
.quiet-action:disabled,
.text-action:disabled { opacity: .48; cursor: not-allowed; }

.quiet-action { border: 1px solid var(--border); background: transparent; color: var(--text-secondary); }

.foundation-preview {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
}

.preview-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
.preview-heading h3 { margin: 7px 0 0; font-size: 18px; }
.foundation-preview > p { line-height: 1.8; color: var(--text-primary); }
.foundation-preview dl,
.creation-summary dl { margin: 18px 0; }
.foundation-preview dl > div,
.creation-summary dl > div { display: grid; grid-template-columns: 54px 1fr; gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); }
dt { color: var(--text-muted); font-size: 12px; }
dd { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }

.creation-summary {
  align-self: start;
  position: sticky;
  top: 20px;
  padding-top: 3px;
}

.creation-summary h2 { margin: 10px 0 22px; font: 650 22px/1.3 var(--font-display, Georgia, serif); }
.summary-storage {
  display: grid;
  gap: 7px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.summary-storage__line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
}
.summary-storage__line strong { color: var(--text-secondary); font-weight: 650; }
.summary-storage small { color: var(--text-muted); font-size: 11px; line-height: 1.5; }
.summary-storage.is-warning .summary-storage__line strong { color: var(--warning, #936d18); }
.creation-message { width: min(1180px, 100%); margin: 18px auto 0; color: var(--accent); font-size: 13px; }
.creation-message.is-error { color: var(--danger, #b44); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 820px) {
  .creation-header { grid-template-columns: 1fr auto; gap: 12px; }
  .creation-back { grid-column: 1 / -1; justify-self: start; }
  .creation-main { grid-template-columns: 1fr; gap: 28px; }
  .creation-summary { position: static; order: -1; padding: 16px 0; border-bottom: 1px solid var(--border); }
}

@media (max-width: 560px) {
  .creation-page { padding-inline: 14px; }
  .creation-header { padding-top: 18px; grid-template-columns: minmax(0, 1fr); }
  .creation-header h1 { font-size: 29px; }
  .creation-state { justify-items: start; text-align: left; font-size: 11px; }
  .creation-state small { max-width: min(260px, 70vw); }
  .paste-row { grid-template-columns: 1fr; }
  .paste-row .quiet-action { justify-self: start; }
  .source-row { grid-template-columns: 18px 30px minmax(0, 1fr) 24px; }
  .source-status { display: none; }
  .source-title {
    overflow: visible;
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
  }
  .source-preview { margin-left: 48px; }

  .creation-summary {
    display: grid;
    order: initial;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 9px 16px;
    padding: 12px 0 14px;
  }

  .creation-summary .summary-kicker,
  .creation-summary .summary-storage,
  .creation-summary .summary-note {
    grid-column: 1 / -1;
  }

  .creation-summary h2 {
    align-self: center;
    margin: 0;
    font-size: 18px;
    line-height: 1.25;
  }

  .creation-summary dl {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 0;
  }

  .creation-summary dl > div {
    display: grid;
    grid-template-columns: none;
    gap: 2px;
    min-width: 0;
    padding: 0;
    border-top: 0;
  }

  .creation-summary dt,
  .creation-summary dd { white-space: normal; overflow-wrap: anywhere; }

  .creation-summary dl { flex-wrap: wrap; }
  .creation-summary { grid-template-columns: minmax(0, 1fr); }

  .creation-summary dd {
    font-size: 12px;
  }

  .summary-storage {
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    margin-top: 2px;
    padding-top: 10px;
  }

  .summary-storage__line {
    grid-column: 1 / -1;
  }

  .summary-storage small {
    grid-column: 1 / -1;
  }

  .summary-storage .text-action {
    justify-self: start;
  }

  .summary-note {
    margin: 0;
  }
}
</style>
