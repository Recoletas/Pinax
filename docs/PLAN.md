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

1. Living Atlas：当前优先执行 [G2.4-A 结构化地点目录](./plan/pinax-integrated-product-roadmap.md#g24-a-结构化地点目录当前优先执行)，不再继续扩张地图侧正文地名正则。地理概述只保留叙事和整理依据；城市、城镇、区域、河流与路线以独立世界书地点条目作为作者事实真源，经设定页编辑或 AI 整理草稿逐项确认后再进入地图。地点目录打通后继续 G2.4 的父子区域、相邻求解、remap 评分、LOD 与压力门禁。
2. Living History / World Research：从历史节点进入冒险，并把当前位置、参与者、未决线索、玩家经历和有限世界状态写回运行时。设定主入口已切到结构化工作台；一键 AI 只生成世界概述和创作基调，不再一次生成角色、地点、历史或联网研究大包。结构化页面现为当前世界书条目的编辑视图，保存时按稳定引用 upsert 唯一条目；只有规则、文风和禁写常驻，其他类型继续按需命中，运行时不再全量注入结构摘要。角色字段现在生成可复用角色卡，草稿可直接导入体验页主角档案或人物索引。高级条目管理新增世界书维护工作台，承担自然语言新增、重复/冲突审查和逐项候选写回；体验页 Agent 不负责全局世界书变更。G1.2.2 的结构化端点、整节部分修复、上下文缓存、真实连接探测、阶段状态和 revision 防覆盖代码切片已完成；当前进入 S8 草稿局部意见修订，修订入口放在草稿审阅区，Agent 只生成带版本的新草稿，条目管理只负责最终写入。S7 剩余是 MiniMax M3 Responses、OpenAI-compatible 与 Anthropic-compatible 的真实 Gate，以及完成后清理历史 XML parser。能力矩阵明确区分原生 schema、强制提交工具、JSON object 和不支持，MiniMax M3 关闭 reasoning，M2.x 不再伪装成可靠结构化渠道。小说片段原文继续作为世界书资料持久化，真实历史、地理和制度资料由对应结构字段按需研究与审阅。运行时因果 v3 已覆盖地点控制、角色存活/目标、年代切换/回退、亲属/canonical fact 冲突、显式分支合并和 rollback stale。
3. Place / History / Runtime：统一地点引用和历史绑定，让地图、开场、GM 上下文、事件日志和设定页互相可达；活动冲突摘要进入体验 Agent，完整事件日志不常驻提示词。
4. Emergence：基于地理约束、历史线索、角色状态和当前对话生成可解释事件，完成文本后再通知；候选评分已消费活动因果变化、地点控制/危险度、角色目标、知识、已确认亲属关系和 canonical fact 引用，活动冲突会屏蔽不可信字段与证据，stale 事件不得成为候选依据。
5. Narrative Context Runtime：G4.6 M0-M6 已建立 Kernel、资源索引、四个浏览器只读工具、联机房主权威、ContextLedger、生产指标和 smoke runner，但现有“独立资料调度 -> 压缩证据 -> 新建正文请求”不是完整 provider tool loop，兼容错误后的普通续写回退还可能掩盖依据丢失。当前主线改为 G4.6.13 R0-R8：先冻结协议失败 fixture 和单 transcript 契约，再做真实能力探测、OpenAI/Anthropic/MiniMax 协议保真、同 transcript 多步状态机、修复/取消/循环控制、证据校验与真实渠道门禁。世界书、地理、历史和记忆仍由现有 owner 持有，模型只按需调用只读工具；不恢复 eager 全量注入、影子双链或长期静默 fallback。
6. UI Coherence：G1.5 UI-A 至 UI-F 已完成，主题2的浏览器审计、窄屏 pane、共享视觉基础、阅读面、创作空间、设定链和瞬态层均已收敛。全局 task center 随 G4.2 的真实任务合约实施，不在 UI 层复制状态；主题1的米色游戏化 UI 继续冻结，仅保持共享行为兼容。
7. Experience Reading：G1.4 M1-M4 与 1440/1280/900/760/390 常规/长会话阅读 smoke 已完成；presentation v3 已修复混合对白误判与 marker 泄漏，最终正文接入酒馆式长期 prompt + 末轮 Author's Note + 最近正文样本。下一步是双浏览器联机复用和 M5 真实模型的结构遵循率、模板句率与手动编辑率观察。
8. Agent Runtime：G4.2 M0-M6 实现 Gate 已全部关闭。统一总开关会同时停止手动顾问与后台补全；写作补全、明显冲突和待审结果提醒均有频率上限及无正文本地指标。旧直连 `useCopilot` 已删除，现代路径使用 canonical task，legacy 兼容只保留真实调用边界。可用后端上仍需补 M2 的 30 次真实 provider smoke，完成后才最终结项 G4.2。
9. Gate 0 可靠性与存储安全网：作为上述主线的支撑项继续补齐，不再单独占据产品主线。
10. Creative Graph：地理、历史、会话和剧情日志来源已沿素材、章节/纲要、分镜、写作 ContextLedger、分镜 Agent 与视频任务贯通；漫画 M2-M6 已支持多页改编、语义视觉圣经、自由构图，彩色 `rough -> line -> flats -> render -> effects` / 黑白 `rough -> line -> tones -> effects` 的能力门禁、候选审阅、人工替换、遮罩修订和 artifact lineage，以及文字层出版质检、PNG/WebP/PDF、条漫切片和 v2 manifest，并继续沿用 `comic_pages_v1`。下一步进入 G4.4 M7 连续性质检与分镜转换，不增加迁移层。
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
- 世界书地点、地图对象和历史地点统一使用 `placeId` 与扩展后的 `geoHistory.placeRefs` 绑定；不得新增平行地点 store。低置信匹配保持未绑定并交给用户审阅，不能用随机陆地点伪装成功。
- UI 参考采用 Pinax 化提炼：外部 Ark/Endfield 资料只提供信息层级、视觉深度、证据锁和响应式审查方法，不替换蓝白档案、纸页/活页和叙事阅读语言；细则见 [视觉对齐工作流](./engineering/visual-alignment-workflow.md)。

## 旧材料定位

- `docs/plan/`：专题研究、历史路线和当前 master plan。
- `docs/agent-runs/`：具体 session 的审计、报告与验证证据。
- `docs/superpowers/`：历史规格与工具笔记，只作考古，不是当前工作流依赖。
- `docs/src/known-issues.md`：活跃问题与已接受限制。
- `docs/STATUS.md`：多 session 当前状态，不承担长期产品优先级。
