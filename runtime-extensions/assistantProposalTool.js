import { ASSISTANT_EDIT_TOOL, assistantEditSchema, validateAssistantChanges } from './assistantEditProposal.js'
export function createAssistantProposalTool(snapshot) {
  return { name: ASSISTANT_EDIT_TOOL, label: '提出作品修改',
    description: '用户要求写作或修改时，先查相关内容，再通过本工具提出待作者确认的修改。只提出建议，不写入作品。kind=chapter 为正文，worldbook 为角色/设定，outline 为大纲。targetId 必须取检索结果；create 时指定新 ID，并提供 title 标题。replace 的 before 必须是完整且唯一的原文片段；after 只放替换内容。讨论和检索回答无需调用。一次提交所有关联修改。',
    parameters: assistantEditSchema,
    execute: async (_id, input) => {
      try {
        const changes = validateAssistantChanges(input)
        for (const change of changes) {
          const domain = { chapter: 'manuscript', worldbook: 'world_lookup', outline: 'outline' }[change.kind]
          const target = (snapshot.domains[domain] || []).find(item => item.id === change.targetId)
          if (change.operation !== 'create' && !target) throw new Error('目标不在本轮可访问的资料中。')
          if (change.operation === 'create' && target) throw new Error('新建目标 ID 已存在。')
          if (change.operation === 'replace' && change.field === 'content' && !String(target.text || target.summary || '').includes(change.before)) throw new Error('修改原文不在本次读取的片段中。')
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, domain: 'edit-proposals', changes }) }] }
      } catch (error) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }) }], isError: true } }
    }
  }
}
