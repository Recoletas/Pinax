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
    expect(SIDE_PANELS.experience.items).toHaveLength(1)
    expect(SIDE_PANELS.writing.items).toHaveLength(1)
    expect(SIDE_PANELS.materials.items).toHaveLength(1)
    expect(SIDE_PANELS.worldbook.items).toHaveLength(2)
    expect(SIDE_PANELS.storyboard.items).toHaveLength(2)
  })

  it('resolves workbench routes to the new activity groups', () => {
    expect(resolveActivityKey({
      name: 'experience-worldbook',
      meta: { activityKey: 'worldbook' }
    })).toBe('worldbook')

    expect(resolveActivityKey({
      name: 'materials',
      meta: { activityKey: 'materials' }
    })).toBe('materials')

    expect(resolveActivityKey({
      name: 'poetry-lab',
      meta: { activityKey: 'storyboard' }
    })).toBe('storyboard')
  })
})
