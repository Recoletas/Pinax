// Request-scoped model selection. Never put this object in prompts or task logs.
export function normalizeRequestModelConfig(input) {
  if (!input || input.builtin || input.serverKey || input.apiKey === 'kernel-managed' || input.provider === 'kernel') return null
  const provider = String(input.providerId || input.provider || input.id || 'custom').trim()
  const model = String(input.model || '').trim()
  const baseUrl = String(input.baseUrl || '').trim()
  const apiKey = String(input.apiKey || '').trim()
  if (!model || model.length > 240 || !apiKey || apiKey.length > 8192 || !/^[a-zA-Z0-9_-]{1,80}$/.test(provider)) throw new Error('模型配置不完整，请检查模型名称与密钥。')
  let url
  try { url = new URL(baseUrl) } catch { throw new Error('模型服务地址无效。') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || baseUrl.length > 2048) throw new Error('模型服务地址无效。')
  const api = input.api || (input.format === 'anthropic' || provider === 'anthropic' || /\/anthropic|api\.anthropic\.com/i.test(baseUrl) ? 'anthropic-messages' : 'openai-completions')
  if (!['anthropic-messages', 'openai-completions'].includes(api)) throw new Error('模型接口协议无效。')
  return { provider, model, baseUrl, apiKey, api }
}

export function requestScopedRuntimeConfig(defaults, selection) {
  const model = normalizeRequestModelConfig(selection)
  return { ...defaults, ...(model || {}), budget: { ...defaults.budget } }
}
