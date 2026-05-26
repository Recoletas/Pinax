import { runGenerationTask } from './generationService'

function logAttempts(label, generationResult) {
  for (const attempt of generationResult?.attempts || []) {
    const attemptLabel = attempt.index === 0 ? label : `${label} retry`
    console.info(`[ProseEssay ${attemptLabel}]`, String(attempt.content || '').slice(0, 500))
    if (attempt.parseError) {
      console.error(`[ProseEssay ${attemptLabel}] parse error:`, attempt.parseError)
    }
  }
}

export function extractCardBlock(text) {
  const raw = String(text || '')

  const beginIndex = raw.indexOf('BEGIN_CARDS')
  if (beginIndex >= 0) {
    const afterBegin = raw.slice(beginIndex + 'BEGIN_CARDS'.length)
    const endIndex = afterBegin.indexOf('END_CARDS')
    return (endIndex >= 0 ? afterBegin.slice(0, endIndex) : afterBegin).trim()
  }

  const firstBracket = raw.indexOf('[')
  if (firstBracket >= 0) {
    const lastBracket = raw.lastIndexOf(']')
    if (lastBracket > firstBracket) {
      return raw.slice(firstBracket, lastBracket + 1).trim()
    }
    return raw.slice(firstBracket).trim()
  }

  return raw.trim() || null
}

export function parseCardBlock(text) {
  const block = extractCardBlock(text)
  if (!block) return null

  try {
    const parsed = JSON.parse(block)
    if (Array.isArray(parsed)) return parsed
  } catch { }

  const objectMatches = block.match(/\{[\s\S]*?\}/g) || []
  const objectItems = []
  for (const rawObject of objectMatches) {
    try {
      const parsedObject = JSON.parse(rawObject)
      const content = String(parsedObject?.content || '').trim()
      const emotion = String(parsedObject?.emotion || '').trim()
      if (content) {
        objectItems.push({ content, emotion })
      }
      continue
    } catch { }

    const contentMatch = rawObject.match(/["']?content["']?\s*[:：]\s*["']([\s\S]*?)["']/)
    const emotionMatch = rawObject.match(/["']?emotion["']?\s*[:：]\s*["']([\s\S]*?)["']/)
    if (contentMatch) {
      objectItems.push({
        content: String(contentMatch[1] || '').trim(),
        emotion: String(emotionMatch?.[1] || '').trim()
      })
    }
  }
  if (objectItems.length > 0) return objectItems

  const inlineItems = []
  const pairRegex = /["']?content["']?\s*[:：]\s*["']([\s\S]*?)["']\s*,\s*["']?emotion["']?\s*[:：]\s*["']([\s\S]*?)["']/g
  let pairMatch = pairRegex.exec(block)
  while (pairMatch) {
    const content = String(pairMatch[1] || '').trim()
    const emotion = String(pairMatch[2] || '').trim()
    if (content) {
      inlineItems.push({ content, emotion })
    }
    pairMatch = pairRegex.exec(block)
  }
  if (inlineItems.length > 0) return inlineItems

  const items = []
  const lines = block.split('\n').filter(l => l.trim())
  let current = null

  for (const line of lines) {
    const contentMatch = line.match(/["']?content["']?\s*[:：]\s*["'](.+?)["']/)
    const emotionMatch = line.match(/["']?emotion["']?\s*[:：]\s*["'](.+?)["']/)

    if (contentMatch) {
      current = { content: contentMatch[1], emotion: '' }
    } else if (emotionMatch && current) {
      current.emotion = emotionMatch[1]
      items.push(current)
      current = null
    }
  }

  if (items.length > 0) return items

  const proseItems = []
  let pendingContent = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const contentLineMatch = line.match(/^\d+[.、]\s*(.+)$/)
    if (contentLineMatch) {
      if (pendingContent) {
        pendingContent += ` ${contentLineMatch[1]}`
      } else {
        pendingContent = contentLineMatch[1]
      }
      continue
    }

    const emotionLineMatch = line.match(/^(?:情绪|emotion)\s*[:：]\s*(.+)$/i)
    if (emotionLineMatch && pendingContent) {
      proseItems.push({
        content: pendingContent.trim(),
        emotion: String(emotionLineMatch[1] || '').trim()
      })
      pendingContent = ''
      continue
    }

    if (pendingContent) {
      pendingContent += ` ${line}`
    }
  }

  return proseItems.length > 0 ? proseItems : null
}

export async function generateProseCardExtensions({ cardContent, settings }) {
  const generationSettings = {
    ...settings,
    max_tokens: 2000,
    temperature: 0.8
  }

  const systemPrompt = [
    '你是散文随笔写作助手。基于给定的卡片内容，生成 2-3 张相关的延伸卡片。',
    '要求：',
    '1. 每张卡片是一段完整的文字（80-150字），与原卡片有逻辑关联',
    '2. 为每张卡片选择一个情绪标签：喜悦、忧伤、平静、焦虑、愤怒、惊艳、怀旧、希望',
    '3. 新卡片与原卡片之间是阐释或平行关系',
    '4. 必须用 JSON 数组格式输出，每项包含 content 和 emotion',
    '5. 只输出 JSON，不要任何解释',
    '6. 用 BEGIN_CARDS 和 END_CARDS 包裹数组'
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'prose.expand-card',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `原卡片：${cardContent}` }
    ],
    settings: generationSettings,
    parseContent: parseCardBlock,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      {
        name: '延伸首轮'
      },
      {
        name: '延伸格式重试',
        appendMessages: [
          { role: 'user', content: '上一条输出格式不合规。请严格用 BEGIN_CARDS 和 END_CARDS 包裹 JSON 数组输出。' }
        ]
      }
    ]
  })

  logAttempts('expand', generationResult)
  return generationResult
}

export async function generateProseEmotionExtensions({ content, emotionLabel, settings }) {
  const generationSettings = {
    ...settings,
    max_tokens: 2000,
    temperature: 0.8
  }

  const systemPrompt = [
    'You are a prose essay writing assistant. Generate 2-3 extended cards.',
    'Requirements: Each card 80-150 chars, JSON output with content and emotion.',
    'Wrap array with BEGIN_CARDS and END_CARDS.'
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'prose.expand-emotion',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Original card: ' + content + ', Emotion: ' + emotionLabel }
    ],
    settings: generationSettings,
    parseContent: parseCardBlock,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      {
        name: '情绪扩展首轮'
      },
      {
        name: '情绪扩展重试',
        appendMessages: [
          { role: 'user', content: 'Previous output format is invalid. Use BEGIN_CARDS and END_CARDS wrapping a JSON array only.' }
        ]
      }
    ]
  })

  logAttempts('expandByEmotion', generationResult)
  return generationResult
}

export async function generateProseCardsFromTopic({ topic, mode = 'writing', settings }) {
  const generationSettings = {
    ...settings,
    max_tokens: 3000,
    temperature: 0.8
  }

  let systemPrompt
  if (mode === 'directing') {
    systemPrompt = [
      '你是影视分镜助手。根据给定的主题，生成一组分镜描述卡片。',
      '要求：',
      '1. 每张卡片是一段分镜描述（60-120字），描述画面构图和场景氛围',
      '2. 必须用 JSON 数组格式输出，每项包含 content, emotion, shotType, cameraMovement, duration',
      '3. shotType 可选值：extreme_wide/wide/full/medium_wide/medium/medium_close/close_up/extreme_close_up/two_shot/over_shoulder/pov/aerial',
      '4. cameraMovement 可选值：static/pan/tilt/dolly/track/crane/zoom/handheld/steadicam/spin/tilt_up/tilt_down',
      '5. duration 为建议时长（秒），填数字',
      '6. 只输出 JSON，不要任何解释',
      '7. 用 BEGIN_CARDS 和 END_CARDS 包裹数组',
      '示例：',
      'BEGIN_CARDS',
      '[{"content":"...","emotion":"平静","shotType":"wide","cameraMovement":"static","duration":5}]',
      'END_CARDS'
    ].join('\n')
  } else {
    systemPrompt = [
      '你是散文随笔写作助手。根据给定的主题，生成一组自由联想的写作卡片。',
      '要求：',
      '1. 每张卡片是一段完整的文字（80-200字），文笔优美有意境',
      '2. 为每张卡片选择一个情绪标签：喜悦、忧伤、平静、焦虑、愤怒、惊艳、怀旧、希望',
      '3. 必须用 JSON 数组格式输出，每项包含 content 和 emotion',
      '4. 只输出 JSON，不要任何解释',
      '5. 用 BEGIN_CARDS 和 END_CARDS 包裹数组',
      '示例：',
      'BEGIN_CARDS',
      '[{"content":"...","emotion":"平静"},{"content":"...","emotion":"喜悦"}]',
      'END_CARDS'
    ].join('\n')
  }

  const generationResult = await runGenerationTask({
    taskType: mode === 'directing' ? 'prose.directing-cards' : 'prose.topic-cards',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `主题：${topic}` }
    ],
    settings: generationSettings,
    parseContent: parseCardBlock,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      {
        name: '首轮生成'
      },
      {
        name: '格式修复重试',
        appendMessages: [
          { role: 'user', content: '上一条输出格式不合规。请严格用 BEGIN_CARDS 和 END_CARDS 包裹 JSON 数组输出。' }
        ]
      }
    ]
  })

  logAttempts('LLM', generationResult)
  return generationResult
}
