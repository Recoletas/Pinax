<script setup>
import { computed, onMounted, ref } from 'vue'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import { listActiveNarrativeAssets, normalizeImagePresentation } from '../services/narrativeAssets'
import { addNarrativeImageAsset } from '../services/media/narrativeImageAssetBridge'
import { listComicPages } from '../services/media/comicPageStore'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const comicPages = ref([])
const activePageId = ref('')
const pagePreview = ref(null)
const sourceCandidates = ref([])
const modelConfigs = ref([])
const selectedModelId = ref('')
const selectedSourceId = ref('')
const archiveStatus = ref('')

const activePage = computed(() => comicPages.value.find((page) => page.id === activePageId.value) || null)
const selectedSource = computed(() => sourceCandidates.value.find((asset) => asset.id === selectedSourceId.value) || null)
const selectedSourceRefs = computed(() => selectedSource.value ? [{
  refType: 'narrative-asset',
  refId: selectedSource.value.id,
  projectId: selectedSource.value.projectId ?? null,
  excerpt: String(selectedSource.value.content || '').slice(0, 240)
}] : [])
const activeProjectId = computed(() => activePage.value?.projectId ?? selectedSource.value?.projectId ?? null)

onMounted(() => {
  sourceCandidates.value = listActiveNarrativeAssets()
  loadModels()
  refreshPages()
})

function refreshPages(preferredPageId = activePageId.value) {
  comicPages.value = listComicPages()
  activePageId.value = comicPages.value.some((page) => page.id === preferredPageId)
    ? preferredPageId
    : comicPages.value[0]?.id || ''
  pagePreview.value = comicPages.value.find((page) => page.id === activePageId.value) || null
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
}

function selectSource(sourceId) {
  selectedSourceId.value = sourceId
  archiveStatus.value = ''
}

function syncActivePanelSource(sourceId) {
  selectedSourceId.value = sourceId || ''
}

function startNewPage() {
  activePageId.value = ''
  pagePreview.value = null
  archiveStatus.value = ''
}

function handlePageSaved(page) {
  if (!page?.id) return
  refreshPages(page.id)
  pagePreview.value = page
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
      <div>
        <span>素材 · 漫画制作</span>
        <h1>漫画制作</h1>
      </div>
      <button type="button" class="comic-studio__new" @click="startNewPage">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建漫画页
      </button>
    </header>

    <div class="comic-studio__workspace">
      <MaterialSourceDrawer
        :assets="sourceCandidates"
        :selected-id="selectedSourceId"
        @select="selectSource"
      />

      <main class="comic-studio__canvas">
        <nav class="comic-studio__page-bar" aria-label="漫画页列表">
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

        <div class="comic-studio__canvas-stage">
          <div v-if="pagePreview" class="comic-studio__canvas-inner">
          <header>
            <span>整页预览</span>
            <strong>{{ pagePreview.title || '未命名漫画页' }}</strong>
          </header>
          <ComicPagePreview :page="pagePreview" />
          </div>
          <div v-else class="comic-studio__empty-canvas">
            <strong>新漫画页</strong>
            <span>从左侧选择素材，在右侧确定版式后建立页面</span>
          </div>
        </div>
      </main>

      <aside class="comic-studio__inspector" aria-label="漫画制作检查器">
        <ComicPageEditor
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
          :storage-key="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
          :model-configs="modelConfigs"
          :selected-model-id="selectedModelId"
          @update:selected-model-id="selectedModelId = $event"
          @configs-updated="loadModels"
          @page-preview="pagePreview = $event"
          @page-saved="handlePageSaved"
          @active-panel-source-change="syncActivePanelSource"
          @save-to-material="savePanelAsMaterial"
        />
        <p v-if="archiveStatus" class="comic-studio__status" role="status">{{ archiveStatus }}</p>
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
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 22px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
}

.comic-studio__mast > div { display: grid; gap: 2px; }
.comic-studio__mast span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.comic-studio__mast h1 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 650; letter-spacing: 0; }

.comic-studio__new {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 62%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong));
  color: var(--archive-paper-soft, var(--accent-text));
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
}

.comic-studio__workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 210px minmax(380px, 1fr) 350px;
  overflow: hidden;
}

.comic-studio__inspector {
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--archive-paper) 90%, transparent);
}

.comic-studio__inspector { padding: 12px; overflow: auto; border-left: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent); scrollbar-gutter: stable; }

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

.comic-studio__canvas-stage { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; padding: 22px; overflow: auto; }
.comic-studio__canvas-inner { width: min(100%, 720px); display: grid; gap: 10px; justify-items: center; }
.comic-studio__canvas-inner > header { width: 100%; display: flex; justify-content: space-between; gap: 12px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.comic-studio__canvas-inner > header strong { overflow: hidden; color: var(--archive-ink, var(--text-primary)); text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__empty-canvas { display: grid; gap: 7px; color: var(--archive-ink-soft, var(--text-secondary)); text-align: center; }
.comic-studio__empty-canvas strong { color: var(--archive-ink, var(--text-primary)); font-family: var(--font-display); font-size: 20px; }
.comic-studio__empty-canvas span { font-size: 11px; }
.comic-studio__status { margin: 10px 0 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }

@media (max-width: 980px) {
  .comic-studio__workspace { grid-template-columns: 180px minmax(300px, 1fr) 310px; }
  .comic-studio__mast { padding-inline: 14px; }
  .comic-studio__canvas-stage { padding: 14px; }
}
</style>
