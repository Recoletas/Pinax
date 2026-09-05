/**
 * 原型 ②(修订版)——OpenLayers:浅/深双主题地形 ImageCanvas 底图 + 地点矢量。
 *
 * 用户反馈修订(2026-08-29):
 * - 基线①的全量烘焙图与全矢量③应视为同一地图的浅色/深色两套主题,
 *   而不是两个方向;本原型提供 setTheme('light' | 'dark')。
 * - 标点过多会乱:作者地点用 Cluster 聚合;标签按档位收放——
 *   世界/区域档只有聚合圈与少量确认地点标签,地方档才显示全部名称。
 */

import Map from 'ol/Map'
import View from 'ol/View'
import Projection from 'ol/proj/Projection'
import ImageLayer from 'ol/layer/Image'
import ImageCanvasSource from 'ol/source/ImageCanvas'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import ClusterSource from 'ol/source/Cluster'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { Point, LineString } from 'ol/geom'
import Feature from 'ol/Feature'
import Select from 'ol/interaction/Select'
import { createStringXY } from 'ol/coordinate'

import { dataYToViewportY, terrainSourceRect } from './yaxis.js'

const FONT = '12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'

export const THEME_TOKENS = {
  light: {
    text: '#1f2937',
    halo: 'rgba(255,255,255,0.88)',
    confirmed: '#d97706',
    candidate: '#2563eb',
    settlementFill: '#ffffff',
    settlementStroke: '#4b5563',
    capital: '#b45309',
    clusterFill: 'rgba(255,255,255,0.92)',
    clusterStroke: '#64748b',
    clusterText: '#334155',
    river: '#4f7fa6',
    selectStroke: '#d97706',
    selectFill: 'rgba(217,119,6,0.22)',
    hintBg: 'rgba(255,255,255,0.85)',
    hintFg: '#1f2937',
  },
  dark: {
    text: '#e8eef5',
    halo: 'rgba(16,20,24,0.8)',
    confirmed: '#d4a017',
    candidate: '#7f9fc4',
    settlementFill: '#e8e3d8',
    settlementStroke: '#1c232c',
    capital: '#ffd97a',
    clusterFill: 'rgba(35,44,54,0.9)',
    clusterStroke: '#5d6b7a',
    clusterText: '#cfd8e2',
    river: '#4f7fa6',
    selectStroke: '#d4a017',
    selectFill: 'rgba(212,160,23,0.25)',
    hintBg: 'rgba(16,20,24,0.82)',
    hintFg: '#d8dee6',
  },
}

function pinaxProjection(width, height) {
  return new Projection({
    code: 'pinax-plane',
    units: 'pixels',
    extent: [0, 0, width, height],
    worldExtent: [0, 0, width, height],
    getPointResolution: (r) => r,
  })
}

/** 地形底图:同一份 terrain 画布按主题选择。 */
function terrainSource(canvas, W, H, projection) {
  return new ImageCanvasSource({
    projection,
    canvasFunction: (extent, resolution, pixelRatio, size) => {
      const canvasOut = document.createElement('canvas')
      canvasOut.width = Math.round(size[0] * pixelRatio)
      canvasOut.height = Math.round(size[1] * pixelRatio)
      const ctx = canvasOut.getContext('2d')
      const { sx, sy, sw, sh } = terrainSourceRect(extent, H)
      if (sw <= 0 || sh <= 0) return canvasOut
      ctx.imageSmoothingEnabled = resolution < 1
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, canvasOut.width, canvasOut.height)
      return canvasOut
    },
  })
}

/**
 * 标签防杂乱策略(与 proto-ol-vector 共用语义):
 * - 世界/区域档(res > LOD_LOCAL):聚合圈 + 首都/确认宏观地点标签;
 * - 地方档(res <= LOD_LOCAL):全部标签,交给 declutter 避让。
 */
export const LOD_LOCAL = 0.9

export function createOlRasterPrototype(container, shared, initialTheme = 'light') {
  container.innerHTML = ''
  const { doc, terrainCanvases } = shared
  const W = doc.baseAsset.width
  const H = doc.baseAsset.height
  const projection = pinaxProjection(W, H)
  let theme = initialTheme
  const tokens = () => THEME_TOKENS[theme]

  const terrainCanvasesByTheme = terrainCanvases
  const rasterLayer = new ImageLayer({
    source: terrainSource(terrainCanvasesByTheme[theme], W, H, projection),
  })

  const settlementSource = new VectorSource()
  const placeSource = new VectorSource()
  for (const f of doc.featureCollections.settlements) {
    const [x, y] = f.geometry.coordinates
    const ol = new Feature(new Point([x, dataYToViewportY(y, H)]))
    ol.setProperties({
      featureId: f.properties.featureId,
      featureType: 'settlement',
      displayPriority: f.properties.displayPriority,
      label: f.properties.label,
      icon: f.properties.icon,
    })
    settlementSource.addFeature(ol)
  }
  for (const f of doc.featureCollections.narrativePlaces) {
    const [x, y] = f.geometry.coordinates
    const ol = new Feature(new Point([x, dataYToViewportY(y, H)]))
    ol.setProperties({
      featureId: f.properties.featureId,
      featureType: 'narrative-place',
      displayPriority: f.properties.displayPriority,
      label: f.properties.label,
      bindingStatus: f.properties.bindingStatus ?? 'unbound',
    })
    placeSource.addFeature(ol)
  }

  const placeClusterSource = new ClusterSource({ source: placeSource, distance: 36 })

  // 河流矢量层：底图不再烘焙河流（放大发虚），51 条线开销可忽略
  const riverSource = new VectorSource()
  for (const f of doc.featureCollections.rivers) {
    if (f.geometry.type !== 'line') continue
    const ol = new Feature(new LineString(f.geometry.coordinates.map(([x, y]) => [x, dataYToViewportY(y, H)])))
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'river' })
    riverSource.addFeature(ol)
  }
  function riverStyle(feature, resolution) {
    const t = tokens()
    const width = resolution > LOD_LOCAL ? 1.1 : 1.8
    return new Style({ stroke: new Stroke({ color: t.river, width }) })
  }
  const riverLayer = new VectorLayer({ source: riverSource, style: riverStyle, zIndex: 5 })

  function settlementStyle(feature, resolution) {
    const t = tokens()
    const priority = feature.get('displayPriority')
    const isCapital = priority >= 40
    const showLabel = resolution <= LOD_LOCAL || isCapital
    return new Style({
      image: new CircleStyle({
        radius: isCapital ? 4.5 : 3,
        fill: new Fill({ color: isCapital ? t.capital : t.settlementFill }),
        stroke: new Stroke({ color: t.settlementStroke, width: 1.2 }),
      }),
      text: showLabel && feature.get('label') ? new Text({
        text: feature.get('label'),
        offsetY: -10,
        font: FONT,
        fill: new Fill({ color: t.text }),
        stroke: new Stroke({ color: t.halo, width: 3 }),
      }) : undefined,
    })
  }

  function clusterStyle(feature, resolution) {
    const t = tokens()
    const members = feature.get('features') || []
    if (members.length > 1) {
      const radius = Math.min(15, 7 + Math.log2(members.length))
      return new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: t.clusterFill }),
          stroke: new Stroke({ color: t.clusterStroke, width: 1.4 }),
        }),
        text: new Text({
          text: String(members.length),
          font: '11px system-ui, sans-serif',
          fill: new Fill({ color: t.clusterText }),
        }),
      })
    }
    const f = members[0]
    const confirmed = f.get('bindingStatus') === 'confirmed'
    const macro = confirmed && f.get('displayPriority') >= 50
    const showLabel = resolution <= LOD_LOCAL || macro
    return new Style({
      image: new CircleStyle({
        radius: f.get('displayPriority') >= 50 ? 5.5 : 4,
        fill: new Fill({ color: confirmed ? t.confirmed : t.candidate }),
        stroke: new Stroke({ color: t.halo, width: 1.4 }),
      }),
      text: showLabel && f.get('label') ? new Text({
        text: f.get('label'),
        offsetY: -11,
        font: FONT,
        fill: new Fill({ color: t.text }),
        stroke: new Stroke({ color: t.halo, width: 3 }),
      }) : undefined,
    })
  }

  const settlementLayer = new VectorLayer({ source: settlementSource, style: settlementStyle, declutter: true, zIndex: 10 })
  const placeLayer = new VectorLayer({ source: placeClusterSource, style: clusterStyle, declutter: true, zIndex: 20 })

  const map = new Map({
    target: container,
    layers: [rasterLayer, riverLayer, settlementLayer, placeLayer],
    view: new View({
      projection,
      center: [W / 2, H / 2],
      resolution: Math.max(W / container.clientWidth, H / container.clientHeight),
      minResolution: 0.05,
      maxResolution: Math.max(W / container.clientWidth, H / container.clientHeight),
      constrainOnlyCenter: true,
    }),
  })

  // 地方档解除聚合，让单点散开（世界/区域档保持聚合防杂乱）
  const syncClusterDistance = () => {
    const res = map.getView().getResolution()
    placeClusterSource.setDistance(res <= LOD_LOCAL ? 0 : 36)
  }
  map.getView().on('change:resolution', syncClusterDistance)
  syncClusterDistance()

  const select = new Select({
    style: new Style({
      image: new CircleStyle({
        radius: 9,
        fill: new Fill({ color: tokens().selectFill }),
        stroke: new Stroke({ color: tokens().selectStroke, width: 2 }),
      }),
    }),
  })
  map.addInteraction(select)
  select.on('select', (e) => {
    const ids = e.selected.flatMap((f) => (f.get('features') || [f]).map((m) => m.get('featureId')).filter(Boolean))
    if (ids.length) {
      window.__mapSpikeSelection = ids
      container.dataset.selection = ids.join(',')
    }
  })

  const hint = document.createElement('div')
  hint.className = 'hint'
  container.appendChild(hint)
  const applyHintTheme = () => {
    const t = tokens()
    hint.style.background = t.hintBg
    hint.style.color = t.hintFg
  }
  map.on('pointermove', (e) => {
    applyHintTheme()
    hint.textContent = `② ${theme === 'light' ? '浅色' : '深色'} · ${placeSource.getFeatures().length} 作者地点(聚合) · ${settlementSource.getFeatures().length} 城镇 · ${createStringXY(0)(e.coordinate)}`
  })
  applyHintTheme()

  return {
    ready: new Promise((resolve) => map.once('rendercomplete', () => resolve())),
    getView: () => map.getView(),
    getSelect: () => select,
    pickTargetPixel() {
      const f = settlementSource.getFeatures().find((ft) => ft.get('displayPriority') >= 40)
      return f ? map.getPixelFromCoordinate(f.getGeometry().getCoordinates()) : null
    },
    focusTarget(resolution) {
      const f = settlementSource.getFeatures().find((ft) => ft.get('displayPriority') >= 40)
        ?? placeSource.getFeatures()[0]
      if (!f) return
      map.getView().animate({ center: f.getGeometry().getCoordinates(), resolution, duration: 300 })
    },
    setTheme(next) {
      if (next === theme) return
      theme = next
      rasterLayer.setSource(terrainSource(terrainCanvasesByTheme[theme], W, H, projection))
      settlementLayer.setStyle(settlementStyle)
      placeLayer.setStyle(clusterStyle)
      riverLayer.setStyle(riverStyle)
      select.getFeatures().clear()
      applyHintTheme()
    },
    dispose() {
      map.setTarget(undefined)
      select.dispose()
      placeClusterSource.dispose()
      settlementSource.dispose()
      placeSource.dispose()
      riverSource.dispose()
      container.innerHTML = ''
    },
  }
}
