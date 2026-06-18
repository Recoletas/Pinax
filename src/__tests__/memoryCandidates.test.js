import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  batchUpdateMemoryCandidateScope,
  batchArchiveMemoryCandidates,
  buildScopedMemoryContext,
  buildScopedMemoryRecallContext,
  rankScopedActiveMemoryCandidates,
  MEMORY_RECALL_PREVIEW_LIMIT,
  archiveMemoryCandidate,
  confirmMemoryCandidate,
  createMemoryContentHash,
  createMemoryCandidate,
  findConflictingMemoryCandidates,
  findDuplicateMemoryCandidate,
  findSimilarMemoryCandidate,
  getMemoryKindLabel,
  getMemorySyncStatusLabel,
  listScopedActiveMemoryCandidates,
  listMemoryCandidates,
  queueMemoryCandidate,
  rejectMemoryCandidate,
  mergeMemoryCandidateConflicts,
  replaceMemoryCandidateConflicts,
  restoreMemoryCandidate,
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
    expect(result.candidate.syncStatus).toBe('pending')
    expect(result.candidate.contentHash).toBe(createMemoryContentHash('角色记住了新的线索。'))
    expect(listMemoryCandidates({ scope: 'session', scopeId: 'session-1' })).toHaveLength(1)
  })

  it('compacts long queued memories before storage', () => {
    const result = queueMemoryCandidate({
      content: '林霁舰长沉声说：“所有人立刻撤离。”警报声在走廊里回荡，主角意识到舰桥即将失守，必须立刻选择路线。',
      type: 'dialogue',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })

    expect(result.candidate.content).toBe('对话：林霁舰长：所有人立刻撤离。')
    expect(listMemoryCandidates()[0].content).toBe('对话：林霁舰长：所有人立刻撤离。')
  })

  it('compacts existing pending candidates when listing', () => {
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([{
      id: 'mem-long',
      schemaVersion: 1,
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event',
      content: '小说体验事件：警报声在舰桥响起，红色灯光铺满金属墙壁，林霁舰长要求所有人撤离，主角意识到旧航道已经被封锁，只能寻找备用通道。',
      confidence: 0.6,
      sourceRef: 'test',
      status: 'pending',
      syncStatus: 'pending',
      metadata: { sourceType: 'event' },
      createdAt: 1,
      updatedAt: 1
    }]))

    const [candidate] = listMemoryCandidates()

    expect(candidate.content.length).toBeLessThanOrEqual(75)
    expect(candidate.content).not.toContain('小说体验事件')
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
    expect(confirmed.syncStatus).toBe('local-only')

    const rejected = rejectMemoryCandidate(candidate.id)
    expect(rejected.status).toBe('rejected')
    expect(rejected.syncStatus).toBe('local-only')
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
    expect(getMemorySyncStatusLabel('synced')).toBe('已同步')
  })

  it('creates sync metadata with sensible defaults', () => {
    const pendingCandidate = createMemoryCandidate({
      content: '待确认内容',
      status: 'pending'
    })

    const activeCandidate = createMemoryCandidate({
      content: '已确认内容',
      status: 'active'
    })

    expect(pendingCandidate.syncStatus).toBe('pending')
    expect(activeCandidate.syncStatus).toBe('local-only')
  })

  it('batch updates selected candidate scopes', () => {
    const first = createMemoryCandidate({
      id: 'mem-1',
      content: '作者偏好短句。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'author-preference'
    })
    const second = createMemoryCandidate({
      id: 'mem-2',
      content: '作品里有一间旧书店。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'project-fact'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([first, second]))

    const result = batchUpdateMemoryCandidateScope(['mem-1', 'mem-2'], {
      scope: 'project',
      scopeId: 'project-7'
    })

    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(2)
    expect(result.updatedCandidates.every((item) => item.scope === 'project' && item.scopeId === 'project-7')).toBe(true)
    expect(listMemoryCandidates({ status: 'pending' }).every((item) => item.scope === 'project' && item.scopeId === 'project-7')).toBe(true)
  })

  it('clears scopeId when batch moving items to global author scope', () => {
    const candidate = createMemoryCandidate({
      id: 'mem-3',
      content: '临时偏好。',
      scope: 'project',
      scopeId: 'project-2',
      kind: 'author-preference'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const result = batchUpdateMemoryCandidateScope(['mem-3'], {
      scope: 'global-author'
    })

    expect(result.success).toBe(true)
    expect(result.updatedCandidates[0].scope).toBe('global-author')
    expect(result.updatedCandidates[0].scopeId).toBe('')
  })

  it('rejects batch scope changes without a required scopeId', () => {
    const candidate = createMemoryCandidate({
      id: 'mem-4',
      content: '需要作品 scope。',
      scope: 'session',
      scopeId: 'session-2',
      kind: 'project-fact'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const result = batchUpdateMemoryCandidateScope(['mem-4'], {
      scope: 'project'
    })

    expect(result.success).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('missing-scope-id')
  })

  it('archives candidates into stale items with previous status metadata', () => {
    const candidate = createMemoryCandidate({
      id: 'mem-5',
      content: '临时笔记。',
      scope: 'session',
      scopeId: 'session-5',
      kind: 'plot-event'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const result = archiveMemoryCandidate('mem-5', {
      note: '先归档'
    })

    expect(result.success).toBe(true)
    expect(result.candidate.status).toBe('stale')
    expect(result.candidate.syncStatus).toBe('local-only')
    expect(result.candidate.metadata.previousStatus).toBe('pending')
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toContain('mem-5')
  })

  it('batch archives selected candidates', () => {
    const first = createMemoryCandidate({
      id: 'mem-6',
      content: '临时偏好一。',
      scope: 'project',
      scopeId: 'project-6',
      kind: 'author-preference'
    })
    const second = createMemoryCandidate({
      id: 'mem-7',
      content: '临时偏好二。',
      scope: 'project',
      scopeId: 'project-6',
      kind: 'author-preference'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([first, second]))

    const result = batchArchiveMemoryCandidates(['mem-6', 'mem-7'], {
      note: '批量归档'
    })

    expect(result.success).toBe(true)
    expect(result.archivedCount).toBe(2)
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toEqual(expect.arrayContaining(['mem-6', 'mem-7']))
  })

  it('restores stale candidates to their previous status', () => {
    const candidate = createMemoryCandidate({
      id: 'mem-8',
      content: '已确认后需要归档再恢复。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'active'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([candidate]))

    const archived = archiveMemoryCandidate('mem-8', {
      note: '先归档'
    })
    const restored = restoreMemoryCandidate('mem-8')

    expect(archived.success).toBe(true)
    expect(restored.success).toBe(true)
    expect(restored.candidate.status).toBe('active')
    expect(restored.candidate.syncStatus).toBe('local-only')
    expect(restored.candidate.metadata.restoredStatus).toBe('active')
    expect(listMemoryCandidates({ status: 'active' }).map((item) => item.id)).toContain('mem-8')
  })

  it('marks exact normalized duplicates in the same scope and kind', () => {
    const first = queueMemoryCandidate({
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact'
    })
    const duplicate = queueMemoryCandidate({
      content: ' 旧书店 在 西街 ',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact'
    })
    const otherScope = queueMemoryCandidate({
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-2',
      kind: 'project-fact'
    })

    expect(duplicate.candidate.duplicateOf).toBe(first.candidate.id)
    expect(otherScope.candidate.duplicateOf).toBe('')
  })

  it('marks conservative similar memories before treating them as conflicts', () => {
    const active = createMemoryCandidate({
      id: 'active-similar-1',
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact',
      status: 'active'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([active]))

    const candidate = queueMemoryCandidate({
      content: '旧书店在西街附近。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact'
    })

    expect(candidate.candidate.duplicateOf).toBe('')
    expect(candidate.candidate.similarTo).toBe(active.id)
    expect(candidate.candidate.conflictsWith).toEqual([])
  })

  it('finds similar memories only within the same scope id and kind', () => {
    const active = createMemoryCandidate({
      id: 'active-similar-2',
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact',
      status: 'active'
    })
    const otherScope = createMemoryCandidate({
      content: '旧书店在西街附近。',
      scope: 'project',
      scopeId: 'project-2',
      kind: 'project-fact'
    })

    expect(findSimilarMemoryCandidate(otherScope, [active])).toBe(null)
  })

  it('marks active memory conflicts when content differs in the same scope and kind', () => {
    const active = createMemoryCandidate({
      id: 'active-1',
      content: '作者偏好使用短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'active'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([active]))
    const candidate = queueMemoryCandidate({
      content: '作者偏好使用长句。',
      scope: 'global-author',
      kind: 'author-preference'
    })

    expect(candidate.candidate.duplicateOf).toBe('')
    expect(candidate.candidate.conflictsWith).toContain(active.id)
  })

  it('does not mark conflicts for different scope ids or exact duplicates', () => {
    const active = createMemoryCandidate({
      id: 'active-2',
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact',
      status: 'active'
    })
    const duplicate = createMemoryCandidate({
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-1',
      kind: 'project-fact'
    })
    const otherScope = createMemoryCandidate({
      content: '旧书店在西街。',
      scope: 'project',
      scopeId: 'project-2',
      kind: 'project-fact'
    })

    expect(findConflictingMemoryCandidates(duplicate, [active])).toEqual([])
    expect(findConflictingMemoryCandidates(otherScope, [active])).toEqual([])
  })

  it('replaces conflicting active memories when requested', () => {
    const active = createMemoryCandidate({
      id: 'active-3',
      content: '作者偏好短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'active'
    })
    const pending = createMemoryCandidate({
      id: 'pending-3',
      content: '作者偏好长句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'pending'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([active, pending]))

    const result = replaceMemoryCandidateConflicts('pending-3', {
      note: '已被新记忆替换'
    })

    expect(result.success).toBe(true)
    expect(result.replacedCount).toBe(1)
    expect(result.candidate.status).toBe('active')
    expect(result.candidate.conflictsWith).toEqual([])
    expect(listMemoryCandidates({ status: 'active' }).map((item) => item.id)).toContain('pending-3')
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toContain('active-3')
  })

  it('merges conflicting active memories into a combined candidate', () => {
    const active = createMemoryCandidate({
      id: 'active-4',
      content: '作者偏好短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'active'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([active]))
    const pending = queueMemoryCandidate({
      content: '作者偏好使用更完整的句子。',
      scope: 'global-author',
      kind: 'author-preference'
    })

    const result = mergeMemoryCandidateConflicts(pending.candidate.id, {
      note: '已合并到新记忆'
    })

    expect(result.success).toBe(true)
    expect(result.mergedCount).toBe(1)
    expect(result.candidate.status).toBe('active')
    expect(result.candidate.content).toContain('作者偏好使用更完整的句子。')
    expect(result.candidate.content).toContain('作者偏好短句。')
    expect(listMemoryCandidates({ status: 'active' }).map((item) => item.id)).toContain(pending.candidate.id)
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toContain('active-4')
  })

  it('finds active duplicates before pending duplicates', () => {
    const pending = createMemoryCandidate({
      id: 'pending-1',
      content: '作者偏好短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'pending',
      createdAt: 5
    })
    const active = createMemoryCandidate({
      id: 'active-1',
      content: '作者偏好短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'active',
      createdAt: 1
    })
    const candidate = createMemoryCandidate({
      id: 'new-1',
      content: '作者偏好短句。',
      scope: 'global-author',
      kind: 'author-preference',
      status: 'pending'
    })

    expect(findDuplicateMemoryCandidate(candidate, [pending, active])?.id).toBe('active-1')
  })

  it('refreshes duplicate markers when editing content', () => {
    const first = createMemoryCandidate({
      id: 'mem-1',
      content: '玩家已经拿到铜钥匙。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })
    const second = createMemoryCandidate({
      id: 'mem-2',
      content: '不同内容。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([first, second]))

    const updated = updateMemoryCandidate('mem-2', {
      content: '玩家 已经 拿到 铜钥匙'
    })

    expect(updated.duplicateOf).toBe('mem-1')
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

  it('ranks query-matched active memories before unrelated active memories in recall metadata', () => {
    const records = [
      createMemoryCandidate({
        id: 'mem-global-1',
        content: '作者偏好短句。',
        scope: 'global-author',
        scopeId: 'author-1',
        kind: 'author-preference',
        status: 'active',
        confidence: 0.5,
        updatedAt: 1
      }),
      createMemoryCandidate({
        id: 'mem-session-match',
        content: '主角在旧书店遇见了林舟。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        confidence: 0.9,
        updatedAt: 10
      }),
      createMemoryCandidate({
        id: 'mem-session-unrelated',
        content: '潮盐行会发出警告。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        confidence: 0.9,
        updatedAt: 20
      }),
      createMemoryCandidate({
        id: 'mem-project-match',
        content: '旧书店是作品的中心场景。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        status: 'active',
        confidence: 0.4,
        updatedAt: 5
      }),
      createMemoryCandidate({
        id: 'mem-pending',
        content: '未确认线索：旧书店的密室。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'pending',
        updatedAt: 100
      }),
      createMemoryCandidate({
        id: 'mem-rejected',
        content: '旧书店其实不存在。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'rejected',
        updatedAt: 100
      }),
      createMemoryCandidate({
        id: 'mem-stale',
        content: '旧书店之前关门了。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'stale',
        updatedAt: 100
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const ranked = rankScopedActiveMemoryCandidates({
      authorId: 'author-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      query: '旧书店 林舟',
      limitPerScope: 4
    })

    const sessionItems = ranked.items.filter((item) => item.scope === 'session')
    const projectItems = ranked.items.filter((item) => item.scope === 'project')

    expect(ranked.queryTerms).toEqual(expect.arrayContaining(['旧书店', '林舟']))
    expect(sessionItems[0].id).toBe('mem-session-match')
    expect(sessionItems[0].score).toBeGreaterThan(sessionItems.find((item) => item.id === 'mem-session-unrelated').score)
    expect(projectItems.find((item) => item.id === 'mem-project-match').score).toBeGreaterThan(0)
    expect(ranked.items.find((item) => item.id === 'mem-pending')).toBeUndefined()
    expect(ranked.items.find((item) => item.id === 'mem-rejected')).toBeUndefined()
    expect(ranked.items.find((item) => item.id === 'mem-stale')).toBeUndefined()
    expect(ranked.items.every((item) => item.preview.length <= MEMORY_RECALL_PREVIEW_LIMIT + 1)).toBe(true)
    expect(ranked.items.every((item) => !('content' in item))).toBe(true)
  })

  it('breaks ties using confidence and recency for ranked recall metadata', () => {
    const records = [
      createMemoryCandidate({
        id: 'mem-older-higher-confidence',
        content: '主角在钟楼密室寻找铜钥匙。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        confidence: 0.9,
        updatedAt: 1
      }),
      createMemoryCandidate({
        id: 'mem-newer-lower-confidence',
        content: '主角在钟楼密室发现铜钥匙的线索。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        confidence: 0.4,
        updatedAt: 99
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const ranked = rankScopedActiveMemoryCandidates({
      authorId: '',
      projectId: '',
      sessionId: 'session-1',
      query: '钟楼 密室 铜钥匙',
      limitPerScope: 4
    })

    const sessionItems = ranked.items.filter((item) => item.scope === 'session')
    expect(sessionItems[0].id).toBe('mem-older-higher-confidence')
    expect(sessionItems[0].confidence).toBeGreaterThan(sessionItems[1].confidence)
  })

  it('returns bounded recall context with included/excluded items per scope cap', () => {
    const records = []
    for (let index = 0; index < 6; index += 1) {
      records.push(createMemoryCandidate({
        id: `mem-session-${index}`,
        content: `钟楼线索 ${index}：调查员在钟楼顶层继续调查铜钥匙去向。`,
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        confidence: 0.6,
        updatedAt: 100 - index
      }))
    }
    records.push(createMemoryCandidate({
      id: 'mem-pending-recall',
      content: '钟楼线索：未确认的猜测。',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event',
      status: 'pending',
      updatedAt: 999
    }))
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const recall = buildScopedMemoryRecallContext({
      projectId: '',
      sessionId: 'session-1',
      query: '钟楼 铜钥匙 调查员',
      limitPerScope: 4,
      maxItemChars: 32
    })

    expect(recall.content).toContain('【已确认记忆】')
    expect(recall.included).toHaveLength(4)
    expect(recall.excluded).toHaveLength(2)
    expect(recall.items).toHaveLength(6)
    expect(recall.includedCount).toBe(4)
    expect(recall.contentChars).toBe(recall.content.length)
    expect(recall.included.every((item) => item.included === true)).toBe(true)
    expect(recall.excluded.every((item) => item.included === false && item.skipReason === 'per-scope-cap')).toBe(true)
    expect(recall.included.every((item) => item.preview.length <= MEMORY_RECALL_PREVIEW_LIMIT + 1)).toBe(true)
    expect(recall.included.every((item) => !('content' in item))).toBe(true)
    expect(recall.excluded.every((item) => !('content' in item))).toBe(true)
    // pending memory must never enter recall metadata
    expect(recall.items.find((item) => item.id === 'mem-pending-recall')).toBeUndefined()
  })

  it('returns an empty recall context when only non-active memories match', () => {
    const records = [
      createMemoryCandidate({
        id: 'mem-pending',
        content: '未确认：钟楼有暗道。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'pending'
      }),
      createMemoryCandidate({
        id: 'mem-rejected',
        content: '钟楼是禁区。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'rejected'
      }),
      createMemoryCandidate({
        id: 'mem-stale',
        content: '钟楼已经坍塌。',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'stale'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const recall = buildScopedMemoryRecallContext({
      projectId: '',
      sessionId: 'session-1',
      query: '钟楼',
      limitPerScope: 4,
      maxItemChars: 180
    })

    expect(recall.content).toBe('')
    expect(recall.included).toEqual([])
    expect(recall.excluded).toEqual([])
    expect(recall.items).toEqual([])
    expect(recall.includedCount).toBe(0)
  })

  it('preserves maxItemChars=180 truncation in buildScopedMemoryContext compatibility wrapper', () => {
    const longContent = '钟楼调查员' + '非常'.repeat(120) + '。'
    const records = [
      createMemoryCandidate({
        id: 'mem-long',
        content: longContent,
        scope: 'session',
        scopeId: 'session-1',
        kind: 'plot-event',
        status: 'active',
        skipCompaction: true
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const context = buildScopedMemoryContext({
      projectId: '',
      sessionId: 'session-1',
      maxItemChars: 180
    })

    // The line for this memory must include up to ~180 chars from the content,
    // proving the compatibility wrapper still applies maxItemChars, not the
    // smaller 120-char preview limit.
    expect(context).toContain('当前会话记忆：')
    const lineMatch = context.match(/- 剧情事件：([\s\S]+)$/u)
    expect(lineMatch).not.toBeNull()
    const body = lineMatch[1]
    expect(body.length).toBeGreaterThan(120)
    expect(body.length).toBeLessThanOrEqual(181) // 180 + ellipsis
  })
})
