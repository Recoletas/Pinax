/**
 * P1.5 重做：真实底图写作视图。
 *
 * 底图 = 固定 seed 真实生成管线的地形栅格（真实海陆/海岸/地形/河流，atlas 浅色）。
 * 语义 = semantic-projection 的确定性绑定（当前场/章节引用/隐藏状态），仅作稀疏覆盖：
 * - 路线默认完全隐藏（本轮不建路线层）；
 * - candidate/stale/conflict 完全隐藏；
 * - 室内地点无坐标，只存在于详情面包屑；
 * - 当前场是锚点上的矿物黄状态环，不新增第二个文字标签；
 * - 全部文字（区域/首都/城市/上下文）经唯一屏幕空间碰撞规划器输出。
 */

import OlMap from 'ol/Map'
import View from 'ol/View'
import Projection from 'ol/proj/Projection'
import ImageLayer from 'ol/layer/Image'
import ImageCanvasSource from 'ol/source/ImageCanvas'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { Point } from 'ol/geom'
import Feature from 'ol/Feature'

import { LineString } from 'ol/geom'
import { dataYToViewportY, terrainSourceRect } from './yaxis.js'
import { selectRiverSystems } from './river-systems.js'
import { resolveTier, thresholdsForFit } from './map-visibility-policy.js'
import { planLabels, overlapRatio } from './map-label-plan.js'

const FONT_STACK = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
const T = {
  text: '#2f3a45',
  capital: '#4a3b22',
  city: '#5d6b78',
  stateText: '#76877a', // 国名：对比度略低（层级靠字号与字距，不靠醒目）
  halo: 'rgba(248,246,240,0.92)',
  sceneDot: '#d9a514', // 矿物黄实心点：当前场
  sceneRing: 'rgba(217,165,20,0.45)', // 克制外环
  sceneText: '#7a4a0a',
  river: '#6289a8',
}

// 三级字号与对比度（world tier）：国名 > 首都 > 城市
export const LABEL_TYPOGRAPHY = {
  state: { font: `600 16px ${FONT_STACK}`, letterSpacing: '\u2009' }, // 字距用细空格
  capital: { font: `600 12.5px ${FONT_STACK}` },
  city: { font: `400 11.5px ${FONT_STACK}` },
  ordinary: { font: `400 11.5px ${FONT_STACK}` },
}

function pinaxProjection(W, H) {
  return new Projection({
    code: 'pinax-plane',
    units: 'pixels',
    extent: [0, 0, W, H],
    worldExtent: [0, 0, W, H],
    getPointResolution: (r) => r,
  })
}

export function createP15Prototype(container, shared, initialState = {}) {
  container.innerHTML = ''
  const { doc, legacy, terrainCanvas, projection: semantic, onStateChange } = shared
  const W = doc.baseAsset.width
  const H = doc.baseAsset.height
  const projection = pinaxProjection(W, H)
  const fitResolution = Math.max(W / container.clientWidth, H / container.clientHeight)
  const tierThresholds = thresholdsForFit(fitResolution)
  const flip = (c) => [c[0], dataYToViewportY(c[1], H)]

  const state = {
    mode: initialState.mode ?? 'writing',
    previousTier: 'world',
    overlayOn: initialState.overlayOn ?? true,
    terrainDrawn: false,
    lastPlan: null,
  }

  // ── 底图：真实地形栅格（含真实河流；海陆/海岸/地形全部来自生成管线）──
  const terrainSource = new ImageCanvasSource({
    projection,
    canvasFunction: (extent, resolution, pixelRatio, size) => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(size[0] * pixelRatio)
      canvas.height = Math.round(size[1] * pixelRatio)
      const ctx = canvas.getContext('2d')
      const { sx, sy, sw, sh } = terrainSourceRect(extent, H)
      if (sw <= 0 || sh <= 0) return canvas
      ctx.imageSmoothingEnabled = resolution < 1
      ctx.drawImage(terrainCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      state.terrainDrawn = true
      return canvas
    },
  })
  const rasterLayer = new ImageLayer({ source: terrainSource, zIndex: 1 })

  // ── 地点层：唯一文字/图标 owner；碰撞由 planLabels 负责，不用 OL declutter ──
  const placeSource = new VectorSource()
  const placeLayer = new VectorLayer({ source: placeSource, zIndex: 10 })

  // ── 河流层：河网主干系统（世界档 6-12 个系统的干流；支流归 region/local）──
  const riverSystems = selectRiverSystems(legacy.rivers || [])
  const riverSource = new VectorSource()
  for (const trunk of riverSystems.trunks) {
    if (!trunk.points || trunk.points.length < 2) continue
    const ol = new Feature(new LineString(trunk.points.map(flip)))
    ol.setProperties({ featureId: `river-system:${trunk.id}`, featureType: 'river', systemLength: trunk.systemLength })
    ol.setStyle(new Style({
      stroke: new Stroke({ color: T.river, width: trunk.width, lineCap: 'round', lineJoin: 'round' }),
    }))
    riverSource.addFeature(ol)
  }
  const riverLayer = new VectorLayer({ source: riverSource, zIndex: 5 })

  // 落陆判定：在最终(柔化后)地形画布上采样。g-b + 0.5(r-b) 为陆地得分，
  // 海色为负。缓存按 2px 网格，避免重复 getImageData。
  const terrainCtx2d = terrainCanvas.getContext('2d', { willReadFrequently: true })
  const landScoreCache = new globalThis.Map()
  function landScoreAt(dataX, dataY) {
    const x = Math.round(dataX)
    const y = Math.round(dataY)
    if (x < 0 || y < 0 || x >= W || y >= H) return -999
    const key = ((x >> 1) << 12) | (y >> 1)
    if (landScoreCache.has(key)) return landScoreCache.get(key)
    const d = terrainCtx2d.getImageData(x, y, 1, 1).data
    const score = d[1] - d[2] + (d[0] - d[2]) * 0.5
    landScoreCache.set(key, score)
    return score
  }
  const LAND_SCORE_MIN = 6

  /**
   * 屏幕空间确定性内推：锚点若落在海岸羽化带/水色区域，
   * 沿 8 方向采样选陆地得分最高的方向步进，直到落陆或步数用尽。
   * 圆点不跟随文字漂移——只修锚点本身，方向与步长固定。
   */
  function nudgeToLand(dataAnchor) {
    const p = [...dataAnchor]
    if (landScoreAt(p[0], p[1]) >= LAND_SCORE_MIN) return p
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]]
    for (let step = 0; step < 60; step++) {
      let best = null
      for (const [dx, dy] of DIRS) {
        const c = [p[0] + dx * 8, p[1] + dy * 8]
        const score = landScoreAt(c[0], c[1])
        if (!best || score > best.score) best = { c, score }
      }
      if (!best) break
      p[0] = best.c[0]
      p[1] = best.c[1]
      if (best.score >= LAND_SCORE_MIN) break
    }
    return p
  }

  const measureCanvas = document.createElement('canvas').getContext('2d')
  const measureText = (text, font) => {
    measureCanvas.font = font
    return { width: measureCanvas.measureText(text).width }
  }
  const labelFont = (c) => (LABEL_TYPOGRAPHY[c.kind] ?? LABEL_TYPOGRAPHY.city).font
  // 国名字距在候选构造时注入（display text），measureText 与显示一致
  const displayText = (c) =>
    c.kind === 'state' ? c.text.split('').join('\u2009') : c.text

  const settlementById = new globalThis.Map(
    doc.featureCollections.settlements.map((f) => [f.mapObjectId, f]),
  )
  const burgOf = (id) => legacy.burgs.find((b) => `settlement:${b.i}` === id)
  const popOf = (id) => burgOf(id)?.population ?? 0

  function buildCandidates() {
    const settlements = doc.featureCollections.settlements
    const byPop = [...settlements]
      .filter((f) => f.properties.kind === 'capital' || f.properties.kind === 'city')
      .sort((a, b) => popOf(b.mapObjectId) - popOf(a.mapObjectId))
    // 世界档密度：只显示前 3 大国家的首都 + 3 个最大城市（区域名同源，地图安静）
    const topStateIds = new Set(semantic.stateLabels.map((s) => s.stateId))
    const capitals = byPop.filter((f) => f.properties.kind === 'capital' && topStateIds.has(burgOf(f.mapObjectId)?.state))
    const bigCities = byPop.filter((f) => f.properties.kind !== 'capital').slice(0, 3)
    const geoSettlements = [...capitals, ...bigCities]

    const candidates = []

    // 区域（国家）名：地理，纯文字；备选锚点依次尝试；与聚落标签留明确空隙
    for (const s of semantic.stateLabels) {
      const anchors = [nudgeToLand(s.anchor), ...(s.alternativeAnchors ?? []).map((a) => nudgeToLand(a))]
      candidates.push({
        id: s.id,
        kind: 'state',
        text: s.text,
        anchor: anchors[0],
        alternativeAnchors: anchors.slice(1),
        iconRadius: 0,
        priority: 30 + (3 - s.areaRank),
        chainId: null,
        zoomRange: [0, fitResolution * 1.1],
        collisionPadding: 10, // 国名与同国首都之间留出明确空隙（Gate 按 bbox 检查）
      })
    }

    // 聚落 icon：kind 只表达地理等级；写作状态放 overlayState（两者正交）。
    // 锚点先做落陆内推（P1.6B）：圆点必须落在可见陆地。
    for (const f0 of geoSettlements) {
      const f = { ...f0, geometry: { type: 'point', coordinates: nudgeToLand(f0.geometry.coordinates) } }
      const overlayOn = state.overlayOn
      const overlayState = !overlayOn
        ? 'none'
        : f.mapObjectId === semantic.sceneAnchorId
          ? 'scene'
          : semantic.chapterRefIds.includes(f.mapObjectId) ? 'chapter-reference' : 'none'
      const kind = f.properties.kind === 'capital' ? 'capital' : 'city'
      candidates.push({
        id: f.mapObjectId,
        kind,
        overlayState,
        text: f.properties.label,
        anchor: f.geometry.coordinates,
        iconRadius: kind === 'capital' ? 4.5 : 4,
        priority: (kind === 'capital' ? 50 : 40) + (overlayState === 'scene' ? 8 : overlayState === 'chapter-reference' ? 6 : 0),
        chainId: null,
        zoomRange: [0, fitResolution * 2],
        isSceneAnchor: overlayState === 'scene',
        isChapterRef: overlayState === 'chapter-reference',
      })
    }

    // 章节引用里不在地理集合的：只在写作态出现（overlayState 决定入选，不占地理配额）
    if (state.overlayOn) {
      for (const refId of semantic.chapterRefIds) {
        if (candidates.some((c) => c.id === refId)) continue
        const f = settlementById.get(refId)
        if (!f) continue
        candidates.push({
          id: refId,
          kind: 'ordinary',
          overlayState: 'chapter-reference',
          text: f.properties.label,
          anchor: f.geometry.coordinates,
          iconRadius: 3.5,
          priority: 46,
          chainId: null,
          zoomRange: [0, fitResolution * 2],
          isChapterRef: true,
        })
      }
    }

    return candidates
  }

  function rebuild() {
    const view = map.getView()
    const resolution = view.getResolution()
    state.previousTier = resolveTier(state.previousTier, resolution, tierThresholds)

    // map 尺寸未就绪时投影无意义：保留上一个有效 plan，等下次触发
    const size = map.getSize()
    if (!size || !size[0] || !size[1]) return

    const candidates = buildCandidates()
    const projected = candidates.map((c) => {
      const px = map.getPixelFromCoordinate(flip(c.anchor))
      return { ...c, anchor: px ?? [-9999, -9999], text: displayText(c) }
    })
    // state 名锚点避让：与任一聚落锚点过近时沿反向确定性推开，给区域名留出独立位置
    const settlementPts = projected.filter((c) => c.kind === 'capital' || c.kind === 'city' || c.kind === 'context')
    for (const c of projected) {
      if (c.kind !== 'state') continue
      for (let step = 0; step < 14; step++) {
        const tooClose = settlementPts.some((s) => Math.hypot(s.anchor[0] - c.anchor[0], s.anchor[1] - c.anchor[1]) < 90)
        if (!tooClose) break
        const nearest = settlementPts.reduce((best, s) => {
          const d = Math.hypot(s.anchor[0] - c.anchor[0], s.anchor[1] - c.anchor[1])
          return !best || d < best.d ? { d, s } : best
        }, null).s
        const dx = c.anchor[0] - nearest.anchor[0]
        const dy = c.anchor[1] - nearest.anchor[1]
        const len = Math.hypot(dx, dy) || 1
        c.anchor = [c.anchor[0] + (dx / len) * 14, c.anchor[1] + (dy / len) * 14]
      }
    }

    const plan = planLabels(projected, {
      tier: state.previousTier,
      resolution,
      measureText,
      fontFor: labelFont,
    })
    state.lastPlan = plan

    placeSource.clear()
    const placedById = new globalThis.Map(plan.placed.map((p) => [p.id, p]))

    for (const c of candidates) {
      const screen = map.getPixelFromCoordinate(flip(c.anchor))
      if (!screen) continue
      const placed = placedById.get(c.id)
      if (c.kind === 'state') {
        if (!placed) continue // state 纯文字；被碰撞淘汰则不显示
        const ol = new Feature(new Point(flip(c.anchor)))
        ol.setProperties({ featureId: c.id, textOnly: true })
        ol.setStyle(textStyle(placed, c))
        placeSource.addFeature(ol)
        continue
      }
      const isScene = c.overlayState === 'scene'
      const isRef = c.overlayState === 'chapter-reference'
      // 当前场：实心琥珀点（一眼定位），外环克制
      const coreFill = isScene ? T.sceneDot : c.kind === 'capital' ? T.capital : T.city
      const styles = [
        new Style({
          image: new CircleStyle({
            radius: isScene ? c.iconRadius + 1 : c.iconRadius,
            fill: new Fill({ color: coreFill }),
            stroke: new Stroke({ color: T.halo, width: 1.5 }),
          }),
        }),
      ]
      if (isScene) {
        styles.push(new Style({
          image: new CircleStyle({
            radius: c.iconRadius + 3.5,
            fill: new Fill({ color: 'transparent' }),
            stroke: new Stroke({ color: T.sceneRing, width: 1.4 }),
          }),
        }))
      } else if (isRef) {
        styles.push(new Style({
          image: new CircleStyle({
            radius: c.iconRadius + 2.5,
            fill: new Fill({ color: 'rgba(217,165,20,0.08)' }),
            stroke: new Stroke({ color: 'rgba(217,165,20,0.8)', width: 1.2 }),
          }),
        }))
      }
      if (placed) styles.push(textStyle(placed, c, displayText(c)))
      // 几何存投影空间数据坐标(而非重建时的屏幕像素):画布 resize 后 OL 自动重投影,
      // 不再出现"重建时缓存像素漂移"
      const ol = new Feature(new Point(flip(c.anchor)))
      ol.setProperties({ featureId: c.id, kind: c.kind, isScene, isRef, placed: !!placed })
      ol.setStyle(styles)
      placeSource.addFeature(ol)
    }

    if (onStateChange) onStateChange(snapshot())
  }

  function textStyle(placed, c, displayStr) {
    const color = c.kind === 'state'
      ? T.stateText
      : c.overlayState === 'scene' ? T.sceneText : T.text
    return new Style({
      text: new Text({
        text: displayStr ?? placed.text,
        font: labelFont(c),
        offsetY: -(c.iconRadius > 0 ? c.iconRadius + 14 : 8),
        fill: new Fill({ color }),
        stroke: new Stroke({ color: T.halo, width: 3 }),
        overflow: true,
      }),
    })
  }

  const map = new OlMap({
    target: container,
    controls: [], // 产品态无默认 OL 控件
    layers: [rasterLayer, riverLayer, placeLayer],
    view: new View({
      projection,
      center: [W / 2, H / 2],
      resolution: fitResolution,
      minResolution: 0.05,
      maxResolution: fitResolution,
      constrainOnlyCenter: true,
    }),
  })
  // 视口边缘延伸为开放海面（消除 extent 外黑沟）
  container.style.background = shared.oceanColor ?? '#6f9ec4'

  let idleTimer = null
  map.getView().on('change:resolution', () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => rebuild(), 120)
  })

  function snapshot() {
    const plan = state.lastPlan
    const placedRects = (plan?.placed ?? []).map((p) => p.labelRect)
    let overlapPairCount = 0
    let maxOverlapRatio = 0
    for (let i = 0; i < placedRects.length; i++) {
      for (let j = i + 1; j < placedRects.length; j++) {
        const r = overlapRatio(placedRects[i], placedRects[j])
        if (r > 0) {
          overlapPairCount++
          maxOverlapRatio = Math.max(maxOverlapRatio, r)
        }
      }
    }
    return {
      tier: state.previousTier,
      mode: state.mode,
      overlayOn: state.overlayOn,
      drawnLabelCount: plan?.placed.length ?? 0,
      // geo = 依靠地理等级入选的标签；contextOverlay = 因写作上下文而存在的标签
      // （地理实体承带引用状态不算 contextOverlay,计入 contextMarkedCount）
      geoLabelCount: plan?.placed.filter((p) => p.overlayState !== 'chapter-reference' || p.kind === 'capital' || p.kind === 'city' || p.kind === 'state').length ?? 0,
      contextLabelCount: plan?.placed.filter((p) => p.overlayState === 'chapter-reference' && p.kind !== 'capital' && p.kind !== 'city' && p.kind !== 'state').length ?? 0,
      contextOverlayCount: plan?.placed.filter((p) => p.overlayState === 'chapter-reference' && p.kind !== 'capital' && p.kind !== 'city' && p.kind !== 'state').length ?? 0,
      contextMarkedCount: plan?.placed.filter((p) => p.overlayState === 'chapter-reference').length ?? 0,
      iconOnlyCount: plan?.iconOnly.length ?? 0,
      collisionRejectedCount: plan?.collisionRejected.length ?? 0,
      zoomRejectedCount: plan?.zoomRejected.length ?? 0,
      hierarchyFoldedCount: plan?.hierarchyFolded.length ?? 0,
      overlapPairCount,
      maxOverlapRatio,
      currentSceneOwnerCount: state.overlayOn ? (plan?.sceneOwner ? 1 : 0) : 0,
      placedTexts: (plan?.placed ?? []).map((p) => ({ id: p.id, kind: p.kind, overlayState: p.overlayState ?? 'none', text: p.text })),
      placedRectInfos: (plan?.placed ?? []).map((p) => ({ id: p.id, kind: p.kind, labelRect: p.labelRect })),
      breadcrumbs: semantic.breadcrumbs,
    }
  }

  const hint = document.createElement('div')
  hint.className = 'hint'
  // 产品态（?chrome=product）：无调试条
  if (new URLSearchParams(location.search).get('chrome') === 'product') hint.style.display = 'none'
  hint.style.background = 'rgba(252,251,247,0.94)'
  hint.style.color = '#2f3a45'
  container.appendChild(hint)
  const updateHint = () => {
    const s = snapshot()
    hint.textContent = `P1.5 真实底图 · ${s.tier}档 · 文字 ${s.drawnLabelCount}（地理 ${s.geoLabelCount}/上下文 ${s.contextLabelCount}）· 碰撞淘汰 ${s.collisionRejectedCount} · icon-only ${s.iconOnlyCount}`
  }

  rebuild()
  updateHint()

  return {
    ready: new Promise((resolve) => map.once('rendercomplete', () => resolve())),
    getView: () => map.getView(),
    setOverlay(on) {
      state.overlayOn = on
      rebuild()
      updateHint()
    },
    setMode(mode) {
      state.mode = mode
      rebuild()
      updateHint()
    },
    updateHint,
    snapshot,
    getTerrainState: () => ({ terrainDrawn: state.terrainDrawn }),
    getDocument: () => doc,
    getLayerSources: () => [terrainSource, riverSource, placeSource],
    /** 语义覆盖信号区（当前场/章节引用的 icon+标签外扩矩形）——像素 diff 唯一豁免区。 */
    getOverlaySignalRects: () => {
      const rects = []
      for (const f of placeSource.getFeatures()) {
        if (!f.get('isScene') && !f.get('isRef')) continue
        const [x, y] = map.getPixelFromCoordinate(f.getGeometry().getCoordinates()) ?? [0, 0]
        rects.push([x - 46, y - 48, 92, 66]) // 覆盖 icon + 上方标签 halo
      }
      return rects
    },
    auditAnchorLand: () => {
      let total = 0
      let onLand = 0
      const offenders = []
      for (const f of placeSource.getFeatures()) {
        if (f.get('textOnly')) continue
        const ol = f.getGeometry().getCoordinates()
        const data = [ol[0], doc.baseAsset.height - ol[1]] // 投影 y-up → 数据 y-down
        total++
        const ok = landScoreAt(data[0], data[1]) >= LAND_SCORE_MIN
        if (ok) onLand++
        else offenders.push(f.get('featureId'))
      }
      return { total, onLand, rate: total ? onLand / total : 1, offenders }
    },
    sampleLandScore: (x, y) => landScoreAt(x, y),
    getGateMeta: () => ({
      riverSystemCount: riverSystems.systemCount,
      riverTrunkCount: riverSystems.trunks.length,
      riverTrunkMidpoints: riverSystems.trunks.map((t) => t.midPoint),
      typography: LABEL_TYPOGRAPHY,
    }),
    getControlsCount: () => map.getControls().getLength(),
    getSemantic: () => semantic,
    dispose() {
      clearTimeout(idleTimer)
      map.setTarget(undefined)
      terrainSource.dispose()
      placeSource.dispose()
      container.innerHTML = ''
    },
  }
}
