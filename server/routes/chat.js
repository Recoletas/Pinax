import express from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

const PROVIDER_DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', chatPath: '/chat/completions' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', chatPath: '/chat/completions' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', chatPath: '/messages', type: 'claude' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', chatPath: '/chat/completions' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', chatPath: '/chat/completions' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', chatPath: '/chat/completions' },
  cohere: { baseUrl: 'https://api.cohere.ai/v2', chatPath: '/chat', type: 'cohere' },
  perplexity: { baseUrl: 'https://api.perplexity.ai', chatPath: '/chat/completions' },
  ollama: { baseUrl: 'http://localhost:11434', chatPath: '/v1/chat/completions' },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', chatPath: '/chat/completions' },
  textgenwebui: { baseUrl: 'http://localhost:5000', chatPath: '/v1/chat/completions' },
  pollinations: { baseUrl: 'https://gen.pollinations.ai', chatPath: '/v1/chat/completions' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', chatPath: '/chat/completions' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', chatPath: '/chat/completions' },
  xai: { baseUrl: 'https://api.x.ai/v1', chatPath: '/chat/completions' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', chatPath: '/chat/completions' },
  ai21: { baseUrl: 'https://api.ai21.com/v1', chatPath: '/chat/completions' }
}

function resolveBaseUrl(provider, baseUrl, fallbackUrl) {
  const defaults = PROVIDER_DEFAULTS[provider] || {}
  let resolved = baseUrl || fallbackUrl || defaults.baseUrl || ''

  if (provider === 'cohere' && /\/v1\/?$/.test(resolved)) {
    resolved = resolved.replace(/\/v1\/?$/, '/v2')
  }

  return resolved
}

function normalizeBaseUrl(baseUrl, chatPath) {
  if (!baseUrl) return ''

  let normalized = baseUrl.replace(/\/$/, '')

  if (chatPath.startsWith('/v1/') && normalized.endsWith('/v1')) {
    normalized = normalized.slice(0, -3)
  }

  return normalized
}

function buildChatUrl(baseUrl, chatPath) {
  if (!baseUrl) return ''

  if (baseUrl.endsWith(chatPath)) {
    return baseUrl
  }

  return `${baseUrl}${chatPath}`
}

const DATA_DIR = join(__dirname, '../../data')

function loadSecrets() {
  const secretsPath = join(DATA_DIR, 'secrets.json')
  try {
    if (existsSync(secretsPath)) {
      return JSON.parse(readFileSync(secretsPath, 'utf-8'))
    }
  } catch (e) {
    console.error('[chat] Error loading secrets:', e)
  }
  return {}
}

function extractTextContent(payload) {
  if (typeof payload === 'string') return payload
  if (payload == null) return ''

  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractTextContent(item))
      .filter(Boolean)
      .join('')
  }

  if (typeof payload === 'object') {
    if (typeof payload.reasoning_content === 'string' && payload.reasoning_content.trim()) return payload.reasoning_content
    if (typeof payload.reasoning === 'string' && payload.reasoning.trim()) return payload.reasoning
    if (typeof payload.text === 'string') return payload.text
    if (typeof payload.content === 'string') return payload.content
    if (Array.isArray(payload.content)) return extractTextContent(payload.content)
    if (typeof payload.output_text === 'string') return payload.output_text
    if (Array.isArray(payload.output)) return extractTextContent(payload.output)
    if (typeof payload.response === 'string') return payload.response
    if (Array.isArray(payload.parts)) return extractTextContent(payload.parts)
  }

  return ''
}

function extractOpenAIChoiceText(choice) {
  if (!choice || typeof choice !== 'object') return ''

  return (
    extractTextContent(choice?.message?.content) ||
    extractTextContent(choice?.message?.reasoning_content) ||
    extractTextContent(choice?.message?.reasoning) ||
    extractTextContent(choice?.content) ||
    extractTextContent(choice?.text) ||
    extractTextContent(choice?.delta?.content) ||
    extractTextContent(choice?.delta?.reasoning_content) ||
    ''
  )
}

router.post('/chat', async (req, res) => {
  const { messages, character, worldId, provider, baseUrl, apiKey, model, max_tokens, temperature, response_format } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const secrets = loadSecrets()

  const effectiveProvider = provider || secrets.provider || 'openai'
  const effectiveBaseUrl = resolveBaseUrl(effectiveProvider, baseUrl, secrets.base_url)
  const effectiveApiKey = apiKey || secrets.api_key_openai || process.env.OPENAI_API_KEY
  const effectiveModel = model || secrets.openai_model || 'gpt-4o-mini'
  const providerDefaults = PROVIDER_DEFAULTS[effectiveProvider] || {}
  const chatPath = providerDefaults.chatPath || '/chat/completions'
  const normalizedBaseUrl = normalizeBaseUrl(effectiveBaseUrl, chatPath)
  const chatUrl = buildChatUrl(normalizedBaseUrl, chatPath)

  if (!effectiveApiKey && !chatUrl) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
    return res.json({
      content: `你说了"${lastUserMessage.slice(0, 20)}..."，但目前没有配置 AI API，无法生成智能回复。请在设置中添加 API Key。`,
      error: 'no_api_key'
    })
  }

  if (!chatUrl) {
    return res.status(400).json({
      error: 'Base URL 未配置或无效，请在设置中填写正确的 Base URL。'
    })
  }

  try {
    let systemPrompt = `你是一个文字冒险游戏的Narrator（旁白/主持人）。请根据用户的行动生成生动、有趣的剧情描述。

规则：
- 用中文回复
- 回复应该简洁但有画面感（50-150字）
- 描述环境、动作、对话和情感
- 适当的悬念和情节推进
- 遇到模糊的行动请求，请发挥想象力推进剧情

`

  const hasClientSystemPrompt = messages.some((m) => m?.role === 'system')
  const effectiveSystemPrompt = hasClientSystemPrompt ? '' : systemPrompt

    if (character) {
      systemPrompt += `
角色信息：
- 名字：${character.name || '未知'}
- 描述：${character.description || '无'}
- 性格：${character.personality || '无'}
- 招呼语：${character.greeting || '无'}
`
    }

    if (worldId) {
      systemPrompt += `
世界设定：${worldId}
`
    }

    const headers = {
      'Content-Type': 'application/json'
    }

    if (effectiveApiKey) {
      headers['Authorization'] = `Bearer ${effectiveApiKey}`
    }

    // Determine API format based on provider
    const normalizedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    let requestBody = {
      model: effectiveModel,
      messages: effectiveSystemPrompt
        ? [{ role: 'system', content: effectiveSystemPrompt }, ...normalizedMessages]
        : normalizedMessages,
      max_tokens: Number.isFinite(Number(max_tokens)) ? Number(max_tokens) : 500,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.8
    }

    if (response_format && effectiveProvider !== 'claude' && effectiveProvider !== 'cohere') {
      requestBody.response_format = response_format
    }

    // Special handling for Claude API
    if (effectiveProvider === 'claude') {
      delete headers['Authorization']
      headers['x-api-key'] = effectiveApiKey
      headers['anthropic-version'] = '2023-06-01'
      requestBody = {
        model: effectiveModel,
        max_tokens: Number.isFinite(Number(max_tokens)) ? Number(max_tokens) : 500,
        messages: normalizedMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : m.role,
          content: m.content
        })),
        ...(effectiveSystemPrompt ? { system: effectiveSystemPrompt } : {})
      }
    }

    if (effectiveProvider === 'cohere') {
      requestBody = {
        model: effectiveModel,
        messages: normalizedMessages.map(m => ({
          role: m.role,
          content: m.content
        })),
        ...(effectiveSystemPrompt ? { preamble: effectiveSystemPrompt } : {}),
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.8,
        ...(Number.isFinite(Number(max_tokens)) ? { max_tokens: Number(max_tokens) } : {})
      }
    }

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('API error:', response.status, error)
      return res.status(response.status).json({
        error: `API 请求失败 (${response.status})`,
        details: error.slice(0, 200)
      })
    }

    const data = await response.json()
    const message = data?.choices?.[0]?.message
    let content =
      extractOpenAIChoiceText(data?.choices?.[0]) ||
      extractTextContent(message?.content) ||
      extractTextContent(message?.reasoning_content) ||
      extractTextContent(data?.message?.content) ||
      extractTextContent(data?.message?.reasoning_content) ||
      extractTextContent(data?.content) ||
      extractTextContent(data?.output_text) ||
      extractTextContent(data?.output) ||
      ''

    // Handle Claude response format
    if (effectiveProvider === 'claude' && data.content) {
      content = extractTextContent(data.content) || content
    }

    if (effectiveProvider === 'cohere' && data.message?.content) {
      content = extractTextContent(data.message.content) || content
    }

    if (!content) {
      console.error('Empty model content:', {
        provider: effectiveProvider,
        model: effectiveModel,
        hasChoices: Boolean(data?.choices?.length),
        keys: Object.keys(data || {}).slice(0, 12),
        choiceKeys: Object.keys(data?.choices?.[0] || {}).slice(0, 12),
        messageKeys: Object.keys(message || {}).slice(0, 12),
        rawPreview: JSON.stringify(data).slice(0, 1200)
      })
      return res.status(502).json({
        error: '上游模型返回为空内容',
        details: `provider=${effectiveProvider}, model=${effectiveModel}`
      })
    }

    res.json({ content })
  } catch (e) {
    console.error('Chat error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Fetch available models from API URL
router.post('/models', async (req, res) => {
  const { baseUrl, apiKey, provider } = req.body
  const effectiveBaseUrl = resolveBaseUrl(provider, baseUrl, '')

  if (!effectiveBaseUrl) {
    return res.status(400).json({ error: 'baseUrl is required' })
  }

  try {
    const headers = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Different providers use different endpoints for model lists
    let modelsUrl = effectiveBaseUrl

    if (provider === 'ollama') {
      modelsUrl = `${baseUrl}/api/tags`
      const response = await fetch(modelsUrl, { headers })
      if (response.ok) {
        const data = await response.json()
        const models = (data.models || []).map(m => m.name || m.model)
        return res.json({ models })
      }
    } else if (provider === 'lmstudio') {
      modelsUrl = `${baseUrl}/models`
      const response = await fetch(modelsUrl, { headers })
      if (response.ok) {
        const data = await response.json()
        const models = (data.data || []).map(m => m.id)
        return res.json({ models })
      }
    } else {
      // Standard OpenAI-compatible /models endpoint
      if (!modelsUrl.endsWith('/models')) {
        modelsUrl = `${modelsUrl.replace(/\/$/, '')}/models`
      }
      const response = await fetch(modelsUrl, { headers })

      if (response.ok) {
        const data = await response.json()
        const models = (data.data || []).map(m => m.id)
        return res.json({ models })
      }
    }

    // Try alternative endpoints
    const altUrls = [
      `${effectiveBaseUrl}/v1/models`,
      `${effectiveBaseUrl}/models`,
      `${effectiveBaseUrl}/api/models`
    ]

    for (const url of altUrls) {
      try {
        const response = await fetch(url, { headers })
        if (response.ok) {
          const data = await response.json()
          let models = []

          if (Array.isArray(data)) {
            models = data.map(m => m.id || m.name || m)
          } else if (data.data) {
            models = data.data.map(m => m.id || m.name)
          } else if (data.models) {
            models = data.models.map(m => m.id || m.name || m)
          }

          if (models.length > 0) {
            return res.json({ models })
          }
        }
      } catch (e) {
        continue
      }
    }

    return res.status(404).json({ error: 'Could not fetch models', models: [] })
  } catch (e) {
    console.error('Models fetch error:', e)
    res.status(500).json({ error: e.message, models: [] })
  }
})

// Test connection endpoint
router.post('/test', async (req, res) => {
  const { baseUrl, apiKey, provider } = req.body
  const effectiveBaseUrl = resolveBaseUrl(provider, baseUrl, '')

  if (!effectiveBaseUrl) {
    return res.json({ ok: false, message: '请输入 Base URL' })
  }

  try {
    const headers = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Try the models endpoint to test connection
    let testUrl = effectiveBaseUrl
    if (!testUrl.endsWith('/models')) {
      testUrl = `${testUrl.replace(/\/$/, '')}/models`
    }

    const response = await fetch(testUrl, { headers })

    if (response.ok) {
      const data = await response.json()
      const modelCount = data.data?.length || 0
      return res.json({
        ok: true,
        message: `连接成功 (${modelCount} 个模型可用)`
      })
    } else {
      // Try alternative
      const altUrls = [
        `${effectiveBaseUrl}/v1/models`,
        `${effectiveBaseUrl}/api/tags`
      ]

      for (const url of altUrls) {
        try {
          const resp = await fetch(url, { headers })
          if (resp.ok) {
            const data = await resp.json()
            let modelCount = 0
            if (data.data) modelCount = data.data.length
            else if (data.models) modelCount = data.models.length
            else if (Array.isArray(data)) modelCount = data.length

            return res.json({
              ok: true,
              message: `连接成功 (${modelCount} 个模型可用)`
            })
          }
        } catch (e) {
          continue
        }
      }

      return res.json({
        ok: false,
        message: `连接失败 (${response.status})`
      })
    }
  } catch (e) {
    return res.json({
      ok: false,
      message: '连接超时或地址无效'
    })
  }
})

function saveSecrets(secrets) {
  const secretsPath = join(DATA_DIR, 'secrets.json')
  try {
    writeFileSync(secretsPath, JSON.stringify(secrets, null, 2))
    return true
  } catch (e) {
    console.error('[chat] Error saving secrets:', e)
    return false
  }
}

// Secrets management endpoints
router.post('/secrets/write', async (req, res) => {
  const { key, value } = req.body
  const secrets = loadSecrets()
  secrets[key] = value || ''

  if (saveSecrets(secrets)) {
    res.json({ success: true })
  } else {
    res.status(500).json({ error: 'Failed to save secrets' })
  }
})

router.post('/secrets/read', async (req, res) => {
  res.json(loadSecrets())
})

export default router