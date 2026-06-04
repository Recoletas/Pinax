/**
 * Voronoi 地图引擎 — 入口
 */
export { generateMap, generateMapAsync } from './generate'
export { generateMapInWorker, terminateWorker } from './worker-bridge'
export { renderMap, renderMapAsync } from './renderer'
export type { RenderOptions } from './renderer'
export type {
  MapGenConfig, VoronoiMapData,
  NamingStyle, MapStylePreset,
  LayerVisibility, BiomeOverride,
} from './types'
export { STYLE_PRESET_LABELS } from './style-presets'
