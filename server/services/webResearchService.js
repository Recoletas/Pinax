import process from 'node:process'
import { lookup } from 'node:dns/promises'
import net from 'node:net'

const SEARCH_LIMITS = Object.freeze({
  maxQueries: 4,
  maxResultsPerQuery: 6,
  maxResultsTotal: 16,
  queryChars: 240,
  titleChars: 240,
  snippetChars: 1200,
  contentChars: 280000,
  evidenceChars: 6000,
  maxFetchSources: 6,
  maxResponseBytes: 1024 * 1024,
  timeoutMs: 12000,
  fetchTimeoutMs: 10000
})

const PROVIDERS = new Set(['auto', 'brave', 'tavily', 'searxng'])

function text(value, maxChars = Infinity) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function createResearchError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return ''
  }
}

function isPrivateIp(address) {
  const version = net.isIP(address)
  if (version === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
      (a === 198 && b >= 18 && b <= 19) || a === 0 || a >= 224
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7))
    return normalized === '::1' || normalized === '::' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') ||
      normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
  }
  return true
}

async function assertPublicUrl(value) {
  const normalized = normalizeHttpUrl(value)
  if (!normalized) throw createResearchError('RESEARCH_URL_INVALID', '来源 URL 不是有效的 HTTP(S) 地址', 400)
  const url = new URL(normalized)
  if (url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw createResearchError('RESEARCH_URL_BLOCKED', '来源 URL 不允许访问本机或携带凭据', 400)
  }
  let addresses
  try {
    addresses = net.isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw createResearchError('RESEARCH_DNS_FAILED', '来源域名无法解析，已阻止抓取', 400)
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw createResearchError('RESEARCH_URL_BLOCKED', '来源 URL 解析到了受限网络地址', 400)
  }
  return url
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article|blockquote|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\n\s+/g, '\n'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, SEARCH_LIMITS.contentChars)
}

function buildEvidenceBlocks(content) {
  const lines = String(content || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 24)
  const candidates = lines.length > 1
    ? lines
    : String(content || '').split(/(?<=[。！？.!?])\s+/).map((line) => line.trim()).filter(Boolean)
  const blocks = []
  let budget = SEARCH_LIMITS.evidenceChars
  for (const candidate of candidates) {
    if (blocks.length >= 12 || budget <= 0) break
    const blockText = candidate.slice(0, Math.min(800, budget))
    if (blockText.length < 24) continue
    blocks.push({
      id: `P${blocks.length + 1}`,
      locator: `正文段落 ${blocks.length + 1}`,
      text: blockText
    })
    budget -= blockText.length
  }
  return blocks
}

function classifySource(urlValue) {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase()
    if (/\.(gov|mil)(\.|$)/.test(hostname) || hostname.startsWith('gov.')) {
      return { sourceKind: 'institutional', quality: 'priority' }
    }
    if (/\.(edu|ac\.)/.test(hostname) || /museum|archive|library|university/.test(hostname)) {
      return { sourceKind: 'academic-or-cultural', quality: 'priority' }
    }
    if (/docs?|developer|specification|standards?/.test(hostname)) {
      return { sourceKind: 'official-reference', quality: 'preferred' }
    }
    return { sourceKind: 'general-web', quality: 'normal' }
  } catch {
    return { sourceKind: 'unknown', quality: 'normal' }
  }
}

function normalizeResult(raw, provider) {
  const url = normalizeHttpUrl(raw?.url || raw?.link)
  if (!url) return null
  const title = text(raw?.title || raw?.name || url, SEARCH_LIMITS.titleChars)
  const snippet = text(raw?.snippet || raw?.description || raw?.content, SEARCH_LIMITS.snippetChars)
  if (!title && !snippet) return null
  return {
    title,
    url,
    snippet,
    publishedAt: text(raw?.publishedAt || raw?.published_date || raw?.age, 80),
    ...classifySource(url),
    provider
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_LIMITS.timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const body = await response.text()
    let payload = null
    try {
      payload = body ? JSON.parse(body) : null
    } catch {
      throw createResearchError('SEARCH_INVALID_RESPONSE', `搜索服务返回了无法解析的内容（HTTP ${response.status}）`, 502)
    }
    if (!response.ok) {
      const detail = text(payload?.message || payload?.error?.message || payload?.detail, 240)
      throw createResearchError(
        response.status === 401 || response.status === 403 ? 'SEARCH_AUTH_FAILED' : 'SEARCH_UPSTREAM_FAILED',
        `搜索服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
        response.status === 401 || response.status === 403 ? 401 : 502
      )
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createResearchError('SEARCH_TIMEOUT', `搜索服务在 ${SEARCH_LIMITS.timeoutMs / 1000} 秒内未响应`, 504)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function readLimitedText(response) {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > SEARCH_LIMITS.maxResponseBytes) {
    throw createResearchError('RESEARCH_RESPONSE_TOO_LARGE', '来源响应超过 1MB 限制', 413)
  }
  if (!response.body) {
    const output = await response.text()
    return {
      text: output.slice(0, SEARCH_LIMITS.maxResponseBytes),
      truncated: output.length > SEARCH_LIMITS.maxResponseBytes
    }
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let output = ''
  let truncated = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > SEARCH_LIMITS.maxResponseBytes) {
        truncated = true
        break
      }
      output += decoder.decode(chunk.value, { stream: true })
      if (output.length >= SEARCH_LIMITS.contentChars * 2) {
        truncated = true
        break
      }
    }
    output += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return { text: output, truncated }
}

async function fetchPublicPage(inputUrl) {
  let url = await assertPublicUrl(inputUrl)
  let response
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEARCH_LIMITS.fetchTimeoutMs)
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' }
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw createResearchError('RESEARCH_FETCH_TIMEOUT', '来源正文抓取超时', 504)
      throw createResearchError('RESEARCH_FETCH_FAILED', '来源正文无法访问', 502)
    } finally {
      clearTimeout(timer)
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location || redirectCount === 3) throw createResearchError('RESEARCH_REDIRECT_BLOCKED', '来源重定向超过限制', 400)
    url = await assertPublicUrl(new URL(location, url).toString())
  }
  if (!response?.ok) throw createResearchError('RESEARCH_FETCH_FAILED', `来源返回 HTTP ${response?.status || 0}`, 502)
  const contentType = text(response.headers.get('content-type'), 160).toLowerCase()
  if (!/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType)) {
    throw createResearchError('RESEARCH_CONTENT_UNSUPPORTED', '来源不是可提取的文本页面', 415)
  }
  const limited = await readLimitedText(response)
  const isHtml = /html|xhtml/.test(contentType)
  const content = isHtml
    ? htmlToText(limited.text)
    : limited.text
      .replace(/[ \t\r\f]+/g, ' ')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, SEARCH_LIMITS.contentChars)
  if (!content) throw createResearchError('RESEARCH_CONTENT_EMPTY', '来源正文为空', 422)
  const titleMatch = isHtml ? limited.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null
  const evidenceBlocks = buildEvidenceBlocks(content)
  const clippedContent = evidenceBlocks.length
    ? evidenceBlocks.map((block) => block.text).join('\n').slice(0, SEARCH_LIMITS.evidenceChars)
    : content.slice(0, SEARCH_LIMITS.evidenceChars)
  return {
    url: url.toString(),
    title: text(titleMatch?.[1] || '', SEARCH_LIMITS.titleChars),
    content: clippedContent,
    contentType,
    evidenceBlocks,
    truncated: limited.truncated,
    ...classifySource(url.toString())
  }
}

async function searchBrave(query, count, apiKey) {
  const key = text(apiKey || process.env.BRAVE_SEARCH_API_KEY, 512)
  if (!key) throw createResearchError('SEARCH_KEY_REQUIRED', 'Brave Search 缺少 API Key', 400)
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('search_lang', 'zh-hans')
  url.searchParams.set('safesearch', 'moderate')
  const payload = await fetchJson(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': key
    }
  })
  return Array.isArray(payload?.web?.results) ? payload.web.results : []
}

async function searchTavily(query, count, apiKey) {
  const key = text(apiKey || process.env.TAVILY_API_KEY, 512)
  if (!key) throw createResearchError('SEARCH_KEY_REQUIRED', 'Tavily Search 缺少 API Key', 400)
  const payload = await fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'basic',
      max_results: count,
      include_answer: false,
      include_raw_content: false
    })
  })
  return Array.isArray(payload?.results) ? payload.results : []
}

function resolveSearxngUrl() {
  const configured = normalizeHttpUrl(process.env.SEARXNG_BASE_URL)
  if (!configured) {
    throw createResearchError('SEARCH_ENDPOINT_REQUIRED', '服务器未配置 SEARXNG_BASE_URL', 400)
  }
  const url = new URL(configured)
  if (!/\/search\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/search`
  }
  return url
}

async function searchSearxng(query, count) {
  const url = resolveSearxngUrl()
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('language', 'zh-CN')
  url.searchParams.set('safesearch', '1')
  const payload = await fetchJson(url, { headers: { Accept: 'application/json' } })
  return (Array.isArray(payload?.results) ? payload.results : []).slice(0, count)
}

async function searchOne(provider, query, count, apiKey) {
  if (provider === 'brave') return searchBrave(query, count, apiKey)
  if (provider === 'tavily') return searchTavily(query, count, apiKey)
  return searchSearxng(query, count)
}

function resolveAutomaticProvider() {
  if (text(process.env.BRAVE_SEARCH_API_KEY, 512)) return 'brave'
  if (text(process.env.TAVILY_API_KEY, 512)) return 'tavily'
  if (normalizeHttpUrl(process.env.SEARXNG_BASE_URL)) return 'searxng'
  throw createResearchError(
    'SEARCH_PROVIDER_NOT_CONFIGURED',
    '服务器未配置可用的网页检索渠道（BRAVE_SEARCH_API_KEY、TAVILY_API_KEY 或 SEARXNG_BASE_URL）',
    503
  )
}

function dedupeResults(results) {
  const seen = new Set()
  const output = []
  for (const result of results) {
    const canonical = result?.url?.replace(/\/$/, '').toLowerCase()
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    output.push({ ...result, id: `S${output.length + 1}` })
    if (output.length >= SEARCH_LIMITS.maxResultsTotal) break
  }
  return output
}

export function normalizeResearchRequest(input = {}) {
  const requestedProvider = text(input.provider, 40).toLowerCase()
  const provider = requestedProvider === 'auto' ? resolveAutomaticProvider() : requestedProvider
  if (!PROVIDERS.has(provider)) {
    throw createResearchError('SEARCH_PROVIDER_UNSUPPORTED', '搜索渠道仅支持 Brave、Tavily 或 SearXNG', 400)
  }
  const queries = [...new Set((Array.isArray(input.queries) ? input.queries : [])
    .map((query) => text(query, SEARCH_LIMITS.queryChars))
    .filter(Boolean))]
    .slice(0, SEARCH_LIMITS.maxQueries)
  if (!queries.length) throw createResearchError('SEARCH_QUERY_REQUIRED', '至少需要一个有效检索词', 400)
  return {
    provider,
    queries,
    apiKey: text(input.apiKey, 512),
    maxResults: Math.max(1, Math.min(SEARCH_LIMITS.maxResultsPerQuery, Number(input.maxResults) || 5))
  }
}

export async function runWebResearch(input = {}) {
  const request = normalizeResearchRequest(input)
  const settled = await Promise.allSettled(request.queries.map(async (query) => {
    const rawResults = await searchOne(request.provider, query, request.maxResults, request.apiKey)
    return {
      query,
      results: rawResults
        .map((item) => normalizeResult(item, request.provider))
        .filter(Boolean)
        .slice(0, request.maxResults)
    }
  }))

  const searches = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    return {
      query: request.queries[index],
      results: [],
      error: {
        code: result.reason?.code || 'SEARCH_UPSTREAM_FAILED',
        message: text(result.reason?.message || '搜索失败', 300)
      }
    }
  })
  const results = dedupeResults(searches.flatMap((item) => item.results))
  const failed = searches.filter((item) => item.error)
  if (!results.length && failed.length === searches.length) {
    const first = settled.find((item) => item.status === 'rejected')?.reason
    throw first || createResearchError('SEARCH_NO_RESULTS', '没有检索到可用资料', 502)
  }

  return {
    provider: request.provider,
    queries: searches,
    results,
    partial: failed.length > 0,
    warnings: failed.map((item) => `${item.query}：${item.error.message}`)
  }
}

export function normalizeResearchFetchRequest(input = {}) {
  const sources = (Array.isArray(input.sources) ? input.sources : [])
    .map((source) => ({
      id: text(source?.id, 20).toUpperCase(),
      title: text(source?.title, SEARCH_LIMITS.titleChars),
      url: normalizeHttpUrl(source?.url),
      snippet: text(source?.snippet, SEARCH_LIMITS.snippetChars),
      provider: text(source?.provider, 40)
    }))
    .filter((source, index, all) => {
      if (!/^S\d+$/.test(source.id) || !source.url || all.findIndex((item) => item.id === source.id) !== index) return false
      try {
        const url = new URL(source.url)
        return url.hostname !== 'localhost' && !url.hostname.endsWith('.local') &&
          (!net.isIP(url.hostname) || !isPrivateIp(url.hostname))
      } catch {
        return false
      }
    })
    .slice(0, SEARCH_LIMITS.maxFetchSources)
  if (!sources.length) throw createResearchError('RESEARCH_SOURCES_REQUIRED', '没有可抓取的来源', 400)
  return { sources }
}

export async function fetchWebResearchSources(input = {}) {
  const request = normalizeResearchFetchRequest(input)
  const settled = await Promise.allSettled(request.sources.map(async (source) => {
    const page = await fetchPublicPage(source.url)
    return {
      ...source,
      ...page,
      title: page.title || source.title,
      evidenceLevel: 'page'
    }
  }))
  const sources = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    return {
      ...request.sources[index],
      evidenceLevel: 'snippet',
      fetchError: {
        code: result.reason?.code || 'RESEARCH_FETCH_FAILED',
        message: text(result.reason?.message || '正文抓取失败', 260)
      }
    }
  })
  return {
    sources,
    warnings: sources
      .filter((source) => source.fetchError)
      .map((source) => `${source.id}：${source.fetchError.message}`)
  }
}

export { SEARCH_LIMITS, buildEvidenceBlocks }
