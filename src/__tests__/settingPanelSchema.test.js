import { describe, expect, it } from 'vitest'
import {
  CONTROL_TYPE_DELIMITERS,
  CONTROL_TYPE_PARSE_MODE,
  createEmptyStructuredSettings,
  ENTRY_TYPE_TO_CONTROL_TYPE,
  getControlType,
  getFieldMeta,
  getSettingField,
  MAX_LENGTH_BY_CONTROL_TYPE,
  normalizeStructuredSettings,
  parseControlValue,
  serializeControlValue,
  SETTING_SECTIONS,
  summarizeStructuredSettings
} from '../services/settingPanelSchema'

const CHIPS_DELIMS = CONTROL_TYPE_DELIMITERS.chips
const TAGS_DELIMS = CONTROL_TYPE_DELIMITERS.tags
const LIST_DELIMS = CONTROL_TYPE_DELIMITERS.list

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

describe('settingPanelSchema V2: controlType 派发', () => {
  it('每种 entryType 都映射到合法 controlType', () => {
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.lore).toBe('textarea')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.event).toBe('textarea')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.location).toBe('textarea')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.organization).toBe('textarea')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.quest).toBe('textarea')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.character).toBe('chips')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.style).toBe('tags')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.rule).toBe('list')
    expect(ENTRY_TYPE_TO_CONTROL_TYPE.forbidden).toBe('list')
  })

  it('character 字段用 chips，style 字段用 tags，rule/forbidden 字段用 list', () => {
    expect(getFieldMeta('characters', 'protagonists').controlType).toBe('chips')
    expect(getFieldMeta('characters', 'npcs').controlType).toBe('chips')
    expect(getFieldMeta('creativeRules', 'writingStyle').controlType).toBe('tags')
    expect(getFieldMeta('creativeRules', 'tone').controlType).toBe('tags')
    expect(getFieldMeta('world', 'rules').controlType).toBe('list')
    expect(getFieldMeta('creativeRules', 'taboos').controlType).toBe('list')
  })

  it('getFieldMeta 返回 delimiter/parseMode/maxLength/placeholder', () => {
    const meta = getFieldMeta('characters', 'protagonists')
    expect(meta.delimiter).toEqual(CHIPS_DELIMS)
    expect(meta.parseMode).toBe('firstSeen')
    expect(meta.maxLength).toBe(MAX_LENGTH_BY_CONTROL_TYPE.chips)
    expect(typeof meta.placeholder).toBe('string')
    expect(meta.placeholder.length).toBeGreaterThan(0)
  })

  it('22 字段全部能拿到完整 meta（无 null）', () => {
    let count = 0
    for (const section of SETTING_SECTIONS) {
      for (const field of section.fields) {
        const meta = getFieldMeta(section.key, field.key)
        expect(meta).not.toBeNull()
        expect(meta.controlType).toBeTruthy()
        count++
      }
    }
    expect(count).toBe(22)
  })
})

describe('settingPanelSchema V2: parseControlValue firstSeen (chips/list)', () => {
  it('basic — "a\\nb\\nc" → 3 个 token', () => {
    expect(parseControlValue('a\nb\nc', CHIPS_DELIMS, 'firstSeen')).toEqual(['a', 'b', 'c'])
  })

  it('中文标点 token 保护 — 首次 "\\n" 胜出，不二次切分', () => {
    expect(parseControlValue('a (主角)\nb, 勇敢的\nc——反派', CHIPS_DELIMS, 'firstSeen'))
      .toEqual(['a (主角)', 'b, 勇敢的', 'c——反派'])
  })

  it('"a, b， c、 d; e" → 2 个（first "," 胜出，后续中文标点保留）', () => {
    expect(parseControlValue('a, b， c、 d; e', CHIPS_DELIMS, 'firstSeen'))
      .toEqual(['a', 'b， c、 d; e'])
  })

  it('空串 / 全空白 / 全分隔符 → []', () => {
    expect(parseControlValue('', CHIPS_DELIMS, 'firstSeen')).toEqual([])
    expect(parseControlValue('\n\n  \n', CHIPS_DELIMS, 'firstSeen')).toEqual([])
    expect(parseControlValue(',,,', CHIPS_DELIMS, 'firstSeen')).toEqual([])
  })

  it('单 token — "a" → ["a"]', () => {
    expect(parseControlValue('a', CHIPS_DELIMS, 'firstSeen')).toEqual(['a'])
  })

  it('句号不在候选 → 整段当一个 token', () => {
    expect(parseControlValue('a。b。c', CHIPS_DELIMS, 'firstSeen')).toEqual(['a。b。c'])
  })

  it('list delimiter = [\\n] 单一切分', () => {
    expect(parseControlValue('rule1\nrule2\nrule3', LIST_DELIMS, 'firstSeen'))
      .toEqual(['rule1', 'rule2', 'rule3'])
  })

  it('list 首尾空白 trim', () => {
    expect(parseControlValue('  rule1  \n  rule2  ', LIST_DELIMS, 'firstSeen'))
      .toEqual(['rule1', 'rule2'])
  })
})

describe('settingPanelSchema V2: parseControlValue multiDelimiter (tags)', () => {
  it('basic — "a, b, c" → 3 个', () => {
    expect(parseControlValue('a, b, c', TAGS_DELIMS, 'multiDelimiter')).toEqual(['a', 'b', 'c'])
  })

  it('混合分隔符 — 中文/英文/空白都切', () => {
    expect(parseControlValue('硬朗，克制，第三人称', TAGS_DELIMS, 'multiDelimiter'))
      .toEqual(['硬朗', '克制', '第三人称'])
  })

  it('trim + 过滤空 token', () => {
    expect(parseControlValue('  a  ,  b  ', TAGS_DELIMS, 'multiDelimiter')).toEqual(['a', 'b'])
  })

  it('null / undefined → []', () => {
    expect(parseControlValue(null, TAGS_DELIMS, 'multiDelimiter')).toEqual([])
    expect(parseControlValue(undefined, TAGS_DELIMS, 'multiDelimiter')).toEqual([])
  })

  it('无候选 delimiters → 单 token 兜底', () => {
    expect(parseControlValue('a', [], 'firstSeen')).toEqual(['a'])
    expect(parseControlValue('', [], 'firstSeen')).toEqual([])
  })
})

describe('settingPanelSchema V2: serializeControlValue', () => {
  it('round-trip — Array ↔ String', () => {
    const tokens = ['a', 'b', 'c']
    const text = serializeControlValue(tokens, '\n')
    expect(text).toBe('a\nb\nc')
    expect(parseControlValue(text, CHIPS_DELIMS, 'firstSeen')).toEqual(tokens)
  })

  it('trim + 过滤空项', () => {
    expect(serializeControlValue(['a', '  ', '', 'b'], '\n')).toBe('a\nb')
  })

  it('非数组输入 → ""', () => {
    expect(serializeControlValue(null, '\n')).toBe('')
    expect(serializeControlValue(undefined, '\n')).toBe('')
    expect(serializeControlValue('not array', '\n')).toBe('')
  })

  it('默认 delimiter = \\n', () => {
    expect(serializeControlValue(['a', 'b'])).toBe('a\nb')
  })
})
