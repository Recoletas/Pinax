import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'

const TARGET_KINDS = new Set([
  'draft-prose',
  'event',
  'character-fact',
  'worldbook-draft',
  'inspiration',
  'storyboard-seed'
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKind(kind) {
  return TARGET_KINDS.has(kind) ? kind : 'inspiration'
}

function stripJsonFence(content) {
  return normalizeText(content)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

export function buildExperienceAssetSummaryMessages({
  messages = [],
  worldName = '',
  sessionTitle = ''
} = {}) {
  const usableMessages = Array.isArray(messages)
    ? messages
      .filter((message) => String(message?.content || '').trim())
      .slice(-24)
      .map((message) => {
        const role = message.role || message.type || 'assistant'
        return `${role}: ${String(message.content || '').trim()}`
      })
    : []

  const transcript = usableMessages.join('\n\n')

  return [
    {
      role: 'system',
      content: `你是一个小说体验素材整理器。你的任务是把一次互动体验整理成可进入素材收件箱的候选资产。

只输出 JSON，不要 Markdown，不要解释。

JSON 结构：
{
  "assets": [
    {
      "kind": "draft-prose | event | character-fact | worldbook-draft | inspiration | storyboard-seed",
      "title": "短标题",
      "content": "素材正文"
    }
  ]
}

要求：
1. 最多输出 6 条素材。
2. 优先提炼有后续写作价值的信息，不要复述废话。
3. draft-prose 应是可直接改写进小说正文的片段。
4. event 应记录已经发生的剧情事件。
5. character-fact 应记录角色变化、关系、动机或状态。
6. worldbook-draft 应写成可转入世界书的设定候选，可使用“名称/关键词/类型/内容”字段。
7. 如果没有足够信息，输出 {"assets":[]}.`
    },
    {
      role: 'user',
      content: [
        worldName ? `世界书：${worldName}` : '',
        sessionTitle ? `会话：${sessionTitle}` : '',
        '体验记录：',
        transcript || '（空）'
      ].filter(Boolean).join('\n')
    }
  ]
}

export function parseExperienceAssetSummary(content) {
  const text = stripJsonFence(content)
  if (!text) return []

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return []
    parsed = JSON.parse(match[0])
  }

  const rawAssets = Array.isArray(parsed?.assets) ? parsed.assets : []
  return rawAssets
    .map((asset) => ({
      kind: normalizeKind(asset?.kind),
      title: normalizeText(asset?.title).slice(0, 40),
      content: normalizeText(asset?.content)
    }))
    .filter((asset) => asset.content)
    .slice(0, 6)
}

export async function summarizeExperienceAssets(context = {}) {
  const messages = buildExperienceAssetSummaryMessages(context)
  const settings = await getResolvedApiSettings()
  if (!settings?.baseUrl || !settings?.apiKey) {
    return { success: false, error: '请先配置 AI 设置', assets: [] }
  }

  try {
    const result = await runGenerationTask({
      taskType: 'experience.asset-summary',
      baseMessages: messages,
      settings,
      generationOptions: {
        max_tokens: 1200,
        temperature: 0.35,
        stream: false
      },
      attempts: [{ name: 'experience-asset-summary' }],
      parseContent: parseExperienceAssetSummary,
      isValidParsed: (parsed) => Array.isArray(parsed)
    })

    return {
      success: Boolean(result?.success),
      assets: Array.isArray(result?.parsed) ? result.parsed : [],
      error: result?.success ? '' : '整理失败'
    }
  } catch (error) {
    return {
      success: false,
      error: error?.message || '整理体验时发生错误',
      assets: []
    }
  }
}
