export const ASSISTANT_EDIT_TOOL = 'submit_edit_proposals'
export const assistantEditSchema = {
  type: 'object', additionalProperties: false,
  properties: { changes: { type: 'array', minItems: 1, maxItems: 8, items: {
    type: 'object', additionalProperties: false,
    properties: { kind: { type: 'string', enum: ['chapter', 'worldbook', 'outline'] }, targetId: { type: 'string' },
      operation: { type: 'string', enum: ['replace', 'append', 'create', 'delete', 'insert'] }, field: { type: 'string', enum: ['content', 'name', 'title', 'intent'] },
      before: { type: 'string', description: 'append/create 必须为空字符串；replace/delete/insert 填准确原文片段。' }, after: { type: 'string', description: '只填新增或替换的文字；delete 时为空字符串。' }, reason: { type: 'string' }, groupId: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' }, maxItems: 8 }, title: { type: 'string' }, entryType: { type: 'string', enum: ['character', 'location', 'organization', 'general', 'rule', 'style'] } },
    required: ['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason']
  } } }, required: ['changes']
}
export function validateAssistantChanges(input) {
  if (!input || !Array.isArray(input.changes) || !input.changes.length || input.changes.length > 8 || JSON.stringify(input).length > 24000) throw new Error('修改建议超出允许范围。')
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
    if (change.dependsOn !== undefined && (!Array.isArray(change.dependsOn) || change.dependsOn.length > 8 || change.dependsOn.some(id => typeof id !== 'string'))) throw new Error('修改依赖无效。')
    return Object.fromEntries(['kind', 'targetId', 'operation', 'field', 'before', 'after', 'reason', 'title', 'entryType', 'groupId', 'dependsOn'].filter(key => change[key] !== undefined).map(key => [key, change[key]]))
  })
}
