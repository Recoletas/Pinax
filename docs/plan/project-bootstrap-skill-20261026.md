# 内置 skill：project-bootstrap（MCP 批次7 · 2026-10-26）

## 结论

本轮按作者裁定交付「伴随合入的内置 skill」：`agent-skills/project-bootstrap/`。
它把本地项目文件夹的初始化/导入/重构，与 RAG、SQLite 在**任何状态下**的增量更新、矫正、重构收敛成一套可复用范式，
并附带一个只读状态卡脚本作为唯一入口。全程只动 Agent/skill 侧，未改前端、未改既有路由行为、未提交、未部署、未重启服务。

配套的一条基础设施修正：`eslint.config.js` 的 `nodeFiles` 增加 `agent-skills/**/scripts/*.{js,mjs,cjs}`
（内置 skill 自带的可执行脚本同样跑在 Node，否则 `process` 报 `no-undef`）。

## 交付物

| 文件 | 作用 |
|---|---|
| `agent-skills/project-bootstrap/SKILL.md`（160 行） | 范围硬边界 → 状态卡 → 定唯一真源 → MCP 写入节奏 → RAG 同步/矫正/重构决策表 → SQLite 口径 → hook/子 agent/skill 叠加 → 验收门禁 → 禁止清单 |
| `agent-skills/project-bootstrap/scripts/project-state.mjs`（460 行） | 只读状态卡：marker/spec、标准目录、正文字数、大纲结构化、双规则目录、世界书契约与重复、资料、RAG revision/新鲜度/拒绝条件、旧 `.kb` 差异、SQLite 完整性与行数、分级建议。`--json` 机器可读；路径缺失 exit 2 |
| `references/mcp-tool-matrix.md` | 16 个工具的必填项/上限/幂等语义/typed error 与传输门禁（stdio、`/mcp`、`-32602`、`structuredContent`） |
| `references/rag-sqlite-boundaries.md` | RAG 与 SQLite 的真实能力边界，逐条带 `path:line` 证据 |
| `references/hooks-and-subagents.md` | hook 允许/禁止形态、子 agent 派单模板与取证要求、与其他 skill 的叠加顺序、外部 agent 最小接入 |
| `.agents/skills/project-bootstrap`、`.claude/skills/project-bootstrap` | ASCII 指针（`../../agent-skills/project-bootstrap`，无换行），与既有 shim 同格式 |
| `AGENTS.md` 硬规则表 | 新增一行：初始化/导入/重构本地项目，或同步/矫正/重建 RAG 与 SQLite → `project-bootstrap` |

## 状态卡的关键判据（为什么不是「随便数数文件」）

- **世界书**：辅助件（`00-索引.md`、`00-知识图谱.md`、`世界书/纪律.md`、`世界书/伏笔/台账.md`、`世界书/底牌/暗线底牌.md`、`世界书/编年/章账.md`）不计条目也不计重复——
  后四条与索引器自身的排除口径一致（`server/services/knowledgeProjectIndex.js:83`）。
  重复检测按文件名跨目录比对，覆盖契约不合格文件；同名但字节不同会单独计数，用来区分「原文 + 补契约头副本」与真正的重复导入。
- **RAG revision**：复刻 `collectKnowledgeSources()` 的 include 规则、遍历排序与容量判定，
  并把符号链接/超容量如实标为 `KNOWLEDGE_SYMLINK`/`KNOWLEDGE_LIMIT`（真实索引是整次拒绝，不是跳过）。
- **SQLite**：`-wal` 非空时不打开库；只在 `mode=ro&immutable=1` 下用 Python 标准库探针（本仓 `better-sqlite3` 原生 ABI 与本机 Node 不匹配）。

## 验证（本轮逐条实跑）

| 门禁 | 结果 |
|---|---|
| `node --check` 状态卡脚本 | exit 0 |
| 状态卡 ×《大梦》原目录 | 13/26 条目合规、辅助 2、同名 13 组（13 组内容不同）、双规则目录 6+6、缺 `日志/`、RAG 输入 42 文件/174093B、`.kb` 未索引 14/失踪 0、`pinax/.pinax/project.sqlite` 65536B `integrity=ok` `project_items=0` |
| 状态卡 ×测试副本 `D:\Pinax-e2e\run-1792997124930\大梦-mcp` | 13/13 合规、无重复、6 约束、3 章、RAG 输入 19 文件、无 SQLite —— 与磁盘抽查一致 |
| revision 与真函数逐字节比对 | `collectKnowledgeSources()` vs 脚本：两处 `MATCH: true`（42 文件、19 文件） |
| 只读证明 | 作者目录 86 个文件的 `%T@ %s %p` 集合前后 sha256 一致（`981612b5…`），两次运行输出一致（确定性） |
| 合成「裸稿目录」 | 正确报 `marker missing` critical + 缺目录/同名重复警告；不存在路径 exit 2 |
| `npx eslint agent-skills/project-bootstrap` | 0 问题（修掉 1 个未使用变量、5 个 `no-undef` 经 `eslint.config.js` 覆盖解决） |
| `npm run lint:delta` | exit 0，无新增 error（存量 5 条 `no-console` warning） |
| `npm run architecture:check` | exit 0 |
| `npm run smoke:mcp` | exit 0，109 项 |
| `npm run mcp:conformance` | exit 0，39 项 0 失败 |
| `npm run mcp:dameng` | exit 0，54 项 0 失败，源稿三章哈希未变 |
| `npm run verify:contract` | exit 0，20 文件 / 200 例 |
| `npm run docs:build` | exit 0，4.88s |
| shim/frontmatter 完整性 | `.agents`、`.claude` 两侧指针均指向存在 `SKILL.md` 的 canonical 目录，`name` 与目录一致，`description` 齐备（`effect-showcase` 无 shim 是既有状态，未改动） |

`verify:full` 本副本仍跑不了（无 `.git`，其 `git diff --check` 子步无法执行），按上表逐项等价门禁记账。

## 已知限制（不许当成已完成）

1. 状态卡只做诊断与建议，**不写文件、不搬家、不改契约**；收敛真源、迁移 `规则/`→`约束/` 都必须作者点头后由人或 MCP 工具执行。
2. 本机知识运行时未安装（`.runtime/knowledge/core/dist/verbs.js` 缺失），因此 RAG 的「实际检索质量」本轮仍未验证；`stale` 判定只能证明 revision 口径正确。
3. 本机无模型配置：`mcp:dameng` 里真 advisor 可达但回 `ERR_ADVISOR_FAILED 未检测到可用模型`，回答质量属未验证项。
4. 同名重复判定按文件名，跨目录改名（如 `人物-柯秒.md` vs `人物·柯秒（剧版）.md`）不会被判为重复，需语义层人工核对。
5. 旧 `.kb` 链与 Pinax 运行时口径本就不同（含 `大纲/`、不含 `约束/`、`.kb` 目录排除方式不同），状态卡如实分列，不做统一裁决。
6. 宿主 hook 不归 Pinax 保证：本 skill 只规定允许的只读/门禁型 hook，无法验证具体宿主是否加载。
7. 未新增 MCP 工具：上一轮提出的 `pinax_project_import` / `pinax_project_index` / `pinax_knowledge_search` 仍是未批准状态，本 skill 只用现有 16 个工具与既有接口。（同日批次8 已按作者「补mcp」指令补齐这 3 个工具，共 19 个；见 [mcp-batch8-import-index-search-20261026.md](./mcp-batch8-import-index-search-20261026.md)，本 skill 的 SKILL.md 与 references 已同步。）

## 接入方式（其他 agent 复用）

```bash
node server/mcp/index.js                                                     # stdio MCP（或本机 POST /mcp）
node agent-skills/project-bootstrap/scripts/project-state.mjs "<绝对路径>" --json   # 状态卡
```

在宿主 agent 里按 `AGENTS.md` 新增的硬规则行触发 `project-bootstrap`，或直接读 `SKILL.md` 与三份 references。

## 回滚

删除 `agent-skills/project-bootstrap/`、两个 shim 文件、`AGENTS.md` 的那一行、`eslint.config.js` 里新增的一行即可；
本批未改服务端与前端代码，无需数据回滚。`D:\Pinax-e2e\` 下的测试副本（`run-1792997124930`、`run-1793008898583`）可随时删除，作者原目录未受影响。
