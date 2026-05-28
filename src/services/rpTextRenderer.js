const TOKEN_PRIORITY = {
  worldIntro: 0,
  action: 1,
  dialogue: 2,
  thought: 3,
  item: 4,
  location: 5,
  time: 6
}

const TOKEN_PATTERNS = [
  {
    type: 'worldIntro',
    pattern: /^\*([^*\n]+)\*(?:\n|$)/g,
    contentIndex: 1
  },
  {
    type: 'worldIntro',
    pattern: /^【([^】\n]{4,80})】/g,
    contentIndex: 1
  },
  {
    type: 'action',
    pattern: /\*([^*\n]+?)\*/g,
    contentIndex: 1
  },
  {
    type: 'dialogue',
    pattern: /"([^"\n]{3,})"|“([^”]{3,})”|「([^」]{3,})」/g,
    contentIndex: [1, 2, 3]
  },
  {
    type: 'thought',
    pattern: /（([^）\n]{2,})）/g,
    contentIndex: 1
  },
  {
    type: 'thought',
    pattern: /(?:心想|暗想|想着|在心里说|心里想着|心中暗想)[:：]?\s*([^。！？\n]{2,80})/g,
    contentIndex: 1
  },
  {
    type: 'item',
    pattern: /(?:获得了|发现了|得到了|拿到了|捡到了|拾起了|取到了|收起了|带走了|获得|发现|得到|拿到|捡到|拾起|取到|收起|带走)([^，。！？\n]{1,16}(?:道具|武器|装备|物品|宝物|钥匙|令牌|卷轴|地图|书信|药水|长剑|短刀|碎片|戒指))/g,
    contentIndex: 1
  },
  {
    type: 'location',
    pattern: /(?:来到|身处|抵达|进入|踏入|到达|走进|回到|穿过)([^，。！？\n]{2,18})/g,
    contentIndex: 1
  },
  {
    type: 'time',
    pattern: /\d{1,4}年\d{1,2}月\d{1,2}日/g,
    contentIndex: 0
  },
  {
    type: 'time',
    pattern: /(?:次日|翌日|隔天|清晨|傍晚|黄昏|深夜|黎明|夜里|上午|中午|下午|晚上)/g,
    contentIndex: 0
  }
]

export function renderRPText(text, options = {}) {
  const source = String(text || '')
  if (!source) return ''

  const triggerMatchers = buildTriggerMatchers(options)
  const tokens = tokenizeRPText(source)
  return renderTokens(tokens, triggerMatchers)
}

export function tokenizeRPText(text) {
  const source = String(text || '')
  if (!source) return []

  const matches = collectMatches(source)
  const tokens = []
  let cursor = 0

  for (const match of matches) {
    if (match.start < cursor) continue
    if (match.start > cursor) {
      tokens.push({
        type: 'text',
        raw: source.slice(cursor, match.start),
        content: source.slice(cursor, match.start)
      })
    }
    tokens.push(match)
    cursor = match.end
  }

  if (cursor < source.length) {
    tokens.push({
      type: 'text',
      raw: source.slice(cursor),
      content: source.slice(cursor)
    })
  }

  return tokens
}

function collectMatches(source) {
  const matches = []

  for (const config of TOKEN_PATTERNS) {
    config.pattern.lastIndex = 0
    for (const match of source.matchAll(config.pattern)) {
      const raw = match[0]
      if (!raw) continue
      const content = normalizeTokenContent(config.type, getMatchContent(match, config.contentIndex))
      matches.push({
        type: config.type,
        raw,
        content,
        start: match.index,
        end: match.index + raw.length,
        priority: TOKEN_PRIORITY[config.type] ?? 99
      })
    }
  }

  return matches
    .sort((a, b) => (
      a.start - b.start
      || a.priority - b.priority
      || b.end - a.end
    ))
    .reduce((acc, match) => {
      const overlaps = acc.some((existing) => match.start < existing.end && match.end > existing.start)
      if (!overlaps) acc.push(match)
      return acc
    }, [])
    .sort((a, b) => a.start - b.start)
}

function getMatchContent(match, contentIndex) {
  if (Array.isArray(contentIndex)) {
    for (const index of contentIndex) {
      if (match[index]) return match[index]
    }
    return match[0]
  }
  return match[contentIndex] || match[0]
}

function normalizeTokenContent(type, value) {
  const text = String(value || '').trim()
  if (type === 'item') {
    return text.replace(/^了+/, '')
  }
  return text
}

function renderTokens(tokens, triggerMatchers) {
  return tokens.map((token) => renderToken(token, triggerMatchers)).join('')
}

function renderToken(token, triggerMatchers) {
  const content = escapeHtml(token.content)
  const raw = escapeHtml(token.raw)

  if (token.type === 'text') return renderPlainText(token.content)
  if (token.type === 'worldIntro') return `<em class="rp-world-intro">${content}</em>`
  if (token.type === 'action') return `<em class="rp-action">${content}</em>`
  if (token.type === 'thought') return `<span class="rp-thought">${content}</span>`
  if (token.type === 'location') return `<span class="rp-location">${raw}</span>`
  if (token.type === 'time') return `<span class="rp-time">${raw}</span>`
  if (token.type === 'item') {
    return `<span class="rp-item clickable" data-inline-type="item" data-inline-content="${escapeAttribute(token.content)}">${raw}</span>`
  }
  if (token.type === 'dialogue') {
    const triggered = isDialogueTrigger(token, triggerMatchers)
    const content = renderDialogueContent(token.content)
    if (!triggered) {
      return `<span class="rp-dialogue">${content}</span>`
    }

    const classes = ['rp-dialogue', 'clickable', 'mechanism-trigger'].join(' ')
    return `<span class="${classes}" title="触发对话机制" data-inline-type="dialogue" data-inline-content="${escapeAttribute(token.content)}">${content}</span>`
  }

  return renderPlainText(token.raw)
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function renderDialogueContent(text) {
  const escaped = escapeHtml(text)
  const withNestedQuotes = escaped
    .replace(/‘([^’\n]+)’/g, (match) => `<span class="rp-dialogue-quote rp-dialogue-quote-soft">${match}</span>`)
    .replace(/『([^』\n]+)』/g, (match) => `<span class="rp-dialogue-quote rp-dialogue-quote-warm">${match}</span>`)
    .replace(/'([^'\n]{2,80})'/g, (match) => `<span class="rp-dialogue-quote rp-dialogue-quote-neutral">${match}</span>`)
  return withNestedQuotes.replace(/\n/g, '<br>')
}

function buildTriggerMatchers(options = {}) {
  const values = []
  const mechanism = options.mechanismTrigger || options.mechanism || null
  const inlineEvents = Array.isArray(options.inlineEvents) ? options.inlineEvents : []

  if (mechanism?.type === 'dialogue') {
    values.push(mechanism.match, mechanism.dialogue, mechanism.context)
  }

  for (const event of inlineEvents) {
    if (event?.type !== 'dialogue') continue
    if (!event?.data?.mechanismTrigger && !event?.mechanismTrigger) continue
    values.push(event.text, event.data?.dialogue)
  }

  return values
    .map(normalizeComparableText)
    .filter(Boolean)
}

function isDialogueTrigger(token, triggerMatchers) {
  if (!triggerMatchers.length) return false
  const raw = normalizeComparableText(token.raw)
  const content = normalizeComparableText(token.content)
  return triggerMatchers.some((value) => value === raw || value === content || raw.includes(value) || value.includes(content))
}

function normalizeComparableText(value) {
  return String(value || '')
    .replace(/^["“「]|["”」]$/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value) {
  return escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
