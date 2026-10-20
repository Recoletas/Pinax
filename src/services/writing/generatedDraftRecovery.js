// A text-only recovery copy; never writes manuscript content or reuses an old grant.
const PREFIX = 'pinax-generated-draft:v1:'
function key(target) {
  const book = target?.projectId
  const document = target?.documentId || target?.chapterId
  return book && document ? PREFIX + JSON.stringify([String(book), String(document)]) : ''
}
export function saveGeneratedDraft(target, text) {
  const id = key(target)
  if (!id || !String(text || '').trim()) return false
  localStorage.setItem(id, JSON.stringify({ text, target: { projectId: target.projectId, documentId: target.documentId || target.chapterId, chapterId: target.chapterId, documentRole: target.documentRole || target.role }, updatedAt: Date.now() }))
  return true
}
export function readGeneratedDraft(target) {
  try { const value = JSON.parse(localStorage.getItem(key(target))); return typeof value?.text === 'string' ? value : null } catch { return null }
}
export function clearGeneratedDraft(target) {
  const id = key(target)
  if (id) localStorage.removeItem(id)
}
