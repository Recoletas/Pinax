/**
 * Image proxy router — 内置 MiniMax 图片模型的服务器代理。
 *
 * 浏览器端图片直连 MiniMax (携带用户自己的 key); 内置配置的 key 由服务器持有,
 * 浏览器只提交哨兵/空 key, 本路由负责: 校验 → 解析服务器 key → 转发 → 回传图片。
 *
 *   POST /api/media/images
 */
import { Router } from 'express'
import { resolveMiniMaxApiKey } from '../../shared/textModelKeys.js'
import { redactSecrets } from '../media/errorNormalization.js'
import { buildMiniMaxImageSize, normalizeMiniMaxSubjectReferences, MINIMAX_REFERENCE_LIMIT } from '../../shared/minimaxImageRequest.js'

const IMAGE_MODELS = new Set(['image-01', 'image-01-live'])
const MAX_PROMPT_CHARS = 1500

export function createImageRouter(options = {}) {
  const logger = options.logger || console
  const fetchImpl = options.fetchImpl
    || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null)

  const router = Router()

  router.get('/api/media/images/capabilities', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      ok: true,
      version: 2,
      characterReference: true,
      maxReferenceImages: MINIMAX_REFERENCE_LIMIT
    })
  })

  router.post('/api/media/images', async (req, res) => {
    const controller = new AbortController()
    const onDisconnect = () => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', onDisconnect)
    res.once('close', onDisconnect)
    try {
      const body = req.body || {}
      const prompt = String(body.prompt || '').trim()
      if (!prompt) {
        return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: 'prompt 必填' })
      }
      if (prompt.length > MAX_PROMPT_CHARS) {
        return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: `prompt 长度超过 ${MAX_PROMPT_CHARS}` })
      }
      const model = String(body.model || 'image-01')
      if (!IMAGE_MODELS.has(model)) return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: 'MiniMax 图片模型无效' })
      const subjectReferences = normalizeMiniMaxSubjectReferences(body.subjectReferences ?? [])
      const size = buildMiniMaxImageSize({ width: body.width, height: body.height, aspectRatio: body.aspectRatio, model })
      const providerConfig = (body.providerConfig && typeof body.providerConfig === 'object' && !Array.isArray(body.providerConfig))
        ? body.providerConfig
        : {}
      const baseUrl = String(providerConfig.baseUrl || 'https://api.minimaxi.com').trim().replace(/\/+$/, '')
      const key = resolveMiniMaxApiKey({ baseUrl, apiKey: providerConfig.apiKey })
      if (!key) {
        return res.status(400).json({ error: 'ERR_SERVER_KEY_MISSING', message: '服务器未配置 MINIMAX_API_KEY' })
      }
      if (typeof fetchImpl !== 'function') {
        return res.status(500).json({ error: 'ERR_INTERNAL', message: '服务器不支持网络请求' })
      }
      const root = baseUrl.endsWith('/v1') ? baseUrl.slice(0, -3) : baseUrl
      const response = await fetchImpl(`${root}/v1/image_generation`, {
        redirect: 'error',
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          prompt,
          ...size,
          ...(subjectReferences.length ? { subject_reference: subjectReferences } : {}),
          response_format: 'base64',
          n: 1,
          prompt_optimizer: false,
          aigc_watermark: false
        })
      })
      const payload = await readJson(response)
      if (!response.ok) {
        return res.status(502).json({ error: 'ERR_PROVIDER', message: `MiniMax 图片请求失败 (${response.status})` })
      }
      const providerCode = Number(payload?.base_resp?.status_code ?? 0)
      if (providerCode !== 0) {
        const message = String(payload?.base_resp?.status_msg || '生成失败').slice(0, 300)
        return res.status(502).json({ error: 'ERR_PROVIDER', message: `MiniMax Image ${providerCode}: ${message}` })
      }
      const base64 = payload?.data?.image_base64?.[0]
      if (typeof base64 === 'string' && base64.trim()) {
        return res.json({ ok: true, image: `data:image/jpeg;base64,${base64}` })
      }
      const imageUrl = payload?.data?.image_urls?.[0]
      if (typeof imageUrl === 'string' && /^https?:\/\//i.test(imageUrl)) {
        return res.json({ ok: true, image: imageUrl })
      }
      return res.status(502).json({ error: 'ERR_NO_OUTPUT', message: 'MiniMax 未返回图片' })
    } catch (err) {
      if (controller.signal.aborted || res.destroyed) return
      if (err?.code === 'ERR_INVALID_INPUT') return res.status(400).json({ error: err.code, message: err.message })
      logger.error?.('[image] proxy failed', err?.message || err)
      return res.status(500).json({
        error: 'ERR_INTERNAL',
        message: redactSecrets(err?.message || '图片生成失败') || '图片生成失败'
      })
    } finally {
      req.removeListener('aborted', onDisconnect)
      res.removeListener('close', onDisconnect)
    }
  })

  return router
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export default createImageRouter
