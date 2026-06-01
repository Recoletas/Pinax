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
        {{ mapData.roads.length }} 路
      </div>
    </div>

    <!-- Top-right buttons -->
    <div v-if="mapData && !generating" class="top-actions">
      <button class="canvas-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        设置
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
      <h4 class="panel-title">渲染设置</h4>

      <div class="panel-section">
        <label class="section-label">渲染风格</label>
        <div class="style-grid">
          <button
            v-for="(label, key) in STYLE_LABELS"
            :key="key"
            class="style-btn"
            :class="{ active: stylePreset === key }"
            @click="handleStyleChange(key)"
          >{{ label }}</button>
        </div>
      </div>

      <div class="panel-section">
        <label class="section-label">图层显隐</label>
        <div class="layer-list">
          <label v-for="(label, key) in LAYER_LABELS" :key="key" class="layer-item">
            <input type="checkbox" :checked="layers[key] ?? true" @change="toggleLayer(key)" />
            <span>{{ label }}</span>
          </label>
        </div>
      </div>

      <div class="panel-section">
        <label class="section-label">板块构造</label>
        <div class="param-row">
          <span class="param-label">板块数量</span>
          <input type="range" min="2" max="12" step="1" :value="plateCount" @input="plateCount = Number($event.target.value)" class="param-range" />
          <span class="param-value">{{ plateCount }}</span>
        </div>
        <div class="param-row">
          <span class="param-label">板块速率</span>
          <input type="range" min="0.5" max="2" step="0.1" :value="plateSpeed" @input="plateSpeed = Number($event.target.value)" class="param-range" />
          <span class="param-value">{{ plateSpeed.toFixed(1) }}</span>
        </div>
        <button class="canvas-btn sm" style="margin-top: 6px" @click="regenerateWithTectonics">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          应用并重新生成
        </button>
      </div>
    </div>

    <!-- Bottom: legend + scale -->
    <div v-if="mapData && !generating" class="bottom-bar">
      <div class="bottom-left">
        <button class="canvas-btn sm" :class="{ active: showLegend }" @click="showLegend = !showLegend">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          图例
        </button>
        <div class="hint-text">
          <span>滚轮缩放</span>
          <span>拖拽平移</span>
          <span>双击添加标记</span>
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
        <div class="legend-row"><div class="legend-color" style="background:#2b6da8"></div><span>深海</span></div>
        <div class="legend-row"><div class="legend-color" style="background:#6baed6"></div><span>浅海</span></div>
        <div class="legend-row"><div class="legend-color" style="background:#b3d7ea"></div><span>近岸</span></div>
        <div class="legend-row"><div class="legend-line" style="border-color:#4a96d0"></div><span>河流</span></div>
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
import { generateMapInWorker, renderMap, renderMapAsync, STYLE_PRESET_LABELS } from '../../services/world-map/engine'
import { drawMarkers, hitTestMarker } from '../../services/world-map/markers'
import MapMarkerEditor from './MapMarkerEditor.vue'

const LAYER_LABELS = {
  terrain: '地形', coastlines: '海岸线', continents: '大陆轮廓', rivers: '河流', borders: '国界',
  provinces: '省界', roads: '道路', tectonics: '板块边界', oceanCurrents: '洋流', wind: '风场',
  stateLabels: '国名', burgIcons: '城镇', burgLabels: '地名', scaleBar: '比例尺', vignette: '暗角',
}

const STYLE_LABELS = STYLE_PRESET_LABELS

const props = defineProps({
  config: { type: Object, default: undefined },
  markers: { type: Array, default: () => [] },
})

const emit = defineEmits(['map-generated', 'add-marker', 'update-marker', 'delete-marker', 'marker-drag-end'])

const containerRef = ref(null)
const canvasRef = ref(null)
let offscreen = null

const mapData = shallowRef(null)
let mapDataRef = null
const generating = ref(false)
const error = ref(null)

let vp = { scale: 1, offsetX: 0, offsetY: 0 }
const scalePercent = ref(100)

const kmPerPixel = ref(1)
let kmPerPixelRef = 1

const showLegend = ref(false)
const showSettings = ref(false)

const stylePreset = ref(props.config?.stylePreset || 'topographic')
let stylePresetRef = stylePreset.value

const layers = ref({
  terrain: true, coastlines: true, continents: true, rivers: true, borders: true,
  provinces: false, roads: true, tectonics: false, oceanCurrents: false, wind: false,
  stateLabels: true, burgIcons: true, burgLabels: true, scaleBar: true, vignette: true,
})
const plateCount = ref(6)
const plateSpeed = ref(1.0)
let layersRef = { ...layers.value }

const exporting = ref(false)

const selectedMarkerId = ref(null)
const hoveredMarkerId = ref(null)
let isDraggingMarker = false
let dragMoved = false
let draggedMarker = null

const selectedMarker = computed(() =>
  props.markers.find(m => m.id === selectedMarkerId.value) || null
)

let canvasBgColor = '#1a1f2e'
try { canvasBgColor = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || canvasBgColor } catch {}

const configKey = computed(() => JSON.stringify(props.config || {}))

const mergedConfig = computed(() => ({
  width: 1200,
  height: 800,
  ...props.config,
}))

function withoutSeed(cfg) {
  const { seed: _seed, ...rest } = cfg
  return rest
}

function regenerate() {
  doGenerate(withoutSeed(mergedConfig.value))
}

function regenerateWithTectonics() {
  doGenerate(withoutSeed({ ...mergedConfig.value, plateCount: plateCount.value, plateSpeedFactor: plateSpeed.value }))
}

async function doGenerate(cfg) {
  if (generating.value) return
  generating.value = true
  error.value = null

  try {
    // 深拷贝 cfg 以剥离 Vue 响应式代理（Worker postMessage 要求纯数据）
    const plainCfg = JSON.parse(JSON.stringify(cfg))
    const data = await generateMapInWorker(plainCfg)

    // 释放旧 canvas 位图内存
    if (offscreen) {
      offscreen.width = 0
      offscreen.height = 0
      offscreen = null
    }

    const dpr = window.devicePixelRatio || 1
    const renderScale = Math.min(dpr, 3)
    const canvas = document.createElement('canvas')
    await renderMapAsync(canvas, data, {
      scale: renderScale,
      kmPerPixel: kmPerPixelRef,
      stylePreset: stylePresetRef,
      layers: layersRef,
    })
    offscreen = canvas
    mapDataRef = data
    mapData.value = data
    generating.value = false
    emit('map-generated', data)
  } catch (e) {
    console.error('[WorldMapVoronoi] Generation failed:', e)
    error.value = e instanceof Error ? e.message : String(e)
    generating.value = false
  }
}

async function rerender() {
  if (!mapDataRef) return
  // 释放旧 canvas 位图内存
  if (offscreen) {
    offscreen.width = 0
    offscreen.height = 0
  }
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  await renderMapAsync(canvas, mapDataRef, {
    scale: Math.min(dpr, 3),
    kmPerPixel: kmPerPixelRef,
    stylePreset: stylePresetRef,
    layers: layersRef,
  })
  offscreen = canvas
  paint()
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
  ctx.scale(vp.scale, vp.scale)
  ctx.translate(-vp.offsetX, -vp.offsetY)

  const md = mapDataRef
  const mapW = md?.width || offscreen.width
  const mapH = md?.height || offscreen.height
  ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, 0, 0, mapW, mapH)

  // 叠加绘制用户标记
  if (props.markers.length > 0) {
    drawMarkers(ctx, props.markers, selectedMarkerId.value, hoveredMarkerId.value)
  }
}

function fitToView() {
  if (!mapDataRef || !containerRef.value) return
  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  const fitScale = Math.min(cw / mapDataRef.width, ch / mapDataRef.height, 1)
  vp = { scale: fitScale, offsetX: -(cw / fitScale - mapDataRef.width) / 2, offsetY: -(ch / fitScale - mapDataRef.height) / 2 }
  scalePercent.value = Math.round(fitScale * 100)
}

function handleZoomBtn(delta) {
  const container = containerRef.value
  if (!container) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  const cx = vp.offsetX + cw / (2 * vp.scale)
  const cy = vp.offsetY + ch / (2 * vp.scale)
  const newScale = Math.max(0.2, Math.min(8, vp.scale * (delta > 0 ? 1.3 : 1 / 1.3)))
  vp.scale = newScale
  vp.offsetX = cx - cw / (2 * newScale)
  vp.offsetY = cy - ch / (2 * newScale)
  scalePercent.value = Math.round(newScale * 100)
  paint()
}

function handleFitView() {
  fitToView()
  paint()
}

function handleKmPerPixelChange(val) {
  kmPerPixelRef = val
  kmPerPixel.value = val
  rerender()
}

function toggleLayer(key) {
  layersRef = { ...layersRef, [key]: !layersRef[key] }
  layers.value = { ...layersRef }
  requestAnimationFrame(() => rerender())
}

function handleStyleChange(preset) {
  stylePresetRef = preset
  stylePreset.value = preset
  requestAnimationFrame(() => rerender())
}

function handleExportHD() {
  if (!mapDataRef || exporting.value) return
  exporting.value = true
  requestAnimationFrame(() => setTimeout(() => {
    try {
      const exportCanvas = document.createElement('canvas')
      renderMap(exportCanvas, mapDataRef, {
        scale: 5,
        kmPerPixel: kmPerPixelRef,
        stylePreset: stylePresetRef,
        layers: layersRef,
      })
      exportCanvas.toBlob(blob => {
        if (!blob) { exporting.value = false; return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${mapDataRef.name || 'map'}_${mapDataRef.width * 5}x${mapDataRef.height * 5}.png`
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
    x: vp.offsetX + (clientX - rect.left) / vp.scale,
    y: vp.offsetY + (clientY - rect.top) / vp.scale,
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
  const wx = vp.offsetX + mx / vp.scale
  const wy = vp.offsetY + my / vp.scale
  const newScale = Math.max(0.2, Math.min(8, vp.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
  vp.scale = newScale
  vp.offsetX = wx - mx / newScale
  vp.offsetY = wy - my / newScale
  scalePercent.value = Math.round(newScale * 100)
  paint()
}

function onPointerDown(e) {
  cachedRect = null
  const world = screenToWorld(e.clientX, e.clientY)
  const hitRadius = 16 / vp.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)

  if (e.button === 0 && hit) {
    // 点击/拖拽标记
    selectedMarkerId.value = hit.id
    hoveredMarkerId.value = null
    isDraggingMarker = true
    dragMoved = false
    draggedMarker = hit
    canvasRef.value?.setPointerCapture(e.pointerId)
    paint()
    return
  }

  // 未命中标记 → 平移
  selectedMarkerId.value = null
  isDraggingMarker = false
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  canvasRef.value?.setPointerCapture(e.pointerId)
  paint()
}

function onPointerMove(e) {
  const world = screenToWorld(e.clientX, e.clientY)

  if (isDraggingMarker && draggedMarker) {
    dragMoved = true
    const mapW = mapDataRef?.width || 1200
    const mapH = mapDataRef?.height || 800
    draggedMarker.x = Math.max(20, Math.min(mapW - 20, world.x))
    draggedMarker.y = Math.max(20, Math.min(mapH - 20, world.y))
    paint()
    return
  }

  if (dragging) {
    vp.offsetX -= (e.clientX - lastX) / vp.scale
    vp.offsetY -= (e.clientY - lastY) / vp.scale
    lastX = e.clientX
    lastY = e.clientY
    paint()
    return
  }

  // hover 检测
  const hitRadius = 16 / vp.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)
  const newHovered = hit?.id || null
  if (newHovered !== hoveredMarkerId.value) {
    hoveredMarkerId.value = newHovered
    canvasRef.value.style.cursor = newHovered ? 'pointer' : ''
    paint()
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
  const hitRadius = 16 / vp.scale
  const hit = hitTestMarker(props.markers, world.x, world.y, hitRadius)

  if (hit) {
    selectedMarkerId.value = hit.id
    paint()
  } else {
    emit('add-marker', world.x, world.y)
  }
}

// ── 标记事件处理 ──
function handleMarkerUpdate(id, patch) {
  emit('update-marker', id, patch)
}

function handleMarkerDelete(id) {
  emit('delete-marker', id)
  selectedMarkerId.value = null
}

// Watch for config changes
watch(configKey, () => {
  if (props.config && Object.keys(props.config).length > 0) {
    doGenerate(mergedConfig.value)
  }
})

watch(() => props.markers, () => { paint() })

// When mapData changes, fit to view and paint
watch(mapData, () => {
  if (!mapData.value) return
  fitToView()
  paint()
})

const onResize = () => { cachedRect = null; paint() }

function onKeyDown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId.value) {
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.target?.isContentEditable) return
    e.preventDefault()
    handleMarkerDelete(selectedMarkerId.value)
  }
}

onMounted(() => {
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
})
</script>

<style scoped>
.voronoi-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: var(--canvas-bg);
  overflow: hidden;
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
  background: var(--canvas-bg);
}

.empty-content, .loading-content, .error-content {
  text-align: center;
  max-width: 320px;
}

.empty-content { color: var(--canvas-text-secondary); }
.empty-title { font-size: 14px; margin: 12px 0 4px; color: var(--canvas-text); }
.empty-desc { font-size: 12px; opacity: 0.6; line-height: 1.5; }

.loading-content { color: var(--canvas-text); }
.loading-content p { font-size: 14px; margin-top: 12px; }

.error-content { color: var(--danger); max-width: 320px; }
.error-title { font-size: 14px; margin-bottom: 8px; }
.error-msg { font-size: 12px; color: var(--canvas-text-secondary); margin-bottom: 16px; }

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
  background: var(--canvas-overlay);
  color: var(--canvas-text);
  border-radius: 10px;
  padding: 8px 12px;
  border: 1px solid var(--canvas-border);
}

.info-name { font-weight: 600; color: var(--canvas-text); margin-bottom: 2px; }
.info-stats { color: var(--canvas-text-secondary); }

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
  background: var(--canvas-overlay);
  color: var(--canvas-text);
  border: 1px solid var(--canvas-border);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.canvas-btn:hover {
  color: var(--canvas-text);
  border-color: var(--canvas-border-hover);
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
  background: var(--canvas-overlay-strong);
  border: 1px solid var(--canvas-border);
  border-radius: 10px;
  padding: 12px;
  width: 208px;
  max-height: 75vh;
  overflow-y: auto;
  z-index: 20;
  box-shadow: var(--shadow-floating);
}

.panel-title { font-size: 12px; font-weight: 600; color: var(--canvas-text); margin: 0 0 10px; }
.panel-section { margin-bottom: 10px; }
.section-label { font-size: 12px; color: var(--canvas-text-secondary); display: block; margin-bottom: 6px; }

.style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.style-btn {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--canvas-border);
  background: var(--canvas-surface);
  color: var(--canvas-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.style-btn:hover { color: var(--canvas-text); border-color: var(--canvas-border-hover); }
.style-btn.active { background: color-mix(in srgb, var(--accent) 12%, var(--canvas-surface)); color: var(--accent); border-color: var(--accent); }

.layer-list { display: flex; flex-direction: column; gap: 4px; }

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 0;
}

.layer-item input[type="checkbox"] {
  accent-color: var(--accent);
  width: 12px;
  height: 12px;
}

.layer-item span {
  font-size: 12px;
  color: var(--canvas-text-secondary);
}

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.param-label {
  font-size: 12px;
  color: var(--canvas-text-secondary);
  min-width: 60px;
}

.param-range {
  flex: 1;
  accent-color: var(--accent);
  height: 4px;
}

.param-value {
  font-size: 12px;
  color: var(--canvas-text);
  min-width: 24px;
  text-align: right;
}

.layer-item:hover span { color: var(--canvas-text); }

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

.hint-text {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--canvas-text-muted);
  background: var(--canvas-overlay);
  border-radius: 8px;
  padding: 4px 8px;
  border: 1px solid var(--canvas-border);
}

.scale-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--canvas-overlay);
  border: 1px solid var(--canvas-border);
  border-radius: 8px;
  padding: 4px 8px;
}

.scale-label { font-size: 12px; color: var(--canvas-text-secondary); white-space: nowrap; }

.scale-select {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--canvas-text);
  outline: none;
  cursor: pointer;
}

.scale-select option { background: var(--canvas-overlay-strong); }

/* Zoom controls */
.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--canvas-overlay);
  border: 1px solid var(--canvas-border);
  border-radius: 8px;
  padding: 4px 8px;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--canvas-text);
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.15s ease;
}

.zoom-btn:hover { background: var(--canvas-border); color: var(--canvas-text); }
.zoom-btn.label { width: auto; min-width: 36px; font-size: 12px; }

/* Legend popup */
.legend-popup {
  position: absolute;
  bottom: 56px;
  left: 12px;
  background: var(--canvas-overlay-strong);
  border: 1px solid var(--canvas-border);
  border-radius: 10px;
  padding: 12px;
  width: 160px;
  max-height: 60vh;
  overflow-y: auto;
  z-index: 20;
  box-shadow: var(--shadow-floating);
}

.legend-title { font-size: 12px; font-weight: 600; color: var(--canvas-text); margin: 0 0 8px; }
.legend-section { margin-bottom: 8px; }
.legend-section:last-child { margin-bottom: 0; }
.legend-section-title { font-size: 11px; color: var(--canvas-text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

.legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--canvas-text-secondary);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 6px;
  border: 1px solid var(--canvas-border);
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
