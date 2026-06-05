/**
 * Voronoi 地图 Canvas 渲染器
 * 支持风格预设、图层显隐、省份、道路
 */

import type { VoronoiMapData, LayerVisibility, BiomeOverride, MapStylePreset, Feature, PlateBoundary } from './types'
import { BIOMES } from './climate'
import { getStyleConfig, type StyleConfig } from './style-presets'
import { getPipeline, type LayerSpec } from './renderer-pipeline'

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
  continents: true,
  rivers: true,
  borders: true,
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

  ctx.fillStyle = style.oceanBg
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < cells.length; i++) {
    const cellVerts = cells.v[i]
    if (!cellVerts || cellVerts.length < 3) continue

    if (cells.h[i] < 20) {
      const depth = Math.abs(cells.t[i])
      const idx = depth <= 1 ? 0 : depth <= 2 ? 1 : depth <= 4 ? 2 : depth <= 7 ? 3 : 4
      ctx.fillStyle = style.oceanDepth[idx]
    } else {
      const h = cells.h[i]
      const color = biomeColors[cells.biome[i]] || '#888'
      const polarBlend = getPolarBlend(cells, i, height)

      if (h > 70) {
        const t = Math.min(1, (h - 70) / 30)
        const ml = style.mountainLow, mh = style.mountainHigh
        const r = Math.round(ml[0] + t * (mh[0] - ml[0]))
        const g = Math.round(ml[1] + t * (mh[1] - ml[1]))
        const b = Math.round(ml[2] + t * (mh[2] - ml[2]))
        ctx.fillStyle = mixColor(`rgb(${r},${g},${b})`, '#f3f7fb', polarBlend * 0.35)
      } else if (h > 55) {
        const t = (h - 55) / 15
        const base = hexToRGB(color)
        const ml = style.mountainLow
        const r = Math.round(base.r + t * (ml[0] - base.r))
        const g = Math.round(base.g + t * (ml[1] - base.g))
        const b = Math.round(base.b + t * (ml[2] - base.b))
        ctx.fillStyle = mixColor(`rgb(${r},${g},${b})`, '#eef5fb', polarBlend * 0.28)
      } else {
        const heightAdj = (h - 30) * 0.2
        ctx.fillStyle = mixColor(adjustBrightness(color, heightAdj), '#edf4fa', polarBlend * 0.18)
      }
    }

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
  ctx.strokeStyle = style.coastGlow
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)

  ctx.strokeStyle = style.coastline
  ctx.lineWidth = 1.5
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
  // 阶段 1:点数 ≥ 10 时用 quadraticCurveTo 平滑(每 2 个点取中点作控制点),
  //          < 10 时保持直线段以避免越界 / 短环折叠
  // **不修改 coastlines 原数据**,仅在绘制时做视觉平滑
  if (coast.length < 10) {
    ctx.moveTo(coast[0][0] * width, coast[0][1] * height)
    for (let i = 1; i < coast.length; i++) {
      ctx.lineTo(coast[i][0] * width, coast[i][1] * height)
    }
    ctx.closePath()
    ctx.stroke()
    return
  }
  // 平滑路径:从点 0 出发,对每对相邻点 (P_i, P_{i+1}) 取中点 M_i 作锚,
  //          P_{i+1} 作控制点,绘制到下一个中点 M_{i+1}
  //          (经典 quadratic 平滑)
  const n = coast.length
  // 计算第 0 个中点 (P_0 + P_1) / 2 作起点
  const mx0 = (coast[0][0] + coast[1][0]) * 0.5 * width
  const my0 = (coast[0][1] + coast[1][1]) * 0.5 * height
  ctx.moveTo(mx0, my0)
  for (let i = 0; i < n; i++) {
    const cur = coast[i]
    const nxt = coast[(i + 1) % n]
    // P_{i+1} 作控制点
    const cx = cur[0] * width
    const cy = cur[1] * height
    // 终点 = (P_{i+1} + P_{i+2}) / 2
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
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const river of data.rivers) {
    if (river.points.length < 2) continue

    // 光晕
    ctx.strokeStyle = style.riverGlow
    drawRiverPath(ctx, river.points, river.widths, 2)

    // 主河道
    ctx.strokeStyle = style.river
    drawRiverPath(ctx, river.points, river.widths, 0)

    // 高光
    ctx.strokeStyle = style.riverHighlight
    drawRiverPath(ctx, river.points, river.widths, -1)
  }
}

function drawRiverPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][], widths: number[], extra: number,
): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const w = Math.max(0.5, (widths[i] || 1) + extra)
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(pts[i][0], pts[i][1])
    if (i < pts.length - 2) {
      const mx = (pts[i + 1][0] + pts[i + 2][0]) / 2
      const my = (pts[i + 1][1] + pts[i + 2][1]) / 2
      ctx.quadraticCurveTo(pts[i + 1][0], pts[i + 1][1], mx, my)
    } else {
      ctx.lineTo(pts[i + 1][0], pts[i + 1][1])
    }
    ctx.stroke()
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
      // 简单的贝塞尔平滑（每隔几个点取控制点）
      if (i < road.points.length - 1 && i % 3 === 0) {
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

// ── 国界 ────────────────────────────────────────────

function drawBorders(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  const { cells, vertices, states } = data

  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 3])
  ctx.lineCap = 'round'

  for (let i = 0; i < cells.length; i++) {
    if (cells.state[i] === 0) continue
    for (const neighbor of cells.c[i]) {
      if (cells.state[neighbor] === cells.state[i]) continue
      if (cells.h[neighbor] < 20) continue

      const stateColor = states[cells.state[i]]?.color || '#666'
      ctx.strokeStyle = hexToRgba(stateColor, style.borderAlpha)

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

    const labelY = burg.y + (burg.capital ? 10 : 6)

    ctx.strokeStyle = style.burgLabelStroke
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeText(burg.name, burg.x, labelY)

    ctx.fillStyle = burg.capital ? style.burgLabelColor : (style.burgLabelColor === '#111' ? '#2a2a2a' : style.burgLabelColor)
    ctx.fillText(burg.name, burg.x, labelY)
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
  _ctx: CanvasRenderingContext2D, _data: VoronoiMapData,
  _style: StyleConfig, _options?: Record<string, unknown>,
): void {
  // TODO: 实现 NW 光源山影，沿板块脊线增强
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
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const coast of data.coastlines) drawCoastPath(ctx, coast, data.width, data.height)
}

/** 国界 buffer（用 computeBorderlands 算 buffer，渲染半透明沙色） */
function drawBorderlands(
  _ctx: CanvasRenderingContext2D, _data: VoronoiMapData,
  _style: StyleConfig, _options?: Record<string, unknown>,
): void {
  // TODO: 用 computeBorderlands 算 buffer，渲染半透明沙色
}

/** 国家底色 + per-state 噪点 */
function drawFactionTexture(
  _ctx: CanvasRenderingContext2D, _data: VoronoiMapData,
  _style: StyleConfig, _options?: Record<string, unknown>,
): void {
  // TODO: 国家底色 alpha + per-state 噪点
}

function drawIceOverlay(ctx: CanvasRenderingContext2D, data: VoronoiMapData): void {
  const { cells, vertices, height } = data

  for (let i = 0; i < cells.length; i++) {
    const verts = cells.v[i]
    if (!verts || verts.length < 3) continue

    const isLandIce = cells.h[i] >= 20 && cells.temp[i] <= -8
    const isSeaIce = cells.h[i] < 20 && cells.temp[i] <= 0 && data.features[cells.f[i]]?.type !== 'lake'
    if (!isLandIce && !isSeaIce) continue

    const yNorm = cells.p[i * 2 + 1] / height
    const polarStrength = 1 - Math.min(0.5, Math.abs(yNorm - 0.5)) / 0.5
    const alpha = isLandIce
      ? 0.24 + polarStrength * 0.16
      : 0.12 + polarStrength * 0.12

    ctx.fillStyle = isLandIce ? `rgba(245,250,253,${alpha})` : `rgba(232,242,250,${alpha})`
    ctx.strokeStyle = isLandIce ? `rgba(255,255,255,${alpha * 1.2})` : `rgba(240,248,255,${alpha})`
    ctx.lineWidth = isLandIce ? 0.8 : 0.5
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

/** 找两个顶点共享的单元格（Set 交集，O(n) 而非 O(n²)） */
function sharedCellIds(a: number[], b: number[]): number[] {
  if (a.length === 0 || b.length === 0) return []
  const setB = new Set(b)
  return a.filter(c => setB.has(c))
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

function parseColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) return hexToRGB(color)
  const parts = color.match(/\d+/g)
  if (!parts || parts.length < 3) return { r: 128, g: 128, b: 128 }
  return { r: +parts[0], g: +parts[1], b: +parts[2] }
}

function getPolarBlend(cells: VoronoiMapData['cells'], i: number, height: number): number {
  if (cells.biome[i] === 11) return 0.55
  if (cells.biome[i] === 10) return 0.28
  const yNorm = cells.p[i * 2 + 1] / height
  const dist = Math.abs(yNorm - 0.5) / 0.5
  return Math.max(0, (dist - 0.62) / 0.38)
}
