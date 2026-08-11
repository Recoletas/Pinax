import { describe, expect, it } from 'vitest'
import { buildMapReplacementReview } from '@/services/world-map/mapVersioning'

// B1 回归测试：remap 匹配逻辑。
// 见 docs/agent-runs/audit-pass2-plan.md 工作单元 B1：
// 名称匹配失败时，加空间邻近回退，避免 confirmed 地点成"幽灵绑定"。

function makeWorldbookEntry(id, name, binding) {
  return {
    id,
    name,
    type: 'location',
    keys: [name],
    aliases: [],
    content: '',
    mapBinding: { status: 'confirmed', ...binding },
  }
}

function makeBurg(i, name, x, y) {
  return { i, name, x, y }
}

const NEXT_MAP = { width: 1000, height: 800, burgs: [], seed: 'next-seed' }

describe('B1 — buildMapReplacementReview 匹配逻辑', () => {
  it('名称精确匹配 + 原位附近 → kept, matchMethod=name', () => {
    const entry = makeWorldbookEntry('e1', '清风镇', { x: 200, y: 300 })
    const nextMap = {
      ...NEXT_MAP,
      burgs: [makeBurg(1, '清风镇', 202, 305)],  // 同名，移动很小
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    expect(item.status).toBe('kept')
    expect(item.matchMethod).toBe('name')
    expect(item.suggested.name).toBe('清风镇')
  })

  it('名称匹配但位置变化大 → moved, matchMethod=name', () => {
    const entry = makeWorldbookEntry('e1', '落霞城', { x: 100, y: 100 })
    const nextMap = {
      ...NEXT_MAP,
      burgs: [makeBurg(1, '落霞城', 800, 700)],  // 同名，但移动了很远
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    expect(item.status).toBe('moved')
    expect(item.matchMethod).toBe('name')
  })

  it('B1 核心：名称匹配失败 + 旧坐标附近有 burg → moved, matchMethod=spatial', () => {
    // 旧地图里叫"旧名"，新地图里这个 burg 改名了（重生成后名字池变化）
    const entry = makeWorldbookEntry('e1', '旧名镇', { x: 250, y: 200 })
    const nextMap = {
      ...NEXT_MAP,
      // 新地图没有"旧名镇"，但在旧坐标 (250,200) 附近有个"新名镇"
      burgs: [
        makeBurg(1, '新名镇', 258, 205),   // 距离旧坐标 ~10px，在 3% 对角线内
        makeBurg(2, '远方城', 900, 700),    // 太远，不应匹配
      ],
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    expect(item.status).toBe('moved')
    expect(item.matchMethod).toBe('spatial')
    expect(item.suggested.name).toBe('新名镇')
    expect(item.reason).toContain('旧坐标附近')
  })

  it('名称失败 + 旧坐标附近无 burg → unmatched（真无匹配）', () => {
    const entry = makeWorldbookEntry('e1', '消失镇', { x: 250, y: 200 })
    const nextMap = {
      ...NEXT_MAP,
      // 附近没有任何 burg（全在远处）
      burgs: [makeBurg(1, '远方城', 900, 700)],
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    expect(item.status).toBe('unmatched')
    expect(item.matchMethod).toBe(null)
    expect(item.suggested).toBe(null)
  })

  it('别名匹配也算 name 方法', () => {
    const entry = makeWorldbookEntry('e1', '王城', { x: 500, y: 400 })
    entry.aliases = ['帝都', '京城']
    const nextMap = {
      ...NEXT_MAP,
      burgs: [makeBurg(1, '帝都', 502, 403)],  // 匹配别名
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    expect(item.status).toBe('kept')
    expect(item.matchMethod).toBe('name')
    expect(item.suggested.name).toBe('帝都')
  })

  it('空间回退优先级低于名称：有同名 burg 时不走空间回退', () => {
    const entry = makeWorldbookEntry('e1', '同名镇', { x: 100, y: 100 })
    const nextMap = {
      ...NEXT_MAP,
      burgs: [
        makeBurg(1, '同名镇', 900, 700),     // 同名但很远
        makeBurg(2, '近邻镇', 105, 108),      // 附近但不同名
      ],
    }
    const review = buildMapReplacementReview({ worldbook: { entries: [entry] }, nextMap })
    const item = review.items[0]
    // 名称匹配优先，即使同名 burg 很远；不走空间回退到"近邻镇"
    expect(item.matchMethod).toBe('name')
    expect(item.suggested.name).toBe('同名镇')
    expect(item.status).toBe('moved')  // 同名但移动大
  })
})
