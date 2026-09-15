# C0 · Notes.vue 真实数据与编辑模式图

基线 `37e0679`（O 的已验证快照，verify:full exit 0）。统计：总 5583 行 =
template 553（1–553）+ script 2475（555–3029）+ style 2553（3031–5583）。

## 1. 历史命名澄清

`chapters`/`selectedChapterId`/`loadNotes`/`selectChapter`/`saveCurrentChapter`/
`deleteChapter`/`currentChapterTitle` 全部实际指**素材（narrative asset）**，不是书稿章节。
`chapters.value` 的元素来自 `listActiveNarrativeAssets()`，`selectedChapterId` 是 asset id。
新模块内部使用 asset 命名；页面兼容绑定保留（模板不动），避免全仓机械重命名（对应 C12）。

## 2. 状态 owner 盘点（页面现有 refs/lets）

| 域 | 状态 | 类型 |
| --- | --- | --- |
| 素材目录 | `chapters`、`selectedChapterId`、`checkedAssetIds`、`collapsedAssetKinds`、`groupedChapters`(c)、`selectedAsset`(c)、`currentAssetIndex`(c) | ref/computed |
| 编辑内容 | `currentChapterTitle`、`markdownContent`（编辑真源）、`editorContent`（HTML 派生）、`renderedMarkdownContent/Source`（媒体 hydrate 后预览）、`editorMode`（wysiwyg/markdown/preview）、`saveStatus` | ref |
| 保存 | `saveTimeout`（正文 1s 去抖）、`titleTimeout`（标题 500ms） | module-level let |
| 画布/钉住 | `pinnedSlipIds`、`explicitPinnedSlipIds`、`pinnedSlipPositions`、`canvasImportRevision`、`canvasTransferFeedback`、localStorage `pinax_notes_pinned_slips_v1` | ref/reactive |
| 插画 | `illustrationPreview`、`illustrationSelected`、`selectedIllustrationTarget`、`imageContextMenu`、`illustrationDrag`（let）、`imageLayoutOptions` | ref/let |
| 编辑器 UI | find/replace 四 refs、取名器 6 refs、字体面板/字号/粗斜下、`hasSelection`、`selectionToolbarStyle`、`charCount/wordCount`(c) | ref |
| 工作区 | `sidekickWorkspace`、`mobilePane`、`sidekickImageModelConfigs/Id` | ref |
| 生成 | `isGeneratingProfessionalInfo`、`mediaGenerationSourceAssets/ProjectId/SourceRefs`(c)、`illustrationPreview`(共用) | ref/computed |
| 弹窗 | `showNewNoteModal`、`newNoteTitle`、`newNoteInput` | ref |

module-level 可变 let：`saveTimeout`、`titleTimeout`、`markdownMediaRenderRevision`、
`illustrationDrag`、`notesMediaLoadRevision`。

## 3. 关键流程与异步身份链现状

| 流程 | 现状 | 身份保护评估 |
| --- | --- | --- |
| `loadNotes` → hydrate 图片 | `notesMediaLoadRevision` 世代守卫，stale hydrate 丢弃 | ✅ 有守卫 |
| `markdownContent` watch → 媒体 hydrate 渲染 | `markdownMediaRenderRevision` 世代守卫 | ✅ 有守卫 |
| `selectChapter` → `migrateSelectedChapterMarkdownMedia` | await 后核对 `selectedChapterId !== chapter.id \|\| markdownContent !== sourceMarkdown` 才写回 | ✅ 有核对（asset id + 内容双身份） |
| `generateAndImportToCanvas`（专业信息→画布卡） | **await 前后都用 `selectedAsset.value` 当前值**：生成期间切素材 → extraFields 写到新素材的画布卡、导航也被劫持到新素材 | ❌ **真实缺陷，C3 收口对象** |
| 顾问 apply/undo（text-patch 与 material-* 事务） | apply 前比对 baseText/target revision；undo 比对 receipt.after 快照 | ✅ 基本有守卫（C6 备选正式化） |
| `saveGeneratedImageAsset` | await 前 `const currentAssetId = selectedChapterId.value` 捕获 | ✅ 模式正确 |

## 4. 已确认缺口（本线主包依据）

1. **无卸载/离页保护**：无 `onUnmounted`/`beforeunload`/`pagehide`；去抖保存进行中关页签丢输入。
   （无全局 addEventListener，事件全为模板绑定——不存在监听器泄漏，但保存计时器在卸载后仍可能触发一次。）
2. **`saveCurrentChapter` 无失败路径**：`updateNarrativeAsset` 同步写 localStorage，配额异常会沿
   `selectChapter → saveCurrentChapter` 向上抛，选中状态停在半切换。C2 需要保存失败不阻断切换、输入不丢。
3. **C3 缺陷**（§3 表）：画布导入链无来源身份捕获。
4. 编辑器三模式（wysiwyg/markdown/preview）共享 `markdownContent` 单一可变真源 + 两个派生
   （editorContent、rendered*），本身健康；但 sync/render/illustration anchor 逻辑交织在页面（C2/C7 分界）。

## 5. 模板耦合面

模板 50 个事件绑定全部调用页面函数（`onGlobalClick` 在根容器 @click）。策略：新 composable
解构出的名字与原页面函数/状态同名，模板零改动；页面保留插画 DOM 交互、find/replace、取名器、
面板 UI（C7/C8 范围）。

## 6. C 线新模块登记（写集，O 未在场时由 C 自登记并报告）

- `src/composables/useNotesAssetCatalog.js` —— C1 素材目录与批量工作流 owner
- `src/composables/useNotesAssetEditor.js` —— C2 编辑/保存生命周期 owner
- `src/services/notes/assetMarkdown.js` —— 纯 markdown↔html/纯文本转换（可单测，无 Vue/DOM）
- 画布导入链收口：`generateAndImportToCanvas` 迁入 catalog（C3），注入 `navigate` 适配器
