import { describe, expect, it } from 'vitest'
import { buildSettingPlaceFleshOutRequest } from '../services/settingPlaceGeneration.js'

const baseWorldbook = (overrides = {}) => ({
  id: 'w',
  updatedAt: '1',
  worldDescription: '世界背景',
  forbidden: '禁止出现仙侠',
  structuredSettings: { world: { geography: '地理概述原文' } },
  ...overrides
})

const baseSeed = (overrides = {}) => ({
  name: '幽冥城',
  kind: 'fortress',
  scale: 'regional',
  ...overrides
})

describe('buildSettingPlaceFleshOutRequest', () => {
  it('emits a structured key=value seed with description_meta sibling when description exceeds 1500 chars', () => {
    const longDesc = 'X'.repeat(1501)
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: { ...baseSeed(), description: longDesc }
    })
    expect(req.context.seed).toContain('name = "幽冥城"')
    expect(req.context.seed).toContain('description = "')
    const descLine = req.context.seed.split('\n').find((line) => line.startsWith('description = "'))
    expect(descLine.endsWith('"')).toBe(true)
    const metaLine = req.context.seed.split('\n').find((line) => line.startsWith('description_meta = '))
    expect(metaLine).toBeDefined()
    expect(metaLine).toContain('truncated: kept first 1500 chars')
  })

  it('keeps the full user description verbatim when under 1500 chars (no meta marker)', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: { ...baseSeed(), description: '短描述原文' }
    })
    expect(req.context.seed).toContain('description = "短描述原文"')
    expect(req.context.seed).not.toContain('description_meta')
  })

  it('keeps forbidden inside globalConstraints even when worldDescription is near the 核心前提 cap', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook({
        worldDescription: 'W'.repeat(795),
        forbidden: 'FORBIDDEN_RULE_X'
      }),
      seed: baseSeed()
    })
    expect(req.context.globalConstraints).toContain('FORBIDDEN_RULE_X')
    expect(req.context.globalConstraints).toContain('核心前提')
    expect(req.context.globalConstraints).toContain('禁止内容')
  })

  it('caps sourceExcerpts at 800 chars', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook({
        structuredSettings: { world: { geography: 'G'.repeat(1500) } }
      }),
      seed: baseSeed()
    })
    expect(req.context.sourceExcerpts.length).toBeLessThanOrEqual(800)
  })

  it('caps userBrief at 300 chars', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: baseSeed(),
      userBrief: 'U'.repeat(500)
    })
    expect(req.context.userBrief.length).toBeLessThanOrEqual(300)
  })

  it('wires user-seeded relations into the seed as a JSON line, capped at 8', () => {
    const relations = Array.from({ length: 12 }, (_, index) => ({ type: 'adjacent', targetName: `T${index}` }))
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: { ...baseSeed(), relations },
      userBrief: ''
    })
    const relLine = req.context.seed.split('\n').find((line) => line.startsWith('relations = '))
    expect(relLine).toBeDefined()
    const parsed = JSON.parse(relLine.replace('relations = ', ''))
    expect(parsed).toHaveLength(8)
    expect(parsed[0].targetName).toBe('T0')
    expect(parsed[7].targetName).toBe('T7')
  })

  it('drops relations with empty targetName and emits parentText/factionText meta when the user has typed them', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: {
        ...baseSeed(),
        parentText: '北境',
        factionText: '',
        relations: [
          { type: 'adjacent', targetName: 'A' },
          { type: 'adjacent', targetName: '' },
          { type: 'adjacent', targetName: '   ' }
        ]
      }
    })
    expect(req.context.seed).toContain('parentText_factionText_meta')
    const relLine = req.context.seed.split('\n').find((line) => line.startsWith('relations = '))
    const parsed = JSON.parse(relLine.replace('relations = ', ''))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].targetName).toBe('A')
  })

  it('does not emit relations line when user has none (and no parentText/factionText meta)', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: { ...baseSeed() }
    })
    expect(req.context.seed).not.toContain('relations =')
    expect(req.context.seed).not.toContain('parentText_factionText_meta')
  })

  it('accepts excludeEntryId and excludeName without breaking the request', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: baseSeed(),
      excludeEntryId: 'e1',
      excludeName: '幽冥城'
    })
    expect(req.schemaId).toBe('setting-place.v1')
    expect(req.context.seed).toContain('name = "幽冥城"')
  })

  it('does not include the empty currentValues and relatedEntries slots', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook(),
      seed: baseSeed()
    })
    expect(req.context).not.toHaveProperty('relatedEntries')
  })

  it('emits context.mode="expand" by default and caps sourceExcerpts at 800', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook({ structuredSettings: { world: { geography: 'G'.repeat(2500) } } }),
      seed: baseSeed()
    })
    expect(req.context.mode).toBe('expand')
    expect(req.context.sourceExcerpts.length).toBe(800)
  })

  it('emits context.mode="create" and raises sourceExcerpts cap to 2000 in create mode', () => {
    const req = buildSettingPlaceFleshOutRequest({
      worldbook: baseWorldbook({ structuredSettings: { world: { geography: 'G'.repeat(2500) } } }),
      seed: { name: '幽冥城' },
      mode: 'create'
    })
    expect(req.context.mode).toBe('create')
    expect(req.context.sourceExcerpts.length).toBe(2000)
    // name-only seed for create mode (no default kind/scale laundering)
    expect(req.context.seed).toContain('name = "幽冥城"')
    expect(req.context.seed).not.toContain('kind =')
    expect(req.context.seed).not.toContain('scale =')
  })
})