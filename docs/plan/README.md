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
