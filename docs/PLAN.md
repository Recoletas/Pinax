# 当前产品计划

> 2026-07-15 起，Pinax 只维护一份 active 产品级路线图。必要的研究、决策与 agent run 作为证据保留；已完成的执行计划不再独立维护。

## 当前主线

Pinax 从“AI 文字冒险、世界书、地图、写作、素材和分镜的并列集合”收敛为一个连续的活世界创作系统：

```text
设定 -> 地图 -> 历史 -> 冒险 -> 素材 -> 写作 -> 分镜 -> 视频 / 音频 / 发布
```

完整路线、数据契约、阶段任务、验收指标与视频渠道策略见：

- [Pinax 产品整合与演进主计划](./plan/pinax-integrated-product-roadmap.md)

## 当前优先级

1. Living Atlas：把地图生成结果整理为地理语义点，经过草案审阅后进入世界历史。
2. Living History：从历史节点进入冒险，并把当前位置、参与者、未决线索、玩家经历和有限世界状态写回运行时。
3. Place / History / Runtime：统一地点引用和历史绑定，让地图、开场、GM 上下文、事件日志和设定页互相可达。
4. Emergence：基于地理约束、历史线索、角色状态和当前对话生成可解释事件，完成文本后再通知。
5. Narrative Context Runtime：按 G4.6 把体验主叙事升级为有限工具循环。当前地点、硬规则和最近轮次组成最小 kernel；世界书、地理、历史和记忆通过四个浏览器只读工具按需取得，最终正文继续使用现有流式渲染，所有世界变化仍走候选与事务。
6. UI Coherence：G1.5 UI-A 至 UI-F 已完成，主题2的浏览器审计、窄屏 pane、共享视觉基础、阅读面、创作空间、设定链和瞬态层均已收敛。全局 task center 随 G4.2 的真实任务合约实施，不在 UI 层复制状态；主题1的米色游戏化 UI 继续冻结，仅保持共享行为兼容。
7. Experience Reading：G1.4 M1-M4 与 1440/1280/900/760/390 常规/长会话阅读 smoke 已完成；酒馆式会话骨架、语义阅读内页、消息操作和移动索引焦点闭环稳定。下一步是双浏览器联机复用和 M5 真实模型结构遵循率观察。
8. Agent Runtime：G4.2 M0-M6 实现 Gate 已全部关闭。统一总开关会同时停止手动顾问与后台补全；写作补全、明显冲突和待审结果提醒均有频率上限及无正文本地指标。旧直连 `useCopilot` 已删除，现代路径使用 canonical task，legacy 兼容只保留真实调用边界。可用后端上仍需补 M2 的 30 次真实 provider smoke，完成后才最终结项 G4.2。
9. Gate 0 可靠性与存储安全网：作为上述主线的支撑项继续补齐，不再单独占据产品主线。
10. Creative Graph：共享图片基础与漫画制作字段已接入独立 `/comics` 工作区，每格通过 `continuityRefs` 单独选择素材；按 G4.4 的 M2-M7 继续实现“改编/分页 -> 视觉圣经 -> 分镜构图 -> 草稿 -> 线稿 -> 平涂/网点 -> 渲染 -> 文字 -> 质检/导出”，继续沿用现有存储，不增加迁移层。
11. Video MVP：分镜以已确认镜头版本按单镜头提交服务端异步任务，提交前可审阅/编辑含景别、运镜和衔接关系的最终提示词；MiniMax 与自定义异步 HTTP 使用可测试、持久化的浏览器模型配置，后续补第二 direct provider。
12. Online Experience：通过 `/experience/online/:roomSlug` 提供 URL 加入的多人冒险，采用服务端权威有序事件，不同步整个前端 store。

## 已完成执行包

联机模式、Agent 基础契约、关系画布优化、视频任务网关和页面接线已按 A-F 窗口完成实现与集成：

- [Online / Agents / Canvas / Video 执行包](./agent-runs/2026-07-16-online-agents-canvas-video/README.md)
- [Round 2 可见入口、画布、顾问与漫画收口](./agent-runs/2026-07-16-round2-integration/README.md)
- [当前窗口任务板](./agent-runs/current.md)

A-E 的结果已由 F 在恢复后的七月产品基线上整合，Round 2 又补齐入口可发现性、拖拽状态机、顾问生命周期和漫画页级制作。测试总量保持 200，未启动用户已有的 dev server。后续功能继续回到地理、历史融合与 Creative Graph 主线，不再扩展本执行包。

## 当前工程边界

- `main` 是开发集成分支，`server-version` 是生产适配分支。
- 现有 store 继续拥有各自领域状态；项目 manifest 只负责连接，不复制状态。
- 所有 AI 生成结果先成为草稿，用户确认后写回正式世界。
- 地图、历史、写作和媒体不得各自再建一套项目身份或引用模型。
- 视频供应商逻辑只能进入 server adapter，不继续堆进页面组件。
- 图片、插画和漫画复用同一媒体服务；已删除无逻辑 `ImageGenRail` 兼容壳，`ProseEssay.vue` 不再维护第二套 provider fetch。
- 联机首版只做房主权威的多人冒险；全文、设定和地图实时协作继续暂缓。
- 地理和历史融合是当前产品主线；可靠性和数据边界必须跟随主线补齐，但不应替代可感知的世界演化功能。
- UI 参考采用 Pinax 化提炼：外部 Ark/Endfield 资料只提供信息层级、视觉深度、证据锁和响应式审查方法，不替换蓝白档案、纸页/活页和叙事阅读语言；细则见 [视觉对齐工作流](./engineering/visual-alignment-workflow.md)。

## 旧材料定位

- `docs/plan/`：专题研究、历史路线和当前 master plan。
- `docs/agent-runs/`：具体 session 的审计、报告与验证证据。
- `docs/superpowers/`：历史规格与工具笔记，只作考古，不是当前工作流依赖。
- `docs/src/known-issues.md`：活跃问题与已接受限制。
- `docs/STATUS.md`：多 session 当前状态，不承担长期产品优先级。
