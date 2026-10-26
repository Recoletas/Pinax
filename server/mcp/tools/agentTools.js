import { ASK_TASK_TYPES, askAdvisor } from '../agentAsk.js'

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

export const agentTools = [
  {
    name: 'pinax_agent_ask',
    title: '基于本地稿件向 Pinax Agent 提问',
    description: [
      '把本地项目文件夹装成既有的 Agent 上下文信封，调用 Pinax 既有 /api/advisor 任务链做只读问答，返回意见与来源。',
      '只读：不写文件、不改大纲、不动注册表。',
      'taskType 仅限只读档：authoring.knowledge.query（默认，依据稿件/世界书/大纲答疑）、authoring.review.chapter（章节批注，未指定章节时默认最后一章）、authoring.next-actions（下一步建议）。',
      '需要本机 Pinax 服务在运行（默认 http://127.0.0.1:3001，可用 PINAX_SERVER_URL 覆盖）。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        question: {
          type: 'string',
          minLength: 1,
          maxLength: 4000,
          description: '要问的问题或批注要求。'
        },
        taskType: {
          type: 'string',
          default: ASK_TASK_TYPES[0],
          description: '只读任务类型；默认 authoring.knowledge.query。非只读任务会返回 ERR_ASK_TASK_NOT_ALLOWED。'
        },
        chapterIndex: {
          type: 'integer',
          minimum: 0,
          description: '附带哪一章正文（从 0 开始的章节序号，见 pinax_chapter_list）。'
        },
        chapterTitle: {
          type: 'string',
          description: '按章节标题附带正文；chapterIndex 优先。'
        },
        worldbookNames: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 12,
          description: '要附带的设定条目名称/别名；省略时按问题里出现的名字挑选。'
        },
        worldbookLimit: {
          type: 'integer',
          minimum: 0,
          maximum: 24,
          default: 8,
          description: '最多附带多少条世界书条目；0 表示不附带。'
        },
        maxChars: {
          type: 'integer',
          minimum: 2000,
          maximum: 32000,
          description: '上下文预算上限（字符）；不会超过该任务的 profile 预算。'
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
      required: ['question']
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    run: async (args, context = {}) => askAdvisor({
      projectPath: args.projectPath,
      projectId: args.projectId,
      question: args.question,
      advisorBaseUrl: context.advisorBaseUrl,
      options: {
        taskType: args.taskType,
        chapterIndex: args.chapterIndex,
        chapterTitle: args.chapterTitle,
        worldbookNames: args.worldbookNames,
        worldbookLimit: args.worldbookLimit,
        maxChars: args.maxChars,
        timeoutMs: args.timeoutMs
      }
    })
  }
]
