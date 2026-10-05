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
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024

export function createVideoJobService(options = {}) {
  const fetchImpl = options.fetchImpl || resolveFetch()
  const baseUrl = options.baseUrl || '/api/media'
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const defaultPollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const defaultMaxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS

  async function request(path, init = {}) {
    if (init.signal?.aborted) throw makeAbortError()
    const url = `${baseUrl}${path}`
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    let timedOut = false
    const abort = () => controller?.abort()
    init.signal?.addEventListener('abort', abort, { once: true })
    const timer = controller ? setTimeout(() => {
      timedOut = true
      controller.abort()
    }, init.timeoutMs ?? defaultTimeoutMs) : null
    try {
      const response = await fetchImpl(url, {
        method: init.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller?.signal || init.signal
      })
      if (init.signal?.aborted) throw makeAbortError()
      const text = await response.text()
      if (init.signal?.aborted) throw makeAbortError()
      const payload = text ? safeParse(text) : null
      if (!response.ok) {
        const err = new Error(payload?.message || `HTTP ${response.status}`)
        err.code = payload?.error || payload?.code || `HTTP_${response.status}`
        err.status = response.status
        err.payload = payload
        throw err
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const err = new Error('视频服务返回了无法读取的结果，请稍后重试')
        err.code = 'ERR_INVALID_RESPONSE'
        throw err
      }
      return payload
    } catch (error) {
      if (init.signal?.aborted) throw makeAbortError()
      if (timedOut) {
        const err = new Error('视频服务响应超时，请稍后查询任务状态')
        err.code = 'ERR_REQUEST_TIMEOUT'
        throw err
      }
      throw error
    } finally {
      if (timer) clearTimeout(timer)
      init.signal?.removeEventListener('abort', abort)
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

  function getJob(id, requestOptions = {}) {
    return request(`/jobs/${encodeURIComponent(id)}`, requestOptions)
  }

  function cancelJob(id) {
    return request(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  }

  async function downloadJobOutput(id, { signal } = {}) {
    if (signal?.aborted) throw makeAbortError()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 65000)
    try {
      const response = await fetchImpl(`${baseUrl}/jobs/${encodeURIComponent(id)}/output`, { signal: controller.signal })
      if (!response.ok) {
        const payload = safeParse(await response.text())
        throw Object.assign(new Error(payload?.message || '视频原件下载失败'), { status: response.status, code: payload?.code || 'ERR_VIDEO_DOWNLOAD_FAILED' })
      }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0]
      if (!['video/mp4', 'video/webm'].includes(mimeType)) throw new Error('服务器未返回可保存的视频文件')
      if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) throw new Error('视频超过 64 MB，请通过原链接下载')
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_DOWNLOAD_BYTES) throw new Error('视频超过 64 MB，请通过原链接下载')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      if (signal?.aborted) throw makeAbortError()
      if (!size) throw new Error('视频原件为空，请重新下载')
      return new Blob(chunks, { type: mimeType })
    } catch (error) {
      if (signal?.aborted) throw makeAbortError()
      if (controller.signal.aborted) throw new Error('视频原件下载超时，请重试保存')
      throw error
    } finally {
      clearTimeout(timer)
      controller.abort()
      signal?.removeEventListener('abort', abort)
    }
  }

  function listProviders() {
    return request('/providers')
  }

  function testProvider(id, config = {}, requestOptions = {}) {
    return request(`/providers/${encodeURIComponent(id)}/test`, {
      ...requestOptions,
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
    let last = await getJob(id, { signal })
    if (signal?.aborted) throw makeAbortError()
    pollOptions.onUpdate?.(last)
    if (isTerminal(last.status)) return last
    for (let i = 0; i < maxPolls; i += 1) {
      if (signal?.aborted) throw makeAbortError()
      await wait(intervalMs, signal)
      last = await getJob(id, { signal })
      if (signal?.aborted) throw makeAbortError()
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
    downloadJobOutput,
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
  err.name = 'AbortError'
  err.code = 'ERR_ABORTED'
  return err
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}
