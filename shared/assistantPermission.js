// Product permission contract; model output can never grant access.
export const ASSISTANT_MODES = ['read', 'review', 'auto']
// UI preferences for the next request, never a replacement for an issued grant.
export function createAssistantPermissionPreference(input = {}) {
  const mode = ASSISTANT_MODES.includes(input.mode) ? input.mode : 'review'
  const writable = mode !== 'read'
  return { ...input, mode, scope: input.scope || 'current', chapterIds: [...(input.chapterIds || [])], worldbook: writable, outline: writable }
}
export function normalizeAssistantPermission(input, { bookId, sessionId, chapterId = '' } = {}) {
  if ([bookId, sessionId].some(value => typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f]/.test(value)) || !ASSISTANT_MODES.includes(input?.mode)) throw new Error('助手权限无效。')
  const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && id.trim() && id.length <= 120))].slice(0, 120)
  const scope = ['current', 'selected', 'book'].includes(input.scope) ? input.scope : 'current'
  const chapters = scope === 'current' ? (chapterId ? [String(chapterId)] : []) : ids(input.chapterIds)
  if (scope === 'selected' && !chapters.length) throw new Error('请先选择允许修改的章节。')
  return { mode: input.mode, scope, chapterIds: chapters, worldbook: Boolean(input.worldbook), outline: Boolean(input.outline), bookId: String(bookId), sessionId: String(sessionId) }
}
export function assistantChangeAllowed(policy, change) {
  if (!policy || policy.mode === 'read' || policy.revoked || (policy.expiresAt && policy.expiresAt <= Date.now())) return false
  if (change.kind === 'chapter') return policy.scope === 'book' || policy.chapterIds?.includes(change.targetId)
  return change.kind === 'worldbook' ? policy.worldbook === true : change.kind === 'outline' && policy.outline === true
}
export function assertAssistantPermission(policy, changes, bookId) {
  if (policy?.bookId !== String(bookId) || !changes.every(change => assistantChangeAllowed(policy, change))) throw new Error('修改超出当前授权范围，请调整助手权限。')
}
