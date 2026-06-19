# Codex / Claude 协作工作流

本文定义 Pinax 项目内使用 Codex 与 Claude Code CLI 的协作方式。目标是让 Codex 保持上下文、架构判断和最终验收能力，让 Claude 承担可并行、可丢弃、可验收的调研与实现任务。

## 角色分工

- Codex 是主控台：负责需求翻译、任务拆分、上下文保管、风险判断、合并、测试、提交前验收。
- Claude worker 是异步工人：负责调研、局部实现、自测、自审和短摘要交付。
- 用户是方向裁判：负责提供灵感、参考、截图、手绘标注、验收反馈和最终取舍。

## 硬约束

- MUST: Codex 必须保留架构师 / 集成者 / 验收者角色，不把最终合并判断交给 Claude。
- MUST: Claude worker 必须使用明确 brief，包含目标、允许文件、禁止文件、验收要求、输出格式和摘要长度限制。
- MUST: Claude worker 的长输出必须落盘成短 summary、截图、diff 或测试结果；Codex 默认只读这些交付物。
- MUST: 并行 Claude worker 必须使用独立 git worktree 或完全不重叠的写入范围。
- MUST: 多 worker 任务必须维护任务看板，记录 worker id、worktree、scope、status、output。
- MUST: Claude worker 完成后必须先自审并修复明显问题，再交给 Codex 验收。
- MUST NOT: 不允许 Claude 调 Codex 执行实现、验收或合并工作。
- MUST NOT: 不允许把 Claude 的完整聊天历史、长调研正文或无边界推理直接塞进 Codex 上下文。
- MUST NOT: 不允许多个 worker 同时编辑同一文件，除非 Codex 明确安排一个后续整合 pass。
- MUST NOT: 不允许 worker 在未授权时修改 `docs/STATUS.md`、`AGENTS.md`、全局 skill、主 store、生成链路或无关文档。

## 任务分流

| 任务类型 | 默认执行者 | 说明 |
| --- | --- | --- |
| 大范围调研 | Claude worker 或手动 Claude 窗口 | 输出必须限长，Codex 只读综合摘要 |
| spec 初稿 | Claude worker | 适合快速粗写，但不得替代 Codex 审查 |
| spec 审查 | Codex 主审，Claude 可交叉审查 | Codex 负责可行性、范围和项目一致性 |
| 局部工程实现 | Claude worker | 必须有文件边界和测试要求 |
| 精细 UI 打磨 | Codex 或单 worker | 视觉判断高风险，避免多 worker 混改 |
| 合并 / 提交 / 回归测试 | Codex | 不交给 worker |

## Worker 看板

多 worker 任务必须建立或更新 `docs/agent-runs/current.md`。建议格式：

```md
# Agent Runs

## Active

| ID | Owner | Worktree | Scope | Status | Output |
| --- | --- | --- | --- | --- | --- |
| W1 | Claude | /home/.../worktrees/opening-cta | Opening CTA perspective | running | pending |

## Locks

Do not touch:
- src/stores/gameStore.js
- src/services/worldbookContextBuilder.js
- unrelated docs/specs

## Current Constraints

- direct red box = required placement
- red line = required angle / curve
- erased area = must stay empty
- unmarked area = do not proactively redesign
```

完成后的 worker 只需要写 `docs/agent-runs/<id>.summary.md`，不要把完整日志写进看板。

## Claude Worker Brief 模板

```text
You are Worker <ID>.

Goal:
<one scoped outcome>

Repo:
<worktree path>

Allowed files:
- <file or directory>

Do not touch:
- <locked file or directory>

Constraints:
- <hard requirement>
- <hard requirement>

Required:
1. Implement only this slice.
2. Run focused verification.
3. Capture screenshot if this is visual work and a dev server is available.
4. Self-review once and fix obvious issues.
5. Write summary to docs/agent-runs/<ID>.summary.md.

Summary max <300-500> words:
- changed files
- visual / behavioral deltas
- tests run
- screenshot path if any
- risks
```

## 三种调度模式

### 同步短任务

用于 grep、单点审查、小范围 bug 定位。Codex 可以等待结果，但 brief 仍要限长。

### 异步长任务

用于 10 分钟以上的调研或实现。Codex 发起 worker、记录看板和 PID，然后继续其他工作。后续由用户或 Codex 明确执行 poll，读取 summary、diff 和截图。

### 手动 Claude 群跑

用于早期方向发散。用户可以手动开多个 Claude 窗口，但每个输出必须限制为：

- 最多 800 字。
- 只给 5 个最可执行建议。
- 必须标注风险。
- 不写完整实现计划。
- 不写长背景介绍。

Codex 负责筛选和转化，不直接继承这些窗口的上下文。

## Codex 验收清单

Codex 验收 worker 结果时只看：

- `git diff --stat`
- 关键 diff
- worker summary
- 截图或视觉标注
- focused tests
- 与用户硬约束的匹配程度

如果 summary 不足、截图缺失、写入范围越界或测试未跑，Codex 应退回 worker 或自行修复，不应直接合并。

## 上下文保护规则

- 调研 summary 最多 800 字。
- 实现 summary 最多 500 字。
- bug 排查 summary 最多 300 字。
- spec review 最多 10 条问题。
- Codex 默认不读 worker 原始日志；只有排查 worker 自身故障时才读取必要片段。
- 任何需要长期复用的偏好或规则必须进入项目文档、`AGENTS.md` 或 Codex memory，而不是留在聊天上下文里。
