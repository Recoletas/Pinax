import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { useMem0 } from '@/composables/useMem0'

describe('useMem0 scope awareness', () => {
  beforeEach(() => {
    localStorage.removeItem('mem0_cache')
    localStorage.removeItem('mem0_sync_state')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores scope metadata with memory payload', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'mem-1' })
    })

    const { storeMemory } = useMem0({
      apiUrl: 'https://mem0.example',
      userId: 'user-1',
      apiKey: 'key-1'
    })

    await storeMemory({
      content: '偏好：尽量保持简洁。',
      type: 'preference',
      scope: 'global-author',
      scopeId: 'user-1',
      entityId: 'card-1',
      importance: 9,
      metadata: {
        extra: 'keep'
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.metadata).toMatchObject({
      type: 'preference',
      entityId: 'card-1',
      scope: 'global-author',
      scopeId: 'user-1',
      importance: 9,
      extra: 'keep'
    })
  })

  it('keeps search cache separate by scope and sends metadata filters', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            content: '旧书店在西街。',
            metadata: { type: 'project-fact' }
          }
        ]
      })
    })

    const { searchMemories } = useMem0({
      apiUrl: 'https://mem0.example',
      userId: 'user-1',
      apiKey: 'key-1'
    })

    const first = await searchMemories('旧书店', {
      type: 'location',
      scope: 'project',
      scopeId: 'project-7'
    })
    const second = await searchMemories('旧书店', {
      type: 'location',
      scope: 'project',
      scopeId: 'project-7'
    })
    const third = await searchMemories('旧书店', {
      type: 'location',
      scope: 'session',
      scopeId: 'session-1'
    })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(third).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstUrl = new URL(fetchMock.mock.calls[0][0])
    expect(firstUrl.searchParams.get('query')).toBe('旧书店')
    expect(JSON.parse(firstUrl.searchParams.get('metadata_filter'))).toMatchObject({
      type: 'location',
      scope: 'project',
      scopeId: 'project-7'
    })

    const secondUrl = new URL(fetchMock.mock.calls[1][0])
    expect(JSON.parse(secondUrl.searchParams.get('metadata_filter'))).toMatchObject({
      type: 'location',
      scope: 'session',
      scopeId: 'session-1'
    })
  })

  it('builds scoped memory context', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            content: '旧书店在西街。',
            metadata: { type: 'project-fact' }
          },
          {
            content: '玩家不喜欢冗长描述。',
            metadata: { type: 'author-preference' }
          }
        ]
      })
    })

    const { buildMemoryContext } = useMem0({
      apiUrl: 'https://mem0.example',
      userId: 'user-1',
      apiKey: 'key-1'
    })

    const context = await buildMemoryContext('当前在城市中心', {
      limit: 3,
      scope: 'project',
      scopeId: 'project-7'
    })

    expect(context).toContain('【project-fact】旧书店在西街。')
    expect(context).toContain('【author-preference】玩家不喜欢冗长描述。')

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(JSON.parse(url.searchParams.get('metadata_filter'))).toMatchObject({
      scope: 'project',
      scopeId: 'project-7'
    })
  })
})
