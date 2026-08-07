import { describe, expect, it } from 'vitest'
import {
  normalizePlacePayload,
  getPlacePayloadFromEntry,
  createPlaceEntryPatch
} from '../../shared/placeEntryContract.js'

describe('place aliases vs keywords separation', () => {
  it('does not fold keywords into aliases on reload via the keys index', () => {
    const payload = {
      name: '幽冥城',
      aliases: ['冥城', '黑城'],
      keywords: ['边境', '要塞', '寒带'],
      kind: 'fortress',
      scale: 'regional',
      description: 'desc'
    }
    const entry = createPlaceEntryPatch(payload)
    // keys is a matching index that legitimately includes name + aliases + keywords
    expect(entry.keys).toContain('边境')
    expect(entry.keys).toContain('要塞')
    // reloading through getPlacePayloadFromEntry must NOT leak keys/keywords into aliases
    const reloaded = getPlacePayloadFromEntry(entry)
    expect(reloaded.aliases).toEqual(expect.arrayContaining(['冥城', '黑城']))
    expect(reloaded.aliases).not.toContain('边境')
    expect(reloaded.aliases).not.toContain('要塞')
    expect(reloaded.aliases).not.toContain('寒带')
    expect(reloaded.keywords).toEqual(expect.arrayContaining(['边境', '要塞', '寒带']))
  })

  it('keeps aliases stable across a save -> reload round trip', () => {
    const payload = {
      name: '虹镜湖',
      aliases: ['镜湖'],
      keywords: ['湖泊', '圣地'],
      kind: 'site',
      scale: 'local',
      description: 'd'
    }
    const entry = createPlaceEntryPatch(payload)
    const reloaded = getPlacePayloadFromEntry(entry)
    expect(reloaded.aliases).toEqual(['镜湖'])
    expect([...reloaded.keywords].sort()).toEqual(['圣地', '湖泊'].sort())
  })

  it('normalizePlacePayload reads aliases from the aliases field, not the keys index', () => {
    const out = normalizePlacePayload({
      name: 'X',
      aliases: ['别名A'],
      keys: ['X', '别名A', '关键词Z'],
      keywords: ['关键词Z'],
      kind: 'city',
      scale: 'local',
      description: 'd'
    })
    expect(out.aliases).toEqual(['别名A'])
    expect(out.keywords).toEqual(['关键词Z'])
  })
})
