/**
 * 地图生成主管线
 * 按顺序执行所有生成步骤
 */

import type { MapGenConfig, VoronoiMapData } from './types'
import { seedRandom } from './random'
import { generatePoints, buildVoronoi } from './grid'
import { generateHeightmap } from './heightmap'
import { detectFeatures } from './features'
import { calculateTemperature, calculatePrecipitation, assignBiomes, rankCells } from './climate'
import { generateTectonics } from './tectonics'
import { generateWindAndCurrents } from './wind'
import { generateRivers } from './rivers'
import { generateCultures, generateBurgs, generateStates, generateProvinces, generateRoads } from './nations'
import { setNamingStyle } from './name-pool'

/** 生成完整地图 */
export function generateMap(config: MapGenConfig = {}): VoronoiMapData {
  const {
    width = 1200,
    height = 800,
    seed = String(Math.floor(Math.random() * 1e10)),
    pointCount = 6000,
    landRatio = 0.45,
    continentCount = 2,
    stateCount = 8,
    burgDensity = 0.5,
    temperatureShift = 0,
    precipitationFactor = 1.0,
    mapName = 'Fantasy World',
    heightmapTemplate = 'continents',
    namingStyle = 'chinese',
    generateProvinces: doProvinces = true,
    generateRoads: doRoads = true,
    plateCount = 6,
    plateSpeedFactor = 1,
    stateNames,
    burgNames,
    riverNames,
  } = config

  const rng = seedRandom(seed)

  // 设置命名风格
  setNamingStyle(namingStyle)

  console.time('[MapEngine] Total generation')

  // 1. 生成 Voronoi 网格
  console.time('[MapEngine] Grid')
  const points = generatePoints(width, height, pointCount, rng)
  const { cells, vertices } = buildVoronoi(points, width, height)
  console.timeEnd('[MapEngine] Grid')

  // 2. 生成高度图（支持模板）
  console.time('[MapEngine] Heightmap')
  generateHeightmap(cells, width, height, rng, landRatio, continentCount, heightmapTemplate)
  console.timeEnd('[MapEngine] Heightmap')

  // 3. 板块构造（在高度图之后，叠加山脉/裂谷/火山）
  console.time('[MapEngine] Tectonics')
  const { plates, boundaries } = generateTectonics(cells, width, height, rng, plateCount, plateSpeedFactor)
  console.timeEnd('[MapEngine] Tectonics')

  // 4. 检测地理特征（岛屿、湖泊、海洋）
  console.time('[MapEngine] Features')
  const features = detectFeatures(cells)
  console.timeEnd('[MapEngine] Features')

  // 5. 风场与洋流（需要 features 来识别海洋）
  console.time('[MapEngine] Wind & Currents')
  const { wind, oceanCurrents } = generateWindAndCurrents(cells, width, height, features, rng)
  console.timeEnd('[MapEngine] Wind & Currents')

  // 6. 气候：温度、降水量（接入风场+洋流）
  console.time('[MapEngine] Climate')
  calculateTemperature(cells, width, height, wind, oceanCurrents, temperatureShift)
  calculatePrecipitation(cells, width, height, wind, precipitationFactor, rng)
  console.timeEnd('[MapEngine] Climate')

  // 7. 河流
  console.time('[MapEngine] Rivers')
  const rivers = generateRivers(cells, rng)
  if (riverNames) {
    for (let i = 0; i < Math.min(rivers.length, riverNames.length); i++) {
      rivers[i].name = riverNames[i]
    }
  }
  console.timeEnd('[MapEngine] Rivers')

  // 8. 生态群落
  console.time('[MapEngine] Biomes')
  assignBiomes(cells)
  console.timeEnd('[MapEngine] Biomes')

  // 9. 适宜度评分
  rankCells(cells)

  // 10. 人口分布
  for (let i = 0; i < cells.length; i++) {
    cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
  }

  // 11. 文化
  console.time('[MapEngine] Cultures')
  const cultureCount = Math.max(3, Math.floor(stateCount * 0.8))
  const cultures = generateCultures(cells, cultureCount, rng)
  console.timeEnd('[MapEngine] Cultures')

  // 12. 城镇
  console.time('[MapEngine] Burgs')
  const burgs = generateBurgs(cells, stateCount, burgDensity, width, height, rng, burgNames)
  console.timeEnd('[MapEngine] Burgs')

  // 13. 国家
  console.time('[MapEngine] States')
  const states = generateStates(cells, burgs, stateCount, rng, stateNames)
  console.timeEnd('[MapEngine] States')

  // 14. 省份
  let provinces = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]
  if (doProvinces) {
    console.time('[MapEngine] Provinces')
    provinces = generateProvinces(cells, states, burgs, rng)
    console.timeEnd('[MapEngine] Provinces')
  }

  // 15. 道路
  let roads: VoronoiMapData['roads'] = []
  if (doRoads) {
    console.time('[MapEngine] Roads')
    roads = generateRoads(cells, burgs, states, rng)
    console.timeEnd('[MapEngine] Roads')
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
    name: mapName,
  }
}

/** 让出主线程，浏览器处理完事件队列后继续 */
const yieldToMain = () => new Promise<void>(r => setTimeout(r, 0))

/** 异步生成完整地图 — 每步让出主线程，防止页面卡死 */
export async function generateMapAsync(
  config: MapGenConfig = {},
  onProgress?: (step: string, percent: number) => void,
): Promise<VoronoiMapData> {
  const {
    width = 1200,
    height = 800,
    seed = String(Math.floor(Math.random() * 1e10)),
    pointCount = 6000,
    landRatio = 0.45,
    continentCount = 2,
    stateCount = 8,
    burgDensity = 0.5,
    temperatureShift = 0,
    precipitationFactor = 1.0,
    mapName = 'Fantasy World',
    heightmapTemplate = 'continents',
    namingStyle = 'chinese',
    generateProvinces: doProvinces = true,
    generateRoads: doRoads = true,
    plateCount = 6,
    plateSpeedFactor = 1,
    stateNames,
    burgNames,
    riverNames,
  } = config

  const rng = seedRandom(seed)
  setNamingStyle(namingStyle)

  // 1. Grid
  onProgress?.('网格', 0)
  const points = generatePoints(width, height, pointCount, rng)
  const { cells, vertices } = buildVoronoi(points, width, height)
  await yieldToMain()

  // 2. Heightmap
  onProgress?.('高度图', 7)
  generateHeightmap(cells, width, height, rng, landRatio, continentCount, heightmapTemplate)
  await yieldToMain()

  // 3. Tectonics
  onProgress?.('板块构造', 14)
  const { plates, boundaries } = generateTectonics(cells, width, height, rng, plateCount, plateSpeedFactor)
  await yieldToMain()

  // 4. Features
  onProgress?.('地理特征', 21)
  const features = detectFeatures(cells)
  await yieldToMain()

  // 5. Wind & Currents
  onProgress?.('风场洋流', 28)
  const { wind, oceanCurrents } = generateWindAndCurrents(cells, width, height, features, rng)
  await yieldToMain()

  // 6. Climate
  onProgress?.('气候', 35)
  calculateTemperature(cells, width, height, wind, oceanCurrents, temperatureShift)
  calculatePrecipitation(cells, width, height, wind, precipitationFactor, rng)
  await yieldToMain()

  // 7. Rivers
  onProgress?.('河流', 42)
  const rivers = generateRivers(cells, rng)
  if (riverNames) {
    for (let i = 0; i < Math.min(rivers.length, riverNames.length); i++) {
      rivers[i].name = riverNames[i]
    }
  }
  await yieldToMain()

  // 8. Biomes
  onProgress?.('生态群落', 49)
  assignBiomes(cells)
  rankCells(cells)
  await yieldToMain()

  // 9. Population
  for (let i = 0; i < cells.length; i++) {
    cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
  }

  // 10. Cultures
  onProgress?.('文化', 56)
  const cultureCount = Math.max(3, Math.floor(stateCount * 0.8))
  const cultures = generateCultures(cells, cultureCount, rng)
  await yieldToMain()

  // 11. Burgs
  onProgress?.('城镇', 63)
  const burgs = generateBurgs(cells, stateCount, burgDensity, width, height, rng, burgNames)
  await yieldToMain()

  // 12. States
  onProgress?.('国家', 70)
  const states = generateStates(cells, burgs, stateCount, rng, stateNames)
  await yieldToMain()

  // 13. Provinces
  onProgress?.('省份', 77)
  let provinces = [{ i: 0, name: '', color: '#ccc', state: 0, capital: 0, cells: 0 }]
  if (doProvinces) {
    provinces = generateProvinces(cells, states, burgs, rng)
  }
  await yieldToMain()

  // 14. Roads
  onProgress?.('道路', 84)
  let roads: VoronoiMapData['roads'] = []
  if (doRoads) {
    roads = generateRoads(cells, burgs, states, rng)
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
    name: mapName,
  }
}
