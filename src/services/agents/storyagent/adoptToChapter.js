// Pure append preparation; the Authoring integration owns durable save and publication receipts.
import { appendExperienceTurnToChapter } from '../../writing/writingExperienceImport.js'

export function adoptStoryAgentTextToChapter({ books, bookId, chapterId, text, sourceId } = {}) {
  const content = String(text ?? '').trim()
  if (!content) return { ok: false, reason: 'empty-text', books }
  const turnId = `sabturn_${String(sourceId || Date.now().toString(36))}`
  const messageId = `sabmsg_${String(sourceId || Date.now().toString(36))}`
  return appendExperienceTurnToChapter({
    books,
    bookId: String(bookId || ''),
    chapterId: String(chapterId || ''),
    sessionId: `storyagent:${String(sourceId || 'adopt')}`,
    branchId: 'main',
    worldbookId: '',
    turn: { id: turnId, status: 'committed', assistantMessageIds: [messageId] },
    message: { id: messageId, role: 'assistant', content, sourceRevision: 1 },
    messages: [{ id: messageId, role: 'assistant', content }],
    activeTurnIds: [turnId]
  })
}
