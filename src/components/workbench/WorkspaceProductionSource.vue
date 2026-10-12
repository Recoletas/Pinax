<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { getChapterMarkdown } from '../../services/writing/writingDocumentSchema.js'
import { addNarrativeAssetDurable, listNarrativeAssets } from '../../services/media/narrativeAssets.js'
const props = defineProps({ bookId: { type: String, required: true }, module: { type: String, required: true }, assetId: { type: String, default: '' }, blocked: Boolean })
const emit = defineEmits(['source', 'compare'])
const books = ref(loadWritingBooks())
const release = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
onScopeDispose(release)
const chapters = computed(() => books.value.find(book => book.id === props.bookId)?.chapters || [])
const chapterId = ref('')
watch(() => props.assetId, id => {
  const source = listNarrativeAssets({ projectId: props.bookId, status: null }).find(asset => asset.id === id)
  const ref = source?.sourceRefs?.find(ref => ref.refType === 'chapter' && ref.projectId === props.bookId)
  if (ref && chapters.value.some(chapter => chapter.id === ref.refId)) chapterId.value = ref.refId
}, { immediate: true })
const error = ref('')
function useChapter() {
  if (props.blocked) return
  const chapter = loadWritingBooks().find(book => book.id === props.bookId)?.chapters?.find(chapter => chapter.id === chapterId.value)
  const content = chapter ? getChapterMarkdown(chapter).trim() : ''
  if (!content) { error.value = '这章还没有正文，请选择其他章节。'; return }
  const result = addNarrativeAssetDurable({ projectId: props.bookId, title: chapter.title || '章节素材', content, kind: 'storyboard-seed', status: 'accepted', source: { type: 'chapter', chapterId: chapter.id }, sourceRefs: [{ refType: 'chapter', refId: chapter.id, projectId: props.bookId, version: String(chapter.editorDocument?.revision ?? chapter.updatedAt ?? ''), excerpt: content.slice(0, 240) }] }, { dedupe: true })
  if (!result.ok) { error.value = '章节素材未能保存，请重试。'; return }
  error.value = ''
  emit('source', result.asset.id)
}
</script>
<template>
  <div class="workspace-production-source">
    <label><span>{{ tr('从正文开始') }}</span><select v-model="chapterId" :disabled="blocked" :aria-label="tr('选择制作章节')"><option value="">{{ tr('选择章节') }}</option><option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">{{ chapter.title }}</option></select></label>
    <button type="button" class="control-quiet" :disabled="!chapterId || blocked" @click="useChapter">{{ tr(module === 'comics' ? '用作漫画素材' : '加入镜头画布') }}</button>
    <button type="button" class="control-quiet" :disabled="!chapterId" @click="emit('compare', chapterId)">{{ tr('对照原章') }}</button>
    <span v-if="error" role="status">{{ tr(error) }}</span>
  </div>
</template>
<style scoped>
.workspace-production-source { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--hairline-soft); color: var(--text-secondary); font: 12px var(--font-sans); }
label { display: flex; align-items: center; gap: 10px; min-width: 0; }
select { width: min(240px, 40vw); min-height: 32px; padding: 4px 8px; border: 0; border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-workbench-input); font: inherit; }
@container creative-module (max-width: 760px) { .workspace-production-source { padding: 8px 12px; } select, button { min-height: 44px; } }
</style>
