/**
 * Voronoi 地图 Canvas 渲染器
 * 支持风格预设、图层显隐、省份、道路
 */

import type { VoronoiMapData, LayerVisibility, BiomeOverride, MapStylePreset, Feature, PlateBoundary } from './types'
import { BIOMES } from './climate'
import { computeBorderlands } from './borderlands'
import { hillshadeAlpha } from './hillshade'
import { getStyleConfig, type StyleConfig } from './style-presets'
import { getPipeline, type LayerSpec } from './renderer-pipeline'

const TERRAIN_BIOME_COLORS: Record<number, string> = {
  1: '#dfbd43',
  2: '#c8d0c8',
  3: '#b5d45e',
  4: '#93cc4d',
  5: '#69b84b',
  6: '#3fa23d',
  7: '#218635',
  8: '#2b7d36',
  9: '#456f35',
  10: '#d8ded8',
  11: '#f4f7f6',
  12: '#4a9c72',
}

/** 渲染选项 */
export interface RenderOptions {
  /** 像素缩放倍率（默认 1） */
  scale?: number
  /** 比例尺：1 像素代表多少公里 */
  kmPerPixel?: number
  /** 渲染风格 */
  stylePreset?: MapStylePreset
  /** 图层显隐 */
  layers?: LayerVisibility
  /** 自定义生态群落配色 */
  biomeOverrides?: BiomeOverride[]
}

/** 默认图层全部显示 */
const DEFAULT_LAYERS: Required<LayerVisibility> = {
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
  stateLabels: true,
  burgIcons: true,
  burgLabels: true,
  scaleBar: true,
  vignette: true,
  oceanCurrents: false,
  wind: false,
  tectonics: false,
}

type BorderSegment = { a: number; b: number; cellA: number; cellB: number }
type BorderSegmentGroup = { sidA: number; sidB: number; segments: BorderSegment[] }

/**
 * 渲染完整地图
 */
export function renderMap(
  canvas: HTMLCanvasElement,
  data: VoronoiMapData,
  scaleOrOptions: number | RenderOptions = 1,
): void {
  const opts: RenderOptions = typeof scaleOrOptions === 'number'
    ? { scale: scaleOrOptions }
    : scaleOrOptions
  const scale = opts.scale ?? 1
  const kmPerPixel = opts.kmPerPixel ?? 1
  const style = getStyleConfig(opts.stylePreset)
  const layers = { ...DEFAULT_LAYERS, ...opts.layers }

  // 构建有效的 biome 配色（覆盖默认）
  const biomeColors = BIOMES.map(b => b.color)
  if (opts.biomeOverrides) {
    for (const ov of opts.biomeOverrides) {
      if (ov.color && ov.id >= 0 && ov.id < biomeColors.length) {
        biomeColors[ov.id] = ov.color
      }
    }
  }

  const { width, height } = data
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true

  if (scale !== 1) ctx.scale(scale, scale)

  // 按 pipeline 顺序绘制（preset 决定哪些层开启；opts.layers 可逐层覆盖）
  const pipeline = getPipeline(opts.stylePreset || 'topographic')
  for (const layer of pipeline) {
    if (!layer.enabled) continue
    if ((layers as unknown as Record<string, boolean | undefined>)[layer.name] === false) continue
    drawPipelineLayer(ctx, data, style, biomeColors, width, height, kmPerPixel, layer)
  }

  // 老 layer 名（不在 pipeline 中）—— 保留向后兼容
  if (layers.continents) drawContinents(ctx, data, style)
  if (layers.provinces) drawProvinceBorders(ctx, data, style)
  if (layers.tectonics) drawTectonicBoundaries(ctx, data, style)
  if (layers.oceanCurrents) drawOceanCurrents(ctx, data, style)
  if (layers.wind) drawWindField(ctx, data, style)

  // 风格叠加滤镜
  if (style.overlayColor) {
    ctx.fillStyle = style.overlayColor
    ctx.fillRect(0, 0, width, height)
  }
}

/** 渲染比例尺 overlay。用于 UI 中只更新 kmPerPixel 时避免重绘整张地图。 */
export function renderScaleBarLayer(
  canvas: HTMLCanvasElement,
  data: VoronoiMapData,
  scaleOrOptions: number | RenderOptions = 1,
): void {
  const opts: RenderOptions = typeof scaleOrOptions === 'number'
    ? { scale: scaleOrOptions }
    : scaleOrOptions
  const scale = opts.scale ?? 1
  const kmPerPixel = opts.kmPerPixel ?? 1
  const style = getStyleConfig(opts.stylePreset)
  const layers = { ...DEFAULT_LAYERS, ...opts.layers }
  const { width, height } = data
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const scaleBarLayer = getPipeline(opts.stylePreset || 'topographic').find(layer => layer.name === 'scaleBar')
  if (!scaleBarLayer?.enabled || layers.scaleBar === false) return
  if (scale !== 1) ctx.scale(scale, scale)
  drawScaleBar(ctx, width, height, kmPerPixel, style)
  if (style.overlayColor) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = style.overlayColor
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}

/** 渲染 pipeline 中单个 layer */
function drawPipelineLayer(
  ctx: CanvasRenderingContext2D,
  data: VoronoiMapData,
  style: StyleConfig,
  biomeColors: string[],
  width: number,
  height: number,
  kmPerPixel: number,
  layer: LayerSpec,
): void {
  switch (layer.name) {
    case 'hillshade': drawHillshade(ctx, data, style, layer.options); break
    case 'terrain': drawTerrain(ctx, data, style, biomeColors); break
    case 'ice': drawIceOverlay(ctx, data); break
    case 'coastlines': drawCoastlines(ctx, data, style); break
    case 'coastGlow': drawCoastGlow(ctx, data, style); break
    case 'volcanoes': drawVolcanoes(ctx, data, style); break
    case 'rivers': drawRivers(ctx, data, style); break
    case 'landDividers': drawLandDividers(ctx, data, layer.options); break
    case 'borders': drawBorders(ctx, data, style, layer.options); break
    case 'borderlands': drawBorderlands(ctx, data, style, layer.options); break
    case 'factionTexture': drawFactionTexture(ctx, data, style, layer.options); break
    case 'roads': drawRoads(ctx, data, style); break
    case 'stateLabels': drawStateLabels(ctx, data, style); break
    case 'burgIcons': drawBurgs(ctx, data, style); break
    case 'burgLabels': drawBurgLabels(ctx, data, style); break
    case 'scaleBar': drawScaleBar(ctx, width, height, kmPerPixel, style); break
    case 'vignette': drawVignette(ctx, width, height, style); break
  }
}

/** 让出主线程 */
const yieldToMain = () => new Promise<void>(r => setTimeout(r, 0))

/**
 * 异步渲染完整地图 — 每层之间让出主线程，防止页面卡死
 */
export async function renderMapAsync(
  canvas: HTMLCanvasElement,
  data: VoronoiMapData,
  scaleOrOptions: number | RenderOptions = 1,
): Promise<void> {
  const opts: RenderOptions = typeof scaleOrOptions === 'number'
    ? { scale: scaleOrOptions }
    : scaleOrOptions
  const scale = opts.scale ?? 1
  const kmPerPixel = opts.kmPerPixel ?? 1
  const style = getStyleConfig(opts.stylePreset)
  const layers = { ...DEFAULT_LAYERS, ...opts.layers }

  const biomeColors = BIOMES.map(b => b.color)
  if (opts.biomeOverrides) {
    for (const ov of opts.biomeOverrides) {
      if (ov.color && ov.id >= 0 && ov.id < biomeColors.length) {
        biomeColors[ov.id] = ov.color
      }
    }
  }

  const { width, height } = data
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  if (scale !== 1) ctx.scale(scale, scale)

  // 按 pipeline 顺序绘制（preset 决定哪些层开启；opts.layers 可逐层覆盖）
  const pipeline = getPipeline(opts.stylePreset || 'topographic')
  for (const layer of pipeline) {
    if (!layer.enabled) continue
    if ((layers as unknown as Record<string, boolean | undefined>)[layer.name] === false) continue
    drawPipelineLayer(ctx, data, style, biomeColors, width, height, kmPerPixel, layer)
    await yieldToMain()
  }

  // 老 layer 名（不在 pipeline 中）—— 保留向后兼容
  if (layers.continents) { drawContinents(ctx, data, style); await yieldToMain() }
  if (layers.provinces) { drawProvinceBorders(ctx, data, style); await yieldToMain() }
  if (layers.tectonics) { drawTectonicBoundaries(ctx, data, style); await yieldToMain() }
  if (layers.oceanCurrents) { drawOceanCurrents(ctx, data, style); await yieldToMain() }
  if (layers.wind) { drawWindField(ctx, data, style); await yieldToMain() }

  if (style.overlayColor) {
    ctx.fillStyle = style.overlayColor
    ctx.fillRect(0, 0, width, height)
  }
}

// ── 地形 ────────────────────────────────────────────

function drawTerrain(
  ctx: CanvasRenderingContext2D, data: VoronoiMapData,
  style: StyleConfig, biomeColors: string[],
): void {
  const { cells, vertices, width, height } = data
  const terrainColors = computeTerrainBaseColors(data, style, biomeColors)

  ctx.fillStyle = style.oceanBg
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < cells.length; i++) {
    const cellVerts = cells.v[i]
    if (!cellVerts || cellVerts.length < 3) continue

    const rgb = smoothTerrainColor(cells, i, terrainColors)
    const texture = cells.h[i] >= 20 ? terrainTexture(cells, i) : 0
    const nearCoastRgb = applyCoastalTone(cells, i, rgb)
    ctx.fillStyle = rgbToCss(applyRgbDelta(nearCoastRgb, texture))

    ctx.beginPath()
    for (let j = 0; j < cellVerts.length; j++) {
      const vi = cellVerts[j]
      const vx = vertices.p[vi * 2]
      const vy = vertices.p[vi * 2 + 1]
      if (j === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
  }
}

// ── 海岸线 ──────────────────────────────────────────

function drawCoastlines(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = 'rgba(236, 248, 246, 0.48)'
  ctx.lineWidth = 8.8
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)

  ctx.strokeStyle = 'rgba(126, 196, 205, 0.34)'
  ctx.lineWidth = 5.2
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)

  ctx.strokeStyle = 'rgba(249, 241, 196, 0.42)'
  ctx.lineWidth = 2.8
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)

  ctx.strokeStyle = colorWithAlpha(style.coastline, 0.78)
  ctx.lineWidth = 1.15
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)
}

function drawCoastPath(
  ctx: CanvasRenderingContext2D,
  coast: VoronoiMapData['coastlines'][number],
  width: number,
  height: number,
): void {
  if (!coast || coast.length < 2) return
  ctx.beginPath()
  if (coast.length < 8) {
    ctx.moveTo(coast[0][0] * width, coast[0][1] * height)
    for (let i = 1; i < coast.length; i++) {
      ctx.lineTo(coast[i][0] * width, coast[i][1] * height)
    }
    ctx.closePath()
    ctx.stroke()
    return
  }
  const n = coast.length
  const mx0 = (coast[0][0] + coast[1][0]) * 0.5 * width
  const my0 = (coast[0][1] + coast[1][1]) * 0.5 * height
  ctx.moveTo(mx0, my0)
  for (let i = 0; i < n; i++) {
    const cur = coast[i]
    const nxt = coast[(i + 1) % n]
    const cx = nxt[0] * width
    const cy = nxt[1] * height
    const after = coast[(i + 2) % n]
    const ex = (nxt[0] + after[0]) * 0.5 * width
    const ey = (nxt[1] + after[1]) * 0.5 * height
    ctx.quadraticCurveTo(cx, cy, ex, ey)
  }
  ctx.closePath()
  ctx.stroke()
}

// ── 大陆轮廓 ──────────────────────────────────────────

function drawContinents(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { cells, vertices, features } = data
  if (!features || features.length < 2) return

  // 调色板：为不同大陆/岛屿分配不同颜色
  const palette = [
    'rgba(180,140,80,0.8)',   // 金棕
    'rgba(120,160,100,0.8)',  // 橄榄绿
    'rgba(160,100,80,0.8)',   // 赭石
    'rgba(100,130,160,0.8)',  // 灰蓝
    'rgba(140,120,160,0.8)',  // 薰衣草
    'rgba(160,140,100,0.8)',  // 卡其
    'rgba(100,150,130,0.8)',  // 青绿
    'rgba(150,110,130,0.8)',  // 玫瑰灰
  ]

  // 收集大陆/岛屿 feature 的轮廓边
  const continentFeatures = features.filter(f => f && (f.type === 'continent' || f.type === 'island'))

  for (let fi = 0; fi < continentFeatures.length; fi++) {
    const feature = continentFeatures[fi]
    const color = palette[fi % palette.length]

    // 收集该 feature 的陆-水边界线段
    const segs: [number, number, number, number][] = []
    for (const cellId of feature.border) {
      const cv = cells.v[cellId]
      if (!cv || cv.length < 3) continue
      for (let j = 0; j < cv.length; j++) {
        const vi = cv[j], viN = cv[(j + 1) % cv.length]
        const ac = vertices.c[vi], acN = vertices.c[viN]
        if (!ac || !acN) continue
        const shared = sharedCellIds(ac, acN)
        if (shared.some(c => cells.h[c] < 20) && shared.some(c => cells.h[c] >= 20)) {
          segs.push([vertices.p[vi * 2], vertices.p[vi * 2 + 1], vertices.p[viN * 2], vertices.p[viN * 2 + 1]])
        }
      }
    }

    if (segs.length === 0) continue

    // 光晕层
    ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)')
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [x1, y1, x2, y2] of segs) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }

    // 主轮廓
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    for (const [x1, y1, x2, y2] of segs) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
  }
}

// ── 河流 ────────────────────────────────────────────

function drawRivers(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  for (const river of data.rivers) {
    if (river.points.length < 2) continue
    const polygon = buildRiverPolygon(river.points, river.widths)
    if (polygon.length < 4) continue

    ctx.fillStyle = style.river
    ctx.beginPath()
    ctx.moveTo(polygon[0][0], polygon[0][1])
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i][0], polygon[i][1])
    }
    ctx.closePath()
    ctx.fill()

    const maxWidth = river.widths.reduce((best, w) => Math.max(best, w || 0), 0)
    if (maxWidth > 2.4) {
      ctx.strokeStyle = style.riverHighlight
      ctx.lineWidth = Math.max(0.35, maxWidth * 0.16)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      drawCenterline(ctx, river.points)
    }
  }
}

// ── 道路 ────────────────────────────────────────────

function drawRoads(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  if (!data.roads || data.roads.length === 0) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const road of data.roads) {
    if (road.points.length < 2) continue

    switch (road.type) {
      case 'major':
        ctx.strokeStyle = style.roadMajor
        ctx.lineWidth = 2
        ctx.setLineDash([])
        break
      case 'minor':
        ctx.strokeStyle = style.roadMinor
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        break
      case 'trade':
        ctx.strokeStyle = style.roadTrade
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 4])
        break
      case 'sea':
        ctx.strokeStyle = style.roadSea
        ctx.lineWidth = 1
        ctx.setLineDash([3, 5])
        break
    }

    ctx.beginPath()
    ctx.moveTo(road.points[0][0], road.points[0][1])
    for (let i = 1; i < road.points.length; i++) {
      if (i < road.points.length - 1 && isGentleTurn(road.points[i - 1], road.points[i], road.points[i + 1])) {
        const mx = (road.points[i][0] + road.points[i + 1][0]) / 2
        const my = (road.points[i][1] + road.points[i + 1][1]) / 2
        ctx.quadraticCurveTo(road.points[i][0], road.points[i][1], mx, my)
      } else {
        ctx.lineTo(road.points[i][0], road.points[i][1])
      }
    }
    ctx.stroke()
  }

  ctx.setLineDash([])
}

// ── 省份边界 ────────────────────────────────────────

function drawProvinceBorders(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  // 阶段 4:直接读 cells.province,不再每帧重算 Voronoi
  if (!data.provinces || data.provinces.length <= 1) return
  const { cells, vertices } = data
  const cellProv = cells.province
  if (!cellProv) return

  // 画省界
  ctx.strokeStyle = style.provinceBorder
  ctx.lineWidth = 0.8
  ctx.setLineDash([3, 3])
  ctx.lineCap = 'round'

  for (let i = 0; i < cells.length; i++) {
    if (cellProv[i] === 0) continue
    for (const neighbor of cells.c[i]) {
      if (cellProv[neighbor] === cellProv[i]) continue
      if (cells.state[neighbor] !== cells.state[i]) continue // 国界不画省界
      if (cells.h[neighbor] < 20) continue

      const nv = cells.v[neighbor]
      const shared = nv ? sharedCellIds(cells.v[i], nv) : []
      if (shared.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(vertices.p[shared[0] * 2], vertices.p[shared[0] * 2 + 1])
        ctx.lineTo(vertices.p[shared[1] * 2], vertices.p[shared[1] * 2 + 1])
        ctx.stroke()
      }
    }
  }
  ctx.setLineDash([])
}

// ── 陆地内部划分线 ────────────────────────────────────

function drawLandDividers(
  ctx: CanvasRenderingContext2D,
  data: VoronoiMapData,
  options?: Record<string, unknown>,
): void {
  const groups = collectBorderSegmentGroups(data)
  if (groups.size === 0) return

  const maxLines = typeof options?.maxLines === 'number' ? Math.max(1, options.maxLines) : 4
  const minLength = Math.min(data.width, data.height) * 0.18
  const candidates: Array<{
    chain: number[]
    length: number
    sidA: number
    sidB: number
    inlandScore: number
  }> = []

  for (const group of groups.values()) {
    const inlandSegments = group.segments.filter(segment => isLandDividerSegment(data, segment))
    if (inlandSegments.length < 3) continue

    let bestChain: number[] | null = null
    let bestLength = 0
    let bestInlandScore = 0
    for (const chain of chainBorderSegments(inlandSegments)) {
      if (chain.length < 4) continue
      const length = chainLength(chain, data.vertices.p)
      if (length < minLength) continue
      const inlandScore = chainInlandScore(chain, data)
      if (inlandScore < 2.8) continue
      if (length > bestLength) {
        bestChain = chain
        bestLength = length
        bestInlandScore = inlandScore
      }
    }

    if (bestChain) {
      candidates.push({
        chain: bestChain,
        length: bestLength,
        sidA: group.sidA,
        sidB: group.sidB,
        inlandScore: bestInlandScore,
      })
    }
  }

  candidates.sort((a, b) => (b.length * b.inlandScore) - (a.length * a.inlandScore))

  const picked: typeof candidates = []
  const stateUse = new Map<number, number>()
  for (const candidate of candidates) {
    if (picked.length >= maxLines) break
    const useA = stateUse.get(candidate.sidA) || 0
    const useB = stateUse.get(candidate.sidB) || 0
    if (useA >= 2 || useB >= 2) continue
    if (picked.some(existing => chainsTooClose(existing.chain, candidate.chain, data.vertices.p))) continue
    picked.push(candidate)
    stateUse.set(candidate.sidA, useA + 1)
    stateUse.set(candidate.sidB, useB + 1)
  }

  if (picked.length === 0) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])

  for (const item of picked) {
    strokeVertexChain(ctx, item.chain, data.vertices.p, 'rgba(255, 250, 225, 0.16)', 2.2)
    strokeVertexChain(ctx, item.chain, data.vertices.p, 'rgba(63, 52, 38, 0.24)', 1.1)
  }

  ctx.restore()
}

// ── 国界 ────────────────────────────────────────────

function drawBorders(
  ctx: CanvasRenderingContext2D,
  data: VoronoiMapData,
  style: StyleConfig,
  options?: Record<string, unknown>,
): void {
  const borderStyle = options?.style === 'azgaar' ? 'azgaar' : 'simple'
  const groups = collectBorderSegmentGroups(data)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const group of groups.values()) {
    const alpha = borderStyle === 'azgaar' ? Math.min(1, style.borderAlpha + 0.26) : style.borderAlpha
    for (const chain of chainBorderSegments(group.segments)) {
      if (chain.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(data.vertices.p[chain[0] * 2], data.vertices.p[chain[0] * 2 + 1])
      for (let i = 1; i < chain.length; i++) {
        ctx.lineTo(data.vertices.p[chain[i] * 2], data.vertices.p[chain[i] * 2 + 1])
      }
      ctx.setLineDash([])
      ctx.strokeStyle = borderStyle === 'azgaar'
        ? 'rgba(255,255,230,0.96)'
        : 'rgba(255,255,255,0.56)'
      ctx.lineWidth = borderStyle === 'azgaar' ? 6.4 : 2.8
      ctx.stroke()

      ctx.setLineDash([])
      ctx.strokeStyle = borderStyle === 'azgaar'
        ? 'rgba(22,17,11,0.82)'
        : 'rgba(50,42,32,0.34)'
      ctx.lineWidth = borderStyle === 'azgaar' ? 3.1 : 1.4
      ctx.stroke()

      ctx.setLineDash(borderStyle === 'azgaar' ? [7, 3.5] : [4, 3])
      ctx.strokeStyle = `rgba(73, 48, 25, ${alpha})`
      ctx.lineWidth = borderStyle === 'azgaar' ? 1.9 : 0.95
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
}

// ── 城镇图标 ────────────────────────────────────────

function drawBurgs(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const towns = data.burgs.filter(b => b.i > 0 && !b.capital)
  const capitals = data.burgs.filter(b => b.i > 0 && b.capital)

  for (const burg of towns) {
    const { x, y } = burg
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = style.townStroke
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = burg.port ? '#5b9fd4' : '#666'
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill()
  }

  for (const burg of capitals) {
    const { x, y } = burg
    const stateColor = data.states[burg.state]?.color || '#e15759'
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.arc(x + 1, y + 1, 7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = style.capitalStroke
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = stateColor
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1.5, 0, Math.PI * 2); ctx.fill()
  }
}

// ── 国家标签 ────────────────────────────────────────

function drawStateLabels(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { cells, states } = data

  // 预计算每个国家的质心（一次遍历）
  const centroids = new Map<number, { cx: number; cy: number; count: number }>()
  for (let i = 0; i < cells.length; i++) {
    const sid = cells.state[i]
    if (sid === 0) continue
    let c = centroids.get(sid)
    if (!c) { c = { cx: 0, cy: 0, count: 0 }; centroids.set(sid, c) }
    c.cx += cells.p[i * 2]; c.cy += cells.p[i * 2 + 1]; c.count++
  }

  for (const state of states) {
    if (state.i === 0 || state.cells === 0) continue
    const c = centroids.get(state.i)
    if (!c || c.count === 0) continue
    const cx = c.cx / c.count, cy = c.cy / c.count

    const fontSize = Math.max(13, Math.min(26, Math.sqrt(c.count) * 1.5))
    const spacing = fontSize * 0.3

    ctx.font = `bold ${fontSize}px ${style.stateLabelFont}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const name = state.name
    const totalWidth = ctx.measureText(name).width + spacing * (name.length - 1)

    ctx.shadowColor = style.stateLabelGlow
    ctx.shadowBlur = 6
    ctx.fillStyle = style.stateLabelColor

    let drawX = cx - totalWidth / 2
    for (let i = 0; i < name.length; i++) {
      const charW = ctx.measureText(name[i]).width
      ctx.fillText(name[i], drawX + charW / 2, cy)
      drawX += charW + spacing
    }
    ctx.shadowBlur = 0
  }
}

// ── 城镇标签 ────────────────────────────────────────

function drawBurgLabels(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  for (const burg of data.burgs) {
    if (burg.i === 0) continue

    const fontSize = burg.capital ? 12 : 9
    ctx.font = `${burg.capital ? 'bold ' : ''}${fontSize}px ${style.burgLabelFont}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const labelPos = pickBurgLabelPosition(burg, data)

    ctx.strokeStyle = style.burgLabelStroke
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeText(burg.name, labelPos.x, labelPos.y)

    ctx.fillStyle = burg.capital ? style.burgLabelColor : (style.burgLabelColor === '#111' ? '#2a2a2a' : style.burgLabelColor)
    ctx.fillText(burg.name, labelPos.x, labelPos.y)
  }
}

// ── 比例尺 ──────────────────────────────────────────

function drawScaleBar(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  kmPerPixel: number, style: StyleConfig,
): void {
  const targetBarPx = 120
  const targetKm = targetBarPx * kmPerPixel
  const niceSteps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  let barKm = niceSteps[0]
  for (const step of niceSteps) {
    if (step <= targetKm * 2) barKm = step
    else break
  }
  const barPx = barKm / kmPerPixel

  const x = w - barPx - 30
  const y = h - 25

  ctx.fillStyle = style.scaleBarBg
  ctx.fillRect(x - 6, y - 16, barPx + 12, 28)

  ctx.strokeStyle = style.scaleBarColor
  ctx.fillStyle = style.scaleBarColor
  ctx.lineWidth = 1.5
  ctx.lineCap = 'butt'

  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + barPx, y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + barPx, y - 5); ctx.lineTo(x + barPx, y + 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + barPx / 2, y - 3); ctx.lineTo(x + barPx / 2, y + 1); ctx.stroke()

  const halfPx = barPx / 2
  ctx.fillStyle = style.scaleBarColor
  ctx.fillRect(x, y - 3, halfPx, 3)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x + halfPx, y - 3, halfPx, 3)
  ctx.strokeStyle = style.scaleBarColor
  ctx.lineWidth = 0.8
  ctx.strokeRect(x, y - 3, barPx, 3)

  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = style.scaleBarColor
  const label = barKm >= 1000 ? `${barKm / 1000}千公里` : `${barKm}公里`
  ctx.fillText(label, x + barPx / 2, y + 3)
}

// ── 暗角 ────────────────────────────────────────────

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, style: StyleConfig): void {
  const grad = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.4,
    w / 2, h / 2, Math.max(w, h) * 0.8,
  )
  grad.addColorStop(0, `rgba(${style.vignetteColor},0)`)
  grad.addColorStop(1, `rgba(${style.vignetteColor},${style.vignetteAlpha})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

// ── 板块边界 ────────────────────────────────────────

function drawTectonicBoundaries(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { boundaries, cells, vertices } = data
  if (!boundaries || boundaries.length === 0) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const boundary of boundaries) {
    const cellIds = boundary.cellIds
    if (cellIds.length === 0) continue

    // 收集边界线段（相邻但属于不同板块的单元格对）
    const segs: [number, number, number, number][] = []
    const boundarySet = new Set(cellIds)
    for (const cellId of cellIds) {
      const cv = cells.v[cellId]
      if (!cv || cv.length < 3) continue
      for (let j = 0; j < cv.length; j++) {
        const vi = cv[j], viN = cv[(j + 1) % cv.length]
        const ac = vertices.c[vi], acN = vertices.c[viN]
        if (!ac || !acN) continue
        const shared = sharedCellIds(ac, acN)
        if (shared.length >= 2) {
          const [c1, c2] = shared
          const inBoundary1 = boundarySet.has(c1)
          const inBoundary2 = boundarySet.has(c2)
          if (inBoundary1 !== inBoundary2) {
            segs.push([
              vertices.p[vi * 2], vertices.p[vi * 2 + 1],
              vertices.p[viN * 2], vertices.p[viN * 2 + 1],
            ])
          }
        }
      }
    }

    if (segs.length === 0) continue

    // 根据边界类型设置样式
    switch (boundary.type) {
      case 'convergent':
        ctx.strokeStyle = '#e15759' // 红色
        ctx.lineWidth = 2.5
        ctx.setLineDash([])
        break
      case 'divergent':
        ctx.strokeStyle = '#4e79a7' // 蓝色
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        break
      case 'transform':
        ctx.strokeStyle = '#f1ce63' // 黄色
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 3])
        break
    }

    for (const [x1, y1, x2, y2] of segs) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  ctx.setLineDash([])
}

// ── 洋流 ────────────────────────────────────────────

function drawOceanCurrents(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { oceanCurrents } = data
  if (!oceanCurrents || oceanCurrents.length === 0) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const current of oceanCurrents) {
    if (current.points.length < 2) continue

    const isWarm = current.type === 'warm'
    const baseColor = isWarm ? 'rgba(228,119,83' : 'rgba(83,158,228'
    const lineWidth = 1 + current.strength * 2

    // 流线光晕
    ctx.strokeStyle = `${baseColor},0.2)`
    ctx.lineWidth = lineWidth + 3
    ctx.setLineDash([])
    drawSmoothPath(ctx, current.points)

    // 主流线
    ctx.strokeStyle = `${baseColor},0.7)`
    ctx.lineWidth = lineWidth
    drawSmoothPath(ctx, current.points)

    // 箭头（每隔几个点画一个）
    const arrowSpacing = Math.max(5, Math.floor(current.points.length / 4))
    for (let i = arrowSpacing; i < current.points.length - 1; i += arrowSpacing) {
      const [x1, y1] = current.points[i - 1]
      const [x2, y2] = current.points[i]
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 2) continue

      const ndx = dx / len
      const ndy = dy / len
      const arrowLen = 4 + current.strength * 3

      ctx.fillStyle = `${baseColor},0.8)`
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - ndx * arrowLen - ndy * arrowLen * 0.4, y2 - ndy * arrowLen + ndx * arrowLen * 0.4)
      ctx.lineTo(x2 - ndx * arrowLen + ndy * arrowLen * 0.4, y2 - ndy * arrowLen - ndx * arrowLen * 0.4)
      ctx.closePath()
      ctx.fill()
    }
  }
}

// ── 风场 ────────────────────────────────────────────

function drawWindField(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { wind, cells, width, height } = data
  if (!wind) return

  // 每隔 N 个单元格画一个风向箭头
  const step = Math.max(8, Math.floor(Math.sqrt(cells.length) / 15))

  ctx.strokeStyle = 'rgba(200,200,200,0.35)'
  ctx.fillStyle = 'rgba(200,200,200,0.4)'
  ctx.lineWidth = 1

  for (let i = 0; i < cells.length; i += step) {
    if (cells.h[i] < 20) continue // 只在陆地上画

    const ws = wind.ws[i]
    if (ws < 0.05) continue

    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const wx = wind.wx[i]
    const wy = wind.wy[i]

    const arrowLen = 6 + ws * 12
    const endX = x + wx * arrowLen
    const endY = y + wy * arrowLen

    // 箭杆
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // 箭头
    const headLen = 3
    const angle = Math.atan2(wy, wx)
    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(endX - Math.cos(angle - 0.4) * headLen, endY - Math.sin(angle - 0.4) * headLen)
    ctx.moveTo(endX, endY)
    ctx.lineTo(endX - Math.cos(angle + 0.4) * headLen, endY - Math.sin(angle + 0.4) * headLen)
    ctx.stroke()
  }
}

/** 绘制平滑路径 */
function drawSmoothPath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    if (i % 2 === 0) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
    } else {
      ctx.lineTo(pts[i][0], pts[i][1])
    }
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
  ctx.stroke()
}

// ── 新 layer 占位实现（pipeline 引入的 4 个新层；Task 9 后续可替换为真实渲染） ─

/** 山影（NW 光源，沿板块脊线增强） */
function drawHillshade(
  ctx: CanvasRenderingContext2D, data: VoronoiMapData,
  _style: StyleConfig, options?: Record<string, unknown>,
): void {
  const strength = Math.max(0, Math.min(1.5, Number(options?.strength ?? 1)))
  if (strength <= 0) return
  const { cells, vertices } = data
  const hillshade = cells.hillshade
  const prevComposite = typeof ctx.globalCompositeOperation === 'string'
    ? ctx.globalCompositeOperation
    : 'source-over'
  ctx.globalCompositeOperation = 'multiply'
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20) continue
    const verts = cells.v[i]
    if (!verts || verts.length < 3) continue
    const shade = hillshade ? hillshade[i] : computeCellHillshade(cells, i)
    const alpha = hillshadeAlpha(cells, i, shade, strength)
    if (alpha < 0.015) continue
    ctx.fillStyle = shade >= 0
      ? `rgba(178,166,132,${alpha * 0.55})`
      : `rgba(65,72,82,${alpha})`
    ctx.beginPath()
    for (let j = 0; j < verts.length; j++) {
      const vi = verts[j]
      const vx = vertices.p[vi * 2]
      const vy = vertices.p[vi * 2 + 1]
      if (j === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = prevComposite
}

function computeCellHillshade(cells: VoronoiMapData['cells'], cellId: number): number {
  let shade = 0
  for (const nb of cells.c[cellId]) {
    const dx = cells.p[nb * 2] - cells.p[cellId * 2]
    const dy = cells.p[nb * 2 + 1] - cells.p[cellId * 2 + 1]
    const len = Math.hypot(dx, dy) || 1
    const lx = -0.7
    const ly = -0.7
    shade += ((cells.h[cellId] - cells.h[nb]) / len) * ((dx / len) * lx + (dy / len) * ly)
  }
  return shade / Math.max(1, cells.c[cellId].length)
}

/** 火山（strato 黑红三角，shield 褐色盾形） */
function drawVolcanoes(
  _ctx: CanvasRenderingContext2D, _data: VoronoiMapData,
  _style: StyleConfig,
): void {
  // TODO: 读 cells.volcano，strato 用黑红三角，shield 用褐色盾形
}

/** 海岸光晕（海陆交外 1 cell 浅色描边） */
function drawCoastGlow(
  ctx: CanvasRenderingContext2D, data: VoronoiMapData,
  style: StyleConfig,
): void {
  ctx.strokeStyle = style.coastGlow
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)
}

/** 国界 buffer（用 computeBorderlands 算 buffer，渲染半透明沙色） */
function drawBorderlands(
  ctx: CanvasRenderingContext2D, data: VoronoiMapData,
  _style: StyleConfig, options?: Record<string, unknown>,
): void {
  const width = Math.max(0, Math.min(3, Number(options?.width ?? 1)))
  const alpha = Math.max(0, Math.min(0.5, Number(options?.alpha ?? 0.08)))
  const borderland = computeBorderlands(data.cells, { width })
  if (borderland.size === 0) return
  ctx.fillStyle = `rgba(72, 55, 36, ${alpha})`
  for (const cellId of borderland) {
    const verts = data.cells.v[cellId]
    if (!verts || verts.length < 3) continue
    ctx.beginPath()
    for (let j = 0; j < verts.length; j++) {
      const vi = verts[j]
      const vx = data.vertices.p[vi * 2]
      const vy = data.vertices.p[vi * 2 + 1]
      if (j === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
  }
}

/** 国家底色 + per-state 噪点 */
function drawFactionTexture(
  _ctx: CanvasRenderingContext2D, _data: VoronoiMapData,
  _style: StyleConfig, options?: Record<string, unknown>,
): void {
  if (Number(options?.alpha ?? 0) <= 0) return
  // 地形图默认不按国家铺色；保留占位以兼容旧 preset / layer 开关。
}

function drawIceOverlay(ctx: CanvasRenderingContext2D, data: VoronoiMapData): void {
  const { cells, vertices, height } = data

  for (let i = 0; i < cells.length; i++) {
    const verts = cells.v[i]
    if (!verts || verts.length < 3) continue

    const yNorm = cells.p[i * 2 + 1] / height
    const polarStrength = Math.min(1, Math.abs(yNorm - 0.5) / 0.5)
    const isLandIce = cells.h[i] >= 20 && (
      cells.biome[i] === 11 ||
      (cells.temp[i] <= -12 && polarStrength > 0.84) ||
      (cells.temp[i] <= -10 && cells.h[i] >= 92)
    )
    const isSeaIce = cells.h[i] < 20 &&
      cells.temp[i] <= -3 &&
      polarStrength > 0.72 &&
      data.features[cells.f[i]]?.type !== 'lake'
    if (!isLandIce && !isSeaIce) continue

    const alpha = isLandIce
      ? 0.12 + polarStrength * 0.12
      : 0.045 + polarStrength * 0.08

    ctx.fillStyle = isLandIce ? `rgba(248,252,255,${alpha})` : `rgba(234,246,252,${alpha})`
    ctx.strokeStyle = isLandIce ? `rgba(255,255,255,${Math.min(0.86, alpha * 1.25)})` : `rgba(240,248,255,${alpha})`
    ctx.lineWidth = isLandIce ? 1 : 0.55
    ctx.beginPath()
    for (let j = 0; j < verts.length; j++) {
      const vi = verts[j]
      const vx = vertices.p[vi * 2]
      const vy = vertices.p[vi * 2 + 1]
      if (j === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

// ── 工具函数 ────────────────────────────────────────

/** 找两个短数组的交集。Voronoi 邻接数组很短，线性扫描比每次建 Set 更便宜。 */
function sharedCellIds(a: number[], b: number[]): number[] {
  if (a.length === 0 || b.length === 0) return []
  const result: number[] = []
  for (let i = 0; i < a.length; i++) {
    const value = a[i]
    for (let j = 0; j < b.length; j++) {
      if (b[j] === value) {
        result.push(value)
        break
      }
    }
  }
  return result
}

interface RgbColor {
  r: number
  g: number
  b: number
}

function computeTerrainBaseColors(
  data: VoronoiMapData,
  style: StyleConfig,
  biomeColors: string[],
): RgbColor[] {
  const { cells, height } = data
  const colors: RgbColor[] = new Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < 20) {
      const depth = Math.abs(cells.t[i])
      const idx = depth <= 1 ? 0 : depth <= 2 ? 1 : depth <= 4 ? 2 : depth <= 7 ? 3 : 4
      let color = parseColor(style.oceanDepth[idx])
      if (depth <= 2) {
        const shelf = depth <= 1 ? 0.42 : 0.2
        color = mixRgb(color, parseColor('#eef9f3'), shelf)
      }
      colors[i] = saturateRgb(color, 1.12)
      continue
    }

    const h = cells.h[i]
    const polarBlend = getPolarBlend(cells, i, height)
    const coldBlend = getColdTerrainBlend(cells, i, height)
    const naturalBiome = biomeColors[cells.biome[i]] || TERRAIN_BIOME_COLORS[cells.biome[i]] || '#8c946b'
    let color = parseColor(naturalBiome)

    if (h > 84) {
      const rock = mixRgb(parseColor('#8a6846'), parseColor('#8a8f86'), coldBlend)
      const snow = mixRgb({
        r: style.mountainHigh[0],
        g: style.mountainHigh[1],
        b: style.mountainHigh[2],
      }, parseColor('#f5f8f7'), coldBlend)
      color = mixRgb(rock, snow, Math.min(1, (h - 84) / 16))
    } else if (h > 58) {
      const lowRock = mixRgb(parseColor('#b17b3e'), parseColor('#9a9b88'), coldBlend)
      const highRock = mixRgb(parseColor('#725139'), parseColor('#73796f'), coldBlend)
      color = mixRgb(lowRock, highRock, Math.min(1, (h - 58) / 26))
    } else if (h > 46) {
      const mountainLow = mixRgb({
        r: style.mountainLow[0],
        g: style.mountainLow[1],
        b: style.mountainLow[2],
      }, parseColor('#a4aa9d'), coldBlend)
      color = mixRgb(color, mountainLow, Math.min(0.92, 0.42 + (h - 46) / 22))
    } else if (h > 38) {
      const highlandTone = mixRgb(parseColor('#b5904f'), parseColor('#b5bbae'), coldBlend)
      color = mixRgb(color, highlandTone, Math.min(0.42 * (1 - coldBlend * 0.3), (h - 38) / 42))
    } else if (h < 30) {
      const lowlandTone = coldBlend > 0.25 ? parseColor('#dbe2dc') : parseColor('#d4e68a')
      color = mixRgb(color, lowlandTone, Math.max(0, 30 - h) / 42)
    }

    if (coldBlend > 0) {
      const frostTone = cells.biome[i] === 11
        ? parseColor('#f0f5f6')
        : cells.biome[i] === 10
          ? parseColor('#aebbad')
          : parseColor('#bac4ba')
      color = mixRgb(color, frostTone, Math.min(0.3, coldBlend * 0.18))
    }

    if (cells.biome[i] === 7 || cells.biome[i] === 8 || cells.biome[i] === 9) {
      color = mixRgb(color, parseColor('#1f6d2e'), 0.08)
    }
    const contrast = cells.biome[i] === 10 || cells.biome[i] === 2 ? 1.06 : 1.16
    colors[i] = contrastRgb(mixRgb(color, parseColor('#f2f5f5'), polarBlend * 0.025), contrast)
  }
  return colors
}

function smoothTerrainColor(cells: VoronoiMapData['cells'], cellId: number, colors: RgbColor[]): RgbColor {
  const base = colors[cellId]
  if (cells.h[cellId] < 20) return base
  let r = base.r * 4
  let g = base.g * 4
  let b = base.b * 4
  let weight = 4
  for (const nb of cells.c[cellId]) {
    if (cells.h[nb] < 20) continue
    if (isColdTerrain(cells, cellId) !== isColdTerrain(cells, nb)) continue
    if (Math.abs(cells.h[nb] - cells.h[cellId]) > 22) continue
    const c = colors[nb]
    const mountainous = cells.h[cellId] >= 58 || cells.h[nb] >= 58
    const baseW = mountainous
      ? (Math.abs(cells.h[nb] - cells.h[cellId]) > 12 ? 0.1 : 0.22)
      : (Math.abs(cells.h[nb] - cells.h[cellId]) > 12 ? 0.24 : 0.46)
    const w = cells.biome[nb] === cells.biome[cellId] ? baseW : baseW * 0.35
    r += c.r * w
    g += c.g * w
    b += c.b * w
    weight += w
  }
  return saturateRgb({
    r: Math.round(r / weight),
    g: Math.round(g / weight),
    b: Math.round(b / weight),
  }, isColdTerrain(cells, cellId) ? 1.08 : 1.48)
}

function applyCoastalTone(cells: VoronoiMapData['cells'], cellId: number, color: RgbColor): RgbColor {
  const t = cells.t[cellId]
  if (cells.h[cellId] < 20) {
    const depth = Math.abs(t)
    if (depth <= 1) return mixRgb(color, parseColor('#f0f8ed'), 0.36)
    if (depth <= 2) return mixRgb(color, parseColor('#d8f1ed'), 0.2)
    return color
  }
  if (t <= 1 || hasWaterNeighbor(cells, cellId)) {
    const coldCoast = cells.temp[cellId] <= -4 || cells.biome[cellId] === 10 || cells.biome[cellId] === 11
    return mixRgb(color, parseColor(coldCoast ? '#c4d0c8' : '#eadf9e'), coldCoast ? 0.1 : 0.2)
  }
  if (t === 2) {
    const coldCoast = cells.temp[cellId] <= -4 || cells.biome[cellId] === 10 || cells.biome[cellId] === 11
    return mixRgb(color, parseColor(coldCoast ? '#bbc8c0' : '#d8d99d'), coldCoast ? 0.05 : 0.08)
  }
  return color
}

function hasWaterNeighbor(cells: VoronoiMapData['cells'], cellId: number): boolean {
  for (const nb of cells.c[cellId]) {
    if (cells.h[nb] < 20) return true
  }
  return false
}

function isColdTerrain(cells: VoronoiMapData['cells'], cellId: number): boolean {
  return cells.biome[cellId] === 2 || cells.biome[cellId] === 10 || cells.biome[cellId] === 11 || cells.temp[cellId] <= 2
}

function terrainTexture(cells: VoronoiMapData['cells'], cellId: number): number {
  const noise = stateNoiseLike(cellId, cells.biome[cellId])
  const biome = cells.biome[cellId]
  const biomeAmp = biome === 7 || biome === 8 || biome === 9 ? 3.2
    : biome === 5 || biome === 6 ? 2.3
    : biome === 1 || biome === 2 ? 2.0
    : 1.4
  const reliefAmp = cells.h[cellId] > 58 ? 3.4 : cells.h[cellId] > 46 ? 1.8 : 1
  return (noise - 0.5) * biomeAmp * reliefAmp
}

function stateNoiseLike(a: number, b: number): number {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return h - Math.floor(h)
}

function applyRgbDelta(color: RgbColor, delta: number): RgbColor {
  return {
    r: clampChannel(color.r + delta),
    g: clampChannel(color.g + delta),
    b: clampChannel(color.b + delta),
  }
}

function rgbToCss(color: RgbColor): string {
  return `rgb(${color.r},${color.g},${color.b})`
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function mixRgb(a: RgbColor, b: RgbColor, amount: number): RgbColor {
  const t = Math.max(0, Math.min(1, amount))
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

function saturateRgb(color: RgbColor, factor: number): RgbColor {
  const avg = color.r * 0.299 + color.g * 0.587 + color.b * 0.114
  return {
    r: clampChannel(avg + (color.r - avg) * factor),
    g: clampChannel(avg + (color.g - avg) * factor),
    b: clampChannel(avg + (color.b - avg) * factor),
  }
}

function contrastRgb(color: RgbColor, factor: number): RgbColor {
  return {
    r: clampChannel(128 + (color.r - 128) * factor),
    g: clampChannel(128 + (color.g - 128) * factor),
    b: clampChannel(128 + (color.b - 128) * factor),
  }
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount))
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const num = parseInt(hex.slice(1), 16)
  return { r: (num >> 16) & 0xFF, g: (num >> 8) & 0xFF, b: num & 0xFF }
}

function hexToRgba(hex: string, alpha: number): string {
  const num = parseInt(hex.slice(1), 16)
  return `rgba(${(num >> 16) & 0xFF},${(num >> 8) & 0xFF},${num & 0xFF},${alpha})`
}

function colorWithAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color)
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, Math.min(1, alpha))})`
}

function mixColor(colorA: string, colorB: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount))
  if (t <= 0) return colorA
  if (t >= 1) return colorB
  const a = parseColor(colorA)
  const b = parseColor(colorB)
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `rgb(${r},${g},${bl})`
}

function saturateColor(color: string, factor: number): string {
  return rgbToCss(saturateRgb(parseColor(color), factor))
}

function parseColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) return hexToRGB(color)
  const parts = color.match(/\d+/g)
  if (!parts || parts.length < 3) return { r: 128, g: 128, b: 128 }
  return { r: +parts[0], g: +parts[1], b: +parts[2] }
}

function getPolarBlend(cells: VoronoiMapData['cells'], i: number, height: number): number {
  if (cells.biome[i] === 11) return 0.5
  if (cells.biome[i] === 10) return 0.18
  const yNorm = cells.p[i * 2 + 1] / height
  const dist = Math.abs(yNorm - 0.5) / 0.5
  return Math.max(0, (dist - 0.72) / 0.28)
}

function getColdTerrainBlend(cells: VoronoiMapData['cells'], i: number, height: number): number {
  if (cells.biome[i] === 11) return 1
  const yNorm = cells.p[i * 2 + 1] / height
  const polar = Math.max(0, (Math.abs(yNorm - 0.5) / 0.5 - 0.74) / 0.26)
  const temp = cells.temp[i]
  const tempBlend = Math.max(0, Math.min(1, (-4 - temp) / 12))
  const biomeBlend = cells.biome[i] === 10 ? 0.55 : cells.biome[i] === 2 ? 0.28 : 0
  return Math.max(biomeBlend, Math.min(1, polar * 0.48 + tempBlend * 0.38))
}

function hasSharpTurns(coast: VoronoiMapData['coastlines'][number]): boolean {
  for (let i = 0; i < coast.length; i++) {
    const a = coast[(i - 1 + coast.length) % coast.length]
    const b = coast[i]
    const c = coast[(i + 1) % coast.length]
    const bax = b[0] - a[0]
    const bay = b[1] - a[1]
    const cbx = c[0] - b[0]
    const cby = c[1] - b[1]
    const len1 = Math.hypot(bax, bay) || 1
    const len2 = Math.hypot(cbx, cby) || 1
    const dot = (bax * cbx + bay * cby) / (len1 * len2)
    if (dot < 0.2) return true
  }
  return false
}

function isGentleTurn(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const bcx = c[0] - b[0]
  const bcy = c[1] - b[1]
  const len1 = Math.hypot(abx, aby) || 1
  const len2 = Math.hypot(bcx, bcy) || 1
  const dot = (abx * bcx + aby * bcy) / (len1 * len2)
  return dot > 0.45
}

function buildRiverPolygon(
  pts: [number, number][],
  widths: number[],
): [number, number][] {
  if (pts.length < 2) return []
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const halfW = Math.max(0.65, (widths[i] || widths[Math.max(0, i - 1)] || 1) * 0.5)
    left.push([pts[i][0] + nx * halfW, pts[i][1] + ny * halfW])
    right.push([pts[i][0] - nx * halfW, pts[i][1] - ny * halfW])
  }
  return [...left, ...right.reverse()]
}

function drawCenterline(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
  ctx.stroke()
}

function collectBorderSegmentGroups(data: VoronoiMapData): Map<string, BorderSegmentGroup> {
  const groups = new Map<string, BorderSegmentGroup>()
  const seen = new Set<string>()
  for (let i = 0; i < data.cells.length; i++) {
    const sidA = data.cells.state[i]
    if (sidA === 0 || data.cells.h[i] < 20) continue
    for (const neighbor of data.cells.c[i]) {
      if (neighbor <= i) continue
      const sidB = data.cells.state[neighbor]
      if (sidB === 0 || sidB === sidA || data.cells.h[neighbor] < 20) continue
      const shared = sharedCellIds(data.cells.v[i], data.cells.v[neighbor])
      if (shared.length < 2) continue
      const a = Math.min(shared[0], shared[1])
      const b = Math.max(shared[0], shared[1])
      const lo = Math.min(sidA, sidB)
      const hi = Math.max(sidA, sidB)
      const segKey = `${lo}:${hi}:${a}:${b}`
      if (seen.has(segKey)) continue
      seen.add(segKey)
      const groupKey = `${lo}:${hi}`
      let group = groups.get(groupKey)
      if (!group) {
        group = { sidA: lo, sidB: hi, segments: [] }
        groups.set(groupKey, group)
      }
      group.segments.push({ a, b, cellA: i, cellB: neighbor })
    }
  }
  return groups
}

function chainBorderSegments(segments: Array<{ a: number; b: number }>): number[][] {
  const byVertex = new Map<number, number[]>()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    let arr = byVertex.get(seg.a)
    if (!arr) { arr = []; byVertex.set(seg.a, arr) }
    arr.push(i)
    arr = byVertex.get(seg.b)
    if (!arr) { arr = []; byVertex.set(seg.b, arr) }
    arr.push(i)
  }

  const used = new Uint8Array(segments.length)
  const chains: number[][] = []
  const endpoints = [...byVertex.entries()]
    .filter(([, refs]) => refs.length === 1)
    .map(([vertex]) => vertex)

  const follow = (startSeg: number, startVertex: number): number[] => {
    const chain = [startVertex]
    let currentSeg = startSeg
    let currentVertex = startVertex
    while (currentSeg !== -1) {
      used[currentSeg] = 1
      const seg = segments[currentSeg]
      const nextVertex = seg.a === currentVertex ? seg.b : seg.a
      chain.push(nextVertex)
      currentVertex = nextVertex
      currentSeg = -1
      for (const candidate of byVertex.get(currentVertex) || []) {
        if (!used[candidate]) {
          currentSeg = candidate
          break
        }
      }
    }
    return chain
  }

  for (const endpoint of endpoints) {
    for (const segIdx of byVertex.get(endpoint) || []) {
      if (used[segIdx]) continue
      chains.push(follow(segIdx, endpoint))
    }
  }

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    chains.push(follow(i, segments[i].a))
  }

  return chains
}

function isLandDividerSegment(data: VoronoiMapData, segment: BorderSegment): boolean {
  const { cells, features } = data
  const cellA = segment.cellA
  const cellB = segment.cellB
  if (cells.h[cellA] < 20 || cells.h[cellB] < 20) return false
  if (cells.t[cellA] < 3 || cells.t[cellB] < 3) return false
  if (Math.abs(cells.p[cellA * 2 + 1] / data.height - 0.5) > 0.42) return false
  const featureA = cells.f[cellA]
  const featureB = cells.f[cellB]
  if (featureA !== featureB) return false
  const feature = features[featureA]
  return feature?.type === 'continent' || feature?.type === 'island'
}

function chainLength(chain: number[], vertexPoints: Float64Array): number {
  let length = 0
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1]
    const cur = chain[i]
    length += Math.hypot(
      vertexPoints[cur * 2] - vertexPoints[prev * 2],
      vertexPoints[cur * 2 + 1] - vertexPoints[prev * 2 + 1],
    )
  }
  return length
}

function chainInlandScore(chain: number[], data: VoronoiMapData): number {
  let total = 0
  let count = 0
  for (const vertex of chain) {
    const adjacent = data.vertices.c[vertex] || []
    for (const cellId of adjacent) {
      if (cellId < 0 || cellId >= data.cells.length || data.cells.h[cellId] < 20) continue
      total += Math.max(0, data.cells.t[cellId])
      count++
    }
  }
  return count ? total / count : 0
}

function chainsTooClose(a: number[], b: number[], vertexPoints: Float64Array): boolean {
  const ax = averageChainX(a, vertexPoints)
  const ay = averageChainY(a, vertexPoints)
  const bx = averageChainX(b, vertexPoints)
  const by = averageChainY(b, vertexPoints)
  return Math.hypot(ax - bx, ay - by) < 80
}

function averageChainX(chain: number[], vertexPoints: Float64Array): number {
  let total = 0
  for (const vertex of chain) total += vertexPoints[vertex * 2]
  return chain.length ? total / chain.length : 0
}

function averageChainY(chain: number[], vertexPoints: Float64Array): number {
  let total = 0
  for (const vertex of chain) total += vertexPoints[vertex * 2 + 1]
  return chain.length ? total / chain.length : 0
}

function strokeVertexChain(
  ctx: CanvasRenderingContext2D,
  chain: number[],
  vertexPoints: Float64Array,
  strokeStyle: string,
  lineWidth: number,
): void {
  if (chain.length < 2) return
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(vertexPoints[chain[0] * 2], vertexPoints[chain[0] * 2 + 1])
  for (let i = 1; i < chain.length; i++) {
    ctx.lineTo(vertexPoints[chain[i] * 2], vertexPoints[chain[i] * 2 + 1])
  }
  ctx.stroke()
}

function pickBurgLabelPosition(
  burg: VoronoiMapData['burgs'][number],
  data: VoronoiMapData,
): { x: number; y: number } {
  const offsets = burg.capital
    ? [[0, 10], [0, -18], [14, -4], [-14, -4]]
    : [[0, 6], [0, -14], [10, -2], [-10, -2]]
  let best = { x: burg.x, y: burg.y + (burg.capital ? 10 : 6) }
  let bestPenalty = Infinity
  for (const [dx, dy] of offsets) {
    const x = burg.x + dx
    const y = burg.y + dy
    let penalty = 0
    if (x < 20 || x > data.width - 20) penalty += 10
    if (y < 10 || y > data.height - 10) penalty += 10
    if (Math.abs(data.cells.t[burg.cell]) <= 2) penalty += 3
    if (data.cells.state[burg.cell] > 0) {
      for (const nb of data.cells.c[burg.cell]) {
        if (data.cells.state[nb] !== data.cells.state[burg.cell]) {
          penalty += 4
          break
        }
      }
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      best = { x, y }
    }
  }
  return best
}
