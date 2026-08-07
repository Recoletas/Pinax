/**
 * Voronoi 地图 AI 适配器
 * AI 分析世界观设定 → 生成 MapGenConfig 参数（Azgaar 模板 + 板块数 + 命名风格） → 引擎生成地图
 */

import {
  VALID_BIOME_IDS,
  VALID_HEIGHTMAP_TEMPLATES,
  VALID_LAYER_KEYS,
  VALID_NAMING,
  VALID_STYLE_PRESETS,
} from '../../config/geography-types'
import { useGeographyStore } from '../../stores/geographyStore'
import { validateMapConfig } from './mapConfigSchema'

/**
 * 构建 AI prompt，让 AI 根据世界观描述输出 MapGenConfig
 * @param {object|null} worldview - 结构化世界观设定
 * @param {string} overview - 地理总述
 * @param {Array} locations - 地点列表
 * @param {object|null} worldbookBridge - extractMapSeedsFromWorldbook 的结果
 * @returns {Array} ChatMessage[]
 */
export function buildVoronoiMapPrompt(worldview, overview, locations, worldbookBridge = null) {
  const contextParts = []

  const compactText = (value, limit) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (text.length <= limit) return text
    const head = Math.max(0, limit - 80)
    return `${text.slice(0, head)} … [已压缩] … ${text.slice(-70)}`
  }

  if (worldview?.worldStructure) contextParts.push(`【世界结构】${compactText(worldview.worldStructure, 900)}`)
  if (worldview?.worldDimensions) contextParts.push(`【世界尺寸】${compactText(worldview.worldDimensions, 500)}`)
  if (worldview?.continentLayout) contextParts.push(`【大陆分布】${compactText(worldview.continentLayout, 900)}`)
  if (worldview?.mountainsRivers) contextParts.push(`【山川河流】${compactText(worldview.mountainsRivers, 900)}`)
  if (worldview?.climateByRegion) contextParts.push(`【气候分区】${compactText(worldview.climateByRegion, 900)}`)
  if (worldview?.factionLayout) contextParts.push(`【势力分布】${compactText(worldview.factionLayout, 900)}`)
  if (worldview?.races) contextParts.push(`【种族设定】${compactText(worldview.races, 500)}`)
  if (worldview?.politicsEconomyCulture) contextParts.push(`【政治经济文化】${compactText(worldview.politicsEconomyCulture, 900)}`)
  if (overview) contextParts.push(`【地理总述】${compactText(overview, 2600)}`)
  if (worldbookBridge?.loreContextBlock) contextParts.push(compactText(worldbookBridge.loreContextBlock, 900))
  const mountainSeeds = worldbookBridge?.constraints?.mountains
  if (Array.isArray(mountainSeeds) && mountainSeeds.length > 0) {
    contextParts.push(`【世界书山脉/火山约束】${mountainSeeds.slice(0, 8).map(m => `${m.name}(${m.type || 'range'})`).join('、')}`)
  }

  const locationList = Array.isArray(locations) && locations.length > 0
    ? locations
      .filter(location => location && String(location.name || '').trim())
      .slice(0, 16)
      .map(location => `- ${compactText(location.name, 80)}（${compactText(location.type, 40)}）：${compactText(location.description || '无描述', 180)}`)
      .join('\n')
    : ''

  const worldContext = contextParts.length > 0
    ? contextParts.join('\n')
    : '（用户未填写世界观描述，请生成一个中文古风奇幻世界）'

  const timingHint = getGenerationTimingHint()

  const systemPrompt = `你是 Pinax 的地图宏观参数设计器。根据世界设定输出地图引擎配置，不要生成坐标、多边形、地点、道路或地点绑定。

只返回可直接 JSON.parse 的纯 JSON，不要 Markdown、解释或思考内容。可用字段：
{"seed":"字符串","mapName":"名称","width":1200,"height":800,"pointCount":6000,"landRatio":0.45,"heightmapTemplate":"continents|pangea|archipelago|mediterranean|peninsula|shattered","plateCount":6,"stateCount":8,"burgDensity":0.5,"temperatureShift":0,"precipitationFactor":1,"namingStyle":"chinese|japanese|european|arabic|highFantasy|darkFantasy","stylePreset":"topographic|parchment|watercolor|dark|clean|atlas","generateProvinces":true,"generateRoads":true,"layers":{},"realism":{}}

只根据资料决定宏观形状、板块数、气候、命名风格和密度。“已设定的地点”仅用于判断宏观地理需求，禁止复制到 stateNames、burgNames、riverNames 或 constraints，禁止为它们猜测坐标。作者地点由客户端在真实地图对象中匹配并交给用户确认。`

  const userPrompt = `请根据以下世界观描述，设计地图生成参数 JSON：

${timingHint ? `${timingHint}\n` : ''}${worldContext}
${locationList ? `\n已设定的地点：\n${locationList}` : ''}

请输出纯 JSON 格式的地图参数。`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * 解析 AI 返回的 JSON 为 MapGenConfig
 * @param {string} raw - AI 返回的原始文本
 * @returns {{ok: true, config: object, warnings: string[]} | {ok: false, reason: string, message: string, raw: string, warnings: string[]}}
 */
export function parseVoronoiMapConfig(raw) {
  const warnings = []
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (error) {
    return {
      ok: false,
      reason: 'PARSE',
      message: error instanceof Error ? error.message : 'Invalid JSON',
      raw,
      warnings,
    }
  }

  const validation = validateMapConfig(parsed)
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'VALIDATION',
      message: validation.reason || 'Invalid config payload',
      raw,
      warnings,
    }
  }
  warnings.push(...validation.warnings)
  if (validation.unknownFields.length > 0) {
    warnings.push(`unknown fields ignored: ${validation.unknownFields.join(', ')}`)
  }

  const plateCount = clamp(
    parsed.plateCount ?? parsed.continentCount ?? 6,
    2, 12,
  )

  const stateCount = clamp(parsed.stateCount || 8, 2, 15)
  const config = {
    width: clamp(parsed.width || 1200, 400, 4096),
    height: clamp(parsed.height || 800, 400, 4096),
    seed: String(parsed.seed || Math.floor(Math.random() * 1e10)),
    mapName: parsed.mapName || 'Fantasy World',
    pointCount: clamp(parsed.pointCount || 6000, 2000, 20000),
    landRatio: clamp(parsed.landRatio || 0.45, 0.15, 0.8),
    plateCount,
    stateCount,
    burgDensity: clamp(parsed.burgDensity || 0.5, 0.1, 1.5),
    temperatureShift: clamp(parsed.temperatureShift || 0, -20, 20),
    precipitationFactor: clamp(parsed.precipitationFactor || 1.0, 0.2, 3.0),
    plateSpeedFactor: clamp(parsed.plateSpeedFactor || 1, 0.1, 3.0),
    generateProvinces: parsed.generateProvinces !== false,
    generateRoads: parsed.generateRoads !== false,
  }

  if (parsed.namingStyle && VALID_NAMING.includes(parsed.namingStyle)) {
    config.namingStyle = parsed.namingStyle
  }
  if (parsed.heightmapTemplate && VALID_HEIGHTMAP_TEMPLATES.includes(parsed.heightmapTemplate)) {
    config.heightmapTemplate = parsed.heightmapTemplate
  }
  if (parsed.stylePreset && VALID_STYLE_PRESETS.includes(parsed.stylePreset)) {
    config.stylePreset = parsed.stylePreset
  }
  if (parsed.layers && typeof parsed.layers === 'object' && !Array.isArray(parsed.layers)) {
    const layers = Object.fromEntries(
      Object.entries(parsed.layers)
        .filter(([key, value]) => VALID_LAYER_KEYS.includes(key) && typeof value === 'boolean')
    )
    if (Object.keys(layers).length > 0) config.layers = layers
  }

  if (Array.isArray(parsed.stateNames) && parsed.stateNames.length > 0) {
    config.stateNames = cleanNameList(parsed.stateNames)
    if (config.stateNames.length < stateCount) {
      warnings.push(`stateNames will be auto-filled for missing entries (${config.stateNames.length}/${stateCount})`)
    }
  }
  if (Array.isArray(parsed.burgNames) && parsed.burgNames.length > 0) {
    config.burgNames = cleanNameList(parsed.burgNames)
    if (config.burgNames.length < stateCount * 2) {
      warnings.push(`burgNames may be auto-filled for missing entries (${config.burgNames.length}/${stateCount * 2})`)
    }
  }
  if (Array.isArray(parsed.riverNames) && parsed.riverNames.length > 0) {
    config.riverNames = cleanNameList(parsed.riverNames)
  }
  if (Array.isArray(parsed.biomeOverrides)) {
    const biomeOverrides = parsed.biomeOverrides
      .filter(override => override && typeof override === 'object' && VALID_BIOME_IDS.includes(override.id))
      .map(override => {
        const next = { id: Number(override.id) }
        if (typeof override.color === 'string') next.color = override.color
        if (Number.isFinite(override.habitability)) next.habitability = override.habitability
        if (Number.isFinite(override.moveCost)) next.moveCost = override.moveCost
        return next
      })
    if (biomeOverrides.length > 0) config.biomeOverrides = biomeOverrides
  }

  if (parsed.realism && typeof parsed.realism === 'object') {
    const r = parsed.realism
    const realism = {}

    if (r.tectonics && typeof r.tectonics === 'object') {
      const t = r.tectonics
      realism.tectonics = {}
      if (Number.isFinite(t.rangeWidth)) realism.tectonics.rangeWidth = clamp(t.rangeWidth, 1, 8)
      if (Number.isFinite(t.riftDepth)) realism.tectonics.riftDepth = clamp(t.riftDepth, 5, 60)
      if (Object.keys(realism.tectonics).length === 0) delete realism.tectonics
    }

    if (r.rivers && typeof r.rivers === 'object') {
      const rv = r.rivers
      realism.rivers = {}
      if (['straight', 'meandering', 'deltaic'].includes(rv.style)) realism.rivers.style = rv.style
      if (Number.isFinite(rv.meanderAmplitude)) realism.rivers.meanderAmplitude = clamp(rv.meanderAmplitude, 0, 5)
      if (Object.keys(realism.rivers).length === 0) delete realism.rivers
    }

    if (r.coast && typeof r.coast === 'object') {
      const c = r.coast
      realism.coast = {}
      if (Number.isFinite(c.noiseScale)) realism.coast.noiseScale = clamp(c.noiseScale, 0.001, 0.1)
      if (Number.isFinite(c.noiseAmplitude)) realism.coast.noiseAmplitude = clamp(c.noiseAmplitude, 0, 30)
      if (Object.keys(realism.coast).length === 0) delete realism.coast
    }

    if (Object.keys(realism).length > 0) {
      config.realism = realism
    }
  }

  if (parsed.constraints && typeof parsed.constraints === 'object') {
    config.constraints = {}
    if (Array.isArray(parsed.constraints.mountains)) {
      config.constraints.mountains = parsed.constraints.mountains
        .filter(m => m && typeof m.name === 'string' && Array.isArray(m.cells))
        .map(m => ({
          name: String(m.name),
          cells: m.cells.filter(c => Number.isInteger(c) && c >= 0).map(Number),
          type: ['range', 'volcano', 'ridge'].includes(m.type) ? m.type : 'range',
        }))
    }
    if (Array.isArray(parsed.constraints.stateSeeds)) {
      config.constraints.stateSeeds = parsed.constraints.stateSeeds
        .filter(s => s && typeof s.name === 'string')
        .map(s => ({
          name: String(s.name),
          centerCell: Number(s.centerCell) || 0,
          radius: Number(s.radius) || 0,
          color: typeof s.color === 'string' ? s.color : undefined,
        }))
    }
    if (Array.isArray(parsed.constraints.locations)) {
      config.constraints.locations = parsed.constraints.locations
        .filter(location => location && typeof location.name === 'string' && Number.isFinite(Number(location.x)) && Number.isFinite(Number(location.y)))
        .map(location => ({
          id: String(location.id || `ai-location:${location.name}`),
          name: String(location.name),
          aliases: Array.isArray(location.aliases) ? location.aliases.map(String).slice(0, 12) : [],
          kind: ['burg', 'site', 'region', 'state'].includes(location.kind) ? location.kind : 'site',
          x: Number(location.x),
          y: Number(location.y),
          hard: Array.isArray(location.hard) ? location.hard.map(String).slice(0, 4) : ['land'],
          relationRefs: Array.isArray(location.relationRefs)
            ? location.relationRefs.map(reference => ({
                id: reference?.id ? String(reference.id) : undefined,
                name: String(reference?.name || ''),
                relation: ['parent', 'state', 'same-state', 'different-state', 'adjacent', 'river', 'route'].includes(reference?.relation)
                  ? reference.relation
                  : undefined,
              })).filter(reference => reference.name)
            : [],
        }))
    }
    if (Array.isArray(parsed.constraints.rivers)) {
      config.constraints.rivers = parsed.constraints.rivers
        .filter(river => river && typeof river.name === 'string')
        .map(river => ({
          name: String(river.name),
          sourceCell: Number.isInteger(Number(river.sourceCell)) ? Number(river.sourceCell) : 0,
          sourceX: Number.isFinite(Number(river.sourceX)) ? Number(river.sourceX) : undefined,
          sourceY: Number.isFinite(Number(river.sourceY)) ? Number(river.sourceY) : undefined,
          mouthHint: typeof river.mouthHint === 'string' ? river.mouthHint.slice(0, 160) : undefined,
        }))
    }
    if (Array.isArray(parsed.constraints.routes)) {
      config.constraints.routes = parsed.constraints.routes
        .filter(route => route && typeof route.name === 'string')
        .map(route => ({
          name: String(route.name),
          from: typeof route.from === 'string' ? route.from : undefined,
          to: typeof route.to === 'string' ? route.to : undefined,
          sourceX: Number.isFinite(Number(route.sourceX)) ? Number(route.sourceX) : undefined,
          sourceY: Number.isFinite(Number(route.sourceY)) ? Number(route.sourceY) : undefined,
        }))
    }
    if (Object.keys(config.constraints).length === 0) delete config.constraints
  }

  return { ok: true, config, warnings }
}

export function getGenerationTimingHint() {
  try {
    const store = useGeographyStore()
    const meta = store?.lastGenerationMeta || (typeof window !== 'undefined' ? window.__VORONOI_LAST_GENERATION_META__ : null)
    if (!meta || !Array.isArray(meta.timings)) return ''
    const detail = meta.timings.map(t => `${t.stage} ${t.durationMs}ms`).join(' / ')
    return `【上次生成耗时】 totalMs=${meta.totalMs}${detail ? ` (${detail})` : ''}`
  } catch {
    if (typeof window === 'undefined') return ''
    const meta = window.__VORONOI_LAST_GENERATION_META__
    if (!meta || !Array.isArray(meta.timings)) return ''
    const detail = meta.timings.map(t => `${t.stage} ${t.durationMs}ms`).join(' / ')
    return `【上次生成耗时】 totalMs=${meta.totalMs}${detail ? ` (${detail})` : ''}`
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v)))
}

export function mergeNameSeeds(primary = [], secondary = [], limit = Infinity) {
  return cleanNameList([...(primary || []), ...(secondary || [])], limit)
}

function cleanNameList(values, limit = Infinity) {
  if (!Array.isArray(values)) return []
  const result = []
  const seen = new Set()
  for (const value of values) {
    const name = String(value || '').trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('zh-Hans-CN')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
    if (result.length >= limit) break
  }
  return result
}
