import { describe, expect, it } from 'vitest'
import {
  STRUCTURED_GENERATION_SCHEMA_IDS,
  getStructuredSettingSchema,
  normalizeStructuredDraftPayload,
  validateStructuredGenerationRequest
} from '../../shared/structuredSettingContract.js'
import {
  getStructuredPlaceFleshOutSchema,
  normalizeStructuredPlaceFleshOutPayload
} from '../../shared/structuredPlaceGenerationContract.js'

const worldGeography = { sectionKey: 'world', fieldKeys: ['geography'] }

describe('setting-place.v1 (per-place flesh-out contract)', () => {
  it('registers the schemaId and exposes a single-place schema without evidence', () => {
    expect(STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT).toBe('setting-place.v1')
    const schema = getStructuredPlaceFleshOutSchema()
    expect(schema.properties.places.minItems).toBe(1)
    expect(schema.properties.places.maxItems).toBe(1)
    const props = schema.properties.places.items.properties
    expect(props).not.toHaveProperty('evidence')
    expect(props).not.toHaveProperty('parentRef')
    expect(props).not.toHaveProperty('factionRef')
    expect(props).toHaveProperty('keywords')
    expect(props.description.maxLength).toBe(600)
    const relationProp = props.relations.items.properties
    expect(relationProp.type.enum).toEqual(['adjacent', 'river', 'route'])
  })

  it('resolves the flesh-out schema for world.geography via the setting schema gateway', () => {
    const result = getStructuredSettingSchema('setting-place.v1', worldGeography)
    expect(result.valid).toBe(true)
    expect(result.schema.properties.places.maxItems).toBe(1)
  })

  it('rejects non-world or non-geography targets', () => {
    expect(getStructuredSettingSchema('setting-place.v1', { sectionKey: 'story', fieldKeys: ['logline'] }).valid).toBe(false)
    expect(getStructuredSettingSchema('setting-place.v1', { sectionKey: 'world', fieldKeys: ['history'] }).valid).toBe(false)
  })

  it('normalizes a valid single place without evidence', () => {
    const normalized = normalizeStructuredPlaceFleshOutPayload({
      places: [{
        name: '幽冥城',
        kind: 'fortress',
        scale: 'regional',
        aliases: ['冥城'],
        parentRef: '北境',
        factionRef: '守夜人',
        terrainHints: ['山地', '寒带'],
        keywords: ['要塞', '边境'],
        description: '一座建于山隘的黑色要塞。',
        relations: [{ type: 'adjacent', targetName: '北境长城' }]
      }]
    })
    expect(normalized.valid).toBe(true)
    expect(normalized.places).toHaveLength(1)
    const place = normalized.places[0]
    expect(place.name).toBe('幽冥城')
    expect(place.description).toContain('黑色要塞')
    expect(place.keywords).toContain('边境')
    // parentRef and factionRef supplied in input are stripped to shape-preserving zeros
    expect(place.parentRef).toEqual({ targetId: '', targetName: '', status: 'invalid' })
    expect(place.factionRef).toEqual({ targetId: '', targetName: '', status: 'invalid' })
    expect(place.relations[0].type).toBe('adjacent')
  })

  it('rejects a place missing name or description', () => {
    expect(normalizeStructuredPlaceFleshOutPayload({ places: [{ name: '幽冥城', kind: 'fortress', scale: 'regional', description: '' }] }).valid).toBe(false)
    expect(normalizeStructuredPlaceFleshOutPayload({ places: [{ name: '', kind: 'fortress', scale: 'regional', description: 'desc' }] }).valid).toBe(false)
  })

  it('defaults an unknown kind to site instead of rejecting', () => {
    const result = normalizeStructuredPlaceFleshOutPayload({ places: [{ name: '幽冥城', kind: 'planet', scale: 'regional', description: 'desc' }] })
    expect(result.valid).toBe(true)
    expect(result.places[0].kind).toBe('site')
  })

  it('maps a Chinese kind label to the enum value', () => {
    const result = normalizeStructuredPlaceFleshOutPayload({ places: [{ name: '幽冥城', kind: '要塞', scale: 'regional', description: 'desc' }] })
    expect(result.valid).toBe(true)
    expect(result.places[0].kind).toBe('fortress')
  })

  it('accepts a bare place object without a places wrapper', () => {
    const result = normalizeStructuredPlaceFleshOutPayload({ name: '幽冥城', kind: 'fortress', scale: 'regional', description: 'desc' })
    expect(result.valid).toBe(true)
    expect(result.places[0].name).toBe('幽冥城')
  })

  it('accepts a bare array of one place', () => {
    const result = normalizeStructuredPlaceFleshOutPayload([{ name: '幽冥城', kind: 'fortress', scale: 'regional', description: 'desc' }])
    expect(result.valid).toBe(true)
    expect(result.places[0].name).toBe('幽冥城')
  })

  it('rejects an empty places array', () => {
    const result = normalizeStructuredPlaceFleshOutPayload({ places: [] })
    expect(result.valid).toBe(false)
  })

  it('filters relation types not in the flesh-out enum', () => {
    const result = normalizeStructuredPlaceFleshOutPayload({
      places: [{
        name: '幽冥城',
        kind: 'fortress',
        scale: 'regional',
        description: 'desc',
        relations: [
          { type: 'adjacent', targetName: 'A' },
          { type: 'parent', targetName: 'B' },
          { type: 'river', targetName: 'C' },
          { type: 'state', targetName: 'D' }
        ]
      }]
    })
    expect(result.valid).toBe(true)
    const types = result.places[0].relations.map((r) => r.type)
    expect(types).toEqual(['adjacent', 'river'])
  })

  it('dispatches through normalizeStructuredDraftPayload by schemaId', () => {
    const result = normalizeStructuredDraftPayload(
      { places: [{ name: '幽冥城', kind: 'fortress', scale: 'regional', aliases: [], parentRef: '', factionRef: '', terrainHints: [], keywords: ['边境'], description: 'desc', relations: [] }] },
      worldGeography,
      'setting-place.v1'
    )
    expect(result.valid).toBe(true)
    expect(result.drafts.places).toHaveLength(1)
    expect(result.drafts.places[0].name).toBe('幽冥城')
  })

  it('accepts a well-formed flesh-out request envelope', () => {
    const result = validateStructuredGenerationRequest({
      schemaVersion: 1,
      schemaId: 'setting-place.v1',
      requestId: 'r1',
      provider: {},
      target: { worldbookId: 'w', worldbookRevision: '1', sectionKey: 'world', fieldKeys: ['geography'] },
      context: { userBrief: '名称：幽冥城' },
      options: { maxTokens: 1000, temperature: 0.2, timeoutMs: 60000 }
    })
    expect(result.valid).toBe(true)
    expect(result.request.schemaId).toBe('setting-place.v1')
  })

  it('still rejects an unknown schemaId', () => {
    const result = validateStructuredGenerationRequest({
      schemaId: 'setting-place.v9',
      target: { sectionKey: 'world', fieldKeys: ['geography'] }
    })
    expect(result.valid).toBe(false)
  })
})
