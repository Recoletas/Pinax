# Authoring 文本工作台深度调研

**日期：** 2026-08-25  
**状态：** 调研完成，作为 v3 实施计划依据  
**核心命题：** 文本工作台是 Pinax 的产品本体；探索文档与正文共享同一编辑器内核；素材、画布、记忆和 Experience 是可选能力。

## 1. 研究问题

本轮不再回答“如何把素材、当前场和推演接进 Authoring”，而回答六个更上层的问题：

1. 作者怎样在不确定章节归属时直接写完整探索文本？
2. 多视角、互斥方案、速记和正式正文怎样共享同一编辑体验，又不形成双重真源？
3. 大纲怎样连接非线性探索与线性章节，而不是只做当前章条目列表？
4. AI 如何知道哪些旧章节应进入上下文，并区分事实、作者意图和未选方案？
5. 当前场、世界书、批注和推演怎样进入同一正文采纳事务？
6. 现有素材页、画布、记忆和 Experience 哪些复用、哪些降级、哪些允许删除？

## 2. 研究结论摘要

推荐产品主链：

```text
快速落笔
  → 非线性探索文档（同一块级编辑器）
  → 项目级大纲组织因果、视角与章节映射
  → 可解释 Context Manifest 选择跨章资料
  → 当前场排练与原位 ghost
  → 采纳为线性正文
```

五条冻结原则：

1. **编辑器优先**：探索和正文复用 `WritingNotebookEditor`、writingDocument schema、writingUnit、批注、ghost、历史与恢复。
2. **正文唯一**：正文是“已经发生并准备发布”的唯一文字真源；探索稿是作者意图，不自动成为故事事实。
3. **大纲只编排**：大纲保存简短叙事意图、关系和文档引用，不复制探索稿或正文全文。
4. **上下文显式分层**：已发生事实、拟采用意图、未选探索分开传给模型；相关性不能替代权威等级。
5. **外围可删除**：素材页等现有模块没有架构特权；只保留文本工作台不可替代的能力。

## 3. 外部产品调研

### 3.1 笔记软件：捕获、对象与视图分离

Capacities 的 Daily Notes 先承接无压力捕获，复盘时再把内容转换为对象；Collections 表达人工选择，Queries 表达自动规则。适合 Pinax 的不是对象数据库 UI，而是“先写，再结构化”的节奏。  
<https://docs.capacities.io/reference/use-cases/daily-notes>  
<https://docs.capacities.io/reference/organizational-structures>

Tana/Logseq 以节点或块引用让同一内容出现在多个上下文，而不复制正文。适合 Pinax 的是稳定引用和上下文视图，不是要求小说作者维护通用知识图谱。  
<https://outliner.tana.inc/learn/features/nodes-and-references>  
<https://docs.logseq.com/>

Obsidian Bases 对已有 Markdown/Properties 建立表格、列表和卡片视图；Canvas 可组织笔记与附件。但 Canvas 的纯文本卡不进入完整 backlinks，说明临时画布内容若不是正式对象，很容易成为孤岛。  
<https://obsidian.md/help/bases>  
<https://obsidian.md/help/Plugins/Canvas>

Heptabase 分离 Card 内容版本与 Whiteboard 布局版本；AI 先搜索对象，再读取相关白板结构。这证明“内容真源”和“空间组织”应该分开。  
<https://support.heptabase.com/en/articles/12679581-how-to-use-heptabase-mcp>  
<https://support.heptabase.com/en/articles/10448124-how-to-restore-cards-and-whiteboards-from-version-history>

### 3.2 长篇写作：非线性组织与线性输出

Scrivener 允许任意粒度、任意顺序写作，再通过 Binder、Corkboard、Outliner 和 Collections 重排或建立横向集合；其优势是正文顺序不等于思考顺序，风险是 Synopsis 与正文容易双重维护。Pinax 应复用“同一内容的多视图”，但不复制每段 Synopsis。  
<https://www.literatureandlatte.com/scrivener/overview>

Plottr 的 Timeline 与 Outline 使用同一批 Scene Card，人物线、地点和章节只是视图维度；但“章节 × plotline”网格过早要求作者确定结构，不适合 Pinax 的未归章探索。  
<https://docs.plottr.com/article/54-timeline-overview>  
<https://docs.plottr.com/article/68-outline-overview>

Novelcrafter 已支持 previous/next beat、same-POV scene、act summary，以及手动把章节、snippet、outline 加入上下文；更新日志也暴露过 prior beat 错误带入 Codex、额外上下文重复等问题。Pinax 应提供有原因、有权威、有时间边界的 Context Manifest，而非只增加上下文多选框。  
<https://feedback.novelcrafter.com/changelog/june-1st-2024>  
<https://feedback.novelcrafter.com/changelog/may-10-2025-new-prompting-system>

## 4. Pinax 现状审计

### 4.1 可直接复用的核心

| 现有能力 | 可复用部分 | 不应复制 |
| --- | --- | --- |
| `WritingNotebookEditor` | ProseMirror 编辑、selection/caret、IME、键盘、ghost | 不建探索专用 textarea |
| writingDocument schema v3 | paragraph → writingUnit → scene、稳定 node/unit ID | 不恢复每自然段一个业务块 |
| 批注/历史/恢复 | 稳定锚点、快照、恢复草稿、请求级撤销 | 不建探索专用版本系统 |
| `sceneAnchors`/projection | 按 unit 继承当前场、绑定 worldbook | 不让未采纳探索改现场 |
| NarrativeKernel | 场景生成、角色/地点/规则上下文 | 不复制 Experience store |
| Project Knowledge Facade | reader、context profile、预算 | 不建第二套草稿 RAG |
| Context Ledger | included/excluded、reason、score、sourceRefs | 不建另一个“AI 看了什么”面板 |
| 受控记忆 | authority、revision、失效、召回审计 | 不把记忆伪装成用户草稿 |
| 画布 | asset/card 引用、edge、邻域上下文、顺序 | 不让画布拥有探索正文 |

### 4.2 现有核心缺口

1. `writing_books` 只有 `chapters[]`，没有共享同一 editor schema 的探索文档集合。
2. `chapter.outlineItems[]` 是章内线性数组，同时复制素材标题/正文，不能承担项目级编排。
3. `buildAuthoringNarrativeContext` 只读当前章；超过约 6000 字后保留最近四段并生成章内摘要，不能选择跨章伏笔。
4. `sourceRefs` 尚无正式 `outline-node`、`exploration-document`、`writing-unit` 类型。
5. Authoring facade 的 `outline` reader 只返回当前章前八项；`writing-chapter` profile 没有跨章结构关系。
6. 探索、续写、人物/场景推演和批注改写仍有多条候选/采纳路径。
7. 左右栏的滚动 owner、批注坐标 owner、详情锁定和光标跟随仍未完全统一。

### 4.3 可选外围现状

`writingNotes` 与 `narrativeAssets` 已有职责重叠；素材页的文字主卡、分类、归档和多卡舞台不构成文本工作台前置。素材真正不可替代的部分主要是图片/音频/文件资源、跨媒介来源和外部参考。纯文字速记、试写、正文候选可由探索文档直接承接。

画布已有 `assetId` 模式，但旧 `PROSE_*` 存储仍存在全局 project namespace 风险；在项目隔离完成前，不能让项目级大纲依赖画布真源。

## 5. 三种架构方案

### 方案 A：素材即草稿

探索文本先存 `narrativeAsset`，再加入大纲和正文。

- 优点：复用素材页与画布最多。
- 缺点：长文本编辑能力弱；素材成为必经路径；状态和来源语义混乱；违背文本工作台核心。
- 结论：淘汰。

### 方案 B：探索与正文两套编辑器/文档模型

- 优点：概念隔离直观。
- 缺点：两套 selection、ghost、批注、历史、IME、排版和迁移；长期必然漂移。
- 结论：淘汰。

### 方案 C：共享编辑器内核、不同文档角色

```text
WritingDocument
├─ role = exploration
│  ├─ 可不归章
│  ├─ 可有多个方案/视角
│  └─ 不产生 canonical scene fact
└─ role = manuscript
   ├─ 必属章节
   ├─ 线性顺序
   └─ 采纳内容构成正式事实
```

- 优点：复用完整编辑能力；探索可写一段也可写完整场景；AI 与人工写作同一位置；外围模块可选。
- 风险：必须在上下文和事务中严格区分 document role，防止探索内容被当作已发生正文。
- 结论：推荐。

## 6. 产品信息架构

### 6.1 一本书，一个文本工作台

```text
书籍标签页
├─ 构思
│  ├─ 快速落笔
│  ├─ 未编排探索
│  ├─ 大纲节点下的探索文档
│  └─ 搁置内容
└─ 正文
   ├─ 卷
   └─ 章节
```

“构思/正文”不是两个路由或页面模板，而是左侧文档树的两个集合。中央永远是同一个编辑面；切换文档只改变文档角色、标题语义和右侧上下文。

### 6.2 四个 UI 定位问题

- Narrative role：长期写作工作台，不是 dashboard、素材管理器或 AI chat。
- Viewing distance：笔记本/桌面长时间近距离写作；正文最大、辅助信息弱一档。
- Visual temperature：安静、编辑出版感、低装饰；不使用卡片堆和 AI 渐变。
- Capacity：中央编辑面优先；左栏只承担文档导航和短现场摘要；右栏按需显示当前目标详情。

### 6.3 左侧导航

左栏默认只显示当前书：

```text
构思
  快速落笔
  未编排 3
  石柱第一次响应
    莉娜视角
    艾德加视角
正文
  第一卷
    第一章　魔力异常
    第二章　旧港
当前场（紧凑摘要）
```

不显示素材分类、数据库字段、画布卡片或多层装饰计数。探索文档名由内容首行/作者标题派生，不显示“第几章”。

### 6.4 中央编辑面

探索与正文共享：

- 同一稿面宽度、字体、中文缩进和段距；
- 同一 writingUnit、split/merge/move；
- 同一批注、历史、恢复和 ghost；
- 同一键盘交互和 IME 门禁。

差异只通过低干扰上下文表示：探索文档标题旁显示“构思”，正文显示“第 N 章 + 章名”；探索 ghost 不提交 scene anchor，正文 ghost 可按事务提交。

### 6.5 右侧工具

固定工具轨不随正文滚动。内容分两态：

- contextual：随稳定光标更新当前场、大纲、设定、上下文；
- locked：编辑人物、现场、大纲节点或检查生成时锁定目标。

选区工具、块间入口、ghost 和批注锚点随正文定位；详情面本身固定。

## 7. 文档与大纲真源

### 7.1 最小探索文档合同

概念合同而非最终代码：

```js
{
  id,
  role: 'exploration',
  title,
  document,          // 现有 writingDocument schema
  outlineNodeIds: [],
  status: 'active' | 'adopted' | 'parked',
  sourceRefs: [],
  revision,
  createdAt,
  updatedAt
}
```

不在文档上固化 `angle/alternative/question` 等复杂类型。一个完整探索文档可以自由包含多种内容；作者需要比较时，由大纲 attachment 表达其在该节点的作用。

### 7.2 项目级大纲节点

```js
{
  id,
  title,
  intent,            // 简短叙事目的，不是探索全文
  parentId,
  order,
  status: 'exploring' | 'planned' | 'drafted' | 'fulfilled' | 'parked',
  chapterRefs: [],
  explorationRefs: [{ documentId, role, state }],
  entityRefs: [],
  sourceRefs: [],
  revision
}
```

`role` 首期只需要 `angle | alternative | fragment | support`；`state` 只需要 `unreviewed | considered | adopted | rejected`。这些是“此文档在此节点中的作用”，不是探索文档全局类型。

### 7.3 大纲关系

首期关系必须少：

- 层级与顺序：`parentId + order`；
- `causes`：前置因果；
- `foreshadows`：伏笔到兑现目标；
- `alternative`：互斥方案；
- `parallel`：并行人物线/视角。

人物、地点、事件使用 entity refs，不制造大量普通边。画布可以显示这些关系，但不拥有关系真源。

### 7.4 探索到正文

```text
选择探索文档或 writingUnit
→ 选择/确认目标大纲节点
→ 指定正文章节与插入位置
→ 构建目标位置 Context Manifest
→ 生成正文风格 ghost
→ 采纳后写入正文
→ 回执记录 exploration document/unit revision 与 outline node
```

不提供“把整个探索文档原样转成正文”的默认动作；作者可以显式复制，但 AI 主路径应依据现场和上下文重新组织为连贯正文。

## 8. AI 上下文模型

### 8.1 三条权威通道

| 通道 | 内容 | 模型语义 |
| --- | --- | --- |
| established | 目标位置之前的正文、当前场、世界书、accepted memory | 已经成立，必须遵守 |
| intended | 当前大纲节点、adopted 探索、scene move、作者钉选 | 希望实现，尚未发生 |
| speculative | 未选 alternative、AI 候选、搁置探索 | 只供比较，普通正文生成排除 |

三个通道不能只靠 prompt 标题区分；Context Ledger 每项都要携带 authority/reason/source revision。

### 8.2 Context Manifest 组成

一次正文生成默认按以下顺序取材：

1. 当前选区/unit、光标前若干 unit；
2. 当前 scene projection；
3. 当前大纲节点与 adopted 探索；
4. 大纲直接因果前驱、待兑现伏笔；
5. 当前人物/地点最近关键变化；
6. 前一章结尾与当前章摘要；
7. 作者钉选的章节/探索/参考；
8. 世界书和受控记忆；
9. 仍有预算时才纳入一般近期摘要。

日常只显示一行：“本次参考 8 项：前章结尾、莉娜人物线、石柱伏笔等”。展开后才能移除、钉选或查看排除原因。

### 8.3 按任务变化

- 探索多角度：当前大纲、相关设定、互斥方案优先；正文只提供事实背景。
- 正文续写：当前 scene、近文、adopted 探索、因果前驱优先。
- 对白：角色最近关系变化、声线证据和当前对话目标优先。
- 修订旧段：严格按目标稿件位置裁剪 established facts，后文只能作为显式 intended reference。
- 全书检查：使用全书摘要/索引，不沿用正文生成的窄窗口。

### 8.4 防未来泄漏

每个正文来源必须可解析到章节顺序与 unit 位置。目标位置之后的正文不得进入 established 通道；若作者明确引用后文，只能进入 intended，并在清单中显示“未来内容，仅作修订目标”。章节重排后 Context Manifest 的顺序 revision 失效，挂起生成必须 stale。

## 9. 场景排练与正文事务

此前专项结论保留，但放回文本主链：

- 纠正事实：立即写当前 unit anchor，不调用模型；
- 安排未来变化：只建立临时 scene move；
- 改写选段：冻结 selection/unit；
- 推演：统一 `target snapshot + established scene + intended context + optional move`；
- ghost：始终原位，失败/重试/过期占用同一几何；
- 采纳：正文和必要 scene delta 原子提交；
- 批注：作为推演约束，采纳后不自动删除。

探索文档中的推演永远不写 canonical scene anchor；它可保存一份“假设现场”作为 intended context，但不能污染正文现场。

## 10. 外围能力处理

### 10.1 速记

主动作改为：

- 追加到当前探索文档；
- 新建未编排探索文档。

保存为素材只保留为外部资源场景的次动作。

### 10.2 素材页

按删除测试拆分：

| 能力 | 去向 |
| --- | --- |
| 纯文字速记/试写/正文候选 | 并入探索文档 |
| 图片、音频、文件、网页参考 | 保留为项目资源库或附件 picker |
| 文字主卡编辑舞台 | 可删除 |
| 多卡装饰舞台/副阅读台 | 若无独特任务则删除 |
| 归档/拒绝/批量分类 | 只对真实资源保留，文字探索不强制经过 |
| 插入正文/设为续写参考 | 改为编辑器内引用动作 |
| 转世界书 | 保留为选区/探索文档动作 |

独立素材页是否最终保留，延后到文本闭环完成后用真实使用场景决定；本计划不以保护它为约束。

### 10.3 画布

画布是项目级大纲、探索文档、正文场景与资源的可选空间视图。卡片只保存对象引用与布局；大纲关系由大纲 owner 持有。先完成 project namespace，再接文本对象，不重写 pan/zoom/edge 内核。

### 10.4 记忆

继续作为不可见的受控派生层。它可推荐旧章节事实和关系，但不显示成探索卡片、不自动转大纲、不绕过 Context Manifest。

### 10.5 Experience

只复用 NarrativeKernel、状态投影、行动/对白建议、emergence 与机制约束。输出可以新建探索 writingUnit 或 scene move；不嵌入聊天 transcript/session picker/online host/demo 壳。

## 11. 中文稿面与视觉原则

- 章节标题使用“第 N 章 + 章名”，移除 `01`；探索标题不伪装章序。
- 标题属于白色稿面内容列。
- prose/dialogue 默认 `2em` 首行缩进；标题/列表/引用例外。
- writingUnit 是事务边界而非可见卡片；unit 内外段落节奏一致。
- ghost 复用正式 node/style，无额外 margin。
- 左右 chrome 与中央背景色差小，正文仍以微弱 surface 区分；不做多层卡片。
- 当前行、unit、世界书匹配、批注、ghost 同屏最多一个主强调。
- 左右栏固定；只有选区工具、块间入口、ghost、批注锚点随正文定位。

## 12. 迁移策略

### 12.1 旧章纲

- 无 `assetId`：保留 item ID，转项目级 node，映射原章节。
- 与素材内容相同：node 保留 intent 摘要并引用素材，不复制全文。
- 与素材已分叉：保留章纲内容，标记迁移冲突；不自动覆盖任一方。
- 迁移必须可重入，失败保留旧 `outlineItems` 读取兼容。

### 12.2 旧速记/文字素材

不做启动时全量破坏性迁移。首次从“构思”打开时通过兼容 reader 展示；作者选择“转为探索文档”才建立新文档和来源回执。重复转换按 sourceRef 幂等。

### 12.3 画布

先完成 book/project namespace。旧 asset card 保持原样；只有用户将探索文档/大纲节点送入画布时创建新的引用卡。不得把全部旧卡自动推断成大纲。

## 13. 代表性作者流程

### 顺序型作者

新建第一章直接写正文；当前场与自动联想照常工作。构思区不强迫使用，大纲可从正文派生候选供审阅。

### 多人物线作者

先建“石柱响应”节点，写莉娜/艾德加两个探索文档；在大纲中标记 parallel/alternative，选择莉娜方案映射第五章。正文生成读取莉娜方案和艾德加已发生关系，但不读取被拒绝的情节事实。

### 大量探索后收束作者

快速落笔建立多个未编排探索文档；稍后批量拖到大纲节点。未采用内容保持可搜索但默认不进入正文上下文；选中节点后从 adopted 文档生成正文 ghost。

### 回头修订作者

在第三章修改旧段；Context Manifest 按第三章目标位置裁剪 established facts，第十章揭晓只在作者钉选后作为 intended 出现，避免未来泄漏。

## 14. 成功标准

1. 不使用素材页也能完成“快速落笔 → 多角度探索 → 大纲取舍 → 正文采纳”。
2. 探索与正文使用同一编辑器能力，无两套 IME、ghost、批注和历史。
3. 一个探索文档可暂不归章，也可被多个大纲节点引用。
4. 未选 alternative 不进入普通正文生成。
5. 用户能看到跨章上下文纳入原因，回到前文不会泄漏未来事实。
6. 画布、素材、记忆和 Experience 任一缺失时，文本主闭环仍成立。
7. 采纳 ghost 后正文、scene delta、大纲来源回执一致；丢弃和 stale 零写入。
8. 长章滚动、中文缩进、标题和左右栏视觉达到作家助手级稳定性，而非卡片后台。

## 15. 明确不做

- 不创建素材驱动的草稿系统；
- 不创建第二套探索编辑器；
- 不把大纲做成任意知识图谱；
- 不默认把完整旧章或全部探索塞给模型；
- 不把 AI 自动生成内容当作 adopted；
- 不为了复用而保留无独特价值的素材页 UI；
- 不一次重写整个 Authoring 页面；
- 不在原型和小切片后反复跑全量测试。

## 16. 最终判断

Pinax 的核心不是“世界构建、素材、写作、画布的功能集合”，而是一套能把作者非线性思考逐渐收束为线性正文的文本工作台。它的创新点应是：

> 作者可以在同一个高质量编辑器里自由探索，从大纲和世界状态获得结构帮助，清楚控制 AI 看见哪些事实与意图，再把满意的排练原位采纳成正文。

外围功能只有在缩短这条路径时才值得存在。
