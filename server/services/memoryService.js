import MemoryClient from 'mem0ai'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = join(__dirname, '../../data')
const DEFAULT_MEM0_HOST = 'https://api.mem0.ai'

const clientCache = new Map()

function loadMem0Secrets() {
  const secretsPath = join(DATA_DIR, 'secrets.json')
  try {
    if (existsSync(secretsPath)) {
      const secrets = JSON.parse(readFileSync(secretsPath, 'utf-8'))
      return {
        apiKey: secrets.mem0_api_key || '',
        host: secrets.mem0_host || ''
      }
    }
  } catch (e) {
    console.error('[memory] Failed to load mem0 secrets:', e)
  }
  return { apiKey: '', host: '' }
}

function resolveMem0Config(overrides = {}) {
  const secrets = loadMem0Secrets()
  const apiKey = overrides.apiKey || process.env.MEM0_API_KEY || secrets.apiKey || ''
  const host = overrides.host || process.env.MEM0_HOST || secrets.host || DEFAULT_MEM0_HOST
  return { apiKey, host }
}

function getClient(apiKey, host) {
  if (!apiKey) return null

  const cacheKey = `${apiKey}::${host || DEFAULT_MEM0_HOST}`
  if (!clientCache.has(cacheKey)) {
    clientCache.set(
      cacheKey,
      new MemoryClient({
        apiKey,
        ...(host ? { host } : {})
      })
    )
  }

  return clientCache.get(cacheKey)
}

function extractMemoryText(item) {
  if (!item || typeof item !== 'object') return ''
  if (typeof item.memory === 'string') return item.memory
  if (typeof item?.data?.memory === 'string') return item.data.memory
  if (typeof item.text === 'string') return item.text

  const firstMessage = Array.isArray(item.messages) ? item.messages[0] : null
  if (typeof firstMessage?.content === 'string') return firstMessage.content

  return ''
}

class MemoryService {
  async add({ userId, text, metadata = {}, apiKey, host } = {}) {
    const trimmedText = String(text || '').trim()
    if (!userId || !trimmedText) return null

    const { apiKey: resolvedApiKey, host: resolvedHost } = resolveMem0Config({ apiKey, host })
    const client = getClient(resolvedApiKey, resolvedHost)
    if (!client) return null

    try {
      return await client.add(
        [{ role: 'user', content: trimmedText }],
        { userId, metadata }
      )
    } catch (e) {
      console.error('[memory] add failed:', e?.message || e)
      return null
    }
  }

  async search({ userId, query, topK = 5, apiKey, host } = {}) {
    const trimmedQuery = String(query || '').trim()
    if (!userId || !trimmedQuery) return []

    const { apiKey: resolvedApiKey, host: resolvedHost } = resolveMem0Config({ apiKey, host })
    const client = getClient(resolvedApiKey, resolvedHost)
    if (!client) return []

    try {
      const response = await client.search(trimmedQuery, {
        topK,
        filters: { user_id: userId }
      })
      return Array.isArray(response?.results) ? response.results : []
    } catch (e) {
      console.error('[memory] search failed:', e?.message || e)
      return []
    }
  }

  formatResults(memories = [], limit = 5) {
    if (!Array.isArray(memories) || memories.length === 0) return ''

    const lines = memories
      .slice(0, limit)
      .map(extractMemoryText)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => `${index + 1}. ${item}`)

    return lines.join('\n')
  }
}

export const memoryService = new MemoryService()
