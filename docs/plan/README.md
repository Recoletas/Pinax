# 计划文档分层

> 这个目录同时包含当前主线材料、仍活跃的技术专题和纯背景计划，不要一概当成归档。

## 当前主线

- [playable-worldbook-roadmap.md](./playable-worldbook-roadmap.md)
  当前产品主线的专题路线图，和 [../PLAN.md](../PLAN.md) 一起使用。
- [playable-worldbook-parallel-plan.md](./playable-worldbook-parallel-plan.md)
  下一轮并行执行清单：Codex 做工程主链路，另一组做旗舰世界内容 review、手测和 demo。

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

- 当前产品方向先看 [../PLAN.md](../PLAN.md) 和 [playable-worldbook-roadmap.md](./playable-worldbook-roadmap.md)。
- 查某个技术专题前，先确认 [../src/known-issues.md](../src/known-issues.md) 和 [../src/code-map.md](../src/code-map.md) 里的当前事实。
- 只有被文档正文显式标注 `SUPERSEDED` 的计划，才默认视为历史材料。
- 新的跨阶段主线计划，优先写到 `PLAN.md`；需要更详细分阶段展开时，再落到这里。
