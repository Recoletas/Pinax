# R2-A — 联机常驻入口

日期：2026-07-16
分支：`round2/visible-online-entry`

## 改动文件

- `src/layouts/AppShell.vue`（唯一）

## 行为

Experience activity 激活时在 `.shell-mast` 上新增一个常驻“联机”子模式入口，桌面与移动端都可见，不要求先打开 drawer。点击跳转到已有 `online-experience` 路由；当前路由已是 `online-experience` 时按钮显示 active 状态（`◆` 印章 + `aria-current="page"`）并短路重复导航。

入口视觉沿用 `shell-tab` / `shell-meta-chip` 同家族：硬边 0 圆角、`border-left` 1px 撕边虚线、`::before` archive-rose `·` 墨点（active 切 `◆` 印章）、14×14 内联 SVG 卡片连接图标、12px “联机”短标签。无罗马序号，以示子模式而非平级 activity。`.theme-kao` 写同色 override，dark token 全部走 `archive-*`，无 raw hex / `:global` / `!important`。

`.shell-mast` grid 扩到 `auto minmax(0, 1fr) auto auto` 给 subnav 一列；≤1040px 与 meta 同行，≤760px 紧凑到 28px 高 + 11px 字，≤480px tabbar 隐藏但 subnav 仍保留，确保移动端持续可见。`showOnlineEntry` / `onlineEntryActive` 两个 computed 限定渲染与状态；`handleSelectOnline` 早返回防重复 push。

## 验证

- `npx vitest run` 24 files / 200 tests 全绿，未新增 test。
- `npm run build` ✓ 4.45s clean。
- `git diff --check` exit 0。
- 禁止项扫描：diff 内 0 `:global` / 0 `!important` / 0 raw hex。
- 路由可达性：`/experience/online` 和 `/experience/online/:roomSlug` 在 `src/router/index.js` 已存在（可选 `:roomSlug?`），入口 push `online-experience` 命名路由即覆盖两种形态，无需改路由。

## 残余风险

- `OnlineExperience.vue` 的 lobby 与房间状态、断线重连、snapshot 解析未改，仅入口可见；联机业务行为由 R2 其他窗口或后续 smoke 验证。
- prompt 允许的 `workbenchNav.js` / `ActivityBar.vue` / `SidePanel.vue` / `router/index.js` 未修改：drawer 侧边栏 `online-experience` 条目已经存在并保持有效，新 mast 入口是补充而非替代；如需把 drawer 中那条删除以避免重复，应在 R2-F 集成时按整体信息架构决策，不在本窗口单独动。
