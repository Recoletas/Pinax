import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  createStoryboardDocument,
  createStoryboardSnapshot,
  getCurrentStoryboardVersion,
  getLatestStoryboardSnapshot,
  listStoryboardDocuments,
  listStoryboardSnapshots,
  restoreStoryboardSnapshot,
  restoreStoryboardVersion,
  saveStoryboardSnapshot,
  saveStoryboardVersion,
  saveValidatedStoryboardVersion,
  createStoryboardValidationResult,
  validateStoryboardShots
} from '@/services/storyboardStore'

describe('storyboardStore', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS)
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

  it('creates a storyboard document with a current version and structured validation', () => {
    const document = createStoryboardDocument({
      projectId: 'project-1',
      source: {
        sourceType: 'prose-card',
        sourceId: 'card-1',
        title: '散文片段'
      },
      shots: [
        { sequence: 1, content: '街灯亮起', shotType: 'wide', camera: 'fixed', duration: 3 }
      ],
      taskType: 'storyboard.from-prose-card'
    })

    const version = getCurrentStoryboardVersion(document)
    expect(document.schemaVersion).toBe(1)
    expect(document.source.sourceType).toBe('prose-card')
    expect(document.currentVersionId).toBe(version.versionId)
    expect(version.taskType).toBe('storyboard.from-prose-card')
    expect(version.validation.ok).toBe(true)
  })

  it('appends storyboard versions to the same source document', () => {
    const first = saveStoryboardVersion({
      projectId: 'project-1',
      source: {
        sourceType: 'prose',
        sourceId: 'card-1',
        title: '旧散文来源'
      },
      shots: [{ sequence: 1, content: '第一版', shotType: 'wide', camera: 'fixed', duration: 3 }]
    })
    const second = saveStoryboardVersion({
      projectId: 'project-1',
      source: {
        sourceType: 'prose-card',
        sourceId: 'card-1',
        title: '旧散文来源'
      },
      shots: [{ sequence: 1, content: '第二版', shotType: 'medium', camera: 'push', duration: 4 }]
    })

    const documents = listStoryboardDocuments({ sourceType: 'prose-card', sourceId: 'card-1' })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(documents).toHaveLength(1)
    expect(documents[0].versions).toHaveLength(2)
    expect(getCurrentStoryboardVersion(documents[0]).shots[0].content).toBe('第二版')
  })

  it('restores a previous storyboard document version as current', () => {
    const first = saveStoryboardVersion({
      source: { sourceType: 'poetry-tree', sourceId: 'poetry-a' },
      shots: [{ sequence: 1, content: '旧分镜', shotType: 'wide', camera: 'fixed', duration: 3 }]
    })
    saveStoryboardVersion({
      documentId: first.document.id,
      source: { sourceType: 'poetry-tree', sourceId: 'poetry-a' },
      shots: [{ sequence: 1, content: '新分镜', shotType: 'medium', camera: 'follow', duration: 4 }]
    })

    const restored = restoreStoryboardVersion(first.document.id, first.version.versionId)

    expect(restored.success).toBe(true)
    expect(restored.document.currentVersionId).toBe(first.version.versionId)
    expect(getCurrentStoryboardVersion(restored.document).shots[0].content).toBe('旧分镜')
  })

  it('returns structured validation issues for empty storyboards', () => {
    const validation = createStoryboardValidationResult([])

    expect(validation.ok).toBe(false)
    expect(validation.errors[0]).toMatchObject({
      code: 'empty_storyboard',
      severity: 'error'
    })
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

    const documents = listStoryboardDocuments({ sourceType: 'poetry-tree', sourceId: 'source-a' })
    expect(documents).toHaveLength(1)
    expect(documents[0].versions).toHaveLength(2)
  })

  it('saves only validated storyboard versions', () => {
    const result = saveValidatedStoryboardVersion({
      source: { sourceType: 'chapter', sourceId: 'chapter-a', title: '章节 A' },
      shots: [{ sequence: 1, content: '章节分镜', shotType: 'wide', camera: 'fixed', duration: 3 }]
    })

    expect(result.validation.valid).toBe(true)
    expect(result.shots[0].shotId).toBe('1')
    expect(result.version.validation.ok).toBe(true)
  })

  it('throws on invalid storyboard versions before saving', () => {
    expect(() => saveValidatedStoryboardVersion({
      source: { sourceType: 'chapter', sourceId: 'chapter-b', title: '章节 B' },
      shots: []
    })).toThrow('分镜不能为空')
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
