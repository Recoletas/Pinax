import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'

export function parseJsonFromAiContent(content) {
  const raw = String(content || '').trim()
  if (!raw) {
    throw new Error('AI 返回为空')
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Continue with loose extraction below.
    }
  }

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1)
    return JSON.parse(candidate)
  }

  throw new Error('AI 返回不是有效 JSON')
}

function hasUsableEntries(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  return Array.isArray(parsed.entries) && parsed.entries.length > 0
}

export async function tryAiExtractWorldbookJson({ sourceText, targetCount, nameHint }) {
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return {
      ok: false,
      reason: '未检测到可用 AI 配置，已自动回退本地提炼。'
    }
  }

  const prompt = [
    `请从下面的小说片段或设定文本中提取完整世界书。`,
    `必须返回 JSON 对象，包含以下字段：`,
    `- name: 世界书名称`,
    `- worldDescription: 世界设定描述（从文本提取世界观、背景故事，不少于100字）`,
    `- writingStyle: 写作风格（分析原文的叙事视角、语言特点等）`,
    `- examples: 示例文本（选取原文中体现风格的精彩片段）`,
    `- forbidden: 禁止内容（根据文本推断应避免的内容类型）`,
    `- groups: 分组名称数组`,
    `- entries: 条目数组，每项包含 name, type, keys, content, group, mode`,
    `type 仅允许：rule/style/forbidden/character/location/item/organization/event/lore/quest/general。`,
    `keys 必须是字符串数组。`,
    `mode 仅允许 selective 或 constant。`,
    `entries 中至少包含 1 条 rule 或 forbidden，且至少包含 1 条 style，这些约束条目的 mode 必须为 constant。`,
    `每条 content 不少于 30 字，避免空泛描述。`,
    `条目数量约 ${targetCount} 条，不要超过 ${targetCount + 2} 条。`,
    `若信息不足可做合理补全，但要贴合原文。`,
    `世界书名称优先使用：${nameHint || '自动命名世界书'}。`,
    '',
    '原始文本：',
    sourceText.slice(0, 12000)
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'worldbook.import.extract',
    baseMessages: [
      {
        role: 'system',
        content: '你是世界书构建助手。只输出 JSON，不要输出解释。worldDescription、writingStyle、examples、forbidden 是必填字段。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    settings: apiSettings,
    generationOptions: {
      max_tokens: 3400,
      temperature: 0.35,
      max_input_chars: 16000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-ai-import-first' },
      {
        name: 'worldbook-ai-import-retry',
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要使用 markdown 代码块，不要附加说明。确保包含 worldDescription、writingStyle、examples、forbidden 字段。'
          }
        ]
      }
    ],
    parseContent: parseJsonFromAiContent,
    isValidParsed: hasUsableEntries
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: 'AI 提炼未产出可用结构，已自动回退本地提炼。'
    }
  }

  return {
    ok: true,
    parsed: generationResult.parsed || parseJsonFromAiContent(generationResult.content)
  }
}

export async function tryAiGenerateWorldbookJsonFromBrief({ genreLabel, brief, targetCount, nameHint }) {
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return {
      ok: false,
      reason: 'AI 随机生成需要有效 AI 配置，请先在设置中完成 API 配置。'
    }
  }

  const prompt = [
    '请根据输入说明生成一个完整的世界书。',
    '仅返回 JSON 对象，必须包含以下字段：',
    '- name: 世界书名称',
    '- worldDescription: 世界设定描述（世界观、背景故事、核心概念，不少于100字）',
    '- writingStyle: 写作风格（叙事视角、语言特点、情感基调等）',
    '- examples: 示例文本（展示预期写作风格的片段）',
    '- forbidden: 禁止内容（AI 不应生成的内容类型或元素）',
    '- groups: 分组名称数组',
    '- entries: 条目数组，每项包含 name, type, keys, content, group, mode',
    'type 仅允许：rule/style/forbidden/character/location/item/organization/event/lore/quest/general。',
    'keys 必须是字符串数组，至少 1 个关键词。',
    'mode 仅允许 selective 或 constant。',
    'entries 中至少包含 1 条 rule 或 forbidden，且至少包含 1 条 style，这些约束条目的 mode 必须为 constant。',
    '每条 content 不少于 30 字，避免空泛描述。',
    `风格方向：${genreLabel}。`,
    `目标条目数：${targetCount}（允许 ±2 浮动）。`,
    `世界书名称优先使用：${nameHint || '自动命名世界书'}。`,
    '',
    '输入说明：',
    brief.slice(0, 4000)
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'worldbook.import.random',
    baseMessages: [
      {
        role: 'system',
        content: '你是世界书生成助手。输出必须是可直接解析的 JSON 对象。worldDescription、writingStyle、examples、forbidden 是必填字段。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    settings: apiSettings,
    generationOptions: {
      max_tokens: 3200,
      temperature: 0.55,
      max_input_chars: 12000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-ai-random-first' },
      {
        name: 'worldbook-ai-random-retry',
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要包含 markdown 或额外说明。确保包含 worldDescription、writingStyle、examples、forbidden 字段。'
          }
        ]
      }
    ],
    parseContent: parseJsonFromAiContent,
    isValidParsed: hasUsableEntries
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: 'AI 随机生成失败，请重试或调整说明后再生成。'
    }
  }

  return {
    ok: true,
    parsed: generationResult.parsed || parseJsonFromAiContent(generationResult.content)
  }
}
