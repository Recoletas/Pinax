import {
  buildProjectContext,
  listLocalProjects,
  openProject,
  resolveProject
} from '../localProjects.js'

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

export const projectTools = [
  {
    name: 'pinax_project_list',
    title: '列出本地 Pinax 项目',
    description: '列出本机注册表中的 Pinax 项目文件夹及其是否存在 .pinax/project.json。仅本地路线，不返回浏览器缓存书。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async () => listLocalProjects()
  },
  {
    name: 'pinax_project_open',
    title: '打开本地项目',
    description: '校验并打开一个本地项目文件夹，返回项目元数据与章节/大纲/世界书数量。不会写入注册表，也不修改任何文件。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: projectRef,
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => openProject(args)
  },
  {
    name: 'pinax_project_context',
    title: '读取项目上下文索引',
    description: '返回项目的轻量上下文索引：章节标题、大纲节点、世界书条目摘要与约束文件清单。正文请用 pinax_chapter_read 读取。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: projectRef,
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args) => {
      const resolved = resolveProject(args)
      return buildProjectContext(resolved.root, resolved)
    }
  }
]
