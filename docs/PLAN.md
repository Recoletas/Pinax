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
- [体验页叙事连续性与可读性计划](./plan/experience-narrative-continuity-plan.md)：从属于 G1.4/G4.6，修复续写被当成隐藏用户回合、尾部上下文丢失、短碎提示词和半自动重复起势；以 ContinuityFrame、同消息续接事务和真实 provider 多轮 A/B 收口。
- [体验页故事生成质量第二阶段计划](./plan/experience-story-generation-quality-plan.md)：从属于 G1.4/G4.6，在 intent、segment 和回合事务基础上，以 SceneThread、同 transcript BeatPlan、展开度和功能性细节约束解决生成量不足、人物动作重复、描写堆叠与故事缺少局部目标。
- [体验页内容完整性与角色对白第三阶段计划](./plan/experience-content-integrity-and-dialogue-plan.md)：承接第二阶段真实验收未通过项，修复删除后存储不回收、生成篇幅与阅读密度混淆、marker 泄漏、说话者误识别、对白样式多 owner 和 SceneThread 错误写回。
- [体验页叙事运行时与阅读体验收口计划](./plan/agent-runtime-architecture-research-20260814.md)：复核前三轮体验计划后的当前执行真源；先修工具轮次与 provider 超时，再把现有世界书 matcher 接入 NarrativeKernel，以因果拍替代硬字符下限，并收口语义分段与桌面阅读密度。
- [世界书与设定工作区重构计划](./plan/settings-import-and-review-ux-plan-20260817.md)：从属于 G1.2/G1.2.2；重构世界书首页、可恢复创建工作区和详细设定，支持多文件本地文字抽取、精确去重、基础基调与按分区渐进提炼，并统一进入唯一草稿审阅区。

## 当前优先级

1. Living Atlas：当前优先执行 [G2.4-A 结构化地点目录](./plan/pinax-integrated-product-roadmap.md#g24-a-结构化地点目录当前优先执行)，不再继续扩张地图侧正文地名正则。地理概述只保留叙事和整理依据；城市、城镇、区域、河流与路线以独立世界书地点条目作为作者事实真源，经设定页编辑或 AI 整理草稿逐项确认后再进入地图。地点目录打通后继续 G2.4 的父子区域、相邻求解、remap 评分、LOD 与压力门禁。
2. Living History / World Research：从历史节点进入冒险，并把当前位置、参与者、未决线索、玩家经历和有限世界状态写回运行时。设定主入口已切到结构化工作台；一键 AI 只生成世界概述和创作基调，不再一次生成角色、地点、历史或联网研究大包。结构化页面现为当前世界书条目的编辑视图，保存时按稳定引用 upsert 唯一条目；只有规则、文风和禁写常驻，其他类型继续按需命中，运行时不再全量注入结构摘要。角色字段现在生成可复用角色卡，草稿可直接导入体验页主角档案或人物索引。高级条目管理新增世界书维护工作台，承担自然语言新增、重复/冲突审查和逐项候选写回；体验页 Agent 不负责全局世界书变更。G1.2.2 的结构化端点、整节部分修复、上下文缓存、真实连接探测、阶段状态和 revision 防覆盖代码切片已完成；当前进入 S8 草稿局部意见修订，修订入口放在草稿审阅区，Agent 只生成带版本的新草稿，条目管理只负责最终写入。S7 剩余是 MiniMax M3 Responses、OpenAI-compatible 与 Anthropic-compatible 的真实 Gate，以及完成后清理历史 XML parser。能力矩阵明确区分原生 schema、强制提交工具、JSON object 和不支持，MiniMax M3 关闭 reasoning，M2.x 不再伪装成可靠结构化渠道。小说片段原文继续作为世界书资料持久化，真实历史、地理和制度资料由对应结构字段按需研究与审阅。运行时因果 v3 已覆盖地点控制、角色存活/目标、年代切换/回退、亲属/canonical fact 冲突、显式分支合并和 rollback stale。
3. Place / History / Runtime：统一地点引用和历史绑定，让地图、开场、GM 上下文、事件日志和设定页互相可达；活动冲突摘要进入体验 Agent，完整事件日志不常驻提示词。
4. Emergence：基于地理约束、历史线索、角色状态和当前对话生成可解释事件，完成文本后再通知；候选评分已消费活动因果变化、地点控制/危险度、角色目标、知识、已确认亲属关系和 canonical fact 引用，活动冲突会屏蔽不可信字段与证据，stale 事件不得成为候选依据。
5. Narrative Context Runtime：G4.6 M0-M6 已建立 Kernel、资源索引、四个浏览器只读工具、联机房主权威、ContextLedger、生产指标和 smoke runner。当前主线改为 G4.6.13 R0-R8：R0-R3 已冻结协议失败 fixture、单 transcript 契约、真实能力探测和四类 provider adapter；R4 已把体验主链切换为同 transcript 多步状态机，R5 已接入 typed repair、工具超时 AbortSignal、空/stale 结果、grounding policy 与 doom-loop 终止；R6 已完成动态工具域、稳定 cursor、确定性排序、关系路径、trust/conflict/stale 和 final evidence report；R7 已接入规范化 SSE step stream、前端事件重组、transcript/ledger/metrics 审计字段、房主状态广播和停止/重试状态操作，终态正文不再经过 clean prompt 重建；R8-B 已加入四渠道矩阵执行器，R8-C 已删除旧 JSON/fallback 链，R8-D 已加入逐渠道 release gate，R8-E 已加入取消与迟到结果恢复 smoke。当前只剩真实渠道门禁、质量标注与发布收口。世界书、地理、历史和记忆仍由现有 owner 持有，模型只按需调用只读工具；不恢复 eager 全量注入、影子双链或静默 fallback。
6. UI Coherence：G1.5 UI-A 至 UI-F 已完成，主题2的浏览器审计、窄屏 pane、共享视觉基础、阅读面、创作空间、设定链和瞬态层均已收敛。全局 task center 随 G4.2 的真实任务合约实施，不在 UI 层复制状态；主题1的米色游戏化 UI 继续冻结，仅保持共享行为兼容。
7. Experience Reading：G1.4 M1-M4 与基础响应式 smoke 已完成；G1.4.10 R0/R1 已冻结主题2标准档为物理 `17.5px`、`62em`、B 型 speaker label、仅真实对白轻斜体和 15% 强调硬上限。R2 已开始收口角色识别和段落节奏：纯叙述不再伪造“旁白”署名，玩家与明确角色只在必要处署名，动作回正体、心理保留轻斜体。下一步继续完成行内强调去重、触发标记、阅读外观入口与移动端避让；随后继续双浏览器联机和 M5 真实模型指标。
8. Writing Notebook：当前最高优先级调整为 WNB-6A 写作单元重构。现有 schema 错把每个顶层段落当业务 block，导致 Enter 直接制造新块；目标改为“段落节点 -> 多段写作单元 -> 场景”三层。Enter 只在当前单元内新建段落，单元通过场景/分隔线、体验回合导入或显式拆分创建。一次成功的体验 assistant 回合默认成为一个带 `session/branch/turn/message/worldbook` 来源的写作单元，但允许作者后续拆分/合并，来源随之继承或并集。完成 schema v3、批注/候选/版本迁移和体验导入事务后，再继续常用 Markdown、`targets[]` 与查找同类。
9. Agent Runtime：G4.2 M0-M6 实现 Gate 已全部关闭。统一总开关会同时停止手动顾问与后台补全；写作补全、明显冲突和待审结果提醒均有频率上限及无正文本地指标。旧直连 `useCopilot` 已删除，现代路径使用 canonical task，legacy 兼容只保留真实调用边界。可用后端上仍需补 M2 的 30 次真实 provider smoke，完成后才最终结项 G4.2。
10. Gate 0 可靠性与存储安全网：作为上述主线的支撑项继续补齐，不再单独占据产品主线。
11. Creative Graph：地理、历史、会话和剧情日志来源已沿素材、章节/纲要、分镜、写作 ContextLedger、分镜 Agent 与视频任务贯通；漫画 M2-M6 已支持多页改编、语义视觉圣经、自由构图，彩色 `rough -> line -> flats -> render -> effects` / 黑白 `rough -> line -> tones -> effects` 的能力门禁、候选审阅、人工替换、遮罩修订和 artifact lineage，以及文字层出版质检、PNG/WebP/PDF、条漫切片和 v2 manifest，并继续沿用 `comic_pages_v1`。下一步进入 G4.4 M7 连续性质检与分镜转换，不增加迁移层。
12. Video MVP：分镜以已确认镜头版本按单镜头提交服务端异步任务，提交前可审阅/编辑含景别、运镜和衔接关系的最终提示词；MiniMax 与自定义异步 HTTP 使用可测试、持久化的浏览器模型配置，后续补第二 direct provider。
13. Online Experience：通过 `/experience/online/:roomSlug` 提供 URL 加入的多人冒险，采用服务端权威有序事件，不同步整个前端 store。

### WNB-5 当前进度

WNB-5 第一至第三大阶段已完成：命名章节快照、改写前/恢复前自动检查点、恢复前当前正文变更提示、快照删除、每章数量/总存储预算、单块历史、保存前恢复草稿、章节质量报告和 Pinax 备份纳入。默认版本页只展示当前修订、未保存恢复稿和最近三份整章快照；较早快照、块历史和质量 Gate 仍由底层保存与校验，但不在这一窄栏中全部铺开。下一步是 provider/浏览器 Gate 与真实章节恢复 smoke。

### WNB-6 当前进度

第一切片已完成单一实时编辑面与标题/引用/行内 mark。调研确认当前“每段一个 block”不符合 Jupyter cell：一个 Markdown cell 可包含多行多段，Enter 只编辑 cell，split/merge 是显式命令。WNB-6A 因此插到后续能力之前，按“schema v3 writingUnit -> v2 一次转换 -> 批注/候选/版本改用 unitId+nodeId -> 体验回合导入 -> UI/Gate”推进；完成后再做常用 Markdown、`targets[]`、查找同类和多目标改写。

Cmd Markdown 交互取舍的第一切片已落地：正文精确采用其编辑区的 `Menlo / Ubuntu Mono / Consolas / Courier New / Microsoft Yahei / Hiragino Sans GB / WenQuanYi Micro Hei` 字体栈；当前段保留低强度底色，光标所在视觉行另有更窄的浅定位层。空段按 `Space` 或 `/` 打开单列命令菜单，一级只保留续写、修改上一段、章节审查和插入结构；修改与结构动作以右侧级联面板展开，一级面板始终保留且父项持续高亮，不平铺八项操作，也不以二级覆盖一级。上下键选择，右键仅进入带展开标记的项目，左键收起二级，Enter 执行、Esc 关闭；不展示字母快捷键，也不再使用一级双列布局。窄屏无法并排时二级降到一级下方，仍不覆盖一级。IME composition 不触发命令。段落 AI 修改复用“要求边注 -> 候选 diff -> 用户采用”，不绕过审阅直接覆盖正文，也不制造新的业务写作单元。

空行命令的交互回归已收口：浮层使用 caret viewport 坐标而不是编辑器容器估算，连续方向键不会因 selection update 或整页 `scrollIntoView` 消失。轻续写候选必须先显示完整正文再允许采纳；Notebook 采纳通过编辑器原生事务写入纯文本并使用编辑器历史撤销，禁止再把 ProseMirror 位置当 Markdown 源码偏移拼接。此修复不改变 WNB-6A 的三层单元重构顺序。

续写呈现已从右下角状态卡恢复为正文 ghost text：候选直接附着在请求时的 caret 后，弱化显示且不加边框；Tab/点击全量采纳，Ctrl/Command+右方向键采纳到下一标点，Esc 忽略。Notebook 的生成、失败与重试状态同样锚定正文位置，右下角组件只保留给尚未移除的旧编辑路径。

当前视觉行定位已完成缩放坐标修复：ProseMirror viewport 坐标、Notebook 局部坐标与 `body.zoom` CSS 坐标必须经同一 geometry helper 转换，禁止把 `getBoundingClientRect()` 结果直接作为缩放容器内的 `top/left/width`。长文档 Gate 至少覆盖第 80 段和 0.85/1.0 缩放。

### G4.6.13 当前进度

R0-R7 已完成实现 Gate，2026-08-14 叙事运行时收口计划 P0-P5 已并入。体验主链由 `runNarrativeAgentLoop()` 驱动：assistant tool call、并行 tool result、reasoning opaque metadata 和最终 assistant 正文保留在同一临时 transcript；trace 分 plan/evidence/write/completion 四阶段记录轮数与耗时。工具目录按用户输入只开放当前需要的资料域（geo 仅在有地点或问路线时暴露）；BeatPlan 是控制步骤，不占资料轮次（资料预算 1 正常 + 1 恢复），预算耗尽追加 typed 消息并以 `toolChoice=none` 强制完成，不再抛“两轮限制”。模型步骤超时按阶段分配（计划 35s / 正文 60s / 补全 45s），整轮 100s 保护上限；本地查询超时作为 unavailable 结果交给正文阶段。生产 NarrativeKernel 通过 `activatedLore` 确定性接入世界书 matcher（常驻/绑定/关键词/starter/预算），新会话少量 starter 或世界概述回退。长度改软区间（open 750-1200 / respond 600-950 / advance 600-950 / extend 350-650），删除按字符下限补全，BeatPlan 需最小因果内容，行文契约收敛五条 + 四种场景模式。非法调用/空协议响应最多进入一次同 transcript 修复；ContextLedger、metrics 和联机状态记录低敏审计字段。Agent 契约测试继续并入单一测试项，未增加测试数量。下一步是真实渠道 3×3 验收、取消/重连 smoke 与发布收口。

本轮 WNB 边注与编辑面收口：正文拖选使用主题蓝色，并在光标收束端显示只含“批注 / 素材”的轻量浮条；浮条按应用 zoom 反补偿、视口边缘翻转，滚动或点击编辑区外时收起。新批注输入与已保存批注都在检查器边注轨道按选区中点排布，相邻项就近避让；不再把 widget 插入段落、在检查器底部弹出输入卡，或通过块/场景/全章过滤隐藏边注。批注可原位编辑、按批注改写和直接删除，采用改写后同步删除来源批注；历史回复折叠为补充记录。版本只显示最近三份检查点。窄屏无足够边栏空间时检查器改为正文后的工作区内容。

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
