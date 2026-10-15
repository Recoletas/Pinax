/**
 * In-process video runner. Each job is submitted exactly once. Transient query
 * failures retry the same upstream task, never create another paid generation.
 */

import { normalizeAdapterError, buildNoOutputError, buildCancelledError, redactSecrets } from './errorNormalization.js'
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
  const controllers = new Map()
  const queued = new Set()
  let running = 0
  let shuttingDown = false
  let exitHooksInstalled = false
  const stop = () => shutdown('process exit')

  function installExitHooks() {
    if (exitHooksInstalled) return
    exitHooksInstalled = true
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    process.once('beforeExit', stop)
  }

  function owns(jobId, ctrl) {
    if (shuttingDown || ctrl.signal.aborted || controllers.get(jobId) !== ctrl) return false
    try { return !isTerminalStatus(store.getJob(jobId).status) } catch { return false }
  }

  function submit(job, providerConfig) {
    if (!job?.id) throw new Error('submit: job.id required')
    if (controllers.has(job.id) || isTerminalStatus(store.getJob(job.id).status)) return job
    if (shuttingDown) return store.cancel(job.id)
    const abortController = new AbortController()
    const ctrl = { abortController, signal: abortController.signal, providerConfig, lastProviderStatus: null }
    controllers.set(job.id, ctrl)
    queued.add(job.id)
    installExitHooks()
    queueMicrotask(drain)
    return job
  }

  function cancel(jobId) {
    const ctrl = controllers.get(jobId)
    const job = store.getJob(jobId)
    if (isTerminalStatus(job.status)) return job
    store.cancel(jobId)
    ctrl?.abortController.abort()
    if (queued.delete(jobId)) controllers.delete(jobId)
    // Cancellation of tracking is immediate. An optional upstream cancellation
    // is best effort and must never keep a local concurrency slot occupied.
    const adapter = registry.get(job.providerId)?.adapter
    if (ctrl && job.providerJobId && adapter) {
      withTimeout((signal) => adapter.cancel(job, ctrl.providerConfig, { signal }), Math.min(cfg.timeoutMs, 10000), 'cancel')
        .catch(() => {})
    }
    return job
  }

  function shutdown(reason = 'shutdown') {
    if (shuttingDown) return
    shuttingDown = true
    for (const [id, ctrl] of controllers) {
      try { store.cancel(id) } catch { /* already removed */ }
      ctrl.abortController.abort()
    }
    queued.clear()
    controllers.clear()
    for (const event of ['SIGINT', 'SIGTERM', 'beforeExit']) process.removeListener(event, stop)
    exitHooksInstalled = false
    logger.info?.(`[media] jobRunner shutdown: ${reason}`)
  }

  function drain() {
    if (shuttingDown) return
    for (const jobId of queued) {
      if (running >= cfg.maxConcurrency) break
      queued.delete(jobId)
      const ctrl = controllers.get(jobId)
      if (!ctrl) continue
      running += 1
      void run(jobId, ctrl).finally(() => {
        if (controllers.get(jobId) === ctrl) controllers.delete(jobId)
        running -= 1
        drain()
      })
    }
  }

  async function run(jobId, ctrl) {
    try {
      if (!owns(jobId, ctrl)) return
      let current = store.getJob(jobId)
      const adapter = registry.get(current.providerId)?.adapter
      if (!adapter) {
        failJob(jobId, normalizeAdapterError(new Error(`unknown provider: ${current.providerId}`)))
        return
      }
      const providerConfig = ctrl.providerConfig
      const normalize = (err) => normalizeAdapterError(adapter.normalizeError ? adapter.normalizeError(err) : err)
      const providerPollMs = resolveProviderPollMs(adapter, providerConfig, cfg)

      // A submission timeout may mean that the provider accepted the request.
      // Do not automatically resubmit requests without an idempotency contract.
      if (!current.providerJobId) {
        store.patchJob(jobId, { attempts: (current.attempts || 0) + 1 })
        let submitted
        try {
          submitted = await withTimeout((signal) => adapter.submit(current, providerConfig, { signal }), cfg.timeoutMs, 'submit', ctrl.signal)
        } catch (err) {
          if (owns(jobId, ctrl)) failJob(jobId, normalize(err))
          return
        }
        if (!owns(jobId, ctrl)) return
        if (!submitted?.providerJobId) {
          failJob(jobId, buildNoOutputError('渠道未返回任务编号，请先确认渠道记录再重新生成'))
          return
        }
        current = store.transition(jobId, JOB_STATUS.SUBMITTED, {
          providerJobId: String(submitted.providerJobId),
          progress: clampProgress(submitted.progress ?? 5)
        })
      }
      // Poll may already be complete on its first response. Enter running before
      // querying so the frozen submitted -> running -> succeeded flow is valid.
      if (current.status === JOB_STATUS.SUBMITTED) current = store.transition(jobId, JOB_STATUS.RUNNING)

      for (let attempt = 1; attempt <= cfg.maxAttempts && owns(jobId, ctrl); attempt += 1) {
        let result
        try {
          result = await withTimeout((signal) => adapter.poll(current, providerConfig, { signal }), cfg.timeoutMs, 'poll', ctrl.signal)
        } catch (err) {
          if (!owns(jobId, ctrl)) return
          const error = normalize(err)
          if (!error.retryable || attempt >= cfg.maxAttempts) {
            failJob(jobId, error)
            return
          }
          await waitForPoll(pollDelayMs(attempt, cfg, providerPollMs), ctrl.signal)
          continue
        }
        if (!owns(jobId, ctrl)) return
        if (!result) {
          failJob(jobId, buildNoOutputError('adapter returned empty poll result'))
          return
        }
        const status = String(result.status || '').toLowerCase()
        const progress = clampProgress(Number.isFinite(result.progress) ? result.progress : current.progress)
        const providerStatus = String(result.providerStatus || '').trim()
        if (providerStatus && providerStatus !== ctrl.lastProviderStatus) {
          ctrl.lastProviderStatus = providerStatus
          logger.info?.(`[media] job provider status id=${jobId} state=${redactSecrets(providerStatus)} progress=${progress}`)
        }
        if (status === JOB_STATUS.SUCCEEDED) {
          const outputs = Array.isArray(result.outputs) ? result.outputs.filter(validVideoOutput) : []
          if (!outputs.length) {
            failJob(jobId, buildNoOutputError())
            return
          }
          store.transition(jobId, JOB_STATUS.SUCCEEDED, { progress: 100, outputs })
          return
        }
        if (status === JOB_STATUS.FAILED) {
          failJob(jobId, normalize(result.error || new Error('provider reported failure')))
          return
        }
        if (status === JOB_STATUS.CANCELLED) {
          store.transition(jobId, JOB_STATUS.CANCELLED, { error: buildCancelledError() })
          return
        }
        if (!['queued', 'submitted', 'running', 'processing'].includes(status)) {
          failJob(jobId, normalize(new Error('渠道返回了无法识别的任务状态')))
          return
        }
        current = store.patchJob(jobId, { progress: Math.max(current.progress, Math.min(progress, 99)) })
        if (attempt < cfg.maxAttempts) await waitForPoll(pollDelayMs(attempt, cfg, providerPollMs), ctrl.signal)
      }
      if (owns(jobId, ctrl)) failJob(jobId, normalize(new Error('视频任务查询超时；请先确认渠道记录再重新生成 (poll timeout)')))
    } catch (err) {
      if (!owns(jobId, ctrl)) return
      logger.error?.(`[media] jobRunner error for ${jobId}:`, redactSecrets(err?.message || 'unknown error'))
      failJob(jobId, normalizeAdapterError(err))
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

  return { submit, cancel, shutdown, getActiveCount: () => running }
}

function validVideoOutput(output) {
  if (!output || typeof output.url !== 'string') return false
  try {
    const url = new URL(output.url)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

function backoffMs(attempt, cfg) {
  return Math.min(cfg.maxPollMs, cfg.initialPollMs * Math.pow(2, Math.max(0, attempt - 1)))
    + Math.floor(Math.random() * cfg.jitterMs)
}

function resolveProviderPollMs(adapter, providerConfig, cfg) {
  try {
    const value = Number(adapter.getCapabilities(providerConfig)?.pollIntervalMs)
    return Number.isFinite(value) && value > 0 ? Math.min(cfg.maxPollMs, value) : 0
  } catch { return 0 }
}

function pollDelayMs(attempt, cfg, providerPollMs) {
  return Math.max(backoffMs(attempt, cfg), providerPollMs || 0)
}

function clampProgress(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

function waitForPoll(ms, signal) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}

async function withTimeout(operation, ms, label, ownerSignal) {
  const controller = new AbortController()
  let timeoutId
  let onAbort
  const interrupted = new Promise((_resolve, reject) => {
    onAbort = () => { controller.abort(); reject(new Error(`${label} aborted`)) }
    ownerSignal?.addEventListener('abort', onAbort, { once: true })
    timeoutId = setTimeout(() => { controller.abort(); reject(new Error(`${label} timeout after ${ms}ms`)) }, ms)
  })
  try {
    if (ownerSignal?.aborted) onAbort()
    return await Promise.race([
      interrupted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error(`${label} aborted`)
        return operation(controller.signal)
      })
    ])
  } finally {
    clearTimeout(timeoutId)
    ownerSignal?.removeEventListener('abort', onAbort)
  }
}
