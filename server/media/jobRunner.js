/**
 * Background job runner.
 *
 * - Bounded concurrency per process.
 * - Exponential backoff poll.
 * - Timeout per attempt; max attempts.
 * - One provider failure does NOT block other jobs.
 * - Hooks process-exit cleanup (SIGINT/SIGTERM/unhandledRejection).
 */

import { normalizeAdapterError, buildNoOutputError, buildCancelledError } from './errorNormalization.js'
import { JOB_STATUS, isTerminalStatus, IllegalTransitionError, JobNotFoundError } from './GenerationJobStore.js'

const DEFAULT_OPTIONS = Object.freeze({
  maxConcurrency: 4,
  initialPollMs: 2000,
  maxPollMs: 30000,
  timeoutMs: 1000 * 60 * 5,
  maxAttempts: 60,
  jitterMs: 250
})

export function createJobRunner({ store, registry, logger = console, options = {} } = {}) {
  if (!store) throw new Error('jobRunner requires a store')
  if (!registry) throw new Error('jobRunner requires a registry')

  const cfg = { ...DEFAULT_OPTIONS, ...options }
  /** @type {Map<string, { aborted: boolean, timer: any|null, attempt: number, timeoutId: any|null, cancelResolve: any }>} */
  const controllers = new Map()
  /** @type {Set<string>} */
  const queued = new Set()
  let running = 0
  let shuttingDown = false
  let exitHooksInstalled = false

  function installExitHooks() {
    if (exitHooksInstalled) return
    exitHooksInstalled = true
    const stop = () => {
      shutdown('process exit')
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    process.once('beforeExit', stop)
  }

  function submit(job, providerConfig) {
    if (!job?.id) throw new Error('submit: job.id required')
    if (queued.has(job.id) || controllers.has(job.id)) {
      return job // idempotent: re-submitting same id is a no-op
    }
    queued.add(job.id)
    // Schedule async — never blocks the caller.
    queueMicrotask(() => pump(job.id, providerConfig))
    return job
  }

  function cancel(jobId) {
    const ctrl = controllers.get(jobId)
    if (ctrl) {
      ctrl.aborted = true
      if (ctrl.timer) clearTimeout(ctrl.timer)
      if (ctrl.timeoutId) clearTimeout(ctrl.timeoutId)
    }
    try {
      store.cancel(jobId)
    } catch (err) {
      if (!(err instanceof JobNotFoundError)) throw err
    }
    queued.delete(jobId)
  }

  function shutdown(reason = 'shutdown') {
    shuttingDown = true
    for (const [id, ctrl] of controllers.entries()) {
      ctrl.aborted = true
      if (ctrl.timer) clearTimeout(ctrl.timer)
      if (ctrl.timeoutId) clearTimeout(ctrl.timeoutId)
      try { store.cancel(id) } catch { /* ignore */ }
    }
    controllers.clear()
    queued.clear()
    logger.info?.(`[media] jobRunner shutdown: ${reason}`)
  }

  async function pump(jobId, providerConfig) {
    queued.delete(jobId)
    if (shuttingDown) {
      try { store.cancel(jobId) } catch { /* ignore */ }
      return
    }
    while (running >= cfg.maxConcurrency) {
      await sleep(50)
      if (shuttingDown) return
    }
    running += 1
    const ctrl = { aborted: false, timer: null, timeoutId: null, attempt: 0, lastProviderStatus: null }
    controllers.set(jobId, ctrl)
    installExitHooks()

    try {
      let job
      try {
        job = store.getJob(jobId)
      } catch (err) {
        if (err instanceof JobNotFoundError) return
        throw err
      }
      if (isTerminalStatus(job.status)) return

      const entry = registry.get(job.providerId)
      if (!entry) {
        failJob(jobId, normalizeAdapterError(new Error(`unknown provider: ${job.providerId}`)))
        return
      }
      const adapter = entry.adapter
      const providerPollMs = resolveProviderPollMs(adapter, providerConfig, cfg)
      let current = job

      // Phase 1: submit
      try {
        const submitResult = await withTimeout(adapter.submit(current, providerConfig), cfg.timeoutMs, 'submit')
        current = store.transition(jobId, JOB_STATUS.SUBMITTED, {
          providerJobId: submitResult?.providerJobId ?? current.providerJobId ?? null,
          attempts: (current.attempts || 0) + 1,
          progress: submitResult?.progress ?? 5
        })
      } catch (err) {
        if (ctrl.aborted) return
        const normalized = adapter.normalizeError ? adapter.normalizeError(err) : normalizeAdapterError(err)
        if (normalized.retryable && (current.attempts || 0) < cfg.maxAttempts) {
          scheduleRetry(jobId, ctrl, () => pump(jobId, providerConfig))
          return
        }
        failJob(jobId, normalized)
        return
      }

      // Phase 2: poll loop
      while (!ctrl.aborted && !shuttingDown) {
        let pollResult
        try {
          pollResult = await withTimeout(adapter.poll(current, providerConfig), cfg.timeoutMs, 'poll')
        } catch (err) {
          const normalized = adapter.normalizeError ? adapter.normalizeError(err) : normalizeAdapterError(err)
          if (normalized.retryable && ctrl.attempt < cfg.maxAttempts) {
            ctrl.attempt += 1
            const delay = backoffMs(ctrl.attempt, cfg)
            ctrl.timer = setTimeout(() => {
              ctrl.timer = null
              pump(jobId, providerConfig)
            }, delay)
            return
          }
          failJob(jobId, normalized)
          return
        }
        if (!pollResult) {
          failJob(jobId, buildNoOutputError('adapter returned empty poll result'))
          return
        }
        const status = String(pollResult.status || '').toLowerCase()
        const progress = Number.isFinite(pollResult.progress) ? pollResult.progress : current.progress
        const providerStatus = String(pollResult.providerStatus || '').trim()
        if (providerStatus && providerStatus !== ctrl.lastProviderStatus) {
          ctrl.lastProviderStatus = providerStatus
          logger.info?.(`[media] job provider status id=${jobId} state=${providerStatus} progress=${progress}`)
        }

        if (status === 'succeeded' || status === JOB_STATUS.SUCCEEDED) {
          const outputs = Array.isArray(pollResult.outputs) ? pollResult.outputs : []
          if (!outputs.length) {
            failJob(jobId, buildNoOutputError())
            return
          }
          store.transition(jobId, JOB_STATUS.SUCCEEDED, {
            progress: 100,
            outputs,
            providerJobId: pollResult.providerJobId ?? current.providerJobId
          })
          return
        }
        if (status === 'failed' || status === JOB_STATUS.FAILED) {
          const normalized = pollResult.error
            ? (adapter.normalizeError ? adapter.normalizeError(pollResult.error) : normalizeAdapterError(pollResult.error))
            : normalizeAdapterError(new Error('provider reported failure'))
          failJob(jobId, normalized)
          return
        }
        if (status === 'cancelled' || status === JOB_STATUS.CANCELLED) {
          try { store.transition(jobId, JOB_STATUS.CANCELLED, { error: buildCancelledError() }) } catch { /* ignore */ }
          return
        }

        // still running
        try {
          const patch = {
            progress: clampProgress(progress),
            providerJobId: pollResult.providerJobId ?? current.providerJobId
          }
          current = current.status === JOB_STATUS.RUNNING
            ? store.patchJob(jobId, patch)
            : store.transition(jobId, JOB_STATUS.RUNNING, patch)
        } catch (err) {
          if (err instanceof IllegalTransitionError) return
          throw err
        }
        ctrl.attempt += 1
        if (ctrl.attempt >= cfg.maxAttempts) {
          failJob(jobId, normalizeAdapterError(new Error('max poll attempts reached')))
          return
        }
        const delay = pollDelayMs(ctrl.attempt, cfg, providerPollMs)
        await new Promise((resolve) => {
          ctrl.timer = setTimeout(() => {
            ctrl.timer = null
            resolve(undefined)
          }, delay)
        })
      }
    } catch (err) {
      logger.error?.(`[media] jobRunner uncaught error for ${jobId}:`, err?.message || err)
      failJob(jobId, normalizeAdapterError(err))
    } finally {
      controllers.delete(jobId)
      running -= 1
    }
  }

  function failJob(jobId, error) {
    try {
      store.transition(jobId, JOB_STATUS.FAILED, { error })
    } catch (err) {
      if (err instanceof IllegalTransitionError || err instanceof JobNotFoundError) return
      throw err
    }
  }

  function scheduleRetry(jobId, ctrl, fn) {
    ctrl.attempt += 1
    const delay = backoffMs(ctrl.attempt, cfg)
    ctrl.timer = setTimeout(() => {
      ctrl.timer = null
      fn()
    }, delay)
  }

  function getActiveCount() {
    return running
  }

  return { submit, cancel, shutdown, getActiveCount }
}

function backoffMs(attempt, cfg) {
  const base = Math.min(cfg.maxPollMs, cfg.initialPollMs * Math.pow(2, Math.max(0, attempt - 1)))
  const jitter = Math.floor(Math.random() * cfg.jitterMs)
  return base + jitter
}

function resolveProviderPollMs(adapter, providerConfig, cfg) {
  try {
    const value = Number(adapter.getCapabilities(providerConfig)?.pollIntervalMs)
    return Number.isFinite(value) && value > 0 ? Math.min(cfg.maxPollMs, value) : 0
  } catch {
    return 0
  }
}

function pollDelayMs(attempt, cfg, providerPollMs) {
  return Math.max(backoffMs(attempt, cfg), providerPollMs || 0)
}

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

async function withTimeout(promise, ms, label) {
  let timeoutId
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([Promise.resolve(promise), timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
