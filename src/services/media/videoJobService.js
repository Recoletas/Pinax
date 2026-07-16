/**
 * Video Job Service — frontend client for the server-side video job gateway.
 *
 * Talks to the frozen API surface (README 4.3):
 *   POST /api/media/jobs
 *   GET  /api/media/jobs/:id
 *   POST /api/media/jobs/:id/cancel
 *   GET  /api/media/providers
 *   POST /api/media/providers/:id/test
 *
 * No Vue / Pinia / localStorage dependencies. No key persistence. Polling is
 * stoppable via AbortController. Transport (fetchImpl) is injectable for tests.
 */

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_POLL_INTERVAL_MS = 2000
const DEFAULT_MAX_POLLS = 150

export function createVideoJobService(options = {}) {
  const fetchImpl = options.fetchImpl || resolveFetch()
  const baseUrl = options.baseUrl || '/api/media'
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const defaultPollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const defaultMaxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS

  async function request(path, init = {}) {
    const url = `${baseUrl}${path}`
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), init.timeoutMs ?? defaultTimeoutMs) : null
    try {
      const response = await fetchImpl(url, {
        method: init.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller?.signal
      })
      const text = await response.text()
      const payload = text ? safeParse(text) : null
      if (!response.ok) {
        const err = new Error(payload?.message || `HTTP ${response.status}`)
        err.code = payload?.error || `HTTP_${response.status}`
        err.status = response.status
        err.payload = payload
        throw err
      }
      return payload
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  function createJob(input) {
    return request('/jobs', {
      method: 'POST',
      body: {
        providerId: input.providerId,
        model: input.model || '',
        projectId: input.projectId ?? null,
        input: input.input,
        providerConfig: input.providerConfig || {}
      }
    })
  }

  function getJob(id) {
    return request(`/jobs/${encodeURIComponent(id)}`)
  }

  function cancelJob(id) {
    return request(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  }

  function listProviders() {
    return request('/providers')
  }

  function testProvider(id, config = {}) {
    return request(`/providers/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      body: config
    })
  }

  /**
   * Polls until job reaches terminal status or max polls is reached.
   * Returns the final job record. Caller can stop early via the AbortSignal.
   *
   * @param {string} id job id
   * @param {object} [pollOptions]
   * @param {number} [pollOptions.intervalMs]
   * @param {number} [pollOptions.maxPolls]
   * @param {AbortSignal} [pollOptions.signal]
   * @param {(job: object) => void} [pollOptions.onUpdate]
   * @returns {Promise<object>} final job
   */
  async function pollUntilDone(id, pollOptions = {}) {
    const intervalMs = pollOptions.intervalMs ?? defaultPollIntervalMs
    const maxPolls = pollOptions.maxPolls ?? defaultMaxPolls
    const signal = pollOptions.signal
    let last = await getJob(id)
    if (isTerminal(last.status)) return last
    for (let i = 0; i < maxPolls; i += 1) {
      if (signal?.aborted) throw makeAbortError()
      await wait(intervalMs, signal)
      last = await getJob(id)
      pollOptions.onUpdate?.(last)
      if (isTerminal(last.status)) return last
    }
    return last
  }

  function isTerminal(status) {
    return status === 'succeeded' || status === 'failed' || status === 'cancelled'
  }

  return {
    createJob,
    getJob,
    cancelJob,
    listProviders,
    testProvider,
    pollUntilDone,
    isTerminal
  }
}

export const videoJobService = createVideoJobService()

function resolveFetch() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis)
  }
  throw new Error('当前环境不支持网络请求')
}

async function wait(ms, signal) {
  if (signal?.aborted) throw makeAbortError()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, ms)
    const onAbort = () => {
      cleanup()
      reject(makeAbortError())
    }
    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

function makeAbortError() {
  const err = new Error('aborted')
  err.code = 'ERR_ABORTED'
  return err
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}