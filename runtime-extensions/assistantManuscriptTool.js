// Read the request's resource snapshot without another truncation layer.
// Offsets use UTF-16, as do the editor's existing source references.
const reply = payload => ({ ...(payload.ok ? {} : { isError: true }), content: [{ type: 'text', text: JSON.stringify(payload) }] })
const rangeParameters = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1 } }

function readSnapshotPage(snapshot, domain, input) {
  const offset = input?.offset ?? 0
  const limit = input?.limit ?? 4000
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) return reply({ ok: false, error: 'offset 须为非负整数，limit 须为正整数。' })
  const item = (snapshot.domains[domain] || []).find(row => row.id === input?.id)
  const result = { ok: Boolean(item), domain, action: 'get', items: [], revision: snapshot.revision || '', warnings: [] }
  if (!item) return reply({ ...result, error: '该条目不在本轮已提供的快照中。', warnings: ['entry-not-found'] })
  const text = String(item.text ?? item.summary ?? '')
  const includedLength = text.length
  const sourceLength = Math.max(includedLength, Number(item.sourceLength) || 0)
  const truncated = item.text == null || sourceLength > includedLength
  if (offset > includedLength) return reply({ ...result, ok: false, error: '该位置超出本轮已提供的原文范围。', sourceLength, includedLength, truncated })
  const end = Math.min(includedLength, offset + limit)
  result.items.push({ id: item.id, title: item.title || '', ...(item.type ? { type: item.type } : {}), ...(item.trust ? { trust: item.trust } : {}), ...(item.relations ? { relations: item.relations } : {}), text: text.slice(offset, end), sourceRefs: item.sourceRefs || [], offset, end, includedLength, sourceLength, nextOffset: end < includedLength ? end : null, truncated })
  if (truncated) result.warnings.push('source-truncated')
  return reply(result)
}

export function createAssistantManuscriptTool(snapshot) {
  if (!Array.isArray(snapshot?.domains?.manuscript)) return null
  return {
    name: 'manuscript_get', label: '读取章节',
    description: '按章节 id 读取本轮正文快照。offset 是字符位置，limit 是本次读取长度，默认从头读取4000字符；可按 nextOffset 接着读，也可直接指定所需范围。includedLength 是快照已有长度，sourceLength 是章节原长，truncated 表示快照缺少原文而非仅有下一页。保留章节来源与修订；快照未收录的内容不能凭空读取。已提供的原文无需重复调用。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, ...rangeParameters,
    }, required: ['id'] },
    execute: async (_id, input) => readSnapshotPage(snapshot, 'manuscript', input),
  }
}

export function createAssistantWorldbookTool(snapshot, original) {
  if (!original || !Array.isArray(snapshot?.domains?.world_lookup)) return null
  return {
    ...original,
    description: `${original.description} get 按 id 读取条目原文而非搜索摘要；offset/limit 可指定范围，默认4000字符，nextOffset 可继续读取。includedLength 是快照已有长度，sourceLength 是原长，truncated 表示快照缺少原文。search/related 仍返回查找摘要，需要详情时使用 get。`,
    parameters: { ...original.parameters, properties: { ...original.parameters.properties, ...rangeParameters } },
    execute: async (...args) => args[1]?.action === 'get' ? readSnapshotPage(snapshot, 'world_lookup', args[1]) : original.execute(...args),
  }
}
