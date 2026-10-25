import { loadSourceChunks } from '../../worldbook/worldbookSourceArchive.js'
import { sourceChunkLocator } from '../../workspace/sourceChunkLocator.js'

// Read only chunk IDs attached to this frozen project's source documents. Rank
// locally before sending bounded excerpts to the model; never scan another book.
export async function retrieveAssistantSourceChunks(documents, question, { signal, pinnedDocumentIds = [] } = {}) {
  const needle = String(question || '').toLocaleLowerCase()
  const tokens = new Set(needle.match(/[a-z0-9_]{2,}/g) || [])
  for (const word of needle.match(/[\u3400-\u9fff]{2,}/g) || []) for (let i = 0; i < word.length - 1; i++) tokens.add(word.slice(i, i + 2))
  const owners = new Map()
  for (const document of documents || []) for (const id of document.chunkIds || []) {
    const list = owners.get(String(id)) || []
    if (!list.some(owner => String(owner.id) === String(document.id))) list.push(document)
    owners.set(String(id), list)
  }
  const hits = []
  const ids = [...owners.keys()]
  for (let offset = 0; offset < ids.length; offset += 100) {
    if (signal?.aborted) throw signal.reason || new Error('已取消')
    const chunks = await loadSourceChunks(ids.slice(offset, offset + 100))
    if (signal?.aborted) throw signal.reason || new Error('已取消')
    for (const chunk of chunks) {
      const documents = owners.get(String(chunk.id)); if (!documents) continue
      const text = String(chunk.text || ''); const lowered = text.toLocaleLowerCase()
      const score = [...tokens].reduce((sum, token) => sum + (lowered.includes(token) ? 1 : 0), 0)
      for (const document of documents) {
        const pinned = pinnedDocumentIds.includes(String(document.id))
        if (!score && !pinned && ids.length > 24) continue
        const locator = sourceChunkLocator(chunk, document.archiveRef || document.id)
        const id = `source:${document.id}:${chunk.id}`
        hits.push({ score, pinned, id, chunkId: String(chunk.id), title: document.title || document.sourceLabel || '资料', type: 'source', text, summary: text,
          sourceRefs: [id], sourceDocumentId: String(document.id), contentHash: document.contentHash || '', sourceOffset: locator?.start ?? null, sourceLocator: locator })
      }
    }
    hits.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score || a.id.localeCompare(b.id)); hits.splice(24)
  }
  return hits
}
