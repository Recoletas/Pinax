function text(value) {
  return String(value ?? '').trim()
}

/**
 * 世界书条目的 Core 规范形状。只承诺 id/name/content 的语义;injection.group、category、tags
 * 等宿主富字段作为未知字段原样保留。`name` 缺失时回退 legacy `title`(只读兼容)。
 */
export function normalizeWorldbookEntry(raw, { worldbookId = '' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  const entry = {
    ...raw,
    id,
    name: text(raw.name ?? raw.title),
    content: typeof raw.content === 'string' ? raw.content : '',
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
  }
  if (worldbookId) entry.worldbookId = text(worldbookId)
  return entry
}

export function createWorldbookEntry({
  id,
  worldbookId = '',
  name,
  content = '',
  now = new Date().toISOString(),
  extra = {}
} = {}) {
  const normalizedId = text(id)
  if (!normalizedId) return null
  return {
    ...extra,
    id: normalizedId,
    worldbookId: text(worldbookId),
    name: text(name),
    content: typeof content === 'string' ? content : '',
    createdAt: now,
    updatedAt: now
  }
}

export function worldbookEntrySummary(entry) {
  return {
    id: entry.id,
    name: entry.name,
    worldbookId: entry.worldbookId ?? null,
    updatedAt: entry.updatedAt ?? null
  }
}
