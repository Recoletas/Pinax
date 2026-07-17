# R2-D · Notes HTML 与漫画页级制作 — 结果

## 改动文件

`src/pages/Notes.vue` `src/services/media/comicPageStore.js` `src/services/media/comicScriptService.js` `src/components/media/ComicPageEditor.vue`

## 行为改动

1. **Notes 嵌套 button**: 素材行从 `<button class="index-card">` 改成 `<div role="button" tabindex="0" + @click + Enter/Space keydown + aria-label/selected>`。内部 checkbox 与 `<button class="index-card__delete">` 不再被 button 包住,Vite 警告消失;多选/删除/画布标记/倾斜/响应式全保留。
2. **ComicPage 页级字段** (schemaVersion 2 → 3,默认值保旧页): `pagePurpose`、`pageTurnHook`、`continuityNotes[]`、`visualBibleRefs[]` 已写入 `createComicPage` 规范化,旧页存盘再读安全。
3. **脚本 prompt / 严格解析**: `comicScriptService` system prompt 把这 4 个字段列入 JSON 契约,`parseComicScript` 解析后 `normalizeScriptContinuityNotes` + `normalizeScriptVisualBibleRefs` 严格截断,`generateComicPageScript` 把这些传给 `createComicPage`,完整 round-trip。
4. **ComicPageEditor 信息架构 + 制作阶段**: 在 "统一画风" 与 "页面预览" 之间插入 `<details open>页级节拍与连续性</details>`,含 pagePurpose / pageTurnHook / continuityNotes(每行一条 + 计数提示)/ visualBibleRefs(可逐条编辑 + 删除)。预览标题增加 chip 条:阅读方向 / 节拍短句 / 翻页钩子 / 当前格,圆角 ≤ 6px。Production stage tile 增加副标题 `· 失效:分镜构图已更新` / `· 选 1/3` / `· 失败:msg`,hover 给出 `:title` 状态描述,避免把 empty/working/stale 误认为完成。
5. **保留**:中央整页 ComicPagePreview、逐格候选、`ImageModelPicker` 模型选择、JSON manifest、PNG 导出、MediaAsset sourceRefs + 失败隔离、acceptance 页流不动。

## Self-review 修正(amended into same commit)

1. **continuityNotes 双绑**: 第一版用 `v-model="comicPage.continuityNotesText"` 是错误路径(`comicPage` 是 ref,Vue 自动 unwrap 后该属性不存在),textarea 不会写到底层数组。改为 `v-model="continuityNotesText"` 直绑 script-setup computed,setter 自动同步 `continuityNotes` 数组。同步移除冗余 `syncContinuityNotes` 助手。
2. **Notes 行 a11y**: `<div role=button :aria-pressed>` 语义不对(aria-pressed 用于 toggle button,这里是单选),改成 `:aria-selected`。
3. **visualBibleRefs 行栅格**: 列定义 `100px 1fr 1fr 28px` 在窄屏会挤死两个 `1fr` 输入框,改为 `88px minmax(0, 1fr) minmax(0, 1fr) 28px`,最小可缩到 0。

## 验证

- `npm run test:run -- src/__tests__/integration.test.js src/__tests__/agentContracts.test.js src/__tests__/visual-verification.test.js` → **23/23 pass**(无新增测试用例)
- `npm run build` → ✓ 4.40s,**Notes 嵌套 button 警告不再出现**
- `git diff --check` → exit 0

## 残余风险

- `visualBibleRefs` 单条编辑后会 bump 该条 `revision`(保留给后续 history 引用);目前未触发 stale。
- 老 schemaVersion 2 页第一次写回会自动升级;`updateComicVisualBible` 之类旧入口不会清空新字段(因为 `createComicPage` 走 spread 合并),单测覆盖延后。
