export const NARRATIVE_AGENT_SCHEMA_VERSION = 1

export const NARRATIVE_TOOL_LIMITS = Object.freeze({
  maxItems: 6,
  maxIds: 12,
  maxQueryChars: 500,
  maxItemChars: 520,
  maxGetItemChars: 2800,
  maxResultChars: 4200,
  maxCallsPerRound: 4,
  maxCallsPerTurn: 6,
  maxToolResultRounds: 2
})

export const NARRATIVE_TOOL_CURSOR_VERSION = 1

export const NARRATIVE_READ_TOOLS = Object.freeze({
  world_lookup: Object.freeze({
    actions: Object.freeze(['search', 'get', 'related']),
    description: '查询当前世界书中的角色、组织、地点设定、物品、规则和普通条目。'
  }),
  geo_lookup: Object.freeze({
    actions: Object.freeze(['current', 'get', 'nearby', 'route']),
    description: '查询当前地点、地点详情、邻近地点和已有路线约束。'
  }),
  history_lookup: Object.freeze({
    actions: Object.freeze(['search', 'get', 'trace']),
    description: '查询并追溯与地点、人物、时间和因果相关的世界历史或玩家历史。'
  }),
  memory_lookup: Object.freeze({
    actions: Object.freeze(['search', 'get']),
    description: '查询当前项目或会话中已经确认的记忆事实。'
  })
})

export const NARRATIVE_READ_TOOL_NAMES = Object.freeze(Object.keys(NARRATIVE_READ_TOOLS))

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}
function uniqueTextList(value, limit) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(text).filter(Boolean))].slice(0, limit)
}

function parseArguments(value) {
  if (value == null) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : null
}

function error(code, message, details = {}) {
  return { valid: false, error: { code, message, ...details } }
}

function normalizeFilters(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const timeRange = raw.timeRange && typeof raw.timeRange === 'object' && !Array.isArray(raw.timeRange)
    ? {
        from: text(raw.timeRange.from),
        to: text(raw.timeRange.to)
      }
    : null
  const filters = {
    entityTypes: uniqueTextList(raw.entityTypes, 12),
    placeIds: uniqueTextList(raw.placeIds, 12),
    characterIds: uniqueTextList(raw.characterIds, 12),
    scopes: uniqueTextList(raw.scopes, 3)
  }
  if (timeRange?.from || timeRange?.to) filters.timeRange = timeRange
  return filters
}

function validateActionInput(name, input) {
  const hasIds = input.ids.length > 0
  const hasQuery = Boolean(input.query)
  if (name === 'world_lookup') {
    if (input.action === 'search' && !hasQuery) return 'search-requires-query'
    if (['get', 'related'].includes(input.action) && !hasIds) return `${input.action}-requires-ids`
  }
  if (name === 'geo_lookup') {
    if (input.action === 'get' && !hasIds) return 'get-requires-ids'
    if (input.action === 'route' && input.ids.length !== 2) return 'route-requires-two-ids'
  }
  if (name === 'history_lookup') {
    if (input.action === 'search' && !hasQuery && input.filters.placeIds.length === 0 && input.filters.characterIds.length === 0) {
      return 'search-requires-query-or-filter'
    }
    if (['get', 'trace'].includes(input.action) && !hasIds) return `${input.action}-requires-ids`
  }
  if (name === 'memory_lookup') {
    if (input.action === 'search' && !hasQuery) return 'search-requires-query'
    if (input.action === 'get' && !hasIds) return 'get-requires-ids'
  }
  return ''
}

export function validateNarrativeToolInput(name, rawInput) {
  const definition = NARRATIVE_READ_TOOLS[name]
  if (!definition) {
    return error('NARRATIVE_TOOL_UNKNOWN', `未知叙事工具：${text(name) || 'empty'}`)
  }
  const parsed = parseArguments(rawInput)
  if (!parsed) {
    return error('NARRATIVE_TOOL_ARGUMENTS_INVALID', '工具参数必须是 JSON 对象')
  }
  const action = text(parsed.action).toLowerCase()
  if (!definition.actions.includes(action)) {
    return error('NARRATIVE_TOOL_ACTION_INVALID', `${name} 不支持 action=${action || 'empty'}`, {
      allowedActions: [...definition.actions]
    })
  }
  const query = text(parsed.query)
  if (query.length > NARRATIVE_TOOL_LIMITS.maxQueryChars) {
    return error('NARRATIVE_TOOL_QUERY_TOO_LONG', '查询文本超过长度上限')
  }
  const rawIds = Array.isArray(parsed.ids) ? parsed.ids : []
  if (rawIds.length > NARRATIVE_TOOL_LIMITS.maxIds) {
    return error('NARRATIVE_TOOL_IDS_TOO_MANY', '工具 ID 数量超过上限')
  }
  const ids = uniqueTextList(rawIds, NARRATIVE_TOOL_LIMITS.maxIds)
  const requestedLimit = parsed.limit == null ? NARRATIVE_TOOL_LIMITS.maxItems : Number(parsed.limit)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > NARRATIVE_TOOL_LIMITS.maxItems) {
    return error('NARRATIVE_TOOL_LIMIT_INVALID', `limit 必须是 1-${NARRATIVE_TOOL_LIMITS.maxItems} 的整数`)
  }
  const filters = normalizeFilters(parsed.filters || {})
  if (!filters) {
    return error('NARRATIVE_TOOL_FILTERS_INVALID', 'filters 必须是对象')
  }
  if (filters.scopes.some((scope) => !['project', 'session'].includes(scope))) {
    return error('NARRATIVE_TOOL_SCOPE_INVALID', '记忆 scope 只允许 project 或 session')
  }
  const input = {
    action,
    query,
    ids,
    filters,
    limit: requestedLimit,
    cursor: text(parsed.cursor)
  }
  if (input.cursor.length > 512) {
    return error('NARRATIVE_CURSOR_TOO_LONG', 'cursor 超过长度上限')
  }
  const actionError = validateActionInput(name, input)
  if (actionError) {
    return error('NARRATIVE_TOOL_ARGUMENTS_INVALID', actionError)
  }
  return { valid: true, input }
}

export function validateNarrativeToolCall(rawCall = {}) {
  if (!rawCall || typeof rawCall !== 'object' || Array.isArray(rawCall)) {
    return error('NARRATIVE_TOOL_CALL_INVALID', '工具调用必须是对象')
  }
  const id = text(rawCall.id || rawCall.toolCallId)
  const name = text(rawCall.name || rawCall.function?.name)
  const rawArguments = rawCall.arguments ?? rawCall.input ?? rawCall.function?.arguments
  const validation = validateNarrativeToolInput(name, rawArguments)
  if (!validation.valid) return validation
  return {
    valid: true,
    call: {
      id: id || `call-${name}`,
      name,
      arguments: validation.input
    }
  }
}

function toolInputSchema(actions) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: [...actions] },
      query: { type: 'string', maxLength: NARRATIVE_TOOL_LIMITS.maxQueryChars },
      ids: {
        type: 'array',
        maxItems: NARRATIVE_TOOL_LIMITS.maxIds,
        items: { type: 'string', minLength: 1 }
      },
      filters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entityTypes: { type: 'array', maxItems: 12, items: { type: 'string' } },
          placeIds: { type: 'array', maxItems: 12, items: { type: 'string' } },
          characterIds: { type: 'array', maxItems: 12, items: { type: 'string' } },
          scopes: {
            type: 'array',
            maxItems: 2,
            items: { type: 'string', enum: ['project', 'session'] }
          },
          timeRange: {
            type: 'object',
            additionalProperties: false,
            properties: {
              from: { type: 'string' },
              to: { type: 'string' }
            }
          }
        }
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: NARRATIVE_TOOL_LIMITS.maxItems
      },
      cursor: { type: 'string' }
    }
  }
}

export function resolveNarrativeActiveToolNames(input = '', options = {}) {
  const normalized = text(input)
  const names = new Set(['world_lookup', 'geo_lookup'])
  const explicitHistory = /历史|史实|追溯|因果|年代|时间线|旧关系|过去/.test(normalized)
  const explicitMemory = /记忆|记得|回想|曾经|之前确认|已知/.test(normalized)
  if (explicitHistory || options.hasHistory === true) names.add('history_lookup')
  if (explicitMemory || options.hasMemory === true) names.add('memory_lookup')
  return NARRATIVE_READ_TOOL_NAMES.filter((name) => names.has(name))
}

export function getNarrativeToolCatalog(options = {}) {
  const activeTools = Array.isArray(options.activeTools) && options.activeTools.length > 0
    ? new Set(options.activeTools)
    : null
  return NARRATIVE_READ_TOOL_NAMES
    .filter((name) => !activeTools || activeTools.has(name))
    .map((name) => ({
    name,
    description: NARRATIVE_READ_TOOLS[name].description,
    inputSchema: toolInputSchema(NARRATIVE_READ_TOOLS[name].actions)
    }))
}

function encodeCursor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeCursor(value) {
  const normalized = text(value).replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized) return null
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

export function createNarrativeCursor({
  revision = '',
  domain = '',
  sortKey = '',
  itemId = ''
} = {}) {
  if (!text(revision) || !text(domain) || !text(sortKey) || !text(itemId)) return ''
  return encodeCursor({
    version: NARRATIVE_TOOL_CURSOR_VERSION,
    revision: text(revision),
    domain: text(domain),
    sortKey: text(sortKey),
    itemId: text(itemId)
  })
}

export function parseNarrativeCursor(value, { revision = '', domain = '' } = {}) {
  const parsed = decodeCursor(value)
  if (!parsed || parsed.version !== NARRATIVE_TOOL_CURSOR_VERSION) {
    return { valid: false, error: { code: 'NARRATIVE_CURSOR_INVALID', message: 'cursor 格式无效' } }
  }
  if (text(revision) && parsed.revision !== text(revision)) {
    return { valid: false, error: { code: 'NARRATIVE_CURSOR_STALE', message: 'cursor 对应的资源 revision 已变化' } }
  }
  if (text(domain) && parsed.domain !== text(domain)) {
    return { valid: false, error: { code: 'NARRATIVE_CURSOR_DOMAIN_MISMATCH', message: 'cursor 不属于当前资料域' } }
  }
  if (!text(parsed.sortKey) || !text(parsed.itemId)) {
    return { valid: false, error: { code: 'NARRATIVE_CURSOR_INVALID', message: 'cursor 缺少稳定排序位置' } }
  }
  return { valid: true, cursor: parsed }
}

export function stableNarrativeSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableNarrativeSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableNarrativeSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function createNarrativeRevision(prefix, value) {
  let hash = 2166136261
  for (const character of stableNarrativeSerialize(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${text(prefix) || 'nar'}-${(hash >>> 0).toString(36)}`
}

export function createNarrativeToolError(call, code, message, details = {}) {
  return {
    schemaVersion: NARRATIVE_AGENT_SCHEMA_VERSION,
    ok: false,
    callId: text(call?.id),
    tool: text(call?.name),
    action: text(call?.arguments?.action),
    error: {
      code: text(code) || 'NARRATIVE_TOOL_ERROR',
      message: text(message) || '叙事工具执行失败',
      retryable: false,
      ...details
    }
  }
}
