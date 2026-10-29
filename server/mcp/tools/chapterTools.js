import { chapterStats, listChapters, readChapter, resolveProject } from '../localProjects.js'

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

export const chapterTools = [
  {
    name: 'pinax_chapter_list',
    title: '列出章节',
    description: '按「正文/」文件名排序列出章节标题、序号与文件字节数（不返回正文）。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        limit: { type: 'integer', minimum: 1, maximum: 500, description: '最多返回多少章，默认 200。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      const all = listChapters(resolved.root)
      const stats = chapterStats(resolved.root)
      const limit = Math.max(1, Math.min(500, Number(args.limit) || 200))
      return {
        total: stats.total,
        truncated: all.length > limit,
        cappedAt500: stats.truncated,
        chapters: all.slice(0, limit)
      }
    }
  },
  {
    name: 'pinax_chapter_read',
    title: '读取章节正文',
    description: '按 index 或标题读取单章正文，支持 offset/maxChars 分页；返回是否截断与下一页 offset。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        index: { type: 'integer', minimum: 0, description: '章节序号（从 0 开始），与 title 二选一。' },
        title: { type: 'string', description: '章节标题（精确或包含匹配），与 index 二选一。' },
        offset: { type: 'integer', minimum: 0, description: '正文字符偏移，默认 0。' },
        maxChars: { type: 'integer', minimum: 1000, maximum: 200000, description: '本次最多返回字符数，默认 20000。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      return readChapter(resolved.root, args)
    }
  }
]
