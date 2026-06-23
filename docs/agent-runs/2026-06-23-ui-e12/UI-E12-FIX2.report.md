# UI-E12-FIX2 — Fast blocker fix only

**Worker**: Claude (UI-E12-FIX2 window, 2026-06-23)
**Branch**: main (no commit/push per brief)

---

## 1. 改了什么

### 1.1 Folio corner hardcoded `1 / 1` 删除 (`src/components/GamePanel.vue:22-26`)

| Before | After |
|---|---|
| `<span class="chat-container__hero-folio"><span class="chat-container__hero-folio-case">{{ caseNoShort }}</span><span class="chat-container__hero-folio-sep">·</span><span class="chat-container__hero-folio-page">1 / 1</span></span>` | `<span class="chat-container__hero-folio"><span class="chat-container__hero-folio-case">{{ caseNoShort }}</span></span>` |

- 删除 `<span class="chat-container__hero-folio-sep">·</span>` 跟 `<span class="chat-container__hero-folio-page">1 / 1</span>` 两个 hardcoded literal
- 保留 `<span class="chat-container__hero-folio-case">{{ caseNoShort }}</span>` (case ID 印章,从 session/world ID 派生,总是 honest)
- scoped CSS `.chat-container__hero-folio-sep` rule 同步删除;`.chat-container__hero-folio` rule 保留(只剩 case ID)
- 注释更新:`page index shows currentSection vs totalCount` → 删掉(不再 hardcoded)

### 1.2 640 mobile ws-topstrip 改简单 flex column (`src/styles/themes/kao.css`)

`@media (max-width: 980px) .theme-kao .ws-topstrip` — 之前 FIX1 4-row grid 仍 jumbled,QA2 §4.1 红线。FIX2 改成 `display: flex; flex-direction: column; gap: 6px;` 简单垂直 stack:
- `pagetitle` row 1 (full width + bottom border)
- `cell 1-5` 各自 full width + dotted bottom border
- `progress` full width
- `anchor` full width

移除 `grid-template-columns: repeat(3, minmax(0, 1fr))` / `grid-template-rows: auto auto auto auto` / `grid-auto-flow: row dense` / 显式 cell grid-row 锁。**0 dense / 0 grid wrap**(brief §禁止)。

### 1.3 640 mobile ws-left-rail 改 compact 1-line bar (`src/styles/themes/kao.css`)

`@media (max-width: 980px) .theme-kao .ws-left-rail` — 之前 `flex-direction: row; overflow-x: auto`(水平 scroll row 跟 topstrip 碰撞)。FIX2 改成:
- `display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 8px 12px; min-height: 36px;`
- `.theme-kao .ws-left-rail__brief { display: none; }` (隐藏 brief paragraph,只留 kicker 1-line)

### 1.4 uiPolish 契约 (`src/__tests__/uiPolish.test.js`)

新增 `describe('ui polish — UI-E12-FIX2: ...')` block,4 contracts:
- **FIX2-1**: GamePanel.vue `chat-container__hero-folio-page">1 / 1` literal 不存在(但 `.chat-container__hero-folio-case` 保留)
- **FIX2-2**: `@media (max-width: 980px) .ws-layout` 用 `grid-template-columns: 1fr` (单列)
- **FIX2-3**: `@media (max-width: 980px) .ws-topstrip` 用 `display: flex; flex-direction: column`,无 `grid-template-*` / `grid-auto-flow`
- **FIX2-4**: FIX2 新 rule 0 `:global` / 0 broad `:deep` / 0 `!important` / 0 raw hex

更新既有 FIX1-1 contract:从 4-row grid 改成 simple flex column 校验(因为新实现用 flex 而非 grid)。FIX1-2 / 3 / 4 / 5 不动。

---

## 2. 截图路径

| 文件 | viewport | 关键验证 |
|---|---|---|
| `docs/agent-runs/2026-06-23-ui-e12/experience-e12-fix2-1280.png` | 1280×800 | 5 元素不再堆叠:top-left kicker 可见(topstrip 顶部 `体验 EXPERIENCE` + 5 cells + progress + anchor,每元素独立 row);folio corner 无 `1/1` hardcoded;2 messages 用 per-message `.msg-item__folio` "页 1" / "页 2" (NOT workstation count) |
| `docs/agent-runs/2026-06-23-ui-e12/experience-e12-fix2-640.png` | 640×800 | **6 段清楚纵向顺序**:(1) left rail compact 1-line bar;(2) topstrip simple flex column (5 cells + progress + anchor,每 cell own row);(3) center stage (chat-container);(4) 4 CTA buttons;(5) input area;(6) right rail sections — 无 5 元素堆叠在 viewport top 200px |

Playwright runtime 验证 (640):
- `ws-layout` `getComputedStyle().gridTemplateColumns` = `"640px"`(单列,符合 `grid-template-columns: 1fr` 期望)
- `.chat-container__hero-folio-page` 节点不存在(0 `1/1` hardcoded)

stale E11 PNGs 保持删除状态(FIX1 已删,本轮不恢复)

---

## 3. 测试结果

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | **245 / 245 pass** (2 files) |
| `npm run test:run` (full) | **1014 / 1014 pass** (113 files / 0 fail) |
| `npm run build` | **clean** (3.66s) |
| `git diff --check` | **clean** |
| Forbidden pattern sweep (FIX2 新 rule) | 0 `:global` / 0 broad `:deep` / 0 `!important` / 0 raw hex |

FIX2 adds 4 new contracts (1010 → 1014 = +4). FIX1-1 contract updated in place to match the new simple flex column shape (was 4-row grid).

---

## 4. 剩余风险

1. **QA2 Medium #1: 1280 hamburger visibility** — FIX2 未修(非 blocker,只在 viewport 截图左边缘看到 pagetitle 跟 hamburger 视觉关系 OK,playwright 实测 z-index 260 > topstrip 240 已生效)。如 user 报告实际 hidden,FIX3 加 desktop 截 fullPage 验证。
2. **640 hero block 渲染延迟** — playwright 实测 `caseCornerText: None` 在 capture time,因为 init script 注 0-messages session 后,dev server mount 时 inject 2 system messages(AI 错误 fallback),hero block v-if `displayMessages.length === 0` 不成立 → hero block 不渲染 → folio corner 自然不出现。截图证明 hero 隐藏时(2 system messages 状态)0 `1/1` 误导信息。0-state 真状态(playwright 注 0 messages 时)需 dev-only empty-session URL param 触发(per UI-E12-R §5.3),不在 FIX2 scope。
3. **FIX1-1 contract 改名** — 从 "stable 4-row grid" 改成 "simple flex column"。如果 future worker 想 revert 回 grid,contract 会 fail(显式 lock)。如需 grid + flex 两种 mode,用 modifier class。
4. **stale E11 PNGs 仍未 re-capture** — UI-E12-QA §6.1 跟 QA2 §4.4 两次 deferred,3 个 pre-E11 PNG 仍未 fresh 截图。FIX2 不动(per brief "保留 stale E11 PNG 删除, 不要恢复" — 没说要 re-capture),defer 到下个 visual polish slice。
5. **640 mobile 2 system messages 状态** — 截图显示 hero 隐藏时 chat area 直接是 2 messages,无 hero 提示。这跟 0-state 行为不同(messages=[] 时 hero 显示),但 0-state 测试需要 dev-only URL param 才能可靠触发。

---

**END OF UI-E12-FIX2 REPORT** — 4/4 FIX2 contracts green, 1014/1014 全 test pass, build clean, 0 forbidden pattern, 2 blocker 全部定点修复。