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
import { compactMemoryText, recordMemory } from '../services/api'

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

  it('compacts narrative dialogue before queueing memory', async () => {
    await recordMemory('林霁舰长沉声说：“所有人立刻撤离。”警报声在走廊里回荡。', 'dialogue', {
      scope: 'session',
      scopeId: 'session-x'
    })

    const payload = queueMemoryCandidateMock.mock.calls[0][0]
    expect(payload.content).toBe('对话：林霁舰长：所有人立刻撤离。')
    expect(payload.metadata.sourceLength).toBeGreaterThan(payload.content.length)
  })

  it('extracts compact location facts', () => {
    expect(compactMemoryText('众人终于抵达旧书店，门口挂着褪色的铜铃。', 'location_discovery'))
      .toBe('地点：旧书店')
  })
})
