import { rankMemoryCandidates } from '../memoryRetrieval'

function text(value) {
  return String(value ?? '').trim()
}

// 受控记忆 reader：在任务解析前读取当前有效的 active 记忆，
// 只返回 included 的记忆块（含评分分项），排除项只输出零内容审计块，不泄漏任何被排除正文。
export function createProjectMemoryReader(repository) {
  if (!repository || typeof repository.list !== 'function') {
    throw new Error('createProjectMemoryReader requires a repository with list()')
  }

  return async function readProjectMemory(request = {}) {
    const context = typeof repository.context === 'function'
      ? (repository.context(request) || {})
      : {}
    const candidates = repository.list({ status: 'active' }) || []
    const contentById = new Map(candidates.map((item) => [item.id, item]))

    // 生产请求携带 intent.instruction（命令问题）+ selectedText；显式查询走 intent.query。
    const instruction = text(request?.intent?.instruction) || text(request?.intent?.query) || text(request?.query)
    const selectedText = text(request?.intent?.selectedText)
    const query = instruction || selectedText

    const result = rankMemoryCandidates({
      candidates,
      query,
      authorId: text(context.authorId),
      projectId: text(context.projectId),
      sessionId: text(context.sessionId),
      entityIds: Array.isArray(context.entityIds) ? context.entityIds : [],
      currentRevisions: context.currentRevisions || {},
      now: Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now()
    })

    const blocks = result.included.map((entry) => {
      const candidate = contentById.get(entry.id)
      return {
        id: `memory:${entry.id}`,
        title: entry.kind,
        text: text(candidate?.content),
        authority: entry.authority === 'accepted' ? 'accepted' : 'derived',
        sourceRefs: entry.sourceRefs.slice(0, 16),
        entryId: entry.id,
        score: entry.score,
        included: true,
        reason: 'relevance-above-threshold'
      }
    })

    if (result.excluded.length) {
      const byReason = {}
      for (const item of result.excluded) {
        byReason[item.skipReason] = (byReason[item.skipReason] || 0) + 1
      }
      blocks.push({
        id: 'memory-recall-audit',
        title: '记忆召回审计',
        // 隐私边界：审计块不携带任何被排除记忆的正文。
        text: '',
        authority: 'derived',
        sourceRefs: [],
        recallAudit: { excludedCount: result.excluded.length, byReason },
        included: false,
        reason: Object.keys(byReason).sort().join('+') || 'excluded'
      })
    }

    return blocks
  }
}
