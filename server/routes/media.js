/**
 * Video media router — frozen API surface (README 4.3).
 *
 *   POST   /api/media/jobs               create
 *   GET    /api/media/jobs/:id           get
 *   POST   /api/media/jobs/:id/cancel    cancel
 *   GET    /api/media/providers          list providers (public-safe metadata)
 *   POST   /api/media/providers/:id/test test connection
 *
 * Validates prompt, duration, aspect ratio, sourceRefs, referenceImages and
 * provider config. Never returns apiKey/secret to the browser. Adheres to the
 * generation job state machine.
 */

import { Router } from 'express'
import { createJobStore, JobNotFoundError, IllegalTransitionError, isTerminalStatus } from '../media/GenerationJobStore.js'
import { createProviderRegistry } from '../media/providerRegistry.js'
import { createJobRunner } from '../media/jobRunner.js'
import { createMinimaxVideoAdapter } from '../media/adapters/minimaxVideo.js'
import { createGenericAsyncHttpAdapter } from '../media/adapters/genericAsyncHttp.js'
import { redactSecrets } from '../media/errorNormalization.js'
import { downloadVideoOutput } from '../media/videoOutputDownload.js'

const ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4'])
const MIN_DURATION = 1
const MAX_DURATION = 60
const MAX_PROMPT_CHARS = 4000
const MAX_REFERENCES = 4
const MAX_REFERENCE_IMAGE_CHARS = 3_000_000

export function createMediaRouter(options = {}) {
  const logger = options.logger || console
  const store = options.store || createJobStore()
  const registry = options.registry || createProviderRegistry({ logger })
  const runner = options.runner || createJobRunner({ store, registry, logger })
  const minimaxAdapter = options.minimaxAdapter || createMinimaxVideoAdapter()
  const genericAdapter = options.genericAdapter || createGenericAsyncHttpAdapter()
  let activeDownloads = 0

  // Register default adapters (idempotent — registry dedupes by id).
  if (!registry.get(minimaxAdapter.id)) registry.register(toPublicProvider(minimaxAdapter))
  if (!registry.get(genericAdapter.id)) registry.register(toPublicProvider(genericAdapter))

  const router = Router()

  router.post('/api/media/jobs', (req, res) => {
    const body = req.body || {}
    const validation = validateCreateJobBody(body)
    if (!validation.ok) return res.status(400).json(validation.error)
    const configValidation = registry.validateConfig(validation.sanitized.providerId, validation.sanitized.providerConfig)
    if (!configValidation.ok) return res.status(400).json(configValidation.error)
    const providerConfig = configValidation.sanitized
    const adapter = registry.get(validation.sanitized.providerId).adapter
    const configError = adapter.validate?.(providerConfig)
    if (configError) return res.status(400).json({ code: 'ERR_PROVIDER_CONFIG_INVALID', message: configError })
    try {
      adapter.validateInput?.(validation.sanitized.input, providerConfig, validation.sanitized.model)
    } catch (err) {
      return res.status(400).json({ code: 'ERR_INVALID_INPUT', message: redactSecrets(err?.message || '视频参数无效') })
    }
    store.sweep?.()

    const job = store.createJob({
      projectId: validation.sanitized.projectId,
      providerId: validation.sanitized.providerId,
      model: String(providerConfig.model || validation.sanitized.model || ''),
      input: validation.sanitized.input
    })

    // Configuration can contain credentials in custom headers and URL queries.
    logger.info?.(`[media] job created id=${job.id} provider=${job.providerId}`)

    runner.submit(job, providerConfig)
    return res.status(201).json(publicJob(job))
  })

  router.get('/api/media/jobs/:id', (req, res) => {
    try {
      const job = store.getJob(req.params.id)
      return res.json(publicJob(job))
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        return res.status(404).json({ error: 'ERR_JOB_NOT_FOUND', message: '任务不存在' })
      }
      return res.status(500).json({ error: 'ERR_INTERNAL', message: '查询任务失败' })
    }
  })

  // Only a completed job's recorded output can be downloaded. Never accept a
  // caller-supplied URL or forward provider credentials to the file host.
  router.get('/api/media/jobs/:id/output', async (req, res) => {
    let job
    try { job = store.getJob(req.params.id) } catch {
      return res.status(404).json({ code: 'ERR_JOB_NOT_FOUND', message: '任务记录已失效，请通过已有原链接下载' })
    }
    const output = job.outputs?.find((item) => /^https?:\/\//i.test(item?.url))
    if (job.status !== 'succeeded' || !output) return res.status(409).json({ code: 'ERR_VIDEO_NOT_READY', message: '视频尚未生成完成' })
    if (activeDownloads >= 2) return res.status(429).json({ code: 'ERR_VIDEO_DOWNLOAD_BUSY', message: '正在保存其他视频，请稍后重试' })
    const controller = new AbortController()
    const stop = () => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', stop)
    res.once('close', stop)
    if (req.aborted || res.destroyed) controller.abort()
    activeDownloads += 1
    try {
      const { binary, mimeType } = await (options.downloadVideoOutput || downloadVideoOutput)(output.url, { signal: controller.signal })
      if (controller.signal.aborted || res.destroyed) return
      const extension = mimeType === 'video/webm' ? 'webm' : 'mp4'
      const filename = `pinax-video-${String(job.id).replace(/[^a-zA-Z0-9_-]/g, '')}.${extension}`
      res.set({ 'Content-Type': mimeType, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${filename}"` })
      return res.send(binary)
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return
      return res.status(error.status || 502).json({ code: error.code || 'ERR_VIDEO_DOWNLOAD_FAILED', message: error.message || '视频原件下载失败，请稍后重试' })
    } finally {
      activeDownloads -= 1
      req.off('aborted', stop)
      res.off('close', stop)
    }
  })

  router.post('/api/media/jobs/:id/cancel', (req, res) => {
    let job
    try {
      job = store.getJob(req.params.id)
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        return res.status(404).json({ error: 'ERR_JOB_NOT_FOUND', message: '任务不存在' })
      }
      return res.status(500).json({ error: 'ERR_INTERNAL', message: '查询任务失败' })
    }
    if (isTerminalStatus(job.status)) {
      return res.status(409).json({ error: 'ERR_JOB_TERMINAL', message: `任务已 ${job.status}，无法取消` })
    }
    try {
      runner.cancel(req.params.id)
      const refreshed = store.getJob(req.params.id)
      return res.json(publicJob(refreshed))
    } catch (err) {
      if (err instanceof IllegalTransitionError) {
        return res.status(409).json({ error: err.code, message: err.message })
      }
      logger.error?.('[media] cancel failed', err?.message || err)
      return res.status(500).json({ error: 'ERR_INTERNAL', message: '取消失败' })
    }
  })

  router.get('/api/media/providers', (_req, res) => {
    return res.json({ providers: registry.listPublic() })
  })

  router.post('/api/media/providers/:id/test', async (req, res) => {
    const id = req.params.id
    const entry = registry.get(id)
    if (!entry) {
      return res.status(404).json({ error: 'ERR_PROVIDER_UNKNOWN', message: `provider 不存在: ${id}` })
    }
    const body = req.body || {}
    const validation = registry.validateConfig(id, body)
    if (!validation.ok) {
      return res.status(400).json(validation.error)
    }
    const configError = entry.adapter.validate?.(validation.sanitized)
    if (configError) return res.status(400).json({ code: 'ERR_PROVIDER_CONFIG_INVALID', message: configError })
    const controller = new AbortController()
    let timeoutId
    try {
      const timeout = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => { controller.abort(); reject(new Error('连接检查超时')) }, 15000)
      })
      const result = await Promise.race([
        entry.adapter.testConnection(validation.sanitized, { signal: controller.signal }),
        timeout
      ])
      return res.json({
        ok: Boolean(result.ok),
        reachable: Boolean(result.reachable),
        authenticated: Boolean(result.authenticated),
        status: result.status ?? 0,
        latencyMs: result.latencyMs ?? 0,
        message: redactSecrets(result.message || '') || ''
      })
    } catch (err) {
      return res.status(500).json({ error: 'ERR_INTERNAL', message: redactSecrets(err?.message || '测试失败') })
    } finally {
      clearTimeout(timeoutId)
    }
  })

  router.mediaRuntime = {
    store,
    registry,
    runner,
    shutdown: () => runner.shutdown()
  }

  return router
}

function publicJob(job) {
  return {
    id: job.id,
    projectId: job.projectId ?? null,
    modality: 'video',
    providerId: job.providerId,
    model: job.model,
    status: job.status,
    progress: job.progress,
    input: job.input,
    providerJobId: job.providerJobId ?? null,
    outputs: job.outputs || [],
    error: job.error || null,
    attempts: job.attempts || 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }
}

function validateCreateJobBody(body) {
  const { providerId, model, projectId, input } = body
  if (!providerId || typeof providerId !== 'string') {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'providerId 必填且必须为字符串' } }
  }
  if (projectId != null && (typeof projectId !== 'string' || !projectId.trim() || projectId.length > 160)) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'projectId 必须是有效的作品编号' } }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'input 必填且必须为对象' } }
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'input.prompt 必填' } }
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: `prompt 长度超过 ${MAX_PROMPT_CHARS}` } }
  }
  const duration = Number(input.durationSeconds)
  if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: `durationSeconds 必须在 ${MIN_DURATION}-${MAX_DURATION}` } }
  }
  const aspectRatio = String(input.aspectRatio || '16:9')
  if (!ASPECT_RATIOS.has(aspectRatio)) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: `aspectRatio 必须是 ${Array.from(ASPECT_RATIOS).join(', ')} 之一` } }
  }
  const sourceRefs = Array.isArray(input.sourceRefs)
    ? input.sourceRefs.slice(0, 20).map(sanitizeSourceRef).filter(Boolean)
    : []
  if (input.referenceImages != null && (!Array.isArray(input.referenceImages) || input.referenceImages.length > MAX_REFERENCES)) {
    return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: `referenceImages 必须是最多 ${MAX_REFERENCES} 张图片的数组` } }
  }
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages : []
  for (const reference of referenceImages) {
    if (!reference || typeof reference !== 'object') {
      return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'referenceImages 项格式无效' } }
    }
    if (typeof reference.data !== 'string' || !/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(reference.data)) {
      return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: 'referenceImages 项必须是 data:image/ URL' } }
    }
    if (reference.data.length > MAX_REFERENCE_IMAGE_CHARS) {
      return { ok: false, error: { code: 'ERR_INVALID_INPUT', message: '单张参考图超过大小限制' } }
    }
  }

  // Provider config lives in `providerConfig` (kept separate from job metadata for security).
  const providerConfig = (body.providerConfig && typeof body.providerConfig === 'object' && !Array.isArray(body.providerConfig))
    ? body.providerConfig
    : {}
  return {
    ok: true,
    sanitized: {
      providerId,
      model: typeof model === 'string' ? model : '',
      projectId: projectId ?? null,
      input: { prompt, durationSeconds: duration, aspectRatio, sourceRefs, referenceImages: referenceImages.map((item) => ({ data: item.data })) },
      providerConfig
    }
  }
}

function sanitizeSourceRef(ref) {
  if (typeof ref === 'string') return ref.slice(0, 240)
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null
  const refType = String(ref.refType || ref.type || '').trim().slice(0, 80)
  const refId = String(ref.refId || ref.id || '').trim().slice(0, 160)
  if (!refType || !refId) return null
  return {
    refType,
    refId,
    projectId: ref.projectId == null ? null : String(ref.projectId).slice(0, 160),
    version: ref.version == null ? null : String(ref.version).slice(0, 160),
    excerpt: String(ref.excerpt || '').slice(0, 240)
  }
}

function toPublicProvider(adapter) {
  return {
    id: adapter.id,
    adapter,
    label: adapter.label,
    capabilities: adapter.getCapabilities(),
    publicConfigKeys: adapter.publicConfigKeys || []
  }
}

export default createMediaRouter
