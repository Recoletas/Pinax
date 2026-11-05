import { describe, expect, it } from 'vitest'
import {
  createOutlineNodeService,
  createSyncOutlineNodeService,
  createMemoryOutlineNodeStore,
  applyOutlineNodePatch,
  OUTLINE_NODE_MUTABLE_FIELDS,
  CORE_ERROR_CODES
} from '../src/index.js'

const B = 'book-1'

function freshStore() {
  return createMemoryOutlineNodeStore({ buckets: new Map() })
}

describe('outline node service (async)', () => {
  it('lists empty for a book without outline', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    expect((await service.list(B)).value).toEqual([])
  })

  it('creates a node at revision 1 and summarizes the tree', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    const created = await service.create(B, { id: 'n1', title: '开端', parentId: '', order: 0 })
    expect(created.ok).toBe(true)
    expect(created.value).toMatchObject({ id: 'n1', title: '开端', revision: 1, parentId: null })

    const listed = await service.list(B)
    expect(listed.value).toEqual([
      { id: 'n1', title: '开端', parentId: null, order: 0, status: 'exploring', revision: 1 }
    ])
  })

  it('updates mutable fields, bumps revision, and preserves host-rich refs', async () => {
    const store = createMemoryOutlineNodeStore({
      buckets: new Map([[B, [{ id: 'n2', title: '旧', revision: 3, chapterRefs: ['c1'], injection: { note: 'x' } }]]])
    })
    const service = createOutlineNodeService({ store })
    const updated = await service.update(B, 'n2', { expectedRevision: 3, title: '  新标题  ', order: 5 })
    expect(updated.ok).toBe(true)
    expect(updated.value.title).toBe('新标题')
    expect(updated.value.order).toBe(5)
    expect(updated.value.revision).toBe(4)
    expect(updated.value.chapterRefs).toEqual(['c1'])
    expect(updated.value.injection).toEqual({ note: 'x' })
  })

  it('rejects a stale update without writing', async () => {
    const store = createMemoryOutlineNodeStore({ buckets: new Map([[B, [{ id: 'n3', title: 'a', revision: 2 }]]]) })
    const service = createOutlineNodeService({ store })
    const stale = await service.update(B, 'n3', { expectedRevision: 1, title: 'b' })
    expect(stale.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    expect(store.snapshot(B)[0].title).toBe('a')
  })

  it('rejects reparenting (deferred to the reorder usecase)', async () => {
    const store = createMemoryOutlineNodeStore({ buckets: new Map([[B, [{ id: 'n4', title: 'a', revision: 1 }]]]) })
    const service = createOutlineNodeService({ store })
    const bad = await service.update(B, 'n4', { expectedRevision: 1, parentId: 'other' })
    expect(bad.ok).toBe(false)
    expect(bad.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('rejects an update that changes nothing writable', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    await service.create(B, { id: 'n5', title: 'a' })
    const empty = await service.update(B, 'n5', { expectedRevision: 1 })
    expect(empty.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('enforces expectedRevision on remove and reports missing nodes', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    await service.create(B, { id: 'n6', title: 'a' })
    const staleRemove = await service.remove(B, 'n6', { expectedRevision: 0 })
    expect(staleRemove.error.code).toBe(CORE_ERROR_CODES.STALE_REVISION)
    expect((await service.list(B)).value).toHaveLength(1)

    expect((await service.remove(B, 'n6', { expectedRevision: 1 })).ok).toBe(true)
    expect((await service.read(B, 'n6')).error.code).toBe(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND)
  })

  it('rejects a duplicate node id', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    await service.create(B, { id: 'dup', title: 'A' })
    expect((await service.create(B, { id: 'dup', title: 'B' })).error.code).toBe(CORE_ERROR_CODES.DUPLICATE_OUTLINE_NODE)
  })
})

describe('outline node service (sync) + patch validator', () => {
  it('applies the same rules synchronously for localStorage hosts', () => {
    const service = createSyncOutlineNodeService({ store: freshStore(), idFactory: () => 'n-sync' })
    const created = service.create(B, { title: '同步节点' })
    expect(created.ok).toBe(true)
    expect(created.value.id).toBe('n-sync')
    const updated = service.update(B, 'n-sync', { expectedRevision: 1, status: 'planned' })
    expect(updated.value.status).toBe('planned')
    expect(service.remove(B, 'n-sync', { expectedRevision: 2 }).ok).toBe(true)
    expect(service.list(B).value).toEqual([])
  })

  it('throws when the store does not implement the OutlineNodeStore port', () => {
    expect(() => createOutlineNodeService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncOutlineNodeService({ store: { list() {} } })).toThrow(TypeError)
  })

  it('validates the patch at the domain layer', () => {
    expect(applyOutlineNodePatch({ id: 'x', revision: 1 }, { title: ' y ' }, { expectedRevision: 1, now: 'T' }).value)
      .toMatchObject({ title: 'y', revision: 2, updatedAt: 'T' })
    expect(applyOutlineNodePatch({ id: 'x', revision: 1 }, { order: 'NaN' }, { expectedRevision: 1 }).error.code)
      .toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect(OUTLINE_NODE_MUTABLE_FIELDS).not.toContain('parentId')
  })
})
