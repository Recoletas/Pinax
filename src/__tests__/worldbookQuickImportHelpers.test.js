import { describe, expect, it } from 'vitest'
import {
  buildPendingPayload,
  createSeedEntry,
  getFeaturedPressureRow,
  getHookExcerpt,
  normalizeEntryType,
  normalizeGeneratedEntry,
  normalizeKeywords,
  normalizeText,
  uniqueGroups
} from '../services/worldbookQuickImportHelpers'

describe('worldbookQuickImportHelpers — pure normalize helpers', () => {
  it('normalizeText trims whitespace and stringifies non-string values', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText(42)).toBe('42')
  })

  it('normalizeEntryType maps aliases to canonical types and falls back to general', () => {
    expect(normalizeEntryType('ORG')).toBe('organization')
    expect(normalizeEntryType('faction')).toBe('organization')
    expect(normalizeEntryType('SETTING')).toBe('lore')
    expect(normalizeEntryType('rule')).toBe('rule')
    expect(normalizeEntryType('Style')).toBe('style')
    expect(normalizeEntryType('nonsense-type')).toBe('general')
    expect(normalizeEntryType('')).toBe('general')
  })

  it('normalizeKeywords splits on common separators, dedupes and caps at 6 tokens', () => {
    const keywords = normalizeKeywords(['雾港, 红雾禁令', '雾港', '潮汐议会', '钟楼/守夜人', 'ignored'], '雾港')
    expect(keywords.length).toBeLessThanOrEqual(6)
    expect(new Set(keywords).size).toBe(keywords.length)
    expect(keywords).toContain('雾港')
    expect(keywords).toContain('红雾禁令')
  })

  it('uniqueGroups dedupes trimmed group names and preserves first occurrence order', () => {
    const result = uniqueGroups(['硬约束', ' 硬约束 ', '组织', '角色', '组织', ''])
    expect(result).toEqual(['硬约束', '组织', '角色'])
  })
})

describe('worldbookQuickImportHelpers — entry factories', () => {
  it('createSeedEntry builds an entry with id, normalized keys, and injection group', () => {
    const entry = createSeedEntry(
      'location',
      '雾港',
      '雾港',
      '雾港被海雾包围的港口城市。',
      '地理'
    )
    expect(entry.id).toMatch(/^seed_/)
    expect(entry.type).toBe('location')
    expect(entry.keys).toContain('雾港')
    expect(entry.content).toBe('雾港被海雾包围的港口城市。')
    expect(entry.injection.group).toBe('地理')
    expect(entry.injection.mode).toBe('selective')
    expect(entry.injection.probability).toBe(100)
  })

  it('createSeedEntry forces constant mode for constraint types like rule/forbidden/style', () => {
    const rule = createSeedEntry('rule', '一致性规则', '规则', '涉及人物关系、地理事实与历史事件时必须保持一致。', '硬约束', 'selective')
    expect(rule.injection.mode).toBe('constant')

    const forbidden = createSeedEntry('forbidden', '禁写边界', '禁忌', '严禁生成与设定冲突的内容。', '禁写边界')
    expect(forbidden.injection.mode).toBe('constant')

    const style = createSeedEntry('style', '文风基线', '文风', '保持既定叙事视角、语气强度与文风边界。', '文风约束')
    expect(style.injection.mode).toBe('constant')
  })

  it('normalizeGeneratedEntry falls back to type-labeled name when input lacks a name', () => {
    const fallback = normalizeGeneratedEntry({ type: 'location', content: '海港描述', keys: '海港' }, 2)
    expect(fallback.name).toContain('地点')
    expect(fallback.type).toBe('location')
    expect(fallback.injection.group).toBe('地理')
  })
})

describe('worldbookQuickImportHelpers — payload builders', () => {
  it('buildPendingPayload appends 3 constraint entries when none are supplied', () => {
    const payload = buildPendingPayload({
      name: '雾港世界书',
      description: '由小说提炼生成',
      entries: [
        { name: '雾港', type: 'location', keys: ['雾港'], content: '雾港被海雾包围的港口城市。', group: '地理' }
      ]
    })
    expect(payload.name).toBe('雾港世界书')
    expect(payload.entries.length).toBe(4) // 1 user + 3 constraint
    const types = payload.entries.map((entry) => entry.type)
    expect(types).toContain('rule')
    expect(types).toContain('style')
    expect(types).toContain('forbidden')
    expect(payload.entries.find((entry) => entry.type === 'rule').injection.mode).toBe('constant')
  })

  it('buildPendingPayload dedupes incoming groups and entries-derived groups', () => {
    const payload = buildPendingPayload({
      name: '测试世界书',
      entries: [
        { name: '角色 A', type: 'character', keys: ['角色A'], content: '角色 A 的详细背景与动机说明，足够长以避免占位填充。', group: '角色' },
        { name: '角色 B', type: 'character', keys: ['角色B'], content: '角色 B 的详细背景与动机说明，足够长以避免占位填充。', group: '角色' }
      ],
      groups: ['角色', '组织', '角色']
    })
    // Incoming '角色' is deduped, and constraint entries add their own groups
    // (硬约束/文风约束/禁写边界). The user-supplied '组织' plus all derived
    // groups must be present without duplicates.
    expect(payload.groups).toEqual(
      expect.arrayContaining(['角色', '组织', '硬约束', '文风约束', '禁写边界'])
    )
    expect(new Set(payload.groups).size).toBe(payload.groups.length)
  })
})

describe('worldbookQuickImportHelpers — UI derived chips', () => {
  it('getFeaturedPressureRow returns 3 chips (现场/阻力/出口) with derived values', () => {
    const preset = {
      entries: [
        { type: 'location', name: '暮湾钟楼' },
        { type: 'organization', name: '王室' },
        { type: 'organization', name: '行会' }
      ]
    }
    const row = getFeaturedPressureRow(preset)
    expect(row).toHaveLength(3)
    expect(row.map(c => c.key)).toEqual(['scene', 'resistance', 'exit'])
    expect(row.map(c => c.label)).toEqual(['现场', '阻力', '出口'])
    expect(row[0].value).toBe('暮湾钟楼')
    expect(row[1].value).toBe('王室')
    expect(row[2].value).toBe('行会')
  })

  it('getFeaturedPressureRow falls back to 王室/行会/主城 when no entries', () => {
    const row = getFeaturedPressureRow({ entries: [] })
    expect(row.map(c => c.value)).toEqual(['主城', '王室', '行会'])
  })

  it('getHookExcerpt truncates long hooks and appends ellipsis', () => {
    const long = '这是一段非常非常长的开场困境描述，需要被截断以保证 UI 排版的稳定与可读性，否则会撑爆卡片布局。'
    const excerpt = getHookExcerpt({ openingHook: long }, 24)
    expect(excerpt.length).toBeLessThanOrEqual(25)
    expect(excerpt.endsWith('…')).toBe(true)

    const short = '短开场'
    expect(getHookExcerpt({ openingHook: short }, 24)).toBe('短开场')

    expect(getHookExcerpt({})).toBe('')
  })
})