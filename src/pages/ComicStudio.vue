<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicAdaptationPlanner from '../components/media/ComicAdaptationPlanner.vue'
import ComicCompositionCanvas from '../components/media/ComicCompositionCanvas.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import { useWorldStore } from '../stores/worldStore'
import { listActiveNarrativeAssets, normalizeImagePresentation } from '../services/narrativeAssets'
import {
  buildComicPagesFromAdaptation,
  buildComicReferenceCatalog,
  generateComicAdaptationCandidates
} from '../services/media/comicAdaptationService'
import { addNarrativeImageAsset } from '../services/media/narrativeImageAssetBridge'
import {
  confirmComicSequenceVisualBible,
  listComicPages,
  saveComicPages,
  updateComicPageComposition,
  updateComicSequenceVisualBible
} from '../services/media/comicPageStore'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const comicPages = ref([])
const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()
const activePageId = ref('')
const pagePreview = ref(null)
const sourceCandidates = ref([])
const modelConfigs = ref([])
const selectedModelId = ref('')
const selectedSourceId = ref('')
const archiveStatus = ref('')
const comicEditor = ref(null)
const activeCompositionPanelId = ref('')
const mobilePane = ref('page')
const studioMode = ref('plan')
const planningTarget = ref('new')
const adaptationSourceIds = ref([])
const adaptationCandidates = ref([])
const selectedCandidateId = ref('')
const adaptationGenerating = ref(false)
const adaptationError = ref('')
const pageMobilePanes = [
  { value: 'sources', label: '素材' },
  { value: 'page', label: '页面' },
  { value: 'panel', label: '当前格' }
]
const planMobilePanes = [
  { value: 'sources', label: '素材' },
  { value: 'page', label: '页面计划' }
]

const activePage = computed(() => comicPages.value.find((page) => page.id === activePageId.value) || null)
const selectedSource = computed(() => sourceCandidates.value.find((asset) => asset.id === selectedSourceId.value) || null)
const selectedAdaptationSources = computed(() => sourceCandidates.value
  .filter((asset) => adaptationSourceIds.value.includes(asset.id)))
const selectedSourceRefs = computed(() => selectedSource.value ? [{
  refType: 'narrative-asset',
  refId: selectedSource.value.id,
  projectId: selectedSource.value.projectId ?? null,
  excerpt: String(selectedSource.value.content || '').slice(0, 240)
}] : [])
const activeProjectId = computed(() => (
  activePage.value?.projectId
  ?? selectedSource.value?.projectId
  ?? selectedAdaptationSources.value.find((asset) => asset.projectId)?.projectId
  ?? worldStore.activeWorldbook?.id
  ?? null
))
const comicMobilePanes = computed(() => studioMode.value === 'plan' ? planMobilePanes : pageMobilePanes)
const referenceCatalog = computed(() => buildComicReferenceCatalog({
  worldbook: worldStore.activeWorldbook,
  assets: sourceCandidates.value
}))
const selectedCandidate = computed(() => adaptationCandidates.value
  .find((candidate) => candidate.id === selectedCandidateId.value) || null)
const activeSequencePages = computed(() => {
  if (!activePage.value?.sequenceId) return []
  return comicPages.value
    .filter((page) => page.sequenceId === activePage.value.sequenceId)
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

onMounted(async () => {
  sourceCandidates.value = listActiveNarrativeAssets()
  const requestedSourceId = String(route.query.assetId || '')
  selectedSourceId.value = sourceCandidates.value.some((asset) => asset.id === requestedSourceId)
    ? requestedSourceId
    : ''
  adaptationSourceIds.value = selectedSourceId.value ? [selectedSourceId.value] : []
  await worldStore.loadWorldbooksIndex()
  if (worldStore.worldbooksIndex.length) await worldStore.ensureActiveWorldbook()
  loadModels()
  refreshPages()
  if (comicPages.value.length && !requestedSourceId) {
    studioMode.value = 'page'
    planningTarget.value = activePage.value?.sequenceId ? 'sequence' : 'new'
  }
})

function refreshPages(preferredPageId = activePageId.value) {
  comicPages.value = listComicPages()
  activePageId.value = comicPages.value.some((page) => page.id === preferredPageId)
    ? preferredPageId
    : comicPages.value[0]?.id || ''
  pagePreview.value = comicPages.value.find((page) => page.id === activePageId.value) || null
  activeCompositionPanelId.value = pagePreview.value?.panels.some((panel) => panel.id === activeCompositionPanelId.value)
    ? activeCompositionPanelId.value
    : pagePreview.value?.panels[0]?.id || ''
}

function loadModels(configs = null) {
  modelConfigs.value = Array.isArray(configs) ? configs : listImageProviderConfigs()
  if (!modelConfigs.value.some((config) => config.id === selectedModelId.value)) {
    selectedModelId.value = modelConfigs.value[0]?.id || ''
  }
}

function selectPage(pageId) {
  activePageId.value = pageId
  pagePreview.value = comicPages.value.find((page) => page.id === pageId) || null
  archiveStatus.value = ''
  studioMode.value = 'page'
  planningTarget.value = activePage.value?.sequenceId ? 'sequence' : 'new'
  mobilePane.value = 'page'
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

function startNewPage() {
  studioMode.value = 'page'
  activePageId.value = ''
  pagePreview.value = null
  archiveStatus.value = ''
  mobilePane.value = 'panel'
}

function openStudioMode(mode) {
  studioMode.value = mode
  if (mode === 'plan') {
    planningTarget.value = activePage.value?.sequenceId ? 'sequence' : 'new'
    mobilePane.value = 'page'
    return
  }
  mobilePane.value = mode === 'panel' ? 'panel' : 'page'
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
  updateComicSequenceVisualBible(activePage.value.sequenceId, {
    references: nextPlan.visualBible.references.map(resolveSemanticReference).filter(Boolean),
    palette: nextPlan.visualBible.palette,
    lineStyle: nextPlan.visualBible.lineStyle,
    renderingNotes: nextPlan.visualBible.renderingNotes
  })
  refreshPages(activePageId.value)
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
    refreshPages(saved[0].id)
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
  if (!activePage.value?.sequenceId) return
  try {
    confirmComicSequenceVisualBible(activePage.value.sequenceId)
    refreshPages(activePageId.value)
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
  refreshPages(page.id)
  pagePreview.value = page
}

function handlePagePreview(page) {
  pagePreview.value = page
  if (!page?.panels?.some((panel) => panel.id === activeCompositionPanelId.value)) {
    activeCompositionPanelId.value = page?.panels?.[0]?.id || ''
  }
}

function handleCompositionUpdate(nextPage) {
  if (!nextPage?.id) return
  const runtimeTakes = new Map(nextPage.panels.map((panel) => [panel.id, panel.imageTakes || []]))
  const saved = updateComicPageComposition(nextPage.id, nextPage)
  if (!saved) return
  comicPages.value = listComicPages()
  pagePreview.value = {
    ...saved,
    panels: saved.panels.map((panel) => ({
      ...panel,
      imageTakes: runtimeTakes.get(panel.id) || []
    }))
  }
  if (!pagePreview.value.panels.some((panel) => panel.id === activeCompositionPanelId.value)) {
    activeCompositionPanelId.value = pagePreview.value.panels[0]?.id || ''
  }
  void comicEditor.value?.reloadPage?.()
}

function updatePreviewLettering(payload) {
  comicEditor.value?.updateLetteringBox(payload.panelId, payload.objectId, payload.box)
}

function updatePreviewLetteringTail(payload) {
  comicEditor.value?.updateLetteringTail(payload.panelId, payload.objectId, payload.tailTarget)
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
</script>

<template>
  <div class="comic-studio">
    <header class="comic-studio__mast">
      <div class="comic-studio__mast-left">
        <div class="comic-studio__book">
          <strong>漫画</strong>
          <span>整页制作</span>
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
      <button
        type="button"
        class="comic-studio__new"
        @click="studioMode === 'plan' ? resetAdaptation() : startNewPage()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {{ studioMode === 'plan' ? '新建改编' : '新建漫画页' }}
      </button>
    </header>

    <WorkspacePaneSwitch
      v-model="mobilePane"
      :items="comicMobilePanes"
      label="漫画工作区"
      :breakpoint="980"
    />

    <div
      class="comic-studio__workspace"
      :class="{ 'is-planning': studioMode === 'plan' }"
      :data-mobile-pane="mobilePane"
    >
      <MaterialSourceDrawer
        :assets="sourceCandidates"
        :selected-id="selectedSourceId"
        :selected-ids="adaptationSourceIds"
        :multi="studioMode === 'plan'"
        @select="selectSource"
      />

      <main class="comic-studio__canvas">
        <nav v-if="studioMode === 'page'" class="comic-studio__page-bar" aria-label="漫画页列表">
          <span class="comic-studio__page-bar-label">页面 {{ comicPages.length }}</span>
          <div class="comic-studio__page-list">
          <button
            v-for="(page, index) in comicPages"
            :key="page.id"
            type="button"
            class="comic-studio__page-item"
            :class="{ active: page.id === activePageId }"
            @click="selectPage(page.id)"
          >
            <span>P{{ String(index + 1).padStart(2, '0') }}</span>
            <strong>{{ page.title || '未命名漫画页' }}</strong>
          </button>
            <span v-if="!comicPages.length" class="comic-studio__page-empty">尚无页面</span>
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
              :active-panel-id="activeCompositionPanelId"
              @select-panel="activeCompositionPanelId = $event"
              @update-page="handleCompositionUpdate"
              @update-lettering-box="updatePreviewLettering"
              @update-lettering-tail="updatePreviewLetteringTail"
            />
            <div v-else class="comic-studio__empty-canvas">
              <span class="comic-studio__empty-kicker">整页制作</span>
              <strong>建立一张漫画页</strong>
              <span>从页面计划建立多页序列，或在当前格制作区建立单页。</span>
              <button type="button" @click="openStudioMode('plan')">打开页面计划</button>
            </div>
          </template>
        </div>
      </main>

      <aside
        v-if="studioMode === 'page'"
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
          :preferred-panel-id="activeCompositionPanelId"
          :storage-key="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
          :model-configs="modelConfigs"
          :selected-model-id="selectedModelId"
          @update:selected-model-id="selectedModelId = $event"
          @configs-updated="loadModels"
          @page-preview="handlePagePreview"
          @page-saved="handlePageSaved"
          @active-panel-change="activeCompositionPanelId = $event"
          @active-panel-source-change="syncActivePanelSource"
          @save-to-material="savePanelAsMaterial"
          />
          <p v-if="archiveStatus" class="comic-studio__status" role="status">{{ archiveStatus }}</p>
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
.comic-studio__book span { color: var(--archive-ink-soft); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.comic-studio__source-title { max-width: 32ch; overflow: hidden; color: var(--archive-ink-soft); font-size: 12px; font-style: italic; text-overflow: ellipsis; white-space: nowrap; }
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
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
}
.comic-studio__new:hover { color: var(--archive-ink); }
.comic-studio__workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 190px minmax(460px, 1fr) 300px;
  overflow: hidden;
}
.comic-studio__workspace.is-planning { grid-template-columns: 210px minmax(0, 1fr); }
.comic-studio__workspace > :deep(.material-source-drawer) { width: 100%; }

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
.notes-sidekick__modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 0 12px; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 38%, transparent); }
.notes-sidekick__modes button { min-width: 0; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--archive-ink-soft); cursor: pointer; font: inherit; font-size: 11px; }
.notes-sidekick__modes button:hover { color: var(--archive-ink); }
.notes-sidekick__modes button.active { border-bottom-color: var(--accent); color: var(--accent); font-weight: 600; }
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
.comic-studio__page-empty { padding-inline: 5px; color: var(--archive-ink-soft, var(--text-secondary)); font-style: italic; }

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
.comic-studio__canvas-inner { width: min(100%, 920px); display: grid; gap: 8px; justify-items: center; }
.comic-studio__canvas-inner > header { width: 100%; display: flex; justify-content: space-between; gap: 12px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.comic-studio__canvas-inner > header strong { overflow: hidden; color: var(--archive-ink, var(--text-primary)); text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__empty-canvas { display: grid; justify-items: center; gap: 9px; color: var(--archive-ink-soft, var(--text-secondary)); text-align: center; }
.comic-studio__empty-canvas strong { color: var(--archive-ink, var(--text-primary)); font-family: var(--font-display); font-size: 20px; }
.comic-studio__empty-canvas span { font-size: 11px; }
.comic-studio__empty-kicker { color: var(--archive-olive); font-weight: 700; letter-spacing: 0.12em; }
.comic-studio__empty-canvas button { min-height: 32px; margin-top: 8px; padding: 5px 14px; border: 1px solid color-mix(in srgb, var(--archive-olive) 58%, var(--border)); border-radius: 3px; background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft)); color: var(--archive-ink); cursor: pointer; font: inherit; font-size: 11px; font-weight: 650; }
.comic-studio__status { margin: 10px 0 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }

@media (max-width: 1100px) {
  .comic-studio__workspace { grid-template-columns: 180px minmax(360px, 1fr) 280px; }
  .comic-studio__workspace.is-planning { grid-template-columns: 190px minmax(0, 1fr); }
}

@media (max-width: 980px) {
  .comic-studio__workspace { display: block; }
  .comic-studio__workspace > * { width: 100%; height: 100%; }
  .comic-studio__workspace > :deep(.material-source-drawer),
  .comic-studio__workspace .comic-studio__canvas,
  .comic-studio__workspace .comic-studio__inspector { display: none; }
  .comic-studio__workspace[data-mobile-pane="sources"] > :deep(.material-source-drawer),
  .comic-studio__workspace[data-mobile-pane="page"] .comic-studio__canvas,
  .comic-studio__workspace[data-mobile-pane="panel"] .comic-studio__inspector {
    display: flex;
  }
  .comic-studio__workspace[data-mobile-pane="panel"] .comic-studio__inspector {
    border-left: 0;
  }
  .comic-studio__mast { padding-inline: 14px; }
  .comic-studio__canvas-stage { padding: 8px; }
}

@media (max-width: 640px) {
  .comic-studio__mast { gap: 10px; padding: 8px 10px; }
  .comic-studio__source-title { display: none; }
  .comic-studio__workflow { display: none; }
  .comic-studio__new { flex: 0 0 auto; }
  .comic-studio__canvas-stage { padding: 6px; }
  .comic-studio__canvas-inner { width: 100%; }
}
</style>
