import { describe, expect, it } from 'vitest'
import {
  createMaterialService,
  createSyncMaterialService,
  createMemoryMaterialStore,
  normalizeMaterialKind,
  normalizeMaterialStatus,
  deriveMaterialTitle,
  CORE_ERROR_CODES
} from '../src/index.js'

const fresh = () => createMemoryMaterialStore({ materials: [] })

describe('material service (async)', () => {
  it('normalizes kind/status and derives a 24-char title on create', async () => {
    const service = createMaterialService({ store: fresh() })
    const content = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十'
    const created = await service.create({ content })
    expect(created.ok).toBe(true)
    expect(created.value.kind).toBe('inspiration')
    expect(created.value.status).toBe('inbox')
    expect(created.value.title).toBe(content.slice(0, 24))
  })

  it('keeps a valid kind/status and explicit title', async () => {
    const service = createMaterialService({ store: fresh() })
    const created = await service.create({ title: '事件A', kind: 'event', status: 'accepted', content: '正文' })
    expect(created.value).toMatchObject({ title: '事件A', kind: 'event', status: 'accepted' })
  })

  it('rejects empty content', async () => {
    const service = createMaterialService({ store: fresh() })
    expect((await service.create({ content: '  ' })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('dedupes by contentHash when requested', async () => {
    const service = createMaterialService({ store: fresh() })
    const first = await service.create({ id: 'm1', content: '甲', contentHash: 'h1' })
    const second = await service.create({ id: 'm2', content: '乙', contentHash: 'h1' }, { dedupe: true })
    expect(second.ok).toBe(true)
    expect(second.value.id).toBe('m1')
    expect(second.value.deduped).toBe(true)
    expect(first.value.id).toBe('m1')
    expect((await service.list()).value).toHaveLength(1)
  })

  it('lists newest-first and filters by status/kind/projectId', async () => {
    const store = fresh()
    const service = createMaterialService({ store })
    await service.create({ id: 'a', content: 'A', kind: 'event', createdAt: 100 })
    await service.create({ id: 'b', content: 'B', kind: 'inspiration', status: 'rejected', createdAt: 200, projectId: 'p1' })
    expect((await service.list()).value.map((m) => m.id)).toEqual(['b', 'a'])
    expect((await service.list({ kind: 'event' })).value.map((m) => m.id)).toEqual(['a'])
    expect((await service.list({ activeOnly: true })).value.map((m) => m.id)).toEqual(['a'])
    expect((await service.list({ status: 'rejected' })).value.map((m) => m.id)).toEqual(['b'])
    expect((await service.list({ projectId: 'p1' })).value.map((m) => m.id)).toEqual(['b'])
  })

  it('updates status via setStatus, rejects an illegal status, and rejects a no-op update', async () => {
    const service = createMaterialService({ store: fresh() })
    await service.create({ id: 'u', content: 'x' })
    expect((await service.setStatus('u', 'accepted')).value.status).toBe('accepted')
    expect((await service.setStatus('u', 'bogus')).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
    expect((await service.update('u', { source: {} })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('re-derives nothing but recomputes updatedAt on content update; rejects empty content', async () => {
    const service = createMaterialService({ store: fresh() })
    await service.create({ id: 'c', content: '旧', kind: 'event' })
    const updated = await service.update('c', { content: '新内容' })
    expect(updated.value.content).toBe('新内容')
    expect(updated.value.kind).toBe('event')
    expect(typeof updated.value.updatedAt).toBe('number')
    expect((await service.update('c', { content: '  ' })).error.code).toBe(CORE_ERROR_CODES.INVALID_INPUT)
  })

  it('removes and reports missing', async () => {
    const service = createMaterialService({ store: fresh() })
    await service.create({ id: 'r', content: 'x' })
    expect((await service.remove('r')).ok).toBe(true)
    expect((await service.read('r')).error.code).toBe(CORE_ERROR_CODES.MATERIAL_NOT_FOUND)
  })
})

describe('material domain rules + sync service', () => {
  it('normalizes kind/status to whitelist defaults', () => {
    expect(normalizeMaterialKind('event')).toBe('event')
    expect(normalizeMaterialKind('nope')).toBe('inspiration')
    expect(normalizeMaterialStatus('accepted')).toBe('accepted')
    expect(normalizeMaterialStatus('nope')).toBe('inbox')
  })

  it('derives title capped at 24', () => {
    expect(deriveMaterialTitle('  \n标题行\n下一段')).toBe('标题行')
    expect(deriveMaterialTitle('')).toBe('')
  })

  it('applies the same rules synchronously and guards the port', () => {
    const service = createSyncMaterialService({ store: fresh(), idFactory: () => 'm-sync' })
    const created = service.create({ content: '同步资料' })
    expect(created.value.id).toBe('m-sync')
    expect(service.setStatus('m-sync', 'accepted').value.status).toBe('accepted')
    expect(service.remove('m-sync').ok).toBe(true)
    expect(() => createMaterialService({ store: { list() {} } })).toThrow(TypeError)
    expect(() => createSyncMaterialService({ store: { list() {} } })).toThrow(TypeError)
  })
})
