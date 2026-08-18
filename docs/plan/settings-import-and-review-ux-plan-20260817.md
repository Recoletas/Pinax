# 世界书与设定工作区：创建、资料提炼与 AI 审阅重构计划

> 日期：2026-08-17
> 状态：代码侧 U1-U7 已完成；待真实环境门禁（真实 provider 3×3、真实 revision stale/cancel、真实 quota 与 20MB PDF 设备性能）
> 归属：`docs/PLAN.md` 的 G1.2 / G1.2.2；正式世界书仍由现有 worldStore 持有，不建立第二套 AI 生成链或视觉主题
> 范围：世界书首页、可恢复创建工作区、多文件资料暂存、基础基调、渐进式详细提炼、统一草稿审阅、桌面与移动端布局

## 1. 结论

本轮不能继续在 `WorldBookEditor.vue` 的“新建 / 导入”标签里追加 PDF 上传按钮，也不能只给被遮挡按钮补 `z-index`。当前问题来自信息架构、状态归属和布局策略同时失衡：

1. 用户进入“快速导入”后先看到预设英雄区，真正的小说提炼与 AI 基调又跳到“高级”的第六个标签；入口名称与实际任务不一致。
2. 设定页同时存在 AppShell 标题、页面标题、四项设定导航、世界书选择器和工作区内部标签；同一层级被重复表达。
3. 生成前后不是同一个稳定界面。`pendingImport` 在表单下方临时插入预览，结构化草稿又会同时打开右侧审阅栏和底部草稿抽屉，导致按钮移动、内容收窄和滚动位置变化。
4. “小说片段提炼”只接受 textarea；项目虽已保存 `sourceDocuments`，却没有通用文件读取管线，也没有 PDF/DOCX 解析依赖。
5. 当前主题 2 已经尝试把字段卡改成连续文稿，但外围仍大量使用带框按钮、卡片、胶囊状态和多层容器，语言不统一。

目标不是做一个通用文档管理平台，而是把产品分成三个职责明确的阶段：

```text
世界书首页
  ├─ 已有世界书 -> 打开设定或进入体验
  ├─ 选择预设 -> 幂等创建预设副本 -> 绑定新会话 -> 进入体验
  └─ 新建世界书 -> 创建工作区
                       ├─ SillyTavern / Pinax JSON -> 确定性预览与导入
                       ├─ 多文件 / 粘贴文本 -> 来源暂存与文字抽取
                       └─ 一句构思 -> 直接生成基础基调草稿
                                            ↓
                                  确认世界书骨架
                                            ↓
                                  详细设定工作台
                                            ↓
                         按分区提炼 -> 审阅 -> 采纳正式条目
```

“暂存”必须区分两种状态：

- **来源暂存**：用户导入的文件、抽取文字、页码/章节定位和解析 warning；可以在世界书尚未创建时恢复。
- **AI 候选草稿**：基础基调、分区字段和条目候选；采纳前不得写入正式 worldbook owner。

这两个状态不能继续混在 `pendingImport` 一个页面变量里。

## 2. 当前实现审计

### 2.1 页面和路由

| 当前界面 | 实际职责 | 主要问题 |
|---|---|---|
| `/settings/worldbook` | 预设、当前世界书、三个跳转入口 | 名为快速导入但不直接导入；已有世界书时仍长期展示预设英雄区 |
| `/settings/structured` | 结构化字段、分区 AI、草稿审阅 | 页面级标题与 AppShell 重复；生成后主区从两列变一列并插入 sticky 审阅栏 |
| `/settings/worldbook/advanced` | 基础设定、结构化设定、导入导出、分组、条目、新建/导入、维护 Agent | 一个页面承担六种任务；左侧世界书列表与顶部世界书选择重复 |
| `/settings/world-map` | 地图与历史相关工作 | 本轮只统一顶部上下文，不重做地图主体 |

关键代码证据：

- `WorldBookQuickImport.vue` 只有三个路由跳转，文件提炼实际在 `WorldBookEditor.vue`。
- `WorldBookEditor.vue` 的 `editorTabs` 包含六项，“结构化设定”与独立结构化路由重复。
- `StructuredSettingsPanel.vue` 在 `focusedDraft` 出现后把编辑区改成 `1.5fr + 360px`，1100px 以下又把审阅区放回长字段列表之后。
- `StructuredSettingsPanel.vue` 同时保留 `SettingDraftReview` 和 `draft-drawer` 两套草稿入口。
- `createSourceDocument()` 当前只保留每份资料前 120000 字且最多 8 份；完整小说或多份 PDF 会丢失后半部分。`settingFieldGeneration.js` 已能按来源片段检索，但长期正文仍挤在 worldbook localStorage，缺少适合大资料的来源暂存 owner。

### 2.2 真实页面检查

初始审计曾在 `/settings/worldbook`、`/settings/structured` 的 1440px 与 390px、regular 与 long 状态发现入口拥挤、重复导航和生成后控件远离正文的问题；这些记录保留作为本轮重构的动机，不作为当前完成证据。

当前复验使用现有服务覆盖 `/settings/worldbook/create`、`/settings/structured` 与 `/settings/worldbook/advanced` 的 1440/1024/390px，以及 regular/loading/partial/error/stale/cancelled 状态，共 33 captures：0 console error、0 a11y failure、无横向溢出和不可达主动作。审计实际触发了 JSON 文件预览、混合文件部分成功、结构化生成失败、生成中、编辑导致 stale 和点击停止导致 cancelled；不是只注入空态截图。

当前仍不由本地 UI audit 代替的门禁：真实 provider 3×3、真实模型响应下的 revision stale/cancel、真实 IndexedDB quota，以及 20MB 文本型 PDF 在实体移动设备上的滚动/取消耗时。没有凭据或设备时，loopback fixture 只能验证请求协议、鉴权头和状态渲染，不能标记 release ready。

## 3. 外部产品与技术依据

### 3.1 来源导入

- NotebookLM 把 PDF、DOCX、TXT、Markdown、ePub 等都视为“来源”，来源先进入可选择的 Source panel，再参与生成；它也明确说明导入的是来源副本而不是修改原文件。Pinax 应采用“资料先入库、生成再选用”的关系，而不是上传即写世界书。[NotebookLM 来源说明](https://support.google.com/notebooklm/answer/16215270?hl=zh-Hans)
- PDF.js 可在浏览器通过异步 document/page API 逐页解析 PDF，并提供 `getTextContent` 所需的文字项和方向信息；适合 Pinax 的本地优先架构。[PDF.js 示例](https://mozilla.github.io/pdf.js/examples/)、[PDF.js API](https://mozilla.github.io/pdf.js/api/)
- Mammoth 支持浏览器 `ArrayBuffer` 输入和 `extractRawText()`，每段保留空行；其文档同时警告不可信 DOCX 的 HTML 转换需要清洗并可能有异常性能。第一阶段应只读取 raw text，并放在 Worker 中设置超时，不渲染 DOCX 生成的 HTML。[Mammoth 浏览器 API 与安全说明](https://github.com/mwilliamson/mammoth.js/blob/master/README.md)

### 3.2 AI 交互

Microsoft HAX 强调：AI 产品应在设计阶段明确系统行为、失败方式和恢复路径，并用可审阅的模式帮助用户校正结果。对 Pinax 的直接含义是：生成按钮不能在成功后变成新的操作树，草稿必须进入统一审阅区，失败必须保留输入与已成功草稿。[Microsoft HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/)

本轮只吸收这些交互原则，不复制 NotebookLM 或 Microsoft 的视觉样式。

## 4. 产品边界

### 4.1 统一来源原则

原始文件只是输入载体；Pinax 长期消费的是规范化文字、来源定位和解析报告。所有文档 adapter 输出同一 `SourceArtifact`，AI 不直接读取文件二进制。

```text
原始文件
  -> 格式 adapter
  -> 规范化文字
  -> 页码 / 章节 / 幻灯片 / 时间点定位
  -> 来源暂存
  -> 检索、去重、压缩与设定提炼
```

例外是 SillyTavern / Pinax JSON：它本身已有有价值的结构，必须保留结构化解析结果，同时生成一份只用于 AI 检索的文字投影，不能先压成普通文本再让模型猜回条目。

### 4.2 第一阶段支持

| 来源 | 处理方式 | 保留信息 |
|---|---|---|
| 粘贴文本 | 现有 textarea，改为“粘贴资料”入口 | 标题、正文、字符数 |
| `.txt` / `.md` | `File.text()`，检测 UTF-8 与常见 BOM | 文件名、正文、段落 |
| 文本型 `.pdf` | `pdfjs-dist` Worker 逐页 `getTextContent()` | 文件名、页数、页码到正文 offset 的定位表 |
| `.docx` | Mammoth `extractRawText({ arrayBuffer })` | 文件名、正文、解析 warning |
| SillyTavern / Pinax JSON | 继续走现有 JSON 预览和 schema 归一 | 世界书字段、条目、分组、来源元数据 |

第一阶段允许一次选择多个文件。每份文件独立解析、取消、失败和重试，一个损坏文件不能清空其他成功结果。

### 4.3 后续 adapter

- EPUB：按章节抽取正文并保留章节定位。
- PPTX：按幻灯片抽取标题、正文和备注。
- 图片与扫描 PDF：通过独立 OCR adapter 生成文字并保留置信度；没有 OCR 能力时只标记 `needs-ocr`。
- 音频与视频：通过转写 adapter 生成文字并保留时间点；不进入第一阶段。

这些 adapter 只扩展来源读取，不改变后续暂存、去重、检索和审阅合同。

### 4.4 明确延期

- 扫描 PDF OCR：首版只检测“有页面但几乎无文字”，显示“该 PDF 可能是扫描件，需要 OCR”，不静默生成空设定。
- EPUB、PPTX、图片 OCR、音视频转写和网页 URL：adapter 合同先冻结，实现等 PDF/DOCX 流程稳定后按真实需求排序。
- 云端文件同步、文件夹监控和自动重导入：超出当前本地优先 source archive 的范围。
- 默认保存原始 PDF/DOCX 二进制：首轮只在解析期间临时持有文件，长期保存抽取文字和定位；以后若支持“保留原件”，必须由用户显式选择并单独计算 IndexedDB 配额。
- 向量数据库：继续复用现有分段、关键词和世界书 matcher；本轮不引入 embedding 服务。

## 5. 新的信息架构

### 5.1 世界书首页

`/settings/worldbook` 回归为纯选择入口，不承担详细编辑：

- 已有世界书：进入体验或打开设定；
- 预设世界书：主动作直接进入体验；
- 新建世界书：进入创建工作区；
- 导入 JSON：也进入创建工作区，但默认打开结构导入模式。

选择预设时调用现有 preset signature 幂等逻辑：若已有对应副本则复用，没有才创建；随后设为 active worldbook、创建与之绑定的新会话并进入体验。预设卡不在已有世界书的详细设定页重复出现。

### 5.2 创建工作区

新建不再跳到高级页第六个标签，而是进入一个可恢复的 `WorldbookCreationWorkspace`。页面只呈现三种起点：

1. **添加资料**：多文件、拖放、文件选择或粘贴文本；
2. **导入已有结构**：SillyTavern / Pinax JSON；
3. **从一句构思开始**：没有文件也能生成基础基调。

创建工作区本身不是正式世界书。它自动保存来源暂存、输入、解析状态和基调草稿；刷新或离开后可以继续。只有用户确认基础基调或 JSON 预览时才创建正式世界书。

页面采用稳定三段而不是复杂 stepper：

```text
资料
  多文件队列 / 粘贴 / JSON 预览

基础基调
  世界概述 / 题材 / 视角 / 文风 / 禁写 / 核心约束

确认
  创建世界书并进入详细设定
```

### 5.3 详细设定工作台

正式世界书创建后进入详细设定：

```text
SettingsContextBar
设定 / 地图 / 条目
来源带：资料数量、解析状态、参与本次提炼的选择、添加资料
世界观 / 故事核心 / 角色 / 创作规则
连续字段编辑面
唯一 ReviewDock
```

`SettingsContextBar` 只承担当前世界书选择、来源/待审状态、添加资料和更多菜单。移除子页面自己的返回按钮、重复 H1、新建按钮和第二套世界书列表。

详细设定的一级入口收为：

1. **设定**：来源、结构化字段和渐进提炼；
2. **地图**：现有地图与历史空间工作区；
3. **条目**：高级条目、分组和导入导出管理。

“基础设定”并入设定页顶部；高级页不再重复结构化设定和新建/导入。旧 route name 先兼容，组件迁移后再 redirect；正式 worldbook schema 维持兼容。

来源带默认只显示“12 份资料 · 2 份参与本节 · 3 项待审”，展开后查看每份来源、抽取文字和定位，不为每份资料套大卡片。

## 6. 多格式资料导入方案

### 6.1 数据契约

正式世界书仍由 worldStore/localStorage 持有；创建草稿和长来源正文使用一个受限 IndexedDB source archive。它不是第二份世界书，只负责可恢复输入和可检索来源。

```js
CreationWorkspace {
  id,
  mode,              // sources | structured-import | brief
  name,
  sourceIds,
  sourceFailures,
  foundationDraft,
  status,
  generationState,
  generationAction,
  generationErrorCode,
  generationMessage,
  sourceParseMetrics,
  createdAt,
  updatedAt
}
```

每个 adapter 统一产出：

```js
SourceArtifact {
  id,
  title,
  kind,              // pasted-text | text-file | markdown | pdf | docx | ...
  sourceLabel,
  originalLength,
  createdAt,
  file: {
    name,
    mime,
    size,
    hash,
    pageCount
  },
  chunkIds,          // 正文 chunk 是 IndexedDB 独立记录，不重复塞进 metadata/worldbook
  locators: [
    { offset: 0, page: 1, label: '第 1 页' }
  ],
  warnings: [],
  extractionStatus
}

SourceChunk {
  id,
  sourceId,
  text,
  normalizedHash,
  startOffset,
  endOffset,
  locatorRefs
}
```

正式 worldbook 只保存：

```js
sourceDocuments: [{
  id,
  title,
  kind,
  sourceLabel,
  originalLength,
  contentPreview,
  archiveRef,
  fileSummary,
  warnings,
  createdAt
}]
```

兼容规则：旧 `reference-text.content` 读取时自动注册为单一 archive source；现有生成链在迁移完成前仍可读取短 `content`，随后统一通过 source repository 取得预算内 chunks。导出项目时可选择包含抽取文字，不默认包含原始二进制。

### 6.2 读取管线

新增统一 registry，而不是在 Vue 组件里按扩展名写分支：

```text
File
 -> validateFile(name, mime, size)
 -> hash + duplicate check
 -> adapter.canRead(file)
 -> Worker extract(file, AbortSignal, onProgress)
 -> normalize paragraphs / page breaks
 -> segment + exact chunk hash
 -> quality check
 -> preview SourceArtifact
 -> save to creation/source archive
 -> user confirms foundation
 -> create worldbook with source refs
```

当前代码边界已收敛为：

- `src/services/worldbookSourceArchive.js`：IndexedDB creation workspace、artifacts、chunks 与 archiveRef；不保存世界书正式字段。
- `src/services/worldbookSourceAdapters.js`：TXT/MD、PDF、DOCX adapter、校验、归一和 typed error。
- `src/services/worldbookSourceParser.js`、`src/services/worldbookSourceParser.worker.js`：解析、取消、超时和逐文件进度。
- `src/services/worldbookSourceSelection.js`：按 source IDs、locator 和预算给现有生成链返回 chunks，并在上下文层做精确去重。
- `src/pages/WorldbookCreationWorkspace.vue`：拖放、文件选择、粘贴、来源队列、基础基调和 JSON 确认流程；没有再拆出一套平行 SourceImportPanel/Queue。
- `src/services/settingFieldGeneration.js`：结构化字段/分区请求前按 archive refs 恢复完整 chunks。

### 6.3 去重、检索与压缩的边界

三者共享标准化、分块、hash、来源定位和字符预算，但职责不同：

```text
解析
 -> 标准化与分块
 -> 精确去重
 -> 按当前设定分区检索
 -> 必要时压缩
 -> AI 提炼候选
 -> 同名候选聚合与冲突审阅
```

第一阶段只做低风险去重：

1. **文件级精确去重**：`file hash + size` 命中时提示复用已有来源，不重复保存。
2. **chunk 级精确去重**：规范化空白、页眉页脚后计算 hash；生成上下文只发送一次，保留全部 `sourceRefs`。
3. **候选同名提示**：按 `entryType + normalized name + aliases` 聚合“可能重复”，只提示用户，不自动合并。

第一阶段不做 embedding 相似度、LLM 自动判重、自动合并角色卡或跨来源冲突裁决。相近陈述可能是时间变化或立场冲突，不能当重复删除。

压缩发生在精确去重和检索之后，只压缩本次分区预算内的候选 chunks；输出必须保留每条摘要对应的 source IDs 与 locator。体验页的会话上下文压缩状态机不能直接复用，因为它不承担页码、章节和多来源证据保留。

### 6.4 质量与安全

- 读取在浏览器完成；只有用户明确点击“提炼为设定草稿”后，现有结构化生成链才发送预算内摘录。
- DOCX 只取 raw text，不插入 Mammoth HTML；`externalFileAccess` 保持关闭。
- PDF 按页串行或有限并发，随时可取消；异常文件不能阻塞主线程。
- 对 MIME 与扩展名交叉校验，但兼容浏览器缺失 MIME；失败返回 `unsupported-type / too-large / encrypted-pdf / no-extractable-text / parse-timeout / quota-exceeded`。
- 同一文件用 `hash + size` 提示复用，不静默覆盖；相同 chunk 合并来源引用，不删除来源记录。
- 不再默认只保留文件前 120000 字。长资料完整分块进入 IndexedDB；单次模型请求仍执行现有上下文预算和相关片段选择。
- 写 IndexedDB 和 localStorage 前分别预估增量；quota 失败时保留内存预览并允许导出文字，不破坏正式世界书。
- creation workspace 有数量、总字符和存储预算；不因为支持多文件变成无上限文件仓库。

## 7. 创建与提炼流程

### 7.1 预设与结构化导入

- 预设不是待审草稿。选择预设后幂等创建/复用世界书副本，直接绑定会话并进入体验；“查看设定”只作为次级动作。
- SillyTavern / Pinax JSON 先做确定性 schema 解析、条目统计和冲突预览，用户确认后直接创建世界书；AI 只在用户之后选择“整理/审查”时介入。
- JSON 解析失败不得静默转成普通文本提炼，避免丢失注入规则、关键词、分组和条目结构。

### 7.2 多文件来源暂存

导入面板使用稳定三段，不在页面底部追加新区域：

1. **添加**：一次选择多个文件、拖放或粘贴文字。
2. **检查**：独立队列显示解析进度、字符数、页数/章节、warning、重复状态；右侧或全屏预览抽取文字。
3. **决定用途**：保存到创建工作区，选择参与基础基调的来源；失败文件可单独重试或移除。

一个 PDF 失败不能清空已解析 DOCX；重复文件只提示复用；用户离开后 creation workspace 自动恢复。

### 7.3 基础基调

第一次模型任务只建立世界书骨架，不一次生成几十个正式条目：

- 建议名称；
- 一段世界概述；
- 题材与时代；
- 叙事视角、语言与情绪基调；
- 核心创作约束；
- 禁止事项；
- 可能涉及的人物、地点、势力名称索引。

最后一项只是后续详细提炼的导航索引，不生成完整角色卡、地点条目或历史线。用户可以修改基础草稿，确认后才创建正式世界书骨架并挂接 source refs。

生成前主按钮固定为“生成基调草稿”；生成中同一槽位变为停止；成功只打开统一 ReviewDock，不在表单尾部追加“创建并进入”按钮；失败保留输入和来源选择。

### 7.4 长短资料的自适应路径

不按固定字符数把所有来源一次塞给模型：

| 输入规模 | 基础基调 | 详细提炼 |
|---|---|---|
| 短文本 | 使用全文或预算内全文 | 按分区一次生成 |
| 中等资料 | 标题、开头、结尾与分布式代表片段 | 按分区检索相关 chunks |
| 长篇/多文件 | 本地索引后选择跨章节代表片段；明确显示覆盖范围 | 用户进入分区时按需扫描相关 chunks，批次提取候选后聚合 |

第一阶段不用 embedding。相关 chunks 由标题、章节、关键词、已确认名称、entry type 与 locator 评分选择；低相关来源不进入请求，但仍保存在 archive。

### 7.5 详细设定的多次模型调用

多次调用按“分区一致性”组织，不能默认每个字段单独调用：

```text
当前分区 + 已确认世界书骨架
  -> 检索相关去重 chunks
  -> 必要时分批提取 typed candidates + source refs
  -> 本地按 type/name/alias 聚合
  -> 一次分区综合生成
  -> 有效字段进入 ReviewDock
  -> 仅失败字段或用户点名字段进行一次修复/重提炼
```

默认分区：

- 世界观：起源、力量体系、地理、势力和规则；
- 故事核心：历史、当前矛盾、故事线和未决问题；
- 角色：人物候选、关系、目标和说话方式；
- 创作规则：视角、文风、基调、禁写和一致性边界。

分区级请求让相互依赖字段共享同一批资料与同一世界书 revision。字段级请求只用于校验失败、用户局部意见、明确重做或补充来源，不允许无界逐点自动调用。

对于长篇来源，“批次提取”只产生受限候选事实，不直接写 worldbook；同名候选显示全部来源和潜在冲突，用户采纳后才生成/更新正式条目。

### 7.6 创建工作区空状态

没有导入资料时只给三个直接选择：

- 添加已有资料；
- 用一句梗概建立基调；
- 从模板开始。

模板不再常驻占据已有项目首屏；它只在世界书首页和创建空状态出现。

## 8. 唯一 AI 草稿审阅区

### 8.1 状态归属

删除 `StructuredSettingsPanel` 底部 `draft-drawer`。所有草稿只通过一个 `SettingReviewDock` 访问：

- 字段上的小状态点表示“有待审草稿”，点击后在 ReviewDock 定位该字段；
- 分区顶部只保留一个“补全本节”动作，成功后仍在原位显示“6 项待审”；
- 不在字段卡、分区底部或页面尾部再插入新的采纳按钮；
- 草稿队列、当前草稿、差异、修改意见和采纳动作都在同一个区域。

### 8.2 布局

- `>= 1200px`：右侧 400-440px dock。打开时主字段区只从两列变为一列一次；dock 头部和底部动作 sticky，正文独立滚动。
- `760-1199px`：右侧 overlay sheet，不改变字段宽度；有明确关闭按钮和 Esc。
- `< 760px`：全屏 sheet，从底部进入；使用浏览器安全区，返回后恢复原字段与滚动位置。

ReviewDock 的固定底部只保留：`采纳` 主动作、`丢弃` 文本动作、更多菜单中的复制/导入体验。上一版、下一版放在草稿标题旁，不和采纳动作混在一排。

### 8.3 生成状态

统一状态机：

```text
idle -> preparing -> generating -> validating
     -> ready | partial | error | cancelled | stale
```

- `partial` 直接显示成功字段和失败字段，不把成功草稿隐藏到抽屉。
- `stale` 只阻止采纳，不销毁内容；用户可以复制或基于当前设定重新生成。
- 取消、超时、限流、渠道不支持、结构校验失败使用不同文案。
- 成功提示不常驻占位；待审数量进入 ContextBar 和字段状态。

## 9. 视觉与控件规则

本轮沿用主题 2 的冷白纸面、浅蓝信号色、等高线和点阵语言，不切回主题 1，也不复制其他产品配色。

1. 页面区块以连续底面和细分隔线组织，不再给资料、字段、状态、预览逐层套卡片。
2. 同一操作组只允许一个实色主按钮；普通动作使用图标或文字按钮，危险动作仅在更多菜单/确认层出现。
3. 分区切换使用下划线/色条，不使用每项描边矩形；AI 状态用小型状态文本，不再生成胶囊堆。
4. 删除 `transition: all`，只过渡颜色、位移和 opacity；支持 reduced motion。
5. 中文按钮不设固定宽度。使用 `min-height`、水平 padding 和必要换行；窄屏长文案改短标签，不缩放字体。
6. 等高线只放在页面背景和空状态，不进入输入框或草稿正文后方，保证长文可读。
7. 资料和 AI 草稿都使用来源图标、状态色条与文本层级区分，不用不同颜色的大面积卡片。

明确删除或降级：

- 已有世界书页面中的常驻大英雄区；
- 页面内部重复的返回体验、返回快速导入和 H1；
- 高级页中的“结构化设定”和“新建 / 导入”重复标签；
- 左侧世界书列表与顶部选择器二选一，保留共享 ContextBar；
- 结构化草稿底部 drawer；
- 生成后插入表单尾部的第二组主按钮；
- 字段类型胶囊和无实际操作价值的说明文字。

## 10. 响应式与可访问性

### 桌面

- 唯一纵向滚动容器是页面主体；ReviewDock 自己滚动，不让 sticky footer 被外层裁切。
- 生成前后页面标题、分区栏和生成按钮坐标不变。
- 主区最小宽度 640px；不足时自动切 overlay，不强压双列字段。

### 移动端

- ContextBar 单行：返回、世界书名、更多；资料数量和待审数量进入更多 sheet。
- 一级设定导航最多三项横向滚动；结构分区可滚动，但当前项自动进入视野。
- 文件导入使用系统 file picker；拖放只是桌面增强，不作为唯一入口。
- 生成/导入任务离开 sheet 后仍有轻量状态入口，不弹出遮挡页面的临时按钮。
- sheet 打开时锁定背景滚动，关闭后恢复触发按钮焦点与原滚动位置。

### 键盘与读屏

- 上传进度和生成终态通过单一 `aria-live=polite` 区域播报，逐页进度不刷屏。
- tab 顺序遵循 ContextBar -> 资料 -> 分区 -> 当前字段 -> ReviewDock。
- 所有 icon button 有 `aria-label` 和 tooltip；状态不能只靠颜色。

## 11. 实施阶段

### U0：冻结状态与真实 fixture（0.5 天）

- 为世界书首页和创建工作区增加 `preset-ready / creation-empty / creation-restored` 状态，覆盖预设直达体验与未完成创建恢复。
- 为设定 audit 增加 `empty / source-processing / source-ready / generation-ready / generation-partial / generation-error` 状态。
- 记录 1440、1024、390 三个宽度的首屏、滚动容器、ReviewDock 和底部动作位置。
- 使用脱敏 PDF、DOCX、TXT、Markdown 各一份；PDF 再加扫描件与加密件。

退出条件：能稳定复现“生成后动作被遮挡/远离内容”和“移动端顶部过密”，不以普通空态替代。

### U1：创建草稿、来源合同与存储边界（1-1.5 天）

- 冻结 `CreationWorkspace / SourceArtifact / source ref / chunk / locator` 合同和 typed error。
- 增加 IndexedDB source archive；worldStore 只保存正式设定与 source refs。
- 旧 `sourceDocuments.content` 兼容注册为 archive source，不要求用户迁移。
- 明确 creation workspace 恢复、删除、配额失败和项目导出行为。

退出条件：刷新后能恢复尚未创建世界书的资料和基调草稿；长来源不会因 worldbook localStorage 写入失败而破坏正式数据。

### U2：多文件解析与最低限度去重（1.5-2 天）

当前进度：TXT/MD、PDF、DOCX 的统一解析与 Worker 边界已接通；本轮补齐来源归档的 64MB 总容量估算、quota 错误归一、跨工作区正文 hash 复用、chunk 引用安全回收和“清理未引用资料”入口。创建页现在可以中止本地解析，Worker 与无 Worker 降级路径都把 AbortSignal 传到逐页/逐文件 adapter，文件队列按文件显示读取进度并在完成后替换为正式归档或错误项，成功来源与失败项彼此隔离。PDF 密码保护、PDF 损坏和 DOCX 损坏已归一为可操作错误码；parse-timeout 现在会同时 abort 底层解析信号，PDF loading task 也做 best-effort destroy；合同测试已走通实际 PDF.js 与 Mammoth raw-text 路径。解析结果现在额外记录每文件耗时/慢任务标记，Worker 与主线程降级路径统一回传批次总耗时、最大单文件耗时和慢文件索引，并保存到 creation workspace；阈值只用于诊断，不作为不同设备的发布门槛。quota 失败时解析结果保留为“仅本页”资料，支持展开预览与导出文字；确认正式世界书前会再次尝试归档，归档仍失败则阻止提交，不写入失效的 `archiveRef`；worldStore 的正式世界书/条目写入也会检查 localStorage 失败并回滚新建或导入的半成品。扫描件 OCR、加密/损坏文件的真实浏览器样本和 20MB 级 PDF 设备性能仍需真实文件验收。

补充实现证据：正式世界书加载时保留 `archiveRef/chunkIds/contentHash`，旧版未归档 `sourceDocuments` 会惰性注册到 source archive；批量归档与单文件入口共用正文 hash 复用和容量预检，复用时为每个逻辑来源补充 chunk `sourceRefs`。创建工作区的粘贴入口也会在 quota 失败时降级为“仅本页”。

- 接入 TXT/MD、`pdfjs-dist` 与 Mammoth raw text adapters，放入 Worker，支持多文件、取消和独立进度。
- 建立抽取预览、扫描/加密/损坏识别、重复文件复用和 quota 失败恢复。
- 实现文件 hash、规范化 chunk hash 和候选同名提示；不做语义自动合并。
- JSON 继续沿用现有结构化导入器，不并入普通文本 adapter。

退出条件：四种文本来源能进入同一 archive；相同文件不重复保存，相同 chunk 在模型上下文只出现一次且保留多来源引用；解析过程无网络请求。

### U3：世界书首页与创建工作区（1-1.5 天）

当前进度：世界书首页已完成首轮视觉重排，保留现有预设幂等进入、世界书切换、结构化设定和创建工作区路由；当前世界书作为主区展示，切换/创建作为侧栏动作，预设改为无卡片阴影的索引网格。创建工作区已将步骤编号替换为图标并收紧顶部间距，资料队列、JSON 确定性预览和基础基调逻辑已接通；JSON 待确认状态现在展示条目、分组、类型、触发词、注入参数和前五条内容，确认动作归在预览末尾，不再重复出现在移动端进度摘要。移动端摘要收敛为名称、三项进度与本地归档上下文，资料投放区提前可见。创建工作区新增统一生成状态机，资料解析可落到 ready/partial/error，基础基调与 JSON 解析显示准备/生成/校验/待确认/失败状态；刷新时会把中断中的任务恢复为已停止，并保留失败来源摘要。1440/1024/390 的 JSON、混合文件部分成功、生成中和生成失败真实审计均通过。高级页旧“新建 / 导入”分区与重复 AI 链已删除，创建职责统一归属此工作区。

- 世界书首页只保留已有世界书、预设、新建和结构导入入口。
- 预设幂等创建/复用并直接进入绑定体验会话。
- 新建进入 `WorldbookCreationWorkspace`；用 `SourceImportPanel` 替换高级页里上下堆叠的小说提炼与 AI 基调。
- JSON 使用确定性预览；普通来源进入多文件暂存；一句构思可跳过文件。

退出条件：预设一条主路径进入体验；新建、JSON 和多文件三条路径不再经过高级页第六个标签；失败、取消和返回均保留 creation workspace。

### U4：基础基调与渐进式详细提炼（1.5-2 天）

当前进度：来源选择、分区检索、`setting-candidates.v1` 受限事实候选和候选审核首轮已接通。候选现在会校验来源 ID，只保留当前资料集中的引用；审核区按 `entryType + name + aliases` 做同名提示，但保留每条候选的正文、证据和来源，不自动合并。候选提取失败会在同一审核区显示原因，分区正文仍可继续审阅；详细设定页已补齐分区生成的 pending/partial/error/aborted/stale 状态、失败项重试、请求取消、AbortSignal 透传和旧响应隔离。浏览器审计已实际覆盖 stale（生成期间编辑表单）与 cancelled（点击同一动作停止）两种 UI 状态；真实模型渠道下的 stale/cancel 与 provider 3×3 仍待有凭据环境专门验收。

补充实现证据：来源选择会把跨资料的相同片段合并为一个上下文块，同时保留所有来源定位；结构化字段、候选和分区生成请求会在发送前按 archive refs 恢复完整 chunks，再按分区预算筛选，不再只依赖世界书中保存的短预览。长来源尾部内容已有合同测试覆盖。

- 基础任务只生成世界书骨架和实体名称索引，确认后才创建正式 worldbook。
- source repository 按输入规模选择代表 chunks；详细分区按需检索，不全量发送来源。
- 分区生成复用现有 structured endpoint：正常一次分区请求，最多一次失败字段修复。
- 长来源先按批次抽取 typed candidates，再本地聚合同名项和来源，不直接写条目。

退出条件：短、中、长三类 fixture 均不会一次请求完整来源；未采纳基调、候选和分区草稿不修改 worldbook；调用次数有界且可取消。

### U5：统一 ContextBar 与唯一 ReviewDock（1.5-2 天）

当前进度：世界书首页、结构化设定、创建工作区和高级世界书页已完成多轮视觉统一。世界书首页使用当前世界主卡、独立世界书选择器、创建工具和预设索引组织入口；结构化设定使用共享 `SettingsContextBar`，一级导航收为“设定 / 地图 / 条目”，首页路由复用“设定”入口而不再重复占用 tab；`StructuredSettingsPanel` 改为左侧分区索引 + 右侧编辑稿面，字段 AI 操作退为轻量图标文字，来源资料保持横向来源带与单份预览。高级页的基础设定、导入导出、分组和条目面为连续编辑区，旧“新建 / 导入”编辑分区已删除，创建职责统一由 `WorldbookCreationWorkspace` 承接；条目面使用检索/过滤、批量操作、条目列表和编辑面四层工作区。现有 `SettingDraftReview` 作为唯一审核入口；一次分区生成产生多份草稿时，结构化面板在该入口上方提供轻量待审队列，用户可切换全部草稿而不再只看到第一份。草稿存在时桌面位于右侧，760-1100px 使用不改变主区宽度的右侧覆盖层，759px 以下使用避开应用顶栏的全屏审阅页；关闭只收起审阅、不丢弃草稿，并恢复触发控件焦点与页面滚动。创建工作区 JSON 确认动作已从重复摘要移回结构化预览，移动端进度摘要改为紧凑上下文带。详细设定页现在将分区生成状态同步到唯一审核区，部分成功保留可用草稿并只重试失败项，revision 变化显示 stale 并禁止旧草稿覆盖；字段请求也具备取消与旧响应隔离。正式来源预览兼容 `contentPreview / preview / content`，字数仍读取归档完整长度。真实 UI audit 已覆盖 regular/loading/partial/error/stale/cancelled 六种状态，首页、创建、结构化和高级四条设定路由在 1440/1024/390px 共 36 captures，0 console error、0 a11y failure、无裁切/横向溢出；剩余是真实渠道与真实 revision 变化下的 stale/取消 smoke。

- 提取 `SettingsContextBar`，替换重复标题、世界书选择、新建动作和左侧世界书列表。
- 将一级导航收为设定/地图/条目；旧 route 暂时兼容。
- 将当前 `SettingDraftReview` 改造成唯一 dock，删除底部 `draft-drawer`。
- 基调、字段、整节和条目候选共用草稿队列；桌面 dock、中宽 overlay、移动端 full-screen sheet。
- sticky footer 保持采纳可见，关闭后恢复字段和滚动位置。

退出条件：任一设定子页只有一处世界书上下文和一处一级导航；任意时刻只有一套草稿操作；生成前后主按钮位置不变。

### U6：字段与按钮视觉收口（1 天）

当前补充：结构化设定的字段已从完整描边卡片收为连续稿面，输入采用底线层级，保存/错误状态采用边线文字，分区 AI 动作不再使用大面积实色底；保留主题 2 的少量异色信号线，不新增按钮体系。1440/1024/390px 的 regular/partial/loading/error/stale/cancelled 共 18 captures 均无 console error、a11y failure 或横向溢出。

- 按第 9 节规则清理字段头、分区栏、状态和按钮层级。
- 复用现有 `control-*` 语义与 `WorkbenchIcon`，不建第三套按钮 CSS。
- 背景只调整页面底层等高线/点阵与纸面层级，不重写主题 token。
- 逐项检查 100%、125% 与 200% 文本缩放下中文文案换行。

退出条件：同屏实色主按钮不超过一个/操作组；无文字被裁、按钮互相挤压或状态覆盖正文。

### U7：验证、删旧链与文档（0.5-1 天）

- 保留首页仍承担分流职责的 hero/extra actions；删除无调用的旧 create section、重复 CSS 和旧草稿 drawer。
- 更新设定工作流、支持格式、来源存储、精确去重、扫描 PDF 限制和隐私说明。
- 当前已完成：预设直达体验、creation workspace 恢复、多文件导入、逐文件读取进度、跨归档正文重复复用、部分失败、解析取消/超时、关闭重开状态恢复、quota 失败后的本页预览/文字导出与确认时归档重试、正式 worldStore quota 失败回滚、结构化生成 partial/error/aborted/stale UI 审计，以及来源归档容量/清理边界。合同测试已覆盖 TXT/MD、实际 PDF.js、实际 Mammoth raw-text、慢速降级解析取消、parse-timeout、损坏 PDF/DOCX、正式创建 quota 拒绝与失败导入回滚；真实渠道生成、真实 provider 3×3、真实 IndexedDB quota 和 20MB PDF 设备性能仍属于需要用户配置/设备的外部验收，不把 dry-run 当成真实渠道通过。
- 本轮继续补齐：旧来源 refs 保留与惰性迁移、Pinax JSON 来源归档、批量 archive hash 复用、跨来源 chunk refs、详细生成前 archive chunk 恢复、相同上下文片段去重、工作区记录容量预检、粘贴片段 quota 降级和结构化设定来源带的完整字数显示。
- 本轮再补齐：删除高级世界书页重复的结构化设定标签与挂载；高级页在 1080px 以下切单列、640px 以下改为可换行编辑导航，200% 有效视口不再压缩正文输入；补跑世界书首页 1440/1024/390 三个宽度。`ui-audit` 现在覆盖首页、创建、结构化和高级四条设定路由，共 36 captures。
- 本轮再补齐：分区批量生成的多份草稿不再只有第一份可见；结构化设定面板新增轻量待审队列，在同一个 `SettingDraftReview` 中切换字段草稿。新增 UI 合同测试，结构化页 1440/1024/390px 的六状态审计保持 18 captures、0 console error、0 a11y failure。
- 本轮再补齐：抽出共享 `SettingsContextBar`，将设定一级导航收为“设定 / 地图 / 条目”，世界书首页通过路由归入“设定”；正式世界书来源归一同时接受 `contentPreview`，结构化来源带和归档长度展示不再依赖旧 `content` 字段。
- 本轮再补齐：高级条目页复用共享 `SettingsContextBar` 与三项一级导航，删除旧顶部标题/搜索和左侧世界书选择器；390px 下新建世界书收为图标动作。1440/390px regular 审计 2 captures、0 console error、0 a11y failure。
- 本轮再补齐：来源解析为每文件和每批次保留诊断耗时，主线程与 Worker 合同一致，creation workspace 可恢复最近一次批次指标；慢任务阈值只用于后续性能观察，不替代实体设备验收。

退出条件见下一节。

## 12. 验收门槛

### 功能

- 一次选择 TXT、MD、文本型 PDF、DOCX 各一份可独立导入；抽取文本、标题、字符数和 PDF 页码定位正确。
- 扫描 PDF、加密 PDF、损坏 DOCX、超限文件、重复文件和 IndexedDB/localStorage quota 均返回可操作错误；原世界书不损坏。
- 用户取消解析或生成后不产生资料/草稿；已成功的其他文件保留。
- 来源暂存不调用模型；基础基调和详细提炼只发送预算内文字 chunks，不上传原始二进制。
- 相同文件复用已有来源；相同 chunk 只进入模型上下文一次且保留全部来源定位；同名候选只提示，不自动合并。
- 预设选择幂等创建/复用世界书并进入绑定体验；SillyTavern JSON 不经过普通文本 AI 猜测。
- 草稿采纳前不修改正式结构化字段或世界书条目；stale 草稿不可覆盖新编辑。

### 界面

- 1440、1024、390px 的生成前、生成中、成功、部分成功和错误状态无重叠、横向滚动或不可达主动作。
- 生成前后 ContextBar、分区栏和触发按钮不发生位置跳变。
- ReviewDock 打开后采纳与丢弃始终可见；关闭后恢复触发字段及滚动位置。
- 390px 首屏在 ContextBar 与分区导航之后立即看到资料或当前字段，不再堆叠两层标题和两层导航。

### 性能与隐私

- 20MB 以内文本型 PDF 解析期间页面仍可滚动和操作，取消在 1 秒内结束等待；记录总耗时和异常长任务用于后续优化，不把不同设备上的固定毫秒值设为发布硬门槛。
- 文件解析阶段网络请求为 0；日志不含文件正文、API Key 或完整 prompt。
- creation/source archive 有明确总容量与清理入口；长资料不再按前 120000 字静默截断，单次模型输入仍受现有上下文预算约束。

本轮实现证据：归档容量按 64MB 总预算估算，写入前返回 `quota-exceeded`；正文 hash 命中时复用已有 artifact/chunks；清理只删除当前工作区、正式世界书均未引用的来源，并重建共享 chunk 的 sourceRefs；主线程降级与 Worker 路径均逐文件回传解析状态，页面通过单一 `aria-live` 状态播报批次进度。首页、创建、结构化和高级设定页在 1440/1024/390px 覆盖对应 regular/loading/partial/error/stale/cancelled 可用状态，共 36 captures，0 console error、0 a11y failure。

### 测试控制

不为每个组件和状态新增一条测试：

- 扩展现有 `worldBookQuickImport.test.js` 覆盖 creation/source contract、旧资料兼容、预设幂等和生成前不写 owner；
- adapter 与精确去重使用一个参数化测试项覆盖 TXT/MD/PDF/DOCX、重复文件/chunk 与错误 fixture；
- 扩展现有 UI contract 检查唯一 ContextBar、唯一 ReviewDock 和已删除旧 drawer；
- Playwright audit/smoke 负责布局和完整操作，不用大量脆弱 DOM 快照代替真实流程。

## 13. 风险与回退

| 风险 | 控制 |
|---|---|
| PDF.js/Mammoth 增大首包 | adapters 动态 import，只在选择对应文件后加载 |
| 大文件耗尽内存 | Worker、文件大小上限、逐页处理、取消与超时 |
| PDF 文本顺序混乱 | 保留页码 locator 与抽取预览；用户确认后才保存，不自动声称解析正确 |
| IndexedDB/source archive 容量不足 | 不默认保存二进制；写入前估算；提供清理/导出；quota 失败不覆盖 worldbook owner |
| 去重误删历史变化或冲突 | 首轮只做精确 hash；来源记录不删除；语义相近只进入候选审阅 |
| 信息架构改动过大 | U3 先切换首页分流和创建工作区，U5 再共享 ContextBar 与删除重复入口；条目编辑内核保持不动 |
| ReviewDock 再次遮挡 | 1200px 以下统一 overlay/full-screen，不在窄主区硬塞第二列 |
| AI 草稿来源混淆 | 每个草稿保留 source document IDs、worldbook revision 和生成范围；采纳仍走现有稳定引用 |

## 14. 完成定义

只有同时满足以下条件才可称为“设定页体验完成一轮收口”：

1. 世界书首页完成已有世界书、预设直达体验和新建三条清晰路径。
2. 新建工作区能暂存并恢复多个 PDF/DOCX/TXT/MD；JSON 保留结构化导入，不混入普通提炼。
3. 第一次生成只建立基础基调和索引；详细内容按分区、来源和预算渐进提炼。
4. 文件/chunk 精确去重已生效，同名候选可见但不自动合并；压缩保留来源定位。
5. AI 基调、资料提炼和结构化字段生成统一进入一处审阅，不在页面各处长出新按钮。
6. 设定子页只有一处世界书上下文、一处一级导航和一个当前主动作。
7. 生成前后布局稳定，桌面、平板和移动端都能看到并操作草稿底部动作。
8. 正式世界书仍只在用户明确确认/采纳后改变，解析与生成失败均可恢复。
9. 旧重复组件、标签、drawer 和 CSS 已删除，不以隐藏保留代替收口。
