import { describe, expect, it } from 'vitest'
import {
  createEmptyStructuredSettings,
  getSettingField,
  normalizeStructuredSettings,
  summarizeStructuredSettings
} from '../services/settingPanelSchema'

describe('settingPanelSchema', () => {
  it('creates every expected setting section and field', () => {
    const settings = createEmptyStructuredSettings()

    expect(Object.keys(settings)).toEqual(['world', 'story', 'characters', 'creativeRules'])
    expect(settings.world.origin).toBe('')
    expect(settings.story.logline).toBe('')
    expect(settings.characters.relationshipSummary).toBe('')
    expect(settings.creativeRules.consistency).toBe('')
  })

  it('normalizes partial legacy data without losing known values', () => {
    const settings = normalizeStructuredSettings({
      world: { origin: '雾潮来自旧神遗骸。' },
      story: { theme: '记忆与代价' },
      unknown: { value: 'ignored' }
    })

    expect(settings.world.origin).toBe('雾潮来自旧神遗骸。')
    expect(settings.story.theme).toBe('记忆与代价')
    expect(settings.world.powerSystem).toBe('')
    expect(settings.unknown).toBeUndefined()
  })

  it('returns field metadata by section and field key', () => {
    const field = getSettingField('world', 'powerSystem')

    expect(field.label).toBe('力量体系')
    expect(field.entryType).toBe('lore')
    expect(field.defaultGroup).toBe('世界观')
  })

  it('summarizes filled fields for generation context', () => {
    const settings = normalizeStructuredSettings({
      world: { origin: '世界从沉没月亮中诞生。', geography: '大陆被内海分为三块。' },
      story: { logline: '失忆书记官追查会吞噬姓名的雾。' }
    })

    expect(summarizeStructuredSettings(settings, { exclude: { sectionKey: 'world', fieldKey: 'origin' } }))
      .toContain('地理环境：大陆被内海分为三块。')
    expect(summarizeStructuredSettings(settings, { exclude: { sectionKey: 'world', fieldKey: 'origin' } }))
      .not.toContain('世界起源：世界从沉没月亮中诞生。')
  })
})
