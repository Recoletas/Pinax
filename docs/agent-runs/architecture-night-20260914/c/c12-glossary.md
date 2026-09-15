# C12 · 素材领域语言术语表（含 legacy 保留清单）

状态：已实施（新 owner 内部全程使用 asset 语言；页面兼容绑定保留）。
本表是后续把页面 legacy 命名迁到 asset 语言的唯一对照来源；正式 schema、
持久化 key 和模板绑定**不做**机械重命名。

## 术语对照

| 领域概念 | 新 owner 用语 | 页面 legacy 名 | 保留原因 / 迁移条件 |
| --- | --- | --- | --- |
| 素材条目 | asset | `chapters`（数组）、`note`（模板循环变量） | 模板绑定 + uiControlContract 断言（`function sendCheckedAssetsToCanvas` 等）依赖页面结构；待组件抽取（C13）时随组件改名 |
| 当前素材 id | `selectedChapterId`（catalog 内部即 asset id） | 同名 | 同上 |
| 素材标题 | `currentChapterTitle`（编辑中标题） | 同名 | 模板 v-model 绑定 |
| 素材正文（编辑真源） | `markdownContent` | 同名 | 语义本就正确 |
| 目录加载 | `loadNotes(preferredAssetId)` | `loadNotes(preferredChapterId)` | 参数名在新 owner 已用 asset 语言；页面薄委托保留旧名 |
| 选择素材 | `selectChapter(assetId)` | 同名 | 模板绑定 |
| 保存素材 | `saveCurrentChapter()` | 同名 | 模板/多处调用 |
| 删除素材 | `deleteChapter(assetId)` | 同名 | 模板绑定 |
| 画布卡 | canvas card（`assetId` 字段） | prose card / slip | `relationCanvas` 服务合同用 card；slip 指画布上的非主卡展示 |
| 钉住列表 | pinned slip ids | `pinnedSlipIds` / `explicitPinnedSlipIds` | C11 后仅 prefs + 默认全选两个来源 |
| 内嵌图片键 | descriptor key（`media:<id>` / `src:<hash>`） | embeddedImagePresentations key | 键格式即持久化合同，不迁移 |

## 已由第一批达成的证据

- `useNotesAssetCatalog.js` / `useNotesAssetEditor.js` / `useNotesMaterialAdvisor.js`
  内部参数、注释、返回名全部使用 asset/material 语言（grep 无 chapter 语义新增）。
- 未发生全仓搜索替换、存档迁移或双别名层（计划禁令）。

## 迁移触发条件（下一轮）

1. C13 抽出目录/编辑面组件时，组件 props/events 使用 asset 语言，页面在边界做一次映射；
2. `uiControlContract.test.js` 的源码文本断言改造为行为断言后，页面 legacy 函数名可随组件化一并更名。
