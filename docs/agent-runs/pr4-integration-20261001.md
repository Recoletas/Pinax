# PR #4 接入与修复（2026-10-01）

## 结果

作者授权合并后由 Pinax 维护者继续修复。PR 冻结 HEAD：`4f9bb707d2402efe28d3dc07dd9ab2b4297a2777`。基于 main `ebaebc56`，在 `/tmp/pinax-pr4-integration-20261001` 合入该 PR 并补完下面的代码修复；正式助手与完整文件/RAG 不在本次接入范围。

| Worker | 写入范围 | 结果 |
|---|---|---|
| assistant_polish | beta 面板、面板状态模块、选书状态与激活接线 | 已实施；四文件 ESLint exit 0 |
| settings_polish | adapter server.ts / store.ts | 已实施；root 静态审查与类型检查通过 |
| secondary_polish | 双份 bridge/类型、包版本范围与 CI | 已实施；静态复审后端未发现新增阻断 |
| Codex | 集成、独立作品选择来源复审、文档、构建、提交与 WIP 衔接 | 本地检查通过；merge 提交 `41d4063f` 已推送 main |

## 修复

- **真实作品归属**：beta 使用写作页接受激活后发布的只读作品 ID，不再使用世界书 ID，也不以记忆观察器的项目切换作为选书。两本书共用世界书仍各有自己的会话、输入、引用、运行槽位和帧计数；资料读取本书绑定的世界书快照。
- **追问和载入**：activeTaskId 成为响应式状态，首轮完成及载入历史会话后，发送会使用恢复接口。状态只在面板挂载期间分书管理，没有另建持久化框架。
- **切书与迟到结果**：每次执行固定作品、任务 ID、回答对象、控制器和请求资源。流片段、工具状态、结果、错误和清理都回原执行；A→B→A 也不通过当前数组索引定位旧输出。旧书可继续运行，回去可查看或取消；新书有自己的运行状态。
- **真实取消**：首发取消等待 task.started 登记，最长 10 秒；取消请求使用独立控制器，最长 15 秒。服务端等待任务包装执行的终态落盘后返回 stopped/status/taskId，bridge 校验确认；失败不掐正文流或谎报停止。取消 HTTP 仍在途时不释放前端槽位，避免同 taskId 追问被迟到取消击中。取消确认指本运行器已结束、落盘并向模型发出 abort，不保证外部 provider 的 Promise 或远端计费已完全结束。
- **恢复归属和互斥**：读完请求后再检查并独占 taskId；重复新建不覆盖旧任务。恢复保留原 bookId 和 createdAt，拒绝换书；旧无归属任务只能继续保持无归属。恢复先落 running，完成后仅释放自己的执行槽位。
- **列表与桥**：任务列表先按作品筛选再取限额，前端列表响应有序号保护。默认 SSE 解析也处理任务生命周期；失败、取消、中止与断流不冒充成功。两份 JS 与类型声明逐字一致。
- **CI**：新增 adapter 独立安装与 typecheck job；Node 范围为 `>=22.19.0 <23`，package/lock 一致。保留现有根项目 CI，没有新增测试代码或测试步骤。

Beta 仍默认关闭，保留既有 template/CSS；没有把 beta 作为正式助手，也没有变更正文/设定的写入采用流程。

## 本轮检查

| 命令或核对 | 实际结果 |
|---|---|
| adapter `npm ci --ignore-scripts` | exit 0，94 packages |
| adapter `npm run typecheck` | exit 0 |
| `npm run build` | exit 0，12.17s |
| `npm run lint:delta` | exit 0，0 error / 2 存量 warning |
| `npm run architecture:check` | exit 0；Authoring 10,898 行 / 117 imports，cycles 0 |
| `npm run architecture:build-size` | exit 0；Authoring 1,442,164 bytes / 1,450,000 上限 |
| `npm run docs:build` | exit 0，4.05s |
| bridge 与 panelSessionState 的 Node 语法检查 | exit 0 |
| 双份 JS / d.ts 字节比对 | 一致 |
| `git diff --check`（PR HEAD 到集成树） | exit 0 |
| 完整 main 基线到集成 HEAD 的 `git diff --check` | CRLF 属性修订后 exit 0 |

本轮未新增或手动运行测试、smoke、eval、verify:full、真实模型、服务或浏览器场景；上述检查不等于运行时回归或真实渠道验收。原 PR 已有测试文件作为贡献代码随合并保留，没有改写这些文件，也没有用旧测试报告代替本轮证据。

## 完整合并空白检查

完整 main 基线到合并树首次检查发现 104 个 vendor 文件的 22,491 处 CRLF 被默认规则视为行尾空白。新增仅覆盖 `vendor/storyflow-kit/` 的 `whitespace=cr-at-eol`，把 CR 作为换行组成部分，其余空白检查保留；该目录 Markdown 沿用原仓库允许硬换行的规则。没有改写或删减第三方对照源码。按 [Git 官方属性说明](https://git-scm.com/docs/gitattributes#_checking_whitespace_errors)配置后，完整范围再次检查为 0 处问题。此前只检查最新 PR 修订，不能作为全量引入的空白门禁证据。

## 原工作区与发布

原 main 的 110 个 WIP 文件先完整备份到 `/tmp/pinax-pr4-root-wip-20261001`（文件副本、哈希清单与 binary diff），隔离修复期间核对内容未变。接回 main 时只协调 STATUS/LOG 的交接条目，保留助手、整体 UI 和媒体功能的未提交改动；这些 WIP 不随本 PR 提交到远端。

实际 merge 提交：`41d4063f5a3b17474414f78b5fec2fdb5bf4fd81`，双父提交为 main `ebaebc56` 和 PR `4f9bb707`。`git push origin HEAD:main` exit 0，原工作区 main 随后快进到同一提交。

本地构建日志：`/tmp/pinax-pr4-build-20261001.log`。本次授权范围为合并与修复，不部署服务器；生产版本未更新。

## 推送后核对

GitHub 确认 PR #4 已 merged，合并提交为 `41d4063f`；该提交的 [main CI](https://github.com/Recoletas/Pinax/actions/runs/36835335947) 已 completed / success（由 Actions API 实际查询）。本轮没有手动执行测试；既有 CI 自动检查按原工作流运行。

与原 UI WIP 组合后的根工作区 `npm run build` exit 0（13.38s）、`npm run lint:delta` exit 0（0 error / 2 存量 warning）、`npm run architecture:check` exit 0（Authoring 10,900 行 / 119 imports，cycles 0）。原 108 个非交接 WIP 文件字节未变，STATUS/LOG 的原文档改动已保留并协调。组合构建日志：`/tmp/pinax-pr4-combined-build-20261001.log`。未部署。
