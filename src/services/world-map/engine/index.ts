/**
 * Voronoi 地图引擎 — 入口
 */
export { generateMap, generateMapAsync } from './generate'
export { generateMapInWorker, terminateWorker } from './worker-bridge'
export { renderMap, renderMapAsync, renderScaleBarLayer } from './renderer'
export type { RenderOptions } from './renderer'
export { extractCoastlines } from './coastline'
export type { Point as CoastPoint } from './coastline'
export type {
  MapGenConfig, VoronoiMapData,
  NamingStyle, MapStylePreset,
  LayerVisibility, BiomeOverride,
  NormPoint,
} from './types'
export { STYLE_PRESET_LABELS } from './style-presets'
