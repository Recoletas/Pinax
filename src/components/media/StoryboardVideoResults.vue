<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { getStoryboardVideoAvailability } from '../../services/media/storyboardVideoHistory.js'
import { getMediaAsset } from '../../services/media/mediaAssetStore.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  scopeKey: { type: String, required: true },
  preferredId: { type: String, default: '' },
  shotNumber: { type: Number, default: 1 },
  savingIds: { type: Set, default: () => new Set() }
})
const emit = defineEmits(['save-original'])
const selectedId = ref('')
const clock = ref(Date.now())
const failedUrls = ref(new Set())
const attemptedExpiredUrls = ref(new Set())
const visibleCount = ref(4)
let timer
let localRevision = 0
const localUrl = ref('')
const localLoading = ref(false)
const localError = ref('')
const selected = computed(() => props.items.find((item) => item.id === selectedId.value) || null)
const availability = computed(() => getStoryboardVideoAvailability(selected.value, clock.value))
const playbackUrl = computed(() => localUrl.value || availability.value.url)
const playbackFailed = computed(() => failedUrls.value.has(playbackUrl.value))
const playbackAllowed = computed(() => !localLoading.value && playbackUrl.value && (localUrl.value || !availability.value.expired || attemptedExpiredUrls.value.has(playbackUrl.value)))
function releaseLocalUrl() { if (localUrl.value) URL.revokeObjectURL(localUrl.value); localUrl.value = '' }
watch(() => [props.scopeKey, selected.value?.id, selected.value?.storageRef, selected.value?.updatedAt], async () => {
  const revision = ++localRevision
  releaseLocalUrl()
  localError.value = ''
  localLoading.value = false
  const asset = selected.value
  if (!asset?.storageRef?.startsWith('idb://')) return
  localLoading.value = true
  try {
    const saved = await getMediaAsset(asset.id)
    if (revision !== localRevision) return
    if (!saved?.blob?.size || saved.asset.id !== asset.id || (saved.asset.projectId || null) !== (asset.projectId || null)) localError.value = '未找到本机原件，可重新保存或打开原链接。'
    else localUrl.value = URL.createObjectURL(saved.blob)
  } catch { if (revision === localRevision) localError.value = '暂时无法读取本机原件，可稍后重新打开。' }
  finally { if (revision === localRevision) localLoading.value = false }
}, { immediate: true })
watch(() => props.scopeKey, () => {
  selectedId.value = ''
  visibleCount.value = 4
  failedUrls.value = new Set()
  attemptedExpiredUrls.value = new Set()
}, { flush: 'sync' })
watch(() => props.items, () => {
  clock.value = Date.now()
  if (!props.items.some((item) => item.id === selectedId.value)) {
    selectedId.value = props.items.some((item) => item.id === props.preferredId)
      ? props.preferredId : props.items[0]?.id || ''
  }
}, { immediate: true })
watch(() => props.preferredId, (next) => {
  if (next && props.items.some((item) => item.id === next)) selectedId.value = next
})
onMounted(() => { timer = setInterval(() => { clock.value = Date.now() }, 30000) })
onBeforeUnmount(() => { clearInterval(timer); localRevision += 1; releaseLocalUrl() })
function selectResult(item) { selectedId.value = item.id; clock.value = Date.now() }
function markPlaybackFailed(event) {
  const url = event.target?.getAttribute('src')
  if (url) failedUrls.value = new Set([...failedUrls.value, url])
}
function retryPlayback() {
  const url = playbackUrl.value
  attemptedExpiredUrls.value = new Set([...attemptedExpiredUrls.value, url])
  failedUrls.value = new Set([...failedUrls.value].filter((item) => item !== url))
}
function resultDate(item) {
  const date = new Date(item.createdAt)
  return Number.isNaN(date.getTime()) ? '已保存结果' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function resultDetail(item) {
  const available = getStoryboardVideoAvailability(item, clock.value)
  return [
    item.durationSeconds ? `${item.durationSeconds} 秒` : '',
    item.generationParams?.resolution || item.generationParams?.aspectRatio || '',
    item.previousVersion ? '较早分镜' : '',
    item.storageRef?.startsWith('idb://') ? '原件已保存' : item.unsaved ? '尚未保存' : available.expired ? '原链接已到期' : '仅保存链接'
  ].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="video-results" aria-label="当前镜头的视频结果">
    <header class="video-results__header"><h3>镜头 {{ shotNumber }} 的视频</h3><span>{{ items.length }} 个结果</span></header>
    <p v-if="!items.length" class="video-results__empty">生成后可在这里比较结果。切换镜头，会显示对应的视频。</p>
    <template v-else>
      <div class="video-results__list" role="group" aria-label="选择视频结果">
        <button v-for="(item, index) in items.slice(0, visibleCount)" :key="item.id" :data-video-result-id="item.id" type="button" class="video-results__item" :class="{ 'is-selected': item.id === selectedId }" :aria-pressed="item.id === selectedId" @click="selectResult(item)">
          <span class="video-results__icon"><WorkbenchIcon name="film" :size="18" /></span>
          <span class="video-results__copy"><strong>{{ resultDate(item) }}<small v-if="index === 0">最新</small></strong><span>{{ resultDetail(item) || item.model || '已生成视频' }}</span></span>
        </button>
      </div>
      <button v-if="visibleCount < items.length" type="button" class="video-results__more" @click="visibleCount += 8">显示更早结果 · 还有 {{ items.length - visibleCount }} 个</button>
      <div v-if="selected" class="video-results__preview">
        <video v-if="playbackAllowed && !playbackFailed" :key="selected.id + playbackUrl" :src="playbackUrl" controls playsinline preload="metadata" :aria-label="`镜头 ${shotNumber} 视频预览`" @error="markPlaybackFailed"></video>
        <div v-else class="video-results__unavailable" role="status">
          <WorkbenchIcon name="film" :size="24" />
          <p>{{ localLoading ? '正在读取视频原件' : playbackFailed ? '暂时无法播放这个视频' : availability.expired ? '这个视频链接已到期' : '这个结果暂时没有可用链接' }}</p>
          <span>{{ localError || (playbackFailed ? '可以下载文件，用本机播放器打开。' : availability.expired ? '生成记录仍保留，可尝试打开原链接。' : '可以检查渠道的生成记录。') }}</span>
          <button v-if="!localLoading && playbackUrl" type="button" @click="retryPlayback">{{ availability.expired && !playbackFailed ? '尝试播放' : '重试播放' }}</button>
        </div>
        <div class="video-results__actions">
          <a v-if="localUrl" :href="localUrl" :download="`镜头-${shotNumber}-${selected.id}.${selected.mimeType === 'video/webm' ? 'webm' : 'mp4'}`"><WorkbenchIcon name="download" :size="15" />下载视频</a>
          <button v-else-if="!localLoading && selected.generationJobId && !selected.unsaved" type="button" :disabled="savingIds.has(selected.id)" @click="emit('save-original', selected)">{{ savingIds.has(selected.id) ? '正在保存原件…' : '保存视频原件' }}</button>
          <a v-if="availability.url" :href="availability.url" target="_blank" rel="noopener noreferrer">打开原链接</a>
        </div>
        <p class="video-results__hint">{{ localUrl ? '原件已保存在当前浏览器，完整工作区备份会包含这个视频。' : localError || '原件尚未保存在本机，远端链接可能过期。' }}</p>
        <details v-if="selected.promptSnapshot" class="video-results__prompt"><summary>查看当时的画面描述</summary><p>{{ selected.promptSnapshot }}</p></details>
      </div>
    </template>
  </section>
</template>

<style scoped>
.video-results { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--hairline-soft); min-width: 0; }
.video-results__header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.video-results__header h3 { margin: 0; font: 500 13px/1.5 var(--font-interface, var(--font-sans)); }
.video-results__header > span, .video-results__empty, .video-results__hint { color: var(--text-muted); font-size: 11px; line-height: 1.65; }
.video-results__empty { margin: 0; }
.video-results__list { display: grid; gap: 4px; }
.video-results__item { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 10px; border: 1px solid transparent; border-radius: var(--radius-control, 10px); background: transparent; color: var(--text-primary); cursor: pointer; text-align: left; font: inherit; }
.video-results__item:hover { background: var(--surface-workbench-input); }
.video-results__item.is-selected { background: var(--surface-workbench-input); border-color: var(--hairline-soft); }
.video-results__icon { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; color: var(--text-secondary); }
.video-results__copy { display: grid; gap: 3px; min-width: 0; }
.video-results__copy strong { font-size: 12px; font-weight: 500; }
.video-results__copy strong small { margin-left: 8px; color: var(--text-muted); font-size: 10px; font-weight: 400; }
.video-results__copy > span { color: var(--text-muted); font-size: 11px; overflow-wrap: anywhere; }
.video-results__preview { margin-top: 14px; }
.video-results__preview video { display: block; width: 100%; max-height: 240px; border-radius: 12px; background: var(--surface-workbench-input); }
.video-results__unavailable { display: grid; justify-items: center; gap: 6px; min-height: 154px; padding: 20px 12px; box-sizing: border-box; border-radius: 12px; background: var(--surface-workbench-input); text-align: center; }
.video-results__unavailable > svg { margin-bottom: 4px; color: var(--text-muted); }
.video-results__unavailable p { margin: 0; font-size: 12px; }
.video-results__unavailable span { color: var(--text-muted); font-size: 11px; }
.video-results__unavailable button, .video-results__more { min-height: 36px; padding: 6px 8px; border: 0; background: transparent; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; }
.video-results__more { margin-top: 4px; }
.video-results__actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 11px; color: var(--text-muted); }
.video-results__actions a { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; color: var(--accent); text-decoration: none; font-size: 12px; }
.video-results__actions button { min-height: 36px; border: 0; padding: 6px 8px; background: transparent; color: var(--accent); font: inherit; cursor: pointer; }
.video-results__actions button:disabled { color: var(--text-muted); cursor: wait; }
.video-results__hint { margin: 4px 0 0; }
.video-results__prompt { margin-top: 10px; font-size: 12px; }
.video-results__prompt summary { color: var(--text-secondary); cursor: pointer; }
.video-results__prompt p { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-muted); line-height: 1.7; }
.video-results :is(button, a, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) { .video-results__actions a, .video-results__actions button, .video-results__unavailable button, .video-results__more, .video-results__prompt summary { min-height: 44px; } }
</style>
