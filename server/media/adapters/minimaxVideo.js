/**
 * MiniMax async video adapter (provider id: minimax-video).
 *
 * Implements the frozen adapter interface:
 *   getCapabilities / testConnection / submit / poll / cancel / normalizeError
 *
 * HTTP transport is injected via `fetchImpl`; tests inject a mock. Never makes
 * real provider calls from tests. All URLs/headers/config are passed through
 * runtime config so the adapter can target any MiniMax-compatible endpoint.
 *
 * Cancel may be provider-restricted. When the upstream cancel call fails, we
 * normalize to a local cancel and stop polling — the runner will stop retrying.
 */

import { normalizeAdapterError, buildNoOutputError, buildCancelledError } from '../errorNormalization.js'

const DEFAULT_BASE_URL = 'https://api.MiniMax.video/v1'
const DEFAULT_MODEL = 'MiniMax-video-01'

function getFetch(transport) {
  if (typeof transport === 'function') return transport
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis)
  throw new Error('MiniMax adapter requires an injected fetchImpl (no global fetch)')
}

function buildBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}

export function createMinimaxVideoAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || null
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL
  const defaultModel = options.defaultModel || DEFAULT_MODEL
  const defaultPollMs = options.defaultPollMs ?? 4000

  function authHeaders(config) {
    const key = String(config.apiKey || '').trim()
    return key ? { Authorization: `Bearer ${key}` } : {}
  }

  async function submit(job, config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/video/generations`
    const body = {
      model: config.model || job.model || defaultModel,
      prompt: job.input?.prompt || '',
      duration: job.input?.durationSeconds || 5,
      aspect_ratio: job.input?.aspectRatio || '16:9'
    }
    if (Array.isArray(job.input?.referenceImages) && job.input.referenceImages.length) {
      body.reference_images = job.input.referenceImages.map((r) => r.data || r.url || '')
    }
    const response = await transport(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const text = await safeText(response)
      throw makeHttpError(response.status, text, 'submit failed')
    }
    const payload = await safeJson(response)
    const providerJobId = payload?.task_id || payload?.id || payload?.job_id || null
    if (!providerJobId) throw new Error('MiniMax submit returned no providerJobId')
    return { providerJobId, progress: 5 }
  }

  async function poll(job, config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const providerJobId = job.providerJobId
    if (!providerJobId) throw new Error('MiniMax poll called without providerJobId')
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/video/generations/${encodeURIComponent(providerJobId)}`
    const response = await transport(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders(config) }
    })
    if (!response.ok) {
      const text = await safeText(response)
      throw makeHttpError(response.status, text, 'poll failed')
    }
    const payload = await safeJson(response)
    return mapPollResponse(payload)
  }

  async function cancel(job, config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const providerJobId = job.providerJobId
    if (!providerJobId) return { cancelled: true, local: true }
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/video/generations/${encodeURIComponent(providerJobId)}/cancel`
    try {
      const response = await transport(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
        body: '{}'
      })
      if (response.status === 404 || response.status === 405) {
        // Provider doesn't support cancel via API — caller should normalize locally.
        return { cancelled: true, local: true }
      }
      if (!response.ok) {
        const text = await safeText(response)
        throw makeHttpError(response.status, text, 'cancel failed')
      }
      return { cancelled: true, local: false }
    } catch (err) {
      // Provider-restricted: surface a structured error so runner can normalize locally.
      throw buildCancelledError()
    }
  }

  async function testConnection(config) {
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const url = `${buildBaseUrl(config.baseUrl || baseUrl)}/models`
    const startedAt = Date.now()
    try {
      const response = await transport(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders(config) }
      })
      const text = await safeText(response)
      return {
        ok: response.ok,
        reachable: true,
        authenticated: response.status !== 401 && response.status !== 403,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        message: response.ok ? 'connection ok' : text.slice(0, 200)
      }
    } catch (err) {
      return {
        ok: false,
        reachable: false,
        authenticated: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        message: err?.message || 'connection failed'
      }
    }
  }

  function getCapabilities(config) {
    return {
      modality: 'video',
      models: [config?.model || defaultModel],
      durationRange: { min: 1, max: 30, default: 5 },
      aspectRatios: ['16:9', '9:16', '1:1'],
      supportsReferenceImages: true,
      supportsCancel: true,
      pollIntervalMs: defaultPollMs
    }
  }

  function normalizeError(error) {
    return normalizeAdapterError(error)
  }

  return {
    id: 'minimax-video',
    label: 'MiniMax Video',
    getCapabilities,
    testConnection,
    submit,
    poll,
    cancel,
    normalizeError,
    publicConfigKeys: ['baseUrl', 'apiKey', 'model']
  }
}

function mapPollResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'running', progress: 50 }
  }
  const status = String(payload.status || '').toLowerCase()
  if (status === 'succeeded' || status === 'success' || status === 'completed') {
    const outputs = extractOutputs(payload)
    if (!outputs.length) throw buildNoOutputError('MiniMax poll reported success but no video_url')
    return { status: 'succeeded', progress: 100, outputs, providerJobId: payload.task_id || payload.id || null }
  }
  if (status === 'failed' || status === 'error') {
    return { status: 'failed', error: { code: 'ERR_PROVIDER_UPSTREAM', message: payload?.error || 'provider reported failure' } }
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { status: 'cancelled' }
  }
  const progress = Number(payload.progress)
  return {
    status: 'running',
    progress: Number.isFinite(progress) ? progress : 50,
    providerJobId: payload.task_id || payload.id || null
  }
}

function extractOutputs(payload) {
  const out = []
  const candidates = [
    payload.video_url,
    payload.output_url,
    payload.outputs?.[0]?.url,
    payload.data?.video_url,
    payload.data?.output_url
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      out.push({ url: candidate, kind: 'video' })
    }
  }
  return out
}

function makeHttpError(status, body, fallback) {
  const err = new Error(`${fallback}: ${status} ${(body || '').slice(0, 200)}`)
  err.status = status
  err.providerStatus = status
  return err
}

async function safeText(response) {
  try {
    return String(await response.text()).slice(0, 1000)
  } catch {
    return ''
  }
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}