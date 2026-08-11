# 当前产品计划

> 2026-07-15 起，Pinax 只维护一份 active 产品级路线图。必要的研究、决策与 agent run 作为证据保留；已完成的执行计划不再独立维护。

## 当前主线

Pinax 从“AI 文字冒险、世界书、地图、写作、素材和分镜的并列集合”收敛为一个连续的活世界创作系统：

```text
设定 -> 地图 -> 历史 -> 冒险 -> 素材 -> 写作 -> 分镜 -> 视频 / 音频 / 发布
```

完整路线、数据契约、阶段任务、验收指标与视频渠道策略见：

- [Pinax 产品整合与演进主计划](./plan/pinax-integrated-product-roadmap.md)
- [体验页酒馆能力对齐计划（审阅修订版）](./superpowers/plans/2026-08-11-sillytavern-experience-parity.md)：从属于 G1.4/G4.6，只处理回合事务、上下文可见性、世界书激活、场景角色、记忆恢复与有证据的性能差距；不建立第二条产品主线。

## 当前优先级

1. Living Atlas：当前优先执行 [G2.4-A 结构化地点目录](./plan/pinax-integrated-product-roadmap.md#g24-a-结构化地点目录当前优先执行)，不再继续扩张地图侧正文地名正则。地理概述只保留叙事和整理依据；城市、城镇、区域、河流与路线以独立世界书地点条目作为作者事实真源，经设定页编辑或 AI 整理草稿逐项确认后再进入地图。地点目录打通后继续 G2.4 的父子区域、相邻求解、remap 评分、LOD 与压力门禁。
2. Living History / World Research：从历史节点进入冒险，并把当前位置、参与者、未决线索、玩家经历和有限世界状态写回运行时。设定主入口已切到结构化工作台；一键 AI 只生成世界概述和创作基调，不再一次生成角色、地点、历史或联网研究大包。结构化页面现为当前世界书条目的编辑视图，保存时按稳定引用 upsert 唯一条目；只有规则、文风和禁写常驻，其他类型继续按需命中，运行时不再全量注入结构摘要。角色字段现在生成可复用角色卡，草稿可直接导入体验页主角档案或人物索引。高级条目管理新增世界书维护工作台，承担自然语言新增、重复/冲突审查和逐项候选写回；体验页 Agent 不负责全局世界书变更。G1.2.2 的结构化端点、整节部分修复、上下文缓存、真实连接探测、阶段状态和 revision 防覆盖代码切片已完成；当前进入 S8 草稿局部意见修订，修订入口放在草稿审阅区，Agent 只生成带版本的新草稿，条目管理只负责最终写入。S7 剩余是 MiniMax M3 Responses、OpenAI-compatible 与 Anthropic-compatible 的真实 Gate，以及完成后清理历史 XML parser。能力矩阵明确区分原生 schema、强制提交工具、JSON object 和不支持，MiniMax M3 关闭 reasoning，M2.x 不再伪装成可靠结构化渠道。小说片段原文继续作为世界书资料持久化，真实历史、地理和制度资料由对应结构字段按需研究与审阅。运行时因果 v3 已覆盖地点控制、角色存活/目标、年代切换/回退、亲属/canonical fact 冲突、显式分支合并和 rollback stale。
3. Place / History / Runtime：统一地点引用和历史绑定，让地图、开场、GM 上下文、事件日志和设定页互相可达；活动冲突摘要进入体验 Agent，完整事件日志不常驻提示词。
4. Emergence：基于地理约束、历史线索、角色状态和当前对话生成可解释事件，完成文本后再通知；候选评分已消费活动因果变化、地点控制/危险度、角色目标、知识、已确认亲属关系和 canonical fact 引用，活动冲突会屏蔽不可信字段与证据，stale 事件不得成为候选依据。
5. Narrative Context Runtime：G4.6 M0-M6 已建立 Kernel、资源索引、四个浏览器只读工具、联机房主权威、ContextLedger、生产指标和 smoke runner。当前主线改为 G4.6.13 R0-R8：R0-R3 已冻结协议失败 fixture、单 transcript 契约、真实能力探测和四类 provider adapter；R4 已把体验主链切换为同 transcript 多步状态机，R5 已接入 typed repair、工具超时 AbortSignal、空/stale 结果、grounding policy 与 doom-loop 终止；R6 已完成动态工具域、稳定 cursor、确定性排序、关系路径、trust/conflict/stale 和 final evidence report；R7 已接入规范化 SSE step stream、前端事件重组、transcript/ledger/metrics 审计字段、房主状态广播和停止/重试状态操作，终态正文不再经过 clean prompt 重建；R8-B 已加入四渠道矩阵执行器，R8-C 已删除旧 JSON/fallback 链，R8-D 已加入逐渠道 release gate，R8-E 已加入取消与迟到结果恢复 smoke。当前只剩真实渠道门禁、质量标注与发布收口。世界书、地理、历史和记忆仍由现有 owner 持有，模型只按需调用只读工具；不恢复 eager 全量注入、影子双链或静默 fallback。
6. UI Coherence：G1.5 UI-A 至 UI-F 已完成，主题2的浏览器审计、窄屏 pane、共享视觉基础、阅读面、创作空间、设定链和瞬态层均已收敛。全局 task center 随 G4.2 的真实任务合约实施，不在 UI 层复制状态；主题1的米色游戏化 UI 继续冻结，仅保持共享行为兼容。
7. Experience Reading：G1.4 M1-M4 与基础响应式 smoke 已完成；G1.4.10 R0/R1 已冻结主题2标准档为物理 `17.5px`、`62em`、B 型 speaker label、仅真实对白轻斜体和 15% 强调硬上限。R2 已开始收口角色识别和段落节奏：纯叙述不再伪造“旁白”署名，玩家与明确角色只在必要处署名，动作回正体、心理保留轻斜体。下一步继续完成行内强调去重、触发标记、阅读外观入口与移动端避让；随后继续双浏览器联机和 M5 真实模型指标。
8. Writing Notebook：G1.6 已完成产品、数据和执行计划。WNB-0 fixture/长章/隔离 Tiptap editor、WNB-1 默认编辑面和 WNB-2 手工批注检查器均已完成。Notebook 默认编辑面现在明确为实时 Markdown：普通 Markdown 在同一编辑面实时渲染，原始 Markdown 与阅读预览保留为辅助模式；块使用无卡片浅色轨道和当前块高亮。WNB-2 的复合 quote/position 锚点随章节加载、编辑和保存重定位，前文插入/块移动保持锚点，拆分生成共享 `parentId` 子批注，合并重新绑定，删除或无法唯一匹配时标记 orphan；检查器支持批注回复、解决/恢复、定位和键盘导航，窄屏改为 side sheet/bottom sheet，移动端默认不遮挡正文。写作页独立顾问入口、浮动顾问和顾问面板已移除，批注、改写候选、章节审查和版本检查器成为唯一审阅入口。WNB-3 当前候选闭环已完成：改写任务最多返回三个只读候选，检查器展示 diff，锁定片段与 chapter/document/block revision gate 在采纳前生效，Notebook 通过单 transaction 应用并可撤销；请求支持真实 AbortSignal 取消，失败/取消可沿未变化目标重试。WNB-4 的场景索引展示已移除，但场景数据仍用于批注范围过滤；跨块批注、多块候选和章节审稿仍已完成，章节审查按 6 块分批，仅接受可精确定位的 finding，批次失败不丢其他结果，并可将 finding 送入 WNB-3 改写链。下一步是 provider 观察、多候选/审稿浏览器 smoke；版本快照留到 WNB-5。
9. Agent Runtime：G4.2 M0-M6 实现 Gate 已全部关闭。统一总开关会同时停止手动顾问与后台补全；写作补全、明显冲突和待审结果提醒均有频率上限及无正文本地指标。旧直连 `useCopilot` 已删除，现代路径使用 canonical task，legacy 兼容只保留真实调用边界。可用后端上仍需补 M2 的 30 次真实 provider smoke，完成后才最终结项 G4.2。
10. Gate 0 可靠性与存储安全网：作为上述主线的支撑项继续补齐，不再单独占据产品主线。
11. Creative Graph：地理、历史、会话和剧情日志来源已沿素材、章节/纲要、分镜、写作 ContextLedger、分镜 Agent 与视频任务贯通；漫画 M2-M6 已支持多页改编、语义视觉圣经、自由构图，彩色 `rough -> line -> flats -> render -> effects` / 黑白 `rough -> line -> tones -> effects` 的能力门禁、候选审阅、人工替换、遮罩修订和 artifact lineage，以及文字层出版质检、PNG/WebP/PDF、条漫切片和 v2 manifest，并继续沿用 `comic_pages_v1`。下一步进入 G4.4 M7 连续性质检与分镜转换，不增加迁移层。
12. Video MVP：分镜以已确认镜头版本按单镜头提交服务端异步任务，提交前可审阅/编辑含景别、运镜和衔接关系的最终提示词；MiniMax 与自定义异步 HTTP 使用可测试、持久化的浏览器模型配置，后续补第二 direct provider。
13. Online Experience：通过 `/experience/online/:roomSlug` 提供 URL 加入的多人冒险，采用服务端权威有序事件，不同步整个前端 store。

### WNB-5 当前进度

WNB-5 第一至第三大阶段已完成：命名章节快照、改写前/恢复前自动检查点、恢复前当前正文变更提示、快照删除、每章数量/总存储预算、单块历史、保存前恢复草稿、章节质量报告和 Pinax 备份纳入。版本页同时提供当前章节的整章版本、可恢复的已保存块历史、未保存草稿恢复和本地发布前质量 Gate，不复制正文编辑器。质量 Gate 会阻断空章、未保存内容、恢复草稿、失去定位批注和高优先级未处理审查问题，并允许定位到块或批注。下一步是 provider/浏览器 Gate 与真实章节恢复 smoke。

### G4.6.13 当前进度

R0-R7 已完成实现 Gate。体验主链现在由 `runNarrativeAgentLoop()` 驱动：assistant tool call、并行 tool result、reasoning opaque metadata 和最终 assistant 正文都保留在同一临时 transcript。工具目录会按用户输入只开放当前需要的资料域；检索使用带 resource revision 的 opaque cursor、稳定排序和关系路径；结果携带 trust/conflict/stale 状态，最终正文生成 evidence report，required grounding 不接受冲突或 draft-only 证据。非法调用/空协议响应最多进入一次同 transcript 修复；工具超时会真实中止 registry signal，第三次规范化重复调用会形成 doom-loop error。单步 provider 请求现在经标准 SSE 事件流进入浏览器，并在内存中重组为现有 transcript 响应；ContextLedger、metrics 和联机状态记录低敏审计字段，终态文本直接提交。只有 READY 等控制信号才在同一 `requestId` 和原 transcript 上追加一次 `toolChoice=none` 收束请求。最多 4 个模型步骤、2 轮工具结果、6 个领域调用。Agent 契约测试继续并入单一测试项，未增加测试数量。下一步是 R8 真实渠道 Gate、取消/重连 smoke 与发布收口。

本轮 WNB 边注与编辑面收口：正文批注片段显示轻量点标，检查器默认紧凑显示，未选中文字时不再常驻大输入框；独立顾问入口已移除，Notebook 默认实时 Markdown 渲染，块用无卡片轨道区分；数据锚点和既有批注/改写/审查操作保持不变。

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
