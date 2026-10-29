# Status

<!-- 多 session 共享短期状态；长期历史见 docs/LOG.md，完整路线见 docs/PLAN.md。 -->

## 当前安排

| Owner/session | Worktree | Branch | Scope |
|---|---|---|---|
| Codex / 2026-10-29 合入 PR #8（MCP 工具面 + 专家团 + project-bootstrap） | 主工作区 | `main`（PR #8 头 `be9d387`） | 贡献者（Qoder）按作者共识只做本地项目路线、只改 Agent 部分、不动前端，交付 19 个 MCP 工具（服务版本 0.5.0）：8 个只读工具 + 本机 `/mcp`（stdio 与 Streamable HTTP）、`pinax_agent_ask` 复用既有 advisor、专家注册表与 3 位内置专家、`pinax_chapter_write` 只写 `.pinax/proposals/`、填充与整目录导入（默认 dryRun）、RAG 状态/同步与只读检索，以及内置 skill `project-bootstrap`（只读状态卡 + RAG/SQLite 范式）。本轮由 Codex 集成：两路只读评审各报 3 项/1 项必须修并全部修复（写路径 realpath 包含性、`pinax_project_init` 空目录闸、只读工具不再触发镜像事务回滚、smoke 门禁区分 passed 与 skipped 不再「说谎」）。本机门禁：`verify:full` exit 0（20 文件/200 例、应用与文档构建通过）、`smoke:mcp` 142 passed / 2 skipped（跳过的两条是无知识内核的 RAG 建索引与检索命中）、`mcp:conformance` 40 项 0 失败、`mcp:dameng` 71 项 0 失败（**合成语料**，非《大梦》真稿）。本机未装知识内核、未配模型：RAG 真命中与回答质量仍未验证；未部署公网、未重启本地服务。提交 `b67331a` 已推送 main（`c2d1e5a..b67331a`），server-version 按分支模型快进同步到同一提交并推送（`34582be..b67331a`）；**生产机上的 nginx 配置未改**，`location /mcp { return 404; }` 要在下次部署时同步。 |
| Codex / 2026-10-25 集中提交 | 主工作区 | `main` | 10-21～24 助手原生会话、工具执行、候选保留/采用、设定同步及写作上下文/方法修复集中交付；完整门禁200/200、集成35/35、应用27.58s/文档7.69s，exit0。文学质量仍有反例，详见LOG；本轮不部署公网、不重启本地服务。 |
| Codex / 2026-10-20 集中发布 | 主工作区与隔离发布目录 | `main` → `server-version` | 作者已授权集中提交、推送及公网部署。verify:ci exit 0（20 文件/200 例、StoryAgent 30/30、应用/文档构建、两条浏览器旅程）；完整运行包已本机构建，交付 smoke 62 项通过。已提交并推送 main `0d54a1cb`，生产分支 `34582be5` 已推送并上线。前端/运行包本机构建上传；公网 health 新能力齐全、静态哈希一致、页面无异常。配置及 25 份任务日志哈希保持一致，旧代码和运行包有备份；本地用户服务未重启。作者随后要求把 server-version 合回 main，已无冲突整合生产启动器与 Nginx 配置；本轮 verify:full exit 0（20 文件/200 例、StoryAgent 30/30、应用和文档构建通过），随合并提交推送 main。 |
| Codex / 2026-10-20 漫画连续镜头与宣传片 | 主工作区 | `main` | 已本地修正当前镜头优先、局部/空镜上下文、分镜 direction 保留、普通与精修共用参考、本书及绑定设定库归属、晚到结果不覆盖新视觉规则；独立漫画页撑满宽度。verify:full exit 0（20 文件/200 例，StoryAgent 30/30，Vite 23.44s、文档 6.12s）。10 次真实图片请求含不合格尝试，选用手部特写/无人空镜/人物参考末格，第四格背影远景仍未完全遵守。已补拍并合成 v19，130.1 秒/4K，H3 首尾与音轨保留，完整解码 exit 0。亮暗/390 已看；用户服务未重启；本轮纳入作者授权的集中发布。 |

## 当前事实

- **发布基线**：main 功能 `0d54a1cb`，生产适配 `34582be5`，2026-10-20 已推送并部署；前端与完整 StoryAgent 运行包均在本机构建上传，服务器复用依赖，无安装/构建。配置与 25 份任务日志保留。详见[发布回执](./agent-runs/release-20261020.md)。
- **工作区**：项目混合目录、默认分类、中央资源标签、主/旁区、原可编辑双栏已接入。首页最近打开只列作品；打开正文展开目录，回首页保留显隐。扩展仅为可信内置视图注册，没有外部插件市场；本地新界面不再把内置工作台列为已安装扩展。
- **助手**：只读/审阅/自动修改及范围授权已接线；正文生成复用推演链，建议进入原文审阅；每份校验完成的候选即时保留，后续失败不抹掉完整稿，采用先等本地收尾及远端停止。编辑提问、重答、换参数留在原会话并保留最多 8 版；fork 始终另开对话。运行任务 ID 不等于会话 ID。需要作者决定时，结构化问题显示在对话中，候选保留且不自动采用，回答后原任务续接。原生Pi会话与自动/手动压缩已在本机启用；压缩不清空可见消息或另开任务。
- **MCP（本机）**：共 19 个工具（服务版本 0.5.0）。批次1 本地项目只读 8 个；批次2 `pinax_agent_ask` 按任务 profile 装信封调既有 `/api/advisor/task`；批次3 专家注册表与 3 位内置专家（纯数据，应用数据目录 `experts.json`，拒绝 hooks/代码字段）；批次4 `pinax_expert_list/invoke` 与 `pinax_chapter_write`；批次6 新增 `pinax_project_init`、`pinax_rule_write`、`pinax_worldbook_write`、`pinax_chapter_import`，用于把作者已有的项目骨架、约束、世界书与正文填入本地项目；批次8 新增 `pinax_project_import`（吃任意作者稿子目录，按类别分发到 `正文/大纲/世界书/约束/构思/资料/日志`，默认 `dryRun` 只出计划、源目录永远只读）、`pinax_project_index`（`status` 只读盘点 revision/新鲜度，`sync` 走既有索引链；只写派生缓存）与 `pinax_knowledge_search`（只读转发 `/api/knowledge/*` 三动词）。Agent 改写仍只落 `<项目>/.pinax/proposals/`，不改正文/大纲/项目清单；填充与导入工具默认不覆盖已有文件。只认 `.pinax/project.json` 文件夹，浏览器缓存书拒绝；公网整组禁用；未改前端与既有路由行为。批次9 起本机知识内核已按 pinned commit 装好并在《大梦》隔离副本实测：`index action:"sync"` 判 `fresh`（28 卡片），`pinax_knowledge_search` 的 `kb_search`/`worldbook_search` 都返回带原文摘录的真命中。批次5 已收口，批次6/8 用《大梦》真稿验证，详见[核对文档](./plan/mcp-expert-group-review-20261026.md)、[真稿与合规测试](./plan/mcp-dameng-fill-and-conformance-20261026.md)、[批次8 交付核对](./plan/mcp-batch8-import-index-search-20261026.md) 与[批次9 知识内核核对](./plan/mcp-batch9-knowledge-runtime-20261026.md)。 **2026-10-29 集成补充**：该 PR 以 `be9d387` 进入 main，并按评审修掉 4 类问题——写工具落点改为 realpath 包含性复核（项目内符号链接不再能把写入带出项目根）、`pinax_project_init` 补空目录闸（不再在作者既有目录落 `.pinax/`）、标注只读的工具不再触发镜像事务回滚（有残留事务日志时类型化拒绝，由应用决定回滚）、`smoke:mcp` 把「缺内核」记为 skip 而不是 pass。公网面：`/mcp` 仍由 `PINAX_PUBLIC_ORIGINS` + 回环 + Host + Origin 四道守卫挡住，并新增「拒绝经反代转发的请求」，nginx 配置显式 `location /mcp { return 404; }`。
- **内置 skill `project-bootstrap`（批次7）**：本地项目文件夹初始化/导入/重构与 RAG、SQLite 增量更新/矫正/重构的统一范式，配只读状态卡脚本 `agent-skills/project-bootstrap/scripts/project-state.mjs`（先盘点再动手）。三份 reference 固化 19 工具矩阵、派生索引真实边界与 hook/子 agent 适配约定（批次8 已同步：整目录导入节奏、RAG 的 MCP 入口只是包装）；`.agents`/`.claude` shim 与 `AGENTS.md` 硬规则行已注册。状态卡的 RAG revision 与服务端 `collectKnowledgeSources()` 逐字节一致（《大梦》42 文件、测试副本 19 文件两处实测 MATCH），对作者目录跑只读证明前后文件集合 sha256 不变。它只做诊断与建议，不写文件；本机知识内核已于批次9 装好并实测可检索（28 卡片/命中带摘录），但本机仍无模型配置，回答质量仍是未验证项。详见[交付核对](./plan/project-bootstrap-skill-20261026.md)。
- **设定**：中央标题与自由正文，属性按需展开；右栏同类、场景与经历、表格、关系和管理，关系图在右侧。底栏提供正文提及和名称插入。旧固定分区保留在创作基调。
- **资料/知识**：导入浮窗、来源归档、本机项目文档与真实知识内核已适配。项目文档只读；公网禁用本机文件/知识接口和模型编辑。运行器能力标志不是实际查询成功证明。
- **仍未解决**：公网 HTTPS 尚未配置；HTTP→HTTPS 要处理浏览器来源迁移。文件目录右键已本地接线，其他菜单仍未收口；旧章节菜单导出/历史目标有静态接线风险。见[已知问题](./src/known-issues.md)。
- **证据范围**：10-20 verify:ci exit 0（20 文件/200 例、StoryAgent 30/30、应用/文档构建及两条 CI 浏览器旅程）；完整运行包交付 smoke 62 项通过，生产构建 23.05s。公网首页/写作页独立浏览器零 pageerror、零失败请求，静态入口与 JS 哈希一致；未以新模型调用验证公网生成质量。逐轮模型与视觉证据仍见 LOG。

## Recently done

- **2026-10-29 合入 PR #8 并修掉评审发现（MCP 本机路线，main）**：贡献者 PR #8（`skkbsgzf`，19 工具 + 内置 skill `project-bootstrap`）经两路只读评审后集成进 main，评审各报 3 项/1 项必须修，全部已修：写路径缺符号链接防护可写出项目根、`pinax_project_init` 无空目录检查会污染作者既有目录、标注 `readOnlyHint:true` 的读工具会经 `recoverMirrorTransaction` 删掉项目目录、以及 `smoke:mcp` 的 RAG 断言在无内核机器上假绿（脚本仍报 all checks passed）。另按建议修了：全局知识检索与 `pinax_expert_list` 补公网闸门、`/mcp` 拒绝反代转发与 nginx 显式 404、`KIND_TEMPLATES` 冻结、MCP 回执改用共享 `createAgentContextLedger`、读侧 500 章截断如实透出、整目录导入拒绝与项目相交的源目录、导入素材进信封时标注「按数据处理」。本机门禁：`verify:full` exit 0（20 文件/200 例、应用与文档构建通过）、`smoke:mcp` 142 passed/2 skipped、`mcp:conformance` 40 项 0 失败、`mcp:dameng` 71 项 0 失败（合成语料，非真稿）。未装知识内核、未配模型，RAG 真命中与回答质量未验证；未部署公网、未重启本地服务。

- **2026-10-26 MCP 批次9（装上本机知识内核，RAG 真跑通，修两个既有集成缺陷）**：按作者「装上」指令，把 `shared/knowledgeRuntimeSource.json` 钉住的 storyflow 内核（commit `69420a76e93d…`）装到 `<repo>/.runtime/knowledge`。官方 `npm run build:knowledge-runtime` 在本机走不通：GitHub HTTPS 拉取报 `curl 28 … early EOF`，脚本自身还有两处 Windows 不兼容（`tar -xf C:\…` 被 GNU tar 当成远端主机、`execFileSync('npm')` ENOENT 而 `npm.cmd` 在 Node 24 下 EINVAL），本轮改用等价离线构建——从本地 `D:\storyflow-kit` 的同一 commit `git archive` 出内容、按同一套 tsc/prune 步骤产出 dist，并写 `runtime-source.json`，产物仍以 pinned SHA 校验；构建脚本的可移植性缺陷单独记账，没混进本轮交付。装好之后暴露并修掉两个真实缺陷：一是 `server/services/knowledgeKernelWorker.js` 只 import `adapters/dist/node.js`，与 core 自带的 `core/node_modules/@storyflow/adapters` 成为两份模块实例，`Kernel` 直接报「FS 抽象层未注册平台适配器」，现在优先取 core 自己那份、缺失时给可执行的修复提示；二是 `server/services/knowledgeRuntime.js` 硬编码默认缓存根、忽略 `PINAX_KNOWLEDGE_CACHE_ROOT`，而 MCP 侧按环境变量读 coverage，结果是 sync 真建了索引、`pinax_project_index status` 却永远判 `never-indexed`。门禁随之改成按环境判定：`smoke:mcp` 的 sync/检索两项在未装内核时接受类型化拒绝、装了就必须真成功；`mcp:dameng` 把知识三项移进真服务块，让 MCP 子进程与临时服务共用同一份 `PINAX_APP_DATA` 与缓存根，并自动探测可用 Python（Windows 的 `python3` 常是商店存根）。实测证据（《大梦》隔离副本，原稿只读）：RAG 输入 28 文件、revision `6298e5f8fb21…`，`action:"sync"` 判 `verdict=fresh`、28 张卡片、`cacheKey 1f33d0cf8b23…`、`compilerCommit 69420a76e93d…`、warnings 为空；`kb_search 柯秒` 命中 3 条，首位「人物·柯秒（冷穿越剧版）」带原文摘录与 provenance；`worldbook_search 柯秒` 返回 3 条结构化条目。门禁：`mcp:dameng` 72 项 0 失败、`smoke:mcp` 全过、`mcp:conformance` 40 项 0 失败、eslint 0 问题、`lint:delta` 无新增 error、`architecture:check` 与 `verify:contract`（20 文件/200 例）exit 0。诚实边界：内核装好证明的是「能编译、能命中、链路不断」，不证明排序与回答质量——本机仍无模型配置，端到端断言只到「有卡片、有命中、命中含关键词」这一层。`.runtime/` 是生成物、已被 `.gitignore` 覆盖，不进提交。交付前清理：`mcp:dameng` 不再内置作者机器默认路径——`DAMENG_SOURCE` 必填（缺失/非目录/无 `故事主体/卷一` 一律 exit 2），运行副本缺省落 `os.tmpdir()/pinax-dameng-e2e`，内置 skill 的委托模板同步去掉盘符；清理后重跑 72 项仍 0 失败。未部署、未改前端、未重启服务。详见[批次9 知识内核核对](./plan/mcp-batch9-knowledge-runtime-20261026.md)。

- **2026-10-26 MCP 批次8（补 MCP：整目录导入 + RAG 同步/检索）**：按作者「补mcp」指令，工具 16 → **19**，`MCP_SERVER_VERSION` 0.5.0。新增 `pinax_project_import`（`server/mcp/projectImport.js` 重写 539 行）——吃任意作者稿子目录，按「顶层目录定类别 + 文件形态细分」分发到 `正文/大纲/世界书/约束/构思/资料/日志`：章目录只认散文主文件占 `正文/NNN-标题.md` 槽位、附属稿进 `资料/章节衍生/`，`规则/`与`约束/`收敛到标准 `约束/`，`大纲/outline.json` 缺 `nodes[]` 只记账不编节点，世界书默认 `strict` 不合契约 v2 不导、`worldbookMode:"wrap"` 仅用作者原文包成契约 v2，`世界书/graph.json|manifest.json` 与非 `docId+chunks[]` 的 JSON 一律不导（会被索引器整次拒绝或污染 revision），二进制与认不出类别的文件进 `skipped` 带 `reason`；默认 `dryRun:true` 只出计划，源目录永远只读。另新增 `pinax_project_index`（`status` 复用 `collectKnowledgeSources()` 算 revision 并比对 `.runtime/data/knowledge/<projectId>/*/coverage.json` 给 verdict；`sync` 走既有索引链，只写派生缓存）与 `pinax_knowledge_search`（只读转发 `/api/knowledge/*` 三动词，非白名单动词 schema 层 `-32602`），二者是包装不是第二套引擎，**没有写 RAG 的接口**。证据：eslint 0 问题；`smoke:mcp` 118 项、`mcp:conformance` 40 项 0 失败、`mcp:dameng` 70 项 0 失败全 exit 0——《大梦》原目录（只读）一次导入成完整项目：计划覆盖 `{outline:1, idea:1, material:6, chapter:3, rule:6, auxiliary:2, worldbook:13, source:1}`，落盘 **33 created / 0 failed**（正文 3 章、13 条契约世界书、6 约束、大纲/构思/资料/衍生），重跑 0 created / 33 reused 幂等，原稿目录树 sha256 前后一致（`1b150f67cae8…`），`index status` 给 `verdict=runtime-missing`、RAG 输入 28 文件、revision `30f39ac47e5d…`，`sync`/`search` 如实返回 `KNOWLEDGE_RUNTIME_MISSING` 而非假成功或空结果；`lint:delta`、`architecture:check`、`verify:contract`（20 文件/200 例）均 exit 0。已知限制：本机无知识运行时与无模型配置，检索质量与回答质量仍未验证（运行时缺口已于同日批次9 补上并实测）；分类是规则不是语义，改名条目不判重复。内置 skill `project-bootstrap` 的 SKILL.md 与 `mcp-tool-matrix.md`、`rag-sqlite-boundaries.md` 已同步到 19 工具。未部署、未改前端、未重启用户服务。详见[批次8 交付核对](./plan/mcp-batch8-import-index-search-20261026.md)。

- **2026-10-26 MCP 批次7（内置 skill `project-bootstrap`）**：新增 `agent-skills/project-bootstrap/`（SKILL.md 160 行 + 只读状态卡脚本 460 行 + 三份 reference），并注册 `.agents`/`.claude` ASCII shim 与 `AGENTS.md` 硬规则行；`eslint.config.js` 的 `nodeFiles` 增补 `agent-skills/**/scripts/*.{js,mjs,cjs}`。状态卡覆盖 marker/spec、标准目录、正文、大纲、双规则目录、世界书契约与跨目录同名重复（含「同名不同字节」判别）、RAG 输入/revision/新鲜度/整次拒绝条件、旧 `.kb` 差异、SQLite 完整性与行数，并给分级建议；`--json` 机器可读，非法路径 exit 2。证据：revision 与真函数 `collectKnowledgeSources()` 两处实测一致（42/19 文件）；作者目录 86 文件 `%T@ %s %p` 集合前后 sha256 不变（只读）；合成裸稿目录与不存在路径行为正确。门禁：eslint 该目录 0 问题、`lint:delta` exit 0、`architecture:check` exit 0、`smoke:mcp` 109 项、`mcp:conformance` 39 项、`mcp:dameng` 54 项（源稿三章哈希未变）、`verify:contract` 20 文件/200 例、`docs:build` 4.88s 均 exit 0；`verify:full` 因无 `.git` 仍不可跑，已逐项等价替代。已知限制：只诊断不写入、本机无知识运行时与无模型配置故检索/回答质量未验证、同名判定不覆盖改名条目、未新增 MCP 工具（`pinax_project_import`/`pinax_project_index`/`pinax_knowledge_search` 当时仍未批准，已由同日批次8 补齐）。未部署、未改前端、未重启用户服务。

- **2026-10-26 MCP 批次6（本机填充工具 + 真稿测试）**：新增 `server/mcp/imports.js` 与 `tools/importTools.js`，工具增至 16 个。`pinax_project_init` 建 `.pinax/project.json` 与骨架目录；`pinax_rule_write` 写 `约束/`（8 文件/5 万字上限）；`pinax_worldbook_write` 按契约序列化到 `世界书/<分类>/`，默认不覆盖、同内容复用；`pinax_chapter_import` 写 `正文/NNN-标题.md`。全部只认本地项目文件夹，公网/非项目目录/`..` 路径拒绝。协议侧修正：未知工具与非法入参改为 `-32602`，成功结果补 `structuredContent`，无状态 HTTP 的 `GET`/`DELETE` 改 405、非法协议版本改 400，`/mcp` 跳过全局 CORS，长世界书名支持短词命中。证据：`smoke:mcp` 109 项；《大梦》真稿端到端 54 项（6 约束、13 世界书、3 章、内容哈希一致、提案不改原稿、源稿哈希不变）；协议合规 39 项（官方 SDK + HTTP 探针）；eslint 0 错误。真实 advisor 可达但本机无模型，未验证回答质量。未部署、未重启用户服务。

- **2026-10-26 MCP 批次5（收口）**：五批完成，MCP 与专家团按作者共识只覆盖本地项目路线、只动 Agent 部分、不动前端。收口内容：`docs/plan/mcp-expert-group-review-20261026.md` 补齐文件清单、门禁矩阵、七条已知限制、接入方式与回滚步骤；本文件同步当前事实与下一步。门禁逐项跑绿：`smoke:mcp` 86 项、`verify:contract` 20 文件/200 例、`verify:storyagent` 30/30、`catalog-sync` 21/21、`bridge-sync` 0 失败（2 项环境跳过）、`architecture:check`、`architecture:build-size`（1,379,978/1,450,000）、`lint:delta`（0 新错误）、`docs:build` 均 exit 0。`verify:full` 因本副本无 `.git`（其 `git diff --check` 子步无法执行）未跑，已用逐项等价门禁替代并如实记账。已知限制：工作副本无模型配置，未做真实模型调用；仅本地路线，无远程 MCP；写权限仅 review。未部署、未重启用户服务。

- **2026-10-26 MCP 批次4（专家工具与审阅写回）**：工具增至 12 个，新增 `pinax_expert_list`、`pinax_expert_invoke`、`pinax_chapter_write`。写权限按作者裁定固定 review：提案只写 `<项目>/.pinax/proposals/<时间>-ch<序号>-<哈希>.json`（`pinax-proposal@1`，含目标修订、原文/新文字数、备注、专家与 requestId 溯源），正文/大纲/世界书/项目清单不动，MCP 不生成正文、不触发推演链。同章节同内容复用、与原文相同拒绝、缺章节拒绝、公网禁用、写入失败均 typed error。证据：smoke 86 项全过（含写提案七项与专家六项）；真服务集成 12 工具、提案落盘且原稿 sha256 前后一致、专家 invoke 打穿真实 advisor、localmirror 接口仍 200；eslint、architecture、vitest 20/20 文件 200/200、build exit 0。未做真实模型调用（工作副本无模型配置）。未部署、未改前端。

- **2026-10-26 MCP 批次3（专家注册表）**：新增 `server/mcp/experts/registry.js`。专家是纯数据（id/name/role/taskType/prompt/context/maxChars），没有 hooks、toolChain 或可执行代码；内置润笔大师、编剧顾问、资深读者三位，任务类型全部过只读白名单与预算上限。配置从应用数据目录 `experts.json` 读取，缺失不创建；同 id 覆盖内置、`disabled` 停用、新 id 作为扩展，非法条目只记 warning 跳过。`context.chapter` 支持 auto/last/none，模板含 `{question}` 替换、否则附在末尾。证据：smoke 66 项全过（含 20 项专家用例与打穿 stub advisor 的上下文核对）；eslint、architecture、vitest 20/20 文件 200/200、build exit 0。未做真实模型调用（工作副本无模型配置）。未部署、未改前端。

- **2026-10-26 MCP 批次2（Agent 只读问答）**：新增 `server/mcp/agentAsk.js` 与 `tools/agentTools.js`。`pinax_agent_ask` 按任务 `contextProfile` 的块白名单与顺序组装 envelope（与 `agentContextResolver` 同优先级口径），再调既有 `/api/advisor/task`；只读白名单为 `authoring.knowledge.query`（默认）/`authoring.review.chapter`/`authoring.next-actions`，其余任务与公网/非项目目录/非回环 advisor 地址均 typed error。stdio 用 `PINAX_SERVER_URL`（默认 127.0.0.1:3001），`/mcp` 按监听端口回环调用同一服务。证据：smoke 46 项全过（含 stdio 与 `/mcp` 两条轨、预算自洽、默认末章、只读拒绝、4xx/5xx/超时/未启动映射）；真服务集成验证 `/mcp` 打穿到真实 advisor 路由（临时端口与数据已清理），既有 localmirror 接口仍 200；eslint、architecture、vitest 20/20 文件 200/200、build exit 0。未做真实模型调用（工作副本无模型配置）。未部署、未改前端。

- **2026-10-26 MCP 批次1（本机只读）**：新增 `server/mcp/`（stdio 入口、本机 Streamable HTTP、8 个只读工具）与 `scripts/mcp-smoke.mjs`；`server/index.js` 仅增加一处 `/mcp` 挂载，SDK 缺失时 503 不影响启动。只服务本地项目文件夹；非项目目录/缓存 bookId/`..` 路径/公网环境均 typed error；拒绝浏览器 Origin。逐轮门禁见 [MCP 与专家团核对](./plan/mcp-expert-group-review-20261026.md)。

- **2026-10-21 助手批量建议（本地）**：工具成功后本地交付，分批8/整轮32；权限拒绝不再转正文，M3/Anthropic 使用 adaptive，中断帧不再原样续跑，已生成批次保留为未完成文字。原生 pi + 本机模拟接口 13 条两次调用、拒绝一次；浏览器采用/撤销13条、中断不可自动采用均已观察。仅8451更新，68份日志与配置保留。构建与完整证据见 LOG，不代表真实供应商质量验收。

- **2026-10-21 助手修复（本地）**：新建 ID 两处避重并重新校验权限，不覆盖旧条目；思考/工具层级间距收口；更多菜单提供手动压缩上下文，保留原消息及会话，失败/取消不换摘要，编辑旧问题停用旧摘要。8451 按作者本轮授权更新，配置及 67 份任务哈希保留。构建和静态检查通过，隔离页面观察见 LOG；未跑自动测试、未推送或部署。

- **2026-10-20 分支回并**：按作者追加指令，将 `server-version` 的生产启动器、Nginx 配置及历史完整合入 main，保留 main 最新发布回执。无冲突；本轮 verify:full exit 0（20 文件/200 例、应用/文档构建和差异检查通过）。线上运行内容没有因此变化，无需重启。

- **2026-10-20 公网发布**：10-16～20 累积功能、文档、统一模型选择、助手提问/队列与漫画连续镜头修复已集中推送。生产 `34582be5`；新运行器 requestModels / assistantUserInput / assistantSteering 均为 true，公网本机文件和模型编辑仍禁用。配置/日志完整；发布未触发回滚，本地 5173/3001/8451 未重启。详见本轮发布回执。

- **2026-10-19 集中交付（main）**：草稿恢复与持久化、助手权限/原位修改、目录整合、漫画工作流和文档界面收为功能提交 `4ec02931`；手册与 25 张截图、架构/排障说明及轻量宣传资料另作文档提交。完整门禁 exit 0；源代码与文档分组后集中推送。大型宣传生成产物不入库，生产未部署。

- **2026-10-16 文档更新（main，本地）**：对照发布实现修正目录、助手会话与权限、设定/资料、知识接入和运行包说明；英文核心手册同步。旧状态归档保留证据，当前栏目不再重复历史流水。文档构建与链接/格式检查通过；不把历史功能测试当成本轮执行。

- **2026-10-15 发布（main/server-version）**：前后端及协议 2 运行器已更新；静态哈希、健康、来源校验和本机接口隔离已检查，配置哈希保持一致。旧依赖和产物备份保留。当地用户的 5173/3001/8451 未因本次公网部署重启。
- **2026-10-13～15 UI 与助手整理**：目录默认分类、设置编辑/右栏、会话版本、纯图标工具、首页显隐、中性材质及文案减量随 `cb6ee525` 发布。逐轮检查只代表当时范围，原始记录已归档，不再以“仅本地”列为当前安排。

## Earlier integration history

此前集成事实、计数和临时环境观察保存在[历史状态快照](./archive/status-through-20261015.md)和 [LOG](./LOG.md)。需要追查时读取具体日期，不要按旧快照覆盖当前实现。

## Earlier handoff history

旧会话交接同样在[历史状态快照](./archive/status-through-20261015.md)。长期 owner、保存和权限边界以[当前架构](./engineering/current-architecture.md)为准；当时的 PID、截图临时路径、未部署声明不代表当前运行状态。

## Next up

1. 10-22 原生会话本轮已获授权并更新3001/8451，79份任务日志与配置保持，5173未动；会话、压缩代理与配置/日志核对完成。模型长期质量和浏览器委托任务的跨刷新恢复仍单独保留；公网保持10-20发布。
2. 公网 HTTPS：证书/续期/来源配置与用户 HTTP 数据导出恢复一起安排，不能直接强制跳转后让用户误以为丢稿。
3. 文件目录菜单已接线；后续单独处理旧章节顺序菜单的导出/历史目标，不能以目录改动代替其验收。
4. 真实模型质量、真机输入、Windows clean-machine、联机外部 pilot 等未完成门禁仍独立保留；不要把旧整份夜间计划当新任务重新启动。
5. MCP 本机路线已随 PR #8 于 2026-10-29 进 main（19 工具 + `project-bootstrap` skill），评审发现的 4 类必须修问题已修；本机门禁 `verify:full` exit 0、`smoke:mcp` 142 passed/2 skipped、`mcp:conformance` 40/0、`mcp:dameng` 71/0（合成语料）。仍开着的质检缺口：①本机未装知识内核也未配模型，RAG 真命中与 `pinax_agent_ask`/`pinax_expert_invoke` 回答质量未抽查（需作者配模型后跑一次）；②作者《大梦》原目录的处置未定（13 组同名世界书原文/副本、`规则/` 与 `约束/` 并存）；③整目录导入目前只在合成语料与作者的测试副本上验证过，原稿未动；④本机 `mcp:dameng` 的断言是按《大梦》真实形态写死的，在没有真稿的机器上只能以合成语料等价验证。详见 [MCP 与专家团核对](./plan/mcp-expert-group-review-20261026.md) 与 [批次9 知识内核核对](./plan/mcp-batch9-knowledge-runtime-20261026.md)。

## Working rules

- 作者 2026-10-22 明确：角色、设定、大纲这类同级编辑区保持无框、随内容伸展；修共享样式时一起检查同类界面，优先修共用规则，不用单页补丁和额外逻辑堆叠。

- 作者 2026-10-23 明确授权：本地开发修复需要时自动更新并重启受影响的服务，不再逐次确认；保留配置和任务记录，尽量避开在途任务，仅操作需要更新的服务。公网部署仍按明确发布指令执行。
- 检查按实际改动范围选择：做必要的定向验证，不机械重跑全套、不重复已通过且未受影响的检查；启用已验证产物以服务健康和原配置/数据保留为准。
- 不回滚其他用户 WIP；提交和推送按作者已授权的完整功能／每日集中节奏执行，部署仍需明确指令。
- 作者 2026-10-19 明确：提交应覆盖完整、有规模的功能或修复，避免细碎提交；push 大致每天集中一次，作者明确要求立即推送时按当次指令执行。这不是无人值守定时任务或自动部署授权。
- 新功能进入现有主计划，不创建平行产品路线。历史验证不冒充当前执行。
- 模型经明确合同、预算、权限和恢复路径参与系统，不直接写正式数据；自动修改也走授权和修订检查。
