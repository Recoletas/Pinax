# L0 基线表 · 设定页 ↔ Authoring 联动（2026-09-12）

基线：`main` `7961e00`，工作区仅 docs 未提交；无其他会话占用 Authoring/路由文件（进程与文件 mtime 已核对）。

## 代码级缺口确认（实现前）

| # | 旅程 | 期望 | 当前实际（代码位置证据） | 判定 |
|---|---|---|---|---|
| 1 | A 正文人物 → 完整设定 | 打开 A 绑定 WA 的同一 entry | `Authoring.vue:3682 openWorldbookFromDual` push `settings-worldbook-advanced` 只带 `entryId`；该路由在标签合同里是 **global surface**，页面 mount 走 `ensureActiveWorldbook()`（全局 active 回退）→ 可能打开错库 | ✓ 复现（错库） |
| 2 | A 结构化设定 → 条目 → 地图切换 | 保留 bookId/worldbookId | `SettingsSectionNav.vue` `:to="{ name: tab.routeName }"` 不带任何 query；`resolveRouteIntent` 对无 bookId 的 project surface 返回 null | ✓ 复现（丢上下文） |
| 3 | 条目/设定页 → 返回 A 正文 | 一键回原章原落笔位 | 三个设定页面均无「回到正文」入口；只有地图**出程**带 volatile restore（`handleDetailOpenMap`），设定/条目页没有回程消费 | ✓ 复现（无回程） |
| 4 | A/B 标签切换 | 各自绑定不串 | `WorldMapPage` 已按 bookId→book.worldbookId+竞态令牌解析；`StructuredSettings`/`WorldBookEditor` 仍走全局 active（`ensureActiveWorldbook`） | 部分（地图页已有模式，另两页缺） |
| 5 | 删除当前场引用 | 失效提示、生成 fail-closed | Authoring 本地删除有处理；跨页面删除后无刷新/失效通知 | 风险（跨页） |
| 6 | 设定更新后继续旧推演 | 冻结语义不混资料 | 既有 revision/冻结规则存在；跨页面变更后的刷新入口缺失 | 风险（跨页） |

## 复用资产

- 地图往返完整模式：出程 `handleDetailOpenMap`（capture selection/scroll → `setVolatileRestoreStateByKey(authoringTabKey)` → `openOrFocusWorkspaceTab`），回程 `Authoring.vue:12610` watcher（consume → 核对 book/chapter/revision → 恢复选区/滚动，fail-closed）。
- `WorldMapPage` 的 bookId→`book.worldbookId` 解析 + `contextRequestId` 竞态令牌 = L1 解析器的现成原型。
- `workspaceTabsStore.setVolatileRestoreStateByKey/consumeVolatileRestoreStateByKey` 已存在，`project:{id}:` 前缀随关书清理。
- 测试落点：`src/__tests__/authoringWorldbookBinding.test.js`（不加新文件）。

## 浏览器复现计划

三个已复现缺口在 L2/L3 改完后于 L8 用同一浏览器 Gate 的前后断言固化（修复前行为已由上表代码位置锚定）；六条旅程的最终矩阵在 L8 执行。
