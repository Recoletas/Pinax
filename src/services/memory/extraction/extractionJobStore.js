// NC06：结构化记忆提取任务存储（localStorage，有界；schema 演进只追加）。
// 任务语义：queued → running → completed | partial | no-fact | failed | cancelled | source-changed
// 去重键 = scopeKey + fingerprint（来源 revision + 内容指纹）；429/超时可退避重试，
// 401/403 不盲重试；刷新后遗留 running 任务在下一轮对账时标为中断（不假称自动续跑成功）。
export const EXTRACTION_JOB_STATUSES = Object.freeze([
  'queued',
  'running',
  'completed',
  'partial',
  'no-fact',
  'failed',
  'cancelled',
  'source-changed'
])

export const EXTRACTION_JOB_LIMIT = 200
export const EXTRACTION_MAX_ATTEMPTS = 3
export const EXTRACTION_MAX_FORMAT_REPAIRS = 1
import { STORAGE_KEYS } from '../../../composables/useStorage'

const STORAGE_KEY = STORAGE_KEYS.MEMORY_EXTRACTION_JOBS

function readJobs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJobs(jobs) {
  const capped = jobs.slice(0, EXTRACTION_JOB_LIMIT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
    return true
  } catch {
    return false
  }
}

export function resetExtractionJobsForTest() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function listExtractionJobs(filter = {}) {
  return readJobs().filter((job) => (
    (!filter.projectId || job.projectId === filter.projectId)
    && (!filter.status || job.status === filter.status)
    && (!filter.fingerprint || job.fingerprint === filter.fingerprint)
  ))
}

export function getExtractionJob(jobId) {
  return readJobs().find((job) => job.id === jobId) || null
}

export function enqueueExtractionJob({
  projectId = '',
  sourceRefs = [],
  sourceRevision = '',
  revisionSeq = 0,
  fingerprint = '',
  text = '',
  maxBlocks = 8
} = {}) {
  const jobs = readJobs()
  const dedupeKey = `${projectId}:${fingerprint}:${sourceRevision}`
  const existing = jobs.find((job) => job.dedupeKey === dedupeKey)
  if (existing && ['queued', 'running', 'completed', 'partial', 'no-fact'].includes(existing.status)) {
    return { ok: true, duplicate: true, job: existing }
  }
  const now = Date.now()
  const job = {
    id: `exjob_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: 1,
    projectId: String(projectId || ''),
    dedupeKey,
    fingerprint: String(fingerprint || ''),
    sourceRefs: [...new Set((Array.isArray(sourceRefs) ? sourceRefs : []).filter(Boolean))],
    sourceRevision: String(sourceRevision || ''),
    revisionSeq: Math.max(0, Math.floor(Number(revisionSeq) || 0)),
    // 一个 job 只承载一个变更切片；切片超过 8 段时截断并记录剩余（计划预算上限）。
    blocks: sliceIntoBlocks(text, Math.max(1, Math.min(8, maxBlocks))),
    truncated: false,
    attempts: 0,
    formatRepairs: 0,
    status: 'queued',
    lastError: null,
    proposalIds: [],
    unextractableReason: '',
    sessionTag: sessionIdTag(),
    createdAt: now,
    updatedAt: now
  }
  jobs.unshift(job)
  if (!writeJobs(jobs)) {
    return { ok: false, reason: 'storage-failed', job: null }
  }
  return { ok: true, duplicate: false, job }
}

function sessionIdTag() {
  try {
    const key = 'pinax_extraction_session'
    let tag = sessionStorage.getItem(key)
    if (!tag) {
      tag = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      sessionStorage.setItem(key, tag)
    }
    return tag
  } catch {
    return 's_unknown'
  }
}

function sliceIntoBlocks(text, maxBlocks) {
  const value = String(text || '').trim()
  if (!value) return []
  const sentences = value.split(/(?<=[。！？!?])/).map((part) => part.trim()).filter(Boolean)
  if (sentences.length <= maxBlocks) return sentences
  return sentences.slice(0, maxBlocks)
}

export function updateExtractionJob(jobId, patch = {}) {
  const jobs = readJobs()
  const index = jobs.findIndex((job) => job.id === jobId)
  if (index === -1) return { ok: false, reason: 'job-not-found' }
  const next = {
    ...jobs[index],
    ...patch,
    updatedAt: Date.now()
  }
  jobs[index] = next
  if (!writeJobs(jobs)) return { ok: false, reason: 'storage-failed' }
  return { ok: true, job: next }
}

// 刷新后对账：上一会话遗留的 running 任务不可能还在执行，标记中断（failed，
// 可重试），不假称自动续跑成功。只处理一次：interrupted 标记防重复改写。
export function reconcileInterruptedJobs({ now = Date.now() } = {}) {
  const jobs = readJobs()
  let changed = 0
  const next = jobs.map((job) => {
    if (job.status !== 'running') return job
    if (job.sessionTag === sessionIdTag()) return job
    changed += 1
    return {
      ...job,
      status: 'failed',
      lastError: { code: 'interrupted', message: '上次会话中断，任务未完成；可显式重试', retryable: true },
      interruptedAt: now,
      updatedAt: now
    }
  })
  if (changed) writeJobs(next)
  return { interrupted: changed }
}

// 会话总预算：自动派生每会话最多发起的模型请求数；显式重试不计入。
const SESSION_AUTO_BUDGET_KEY = 'pinax_extraction_session_calls'

export function consumeAutoSessionBudget({ limit = 20 } = {}) {
  try {
    const used = Number(sessionStorage.getItem(SESSION_AUTO_BUDGET_KEY) || '0')
    if (used >= limit) return { allowed: false, used, limit }
    sessionStorage.setItem(SESSION_AUTO_BUDGET_KEY, String(used + 1))
    return { allowed: true, used: used + 1, limit }
  } catch {
    return { allowed: true, used: 0, limit }
  }
}

export function peekAutoSessionBudget({ limit = 20 } = {}) {
  try {
    const used = Number(sessionStorage.getItem(SESSION_AUTO_BUDGET_KEY) || '0')
    return { used, limit, allowed: used < limit }
  } catch {
    return { used: 0, limit, allowed: true }
  }
}

// M11：失败/取消任务的显式重排队。只复位任务状态（attempts 归零、清错误），
// 不承诺提取成功；观察器下一轮 drain 或作者手动消费会再次尝试。
export function requeueExtractionJob(jobId) {
  const jobs = readJobs()
  const job = jobs.find(row => row.id === jobId)
  if (!job) return { ok: false, reason: 'job-not-found' }
  if (job.status === 'running') return { ok: false, reason: 'job-running' }
  if (job.status === 'queued') return { ok: true, replay: true, job }
  updateExtractionJob(jobId, { status: 'queued', attempts: 0, lastError: null })
  return { ok: true, replay: false, job: readJobs().find(row => row.id === jobId) }
}
