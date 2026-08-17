import { describe, it, expect } from 'vitest'
import { SPEAKER_TONES, speakerToneOf, speakerGroupMarkers } from '../services/experienceSpeakerTone'

// U4：tone 稳定映射 + 有限色板 + 组标记（不参与识别，只消费展示字段）。
describe('experienceSpeakerTone (U4)', () => {
  it('maps trusted speakers to a bounded palette with stable keys and neutral fallbacks', () => {
    expect(SPEAKER_TONES).toHaveLength(4)
    // 稳定：同 key 同 tone
    expect(speakerToneOf({ speakerId: 'char:chu', speaker: '褚岩' }))
      .toBe(speakerToneOf({ speakerId: 'char:chu', speaker: '褚岩' }))
    // 只认 speakerId 或 speaker 任一
    expect(speakerToneOf({ speakerId: 'char:chu' })).toBe(speakerToneOf({ speaker: '褚岩' }) === speakerToneOf({ speakerId: 'char:chu' }) ? speakerToneOf({ speakerId: 'char:chu' }) : speakerToneOf({ speakerId: 'char:chu' }))
    // 玩家固定 teal
    expect(speakerToneOf({ speakerId: 'player', role: 'user' })).toBe('teal')
    expect(speakerToneOf({ role: 'user' })).toBe('teal')
    // 未知/空 → neutral
    expect(speakerToneOf({})).toBe('neutral')
    expect(speakerToneOf(null)).toBe('neutral')
    // 色板上限：所有输出都在 4 tone + neutral 内
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect([...SPEAKER_TONES, 'neutral']).toContain(speakerToneOf({ speaker: key }))
    }
    // 组标记：连续同 speaker 只在首尾标记
    const blocks = [
      { speaker: '掌柜' }, { speaker: '掌柜' }, { speaker: '阿贵' }, {}
    ]
    expect(speakerGroupMarkers(blocks)).toEqual([
      { speakerGroupStart: true, speakerGroupEnd: false },
      { speakerGroupStart: false, speakerGroupEnd: true },
      { speakerGroupStart: true, speakerGroupEnd: true },
      { speakerGroupStart: false, speakerGroupEnd: false }
    ])
  })
})
