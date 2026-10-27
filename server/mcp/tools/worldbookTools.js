import { listWorldbook, readWorldbookEntry, resolveProject } from '../localProjects.js'

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

export const worldbookTools = [
  {
    name: 'pinax_worldbook_list',
    title: '列出世界书条目',
    description: '列出「世界书/」下的条目（id/名称/类型/标签/别名/字数），可按 type 过滤；不返回正文。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        type: { type: 'string', description: '按条目类型过滤，例如 character / location / event。' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, description: '最多返回多少条，默认 300。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      return listWorldbook(resolved.root, args)
    }
  },
  {
    name: 'pinax_worldbook_read',
    title: '读取世界书条目',
    description: '按 id 或名称读取单个世界书条目全文与关系字段；支持 maxChars 截断。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        id: { type: 'string', description: '条目 id。' },
        name: { type: 'string', description: '条目名称（精确或包含匹配）。' },
        maxChars: { type: 'integer', minimum: 1000, maximum: 200000, description: '正文最多返回字符数，默认 50000。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      const { entry, warnings } = readWorldbookEntry(resolved.root, args)
      const limit = Math.max(1000, Math.min(200000, Number(args.maxChars) || 50000))
      const content = String(entry.content || '')
      return {
        entry: {
          ...entry,
          content: content.slice(0, limit),
          contentChars: content.length,
          contentTruncated: content.length > limit
        },
        warnings
      }
    }
  }
]
