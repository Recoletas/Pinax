import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'

export function parseJsonFromAiContent(content) {
  const raw = String(content || '').replace(/^\uFEFF/, '').trim()
  if (!raw) {
    throw new Error('AI 返回为空')
  }

  const directCandidates = [
    ...[...raw.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi)].map((match) => match[1]),
    raw
  ]
  for (const candidate of directCandidates) {
    try {
      return JSON.parse(String(candidate || '').trim())
    } catch {
      // Continue with balanced extraction below.
    }
  }

  // Models frequently add a short preface, trailing note, or a code fence.
  // Extract complete JSON values while respecting quoted braces in content.
  for (let start = 0; start < raw.length; start += 1) {
    if (!['{', '['].includes(raw[start])) continue
    const stack = []
    let inString = false
    let escaped = false
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') {
        inString = true
        continue
      }
      if (character === '{' || character === '[') {
        stack.push(character)
        continue
      }
      if (character !== '}' && character !== ']') continue
      const expected = character === '}' ? '{' : '['
      if (stack.at(-1) !== expected) break
      stack.pop()
      if (stack.length > 0) continue
      try {
        const parsed = JSON.parse(raw.slice(start, index + 1))
        if (parsed && typeof parsed === 'object') return parsed
      } catch {
        // Try the next possible JSON start. A malformed candidate should not
        // prevent a later valid object in the same model response from being used.
      }
      break
    }
  }

  throw new Error('AI 返回不是有效 JSON')
}

export function normalizeWorldbookAiResult(parsed) {
  if (Array.isArray(parsed)) return { entries: parsed }
  if (!parsed || typeof parsed !== 'object') return parsed
  const collectionKeys = [
    'entries', 'entry', 'entryList', 'worldbookEntries', 'worldBookEntries',
    'items', 'records', 'rules', 'characters', 'locations', 'organizations',
    'events', 'lore'
  ]

  const flattenCollection = (value) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => Array.isArray(item) ? flattenCollection(item) : [item])
    }
    if (value && typeof value === 'object') {
      return Object.values(value).flatMap((item) => Array.isArray(item) ? flattenCollection(item) : [item])
    }
    return []
  }

  const hasEntryShape = (value) => value && typeof value === 'object' && !Array.isArray(value)
    && ['name', 'title', 'content', 'description', 'type', 'keys', 'keywords'].some((key) => key in value)

  const takeCollection = (value) => {
    const items = flattenCollection(value)
    return items.some(hasEntryShape) ? items : []
  }

  for (const key of collectionKeys.slice(0, 7)) {
    const entries = takeCollection(parsed[key])
    if (entries.length > 0) return { ...parsed, entries }
  }

  const groupedEntries = collectionKeys.slice(7).flatMap((key) => takeCollection(parsed[key]))
  if (groupedEntries.length > 0) return { ...parsed, entries: groupedEntries }

  const wrappedCandidates = [parsed.worldbook, parsed.worldBook, parsed.world_book, parsed.data, parsed.result, parsed.output]
  for (const candidate of wrappedCandidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const normalized = normalizeWorldbookAiResult(candidate)
    if (Array.isArray(normalized?.entries) && normalized.entries.length > 0) {
      return { ...parsed, ...normalized }
    }
  }
  return parsed
}

const IMPORT_ENTRY_TYPE_LABELS = Object.freeze({
  rule: '规则',
  style: '文风',
  forbidden: '禁写',
  character: '角色',
  location: '地点',
  organization: '势力',
  event: '事件',
  item: '物件',
  lore: '设定',
  quest: '任务',
  general: '其他'
})

function previewText(value, maxLength = 120) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

/**
 * 为 SillyTavern / Pinax JSON 导入生成确定性预览。
 * 这里只读取结构，不写入世界书，也不把结构化 JSON 降级成普通文本。
 */
export function buildWorldbookImportPreview(parsed, fallbackName = '') {
  const normalized = normalizeWorldbookAiResult(parsed)
  const entries = Array.isArray(normalized?.entries) ? normalized.entries : []
  const typeCounts = new Map()
  const groups = new Set((Array.isArray(normalized?.groups) ? normalized.groups : [])
    .map((group) => String(group || '').trim())
    .filter(Boolean))
  let keyedEntryCount = 0
  let configuredEntryCount = 0

  for (const entry of entries) {
    const type = String(entry?.type || 'general').trim().toLowerCase() || 'general'
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    const group = String(entry?.group || entry?.category || entry?.injection?.group || '').trim()
    if (group) groups.add(group)
    const keys = Array.isArray(entry?.keys)
      ? entry.keys
      : (Array.isArray(entry?.keywords) ? entry.keywords : [])
    if (keys.some((key) => String(key || '').trim())) keyedEntryCount += 1
    const injection = entry?.injection && typeof entry.injection === 'object' ? entry.injection : entry
    if (['mode', 'constant', 'probability', 'cooldown', 'depth', 'excludeRecursion'].some((key) => key in injection)) {
      configuredEntryCount += 1
    }
  }

  return {
    name: String(normalized?.name || normalized?.title || fallbackName || '未命名世界书').trim(),
    entryCount: entries.length,
    groupCount: groups.size,
    groups: [...groups].slice(0, 24),
    typeSummary: [...typeCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([type, count]) => ({ type, label: IMPORT_ENTRY_TYPE_LABELS[type] || type, count })),
    keyedEntryCount,
    configuredEntryCount,
    previewEntries: entries.slice(0, 5).map((entry, index) => ({
      id: String(entry?.id || `preview-${index + 1}`),
      name: previewText(entry?.name || entry?.title || `未命名条目 ${index + 1}`, 80),
      type: String(entry?.type || 'general').trim().toLowerCase() || 'general',
      typeLabel: IMPORT_ENTRY_TYPE_LABELS[String(entry?.type || 'general').trim().toLowerCase()] || '其他',
      group: String(entry?.group || entry?.category || entry?.injection?.group || '').trim(),
      keys: (Array.isArray(entry?.keys) ? entry.keys : (Array.isArray(entry?.keywords) ? entry.keywords : []))
        .map((key) => previewText(key, 36))
        .filter(Boolean)
        .slice(0, 4),
      content: previewText(entry?.content || entry?.description, 160)
    }))
  }
}

function parseWorldbookJsonContent(content) {
  return normalizeWorldbookAiResult(parseJsonFromAiContent(content))
}

function buildFoundationRepairMessages({ baseMessages, history }) {
  const previous = String(history?.at(-1)?.content || '').trim().slice(0, 9000)
  return [
    ...baseMessages,
    {
      role: 'user',
      content: [
        '上一轮结果缺少可用的世界概述或创作基调。请修复并返回完整的基调对象。',
        '只允许返回一个严格 JSON 对象，不能有 Markdown 代码围栏、解释、前后缀或注释。',
        '必须保留并补齐 name、worldDescription、tone、writingStyle、perspective、examples、forbidden、consistency。',
        '不要生成 entries、角色、地点、组织、事件、历史或任务。',
        '',
        '上一轮原文：',
        previous || '(空响应)'
      ].join('\n')
    }
  ]
}

function hasUsableEntries(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  return Array.isArray(parsed.entries) && parsed.entries.length > 0
}

function normalizeFoundationResult(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed
  const wrappedCandidates = [parsed.worldbook, parsed.worldBook, parsed.world_book, parsed.data, parsed.result, parsed.output]
  for (const candidate of wrappedCandidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    if (candidate.worldDescription || candidate.description || candidate.writingStyle || candidate.tone) {
      return { ...parsed, ...candidate }
    }
  }
  return parsed
}

function parseFoundationJsonContent(content) {
  return normalizeFoundationResult(parseJsonFromAiContent(content))
}

function hasUsableFoundation(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  const worldDescription = String(parsed.worldDescription || parsed.description || '').trim()
  const creativeDirection = String(parsed.writingStyle || parsed.tone || '').trim()
  return worldDescription.length >= 40 && creativeDirection.length >= 12
}

function describeGenerationFailure(result, fallback, invalidStructure = '返回内容缺少可用 entries') {
  const last = result?.attempts?.at?.(-1) || null
  if (last?.requestError?.message) return `${fallback}：${last.requestError.message}`
  if (last?.parseError?.message) return `${fallback}：${last.parseError.message}`
  if (!String(last?.content || '').trim()) return `${fallback}：上游未返回正文`
  return `${fallback}：${invalidStructure}`
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
      timeout_ms: 90000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-ai-import-first' },
      {
        name: 'worldbook-ai-import-retry',
        generationOptions: { response_format: null },
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要使用 markdown 代码块，不要附加说明。确保包含 worldDescription、writingStyle、examples、forbidden 字段。'
          }
        ]
      }
    ],
    parseContent: parseWorldbookJsonContent,
    isValidParsed: hasUsableEntries
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: describeGenerationFailure(generationResult, 'AI 提炼未产出可用结构，已自动回退本地提炼')
    }
  }

  return {
    ok: true,
    parsed: generationResult.parsed || parseJsonFromAiContent(generationResult.content)
  }
}

export async function tryAiGenerateWorldbookJsonFromBrief({ genreLabel, brief, nameHint }) {
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return {
      ok: false,
      reason: 'AI 基调生成需要有效 AI 配置，请先在设置中完成 API 配置。'
    }
  }

  const prompt = [
    '请根据输入说明建立一个轻量的世界基调草案。',
    '具体角色、地点、组织、事件、历史和任务将由用户稍后在结构化设定中完成，本次不得代写。',
    '仅返回 JSON 对象，必须包含以下字段：',
    '- name: 世界书名称',
    '- worldDescription: 只描述世界的核心前提、边界与氛围，不少于80字',
    '- tone: 情绪基调与阅读感受',
    '- writingStyle: 语言密度、节奏、描写取向与表达边界',
    '- perspective: 建议的叙事人称、视角距离与信息限制',
    '- examples: 2至3句原创风格示例，不推进具体剧情',
    '- forbidden: 应避免的文风、套路和内容倾向',
    '- consistency: 后续扩写必须保持的基础一致性规则',
    '不要返回 entries、groups、claims、conflicts，也不要创造专名实体。',
    `风格方向：${genreLabel}。`,
    `世界书名称优先使用：${nameHint || '自动命名世界书'}。`,
    '',
    '输入说明：',
    brief.slice(0, 4000)
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'worldbook.foundation.generate',
    baseMessages: [
      {
        role: 'system',
        content: '你是创作基调编辑。只建立世界和叙事的基础边界，不创造具体实体。输出必须是可直接解析的 JSON 对象。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    settings: apiSettings,
    generationOptions: {
      max_tokens: 1800,
      temperature: 0.45,
      max_input_chars: 8000,
      timeout_ms: 90000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-foundation-first' },
      {
        name: 'worldbook-foundation-retry',
        generationOptions: { response_format: null },
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要包含 markdown 或额外说明。确保包含 worldDescription、tone、writingStyle、perspective、examples、forbidden、consistency。'
          }
        ]
      },
      {
        name: 'worldbook-foundation-repair',
        generationOptions: { response_format: null },
        buildMessages: ({ baseMessages, history }) => buildFoundationRepairMessages({ baseMessages, history })
      }
    ],
    parseContent: parseFoundationJsonContent,
    isValidParsed: hasUsableFoundation
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: describeGenerationFailure(generationResult, 'AI 基调生成失败', '返回内容缺少世界概述或创作基调')
    }
  }

  return {
    ok: true,
    parsed: generationResult.parsed || parseFoundationJsonContent(generationResult.content)
  }
}
