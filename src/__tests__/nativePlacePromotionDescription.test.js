import { describe, expect, it } from 'vitest'
import { describeNativePlaceForPromotion, mapNativeKindLabel } from '@/services/ai/worldbookMapBridge'

// B2 回归测试：promoteNativePlace 生成的 content 应包含丰富上下文。
// 见 docs/agent-runs/audit-pass2-plan.md 工作单元 B2：
// 原 promote 只写"X是一处城镇。位于Y。"；现从 place+mapData 提取
// 人口/港口/国家/biome/沿河等信息。

function makePlace(overrides = {}) {
  return {
    name: '清风镇',
    kind: 'town',
    population: 15,
    stateName: '苍澜国',
    port: false,
    cellId: 42,
    ...overrides,
  }
}

function makeMapData(overrides = {}) {
  return {
    cells: {
      biome: { 42: 6 },   // 温带落叶林
      r: { 42: 3 },       // 有河流
      ...overrides.cells,
    },
  }
}

describe('B2 — describeNativePlaceForPromotion', () => {
  it('包含地点名、类型、人口规模、所属国家、biome、沿河', () => {
    const content = describeNativePlaceForPromotion(makePlace(), makeMapData())
    expect(content).toContain('清风镇')
    expect(content).toContain('集镇')        // population 15 → town → 集镇
    expect(content).toContain('苍澜国')      // 所属国家
    expect(content).toContain('温带落叶林')   // biome
    expect(content).toContain('畔河')        // 沿河
  })

  it('首都 kind 描述为"一国之都"', () => {
    const place = makePlace({ kind: 'capital', population: 50 })
    const content = describeNativePlaceForPromotion(place, makeMapData())
    expect(content).toContain('首都')
    expect(content).toContain('一国之都')
    expect(content).toContain('商旅云集')
  })

  it('港口 place 含港口描述', () => {
    const place = makePlace({ port: true, kind: 'port' })
    const content = describeNativePlaceForPromotion(place, makeMapData())
    expect(content).toContain('港口')
    expect(content).toContain('可通航水域')
  })

  it('小村落(pop<8)描述为宁静小村落', () => {
    const place = makePlace({ kind: 'village', population: 3 })
    const content = describeNativePlaceForPromotion(place, makeMapData())
    expect(content).toContain('小村落')
    expect(content).toContain('宁静')
  })

  it('无国家/biome/河流时仍生成基础描述（不报错）', () => {
    const place = makePlace({ stateName: '', cellId: undefined })
    const mapData = { cells: {} }
    const content = describeNativePlaceForPromotion(place, mapData)
    expect(content).toContain('清风镇')
    expect(content).toContain('集镇')
    // 无国家 → 不含"隶属"
    expect(content).not.toContain('隶属')
    // 无 biome/河流 → 不含这些
    expect(content).not.toContain('温带落叶林')
    expect(content).not.toContain('畔河')
  })

  it('空 place 返回空字符串', () => {
    expect(describeNativePlaceForPromotion(null, makeMapData())).toBe('')
    expect(describeNativePlaceForPromotion({}, makeMapData())).toBe('')
  })
})

describe('mapNativeKindLabel', () => {
  it('已知 kind 返回中文标签', () => {
    expect(mapNativeKindLabel('capital')).toBe('首都')
    expect(mapNativeKindLabel('port')).toBe('港口')
    expect(mapNativeKindLabel('city')).toBe('城市')
    expect(mapNativeKindLabel('town')).toBe('城镇')
    expect(mapNativeKindLabel('village')).toBe('村落')
  })

  it('未知 kind 回退到"聚落"', () => {
    expect(mapNativeKindLabel('unknown')).toBe('聚落')
    expect(mapNativeKindLabel(undefined)).toBe('聚落')
  })
})
