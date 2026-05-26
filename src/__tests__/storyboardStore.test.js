import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  createStoryboardSnapshot,
  getLatestStoryboardSnapshot,
  listStoryboardSnapshots,
  restoreStoryboardSnapshot,
  saveStoryboardSnapshot,
  validateStoryboardShots
} from '@/services/storyboardStore'

describe('storyboardStore', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.STORYBOARD_SNAPSHOTS)
  })

  it('normalizes and validates storyboard shots', () => {
    const report = validateStoryboardShots([
      {
        sequence: 1,
        content: '夜色降临',
        shotType: 'wide',
        camera: 'fixed',
        duration: 4,
        transition: 'cut'
      }
    ])

    expect(report.valid).toBe(true)
    expect(report.normalized[0].shotId).toBe('1')
    expect(report.normalized[0].sourceText).toBe('夜色降临')
  })

  it('saves versioned snapshots and restores them', () => {
    const first = saveStoryboardSnapshot({
      sourceType: 'poetry',
      sourceLabel: '诗歌工坊',
      sourceId: 'source-a',
      shots: [{ sequence: 1, content: '第一镜', shotType: 'wide', camera: 'fixed', duration: 3 }]
    })
    const second = saveStoryboardSnapshot({
      sourceType: 'poetry',
      sourceLabel: '诗歌工坊',
      sourceId: 'source-a',
      shots: [{ sequence: 1, content: '第二镜', shotType: 'medium', camera: 'follow', duration: 4 }]
    })

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(listStoryboardSnapshots({ sourceType: 'poetry', sourceId: 'source-a' })).toHaveLength(2)
    expect(getLatestStoryboardSnapshot({ sourceType: 'poetry', sourceId: 'source-a' }).version).toBe(2)
    expect(restoreStoryboardSnapshot(first.id).version).toBe(1)
  })

  it('creates a snapshot with validation report', () => {
    const snapshot = createStoryboardSnapshot({
      sourceType: 'prose',
      sourceLabel: '散文随笔',
      sourceId: 'source-b',
      shots: [{ sequence: 1, content: '散文镜头', shotType: 'close_up', camera: 'push', duration: 3 }]
    })

    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.validation.valid).toBe(true)
  })
})
