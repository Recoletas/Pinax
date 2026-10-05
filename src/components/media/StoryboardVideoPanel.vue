<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import VideoModelPicker from './VideoModelPicker.vue'
import StoryboardVideoResults from './StoryboardVideoResults.vue'
import { selectStoryboardVideoHistory, storyboardVideoMatchesShot } from '../../services/media/storyboardVideoHistory.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { useTransientLayer } from '../../composables/useTransientLayer'
import AgentResultTray from '../agent/AgentResultTray.vue'
import { useAdvisor } from '../../composables/useAdvisor'
import { buildShotVideoPrompt, buildStoryboardVideoJobInput } from '../../composables/useDirector'
import { listMediaAssets, saveExternalMediaAsset } from '../../services/media/mediaAssetStore'
import { saveStoryboardVideoOriginal } from '../../services/media/storyboardVideoArchive.js'
import { videoJobService } from '../../services/media/videoJobService'
import {
  getSelectedVideoProviderConfigId,
  listVideoProviderConfigs,
  MINIMAX_VIDEO_MODELS,
  saveSelectedVideoProviderConfigId,
  toVideoProviderConfig
} from '../../services/media/videoProviderConfigStore'
import { CAMERA_MOVEMENTS, SHOT_TYPES } from '../../types/director'
import { buildStoryboardAgentContext } from '../../services/agents/storyboardAgentContext'
import {
  applyStoryboardShotPatch,
  canUndoStoryboardShotPatch,
  undoStoryboardShotPatch,
  validateStoryboardAgentResult
} from '../../services/agents/storyboardAgentResults'

const props = defineProps({
  context: { type: Object, default: null },
  stale: { type: Boolean, default: false },
  projectId: { type: String, default: null }
})

const emit = defineEmits(['close', 'archived', 'shots-updated'])

const BUILTIN_PROVIDERS = Object.freeze([
  {
    id: 'minimax-video',
    label: 'MiniMax Video',
    capabilities: { models: MINIMAX_VIDEO_MODELS, aspectRatios: ['16:9'] }
  },
  {
    id: 'generic-async-http',
    label: '自定义异步 HTTP',
    capabilities: { models: ['custom'], aspectRatios: ['16:9', '9:16', '1:1'] }
  }
])

const providers = ref([...BUILTIN_PROVIDERS])
const videoConfigs = ref([])
const selectedVideoConfigId = ref('')
const providerId = ref('minimax-video')
const model = ref('MiniMax-Hailuo-2.3')
const aspectRatio = ref('16:9')
const durationSeconds = ref(6)
const selectedShotIndex = ref(0)
const videoPrompt = ref('')
const shots = ref([])
const job = ref(null)
const message = ref('')
const hasError = ref(false)
const backendContractOutdated = ref(false)
const pollingController = ref(null)
const submitting = ref(false)
const checking = ref(false)
const cancelling = ref(false)
const testingConnection = ref(false)
const queryUnavailable = ref(false)
const archived = ref(false)
const recoveryAvailable = ref(true)
const taskSnapshot = ref(null)
const savedVideoAssets = ref([])
const historyError = ref('')
const savingVideoIds = ref(new Set())
const videoDownloads = new Map()
const closeRef = ref(null)
const panelOpen = ref(true)
const promptDrafts = new Map()
let disposed = false
let activeAttempt = null
let connectionRevision = 0
const scopeKey = computed(() => JSON.stringify([props.projectId || null, props.context?.document?.id || null]))
const taskStorageKey = (scope) => `pinax:storyboard-video:last:${scope}`
const minimax = reactive({
  resolution: '768P',
  promptOptimizer: false,
  fastPretreatment: false,
  aigcWatermark: false
})

const selectedShot = computed(() => shots.value[selectedShotIndex.value] || null)
const previousShot = computed(() => selectedShotIndex.value > 0 ? shots.value[selectedShotIndex.value - 1] : null)
const selectedVideoConfig = computed(() => videoConfigs.value.find((item) => item.id === selectedVideoConfigId.value) || null)
const version = computed(() => props.context?.version || {})
const documentTitle = computed(() => props.context?.document?.source?.title || props.context?.document?.title || '当前分镜')
const currentProvider = computed(() => providers.value.find((item) => item.id === providerId.value) || null)
const isMinimax = computed(() => providerId.value === 'minimax-video')
const isHailuoModel = computed(() => ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'].includes(model.value))
const minimaxResolutions = computed(() => isHailuoModel.value ? ['768P', '1080P'] : ['720P', '1080P'])
const minimaxDurations = computed(() => isHailuoModel.value && minimax.resolution === '768P' ? [6, 10] : [6])
const aspectRatios = computed(() => currentProvider.value?.capabilities?.aspectRatios || ['16:9', '9:16', '1:1'])
const busy = computed(() => submitting.value || cancelling.value || (!queryUnavailable.value && ['queued', 'submitted', 'running'].includes(job.value?.status)))
const progress = computed(() => Math.max(0, Math.min(100, Number(job.value?.progress) || 0)))
const outputUrl = computed(() => job.value?.outputs?.find((item) => /^https?:\/\//i.test(item?.url))?.url || '')
const historyScope = computed(() => ({
  projectId: props.projectId, document: props.context?.document || {}, version: version.value,
  shot: selectedShot.value, shotIndex: selectedShotIndex.value
}))
const historyScopeKey = computed(() => JSON.stringify([scopeKey.value, selectedShot.value?.nodeId || selectedShot.value?.shotId || selectedShotIndex.value]))
const currentJobAsset = computed(() => {
  const snapshot = taskSnapshot.value
  if (!job.value?.id || !snapshot) return null
  const output = job.value.outputs?.find((item) => item?.url === outputUrl.value)
  return {
    id: `video-job-${job.value.id}`, generationJobId: job.value.id,
    projectId: snapshot.projectId, kind: 'video', purpose: 'storyboard-take',
    externalUrl: outputUrl.value, createdAt: snapshot.createdAt || job.value.createdAt || Date.now(),
    promptSnapshot: snapshot.input.prompt, sourceRefs: snapshot.input.sourceRefs,
    model: job.value.model, durationSeconds: snapshot.input.durationSeconds,
    generationParams: {
      ...snapshot.shot, shotSequence: snapshot.shot?.sequence || 1,
      storyboardDocumentId: snapshot.documentId, storyboardVersionId: snapshot.versionId,
      aspectRatio: snapshot.input.aspectRatio, resolution: snapshot.resolution,
      externalUrlExpiresAt: output?.expiresAt || null
    },
    unsaved: !archived.value
  }
})
const currentJobMatchesShot = computed(() => currentJobAsset.value && storyboardVideoMatchesShot(currentJobAsset.value, historyScope.value))
const videoHistory = computed(() => {
  const records = [...savedVideoAssets.value]
  const current = currentJobAsset.value
  if (current && outputUrl.value && !archived.value && !records.some((item) => item.generationJobId === current.generationJobId)) records.unshift(current)
  return selectStoryboardVideoHistory(records, historyScope.value)
})
const canSubmit = computed(() => !busy.value && !props.stale && selectedShot.value && videoPrompt.value.trim() && videoPrompt.value.length <= 2000 && selectedVideoConfig.value)
const taskShotLabel = computed(() => `镜头 ${taskSnapshot.value?.shot?.sequence || 1}`)
const promptDraftKey = () => `${version.value.versionId || ''}:${selectedShot.value?.shotId || selectedShot.value?.nodeId || selectedShotIndex.value}`
const statusLabel = computed(() => ({
  queued: '等待生成', submitted: '已提交', running: '生成中', succeeded: '生成完成', failed: '生成失败', cancelled: '已停止等待'
})[job.value?.status] || '准备中')
const selectedShotMeta = computed(() => {
  const shot = selectedShot.value
  if (!shot) return ''
  const shotTypeId = shot.shotType || shot.shotSize
  const cameraId = shot.camera || shot.cameraMovement
  const transitionLabels = { none: '无转场', cut: '切入', dissolve: '叠化', fade: '淡入淡出' }
  return [
    `镜头 ${selectedShotIndex.value + 1} / ${shots.value.length}`,
    SHOT_TYPES[shotTypeId]?.label || shotTypeId,
    CAMERA_MOVEMENTS[cameraId]?.label || cameraId,
    transitionLabels[shot.transition] || shot.transition,
    shot.relationLabel || shot.relationType
  ].filter(Boolean).join(' · ')
})

const {
  advisorResults,
  advisorLoading,
  askAdvisor,
  updateAdvisorResultStatus,
  dismissResult
} = useAdvisor({
  resultValidator(result, { task }) {
    return validateStoryboardAgentResult(result, {
      taskType: task.taskType,
      target: task.target
    })
  }
})

watch(() => props.context, (context) => {
  const source = context?.shots || context?.version?.shots || []
  shots.value = source.map((shot) => ({ ...shot }))
}, { immediate: true })

watch(shots, (nextShots) => {
  if (selectedShotIndex.value >= nextShots.length) {
    selectedShotIndex.value = Math.max(0, nextShots.length - 1)
  }
  refreshVideoPrompt()
  if (isMinimax.value) {
    normalizeMinimaxOptions()
    return
  }
  durationSeconds.value = normalizeShotDuration(selectedShot.value)
}, { immediate: true })

watch(selectedShotIndex, () => {
  if (!busy.value) { message.value = ''; hasError.value = false }
  refreshVideoPrompt()
  if (!isMinimax.value) durationSeconds.value = normalizeShotDuration(selectedShot.value)
})
watch(videoPrompt, (prompt) => promptDrafts.set(promptDraftKey(), prompt), { flush: 'sync' })
watch(scopeKey, () => {
  stopVideoDownloads()
  connectionRevision += 1
  testingConnection.value = false
  releaseAttempt()
  promptDrafts.clear()
  job.value = null
  taskSnapshot.value = null
  message.value = ''
  hasError.value = false
  archived.value = false
  queryUnavailable.value = false
  reloadVideoHistory()
  restoreTask()
}, { flush: 'sync' })

watch(selectedVideoConfigId, () => {
  connectionRevision += 1
  testingConnection.value = false
  try { saveSelectedVideoProviderConfigId(selectedVideoConfigId.value) } catch { /* Selection still works for this visit. */ }
  applySelectedVideoConfig()
})

watch(providerId, (id) => {
  const provider = providers.value.find((item) => item.id === id)
  if (id === 'minimax-video') {
    if (!MINIMAX_VIDEO_MODELS.includes(model.value)) model.value = MINIMAX_VIDEO_MODELS[0]
  } else {
    model.value = selectedVideoConfig.value?.providerId === id
      ? selectedVideoConfig.value.model
      : provider?.capabilities?.models?.[0] || 'custom'
  }
  const ratios = provider?.capabilities?.aspectRatios || []
  if (ratios.length && !ratios.includes(aspectRatio.value)) aspectRatio.value = ratios[0]
  if (id === 'minimax-video') normalizeMinimaxOptions()
  else durationSeconds.value = normalizeShotDuration(selectedShot.value)
})

watch([model, () => minimax.resolution], normalizeMinimaxOptions)

onMounted(() => {
  loadVideoConfigs()
  void loadProviders()
  reloadVideoHistory()
  restoreTask()
  window.addEventListener('storage', handleHistoryStorage)
})
onBeforeUnmount(() => {
  stopVideoDownloads()
  disposed = true
  window.removeEventListener('storage', handleHistoryStorage)
  connectionRevision += 1
  releaseAttempt()
})
useTransientLayer({
  id: 'storyboard-video-panel',
  isOpen: panelOpen,
  exclusive: false,
  initialFocus: () => closeRef.value,
  onClose: () => { if (!submitting.value) emit('close') }
})

async function loadProviders() {
  try {
    const result = await videoJobService.listProviders()
    if (disposed) return
    providers.value = mergeProviderMetadata(result?.providers)
    if (providers.value.length && !providers.value.some((item) => item.id === providerId.value)) {
      providerId.value = providers.value[0].id
    }
    if (isMinimax.value) normalizeMinimaxOptions()
  } catch (error) {
    if (disposed) return
    hasError.value = true
    message.value = error?.message || '无法读取视频渠道'
  }
}

function buildProviderConfig() {
  if (!selectedVideoConfig.value) return {}
  return toVideoProviderConfig({
    ...selectedVideoConfig.value,
    model: model.value,
    resolution: isMinimax.value ? minimax.resolution : selectedVideoConfig.value.resolution
  })
}

async function testConnection() {
  if (testingConnection.value || busy.value) return
  const revision = ++connectionRevision
  testingConnection.value = true
  message.value = '正在检查视频渠道…'
  hasError.value = false
  try {
    if (!selectedVideoConfig.value) throw new Error('请先选择视频模型。')
    if (isMinimax.value && backendContractOutdated.value) throw new Error('当前视频服务需要更新，请联系站点维护者。')
    const result = await videoJobService.testProvider(providerId.value, buildProviderConfig())
    if (disposed || revision !== connectionRevision) return
    hasError.value = !result?.ok
    message.value = result?.ok ? '视频渠道可用' : (result?.message || '视频渠道暂不可用')
  } catch (error) {
    if (disposed || revision !== connectionRevision) return
    hasError.value = true
    message.value = error?.message || '连接检查失败'
  } finally {
    if (revision === connectionRevision) testingConnection.value = false
  }
}

function ownsAttempt(attempt) {
  return !disposed && activeAttempt === attempt && scopeKey.value === attempt.scope
}

function releaseAttempt() {
  pollingController.value?.abort()
  pollingController.value = null
  activeAttempt = null
  submitting.value = false
  checking.value = false
  cancelling.value = false
}

function persistTask(attempt, result) {
  // Provider credentials and reference-image binaries never enter the recovery record.
  const safeJob = {
    id: result.id, projectId: result.projectId, providerId: result.providerId,
    model: result.model, status: result.status, progress: result.progress,
    outputs: result.outputs, error: result.error
  }
  try {
    sessionStorage.setItem(taskStorageKey(attempt.scope), JSON.stringify({
      scope: attempt.scope, snapshot: attempt.snapshot, job: safeJob,
      archived: attempt.archived === true
    }))
    if (ownsAttempt(attempt)) recoveryAvailable.value = true
  } catch {
    if (ownsAttempt(attempt)) recoveryAvailable.value = false
  }
}

function restoreTask() {
  let saved
  try { saved = JSON.parse(sessionStorage.getItem(taskStorageKey(scopeKey.value)) || 'null') } catch { return }
  if (!saved?.job?.id || !saved.snapshot?.input || saved.scope !== scopeKey.value
    || (saved.snapshot.projectId || null) !== (props.projectId || null)) return
  job.value = saved.job
  taskSnapshot.value = saved.snapshot
  const localAsset = savedVideoAssets.value.find((asset) => asset.generationJobId === saved.job.id && asset.storageRef?.startsWith('idb://'))
  archived.value = Boolean(localAsset)
  const attempt = { scope: scopeKey.value, snapshot: saved.snapshot, archived: Boolean(localAsset) }
  activeAttempt = attempt
  if (!videoJobService.isTerminal(saved.job.status)) void watchTask(attempt, saved.job.id)
}

async function submitJob() {
  if (!canSubmit.value) return
  if (isMinimax.value && backendContractOutdated.value) {
    hasError.value = true
    message.value = '当前视频服务需要更新，请联系站点维护者。'
    return
  }
  releaseAttempt()
  connectionRevision += 1
  testingConnection.value = false
  const attempt = { scope: scopeKey.value, snapshot: null, archived: false }
  activeAttempt = attempt
  submitting.value = true
  job.value = null
  queryUnavailable.value = false
  message.value = ''
  hasError.value = false
  archived.value = false
  try {
    const storyboardInput = buildStoryboardVideoJobInput({
      shots: shots.value, shotIndex: selectedShotIndex.value,
      promptOverride: videoPrompt.value, documentId: props.context?.document?.id,
      versionId: version.value.versionId, versionFingerprint: props.context?.fingerprint,
      projectId: props.projectId, sourceRefs: props.context?.document?.sourceRefs || [],
      durationSeconds: durationSeconds.value, aspectRatio: aspectRatio.value
    })
    if (isMinimax.value) storyboardInput.input.referenceImages = []
    const snapshot = JSON.parse(JSON.stringify({
      projectId: storyboardInput.projectId,
      documentId: props.context?.document?.id, versionId: version.value.versionId, createdAt: Date.now(),
      shot: { ...storyboardInput.shot, nodeId: selectedShot.value?.nodeId || null },
      input: { ...storyboardInput.input, referenceImages: [] },
      resolution: isMinimax.value ? minimax.resolution : null
    }))
    attempt.snapshot = snapshot
    taskSnapshot.value = snapshot
    const created = await videoJobService.createJob({
      ...storyboardInput, providerId: providerId.value,
      model: model.value, providerConfig: buildProviderConfig()
    })
    if (!created?.id || !created?.status) throw new Error('视频服务未返回任务编号，请确认渠道记录后再试。')
    // Preserve a task submitted just before leaving; its next owner can resume it.
    persistTask(attempt, created)
    if (!ownsAttempt(attempt)) return
    job.value = created
    submitting.value = false
    await watchTask(attempt, created.id)
  } catch (error) {
    if (!ownsAttempt(attempt)) return
    hasError.value = true
    message.value = error?.code === 'ERR_REQUEST_TIMEOUT'
      ? '提交响应超时，任务可能已被渠道接收。请先检查渠道记录，确认后再生成，避免重复提交。'
      : error?.message || '视频任务提交失败'
  } finally {
    if (ownsAttempt(attempt)) submitting.value = false
  }
}

async function watchTask(attempt, id) {
  if (!ownsAttempt(attempt)) return
  pollingController.value?.abort()
  const controller = new AbortController()
  pollingController.value = controller
  checking.value = true
  queryUnavailable.value = false
  try {
    const completed = await videoJobService.pollUntilDone(id, {
      signal: controller.signal,
      onUpdate: (updated) => {
        if (!ownsAttempt(attempt) || controller.signal.aborted) return
        job.value = updated
        persistTask(attempt, updated)
      }
    })
    if (!ownsAttempt(attempt) || controller.signal.aborted) return
    job.value = completed
    if (completed.status === 'succeeded') archiveResult(completed, attempt)
    else if (completed.status === 'failed') {
      hasError.value = true
      message.value = completed.error?.message || '视频生成失败，可调整描述后重试。'
    } else if (!videoJobService.isTerminal(completed.status)) {
      message.value = '视频仍在处理，可以稍后继续查询，无需重新生成。'
    }
  } catch (error) {
    if (!ownsAttempt(attempt) || controller.signal.aborted || error?.code === 'ERR_ABORTED') return
    hasError.value = true
    if (error?.status === 404) {
      queryUnavailable.value = true
      message.value = '这条任务已无法查询。服务可能已重启；请先确认原任务结果，再重新生成。'
    } else message.value = `${error?.message || '暂时无法查询进度'}。可继续查询当前任务。`
  } finally {
    if (ownsAttempt(attempt) && pollingController.value === controller) checking.value = false
  }
}

function resumeQuery() {
  if (!job.value?.id || checking.value || cancelling.value) return
  const attempt = activeAttempt || { scope: scopeKey.value, snapshot: taskSnapshot.value, archived: archived.value }
  activeAttempt = attempt
  message.value = ''
  hasError.value = false
  void watchTask(attempt, job.value.id)
}

async function cancelJob() {
  if (!job.value?.id || cancelling.value || submitting.value) return
  const attempt = activeAttempt
  if (!attempt) return
  pollingController.value?.abort()
  cancelling.value = true
  checking.value = false
  try {
    let result
    try { result = await videoJobService.cancelJob(job.value.id) } catch (error) {
      if (error?.status !== 409) throw error
      result = await videoJobService.getJob(job.value.id)
    }
    if (!ownsAttempt(attempt)) return
    job.value = result
    persistTask(attempt, result)
    hasError.value = false
    if (result.status === 'succeeded') archiveResult(result, attempt)
    else message.value = result.status === 'cancelled'
      ? '已停止等待。视频渠道可能仍在生成，请在渠道记录中确认。'
      : '停止请求已发出，请继续查询结果。'
  } catch (error) {
    if (!ownsAttempt(attempt)) return
    hasError.value = true
    message.value = `${error?.message || '停止等待失败'}。可继续查询当前任务。`
  } finally {
    if (ownsAttempt(attempt)) cancelling.value = false
  }
}

function stopVideoDownloads() {
  for (const controller of videoDownloads.values()) controller.abort()
  videoDownloads.clear()
  savingVideoIds.value = new Set()
}

async function saveVideoOriginal(asset, attempt = null) {
  if (!asset || videoDownloads.has(asset.id) || disposed) return
  const scope = scopeKey.value
  if ((asset.projectId || null) !== (props.projectId || null)) return
  const controller = new AbortController()
  videoDownloads.set(asset.id, controller)
  savingVideoIds.value = new Set(videoDownloads.keys())
  try {
    const saved = await saveStoryboardVideoOriginal(asset, { signal: controller.signal })
    if (disposed || controller.signal.aborted || scope !== scopeKey.value) return
    const owner = attempt || activeAttempt
    if (owner && ownsAttempt(owner) && job.value?.id === asset.generationJobId) {
      owner.archived = true
      archived.value = true
      persistTask(owner, job.value)
    }
    hasError.value = false
    message.value = '视频原件已保存在当前浏览器，完整备份会包含这个视频。'
    reloadVideoHistory()
    if (!saved.reused) emit('archived', saved.asset)
  } catch (error) {
    if (disposed || controller.signal.aborted || scope !== scopeKey.value) return
    hasError.value = true
    message.value = `视频链接已保留，但原件尚未保存：${error?.message || '保存失败'}。可重试保存原件。`
    reloadVideoHistory()
  } finally {
    if (videoDownloads.get(asset.id) === controller) {
      videoDownloads.delete(asset.id)
      savingVideoIds.value = new Set(videoDownloads.keys())
    }
  }
}

async function archiveResult(completed, attempt = activeAttempt) {
  if (!attempt || !ownsAttempt(attempt) || !completed?.id) return
  const output = completed.outputs?.find((item) => /^https?:\/\//i.test(item?.url))
  if (!output) {
    hasError.value = true
    message.value = '视频任务已结束，但渠道没有返回可播放地址。请到渠道记录中查看。'
    return
  }
  const snapshot = attempt.snapshot
  try {
    let asset = listMediaAssets({ projectId: snapshot.projectId, kind: 'video', purpose: 'storyboard-take' })
      .find((asset) => asset.generationJobId === completed.id)
    if (!asset) asset = saveExternalMediaAsset({
      id: `video-job-${completed.id}`,
      projectId: snapshot.projectId, kind: 'video', purpose: 'storyboard-take',
      generationJobId: completed.id, provider: completed.providerId, model: completed.model,
      promptSnapshot: snapshot.input.prompt,
      generationParams: {
        durationSeconds: snapshot.input.durationSeconds, aspectRatio: snapshot.input.aspectRatio,
        resolution: snapshot.resolution, ...snapshot.shot, shotSequence: snapshot.shot?.sequence || 1,
        storyboardDocumentId: snapshot.documentId || props.context?.document?.id || null,
        storyboardVersionId: snapshot.versionId || null,
        providerFileId: output.fileId || null, externalUrlExpiresAt: output.expiresAt || null
      },
      durationSeconds: snapshot.input.durationSeconds, sourceRefs: snapshot.input.sourceRefs,
      externalUrl: output.url, mimeType: 'video/mp4', status: 'accepted'
    })
    persistTask(attempt, completed)
    reloadVideoHistory()
    await saveVideoOriginal(asset, attempt)
  } catch (error) {
    if (!ownsAttempt(attempt)) return
    hasError.value = true
    message.value = `视频已生成，但未能保存：${error?.message || '保存失败'}。请重试保存原件。`
  }
}

function reloadVideoHistory() {
  try {
    savedVideoAssets.value = listMediaAssets({ projectId: props.projectId, kind: 'video', purpose: 'storyboard-take' })
    historyError.value = ''
  } catch {
    savedVideoAssets.value = []
    historyError.value = '暂时无法读取已生成视频，请重新打开面板。'
  }
}
function handleHistoryStorage(event) {
  if (event.key === 'media_assets_v1' || event.key === null) reloadVideoHistory()
}

function normalizeMinimaxOptions() {
  if (!isMinimax.value) return
  const resolutions = isHailuoModel.value ? ['768P', '1080P'] : ['720P', '1080P']
  if (!resolutions.includes(minimax.resolution)) minimax.resolution = resolutions[0]
  const durations = isHailuoModel.value && minimax.resolution === '768P' ? [6, 10] : [6]
  if (!durations.includes(Number(durationSeconds.value))) durationSeconds.value = durations[0]
}

function normalizeShotDuration(shot) {
  return Math.max(1, Math.min(60, Math.round(Number(shot?.duration) || 5)))
}

function refreshVideoPrompt() {
  const saved = promptDrafts.get(promptDraftKey())
  videoPrompt.value = saved ?? buildShotVideoPrompt({
    shot: selectedShot.value,
    previousShot: previousShot.value,
    shotIndex: selectedShotIndex.value
  })
}

function collectStoryboardAgentContext(taskType) {
  return buildStoryboardAgentContext({
    taskType,
    shots: shots.value,
    shotIndex: selectedShotIndex.value,
    documentId: props.context?.document?.id,
    versionId: version.value.versionId,
    projectId: props.projectId,
    sourceRefs: props.context?.document?.sourceRefs || []
  })
}

async function runStoryboardAgent(taskType) {
  if (!selectedShot.value || advisorLoading.value || busy.value || props.stale) return
  const built = collectStoryboardAgentContext(taskType)
  const isReview = taskType === 'storyboard.review'
  await askAdvisor({
    label: isReview ? '检查当前镜头连续性' : '准备当前镜头视频请求',
    question: isReview
      ? '检查当前镜头与前后镜头的动作、人物、空间、光线、景别、运镜和转场连续性，只修正确有必要的字段。'
      : '根据当前已确认镜头及前镜视觉锚点，准备一条可审阅的中文视频提示词，不要提交生成任务。',
    scope: 'storyboard',
    taskType,
    target: { ...built.target, videoScopeKey: scopeKey.value, basePrompt: videoPrompt.value },
    mode: 'director'
  }, () => built.envelope)
}

function applyStoryboardAgentResult(result) {
  if (busy.value || props.stale || result?.status !== 'completed') return
  if (result?.target?.videoScopeKey !== scopeKey.value) return
  const action = result?.actions?.[0]
  const current = collectStoryboardAgentContext(result.taskType)
  if (current.revision !== result.target?.revision) {
    updateAdvisorResultStatus(result.id, 'stale', '镜头或相邻镜头已变化，请重新生成')
    return
  }
  if (action?.type === 'generation-request') {
    if (videoPrompt.value !== result.target.basePrompt) {
      updateAdvisorResultStatus(result.id, 'stale', '描述已手动修改，请重新完善描述。')
      return
    }
    result.applyReceipt = {
      type: 'storyboard-generation-request',
      beforePrompt: videoPrompt.value,
      afterPrompt: action.payload.prompt
    }
    videoPrompt.value = action.payload.prompt
    updateAdvisorResultStatus(result.id, 'applied')
    return
  }
  const transaction = applyStoryboardShotPatch(shots.value, action, result.target?.allowedShotId)
  if (!transaction.ok) {
    updateAdvisorResultStatus(result.id, 'failed', `无法应用镜头修改：${transaction.reason}`)
    return
  }
  persistStoryboardAgentShots(result, transaction.shots, 'agent-review', () => {
    result.applyReceipt = transaction.receipt
    updateAdvisorResultStatus(result.id, 'applied')
  })
}

function undoStoryboardAgentResult(result) {
  if (busy.value || props.stale || result?.status !== 'applied' || result?.target?.videoScopeKey !== scopeKey.value) return
  const receipt = result?.applyReceipt
  if (receipt?.type === 'storyboard-generation-request') {
    if (videoPrompt.value !== receipt.afterPrompt) {
      result.statusDetail = '提示词已再次编辑，无法自动撤销'
      return
    }
    videoPrompt.value = receipt.beforePrompt
    result.applyReceipt = null
    updateAdvisorResultStatus(result.id, 'completed')
    return
  }
  if (!canUndoStoryboardShotPatch(shots.value, receipt)) {
    result.statusDetail = '当前镜头已再次变化，无法自动撤销'
    return
  }
  persistStoryboardAgentShots(result, undoStoryboardShotPatch(shots.value, receipt), 'agent-undo', () => {
    result.applyReceipt = null
    updateAdvisorResultStatus(result.id, 'completed')
  })
}

function persistStoryboardAgentShots(result, nextShots, reason, onSaved) {
  const owner = scopeKey.value
  let settled = false
  emit('shots-updated', nextShots, {
    reason,
    onSaved(success, savedShots) {
      if (settled || disposed || scopeKey.value !== owner) return
      settled = true
      if (!success) {
        if (reason === 'agent-undo') result.statusDetail = '撤销未能保存，当前镜头保持不变，请重试。'
        else updateAdvisorResultStatus(result.id, 'failed', '镜头修正未能保存，当前镜头保持不变。')
        return
      }
      shots.value = Array.isArray(savedShots) ? savedShots : nextShots
      onSaved()
    }
  })
}

function getShotOptionLabel(shot, index) {
  const content = String(shot?.content || shot?.sourceText || shot?.description || '').replace(/\s+/g, ' ').trim()
  const excerpt = content.length > 28 ? `${content.slice(0, 28)}…` : content
  return `镜头 ${index + 1}${excerpt ? ` · ${excerpt}` : ''}`
}

function loadVideoConfigs() {
  videoConfigs.value = listVideoProviderConfigs()
  const storedSelection = getSelectedVideoProviderConfigId()
  selectedVideoConfigId.value = videoConfigs.value.some((item) => item.id === storedSelection)
    ? storedSelection
    : videoConfigs.value[0]?.id || ''
  applySelectedVideoConfig()
}

function handleVideoConfigsUpdated(configs) {
  videoConfigs.value = Array.isArray(configs) ? configs : listVideoProviderConfigs()
  if (!videoConfigs.value.some((item) => item.id === selectedVideoConfigId.value)) {
    selectedVideoConfigId.value = videoConfigs.value[0]?.id || ''
  }
  applySelectedVideoConfig()
}

function applySelectedVideoConfig() {
  const config = selectedVideoConfig.value
  if (!config) return
  providerId.value = config.providerId
  model.value = config.model
  if (config.providerId === 'minimax-video') {
    minimax.resolution = config.resolution || '768P'
    minimax.promptOptimizer = config.promptOptimizer === true
    minimax.fastPretreatment = config.fastPretreatment === true
    minimax.aigcWatermark = config.aigcWatermark === true
    normalizeMinimaxOptions()
  }
}

function mergeProviderMetadata(remoteProviders) {
  const remoteList = Array.isArray(remoteProviders) ? remoteProviders : []
  const remoteMinimax = remoteList.find((provider) => provider?.id === 'minimax-video')
  const remoteModels = Array.isArray(remoteMinimax?.capabilities?.models)
    ? remoteMinimax.capabilities.models
    : []
  backendContractOutdated.value = Boolean(
    remoteMinimax
    && !remoteModels.some((item) => MINIMAX_VIDEO_MODELS.includes(item))
  )
  const merged = new Map(BUILTIN_PROVIDERS.map((provider) => [provider.id, provider]))
  for (const provider of remoteList) {
    if (!provider?.id) continue
    if (provider.id === 'minimax-video') {
      merged.set(provider.id, {
        ...provider,
        label: 'MiniMax Video',
        capabilities: {
          ...(provider.capabilities || {}),
          models: MINIMAX_VIDEO_MODELS,
          aspectRatios: ['16:9']
        }
      })
      continue
    }
    merged.set(provider.id, provider)
  }
  return Array.from(merged.values())
}
</script>

<template>
  <section class="video-panel" role="dialog" aria-label="生成镜头视频" aria-describedby="video-panel-context">
    <header class="video-panel__header">
      <div class="video-panel__heading">
        <WorkbenchIcon name="film" :size="20" />
        <div><h2>生成镜头视频</h2><p id="video-panel-context">{{ documentTitle }}</p></div>
      </div>
      <button ref="closeRef" type="button" class="video-panel__close" title="关闭" aria-label="关闭" :disabled="submitting" @click="$emit('close')"><WorkbenchIcon name="close" :size="18" /></button>
    </header>

    <div class="video-panel__body">
      <div v-if="stale" class="video-panel__notice is-warning">分镜有新的修改。关闭面板，再从时间轴打开即可更新镜头。</div>
      <div v-else-if="!shots.length" class="video-panel__notice">先把场景加入时间轴，再选择一个镜头生成视频。</div>

      <div v-if="shots.length" class="video-panel__shot-workflow">
        <label class="video-panel__field">
          <span>当前镜头</span>
          <select v-model.number="selectedShotIndex" data-testid="video-shot-select" :disabled="busy">
            <option v-for="(shot, index) in shots" :key="shot.shotId || shot.nodeId || index" :value="index">{{ getShotOptionLabel(shot, index) }}</option>
          </select>
        </label>
        <p class="video-panel__shot-meta">{{ selectedShotMeta }}</p>
        <label class="video-panel__field">
          <span class="video-panel__field-label">画面与动作 <small>{{ videoPrompt.length }} / 2000</small></span>
          <textarea v-model="videoPrompt" data-testid="video-prompt-input" :disabled="busy" maxlength="2000" rows="6" placeholder="描述人物、动作、环境，以及镜头如何移动。"></textarea>
        </label>
        <div class="video-panel__agent-actions">
          <button type="button" class="video-panel__button is-quiet" :disabled="busy || advisorLoading || stale" @click="runStoryboardAgent('storyboard.review')"><WorkbenchIcon name="search" :size="15" />检查连续性</button>
          <button type="button" class="video-panel__button is-quiet" :disabled="busy || advisorLoading || stale" @click="runStoryboardAgent('storyboard.video.prompt')"><WorkbenchIcon name="sparkles" :size="15" />完善描述</button>
        </div>
        <div :inert="busy || stale || undefined">
          <AgentResultTray v-for="result in advisorResults.filter((item) => item.status !== 'dismissed' && item.target?.videoScopeKey === scopeKey)" :key="result.id" :result="result" @apply="applyStoryboardAgentResult" @undo="undoStoryboardAgentResult" @dismiss="dismissResult($event.id)" />
        </div>
      </div>

      <div class="video-panel__form">
        <div class="video-panel__field video-panel__field--wide">
          <VideoModelPicker v-model="selectedVideoConfigId" :configs="videoConfigs" :disabled="busy" @configs-updated="handleVideoConfigsUpdated" />
        </div>
        <label v-if="!isMinimax" class="video-panel__field"><span>画幅</span><select v-model="aspectRatio" :disabled="busy"><option v-for="ratio in aspectRatios" :key="ratio" :value="ratio">{{ ratio }}</option></select></label>
        <label v-else class="video-panel__field"><span>清晰度 · 横屏 16:9</span><select v-model="minimax.resolution" :disabled="busy"><option v-for="item in minimaxResolutions" :key="item" :value="item">{{ item }}</option></select></label>
        <label class="video-panel__field"><span>时长</span><select v-if="isMinimax" v-model.number="durationSeconds" :disabled="busy"><option v-for="item in minimaxDurations" :key="item" :value="item">{{ item }} 秒</option></select><input v-else v-model.number="durationSeconds" type="number" min="1" max="60" :disabled="busy" /></label>
      </div>

      <section v-if="job && (busy || currentJobMatchesShot)" class="video-panel__job" :class="`is-${job.status}`" aria-label="生成结果">
        <div class="video-panel__job-row"><strong>{{ taskShotLabel }} · {{ statusLabel }}</strong><span v-if="busy && !queryUnavailable">{{ progress }}%</span></div>
        <div v-if="busy && !queryUnavailable" class="video-panel__progress" role="progressbar" aria-label="视频生成进度" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${progress}%` }"></span></div>
        <button v-if="outputUrl && !archived" type="button" class="video-panel__button is-quiet" :disabled="savingVideoIds.has(`video-job-${job.id}`)" @click="archiveResult(job)">{{ savingVideoIds.has(`video-job-${job.id}`) ? '正在保存原件…' : '重试保存原件' }}</button>
        <button v-if="!checking && !submitting && !videoJobService.isTerminal(job.status)" type="button" class="video-panel__button" :disabled="cancelling" @click="resumeQuery"><WorkbenchIcon name="refresh" :size="15" />继续查询</button>
      </section>
      <StoryboardVideoResults
        :items="videoHistory"
        :saving-ids="savingVideoIds"
        @save-original="saveVideoOriginal($event)"
        :scope-key="historyScopeKey"
        :preferred-id="currentJobMatchesShot && outputUrl ? currentJobAsset.id : ''"
        :shot-number="Number(selectedShot?.sequence) || selectedShotIndex + 1"
      />
      <p v-if="historyError" class="video-panel__message is-error" role="status">{{ historyError }}</p>
      <p v-if="message" class="video-panel__message" :class="{ 'is-error': hasError }" role="status">{{ message }}</p>
      <p v-if="busy" class="video-panel__hint">{{ recoveryAvailable ? '提交后可关闭面板，重新打开会继续查询。' : '浏览器未能保存任务记录，请保持面板开启直到生成结束。' }}停止等待不一定会中止渠道生成。</p>
    </div>

    <footer class="video-panel__actions">
      <button type="button" class="video-panel__button is-quiet" :disabled="busy || testingConnection" @click="testConnection">{{ testingConnection ? '检查中…' : '检查渠道' }}</button>
      <button v-if="busy && !submitting" type="button" class="video-panel__button" :disabled="cancelling" @click="cancelJob">{{ cancelling ? '停止中…' : '停止等待' }}</button>
      <button v-else type="button" class="video-panel__button is-primary" :disabled="!canSubmit || submitting" @click="submitJob"><WorkbenchIcon name="film" :size="16" />{{ submitting ? '正在提交…' : job?.status === 'failed' || job?.status === 'cancelled' ? '重新生成' : '生成当前镜头' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.video-panel {
  position: fixed; right: 24px; top: 82px; bottom: 24px; z-index: 790;
  display: flex; flex-direction: column; width: min(440px, calc(100vw - 32px)); max-height: 860px;
  color: var(--text-primary); background: var(--surface-workbench-overlay, var(--bg-secondary));
  border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-surface, 24px);
  box-shadow: var(--shadow-workbench-float); font: 13px/1.6 var(--font-interface, var(--font-sans)); overflow: hidden;
}
.video-panel__header, .video-panel__heading, .video-panel__job-row, .video-panel__actions, .video-panel__field-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.video-panel__header { padding: 18px 20px 14px; border-bottom: 1px solid var(--hairline-soft); flex-shrink: 0; }
.video-panel__heading { justify-content: flex-start; min-width: 0; }
.video-panel__heading > svg { flex-shrink: 0; color: var(--text-secondary); }
.video-panel__heading > div { min-width: 0; }
.video-panel__header h2 { margin: 0; font: 600 16px/1.4 var(--font-interface, var(--font-sans)); }
.video-panel__header p { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.video-panel__close { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; padding: 0; border: 0; border-radius: var(--radius-control); color: var(--text-secondary); background: transparent; cursor: pointer; }
.video-panel__close:hover { background: var(--surface-workbench-input); }
.video-panel__body { flex: 1; min-height: 0; padding: 18px 20px; overflow-y: auto; overscroll-behavior: contain; }
.video-panel__notice, .video-panel__message { margin: 0 0 14px; color: var(--text-secondary); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.video-panel__notice.is-warning, .video-panel__message.is-error { color: var(--danger); }
.video-panel__message { margin: 14px 0 0; }
.video-panel__form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin-top: 20px; }
.video-panel__shot-workflow { display: grid; gap: 10px; }
.video-panel__agent-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-left: -8px; }
.video-panel__shot-meta { margin: -4px 0 2px; color: var(--text-muted); font-size: 12px; }
.video-panel__field { display: grid; gap: 7px; min-width: 0; }
.video-panel__field > span { color: var(--text-secondary); font-size: 12px; font-weight: 500; }
.video-panel__field-label small { color: var(--text-muted); font-size: 11px; font-weight: 400; }
.video-panel__field--wide { grid-column: 1 / -1; }
.video-panel__field :is(input, select, textarea) { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px 12px; color: var(--text-primary); background: var(--surface-workbench-input, var(--bg-primary)); border: 1px solid transparent; border-radius: var(--radius-control); font: inherit; resize: vertical; }
.video-panel__field select { padding-right: 26px; text-overflow: ellipsis; }
.video-panel__shot-workflow textarea { min-height: 146px; max-height: 330px; line-height: 1.7; }
.video-panel__job { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--hairline-soft); font-size: 12px; }
.video-panel__job-row strong { font-weight: 500; }
.video-panel__job-row span { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.video-panel__progress { height: 4px; margin: 12px 0; overflow: hidden; border-radius: 4px; background: var(--surface-workbench-input); }
.video-panel__progress span { display: block; height: 100%; background: var(--accent); transition: width 180ms ease; }
.video-panel__hint { margin: 10px 0 0; color: var(--text-muted); font-size: 11px; line-height: 1.6; }
.video-panel__actions { justify-content: flex-end; padding: 14px 20px max(14px, env(safe-area-inset-bottom)); border-top: 1px solid var(--hairline-soft); flex-shrink: 0; }
.video-panel__actions > :first-child { margin-right: auto; }
.video-panel__button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 7px 12px; color: var(--text-secondary); background: var(--surface-workbench-input); border: 0; border-radius: var(--radius-control); font: 500 12px/1.45 var(--font-interface, var(--font-sans)); cursor: pointer; }
.video-panel__button.is-quiet { padding-inline: 8px; background: transparent; }
.video-panel__button:hover { background: color-mix(in srgb, var(--text-primary) 7%, var(--surface-workbench-input)); }
.video-panel__button.is-primary { color: var(--accent-text); background: var(--accent); }
.video-panel__button.is-primary:hover { filter: brightness(.96); }
.video-panel :is(button, input, textarea, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.video-panel :disabled { opacity: .48; cursor: not-allowed; }
@media (max-width: 640px) {
  .video-panel { inset: auto 8px 8px; width: auto; max-height: calc(100dvh - 24px); }
  .video-panel__header, .video-panel__body, .video-panel__actions { padding-inline: 16px; }
  .video-panel__body { max-height: calc(100dvh - 180px); }
  .video-panel__button, .video-panel__close { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .video-panel__progress span { transition: none; } }
</style>
