# B 线：StoryForge 漫画工作台与生产闭环优化任务书

状态：**调研与计划，未实施、未启动夜间 worker**。编制日期：2026-09-16。本文件是三线总计划的漫画子任务书；只定义漫画域，不负责历史/记忆引擎、跑团或共享 Shell 的并行改造。

统筹、启动与集成门禁见[三线总计划](./nightly-20260916-three-track.md)。

## 1. 交付目标与证据边界

一夜要交付的不是更多“AI 按钮”，而是一条可放心反复使用的路径：**打开当前作品的漫画 → 查看连续页 → 点选一格 → 修改画面/对白 → 上传或生成候选 → 明确选用 → 阅读检查 → 导出**。没有模型时仍可完成手工分镜、上传、排字和导出检查；有模型时也不允许晚返回结果覆盖作者刚改的格。

用户已多次指出页面粗糙、切换别扭、与首页不协调、大片空白。漫画线必须继承已确认的首页与工作台标签，不再另造品牌标题、全页后台卡片或第二套浏览器标签。视觉任务先做一张真实漫画页的小切片并截图，方向通过集成者检查后才扩展。**代码测试通过不等于用户认可视觉，更不等于图像质量已通过。**

证据分层：本次完成远程源码调研、Pinax 静态对照和参考截图查看；没有运行 StoryForge 的真实生成流程，没有进行其全功能验收。以下“已见源码”只证明存在该实现路径，不保证无缺陷。时间安排是顺序建议，不是保证八小时完成所有储备项。

## 2. 冻结上游版本与可回查证据

上游：[yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge)。2026-09-16 `git ls-remote … HEAD` 与 GitHub recursive tree 返回同一版本：`cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed`。夜间禁止静默切到变化后的 main；若要更新，先重做相关差异审计。

以下路径全部相对于该 SHA，不以 README 的宣传概述代替代码。

| 编号 | 实际查看的证据 | 可以借鉴什么 | 不能由此推断什么 |
| --- | --- | --- | --- |
| S01 | [ComicStudio.tsx](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/comic/ComicStudio.tsx) | 按 scope 读取作品；页缩略图、中央可点选画布、格检查器；刷新后恢复对象草稿；源变化需确认同步 | 不能保证其所有切换路径无数据丢失；组件仍较大，不整页移植 |
| S02 | [navigation.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/comic/navigation.ts) | 原作/方案、脚本、页格、视觉、审校、版本分组；把复杂生产步骤组织为对象工作区 | 不把全部内部步骤铺成 Pinax 顶部十几个按钮 |
| S03 | [ComicPanelInspector.tsx](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/comic/ComicPanelInspector.tsx) | 当前格镜头、裁切、主体状态、候选、上传与取消入口 | 宽长表单不自动等于精致；手机要重新编排 |
| S04 | [studio-model.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/comic/studio-model.ts) | 人物/场景/道具的稳定设计字段，禁止变化项，来源归属与权利状态 | 不能把人物名称当唯一身份，也不能把文字设定当图像参考已传输 |
| S05 | [durable-production.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/durable-production.ts) | 12 类生产候选、源 manifest/hash、目标格 revision、作者修改后的 intent、采用检查点及已写入识别 | 不在一个夜晚复制整套 Harness；其数据库/Agent 表依赖与 Pinax 不同 |
| S06 | [image-request-guard.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/image-request-guard.ts) | transport 前登记请求；结果不明时拦截同 hash 重发，要求作者明确新请求 | 这是本地防重复策略，不是跨设备服务端 exactly-once 保证 |
| S07 | [media-service.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/media-service.ts) | 图片候选与采用分离、expectedRevision、候选归属、锁定保护、媒资权利、实际传输参考列表 | 代码明确当前兼容 transport 只发文字；不能称上游已解决参考图一致性 |
| S08 | [qa.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/qa.ts) | 页/格顺序、媒体引用、排字、当前 revision 的审查、分镜与视觉成品分级阻断 | 空 issue 数组不能证明实际图片已看过；启发式排字不是完整印刷排版引擎 |
| S09 | [renderers.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/renderers.ts) | 页 SVG、本地排字、图片包/CBZ、ComicInfo.xml、阅读方向、打印 HTML | 打印 HTML 不等同自动生成完整 PDF 文件；导出字形须按浏览器实际结果验收 |
| S10 | [release-book.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/comic/release-book.ts) | 导出只读不可变 manifest 和已固定 hash 的 Blob，不从活动草稿回填 | 不证明 Pinax 已具备同样发布存储与 GC 固定引用能力 |
| S11 | [comic-production.spec.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/tests/e2e/comic-production.spec.ts) | 小说来源冻结、分镜发布、候选编辑/排除/刷新/采用的浏览器旅程 | 测试有直接构造域数据，不能冒充真实模型完整成品验收 |

已实际查看上游 [comic-studio-final.png](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/showcase/comic/before-rain-stops/art/final/comic-studio-final.png)：画面比说明更突出，左列逐页缩略图，中间页纸，右列当前格，页序明确。此图属于仓库样例制作记录，**不是当前最新版全部页面截图**，不继承其黑黄工作台与巨幅标题。对照本地 `/tmp/pinax-comics-unified.png`，Pinax 当前截面是未选素材的计划空态，中央大块空白、进入实际成页的方向较弱；不能拿这个空态与对方完成品直接比较画质。

## 3. 开源复用与许可执行清单

已读取冻结 SHA 的 [LICENSE](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/LICENSE)：MIT，`Copyright (c) 2026 yuanbw2025`。复用 substantial source 时保留版权与许可全文；记录原路径、SHA、移植范围、适配原因。此处是工程复用门禁，不替代完整法律评估。第三方依赖、样例图片、字体及模型产物的授权仍分别核对，不把根许可证自动当作所有素材权利证明。

| 复用候选 | 决策 | 接入位置与前提 |
| --- | --- | --- |
| 现有 Pinax `comicCompositionService` / `comicLayout` | 优先原地复用 | 已有拆合格、阅读顺序、沟槽与方向控件，不重写第二套几何引擎 |
| 现有 Pinax `comicLetteringService` / `ComicPagePreview` | 原地加严和接线 | 已有字层、出版报告，不把文字烧进模型图 |
| StoryForge request claim 算法 | 可移植小型策略，先确认现有持久队列能力 | 去除其 Agent conversation 依赖；适配 Pinax owner，保留未知状态与显式再生成语义 |
| StoryForge renderer 的 CBZ/ComicInfo 纯函数片段 | 条件复用，P1 | 复用已安装 JSZip，输入改成 Pinax 序列；不能照搬 React/DB 类型或增加第二个媒体仓库 |
| StoryForge QA 规则与浏览器 fixture 思路 | 改写规则映射和测试断言 | 保持 Pinax 自己的 panel ID、坐标和生产状态；核对坐标是页级还是格级 |
| StoryForge React UI | 只借交互，不直接移植 | Pinax 是 Vue；复用 Lucide、现有 pane switch、公共按钮/菜单；不引 React/Zustand/Tailwind |
| 整套 durable-production/Agent/DB schema | 不整包搬入 | 与记忆线数据库工作会冲突，且超一夜风险；只提取候选冻结/采用合同 |
| 上游漫画成品、封面、人物图、logo | 不随 Pinax 发布 | 可只读研究。测试用原创/授权自有 fixture，截图明确标记测试内容 |

夜间 B 线若引入源码，提交专属 `docs/engineering/comics-upstream-reuse.md`，由 O 统一归入全局第三方清单。新增依赖由 O 审批、安装及更新 lockfile；B 不擅改 package 文件。

## 4. Pinax 现状：保留能力与真实缺口

实际查看 `src/pages/ComicStudio.vue`、`comicPageStore.js`、`comicProductionService.js`、`comicCompositionService.js`、`comicLetteringService.js` 及漫画手册。当前不是空白产品：

- `COMIC_PAGE_SCHEMA_VERSION = 5`，已有 sequence、pageNumber、sourceRefs、visualBible、revision、格生产 lineage。
- 已有多素材改编候选、页目标/翻页钩子、视觉圣经确认、彩色/黑白阶段链、上传和局部修订入口。
- 已有拆分/合并/重排/沟槽/格式变换、人物调度框与焦点等方向数据。
- 已有独立排字对象、溢出/遮挡/安全区报告及最终图缺失阻断；手册列出 PNG/WebP/PDF 与条漫切片。必须保留并实测，不重新宣称为新增。

重点核验并修复的缺口：

1. `ComicStudio` 初始化直接 `listActiveNarrativeAssets()` / `listComicPages()`，`activeProjectId` 可回落到 activeWorldbook ID；页面没有在这段初始化中明确按 route bookId 锁定。需验证是否有外层保障，不能只凭顶部书名认定数据已隔离。两书同库与两书不同库都要验。
2. 页条用整体列表 index 呈现 P 编号，`listComicPages` 默认按 updatedAt 排序；编辑旧页可能改变列表顺序感，应以序列与 pageNumber 构造导航。
3. 页选择、当前格和编辑器是多处 ref/preview/事件同步；必须冻结一个 active selection owner，处理切换时未保存草稿，不能只修 CSS。
4. `runComicStageGeneration` 目前以输入快照构造请求后归档，入口签名未见 signal；需完整追踪图片服务的取消/超时与归档晚返回约束，再补封口。不能把尚未追完的调用链直接称已确证 bug。
5. 生成后 `addComicPanelStageArtifact` 默认选中候选，但仍处于 review。需明确“预览选中”和“正式确认”的区别，避免让用户误以为一次生成就替换了最终图。
6. 目前 publication report 主要是单页图与字层检查；序列级缺页、实际 Blob、源修订、连续性审查、导出快照仍需专项验收。
7. 计划空态缺少直观手工起步入口；中央大而空不应靠插画填充，应能直接建一页、导入图片或从当前作品选段改编。

## 5. 冻结信息架构与视觉约束

定位：漫画是**空间编辑工作台**；主视距是桌面/笔记本，手机用于回看、改字、选片而非假装等比例桌面；气质是安静、精确、内容优先；容量样本覆盖 0/1/6/40 页、1/4/8 格、长标题和长对白。

```text
现有 WorkspaceTabs：当前作品 · 漫画（不新增品牌栏）
漫画工具栏：作品/序列选择 | 制作·视觉资料·阅读检查 | 撤销/导出/更多
┌────────────┬───────────────────────────┬────────────────┐
│ 页缩略目录 │ 当前页 / 适合窗口 / 缩放 │ 当前选中格      │
│ 页号+摘要  │                           │ 画面 / 对白     │
│ 已选片状态 │       实际漫画画布        │ 当前候选/阶段   │
│ 新页/排序  │                           │ 详细参数按需开  │
└────────────┴───────────────────────────┴────────────────┘
```

八条验收硬约束：

1. 不动 Shell 和顶部标签样式；不重复“Pinax / 创作 / 书名”，内部模式是紧凑控件而非另一条浏览器标签。
2. 1440px 默认页目录约 184–220px、对象检查器约 300–340px，其余归画布；检查器收起后画布立即扩展。不固定居中 max-width 留整块空白。
3. 目录首屏看见至少 4 页的可辨缩略轮廓；无图用真实格框缩略图，不用品牌图标冒充封面。
4. 工具栏正常态只有一个主要动作；破坏性操作进更多并确认；生成、上传、选用、确认不是同色同权的大按钮堆。
5. 长文本自动增高；同一组对白没有 textarea 内滚动与外滚动争抢。画布明确可缩放，长页是合理空间滚动，不以禁止所有滚动为目标。
6. 选格有一致的画布描边、目录/检查器定位和可读名称；悬停不能改选择。滚动画布不使选格消失，切页不跳回首格之外的无关对象。
7. 900px 先收页目录或检查器，390px 单面板制作/页面/当前格切换，保留回画布入口和返回焦点；中文控件正文不再大量使用 11px 微字。
8. 只用现有主题 tokens、图标与动效节奏；亮/暗各验，reduced-motion 时无位移，截图不裁掉空态或底部溢出。

小切片顺序：先“一张 4 格测试页 + 缩略目录 + 当前格对白”→ screenshot/点选/输入/返回 → 再扩至多页和候选。若方向仍不协调，保留安全/归属修复，停止扩大 UI，不用另外一轮整页重写掩盖失败。

## 6. 数据与状态合同

### 6.1 归属与来源

进入漫画时解析已有 workspace contract，明确 `bookId`、已存在的 project/worldbook 关系及 `sequenceId`。不把新建业务 schema 中的 projectId 偷换语义；适配旧 ID 时给出显式映射。没有归属的旧页归入“未归属旧漫画”，只读展示或由作者明确移动，不自动挂到当前书。两本书共用世界书时仍不得混用漫画候选或页。

来源采用冻结快照 `{sourceRefs, contentHash, sourceRevision, capturedAt}` 的最小可行形态；生成读取冻结来源，作者同步来源才产生新基线并标记受影响内容。源被删除不连带删除已有漫画，显示“原来源不可用”。漫画更改不回写小说、世界书或记忆事实。

### 6.2 编辑与候选

主选择键是 `{scope, sequenceId, pageId, panelId}`，不是数组 index；切页保存/刷新/返回由一个 composable 处理。采用前检查 scope、页/格 revision、来源和视觉圣经修订。作者在请求后改字、换格、换书或删页，响应只能进入原对象候选或可恢复隔离区，不覆盖现选对象。

最小状态：`idle → submitting → awaiting-result → candidate → selected-for-review → approved`；失败区分 `known-failed / cancelled-before-send / outcome-unknown / persist-failed / stale`。现有 six-stage enum 不为显示方便整体替换，通过 view model 映射。结果是否已计费由渠道回执决定，不知道就显示不知道。

图片产物与当前选中引用分离；上传/生成先保留候选，再由作者选用/确认。旧选中图在失败时保留。上游或视觉圣经变化只将受影响后继标 stale，保留原图与 lineage，不清空整条历史。

### 6.3 请求、防重与持久失败

发送前持久记录稳定 request ID/hash 与冻结输入；用户双击、刷新、同页重入不能自动发第二次。服务端可能仍运行的 timeout/abort 标 outcome-unknown，提供“核查结果/明确再生成”，新生成要明确 author intent，不能暗中自动重试。

网络完成而媒资保存失败时显示 persist-failed，保留可恢复结果引用；只重试保存，不再调用模型。具体 Blob 暂存/候选持久能力先复用已有 media store 和 durable owner；若能力不足，B 给 O 提共享接缝申请，不私建一套漫画数据库。删除操作只移除当前选择/归档状态，夜间不实施破坏性 Blob GC。

### 6.4 导出与权限

导出一次捕获当前序列快照与选中媒体，不边渲染边读活动草稿。缺失 Blob、越域媒体、无法解码和关键排字错误须阻断“成品”，仍允许明确标注的草稿/分镜预览。首夜不把单次快照包装为已实现不可变发布历史；永久版本与固定 Blob 引用属于后续。

权利信息可记录“未知/作者上传/服务生成”，不得根据生成成功自动设为允许商用/再分发。导出用户自己的本地草稿不强迫伪授权；对正式分享/成品声明保留缺口提醒。排字内容须转义，SVG/HTML 导出不执行嵌入脚本，不把远程任意 URL 当可信图片。

## 7. 文件所有权与并行接缝

**B 可写**：`src/pages/ComicStudio.vue`；漫画专属 `src/components/media/Comic*.vue`；`src/services/media/comic*.js`；拟新增 `src/composables/comics/`；专属 `scripts/comics-nightly-check.mjs`；`docs/user-manual/09-comics.md`；B 线证据、回执与本文。

**需逐文件确认**：`ComicPageEditor` 对其他页的嵌入消费者、`ComicPagePreview` 对导出的消费者、现有核心测试文件（只能 O 排期合并断言）、当前媒体库保存/下载适配。纯漫画文件仍要查全部 import，不能默认无外部消费者。

**B 禁写**：`AppShell`、`WorkspaceTabs`、router、全局 token/style、package/lock、共享 DB/schema/backup、memory/history、Experience/gameStore、AI provider/client、STATUS/PLAN/LOG、跑团路线。需要共享功能时提交 `interface-request.md`，包括调用合同、失败语义、最小 diff 建议和测试，O 单一 owner 实施。

三线依赖：B 不等待 A 的 Utopia 大库即可做好作品归属、选择、页面布局、编辑与离线验收。书级资料经只读快照适配器进入漫画。A 拟提供带 `bookId/worldbookId/sessionId/branchId` 的审计接口，实际共享接线由 O 完成；跨域历史只记录既有可支持的引用，不把漫画生成日志塞入正式世界事实。C 跑团消费漫画成品以后再通过媒体只读接口接入，不在今夜改两域运行时。

## 8. 可直接执行的任务包

P0 是一夜必须闭环的最小版本；P1 仅在 P0 分线 Gate 通过后按顺序选取；P2 为后续。若 P0 超出可用夜窗，必须提交真实部分状态，不能删失败测试或降格验收冒充完成。

| ID | 级别/预计窗口 | 任务与实施位置 | 交付和完成条件 |
| --- | --- | --- | --- |
| B01 | P0 / 0:00–0:20 | 读 STATUS/skills/总任务板，冻结 base、scope 与本 SHA | 输出基线、独占文件、现有服务地址；不启动用户服务 |
| B02 | P0 / 0:20–0:45 | 核查漫画页/来源 route 归属与两书共享库 | 明确真源和兼容迁移策略；发现混域先阻断写入 |
| B03 | P0 / 与 B02 同包 | 构造 2 书、2 序列、6 页与一个无归属旧页 | fixture 非用户数据；页面、候选、媒体 ID 可追溯 |
| B04 | P0 / 0:45–1:20 | 建 `useComicWorkspaceSelection` 或等价薄协调器 | 单一 selection owner；刷新/换页/换书不串对象 |
| B05 | P0 / 同包 | 修复页列表按 sequence/pageNumber 稳定顺序，隔离未归属页 | 修改旧页不会跳序；标题变化不改变 identity |
| B06 | P0 / 1:20–2:10 | 单页视觉切片：页缩略图、画布、当前格编辑 | 1440/390 真截图已查看；保留 Shell、不大面积空白 |
| B07 | P0 / 同包 | 精简 toolbar/模式/状态的重复 owner | 一个主动作、图标有 label、键盘可操作，无装饰填充 |
| B08 | P0 / 2:10–2:45 | 完成空态手工新页和已有页直达 | 无 API 从入口两次操作内见真实可编辑页；不强制先生成 |
| B09 | P0 / 同包 | 当前格画面/对白层次，长文字自适应，控制详细字段显隐 | 800 字对白测试不内滚；切模式保留作者草稿 |
| B10 | P0 / 2:45–3:30 | 审计编辑保存、离页 flush 与存储失败，复用 durable owner | 未保存不报已保存；失败可重试原稿，刷新可恢复 |
| B11 | P0 / 同包 | 采用前冻结 scope/revision，迟到结果及删格拦截 | 请求后改格、删页、换书均不覆盖；候选仍可辨归属 |
| B12 | P0 / 3:30–4:15 | 请求提交防双击、结果未知不自动再发 | 网络计数证明每 intent 一次；刷新也不隐式重发 |
| B13 | P0 / 同包 | 生成/上传失败保旧图；媒体写失败只重试持久化 | 同一成功响应不二次计费；失败状态与恢复入口真实 |
| B14 | P0 / 4:15–4:50 | 候选显示/选用/确认统一入口，保留阶段链 | 生成结果不伪装正式确认；后继失效有原因和旧图 |
| B15 | P0 / 同包 | 单页阅读/出版检查定位格与字对象 | 问题点击可抵达原位置，修复后重算；不显示假零问题 |
| B16 | P0 / 4:50–5:20 | 导出冻结快照、缺失媒体明确失败，回归原格式 | 导出与所选图/字一致；生成过程中不混入晚结果 |
| B17 | P0 / 5:20–6:10 | 1440/900/390、dark、短屏与键盘浏览器 Gate | 同一 fixture 连贯旅程与原图截图；无 console/page error |
| B18 | P0 / 6:10–6:50 | 故障矩阵、快速切页、刷新和旧 schema 回归 | 本文 G-B01–G-B32 有逐项结果；不得只静态截图 |
| B19 | P0 / 6:50–7:30 | 分线 full verification 与自审修复 | 20 文件/200 测试上限、lint、双 build、diff/架构检查通过 |
| B20 | P0 / 7:30–8:00 | 操作手册、来源清单、回滚和 B 线回执 | 给 O 可合并 commit；未运行真实渠道明确标记，不自动 push |
| B21 | P1 | source manifest 变化差异与显式同步 UI | 原作改动不自动重排漫画；同步后只标受影响内容 |
| B22 | P1 | 视觉资料独立紧凑检查面 | 角色/地点/道具不可变项、参考能力警告，选格时可查 |
| B23 | P1 | 上下页连续阅读与稳定缩放状态 | 按序列读，返回选格位置；不再展示 editor chrome |
| B24 | P1 | 页拖动排序 + 键盘上移/下移 | 原子存序，不改变格 identity；取消/失败回原顺序 |
| B25 | P1 | 序列级 PNG/WebP ZIP/CBZ | 可复用 S09 小段与 JSZip；文件编号/阅读方向正确，保留许可 |
| B26 | P1 | 更强的排字实测及阅读方向回归 | 中文/英文/emoji、竖排、放大导出不丢字，启发式与实际截图一致 |
| B27 | P1 | 限定预算真实渠道小样本 | 先取得 O 的 provider/次数/费用授权，失败不循环烧钱 |
| B28 | P2 | 完整 12 步专业改编链与持久可编辑候选 | 不直接复制上游 Harness；先与 A/O 冻结共享运行证据接口 |
| B29 | P2 | 不可变发布历史与已发布 Blob pin/安全 GC | 与备份、存储 owner 一起设计，今夜禁止假实现 |
| B30 | P2 | 批次队列、进度恢复与跨会话媒体任务 | 有真实请求状态协议后实现，不用前端 timeout 猜服务端结果 |
| B31 | P2 | 跨页角色一致性评测、局部重绘质量、专业印刷输出 | 必须真实图片证据和权限声明；不能靠 schema 或提示词过验 |

P0 工时是粗估，非性能指标。B11–B13 若追踪发现需要共享媒体/AI 适配，最晚在前半夜提出接缝请求；不得等收尾才透露根本未接真实链。O 无法当夜接入时，保留“请求后禁止变更目标”的安全暂行限制并明确降级，不能声称已具备后台多任务。

## 9. 离线确定性验收矩阵

这些是业务场景和断言，不要求增加 32 个 Vitest 用例。把核心断言并入既有用例；browser smoke 是显式浏览器旅程，不作为规避 20/200 预算的第二套单元测试。每项记录输入 fixture、观察点、预期状态、实际结果和截图/日志路径。

| ID | 场景/操作 | 必须观察到的结果 |
| --- | --- | --- |
| G-B01 | 两书不同库分别打开漫画 | 页/来源/候选/导出仅当前书，顶部身份和真实 owner 一致 |
| G-B02 | 两书共用同一世界书 | 世界设定可共读，漫画页不能因同库混合 |
| G-B03 | 无 bookId 的全局入口和无归属旧页 | 明示选择范围；不自动挪给 activeWorldbook |
| G-B04 | 空作品、无模型 | 可手工建页、写字、上传，不被 disabled 生成按钮卡死 |
| G-B05 | 六页序列编辑第 2 页 | 仍在第 2 页、顺序不按 updatedAt 重排 |
| G-B06 | 40 页与超长页名 | 可找到当前页，不让每页标签挤毁工具栏 |
| G-B07 | 画布点格、键盘选格、检查器改字 | 三处对象一致，无幽灵选区或输入到上一格 |
| G-B08 | 输入未 debounce 完立即切页/顶栏标签 | 原格草稿已保存或明确阻止离开，返回不丢字 |
| G-B09 | 输入后立即刷新 | 恢复原对象内容，不以 UI 旧快照覆盖恢复稿 |
| G-B10 | 800 字对白、缩窄至 390px | 编辑器自动展开、可到末尾，控件不横向溢出 |
| G-B11 | 中文 IME 输入期间切模式 | composition 不被提前提交或截断；实机 IME 未跑须注明 |
| G-B12 | 4 格拆分/合并/重排再刷新 | 现有图与字的迁移规则明确，不能静默丢子对象 |
| G-B13 | 冻结生成输入后改对白/镜头 | 晚结果不替换新版，显示 stale 原因 |
| G-B14 | 请求中切到另书另一格 | 结果回原 scope，无跨书污染 |
| G-B15 | 请求中删除目标格/页 | 不复活已删对象，不写到 index 相同的新格 |
| G-B16 | 快速双击生成 | 网络仅一次；第二次明确被抑制 |
| G-B17 | 请求已送达但超时/刷新 | outcome-unknown；不会自动重发，显式新 intent 才请求 |
| G-B18 | 发送前取消与发送后取消 | 前者无网络，后者承认可能仍运行；不假称撤销计费 |
| G-B19 | 模型 401/429/500、无效图片响应 | 原选中图保留，错误可读；认证失败不盲重试 |
| G-B20 | 网络成功后媒体持久写失败 | 可单独恢复保存，fetch 次数不增加，不报“已保存” |
| G-B21 | 换候选后未点确认 | 仅 preview/review 变化，阶段确认状态真实 |
| G-B22 | 上游确认图变化 | 后继标 stale 并保留旧图，未相关格不受影响 |
| G-B23 | 视觉圣经变化或参考图能力缺失 | 明示失效/有限一致性；未传图不记录为已传输 |
| G-B24 | 上传损坏图、SVG 脚本、超限图 | 校验失败不产生幽灵媒体；不执行脚本 |
| G-B25 | 排字溢出、重叠、缺图、焦点遮挡 | 分阻断/提醒；点击可定位格和字层，修复后重算 |
| G-B26 | 导出期间作者切换候选 | 本次导出维持启动快照，不混用新旧图 |
| G-B27 | 导出时媒体 ID 有而 Blob 缺失 | 成品失败理由明确，不生成假完整白页 |
| G-B28 | PNG/WebP/PDF/条漫原有出口 | 文件可打开，页尺寸/切片/文字与当前预览吻合 |
| G-B29 | 1440/900/390与短屏 720×450 | 画布/检查器重排合理，回画布入口可见且焦点可恢复 |
| G-B30 | dark、reduced motion、200% 字体/缩放 | 对比、focus 与主要操作保持可用，不只测默认亮色 |
| G-B31 | 首页→漫画→设定→漫画，关闭后台标签 | 状态不串页；不生成第二套品牌/标签壳 |
| G-B32 | 旧 v5 样本往返、失败回滚 | 页 ID、顺序、图 lineage、字层、来源保存；不破坏旧数据 |

P1 执行时追加：CBZ 解压页数/顺序/XML 转义；source 失效后显式同步；恢复同一导出快照；序列排序失败全回滚。不得把“尚未做 P1”的断言标绿或删除后不记。

## 10. 真实渠道与真实观感门禁

离线 Gate 可以证明导航、状态和安全，不证明模型画得好。真实样本必须单独列 run ID、渠道、模型、输入摘要、请求次数、实际参考传输证据、费用（仅有渠道回执时）、失败与人工观察；日志去除密钥及用户私稿。

建议在明确授权后只跑小批：1 个自有角色/1 个场景、2 页共 4–6 格；一格两候选、一格上传替换、一格局部修订（provider 真支持才跑），余格使用既有自有图片。先一张成功再扩，不设置无上限 retries。默认不主动消耗付费额度。

实际查看标准：主体身份/服装、空间方向、道具连续、镜头可读、画面无错误烧字、对白排字可读、两页节拍合理。每项记录 pass/partial/fail 与截图。不设置“提示词字段齐全=一致性通过”。若当前渠道不支持参考图/控制图/遮罩，UI 说清限制，允许手工上传走通；真实阶段标 blocked，离线状态仍可独立交付。

## 11. 风险、降级与回滚

| 风险 | 发现信号 | 当夜处理 | 回滚边界 |
| --- | --- | --- | --- |
| scope 语义冲突 | bookId/worldbookId 在旧页混用 | 先只读隔离旧页，O 冻结映射 | 不做不可逆重绑；旧数据原样保留 |
| 改大组件影响插画/散文消费者 | import 发现共享嵌入 | 保持 props/emit 兼容，新增能力 opt-in | 可单独回滚 ComicStudio 组合层 |
| 新布局仍被认为粗糙 | 小切片截图不满足八约束 | 停止扩展视觉，保留数据安全改进 | 不叠几十条补丁覆盖做第三套主题 |
| 待保存草稿覆盖新 revision | 切页/慢读重现旧值回填 | scope+revision+selection token 校验 | 保留草稿副本，拒绝自动覆盖 |
| 未知请求重复计费 | timeout 后自动重试 | 锁同 intent，显式再生成 | 无可靠 durable 接缝时禁自动恢复发送 |
| 媒体配额不足 | Blob 写入失败 | 保留旧图和恢复说明 | 不清库腾空间、不自动删除用户图 |
| 上游源码引入过重依赖 | React/DB/Agent import 扩散 | 截断为纯策略/适配层 | 不引新框架，不整包 vendor |
| 任务超时 | P0 Gate 尚有失败 | 交付可独立通过小片与剩余表 | 不合入半成品 schema，不把 P1 代替 P0 |

开发按业务切片验证：归属/选择 → 小切片布局 → 请求/采用安全 → 导出检查/证据。交付前收敛为 1 个已完成 feature 提交，必要时最多 2 个，不逐任务制造 WIP 提交。O 在干净工作树集成；若需 revert，回滚代码不删除作者数据。新增字段向后兼容；没有通过兼容性实测不得提升 schema。数据库迁移与全局备份接缝由 O 所有。

## 12. 夜间 worker 回执与总验收

回执落 `docs/agent-runs/nightly-20260916/comics-summary.md`，至少包含：

- 起止时间、base SHA、交付 SHA、真实修改文件、未处理共享接缝。
- B01–B31 的 done/partial/deferred 列表；P0 没完成的原因与下一可执行步。
- 上游代码复用明细与 MIT 保留位置；没有复用源码就写“只借交互，不含移植代码”。
- G-B01–G-B32 实际结果；未运行标 not-run，真实渠道与视觉用户确认单列。
- `npm run verify:full` 的真实 exit code、20/200 预算、lint、应用/文档构建与架构结果；不借用上一轮数字。
- 1440/900/390、dark、空态/长内容/失败态原始截图路径；明确谁实际看过。
- 一页、两书、一次失败恢复和一次导出的人类复验操作顺序。
- 数据兼容与回滚说明、没有承诺的能力（完整专业链、真实一致性、永久发布版本等）。

O 合并后再次组合验证，重点检查漫画/跑团/记忆三线共用的作品身份、媒体、顶部标签、备份和 AI 配置。只有组合验证后才可以称“合入”；用户实际体验后才记“视觉认可”。本次用户明确要求详尽任务书，因此写完整执行计划；它不授权跳过视觉小切片、自动启动夜间执行或扩大付费请求。

## 13. 可复制 worker 启动 brief

```text
你是 Pinax 夜间 B 线漫画 worker。只在 O 指定的独立 worktree/base 上工作。
先读 AGENTS.md、STATUS、非空 LOCAL、ui-style-check、testing-verification、
docs-status-handoff、visual-alignment-workflow、本任务书与总任务板。
冻结上游 StoryForge cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed。

目标：B01–B20 的漫画小闭环；现有 six-stage/排字/导出必须保留。
先查作品归属与真实生成/保存 owner，再做一页视觉切片；截图后自查八约束，
将原图交 O 检查，未通过不扩展整页。完成后按 G-B01–G-B32 验收，不借用旧结果。
只写本文第 7 节独占文件；公共 Shell、router、package/lock、DB/schema、backup、
provider、公共类型、共享测试与状态文档全部归 O。依赖缺口尽早提交 interface-request。
只读小说/设定快照，候选绝不回写正式记忆。保留未归属旧页，不清理用户数据。

不启动/重启用户 dev server。不访问真实私稿来构造 fixture，不输出密钥。
无付费额度授权只做确定性 mock/自有上传；真实生成能力另列 not-run/blocked。
不开第二套测试配置；核心总量 <=20 文件/200 用例，最后 verify:full。
每业务切片自审并修复，交付原始截图、精简回执、commit SHA；不擅自 push/合并。
P0 过 Gate 才进一级溢出包，再过 Gate 才选二级。剩余时间不够就准确交 partial。
```

## 14. 两级溢出包与停止条件

“溢出”指主闭环提前完成后的储备，不是要求把 P2 也挤进一夜。每包开始要在任务板登记，禁止单方面跨域找活。

### 一级：质量与效率包（P1-A，约 60–120 分钟）

优先 B23 连续阅读 + B24 页序 + B26 排字真实长样本。输入是已通过 P0 的六页自有 fixture，输出是作品阅读方向、稳定返回位置和非鼠标排序。不加 provider，不改 DB，不动全局标签。追加验收：排序时存储失败全回滚；连续阅读返回原页原格；120%/200% 缩放及中文长对白不裁字。任何一项破坏 P0，撤回本包而不是扩大修复到 Shell。

### 二级：可携带成品包（P1-B，约 120–180 分钟）

一级通过后才考虑 B25 CBZ/图片包与 B21 源差异。使用已安装 JSZip；先审 S09 纯函数可复用片段，版权留档，再对 Pinax 序列适配。源差异先只读展示与显式同步，不引完整 12 步事实链。追加验收：中文文件名、XML 转义、40 页、损坏图片、重复媒体、取消导出；解压后页数顺序和 manifest 一致；原作删除仍可读漫画。没有稳定内存边界或共享接缝就只交一级，不用 placeholder 版本历史凑齐功能。

停止条件：主闭环任一数据安全门禁失败、需要未授权的共享 schema 变动、上游授权不明、真实生成没有费用许可、或剩余窗口不足完成本包测试和回滚。此时不启动下一包。B28–B31 的长期专业链明确后续，不作为本次完成率分母，也不在首页宣称已提供。
