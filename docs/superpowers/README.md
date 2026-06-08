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
