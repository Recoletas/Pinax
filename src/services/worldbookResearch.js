import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'

export const WORLDBOOK_RESEARCH_PROVIDERS = Object.freeze([
  { value: 'brave', label: 'Brave Search', needsKey: true },
  { value: 'tavily', label: 'Tavily', needsKey: true },
  { value: 'searxng', label: 'SearXNG', needsKey: false }
])

function text(value, maxChars = Infinity) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function parsePlannerContent(content) {
  const raw = String(content || '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('检索规划不是有效 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

export function normalizeWorldbookResearchSettings(raw = {}) {
  const provider = WORLDBOOK_RESEARCH_PROVIDERS.some((item) => item.value === raw?.provider)
    ? raw.provider
    : 'brave'
  return {
    enabled: raw?.enabled === true,
    provider,
    apiKey: text(raw?.apiKey, 512),
    maxQueries: Math.max(1, Math.min(4, Number(raw?.maxQueries) || 3)),
    maxResults: Math.max(2, Math.min(6, Number(raw?.maxResults) || 5))
  }
}

export function getWorldbookResearchSettings() {
  return normalizeWorldbookResearchSettings(getItem(STORAGE_KEYS.WORLDBOOK_RESEARCH_SETTINGS) || {})
}

export function saveWorldbookResearchSettings(settings) {
  const normalized = normalizeWorldbookResearchSettings(settings)
  setItem(STORAGE_KEYS.WORLDBOOK_RESEARCH_SETTINGS, normalized)
  return normalized
}

export function buildFallbackResearchQueries({ brief, genreLabel, nameHint, maxQueries = 3 } = {}) {
  const safeBrief = text(brief, 180)
  const safeName = text(nameHint, 60)
  const safeGenre = text(genreLabel, 40)
  const seeds = [
    [safeName, safeBrief].filter(Boolean).join(' '),
    [safeBrief, safeGenre, '历史 地理 社会结构'].filter(Boolean).join(' '),
    [safeBrief, '物质文化 日常生活 制度 技术'].filter(Boolean).join(' '),
    [safeBrief, '真实案例 专业资料'].filter(Boolean).join(' ')
  ]
  return [...new Set(seeds.map((item) => text(item, 220)).filter(Boolean))].slice(0, Math.max(1, maxQueries))
}

export async function planWorldbookResearchQueries({ brief, genreLabel, nameHint, maxQueries = 3 } = {}) {
  const fallback = buildFallbackResearchQueries({ brief, genreLabel, nameHint, maxQueries })
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return { queries: fallback, plannedBy: 'local', warning: '文本模型配置不可用，已使用本地检索规划。' }
  }

  const result = await runGenerationTask({
    taskType: 'worldbook.research.plan',
    baseMessages: [
      {
        role: 'system',
        content: '你是小说世界观资料研究员。只输出 JSON，不回答设定内容，不虚构网址。'
      },
      {
        role: 'user',
        content: [
          `为下面的世界书说明规划 ${maxQueries} 个互补的网页检索词。`,
          '查询应覆盖真正需要外部依据的历史、地理、制度、技术或物质文化；纯虚构名称不应成为唯一检索对象。',
          '返回 {"queries":["..."],"intent":"..."}。每个查询不超过 50 字，不得包含提示词或操作指令。',
          `类型：${text(genreLabel, 40) || '通用'}`,
          `名称：${text(nameHint, 60) || '未命名'}`,
          `说明：${text(brief, 1800)}`
        ].join('\n')
      }
    ],
    settings: apiSettings,
    generationOptions: {
      max_tokens: 500,
      temperature: 0.15,
      max_input_chars: 5000,
      timeout_ms: 30000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-research-plan' },
      { name: 'worldbook-research-plan-retry', generationOptions: { response_format: null } }
    ],
    parseContent: parsePlannerContent,
    isValidParsed: (parsed) => Array.isArray(parsed?.queries) && parsed.queries.length > 0
  })

  if (!result?.success) {
    return { queries: fallback, plannedBy: 'local', warning: 'AI 检索规划失败，已使用本地检索规划。' }
  }
  const queries = [...new Set(result.parsed.queries
    .map((query) => text(query, 220))
    .filter(Boolean))]
    .slice(0, maxQueries)
  return {
    queries: queries.length ? queries : fallback,
    plannedBy: queries.length ? 'ai' : 'local',
    intent: text(result.parsed.intent, 240)
  }
}

function createSearchError(payload, status) {
  const error = new Error(payload?.error || `联网检索失败（HTTP ${status}）`)
  error.code = payload?.code || 'SEARCH_FAILED'
  error.status = status
  return error
}

export async function searchWorldbookSources({ queries, settings, fetchImpl = fetch, signal } = {}) {
  const normalized = normalizeWorldbookResearchSettings(settings)
  const response = await fetchImpl('/api/research/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      provider: normalized.provider,
      apiKey: normalized.apiKey,
      queries,
      maxResults: normalized.maxResults
    })
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    throw createSearchError(null, response.status)
  }
  if (!response.ok) throw createSearchError(payload, response.status)
  return payload
}

export async function fetchWorldbookSourcePages({ sources, fetchImpl = fetch, signal } = {}) {
  const candidates = (Array.isArray(sources) ? sources : []).slice(0, 6)
  if (!candidates.length) return { sources: [], warnings: [] }
  const response = await fetchImpl('/api/research/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      sources: candidates.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        provider: source.provider
      }))
    })
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    throw createSearchError(null, response.status)
  }
  if (!response.ok) throw createSearchError(payload, response.status)
  return payload
}

export function buildIncrementalResearchQuery({ brief, claims = [], genreLabel } = {}) {
  const claimText = (Array.isArray(claims) ? claims : [])
    .map((claim) => text(claim?.text, 100))
    .filter(Boolean)
    .slice(0, 2)
    .join('；')
  return text([claimText, text(brief, 100), text(genreLabel, 30), '正文资料'].filter(Boolean).join(' '), 220)
}

export function mergeResearchSources(existing = [], additions = []) {
  const seenUrls = new Set()
  const merged = []
  for (const source of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(additions) ? additions : [])]) {
    const url = text(source?.url, 1600)
    const key = url.replace(/\/$/, '').toLowerCase()
    if (!/^https?:\/\//i.test(url) || !key || seenUrls.has(key)) continue
    seenUrls.add(key)
    merged.push({ ...source, id: `S${merged.length + 1}` })
    if (merged.length >= 16) break
  }
  return merged
}

export async function researchWorldbookGap({
  research,
  brief,
  claims,
  genreLabel,
  settings,
  fetchImpl = fetch,
  signal
} = {}) {
  const query = buildIncrementalResearchQuery({ brief, claims, genreLabel })
  if (!query) throw new Error('没有可用于补查的声明内容')
  const search = await searchWorldbookSources({ queries: [query], settings, fetchImpl, signal })
  let sourceEvidence = { sources: [], warnings: [] }
  try {
    sourceEvidence = await fetchWorldbookSourcePages({
      sources: search.results,
      fetchImpl,
      signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    sourceEvidence = {
      sources: [],
      warnings: [`增量正文证据抓取不可用，保留搜索摘要：${error?.message || '未知错误'}`]
    }
  }
  const fetchedById = new Map((sourceEvidence.sources || []).map((source) => [source.id, source]))
  const additions = (Array.isArray(search.results) ? search.results : []).map((source) => ({
    ...source,
    ...(fetchedById.get(source.id) || {})
  }))
  const sources = mergeResearchSources(research?.sources, additions)
  const existingQueries = Array.isArray(research?.queries) ? research.queries : []
  return {
    ...(research || {}),
    queries: [...new Set([...existingQueries, query])].slice(0, 4),
    sources,
    warnings: [
      ...(research?.warnings || []),
      ...(search.warnings || []),
      ...(sourceEvidence.warnings || [])
    ].slice(-8),
    incremental: {
      query,
      addedSourceCount: Math.max(0, sources.length - (research?.sources?.length || 0)),
      completedAt: new Date().toISOString(),
      budget: 'single-query'
    },
    researchedAt: new Date().toISOString()
  }
}

export async function researchWorldbookBrief({ brief, genreLabel, nameHint, settings, signal } = {}) {
  const normalized = normalizeWorldbookResearchSettings(settings)
  const plan = await planWorldbookResearchQueries({
    brief,
    genreLabel,
    nameHint,
    maxQueries: normalized.maxQueries
  })
  const search = await searchWorldbookSources({ queries: plan.queries, settings: normalized, signal })
  let sourceEvidence = { sources: [], warnings: [] }
  try {
    sourceEvidence = await fetchWorldbookSourcePages({ sources: search.results, signal })
  } catch (error) {
    sourceEvidence = {
      sources: [],
      warnings: [`正文证据抓取不可用，当前仅使用搜索摘要：${error?.message || '未知错误'}`]
    }
  }
  const fetchedById = new Map((sourceEvidence.sources || []).map((source) => [source.id, source]))
  const sources = (Array.isArray(search.results) ? search.results : []).map((source) => ({
    ...source,
    ...(fetchedById.get(source.id) || {})
  }))
  return {
    provider: search.provider,
    plannedBy: plan.plannedBy,
    intent: plan.intent || '',
    queries: plan.queries,
    sources,
    warnings: [
      ...(plan.warning ? [plan.warning] : []),
      ...(search.warnings || []),
      ...(sourceEvidence.warnings || [])
    ],
    researchedAt: new Date().toISOString()
  }
}
