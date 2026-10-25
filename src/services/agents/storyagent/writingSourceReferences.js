export function writingSourceReferences(prepared = {}) {
  const retrieved = prepared.writingReferences || []
  const expandedDocuments = new Set(retrieved.map(ref => String(ref.sourceDocumentId || '')).filter(Boolean))
  const refs = [
    ...(prepared.pinnedRefs || []).filter(ref => !(ref.type === 'source' && expandedDocuments.has(String(ref.sourceDocumentId || ref.id)))),
    ...retrieved
  ]
  const seen = new Set()
  return refs.flatMap(ref => {
    const text = String(ref.text || ref.excerpt || ref.summary || '').trim()
    if (!text) return []
    const key = JSON.stringify([ref.id || ref.sourceRef || ref.title, ref.chunkId || '', text])
    if (seen.has(key)) return []
    seen.add(key)
    const kind = ref.type === 'source' ? '参考资料原文片段' : ref.type === 'chapter' ? '本书正文' : '作者选定内容'
    const identity = { sourceRefs: ref.sourceRefs || [], documentId: ref.sourceDocumentId || ref.id || '',
      ...(ref.chunkId ? { chunkId: ref.chunkId } : {}), ...(ref.contentHash ? { contentHash: ref.contentHash } : {}),
      ...(ref.sourceLocator ? { locator: ref.sourceLocator } : {}) }
    return [`【${ref.title || ref.label || ref.id || '参考资料'}｜${kind}】\n出处：${JSON.stringify(identity)}\n${text}`]
  }).join('\n\n')
}
