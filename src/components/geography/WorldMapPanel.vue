<template>
  <div class="world-map-panel">
    <!-- Toolbar -->
    <div class="panel-toolbar">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        世界地图
        <span v-if="activeNode" class="active-world-name" :title="activeNode.name">
          — {{ activeNode.name }}
        </span>
      </h2>
      <div class="toolbar-right">
        <div class="view-toggle">
          <button class="toggle-btn" :class="{ active: viewMode === 'voronoi' }" @click="viewMode = 'voronoi'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            奇幻
          </button>
          <button class="toggle-btn" :disabled="true" title="3D 地图开发调优中">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            3D
          </button>
        </div>

        <button class="generate-btn" @click="handleGenerate" :disabled="streaming">
          <svg v-if="streaming" class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <template v-else-if="voronoiConfig">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            AI 重新生成
          </template>
          <template v-else>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
            AI 生成地图
          </template>
        </button>
        <button
          class="history-btn"
          type="button"
          :disabled="!latestMapData || streaming || historyGenerating || historySaving"
          :title="historyDraft ? '重新整理当前地图的历史草案' : '从当前地图整理历史草案'"
          @click="handleBuildHistory"
        >
          <svg v-if="historyGenerating" class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M8 7h8M8 11h6"/></svg>
          {{ historyGenerating ? '整理历史...' : (historyDraft ? '重整历史草案' : (semanticReviewSites.length ? '整理历史草案' : '检查地理语义')) }}
        </button>
      </div>
    </div>

    <!-- AI error -->
    <div v-if="aiError" class="ai-error">{{ aiError }}</div>
    <div v-else-if="aiWarnings.length > 0" class="ai-error ai-warning">
      {{ aiWarnings.join('；') }}
    </div>

    <div v-if="historyError" class="history-status history-status--error" role="status">
      {{ historyError }}
    </div>

    <section
      v-if="semanticReviewSites.length > 0"
      class="semantic-review-panel"
      data-test="semantic-review-panel"
      aria-labelledby="semantic-review-title"
    >
      <div class="semantic-review-heading">
        <div>
          <span class="history-draft-kicker">地理筛选</span>
          <h3 id="semantic-review-title">先挑出真正影响历史的地点</h3>
        </div>
        <span class="history-draft-count">{{ selectedSemanticSiteCount }} / {{ semanticReviewSites.length }} 已选</span>
      </div>
      <p class="semantic-review-summary">
        默认保留高分且覆盖不同地理类型的候选。取消不重要的点，它们就不会进入本次历史草案。
      </p>
      <div class="semantic-review-list">
        <label
          v-for="site in semanticReviewSites"
          :key="site.id"
          class="semantic-review-item"
          :class="{ 'is-selected': selectedSemanticSiteIds.has(site.id) }"
        >
          <input
            type="checkbox"
            :checked="selectedSemanticSiteIds.has(site.id)"
            @change="toggleSemanticSite(site.id, $event.target.checked)"
          >
          <span class="semantic-review-copy">
            <strong>{{ site.title || site.name || site.id }}</strong>
            <small>{{ site.type || '地理语义' }} · {{ site.score || 0 }} 分</small>
          </span>
        </label>
      </div>
    </section>

    <section v-if="historyDraft" class="history-draft-panel" aria-labelledby="history-draft-title">
      <div class="history-draft-heading">
        <div>
          <span class="history-draft-kicker">地理 · 历史</span>
          <h3 id="history-draft-title">历史草案</h3>
        </div>
        <span class="history-draft-count">{{ historyDraftNodes }} 节点 · {{ historyDraftSites }} 个语义点 · {{ historyDraftPlaces }} 个地点</span>
      </div>
      <p class="history-draft-summary">
        {{ historySaved ? '已写入当前世界书。' : '草案已生成，确认后写入当前世界书。' }}
        <span v-if="existingHistoryCount">当前已有 {{ existingHistoryCount }} 个历史节点。</span>
      </p>
      <div class="history-draft-actions">
        <button class="toolbar-text-btn" type="button" :disabled="historyGenerating || historySaving" @click="handleBuildHistory">
          重新整理
        </button>
        <button class="primary-btn-sm" type="button" :disabled="historySaving || historySaved" @click="handleSaveHistory">
          {{ historySaving ? '写入中...' : (historySaved ? '已写入历史' : (existingHistoryCount ? '覆盖并写入历史' : '写入世界历史')) }}
        </button>
      </div>
    </section>

    <section
      v-if="placeEntities.length > 0"
      class="place-entity-panel"
      data-test="place-entity-panel"
      aria-labelledby="place-entity-title"
    >
      <div class="place-entity-heading">
        <div>
          <span class="history-draft-kicker">地点实体</span>
          <h3 id="place-entity-title">地图与历史的共同入口</h3>
        </div>
        <span class="history-draft-count">{{ placeEntities.length }} 个地点</span>
      </div>
      <div v-if="focusedPlaceEntity" class="place-focus-summary" data-test="place-focus-summary">
        <div>
          <span class="history-draft-kicker">已定位地点</span>
          <strong>{{ focusedPlaceEntity.name || focusedPlaceEntity.placeId }}</strong>
          <small v-if="focusedHistoryNode" class="place-focus-detail">历史节点 · {{ focusedHistoryNode.title || focusedHistoryNode.id }}</small>
          <small v-else-if="focusedEntry" class="place-focus-detail">设定条目 · {{ focusedEntry.name || focusedEntry.id }}</small>
        </div>
        <button type="button" class="toolbar-text-btn" @click="emit('open-settings', focusedPlaceEntity.placeId)">
          查看设定
        </button>
      </div>
      <div class="place-entity-list">
        <article
          v-for="entity in placeEntities"
          :key="entity.placeId"
          class="place-entity-row"
          :class="{ 'is-focused': entity.placeId === focusPlaceId }"
        >
          <div class="place-entity-copy">
            <strong>{{ entity.name || entity.placeId }}</strong>
            <span>{{ entity.semanticType || '地点' }} · 历史 {{ entity.historyNodeIds?.length || 0 }} · 条目 {{ entity.entryIds?.length || 0 }}</span>
          </div>
          <button
            type="button"
            class="toolbar-text-btn"
            :disabled="!buildPlaceRuntimePatch(entity)"
            @click="handleEnterPlace(entity)"
          >
            进入当前地点
          </button>
        </article>
      </div>
    </section>

    <!-- AI streaming progress -->
    <div v-if="streaming" class="ai-progress">
      <div class="progress-header">
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        AI 正在分析世界设定，生成地图参数...
      </div>
      <div class="progress-preview">{{ streamOutput.slice(0, 200) }}{{ streamOutput.length > 200 ? '...' : '' }}</div>
    </div>

    <!-- Main content: world tree + map -->
    <div class="main-content">
      <WorldTreeSidebar />
      <div class="map-area">
        <WorldMapVoronoi
          :config="voronoiConfig"
          :markers="markers"
          @map-generated="onMapGenerated"
          @config-change="handleConfigChange"
          @add-marker="handleAddMarker"
          @update-marker="handleUpdateMarker"
          @delete-marker="handleDeleteMarker"
          @marker-drag-end="handleMarkerDragEnd"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import { useWorldStore } from '../../stores/worldStore'
import { buildVoronoiMapPrompt, mergeNameSeeds, parseVoronoiMapConfig } from '../../services/ai/voronoiMapAdapter'
import { extractMapSeedsFromWorldbook } from '../../services/ai/worldbookMapBridge'
import { getResolvedApiSettings } from '../../services/api'
import { runGenerationTask } from '../../services/generationService'
import { extractMapSemantics } from '../../services/worldHistory/mapSemantics'
import { buildGeoHistoryDraft, selectSemanticSitesForReview } from '../../services/worldHistory/geoHistoryPipeline'
import { buildPlaceEntityIndex, buildPlaceRuntimePatch, resolvePlaceEntity } from '../../services/worldHistory/placeEntity'
import WorldTreeSidebar from './WorldTreeSidebar.vue'
import WorldMapVoronoi from './WorldMapVoronoi.vue'
import { useGameStore } from '../../stores/gameStore'

const props = defineProps({
  focusPlaceId: {
    type: String,
    default: ''
  },
  focusHistoryNodeId: {
    type: String,
    default: ''
  },
  focusEntryId: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['open-settings'])

const geoStore = useGeographyStore()
const { overview, locations, activeWorldNode: activeNode, voronoiConfig, markers } = storeToRefs(geoStore)
const worldStore = useWorldStore()
const gameStore = useGameStore()

const viewMode = ref('voronoi')
const streaming = ref(false)
const streamOutput = ref('')
const aiError = ref(null)
const aiWarnings = ref([])
const latestMapData = shallowRef(null)
const historyDraft = ref(null)
const historyGenerating = ref(false)
const historySaving = ref(false)
const historyError = ref('')
const historySaved = ref(false)
const semanticReviewSites = ref([])
const selectedSemanticSiteIds = ref(new Set())

const activeWorldbook = computed(() => worldStore.activeWorldbook)
const historyDraftNodes = computed(() => historyDraft.value?.nodes?.length || 0)
const historyDraftSites = computed(() => historyDraft.value?.semanticSiteCount || 0)
const historyDraftPlaces = computed(() => historyDraft.value?.placeRefs?.length || 0)
const selectedSemanticSiteCount = computed(() => selectedSemanticSiteIds.value.size)
const existingHistoryCount = computed(() => activeWorldbook.value?.geoHistory?.nodes?.length || 0)
const placeEntityIndex = computed(() => buildPlaceEntityIndex(activeWorldbook.value || {}))
const placeEntities = computed(() => placeEntityIndex.value.entities)
const focusPlaceId = computed(() => props.focusPlaceId)
const focusedPlaceEntity = computed(() => resolvePlaceEntity(placeEntityIndex.value, props.focusPlaceId))
const focusedHistoryNode = computed(() => focusedPlaceEntity.value?.historyNodes?.find(
  (node) => String(node?.id || '') === String(props.focusHistoryNodeId || '')
) || null)
const focusedEntry = computed(() => focusedPlaceEntity.value?.entries?.find(
  (entry) => String(entry?.id || '') === String(props.focusEntryId || '')
) || null)

async function handleGenerate() {
  streaming.value = true
  aiError.value = null
  aiWarnings.value = []
  streamOutput.value = ''

  try {
    await worldStore.loadWorldbooksIndex()
    const activeWorldbook = await worldStore.ensureActiveWorldbook()
    const worldbookBridge = extractMapSeedsFromWorldbook(activeWorldbook)
    const messages = buildVoronoiMapPrompt(null, overview.value, locations.value, worldbookBridge)

    const settings = await getResolvedApiSettings()
    if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
      aiError.value = '未检测到可用 AI 配置'
      streaming.value = false
      return
    }

    const result = await runGenerationTask({
      taskType: 'geography.voronoi-map',
      baseMessages: messages,
      settings,
      generationOptions: { temperature: 0.7, max_tokens: 4000 },
      attempts: [{ name: 'voronoi-map' }],
    })

    const raw = result?.parsed || result?.content || ''
    if (!raw) {
      streaming.value = false
      return
    }

    const parsed = parseVoronoiMapConfig(raw)
    if (!parsed.ok) {
      aiError.value = `AI 返回无效 JSON：${parsed.message}`
      aiWarnings.value = []
      return
    }
    aiWarnings.value = parsed.warnings
    const config = parsed.config
    const stateCount = config.stateCount || 8
    config.stateNames = mergeNameSeeds(worldbookBridge.stateNames, config.stateNames, Math.ceil(stateCount * 1.5))
    config.burgNames = mergeNameSeeds(worldbookBridge.burgNames, config.burgNames, stateCount * 4)
    config.riverNames = mergeNameSeeds(worldbookBridge.riverNames, config.riverNames, stateCount)
    config.constraints = mergeMapConstraints(worldbookBridge.constraints, config.constraints)
    if (activeNode.value) {
      config.mapName = activeNode.value.name
    }
    geoStore.saveVoronoiConfig(config)
  } catch (err) {
    console.error('Failed to generate Voronoi config:', err)
    aiError.value = err.message || '生成失败'
  } finally {
    streaming.value = false
  }
}

function mergeMapConstraints(primary = {}, secondary = {}) {
  const constraints = {}
  const mountains = mergeNamedConstraintList(primary?.mountains, secondary?.mountains)
  const stateSeeds = mergeNamedConstraintList(primary?.stateSeeds, secondary?.stateSeeds)
  if (mountains.length) constraints.mountains = mountains
  if (stateSeeds.length) constraints.stateSeeds = stateSeeds
  return Object.keys(constraints).length ? constraints : undefined
}

function mergeNamedConstraintList(primary = [], secondary = []) {
  const result = []
  const seen = new Set()
  for (const item of [...(primary || []), ...(secondary || [])]) {
    const name = String(item?.name || '').trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('zh-Hans-CN')
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ ...item, name })
  }
  return result
}

function onMapGenerated(payload) {
  latestMapData.value = payload?.data || null
  historyDraft.value = null
  semanticReviewSites.value = []
  selectedSemanticSiteIds.value = new Set()
  historyError.value = ''
  historySaved.value = false
  if (payload?.meta) {
    if (typeof geoStore.setLastGenerationMeta === 'function') {
      geoStore.setLastGenerationMeta(payload.meta)
    } else {
      geoStore.lastGenerationMeta = payload.meta
      if (typeof geoStore.persistMapData === 'function') {
        geoStore.persistMapData()
      }
    }
  }
}

async function handleBuildHistory() {
  if (!latestMapData.value || historyGenerating.value) return

  if (semanticReviewSites.value.length === 0) {
    const mapSemantics = extractMapSemantics(latestMapData.value)
    const candidates = selectSemanticSitesForReview(mapSemantics, { maxSites: 24 })
    if (candidates.length === 0) {
      historyError.value = '当前地图没有提取出可审阅的地理语义点。'
      return
    }
    semanticReviewSites.value = candidates
    selectedSemanticSiteIds.value = new Set(candidates.map((site) => site.id))
    historyError.value = ''
    return
  }

  historyGenerating.value = true
  historyError.value = ''
  historySaved.value = false

  try {
    const activeWorldbook = worldStore.activeWorldbook || await worldStore.ensureActiveWorldbook()
    const result = buildGeoHistoryDraft({
      worldbook: activeWorldbook,
      mapData: latestMapData.value,
      seed: latestMapData.value.seed || geoStore.lastGenerationMeta?.seed,
      mapId: activeNode.value?.id ? `map-${activeNode.value.id}-${latestMapData.value.seed || 'current'}` : undefined,
      selectedSiteIds: [...selectedSemanticSiteIds.value]
    })
    if (!result.ok) {
      historyDraft.value = null
      historyError.value = result.message
      return
    }
    historyDraft.value = result.geoHistory
  } catch (error) {
    historyDraft.value = null
    historyError.value = error?.message || '历史草案生成失败'
  } finally {
    historyGenerating.value = false
  }
}

function toggleSemanticSite(siteId, checked) {
  const next = new Set(selectedSemanticSiteIds.value)
  if (checked) next.add(siteId)
  else next.delete(siteId)
  selectedSemanticSiteIds.value = next
  historySaved.value = false
  historyDraft.value = null
}

async function handleSaveHistory() {
  if (!historyDraft.value || historySaving.value || historySaved.value) return
  if (existingHistoryCount.value && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm('当前世界书已有地理历史，确认用这份草案覆盖吗？')) return
  }

  historySaving.value = true
  historyError.value = ''
  try {
    const activeWorldbook = worldStore.activeWorldbook || await worldStore.ensureActiveWorldbook()
    if (!activeWorldbook?.id) throw new Error('当前没有可写入的世界书')
    await worldStore.updateWorldbook(activeWorldbook.id, { geoHistory: historyDraft.value })
    historySaved.value = true
  } catch (error) {
    historyError.value = error?.message || '历史草案写入失败'
  } finally {
    historySaving.value = false
  }
}

function handleEnterPlace(entity) {
  const patch = buildPlaceRuntimePatch(entity)
  if (!patch) return
  gameStore.saveWorldMapState({
    ...(gameStore.worldMapState || {}),
    ...patch
  })
  gameStore.setHistoryNode(entity.latestHistoryNode || null)
  gameStore.appendRuntimeEvent({
    type: 'display_event',
    source: 'runtime',
    payload: {
      kind: 'place-entity-selected',
      placeId: entity.placeId,
      historyNodeIds: entity.historyNodeIds,
      entryIds: entity.entryIds,
      contextual: false
    }
  })
  gameStore.saveCurrentSession()
}

function handleConfigChange(config) {
  geoStore.saveVoronoiConfig(config)
}

function handleAddMarker(x, y, patch = {}) {
  geoStore.addMarker({
    id: patch.id || 'mk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: patch.name || `新标记 ${markers.value.length + 1}`,
    x, y,
    type: patch.type || 'custom',
    importance: patch.importance || 2,
    userAdded: true,
    ...patch,
  })
}

function handleUpdateMarker(id, patch) {
  geoStore.updateMarker(id, patch)
}

function handleDeleteMarker(id) {
  geoStore.deleteMarker(id)
}

function handleMarkerDragEnd(id, x, y) {
  geoStore.updateMarker(id, { x, y })
}

// Load geography data on mount
onMounted(() => {
  geoStore.loadAll()
})
</script>

<style scoped>
.world-map-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.active-world-name {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
  /* W5 UX sweep: constrain long world names to 200px so the
     toolbar-right buttons (3D / generate / etc.) are never pushed
     off-screen by a renamed-active-node. Native :title attr gives
     users the full name on hover/AT. */
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.toolbar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.view-toggle {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 2px;
  border: 1px solid var(--border);
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.toggle-btn:hover { color: var(--text-primary); }
.toggle-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary)); }
.toggle-btn.disabled { opacity: 0.4; }

.generate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.generate-btn:hover { background: var(--accent-hover); }
.generate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.history-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.history-btn:hover { background: color-mix(in srgb, var(--accent) 16%, var(--bg-secondary)); }
.history-btn:disabled { opacity: 0.42; cursor: not-allowed; }

.ai-error {
  margin-bottom: 12px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  border-radius: 8px;
  font-size: 12px;
  color: var(--danger);
}

.ai-warning {
  /* W5b UX sweep: switch raw #f59e0b / #b45309 (warm orange) to
     var(--warning) so dark-mode + theme-legacy stay on-palette and
     WCAG-AA contrast holds (dark kao paper #b45309 ≈ 2.7:1 fail). */
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  border-color: color-mix(in srgb, var(--warning) 24%, transparent);
  color: var(--warning);
}

.history-status {
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.history-status--error {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 24%, transparent);
  color: var(--warning);
}

.semantic-review-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-panel) 94%, var(--accent));
}

.semantic-review-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.semantic-review-heading h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.semantic-review-summary {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.semantic-review-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 6px;
}

.semantic-review-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.semantic-review-item:hover,
.semantic-review-item.is-selected {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}

.semantic-review-item input {
  flex: 0 0 auto;
  accent-color: var(--accent);
}

.semantic-review-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.semantic-review-copy strong,
.semantic-review-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-review-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.semantic-review-copy small {
  color: var(--text-muted);
  font-size: 10px;
}

.history-draft-panel {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-panel));
}

.history-draft-heading,
.history-draft-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.history-draft-kicker {
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.history-draft-heading h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.history-draft-count,
.history-draft-summary {
  color: var(--text-muted);
  font-size: 12px;
}

.history-draft-summary {
  margin: 8px 0 12px;
}

.history-draft-actions {
  justify-content: flex-end;
}

.place-entity-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 4%, var(--surface-panel));
}

.place-entity-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.place-entity-heading h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.place-focus-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 9%, var(--surface-panel));
}

.place-focus-summary > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.place-focus-detail {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-focus-summary strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-entity-list {
  display: grid;
  gap: 6px;
}

.place-entity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.place-entity-row.is-focused {
  padding-right: 8px;
  padding-left: 8px;
  border-top-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.place-entity-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.place-entity-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-entity-copy span {
  color: var(--text-muted);
  font-size: 11px;
}

.ai-progress {
  margin-bottom: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 4px;
}

.progress-preview {
  font-size: 11px;
  color: var(--text-muted);
  max-height: 80px;
  overflow-y: auto;
  font-family: monospace;
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: var(--surface-soft);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--shadow) 58%, transparent);
}

.map-area {
  flex: 1;
  min-width: 0;
  padding: 4px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-soft) 92%, var(--bg-secondary)), var(--surface-panel));
}

:global(.theme-legacy) .main-content {
  border-color: color-mix(in srgb, var(--archive-ink) 18%, var(--border));
  background: var(--archive-paper-soft);
  box-shadow: none;
}

:global(.theme-legacy) .map-area {
  background: var(--archive-paper-soft);
}

@media (max-width: 760px) {
  .panel-toolbar {
    align-items: flex-start;
  }

  .panel-title {
    width: 100%;
  }

  .toolbar-right {
    width: 100%;
    justify-content: flex-start;
  }

  .history-btn {
    margin-left: auto;
  }

  .main-content {
    min-height: 0;
  }
}
</style>
