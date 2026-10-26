# RAG 与 SQLite 的真实能力边界

本页只记录**已在代码里核实**的事实，配 `path:line` 证据。任何超出本页的说法都算未验证。

## 一、Pinax 知识索引（所谓 RAG）

### 输入集合

`server/services/knowledgeProjectIndex.js:13`：

```
INPUT_DIRS = ['世界书', '资料', '规则', '约束', '文风']
```

- **`正文/` 与 `大纲/` 不在输入集内。** 检索查不到正文不是资料缺失，是设计如此 → 用 `pinax_chapter_read`。
- include 规则（`knowledgeProjectIndex.js:34`）：`.md/.txt` 全收；`世界书/graph.json`、`世界书/manifest.json` 收；`资料/归档/<单层>.json` 收；其他 json 一律不收
  （所以 `世界书/.kb/index.json` 不进 revision，但 `世界书/.kb/README.md` 会进——它只是不作为卡片：卡片构建排除 `README.md`，见 `:80`）。
- 世界书条目只有在 `parseWorldbookEntryFile()` 通过时才进 `worldEntries`（`knowledgeProjectIndex.js:83-86`），
  且 `世界书/纪律.md`、`世界书/伏笔/台账.md`、`世界书/底牌/暗线底牌.md`、`世界书/编年/章账.md` 被显式排除在条目之外——
  这就是状态卡把这批文件当辅助件、不计条目也不计重复的依据。

### revision 与缓存

- `snapshot.revision = sha256(JSON.stringify(files))`，`files` 是**按 `localeCompare` 无 locale 排序**遍历出的 `{relative, text}` 列表
  （`knowledgeProjectIndex.js:27,50`）。状态卡脚本复刻同一顺序与规则，实测与真函数逐字节一致（《大梦》42 文件、测试项目 19 文件两处 MATCH）。
- cacheKey 不只含 revision：`sha256([3, runtimeSource.commit, runtimeSource.lockSha256, root, bookId, revision])`
  （`knowledgeProjectIndex.js:58`）。**换运行时版本 ⇒ 旧缓存目录自然失效**，不是索引坏了。
- 缓存落点：`<repo>/.runtime/data/knowledge/<projectId>/<cacheKey>/`，随目录写 `coverage.json`
  （`knowledgeRuntime.js:8`、`knowledgeProjectIndex.js:59-63,128`）。
  `coverage = { projectId, bookId, projectCards, indexRevision, compilerCommit, worldbookId, worldbookRevision, indexedAt }`
  （`knowledgeProjectIndex.js:126`）。
- 作者目录是**只读事实源**，索引是一次性投影（`knowledgeProjectIndex.js:15` 注释即为契约）。

### 容量与失败方式（是拒绝，不是截断）

| 条件 | 结果 | 位置 |
|---|---|---|
| 目录含符号链接、或目录 realpath 变化 | `KNOWLEDGE_SYMLINK` 409，整次拒绝 | `:24,31` |
| 遍历深度 > 12 | `KNOWLEDGE_LIMIT` 409 | `:25` |
| 单文件 > 16MB / 累计 > 64MB / 文件数 ≥ 2000 | `KNOWLEDGE_LIMIT` 409 | `:37` |
| 卡片数 > 500 | `KNOWLEDGE_LIMIT` 409「缩小索引资料范围」 | `:96,108` |
| `资料/归档/*.json` 缺 `docId` 或 `chunks` | `KNOWLEDGE_ARCHIVE_INVALID` 409 | `:93` |

### 增量语义（最常见的误解）

「增量」只有**缓存命中**这一层：同一 revision 再请求直接复用已编译目录。
**任何一处内容变化都会整项目重编译**，不存在按单文档的 delta 更新。
所以「矫正一条世界书」的成本 = 重建一次索引，不要向作者承诺「秒级增量」。

### 运行时与检索

- 编译要 Python：`PINAX_PYTHON`（默认 `python3`）跑运行时里的 `tools/kit-compile.py` 产出 `kit/hypergraph.rag.json`
  （`knowledgeProjectIndex.js:112`；无卡片时写空图 `:113`）。
- 运行时根：`.runtime/knowledge`（`PINAX_KNOWLEDGE_RUNTIME` 可覆盖），必须有 `core/dist/verbs.js` 与 `runtime-source.json`；
  安装命令 `npm run build:knowledge-runtime`。**没装就没有 RAG**，不许用「已接入」描述。
- 检索动词只读，路由：`/api/knowledge/worldbook-search`、`/api/knowledge/kb-search`、`/api/knowledge/kb-read`
  （`server/routes/knowledge.js:111,135,153`）；检索超时 15s → `KNOWLEDGE_TIMEOUT` 504（`knowledgeRuntime.js:23`）。
- `expected.*` 与 coverage 不一致 → 409 `STALE_INDEX`（`server/routes/knowledge.js:49,85`）。
  收到它要重新同步再检索，**不能把 409 当「没有相关资料」上报**。
- 响应里的 `engine: 'storyflow'`、capability flag 只说明链路接通，不等于查询质量；查询质量要人工抽查命中卡片与 provenance。

### MCP 侧入口（批次8 起，仅包装，不是第二套引擎）

| 入口 | 实际做什么 | 证据 |
|---|---|---|
| `pinax_project_index action:"status"` | 只读：调 `collectKnowledgeSources()` 算当前 revision，比对 `<cache>/*/coverage.json`，给 `verdict` | `server/mcp/knowledgeIndex.js`（`snapshotKnowledge`/`knowledgeStatus`） |
| `pinax_project_index action:"sync"` | 走既有索引链触发编译并复核；只写派生缓存目录，项目文件夹不动 | 同上；前置条件同「运行时与检索」 |
| `pinax_knowledge_search` | 转发 `kb_search`/`worldbook_search`/`kb_read` 三个只读动词；非白名单动词在 schema 层就 `-32602` | `server/mcp/tools/knowledgeTools.js` |

硬约束：**没有「写 RAG」的接口**。要改知识面只能改 `世界书/ 资料/ 规则/ 约束/ 文风/` 里的文件（用写工具或 `pinax_project_import`），再 `action:"sync"`。
运行时未装时上述工具返回 `KNOWLEDGE_RUNTIME_MISSING`（本机现状），不是「查无资料」，也不许用 mock 结果冒充检索。

### 旧 `.kb` 链（与本仓运行时无关）

作者目录里可能还有 `世界书/.kb/`（零依赖 BM25：`build_index.py` 递归 `*.md` 覆盖 世界书/规则/大纲，产出 `index.json`、`graph.json`、`00-知识图谱.md`）。
它是**另一条链**：口径与 Pinax 运行时不同（含 `大纲/`、不含 `约束/`；只把 `00-知识图谱.md` 当生成件、并显式跳过 `.kb/`，见 `build_index.py:23,72`）。
两条链不要混用，也不要同时当「项目已索引」的证据。状态卡按各自口径比对：`.kb` 的 `notIndexed` 用 BM25 自己的文件集，
`世界书/00-索引.md` 在 BM25 里是正常条目、在 Pinax 运行时里是辅助件——差异如实存在，不算 bug。

## 二、`project.sqlite`

| 事实 | 证据 |
|---|---|
| 只属于 Electron 桌面工程内核，服务端与 MCP 不读写 | `electron/projects/projectDatabase.mjs:75-82` |
| 目录表 `project_items`，`kind CHECK IN ('volume','chapter','reference')` | `electron/projects/migrations/001-foundation.sql:6-8` |
| 另有 `file_transactions`（staged/committed/aborted 恢复）、`legacy_import*` 表 | `001-foundation.sql`、`002-legacy-import.sql` |
| 行只由桌面端迁移器插入 | `electron/migration/legacyProjectImporter.mjs` |
| **没有 rule / worldbook 的 kind** | `001-foundation.sql:8` 的 CHECK 枚举 |

推论：

1. 空库（`integrity_check=ok`、`project_items=0`）是正常骨架，MCP 路线不依赖它，**不要用 MCP 伪造行**。
2. 「SQLite 已覆盖全项目」不成立：规则与世界书在该 schema 里没有位置，它们的事实源仍是文件与 RAG 投影。
3. 只读探库：`-wal` 非空时先让桌面端 checkpoint，否则会写出 `-shm` 时间戳（本项目曾因此踩过「只读却改动目录」的坑）。
   本仓依赖的 `better-sqlite3` 原生 ABI 与本机 Node 不匹配，脚本用 Python 标准库 `sqlite3` 以
   `file:...?mode=ro&immutable=1` 打开。

## 三、标准范式（一句话）

**文件是唯一事实源；RAG 与 SQLite 都是派生投影。**
初始化/导入用 MCP 写工具（幂等、只新增），索引同步用 revision 比对，桌面目录由 Electron 迁移器负责；
三者口径不同、更新成本不同，任何汇报都要分别说明「谁更新了、谁没有、为什么」。
