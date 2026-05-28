import api, { getOrCreatePreferenceUserId } from './api'
import useMem0 from '../composables/useMem0'
import { getItem, STORAGE_KEYS } from '../composables/useStorage'

const DEFAULT_MEM0_API_URL = 'https://api.mem0.ai/v1'

function normalizeMem0ApiUrl(host) {
  const raw = String(host || '').trim()
  if (!raw) return DEFAULT_MEM0_API_URL
  if (/\/v1\/?$/.test(raw)) return raw.replace(/\/?$/, '')
  return `${raw.replace(/\/$/, '')}/v1`
}

async function readMem0Secrets() {
  const cached = getCachedMem0Settings()

  try {
    const response = await api.post('/chat/secrets/read')
    const secrets = response?.data || {}
    const apiKey = String(secrets.mem0_api_key || cached.apiKey || '').trim()
    const host = String(secrets.mem0_host || cached.host || '').trim()

    if (!apiKey) return null

    return {
      apiKey,
      apiUrl: normalizeMem0ApiUrl(host)
    }
  } catch (error) {
    console.warn('[memorySync] failed to load mem0 secrets:', error)
    if (!cached.apiKey) return null
    return {
      apiKey: cached.apiKey,
      apiUrl: normalizeMem0ApiUrl(cached.host)
    }
  }
}

function getCachedMem0Settings() {
  const cached = getItem(STORAGE_KEYS.MEM0_SETTINGS) || {}
  return {
    apiKey: String(cached.apiKey || '').trim(),
    host: String(cached.host || '').trim()
  }
}

function getMem0Importance(scope) {
  if (scope === 'global-author') return 9
  if (scope === 'project') return 8
  return 6
}

export async function syncConfirmedMemoryCandidateToMem0(candidate) {
  if (!candidate || candidate.status !== 'active' || !String(candidate.content || '').trim()) {
    return { success: false, skipped: true, reason: 'invalid-candidate', syncStatus: 'failed' }
  }

  const secrets = await readMem0Secrets()
  if (!secrets) {
    return { success: false, skipped: true, reason: 'mem0-not-configured', syncStatus: 'local-only' }
  }

  const client = useMem0({
    apiUrl: secrets.apiUrl,
    userId: getOrCreatePreferenceUserId(),
    apiKey: secrets.apiKey
  })

  const remoteDuplicate = await findRemoteDuplicateMemory(client, candidate)
  if (remoteDuplicate) {
    return {
      success: true,
      synced: true,
      deduped: true,
      syncStatus: 'synced',
      remoteId: extractRemoteId(remoteDuplicate),
      syncedAt: Date.now(),
      candidate,
      data: remoteDuplicate
    }
  }

  const result = await client.storeMemory({
    content: candidate.content,
    type: candidate.kind,
    entityId: candidate.id,
    scope: candidate.scope,
    scopeId: candidate.scopeId,
    importance: getMem0Importance(candidate.scope),
    metadata: {
      kind: candidate.kind,
      scope: candidate.scope,
      scopeId: candidate.scopeId,
      sourceRef: candidate.sourceRef,
      candidateId: candidate.id,
      status: candidate.status,
      ...candidate.metadata
    }
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'mem0 sync failed',
      syncStatus: 'failed',
      candidate
    }
  }

  const remoteId = extractRemoteId(result.data)

  return {
    success: true,
    synced: true,
    syncStatus: 'synced',
    remoteId,
    syncedAt: Date.now(),
    candidate,
    data: result.data
  }
}

export async function buildMem0MemoryContext({
  currentSituation = '',
  authorId = '',
  projectId = '',
  sessionId = '',
  limitPerScope = 4,
  maxItemChars = 180
} = {}) {
  const secrets = await readMem0Secrets()
  if (!secrets) {
    return ''
  }

  const client = useMem0({
    apiUrl: secrets.apiUrl,
    userId: getOrCreatePreferenceUserId(),
    apiKey: secrets.apiKey
  })

  const globalAuthorId = authorId || getOrCreatePreferenceUserId()

  const scopes = [
    { scope: 'session', scopeId: sessionId, label: '远端当前会话记忆' },
    { scope: 'project', scopeId: projectId, label: '远端当前作品记忆' },
    { scope: 'global-author', scopeId: globalAuthorId, label: '远端全局作者记忆' }
  ]

  const sections = []

  for (const item of scopes) {
    if (!item.scopeId) continue

    try {
      const context = await client.buildMemoryContext(currentSituation, {
        scope: item.scope,
        scopeId: item.scopeId,
        limit: Math.max(1, Math.floor(Number(limitPerScope) || 4)),
        maxItemChars
      })

      if (context) {
        sections.push(`【${item.label}】\n${context}`)
      }
    } catch (error) {
      console.warn('[memorySync] failed to build mem0 memory context:', error)
    }
  }

  return sections.join('\n\n')
}

export function describeMem0SyncResult(result) {
  if (!result) return ''
  if (result.success && result.deduped) return '已匹配远端记忆'
  if (result.success) return '已同步到 mem0'
  if (result.skipped && result.reason === 'mem0-not-configured') return '本地保留，未配置 mem0'
  if (result.skipped) return '无需同步'
  return 'mem0 同步失败'
}

async function findRemoteDuplicateMemory(client, candidate) {
  if (!client || typeof client.searchMemories !== 'function') return null

  try {
    const results = await client.searchMemories(candidate.content, {
      limit: 5,
      type: candidate.kind,
      scope: candidate.scope,
      scopeId: candidate.scopeId
    })

    const normalizedContent = normalizeMemoryContent(candidate.content)
    if (!normalizedContent) return null

    return (Array.isArray(results) ? results : [])
      .find((item) => normalizeMemoryContent(extractRemoteContent(item)) === normalizedContent) || null
  } catch (error) {
    console.warn('[memorySync] failed to check remote duplicate:', error)
    return null
  }
}

function extractRemoteContent(item) {
  if (!item || typeof item !== 'object') return ''
  return String(item.memory || item.content || item.text || item.message || item.value || '').trim()
}

function normalizeMemoryContent(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》]/g, '')
}

function extractRemoteId(data) {
  if (!data || typeof data !== 'object') return ''
  return String(data.id || data.memory_id || data.memoryId || '').trim()
}
