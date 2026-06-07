<template>
  <div ref="containerRef" class="voronoi-container">
    <!-- Empty state -->
    <div v-if="!mapData && !generating && !error" class="overlay empty-overlay">
      <div class="empty-content">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        <p class="empty-title">还没有地图数据</p>
        <p class="empty-desc">点击右上角「AI 生成地图」，系统会根据世界观设定自动生成。<br/>先在「世界起源」「自然环境」中填写内容，效果更好。</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="generating" class="overlay loading-overlay">
      <div class="loading-content">
        <svg class="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        <p>正在生成地图...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="overlay error-overlay">
      <div class="error-content">
        <p class="error-title">生成失败</p>
        <p class="error-msg">{{ error }}</p>
        <button class="primary-btn-sm" @click="doGenerate(mergedConfig)">重试</button>
      </div>
    </div>

    <canvas ref="canvasRef" class="voronoi-canvas"></canvas>

    <!-- Info bar -->
    <div v-if="mapData && !generating" class="info-bar">
      <div class="info-name">{{ mapData.name }}</div>
      <div class="info-stats">
        {{ mapData.states.filter(s => s.i > 0).length }} 国 ·
        {{ mapData.burgs.filter(b => b.i > 0).length }} 城 ·
        {{ mapData.rivers.length }} 河 ·
        {{ markerCount }} 标记
      </div>
    </div>

    <!-- Top-right buttons -->
    <div v-if="mapData && !generating" class="top-actions">
      <button class="canvas-btn" :class="{ active: addingMarkerMode }" @click="toggleAddMarkerMode">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>
        添加标记
      </button>
      <button class="canvas-btn" :class="{ active: showSettings }" @click="toggleSettings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        参数
      </button>
      <button class="canvas-btn" @click="handleExportHD" :disabled="exporting">
        <svg v-if="!exporting" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <svg v-else class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        {{ exporting ? '导出中...' : '导出高清' }}
      </button>
      <button class="canvas-btn" @click="regenerate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        重新生成
      </button>
    </div>

    <!-- Settings panel -->
    <div v-if="mapData && !generating && showSettings" class="settings-panel">
      <div class="settings-head">
        <div>
          <h4 class="panel-title">地图参数</h4>
          <p class="panel-subtitle">只开放影响生成结果的核心项；应用后保存到当前世界并重新生成。</p>
        </div>
      </div>

      <div class="panel-section">
        <div class="config-strip">
          <span>当前</span>
          <strong>{{ configCompactSummary }}</strong>
        </div>
      </div>

      <div class="panel-section">
        <label class="section-label">核心参数</label>
        <div class="param-field">
          <div class="param-head">
            <span>陆地比例</span>
            <strong>{{ formatPercent(paramDraft.landRatio) }}</strong>
          </div>
          <input class="param-range" type="range" min="0.15" max="0.8" step="0.01" v-model.number="paramDraft.landRatio" />
        </div>
        <div class="param-field">
          <div class="param-head">
            <span>板块数量</span>
            <strong>{{ paramDraft.plateCount }}</strong>
          </div>
          <input class="param-range" type="range" min="2" max="12" step="1" v-model.number="paramDraft.plateCount" />
        </div>
        <div class="param-field">
          <div class="param-head">
            <span>国家数量</span>
            <strong>{{ paramDraft.stateCount }}</strong>
          </div>
          <input class="param-range" type="range" min="2" max="15" step="1" v-model.number="paramDraft.stateCount" />
        </div>
        <div class="param-field">
          <div class="param-head">
            <span>城市密度</span>
            <strong>{{ formatNumber(paramDraft.burgDensity) }}x</strong>
          </div>
          <input class="param-range" type="range" min="0.1" max="1.5" step="0.1" v-model.number="paramDraft.burgDensity" />
        </div>
        <div class="param-grid">
          <label class="compact-field">
            <span>气温偏移</span>
            <input class="compact-input" type="number" min="-20" max="20" step="1" v-model.number="paramDraft.temperatureShift" />
          </label>
          <label class="compact-field">
            <span>降水倍率</span>
            <input class="compact-input" type="number" min="0.2" max="3" step="0.1" v-model.number="paramDraft.precipitationFactor" />
          </label>
        </div>
        <label class="compact-field">
          <span>地形模板</span>
          <select class="compact-input" v-model="paramDraft.heightmapTemplate">
            <option v-for="option in HEIGHTMAP_TEMPLATE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <p class="param-note">风格和图层保持固定，由地形图方案统一渲染；这里的参数会改变生成结果本身。</p>
        <button class="canvas-btn sm apply-btn" @click="applyParamDraft">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          应用并重新生成
        </button>
      </div>
    </div>

    <!-- Bottom: legend + scale -->
    <div v-if="mapData && !generating" class="bottom-bar">
      <div class="bottom-left">
        <div v-if="addingMarkerMode" class="mode-hint">单击地图放置新标记，Esc 取消</div>
        <button class="canvas-btn sm" :class="{ active: showLegend }" @click="showLegend = !showLegend">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          图例
        </button>
        <div class="hint-text">
          <span>滚轮缩放</span>
          <span>拖拽平移</span>
          <span>双击/按钮添加标记</span>
          <span>拖拽移动标记</span>
        </div>
      </div>
      <div class="scale-bar">
        <span class="scale-label">比例尺</span>
        <select class="scale-select" :value="kmPerPixel" @change="handleKmPerPixelChange(Number($event.target.value))">
          <option :value="0.1">1px = 100m</option>
          <option :value="0.5">1px = 500m</option>
          <option :value="1">1px = 1km</option>
          <option :value="2">1px = 2km</option>
          <option :value="5">1px = 5km</option>
          <option :value="10">1px = 10km</option>
          <option :value="50">1px = 50km</option>
        </select>
      </div>
    </div>

    <!-- Zoom controls -->
    <div v-if="mapData && !generating" class="zoom-controls">
      <button class="zoom-btn" @click="handleZoomBtn(-1)" title="缩小">−</button>
      <button class="zoom-btn label" @click="handleFitView" title="适配视图">{{ scalePercent }}%</button>
      <button class="zoom-btn" @click="handleZoomBtn(1)" title="放大">+</button>
    </div>

    <!-- Legend popup -->
    <div v-if="mapData && !generating && showLegend" class="legend-popup">
      <h4 class="legend-title">地图图例</h4>
      <div class="legend-section">
        <p class="legend-section-title">水域</p>
        <div class="legend-row"><div class="legend-color" style="background:#0f5d95"></div><span>深海</span></div>
        <div class="legend-row"><div class="legend-color" style="background:#68bbd8"></div><span>浅海</span></div>
        <div class="legend-row"><div class="legend-color" style="background:#d9f3f2"></div><span>近岸</span></div>
        <div class="legend-row"><div class="legend-line" style="border-color:#0879c5"></div><span>河流</span></div>
      </div>
      <div class="legend-section">
        <p class="legend-section-title">海拔</p>
        <div class="legend-row"><div class="legend-color" style="background:rgb(160,130,80)"></div><span>丘陵</span></div>
        <div class="legend-row"><div class="legend-color" style="background:rgb(190,160,120)"></div><span>山地</span></div>
        <div class="legend-row"><div class="legend-color" style="background:rgb(220,200,160)"></div><span>高山</span></div>
        <div class="legend-row"><div class="legend-color" style="background:rgb(240,220,180)"></div><span>雪线</span></div>
      </div>
    </div>

    <!-- Marker editor sidebar -->
    <MapMarkerEditor
      v-if="selectedMarker"
      :marker="selectedMarker"
      @update="handleMarkerUpdate"
      @delete="handleMarkerDelete"
      @close="selectedMarkerId = null"
    />
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { generateMapInWorker, renderMap, renderMapAsync, renderScaleBarLayer, terminateWorker } from '../../services/world-map/engine'
import { drawMarkers, hitTestMarker } from '../../services/world-map/markers'
import MapMarkerEditor from './MapMarkerEditor.vue'
import { usePerf } from '../../composables/usePerf'

const DEFAULT_RENDER_LAYERS = Object.freeze({
  hillshade: true,
  terrain: true,
  ice: true,
  coastlines: true,
  coastGlow: true,
  volcanoes: true,
  continents: false,
  rivers: true,
  landDividers: true,
  borders: true,
  borderlands: true,
  factionTexture: false,
  provinces: false,
  roads: true,
  tectonics: false,
  oceanCurrents: false,
  wind: false,
  stateLabels: true,
  burgIcons: true,
  burgLabels: true,
  scaleBar: true,
  vignette: true,
})

const HEIGHTMAP_TEMPLATE_OPTIONS = Object.freeze([
  { value: '', label: '自动选择' },
  { value: 'continents', label: '多大陆' },
  { value: 'pangea', label: '单一大陆' },
  { value: 'archipelago', label: '群岛' },
  { value: 'peninsula', label: '半岛' },
  { value: 'mediterranean', label: '内海' },
  { value: 'oldWorld', label: '旧世界' },
  { value: 'fractious', label: '破碎大陆' },
])

const perf = usePerf()

const props = defineProps({
  config: { type: Object, default: undefined },
  markers: { type: Array, default: () => [] },
})

const emit = defineEmits(['map-generated', 'config-change', 'add-marker', 'update-marker', 'delete-marker', 'marker-drag-end'])

const containerRef = ref(null)
const canvasRef = ref(null)
let offscreen = null
let scaleBarOverlay = null
let baseRenderScale = 1

const mapData = shallowRef(null)
const generating = ref(false)
const error = ref(null)

const vp = shallowRef({ scale: 1, offsetX: 0, offsetY: 0 })
const scalePercent = computed(() => Math.round(vp.value.scale * 100))

const kmPerPixel = shallowRef(1)

const showLegend = ref(false)
const showSettings = ref(false)
const addingMarkerMode = ref(false)

const exporting = ref(false)

const selectedMarkerId = ref(null)
const hoveredMarkerId = ref(null)
let isDraggingMarker = false
let dragMoved = false
let draggedMarker = null
let paintScheduled = false
let pendingGenerateConfig = null
let pendingSelectedMarkerId = null
let pendingSubmittedConfigKey = null

const selectedMarker = computed(() =>
  props.markers.find(m => m.id === selectedMarkerId.value) || null
)
const markerCount = computed(() => props.markers.length)

let canvasBgColor = '#f4f1e8'
try {
  const styles = getComputedStyle(document.documentElement)
  canvasBgColor = styles.getPropertyValue('--surface-soft').trim()
    || styles.getPropertyValue('--bg-secondary').trim()
    || canvasBgColor
} catch {}

const configKey = computed(() => JSON.stringify(props.config || {}))

const mergedConfig = computed(() => ({
  width: 1200,
  height: 800,
  ...props.config,
}))

const renderStylePreset = computed(() => props.config?.stylePreset || 'topographic')
const renderLayers = computed(() => ({
  ...DEFAULT_RENDER_LAYERS,
  ...(props.config?.layers && typeof props.config.layers === 'object' ? props.config.layers : {}),
}))

const paramDraft = ref(createParamDraft(mergedConfig.value))

const configCompactSummary = computed(() => {
  const cfg = mergedConfig.value
  return `${templateLabel(cfg.heightmapTemplate)} · 陆地${formatPercent(cfg.landRatio ?? 0.45)} · ${cfg.stateCount ?? 8}国 · ${cfg.plateCount ?? cfg.continentCount ?? 6}板块`
})

function withoutSeed(cfg) {
  const { seed: _seed, ...rest } = cfg
  return rest
}

function regenerate() {
  submitConfig({
    ...withoutSeed(mergedConfig.value),
    seed: String(Math.floor(Math.random() * 1e10)),
  })
}

function toggleSettings() {
  showSettings.value = !showSettings.value
  if (showSettings.value) {
    addingMarkerMode.value = false
    syncParamDraft()
  }
}

function toggleAddMarkerMode() {
  addingMarkerMode.value = !addingMarkerMode.value
  if (addingMarkerMode.value) {
    showSettings.value = false
    selectedMarkerId.value = null
  }
}

function applyParamDraft() {
  const nextConfig = {
    ...mergedConfig.value,
    ...normalizeParamDraft(paramDraft.value),
    seed: String(Math.floor(Math.random() * 1e10)),
  }
  submitConfig(nextConfig)
}

function submitConfig(config) {
  const plainConfig = cloneConfig(config)
  if (props.config && Object.keys(props.config).length > 0) {
    pendingSubmittedConfigKey = JSON.stringify(plainConfig)
    emit('config-change', plainConfig)
  }
  doGenerate(plainConfig)
}

function releaseCanvas(canvas) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

function baseRenderLayers() {
  return { ...renderLayers.value, scaleBar: false }
}

async function renderBaseMap(canvas, data, renderScale) {
  await renderMapAsync(canvas, data, {
    scale: renderScale,
    kmPerPixel: kmPerPixel.value,
    stylePreset: renderStylePreset.value,
    layers: baseRenderLayers(),
  })
}

function createScaleOverlay(data, renderScale) {
  const canvas = document.createElement('canvas')
  renderScaleBarLayer(canvas, data, {
    scale: renderScale,
    kmPerPixel: kmPerPixel.value,
    stylePreset: renderStylePreset.value,
    layers: renderLayers.value,
  })
  return canvas
}

function renderScaleOverlay(data, renderScale) {
  releaseCanvas(scaleBarOverlay)
  const canvas = createScaleOverlay(data, renderScale)
  scaleBarOverlay = canvas
}

function currentRenderScale() {
  const dpr = window.devicePixelRatio || 1
  return Math.min(dpr, 3)
}

async function doGenerate(cfg) {
  const requestConfig = cloneConfig(cfg)
  if (generating.value) {
    pendingGenerateConfig = requestConfig
    return
  }

  generating.value = true
  error.value = null

  try {
    // 深拷贝 cfg 以剥离 Vue 响应式代理（Worker postMessage 要求纯数据）。
    // 用 JSON 走代理：toRaw 只剥一层，nested proxy 仍存在，structuredClone 无法克隆。
    // JSON.stringify 会沿 proxy 走读路径并输出可序列化值，再 parse 回来即纯对象。
    const { data, meta } = await generateMapInWorker(requestConfig, { debugPerf: perf.enabled })
    perf.record(meta)

    const renderScale = currentRenderScale()
    const canvas = document.createElement('canvas')
    await renderBaseMap(canvas, data, renderScale)
    const scaleOverlay = createScaleOverlay(data, renderScale)

    if (pendingGenerateConfig) {
      releaseCanvas(canvas)
      releaseCanvas(scaleOverlay)
      return
    }

    // 新图完全可用后再替换旧位图，避免失败或过期请求清空当前画面。
    releaseCanvas(offscreen)
    releaseCanvas(scaleBarOverlay)
    baseRenderScale = renderScale
    offscreen = canvas
    scaleBarOverlay = scaleOverlay
    mapData.value = data
    emit('map-generated', { data, meta })
  } catch (e) {
    console.error('[WorldMapVoronoi] Generation failed:', e)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
    const queuedConfig = pendingGenerateConfig
    pendingGenerateConfig = null
    if (queuedConfig) {
      requestAnimationFrame(() => doGenerate(queuedConfig))
    }
  }
}

function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg || {}))
}

async function rerender() {
  if (!mapData.value) return
  // 释放旧 canvas 位图内存
  releaseCanvas(offscreen)
  releaseCanvas(scaleBarOverlay)
  scaleBarOverlay = null
  const renderScale = currentRenderScale()
  const canvas = document.createElement('canvas')
  await renderBaseMap(canvas, mapData.value, renderScale)
  renderScaleOverlay(mapData.value, renderScale)
  baseRenderScale = renderScale
  offscreen = canvas
  schedulePaint()
}

function rerenderScaleBarOverlay() {
  if (!mapData.value) return
  const renderScale = currentRenderScale()
  if (renderScale !== baseRenderScale) {
    requestAnimationFrame(() => rerender())
    return
  }
  renderScaleOverlay(mapData.value, renderScale)
  schedulePaint()
}

function paint() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !offscreen || !container) return

  const dpr = window.devicePixelRatio || 1
  const cw = container.clientWidth
  const ch = container.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = cw + 'px'
    canvas.style.height = ch + 'px'
  }

  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = canvasBgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)
  ctx.scale(vp.value.scale, vp.value.scale)
  ctx.translate(-vp.value.offsetX, -vp.value.offsetY)

  const md = mapData.value
  const mapW = md?.width || offscreen.width
  const mapH = md?.height || offscreen.height
  ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, 0, 0, mapW, mapH)
  if (scaleBarOverlay) {
    ctx.drawImage(scaleBarOverlay, 0, 0, scaleBarOverlay.width, scaleBarOverlay.height, 0, 0, mapW, mapH)
  }

  // 叠加绘制用户标记
  if (props.markers.length > 0) {
    drawMarkers(ctx, props.markers, selectedMarkerId.value, hoveredMarkerId.value)
  }
}

function schedulePaint() {
  if (paintScheduled) return
  paintScheduled = true
  requestAnimationFrame(() => {
    paintScheduled = false
    paint()
  })
}

function fitToView() {
  if (!mapData.value || !containerRef.value) return
  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  const fitScale = Math.min(cw / mapData.value.width, ch / mapData.value.height, 1)
  vp.value = {
    scale: fitScale,
    offsetX: -(cw / fitScale - mapData.value.width) / 2,
    offsetY: -(ch / fitScale - mapData.value.height) / 2,
  }
}

function handleZoomBtn(delta) {
  const container = containerRef.value
  if (!container) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  const cx = vp.value.offsetX + cw / (2 * vp.value.scale)
  const cy = vp.value.offsetY + ch / (2 * vp.value.scale)
  const newScale = Math.max(0.2, Math.min(8, vp.value.scale * (delta > 0 ? 1.3 : 1 / 1.3)))
  vp.value = {
    scale: newScale,
    offsetX: cx - cw / (2 * newScale),
    offsetY: cy - ch / (2 * newScale),
  }
  schedulePaint()
}

function handleFitView() {
  fitToView()
  schedulePaint()
}

function handleKmPerPixelChange(val) {
  kmPerPixel.value = val
  rerenderScaleBarOverlay()
}

function handleExportHD() {
  if (!mapData.value || exporting.value) return
  exporting.value = true
  requestAnimationFrame(() => setTimeout(() => {
    try {
      const exportCanvas = document.createElement('canvas')
      renderMap(exportCanvas, mapData.value, {
        scale: 5,
        kmPerPixel: kmPerPixel.value,
        stylePreset: renderStylePreset.value,
        layers: renderLayers.value,
      })
      exportCanvas.toBlob(blob => {
        if (!blob) { exporting.value = false; return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${mapData.value.name || 'map'}_${mapData.value.width * 5}x${mapData.value.height * 5}.png`
        a.click()
        URL.revokeObjectURL(url)
        exporting.value = false
      }, 'image/png')
    } catch { exporting.value = false }
  }, 50))
}

// ── 坐标转换 ──
// Cache the canvas rect across one interaction; invalidated on resize
// and on each pointerdown / wheel so a scrolled page doesn't desync.
let cachedRect = null
function getRect() {
  if (!cachedRect) cachedRect = canvasRef.value.getBoundingClientRect()
  return cachedRect
}

function screenToWorld(clientX, clientY) {
  const rect = getRect()
  return {
    x: vp.value.offsetX + (clientX - rect.left) / vp.value.scale,
    y: vp.value.offsetY + (clientY - rect.top) / vp.value.scale,
  }
}

// Pointer interaction for pan/zoom/marker
let dragging = false
let lastX = 0
let lastY = 0

function onWheel(e) {
  e.preventDefault()
  cachedRect = null
  const rect = getRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const wx = vp.value.offsetX + mx / vp.value.scale
  const wy = vp.value.offsetY + my / vp.value.scale
  const newScale = Math.max(0.2, Math.min(8, vp.value.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
  vp.value = {
    scale: newScale,
    offsetX: wx - mx / newScale,
    offsetY: wy - my / newScale,
  }
  schedulePaint()
}

function onPointerDown(e) {
  cachedRect = null
  const world = screenToWorld(e.clientX, e.clientY)
  if (e.button === 0 && addingMarkerMode.value) {
    createMarkerAt(world.x, world.y)
    addingMarkerMode.value = false
    schedulePaint()
    return
  }

  const hitRadius = 16 / vp.value.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)

  if (e.button === 0 && hit) {
    // 点击/拖拽标记
    selectedMarkerId.value = hit.id
    hoveredMarkerId.value = null
    isDraggingMarker = true
    dragMoved = false
    draggedMarker = hit
    canvasRef.value?.setPointerCapture(e.pointerId)
    schedulePaint()
    return
  }

  // 未命中标记 → 平移
  selectedMarkerId.value = null
  isDraggingMarker = false
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  canvasRef.value?.setPointerCapture(e.pointerId)
  schedulePaint()
}

function onPointerMove(e) {
  const world = screenToWorld(e.clientX, e.clientY)

  if (isDraggingMarker && draggedMarker) {
    dragMoved = true
    const mapW = mapData.value?.width || 1200
    const mapH = mapData.value?.height || 800
    draggedMarker.x = Math.max(20, Math.min(mapW - 20, world.x))
    draggedMarker.y = Math.max(20, Math.min(mapH - 20, world.y))
    schedulePaint()
    return
  }

  if (dragging) {
    vp.value = {
      scale: vp.value.scale,
      offsetX: vp.value.offsetX - (e.clientX - lastX) / vp.value.scale,
      offsetY: vp.value.offsetY - (e.clientY - lastY) / vp.value.scale,
    }
    lastX = e.clientX
    lastY = e.clientY
    schedulePaint()
    return
  }

  // hover 检测
  const hitRadius = 16 / vp.value.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)
  const newHovered = hit?.id || null
  if (newHovered !== hoveredMarkerId.value) {
    hoveredMarkerId.value = newHovered
    canvasRef.value.style.cursor = newHovered ? 'pointer' : ''
    schedulePaint()
  }
}

function onPointerUp() {
  if (isDraggingMarker && dragMoved && draggedMarker) {
    emit('marker-drag-end', draggedMarker.id, draggedMarker.x, draggedMarker.y)
  }
  isDraggingMarker = false
  dragMoved = false
  draggedMarker = null
  dragging = false
}

function onDblClick(e) {
  const world = screenToWorld(e.clientX, e.clientY)
  const hitRadius = 16 / vp.value.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)

  if (hit) {
    selectedMarkerId.value = hit.id
    schedulePaint()
  } else {
    createMarkerAt(world.x, world.y)
  }
}

// ── 标记事件处理 ──
function createMarkerAt(x, y) {
  const id = `mk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const name = `新标记 ${markerCount.value + 1}`
  pendingSelectedMarkerId = id
  selectedMarkerId.value = id
  emit('add-marker', x, y, { id, name })
}

function handleMarkerUpdate(id, patch) {
  emit('update-marker', id, patch)
}

function handleMarkerDelete(id) {
  emit('delete-marker', id)
  selectedMarkerId.value = null
}

// Watch for config changes
watch(configKey, () => {
  syncParamDraft()
  selectedMarkerId.value = null
  addingMarkerMode.value = false
  if (pendingSubmittedConfigKey === configKey.value) {
    pendingSubmittedConfigKey = null
    return
  }
  if (props.config && Object.keys(props.config).length > 0) {
    doGenerate(mergedConfig.value)
  }
})

watch(() => props.markers, () => {
  if (pendingSelectedMarkerId && props.markers.some(m => m.id === pendingSelectedMarkerId)) {
    selectedMarkerId.value = pendingSelectedMarkerId
    pendingSelectedMarkerId = null
  }
  if (selectedMarkerId.value && !props.markers.some(m => m.id === selectedMarkerId.value)) {
    selectedMarkerId.value = null
  }
  schedulePaint()
})

// When mapData changes, fit to view and paint
watch(mapData, () => {
  if (!mapData.value) return
  fitToView()
  schedulePaint()
})

const onResize = () => {
  cachedRect = null
  if (mapData.value && currentRenderScale() !== baseRenderScale) {
    requestAnimationFrame(() => rerender())
    return
  }
  schedulePaint()
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    addingMarkerMode.value = false
    showSettings.value = false
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId.value) {
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.target?.isContentEditable) return
    e.preventDefault()
    handleMarkerDelete(selectedMarkerId.value)
  }
}

onMounted(() => {
  syncParamDraft()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown)
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('dblclick', onDblClick)
  }
  if (props.config && Object.keys(props.config).length > 0) {
    doGenerate(mergedConfig.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  const canvas = canvasRef.value
  if (canvas) {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('dblclick', onDblClick)
  }
  // 终止可能仍在运行的 Worker，丢弃未完成的请求
  terminateWorker()
  releaseCanvas(offscreen)
  releaseCanvas(scaleBarOverlay)
  offscreen = null
  scaleBarOverlay = null
  pendingGenerateConfig = null
  pendingSelectedMarkerId = null
  pendingSubmittedConfigKey = null
})

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`
}

function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function formatSigned(value) {
  const n = Number(value) || 0
  return n > 0 ? `+${n}` : String(n)
}

function templateLabel(value) {
  return HEIGHTMAP_TEMPLATE_OPTIONS.find(option => option.value === (value || ''))?.label || value || '自动'
}

function syncParamDraft() {
  paramDraft.value = createParamDraft(mergedConfig.value)
}

function createParamDraft(cfg) {
  return {
    heightmapTemplate: cfg.heightmapTemplate || '',
    landRatio: clampNumber(cfg.landRatio ?? 0.45, 0.15, 0.8),
    plateCount: Math.round(clampNumber(cfg.plateCount ?? cfg.continentCount ?? 6, 2, 12)),
    stateCount: Math.round(clampNumber(cfg.stateCount ?? 8, 2, 15)),
    burgDensity: clampNumber(cfg.burgDensity ?? 0.5, 0.1, 1.5),
    temperatureShift: Math.round(clampNumber(cfg.temperatureShift ?? 0, -20, 20)),
    precipitationFactor: clampNumber(cfg.precipitationFactor ?? 1, 0.2, 3),
  }
}

function normalizeParamDraft(draft) {
  const normalized = {
    landRatio: roundTo(clampNumber(draft.landRatio, 0.15, 0.8), 2),
    plateCount: Math.round(clampNumber(draft.plateCount, 2, 12)),
    stateCount: Math.round(clampNumber(draft.stateCount, 2, 15)),
    burgDensity: roundTo(clampNumber(draft.burgDensity, 0.1, 1.5), 1),
    temperatureShift: Math.round(clampNumber(draft.temperatureShift, -20, 20)),
    precipitationFactor: roundTo(clampNumber(draft.precipitationFactor, 0.2, 3), 1),
  }
  if (draft.heightmapTemplate) normalized.heightmapTemplate = draft.heightmapTemplate
  else normalized.heightmapTemplate = undefined
  return normalized
}

function clampNumber(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function roundTo(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
</script>

<style scoped>
.voronoi-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: var(--surface-soft);
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--bg-secondary) 78%, transparent),
    inset 0 -28px 60px color-mix(in srgb, var(--shadow) 12%, transparent);
}

.voronoi-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Overlays */
.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-secondary) 92%, var(--bg-primary));
}

.empty-content, .loading-content, .error-content {
  text-align: center;
  max-width: 320px;
}

.empty-content { color: var(--text-secondary); }
.empty-title { font-size: 14px; margin: 12px 0 4px; color: var(--text-primary); }
.empty-desc { font-size: 12px; opacity: 0.6; line-height: 1.5; }

.loading-content { color: var(--text-primary); }
.loading-content p { font-size: 14px; margin-top: 12px; }

.error-content { color: var(--danger); max-width: 320px; }
.error-title { font-size: 14px; margin-bottom: 8px; }
.error-msg { font-size: 12px; color: var(--text-secondary); margin-bottom: 16px; }

.primary-btn-sm {
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

.primary-btn-sm:hover { background: var(--accent-hover); }
.primary-btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

/* Info bar */
.info-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  font-size: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(10px);
}

.info-name { font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.info-stats { color: var(--text-secondary); }

/* Top actions */
.top-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.canvas-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  color: var(--text-secondary);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 9px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--shadow) 65%, transparent);
  backdrop-filter: blur(10px);
}

.canvas-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 46%, var(--border));
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--accent) 6%);
}

.canvas-btn.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.canvas-btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}

.canvas-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Settings panel */
.settings-panel {
  position: absolute;
  top: 48px;
  right: 12px;
  background: color-mix(in srgb, var(--surface-raised) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 14px;
  padding: 14px;
  width: 292px;
  max-height: 75vh;
  overflow-y: auto;
  z-index: 20;
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(12px);
}

.settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.panel-subtitle { font-size: 11px; line-height: 1.4; color: var(--text-muted); margin: 0; }
.panel-section { margin-bottom: 14px; }
.panel-section:last-child { margin-bottom: 0; }
.section-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 8px; }

.config-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 74%, transparent);
  padding: 7px 9px;
}

.config-strip span {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
}

.config-strip strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.param-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-muted);
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.param-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.param-head strong {
  color: var(--text-primary);
  font-weight: 600;
}

.param-range {
  width: 100%;
  height: 4px;
  accent-color: var(--accent);
}

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.compact-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.compact-input {
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.compact-input:focus {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 12%, transparent);
}

.apply-btn { margin-top: 8px; width: 100%; justify-content: center; }

/* Bottom bar */
.bottom-bar {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 80px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.bottom-left { display: flex; flex-direction: column; gap: 6px; }

.mode-hint {
  width: max-content;
  max-width: 320px;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-raised));
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(10px);
}

.hint-text {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border-radius: 8px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  backdrop-filter: blur(10px);
}

.scale-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  padding: 4px 8px;
  backdrop-filter: blur(10px);
}

.scale-label { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }

.scale-select {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
}

.scale-select option { background: var(--bg-secondary); color: var(--text-primary); }

/* Zoom controls */
.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  padding: 4px 8px;
  backdrop-filter: blur(10px);
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.15s ease;
}

.zoom-btn:hover { background: var(--bg-hover); color: var(--accent); }
.zoom-btn.label { width: auto; min-width: 36px; font-size: 12px; }

/* Legend popup */
.legend-popup {
  position: absolute;
  bottom: 56px;
  left: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 14px;
  padding: 12px;
  width: 160px;
  max-height: 60vh;
  overflow-y: auto;
  z-index: 20;
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(12px);
}

.legend-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px; }
.legend-section { margin-bottom: 8px; }
.legend-section:last-child { margin-bottom: 0; }
.legend-section-title { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

.legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.legend-line {
  width: 16px;
  height: 0;
  border-top: 2px solid;
  flex-shrink: 0;
}

/* Spin animation lives in src/styles/main.css so it isn't redeclared per component. */
</style>
