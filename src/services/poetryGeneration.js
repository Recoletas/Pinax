import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'

const LLM_DEBUG_PREFIX = '[Narrative LLM]'

function ensureApiSettings(apiSettings) {
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    throw new Error('未配置可用模型，请先在设置里填写 baseUrl / apiKey / model')
  }
}

function extractLineBlock(text) {
  const raw = String(text || '')
  const markerMatch = raw.match(/BEGIN_LINES([\s\S]*?)END_LINES/i)
  if (markerMatch?.[1]) return markerMatch[1]
  return raw
}

export function sanitizeIdeaTitle(input, maxLen = 36) {
  let title = String(input || '').trim()
  if (!title) return ''

  title = title
    .replace(/^L\d+\s*[|｜]\s*N[\d.]+\s*[|｜]\s*P[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N[\d.]+\s*[|｜]\s*N?[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N[\d.]+\s*[|｜]\s*P?[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N\d+\s*P\d+\s*/i, '')
    .replace(/^[-*\d.、\s]+/, '')
    .trim()

  if (title.includes('|') || title.includes('｜')) {
    const parts = title.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length) title = parts[parts.length - 1]
  }

  return title.slice(0, maxLen).trim()
}

function isMetaNarrationTitle(title) {
  const s = String(title || '').trim()
  if (!s) return true
  if (s.length < 2) return true
  const lead = /^(我们|你|请|以下|根据|基于|现在|本次|用户反馈|继续|由于|为了)/
  const meta = /(根据用户反馈|继续生成|生成分支|输出|说明|子节点|分支如下|标题如下|请输出|我们将)/
  return lead.test(s) || meta.test(s)
}

export function flattenRawTree(raw, out = [], seen = new Set()) {
  if (!raw) return out
  if (seen.has(raw)) return out
  seen.add(raw)
  out.push(raw)
  const children = Array.isArray(raw.children) ? raw.children : []
  for (const child of children) flattenRawTree(child, out, seen)
  return out
}

export function parseLineTree(text) {
  const block = extractLineBlock(text)
  const lines = String(block || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const items = []
  let autoId = 1
  const lastByLevel = new Map()

  for (const line of lines) {
    let depth
    let idNum
    let parentNum
    let title

    const strict = line.match(/^L(\d+)\s*[|｜]\s*N(\d+)\s*[|｜]\s*P(\d+)\s*[|｜]\s*(.+)$/i)
    if (strict) {
      depth = Number(strict[1]) - 1
      idNum = Number(strict[2])
      parentNum = Number(strict[3])
      title = String(strict[4] || '').trim()
    } else {
      const loose = line.match(/^L(\d+)\s*[:：|｜-]\s*(.+)$/i)
      if (!loose) continue
      depth = Number(loose[1]) - 1
      title = String(loose[2] || '').trim()
      idNum = autoId
      autoId += 1
      if (depth <= 0) {
        parentNum = 0
      } else {
        const parentId = lastByLevel.get(depth - 1)
        parentNum = Number.isFinite(parentId) ? parentId : 0
      }
    }

    title = sanitizeIdeaTitle(title, 36)

    if (!title) continue
    if (isMetaNarrationTitle(title)) continue
    if (depth < 0 || depth > 5) continue

    items.push({ depth, idNum, parentNum, title })
    lastByLevel.set(depth, idNum)
  }

  if (!items.length) {
    throw new Error('未解析到有效分步行格式，请稍后重试')
  }

  const latestNodeBySourceId = new Map()
  const roots = []
  let root = null

  for (const item of items) {
    const parent = item.parentNum === 0 ? null : latestNodeBySourceId.get(item.parentNum)
    const node = {
      title: item.title,
      children: []
    }

    if (parent && parent !== node) {
      parent.children.push(node)
    } else {
      roots.push(node)
      if (!root || item.depth === 0) root = node
    }

    latestNodeBySourceId.set(item.idNum, node)
  }

  if (!root) root = roots[0]

  if (root) {
    const extraRoots = roots.filter((n) => n !== root)
    if (extraRoots.length) {
      root.children = [...(root.children || []), ...extraRoots]
    }
  }

  const parsedNodeCount = flattenRawTree(root).length
  console.info(`${LLM_DEBUG_PREFIX} 分步行解析统计`, {
    inputLineCount: lines.length,
    parsedItemCount: items.length,
    parsedNodeCount
  })

  return root
}

function extractLooseTitlesFromText(text, limit = 6) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const ban = /(解释|分析|思考|要求|约束|格式|输出|BEGIN_|END_|L\d+\|N\d+\|P\d+)/i
  const out = []

  for (const raw of lines) {
    let t = raw
      .replace(/^[-*\d.、\s]+/, '')
      .replace(/^L\d+\s*[:：|｜-]\s*/i, '')
      .replace(/[，。；：,.!！?？].*$/, '')
      .trim()

    t = sanitizeIdeaTitle(t, 18)

    if (!t) continue
    if (ban.test(t)) continue
    if (isMetaNarrationTitle(t)) continue
    if (t.length < 2) continue
    if (!out.includes(t)) out.push(t)
    if (out.length >= limit) break
  }

  return out
}

async function buildTitleTreeByLines(promptText, count, depth, apiSettings) {
  const generationSettings = {
    ...apiSettings,
    max_tokens: 3200,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是统一素材树结构生成器。',
    '请严格使用分步行格式输出，不要输出 JSON。',
    '每一行格式必须是：L<层级>|N<编号>|P<父编号>|<标题>',
    '约束：层级从1开始；根节点唯一；标题不超过18字；节点要具体，能作为后续分镜种子和素材入口；只能输出行，不要解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹所有行。',
    '示例：',
    'BEGIN_LINES',
    'L1|N1|P0|雨夜',
    'L2|N2|P1|路灯下的水纹',
    'L3|N3|P2|伞沿滴落',
    'END_LINES'
  ].join('\n')

  const userPrompt = [
    `主题：${promptText}`,
    `一级分支数量：${count}`,
    `最大层数：${depth}`,
    '请覆盖不同方向的素材线索，避免同义重复，并让每个节点都便于后续送入素材池。'
  ].join('\n')

  const strictRetryPrompt = [
    '上一条格式不合规。',
    '请重新输出，且只能输出分步行格式。',
    '不要任何解释文字。',
    '每行必须匹配：L<层级>|N<编号>|P<父编号>|<标题>',
    '必须用 BEGIN_LINES 开始，END_LINES 结束。'
  ].join('\n')

  const hardSystemPrompt = [
    '只做格式转换任务。',
    '输出必须是分步行格式。',
    '禁止解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹。'
  ].join('\n')

  const hardUserPrompt = [
    `主题：${promptText}`,
    `一级分支数量：${count}`,
    `最大层数：${depth}`,
    '严格输出：',
    'BEGIN_LINES',
    'L1|N1|P0|<主题>',
    'L2|N2|P1|<分支标题>',
    'L3|N3|P2|<子分支标题>',
    'END_LINES'
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'material.tree',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseLineTree,
    isValidParsed: (parsed) => Boolean(parsed),
    attempts: [
      {
        name: '分步行首轮'
      },
      {
        name: '分步行二轮',
        appendMessages: [{ role: 'user', content: strictRetryPrompt }]
      },
      {
        name: '分步行三轮',
        messages: [
          { role: 'system', content: hardSystemPrompt },
          { role: 'user', content: hardUserPrompt }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  if (generationResult.success && generationResult.parsed) {
    return generationResult.parsed
  }

  throw new Error('分步行解析失败，请重试')
}

function applyExamplesByTitle(rawTree, mapping) {
  const list = flattenRawTree(rawTree)
  for (const node of list) {
    const key = sanitizeIdeaTitle(String(node.title || node.text || ''), 36)
    const got = mapping.get(key) || mapping.get(String(node.title || node.text || ''))
    if (got && got.length >= 2) {
      if (node.title) node.title = key
      if (node.text) node.text = key
      node.examples = got.slice(0, 2)
    }
  }
}

function assertAllNodesHaveExamples(rawTree) {
  const list = flattenRawTree(rawTree)
  const invalid = list.filter((node) => {
    const examples = Array.isArray(node.examples) ? node.examples.filter(Boolean) : []
    return examples.length < 2
  })

  if (invalid.length) {
    const names = invalid.slice(0, 5).map((n) => String(n.title || n.text || '未命名')).join('、')
    throw new Error(`以下节点缺少模型例句：${names}`)
  }
}

function collectExamplesMap(attempts = []) {
  const merged = new Map()
  for (const attempt of attempts) {
    if (attempt?.parsed instanceof Map) {
      for (const [k, v] of attempt.parsed.entries()) {
        merged.set(k, v)
      }
    }
  }
  return merged
}

async function repairExamplesBatchByLLM(titles, apiSettings) {
  if (!titles.length) return new Map()

  const generationSettings = {
    ...apiSettings,
    max_tokens: 1800,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  }

  const systemPrompt = [
    '你是统一示例句补全器。',
    '我会给你一组标题。',
    '请为每个标题写2句明显不同、具体有画面感的诗句。',
    '仅输出 JSON 对象，不要解释。',
    '格式：{"items":[{"title":"...","examples":["句1","句2"]}]}'
  ].join('\n')

  const userPrompt = JSON.stringify({ titles })

  const parseExamplesJsonMap = (content) => {
    const text = String(content || '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const candidate = jsonMatch?.[0] || text

    try {
      const parsed = JSON.parse(candidate)
      const arr = Array.isArray(parsed?.items) ? parsed.items : []
      const out = new Map()
      for (const item of arr) {
        const title = sanitizeIdeaTitle(String(item?.title || '').trim(), 36)
        const examples = Array.isArray(item?.examples) ? item.examples.filter(Boolean).slice(0, 2) : []
        if (title && examples.length === 2) {
          out.set(title, examples)
        }
      }
      return out
    } catch {
      return new Map()
    }
  }

  const generationResult = await runGenerationTask({
    taskType: 'material.examples.json',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseExamplesJsonMap,
    isValidParsed: (parsed, { history }) => {
      const merged = collectExamplesMap([...history, { parsed }])
      return merged.size >= titles.length
    },
    attempts: [
      {
        name: '例句JSON首轮'
      },
      {
        name: '例句JSON重试',
        appendMessages: [
          {
            role: 'user',
            content: [
              '上一条 JSON 不完整或格式不正确。',
              '请仅输出 JSON 对象：{"items":[{"title":"...","examples":["句1","句2"]}] }。',
              '不要额外解释。'
            ].join('\n')
          }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 280))
  }

  return collectExamplesMap(generationResult.attempts)
}

function parseExampleLineBlock(text) {
  const raw = String(text || '')
  const blockMatch = raw.match(/BEGIN_EXAMPLES([\s\S]*?)END_EXAMPLES/i)
  const block = blockMatch?.[1] || raw
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const out = new Map()
  for (const line of lines) {
    const normalized = line.replace(/[｜]/g, '|')
    const m = normalized.match(/^T\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/)
    if (!m) continue
    const title = sanitizeIdeaTitle(String(m[1] || '').trim(), 36)
    const e1 = String(m[2] || '').trim()
    const e2 = String(m[3] || '').trim()
    if (title && e1 && e2) {
      out.set(title, [e1, e2])
    }
  }

  return out
}

async function fillExamplesForMissingTitles(missingTitles, apiSettings) {
  if (!missingTitles.length) return new Map()

  const generationSettings = {
    ...apiSettings,
    max_tokens: 2000,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是统一示例句补全器。',
    '只输出行格式，不要输出 JSON，不要解释。',
    '必须输出：BEGIN_EXAMPLES 和 END_EXAMPLES 包裹内容。',
    '每行格式：T|标题|句子1|句子2',
    '句子必须具体有画面感，句1和句2不能同义改写。'
  ].join('\n')

  const userPrompt = [
    `标题数量：${missingTitles.length}`,
    '请覆盖下列标题：',
    ...missingTitles.map((t) => `- ${t}`)
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'material.examples.lines',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: (content) => parseExampleLineBlock(content || ''),
    isValidParsed: (parsed, { history }) => {
      const merged = collectExamplesMap([...history, { parsed }])
      return merged.size >= missingTitles.length
    },
    attempts: [
      {
        name: '例句首轮'
      },
      {
        name: '例句补齐重试',
        buildMessages: ({ baseMessages, history }) => {
          const merged = collectExamplesMap(history)
          const stillMissing = missingTitles.filter((t) => !merged.has(t))
          if (!stillMissing.length) return baseMessages
          return [
            ...baseMessages,
            {
              role: 'user',
              content: [
                '上一条格式或覆盖不完整。',
                '请只输出缺失标题的行。',
                '必须使用 BEGIN_EXAMPLES/END_EXAMPLES。',
                '缺失标题：',
                ...stillMissing.map((t) => `- ${t}`)
              ].join('\n')
            }
          ]
        }
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  const mergedMap = collectExamplesMap(generationResult.attempts)
  const finalMissing = missingTitles.filter((t) => !mergedMap.has(t))
  if (!finalMissing.length) return mergedMap

  for (const title of finalMissing) {
    try {
      const singleResult = await runGenerationTask({
        taskType: 'material.examples.single',
        baseMessages: [
          {
            role: 'system',
            content: '你是诗句补全器。仅输出一行：T|标题|句子1|句子2，不要解释。'
          },
          {
            role: 'user',
            content: `标题：${title}`
          }
        ],
        settings: generationSettings,
        parseContent: (content) => parseExampleLineBlock(String(content || 'BEGIN_EXAMPLES\nEND_EXAMPLES')),
        isValidParsed: (parsed) => parsed instanceof Map && parsed.size > 0,
        attempts: [
          {
            name: '单标题兜底首轮'
          },
          {
            name: '单标题兜底重试',
            appendMessages: [
              {
                role: 'user',
                content: '上一条格式不正确。仅输出一行：T|标题|句子1|句子2。不要解释。'
              }
            ]
          }
        ]
      })

      const singleMap = collectExamplesMap(singleResult.attempts)
      if (singleMap.has(title)) {
        mergedMap.set(title, singleMap.get(title))
        continue
      }

      const fallbackText = singleResult.attempts
        .map((attempt) => String(attempt.content || ''))
        .join('\n')
        .trim()

      const oneLine = fallbackText.replace(/[｜]/g, '|')
      const m = oneLine.match(/^T\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/)
      if (m) {
        const t = String(m[1] || '').trim()
        const e1 = String(m[2] || '').trim()
        const e2 = String(m[3] || '').trim()
        if (t && e1 && e2) mergedMap.set(t, [e1, e2])
      }
    } catch (e) {
      console.warn(`${LLM_DEBUG_PREFIX} 单标题兜底失败`, { title, error: e?.message || e })
    }
  }

  return mergedMap
}

async function postProcessExamplesByLLM(rawTree, apiSettings) {
  const nodes = flattenRawTree(rawTree)
  const titles = [...new Set(nodes.map((node) => sanitizeIdeaTitle(String(node.title || ''), 36)).filter(Boolean))].slice(0, 120)

  const fixed = new Map()
  const chunkSize = 24

  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize)
    const part = await repairExamplesBatchByLLM(chunk, apiSettings)
    for (const [k, v] of part.entries()) fixed.set(k, v)
  }

  const missing = titles.filter((t) => !fixed.has(t))
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize)
    const filled = await fillExamplesForMissingTitles(chunk, apiSettings)
    for (const [k, v] of filled.entries()) fixed.set(k, v)
  }

  applyExamplesByTitle(rawTree, fixed)
}

export async function generateMaterialTreeByLLM(promptText, count, depth) {
  const apiSettings = await getResolvedApiSettings()
  ensureApiSettings(apiSettings)

  const titleTree = await buildTitleTreeByLines(promptText, count, depth, apiSettings)
  await postProcessExamplesByLLM(titleTree, apiSettings)
  assertAllNodesHaveExamples(titleTree)
  return titleTree
}

export async function generateMaterialContinuationByLLM(node, count, mode = 'neutral', feedback = '') {
  const apiSettings = await getResolvedApiSettings()
  ensureApiSettings(apiSettings)

  const nodeText = String(node?.text || node?.title || '').trim()
  const generationSettings = {
    ...apiSettings,
    max_tokens: 900,
    temperature: 0.2
  }

  const systemPrompt = [
    '你是统一分支扩展器。',
    '请输出分步行格式，不要输出 JSON。',
    '每行格式：L<层级>|N<编号>|P<父编号>|<标题>',
    '本次只输出子节点及其子树，根父编号统一写 P1。',
    '标题必须是意象短语，不得出现“我们根据用户反馈”“请输出”等说明句。',
    '不要解释。'
  ].join('\n')

  const userPrompt = [
    `父节点主题：${nodeText}`,
    `生成数量：${count}`,
    `反馈模式：${mode}`,
    `用户反馈：${feedback || '无'}`,
    '输出层级从 L2 开始。'
  ].join('\n')

  const parseChildrenFromLineText = (rawText = '') => {
    const parsed = parseLineTree(`L1|N1|P0|${nodeText}\n${rawText}`)
    const children = Array.isArray(parsed?.children) ? parsed.children : []
    return children
      .map((c) => ({ ...c, title: sanitizeIdeaTitle(c?.title || '', 18) }))
      .filter((c) => c.title && !isMetaNarrationTitle(c.title))
  }

  const generationResult = await runGenerationTask({
    taskType: 'material.continue',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseChildrenFromLineText,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      {
        name: '续写首轮'
      },
      {
        name: '续写格式重试',
        messages: [
          {
            role: 'system',
            content: [
              '你是统一分支扩展器。',
              '请只输出分步行格式，不要解释。',
              '每行必须是：L2|N<编号>|P1|<标题> 或 L3|N<编号>|P<父编号>|<标题>',
              '必须使用 BEGIN_LINES 和 END_LINES 包裹。'
            ].join('\n')
          },
          { role: 'user', content: userPrompt }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  let children = Array.isArray(generationResult.parsed) ? generationResult.parsed : []

  if (!children.length) {
    const combinedText = generationResult.attempts.map((item) => String(item.content || '')).join('\n')
    const looseTitles = extractLooseTitlesFromText(combinedText, count)
    children = looseTitles
      .map((title) => sanitizeIdeaTitle(title, 18))
      .filter((title) => title && !isMetaNarrationTitle(title))
      .map((title) => ({ title, children: [] }))
  }

  if (!children.length) {
    throw new Error('模型未返回可用续写分支')
  }

  const wrapper = { title: 'tmp', children }
  await postProcessExamplesByLLM(wrapper, apiSettings)
  for (const child of children) {
    assertAllNodesHaveExamples(child)
  }

  return children
}

export async function generateStoryboardDirectingTreeByLLM(promptText, count, depth) {
  const apiSettings = await getResolvedApiSettings()
  ensureApiSettings(apiSettings)

  const generationSettings = {
    ...apiSettings,
    max_tokens: 3200,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是统一分镜草稿生成器。',
    '请严格使用分步行格式输出，不要输出 JSON。',
    '每一行格式必须是：L<层级>|N<编号>|P<父编号>|<镜头描述>',
    '约束：层级从1开始；根节点唯一；每个节点描述一个可直接落入统一分镜的画面；需包含景别、运镜、色调、声音建议，并尽量保留可提炼为素材的视觉细节；只能输出行，不要解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹所有行。',
    '示例：',
    'BEGIN_LINES',
    'L1|N1|P0|雨夜街道全景，固定镜头，冷蓝色调',
    'L2|N2|P1|路灯特写，推镜头，暖黄光晕，雨声',
    'END_LINES'
  ].join('\n')

  const userPrompt = [
    `场景主题：${promptText}`,
    `一级分镜数量：${count}`,
    `最大层数：${depth}`,
    '请按叙事逻辑生成分镜序列，每节点包含画面描述、建议景别和运镜、色调情绪，并便于后续提取为分镜种子或素材。'
  ].join('\n')

  const generationResult = await runGenerationTask({
    taskType: 'storyboard.directing-tree',
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseLineTree,
    isValidParsed: (parsed) => Boolean(parsed),
    attempts: [
      {
        name: '分镜图首轮'
      },
      {
        name: '分镜图二轮',
        appendMessages: [
          {
            role: 'user',
            content: '上一条格式不合规。请重新输出分步行格式，不要解释，每行匹配：L<层级>|N<编号>|P<父编号>|<镜头描述>。'
          }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  if (generationResult.success && generationResult.parsed) {
    return generationResult.parsed
  }

  throw new Error('分镜图解析失败，请重试')
}
