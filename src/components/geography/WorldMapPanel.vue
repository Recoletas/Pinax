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
        <button
          type="button"
          class="source-chip"
          :title="activeWorldbook ? `当前世界书：${activeWorldbook.name}` : '正在加载世界书'"
          @click="atlasToolsOpen = true"
        >
          <span class="source-chip__dot" aria-hidden="true"></span>
          <span>{{ activeWorldbook?.name || '读取世界书' }}</span>
          <strong>{{ placeInventory.length }}</strong>
        </button>
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

        <button class="generate-btn" @click="handleGenerate" :disabled="streaming || Boolean(pendingMapReplacement)">
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
          :disabled="!latestMapData || streaming || historyGenerating || historySaving || Boolean(pendingMapReplacement)"
          :title="historyDraft ? '重新整理当前地图的历史草案' : '从当前地图整理历史草案'"
          @click="handleBuildHistory"
        >
          <svg v-if="historyGenerating" class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M8 7h8M8 11h6"/></svg>
          {{ historyGenerating ? '整理历史...' : (historyDraft ? '重整历史草案' : (semanticReviewSites.length ? '整理历史草案' : '检查地理语义')) }}
        </button>
        <button
          class="atlas-tools-trigger"
          type="button"
          :class="{ active: atlasToolsOpen }"
          :aria-expanded="atlasToolsOpen"
          aria-controls="atlas-tools-panel"
          @click="atlasToolsOpen = !atlasToolsOpen"
        >
          地图资料
        </button>
      </div>
    </div>

    <!-- AI error -->
    <div v-if="aiError" class="ai-error">{{ aiError }}</div>
    <div v-else-if="aiWarnings.length > 0" class="ai-error ai-warning">
      {{ aiWarnings.join('；') }}
    </div>

    <aside
      v-show="atlasToolsOpen"
      id="atlas-tools-panel"
      class="atlas-tools"
      aria-label="地图资料与世界书绑定"
    >
      <div class="atlas-tools__header">
        <div>
          <span>ATLAS SOURCES</span>
          <strong>地图资料</strong>
        </div>
        <button type="button" class="atlas-tools__close" title="关闭地图资料" @click="atlasToolsOpen = false">×</button>
      </div>
      <div class="atlas-tools__body">
    <div v-if="activeWorldbook" class="worldbook-source-status" data-test="worldbook-source-status">
      <label class="worldbook-source-picker">
        <span class="worldbook-source-status__label">世界书来源</span>
        <select
          data-test="worldbook-source-select"
          :value="activeWorldbook.id"
          :disabled="worldbookRefreshing || Boolean(pendingMapReplacement)"
          @change="switchWorldbookSource($event.target.value)"
        >
          <option v-for="worldbook in worldbooksIndex" :key="worldbook.id" :value="worldbook.id">
            {{ worldbook.name }}
          </option>
        </select>
      </label>
      <span>{{ placeInventory.length }} 个地点已读取</span>
      <span v-if="placeInventory.length === 0" class="worldbook-source-status__muted">当前世界书还没有明确地点条目</span>
      <span class="worldbook-source-status__actions">
        <button type="button" class="toolbar-text-btn" :disabled="worldbookRefreshing" @click="refreshWorldbookSource">
          {{ worldbookRefreshing ? '读取中...' : '重新读取' }}
        </button>
        <button type="button" class="toolbar-text-btn" @click="emit('open-worldbook')">导入或管理</button>
      </span>
    </div>
    <div v-else class="worldbook-source-status worldbook-source-status--empty" data-test="worldbook-source-status">
      正在加载当前世界书地点...
    </div>

    <div v-if="historyError" class="history-status history-status--error" role="status">
      {{ historyError }}
    </div>

    <div v-if="placeBindingError" class="history-status history-status--error" role="status">
      {{ placeBindingError }}
    </div>

    <section
      v-if="pendingMapReplacement"
      class="map-replacement-review"
      data-test="map-replacement-review"
      aria-labelledby="map-replacement-title"
    >
      <div class="place-binding-heading">
        <div>
          <span class="history-draft-kicker">MAP REVISION</span>
          <h3 id="map-replacement-title">确认新地图版本</h3>
        </div>
        <span class="history-draft-count">{{ pendingMapReplacement.review.items.length }} 个确认地点</span>
      </div>
      <p class="place-binding-summary">当前画布仍是原版本。逐项确认地点迁移后，新地图、配置和绑定才会一起提交。</p>
      <div class="map-replacement-summary">
        <span>{{ pendingMapReplacement.review.summary.kept }} 保持</span>
        <span>{{ pendingMapReplacement.review.summary.moved }} 移动</span>
        <span :class="{ 'is-warning': pendingMapReplacement.review.summary.conflict }">{{ pendingMapReplacement.review.summary.conflict }} 冲突</span>
        <span :class="{ 'is-warning': pendingMapReplacement.review.summary.unmatched }">{{ pendingMapReplacement.review.summary.unmatched }} 失配</span>
      </div>
      <div class="map-replacement-list">
        <label v-for="item in pendingMapReplacement.review.items" :key="item.entryId" class="map-replacement-item">
          <span class="map-replacement-item__copy">
            <strong>{{ item.name }}</strong>
            <small>{{ replacementStatusLabel(item.status) }} · {{ item.reason }}</small>
          </span>
          <select v-model="replacementChoices[item.entryId]" class="map-replacement-select">
            <option v-if="item.suggested" value="remap">采用新位置</option>
            <option value="keep">保留旧位置待确认</option>
            <option value="unbound">暂不落图</option>
          </select>
        </label>
      </div>
      <div class="history-draft-actions">
        <button type="button" class="toolbar-text-btn" :disabled="mapReplacementSaving" @click="discardMapReplacement">放弃新图</button>
        <button type="button" class="primary-btn-sm" :disabled="mapReplacementSaving" @click="commitMapReplacement">
          {{ mapReplacementSaving ? '提交中...' : '提交新版本' }}
        </button>
      </div>
    </section>

    <section v-if="mapVersions.length" class="map-version-panel" data-test="map-version-panel">
      <div class="place-binding-heading">
        <div>
          <span class="history-draft-kicker">VERSION HISTORY</span>
          <h3>地图版本</h3>
        </div>
        <span class="history-draft-count">保留最近 {{ mapVersions.length }} 版</span>
      </div>
      <div class="map-version-list">
        <div v-for="version in mapVersions" :key="version.id" class="map-version-row" :class="{ active: version.id === activeMapRevision }">
          <span>
            <strong>{{ version.seed }}</strong>
            <small>{{ formatMapVersionTime(version.createdAt) }}<template v-if="version.reviewSummary"> · {{ version.reviewSummary.moved || 0 }} 移动 / {{ version.reviewSummary.conflict || 0 }} 冲突</template></small>
          </span>
          <button v-if="version.id !== activeMapRevision" type="button" class="toolbar-text-btn" :disabled="mapVersionRestoring" @click="restoreMapVersion(version.id)">恢复</button>
          <b v-else>当前</b>
        </div>
      </div>
    </section>

    <section
      v-if="constraintReport && (constraintReport.satisfied.length || constraintReport.relaxed.length || constraintReport.impossible.length)"
      class="constraint-report"
      data-test="constraint-report"
      aria-live="polite"
    >
      <span class="history-draft-kicker">地图约束</span>
      <strong>{{ constraintReport.satisfied.length }} 已满足</strong>
      <span>{{ constraintReport.relaxed.length }} 已放宽</span>
      <span v-if="constraintReport.impossible.length" class="is-impossible">{{ constraintReport.impossible.length }} 无法满足</span>
      <ul v-if="constraintIssues.length" class="constraint-report__issues">
        <li v-for="(item, index) in constraintIssues" :key="`${item.kind}:${item.name}:${index}`">
          <b>{{ item.level === 'impossible' ? '冲突' : '放宽' }}</b>
          <span>{{ item.name }}：{{ item.reason }}</span>
        </li>
      </ul>
    </section>

    <section
      v-if="placeInventory.length > 0"
      class="place-binding-panel"
      data-test="place-binding-panel"
      aria-labelledby="place-binding-title"
    >
      <div class="place-binding-heading">
        <div>
          <span class="history-draft-kicker">世界书 · 地图</span>
          <h3 id="place-binding-title">地点绑定</h3>
        </div>
        <span class="history-draft-count">
          {{ placeInventory.length }} 个地点 · {{ placeInventorySummary.confirmed || 0 }} 已确认
        </span>
      </div>
      <p class="place-binding-summary">
        地图上的预览点不等于正式绑定。确认后，地点才会作为稳定空间引用进入历史与体验。
      </p>
      <div class="place-binding-list">
        <article
          v-for="place in placeInventory"
          :key="place.id"
          class="place-binding-row"
          :class="`is-${place.status}`"
        >
          <div class="place-binding-copy">
            <strong>{{ place.name }}</strong>
            <span>{{ place.kind }} · {{ place.source === 'provisional' ? '地理正文推断' : '世界书来源' }}</span>
            <small v-if="place.evidence" class="place-binding-copy__evidence" :title="place.evidence">出处：{{ place.evidence }}</small>
            <small v-if="place.relationSummary" class="place-binding-copy__relations">{{ place.relationSummary }}</small>
            <small>{{ place.matchReason }}</small>
          </div>
          <div class="place-binding-actions">
            <button
              v-if="place.markerId"
              type="button"
              class="toolbar-text-btn"
              @click="focusPlaceOnMap(place)"
            >
              定位
            </button>
            <button
              v-if="place.canFormalize"
              type="button"
              class="toolbar-text-btn place-binding-confirm"
              :disabled="placeBindingSaving === place.id"
              @click="formalizeExtractedPlace(place)"
            >
              {{ placeBindingSaving === place.id ? '建立中...' : '建立正式条目' }}
            </button>
            <button
              v-if="place.canConfirm && place.status !== 'confirmed'"
              type="button"
              class="toolbar-text-btn place-binding-confirm"
              :disabled="placeBindingSaving === place.id"
              @click="confirmPlaceBinding(place)"
            >
              {{ placeBindingSaving === place.id ? '保存中...' : '确认绑定' }}
            </button>
            <button
              v-if="place.canClear"
              type="button"
              class="toolbar-text-btn"
              :disabled="placeBindingSaving === place.id"
              @click="clearPlaceBinding(place)"
            >
              解除
            </button>
          </div>
        </article>
      </div>
    </section>

    <section
      v-if="mapNativePlaces.length > 0"
      class="place-binding-panel"
      data-test="map-native-place-panel"
      aria-labelledby="map-native-place-title"
    >
      <div class="place-binding-heading">
        <div>
          <span class="history-draft-kicker">地图原生地点</span>
          <h3 id="map-native-place-title">保留或纳入世界书</h3>
        </div>
        <span class="history-draft-count">{{ mapNativePlaces.length }} 个 · 默认仅属于当前地图</span>
      </div>
      <p class="place-binding-summary">
        这些聚落由地形和交通条件生成，不自动成为设定。选择“纳入世界书”后才建立正式地点条目与稳定绑定。
      </p>
      <div class="place-binding-list">
        <article
          v-for="place in mapNativePlaces"
          :key="place.id"
          class="place-binding-row"
          :class="place.status === 'linked' ? 'is-confirmed' : 'is-map-only'"
        >
          <div class="place-binding-copy">
            <strong>{{ place.name }}</strong>
            <span>{{ mapNativeKindLabel(place.kind) }}<template v-if="place.stateName"> · {{ place.stateName }}</template></span>
            <small>{{ place.status === 'linked' ? '已由正式世界书地点接管' : place.status === 'previewed' ? '正在被正文提取候选预览，尚未成为正式设定' : '地图生成地点，尚未写入设定' }}</small>
          </div>
          <div class="place-binding-actions">
            <button type="button" class="toolbar-text-btn" @click="focusNativePlace(place)">定位</button>
            <button
              v-if="place.canPromote"
              type="button"
              class="toolbar-text-btn"
              :disabled="nativePlaceSaving === place.id"
              @click="promoteNativePlace(place)"
            >
              {{ nativePlaceSaving === place.id ? '写入中...' : '纳入世界书' }}
            </button>
            <span v-else class="place-binding-state">{{ place.status === 'linked' ? '已关联' : '候选预览' }}</span>
          </div>
        </article>
      </div>
    </section>

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
        默认只保留有明确名称、彼此不重叠且可能影响历史的地点或通道；无名地形仅用于地图分析，不会进入历史草案。
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
      </div>
    </aside>

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
          ref="mapRendererRef"
          :config="displayedVoronoiConfig"
          :markers="markers"
          :focus-marker-id="focusMarkerId"
          :review-before-commit="confirmedBindingCount > 0"
          @map-generated="onMapGenerated"
          @map-replacement-ready="onMapReplacementReady"
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
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import { useWorldStore } from '../../stores/worldStore'
import { buildVoronoiMapPrompt, parseVoronoiMapConfig } from '../../services/ai/voronoiMapAdapter'
import { buildMapNativePlaceInventory, buildWorldbookLocationMarkers, buildWorldbookPlaceInventory, compileWorldbookMapConstraints, describeNativePlaceForPromotion, extractMapSeedsFromWorldbook, mapNativeKindLabel } from '../../services/ai/worldbookMapBridge'
import { getResolvedApiSettings } from '../../services/api'
import { runGenerationTask } from '../../services/generationService'
import { extractMapSemantics } from '../../services/worldHistory/mapSemantics'
import { buildGeoHistoryDraft, buildWorldbookSemanticSites, collectWorldbookPlaceNames, selectSemanticSitesForReview } from '../../services/worldHistory/geoHistoryPipeline'
import { buildPlaceEntityIndex, buildPlaceRuntimePatch, resolvePlaceEntity } from '../../services/worldHistory/placeEntity'
import { applyMapReplacementChoices, buildMapReplacementReview, createMapRevision } from '../../services/world-map/mapVersioning'
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
const emit = defineEmits(['open-settings', 'open-worldbook'])

const geoStore = useGeographyStore()
const { overview, locations, activeWorldNode: activeNode, voronoiConfig, markers, mapVersions, activeMapRevision } = storeToRefs(geoStore)
const worldStore = useWorldStore()
const { worldbooksIndex } = storeToRefs(worldStore)
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
const constraintReport = shallowRef(null)
const semanticReviewSites = ref([])
const selectedSemanticSiteIds = ref(new Set())
const focusMarkerId = ref('')
const placeBindingError = ref('')
const placeBindingSaving = ref('')
const nativePlaceSaving = ref('')
const atlasToolsOpen = ref(false)
const worldbookRefreshing = ref(false)
const pendingVoronoiConfig = shallowRef(null)
const pendingMapReplacement = shallowRef(null)
const replacementChoices = ref({})
const mapReplacementSaving = ref(false)
const mapVersionRestoring = ref(false)
const mapRendererRef = ref(null)
let pendingVersionCommit = null
let restoringRevisionId = ''

const activeWorldbook = computed(() => worldStore.activeWorldbook)
const displayedVoronoiConfig = computed(() => pendingVoronoiConfig.value || voronoiConfig.value)
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
const placeInventory = computed(() => buildWorldbookPlaceInventory(
  activeWorldbook.value || {},
  { mapData: latestMapData.value, markers: markers.value }
))
const mapNativePlaces = computed(() => buildMapNativePlaceInventory(
  latestMapData.value,
  activeWorldbook.value || {},
  markers.value,
))
const placeInventorySummary = computed(() => placeInventory.value.reduce((summary, place) => {
  summary[place.status] = (summary[place.status] || 0) + 1
  return summary
}, {}))
const constraintIssues = computed(() => [
  ...(constraintReport.value?.impossible || []).map((item) => ({ ...item, level: 'impossible' })),
  ...(constraintReport.value?.relaxed || []).map((item) => ({ ...item, level: 'relaxed' })),
].slice(0, 6))
const confirmedBindingCount = computed(() => (activeWorldbook.value?.entries || [])
  .filter((entry) => entry?.mapBinding?.status === 'confirmed').length)

async function handleGenerate() {
  if (pendingMapReplacement.value) {
    atlasToolsOpen.value = true
    return
  }
  streaming.value = true
  aiError.value = null
  aiWarnings.value = []
  streamOutput.value = ''

  try {
    await worldStore.loadWorldbooksIndex()
    const activeWorldbook = await worldStore.ensureActiveWorldbook()
    const worldbookBridge = extractMapSeedsFromWorldbook(activeWorldbook)
    const compiledWorldbook = compileWorldbookMapConstraints(activeWorldbook, { mapData: latestMapData.value })
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
      // 地图专用 prompt 已做分段压缩；显式给服务器留出完整 system
      // prompt 的预算，避免被通用聊天上下文裁剪器截掉 JSON 契约。
      generationOptions: {
        temperature: 0.7,
        max_tokens: 4000,
        max_input_chars: 14000,
      },
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
    // AI defines geography, not the application's visual appearance. Preserve
    // the current map style so regeneration cannot unexpectedly turn a light
    // workspace into the near-black `dark` preset.
    config.stylePreset = voronoiConfig.value?.stylePreset || 'topographic'
    stripAuthoredPlaceNamesFromConfig(config, worldbookBridge)
    // Imported place names are not a sequential naming pool. Unconfirmed places
    // first map to real geographic candidates in the review rail; only confirmed
    // bindings become engine constraints and may create or move map objects.
    config.constraints = mergeMapConstraints(compiledWorldbook.constraints)
    if (activeNode.value) {
      config.mapName = activeNode.value.name
    }
    // Candidate configs only become persistent after the worker and renderer
    // have both produced a usable replacement map.
    pendingVoronoiConfig.value = config
  } catch (err) {
    console.error('Failed to generate Voronoi config:', err)
    aiError.value = err.message || '生成失败'
  } finally {
    streaming.value = false
  }
}

function stripAuthoredPlaceNamesFromConfig(config, worldbookBridge) {
  const authoredNames = new Set((Array.isArray(worldbookBridge?.locations) ? worldbookBridge.locations : [])
    .map((location) => normalizeMapPoolName(location?.name))
    .filter(Boolean))
  if (!authoredNames.size) return
  for (const key of ['stateNames', 'burgNames', 'riverNames']) {
    if (!Array.isArray(config[key])) continue
    const filtered = config[key].filter((name) => !authoredNames.has(normalizeMapPoolName(name)))
    if (filtered.length) config[key] = filtered
    else delete config[key]
  }
}

function normalizeMapPoolName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('zh-Hans-CN')
    .replace(/[\s·・_-]+/g, '')
}

function mergeMapConstraints(...sources) {
  const constraints = {}
  const mountains = mergeNamedConstraintList(...sources.map(source => source?.mountains))
  const stateSeeds = mergeNamedConstraintList(...sources.map(source => source?.stateSeeds))
  const locations = mergeNamedConstraintList(...sources.map(source => source?.locations))
  const anchors = mergeNamedConstraintList(...sources.map(source => source?.anchors))
  const rivers = mergeNamedConstraintList(...sources.map(source => source?.rivers))
  const routes = mergeNamedConstraintList(...sources.map(source => source?.routes))
  if (mountains.length) constraints.mountains = mountains
  if (stateSeeds.length) constraints.stateSeeds = stateSeeds
  if (locations.length) constraints.locations = locations
  if (anchors.length) constraints.anchors = anchors
  if (rivers.length) constraints.rivers = rivers
  if (routes.length) constraints.routes = routes
  return Object.keys(constraints).length ? constraints : undefined
}

function mergeNamedConstraintList(...lists) {
  const result = []
  const seen = new Set()
  for (const item of lists.flatMap(list => Array.isArray(list) ? list : [])) {
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
  constraintReport.value = payload?.data?.constraintReport || null
  const hadPendingConfig = Boolean(pendingVoronoiConfig.value)
  const committedConfig = payload?.config || pendingVoronoiConfig.value || voronoiConfig.value || {}
  pendingVoronoiConfig.value = null
  if (pendingVersionCommit?.manualMarkers) geoStore.markers = pendingVersionCommit.manualMarkers
  syncWorldbookLocationMarkers()
  historyDraft.value = null
  semanticReviewSites.value = []
  selectedSemanticSiteIds.value = new Set()
  historyError.value = ''
  historySaved.value = false
  if (restoringRevisionId) {
    restoringRevisionId = ''
    pendingVersionCommit = null
    return
  }
  if (!pendingVersionCommit && !hadPendingConfig && activeMapRevision.value && JSON.stringify(committedConfig) === JSON.stringify(voronoiConfig.value || {})) {
    return
  }
  const revision = createMapRevision({
    worldId: activeNode.value?.id || 'world',
    config: committedConfig,
    mapData: latestMapData.value,
    meta: payload?.meta || null,
    markers: geoStore.markers,
    worldbook: activeWorldbook.value,
    review: pendingVersionCommit?.review || null,
    now: pendingVersionCommit?.now,
  })
  mapRendererRef.value?.markCommittedConfig?.(revision.config)
  geoStore.commitMapVersion(revision)
  pendingVersionCommit = null
}

function onMapReplacementReady(payload) {
  const review = buildMapReplacementReview({
    worldbook: activeWorldbook.value,
    previousMap: latestMapData.value,
    nextMap: payload?.data,
    markers: markers.value,
    sourceMapRevision: activeMapRevision.value || '',
  })
  pendingMapReplacement.value = { payload, review }
  replacementChoices.value = Object.fromEntries(review.items.map((item) => [item.entryId, item.defaultChoice]))
  atlasToolsOpen.value = true
}

function replacementStatusLabel(status) {
  return ({ kept: '位置保持', moved: '位置变化', conflict: '关系冲突', unmatched: '未找到对应地点' })[status] || status
}

function formatMapVersionTime(value) {
  const date = new Date(Number(value) || 0)
  return Number.isNaN(date.getTime()) ? '未知时间' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function discardMapReplacement() {
  mapRendererRef.value?.discardReplacement?.(voronoiConfig.value || {})
  pendingMapReplacement.value = null
  pendingVoronoiConfig.value = null
  replacementChoices.value = {}
}

async function commitMapReplacement() {
  if (!pendingMapReplacement.value || mapReplacementSaving.value) return
  const worldbook = activeWorldbook.value
  if (!worldbook?.id) return
  mapReplacementSaving.value = true
  placeBindingError.value = ''
  try {
    const { payload, review } = pendingMapReplacement.value
    const now = Date.now()
    const mapRevision = `maprev_${activeNode.value?.id || 'world'}_${payload?.data?.seed || 'map'}_${now}`
    const mapId = activeNode.value?.id ? `map-${activeNode.value.id}-${payload?.data?.seed || 'current'}` : `map-${payload?.data?.seed || 'current'}`
    const applied = applyMapReplacementChoices(worldbook, review, replacementChoices.value, { mapId, mapRevision })
    if (!applied.ok) {
      throw new Error(`以下地点在生成后已被修改：${applied.staleEntryIds.join('、')}。请放弃候选后重新生成。`)
    }
    await worldStore.updateWorldbook(worldbook.id, { entries: applied.entries })
    pendingVersionCommit = { review, now, manualMarkers: applied.markers }
    if (!mapRendererRef.value?.acceptReplacement?.()) throw new Error('候选地图已经失效，请重新生成')
    pendingMapReplacement.value = null
    replacementChoices.value = {}
  } catch (error) {
    pendingVersionCommit = null
    placeBindingError.value = error?.message || '新地图版本提交失败'
  } finally {
    mapReplacementSaving.value = false
  }
}

async function restoreMapVersion(revisionId) {
  if (mapVersionRestoring.value || revisionId === activeMapRevision.value) return
  const revision = mapVersions.value.find((item) => item.id === revisionId)
  if (!revision?.config) return
  mapVersionRestoring.value = true
  placeBindingError.value = ''
  try {
    discardMapReplacement()
    const worldbook = activeWorldbook.value
    if (worldbook?.id && Array.isArray(revision.bindings)) {
      const snapshots = new Map(revision.bindings.map((item) => [String(item.entryId), item.mapBinding]))
      const entries = (worldbook.entries || []).map((entry) => {
        const snapshot = snapshots.get(String(entry.id))
        if (snapshot) return { ...entry, mapBinding: JSON.parse(JSON.stringify(snapshot)) }
        if (!entry.mapBinding) return entry
        return {
          ...entry,
          mapBinding: {
            ...entry.mapBinding,
            status: 'stale',
            pendingMapRevision: revision.id,
            staleReason: '该地点不在恢复版本的绑定快照中',
          },
        }
      })
      await worldStore.updateWorldbook(worldbook.id, { entries })
    }
    restoringRevisionId = revision.id
    mapRendererRef.value?.loadCommittedConfig?.(revision.config)
    geoStore.restoreMapVersion(revision.id)
  } catch (error) {
    restoringRevisionId = ''
    placeBindingError.value = error?.message || '地图版本恢复失败'
  } finally {
    mapVersionRestoring.value = false
  }
}

function syncWorldbookLocationMarkers() {
  if (!latestMapData.value || !activeWorldbook.value || typeof geoStore.replaceMarkers !== 'function') return
  const syncedMarkers = buildWorldbookLocationMarkers(
      activeWorldbook.value,
      latestMapData.value,
      markers.value,
      locations.value,
    )
  geoStore.replaceMarkers(syncedMarkers)
}

function focusPlaceOnMap(place) {
  if (!place?.markerId) return
  focusMarkerId.value = ''
  requestAnimationFrame(() => { focusMarkerId.value = place.markerId })
}

async function refreshWorldbookSource() {
  if (worldbookRefreshing.value) return
  worldbookRefreshing.value = true
  placeBindingError.value = ''
  try {
    await worldStore.loadWorldbooksIndex()
    const loaded = activeWorldbook.value?.id
      ? await worldStore.loadWorldbook(activeWorldbook.value.id)
      : await worldStore.ensureActiveWorldbook()
    if (!loaded) throw new Error(worldStore.lastError || '当前世界书读取失败')
    syncWorldbookLocationMarkers()
  } catch (error) {
    placeBindingError.value = error?.message || '世界书地点读取失败'
  } finally {
    worldbookRefreshing.value = false
  }
}

async function switchWorldbookSource(worldbookId) {
  const targetId = String(worldbookId || '').trim()
  if (!targetId || targetId === activeWorldbook.value?.id || worldbookRefreshing.value || pendingMapReplacement.value) return
  worldbookRefreshing.value = true
  placeBindingError.value = ''
  try {
    const manualMarkers = markers.value.filter((marker) => (
      marker?.source !== 'worldbook'
      && marker?.source !== 'geography'
      && !marker?.sourceEntryId
      && !marker?.worldbookEntryId
    ))
    const loaded = await worldStore.setActiveWorldbook(targetId)
    if (!loaded) throw new Error(worldStore.lastError || '世界书切换失败')
    geoStore.replaceMarkers(manualMarkers)
    constraintReport.value = null
    historyDraft.value = null
    historyError.value = ''
    historySaved.value = false
    semanticReviewSites.value = []
    selectedSemanticSiteIds.value = new Set()
    focusMarkerId.value = ''
    syncWorldbookLocationMarkers()
  } catch (error) {
    placeBindingError.value = error?.message || '世界书切换失败'
  } finally {
    worldbookRefreshing.value = false
  }
}

function focusNativePlace(place) {
  mapRendererRef.value?.focusCoordinates?.(Number(place?.x), Number(place?.y))
}

async function promoteNativePlace(place) {
  const worldbook = activeWorldbook.value
  if (!worldbook?.id || !place?.canPromote || nativePlaceSaving.value) return
  nativePlaceSaving.value = place.id
  placeBindingError.value = ''
  try {
    const now = Date.now()
    const entryId = `map_place_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const mapId = activeNode.value?.id
      ? `map-${activeNode.value.id}-${latestMapData.value?.seed || 'current'}`
      : `map-${latestMapData.value?.seed || 'current'}`
    const locationFacts = describeNativePlaceForPromotion(place, latestMapData.value)
    const entry = {
      id: entryId,
      name: place.name,
      type: 'location',
      keys: [place.name],
      content: locationFacts,
      mode: 'selective',
      enabled: true,
      createdAt: now,
      updatedAt: now,
      metadata: {
        importSource: 'map-native-place',
        mapObjectId: place.mapObjectId,
      },
      mapBinding: {
        status: 'confirmed',
        mapId,
        mapRevision: activeMapRevision.value || '',
        markerId: `worldbook-location:${entryId}`,
        mapObjectId: place.mapObjectId,
        cellId: place.cellId,
        x: Number(place.x),
        y: Number(place.y),
        sourceRevision: String(worldbook.updatedAt || worldbook.id),
      },
    }
    await worldStore.updateWorldbook(worldbook.id, {
      entries: [...(worldbook.entries || []), entry],
    })
  } catch (error) {
    placeBindingError.value = error?.message || '地图地点写入世界书失败'
  } finally {
    nativePlaceSaving.value = ''
  }
}

async function formalizeExtractedPlace(place) {
  const worldbook = activeWorldbook.value
  if (!worldbook?.id || !place?.canFormalize || placeBindingSaving.value) return
  placeBindingSaving.value = place.id
  placeBindingError.value = ''
  try {
    const now = Date.now()
    const entryId = `extracted_place_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const relations = (Array.isArray(place.relationRefs) ? place.relationRefs : [])
      .filter((reference) => reference?.name && reference?.relation)
      .map((reference) => ({ name: reference.name, relationType: reference.relation }))
    await worldStore.updateWorldbook(worldbook.id, {
      entries: [...(worldbook.entries || []), {
        id: entryId,
        name: place.name,
        type: 'location',
        keys: [place.name],
        content: place.evidence || place.content || `${place.name}是从地理正文中提取的地点。`,
        mode: 'selective',
        enabled: true,
        createdAt: now,
        updatedAt: now,
        ...(relations.length ? { relations: { locations: relations } } : {}),
        metadata: {
          importSource: 'geography-prose-extraction',
          sourceEvidence: place.evidence || '',
        },
      }],
    })
  } catch (error) {
    placeBindingError.value = error?.message || '正文地点转为正式条目失败'
  } finally {
    placeBindingSaving.value = ''
  }
}

async function confirmPlaceBinding(place) {
  if (!place?.entryId || !place?.marker || placeBindingSaving.value) return
  const worldbook = activeWorldbook.value
  if (!worldbook?.id) return
  placeBindingSaving.value = place.id
  placeBindingError.value = ''
  try {
    const mapId = activeNode.value?.id
      ? `map-${activeNode.value.id}-${latestMapData.value?.seed || 'current'}`
      : `map-${latestMapData.value?.seed || 'current'}`
    const entries = (worldbook.entries || []).map((entry) => {
      if (String(entry.id) !== String(place.entryId)) return entry
      return {
        ...entry,
        mapBinding: {
          status: 'confirmed',
          mapId,
          mapRevision: activeMapRevision.value || '',
          markerId: place.marker.id,
          x: Number(place.marker.x),
          y: Number(place.marker.y),
          ...(Number.isInteger(Number(place.marker.cellId)) ? { cellId: Number(place.marker.cellId) } : {}),
          ...(place.marker.mapObjectId ? { mapObjectId: String(place.marker.mapObjectId) } : {}),
          sourceRevision: String(worldbook.updatedAt || worldbook.id)
        }
      }
    })
    await worldStore.updateWorldbook(worldbook.id, { entries })
  } catch (error) {
    placeBindingError.value = error?.message || '地点绑定保存失败'
  } finally {
    placeBindingSaving.value = ''
  }
}

async function clearPlaceBinding(place) {
  if (!place?.entryId || placeBindingSaving.value) return
  const worldbook = activeWorldbook.value
  if (!worldbook?.id) return
  placeBindingSaving.value = place.id
  placeBindingError.value = ''
  try {
    const entries = (worldbook.entries || []).map((entry) => {
      if (String(entry.id) !== String(place.entryId)) return entry
      const { mapBinding: _mapBinding, ...withoutBinding } = entry
      return withoutBinding
    })
    await worldStore.updateWorldbook(worldbook.id, { entries })
  } catch (error) {
    placeBindingError.value = error?.message || '地点绑定解除失败'
  } finally {
    placeBindingSaving.value = ''
  }
}

async function handleBuildHistory() {
  if (!latestMapData.value || historyGenerating.value) return

  if (semanticReviewSites.value.length === 0) {
    const currentWorldbook = worldStore.activeWorldbook || await worldStore.ensureActiveWorldbook()
    const mapSemantics = extractMapSemantics(latestMapData.value)
    const candidates = selectSemanticSitesForReview(mapSemantics, {
      maxSites: 12,
      allowedNames: collectWorldbookPlaceNames(currentWorldbook),
      requireAllowedNames: true,
      authoredSites: buildWorldbookSemanticSites(currentWorldbook),
    })
    if (candidates.length === 0) {
      historyError.value = '当前世界书没有可审阅的明确地点，或地点尚未出现在地图中。自动生成的城市、河流和道路不会直接进入历史；请先在世界书中建立地点条目。'
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
  pendingVoronoiConfig.value = config
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
  const marker = markers.value.find((candidate) => candidate.id === id)
  geoStore.updateMarker(id, { x, y })
  if (marker?.bindingStatus !== 'confirmed' || !marker.worldbookEntryId || !activeWorldbook.value?.id) return

  const worldbook = activeWorldbook.value
  const entries = (worldbook.entries || []).map((entry) => {
    if (String(entry.id) !== String(marker.worldbookEntryId)) return entry
    return {
      ...entry,
      mapBinding: {
        ...(entry.mapBinding || {}),
        x: Number(x),
        y: Number(y),
        mapRevision: activeMapRevision.value || entry.mapBinding?.mapRevision || '',
        sourceRevision: String(worldbook.updatedAt || worldbook.id)
      }
    }
  })
  worldStore.updateWorldbook(worldbook.id, { entries }).catch((error) => {
    placeBindingError.value = error?.message || '地点移动后的绑定保存失败'
  })
}

// Load both stores before treating the map as ready. WorldMapVoronoi mounts
// before this hook, so loading only geography here leaves an existing map
// without the active worldbook and its source markers.
onMounted(async () => {
  window.addEventListener('keydown', handlePanelKeydown)
  geoStore.loadAll()
  try {
    await worldStore.loadWorldbooksIndex()
    await worldStore.ensureActiveWorldbook()
  } catch (error) {
    console.warn('[WorldMapPanel] Failed to load active worldbook:', error)
  }
  syncWorldbookLocationMarkers()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handlePanelKeydown)
})

function handlePanelKeydown(event) {
  if (event.key === 'Escape' && atlasToolsOpen.value) atlasToolsOpen.value = false
}

// 世界书可能在地图组件之后异步加载；地点条目变化时也要立即同步到当前地图。
watch(
  () => [activeWorldbook.value?.id, activeWorldbook.value?.entries, activeWorldbook.value?.geoHistory],
  syncWorldbookLocationMarkers,
  { deep: true, immediate: true },
)
</script>

<style scoped>
.world-map-panel {
  position: relative;
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

.source-chip,
.atlas-tools-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-raised) 84%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.source-chip {
  max-width: 220px;
}

.source-chip > span:not(.source-chip__dot) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-chip strong {
  color: var(--accent);
  font-size: 11px;
}

.source-chip__dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}

.source-chip:hover,
.atlas-tools-trigger:hover,
.atlas-tools-trigger.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised));
}

.atlas-tools {
  position: absolute;
  top: 48px;
  right: 0;
  bottom: 0;
  z-index: var(--z-sheet, 40);
  display: flex;
  width: min(390px, calc(100% - 48px));
  min-height: 0;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  background: color-mix(in srgb, var(--surface-raised) 96%, transparent);
  box-shadow: -18px 0 36px color-mix(in srgb, var(--shadow) 38%, transparent);
  backdrop-filter: blur(16px);
}

.atlas-tools__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
}

.atlas-tools__header > div {
  display: grid;
  gap: 1px;
}

.atlas-tools__header span {
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.atlas-tools__header strong {
  color: var(--text-primary);
  font-size: 15px;
}

.atlas-tools__close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.atlas-tools__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.atlas-tools__body {
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
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

.toolbar-text-btn,
.primary-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.toolbar-text-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--surface-raised));
  color: var(--accent);
}

.primary-btn-sm {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-text);
}

.primary-btn-sm:hover:not(:disabled) {
  background: var(--accent-hover);
}

.toolbar-text-btn:disabled,
.primary-btn-sm:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

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

.worldbook-source-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 10px;
  padding: 7px 10px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--text-muted);
  font-size: 11px;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.worldbook-source-status__label {
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.worldbook-source-picker {
  display: grid;
  min-width: min(100%, 210px);
  flex: 1 1 210px;
  gap: 4px;
}

.worldbook-source-picker select {
  width: 100%;
  min-height: 32px;
  padding: 5px 28px 5px 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 4px;
  color: var(--text-primary);
  background: var(--surface-panel);
  font: inherit;
}

.worldbook-source-picker select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 48%, transparent);
  outline-offset: 1px;
}

.worldbook-source-picker select:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.worldbook-source-status strong {
  color: var(--text-primary);
  font-weight: 600;
}

.worldbook-source-status__muted {
  color: var(--text-muted);
}

.worldbook-source-status__actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 4px;
}

.worldbook-source-status--empty {
  color: var(--text-muted);
}

.history-draft-actions {
  justify-content: flex-end;
}

.place-binding-panel {
  display: grid;
  gap: 9px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 58%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, var(--surface-panel));
}

.place-binding-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.place-binding-heading h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.place-binding-summary {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.place-binding-list {
  display: grid;
  gap: 1px;
}

.place-binding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.place-binding-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.place-binding-copy strong,
.place-binding-copy span,
.place-binding-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-binding-copy strong { color: var(--text-primary); font-size: 12px; }
.place-binding-copy span { color: var(--text-secondary); font-size: 11px; }
.place-binding-copy small { color: var(--text-muted); font-size: 11px; }
.place-binding-copy .place-binding-copy__relations { color: var(--accent); font-size: 11px; }
.place-binding-copy .place-binding-copy__evidence {
  display: -webkit-box;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.place-binding-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.place-binding-confirm { color: var(--accent); }
.place-binding-state { color: var(--text-muted); font-size: 11px; }
.place-binding-row.is-confirmed .place-binding-copy strong { color: var(--accent); }
.place-binding-row.is-conflict .place-binding-copy strong { color: var(--warning); }

.constraint-report {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  padding: 7px 10px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 58%, var(--border));
  background: color-mix(in srgb, var(--surface-panel) 96%, var(--accent));
  color: var(--text-muted);
  font-size: 11px;
}

.constraint-report strong { color: var(--accent); font-weight: 600; }
.constraint-report .is-impossible { color: var(--warning); }
.constraint-report__issues {
  grid-column: 1 / -1;
  display: grid;
  gap: 5px;
  width: 100%;
  margin: 4px 0 0;
  padding: 8px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  list-style: none;
}
.constraint-report__issues li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 6px; font-size: 11px; line-height: 1.45; }
.constraint-report__issues b { color: var(--warning); font-weight: 600; }
.constraint-report__issues span { color: var(--text-secondary); overflow-wrap: anywhere; }

.map-replacement-review,
.map-version-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 62%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface-panel));
}

.map-replacement-review h3,
.map-version-panel h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.map-replacement-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: var(--text-secondary);
  font-size: 11px;
}

.map-replacement-summary .is-warning { color: var(--warning); }

.map-replacement-list,
.map-version-list { display: grid; gap: 1px; }

.map-replacement-item,
.map-version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.map-replacement-item__copy,
.map-version-row > span { display: grid; min-width: 0; gap: 2px; }
.map-replacement-item__copy strong,
.map-version-row strong { color: var(--text-primary); font-size: 12px; }
.map-replacement-item__copy small,
.map-version-row small { color: var(--text-muted); font-size: 11px; line-height: 1.45; }

.map-replacement-select {
  max-width: 132px;
  min-height: 30px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}

.map-version-row b { color: var(--accent); font-size: 11px; font-weight: 600; }
.map-version-row.active strong { color: var(--accent); }

@media (max-width: 760px) {
  .place-binding-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .place-binding-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .map-replacement-item {
    grid-template-columns: minmax(0, 1fr);
  }

  .map-replacement-select {
    width: 100%;
    max-width: none;
  }
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

  .source-chip {
    order: -1;
    max-width: min(180px, 48vw);
  }

  .atlas-tools {
    top: 96px;
    width: calc(100% - 24px);
  }

  .history-btn {
    margin-left: auto;
  }

  .main-content {
    min-height: 0;
  }
}
</style>
