export function formatWorldbookStatus(message = '') {
  const normalized = String(message || '').trim()
  if (!normalized) return '世界书'
  if (normalized.startsWith('世界书 ·')) return normalized
  return `世界书 · ${normalized}`
}
