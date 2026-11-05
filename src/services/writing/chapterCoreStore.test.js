import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createChapterService, CORE_ERROR_CODES } from '@pinax/core'
import { useChapterCore } from '../../composables/useChapterCore.js'
import { createBrowserChapterStore } from './chapterCoreStore.js'

function createBookStore() {
  let books = [{
    id: 'book-1',
    title: '测试书',
    chapters: [{
      id: 'chapter-1',
      title: '旧章',
      content: '旧正文',
      editorDocument: { schemaVersion: 3, revision: 4, content: [] }
    }]
  }]
  let saves = 0
  return {
    loadBooks: () => JSON.parse(JSON.stringify(books)),
    saveBooks: (next) => {
      books = JSON.parse(JSON.stringify(next))
      saves += 1
      return { ok: true, value: { books, revision: saves } }
    },
    getBooks: () => books,
    getSaves: () => saves
  }
}

describe('browser chapter store adapter', () => {
  it('reads existing chapters with editorDocument revision as the core revision', async () => {
    const fixture = createBookStore()
    const store = createBrowserChapterStore(fixture)
    const service = createChapterService({ store, idFactory: () => 'chapter-new' })

    const listed = await service.list('book-1')
    expect(listed.ok).toBe(true)
    expect(listed.value).toEqual([
      { id: 'chapter-1', title: '旧章', revision: 4, updatedAt: null }
    ])

    const read = await service.read('book-1', 'chapter-1')
    expect(read.value.content).toBe('旧正文')
    expect(read.value.editorDocument).toMatchObject({ schemaVersion: 3 })
  })

  it('creates a chapter in the existing book repository', async () => {
    const fixture = createBookStore()
    const store = createBrowserChapterStore(fixture)
    const service = createChapterService({ store, idFactory: () => 'chapter-new' })

    const created = await service.create('book-1', { title: '新章', content: '新正文' })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({ id: 'chapter-new', title: '新章', revision: 1 })
    expect(fixture.getBooks()[0].chapters.map((chapter) => chapter.id)).toEqual(['chapter-1', 'chapter-new'])
    expect(fixture.getSaves()).toBe(1)
  })

  it('creates a chapter through the page-level useChapterCore adapter', async () => {
    const books = ref([{ id: 'book-1', chapters: [] }])
    const chapters = ref([])
    const saveBooks = vi.fn(() => true)
    const core = useChapterCore({ books, chapters, saveBooks })

    const created = await core.createChapter('book-1')
    expect(created.ok).toBe(true)
    expect(created.value.title).toBe('')
    expect(chapters.value).toHaveLength(1)
    expect(books.value[0].chapters).toBe(chapters.value)
    expect(saveBooks).toHaveBeenCalledTimes(1)
    expect(core.listChapters('book-1').value).toHaveLength(1)
    expect(core.readChapter('book-1', created.value.id).value.id).toBe(created.value.id)
  })

  it('restores the page chapter list when the page save fails', async () => {
    const books = ref([{ id: 'book-1', chapters: [] }])
    const chapters = ref([])
    const saveBooks = vi.fn(() => false)
    const core = useChapterCore({ books, chapters, saveBooks })

    const created = await core.createChapter('book-1')
    expect(created.ok).toBe(false)
    expect(chapters.value).toHaveLength(0)
    expect(books.value[0].chapters).toHaveLength(0)
    expect(saveBooks).toHaveBeenCalledTimes(1)
  })

  it('removes a chapter through useChapterCore and rejects stale removal', async () => {
    const books = ref([{ id: 'book-1', chapters: [] }])
    const chapters = ref([])
    const saveBooks = vi.fn(() => true)
    const core = useChapterCore({ books, chapters, saveBooks })
    const created = await core.createChapter('book-1')
    const chapter = chapters.value[0]

    expect(core.removeChapter({ bookId: 'book-1', chapterId: chapter.id, expectedRevision: 0 })).toBe(false)
    expect(chapters.value).toHaveLength(1)
    expect(core.removeChapter({ bookId: 'book-1', chapterId: chapter.id, expectedRevision: 1 })).toBe(true)
    expect(chapters.value).toHaveLength(0)
    expect(books.value[0].chapters).toHaveLength(0)
    expect(created.ok).toBe(true)
  })

  it('saves the current chapter through the sync Core service and rejects stale revisions', async () => {
    const books = ref([{ id: 'book-1', chapters: [] }])
    const chapters = ref([])
    const saveBooks = vi.fn(() => true)
    const core = useChapterCore({ books, chapters, saveBooks })
    const created = await core.createChapter('book-1')
    expect(created.ok).toBe(true)
    const chapter = chapters.value[0]

    chapter.title = '改名'
    chapter.content = '新文'
    chapter.revision = 1
    expect(core.saveChapter({ bookId: 'book-1', chapter, expectedRevision: 1 })).toBe(true)
    expect(chapter.revision).toBe(2)
    expect(chapter.title).toBe('改名')

    chapter.content = '不该落盘'
    expect(core.saveChapter({ bookId: 'book-1', chapter, expectedRevision: 1 })).toBe(false)
    expect(saveBooks).toHaveBeenCalledTimes(2)
  })

  it('checks expectedRevision and clears stale editorDocument on content-only saves', async () => {
    const fixture = createBookStore()
    const store = createBrowserChapterStore(fixture)
    const service = createChapterService({ store, idFactory: () => 'chapter-new' })

    const stale = await service.save('book-1', 'chapter-1', { content: '不该落盘', expectedRevision: 3 })
    expect(stale.ok).toBe(false)
    expect(stale.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    expect(fixture.getSaves()).toBe(0)

    const saved = await service.save('book-1', 'chapter-1', { content: '新正文', expectedRevision: 4 })
    expect(saved.ok).toBe(true)
    expect(saved.value.revision).toBe(5)
    expect(saved.value.editorDocument).toBeUndefined()
    expect(fixture.getBooks()[0].chapters[0].content).toBe('新正文')
    expect(fixture.getBooks()[0].chapters[0].editorDocument).toBeUndefined()
  })
})
