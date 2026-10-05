import { createStoryAgentEngine } from './agentEngine.js'
import { getChapterMarkdown } from '../../writing/writingDocumentSchema.js'

export function createAuthoringStoryAgent({ projectId, getBook, getChapter, getWorldbook, getLiveText, getNotes, getOutline, persistCurrent, readBooks, saveBooks, publishBooks, protectCurrent, observeAdoption } = {}) {
  let bridge
  const loadBridge = async () => {
    if (!bridge) {
      const { createPiNarrativeAgentBridge } = await import('./piNarrativeAgentBridge.js')
      bridge = createPiNarrativeAgentBridge()
    }
    return bridge
  }
  const lazyBridge = Object.fromEntries(['run', 'resume', 'cancel', 'healthz', 'tasks'].map(name => [name, async (...args) => (await loadBridge())[name](...args)]))
  const context = (bookId) => {
    const book = getBook?.()
    if (String(book?.id || '') !== String(bookId || '')) throw new Error('作品已切换，请重新发送。')
    const chapter = getChapter?.()
    const linked = getWorldbook?.()
    const world = book.worldbookId && String(linked?.id || '') === String(book.worldbookId) ? linked : null
    const item = (entry, type) => ({ id: String(entry.id), title: entry.title || entry.name || '未命名', type, text: String(entry.text || entry.content || ''), summary: String(entry.content || entry.summary || entry.text || ''), aliases: Array.isArray(entry.keys) ? entry.keys : [], sourceRefs: [`${type}:${entry.id}`] })
    const manuscriptItems = (book.chapters || []).map(entry => item({ ...entry, text: String(entry.id) === String(chapter?.id) ? getLiveText?.() : getChapterMarkdown(entry) }, 'chapter'))
    return {
      bookTitle: book.title || '', chapterTitle: chapter?.title || '', manuscriptTail: String(getLiveText?.() || '').slice(-2400),
      chapterEntries: manuscriptItems,
      manuscriptItems,
      worldEntries: (world?.entries || []).map(entry => item(entry, 'worldbook')),
      notesItems: (getNotes?.() || []).map(entry => item(entry, 'notes')),
      outlineItems: (getOutline?.() || []).map(entry => item({ ...entry, text: entry.summary || entry.description || entry.title }, 'outline'))
    }
  }
  const engine = createStoryAgentEngine({ bridge: lazyBridge, projectId, resolveContext: context })
  return Object.freeze({
    ...engine,
    destination: () => ({ bookId: String(getBook?.()?.id || ''), chapterId: String(getChapter?.()?.id || '') }),
    async adopt(message) {
      const destination = this.destination()
      if (message?.projectId !== destination.bookId || message?.chapterId !== destination.chapterId || !destination.chapterId) return { ok: false, error: '请回到生成时的章节后采纳。' }
      if (message.status !== 'completed' || !message.text?.trim()) return { ok: false, error: '只有完整完成的回答可以采纳。' }
      if (!persistCurrent?.()) return { ok: false, error: '当前文稿未能保存，尚未采纳。' }
      const { adoptStoryAgentTextToChapter } = await import('./adoptToChapter.js')
      // Import may yield; recheck scope before reading or writing manuscript state.
      const now = this.destination()
      if (now.bookId !== destination.bookId || now.chapterId !== destination.chapterId) return { ok: false, error: '章节已切换，尚未采纳。' }
      if (!persistCurrent?.()) return { ok: false, error: '当前文稿未能保存，尚未采纳。' }
      const protection = protectCurrent?.(message.id)
      if (protection?.ok === false) return { ok: false, error: '采纳前的版本未能保存，尚未采纳。' }
      const result = adoptStoryAgentTextToChapter({ books: readBooks(), ...destination, text: message.text, sourceId: message.id })
      if (!result.ok) return { ...result, error: result.reason === 'already-imported' ? '这段文字已采纳。' : '当前章节无法接收这段文字。' }
      const receipt = saveBooks(result.books)
      if (!receipt?.ok) return { ok: false, error: '文稿保存失败，尚未采纳；回答仍在对话中。' }
      publishBooks(result.books, destination.chapterId)
      let warning = ''
      if (observeAdoption) {
        try { await observeAdoption({ text: message.text, unitId: result.unitId, bookId: destination.bookId, chapterId: destination.chapterId }) }
        catch { warning = '正文已保存，现场状态将在稍后刷新。' }
      }
      return { ok: true, unitId: result.unitId, ...(warning ? { warning } : {}) }
    }
  })
}
