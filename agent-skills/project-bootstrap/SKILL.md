---
name: project-bootstrap
description: Use when initializing, importing into, refactoring, or auditing a local Pinax project folder (.pinax/project.json), or when RAG (knowledge index) or SQLite catalog must be synced/corrected/rebuilt for such a project - provides the MCP-first project bootstrap workflow and the honest capability boundaries of the derived indexes
---

# project-bootstrap

本地项目文件夹（`.pinax/project.json`）的初始化、导入、重构与派生索引（RAG / SQLite）同步的标准范式。
服务对象是「任何时候导入、任何状态」的项目目录：先盘点，再定性，再按门禁动手。

**范围硬边界**（先确认再开工，越界即停）：

1. 只服务本地项目文件夹路线。浏览器缓存书（bookId 在 localStorage）不是本项目路线，MCP 会 typed error 拒绝；不要试图绕过。
2. 公网部署整组禁用 MCP 与本机文件接口。任何「在公网跑 bootstrap」的方案都不成立。
3. 只新增、不改作者原稿。作者目录是事实源，处置一律「先备份到 `资料/`，再在测试副本上验证」，取得作者点头才动原目录。
4. 不改前端、不改既有路由行为、不重启用户服务、不提交/推送——除非作者单独下令。

## 0. 先跑只读盘点（不要凭感觉判断项目状态）

```bash
node agent-skills/project-bootstrap/scripts/project-state.mjs "<项目绝对路径>"          # 状态卡
node agent-skills/project-bootstrap/scripts/project-state.mjs "<项目绝对路径>" --json   # 机器可读
```

脚本全程只读（SQLite 仅在 `-wal` 为空时用 `immutable=1` 打开；对作者目录跑过前后指纹比对，86 个文件的 mtime/大小集合未变）。
它复刻 `server/services/knowledgeProjectIndex.js` 的输入集合与排序，所以报出的 `rag.current.revision`
与服务端 `collectKnowledgeSources()` 的 revision 逐字节一致（《大梦》原目录 42 文件 / 测试项目 19 文件两处均已实测 MATCH）。

状态卡字段 → 定性：

| 观察 | 状态 | 下一步 |
|---|---|---|
| `marker: missing` + 目录有散稿 | 裸稿目录 | 走 §1 定唯一真源 → §2 初始化并导入 |
| `marker: missing` + 空目录 | 空项目 | 直接 §2 `pinax_project_init` |
| `marker: ok` + `invalid`/`basename` 重复/双规则目录 | 半合规项目 | 先 §1 收敛真源，再 §3 同步 RAG |
| `marker: ok` + `stale: yes` | 合规但索引过期 | 只做 §3 同步，别改内容 |
| `runtime=missing` | 本机没装知识运行时 | 见 §3「诚实边界」，不许宣称 RAG 可用 |

退出码：0 正常；2 路径不存在或不是目录（不要改成 0 骗过门禁）。

## 1. 定唯一真源（判断活，代码不替作者决定）

四类内容各自只有一个真源，重复必须先收敛，否则条目、引用与 RAG 卡片会双计：

- 正文：`正文/NNN-标题.md`（3 位序号）。
- 世界书：`世界书/<分类>/<名称>.md`，分类由 `type` 决定（character→人物、location→地理、organization→势力、event→编年、source→资料、其他→设定），契约见 `shared/worldbookFileContract.js` v2。
  索引/图谱/台账类文件（`00-索引.md`、`00-知识图谱.md`、`世界书/纪律.md` 等）是辅助件，不当条目，也不算重复。
- 规则：新项目标准是 `约束/`（上限 8 个文件、单文件 5 万字）。旧 `规则/` 与 `约束/` 并存时必须点明迁移还是保留只读。
- 大纲：结构化只有 `大纲/outline.json`。没有它时 MCP 只报 warning，**不替作者编节点**。

《大梦》式历史目录的典型形态就是「平铺原文 + 子目录带契约头副本」同名两份：状态卡会同时报
`basename=13` 与 `同名不同内容 13`，处置是归档平铺原文，而不是再写第三遍。

## 2. 写入一律 MCP 优先，不手搓文件

工具矩阵（19 个工具、参数/上限/幂等语义、typed error 全表）见 [references/mcp-tool-matrix.md](./references/mcp-tool-matrix.md)。

标准导入节奏（整目录，作者稿子形态五花八门时用）：

```
pinax_project_init → pinax_project_import(dryRun:true 看计划) → 核对 items 的 decision/target
→ pinax_project_import(dryRun:false 落盘) → pinax_project_context / pinax_chapter_read / pinax_worldbook_read 回读
→ pinax_project_index(status → sync) 同步 RAG
```

标准导入节奏（作者只给片段文本时逐类单写）：

```
pinax_project_init → pinax_rule_write ×n → pinax_worldbook_write ×n → pinax_chapter_import ×n
→ pinax_project_context / pinax_chapter_read / pinax_worldbook_read 回读校验
```

`pinax_project_import` 的硬约定（别自己实现第二套分类）：源目录永远只读；默认 `dryRun:true` 只出计划；
认不出类别的文件一律进 `skipped` 带 `reason`（不替作者编号、不编类别）；世界书不合契约 v2 时
`strict` 模式只记账，只有 frontmatter 是可解析 JSON 方言才允许 `worldbookMode:"wrap"` 用作者原文包成契约 v2；
`世界书/graph.json|manifest.json` 与不符合 `docId+chunks[]` 的 JSON 一律不导（会被索引器整次拒绝或污染 revision）。

写工具的共同语义（不要自己实现第二套）：

- 幂等：同名同内容复用；内容不同默认拒绝，确认后才 `overwrite:true`。
- 只导入既有文本，**不调用模型、不生成正文**。`pinax_chapter_write` 是审阅提案，只落
  `<项目>/.pinax/proposals/pinax-proposal@1 JSON`，绝不改 `正文/` 原稿、大纲或项目清单。
- 超限（规则 8 个 / 5 万字，世界书 20 万字，正文 50 万字）与非法路径（相对路径、含 `..`）都是 typed error，
  不要吞掉或重试刷参数。

问答/评审节奏（需要模型时）：`pinax_agent_ask`（只读任务白名单）与 `pinax_expert_list` / `pinax_expert_invoke`
（专家是纯数据，没有 hooks/toolChain）。这两类需要本机 Pinax 服务在跑；服务没起或模型未配 → 如实报「未做真实模型调用」，
不要用 stub 结果冒充模型质量。

## 3. RAG：同步 / 矫正 / 重构

能力边界与真实路径见 [references/rag-sqlite-boundaries.md](./references/rag-sqlite-boundaries.md)。决策表：

| 状态卡信号 | 动作 | 说明 |
|---|---|---|
| `runtime=missing` | 先装运行时 | `npm run build:knowledge-runtime`（要网络、Python、作者批准）。没装就没有 RAG；`pinax_project_index`/`pinax_knowledge_search` 会直接给 `KNOWLEDGE_RUNTIME_MISSING`，不是「查无资料」 |
| `index=none` 且 `stale=n/a` | 首次索引 | `pinax_project_index action:"sync"`（内部走既有只读动词触发编译）；第一次会整项目编译，属正常，不是 bug |
| `stale=yes` | 同步 | 再跑一次 `action:"sync"`；索引按 revision 级复用，**任何一处内容变化都会整项目重编译**；不存在「单文档增量」 |
| `reject=KNOWLEDGE_SYMLINK` | 矫正来源 | 真实索引对符号链接是整次拒绝，不是跳过；先清链接再谈索引 |
| `reject=KNOWLEDGE_LIMIT` | 缩减来源 | 单文件 16MB / 累计 64MB / 2000 文件 / 深度 12 / 500 卡片，任一超限即拒绝，必须拆资料而不是调大闸门 |
| `basename` 重复未清 | 先收敛真源再重建 | 否则副本会被编成两份卡片，检索与引用双计 |
| `409 STALE_INDEX` | 重新同步 | 调用方带的 `expected.*` 与 coverage 不一致；重取 coverage 后再检索，别当空结果解释 |

诚实边界（必须原样带进结论，不许省略）：

- RAG 输入只有 `世界书/ 资料/ 规则/ 约束/ 文风/`。**正文与大纲不进 RAG**。查不到正文内容不是「资料缺失」，是设计如此，用 `pinax_chapter_read` 读。
- 索引是**一次性投影**：写缓存目录 `<repo>/.runtime/data/knowledge/<projectId>/<cacheKey>/`，不动作者目录。
  cacheKey 还含运行时 commit 与 lockSha256，换运行时版本会让旧索引失效。
- 检索动词只读：`/api/knowledge/kb-search`、`kb-read`、`worldbook-search`。MCP 侧的 `pinax_knowledge_search` 与
  `pinax_project_index` **只是这三个动词与既有索引链的包装**，不是第二套引擎；没有「直接写 RAG」的接口，不要伪造。
  RAG 的唯一事实源仍是 `世界书/ 资料/ 规则/ 约束/ 文风/` 里的文件——要改知识面就改文件，再 `action:"sync"`。
- 能力标志（runner capability flags）不是实际查询成功的证明；只有真跑一次检索并核对命中文件与 provenance 才算验证过。

## 4. SQLite：只当派生目录看

`<项目>/.pinax/project.sqlite` 属 **Electron 桌面工程内核**（`electron/projects/projectDatabase.mjs`），
表只有 `project_items(kind ∈ volume/chapter/reference)` + `file_transactions` + 迁移记录，
条目只由 `electron/migration/legacyProjectImporter.mjs` 插入。**服务端与 MCP 都不读写它**，所以：

- 空库（`integrity=ok`、`project_items=0`）是正常骨架，不是项目不完整，更不是「必须补数据」的理由。不要用 MCP 伪造行。
- 需要目录数据时走桌面端导入/迁移；MCP 路线的项目可用性以文件为事实源，不依赖该库。
- 世界书与规则在该 schema 里没有对应 kind——不要宣称「SQLite 已覆盖全项目」。
- 只读取库：`-wal` 非空时先让桌面端 checkpoint，别在带 WAL 的库上做只读探针（会写出 `-shm` 时间戳）。
- 本机 `better-sqlite3` 原生模块 ABI 与仓库依赖不一致，探针请用 Python 标准库 `sqlite3`（脚本已内置该路径）。

## 5. hook / 子 agent / 其他 skill 的适配约定

细则与模板见 [references/hooks-and-subagents.md](./references/hooks-and-subagents.md)。要点：

- **hook**：Pinax 侧不执行 agent hooks——专家注册表显式拒绝 `hooks/toolChain/tools/knowledgeScope` 等可执行字段
  （`server/mcp/experts/registry.js:14,78`）。宿主 agent（Qoder/Claude）可以挂 hook，但只允许两类：
  跑盘点脚本（只读）与跑门禁命令；任何 hook 不得写作者目录、不得自动 commit、不得重启服务。
- **子 agent**：派单必须带（a）状态卡或其 `--json`、（b）允许写的目录白名单（测试副本优先）、（c）要求回读磁盘取证，
  不信自报字数/「回读一致」。子 agent 不能用 SearchWorkspace，别让它去找主 agent 才有的工具。
- **其他 skill**：`worldbook-workflow`（改世界书子系统）、`testing-verification`（宣告完成前）、
  `docs-status-handoff`（影响文档/状态时）、`agent-maintenance`（改 skill/shim 时）按各自触发条件叠加，
  本 skill 只负责「项目状态定性 + 派生索引口径」，不接管它们的判据。

## 6. 验收（每轮都要跑，缺项如实记账）

```bash
npm run smoke:mcp          # MCP 工具冒烟
npm run mcp:conformance    # 协议/格式合规（ToolSchema、-32602、structuredContent、HTTP 405/400/403、无 CORS/无会话头）
npm run mcp:dameng         # 《大梦》真稿端到端（含源目录哈希守卫）
npm run lint:delta
npm run architecture:check
npm run docs:build
```

外加两条本项目专属：

1. 作者目录只读证明：动笔前后各跑一次
   `find "<作者项目目录>" -type f -printf '%T@ %s %p\n' | sort | sha256sum`，两次一致。
2. 状态卡一致性：`--json` 的 `worldbook.parsed/total`、`rag.current.files`、`sqlite.databases[].read.project_items`
   与磁盘实况抽查一致（用 `ls`/`wc -l` 复核，不要只信脚本）。

`verify:full` 在本工作副本跑不了（没有 `.git`，其 `git diff --check` 子步无法执行）——按现状逐项等价门禁替代并写明。

交付说明必须分层：机器层（跑绿的命令与计数）／语义层（真模型调用做了什么，或明确没做）／规则库空档（哪些只静态接线、哪些未验）。

## 7. 禁止清单

- 不 `init` 已存在项目的 marker（脚本/工具会保留原文件，别手删重写）。
- 不在 `约束/` 之外的目录写规则；不把 `规则/` 与 `约束/` 混着当同一集合。
- 不把手改世界书原稿当矫正手段：备份 → 用 `pinax_worldbook_write` 按契约重写。
- 不为了「看起来完整」伪造 `大纲/outline.json`、SQLite 行或 RAG 索引结果。
- 不宣称未实测的能力；`capability flag`、构建成功、脚本 exit 0 都不等于模型侧质量。
- 不自动提交/推送、不重启用户服务、不动前端，除非作者明确下令。

## Resources

- [scripts/project-state.mjs](./scripts/project-state.mjs) — 只读状态卡（唯一入口，先跑它）
- [references/mcp-tool-matrix.md](./references/mcp-tool-matrix.md) — 19 个工具：参数、上限、幂等语义、typed error
- [references/rag-sqlite-boundaries.md](./references/rag-sqlite-boundaries.md) — RAG / SQLite 真实能力边界与 `path:line` 证据
- [references/hooks-and-subagents.md](./references/hooks-and-subagents.md) — hook / 子 agent / skill 叠加的适配约定与派单模板
