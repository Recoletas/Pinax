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
  })

  it('queues a candidate instead of writing directly', async () => {
    const result = await recordMemory('一段记忆', 'dialogue', {
      scope: 'session',
      scopeId: 'session-x'
    })

    expect(result.recorded).toBe(true)
    expect(queueMemoryCandidateMock).toHaveBeenCalled()
  })
})
