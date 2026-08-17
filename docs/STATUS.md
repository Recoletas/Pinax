# Status

<!-- 多 session 共享短期状态；长期历史见 docs/LOG.md，完整路线见 docs/PLAN.md。 -->

## 当前安排

| Owner/session | Worktree | Branch | Scope |
|---|---|---|---|
| Codex | `/home/recoletas/jiuguan/text-game-framework` | `integration/online-agents-canvas-video-f` | 叙事运行时收口计划 P0-P5 代码已完成（分阶段 trace、BeatPlan 独立预算、世界书 activatedLore、软区间无硬补、语义分段）；设定工作区 U1-U7 代码侧已完成：来源检索/候选批次、结构化生成状态、source archive 容量/全局复用/安全清理、解析与基础生成取消、真实 UI stale/cancel 审计；剩真实渠道 3×3、真实 API 下 revision stale/取消、20MB PDF 设备性能与 quota 真实设备验收 |

## 当前事实

- **产品主线**：`设定/地图/历史 -> 体验推演 -> 素材/写作 -> 插画/漫画 -> 画布/视频`。`docs/PLAN.md` 与 `docs/plan/pinax-integrated-product-roadmap.md` 是产品计划真源；专项计划必须从属于既有 G 编号。
- **结构化设定**：G1.2.2 S0-S8 代码链已完成，具备结构化协议探测、分区生成、失败字段修复、revision 防旧写、局部意见修订和世界书维护工作台。剩余门禁是 MiniMax、OpenAI-compatible、Anthropic-compatible 三类真实渠道及隐私/性能审计。
- **设定工作区体验**：已完成现状代码与 1440/390 浏览器审计，并重构 `settings-import-and-review-ux-plan-20260817.md`。当前按 U0-U7 建立“世界书首页 -> 可恢复创建工作区 -> 详细设定”三层流程：预设幂等直达体验，JSON 确定性导入，多文件文字抽取进入 IndexedDB source archive，先生成基础基调，再按分区渐进提炼；创建工作区已有统一生成状态机和部分失败恢复，首轮只做文件/chunk 精确去重与同名提示，不做语义自动合并、OCR 或向量库。世界书首页已重构为“当前世界主卡 + 世界书选择 + 创建工具 + 预设索引”，结构化设定已改为分区索引栏与内容编辑稿面，并在桌面合并共享 `SettingsContextBar` 与设定导航；一级导航收为“设定 / 地图 / 条目”，首页路由复用“设定”入口，不再重复占用一个 tab。高级世界书页旧“新建 / 导入”分区、持久化草稿状态、重复 AI 入口和死 CSS 已删除，创建职责统一归属独立工作区；条目管理收敛为检索栏、批量操作、条目列表与编辑面四层工作区；有审核草稿时桌面右侧固定，760-1100px 使用右侧覆盖层，759px 以下使用避开应用顶栏的全屏审阅页，关闭只收起并恢复触发控件焦点/滚动，不丢弃草稿。
- **设定工作区**：U1-U7 代码侧已完成。创建工作区支持可恢复的 TXT/MD/PDF/DOCX 多文件来源、JSON 结构化预览、基础基调与分区渐进提炼；source archive 具备 64MB 容量预检、正文/chunk hash 复用、来源定位与安全清理；解析和生成支持取消、部分失败、quota 降级、stale/aborted 状态，候选审阅保留证据且不自动合并。高级页重复结构化标签已删除，窄屏/200% 布局已修正；首页、创建、结构化和高级四条路由在 1440/1024/390px 共 36 captures，0 console error、0 a11y failure。剩余仅是真实 provider 3×3、真实 API 下 revision stale/取消、真实 quota 以及 20MB PDF 设备性能验收。
- **设定审阅队列**：结构化分区一次生成多字段时，所有成功草稿现在会在同一审阅区上方列出可切换的轻量待审队列；不再只展示第一份草稿而让其余草稿停留在不可操作状态。保留单一 `SettingDraftReview` 审阅面，不新增抽屉或第二套采纳链。
- **来源链路补充**：正式世界书加载会保留归档 refs 并惰性迁移旧资料；批量归档与单文件入口共用 hash 复用、容量预检和逻辑来源 refs；结构化生成前恢复完整 archive chunks，跨来源重复片段只进入上下文一次；粘贴片段 quota 失败降级为本页暂存。
- **来源解析取消补充**：parse-timeout 会 abort 底层 TXT/PDF/DOCX 解析信号，PDF loading task 进行 best-effort destroy；现有来源合同测试已覆盖超时后信号确实进入 aborted。
- **体验叙事 Agent**：G4.6.13、酒馆能力对齐、连续性 C0-C7、故事质量 Q1-Q4、内容完整性 P0-P6 与 2026-08-14 运行时收口 P0-P5 已接入。运行时：trace 分 plan/evidence/write/completion 四阶段记录；BeatPlan 控制步骤不再占资料轮次，资料预算（1 正常+1 恢复）耗尽后 typed 消息 + toolChoice none 强制完成；超时按阶段分配（计划 35s / 正文 60s / 补全 45s / 整轮 100s）；geo 按地点条件暴露。世界书：生产 NarrativeKernel 通过 `activatedLore` 确定性接入现有 matcher（常驻/绑定/关键词/starter/预算），新会话少量 starter 或世界概述回退。正文：长度改软区间（open 750-1200 / respond 600-950 / advance 600-950 / extend 350-650），删除按字符下限补全，BeatPlan 需最小因果内容，行文契约收敛五条 + 四种场景模式。剩真实渠道 3×3 验收。
- **体验阅读**：G1.4 M1-M4、排版 R0-R2 与第三阶段 marker/speaker/对白样式切片已完成。parser 恢复语义自然段：短块（≤260 字且 ≤4 句）不拆、异常长块按 2-3 句/90-180 字分组、相邻短未署名 narration 合并、引号内不拆；桌面（≥1101px）narration 段距 0.58em→0.42em。旧消息检测到 leaked marker 时重解析，正常旧消息不批量迁移。
- **写作 Notebook**：当前最高优先级为 WNB-6A。现有 schema v2 将每个顶层段落当作业务 block，Enter 因而直接创建新块；目标改为 `段落节点 -> writingUnit -> scene` 三层，Enter 只新建单元内段落，单元通过场景/分隔线、体验回合导入或显式 split 创建。一次成功的体验 assistant 回合默认导入为一个带完整来源的单元，但可拆分/合并且来源不丢。实施顺序是 schema v3、一次转换、批注/候选/版本改用 `unitId + nodeId`、体验导入事务和 UI/Gate；之后再继续常用 Markdown、`targets[]` 和查找同类。
- **地理、历史与地图**：PlaceEntity、地点逐项审阅、地理到历史草案、冒险运行时和因果回滚已贯通；G2.4 M0-M5 与 M7 首切片完成。下一步是父子区域/相邻关系求解、remap 评分、LOD/标签碰撞，以及真实世界书刷新回滚 smoke。
- **素材与多模态**：素材来源可追溯到体验、写作、分镜和视频任务；插画支持内置 MiniMax，漫画 M2-M6 已形成视觉圣经、阶段产物、文字排版和出版导出，画布已接视频生成。剩余漫画 M7 连续性质检、真实图像/视频 smoke 和跨资产 revision/tag 收口。
- **联机**：URL 房间、房主唯一生成、有序事件和受限运行时广播已接入。仍需双浏览器覆盖掉线、host loss、分支切换和房主 AI 配置共享边界。
- **UI**：当前版本全局锁定主题2亮色，外观、明暗和缩放切换入口已移除；主题1代码只保留兼容。U5-R C0-C5 已完成代码切片：顶部、drawer、体验上下文、composer 和角色选择器已收敛。C6 核心契约与体验页桌面/移动端 audit 已通过；角色选择器仍需真实设备人工复验。
- **设定页 U6 补充**：结构化设定字段已进一步收为连续稿面，去掉字段完整外框和输入框底色，改用稿面分隔线、少量信号色条和下划线输入；分区 AI 主动作降为轻量信号线按钮，字段保存/错误状态不再使用胶囊容器。桌面、平板和 390px 审计保持 0 console error、0 a11y failure。
- **设定页旧链清理补充**：高级世界书页不再挂载重复的结构化设定工作台，只保留基础设定、导入导出、分组和条目管理；200% 有效视口下高级页改为单列，条目导航与按钮允许换行，避免正文输入区被压缩或裁切。高级页已纳入 UI audit。
- **设定页上下文补充**：结构化设定使用共享 `SettingsContextBar`，一级导航只保留“设定 / 地图 / 条目”；来源展示兼容 `contentPreview / preview / content` 三种正式资料预览字段，字数仍优先使用归档完整长度。
- **验证基线**：20 个测试文件 / 200 个用例；Vite/VitePress build 与 diff check 通过。历史 188/200 是旧基线，不再作为当前上限。

## Recently done

- 2026-08-18：补齐结构化设定多字段审阅链：分区生成留下多份草稿时，`StructuredSettingsPanel` 在唯一 `SettingDraftReview` 上方提供轻量待审队列，可切换每个字段草稿，不再只显示第一份。增加合并后的 UI 合同覆盖；结构化页 18 captures、0 console error、0 a11y failure；完整验证为 20 个测试文件 / 200 个用例、Vite/VitePress build、VitePress build 与 diff check 通过。
- 2026-08-18：补齐设定审阅区的平板/移动交互：新增保留草稿关闭、Esc、背景滚动锁定和焦点/滚动恢复；1024/390px partial 审计 2 captures、0 console error、0 a11y failure，测试上限仍为 200。
- 2026-08-18：完成高级世界书页上下文收口：改用共享 `SettingsContextBar` 与三项一级导航，移除旧顶部标题/搜索/左侧世界书列表；移动端将新建世界书收为带标签的图标动作。高级页 1440/390px regular 审计 2 captures、0 console error、0 a11y failure。
- 2026-08-17：补齐设定页 U6 视觉收口：结构化设定字段从蓝框卡片改为连续稿面，输入区改为底线层级，状态改为边线文字，分区 AI 动作移除大面积实色底；保留草稿审阅、失败重试和移动端布局。结构化页 1440/1024/390px 的 regular/partial/loading/error/stale/cancelled 共 18 captures，0 console error、0 a11y failure；完整 200 tests、Vite/VitePress build、diff check 通过。
- 2026-08-17：完成设定页旧链与窄屏补漏：删除高级世界书页重复的 `StructuredSettingsWorkspace` 挂载和标签，避免与独立结构化路由并存；高级页在 1080px 以下单列、640px 以下世界书列表和编辑标签换行。新增高级页 UI audit，设定创建/结构化/高级三路由在 1440/1024/390px 的状态矩阵共 33 captures，0 console error、0 a11y failure。
- 2026-08-17：继续补齐设定来源链路：加载旧世界书时保留 `archiveRef/chunkIds/contentHash` 并惰性迁移未归档资料；批量归档与单文件入口统一 hash 复用和容量预检，复用来源补齐逻辑 `sourceRefs`；结构化字段生成会按 archive refs 恢复完整 chunks，跨资料相同片段只进入模型上下文一次；粘贴片段 quota 失败降级为本页暂存。合同测试覆盖长来源尾部恢复、批量复用、来源 refs 与 Pinax JSON 归档。
- 2026-08-17：继续收敛设定创建工作区的 UI 信息层级：JSON 导入确认动作移回结构化预览末尾，移除进度摘要中的重复动作；移动端将世界书名称、资料/文字/状态和本地归档压缩为上下文带，资料投放区提前可见。设定创建页移动端 390px 的 regular/partial/loading/error 审计通过，4 captures、0 console errors、0 a11y failures。
- 2026-08-17：完成设定工作区 U2/U4/U7 代码侧收口。来源 adapter 统一传递 AbortSignal，无 Worker 降级解析也能在读取中止后立即丢弃结果；PDF 密码保护/损坏、DOCX 损坏和 parse-timeout 归一为可操作错误码；quota 失败会把已解析资料保留为本页预览，支持导出文字，并在正式确认时重试归档，正式 worldStore quota 失败会终止并回滚新建/导入半成品，避免写入失效 `archiveRef`；归档清理同时保护 `sourceDocuments[].id` 与 `archiveRef`。完整验证保持 20 个测试文件 / 200 个测试、Vite/VitePress build、diff check；设定页 UI audit 在 1440/1024/390px 覆盖创建页 12 captures + 结构化页 18 captures，共 30 captures，0 console error、0 a11y failure；provider loopback 3 类渠道各完成字段/分区 3×3，真实凭据与设备门禁仍待外部验收。
- 2026-08-17：按设定工作区计划完成 U1，并推进 U2/U3 首轮。新增 `CreationWorkspace / SourceArtifact / SourceChunk` 合同与 IndexedDB source archive 适配器；正式创建世界书前会归档旧 `sourceDocuments` 的完整正文，只保存预览、`archiveRef` 和 chunk 引用，首轮精确 hash 去重保留多来源定位。新增 TXT/MD/PDF/DOCX adapter 合同、多文件独立 `ready/error` 结果、扫描 PDF `needs-ocr` 错误与 Worker 解析边界；新增可恢复的 `WorldbookCreationWorkspace`，支持多文件/拖放/粘贴、JSON 确定性预览、基础基调草稿确认，刷新后恢复来源队列。安装 `pdfjs-dist` 与 `mammoth`。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check；全量 lint 仍受仓库既有错误阻断，新增来源与工作台文件定向 lint 通过。
- 2026-08-17：推进设定工作区 U4 首切片。创建草稿新增参与基调的来源集合与一句构思持久化；资料队列可单独勾选、全选、展开本地抽取预览，基础基调只使用选中来源，并对长来源取首/中/尾代表片段，避免把完整资料直接塞入一次请求；刷新后恢复选中状态、构思和待确认基础草稿。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定工作区 U4 分区检索首切片。新增 `worldbookSourceSelection`，按分区、字段、用户要求和既有条目为来源 chunk 打分，限制单来源占用并返回来源标题、preview locator 和覆盖统计；创建页基础提炼与结构化字段生成共用该选择逻辑。正式创建继续只保存预览与 archive refs。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进 U4 候选批次。新增 `setting-candidates.v1` 结构化协议、服务端 schema/prompt/结果校验和客户端 `generateSettingCandidates`；有来源的分区生成先做一次受限事实提取，再把候选、证据和 source IDs 注入分区综合与失败字段修复，候选提取失败降级为直接分区生成。定向与完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：完成 U4 候选审阅切片。新增 `structuredSettingCandidateContract`，对候选做类型、正文、证据、别名和来源 ID 归一；只按 `entryType + name + aliases` 聚合同名提示，不自动合并候选，来源 ID 不在当前资料集时丢弃。唯一 `SettingDraftReview` 展开区显示候选正文、证据、来源和提取失败原因；既有候选、JSON 导入和分区生成测试保持通过。
- 2026-08-17：完成创建工作区 JSON 待确认覆盖。新增确定性 `buildWorldbookImportPreview`，预览条目数量、分组、类型分布、触发词、注入参数和前五条条目，空条目结果明确阻止确认；UI audit 新增真实 `setInputFiles` 场景，1440/390 两个宽度均能打开预览并看到确认动作，0 console error、0 a11y failure、无横向溢出。完整验证保持 20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进创建工作区状态机。新增 `idle -> preparing -> generating -> validating -> ready/partial/error/cancelled/stale` 的本地状态合同；多文件解析保留成功来源并将失败文件摘要写入 workspace，刷新后继续显示失败原因；基础基调、JSON 解析和正式创建统一更新状态与可恢复错误文案。真实 UI audit 覆盖 JSON、混合文件部分成功、生成中和生成失败，1440/390 共 8 captures，0 a11y failure、0 裁切/横向溢出；移动端资料标题改为自然换行。
- 2026-08-17：推进详细设定生成状态收口。`StructuredSettingsPanel` 为分区生成加入 pending/partial/error/aborted/stale 生命周期、失败字段重试、worldbook revision stale 门禁、分区切换/卸载取消和单字段旧响应隔离；`GenerationStatus` 与唯一 `SettingDraftReview` 能显示部分成功与过期结果，reduced-motion 下关闭状态脉冲动画。UI audit 新增结构化设定页真实 loading/error/partial 请求场景，1440/390 共 8 captures，0 console error、0 a11y failure、无裁切/横向溢出。
- 2026-08-17：执行设定工作区首轮 UI 收口。结构化设定页顶部改为当前世界书上下文栏，移除重复的新建入口与隐藏主题按钮；原始资料改为横向来源带，点击单份资料才展开预览；结构化面板移除重复 H2、描边卡片和旧草稿抽屉，草稿统一进入当前审核区，分区切换与 AI 操作改为下划线式层级。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定页第二轮 UI。设定子导航移除罗马编号、虚线分隔和菱形印章，改为轻量图标与底部活动线；修正结构化设定有草稿时的 CSS Grid 区域，字段/地点保持主列，审核区桌面位于右列，中窄屏与移动端前置显示，并移除审核区外层阴影卡片。定向 UI/设定契约 23 项通过。
- 2026-08-17：推进设定页第三轮 UI。世界书首页改为紧凑上下文栏与“当前世界书 / 切换 / 预设”网格，移除英雄卡撕角、印章、重阴影和多按钮框；创建工作区保留资料与基调逻辑，但步骤编号改为图标、返回入口和顶部间距收紧，桌面/移动端继续复用现有来源队列与 JSON 导入。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定页第四轮 UI。高级世界书页顶部收敛为当前上下文、搜索和新建，移除重复的返回快速导入动作；编辑分区改为图标导航，世界书列表改为无卡片侧栏，基础设定/导入导出/分组/条目面改为连续编辑区，按钮统一降为底部线条层级。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定页第五轮清理。删除高级页重复的“新建 / 导入”编辑分区及其旧 AI/文本提炼状态、localStorage 草稿恢复、路由锚点和无调用样式；快速导入页的创建、导入和 AI 入口继续统一进入独立 `WorldbookCreationWorkspace`。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定页第六轮 UI。高级世界书条目面改为检索栏、过滤器、批量操作、条目列表和编辑面组成的连续工作区；列表使用轻量活动边线，类型/触发方式/分组改为文本标记，注入参数、分组和维护工具取消多层卡片与胶囊堆叠，并补齐窄屏下的工具换行、列表高度和编辑顺序。旧“新建 / 导入”链路继续由独立创建工作区承接。完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：推进设定页第七轮 UI。世界书首页改成清晰的当前世界主卡、独立选择器、创建工具和带小面积异色标记的预设索引，移除无效“切换”按钮与粗黑框主动作；结构化设定将当前世界与设定导航合并为桌面单行工具栏，正文改为左侧分区索引 + 右侧编辑稿面，字段 AI 动作退为轻量图标文字。桌面 1440px、移动端 390px 与 200% 缩放共 4 captures：0 console errors、0 a11y failures；完整验证通过：20 个测试文件 / 200 个测试、Vite/VitePress build、diff check。
- 2026-08-17：执行控件减框计划 U5。速记、索引详情、状态与联机组件已迁移到 `control-*` 语义，定向 3 tests 与 full 194 tests、Vite/VitePress build、diff check 通过；但用户视觉复验未通过。根因不是单个按钮样式，而是 mast 同时常驻全局页签/联机/存储/文档/设置，drawer 两列重复导航，体验页再次显示标题/会话/索引/设定/切换，composer 仍多层套框。计划已增加 U5-R，先重构信息所有权、单列导航和输入主动作，再进入 U6。
- 2026-08-17：执行 U5-R C0-C3。`AppShell` 顶部收敛为 Pinax/当前上下文/告警点，文档与设置下沉 drawer utility；`ActivityBar` 合并一级与二级导航；`Experience` 顶栏收敛为会话、索引和 More 菜单。定向 UI 契约 3 tests 与 Vite build 通过；现有服务 UI audit 生成 8 张截图、0 console errors，但因隐藏 drawer 和长文离屏消息操作被旧 clipped 统计判失败，待 C6 修正。
- 2026-08-17：执行 U5-R C4-C6。`InputArea` 改为自动增高 textarea，发送/停止共用图标槽位；快捷栏收敛为继续/场景/对话，心理、半自动、提示词详情和导演注进入 More；角色选择改为桌面 popover、移动端 sheet，并补 Esc/焦点回收。UI audit 修正为忽略 `aria-hidden/inert` 的隐藏层和正常文档滚动，真实 1440/390 的 regular/long 共 4 captures、0 console errors、0 a11y failures；定向契约 5 tests 与 full 197 tests、Vite/VitePress build、diff check 通过。角色选择器保留真实设备人工复验。
- 2026-08-17：修复素材/画布/写作回归：画布分镜当前指纹补回 `sourceRefs`，避免已更新版本持续显示“需更新”；彻底删除画布已淘汰的生图抽屉、模型弹窗、旧函数与样式，同时移除写作页与 legacy 体验页的旧挂载、`MediaGenerationDrawer` 包装组件及通用生图组件的浮动 rail/抽屉兼容分支，图片生成只保留素材页内嵌插画工作台；素材参考图本地导入兼容缺失 MIME 的常见图片扩展名，并显示成功、超限或存储失败反馈。Notebook 直接上报结构化块内 Markdown 光标，空行续写不再靠字符串搜索反推；命令菜单按实际高度和 `body.zoom` 换算后的视口坐标贴近光标展开；“改写上一段”改用稳定 `blockId + blockRevision + 正文快照`，不再经过会受 Markdown 标记和文档级 revision 干扰的临时选区，并在 Agent 请求边界将内部 `block` 映射为契约允许的 `paragraph`；收起候选后从批注重开时直接恢复批注锚定的块与局部偏移，纯文本比较不再受 Markdown 标记影响；写作文本 Agent 与叙事工具渠道统一复用 provider 端点解析，MiniMax Anthropic 请求由错误的 `/anthropic/messages` 修正为 `/anthropic/v1/messages`，模型名仍按配置透传；新建与保存批注使用无滚动聚焦并恢复页面和编辑面两层滚动位置。full 200 tests、Vite/VitePress build、diff check 通过；浏览器实测仍待用户复验。
- 2026-08-14：执行体验页与写作页移动端适配计划 M0-M4 + W1-W3。M0 实测 390px 基线（装饰 contour 溢出、52px 死重左内边距、顶栏双行、触屏操作常驻）；M1 移动工作区骨架（overflow-x:clip、顶栏单行 65→36px、右栏近全宽 sheet、单滚动容器）；M2 输入区（快捷操作单行横向滚动、safe-area、键盘复用 visualViewport）；M3 触屏消息操作点按显示；M4 会话切换入口恢复 + sheet 关闭按钮 44px；W1 写作抽屉骨架确认、W2 命令菜单底部翻转 + 子菜单返回。320/360/390/412px 无横向滚动、输入区与发送按钮可见、桌面无回归；ui-audit experience 全宽度 0 console/0 a11y。剩真实手机与微信内置浏览器验收（M5/W4）。
- 2026-08-14：执行叙事运行时收口计划 P0-P5。P0 trace 分阶段记录 + parser 块统计；P1 BeatPlan 独立资料预算、超时按阶段分配、geo 条件暴露；P2 `NarrativeKernel.activatedLore` 确定性接入世界书 matcher（starter 零配额 + 概述回退）；P3 BeatPlan 最小因果、软区间无硬补、五条行文契约、SceneThread 参与者切换；P4 语义分段（260 字/4 句兜底、2-3 句分组、短段合并）+ 桌面段距；P5 清理过时注释并更新本状态。191 tests 保持 ≤200。剩真实渠道 3×3 验收。
- 2026-08-14：补齐叙事回归边界：BeatPlan 工具目录在整轮 transcript 生命周期内保持声明，避免后续请求因历史 tool-call 被契约拒绝；清理【正文】等小节标题并将 presentation schema 升到 v5，使旧消息按单换行语义分段规则重新解析。定向 contract 测试覆盖真实请求 shape、legacy 标题和版本迁移。
- 2026-08-14：补齐旧会话与空正文边界：loadSession 将 presentation v5 迁移结果回写持久化 session；无 marker 的长正文也走语义分段；仅有协议标题的模型响应不再进入 gameStore 空正文错误路径，而是按可重试空响应处理。
- 2026-08-14：复核体验页 Agent 运行时调研并重写为当前收口计划。代码确认“两轮限制”由 BeatPlan 与资料工具共用计数导致，“叙事工具超时”实际是 provider 模型步骤 20 秒超时；现有世界书 matcher 已具备常驻、绑定、关键词、starter 和预算能力，但生产 NarrativeKernel 未接入。计划先止血运行时，再接世界书、收紧因果拍，最后修复逐句分段与桌面密度；runtimeEvents v2、Goal domain、风格硬重试延期。
- 2026-08-13：完成体验页叙事连续性调研并制定 C0-C7 计划。代码证据确认当前短碎输出并非只由 token 上限造成：continue/auto 被当作隐藏 user turn，最近上下文截掉长回复尾部，voice policy 多次要求“一小步/短小后果”；本地 SillyTavern 对照确认 continue 应延长最后 assistant 内容。计划收敛到 intent 隔离、ContinuityFrame、真实角色 transcript、同消息 segment 事务、有界补全和真实渠道多轮 A/B。
- 2026-08-11：收口酒馆能力对齐复验问题：SceneCast 改用真实持久化角色状态并按用户点名/目标自动选择 speaker；旧 checkpoint、记忆 revision 和分支差异恢复需要显式确认；UI audit 使用各自真实视口的 200% 有效宽度、核心控件 Tab 与实际 reduced-motion 动画作为失败门禁，390px/200% 顶部工具区改为两列重排。
- 2026-08-11：修复写作 Notebook 长文档当前视觉行漂移。此前 `coordsAtPos()` 的缩放后 viewport 坐标被直接写入 `body.zoom` 下的 CSS 定位，误差随正文纵向位置累积；现统一转换回局部 CSS 坐标，并补偿 top/left/width/line-height。0.85 缩放第 80 段浏览器样本从约 `-491px` 误差收敛到行内居中的约 `-5px`。
- 2026-08-11：修复写作空行命令与续写采纳链。续写恢复为光标后的 ProseMirror ghost text，Notebook 不再显示右下角候选/撤销浮条；生成中、失败和重试也使用同一低干扰行内位置。支持点击或 Tab 全部采纳、Ctrl/Command+右方向键采纳一句、Esc 忽略，并由原生事务插入和撤销。旧损坏节点可将成对 `**`、`*`、反引号恢复为 mark，普通引用可无损往返。
- 2026-08-11：WNB-6 精确采用 Cmd Markdown 编辑字体栈；当前段与光标视觉行分层定位。空段命令菜单改为单列级联：一级四项常驻，修改/结构子菜单从右侧展开且不覆盖一级；上下选择、左右展开/收起，删除字母快捷键和一级双列布局。中文 IME 不被抢占，AI 段落修改继续复用边注候选链。
- 2026-08-11：完成 Jupyter、nbformat、Cmd Markdown 与知乎长篇编辑调研，确认“每段一个业务 block”是当前 Notebook 的结构错误；WNB-6A 写作单元重构提升为写作页最高优先级。
- 2026-08-11：启动 WNB-6。写作页收敛为单一实时编辑面，删除源码/阅读切换；标题与引用局部露出语法，段首 `##` / `###` 支持直接转换；冻结多片段批注、查找同类和多目标原子改写方案。
- 2026-08-11：修复写作批注改写的 `text-model` 空响应与 30 秒超时链：增强兼容响应解析、错误分类、候选输出预算和一次有界修复重试；DeepSeek V4 的约束 JSON 任务关闭 thinking，思考过程不会挤占或写入改写正文。
- 2026-08-11：清理零调用运行时文件和已被长期日志吸收的临时阶段报告；同步代码地图与地图 ADR/RFC，并合并远端主题2锁定、文档链接修复和世界书预设幂等复用修改。
- 2026-08-11：审阅并重写体验页 SillyTavern/cross-source 对齐计划，收敛为 R0-R7，优先处理正文、运行时、记忆和分支事务一致性。
- 2026-08-11：写作页移除独立顾问入口，Notebook 成为默认实时 Markdown 编辑面；正文拖选后在光标收束端显示“批注 / 素材”浮条并使用主题蓝色选区。批注草稿改为选区旁就地输入，范围筛选与解决/恢复入口删除；批注可原位编辑、按批注改写或直接删除，版本页收敛为最近检查点。

## Next up

1. 执行体验叙事运行时收口 P0-P1：补 plan/evidence/write 可观察性，拆分控制与资料预算，资料耗尽时有界完成，并按模型步骤纠正超时与错误文案。
2. 执行 P2-P4：把现有世界书 matcher 接入 NarrativeKernel，取消硬字符下限补全，恢复最小因果拍与 SceneThread 正确写回，再把逐句 narration 拆分改为异常长段兜底并微调桌面密度。
3. 执行 G2.4-A 真实地点整理与浏览器 smoke，覆盖导入、定位、绑定、刷新、切换世界书和回滚。
4. 完成 G1.4 M5 与联机双浏览器 smoke，观察 speaker、marker、模板句、手动编辑、掉线和 host loss。
5. 完成写作 Notebook 的真实候选/章节审查 smoke，检查桌面、390px、取消、恢复和多候选质量。
6. 推进漫画 M7 连续性质检，并各完成一张 MiniMax 插画与一条 6 秒 768P 视频真实 smoke。
7. 地图继续父子区域、相邻关系、remap、LOD 与标签碰撞；不再扩张未接入的实验模块。
8. 按 `docs/plan/experience-mobile-adaptation-plan-20260814.md` 收口体验页与写作页移动端：先处理体验页唯一滚动容器/输入区键盘安全区，再处理写作页空格命令、选区批注和改写面板。
9. 完成 U5-R C6 核心门禁；设定工作区下一步只做真实渠道与真实 revision 变化下的 stale/取消 smoke，并清理验收记录；不为缺少真实 fixture 的状态继续扩张 smoke。角色选择器仍需真实设备复验，之后再进入 `docs/plan/ui-controls-dialogue-polish-plan-20260817.md` 的 U6-U7。
10. `docs/plan/settings-import-and-review-ux-plan-20260817.md` 的 U1-U7 代码侧已完成：候选同名/别名提示、来源证据保留、创建工作区 JSON 预览、source archive 容量/复用/清理、解析与生成取消、详细设定 stale/cancel UI 审计均已落地；后续只处理真实 PDF/DOCX 文件、真实 provider 渠道与真实 revision 下的取消/stale、配额与隐私/性能门禁，不在旧高级页继续叠上传按钮。

## Working rules

- 不启动或重启用户已有 dev server；真实渠道测试需要现有服务可用时执行。
- 不回滚其他用户 WIP；共享文档只保留当前事实和可执行下一步。
- 新功能进入现有主计划和 Gate，不创建平行产品路线。
- 模型只通过明确 contract、预算、权限和恢复路径参与系统，不允许直接写核心真源。
