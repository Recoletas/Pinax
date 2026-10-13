import process from 'node:process'
// Read-only kit access through the local Express boundary; no caller-supplied URL/path.
export function createAssistantKnowledgeTool(req, { fetchImpl = fetch, env = process.env } = {}) {
  const port = Number(env.PINAX_KNOWLEDGE_PROXY_PORT || 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return {
    name: 'knowledge', label: '检索知识库',
    description: '按需检索当前作品的世界书索引，或检索写作方法知识卡并读取原文。方法知识分为通用与本书来源，不能把通用案例当本书事实。本机知识内核未安装时明确失败；读取命中原文请把 readRef 作为 ref；contentAvailable=false 只有索引摘要，不可当原文引用。此工具只读、不扩大编辑权限。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', enum: ['worldbook_search', 'kb_search', 'kb_read'] }, q: { type: 'string' }, ref: { type: 'string' }, k: { type: 'integer', minimum: 1, maximum: 10 }
    }, required: ['action'] },
    execute: async (_id, input) => {
      const reply = payload => ({ ...(payload.ok === false ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify(payload) }] })
      const paths = { worldbook_search: 'worldbook-search', kb_search: 'kb-search', kb_read: 'kb-read' }
      if (!paths[input?.action]) return reply({ ok: false, error: '未知检索操作' })
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/api/knowledge/${paths[input.action]}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(65000),
          body: JSON.stringify({ bookId: String(req.bookId || ''), q: String(input.q || '').slice(0, 2000), ref: String(input.ref || '').slice(0, 1000), k: Math.min(Math.max(Number(input.k) || 5, 1), 10), maxChars: 6000 })
        })
        const result = await response.json()
        if (!response.ok || result.error) return reply({ ok: false, error: result.error?.message || '知识服务未连接', code: result.error?.code })
        return reply({ ok: true, readOnly: true, bookId: req.bookId, result })
      } catch { return reply({ ok: false, error: '知识检索服务未连接或请求超时；请使用当前正文和设定，不能声称已经查到知识库。' }) }
    }
  }
}
