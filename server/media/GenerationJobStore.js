/**
 * In-process store for GenerationJob records.
 *
 * Frozen state machine (per README 4.3):
 *   queued -> submitted -> running -> succeeded | failed | cancelled
 *
 * - `cancelled` may also be entered from `queued`, `submitted`, or `running` via cancel.
 * - Any other transition is illegal and raises ERR_JOB_ILLEGAL_TRANSITION.
 * - Cancelled/succeeded/failed are terminal; re-running an attempt resets attempts++ only on submit.
 */

const STATUSES = Object.freeze({
  QUEUED: 'queued',
  SUBMITTED: 'submitted',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
})

export const JOB_STATUS = STATUSES

const TRANSITIONS = Object.freeze({
  queued: new Set(['submitted', 'failed', 'cancelled']),
  submitted: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['succeeded', 'failed', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set()
})

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

const DEFAULT_TTL_MS = 1000 * 60 * 30 // 30 minutes for non-terminal
const SUCCESS_TTL_MS = 1000 * 60 * 5 // 5 minutes for succeeded
const FAILED_TTL_MS = 1000 * 60 * 5 // 5 minutes for failed/cancelled

export class IllegalTransitionError extends Error {
  constructor(from, to) {
    super(`illegal job transition: ${from} -> ${to}`)
    this.code = 'ERR_JOB_ILLEGAL_TRANSITION'
    this.from = from
    this.to = to
  }
}

export class JobNotFoundError extends Error {
  constructor(id) {
    super(`job not found: ${id}`)
    this.code = 'ERR_JOB_NOT_FOUND'
    this.id = id
  }
}

export function createJobStore(options = {}) {
  const now = () => (typeof options.now === 'function' ? options.now() : Date.now())
  const ttlNonTerminal = options.ttlMs ?? DEFAULT_TTL_MS
  const ttlSuccess = options.successTtlMs ?? SUCCESS_TTL_MS
  const ttlFailed = options.failedTtlMs ?? FAILED_TTL_MS
  const rand = options.random || Math.random
  /** @type {Map<string, object>} */
  const jobs = new Map()

  function createJob(input) {
    const id = `job_${Date.now().toString(36)}_${rand().toString(36).slice(2, 8)}`
    const ts = now()
    const job = {
      id,
      projectId: input.projectId ?? null,
      modality: 'video',
      providerId: input.providerId,
      model: input.model || '',
      status: STATUSES.QUEUED,
      progress: 0,
      input: input.input,
      providerJobId: null,
      outputs: [],
      error: null,
      attempts: 0,
      createdAt: new Date(ts).toISOString(),
      updatedAt: new Date(ts).toISOString()
    }
    jobs.set(id, job)
    return job
  }

  function getJob(id) {
    const job = jobs.get(id)
    if (!job) throw new JobNotFoundError(id)
    return job
  }

  function listJobs() {
    return Array.from(jobs.values())
  }

  function transition(id, toStatus, patch = {}) {
    const job = getJob(id)
    const allowed = TRANSITIONS[job.status]
    if (!allowed || !allowed.has(toStatus)) {
      throw new IllegalTransitionError(job.status, toStatus)
    }
    job.status = toStatus
    if (patch.progress != null) job.progress = patch.progress
    if (patch.providerJobId != null) job.providerJobId = patch.providerJobId
    if (patch.outputs != null) job.outputs = patch.outputs
    if (patch.error != null) job.error = patch.error
    if (patch.attempts != null) job.attempts = patch.attempts
    job.updatedAt = new Date(now()).toISOString()
    return job
  }

  function cancel(id) {
    try {
      const job = getJob(id)
      if (TERMINAL.has(job.status)) return job
      return transition(id, STATUSES.CANCELLED, {
        error: { code: 'ERR_PROVIDER_CANCELLED', message: '任务已取消', retryable: false }
      })
    } catch (err) {
      if (err instanceof JobNotFoundError) throw err
      throw err
    }
  }

  function sweep() {
    const cutoff = now()
    for (const [id, job] of jobs.entries()) {
      const ttl = job.status === STATUSES.SUCCEEDED ? ttlSuccess : TERMINAL.has(job.status) ? ttlFailed : ttlNonTerminal
      const age = cutoff - Date.parse(job.updatedAt)
      if (age > ttl) jobs.delete(id)
    }
  }

  function size() {
    return jobs.size
  }

  function clear() {
    jobs.clear()
  }

  return { createJob, getJob, listJobs, transition, cancel, sweep, size, clear }
}

export function isTerminalStatus(status) {
  return TERMINAL.has(status)
}

export function getAllowedTransitions(fromStatus) {
  return Array.from(TRANSITIONS[fromStatus] || [])
}