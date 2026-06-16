# Spec / Plan Template (Pinax)

> **本模板用 6 阶段框架**（设想/规划/方案/计划/重点/安排）。新建 spec 必含：
> 1. metadata 块标 `**Stage**:`（6 取 1，title-block 风格匹配现有 spec 约定）
> 2. 顶部 `## 重点` 段（1-3 句成功标准，**不**是散文）
> 3. `## Context` / `## Goals` / `## Non-Goals` / `## Approach` / `## Architecture` 5 段（**按此顺序**）
> 4. 末尾 `## Self-Application`（本 spec 在 6 阶段链中的位置）

---

## metadata 块（必含，title-block 风格）

```markdown
**Date**: YYYY-MM-DD
**Status**: Draft  # Draft | Approved | Superseded
**Stage**: 方案    # 设想 | 规划 | 方案 | 计划 | 重点 | 安排
```

## 重点（必含，1-3 句）

> 把"完成这件事意味着什么"用 1-3 句说清。不是 1 段散文，**不**超过 3 句。

1. **成功标准 1**: [可验证的具体结果]
2. **成功标准 2**: [可验证的具体结果]
3. **成功标准 3（可选）**: [可验证的具体结果]

## Context（必含）

为什么做 / 之前是什么状态 / 触发条件。

## Goals（必含）

每个 Goal 1 行陈述，必须可验证（"完成 X"而不是"做好 X"）。

## Non-Goals（必含，≥ 3 条）

明确**不**做什么。Non-Goals 少 = spec scope 模糊。

## Approach（必含）

高层方法 / 选择的方案 / 关键 trade-off。**不**写 component-level 改动（那是 Architecture 段）。

## Architecture（必含）

文件 / 模块 / 接口级改动。**不**超过 200 行（超过 = 该拆 spec 方案+计划两份）。

## Self-Application（必含）

本 spec 自身在 6 阶段链中的位置 + 它依赖的上游 / 它产出的下游。

```markdown
- **设想（上游）**: `path/to/上游设想doc.md`
- **本 spec（方案）**: 本文件
- **计划（下游）**: `path/to/下游计划doc.md`（如适用）
```

## Out of scope / future

未来可做但本轮不做。

## Risks

| Risk | Mitigation | 残留风险 |
