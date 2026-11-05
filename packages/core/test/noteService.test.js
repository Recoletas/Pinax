import { describe, expect, it } from 'vitest'
import {
  createNoteService,
  createSyncNoteService,
  createMemoryNoteStore,
  countNoteWords,
  deriveNoteTitle,
  buildNoteUpdatePatch,
  CORE_ERROR_CODES
} from '../src/index.js'

const fresh = () => createMemoryNoteStore({ notes: [] })

describe('note service (async)', () => {
  it('creates a note deriving title and word count from content', async () => {
    const service = createNoteService({ store: fresh() })
    const created = await service.create({ content: '剑客张三登场。\n第二段' })
    expect(created.ok).toBe(true)
    expect(created.value.title).toBe('剑客张三登场。')
    expect(created.value.wordCount).toBe(9)
    expect(created.value.contentFormat).toBe('md')
  })

  it('honours an explicit title and wordCount', async () => {
    const service = createNoteService({ store: fresh() })
    const created = await service.create({ id: 'note-x', title: '自定义', content: '一二三', wordCount: 1 })
    expect(created.value.title).toBe('自定义')
    expect(created.value.wordCount).toBe(1)
  })

  it('rejects empty content', async () => {
    const service = createNoteService({ store: fresh() })
    const empty = await service.create({ content: '   ' })
    expect(empty.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.list()).value).toEqual([])
  })

  it('inserts newest first and rejects duplicate id', async () => {
    const service = createNoteService({ store: fresh() })
    await service.create({ id: 'a', content: 'A' })
    await service.create({ id: 'b', content: 'B' })
    expect((await service.list()).value.map((n) => n.id)).toEqual(['b', 'a'])
    const dup = await service.create({ id: 'a', content: 'again' })
    expect(dup.error.code).toBe(CORE_ERROR_CODES.DUPLICATE_NOTE)
  })

  it('recomputes word count on content update and keeps title', async () => {
    const service = createNoteService({ store: fresh() })
    await service.create({ id: 'u1', title: '固定标题', content: '短' })
    const updated = await service.update('u1', { content: '一二三四五' })
    expect(updated.ok).toBe(true)
    expect(updated.value.content).toBe('一二三四五')
    expect(updated.value.wordCount).toBe(5)
    expect(updated.value.title).toBe('固定标题')
    expect(typeof updated.value.updatedAt).toBe('string')
  })

  it('rejects empty content and no-op updates', async () => {
    const service = createNoteService({ store: fresh() })
    await service.create({ id: 'u2', content: 'x' })
    expect((await service.update('u2', { content: '  ' })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.update('u2', { source: {} })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.update('ghost', { content: 'y' })).error.code).toBe(CORE_ERROR_CODES.NOTE_NOT_FOUND)
  })

  it('removes a note and preserves normalized source', async () => {
    const store = createMemoryNoteStore({ notes: [{ id: 'r1', content: '正文', source: { assetId: 'ast', projectId: 'p1' } }] })
    const service = createNoteService({ store })
    const read = await service.read('r1')
    expect(read.value.source).toMatchObject({ type: 'manual', assetId: 'ast', projectId: 'p1', messageIds: [] })
    expect((await service.remove('r1')).ok).toBe(true)
    expect((await service.remove('r1')).error.code).toBe(CORE_ERROR_CODES.NOTE_NOT_FOUND)
  })
})

describe('note domain rules + sync service', () => {
  it('counts CJK chars and english words together', () => {
    expect(countNoteWords('你好abc def')).toBe(4)
    expect(countNoteWords('')).toBe(0)
  })

  it('derives title from first non-empty line, capped at 18', () => {
    expect(deriveNoteTitle('  \n真正标题\n下一段')).toBe('真正标题')
    expect(deriveNoteTitle('一二三四五六七八九十一二三四五六七八九十一二')).toBe('一二三四五六七八九十一二三四五六七八')
    expect(deriveNoteTitle('   ')).toBe('')
  })

  it('validates update patch', () => {
    expect(buildNoteUpdatePatch({ title: ' a ' }).value).toEqual({ title: 'a' })
    expect(buildNoteUpdatePatch({}).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect(buildNoteUpdatePatch({ content: '  ' }).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('applies the same rules synchronously and guards the port', () => {
    const service = createSyncNoteService({ store: fresh(), idFactory: () => 'n-sync' })
    const created = service.create({ content: '同步素材一二三' })
    expect(created.value.id).toBe('n-sync')
    expect(created.value.wordCount).toBe(7)
    expect(service.update('n-sync', { title: '改名' }).value.wordCount).toBe(7)
    expect(service.remove('n-sync').ok).toBe(true)
    expect(() => createNoteService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncNoteService({ store: { list() {} } })).toThrow(TypeError)
  })
})
