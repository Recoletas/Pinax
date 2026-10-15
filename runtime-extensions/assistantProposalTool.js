import { ASSISTANT_EDIT_TOOL, assistantEditSchema, validateAssistantChanges } from './assistantEditProposal.js'
import { assertAssistantPermission } from './assistantPermission.js'
export function createAssistantProposalTool(snapshot, policy) {
  return { name: ASSISTANT_EDIT_TOOL, label: '提出作品修改',
    description: '用户要求写作或修改时，先查相关内容，再通过本工具提出待作者确认的修改。只提出建议，不写入作品。kind=chapter 为正文，worldbook 为角色/设定，outline 为大纲。targetId 使用当前修改目标的章节ID或已读取条目的ID，不能用标题、虚拟路径或workspace文件ID；create 时指定新 ID，并提供 title 标题。replace 的 before 必须是完整且唯一的原文片段；after 只放替换内容。讨论和检索回答无需调用。insert 用 before 中唯一的原文片段作为插入锚点，在其紧后插入 after；append 只在章节或条目末尾追加，before 必须是空字符串，after 只放新增文字；不要把现有段落复制进 before。关联修改用相同 groupId 标记，不能拆开的操作一起交付。一次提交所有关联修改。',
    parameters: assistantEditSchema,
    execute: async (_id, input) => {
      try {
        if (!input || JSON.stringify(input).length > 24000) throw new Error('修改建议超出允许范围。')
        const normalizations = []
        const normalized = { ...input, changes: Array.isArray(input.changes) ? input.changes.map((change, index) => {
          if (change?.operation !== 'append' || change.field !== 'content' || typeof change.before !== 'string' || !change.before) return change
          const domain = { chapter: 'manuscript', worldbook: 'world_lookup' }[change.kind]
          const target = (snapshot.domains[domain] || []).find(item => item.id === change.targetId)
          const source = String(target?.text || target?.summary || '')
          const anchor = change.before.trimEnd()
          if (!target || !anchor || Number(target.sourceLength || source.length) > source.length || !source.trimEnd().endsWith(anchor)) throw new Error('末尾追加的 before 应为空字符串。你提供的原文不是已完整读取目标的末尾，不能据此追加；中间插入请用 insert。')
          normalizations.push({ index, field: 'before', reason: '已核实为目标末尾；转换为标准追加参数。' })
          return { ...change, before: '' }
        }) : input.changes }
        const changes = validateAssistantChanges(normalized)
        assertAssistantPermission(policy, changes, policy?.bookId)
        for (const change of changes) {
          const domain = { chapter: 'manuscript', worldbook: 'world_lookup', outline: 'outline' }[change.kind]
          const target = (snapshot.domains[domain] || []).find(item => item.id === change.targetId)
          if (change.operation !== 'create' && !target) throw new Error('目标不在本轮可访问的资料中。')
          if (change.operation === 'create' && target) throw new Error('新建目标 ID 已存在。')
          if (['replace', 'delete', 'insert'].includes(change.operation) && change.field === 'content' && !String(target.text || target.summary || '').includes(change.before)) throw new Error('修改原文不在本次读取的片段中。')
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, domain: 'edit-proposals', changes, normalizations }) }] }
      } catch (error) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }) }], isError: true } }
    }
  }
}
