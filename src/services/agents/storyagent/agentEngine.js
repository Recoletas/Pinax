import { resolveWritingMethods } from '../../../../shared/assistantWritingMethods.js'
import { normalizeRequestModelConfig } from '../../../../shared/requestModelConfig.js'
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

  function buildPayload({ text, pinnedRefs = [], skills = [], editDecisions = null, bookId = valueOf(projectId) }) {
    const ctx = (typeof resolveContext === 'function' ? resolveContext(bookId, { text }) : resolveContext) || fallbackContext()
    const worldEntries = Array.isArray(ctx.worldEntries) ? ctx.worldEntries : []
    const referenceCatalogue = [...worldEntries, ...(ctx.chapterEntries || []), ...(ctx.sourceEntries || [])]
    pinnedRefs = pinnedRefs.map(ref => {
      const current = referenceCatalogue.find(item => item.id === ref.id && item.type === ref.type)
      if (!current && !['worldbook', 'chapter', 'source'].includes(ref.type)) return ref
      if (!current) throw new Error('参考资料已变化，请重新选择后发送。')
      return current
    })
    skills = resolveWritingMethods(skills)
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
    kernel.serialization.blocks.push({ kind: 'writing-methods', title: '作者选择的写作方法', text: JSON.stringify(skills) })
    if (editDecisions?.proposals?.length) kernel.serialization.blocks.push({ kind: 'author-edit-decisions', title: '作者已处理的修改与待审状态', text: JSON.stringify(editDecisions) })
    // The assistant request is not a scene description. Keep it verbatim in
    // the user turn instead of repeating its first 800 characters as world data.
    kernel.serialization.blocks = kernel.serialization.blocks.filter(block => !['project', 'skills', 'scene'].includes(block.kind))
    kernel.serialization.blocks.push(...buildAssistantOrientation(ctx, bookId))
    if (ctx.currentChapterId) kernel.serialization.blocks.push({ kind: 'editing-target', title: '当前修改目标', text: JSON.stringify({ chapterId: ctx.currentChapterId, ...(ctx.selection?.text ? { selectedText: String(ctx.selection.text), nodeId: ctx.selection.nodeId || '' } : {}) }) })
    const index = {
      currentChapterId: String(ctx.currentChapterId || ''),
      revision: `saew_${worldEntries.length}_${(ctx.manuscriptItems || []).length}_${(ctx.notesItems || []).length}`,
      byDomain: {
        workspace: ctx.workspaceItems || [],
        world: [...worldEntries, ...(ctx.sourceEntries || [])],
        manuscript: Array.isArray(ctx.manuscriptItems) ? ctx.manuscriptItems : [],
        notes: Array.isArray(ctx.notesItems) ? ctx.notesItems : [],
        outline: Array.isArray(ctx.outlineItems) ? ctx.outlineItems : [],
      },
    }
    return JSON.parse(JSON.stringify({ kernel, index, currentChapterId: String(ctx.currentChapterId || ''), bookId: String(bookId || ''), manuscriptTail: ctx.manuscriptTail || '', worldEntries, methods: skills, pinnedRefs, editBaseline: ctx.editBaseline || null }))
  }

  return Object.freeze({
    kind: 'storyagent-engine',
    prepare: buildPayload,
    healthz: (options) => bridge.healthz(options),
    async run({ prepared = null, bookId = valueOf(projectId), text, pinnedRefs = [], taskId = null, signal = null, callbacks = {}, onStatus = null, mode = 'auto', skills = [] } = {}) {
      const { kernel, index, bookId: ownerId } = prepared || buildPayload({ text, pinnedRefs, skills, bookId })
      return bridge.run({
        modelConfig: prepared?.modelConfig || null,
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
    compact(taskId, { bookId = valueOf(projectId), modelConfig = null, signal = null } = {}) {
      return bridge.compact(taskId, { bookId: String(bookId || ''), modelConfig: normalizeRequestModelConfig(modelConfig), signal })
    },
    async cancel(taskId) {
      return bridge.cancel(taskId)
    },
    ...(typeof bridge.waitForTaskIdle === 'function' ? { waitForTaskIdle: (taskId, options) => bridge.waitForTaskIdle(taskId, options) } : {}),
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
