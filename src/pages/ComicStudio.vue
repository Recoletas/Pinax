<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PanelRightClose, PanelRightOpen, Plus } from 'lucide-vue-next'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicAdaptationPlanner from '../components/media/ComicAdaptationPlanner.vue'
import ComicCompositionCanvas from '../components/media/ComicCompositionCanvas.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import { useComicWorkspaceSelection } from '../composables/comics/useComicWorkspaceSelection'
import { useComicPageThumbnails } from '../composables/comics/useComicPageThumbnails'
import { useWorldStore } from '../stores/worldStore'
import { listActiveNarrativeAssets, normalizeImagePresentation } from '../services/media/narrativeAssets'
import {
  buildComicPagesFromAdaptation,
  buildComicReferenceCatalog,
  generateComicAdaptationCandidates
} from '../services/media/comicAdaptationService'
import { addNarrativeImageAsset } from '../services/media/narrativeImageAssetBridge'
import {
  confirmComicSequenceVisualBible,
  createComicPage,
  saveComicPage,
  saveComicPages,
  updateComicPageComposition,
  updateComicSequenceVisualBible
} from '../services/media/comicPageStore'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const pagePreview = ref(null)
const sourceCandidates = ref([])
const modelConfigs = ref([])
const selectedModelId = ref('')
const selectedSourceId = ref('')
const archiveStatus = ref('')
const comicEditor = ref(null)
const mobilePane = ref('page')
const studioMode = ref('plan')
const planningTarget = ref('new')
const adaptationSourceIds = ref([])
const adaptationCandidates = ref([])
const selectedCandidateId = ref('')
const adaptationGenerating = ref(false)
const adaptationError = ref('')
const pageMobilePanes = [
  { value: 'sources', label: '目录' },
  { value: 'page', label: '页面' },
  { value: 'panel', label: '当前格' }
]
const planMobilePanes = [
  { value: 'sources', label: '素材' },
  { value: 'page', label: '页面计划' }
]

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
const selection = useComicWorkspaceSelection({ route, worldStore })
const thumbnails = useComicPageThumbnails()

const {
  books,
  mode: scopeMode,
  activeBook,
  scopeNotice,
  catalog,
  sequences,
  standalonePages,
  legacyWorldbookPages,
  unownedPages,
  sequenceFilter,
  activePageId,
  activePanelId,
  inspectorCollapsed,
  touchCatalog,
  registerFlush,
  flushPendingEdits,
  selectPage,
  selectPanel,
  startNewPage,
  adoptLegacyPage,
  unknownRequestSummaries
} = selection

const selectedSource = computed(() => sourceCandidates.value.find((asset) => asset.id === selectedSourceId.value) || null)
const selectedAdaptationSources = computed(() => sourceCandidates.value
  .filter((asset) => adaptationSourceIds.value.includes(asset.id)))
const scopeKeySet = computed(() => (
  activeBook.value
    ? new Set([activeBook.value.id, activeBook.value.worldbookId].filter(Boolean))
    : new Set()
))
const scopedSources = computed(() => {
  if (scopeMode.value !== 'project') return sourceCandidates.value
  return sourceCandidates.value.filter((asset) => scopeKeySet.value.has(asset.projectId))
})
const selectedSourceRefs = computed(() => selectedSource.value ? [{
  refType: 'narrative-asset',
  refId: selectedSource.value.id,
  projectId: selectedSource.value.projectId ?? null,
  excerpt: String(selectedSource.value.content || '').slice(0, 240)
}] : [])
// 书内漫画的归属真源是 book.id；不再回落 activeWorldbook（G-B03）。
const activeProjectId = computed(() => activeBook.value?.id || null)
const canCreatePage = computed(() => scopeMode.value === 'project' && Boolean(activeBook.value))
const comicMobilePanes = computed(() => studioMode.value === 'plan' ? planMobilePanes : pageMobilePanes)
const referenceCatalog = computed(() => buildComicReferenceCatalog({
  worldbook: worldStore.activeWorldbook,
  assets: sourceCandidates.value
}))
const selectedCandidate = computed(() => adaptationCandidates.value
  .find((candidate) => candidate.id === selectedCandidateId.value) || null)
const activeSequencePages = computed(() => {
  if (!selection.activePage.value?.sequenceId) return []
  return selection.bookPages.value
    .filter((page) => page.sequenceId === selection.activePage.value.sequenceId)
    .sort((left, right) => left.pageNumber - right.pageNumber)
})
const persistedPlan = computed(() => {
  const pages = activeSequencePages.value
  if (!pages.length) return null
  const firstPage = pages[0]
  return {
    id: firstPage.sequenceId,
    title: firstPage.sequenceTitle || firstPage.title,
    rationale: '',
    format: firstPage.format,
    colorMode: firstPage.colorMode,
    pages: pages.map((page) => ({
      title: page.title,
      narrativeBeat: page.pagePurpose,
      pageTurnHook: page.pageTurnHook,
      continuityNotes: page.continuityNotes,
      panels: page.panels
    })),
    visualBible: {
      references: firstPage.visualBible.references.map((reference) => ({
        referenceId: reference.id,
        invariantNotes: reference.invariantNotes,
        locked: reference.locked,
        label: reference.label,
        kind: reference.kind,
        sourceRef: reference.sourceRef,
        assetIds: reference.assetIds
      })),
      palette: firstPage.visualBible.palette,
      lineStyle: firstPage.visualBible.lineStyle,
      renderingNotes: firstPage.visualBible.renderingNotes
    }
  }
})
const planningPersisted = computed(() => planningTarget.value === 'sequence' && Boolean(persistedPlan.value))
const planningPlan = computed(() => (
  planningPersisted.value ? persistedPlan.value : selectedCandidate.value
))
const planningBibleConfirmed = computed(() => (
  planningPersisted.value
  && activeSequencePages.value.every((page) => page.visualBibleStatus === 'confirmed')
))
const unknownRequests = computed(() => {
  void selection.catalog.value.length
  return unknownRequestSummaries()
})
const legacyTargets = computed(() => legacyWorldbookPages.value.length + unownedPages.value.length)

onMounted(async () => {
  selection.refreshBooks()
  sourceCandidates.value = listActiveNarrativeAssets()
  const requestedSourceId = String(route.query.assetId || '')
  selectedSourceId.value = scopedSources.value.some((asset) => asset.id === requestedSourceId)
    ? requestedSourceId
    : ''
  adaptationSourceIds.value = selectedSourceId.value ? [selectedSourceId.value] : []
  await worldStore.loadWorldbooksIndex()
  if (worldStore.worldbooksIndex.length) await worldStore.ensureActiveWorldbook()
  loadModels()
  selection.refreshBooks()
  touchCatalog()
  // 默认进入整页制作：空书可见“新建空白页”直达空态，全局模式可见未归属旧页目录。
  studioMode.value = requestedSourceId ? 'plan' : 'page'
  if (catalog.value.length && !requestedSourceId) {
    planningTarget.value = selection.activePage.value?.sequenceId ? 'sequence' : 'new'
  }
  if (activePageId.value && !selection.activePage.value) selectPage(activePageId.value, { flush: false })
  if (!activePageId.value && catalog.value.length) selectPage(catalog.value[0].page.id, { flush: false })
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

let unloading = false
function handleBeforeUnload() {
  if (unloading) return
  unloading = true
  flushPendingEdits()
}

const unregisterFlush = registerFlush(flushPendingEdits)
onBeforeUnmount(unregisterFlush)

function loadModels(configs = null) {
  modelConfigs.value = Array.isArray(configs) ? configs : listImageProviderConfigs()
  if (!modelConfigs.value.some((config) => config.id === selectedModelId.value)) {
    selectedModelId.value = modelConfigs.value[0]?.id || ''
  }
}

function onPageClick(item) {
  if (selectPage(item.page.id)) {
    archiveStatus.value = ''
    studioMode.value = 'page'
    planningTarget.value = selection.activePage.value?.sequenceId ? 'sequence' : 'new'
    mobilePane.value = 'page'
  }
}

function selectSource(sourceId) {
  if (studioMode.value === 'plan') {
    adaptationSourceIds.value = adaptationSourceIds.value.includes(sourceId)
      ? adaptationSourceIds.value.filter((id) => id !== sourceId)
      : [...adaptationSourceIds.value, sourceId].slice(0, 8)
    adaptationCandidates.value = []
    selectedCandidateId.value = ''
    adaptationError.value = ''
    return
  }
  selectedSourceId.value = sourceId
  archiveStatus.value = ''
  mobilePane.value = 'page'
}

function syncActivePanelSource(sourceId) {
  selectedSourceId.value = sourceId || ''
}

function createBlankPage() {
  if (!canCreatePage.value) return
  const page = saveComicPage(createComicPage({
    projectId: activeBook.value.id,
    title: '新漫画页',
    panels: Array.from({ length: 4 }, (_, index) => ({ order: index + 1, visual: '' }))
  }))
  touchCatalog()
  selectPage(page.id, { flush: false })
  studioMode.value = 'page'
  pagePreview.value = null
  mobilePane.value = 'panel'
  archiveStatus.value = '已建立空白漫画页，可直接编辑当前格'
}

function openStudioMode(mode) {
  studioMode.value = mode
  if (mode === 'plan') {
    planningTarget.value = selection.activePage.value?.sequenceId ? 'sequence' : 'new'
    mobilePane.value = 'page'
    return
  }
  mobilePane.value = mode === 'panel' ? 'panel' : 'page'
}

function enterBookScope(bookIdValue) {
  if (!bookIdValue) return
  flushPendingEdits()
  router.replace({ query: { ...route.query, bookId: bookIdValue } })
}

function resetAdaptation() {
  studioMode.value = 'plan'
  planningTarget.value = 'new'
  adaptationCandidates.value = []
  selectedCandidateId.value = ''
  adaptationError.value = ''
  adaptationSourceIds.value = selectedSourceId.value ? [selectedSourceId.value] : []
  mobilePane.value = 'page'
}

async function generateAdaptation() {
  adaptationGenerating.value = true
  adaptationError.value = ''
  try {
    const result = await generateComicAdaptationCandidates({
      sources: selectedAdaptationSources.value,
      referenceCatalog: referenceCatalog.value,
      candidateCount: 2
    })
    adaptationCandidates.value = result.candidates
    selectedCandidateId.value = result.candidates[0]?.id || ''
  } catch (error) {
    adaptationError.value = error?.message || '生成漫画分页方案失败'
  } finally {
    adaptationGenerating.value = false
  }
}

function selectAdaptationCandidate(candidateId) {
  selectedCandidateId.value = candidateId
}

function updatePlanningPlan(nextPlan) {
  if (!nextPlan) return
  if (!planningPersisted.value) {
    adaptationCandidates.value = adaptationCandidates.value.map((candidate) => (
      candidate.id === nextPlan.id ? nextPlan : candidate
    ))
    return
  }
  updateComicSequenceVisualBible(selection.activePage.value.sequenceId, {
    references: nextPlan.visualBible.references.map(resolveSemanticReference).filter(Boolean),
    palette: nextPlan.visualBible.palette,
    lineStyle: nextPlan.visualBible.lineStyle,
    renderingNotes: nextPlan.visualBible.renderingNotes
  })
  touchCatalog()
}

function resolveSemanticReference(reference) {
  const catalogItem = referenceCatalog.value.find((item) => item.id === reference.referenceId)
  const sourceRef = catalogItem?.sourceRef || reference.sourceRef
  if (!sourceRef) return null
  return {
    id: reference.referenceId,
    kind: catalogItem?.kind || reference.kind || 'style',
    label: catalogItem?.label || reference.label || reference.referenceId,
    sourceRef,
    assetIds: catalogItem?.assetIds || reference.assetIds || [],
    invariantNotes: reference.invariantNotes || [],
    locked: reference.locked !== false
  }
}

function applyAdaptation() {
  if (!selectedCandidate.value) return
  try {
    const pages = buildComicPagesFromAdaptation({
      candidate: selectedCandidate.value,
      sources: selectedAdaptationSources.value,
      referenceCatalog: referenceCatalog.value,
      projectId: activeProjectId.value
    })
    const saved = saveComicPages(pages)
    if (!saved.length) return
    touchCatalog()
    selectPage(saved[0].id, { flush: false })
    planningTarget.value = 'sequence'
    adaptationCandidates.value = []
    selectedCandidateId.value = ''
    studioMode.value = 'page'
    mobilePane.value = 'page'
    archiveStatus.value = `已建立 ${saved.length} 页制作序列`
  } catch (error) {
    adaptationError.value = error?.message || '建立漫画制作序列失败'
  }
}

function confirmVisualBible() {
  if (!selection.activePage.value?.sequenceId) return
  try {
    confirmComicSequenceVisualBible(selection.activePage.value.sequenceId)
    touchCatalog()
  } catch (error) {
    adaptationError.value = error?.message || '确认视觉圣经失败'
  }
}

function openReference(reference) {
  const sourceRef = reference?.sourceRef
  if (!sourceRef?.refId) return
  if (sourceRef.refType === 'worldbook-entry') {
    router.push({ name: 'settings-worldbook-advanced', query: { entryId: sourceRef.refId } })
    return
  }
  if (sourceRef.refType === 'map-site') {
    router.push({ name: 'settings-world-map', query: { placeId: sourceRef.refId } })
    return
  }
  if (sourceRef.refType === 'narrative-asset') {
    router.push({ name: 'materials', query: { assetId: sourceRef.refId } })
  }
}

function handlePageSaved(page) {
  if (!page?.id) return
  touchCatalog()
  if (!activePageId.value && selection.bookPages.value.some((item) => item.id === page.id)) {
    selectPage(page.id, { flush: false })
  }
  pagePreview.value = page
}

function handlePagePreview(page) {
  pagePreview.value = page
  if (!page?.panels?.some((panel) => panel.id === activePanelId.value)) {
    if (page?.panels?.length) selectPanel(page.panels[0].id)
  }
}

function handleCompositionUpdate(nextPage) {
  if (!nextPage?.id) return
  const runtimeTakes = new Map(nextPage.panels.map((panel) => [panel.id, panel.imageTakes || []]))
  const saved = updateComicPageComposition(nextPage.id, nextPage)
  if (!saved) return
  touchCatalog()
  pagePreview.value = {
    ...saved,
    panels: saved.panels.map((panel) => ({
      ...panel,
      imageTakes: runtimeTakes.get(panel.id) || []
    }))
  }
  if (!pagePreview.value.panels.some((panel) => panel.id === activePanelId.value)) {
    if (pagePreview.value.panels.length) selectPanel(pagePreview.value.panels[0].id)
  }
  void comicEditor.value?.reloadPage?.()
}

function updatePreviewLettering(payload) {
  comicEditor.value?.updateLetteringBox(payload.panelId, payload.objectId, payload.box)
}

function updatePreviewLetteringTail(payload) {
  comicEditor.value?.updateLetteringTail(payload.panelId, payload.objectId, payload.tailTarget)
}

function openUnknownRequest(summary) {
  if (selectPage(summary.pageId, { flush: false })) {
    selectPanel(summary.panelId)
    studioMode.value = 'page'
    mobilePane.value = 'panel'
  }
}

function adoptLegacy(pageId, targetBookId) {
  const adopted = adoptLegacyPage(pageId, targetBookId)
  if (adopted) {
    touchCatalog()
    archiveStatus.value = `《${adopted.title}》已归入《${books.value.find((book) => book.id === targetBookId)?.title || '所选作品'}》`
  }
}

function adoptUnownedToCurrentBook(pageId) {
  if (!canCreatePage.value) return
  adoptLegacy(pageId, activeBook.value.id)
}

async function savePanelAsMaterial(entry) {
  if (!entry?.data) return
  try {
    const asset = await addNarrativeImageAsset({
      title: String(entry.prompt || '漫画格').slice(0, 24),
      content: entry.prompt || '漫画格画面',
      kind: 'reference-image',
      status: 'accepted',
      projectId: activeProjectId.value,
      sourceRefs: entry.sourceRefs || [],
      source: { type: 'comic-panel-image', id: entry.id },
      image: {
        id: entry.id,
        mediaAssetId: entry.mediaAssetId,
        storageRef: entry.storageRef,
        purpose: 'comic-panel',
        prompt: entry.prompt,
        data: entry.data,
        negativePrompt: entry.negativePrompt,
        modelName: entry.modelName,
        modelId: entry.modelId,
        modelType: entry.modelType,
        width: entry.width,
        height: entry.height,
        presentation: normalizeImagePresentation(entry.presentation)
      }
    })
    sourceCandidates.value = listActiveNarrativeAssets()
    archiveStatus.value = `已存为素材：${asset.title}`
  } catch (error) {
    archiveStatus.value = error?.message || '存为素材失败'
  }
}

watch(sequenceFilter, () => {
  if (selection.activePage.value && !catalog.value.some((item) => item.page.id === selection.activePage.value.id)) {
    const first = catalog.value[0]
    if (first) selectPage(first.page.id, { flush: true })
  }
})

// 目录缩略图懒加载：目录渲染后登记真实元素，滚动进入视口才读取媒体数据 URL。
watch(catalog, () => {
  thumbnails.reset()
  void nextTick(() => {
    const container = typeof document !== 'undefined'
      ? document.querySelector('[data-test="comic-catalog-list"]')
      : null
    if (!container) return
    for (const element of container.querySelectorAll('[data-comic-thumb-id]')) {
      thumbnails.observeElement(element.dataset.comicThumbId, element)
    }
  })
}, { immediate: false })

watch(() => route.query.bookId, () => {
  flushPendingEdits()
  thumbnails.reset()
  selection.refreshBooks()
  touchCatalog()
  const first = catalog.value[0]
  if (!selection.activePage.value && first) selectPage(first.page.id, { flush: false })
  pagePreview.value = null
})
</script>

<template>
  <div class="comic-studio">
    <header class="comic-studio__mast">
      <div class="comic-studio__mast-left">
        <div class="comic-studio__book">
          <strong>漫画</strong>
          <span>{{ activeBook ? activeBook.title : '未选择作品' }}</span>
        </div>
        <ol class="comic-studio__workflow" aria-label="漫画制作层级">
          <li>
            <button
              type="button"
              :class="{ 'is-current': studioMode === 'plan' }"
              @click="openStudioMode('plan')"
            >
              页面计划
            </button>
          </li>
          <li>
            <button
              type="button"
              :class="{ 'is-current': studioMode === 'page' && mobilePane !== 'panel' }"
              @click="openStudioMode('page')"
            >
              整页制作
            </button>
          </li>
          <li>
            <button
              type="button"
              :class="{ 'is-current': studioMode === 'page' && mobilePane === 'panel' }"
              @click="openStudioMode('panel')"
            >
              当前格
            </button>
          </li>
        </ol>
      </div>
      <div class="comic-studio__mast-actions">
        <label v-if="canCreatePage && sequences.length" class="comic-studio__sequence-picker">
          <span>序列</span>
          <select v-model="sequenceFilter" aria-label="筛选页面序列">
            <option value="all">全部（{{ catalog.length }}）</option>
            <option v-for="sequence in sequences" :key="sequence.id" :value="sequence.id">
              {{ sequence.title }}（{{ sequence.pages.length }}）
            </option>
            <option v-if="standalonePages.length" value="standalone">单页（{{ standalonePages.length }}）</option>
          </select>
        </label>
        <button
          type="button"
          class="comic-studio__new"
          :disabled="studioMode !== 'plan' && !canCreatePage"
          :title="canCreatePage ? '' : scopeNotice"
          @click="studioMode === 'plan' ? resetAdaptation() : (catalog.length ? startNewPage() : createBlankPage())"
        >
          <Plus :size="14" aria-hidden="true" />
          {{ studioMode === 'plan' ? '新建改编' : '新建漫画页' }}
        </button>
        <button
          v-if="studioMode === 'page'"
          type="button"
          class="comic-studio__collapse"
          :aria-pressed="inspectorCollapsed"
          :title="inspectorCollapsed ? '展开当前格检查器' : '收起当前格检查器'"
          @click="inspectorCollapsed = !inspectorCollapsed"
        >
          <component :is="inspectorCollapsed ? PanelRightOpen : PanelRightClose" :size="14" aria-hidden="true" />
          {{ inspectorCollapsed ? '展开检查器' : '收起检查器' }}
        </button>
      </div>
    </header>

    <div v-if="scopeNotice" class="comic-studio__scope-notice" role="status">{{ scopeNotice }}</div>
    <div v-if="unknownRequests.length" class="comic-studio__unknown-bar" role="status">
      <span>有 {{ unknownRequests.length }} 个图片请求结果未知（可能在刷新前已发出，不会自动重发）</span>
      <button type="button" @click="openUnknownRequest(unknownRequests[0])">查看所在格</button>
    </div>

    <WorkspacePaneSwitch
      v-model="mobilePane"
      :items="comicMobilePanes"
      label="漫画工作区"
      :breakpoint="980"
    />

    <div
      class="comic-studio__workspace"
      :class="{
        'is-planning': studioMode === 'plan',
        'inspector-collapsed': studioMode === 'page' && inspectorCollapsed
      }"
      :data-mobile-pane="mobilePane"
    >
      <MaterialSourceDrawer
        v-if="studioMode === 'plan'"
        :assets="scopedSources"
        :selected-id="selectedSourceId"
        :selected-ids="adaptationSourceIds"
        multi
        @select="selectSource"
      />
      <aside
        v-else
        class="comic-studio__catalog archive-pin workspace-sidebar"
        aria-label="漫画页目录"
        data-test="comic-catalog"
      >
        <span class="archive-pin__nail" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" fill="currentColor" />
            <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.4" opacity="0.55" />
          </svg>
        </span>
        <header class="comic-studio__catalog-head">
          <strong>页目录</strong>
          <span>{{ catalog.length }} 页</span>
        </header>
        <div class="comic-studio__catalog-list" data-test="comic-catalog-list">
          <button
            v-for="item in catalog"
            :key="item.page.id"
            type="button"
            class="comic-studio__catalog-item workspace-nav-item"
            :class="{ active: item.page.id === activePageId }"
            :aria-current="item.page.id === activePageId ? 'page' : undefined"
            :data-comic-thumb-id="item.page.id"
            :data-comic-thumb-take="thumbnails.coverPanel(item.page)?.selectedTakeId || ''"
            :data-test="`comic-catalog-item-${item.label}`"
            @click="onPageClick(item)"
          >
            <span class="comic-studio__catalog-thumb" :style="{ aspectRatio: thumbnails.frameGeometry(item.page).aspect }" aria-hidden="true">
              <img v-if="thumbnails.covers[item.page.id]" :src="thumbnails.covers[item.page.id]" alt="" />
              <template v-else>
                <i
                  v-for="frame in thumbnails.frameGeometry(item.page).panels"
                  :key="frame.id"
                  :class="{ filled: frame.filled }"
                  :style="{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }"
                ></i>
              </template>
            </span>
            <span class="comic-studio__catalog-meta">
              <strong class="workspace-nav-label">{{ item.label }} · {{ item.title }}</strong>
              <small class="workspace-nav-meta">{{ item.panelCount }} 格{{ item.page.sequenceId ? ` · ${sequences.find((sequence) => sequence.id === item.page.sequenceId)?.title || '序列'}` : ' · 单页' }}</small>
            </span>
          </button>
          <p v-if="!catalog.length && canCreatePage" class="comic-studio__catalog-empty">
            本书还没有漫画页。用上方「新建漫画页」或「页面计划」开始。
          </p>
          <p v-if="!canCreatePage && scopeMode === 'global'" class="comic-studio__catalog-empty">
            {{ books.length ? '请先选择要制作漫画的作品。' : '还没有任何作品，先在首页建立一本书。' }}
          </p>
        </div>
        <details
          v-if="scopeMode === 'project' && (unownedPages.length || legacyWorldbookPages.length)"
          class="comic-studio__legacy"
          data-test="comic-quarantine"
        >
          <summary>未归属旧漫画（{{ unownedPages.length + legacyWorldbookPages.length }}）</summary>
          <p class="comic-studio__legacy-note">以下旧页不属于任何作品的漫画目录，不会参与生成与导出；可显式归入本书。</p>
          <div v-for="page in unownedPages" :key="page.id" class="comic-studio__legacy-item">
            <span>{{ page.title || '未命名漫画页' }}</span>
            <small>未归属旧漫画，只读展示</small>
            <button
              type="button"
              data-test="comic-adopt-current"
              @click="adoptUnownedToCurrentBook(page.id)"
            >
              归入本书
            </button>
          </div>
          <div v-for="page in legacyWorldbookPages" :key="page.id" class="comic-studio__legacy-item">
            <span>{{ page.title || '未命名漫画页' }}</span>
            <small>按旧世界书记录保存（可能与其他书共享），暂不提供一键归入</small>
          </div>
        </details>
        <label v-if="scopeMode === 'global' && books.length" class="comic-studio__book-picker">
          <span>选择作品</span>
          <select
            :value="''"
            aria-label="选择作品进入漫画"
            @change="enterBookScope($event.target.value)"
          >
            <option value="">选择一本书…</option>
            <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
          </select>
        </label>
        <details v-if="scopeMode === 'global' && legacyTargets" class="comic-studio__legacy">
          <summary>未归属旧漫画（{{ legacyTargets }}）</summary>
          <div v-for="page in legacyWorldbookPages" :key="page.id" class="comic-studio__legacy-item">
            <span>{{ page.title || '未命名漫画页' }}</span>
            <small>按旧世界书记录保存，未直接归属某本书</small>
            <label>
              <span class="visually-hidden">归入作品</span>
              <select :data-adopt-target="page.id" aria-label="选择归入的作品">
                <option value="">选择作品…</option>
                <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
              </select>
            </label>
            <button
              type="button"
              :data-test="`comic-adopt-${page.id}`"
              @click="adoptLegacy(page.id, $event.target.closest('.comic-studio__legacy-item')?.querySelector('select')?.value)"
            >
              归入
            </button>
          </div>
          <div v-for="page in unownedPages" :key="page.id" class="comic-studio__legacy-item">
            <span>{{ page.title || '未命名漫画页' }}</span>
            <small>未归属旧漫画，只读展示</small>
            <label>
              <span class="visually-hidden">归入作品</span>
              <select :data-adopt-target="page.id" aria-label="选择归入的作品">
                <option value="">选择作品…</option>
                <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
              </select>
            </label>
            <button
              type="button"
              :data-test="`comic-adopt-${page.id}`"
              @click="adoptLegacy(page.id, $event.target.closest('.comic-studio__legacy-item')?.querySelector('select')?.value)"
            >
              归入
            </button>
          </div>
        </details>
      </aside>

      <main class="comic-studio__canvas">
        <nav v-if="studioMode === 'page' && catalog.length" class="comic-studio__page-bar" aria-label="漫画页列表">
          <span class="comic-studio__page-bar-label">页面 {{ catalog.length }}</span>
          <div class="comic-studio__page-list">
          <button
            v-for="item in catalog"
            :key="item.page.id"
            type="button"
            class="comic-studio__page-item"
            :class="{ active: item.page.id === activePageId }"
            @click="onPageClick(item)"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.title }}</strong>
          </button>
          </div>
        </nav>

        <div
          class="comic-studio__canvas-stage"
          :class="{
            'is-planning': studioMode === 'plan',
            'has-composition': studioMode === 'page' && pagePreview
          }"
        >
          <ComicAdaptationPlanner
            v-if="studioMode === 'plan'"
            :sources="selectedAdaptationSources"
            :candidates="adaptationCandidates"
            :selected-candidate-id="selectedCandidateId"
            :plan="planningPlan"
            :reference-catalog="referenceCatalog"
            :generating="adaptationGenerating"
            :error="adaptationError"
            :persisted="planningPersisted"
            :bible-confirmed="planningBibleConfirmed"
            @generate="generateAdaptation"
            @select-candidate="selectAdaptationCandidate"
            @update-plan="updatePlanningPlan"
            @apply="applyAdaptation"
            @confirm-bible="confirmVisualBible"
            @open-reference="openReference"
          />
          <template v-else>
            <ComicCompositionCanvas
              v-if="pagePreview"
              :page="pagePreview"
              :active-panel-id="activePanelId"
              @select-panel="selectPanel($event)"
              @update-page="handleCompositionUpdate"
              @update-lettering-box="updatePreviewLettering"
              @update-lettering-tail="updatePreviewLetteringTail"
            />
            <div v-else class="comic-studio__empty-canvas">
              <span class="comic-studio__empty-kicker">整页制作</span>
              <strong>{{ canCreatePage ? '建立一张漫画页' : '选择作品后开始制作漫画' }}</strong>
              <span>{{ canCreatePage ? '直接建一页手工分镜，或从素材改编成多页序列。不需要先配置模型。' : '漫画默认归属当前作品；从目录选择作品后即可建页。' }}</span>
              <div class="comic-studio__empty-actions">
                <button
                  v-if="canCreatePage"
                  type="button"
                  class="comic-studio__empty-primary"
                  data-test="comic-empty-create"
                  @click="createBlankPage"
                >
                  <Plus :size="14" aria-hidden="true" />
                  新建空白页
                </button>
                <button
                  v-if="canCreatePage"
                  type="button"
                  data-test="comic-empty-adapt"
                  @click="openStudioMode('plan')"
                >
                  从素材改编
                </button>
                <label v-if="!canCreatePage && books.length" class="comic-studio__book-picker">
                  <span class="visually-hidden">选择作品</span>
                  <select
                    :value="''"
                    aria-label="选择作品进入漫画"
                    @change="enterBookScope($event.target.value)"
                  >
                    <option value="">选择一本书…</option>
                    <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
                  </select>
                </label>
              </div>
            </div>
          </template>
        </div>
        <p v-if="archiveStatus" class="comic-studio__status comic-studio__status--canvas" role="status">{{ archiveStatus }}</p>
      </main>

      <aside
        v-if="studioMode === 'page' && !inspectorCollapsed"
        class="comic-studio__inspector archive-pin notes-sidekick"
        aria-label="副阅读台"
      >
        <span class="archive-pin__nail" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" fill="currentColor" />
            <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.4" opacity="0.55" />
          </svg>
        </span>
        <header class="notes-sidekick__header">
          <span class="notes-sidekick__title">当前格制作</span>
          <span class="notes-sidekick__count">分镜 · 构图 · 成稿</span>
        </header>
        <div class="comic-studio__inspector-body">
          <ComicPageEditor
          ref="comicEditor"
          :key="activePageId || 'new-page'"
          standalone
          compact
          :page-id="activePageId"
          :project-id="activeProjectId"
          :source-candidates="sourceCandidates"
          :source-text="selectedSource?.content || ''"
          :source-title="selectedSource?.title || ''"
          :source-refs="selectedSourceRefs"
          :preferred-source-id="selectedSourceId"
          :preferred-panel-id="activePanelId"
          :storage-key="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
          :model-configs="modelConfigs"
          :selected-model-id="selectedModelId"
          @update:selected-model-id="selectedModelId = $event"
          @configs-updated="loadModels"
          @page-preview="handlePagePreview"
          @page-saved="handlePageSaved"
          @active-panel-change="selectPanel($event)"
          @active-panel-source-change="syncActivePanelSource"
          @save-to-material="savePanelAsMaterial"
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.comic-studio {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--archive-ink, var(--text-primary));
}

.comic-studio *,
.comic-studio *::before,
.comic-studio *::after { box-sizing: border-box; }

.comic-studio__mast {
  flex: 0 0 auto;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 24px 11px 64px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
}

.comic-studio__mast-left { min-width: 0; display: flex; align-items: center; gap: 12px; }
.comic-studio__book { display: inline-flex; align-items: baseline; gap: 8px; padding-left: 10px; border-left: 2px solid var(--archive-gold); }
.comic-studio__book strong { color: var(--archive-ink); font-size: 13px; }
.comic-studio__book span { max-width: 22ch; overflow: hidden; color: var(--archive-ink-soft); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__mast-actions { display: flex; align-items: center; gap: 10px; min-width: 0; }
.comic-studio__sequence-picker { display: inline-flex; align-items: center; gap: 6px; color: var(--archive-ink-soft); font-size: 11px; }
.comic-studio__sequence-picker select {
  max-width: 180px;
  min-height: 28px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink);
  font: inherit;
  font-size: 11px;
}
.comic-studio__workflow { display: flex; align-items: center; gap: 0; margin: 0; padding: 0; color: var(--archive-ink-soft); font-size: 10px; list-style: none; }
.comic-studio__workflow li { display: inline-flex; align-items: center; white-space: nowrap; }
.comic-studio__workflow li + li::before { content: "/"; margin-inline: 8px; color: color-mix(in srgb, var(--archive-ink-soft) 42%, transparent); }
.comic-studio__workflow button {
  min-height: 28px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.comic-studio__workflow button:hover,
.comic-studio__workflow button.is-current { color: var(--archive-ink); font-weight: 700; }

.comic-studio__new {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 58%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-olive) 10%, var(--archive-paper-soft));
  color: var(--archive-ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}
.comic-studio__new:hover { background: color-mix(in srgb, var(--archive-olive) 16%, var(--archive-paper-soft)); }
.comic-studio__new:disabled { opacity: 0.45; cursor: not-allowed; }
.comic-studio__collapse {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.comic-studio__collapse:hover { color: var(--archive-ink); }

.comic-studio__scope-notice,
.comic-studio__unknown-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 24px 7px 64px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 12%, transparent);
  background: color-mix(in srgb, var(--archive-gold) 10%, var(--archive-paper-soft));
  color: var(--archive-ink);
  font-size: 12px;
}
.comic-studio__unknown-bar button {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 2px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 24%, var(--border));
  border-radius: 3px;
  background: transparent;
  color: var(--archive-ink);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.comic-studio__workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--workspace-sidebar-width, 240px) minmax(460px, 1fr) 320px;
  overflow: hidden;
}
.comic-studio__workspace.is-planning { grid-template-columns: var(--workspace-sidebar-width, 240px) minmax(0, 1fr); }
.comic-studio__workspace.inspector-collapsed { grid-template-columns: var(--workspace-sidebar-width, 240px) minmax(0, 1fr); }
.comic-studio__workspace > :deep(.material-source-drawer) { width: 100%; }

.comic-studio__catalog {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--archive-paper-strong);
  background: linear-gradient(180deg, color-mix(in srgb, var(--archive-paper) 88%, transparent) 0%, color-mix(in srgb, var(--archive-paper-soft) 94%, transparent) 100%);
}
.comic-studio__catalog-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--archive-paper-strong);
}
.comic-studio__catalog-head strong { color: var(--archive-ink-soft); font-family: var(--font-sans); font-size: 12px; font-weight: 500; }
.comic-studio__catalog-head span { color: var(--archive-ink-soft); font-size: 12px; }
.comic-studio__catalog > .archive-pin__nail, .comic-studio__catalog::before, .comic-studio__catalog::after { display: none; }
.comic-studio__catalog-list { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 10px 10px 12px; overflow-y: auto; scrollbar-width: thin; }
.comic-studio__catalog-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 5px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
  color: var(--archive-ink, var(--text-primary));
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.comic-studio__catalog-item:hover { border-color: color-mix(in srgb, var(--archive-olive) 55%, var(--border)); }
.comic-studio__catalog-item.active {
  border-color: color-mix(in srgb, var(--archive-olive) 70%, var(--accent));
  background: color-mix(in srgb, var(--archive-olive) 10%, var(--archive-paper-soft));
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--archive-olive) 80%, var(--accent));
}
.comic-studio__catalog-thumb {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 82%, transparent);
}
.comic-studio__catalog-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.comic-studio__catalog-thumb i {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 44%, transparent);
  background: color-mix(in srgb, var(--archive-ink) 4%, transparent);
}
.comic-studio__catalog-thumb i.filled { background: color-mix(in srgb, var(--archive-olive) 22%, transparent); }
.comic-studio__catalog-meta { min-width: 0; display: grid; gap: 2px; }
.comic-studio__catalog-meta strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__catalog-meta small { color: var(--archive-ink-soft); font-size: 10px; }
.comic-studio__catalog-empty { margin: 4px 2px; color: var(--archive-ink-soft); font-size: 11px; line-height: 1.5; }
.comic-studio__book-picker { display: grid; gap: 4px; padding: 8px 12px 12px 30px; color: var(--archive-ink-soft); font-size: 11px; }
.comic-studio__book-picker select {
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
  color: var(--archive-ink);
  font: inherit;
  font-size: 12px;
}
.comic-studio__legacy { margin: 0 10px 12px; border-top: 1px dashed color-mix(in srgb, var(--archive-ink) 20%, transparent); }
.comic-studio__legacy summary { min-height: 30px; display: flex; align-items: center; color: var(--archive-ink-soft); cursor: pointer; font-size: 11px; }
.comic-studio__legacy-note { margin: 2px 0 6px; color: var(--archive-ink-soft); font-size: 10px; line-height: 1.5; }
.comic-studio__legacy-item { display: grid; gap: 3px; padding: 6px 0; border-bottom: 1px dashed color-mix(in srgb, var(--archive-ink) 12%, transparent); font-size: 11px; }
.comic-studio__legacy-item small { color: var(--archive-ink-soft); font-size: 10px; }
.comic-studio__legacy-item label { display: grid; gap: 2px; }
.comic-studio__legacy-item select {
  min-height: 26px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
  color: var(--archive-ink);
  font: inherit;
  font-size: 11px;
}
.comic-studio__legacy-item button {
  justify-self: start;
  min-height: 26px;
  padding: 2px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 22%, var(--border));
  border-radius: 3px;
  background: transparent;
  color: var(--archive-ink);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.comic-studio__inspector {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid color-mix(in srgb, var(--archive-olive) 28%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--archive-paper) 86%, transparent) 0%, color-mix(in srgb, var(--archive-paper-soft) 92%, transparent) 100%);
}

.archive-pin__nail { position: absolute; top: 14px; left: 14px; z-index: 2; color: var(--accent); pointer-events: none; }
.notes-sidekick__header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 18px 16px 10px 36px; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 45%, transparent); }
.notes-sidekick__title { color: var(--archive-ink); font-family: var(--font-display); font-size: 14px; font-weight: 600; letter-spacing: 0.04em; }
.notes-sidekick__count { color: var(--archive-ink-soft); font-family: var(--font-sans); font-size: 10px; font-style: italic; letter-spacing: 0.1em; white-space: nowrap; }
.comic-studio__inspector-body { flex: 1 1 auto; min-height: 0; padding: 12px; overflow: auto; scrollbar-gutter: stable; }

.comic-studio__page-bar {
  width: 100%;
  height: 42px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 44%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 82%, transparent);
  font-size: 11px;
}

.comic-studio__page-bar-label { flex: 0 0 auto; color: var(--archive-ink-soft, var(--text-secondary)); }
.comic-studio__page-list { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 5px; overflow-x: auto; scrollbar-width: thin; }

.comic-studio__page-item {
  max-width: 170px;
  min-width: 92px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  color: var(--archive-ink, var(--text-primary));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.comic-studio__page-item:hover,
.comic-studio__page-item.active { border-color: color-mix(in srgb, var(--archive-olive) 64%, var(--border)); }
.comic-studio__page-item.active { background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft)); }
.comic-studio__page-item span { flex: 0 0 auto; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 9px; }
.comic-studio__page-item strong { min-width: 0; overflow: hidden; font-family: var(--font-display); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__canvas {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--archive-paper-soft) 56%, transparent);
}

.comic-studio__canvas-stage { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; padding: 8px 12px; overflow: auto; }
.comic-studio__canvas-stage.is-planning { display: block; padding: 0; }
.comic-studio__canvas-stage.has-composition { display: block; padding: 0; overflow: hidden; }
.comic-studio__canvas-stage.has-composition :deep(.comic-composition) { height: 100%; }
.comic-studio__empty-canvas { display: grid; justify-items: center; gap: 9px; color: var(--archive-ink-soft, var(--text-secondary)); text-align: center; }
.comic-studio__empty-canvas strong { color: var(--archive-ink, var(--text-primary)); font-family: var(--font-display); font-size: 20px; }
.comic-studio__empty-canvas > span { font-size: 11px; }
.comic-studio__empty-kicker { color: var(--archive-olive); font-weight: 700; letter-spacing: 0.12em; }
.comic-studio__empty-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.comic-studio__empty-canvas button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 58%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft));
  color: var(--archive-ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}
.comic-studio__empty-primary { background: color-mix(in srgb, var(--archive-olive) 18%, var(--archive-paper-soft)); }
.comic-studio__status { margin: 10px 0 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.comic-studio__status--canvas { flex: 0 0 auto; margin: 0; padding: 6px 14px; font-size: 11px; }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .comic-studio__workspace { grid-template-columns: 184px minmax(360px, 1fr) 300px; }
  .comic-studio__workspace.is-planning { grid-template-columns: 190px minmax(0, 1fr); }
  .comic-studio__workspace.inspector-collapsed { grid-template-columns: 184px minmax(0, 1fr); }
}

@media (max-width: 980px) {
  .comic-studio__workspace { display: block; }
  .comic-studio__workspace > * { width: 100%; height: 100%; }
  .comic-studio__workspace > :deep(.material-source-drawer),
  .comic-studio__workspace .comic-studio__catalog,
  .comic-studio__workspace .comic-studio__canvas,
  .comic-studio__workspace .comic-studio__inspector { display: none; }
  .comic-studio__workspace[data-mobile-pane="sources"] > :deep(.material-source-drawer),
  .comic-studio__workspace[data-mobile-pane="sources"] .comic-studio__catalog,
  .comic-studio__workspace[data-mobile-pane="page"] .comic-studio__canvas,
  .comic-studio__workspace[data-mobile-pane="panel"] .comic-studio__inspector {
    display: flex;
  }
  .comic-studio__workspace[data-mobile-pane="panel"] .comic-studio__inspector {
    border-left: 0;
  }
  .comic-studio__mast { padding-inline: 14px; }
  .comic-studio__scope-notice,
  .comic-studio__unknown-bar { padding-inline: 14px; }
  .comic-studio__canvas-stage { padding: 8px; }
  .comic-studio__workflow { display: none; }
  .comic-studio__collapse { font-size: 0; gap: 0; }
}

@media (max-width: 640px) {
  .comic-studio__mast { gap: 10px; padding: 8px 10px; }
  .comic-studio__sequence-picker span { display: none; }
  .comic-studio__sequence-picker select { max-width: 120px; }
  .comic-studio__new { flex: 0 0 auto; }
  .comic-studio__canvas-stage { padding: 6px; }
}
</style>
