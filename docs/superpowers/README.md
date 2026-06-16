# Superpowers 文档

> 这里存的是设计草案、执行计划、短笔记和 agent 基础设施材料。它不是当前产品事实入口。

## 什么时候看

- 改 agent 基础设施：先看 `2026-06-08-internal-agent-workflow` 的 design + plan。
- 考古旧的 Mem0、首页、地图 realism 方案：看对应 `specs/` / `plans/`。
- 查当前产品事实、风险、测试状态：回 `../PLAN.md`、`../LOG.md` 和 `../src/`。

## 分层

- `specs/`
  设计文档。部分仍可引用，部分已在正文标记 `SUPERSEDED`。
- `plans/`
  任务分解和执行计划。多数保留作实现背景。
- `notes/`
  短笔记或局部工具说明。

## 当前仍会被引用

- [`specs/2026-06-08-internal-agent-workflow-design.md`](./specs/2026-06-08-internal-agent-workflow-design.md)
- [`plans/2026-06-08-internal-agent-workflow.md`](./plans/2026-06-08-internal-agent-workflow.md)
- [`specs/2026-05-28-mem0-cors-proxy-design.md`](./specs/2026-05-28-mem0-cors-proxy-design.md)
- [`notes/perf-overlay.md`](./notes/perf-overlay.md)

## 主要历史材料

- [`plans/2026-06-03-realistic-tectonics-rendering.md`](./plans/2026-06-03-realistic-tectonics-rendering.md)
- [`specs/2026-06-03-realistic-tectonics-rendering-design.md`](./specs/2026-06-03-realistic-tectonics-rendering-design.md)
- [`specs/2026-05-28-pinax-homepage-design.md`](./specs/2026-05-28-pinax-homepage-design.md)

## 使用规则

- 当前事实不写在这里；落实后的结果回填 `PLAN.md`、`LOG.md` 或 `src/` 下的事实文档。
- 旧 spec / plan 如果失效，应在正文显式标 `SUPERSEDED` 或给出替代入口。
- 调试当前行为问题时，不要从这里起步，先看 `src/code-map.md` 和 `src/known-issues.md`。

## spec / plan 节奏经验（不强制，仅参考）

> 本节是过去 9 份 spec / 6 份 plan 的观察值，样本小，**不**作为硬规则。

- **Spec 版本数**：6/9 spec 1 版过；2/9 (pass2 / stereo-migration) 走了 3+ 版。**>3 版**通常是 spec scope 过大或 user 视角有未对齐的硬约束，建议停下来重新定义 scope。
- **Subagent 评审数**：样本 4 例，最少 4 最多 12，中位 8。**<3** 通常不够（漏边缘 case / 代码 / 架构任一视角）；**>8** 是信号 — 要么 spec 本身模糊需要重新对齐，要么评审维度重叠。
- **Plan 存在与 feature 复杂度的关系**：multi-pass UI 重设计都有 plan；single-pass polish 无 plan。**复杂度跟踪**不是覆盖率，强行写 plan for trivial 反而拖慢。
- **修/改 commit 比例**：近 30 commit 是 17:12（1.42）— 返工 > 新功能。立体感迁移 v1→v5 期间 6/12 是 review-iteration docs。这是 spec 多版的合理代价，**不**是失败信号。
- **Per-feature commit**：5/50 (10%) 是 mega-completion（>20 文件）。`commit-conventions` skill 已有 soft 警告"≥3 不相关顶层目录"自问能否拆，不设硬规则。
