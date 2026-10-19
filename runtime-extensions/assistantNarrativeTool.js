import { assertAssistantPermission } from './assistantPermission.js'

// The browser owns the frozen AuthoringRunSession and its narrative executor.
// This tool delegates generation; its result is a request, never generated prose.
export function createAssistantNarrativeTool(req, snapshot) {
  if (!(req.kernel?.blocks || []).some(block => block.kind === 'assistant-narrative')) return null
  let currentId = ''
  try { currentId = JSON.parse(req.kernel.blocks.find(block => block.kind === 'editing-target')?.text || '{}').chapterId || '' } catch { /* invalid target stays unavailable */ }
  if (!currentId) return null
  return {
    name: 'generate_narrative_draft', label: '调用推演写作',
    description: '写作或改写当前章节必须使用本工具，复用 Pinax 推演的现场、规划和正文生成链。只提供作者的具体要求，不自行生成正文。append 为章末续写，before 为空；replace 改写原文，作者要求整章替换时必须指定 scope=chapter、before 留空，由系统绑定完整章节；局部改写用 scope=fragment、before 为唯一原文片段。insert 在唯一原文片段后增补。成功后立即以 proposal 完成本轮，不再提交正文字符串。返回的是待执行请求，尚未生成或写入作品。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      targetId: { type: 'string' }, operation: { type: 'string', enum: ['append', 'replace', 'insert'] },
      instruction: { type: 'string' }, before: { type: 'string' },
      scope: { type: 'string', enum: ['fragment', 'chapter'], description: 'replace 的替换范围：整章改写用 chapter，局部原文用 fragment。' }
    }, required: ['targetId', 'operation', 'instruction', 'before'] },
    execute: async (_id, input) => {
      try {
        if (input?.targetId !== currentId || !['append', 'replace', 'insert'].includes(input.operation)) throw new Error('请针对当前章节生成；其他章节请先切换目标。')
        if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000 || typeof input.before !== 'string' || input.before.length > 8000) throw new Error('请提供明确的写作要求和有效原文。')
        assertAssistantPermission(req.assistantPolicy, [{ kind: 'chapter', targetId: currentId }], req.bookId)
        const target = (snapshot.domains.manuscript || []).find(item => item.id === currentId)
        const source = String(target?.text || '')
        if (!target) throw new Error('当前正文不在本轮快照中。')
        if (input.scope != null && !['fragment', 'chapter'].includes(input.scope)) throw new Error('替换范围无效。')
        if (input.scope === 'chapter') {
          if (input.operation !== 'replace') throw new Error('整章范围只用于替换正文。')
          if (!source || source.length > 8000) throw new Error('当前整章超出单次改写范围，请选取具体片段。')
          input = { ...input, before: source }
        }
        if (input.operation === 'append' ? input.before !== '' : !input.before || source.indexOf(input.before) < 0 || source.indexOf(input.before) !== source.lastIndexOf(input.before)) throw new Error('续写的 before 应为空；改写或插入须提供已读取且唯一的原文。')
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, phase: 'planned', request: { targetId: currentId, operation: input.operation, instruction: input.instruction.trim(), before: input.before } }) }] }
      } catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }) }] } }
    }
  }
}
