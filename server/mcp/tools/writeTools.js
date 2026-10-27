import { writeChapterProposal } from '../chapterProposals.js'
import { getExpert } from '../experts/registry.js'

export const writeTools = [
  {
    name: 'pinax_chapter_write',
    title: '提交章节修改提案（审阅档）',
    description: [
      '把改写结果写成审阅提案，存到项目 .pinax/proposals/ 下的 JSON 文件，绝不修改 正文/ 原稿、大纲或项目清单。',
      '提案含目标章节、原文修订标记、新正文、备注与来源，作者看过再自行决定是否落稿。',
      '内容与原文相同时拒绝写入（ERR_PROPOSAL_UNCHANGED）；同章节同内容已存在提案时直接复用。',
      '仅本地项目文件夹可用；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPath: {
          type: 'string',
          description: '本地项目文件夹的绝对路径（目录内须有 .pinax/project.json）。'
        },
        projectId: {
          type: 'string',
          description: '注册表中的 projectId，或已绑定到本地文件夹的 bookId。'
        },
        chapterIndex: {
          type: 'integer',
          minimum: 0,
          description: '目标章节序号（见 pinax_chapter_list）。'
        },
        chapterTitle: {
          type: 'string',
          description: '按章节标题指定目标；chapterIndex 优先。'
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 200000,
          description: '提案中的新正文（整章替换文本）。'
        },
        note: {
          type: 'string',
          maxLength: 500,
          description: '给作者的备注：本次改了什么、为什么。'
        },
        expertId: {
          type: 'string',
          description: '产生该提案的专家 id（可选，仅作溯源记录）。'
        },
        requestId: {
          type: 'string',
          maxLength: 120,
          description: '对应的 advisor requestId（可选，仅作溯源记录）。'
        }
      },
      allOf: [
        { anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }] },
        { anyOf: [{ required: ['chapterIndex'] }, { required: ['chapterTitle'] }] }
      ],
      required: ['content']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (args) => {
      const known = args.expertId ? getExpert(args.expertId).expert : null
      return writeChapterProposal({
        projectPath: args.projectPath,
        projectId: args.projectId,
        chapterIndex: args.chapterIndex,
        chapterTitle: args.chapterTitle,
        content: args.content,
        note: args.note,
        expert: args.expertId ? { id: args.expertId, name: known?.name || '' } : null,
        requestId: args.requestId
      })
    }
  }
]
