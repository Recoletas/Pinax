# MCP 工具矩阵（19 个，v0.5.0）

来源：`server/mcp/tools/*.js`、`server/mcp/createMcpServer.js`。改代码前以这三处为准，不要按本文记忆行事。

## 传输与门禁

| 事实 | 位置 |
|---|---|
| stdio 入口（客户端直接拉起，`PINAX_SERVER_URL` 默认 `http://127.0.0.1:3001`） | `server/mcp/index.js` |
| 本机 Streamable HTTP 挂载 `/mcp`（无状态：只 POST，GET/DELETE→405，协议版本不认→400，拒绝浏览器 Origin，不吃全局 CORS） | `server/mcp/http.js`、`server/index.js:61-63` |
| 参数校验→`-32602`（类型/范围/长度/枚举/多余字段），未知工具→`-32602`，结果带 `structuredContent` | `server/mcp/createMcpServer.js:55,114,130` |
| 公网部署整组禁用 | `server/mcp/localProjects.js:20`（`ERR_MCP_LOCAL_ONLY`） |

## 只读工具（8）

| 工具 | 必填 | 关键可选 | 注意 |
|---|---|---|---|
| `pinax_project_list` | — | — | 只列注册表中的本地文件夹，不返回浏览器缓存书 |
| `pinax_project_open` | — | `projectPath`/`projectId` 至少一个 | 不写注册表、不改文件 |
| `pinax_project_context` | 同上 | — | 轻量索引：章节标题、大纲节点、世界书摘要、约束清单；正文另读 |
| `pinax_chapter_list` | 同上 | `limit` | 按文件名排序，返回序号/标题/字节数，不含正文 |
| `pinax_chapter_read` | 同上 | `index`/`title`、`offset`、`maxChars`（默认 2 万，夹在 1000–20 万） | 单文件 >2MB → `ERR_FILE_TOO_LARGE`；无章节 → `ERR_NO_CHAPTERS` |
| `pinax_worldbook_list` | 同上 | `type`、`limit`（默认 300） | 不含正文 |
| `pinax_worldbook_read` | 同上 | `id`/`name`、`maxChars` | 缺 id 与 name → `ERR_ENTRY_REQUIRED`；查不到 → `ERR_ENTRY_NOT_FOUND` |
| `pinax_outline_read` | 同上 | `maxNodes` | 只有 `大纲.md` 时返回 warning，不编造节点 |

## Agent / 专家（3）

| 工具 | 必填 | 边界 |
|---|---|---|
| `pinax_agent_ask` | `question`（≤4000 字，超 → `ERR_QUESTION_TOO_LONG`） | 任务类型只允许只读档（`effectPolicy` 非只读 → `ERR_ASK_TASK_NOT_READONLY`）；advisor 地址必须回环（否则 `ERR_ADVISOR_TARGET_INVALID`）；上下文预算 `max(2000, min(profileMax, 请求值, AGENT_CONTEXT_MAX_CHARS))`；`timeoutMs` 夹在 5000–上限，默认 180000 |
| `pinax_expert_list` | — | 默认不返回提问模板，`includePrompt:true` 才给 |
| `pinax_expert_invoke` | `expertId` | 只读；要落稿另走 `pinax_chapter_write` |

专家是**纯数据**：`server/mcp/experts/registry.js:14` 明确拒绝 `hooks/toolChain/tools/kernelBuilder/knowledgeScope` 字段，
`maxChars` 缺省取 profile 或 16000（`registry.js:112`）。自定义专家放应用数据目录 `experts.json`，同 id 覆盖内置、`disabled` 停用。

## 写入工具（4 + 1 提案）

| 工具 | 写哪里 | 上限 | 幂等语义 |
|---|---|---|---|
| `pinax_project_init` | `.pinax/project.json` + `KIND_TEMPLATES[kind]` 骨架目录，并登记注册表 | kind ∈ novel/screenplay/generic | 已有 marker 时 `created:false`，原样返回、不改动任何文件（`imports.js:96`） |
| `pinax_rule_write` | `约束/<名称>.md` | 8 个文件 / 单文件 5 万字（`ERR_RULE_LIMIT`/`ERR_CONTENT_TOO_LARGE`） | 同名同内容复用；不同 → `ERR_RULE_EXISTS`，需 `overwrite:true` |
| `pinax_worldbook_write` | `世界书/<分类>/<名称>.md`（character→人物、location→地理、organization→势力、event→编年、source→资料、其他→设定） | 单条 20 万字；`type` 必须 `/^[a-z][a-z0-9_-]{0,31}$/`（否则 `ERR_TYPE_INVALID`） | 同名或同 id 内容不同 → `ERR_ENTRY_EXISTS`；默认 id `mcp/<projectId>/<name>` |
| `pinax_chapter_import` | `正文/NNN-标题.md`（3 位序号，缺省取最大序号+1） | 单章 50 万字、共 500 章（`ERR_CHAPTER_LIMIT`）；`chapterNumber` 必须 1–500 | 同序号同内容复用；不同 → `ERR_CHAPTER_EXISTS` |
| `pinax_chapter_write` | `<项目>/.pinax/proposals/<时间>-ch<序号>-<哈希>.json`（`pinax-proposal@1`） | 提案正文 20 万字 | 与原文相同 → `ERR_PROPOSAL_UNCHANGED`；缺章节 → `ERR_CHAPTER_REQUIRED`；**绝不改 `正文/`、大纲、manifest** |

写入工具的 annotations：`readOnlyHint:false, destructiveHint:true, idempotentHint:true`（`pinax_project_index` 是 `destructiveHint:false`，它只写派生缓存）。

## 整目录导入（1）

| 工具 | 写哪里 | 关键参数 | 注意 |
|---|---|---|---|
| `pinax_project_import` | 按类别分发到 `正文/大纲/世界书/约束/构思/资料/日志` | `sourcePath`（绝对、非项目本身）、`dryRun`（**默认 true，只出计划**）、`overwrite`、`maxFiles`（默认 400，上限 2000）、`include`/`exclude`（子串过滤）、`worldbookMode`（`strict` 默认 / `wrap`） | 源目录永远只读；认不出类别的文件进 `skipped` 并带 `reason`，不替作者编号；单文件 2MB、单轮总量 32MB |

分类契约（`server/mcp/projectImport.js`）：

| 源形态 | decision | 落点 |
|---|---|---|
| `正文/第N章-标题.md`、`故事主体/卷一/第NNN章-标题/小说.md` | chapter | `正文/NNN-标题.md`（序号取自文件名、章节目录名或正文开头任一命中） |
| 章节目录里的 `剧本/分镜/导演小记/提示词.md` | material | `资料/章节衍生/<章>/<名>.md` |
| `世界书/**/<条目>.md` 合契约 v2 | worldbook | `世界书/<分类>/<name>.md`（走 `pinax_worldbook_write`，保留作者 id） |
| 同上但 frontmatter 是 JSON 方言（kit 常见） | worldbook[wrap] | 同上，`wrap` 模式才导；`name` 取 `frontmatter.title`，`type` 取文件名前缀（人物/地理/势力/编年/资料/设定） |
| `世界书/00-*.md`、`README/纪律/台账/章账/索引/知识图谱` | auxiliary | `资料/世界书辅助/<名>.md`（不进条目集） |
| `规则|约束/<名>.md`（单层） | rule | `约束/<名>.md`（走 `pinax_rule_write`，8 个/5 万字上限照旧） |
| `大纲/outline.json`（须有 `nodes` 数组） | outline-json | `大纲/outline.json` |
| `大纲/**.md`、`构思|素材|资料|日志/**.md` | outline/idea/source/log | 同名目录保留层级 |
| 含 `docId`+`chunks[]` 的 JSON | source-json | `资料/归档/<名>.json`（索引器认这个格式，别的 JSON 一律不导） |
| `世界书/graph.json`、`世界书/manifest.json` | skip `graph-owned-by-indexer` | 由索引器按条目重建，导入会污染 `worldbookRevision` |
| 图片/音视频/字体/压缩包/PDF、非文本、无类别目录 | skip（带 reason） | 留在源目录 |

## 知识面（RAG）两件套（2）

| 工具 | 动作 | 边界 |
|---|---|---|
| `pinax_project_index` | `action:"status"`（默认，只读：算当前 revision、比对 `.runtime/data/knowledge/<projectId>/*/coverage.json`，给 `verdict` = fresh/stale/never-indexed/inputs-rejected/runtime-missing）；`action:"sync"`（走既有索引链触发编译并复核） | sync 需要①本机知识内核已装（否则 `KNOWLEDGE_RUNTIME_MISSING`）②项目已登记（否则 `ERR_PROJECT_NOT_REGISTERED`）③本机 Pinax 服务可达（否则 `ERR_KNOWLEDGE_UNAVAILABLE`/`ERR_KNOWLEDGE_TIMEOUT`）。只写派生缓存，项目文件夹不动 |
| `pinax_knowledge_search` | `verb` ∈ `kb_search`/`worldbook_search`/`kb_read`，转发 `/api/knowledge/*` 只读动词 | 非白名单动词 → schema 层 `-32602`；`kb_read` 的 `ref` 不接受绝对路径与 `..`；不带项目参数时是**全局知识面**，结果不等于本书（报告里如实标）；上游 `STALE_INDEX`/`KNOWLEDGE_LIMIT` 原样透出 |

`timeoutMs` 默认 60000、上限 180000；`k`/`maxChars` 与上游同上限（30 / 20000）。
正文与大纲不在 RAG 输入集：`pinax_project_index` 再新鲜也查不到正文，引正文要用 `pinax_chapter_read` 或 `pinax_agent_ask`。

## 路径与身份拒绝（读写通用）

`ERR_PROJECT_REQUIRED` / `ERR_PATH_NOT_ABSOLUTE` / `ERR_PATH_INVALID`（含 `..`）/ `ERR_DIR_NOT_FOUND` /
`ERR_NOT_LOCAL_PROJECT`（缺 `.pinax/project.json`，浏览器缓存项目一律此错）/ `ERR_SPEC_MISMATCH`（范式≠`pinax-project@1`）/
`ERR_PROJECT_NOT_FOUND`（注册表查不到该 projectId/bookId）。

## 冒烟

```bash
npm run smoke:mcp        # 工具行为
npm run mcp:conformance  # 协议与格式合规
DAMENG_SOURCE=/原稿/大梦 npm run mcp:dameng   # 《大梦》真稿端到端（含源目录哈希守卫）；源目录必须显式给，缺了 exit 2
```
