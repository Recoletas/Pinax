import { sendAssistantLiveInput } from './assistantLiveInput.js'
// StoryAgent 引擎适配器（融合 B 路线）：把 pi-agent 桥包装成助手可调用的任务引擎。
// 职责：项目上下文 + @ 参考组装 kernel（panelComposer 预序列化 blocks 透传）、
// 资源快照组装、run/resume/cancel/tasks 转发。不含任何 Vue/页面状态。
import { buildAssistantOrientation } from './assistantWorkspaceContext.js'
import { buildKernelBlocks } from './panelComposer.js'

function valueOf(value) { return typeof value === 'function' ? value() : value?.__v_isRef ? value.value : value }
function fallbackContext() {
  return { bookTitle: '', chapterTitle: '', manuscriptTail: '', worldEntries: [], chapterEntries: [] }
}

export function createStoryAgentEngine({ bridge, projectId = null, resolveContext = null, formatInstructions = '若本轮产出叙事正文：纯正文，不要标题；对话类回应不需要正文格式。' } = {}) {
  if (!bridge) throw new Error('createStoryAgentEngine 需要 bridge（createPiNarrativeAgentBridge 产物）')

  function buildPayload({ text, pinnedRefs = [], skills = [], bookId = valueOf(projectId) }) {
    const ctx = (typeof resolveContext === 'function' ? resolveContext(bookId) : resolveContext) || fallbackContext()
    const worldEntries = Array.isArray(ctx.worldEntries) ? ctx.worldEntries : []
    const referenceCatalogue = [...worldEntries, ...(ctx.chapterEntries || []), ...(ctx.sourceEntries || [])]
    pinnedRefs = pinnedRefs.map(ref => {
      const current = referenceCatalogue.find(item => item.id === ref.id && item.type === ref.type)
      if (!current && !['worldbook', 'chapter', 'source'].includes(ref.type)) return ref
      if (!current) throw new Error('参考资料已变化，请重新选择后发送。')
      return current
    })
    const kernel = {
      revision: `sae_${Date.now().toString(36)}`,
      serialization: {
        blocks: buildKernelBlocks({
          sceneText: text,
          firstEntry: null,
          pinnedRefs,
          project: { bookTitle: ctx.bookTitle, chapterTitle: ctx.chapterTitle, manuscriptTail: ctx.manuscriptTail },
          skills,
        }),
      },
    }
    kernel.serialization.blocks = kernel.serialization.blocks.filter(block => block.kind !== 'project')
    kernel.serialization.blocks.push(...buildAssistantOrientation(ctx, bookId))
    if (ctx.currentChapterId) kernel.serialization.blocks.push({ kind: 'editing-target', title: '当前修改目标', text: JSON.stringify({ chapterId: ctx.currentChapterId, ...(ctx.selection?.text ? { selectedText: String(ctx.selection.text).slice(0, 8000), nodeId: ctx.selection.nodeId || '' } : {}) }) })
    const index = {
      revision: `saew_${worldEntries.length}_${(ctx.manuscriptItems || []).length}_${(ctx.notesItems || []).length}`,
      byDomain: {
        workspace: ctx.workspaceItems || [],
        world: [...worldEntries, ...(ctx.sourceEntries || [])],
        manuscript: Array.isArray(ctx.manuscriptItems) ? ctx.manuscriptItems : [],
        notes: Array.isArray(ctx.notesItems) ? ctx.notesItems : [],
        outline: Array.isArray(ctx.outlineItems) ? ctx.outlineItems : [],
      },
    }
    return JSON.parse(JSON.stringify({ kernel, index, currentChapterId: String(ctx.currentChapterId || ''), bookId: String(bookId || ''), worldEntries, editBaseline: ctx.editBaseline || null }))
  }

  return Object.freeze({
    kind: 'storyagent-engine',
    prepare: buildPayload,
    healthz: (options) => bridge.healthz(options),
    async run({ prepared = null, bookId = valueOf(projectId), text, pinnedRefs = [], taskId = null, signal = null, callbacks = {}, onStatus = null, mode = 'auto', skills = [] } = {}) {
      const { kernel, index, bookId: ownerId } = prepared || buildPayload({ text, pinnedRefs, skills, bookId })
      return bridge.run({
        modelConfig: prepared?.modelConfig || null,
        maxTokens: 6000,
        budget: { agentTimeoutMs: 240000, maxModelSteps: 8, maxCallsPerTurn: 6 },
        kernel,
        index,
        mode,
        intent: String(text || ''),
        formatInstructions,
        requestId: `sae_${Date.now().toString(36)}`,
        taskId,
        bookId: ownerId || null, taskKind: 'assistant',
        signal,
        callbacks: { ...callbacks },
        onStatus,
      })
    },
    async resume({ prepared = null, bookId = valueOf(projectId), text, pinnedRefs = [], taskId, signal = null, callbacks = {}, onStatus = null } = {}) {
      const { kernel, index, bookId: ownerId } = prepared || buildPayload({ text, pinnedRefs, bookId })
      return bridge.resume({
        modelConfig: prepared?.modelConfig || null,
        maxTokens: 6000,
        budget: { agentTimeoutMs: 240000, maxModelSteps: 8, maxCallsPerTurn: 6 },
        taskId: String(taskId || ''),
        kernel,
        index,
        intent: String(text || ''),
        bookId: ownerId || null, taskKind: 'assistant', formatInstructions,
        signal,
        callbacks: { ...callbacks },
        onStatus,
      })
    },
    steer: sendAssistantLiveInput,
    async cancel(taskId) {
      return bridge.cancel(taskId)
    },
    async tasks() {
      return bridge.tasks(String(valueOf(projectId) || ''))
    },
    /** 供 @ 候选与上下文展示复用（worldEntries 与 chapterEntries 同源）。 */
    context() {
      const ctx = (typeof resolveContext === 'function' ? resolveContext(valueOf(projectId)) : resolveContext) || fallbackContext()
      return { ...ctx, worldEntries: Array.isArray(ctx.worldEntries) ? ctx.worldEntries : [], chapterEntries: Array.isArray(ctx.chapterEntries) ? ctx.chapterEntries : [] }
    },
  })
}
