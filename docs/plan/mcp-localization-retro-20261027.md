# 本地化工程复盘：Agent 走本机项目文件夹这条路（2026-10-27）

## 一、这次本地化在做什么

把 Pinax 从「浏览器缓存书」这一轨，接到「作者本机项目文件夹」这一轨上：让外部 Agent（MCP 客户端）能直接读作者真稿目录、能按标准范式把任意形态的素材装配成项目、能让知识检索在本机真跑通，而不是只会如实拒绝。

范围按作者裁定收窄到只动 Agent 侧：新增 `server/mcp/` 与 `server/index.js` 一处 `/mcp` 挂载，另加两处装机才暴露的服务侧修复；不动前端、不改既有路由行为、作者原稿只新增不修改。

## 二、交付了什么（都能回磁盘核对）

- `server/mcp/` 19 个工具，`MCP_SERVER_VERSION 0.5.0`；stdio 入口 + 本机 Streamable HTTP。只认带 `.pinax/project.json` 的目录；浏览器缓存书、`..` 越界路径、公网环境一律 typed error，不冒充空结果。
- 工具面分三层：读（项目/章节/世界书/大纲/规则/上下文 8 个 + `pinax_agent_ask` 复用既有 advisor）、专家（注册表是纯数据，拒绝 hooks/代码字段；`pinax_expert_invoke` 与 `pinax_chapter_write` 只写 `.pinax/proposals/`）、装配（`pinax_project_init` / `pinax_rule_write` / `pinax_worldbook_write` / `pinax_chapter_import` / 整目录 `pinax_project_import`，默认 dryRun 只出计划）。
- RAG 侧 `pinax_project_index` 与 `pinax_knowledge_search` 是既有 `collectKnowledgeSources()` 索引链与 `/api/knowledge/*` 三动词的包装，不是第二套检索引擎。
- 内置 skill `project-bootstrap`：任何时候导入、任何状态下增量更新/矫正/重构 RAG 与 SQLite 的范式，配只读状态卡脚本。
- 本机知识内核已装（钉在 storyflow commit `69420a76`），RAG 从「runtime-missing 如实拒绝」变成实测可用。
- 真稿《大梦》工作副本 `D:\Projects\大梦`：整目录导入 33 created / 0 failed，幂等复跑 0 created / 33 reused，源目录整树 sha256 前后一致（86 文件 / 1077933 字节），RAG `verdict=fresh`、28 张卡、`kb_search 柯秒` 命中 8 条。
- 门禁：`smoke:mcp` 全过、`mcp:conformance` 40 项 0 失败、`mcp:dameng` 72 项 0 失败、`verify:contract` 20 文件 / 200 例、`architecture:check` exit 0。

## 三、遇到的困难（按坑有多深排）

1. **官方装机脚本在 Windows 上三处不可移植**：GitHub HTTPS 大流量被限速（`git fetch --depth 1` early EOF）、GNU tar 把盘符当远端主机（`Cannot connect to C:`）、npm 是 `.cmd` 而 Node 24 禁止无 shell spawn。本轮改用本地同 commit `git archive` + `process.execPath` 调 `npm-cli.js` 绕开，脚本本身**未修**。
2. **装机暴露两处既有断链**：`knowledgeKernelWorker.js` 只 import 一份 adapters，与 core 自带的成为两份模块实例，Kernel 报「FS 抽象层未注册平台适配器」；`knowledgeRuntime.js` 把缓存根写死、忽略 `PINAX_KNOWLEDGE_CACHE_ROOT`，导致 sync 真建了索引而 status 永远判 never-indexed。这两处本轮已修。
3. **索引编译默认调 `python3`，Windows 上那是商店存根**（`knowledgeProjectIndex.js:112`）。未设 `PINAX_PYTHON` 的进程一旦需要重编译就 `KNOWLEDGE_INDEX_FAILED`；测试工装自己探测并传了这个 env，所以 72 项全绿掩盖了它，而索引命中缓存时又会假装正常。**本轮新账，未修。**
4. **两条存储轨**：服务端项目注册表与浏览器 IndexedDB 书是两本账，且 IndexedDB 按 origin 各存一份。「项目打开了」和「首页看得到书」不是同一件事，这里踩过一次。
5. **作者真稿是 kit 布局，不是 Pinax 标准布局**：正文在 `故事主体/卷一/第NNN章-章名/小说.md`。界面那条「导入书稿文件夹」只把根目录 `.md` 当书稿，于是把 `00-项目总览.md` 按二级标题切成 4 章当成小说正文，产出看起来像书其实是目录页。正解是 `pinax_project_import` 的分类映射（章节目录里的 `小说.md` → `正文/NNN-标题.md`，剧本/分镜/提示词等衍生品 → `资料/章节衍生/`）。
6. **绑定即写回原稿**：镜像层对托管子目录整体重建，非标准文件名第一次保存就会被改名重写，与「只新增不动原稿」直接冲突。所以真稿要用，先走工作副本。
7. **原生模块 ABI 换档**：`electron-forge start` 会把 `better_sqlite3.node` 重建成 Electron 档，之后纯 Node 的 `npm run server` / `doctor` 永久报 MISS；桌面与 web 两条本地路线不能同时满足，换档要 `npm rebuild`。
8. **取证环境本身**：本机工作副本不是 git 仓库，提交只能从上游 main 造；blobless 克隆里 `write-tree` 要 `--missing-ok`、push 要 `--no-thin`、`ssh.github.com:443` 间歇超时需重试。
9. **世界书双份并存**：平铺原文与分类副本同名不同内容 13 组，导入只能收契约 v2 合规的那一份，原文要逐条 `pinax_worldbook_write`。唯一真源归谁，要作者裁。

## 四、还没收口（不要当已完成）

- 本机无模型配置：`pinax_agent_ask` / `pinax_expert_invoke` 的回答质量**没抽查过**。
- 检索只断言到「有卡片、有命中、命中含关键词」，没有 recall / precision 评测。
- 工作副本三处不完美：第一章标题在原稿里就是残缺的（目录名 `第001章 “`），导入回落成 `001-第001章.md`，没替作者编标题；世界书 13 条取的是契约版而非平铺原文；`大纲/outline.json` 缺，只有 `001-004.md`。
- 公网 HTTPS 未配（Nginx 仅监听 80）；真机 Windows clean-machine、联机 pilot 仍是独立门禁。
- 上面第 1、3 条的 Windows 缺陷都只记账未修。

## 五、结论

本地化路线的**接口面**已经跑通，并且有磁盘取证支撑：任意形态的作者目录能被确定性地吃进标准项目、原稿只读可证、失败会类型化上报而不是伪装空结果。**质量面**还缺一次带真模型的抽查。合入之后，未收口项按 `docs/STATUS.md` 的当前安排继续推进。
