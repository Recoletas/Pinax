import { askAdvisor } from '../agentAsk.js'
import {
  composeExpertQuestion,
  expertAskOptions,
  getExpert,
  loadExperts
} from '../experts/registry.js'

const projectRef = {
  projectPath: {
    type: 'string',
    description: '本地项目文件夹的绝对路径（目录内须有 .pinax/project.json）。'
  },
  projectId: {
    type: 'string',
    description: '注册表中的 projectId，或已绑定到本地文件夹的 bookId。'
  }
}

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

function listPayload({ includePrompt = false } = {}) {
  const registry = loadExperts()
  return {
    count: registry.experts.length,
    file: registry.file,
    warnings: registry.warnings,
    experts: registry.experts.map((expert) => ({
      id: expert.id,
      name: expert.name,
      role: expert.role || '',
      taskType: expert.taskType,
      maxChars: expert.maxChars,
      builtin: Boolean(expert.builtin),
      context: {
        chapter: expert.context.chapter,
        includeOutline: expert.context.includeOutline,
        worldbookLimit: expert.context.worldbookLimit,
        worldbookNames: expert.context.worldbookNames
      },
      ...(includePrompt ? { prompt: expert.prompt } : {})
    }))
  }
}

export const expertTools = [
  {
    name: 'pinax_expert_list',
    title: '列出可用专家',
    description: '列出内置与自定义专家（应用数据目录 experts.json）：id、职责、任务类型、字数上限与上下文选择。不返回提问模板，除非 includePrompt=true。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includePrompt: {
          type: 'boolean',
          default: false,
          description: '是否返回每位专家的完整提问模板。'
        }
      }
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => listPayload({ includePrompt: args.includePrompt === true })
  },
  {
    name: 'pinax_expert_invoke',
    title: '请专家审阅本地稿件',
    description: [
      '按专家配置（任务类型、上下文选择、提问模板、字数上限）向既有 Advisor 任务链提问，只读返回意见与来源。',
      '不写文件；需要落稿请另用 pinax_chapter_write 生成审阅提案。',
      '需要本机 Pinax 服务在运行（默认 http://127.0.0.1:3001，可用 PINAX_SERVER_URL 覆盖）。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        expertId: {
          type: 'string',
          description: '专家 id（见 pinax_expert_list）。'
        },
        question: {
          type: 'string',
          maxLength: 4000,
          description: '给该专家补充的问题或要求；省略时只用专家模板。'
        },
        chapterIndex: {
          type: 'integer',
          minimum: 0,
          description: '指定章节序号；省略时按专家配置（通常为最后一章）。'
        },
        chapterTitle: {
          type: 'string',
          description: '按章节标题指定；chapterIndex 优先。'
        },
        timeoutMs: {
          type: 'integer',
          minimum: 5000,
          maximum: 600000,
          default: 180000,
          description: '等待 advisor 返回的超时时间。'
        }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }],
      required: ['expertId']
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    run: async (args, context = {}) => {
      const { expert, warnings } = getExpert(args.expertId)
      if (!expert) {
        throw failure('ERR_EXPERT_NOT_FOUND', `没有 id=${args.expertId} 的专家；可用 pinax_expert_list 查看。`)
      }
      const question = composeExpertQuestion(expert, args.question)
      if (!question) throw failure('ERR_QUESTION_REQUIRED', `专家 ${expert.name} 没有提问模板，请提供 question。`)
      const options = {
        ...expertAskOptions(expert),
        ...(args.chapterIndex !== undefined ? { chapterIndex: args.chapterIndex } : {}),
        ...(args.chapterTitle !== undefined ? { chapterTitle: args.chapterTitle } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {})
      }
      const result = await askAdvisor({
        projectPath: args.projectPath,
        projectId: args.projectId,
        question,
        options,
        advisorBaseUrl: context.advisorBaseUrl
      })
      return {
        expert: { id: expert.id, name: expert.name, taskType: expert.taskType },
        ...result,
        registryWarnings: warnings
      }
    }
  }
]
