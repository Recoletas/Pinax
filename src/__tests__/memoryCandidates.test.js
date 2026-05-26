import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  buildScopedMemoryContext,
  confirmMemoryCandidate,
  createMemoryCandidate,
  getMemoryKindLabel,
  listScopedActiveMemoryCandidates,
  listMemoryCandidates,
  queueMemoryCandidate,
  rejectMemoryCandidate,
  updateMemoryCandidate
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

  it('updates candidate fields including scopeId and content', () => {
    const candidate = createMemoryCandidate({
      content: '旧内容',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const updated = updateMemoryCandidate(candidate.id, {
      content: '整理后的内容',
      scope: 'project',
      scopeId: 'project-7',
      kind: 'project-fact'
    })

    expect(updated.content).toBe('整理后的内容')
    expect(updated.scope).toBe('project')
    expect(updated.scopeId).toBe('project-7')
    expect(updated.kind).toBe('project-fact')
  })

  it('exposes readable labels', () => {
    expect(getMemoryKindLabel('style-sample')).toBe('风格样本')
  })

  it('builds scoped context only from active matching memories', () => {
    const records = [
      createMemoryCandidate({
        content: '作者偏好短句。',
        scope: 'global-author',
        scopeId: 'author-1',
        kind: 'author-preference',
        status: 'active',
        createdAt: 4
      }),
      createMemoryCandidate({
        content: '旧书店在西街。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        status: 'active',
        createdAt: 3
      }),
      createMemoryCandidate({
        content: '主角刚拿到铜钥匙。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        createdAt: 2
      }),
      createMemoryCandidate({
        content: '其他作品的资料。',
        scope: 'project',
        scopeId: 'project-2',
        kind: 'project-fact',
        status: 'active',
        createdAt: 1
      }),
      createMemoryCandidate({
        content: '待确认内容不应该进入上下文。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'pending',
        createdAt: 5
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const scoped = listScopedActiveMemoryCandidates({
      authorId: 'author-1',
      projectId: 'project-1',
      sessionId: 'session-1'
    })
    expect(scoped.map((item) => item.content)).toEqual([
      '作者偏好短句。',
      '旧书店在西街。',
      '主角刚拿到铜钥匙。'
    ])

    const context = buildScopedMemoryContext({
      authorId: 'author-1',
      projectId: 'project-1',
      sessionId: 'session-1'
    })

    expect(context).toContain('全局作者记忆')
    expect(context).toContain('作者偏好短句。')
    expect(context).toContain('旧书店在西街。')
    expect(context).toContain('主角刚拿到铜钥匙。')
    expect(context).not.toContain('其他作品的资料')
    expect(context).not.toContain('待确认内容')
  })
})
