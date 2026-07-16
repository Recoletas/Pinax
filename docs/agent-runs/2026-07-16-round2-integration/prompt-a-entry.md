# R2-A - 联机常驻入口

## 工作区

- Worktree: `/tmp/pinax-r2-entry`
- Branch: `round2/visible-online-entry`
- Product base: `635a439038a16a3306ab9b30c45c4d3412250957`

先按 [总览](./README.md) 核对 git，再读 `AGENTS.md`、`docs/STATUS.md` 和非空 `LOCAL.md`。不要使用 brainstorming / Superpowers，不启动 dev server。

## 目标

`online-experience` 路由已经存在，但入口只在关闭的工作区抽屉中，用户看不到。让联机成为体验区域内持续可见、可直接进入的子模式，同时保持它不是第六个顶层工作区。

## 可修改

- `src/config/workbenchNav.js`
- `src/layouts/AppShell.vue`
- `src/components/workbench/ActivityBar.vue`
- `src/components/workbench/SidePanel.vue`
- `src/router/index.js`，仅在证明路由本身有缺陷时
- 一个已有的直接相关测试文件，但不得增加 test count
- 结果：`docs/agent-runs/2026-07-16-round2-integration/result-a-entry.md`

## 禁止修改

`Experience.vue`、`OnlineExperience.vue`、`ProseEssay.vue`、`Notes.vue`、server、stores、package 文件、共享状态文档和其他窗口文件。

## 必须完成

1. 在 Experience activity 激活时提供桌面和移动端都持续可见的“联机”入口，不要求先打开 drawer。
2. 在线路由时入口显示 active；点击当前在线路由不得制造重复导航。
3. 联机仍属于体验子模式，不增加第六个顶层 activity。
4. 使用现有 archive/folio shell token、熟悉图标 + 短标签、圆角不超过 8px，补齐键盘焦点与 aria。
5. 不改变现有 drawer、路由转场、存储和设置入口。
6. 不写功能说明或营销文字；窄屏文本必须完整容纳。
7. 审查 `/experience/online` 与 `/experience/online/:roomSlug` 的路由可达性。

## 验证与交付

- 运行相关已有测试（如有）、`npm run build`、`git diff --check`。
- 自审 light/dark token、桌面/移动布局和文件越界。
- 写不超过 400 字结果摘要并创建一个 conventional commit；不含 `Co-Authored-By`。
- 最终只报告 commit hash、结果文件路径和验证状态。
