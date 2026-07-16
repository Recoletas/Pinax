<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { buildStoryboardVideoJobInput } from '../../composables/useDirector'
import { saveExternalMediaAsset } from '../../services/media/mediaAssetStore'
import { videoJobService } from '../../services/media/videoJobService'

const props = defineProps({
  context: { type: Object, default: null },
  stale: { type: Boolean, default: false },
  projectId: { type: String, default: null }
})

const emit = defineEmits(['close', 'archived'])

const providers = ref([])
const providerId = ref('minimax-video')
const model = ref('MiniMax-video-01')
const baseUrl = ref('')
const apiKey = ref('')
const aspectRatio = ref('16:9')
const durationSeconds = ref(5)
const job = ref(null)
const message = ref('')
const hasError = ref(false)
const pollingController = ref(null)
const archivedJobIds = new Set()
const generic = reactive({
  submitUrl: '',
  statusUrl: '',
  submitBodyTemplate: '{"prompt":"{{prompt}}","duration":{{duration}},"aspect_ratio":"{{aspectRatio}}"}',
  statusPath: 'id',
  outputUrlPath: 'output_url'
})

const shots = computed(() => props.context?.shots || props.context?.version?.shots || [])
const version = computed(() => props.context?.version || {})
const versionLabel = computed(() => version.value.versionId?.slice(-6) || '未建立')
const currentProvider = computed(() => providers.value.find((item) => item.id === providerId.value) || null)
const aspectRatios = computed(() => currentProvider.value?.capabilities?.aspectRatios || ['16:9', '9:16', '1:1'])
const busy = computed(() => ['queued', 'submitted', 'running'].includes(job.value?.status))
const progress = computed(() => Math.max(0, Math.min(100, Number(job.value?.progress) || 0)))
const outputUrl = computed(() => job.value?.outputs?.find((item) => item?.url)?.url || '')
const statusLabel = computed(() => ({
  queued: '等待提交', submitted: '已提交', running: '生成中', succeeded: '生成完成', failed: '生成失败', cancelled: '已取消'
})[job.value?.status] || '准备中')

watch(shots, (nextShots) => {
  const total = nextShots.reduce((sum, shot) => sum + (Number(shot?.duration) || 0), 0)
  durationSeconds.value = Math.max(1, Math.min(60, Math.round(total || 5)))
}, { immediate: true })

watch(providerId, (id) => {
  const provider = providers.value.find((item) => item.id === id)
  model.value = provider?.capabilities?.models?.[0] || (id === 'minimax-video' ? 'MiniMax-video-01' : 'custom')
  const ratios = provider?.capabilities?.aspectRatios || []
  if (ratios.length && !ratios.includes(aspectRatio.value)) aspectRatio.value = ratios[0]
})

onMounted(loadProviders)
onBeforeUnmount(() => pollingController.value?.abort())

async function loadProviders() {
  try {
    const result = await videoJobService.listProviders()
    providers.value = Array.isArray(result?.providers) ? result.providers : []
    if (providers.value.length && !providers.value.some((item) => item.id === providerId.value)) {
      providerId.value = providers.value[0].id
    }
  } catch (error) {
    hasError.value = true
    message.value = error?.message || '无法读取视频渠道'
  }
}

function buildProviderConfig() {
  const common = { apiKey: apiKey.value, model: model.value }
  if (baseUrl.value) common.baseUrl = baseUrl.value
  if (providerId.value !== 'generic-async-http') return common
  return {
    ...common,
    submitUrl: generic.submitUrl,
    statusUrl: generic.statusUrl,
    submitBodyTemplate: generic.submitBodyTemplate,
    statusPath: generic.statusPath,
    outputUrlPath: generic.outputUrlPath
  }
}

async function testConnection() {
  message.value = '正在测试连接...'
  hasError.value = false
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
  try {
    const storyboardInput = buildStoryboardVideoJobInput({
      shots: shots.value,
      documentId: props.context?.document?.id,
      versionId: version.value.versionId,
      versionFingerprint: props.context?.fingerprint,
      projectId: props.projectId,
      durationSeconds: durationSeconds.value,
      aspectRatio: aspectRatio.value
    })
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
  const url = completed.outputs?.find((item) => item?.url)?.url
  if (!url) return
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
      aspectRatio: storyboardInput.input.aspectRatio
    },
    durationSeconds: storyboardInput.input.durationSeconds,
    sourceRefs: storyboardInput.input.sourceRefs,
    externalUrl: url,
    mimeType: 'video/mp4',
    status: 'accepted'
  })
  archivedJobIds.add(completed.id)
  message.value = '视频已归档到素材库'
  emit('archived', asset)
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

    <div class="video-panel__form">
      <label class="video-panel__field">
        <span>渠道</span>
        <select v-model="providerId" :disabled="busy">
          <option v-for="provider in providers" :key="provider.id" :value="provider.id">
            {{ provider.label }}
          </option>
        </select>
      </label>
      <label class="video-panel__field">
        <span>模型</span>
        <input v-model.trim="model" :disabled="busy" placeholder="视频模型名称" />
      </label>
      <label class="video-panel__field video-panel__field--wide">
        <span>API 地址</span>
        <input v-model.trim="baseUrl" :disabled="busy" placeholder="渠道默认地址或自定义地址" />
      </label>
      <label class="video-panel__field video-panel__field--wide">
        <span>API Key</span>
        <input v-model="apiKey" type="password" autocomplete="off" :disabled="busy" placeholder="仅用于本次任务" />
      </label>
      <label class="video-panel__field">
        <span>画幅</span>
        <select v-model="aspectRatio" :disabled="busy">
          <option v-for="ratio in aspectRatios" :key="ratio" :value="ratio">{{ ratio }}</option>
        </select>
      </label>
      <label class="video-panel__field">
        <span>时长</span>
        <input v-model.number="durationSeconds" type="number" min="1" max="60" :disabled="busy" />
      </label>
    </div>

    <details v-if="providerId === 'generic-async-http'" class="video-panel__advanced">
      <summary>自定义异步接口</summary>
      <div class="video-panel__form">
        <label class="video-panel__field video-panel__field--wide">
          <span>提交地址</span>
          <input v-model.trim="generic.submitUrl" :disabled="busy" placeholder="https://api.example.com/jobs" />
        </label>
        <label class="video-panel__field video-panel__field--wide">
          <span>查询地址</span>
          <input v-model.trim="generic.statusUrl" :disabled="busy" placeholder="https://api.example.com/jobs/{{providerJobId}}" />
        </label>
        <label class="video-panel__field video-panel__field--wide">
          <span>提交模板</span>
          <textarea v-model="generic.submitBodyTemplate" :disabled="busy" rows="3"></textarea>
        </label>
        <label class="video-panel__field">
          <span>任务 ID 路径</span>
          <input v-model.trim="generic.statusPath" :disabled="busy" />
        </label>
        <label class="video-panel__field">
          <span>结果 URL 路径</span>
          <input v-model.trim="generic.outputUrlPath" :disabled="busy" />
        </label>
      </div>
    </details>

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
        :disabled="stale || !shots.length || !providerId"
        @click="submitJob"
      >{{ job?.status === 'failed' || job?.status === 'cancelled' ? '重新生成' : '开始生成' }}</button>
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

.video-panel__advanced {
  margin-top: 14px;
  color: var(--text-secondary);
  font-size: 12px;
}

.video-panel__advanced summary { cursor: pointer; }

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
