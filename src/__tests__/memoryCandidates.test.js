import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  confirmMemoryCandidate,
  createMemoryCandidate,
  getMemoryKindLabel,
  listMemoryCandidates,
  queueMemoryCandidate,
  rejectMemoryCandidate
} from '@/services/memoryCandidates'

describe('memoryCandidates', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  })

  it('queues normalized pending candidates', () => {
    const result = queueMemoryCandidate({
      content: '角色记住了新的线索。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })

    expect(result.success).toBe(true)
    expect(result.candidate.status).toBe('pending')
    expect(listMemoryCandidates({ scope: 'session', scopeId: 'session-1' })).toHaveLength(1)
  })

  it('updates candidate status', () => {
    const candidate = createMemoryCandidate({
      content: '偏好：使用简洁对白。',
      scope: 'global-author',
      kind: 'author-preference'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const confirmed = confirmMemoryCandidate(candidate.id)
    expect(confirmed.status).toBe('active')

    const rejected = rejectMemoryCandidate(candidate.id)
    expect(rejected.status).toBe('rejected')
  })

  it('exposes readable labels', () => {
    expect(getMemoryKindLabel('style-sample')).toBe('风格样本')
  })
})
