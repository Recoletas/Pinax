import { resolveProject } from '../localProjects.js'
import { CATALOG_ACTIONS, CATALOG_KINDS, runProjectCatalog } from '../../services/projectCatalogService.js'

export const catalogTools = [{
  name: 'pinax_project_catalog',
  title: '检索/同步本地项目目录（SQLite）',
  description: [
    '项目文件的派生目录，包含正文、大纲、设定、构思、资料与规则；不是RAG，也不替代原文件。',
    '先status查看是否建立与过期；sync显式同步，仅写.pinax/project.sqlite的catalog_*表。',
    'search按字面短语查询，list列条目，read按kind/id读取；命中包含原文件路径、哈希及修订。',
    '未建立、来源已变化或expectedRevision不符会明确返回错误，不自动重建、不把过期内容当成当前原文。',
    '本地文件项目专用；不支持浏览器缓存书，公网禁用。'
  ].join('\n'),
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      projectPath: { type: 'string', description: '含.pinax/project.json的本地项目绝对路径' },
      projectId: { type: 'string', description: '注册表projectId或已绑定bookId' },
      action: { type: 'string', enum: CATALOG_ACTIONS, description: '默认status；只有sync写派生目录' },
      query: { type: 'string', minLength: 1, maxLength: 500, description: 'search字面查询词' },
      kind: { type: 'string', enum: CATALOG_KINDS },
      id: { type: 'string', minLength: 1, description: 'read条目ID，使用list/search返回的id' },
      limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'list最大1000，search最大100' },
      offset: { type: 'integer', minimum: 0, maximum: 100000 },
      verifyContent: { type: 'boolean', description: 'sync强制复核原文件哈希' },
      expectedRevision: { type: 'string', description: '读取所依据的目录revision' }
    },
    anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: async ({ projectPath, projectId, ...request }) => {
    const resolved = resolveProject({ projectPath, projectId })
    return runProjectCatalog(resolved.root, request, { expectedProjectId: resolved.manifest.projectId })
  }
}]
