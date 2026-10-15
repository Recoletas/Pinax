<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { useWorldStore } from '../../stores/worldStore.js'
import { useSettingsProjectContext } from '../../composables/useSettingsProjectContext.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { getChapterMarkdown } from '../../services/writing/writingDocumentSchema.js'
import { loadSourceChunks } from '../../services/worldbook/worldbookSourceArchive.js'
import { sourceChunkLocator } from '../../services/workspace/sourceChunkLocator.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const props = defineProps({ resource: { type: Object, required: true }, instanceId: { type: String, required: true } })
const emit = defineEmits(['title'])
const host = useComposableWorkspace()
const navigationError = ref('')
const worldStore = useWorldStore()
const { worldbook, loading, loadError, refresh } = useSettingsProjectContext({ worldStore,
  bookId: computed(() => props.resource.bookId), worldbookId: computed(() => props.resource.worldbookId) })
const books = ref(loadWritingBooks())
const unsubscribe = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
const source = computed(() => worldbook.value?.sourceDocuments?.find(item => String(item.id) === props.resource.id) || null)
const chapter = computed(() => books.value.find(book => String(book.id) === props.resource.bookId)?.[props.resource.type === 'exploration' ? 'explorationDocuments' : 'chapters']?.find(item => String(item.id) === props.resource.id) || null)
const entry = computed(() => worldbook.value?.entries?.find(item => String(item.id) === props.resource.id) || null)
const title = computed(() => ['chapter', 'exploration'].includes(props.resource.type) ? chapter.value?.title : props.resource.type === 'entry' ? entry.value?.name || entry.value?.title : source.value?.title)
watch(title, value => emit('title', value || ''), { immediate: true })
const chunks = ref([])
const page = ref(0)
const reading = ref(false)
const error = ref('')
const chunkRefs = ref(null)
const PAGE_SIZE = 8
const pageCount = computed(() => Math.max(1, Math.ceil((source.value?.chunkIds?.length || 0) / PAGE_SIZE)))
let sequence = 0
let disposed = false
const stale = computed(() => (props.resource.worldbookId && worldbook.value?.id && props.resource.worldbookId !== String(worldbook.value.id))
  || (props.resource.contentHash && source.value && props.resource.contentHash !== source.value.contentHash))
async function read() {
  const ticket = ++sequence
  chunks.value = []; error.value = ''; reading.value = false
  if (props.resource.type !== 'source' || !source.value || stale.value) return
  const snapshot = source.value
  const ids = snapshot.chunkIds?.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE) || []
  if (!ids.length) return
  reading.value = true
  try {
    const loaded = await loadSourceChunks(ids)
    if (disposed || ticket !== sequence) return
    const byId = new Map(loaded.map(chunk => [String(chunk.id), chunk]))
    chunks.value = ids.flatMap((id, index) => {
      const chunk = byId.get(String(id))
      const absoluteIndex = page.value * PAGE_SIZE + index
      const occurrence = snapshot.chunkIds.slice(0, absoluteIndex).filter(previous => previous === id).length
      return chunk ? [{ ...chunk, viewKey: `${id}:${absoluteIndex}`, locator: sourceChunkLocator(chunk, snapshot.archiveRef || snapshot.id, occurrence) }] : []
    })
    if (chunks.value.length !== ids.length) error.value = '部分归档块已缺失，可重新导入恢复。'
    await nextTick()
    if (disposed || ticket !== sequence) return
    const target = chunkRefs.value?.querySelector('[data-target="true"]')
    target?.scrollIntoView({ block: 'nearest' })
  } catch { if (!disposed && ticket === sequence) error.value = '原文读取失败，请重试。' }
  finally { if (!disposed && ticket === sequence) reading.value = false }
}
watch([() => props.resource, source, stale], () => {
  const index = source.value?.chunkIds?.indexOf(props.resource.chunkId) ?? -1
  page.value = index >= 0 ? Math.floor(index / PAGE_SIZE) : 0
  void read()
}, { immediate: true })
function changePage(delta) { page.value = Math.max(0, Math.min(pageCount.value - 1, page.value + delta)); void read() }
function isTarget(chunk) { return chunk.id === props.resource.chunkId && (!Number.isFinite(props.resource.start) || Number(chunk.locator?.start) === props.resource.start) }
function fragment(chunk) {
  const start = props.resource.start
  const end = props.resource.end
  const offset = Number(chunk.locator?.start)
  if (!isTarget(chunk) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(offset)
    || start < offset || end > offset + chunk.text.length || end <= start) return [chunk.text, '', '']
  return [chunk.text.slice(0, start - offset), chunk.text.slice(start - offset, end - offset), chunk.text.slice(end - offset)]
}
onBeforeUnmount(() => { disposed = true; sequence += 1; unsubscribe() })
async function editOriginal() {
  navigationError.value = ''
  if (['chapter', 'exploration'].includes(props.resource.type)) {
    if (!await host.move(true, props.instanceId)) navigationError.value = host.state.notice || '请先处理当前工作区的未保存内容或任务。'
    return
  }
  if (!host.openResource({ type: 'entries-editor', bookId: props.resource.bookId, worldbookId: worldbook.value?.id || props.resource.worldbookId, entryId: props.resource.id }) || !await host.move(true)) navigationError.value = host.state.notice || '暂时无法打开编辑器，参考内容仍保留。'
}

</script>

<template>
  <article class="workspace-reference" data-test="workspace-reference-view">
    <div v-if="['chapter', 'exploration', 'entry'].includes(resource.type) && entry?.type !== 'source'" class="workspace-reference-edit"><span>{{ tr('参考内容') }}</span><button type="button" class="control-quiet" @click="editOriginal">{{ tr(['chapter', 'exploration'].includes(resource.type) ? '在正文编辑' : '编辑设定') }}</button></div>
    <p v-if="navigationError" role="status">{{ tr(navigationError) }}</p>
    <p v-if="loading && !['chapter', 'exploration'].includes(resource.type)" role="status">{{ tr('加载中…') }}</p>
    <div v-else-if="stale" role="alert"><p>{{ tr('来源版本或关联已变化，请重新打开当前资料。') }}</p></div>
    <div v-else-if="!['chapter', 'exploration'].includes(resource.type) && loadError" role="alert"><p>{{ tr(loadError) }}</p><button class="control-secondary" type="button" @click="refresh">{{ tr('重新加载') }}</button></div>
    <template v-else-if="['chapter', 'exploration'].includes(resource.type) && chapter">
      <h1>{{ title }}</h1><pre class="workspace-reference-text">{{ resource.type === 'exploration' ? chapter.content : getChapterMarkdown(chapter) }}</pre>
    </template>
    <template v-else-if="resource.type === 'entry' && entry">
      <h1>{{ title }}</h1><pre class="workspace-reference-text">{{ entry.content || entry.description || '' }}</pre>
    </template>
    <template v-else-if="resource.type === 'source' && source">
      <h1>{{ title }}</h1>
      <p v-if="reading" role="status">{{ tr('原文读取中……') }}</p>
      <p v-if="error" role="alert">{{ tr(error) }} <button type="button" class="control-quiet" @click="read">{{ tr('重试') }}</button></p>
      <div v-if="!reading" ref="chunkRefs" class="workspace-reference-chunks">
        <p v-for="chunk in chunks" :key="chunk.viewKey" class="workspace-reference-text" :data-target="isTarget(chunk) ? 'true' : undefined"><span>{{ fragment(chunk)[0] }}</span><mark v-if="fragment(chunk)[1]">{{ fragment(chunk)[1] }}</mark><span>{{ fragment(chunk)[2] }}</span></p>
        <template v-if="!source.chunkIds?.length"><p role="status">{{ tr('归档块缺失，当前显示导入时预览。') }}</p><pre class="workspace-reference-text">{{ source.contentPreview || source.content || tr('（无可显示内容）') }}</pre></template>
      </div>
      <nav v-if="pageCount > 1" class="workspace-reference-pagination" :aria-label="tr('原文分页')">
        <button type="button" class="control-quiet" :disabled="page === 0 || reading" :aria-label="tr('上一页')" @click="changePage(-1)"><WorkbenchIcon name="arrow-left" /></button>
        <span>{{ page + 1 }} / {{ pageCount }}</span>
        <button type="button" class="control-quiet" :disabled="page + 1 >= pageCount || reading" :aria-label="tr('下一页')" @click="changePage(1)"><WorkbenchIcon name="arrow-right" /></button>
      </nav>
    </template>
    <p v-else role="status">{{ tr('这份内容已不存在或不属于当前作品。') }}</p>
  </article>
</template>

<style scoped>
.workspace-reference { padding: 28px clamp(20px, 4vw, 48px); max-width: 900px; margin: 0 auto; color: var(--text-primary); }
.workspace-reference h1 { font: 600 20px/1.5 var(--font-sans); margin: 0 0 28px; overflow-wrap: anywhere; }
.workspace-reference-text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 24px; font: 16px/1.9 var(--font-serif, var(--font-sans)); }
.workspace-reference mark { background: var(--nav-focused); color: inherit; }
.workspace-reference-edit { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; color: var(--text-secondary); font: 12px var(--font-sans); }
.workspace-reference-pagination { display: flex; align-items: center; justify-content: center; gap: 16px; border-top: 1px solid var(--hairline-soft); padding-top: 16px; color: var(--text-secondary); }
</style>
