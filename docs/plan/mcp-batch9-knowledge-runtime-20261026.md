# MCP 批次9：本机知识内核装上，RAG 真跑通（2026-10-26）

## 结论

按作者指令「装上」，本机 `.runtime/knowledge` 已按 `shared/knowledgeRuntimeSource.json` 钉住的 storyflow commit `69420a76e93d1537891f9264d6e15e2984c534ba` 装齐，
`pinax_project_index action:"sync"` 与 `pinax_knowledge_search` 从「如实拒绝（runtime-missing）」变成「实测可用」：
在《大梦》隔离副本上 `verdict=fresh`、28 张卡片、`kb_search 柯秒` 命中 3 条且首位带原文摘录。

装的过程暴露出**两个既有集成缺陷**（不是批次8 新工具的包装层问题，是 Pinax 服务侧本来就断的地方），已在本轮修掉：

1. `server/services/knowledgeKernelWorker.js` 只 import `adapters/dist/node.js`，与 core 自带的 `core/node_modules/@storyflow/adapters` 形成两份模块实例，
   `Kernel` 报「FS 抽象层未注册平台适配器」。现在优先解析 core 自己那一份，两份都缺时给可执行的修复提示而不是半吊子堆栈。
2. `server/services/knowledgeRuntime.js` 把缓存根写死成默认路径、忽略 `PINAX_KNOWLEDGE_CACHE_ROOT`，
   而 MCP 侧按环境变量读 coverage。后果是 `sync` 真建了索引、`status` 却永远判 `never-indexed`，Agent 会以为「没索引」而反复重建。
   现在两侧同源。

本轮仍只动 Agent 侧与这两处必要修复：未改前端、未改既有检索动词的对外行为、未部署、未重启用户的 3001/5173/8451。

## 装机路径（为什么没直接用官方脚本）

`npm run build:knowledge-runtime` 在本机走不通，三个独立原因：

| 现象 | 根因 | 本轮处置 |
|---|---|---|
| `git fetch --depth 1 origin 69420a76…` → `curl 28 … early EOF` | 本机到 GitHub 的 HTTPS 大流量被限速 | 改从本地 `D:\storyflow-kit` 的**同一 commit** `git archive` 取内容（先 `rev-parse` 校验 SHA 一致、tree `f55ab965…` 一致） |
| `tar -xf C:\…` → `Cannot connect to C: resolve failed` | GNU tar 把盘符当成远端主机 | 等价脚本改用相对文件名 + `cwd=temp`；官方脚本的同一缺陷记账待修 |
| `execFileSync('npm')` ENOENT，改 `npm.cmd` 又 EINVAL | Windows 上 npm 是 `.cmd`，Node 24 禁止无 shell spawn `.cmd` | 等价脚本改用 `process.execPath + node_modules/npm/bin/npm-cli.js` |

装机产物：`core/dist`、`adapters/dist`、`contracts`、`kit/hypergraph.rag.json`、`tools/kit-compile.py`、`runtime-source.json`（含 `lockSha256`）。
`.runtime/` 已在 `.gitignore` 内，不进提交；构建脚本的可移植性缺陷只记账，没混进本轮交付。

## 真跑通的证据（可复核）

事实源：`D:\Pinax-e2e\run-1793019416563\report.json`（`npm run mcp:dameng` 产出，72 项 0 失败）。

| 检查 | 实测 |
|---|---|
| RAG 输入集 | 28 文件，revision `6298e5f8fb21…`（与 `collectKnowledgeSources()` 同源算法） |
| `pinax_project_index status` | `runtimeInstalled=true`、`verdict=never-indexed`（隔离缓存根首跑，符合预期） |
| `pinax_project_index sync` | `verdict=fresh`、`index.cards=28`、`cacheKey 1f33d0cf8b23…`、`compilerCommit 69420a76e93d…`、`warnings=[]` |
| `pinax_knowledge_search kb_search 柯秒` | 3 条命中，首位「人物·柯秒（冷穿越剧版）」，`coverage.projectCards=28`，带摘录与 provenance |
| `pinax_knowledge_search worldbook_search 柯秒` | 3 条结构化条目，`cat=人物`、`status=active`、`path=世界书/人物/…` |
| 原稿完整性 | 源目录树 sha256 `1b150f67cae8…` 前后一致，导入全程只读 |

门禁（同一环境、内核已装）：`mcp:dameng` 72 项 0 失败、`smoke:mcp` 全过、`mcp:conformance` 40 项 0 失败、eslint 0 问题、
`lint:delta` 无新增 error（存量 5 条 warning 不计门禁）、`architecture:check` exit 0、`verify:contract` 20 文件 / 200 例 exit 0。

## 门禁改成按环境判定（避免「装了反而红」）

- `scripts/mcp-smoke.mjs`：`project_index sync` 与 `knowledge_search` 两项在未装内核时接受**类型化拒绝**，装了则要求 `verdict=fresh`，
  两种环境都必须绿；核心口径不变——**不允许把失败当成空结果返回**。
- `scripts/dameng-mcp-e2e.mjs`：知识三项从 stub 块移进真服务块。原因是 `sync`/检索要经 `/api/knowledge/*`，
  而服务侧按 `projectId` 查注册表——原先 MCP 子进程与临时服务各用一份 `PINAX_APP_DATA`，必然 `ERR_PROJECT_NOT_REGISTERED`。
  现在两侧共用 appData、`PINAX_KNOWLEDGE_CACHE_ROOT` 与 `PINAX_KNOWLEDGE_RUNTIME`，并自动探测可用 Python
  （`PINAX_PYTHON` 只接受单个可执行路径；Windows 上 `python3` 常是商店存根，探不到就退化为「无内核路径」的断言）。
- 新增两项断言：`状态卡的 runtimeInstalled 与本机实况一致`、`worldbook_search 返回结构化条目`（70 → 72）。

## 交付前的机器路径清理

`scripts/dameng-mcp-e2e.mjs` 原先把作者原稿目录和 `D:\Pinax-e2e` 写成脚本默认值——别人克隆下来一跑就会在错误的目录上试。
现在源目录**必须显式给**：`DAMENG_SOURCE=/原稿/大梦 npm run mcp:dameng`，缺失/不是目录/没有 `故事主体/卷一` 一律 exit 2 并说清楚为什么；
运行副本默认落在 `os.tmpdir()/pinax-dameng-e2e/run-<ts>`，仍可用 `PINAX_E2E_ROOT` 覆盖。
内置 skill 的委托模板同样去掉了具体盘符（`agent-skills/project-bootstrap/references/hooks-and-subagents.md`），
`docs/plan/*` 与 `docs/LOG.md` 里的实测路径按仓库既有惯例保留为证据。清理后重跑：`mcp:dameng` **72 项 / 0 失败**（`run-1793022061461`，同批结论未变）。

## 诚实边界

- 内核装好证明的是「编译链能跑、检索能命中、失败会类型化上报」，**不证明排序质量与回答质量**。
  端到端断言只到「有卡片、有命中、命中含关键词」这一层，没有做 recall/precision 评测。
- 本机仍无模型配置：`pinax_agent_ask`/`pinax_expert_invoke` 走真 advisor 时得到「未检测到可用模型」，回答质量是剩下的唯一质检缺口。
- `正文/` 与 `大纲/` 不在 RAG 输入集内，检索命中只可能来自 `世界书/ 资料/ 规则/ 约束/ 文风/`；这一点没变。
- 官方 `scripts/build-knowledge-runtime.mjs` 的两处 Windows 缺陷**尚未修改**（本轮只做交付必需的两处服务侧修复），PR 里会作为已知限制列出。

## 回滚

- 两处服务侧修复可单独 revert：`knowledgeKernelWorker.js` 的适配器候选、`knowledgeRuntime.js` 的 `PINAX_KNOWLEDGE_CACHE_ROOT`；
  未装内核的机器上行为与批次8 一致（类型化 `KNOWLEDGE_RUNTIME_MISSING`）。
- 门禁改动是断言放宽/收紧，不改生产代码路径。
- `.runtime/knowledge` 与 `.runtime/data/knowledge` 是生成物，删目录即回到「未安装」状态，不影响任何原稿与既有缓存以外的东西。
