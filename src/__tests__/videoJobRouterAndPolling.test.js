import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMediaRouter } from '../../server/routes/media.js'
import { createJobStore, JOB_STATUS } from '../../server/media/GenerationJobStore.js'
import { createProviderRegistry } from '../../server/media/providerRegistry.js'
import { createJobRunner } from '../../server/media/jobRunner.js'
import { createMinimaxVideoAdapter } from '../../server/media/adapters/minimaxVideo.js'
import { createGenericAsyncHttpAdapter } from '../../server/media/adapters/genericAsyncHttp.js'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    json: async () => payload
  }
}

function buildTestEnv(options = {}) {
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase()
    if (options.fetchHandler) return options.fetchHandler(url, init, method)
    return jsonResponse(404, { error: 'unmocked' })
  })
  const minimaxAdapter = options.minimaxAdapter || createMinimaxVideoAdapter({ fetchImpl })
  const genericAdapter = createGenericAsyncHttpAdapter({ fetchImpl })
  const store = createJobStore()
  const registry = createProviderRegistry({ logger: { info() {}, error() {} } })
  registry.register({
    id: minimaxAdapter.id,
    adapter: minimaxAdapter,
    label: minimaxAdapter.label,
    capabilities: minimaxAdapter.getCapabilities(),
    publicConfigKeys: minimaxAdapter.publicConfigKeys
  })
  registry.register({
    id: genericAdapter.id,
    adapter: genericAdapter,
    label: genericAdapter.label,
    capabilities: genericAdapter.getCapabilities(),
    publicConfigKeys: genericAdapter.publicConfigKeys
  })
  const runner = createJobRunner({ store, registry, logger: { info() {}, error() {} }, options: { initialPollMs: 5, maxPollMs: 10, jitterMs: 0 } })
  const router = createMediaRouter({ store, registry, runner, minimaxAdapter, genericAdapter, logger: { info() {}, error() {} } })
  return { router, store, registry, runner, minimaxAdapter, genericAdapter, fetchImpl }
}

function invokeRouter(router, method, path, body) {
  return new Promise((resolve) => {
    const layers = router.stack.filter((layer) => layer.route)
    for (const layer of layers) {
      const route = layer.route
      const params = matchPath(route.path, path)
      if (!params) continue
      const stack = route.stack.filter((item) => item.method === method.toLowerCase())
      if (!stack.length) continue
      const reqLike = { method, path, params, body, query: {} }
      const resLike = makeResLike(resolve)
      try {
        stack[0].handle(reqLike, resLike, (err) => {
          if (err) resolve({ status: 500, body: { error: 'ERR_INTERNAL', message: err?.message || String(err) } })
        })
      } catch (err) {
        resolve({ status: 500, body: { error: 'ERR_INTERNAL', message: err.message } })
      }
      return
    }
    resolve({ status: 404, body: { error: 'ERR_NO_ROUTE', message: `no route for ${method} ${path}` } })
  })
}

function matchPath(routePath, fullPath) {
  const norm = (p) => {
    const arr = String(p || '').split('?')[0].split('/').filter(Boolean)
    return arr.length ? arr : ['']
  }
  const routeParts = norm(routePath)
  const fullParts = norm(fullPath)
  if (routeParts.length !== fullParts.length) return null
  const out = {}
  for (let i = 0; i < routeParts.length; i += 1) {
    if (routeParts[i].startsWith(':')) {
      out[routeParts[i].slice(1)] = decodeURIComponent(fullParts[i] || '')
    } else if (routeParts[i] !== fullParts[i]) {
      return null
    }
  }
  return out
}

function makeResLike(resolve) {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(payload) {
      this.body = payload
      resolve({ status: this.statusCode, body: payload })
      return this
    },
    send(payload) {
      this.body = payload
      resolve({ status: this.statusCode, body: payload })
      return this
    }
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
  }
}

describe('media router POST /api/media/jobs → cancel end-to-end with AbortSignal stopping polling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('router POST /api/media/jobs → cancel end-to-end with AbortSignal stopping polling', async () => {
    let pollCount = 0

    const { router, store, runner } = buildTestEnv({
      fetchHandler: async (url, _init, method) => {
        if (method === 'POST' && url.endsWith('/v1/video_generation')) {
          return jsonResponse(200, { task_id: 'p_77', base_resp: { status_code: 0 } })
        }
        if (method === 'GET' && url.includes('/v1/query/video_generation?task_id=p_77')) {
          pollCount += 1
          // Stay in Processing forever so only local cancellation ends the loop.
          return jsonResponse(200, { task_id: 'p_77', status: 'Processing', base_resp: { status_code: 0 } })
        }
        return jsonResponse(404, { error: 'unmocked' })
      }
    })

    // 1. POST /api/media/jobs creates the job and returns 201.
    const created = await invokeRouter(router, 'POST', '/api/media/jobs', {
      providerId: 'minimax-video',
      model: 'MiniMax-Hailuo-2.3',
      input: { prompt: 'a sunset', durationSeconds: 6, aspectRatio: '16:9', sourceRefs: [], referenceImages: [] },
      providerConfig: { apiKey: 'sk-test', model: 'MiniMax-Hailuo-2.3', resolution: '768P' }
    })
    expect(created.status).toBe(201)
    const jobId = created.body.id

    // 2. Let the runner submit + run at least one poll cycle.
    await flushMicrotasks()
    await vi.runOnlyPendingTimersAsync()
    expect(pollCount).toBeGreaterThanOrEqual(1)
    expect(store.getJob(jobId).status).toBe(JOB_STATUS.RUNNING)

    // 3. POST /api/media/jobs/:id/cancel moves the job to cancelled.
    const cancelled = await invokeRouter(router, 'POST', `/api/media/jobs/${jobId}/cancel`, {})
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.status).toBe(JOB_STATUS.CANCELLED)
    expect(cancelled.body.error?.code).toBe('ERR_PROVIDER_CANCELLED')

    // 4. AbortSignal: the runner has flipped its internal aborted flag and cleared
    //    the polling timer; further ticks must NOT issue another poll fetch.
    const pollsAtCancel = pollCount
    await flushMicrotasks()
    await vi.runOnlyPendingTimersAsync()
    await flushMicrotasks()
    await vi.runOnlyPendingTimersAsync()
    await flushMicrotasks()
    await vi.runOnlyPendingTimersAsync()

    const final = store.getJob(jobId)
    expect(final.status).toBe(JOB_STATUS.CANCELLED)
    // The polling loop must have stopped — no new fetches after cancel landed.
    expect(pollCount).toBe(pollsAtCancel)

    runner.shutdown()
  })
})
