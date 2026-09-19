<template>
  <section class="authoring-dual-pane" :class="{ 'has-intervention-ghost': interventionGhostOpen, 'is-directory-closed': !directoryOpen }" :data-active-pane="active.toString()" :data-intervention-ghost-open="interventionGhostOpen.toString()" :data-intervention-ghost-unit="interventionGhostTarget?.unitId || ''" data-test="authoring-dual-pane" aria-label="双栏编辑" @focusin="emit('activate', { kind: selectedKind, id: selectedSourceId })">
    <div class="authoring-dual-pane__editor">
      <header ref="headerRef" class="authoring-dual-pane__head">
        <div class="authoring-dual-pane__title">
          <small>{{ selectedOrdinal }}</small>
          <strong>{{ selectedTitle }}</strong>
        </div>
        <div class="authoring-dual-pane__actions">
          <span v-if="isDocumentSource && selectedSource && saveState !== 'saved'" class="authoring-dual-pane__save" :class="`is-${saveState}`" role="status">{{ saveLabel }}</span>
          <button v-if="isDocumentSource && commandAvailability.undo" type="button" title="撤销副窗修改" aria-label="撤销副窗修改" @click="runHistory('undo')">↶</button>
          <button v-if="isDocumentSource && commandAvailability.redo" type="button" title="重做副窗修改" aria-label="重做副窗修改" @click="runHistory('redo')">↷</button>
          <button v-if="selectedKind === 'chapter' && selectedChapterId !== String(mainChapterId)" type="button" title="交换主副章" aria-label="交换主副章" @click="swapPane">⇄</button>
          <button type="button" :title="directoryOpen ? '收起副窗目录' : '展开副窗目录'" aria-label="切换副窗内容" :disabled="interventionGhostOpen" :aria-pressed="directoryOpen.toString()" :aria-expanded="directoryOpen && !interventionGhostOpen" @click="toggleDirectory"><WorkbenchIcon name="panel-left" :size="16" /></button>
          <button type="button" title="关闭双栏" aria-label="关闭双栏" @click="closePane">×</button>
        </div>
      </header>

      <div v-if="$slots.notice" class="authoring-dual-pane__notice">
        <slot name="notice" />
      </div>

      <div v-if="sourceMissing" class="authoring-dual-pane__empty is-missing" role="status">
        <strong>{{ missingLabel }}</strong>
        <p>原位置仍保留在副窗中，请从切换面板选择其他内容。</p>
      </div>
      <div v-else-if="!selectedSource" class="authoring-dual-pane__empty">
        <strong>选择副窗内容</strong>
        <p>可以并排写章节、速记，也可以查看大纲和世界设定。</p>
      </div>
      <div v-else-if="isDocumentSource" ref="scrollRef" class="authoring-dual-pane__scroll">
        <WritingNotebookEditor
          :key="editorKey"
          ref="editorRef"
          :model-value="markdown"
          :document="documentState"
          :editable="true"
          :annotations="[]"
          :worldbook-mentions="[]"
          :inline-suggestion-visible="false"
          :block-composer-open="interventionGhostOpen"
          :block-composer-target="interventionGhostTarget"
          :block-composer-enabled="interventionGhostOpen"
          :history-locked="false"
          :before-destructive-edit="requestDestructiveProtection"
          block-gap-id="authoring-dual-block-gap"
          :style="editorStyle"
          :data-document-role="selectedKind === 'exploration' ? 'dual-exploration' : 'dual-manuscript'"
          @update:modelValue="onMarkdownUpdate"
          @update:document="onDocumentUpdate"
          @selection-change="onSelectionChange"
          @history-command="runHistory"
          @ready="onEditorReady"
          @composition-change="onCompositionChange"
        />
      </div>
      <div v-else-if="selectedKind === 'outline'" class="authoring-dual-pane__reference-scroll" data-document-role="dual-outline">
        <article class="authoring-dual-pane__reference">
          <header><span>{{ outlineStatusLabel }}</span><h3>{{ selectedOutlineNode.title }}</h3></header>
          <p class="authoring-dual-pane__reference-copy">{{ selectedOutlineNode.intent || '这个大纲节点还没有补充意图。' }}</p>
          <section v-if="outlineChapterLabels.length"><strong>关联章节</strong><p>{{ outlineChapterLabels.join(' · ') }}</p></section>
          <section v-if="selectedOutlineRelations.length"><strong>叙事关系</strong><ul><li v-for="relation in selectedOutlineRelations" :key="relation.id">{{ relation.label }}</li></ul></section>
          <section v-if="selectedOutlineNode.sourceRefs?.length"><strong>来源</strong><p>{{ selectedOutlineNode.sourceRefs.join(' · ') }}</p></section>
          <footer><button type="button" @click="emit('open-outline', selectedOutlineNode.id)">在大纲中打开</button></footer>
        </article>
      </div>
      <div v-else class="authoring-dual-pane__reference-scroll" data-document-role="dual-worldbook-entry">
        <AuthoringSettingDetail
          :item="selectedWorldbookDetail"
          :selected-text="''"
          @open-full="emit('open-worldbook', selectedWorldbookEntry.id)"
        />
      </div>
      <div
        v-if="active && isDocumentSource && quickWordSuggestions.length"
        class="authoring-quick-word-strip is-dual"
        role="listbox"
        aria-label="副栏快捷词建议"
        @click.stop
      >
        <span>{{ quickWordPrefix }}</span>
        <button
          v-for="(item, index) in quickWordSuggestions"
          :key="item.id"
          type="button"
          role="option"
          :aria-keyshortcuts="String(index + 1)"
          @mousedown.prevent
          @click="emit('quick-word-complete', item)"
        ><kbd>{{ index + 1 }}</kbd>{{ item.text }}</button>
      </div>
    </div>

    <aside v-if="directoryOpen && !interventionGhostOpen" class="authoring-dual-pane__directory" data-test="authoring-dual-directory" aria-label="切换副窗内容">
      <label class="authoring-dual-pane__search">
        <WorkbenchIcon name="search" :size="14" />
        <input v-model="query" type="search" :placeholder="switchSearchPlaceholder" aria-label="搜索当前项目" />
        <select :value="activeSwitch" aria-label="副窗内容类型" @change="selectSwitch($event.target.value)">
          <option v-for="option in switchOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <div v-if="activeSwitch === 'chapter'" class="authoring-dual-pane__group">
        <WorkbenchIcon name="folder" :size="14" />
        <span>第一卷</span>
      </div>
      <template v-if="activeSwitch === 'chapter'">
      <button
        v-for="entry in filteredChapters"
        :key="entry.chapter.id"
        type="button"
        class="authoring-dual-pane__chapter"
        :data-chapter-id="entry.chapter.id"
        :class="{ 'is-active': selectedChapterId === entry.chapter.id, 'is-main': mainChapterId === entry.chapter.id }"
        :title="mainChapterId === entry.chapter.id ? '在双栏查看当前主章的另一处' : `在双栏打开${entry.chapter.title || `第${entry.index + 1}章`}`"
        @click="selectChapter(entry.chapter.id)"
      >
        <span><strong>{{ chapterLabel(entry.index, entry.chapter.title) }}</strong></span>
      </button>
      </template>
      <template v-if="activeSwitch === 'exploration'">
        <div class="authoring-dual-pane__group">
          <WorkbenchIcon name="pencil" :size="14" />
          <span>便签</span>
        </div>
        <button
          v-for="doc in filteredExplorations"
          :key="doc.id"
          type="button"
          class="authoring-dual-pane__chapter"
          :class="{ 'is-active': selectedKind === 'exploration' && selectedExplorationId === doc.id, 'is-main': mainExplorationId === doc.id }"
          :data-exploration-id="doc.id"
          @click="selectExploration(doc.id)"
        >
          <span><strong>{{ doc.title || '未命名便签' }}</strong></span>
        </button>
      </template>
      <template v-if="activeSwitch === 'outline'">
        <div class="authoring-dual-pane__group">
          <WorkbenchIcon name="book" :size="14" />
          <span>大纲</span>
        </div>
        <button
          v-for="node in filteredOutlineNodes"
          :key="node.id"
          type="button"
          class="authoring-dual-pane__chapter"
          :class="{ 'is-active': selectedKind === 'outline' && selectedOutlineNodeId === node.id }"
          :data-outline-node-id="node.id"
          @click="selectOutline(node.id)"
        >
          <span><strong>{{ node.title || '未命名节点' }}</strong></span>
        </button>
      </template>
      <template v-if="activeSwitch === 'character' || activeSwitch === 'setting'">
        <div class="authoring-dual-pane__group">
          <WorkbenchIcon name="archive" :size="14" />
          <span>{{ activeSwitch === 'character' ? '角色' : '设定' }}</span>
        </div>
        <button
          v-for="entry in filteredSwitchWorldbookEntries"
          :key="entry.id"
          type="button"
          class="authoring-dual-pane__chapter"
          :class="{ 'is-active': selectedKind === 'worldbook-entry' && selectedWorldbookEntryId === entry.id }"
          :data-worldbook-entry-id="entry.id"
          @click="selectWorldbookEntry(entry.id)"
        >
          <span><strong>{{ entry.name || '未命名设定' }}</strong></span>
        </button>
      </template>
      <p v-if="!hasFilteredSources" class="authoring-dual-pane__no-result">没有匹配内容</p>
    </aside>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import WritingNotebookEditor from '../writing/WritingNotebookEditor.vue'
import { buildWritingSelectionRanges } from '../../services/writing/writingSelectionRanges.js'
import AuthoringSettingDetail from './AuthoringSettingDetail.vue'
import { useWritingDocument } from '../../composables/useWritingDocument.js'
import { buildAuthoringSettingDetail } from '../../services/authoring/authoringSettingContext.js'
import { buildDocumentRevision } from '../../services/agents/authoring/authoringTextTransaction.js'
import { getWritingDocumentMarkdown } from '../../services/writing/writingDocumentSchema.js'

const props = defineProps({
  bookId: { type: String, default: '' },
  chapters: { type: Array, default: () => [] },
  explorations: { type: Array, default: () => [] },
  outlineNodes: { type: Array, default: () => [] },
  outlineEdges: { type: Array, default: () => [] },
  worldbook: { type: Object, default: null },
  mainChapterId: { type: String, default: '' },
  mainExplorationId: { type: String, default: '' },
  initialChapterId: { type: String, default: '' },
  initialExplorationId: { type: String, default: '' },
  initialOutlineNodeId: { type: String, default: '' },
  initialWorldbookEntryId: { type: String, default: '' },
  mainDocument: { type: Object, default: null },
  mainMarkdown: { type: String, default: '' },
  active: Boolean,
  saveChapter: { type: Function, required: true },
  saveExploration: { type: Function, required: true },
  protectDestructiveEdit: { type: Function, default: null },
  resolveSceneProjection: { type: Function, default: null },
  editorStyle: { type: Object, default: () => ({}) },
  quickWordPrefix: { type: String, default: '' },
  quickWordSuggestions: { type: Array, default: () => [] },
  interventionGhostOpen: Boolean,
  interventionGhostTarget: { type: Object, default: null }
})

const emit = defineEmits(['close', 'activate', 'source-change', 'document-change', 'selection-change', 'composition-change', 'command-availability', 'quick-word-complete', 'swap', 'open-outline', 'open-worldbook'])
const editorRef = ref(null)
const headerRef = ref(null)
let headerObserver
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  headerObserver = new ResizeObserver(() => {
    const header = headerRef.value
    header?.closest('.authoring-dual-pane')?.style.setProperty('--dual-header-height', `${header.offsetHeight}px`)
  })
  if (headerRef.value) headerObserver.observe(headerRef.value)
})
onBeforeUnmount(() => headerObserver?.disconnect())
const scrollRef = ref(null)
const selectedChapterId = ref('')
const selectedExplorationId = ref('')
const selectedOutlineNodeId = ref('')
const selectedWorldbookEntryId = ref('')
const selectedKind = ref('chapter')
const markdown = ref('')
const title = ref('')
const query = ref('')
const activeSwitch = ref('chapter')
const directoryOpen = ref(typeof window === 'undefined' || window.innerWidth > 720)
const dirty = ref(false)
const composing = ref(false)
const saveState = ref('saved')
const interventionAdoptionPending = ref(false)
const commandAvailability = ref({ undo: false, redo: false })
const editorEpoch = ref(0)
const { document: documentState, loadChapterDocument, readChapterSource, persistChapterDocument } = useWritingDocument()
let saveTimer = null

const selectedChapter = computed(() => props.chapters.find((chapter) => String(chapter?.id) === selectedChapterId.value) || null)
const selectedExploration = computed(() => props.explorations.find((doc) => String(doc?.id) === selectedExplorationId.value) || null)
const selectedOutlineNode = computed(() => props.outlineNodes.find((node) => String(node?.id) === selectedOutlineNodeId.value) || null)
const worldbookEntries = computed(() => Array.isArray(props.worldbook?.entries) ? props.worldbook.entries : [])
const switchOptions = computed(() => [
  { id: 'chapter', label: '章节' },
  { id: 'outline', label: '大纲' },
  { id: 'character', label: '角色' },
  { id: 'setting', label: '设定' },
  { id: 'exploration', label: '便签' }
])
const switchSearchPlaceholder = computed(() => ({
  chapter: '搜索章节',
  outline: '搜索大纲',
  character: '搜索角色',
  setting: '搜索设定',
  exploration: '搜索便签'
})[activeSwitch.value] || '搜索当前项目')
const selectedWorldbookEntry = computed(() => worldbookEntries.value.find((entry) => String(entry?.id) === selectedWorldbookEntryId.value) || null)
const selectedSource = computed(() => ({
  chapter: selectedChapter.value,
  exploration: selectedExploration.value,
  outline: selectedOutlineNode.value,
  'worldbook-entry': selectedWorldbookEntry.value
})[selectedKind.value] || null)
const selectedSourceId = computed(() => ({
  chapter: selectedChapterId.value,
  exploration: selectedExplorationId.value,
  outline: selectedOutlineNodeId.value,
  'worldbook-entry': selectedWorldbookEntryId.value
})[selectedKind.value] || '')
const isDocumentSource = computed(() => selectedKind.value === 'chapter' || selectedKind.value === 'exploration')
const sourceMissing = computed(() => Boolean(selectedSourceId.value && !selectedSource.value))
const missingLabel = computed(() => ({
  chapter: '章节已删除', exploration: '速记已删除', outline: '大纲节点已删除', 'worldbook-entry': '设定已删除或解绑'
})[selectedKind.value] || '资料已删除')
const selectedTitle = computed(() => {
  if (sourceMissing.value) return missingLabel.value
  if (selectedKind.value === 'worldbook-entry') return selectedWorldbookEntry.value?.name || '未命名设定'
  return selectedSource.value?.title || '选择内容'
})
const selectedOrdinal = computed(() => {
  if (selectedKind.value === 'exploration') return '速记'
  if (selectedKind.value === 'outline') return '大纲'
  if (selectedKind.value === 'worldbook-entry') return '设定'
  const index = props.chapters.findIndex((chapter) => String(chapter?.id) === selectedChapterId.value)
  return index >= 0 ? `第${chineseNumber(index + 1)}章` : '副章'
})
const editorKey = computed(() => `${props.bookId}:${selectedKind.value}:${selectedSourceId.value}:${editorEpoch.value}`)
const saveLabel = computed(() => ({ saving: '保存中', error: '保存失败', unsaved: '未保存', saved: '已保存' })[saveState.value] || '')
const filteredChapters = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => !needle || String(chapter?.title || '').toLocaleLowerCase().includes(needle))
})
const filteredExplorations = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.explorations.filter((doc) => !needle || String(doc?.title || '').toLocaleLowerCase().includes(needle))
})
const filteredOutlineNodes = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.outlineNodes.filter((node) => !needle || `${node?.title || ''} ${node?.intent || ''}`.toLocaleLowerCase().includes(needle))
})
const filteredWorldbookEntries = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return worldbookEntries.value.filter((entry) => !needle || `${entry?.name || ''} ${entry?.content || ''} ${(entry?.keys || []).join(' ')}`.toLocaleLowerCase().includes(needle))
})
const filteredSwitchWorldbookEntries = computed(() => filteredWorldbookEntries.value.filter((entry) => (
  activeSwitch.value === 'character' ? entry?.type === 'character' : entry?.type !== 'character'
)))
const hasFilteredSources = computed(() => ({
  chapter: filteredChapters.value.length,
  outline: filteredOutlineNodes.value.length,
  character: filteredSwitchWorldbookEntries.value.length,
  setting: filteredSwitchWorldbookEntries.value.length,
  exploration: filteredExplorations.value.length
})[activeSwitch.value] > 0)
const selectedWorldbookDetail = computed(() => buildAuthoringSettingDetail(selectedWorldbookEntry.value, null, null))
const outlineStatusLabel = computed(() => ({ exploring: '推演中', planned: '已计划', drafted: '已成稿', fulfilled: '已兑现', parked: '已搁置' })[selectedOutlineNode.value?.status] || '大纲节点')
const outlineChapterLabels = computed(() => (selectedOutlineNode.value?.chapterRefs || []).map((chapterId) => {
  const index = props.chapters.findIndex((chapter) => String(chapter?.id) === String(chapterId))
  return index >= 0 ? chapterLabel(index, props.chapters[index]?.title) : '已移除章节'
}))
const selectedOutlineRelations = computed(() => {
  if (!selectedOutlineNode.value) return []
  const labels = { causes: '因果', foreshadows: '伏笔', alternative: '另一种可能', parallel: '并行' }
  return props.outlineEdges
    .filter((edge) => edge.fromNodeId === selectedOutlineNode.value.id || edge.toNodeId === selectedOutlineNode.value.id)
    .map((edge) => {
      const outgoing = edge.fromNodeId === selectedOutlineNode.value.id
      const peerId = outgoing ? edge.toNodeId : edge.fromNodeId
      const peer = props.outlineNodes.find((node) => node.id === peerId)
      return { ...edge, label: `${outgoing ? '指向' : '来自'} · ${labels[edge.kind] || '关联'} · ${peer?.title || '已移除节点'}` }
    })
})

function chineseNumber(value) {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (value < 10) return digits[value]
  if (value === 10) return '十'
  if (value < 20) return `十${digits[value % 10]}`
  if (value < 100) return `${digits[Math.floor(value / 10)]}十${digits[value % 10]}`
  return String(value)
}

function chapterLabel(index, value) {
  const ordinal = `第${chineseNumber(index + 1)}章`
  const name = String(value || '').trim().replace(/^第\s*(?:[零〇一二三四五六七八九十百千万两]+|\d+)\s*章(?:\s*[-—:：·、.]?\s*)?/u, '').trim()
  return name ? `${ordinal} ${name}` : ordinal
}

function selectSwitch(kind) {
  activeSwitch.value = kind
  query.value = ''
}

function syncSwitchToSelectedSource() {
  activeSwitch.value = selectedKind.value === 'worldbook-entry'
    ? (selectedWorldbookEntry.value?.type === 'character' ? 'character' : 'setting')
    : selectedKind.value
}

function toggleDirectory() {
  directoryOpen.value = !directoryOpen.value
  if (directoryOpen.value) syncSwitchToSelectedSource()
}

function normalizeFallback(raw, format) {
  if (format !== 'html') return String(raw || '')
  if (typeof DOMParser === 'undefined') return String(raw || '').replace(/<[^>]+>/g, '')
  const parsed = new DOMParser().parseFromString(String(raw || ''), 'text/html')
  return [...parsed.body.children].map((node) => node.textContent || '').join('\n\n') || parsed.body.textContent || ''
}

function defaultChapterId() {
  const explicit = props.chapters.find((chapter) => String(chapter?.id) === String(props.initialChapterId))
  if (explicit) return String(explicit.id)
  return String(props.mainChapterId || props.chapters[0]?.id || '')
}

function defaultSource() {
  const outline = props.outlineNodes.find((node) => String(node?.id) === String(props.initialOutlineNodeId))
  if (outline) return { kind: 'outline', id: String(outline.id) }
  const entry = worldbookEntries.value.find((item) => String(item?.id) === String(props.initialWorldbookEntryId))
  if (entry) return { kind: 'worldbook-entry', id: String(entry.id) }
  const exploration = props.explorations.find((doc) => String(doc?.id) === String(props.initialExplorationId))
  if (exploration) return { kind: 'exploration', id: String(exploration.id) }
  return { kind: 'chapter', id: defaultChapterId() }
}

function clearSelectedIds() {
  selectedChapterId.value = ''
  selectedExplorationId.value = ''
  selectedOutlineNodeId.value = ''
  selectedWorldbookEntryId.value = ''
}

function loadSelectedChapter(chapterId) {
  const chapter = props.chapters.find((item) => String(item?.id) === String(chapterId))
  if (!chapter) return false
  selectedKind.value = 'chapter'
  clearSelectedIds()
  selectedChapterId.value = String(chapter.id)
  activeSwitch.value = 'chapter'
  title.value = String(chapter.title || '')
  if (String(chapter.id) === String(props.mainChapterId) && props.mainDocument) {
    documentState.value = JSON.parse(JSON.stringify(props.mainDocument))
    markdown.value = String(props.mainMarkdown || '')
  } else {
    const { raw, format } = readChapterSource(chapter)
    markdown.value = loadChapterDocument(chapter, normalizeFallback(raw, format))
  }
  dirty.value = false
  saveState.value = 'saved'
  editorEpoch.value += 1
  emit('source-change', { kind: 'chapter', id: selectedChapterId.value })
  emit('document-change', documentState.value)
  nextTick(refreshCommands)
  return true
}

function loadSelectedExploration(documentId) {
  const doc = props.explorations.find((item) => String(item?.id) === String(documentId))
  if (!doc) return false
  selectedKind.value = 'exploration'
  clearSelectedIds()
  selectedExplorationId.value = String(doc.id)
  activeSwitch.value = 'exploration'
  title.value = String(doc.title || '')
  if (String(doc.id) === String(props.mainExplorationId) && props.mainDocument) {
    documentState.value = JSON.parse(JSON.stringify(props.mainDocument))
    markdown.value = String(props.mainMarkdown || '')
  } else {
    markdown.value = loadChapterDocument({ ...doc, editorDocument: null }, String(doc.content || ''))
  }
  dirty.value = false
  saveState.value = 'saved'
  editorEpoch.value += 1
  emit('source-change', { kind: 'exploration', id: selectedExplorationId.value })
  emit('document-change', documentState.value)
  nextTick(refreshCommands)
  return true
}

function loadSelectedOutline(nodeId) {
  const node = props.outlineNodes.find((item) => String(item?.id) === String(nodeId))
  if (!node) return false
  if (!persist()) return false
  selectedKind.value = 'outline'
  clearSelectedIds()
  selectedOutlineNodeId.value = String(node.id)
  activeSwitch.value = 'outline'
  title.value = String(node.title || '')
  dirty.value = false
  saveState.value = 'saved'
  emit('source-change', { kind: 'outline', id: selectedOutlineNodeId.value })
  emit('document-change', null)
  nextTick(refreshCommands)
  return true
}

function loadSelectedWorldbookEntry(entryId) {
  const entry = worldbookEntries.value.find((item) => String(item?.id) === String(entryId))
  if (!entry) return false
  if (!persist()) return false
  selectedKind.value = 'worldbook-entry'
  clearSelectedIds()
  selectedWorldbookEntryId.value = String(entry.id)
  activeSwitch.value = entry.type === 'character' ? 'character' : 'setting'
  title.value = String(entry.name || '')
  dirty.value = false
  saveState.value = 'saved'
  emit('source-change', { kind: 'worldbook-entry', id: selectedWorldbookEntryId.value })
  emit('document-change', null)
  nextTick(refreshCommands)
  return true
}

function persist() {
  if (!dirty.value || !selectedSource.value) return true
  if (composing.value) return false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveState.value = 'saving'
  const draft = { ...selectedSource.value }
  const nextDocument = persistChapterDocument(draft, markdown.value)
  const payload = {
    title: title.value,
    markdown: draft.content,
    document: nextDocument,
    wordCount: String(draft.content || '').replace(/\s+/g, '').length,
    automaticHistory: !interventionAdoptionPending.value
  }
  const ok = (selectedKind.value === 'exploration'
    ? props.saveExploration({ ...payload, documentId: selectedExplorationId.value })
    : props.saveChapter({ ...payload, chapterId: selectedChapterId.value })) !== false
  dirty.value = !ok
  saveState.value = ok ? 'saved' : 'error'
  if (ok) interventionAdoptionPending.value = false
  return ok
}

function scheduleSave() {
  dirty.value = true
  interventionAdoptionPending.value = true
  saveState.value = 'unsaved'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persist()
  }, 650)
}

function selectChapter(chapterId) {
  if (selectedKind.value === 'chapter' && String(chapterId) === selectedChapterId.value) return
  if (!persist()) return
  if (loadSelectedChapter(chapterId)) closeSwitchOnNarrow()
}

function selectExploration(documentId) {
  if (selectedKind.value === 'exploration' && String(documentId) === selectedExplorationId.value) return
  if (!persist()) return
  if (loadSelectedExploration(documentId)) closeSwitchOnNarrow()
}

function selectOutline(nodeId) {
  if (selectedKind.value === 'outline' && String(nodeId) === selectedOutlineNodeId.value) return
  if (loadSelectedOutline(nodeId)) closeSwitchOnNarrow()
}

function selectWorldbookEntry(entryId) {
  if (selectedKind.value === 'worldbook-entry' && String(entryId) === selectedWorldbookEntryId.value) return
  if (loadSelectedWorldbookEntry(entryId)) closeSwitchOnNarrow()
}

function closeSwitchOnNarrow() {
  if (typeof window !== 'undefined' && window.innerWidth <= 720) directoryOpen.value = false
}

function onMarkdownUpdate(value) {
  markdown.value = String(value || '')
  scheduleSave()
}

function onDocumentUpdate(value) {
  documentState.value = value
  emit('document-change', value)
  nextTick(refreshCommands)
}

function onCompositionChange(value) {
  composing.value = Boolean(value)
  emit('composition-change', composing.value)
  if (!composing.value && dirty.value) scheduleSave()
}

function onSelectionChange(value) {
  emit('selection-change', value)
  refreshCommands()
}

function requestDestructiveProtection(payload = {}) {
  if (typeof props.protectDestructiveEdit !== 'function' || !selectedSource.value) return true
  return props.protectDestructiveEdit({
    ...payload,
    pane: 'dual',
    projectId: String(props.bookId || ''),
    documentRole: selectedKind.value === 'exploration' ? 'exploration' : 'manuscript',
    documentId: String(selectedSourceId.value || ''),
    chapterId: selectedKind.value === 'chapter' ? String(selectedChapterId.value || '') : '',
    title: String(title.value || selectedTitle.value || ''),
    annotations: []
  }) !== false
}

function refreshCommands() {
  commandAvailability.value = {
    undo: false,
    redo: false,
    bold: false,
    italic: false,
    strike: false,
    code: false,
    ...(isDocumentSource.value ? (editorRef.value?.getCommandAvailability?.() || {}) : {})
  }
  emit('command-availability', {
    ...commandAvailability.value,
    editable: isDocumentSource.value && Boolean(selectedSource.value),
    kind: selectedKind.value,
    id: selectedSourceId.value
  })
  return commandAvailability.value
}

function runHistory(direction) {
  const changed = direction === 'redo' ? editorRef.value?.redo?.() : editorRef.value?.undo?.()
  if (changed) scheduleSave()
  nextTick(refreshCommands)
  return Boolean(changed)
}

function runCommand(command, payload) {
  if (!isDocumentSource.value || !selectedSource.value || !editorRef.value) return false
  if (composing.value && !['focus'].includes(command)) return false
  if (command === 'undo' || command === 'redo') return runHistory(command)
  const method = {
    toggleMark: 'toggleMark',
    clearMarks: 'clearMarks',
    insertText: 'insertText',
    insertDivider: 'insertDivider',
    focus: 'focus'
  }[command]
  if (!method || typeof editorRef.value?.[method] !== 'function') return false
  const changed = editorRef.value[method](payload)
  nextTick(refreshCommands)
  return changed !== false
}

function getActiveSource() {
  return { kind: selectedKind.value, id: selectedSourceId.value, editable: isDocumentSource.value && Boolean(selectedSource.value) }
}

function cloneRunValue(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function runDocumentRevision() {
  if (!documentState.value || !isDocumentSource.value || !selectedSourceId.value) return ''
  const role = selectedKind.value === 'exploration' ? 'exploration' : 'chapter'
  const body = {
    historyRestoreEpoch: String(documentState.value?.meta?.historyRestoreEpoch || ''),
    markdown: getWritingDocumentMarkdown(documentState.value),
    units: (documentState.value.content || []).map((unit) => ({
      id: String(unit?.attrs?.unitId || ''),
      kind: String(unit?.attrs?.kind || ''),
      sceneId: String(unit?.attrs?.sceneId || ''),
      nodes: (unit?.content || []).map((node) => ({
        id: String(node?.attrs?.nodeId || ''),
        type: String(node?.type || ''),
        kind: String(node?.attrs?.kind || '')
      }))
    }))
  }
  return buildDocumentRevision(`${role}:${selectedSourceId.value}`, JSON.stringify({ title: title.value, body }))
}

function captureSurfaceState() {
  if (!isDocumentSource.value || !selectedSource.value || !documentState.value || !editorRef.value) return null
  const scrollElement = scrollRef.value
  return Object.freeze({
    pane: 'dual',
    projectId: String(props.bookId || ''),
    sourceKind: String(selectedKind.value || ''),
    sourceId: String(selectedSourceId.value || ''),
    scopeKey: `${props.bookId || ''}|dual|${selectedKind.value || ''}|${selectedSourceId.value || ''}`,
    documentRevision: runDocumentRevision(),
    documentSchemaRevision: String(documentState.value?.revision ?? ''),
    directoryOpen: directoryOpen.value,
    selectionBookmark: editorRef.value.captureSelectionBookmark?.() || null,
    scroll: {
      top: Number(scrollElement?.scrollTop || 0),
      left: Number(scrollElement?.scrollLeft || 0)
    },
    editorFocused: editorRef.value.hasEditorFocus?.() === true
  })
}

function surfaceStateMatches(snapshot = {}) {
  return Boolean(
    snapshot?.pane === 'dual'
    && String(snapshot.projectId || '') === String(props.bookId || '')
    && String(snapshot.sourceKind || '') === String(selectedKind.value || '')
    && String(snapshot.sourceId || '') === String(selectedSourceId.value || '')
    && String(snapshot.documentRevision || '') === String(runDocumentRevision())
    && String(snapshot.documentSchemaRevision ?? '') === String(documentState.value?.revision ?? '')
  )
}

// rail/检查器临时接管焦点后，只有同一项目、同一副窗来源和完全相同的
// canonical 文档 revision 才允许复活旧 bookmark。正文已改时 fail-closed，
// 避免把旧位置解析到新文档的另一段文字上。
async function restoreSurfaceState(snapshot = {}) {
  await nextTick()
  if (!editorRef.value || !surfaceStateMatches(snapshot)) return false
  // 先恢复阅读宽度，再恢复选区与滚动，避免临时工具返回时重新挤窄副稿。
  if (typeof snapshot.directoryOpen === 'boolean') {
    directoryOpen.value = snapshot.directoryOpen
    await nextTick()
    if (!editorRef.value || !surfaceStateMatches(snapshot)) return false
  }
  const restored = snapshot.selectionBookmark
    ? editorRef.value.restoreSelectionBookmark?.(snapshot.selectionBookmark, { scrollIntoView: false }) === true
    : true
  if (!restored) return false
  const restoreScroll = () => {
    if (!surfaceStateMatches(snapshot)) return
    const scrollElement = scrollRef.value
    if (scrollElement) {
      scrollElement.scrollTop = Number(snapshot.scroll?.top || 0)
      scrollElement.scrollLeft = Number(snapshot.scroll?.left || 0)
    }
    if (!snapshot.selectionBookmark) editorRef.value?.focus?.({ scrollIntoView: false })
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreScroll)
  else restoreScroll()
  return true
}

// 副栏是独立、可编辑的写作面；运行目标必须从副栏自己的 canonical document
// 与选区冻结。大纲/世界书等只读资料 fail-closed，不借用主栏落笔处。
function captureRunTarget() {
  if (!isDocumentSource.value || !selectedSource.value || !documentState.value || composing.value) return null
  const selection = editorRef.value?.getSelectionSnapshot?.()
  // “推演下一段”以选区 head/末端为落笔处；跨节点选择不能把末节点
  // localOffset 错配给首节点。
  const unitId = String(selection?.endUnitId || selection?.unitId || '')
  const nodeId = String(selection?.endNodeId || selection?.nodeId || '')
  const unit = (documentState.value.content || []).find((item) => String(item?.attrs?.unitId || '') === unitId)
  const node = (unit?.content || []).find((item) => String(item?.attrs?.nodeId || '') === nodeId)
  if (!unit || !node) return null
  const documentRole = selectedKind.value === 'exploration' ? 'exploration' : 'manuscript'
  const caret = Number(selection?.markdownTo)
  const cursorLocalOffset = Number(selection?.selectionLocalEnd ?? selection?.cursorLocalOffset)
  if (!Number.isInteger(caret) || caret < 0 || !Number.isInteger(cursorLocalOffset) || cursorLocalOffset < 0) return null
  return Object.freeze({
    projectId: String(props.bookId || ''),
    documentId: String(selectedSourceId.value),
    documentRole,
    role: documentRole,
    chapterId: documentRole === 'manuscript' ? String(selectedChapterId.value) : '',
    unitId,
    unitRevision: String(unit?.attrs?.unitRevision ?? ''),
    nodeId,
    nodeRevision: String(node?.attrs?.nodeRevision ?? ''),
    cursorLocalOffset,
    caret,
    markdownFrom: caret,
    markdownTo: caret,
    documentRevision: runDocumentRevision(),
    documentSchemaRevision: String(documentState.value.revision ?? '')
  })
}

// 资料助手在 rail pointerdown 时调用；此刻副窗随后会卸载，因此必须把
// 当前内存稿与稳定 target 一并冻结。它仍是只读快照，不触发 persist。
function captureKnowledgeSource() {
  const target = captureRunTarget()
  if (!target || !documentState.value) return null
  const sceneProjection = props.resolveSceneProjection?.({
    kind: selectedKind.value,
    sourceId: selectedSourceId.value,
    document: cloneRunValue(documentState.value),
    activeUnitId: target.unitId,
    documentRevision: target.documentRevision
  }) || null
  return Object.freeze({
    ...target,
    title: String(title.value || selectedTitle.value || ''),
    document: cloneRunValue(documentState.value),
    sceneProjection: cloneRunValue(sceneProjection)
  })
}

// 校对与统一查找不依赖光标。它们冻结副窗当前内存文稿，随后用稳定
// document/unit/node locator 导航或应用单个 ProseMirror transaction。
// 这与 captureRunTarget 分开，避免“光标暂时不可用”把整章误判为不可搜。
function captureSearchSource() {
  if (!isDocumentSource.value || !selectedSource.value || !documentState.value || composing.value) return null
  const documentRole = selectedKind.value === 'exploration' ? 'exploration' : 'manuscript'
  return Object.freeze({
    pane: 'dual',
    projectId: String(props.bookId || ''),
    sourceKind: String(selectedKind.value || ''),
    role: documentRole,
    documentRole,
    documentId: String(selectedSourceId.value || ''),
    chapterId: documentRole === 'manuscript' ? String(selectedChapterId.value || '') : '',
    title: String(title.value || selectedTitle.value || ''),
    document: cloneRunValue(documentState.value),
    markdown: String(markdown.value || ''),
    documentRevision: runDocumentRevision(),
    documentSchemaRevision: String(documentState.value?.revision ?? '')
  })
}

function captureReviewSource() {
  const source = captureSearchSource()
  if (!source) return null
  const selection = editorRef.value?.getSelectionSnapshot?.()
  const activeUnitId = String(selection?.unitId || documentState.value?.content?.[0]?.attrs?.unitId || '')
  const sceneProjection = props.resolveSceneProjection?.({
    kind: selectedKind.value,
    sourceId: selectedSourceId.value,
    document: cloneRunValue(documentState.value),
    activeUnitId,
    documentRevision: source.documentRevision
  }) || null
  return Object.freeze({
    ...source,
    unitId: activeUnitId,
    selectionRanges: buildWritingSelectionRanges(documentState.value, selection),
    sceneProjection: cloneRunValue(sceneProjection),
    worldbookEntries: cloneRunValue(worldbookEntries.value)
  })
}

async function navigateSearchLocator(locator = {}) {
  const sourceKind = String(locator.sourceKind || locator.role || '')
  const sourceId = String(locator.sourceId || locator.documentId || locator.chapterId || '')
  const targetKind = sourceKind === 'exploration' ? 'exploration' : 'chapter'
  if (!sourceId || !['chapter', 'exploration', 'manuscript'].includes(sourceKind)) return false
  if (targetKind === 'chapter' && (selectedKind.value !== 'chapter' || selectedChapterId.value !== sourceId)) {
    if (!persist() || !loadSelectedChapter(sourceId)) return false
  } else if (targetKind === 'exploration' && (selectedKind.value !== 'exploration' || selectedExplorationId.value !== sourceId)) {
    if (!persist() || !loadSelectedExploration(sourceId)) return false
  }
  await nextTick()
  const nodeId = String(locator.nodeId || '')
  if (!nodeId) return false
  const selected = editorRef.value?.selectNodeRange?.(
    nodeId,
    Number(locator.startOffset ?? locator.start ?? 0),
    String(locator.endNodeId || nodeId),
    Number(locator.endOffset ?? locator.end ?? locator.startOffset ?? locator.start ?? 0)
  )
  if (selected) editorRef.value?.focus?.({ scrollIntoView: true })
  return Boolean(selected)
}

function replaceReviewRanges(patches = []) {
  if (!isDocumentSource.value || !selectedSource.value || composing.value) return false
  const changed = editorRef.value?.replaceNodeRanges?.(patches, { origin: 'writing-agent' }) === true
  if (changed) scheduleSave()
  return changed
}

// F3 采用必须把“编辑器单事务”和“repository persist”拆开。失败后保留
// dirty document，重试只调用 persist，不重复替换，也不重新请求 provider。
function applyInterventionAdoption(patch) {
  if (!isDocumentSource.value || !selectedSource.value || composing.value) return false
  const changed = editorRef.value?.replaceNodeRanges?.([patch], { origin: 'writing-agent' }) === true
  if (!changed) return false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  dirty.value = true
  saveState.value = 'unsaved'
  return true
}

function persistInterventionAdoption() {
  return persist()
}

function readLiveInterventionTarget(expected = {}) {
  if (!isDocumentSource.value || !documentState.value || composing.value) return null
  const documentRole = selectedKind.value === 'exploration' ? 'exploration' : 'manuscript'
  const documentId = String(selectedSourceId.value || '')
  if (String(expected.documentId || '') !== documentId) return null
  const unit = (documentState.value.content || []).find((item) => String(item?.attrs?.unitId || '') === String(expected.unitId || ''))
  const node = (unit?.content || []).find((item) => String(item?.attrs?.nodeId || '') === String(expected.nodeId || ''))
  if (!unit || !node) return null
  return {
    projectId: String(props.bookId || ''),
    documentId,
    documentRole,
    chapterId: documentRole === 'manuscript' ? String(selectedChapterId.value || '') : '',
    unitId: String(unit.attrs.unitId || ''),
    nodeId: String(node.attrs.nodeId || ''),
    documentRevision: runDocumentRevision(),
    unitRevision: String(unit.attrs.unitRevision ?? ''),
    nodeRevision: String(node.attrs.nodeRevision ?? ''),
    nodeText: readNodePlainText(node),
    document: cloneRunValue(documentState.value),
    markdown: String(markdown.value || ''),
    title: String(title.value || selectedTitle.value || '')
  }
}

function readNodePlainText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'hardBreak') return '\n'
  if (typeof node.text === 'string') return node.text
  return (node.content || []).map(readNodePlainText).join('')
}

function reloadSearchSource(source = {}) {
  const sourceKind = String(source.sourceKind || source.role || '')
  const sourceId = String(source.sourceId || source.documentId || source.chapterId || '')
  const liveKind = selectedKind.value === 'exploration' ? 'exploration' : 'chapter'
  if (!source.document || sourceId !== selectedSourceId.value || (sourceKind !== liveKind && !(sourceKind === 'manuscript' && liveKind === 'chapter'))) return false
  documentState.value = cloneRunValue(source.document)
  markdown.value = String(source.markdown ?? getWritingDocumentMarkdown(source.document))
  if (source.title != null) title.value = String(source.title)
  dirty.value = false
  saveState.value = 'saved'
  editorEpoch.value += 1
  emit('document-change', documentState.value)
  nextTick(refreshCommands)
  return true
}

// 画师必须保留真实选区文本与起止 node，而不是把选区折叠成推演用的
// caret。只读副窗（大纲/设定）没有落笔目标，按合同 fail closed。
function captureVisualSource() {
  const target = captureRunTarget()
  const selection = editorRef.value?.getSelectionSnapshot?.()
  if (!target || !selection || !documentState.value) return null
  const unit = (documentState.value.content || []).find((item) => (
    String(item?.attrs?.unitId || '') === String(selection?.unitId || target.unitId || '')
  ))
  if (!unit) return null
  const sceneProjection = props.resolveSceneProjection?.({
    kind: selectedKind.value,
    sourceId: selectedSourceId.value,
    document: cloneRunValue(documentState.value),
    activeUnitId: String(unit.attrs?.unitId || ''),
    documentRevision: target.documentRevision
  }) || null
  return Object.freeze({
    ...target,
    pane: 'dual',
    title: String(title.value || selectedTitle.value || ''),
    selection: cloneRunValue(selection),
    writingUnit: cloneRunValue(unit),
    writingUnitText: (unit.content || []).map((node) => (
      node?.type === 'mediaReference'
        ? String(node?.attrs?.alt || '')
        : (node?.content || []).map((inline) => String(inline?.text || '')).join('')
    )).filter(Boolean).join('\n'),
    document: cloneRunValue(documentState.value),
    sceneProjection: cloneRunValue(sceneProjection)
  })
}

function insertMediaReference(payload = {}) {
  if (!isDocumentSource.value || !selectedSource.value || composing.value) return { ok: false, reason: 'source-unavailable' }
  if (String(payload.projectId || '') !== String(props.bookId || '')
    || String(payload.documentId || '') !== String(selectedSourceId.value || '')) {
    return { ok: false, reason: 'target-detached' }
  }
  const result = editorRef.value?.insertMediaReference?.(payload) || { ok: false, reason: 'editor-unavailable' }
  nextTick(refreshCommands)
  return result
}

function readLiveRunTarget(expected = {}) {
  const target = captureRunTarget()
  if (!target) return null
  for (const key of ['projectId', 'role', 'documentId', 'chapterId', 'unitId', 'nodeId']) {
    const expectedValue = key === 'role' ? (expected.role || expected.documentRole) : expected[key]
    if (String(expectedValue || '') !== String(target[key] || '')) return null
  }
  const sceneProjection = props.resolveSceneProjection?.({
    kind: selectedKind.value,
    sourceId: selectedSourceId.value,
    document: cloneRunValue(documentState.value),
    activeUnitId: target.unitId,
    documentRevision: target.documentRevision
  })
  if (!sceneProjection) return null
  return {
    ...target,
    document: cloneRunValue(documentState.value),
    sceneProjection: cloneRunValue(sceneProjection)
  }
}

async function focusWritingUnit(unitId) {
  if (!isDocumentSource.value || !unitId) return false
  await nextTick()
  return Boolean(editorRef.value?.focusWritingUnit?.(unitId))
}

function onEditorReady() {
  refreshCommands()
}

function closePane() {
  if (!prepareClose()) return
  emit('close')
}

function prepareClose() {
  return !composing.value && persist()
}

function swapPane() {
  if (selectedKind.value !== 'chapter' || !selectedChapter.value || selectedChapterId.value === String(props.mainChapterId)) return
  if (!prepareClose()) return
  emit('swap', { chapterId: selectedChapterId.value })
}

watch(() => [props.bookId, props.mainChapterId, props.chapters.map((chapter) => chapter?.id).join('|'), props.explorations.map((doc) => doc?.id).join('|'), props.outlineNodes.map((node) => node?.id).join('|'), worldbookEntries.value.map((entry) => entry?.id).join('|')], () => {
  if (selectedSourceId.value) {
    nextTick(refreshCommands)
    return
  }
  const fallback = defaultSource()
  if (fallback.kind === 'exploration') loadSelectedExploration(fallback.id)
  else if (fallback.kind === 'outline') loadSelectedOutline(fallback.id)
  else if (fallback.kind === 'worldbook-entry') loadSelectedWorldbookEntry(fallback.id)
  else loadSelectedChapter(fallback.id)
}, { immediate: true })

watch(() => props.initialChapterId, (chapterId) => {
  if (!chapterId || String(chapterId) === selectedChapterId.value) return
  selectChapter(chapterId)
})

watch(() => props.initialExplorationId, (documentId) => {
  if (!documentId || (selectedKind.value === 'exploration' && String(documentId) === selectedExplorationId.value)) return
  if (!persist()) return
  loadSelectedExploration(documentId)
})

watch(() => props.initialOutlineNodeId, (nodeId) => {
  if (!nodeId || (selectedKind.value === 'outline' && String(nodeId) === selectedOutlineNodeId.value)) return
  loadSelectedOutline(nodeId)
})

watch(() => props.initialWorldbookEntryId, (entryId) => {
  if (!entryId || (selectedKind.value === 'worldbook-entry' && String(entryId) === selectedWorldbookEntryId.value)) return
  loadSelectedWorldbookEntry(entryId)
})

watch(() => [props.mainDocument, props.mainMarkdown], ([nextDocument, nextMarkdown]) => {
  if (!isDocumentSource.value) return
  const sameMainSource = selectedKind.value === 'exploration'
    ? String(selectedExplorationId.value) === String(props.mainExplorationId)
    : String(selectedChapterId.value) === String(props.mainChapterId)
  if (!sameMainSource || !nextDocument || dirty.value) return
  documentState.value = JSON.parse(JSON.stringify(nextDocument))
  markdown.value = String(nextMarkdown || '')
  emit('document-change', documentState.value)
}, { deep: false })

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  persist()
})

defineExpose({
  prepareClose,
  runCommand,
  getActiveSource,
  getCommandAvailability: refreshCommands,
  captureSurfaceState,
  restoreSurfaceState,
  captureRunTarget,
  captureKnowledgeSource,
  captureSearchSource,
  captureReviewSource,
  navigateSearchLocator,
  replaceReviewRanges,
  applyInterventionAdoption,
  persistInterventionAdoption,
  readLiveInterventionTarget,
  reloadSearchSource,
  captureVisualSource,
  insertMediaReference,
  readLiveRunTarget,
  focusWritingUnit,
  isComposing: () => composing.value
})
</script>

<style scoped>
.authoring-dual-pane { display: grid; min-width: 0; min-height: 0; grid-column: 3; grid-row: 1; grid-template-columns: minmax(0, 1.62fr) minmax(160px, 1fr); border-inline-start: 1px solid var(--authoring-hairline, var(--border-subtle)); background: var(--surface-workbench-raised); }
.authoring-dual-pane.has-intervention-ghost,
.authoring-dual-pane.is-directory-closed { grid-template-columns: minmax(0, 1fr); }
.authoring-dual-pane__editor { position:relative; display: flex; min-width: 0; min-height: 0; flex-direction: column; }
.authoring-dual-pane__head { display: flex; min-height: 54px; flex: 0 0 auto; flex-direction: column; align-items: stretch; gap: 2px; padding: 10px 16px 4px; border-bottom: 1px solid var(--border-subtle); background: var(--surface-workbench-raised); }
.authoring-dual-pane__notice { position: relative; z-index: 2; flex: 0 0 auto; padding: 0 16px; border-bottom: 1px solid var(--border-subtle); background: var(--surface-workbench-raised); }
.authoring-dual-pane__notice :deep(.authoring-transient-notice) { margin: 0; }
.authoring-dual-pane__title { display: block; min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
.authoring-dual-pane__title small { margin-inline-end: 7px; color: var(--text-secondary); font-size: var(--authoring-catalog-label-size, 12px); }
.authoring-dual-pane__title strong { color: var(--text-primary); font-size: var(--authoring-catalog-title-size, 17px); font-weight: 550; }
.authoring-dual-pane__save { margin-inline-end: auto; color: var(--text-secondary); font-size: var(--authoring-catalog-meta-size, 10px); }
.authoring-dual-pane__save.is-error { color: var(--signal-danger, #a04b3c); }
.authoring-dual-pane__actions { display: flex; flex: 0 0 auto; justify-content: flex-end; align-items: center; gap: 2px; }
.authoring-dual-pane__actions button { min-width: 30px; height: 32px; padding: 0 6px; border: 0; border-radius: 3px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-dual-pane__actions button:hover:not(:disabled), .authoring-dual-pane__actions button[aria-pressed="true"] { background: var(--surface-hover); color: var(--text-primary); }
.authoring-dual-pane__actions button:disabled { opacity: .35; cursor: default; }
.authoring-dual-pane__scroll { min-width: 0; min-height: 0; flex: 1 1 auto; overflow: auto; }
.authoring-dual-pane__scroll :deep(.writing-notebook-editor) { min-height: 100%; }
.authoring-dual-pane__scroll :deep(.writing-notebook-editor__surface) { padding: 12px 0 80px; }
.authoring-dual-pane__scroll :deep(.writing-notebook-editor__surface .ProseMirror) { width: auto; max-width: none; padding-inline: 16px; font-size: var(--authoring-catalog-body-size, 14px); line-height: 2; }
.authoring-dual-pane__reference-scroll { min-width:0; min-height:0; flex:1 1 auto; overflow:auto; }
.authoring-dual-pane__reference { max-width:680px; margin:0 auto; padding:20px 16px 48px; }
.authoring-dual-pane__reference>header { padding-bottom:18px; border-bottom:1px solid var(--border-subtle); }
.authoring-dual-pane__reference>header span { color:var(--accent-primary); font-size:11px; }
.authoring-dual-pane__reference h3 { margin:5px 0 0; color:var(--text-primary); font-size:21px; font-weight:560; }
.authoring-dual-pane__reference-copy { margin:0; padding:24px 0; color:var(--text-primary); font-size:15px; line-height:1.9; white-space:pre-wrap; }
.authoring-dual-pane__reference section { display:grid; grid-template-columns:72px minmax(0,1fr); gap:14px; padding:15px 0; border-top:1px solid color-mix(in srgb,var(--border-subtle) 70%,transparent); }
.authoring-dual-pane__reference section strong { color:var(--text-secondary); font-size:11px; }
.authoring-dual-pane__reference section p,.authoring-dual-pane__reference section ul { margin:0; padding:0; color:var(--text-primary); font-size:12px; line-height:1.65; list-style:none; }
.authoring-dual-pane__reference footer { padding-top:20px; border-top:1px solid var(--border-subtle); }
.authoring-dual-pane__reference footer button { padding:0; border:0; background:transparent; color:var(--accent-primary); font-size:12px; cursor:pointer; }
.authoring-dual-pane__reference-scroll :deep(.authoring-setting-detail) { max-width:680px; margin:0 auto; padding:20px 16px 48px; }
.authoring-dual-pane__reference-scroll :deep(.authoring-setting-detail__actions) { display:none; }
.authoring-dual-pane__empty { display: grid; flex: 1; place-content: center; padding: 24px; color: var(--text-secondary); text-align: center; }
.authoring-dual-pane__empty strong { color: var(--text-primary); font-size: 15px; }
.authoring-dual-pane__empty p { margin: 7px 0 0; font-size: 12px; }
.authoring-dual-pane__directory { min-width: 0; min-height: 0; overflow-y: auto; padding: 12px 10px; border-inline-start: 1px solid var(--border-subtle); background: var(--authoring-chrome-surface, var(--surface-primary)); }
.authoring-dual-pane__search { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; height: 36px; margin-bottom: 12px; padding: 0 5px 0 9px; border: 1px solid var(--border-subtle); border-radius: 3px; color: var(--text-secondary); }
.authoring-dual-pane__search input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: var(--authoring-catalog-control-size, 14px)/1.4 var(--font-sans, sans-serif); }
.authoring-dual-pane__search select { width: 62px; height: 28px; border: 0; outline: 0; background: transparent; color: var(--text-secondary); font: 11px/1 var(--font-sans, sans-serif); }
.authoring-dual-pane__group { display: grid; min-height: 34px; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 6px; margin-top: 6px; padding: 0 4px; color: var(--text-primary); font-size: var(--authoring-catalog-folder-size, 13px); font-weight: 500; }
.authoring-dual-pane__group--ideas { height: 37px; margin-top: 10px; padding-top: 7px; border-top: 1px solid var(--border-subtle); }
.authoring-dual-pane__group small { color: var(--text-secondary); font-size: 11px; font-weight: 400; }
.authoring-dual-pane__chapter { display: block; width: 100%; min-height: 40px; padding: 0 10px 0 36px; border: 0; border-radius: 4px; background: transparent; color: var(--text-primary); font: 400 var(--authoring-catalog-entry-size, 13px)/1.4 var(--font-sans, sans-serif); text-align: left; cursor: pointer; }
.authoring-dual-pane__chapter span { display: block; min-width: 0; }
.authoring-dual-pane__chapter strong, .authoring-dual-pane__chapter em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.authoring-dual-pane__chapter strong { color: inherit; font: inherit; }
.authoring-dual-pane__chapter em { color: var(--text-secondary); font-size: 10px; font-style: normal; font-weight: 400; }
.authoring-dual-pane__chapter small { font-size: 10px; }
.authoring-dual-pane__chapter:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
.authoring-dual-pane__chapter.is-active { background: color-mix(in srgb, var(--accent-primary) 14%, transparent); color: var(--text-primary); font-weight: 600; }
.authoring-dual-pane__chapter.is-main:not(.is-active) { box-shadow: inset 2px 0 color-mix(in srgb, var(--text-secondary) 35%, transparent); }
.authoring-dual-pane__no-result { padding: 16px 8px; color: var(--text-secondary); font-size: 12px; }
@media (max-width: 1180px) {
  .authoring-dual-pane { position: absolute; z-index: var(--z-workbench-sheet); grid-column: 1 / -1; grid-row: 1; inset-block: 0; inset-inline-end: 52px; width: min(440px, calc(100% - 264px)); margin-inline-start: auto; box-shadow: -12px 0 32px color-mix(in srgb, #000 14%, transparent); }
}
@media (max-width: 720px) {
  .authoring-dual-pane { position: absolute; grid-column: 1 / -1; grid-row: 1; inset-block-start: auto; inset-inline: 0; inset-block-end: 44px; width: auto; height: min(78vh, 680px); grid-template-columns: minmax(0, 1fr); border-top: 1px solid var(--border-subtle); box-shadow: 0 -12px 32px color-mix(in srgb, #000 16%, transparent); }
  .authoring-dual-pane__directory { position: absolute; z-index: 2; inset: var(--dual-header-height, 88px) 0 0; border-inline-start: 0; background: var(--authoring-chrome-surface, var(--surface-primary)); }
  .authoring-dual-pane__head { min-height: 54px; padding-inline: 12px 8px; }
  .authoring-dual-pane__actions button { min-width: 44px; min-height: 44px; }
}
</style>
