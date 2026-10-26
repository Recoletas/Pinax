import { readOutline, resolveProject } from '../localProjects.js'

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

export const outlineTools = [
  {
    name: 'pinax_outline_read',
    title: '读取大纲',
    description: '读取「大纲/outline.json」的节点与连线（结构化）。只有 大纲.md 时返回 warning，不编造节点。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        maxNodes: { type: 'integer', minimum: 1, maximum: 1000, description: '最多返回多少节点，默认 300。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      return readOutline(resolved.root, args)
    }
  }
]
