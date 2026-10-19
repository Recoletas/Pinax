<script setup>
import { useRouter } from 'vue-router'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { listNarrativeAssets, subscribeNarrativeAssets } from '../../services/media/narrativeAssets.js'
import { listComicPages, hydrateComicPageTakes } from '../../services/media/comicPageStore.js'
import { getStoryboardDocument, saveValidatedStoryboardVersion } from '../../services/media/storyboardStore.js'
import { getMediaAssetDataUrl } from '../../services/media/mediaAssetStore.js'
import ComicPagePreview from '../media/ComicPagePreview.vue'
const VideoPanel = defineAsyncComponent(() => import('../media/StoryboardVideoPanel.vue'))
const props = defineProps({ resource: { type: Object, required: true }, instanceId: { type: String, required: true } })
const emit = defineEmits(['title'])
const host = useComposableWorkspace()
const router = useRouter()
const item = ref(null)
const image = ref('')
const videoContext = ref(null)
const videoRef = ref(null)
const notice = ref('')
const stale = ref(false)
let sequence = 0
let disposed = false
let unregister = null
let unregisterTask = null
function currentVideoMatches() {
  const current = getStoryboardDocument(props.resource.id)
  const ok = current?.projectId === props.resource.bookId && current.currentVersionId === videoContext.value?.version?.versionId
  stale.value = !ok
  return ok
}
function canClose() { return props.resource.type !== 'video' || videoRef.value?.canClose?.() !== false }
watch(() => props.instanceId, id => {
  unregister?.(); unregisterTask?.()
  unregister = host?.registerGuard(id, canClose)
  unregisterTask = host?.registerTaskAdapter(id, { summary: () => videoRef.value?.getTaskSummary?.() || null, open: () => host.activate(id) })
}, { immediate: true })
async function load() {
  const ticket = ++sequence
  notice.value = ''
  if (props.resource.type === 'video') {
    const document = getStoryboardDocument(props.resource.id)
    const version = document?.versions?.find(version => version.versionId === (props.resource.versionId || document.currentVersionId))
    if (document?.projectId !== props.resource.bookId || !version) { item.value = null; return }
    item.value = document
    // The running panel keeps its exact input version even if a new version appears.
    if (!videoContext.value) videoContext.value = { document, version, shots: version.shots || [], fingerprint: version.parameters?.canvasFingerprint || '' }
    currentVideoMatches()
    emit('title', document.source?.title || '镜头视频')
    return
  }
  const candidate = props.resource.type === 'comic'
    ? listComicPages({ projectId: props.resource.bookId }).find(page => page.id === props.resource.id)
    : listNarrativeAssets({ projectId: props.resource.bookId }).find(asset => asset.id === props.resource.id)
  if (!candidate) { item.value = null; return }
  emit('title', candidate.title || '')
  if (props.resource.contentHash && props.resource.contentHash !== candidate.contentHash) notice.value = '来源内容已更新，当前显示最新版本。'
  if (props.resource.type === 'comic') {
    const page = await hydrateComicPageTakes(candidate)
    if (!disposed && ticket === sequence) item.value = page
  } else {
    item.value = candidate
    const data = candidate.image?.data || (candidate.image?.mediaAssetId ? await getMediaAssetDataUrl(candidate.image.mediaAssetId) : '')
    if (!disposed && ticket === sequence) image.value = data
  }
}
function openSource(reference) {
  if (reference.projectId && reference.projectId !== props.resource.bookId) return
  const type = ({ chapter: 'chapter', 'worldbook-entry': 'entry', 'narrative-asset': 'asset', 'comic-page': 'comic' })[reference.refType]
  if (type) host?.openResource({ type, bookId: props.resource.bookId, id: reference.refId })
}
function updateShots(shots, meta = {}) {
  if (!currentVideoMatches()) { meta.onSaved?.(false); return }
  try {
    const current = videoContext.value
    const saved = saveValidatedStoryboardVersion({ documentId: current.document.id, projectId: props.resource.bookId,
      source: current.document.source, sourceRefs: current.document.sourceRefs, shots,
      taskType: meta.reason === 'agent-undo' ? 'storyboard.agent.undo' : 'storyboard.agent.review', parameters: current.version.parameters || {} })
    videoContext.value = { ...current, document: saved.document, version: saved.version, shots: saved.shots }
    host?.updateResource(props.instanceId, { versionId: saved.version.versionId })
    meta.onSaved?.(true, saved.shots)
  } catch { meta.onSaved?.(false); notice.value = '镜头修改未能保存，原版本保留。' }
}
function refresh() { void load().catch(() => { if (!disposed) notice.value = '内容读取失败，请重试。' }) }
watch(() => props.resource, () => { refresh() }, { immediate: true })
const releaseAssets = subscribeNarrativeAssets(() => { if (!disposed && props.resource.type === 'asset') refresh() })
onMounted(() => { window.addEventListener('focus', refresh); window.addEventListener('storage', refresh) })
onBeforeUnmount(() => { disposed = true; sequence += 1; releaseAssets(); unregister?.(); unregisterTask?.(); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) })
const references = computed(() => item.value?.sourceRefs || [])
async function openWorkbench() {
  if (props.resource.type === 'asset') {
    if (!await host.prepareOpen('main')) return
    await router.push({ name: 'authoring', query: { bookId: props.resource.bookId, tool: 'illustrator' } })
    return
  }
  const resource = props.resource.type === 'comic'
    ? { type: 'comic-editor', bookId: props.resource.bookId, pageId: props.resource.id }
    : { type: 'materials-editor', bookId: props.resource.bookId, assetId: props.resource.id }
  if (!host.openResource(resource) || !await host.move(true)) notice.value = host.state.notice || '暂时无法打开工作台，参考内容仍保留。'
}

</script>

<template>
  <section class="workspace-media-view" :class="{ 'is-video': resource.type === 'video' }" data-test="workspace-media-view">
    <p v-if="notice" role="status">{{ tr(notice) }}</p>
    <template v-if="item">
      <VideoPanel v-if="resource.type === 'video' && videoContext" ref="videoRef" embedded :context="videoContext" :project-id="resource.bookId" :stale="stale" :validate-context="currentVideoMatches" @shots-updated="updateShots" />
      <template v-else><div class="workspace-media-actions"><span>{{ tr('参考内容') }}</span><button type="button" class="control-quiet" @click="openWorkbench">{{ tr(resource.type === 'comic' ? '打开漫画工作台' : '打开画师') }}</button></div><h1>{{ item.title }}</h1><ComicPagePreview v-if="resource.type === 'comic'" :page="item" /><img v-else-if="image" class="workspace-media-image" :src="image" :alt="item.title" /><pre v-if="item.content">{{ item.content }}</pre>
        <nav v-if="references.length" :aria-label="tr('查看来源')"><button v-for="source in references.filter(ref => ['chapter', 'worldbook-entry', 'narrative-asset', 'comic-page'].includes(ref.refType))" :key="`${source.refType}:${source.refId}`" type="button" class="control-quiet" @click="openSource(source)">{{ tr('查看来源') }} · {{ source.excerpt || source.refId }}</button></nav>
      </template>
    </template>
    <p v-else>{{ tr('这份内容已不存在或不属于当前作品。') }} <button type="button" class="control-quiet" @click="refresh">{{ tr('刷新') }}</button></p>
  </section>
</template>

<style scoped>
.workspace-media-view { padding: 24px; color: var(--text-primary); }
.workspace-media-view h1 { font: 600 20px/1.5 var(--font-sans); margin: 0 0 24px; }
.workspace-media-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; color: var(--text-secondary); font: 12px var(--font-sans); }
.workspace-media-view pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 15px/1.9 var(--font-sans); }
.workspace-media-image { display: block; width: 100%; max-height: 60vh; object-fit: contain; }
.workspace-media-view nav { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; }
.workspace-media-view nav button { text-align: start; overflow-wrap: anywhere; }
.workspace-media-view.is-video { display: flex; flex-direction: column; padding: 0; height: 100%; min-height: 0; }
</style>
