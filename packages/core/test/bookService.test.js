import { describe, expect, it } from 'vitest'
import {
  createBookService,
  createSyncBookService,
  createMemoryBookStore,
  CORE_ERROR_CODES
} from '../src/index.js'

function freshStore() {
  return createMemoryBookStore({ books: new Map() })
}

describe('book service (async)', () => {
  it('lists empty initially', async () => {
    const service = createBookService({ store: freshStore() })
    const listed = await service.list()
    expect(listed.ok).toBe(true)
    expect(listed.value).toEqual([])
  })

  it('creates a book and reports it in the list summary', async () => {
    const service = createBookService({ store: freshStore() })
    const created = await service.create({ id: 'book-1', title: '测试书', description: '  简介  ' })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({ id: 'book-1', title: '测试书', description: '简介', chapters: [] })

    const listed = await service.list()
    expect(listed.value).toEqual([
      { id: 'book-1', title: '测试书', chapterCount: 0, updatedAt: created.value.updatedAt }
    ])
  })

  it('allows an empty title (display fallback is the host’s job)', async () => {
    const service = createBookService({ store: freshStore() })
    const created = await service.create({ id: 'book-2', title: '   ' })
    expect(created.ok).toBe(true)
    expect(created.value.title).toBe('')
  })

  it('reads a book back, keeping its chapters normalized', async () => {
    const store = createMemoryBookStore({
      books: new Map([['book-3', {
        id: 'book-3',
        title: '有章的书',
        chapters: [{ id: 'c1', title: '第一章', content: '正文', revision: 2 }]
      }]])
    })
    const service = createBookService({ store })
    const read = await service.read('book-3')
    expect(read.ok).toBe(true)
    expect(read.value.chapters[0]).toMatchObject({ id: 'c1', title: '第一章', content: '正文', revision: 2 })
  })

  it('renames a book and rejects an empty title', async () => {
    const service = createBookService({ store: freshStore() })
    await service.create({ id: 'book-4', title: '旧名' })

    const renamed = await service.rename('book-4', '  新名  ')
    expect(renamed.ok).toBe(true)
    expect(renamed.value.title).toBe('新名')
    expect(typeof renamed.value.updatedAt).toBe('string')

    const empty = await service.rename('book-4', '   ')
    expect(empty.ok).toBe(false)
    expect(empty.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('rejects a duplicate id', async () => {
    const service = createBookService({ store: freshStore() })
    await service.create({ id: 'book-5', title: 'A' })
    const dup = await service.create({ id: 'book-5', title: 'B' })
    expect(dup.ok).toBe(false)
    expect(dup.error.code).toBe(CORE_ERROR_CODES.DUPLICATE_BOOK)
  })

  it('removes a book and then reports it missing', async () => {
    const service = createBookService({ store: freshStore() })
    await service.create({ id: 'book-6', title: 'C' })
    const removed = await service.remove('book-6')
    expect(removed.ok).toBe(true)

    const gone = await service.read('book-6')
    expect(gone.ok).toBe(false)
    expect(gone.error.code).toBe(CORE_ERROR_CODES.BOOK_NOT_FOUND)
  })

  it('reports a missing book on rename/remove as BOOK_NOT_FOUND', async () => {
    const service = createBookService({ store: freshStore() })
    const renameMissing = await service.rename('nope', 'X')
    expect(renameMissing.error.code).toBe(CORE_ERROR_CODES.BOOK_NOT_FOUND)
    const removeMissing = await service.remove('nope')
    expect(removeMissing.error.code).toBe(CORE_ERROR_CODES.BOOK_NOT_FOUND)
  })
})

describe('book service (sync)', () => {
  it('applies the same rules synchronously for localStorage hosts', () => {
    const service = createSyncBookService({ store: freshStore() })
    const created = service.create({ id: 'book-s', title: '同步书' })
    expect(created.ok).toBe(true)
    expect(service.read('book-s').value.title).toBe('同步书')

    const renamed = service.rename('book-s', '改名')
    expect(renamed.ok).toBe(true)
    expect(renamed.value.title).toBe('改名')

    const empty = service.rename('book-s', '')
    expect(empty.ok).toBe(false)
    expect(empty.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)

    expect(service.remove('book-s').ok).toBe(true)
    expect(service.list().value).toEqual([])
  })

  it('throws when the store does not implement the BookStore port', () => {
    expect(() => createBookService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncBookService({ store: { list() {} } })).toThrow(TypeError)
  })
})
