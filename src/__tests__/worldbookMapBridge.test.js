import { describe, expect, it } from 'vitest'
import { extractMapSeedsFromWorldbook } from '../services/ai/worldbookMapBridge'

const makeWorldbook = (entries) => ({ id: 'wb1', name: '测试', entries })

const makeEntry = (overrides) => ({
  id: overrides.id || 'e_' + Math.random().toString(36).slice(2, 6),
  name: overrides.name,
  type: overrides.type,
  content: overrides.content || 'default content',
  keys: overrides.keys || [overrides.name],
  injection: overrides.injection || { mode: 'constant' },
})

describe('worldbookMapBridge.extractMapSeedsFromWorldbook', () => {
  it('returns empty object for null / undefined / missing entries', () => {
    expect(extractMapSeedsFromWorldbook(null)).toEqual({
      stateNames: [],
      burgNames: [],
      riverNames: [],
      loreContextBlock: '',
      constraints: {},
    })
    expect(extractMapSeedsFromWorldbook(undefined)).toEqual({
      stateNames: [],
      burgNames: [],
      riverNames: [],
      loreContextBlock: '',
      constraints: {},
    })
    expect(extractMapSeedsFromWorldbook({})).toEqual({
      stateNames: [],
      burgNames: [],
      riverNames: [],
      loreContextBlock: '',
      constraints: {},
    })
    expect(extractMapSeedsFromWorldbook({ entries: [] })).toEqual({
      stateNames: [],
      burgNames: [],
      riverNames: [],
      loreContextBlock: '',
      constraints: {},
    })
    expect(extractMapSeedsFromWorldbook({ entries: 'not-an-array' })).toEqual({
      stateNames: [],
      burgNames: [],
      riverNames: [],
      loreContextBlock: '',
      constraints: {},
    })
  })

  it('buckets map-safe entries by type into correct name pools', () => {
    const worldbook = makeWorldbook([
      makeEntry({ type: 'character',    name: '伊薇队长' }),
      makeEntry({ type: 'organization', name: '白银商会' }),
      makeEntry({ type: 'item',         name: '风蚀罗盘' }),
      makeEntry({ type: 'location',     name: '暮湾主城' }),
      makeEntry({ type: 'location',     name: '钟塔镇' }),
      makeEntry({ type: 'location',     name: '赤练河' }),
      makeEntry({ type: 'event',        name: '钟楼停摆事件' }),
      makeEntry({ type: 'lore',         name: '雾潮契约' }),
      makeEntry({ type: 'rule',         name: '法力上限' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.stateNames).toEqual(expect.arrayContaining(['白银商会']))
    expect(result.burgNames).toEqual(expect.arrayContaining(['暮湾主城', '钟塔镇']))
    expect(result.riverNames).toEqual(expect.arrayContaining(['赤练河']))
    expect(result.stateNames).not.toContain('伊薇队长')
    expect(result.stateNames).not.toContain('风蚀罗盘')
    expect(result.stateNames).not.toContain('暮湾主城')
    expect(result.burgNames).not.toContain('伊薇队长')
    expect(result.riverNames).not.toContain('钟楼停摆事件')
  })

  it('truncates by ENTRY_TYPE_PRIORITY — rule/forbidden/style first', () => {
    const worldbook = makeWorldbook([
      makeEntry({ type: 'general',   name: '低优-general' }),
      makeEntry({ type: 'event',     name: '中优-event' }),
      makeEntry({ type: 'location',  name: '高优-location' }),
      makeEntry({ type: 'rule',      name: '最高-rule' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.loreContextBlock).toContain('最高-rule')
    const lines = result.loreContextBlock.split('\n').filter(l => l.includes('['))
    expect(lines[0]).toContain('rule')
    expect(result.burgNames).toContain('高优-location')
    expect(result.riverNames).not.toContain('中优-event')
  })

  it('includes selective-mode entries (bridge bypasses matchWorldbookEntries)', () => {
    const worldbook = makeWorldbook([
      makeEntry({
        type: 'character',
        name: '林舟',
        injection: { mode: 'selective', probability: 100 },
      }),
      makeEntry({
        type: 'location',
        name: '云隐村',
        injection: { mode: 'selective', probability: 50 },
      }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.stateNames).not.toContain('林舟')
    expect(result.burgNames).toContain('云隐村')
  })

  it('builds loreContextBlock with top 5 entries by priority', () => {
    const worldbook = makeWorldbook([
      makeEntry({ type: 'rule',      name: 'R1', content: 'rule-1' }),
      makeEntry({ type: 'style',     name: 'S1', content: 'style-1' }),
      makeEntry({ type: 'character', name: 'C1', content: 'char-1' }),
      makeEntry({ type: 'location',  name: 'L1', content: 'loc-1' }),
      makeEntry({ type: 'item',      name: 'I1', content: 'item-1' }),
      makeEntry({ type: 'event',     name: 'E1', content: 'event-1' }),
      makeEntry({ type: 'lore',      name: 'K1', content: 'lore-content' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.loreContextBlock).toMatch(/^【世界书关键条目】/)
    const lines = result.loreContextBlock.split('\n').filter(l => l.trim().startsWith('['))
    expect(lines).toHaveLength(5)
    const lineText = lines.join('\n')
    expect(lineText).toContain('R1')
    expect(lineText).toContain('S1')
    expect(lineText).toContain('C1')
    expect(lineText).toContain('L1')
    expect(lineText).toContain('I1')
    expect(lineText).not.toContain('E1')
    expect(lineText).not.toContain('K1')
    expect(lines[0]).toContain('R1')
  })

  it('caps content preview at 50 chars in loreContextBlock', () => {
    const longContent = 'A'.repeat(500)
    const worldbook = makeWorldbook([
      makeEntry({ type: 'rule', name: 'R1', content: longContent }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    const r1Line = result.loreContextBlock.split('\n').find(l => l.includes('R1'))
    expect(r1Line).toBeDefined()
    const previewPart = r1Line.split('R1: ')[1] || ''
    expect(previewPart.length).toBeLessThanOrEqual(50)
    expect(previewPart.length).toBeGreaterThan(0)
  })

  it('uses entry.keys[0] as name fallback when entry.name is missing', () => {
    const worldbook = makeWorldbook([
      { id: 'x1', type: 'location', keys: ['钥匙城'], content: 'c' },
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.burgNames).toContain('钥匙城')
  })

  it('skips entries with no name and no keys', () => {
    const worldbook = makeWorldbook([
      { id: 'x1', type: 'location', content: 'c' },
      { id: 'x2', type: 'location', name: '  ', keys: [], content: 'c' },
      makeEntry({ type: 'location', name: '真实地点' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.burgNames).toEqual(['真实地点'])
  })

  it('defaults missing type to general and excludes from name pools', () => {
    const worldbook = makeWorldbook([
      { id: 'x1', name: '无名条目', content: 'c' },
      makeEntry({ type: 'location', name: '真实地点' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.burgNames).toEqual(['真实地点'])
    expect(result.loreContextBlock).toContain('无名条目')
  })

  it('extracts stateSeeds and mountain constraints from map-relevant entries', () => {
    const worldbook = makeWorldbook([
      makeEntry({ type: 'organization', name: '玄羽国', content: '北境王国，控制边塞。' }),
      makeEntry({ type: 'location', name: '北境之脊', content: '贯穿大陆北部的山脉。' }),
      makeEntry({ type: 'location', name: '赤炉火山', content: '仍在活动的火山。' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.constraints.stateSeeds).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '玄羽国', centerCell: 0, radius: 0 }),
    ]))
    expect(result.constraints.mountains).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '北境之脊', type: 'ridge', cells: [] }),
      expect.objectContaining({ name: '赤炉火山', type: 'volcano', cells: [] }),
    ]))
  })

  it('deduplicates names and normalizes type aliases', () => {
    const worldbook = makeWorldbook([
      makeEntry({ type: 'faction', name: '白银商会' }),
      makeEntry({ type: 'organization', name: '白银商会' }),
      makeEntry({ type: 'LOCATION', name: '云隐村' }),
      makeEntry({ type: 'location', name: '云隐村' }),
    ])
    const result = extractMapSeedsFromWorldbook(worldbook)
    expect(result.stateNames).toEqual(['白银商会'])
    expect(result.burgNames).toEqual(['云隐村'])
  })
})
