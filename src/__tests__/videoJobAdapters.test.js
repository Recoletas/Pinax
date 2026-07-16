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
        { input: { prompt: 'x', durationSeconds: 1, aspectRatio: '16:9', referenceImages: [] }, model: '' },
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

    // 3. Direct redactSecrets handles structured strings the same way.
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).toContain('<redacted>')
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi')
    expect(redactSecrets(`{"apiKey":"${SECRET}","name":"demo"}`)).toContain('<redacted>')
    expect(redactSecrets(`{"apiKey":"${SECRET}","name":"demo"}`)).not.toContain(SECRET)
    }
    {
    const registry = createProviderRegistry({ logger: { info() {}, error() {} } })
    registry.register({
      id: 'minimax-video',
      adapter: createMinimaxVideoAdapter(),
      label: 'MiniMax Video',
      capabilities: {},
      publicConfigKeys: ['baseUrl', 'apiKey', 'model']
    })
    const publicList = registry.listPublic()
    const minimax = publicList.find((p) => p.id === 'minimax-video')
    expect(minimax.configKeys.map((c) => c.key).sort()).toEqual(['apiKey', 'baseUrl', 'model'].sort())
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
