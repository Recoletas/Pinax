import { entryDetailsSchema, normalizeEntryDetails } from './assistantEntryDetails.js'
export const ASSISTANT_EDIT_TOOL = 'submit_edit_proposals'

// Model IDs identify existing resources; new resources must not reuse their identity.
// Reserve IDs across the entire batch as well as the current owner snapshot.
function freshAssistantId() {
  if (globalThis.crypto?.randomUUID) return `assistant-${globalThis.crypto.randomUUID()}`
  const parts = globalThis.crypto.getRandomValues(new Uint32Array(4))
  return `assistant-${Array.from(parts, part => part.toString(36)).join('-')}`
}

export function reserveAssistantCreateIds(changes, existing = {}) {
  const reserved = new Map(Object.entries(existing).map(([kind, items]) => [kind, new Set(items.map(item => String(item.id)))]))
  for (const change of changes) if (change.operation !== 'create') {
    if (!reserved.has(change.kind)) reserved.set(change.kind, new Set())
    reserved.get(change.kind).add(change.targetId)
  }
  const mapped = changes.map(change => {
    if (change.operation !== 'create') return change
    if (!reserved.has(change.kind)) reserved.set(change.kind, new Set())
    const ids = reserved.get(change.kind)
    let targetId = change.targetId
    while (ids.has(targetId)) targetId = freshAssistantId()
    ids.add(targetId)
    return { ...change, targetId }
  })
  const renamed = new Map()
  changes.forEach((change, index) => {
    if (change.kind === 'worldbook' && change.operation === 'create' && change.targetId !== mapped[index].targetId && changes.filter(item => item.kind === 'worldbook' && item.operation === 'create' && item.targetId === change.targetId).length === 1) renamed.set(change.targetId, mapped[index].targetId)
  })
  return mapped.map(change => change.details?.relations ? { ...change, details: { ...change.details, relations: change.details.relations.map(row => ({ ...row, to: renamed.get(row.to) || row.to })) } } : change)
}
export const assistantEditSchema = {
  type: 'object', additionalProperties: false,
  properties: { final: { type: 'boolean', description: '兼容旧客户端；提交候选不会结束任务，可继续查阅、修改或提问。' }, changes: { type: 'array', minItems: 1, items: {
    type: 'object', additionalProperties: false,
    properties: { details: entryDetailsSchema, kind: { type: 'string', enum: ['chapter', 'worldbook', 'outline'] }, targetId: { type: 'string' },
      operation: { type: 'string', enum: ['replace', 'append', 'create', 'delete', 'insert'] }, field: { type: 'string', enum: ['content', 'name', 'title', 'intent'] },
      before: { type: 'string', description: 'append/create 必须为空字符串；replace/delete/insert 填准确原文片段。' }, after: { type: 'string', description: '只填新增或替换的文字；delete 时为空字符串。' }, reason: { type: 'string' }, groupId: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, entryType: { type: 'string', enum: ['character', 'location', 'organization', 'general', 'rule', 'style'] } },
    required: ['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason']
  } } }, required: ['changes']
}
export function validateAssistantChanges(input) {
  if (!input || !Array.isArray(input.changes) || !input.changes.length) throw new Error('修改建议超出允许范围。')
  return input.changes.map(change => {
    if (!change || !['chapter', 'worldbook', 'outline'].includes(change.kind) || !['replace', 'append', 'create', 'delete', 'insert'].includes(change.operation)) throw new Error('修改建议格式无效。')
    const fields = { chapter: ['content', 'title'], worldbook: ['content', 'name'], outline: ['title', 'intent'] }
    if (!fields[change.kind].includes(change.field) || ['targetId', 'before', 'after', 'reason'].some(key => typeof change[key] !== 'string')) throw new Error('修改建议缺少目标或内容。')
    if ((change.operation !== 'delete' && !change.after.trim()) || (change.operation === 'delete' && change.after !== '') || change.targetId.length > 120 || !change.targetId.trim() || (['replace', 'delete', 'insert'].includes(change.operation) && !change.before) || (!['replace', 'delete', 'insert'].includes(change.operation) && change.before)) throw new Error('修改建议的目标或原文无效。')
    if (['append', 'insert'].includes(change.operation) && change.field !== 'content') throw new Error('只能向正文或条目内容追加文字。')
    if (change.operation === 'create' && change.field !== (change.kind === 'outline' ? 'intent' : 'content')) throw new Error('新建内容必须写入正文或大纲内容字段。')
    if (change.operation === 'create' && (typeof change.title !== 'string' || !change.title.trim() || change.title.length > 120)) throw new Error('新建内容需要标题。')
    if (change.operation === 'create' && change.kind === 'worldbook' && !['character', 'location', 'organization', 'general', 'rule', 'style'].includes(change.entryType)) throw new Error('新条目类型无效。')
    if (change.groupId !== undefined && (typeof change.groupId !== 'string' || change.groupId.length > 120)) throw new Error('修改分组无效。')
    if (change.dependsOn !== undefined && (!Array.isArray(change.dependsOn) || change.dependsOn.some(id => typeof id !== 'string'))) throw new Error('修改依赖无效。')
    if (change.details !== undefined) {
      if (change.kind !== 'worldbook' || change.field !== 'content' || change.operation === 'delete') throw new Error('结构属性只能随设定内容修改提交。')
      normalizeEntryDetails(change.details)
    }
    return Object.fromEntries(['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason', 'title', 'entryType', 'groupId', 'dependsOn', 'details'].filter(key => change[key] !== undefined).map(key => [key, change[key]]))
  })
}
