import { indexProject, searchKnowledge, KNOWLEDGE_TOOL_LIMITS } from '../knowledgeIndex.js'

// 批次 8：知识索引（RAG）工具。全部转发既有链路（knowledgeProjectIndexer + /api/knowledge/* 只读动词），
// 不在 MCP 侧另起检索引擎；项目文件夹只读，派生缓存只落 .runtime/data/knowledge。

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

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

export const knowledgeTools = [
  {
    name: 'pinax_project_index',
    title: '查看/同步项目知识索引（RAG）',
    description: [
      'action:"status"（默认，只读）：按索引侧同一套规则盘点 RAG 输入集（世界书/资料/规则/约束/文风），算出当前 revision，与本机缓存里的 coverage.json 比对，给出 verdict=fresh / stale / never-indexed / inputs-rejected / runtime-missing。',
      'action:"sync"：复用既有索引链触发一次编译并复核新鲜度（首次或资料变更后即为全量重建，内容未变即缓存命中、不做二次编译）。需要本机 Pinax 服务在跑（PINAX_SERVER_URL，默认 127.0.0.1:3001）与已安装的知识内核。',
      '正文/ 与 大纲/ 不是 RAG 输入：想让 Agent 引用正文请用 pinax_chapter_read 或 pinax_agent_ask，不要指望本工具把它们查出来。',
      '知识内核未安装时返回 KNOWLEDGE_RUNTIME_MISSING，不会假装已索引。项目文件夹永远只读。仅本地路线；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        action: { type: 'string', enum: ['status', 'sync'], description: 'status 只读盘点（默认）；sync 触发一次索引并复核。' },
        probe: { type: 'string', minLength: 1, maxLength: 200, description: 'sync 时用于触发检索的探针词，默认「设定」。' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 180000, description: `sync 的上游等待毫秒数，默认 ${KNOWLEDGE_TOOL_LIMITS.defaultTimeoutMs}，上限 ${KNOWLEDGE_TOOL_LIMITS.maxTimeoutMs}。` }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args) => indexProject(args)
  },
  {
    name: 'pinax_knowledge_search',
    title: '检索项目知识面（只读）',
    description: [
      '转发既有只读检索动词：kb_search（关键词检索知识卡）、worldbook_search（世界书条目检索，需项目）、kb_read（按 ref 读卡片全文，ref 来自检索结果）。',
      '带 projectPath/projectId 时只检索本书的 RAG 输入集；不带则走安装态全局知识面，结果不等于本书，报告里会如实标注。',
      '索引不新鲜时上游会返回 KNOWLEDGE_RUNTIME_MISSING / STALE_INDEX 等 typed error；先跑 pinax_project_index 再看结果，不要把空结果当成「书里没有这个设定」。',
      '不写任何文件。仅本地路线；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        verb: { type: 'string', enum: KNOWLEDGE_TOOL_LIMITS.verbs, description: '检索动词，默认 kb_search。' },
        q: { type: 'string', minLength: 1, maxLength: 2000, description: '检索词（kb_search / worldbook_search 必填）。' },
        ref: { type: 'string', minLength: 1, maxLength: 1000, description: '卡片引用（kb_read 必填，须是知识库内相对路径或卡片 ID）。' },
        dir: { type: 'string', maxLength: 100, description: 'kb_search 可选：限定目录前缀。' },
        cat: { type: 'string', maxLength: 100, description: 'worldbook_search 可选：限定分类。' },
        k: { type: 'integer', minimum: 1, maximum: 30, description: '返回条数上限，默认由内核决定，最大 30。' },
        maxChars: { type: 'integer', minimum: 1, maximum: 20000, description: 'kb_read 可选：卡片正文截断字数。' },
        worldbookId: { type: 'string', maxLength: 200, description: '可选：期望的世界书 id，不匹配时上游返回 STALE_INDEX 而不是错结果。' },
        worldbookRevision: { type: 'string', maxLength: 200, description: '可选：期望的世界书 revision（一致性护栏）。' },
        indexRevision: { type: 'string', maxLength: 200, description: '可选：期望的索引 revision（kb_read 一致性护栏）。' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 180000, description: `等待毫秒数，默认 ${KNOWLEDGE_TOOL_LIMITS.defaultTimeoutMs}。` }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }]
    },
    annotations: readOnlyAnnotations,
    run: async (args) => searchKnowledge(args)
  }
]
