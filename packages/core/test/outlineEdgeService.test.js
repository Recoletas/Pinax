import { describe, expect, it } from 'vitest'
import {
  createOutlineEdgeService,
  createSyncOutlineEdgeService,
  createMemoryOutlineEdgeStore,
  CORE_ERROR_CODES
} from '../src/index.js'

const B = 'book-1'

function freshStore() {
  return createMemoryOutlineEdgeStore({ buckets: new Map() })
}

describe('outline edge service (async)', () => {
  it('lists empty for a book without edges', async () => {
    const service = createOutlineEdgeService({ store: freshStore() })
    expect((await service.list(B)).value).toEqual([])
  })

  it('adds an edge with a generated id and default kind', async () => {
    const service = createOutlineEdgeService({ store: freshStore(), idFactory: () => 'edge-1' })
    const added = await service.add(B, { fromNodeId: 'n1', toNodeId: 'n2' })
    expect(added.ok).toBe(true)
    expect(added.value).toMatchObject({ id: 'edge-1', kind: 'causes', fromNodeId: 'n1', toNodeId: 'n2' })

    const listed = await service.list(B)
    expect(listed.value).toEqual([{ id: 'edge-1', kind: 'causes', fromNodeId: 'n1', toNodeId: 'n2' }])
  })

  it('dedupes by (kind, from, to) even with a different id', async () => {
    const service = createOutlineEdgeService({ store: freshStore() })
    await service.add(B, { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'causes' })
    const dup = await service.add(B, { id: 'e2', fromNodeId: 'n1', toNodeId: 'n2', kind: 'causes' })
    expect(dup.ok).toBe(false)
    expect(dup.error.code).toBe(CORE_ERROR_CODES.DUPLICATE_OUTLINE_EDGE)
  })

  it('rejects a self-loop and a missing endpoint', async () => {
    const service = createOutlineEdgeService({ store: freshStore() })
    const loop = await service.add(B, { id: 'e3', fromNodeId: 'n1', toNodeId: 'n1' })
    expect(loop.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    const missing = await service.add(B, { id: 'e4', fromNodeId: 'n1' })
    expect(missing.error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.list(B)).value).toEqual([])
  })

  it('normalizes legacy `from`/`to` keys', async () => {
    const store = createMemoryOutlineEdgeStore({ buckets: new Map([[B, [{ id: 'old', from: 'a', to: 'b' }]]]) })
    const service = createOutlineEdgeService({ store })
    const listed = await service.list(B)
    expect(listed.value).toEqual([{ id: 'old', kind: 'causes', fromNodeId: 'a', toNodeId: 'b' }])
  })

  it('removes an edge and reports a missing one', async () => {
    const service = createOutlineEdgeService({ store: freshStore() })
    await service.add(B, { id: 'e5', fromNodeId: 'n1', toNodeId: 'n2' })
    expect((await service.remove(B, 'e5')).ok).toBe(true)
    const gone = await service.remove(B, 'e5')
    expect(gone.error.code).toBe(CORE_ERROR_CODES.OUTLINE_EDGE_NOT_FOUND)
  })
})

describe('outline edge service (sync)', () => {
  it('applies the same rules synchronously', () => {
    const service = createSyncOutlineEdgeService({ store: freshStore() })
    expect(service.add(B, { id: 's1', fromNodeId: 'x', toNodeId: 'y' }).ok).toBe(true)
    expect(service.add(B, { id: 's2', fromNodeId: 'x', toNodeId: 'y' }).error.code).toBe(CORE_ERROR_CODES.DUPLICATE_OUTLINE_EDGE)
    expect(service.remove(B, 's1').ok).toBe(true)
    expect(service.list(B).value).toEqual([])
  })

  it('throws when the store does not implement the OutlineEdgeStore port', () => {
    expect(() => createOutlineEdgeService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncOutlineEdgeService({ store: { list() {} } })).toThrow(TypeError)
  })
})
