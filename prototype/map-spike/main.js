/**
 * P1 spike 主入口：生成 fixture → 投影 MapDocument v2 → 三份原型。
 * 三份原型消费同一份数据；①代表当前基线，②③消费 v2 合同。
 */

import { generateMap, renderMapAsync } from '@/services/world-map/engine/index.ts'
import { MAP_FIXTURES, PRIMARY_PERF_FIXTURE } from '@/services/world-map/testing/fixtures.ts'
import { buildSemanticProjection } from './semantic-projection.js'
import { projectLegacyToMapDocumentV2, validateMapDocumentV2 } from '@/services/world-map/model/mapMigration.ts'
import { createP15Prototype } from './proto-p15.js'
import { renderLegacyCanvasPrototype } from './proto-canvas.js'
import { createOlRasterPrototype } from './proto-ol-raster.js'
import { createOlVectorPrototype } from './proto-ol-vector.js'
import { record, heapMB, installRafCounter } from './measurements.js'

const statusEl = document.getElementById('status')
function status(text) {
  statusEl.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 1)
}

installRafCounter()

// URL 参数：?places=2000 注入作者地点数；?fixture=dense12k 切压力模式（默认 author-semantic）
const params = new URLSearchParams(location.search)
const places = Number(params.get('places') ?? 2000)
const fixtureId = params.get('fixture') ?? 'author'
const fixture = fixtureId === 'author' ? null : (MAP_FIXTURES[fixtureId] ?? PRIMARY_PERF_FIXTURE)

// 确定性地点名池（不用 Math.random）
const NAME_CHARS = ['青岚', '沉沙', '白泽', '临渊', '照夜', '扶摇', '寒鸦', '落霞', '孤山', '观澜', '归墟', '回雁', '听雨', '折柳', '洗剑', '折戟', '栖霞', '枕流', '漱石', '横渠']

function makeInjectedPlaces(doc, count) {
  const seedNum = [...doc.seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  let state = seedNum || 1
  const rnd = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
  const land = doc.featureCollections.land
  if (!land.length) return []
  const { minX, minY, maxX, maxY } = doc.bounds
  const landRings = land
    .filter((f) => f.geometry.type === 'polygon')
    .map((f) => f.geometry.coordinates[0])
  const onLand = (x, y) => landRings.some((ring) => pointInRing(x, y, ring))
  const placesOut = []
  let attempts = 0
  while (placesOut.length < count && attempts < count * 30) {
    attempts++
    const x = minX + rnd() * (maxX - minX)
    const y = minY + rnd() * (maxY - minY)
    if (!onLand(x, y)) continue
    const i = placesOut.length
    const name = `${NAME_CHARS[i % NAME_CHARS.length]}${i % 97 === 0 ? '城' : '村'}`
    placesOut.push({
      mapObjectId: `narrative-place:inject-${i}`,
      geometry: { type: 'point', coordinates: [x, y] },
      properties: {
        featureId: `narrative-place:inject-${i}`,
        featureType: 'narrative-place',
        mapRevision: doc.revision,
        displayPriority: i % 10 === 0 ? 60 : 45,
        label: name,
        bindingStatus: i % 3 === 0 ? 'confirmed' : 'candidate',
      },
    })
  }
  return placesOut
}

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

let shared = null

async function prepare() {
  // P1.5 重做：视觉默认 = 固定 seed 真实生成结果；author-semantic 只保留给合同/策略测试
  if (fixtureId === 'author') {
    const t0 = performance.now()
    const legacy = generateMap({ ...MAP_FIXTURES.dense12k.config })
    const genMs = Math.round(performance.now() - t0)
    record('generationMs', genMs)
    const projected = projectLegacyToMapDocumentV2(legacy, {
      mapAssetId: 'p15-real',
      projectId: 'spike-project',
      worldbookId: 'spike-worldbook',
      revision: 1,
      generatorVersion: 'p1.5-real',
    })
    const doc = projected.document
    const validation = validateMapDocumentV2(doc)
    record('v2ValidationOk', validation.ok)
    record('vectorFeatureCount', Object.values(doc.featureCollections).reduce((s, l) => s + l.length, 0))
    record('landFeatureCount', doc.featureCollections.land.length)
    record('waterFeatureCount', doc.featureCollections.water.length)
    record('riverFeatureCount', doc.featureCollections.rivers.length)

    // 浅色地形底图：真实地形/海岸烘焙；河流改矢量层（P1.6A 河网主干化）；
    // 内置标签/图标关闭（地点由视图层统一绘制）
    const terrainCanvas = document.createElement('canvas')
    terrainCanvas.width = doc.baseAsset.width
    terrainCanvas.height = doc.baseAsset.height
    const tR = performance.now()
    await renderMapAsync(terrainCanvas, legacy, {
      stylePreset: 'atlas',
      layers: {
        stateLabels: false, burgIcons: false, burgLabels: false, roads: false,
        borders: false, borderlands: false, landDividers: false,
        scaleBar: false, vignette: false, coastGlow: false,
        rivers: false, terrain: true, coastlines: true, ice: false,
      },
    })

    // P1.6B 浅海白边收窄：水体高光压缩。水体判定=蓝分量不弱于红/绿；
    // 亮度 > 168 的浅海像素向 168 压（半强），白边变窄、云朵白团变暗，
    // 陆地苔原/雪峰不受影响（绿色/暖色分量占优）。
    {
      const ictx = terrainCanvas.getContext('2d', { willReadFrequently: true })
      const img = ictx.getImageData(0, 0, terrainCanvas.width, terrainCanvas.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (lum <= 168) continue
        const waterish = b >= r - 4 && g <= b + 8
        if (!waterish) continue
        const f = (168 + (lum - 168) * 0.45) / lum
        d[i] = Math.round(r * f)
        d[i + 1] = Math.round(g * f)
        d[i + 2] = Math.round(b * f)
      }
      ictx.putImageData(img, 0, 0)
    }

    // 减生成器感（柔化回退，P1.6B）：0.8x 降采样 + 更轻的自模糊。
    // 目标是压低 cell 边界对比，而不是把整张地形糊掉——大块山/林/平原结构保持可辨。
    const soften = document.createElement('canvas')
    soften.width = Math.round(terrainCanvas.width * 0.8)
    soften.height = Math.round(terrainCanvas.height * 0.8)
    const sctx = soften.getContext('2d')
    sctx.imageSmoothingEnabled = true
    sctx.drawImage(terrainCanvas, 0, 0, soften.width, soften.height)
    const tctx = terrainCanvas.getContext('2d')
    tctx.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height)
    tctx.imageSmoothingEnabled = true
    tctx.drawImage(soften, 0, 0, terrainCanvas.width, terrainCanvas.height)
    tctx.save()
    tctx.filter = 'blur(0.7px)'
    tctx.globalAlpha = 0.35
    tctx.drawImage(terrainCanvas, 0, 0)
    tctx.restore()
    record('terrainRenderMs', Math.round(performance.now() - tR))

    // 采样海洋色，把视口边缘（地图 extent 之外）延伸为开放海面，消除黑沟
    const oceanColor = (() => {
      const c = terrainCanvas.getContext('2d').getImageData(4, 4, 1, 1).data
      return `rgb(${c[0]},${c[1]},${c[2]})`
    })()

    const semantic = buildSemanticProjection({ document: doc, legacy })
    shared = {
      kind: 'p15real',
      doc,
      legacy,
      terrainCanvas,
      oceanColor,
      projection: semantic,
      onStateChange: (s) => { window.__mapSpikePolicyState = s },
    }
    status(`就绪 fixture=真实生成(dense12k, seed=${legacy.seed}) 生成=${genMs}ms 陆块=${record('landFeatureCount')} 河=${record('riverFeatureCount')} v2校验=${validation.ok ? '通过' : '失败'} 当前场=${semantic.sceneAnchorId}`)
    return
  }
  const t0 = performance.now()
  const legacy = generateMap({ ...fixture.config })
  const genMs = Math.round(performance.now() - t0)
  record('generationMs', genMs)
  record('heapAfterGenerationMB', heapMB())

  const projected = projectLegacyToMapDocumentV2(legacy, {
    mapAssetId: 'spike-dense',
    projectId: 'spike-project',
    worldbookId: 'spike-worldbook',
    revision: 1,
    generatorVersion: 'p1-spike',
    legacyMapId: 'map-spike',
    legacyMarkers: [],
  })
  document.getElementById('status')
  const doc = projected.document
  doc.featureCollections.narrativePlaces.push(...makeInjectedPlaces(doc, places))
  const vectorCount = Object.values(doc.featureCollections).reduce((s, l) => s + l.length, 0)
  const validation = validateMapDocumentV2(doc)
  record('vectorFeatureCount', vectorCount)
  record('v2ValidationOk', validation.ok)
  if (!validation.ok) status('v2 校验失败: ' + JSON.stringify(validation.errors.slice(0, 4)))

  // 地形画布:①基线全渲染 + ②浅色(atlas)/深色(dark)两张主题底图
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = doc.baseAsset.width
  fullCanvas.height = doc.baseAsset.height
  const tR0 = performance.now()
  await renderMapAsync(fullCanvas, legacy, { stylePreset: 'atlas' })
  const rasterMs = Math.round(performance.now() - tR0)
  record('legacyFullRenderMs', rasterMs)
  record('fontReadyAtMs', Math.round(performance.now()))

  const terrainLayers = {
    stateLabels: false, burgIcons: false, burgLabels: false, roads: false,
    borders: false, borderlands: false, landDividers: false,
    rivers: false,        // 河流走矢量层，避免栅格放大发虚
    coastGlow: false,     // 深色主题下光晕显脏（用户反馈）
    scaleBar: false, vignette: false,
  }
  const renderTerrain = async (preset) => {
    const c = document.createElement('canvas')
    c.width = doc.baseAsset.width
    c.height = doc.baseAsset.height
    const t = performance.now()
    // 深色主题：冰盖与海岸描边在暗底上呈灰白光晕（用户反馈），单独关闭
    const extra = preset === 'dark' ? { ice: false, coastlines: false } : {}
    await renderMapAsync(c, legacy, { stylePreset: preset, layers: { ...terrainLayers, ...extra } })
    record(`terrain_${preset}_renderMs`, Math.round(performance.now() - t))
    return c
  }
  const terrainLight = await renderTerrain('atlas')
  const terrainDark = await renderTerrain('dark')

  shared = { kind: 'generated', legacy, doc, fullCanvas, terrainCanvases: { light: terrainLight, dark: terrainDark } }
  status(`就绪 fixture=${fixture.id} 生成=${genMs}ms 基线全渲染=${rasterMs}ms 矢量feature=${vectorCount} v2校验=${validation.ok ? '通过' : '失败'} heap=${heapMB()}MB`)
}

// ── 原型切换与懒创建/销毁 ──
let mapTheme = 'light'
const DEFAULT_PROTO = fixtureId === 'author' ? 'p15' : 'ol-raster'
const factories = {
  p15: () => createP15Prototype(document.getElementById('pane-p15'), shared),
  canvas: () => renderLegacyCanvasPrototype(document.getElementById('pane-canvas'), shared),
  'ol-raster': () => createOlRasterPrototype(document.getElementById('pane-ol-raster'), shared, mapTheme),
  'ol-vector': () => createOlVectorPrototype(document.getElementById('pane-ol-vector'), shared),
}
const active = { proto: DEFAULT_PROTO, instance: null }

function paneId(proto) {
  return { p15: 'pane-p15', canvas: 'pane-canvas', 'ol-raster': 'pane-ol-raster', 'ol-vector': 'pane-ol-vector' }[proto]
}

function disposeActive() {
  if (active.instance) {
    active.instance.dispose()
    active.instance = null
    record(`dispose_${active.proto}_atMs`, Math.round(performance.now()))
  }
}

document.getElementById('proto-tabs').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-proto]')
  if (!btn) return
  const target = btn.dataset.proto
  if (target === active.proto) return
  if (shared?.kind === 'author' && target !== 'p15') {
    status('author-semantic fixture 只支持 P1.5 写作地图；生成器原型请用 ?fixture=dense12k')
    return
  }
  disposeActive()
  active.proto = target
  document.querySelectorAll('.proto-tabs button').forEach((b) => b.classList.toggle('active', b === btn))
  document.querySelectorAll('#stage .pane').forEach((p) => p.classList.toggle('active', p.id === paneId(target)))
  document.getElementById('mode-tabs').style.display = target === 'p15' ? 'flex' : 'none'
  if (!shared) await prepare()
  const t0 = performance.now()
  active.instance = await factories[target]()
  window.__mapSpikeActive = active.instance
  record(`mount_${target}_ms`, Math.round(performance.now() - t0))
  status(`${label(target)} 已挂载（${Math.round(performance.now() - t0)}ms）· vectorFeature=${record('vectorFeatureCount')}`)
})

// P1.5 模式切换（writing/explore/review）
document.getElementById('mode-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]')
  if (!btn || active.proto !== 'p15') return
  document.querySelectorAll('#mode-tabs button').forEach((b) => b.classList.toggle('active', b === btn))
  active.instance?.setMode?.(btn.dataset.mode)
  status(`P1.5 模式 → ${btn.dataset.mode}`)
})

function label(proto) {
  return {
    p15: 'P1.5 写作地图',
    canvas: '① 当前 Canvas 基线',
    'ol-raster': '② OL 地形+地点矢量',
    'ol-vector': '③ OL 全矢量',
  }[proto]
}

// 主题切换：同一张地图的浅色/深色（用户反馈：①与③应为主题变体而非两个方向）
document.getElementById('btn-theme').addEventListener('click', () => {
  mapTheme = mapTheme === 'light' ? 'dark' : 'light'
  document.getElementById('btn-theme').textContent = `主题：${mapTheme === 'light' ? '浅色' : '深色'}`
  if (active.proto === 'ol-raster' && active.instance?.setTheme) {
    active.instance.setTheme(mapTheme)
    status(`已切换为${mapTheme === 'light' ? '浅色' : '深色'}主题`)
  } else if (active.proto !== 'ol-raster') {
    status('主题切换当前只作用于原型②（地形底图 + 地点矢量）')
  }
})

// 工具按钮
document.getElementById('btn-zoom-burst').addEventListener('click', async () => {
  if (!active.instance?.getView) { status('当前原型不支持缩放测帧'); return }
  const { measureZoomBurst } = await import('./measurements.js')
  const view = active.instance.getView()
  const result = await measureZoomBurst(view, 6000)
  record(`zoomBurst_${active.proto}`, result)
  status(`连续缩放 6s：${result.fps}fps，长帧>32ms=${result.longFrames32}，>50ms=${result.longFrames50}`)
})
document.getElementById('btn-mount-20').addEventListener('click', async () => {
  const { measureMountUnmount } = await import('./measurements.js')
  const protoKey = active.proto
  const factory = factories[protoKey]
  const result = await measureMountUnmount(() => factory(), 20)
  record(`mountUnmount20_${protoKey}`, result)
  status(`20 次挂载/卸载（${label(protoKey)}）：heap ${result.heapBeforeMB}→${result.heapAfterMB}MB（Δ${result.heapDeltaMB}MB），dispose 中位 ${median(result.disposeTimesMs)}ms`)
})
document.getElementById('btn-report').addEventListener('click', async () => {
  const { exportRecords } = await import('./measurements.js')
  exportRecords()
  status('测量 JSON 已下载')
})
function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// 首次进入自动准备数据并挂载当前原型
prepare().then(async () => {
  if (!shared) return
  // 按 fixture 同步默认激活的按钮/面板
  document.querySelectorAll('.proto-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.proto === active.proto))
  document.querySelectorAll('#stage .pane').forEach((p) => p.classList.toggle('active', p.id === paneId(active.proto)))
  document.getElementById('mode-tabs').style.display = active.proto === 'p15' ? 'flex' : 'none'
  const t0 = performance.now()
  active.instance = await factories[active.proto]()
  window.__mapSpikeActive = active.instance
  record(`mount_${active.proto}_ms`, Math.round(performance.now() - t0))
  status(`就绪 fixture=${fixtureId} · 矢量feature=${record('vectorFeatureCount')} · ${label(active.proto)} 已挂载`)
})
