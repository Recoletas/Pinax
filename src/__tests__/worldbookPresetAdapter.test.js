import { describe, expect, it } from 'vitest'
import xianxiaWorld from '../../server/data/worlds/仙侠世界/world.json'
import fantasyWorld from '../../server/data/worlds/奇幻大陆/world.json'
import apocalypseWorld from '../../server/data/worlds/末日生存/world.json'
import scifiWorld from '../../server/data/worlds/科幻星际/world.json'
import urbanWorld from '../../server/data/worlds/都市生活/world.json'
import {
  adaptRpgWorldToWorldbookPayload,
  summarizeRpgWorldShape
} from '../services/worldbookPresetAdapter'
import { rpgWorldbookPresets } from '../services/rpgWorldbookPresets'

const fixtures = [
  ['仙侠世界', xianxiaWorld],
  ['奇幻大陆', fantasyWorld],
  ['末日生存', apocalypseWorld],
  ['科幻星际', scifiWorld],
  ['都市生活', urbanWorld]
]

describe('worldbookPresetAdapter', () => {
  it('adapts all server RPG worlds into importable worldbook payloads', () => {
    for (const [name, world] of fixtures) {
      const payload = adaptRpgWorldToWorldbookPayload(world, { id: `test-${name}` })
      const shape = summarizeRpgWorldShape(world)

      expect(payload.name).toBe(name)
      expect(payload.sourceKind).toBe('rpg-world-json')
      expect(payload.sourceLabel).toBe('RPG 预设适配')
      expect(payload.worldDescription).toContain(world.config.defaultLocation)
      expect(payload.openingHook.length).toBeGreaterThan(8)
      expect(payload.creativeExits.length).toBe(3)
      expect(payload.groups).toContain('硬约束')
      expect(payload.groups).toContain('地理')
      expect(payload.groups).toContain('角色')
      expect(payload.groups).toContain('事件')
      expect(payload.groups).toContain('任务')
      expect(payload.entries.length).toBeGreaterThanOrEqual(
        4 + shape.locations + shape.npcs + shape.items + shape.randomEncounters
      )
      expect(payload.entries.some(entry => entry.type === 'rule' && entry.mode === 'constant')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'style' && entry.mode === 'constant')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'forbidden' && entry.mode === 'constant')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'location')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'character')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'item')).toBe(true)
      expect(payload.entries.some(entry => entry.type === 'event')).toBe(shape.randomEncounters > 0 || shape.locations > 0)
      expect(payload.entries.some(entry => entry.type === 'quest')).toBe(true)
    }
  })

  it('exposes five RPG worldbook presets for quick import', () => {
    expect(rpgWorldbookPresets.map(preset => preset.name)).toEqual([
      '仙侠世界',
      '奇幻大陆',
      '末日生存',
      '科幻星际',
      '都市生活'
    ])

    expect(rpgWorldbookPresets.every(preset => preset.sourceWorldShape.locations > 0)).toBe(true)
    expect(rpgWorldbookPresets.every(preset => preset.entries.length > 8)).toBe(true)
  })
})
