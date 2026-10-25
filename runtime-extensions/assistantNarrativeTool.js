import { assertAssistantPermission } from './assistantPermission.js'

// The browser owns the frozen AuthoringRunSession and its narrative executor.
// This validator prepares the request; the task awaits the browser executor.
export function createAssistantNarrativeTool(req, snapshot) {
  if (!(req.kernel?.blocks || []).some(block => block.kind === 'assistant-narrative')) return null
  let currentId = ''
  try { currentId = JSON.parse(req.kernel.blocks.find(block => block.kind === 'editing-target')?.text || '{}').chapterId || '' } catch { /* invalid target stays unavailable */ }
  if (!currentId) return null
  return {
    name: 'generate_narrative_draft', label: '调用推演写作', executionMode: 'sequential',
    description: '生成或改写当前章节正文，复用 Pinax 写作链。instruction 转达作者本次要求，已有作品与作者选定文风由上下文提供，不把自行拟定的写法或旧候选说成作者要求。append 为章末续写，before 为空；replace 整章用 scope=chapter、before 留空，系统绑定完整章节；局部用 scope=fragment、before 为唯一原文。insert 在唯一原文后增补。工具返回待采用草稿，不写入正式作品；讨论、大纲和设定编写使用各自的回答或修改工具。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      targetId: { type: 'string' }, operation: { type: 'string', enum: ['append', 'replace', 'insert'] },
      planning: { type: 'string', enum: ['direct', 'reuse', 'plan'], description: '默认 direct：按已明确的要求写作或润色。已有方案、大纲或草稿接续用 reuse，并在 instruction 中传达已有方向；需要先组织复杂情节且尚无方案才用 plan。' },
      finishTask: { type: 'boolean', description: '仅当这份稿件成功生成就完成作者本轮全部要求时设为 true，可立即交付。仍需查阅、修改其他对象、比较方案或回答问题时保持 false。' },
      draftAction: { type: 'string', enum: ['revise', 'extend'], description: '已有同位置草稿时，revise 重做该草稿（默认），extend 才接着草稿往后写。尚未采用的章末草稿使用 append + revise 修订，不属于正式章节原文。' },
      instruction: { type: 'string', description: '忠实保留作者的目标、范围与已明确选择。补充作品事实时说明依据；不代作者新增文风、情节或篇幅要求。' }, before: { type: 'string', description: 'append 可省略，默认空字符串；局部 replace 或 insert 必须提供唯一原文。' },
      scope: { type: 'string', enum: ['fragment', 'chapter'], description: 'replace 的替换范围：整章改写用 chapter，局部原文用 fragment。' }
    }, required: ['targetId', 'operation', 'instruction'] },
    execute: async (_id, input) => {
      try {
        if (input?.targetId !== currentId || !['append', 'replace', 'insert'].includes(input.operation)) throw new Error('请针对当前章节生成；其他章节请先切换目标。')
        if (input.before === undefined && (input.operation === 'append' || input.scope === 'chapter')) input = { ...input, before: '' }
        if (typeof input.instruction !== 'string' || !input.instruction.trim() || typeof input.before !== 'string') throw new Error('请提供明确的写作要求和有效原文。')
        assertAssistantPermission(req.assistantPolicy, [{ kind: 'chapter', targetId: currentId }], req.bookId)
        const target = (snapshot.domains.manuscript || []).find(item => item.id === currentId)
        const source = String(target?.text || '')
        if (!target) throw new Error('当前正文不在本轮快照中。')
        if (input.scope != null && !['fragment', 'chapter'].includes(input.scope)) throw new Error('替换范围无效。')
        if (input.planning != null && !['direct', 'reuse', 'plan'].includes(input.planning)) throw new Error('写作方式无效。')
        if (input.finishTask != null && typeof input.finishTask !== 'boolean') throw new Error('交付方式无效。')
        if (input.scope === 'chapter') {
          if (input.operation !== 'replace') throw new Error('整章范围只用于替换正文。')
          if (Number(target.sourceLength || source.length) > source.length) throw new Error('本轮未读取完整章节，请指定局部改写原文。')
          if (!source) {
            // Replacing an explicitly empty whole chapter is the same write as
            // its first append. Do not spend another model turn correcting the verb.
            if (input.before !== '' || input.draftAction === 'extend') throw new Error('当前章节为空；替换原文需为空，接着草稿写请用 append。')
            input = { ...input, operation: 'append' }
          } else {
            input = { ...input, before: source }
          }
        }
        if (input.operation === 'append' ? input.before !== '' : !input.before || source.indexOf(input.before) < 0 || source.indexOf(input.before) !== source.lastIndexOf(input.before)) throw new Error('续写的 before 应为空；改写或插入须提供已读取且唯一的原文。')
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, phase: 'planned', request: { targetId: currentId, operation: input.operation, instruction: input.instruction.trim(), before: input.before, draftAction: input.draftAction === 'extend' ? 'extend' : 'revise', planning: input.planning || 'direct', finishTask: input.finishTask === true } }) }] }
      } catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }) }] } }
    }
  }
}
