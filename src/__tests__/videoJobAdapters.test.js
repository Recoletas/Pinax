import { describe, expect, it, vi } from 'vitest'

import { createMinimaxVideoAdapter } from '../../server/media/adapters/minimaxVideo.js'
import { createGenericAsyncHttpAdapter } from '../../server/media/adapters/genericAsyncHttp.js'
import { createProviderRegistry } from '../../server/media/providerRegistry.js'
import { redactSecrets } from '../../server/media/errorNormalization.js'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    json: async () => payload
  }
}

describe('video provider adapters', () => {
  it('covers error hygiene, public config, and generic async completion', async () => {
    {
    const SECRET = 'sk-supersecret-xyz'
    // 1. Table-driven adapter.normalizeError for every status class.
    const cases = [
      { input: { status: 401, message: 'unauthorized' }, code: 'ERR_PROVIDER_AUTH', retryable: false, providerStatus: 401 },
      { input: { status: 403, message: 'forbidden' }, code: 'ERR_PROVIDER_AUTH', retryable: false, providerStatus: 403 },
      { input: { status: 429, message: 'too many' }, code: 'ERR_PROVIDER_RATE_LIMIT', retryable: true, providerStatus: 429 },
      { input: new Error('request timeout'), code: 'ERR_PROVIDER_TIMEOUT', retryable: true },
      { input: new Error('connect ETIMEDOUT'), code: 'ERR_PROVIDER_TIMEOUT', retryable: true },
      { input: { status: 0, message: 'no response' }, code: 'ERR_PROVIDER_TIMEOUT', retryable: true },
      { input: { status: 400, message: 'bad prompt' }, code: 'ERR_PROVIDER_BAD_REQUEST', retryable: false, providerStatus: 400 },
      { input: { status: 502, message: 'bad gateway' }, code: 'ERR_PROVIDER_UPSTREAM', retryable: true, providerStatus: 502 },
      { input: { random: true }, code: 'ERR_PROVIDER_UNKNOWN', retryable: false }
    ]
    const adapter = createMinimaxVideoAdapter({ fetchImpl: vi.fn() })
    for (const c of cases) {
      const out = adapter.normalizeError(c.input)
      expect(out.code).toBe(c.code)
      expect(out.retryable).toBe(c.retryable)
      if (c.providerStatus !== undefined) expect(out.providerStatus).toBe(c.providerStatus)
    }

    // 2. End-to-end: a 429 from submit() leaks NO secret key in normalized details.
    const fetchImpl = vi.fn(async () => jsonResponse(429, 'too many requests'))
    const liveAdapter = createMinimaxVideoAdapter({ fetchImpl })
    let thrown = null
    try {
      await liveAdapter.submit(
        { input: { prompt: 'x', durationSeconds: 6, aspectRatio: '16:9', referenceImages: [] }, model: '' },
        { apiKey: SECRET }
      )
    } catch (err) {
      thrown = err
    }
    expect(thrown).not.toBeNull()
    const normalized = liveAdapter.normalizeError(thrown)
    expect(normalized.code).toBe('ERR_PROVIDER_RATE_LIMIT')
    expect(normalized.retryable).toBe(true)
    // Sanity: status code from the upstream is preserved.
    expect(normalized.providerStatus).toBe(429)
    // The apiKey we passed must not appear anywhere in the normalized error payload.
    expect(JSON.stringify(normalized)).not.toContain(SECRET)

    // 3. Direct redactSecrets handles structured strings the same way.
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).toContain('<redacted>')
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi')
    expect(redactSecrets(`{"apiKey":"${SECRET}","name":"demo"}`)).toContain('<redacted>')
    expect(redactSecrets(`{"apiKey":"${SECRET}","name":"demo"}`)).not.toContain(SECRET)

    // 4. Official MiniMax flow: submit -> query -> retrieve file URL.
    let queryCount = 0
    const minimaxFetch = vi.fn(async (url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase()
      if (method === 'POST' && url.endsWith('/v1/video_generation')) {
        expect(init.headers.Authorization).toBe('Bearer sk-minimax')
        expect(JSON.parse(init.body)).toEqual({
          model: 'MiniMax-Hailuo-2.3',
          prompt: 'a quiet harbor at dawn',
          duration: 6,
          resolution: '768P',
          prompt_optimizer: true,
          aigc_watermark: false,
          fast_pretreatment: false
        })
        return jsonResponse(200, { task_id: 'mm_42', base_resp: { status_code: 0, status_msg: 'success' } })
      }
      if (method === 'GET' && url.includes('/v1/query/video_generation?task_id=mm_42')) {
        queryCount += 1
        return queryCount === 1
          ? jsonResponse(200, { task_id: 'mm_42', status: 'Processing', base_resp: { status_code: 0 } })
          : jsonResponse(200, {
              task_id: 'mm_42', status: 'Success', file_id: 'file_77', video_width: 1366, video_height: 768,
              base_resp: { status_code: 0 }
            })
      }
      if (method === 'GET' && url.includes('/v1/files/retrieve?file_id=file_77')) {
        return jsonResponse(200, {
          file: { download_url: 'https://cdn.minimaxi.com/video/file_77.mp4' },
          base_resp: { status_code: 0 }
        })
      }
      return jsonResponse(404, { base_resp: { status_code: 2013, status_msg: 'unmocked' } })
    })
    const officialAdapter = createMinimaxVideoAdapter({ fetchImpl: minimaxFetch })
    const officialConfig = { apiKey: 'sk-minimax', model: 'MiniMax-Hailuo-2.3', resolution: '768P' }
    const submitted = await officialAdapter.submit({
      model: 'MiniMax-Hailuo-2.3',
      input: { prompt: 'a quiet harbor at dawn', durationSeconds: 6 }
    }, officialConfig)
    expect(submitted.providerJobId).toBe('mm_42')
    expect(await officialAdapter.poll({ providerJobId: 'mm_42' }, officialConfig)).toMatchObject({ status: 'running', progress: 65 })
    const completed = await officialAdapter.poll({ providerJobId: 'mm_42' }, officialConfig)
    expect(completed).toMatchObject({
      status: 'succeeded',
      outputs: [{ url: 'https://cdn.minimaxi.com/video/file_77.mp4', fileId: 'file_77', expiresInSeconds: 3600 }]
    })
    expect(completed.outputs[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
    {
    const registry = createProviderRegistry({ logger: { info() {}, error() {} } })
    const minimaxAdapter = createMinimaxVideoAdapter()
    registry.register({
      id: 'minimax-video',
      adapter: minimaxAdapter,
      label: 'MiniMax Video',
      capabilities: minimaxAdapter.getCapabilities(),
      publicConfigKeys: minimaxAdapter.publicConfigKeys
    })
    const publicList = registry.listPublic()
    const minimax = publicList.find((p) => p.id === 'minimax-video')
    expect(minimax.configKeys.map((c) => c.key).sort()).toEqual([
      'apiKey', 'baseUrl', 'model', 'resolution', 'promptOptimizer', 'fastPretreatment', 'aigcWatermark'
    ].sort())
    expect(minimax.capabilities.models).toContain('MiniMax-Hailuo-2.3')
    expect(minimax.capabilities.pollIntervalMs).toBe(10000)
    expect(minimax.configKeys.find((c) => c.key === 'apiKey').secret).toBe(true)
    expect(minimax.configKeys.find((c) => c.key === 'baseUrl').secret).toBe(false)

    // Public metadata must never contain a real secret value.
    const json = JSON.stringify(publicList)
    expect(json).not.toContain('Bearer')
    expect(json).not.toMatch(/sk-[A-Za-z0-9]+/)

    // redactConfig still removes secrets at the registry layer for logging safety.
    const redacted = registry.redactConfig({ apiKey: 'sk-actual', baseUrl: 'https://x' })
    expect(redacted.apiKey).toBe('<redacted>')
    expect(redacted.baseUrl).toBe('https://x')

    // redactSecrets handles structured strings the same way.
    expect(redactSecrets('token=abc.def Authorization: Bearer xyz')).toContain('<redacted>')
    }
    {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/jobs')) {
        return jsonResponse(200, { id: 'g_42' })
      }
      if (method === 'GET' && url.includes('/status')) {
        return jsonResponse(200, { status: 'succeeded', output_url: 'https://cdn.example.com/g.mp4' })
      }
      return jsonResponse(404, {})
    })
    const adapter = createGenericAsyncHttpAdapter({ fetchImpl })
    const config = {
      submitUrl: 'https://api.example.com/jobs',
      submitMethod: 'POST',
      submitBodyTemplate: '{"prompt":"{{prompt}}","dur":{{duration}},"ratio":"{{aspectRatio}}"}',
      statusUrl: 'https://api.example.com/status',
      statusPath: 'id',
      statusField: 'status',
      outputUrlPath: 'output_url'
    }
    const submitResult = await adapter.submit({
      input: { prompt: 'a forest', durationSeconds: 8, aspectRatio: '16:9', referenceImages: [] },
      model: 'custom-model'
    }, config)
    expect(submitResult.providerJobId).toBe('g_42')

    const pollResult = await adapter.poll({ providerJobId: 'g_42' }, config)
    expect(pollResult.status).toBe('succeeded')
    expect(pollResult.outputs[0].url).toBe('https://cdn.example.com/g.mp4')
    }
  })
})
