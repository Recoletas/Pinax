import { ASSISTANT_EDIT_TOOL, assistantEditSchema, validateAssistantChanges, reserveAssistantCreateIds } from './assistantEditProposal.js'
import { assertAssistantPermission } from './assistantPermission.js'
export function createAssistantProposalTool(snapshot, policy) {
  return { name: ASSISTANT_EDIT_TOOL, label: '提出作品修改', executionMode: 'sequential',
    description: '用户要求写作或修改时，先查相关内容，再通过本工具提出待作者确认的修改。只提出建议，不写入作品。kind=chapter 为正文，worldbook 为角色/设定，outline 为大纲。开篇写法、出场顺序等情节规划不是世界事实，要求保存时用 outline；worldbook 只写已确定或作者明确委托补定的设定，不能把讨论备选一并定稿。targetId 使用当前修改目标的章节ID或已读取条目的ID，不能用标题、虚拟路径或workspace文件ID；已存在的人物或地点应修改原条目；create 仅用于新增，并提供 title 标题，新 ID 冲突由系统避重。replace 的 before 必须是完整且唯一的原文片段；after 只放替换内容。讨论和检索回答无需调用。insert 用 before 中唯一的原文片段作为插入锚点，在其紧后插入 after；append 只在章节或条目末尾追加，before 必须是空字符串，after 只放新增文字；不要把现有段落复制进 before。设定内容可附 details：aliases/sourceRefs 补充列表，attributes 按 key 更新属性，relations 按 to+type 合并富关系；未提供的字段保留，不会从属性自动覆盖手写正文。关联修改用相同 groupId 标记，不能拆开的操作一起交付。多条目可以分批提交，工具不会结束任务。修订已有候选时使用工具返回的同一 targetId、field、operation 和 before，after 填完整新内容；本轮新建候选继续用 create 和已分配的 ID。final 仅兼容旧会话。提交后可继续查阅、修订或询问作者，最后正常输出回答。',
    parameters: { ...assistantEditSchema, properties: { ...assistantEditSchema.properties, final: { type: 'boolean', description: '兼容旧会话；不会结束任务。提交后可继续查阅、修订和提问。' } } },
    execute: async (_id, input) => {
      try {
        if (!input) throw new Error('修改建议超出允许范围。')
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
        const changes = reserveAssistantCreateIds(validateAssistantChanges(normalized), {
          chapter: snapshot.domains.manuscript || [], worldbook: snapshot.domains.world_lookup || [], outline: snapshot.domains.outline || []
        })
        changes.forEach((change, index) => {
          if (change.targetId !== normalized.changes[index].targetId) normalizations.push({ index, field: 'targetId', reason: '已为新建内容分配独立 ID，不覆盖已有条目。' })
        })
        try { assertAssistantPermission(policy, changes, policy?.bookId) }
        catch { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'ASSISTANT_PERMISSION_REQUIRED', error: '本轮未修改作品。当前权限不包含这些修改，请在助手权限中开启对应范围后重试；不能改写其他内容来代替。' }) }] } }
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
