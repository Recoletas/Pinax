import { describe, expect, it } from 'vitest'
import {
  STAGE2_QUALITY_TARGETS,
  seedWorldbookPresets,
  summarizeSeedWorldbookQuality
} from '../services/seedWorldbookPresets'
import { matchWorldbookEntries } from '../services/worldbookContextBuilder'

function borderKingdomPreset() {
  const preset = seedWorldbookPresets.find(preset => preset.id === 'preset-border-kingdom-fogtide')
  return {
    ...preset,
    entries: preset.entries.map((entry, index) => ({
      id: `seed-entry-${index}`,
      ...entry
    }))
  }
}

function matchedNamesFor(text) {
  return matchWorldbookEntries({
    worldbook: borderKingdomPreset(),
    chatHistory: [{ role: 'user', content: text }],
    scanDepth: 1,
    includeStarterEntries: false
  }).map(entry => entry.name)
}

describe('seedWorldbookPresets', () => {
  it('keeps the three promoted seed worlds at Stage 2 playable-worldbook quality', () => {
    expect(seedWorldbookPresets.map(preset => preset.name)).toEqual([
      '边境王国 · 雾潮暮湾',
      '都市异闻 · 北岸旧档',
      '近未来殖民地 · 赫利俄斯'
    ])

    for (const preset of seedWorldbookPresets) {
      const quality = summarizeSeedWorldbookQuality(preset)

      expect(preset.sourceKind).toBe('seed-worldbook')
      expect(preset.sourceLabel).toBe('首轮种子世界')
      expect(quality.hasOpeningDilemma).toBe(true)
      expect(quality.hasWorldDescription).toBe(true)
      expect(quality.hasWritingStyle).toBe(true)
      expect(quality.hasForbidden).toBe(true)
      expect(quality.events).toBeGreaterThanOrEqual(STAGE2_QUALITY_TARGETS.minEvents)
      expect(quality.events).toBeLessThanOrEqual(STAGE2_QUALITY_TARGETS.maxEvents)
      expect(quality.factions).toBeGreaterThanOrEqual(STAGE2_QUALITY_TARGETS.minFactions)
      expect(quality.factions).toBeLessThanOrEqual(STAGE2_QUALITY_TARGETS.maxFactions)
      expect(quality.locations).toBeGreaterThanOrEqual(STAGE2_QUALITY_TARGETS.minLocations)
      expect(quality.locations).toBeLessThanOrEqual(STAGE2_QUALITY_TARGETS.maxLocations)
      expect(quality.rewriteDirections).toBeGreaterThanOrEqual(STAGE2_QUALITY_TARGETS.minRewriteDirections)
      expect(quality.constraints).toEqual({
        rule: true,
        style: true,
        forbidden: true
      })
      expect(preset.groups).toEqual(expect.arrayContaining([
        '硬约束',
        '文风约束',
        '禁写边界',
        '地理',
        '组织',
        '事件',
        '任务'
      ]))
    }
  })

  it('keeps border-kingdom B1 keyword fixes reachable from natural player wording', () => {
    expect(matchedNamesFor('谁阻止我查账')).toContain('索德码头夜班头目')
    expect(matchedNamesFor('灰墙 三选一 代价')).toContain('灰墙真相分岔')
    expect(matchedNamesFor('天亮前看到下一条真证据 观测')).toContain('观测曲线停摆对应')
    expect(matchedNamesFor('追失踪巡骑')).toContain('灰墙巡骑失踪')
  })
})
