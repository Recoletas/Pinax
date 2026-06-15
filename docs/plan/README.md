# 计划文档分层

> 这个目录不再只按“当前主线 / 参考计划 / 历史背景”理解。当前应按 **方向文档 / 执行骨架 / 并行执行 / 技术专题** 来读。

## 先读顺序

1. [../PLAN.md](../PLAN.md)
2. [character-driven-arc.md](./character-driven-arc.md)
3. [playable-worldbook-roadmap.md](./playable-worldbook-roadmap.md)
4. [playable-worldbook-parallel-plan.md](./playable-worldbook-parallel-plan.md)

## 方向文档

- [character-driven-arc.md](./character-driven-arc.md)
  已采纳的产品方向：Pinax 向角色化 AI GM 驱动的文字冒险工作台迁移。它现在不仅定义目标外壳和迁移边界，也给出了角色多 pose、首屏构图、电影感切换风格、Phase 2 预算和 gate。
- [kao-ui-direction.md](./kao-ui-direction.md)
  `kao.jpg` 参考图的视觉执行层：把“角色海报 + 档案册 + 相片拼贴 + 纸页材质”拆成 Pinax 可复用的色板、材质、组件语法和页面应用顺序。它不替代 `character-driven-arc`，而是把首页 / chrome / 工作面的平面设计具体化。

## 执行骨架

- [playable-worldbook-roadmap.md](./playable-worldbook-roadmap.md)
  迁移期执行骨架：保留“选世界 -> 冒险 -> 写回作品”的 runtime / content / trigger 路线。它不再独占产品方向，只负责可复用底层主链。

## 并行执行

- [playable-worldbook-parallel-plan.md](./playable-worldbook-parallel-plan.md)
  接下来几轮的并行分工：UI shell、runtime skeleton、content/demo 三条线程如何避冲突推进。

## 活跃技术专题

- [states-perf-residual-issue.md](./states-perf-residual-issue.md)
  地图 `states` 阶段的残余性能诊断。
- [voronoi-engine-v2.md](./voronoi-engine-v2.md)
  地图 AI 配置对齐与渲染性能优化计划。

## 参考计划

- [storyforge-setting-panel.md](./storyforge-setting-panel.md)
  结构化设定 / 世界书工作台的长计划。再动这一块时，配合 [../guides/worldbook-workflow.md](../guides/worldbook-workflow.md) 和 [../src/code-map.md](../src/code-map.md) 使用。

## 历史背景

- [map-realism-status.md](./map-realism-status.md)
  已被 ADR / RFC 取代，保留作考古材料。

## 使用规则

- `character-driven-arc.md` 负责回答“产品往哪走”。
- `playable-worldbook-roadmap.md` 负责回答“底层主链接下来做什么”。
- `playable-worldbook-parallel-plan.md` 负责回答“下一轮谁改什么、别碰什么”。
- 改 `WelcomeView`、角色海报、页面 chrome 或字体层级前，先读 `character-driven-arc.md` 的 §3.4 / §3.5 / §5。
- 改 `WelcomeView`、`AppShell`、海报页、书签按钮、拼贴布局或 palette 时，先读 `kao-ui-direction.md`。
- 改 `gameStore`、`worldbookContextBuilder`、trigger 或剧情日志前，先读 `playable-worldbook-roadmap.md` 的对应 stage。
- 只有正文显式标注 `SUPERSEDED` 的计划，才默认按历史材料处理。

## 研究文档写作约定

> 本节约束 `docs/plan/*-research-*.md` 的骨架。已有 8 篇不强制改造，新写的研究 doc 必套。

新写 research doc 时必含 5 段，按顺序：

1. **Preamble / 工具声明**（开头）— 显式说明本 session 可用工具（Firecrawl / WebSearch / WebFetch / Context7 / curl），缺失的工具要写"n/a — <reason>"，不写"未跑通"这种模糊话。
2. **TL;DR / 结论先行**（preamble 之后，正文之前）— ≤ 200 字，含 3 件事：候选范围、推荐对象、推荐理由。**不**是详细论证，是给读者 30 秒拿到 punchline。
3. **候选矩阵**（`## 1. <Matrix>` 第一节）— 一张主比较表，列含 name / 关键 feature / 维护状态 / 与 Pinax 当前栈的契合度。表后跟 1-2 段解释不直白看表的隐含 trade-off。
4. **Pinax Recommendation**（正文倒数第二节）— 子标题统一为：
   - `### N.1 Copy` — 应借鉴的具体模式
   - `### N.2 Avoid` — 应避开的反模式
   - `### N.3 Open questions` — 没解决、留给后续调研的问题
5. **Sources**（末尾）— 引用列表，含 source type（canonical docs / blog / demo / curl-only）和访问日期。

不强制：表格 / 章节深度 / 候选数量（按需展开）。但 5 段顺序不能换。
