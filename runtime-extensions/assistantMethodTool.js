import { ASSISTANT_WRITING_METHODS, resolveWritingMethods } from './assistantWritingMethods.js'

export function createAssistantMethodTool(req, state) {
  let selected = []
  try { selected = JSON.parse(req.kernel?.blocks?.find(block => block.kind === 'writing-methods')?.text || '[]') } catch { /* older clients */ }
  state.authorMethods = resolveWritingMethods(Array.isArray(selected) ? selected : [])
  state.loadedMethods = []
  state.methods = resolveWritingMethods(state.authorMethods)
  return {
    name: 'writing_methods', label: '查阅写作方法', executionMode: 'sequential',
    description: '按需查阅写作方法，不必每轮调用。list 返回用途，load 返回方法。默认追加本轮选择；换任务可用 mode=replace 替换自动选择，ids=[] 清除自动选择。作者已选方法保留。自动选择按适用产物传给正文生成，设定编写方法不自动变成正文写法。',
    parameters: { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['list', 'load'] }, ids: { type: 'array', items: { type: 'string' } }, mode: { type: 'string', enum: ['append', 'replace'] } }, required: ['action'] },
    execute: async (_id, input) => {
      let payload
      if (input?.action === 'list') payload = { ok: true, methods: ASSISTANT_WRITING_METHODS.map(({ id, label, description, targets }) => ({ id, label, description, targets })) }
      else if (input?.action === 'load' && (!input.mode || ['append', 'replace'].includes(input.mode)) && Array.isArray(input.ids) && (input.ids.length || input.mode === 'replace') && input.ids.every(id => ASSISTANT_WRITING_METHODS.some(method => method.id === id))) {
        const methods = resolveWritingMethods(input.ids.map(id => ({ id })))
        state.loadedMethods = resolveWritingMethods([...(input.mode === 'replace' ? [] : state.loadedMethods), ...methods])
        state.methods = resolveWritingMethods([...state.authorMethods, ...state.loadedMethods])
        payload = { ok: true, methods, activeIds: state.methods.map(method => method.id), authorSelectedIds: state.authorMethods.map(method => method.id) }
      } else payload = { ok: false, error: '请使用 list，或提供目录中的方法 ID。' }
      return { isError: !payload.ok, content: [{ type: 'text', text: JSON.stringify(payload) }] }
    }
  }
}
