<template>
  <div class="media-settings">
    <div class="media-settings__head">
      <strong>{{ tr('媒体模型') }}</strong>
      <p>{{ tr('图片与视频各自选择模型配置，选择即对插画、漫画与分镜视频生效。') }}</p>
    </div>

    <div class="media-settings__group">
      <ImageModelPicker
        :model-value="imageSelectedId"
        :configs="imageConfigs"
        @update:model-value="selectImageConfig"
        @configs-updated="handleImageConfigs"
      />
      <p class="media-settings__note" data-test="media-image-effective-line">{{ imageNote }}</p>
    </div>

    <div class="media-settings__group">
      <VideoModelPicker
        :model-value="videoSelectedId"
        :configs="videoConfigs"
        @update:model-value="selectVideoConfig"
        @configs-updated="handleVideoConfigs"
      />
      <p class="media-settings__note" data-test="media-video-effective-line">{{ videoNote }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import ImageModelPicker from '../media/ImageModelPicker.vue'
import VideoModelPicker from '../media/VideoModelPicker.vue'
import {
  listImageProviderConfigs,
  resolveSelectedImageProviderConfig,
  saveSelectedImageProviderConfigId
} from '../../services/media/imageProviderConfigStore'
import {
  listVideoProviderConfigs,
  resolveSelectedVideoProviderConfig,
  saveSelectedVideoProviderConfigId
} from '../../services/media/videoProviderConfigStore'

const imageSelectedId = ref('')
const imageConfigs = ref([])
const videoSelectedId = ref('')
const videoConfigs = ref([])

const selectedImage = computed(() => imageConfigs.value.find((item) => item.id === imageSelectedId.value) || null)
const selectedVideo = computed(() => videoConfigs.value.find((item) => item.id === videoSelectedId.value) || null)

function noteOf(config, model) {
  if (!config) return tr('还没有可用配置，先添加一个模型。')
  const base = tr('当前使用「{name}」，模型 {model}。', { name: config.name || tr('自定义配置'), model: model || '—' })
  return config.serverKey ? `${base}${tr('密钥由服务器持有，浏览器不接触。')}` : base
}

const imageNote = computed(() => noteOf(selectedImage.value, selectedImage.value?.defaultModel))
const videoNote = computed(() => noteOf(selectedVideo.value, selectedVideo.value?.model))

function refresh() {
  imageConfigs.value = listImageProviderConfigs()
  videoConfigs.value = listVideoProviderConfigs()
  imageSelectedId.value = resolveSelectedImageProviderConfig()?.id || ''
  videoSelectedId.value = resolveSelectedVideoProviderConfig()?.id || ''
}

function selectImageConfig(id) {
  imageSelectedId.value = id
  try { saveSelectedImageProviderConfigId(id) } catch { /* 本次选择仍生效 */ }
}

function selectVideoConfig(id) {
  videoSelectedId.value = id
  try { saveSelectedVideoProviderConfigId(id) } catch { /* 本次选择仍生效 */ }
}

function handleImageConfigs(next) {
  imageConfigs.value = Array.isArray(next) ? next : listImageProviderConfigs()
  if (!imageConfigs.value.some((item) => item.id === imageSelectedId.value)) {
    selectImageConfig(imageConfigs.value[0]?.id || '')
  }
}

function handleVideoConfigs(next) {
  videoConfigs.value = Array.isArray(next) ? next : listVideoProviderConfigs()
  if (!videoConfigs.value.some((item) => item.id === videoSelectedId.value)) {
    selectVideoConfig(videoConfigs.value[0]?.id || '')
  }
}

onMounted(refresh)
</script>

<style scoped>
.media-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font: 14px/1.6 var(--font-sans);
}

.media-settings__head {
  display: grid;
  gap: 4px;
}

.media-settings__head strong {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.media-settings__head p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.media-settings__group {
  display: grid;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.media-settings__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
