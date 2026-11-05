import { describe, expect, it } from 'vitest'
import {
  createWorldbookEntryService,
  createSyncWorldbookEntryService,
  createMemoryWorldbookEntryStore,
  validateWorldbookEntryPatch,
  CORE_ERROR_CODES
} from '../src/index.js'

const WB = 'wb-1'

function freshStore() {
  return createMemoryWorldbookEntryStore({ buckets: new Map() })
}

describe('worldbook entry service (async)', () => {
  it('lists empty for an unknown worldbook', async () => {
    const service = createWorldbookEntryService({ store: freshStore() })
    const listed = await service.list(WB)
    expect(listed.ok).toBe(true)
    expect(listed.value).toEqual([])
  })

  it('creates an entry and reports it in the summary list', async () => {
    const service = createWorldbookEntryService({ store: freshStore() })
    const created = await service.create(WB, { id: 'e1', name: '主角', content: '张三,剑客' })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({ id: 'e1', name: '主角', content: '张三,剑客', worldbookId: WB })

    const listed = await service.list(WB)
    expect(listed.value).toEqual([
      { id: 'e1', name: '主角', worldbookId: WB, updatedAt: created.value.updatedAt }
    ])
  })

  it('falls back to legacy `title` for name and preserves host extras', async () => {
    const store = createMemoryWorldbookEntryStore({
      buckets: new Map([[WB, [{ id: 'e2', title: '旧字段名', content: '正文', injection: { group: '人物' } }]]])
    })
    const service = createWorldbookEntryService({ store })
    const read = await service.read(WB, 'e2')
    expect(read.ok).toBe(true)
    expect(read.value.name).toBe('旧字段名')
    expect(read.value.injection).toEqual({ group: '人物' })
  })

  it('updates name/content, refreshes updatedAt, and keeps extras', async () => {
    const store = createMemoryWorldbookEntryStore({
      buckets: new Map([[WB, [{ id: 'e3', name: '旧', content: '旧文', category: '设定' }]]])
    })
    const service = createWorldbookEntryService({ store })
    const updated = await service.update(WB, 'e3', { name: '  新名  ', content: '新文' })
    expect(updated.ok).toBe(true)
    expect(updated.value.name).toBe('新名')
    expect(updated.value.content).toBe('新文')
    expect(updated.value.category).toBe('设定')
    expect(typeof updated.value.updatedAt).toBe('string')
  })

  it('rejects an update that changes neither name nor content', async () => {
    const store = createMemoryWorldbookEntryStore({ buckets: new Map([[WB, [{ id: 'e4', name: 'x', content: 'y' }]]]) })
    const service = createWorldbookEntryService({ store })
    const bad = await service.update(WB, 'e4', { category: '改了别的' })
    expect(bad.ok).toBe(false)
    expect(bad.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect(store.snapshot(WB)[0].category).toBeUndefined()
  })

  it('rejects a duplicate entry id', async () => {
    const service = createWorldbookEntryService({ store: freshStore() })
    await service.create(WB, { id: 'dup', name: 'A' })
    const again = await service.create(WB, { id: 'dup', name: 'B' })
    expect(again.ok).toBe(false)
    expect(again.error.code).toBe(CORE_ERROR_CODES.DUPLICATE_ENTRY)
  })

  it('reports missing entries on read and remove', async () => {
    const service = createWorldbookEntryService({ store: freshStore() })
    const missingRead = await service.read(WB, 'nope')
    expect(missingRead.error.code).toBe(CORE_ERROR_CODES.ENTRY_NOT_FOUND)
    const missingRemove = await service.remove(WB, 'nope')
    expect(missingRemove.error.code).toBe(CORE_ERROR_CODES.ENTRY_NOT_FOUND)
  })

  it('removes an existing entry', async () => {
    const service = createWorldbookEntryService({ store: freshStore() })
    await service.create(WB, { id: 'gone', name: 'X' })
    const removed = await service.remove(WB, 'gone')
    expect(removed.ok).toBe(true)
    expect((await service.list(WB)).value).toEqual([])
  })
})

describe('worldbook entry service (sync) + patch validator', () => {
  it('applies the same rules synchronously for localStorage hosts', () => {
    const service = createSyncWorldbookEntryService({ store: freshStore(), idFactory: () => 'e-sync' })
    const created = service.create(WB, { name: '同步条目', content: '文' })
    expect(created.ok).toBe(true)
    expect(created.value.id).toBe('e-sync')
    const updated = service.update(WB, 'e-sync', { content: '改文' })
    expect(updated.value.content).toBe('改文')
    expect(service.remove(WB, 'e-sync').ok).toBe(true)
    expect(service.list(WB).value).toEqual([])
  })

  it('throws when the store does not implement the WorldbookEntryStore port', () => {
    expect(() => createWorldbookEntryService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncWorldbookEntryService({ store: { list() {} } })).toThrow(TypeError)
  })

  it('validates the patch input shape', () => {
    expect(validateWorldbookEntryPatch({ name: ' a ' }).value).toEqual({ name: 'a' })
    expect(validateWorldbookEntryPatch({ content: '正文' }).ok).toBe(true)
    expect(validateWorldbookEntryPatch({}).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect(validateWorldbookEntryPatch({ name: 42 }).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })
})
