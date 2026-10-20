import { AsyncLocalStorage } from 'node:async_hooks'
import { KIT_TASK_PLANE_ENDPOINT } from '../../shared/kitTaskPlane.js'
import { normalizeRequestModelConfig } from '../../shared/requestModelConfig.js'

const context = new AsyncLocalStorage()
export const currentRequestModel = () => context.getStore() || null
export function modelRequestContext(req, res, next) {
  const body = req.body || {}
  const input = body.modelConfig || (typeof body.provider === 'object' ? body.provider : body.apiKey && body.model ? body : null)
  try {
    const model = normalizeRequestModelConfig(input)
    if (model && String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) return res.status(403).json({ error: 'ERR_LOCAL_ONLY', message: '此部署只提供服务器已配置的模型。' })
    return context.run(model, next)
  } catch (error) { return res.status(400).json({ error: 'ERR_MODEL_CONFIG', message: error.message }) }
}

let checkedAt = 0
let supported = false
export async function assertRequestModelSupport(model = currentRequestModel()) {
  if (!model) return
  if (!checkedAt || Date.now() - checkedAt > 3000) {
    supported = false
    try {
      const endpoint = process.env.PINAX_ADAPTER_ENDPOINT || KIT_TASK_PLANE_ENDPOINT
      const response = await fetch(new URL('/healthz', endpoint), { signal: AbortSignal.timeout(2000) })
      supported = response.ok && (await response.json()).requestModels === true
    } catch { /* Reject rather than silently using a different model. */ }
    checkedAt = Date.now()
  }
  if (!supported) throw Object.assign(new Error('运行器尚未支持按任务切换模型，请更新运行器后重试。'), { code: 'MODEL_RUNTIME_UPGRADE_REQUIRED' })
}
