import { describe, expect, it } from 'vitest'
import { applyChapterPatch, CHAPTER_SIDECAR_KEYS, CORE_ERROR_CODES } from '../src/index.js'

describe('applyChapterPatch', () => {
  it('rejects when expectedRevision does not match the current revision', () => {
    const current = { id: 'c1', content: '旧', revision: 3 }
    const result = applyChapterPatch(current, { content: '新' }, { expectedRevision: 2, now: '2026-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    expect(result.error.details).toEqual({ expected: 2, actual: 3 })
  })

  it('reads revision from editorDocument when the chapter has no direct revision', () => {
    const current = { id: 'c1', content: '旧', editorDocument: { revision: 4 } }
    const result = applyChapterPatch(current, { content: '新' }, { expectedRevision: 4, now: '2026-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(true)
    expect(result.value.revision).toBe(5)
  })

  it('clears the structured sidecar on a content-only save', () => {
    const current = { id: 'c1', content: '旧', revision: 1, editorDocument: { revision: 1 }, editorDocumentSchemaVersion: 3, marker: 'keep' }
    const result = applyChapterPatch(current, { content: '新' }, { expectedRevision: 1, now: '2026-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(true)
    expect(result.value.content).toBe('新')
    for (const key of CHAPTER_SIDECAR_KEYS) expect(result.value[key]).toBeUndefined()
    // 未知字段原样保留，Core 不裁宿主仍在用的数据。
    expect(result.value.marker).toBe('keep')
    expect(result.value.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('honours an explicitly submitted editorDocument instead of stripping it', () => {
    const current = { id: 'c1', content: '旧', revision: 1, editorDocument: { revision: 1 } }
    const next = { schemaVersion: 4, revision: 1, content: ['新'] }
    const result = applyChapterPatch(current, { content: '新', editorDocument: next }, { expectedRevision: 1, now: '2026-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(true)
    expect(result.value.editorDocument).toEqual(next)
  })

  it('deletes editorDocument when null is submitted', () => {
    const current = { id: 'c1', content: '旧', revision: 1, editorDocument: { revision: 1 } }
    const result = applyChapterPatch(current, { editorDocument: null }, { expectedRevision: 1, now: '2026-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(true)
    expect(result.value.editorDocument).toBeUndefined()
    expect(result.value.content).toBe('旧')
  })

  it('does not mutate the source chapter object', () => {
    const current = { id: 'c1', content: '旧', revision: 1 }
    const result = applyChapterPatch(current, { content: '新' }, { expectedRevision: 1, now: '2026-01-01T00:00:00.000Z' })
    expect(result.value).not.toBe(current)
    expect(current.content).toBe('旧')
    expect(current.revision).toBe(1)
  })
})
