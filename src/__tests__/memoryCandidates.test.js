import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  supersedeMemoryCandidates,
  updateMemoryCandidate
} from '@/services/memoryCandidates'
import { deriveMemoryImportance } from '@/services/memoryImportance'
import { rankMemoryCandidates } from '@/services/memoryRetrieval'
import {
  isMemorySourceCurrent,
  memorySourceKey
} from '@/services/memoryProvenance'
import {
  invalidateMemoryBySource
} from '@/services/memoryCandidates'
import { createMemoryRecallReceipt, inspectMemoryCapacity } from '@/services/memoryReceipt'

describe('memoryCandidates', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  })

  it("queues normalized pending candidates（合并4例）（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const result = queueMemoryCandidate({
      content: '林霁舰长沉声说：“所有人立刻撤离。”警报声在走廊里回荡，主角意识到舰桥即将失守，必须立刻选择路线。',
      type: 'dialogue',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'plot-event'
    })

    expect(result.candidate.content).toBe('对话：林霁舰长：所有人立刻撤离。')
    expect(listMemoryCandidates()[0].content).toBe('对话：林霁舰长：所有人立刻撤离。')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(getMemoryKindLabel('style-sample')).toBe('风格样本')
    expect(getMemorySyncStatusLabel('synced')).toBe('已同步')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
})

  it("marks active memory conflicts when content differs in the same scope and kind（合并4例）（合并3例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
    // append-only：新 revision 带 supersedes[]，旧条目（含原候选）统一 stale。
    expect(result.candidate.supersedes).toEqual(expect.arrayContaining(['pending-3', 'active-3']))
    expect(result.candidate.status).toBe('active')
    expect(result.candidate.content).toBe('作者偏好长句。')
    expect(result.candidate.conflictsWith).toEqual([])
    const activeIds = listMemoryCandidates({ status: 'active' }).map((item) => item.id)
    expect(activeIds).toContain(result.candidate.id)
    expect(activeIds).not.toContain('pending-3')
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id))
      .toEqual(expect.arrayContaining(['pending-3', 'active-3']))
    expect(listMemoryCandidates({ status: 'stale' }).find((item) => item.id === 'active-3').metadata.supersededBy)
      .toBe(result.candidate.id)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
    expect(result.candidate.supersedes).toEqual(expect.arrayContaining([pending.candidate.id, 'active-4']))
    expect(result.candidate.status).toBe('active')
    expect(result.candidate.content).toContain('作者偏好使用更完整的句子。')
    expect(result.candidate.content).toContain('作者偏好短句。')
    const activeIds = listMemoryCandidates({ status: 'active' }).map((item) => item.id)
    expect(activeIds).toContain(result.candidate.id)
    expect(activeIds).not.toContain(pending.candidate.id)
    expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id))
      .toEqual(expect.arrayContaining([pending.candidate.id, 'active-4']))
}
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

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
}
}
})
})

describe('memory schema v2 contract', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  })

  {
const casesK1 = [
      ['pending', 'derived'],
      ['active', 'accepted'],
      ['stale', 'derived']
    ]
it('normalizes v1 %s memory into v2 authority %s' + '（参数组合并）', async () => {
  const failuresK1 = []
  for (const [caseIndexK1, caseValueK1] of casesK1.entries()) {
    const rowK1 = Array.isArray(caseValueK1) ? caseValueK1 : [caseValueK1]
    try { await ((status, authority) => {
      const candidate = createMemoryCandidate({
        id: `legacy-${status}`,
        schemaVersion: 1,
        status,
        scope: 'project',
        scopeId: 'project-1',
        content: '林昭答应在天亮前返回。',
        sourceRef: 'chapter:1:node:7'
      })
      expect(candidate.schemaVersion).toBe(2)
      expect(candidate.authority).toBe(authority)
      expect(candidate.sourceRefs).toEqual(['chapter:1:node:7'])
      expect(candidate.sourceRevision).toBe('')
      expect(candidate.supersedes).toEqual([])
    })(...rowK1) } catch (errorK1) { failuresK1.push('#' + caseIndexK1 + ': ' + (errorK1 && errorK1.message)) }
  }
  if (failuresK1.length) throw new Error(failuresK1.join('\n'))
})
}

    it("preserves the legacy singular sourceRef field during migration（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const candidate = createMemoryCandidate({
        id: 'legacy-ref',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        content: '林昭答应在天亮前返回。',
        sourceRef: 'chapter:1:node:7'
      })
      expect(candidate.sourceRef).toBe('chapter:1:node:7')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const candidate = createMemoryCandidate({
        id: 'legacy-no-ref',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        content: '旧记录没有来源。'
      })
      expect(candidate.metadata.migrationWarning).toBe('missing-source-ref')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(() => createMemoryCandidate({
        status: 'active',
        authority: 'derived',
        content: '无来源事实'
      })).toThrow('MEMORY_SOURCE_REQUIRED')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const candidate = createMemoryCandidate({
        id: 'v2-fields',
        status: 'active',
        authority: 'explicit-accepted',
        scope: 'project',
        scopeId: 'project-1',
        content: '林昭害怕密闭空间。',
        sourceRefs: ['chapter:2:node:1', 'chapter:2:node:1', ''],
        sourceRevision: 'rev-2',
        derivedBy: 'explicit',
        importance: 0.9,
        importanceOverride: 1,
        supersedes: ['old-1', 'old-1'],
        recallCount: 3,
        lastRecalledAt: 12345
      })
      expect(candidate.authority).toBe('accepted')
      expect(candidate.derivedBy).toBe('explicit')
      expect(candidate.sourceRefs).toEqual(['chapter:2:node:1'])
      expect(candidate.importanceOverride).toBe(1)
      expect(candidate.supersedes).toEqual(['old-1'])
      expect(candidate.recallCount).toBe(3)
      expect(candidate.lastRecalledAt).toBe(12345)
}
})

    it("derives importance without asking the model to score itself（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(deriveMemoryImportance({ kind: 'constraint', content: '角色绝不能知道真凶身份。' })).toBe(0.9)
      expect(deriveMemoryImportance({
        kind: 'plot-event',
        content: '林昭承诺天亮前返回。',
        signals: { explicitCommitment: true, independentSourceCount: 2 }
      })).toBe(0.96)
      expect(deriveMemoryImportance({
        kind: 'project-fact',
        content: '也许门后有人。',
        signals: { inferenceOnly: true }
      })).toBe(0.56)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(deriveMemoryImportance({ kind: 'style-sample', content: 'x', override: 1 })).toBe(1)
      expect(deriveMemoryImportance({ kind: 'constraint', content: 'x', override: 0.25 })).toBe(0.25)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const candidate = createMemoryCandidate({
        id: 'auto-importance',
        status: 'pending',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'constraint',
        content: '角色绝不能知道真凶身份。'
      })
      expect(candidate.importance).toBe(0.9)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const seed = createMemoryCandidate({
        id: 'active-1',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '林昭答应在天亮前返回。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-1'
      })
      localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([seed]))

      const result = supersedeMemoryCandidates({
        content: '林昭改为在正午返回。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        sourceRefs: ['chapter:2:node:3'],
        sourceRevision: 'rev-2',
        supersedes: ['active-1']
      })
      expect(result.success).toBe(true)
      expect(result.candidate.status).toBe('active')
      expect(result.candidate.supersedes).toEqual(['active-1'])
      expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toContain('active-1')
      expect(listMemoryCandidates({ status: 'stale' }).find((item) => item.id === 'active-1').metadata.supersededBy)
        .toBe(result.candidate.id)
}
})

    it("reports storage failure instead of fake success during replace（合并3例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const target = createMemoryCandidate({
        id: 'storage-target',
        status: 'pending',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '林昭答应在天亮前返回。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-2'
      })
      localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([target]))

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => { throw new Error('quota-exceeded') })
      let result
      try {
        result = replaceMemoryCandidateConflicts('storage-target')
      } finally {
        setItemSpy.mockRestore()
      }

      // 持久化失败必须如实报告，不能发事件假装成功。
      expect(result).toMatchObject({ success: false, skipped: true, reason: 'storage-failed' })
      const stored = listMemoryCandidates()
      expect(stored.map((item) => item.id)).toEqual(['storage-target'])
      expect(stored[0].status).toBe('pending')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const target = createMemoryCandidate({
        id: 'legacy-no-revision',
        status: 'pending',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '缺少来源版本的候选。'
      })
      localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([target]))

      const result = replaceMemoryCandidateConflicts('legacy-no-revision')
      expect(result).toMatchObject({ success: false, skipped: true, reason: 'missing-source-provenance' })
      expect(listMemoryCandidates({ status: 'active' })).toHaveLength(0)
      expect(listMemoryCandidates({ status: 'stale' })).toHaveLength(0)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const seed = createMemoryCandidate({
        id: 'other-project-memory',
        status: 'active',
        scope: 'project',
        scopeId: 'project-2',
        kind: 'plot-event',
        content: '别的项目的事实。',
        sourceRefs: ['chapter:9:node:1']
      })
      localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([seed]))

      const result = supersedeMemoryCandidates({
        content: '林昭改为在正午返回。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        sourceRefs: ['chapter:2:node:3'],
        sourceRevision: 'rev-2',
        supersedes: ['other-project-memory']
      })
      expect(result.success).toBe(false)
      expect(listMemoryCandidates({ status: 'stale' })).toHaveLength(0)
      expect(listMemoryCandidates({ scopeId: 'project-2' }).map((item) => item.id)).toEqual(['other-project-memory'])
}
})

    const NOW = 1_700_000_000_000
    const memoryFixture = [
      {
        id: 'lin-promise',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '林昭答应在天亮前返回钟楼。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-1',
        authority: 'accepted',
        importance: 0.96,
        recallCount: 2,
        updatedAt: NOW - 60_000,
        metadata: { characterIds: ['char-lin-zhao'] }
      },
      {
        id: 'style-note',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'style-sample',
        content: '作者偏好短句和留白。',
        sourceRefs: ['chapter:1:node:9'],
        authority: 'derived',
        importance: 0.45,
        updatedAt: NOW - 86_400_000 * 30
      },
      {
        id: 'session-fact',
        status: 'active',
        scope: 'session',
        scopeId: 'session-1',
        kind: 'character-state',
        content: '林昭当前躲在钟楼二层。',
        sourceRefs: ['chapter:1:node:8'],
        authority: 'accepted',
        importance: 0.72,
        updatedAt: NOW - 120_000,
        metadata: { characterIds: ['char-lin-zhao'] }
      }
    ]
    const isolationFixture = [
      {
        id: 'active-project-1',
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        content: '地下室的密钥锁在铁盒里。',
        sourceRefs: ['chapter:1:node:1'],
        authority: 'accepted',
        importance: 0.68,
        updatedAt: NOW
      },
      {
        id: 'pending-secret',
        status: 'pending',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        content: '密钥可能是假的。',
        sourceRefs: ['chapter:1:node:2'],
        updatedAt: NOW
      },
      {
        id: 'stale-secret',
        status: 'stale',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        content: '密钥曾经藏在井里。',
        sourceRefs: ['chapter:1:node:3'],
        updatedAt: NOW
      },
      {
        id: 'rejected-secret',
        status: 'rejected',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        content: '密钥已销毁。',
        sourceRefs: ['chapter:1:node:4'],
        updatedAt: NOW
      },
      {
        id: 'other-project-secret',
        status: 'active',
        scope: 'project',
        scopeId: 'project-2',
        kind: 'project-fact',
        content: '另一个项目的密钥。',
        sourceRefs: ['chapter:5:node:1'],
        updatedAt: NOW
      }
    ]

    it("ranks relevant current accepted memory and exposes score components（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const result = rankMemoryCandidates({
        query: '林昭为什么必须在天亮前回来',
        projectId: 'project-1',
        sessionId: 'session-1',
        entityIds: ['char-lin-zhao'],
        now: NOW,
        candidates: memoryFixture
      })
      expect(result.included[0].id).toBe('lin-promise')
      expect(result.included[0].score).toMatchObject({
        relevance: expect.any(Number),
        importance: expect.any(Number),
        authority: expect.any(Number),
        recency: expect.any(Number),
        scopeFit: expect.any(Number),
        final: expect.any(Number)
      })
      expect(result.included[0].score.final).toBeGreaterThanOrEqual(result.included[1]?.score?.final || 0)
      expect(result.included.map((item) => item.id)).toContain('session-fact')
      expect(result.excluded.every((item) => item.skipReason)).toBe(true)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const once = rankMemoryCandidates({
        query: '林昭返回', projectId: 'project-1', sessionId: '', now: NOW, candidates: memoryFixture
      })
      const noisy = rankMemoryCandidates({
        query: '林昭返回',
        projectId: 'project-1',
        sessionId: '',
        now: NOW,
        candidates: memoryFixture.map((item) => ({ ...item, recallCount: item.id === 'style-note' ? 999 : 0 }))
      })
      expect(noisy.included.map((item) => item.id)).toEqual(once.included.map((item) => item.id))
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const result = rankMemoryCandidates({
        query: '密钥', projectId: 'project-1', sessionId: '', now: NOW, candidates: isolationFixture
      })
      expect(result.included.map((item) => item.id)).toEqual(['active-project-1'])
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const result = rankMemoryCandidates({
        query: '', projectId: 'project-1', sessionId: 'session-1', now: NOW, candidates: memoryFixture
      })
      expect(result.included).toEqual([])
      expect(result.counts.eligible).toBe(3)
}
})

    it("marks below-threshold per-scope-cap and top-k exclusions with reasons（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const many = Array.from({ length: 8 }, (_, index) => ({
        id: `mem-${index}`,
        status: 'active',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: `林昭事件${index} 天亮`,
        sourceRefs: [`chapter:1:node:${index}`],
        authority: 'accepted',
        importance: index / 10 + 0.1,
        updatedAt: NOW - index * 1000
      }))
      const result = rankMemoryCandidates({
        query: '林昭 天亮', projectId: 'project-1', now: NOW, candidates: many
      })
      expect(result.included.length).toBeLessThanOrEqual(5)
      expect(result.included.filter((item) => item.scope === 'project').length).toBeLessThanOrEqual(3)
      const reasons = result.excluded.map((item) => item.skipReason)
      expect(reasons.every((reason) => ['below-threshold', 'per-scope-cap', 'top-k'].includes(reason))).toBe(true)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(() => createMemoryCandidate({
        status: 'active',
        authority: 'derived',
        content: '有来源但缺版本。',
        sourceRefs: ['chapter:1:node:7']
      })).toThrow('MEMORY_SOURCE_REQUIRED')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
        {
          id: 'stored-v1',
          schemaVersion: 1,
          status: 'active',
          scope: 'project',
          scopeId: 'project-1',
          kind: 'plot-event',
          content: '旧记录。',
          sourceRef: 'chapter:1:node:7'
        }
      ]))
      const list = listMemoryCandidates({ status: 'active' })
      expect(list[0].schemaVersion).toBe(2)
      expect(list[0].authority).toBe('accepted')
      expect(list[0].sourceRefs).toEqual(['chapter:1:node:7'])
      const storedNow = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_CANDIDATES))
      expect(storedNow[0].schemaVersion).toBe(2)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
        createMemoryCandidate({
          id: 'pending-no-rev',
          status: 'pending',
          authority: 'derived',
          scope: 'project',
          scopeId: 'project-1',
          kind: 'plot-event',
          content: '没有版本号的观察。'
        })
      ]))
      expect(confirmMemoryCandidate('pending-no-rev')).toBeNull()
      expect(listMemoryCandidates({ status: 'active' })).toHaveLength(0)
}
})

    it("upgrades authority to accepted explicitly when confirming a sourced candidate（合并3例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
        createMemoryCandidate({
          id: 'pending-sourced',
          status: 'pending',
          authority: 'derived',
          scope: 'project',
          scopeId: 'project-1',
          kind: 'plot-event',
          content: '林昭答应在天亮前返回。',
          sourceRefs: ['chapter:1:node:7'],
          sourceRevision: 'rev-2'
        })
      ]))
      const confirmed = confirmMemoryCandidate('pending-sourced')
      expect(confirmed).toMatchObject({ status: 'active', authority: 'accepted' })
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const NOW = 1_700_000_000_000
      const base = [
        {
          id: 'mem-a',
          status: 'active',
          scope: 'project',
          scopeId: 'project-1',
          kind: 'style-sample',
          content: '林昭在天亮前返回钟楼。',
          sourceRefs: ['chapter:1:node:1'],
          authority: 'accepted',
          importance: 0.45,
          updatedAt: NOW
        },
        {
          id: 'mem-b',
          status: 'active',
          scope: 'project',
          scopeId: 'project-1',
          kind: 'style-sample',
          content: '林昭在天亮前返回钟楼，另一句。',
          sourceRefs: ['chapter:1:node:2'],
          authority: 'accepted',
          importance: 0.45,
          updatedAt: NOW
        }
      ]
      const plain = rankMemoryCandidates({ query: '林昭 天亮', projectId: 'project-1', now: NOW, candidates: base })
      const demoted = rankMemoryCandidates({
        query: '林昭 天亮', projectId: 'project-1', now: NOW,
        candidates: base.map((item) => item.id === 'mem-a' ? { ...item, importanceOverride: 0 } : item)
      })
      expect(plain.included[0].id).toBe('mem-a')
      expect(demoted.included[0].id).toBe('mem-b')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const result = rankMemoryCandidates({
        query: '林昭 天亮',
        projectId: 'project-1',
        now: NOW,
        currentRevisions: { 'chapter:1:node:7': 'rev-2' },
        candidates: memoryFixture
      })
      expect(result.included.map((item) => item.id)).not.toContain('lin-promise')
      expect(result.excluded.find((item) => item.id === 'lin-promise').skipReason).toBe('source-stale')
}
})
})

describe('memory provenance invalidation', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  })

  it("builds stable normalized source keys（合并4例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(memorySourceKey('chapter:1:node:7', 'rev-2')).toBe('chapter:1:node:7@rev-2')
    expect(memorySourceKey(' chapter:1 ', '')).toBe('chapter:1@unknown')
    expect(memorySourceKey('', 'rev-1')).toBe('')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

expect(isMemorySourceCurrent({ sourceRefs: ['chapter:1'], sourceRevision: '' }, { 'chapter:1': 'rev-9' })).toBe(true)
    expect(isMemorySourceCurrent({ sourceRefs: ['chapter:1'], sourceRevision: 'rev-2' }, { 'chapter:1': 'rev-2' })).toBe(true)
    expect(isMemorySourceCurrent({ sourceRefs: ['chapter:1'], sourceRevision: 'rev-2' }, { 'chapter:1': 'rev-3' })).toBe(false)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const records = [
      createMemoryCandidate({
        id: 'memory-from-rev-2',
        status: 'active',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '林昭答应在天亮前返回。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-2'
      }),
      createMemoryCandidate({
        id: 'memory-from-rev-3',
        status: 'active',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'character-state',
        content: '林昭当前在钟楼。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-3'
      }),
      createMemoryCandidate({
        id: 'accepted-no-source-guard',
        status: 'active',
        authority: 'accepted',
        scope: 'global-author',
        scopeId: '',
        kind: 'author-preference',
        content: '作者偏好短句。'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const result = invalidateMemoryBySource({
      sourceRef: 'chapter:1:node:7',
      currentRevision: 'rev-3',
      reason: 'source-revision-changed'
    })
    expect(result.staledIds).toEqual(['memory-from-rev-2'])
    expect(result.untouchedIds).toContain('memory-from-rev-3')

    const staled = listMemoryCandidates({ status: 'stale' }).find((item) => item.id === 'memory-from-rev-2')
    expect(staled.metadata.previousStatus).toBe('active')
    expect(staled.metadata.staleReason).toBe('source-revision-changed')
    expect(staled.metadata.invalidatedAt).toBeGreaterThan(0)
    expect(listMemoryCandidates({ status: 'active' }).map((item) => item.id))
      .toEqual(expect.arrayContaining(['memory-from-rev-3']))
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const records = [
      createMemoryCandidate({
        id: 'accepted-chapter-memory',
        status: 'active',
        authority: 'accepted',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '林昭答应在天亮前返回。',
        sourceRefs: ['chapter:1:node:7'],
        sourceRevision: 'rev-2'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const result = invalidateMemoryBySource({
      sourceRef: 'chapter:1:node:7',
      currentRevision: 'rev-5',
      reason: 'source-revision-changed'
    })
    expect(result.staledIds).toEqual(['accepted-chapter-memory'])
    expect(listMemoryCandidates({ status: 'active' })).toHaveLength(0)
    expect(listMemoryCandidates({ status: 'stale' })[0].metadata.previousStatus).toBe('active')
}
})

  it('never stales global author explicit preferences when a chapter changes', () => {
    const records = [
      createMemoryCandidate({
        id: 'author-explicit',
        status: 'active',
        authority: 'accepted',
        scope: 'global-author',
        scopeId: '',
        kind: 'author-preference',
        content: '避免使用破折号揭晓。',
        sourceRefs: ['user-action:remember:1'],
        sourceRevision: '',
        derivedBy: 'explicit'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const result = invalidateMemoryBySource({
      sourceRef: 'user-action:remember:1',
      currentRevision: 'anything',
      reason: 'source-revision-changed'
    })
    expect(result.staledIds).toEqual([])
    expect(listMemoryCandidates({ status: 'active' })).toHaveLength(1)
  })
})

describe('memory receipts and capacity', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  })

  const scoreFixture = { relevance: 0.4, importance: 0.9, authority: 1, recency: 0.8, scopeFit: 0.7, final: 0.66 }

  it("stores a bounded receipt without source prose or prompt text（合并3例）", async () => {
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const receipt = createMemoryRecallReceipt({
      requestId: 'req-1',
      taskId: 'authoring.continue',
      query: '林昭为什么回来',
      included: [{ id: 'm1', sourceRefs: ['chapter:1:node:7'], score: scoreFixture }],
      excluded: [{ id: 'm2', skipReason: 'below-threshold', score: scoreFixture }]
    })
    expect(receipt.included[0]).not.toHaveProperty('content')
    expect(receipt.included[0]).toMatchObject({
      id: 'm1',
      sourceRefs: ['chapter:1:node:7'],
      reason: 'included'
    })
    expect(JSON.stringify(receipt)).not.toContain('完整章节正文')
    expect(receipt.queryChars).toBe(7)
    expect(receipt.excluded[0].skipReason).toBe('below-threshold')
    expect(typeof receipt.createdAt).toBe('number')
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

const records = []
    for (let index = 0; index < 501; index += 1) {
      records.push(createMemoryCandidate({
        id: `cap-mem-${index}`,
        status: index % 2 === 0 ? 'active' : 'pending',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: `容量测试记忆 ${index}。`,
        sourceRefs: [`chapter:9:node:${index}`],
        sourceRevision: 'rev-1'
      }))
    }
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    const result = inspectMemoryCapacity({ projectId: 'project-1', softLimit: 500 })
    expect(result).toMatchObject({ overLimit: true, action: 'review-required' })
    expect(result.totalCount).toBe(501)
    expect(listMemoryCandidates({ scopeId: 'project-1' })).toHaveLength(501)
}
{

    localStorage.removeItem(STORAGE_KEYS.MEMORY_CANDIDATES)

localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
      createMemoryCandidate({
        id: 'small-project-memory',
        status: 'active',
        authority: 'derived',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'plot-event',
        content: '一条记忆。',
        sourceRefs: ['chapter:1:node:1'],
        sourceRevision: 'rev-1'
      })
    ]))
    const result = inspectMemoryCapacity({ projectId: 'project-1', softLimit: 500 })
    expect(result.overLimit).toBe(false)
    expect(result.action).toBe('none')
}
})
})
