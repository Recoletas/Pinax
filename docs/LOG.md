# 开发日志

> 只记录近期用户可感知变化、验证结果和仍会影响后续判断的风险。过程性 UI 微调不再逐条保留。

## 当前摘要

- 产品主线正在从“文字游戏 + 写作工具集合”收口为“可玩的世界书”：进入世界、冒险、沉淀剧情，再写成作品或整理为分镜。
- 根路由真实首屏现已收口到 `src/views/WelcomeView.vue`；历史残留 `Home.vue` 已清理，不再保留并行假入口。
- 当前主要稳定链路：体验页 -> 世界书/设定 -> 素材 -> 卡片画布/分镜 -> 写作出口。
- 当前产品主线已调整为：地图结果 -> 地理语义 -> 历史草案 -> 历史开局 -> 冒险运行时 -> 玩家历史；地图 Worker 和存储安全网作为支撑项推进。
- 当前验证基线：20 个测试文件 / 200 个用例；Vite/VitePress build 与 diff check 通过。历史 40/322 与视觉 12 项属于旧测试结构，不再作为当前上限。

## 2026-08-18 - WNB-6A 与体验真实性 MVP 集成

- 写作 Notebook 升级到 schema v3：连续段落归属稳定 writingUnit，Enter 不再制造业务块；显式 split/merge/move、批注/候选/版本/恢复、v2 迁移和体验 assistant 回合带来源导入已经贯通。
- 体验运行时加入当前 speaker 的有界 voice anchor、world→politics 只读查询链和 detached shadow critic；critic 不参与可见正文生成，只保存 allowlist 低敏指标，不保存原文或内容指纹。
- 集成审查修复段中 split 双事务、split offset 批注迁移、格式-only revision、invalid-v3 静默回退、显式 message 唯一性、角色集合预截断、politics limit 与 critic 指纹隐私，并补齐“收进稿件”弹窗初始焦点、focus trap、焦点恢复和页面滚动锁。
- 组合定向测试 5 个文件 / 57 个用例通过；`npm run smoke:narrative-recovery`、60 项 production dry-run 与 `npm run verify:full` 通过，完整基线为 20 个文件 / 200 个用例以及 Vite、diff check、VitePress build。没有现成服务可用，因此未启动服务，也未执行真实 provider 矩阵和 1440/390 live browser audit。

## 2026-08-11 - WNB-6A 写作单元重构调研

- 对照 JupyterLab 与 nbformat 确认：Enter 在 edit mode 内编辑当前 cell，一个 Markdown cell 可以承载多行、多段正文并拥有稳定 cell id；cell 的创建、split 和 merge 是显式 notebook 操作。Pinax 当前 schema v2 把每个 ProseMirror 顶层段落直接赋予业务 `blockId`，因此 Enter 即新块，段落、AI 单元和版本单元被错误合并为同一层。
- 方案改为 `排版节点 -> writingUnit -> scene`：一个 unit 包含多个标题/段落/列表，Enter 只新增内部段落；unit 承担稳定来源、revision、Agent 上下文和版本，节点承担精确选区与批注。普通界面保持连续小说稿，不复制 Jupyter 的框、command mode、运行按钮和输出区。
- 一次成功的体验 assistant 回合是最可靠的初始 unit 来源边界，导入时保留 session/branch/turn/message/worldbook 引用；它不是不可变编辑边界。作者拆分时来源继承，合并时来源去重并集，AI 的上下文单元与实际 patch 范围保持分离。
- Cmd Markdown 只借连续输入、即时排版、快捷格式、目录与批注，不恢复源码/预览双模式，也不引入博客发布、图表和技术文章工具。知乎只借编辑/阅读连续性、长文低干扰和按小节校对，不复制公开文章、社交分发与运营结构。
- 主路线图新增 schema v3、一次转换、批注/候选/版本迁移、体验回合导入和浏览器 Gate；该阶段先于 `targets[]` 与查找同类。本轮只完成调研与计划，没有改动运行行为。
- 完整 `npm run verify:full` 通过（40 个核心测试文件 / 321 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）；未启动或重启服务。

## 2026-08-11 - WNB-6 当前段与空段命令

- 通过真实页面计算样式确认 Cmd Markdown 编辑区使用 `Menlo, Ubuntu Mono, Consolas, Courier New, Microsoft Yahei, Hiragino Sans GB, WenQuanYi Micro Hei, sans-serif`，Notebook 默认字体与字体选择项已精确切换到该栈，不再使用上一轮近似的普通无衬线方案。
- 当前排版段背景从 4% 降至 2.5%，另根据 ProseMirror caret 坐标和实际 `line-height` 绘制只覆盖光标视觉行的 3.5% 浅层；滚动、选区变化和失焦同步更新，不改变正文尺寸和行宽。
- 空段聚焦时显示“按空格或 / 调出工具”。命令改为 AI 续写、改写上一段、扩写上一段、精简上一段、审查本章、小节标题、引用/题记和场景分隔；删除正文、多级标题和列表堆叠。桌面两列四行完整可见，窄屏单列；方向键、Home/End、Enter、Esc、字母直达和 IME 保护保持有效。
- AI 续写复用内联补全，章节审查复用分批审查；三种上一段修改先生成精确范围边注，再在边注内生成候选 diff，用户采用前正文不变。可控 503 浏览器检查确认失败时边注和原文均保留，没有静默写回。
- 完整 `npm run verify:full` 通过：40 个核心测试文件 / 322 个用例、12 个视觉用例、Vite/VitePress build 和 `git diff --check` 全部通过。
- 首次聚焦不一定产生 ProseMirror selection transaction，因此 focus 现在会显式刷新 Live Preview decoration，blur 会关闭菜单。浏览器检查覆盖空章命令执行、1440/390 普通正文和横向溢出，未启动或重启服务。
- 完整 `npm run verify:full` 通过：40 个核心测试文件 / 321 个用例、12 个视觉用例、Vite/VitePress build 和 `git diff --check` 全部通过。

## 2026-08-11 - WNB-6 Live Preview 与关联批注计划

- 复核当前实现后确认：默认 Notebook 已是结构化富文本编辑面，但列表和代码块仍会在导入时压平成普通段落，此前“完整实时 Markdown”表述不成立。第一切片只在光标所在标题、引用块的语法槽露出 `#` / `>` 标记，普通阅读状态不增加噪声；随后按实际使用反馈删除源码/阅读模式，只保留这一实时编辑面。
- 新增 WNB-6 执行阶段：补齐常用 Markdown 节点往返；把一条批注扩展为有序 `targets[]` 并通过“加入当前批注”收集非连续片段；“查找同类”先在当前章/书本地召回，再由模型复核 8-12 条短名单；用户确认后才并入同一边注。
- 多目标改写继续使用候选与 stale gate，以单 transaction 全有或全无地提交。明确不以浏览器原生非连续 DOM 选区作为状态真源，不把整章/整本直接交给模型搜索，也不复制成多条相同批注。
- 删除模式入口前先修复了源码编辑后切回实时预览未同步 `writingDocument` 的模式往返错误，确保历史临时编辑不会丢失；当前产品界面已不再暴露该模式。
- 根据实际写作路径删除源码与阅读模式，只保留 Notebook 实时编辑面。新增中文友好的标题输入规则：段首第二个 `#` 直接转二级标题，第三个升级三级标题，`#标题` 无需空格也能转换；移动端语法槽禁止换行，`###` 不再折成竖排。
- Chromium 在 1440/390 下确认 `## -> h2 -> ### -> h3`、单一编辑面、零横向溢出和零 console error；完整 `npm run verify:full` 通过（40 个核心测试文件 / 313 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）。未启动或重启服务。
- 标题不再切换到独立展示字体，继承正文同一字体。Live Preview 扩展到段落任意位置的粗体、斜体、删除线和行内代码：输入规则继续由 Tiptap 转换，光标进入已格式化片段时局部显示成对 Markdown 标记，移开后只保留排版结果。
- Chromium 在 1440/390 下确认四类行内格式、局部标记、标题/正文同字体、零横向溢出和零 console error；完整 `npm run verify:full` 通过（40 个核心测试文件 / 319 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）。

## 2026-08-11 - 体验页酒馆能力对齐计划审阅

- 对照当前体验页、G1.4/G4.6、现有 Agent/联机/世界书/记忆/备份链和本地 SillyTavern 1.17.0，审阅并重写外部产出的 7126 行 cross-source parity 计划。
- 原计划将 60 个来源模式拆成约 55 个新文件，存在跨产品范围失控、重复 SSE/Abort/loop guard/provider/vector/backup、只建 contract/store/component 不接线，以及为每个小字段新增测试文件等问题。
- 修订版改为 R0-R7：基线、回合事务与非破坏性分支、导演注与上下文回执、世界书激活语义、场景角色编排、记忆与恢复、有限输入动作、基于测量的性能与可访问性。首要风险明确为 `regenerateFrom()` 截断正文却没有同步回滚运行时状态。
- 计划从属于 G1.4/G4.6；不依赖 Superpowers 工作流，不新增产品主线。本轮只改文档，未改变运行行为。完整 `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）。

## 2026-08-11 - 死文件清理与共享进度收口

- 删除零调用的旧写作结果应用器、未接入的地图边界地形实验和与现行 renderer 重复的国家纹理 helper；同步修正代码地图与地图 ADR/RFC，不改变现有运行路径。
- 删除已被长期日志吸收的临时 WNB/G4.6 阶段报告和已执行完的审计草稿；保留当前体验排版基线、WNB-0 spike、R5/R7 证据报告和酒馆能力对齐计划。
- `docs/STATUS.md` 收敛为当前事实、最多十项最近完成和可执行下一步，历史细节继续以本日志及主路线图为准。
- 提交本地累计成果后合并远端 4 个提交：全局锁定主题2亮色、修复手册相对链接、同 preset 世界书按来源 ID/内容签名复用，以及对应手册更新。冲突处理保留了本地显式 `worldbookId` 路由，并删除远端测试对 Pinia 只读 getter 的无效覆盖。
- 合并后 `npm run verify:full` 通过（39 个核心测试文件 / 309 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）。

## 2026-08-11 - 写作页顾问收口 + 实时 Markdown 编辑面

- 移除写作页独立的顾问按钮、浮动顾问入口、顾问面板和选区遮罩；批注、改写候选、章节审查和版本检查器成为唯一的写作审阅入口。改写/审查仍复用现有任务请求链路，不改变候选 stale 校验、原子采用和取消重试。
- Notebook 默认编辑面明确标为“实时 Markdown”：普通 Markdown 在同一编辑面实时显示标题、强调、引用等格式，原始 Markdown 与阅读预览保留为辅助模式。块不使用卡片，改为浅色纵向轨道，当前块获得更强标记，便于扫描段落边界。
- 体验页使用的 `:::narration` / `:::dialogue` 等传输标记在进入写作 Notebook 时复用叙事解析器剥离，只保留正文，不会作为控制行泄漏到写作内容。
- 右侧改写面移除无目标时的长说明，只在存在目标时显示目标片段；无候选状态收缩为单句提示。完整 `npm run verify:full` 通过（39 个核心文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）；现有服务上的主题2写作页 1440/390 审计为 2 captures、0 console errors，窄屏三列残留已修复。未启动或重启服务。
- 编辑面移除“实时 Markdown · 块数 · 修订”状态行；批注正文统一放入右侧检查器的边注轨道，默认显示全章并按 DOM 选区中点对齐。移除段内 widget 与针对有批注段落的单独行宽压缩；对齐换算考虑页面 zoom，相邻批注使用可测试的最小间距避让。
- 写作页取消正文编辑器与右侧检查器各自滚动：桌面端二者归入 `wall__main` 的同一滚动工作区，窄屏检查器改为正文后的普通工作区内容，不再以悬浮 sheet 覆盖正文。

## 2026-08-11 - WNB 边注界面减负

- Notebook 正文现在会为可定位批注增加轻量片段下划线和旁侧点标，点击点标直接打开并定位对应批注；orphan 批注不伪造正文标记，已解决批注只在当前激活时保留标记。
- 检查器收窄为“批注 / 版本”两项工作入口：批注支持原位编辑；停止创建线程式回复，已有 `parentId` 回复折叠成根批注的补充记录；按批注改写直接在当前边注内展示要求、当前候选 diff 与采用操作。
- 删除块/场景/全章过滤和解决/恢复状态操作；新批注输入不再固定在检查器底部，而是与保存后的边注使用同一选区中点定位和避让。删除批注会级联清理旧补充记录与正文标记，采用改写后也直接删除其来源批注；失效锚点只提示原文已变化并允许删除。
- 实时编辑面将“收为素材 / 批注”移至选区光标收束端浮条，顶栏不再重复占位；浮条处理应用 zoom、视口边缘翻转和滚动收起，正文选区统一为主题蓝色。
- 选区浮条改用批注气泡与加入素材图标，并锁定中文标签横排不换行，避免缩放或窄空间下文字逐字竖排。
- 版本视图只渲染当前修订、未保存恢复稿和最近三份快照；较早检查点只提示数量，块历史与质量 Gate 不再挤入 304px 默认窄栏。底层 sidecar、候选 stale gate、快照和块历史存储契约保持不变。

## 2026-08-10 - WNB-5 章节质量与发布 Gate

- 版本检查器新增本地确定性质量报告，统一读取当前结构化文档、批注、章节审查发现、保存状态、恢复草稿、快照和块历史，不调用上游模型，也不修改正文。
- 报告将空章、未保存/正在保存、恢复草稿、失去定位批注和高优先级未处理审查发现列为阻断；过长正文块、相邻高度重复和缺少场景边界列为警告或提示。每项支持回到对应块或批注。
- 质量契约断言并入现有写作测试项；定向测试、完整 `npm run verify:full`、Vite/VitePress build 与 `git diff --check` 均通过（39 个核心测试文件 / 306 个用例、12 个视觉用例）。未启动或重启 dev server。

## 2026-08-10 - G4.6.13 R3 供应商 transcript 保真 adapter

- OpenAI Chat/Responses、Anthropic 和 MiniMax Anthropic-compatible adapter 现在保留 text/refusal/reasoning/tool-call/tool-result parts；同一轮的调用 ID 和结果顺序不被压成字符串。
- MiniMax 使用独立 adapter 处理 Anthropic-compatible thinking 和 Bearer 认证边界；能力开关控制 parallel/strict，不再在保守配置下盲发高级参数。
- refusal、content filter、length、empty、非法调用和重复调用 ID 形成稳定 provider error；API key 和完整 reasoning 不进入返回对象。契约断言仍并入 `agentContracts` 的单测试项。

## 2026-08-10 - G4.6.13 R4 单 transcript 浏览器编排器

- 体验主链新增 `runNarrativeAgentLoop()` 有限状态机，第一步直接使用统一叙事 policy、Kernel 和真实 user message；不再先走独立资料调度器再用压缩 evidence 重建 clean prompt。
- assistant tool call、并行工具结果、provider reasoning opaque metadata 和最终 assistant 正文沿同一临时 transcript 推进；同一轮始终复用一个 `requestId`，资源 revision 变化会取消当前轮次。
- provider 已返回终态正文时直接提交；只有 `READY` 等控制信号才在原 transcript 追加一次 `toolChoice=none` 收束请求。最多 4 个模型步骤、2 轮工具结果和 6 个领域调用，重复调用仍在同一轮内阻断。
- 空响应、旧调度超时和非法工具协议不再静默触发普通 clean-prompt 正文；工具 preamble、READY、JSON 和半截正文不会进入体验消息。新增契约断言并入既有 `agentContracts` 单测试项，未启动服务。

## 2026-08-08 - 体验页本地演示提示与内置 AI 状态对齐

- 空会话的本地演示状态原本直接显示“未配置 AI”，把“暂无真实消息”和“没有模型配置”混成了同一件事；现在通过文本模型配置 store 判断当前生效配置，内置 MiniMax 和完整自定义配置会显示可使用 AI 的提示。
- “继续 / 切场景”仍明确是离线演示操作，只改写 localStorage 与当前会话；用户从输入区发送内容时继续沿用已配置的文本模型。

## 2026-08-08 - 大陆生成第二轮收口

- 海岸破碎化在生长水格时记录原始主要陆块标签，并在每次翻转后重新检查邻居归属，禁止用一格浅滩把两块主要大陆焊成一块；小型碎片仍可自然并入，避免过度切碎地图。
- 大陆分离提前到 `restoreTargetLandRatio` 之前执行。此前收尾补陆后再切海峡，会让多大陆样本的最终陆地面积被再次削减；现在收尾阶段会保护拥有多个陆邻居的分离通道，再补齐可安全扩张的海岸。
- `detectFeatures()` 的 flood-fill 区域标记从 `Uint8Array` 改为 `Uint32Array`。20k cell 地图在碎片较多时可能超过 255 个区域，旧标记会回绕并造成队列膨胀，已修复并通过大地图性能回归。
- 当前视觉回归基线反映极地边缘衰减后的实际结果：`visual-cc1` 陆地比例约 0.399、`visual-cc4` 约 0.355、`visual-cc6` 约 0.418。`landRatio` 仍是高度图阶段目标，极地边缘衰减会进一步减少可见陆地；这项差异保留为后续地图视觉调参点，不伪装成精确比例保证。
- 验证：`npm run verify:full` 退出码 0；核心 38 个测试文件 / 301 个用例、视觉 1 个文件 / 12 个用例，Vite/VitePress build 与 `git diff --check` 通过；未启动服务。

## 2026-08-07 - 图片/视频模型内嵌 MiniMax（对齐文本内置模式）

- 图片与视频模型此前没有内嵌：图片默认落盘一条空 key 的 `minimax-default`，不填 key 不能生成；视频没有默认配置，首次使用要自己加配置填 key。现在与文本模型一致——图片和视频各默认带一条「MiniMax（内置）」配置，默认选中、开箱即用、不可编辑/删除，API Key 由服务器持有。
- 共用 `shared/textModelKeys.js`：新增 `resolveMiniMaxApiKey({baseUrl, apiKey})`——baseUrl 命中 minimaxi.com 且 key 为空/哨兵 `minimax-server-key` 时返回服务器 `MINIMAX_API_KEY`（未配返回空串）；`resolveTextApiKey` 重构为委托同一解析，行为不变。
- 图片：`imageProviderConfigStore` 计算生成 `image-minimax-builtin`（模型 `image-01`），永不落盘；旧空 key 的 `minimax-default` 被内置取代并在读取时清理；`ensureDefaultImageConfig` 改 no-op。图片生成原本浏览器直连 api.minimaxi.com，内置 key 不能进浏览器，因此新增服务器代理 `server/routes/image.js` 的 `POST /api/media/images`（校验 prompt/模型，服务器注入 key 后转发 MiniMax，返回 base64 或 URL），`server/index.js` 挂载；`imageProviderService` 对 `builtin/serverKey` 配置走代理分支，用户配置仍直连。
- 视频：`videoProviderConfigStore` 计算生成 `video-minimax-builtin`（模型 `MiniMax-Hailuo-2.3`、分辨率 768P），`toVideoProviderConfig` 对内置配置把 apiKey 置为哨兵；`server/media/adapters/minimaxVideo.js` 的 `resolveAuthKey` 把哨兵/空 key 换成服务器 env key，未配时报「服务器未配置 MINIMAX_API_KEY」。
- 两个 picker（`ImageModelPicker` / `VideoModelPicker`）内置项显示「内置」badge +「已由服务器配置」，编辑按钮内置换「…」查看只读详情（含「已由服务器配置，无需填写」+ MINIMAX_API_KEY 提示），footer 只给「使用此模型」/关闭；`save/delete` 内置配置被拒。
- 用户手册 07-settings「图片 / 视频模型」小节重写为与文本一致，08-faq 注明内置图片/视频同样依赖 `MINIMAX_API_KEY`。
- 验证（2026-08-07，分支 `integration/online-agents-canvas-video-f`）：定向 vitest 23/23（integration 10 / videoJobStateAndErrors 1 / textProviderConfigStore 12）；Vite build 通过（17s）；重启 3001 后端后 curl 冒烟 `POST /api/media/images` 以哨兵 key 提交，服务器解析 env 真 key 并代理 MiniMax，返回 HTTP 200 `{ok:true, image: data:image/jpeg;base64,…}`（785KB 真实 JPEG，环境已配 MINIMAX_API_KEY；未配时该端点按设计返回 `400 ERR_SERVER_KEY_MISSING`）；组件级 UI probe 2/2（图片/视频 picker 首项「MiniMax（内置）」+「内置」badge +「已由服务器配置」、无编辑按钮（有「…」查看）、默认选中、只读详情只给「使用此模型」）；`git diff --check` 干净。注：此前 3001 后端是加入图片路由前的旧进程，`Cannot POST /api/media/images`，已 `pm2 restart pinax` 加载新路由。

## 2026-08-07 - 清理无运行引用的旧文件

- 移除未被当前入口引用的旧 UI 快照：`WorkbenchPageHero.vue`、legacy `OpeningPage.vue`、legacy `StructuredSettingsPanel.vue` 和未接线的 `RuntimeConflictReview.vue`。
- 移除已被 Agent Runtime 替代的 `textExpander.js`、`textRewriter.js`，以及无引用的 `poetryGeneration.js`、RPG 世界预设适配器、旧研究 Agent 和两个无引用 composable；同步删除 Vite 手动分包残留。
- 移除未被部署脚本使用的重复 `ecosystem.config.cjs`，保留项目当前启动链使用的 `ecosystem.config.js`。
- 地图引擎实验模块、测试专用历史 helper、当前世界书研究模块和历史计划/报告没有删除；本地演示媒体只加入 `.gitignore`，不触碰用户文件。

## 2026-08-07 - 手册渲染修复 + 素材/画布点明插画漫画视频 + 新增漫画章节

- 修复手册 markdown 渲染 bug：`用**「配置列表 + 新增」**模式` 因 CommonMark flanking 规则（`**` 夹在汉字与全角标点 `「」` 之间无法开/闭加粗）字面泄漏 `**`。改为 `用**配置列表 + 新增**模式`，全手册扫描确认无其他泄漏。
- 素材页补上「副工作台」小节：相关素材 / 插画生成（选中素材描述画面生成插画，可存回素材库或插正文）/ 漫画制作（跳转漫画工作台）；素材流向扩为画布、写作、插画/漫画三路。
- 画布页补「改编漫画」小节：生图侧栏标注「去素材内生图」入口；分镜/素材可进漫画工作台做多页改编、导出。
- 新增 `docs/user-manual/09-comics.md` 漫画章节（入口、新建改编/页面计划、视觉圣经、构图、制作流程、文字与导出、与画布关系），注册进 manifest（创作工作台组，位于卡片画布之后），README 章节导航与按需阅读同步。
- 验证（2026-08-07）：全手册 marked 解析无 `**` 泄漏；Playwright 5/5（导航出现漫画章节、07-settings 加粗生效无字面 `**`、09-comics 正文加载、无 console error）；curl 确认 manifest 与 09-comics.md 静态服务即时生效。

## 2026-08-07 - 顶栏文档/设置按钮加文字 + 用户手册去 AI 味

- 右上角顶栏的「文档」「设置」此前只有图标（book / settings），纯图标不够明确；现在图标 + 文字标签并存。`.shell-meta-chip` 带图标时不再画墨点、宽度随文字自适应，移动端标签字号随断点下调。
- 用户手册（`docs/user-manual/*.md`）通读后去掉 AI 味表述：删除「欢迎来到…在这套平台上，你可以」欢迎框架、「我是谁，我该先看哪节」persona 问句标题、以及「大脑 / 主战场 / 快速起盘 / 主工作台」等比喻与热词，改成朴素、工具式的说明。同步把「设置（齿轮图标）」指引改为「设置」（按钮现在有文字）。
- 验证（2026-08-07）：Vite build 通过；Playwright 7/7（`/experience` 顶栏两个 chip 均含文字 + 图标、`/docs` 正文加载且为去 AI 味后的导言、无 console error）；curl 确认 docs 静态服务即时生效。

## 2026-08-07 - 修复全局 UI 缩档白条 + 生产文档路由

- 全局 UI 缩档 (zoom 0.85) 后视口底部露出的白条/空白带根因已定位：CSS `zoom` 只缩放内容本身，但 `--app-viewport-height: 100vh`（body/#app/AppShell 及 20+ 页面）按未缩放坐标系解析，0.85 下只渲染 85vh，底部露出 html 背景（legacy `#f3f3f3` + 灰阴影接缝）。给 html 设背景色只是换色，空白带仍在。
- 修复：`useViewportHeight` 按 `<html data-ui-zoom>` 反补偿 (`视口高 / zoom`)，themeStore 补写同一公式；Playwright 实测 AppShell 765px → 900px 填满视口、灰阴影接缝消失、幽灵滚动仅 3px，并通过 nginx 生产路径复验。
- 生产文档查看器此前被 nginx SPA fallback 拦截：`/docs/user-manual/*` 返回 index.html 而非 JSON/MD。已加 `/docs/user-manual/` location（alias 到 `docs/user-manual/`），manifest 与章节现返回正确 MIME。
- 266 测试全过，Vite build 通过。

## 2026-08-07 - 文档页铺满视口 + 文本模型配置统一为「配置列表 + 新增」

- 文档页宽度：`.docs-page__layout` / 头部去掉 `max-width:1180px; margin:0 auto`（叠加 zoom 0.85 后原本只渲染 ~1003px 居中，两侧大块空白），正文阅读列放宽到 880px，现在铺满视口。后续微调：880px 左对齐在宽屏会留 ~440px 右空区，进一步放宽到 `max-width:1180px; margin-inline:auto` 居中，1440 视口实测内容 1003px、左右边距对称 113px。
- 文本模型与图片/视频统一为「配置列表 + 新增」模式：新增 `textProviderConfigStore.js`（镜像 video store），`TextModelPicker.vue` + `ApiSettingsPanel.vue` 重写为 picker 交互（内置项只读，用户配置可任意编辑/删除）。
- 内置 MiniMax 默认选中、开箱即用：`builtin:true, serverKey:true`，计算不落盘，key 由服务器 `server/.env` 的 `MINIMAX_API_KEY` 提供。客户端只拿到哨兵 `minimax-server-key`（真实 key 永不进浏览器），服务器在转发前替换。
- 服务器新增零依赖 `server/loadEnv.js`（ESM import 最先执行）；`resolveTextApiKey` 在 chat/stream/test/models、agent-turn、结构化生成、text-model agent 四处统一注入；env 未配时返回「服务器未配置 MINIMAX_API_KEY」明确报错。
- 老用户旧 `localStorage['apiSettings']` 一次性幂等迁移为「我的模型」可编辑配置（若旧配置即 MiniMax+空 key 则直接回退内置）；`getResolvedApiSettings`/`gameStore.loadApiSettings`/`useApiSettings`/`WelcomeView.hasApiKey` 全部改走新 store，`Boolean(apiKey)` 守卫零改动。
- 用户手册 01-quickstart / 07-settings / 08-faq 已同步。内置 MiniMax 真正可用需在 `server/.env` 填 `MINIMAX_API_KEY=` 后重启服务器。
- 验证（2026-08-07）：Vite build 通过；定向 vitest 13/13（textProviderConfigStore 12 + agentContracts 1）；服务器 curl 冒烟确认哨兵/空 key → 诚实报错；Playwright UI smoke 10/10（docs 铺满 1440、正文列 748=880×0.85、welcome 第 1 步 ✓、TextModelPicker 内置只读+新增可编辑、无 console error）；`git diff --check` 干净。分支 `integration/online-agents-canvas-video-f`，两个 commit（docs 全页界面+手册重组+铺满视口 / 文本模型配置统一）。

## 2026-08-06 - 结构化地点目录取代地图正文猜测

- 结构化设定的世界观分区在“地理环境”后新增连续式地点目录。城市、城镇、区域、河流和路线以独立世界书 `location` 条目维护，可搜索筛选、新建、编辑、删除并审阅关系影响；名称、别名、类型、尺度、上级、势力、地形提示、关键词、描述和有限 typed relations 共用统一地点合同。
- “从概述整理”使用严格 `setting-places.v1`，按段落分批返回带原文证据的地点草稿；部分无效项和批次错误保留，草稿可逐项编辑、采纳或忽略。revision guard 只检查概述和目标条目，采纳一项不会让同批其他无关草稿过期；reasoning、普通文本和不闭合 JSON 不会作为地点写入。
- 世界书 entries 继续是唯一地点事实真源，不新增地点 store。手工编辑保留已有证据和 `mapBinding`，Pinax/SillyTavern extension 往返保留结构化地点负载；高级条目和设定页读取同一 entry ID。
- 地图生产链不再从“地理环境”正文提取 provisional marker、名称种子或历史候选，只消费正式地点、显式地点关系与 geo-history。旧后缀解析移到设定页整理适配层，只能产生待审草稿。
- Luna 实现合同、服务、UI 和地图切换，Codex 修复 typed relation 兼容、地点编辑丢失绑定/证据、metadata 合并、生成异常复位和移动布局。完整核心 188 + 视觉 12、Vite/VitePress build 与 diff check 通过；主题2 1440/390 无 console error 或横向溢出，两草稿浏览器 fixture 证明采纳“灰锤堡”后“学城”仍可继续审阅。真实 provider 质量 Gate 待执行。

## 2026-08-06 - 地点提取、地图原生地点与统一标记视觉

- “地理环境”正文不再用单个后缀正则扫整段。提取改为按句子和分句识别地点，保留最多 180 字的证据句，并只依据明确的位于、相邻、方向和道路连接词建立关系；“某个小村”“通往地下城”等泛称不会成为地点。
- 自动提取增加叙述片段词法门禁：含“这片、每一、的、总而言之、传说、常被”等语法成分的文本不会因为“都、湖、学院”等后缀被识别为地名；以“都”结尾的正文候选只接受短名称。中文引号内且带明确地理后缀的名称优先精确提取，例如只从用户回归句中得到“穹脊山脉、中央盆地、虹镜湖”，不会得到“传说湖、常被学院、浮沫水母”。并列城市清单与“区域·地点：说明”标题改用语法边界重叠扫描，例如从“除了教廷城、学城……北境·灰锤堡”得到“教廷城、学城、灰锤堡”，不把“许多大小城、矿镇、钟楼”识别为地点。地点备注也会识别已有“来自世界书”前缀，不再显示“来自世界书：来自世界书”。
- 明确维护的世界书地点始终优先于正文推断，同名正文候选不能抢占正式条目。正文候选只携带自身证据句参与地理匹配，其他句子出现村落、港口等词不会污染它的地点类型。
- 正文候选新增“建立正式条目”，写入后转为可确认绑定；提取结果在此之前只属于候选预览。地图引擎原有 burg 单列为“地图原生地点”，默认不写入世界书，可定位并逐项“纳入世界书”。
- 绑定到现有 burg 的世界书地点直接复用底图聚落图标、标签字体和描边，渲染层只投影作者名称及一段轻量状态弧，不再叠加风格不同的大图标和第二套标签。
- 浏览器验证覆盖主题2 1440/390、正式条目优先、候选转正式条目、原生地点定位/纳入入口和无横向溢出；无 console error。定向地图/历史 23 tests 与 Vite build 通过，完整验证在本轮收口执行。

## 2026-08-05 - 地图冰川视觉与多世界书来源修复

- “白色大陆”不是 Canvas 漏绘，而是随机陆块横跨极地时，过宽的冰川阈值、近白生态色和高山全量积雪叠加的结果。现在冰川需要更高纬度或更严格的低温/高海拔条件，冰川改为冷灰蓝，高山积雪不再将地形混成纯白。
- 重现种子 `glacier-audit-13` 中，冰川占全部陆地从约 3% 降至 1.0%，冰川最密集的独立陆块从 36.5% 降至 22.2%；浏览器实图仍保留极地冰原，但不再读成未渲染的白块。
- 地图资料 rail 从只显示当前世界书改为可直接选择任意已导入世界书。切换保留用户手动标记，替换上本世界书的派生地点，并清理不能跨世界书复用的约束报告、历史草案和语义审阅状态。
- 修复活动世界书 ID 被存储层解析后又二次 `JSON.parse` 的问题；这会让普通字符串 ID 失效并每次回退到索引第一本。现在选择第二本后刷新仍保持选择。
- 浏览器回归覆盖主题2的 1440/390 视口、两本世界书切换和刷新恢复，无 console error 或横向溢出；定向 29 tests 通过，用例总数未增加。

## 2026-08-05 - 修复地图 AI 意外切换暗黑背景

- AI 地图 JSON 允许输出 `stylePreset: dark`，旧页面会把它和地理参数一起无提示提交，因此浅色工作区在重新生成后可能突然显示近黑色海洋和背景。
- AI 重新生成现在只负责地理参数，视觉风格继承当前地图；没有当前风格时固定使用 `topographic`。主题2浅色读取到历史 dark 配置时只在渲染层回退，不改写地图版本或世界书，真正的暗色主题仍保留 dark 预设。
- 主题2 1440 浏览器注入 dark 旧存档后实际渲染为浅色 topographic，控制台无错误；现有地图集成 5 tests 与 Vite build 通过。

## 2026-08-05 - 世界书沿河关系参与排水求解

- confirmed 河流条目及地点的沿河关系会形成河道必经点。必经点已有自然河流时复用并采用世界书名称；没有现成河道时，从该点沿既有 drainage 向上游和下游追踪形成支流，不改高度图，也不使用跨地形直线。
- 河口点没有采样上游时，只从更高的相邻陆地补足来水段；同一河流的多个确认地点可追加为有限支流。普通 `riverNames` 回填会跳过世界书约束名。
- 修复 AI 地图配置解析丢失 `relationRefs[].relation`，confirmed 世界书约束仍在页面合并时拥有最高优先级。
- 验证：既有 500-cell 地图夹具中的指定国家、同国、沿河和路线全部进入 `satisfied`；`npm run verify:full` 通过核心 188、视觉 12、Vite/VitePress build 和 diff check，20k cell 样本约 0.69 秒。

## 2026-08-05 - 世界书国家关系与道路参与地图求解

- 世界书地点的指定国家、同国和异国关系不再只在地图生成后报错。关系地点先组成分组，明确国家优先，无明确归属时选择最近首都；地点与目标首都之间的陆路走廊作为多源国界扩张的辅助种子，并继续经过平滑和去飞地。两个已有首都发生冲突时不会被强制合并。
- 明确交通线会在随机首都路、港口路和商道之前使用同一 A* 寻路器铺设，保留世界书路线名称；后续随机路网沿用端点去重，不再抢占指定路线。
- 同步与异步地图生成使用同一约束。复用现有地图集成测试项验证指定国家、同国与路线均进入 `satisfied`，没有增加测试数量。
- 验证：`npm run verify:full` 退出码 0，核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 `git diff --check` 全部通过；20k cell 默认样本约 0.69 秒。

## 2026-08-05 - 地图生成原子替换、世界书资料 rail 与视觉收口

- 修复“配置先保存、地图后生成”的状态错误：AI/参数生成先进入候选，Worker 与临时 Canvas 全部成功后才写入当前世界；失败时旧图和旧配置继续可用，错误提示不再遮住地图。DPR 变化触发的重渲染也改为成功后交换。
- 地图恢复为主舞台。世界书来源、地点绑定、约束报告、历史草案和地点实体集中到可收起资料 rail；工具栏显示当前世界书和地点数，并提供重新读取及导入/管理入口。退化成浏览器原生样式的地图文本按钮已补齐本地控件样式。
- 默认 topographic 降低生态群落与海水饱和度，平滑相邻水陆单元色差，收细海岸、国界和国家标签，保留地形与水系的可辨识性。
- 浏览器审阅覆盖主题2的 1440/390 空态与资料 rail、1440 确定性 5000-cell 实图，无 console error 或横向溢出；定向地图/Worker 14 项与视觉 12 项通过，20k cell 样本约 0.7 秒。完整 map version/remap、LOD/标签碰撞/聚类与 20 次连续生成仍属于后续阶段。

## 2026-08-05 - 地图版本事务与逐地点 remap 审阅

- 新地图通过 Worker 和临时 Canvas 后不再立刻替换旧画布；有 confirmed 地点时进入内存候选，中央地图继续显示旧版本，重新生成与历史动作暂时锁定。
- confirmed 地点按稳定 entry ID、名称和别名寻找新 burg；约束报告中的 relaxed/impossible 会升级为冲突，未匹配地点明确标记失配，不使用随机陆地点伪装 remap。用户可逐项选择采用新位置、保留旧位置待确认或暂不落图。
- 提交前比对每个条目的有限指纹。世界书在生成后发生编辑时只拒绝受影响条目的候选，不让无关条目变化使整批无条件过期；提交后地图、配置、marker 与 mapBinding revision 一起更新。
- `geographyStore` 为每个世界保存最近 5 个轻量 map revision，内容仅含配置、marker、生成元数据和世界书绑定快照，不保存大体积 cells；旧版本可恢复并把恢复版本之后新增的绑定标为 stale，而不是静默删除。
- 复用现有地图集成测试项覆盖 remap、冲突、失配、局部 stale guard 和轻量快照；主题2 1440/390 真实 500-cell 重生成审阅通过，提交生成第二版、恢复旧版成功，无 console error 或横向溢出。
- 验证：`npm run verify:full` 退出码 0，核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 `git diff --check` 全部通过，测试总量保持 200。

## 2026-08-05 - 世界书地点关系进入地图约束报告

- 地点条目的 `relations.locations` 现在只在明确声明关系类型时编译为地图拓扑，兼容归属区域、所属国家、同国/异国、相邻、沿河和通路；已有 `country/state/parentRegion/mapBinding.country` 也进入同一有限合同，普通正文不会被臆测成硬关系。
- confirmed 区域与国家保存为地图 anchor，不再因为引擎只支持 burg 而被丢弃，也不会伪装成城市。国家生成后核验地点归属与同国/异国关系，道路生成后核验连接，河流核验同名河道与地点接触。
- 作者确认的地点坐标不会为了适配随机国界被静默移动；每项关系进入 `satisfied / relaxed / impossible`，资料 rail 显示地点关系和最多 6 条放宽/冲突原因。
- 复用现有地图集成测试项加入关系编译、人工拓扑数据和 500-cell 真实生成回归，测试总量不增加；主题2 1440/390 地图和 390 世界书关系侧栏审阅无 console error 或横向溢出。
- 验证：`npm run verify:full` 退出码 0，核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 `git diff --check` 全部通过。

## 2026-08-05 - 地图名称来源与生成输入边界收口

状态：代码完成；定向与全量验证通过，未启动本地服务。

- 当前地图生成分为三层：AI 只设计宏观参数和命名风格；地图引擎根据名称池生成聚落，根据聚落端点组合道路，根据河流/道路/聚落结果提取语义列表；世界书地点通过名称种子、确认绑定和有限约束进入这条管线。`Silverkeep`、`Nightbloom`、`Runeflow` 等来自高幻想内置名称池，`Silverkeep—Ironforge` 等来自道路端点组合，不是模型凭空读出的正式地点。
- 旧地图请求会把长世界观、地点全文和冗长重复 JSON schema 一起发送，服务端通用输入预算超过后会裁剪 system prompt，导致用户看到“输入太多/截断”。现在地图 prompt 对长字段、名称种子和地点描述分段压缩，并通过 `max_input_chars: 14000` 给地图请求单独留出完整契约预算。
- 地理历史不再把地图分析标签或引擎随机地点直接当作世界设定：候选最多 12 个，过滤 `沃土/凶土/边境荒域/山口` 等诊断名、重复标题和重复地图锚点，并要求候选名称能匹配世界书地点。地图视觉仍保留未绑定预览点，避免世界书没有地点时整张地图空白。
- 修复引擎名称种子只应用于首都的遗漏；港口、区域中心和普通城镇现在也消费 `burgNames`，因此世界书地点不会只在首都位置生效，相关道路名也会基于实际聚落名生成。
- 验证：定向地图/历史 11 tests；全量核心 188 + 视觉 12；Vite、VitePress 和 `git diff --check` 均通过。

## 2026-08-05 - 修复世界书地点稳定落点异常

- 世界书地点没有匹配到地图聚落时，会按地图 seed 和条目 ID寻找稳定陆地点位；该路径引用了未传入的 `occupied` 集合，导致生成阶段报 `occupied is not defined`。
- 现在由调用方显式传入已占用点集合，并在每次成功落点后追加新点；多个 fallback 地点不会互相覆盖。
- 验证：地图集成 5 tests、全量核心 188 + 视觉 12、Vite/VitePress build 和 `git diff --check` 均通过。

## 2026-08-05 - 导入世界书地点进入地理审阅

- 地图历史入口原先只筛选地图算法提取的语义点；导入世界书地点如果没有被引擎生成成同名聚落，就会错误显示“没有与世界书地点对应的候选”。
- 现在明确的 `location` 条目和世界书地点引用会转换为作者地点候选，直接进入“地理筛选”；自动生成的城市、河流和道路仍不会进入历史。空地图和没有地点条目的世界书仍然拒绝生成历史。
- 地图页显示当前激活世界书及已读取地点数量；首次点击历史入口会确保世界书已加载。

## 2026-08-05 - G2.4 M5 地理历史候选与水域约束收口

状态：代码完成；定向测试通过，完整验证待本轮结束重跑，未启动本地服务。

- 地理历史审阅统一经过 `selectSemanticSitesForReview()`：最多 12 项，排除“沃土/凶土/边境荒域/山口”等无名或编号诊断标签，重复标题和重复地图锚点不再重复展示。
- `buildGeoHistoryDraft()` 在没有显式选择时也使用同一份筛选结果，避免把地图语义九个分类的全部产物直接写入世界书；显式选择仍需通过本地候选校验。
- 地图约束执行器遇到 `water` 硬约束时报告 `impossible`，不把水域地点错误创建为陆上 burg。
- 验证：`geoHistoryPipeline` 与 `worldMapHistoryIntegration` 定向共 11 tests 通过；测试总量未增加。

## 2026-08-03 - 世界书约束型地图优化计划

状态：完成详细规划，未修改地图代码，未启动本地服务。

- 确认当前世界书地点接入仍以名称种子和生成后 marker 为主，尚不能约束国家、区域、河流、道路、地点层级和重生成后的稳定绑定。
- 在唯一主路线图 G2.4 增加 M0-M8：基线追踪、地点/关系归一、绑定审阅、约束型生成、版本 remap、真实地点优先的地理语义、运行时按需查询、地图 UI/LOD 和 20 次可靠性门禁。
- 冻结数据边界：世界书是作者事实真源，地图资产是空间真源，`PlaceEntity` 是查询投影，`geoHistory.placeRefs` 扩展承载绑定；不新增平行地点 store，不让随机陆地点或算法占位名伪装成正式设定。
- 计划给出文件 owner、阶段依赖、失败回退和量化门槛；第一执行切片为 M0-M2，先让每个地点的来源、匹配理由、冲突和未绑定状态可见，再修改地图引擎。
- 验证：`npm run verify:full` 通过核心 23 files / 188 tests、视觉 1 file / 12 tests、Vite/VitePress build 与 `git diff --check`。

## 2026-08-03 - G2.4 M0-M2 地点绑定审阅第一切片

状态：代码完成；真实浏览器 smoke 待在现有服务中执行，未启动本地服务。

- 新增 `buildWorldbookPlaceInventory()`，地点清单区分明确世界书条目、关系引用、历史来源和地理正文 provisional 名称，并归一地点类型、别名和来源 revision。
- 世界书地点 marker 增加 `bindingStatus / bindingMethod / bindingReason`：同名/别名聚落是 `auto-matched`，稳定哈希落点只是 `unbound` 预览点，保存过的地点绑定为 `confirmed`。
- 地图页加入地点绑定审阅区，支持定位 marker、确认当前位置、解除绑定；确认只把 `mapBinding` 元数据写回原世界书 entry，不复制正文或新建地点 store。没有正式 entry ID 的 provisional 地点不可确认。
- `WorldMapVoronoi` 增加 marker 聚焦入口，保留已有 marker 拖动和手工编辑行为。
- 验证：定向 `worldMapHistoryIntegration` 5 tests 通过；完整 `npm run verify:full` 退出码 0，核心 188 + 视觉 12、Vite/VitePress build 和 diff check 通过。

## 2026-08-03 - G2.4 M3 世界书约束编译第一切片

状态：代码完成；M3 的关系拓扑和浏览器 smoke 待后续切片，未启动本地服务。

- 新增 `compileWorldbookMapConstraints()`，只读取有正式 entry ID 且已确认 `mapBinding` 的地点；地理正文推断、关系悬空引用和未确认 marker 不会静默变成硬约束。
- `MapConstraints` 新增有限地点、河流和路线合同；地点约束先支持 `land / coast / water / river`，区域/国家/父子关系明确进入 deferred，避免伪造完整 GIS 关系。
- 地图引擎在 burg 阶段把确认地点移动到最近可行 cell，找不到可行解时进入 `impossible`；河流和道路在生成后返回 `satisfied / relaxed` 核验结果，结果挂到 `VoronoiMapData.constraintReport` 并在地图面板显示。
- 现有地图集成测试补充了编译器和引擎落点断言，测试总量仍为 200。

验证：`npx vitest run src/__tests__/worldMapHistoryIntegration.test.js` 5/5；`npm run verify:full` 通过核心 188、视觉 12、Vite/VitePress build 和 `git diff --check`。未启动或重启服务。

## 2026-08-03 - 地理历史候选过滤噪声

状态：完成地图语义审阅清单收敛，未启动本地服务。

- 地理筛选不再按类别轮换硬凑 24 个候选；`边境荒域 1`、`沃土 11`、`凶土 1`、`山口 1` 等地图分析占位名称会被排除。
- 同一道路或少量相同地图 cell 被多个类别描述时只保留一个候选；地图页默认最多展示 12 个有明确名称的城市、河口、路线或据点。
- 历史草案仍严格只使用审阅后保留的 ID，没有改变用户逐项选择和确认写入的边界。
- 验证：定向 `geoHistoryPipeline` 6 tests 通过；完整核心、视觉、Vite/VitePress build 和 `git diff --check` 待本轮结束重跑。

## 2026-08-03 - 地图打开时恢复世界书地点

状态：完成地图地点加载时序和引用覆盖修复，未启动本地服务。

- 地图面板不再只加载地理 store；打开时会恢复活动世界书，已有地图在世界书异步加载完成后立即同步地点标记。
- 地点来源扩展为独立地点条目、旧导入的地点类型、世界书条目 `relations.locations` 引用，以及 `geoHistory.placeRefs` / 历史节点地点。旧数据缺失地点 ID 时按名称生成稳定引用。
- 对结构化设定的“地理环境”总述仅提取带明确地理后缀的具体名称（城、港、盆地、山、河、遗迹等），避免把字段标题“地理环境”误标成城市。
- 仍沿用地图 store 的唯一标记状态：手动标记保留，世界书地点按同名 burg 或稳定陆地点位显示，不需要先重新生成地图。
- 验证：定向 `worldMapHistoryIntegration` 5 tests 通过；完整核心 23 files / 188 tests、视觉 1 file / 12 tests、Vite/VitePress build 和 `git diff --check` 通过。

## 2026-08-03 - 地图城市密度与世界书候选空响应修复

状态：完成地图与世界书维护链路修复，未启动本地服务。

- 地图桥接现在保留最多 80 个世界书地点种子；只要当前世界书或旧地理地点树存在地点，生成配置会提高城市密度并为更多地点保留名称，城市数量不再被模型常给出的低 `burgDensity` 限制。
- 世界书维护的新增/完善请求不再把最多 72 个条目整体塞进上下文，改为 24 个高相关条目、720 字正文预览；首轮 JSON mode 失败后，普通 JSON 重试再加一次更短输入、较高输出预算和低推理强度重试。
- `/api/generate` 兼容无正文但带 `tool_calls.function.arguments` 或 Anthropic `tool_use.input` 的结构化响应；reasoning/thinking 仍然不会被当作正文。空响应最终会显示明确的重试/切换模型提示。
- 验证：定向地图/世界书 17 tests 通过；完整核心 23 files / 188 tests、视觉 1 file / 12 tests、Vite build、VitePress build、`git diff --check` 全部通过。

## 2026-08-03 - 世界书维护候选连续采纳

- 修复第一条候选采纳后，剩余同批候选全部因 `updatedAt` 变化被判过期的问题。
- 本次维护写回会推进批次基准版本；同批候选只有在涉及已被本批修改/删除的原条目时才阻止，真正的外部编辑仍触发 stale guard。
- 验证：复用世界书既有 12 个测试项通过，测试总量保持 200。

## 2026-08-03 - 世界书地点接入地图标记

状态：完成地图地点数据接线，未启动本地服务。

- 原地图桥接只把世界书地点名送入 AI 地图配置的 `burgNames`，生成结束后没有把地点条目写入地图标记，因此地图只显示引擎随机生成的城市，世界书地点无法落图。
- 新增 `buildWorldbookLocationMarkers()`：读取明确的 `location` 条目并兼容旧地点类型，同时接入旧地理地点树作为补充来源；同名 `burg` 优先复用其坐标，无同名城镇时使用地图 seed、条目 ID 和陆地高度网格做稳定选点，避免每次重绘漂移或落入海面。
- 标记保存 `source: 'worldbook'` 与 `worldbookEntryId`，保留用户手动标记；地图生成回调、世界书异步加载和条目变化都会触发同步，旧地图不需要用户先重新生成才能看到地点。
- `geographyStore` 新增批量替换标记动作，未引入第二份地点状态；补充现有地图历史集成测试中的纯函数回归，测试总量保持 200。
- 验证：核心 23 files / 188 tests、视觉 1 file / 12 tests、Vite build、VitePress build、`git diff --check` 全部通过。

## 2026-08-02 - 世界书自然语言维护工作台

状态：代码完成；真实 provider 质量与浏览器操作仍需在现有服务中复试。

- 高级条目管理新增统一“AI 处理世界书”入口，分为“新增设定”“审查整理”“完善选中”三种模式。新增设定直接接收自然语言，不需要用户先创建空条目；完善选中只读取勾选条目和相关世界书上下文。
- 审查整理先用本地名称、关键词和内容 n-gram 相似度筛出候选对，并补充缺少触发词、过长正文和占位名称目标，再让模型判断重复、重叠、冲突或应保留，避免把整本世界书无条件塞进模型请求。
- 单条目目标不再只保留第一个问题；本地预检会保留完整 `issues` 集合，并将同一目标的全部风险传给模型，避免“缺少触发词”掩盖“正文过长”或“占位名称”。
- 审查请求按每批最多 2 个目标拆分，批次只携带自己的条目上下文；某一批上游空响应时保留其他批次候选，并在摘要中标记未覆盖批次，避免一次大请求导致整轮失败。
- 修复审查预筛误报：同类型相似度门槛提高到 0.28、跨类型提高到 0.36；用户填写审查重点后，本地先按条目名称、关键词和正文做相关性过滤，弱相关的文风/基调条目不再进入模型。
- 模型只能返回候选操作，不能直接写库；新增、改写、合并和标签整理均在候选区逐项采纳，忽略与冲突项只记录为已处理。候选保存生成时的 `worldbook.updatedAt`，采纳前版本变化会阻断写回。
- 候选在采纳前可直接编辑名称、类型、主/次触发词、分组和正文；一条建议写回后同批剩余建议保持旧 revision 并显示过期，必须重新审查后才能继续操作。
- 体验页 Agent 继续只承担运行时读取与局部冲突提示，不负责全局世界书创建或修改。现有核心 188 + 视觉 12、构建和 diff check 门禁保持不变。

## 2026-08-02 - 配角角色卡截断重试修复

状态：代码完成；需要重启现有后端后用真实配角字段复试。

- 配角字段不再默认要求一次返回两张卡，改为默认一张完整角色卡，只有用户明确要求多个时才允许最多两张；每张卡要求固定标签、控制在 900 字以内，保证角色可直接导入体验页。
- 单字段角色卡输出预算从 1200 提高到 2600 tokens；分区中失败字段的定向修复按字段类型计算预算，角色卡不再落入过低的 1600 tokens 上限。
- 兼容部分上游 `finish_reason=stop/tool_calls` 但内容实际为半截 JSON 的返回，非空且无法解析时沿用结构化截断重试；现有契约测试扩展覆盖该形态，测试总量保持 200。

## 2026-08-01 - 结构化字段生成接入已有设定约束

状态：代码完成；真实 provider 字段质量仍需在现有服务中复试。

- 根因是字段生成提示只读取世界概述和结构字段，完全遗漏 `worldbook.entries`、顶层文风、禁写边界与参考表达；整节生成还会反复读取同一份旧 worldbook。
- 字段生成现在按全局/常驻硬约束、当前字段修订基线与其他已确认结构、相关已有条目、用户补充要求四级优先级组装提示；相关条目通过现有世界书匹配器按字段语义、关键词、类型和 12 条/6000 字符预算选择，作者生成不执行随机概率淘汰，体验运行时默认行为不变。
- 不同字段控件获得对应输出格式约束；整节生成使用隔离工作副本，后续字段可读取本轮已成功草稿，而用户原始世界书在审阅前不被修改。复用既有测试项覆盖常驻/选择/无关条目和批次累积，不增加测试 item。
- 修复兼容模型推理泄漏：普通聊天响应不再把 `reasoning_content` 或 `reasoning/thinking` 内容块降级为最终正文；结构化生成改为强制 `<setting-content>` 最终边界，客户端只提取最后一个完整边界，边界外分析全部丢弃。边界内部仍有第一人称规划、任务复述或提示回显时直接拒绝，并携带坏响应进行一次低温仅正文修复。复用同一测试 item 覆盖混合推理、边界提取和内部泄漏拒绝。
- 修复结构化设定偶发只返回单字或再次泄漏思考：字段草稿按控件类型增加最低有效信息量，补齐中英文任务分析识别；生成预算从 900 提升到 2400 token，避免 reasoning 模型耗尽预算后仅留下残缺正文；修复轮不再把上一轮无效思考作为 assistant 内容回灌，而是从原始世界书约束重新生成。
- 修复默认世界书占位污染：`默认世界书 / 自动创建的默认世界书` 不再作为名称或核心前提发送给模型。空世界书不再硬拦截生成，而进入“首条设定模式”，直接建立一条具体正式条目并供后续生成约束；单项生成复用本节补充要求，界面和模型提示中的用户可见“字段/brief”统一调整为“设定项/补充要求”。
- 补回小说导入原文资料层：AI/本地提炼都会把原始文字保存为世界书 `sourceDocuments`，条目记录来源资料 ID，结构化工作台提供紧凑展开查看；Pinax 的 SillyTavern 扩展字段保留资料和关联。每个设定项生成会按当前设定、条目关键词和资料关联选取最多 5000 字原文，原文明示事实优先于派生条目；提示总预算同步扩至 28000 字符并对各层单独限额，避免服务端尾部截断吃掉世界书约束。
- 收回结构化设定的影子全局层：结构化页面改为当前世界书条目的编辑视图，保存和采纳按 `section.field` 稳定引用直接 upsert，删除内容同步删除对应条目；旧结构数据和此前手动转换条目在归一化时复用确定 ID，不产生新副本。移除“转条目”按钮和运行时整块结构摘要，`rule/style/forbidden` 保持常驻，其余类型恢复选择注入。聚焦回归覆盖唯一 upsert、类型注入策略、删除和非全局上下文。
- 重排主题2结构化设定工作台：移除 980px 窄稿纸限制，宽屏六项改为双列铺满，出现 AI 草稿时字段区与粘性审阅区并列，1100px 以下回到单列；核心正文与草稿提升至 17px，字段标题、标签、工具栏、来源资料和状态栏同步上调。修复草稿审阅操作退化为浏览器原生小按钮的问题，补齐采纳、复制、丢弃的尺寸、层级、悬停和键盘焦点状态；移动端通过移除重复页标题保持顶栏单行，不缩小正文。主题1布局不变。

## 2026-08-01 - 结构化设定转为主流程

状态：代码完成；真实 provider 基调返回仍需在现有服务中复试。

- “设定”活动默认进入结构化设定，设定子导航与侧栏同步把结构化工作台放在第一位；快速世界书页保留预设、文本迁移和 AI 基调入口。
- 一键 AI 不再生成完整 `entries`、具体角色、地点、组织、事件、历史、任务或联网研究包，只返回世界概述、基调、文风、视角、示例、禁写边界和一致性规则。
- 客户端确定性生成 `rule / style / forbidden` 三条常驻基础约束，并将创作规则预填到结构化设定；确认后直接进入结构化工作台继续建设。
- 复用既有世界书测试项覆盖三条基础约束和结构字段，不增加测试 item；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check，主题2快速页/结构化页 1440/390 共 4 张浏览器截图无横向溢出、重叠或 console error。未启动或重启服务。

## 2026-08-01 - 世界书 entries 结构归一修复

状态：代码完成；真实 provider 仍需在现有服务中复试。

- 根因进一步定位为模型返回合法 JSON 但没有使用 `entries` 字段，可能包装在 `items`、分类数组、`data.entries`、`worldbook.entries` 或直接返回数组；旧校验只接受单一结构，因此报“返回内容缺少可用 entries”。
- 新增世界书结果归一层，兼容这些有限包装形式并合并分组条目；如果结构合法但缺少非空条目，agent 和普通回退都会收到针对 `entries` 的修复提示，而不是泛化的 JSON 错误。
- 在既有世界书测试项中加入 `items` 包装回归，没有增加测试 item；完整核心 188 + 视觉 12、双构建和 diff check 通过，未启动或重启服务。

## 2026-08-01 - 世界书 JSON 返回修复

状态：代码完成；真实 provider 返回格式仍需用户在现有服务中复试。

- 根因是世界书 agent 或普通生成收到“有内容但非裸 JSON”的模型响应后，旧解析器只尝试整段和最外层花括号；解析失败后普通重试没有携带原始坏响应进行修复，最终显示“AI 返回不是有效 JSON”。
- `parseJsonFromAiContent` 现在支持 BOM、代码围栏、前后说明和字符串内花括号，使用字符串感知的平衡括号提取完整 JSON 对象。
- agent 最终回复解析失败时，会把上一轮 assistant 输出保留在同一 transcript，请模型只修复为严格 JSON；普通 JSON 回退增加一次带原始输出的修复请求。修复请求仍受原有 token、超时和重试边界限制。
- 在既有世界书测试项中加入围栏/前后缀/字符串花括号回归断言，没有增加测试 item；完整核心 188 + 视觉 12、双构建和 diff check 通过，未启动或重启服务。

## 2026-08-01 - 世界书生成切换为 agentic web research

状态：代码完成；真实搜索渠道与真实 provider 仍需在用户现有服务中 smoke。

- 世界书说明生成现在复用 provider-neutral `agent-turn`，新增 `web_search` 工具。模型自行判断是否需要真实历史、地理、制度、技术或物质文化资料；工具调用、assistant/tool 消息、受限网页证据和最终世界书 JSON 保持在同一临时 transcript 内。
- 服务端支持 `provider=auto`，按已配置的 Brave、Tavily、SearXNG 自动选择渠道；用户界面移除搜索渠道、API Key、查询数、测试检索、补查和独立来源面板。研究 manifest、claims/conflicts/evidenceRefs 与 revision 数据仍作为内部可追溯结果保存。
- 单次 agent 最多两轮工具调用，每轮只执行一个检索，最多整理 12 个来源并尝试 4 个正文页面；网页内容被视为不可信资料，不执行网页指令。工具协议不可用时回退普通 JSON 生成，不伪装为已完成联网核验。
- 未增加测试 item；契约与世界书聚焦测试 13/13 通过，Vite build 通过；未启动或重启前后端。

## 2026-08-01 - 说明驱动世界书定向补查 M3b-2a

状态：M3b-2a 代码完成；来源过滤、正文定位交互和历史 revision 对比仍待 M3b-2b。

- 对缺少正文定位的声明增加一次定向补查，查询由声明缺口、当前说明和风格组成，最多提交一个查询；支持 AbortSignal 取消，新增来源按 URL 去重后合并进原研究快照。
- 研究 manifest 记录补查查询、新增来源数和 `single-query` 预算；补查不会直接解除审阅，仍必须按新来源重新生成并核对 claims/conflicts/evidenceRefs。
- 未增加测试 item；聚焦世界书契约 12/12，完整验证继续保持核心 188 + 视觉 12 / 总量 200。

## 2026-08-01 - 说明驱动世界书证据定位 M3b-1

状态：M3b-1 代码完成；声明缺口的单次增量重搜、取消与 revision 对比界面仍待 M3b-2。

- 正文抓取现在拆成受限 `P1/P2...` 证据块，研究来源保留证据块定位；AI 声明增加 `evidenceRefs`，没有正文定位的 research/mixed 声明进入待审状态。
- 新增稳定研究 revision 指纹，覆盖输入说明、生成参数、来源 URL/标题/正文/证据块、声明和排除来源；任一部分变化都会让旧预览失效，重新生成建立新 revision。
- 高级设置继续保留来源排除和局部重生成，研究输入改变时也禁止直接导入。未增加测试 item，继续保持核心 188 + 视觉 12 / 总量 200。

## 2026-08-01 - 说明驱动世界书声明审阅 M3a

状态：M3a 代码完成；段落定位、revision 指纹与增量重搜仍待 M3b。

- 世界书生成结果现在保留受限 `claims` 声明账本与 `conflicts` 冲突关系，条目只接受实际存在的 `claimIds`，并根据来源状态派生审阅状态。
- 高级设置研究预览新增冲突说明、受影响条目和来源排除；排除来源会保留 `excludedSourceIds`，依赖它的声明变为 `stale`，未恢复为 `ready` 前不能导入。
- 新增按剩余来源局部重生成，提示词过滤已排除来源；原预览在失败时保留。未新增测试 item，继续保持核心 188 + 视觉 12 / 总量 200。

## 2026-08-01 - AI 世界书结构化生成兼容修复

状态：代码兼容链已修复；真实 provider 重试需用户现有服务验证。

- 根因位于普通生成重试：世界书首轮强制 `response_format=json_object`，但第二轮只追加“请返回 JSON”文本，仍携带同一个结构化参数。不支持该参数的 OpenAI-compatible 网关会连续返回相同 400，重试没有降级价值。
- `generationRetry` 现支持 attempt 级 generation options；世界书首轮优先原生 JSON mode，第二轮删除 `response_format`，仍使用确定性 JSON 提取和 entries 校验。现有测试项加入“首轮参数拒绝、第二轮成功”的回归，不增加测试总数。
- 世界书 3200/3400 token 请求从通用 30 秒改为 90 秒 Axios 预算；超时、最终请求错误、JSON 解析错误和空 entries 不再被统一覆盖为“AI 生成失败”。
- 普通非流式/流式生成现在透传显式 provider format；MiniMax Anthropic 请求仅发送 Bearer 鉴权，与 capability probe 保持一致，并保留 temperature。
- 数据恢复审计确认 Express 普通生成不落盘 request messages，仓库内没有请求日志或数据库；旧版世界书创建输入也没有 localStorage owner，因此已经丢失的梗概无法由 Pinax 后台恢复。现在小说片段、AI 风格/名称/核心梗概和目标条目数自动写入 `worldbook_create_draft_v1`，重新进入页面会恢复，并随全量备份导出。

## 2026-08-01 - 说明驱动世界书联网研究 M1

状态：可用闭环完成；真实搜索 Key/provider 质量 smoke 与正文证据 M2 待执行。

- 新增受限 `/api/research/search`：Brave/Tavily 使用固定官方端点，SearXNG 只读取服务器 `SEARXNG_BASE_URL`；查询数、单查询结果、总结果、字段长度和超时均有上限，不开放任意代理 URL。
- 说明驱动生成改为“AI 查询规划（失败时本地规划）-> 多查询搜索 -> URL 去重 -> 不可信证据块 -> 带 `basis/sourceRefs` 的 JSON 生成”。联网失败会明确中止，避免把普通生成伪装成研究结果。
- 世界书保存 research manifest，条目只引用本次实际存在的来源编号；非法/虚构引用会被归一层移除。高级页新增研究开关、渠道/Key、测试检索、阶段状态和来源预览，配置仅存浏览器并进入备份。
- 修复高级页风格参数长期退成“通用风格”的问题；现在生成提示与来源标签使用实际选择的奇幻、都市、科幻、武侠或末日类型。

## 2026-08-01 - 说明驱动世界书正文证据 M2

状态：M2 代码完成；真实渠道正文抓取与来源质量仍需用户配置后 smoke，M3 声明/冲突审阅待执行。

- 新增 `/api/research/fetch`，前 6 个搜索来源可尝试抓取公开正文；服务端拒绝 localhost、私网/保留地址、带凭据 URL、非文本 MIME、超过 3 次重定向和超过 1MB 响应，正文只保留有限文本摘录。
- 搜索来源增加域名信号标签：机构、学术/文化、官方参考或普通网页；这是排序提示，不是事实核验结论。
- 研究编排把正文摘录与搜索摘要合并进证据 manifest，生成提示标注证据级别；正文抓取失败时保留摘要并记录 warning，不阻断已经成功的搜索结果。
- 新增 SSRF 归一回归、来源去重和正文证据字段断言，未增加 Vitest item。

## 2026-08-01 - 体验正文渲染与叙事语气纠偏

状态：确定性渲染和提示词分层已接入；真实 provider 文风评估仍属于 G1.4 M5。

- 修复旧文本 fallback 的整行误判：只有纯台词或明确“角色说/问”结构进入 dialogue block，叙述中夹带引语时只渲染引号内文本。短对白、弯单引号和书名式双引号进入统一 token，嵌套引语继续保留温和分色。
- presentation schema 升至 v3，使旧存档懒重解析；结构 parser 接受 CRLF、marker 前空格、大小写和代码围栏，未知 marker 降为普通叙述边界且不把控制文本显示给用户。
- 对照 SillyTavern 的 Prompt Manager、Author's Note、First Message 与 Example Messages 机制，把最终叙事消息拆为长期行文契约、靠近末轮的动态作者注释和当前输入。动态注释只截取最近正文作为视角/称谓/时态样本；规则强调具体因果、单段单推进、非对称对话、反复述、反情绪总结和不强行制造新危机。
- 体验快捷动作改为可观察任务，不再使用“详细描写环境氛围和心理变化”等泛化指令。未新增测试 item；聚焦 parser、最终消息顺序和会话记忆隔离共 33/33 通过。

## 2026-08-01 - G4.6R 单 transcript 工具运行时计划

状态：调研与实施计划完成；R0-R1 已执行，下一阶段进入 R2-R3 能力探测和 provider adapter。

- 审计确认当前体验 Agent 是“资料调度请求 -> 浏览器工具 -> 新建普通正文请求”的两段式链路。最终正文请求只收到 Kernel 与压缩 evidence，不保留原 assistant tool call、tool result、调用 ID、provider content block、修复历史及必要的 thinking 回传元数据。
- 对照 OpenAI function calling、Anthropic tool use、MiniMax 文本接口、AI SDK tool loop 与 OpenCode MIT 公开实现，主路线改为单一临时 transcript：供应商步骤、只读工具结果、修复和终态正文都沿同一轮消息历史推进；世界书、地图、历史和记忆仍由现有浏览器领域 owner 持有。
- G4.6.13 新增 R0-R8：失败 fixture、共享 transcript 契约、真实能力 probe、四类 provider adapter、有限状态编排器、typed repair/fallback/abort/doom-loop、检索与证据约束、规范化流事件/联机审计，以及真实渠道量化 Gate。
- 明确弃用“空响应或非法调用后静默普通续写”的完成口径。普通续写仅允许工具能力已确认不可用且 grounding 为 optional 的轮次；事实敏感轮次必须明确失败，不得伪装成已完成资料核验。
- 计划指定了具体文件、提交边界、串并行依赖和测试命令；不新增 Vitest item，总量继续限制为核心 188 + 视觉 12。R0-R1 代码与测试见下一条日志。

## 2026-08-01 - G4.6R R0-R1 单 transcript 契约

状态：R0-R1 完成；下一阶段进入 R2-R3 能力探测与 provider adapter。

- 新增五类脱敏协议 fixture：OpenAI Chat Completions、OpenAI Responses、Anthropic tool_use、MiniMax Anthropic thinking/tool_use、畸形 OpenAI-compatible 响应；fixture 同时保存完整响应、调用 ID、参数增量、停止原因、usage 和允许回传的 provider metadata。
- 新增 `shared/narrativeTranscriptContract.js`。统一 `text`、`reasoning`、`refusal`、`tool-call`、`tool-result` part，要求消息 ID 唯一、调用与结果按 ID 配对、工具名称和参数由现有领域契约校验；支持当前 step 暂存 pending call。
- 默认归一化/序列化清除 reasoning 正文，只保留 `signature`、`redactedData`、`encryptedContent`、`reasoningContent` 等 allowlist 字段，并限制 metadata、part、消息和整轮大小；未知 metadata 不进入序列化结果。
- 现有 `agentContracts` 单测试覆盖 fixture 基线、完整 transcript 往返、pending call、孤立结果和缺失结果；未增加测试 item，也没有把预期失败断言提交到共享分支。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js`：exit 0，1 file / 1 test 通过。
- `npm run verify:full`：exit 0，核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check 全部通过，总量保持 200。
- 本轮未启动或重启前后端；R2 仍不安装依赖或切换生产主链，先完成能力矩阵设计与最小 probe。

## 2026-08-01 - G4.6R R2 基础切片

状态：能力矩阵和 OpenAI Responses 转换基础完成；真实 probe、AI SDK 接入和生产路由仍待完成。

- 新增 `providerCapabilityResolver`：custom OpenAI-compatible 默认只声明文本能力；工具、并行、strict、流式工具和 reasoning round-trip 必须由 probe 打开。缓存键只包含 provider、URL 主机/路径、model 和 protocol，不包含 API key；支持 runtime downgrade 和显式失效。
- 新增 OpenAI Responses adapter：把统一 transcript 映射为顶层 `function_call` / `function_call_output` input item，默认 `store:false`，按能力矩阵决定 strict/parallel；解析 function call、最终文本、refusal、reasoning opaque metadata 和稳定 typed error。
- adapter 尚未接入主体验链，也未修改 `/api/chat/test`；当前只通过 fixture/契约测试验证协议形状，避免把未探测的工具能力显示为可用。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js`：exit 0，1 file / 1 test 通过。
- `npm run verify:full`：exit 0，核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check 全部通过，总量保持 200。
- 未启动或重启前后端。

## 2026-08-01 - 体验叙事工具协议兼容修复

状态：生产兼容层已接入；完整单 transcript 重构仍按 G4.6.13 R2-R8 推进。

- 定位到“上游没有返回工具调用或最终文本”的直接原因：生产入口仍使用旧 Chat/Anthropic parser，遇到 Responses payload、兼容网关的 alternate text 或仅 thinking 响应时，错误地按空 assistant 处理；此前已写好的 Responses adapter 没有被 `toolCallingProviderAdapter` 调用。
- `toolCallingProviderAdapter` 现在支持显式 `responses` / `openai-responses` 和 `/responses` URL，统一把旧 role/content 请求转换为临时 Responses input，并按 payload 形状兼容解析；Chat/Anthropic 的 reasoning-only 返回改成 `NARRATIVE_PROVIDER_REASONING_ONLY`，进入已有普通叙事回退而不是泄漏思考文本。
- 回归覆盖 Responses function call 请求与解析、OpenAI/Anthropic reasoning-only 错误；未新增测试 item，未启动或重启服务。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js`：exit 0，1 file / 1 test 通过。
- `npm run verify:post`：exit 0，Vite build 与 `git diff --check` 通过。

## 2026-08-01 - G4.6R R2 provider capability probe

状态：R2 probe 切片完成；AI SDK 接入、生产编排切换和 R3 全量 transcript 保真仍待后续阶段。

- `/api/chat/test` 从 models-only 改为固定三步探测：最小文本 `PROBE_TEXT`、强制 `echo_probe`、回传 `tool_result` 并要求 `PROBE_OK`。响应区分文本、工具调用、工具结果往返和每步 latency/error，文本成功但工具失败不会再显示为完整可用。
- 新增 `narrativeCapabilityProbe`，按 OpenAI Chat/Responses、Anthropic/MiniMax 三种协议组装探测请求；固定 schema 和短文本不读取项目世界书，也不把 API key 写入缓存。400 的 strict/parallel 不支持只降级对应能力并重试一次，401/403 保留鉴权失败；能力缓存采用 provider、URL host/path、model、protocol 维度。
- 契约测试覆盖完整 probe 和高级参数降级 probe；未增加测试 item，未启动或重启服务。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js`：exit 0，1 file / 1 test 通过。

## 2026-08-01 - 体验叙事调度回退

状态：代码修复完成；工具调用优先，兼容模型失败时可直接生成正文。

- 修复体验主链在 `NARRATIVE_PROVIDER_EMPTY_RESPONSE`、缺失工具调用、工具协议不支持或非法工具调用时直接结束整轮的问题。
- `runNarrativeAgentGeneration` 现在保留错误码和回退 trace，使用同一浏览器配置构造最终叙事 prompt 并进入普通 `/api/chat/stream`；正常工具调用成功时仍完整保留工具证据、ContextLedger 和 production metrics。
- 回退只覆盖工具调度协议错误，不吞掉 API key、网络、超时或最终正文流错误；这样配置兼容模型时不会把“工具调度失败”误显示成体验不可用。

验证：
- `npx vitest run src/__tests__/agentContracts.test.js`：1/1 通过。
- `npx vitest run src/__tests__/gameStoreSession.test.js`：22/22 通过。
- `npm run verify:full`：核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 diff check 全部通过，总量保持 200。
- 未启动或重启前后端；真实 provider smoke 仍待用户现有服务与凭据可用时执行。

## 2026-08-01 - G4.4 M6 文字排版与出版导出

状态：代码门禁完成；真实字体渲染、PDF 阅读器和浏览器拖拽操作保留为外部门禁。

- 文字对象补齐 `textDirection`、`rotation` 与 `tailTarget`，编辑器、整页构图预览和紧凑当前格预览共用横/竖排、旋转、八向缩放和气泡尾巴拖拽；模型只负责画面，文字仍由独立层绘制。
- 新增出版质检服务，检查文字溢出、文字框重叠、视觉焦点遮挡、安全区、竖排对齐和对白/心声尾巴，并按当前色制路线要求最终阶段已选画面。
- 整页导出优先读取最终阶段 MediaAsset，旧 `selectedTake` 作为兼容回退；新增 PNG/WebP/PDF、竖向条漫按格框边界切片和 `manifestVersion: 2`，保留既有 schema `version: 5` 与来源/谱系字段。
- 现有 media integration 单测试扩展 manifest v2、文字质检、尾巴预览与导出相关模型契约，测试条目保持不变。

验证：
- `npx vitest run src/__tests__/integration.test.js`：10/10 通过。
- `npm run build`：通过；`npm run lint` 仍受既有全仓组件块顺序等错误阻断，本轮新增服务无 error。
- `npm run verify:full`：核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 diff check 全部通过；未启动前后端。

## 2026-07-30 - G4.4 M5 彩色/黑白生产路线

状态：代码门禁完成；真实 provider 后期质量和浏览器上传操作保留为外部门禁。

- 彩色漫画使用 `rough -> line -> flats -> render -> effects`，黑白漫画使用 `rough -> line -> tones -> effects`；黑白效果不再错误依赖彩色 render，当前色制不会显示另一条路线的动作。
- 平涂、网点、上色和效果沿已确认上游生成，分别保存输入 revision 与 MediaAsset 父链；每阶段都可人工上传替换、选择候选、确认和局部遮罩修订。
- 生成提示按阶段锁定线稿、色块、光影与效果职责，并读取视觉圣经的色板、线条、网点/色光和统一画风；相关规则或色制改变会使旧产物 stale。
- 右侧阶段工作台增加紧凑视觉规则带和真实色板 swatch；批量推进扩展到所有非草稿阶段，并继续要求已确认上游与已确认的序列视觉圣经。
- 现有 media integration 单测试扩展彩色完整链、黑白人工稿链、色制门禁、父链和 stale 传播，测试条目保持不变。

验证：
- `npx vitest run src/__tests__/integration.test.js`：10/10 通过。
- `npm run verify:full`：核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 diff check 全部通过，总量保持 200。
- 未启动前后端；真实模型后期质量、上传和桌面/窄屏操作 smoke 待服务可用时执行。

## 2026-07-30 - G4.4 M4 草稿、线稿与局部修订

状态：代码门禁完成；真实 provider 质量和浏览器文件操作保留为外部门禁。

- 图片 provider 增加统一能力矩阵，分别声明文生图、图生图、局部遮罩、身份参考和 pose/edge/depth 结构控制；SD WebUI/OpenAI 提交真实 mask，通用 HTTP 模板新增 `mask_image` 与 `control_images_json`，不支持能力的模型显示明确禁用原因。
- 当前格检查器加入紧凑制作阶段工作台：rough/line 真实生成、人工上传替换、候选切换与大图预览、显式确认、局部遮罩修订，以及身份/服装/地点/道具/风格和结构参考绑定；后续平涂/网点/上色/效果暂不开放伪生成。
- 漫画页 schema 升到 5；阶段候选保存 `artifactLineage` 的父产物、输入 revision、来源和时间，MediaAsset 继续以 `parentAssetId` 保存实际父链。分镜、视觉圣经或上游改变后，旧候选不能重新批准。
- 批量线稿只处理草稿已确认且目标为空/失效/失败的格，逐格失败分别落盘；一格上游二进制缺失不会改变同页其他格已生成的线稿。
- 现有 media integration 单测试内覆盖能力矩阵、SD mask、谱系归一化、旧 revision 拒绝、批量筛选、内存 rough -> approve -> line 和失败隔离，测试条目保持不变。

验证：
- `npx vitest run src/__tests__/integration.test.js`：10/10 通过。
- `npm run verify:full`：核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 diff check 全部通过，总量保持 200。
- 未启动前后端；真实模型、上传、遮罩与桌面/窄屏操作 smoke 待服务可用时执行。

## 2026-07-30 - G4.4 M3 中央分镜与构图画布

状态：代码门禁完成；真实浏览器拖拽与模型质量保留为外部门禁。

- `/comics` 整页制作区由静态预览升级为中央构图工作台，支持格框纵/横拆分、无产物格合并、八向拖边、阅读顺序调整、沟槽和页漫/条漫画布；格数上限为 12，不再退回固定四格/六格模板。
- 人物调度框、运动向量、视觉焦点、地平线和气泡安全区直接叠加在当前格，文字模式继续复用现有八向排版；所有控制项写入既有 `frame` / `direction`，不增加第二个画布状态 owner。
- 持久格框与沟槽统一进入整页预览、单格生图比例、图片裁切和 PNG 导出；导演数据编译为景别/机位/透视、焦点、地平线、人物站位、动线和后期留白提示，模型继续只生成无文字单幅画面。
- 构图变更只将对应格制作阶段标记 stale，页面画幅变化才影响全页；纯阅读顺序调整保留每格 frame 和阶段状态。右侧镜头参数、图片平移和缩放也改走同一构图持久化链。
- 980px 以下沿用“素材 / 页面 / 当前格”互斥工作 pane，中央画布和检查器不会同时挤压。现有 media integration 内扩展覆盖，不增加测试条目。

验证：
- `npx vitest run src/__tests__/integration.test.js`：10/10 通过。
- `npm run verify:full`：核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 与 diff check 全部通过，总量保持 200。
- 当前 `127.0.0.1:5173` 未监听，按约束未启动服务，桌面/窄屏真实拖拽 smoke 待执行。

## 2026-07-30 - G4.4 M2 漫画多页改编与视觉圣经

状态：代码与聚焦交互 Gate 完成；真实模型和浏览器人工 smoke 待服务可用时执行。

- 新增 `comicAdaptationService`，复用现有文本模型配置生成 2-3 个多页候选；每页按叙事需要使用 1-8 格，保存页级 beat、页尾钩子、格级 beat，并把对白/旁白与无文字画面描述分离。
- `/comics` 的页面计划、整页制作和当前格成为真实模式；计划模式允许从左侧多选素材、切换候选、展开格级节拍并建立多页制作序列，移动端只显示素材或计划主区。
- worldbook 条目、PlaceEntity、角色/地点/道具素材与已有插画形成语义参考目录；视觉圣经可增删来源、锁定不变量并跳回世界书、地图或素材，世界书高级页新增 `entryId` 定位。
- 多页继续原子写入 `comic_pages_v1`；同序列视觉圣经同步更新，兼容角色/地点/道具字段由语义引用重建，修改后下游阶段 stale，确认前批量补齐按钮禁用。
- 五格等非固定模板使用通用格框计算；既有 media integration 单测试扩展覆盖双候选、多页往返、多选素材、计划交互和确认门禁，测试总量不增加。`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。当前 5173 未监听，遵循约束未启动服务。

## 2026-07-30 - G3.2 因果冲突审阅

状态：代码与静态 UI Gate 完成；真实浏览器刷新/回滚 smoke 待服务可用时执行。

- 因果报告为冲突生成稳定键，并识别后置的 `runtime-conflict-resolution` 展示事件；审阅结果保存在会话事件链中但不进入模型上下文。
- 可审阅的状态改写支持“确认当前状态”；分支合并只接受与当前合并结果一致的来源分支。伪造选择、缺少来源、重复 ID 和孤立父事件不能被 UI 强行消除。
- 已审阅冲突退出 `activeConflicts`，进入 `resolvedConflicts`，不再单独向下传播 stale；resolution 事件 ID 进入有限因果来源账本。
- 主题 2 结构化设定工作区新增紧凑因果审阅带，支持查看来源事件、逐项确认和移动端堆叠；无冲突时保持单行，主题 1 视觉保持冻结。
- 未增加测试条目。聚焦 3 个文件 30/30 通过；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。
- 当前 `127.0.0.1:5173` 未监听；遵循用户约束未启动 dev server，因此本轮没有实机截图，仍需在已有服务可用时执行刷新/重进与实际冲突确认 smoke。

## 2026-07-30 - G3.2 高阶因果 v3

状态：底层代码 Gate 与聚焦评估完成；浏览器审阅可见性待后续切片。

- `characterRelations` 和 `canonicalFacts` 成为严格白名单的受控状态根，沿 state delta 预览、应用、回滚、session snapshot、联机 runtime patch 和主叙事 Kernel 保存；旧 session 缺少字段时使用空状态，无额外迁移层。
- 因果报告检测未经审阅的亲属关系/canonical fact 改写、同键互斥事实、非法亲属关系和跨分支差异；分支合并必须对每个分歧根指定 `chosenBranchId`，来源分支最后事件与合并事件之间建立 `branch-merge` 边。
- 活动冲突及其下游继续沿原因果边标记 stale；发生冲突的关系与事实双方不会进入 Narrative Kernel、Experience ContextEnvelope 或涌现候选证据。
- 涌现具体化允许写入有限关系/事实结构，候选来源上限由 6 调整为 8，以容纳地点、角色、关系、事实和运行时事件证据，仍保持有界。
- 同步修复体验主叙事生成只传地点/时间而漏传 `runtimeEvents`、`placeStates` 和 `characterStates` 的问题，运行时因果摘要现在实际进入生产 Kernel。
- 未增加测试条目。5 个聚焦文件 43/43 通过；叙事上下文 eval 40/40 通过，40 轮上下文由 6795 字符压至 2245 字符，下降 66.96%；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。未启动或重启服务。

## 2026-07-30 - G4.1 地理/历史创作来源账本

状态：代码与聚焦回归完成；真实浏览器链路受当前服务状态限制。

- 体验页快速保存、对话保存和接受涌现草稿会建立规范化来源，覆盖当前会话消息、历史节点、地图地点与剧情日志。
- 素材进入章节或纲要时继承上游引用；章节导出分镜后，来源继续进入 storyboard document、写作 ContextLedger、分镜 Agent evidence refs 和视频任务。
- 引用始终优先保留上游地理/历史证据，再追加当前素材、章节、分镜和图片制品；最终统一去重并限制为 12 条，避免账本随创作链无限增长。
- 未新增测试条目。6 个聚焦文件 51/51 通过；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。
- 当前 `127.0.0.1:5173` 与 `127.0.0.1:3001` 均未监听；遵循用户约束未启动服务，因此地图 -> 历史开局 -> 冒险写回 -> 刷新/回滚实机链路和 Worker 20 次压力仍保留为外部 Gate。

## 2026-07-30 - G3.3 因果感知涌现调度

状态：代码与聚焦回归完成；真实浏览器刷新、重进和回滚主线待执行。

- 涌现候选开始消费 `placeStates`、`characterStates` 和运行时因果摘要：地点状态、控制者、危险度、同地点存活角色目标、有限知识引用和最近已确认变化均可参与评分与“为何触发”解释。
- 候选只保存有界 `causalState` 和最多 8 个来源引用；LLM 具体化将活动冲突代码视为警告，禁止把 stale 事件当作事实。
- 地点控制冲突会移除不可信控制者，角色状态冲突会阻止对应角色驱动候选；rollback、stale 和冲突事件本身不会成为候选来源。
- 修复因果报告中活动冲突因自身 stale 标记而被误判为已解决的问题：只有 rollback 来源的 stale 才会让冲突退出活动集合。
- 未增加测试条目。跨会话、运行时因果、Agent 与联机聚焦回归 43/43 通过；叙事上下文 eval 40/40 通过，40 轮压缩后 2206 字符，较 6756 字符完整历史下降 67.35%；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。未启动或重启服务。

## 2026-07-29 - G4.6 体验叙事 Agent 与按需世界上下文计划

状态：公开实现调研和主计划完成；下一步进入 M0 契约与 baseline，不改变生产行为。

- 核对当前体验主链仍是预先筛选世界书、当前地点历史和记忆，再进行一次流式模型调用；已有检索不是完整数据倾倒，但模型不能按本轮意图决定查询、补查或沿关系追溯。
- 参考 MIT 许可的活跃 OpenCode 公开仓库：会话以有限 step loop 处理 tool-calls/stop/compact，工具通过统一 registry、schema validation、provider transform、permission、abort、result truncation 和旧结果 pruning。
- 结合 Anthropic 公开的 Claude Code 与 tool-use 文档，确定采用混合上下文：硬规则、当前场景和最近轮次常驻；世界书、地理、历史和记忆通过四个浏览器本地只读工具按需读取。
- 主计划新增 G4.6，冻结最小 kernel、工具输入/结果契约、最多两轮工具回传、浏览器/Express/provider 边界、长会话摘要、联机房主权威、M0-M6 Gate、量化评估、200 测试上限和 feature-flag fallback。
- 不引入 OpenCode 的 Effect runtime，不要求首期 MCP/向量数据库。已核实 2026-03-31 Claude Code npm source map 暴露事件属实，但公开暴露不等于开源授权，因此不直接读取、复制或依赖该专有源码。
- 本轮只修改计划和状态文档，未启动或重启服务。

## 2026-07-29 - G3.1/G3.2 运行时因果 v2

状态：控制权、角色状态、年代冲突和 rollback stale 已进入运行时与体验 Agent；浏览器主线、候选评分消费和高阶关系冲突待继续。

- `placeStates`、`characterStates`、`writingTime` 进入受限 state delta、session snapshot 和联机 runtime patch；地点、角色与年代字段使用独立白名单，未知嵌套字段会被拒绝。
- 用户确认应用和回滚时记录实际归一化后的 before/after 与转移证明，避免 store 默认字段让合法回滚误判为后续改动。
- 因果报告 v2 检测未经确认的地点控制权转移、角色复活、年代切换和同年代时间回退；rollback 会使源事件及此前下游 stale，活动冲突沿父链/状态连续性边传播，已经被回滚的冲突不再计入当前一致性。
- Narrative Kernel 与 Experience ContextEnvelope 只接收限量因果摘要和 `runtime-event:*` 证据引用；完整事件 payload 不进入模型上下文，冲突/stale 事实明确禁止直接采用。
- 涌现事件提示词允许上述受控状态字段，但仍限制当前地点、已知参与者/阵营和 2-3 个动态选项。
- 现有测试内增加真实应用/回滚、语义冲突、stale 传播、联机 patch 和 Agent 上下文断言，测试条目总数不增加。聚焦 43/43 与 `npm run eval:narrative-context` 40/40 通过；加入因果摘要后的固定长会话从 6756 字符降至 2206 字符，下降 67.35%。未启动或重启服务。

## 2026-07-29 - G4.6 M0/M1 Kernel、资源索引与只读工具

状态：完成；下一步 M2 provider tool-call 协议。

- 新增共享 `NarrativeKernel`、四工具 schema、输入校验、稳定 revision 和 typed error，普通世界简介不进入 Kernel，只有产品规则、显式 hard rule、当前轮次、场景、最近两轮、连续性和短风格指纹常驻。
- active worldbook、PlaceEntity、世界历史、玩家历史和 project/session 已确认记忆组成可重建 `NarrativeResourceIndex`；按 owner 内容 revision 缓存，不落盘、不形成第二份可编辑状态。
- `world_lookup / geo_lookup / history_lookup / memory_lookup` 支持 exact ID/name、alias、中文 token、结构过滤、共享路线、关系/因果追溯、scope 隔离、4200 字符结果预算和同参缓存；非法 limit/schema 返回稳定错误。
- 体验生成链新增 Kernel/索引审计，`lastContextLedger` 只记录字符、命中 refs 和 revision，不保存完整正文或 key；生产正文尚未切换。
- `npm run eval:narrative-context` 运行 40 个世界书、地点/路线、历史/玩家历史和记忆场景，40/40 通过；现有 agent/gameStore 23 tests 通过，测试数量保持 200。
- 后续取消影子生产链、长期 fallback 和 feature flag 双轨；M2 通过后直接切换主链，回归以清晰 Git 提交回退。

## 2026-07-29 - G4.6 M2 Provider-neutral 工具协议

状态：代码完成；真实 OpenAI-compatible + Anthropic/MiniMax 双渠道闭环待发布环境验证，下一开发阶段进入 M4 主链编排。

- 新增共享 generation agent turn 契约，统一 provider、结构化 assistant tool call、tool result、只读工具目录、token/字符/超时预算和 requestId。
- `/api/generate/agent-turn` 只负责协议转换和供应商请求，不执行浏览器本地工具；API key 不进入日志、提示词、响应或错误体。
- OpenAI-compatible adapter 支持 `tools/tool_choice/parallel_tool_calls/assistant.tool_calls/tool messages`；Anthropic/MiniMax adapter 支持 `tools/tool_use/tool_result/stop_reason`，最终文本不混入 thinking。
- 单轮工具调用最多 4 个；缺失/重复 ID、非法 JSON/schema、空响应、不支持 provider、上游 429/5xx、取消和超时都保留稳定 code、retryable、status 与 requestId。
- 前端新增 `sendNarrativeAgentTurn` 和 `runNarrativeAgentTurn`，支持 localStorage 模型配置、AbortSignal 与 typed error；尚未接入体验主叙事生产循环。
- 现有单个 agent contract 测试内补入并行、畸形、限流、取消和路由断言，未增加测试数；`verify:full` 的核心 188 + 视觉 12、Vite/VitePress build 和 diff check 全部通过，未启动服务。

## 2026-07-29 - G4.6 M4 体验主链直接切换

状态：代码 Gate 完成；真实 provider、首 token、浏览器与联机发布 Gate 待验证，下一阶段进入 M5。

- 新增独立 `narrativeAgentOrchestrator`：模型先根据最小 Kernel 选择资料，浏览器并行执行四个只读工具，最多两轮结果回传；单轮最多 4 个、整轮最多 6 个调用，同参第三次阻止。
- 工具结果累计限制为 7200 字符，超限时保留 ID、摘要、sourceRefs 和 typed error；本地工具限时 800ms，决策阶段限时 12s，trace 不保存正文、完整提示词或 API key。
- `gameStore.generateAIResponse()` 只保留页面生命周期、流式正文解析与既有后处理；世界书、地理历史、作用域记忆和 Mem0 不再提前拼进体验主提示词。新会话也不再携带固定开场示例或完整世界描述。
- 最终生成只接收 Kernel、实际工具证据与当前输入；正文继续通过既有 narrative marker parser，消息编辑、记忆候选、runtime event、涌现候选和机制通知保持原 owner。
- 取消、重生成和会话切换通过 AbortController 与稳定 message ID 清理流式占位；迟到请求不能覆盖新请求的 loading 状态，错误轮次不留下半成品 assistant 消息。
- `/api/chat` 普通与流式路径统一按协议解析 MiniMax/Anthropic URL、system 消息、请求头和响应格式；浏览器断连会终止上游流。
- `npm run eval:narrative-context` 40/40 通过；聚焦 Agent/会话 23 tests 通过；`npm run verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。未启动或重启服务。

## 2026-07-29 - G4.6 M5 场景摘要与证据裁剪

状态：代码 Gate 完成；真实模型事实质量和生产指标并入 M6。

- 新增独立、可重建的场景摘要状态：只压缩早于最近四条的 user/assistant 历史，最多 1600 字符；来源 revision 相同直接复用，旧消息被编辑或重写后自动失效。
- 场景摘要随 session runtime 保存，但阅读区 `messages` 保留完整正文；旧存档无需迁移，缺少摘要时按当前历史重建。
- 手动上下文压缩产生的 `【上下文摘要】` 不再被新 Agent Kernel 忽略；既有摘要主体与压缩后新增旧轮次分开合并，避免二次摘要只剩短预览。
- Kernel 增加独立 summary block；ContextLedger 增加 kernel/summary/tool/fallback 分区，审计记录实际使用字符、最终证据字符和被裁剪证据。
- 最终流式正文前去除本轮完全重复的工具证据，保留较新的 call；完整执行记录仍留在 trace，跨轮不常驻任何旧工具结果。
- `npm run eval:narrative-context` 保持 40/40，并新增 40 轮长会话门禁：完整历史基线 6514 字符，摘要 + 最近轮次 Kernel 为 1964 字符，下降 69.85%，revision 复用通过。
- `verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check，测试数量未增加；未启动或重启服务。

## 2026-07-29 - G4.6 M6 联机权威与执行状态

状态：本地代码 Gate 完成；真实 provider 60 轮质量指标和双浏览器实机仍待验证。

- 新增低干扰叙事执行状态条，放在正文与输入之间，只显示核对场景、查阅资料、续写、轮次摘要和真实短错误，不建立第二个 Agent 对话面板。
- ContextLedger 增加本轮执行完成、工具轮数和调用数记录，不保存工具参数、正文或思考过程。
- 联机新增有序 `narrative.status` 事件；稳定 `requestId` 贯穿叙事请求、短状态、唯一完成正文和 runtime patch。
- 服务端从 `narrative.requested` 恢复权威行动文本，拒绝非房主状态、无对应请求、正文为空和同请求重复完成；客户端完成载荷不能改写原行动。
- 联机成员进入空会话不再调用 `initGame()`，机制按钮只提交行动提案；房主失去身份或连接断开时取消当前本地工具循环，新房主不会接管旧浏览器快照。
- 现有单个联机测试扩展到 adapter、状态组件、服务端 WebSocket 权限和重复完成，测试数量不增加。
- 主题2体验页常规/长会话覆盖 1440/390 共 4 张截图，无横向溢出、固定层重叠、截图警告或 console error；未启动或重启服务。

## 2026-07-29 - G4.6 M6 生产观测与发布报告

状态：观测代码与可复现报告完成；真实双 provider 60 轮和双浏览器仍是外部发布 Gate。

- `gameStore.generateAIResponse()` 现在以生成 `requestId` 贯穿决策、工具、首段流式正文和最终清理，成功、typed failure 与取消都会形成一条运行记录。
- 指标只保存 provider/model 枚举、模式、结果、耗时、工具轮次/调用/证据、token、上下文字符和清理布尔值；正文、prompt、世界资料、Base URL 和 API key 不进入存储，最多保留最近 120 轮。
- 新增 `npm run report:narrative-production -- --input <metrics.json>`；可用 `--annotations` 合并按 `runId` 标注的证据采用、无依据事实、baseline 事实和重试，用 `--baseline` 比较首段、总耗时、token、调用数、证据采用与重试。
- 报告只有同时满足不少于 60 轮、95% 轮次不超过两轮工具、supported provider 协议成功率至少 98%、typed failure 清理 100% 和无依据事实较 baseline 下降至少 30% 才返回发布就绪；`--allow-incomplete` 只用于查看未完成报告。
- 浏览器原始数据位于 `pinax_narrative_production_metrics_v1`；导出后由报告工具重新执行字段白名单，不依赖页面内部 debug 状态。
- 现有 Agent/会话测试内增加确定性 60 轮汇总、隐私白名单、成功与取消清理断言，没有增加测试数量；指标键同时进入项目备份白名单。
- 40/40 上下文 eval 再次通过，长会话下降保持 69.85%；`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check。
- 本轮未启动或重启服务。`127.0.0.1:3001` 当前未监听，环境中也没有 provider credential，因此没有把本地合成断言冒充真实生产观测。

## 2026-07-29 - G4.6 外部生产 Gate Runner

状态：runner 与本地契约完成；真实 provider 和双浏览器结果仍待执行。

- 新增共享合成世界 fixture 和 60 轮矩阵，覆盖无查询、世界条目、当前位置/路线、历史因果、session/project 记忆、多跳、空结果、连续性，以及最后两轮受控 rate-limit/timeout；每轮都有唯一 `runId`、标准事实和禁止补造项。
- `npm run smoke:narrative-production -- --config /tmp/pinax-provider.json` 通过真实 `/experience` 输入与发送按钮逐轮运行，等待 production metric 和非空正文完成后再采样。默认把 `metrics.json`、含合成输入/模型输出的 `review-cases.json`、`annotations.json` 与 `run.json` 写入 `/tmp`；只有 `metrics.json` 属于无正文白名单数据，复核样本不能当作隐私安全导出。
- `npm run smoke:online-narrative -- --config /tmp/pinax-provider.json` 建立两个隔离浏览器上下文，成员提交动作、房主选择执行；通过 HTTP 与 WebSocket 双侧计数验证成员不发模型请求、房主只形成一条 production metric、同一 `requestId` 只有一个 requested 和一个 completed。
- provider 配置为 `{ "provider", "baseUrl", "apiKey", "model", "format" }`；runner 只将其注入隔离浏览器 localStorage，不写入报告，console 诊断会擦除 API key 和 provider 地址。两条 runner 均支持 `--dry-run` 且不会启动前端或后端。
- 现有单个 Agent contract 测试扩充 matrix、fixture、地理/历史/记忆和凭据隔离断言，没有新增测试用例；取消、重新生成和协议畸形继续由现有确定性契约覆盖，真实环境还需手动补取消/断线恢复 smoke。
- 两条 runner dry-run 与 40/40 上下文 eval 通过；`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量保持 200。

## 2026-07-26 - 顾问移除 OpenClaw 默认链路

状态：完成

- 写作顾问复用浏览器中已保存的常规文本模型配置，不再要求单独配置 OpenClaw 网关 Token。
- Agent runner 仅保留 `text-model` provider；MiniMax/Anthropic 兼容地址自动使用 Anthropic 消息协议。
- 显式旧 OpenClaw provider 请求返回稳定的 provider unknown 错误，不再进入废弃链路。
- “轻续一句”改为严格返回一句可插入正文，并绑定当前光标的零长度范围；结果托盘可直接应用。
- 成功结果不再重复显示聊天副本，摘要不再成为“入纲要/存素材”操作项；连接配置与 API Key 不进入模型提示词。
- 修复写作场景块因顶层 `text` 只序列化章节标题的问题；当前选区、当前段落和光标前后文现在独立、带标签并按任务优先进入上下文。
- 写作 text patch 使用请求发起时的权威范围与原文；服务端和前端事务双重拒绝索要上下文、拒绝改写等占位 replacement，避免错误覆盖正文。
- 顾问打开前冻结 textarea 选区，面板明确显示本次选区字数、预览或光标位置；关闭后恢复编辑器焦点和原选择范围，Markdown 编辑模式也接入相同选择同步。
- 顾问打开期间在正文原位置保留随滚动同步的淡蓝选区高亮和短信号边；Chromium 实测 9 字选区高亮尺寸 `147×21px`，关闭后选择范围 `0–9` 与编辑器焦点均恢复。

验证：
- `npm run test:run -- src/__tests__/agentContracts.test.js` 通过（1 test）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-07-24 - G1.4 指定视口阅读 smoke

状态：多视口阅读门禁完成；真实 provider 与双浏览器联机仍受当前后端 502 阻塞。

- 常规/长会话覆盖 1440、1280、900、760、390 共 10 张主题2截图，无横向滚动、固定层重叠、截图警告或 console error。
- 五个视口滚动到长会话末尾后，末条正文与输入区稳定间隔 52px；中途截图中的正文被输入区覆盖不是底部留白缺陷。
- 消息操作菜单可键盘聚焦；900/760/390 的现场索引可由 Escape 关闭并归还焦点。
- 当前 `127.0.0.1:3001` 对根路径和 `/api/chat/test` 均返回空 502，本轮没有伪造 provider 或联机结果，也没有启动/重启服务。

## 2026-07-23 - G4.2 M6 被动提醒与 legacy 收口

状态：M6 Gate 已关闭；G4.2 仅剩真实 provider 30 次评估门禁。

- 顾问结果在面板关闭后以入口小计数提醒待审，重新打开即清除；revision 变化和领域校验失败会给出一次明确冲突提示。
- 待审与冲突提醒分别使用 2/3 分钟频率上限，只记录本地无正文指标，不发起额外 Agent 请求。
- 现代前端默认任务、服务端 mode、OpenClaw prompt 与旧 `/advice` 内部默认均改为 canonical task。共享 alias 与 adapter 仍被主题1和旧客户端使用，按“无调用后才删”的 Gate 保留。
- Chromium 实测提醒闭环只产生原任务的 1 次请求；体验、写作、素材、画布 1440/390 共 8 张审计无横向溢出、固定层重叠或 console error。

## 2026-07-23 - G4.2 M6 Agent 运行时控制

状态：M6 第一阶段完成；下一阶段接明显冲突/待处理提醒并关闭 M6 Gate。

- 新增统一持久化 Agent 总开关；写作页“更多”提供唯一控制入口，关闭时取消补全并在所有 `useAdvisor` 调用发出网络请求前本地阻断。
- 写作停顿补全增加 45 秒跨会话频率上限，并记录请求、展示、采纳、忽略、空结果和失败；指标不保存正文或模型输出，最多保留 120 条。
- 策略与指标进入 Pinax 备份键。删除无运行调用且绕过 Agent Runtime 的旧 `useCopilot` 生成器，窗口截取与输出清洗改为独立纯工具。
- Chromium 实测关闭状态刷新后保持，尝试顾问任务时 advisor API 请求数为 0；1440/390 写作页无横向溢出、固定层重叠或 console error。

## 2026-07-23 - G4.2 M5 分镜 Agent

状态：M5 Gate 已关闭；下一阶段进入 M6 主动性、评估与收口。

- 分镜连续性审阅只发送当前镜头、前后镜头、来源与视觉连续性规则，并只接受当前镜头允许字段的结构化 patch。
- patch 经 revision 与证据白名单校验后写入新的 storyboard version；应用与撤销均保留版本历史，不直接改写旧版本。
- 视频 generation request 只把经镜头/版本校验的提示词放入现有视频面板供用户确认，不会提交媒体任务；原“生成当前镜头”按钮继续承担唯一提交动作。
- Chromium 纵向 smoke 覆盖审阅应用、撤销和提示词确认，确认媒体任务创建数为 0、console error 为 0；1440/390 审计无横向溢出或固定层重叠。

## 2026-07-23 - G4.2 M5 体验 Agent 上下文

状态：体验子阶段完成；下一阶段完成分镜子阶段并关闭 M5 Gate。

- 体验页删除把专业意图映射到章节体检、收线和轻续写的旧快捷动作，改为正式的“下一步选项”和“涌现候选审阅”任务。
- 上下文按 scene/location/history/character/memory/references 分块，只保留最近回合、当前地点的一跳历史、已遇角色、相关精简记忆、未决目标和已有候选。
- 动态选项限制为 2-3 项；涌现审阅只能引用请求内候选与证据，越界候选、“神秘使者”式无依据输出和非法结构不会进入结果托盘。
- typed runtime candidate 只供审阅，不显示应用按钮、不替玩家选择，也不直接修改世界状态。
- Chromium 纵向 smoke 确认 HTTP 只发送 envelope；1440/390 审计无横向溢出、非预期 console error 或固定层重叠。

## 2026-07-23 - G4.2 M4 画布 typed patch

状态：M4 Gate 已关闭；下一阶段进入 M5 体验与分镜地理/历史接入。

- 局部组织、相邻关系和镜头转场均返回结构化画布 action，结果托盘显示节点移动或边修改预览，不再把文字 review 当作已经执行。
- 应用前校验请求 revision、受限节点 ID、单节点移动距离、关系/转场类型和动作数量；整批卡片与边先在内存验证，再一次写入。
- 撤销仅在受影响节点和边未再次变化时开放，并恢复完整连线元数据；画布滚动和视口变化不再令待审结果误判过期。
- Chromium 实测节点移动的应用/撤销闭环，1440/390 主题2审计无横向溢出、非预期 console error 或固定层重叠；测试数量保持 188 + 12。

## 2026-07-23 - G4.2 M4 素材 typed action

状态：素材子阶段完成；下一阶段关闭画布 patch 和 M4 Gate。

- 分类、拆分和关系任务改为服务端约束的 JSON typed action，不再把文字建议伪装成已完成操作。
- 结果托盘展示领域修改预览；应用前校验选择 revision、合法素材分类、拆分数量、关系类型和请求内素材 ID，越界 ID 不会写入。
- 分类支持批量更新；拆分生成 2-4 个带原素材来源引用的新素材并归档原项；关系在双方 `sourceRefs` 写入关系类型和依据。
- 三类事务统一记录 before/after/created receipt，执行中任一步失败会回滚；仅当相关素材未再次变化时允许撤销。
- 修复共享 `useAdvisor` 写 raw result entry 导致 computed 结果托盘不刷新的问题，写作和素材顾问共同受益。
- Chromium 拦截顾问接口实测分类从 `inspiration` 应用为 `event`，再撤销回 `inspiration`，无 console error；1440/390 素材页审计无非预期错误。

## 2026-07-23 - G4.2 M4 素材与画布第一切片

状态：第一切片完成；下一步实现素材 typed action 与画布 patch preview。

- 新增素材精简、分类、拆分、关系和画布局部组织、关系六个正式任务，页面不再把这些动作伪装成章节体检或线索收束。
- 素材精简复用专业结果托盘，提供完整替换 diff、原文变化 stale、应用和基于写后内容校验的撤销；其余任务本切片明确保持 review-only。
- 新增 Creative Graph 受限上下文：素材只发送当前或勾选素材，画布只发送选中节点、直接邻居和视口，不再发送全部卡片、outline 或 timeline。
- 修复素材页 420px 以下主题选择器被编译成 `.theme-legacy { display:none }`、导致整个页面变成 0 尺寸的问题；画布移动端工具条与顾问入口不再重叠。
- 390px 素材/画布常规态审计无非预期 console error 或固定层重叠；`verify:full` 通过核心 188、视觉 12、Vite build、VitePress build 与 `git diff --check`。

## 2026-07-23 - G4.2 M3 专业写作动作第一切片

状态：第一切片完成；下一步继续页面编排抽离与素材/纲要 typed action。

- 新增共享 `AgentResultTray`，将专业任务与自由问答分开显示；文本任务提供原文/修改后 diff，review 任务保持建议列表，不把章节体检伪装成可应用修改。
- 新增纯函数写作事务：所有 patch 先校验范围、baseText 和相互重叠，再一次提交；任一动作失败不会留下部分修改。
- 应用结果生成绑定 result、chapter、应用前后正文和光标的 receipt；正文或章节变化后拒绝撤销，正常撤销后结果回到可审阅状态。
- 删除工具栏里直连旧 `textExpander` / `textRewriter` 的 AI 弹层入口，统一使用 Agent Runtime；同一选区任务执行器覆盖改写、扩写和压缩，同一段落任务执行器覆盖修正和衔接。
- 现有写作选择测试保持 6 个用例，在原用例内增加双 patch、stale 零写入、正常撤销和 revision-changed 拒绝撤销覆盖。

## 2026-07-23 - G4.2 M3 专业写作动作第二切片

状态：M3 完成；下一阶段进入 M4 素材与画布专业化。

- 专业任务声明、输入归一化、target 构建和 review 领域 action 抽到 `writingProfessionalActions`，页面只保留上下文采集与编排。
- 章节体检和收线建议可逐条“入纲要”或“存素材”；转换绑定 result/chapter，最近一次纲要或素材写入都可撤销，章节变化时拒绝错误撤销。
- 将 `Writing.vue` 两个 style block 原样迁到 `Writing.scoped.css` / `Writing.global.css`，保持 scoped/global 语义，页面文件从 6076 行降到 2979 行。
- 1440 / 390 的主题2浏览器检查均无横向溢出和 console error；桌面卷宗宽 1158px，手机卷宗宽 366px，与迁移前一致。
- `verify:full` 通过核心 188、视觉 12、Vite build、VitePress build 与 `git diff --check`。

## 2026-07-23 - 主题2整页偶发缩小修复

状态：完成。

- 浏览器矩阵确认异常不是浏览器 zoom：`visualViewport.scale` 始终为 1，但根节点会被压到约 430px、根字号变为 13px。
- 根因是顾问组件 scoped CSS 的主题后代选择器写法不完整；编译后 `.advisor-panel` 等子选择器被丢弃，面板尺寸和字号直接作用于 `<html class="theme-legacy">`。
- 将主题与目标后代一起放入 `:global(...)`，避免懒加载顾问样式污染应用根节点。
- 主题2的体验、写作、素材、画布和漫画入口在 1440px 下均恢复为 1440px 根宽与内容宽、16px 根字号。
- `verify:full` 通过：核心 188、视觉 12、Vite build、VitePress build 与 `git diff --check` 全部成功。

## 2026-07-23 - G4.2 M0 Agent 合约冻结

状态：M0 完成；下一阶段进入 M1 ContextEnvelope 与 AgentRunner。

- 新增 `shared/agentTaskContract.js`，作为浏览器和 Express 共用的可执行任务、旧名称映射和错误码事实源。
- 首批只开放五个已有真实 OpenClaw 指令的任务：选区修正、段落修正、轻续一句、线索收束和章节体检；其他已规划任务显式标记 unavailable。
- `/api/advisor/task` 在调用 provider 前验证 task：缺失返回 `AGENT_TASK_MISSING`，拼错返回 `AGENT_TASK_UNKNOWN`，已声明但无执行器返回 `AGENT_TASK_UNAVAILABLE`；均不可重试，不再消耗模型调用。
- OpenClaw 删除未知 task 自动使用章节体检 prompt 的 fallback，并修复 canonical `writing.fix.*` 未进入 JSON replacement 输出约束的问题。
- 前端 registry 为任务暴露 `availability / owner / actionTypes`，请求层在发 HTTP 前拒绝不可执行任务；错误保留 code 与 retryable。
- Agent result lifecycle 增加 action/result validator；未知 action 和 side effect 不再被默认为 review-only 或其他写操作。
- 扩展现有单个 `agentContracts` 参数化测试，覆盖前后端可执行清单一致、legacy alias、unknown/unavailable、owner/actionTypes 和 action/result validator；未增加测试数量。

## 2026-07-23 - G4.2 M1 AgentRunner 与 ContextEnvelope

状态：M1 完成；下一阶段进入 M2 写作页低打扰补全。

- `/api/advisor/task` 改为只接收 ContextEnvelope，旧 `context` body 仅保留在 `/advice` 兼容入口；任务调用前校验 surface、target revision、budget、块数和 source refs。
- 前端、HTTP body、服务端重裁剪和 provider prompt 共享 `shared/agentContextContract.js`；高优先级块超预算时保留实际截断文本，后续块继续进入 drop report，不再无解释消失。
- AgentRunner 接入 OpenClaw 与显式配置的 OpenAI-compatible / Anthropic `text-model`；能力、超时、配置错误和 fallback 都有明确边界，默认不静默切换 provider。
- 响应返回 target revision、budget、token 估算、source refs 与逐块 ledger；浏览器最近 20 条 request trace 只存任务、状态和上下文元数据，不保存正文、问题或 API key。
- 单个 `agentContracts` 用例继续参数化扩展，验证同一 fixture 在裁剪文本、请求 body 和服务端 prompt 中保持相同顺序，并覆盖无 revision、截断规则块和 provider 配置错误；测试总数未增加。

## 2026-07-23 - G4.2 M2 写作低打扰补全

状态：实现完成；真实 provider 30 次中文 smoke 待当前旧后端重启后执行。

- 新增 `useWritingAgent`，写作页补全统一通过 `/api/advisor/task` 与 ContextEnvelope，不再由页面直接维护旧 Copilot 请求状态。
- `writingAgentContext`、引用排序和 worldbook context builder 合并为同一 ledger；章节、素材和世界书来源可追踪，ledger 仍只保留短预览和元数据。
- 普通输入停顿 900ms 后才触发；IME 组合、粘贴、拖放、Undo/Redo、选区和短上下文明确抑制，Tab 无建议时继续执行原缩进逻辑。
- 生成前记录内容+光标 revision，返回时再次核对；移动光标或继续编辑后的迟到结果不会显示或写入。
- 内联建议支持采纳一句、全部采纳、Tab 全部采纳和一次独立撤销；连续三次失败进入 60 秒冷却，失败与暂停状态不再静默。
- 现有 `writingSelectionCapture` 测试内参数化覆盖触发、抑制、局部采纳、撤销 revision 和无正文 ledger，测试数量不增加；1440/390 页面无横向溢出。

## 2026-07-23 - UI-F 瞬态层统一与结构清理

状态：G1.5 视觉与交互层执行批次完成；下一阶段转入 G4.2 Agent Runtime。

- 新增 `useTransientLayer`，用稳定 layer id 协调大型瞬态界面；统一 Escape、初始焦点、关闭后的焦点归还，以及新大型浮层打开时关闭旧 owner。
- 顾问、记忆候选、联机聊天、角色化入口、图片/视频模型选择器和时间设置接入同一协调器；共享 z-index token 区分 floating、popover、sheet、modal 与 toast。
- 主题2顾问从圆角聊天窗收敛为窄审阅托盘，顾问正文降低气泡感；记忆通知与面板改为轻量档案层，手机占用可控。
- 短生成元信息通知补充 `role=status` 与 polite live region，不抢焦点，也不关闭当前工作层。
- 写作页和主题1体验页直接挂载真实 `MediaGenerationDrawer`，删除只做属性转发的 `ImageGenRail` 兼容壳；存储 key 与功能行为不变。
- 主题2八工作区 1440/390 共 16 张常规态截图均无页面横向溢出和非预期 console error；顾问/记忆在桌面与手机完成打开、互斥、Escape 和焦点归还 smoke。联机本地路由未进入房间舞台，聊天协调代码已接入但仍需双浏览器实测。
- 未建立脱离运行时的假 task center；取消、重试和真实失败原因继续由现有任务 owner 展示，全局聚合随 G4.2 task/result contract 稳定后实现。

## 2026-07-23 - UI-E 设定、地理与历史视觉统一

状态：主题2设定链视觉阶段完成；下一批进入 UI-F。

- 快速导入页将大幅 hero 压缩为档案首页，当前世界、类型、条目、开场信息与主动作形成单一阅读顺序；预设列表改为轻量档案行。
- 修复移动端 hero 作为滚动列 flex 子项被压缩、主按钮溢出到粘性世界书栏下方的问题，主题2 hero 现保持自身内容高度。
- 结构化设定在主题2改为分类索引 + 连续设定稿，字段使用横线手稿与单一字段生成入口；主题1保留原有卡片面板。
- 地图空态展示当前世界、地形模板、国家数和唯一顶栏生成动作；移动端世界树默认收起为窄 rail，展开时覆盖主舞台，不再永久挤占地图。
- 主题2在 1440 / 980 / 390 下完成快速导入、结构化设定和地图审计，未发现页面横向溢出或非预期 console error；主题1三个入口 390px 行为 smoke 通过。真实地图数据态继续随地图重复生成与历史开局 smoke 验收。

## 2026-07-23 - UI-D 素材、画布与漫画创作空间

状态：主题2创作空间重排完成；漫画内容生成深水区继续归 G4.4。

- 素材页辅助列由 224px / 300px 承担索引和工具，中心阅读台获得更稳定空间；空态移除铺满页面的 12 个演示槽，只保留一个新建素材 owner 和局部档案信号。
- 素材页 390px 顶栏改为两层命令结构，状态、统计和新建操作不再逐字竖排；小屏隐藏可由全局导航承担的重复“冒险 / 写作”动作。
- 卡片画布删除顶部 hero 与画布内空态的重复组合，保留画布内上下文入口；左侧详情/时间轴收至 236-276px，1440px 下画布占 81%，既有节点拖动、牌堆和连线状态机未重写。
- 漫画页从素材三栏复制收敛为“页面计划 / 整页制作 / 当前格制作”；移除右栏重复的相关素材/插画/漫画导航和当前素材名，中央整页保持最大对象。
- 新建漫画页的格数和版式从普通 select 改为可比较的按钮与真实格框缩略图；阅读方向与色制保留适合选项集的 select，当前格仍承接素材引用、分镜、构图、制作阶段和文字层。
- 三页 `empty / regular`、1440 / 390 共 12 张主题2截图均无 console error 或页面横向溢出；画布手机主舞台占 100%，漫画手机“规划页面 → 当前格 → 版式切换”交互 smoke 通过。未启动或重启 dev server。

## 2026-07-22 - UI-C 体验与写作阅读面

状态：主题2阅读面阶段完成，主题1保持视觉冻结。

- 体验页把动态等高线从正文移入现场索引，正文阅读列保持干净；用短边信号、署名字重和无框段落节奏区分玩家、角色、动作与心理，不恢复聊天气泡墙。
- 消息操作统一由单个原生 `details` owner 管理编辑、重写和删除，键盘、hover 与触屏均可到达；编辑器继续原位展开，避免工具靠近时消失。
- 空态压缩为一个场景入口和一个主动作；长会话下正文、玩家回合、输入区与右侧索引不再互相覆盖。
- 写作页以 880px 阅读轴统一章节标题、模式工具、参考区、正文和页脚；正文采用 17px / 1.95 的连续阅读节奏，约 5000 字章节在桌面与 390px 均无页面横向溢出。
- 移动端章节索引改为有 Escape、遮罩和焦点归还的 side sheet；收件箱与素材保留高频入口，分镜、冒险和返回收入“更多”，主题1仍显示原有独立按钮。
- 浏览器审计覆盖体验空态/长会话、移动编辑态、写作常规/长章节和主题1共享行为；交互 smoke 验证章节 sheet、操作菜单、编辑态与焦点归还，未增加测试数量，未启动或重启 dev server。

## 2026-07-22 - UI-A 移动工作区重编排首轮

状态：体验、素材、卡片画布与漫画的窄屏 P0 已落地；空白/常规/长内容及真实生成中/失败态均可复现，UI-A 完成。

结果摘要：
- 新增 `scripts/ui-audit.mjs` 与 `npm run audit:ui`，在页面初始化前固定 `app_theme_variant=legacy` / light，默认覆盖八个工作区和五档视口；输出临时截图与 JSON，记录 console error、页面尺寸、主要 surface、裁切项、fixed/sticky 层及重叠候选，不增加 Vitest 数量。
- 审计脚本支持 `UI_AUDIT_STATES`、`UI_AUDIT_ROUTES` 和 `UI_AUDIT_WIDTHS` 过滤；`regular / long` fixture 真实填入体验会话、素材、画布节点、连线和时间轴，避免只用空状态判断响应式。
- 体验页在 1100px 以下把现场索引改为按需 sheet，提供遮罩、关闭按钮、Escape 和焦点归还；中心正文成为明确滚动 owner，输入区保持独立 flex 项。
- 素材页在平板使用索引 + 主舞台双栏，工具按需覆盖；760px 以下使用“索引 / 内容 / 工具”单 pane，选择素材自动回到内容，手机空态不再压缩桌面分类蓝图。
- 卡片画布在 760px 以下默认显示主画布，时间轴和节点详情通过“画布 / 时间轴与节点”切换；顶部工具换行，重复 hero 在手机隐藏，空状态文字保持横排。
- 漫画在 980px 以下按“素材 / 页面 / 当前格”切换，页面预览为默认主任务；素材选择和页面选择回到整页，新建页进入当前格制作。
- 新增共享 `WorkspacePaneSwitch`，替换素材、画布和漫画三套重复导航样式；使用 radiogroup 语义和 roving tabindex，支持方向键、Home/End，并沿用既有 1100/980/760 断点。
- 长内容截图暴露体验页 390px 顶栏命令断字；现将操作行固定为四列，会话名移到标题行截断显示，“索引 / 设定 / 切换”保持单行。
- Chromium 使用主题2完成 `1440 / 980 / 760 / 390` 共 32 张审计截图，console error 为 0；390px 逐 pane 交互、体验 Escape/焦点归还全部通过，主题1四页主工作面共享行为 smoke 通过。未启动或重启 dev server。
- 画布主题生成失败不再只写 console，顶栏下方显示轻量 `role=alert` 状态带；开始下一次生成或成功后自动清除。
- `loading / error` fixture 不直接写入假 UI 状态：脚本填入审计专用 API 配置、点击真实生成按钮，并拦截 `/api/generate` 保持 pending 或返回 503。桌面与 390px 共 4 张动作截图通过，0 个非预期 console error。

## 2026-07-22 - UI-B 共享基础、壳与转场

状态：主题2共享视觉基础和全局导航阶段完成，主题1视觉冻结。

- 新增 `WorkbenchIcon`，以 `lucide-vue-next` 统一工作区、菜单、设置和设定分区图标；AppShell 与 ActivityBar 删除罗马编号和重复 inline SVG。
- 新增 `ContourField` 的 narrative/geographic/relation 密度、四向入口、mask 和 reduced-motion 行为；AppShell、体验阅读面和关系画布共用，主题1明确隐藏。
- 补齐主题2工作面、信号、阴影，以及共享控件高度、z-index、快速/页面/层级 motion token；`FolioSurface`、`WorkspacePaneSwitch` 和壳开始消费这些 token。
- route transition 监听完整路由，跨 activity 使用 220ms 轴向抽页，同 activity 使用 180ms 层级揭示；修复素材到漫画未触发 activity watcher、错误沿用跨区转场的问题。
- 顶部 activity tabs 增加 roving tabindex、方向键、Home/End 和焦点跟随；设置/存储重新形成图标命令与条件状态的层级。
- 正式声明 `playwright` 为审计开发依赖，避免其他 npm 安装清理未声明模块后 `audit:ui` 失效。
- 主题2八工作区 `1440/390` 共 16 张常规态截图：0 console error、0 页面横向溢出；五工作区连续键盘切换、同区转场和 reduced-motion smoke 通过。

## 2026-07-21 - Ark UI 方法的 Pinax 化提炼

状态：完成参考分析与内部设计规则收口，未安装外部 skill，未改变页面代码。

结果摘要：
- 保留外部参考中的风格/深度分离、舞台与仪表、信息 owner、证据锁、响应式重编排、真实状态和审查闭环。
- 补充 Pinax 的正向视觉主张：现代创作档案、连续内容场、档案三层空间、不对称编辑构图、信息信号系统、字体角色、有方向的动效和任务自适应密度；建立 `Source Signal`、`Edge Instrument`、`Contour Field`、`Reading Plane`、`Review Tray` 等可主动使用的视觉原件。
- 将 `Contour Field` 扩展为完整的空间场纹理语言：区分叙事地形、索引点阵、工程网格与档案路线，明确覆盖范围、线距、透明度、动效上限、页面组合、响应式退让和验收标准，避免等高线退化为无语义的全屏装饰。
- 明确 Pinax 不继承黑白青/黄工业主题、全局 HUD、密集编号、无意义双语标签、全卡片边框和官方/第三方资产；继续以蓝白档案、纸页/活页、叙事阅读和创作工作台为设计语言。
- 将这些规则写入 `docs/engineering/visual-alignment-workflow.md`，并按写作、素材、画布、体验、Agent 分别规定可借鉴结构和禁止误用。

## 2026-07-21 - 当前 UI 实景审计与整合计划

状态：完成主题校正后的桌面/移动实景审计与 G1.5 详细计划，尚未开始页面实施。

结果摘要：
- 首轮无状态浏览器因默认 `kao` 截取到主题1；确认 `kao = 主题1`、`legacy = 主题2` 后，显式写入 `app_theme_variant=legacy`，重新截取八个工作区的 `1440x900`、`390x844` 主题2视图。两轮共 32 张截图，均无 console error。
- 确认“无整页横向滚动”是当前视觉验收盲点：素材、画布和漫画在 390px 仍保留桌面多栏并裁掉核心内容，体验页固定高度与底部输入层夹住选项，写作顶部工具裁切。
- 主题2下设定与地图已经是蓝白色系，因此撤回“米色主题串入”的判断；剩余问题是结构化设定卡片墙、地图/快速导入的大外框与普通表单层级、创作页巨大空状态和共享壳/页面重复导航。
- 明确 G1.5 只优化主题2；主题1的米色游戏化 UI 暂时冻结，不迁移、不重绘，只对共享行为做基本回归保护。内部 `kao / legacy` 命名与默认主题不在本轮顺手改动。
- 在主路线新增 G1.5：M0 可复现基线、M1 共享基础、M2 P0 响应式、M3 壳/转场、M4 阅读面、M5 创作空间、M6 漫画、M7 设定/地理/历史、M8 Agent/浮层、M9 清理与门禁；明确 UI-A 先修可用性，后续 UI 工作服务地理、历史和 Creative Graph 主线。
- 计划继续保持自动化总量不超过 200，不建立新的平行计划文档，也不启动或重启用户开发服务。

## 2026-07-21 - Agent Runtime 与写作补全专项规划

状态：完成代码审计与详细实施计划，尚未开始功能实现。

结果摘要：
- 审计 `useAdvisor`、`AdvisorPanel`、任务/上下文/结果合约、写作 Copilot、写作 action applier、素材/画布/体验接线和服务端 OpenClaw 路由；确认当前主要问题是基础合约未贯通，而不是缺少更多顾问快捷文案。
- 发现前端二十余种 task 与服务端少数专用 prompt 不对称，未知任务会退化为章节体检；context envelope、新写作 context builder 和多数 typed result 没有进入实际请求/应用链。
- 写作 Copilot 已有 ghost text、设定匹配、参考素材预算、取消和请求失效基础，但页面以 `autoTrigger: false` 使用，原计划中的低打扰补全基本不可见。
- 对照本地 SillyTavern 的 world-info 激活、prompt injection order 与 token budget，以及 VS Code/GitHub Copilot 的 inline suggestion 和分层指令模式，在 G4.2 写入 M0-M6：合约收敛、AgentRunner/context ledger、写作补全、写作专业动作、素材/画布、体验/分镜和主动性收口。
- 计划明确所有写操作必须 preview/apply/undo，体验状态继续走受限 mutation；测试总量保持核心 188 + 视觉 12，不为每个 task 复制测试。

## 2026-07-21 - 素材与画布背景、纸条层次打磨

状态：完成素材索引与画布底面的首轮视觉收口。

结果摘要：
- 核对终末地官网 CSS 和实际 `points-bg`、`wave-bg`、`block-bg` 资产：点阵与斜纹通常只有约 0.05–0.08 透明度，并通过遮罩集中在底部或角落；等高线是局部背景装饰，主工作面仍保持中性留白。本项目只复用这种结构规律，没有引入官方图片资产。
- 素材页移除主题层原有的全屏双层纸纤维点阵，背景改为近白蓝纸面、阅读台下半部局部等高线和右下渐隐点阵，避免纹理穿过标题与工具区。
- 素材索引纸条增加窄夹片、右上折角、底部第二层纸边、内高光与两级投影；悬停和选中态沿用现有位移及状态边，未改变点击、复选和删除交互。
- 卡片画布移除根节点全屏三层点阵，工程网格从 72px 放宽到 96px 并降低对比度；等高线从右下局部进入，点阵只保留在右下角，均使用渐隐遮罩。
- 画布节点补底部叠纸边，拖动、连线、时间轴和选中层级保持原逻辑。
- Chromium 检查素材页与画布页 1440px、900px、390px，均无横向溢出；未启动 dev server。

## 2026-07-21 - 写作页编辑连续性与 Tab 修复

状态：完成首轮，后续继续拆分超大页面并完善写作来源账本。

结果摘要：
- 修复正文 Tab 缩进只移动光标、不写入内容的问题：旧逻辑先改 Vue ref，随后保存流程又从尚未更新的 textarea 读取旧值并覆盖修改；现在 textarea、Markdown 状态、历史记录和保存链同步更新。
- Tab 支持当前行缩进、选区多行整体缩进，Shift+Tab 支持反向缩进；Chromium 同时确认“编辑 / Markdown / 预览”三种模式切换与内容往返正常。
- 章节编号从大号标题前缀退到页边索引，标题、工具栏、正文和页脚收口到同一条可伸展写作轴，减少标题与正文被独立工具条割开的感觉；取消固定 900px 居中限制，宽屏正文随卷宗展开，只保留正常纸面页边。
- 写作页去掉胶带、厚重纸堆阴影和明显竖向墙纹，背景改为极浅蓝白平面与低对比斜向结构层；稿纸边线与细横线继续保留，但降低对比度。
- Chromium 检查 1440px、900px 和 390px，无横向溢出；未启动 dev server。

## 2026-07-20 - 体验叙事语义块与消息操作拆分

状态：G1.4 M1-M4 完成，真实模型观察和多视口联机验证待后续。

结果摘要：
- 新增 `narrativePresentation.js`，用行首 marker 解析叙述、动作、台词、心理和系统块；原始 `message.content` 仍是事实源，协议损坏或旧格式会完整回退。
- 生成流、chatHistory、记忆、状态提取、机制检测和联机事件均消费 clean content；新消息补稳定 ID，旧 session 懒派生 presentation。
- `GamePanel` 拆出 `NarrativeTurn.vue` / `NarrativeBlock.vue`，消息操作绑定整条 turn；普通台词保持纯阅读，编辑、删除和重写操作改为可聚焦按钮。
- 体验页保持无框正文和现有档案主题，动作/心理使用克制斜体，系统块才使用淡背景，未改变三栏布局。
- 顶部现有操作区新增舒展/标准/紧凑阅读预设，分别控制正文大小、行高、阅读宽度和消息间距；偏好按用户 localStorage 保存，纳入备份契约但不进入 session 或联机事件。
- 修复预设造成的正文右侧空白：不再给每条消息设置最大宽度，恢复正文占满中心工作列；修复动作按钮被组件样式覆盖的问题，恢复档案页边批注式定位、hover/focus 显示和窄屏适配。
- speaker 识别升级为三级可信来源：优先使用结构 marker，其次识别“角色：台词”“角色说：台词”“台词，角色说道”等正文明确署名，最后仅以非通用消息角色兜底；代词和无署名台词不会被猜成角色，也不会跨消息继承。
- 玩家回合始终显示身份；assistant 的显式 block speaker 优先于 turn 标签，未署名台词仍保留 turn 身份。同一角色连续语义块只显示一次署名，叙述或角色变化会重新显示，角色名在两套主题下保持无框并加强字重与间距。
- 消息操作区取消正文与页边按钮之间的 8px hover 断层，按钮保持页边批注形态但可连续移入点击；现场索引改为中性蓝白信息底，蓝色不再整块铺满选中项。参考终末地官网的中性平面、硬切分色条和斜切端点语言，展开态、详情顶边与时间锚点统一使用矿物黄/墨蓝/雾面钢青信号条，横条 3px、详情顶条 4px、方向标 4px × 34px；黄色只作短起始信号，墨蓝为主体，钢青收尾。彩色只占边缘小面积，面板底面仅保留 2%–3% 蓝意的极浅蓝白长过渡，不再使用红灰混合的多段柔和渐变。
- 修复 `TimeSettingsForm` 作为文件内动态子组件时未继承父 scoped 属性、导致输入框与按钮实际使用浏览器默认样式的问题；时间详情现在使用明确标签、双列输入、focus 状态和统一主次操作。
- 删除现场索引的 `TIME / CAST / PLACE / EVENT` 英文微标；修复 `NarrativeTurn` 拆分后编辑器与保存/取消按钮仍被 `GamePanel` scoped 样式隔离的问题，编辑态恢复为同宽内联编辑、实线焦点边界、短暖色定位线和右对齐主次操作。
- 体验输入区不再把正常发送包装成“记入”，主动作恢复为“发送”；删除紧邻发送动作的“已记 N 段”用户消息计数，避免与右栏速记、素材记录和记忆系统产生概念混淆。

验证：`npm run verify:full` 通过，核心 23 files / 188 tests、视觉 1 file / 12 tests、Vite/VitePress build 和 `git diff --check`；总量 200，未启动 dev server。

## 2026-07-20 - 体验与写作工作区视觉收口

状态：完成两条高频创作路径的页面层级、阅读宽度和响应式修正。

结果摘要：
- 体验页正文、空状态与输入区改为随中间工作列展开，只保留响应式内边距；1440px 下实测正文宽 928px，短对话按真实内容高度展开，输入区紧跟正文，长内容达到工作区上限后再内部滚动。演示提示改为轻量分隔，1100px 以下让正文独占工作区。
- 角色段落取消整段蓝色竖线与夸张首字下沉，改用独立署名、24px 段距和克制的字重差；正文为 17px / 1.95 行高，对白保留原始双引号/书名号式引号与斜体，内嵌单引号继续分色，仅真实机制触发对白带点状下划线。
- 体验页删除已经迁移到素材页的 `ImageGenRail` 模板、组件 import 和定位样式，顾问弹层独立挂载；现场索引扩到 304px，内部由五列挤压改成“标题/数量 + 最新摘要”为主、“查看”为次的两列结构。
- 修复空会话挂载时自动滚到底部的问题，移动端先显示“从第一步行动开始”而不是从第二个操作入口截起；演示消息中的 `ASSISTANT` 技术名称回退为“旁白”。
- 写作页空书/空章不再用三行假正文占据纸面，改为居中的状态与单一建立入口；章节架取消大幅横移和底部装饰卷，工具条、标题和 900px 正文列对齐。
- 移除正文编辑区斜向动态光带，保留稿纸横线、页边线和顶部胶带；修复写作页在 AppShell 内重复使用视口高度导致底部裁切的问题。
- Chromium 检查 1440px、900px 和 480px：两页均无横向溢出、页面底部贴合视口且控制台无错误；体验页额外确认生图抽屉节点和“体验生图”文本均不存在，未启动 dev server。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`；总量 200。

## 2026-07-19 - 漫画格框、页面规划与文字排版统一

状态：完成预览、编辑、生图、文字排版和导出的页面比例收口。

结果摘要：
- 新增统一漫画布局计算，四格、六格、首格强调和首尾强调不再分别依赖 CSS Grid、固定生成尺寸与独立 Canvas 坐标；整页预览、当前格编辑、持久化 frame 和 PNG 导出使用同一套格框区域。
- 漫画格默认满版；当前格图片可直接拖动调整焦点，通过滚轮或右下角拖拽在 50%-300% 间缩放，双击恢复居中与 100% 缩放。焦点和缩放随 panel direction 持久化，并同步用于候选缩略图、整页预览和 PNG 导出。
- 右栏分格导航的整页缩略图由 168px 收到 118px 高；当前格图片按真实格框横竖比限制在 180x150px 内并居中，不再因竖长格撑开副阅读台。
- 修正缩放只作用于 `object-fit: cover` 已裁切结果的问题：现在以完整原图的 contain 尺寸为底，先计算格框满版倍率，再叠加 50%-300% 用户缩放；缩小时可逐步露出原图边缘，预览与 Canvas 导出使用相同计算。
- 右栏整页缩略图与当前格取景合并为同一并列构图区，页缩略图保持 118px 高，当前格限制在 180x150px 内；模型、素材、生成和文字参数顺次位于构图区下方。
- 新生成图片按目标格框选择最近的标准生图画幅；提示增加简短的目标画幅和安全区要求，减少主体、动作与关键道具落在分割线外的概率。
- 修改版式或调整格序时同步重建格框 frame，修复预览布局已变化但 manifest 仍保存旧区域的问题；右侧紧凑页预览保持真实页面比例，不再横向拉伸。
- 中央整页画布上限扩大到 920px，三栏调整为 220/主区/320，画布外缘收至 8px，纸页内边距与格间距分别收至 24/10 设计像素；1440px 浏览器下整页宽 884px，画布横向只余 16px，900px 下无横向溢出。
- 页面规划不再只是三项下拉：加入可交互整页缩略图，以真实格框小样直接选择均分/强调版式，阅读方向与色制保持紧凑参数；切换结果即时进入整页预览和存储。
- 文字框升级为可排版对象：中央整页直接提供拖动，悬停或聚焦后显示八个方向控制柄，松手后同步右侧当前格与持久存储；提供文楷、楷体、宋体、黑体、圆体和等宽字体，10-72 连续字号、三档字重及左/中/右对齐。中央页、当前格、存储与 PNG 导出共用同一字体和相对矩形数据。
- 复用现有媒体集成用例覆盖 feature-6 区域、竖长格目标尺寸、焦点持久化和画幅提示，不增加测试总数；浏览器使用横图、竖图与方图检查满版取景及响应式布局。未启动 dev server。

验证：`npm run verify:full` 通过，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`；总量 200。

## 2026-07-19 - 漫画工作区与格级素材归属纠偏

状态：漫画制作已从单条素材的副工作台迁出，改为独立工作区。

结果摘要：
- 新增 `/comics` 独立漫画制作路由并归入“素材”模块；入口位于素材页副阅读台，与“相关素材 / 插画生成”并列，素材模块顶栏不再额外占位，画布只保留关系画布。
- 独立工作区沿用素材页左侧抽屉作为漫画格素材索引，点击素材直接绑定当前格；漫画页列表移到中央整页画布顶部，右侧保留当前格检查器。新建和切换漫画页仍不依赖素材页当前选中项。
- 左右栏进一步与素材页统一为同一纸面比例和副阅读台层级；漫画页右侧保留“相关素材 / 插画生成 / 漫画制作”三联模式，切回前两项时携带当前素材和目标模式。
- 每个漫画格单独选择一条素材，绑定写入既有 `ComicPanel.continuityRefs`；页面 `sourceRefs` 只负责汇总各格来源，不再反向决定整页属于哪条素材。
- 选择素材只建立格级引用，不再自动提取正文首句填充画面描述；空格预览只显示待生成状态，正文和脚本文字不会自动进入画面文字层。
- 格级素材驱动该格的来源标题、正文上下文、生图提示和 MediaAsset 归档；画面描述由用户或漫画脚本明确填写，选择素材本身不会覆盖或自动补写。
- 单格图片提示移除 `第 1/4 格` 等分页数字，也不再向 MiniMax 正向提示拼接长串“禁止多格/文字”概念；提示缩短为单幅纯视觉交付，并把主要篇幅用于原素材情境、全页视觉约定、上一镜锚点、当前剧情推进和摄影设计。其他支持真实负面提示及参考图的渠道仍使用简短负面词和上一格成图。
- 批量补齐在独立模式下要求每个未完成格都已选择素材并有画面描述，避免缺少来源的格被静默生成；刷新后每格绑定保持不变。
- 素材页删除“漫画制作”内嵌副工作台、中央漫画替换预览和相关组件状态，漫画只保留与相关素材、插画生成并列的独立路由入口；“相关素材”下方重复显示当前素材名的蓝色缩略条及其状态逻辑一并删除。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`；总量 200。浏览器回归覆盖素材页内入口、左栏素材到当前格绑定、页签切换、刷新恢复、素材页旧副工作台与重复缩略条移除、900/1440px 无横向溢出和无控制台错误。未启动 dev server。

## 2026-07-19 - 漫画单幅生成与文字层分离

状态：完成漫画生成纠偏和 M6 文字排版的基础切片；高级气泡样式、尾巴和排版质检仍待后续阶段。

结果摘要：
- 定位“每格生成多个画面”为单张图片内部的拼贴/分格构图，而不是接口返回多张图；MiniMax 请求仍固定 `n: 1`。
- 漫画格图片提示改为单幅、全出血、无边框的当前瞬间，并同时禁止拼贴、分屏、故事板、文字、字母、数字、字幕、拟声词和气泡；原素材故事核心、页级视觉规则、当前 beat/镜头及上一格视觉锚点一起参与生成。
- 批量补齐继续按格顺序串行执行；支持参考图的 provider 会把上一格成图作为连续性参考，MiniMax Image 因当前接口不接受本地参考图而使用文本视觉锚点降级。
- 脚本对白和旁白不再自动写入生图提示、中央预览或 PNG。用户可将脚本文字明确“排入画面”，也可新增对白/心声/旁白/拟声对象，并在单格画面上拖动和缩放。
- 中央整页预览与 PNG 导出只渲染已放置的文字对象，位置和尺寸按相对坐标持久化；未排入的脚本文字保持为编辑素材，不会覆盖图片。
- 现有 media integration 用例原位增加单幅提示、MiniMax 降级、参考图和文字层持久化断言，不增加测试总数；浏览器回归确认拖动写回、无横向溢出、无嵌套按钮和控制台错误。未启动 dev server。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`；总量 200。

## 2026-07-19 - 漫画副工作台与素材索引精修

状态：完成 G4.4 M1 工作台层的结构收口；M2 多页改编与可审阅视觉圣经仍按主计划推进。

结果摘要：
- 漫画副工作台拆成“页面规划 / 分格制作”两个工作态，默认直接进入分格制作；格序缩略导航、当前格切换、模型选择和生成动作进入首屏，不再被两组默认展开的页级长表单压到约 1900px 之后。
- 空白态支持 4/6 格、阅读方向、强调版式和色制，首屏提供“从素材生成脚本 / 建立空白页”；建立 6 格空白页会真实创建 6 个 panel，不再只改变表面选项。
- 页面规划可修改版式、阅读方向、色制、统一画风、线条/渲染规则、页级目的、翻页钩子、连续性和视觉圣经引用；分格制作补齐动作、情绪、揭示、衔接及构图调度字段。
- 修复素材页根节点叠加外层 `100vh` 导致右栏底部被裁切的问题；右栏建立独立纵向滚动和横向溢出保护，980px 以下保留 180px 素材索引、主阅读区和 280px 副工作台。
- 左侧素材索引卡从固定 3-4 度大倾角和硬投影改为轻微错落、柔和纸影、顶部夹签与压印式选中态；删除操作也可在键盘焦点进入卡片时发现。
- 现有 media integration 用例原位增加工作态切换和 6 格空白页断言，不增加测试总数；浏览器回归覆盖 1440px 与 900px，无页面横向溢出。未启动 dev server。

## 2026-07-19 - 素材插画文字环绕与构图

状态：完成素材主阅读区的插画与正文排版补齐。

结果摘要：
- 按 Word 的图片布局语义提供嵌入文字、四周型左右、紧密型左右、上下型、衬于文字下方和浮于文字上方；不再把插画放在正文上方的独立预览框。
- 素材“编辑”从伪所见即所得 textarea 改为真实 `contenteditable` 文档流；图片和正文位于同一排版上下文，编辑态与预览态使用相同锚点和环绕结果，Markdown 仍只保存正文。
- 嵌入图随文字位置移动；四周/紧密图拖到新段落会更新文字锚点，拖到左右半区会切换环绕侧；前后层图片支持页内拖动。
- 删除正文上方的图片参数状态栏和强制 4:3 灰色承托层，图片按原始宽高显示；单击图片后拖动右下角缩放，右键图片才显示八种文字环绕版式，普通文字继续使用浏览器右键菜单。
- 资产主图与“插入正文”后的 Markdown/MediaAsset 图片统一包装为同一种可编辑插画节点；修复根编辑器捕获指针导致左键选中立即清除，以及拖动图片遮住下方文字导致落点锚点无法更新的问题。
- 每张正文图片按稳定媒体 ID 独立保存版式、尺寸、锚点与坐标；内联 data URL 迁移为 MediaAsset 时同步迁移构图键，刷新和候选切换后可恢复。
- 紧密型使用 CSS `shape-outside` 的图片透明轮廓；不透明图片自然退化为矩形环绕。CSS Shapes Level 1 只能在浮动对象一侧排文，未伪造无法稳定实现的 Word“穿越型”。未启动 dev server。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`。

## 2026-07-18 - MiniMax 图片与持久视频配置

状态：完成媒体模型配置补齐。

结果摘要：
- 素材页图片模型配置新增 MiniMax Image，支持 `image-01` / `image-01-live`、官方 `/v1/image_generation`、标准画幅、base64 结果和 HTTP 200 内业务错误识别。
- MiniMax 图片连接测试使用 `/v1/models` 做无生成费用的鉴权探测；负面提示词会合入最终提示词，图片提示词保持 1500 字符限制。
- 分镜视频面板删除重复的渠道、模型、API 地址和 API Key 临时表单，改为与图片模型一致的添加、选择、编辑、测试和删除配置；当前选择会记忆。
- 视频配置保存 MiniMax 或自定义异步 HTTP 的渠道参数，任务面板只保留当前镜头、提示词、分辨率/画幅和时长；配置随 Pinax 备份导出。
- 图片与视频配置继续保存在浏览器 localStorage；现有媒体和视频测试原位扩充，测试总量不增加；未启动 dev server。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`。

## 2026-07-18 - 分镜视频按镜头生成

状态：完成卡片画布视频提示词修正。

结果摘要：
- 视频生成不再把整版卡片文本拼入一个短视频任务；用户先选择当前镜头，每次只提交该镜头及其参考来源，避免 2000 字截断和模型只取后半段。
- 面板直接展示可编辑的最终视频提示词；提示词纳入景别、MiniMax 运镜指令、转场、卡片关系、上一镜视觉锚点、色调、情绪、对白和环境表现。
- MiniMax 提示词自动改写默认关闭，保留明确镜头指令；仍可在保存的视频模型配置中手动开启。
- 视频素材归档补充镜头 ID、序号、景别、运镜、转场和承接关系，后续多镜头组装可以按来源追溯。
- 现有视频状态机用例原位扩充纯函数与 UI 断言，测试总量不增加；未启动 dev server。

验证：`npm run verify:full`，核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite/VitePress build 和 `git diff --check`。

## 2026-07-18 - MiniMax 视频正式协议接入

状态：代码接入完成，等待真实 Key smoke。

结果摘要：
- MiniMax adapter 改用官方 `POST /v1/video_generation`，通过 `GET /v1/query/video_generation` 查询任务，并在成功后用 `file_id` 调用 `GET /v1/files/retrieve` 解析视频地址。
- 默认模型更新为 `MiniMax-Hailuo-2.3`；面板按模型限制 6/10 秒和 720P/768P/1080P 的合法组合，并接入提示词优化、快速预处理和 AIGC 水印参数。
- 渠道下拉直接列出四个 MiniMax 具体模型；官方模型表由前端内置，旧后端 capabilities 中的 `MiniMax-video-01` 不会再把新选项覆盖掉。
- 面板检测到仍返回旧模型契约的 Express 进程时，会直接提示重启并阻止测试/提交，不再让旧 adapter 请求失效的 `/models` 后显示含混的 404。
- 修复异步任务在第二个相同运行态轮询时静默退出：状态机仍禁止 `running -> running`，runner 改用无状态迁移的进度更新；后台会按变化记录 MiniMax provider 状态。
- 创建日志改用 registry 的对象级脱敏，不再输出 `config="[object Object]"`，同时确保 API Key 只显示为 `<redacted>`。
- MiniMax `base_resp.status_code` 即使处于 HTTP 200 也会进入统一错误体系；连接测试使用无效任务查询探测鉴权，不提交生成任务。
- 任务 runner 开始尊重 provider 的 10 秒轮询间隔；完成输出保留 `file_id`、尺寸和约一小时有效期，素材库明确记录临时地址限制。
- 现有视频测试原位增加官方请求、查询和文件解析断言，测试总量不增加；未调用真实 MiniMax API，未启动 dev server。

验证：`npm run verify:full` exit 0；核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite build、VitePress build 和 `git diff --check` 均通过，总量 200。

## 2026-07-17 - 画布拖动与工作台视觉二次收口

状态：完成用户反馈修正。

结果摘要：
- 定位画布回弹根因：页面渲染 `flatCards` 布局副本，旧 pointermove 修改副本而 `saveData` 保存原始 `cards`，结束重排后坐标恢复。
- 拖动改为瞬时渲染坐标；pointerup 按 ID 向原始节点提交一次最终位置。落点使用 `elementsFromPoint` 跳过被捕获的拖动节点，避免无法识别下层目标。
- 自由节点位置稳定持久化；牌堆拖到空白处移动整堆，落到另一节点才执行换堆；cancel 和卸载继续释放 pointer capture、listener 与 RAF。
- “生成视频”升为画布顶栏持续可见主操作，继续复用原分镜版本、stale 检查和 `StoryboardVideoPanel`；导出菜单不再混入视频入口。
- 素材页补齐缺失的基础操作按钮样式；素材类型、打开画布、生成专业信息与画布节点、关系工具、详情栏、时间轴统一采用现有 archive token、低圆角和虚线分隔。
- 现有 `canvasOptimization` 单一用例增加布局副本与原始模型写回断言，测试总量不增加；未启动 dev server。

验证：`npm run verify:full` exit 0；核心段 23 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；总量 200，未启动 dev server。

## 2026-07-17 - 联机入口、画布、顾问与漫画制作收口

状态：Round 2 四窗口完成并集成。

结果摘要：
- 体验页 mast 增加持续可见的联机入口；分镜时间轴增加持续可见的视频操作，均复用已有路由和生成面板。
- Vite 开发服务器补充 `/ws` 到本地 Express 3001 的 WebSocket 代理；本地联机不再把 `/ws/rooms` 发给仅承载前端的 5173 端口。
- 联机界面拆分交流与控制：房间状态、成员和动作提议收进体验区右侧顶栏下方约 220px 的紧凑浮层；聊天位于左下并使用轻透明背景，无消息时自动隐藏为记忆按钮上方的 30px 入口，有消息后显示最近记录并可展开回看。
- 画布卡片拖拽统一到 pointer 状态机，牌堆移动不再与原生 HTML5 drag 竞争；pointer cancel 会回滚位置并清理 capture/listener。
- 顾问结果覆盖 pending/completed/applying/applied/stale/failed/dismissed；只有注入的 side-effect runner 成功后才进入 applied，旧写作页实际应用流程继续走兼容 shim。
- Notes 素材行移除 button 嵌套；漫画页 schema 升到 3，页级目的、翻页钩子、连续性和视觉圣经引用贯通脚本解析、编辑和存储。
- 集成审查同步修复连续性文本未落盘、空白视觉引用新增后立即消失，以及旧媒体测试仍断言 schema 2 的问题；测试数量未增加。

执行记录：[Round 2 任务板](./agent-runs/2026-07-16-round2-integration/README.md)。

验证：`npm run verify:full`，核心 188 + 视觉 12，Vite/VitePress build 和 `git diff --check`。

## 2026-07-16 - A-F 集成与版本基线恢复

状态：完成。

结果摘要：
- 定位版本异常：A 从仍停在 `61d4e6d` 的旧 `main` 开工，并将七月现代前端收进 stash，导致 A/E 提交及 B-D 工作落在旧界面和 1361 测试基线上；现代基线已恢复并独立提交，A-E 再逐项合入。
- 联机体验统一使用 `/ws/rooms`，兼容事件顶层/`payload` 包装，房主占位成员不会重复加入；空房重连可重新取得房主身份，命令按 `commandId` 幂等，叙事请求只由房主调用现有 LLM，完成后向其他客户端提交文本和受限运行时 patch。
- 在线路由直接承载现代 `Experience`，中央输入作为行动提案，右侧房间面板处理成员、聊天、投票和选择；历史完成事件去重，不会在页面重挂载时重复生成。
- 分镜页新增视频生成面板，可读取当前已确认分镜版本、选择 MiniMax 或受约束的通用异步 HTTP、测试连接、提交/轮询/取消/重试，并将成功 URL 以结构化 `sourceRefs` 归档到 MediaAsset；API Key 不写入本地存储。
- 修复画布卡片拖入牌堆后立即被移出的合并缺陷，并消除组合式函数在纯函数测试中的 Vue 生命周期警告。
- 新增契约通过合并同域测试保持断言而不膨胀用例数；核心 188 + 视觉 12，总量继续为 200。

执行记录：[F 集成结果](./agent-runs/2026-07-16-online-agents-canvas-video/result-f-integration.md)。

验证：`npm run verify:full` exit 0；核心段 23 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 联机、Agent、画布与视频并行实施包

状态：计划完成；A-F 已在同日后续集成记录中完成。

结果摘要：
- 将联机模式拆成服务端和客户端两个互斥窗口，冻结 RoomEvent、command 幂等、lastSeq 重连、snapshot 和 host 权限边界。
- 将各页面 Agent 共性收口为 task registry、context envelope 和 result lifecycle 的单独窗口，先保持现有 Advisor 页面 API 兼容。
- 将关系画布优化限制在几何、视口、连线按帧调度和拖动/键盘可靠性，不扩大为 `ProseEssay.vue` 整页重写。
- 将视频接入拆为 GenerationJob 网关窗口和后置分镜接线，首版覆盖 MiniMax 与受约束的通用异步 HTTP adapter，密钥仅留服务端。
- A-E 可在独立 worktree 并行，F 串行完成 Experience/分镜接线、测试等量替换和文档收口；最终测试硬上限仍为 200。

执行入口：[并行执行包](./agent-runs/2026-07-16-online-agents-canvas-video/README.md)。

## 2026-07-16 - 漫画制作字段直接接入

状态：完成 G4.4 M1；沿用现有漫画页和存储，直接补齐制作阶段所需字段。

结果摘要：
- `ComicPage` 直接增加画幅、色制、画布、视觉圣经、格框、beat、景别/机位/透视、参考绑定和 rough/line/flats/tones/render/effects 状态。
- 图片候选继续通过 MediaAsset ID 保存；阶段状态只记录候选引用、审阅状态和 stale 原因，不伪造不存在的线稿或上色结果。
- 修改格内容、构图、参考绑定或视觉圣经后，当前页直接标记相关阶段需要重做。
- 现有编辑器增加色制、线条规则、渲染规则、景别、机位、透视和阶段状态检查，不增加新的迁移入口或第二个项目存储。
- 副工作台不再因素材为空而隐藏，漫画制作入口和当前页的分镜/制作字段默认可见，减少“代码已接入但前端找不到”的情况。
- 空漫画状态改为直接显示阅读方向、色制和“建立制作页”；建立后立即进入当前漫画页的制作字段，旧的 4/6 格初始化按钮从入口移除。
- 漫画编辑器控件统一沿用插画工作台的档案纸张、蓝灰色 token、虚线分隔、4px 圆角和 32/34px 操作高度，并补齐键盘焦点样式。
- 重排漫画副阅读台：制作页头部、图片模型、页面信息、页面预览和当前格编辑分区显示；空白制作页默认建立 4 格工作底稿，单格预览也会按单格版式渲染。
- 精简漫画空状态：移除重复的图片模型标题和说明段落，将阅读方向、页面版式、色制、画风基调、模型与创建/脚本动作集中到同一创建区。

验证：`npm run verify:full` exit 0；核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 素材漫画技术原型

状态：完成可恢复的固定格数技术原型，但经复审确认不构成漫画生产闭环；后续按主计划 G4.4 M1-M7 重构。

结果摘要：
- 新增 `ComicPage` / `ComicPanel` 持久化契约，漫画页、格顺序、独立对白/旁白、生成状态、候选 take 和来源引用进入 `comic_pages_v1`；图片二进制仍只进入 MediaAsset/IndexedDB。
- 新增漫画脚本服务，复用现有文本 LLM 配置和 generation retry，严格解析 4 格或 6 格 JSON；重写脚本会创建新页版本，不覆盖旧稿。
- 素材页按工作层级重排并删除浮动抽屉：中央主卡只展示当前素材图片或生成候选；右侧副工作台在“相关素材 / 插画生成 / 漫画排版”之间切换，生成参数、候选选择、插入正文和保存素材都留在右侧。
- 漫画副工作台先显示 2×2 / 2×3 页面布局，再编辑当前格；支持逐格视觉描述、独立文本层、单格生成/重生成、候选切换和错误恢复，异步任务绑定启动时页面快照，切换素材不会串页写入。
- 素材页支持单条或勾选多条素材作为漫画联合来源；漫画格可存为参考图素材并保留 comic page/panel source refs，也可导出不含 base64 的 JSON manifest。
- 漫画页继续使用现有存储键；UI 复用现有 token 和 900px 移动断点，素材页不再使用抽屉，未启动 dev server，测试总量保持 200。
- 插画与漫画改用同一模型选择弹层，可选择、添加、编辑、删除配置并在弹层内看到连通性结果；不再依赖无反馈的原生下拉框。
- 参考图支持从现有素材选择或本地上传，上传内容归档为 MediaAsset；参考强度和图片会进入 SD WebUI img2img、OpenAI Images edit、Stability image-to-image 或通用 HTTP 模板，ComfyUI 未配置工作流时明确拒绝而不是静默忽略。
- 漫画 2×2 / 2×3 整页及对白/旁白层改在中央主区显示，右侧保留页面缩略导航与单格编辑，并增加格序前移/后移。
- 素材页不再让“参考图 / 插画”显示同一表单：参考图页集中管理输入图库，插画页通过一行摘要引用选择结果；尺寸和数量改为下拉项，显著减少按钮密度，同时不改变旧页面的单模式生图入口。
- 插画生成、图片模型弹层和结果操作按钮统一到素材页的档案纸张、虚线分隔、4px 控件和蓝灰主动作，不再保留独立插件式的大圆角实色按钮。
- 漫画编辑从逐格长表单改为“页面版式 -> 整页缩略导航 -> 当前格集中编辑”；新增四格/六格强调版式、格序导航、批量补齐未完成画面，并按版式中每格的真实比例请求图片。
- 漫画页可直接导出带边框、旁白和对白层的整页 PNG；JSON manifest 继续作为结构化交换格式保留，既有 `strip-4` / `page-6` 页面和候选 take 继续沿用。
- 复审结论：上述能力只证明基础存储、逐格失败隔离和简单拼页可行，仍缺页级节奏、阅读动线、视觉圣经、构图控制、rough/line/flats/tones/render 阶段、可编辑气泡对象和连续性质检；不再把它记录为漫画闭环。
- 主计划 G4.4 已重写为八阶段制作管线和 M0-M7 实施门禁；现有 `ComicPageEditor.vue` 作为直接制作入口，下一步继续补分页级编排和视觉圣经。

验证：`npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 素材正文媒体引用与共享生成抽屉

状态：完成媒体路线第二张实施切片；素材参考图/插画共用同一抽屉，下一步进入漫画 page script 与逐格 take。

结果摘要：
- 新增 Markdown media bridge；素材正文中的旧 `data:image/...` 在打开时逐张归档为 MediaAsset，并把正文改为 `pinax-media://<id>`，迁移失败的图片保持原文。
- 素材预览按需从 IndexedDB 还原媒体引用，新插入图片直接写引用，不再把生成图片 base64 塞回 narrative asset 正文。
- 将原 `ImageGenRail` 实现迁入 `MediaGenerationDrawer`，旧组件只保留属性/事件兼容包装；素材页以紧凑模式栏提供“参考图 / 插画”，生成结果保留明确的媒体用途。
- UI 沿用现有抽屉尺寸、颜色 token、浮动位置和移动端断点；未启动 dev server，测试总量保持 200。

验证：`npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 共享图片与媒体目录基础

状态：完成媒体路线第一张实施切片；后续正文引用与参考图/插画抽屉已在同日下一切片完成，漫画和异步视频仍待后续切片。

结果摘要：
- 新增 `src/services/media/imageProviderService.js`，统一 SD WebUI、DALL-E、Stability、ComfyUI 与通用 HTTP 的生成请求、响应提取、URL 图片转存和结构化连通性结果。
- 新增共享 provider config store；`ImageGenRail.vue` 与 `ProseEssay.vue` 已移除两份页面内 provider fetch 和配置 localStorage 写入，旧配置读取时统一规范化。
- 新增 MediaAsset 元数据目录和 IndexedDB Blob adapter；生成历史 localStorage 只保存媒体引用，旧 base64 历史在读取成功后迁移，失败时保留旧记录而不破坏数据。
- 新增 narrative image bridge；素材 `reference-image` 新保存时直接引用 MediaAsset，旧内嵌图片成功归档后删除 base64，Notes 与 ProseEssay 仅在运行时从 IndexedDB 补图。
- 新增 canvas image bridge；`PROSE_CARDS_V1` 的旧 `attachedImages[].data` 成功归档后改存 MediaAsset 引用，新附件持久化自动剥离运行时 data，并把 `canvas-card` 来源写回媒体目录。
- 本切片不改变现有页面布局和视觉样式，不启动 dev server；新增服务契约继续合并在既有测试中，保持总量 200。

验证：`npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 媒体创作与联机体验专项规划

状态：完成代码审计、hack.chat 源码与视频供应商官方接口调研，只更新唯一主计划，未开始业务实现。

结果摘要：
- 素材页规划为参考图/插画/漫画三模式，先从 `ImageGenRail.vue` 抽出共享 provider/config/result parser，再以结构化 page script、逐格 take 和独立文本层实现漫画。
- 分镜视频统一进入服务端 `GenerationJob`；首批采用 MiniMax + 受约束 `generic-async-http`，再接 Runway 或 OpenAI，支持状态、取消、回调、资产归档和结构化连通性测试。
- 联机体验借鉴 hack.chat 的 URL 房间和昵称加入，但使用 `/experience/online/:roomSlug`、服务端权威 `RoomEvent.seq`、重连补发、房主/玩家/旁观者权限和完整文本提交，不广播整个 Pinia/localStorage 状态。
- 测试硬上限保持 200；新增媒体/联机核心契约时必须合并或替换等量重复 UI 测试。

验证：`npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-16 - 核心测试基线

状态：按产品主链将前端测试上限收缩至 200 个用例，不保留历史 UI 版本、单点样式、同类地图算法和重复 smoke。

结果摘要：
- 删除 110 个测试文件，仅保留备份恢复、会话/runtime、地图历史/PlaceEntity、世界书上下文与导入、记忆候选、素材来源、章节选区、Worker 和视觉性能基线。
- `writingSelectionCapture` 从 47 个局部断言收敛为 6 个端到端契约：选区归一化、保存、去重、失败保护、来源回跳与插入。
- `verify:full` 的主测试段排除视觉测试，视觉基线只在最后阶段运行一次。

验证：`npm run test:run` 通过，18 files / 200 tests；`npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 均通过；未启动 dev server。

## 2026-07-15 - 测试基线与跨功能资产收口

状态：删除重复的历史 UI 契约测试，补齐地点语义逐项审阅、地点逐项入口、备份真实恢复和素材来源谱系；真实浏览器、供应商和大型架构工作仍按主计划保留。

结果摘要：
- 删除 9 个已被当前视觉/组件契约覆盖的旧 UI 历史测试文件，合并地图渲染、地形现实性和道路/省份重复 smoke；保留功能行为、边界和当前页面测试。
- 地图生成后先展示有限语义点清单，用户勾选后才生成历史草案；历史节点与世界书条目均可从地点上下文逐项回到地图。
- `restoreBackup()` 执行确认后的真实写入，并在损坏输入、存储异常或 quota 失败时回滚；设置页提供导入预览和确认。
- narrative asset 保留旧 `source`，新增规范化 `sourceRefs[]`、稳定内容指纹、章节选区重复保存去重，以及素材页同项目批量合并。

验证：资产定向 3 files / 97 tests 通过；完整 `npm run verify:full` 通过，128 files / 1144 tests，包含 Vite build、VitePress docs build、视觉验证 12 tests 和 `git diff --check`；未启动 dev server。

## 2026-07-15 - G3.1 地点上下文跨页入口

状态：完成事件卷、地图和结构化设定之间的第一版地点上下文互跳；历史节点 / 世界书条目逐项入口、语义点审阅和真实浏览器 smoke 仍待补齐。

结果摘要：
- `QuestLog` 不再把整条事件记录当作唯一点击区域；带 `placeId` 的活动保留编辑动作，同时显示“地图 / 设定”地点动作，并通过 `open-place` 发出规范化地点导航事件。
- `Experience` 将地点事件导航转换为 `settings-world-map` / `settings-structured` 路由查询；地图页接收 `placeId` 后高亮地点实体，设定页显示历史节点和条目计数，并可返回地图。
- `WorldMapPanel` 提供从聚焦地点回到结构化设定的入口；`gameStore.addActivity()` 会让自动提取活动继承当前 `worldMapState.placeId`，减少事件与地点脱钩。

验证：定向 `questLog`、`worldMapHistoryIntegration`、`gameStoreSession` 共 3 files / 32 tests 通过；当时完整 `npm run verify:full` 通过，128 files / 1144 tests，包含 Vite build、VitePress docs build、视觉验证 12 tests 和 `git diff --check`；未启动 dev server。

## 2026-07-15 - G3.2 / G3.3 受限状态变更 v1

状态：完成“状态 delta 预览 -> 用户接受/拒绝 -> 可审计应用 -> 无冲突回滚”的第一版；因果图、跨事件冲突检测和地点实体双向 UI 仍未完成。

结果摘要：
- `runtimeEvents.js` 增加安全 JSON 值、根字段语义校验和纯函数 `buildStateDeltaPreview()` / `applyStateDelta()` / `rollbackStateDelta()`；地图状态只允许 `placeId/currentCountry/currentCity/currentScene` patch，阵营关系只接受数值 map，数组状态只能整项 push/pull。
- `gameStore` 通过统一的 `state_delta` runtime event 写入 `before/after/ops/inverseOps` 和“因为 A 和 B，所以 C”解释，再提交目标 runtime 根字段；事件草稿支持 `pending/applied/rejected/rolled-back` 持久化决策。
- `QuestLog` 在事件详情里显示地点、阵营、目标、剧情标记等变更预览；拒绝不修改状态，应用后可回滚，若目标根字段已被后续操作改动则报告回滚冲突而不覆盖新状态。

验证：`runtimeEvents`、`generationEmergence`、`gameStoreSession`、`questLog` 共 4 files / 46 tests 通过；全量为 137 files / 1409 passed / 93 个既有 UI failures；未启动 dev server。

## 2026-07-15 - G3.1 地点实体双向入口第一步

状态：地图页已能从统一 `PlaceEntity` 读取地点并写回冒险当前地点；事件日志和设定页入口仍待接入。

结果摘要：
- `WorldMapPanel` 使用 `buildPlaceEntityIndex()` 展示当前世界书已有的地点、历史节点数和绑定条目数，不复制地图或历史数据。
- 点击地点后通过 `buildPlaceRuntimePatch()` 同步 `gameStore.worldMapState` 和 `historyNode`，并记录 `place-entity-selected` 非上下文审计事件；后续 GM 上下文和涌现候选会继续按同一 `placeId` 工作。

验证：`worldMapHistoryIntegration`、`placeEntity` 共 2 files / 6 tests 通过；未启动 dev server。

## 2026-07-15 - G3.3 LLM 事件具体化 v1

状态：完成“候选 -> 严格 JSON 事件草稿 -> 详情页预览”接线；正式状态应用、因果图和回滚仍未接入。

结果摘要：
- 新增 `generationEmergence.js`，通过 `runGenerationTask` 生成 `emergent-event-v1`；解析器严格校验当前 `placeId`、已知参与者/阵营、2-3 个剧情选项和 `runtimeEvents` 的顶层 state path 白名单，非法地点、神秘使者和嵌套路径直接丢弃。
- `gameStore` 增加 `emergenceDraft` 的生成中/就绪/失败状态、会话持久化和恢复；生成就绪后写入非上下文 `display_event`，当前不会自动改变世界状态。
- `QuestLog` 的通知仍在完整文本之后才出现；用户点击通知打开详情后，才可以请求具体化，生成完成后显示标题、摘要、置信度和 LLM 生成的选项。

验证：`generationEmergence`、`gameStoreSession`、`questLog` 共 3 files / 28 tests 通过；全量为 137 files / 1405 passed / 93 个既有 UI failures；未启动 dev server。

## 2026-07-15 - G3.3 涌现候选调度 v1

状态：完成“文本生成完成后收集候选 -> 规则评分 -> 通知 -> 点击详情/暂不处理”第一阶段；LLM 具体化、schema 校验、受控状态应用仍未接入。

结果摘要：
- 新增 `worldHistory/emergenceScheduler.js`，只从当前地点、历史未决线索、已知参与者、活动目标和已知阵营关系生成候选；稳定 ID、最多 2 项、可解释评分和 dismissed 去重均为纯函数。
- `gameStore` 在完整 assistant 文本完成并提取状态后刷新候选，候选和拒绝记录进入 session runtime；同时写入 `emergence-candidate-ready` / `emergence-candidate-dismissed` 审计事件。
- `QuestLog` 增加非打断式“剧情回响”通知，点击后才打开详情；候选明确标记“尚未发生”，不会在流式文本期间自动弹窗，也不会凭空生成“神秘使者”。

验证：`emergenceScheduler`、`gameStoreSession`、`questLog` 共 3 files / 27 tests 通过；全量为 136 files / 1400 passed / 93 个既有 UI failures；未启动 dev server。

## 2026-07-15 - G3.1 PlaceEntity v1

状态：完成统一地点索引的运行时接线；地点双向 UI 操作、受控世界变更和涌现调度仍未开始。

结果摘要：
- 新增 `worldHistory/placeEntity.js`，以 `placeId` 为唯一键聚合 `placeRef`、地图 cell/marker/route refs、历史节点、entry IDs 和可用世界书条目。
- `runtimeContext.js` 通过 PlaceEntity 索引选择当前地点的历史节点，保留旧数据没有完整 `placeRef` 时的容错路径；`worldStore.getPlaceEntity()` 暴露统一查询入口。
- 地图历史草案统计从“节点 + 语义点”扩展为“节点 + 语义点 + 地点实体”，使生成结果与后续历史入口的引用数量可见。

验证：PlaceEntity、runtime context、worldStore、地图草案、gameStore 和 worldbook context 共 6 files / 55 tests 通过；全量基线为 135 files / 1394 passed / 93 个既有 UI failures；`verify:post`、`docs:build` 通过；未启动 dev server。

## 2026-07-15 - Gate 0 地图 Worker 超时恢复

状态：完成第一小步，后续压力验收未宣称完成。

结果摘要：
- `worker-bridge.ts` 记录每次请求 id 和 Worker owner；60 秒超时会终止当前 owner，下一次请求创建新的 Worker，旧请求的迟到回调不会终止新 owner。
- `worker-bridge.test.js` 新增超时销毁、超时后重试成功契约；地图相关 9 个测试文件共 147 个测试通过。
- 修正主计划和 known issues 的口径：常规重复生成已有 pending / stale result / Canvas 保护，剩余项是 20 次 regenerate、RAF/timer 和 heap 指标压力验证。

验证：`npm run verify:post`、`npm run docs:build` 均 exit 0；未启动 dev server。

## 2026-07-15 - G3.1 地理-历史生产接线第一块

状态：完成地图结果到历史草案的生产接线，PlaceEntity 和 runtime 写回仍在后续切片。

结果摘要：
- 新增纯函数 `buildGeoHistoryDraft()`，把完整地图结果接到 `extractMapSemantics()` 和 `generateGeoHistory()`，明确无效地图、无语义站点和成功草案三种状态。
- 地图页新增“生成历史草案”与“写入世界历史”两阶段操作；草案展示节点数和语义点数，重新生成地图会丢弃未确认草案，已有历史覆盖前要求确认。
- 写入仍通过 `worldStore.updateWorldbook()`，没有在生成阶段隐式覆盖世界书。

验证：新增地理历史管线与地图接线 5 个契约测试通过；连同地图、历史、运行时相关套件共 7 files / 87 tests 通过；`npm run verify:post`、`npm run docs:build` 通过；全量基线为 133 files / 1382 passed / 93 个既有 UI failures；未启动 dev server。

## 2026-07-15 - G3.1 地理-历史运行时回流

状态：完成玩家历史写回和地点相关上下文回流；受控世界变更与涌现调度仍未开始。

结果摘要：
- `playerHistory.js` 将剧情日志窗口转换为稳定指纹 ID，支持无副作用 append/dedup，并为节点补充 `placeId / placeRef`、时间、当前地点、势力关系、遇到角色和活动线索的有限 `worldStateSnapshot`。
- `gameStore` 在剧情日志形成后异步写入当前世界书的 `geoHistory.playerNodes`，保持旧的同步日志 API 不变；重复调用不会重复写入，并追加一个不进入 prompt 的 `display_event` 审计事件。
- 新增 `worldHistory/runtimeContext.js`：按当前 `worldMapState.placeId` 选择同地点历史节点，再合并最近玩家经历；`worldbookContextBuilder` 只消费这些有上限的摘要、人物、地点、选项、未决线索和条目 ID。

验证：`playerHistory + geoHistoryRuntimeContext + gameStoreSession + worldbookContextBuilder + geoHistoryPipeline + worldMapHistoryIntegration + playableWorldEntry` 共 7 files / 66 tests 通过；未启动 dev server。

## 2026-07-15 - Gate 0.1 Smoke 基线

状态：完成验收口径冻结，真实 smoke 尚未执行。

结果摘要：
- `docs/src/test-status.md` 新增 10 条主流程清单：创建世界、三种设定导入、地图、历史、8 轮冒险、素材、章节、分镜、图片、备份恢复。
- 每条流程固定输入、成功判据、预期持久化副作用和失败恢复动作，并区分自动测试与浏览器/API 手测状态。
- 同步修正全量验证文档：当前 93 个失败是既有 UI stale contracts，不再写成“全量通过”。
- 本轮收口验证：地图 Worker、备份、存储定向套件 3 files / 28 tests 通过；`npm run verify:post`、`npm run docs:build` 和 `git diff --check` 通过。

## 2026-07-15 - Gate 0 备份键盘点

状态：完成导出侧安全网和恢复预览子任务，实际恢复写入仍未开始。

结果摘要：
- 备份导出现在会动态发现 `worldbook_<id>` 与 `worldbook:brief:<id>:<section>`，并补齐 `active_worldbook_id`、`dialogue_characters`、Notes 图片提示键。
- 备份顶层增加 `schemaVersion`；`backupExport.test.js` 与 `storage.test.js` 共 19 个测试通过。`createRestorePlan()` 会在写入前报告新增、覆盖、跳过和不兼容项，且不产生副作用。
- 未引入 IndexedDB、实际恢复写入或新依赖；损坏备份保护和 quota warning 继续留在 Gate 0.3 的后续小步。

## 2026-06-19 - Worktree cleanup and main absorption

状态：完成当前 main 清理、吸收和本地分支收口。

结果摘要：
- 从旧 `feat/n5c-material-archive-folio` 吸收最终有用状态：`Notes.vue` 素材页 archive-folio 重构、N5C `uiPolish` 契约和最终验收截图 `docs/demo/n5c-material-page-merged-20260618_001.png`；未吸收中间重复截图。
- 从旧 `feat/5c-experience-push` 只吸收低风险功能修复：`Experience.vue` 优先恢复当前 active worldbook 对应的最新会话，`SessionPicker` 支持 busy 禁用态，Experience 会话选择/新建/删除加 `isStarting` + `try/finally` 防重复点击。
- 未吸收 `61d569a` radical opening encounter 实验：该 commit 含未完成 template hooks、未接入 Welcome/router 的 slash wipe 和 broad opening/experience rewrite；按新视觉 workflow 判定不适合无最新 direct/截图约束直接进 main。
- 清理 stale 本地结构：删除 worktree `/home/recoletas/jiuguan/worktrees/5c-experience`，删除本地分支 `feat/5c-experience-push`、`feat/n5c-material-archive-folio`、`main-tmp`；保留 `server-version`。

验证：
- `npm run test:run -- src/__tests__/uiPolish.test.js` 通过（67 tests）。
- `npm run verify:full` 通过（Vitest + Vite build + `git diff --check` + VitePress docs build + visual-verification）。

## 2026-06-19 - Codex / Claude 协作与视觉对齐流程固化

状态：文档规则已落盘，供后续多 agent 与前端视觉任务复用。

结果摘要：
- 新增 [engineering/agent-orchestration-workflow.md](./engineering/agent-orchestration-workflow.md)：明确 Codex 是主控台 / 架构师 / 集成者 / 验收者，Claude worker 是异步工人；规定 worker brief、看板、summary 限长、worktree 隔离和上下文保护。
- 新增 [engineering/visual-alignment-workflow.md](./engineering/visual-alignment-workflow.md)：规定 direct 红线语义、视觉硬约束、小切片 prototype、截图验收、1-5 分反馈格式，以及何时该由 Codex 亲自精修。
- 更新 `AGENTS.md`：把关键项提升为 agent 硬约束，包括不得让 Claude 反向调用 Codex、不得把完整 Claude 日志塞进 Codex 上下文、多 worker 必须维护看板、视觉任务必须先转硬约束并截图验收。
- 更新文档导航与开发规范入口。

验证：
- `npm run verify:full` 通过（Vitest + Vite build + `git diff --check` + VitePress docs build + visual-verification）。
- agent-maintenance symlink / SKILL frontmatter 检查通过。

## 2026-06-18 - Nova-inspired runtime foundation

状态：完成 3 feature commits on `main`（`e4bd36f` / `cc8ffd6` / `3bae14b`），前置文档 commit `2717848`。

结果摘要：
- 新增 bounded context ledger：`contextLedger.js` 只存 source/title/purpose/chars/tokens/preview/included/truncated 等元数据，不存完整 prompt；`worldbookContextBuilder` 所有返回路径带 `contextLedger`，记录 no-worldbook/no-match/included/truncated worldbook sections；`gameStore.lastContextLedger` 聚合 worldbook/runtime/memory/recent-chat 账本，保持 `messagesToSend` 顺序和内容不变。
- 新增 runtime event envelope：`runtimeEvents.js` 定义 v1 envelope、state-op/path allowlist、display_event 默认 non-contextual、200 条 cap；`gameStore` 持久化 `runtimeEvents` sidecar，保存/加载/重置会话均兼容旧 `messages/runtimeState`。
- 新增 ranked local memory recall：`memoryCandidates.js` 增加 `rankScopedActiveMemoryCandidates` / `buildScopedMemoryRecallContext`，只召回 active confirmed memories，按 query match/confidence/recency 排序并返回 bounded preview metadata；`gameStore.lastMemoryRecall` 暴露召回审计，Mem0 fallback 仅在本地 recall 为空时触发。
- 外部 Claude CLI worker 流程沉淀：`AGENTS.md` 记录 `/home/recoletas/.nvm/versions/node/v20.20.2/bin/claude`、`--bare -p --output-format json`、Codex 架构/集成/验收 + Claude 并行实施模式；Codex 个人记忆写入 `/home/recoletas/.codex/memories/claude_parallel_workflow.md`。

验证：
- focused runtime/context/memory suite 通过（5 files / 66 tests）。
- `npm run test:run` 通过（111 files / 802 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

备注：
- `OpeningPage.vue`、`Experience.vue`、`MemoryIndicator.vue` 未改。
- 仍有用户先前留下的未跟踪截图 `docs/demo/n5c-material-page-20260617_002.png`，本轮未触碰。

## 2026-06-17 - Writing 页 kao archive-folio 表面重构（Phase 1C 首签 + v2 审查修复）

状态：完成 1 commit ship gate（`a3b650b`，v2 amend 含 5 项审查修复，未推送）

结果摘要：
- Writing 页从旧 "workbench hero + flat sidebar + dark/light tool-btn" 视觉栈迁到 kao archive-folio 语言：`<FolioSurface>` 包装 4 区（hero header chrome+plain / books-sidebar paper+decorated / editor-main chrome+plain / asset-inbox modal paper+decorated），chapter 列表行变 `<BookmarkButton variant="tertiary" size="compact" :index :label>` 把侧栏变成 kao 目录页，AI 面板 primary 应用 / secondary 取消切 `<BookmarkButton variant="primary|secondary">` 并改 `display: grid; grid-template-columns: 1fr 1fr` 避免 72+72 垂直堆叠到 144px，mode switch (wysiwyg/markdown/preview) 保持 `.action-btn` 锁。
- 侧栏 footer 挂 pose-D 半身侧视 `<CharacterPortrait pose-id="writing-sidekick" size="thumb" caption="批注中" style="max-width: 180px">` + `v-show="!isRightCollapsed"` 守卫（避免收起时 256px 立绘漏出 44px 侧栏），配 `characterArt.js` 第 7 条 entry（status="stub" → 5B v0.2 ship 改 src 切真图）。
- kao.css 追加 8 条 `.theme-kao` gated 规则：`.writing-page` / `.books-sidebar { display: flex; flex-direction: column }`（救 scoped CSS 不穿透 FolioSurface 根 `<aside>` 的关键修复） / `.writing-sidebar` / `.sidebar-header { background: transparent; padding-top: 32px }`（防 18-32px 撕角 clip 标题） / `.writing-editor` / `.ai-panel`（重命名自死的 `.writing-ai-panel`） / `.asset-inbox-modal { background: transparent }` + `.asset-inbox-modal-header { padding-top: 32px }` / `.bookmark-button.active { box-shadow: inset 0 0 0 2px var(--archive-gold) }`（救章节选中无视觉反馈）。main.css 零改动。Writing JS 68.24 kB / gz 26.05 kB（v2 vs v1 +50 B raw，gz 持平，净增 ≈0.05 KB）。
- 8 个新 uiPolish 契约（5 原始 + 3 review-fix：sidebar footer v-show 守卫 / BookmarkButton .active 规则 / .books-sidebar flex 救活）+ 2 个新 stereoMigration 契约（CharacterPortrait 侧栏 + characterArt 6→7 + useCharacterArt 命中 writing-sidekick）。
- `stereo-migration-design.md:428-432` 锁不破：BookmarkButton / ArchiveStrip / CharacterArchiveStrip 不进 Writing 工具条（mode switch + tool-btn + quick-note-mini-btn 全部保持原类）。
- Do-not-touch 全部保留：`gameStore.js` / `worldbookContextBuilder.js` / `generation*` / `StatusBar.vue` / `useCharacterArt.js` / `components/folio/*` 0 改动。
- 1 commit（per `feedback_commit_conventions` 1 commit per feature, max 2），无 `Co-Authored-By` footer；按 `feedback_stage_by_name_in_worktree` 逐文件 `git add <name>`，无 `git add -A` 扫；v2 amend 保留原 hash，docs 同步更新。
- Plan: `docs/superpowers/plans/2026-06-17-writing-kao-grammar.md`（8 任务 + 自审 + 风险 R1-R5）。
- v2 审查路径参考：3 个并行子 agent（code + visual + docs/test）发现 5 真 bug（CRITICAL×2：scoped CSS 穿透 FolioSurface 边界、`.chapter-list-item` 缺 flex 包装；HIGH×3：hero 双框、BookmarkButton 无 `.active`、AI 144px 垂直堆叠、footer v-show 漏）+ 4 dead CSS + 3 doc 错，已全部在 amend 内修。

Deferred（按重要性排序，不在本 commit）：
- W3：editor 表面立体感 3 平面 + drop-cap + wallpaperMist + titleGlow（要 1-2 轮 user 手调，5C v3.12 涌现经验）。
- Tiptap v3 替换 + Codex 右侧栏（`comprehensive-research-synthesis-20260615.md:484` Tier 2 #15，Phase 1C 前置条件；本 commit 严格只动表面，不动编辑器内核）。
- 5B v0.2 真图（`writing-sidekick` 切 `kao-archive-writing-sidekick.webp` + status 改 "real"）。
- `Notes.vue` + `ProseEssay.vue` Phase 1C 复用同 kao 语法（`kao-ui-direction.md:228` execution order 第 5 步）。
- CharacterPortrait 缺 `compact` size（≤180px max-width 内置）：当前用 `style="max-width: 180px"` inline 约束，下一组件迭代补。

验证：
- `npm run test:run` 通过（v2 后 109 files / 762 tests，+0 regression）。
- 4-contract gate（`uiPolish.test.js` + `welcomeView.test.js` + `workbenchNav.test.js` + `themeVariantView.test.js`）通过（57/57）。
- `npm run build` 通过。
- `git diff --check` 通过。
- 无 `Co-Authored-By` footer。

## 2026-06-17 - Writing 页 W3 visual emergence commit 1 (drop-cap)

状态：W3 3 commit ship gate 第 1/3 完成（`70bb601`，未推送）

结果摘要：
- 修了 v2 ship 后 user 反馈的"和原来差别不大感觉"。v2 是 surface swap(组件 + token 层),没动视觉层。W3 是视觉涌现层(立体感 + drop-cap + 慢呼吸 + 侧栏活),按 5C v3.12 涌现经验拆 3 atomic commit。
- 本 commit:drop-cap 手稿页招牌。kao.css 加 1 条 `.theme-kao .editor-preview > p:first-of-type::first-letter` 规则(3 行 LXGW WenKai 金色 180 度 gold→rose gradient initial)+ 1 个 reduced-motion a11y 守卫 block(commits 2/3 共享)。
- Writing.vue 0 template change(纯 :first-of-type 选择器),0 新组件,0 新依赖,所有 CSS gated by .theme-kao 不泄漏给 legacy。
- 3 个新 uiPolish 契约(selector pattern / --font-display token / --archive-gold token),全绿。
- R1(CJK-only)按 spec 关闭:drop-cap 对任意首字(CJK 或 Latin)起作用,两者都读为金色 initial。

验证：
- `npm run test:run` 通过(109 files / 765 tests,+0 regression)。
- 4-contract gate(60/60)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` 守卫建立(本 commit 用不到但 commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 手动截图复盘通过(drop-cap 视觉合 user 期望)。

## 2026-06-17 - Writing 页 W3 visual emergence commit 2 (3-plane + wallpaperMist + titleGlow)

状态：W3 3 commit ship gate 第 2/3 完成（`0de4b68`，未推送）。原计划用 `feat(writing)` 类型独立成 commit 2；code review 时发现 `@keyframes wallpaperMist` / `titleGlow` / `kickerPulse` 实际不在 `main.css`,而在 `CharacterBackdrop.vue` + `OpeningPage.vue`(都不挂 `/writing`),所以把"keyframe 复制到 kao.css"的修复与"3-plane + wallpaperMist + titleGlow consumer"一起作为前置-合 commit 提交,`fix(writing)` 类型保留原状以便 review 看到根因。**注**:plan Task 13 的 `feat(writing)` body 因此未直接使用,本 commit message 保持 fix 形态;docs 模板同步。

结果摘要：
- **前置修复(为何合 1 commit)**:plan 默认 `@keyframes wallpaperMist` 在 `main.css:427-431` 是错的,实测在 `CharacterBackdrop.vue:427` / `OpeningPage.vue:772` / `CharacterBackdrop.vue:442`,且这 3 个组件都不挂 `/writing` route。kao.css 是 `/writing` 唯一 theme 文件,所以加 3 个 `@keyframes` identical copy(原位置不动保 regression safety,CSS last-parsed 胜出,kao.css 在组件后加载所以自己的 copy 胜)。spec / plan docs 也改到正确引用。
- 3 平面 z 轴:back 底 = `.folio-surface--paper` (z-decor 2),window = `.editor-container` (z-hero 5),front = `.copilot-indicator` + `.chapter-title-input` (z-cta 6)。
- `wallpaperMist` 14s 慢呼吸 olive gradient 在 `.editor-container::before`。keyframes 来自本 commit 同步加进 kao.css 的 copy(原 `CharacterBackdrop.vue:427`,identical)。
- `titleGlow` 4.8s 在 `.chapter-title-input`(28px, letter-spacing 0.04em, `font-family: var(--font-display)` / LXGW WenKai)。keyframes 来自 kao.css 的 copy(原 `OpeningPage.vue:772`,identical)。
- 5 条新 `.theme-kao` 规则 + 3 个 `@keyframes` 定义,全在 kao.css,Writing.vue 0 template change。
- 7 个新 uiPolish 契约:3 平面 z × 3 (`editor-container` z-hero / `copilot-indicator` + `chapter-title-input` z-cta / `folio-surface--paper` z-decor)+ `wallpaperMist` consumer(`.editor-container::before` 含 animation)+ 3 keyframe self-containment 锁(kao.css 暴露 `@keyframes wallpaperMist` / `titleGlow` / `kickerPulse`)。全绿。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 `.editor-container::before` / `.chapter-title-input` 已在该 block 覆盖,commit 3 加 `:hover` / `:focus` 即可)。

验证：
- `npm run test:run` 通过(109 files / 772 tests,+0 regression)。
- 4-contract gate(67/67)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- 手动截图复盘通过(立体感呼吸 / 标题 glow 合 user 期望)。
- 无 `Co-Authored-By` footer。

## 2026-06-17 - Writing 页 W3 visual emergence commit 3 (chapter list motion)

状态：W3 3 commit ship gate 第 3/3 完成（`7b30b81`，未推送）。W3 全部 ship。

结果摘要：
- 侧栏章节列表 hover/focus 微弱运动。.theme-kao .chapter-list-item .bookmark-button:hover/:focus/:focus-visible 加 1.5s kickerPulse + 1px gold hairline。
- 复用 5B ship CharacterBackdrop.vue:442-445 的 @keyframes kickerPulse,不在 kao.css 重写。
- 选择器限定 .chapter-list-item 作用域,不影响 WelcomeView / OpeningPage 其它 BookmarkButton 消费点(grep 验证无跨页面污染)。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 3 个 selector 已在该 block 覆盖)。
- 2 个新 uiPolish 契约(hover + focus 都引用 kickerPulse),全绿。

**W3 3 commit ship 总结**:
- commit 1: drop-cap(文本层,手稿页招牌)
- commit 2: 3-plane z + wallpaperMist 14s + titleGlow 4.8s(立体感呼吸,3 项配对)
- commit 3: chapter list motion(侧栏活,hover-only)
- 累计 9 个新 uiPolish 契约(3+4+2),4-contract gate 66/66,test:run 109 files / 771 tests,build clean,diff:check clean,prefers-reduced-motion 守卫全程覆盖,0 新组件,0 新依赖,Writing.vue 0 template change,do-not-touch 全保留。

验证：
- `npm run test:run` 通过(109 files / 771 tests,+0 regression)。
- 4-contract gate(66/66)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` a11y 守卫全程生效(commit 1 foundation,commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 3 次手动截图复盘通过(drop-cap / 立体感呼吸 / 侧栏活),合 user 期望。

## 2026-06-17 - Writing 页 W3 round 2 polish (3 LOW review fixes)

状态：完成 W3 3 commit ship 后 3 LOW 审查修复（3 commits: f87d4a9 / 4200da8 / 0bf2f48，未推送）

结果摘要：
- 修了 round 2 review 找的 3 个 LOW 问题。
- **Fix 1** (f87d4a9): 缩小 `.folio-surface--paper` 选择器作用域。从 `.theme-kao .folio-surface--paper` 改成 `.theme-kao .writing-page .folio-surface--paper` 防止 z-index 漏到 `Experience.vue:60` quick-note-header-wrap(原本会被加 z-decor 2,虽然不破坏视觉但不是 spec 意图)。Writing.vue:2 有 `.writing-page` 根 class,Experience.vue 没有,选择器天然 scope 准确。1 个 uiPolish 契约 regex 更新,新 selector。
- **Fix 2** (4200da8): 章节列表 focus ring 强化 1px → 2px。1px 是 WCAG 2.4.7 "highly visible" 最低标准,改 2px solid gold + 4px gold-tint 30% outer glow 双线 ring。章节选择 / Tab 键导航视觉反馈更强。3 个 rule 都改,1 个新 comment。test 不需要改(只 check animation: kickerPulse,不动 box-shadow)。
- **Fix 3** (0bf2f48): kickerPulse 关键帧改成可见。原文是 `text-decoration-color` 动画,但 `BookmarkButton.vue:106` 有 `text-decoration: none` → 动画技术跑但视觉无变化。改成 `box-shadow` 动画(4px/30% → 6px/50% outer gold-glow breath),对齐 Fix 2 的静态 2px+4px baseline,动画无缝。内圈 2px 不变(键盘 focus 稳定),外圈 glow 呼吸。1 个新 uiPolish 测试锁"keyframe animates box-shadow, not text-decoration-color"。

累计：3 修复 7 lines CSS + 1 new test,0 scope creep,do-not-touch 全保留。

验证：
- `npm run test:run` 通过(109 files / 775 tests,+0 regression)。
- 4-contract gate(70/70)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- 无 `Co-Authored-By` footer。

## 2026-06-11 - Welcome / Experience Pass 2 视觉与版式收口

状态：完成本轮收口

结果摘要：
- Pass 2 落地: WelcomeView 主图软过渡 (PosterStage `feGaussianBlur stdDeviation="3"` 串在现有 `feDisplacementMap` 后 + `.welcome-stage-haze::after` 色温 multiply + `.welcome-poster-stage::before` cream multiply)、7-tile A3 中密度 (3 → 7 tile per A3 mock 精确数值 + 4 件 prop: tape × 2 / fold × 1 / stain × 1)、`isolation: isolate` 救 01 按钮 980px (在 `.welcome-stage-poster` 上把 mix-blend-mode stacking context 隔离)、760px 隐藏全部 tile + prop (R7 mitigation)。
- Experience 综合修: `.stage-command` 980px 降级为 `skewX(-8deg)` (base + hover 同步) + `min-height: 50px`、Hero 标题 640px 改 `clamp(32px, 9vw, 46px)` 防溢出、`.playable-world-stage-poster` 980px 加 `max-height: 280px`、浮动层 (mechanism-notice / quick-notes-rail / game-image-gen-rail) 980px 统一 `bottom: calc(150px + env(safe-area-inset-bottom, 0px))`、`.mechanism-notice` z-index 改 `var(--z-mechanism-notice)` 替代硬编码 248。
- main.css 新加 4 个 z-index token (`--z-stage-decor: 2` / `--z-stage-hero: 5` / `--z-stage-cta: 6` / `--z-mechanism-notice: 248`) + `.is-archive-prop` utility 及 3 modifier (`--tape` / `--fold` / `--stain`)。
- Test: `welcomeView.test.js` 加 7-tile + 4-prop 存在性断言、`uiPolish.test.js` 加 isolation + 4 token + Experience mechanism-notice token 断言。
- Spec: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, commit `7f98157`, 8-subagent review)。验证截图见 `docs/demo/pass2-screenshots/` (6 张, 1280/980/760 × welcome/experience)。

## 2026-06-10 - Thread B runtime context continuity

状态：完成本轮收口

结果摘要：
- `src/services/api.js` 的普通模式 context 注入不再只依赖 legacy 的 `character / time / location / scene / activities`；当会话里只有 `goals`、`encounteredCharacters`、`factionRelations`、`keyChoices`、`plotJournal` 这类轻 runtime 状态时，也会生成系统上下文，并把这些字段完整写进背景信息。
- `src/services/worldbookContextBuilder.js` 的扫描文本开始消费阵营名和 `plotJournal` 的 `participants / locations / keyChoices / unresolvedHooks`，让 Stage 3a / 3b 写下来的剧情日志能更直接驱动世界书命中，而不是只吃 `summary`。
- 定向回归补到 `src/__tests__/contextMessage.test.js` 和 `src/__tests__/worldbookContextBuilder.test.js`，同时保留一条 `generationService` smoke，确保这轮 Thread B 只收口 runtime 主链，没有顺手碰 A 持有的 `WelcomeView / AppShell / gm-persona / QuestLog` UI 面。

验证：
- `npm run test:run -- src/__tests__/contextMessage.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/generationService.test.js` 通过（3 files, 12 tests）。
- `npm run test:run` 通过（87 files, 584 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-10 - Thread A Phase 1B 第三切片内层舞台重排

状态：进行中，已完成第三切片

结果摘要：
- `src/pages/Experience.vue` 从“页头统一了，但下方仍是旧聊天工具区”进一步改成两段式工作面：上半 `experience-stage-band` 负责世界摘要、开场卡和切口列表；下半 `game-layout` 负责聊天主区与右侧情报侧栏，主次关系比之前清楚一层。
- 这轮重心是减工具感而不是加装饰：右栏只保留“主线路径 / 当前切口 / 现场情报”三类信息，CTA 改成更整块的动作按钮，聊天区和输入区重新包进统一的 editorial shell。
- `src/views/WelcomeView.vue` 也同步收掉一批容易显得偶发的“今晚”表述，改成更通用的世界入口语气，避免入口文案被具体时态绑死。
- 契约测试同步更新：`uiPolish` 现在断言 `shell-mast / shell-drawer / activity-btn` 和 `experience-stage-band / game-main-shell / 当前切口`，不再盯旧的 `shell-flyout / compact` 结构。

验证：
- `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/gmPersonaLauncher.test.js` 通过（3 files, 10 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1B 第二切片 shared page hero

状态：进行中，已完成第二切片

结果摘要：
- 新增共享组件 `src/components/workbench/WorkbenchPageHero.vue`，把四个重工作面的页头收口成同一套 editorial shell：统一承载 back / inline selector / meta chips / actions，减少“每页一排工具按钮”的割裂感。
- `Experience`、`Writing`、`Notes`、`ProseEssay` 现已统一接入 shared hero；原先散在各页的 world select、book select、topic input、meta 状态和常用动作都被压进同一视觉语法。`Writing` 的 hero 切书同时补上真正的 `selectBook` 调用，不再只改选择框外观。
- 这轮顺手恢复了当前工作树里被删除但仍被引用的 `src/components/QuestLog.vue`，保留轻量活动记录，并把 latest `plotJournal` 的“本段冒险总结 + 写成我的版本 / 整理成分镜”出口重新接回侧栏，以维持现有 Stage 4 contract 与回归测试一致。
- 仍未触碰 `gameStore`、`worldbookContextBuilder` 或 generation 实现层；Thread A 下一步继续聚焦内层布局节奏、字级和左右分区辨识度，而不是再回到旧工具条堆按钮。

验证：
- `npm run test:run -- src/__tests__/questLog.test.js` 通过（1 file, 3 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread B Stage 4 MVP trigger 首轮

状态：完成首轮

结果摘要：
- 新增 `src/services/generationAdventureTriggers.js`，集中维护“写成我的版本 / 整理成分镜”两类 generation task：统一拼接世界书上下文、轻 runtime 状态、最新 `plotJournal` 总结，并负责解析正文草稿和结构化分镜草稿。
- `src/stores/gameStore.js` 补齐 Stage 4 runtime 行为：`adventureTriggers` draft state、单用户节流与 3 秒 cooldown、accept/dismiss、session persistence，以及“已保存则不再对同一段剧情重复开放按钮”的判定。
- `src/components/QuestLog.vue` 从“轻量冒险摘要”扩成 Stage 4 侧栏入口：显示最新 `plotJournal` 总结、地点/角色/关键选择标签、两个 trigger 按钮、生成中/失败/已保存态，以及正文/分镜预览采纳动作。
- 新增 `src/__tests__/generationAdventureTriggers.test.js`，并扩 `gameStoreSession` / `questLog` 回归，锁住 prompt 构造、解析、accept persistence 和 UI wiring。

验证：
- `npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/questLog.test.js src/__tests__/generationAdventureTriggers.test.js` 通过（3 files, 14 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread B Stage 3a + 最小 Stage 3b runtime skeleton

状态：完成首轮

结果摘要：
- `src/stores/gameStore.js` 补齐轻状态骨架：`goals`、`encounteredCharacters`、`factionRelations`、`keyChoices`、`plotJournal` 进入 runtime state、session persistence 和恢复链路。
- runtime 现在会从生成文本里做最小启发式提取，并在累计约 8 个 assistant turn 后自动写入一条压缩剧情日志，保留 `chapterId`、摘要、参与者、地点、关键选择、未决钩子和来源 message index。
- `src/services/worldbookContextBuilder.js` 开始消费这些轻状态辅助匹配世界书条目；`src/components/QuestLog.vue` 追加轻量冒险摘要，先露出“当前目标 / 最近选择 / 已遇角色”，不顺手扩成新壳层。
- 对应回归测试补到 `gameStoreSession`、`worldbookContextBuilder`、`contextMessage`、`questLog`，确保轻状态既能持久化，也能参与上下文构建和 UI 摘要。

验证：
- `npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/contextMessage.test.js src/__tests__/questLog.test.js` 通过（4 files, 15 tests）。
- `npm run test:run -- src/__tests__/generationService.test.js` 通过（1 file, 2 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（86 files, 574 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1B 首轮入口封面与 hidden-first chrome

状态：进行中，已完成第一切片

结果摘要：
- `AppShell` 改为 hidden-first chrome：桌面端左侧一级/二级导航不再常驻撑满布局，而是变成默认收起、悬停可展开、点击可固定的 flyout；移动端仍保留底部一级导航。
- `ActivityBar` 与 `SidePanel` 同步收成更克制的外壳，保留现有路由和模块结构，但减少“工具站式常驻边栏”的存在感。
- `WelcomeView` 补进角色化入口提示与“工作区退到第二层”的说明，继续沿用 `边境王国 · 雾潮暮湾` 作为默认世界入口，但不再只靠旧任务板式说明撑首屏。
- 这轮仍然没有碰 `gameStore`、`worldbookContextBuilder` 或 generation task layer；Phase 1B 还剩下一段：把 `Experience / Writing / Notes / ProseEssay` 的页面 chrome 再统一一轮。

验证：
- `npm run test:run` 通过（86 files, 574 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1A 共享角色入口壳层

状态：完成首轮

结果摘要：
- 新增共享组件 [src/components/gm-persona/GmPersonaLauncher.vue](../src/components/gm-persona/GmPersonaLauncher.vue)，把“先展开 persona bubble，再进入顾问面板”的入口语义收口成单一壳层。
- `Experience`、`Writing`、`Notes`、`ProseEssay` 四个重工作面都改为接同一套角色入口；顾问逻辑仍复用现有 `AdvisorPanel` / `useAdvisor`，没有顺手碰 runtime 状态或世界书上下文。
- 同步清掉四页已失效的 `.advisor-fab` 样式残留，并补 UI 契约测试，避免回退到旧浮动按钮实现。

验证：
- `npm run test:run` 通过（86 files, 573 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 方向文档与执行骨架重构

状态：完成首轮

结果摘要：
- 把 `character-driven-arc.md` 从“并行未决提案”升级为**已采纳方向文档**，明确产品外壳开始向角色化 AI GM 迁移。
- 把 `playable-worldbook-roadmap.md` 降级为**迁移期执行骨架**，专注保留 runtime / content / trigger 主链，不再独占最终产品定位。
- `PLAN.md`、`docs/README.md`、`docs/plan/README.md`、根 `README.md`、并行执行计划同步改口，统一成“方向已定，底层与 UI 双轨推进，旧壳层冻结”的模型。
- 并行计划改成三线程：UI shell、runtime skeleton、content/demo，并明确高冲突文件边界。

验证：
- `npm run test:run` 通过（85 files, 570 tests；含既有地图合同诊断、jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 入口链最后一屏承接感补齐

状态：完成首轮

结果摘要：
- `Experience.vue` 的首屏从旧“小说体验”语义继续收口为“世界冒险”，与 `WelcomeView -> WorldBookQuickImport` 的任务板叙事保持同一条线。
- 顶部世界摘要新增开场 route、任务/压力摘要；“今晚开场”卡新增现场三联卡、代价条和更完整的行动说明，让用户进入世界后立刻知道第一现场、第一阻力和第一出口。
- 这轮没有引入新数据模型，仍只复用稳定字段 `worldDescription`、`entries` 和 `buildPlayableWorldActionHooks()` 的结果，避免把 UI 打磨变成新一轮产品重构。

验证：
- `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js src/__tests__/worldBookQuickImport.test.js` 通过（3 files, 9 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（84 files, 568 tests；含地图/axe/canvas 既有 stderr warnings，但 exit code 为 0）。
- `npm run build` 通过。

## 2026-06-09 - 清理废弃 Home 首屏文件

状态：完成首轮

结果摘要：
- 删除未被路由和运行时代码引用的 `src/pages/Home.vue`，避免后续继续围绕错误首屏文件做 UI 改动。
- 把仍把 `Home.vue` 当作首屏实现或复用点的计划/规格文档改为 `WelcomeView` 当前事实，保留必要历史说明但去掉误导性指向。
- 当前在线首屏边界进一步收紧为 `WelcomeView -> WorldBookQuickImport -> Experience`。

验证：
- `npm run test:run` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - WelcomeView 首屏边界收口

状态：完成首轮

结果摘要：
- 根路由 `/` 的唯一首屏明确为 `src/views/WelcomeView.vue`，并通过 `AppShell` 的 `immersiveShell / hideActivityBar / hideSidePanel` 元信息保持沉浸式门面。
- 世界选择页 `src/pages/WorldBookQuickImport.vue` 和体验页 `src/pages/Experience.vue` 继续沿用“选择世界 -> 开始冒险 -> 写成作品”的主路径，不再把 `Home.vue` 视为在线入口的一部分。
- 对应 UI 契约测试同步改为断言 `WelcomeView`、真实路由和快速导入页，避免后续再围绕未挂路由的 `Home.vue` 做错误回归。

验证：
- `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js src/__tests__/worldBookQuickImport.test.js` 通过。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过。
- `npm run test:run` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 单旗舰世界入口与开场行动

状态：完成首轮，待进入 Stage 3a

结果摘要：
- 快速导入首屏继续收窄为单旗舰世界 `边境王国 · 雾潮暮湾`，并新增 3 个可点击开局行动：钟楼现场、码头夜账、证人雾军。
- 新增 `playableWorldEntry` 入口意图 helper，保存开局行动到本地 intent；预设导入、小说文本导入、说明驱动 AI 生成三条世界书入口保持不变。
- 体验页新增“今晚开场”行动卡；从旗舰入口进入时会优先创建新世界会话、自动走现有 GM 开场流程，并在第一轮输入前提供行动建议。
- Thread B 首批内容文档落地：
  - [content-review/border-kingdom-review.md](./content-review/border-kingdom-review.md)
  - [demo/border-kingdom-adventure.md](./demo/border-kingdom-adventure.md)
  - [content-review/border-kingdom-ui-reference.md](./content-review/border-kingdom-ui-reference.md)
  后续手测不需要抢改高冲突工程文件。

验证：
- `npm run test:run -- src/__tests__/playableWorldEntry.test.js src/__tests__/worldBookQuickImport.test.js src/__tests__/uiPolish.test.js` 通过（3 files, 11 tests）。
- `npm run test:run` 通过（84 files, 568 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 结构化设定工作台与并行计划

状态：完成首轮

结果摘要：
- 结构化设定页升级为工作台：新增字段级控件、dirty/saving/saved 状态、撤销/重做、键盘提示、底部保存状态栏和字段完成度。
- AI 设定生成支持字段级与分区级草稿，草稿可查看差异、采纳到字段、转为世界书条目，并补上生成状态、brief 输入和持久化预览。
- 新增字段控件与 a11y/交互测试，测试 setup 统一安装 Pinia，并补齐 `vitest-axe` / `axe-core` 依赖，避免 clean CI 缺包。
- Mem0 配置边界收紧：未配置 API key 时不视为可用，服务端代理不再把上游错误详情回显给浏览器。
- 地理面板和时间轴/机制入口完成一轮 UI 打磨。
- 新增 [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md)，下一轮不再继续堆种子世界数量，改为单旗舰世界入口 + 并行内容 review。

验证：
- clean archive + staged patch：`npm ci` 通过。
- clean archive + staged patch：`npm run test:run` 通过（83 files, 565 tests）。
- clean archive + staged patch：`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- clean archive + staged patch：`npm run build` 通过。
- clean archive + staged patch：`npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - README 与部署说明纠偏

状态：完成首轮

结果摘要：
- 根 `README.md` 改成当前 Pinax 主线叙事，不再用旧的 `WriterHelper / Text Game Framework` 标题和功能并列描述。
- `docs/user-manual/05-deployment.md` 明确指出 `deploy/` 下脚本和 nginx / PM2 配置只是模板，不能原样上线；同步修正路径、目录名和“模板已可直接照搬”的误导表述。
- `docs/user-manual/04-configuration.md` 和 `06-faq.md` 补上 localStorage 备份会包含 API key 的风险说明，并修正旧 issue 链接。

验证：
- 仅做轻量检查：`git diff --check`。
- 未跑全量测试；未做实现层改动。

## 2026-06-08 - 用户手册术语对齐

状态：完成首轮

结果摘要：
- `docs/user-manual/02-concepts.md` 把体验页相关描述改成“冒险或写作”共用语境，不再默认按旧写作流叙述。
- `docs/user-manual/06-faq.md` 把“世界书 → 高级设置”统一成当前导航里的“设定 → 高级设置”。
- `docs/user-manual/04-configuration.md` 把旧的“散文画布 / 诗歌工作坊”说法降成历史遗留键说明，避免误判为当前主功能。

验证：
- 本轮只做文档事实对齐，未跑全量测试；未做实现层改动。

## 2026-06-08 - 用户手册与 RFC 入口收口

状态：完成首轮

结果摘要：
- `docs/user-manual/README.md`、`01-quickstart.md`、`03-features.md` 改成当前产品语境，不再把旧的“五个预设世界 / 九大功能并列”当作首要叙事。
- 快速开始和功能说明现在对齐真实入口：先导入种子世界，再从体验页进入当前世界。
- `docs/src/rfcs/index.md` 明确标出“RFC 不是当前事实入口”，accepted RFC 只在需要设计背景时再看。
- 修正 `nations-perf-fix` 与 `perf-profiling` 两份 accepted RFC 的正文状态矛盾，不再写成“已批准，待实现”。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 文档分层补完

状态：完成首轮

结果摘要：
- 新增 `docs/superpowers/README.md`，把设计草案、执行计划和 agent 基础设施材料单独收口，不再把 `superpowers/` 当作无边界目录。
- `docs/plan/README.md` 继续区分“当前主线专题 / 活跃技术专题 / 参考计划 / 历史背景”，减少把 `playable-worldbook-roadmap.md` 误读成归档材料的概率。
- `docs/README.md` 的文档导航同步收窄，明确哪里看当前事实，哪里只在考古或基础设施维护时再看。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 文档入口收口

状态：完成首轮

结果摘要：
- 文档入口改成“先看主线、再看当前事实、按需看专题路线图”的结构，不再把整个 `docs/plan/` 一概视为历史材料。
- `README.md`、`PLAN.md`、`docs/src/index.md`、`docs/src/test-status.md`、`docs/src/known-issues.md` 收口为当前主线、当前风险和当前验证基线。
- 新增 `docs/plan/README.md`，明确 `playable-worldbook-roadmap.md` 是当前主线专题；`docs/src/code-map.md` 改成更偏查表的 owning surface。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 可玩的世界书 Phase 1

状态：完成首轮

结果摘要：
- 新增“可玩的世界书”路线图，明确当前主线是选择世界、开始冒险、沉淀剧情、写成作品；生视频降级为分镜完成后的后置出口。
- 首页和体验页入口文案收口为“进入世界”，体验页增加“选择世界 -> 开始冒险 -> 写成作品”的启动带。
- 无世界书时，体验页不再只提示选择世界书，而是引导进入快速导入并使用种子世界冷启动。
- 快速导入的一键预设升级为 3 个可直接玩的种子世界：边境王国、都市异闻、近未来殖民地，并展示开场困境和创作出口。

验证：
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 体验与设定导入修复

状态：完成首轮

结果摘要：
- Mem0 未配置时不再发起代理请求，服务端 Mem0 代理失败也不再把上游错误详情回显给浏览器；设置页 Mem0 key 保持密码输入。
- 体验页消息里的机制触发点现在可在关闭面板后再次点击，重新进入对话/回复机制。
- 小说段落导入改为 AI-first，多章节文本也会先走 AI 提炼，失败后才回退本地分段/提炼。
- 结构化设定页生成的草稿预览按世界书持久化，切换页面或重挂载后仍保留预览。

验证：
- `npm run test:run` 通过（81 files, 553 tests）。
- `npm run build` 通过。

## 2026-06-08 - 素材与工作区收口

状态：完成首轮

结果摘要：
- 素材页删除从归档改为永久删除；已导入画布的素材会同步清理节点、连线、时间轴和牌堆引用。
- 素材页左侧活动列表只显示待处理和已采纳素材；归档/拒绝素材仍保存在存储中，但不再停留在活动列表。
- 素材页勾选后统一显示批量导入、采纳、归档、删除；详情工具栏移除“待处理 / 采纳 / 归档”三联状态按钮。
- 快速导入预设升级为现代世界书结构，包含 `rule/style/forbidden` 常驻约束条目，并补齐世界描述、文风和禁写边界。
- 设定预设条目、页面切换动画、画布左侧详情/时间轴区分度完成一轮打磨。

验证：
- `npm run test:run` 通过（81 files, 558 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-05-28 - 分镜版本状态前置

状态：完成首轮

结果摘要：
- 时间轴头部前置分镜版本状态和主动作，用户可以直接生成、更新或下载当前分镜版本。
- 分镜版本指纹纳入关系线类型和标签，调整连线后会提示版本需重建。
- 剪辑包构建下沉到导出服务，并直接下载 ZIP；包内包含 manifest 和可拆分文件清单。

验证：
- `npm run test:run -- src/__tests__/integration.test.js src/__tests__/relationCanvas.test.js` 通过。
- `npm run build` 通过。

## 2026-05-27 - 素材 / 画布 / 分镜链路收口

状态：完成首轮

结果摘要：
- 素材页定位为内容中转层和资产真源；卡片画布只引用素材并附加关系、位置和镜头参数，不复制长正文。
- 原散文卡片页收口为通用卡片关系画布；诗歌独立页面退场，保留必要兼容层。
- 分镜导出服务带出素材 ID、上一镜关系和参考图轻量引用，支持 Markdown、Premiere CSV、剪映草稿和 FCP XML。
- 画布关系线、时间轴、节点详情和右上图例完成多轮减重，主路径集中到“素材 -> 关系画布 -> 分镜输出”。

验证：
- 多轮 `npm run verify` / `npm run build` 通过。
- 多轮 `src/__tests__/relationCanvas.test.js`、`integration.test.js`、`storyboardStore.test.js` 回归通过。

## 历史展开

更早或更细的过程性记录不再保留在主日志。需要实现背景时优先看：

- [PLAN.md](./PLAN.md)
- [src/code-map.md](./src/code-map.md)
- [src/known-issues.md](./src/known-issues.md)
- [plan/](./plan/)
- [superpowers/specs/](./superpowers/specs/)
## 2026-08-02 - 结构化设定生成链重构计划

状态：计划完成，待执行

结果摘要：
- 定位字段生成速度和首轮有效率问题的共同根因：普通文本生成依赖 XML 边界与正则抽取，单字段最多 28000 字符 / 2400 token / 90 秒并无分类全量重试，整节仍按字段串行重复上下文。
- 在主路线 G1.2.2 制定直接替换方案：专用结构化端点、服务端固定 schema registry、provider 结构化能力探测、原生 JSON Schema / 强制提交工具 / JSON object 的确定性选择链，以及不支持时的 typed error；不保留 XML 影子链。
- 计划将整节压缩为一次请求，保留有效字段并只对失败字段进行一次选择性修复；MiniMax M3 Responses 显式关闭 reasoning，M2.x 依据实际 schema/tool 能力决定是否可用。
- 明确上下文预算、缓存前缀、取消和 revision 防覆盖、错误决策表、隐私边界、S0-S7 文件范围与量化 Gate；测试总量继续保持 200。

验证：
- 本轮只修改计划与共享状态文档，未修改运行时代码，未启动或重启服务。

## 2026-08-02 - 结构化设定生成链 S4-S5 完成

状态：代码完成；S6-S7 待执行

- 整节生成保持单次 `setting-section.v1` 请求，逐字段校验结果；有效草稿保留，失败字段带明确错误，不再因为一个字段失败而丢弃整节。
- 对含有部分有效草稿的响应最多追加一次定向修复请求，只发送失败字段的稳定引用和压缩后的上下文；修复失败继续保留原字段错误，不扩散成整节失败。
- 将世界书 revision、分区、字段、补充要求、全局约束、结构化条目和资料摘要纳入操作级缓存键，缓存有界且只存在内存，不改变浏览器 worldbook owner，也不缓存 API Key 或模型思考。
- 调低文本字段的最低有效信息量阈值，允许“陆沉与沈砚互为旧识”这类简洁但完整的事实条目，同时继续拒绝单字、空响应、提示词回显和思考泄漏。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js`：13/13 通过。
- `npm run verify:full`：核心 188、视觉 12，总量 200；Vite/VitePress build 与 `git diff --check` 通过。
- 未启动或重启服务，未增加测试 item。

## 2026-08-02 - 结构化设定生成链 S6 完成

状态：代码完成；S7 真实渠道 Gate 待执行

- `/chat/test` 在原有文本/工具探测后，追加一次合成 `setting-field.v1` 请求，真实验证结构化 JSON Schema / forced-tool / JSON object 降级链；探测不会读取或保存用户世界书草稿。
- 连接结果返回结构化可用性、实际模式、协议、reasoning 状态、延迟和 typed error，避免用模型列表成功或普通文本成功冒充设定生成可用。
- 结构化分区生成状态增加请求模型、修复失败项、校验草稿和取消阶段；失败字段稳定记录，重试按钮只提交失败字段，已有成功草稿继续保留。
- 统一协议标识为 `openai-chat` / `openai-responses` / `anthropic`，避免连接探测与能力缓存出现同一协议多种名称。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js`：13/13 通过。
- `npm run build`：退出码 0；`git diff --check`：通过。
- 未启动或重启服务，未增加测试 item。

## 2026-08-02 - 结构化设定生成链 S7 代码第一切片

状态：代码侧完成；真实三渠道 Gate 待执行

- 草稿记录生成时的 worldbook revision；单字段生成返回前、整节生成返回前和草稿采纳前均做 revision 比对。生成期间发生新编辑时，旧结果不进入草稿；采纳过期草稿时给出明确提示，不覆盖新内容。
- `buildSettingGenerationMessages` / prompt preview 已改为展示 `setting-field.v1` JSON 协议，不再向用户展示 `<setting-content>` 输出要求；生产 structured adapter 从未依赖 XML。
- 保留 `extractSettingContent` 与历史 reasoning fixture 作为兼容测试边界；本地正文校验的 reasoning/prompt-echo 规则仍作为安全阀，而不是上游传输协议。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js`：13/13 通过。
- 真实 MiniMax/OpenAI-compatible/Anthropic-compatible Gate 尚未执行；未启动或重启服务，未增加测试 item。

## 2026-08-02 - 结构化设定生成 S7 Gate runner

状态：本地夹具 Gate 通过；真实三渠道 Gate 待执行

- 新增 `npm run smoke:structured-settings`，支持三份 provider 配置、单字段 10 次、整节 5 次、超时、脱敏 JSON 报告和 `--allow-incomplete`。
- `--dry-run` 覆盖 OpenAI Chat、OpenAI Responses/工具和 Anthropic-compatible 的结构化回传路径；dry-run 只产生 `fixtureReady`，不会误报 `releaseReady`，也不会因真实发布门禁未完成而失败退出。
- 报告仅保留 provider/model/protocol/mode、成功率、尝试次数、延迟、usage 汇总与错误码；API key、提示词和草稿均不进入报告。
- 直接执行 runner 时发现共享结构化契约缺少 `STRUCTURED_GENERATION_SCHEMA_VERSION` 导出，已补为字段契约版本别名，避免 Node ESM 运行时失败。

验证：dry-run 夹具与聚焦契约验证通过；真实渠道仍需使用本机保存配置执行，未启动或重启服务，未增加测试 item。

## 2026-08-02 - 结构化设定草稿局部意见修订 S8-A 至 S8-D

- 将部分认可/部分反对的反馈入口放在结构化设定的草稿审阅区，不在世界书条目管理页重复增加 AI 写入口。用户可以明确写下保留、删除、补充和禁止引入的事实。
- 新增 `setting-revision.v1` 与共享修订上下文：请求绑定一个 `section.field`，同时传入正式字段、当前草稿、用户意见和可选锁定事实；模型只能返回该字段的完整正文，禁止返回 patch、思考、解释或直接持久化。
- 结构化草稿现在保存有限版本链。AI 修订会截断当前版本之后的 redo 分支并追加完整新版本，手动编辑会更新当前版本并建立新的分支；审阅区支持上一版/下一版、差异查看和最终采纳。
- 修订请求现在会携带当前版本之前最多四个有限历史版本，总长度受契约限制；当前草稿和本次意见优先，历史版本只作为找回已写事实的参考，避免模型只凭当前一版重写而丢失早先内容。
- 修订使用草稿内容哈希与 worldbook revision 双重 stale guard；旧 localStorage 草稿恢复时自动补齐基础版本，取消、切换分区、丢弃草稿都会中止未完成请求。正式世界书只有用户点击采纳后才写入。

验证：定向结构化测试 13/13 与 `npm run build` 已通过；主题2 1440/390 审阅区 smoke 无横向溢出且控制台无错误；真实浏览器拦截请求 smoke 验证修订后显示 `2 / 2` 并可回退到初始版本；`npm run verify:full` 通过核心 188、视觉 12、Vite/VitePress build 和 diff check。未启动或重启服务，未增加测试 item。

## 2026-08-02 - 结构化修订旧后端兼容

- 复现确认：当前 3001 进程能接受 `setting-field.v1`，但尚未加载 S8 新增的 `setting-revision.v1`，因此返回 `STRUCTURED_GENERATION_SCHEMA_UNSUPPORTED`，根因是进程版本滞后而非 API Key 或模型拒绝。
- 修订服务现在只针对该明确错误做一次兼容回退：改用 `setting-field.v1`，将当前草稿作为字段修订基线、将用户修改意见写入兼容 `userBrief`；其他 schema、鉴权、上游网络和模型错误不会被吞掉。后端升级后仍优先走正式 `setting-revision.v1`。

验证：兼容回退场景已并入现有世界书生成测试，定向 13/13 与 Vite build 通过；未启动或重启服务，未增加测试 item。

## 2026-08-02 - 放宽结构化规则清单校验容量

- `world.rules` 与创作规则中的 `rule/forbidden` 清单原先复用 200 字总容量，模型生成多条具体规则时容易超过本地校验允许范围，导致可用草稿被误报为无效。
- 统一将清单字段容量提高到 800 字，仍保留思考泄漏、提示词回显、空内容和异常超长检查；服务端共享字段元数据与前端字段元数据保持一致。

验证：现有世界书生成测试内加入 5 条具体规则、超过旧上限的回归，定向 13/13 通过；完整验证待执行，未启动或重启服务。

## 2026-08-02 - 结构化路由旧进程诊断

- 直接请求当前运行的 `127.0.0.1:3001` 确认：`POST /api/config/worlds` 正常，但 `POST /api/generate/structured` 返回 `Cannot POST`；临时加载当前源码验证该路由存在并能返回结构化请求校验错误。
- 原因是后端进程在结构化路由加入前启动，属于进程版本滞后，不是 MiniMax 上游 404。前端对无 JSON 错误体的 404 增加明确的“请重启后端”提示。

## 2026-08-02 - 结构化设定长文本超时边界修复

- 复现“故事概念生成 `timeout of 47000ms exceeded`”：结构化字段前端固定请求 45000ms，Axios 只增加 2000ms 缓冲，服务端结构化契约和 provider adapter 也固定在 45000ms，因此长文本字段总会在 47 秒附近失败。
- 新增共享 `STRUCTURED_GENERATION_TIMEOUTS`：短字段保持 45000ms，textarea 长字段与整节包含 textarea 的请求使用 90000ms，客户端保留 2000ms 缓冲；共享请求契约、前端字段生成、服务端 runner 和 provider abort 使用同一上限，避免只延长单层造成假修复。
- 运行中的旧后端不会热加载新的服务端边界，需重启 3001 后端后长字段才能实际等待 90 秒；本轮未启动或重启服务。

验证：`agentContracts` 通过 1/1 test，完整验证通过核心 188、视觉 12、Vite/VitePress build 和 `git diff --check`；测试总量仍为 200，未启动或重启服务。

## 2026-08-02 - 结构化角色卡与体验导入

- 根因是 `character` 设定项一直映射为 `chips`，生成提示只要求人物名；主角字段没有可供体验页消费的身份、性格、目标和行为约束，分区批量生成时也容易在名字列表后被截断。
- `主角`、`重要配角`、`NPC` 现在使用紧凑角色卡文本，固定包含姓名、身份、性别、年龄、外貌、性格、背景、目标、关系、说话方式和开场状态；角色字段使用较小的单项输出预算，避免四个角色字段共用预算时互相挤占。
- 草稿审阅区新增“导入体验”：主角写入 `writingCharacter`，配角/NPC 写入 `encounteredCharacters`；角色姓名同时进入结构化世界书条目的关键词，生成后的对话可以按真实姓名命中。导入解析兼容标签文本和 JSON 角色卡。

验证：复用 `worldBookQuickImport` 既有测试项覆盖角色卡生成校验、批量修复和解析；定向 13/13 通过，未增加测试 item。

## 2026-08-02 - 结构化设定长字段预算修复

- 定位到地理环境单字段使用固定 `1000 tokens`，短的世界起源可以完成，地理/历史等 textarea 容易在 JSON 封闭前达到上游上限。
- 单字段 textarea 提高到 3600 tokens；整节按字段类型动态预算，最高 5600 tokens；失败字段定向修复提高到至少 1600 tokens。历史线和地理环境增加紧凑字段边界，避免模型重复上下文导致输出预算被吃完。
- 首轮响应被 `length`/`max_tokens` 截断时，在同一结构化模式下自动提高预算重试一次；仍保持单次操作最多两次上游请求，超出后返回明确截断错误。
- 统一识别 OpenAI `length/incomplete` 与 Anthropic/MiniMax `max_tokens`，避免同一类截断被显示成普通解析失败。

## 2026-08-02 - 结构化设定生成链 S0-S3 首轮实现

状态：代码完成；S4-S5 已在后续切片完成，S6-S7 待执行

- 新增共享 `setting-field.v1` / `setting-section.v1` 契约，前端结构化字段表改为消费共享定义，服务端拒绝未知分区、字段、schema 和超限上下文。
- 新增 `/api/generate/structured` 及 provider-neutral runner；OpenAI Chat/Responses、Anthropic-compatible 支持原生 JSON Schema，能力不足时按协议进入强制提交工具或 JSON object 模式，并缓存运行时能力结果。
- 单字段生成已切换到结构化端点，整节生产路径改成一次分区请求；输出不再通过 `<setting-content>` 主协议解析，拒绝、截断、空 payload、reasoning-only 和渠道不支持均不保存为草稿。
- 现有 `generateField` 注入路径仅为测试兼容保留；生产路径已切换到结构化分区请求。

验证：
- `npm run verify:contract -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js`：13/13 通过。
- `npm run build`：退出码 0；`git diff --check`：退出码 0。
- 未启动或重启服务；未增加测试 item。
## 2026-08-06 - 世界书地点地理绑定与历史语义修复

- 定位“小村固定发现地下城”：道路孤立的普通聚落此前统一进入 `isolatedSite`，该类型首个固定模板却是“遗迹开启”。现在普通孤立聚落只生成补给、信使、迁居和乡约类事件，只有明确遗迹/废墟条目进入 `ruinSite`。
- 删除世界书地点进入 `burgNames/riverNames` 的路径，地图 AI 仅负责大陆形态、气候、密度和命名风格；客户端会过滤模型擅自复制的作者地点名，并拒绝模型产生的地点坐标约束。只有用户确认过的世界书绑定可进入地图引擎约束。
- 世界书导入先匹配同名/别名真实对象，再按聚落层级、港口、沿河、海拔、生境、所属国家及地点关系评分现有对象。遗迹、洞穴和矿山只在明确地形条件下匹配 terrain cell；没有充分地理信息的地点留在“未绑定”，不再制造可见假点。
- 修复候选标记已存在但清单仍显示“未绑定”的状态重算错误；候选保存真实 `cellId/mapObjectId`，村、镇、城、港口、遗迹保留对应标记类型。
- 1200-cell 真实引擎审计：青禾村匹配现有低层级聚落，白帆港匹配 harbor 单元，断脊遗迹匹配高度 80 的山地单元，无名旧地保持未绑定。定向地图/历史 23 tests 通过，测试 item 总数未增加。
# 2026-08-09 - 世界书体验入口归属修复

- 设定页、世界书编辑页、世界书主页当前世界书和预设世界入口统一以 `worldbookId` 路由查询传递进入目标。
- 体验页收到有效目标后只恢复该世界书最近会话；无会话时创建该世界书的新空会话，避免当前会话来自其他世界书时覆盖用户入口。
- 会话选择页新增明确的「新会话世界书」选择，不再以旧会话作为新会话的隐式来源。
- 验证：定向 Vitest 34/34 与 `npm run build` 通过；未启动或重启服务。
# 2026-08-09 - 体验半自动续写与阅读排版 R2 启动

- 体验输入区新增仅限单人会话的「半自动」开关。开启后立即等待 0.3 秒自动承接，并在每拍完成后继续；输入接管、手动快捷动作、会话切换、再次点击停止或离开页面都会清理定时器，停止自动请求时只取消自动发起的请求。自动请求走独立 `auto` 叙事模式，只锚定最近 assistant 正文的最后一个动作、台词或现场变化；较早人物、物件和线索不得无触发回带，单拍预算缩到 460 tokens。联机继续由房主控制，不在成员端伪造自动行动。
- 空会话中的本地演示同样按既有事件序列推进，到末尾才停止；真实内容不改变会话数据结构、模型上下文或 worldbook。
- 叙事资料调度达到两轮证据预算后直接使用已取得的证据生成正文，不再额外请求一次 READY；调度超时、轮次或决策次数限制会降级为普通正文生成。普通“继续”与当前场景展开不再先请求资料调度模型，减少等待和无关检索。
- 参考 SillyTavern 的 continue nudge、近历史 Author's Note、示例消息和可选重复惩罚做法，Pinax 不把采样惩罚硬编码给所有渠道；改为加强靠近末轮的中文行文契约：每轮只引入一个影响现场的新细节，已出现的物件/感官/动作只在构成新因果时回收，禁止把材质、颜色、拟声堆成氛围清单，也不以无因果异象强行吊胃口。
- G1.4.10 R2 首批规则已进入主题2阅读面：纯叙述隐藏“旁白”署名，玩家只在回合组首显示身份，明确角色由 block speaker 署名；叙述首行缩进单独归 narration owner，玩家正文不再额外左移，动作使用正常体，心理保留轻斜体。
- 验证：`npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite 与 VitePress build、`git diff --check`）；未启动或重启服务。

# 2026-08-10 - 块级写作 Notebook 与边注审阅计划

- 完成 G1.6 方案调研与实施计划。产品形态确定为连续小说稿上的隐形 block、场景结构和右侧 `批注 / 改写 / 版本` 检查器；借鉴 Jupyter cell ID、Quarto margin、Cornell Notes、Scrivener Inspector、Notion/Word review 与写作类 AI 产品，但不引入 kernel、`.ipynb`、卡片墙或常驻代码式运行控件。
- 数据层确定使用单一 Tiptap/ProseMirror document 作为编辑真源，Markdown 仅作为素材、分镜、导出和旧链路的派生投影。批注使用 W3C 风格的 `blockId + TextPosition + TextQuote(exact/prefix/suffix)` 复合锚点，并明确 split/merge/move/delete/paste 的迁移与 orphan 规则。
- AI 改写只产生带 block/document revision、base hash、锁定片段和 sourceRefs 的 candidate；用户审阅后才通过单一 editor transaction 应用。章节审稿只产生可定位批注，不直接重写正文。
- 技术选型只采用 Tiptap/ProseMirror 开源核心与 UniqueID，Pinax 自行实现批注、候选和快照 sidecar，不依赖 Tiptap Cloud 或商业 Comments/Version History/Tracked Changes。计划拆为 WNB-0 至 WNB-5，先做真实长章、中文 IME、round-trip、许可证和性能 spike，再平替现有 textarea 链。

## WNB-0 数据层 spike

- 新增 `writingDocumentSchema`、6 组 Markdown fixture 和 `npm run spike:writing-notebook`。当前不改写作页，只验证结构化导入、块 ID 唯一、空白和混合 Markdown 往返、100k 中文章节测量，以及单块改写不影响邻块。
- 首轮发现并修复分隔线 token 在重建时额外增加换行的问题。最终 6/6 fixture 通过；100k 中文章节本机单次导入耗时 7.69ms。该数值是 Node spike 指标，浏览器 IME、选择和滚动性能仍属于下一步编辑器 spike。
- 阶段报告见 `docs/agent-runs/g1.6-wnb-0-spike.md`。数据契约先独立验证，默认 `Writing.vue` 编辑器没有被替换，避免在完成旧正文往返验证前扩大页面风险。
- 随后完成隔离 Vue spike：安装 Tiptap/ProseMirror 开源核心，新增 `WritingNotebookEditor.vue`，默认写作页通过 `?notebookSpike=1` 才启用。真实浏览器在桌面和手机视口均无挂载错误或横向溢出；输入会递增 document/block revision。默认编辑器仍保持不变，下一步进入 WNB-1 的数据真源接线。

## WNB-1 章节存储接线

- 新增 `useWritingDocument`。章节加载优先使用有效 `chapter.editorDocument`，旧章节从 Markdown 一次导入；保存同时写入结构化文档、schema version 2 和现有 Markdown 投影，未增加新的 localStorage key。
- 浏览器验证覆盖旧 textarea 与 Notebook spike 两条路径。修复修改段落后丢失块间空白的问题，确保标题、正文和分隔关系不会因为单块内容变化而粘连。默认 Notebook 入口仍未切换，下一刀迁移备份/纲要/素材/分镜读取边界。

## WNB-1 统一章节投影读取

- 新增 `getChapterDocument`、`getChapterMarkdown`、`getChapterPlainText`，统一判断结构化 sidecar 是否有效；缺失或损坏时安全回退旧 `chapter.content`，不覆盖原文。
- 章节分镜导出改为接收章节对象并优先读取结构化文档，旧的 `chapterContent` 参数仍可供外部调用。`writing-notebook-r0-spike` 增加结构化优先与旧章节回退门禁。
- 写作 Agent 请求增加当前块 `blockId`、`blockRevision` 和 Markdown 范围；如果 sidecar 尚未跟上正在编辑的 Markdown，则临时从当前正文解析块，避免旧章节投影污染补全上下文。
- 兼容 textarea 的 Markdown 回写新增 `mergeWritingDocumentFromMarkdown`，精确匹配优先、同位置同类型作为修改回退；未变块保持 ID，修改块递增 revision，新段落生成新 ID。
- 写作页章节加载改用 `readChapterSource()`，统一返回正文与格式；有效结构化章节直接使用 Markdown 投影，旧 HTML 仍通过原有兼容转换。
- Notebook spike 增加编辑器 API bridge：选区事件、焦点、插入文本、撤销/重做、选区读取和基础 mark；写作页分隔线、取名、顾问选区和基础格式操作在 spike 模式复用该 API，默认编辑器未切换。
- 验证：Notebook projection spike 通过；`npm run verify:full` 通过（39 个核心测试文件 / 306 个核心用例、12 个视觉用例，Vite/VitePress build 与 `git diff --check` 均通过）。

## 2026-08-10 - WNB-1 默认编辑面切换

- `Writing.vue` 的 `wysiwyg` 模式现在直接挂载 `WritingNotebookEditor`，移除旧的所见即所得 textarea 分支；Markdown 与预览仍作为次级视图，单一 Tiptap/ProseMirror 实例成为默认编辑真源。
- editor bridge 补齐选区的 ProseMirror 位置、块 ID/revision、选区恢复、水平分隔线、查找定位、单处/全部替换、清除 mark、右键菜单、输入事件和内联补全接线。顾问打开/关闭后能够回到原选区，外部顾问 transaction 通过 Markdown 投影回灌 Notebook。
- 修复 Notebook 选区回调错误：使用 `ResolvedPos.node(depth)` 读取块节点，避免首次输入时出现 `doc.node is not a function` 并中断 update 事件。分隔线改为真实 `horizontalRule` 节点，避免把分隔文本塞进正文造成多余换行。
- Notebook 正文宽度收敛到 `62em`，字号/字体/字重/斜体等沿用现有写作页控制项，不改变主题2整体纸面风格。

## 2026-08-10 - WNB-2 手工批注与检查器

- 新增 `src/services/writing/writingAnnotations.js`，批注不写入出版 Markdown，而是作为章节 sidecar 保存 `chapterId`、`blockId`、块 revision 和 `TextPositionSelector + TextQuoteSelector(exact/prefix/suffix)`。加载章节、Notebook 文档更新和保存前都会重定位批注；前文插入和块移动保持稳定 ID，段落拆分生成共享 `parentId` 子批注，合并重新绑定，块删除、引文消失或不唯一时统一标记 `orphaned`。
- `Writing.vue` 接入批注检查器：选中文字后可写入用户批注，点击条目可以回到原选区；支持 `open/resolved/orphaned` 状态、回复 thread、恢复、简洁/展开密度和“用当前选区重关联”。检查器提供 `批注 / 改写 / 版本` 三个稳定入口，后两者仍分别留给 WNB-3 candidate 和 WNB-5 snapshot，不提前伪造功能。
- 主题2桌面使用章节索引 / 连续稿 / 304px 检查器三栏；980px 以下检查器变为可关闭右侧 sheet；720px 以下变为 bottom sheet 且默认收起，正文优先可读。主题1未做视觉重设计。
- 浏览器 smoke 验证批注写入 `writing_books` 的章节 sidecar、跨段拆分迁移、回复 thread、键盘 Enter 回选正文和主题1隔离；主题2写作页 1440/980/390 审计共 3 captures、0 unexpected console errors。`npm run build` 和 `npm run spike:writing-notebook` 通过；本轮最终 `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未增加测试 item，未启动或重启服务。

## 2026-08-10 - WNB-3 块级 AI 候选第一切片

- 新增共享 `writingCandidateContract` 和写作候选检查器。`writing.fix.selection` / `writing.fix.paragraph` 现在可请求最多 3 个候选；服务端兼容旧的单 `replacement`，候选正文会经过本地拒答/空内容/重复过滤。
- 写作检查器的“改写”页接管候选审阅：用户看到当前目标、改写要求、原文/候选 diff 和候选理由，正文不因模型返回而变化。选中的正文片段可以锁定，采用前校验章节、文档、块 revision、目标原文和锁定片段；目标变化后候选标记 stale。
- Notebook 选区和块级采用都通过单次 ProseMirror transaction，提供撤销；Markdown 兼容路径继续复用已有 `writingAgentTransaction`。候选状态只在当前页面内保留，不写入出版 Markdown，版本快照留给 WNB-5。
- 候选契约 smoke 与 `npm run spike:writing-notebook` 通过；`npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`）。UI audit 已尝试但受限环境 Chromium 在 sandbox_host 启动阶段失败，未启动或重启服务，未增加测试 item。下一步补真实取消/重试和 provider 观察。

## 2026-08-10 - WNB-3 真实取消与重试

- `requestAdvisorTask` 现在接受可选 `AbortSignal` 并把它传给 Axios；取消统一为 `AGENT_REQUEST_ABORTED`，请求 trace 使用 `cancelled` 状态，避免把用户主动取消误计为 provider 失败。
- 写作检查器每次候选生成使用独立 `AbortController`。取消会真实中止当前请求、清理旧控制器和 loading；失败或取消后可以沿原目标重试，迟到响应不能恢复旧候选。
- 重试前重新验证 chapter/document/block revision 和目标原文；目标已被编辑或章节已切换时不重发，要求用户重新确定目标。保留锁定片段和用户改写意见，不增加正文自动写入路径。
- `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未增加测试 item，未启动或重启服务。真实 provider 多候选质量/延迟/空响应观察仍待可用渠道。

## 2026-08-10 - WNB-4 场景索引第一大阶段

- 复用现有 `scene-heading` 文档块构建主题2左侧场景索引；没有新增存储字段或迁移层。每个场景显示标题、块数量和未解决批注数量，正文没有场景标题时自动归入“开篇”。
- 点击场景会优先调用 Notebook 的 `blockId` 定位，Markdown 模式使用场景锚文本定位；移动端仍通过已有章节 sheet 打开，不改变主题1布局。
- 写作检查器新增“块 / 场景 / 全章”批注范围。场景范围只读取当前场景的 blockId 集合，未解决批注计数与索引共用同一批注状态，不复制第二套批注数据。
- `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未增加测试 item，未启动或重启服务。下一步是跨块批注与多块候选的逐块预览/原子提交。

## 2026-08-10 - WNB-4 跨块批注阶段

- 批注契约升为 v2。跨块批注保存起始/结束 blockId、两端 revision 和局部 TextQuote、完整选区文本以及连续涉及的 blockIds；单块批注仍使用原有 selector。
- 选区创建不再限制在单块内；Notebook 通过起止块范围回选，Markdown 通过两端 quote 回选。场景和全章过滤按 `range.blockIds` 聚合，不会因为批注起点在另一个块而漏掉。
- 编辑后按稳定 blockId 和两端 quote 重定位；块缺失、顺序非法或 quote 不唯一时标记 orphan，不静默挂到相似文本。跨块批注契约断言并入现有写作测试项，测试数量不增加。
- 定向 `writingSelectionCapture` 6/6、`npm run build` 和完整 `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未启动或重启服务。下一步是多块 AI 候选逐块 diff 和 stale 后整批原子提交。

## 2026-08-10 - WNB-4 多块 AI 候选与原子提交

- 写作候选契约升为 v2。跨块选区请求现在携带有序目标块清单；服务端 prompt 要求每个候选为每个目标块返回一条完整 `patch`，blockId 必须逐字匹配，不允许漏块、合并、拆分或新增目标块。
- 客户端对每个 patch 做本地正文校验，并按目标块补回稳定范围、编辑器范围、block revision 和 baseText。候选检查器逐块显示原文/候选 diff；跨块候选不能使用单块锁定片段，采用按钮明确显示为“整批采用”。
- 采用前统一校验 chapter/document revision、全部 blockId、block revision 和每块 baseText。Notebook 使用一个 ProseMirror transaction 逆序替换多个范围，Markdown 使用同一批 text-patch transaction；任一块 stale、缺失范围或重叠时整批拒绝，不产生部分写回。
- 定向契约冒烟、`writingSelectionCapture` 6/6、`npm run build` 和完整 `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未增加测试 item，未启动或重启服务。下一步是 provider 观察和多候选浏览器 smoke，版本快照仍留给 WNB-5。

## 2026-08-10 - WNB-4 章节审稿批注阶段

- 新增 `writingReviewContract`，章节审查只接受八类问题：重复、衔接、POV、角色连续性、时间、设定冲突、节奏和语言。finding 必须携带真实目标块、局部 offset 和逐字 exact；弱相似度和“更生动”类泛化建议在本地直接丢弃。
- Writing 检查器新增“章节审查”。正文按每批 6 个块发送，单批失败不会中止其他批次；成功结果生成 `review-finding` 批注，保留类型、严重度、批次和跨块范围。章节或正文 revision 在请求期间变化时，所有迟到 findings 整批丢弃。
- 审查批注可以定位原文并点击“进入改写”，随后复用 WNB-3 的单块/多块候选链；审查任务不返回 replacement，也不直接修改正文。
- 服务端新增章节审查 JSON 输出约束与 findings 归一化；定向契约 smoke、`npm run build` 和完整 `npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、`git diff --check`），未增加测试 item，未启动或重启服务。下一步是 provider 观察、多候选/审稿浏览器 smoke，版本快照仍留给 WNB-5。

## 2026-08-10 - WNB-5 版本快照第一大阶段

- 新增 `shared/writingSnapshotContract.js` 与 `writing_snapshots_v1` sidecar 存储。快照保存当前章节的结构化 `editorDocument`、Markdown 投影、批注、文档 revision、正文 hash 和字数；单章最多保留 20 个，并设置总存储预算，写入失败会在版本页明确反馈，不静默覆盖正文。
- 写作检查器的“版本”页已从占位改为可用工作流：可命名保存当前章节、按时间/修订浏览、删除和恢复。改写候选通过 stale 校验后会先留“改写前”检查点；恢复前会自动留“恢复前”检查点，并在当前正文已变化时要求确认。恢复只替换当前章节结构化文档、Markdown 投影和批注，不影响其他章节。
- 新快照 key 已加入 Pinax 全量备份；章节删除会清理该章节快照。快照契约断言并入既有写作测试项，保持 39 个核心测试文件 / 306 个用例与 12 个视觉用例的数量不增加。定向写作测试、完整 `npm run verify:full` 和 `git diff --check` 已通过，未启动或重启服务。

## 2026-08-10 - WNB-5 块历史与崩溃恢复第二大阶段

- 新增 `shared/writingBlockHistoryContract.js` 与 `writing_block_history_v1`。每次正文成功保存时，按稳定 `blockId` 对比前一份结构化文档，只记录发生变化且仍存在的块的旧文本、前后 document/block revision 和来源；每章最多 120 条，总量受存储预算限制。
- 版本检查器增加“块历史”。仍存在的块可在 Notebook 中通过单块 transaction 恢复；恢复前自动保存整章“块恢复前”检查点，块被删除或当前为 Markdown 编辑面时不会伪造成功。
- 新增 `writing_recovery_drafts_v1`。编辑变化后延迟写入每章一份恢复草稿，章节写入成功才清理；刷新或崩溃后会在版本页提示恢复，恢复失败不会清掉草稿。快照、块历史和恢复草稿均纳入 Pinax backup，删除章节/书籍同步清理。
- 定向写作测试 6/6、完整 `npm run verify:full` 与 Vite/VitePress build 已通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、`git diff --check`），未启动或重启服务。
## 2026-08-11 - G4.6.13 R5 叙事工具修复、截止与证据门禁

- 体验叙事主链继续使用同一临时 transcript。provider 空响应、坏工具调用和非法参数不再静默转普通正文：在同一 requestId 下最多发起一次指数退避重试，并追加一次带错误码的修复指令；再次失败直接保留 typed error。
- 工具执行增加独立 AbortController，与总生成 signal 联动。工具超时会中止传入 registry 的执行 signal 后再回传 `NARRATIVE_TOOL_TIMEOUT`；空结果转为 `NARRATIVE_TOOL_EMPTY_RESULT`，查询中 resource revision 改变转为 `NARRATIVE_TOOL_RESULT_STALE`，这些结果均以 `isError=true` 进入 transcript。
- 新增确定性的 `narrativeAgentPolicy`：历史/时间追溯、路线空间关系、世界规则/既有设定核验和明确事实调查进入 `required` grounding；轻动作与当前对话保持 `optional`。required 本轮没有可用条目证据时阻止正文提交。
- 工具调用按规范化名称、参数和资源 revision 计数，第三次相同调用形成 `NARRATIVE_AGENT_DOOM_LOOP` 并停止继续烧 token。401/403 在 provider adapter 中归类为配置错误，不参与重试；408/429/5xx/network 只在 deadline 内退避重试一次。
- 验证：叙事契约新增 R5 修复、grounding、空证据和 doom-loop 断言，定向 `agentContracts` + `gameStoreSession` 共 23 个用例通过。全量 `verify:full` 待本阶段收口后执行；未启动或重启服务。
## 2026-08-11 - G4.6.13 R6 检索质量与证据约束

- Kernel 根据当前输入动态开放资料域：普通当前动作只提供 world/geo，明确历史追溯才开放 history，明确记忆回溯才开放 memory，减少无关 schema 与误检索。
- 叙事工具加入带 `revision + domain + sortKey + itemId` 的 opaque cursor。排序优先稳定 ID/名称/别名与结构化匹配，再按 token、当前地点、更新时间和稳定 ID 收口；旧 revision 或错误资料域的 cursor 返回 typed stale/mismatch error。
- related/trace/route 结果携带 relation path、edge type、depth 和 sourceRefs；资源结果统一增加 `trust`、`conflictState`、`conflictRefs`、`eligibleEvidence`。active-conflict/stale/draft 结果仍可作为检索提示，但不会满足 required grounding。
- finalization 前新增 `validateNarrativeEvidence()`，输出关联 sourceRefs、正文命中的可信条目和冲突警告；工具缓存和资源 revision 指纹覆盖条目关系、历史地点、冲突状态和记忆状态，变化后不复用旧结果。
- 验证：`agentContracts`、`gameStoreSession`、`onlineRoom` 共 24 个用例通过；未启动或重启服务。R7 的标准 SSE、联机审计和真实 provider Gate 尚未开始。

## 2026-08-11 - G4.6.13 R7 流事件、联机状态与生产审计

- 新增 `shared/narrativeAgentStreamContract.js`，把单步 Agent 输出规范化为 `step.start`、`tool.input.delta`、`tool.call`、`text.delta`、`step.finish`、`usage`、`error` 七类 SSE 事件。服务端 `/api/generate/agent-step/stream` 只发送标准化事件，不透传 provider 原始 chunk；工具输入事件仅供浏览器内部重组，仍由浏览器执行只读资料工具。
- `src/services/api.js` 新增 SSE reader、事件解析和响应归约；体验生成默认走事件流后重组为现有 provider-neutral response，单 transcript、repair、grounding 和终态提交逻辑保持同一 owner。新增协议字段没有进入 UI 正文。
- ContextLedger 增加 agent 审计摘要：transcript revision、step count、tool call/result refs、repair count、grounding policy、terminal mode 和 fallback reason。production metrics 增加 protocol、capabilitySource、toolRepairCount、reasoningRoundTrip、terminalMode、groundingPolicy、orphanedCallCount 和 transcriptRevision，opaque reasoning metadata 不落盘。
- 联机状态允许请求当前步骤、收束、重试、修复和资料刷新阶段；房主继续唯一维护 transcript、调用工具和最终正文，成员只收到带 requestId/seq 的状态与完成事件。体验输入位增加停止生成，错误状态增加重试。
- 验证：`agentContracts`、`gameStoreSession`、`onlineRoom` 共 24/24；`npm run verify:full` 通过（39 个核心测试文件 / 306 个用例、12 个视觉用例、Vite/VitePress build、VitePress build、`git diff --check`）。未启动或重启服务。R8 仍负责真实 provider 矩阵、取消/超时/限流 Gate 和发布收口。

## 2026-08-11 - G4.6.13 R8-A Gate runner 与协议自检

- 生产叙事 smoke 从旧 `/api/generate/agent-turn` 切到 `/api/generate/agent-step/stream`；受控 rate-limit/timeout 不再伪造 JSON HTTP 失败，而是返回标准化 `error` SSE，验证当前前端 reader 的 typed error 路径。
- 双浏览器联机 smoke 现在要求房主至少发出一个 normalized agent step stream 请求，成员仍必须零模型请求；报告记录 `streamRequests`，不把旧 endpoint 命中当作成功证据。
- 新增 `npm run smoke:narrative-stream`，用本地 handler runner 覆盖 tool-call 事件序列、tool input 重组、final text 和 typed provider error；不需要 provider key，不会把本地协议自检误称为真实渠道 Gate。
- 验证：`npm run smoke:narrative-stream`、`npm run smoke:narrative-production -- --dry-run --count 60`、`npm run smoke:online-narrative -- --dry-run`、`npm run eval:narrative-context` 均通过；真实三渠道 60 轮矩阵与 R8 发布门槛仍待可用配置。

## 2026-08-11 - G4.6.13 R8-B 真实渠道矩阵执行器

- 新增 `scripts/narrative-provider-matrix.mjs` 和 `npm run smoke:narrative-matrix`。执行器固定发现 OpenAI Chat、OpenAI Responses、Anthropic Messages、MiniMax Anthropic-compatible 四个渠道；每个已配置渠道独立运行生产 smoke，输出渠道目录和汇总 `matrix.json`。
- 未配置渠道保持 `not-configured`，不发起伪造请求；即使使用 `--allow-incomplete`，`releaseReady` 仍为 false。矩阵默认每渠道 60 轮，配置文件只读取 `provider/baseUrl/apiKey/model`，不把密钥写入产物。
- 修复生产指标模块的显式 `.js` 导入，使 Node CLI 不再依赖 Vite 的无扩展名模块解析。
- 验证：`node --check scripts/narrative-provider-matrix.mjs`、dry-run 矩阵和不存在配置目录的 60 轮不完整矩阵均通过；真实 provider、人工质量标注和发布 Gate 仍待执行，未启动或重启服务。

## 2026-08-11 - G4.6.13 R8-C 生产叙事链清理

- 体验叙事 Agent 现在只通过 `/api/generate/agent-step/stream` 访问 provider；移除旧 `/agent-turn` Express 路由、`sendNarrativeAgentTurn` JSON API、generation service 的分支 fallback 和遗留的资料调度 loop。
- 删除旧 READY decision prompt 与 `buildNarrativeFinalMessages` clean-prompt builder。模型返回最终正文后，编排器在同一 transcript 做证据校验并直接提交，不再追加独立收束请求，也不再把失败静默改成普通叙事请求。
- `/api/chat/stream` 未受影响，继续服务写作、顾问和其他非叙事 Agent 任务；生产/联机 smoke 已只观察 normalized step stream。
- 验证：Agent 契约 1/1、Node 语法检查、`git diff --check` 通过；完整 `verify:full` 待本轮文档收口后执行，未启动或重启服务。

## 2026-08-11 - G4.6.13 R8-D 发布闸门执行器

- 新增 `scripts/narrative-release-gate.mjs` 和 `npm run gate:narrative-release`。它读取 R8-B 的 `matrix.json` 及各渠道 `metrics.json`/`annotations.json`，把样本、协议、终态非空、工具轮次、repair、required grounding、transcript 对齐、失败清理、证据命中、无依据事实下降、no-tool p95 和 orphaned calls 展开为逐项 gate。
- 人工标注字段固定为 `repairRequired/repairSucceeded`、`evidenceHit`、`unsupportedFacts/baselineUnsupportedFacts`；标注缺失显示明确 `reason`，不按空值或默认值放行。`--allow-incomplete` 只影响进程退出码，不改变 `releaseReady`。
- 指标归一化补回脱敏的 `timing.outputChars` 与 `estimatedOutputTokens`，release gate 可真实判断终态正文非空率。
- 验证：无 provider 矩阵运行 release gate 正确输出四个渠道未配置和阻断原因；Agent 契约测试、Node 检查、diff 检查通过，未启动或重启服务。真实 60 轮矩阵和人工质量标注仍待执行。

## 2026-08-11 - G4.6.13 R8-E 取消与迟到结果恢复 smoke

- 新增 `scripts/narrative-recovery-smoke.mjs` 和 `npm run smoke:narrative-recovery`，直接运行标准 SSE handler 的三类无 provider 场景：response abort、provider 迟到结果、typed error。
- 响应关闭后 provider 真实收到 AbortSignal；连接销毁后迟到结果不会写入终态 `text.delta` 或 `step.finish`；typed error 仍保留标准错误码、retryable 和结束信号。
- 验证：`responseAbort`、`lateResultDiscarded`、`typedErrorVisible` 全部为 true；`agentContracts`、`onlineRoom` 定向测试和 diff check 通过，未启动或重启服务。真实 provider 取消和 host loss 仍待执行。

## 2026-08-11 - 写作批注 text-model 空响应修复

- 确认“按批注改写”复用 Advisor task 上下文和结果协议，实际 provider 为当前配置的直连 `text-model`，不依赖 OpenClaw。
- 重写直连 provider 响应解析，覆盖 OpenAI、Anthropic 和 MiniMax 兼容字段及 Responses 式嵌套输出；推理块只用于错误诊断，不会进入候选正文。
- 将空响应、推理独占、输出截断和上游拒绝分开编码；前三类限定修复一次，第二次降低 temperature 并要求只返回完整 JSON。三候选改写预算由固定 1200 提高到 3000 token，修复请求上限 3600。
- 真实 DeepSeek V4 Flash 日志确认默认 thinking 消耗了输出预算并以 `finish_reason=length` 截断。Advisor 约束 JSON 任务现在显式发送 `thinking.type=disabled` 和 `response_format=json_object`；`/advisor/task` 的 Axios 上限由全局 30 秒独立调整为 80 秒，覆盖服务端首轮 45 秒与修复轮 30 秒，用户取消 signal 保持有效。
- 补上候选质量门禁：提示词明确禁止原样复制和候选重复；共享候选契约丢弃与原文逐字相同的单块方案及全部 patch 均无变化的跨块方案。首轮所有候选均无变化时，`/advisor/task` 在同一请求内自动进行一次语义修复；第二次仍无变化才返回 `AGENT_CANDIDATES_UNCHANGED`。
- 回归断言合并进现有 `agentContracts` 用例，不单独增加测试 item。`npm run verify:full` 通过：40 个核心测试文件 / 313 个用例、12 个视觉用例、Vite/VitePress build 和 `git diff --check` 全部通过；未启动或重启服务。

## 2026-08-11 - 写作空行命令与续写采纳修复

- 空行 `Space` / `/` 菜单改为 Teleport 到 body 的 caret 定位浮层，使用 viewport 坐标与全局缩放补偿，始终从光标下方展开；打开时保存 ProseMirror 选区锚点，只有真实选区移动才关闭。菜单内部自行滚动活动项，方向键不再通过整页 `scrollIntoView` 引发消失。
- 命令菜单进一步收敛为固定单列：一级仅显示 AI 续写、修改上一段、审查本章和插入结构；修改与结构各自通过右侧级联面板显示三项二级菜单，一级不会被替换，当前父项保持高亮。删除字母快捷键、Home/End 和一级双列布局，上下选择、右键展开、左键收起，只有可展开项显示右箭头。主题2 真实页面验证两个面板同时可见且相邻无覆盖，菜单无快捷键残留。
- `WritingInlineCompletion` 增加实际候选正文预览。模型返回的粗体、斜体、引用、标题、列表、链接、删除线和代码包装会在候选归一化阶段降为纯正文，不把 Markdown 控制符写进小说正文。
- Notebook 采纳改为 ProseMirror 单事务纯文本插入，使用编辑器原生 history 撤销；旧 textarea 路径继续保留原字符串事务。浏览器 smoke 验证菜单位于空行下方、连续 12 次方向键仍可见、`**续写**` 采纳后不显示裸标记且原有粗体 mark 保持。
- 第二轮排查确认旧错误链已经可能把 `**`、`*`、反引号等作为普通文本写入结构化节点。载入投影新增保守恢复：仅处理无既有 mark、无原始 Markdown 保真信息且存在成对控制符的节点；普通单星号文本保持不变。普通 `>` 引用新增独立 `quote` 类型，不再降成普通段落或被误写成“作者注”。
- 续写候选不再使用右下角浮动状态卡。新增 ProseMirror widget decoration，把候选、生成中和失败状态绑定到请求时 caret；候选保持无框弱化文字，支持点击/Tab 全部采纳、Ctrl/Command+右方向键采纳一句、Esc 忽略。Notebook 路径在采纳前后都不会重新出现右下角“已写入正文”浮条。
- 修复 Notebook 当前视觉行在长文档中的累计漂移。根因是 `coordsAtPos()` / `getBoundingClientRect()` 已返回缩放后的视觉坐标，而绝对定位元素仍处在 `body.zoom` 的 CSS 坐标系中，旧实现造成二次缩放。新增纯 geometry helper 同时换算 top、left、width、caret height 与 line height；0.85 缩放第 80 段从 `-490.9px` 收敛为 `-5.1px`，1.0 缩放为 `-6.4px` 的正常垂直居中。
- 完整 `npm run verify:full` 通过：40 个核心测试文件 / 332 个用例、12 个视觉用例、Vite/VitePress build 和 `git diff --check` 全部通过；未启动或重启服务。
