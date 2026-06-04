/**
 * Voronoi 地图 AI 适配器
 * AI 分析世界观设定 → 生成 MapGenConfig 参数（板块数 + 命名风格） → 引擎生成地图
 */

import { VALID_NAMING } from '../../config/geography-types'

/**
 * 构建 AI prompt，让 AI 根据世界观描述输出 MapGenConfig
 * @param {object|null} worldview - 结构化世界观设定
 * @param {string} overview - 地理总述
 * @param {Array} locations - 地点列表
 * @returns {Array} ChatMessage[]
 */
export function buildVoronoiMapPrompt(worldview, overview, locations) {
  const contextParts = []

  if (worldview?.worldStructure) contextParts.push(`【世界结构】${worldview.worldStructure}`)
  if (worldview?.worldDimensions) contextParts.push(`【世界尺寸】${worldview.worldDimensions}`)
  if (worldview?.continentLayout) contextParts.push(`【大陆分布】${worldview.continentLayout}`)
  if (worldview?.mountainsRivers) contextParts.push(`【山川河流】${worldview.mountainsRivers}`)
  if (worldview?.climateByRegion) contextParts.push(`【气候分区】${worldview.climateByRegion}`)
  if (worldview?.factionLayout) contextParts.push(`【势力分布】${worldview.factionLayout}`)
  if (worldview?.races) contextParts.push(`【种族设定】${worldview.races}`)
  if (worldview?.politicsEconomyCulture) contextParts.push(`【政治经济文化】${worldview.politicsEconomyCulture}`)
  if (overview) contextParts.push(`【地理总述】${overview}`)

  const locationList = locations.length > 0
    ? locations.map(l => `- ${l.name}（${l.type}）：${l.description || '无描述'}`).join('\n')
    : ''

  const worldContext = contextParts.length > 0
    ? contextParts.join('\n')
    : '（用户未填写世界观描述，请生成一个中文古风奇幻世界）'

  const systemPrompt = `你是一位奇幻世界地图参数设计师。你需要根据用户的世界观文字描述，输出一组地图生成引擎的配置参数（JSON），引擎会用 Voronoi 细分 + 板块构造算法自动生成完整的地形、河流、生态群落和城市。

**你的任务**：
分析用户的世界设定文字，将其转化为以下参数。你不需要指定具体的坐标或多边形——引擎会自动生成地形。你只需要控制宏观参数和命名。

**严格要求**：
1. 返回**纯 JSON**，不要用 markdown 包裹，不要添加解释文字
2. JSON 必须能被 JSON.parse() 直接解析

**参数说明**：
{
  "seed": "随机种子字符串",
  "mapName": "世界名称",
  "pointCount": 10000,
  "landRatio": 0.45,
  "plateCount": 6,
  "stateCount": 8,
  "burgDensity": 0.5,
  "temperatureShift": 0,
  "precipitationFactor": 1.0,

  // 板块数（azgaar 风格管线）：控制大陆破碎程度
  // 范围 2-12，默认 6
  // 2-3: 1 块超级大陆（盘古）
  // 4-6: 多大陆（推荐）
  // 7-12: 群岛 / 碎裂大陆
  "plateCount": 6,

  "namingStyle": "chinese",
  // 命名风格，从以下选一个：
  // "chinese"     — 中文古风（修仙/武侠/东方奇幻）
  // "japanese"    — 日式和风（和风/忍者/阴阳师）
  // "european"    — 欧洲中世纪（骑士/城堡/剑与魔法）
  // "arabic"      — 阿拉伯/沙漠（一千零一夜风格）
  // "highFantasy" — 高魔奇幻（精灵/矮人/龙）
  // "darkFantasy" — 暗黑奇幻（末世/亡灵/恐怖）

  "stateNames": ["国家1", "国家2", ...],
  "burgNames":  ["首都1", "首都2", ..., "城镇1", "城镇2", ...],
  "riverNames": ["河流1", "河流2", ...],

  "realism": {
    "tectonics": { "rangeWidth": 3 },
    "rivers":    { "style": "meandering" },
    "coast":     { "noiseAmplitude": 6 }
  },
  // 现实化参数（可选，未传则用默认值）。所有子字段都可选：
  //   tectonics.rangeWidth  山带宽度 1-8（默认 3）
  //   tectonics.riftDepth   裂谷深度 5-60（默认 25）
  //   rivers.style          "straight" | "meandering" | "deltaic"（默认 meandering）
  //   rivers.meanderAmplitude 河流弯曲幅度 0-5
  //   coast.noiseScale      海岸噪声尺度（默认 0.012）
  //   coast.noiseAmplitude  海岸噪声幅度（默认 6）

  "constraints": {
    // 世界书强约束（可选）。不写就引擎随机。
    "mountains": [
      {"name": "北境之脊", "cells": [], "type": "range"}
      // cells 留空数组，引擎会自动算位置
      // type: "range"（山脉带）| "volcano"（火山）| "ridge"（洋中脊）
    ],
    "stateSeeds": [
      {"name": "玄羽国", "centerCell": 0, "radius": 0, "color": "#4e79a7"}
      // centerCell/radius 留 0，引擎根据国家名匹配并自动选 cell
    ]
  }
}

**设计指导**：
- 根据世界观选 plateCount：单一大陆 → 2-3；多大陆 → 4-6；群岛/破碎 → 7-12
- 根据世界观文化氛围选择 namingStyle：中式修仙/武侠 → chinese；和风 → japanese；西方奇幻 → european 或 highFantasy
- 如果世界观提到"北方寒冷"，设 temperatureShift 为负值
- 如果世界观提到"干旱沙漠"，设 precipitationFactor < 0.6
- 如果提到"群岛"，设 landRatio=0.25-0.35 + plateCount=8-12
- 国家名和城市名必须完全匹配所选的 namingStyle 风格
- 如果用户已设定地点名/势力名，优先使用它们，补充的名字风格一致
- burgNames 的前 stateCount 个会作为首都名，之后的作为普通城镇名
- burgNames 长度至少为 stateCount 的 2-3 倍
- **注意**：stateNames/burgNames/riverNames 中的每个名字都必须符合 namingStyle 风格`

  const userPrompt = `请根据以下世界观描述，设计地图生成参数 JSON：

${worldContext}
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
 * @returns {object} MapGenConfig
 */
export function parseVoronoiMapConfig(raw) {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned)

  // plateCount：优先 plateCount 字段，fallback 到 continentCount alias
  const plateCount = clamp(
    parsed.plateCount ?? parsed.continentCount ?? 6,
    2, 12,
  )

  const config = {
    width: 1200,
    height: 800,
    seed: String(parsed.seed || Math.floor(Math.random() * 1e10)),
    mapName: parsed.mapName || 'Fantasy World',
    pointCount: clamp(parsed.pointCount || 10000, 5000, 20000),
    landRatio: clamp(parsed.landRatio || 0.45, 0.15, 0.8),
    plateCount,
    stateCount: clamp(parsed.stateCount || 8, 2, 15),
    burgDensity: clamp(parsed.burgDensity || 0.5, 0.1, 1.5),
    temperatureShift: clamp(parsed.temperatureShift || 0, -20, 20),
    precipitationFactor: clamp(parsed.precipitationFactor || 1.0, 0.2, 3.0),
  }

  if (parsed.namingStyle && VALID_NAMING.includes(parsed.namingStyle)) {
    config.namingStyle = parsed.namingStyle
  }

  if (Array.isArray(parsed.stateNames) && parsed.stateNames.length > 0) {
    config.stateNames = parsed.stateNames.map(String)
  }
  if (Array.isArray(parsed.burgNames) && parsed.burgNames.length > 0) {
    config.burgNames = parsed.burgNames.map(String)
  }
  if (Array.isArray(parsed.riverNames) && parsed.riverNames.length > 0) {
    config.riverNames = parsed.riverNames.map(String)
  }

  // 解析 realism：白名单过滤；旧 level 字段被静默忽略（向后兼容）
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

  // 解析 constraints（仅做白名单过滤）
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
  }

  return config
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
