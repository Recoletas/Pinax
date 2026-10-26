# hook / 子 agent / 其他 skill 的适配约定

## 一、hook

**仓库事实**：Pinax 自己不执行 agent hooks。

- 专家配置是纯数据，`hooks/toolChain/tools/kernelBuilder/knowledgeScope` 一律被拒
  （`server/mcp/experts/registry.js:14`，命中即 `:78` 记为不支持字段）。
- MCP 只暴露工具，没有 `notifications/*` 之外的 hook 语义，也没有「写完自动触发」的服务端回调。
- 因此 hook 只可能挂在宿主 agent（Qoder / Claude / Cursor）侧。**宿主 hook 不归 Pinax 保证**，
  适配时必须假设它随时不生效，不能把正确性押在 hook 上。

允许的 hook 形态（只读或只跑门禁）：

```jsonc
// 示例：项目打开/导入前刷新状态卡（只读，安全）
{ "PostToolUse": [{ "matcher": "pinax_project_init|pinax_chapter_import",
                    "hooks": [{ "type": "command",
                                "command": "node agent-skills/project-bootstrap/scripts/project-state.mjs \"$PINAX_PROJECT_PATH\"" }] }] }
```

禁止的 hook 形态（任一条即视为越界，直接删掉该 hook）：

- 写作者目录、移动/删除原稿、批量改 `世界书/` 或 `正文/`。
- 自动 `git commit` / `git push` / 部署 / 重启 3001、5173、8451。
- 自动调用模型生成正文并落稿（生成必须走作者授权的 `pinax_chapter_write` 提案链，且作者看过才决定）。
- 把 hook 的输出当验证结论——hook 只是提示，验证仍要跑 `SKILL.md` §6 的门禁。

## 二、子 agent 派单

派单必须自带四件东西，缺一就自己补：

1. **状态**：`project-state.mjs <绝对路径> --json` 的原文或其关键计数（不要只说「项目有点乱」）。
2. **写权限白名单**：明确允许写的目录（默认只允许测试副本；作者原目录写 `forbidden`）。
3. **边界**：只服务本地路线；不动前端、不改既有路由、不重启服务、不提交。
4. **取证要求**：结论必须来自回读磁盘（`ls`/`wc`/`sha256sum`/`Read`），
   **不接受自报字数或「回读一致」作为证据**；子 agent 里不要用 `SearchWorkspace`（该工具在委托子 agent 内不可用）。

模板：

```
目标：<一句话，例如「把 大梦 的 6 条规则导入到测试副本的 约束/，并核对状态卡」>
输入状态：<project-state --json 摘要或粘贴>
可写路径：<隔离测试目录>/<副本项目>（作者原稿目录只读，禁止写入）
禁止：commit/push、部署、重启服务、改前端、改原稿、伪造大纲/SQLite/RAG
交付：1) 实际写入的文件清单（相对路径）2) 跑过的命令与 exit code 3) 未验证项与原因
```

验收子 agent 产物时：先核身份再核条数（同名文件不等于同内容），并单独跑一次状态卡确认它没顺手改别处。

## 三、与其他 skill 的叠加顺序

| 情况 | 叠加 |
|---|---|
| 改动落到世界书子系统（导入、context builder、服务端读写） | `worldbook-workflow` |
| 准备宣告完成 | `testing-verification` |
| 影响文档 / 状态 / 计划 / 已知问题 | `docs-status-handoff` |
| 改 `AGENTS.md` / `agent-skills` / `.agents` / `.claude` shim | `agent-maintenance` |
| 要提交 | `commit-conventions`（且必须有作者明确指令） |
| UI 效果需要实拍评审 | `effect-showcase`（本 skill 路线不产 UI） |

分工原则：`project-bootstrap` 只负责**项目状态定性、写入节奏、派生索引口径**；
判据归属其他 skill 时不覆盖它们的结论，一轮里按上表顺序依次执行。

## 四、给「别的 agent 也能用」的最小接入

其他 agent（Cursor/Claude/脚本）要复用本范式，只需要三样东西：

1. MCP：stdio `node server/mcp/index.js`，或本机 `POST /mcp`（只 POST、拒绝浏览器 Origin）。
2. 状态卡：`node agent-skills/project-bootstrap/scripts/project-state.mjs <绝对路径> --json`（零依赖，除本仓模块）。
3. 本 skill 的三份 reference 作为口径约束（尤其 RAG 的拒绝语义与 SQLite 的「派生、不由 MCP 伪造」）。

没有第 3 条时，最常见错误是把 `正文/` 当 RAG 输入、把空 `project.sqlite` 当项目损坏、
以及把同名副本当「两条独立设定」重复导入——这三类都会在状态卡里显式报出来。
