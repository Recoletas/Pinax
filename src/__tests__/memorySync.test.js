import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  useMem0: vi.fn(),
  storeMemory: vi.fn(),
  searchMemories: vi.fn(),
  getUserId: vi.fn(() => 'user-1')
}))

vi.mock('@/services/api', () => ({
  default: { post: mocks.apiPost },
  getOrCreatePreferenceUserId: mocks.getUserId
}))

vi.mock('@/composables/useMem0', () => ({
  default: mocks.useMem0
}))

import {
  buildMem0MemoryContext,
  describeMem0SyncResult,
  syncConfirmedMemoryCandidateToMem0
} from '@/services/memorySync'

function setMem0Local({ apiKey, host } = {}) {
  // mem0 config is per-browser; memorySync reads it from localStorage.
  localStorage.setItem(STORAGE_KEYS.MEM0_SETTINGS, JSON.stringify({ apiKey: apiKey || '', host: host || '' }))
}

describe('memorySync', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEM0_SETTINGS)
    mocks.apiPost.mockReset()
    mocks.useMem0.mockReset()
    mocks.storeMemory.mockReset()
    mocks.searchMemories.mockReset()
    mocks.getUserId.mockClear()
  })

  it('skips when mem0 is not configured', async () => {
    setMem0Local({ apiKey: '', host: 'https://api.mem0.ai' })

    const result = await syncConfirmedMemoryCandidateToMem0({
      id: 'mem-1',
      content: '作者偏好短句。',
      kind: 'author-preference',
      scope: 'global-author',
      scopeId: 'author-1',
      status: 'active'
    })

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('mem0-not-configured')
    expect(result.syncStatus).toBe('local-only')
    expect(mocks.useMem0).not.toHaveBeenCalled()
    expect(describeMem0SyncResult(result)).toBe('本地保留，未配置 mem0')
  })

  it('syncs an active candidate into mem0', async () => {
    setMem0Local({ apiKey: 'm0-key', host: 'https://mem0.example' })
    mocks.storeMemory.mockResolvedValue({
      success: true,
      data: { id: 'remote-mem-1' }
    })
    mocks.searchMemories.mockResolvedValue([])
    mocks.useMem0.mockReturnValue({
      searchMemories: mocks.searchMemories,
      storeMemory: mocks.storeMemory
    })

    const result = await syncConfirmedMemoryCandidateToMem0({
      id: 'mem-2',
      content: '旧书店在西街。',
      kind: 'project-fact',
      scope: 'project',
      scopeId: 'project-1',
      status: 'active',
      sourceRef: 'gameStore:1:2',
      metadata: { extra: 'keep' }
    })

    expect(result.success).toBe(true)
    expect(result.syncStatus).toBe('synced')
    expect(result.remoteId).toBe('remote-mem-1')
    expect(result.syncedAt).toEqual(expect.any(Number))
    expect(mocks.useMem0).toHaveBeenCalledWith({
      apiUrl: 'https://mem0.example/v1',
      userId: 'user-1',
      apiKey: 'm0-key'
    })
    expect(mocks.storeMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: '旧书店在西街。',
      type: 'project-fact',
      entityId: 'mem-2',
      scope: 'project',
      scopeId: 'project-1',
      importance: 8,
      metadata: expect.objectContaining({
        kind: 'project-fact',
        scope: 'project',
        scopeId: 'project-1',
        sourceRef: 'gameStore:1:2',
        candidateId: 'mem-2',
        status: 'active',
        extra: 'keep'
      })
    }))
    expect(describeMem0SyncResult(result)).toBe('已同步到 mem0')
  })

  it('reuses an exact remote duplicate before storing', async () => {
    setMem0Local({ apiKey: 'm0-key', host: 'https://mem0.example' })
    mocks.searchMemories.mockResolvedValue([
      { id: 'remote-existing-1', memory: '旧书店 在 西街。' }
    ])
    mocks.useMem0.mockReturnValue({
      searchMemories: mocks.searchMemories,
      storeMemory: mocks.storeMemory
    })

    const result = await syncConfirmedMemoryCandidateToMem0({
      id: 'mem-remote-dup',
      content: '旧书店在西街。',
      kind: 'project-fact',
      scope: 'project',
      scopeId: 'project-1',
      status: 'active'
    })

    expect(result.success).toBe(true)
    expect(result.deduped).toBe(true)
    expect(result.remoteId).toBe('remote-existing-1')
    expect(mocks.searchMemories).toHaveBeenCalledWith('旧书店在西街。', expect.objectContaining({
      limit: 5,
      type: 'project-fact',
      scope: 'project',
      scopeId: 'project-1'
    }))
    expect(mocks.storeMemory).not.toHaveBeenCalled()
    expect(describeMem0SyncResult(result)).toBe('已匹配远端记忆')
  })

  it('reports mem0 sync failures', async () => {
    setMem0Local({ apiKey: 'm0-key', host: 'https://mem0.example' })
    mocks.storeMemory.mockResolvedValue({
      success: false,
      error: 'boom'
    })
    mocks.searchMemories.mockResolvedValue([])
    mocks.useMem0.mockReturnValue({
      searchMemories: mocks.searchMemories,
      storeMemory: mocks.storeMemory
    })

    const result = await syncConfirmedMemoryCandidateToMem0({
      id: 'mem-3',
      content: '玩家获得线索。',
      kind: 'plot-event',
      scope: 'session',
      scopeId: 'session-1',
      status: 'active'
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
    expect(result.syncStatus).toBe('failed')
    expect(describeMem0SyncResult(result)).toBe('mem0 同步失败')
  })

  it('builds a remote memory context by combining scoped fallbacks', async () => {
    setMem0Local({ apiKey: 'm0-key', host: 'https://mem0.example' })
    const buildMemoryContext = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('【project-fact】旧书店在西街。')
      .mockResolvedValueOnce('【author-preference】玩家不喜欢冗长描述。')
    mocks.useMem0.mockReturnValue({
      buildMemoryContext
    })

    const context = await buildMem0MemoryContext({
      currentSituation: '玩家在城镇里寻找线索。',
      authorId: 'author-1',
      projectId: 'project-1',
      sessionId: 'session-1'
    })

    expect(context).toContain('远端当前作品记忆')
    expect(context).toContain('远端全局作者记忆')
    expect(context).toContain('旧书店在西街。')
    expect(context).toContain('玩家不喜欢冗长描述。')
    expect(context).not.toContain('远端当前会话记忆')
    expect(buildMemoryContext).toHaveBeenCalledTimes(3)
    expect(buildMemoryContext.mock.calls[0][1]).toMatchObject({
      scope: 'session',
      scopeId: 'session-1'
    })
    expect(buildMemoryContext.mock.calls[1][1]).toMatchObject({
      scope: 'project',
      scopeId: 'project-1'
    })
    expect(buildMemoryContext.mock.calls[2][1]).toMatchObject({
      scope: 'global-author',
      scopeId: 'author-1'
    })
  })
})
