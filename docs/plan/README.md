# 产品计划索引

## 当前唯一主计划

[Pinax 产品整合与演进主计划](./pinax-integrated-product-roadmap.md) 是当前唯一的产品级路线图，负责决定优先级、阶段边界、数据契约和验收标准。

当前主线：

```text
设定 -> 地图 -> 历史 -> 冒险 -> 素材 -> 写作 -> 分镜 -> 视频 / 音频 / 发布
```

当前执行重点仍是地理进入历史和运行时；后续新增专项依次为共享媒体基础、素材插画/漫画、分镜视频和联机体验。它们只在主计划对应 Gate 中推进，不另建平行路线图。

## 支撑材料

- [map-realism-status.md](./map-realism-status.md)：地图生成的当前视觉诊断。
- [states-perf-residual-issue.md](./states-perf-residual-issue.md)：地图状态扩张的历史性能边界。
- [map-rendering-libs-research-20260615.md](./map-rendering-libs-research-20260615.md)：渲染方案调研，仅作为后续决策输入。
- [worldbook-market-research-20260615.md](./worldbook-market-research-20260615.md)：世界书和 lorebook 方案调研。
- [local-first-sync-research-20260615.md](./local-first-sync-research-20260615.md)：存储与同步方案调研。
- [experience-narrative-continuity-plan.md](./experience-narrative-continuity-plan.md)：体验页续写语义、叙事连续性、可读性与多轮质量 Gate。
- [experience-story-generation-quality-plan.md](./experience-story-generation-quality-plan.md)：体验页第二阶段故事质量计划，以场景线程、局部叙事拍计划和更完整的单次生成解决正文散、重复动作与无功能描写。
- [experience-content-integrity-and-dialogue-plan.md](./experience-content-integrity-and-dialogue-plan.md)：体验页第三阶段修正计划，统一正文删除与存储回收、marker/speaker 协议、对白阅读样式和 SceneThread 闭环。
其余研究文档保留为资料，不自动生成任务，也不能覆盖主计划中的当前事实。已完成的专题计划和过时的并行执行文档不再在这里维护。

## 查找规则

- 查当前产品事实：先读 `docs/PLAN.md`、主计划和 `docs/STATUS.md`。
- 查当前风险：读 `docs/src/known-issues.md`。
- 查实现归属：读 `docs/src/code-map.md`。
- 查历史决策：读 `docs/src/decisions/`、`docs/src/rfcs/` 或对应的 agent run。
- 新增计划必须链接回主计划，并写明状态、范围、非目标和验收方式。
