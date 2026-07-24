<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import VideoModelPicker from './VideoModelPicker.vue'
import AgentResultTray from '../agent/AgentResultTray.vue'
import { useAdvisor } from '../../composables/useAdvisor'
import { buildShotVideoPrompt, buildStoryboardVideoJobInput } from '../../composables/useDirector'
import { saveExternalMediaAsset } from '../../services/media/mediaAssetStore'
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
const archivedJobIds = new Set()
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
const versionLabel = computed(() => version.value.versionId?.slice(-6) || '未建立')
const currentProvider = computed(() => providers.value.find((item) => item.id === providerId.value) || null)
const isMinimax = computed(() => providerId.value === 'minimax-video')
const isHailuoModel = computed(() => ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'].includes(model.value))
const minimaxResolutions = computed(() => isHailuoModel.value ? ['768P', '1080P'] : ['720P', '1080P'])
const minimaxDurations = computed(() => isHailuoModel.value && minimax.resolution === '768P' ? [6, 10] : [6])
const aspectRatios = computed(() => currentProvider.value?.capabilities?.aspectRatios || ['16:9', '9:16', '1:1'])
const busy = computed(() => ['queued', 'submitted', 'running'].includes(job.value?.status))
const progress = computed(() => Math.max(0, Math.min(100, Number(job.value?.progress) || 0)))
const outputUrl = computed(() => job.value?.outputs?.find((item) => item?.url)?.url || '')
const statusLabel = computed(() => ({
  queued: '等待提交', submitted: '已提交', running: '生成中', succeeded: '生成完成', failed: '生成失败', cancelled: '已取消'
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
  refreshVideoPrompt()
  if (!isMinimax.value) durationSeconds.value = normalizeShotDuration(selectedShot.value)
  if (!busy.value) {
    job.value = null
    message.value = ''
    hasError.value = false
  }
})

watch(selectedVideoConfigId, () => {
  saveSelectedVideoProviderConfigId(selectedVideoConfigId.value)
  applySelectedVideoConfig()
})

watch(providerId, (id) => {
  const provider = providers.value.find((item) => item.id === id)
  if (id === 'minimax-video') {
    if (!MINIMAX_VIDEO_MODELS.includes(model.value)) model.value = MINIMAX_VIDEO_MODELS[0]
  } else {
    model.value = provider?.capabilities?.models?.[0] || 'custom'
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
})
onBeforeUnmount(() => pollingController.value?.abort())

async function loadProviders() {
  try {
    const result = await videoJobService.listProviders()
    providers.value = mergeProviderMetadata(result?.providers)
    if (providers.value.length && !providers.value.some((item) => item.id === providerId.value)) {
      providerId.value = providers.value[0].id
    }
    const provider = providers.value.find((item) => item.id === providerId.value)
    if (!isMinimax.value && provider?.capabilities?.models?.length && !provider.capabilities.models.includes(model.value)) {
      model.value = provider.capabilities.models[0]
    }
    if (isMinimax.value) normalizeMinimaxOptions()
  } catch (error) {
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
  message.value = '正在测试连接...'
  hasError.value = false
  if (!selectedVideoConfig.value) {
    hasError.value = true
    message.value = '请先选择或添加视频模型配置。'
    return
  }
  if (isMinimax.value && backendContractOutdated.value) {
    hasError.value = true
    message.value = '后端仍在使用旧版 MiniMax 视频接口，请重启 Express 后端后再测试。'
    return
  }
  try {
    const result = await videoJobService.testProvider(providerId.value, buildProviderConfig())
    hasError.value = !result?.ok
    message.value = result?.ok ? `连接成功 · ${result.latencyMs || 0}ms` : (result?.message || '渠道不可用')
  } catch (error) {
    hasError.value = true
    message.value = error?.message || '连接测试失败'
  }
}

async function submitJob() {
  pollingController.value?.abort()
  message.value = ''
  hasError.value = false
  if (isMinimax.value && backendContractOutdated.value) {
    hasError.value = true
    message.value = '后端仍在使用旧版 MiniMax 视频接口，请重启 Express 后端后再生成。'
    return
  }
  if (!selectedShot.value || !videoPrompt.value.trim()) {
    hasError.value = true
    message.value = '请选择镜头并补充视频提示词。'
    return
  }
  if (!selectedVideoConfig.value) {
    hasError.value = true
    message.value = '请先选择或添加视频模型配置。'
    return
  }
  try {
    const storyboardInput = buildStoryboardVideoJobInput({
      shots: shots.value,
      shotIndex: selectedShotIndex.value,
      promptOverride: videoPrompt.value,
      documentId: props.context?.document?.id,
      versionId: version.value.versionId,
      versionFingerprint: props.context?.fingerprint,
      projectId: props.projectId,
      durationSeconds: durationSeconds.value,
      aspectRatio: aspectRatio.value
    })
    if (isMinimax.value) {
      storyboardInput.input.referenceImages = []
    }
    job.value = await videoJobService.createJob({
      ...storyboardInput,
      providerId: providerId.value,
      model: model.value,
      providerConfig: buildProviderConfig()
    })
    pollingController.value = new AbortController()
    const completed = await videoJobService.pollUntilDone(job.value.id, {
      signal: pollingController.value.signal,
      onUpdate: (updated) => { job.value = updated }
    })
    job.value = completed
    if (completed.status === 'succeeded') archiveResult(completed, storyboardInput)
    else if (completed.status === 'failed') {
      hasError.value = true
      message.value = completed.error?.message || '视频生成失败'
    }
  } catch (error) {
    if (error?.code === 'ERR_ABORTED') return
    hasError.value = true
    message.value = error?.message || '视频任务提交失败'
  }
}

async function cancelJob() {
  if (!job.value?.id) return
  pollingController.value?.abort()
  try {
    job.value = await videoJobService.cancelJob(job.value.id)
    message.value = '任务已取消'
  } catch (error) {
    hasError.value = true
    message.value = error?.message || '取消失败'
  }
}

function archiveResult(completed, storyboardInput) {
  if (archivedJobIds.has(completed.id)) return
  const output = completed.outputs?.find((item) => item?.url)
  if (!output?.url) return
  const asset = saveExternalMediaAsset({
    projectId: props.projectId,
    kind: 'video',
    purpose: 'storyboard-take',
    generationJobId: completed.id,
    provider: completed.providerId,
    model: completed.model,
    promptSnapshot: storyboardInput.input.prompt,
    generationParams: {
      durationSeconds: storyboardInput.input.durationSeconds,
      aspectRatio: storyboardInput.input.aspectRatio,
      resolution: isMinimax.value ? minimax.resolution : null,
      shotId: storyboardInput.shot?.shotId || null,
      shotSequence: storyboardInput.shot?.sequence || selectedShotIndex.value + 1,
      shotType: storyboardInput.shot?.shotType || null,
      camera: storyboardInput.shot?.camera || null,
      transition: storyboardInput.shot?.transition || null,
      relationType: storyboardInput.shot?.relationType || null,
      relationLabel: storyboardInput.shot?.relationLabel || null,
      providerFileId: output.fileId || null,
      externalUrlExpiresAt: output.expiresAt || null
    },
    durationSeconds: storyboardInput.input.durationSeconds,
    sourceRefs: storyboardInput.input.sourceRefs,
    externalUrl: output.url,
    mimeType: 'video/mp4',
    status: 'accepted'
  })
  archivedJobIds.add(completed.id)
  const shotLabel = `镜头 ${storyboardInput.shot?.sequence || selectedShotIndex.value + 1}`
  message.value = output.expiresAt
    ? `${shotLabel}生成完成，临时结果地址已记入素材库（约 1 小时有效）`
    : `${shotLabel}视频已归档到素材库`
  emit('archived', asset)
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
  videoPrompt.value = buildShotVideoPrompt({
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
    projectId: props.projectId
  })
}

async function runStoryboardAgent(taskType) {
  if (!selectedShot.value || advisorLoading.value) return
  const built = collectStoryboardAgentContext(taskType)
  const isReview = taskType === 'storyboard.review'
  await askAdvisor({
    label: isReview ? '检查当前镜头连续性' : '准备当前镜头视频请求',
    question: isReview
      ? '检查当前镜头与前后镜头的动作、人物、空间、光线、景别、运镜和转场连续性，只修正确有必要的字段。'
      : '根据当前已确认镜头及前镜视觉锚点，准备一条可审阅的中文视频提示词，不要提交生成任务。',
    scope: 'storyboard',
    taskType,
    target: built.target,
    mode: 'director'
  }, () => built.envelope)
}

function applyStoryboardAgentResult(result) {
  const action = result?.actions?.[0]
  const current = collectStoryboardAgentContext(result.taskType)
  if (current.revision !== result.target?.revision) {
    updateAdvisorResultStatus(result.id, 'stale', '镜头或相邻镜头已变化，请重新生成')
    return
  }
  if (action?.type === 'generation-request') {
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
  shots.value = transaction.shots
  result.applyReceipt = transaction.receipt
  updateAdvisorResultStatus(result.id, 'applied')
  emit('shots-updated', transaction.shots, { reason: 'agent-review' })
}

function undoStoryboardAgentResult(result) {
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
  shots.value = undoStoryboardShotPatch(shots.value, receipt)
  result.applyReceipt = null
  updateAdvisorResultStatus(result.id, 'completed')
  emit('shots-updated', shots.value, { reason: 'agent-undo' })
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
  <section class="video-panel" aria-label="分镜视频生成">
    <header class="video-panel__header">
      <div>
        <span class="video-panel__eyebrow">分镜版本 {{ versionLabel }}</span>
        <h2>视频生成</h2>
      </div>
      <button type="button" class="video-panel__close" title="关闭" aria-label="关闭" @click="$emit('close')">×</button>
    </header>

    <div v-if="stale" class="video-panel__notice is-warning">画布已有变化，请先更新分镜版本。</div>
    <div v-else-if="!shots.length" class="video-panel__notice">当前版本没有可生成的镜头。</div>

    <div v-if="shots.length" class="video-panel__shot-workflow">
      <label class="video-panel__field">
        <span>生成镜头</span>
        <select v-model.number="selectedShotIndex" data-testid="video-shot-select" :disabled="busy">
          <option v-for="(shot, index) in shots" :key="shot.shotId || shot.nodeId || index" :value="index">
            {{ getShotOptionLabel(shot, index) }}
          </option>
        </select>
      </label>
      <p class="video-panel__shot-meta">{{ selectedShotMeta }}</p>
      <label class="video-panel__field">
        <span>视频提示词（可编辑）</span>
        <textarea
          v-model="videoPrompt"
          data-testid="video-prompt-input"
          :disabled="busy"
          maxlength="2000"
          rows="7"
        ></textarea>
      </label>
      <div class="video-panel__agent-actions">
        <button type="button" class="video-panel__button" :disabled="busy || advisorLoading" @click="runStoryboardAgent('storyboard.review')">
          检查连续性
        </button>
        <button type="button" class="video-panel__button" :disabled="busy || advisorLoading" @click="runStoryboardAgent('storyboard.video.prompt')">
          准备生成请求
        </button>
      </div>
      <AgentResultTray
        v-for="result in advisorResults.filter((item) => !['dismissed'].includes(item.status))"
        :key="result.id"
        :result="result"
        @apply="applyStoryboardAgentResult"
        @undo="undoStoryboardAgentResult"
        @dismiss="dismissResult($event.id)"
      />
    </div>

    <div class="video-panel__form">
      <div class="video-panel__field video-panel__field--wide">
        <VideoModelPicker
          v-model="selectedVideoConfigId"
          :configs="videoConfigs"
          :disabled="busy"
          @configs-updated="handleVideoConfigsUpdated"
        />
      </div>
      <label v-if="!isMinimax" class="video-panel__field">
        <span>画幅</span>
        <select v-model="aspectRatio" :disabled="busy">
          <option v-for="ratio in aspectRatios" :key="ratio" :value="ratio">{{ ratio }}</option>
        </select>
      </label>
      <label v-else class="video-panel__field">
        <span>分辨率</span>
        <select v-model="minimax.resolution" :disabled="busy">
          <option v-for="item in minimaxResolutions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="video-panel__field">
        <span>时长</span>
        <select v-if="isMinimax" v-model.number="durationSeconds" :disabled="busy">
          <option v-for="item in minimaxDurations" :key="item" :value="item">{{ item }} 秒</option>
        </select>
        <input v-else v-model.number="durationSeconds" type="number" min="1" max="60" :disabled="busy" />
      </label>
    </div>

    <div v-if="job" class="video-panel__job" :class="`is-${job.status}`">
      <div class="video-panel__job-row">
        <strong>{{ statusLabel }}</strong>
        <span>{{ progress }}%</span>
      </div>
      <div class="video-panel__progress" aria-hidden="true">
        <span :style="{ width: `${progress}%` }"></span>
      </div>
      <a v-if="outputUrl" :href="outputUrl" target="_blank" rel="noopener noreferrer">查看生成结果</a>
    </div>
    <p v-if="message" class="video-panel__message" :class="{ 'is-error': hasError }" role="status">{{ message }}</p>

    <footer class="video-panel__actions">
      <button type="button" class="video-panel__button" :disabled="busy" @click="testConnection">测试连接</button>
      <button v-if="busy" type="button" class="video-panel__button" @click="cancelJob">取消</button>
      <button
        v-else
        type="button"
        class="video-panel__button is-primary"
        :disabled="stale || !selectedShot || !videoPrompt.trim() || !selectedVideoConfig"
        @click="submitJob"
      >{{ job?.status === 'failed' || job?.status === 'cancelled' ? '重新生成当前镜头' : '生成当前镜头' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.video-panel {
  position: fixed;
  right: 24px;
  bottom: 82px;
  z-index: 1100;
  width: min(440px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 112px));
  overflow: auto;
  padding: 18px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-secondary) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
  box-shadow: 0 18px 52px color-mix(in srgb, var(--text-primary) 14%, transparent);
  backdrop-filter: blur(18px);
}

.video-panel__header,
.video-panel__job-row,
.video-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.video-panel__header h2 {
  margin: 3px 0 0;
  font-family: var(--font-display, var(--font-sans));
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0;
}

.video-panel__eyebrow,
.video-panel__field span {
  color: var(--text-muted);
  font-size: 11px;
}

.video-panel__close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.video-panel__notice,
.video-panel__message {
  margin: 14px 0 0;
  padding: 9px 10px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
  border-left: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

.video-panel__notice.is-warning,
.video-panel__message.is-error {
  border-left-color: var(--danger, #b65c5c);
}

.video-panel__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.video-panel__shot-workflow {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding-bottom: 15px;
  border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
}

.video-panel__agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.video-panel__shot-meta {
  margin: -2px 0 2px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.video-panel__field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.video-panel__field--wide { grid-column: 1 / -1; }

.video-panel__field input,
.video-panel__field select,
.video-panel__field textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 9px;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
  border-radius: 2px;
  font: inherit;
  font-size: 12px;
  resize: vertical;
}

.video-panel__shot-workflow textarea {
  min-height: 132px;
  line-height: 1.55;
}

.video-panel__job {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
  font-size: 12px;
}

.video-panel__progress {
  height: 3px;
  margin: 8px 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
}

.video-panel__progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 180ms ease;
}

.video-panel__job a { color: var(--accent); }

.video-panel__actions {
  justify-content: flex-end;
  margin-top: 16px;
}

.video-panel__button {
  min-height: 34px;
  padding: 0 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--text-muted) 24%, transparent);
  border-radius: 2px;
  cursor: pointer;
}

.video-panel__button.is-primary {
  color: var(--bg-primary);
  background: var(--text-primary);
  border-color: var(--text-primary);
}

.video-panel__button:disabled { opacity: 0.45; cursor: not-allowed; }

@media (max-width: 640px) {
  .video-panel { right: 16px; bottom: 72px; max-height: calc(100vh - 96px); }
  .video-panel__form { grid-template-columns: 1fr; }
  .video-panel__field--wide { grid-column: auto; }
}
</style>
