/**
 * 地图生成主管线
 * 按顺序执行所有生成步骤
 */

import type { MapGenConfig, VoronoiMapData, MapConstraints } from './types'
import { seedRandom } from './random'
import { generatePoints, buildVoronoi } from './grid'
import { generateHeightmap } from './heightmap'
import { detectFeatures } from './features'
import { calculateTemperature, calculatePrecipitation, assignBiomes, rankCells } from './climate'
import { generateTectonics } from './tectonics'
import { computeTectonicData } from './tectonic-data'
import { perturbCoast } from './coast'
import { extractCoastlines } from './coastline'
import { generateWindAndCurrents } from './wind'
import { generateRivers } from './rivers'
import { generateCultures, generateBurgs, generateStates, generateProvinces, generateRoads } from './nations'
import { setNamingStyle } from './name-pool'
import type { PerfCollector } from './perf'

/** 生成完整地图 */
export function generateMap(
  config: MapGenConfig = {},
  collector?: PerfCollector,
  constraints?: MapConstraints,
): VoronoiMapData {
  const {
    width = 1200,
    height = 800,
    seed = String(Math.floor(Math.random() * 1e10)),
    pointCount = 6000,
    landRatio = 0.45,
    continentCount,  // legacy alias for plateCount（保留兼容）
    stateCount = 8,
    burgDensity = 0.5,
    temperatureShift = 0,
    precipitationFactor = 1.0,
    mapName = 'Fantasy World',
    namingStyle = 'chinese',
    generateProvinces: doProvinces = true,
    generateRoads: doRoads = true,
    plateCount = 6,
    plateSpeedFactor = 1,
    stateNames,
    burgNames,
    riverNames,
  } = config
  // continentCount 作为 plateCount 的 alias（无 plateCount 但有 continentCount 时生效）
  const effectivePlateCount = config.plateCount ?? continentCount ?? 6
  const effectiveContinentCount = Math.max(
    1,
    Math.min(
      config.continentCount ?? Math.max(2, Math.round(effectivePlateCount * 0.5)),
      effectivePlateCount,
    ),
  )

  const rng = seedRandom(seed)

  // 设置命名风格
  setNamingStyle(namingStyle)

  console.time('[MapEngine] Total generation')

  // 1. 生成 Voronoi 网格
  console.time('[MapEngine] Grid')
  collector?.start('grid')
  const points = generatePoints(width, height, pointCount, rng)
  const { cells, vertices } = buildVoronoi(points, width, height)
  console.timeEnd('[MapEngine] Grid')
  collector?.end('grid')

  // 2. 板块构造（azgaar 风格：板块是源头，不依赖 cells.h）
  console.time('[MapEngine] Tectonics')
  collector?.start('tectonics')
  const effectiveConstraints = constraints ?? config.constraints
    const { plates, boundaries, plateId } = generateTectonics(
      cells, width, height, rng, effectivePlateCount, plateSpeedFactor, effectiveContinentCount,
    effectiveConstraints,
  )
  // 填 cells.tectonic.*（6 个并行数组）。必须在 generateHeightmap 之前
  // 调用，因为 applyVolcanicArc 需要 cells.tectonic.plateId 走方向。
  cells.tectonic = computeTectonicData(cells, plateId, boundaries)
  console.timeEnd('[MapEngine] Tectonics')
  collector?.end('tectonics')

  // 3. 高度图（azgaar 风格：由板块 + 边界效果驱动）
  console.time('[MapEngine] Heightmap')
  collector?.start('heightmap')
  generateHeightmap(
    cells, width, height, rng, landRatio,
    plates, boundaries, effectiveContinentCount, config.realism,
  )
  console.timeEnd('[MapEngine] Heightmap')
  collector?.end('heightmap')

  // 3.5 海岸线扰动（azgaar 默认参数；用户显式传 coast 仍生效）
  perturbCoast(cells, {
    noiseScale: config.realism?.coast?.noiseScale ?? 0.012,
    noiseAmplitude: config.realism?.coast?.noiseAmplitude ?? 6,
  })

  // 3.6 海岸线多边形提取（每块主要陆块 1 个闭合 Point[] 环）
  const coastlines = extractCoastlines(cells, vertices, width, height)

  // 4. 检测地理特征（岛屿、湖泊、海洋）
  console.time('[MapEngine] Features')
  collector?.start('features')
  const features = detectFeatures(cells)
  console.timeEnd('[MapEngine] Features')
  collector?.end('features')

  // 5. 风场与洋流（需要 features 来识别海洋）
  console.time('[MapEngine] Wind & Currents')
  collector?.start('wind')
  const { wind, oceanCurrents } = generateWindAndCurrents(cells, width, height, features, rng)
  console.timeEnd('[MapEngine] Wind & Currents')
  collector?.end('wind')

  // 6. 气候：温度、降水量（接入风场+洋流）
  console.time('[MapEngine] Climate')
  collector?.start('climate')
  calculateTemperature(cells, width, height, wind, oceanCurrents, temperatureShift)
  calculatePrecipitation(cells, width, height, wind, precipitationFactor, rng)
  console.timeEnd('[MapEngine] Climate')
  collector?.end('climate')

  // 7. 河流
  console.time('[MapEngine] Rivers')
  collector?.start('rivers')
  const rivers = generateRivers(cells, rng, {
    style: config.realism?.rivers?.style ?? 'meandering',
    meanderAmplitude: config.realism?.rivers?.meanderAmplitude,
  })
  if (riverNames) {
    for (let i = 0; i < Math.min(rivers.length, riverNames.length); i++) {
      rivers[i].name = riverNames[i]
    }
  }
  console.timeEnd('[MapEngine] Rivers')
  collector?.end('rivers')

  // 8. 生态群落
  console.time('[MapEngine] Biomes')
  collector?.start('biomes')
  assignBiomes(cells)
  console.timeEnd('[MapEngine] Biomes')
  collector?.end('biomes')

  // 9. 适宜度评分
  rankCells(cells)

  // 10. 人口分布
  collector?.start('population')
  for (let i = 0; i < cells.length; i++) {
    cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
  }
  collector?.end('population')

  // 11. 文化
  console.time('[MapEngine] Cultures')
  collector?.start('cultures')
  const cultureCount = Math.max(3, Math.floor(stateCount * 0.8))
  const cultures = generateCultures(cells, cultureCount, rng)
  console.timeEnd('[MapEngine] Cultures')
  collector?.end('cultures')

  // 12. 城镇
  console.time('[MapEngine] Burgs')
  collector?.start('burgs')
  const burgs = generateBurgs(cells, stateCount, burgDensity, width, height, rng, burgNames)
  console.timeEnd('[MapEngine] Burgs')
  collector?.end('burgs')

  // 13. 国家
  console.time('[MapEngine] States')
  collector?.start('states')

  // 应用世界书 stateSeeds 约束：把指定 cell 强制设为对应国家的首都
  if (effectiveConstraints?.stateSeeds && effectiveConstraints.stateSeeds.length > 0) {
    const stateNameToCell = new Map<string, number>()
    for (const seed of effectiveConstraints.stateSeeds) {
      stateNameToCell.set(seed.name, seed.centerCell)
    }
    for (const burg of burgs) {
      if (burg.capital && burg.name && stateNameToCell.has(burg.name)) {
        const targetCell = stateNameToCell.get(burg.name)!
        if (targetCell > 0 && targetCell < cells.length && cells.h[targetCell] >= 20) {
          burg.cell = targetCell
        }
        stateNameToCell.delete(burg.name)
      }
    }
  }

  const states = generateStates(cells, burgs, stateCount, rng, stateNames)
  console.timeEnd('[MapEngine] States')
  collector?.end('states')

  // 14. 省份
  let provinces = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]
  if (doProvinces) {
    console.time('[MapEngine] Provinces')
    collector?.start('provinces')
    provinces = generateProvinces(cells, states, burgs, rng)
    console.timeEnd('[MapEngine] Provinces')
    collector?.end('provinces')
  }

  // 15. 道路
  let roads: VoronoiMapData['roads'] = []
  if (doRoads) {
    console.time('[MapEngine] Roads')
    collector?.start('roads')
    roads = generateRoads(cells, burgs, states, rng)
    console.timeEnd('[MapEngine] Roads')
    collector?.end('roads')
  }

  console.timeEnd('[MapEngine] Total generation')

  return {
    width,
    height,
    seed,
    cells,
    vertices,
    features,
    rivers,
    burgs,
    states,
    cultures,
    provinces,
    roads,
    plates,
    boundaries,
    oceanCurrents,
    wind,
    coastlines,
    name: mapName,
  }
}

/** 让出主线程，浏览器处理完事件队列后继续 */
const yieldToMain = () => new Promise<void>(r => setTimeout(r, 0))

/** 异步生成完整地图 — 每步让出主线程，防止页面卡死 */
export async function generateMapAsync(
  config: MapGenConfig = {},
  onProgress?: (step: string, percent: number) => void,
  collector?: PerfCollector,
  constraints?: MapConstraints,
): Promise<VoronoiMapData> {
  const {
    width = 1200,
    height = 800,
    seed = String(Math.floor(Math.random() * 1e10)),
    pointCount = 6000,
    landRatio = 0.45,
    continentCount,  // legacy alias for plateCount（保留兼容）
    stateCount = 8,
    burgDensity = 0.5,
    temperatureShift = 0,
    precipitationFactor = 1.0,
    mapName = 'Fantasy World',
    namingStyle = 'chinese',
    generateProvinces: doProvinces = true,
    generateRoads: doRoads = true,
    plateCount = 6,
    plateSpeedFactor = 1,
    stateNames,
    burgNames,
    riverNames,
  } = config
  // continentCount 作为 plateCount 的 alias（无 plateCount 但有 continentCount 时生效）
  const effectivePlateCount = config.plateCount ?? continentCount ?? 6
  const effectiveContinentCount = Math.max(
    1,
    Math.min(
      config.continentCount ?? Math.max(2, Math.round(effectivePlateCount * 0.5)),
      effectivePlateCount,
    ),
  )

  const rng = seedRandom(seed)
  setNamingStyle(namingStyle)

  // 1. Grid
  onProgress?.('网格', 0)
  collector?.start('grid')
  const points = generatePoints(width, height, pointCount, rng)
  const { cells, vertices } = buildVoronoi(points, width, height)
  collector?.end('grid')
  await yieldToMain()

  // 2. Tectonics (azgaar-style: plates first)
  onProgress?.('板块构造', 7)
  collector?.start('tectonics')
  const effectiveConstraints = constraints ?? config.constraints
    const { plates, boundaries, plateId } = generateTectonics(
      cells, width, height, rng, effectivePlateCount, plateSpeedFactor, effectiveContinentCount,
    effectiveConstraints,
  )
  cells.tectonic = computeTectonicData(cells, plateId, boundaries)
  collector?.end('tectonics')
  await yieldToMain()

  // 3. Heightmap (azgaar-style: plate-driven)
  onProgress?.('高度图', 14)
  collector?.start('heightmap')
  generateHeightmap(
    cells, width, height, rng, landRatio,
    plates, boundaries, effectiveContinentCount, config.realism,
  )
  collector?.end('heightmap')
  await yieldToMain()

  // 3.5 Coast perturbation (azgaar default; user override via realism.coast)
  perturbCoast(cells, {
    noiseScale: config.realism?.coast?.noiseScale ?? 0.012,
    noiseAmplitude: config.realism?.coast?.noiseAmplitude ?? 6,
  })

  // 3.6 Coastline polygons (Voronoi boundary walk, one closed ring per major landmass)
  const coastlines = extractCoastlines(cells, vertices, width, height)

  // 4. Features
  onProgress?.('地理特征', 21)
  collector?.start('features')
  const features = detectFeatures(cells)
  collector?.end('features')
  await yieldToMain()

  // 5. Wind & Currents
  onProgress?.('风场洋流', 28)
  collector?.start('wind')
  const { wind, oceanCurrents } = generateWindAndCurrents(cells, width, height, features, rng)
  collector?.end('wind')
  await yieldToMain()

  // 6. Climate
  onProgress?.('气候', 35)
  collector?.start('climate')
  calculateTemperature(cells, width, height, wind, oceanCurrents, temperatureShift)
  calculatePrecipitation(cells, width, height, wind, precipitationFactor, rng)
  collector?.end('climate')
  await yieldToMain()

  // 7. Rivers
  onProgress?.('河流', 42)
  collector?.start('rivers')
  const rivers = generateRivers(cells, rng, {
    style: config.realism?.rivers?.style ?? 'meandering',
    meanderAmplitude: config.realism?.rivers?.meanderAmplitude,
  })
  if (riverNames) {
    for (let i = 0; i < Math.min(rivers.length, riverNames.length); i++) {
      rivers[i].name = riverNames[i]
    }
  }
  collector?.end('rivers')
  await yieldToMain()

  // 8. Biomes
  onProgress?.('生态群落', 49)
  collector?.start('biomes')
  assignBiomes(cells)
  collector?.end('biomes')
  rankCells(cells)
  await yieldToMain()

  // 9. Population
  collector?.start('population')
  for (let i = 0; i < cells.length; i++) {
    cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
  }
  collector?.end('population')

  // 10. Cultures
  onProgress?.('文化', 56)
  collector?.start('cultures')
  const cultureCount = Math.max(3, Math.floor(stateCount * 0.8))
  const cultures = generateCultures(cells, cultureCount, rng)
  collector?.end('cultures')
  await yieldToMain()

  // 11. Burgs
  onProgress?.('城镇', 63)
  collector?.start('burgs')
  const burgs = generateBurgs(cells, stateCount, burgDensity, width, height, rng, burgNames)
  collector?.end('burgs')
  await yieldToMain()

  // 12. States
  onProgress?.('国家', 70)
  collector?.start('states')

  // 应用世界书 stateSeeds 约束
  if (effectiveConstraints?.stateSeeds && effectiveConstraints.stateSeeds.length > 0) {
    const stateNameToCell = new Map<string, number>()
    for (const seed of effectiveConstraints.stateSeeds) {
      stateNameToCell.set(seed.name, seed.centerCell)
    }
    for (const burg of burgs) {
      if (burg.capital && burg.name && stateNameToCell.has(burg.name)) {
        const targetCell = stateNameToCell.get(burg.name)!
        if (targetCell > 0 && targetCell < cells.length && cells.h[targetCell] >= 20) {
          burg.cell = targetCell
        }
        stateNameToCell.delete(burg.name)
      }
    }
  }

  const states = generateStates(cells, burgs, stateCount, rng, stateNames)
  collector?.end('states')
  await yieldToMain()

  // 13. Provinces
  onProgress?.('省份', 77)
  let provinces = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]
  if (doProvinces) {
    collector?.start('provinces')
    provinces = generateProvinces(cells, states, burgs, rng)
    collector?.end('provinces')
  }
  await yieldToMain()

  // 14. Roads
  onProgress?.('道路', 84)
  let roads: VoronoiMapData['roads'] = []
  if (doRoads) {
    collector?.start('roads')
    roads = generateRoads(cells, burgs, states, rng)
    collector?.end('roads')
  }
  await yieldToMain()

  onProgress?.('完成', 100)

  return {
    width,
    height,
    seed,
    cells,
    vertices,
    features,
    rivers,
    burgs,
    states,
    cultures,
    provinces,
    roads,
    plates,
    boundaries,
    oceanCurrents,
    wind,
    coastlines,
    name: mapName,
  }
}
