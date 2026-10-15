export function createAssistantWorkspaceTool(req, snapshot) {
  const records = Array.isArray(snapshot?.domains?.workspace) ? snapshot.domains.workspace : []
  if (!records.length) return null
  let readingBookId = String(req.bookId || '')
  const projects = records.filter(item => item.type === 'project')
  const reply = payload => ({ ...(payload.ok === false ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify(payload) }] })
  return {
    name: 'workspace', label: '查阅作品目录',
    description: '浏览器内作品的虚拟目录。list_projects 列作品，open_project 按 bookId 进入查阅目录，list 列章节／设定，read 按 id 或 path 读取，search 搜索已提供内容。可以主动查阅其他作品；不会切换界面、扩大改稿授权或访问磁盘。覆盖不足会明确返回，不把节选当全文。',
    parameters: { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['list_projects', 'open_project', 'list', 'read', 'search'] }, bookId: { type: 'string' }, id: { type: 'string' }, path: { type: 'string' }, query: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 4000 } }, required: ['action'] },
    execute: async (_id, input) => {
      if (!['list_projects', 'open_project', 'list', 'read', 'search'].includes(input?.action)) return reply({ ok: false, error: '未知目录操作。' })
      if (input.action === 'list_projects') return reply({ ok: true, currentBookId: req.bookId, items: projects.map(book => ({ bookId: book.bookId, title: book.title, path: book.sourceRefs?.[0] })), coverage: snapshot.coverage?.workspace })
      const bookId = String(input.bookId || readingBookId)
      if (!projects.some(book => book.bookId === bookId)) return reply({ ok: false, error: '该作品不在本次作者资源快照中，请作者选择作品后重新发送。' })
      if (input.action === 'open_project') readingBookId = bookId
      const files = records.filter(item => item.bookId === bookId && item.type !== 'project')
      if (['open_project', 'list'].includes(input.action)) return reply({ ok: true, readingBookId: bookId, editingBookId: req.bookId, readOnly: true, items: files.map(item => ({ id: item.id, path: item.sourceRefs?.[0], title: item.title, type: item.type, sourceLength: item.sourceLength })), coverage: snapshot.coverage?.workspace })
      const contentOf = item => bookId === String(req.bookId) ? snapshot.domains?.[item.type === 'chapter' ? 'manuscript' : 'world_lookup']?.find(row => row.id === item.resourceId) || item : item
      if (input.action === 'search') {
        const q = String(input.query || '').trim().toLocaleLowerCase()
        return reply({ ok: true, bookId, items: files.filter(item => q && `${item.title}\n${contentOf(item).text}`.toLocaleLowerCase().includes(q)).slice(0, 12).map(item => ({ id: item.id, title: item.title, path: item.sourceRefs?.[0], excerpt: String(contentOf(item).text || '').slice(0, 600) })), coverage: snapshot.coverage?.workspace })
      }
      const item = files.find(item => (input.id && item.id === input.id) || (input.path && item.sourceRefs?.includes(input.path)))
      if (!item) return reply({ ok: false, error: '文件不在已提供的快照中；不能读取任意路径。', coverage: snapshot.coverage?.workspace })
      const currentDomain = item.type === 'chapter' ? 'manuscript' : 'world_lookup'
      const native = bookId === String(req.bookId) ? snapshot.domains?.[currentDomain]?.find(row => row.id === item.resourceId) : null
      const source = native || item
      const text = String(source.text || '')
      const offset = Math.max(0, Math.trunc(Number(input.offset) || 0))
      const limit = Math.min(4000, Math.max(1, Math.trunc(Number(input.limit) || 2400)))
      return reply({ ok: true, bookId, id: item.id, path: item.sourceRefs?.[0], title: item.title, readOnly: true, offset, end: Math.min(text.length, offset + limit), text: text.slice(offset, offset + limit), includedLength: text.length, sourceLength: source.sourceLength ?? text.length, truncated: Number(source.sourceLength || text.length) > text.length, nextOffset: offset + limit < text.length ? offset + limit : null })
    }
  }
}
