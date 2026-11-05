import { describe, expect, it } from 'vitest'
import {
  CORE_ERROR_CODES,
  createChapterService,
  createMemoryChapterStore,
  createSyncChapterService
} from '../src/index.js'

function setup() {
  const store = createMemoryChapterStore({ books: new Map([['book-1', []]]) })
  const service = createChapterService({
    store,
    now: () => '2026-10-31T00:00:00.000Z',
    idFactory: () => 'chapter-new'
  })
  return { store, service }
}

describe('chapter core contract', () => {
  it('creates, lists and reads a chapter', async () => {
    const { service } = setup()
    const created = await service.create('book-1', { title: '第一章', content: '雨夜。' })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({
      id: 'chapter-new',
      bookId: 'book-1',
      title: '第一章',
      content: '雨夜。',
      revision: 1
    })

    const listed = await service.list('book-1')
    expect(listed.ok).toBe(true)
    expect(listed.value).toEqual([
      { id: 'chapter-new', title: '第一章', revision: 1, updatedAt: '2026-10-31T00:00:00.000Z' }
    ])

    const read = await service.read('book-1', 'chapter-new')
    expect(read.ok).toBe(true)
    expect(read.value.content).toBe('雨夜。')
    expect(read.value.revision).toBe(1)
  })

  it('saves with expectedRevision and increments it', async () => {
    const { service } = setup()
    await service.create('book-1', { title: '第一章', content: '旧文' })
    const saved = await service.save('book-1', 'chapter-new', {
      title: '第一章 · 改',
      content: '新文',
      expectedRevision: 1
    })
    expect(saved.ok).toBe(true)
    expect(saved.value).toMatchObject({ title: '第一章 · 改', content: '新文', revision: 2 })

    const reread = await service.read('book-1', 'chapter-new')
    expect(reread.value.content).toBe('新文')
    expect(reread.value.revision).toBe(2)
  })

  it('rejects stale writes without mutating the chapter', async () => {
    const { service } = setup()
    await service.create('book-1', { title: '第一章', content: '旧文' })
    const stale = await service.save('book-1', 'chapter-new', {
      content: '不该落盘',
      expectedRevision: 0
    })
    expect(stale.ok).toBe(false)
    expect(stale.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    const read = await service.read('book-1', 'chapter-new')
    expect(read.value.content).toBe('旧文')
    expect(read.value.revision).toBe(1)
  })

  it('validates ids, revision and save payloads', async () => {
    const { service } = setup()
    expect((await service.list('')).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.read('book-1', '')).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.save('book-1', 'chapter-new', { content: 'x' })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.save('book-1', 'chapter-new', { editorDocument: 1, expectedRevision: 1 })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.save('book-1', 'chapter-new', { content: 1, expectedRevision: 1 })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('preserves editorDocument and clears it on content-only saves', async () => {
    const { service } = setup()
    await service.create('book-1', {
      title: '第一章',
      content: '旧文',
      editorDocument: { schemaVersion: 3, revision: 7, content: [] }
    })
    const withDoc = await service.read('book-1', 'chapter-new')
    expect(withDoc.value.editorDocument).toMatchObject({ schemaVersion: 3 })
    expect(withDoc.value.revision).toBe(1)

    const saved = await service.save('book-1', 'chapter-new', {
      content: '新文',
      expectedRevision: 1
    })
    expect(saved.ok).toBe(true)
    expect(saved.value.editorDocument).toBeUndefined()
    expect(saved.value.revision).toBe(2)
  })

  it('removes a chapter only with the expected revision', async () => {
    const { service } = setup()
    await service.create('book-1', { title: '第一章', content: '旧文' })
    const stale = await service.remove('book-1', 'chapter-new', { expectedRevision: 0 })
    expect(stale.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    const removed = await service.remove('book-1', 'chapter-new', { expectedRevision: 1 })
    expect(removed.ok).toBe(true)
    expect((await service.read('book-1', 'chapter-new')).error.code).toBe(CORE_ERROR_CODES.CHAPTER_NOT_FOUND)
  })

  it('applies the same save rules in the sync service', () => {
    const store = createMemoryChapterStore({ books: new Map([['book-1', []]]) })
    const service = createSyncChapterService({ store, idFactory: () => 'chapter-sync' })
    const created = service.create('book-1', { title: '', content: '旧文' })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({ id: 'chapter-sync', title: '', revision: 1 })

    const saved = service.save('book-1', 'chapter-sync', {
      title: '',
      content: '新文',
      expectedRevision: 1
    })
    expect(saved.ok).toBe(true)
    expect(saved.value).toMatchObject({ title: '', content: '新文', revision: 2 })

    const stale = service.save('book-1', 'chapter-sync', { content: '不该落盘', expectedRevision: 1 })
    expect(stale.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    expect(service.read('book-1', 'chapter-sync').value.content).toBe('新文')
  })

  it('returns typed errors for missing book/chapter', async () => {
    const { service } = setup()
    expect((await service.list('missing')).error.code).toBe(CORE_ERROR_CODES.BOOK_NOT_FOUND)
    expect((await service.read('book-1', 'missing')).error.code).toBe(CORE_ERROR_CODES.CHAPTER_NOT_FOUND)
  })
})
