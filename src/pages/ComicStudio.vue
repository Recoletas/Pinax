<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import { listActiveNarrativeAssets, normalizeImagePresentation } from '../services/narrativeAssets'
import { addNarrativeImageAsset } from '../services/media/narrativeImageAssetBridge'
import { listComicPages } from '../services/media/comicPageStore'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const comicPages = ref([])
const route = useRoute()
const router = useRouter()
const activePageId = ref('')
const pagePreview = ref(null)
const sourceCandidates = ref([])
const modelConfigs = ref([])
const selectedModelId = ref('')
const selectedSourceId = ref('')
const archiveStatus = ref('')
const comicEditor = ref(null)

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
  const requestedSourceId = String(route.query.assetId || '')
  selectedSourceId.value = sourceCandidates.value.some((asset) => asset.id === requestedSourceId)
    ? requestedSourceId
    : ''
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

function openMaterialWorkspace(workspace) {
  router.push({
    name: 'materials',
    query: {
      workspace,
      ...(selectedSourceId.value ? { assetId: selectedSourceId.value } : {})
    }
  })
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

function updatePreviewLettering(payload) {
  comicEditor.value?.updateLetteringBox(payload.panelId, payload.objectId, payload.box)
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
          <strong>素材</strong>
          <span>漫画制作</span>
        </div>
        <span v-if="selectedSource" class="comic-studio__source-title">{{ selectedSource.title || '无标题素材' }}</span>
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
            <span>整页编辑</span>
            <strong>{{ pagePreview.title || '未命名漫画页' }}</strong>
          </header>
          <ComicPagePreview
            :page="pagePreview"
            editable-lettering
            @update-lettering-box="updatePreviewLettering"
          />
          </div>
          <div v-else class="comic-studio__empty-canvas">
            <strong>新漫画页</strong>
            <span>从左侧选择素材，在右侧确定版式后建立页面</span>
          </div>
        </div>
      </main>

      <aside class="comic-studio__inspector archive-pin notes-sidekick" aria-label="副阅读台">
        <span class="archive-pin__nail" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" fill="currentColor" />
            <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.4" opacity="0.55" />
          </svg>
        </span>
        <header class="notes-sidekick__header">
          <span class="notes-sidekick__title">副阅读台</span>
          <span class="notes-sidekick__count">漫画制作</span>
        </header>
        <nav class="notes-sidekick__modes" aria-label="副工作台模式">
          <button type="button" @click="openMaterialWorkspace('materials')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M3 2.5h10v4H3zM3 9.5h10v4H3z" />
            </svg>
            相关素材
          </button>
          <button type="button" @click="openMaterialWorkspace('illustration')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
              <circle cx="6" cy="6" r="1.2" />
              <path d="M3.5 12l3.2-3 2.1 1.8 1.7-1.6 2 2" />
            </svg>
            插画生成
          </button>
          <button type="button" class="active" aria-current="page">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
            </svg>
            漫画制作
          </button>
        </nav>
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
  grid-template-columns: 220px minmax(420px, 1fr) 320px;
  overflow: hidden;
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

.comic-studio__canvas-stage { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; padding: 8px; overflow: auto; }
.comic-studio__canvas-inner { width: min(100%, 920px); display: grid; gap: 8px; justify-items: center; }
.comic-studio__canvas-inner > header { width: 100%; display: flex; justify-content: space-between; gap: 12px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }
.comic-studio__canvas-inner > header strong { overflow: hidden; color: var(--archive-ink, var(--text-primary)); text-overflow: ellipsis; white-space: nowrap; }
.comic-studio__empty-canvas { display: grid; gap: 7px; color: var(--archive-ink-soft, var(--text-secondary)); text-align: center; }
.comic-studio__empty-canvas strong { color: var(--archive-ink, var(--text-primary)); font-family: var(--font-display); font-size: 20px; }
.comic-studio__empty-canvas span { font-size: 11px; }
.comic-studio__status { margin: 10px 0 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 10px; }

@media (max-width: 1100px) {
  .comic-studio__workspace { grid-template-columns: 200px minmax(360px, 1fr) 280px; }
}

@media (max-width: 980px) {
  .comic-studio__workspace { grid-template-columns: 170px minmax(300px, 1fr) 270px; }
  .comic-studio__mast { padding-inline: 14px; }
  .comic-studio__canvas-stage { padding: 8px; }
}
</style>
