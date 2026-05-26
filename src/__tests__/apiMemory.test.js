import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/memoryCandidates', () => ({
  queueMemoryCandidate: vi.fn(() => ({
    success: true,
    candidate: {
      kind: 'plot-event',
      scope: 'session',
      scopeId: 'session-1'
    }
  })),
  getMemoryKindLabel: vi.fn(() => '剧情事件')
}))

import { queueMemoryCandidate } from '../services/memoryCandidates'
import { recordMemory } from '../services/api'

const queueMemoryCandidateMock = vi.mocked(queueMemoryCandidate)

describe('recordMemory', () => {
  beforeEach(() => {
    queueMemoryCandidateMock.mockClear()
    localStorage.removeItem('preference_user_id')
  })

  it('queues a candidate instead of writing directly', async () => {
    const result = await recordMemory('一段记忆', 'dialogue', {
      scope: 'session',
      scopeId: 'session-x'
    })

    expect(result.recorded).toBe(true)
    expect(queueMemoryCandidateMock).toHaveBeenCalled()
  })

  it('defaults preference memories to the global author scope', async () => {
    await recordMemory('我更喜欢简洁的表达。', 'preference')

    const payload = queueMemoryCandidateMock.mock.calls[0][0]
    expect(payload.scope).toBe('global-author')
    expect(payload.scopeId).toBeTruthy()
  })

  it('uses project scope when project context is provided', async () => {
    await recordMemory('地点：旧书店', 'location', {
      projectId: 'project-7'
    })

    const payload = queueMemoryCandidateMock.mock.calls[0][0]
    expect(payload.scope).toBe('project')
    expect(payload.scopeId).toBe('project-7')
  })
})
