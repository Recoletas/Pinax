# R2-D - Notes HTML 与漫画页级制作

## 工作区

- Worktree: `/tmp/pinax-r2-comic`
- Branch: `round2/comic-production`
- Product base: `635a439038a16a3306ab9b30c45c4d3412250957`

先按 [总览](./README.md) 核对 git，再读 `AGENTS.md`、`docs/STATUS.md` 和非空 `LOCAL.md`。不要使用 brainstorming / Superpowers，不启动 dev server。

## 目标

修复 Notes 素材行 button 嵌套 button 的 Vite 警告，并把漫画制作从逐格长表单推进到真实的页级改编、连续性和制作阶段工作区。

## 可修改

- `src/pages/Notes.vue`
- `src/components/media/ComicPageEditor.vue`
- `src/components/media/ComicPagePreview.vue`
- `src/services/media/comicPageStore.js`
- `src/services/media/comicScriptService.js`
- 一个已有直接相关测试 body（如存在），不得增加 test count
- 结果：`docs/agent-runs/2026-07-16-round2-integration/result-d-comic.md`

禁止修改 ProseEssay、canvas、Advisor、router/AppShell、server、stores、图片 provider 内核、package 文件、共享状态文档和其他窗口文件。

## 必须完成

1. 删除 Notes 中 button-inside-button。素材行整体仍可鼠标和键盘选择；checkbox、删除按钮互相独立；保留多选、删除、画布标记、倾斜和响应式布局。
2. `ComicPage` 增加并规范化页级字段：page beat / purpose、page-turn hook、continuity notes、visual bible refs。旧页读取必须安全补默认值。
3. 上述字段必须进入漫画脚本 prompt、严格解析与保存，不得只存在组件 state。
4. compact 信息架构顺序：制作页/页面总览 -> 页级节拍与连续性 -> 页面预览/格导航 -> 当前格构图 -> 制作阶段与文字。删除重复标题和无信息说明，避免长而无层级的表单。
5. 制作阶段必须显示真实 status、stale reason、已有 take/reference；允许用户审阅状态更新，但不得把未生成的 rough/line/flats/render 伪装为完成。
6. 保留中央整页预览、逐格候选生成、模型选择、manifest/PNG、MediaAsset sourceRefs 和失败隔离。
7. 页面预览要能表达阅读方向、当前格、页级节拍/翻页提示，但不要用大块说明文字盖住画面。
8. 沿用 archive/folio token，卡片圆角不超过 8px，移动端文本完整，不重写整个 Notes 页面。

## 验证与交付

- 运行已有相关媒体测试（如有）、`npm run build`、`git diff --check`；检查 build 输出不再出现 Notes 嵌套 button 警告。
- 不新增测试数量。
- 写不超过 400 字结果摘要并创建一个 conventional commit；不含 `Co-Authored-By`。
- 最终只报告 commit hash、结果文件路径和验证状态。
