<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { BookOpen, X } from 'lucide-vue-next'
import { tr } from '../../i18n/index.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { getChapterMarkdown } from '../../services/writing/writingDocumentSchema.js'
import { addNarrativeAssetDurable, listNarrativeAssets } from '../../services/media/narrativeAssets.js'
const props = defineProps({ bookId: { type: String, required: true }, module: { type: String, required: true }, assetId: { type: String, default: '' }, blocked: Boolean, compact: Boolean })
const emit = defineEmits(['source', 'compare', 'adapt'])
const books = ref(loadWritingBooks())
const release = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
onScopeDispose(release)
const chapters = computed(() => books.value.find(book => book.id === props.bookId)?.chapters || [])
const chapterId = ref('')
const excerpt = ref('')
const selectionRange = ref(null)
const preview = ref(null)
const chapterText = computed(() => {
  const chapter = chapters.value.find(item => item.id === chapterId.value)
  return chapter ? getChapterMarkdown(chapter) : ''
})
watch(chapterText, () => { excerpt.value = ''; selectionRange.value = null; error.value = '' })
watch(() => props.bookId, () => { chapterId.value = ''; closePicker() })
function openPicker() {
  books.value = loadWritingBooks()
  if (!chapters.value.some(chapter => chapter.id === chapterId.value)) chapterId.value = chapters.value[0]?.id || ''
  error.value = ''
  panel.value?.showModal()
}
function captureSelection() {
  const start = preview.value?.selectionStart ?? 0
  const end = preview.value?.selectionEnd ?? 0
  excerpt.value = chapterText.value.slice(start, end)
  selectionRange.value = end > start ? { start, end } : null
}
function clearSelection() {
  excerpt.value = ''
  selectionRange.value = null
  preview.value?.setSelectionRange(0, 0)
}
watch(() => props.assetId, id => {
  const source = listNarrativeAssets({ projectId: props.bookId, status: null }).find(asset => asset.id === id)
  const ref = source?.sourceRefs?.find(ref => ref.refType === 'chapter' && ref.projectId === props.bookId)
  if (ref && chapters.value.some(chapter => chapter.id === ref.refId)) chapterId.value = ref.refId
}, { immediate: true })
const error = ref('')
const panel = ref(null)
function closePicker() { if (props.compact) panel.value?.close() }
function compare() { closePicker(); emit('compare', chapterId.value) }
function dismissBackdrop(event) {
  if (!props.compact || event.target !== panel.value) return
  const box = panel.value.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closePicker()
}
function useChapter(adapt = false) {
  if (props.blocked) return
  const chapter = loadWritingBooks().find(book => book.id === props.bookId)?.chapters?.find(chapter => chapter.id === chapterId.value)
  const fullText = chapter ? getChapterMarkdown(chapter) : ''
  if (adapt && fullText !== chapterText.value) { books.value = loadWritingBooks(); error.value = '正文已更新，请重新选择要改编的内容。'; return }
  const content = (adapt && selectionRange.value ? excerpt.value : fullText).trim()
  if (!content) { error.value = '这章还没有正文，请选择其他章节。'; return }
  if (adapt && content.length > 16000) { error.value = '单次可改编 16000 字，请在正文中选取一段。'; return }
  const result = addNarrativeAssetDurable({ projectId: props.bookId, title: chapter.title || '章节素材', content, kind: 'storyboard-seed', status: 'accepted', source: { type: 'chapter', chapterId: chapter.id, ...(adapt && selectionRange.value ? { selection: { ...selectionRange.value } } : {}) }, sourceRefs: [{ refType: 'chapter', refId: chapter.id, projectId: props.bookId, version: String(chapter.editorDocument?.revision ?? chapter.updatedAt ?? ''), excerpt: content.slice(0, 240) }] }, { dedupe: true })
  if (!result.ok) { error.value = '章节素材未能保存，请重试。'; return }
  error.value = ''
  closePicker()
  emit(adapt ? 'adapt' : 'source', result.asset.id)
}
</script>
<template>
  <div class="workspace-production-source" :class="{ 'is-compact': compact }">
    <button v-if="compact" type="button" class="source-trigger control-quiet" title="从正文生成" aria-label="从正文生成" :disabled="blocked" @click="openPicker"><BookOpen :size="16" aria-hidden="true" /><span>从正文生成</span></button>
    <component :is="compact ? 'dialog' : 'div'" ref="panel" class="source-controls" :class="{ 'source-dialog': compact, 'source-dialog--comic': compact && module === 'comics' }" :aria-label="compact ? tr('从正文生成') : undefined" @click="dismissBackdrop">
    <header v-if="compact"><strong>{{ tr('从正文生成') }}</strong><button type="button" :aria-label="tr('关闭')" @click="closePicker"><X :size="18" aria-hidden="true" /></button></header>
    <label><span>{{ tr(compact ? '章节' : '从正文开始') }}</span><select v-model="chapterId" :disabled="blocked" :aria-label="tr('选择制作章节')"><option value="">{{ tr('选择章节') }}</option><option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">{{ chapter.title }}</option></select></label>
    <template v-if="module === 'comics'">
      <div class="source-range"><span>{{ excerpt.trim() ? `已选 ${excerpt.trim().length} 字` : '整章改编' }}</span><button v-if="selectionRange" type="button" class="control-quiet" @click="clearSelection">使用整章</button><span v-else class="source-hint">也可在下方选取一段</span></div>
      <textarea ref="preview" class="source-preview" :value="chapterText" readonly aria-label="选择要改编的正文" placeholder="这章还没有正文" @select="captureSelection" />
      <footer class="source-actions"><button type="button" class="control-quiet" :disabled="!chapterId" @click="compare">对照原章</button><button type="button" class="control-primary" :disabled="!chapterText.trim() || blocked || Boolean(selectionRange && !excerpt.trim())" @click="useChapter(true)">{{ selectionRange ? '从选段生成分镜' : '从整章生成分镜' }}</button></footer>
    </template>
    <button v-if="module !== 'comics'" type="button" class="control-quiet" :disabled="!chapterId || blocked" @click="useChapter(false)">{{ tr(module === 'comics' ? '用作漫画素材' : '加入镜头画布') }}</button>
    <button v-if="module !== 'comics'" type="button" class="control-quiet" :disabled="!chapterId" @click="compare">{{ tr('对照原章') }}</button>
    <span v-if="error" class="source-error" role="alert">{{ tr(error) }}</span>
    </component>
  </div>
</template>
<style scoped>
.workspace-production-source { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--hairline-soft); color: var(--text-secondary); font: 12px var(--font-sans); }
.source-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
label { display: flex; align-items: center; gap: 10px; min-width: 0; }
select { width: min(240px, 40vw); min-height: 32px; padding: 4px 8px; border: 0; border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-workbench-input); font: inherit; }
@container creative-module (max-width: 760px) { .workspace-production-source { padding: 8px 12px; } select, button { min-height: 44px; } }
.workspace-production-source.is-compact { padding: 0; border: 0; }
.source-trigger { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; border: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.source-dialog:not([open]) { display: none; }
.source-dialog { position: fixed; inset: 0; margin: auto; width: min(360px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 20px; box-sizing: border-box; overflow: auto; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); font: 13px/1.5 var(--font-sans); }
.source-dialog::backdrop { background: var(--surface-workbench-scrim); }
.source-dialog header { display: flex; align-items: center; width: 100%; margin-bottom: 12px; }
.source-dialog header strong { flex: 1; font-weight: 600; font-size: 15px; }
.source-dialog header button { display: grid; place-items: center; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.source-dialog label { display: grid; gap: 8px; width: 100%; margin-bottom: 10px; }
.source-dialog select { width: 100%; min-height: 40px; }
@container creative-module (max-width: 760px) { .source-trigger { width: auto; padding-inline: 6px; white-space: nowrap; } }
.source-dialog--comic { width: min(680px, calc(100vw - 32px)); }
.source-range, .source-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.source-range { color: var(--text-secondary); }
.source-hint { color: var(--text-muted); }
.source-preview { width: 100%; height: min(42dvh, 360px); min-height: 140px; resize: vertical; padding: 12px 0; border: 0; border-block: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; color: var(--text-primary); font: 14px/1.85 var(--font-sans); }
.source-preview::selection { background: var(--nav-selected); }
.source-actions { margin-top: 12px; }
.source-actions button { min-height: 40px; padding: 8px 12px; cursor: pointer; }
.source-error { width: 100%; color: var(--danger); }
.source-controls :is(button, select, textarea):focus-visible { outline: 2px solid var(--workbench-focus, var(--accent)); outline-offset: 2px; }
@media (max-width: 640px), (pointer: coarse) { .source-actions button { min-height: 44px; } .source-hint { font-size: 12px; } }
</style>
