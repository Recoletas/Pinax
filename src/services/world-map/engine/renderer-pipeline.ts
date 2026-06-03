/**
 * 渲染管线：6 preset × 多 layer 的开关与参数表
 *
 * 用于 Task 11 的 renderer.ts dispatch：
 *   const layers = getPipeline(preset)
 *   for (const layer of layers) if (layer.enabled) renderLayer(...)
 */
import type { MapStylePreset } from './types'

export interface LayerSpec {
  name: string
  enabled: boolean
  options?: Record<string, unknown>
}

const PIPELINES: Record<MapStylePreset, LayerSpec[]> = {
  topographic: [
    { name: 'hillshade', enabled: true, options: { strength: 1.0 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: false },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  parchment: [
    { name: 'hillshade', enabled: true, options: { strength: 0.8 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 1.5 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.35 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: false },
    { name: 'vignette', enabled: true },
  ],
  watercolor: [
    { name: 'hillshade', enabled: true, options: { strength: 0.5 } },
    { name: 'terrain', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: false },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  dark: [
    { name: 'hillshade', enabled: true, options: { strength: 0.6 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  clean: [
    { name: 'hillshade', enabled: false },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 1.0 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.5 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: false },
  ],
  atlas: [
    { name: 'hillshade', enabled: true, options: { strength: 0.9 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 2.0 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.4 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
}

const ALL_LAYERS = [
  'hillshade', 'terrain', 'coastlines', 'coastGlow', 'volcanoes',
  'rivers', 'borders', 'borderlands', 'factionTexture',
  'roads', 'stateLabels', 'burgIcons', 'burgLabels',
  'scaleBar', 'vignette',
]

/** 获取指定 preset 的 layer 列表（按渲染顺序）；未知 preset 退回 topographic */
export function getPipeline(preset: MapStylePreset): LayerSpec[] {
  return PIPELINES[preset] || PIPELINES.topographic
}

/** 返回所有可用 layer 名（用于 UI 调试） */
export function getAvailableLayers(): string[] {
  return ALL_LAYERS
}
