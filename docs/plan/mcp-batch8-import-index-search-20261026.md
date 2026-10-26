# MCP 批次8：整目录导入 + RAG 同步/检索三件套（2026-10-26）

## 结论

按作者指令「补mcp」补齐了批次6/7 遗留的写入口缺口。MCP 工具从 16 个增至 **19 个**：

- `pinax_project_import` —— 吃**任意作者稿子目录**，按类别分发到 `正文/ 大纲/ 世界书/ 约束/ 构思/ 资料/ 日志/`。
  这补上了此前如实上报的限制：「写工具只有 4 个，`大纲/ 构思/ 资料/ 日志/` 没有写入口」。
- `pinax_project_index` —— RAG 的 `status`（只读盘点 revision/新鲜度/拒绝原因）与 `sync`（走既有索引链触发编译并复核）。
- `pinax_knowledge_search` —— 只读转发既有 `/api/knowledge/{kb-search,worldbook-search,kb-read}` 三个动词。

《大梦》原目录（只读）现在一次调用即可建成完整项目：**33 个文件落盘、0 失败**（3 章 + 13 条契约 v2 世界书 + 6 约束 + 大纲/构思/资料/章节衍生），
重复内容自动收敛，源目录树 sha256 前后一致，重跑幂等（0 created / 33 reused）。

本轮仍只动 Agent 侧：未改前端、未改既有路由行为、未提交、未部署、未重启用户的 3001/5173/8451。

## 交付物

| 文件 | 作用 |
|---|---|
| `server/mcp/projectImport.js`（重写，539 行） | 分类契约 + 目录遍历 + 受控写入：`importFolder({projectPath,projectId,sourcePath,dryRun,overwrite,maxFiles,include,exclude,worldbookMode})` |
| `server/mcp/knowledgeIndex.js`（新增） | `snapshotKnowledge`/`indexProject`/`searchKnowledge`：复用 `collectKnowledgeSources()`、`.runtime/data/knowledge/<projectId>/*/coverage.json` 与 `/api/knowledge/*` 只读动词；`KNOWLEDGE_TOOL_LIMITS` |
| `server/mcp/tools/importTools.js` | 上架 `pinax_project_import`（写注解、`dryRun` 默认 true、`sourcePath` 必填） |
| `server/mcp/tools/knowledgeTools.js`（新增） | 上架 `pinax_project_index`（`destructiveHint:false`，只写派生缓存）与 `pinax_knowledge_search`（`readOnlyHint:true`） |
| `server/mcp/createMcpServer.js` | 工具表 19 项、`MCP_SERVER_VERSION = 0.5.0`、INSTRUCTIONS 增加「整目录导入节奏」与「RAG 是文件目录的派生投影」两条 |
| `agent-skills/project-bootstrap/**` | SKILL.md §2 增补整目录导入节奏与硬约定、§3 诚实边界改为「MCP 入口只是包装」；`references/mcp-tool-matrix.md` 升到 19 工具并修正 annotations 事实；`references/rag-sqlite-boundaries.md` 新增「MCP 侧入口」表 |
| `scripts/{mcp-smoke,mcp-conformance,dameng-mcp-e2e}.mjs` | 新增批次8 用例；工具清单改为外部契约硬校验 |

## 分类契约（为什么不是「把所有 md 塞进正文」）

`CATEGORY_BY_DIR` 先按顶层目录定类别（`正文/大纲/世界书/规则|约束/构思/资料|素材|参考|归档/日志`），再按文件形态细分：

- **正文**：章目录（`第001章-延迟/`）内的散文主文件（`小说.md|正文.md|原稿.md|初稿.md` 或 `第X章…md`）才占 `正文/NNN-标题.md` 槽位；
  同目录的 `导演小记.md` 这类附属稿走 `资料/章节衍生/<章>/<名>.md`，不抢编号。中文数字（「第002章-倒带」）经 `parseChapterNumber` 归一。
- **世界书**：默认 `strict` —— 不合 `shared/worldbookFileContract.js` v2 的条目只记账（`worldbook-not-conform`）。
  `worldbookMode:"wrap"` 只在作者 frontmatter 是可解析 JSON 方言时，用**原文**包成契约 v2（名取 `title`，kind 由文件名前缀映射 `人物→character` 等），不改内容。
- **规则/约束**：`规则/` 与 `约束/` 收敛到标准目录 `约束/`，同名同内容复用，嵌套（>1 层）只记账。
- **大纲**：`大纲/outline.json` 有 `nodes[]` 才导入，缺 nodes 如实 skip（不替作者编节点）；`大纲/*.md` 原样进 `大纲/`。
- **不导的东西**（索引器会整次拒绝或污染 revision，宁可不导）：`世界书/graph.json|manifest.json`（`graph-owned-by-indexer`，由索引器重建）、
  不满足 `docId + chunks[]` 的 `资料/归档/*.json`（`json-invalid`/`json-not-routed`）、二进制（`binary-not-importable`，含 pdf/docx/图片/字体等）、
  认不出类别的目录（`unmapped`）。
- **源目录永远只读**，写入只走项目文件夹白名单目录（首段白名单 + resolve + 大小写不敏感包含校验），相对路径、含 `..`、把项目本身当源，均 typed error。

## 诚实边界

- RAG 唯一事实源仍是 `世界书/ 资料/ 规则/ 约束/ 文风/` 的文件；`pinax_project_index action:"sync"` 只是触发既有编译链，**没有「直接写 RAG」的接口**。
- `正文/` 与 `大纲/` 不进 RAG 输入集，索引再新鲜也查不到正文；读正文用 `pinax_chapter_read`。
- 本机知识运行时未安装（`.runtime/knowledge/core/dist/verbs.js` 缺失），所以 `sync` 与 `search` 在本机返回 `KNOWLEDGE_RUNTIME_MISSING`，
  `status` 仍可用。装运行时需要网络 + Python + 作者批准（`npm run build:knowledge-runtime`），**本轮没装，因此实际检索质量仍是未验证项**。
- `pinax_knowledge_search` 不带项目参数时是全局知识面，结果不等于本书；上游 `STALE_INDEX`/`KNOWLEDGE_LIMIT` 原样透出，不降级成「查无资料」。

## 验证（本轮逐条实跑）

| 门禁 | 结果 |
|---|---|
| `npx eslint server/mcp scripts/mcp-*.mjs scripts/dameng-mcp-e2e.mjs agent-skills/project-bootstrap` | exit 0，0 问题 |
| `npm run smoke:mcp` | exit 0，**118 项全过**（新增批次8：计划默认只读、决策覆盖、strict 跳过世界书、graph 归索引器、wrap 命名与落点、落盘零失败、章目录只认散文主文件、衍生件进 `资料/`、源目录只读、幂等、`ERR_FILE_EXISTS`、回读计数、outline 2 节点、规则收敛为 1、index verdict 白名单、status 不写文件、sync/search 返回 `KNOWLEDGE_RUNTIME_MISSING`、非法 verb → `-32602`、相对源路径拒绝、项目当源拒绝） |
| `npm run mcp:conformance` | exit 0，**40 项 / 0 失败**（工具数 19 派生自 `MCP_TOOLS`、批次8 三工具在架、写工具注解含 `pinax_project_import`/`pinax_project_index`） |
| `npm run mcp:dameng` | exit 0，**70 项 / 0 失败**（`大梦-全量`：计划覆盖全类别 `{outline:1, idea:1, material:6, chapter:3, rule:6, auxiliary:2, worldbook:13, source:1}` → wrap 计划 → 落盘 33 created/0 failed → 正文 3 文件 `001-第001章.md|002-延迟.md|003-倒带.md` → 衍生件进 `资料/章节衍生/{第001章,第002章-延迟}` → `project_open` 回读 chapters=3/worldbook=13/outlineNodes=0 → 6 约束 → 13 条世界书可读 → 重跑 0 created/33 reused/0 failed 幂等 → 原稿目录树 sha256 前后一致（`1b150f67cae8…`）→ `pinax_project_index status` 给出 `verdict=runtime-missing`、RAG 输入 28 文件、revision `30f39ac47e5d…` → `sync` 与 `search` 均返回 `KNOWLEDGE_RUNTIME_MISSING`，不冒充空结果） |
| `npm run lint:delta` | exit 0，无新增 error |
| `npm run architecture:check` | exit 0 |
| `npm run verify:contract` | exit 0，20 文件 / 200 例 |

`verify:full` 本副本仍不可跑（无 `.git`，其 `git diff --check` 子步无法执行），按上表逐项等价门禁记账。

## 已知限制

1. 分类是**规则**而非语义：认不出类别的文件只记账（`skipped.reason`），不猜、不替作者改名；脏字符（如目录名 `第001章 “`）只在生成副本里由 `safeSegment` 清噪，原稿不动。
2. 单轮上限：源文件 400 个（`maxFiles` 可调至 2000）、单文件 2MB、累计 32MB；超限记 `over-limit`/`file-too-large`/`total-too-large`，不静默截断。
3. `worldbookMode:"wrap"` 只对 JSON frontmatter 方言有效；纯手写世界书仍需人工或 `pinax_worldbook_write` 按契约补。
4. 同内容收敛按规范化文本比对；改名条目（`人物-柯秒.md` vs `人物·柯秒（剧版）.md`）不会被判重复，属语义层人工核对。
5. 本机无知识运行时、无模型配置：RAG 检索质量与 `pinax_agent_ask` 回答质量本轮仍未验证；`pinax_project_index` 只证明了 revision 口径与状态判定。
6. `sync` 的前置条件是①运行时已装②项目已登记③本机 Pinax 服务可达，任一不满足给 typed error，不会伪造成功。

## 接入方式

```bash
node server/mcp/index.js                     # stdio（PINAX_SERVER_URL 默认 http://127.0.0.1:3001）
# 或本机 POST /mcp
```

```jsonc
{ "name": "pinax_project_import",
  "arguments": { "projectPath": "D:/Pinax-e2e/大梦-全量", "sourcePath": "C:/Users/.../大梦",
                 "dryRun": true, "worldbookMode": "wrap" } }

{ "name": "pinax_project_index", "arguments": { "projectPath": "…", "action": "status" } }
{ "name": "pinax_knowledge_search", "arguments": { "projectPath": "…", "verb": "kb_search", "q": "柯秒" } }
```

## 回滚

删除 `server/mcp/projectImport.js`、`knowledgeIndex.js`、`tools/knowledgeTools.js`，
把 `createMcpServer.js` 的 `...knowledgeTools` 与 `pinax_project_import` 条目、版本号回退，
再还原 skill 文档与本文件、`docs/STATUS.md` 对应条目即可；既有 16 个工具的行为未改，无数据回滚。
`D:\Pinax-e2e\run-1793016671560\` 等测试副本可随时删除，作者原目录未受影响。
