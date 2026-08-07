<script setup>
import { computed, ref, watch } from 'vue'
import {
  Check,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-vue-next'
import {
  approveComicPanelStageArtifact,
  listComicPages,
  selectComicPanelStageArtifact,
  updateComicPanel
} from '../../services/media/comicPageStore'
import {
  archiveUploadedComicStage,
  COMIC_STAGE_LABELS,
  getComicBatchEligiblePanels,
  getComicReferenceCapabilityWarnings,
  getComicStageGate,
  getComicStageInputRevision,
  runComicStageGeneration
} from '../../services/media/comicProductionService'
import { getImageProviderCapabilities } from '../../services/media/imageProviderService'
import {
  getMediaAssetDataUrl,
  listMediaAssets
} from '../../services/media/mediaAssetStore'

const props = defineProps({
  page: { type: Object, required: true },
  panel: { type: Object, required: true },
  modelConfig: { type: Object, default: null },
  storageKey: { type: String, required: true },
  projectId: { type: String, default: null },
  sourceTitle: { type: String, default: '' },
  sourceText: { type: String, default: '' }
})

const emit = defineEmits(['page-saved'])
const activeStage = ref('rough')
const artifactPreviews = ref([])
const loadingArtifacts = ref(false)
const busy = ref(false)
const batchBusy = ref(false)
const error = ref('')
const status = ref('')
const maskImage = ref('')
const revisionPrompt = ref('')
const uploadInput = ref(null)
const maskInput = ref(null)
const bindingRole = ref('identity')
const bindingAssetId = ref('')
let artifactLoadRevision = 0

const stageOptions = computed(() => props.page.colorMode === 'monochrome'
  ? ['rough', 'line', 'tones', 'effects']
  : ['rough', 'line', 'flats', 'render', 'effects'])
const stageEntry = computed(() => props.panel.production?.[activeStage.value] || {})
const selectedArtifact = computed(() => artifactPreviews.value
  .find((artifact) => artifact.id === stageEntry.value.selectedArtifactId) || null)
const selectedLineage = computed(() => stageEntry.value.artifactLineage
  ?.find((artifact) => artifact.id === stageEntry.value.selectedArtifactId) || null)
const capabilities = computed(() => getImageProviderCapabilities(props.modelConfig || {}))
const generateGate = computed(() => getComicStageGate({
  page: props.page,
  panel: props.panel,
  stage: activeStage.value,
  config: props.modelConfig || {}
}))
const inpaintGate = computed(() => getComicStageGate({
  page: props.page,
  panel: props.panel,
  stage: activeStage.value,
  config: props.modelConfig || {},
  mode: 'inpaint'
}))
const referenceWarnings = computed(() => getComicReferenceCapabilityWarnings(
  props.panel,
  props.modelConfig || {}
))
const batchEligible = computed(() => activeStage.value === 'rough'
  ? []
  : getComicBatchEligiblePanels(props.page, activeStage.value, props.modelConfig || {}))
const visiblePalette = computed(() => props.page.colorMode === 'color'
  ? props.page.visualBible?.palette || []
  : [])
const hasProductionRules = computed(() => (
  visiblePalette.value.length
  || props.page.visualBible?.lineStyle
  || props.page.visualBible?.renderingNotes
))
const referenceAssets = ref([])
const activeBindings = computed(() => props.panel.referenceBindings || [])
const previousPanel = computed(() => {
  const ordered = [...(props.page.panels || [])].sort((left, right) => left.order - right.order)
  const index = ordered.findIndex((panel) => panel.id === props.panel.id)
  return index > 0 ? ordered[index - 1] : null
})
const previousImageData = computed(() => previousPanel.value?.imageTakes
  ?.find((take) => take.id === previousPanel.value.selectedTakeId)?.data || '')

watch(stageOptions, (stages) => {
  if (!stages.includes(activeStage.value)) activeStage.value = stages[0]
}, { immediate: true })

watch(
  () => `${props.panel.id}:${activeStage.value}:${(stageEntry.value.artifactIds || []).join(',')}`,
  loadArtifacts,
  { immediate: true }
)

watch(() => props.projectId, refreshReferenceAssets, { immediate: true })

function refreshReferenceAssets() {
  referenceAssets.value = listMediaAssets({
    projectId: props.projectId,
    kind: 'image'
  }).slice(0, 80)
  if (!referenceAssets.value.some((asset) => asset.id === bindingAssetId.value)) {
    bindingAssetId.value = referenceAssets.value[0]?.id || ''
  }
}

async function loadArtifacts() {
  const revision = ++artifactLoadRevision
  const ids = [...(stageEntry.value.artifactIds || [])]
  loadingArtifacts.value = true
  const metadata = new Map(listMediaAssets({}).map((asset) => [asset.id, asset]))
  const previews = await Promise.all(ids.map(async (id) => ({
    id,
    asset: metadata.get(id) || null,
    data: await getMediaAssetDataUrl(id).catch(() => '')
  })))
  if (revision !== artifactLoadRevision) return
  artifactPreviews.value = previews
  loadingArtifacts.value = false
}

async function generateStage(mode = 'generate') {
  if (busy.value || !props.modelConfig) return
  const gate = mode === 'inpaint' ? inpaintGate.value : generateGate.value
  if (!gate.allowed) {
    error.value = gate.reason
    return
  }
  if (mode === 'inpaint' && !maskImage.value) {
    error.value = '请先上传黑白遮罩图'
    return
  }
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const saved = await runComicStageGeneration({
      page: props.page,
      panel: props.panel,
      stage: activeStage.value,
      config: props.modelConfig,
      storageKey: props.storageKey,
      projectId: props.projectId,
      sourceTitle: props.sourceTitle,
      sourceText: props.sourceText,
      previousPanel: previousPanel.value,
      previousImageData: previousImageData.value,
      mode,
      maskImage: maskImage.value,
      revisionPrompt: revisionPrompt.value
    })
    refreshReferenceAssets()
    emit('page-saved', saved)
    status.value = mode === 'inpaint' ? '局部修订候选已加入' : `${COMIC_STAGE_LABELS[activeStage.value]}候选已加入`
    if (mode === 'inpaint') maskImage.value = ''
  } catch (generationError) {
    error.value = generationError?.message || '阶段生成失败'
    emitLatestPage()
  } finally {
    busy.value = false
  }
}

async function uploadStage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await readFileAsDataUrl(file)
    const dimensions = await readImageDimensions(data)
    const result = await archiveUploadedComicStage({
      page: props.page,
      panel: props.panel,
      stage: activeStage.value,
      config: props.modelConfig || {},
      storageKey: props.storageKey,
      projectId: props.projectId,
      data,
      width: dimensions.width,
      height: dimensions.height
    })
    refreshReferenceAssets()
    emit('page-saved', result.page)
    status.value = `${COMIC_STAGE_LABELS[activeStage.value]}人工稿已加入`
  } catch (uploadError) {
    error.value = uploadError?.message || '上传阶段产物失败'
  } finally {
    busy.value = false
  }
}

async function uploadMask(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  maskImage.value = await readFileAsDataUrl(file)
}

function selectArtifact(artifactId) {
  const saved = selectComicPanelStageArtifact(
    props.page.id,
    props.panel.id,
    activeStage.value,
    artifactId
  )
  if (saved) emit('page-saved', saved)
}

function approveStage() {
  error.value = ''
  try {
    const saved = approveComicPanelStageArtifact(
      props.page.id,
      props.panel.id,
      activeStage.value,
      { expectedInputRevision: getComicStageInputRevision(props.page, props.panel, activeStage.value) }
    )
    if (saved) {
      emit('page-saved', saved)
      status.value = `${COMIC_STAGE_LABELS[activeStage.value]}已确认`
    }
  } catch (approvalError) {
    error.value = approvalError?.message || '确认阶段产物失败'
  }
}

async function batchGenerateStage() {
  if (batchBusy.value || !props.modelConfig || !batchEligible.value.length) return
  batchBusy.value = true
  error.value = ''
  const stage = activeStage.value
  let page = props.page
  let completed = 0
  let failed = 0
  for (const candidate of batchEligible.value) {
    const panel = page.panels.find((item) => item.id === candidate.id)
    if (!panel) continue
    try {
      page = await runComicStageGeneration({
        page,
        panel,
        stage,
        config: props.modelConfig,
        storageKey: props.storageKey,
        projectId: props.projectId,
        sourceTitle: props.sourceTitle,
        sourceText: props.sourceText
      })
      completed += 1
    } catch {
      failed += 1
      page = listComicPages({}).find((item) => item.id === props.page.id) || page
    }
  }
  emit('page-saved', page)
  status.value = `${COMIC_STAGE_LABELS[stage]}推进 ${completed} 格${failed ? `，失败 ${failed} 格` : ''}`
  batchBusy.value = false
}

function addReferenceBinding() {
  if (!bindingAssetId.value) return
  if (activeBindings.value.some((binding) => (
    binding.role === bindingRole.value && binding.assetId === bindingAssetId.value
  ))) return
  const next = [
    ...activeBindings.value,
    {
      role: bindingRole.value,
      assetId: bindingAssetId.value,
      weight: 1
    }
  ]
  persistBindings(next)
}

function removeReferenceBinding(index) {
  persistBindings(activeBindings.value.filter((_, bindingIndex) => bindingIndex !== index))
}

function persistBindings(referenceBindings) {
  const saved = updateComicPanel(props.page.id, props.panel.id, { referenceBindings })
  if (saved) emit('page-saved', saved)
}

function emitLatestPage() {
  const saved = listComicPages({}).find((item) => item.id === props.page.id)
  if (saved) emit('page-saved', saved)
}

function stageStatus(stage) {
  const entry = props.panel.production?.[stage]
  return {
    empty: '未开始',
    working: '处理中',
    review: '待审',
    approved: '已确认',
    stale: '失效',
    failed: '失败'
  }[entry?.status || 'empty']
}

function artifactOrigin(artifactId) {
  const lineage = stageEntry.value.artifactLineage?.find((item) => item.id === artifactId)
  return { generated: '生成', uploaded: '上传', edited: '修订' }[lineage?.origin] || '候选'
}

function capabilityLabel(key) {
  return {
    textToImage: '文生图',
    imageToImage: '图生图',
    inpaint: '局部修订',
    controlImages: '结构控制'
  }[key]
}

function mediaLabel(asset) {
  return [asset.model || asset.provider || '图片', asset.id.slice(-6)].filter(Boolean).join(' · ')
}

function isCssColor(value) {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return CSS.supports('color', String(value || ''))
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(data) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = data
  })
}
</script>

<template>
  <section class="comic-stage-workbench" aria-label="当前格制作阶段">
    <div class="comic-stage-workbench__tabs" role="tablist" aria-label="制作阶段">
      <button
        v-for="stage in stageOptions"
        :key="stage"
        type="button"
        role="tab"
        :aria-selected="activeStage === stage"
        :class="[`is-${panel.production?.[stage]?.status || 'empty'}`, { active: activeStage === stage }]"
        @click="activeStage = stage"
      >
        <strong>{{ COMIC_STAGE_LABELS[stage] }}</strong>
        <small>{{ stageStatus(stage) }}</small>
      </button>
    </div>

    <div class="comic-stage-workbench__capabilities" aria-label="当前模型能力">
      <span
        v-for="key in ['textToImage', 'imageToImage', 'inpaint', 'controlImages']"
        :key="key"
        :class="{ supported: capabilities[key] }"
      >{{ capabilityLabel(key) }}</span>
    </div>

    <div v-if="hasProductionRules" class="comic-stage-workbench__bible" aria-label="当前视觉规则">
      <div v-if="visiblePalette.length" class="comic-stage-workbench__palette">
        <span v-for="color in visiblePalette" :key="color">
          <i v-if="isCssColor(color)" :style="{ backgroundColor: color }" aria-hidden="true"></i>
          {{ color }}
        </span>
      </div>
      <p v-if="page.visualBible?.lineStyle"><strong>线条</strong>{{ page.visualBible.lineStyle }}</p>
      <p v-if="page.visualBible?.renderingNotes"><strong>{{ page.colorMode === 'monochrome' ? '网点' : '色光' }}</strong>{{ page.visualBible.renderingNotes }}</p>
    </div>

    <div class="comic-stage-workbench__candidates">
      <button
        v-for="artifact in artifactPreviews"
        :key="artifact.id"
        type="button"
        :class="{ active: stageEntry.selectedArtifactId === artifact.id }"
        :title="`${artifactOrigin(artifact.id)}候选 ${artifact.id}`"
        @click="selectArtifact(artifact.id)"
      >
        <img v-if="artifact.data" :src="artifact.data" alt="" />
        <span v-else>{{ artifactOrigin(artifact.id) }}</span>
        <small>{{ artifactOrigin(artifact.id) }}</small>
      </button>
      <span v-if="loadingArtifacts" class="comic-stage-workbench__empty">读取候选…</span>
      <span v-else-if="!artifactPreviews.length" class="comic-stage-workbench__empty">
        {{ stageEntry.status === 'failed' ? stageEntry.error?.message : '尚无阶段产物' }}
      </span>
    </div>

    <figure v-if="selectedArtifact?.data" class="comic-stage-workbench__selected">
      <img :src="selectedArtifact.data" :alt="`${COMIC_STAGE_LABELS[activeStage]}当前候选`" />
      <figcaption>
        <span>{{ artifactOrigin(selectedArtifact.id) }}</span>
        <span v-if="selectedLineage?.parentAssetId">上游 {{ selectedLineage.parentAssetId.slice(-8) }}</span>
        <span>{{ selectedArtifact.id.slice(-8) }}</span>
      </figcaption>
    </figure>

    <div class="comic-stage-workbench__actions">
      <button type="button" :disabled="busy || !generateGate.allowed" :title="generateGate.reason" @click="generateStage()">
        <RefreshCw :size="13" aria-hidden="true" />
        {{ activeStage === 'rough' ? '生成草稿' : `生成${COMIC_STAGE_LABELS[activeStage]}` }}
      </button>
      <button type="button" :disabled="busy" @click="uploadInput?.click()">
        <Upload :size="13" aria-hidden="true" />
        上传替换
      </button>
      <button type="button" :disabled="stageEntry.status !== 'review' || !selectedArtifact" @click="approveStage">
        <Check :size="13" aria-hidden="true" />
        确认采用
      </button>
      <button
        v-if="activeStage !== 'rough'"
        type="button"
        :disabled="batchBusy || !batchEligible.length"
        :title="`只推进上游已确认的${COMIC_STAGE_LABELS[activeStage]}格`"
        @click="batchGenerateStage"
      >
        <Sparkles :size="13" aria-hidden="true" />
        批量 {{ batchEligible.length }} 格
      </button>
      <input ref="uploadInput" type="file" accept="image/*" hidden @change="uploadStage" />
    </div>

    <details class="comic-stage-workbench__revision">
      <summary>局部遮罩修订</summary>
      <div>
        <button type="button" :disabled="!inpaintGate.allowed" :title="inpaintGate.reason" @click="maskInput?.click()">
          <ImagePlus :size="13" aria-hidden="true" />
          {{ maskImage ? '更换遮罩' : '上传遮罩' }}
        </button>
        <input ref="maskInput" type="file" accept="image/*" hidden @change="uploadMask" />
        <span v-if="maskImage">遮罩已就绪</span>
      </div>
      <textarea v-model="revisionPrompt" rows="2" placeholder="只描述遮罩区域要修正的内容"></textarea>
      <button type="button" :disabled="busy || !maskImage || !inpaintGate.allowed" @click="generateStage('inpaint')">
        <Sparkles :size="13" aria-hidden="true" />
        生成修订候选
      </button>
    </details>

    <details class="comic-stage-workbench__references">
      <summary>身份与结构参考 · {{ activeBindings.length }}</summary>
      <div v-for="(binding, index) in activeBindings" :key="`${binding.role}:${binding.assetId}:${index}`" class="comic-stage-workbench__binding">
        <span>{{ { identity: '身份', costume: '服装', location: '地点', prop: '道具', style: '风格', pose: '姿势', edge: '边缘', depth: '深度' }[binding.role] || binding.role }}</span>
        <strong>{{ mediaLabel(referenceAssets.find((asset) => asset.id === binding.assetId) || { id: binding.assetId }) }}</strong>
        <button type="button" title="移除参考" aria-label="移除参考" @click="removeReferenceBinding(index)">
          <Trash2 :size="12" aria-hidden="true" />
        </button>
      </div>
      <div class="comic-stage-workbench__binding-add">
        <select v-model="bindingRole" aria-label="参考类型">
          <option value="identity">角色身份</option>
          <option value="costume">服装</option>
          <option value="location">地点</option>
          <option value="prop">道具</option>
          <option value="style">风格</option>
          <option value="pose">姿势</option>
          <option value="edge">边缘</option>
          <option value="depth">深度</option>
        </select>
        <select v-model="bindingAssetId" aria-label="参考图片">
          <option value="">选择图片</option>
          <option v-for="asset in referenceAssets" :key="asset.id" :value="asset.id">{{ mediaLabel(asset) }}</option>
        </select>
        <button type="button" title="添加参考" aria-label="添加参考" :disabled="!bindingAssetId" @click="addReferenceBinding">
          <ImagePlus :size="13" aria-hidden="true" />
        </button>
      </div>
      <p v-for="warning in referenceWarnings" :key="warning">{{ warning }}</p>
    </details>

    <p v-if="error" class="comic-stage-workbench__message is-error" role="alert">{{ error }}</p>
    <p v-else-if="status" class="comic-stage-workbench__message" role="status">{{ status }}</p>
  </section>
</template>

<style scoped>
.comic-stage-workbench {
  display: grid;
  gap: 7px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.comic-stage-workbench *,
.comic-stage-workbench *::before,
.comic-stage-workbench *::after { box-sizing: border-box; }

.comic-stage-workbench button,
.comic-stage-workbench select,
.comic-stage-workbench textarea { font: inherit; }

.comic-stage-workbench__tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
  gap: 2px;
}

.comic-stage-workbench__tabs button {
  min-width: 0;
  min-height: 38px;
  display: grid;
  align-content: center;
  gap: 1px;
  padding: 4px 3px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: var(--archive-ink-soft);
  cursor: pointer;
}

.comic-stage-workbench__tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--archive-ink);
}

.comic-stage-workbench__tabs button.is-approved { color: var(--archive-olive-strong, var(--success)); }
.comic-stage-workbench__tabs button.is-stale,
.comic-stage-workbench__tabs button.is-failed { color: var(--signal-warm, var(--warning)); }
.comic-stage-workbench__tabs strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.comic-stage-workbench__tabs small { font-size: 8px; font-weight: 400; }

.comic-stage-workbench__capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.comic-stage-workbench__capabilities span {
  color: color-mix(in srgb, var(--archive-ink-soft) 44%, transparent);
  font-size: 9px;
}

.comic-stage-workbench__capabilities span.supported {
  color: var(--archive-olive-strong, var(--accent));
  font-weight: 650;
}

.comic-stage-workbench__bible {
  display: grid;
  gap: 3px;
  padding-block: 5px;
  border-block: 1px solid color-mix(in srgb, var(--archive-ink) 10%, transparent);
}

.comic-stage-workbench__palette {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.comic-stage-workbench__palette span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.comic-stage-workbench__palette i {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
}

.comic-stage-workbench__bible p {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 5px;
  margin: 0;
  line-height: 1.4;
}

.comic-stage-workbench__bible strong {
  color: var(--archive-ink);
  font-weight: 650;
}

.comic-stage-workbench__candidates {
  min-height: 62px;
  display: flex;
  gap: 5px;
  padding-block: 2px;
  overflow-x: auto;
}

.comic-stage-workbench__candidates > button {
  position: relative;
  flex: 0 0 58px;
  width: 58px;
  height: 58px;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  border-radius: 3px;
  background: var(--archive-paper-soft);
  color: var(--archive-ink-soft);
  cursor: pointer;
}

.comic-stage-workbench__candidates > button.active {
  border-color: var(--accent);
  box-shadow: inset 0 -2px var(--accent);
}

.comic-stage-workbench__candidates img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.comic-stage-workbench__candidates button > span {
  height: 100%;
  display: grid;
  place-items: center;
}

.comic-stage-workbench__candidates button > small {
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 1px 3px;
  background: color-mix(in srgb, var(--archive-paper) 88%, transparent);
  color: var(--archive-ink);
  font-size: 8px;
}

.comic-stage-workbench__empty {
  align-self: center;
  color: var(--archive-ink-soft);
  font-style: italic;
}

.comic-stage-workbench__selected {
  position: relative;
  min-height: 112px;
  max-height: 190px;
  margin: 0;
  overflow: hidden;
  border-block: 1px solid color-mix(in srgb, var(--archive-ink) 12%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 72%, transparent);
}

.comic-stage-workbench__selected img {
  width: 100%;
  height: min(188px, 32vh);
  display: block;
  object-fit: contain;
}

.comic-stage-workbench__selected figcaption {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: flex;
  gap: 5px;
  padding: 2px 4px;
  background: color-mix(in srgb, var(--archive-paper) 90%, transparent);
  color: var(--archive-ink-soft);
  font-size: 8px;
}

.comic-stage-workbench__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.comic-stage-workbench__actions button,
.comic-stage-workbench__revision button {
  min-height: 29px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
  color: var(--archive-ink);
  cursor: pointer;
}

.comic-stage-workbench button:disabled { opacity: 0.42; cursor: not-allowed; }

.comic-stage-workbench__revision,
.comic-stage-workbench__references {
  border-top: 1px dashed color-mix(in srgb, var(--archive-ink) 15%, transparent);
}

.comic-stage-workbench__revision summary,
.comic-stage-workbench__references summary {
  min-height: 28px;
  display: flex;
  align-items: center;
  color: var(--archive-ink);
  cursor: pointer;
  font-weight: 600;
}

.comic-stage-workbench__revision > div {
  display: flex;
  align-items: center;
  gap: 7px;
}

.comic-stage-workbench__revision textarea {
  width: 100%;
  min-height: 48px;
  margin-block: 4px;
  resize: vertical;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink);
}

.comic-stage-workbench__binding {
  min-height: 27px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 5px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 9%, transparent);
}

.comic-stage-workbench__binding strong {
  min-width: 0;
  overflow: hidden;
  color: var(--archive-ink);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-stage-workbench__binding button,
.comic-stage-workbench__binding-add button {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
}

.comic-stage-workbench__binding-add {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 24px;
  gap: 4px;
  padding-top: 5px;
}

.comic-stage-workbench__binding-add select {
  min-width: 0;
  min-height: 28px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  border-radius: 3px;
  background: var(--archive-paper-soft);
  color: var(--archive-ink);
}

.comic-stage-workbench__references p,
.comic-stage-workbench__message {
  margin: 4px 0 0;
  color: var(--signal-warm, var(--warning));
  line-height: 1.4;
}

.comic-stage-workbench__message { color: var(--archive-olive-strong, var(--accent)); }
.comic-stage-workbench__message.is-error { color: var(--danger, var(--signal-warm)); }
</style>
