export const ASSISTANT_EDIT_TOOL = 'submit_edit_proposals'
export const assistantEditSchema = {
  type: 'object', additionalProperties: false,
  properties: { changes: { type: 'array', minItems: 1, maxItems: 8, items: {
    type: 'object', additionalProperties: false,
    properties: { kind: { type: 'string', enum: ['chapter', 'worldbook', 'outline'] }, targetId: { type: 'string' },
      operation: { type: 'string', enum: ['replace', 'append', 'create'] }, field: { type: 'string', enum: ['content', 'name', 'title', 'intent'] },
      before: { type: 'string' }, after: { type: 'string' }, reason: { type: 'string' }, title: { type: 'string' }, entryType: { type: 'string', enum: ['character', 'location', 'organization', 'general', 'rule', 'style'] } },
    required: ['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason']
  } } }, required: ['changes']
}
export function validateAssistantChanges(input) {
  if (!input || !Array.isArray(input.changes) || !input.changes.length || input.changes.length > 8 || JSON.stringify(input).length > 24000) throw new Error('修改建议超出允许范围。')
  return input.changes.map(change => {
    if (!change || !['chapter', 'worldbook', 'outline'].includes(change.kind) || !['replace', 'append', 'create'].includes(change.operation)) throw new Error('修改建议格式无效。')
    const fields = { chapter: ['content', 'title'], worldbook: ['content', 'name'], outline: ['title', 'intent'] }
    if (!fields[change.kind].includes(change.field) || ['targetId', 'before', 'after', 'reason'].some(key => typeof change[key] !== 'string')) throw new Error('修改建议缺少目标或内容。')
    if (!change.after.trim() || change.targetId.length > 120 || !change.targetId.trim() || (change.operation === 'replace' && !change.before) || (change.operation !== 'replace' && change.before)) throw new Error('修改建议的目标或原文无效。')
    if (change.operation === 'append' && change.field !== 'content') throw new Error('只能向正文或条目内容追加文字。')
    if (change.operation === 'create' && (typeof change.title !== 'string' || !change.title.trim() || change.title.length > 120)) throw new Error('新建内容需要标题。')
    if (change.operation === 'create' && change.kind === 'worldbook' && !['character', 'location', 'organization', 'general', 'rule', 'style'].includes(change.entryType)) throw new Error('新条目类型无效。')
    return Object.fromEntries(['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason', 'title', 'entryType'].filter(key => change[key] !== undefined).map(key => [key, change[key]]))
  })
}
