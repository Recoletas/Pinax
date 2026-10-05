/**
 * Generic async HTTP video adapter.
 *
 * Constrained-template only. NO arbitrary JS evaluation. All shape and field
 * choices are configured via a static config object describing URLs, methods,
 * static headers, JSON body template with placeholder substitution, success /
 * failure status sets, and the JSON path to the output URL.
 *
 * The "submit body template" supports `{{placeholder}}` substitution against
 * the job's input (prompt / duration / aspectRatio / sourceRefs / referenceImages).
 * Placeholders are intentionally limited to these named slots.
 *
 * providerId: 'generic-async-http'
 */

import { normalizeAdapterError, buildNoOutputError } from '../errorNormalization.js'

const ALLOWED_PLACEHOLDERS = new Set(['prompt', 'duration', 'aspectRatio', 'model', 'referenceImages'])

function getFetch(transport) {
  if (typeof transport === 'function') return transport
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis)
  throw new Error('genericAsyncHttp adapter requires fetchImpl')
}

export function createGenericAsyncHttpAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || null

  function configFor(job, config) {
    return {
      submitUrl: String(config.submitUrl || '').trim(),
      submitMethod: String(config.submitMethod || 'POST').toUpperCase(),
      statusUrl: String(config.statusUrl || '').trim(),
      statusMethod: String(config.statusMethod || 'GET').toUpperCase(),
      cancelUrl: String(config.cancelUrl || '').trim(),
      cancelMethod: String(config.cancelMethod || 'POST').toUpperCase(),
      submitBodyTemplate: String(config.submitBodyTemplate || '{"prompt":"{{prompt}}","duration":{{duration}}}'),
      submitHeaders: config.submitHeaders || {},
      statusHeaders: config.statusHeaders || {},
      cancelHeaders: config.cancelHeaders || {},
      statusPath: String(config.statusPath || 'id'),
      progressPath: String(config.progressPath || 'progress'),
      statusField: String(config.statusField || 'status'),
      outputUrlPath: String(config.outputUrlPath || 'output_url'),
      successStatuses: normalizeStatuses(config.successStatuses, ['succeeded']),
      failureStatuses: normalizeStatuses(config.failureStatuses, ['failed']),
      runningStatuses: normalizeStatuses(config.runningStatuses, ['queued', 'submitted', 'running', 'processing'])
    }
  }

  function validate(config) {
    const cfg = configFor({}, config)
    if (!cfg.submitUrl) return 'submitUrl is required'
    if (!cfg.statusUrl) return 'statusUrl is required'
    if (!cfg.submitBodyTemplate.trim()) return 'submitBodyTemplate is required'
    for (const field of ['submitUrl', 'statusUrl', 'cancelUrl']) {
      if (!cfg[field]) continue
      try {
        const url = new URL(cfg[field].replaceAll('{{providerJobId}}', 'probe'))
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return `${field} must be an HTTP(S) URL without embedded credentials`
      } catch { return `${field} is not a valid URL` }
    }
    for (const field of ['submitMethod', 'statusMethod', 'cancelMethod']) {
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(cfg[field])) return `${field} is unsupported`
    }
    try { JSON.parse(renderTemplate(cfg.submitBodyTemplate, { input: { prompt: 'probe', durationSeconds: 6 } })) }
    catch { return 'submitBodyTemplate must produce valid JSON using the supported placeholders' }
    return null
  }

  function renderTemplate(template, job) {
    const str = String(template)
    const values = {
      prompt: escapeJsonString(job.input?.prompt || ''),
      duration: String(job.input?.durationSeconds || 5),
      aspectRatio: escapeJsonString(job.input?.aspectRatio || '16:9'),
      model: escapeJsonString(job.model || ''),
      referenceImages: JSON.stringify((job.input?.referenceImages || []).map((r) => r.data || r.url || ''))
    }
    return str.replace(/\{\{([A-Za-z]+)\}\}/g, (match, key) => ALLOWED_PLACEHOLDERS.has(key) ? values[key] : match)
  }

  function readPath(obj, path) {
    return String(path || '').split('.').filter(Boolean).reduce((acc, key) => {
      if (acc == null) return undefined
      const match = key.match(/^([^[]+)(?:\[(\d+)\])?$/)
      if (!match) return undefined
      const baseKey = match[1]
      const idx = match[2] != null ? Number(match[2]) : null
      const value = acc[baseKey]
      if (idx != null) return Array.isArray(value) ? value[idx] : undefined
      return value
    }, obj)
  }

  async function submit(job, config, { signal } = {}) {
    const cfg = configFor(job, config)
    const err = validate(cfg)
    if (err) throw new Error(`genericAsyncHttp: ${err}`)
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const headers = { 'Content-Type': 'application/json', ...cfg.submitHeaders }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const response = await transport(cfg.submitUrl, {
      method: cfg.submitMethod,
      signal,
      redirect: 'error',
      headers,
      body: cfg.submitMethod === 'GET' || cfg.submitMethod === 'HEAD'
        ? undefined
        : renderTemplate(cfg.submitBodyTemplate, job)
    })
    if (!response.ok) {
      const text = await safeText(response)
      throw makeHttpError(response.status, text, 'submit failed')
    }
    const payload = await safeJson(response)
    const providerJobId = readPath(payload, cfg.statusPath)
    if (!providerJobId) throw new Error('genericAsyncHttp: submit response missing statusPath value')
    return { providerJobId: String(providerJobId), progress: 5 }
  }

  async function poll(job, config, { signal } = {}) {
    const cfg = configFor(job, config)
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const providerJobId = job.providerJobId
    if (!providerJobId) throw new Error('genericAsyncHttp: poll called without providerJobId')
    // The statusUrl may contain a {{providerJobId}} placeholder, OR be a base that takes ?id=.
    let url = cfg.statusUrl
    if (url.includes('{{providerJobId}}')) {
      url = url.replace(/\{\{providerJobId\}\}/g, encodeURIComponent(providerJobId))
    } else {
      const parsed = new URL(url)
      parsed.searchParams.set('id', providerJobId)
      url = parsed.toString()
    }
    const headers = { Accept: 'application/json', ...cfg.statusHeaders }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const response = await transport(url, { method: cfg.statusMethod, headers, signal, redirect: 'error' })
    if (!response.ok) {
      const text = await safeText(response)
      throw makeHttpError(response.status, text, 'poll failed')
    }
    const payload = await safeJson(response)
    const rawStatus = String(readPath(payload, cfg.statusField) || '').trim().toLowerCase()
    const progress = Number(readPath(payload, cfg.progressPath))
    if (cfg.successStatuses.includes(rawStatus)) {
      const outputUrl = readPath(payload, cfg.outputUrlPath)
      if (typeof outputUrl !== 'string' || !/^https?:\/\//i.test(outputUrl)) {
        throw buildNoOutputError('genericAsyncHttp: success status but output_url missing or invalid')
      }
      return { status: 'succeeded', progress: 100, outputs: [{ url: outputUrl, kind: 'video' }] }
    }
    if (cfg.failureStatuses.includes(rawStatus)) {
      return { status: 'failed', error: { code: 'ERR_PROVIDER_UPSTREAM', message: payload?.error || payload?.message || 'provider reported failure' } }
    }
    if (['cancelled', 'canceled'].includes(rawStatus)) return { status: 'cancelled' }
    if (!cfg.runningStatuses.includes(rawStatus)) throw new Error('genericAsyncHttp: unrecognized task status')
    return {
      status: 'running',
      progress: Number.isFinite(progress) ? progress : 50
    }
  }

  async function cancel(job, config, { signal } = {}) {
    const cfg = configFor(job, config)
    const providerJobId = job.providerJobId
    if (!cfg.cancelUrl || !providerJobId) return { cancelled: true, local: true }
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const headers = { 'Content-Type': 'application/json', ...cfg.cancelHeaders }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const url = cfg.cancelUrl.replace(/\{\{providerJobId\}\}/g, encodeURIComponent(providerJobId))
    try {
      const response = await transport(url, { method: cfg.cancelMethod, headers, signal, redirect: 'error', body: cfg.cancelMethod === 'GET' || cfg.cancelMethod === 'HEAD' ? undefined : '{}' })
      if (response.status === 404 || response.status === 405) {
        return { cancelled: true, local: true }
      }
      if (!response.ok) {
        const text = await safeText(response)
        throw makeHttpError(response.status, text, 'cancel failed')
      }
      return { cancelled: true, local: false }
    } catch {
      // Normalize to local cancel — provider may not support cancel.
      return { cancelled: true, local: true }
    }
  }

  async function testConnection(config, { signal } = {}) {
    const cfg = configFor({}, config)
    if (!cfg.submitUrl) {
      return { ok: false, reachable: false, authenticated: false, status: 0, latencyMs: 0, message: 'submitUrl is required' }
    }
    const transport = getFetch(fetchImpl || config.__fetchImpl)
    const startedAt = Date.now()
    try {
      const headers = { ...cfg.submitHeaders }
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
      const response = await transport(cfg.submitUrl, { method: 'HEAD', headers, signal, redirect: 'error' })
      return {
        ok: response.ok || response.status === 405,
        reachable: true,
        authenticated: response.status !== 401 && response.status !== 403,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        message: response.ok ? 'connection ok' : 'connection reachable but not ok'
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
      models: [config?.model || 'custom'],
      durationRange: { min: 1, max: 60, default: 5 },
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      supportsReferenceImages: String(config?.submitBodyTemplate || '').includes('{{referenceImages}}'),
      supportsCancel: Boolean(config?.cancelUrl),
      pollIntervalMs: 3000,
      customTemplate: true
    }
  }

  function normalizeError(error) {
    return normalizeAdapterError(error)
  }

  return {
    id: 'generic-async-http',
    label: 'Generic Async HTTP',
    getCapabilities,
    testConnection,
    submit,
    poll,
    cancel,
    normalizeError,
    validate,
    publicConfigKeys: [
      '?baseUrl', '?apiKey', '?model',
      'submitUrl', '?submitMethod', '?submitBodyTemplate', '?submitHeaders',
      'statusUrl', '?statusMethod', '?statusHeaders', '?statusPath', '?statusField', '?progressPath', '?outputUrlPath',
      '?successStatuses', '?failureStatuses', '?runningStatuses',
      '?cancelUrl', '?cancelMethod', '?cancelHeaders'
    ]
  }
}

function normalizeStatuses(value, fallback) {
  return (Array.isArray(value) ? value : fallback).map((item) => String(item).trim().toLowerCase())
}

function escapeJsonString(value) {
  return JSON.stringify(String(value ?? '')).slice(1, -1)
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
