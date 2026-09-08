# 产品计划索引

## 当前唯一主计划

[Pinax 产品整合与演进主计划](./pinax-integrated-product-roadmap.md) 是当前唯一的产品级路线图，负责决定优先级、阶段边界、数据契约和验收标准。

当前主线：

```text
正文 / 构思 / 大纲（Authoring） ← 设定、地图、历史、体验素材
           ↕
      试演 → 审阅 → 作者采用
           ↓
    素材 / 插画 / 漫画 / 画布 / 分镜
```

当前体验重点是Authoring集成收敛、UI/UX打磨与故事试演。作者可直接写作，世界构建和冒险不是必经步骤；地图、桌面、协作及视听各按自身Gate推进。实际执行状态以 [STATUS.md](../STATUS.md) 为准。

## 当前体验执行入口

- [第四轮夜间任务书（当前）](./authoring-overnight-round4-20260908.md)：补第三轮，单条件人物 IF、普通追加要求、留稿、K 全链边界及薄对象/提炼候选；U 10/K 8/加深 6，实际续接先验收。仅计划待执行。
- [人物 IF 补充调研](./authoring-character-fate-followup-20260908.md)：复核当前 main/K 与一手资料，明确单变量/软信念/预测/世界事实边界；[原研究快照](./authoring-character-fate-research-20260908.md)保留旧树事实，不当现状清单。
- [第三轮夜间任务书（历史，部分交付）](./authoring-overnight-round3-20260907.md)：单次运行未覆盖完整主包及接续，缺口转第四轮；验收后 U/K 已有局部修复，不重复派发已修项。
- [第二轮夜间任务书（历史，部分交付）](./authoring-overnight-round2-20260906.md)：保留原定范围；未完任务及验收后新增修复统一在第三轮接续。
- [首夜任务与复盘（历史）](./authoring-overnight-dual-track-20260905.md)：首夜成果已合 main，“8h”不是实际工作量证明；第二轮以新任务书为准。
- [体验主线与设定／历史能力支线并行计划](./authoring-parallel-foundation-plan-20260905.md)：上位 K/I/H/E 路线；K0–K4 已离线合入，I0 的本轮窄接缝范围与 gate 见第三轮任务书，I1/历史写入仍未开放。
- [UI/UX 与故事试演详细计划](./authoring-ux-and-story-play-plan-20260905.md)：A0–A5依赖、18个任务包、代表性视觉切片和真实作者验收。
- [二轮调研证据](./authoring-ux-story-play-research-20260905.md)：实页/代码/历史/假设分级及参考边界，不是已完成功能清单。
- [当前产品计划](../PLAN.md)：F1/F2/F3、桌面、协作等专项入口及约束的统一导航。

## 支撑材料

- [map-realism-status.md](./map-realism-status.md)：地图生成的当前视觉诊断。
- [states-perf-residual-issue.md](./states-perf-residual-issue.md)：地图状态扩张的历史性能边界。
- [map-rendering-libs-research-20260615.md](./map-rendering-libs-research-20260615.md)：渲染方案调研，仅作为后续决策输入。
- [worldbook-market-research-20260615.md](./worldbook-market-research-20260615.md)：世界书和 lorebook 方案调研。
- [local-first-sync-research-20260615.md](./local-first-sync-research-20260615.md)：存储与同步方案调研。
- [experience-narrative-continuity-plan.md](./experience-narrative-continuity-plan.md)：体验页续写语义、叙事连续性、可读性与多轮质量 Gate。
- [experience-story-generation-quality-plan.md](./experience-story-generation-quality-plan.md)：体验页第二阶段故事质量计划，以场景线程、局部叙事拍计划和更完整的单次生成解决正文散、重复动作与无功能描写。
- [experience-content-integrity-and-dialogue-plan.md](./experience-content-integrity-and-dialogue-plan.md)：体验页第三阶段修正计划，统一正文删除与存储回收、marker/speaker 协议、对白阅读样式和 SceneThread 闭环。
- [settings-import-and-review-ux-plan-20260817.md](./settings-import-and-review-ux-plan-20260817.md)：世界书首页、可恢复创建工作区、多文件来源暂存、基础基调、渐进式详细提炼和唯一 AI 审阅区重构计划。
其余研究文档保留为资料，不自动生成任务，也不能覆盖主计划中的当前事实。已完成的专题计划和过时的并行执行文档不再在这里维护。

## 查找规则

- 查当前产品事实：先读 `docs/PLAN.md`、主计划和 `docs/STATUS.md`。
- 查当前风险：读 `docs/src/known-issues.md`。
- 查实现归属：读 `docs/src/code-map.md`。
- 查历史决策：读 `docs/src/decisions/`、`docs/src/rfcs/` 或对应的 agent run。
- 新增计划必须链接回主计划，并写明状态、范围、非目标和验收方式。
