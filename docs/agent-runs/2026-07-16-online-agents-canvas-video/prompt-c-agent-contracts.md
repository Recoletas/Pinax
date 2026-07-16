# Window C Prompt - Claude Code - Agent Contracts

你负责把 Pinax 各页面零散的 Agent 基础逻辑统一为任务目录、上下文信封和结果生命周期，同时保持现有 Advisor 调用兼容。一次做完基础层和兼容改造，但不要重写大页面 UI。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读主路线图 G4.2/G4.3，以及执行包 README 的 Agent 契约。
3. 盘点 `useAdvisor.js`、前后端 `advisorTaskService.js`、`writingAgentContext.js`、`writingAgentReferences.js`、`advisorResultApplier.js` 的现状。
4. 在独立 worktree/分支工作，建议 `feature/agent-contracts`。不启动 dev server。

你的文件所有权仅限：

- `src/services/agents/**`
- `src/composables/useAdvisor.js`
- `src/services/advisorTaskService.js`
- `server/services/advisorTaskService.js`
- 你新增的定向测试文件
- 你的总结 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-c-agent-contracts.md`

必须实现：

1. `agentTaskRegistry`：集中登记执行包矩阵中的 worldbook、experience、writing、canvas/media、storyboard、comic 和 global advisor 任务；支持按 id 获取、按 surface 枚举、注册校验和未知任务错误。对当前代码里的 task 名保留显式 legacy alias，不允许页面因命名切换立即失效。
2. `agentContextEnvelope`：把 selection、当前场景、相关角色/地点、history、memory、references、style/rules 规范为带优先级和 sourceRefs 的 blocks。
3. 实现确定性预算裁剪：先保留系统规则和当前选择，再保留高相关结构化块，最后截断长文本；返回 usedChars、truncated 和 dropped block 元数据。不要再次把完整长文塞入 prompt。
4. `agentResultLifecycle`：规范 pending/completed/failed、suggestions、actions、sideEffects、baseRevision；提供 mark stale、canApply、apply acknowledgement 等纯函数。
5. 改造前端 `useAdvisor` 和 `advisorTaskService` 使用上述契约，同时保留现有公开方法、参数和返回值，使三个页面无需同批修改。
6. 改造服务端 `advisorTaskService` 接受新 envelope/result，也兼容旧 payload；服务端不信任客户端 task definition，必须从 registry/allowlist 校验 taskType。
7. 将现有 writing context/reference helper 作为 adapter 使用，不复制其逻辑；无法统一的旧字段放进明确的 legacy adapter。
8. 为后续 OpenClaw/copilot/director 接入提供薄 adapter 接口，但本轮不修改它们的实现。result 中要能区分 suggestion、structured draft、text patch、runtime candidate 和 generation request，不能把所有结果压成一段字符串。

质量要求：

- 核心模块尽量是纯函数，不依赖 Vue，便于测试和复用。
- task registry 不包含页面文案和 UI 布局。
- side effect 默认不执行；结果必须经过显式 apply。
- sourceRefs、target revision 和 stale 判断必须能一路保留。
- 避免“万能 Agent 类”；按 registry/context/result 三个职责分开。

测试与验收：

- 最多新增 3 个高价值测试：任务注册/校验；预算裁剪优先级；结果 stale/apply 或旧 payload 兼容。
- 运行定向测试、`npm run build` 和 `git diff --check`。
- 用现有页面调用形状做静态兼容检查，确保没有要求页面同步改参数。

交付时：

- 自审并修复你发现的问题。
- 在 result 文件写：新契约、兼容范围、未接入模块、测试结果、建议的下一批页面迁移顺序。
- 如果在独立 worktree，创建一个 scoped commit；共享 worktree则不要提交。
- 不修改 `Writing.vue`、`Experience.vue`、`ProseEssay.vue` 或 `AdvisorPanel.vue`。
