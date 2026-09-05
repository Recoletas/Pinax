/**
 * 原型 ③——OpenLayers 全矢量：海岸（聚合陆块）、河流、路线、城镇、
 * 作者地点 + 屏幕像素标签 + declutter + 三档 LOD + 线标注。
 * 全部数据来自同一份 MapDocument v2。
 */

import Map from 'ol/Map'
import View from 'ol/View'
import Projection from 'ol/proj/Projection'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { Point, LineString, Polygon } from 'ol/geom'
import Feature from 'ol/Feature'
import Select from 'ol/interaction/Select'

import { dataYToViewportY } from './yaxis.js'

const FONT = '12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
const FONT_BIG = '14px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'

// 三档 LOD 阈值（分辨率 = 地图单位/像素）：>6 世界档；0.9–6 区域档；<0.9 地方档
export const LOD_TIERS = { world: 6, region: 0.9 }

function toOL(doc) {
  const H = doc.baseAsset.height
  const features = { land: [], water: [], rivers: [], routes: [], settlements: [], places: [] }
  const flip = (c) => [c[0], dataYToViewportY(c[1], H)]

  for (const f of doc.featureCollections.land) {
    if (f.geometry.type !== 'polygon') continue
    const geom = new Polygon(f.geometry.coordinates.map((ring) => ring.map(flip)))
    const ol = new Feature(geom)
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'landmass', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority })
    ol.setStyle(landStyle)
    features.land.push(ol)
  }
  for (const f of doc.featureCollections.water) {
    if (f.geometry.type !== 'point') continue
    const ol = new Feature(new Point(flip(f.geometry.coordinates)))
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'water', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority })
    ol.setStyle(waterStyle)
    features.water.push(ol)
  }
  for (const f of doc.featureCollections.rivers) {
    if (f.geometry.type !== 'line') continue
    const geom = new LineString(f.geometry.coordinates.map(flip))
    const ol = new Feature(geom)
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'river', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority, label: f.properties.label })
    ol.setStyle(riverStyleFactory)
    features.rivers.push(ol)
  }
  for (const f of doc.featureCollections.routes) {
    if (f.geometry.type !== 'line') continue
    const geom = new LineString(f.geometry.coordinates.map(flip))
    const ol = new Feature(geom)
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'route', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority })
    ol.setStyle(routeStyleFactory)
    features.routes.push(ol)
  }
  for (const f of doc.featureCollections.settlements) {
    const ol = new Feature(new Point(flip(f.geometry.coordinates)))
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'settlement', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority, label: f.properties.label, icon: f.properties.icon })
    ol.setStyle(settlementStyleFactory)
    features.settlements.push(ol)
  }
  for (const f of doc.featureCollections.narrativePlaces) {
    const ol = new Feature(new Point(flip(f.geometry.coordinates)))
    ol.setProperties({ featureId: f.properties.featureId, featureType: 'narrative-place', mapRevision: f.properties.mapRevision, displayPriority: f.properties.displayPriority, label: f.properties.label, bindingStatus: f.properties.bindingStatus ?? 'unbound' })
    ol.setStyle(placeStyleFactory)
    features.places.push(ol)
  }
  return features
}

const landStyle = new Style({
  fill: new Fill({ color: '#202a26' }),
  stroke: new Stroke({ color: '#7fb08a', width: 1.4 }),
})
const waterStyle = new Style({
  image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#5b84a8' }), stroke: new Stroke({ color: '#101418', width: 1 }) }),
})

function riverStyleFactory(feature, resolution) {
  const width = resolution > LOD_TIERS.world ? 1 : resolution > LOD_TIERS.region ? 1.6 : 2.4
  const showLabel = resolution <= LOD_TIERS.region
  return new Style({
    stroke: new Stroke({ color: '#4f7fa6', width }),
    text: showLabel && feature.get('label') ? new Text({
      text: feature.get('label'),
      placement: 'line',
      overflow: true,
      font: FONT,
      fill: new Fill({ color: '#9cc4e4' }),
      stroke: new Stroke({ color: '#101418cc', width: 3 }),
    }) : undefined,
  })
}
function routeStyleFactory(feature, resolution) {
  if (resolution > LOD_TIERS.world * 1.5) return []
  return new Style({
    stroke: new Stroke({ color: '#b0926a', width: 1.2, lineDash: [4, 3] }),
  })
}
function settlementStyleFactory(feature, resolution) {
  const priority = feature.get('displayPriority')
  if (resolution > LOD_TIERS.world && priority < 40) return []
  const radius = resolution > LOD_TIERS.world ? 3 : 3.5
  return new Style({
    image: new CircleStyle({ radius, fill: new Fill({ color: '#e8e3d8' }), stroke: new Stroke({ color: '#1c232c', width: 1.2 }) }),
    // 世界档只标首都/大城；区域以下全部标注，交给 declutter 避让
    text: resolution < LOD_TIERS.world && feature.get('label') ? new Text({
      text: feature.get('label'),
      offsetY: -radius - 7,
      font: priority >= 40 ? FONT_BIG : FONT,
      fill: new Fill({ color: priority >= 40 ? '#ffffff' : '#cfd8e2' }),
      stroke: new Stroke({ color: '#101418cc', width: 3 }),
    }) : undefined,
  })
}
function placeStyleFactory(feature, resolution) {
  const priority = feature.get('displayPriority')
  const confirmed = feature.get('bindingStatus') === 'confirmed'
  // 世界档：只保留作者确认的宏观地点；区域档：确认地点 + 高优先级；
  // 地方档：全部（计划 §5.2 三档 LOD）
  if (resolution > LOD_TIERS.world && !(confirmed && priority >= 50)) return []
  if (resolution > LOD_TIERS.region && !(confirmed || priority >= 50)) return []
  return new Style({
    image: new CircleStyle({
      radius: priority >= 50 ? 6 : 4.5,
      fill: new Fill({ color: confirmed ? '#d4a017' : '#7f9fc4' }),
      stroke: new Stroke({ color: '#101418', width: 1.4 }),
    }),
    text: feature.get('label') ? new Text({
      text: feature.get('label'),
      offsetY: -(priority >= 50 ? 6 : 4.5) - 8,
      font: FONT,
      fill: new Fill({ color: confirmed ? '#ffd97a' : '#a9c6e8' }),
      stroke: new Stroke({ color: '#101418cc', width: 3 }),
    }) : undefined,
  })
}

export function createOlVectorPrototype(container, shared) {
  container.innerHTML = ''
  const { doc } = shared
  const W = doc.baseAsset.width
  const H = doc.baseAsset.height
  const projection = new Projection({
    code: 'pinax-plane',
    units: 'pixels',
    extent: [0, 0, W, H],
    worldExtent: [0, 0, W, H],
    getPointResolution: (r) => r,
  })

  const t0 = performance.now()
  const groups = toOL(doc)
  const conversionMs = Math.round(performance.now() - t0)
  window.__mapSpikeVectorConversionMs = conversionMs

  const sources = {}
  for (const key of Object.keys(groups)) {
    sources[key] = new VectorSource({ features: groups[key] })
  }

  const layers = [
    new VectorLayer({ source: sources.land, declutter: false, background: '#141b22' }),
    new VectorLayer({ source: sources.water, declutter: false }),
    new VectorLayer({ source: sources.rivers, declutter: true }),
    new VectorLayer({ source: sources.routes, declutter: true, minZoomPlaceholder: undefined }),
    new VectorLayer({ source: sources.settlements, declutter: true }),
    new VectorLayer({ source: sources.places, declutter: true, zIndex: 20 }),
  ]

  const map = new Map({
    target: container,
    layers,
    view: new View({
      projection,
      center: [W / 2, H / 2],
      resolution: Math.max(W / container.clientWidth, H / container.clientHeight),
      minResolution: 0.05,
      maxResolution: Math.max(W / container.clientWidth, H / container.clientHeight),
      constrainOnlyCenter: true,
    }),
  })

  const select = new Select({
    style: new Style({
      image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(212,160,23,0.25)' }), stroke: new Stroke({ color: '#d4a017', width: 2 }) }),
      stroke: new Stroke({ color: '#d4a017', width: 3 }),
    }),
  })
  map.addInteraction(select)
  select.on('select', (e) => {
    const ids = e.selected.map((f) => f.get('featureId'))
    if (ids.length) {
      window.__mapSpikeSelection = ids
      container.dataset.selection = ids.join(',')
    }
  })

  const hint = document.createElement('div')
  hint.className = 'hint'
  container.appendChild(hint)
  const updateHint = () => {
    const res = map.getView().getResolution()
    const tier = res > LOD_TIERS.world ? '世界' : res > LOD_TIERS.region ? '区域' : '地方'
    hint.textContent = `③ 全矢量 · ${tier}档 (res=${res.toFixed(2)}) · 转换耗时 ${conversionMs}ms · 陆块${groups.land.length} 河${groups.rivers.length} 路${groups.routes.length} 城${groups.settlements.length} 作者地点${groups.places.length}`
  }
  map.on('pointermove', (e) => {
    updateHint()
    hint.textContent += ` · ${e.coordinate.map((v) => Math.round(v)).join(',')}`
  })
  map.getView().on('change:resolution', updateHint)
  updateHint()

  return {
    ready: new Promise((resolve) => map.once('rendercomplete', () => resolve())),
    getView: () => map.getView(),
    getSelect: () => select,
  /** 供 Gate 脚本点击真实 feature。 */
  pickTargetPixel() {
    const f = sources.settlements.getFeatures().find((ft) => ft.get('displayPriority') >= 40)
      ?? sources.places.getFeatures().find((ft) => ft.get('bindingStatus') === 'confirmed')
    return f ? map.getPixelFromCoordinate(f.getGeometry().getCoordinates()) : null
  },
  /** 聚焦到目标 feature 所在位置并设置分辨率（Gate 缩放序列用）。 */
  focusTarget(resolution) {
    const f = sources.settlements.getFeatures().find((ft) => ft.get('displayPriority') >= 40)
      ?? sources.places.getFeatures()[0]
    if (!f) return
    const c = f.getGeometry().getCoordinates()
    map.getView().animate({ center: c, resolution, duration: 300 })
  },
    dispose() {
      map.setTarget(undefined)
      select.dispose()
      for (const s of Object.values(sources)) s.dispose()
      container.innerHTML = ''
    },
  }
}
