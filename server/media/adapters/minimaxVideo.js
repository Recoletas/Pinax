/**
 * MiniMax asynchronous text-to-video adapter (provider id: minimax-video).
 *
 * Official flow:
 *   POST /v1/video_generation
 *   GET  /v1/query/video_generation?task_id=...
 *   GET  /v1/files/retrieve?file_id=...
 */

import { normalizeAdapterError, buildNoOutputError } from '../errorNormalization.js'

const DEFAULT_BASE_URL = 'https://api.minimaxi.com'
const DEFAULT_MODEL = 'MiniMax-Hailuo-2.3'
const MINIMAX_MODELS = Object.freeze([
  'MiniMax-Hailuo-2.3',
  'MiniMax-Hailuo-02',
  'T2V-01-Director',
  'T2V-01'
])
const HAILUO_MODELS = new Set(['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'])
const AUTH_ERROR_CODES = new Set([1004, 2049])
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60

function getFetch(transport) {
  if (typeof transport === 'function') return transport
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis)
  throw new Error('MiniMax adapter requires an injected fetchImpl (no global fetch)')
}

function buildBaseUrl(baseUrl) {
  const normalized = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  return normalized.endsWith('/v1') ? normalized.slice(0, -3) : normalized
}

export function createMinimaxVideoAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || null
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL
  const defaultModel = options.defaultModel || DEFAULT_MODEL
  const defaultPollMs = options.defaultPollMs ?? 10000

  function authHeaders(config) {
    const key = String(config.apiKey || '').trim()
    return key ? { Authorization: `Bearer ${key}` } : {}
  }

  async function requestJson(transport, url, init, fallback) {
    const response = await transport(url, init)
    const payload = await readPayload(response)
    if (!response.ok) {
      throw makeHttpError(response.status, providerMessage(payload), fallback)
    }
    assertProviderSuccess(payload, fallback)
    return payload
  }

  async function submit(job, config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const selectedModel = String(config.model || job.model || defaultModel).trim()
    const generation = normalizeGenerationOptions(job.input || {}, config, selectedModel)
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/v1/video_generation`
    const body = {
      model: selectedModel,
      prompt: generation.prompt,
      duration: generation.duration,
      resolution: generation.resolution,
      prompt_optimizer: config.promptOptimizer !== false,
      aigc_watermark: config.aigcWatermark === true
    }
    if (HAILUO_MODELS.has(selectedModel)) {
      body.fast_pretreatment = config.fastPretreatment === true
    }
    const payload = await requestJson(transport, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
      body: JSON.stringify(body)
    }, 'submit failed')
    const providerJobId = payload?.task_id || null
    if (!providerJobId) throw new Error('MiniMax submit returned no task_id')
    return { providerJobId, progress: 5 }
  }

  async function poll(job, config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const providerJobId = job.providerJobId
    if (!providerJobId) throw new Error('MiniMax poll called without providerJobId')
    const root = buildBaseUrl(config.baseUrl || baseUrl)
    const queryUrl = `${root}/v1/query/video_generation?task_id=${encodeURIComponent(providerJobId)}`
    const payload = await requestJson(transport, queryUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders(config) }
    }, 'poll failed')

    const mapped = mapPollResponse(payload)
    if (mapped.status !== 'succeeded') return mapped

    const fileId = String(payload.file_id || '').trim()
    if (!fileId) throw buildNoOutputError('MiniMax task succeeded but returned no file_id')
    const fileUrl = `${root}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`
    const filePayload = await requestJson(transport, fileUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders(config) }
    }, 'file retrieval failed')
    const downloadUrl = filePayload?.file?.download_url
    if (typeof downloadUrl !== 'string' || !/^https?:\/\//i.test(downloadUrl)) {
      throw buildNoOutputError('MiniMax file retrieval returned no download_url')
    }
    return {
      status: 'succeeded',
      providerStatus: 'Success',
      progress: 100,
      providerJobId,
      outputs: [{
        url: downloadUrl,
        kind: 'video',
        fileId,
        width: numberOrNull(payload.video_width),
        height: numberOrNull(payload.video_height),
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString()
      }]
    }
  }

  async function cancel() {
    // MiniMax's documented video API has no upstream cancellation endpoint.
    return { cancelled: true, local: true }
  }

  async function testConnection(config) {
    const key = String(config.apiKey || '').trim()
    const startedAt = Date.now()
    if (!key) {
      return connectionResult(false, false, false, 0, startedAt, '缺少 API Key')
    }
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/v1/query/video_generation?task_id=pinax_connection_probe`
    try {
      const response = await transport(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders(config) }
      })
      const payload = await readPayload(response)
      const providerCode = getProviderCode(payload)
      const authenticated = response.status < 500
        && response.status !== 401
        && response.status !== 403
        && !AUTH_ERROR_CODES.has(providerCode)
      return connectionResult(
        authenticated,
        true,
        authenticated,
        response.status,
        startedAt,
        authenticated ? 'MiniMax API 鉴权通过' : (providerMessage(payload) || 'MiniMax API 鉴权失败')
      )
    } catch (err) {
      return connectionResult(false, false, false, 0, startedAt, err?.message || 'connection failed')
    }
  }

  function getCapabilities(config) {
    const configuredModel = String(config?.model || '').trim()
    const models = configuredModel && !MINIMAX_MODELS.includes(configuredModel)
      ? [configuredModel, ...MINIMAX_MODELS]
      : [...MINIMAX_MODELS]
    return {
      modality: 'video',
      models,
      durationRange: { min: 6, max: 10, default: 6 },
      durations: [6, 10],
      resolutions: ['768P', '1080P', '720P'],
      aspectRatios: ['16:9'],
      promptMaxChars: 2000,
      supportsReferenceImages: false,
      supportsCancel: false,
      pollIntervalMs: defaultPollMs,
      downloadUrlTtlSeconds: DOWNLOAD_URL_TTL_SECONDS
    }
  }

  return {
    id: 'minimax-video',
    label: 'MiniMax Video',
    getCapabilities,
    testConnection,
    submit,
    poll,
    cancel,
    normalizeError: normalizeAdapterError,
    publicConfigKeys: [
      '?baseUrl',
      'apiKey',
      '?model',
      '?resolution',
      '?promptOptimizer',
      '?fastPretreatment',
      '?aigcWatermark'
    ]
  }
}

function normalizeGenerationOptions(input, config, model) {
  const prompt = String(input.prompt || '').trim()
  if (!prompt) throw makeHttpError(400, 'prompt is required', 'invalid request')
  if (prompt.length > 2000) throw makeHttpError(400, 'prompt exceeds MiniMax 2000 character limit', 'invalid request')

  const duration = Number(input.durationSeconds)
  const resolution = String(config.resolution || (HAILUO_MODELS.has(model) ? '768P' : '720P')).toUpperCase()
  if (HAILUO_MODELS.has(model)) {
    if (!['768P', '1080P'].includes(resolution)) {
      throw makeHttpError(400, `${model} only supports 768P or 1080P`, 'invalid request')
    }
    if (![6, 10].includes(duration) || (resolution === '1080P' && duration !== 6)) {
      throw makeHttpError(400, `${resolution} only supports ${resolution === '1080P' ? '6' : '6 or 10'} seconds`, 'invalid request')
    }
  } else {
    if (!['720P', '1080P'].includes(resolution)) {
      throw makeHttpError(400, `${model} only supports 720P or 1080P`, 'invalid request')
    }
    if (duration !== 6) throw makeHttpError(400, `${model} only supports 6 seconds`, 'invalid request')
  }
  return { prompt, duration, resolution }
}

function mapPollResponse(payload) {
  const status = String(payload?.status || '')
  if (status === 'Success') return { status: 'succeeded', providerStatus: status, progress: 100 }
  if (status === 'Fail') {
    const error = makeProviderError(payload, 'MiniMax video generation failed')
    return { status: 'failed', providerStatus: status, error }
  }
  const progressByStatus = { Preparing: 15, Queueing: 30, Processing: 65 }
  if (!(status in progressByStatus)) {
    throw makeProviderError(payload, `MiniMax returned unknown task status: ${status || 'empty'}`)
  }
  return {
    status: 'running',
    providerStatus: status,
    progress: progressByStatus[status] ?? 30,
    providerJobId: payload?.task_id || null
  }
}

function assertProviderSuccess(payload, fallback) {
  const code = getProviderCode(payload)
  if (code != null && code !== 0) throw makeProviderError(payload, fallback)
}

function getProviderCode(payload) {
  const raw = payload?.base_resp?.status_code
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function providerMessage(payload) {
  if (typeof payload === 'string') return payload.trim()
  return String(payload?.base_resp?.status_msg || payload?.message || payload?.error || '').trim()
}

function makeProviderError(payload, fallback) {
  const providerCode = getProviderCode(payload)
  const message = providerMessage(payload) || fallback
  const status = providerCodeToHttpStatus(providerCode)
  const err = makeHttpError(status, `MiniMax ${providerCode ?? 'unknown'}: ${message}`, fallback)
  err.providerCode = providerCode
  return err
}

function providerCodeToHttpStatus(code) {
  if (AUTH_ERROR_CODES.has(code)) return 401
  if (code === 1002) return 429
  if ([1008, 1026, 2013].includes(code)) return 400
  return 502
}

function connectionResult(ok, reachable, authenticated, status, startedAt, message) {
  return {
    ok,
    reachable,
    authenticated,
    status,
    latencyMs: Date.now() - startedAt,
    message
  }
}

function numberOrNull(value) {
  if (value == null || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function makeHttpError(status, body, fallback) {
  const err = new Error(`${fallback}: ${status} ${(body || '').slice(0, 200)}`)
  err.status = status
  err.providerStatus = status
  return err
}

async function readPayload(response) {
  try {
    const body = String(await response.text()).slice(0, 4000)
    if (!body) return {}
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  } catch {
    return {}
  }
}
