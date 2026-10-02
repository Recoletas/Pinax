// ④ 采纳链：StoryAgent 产出 → 编辑器事务内的章节追加。
// 复用体验导入的既有追加原语（appendExperienceTurnToChapter：克隆/文档迁移/指纹去重
// 一个不少），用合成 turn/message 过 eligibility——不绕过任何纪律，只换数据来源。
// 调用方（Authoring 页监听 sab:adopt-manuscript）负责 books 回写、saveBooks、编辑器重载。
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
