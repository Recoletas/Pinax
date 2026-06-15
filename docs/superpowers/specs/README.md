# specs/ 目录自述

> 这里存的是 spec/plan 设计草案。**新建 spec 必走 `docs/templates/spec-template.md` 模板**。

## 6 阶段框架

本目录 spec 默认在 6 阶段链的 **方案** 位置。`docs/superpowers/plans/` 下的 plan 在 **计划** 位置。

新建 spec 时**不**强制先写 **设想** 阶段（位于 `docs/plan/*.md` 下的 research / character-driven-arc / kao-ui-direction 等），**仅**当 spec 走到 v3+ multi-version 时补写 1 页 `## 设想` 段。

## spec → plan 转换门禁 checklist

**当 spec 走到 "user-approved,转 writing-plans" 状态**时，agent 在写 `docs/superpowers/plans/<name>.md` 前必须自查：

- [ ] (a) metadata 块有 `**Stage**: 方案`（spec）/ `**Stage**: 计划`（plan）
- [ ] (b) 顶部 `## 重点` 段是 1-3 句成功标准（**不**是 1 段散文）
- [ ] (c) `## Context` / `## Goals` / `## Non-Goals` / `## Approach` / `## Architecture` 5 段都答完（**不**留 placeholder）
- [ ] (d) `## Non-Goals` 至少 3 条
- [ ] (e) `## Self-Application` 段明示上下游
- [ ] (f) `## Risks` 段有 ≥ 1 行 mitigation

不通过任一条 → 回 spec 改，**不**进 plan。

## 当前仍会被引用

- [2026-06-08-internal-agent-workflow-design.md](./2026-06-08-internal-agent-workflow-design.md)
- [2026-06-15-agent-workflow-velocity-design.md](./2026-06-15-agent-workflow-velocity-design.md)
- [2026-06-15-stereo-migration-design.md](./2026-06-15-stereo-migration-design.md)
- （其他 5 份历史 spec）

## 使用规则

- 当前事实不写在这里；落实后的结果回填 `docs/PLAN.md`、`docs/LOG.md` 或 `src/` 下的事实文档。
- 旧 spec / plan 如果失效，应在正文显式标 `SUPERSEDED` 或给出替代入口。
- 调试当前行为问题时，不要从这里起步，先看 `src/code-map.md` 和 `src/known-issues.md`。
- 旧 spec **不**回溯补 metadata 块（`**Stage**:` 标签）/ 重点 / Self-Application（避免回归 + 边际价值低）。
