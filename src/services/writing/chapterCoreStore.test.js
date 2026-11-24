import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { normalizeParagraphsTransaction } from './writingParagraphNormalize.js'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createChapterService, CORE_ERROR_CODES } from '@pinax/core'
import { useAuthoringBookActivation } from '../../composables/useAuthoringBookActivation.js'
import { loadWritingBooks, saveWritingBooksDurable } from './writingBooksRepository.js'
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

function verifyImportedParagraphNormalization() {
  const schema = new Schema({
    nodes: {
      doc: { content: 'writingUnit+' },
      writingUnit: { content: 'block*', attrs: { unitId: { default: null }, unitRevision: { default: 0 } } },
      paragraph: { group: 'block', content: 'inline*', attrs: { nodeId: { default: null }, nodeRevision: { default: 0 } } },
      image: { group: 'inline', inline: true },
      text: { group: 'inline' }
    }
  })

  const p = (text, nodeId) => schema.nodes.paragraph.create({ nodeId }, text ? schema.text(text) : null)
  const unit = (...children) => schema.nodes.writingUnit.create({ unitId: 'u1' }, children)
  const stateOf = (...units) => EditorState.create({ schema, doc: schema.nodes.doc.create(null, units) })
  const texts = (doc) => { const out = []; doc.descendants((n) => { if (n.type.name === 'paragraph') out.push(n.textContent) }); return out }
  {
    const state = stateOf(unit(p('第六十五章　两张不能重合的图\n　　到了午后。\n　　莱昂让工厂送来木料。\n\n　　“好。”', 'n1')))
    const result = normalizeParagraphsTransaction(state, { title: '第六十五章 两张不能重合的图', idFactory: (() => { let i = 0; return (k) => `${k}-new-${++i}` })() })
    const doc = result.tr.doc
    expect(texts(doc)).toEqual(['到了午后。', '莱昂让工厂送来木料。', '“好。”'])
    expect(result.removedTitle).toBe(true)
    expect(doc.firstChild.attrs.unitRevision).toBe(1)
    const ids = []; doc.descendants((n) => { if (n.type.name === 'paragraph') ids.push(n.attrs.nodeId) })
    expect(new Set(ids).size).toBe(ids.length)
  }

  {
    const withImage = schema.nodes.paragraph.create({ nodeId: 'n3' }, [schema.text('　　图\n说'), schema.nodes.image.create()])
    const state = stateOf(unit(p('正文第一段。', 'n1'), p('', 'n2'), withImage))
    expect(normalizeParagraphsTransaction(state, { title: '别的标题' }).tr).toBeNull()
  }

  {
    const state = stateOf(unit(p('第一章', 'n1')))
    expect(normalizeParagraphsTransaction(state, { title: '第一章' }).tr).toBeNull()
  }
}

describe('browser chapter store adapter', () => {
  it('reads existing chapters with editorDocument revision as the core revision', async () => {
    verifyImportedParagraphNormalization()
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
    const savedChapter = { id: 'saved', content: 'before', revision: 2, editorDocument: { revision: 2 }, editorDocumentSchemaVersion: 3 }
    const sourceBook = { id: 'book-1', chapters: [savedChapter], updatedAt: 'before' }
    const booksList = [sourceBook]
    const original = JSON.stringify(sourceBook)
    const store = createBrowserChapterStore({ loadBooks: () => booksList, saveBooks: () => ({ ok: false }) })
    expect(store.update('book-1', 'saved', { content: 'after' }, { expectedRevision: 2 }).ok).toBe(false)
    expect(JSON.stringify(sourceBook)).toBe(original)
    expect(sourceBook.chapters[0]).toBe(savedChapter)
    expect(store.remove('book-1', 'saved', { expectedRevision: 2 }).ok).toBe(false)
    expect(JSON.stringify(sourceBook)).toBe(original)
    const throwing = createBrowserChapterStore({ loadBooks: () => booksList, saveBooks: () => { throw new Error('disk failed') } })
    expect(throwing.update('book-1', 'saved', { content: 'after' }, { expectedRevision: 2 }).ok).toBe(false)
    expect(JSON.stringify(sourceBook)).toBe(original)
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

    const openPage = () => {
      const books = ref([]), chapters = ref([])
      const activation = useAuthoringBookActivation({ books })
      activation.acceptPageBooks(loadWritingBooks())
      chapters.value = books.value[0].chapters
      return { books, chapters, core: useChapterCore({ books, chapters, saveBooks: activation.saveBooks }) }
    }
    const previous = localStorage.getItem('writing_books')
    try {
      saveWritingBooksDurable([{ id: 'b', title: '跨页', chapters: [{ id: 'a', content: '初稿' }, { id: 'b', content: '初稿' }] }])
      const page1 = openPage(), page2 = openPage()
      const write = (page, index, text) => {
        const item = page.chapters.value[index]
        item.content = text
        return page.core.saveChapter({ bookId: 'b', chapter: item, expectedRevision: page.core.revisionOf(item) })
      }
      expect(write(page1, 0, '甲章新稿')).toBe(true)
      expect(write(page2, 1, '乙章新稿')).toBe(true)
      expect(write(page2, 0, '甲章过期稿')).toBe(false)
      expect(loadWritingBooks()[0].chapters.map(item => item.content)).toEqual(['甲章新稿', '乙章新稿'])
      expect(page1.core.removeChapter({ bookId: 'b', chapterId: 'b', expectedRevision: 0 })).toBe(false)
    } finally {
      if (previous === null) localStorage.removeItem('writing_books')
      else localStorage.setItem('writing_books', previous)
    }
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
