# 当前产品计划

2026-09-19 推演交互修复已实施：长稿从开头可读，采纳成功清理 Ghost/待保存状态，生成前跟随当前光标、生成中冻结目标，等待区显示阶段与耗时；空白段空格/斜杠菜单放宽到空白文本并保留 IME/模态阻断。定向测试与真实 fixture 浏览器回归通过，完整门禁待确认。

> 2026-07-15 起，Pinax 只维护一份 active 产品级路线图。必要的研究、决策与 agent run 作为证据保留；已完成的执行计划不再独立维护。

## 当前主线

2026-09-19 已编制[跑团 / 联机 / 漫画成熟化夜间总计划](./plan/nightly-20260919-roleplay-online-comics.md)及 [A 跑团 48 项](./plan/nightly-20260919-track-a-roleplay.md)、[B 联机 48 项](./plan/nightly-20260919-track-b-collaboration.md)、[C 漫画 48 项](./plan/nightly-20260919-track-c-comics.md)、[D 全产品长期/视觉巡检 64 项 + 12 个生成质量 Gate](./plan/nightly-20260919-track-d-product-audit.md)。四线从当前 `main@04ed7c8` 独立建树，不设 O 线；阶段完成后继续领取，缺真人、公共 TLS、Electron 或 MiniMax 临时故障时转入本线替补队列，不把外部 Gate 变成整线停工理由。A 聚焦真实同伴/角色知情、崩溃窗、战役与正文出口；B 只封板 C2-3 pilot、恢复、安全和双浏览器，不在 5 次真人 pilot 前扩 C2-4/CRDT；C 聚焦 M7 连续性、正文到分镜、跨刷新生产、QA 和可发布两页样张；D 分层模拟至少 5,000 个长期用户、百万动作和 240 次浏览器 session，捕获至少 500 张产品截图，并用 MiniMax 跑至少 240 次文本、60 次生图和 100 张截图图文审查，实际评估生成文本/图像质量。截图滚动清理，小问题有界自修、大问题短句汇报。当前仅完成计划与调研，未启动 agent、分支、服务、负载、代码、模型调用、合并、推送或部署。

2026-09-19 助手[写作 Skills 方案](./plan/assistant-writing-skills-20260919.md)已交付并验收 S01–S05 底层能力。[文本块显示、助手前端与生图实施计划](./plan/authoring-block-assistant-image-20260919.md)的当前切片已在 `night/block-assistant-image-20260919` 完成：完整块边界、精确选区/块/文稿审稿、主副栏“意见→改写→采用/撤销”、最小中断恢复，以及生图逐张保存/只重试保存/已存成果恢复。确定性全量门禁 20/200 与三尺寸浏览器主流程通过；未合并、未部署、未做真实模型质量和用户最终视觉确认。逐包证据见[续作回执](./agent-runs/block-assistant-image-20260919/continuation.md)。S13–S22 继续原队列。

2026-09-19 组合验收：[记忆/跑团/Agent 夜间计划](./plan/nightly-20260918-runtime-maturity.md)的已交付切片按 A `19f5386`、B `d21f793`、C `48e2fcf`整合，保留主线 HTTP UUID 修复。A 记忆与 C 跑团生产链、B 工具授权组成唯一实现；B/C 重复 KP 不并存。详细回归见[组合回执](./agent-runs/nightly-20260918/integration-summary.md)。下一批优先接真实同伴 provider 与角色知识、真实来源 revision 审计，再推进 T09–T12 与全 Agent 恢复；36 项原队列继续有效，不能把基础合同/注入端口视为全部成熟能力。仅本地合并，未推送部署。

2026-09-18 [资料接入 / 全局 UI / 记忆提取三线计划](./plan/nightly-20260917-sources-ui-memory.md)已完成实际交付切片并组合验收：N-A 的按书资料导入管理与设定入口、N-B 的跨页控件收口、N-C 的历史降噪与有证据提取链已以 `c7ca33b` 合入 main。完整工程门禁、资料/记忆/历史/账本/设定联动及全路由 UI 审计通过；真实 LLM、真机 IME、ZIP 中途失败注入和各分册 partial/not-run 项仍待后续，不把本次切片写成整份储备包完成。漫画和自主跑团剩余项继续保留 backlog；见[组合验收](./agent-runs/nightly-20260917-quality/combination-check.md)。

2026-09-17 侧栏与控件续片及两轮截图纠偏已实施：七类创作侧栏共同字级与焦点规则、简化推演/现场、重排偏好、记忆修订与AI候选分开、旧自动快照安全清理；15:10复验进一步以用户截图将暗色收为中性石墨、标签改为浏览器式连通层，并修复本次会话防崩溃写入误报“发现恢复稿”。四配置浏览器、正常输入/自动保存及上一轮推演304/设定20/试稿21回归通过；最新verify:full exit 0（20/200、lint零警告、双build、架构与diff）；[回执](./agent-runs/workspace-ui-20260917.md)。不是全数据库自动变更日志或全存储管理器，媒体/按书清理与更完整写作偏好尚未实现；视觉等待用户验收。

2026-09-17 白天曾安排 UI 亲自迭代、其余功能交 agent：[集成后 ABC 续作任务书](./plan/abc-remaining-20260917.md)列出 36 个未完成闭环，现作为 backlog，今夜调度与写锁以上方新计划为准。UI 首片采用[当前合同](./plan/workspace-ui-20260917.md)：紧凑标签/产品标识、中性工作区、推演表单转右栏而可采用稿留正文，统一地图与文档容器并细化规则/现场/助手。桌面、900/390 和暗色回归，视觉待用户确认；不宣称已经达到用户要求的最终高级感。

2026-09-17 白天按用户要求统一审查实际交付 A `81aa3f9` / B `c00c59b` / C `0dbca43`，集成事实账本/生产读取/完整ZIP、按书漫画工作区与跑团轻规则切片，并修正事务、作用域、不可变回执和未知请求边界。当前结论见[组合验收](./agent-runs/nightly-20260917/integration-summary.md)，不把功能切片等同整份夜间计划完成。[A续跑48项](./plan/nightly-20260917-memory-continuation.md)、[C续跑48项](./plan/nightly-20260917-roleplay-continuation.md)与[ABC调度修订](./plan/nightly-20260917-ac-dispatch.md)继续承接未完成工作：A重点历史UI/角色知识/来源冲突，B重点跨刷新失败结果恢复及制作闭环，C重点旧分支历史与自主主持/战役。夜间无O，白天Codex统一；后续worker基于新main续作。未启动真实模型、用户数据迁移或部署。

历史依据：2026-09-16 工作区 UI 与记忆修订首切在 `f74545b` 推送 main；固定 Utopia/StoryForge 源码制定[三线总计划](./plan/nightly-20260916-three-track.md)及 A/B/C 分册。当时为调研计划，目前实际实施状态以上方 9月17日组合验收为准，旧计划中的“未启动”不是当前结论。

2026-09-16 工作区一致性修订：用户继续否定各页协调度与切换。解除设定固定最大宽度；移除 AppShell 旧侧栏方向/out-in 动画；标签固定宽度并滚入活动项；统一当前创作页工具栏与素材/漫画表面。地图、体验、联机的内部专业面板未在本轮整体重构，视觉验收仍待用户。

2026-09-16 设定密度精修：用户否定连续正文首版的空旷感。调研 Dabble 导航/操作分工与 Novelcrafter 长短属性排布后，收拢正文、统一动作层级、增加只读目录搜索与非空计数；短属性横排、长文自动高度。数据库、AI 协议与保存 owner 不改，外观仍以用户验收为准。

2026-09-16 用户否定上轮设定表单的框感与长文滚动。本轮改为连续正文与本节直达目录，复用 Autosize；使用指南纳入同一工作区标签。原有世界书绑定与保存链不变，视觉仍待用户验收，不能把自动化通过视为外观认可。

2026-09-16 首页第二轮已获用户认可，跨页统一已实施并通过组合验证：顶层标签成为唯一作品/页面导航，清理旧 mast 和写作页重复书签；重点重整结构化设定，媒体工作区先统一公共工具条与目录。内部专业编辑器不在本轮整体重写，详见[设计合同](./engineering/home-workspace-design.md)。

2026-09-16 用户调整优先级：详细数据库演进延后至后续夜间任务。首页首版被用户否定后，第二轮已接常驻首页/作品标签、分组侧栏、带图标的操作菜单与原创折页封面，保留全部书稿、搜索/排序、书架/列表。复用 workspaceTabsStore 与 Lucide；不增加云同步或改变书稿存储合同。设计及参考边界见[首页工作台设计](./engineering/home-workspace-design.md)，视觉仍待用户确认。

2026-09-16 开始并实施记忆历史 H0/H1 的 Web 首切：数据库采用 Dexie，保留现有候选 owner，以原子本地恢复队列归档不可变修订；入口移入设置与作品助手，ZIP 备份纳入历史。实现和未完成边界见[记忆历史架构](./engineering/memory-history.md)。实体事实表、双时态查询、角色知情传播、永久运行事件及 SQLite adapter 仍是后续工作，不因本轮历史归档完成而自动结项。

2026-09-16 [Web Alpha 夜间硬任务书](./plan/pinax-nightly-web-alpha-hard-tasks-20260915.md)的未交付项已完成组合：普通试演接入受 manifest 限定的单次 `history_lookup` 与作者可读回执，采用稿后果可进入既有 pending memory 审核；完整工作区 ZIP 覆盖 localStorage、来源归档和已落盘媒体并具备预览、校验、回滚和幂等恢复。Authoring/Notes/Prose/Experience/gameStore 与根层 services 全部达到结构预算，Authoring 重面板按需分包，全仓 ESLint 为 0 warning。确定性 provider/浏览器与 64 MB 来源 + 20 MB 媒体 + 100 章压力样本已验收；真实外部 provider 未运行。组合回执见 [integration summary](./agent-runs/nightly-web-alpha-20260915/integration-summary.md)。

2026-09-15 架构收口已经完成当前可安全一次落地的主体：世界书写入统一经过 durable mutation owner，Experience 完整回合编排迁出 store，Authoring 首载/换书与右栏打开顺序各有唯一协调器，Notes 插画交互和 ProseEssay 七键持久化迁出页面；低 fan-in services 完成归域，迁移、试验、兼容与退役代码有显式生命周期。当前不再以继续拆大文件作为独立目标；下一阶段只在真实功能改动经过这些边界时继续瘦身。架构真源见[当前架构与代码边界](./engineering/current-architecture.md)，本轮回执见 `docs/agent-runs/architecture-closure-20260915.md`。

此前三线架构修正已按[修改与集成指导](./agent-runs/architecture-night-20260914/O-MODIFICATION-AND-INTEGRATION-GUIDE.md)完成并按 B → C → A 压缩合入 main；本轮承接并关闭其中明确留下的 B12、A12、世界书异常型写入、Experience turn coordinator 与页面能力边界。组合基线证据见[三线验收回执](./agent-runs/architecture-night-20260914/integration-acceptance-20260915.md)。

夜间计划补充第四层溢出队列与固定控制表：三线主任务全完成后，才可分别进入 Authoring 加载/故障、Experience/store 接缝、ProseEssay/素材公共边界。O 在 T+0:30 至 T+8:00 按固定检查点续派并留时间证据；单次 worker final 不等于该线结束。见任务书 §20–21。

夜间架构任务池最终扩为三层：核心迁移、相邻收口、A10–A13/B11–B14/C10–C13 第三批深挖。执行按任务书 §19 在 T+6:30 前持续续派，同一 worker 提前返回后由 O 在原 worktree 继续派包；最后 90 分钟统一集成。持续时间必须来自有效实施/复核，不使用等待和重复测试凑数。

夜间计划再补 S0–S8：修订验证/UI/世界书/文档交接与 agent-maintenance 的实际偏差，形成“事故证据 → 有界规则修改 → 案例复核 → 下轮触发”的轻量闭环。单包原工时为未校准猜测，不再据此判工作量；技能整理纳入三线写集与 O 集成，详见任务书 §16–17（待执行）。

三线任务书已加量：新增 12 个代码接续包及 D1–D8 文档整理，第一批后继续显式参考/Observer/第二条素材异步链；README、上手说明、架构真源、文档导航与过期内容纠偏是必交，不只更新回执。执行顺序与冻结窗口见任务书 §13–15。

三线夜间架构整理任务书已执行并完成修正集成。A/B/C 的主职责切片进入 main；计划中的 A12、B12 和未启动溢出包仍按 summary 明示为 partial/队列，不由“整合完成”自动升级为 done。

2026-09-14 架构整理持续收口：以[当前架构与代码边界](./engineering/current-architecture.md)作为代码 owner 真源。Authoring 的 navigation、persistence、inspector、scene、scene laboratory、Character IF、rehearsal、intervention 已抽出；Block、Ghost adoption、章节校对以及搜索/替换也分别进入完整 workflow。`Authoring.vue` 已从本轮起点 13,781 行降至 12,823 行。下一阶段按同样尺度处理写作 Agent/inline suggestion 的触发、请求所有权、取消、候选、失效与采用衔接；不是继续拆零散状态。根层 service 迁移保持纯路径变更。

2026-09-14 开始收口 Kao 娱乐化分支：删除可切换 Kao 主题、专用角色美术、独立开场页、冻结旧体验/欢迎页及历史主题截图；`/opening` 仅保留到当前 `/experience` 的兼容重定向。Authoring、设定、推演、地图和通用归档数据语义继续保留，产品不再维护两套视觉/页面树。

2026-09-14 [StoryForge 借鉴、Public Alpha 准备与作者体验三线任务书](./plan/pinax-nightly-storyforge-public-alpha-20260913.md)已执行并完成 O 集成：A 的推演条件/后果合同与 C 的右栏、首访、导入、自救已经贯通，B 的 Node/CI/lint/公共文档/安全入口已进入 main。下一阶段不再扩写这份夜间任务书，先做小范围 Web 内测：真实作者五次完整推演、长试稿延迟与 MiniMax 后果遵约率是产品 Gate；公开前另由作者决定素材权属、许可证、公开 refs 与 GitHub 安全渠道。A11/A12/A13 及 C10–C12 等储备未因主线完成而自动算完成。

2026-09-12 完成并独立复验 [设定页 ↔ Authoring 工作台联动闭环计划](./plan/settings-authoring-linkage-closure-20260912.md)：项目/全局设定上下文、三分区保留、正文精确往返、跨页刷新、删除引用失效和冻结推演 stale 已落地；复验另修 active 世界书加载竞态、全局显式库加载和历史节点路由。联动 Gate 20/20、推演 Gate 304/304；剩余门禁是用户视觉确认与真实作品中重开推演后的资料采用质量，不再继续扩写导航基础设施。

2026-09-12 推演 UI 的 [右栏接入与打磨计划](./plan/authoring-rehearsal-right-panel-polish-20260911.md) R0–R9 与人物行动合同 P2 已完成：当前形态是“现有右栏 + 正文持续可编辑 + 正文 Ghost”，不采用独立专注页。下一门槛是 P4 真实作品五次作者试用；逐步 tool call、历史系统和长期分支不混入本轮体验闭环。

2026-09-12 Web 内测入口 B 线与运营自救线已合入 main：欢迎页改为 Authoring-first，首屏只保留“开始写作 / 导入已有书稿”两条主路径；空白开始只要求书名，创建后自动建立“第一章”并聚焦正文；TXT / Markdown 导入先预览拆章和章名，确认后才新建书稿；首页、设置与手册明确本地保存、无云同步和备份范围。Authoring 另补刷新、正常关页和移动后台前的同步落盘/恢复副本，覆盖尚未等到自动保存的刚输入正文。另提供一页式 15 分钟体验任务和低敏诊断导出，不收集正文、标题、项目 ID、提示词、模型回复或密钥。下一步用一份真实长篇旧稿人工检查拆章，再邀请首批作者完成固定走查。

2026-09-09 修复整合：[第四轮回执](./agent-runs/round4-final-20260909.md)覆盖以下旧启动状态。人物 IF 已接双支规划/确认/独立稿与构思保存；资料接缝纳入默认关闭的显式焦点链；提炼是标明限制的本地初筛和人工候选预览。后续重点是作者真实模型质量验收与真实 AI 提炼协议，不再重复开发已接通的入口。空间/永久分支历史仍是后续实验，不计入本轮修复完成范围。

历史执行依据：[第四轮夜间任务书](./plan/authoring-overnight-round4-20260908.md)与[人物 IF 补充调研](./plan/authoring-character-fate-followup-20260908.md)。单信念IF及接线结果已被09-09整合与后续推演P2承接；空间/回溯仍为后续，不再把该任务书的旧“待启动”表述当当前下一步。

2026-09-06 夜间交付更新：用户确认冻结后，U 最终展开布局及安全修复与 K0–K4 离线模块合入本地 main；K 尚未接资料助手/推演，I0 仍由单 owner 接入。J9/J11、A3 视觉与手机详情优先选择仍待后续，详见 [合并回执](./agent-runs/overnight-merge-20260906.md)。

Pinax 从“AI 文字冒险、世界书、地图、写作、素材和分镜的并列集合”收敛为一个连续的活世界创作系统：

```text
设定 -> 地图 -> 历史 -> 冒险/推演 -> 文本工作台（构思 -> 大纲 -> 正文） -> 分镜 -> 视频 / 音频 / 发布

其中 Authoring 文本工作台是创作核心；素材、速记、画布、记忆和 Experience 是可选输入、投影或推演能力，不是正文创作的必经阶段。纯文字速记与试写优先进入共享编辑器的探索文档，独立素材页允许按真实价值合并、降级或删除。
```

完整路线、数据契约、阶段任务、验收指标与视频渠道策略见：

- [Pinax 产品整合与演进主计划](./plan/pinax-integrated-product-roadmap.md)
- [体验页酒馆能力对齐计划（审阅修订版）](./superpowers/plans/2026-08-11-sillytavern-experience-parity.md)：从属于 G1.4/G4.6，只处理回合事务、上下文可见性、世界书激活、场景角色、记忆恢复与有证据的性能差距；不建立第二条产品主线。
- [体验页叙事连续性与可读性计划](./plan/experience-narrative-continuity-plan.md)：从属于 G1.4/G4.6，修复续写被当成隐藏用户回合、尾部上下文丢失、短碎提示词和半自动重复起势；以 ContinuityFrame、同消息续接事务和真实 provider 多轮 A/B 收口。
- [体验页故事生成质量第二阶段计划](./plan/experience-story-generation-quality-plan.md)：从属于 G1.4/G4.6，在 intent、segment 和回合事务基础上，以 SceneThread、同 transcript BeatPlan、展开度和功能性细节约束解决生成量不足、人物动作重复、描写堆叠与故事缺少局部目标。
- [体验页内容完整性与角色对白第三阶段计划](./plan/experience-content-integrity-and-dialogue-plan.md)：承接第二阶段真实验收未通过项，修复删除后存储不回收、生成篇幅与阅读密度混淆、marker 泄漏、说话者误识别、对白样式多 owner 和 SceneThread 错误写回。
- [体验页叙事运行时与阅读体验收口计划](./plan/agent-runtime-architecture-research-20260814.md)：复核前三轮体验计划后的当前执行真源；先修工具轮次与 provider 超时，再把现有世界书 matcher 接入 NarrativeKernel，以因果拍替代硬字符下限，并收口语义分段与桌面阅读密度。
- [世界书与设定工作区重构计划](./plan/settings-import-and-review-ux-plan-20260817.md)：从属于 G1.2/G1.2.2；重构世界书首页、可恢复创建工作区和详细设定，支持多文件本地文字抽取、精确去重、基础基调与按分区渐进提炼，并统一进入唯一草稿审阅区。
- [素材→画布与 C3 场景素材板计划](./superpowers/plans/2026-08-20-scene-material-loop.md)：从属于 G4.1/G1.5；精确反查同源素材，幂等送入现有画布，并以有界场景板作为默认组织面。
- [桌面创作迁移总计划](./superpowers/plans/2026-08-21-desktop-authoring-transition-program.md)：P1-P8 的执行顺序、所有权和发布门禁真源。
- [P1 桌面项目底座计划](./superpowers/plans/2026-08-21-desktop-project-foundation.md)：Electron 安全边界、本地项目、SQLite/原子文本、备份、缓存、IPC 与最小项目门禁的实施真源；已合并本地 `main`。
- [P2 浏览器旧项目迁移计划](./superpowers/plans/2026-08-21-legacy-project-migration.md)：project-only v3 bundle、v2 兼容 dry-run、稳定 ID、SQLite import journal、staging/校验/原子完成、幂等与最小迁移入口的实施真源；已合并本地 `main`。
- [受控项目记忆系统计划](./superpowers/plans/2026-08-22-controlled-project-memory-system.md)：从属于统一 Agent 能力架构（Foundation Knowledge Facade）；把 memoryCandidates 升级为有来源、有 revision、可解释检索的受控派生记忆层。M0 记忆内核（schema v2、确定性 importance、lexical 排序、来源失效、receipt/容量）与 M1 运行时/UI 接入（四类触发边界、observer 输出进候选 owner、facade memory reader、Authoring 低干扰审阅）代码侧已完成；剩 live browser audit 与真实 provider 3×3 外部门禁。
- [Authoring 文本工作台 v3](./superpowers/plans/2026-08-25-authoring-text-workbench-v3.md)：统一创作工作区的下一阶段真源。探索文档与正文章节共享块级编辑器，大纲升级为项目级编排层，Context Manifest 以 established/intended/speculative 权威和稿件位置选择跨章上下文；场景推演统一为原位 ghost/采纳事务。素材页、画布、记忆和 Experience 只按文本主闭环需要复用，不作为前置。
- [Authoring 前端可靠性与真实用户模拟计划](./superpowers/plans/2026-08-28-authoring-frontend-reliability-and-user-simulation.md)：文本工作台 v3 的前置可靠性切片。Slice 0–5 已完成唯一交互 owner、可编辑长推演、记忆静默幂等、公开组件主链和长文几何，并由确定性浏览器旅程收口；剩真实 provider canary、Windows 原生中文输入法耐久与用户视觉确认，不以自动化通过替代审美验收。
- [Authoring 真实页面可见切片推进计划](./superpowers/plans/2026-08-29-authoring-visible-slice-rollout.md)：承接可靠性前置后的当前前端执行入口。V1–V4 与“落笔上下文闭环 P1”C1-0–C1-7 已完成自动化和真实页面 Gate：长推演与整块重写必经一次性 AuthoringRunSession，人物/地点意图和最多三条速记/素材按目标暂存，生成前后显示 manifest/receipt，结果先进入可编辑 Ghost；故障矩阵覆盖零写入、空返回/超时、迟到/stale、持久化重试、观察器恰好一次和精确失效。最终只保留 1440 当前场+参考、1440 Ghost+回执、390 sheet 三张证据，等待用户审美确认。确认后优先做当前场地点与已有地图轻摘要，不启动地图 P1.7 或完整素材页重构。
- [Authoring F1 双态故事实验室第一阶段实施计划](./superpowers/plans/2026-08-31-authoring-scene-laboratory-f1.md)：C1 之后的当前执行入口，F1-0–F1-7 自动化 Gate 已完成：地点轻桥、真实块下 UI、唯一证据压力投影、稳定方向 fingerprint、production laboratory run、非持久多轴语义/边界投影，以及“唯一所选方向 → 同一冻结 session → 连续可编辑 Ghost → 一次原子采纳多个 writingUnit”。同一 beat 的单元先整体校验，再以一次 ProseMirror history event、共同 origin ref 和 sceneId 写入；现场与大纲 sidecar 共用同一 receipt，保存失败只重试 persist，一次撤销/重做覆盖整拍。最终五视口、亮暗主题、键盘/IME、reduced-motion、快速关闭和导入小说离线复验已通过，只保留三张最终证据；仍需用户确认截图与真实作者文本盲读，之后才冻结第一阶段。不做自动批改后文、第二路由、永久钩子、作者货币、完整素材页或地图 P1.7。
- [Authoring F2 作家助手成熟编辑器能力对齐计划](./superpowers/plans/2026-09-01-authoring-writer-assistant-parity-f2.md)：F2-1～F2-7 代码与自动化 Gate 已实现；构思/推演夹、真实双栏、快捷切换、实体歧义、三来源快捷词、五类取名、只读资料助手、顶栏画师、校对、四域搜索和自动历史均已收口。F2-4 冻结 `AuthoringEvidenceEnvelope`，F2-5 冻结 `AuthoringVisualBrief`，F2-6 冻结稳定 `AuthoringReviewFinding`/位置索引。最终四组真实页面 Gate 合计 152/152，五张证据位于 `/tmp/pinax-f2-final/`；当前只待用户视觉确认，确认后才冻结 F2 并允许 F3 接主页面。
- [Authoring F3 因果故事沙盒与活故事图谱计划](./superpowers/plans/2026-09-01-authoring-causal-story-sandbox-f3.md)：F3-0～F3-5 已完成。`NarrativeIntervention`、确定/候选影响、排演范围、分组 Ghost 与采用回执均保持一次性运行边界；单组继续复用 Notebook/双栏事务，无冲突 fresh 多组通过一次 book persistence transaction 与 umbrella receipt 跨章写入。当前章“场景与因果”从 canonical 正文、现场、世界书与项目大纲即时派生场景/节拍纵列和人物/地点/线索泳道，只显示显式因果与兑现，不建第二数据源。F3 本地闭环保持不感知网络；下一项通过 C2-3 的中立 artifact/promotion 接缝完成一个 intervention 的共同排演。
- [Authoring C2 创作协作平台计划](./superpowers/plans/2026-09-01-authoring-collaboration-platform-c2.md)：C2-0～C2-2 可靠性底座与 C2-3 共同排演代码纵切已完成。作者可从 fresh intervention 建立加密房间；受邀者只见 allowlist 片段与依据，可提方向、补所得/代价和投票；只有房主设备生成只读 branch，promotion 复核后只形成既有本地 Ghost，采用成功才回传低敏 receipt。feature flag 关闭时不注册访客路由，也不装载协作 controller/surface。当前停在 C2-3 pilot Gate：需完成至少 5 次真实双人共同排演并观察 join/reconnect、建议价值及 selected/promoted/adopted 理解度；通过前不展开 C2-4 通用改稿、助手、画师或 CRDT。
- [Azgaar 地图复用与 Authoring 地点闭环调研](./superpowers/research/azgaar-map-reuse-and-authoring-place-integration-20260829.md)：从属于 G2.4，不把地图升级成文本工作台前置。保留 Pinax 世界书真源、生成 Worker、版本/remap 事务，抽取 Azgaar 成熟几何与矢量表现，先修项目级地图作用域、稳定地点身份和地图资产缓存，再以 Canvas 基础地形 + SVG 语义层打通“当前场地点 -> 地图定位/落图 -> 审阅绑定 -> 返回原 writingUnit”。方向确认后再写逐文件实施计划。
- [成熟地图平台 v2 实施计划](./superpowers/plans/2026-08-29-mature-map-platform-v2.md)：G2.4 的地图执行真源。P0/P1 完整分支已集成：`MapDocument v2`、稳定地点身份、OpenLayers 10.10 视口原型、地理优先世界档、写作语义覆盖与用户视觉 Gate 均已收口；P1.7 region/local LOD、P2 资产持久化和 Authoring 地图接线暂停，先完成 C1 落笔上下文闭环。

## 当前优先级

当前夜间优先级以[2026-09-17 资料/UI/记忆三线任务书](./plan/nightly-20260917-sources-ui-memory.md)为准：资料归属与设定接入、全局控件一致性、历史降噪与有效提取并行推进。以下较早段落保留领域背景，不构成重新启动已完成 UI/首访/联动工作或旧漫画/跑团队列的指令。

首夜历史任务：[U/K两条各约8小时任务书](./plan/authoring-overnight-dual-track-20260905.md)。其代码和后续修复已在09-06至09-12集成；具体未完成领域按现代码核查，不重开整份旧队列。

并行建设按[体验主线与设定／历史能力支线计划](./plan/authoring-parallel-foundation-plan-20260905.md)协调（G1.2/G3.1–G3.4/G4.6）：原UI/UX与趣味计划继续执行，新支线先做K0–K4身份/时间/视角合同、只读适配与独立矩阵，不碰页面、主store、存储或现有工具授权；通过后由单一owner在I0–I2窗口接入。长期历史账本H0/H1与工程优化E0–E2按证据排队，不作为现有体验交付前置。[调研依据](./plan/authoring-parallel-foundation-research-20260905.md)明确200条runtime事件窗口、历史sourceRef差异、地点v2身份与Authoring manifest权限边界。本轮交付计划，不启动实现或worker。

Authoring 当前体验收口按 [UI/UX 打磨与故事试演计划（二轮详细版）](./plan/authoring-ux-and-story-play-plan-20260905.md) 推进（G1.3/G1.5/G4.6，承接 F1/F2/F3），[调研证据](./plan/authoring-ux-story-play-research-20260905.md) 区分实页、代码、历史与假设。A0/A1已有局部实现，后续依次为小高度输入遮挡与标题/返回收口、资料与手机任务流、当前场信息归属、统一试演及可读草稿、人物选择/作者改方向/普通稿局部试写；助手历史和跨页回程分包完善，保留试稿/线索玩法/推测影响由真实样板决定是否扩展。详细任务、owner、权限、验收与六波交付见第9–12节。本轮只调研和计划，未实施A2–A5；用户视觉、真实provider和原生设备仍独立验收，以下领域计划不作为此次体验优化前置。

桌面迁移按 P1-P8 顺序推进。P1/P2 已合并本地 `main`；桌面打包运行时修复已产出 Windows x64 portable ZIP，完成 host 侧 ZIP/ASAR/PE 静态检查，随后进入 P3 plain-text editor。迁移保持 copy-first，不删除浏览器 localStorage；Windows clean-machine 门禁前不得宣称桌面发行就绪。

1. Living Atlas：当前优先执行 [G2.4-A 结构化地点目录](./plan/pinax-integrated-product-roadmap.md#g24-a-结构化地点目录当前优先执行)，不再继续扩张地图侧正文地名正则。地理概述只保留叙事和整理依据；城市、城镇、区域、河流与路线以独立世界书地点条目作为作者事实真源，经设定页编辑或 AI 整理草稿逐项确认后再进入地图。地点目录打通后继续 G2.4 的父子区域、相邻求解、remap 评分、LOD 与压力门禁。
2. Living History / World Research：从历史节点进入冒险，并把当前位置、参与者、未决线索、玩家经历和有限世界状态写回运行时。设定主入口已切到结构化工作台；一键 AI 只生成世界概述和创作基调，不再一次生成角色、地点、历史或联网研究大包。结构化页面现为当前世界书条目的编辑视图，保存时按稳定引用 upsert 唯一条目；只有规则、文风和禁写常驻，其他类型继续按需命中，运行时不再全量注入结构摘要。角色字段现在生成可复用角色卡，草稿可直接导入体验页主角档案或人物索引。高级条目管理新增世界书维护工作台，承担自然语言新增、重复/冲突审查和逐项候选写回；体验页 Agent 不负责全局世界书变更。G1.2.2 的结构化端点、整节部分修复、上下文缓存、真实连接探测、阶段状态和 revision 防覆盖代码切片已完成；当前进入 S8 草稿局部意见修订，修订入口放在草稿审阅区，Agent 只生成带版本的新草稿，条目管理只负责最终写入。S7 剩余是 MiniMax M3 Responses、OpenAI-compatible 与 Anthropic-compatible 的真实 Gate，以及完成后清理历史 XML parser。能力矩阵明确区分原生 schema、强制提交工具、JSON object 和不支持，MiniMax M3 关闭 reasoning，M2.x 不再伪装成可靠结构化渠道。小说片段原文继续作为世界书资料持久化，真实历史、地理和制度资料由对应结构字段按需研究与审阅。运行时因果 v3 已覆盖地点控制、角色存活/目标、年代切换/回退、亲属/canonical fact 冲突、显式分支合并和 rollback stale。
3. Place / History / Runtime：统一地点引用和历史绑定，让地图、开场、GM 上下文、事件日志和设定页互相可达；活动冲突摘要进入体验 Agent，完整事件日志不常驻提示词。
4. Emergence：基于地理约束、历史线索、角色状态和当前对话生成可解释事件，完成文本后再通知；候选评分已消费活动因果变化、地点控制/危险度、角色目标、知识、已确认亲属关系和 canonical fact 引用，活动冲突会屏蔽不可信字段与证据，stale 事件不得成为候选依据。
5. Narrative Context Runtime：G4.6 M0-M6 与 G4.6.13 R0-R8 的单 transcript、多步工具、恢复和审计主链已完成。真实性 MVP 进一步加入有界的当前 speaker voice anchor、`world_lookup -> politics_lookup` 只读链，以及与可见生成分离、只记录 allowlist 低敏指标的 shadow critic；它不是生产影子双链，不能生成、替换或改写可见正文。当前只剩真实渠道门禁、质量标注与发布收口。世界书、地理、历史和记忆仍由现有 owner 持有，模型只按需调用只读工具；不恢复 eager 全量注入或静默 fallback。
6. UI Coherence：G1.5 UI-A 至 UI-F 已完成，主题2的浏览器审计、窄屏 pane、共享视觉基础、阅读面、创作空间、设定链和瞬态层均已收敛。全局 task center 随 G4.2 的真实任务合约实施，不在 UI 层复制状态；主题1的米色游戏化 UI 继续冻结，仅保持共享行为兼容。
7. Experience Reading：G1.4 M1-M4 与基础响应式 smoke 已完成；G1.4.10 R0/R1 已冻结主题2标准档为物理 `17.5px`、`62em`、B 型 speaker label、仅真实对白轻斜体和 15% 强调硬上限。R2 已开始收口角色识别和段落节奏：纯叙述不再伪造“旁白”署名，玩家与明确角色只在必要处署名，动作回正体、心理保留轻斜体。下一步继续完成行内强调去重、触发标记、阅读外观入口与移动端避让；随后继续双浏览器联机和 M5 真实模型指标。
8. Writing Notebook：WNB-6A 写作单元重构已完成。schema v3 使用“段落节点 -> 多段 writingUnit -> 场景”，Enter 保持在当前单元，显式 split/merge/move 可单事务撤销；旧整章正文只在首次导入时按至多三段整理为稳定单元，之后不随编辑自动重排，AI 多段正文保持一个来源单元。批注、候选、版本、恢复和体验回合导入均使用稳定 `unitId + nodeId` 与来源引用。写作页已演进为 Authoring 统一创作工作区（canonical `/authoring` 路由），AI 命令以光标/选区命令而非页面模式提供，生成正文经单事务插入并支持请求级撤销；下一步继续常用 Markdown、`targets[]` 与查找同类。
9. Agent Runtime：G4.2 M0-M6 实现 Gate 已全部关闭。统一总开关会同时停止手动顾问与后台补全；写作补全、明显冲突和待审结果提醒均有频率上限及无正文本地指标。旧直连 `useCopilot` 已删除，现代路径使用 canonical task，legacy 兼容只保留真实调用边界。可用后端上仍需补 M2 的 30 次真实 provider smoke，完成后才最终结项 G4.2。
10. Gate 0 可靠性与存储安全网：作为上述主线的支撑项继续补齐，不再单独占据产品主线。
11. Creative Graph：地理、历史、会话和剧情日志来源已沿素材、章节/纲要、分镜、写作 ContextLedger、分镜 Agent 与视频任务贯通；素材页已能按项目和精确 `sourceRefs` 反查同源素材，并将勾选项幂等送入关系画布。画布默认显示 C3 场景素材板，复用现有 card/outline/edge 数据组织关系、节拍与未放置素材；桌面保留自由画布和导演/视频出口，移动端不提供自由定位。漫画 M2-M6 已支持多页改编、语义视觉圣经、自由构图与出版链。下一步进入 G4.4 M7 连续性质检与分镜转换；跨资产 revision/tag、通用 stale 识别和画布 composable 清理保留后续处理。
12. Video MVP：分镜以已确认镜头版本按单镜头提交服务端异步任务，提交前可审阅/编辑含景别、运镜和衔接关系的最终提示词；MiniMax 与自定义异步 HTTP 使用可测试、持久化的浏览器模型配置，后续补第二 direct provider。
13. Online Experience：通过 `/experience/online/:roomSlug` 提供 URL 加入的多人冒险，采用服务端权威有序事件，不同步整个前端 store。

### WNB-5 当前进度

WNB-5 第一至第三大阶段及 F2-6 自动历史接线已完成：命名章节快照、改写前/恢复前自动检查点、恢复前当前正文变更提示、快照删除、每章数量/总存储预算、单块历史、保存前恢复草稿、章节质量报告和 Pinax 备份纳入；已持久化正文跨越 500/1000/2000 字里程碑时可自动创建一次快照，删除选区、Ghost 采纳、批量校对和全书替换等破坏性动作前也复用同一版本库保护。默认版本页只展示当前修订、未保存恢复稿和最近三份整章快照；较早快照、块历史和质量 Gate 仍由底层保存与校验，但不在这一窄栏中全部铺开。下一步在 F2-7 统一完成真实章节恢复的视觉与交互复验。

### WNB-6 当前进度

WNB-6A 已完成：schema v3 writingUnit、v2 一次转换、批注/候选/版本/恢复的 `unitId + nodeId` 迁移、体验回合原子导入、来源回跳与 UI/Gate 均已落地。段中 split、offset 批注迁移、格式 revision、invalid-v3 guard 和导入消息唯一性已在集成审查中补齐。下一步做常用 Markdown、`targets[]`、查找同类和多目标改写。

Cmd Markdown 交互取舍的第一切片已落地：正文精确采用其编辑区的 `Menlo / Ubuntu Mono / Consolas / Courier New / Microsoft Yahei / Hiragino Sans GB / WenQuanYi Micro Hei` 字体栈；当前段保留低强度底色，光标所在视觉行另有更窄的浅定位层。空段按 `Space` 或 `/` 打开单列命令菜单，一级只保留续写、修改上一段、章节审查和插入结构；修改与结构动作以右侧级联面板展开，一级面板始终保留且父项持续高亮，不平铺八项操作，也不以二级覆盖一级。上下键选择，右键仅进入带展开标记的项目，左键收起二级，Enter 执行、Esc 关闭；不展示字母快捷键，也不再使用一级双列布局。窄屏无法并排时二级降到一级下方，仍不覆盖一级。IME composition 不触发命令。段落 AI 修改复用“要求边注 -> 候选 diff -> 用户采用”，不绕过审阅直接覆盖正文，也不制造新的业务写作单元。

空行命令的交互回归已收口：浮层使用 caret viewport 坐标而不是编辑器容器估算，连续方向键不会因 selection update 或整页 `scrollIntoView` 消失。轻续写候选必须先显示完整正文再允许采纳；Notebook 采纳通过编辑器原生事务写入纯文本并使用编辑器历史撤销，禁止再把 ProseMirror 位置当 Markdown 源码偏移拼接。此修复不改变 WNB-6A 的三层单元重构顺序。

续写呈现已从右下角状态卡恢复为正文 ghost text：候选直接附着在请求时的 caret 后，弱化显示且不加边框；Tab/点击全量采纳，Ctrl/Command+右方向键采纳到下一标点，Esc 忽略。Notebook 的生成、失败与重试状态同样锚定正文位置，右下角组件只保留给尚未移除的旧编辑路径。

当前视觉行定位已完成缩放坐标修复：ProseMirror viewport 坐标、Notebook 局部坐标与 `body.zoom` CSS 坐标必须经同一 geometry helper 转换，禁止把 `getBoundingClientRect()` 结果直接作为缩放容器内的 `top/left/width`。长文档 Gate 至少覆盖第 80 段和 0.85/1.0 缩放。

### G4.6.13 当前进度

R0-R7 已完成实现 Gate，2026-08-14 叙事运行时收口计划 P0-P5 已并入。体验主链由 `runNarrativeAgentLoop()` 驱动：assistant tool call、并行 tool result、reasoning opaque metadata 和最终 assistant 正文保留在同一临时 transcript；trace 分 plan/evidence/write/completion 四阶段记录轮数与耗时。工具目录按用户输入只开放当前需要的资料域；BeatPlan 是控制步骤，不占资料轮次，预算耗尽后有界完成。生产 NarrativeKernel 通过 `activatedLore` 确定性接入世界书 matcher。真实性 MVP 已加入有界 selected-speaker voice、world→politics 链与 detached shadow critic；critic 只持久化 allowlist 分类/计数/评分，不保存原文或内容指纹，也无权改动可见正文。下一步是真实渠道 3×3 验收、取消/重连 smoke 与发布收口。

本轮 WNB 边注与编辑面收口：正文拖选使用主题蓝色，并在光标收束端显示只含“批注 / 素材”的轻量浮条；浮条按应用 zoom 反补偿、视口边缘翻转，滚动或点击编辑区外时收起。新批注输入与已保存批注都在检查器边注轨道按选区中点排布，相邻项就近避让；不再把 widget 插入段落、在检查器底部弹出输入卡，或通过块/场景/全章过滤隐藏边注。批注可原位编辑、按批注改写和直接删除，采用改写后同步删除来源批注；历史回复折叠为补充记录。版本只显示最近三份检查点。窄屏无足够边栏空间时检查器改为正文后的工作区内容。

## 已完成执行包

联机模式、Agent 基础契约、关系画布优化、视频任务网关和页面接线已按 A-F 窗口完成实现与集成：

- [2026-07-16 Online / Agents / Canvas / Video 与 Round 2 历史任务板](./agent-runs/current.md)
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
