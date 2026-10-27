import {
  importChapter,
  initProject,
  writeRule,
  writeWorldbookEntry
} from '../imports.js'
import { importFolder } from '../projectImport.js'

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

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
}

export const importTools = [
  {
    name: 'pinax_project_init',
    title: '初始化本地项目文件夹',
    description: [
      '在空目录创建 .pinax/project.json 与 kind 对应的骨架目录（novel 含 正文/大纲/世界书/构思/资料/日志/约束），并登记到本机注册表。',
      '已有 .pinax/project.json 的项目原样返回，不改名、不改 manifest、不覆盖任何文件。',
      '仅本地路线；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPath: { type: 'string', description: '要初始化（或确认已存在）的项目文件夹绝对路径。' },
        name: { type: 'string', minLength: 1, maxLength: 120, description: '项目名称；项目已存在时可省略。' },
        kind: { type: 'string', enum: ['novel', 'screenplay', 'generic'], description: '项目类型，默认 novel。' },
        projectId: { type: 'string', maxLength: 120, description: '指定 projectId（可选；缺省自动生成）。' }
      },
      required: ['projectPath']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args) => initProject(args)
  },
  {
    name: 'pinax_rule_write',
    title: '写入约束文件',
    description: [
      '把作者给定的约束/规则文本写入项目 约束/<名称>.md（上限 8 个文件，单文件 5 万字）。',
      '只导入既有文本，不生成内容；同名同内容复用，内容不同默认拒绝，确认覆盖需 overwrite:true。',
      '仅本地项目文件夹；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        name: { type: 'string', minLength: 1, maxLength: 120, description: '约束文件名（不含扩展名）。' },
        content: { type: 'string', minLength: 1, maxLength: 50000, description: '约束全文。' },
        overwrite: { type: 'boolean', description: '同名文件内容不同时是否覆盖，默认 false。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }],
      required: ['name', 'content']
    },
    annotations: writeAnnotations,
    run: async (args) => writeRule(args)
  },
  {
    name: 'pinax_worldbook_write',
    title: '写入世界书条目',
    description: [
      '把作者给定的条目文本按世界书文件契约 v2 序列化，写到 世界书/<分类>/<名称>.md；分类由 type 决定（人物/地理/势力/编年/资料/设定）。',
      '只导入既有文本，不生成内容；同名或同 id 条目默认拒绝覆盖，确认覆盖需 overwrite:true。',
      '仅本地项目文件夹；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        name: { type: 'string', minLength: 1, maxLength: 120, description: '条目名称（世界书内唯一）。' },
        content: { type: 'string', minLength: 1, maxLength: 200000, description: '条目正文。' },
        type: {
          type: 'string',
          description: '条目类型（character/location/organization/event/source 有固定分类目录，其余如 general/secret 落到 设定/），默认 general。'
        },
        id: { type: 'string', maxLength: 200, description: '条目 id（可选，缺省按项目与名称生成）。' },
        keys: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 50,
          description: '触发关键词/别名（可选）。'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 50,
          description: '标签（可选）。'
        },
        summary: { type: 'string', maxLength: 500, description: '一句话摘要（可选）。' },
        overwrite: { type: 'boolean', description: '同名条目内容不同时是否覆盖，默认 false。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }],
      required: ['name', 'content']
    },
    annotations: writeAnnotations,
    run: async (args) => writeWorldbookEntry(args)
  },
  {
    name: 'pinax_chapter_import',
    title: '导入章节正文',
    description: [
      '把作者已有的章节正文导入 正文/NNN-标题.md（3 位序号；chapterNumber 缺省取现有最大序号 +1）。',
      '只导入既有文本，不调用模型、不生成正文；同序号内容相同复用，不同默认拒绝，确认覆盖需 overwrite:true。',
      '修改已有章节请用 pinax_chapter_write 生成审阅提案，不要用本工具直接覆盖。仅本地项目文件夹；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        title: { type: 'string', minLength: 1, maxLength: 120, description: '章节标题（写入文件名）。' },
        content: { type: 'string', minLength: 1, maxLength: 500000, description: '章节正文全文。' },
        chapterNumber: { type: 'integer', minimum: 1, maximum: 500, description: '章节序号（1 起）；缺省自动取下一号。' },
        overwrite: { type: 'boolean', description: '同序号章节内容不同时是否覆盖，默认 false。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }],
      required: ['content']
    },
    annotations: writeAnnotations,
    run: async (args) => importChapter(args)
  },
  {
    name: 'pinax_project_import',
    title: '整目录导入作者素材',
    description: [
      '把一个作者既有素材目录（任何形态：正文/、每章一目录的 故事主体/卷一/第NNN章-标题/小说.md、kit 式的 世界书/规则/素材/大纲/构思）按确定性类别导入本地项目文件夹的标准目录，覆盖 正文/大纲/世界书/约束/构思/资料/日志 全部落点。',
      '默认 dryRun:true 只出计划（每项的 decision 与 target）；确认后才传 dryRun:false 落盘。落盘复用 pinax_rule_write / pinax_worldbook_write / pinax_chapter_import 的幂等语义，其余类别走受控落盘：同内容复用、不同内容默认拒绝、覆盖需 overwrite:true。',
      '源目录永远只读；认不出类别的文件一律记账上报（skipped 带 reason），不替作者编号或编类别。',
      '世界书写入必须合契约 v2；frontmatter 是 JSON 方言的（kit 世界书常见）可传 worldbookMode:"wrap"，用作者原文包成契约 v2，名称取 frontmatter.title、类型取文件名前缀。',
      '导入只改文件；要让 Agent 查到设定，需再用 pinax_project_index 同步 RAG（正文/大纲不进 RAG 输入集）。仅本地项目文件夹；公网环境整组禁用。'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...projectRef,
        sourcePath: { type: 'string', minLength: 1, description: '要导入的素材目录绝对路径（不能就是项目文件夹本身）。' },
        dryRun: { type: 'boolean', description: '只出计划不落盘，默认 true；确认后置 false。' },
        overwrite: { type: 'boolean', description: '目标已存在且内容不同时是否覆盖，默认 false。' },
        maxFiles: { type: 'integer', minimum: 1, maximum: 2000, description: '单次处理文件上限，默认 400。' },
        include: { type: 'array', items: { type: 'string' }, maxItems: 50, description: '只导入相对路径包含这些子串的文件（可选）。' },
        exclude: { type: 'array', items: { type: 'string' }, maxItems: 50, description: '跳过相对路径包含这些子串的文件（可选，如 章节衍生）。' },
        worldbookMode: { type: 'string', enum: ['strict', 'wrap'], description: '世界书不合契约 v2 时的处置：strict 默认，只记账不改写；wrap 用作者原文包成契约 v2。' }
      },
      anyOf: [{ required: ['projectPath'] }, { required: ['projectId'] }],
      required: ['sourcePath']
    },
    annotations: writeAnnotations,
    run: async (args) => importFolder(args)
  }
]
