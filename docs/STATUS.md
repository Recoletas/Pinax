# Status

<!-- 多 session 共享状态；长期历史写入 docs/LOG.md。 -->

## 当前安排

| Owner/session | Worktree | Branch | Scope |
|---|---|---|---|
| Codex | `/home/recoletas/jiuguan/text-game-framework` | `integration/online-agents-canvas-video-f` | A-F 集成、版本恢复与最终验证；不启动本地 dev server |

## In flight

- **体验叙事 Agent / 按需世界上下文**：G4.6 已完成公开实现调研与 M0-M6 计划。目标不是把世界书、地理、历史和记忆继续压成更长 prompt，而是以最小 scene kernel + 四个浏览器只读工具形成最多两轮工具回传的受控循环；最终正文仍走现有流式渲染，世界变化仍走候选和事务。下一步执行 M0 契约、40 场景 baseline 与现有 ContextLedger 审计，不读取或依赖已公开暴露但未获开源许可的专有源码。
- **UI 一致性与工作区重编排**：G1.5 UI-A 至 UI-F 已完成。主题2的壳、阅读面、创作链、设定链与瞬态层均已收敛；顾问、记忆、联机聊天、模型选择和时间设置共用 Escape、焦点归还、大型浮层互斥与层级 token。无逻辑 `ImageGenRail` 兼容壳已删除。全局 task center 不在 UI 层伪造，随 G4.2 真实 task/result 合约推进；主题1继续冻结。
- **Agent Runtime**：G4.2 M0-M6 实现 Gate 已全部关闭。统一持久化总开关约束手动顾问与后台补全；写作补全、明显 revision/领域冲突和待审结果提醒均为本地、可关闭、受频率限制的被动提示，指标不保存正文。顾问统一使用浏览器已保存的常规文本模型配置，服务端不再注册或默认回退 OpenClaw provider；旧 `useCopilot` 已删除，现代路径与服务端 prompt/mode 全部使用 canonical task。M2 的真实 provider 30 次中文 smoke 仍是 G4.2 最终结项门禁。
- **体验页叙事阅读系统**：G1.4 M1-M4 已完成，指定视口阅读 smoke 已收口。叙事 marker、稳定 message ID、旧文本兼容、clean content、turn/block 与消息操作已接入；1440/1280/900/760/390 的常规及长会话无横向溢出、重叠或 console error，滚动到底后末条正文与输入区保持 52px 间隔，消息操作和移动索引焦点闭环通过。下一步只剩双浏览器联机复用与真实 provider M5 观察。
- **地理 -> 历史 -> 冒险主线**：PlaceEntity、语义点逐项审阅和历史/条目逐项地图入口已贯通；继续推进浏览器 smoke、历史因果和受控状态变化。
- **测试基线收口**：核心与新增联机、Agent、画布、视频契约合计 23 files / 188 tests，视觉基线 12 tests，总量保持 200。
- **跨功能资产收口**：素材已补 `sourceRefs`、内容指纹、章节选区去重和同项目合并；下一步接写作/分镜来源账本。
- **媒体与联机专项完成首版接线**：URL 房间、服务端有序事件、房主生成叙事与受限运行时同步已接入现代体验页；MiniMax 视频已切到官方 `video_generation -> query -> files/retrieve` 协议，通用异步 HTTP adapter 继续保留。
- **A-F 执行包已集成**：Agent 基础契约、画布视口/连线调度、联机服务端与客户端、视频网关和页面接线已汇合；完整验证通过，等待用户在现有服务中做双浏览器与真实 provider smoke。
- **Round 2 可见性与工作流已集成**：体验 mast 提供联机常驻入口；画布顶栏直接提供视频生成，导出菜单只保留导出；节点拖动以瞬时坐标渲染并在结束时写回原始模型，牌堆空白拖动移动整堆；顾问和漫画生命周期已接入。
- **文档收口**：`docs/PLAN.md` 和 `docs/plan/pinax-integrated-product-roadmap.md` 是唯一产品计划入口，旧执行计划不再恢复。

## Recently done

- 2026-07-29：完成 G4.6 体验叙事 Agent 公开实现调研与周密计划：核对当前体验主链仍是“预先筛选 worldbook/geo-history/memory -> 一次流式生成 -> presentation parser”；参考 MIT 许可的活跃 OpenCode 仓库中 step loop、统一工具注册、schema/provider transform、权限、工具结果截断、doom-loop 防护和 compaction/pruning 分层，结合 Anthropic 公开工具协议，确定 Pinax 使用浏览器本地 read tools + Express provider adapter 的混合架构。计划冻结最小 kernel、四工具契约、两轮回传上限、provider fallback、联机房主权威、长会话摘要、M0-M6 Gate、200 测试上限和回滚策略；并核实 2026-03-31 npm source map 暴露事件属实，但相关源码没有成为开源许可代码，未读取或引用该专有源码；未修改运行行为或启动服务。
- 2026-07-26：收口写作顾问模型、上下文与选择链路：顾问复用浏览器文本 API 配置，服务端仅保留 `text-model`；选区、当前段落和光标前后文以明确标签和优先级进入上下文。打开顾问前冻结编辑器选择，正文原位置持续显示淡蓝高亮与信号边，面板同时显示选区/光标摘要，关闭后恢复焦点与选择范围，Markdown 模式共用同一逻辑。轻续使用光标插入式 text patch；所有替换绑定请求时的目标范围和原文，前后端共同拒绝占位结果。成功结果不重复显示，摘要不伪装成领域建议，provider 密钥不进入 prompt。未启动或重启服务。
- 2026-07-24：完成 G1.4 指定视口阅读 smoke：主题2体验页以常规/长会话覆盖 1440、1280、900、760、390 共 10 张截图，全部无横向滚动、fixed/sticky 重叠、截图警告或 console error。交互级 Chromium smoke 在五个视口将长会话滚动到底，末条正文均停在输入区上方 52px；消息操作菜单可由键盘聚焦，900/760/390 的现场索引可用 Escape 关闭并归还焦点。当前 `3001` 对根路径和 `/api/chat/test` 均返回空 502，因此未伪造 G4.2/G1.4 的真实 provider 与联机门禁，也未启动或重启服务。
- 2026-07-23：完成 G4.2 M6 第二阶段并关闭 M6 Gate：顾问结果完成后若面板关闭，角色化入口显示克制的待审数量，重新打开即清除；revision 变化或领域结果越界会显示一次明确的一致性冲突提示。两类提示沿用本地策略，分别有 2/3 分钟上限，不追加模型请求。现代前端默认任务、服务端 mode、OpenClaw 指令和旧 `/advice` 内部默认均切到 canonical task；共享 alias/legacy adapter 仍被主题1与旧客户端实际使用，因此保留而不伪装成可删代码。Chromium 实测待审提醒只伴随原任务的 1 次请求，入口计数显示/清除闭环成立；体验、写作、素材、画布 1440/390 共 8 张审计无溢出、重叠或 console error，测试总量未增加。
- 2026-07-23：完成 G4.2 M6 运行时控制与评估基础阶段：新增统一 Agent 策略和无正文指标 owner，写作页“更多”可持久化开关全部 Agent；关闭后自动补全取消且所有 `useAdvisor` 请求在本地阻断。写作被动补全增加 45 秒跨会话频率上限，指标只保留事件类型、字符数、耗时和短失败原因，最多 120 条并随用户备份。删除已无运行调用、仍直连旧 generation service 的 `useCopilot`，保留的窗口截取和建议清洗迁入纯工具。Chromium 实测关闭状态刷新后仍生效，发起顾问任务时 `/api/advisor/task` 为 0、console error 为 0；1440/390 写作页无横向溢出或固定层重叠，测试总量未增加。
- 2026-07-23：完成 G4.2 M5 分镜 Agent 子阶段并关闭 M5 Gate：`storyboard.review / storyboard.video.prompt` 进入共享执行契约；上下文只包含当前镜头、前后镜头、来源与连续性规则，不发送整份分镜。审阅结果只能修改当前镜头的景别、运镜、时长、画面、转场、对白、声音和备注，应用通过 storyboard version store 新建版本并可在未发生后续修改时撤销。generation request 校验镜头与版本后只写入视频面板的可编辑提示词，不调用媒体网关；既有“生成当前镜头”仍是唯一提交 owner。Chromium 实测应用/撤销形成 3 个版本、确认提示词期间媒体 POST 为 0、console error 为 0；1440/390 画布审计无横向溢出或固定层重叠，测试总量未增加。
- 2026-07-23：完成 G4.2 M5 体验 Agent 子阶段：`experience.next-actions / experience.emergence` 进入共享前后端执行契约，不再映射到章节体检、收线或轻续写。新增受限 Experience ContextEnvelope，按优先级发送最近 8 条语义叙事消息、当前 PlaceEntity/地图状态、当前地点相关历史与玩家历史、已遇角色、精简记忆、未决目标和已有涌现候选；远方无关历史不会进入。下一步选项严格限制为 2-3 个动态中文行动，涌现审阅只能命中请求内 candidate ID，非法数量、越界 ID 或无依据输出整条失败。结果进入审阅托盘但不显示“应用修改”，因此不会替玩家作选择或写世界状态。Chromium 实测 HTTP 只发送分块 envelope，1440/390 主题2体验页无横向溢出、非预期 console error 或固定层重叠；测试总量未增加。
- 2026-07-23：完成 G4.2 M4 画布 patch 子阶段并关闭 M4 Gate：局部组织、相邻关系和镜头转场改为服务端约束的 `canvas-layout / canvas-relations / canvas-transition` typed action。应用前重新构建 selection + direct neighbors + viewport 上下文并校验 revision、允许节点、移动距离、关系类型和转场类型；整批 patch 先在内存验证再一次写入，任何非法节点或动作均不会部分落盘。撤销 receipt 校验相关节点与全量边未再次变化，并恢复完整边元数据；视口滚动不再使结果误判 stale。Chromium 拦截顾问接口实测节点 `(100,100) -> (140,180) -> (100,100)` 应用/撤销闭环，1440/390 主题2画布审计无横向溢出或非预期 console error；测试总量未增加。
- 2026-07-23：完成 G4.2 M4 素材 typed-action 子阶段：分类、拆分、关系任务改为结构化领域 action，结果托盘显示修改预览，应用前重新校验选择 revision 和允许素材 ID。分类支持多项 kind 更新；拆分创建 2-4 个来源可追溯的新素材并归档原素材；关系为双方写入带关系类型依据的 `narrative-asset` sourceRef。三类事务均先完整验证再执行，失败回滚，应用后记录 before/after/created receipt，相关素材未再变化时可撤销。同步修复 `useAdvisor` 修改 raw entry 导致结果托盘不响应的问题。Chromium 实测分类 `inspiration -> event -> inspiration` 应用/撤销闭环，1440/390 素材页审计 0 非预期 console error；测试总量未增加。
- 2026-07-23：完成 G4.2 M4 第一切片：新增素材精简/分类/拆分/关系及画布局部组织/关系正式任务，前后端 registry、allowlist、prompt 和结果模式一致；素材精简进入共享结果托盘，支持完整替换 diff、原文变化 stale、应用与校验撤销。新增 `creativeGraphAgentContext`，素材只发送当前勾选项（最多 8 项），画布只发送选中节点、直接邻居（最多 8 个）和视口，不再发送全素材库、整张画布、outline 或 timeline。修复 420px 以下素材页 scoped global 误编译成 `.theme-legacy { display:none }` 导致整页 0 尺寸的问题，并消除画布移动端固定工具重叠。390px 两页审计 0 非预期 console error、0 固定层重叠；核心 188 + 视觉 12 及双构建通过。
- 2026-07-23：完成 G4.2 M3 第二切片并关闭 M3：新增 `writingProfessionalActions` 作为写作专业任务、target 和 review 领域 action 的 owner；章节体检/收线建议可逐条转为章节纲要或素材收件箱，并为最近一次转换提供章节校验撤销。`Writing.vue` 的 3033 行 scoped/global CSS 原样迁入 external style，页面从 6076 行降至 2979 行，达到首轮 `< 3000` 门禁；1440/390 主题2卷宗宽度、页面高度、横向溢出和 console smoke 通过。核心 188 + 视觉 12、Vite/VitePress build 与 diff check 全部通过。
- 2026-07-23：完成 G4.2 M3 第一切片：新增 `AgentResultTray` 与纯函数 `writingAgentTransaction`，专业结果显示原文/修改后 diff、review 建议、应用/stale/撤销状态；多 patch 先统一校验范围、baseText 和重叠，再一次写入正文，任一动作失败时正文保持不变。应用生成绑定章节与应用后正文的 receipt，只有正文和章节未变化时才能撤销。写作工具栏删除绕过 Agent Runtime 的旧扩写/改写弹层，统一打开专业任务托盘；选区改写/扩写/压缩、段落修正/衔接、收线、章节体检和轻续写均显式绑定冻结任务。现有 6-test 写作测试内增加事务覆盖，测试数量不变。
- 2026-07-23：修复主题2偶发整页缩小：`AdvisorPanel.vue` 在 scoped style 中使用了不完整的 `:global(.theme-legacy) .child` 写法，Vite/Vue 编译后子选择器被丢弃，使顾问面板的 `width: min(430px, ...)` 与 `font-size: 13px` 直接命中根 `<html>`。现已把整条主题后代选择器纳入 `:global(...)`；主题2的体验、写作、素材、画布、漫画五页在 1440px 冷启动检查中均保持根宽/内容宽 1440px、根字号 16px，未启动 dev server。核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过。
- 2026-07-23：完成 G4.2 M2 写作低打扰补全实现：新增 `useWritingAgent` 与 `WritingInlineCompletion`，把原先关闭自动触发且无 revision 防护的 `useCopilot` 页面接线替换为统一 AgentRunner 请求。上下文由 `writingAgentContext`、`writingAgentReferences` 和 worldbook builder 组成，ledger 增加 chapter/asset source refs 且不保存正文。普通输入停顿 900ms 才触发，IME、粘贴、拖放、Undo/Redo、选区和短上下文不会请求；迟到响应按内容+光标 revision 丢弃。支持采纳一句/全部、一次独立撤销，连续三次失败进入 60 秒冷却并显示轻量状态。1440/390 无横向溢出；当前运行后端仍是旧版，真实 provider 30 次门禁待重启后执行。核心 188 + 视觉 12 及双构建通过。
- 2026-07-23：完成 G4.2 M1 AgentRunner 与 ContextEnvelope：修复高优先级规则块标记 truncated 后整块不进入 prompt 的问题，实际保留预算内片段，并为所有进入、截断和丢弃块记录原因。前端顾问请求不再发送旧 `context`，HTTP body、服务端重裁剪与 provider prompt 共享同一序列化契约；服务端拒绝缺 revision、非法预算、越权 surface/target 和元数据超限。新增 OpenClaw / 常规 text-model provider adapter、显式 fallback、超时与 capability 检查；响应包含 budget、token 估算、source refs、target revision 和 ledger，本地 trace 不保存正文、问题或密钥。单个 Agent 契约测试扩展覆盖三段 source/order 一致性，测试总数仍为核心 188 + 视觉 12。
- 2026-07-23：完成 G4.2 M0 Agent 合约冻结：新增前后端共享执行契约，只保留 `writing.fix.selection / fix.paragraph / continue.light / close.thread / chapter.health` 五个真实任务及旧名称兼容映射；服务端在调用模型前区分 missing、unknown、unavailable 并返回稳定错误码，OpenClaw 删除未知任务回退章节体检。前端任务目录暴露 availability、owner、actionTypes；Agent action/result validator 拒绝未知写操作。现有 `agentContracts` 单测试扩展为参数化前后端一致性门禁，测试总量未增加。
- 2026-07-23：完成 UI-F 瞬态层统一与结构清理：新增 `useTransientLayer`，统一顾问、记忆候选、联机聊天、角色入口、图片/视频模型选择和时间设置的 Escape、焦点归还及大型浮层互斥；主题2顾问改为窄审阅托盘，记忆改为低干扰档案层，短生成通知补 `role=status`。写作与主题1体验页改为直接使用 `MediaGenerationDrawer`，删除无逻辑 `ImageGenRail` 壳。主题2八工作区 1440/390 共 16 张截图无横向溢出或非预期 console error；顾问/记忆桌面与手机交互 smoke 通过。联机房间因本地未进入舞台，本轮只完成代码接线，双浏览器仍待真实联机 smoke。
- 2026-07-23：完成 UI-E 设定、地理与历史视觉统一：主题2快速导入压缩为连续档案首页并修复移动端 flex 收缩导致的主按钮溢出；结构化设定从卡片墙改为分类索引与连续横线稿；地图空态显示当前世界、地形模板和国家数，世界树在手机默认收起并可覆盖展开。1440 / 980 / 390 的主题2审计无横向溢出和非预期 console error，主题1三个入口 390px 共享行为 smoke 通过。既有“设定 -> 地点 -> 历史 -> 体验”入口保持贯通；真实地图数据态仍需随地图产品 smoke 验收。
- 2026-07-23：完成 UI-D 创作空间精修：素材三栏收窄辅助区、清除 12 格演示空态并修复 390px 顶栏逐字挤压；画布合并三个重复空态入口，桌面主舞台占工作区 81%，保留原拖拽与关系状态机；漫画移除重复素材导航，建立“页面计划 / 整页制作 / 当前格制作”层级，建页改用格数与真实版式缩略图。三页空态/常规态 12 张主题2截图无横向溢出和 console error，漫画移动版式切换 smoke 通过；未增加测试数量，未启动 dev server。多页改编和真实逐格生成仍按 G4.4 推进。
- 2026-07-22：完成 UI-C 阅读面精修：体验页将等高线限制在现场索引，正文以短边信号、署名和段落节奏区分角色；消息编辑/重写/删除统一到可聚焦的触屏可达操作菜单，空态只保留一个主动作。写作页以 880px 轴统一标题、工具栏、正文与页脚，移动端章节索引改为可关闭 sheet，低频顶部操作收入“更多”。真实长会话、约 5000 字章节、空态、移动编辑和主题1共享行为完成浏览器 smoke；未增加测试数量，未启动 dev server。
- 2026-07-22：完成 UI-A 移动工作区重编排首轮：新增固定主题2的浏览器审计脚本；体验、素材、画布、漫画在窄屏改为 sheet 或任务 pane，默认主任务与辅助工具均真实可达；主题2四档截图、390px pane/焦点交互及主题1共享行为 smoke 通过，未启动 dev server。M0 数据状态 fixture 留待下一轮。
- 2026-07-22：收口 UI-A 状态审计：画布页增加克制的生成失败状态带；审计脚本以真实点击和 `/api/generate` 网络拦截覆盖桌面/手机生成中与失败态，4 张截图均无非预期 console error，未增加测试数量。
- 2026-07-22：完成 UI-B：正式引入 `lucide-vue-next` 图标 owner，并把 Playwright 声明为审计开发依赖；AppShell/ActivityBar 去除罗马编号与重复 SVG，主题2设定次级导航改语义图标；新增共享 `ContourField`，由壳、体验阅读面、关系画布复用且主题1禁用；补共享控件、层级和 motion token，修复同 activity 转场因 watcher 不触发而沿用跨区方向的问题。16 张主题2总览无溢出/console error，五工作区键盘切换及 reduced-motion smoke 通过。
- 2026-07-21：补全 Pinax 空间场纹理语言：等高线被定义为地理、可能性空间与叙事压力的局部表达，并与索引点阵、工程网格、档案路线明确分工；文档加入尺寸、透明度、遮罩、动效、页面组合、响应式退让和截图验收基线。本轮只改设计规范与日志，不启动 dev server。
- 2026-07-21：参考终末地官网实际背景资产与 CSS（`points-bg` 局部点阵透明度约 0.08、`wave-bg` 局部等高线、斜纹遮罩约 0.05）打磨素材页与卡片画布，未直接引入官方资产。素材页关闭旧主题全屏纸纤维点阵，改为右下局部渐隐点阵与阅读台下半部等高线；素材索引纸条增加顶端夹片、右上折角、底部叠纸边、内高光和分层阴影。画布关闭根节点全屏三层点阵，将工程网格放宽到 96px，等高线从右下局部进入，点阵只在角落渐隐；节点卡增加底部叠纸边。1440px 截图复核通过，900 / 390px 两页横向溢出均为 0；核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-21：写作页首轮打磨：修复 textarea Tab 缩进先改 Vue ref、随后又被旧 DOM 值覆盖的根因，改为 textarea 与状态同步更新；单行 Tab、Shift+Tab 反向缩进和多行整体缩进均通过 Chromium 复现验证，“编辑 / Markdown / 预览”模式往返内容保持。章节编号移到页边索引，标题、工具栏、正文和页脚统一到同一条可伸展写作轴，不再以固定 900px 居中制造宽屏两侧空白；1440px 下卷宗 1158px、正文 1070px，只保留正常纸面页边。收窄标题分隔，移除胶带、厚重纸堆阴影和明显墙面竖纹，背景改为极浅蓝白平面与低对比斜向结构层。1440 / 900 / 390px 无横向溢出；核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-21：修复体验页多角色身份不清：兼容解析器支持“角色：台词”“角色说：台词”“台词，角色说道”三类明确署名，消息内无署名台词仅使用非通用角色名兜底，不跨消息猜测；旧 parser presentation 按 v2 懒重建。显示层让玩家回合始终保留身份，显式 block speaker 优先，未署名 assistant 台词保留 turn 标签；同角色连续块收敛重复署名，叙述会自然断组。角色名保持无框，仅加强字重、字号和间距，并统一两套主题。随后修复消息操作区与正文间 8px hover 断层；删除现场索引拥挤的英文微标，参考终末地官网的中性底面与局部工业信号语言，将索引展开态、详情顶边和时间锚点改成矿物黄/墨蓝/雾面钢青硬分段色条，横条 3px、详情顶条 4px、方向标 4px × 34px，并使用斜切端点；黄色只占短起始段，墨蓝承担主体，钢青负责收尾。所有面板背景收敛为仅混入 2%–3% 蓝色的长蓝白过渡，不再混合红灰多段渐变。体验输入主动作从含义不清的“记入”恢复为“发送”，移除把用户消息数量显示成“已记 N 段”的突兀统计。修复 `TimeSettingsForm` 动态子组件样式失效及 `NarrativeTurn` 拆分后编辑器/保存按钮仍被父 scoped CSS 隔离的问题，编辑态现由实际 DOM owner 统一维护。1440px 页面与详情层截图检查通过，390px 横向溢出为 0；核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-20：修复 G1.4 M4 阅读预设引入的体验页视觉回归：移除每条 turn 的 `max-width`，正文恢复占满中心工作列，预设只调字号/行高/间距；删除错误覆盖主题动作条的 scoped `:deep()` 样式，恢复页边批注式定位、hover/focus 显示、22px 图标按钮和窄屏收回逻辑。核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-20：执行 G1.4 M3-M4：新增 `NarrativeTurn.vue` 与 `NarrativeBlock.vue`，将体验正文的语义块、消息身份、编辑器和消息级操作从 `GamePanel.vue` 拆出；编辑、删除、重写后续仍作用于整条 message，普通台词没有独立操作；操作从不可聚焦的 span 改为带 tooltip/aria-label 的真实 button。体验页顶部现有操作区加入舒展/标准/紧凑阅读预设，字号、行高、阅读宽度和消息间距由 CSS variables 控制，偏好保存至用户 localStorage 并纳入备份契约，不写入 session/online event。核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-20：执行 G1.4 M0-M2 首轮：新增 `narrativePresentation.js`，用行首 `narration/action/dialogue/thought/system` marker 生成可重建 presentation blocks；旧格式按确定性规则回退，marker 前说明、损坏 marker 和流式未闭合行不吞正文。新消息生成稳定 ID，流式 UI、chatHistory、记忆、状态提取、机制检测和联机事件均消费 clean content；统一 `InputArea`、初始化与旧会话继续生成的格式提示。体验正文在同一 turn 内显示语义块，普通台词不因渲染自动可点击，动作/心理保留克制斜体，系统块才使用淡背景。核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动 dev server。
- 2026-07-20：核对本地 SillyTavern `1.17.0-1-g004f1336e` 与上游 release `1.18.0` 的 Flat/Bubbles/Document 消息壳，结合 Apple Books 阅读配置与 WCAG 2.2 Text Spacing，在主路线 G1.4 写入体验页叙事会话/阅读系统计划；明确 content 事实源、可重建 presentation blocks、结构生成 + 确定性降级、Tavern 消息操作、联机复用和不超过 200 tests 的门禁。本轮只改文档，未启动 dev server。
- 2026-07-20：体验页继续收口：删除已经迁移到素材页的 `ImageGenRail` 挂载、import 与定位样式，顾问弹层改为独立挂载；中间正文随工作列展开，1440px 实测正文宽 928px，使用 17px / 1.95 行高、24px 段距和更克制的玩家字重。右侧现场索引扩大到 304px，并从标签/数量/更新/摘要/详情五列挤压改成“主摘要 + 次动作”两列；浏览器实测无生图节点、无横向溢出，未启动 dev server。写作页此前的空状态、视口高度和正文工作轴修正保持不变。
- 2026-07-19：漫画格框统一驱动四/六格、强调版式、当前格、manifest 和导出；中央整页上限扩大到 920px，三栏调整为 220/主区/320，画布外缘收至 8px，页内边距/格间距为 24/10 设计像素。页面规划提供实时缩略图和格框小样；中央整页的文字框可直接拖动并通过八向控制柄缩放，松手同步右栏、存储和 PNG，同时支持六类字体、10-72 字号、字重与对齐。Chromium 验证中央移动、右下/左上缩放均写回，1440px 页宽 884px、900px 页宽 444px，均无横向溢出和控制台错误；未启动 dev server。
- 2026-07-19：漫画制作保留独立 `/comics` 工作区，但入口和右侧模式导航均与素材页的“相关素材 / 插画生成 / 漫画制作”三联入口对齐，可带当前素材往返文字与插画模式。漫画页恢复素材页的 260/主区/340 三栏比例、左侧素材抽屉纸面和右侧副阅读台外观；素材选择只写入当前格 `continuityRefs`，不再自动填画面描述。单格生图改为连续性优先：MiniMax 不再把长负面词串拼回正向提示，而以原素材、全页视觉约定、上一镜锚点、当前剧情推进和摄影设计组成短提示；支持参考图的渠道仍复用上一格成图。`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check；900/1440px 浏览器回归通过，未启动 dev server。
- 2026-07-19：`integration/online-agents-canvas-video-f` 修复漫画批量补齐把单格画成多格拼贴的问题：提示词强制单幅当前瞬间、无边框且无任何文字，并纳入原素材、页级视觉规则、当前镜头和上一格视觉锚点；支持参考图的 provider 复用上一格成图，MiniMax Image 使用文本锚点降级。脚本对白/旁白不再自动进入预览和 PNG，改为可明确排入、添加、编辑、拖动和缩放的对白/心声/旁白/拟声文字对象。`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check；1440px 浏览器回归通过，未启动 dev server。
- 2026-07-19：漫画副工作台拆为“页面规划 / 分格制作”，默认将格序导航、模型和当前格制作前置；空白态真实支持 4/6 格，页面与格级编辑补齐阅读方向、视觉连续性、剧情 beat 和构图调度。修复 Notes 在 AppShell 内重复使用 `100vh` 导致右栏底部裁切的问题，900px 窄屏仍保留素材索引/主区/副工作台且无横向溢出；左侧斜放便签改为轻微错落、柔和纸影和压印选中态。`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量 200；未启动 dev server。

## Next up

1. 执行 G4.6 M0：冻结 NarrativeKernel/tool call/result/turn capability 契约，用不少于 40 个场景记录当前 eager context 的命中、字符、事实错误与延迟 baseline；不改变生产生成路径。
2. 在可用后端上完成 G4.2 M2 真实 provider 中文正文 30 次 smoke，记录过期响应、误触发、失败冷却、建议长度和有效率；通过后才将 G4.2 从“实现完成”标记为最终结项。
3. 完成联机双浏览器 smoke，验证聊天展开时与记忆、顾问和系统通知的真实互斥及断线恢复。
4. 执行 G1.4 M5：用真实 provider 观察 marker 遵循率、speaker 准确率、fallback 率和首块延迟，按门槛决定是否增加结构修复调用。
5. 完成真实浏览器 smoke：地图重复生成、历史开局、冒险写回和状态回滚。
6. 把控制权、角色状态、年代冲突和下游 stale 标记接进 runtime 因果报告，并作为体验 Agent 的受限上下文与候选动作来源。
7. 漫画进入 G4.4 M2：实现同一素材的多页改编候选、页级 beat/page-turn hook，并从角色、地点、已有插画建立可审阅的语义视觉圣经；M6 已有文字对象和基础字体排版，但气泡尾巴、溢出/遮挡检查和 manifest 往返仍留在后续门禁。测试总量继续保持不超过 200。
8. 用已保存配置分别完成一张 MiniMax `image-01` 插画和一条 6 秒 / 768P 单镜头视频真实 smoke；确认图片归档、景别/运镜/衔接指令及临时视频地址处理。

## Working rules

- 不启动用户已经运行的 dev server，也不替用户处理后端 LLM 配置。
- 不回滚其他用户 WIP；修改共享文档时只保留当前事实和可执行下一步。
- 新功能先写入当前主计划对应 Gate，避免重新创建独立平行路线图。
