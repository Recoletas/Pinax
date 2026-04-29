import express from 'express'

const router = express.Router()

function loadApiSettings() {
  try {
    const fs = require('fs')
    const path = require('path')
    const secretsPath = path.join(__dirname, '../../data/secrets.json')
    if (fs.existsSync(secretsPath)) {
      return JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
    }
  } catch (e) {
    console.error('Error loading secrets:', e)
  }
  return {}
}

router.post('/chat', async (req, res) => {
  const { messages, character, worldId, provider, baseUrl, apiKey, model } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const secrets = loadApiSettings()

  const effectiveProvider = provider || secrets.provider || 'openai'
  const effectiveBaseUrl = baseUrl || secrets.base_url || ''
  const effectiveApiKey = apiKey || secrets.api_key_openai || process.env.OPENAI_API_KEY
  const effectiveModel = model || secrets.openai_model || 'gpt-4o-mini'

  if (!effectiveApiKey && !effectiveBaseUrl) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
    return res.json({
      content: `你说了"${lastUserMessage.slice(0, 20)}..."，但目前没有配置 AI API，无法生成智能回复。请在设置中添加 API Key。`,
      error: 'no_api_key'
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
    let requestBody = {
      model: effectiveModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ],
      max_tokens: 500,
      temperature: 0.8
    }

    // Special handling for Claude API
    if (effectiveProvider === 'claude') {
      headers['x-api-key'] = effectiveApiKey
      headers['anthropic-version'] = '2023-06-01'
      requestBody = {
        model: effectiveModel,
        max_tokens: 500,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : m.role,
          content: m.content
        })),
        system: systemPrompt
      }
    }

    const chatUrl = `${effectiveBaseUrl}/chat/completions`

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
    let content = data.choices?.[0]?.message?.content || '...'

    // Handle Claude response format
    if (effectiveProvider === 'claude' && data.content) {
      content = data.content[0]?.text || content
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

  if (!baseUrl) {
    return res.status(400).json({ error: 'baseUrl is required' })
  }

  try {
    const headers = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Different providers use different endpoints for model lists
    let modelsUrl = baseUrl

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
      `${baseUrl}/v1/models`,
      `${baseUrl}/models`,
      `${baseUrl}/api/models`
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

  if (!baseUrl) {
    return res.json({ ok: false, message: '请输入 Base URL' })
  }

  try {
    const headers = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Try the models endpoint to test connection
    let testUrl = baseUrl
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
        `${baseUrl}/v1/models`,
        `${baseUrl}/api/tags`
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

// Secrets management endpoints
router.post('/secrets/write', async (req, res) => {
  const { key, value } = req.body
  const fs = require('fs')
  const path = require('path')
  const secretsPath = path.join(__dirname, '../../data/secrets.json')

  let secrets = {}
  try {
    if (fs.existsSync(secretsPath)) {
      secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
    }
  } catch (e) {}

  secrets[key] = value || ''

  try {
    fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2))
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to save secrets' })
  }
})

router.post('/secrets/read', async (req, res) => {
  const fs = require('fs')
  const path = require('path')
  const secretsPath = path.join(__dirname, '../../data/secrets.json')

  try {
    if (fs.existsSync(secretsPath)) {
      res.json(JSON.parse(fs.readFileSync(secretsPath, 'utf-8')))
    } else {
      res.json({})
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to read secrets' })
  }
})

export default router