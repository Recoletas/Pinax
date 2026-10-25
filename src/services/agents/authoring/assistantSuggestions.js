// Shared project facts for conversational initiative and an optional empty-input candidate.
export function assistantProjectState({ book, worldbook, manuscriptText = '' } = {}) {
  if (!book?.id) return null
  const bound = String(book.worldbookId || '')
  const loaded = Boolean(bound && String(worldbook?.id || '') === bound)
  const entries = loaded ? (worldbook.entries || []) : []
  return {
    bookId: String(book.id), settingsStatus: !bound ? 'unbound' : loaded ? 'ready' : 'unavailable',
    settingCount: loaded ? entries.filter(entry => entry.type !== 'source' && entry.status !== 'retired' && String(entry.content || '').trim()).length : !bound ? 0 : null,
    sourceCount: loaded ? (worldbook.sourceDocuments || []).length : null, sourceScope: 'imported-documents',
    writtenChapters: (book.chapters || []).filter(chapter => String(chapter.content || '').trim()).length,
    hasManuscript: Boolean(String(manuscriptText).trim() || (book.chapters || []).some(chapter => String(chapter.content || '').trim())),
    outlineCount: (book.outlineNodes || []).length
  }
}
export function assistantSuggestionInstruction() {
  return [
    '像熟悉这部作品的写作搭档一样回复：先处理作者正在说的事，结合已有正文、设定、资料和此前讨论判断还可以帮什么。',
    '当补充内容确实有助于当前创作时，可以自然提出一个具体建议，说明要整理什么或为何需要。例如已有正文却没有人物或地点设定，可以问要不要从正文整理；作者确定了具体设定，可以问要不要保存；文风参考、考据需要依据时再建议添加相关资料。',
    '讨论、备选方案不等于定稿；“设定开局”“设计入场方式”“试试这个方向”结合上下文理解，不据此默认写入世界书。人物、地点、组织只整理已确定的内容，或作者明确委托你补定的部分，不顺带固定其余细节。开篇写法、出场顺序、悬念安排属于情节规划；要求保存规划时用大纲，未要求保存则先在对话中展开。明确要求作为设定保存的创作规则仍可记录。',
    '空白作品也可以直接构思或试写，不把补设定、资料或大纲当成前置步骤。不要每次回复都附带建议，不重复作者已经拒绝的建议；作者接受后承接上文执行。',
    '资料库尚未读取不等于为空，未列出的来源不等于不存在。区分正文已有事实与新构思；额外整理先征求意愿，写入仍遵循当前权限。普通建议直接写在回复中，只有影响当前任务的关键取舍才使用提问工具等待回答。'
  ].join('\n')
}

export function assistantInputCandidate(state, last) {
  if (!state?.bookId || state.settingsStatus === 'unavailable') return ''
  if (last && (last.role !== 'assistant' || last.status !== 'completed' || last.questions?.length && !last.questionResponse)) return ''
  const tail = String(last?.text || '').slice(-400)
  if (!last?.proposal && (/(?:要不要|是否|需要|可以|想不想).{0,24}(?:保存|整理|记入|记录).{0,16}(?:设定|人物|世界书)/.test(tail) || /(?:would you like|shall|should|want me to).{0,40}(?:save|add|record).{0,40}(?:setting|character|story bible)/i.test(tail))) return '把已确定的设定整理保存。'
  if (state.hasManuscript && !state.settingCount) return '从正文整理人物和地点，保存为设定。'
  if (state.writtenChapters >= 3 && !state.outlineCount) return '按已写章节整理一份大纲。'
  if (!state.hasManuscript && !last) return '一起构思一个故事开头。'
  return ''
}
