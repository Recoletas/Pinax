import { describe, expect, it } from 'vitest'
import { ACTIVITY_ITEMS, SIDE_PANELS, resolveActivityKey } from '@/config/workbenchNav'

describe('workbenchNav', () => {
  it('maps the new top-level workbench activities', () => {
    expect(ACTIVITY_ITEMS).toHaveLength(5)
    expect(ACTIVITY_ITEMS.map((item) => item.key)).toEqual([
      'experience',
      'worldbook',
      'writing',
      'materials',
      'storyboard'
    ])
    expect(SIDE_PANELS.experience.items).toHaveLength(3)
    expect(SIDE_PANELS.writing.items).toHaveLength(1)
    expect(SIDE_PANELS.materials.items).toHaveLength(1)
    expect(SIDE_PANELS.worldbook.items).toHaveLength(4)
    expect(SIDE_PANELS.storyboard.items).toHaveLength(1)
    expect(ACTIVITY_ITEMS.find((item) => item.key === 'experience')?.defaultRouteName).toBe('experience')
    expect(ACTIVITY_ITEMS.find((item) => item.key === 'storyboard')?.defaultRouteName).toBe('prose-essay')
    // UI-S16 (2026-06-27): 设定 activity 默认入口改为世界书 (settings-worldbook),
    // 跟左侧抽屉首项 / SettingsSectionNav 第 1 个 tab 保持一致. 旧默认
    // settings-structured 已不再是 default, 但仍是 4 个 sub-page 之一.
    expect(ACTIVITY_ITEMS.find((item) => item.key === 'worldbook')?.defaultRouteName).toBe('settings-worldbook')
    expect(SIDE_PANELS.experience.items.map((item) => item.routeName)).toEqual([
      'opening',
      'settings-worldbook',
      'experience'
    ])
  })

  it('exposes the four settings sub-routes in drawer order with worldbook first', () => {
    expect(SIDE_PANELS.worldbook.items.map((item) => item.routeName)).toEqual([
      'settings-worldbook',
      'settings-structured',
      'settings-world-map',
      'settings-worldbook-advanced'
    ])
  })

  it('resolves workbench routes to the new activity groups', () => {
    expect(resolveActivityKey({
      name: 'opening',
      meta: { activityKey: 'experience' }
    })).toBe('experience')

    expect(resolveActivityKey({
      name: 'settings-worldbook',
      meta: { activityKey: 'experience' }
    })).toBe('experience')

    expect(resolveActivityKey({
      name: 'settings-worldbook',
      meta: { activityKey: 'worldbook' }
    })).toBe('worldbook')

    expect(resolveActivityKey({
      name: 'settings-structured',
      meta: { activityKey: 'worldbook' }
    })).toBe('worldbook')

    expect(resolveActivityKey({
      name: 'settings-world-map',
      meta: { activityKey: 'worldbook' }
    })).toBe('worldbook')

    expect(resolveActivityKey({
      name: 'settings-worldbook-advanced',
      meta: { activityKey: 'worldbook' }
    })).toBe('worldbook')

    expect(resolveActivityKey({
      name: 'materials',
      meta: { activityKey: 'materials' }
    })).toBe('materials')

    expect(resolveActivityKey({
      name: 'prose-essay',
      meta: { activityKey: 'storyboard' }
    })).toBe('storyboard')
  })
})
