import { loadSourceChunks } from '../../worldbook/worldbookSourceArchive.js'

// Read only chunk IDs attached to this frozen project's source documents. Rank
// locally before sending bounded excerpts to the model; never scan another book.
export async function retrieveAssistantSourceChunks(documents, question, { signal } = {}) {
  const needle = String(question || '').toLocaleLowerCase()
  const tokens = new Set(needle.match(/[a-z0-9_]{2,}/g) || [])
  for (const word of needle.match(/[\u3400-\u9fff]{2,}/g) || []) for (let i = 0; i < word.length - 1; i++) tokens.add(word.slice(i, i + 2))
  const owners = new Map()
  for (const document of documents || []) for (const id of document.chunkIds || []) if (!owners.has(String(id))) owners.set(String(id), document)
  const hits = []
  const ids = [...owners.keys()]
  for (let offset = 0; offset < ids.length; offset += 100) {
    if (signal?.aborted) throw signal.reason || new Error('已取消')
    const chunks = await loadSourceChunks(ids.slice(offset, offset + 100))
    for (const chunk of chunks) {
      const document = owners.get(String(chunk.id)); if (!document) continue
      const text = String(chunk.text || ''); const lowered = text.toLocaleLowerCase()
      const score = [...tokens].reduce((sum, token) => sum + (lowered.includes(token) ? 1 : 0), 0)
      if (!score && ids.length > 24) continue
      hits.push({ score, id: String(chunk.id), title: document.title || document.sourceLabel || '资料', type: 'source', text, summary: text,
        sourceRefs: [`source:${document.id}:${chunk.id}`], sourceDocumentId: String(document.id), contentHash: document.contentHash || '', sourceOffset: chunk.startOffset || 0 })
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)); hits.splice(24)
  }
  return hits
}
