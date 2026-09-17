// NC06/NC09：提取任务执行器。队列 FIFO、默认并发 1；模型输出经逐项校验后
// 以 origin='ai' + chapter-quote 证据写入既有事实账本（唯一提案 owner），
// 不再写第二套候选。429/超时按退避有界重试；401/403 不盲重试；来源变化
// 与会话预算优先于执行。
import { createLedgerDb } from '../ledger/ledgerDb'
import { appendEvidence, createProposal } from '../ledger/factLedger'
import {
  listExtractionJobs,
  updateExtractionJob,
  reconcileInterruptedJobs,
  consumeAutoSessionBudget
} from './extractionJobStore'
import { runMemoryExtraction, validateMemoryExtractionResponse } from './structuredExtraction'

const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 10 * 60_000

function classifyProviderError(error) {
  const message = String(error?.message || '')
  if (error?.code === 'MEMORY_EXTRACTION_RESULT_INVALID') {
    return { kind: 'bad-json', retryable: true, formatRepair: true }
  }
  if (/\b401\b|\b403\b|认证|未授权|unauthorized|forbidden|api key|apikey/i.test(message)) {
    return { kind: 'auth', retryable: false }
  }
  if (/\b429\b|rate limit|限流/i.test(message)) {
    return { kind: 'rate-limit', retryable: true }
  }
  if (/\b408\b|timeout|aborted|network|fetch/i.test(message)) {
    return { kind: 'network', retryable: true }
  }
  return { kind: 'provider', retryable: Boolean(error?.retryable) }
}

function backoffDelayMs(attempts) {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
}

function jobReady(job, now) {
  if (job.status !== 'queued') return false
  const notBefore = Number(job.nextAttemptAt || 0)
  return !notBefore || now >= notBefore
}

function sourceSuperseded(job, allJobs) {
  if (!job.sourceRefs.length || !Number(job.revisionSeq)) return false
  return allJobs.some((other) => (
    other.id !== job.id
    && other.status !== 'cancelled'
    && other.sourceRefs[0] === job.sourceRefs[0]
    && (Number(other.revisionSeq) || 0) > Number(job.revisionSeq)
  ))
}

async function persistProposalsToLedger({ job, proposals, meta }) {
  const opened = createLedgerDb()
  if (!opened.ok) {
    return { ok: false, reason: opened.reason || 'db-unavailable' }
  }
  const { db } = opened
  try {
    await db.open()
    const scope = { domain: 'book', bookId: job.projectId }
    const created = []
    for (const proposal of proposals) {
      const evidence = await appendEvidence(db, {
        scope,
        sourceKind: 'chapter-quote',
        sourceId: job.sourceRefs[0] || `extraction:${job.id}`,
        sourceRevision: job.sourceRevision,
        quote: proposal.quote
      })
      if (!evidence.ok) {
        created.push({ ok: false, reason: evidence.reason || 'evidence-failed', subject: proposal.subject })
        continue
      }
      const result = await createProposal(db, {
        scope,
        subjectKey: proposal.subjectKey,
        subjectLabel: proposal.subject,
        predicate: proposal.predicate,
        object: proposal.object,
        evidenceIds: [evidence.evidence.id],
        origin: 'ai',
        baseRevision: job.sourceRevision,
        storyInterval: null
      })
      if (result.ok && !result.suppressed) {
        created.push({ ok: true, proposalId: result.proposal.id, replay: Boolean(result.replay), subject: proposal.subject })
      } else if (result.suppressed) {
        created.push({ ok: true, suppressed: true, subject: proposal.subject })
      } else {
        created.push({ ok: false, reason: result.reason || 'proposal-failed', subject: proposal.subject })
      }
    }
    db.close()
    return { ok: true, created, provider: meta?.provider || '' }
  } catch (error) {
    try { db.close() } catch { /* ignore */ }
    return { ok: false, reason: 'db-unavailable', detail: String(error?.message || error).slice(0, 120) }
  }
}

export async function runSingleExtractionJob(job, { knownIdentities = [], signal = null, manual = false } = {}) {
  const sourceText = job.blocks.join('')
  updateExtractionJob(job.id, {
    status: 'running',
    attempts: (job.attempts || 0) + 1,
    lastError: null
  })
  try {
    const { parsed, meta } = await runMemoryExtraction({
      sourceText,
      sourceRef: job.sourceRefs[0] || '',
      sourceRevision: job.sourceRevision,
      knownIdentities
    }, { signal })
    const validation = validateMemoryExtractionResponse(parsed, { sourceText, knownIdentities })
    if (!validation.proposals.length && !validation.rejected.length) {
      const reason = textOrEmpty(parsed?.unextractable?.reason)
      return updateExtractionJob(job.id, {
        status: 'no-fact',
        unextractableReason: reason.slice(0, 160),
        providerMeta: meta || {}
      })
    }
    const persisted = await persistProposalsToLedger({ job, proposals: validation.proposals, meta })
    if (!persisted.ok) {
      return updateExtractionJob(job.id, {
        status: 'failed',
        lastError: { code: 'ledger-write-failed', message: persisted.reason || '提案写入失败，重试不重复提案', retryable: true }
      })
    }
    const okCount = persisted.created.filter((item) => item.ok).length
    const rejected = validation.rejected.map((item) => ({ reason: item.reason, detail: item.subject || item.quote || '' }))
    return updateExtractionJob(job.id, {
      status: okCount > 0 ? 'completed' : 'no-fact',
      proposalIds: persisted.created.filter((item) => item.ok && item.proposalId).map((item) => item.proposalId),
      rejected: rejected.slice(0, 12),
      unextractableReason: validation.proposals.length ? '' : textOrEmpty(parsed?.unextractable?.reason).slice(0, 160),
      providerMeta: meta || {},
      completedAt: Date.now()
    })
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      return updateExtractionJob(job.id, { status: 'cancelled', lastError: { code: 'cancelled', message: '已取消', retryable: true } })
    }
    const classified = classifyProviderError(error)
    const attempts = (job.attempts || 0) + 1
    if (classified.formatRepair && (job.formatRepairs || 0) < 1) {
      // 单块最多 1 次格式修复重试（计划预算）。
      return updateExtractionJob(job.id, {
        status: 'queued',
        formatRepairs: (job.formatRepairs || 0) + 1,
        lastError: { code: 'bad-json', message: error.message, retryable: true },
        nextAttemptAt: Date.now()
      })
    }
    if (classified.retryable && !manual && attempts < 3) {
      return updateExtractionJob(job.id, {
        status: 'queued',
        attempts,
        lastError: { code: classified.kind, message: String(error.message || error).slice(0, 160), retryable: true },
        nextAttemptAt: Date.now() + backoffDelayMs(attempts)
      })
    }
    return updateExtractionJob(job.id, {
      status: 'failed',
      attempts,
      lastError: {
        code: classified.kind,
        message: String(error.message || error).slice(0, 200),
        retryable: classified.retryable
      }
    })
  }
}

function textOrEmpty(value) {
  return String(value ?? '')
}

/**
 * 消费队列。auto=true 时受会话预算约束并只跑 queued+到期任务；
 * manual=true 由作者显式触发，绕过会话预算但仍然 FIFO、并发 1。
 */
export async function drainExtractionQueue({ max = 1, auto = true, knownIdentities = [], signal = null } = {}) {
  const reconciliation = reconcileInterruptedJobs()
  const results = []
  for (let index = 0; index < Math.max(1, max); index += 1) {
    const allJobs = listExtractionJobs({})
    const now = Date.now()
    const pendingJob = allJobs.find((candidate) => jobReady(candidate, now))
    if (!pendingJob) break
    // superseded 标记不消耗模型额度，也不受会话预算约束。
    if (sourceSuperseded(pendingJob, allJobs)) {
      updateExtractionJob(pendingJob.id, { status: 'source-changed', lastError: { code: 'source-changed', message: '来源已有更新版本', retryable: false } })
      continue
    }
    if (auto) {
      const budget = consumeAutoSessionBudget({})
      if (!budget.allowed) {
        results.push({ skipped: 'session-budget-exhausted', used: budget.used, limit: budget.limit })
        break
      }
    }
    const result = await runSingleExtractionJob(pendingJob, { knownIdentities, signal, manual: !auto })
    results.push({ jobId: pendingJob.id, result })
  }
  return { interrupted: reconciliation.interrupted, results }
}

export function listPendingExtractionJobs(projectId = '') {
  return listExtractionJobs({ projectId }).filter((job) => ['queued', 'running', 'partial'].includes(job.status))
}
