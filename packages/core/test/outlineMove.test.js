import { describe, expect, it } from 'vitest'
import {
  createOutlineNodeService,
  createSyncOutlineNodeService,
  createMemoryOutlineNodeStore,
  planOutlineMove,
  isDescendantOrSelf,
  CORE_ERROR_CODES
} from '../src/index.js'

const B = 'book-1'

async function withNodes(nodes) {
  const store = createMemoryOutlineNodeStore({ buckets: new Map([[B, nodes]]) })
  return createOutlineNodeService({ store })
}

describe('outline node move (reparent + reorder, cycle-safe)', () => {
  it('reparents a node under another and bumps revision', async () => {
    const service = createOutlineNodeService({ store: freshStore() })
    await service.create(B, { id: 'n1', title: '卷一' })
    await service.create(B, { id: 'n2', title: '章一' })
    const moved = await service.move(B, 'n2', { parentId: 'n1', expectedRevision: 1 })
    expect(moved.ok).toBe(true)
    expect(moved.value).toMatchObject({ id: 'n2', parentId: 'n1', revision: 2 })
  })

  it('rejects moving a node under its own descendant', async () => {
    const service = await withNodes([
      { id: 'root', parentId: null, revision: 1 },
      { id: 'mid', parentId: 'root', revision: 1 },
      { id: 'leaf', parentId: 'mid', revision: 1 }
    ])
    const cycle = await service.move(B, 'root', { parentId: 'leaf', expectedRevision: 1 })
    expect(cycle.error.code).toBe(CORE_ERROR_CODES.OUTLINE_CYCLE)
  })

  it('rejects moving a node under itself', async () => {
    const service = await withNodes([{ id: 'a', parentId: null, revision: 1 }])
    expect((await service.move(B, 'a', { parentId: 'a', expectedRevision: 1 })).error.code)
      .toBe(CORE_ERROR_CODES.OUTLINE_CYCLE)
  })

  it('rejects an unknown target parent', async () => {
    const service = await withNodes([{ id: 'a', parentId: null, revision: 1 }])
    expect((await service.move(B, 'a', { parentId: 'ghost', expectedRevision: 1 })).error.code)
      .toBe(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND)
  })

  it('rejects a stale move and can promote to root with an order', async () => {
    const service = await withNodes([
      { id: 'a', parentId: null, revision: 1 },
      { id: 'b', parentId: 'a', revision: 1 }
    ])
    expect((await service.move(B, 'b', { parentId: 'a', expectedRevision: 5 })).error.code)
      .toBe(CORE_ERROR_CODES.STALE_REVISION)

    const toRoot = await service.move(B, 'b', { parentId: '', order: 3, expectedRevision: 1 })
    expect(toRoot.ok).toBe(true)
    expect(toRoot.value).toMatchObject({ parentId: null, order: 3, revision: 2 })
  })

  it('detects descendant relationships in the pure helper', () => {
    const nodes = [{ id: 'x', parentId: null }, { id: 'y', parentId: 'x' }, { id: 'z', parentId: 'y' }]
    expect(isDescendantOrSelf(nodes, 'z', 'x')).toBe(true)
    expect(isDescendantOrSelf(nodes, 'x', 'z')).toBe(false)
    expect(isDescendantOrSelf(nodes, 'x', 'x')).toBe(true)
    expect(planOutlineMove(nodes, { nodeId: 'y', parentId: 'z', expectedRevision: 0 }).error.code)
      .toBe(CORE_ERROR_CODES.OUTLINE_CYCLE)
  })

  it('applies the same guard synchronously', () => {
    const store = createMemoryOutlineNodeStore({ buckets: new Map([[B, [{ id: 'p', revision: 1 }, { id: 'c', parentId: 'p', revision: 1 }]]]) })
    const service = createSyncOutlineNodeService({ store })
    expect(service.move(B, 'p', { parentId: 'c', expectedRevision: 1 }).error.code)
      .toBe(CORE_ERROR_CODES.OUTLINE_CYCLE)
    expect(service.move(B, 'c', { parentId: '', expectedRevision: 1 }).ok).toBe(true)
  })
})

function freshStore() {
  return createMemoryOutlineNodeStore({ buckets: new Map() })
}
