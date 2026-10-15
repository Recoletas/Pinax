import { getChapterDocument, createWritingDocument, getChapterMarkdown, getNodePlainText } from '../writing/writingDocumentSchema.js'
import { writingWorldbookEntryTerms, findWritingWorldbookEntriesByTerm } from '../writing/writingWorldbookMentions.js'

// Literal mentions are navigation evidence, not confirmed entity references.
export function settingUsage(book, worldbook, entry, limit = 200) {
  if (!book || !entry || String(book.worldbookId || '') !== String(worldbook?.id || '')) return { hits: [], truncated: false }
  const terms = writingWorldbookEntryTerms(entry)
  const ambiguous = new Map(terms.map(term => [term, findWritingWorldbookEntriesByTerm(term, worldbook).length > 1]))
  const hits = []
  let order = 0
  const result = truncated => ({ hits: hits.sort((a, b) => a.order - b.order || a.start - b.start), truncated })
  for (const chapter of book.chapters || []) {
    const document = getChapterDocument(chapter) || createWritingDocument(getChapterMarkdown(chapter))
    for (const unit of document.content || []) for (const node of unit.content || []) {
      const text = getNodePlainText(node), nodeId = node.attrs?.nodeId, nodeOrder = order++
      if (!nodeId || !text) continue
      const occupied = []
      for (const term of terms) {
        let cursor = 0
        while (cursor < text.length) {
          const start = text.indexOf(term, cursor)
          if (start < 0) break
          const end = start + term.length; cursor = end
          if (occupied.some(range => start < range.end && end > range.start)) continue
          occupied.push({ start, end })
          if (hits.length >= limit) return result(true)
          hits.push({ order: nodeOrder, chapterId: String(chapter.id), chapterTitle: chapter.title || '未命名章节', nodeId, start, end, term,
            before: text.slice(Math.max(0, start - 32), start), after: text.slice(end, end + 64), ambiguous: ambiguous.get(term) })
        }
      }
    }
  }
  return result(false)
}
