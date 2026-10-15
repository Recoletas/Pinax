// A virtual directory over Pinax resources; it is never an operating-system path.
export const assistantProjectPath = id => `/works/${encodeURIComponent(String(id || ''))}`
export function buildAssistantOrientation(ctx, bookId) {
  const path = assistantProjectPath(bookId)
  const chapters = ctx.manuscriptItems || []
  const worlds = ctx.worldEntries || []
  const current = String(ctx.manuscriptText ?? ctx.manuscriptTail ?? '')
  const related = worlds.filter(entry => [entry.title, ...(entry.aliases || [])].some(name => String(name || '').length >= 2 && current.includes(name))).slice(0, 6)
  return [
    { kind: 'workspace', title: '当前作品目录', text: [
      `当前位置：${path}；作品：《${ctx.bookTitle || '未命名'}》；作品 ID：${bookId}`,
      `当前章节：${ctx.chapterTitle || '未选择'}；章节 ID：${ctx.currentChapterId || '无'}。讨论默认围绕这里，不要求作者重复报作品名。`,
      '目录只说明资源在哪里，不代表已读过全文。需要更多内容时主动使用 manuscript、world_lookup、outline 或 workspace 查阅。',
      '正文：', ...chapters.slice(0, 40).map(entry => `${path}/chapters/${encodeURIComponent(entry.id)} — ${entry.title}${entry.id === ctx.currentChapterId ? '（当前）' : ''}`),
      `设定：${worlds.slice(0, 60).map(entry => `${entry.title} [${entry.id}]`).join('；') || '尚无设定'}`,
      `资料：${(ctx.sourceEntries || []).slice(0, 20).map(entry => `${entry.title} [${entry.id}]`).join('；') || '尚无资料'}`,
      `大纲：${(ctx.outlineItems || []).slice(0, 20).map(entry => `${entry.title} [${entry.id}]`).join('；') || '尚无大纲'}`,
      `可查阅作品：${(ctx.workspaceProjects || []).slice(0, 40).map(book => `《${book.title}》 [${book.id}]`).join('；') || '当前作品'}`,
      '查阅其他作品不改变当前改稿目标或授权。未读到的内容不能当成事实。'
    ].join('\n').slice(0, 6500) },
    { kind: 'manuscript-context', title: '当前章节正文', text: current.length <= 8000 ? `当前章节全文：\n${current || '（空白章节，不虚构已有情节。）'}` : `当前章节节选（全文 ${current.length} 字；未展示中间部分，需要时查阅）：\n【开头】\n${current.slice(0, 2800)}\n【最近正文】\n${current.slice(-4600)}` },
    ...(related.length ? [{ kind: 'related-settings', title: '正文涉及的设定', text: related.map(entry => `${entry.title} [${entry.id}]：\n${String(entry.text || entry.summary || '').slice(0, 1100)}`).join('\n\n') }] : [])
  ]
}

export function buildAssistantWorkspaceItems(books, currentBookId, textOfChapter, worldOfBook) {
  const projects = books.slice(0, 40)
  const rows = projects.map(book => ({ id: `project:${book.id}`, bookId: String(book.id), type: 'project', title: book.title || '未命名作品', text: `${(book.chapters || []).length} 章`, sourceRefs: [assistantProjectPath(book.id)] }))
  const buckets = projects.map(book => {
    const path = assistantProjectPath(book.id)
    const chapters = (book.chapters || []).map(chapter => ({ id: `chapter:${book.id}:${chapter.id}`, resourceId: String(chapter.id), bookId: String(book.id), type: 'chapter', title: chapter.title || '未命名章节', text: String(book.id) === String(currentBookId) ? '' : String(textOfChapter(chapter)), sourceRefs: [`${path}/chapters/${encodeURIComponent(chapter.id)}`] }))
    const world = worldOfBook(book)
    return [...chapters, ...(world?.entries || []).slice(0, 12).map(entry => ({ id: `setting:${book.id}:${entry.id}`, resourceId: String(entry.id), bookId: String(book.id), type: 'worldbook', title: entry.name || '未命名设定', text: entry.content || '', sourceRefs: [`${path}/settings/${encodeURIComponent(entry.id)}`] }))]
  })
  // Round robin keeps a large first book from hiding all other projects.
  for (let cursor = 0; rows.length < 120 && buckets.some(bucket => cursor < bucket.length); cursor++) {
    for (const bucket of buckets) if (bucket[cursor] && rows.length < 120) rows.push(bucket[cursor])
  }
  return rows
}
