import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import { useDirector } from '@/composables/useDirector'
import { getCurrentStoryboardVersion, listStoryboardDocuments } from '@/services/storyboardStore'

describe('useDirector', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS)
    localStorage.removeItem(STORAGE_KEYS.STORYBOARD_SNAPSHOTS)
  })

  it('persists storyboard edits into a unified document', () => {
    const director = useDirector()

    director.loadFromProseEssay([
      { id: 'card-1', content: '街灯亮起', emotion: 'calm' }
    ])

    expect(director.storyboardDocument.value).not.toBeNull()
    expect(director.storyboardVersion.value).not.toBeNull()
    expect(listStoryboardDocuments({ sourceType: 'prose-card' })).toHaveLength(1)
    expect(getCurrentStoryboardVersion(director.storyboardDocument.value).shots[0].content).toBe('街灯亮起')
  })

  it('restores a previous storyboard version by version id', () => {
    const director = useDirector()

    director.loadFromRelationCanvas([
      { id: 'node-1', content: '旧镜头' }
    ])
    const firstVersionId = director.storyboardVersionId.value

    expect(listStoryboardDocuments({ sourceType: 'relation-canvas' })).toHaveLength(1)
    expect(director.storyboardDocument.value.source.sourceType).toBe('relation-canvas')
    director.addShot({ content: '新镜头', shotType: 'wide', camera: 'fixed', duration: 3 })
    expect(director.storyboardVersionId.value).not.toBe(firstVersionId)

    const restored = director.restoreSnapshot(firstVersionId)
    expect(restored).toBe(true)
    expect(director.storyboardVersionId.value).toBe(firstVersionId)
    expect(director.shots.value[0].content).toBe('旧镜头')
  })
})
