import { describe, expect, it } from 'vitest'
import {
  STAGE2_QUALITY_TARGETS,
  seedWorldbookPresets,
  summarizeSeedWorldbookQuality
} from '../services/seedWorldbookPresets'

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
})
