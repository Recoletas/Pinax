// StoryAgent 引擎适配器（融合 B 路线）：把 pi-agent 桥包装成助手可调用的任务引擎。
// 职责：项目上下文 + @ 参考组装 kernel（panelComposer 预序列化 blocks 透传）、
// 资源快照组装、run/resume/cancel/tasks 转发。不含任何 Vue/页面状态。
import { buildKernelBlocks } from './panelComposer.js'

function fallbackContext() {
  return { bookTitle: '', chapterTitle: '', manuscriptTail: '', worldEntries: [], chapterEntries: [] }
}

export function createStoryAgentEngine({ bridge, projectId = null, resolveContext = null, formatInstructions = '若本轮产出叙事正文：纯正文，不要标题；对话类回应不需要正文格式。' } = {}) {
  if (!bridge) throw new Error('createStoryAgentEngine 需要 bridge（createPiNarrativeAgentBridge 产物）')

  function buildPayload({ text, pinnedRefs = [], skills = [] }) {
    const ctx = (typeof resolveContext === 'function' ? resolveContext() : resolveContext) || fallbackContext()
    const worldEntries = Array.isArray(ctx.worldEntries) ? ctx.worldEntries : []
    const kernel = {
      revision: `sae_${Date.now().toString(36)}`,
      serialization: {
        blocks: buildKernelBlocks({
          sceneText: text,
          firstEntry: worldEntries[0] || null,
          pinnedRefs,
          project: { bookTitle: ctx.bookTitle, chapterTitle: ctx.chapterTitle, manuscriptTail: ctx.manuscriptTail },
          skills,
        }),
      },
    }
    const index = { revision: `saew_${worldEntries.length}`, byDomain: { world: worldEntries } }
    return { kernel, index, worldEntries }
  }

  return Object.freeze({
    kind: 'storyagent-engine',
    async run({ text, pinnedRefs = [], maxTokens = 1600, taskId = null, signal = null, callbacks = {}, onStatus = null, mode = 'auto', skills = [] } = {}) {
      const { kernel, index } = buildPayload({ text, pinnedRefs, skills })
      return bridge.run({
        kernel,
        index,
        mode,
        intent: String(text || ''),
        formatInstructions,
        maxTokens,
        requestId: `sae_${Date.now().toString(36)}`,
        taskId,
        bookId: projectId ? String(projectId) : null,
        signal,
        callbacks: { ...callbacks },
        onStatus,
      })
    },
    async resume({ text, pinnedRefs = [], taskId, signal = null, callbacks = {}, onStatus = null } = {}) {
      const { kernel, index } = buildPayload({ text, pinnedRefs })
      return bridge.resume({
        taskId: String(taskId || ''),
        kernel,
        index,
        intent: String(text || ''),
        bookId: projectId ? String(projectId) : null,
        signal,
        callbacks: { ...callbacks },
        onStatus,
      })
    },
    async cancel(taskId) {
      return bridge.cancel(taskId)
    },
    async tasks() {
      return bridge.tasks()
    },
    /** 供 @ 候选与上下文展示复用（worldEntries 与 chapterEntries 同源）。 */
    context() {
      const ctx = (typeof resolveContext === 'function' ? resolveContext() : resolveContext) || fallbackContext()
      return { ...ctx, worldEntries: Array.isArray(ctx.worldEntries) ? ctx.worldEntries : [], chapterEntries: Array.isArray(ctx.chapterEntries) ? ctx.chapterEntries : [] }
    },
  })
}
