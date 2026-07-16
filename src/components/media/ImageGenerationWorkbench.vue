<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ImageModelPicker from './ImageModelPicker.vue'
import { generateImage } from '../../services/media/imageProviderService'
import { listImageProviderConfigs } from '../../services/media/imageProviderConfigStore'
import {
  addGeneratedImageToLibrary,
  loadGeneratedImageLibrary,
  saveGeneratedImageLibraryRefs
} from '../../services/media/mediaAssetStore'

const props = defineProps({
  storageKey: {
    type: String,
    required: true
  },
  selectedText: {
    type: String,
    default: ''
  },
  selectedPromptLabel: {
    type: String,
    default: '当前选中'
  },
  sourceTitle: {
    type: String,
    default: ''
  },
  drawerTitle: {
    type: String,
    default: '生图'
  },
  presentation: {
    type: String,
    default: 'rail'
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  side: {
    type: String,
    default: 'right'
  },
  verticalOffset: {
    type: Number,
    default: 0
  },
  horizontalOffset: {
    type: Number,
    default: 0
  },
  mobileBottomOffset: {
    type: Number,
    default: 20
  },
  allowInsertImageToEditor: {
    type: Boolean,
    default: false
  },
  mediaPurpose: {
    type: String,
    default: 'illustration'
  },
  modes: {
    type: Array,
    default: () => ['reference']
  },
  defaultMode: {
    type: String,
    default: 'reference'
  },
  projectId: {
    type: String,
    default: null
  },
  sourceRefs: {
    type: Array,
    default: () => []
  },
  referenceCandidates: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['insert-image', 'save-to-material', 'configs-updated', 'image-preview'])

const imageDrawerOpen = ref(false)
const imagePrompt = ref('')
const imageNegativePrompt = ref('')
const imageSelectedModel = ref('')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageCount = ref(1)
const imageGenerating = ref(false)
const imageLibrary = ref([])
const imagePreviewIndex = ref(-1)
const modelConfigs = ref([])
const activeMode = ref(props.defaultMode)
const selectedReferenceIds = ref([])
const storedReferenceImages = ref([])
const referenceInput = ref(null)
const referenceStrength = ref(0.65)

const sizePresets = [
  { label: '1:1 方图', width: 1024, height: 1024 },
  { label: '16:9 宽图', width: 1280, height: 720 },
  { label: '9:16 竖图', width: 720, height: 1280 },
  { label: '4:3 横图', width: 1024, height: 768 },
  { label: '3:4 竖图', width: 768, height: 1024 }
]

const modeLabels = {
  reference: '参考图',
  illustration: '插画'
}

const selectedTextText = computed(() => String(props.selectedText || '').trim())
const importButtonLabel = computed(() => `导入${props.selectedPromptLabel || '当前选中'}`)
const availableModes = computed(() => {
  const requested = props.modes.filter((mode) => modeLabels[mode])
  return requested.length ? [...new Set(requested)] : ['reference']
})
const hasSeparateReferenceWorkspace = computed(() => (
  availableModes.value.includes('reference') && availableModes.value.includes('illustration')
))
const referenceWorkspaceActive = computed(() => (
  hasSeparateReferenceWorkspace.value && activeMode.value === 'reference'
))
const showFullReferenceManager = computed(() => (
  referenceWorkspaceActive.value || !hasSeparateReferenceWorkspace.value
))
const activeMediaPurpose = computed(() => (
  activeMode.value === 'illustration' ? 'illustration' : props.mediaPurpose
))
const selectedSizeKey = computed(() => `${imageWidth.value}x${imageHeight.value}`)
const selectedPreviewImage = computed(() => imageLibrary.value[imagePreviewIndex.value] || null)
const allReferenceCandidates = computed(() => {
  const known = new Set()
  return [...storedReferenceImages.value, ...props.referenceCandidates]
    .filter((candidate) => {
      if (!candidate?.id || !candidate?.data || known.has(candidate.id)) return false
      known.add(candidate.id)
      return true
    })
})
const selectedReferenceImages = computed(() => selectedReferenceIds.value
  .map((id) => allReferenceCandidates.value.find((candidate) => candidate.id === id))
  .filter(Boolean)
  .slice(0, 3))
const libraryScopeKey = computed(() => JSON.stringify({
  projectId: props.projectId,
  purpose: activeMediaPurpose.value,
  sourceRefs: props.sourceRefs.map((ref) => [ref.refType, ref.refId, ref.projectId || ''])
}))
const railStyle = computed(() => {
  const side = props.side === 'left' ? 'left' : 'right'
  const offset = props.horizontalOffset > 0 ? `${props.horizontalOffset}px` : '0px'
  return {
    [side]: offset,
    '--rail-shift-y': `${props.verticalOffset}px`,
    '--rail-mobile-bottom-offset': `${Math.max(0, props.mobileBottomOffset)}px`,
    '--rail-right-offset': props.side === 'right' ? offset : undefined,
    '--rail-left-offset': props.side === 'left' ? offset : undefined
  }
})

onMounted(async () => {
  loadModelConfigs()
  await Promise.all([loadImageLibrary(), loadReferenceLibrary()])
})

watch(imageLibrary, () => saveImageLibrary(), { deep: true })
watch(availableModes, (modes) => {
  if (!modes.includes(activeMode.value)) {
    activeMode.value = modes.includes(props.defaultMode) ? props.defaultMode : modes[0]
  }
}, { immediate: true })
watch(libraryScopeKey, () => {
  imagePreviewIndex.value = -1
  void Promise.all([loadImageLibrary(), loadReferenceLibrary()])
})
watch(allReferenceCandidates, (candidates) => {
  const availableIds = new Set(candidates.map((candidate) => candidate.id))
  selectedReferenceIds.value = selectedReferenceIds.value.filter((id) => availableIds.has(id)).slice(0, 3)
})

function loadModelConfigs() {
  modelConfigs.value = listImageProviderConfigs()
  if (modelConfigs.value.length && !imageSelectedModel.value) {
    imageSelectedModel.value = modelConfigs.value[0].id
  }
}

function handleConfigsUpdated(configs) {
  modelConfigs.value = Array.isArray(configs) ? configs : listImageProviderConfigs()
  if (!modelConfigs.value.some((config) => config.id === imageSelectedModel.value)) {
    imageSelectedModel.value = modelConfigs.value[0]?.id || ''
  }
  emit('configs-updated', modelConfigs.value)
}

async function loadImageLibrary() {
  imageLibrary.value = await loadGeneratedImageLibrary(props.storageKey, {
    projectId: props.projectId,
    purpose: activeMediaPurpose.value,
    sourceRefs: props.sourceRefs
  })
}

async function loadReferenceLibrary() {
  storedReferenceImages.value = await loadGeneratedImageLibrary(props.storageKey, {
    projectId: props.projectId,
    purpose: 'storyboard-reference',
    sourceRefs: props.sourceRefs
  })
}

function saveImageLibrary() {
  saveGeneratedImageLibraryRefs(props.storageKey, imageLibrary.value)
}

function useSelectedTextAsPrompt() {
  if (!selectedTextText.value) return
  imagePrompt.value = selectedTextText.value
}

function selectSizePreset(value) {
  const preset = sizePresets.find((item) => `${item.width}x${item.height}` === value)
  if (!preset) return
  imageWidth.value = preset.width
  imageHeight.value = preset.height
}

async function generateImages() {
  if (!imagePrompt.value.trim()) {
    alert('请输入提示词')
    return
  }
  if (!imageSelectedModel.value) {
    alert('请先选择或添加模型')
    return
  }

  const cfg = modelConfigs.value.find((item) => item.id === imageSelectedModel.value)
  if (!cfg) {
    alert('未找到选中的模型配置')
    return
  }

  imageGenerating.value = true
  try {
    const results = []
    for (let i = 0; i < imageCount.value; i += 1) {
      results.push(await generateImage(cfg, {
        prompt: imagePrompt.value,
        negativePrompt: imageNegativePrompt.value,
        width: imageWidth.value,
        height: imageHeight.value,
        count: imageCount.value,
        referenceImages: selectedReferenceImages.value,
        referenceStrength: referenceStrength.value
      }))
    }

    for (const data of results) {
      const entry = await addGeneratedImageToLibrary(props.storageKey, {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: imagePrompt.value,
        negativePrompt: imageNegativePrompt.value,
        modelName: cfg.name,
        modelId: cfg.defaultModel,
        modelType: cfg.type,
        width: imageWidth.value,
        height: imageHeight.value,
        referenceImageIds: selectedReferenceImages.value.map((reference) => reference.mediaAssetId || reference.id),
        referenceCount: selectedReferenceImages.value.length,
        referenceStrength: referenceStrength.value,
        data,
        createdAt: new Date().toISOString()
      }, {
        projectId: props.projectId,
        purpose: activeMediaPurpose.value,
        sourceRefs: props.sourceRefs
      })
      imageLibrary.value.unshift(entry)
      if (entry.mediaPurpose === 'storyboard-reference') {
        storedReferenceImages.value = [entry, ...storedReferenceImages.value.filter((item) => item.id !== entry.id)]
      }
      imagePreviewIndex.value = 0
      emit('image-preview', entry)
    }
    saveImageLibrary()
  } catch (error) {
    alert('生成失败: ' + error.message)
  } finally {
    imageGenerating.value = false
  }
}

function toggleReference(candidate) {
  const id = candidate?.id
  if (!id) return
  if (selectedReferenceIds.value.includes(id)) {
    selectedReferenceIds.value = selectedReferenceIds.value.filter((item) => item !== id)
    return
  }
  selectedReferenceIds.value = [...selectedReferenceIds.value, id].slice(-3)
  emit('image-preview', {
    ...candidate,
    prompt: referenceLabel(candidate),
    mediaPurpose: candidate.mediaPurpose || 'storyboard-reference'
  })
}

function referenceLabel(candidate) {
  return String(candidate?.title || candidate?.prompt || '参考图')
}

async function handleReferenceUpload(event) {
  const files = [...(event.target?.files || [])]
    .filter((file) => file.type.startsWith('image/'))
    .slice(0, 3)
  const uploaded = []
  for (const file of files) {
    if (file.size > 12 * 1024 * 1024) continue
    const data = await fileToDataUrl(file)
    const entry = await addGeneratedImageToLibrary(props.storageKey, {
      id: `reference_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt: file.name,
      modelName: '本地上传',
      modelType: 'upload',
      width: null,
      height: null,
      status: 'accepted',
      data,
      createdAt: new Date().toISOString()
    }, {
      projectId: props.projectId,
      purpose: 'storyboard-reference',
      sourceRefs: props.sourceRefs
    })
    uploaded.push({ ...entry, title: file.name, uploaded: true })
  }
  storedReferenceImages.value = [...uploaded, ...storedReferenceImages.value]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 20)
  selectedReferenceIds.value = [...selectedReferenceIds.value, ...uploaded.map((item) => item.id)].slice(-3)
  if (uploaded[0]) {
    emit('image-preview', {
      ...uploaded[0],
      prompt: uploaded[0].title,
      mediaPurpose: 'storyboard-reference'
    })
  }
  if (event.target) event.target.value = ''
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取参考图失败'))
    reader.readAsDataURL(file)
  })
}

function copyImagePrompt(imgEntry) {
  if (!imgEntry?.prompt) return
  navigator.clipboard.writeText(imgEntry.prompt)
}

function previewImage(index) {
  imagePreviewIndex.value = index
  const entry = imageLibrary.value[index]
  if (entry) emit('image-preview', entry)
}

function saveToMaterialLib() {
  const imgEntry = imageLibrary.value[imagePreviewIndex.value]
  if (imgEntry) {
    emit('save-to-material', {
      ...imgEntry,
      mediaPurpose: imgEntry.mediaPurpose || activeMediaPurpose.value,
      mode: activeMode.value
    })
  }
  imagePreviewIndex.value = -1
}

function emitInsertImage(imgEntry) {
  if (!imgEntry) return
  emit('insert-image', imgEntry)
  if (props.presentation !== 'inline') imagePreviewIndex.value = -1
}

</script>

<template>
  <component
    :is="presentation === 'inline' ? 'section' : 'aside'"
    :class="presentation === 'inline' ? 'media-generation-inline' : ['image-gen-rail', `image-gen-rail--${side}`]"
    :style="presentation === 'inline' ? undefined : railStyle"
    aria-label="生图功能"
  >
    <div
      v-if="presentation === 'inline' || imageDrawerOpen"
      class="image-gen-drawer"
      :class="{ 'image-gen-drawer--inline': presentation === 'inline' }"
      @click.stop
    >
      <div v-if="showHeader" class="image-gen-header">
        <span class="image-gen-title">{{ drawerTitle }}</span>
      </div>

      <div v-if="availableModes.length > 1" class="image-gen-modes" role="tablist" aria-label="图片用途">
        <button
          v-for="mode in availableModes"
          :key="mode"
          class="image-gen-mode-btn"
          :class="{ active: activeMode === mode }"
          type="button"
          role="tab"
          :aria-selected="activeMode === mode"
          @click="activeMode = mode"
        >
          {{ modeLabels[mode] }}
        </button>
      </div>

      <div v-if="showFullReferenceManager" class="image-gen-section image-gen-reference-section">
        <div class="image-gen-label-row">
          <label class="image-gen-label">参考图库</label>
          <span class="image-gen-reference-count">{{ selectedReferenceImages.length }} / 3</span>
        </div>
        <div class="image-gen-reference-strip">
          <button
            v-for="candidate in allReferenceCandidates"
            :key="candidate.id"
            type="button"
            class="image-gen-reference-thumb"
            :class="{ active: selectedReferenceIds.includes(candidate.id) }"
            :title="referenceLabel(candidate)"
            @click="toggleReference(candidate)"
          >
            <img :src="candidate.data" :alt="referenceLabel(candidate)" />
            <span v-if="selectedReferenceIds.includes(candidate.id)" aria-hidden="true">✓</span>
          </button>
          <button class="image-gen-reference-upload" type="button" title="上传参考图" @click="referenceInput?.click()">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/>
            </svg>
            <span>上传</span>
          </button>
        </div>
        <input ref="referenceInput" class="image-gen-reference-input" type="file" accept="image/*" multiple @change="handleReferenceUpload" />
        <label v-if="selectedReferenceImages.length" class="image-gen-reference-strength">
          <span>参考强度</span>
          <input v-model.number="referenceStrength" type="range" min="0.2" max="0.9" step="0.05" />
          <strong>{{ Math.round(referenceStrength * 100) }}%</strong>
        </label>
        <p v-else class="image-gen-reference-hint">可从已有图片选择，或上传最多 3 张；生成时会真正传给支持参考图的模型。</p>
      </div>

      <template v-if="!referenceWorkspaceActive">
        <div class="image-gen-section">
          <div class="image-gen-label-row">
            <label class="image-gen-label">画面描述</label>
            <button v-if="selectedTextText" class="image-gen-inline-link" type="button" @click="useSelectedTextAsPrompt">
              {{ importButtonLabel }}
            </button>
          </div>
          <textarea
            v-model="imagePrompt"
            class="image-gen-prompt-input"
            placeholder="描述你想生成的插画..."
            rows="3"
          ></textarea>
        </div>

        <div class="image-gen-section">
          <ImageModelPicker
            v-model="imageSelectedModel"
            :configs="modelConfigs"
            @configs-updated="handleConfigsUpdated"
          />
        </div>

        <button
          v-if="hasSeparateReferenceWorkspace"
          class="image-gen-reference-summary"
          type="button"
          @click="activeMode = 'reference'"
        >
          <span class="image-gen-reference-summary__thumbs" aria-hidden="true">
            <img v-for="reference in selectedReferenceImages" :key="reference.id" :src="reference.data" alt="" />
            <span v-if="selectedReferenceImages.length === 0">无</span>
          </span>
          <span>{{ selectedReferenceImages.length ? `已选 ${selectedReferenceImages.length} 张参考图` : '未选择参考图' }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>

        <div class="image-gen-parameter-grid">
          <label class="image-gen-compact-field">
            <span>画幅</span>
            <select :value="selectedSizeKey" @change="selectSizePreset($event.target.value)">
              <option v-for="preset in sizePresets" :key="preset.label" :value="`${preset.width}x${preset.height}`">{{ preset.label }}</option>
            </select>
          </label>
          <label class="image-gen-compact-field">
            <span>数量</span>
            <select v-model.number="imageCount">
              <option v-for="count in [1, 2, 3, 4]" :key="count" :value="count">{{ count }} 张</option>
            </select>
          </label>
        </div>

        <div class="image-gen-section">
          <label class="image-gen-label">负面提示词（可选）</label>
          <textarea
            v-model="imageNegativePrompt"
            class="image-gen-prompt-input small"
            placeholder="不想出现的内容..."
            rows="2"
          ></textarea>
        </div>

        <div class="image-gen-actions">
          <button
            class="image-gen-generate-btn"
            type="button"
            @click="generateImages"
            :disabled="imageGenerating || !imagePrompt.trim() || !imageSelectedModel"
          >
            <span v-if="imageGenerating" class="spin-icon" aria-hidden="true"></span>
            <span>{{ imageGenerating ? '生成中...' : '生成插画' }}</span>
          </button>
        </div>

        <div v-if="imageLibrary.length > 0" class="image-gen-results">
          <div class="image-gen-results-title">历史记录</div>
          <div class="image-gen-grid">
            <div
              v-for="(img, idx) in imageLibrary"
              :key="img.id"
              class="image-gen-thumb"
              :class="{ active: imagePreviewIndex === idx }"
              @click="previewImage(idx)"
            >
              <img :src="img.data" alt="generated" />
            </div>
          </div>
          <div v-if="presentation === 'inline' && selectedPreviewImage" class="image-gen-inline-actions">
            <button v-if="allowInsertImageToEditor" class="image-preview-action-btn" type="button" @click="emitInsertImage(selectedPreviewImage)">插入正文</button>
            <button class="image-preview-action-btn" type="button" @click="copyImagePrompt(selectedPreviewImage)">复制提示词</button>
            <button class="image-preview-action-btn" type="button" @click="saveToMaterialLib">保存为素材</button>
          </div>
        </div>
      </template>
    </div>

    <button v-if="presentation !== 'inline'" class="image-gen-btn" type="button" @click.stop="imageDrawerOpen = !imageDrawerOpen" title="生图">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    </button>

    <div v-if="presentation !== 'inline' && imagePreviewIndex >= 0" class="image-preview-overlay" @click="imagePreviewIndex = -1">
      <div class="image-preview-modal" @click.stop>
        <div class="image-preview-header">
          <span>图片预览</span>
          <button class="image-preview-close" @click="imagePreviewIndex = -1">×</button>
        </div>
        <div class="image-preview-body">
          <img :src="imageLibrary[imagePreviewIndex]?.data" alt="preview" />
        </div>
        <div class="image-preview-actions">
          <button v-if="allowInsertImageToEditor" class="image-preview-action-btn" @click="emitInsertImage(imageLibrary[imagePreviewIndex])">插入正文</button>
          <button class="image-preview-action-btn" @click="copyImagePrompt(imageLibrary[imagePreviewIndex])">复制提示词</button>
          <button class="image-preview-action-btn" @click="saveToMaterialLib(imageLibrary[imagePreviewIndex])">保存</button>
        </div>
      </div>
    </div>

  </component>
</template>

<style scoped>
.image-gen-rail {
  position: fixed;
  top: var(--app-viewport-half-height, 50vh);
  transform: translateY(calc(-50% + var(--rail-shift-y, 0px)));
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: var(--z-floating-rail, 220);
  transition: transform 0.2s ease;
}

.image-gen-rail--right {
  flex-direction: row-reverse;
}

.image-gen-rail--left {
  flex-direction: row;
}

.image-gen-rail--right {
  right: var(--rail-right-offset, 0px);
  transform: translateX(48px) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail--left {
  left: var(--rail-left-offset, 0px);
  transform: translateX(-48px) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail:hover,
.image-gen-rail:focus-within {
  transform: translateX(0) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail:has(.image-gen-drawer) {
  transform: translateX(0) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-btn {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 18%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.image-gen-rail--left .image-gen-btn {
  border-radius: 0 12px 12px 0;
}

.image-gen-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-drawer {
  width: 320px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 8%, transparent);
}

.media-generation-inline {
  position: relative;
  display: block;
  width: 100%;
  z-index: 2;
}

.image-gen-drawer--inline {
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.image-gen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.image-gen-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-gen-modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  margin: -2px 0 10px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 52%, transparent);
}

.image-gen-mode-btn {
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 12px;
  cursor: pointer;
}

.image-gen-mode-btn:hover {
  color: var(--archive-ink, var(--text-primary));
}

.image-gen-mode-btn.active {
  border-bottom-color: var(--archive-olive, var(--accent));
  color: var(--archive-olive-strong, var(--accent));
  font-weight: 600;
}

.image-gen-prompt-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  padding: 8px;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
}

.image-gen-prompt-input:focus {
  outline: none;
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--archive-olive) 10%, transparent);
}

.image-gen-prompt-input.small {
  min-height: 56px;
}

.image-gen-section {
  margin-bottom: 8px;
}

.image-gen-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--archive-ink-soft, var(--text-secondary));
}

.image-gen-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}

.image-gen-label-row .image-gen-label {
  margin-bottom: 0;
}

.image-gen-reference-count,
.image-gen-reference-hint {
  color: var(--archive-ink-soft, var(--text-muted));
  font-size: 10px;
}

.image-gen-reference-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.image-gen-reference-thumb,
.image-gen-reference-upload {
  position: relative;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  border-radius: 3px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
}

.image-gen-reference-thumb.active {
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--archive-olive) 16%, transparent);
}

.image-gen-reference-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.image-gen-reference-thumb > span {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--archive-olive, var(--accent));
  color: var(--archive-paper-soft, var(--accent-text));
  font-size: 10px;
}

.image-gen-reference-upload {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  border-style: dashed;
  font-size: 10px;
}

.image-gen-reference-upload:hover { border-color: var(--archive-olive, var(--accent)); color: var(--archive-olive-strong, var(--accent)); }
.image-gen-reference-input { display: none; }
.image-gen-reference-hint { margin: 6px 0 0; line-height: 1.45; }
.image-gen-reference-strength { display: grid; grid-template-columns: auto minmax(0, 1fr) 34px; align-items: center; gap: 7px; margin-top: 7px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.image-gen-reference-strength input { width: 100%; accent-color: var(--archive-olive, var(--accent)); }
.image-gen-reference-strength strong { color: var(--archive-ink, var(--text-primary)); font-size: 10px; text-align: right; }

.image-gen-inline-link {
  min-height: 24px;
  padding: 2px 7px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 56%, var(--border));
  border-radius: 4px;
  background: transparent;
  color: var(--archive-olive-strong, var(--accent));
  cursor: pointer;
  font-size: 10px;
}

.image-gen-reference-summary {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  padding: 5px 7px;
  border: 0;
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent);
  background: transparent;
  color: var(--archive-ink-soft, var(--text-secondary));
  cursor: pointer;
  font-size: 10px;
  text-align: left;
}

.image-gen-reference-summary:hover { color: var(--archive-olive-strong, var(--accent)); }
.image-gen-reference-summary > span:nth-child(2) { flex: 1; }
.image-gen-reference-summary__thumbs { display: flex; align-items: center; min-width: 30px; }
.image-gen-reference-summary__thumbs img { width: 26px; height: 26px; margin-right: -7px; border: 1px solid var(--archive-paper-soft, var(--bg-secondary)); border-radius: 50%; object-fit: cover; }
.image-gen-reference-summary__thumbs > span { color: var(--archive-ink-soft, var(--text-muted)); font-style: italic; }

.image-gen-parameter-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  gap: 8px;
  margin-bottom: 9px;
}

.image-gen-compact-field {
  display: grid;
  gap: 4px;
}

.image-gen-compact-field > span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.image-gen-compact-field select {
  width: 100%;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 11px;
}

.image-gen-actions {
  margin-top: 10px;
}

.image-gen-generate-btn {
  width: 100%;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 72%, var(--border));
  border-radius: 4px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong));
  color: var(--archive-paper-soft, var(--accent-text));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.image-gen-generate-btn:hover:not(:disabled) {
  background: var(--archive-olive-strong, var(--accent-hover));
}

.spin-icon {
  width: 12px;
  height: 12px;
  border: 1.5px solid color-mix(in srgb, currentColor 36%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: image-gen-spin 0.8s linear infinite;
}

@keyframes image-gen-spin { to { transform: rotate(360deg); } }

.image-gen-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-gen-results {
  margin-top: 12px;
}

.image-gen-results-title {
  font-size: 11px;
  color: var(--archive-ink-soft, var(--text-secondary));
  margin-bottom: 8px;
}

.image-gen-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-gen-thumb {
  border: 1px solid color-mix(in srgb, var(--archive-gold) 54%, var(--border));
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: var(--archive-paper-soft, var(--bg-primary));
}

.image-gen-thumb.active {
  border-color: var(--archive-olive, var(--accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--archive-olive) 32%, transparent);
}

.image-gen-thumb img {
  width: 100%;
  height: 92px;
  object-fit: cover;
  display: block;
}

.image-gen-inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 10px;
  flex-wrap: wrap;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.image-preview-modal {
  background: var(--bg-secondary);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-preview-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-close:hover {
  background: var(--bg-hover);
}

.image-preview-body {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.image-preview-body img {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
}

.image-preview-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.image-preview-action-btn {
  padding: 6px 12px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  border-radius: 4px;
  background: var(--archive-paper-soft, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-preview-action-btn:hover {
  border-color: var(--archive-olive, var(--accent));
  color: var(--archive-olive-strong, var(--accent));
}

@media (max-width: 900px) {
  .image-gen-rail,
  .image-gen-rail:hover,
  .image-gen-rail:focus-within,
  .image-gen-rail:has(.image-gen-drawer) {
    top: auto;
    bottom: calc(var(--rail-mobile-bottom-offset, 20px) + env(safe-area-inset-bottom, 0px));
    transform: none;
  }

  .image-gen-drawer {
    width: min(320px, calc(100vw - 72px));
  }

  .media-generation-inline .image-gen-drawer {
    width: 100%;
  }
}
</style>
