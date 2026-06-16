# 公开草案 / RFC

> 跨子系统、需要多人协作评审的方案。未定稿的公共载体。
> **草案不陈述"已经落地"的当前实现事实。**
> 查当前事实、当前主线、当前风险时，不要从这里开始，先看 [`../code-map.md`](../code-map.md)、[`../known-issues.md`](../known-issues.md)、[`../../PLAN.md`](../../PLAN.md)。

## 目录结构

```
docs/src/rfcs/
└── <short-slug>/
    ├── index.md              # 入口：必填（状态、负责人、最后更新、领域、开放问题、下一步）
    ├── implementation.md     # 实施计划：必填
    ├── invariants.md         # 不变量声明：可选
    └── backgrounds/          # 历史材料、调研笔记、对比实验：可选
```

## RFC 入口字段

`index.md` 页首必须包含以下六字段：

```markdown
- **状态**: draft / accepted / rejected / superseded
- **负责人**: @username
- **最后更新**: YYYY-MM-DD
- **领域**: world-map / 文本生成 / UI / 基础设施 / ...
- **开放问题**: [列表]
- **下一步**: [具体动作 + 截止窗口]
```

## 生命周期

1. **draft** —— 在 `rfcs/<slug>/index.md` 起草。
2. **reviewing** —— 在 PR / 评审会议中讨论。
3. **accepted** —— 结论转写到：
   - 当前事实页（[`code-map.md`](../code-map.md) / [`known-issues.md`](../known-issues.md) / [`test-status.md`](../test-status.md)），
   - 或决策记录（[`decisions/ADR-NNNN-...md`](../decisions/)），
   - 或在 RFC 目录内**明确标记为 canonical implementation source**（用 `<!-- canonical-source -->` 注释 + 文末说明）。
4. **rejected** —— 保留目录，结论转 `decisions/ADR-NNNN-rejected-<slug>.md`，正文可保留作为历史。
5. **superseded** —— 新 RFC 目录指明 `supersedes: <旧 slug>`。

## 与决策记录的区别

| 维度 | `rfcs/` | `decisions/` |
| --- | --- | --- |
| 阶段 | 草案 / 评审中 | 已接受 |
| 目标 | 让大家达成共识 | 锁定结论、记录不变量 |
| 修改 | 自由编辑 | supersede only |

## 索引

### 当前仍会引用的 accepted RFC

| Slug | 标题 | 状态 | 负责人 | 最后更新 |
| --- | --- | --- | --- | --- |
| [perf-profiling/](./perf-profiling/) | 地图生成管线分阶段计时基础设施 | accepted | @Recoletas | 2026-06-01 |
| [nations-perf-fix/](./nations-perf-fix/) | `states` 与 `roads` 阶段性能修复 | accepted | @Recoletas | 2026-06-02 |
| [azgaar-pipeline/](./azgaar-pipeline/) | Azgaar 风格地图管线重写（06-08 后已恢复模板语义） | accepted / amended | @Recoletas | 2026-06-08 |
| [engine-oss-replacements/](./engine-oss-replacements/) | 引擎 5 处自造基础设施替换为成熟 OSS 库（模板删除说明已过期） | accepted / amended | @Recoletas | 2026-06-08 |

### 使用规则

- `accepted` RFC 只在需要实现背景、设计边界或 superseded 关系时再看。
- 如果 RFC 页首带 `<!-- canonical-source -->`，表示它仍是该专题的规范性设计来源之一；但当前运行事实仍以 `code-map.md`、`known-issues.md`、`test-status.md` 为准。
- 发现 accepted RFC 和当前事实冲突时，优先补页首“当前实现注记”或迁结论到 ADR / facts 文档，不要直接把历史正文伪装成现状。

## 既有材料如何迁入

- `../superpowers/specs/` 中“已接受且仍生效”的 → 迁到 [`decisions/`](../decisions/) 或保留为带 `<!-- canonical-source -->` 的 accepted RFC
- `../superpowers/specs/` 中“未定稿但需要公共评审”的 → 迁到 `rfcs/`
- `../superpowers/plans/` 中“对应未完成实施”的 → 迁到 `rfcs/<slug>/implementation.md`
- 旧的 `../plan/*` 中以方案 / 对比为主的文档 → 迁到 `rfcs/` 或 `decisions/`
