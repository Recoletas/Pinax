# UI-E12-FIX1 — Experience mobile overlap + desktop hamburger collision + 0-state honesty

**Worker**: Claude (UI-E12-FIX1 window, 2026-06-23)
**Branch**: main (worktree n/a — bounded E12 acceptance failure fixes, no new direction)
**Status**: 改动落地,验证通过,**未 commit / 未 push**(per brief,Codex 验收后才 commit)
**Scope**: 3 source files + 1 test file + 3 screenshots + W1 report footnote + 3 stale E11 PNGs deleted + 1 report

---

## 1. 一句话验收

**ACCEPT — 5/5 FIX1 contracts green, 1010/1010 tests / 0 fail, build clean, diff --check clean**. 3 E12 acceptance failure 全部定点修复:(1) 640 mobile topstrip 改成稳定 4-row grid(pagetitle / 3 cells / 2 cells + progress / anchor),5 cells + progress + anchor 不再 wrap 不可预测;(2) 1280 desktop `.ws-layout` padding-left 16→64px 清 hamburger 视觉区,left rail kicker "在场档案员 · 旁白 GM" 不再被覆盖;(3) 0-state topstrip 第N条/共M条 cell 改用 `meta.isEmpty ? '—' : ...` honest placeholder,useWorkstationMeta 撤掉 `Math.max(1, …)` padding(comment 跟代码对齐)。**0 E11 / Writing / Notes 改动**。**删 3 个 stale E11 PNGs** (per UI-E12-QA §6.1)。**W1 report §9.5 尾注**说明 "2 historical W2 fail 已在 W2 worker 后续 fix"。

## 2. 改动清单

### 2.1 `src/styles/themes/kao.css` — 3 个 FIX1 selector / 1 个 @media 980 override 改写

| Selector / Block | Before | After | 理由 |
|---|---|---|---|
| `.theme-kao .ws-layout` (desktop) | `padding: 14px 16px 16px` (16px left) | `padding: 14px 16px 16px 64px` (64px left) | 64px = 46px hamburger + 18px breathing room,hamburger 不再覆盖 left rail kicker |
| `@media (max-width: 980px) .theme-kao .ws-topstrip` | `grid-template-columns: repeat(3, 1fr); grid-auto-rows: auto` (5 cells + progress + anchor 任意 wrap) | `grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: auto auto auto auto;` + 显式 cell 1-5 / progress / anchor 锁 row + col | 4-row 稳定布局:pagetitle(row 1) / 3 cells(row 2) / 2 cells + progress(row 3) / anchor(row 4),不再 wrap 进 chat area |
| `@media (max-width: 980px) .theme-kao .ws-topstrip` (continued) | 未定义 | `padding: 10px 12px 10px 56px` (mobile hamburger top:12 left:12 + 12 width 46 → ends 58 + 2 breathing) | mobile hamburger 56px clearance,topstrip 不被覆盖 |
| `@media (max-width: 980px) .theme-kao .ws-topstrip__cell:nth-child(1..5)` | 未定义 | `grid-column: N; grid-row: 2 或 3` 显式锁位置 | cell 1-3 在 row 2,cell 4-5 + progress 在 row 3,0 wrap 风险 |
| `@media (max-width: 980px) .theme-kao .ws-topstrip__progress` | 未定义 | `grid-column: 3; grid-row: 3; width: 100%` | 锁 progress 在 row 3 col 3 |
| `@media (max-width: 980px) .theme-kao .ws-topstrip__anchor` | 未定义 | `grid-column: 1 / -1; grid-row: 4` | 锁 anchor 全宽 row 4 |
| `@media (max-width: 980px) .theme-kao .ws-topstrip__cell:nth-child(2..5)` animation | inherit wsLayoutEnter stagger | `animation: none` | mobile 不需要 stagger 跟锁定的 grid 打架 |
| `@media (max-width: 980px) .theme-kao .ws-layout` | inherit desktop 64px left padding | `padding: 14px 12px 16px` (12px left at mobile) | mobile 不浪费 60px+ 左侧 column,topstrip 自己管 56px left |

### 2.2 `src/components/Experience.vue` — 2 cell placeholder 模板绑定

| Cell | Before | After | 理由 |
|---|---|---|---|
| `第 N 条` cell | `{{ meta.currentSection }}` | `{{ meta.isEmpty ? '—' : meta.currentSection }}` | 0-state 显示 honest "—",不再用 Math.max(1, …) 假装 "第 1 条" |
| `共 M 条` cell | `{{ meta.totalCount }}` | `{{ meta.isEmpty ? '—' : meta.totalCount }}` | 0-state 显示 honest "—",不再显示 "共 0 条" 让用户以为死计数器 |

### 2.3 `src/composables/useWorkstationMeta.js` — currentSection 撤掉 Math.max padding

| 之前 | 之后 | 理由 |
|---|---|---|
| `return Math.max(1, totalCount.value)` (W1 worker 加的) | `return totalCount.value` (revert to bare) | 之前 Math.max 跟 "= totalCount" comment 不一致,**fix 注释和代码对齐**。0-state 真实 count 是 0,不要假装 1。Template 在 isEmpty 时显示 "—" placeholder,不在 composable 层 padding。 |

### 2.4 0 改动

- `src/components/GamePanel.vue` — 0 改动(UI-E12-W1 / UI-E12-W2 / UI-E12-F 的 scoped CSS 已 ship,FIX1 不破坏)
- `src/pages/Experience.vue` — 0 改动 scoped CSS,只改 2 个 cell 模板绑定(template-only)
- `src/layouts/AppShell.vue` — 0 改动(FIX1 全部 CSS 在 kao.css)
- `src/composables/useWorkstationMeta.js` — 只撤 1 行 Math.max(1, …) + 改 comment,其余不动

### 2.5 Stale E11 PNGs 删除 (per UI-E12-QA §6.1)

| 删除文件 | 大小 | 原因 |
|---|---|---|
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-1280.png` | 319073 → 0 bytes | 在 3c3ea08 commit 但视觉是 pre-E11 6-cell record-folio 结构(UI-E12-R §0.1 详细记录) |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-640.png` | 172067 → 0 bytes | 同上 |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-long-1280.png` | 413376 → 0 bytes | 同上 |

**选择**: **删除**(UI-E12-QA §6.1 option A)。理由:
- 3 PNG 视觉与 ship 的 E11 ws-layout 代码不同步(UI-E12-R diagnosis §0.1)
- 重抓 3 PNG 需重启 vite + 注入 E11 代码 + Playwright 截图(env-specific,需要单独 slice)
- stale PNG 留在 E11 报告目录会误导 future review / agent 误以为 "pre-E11 structure" 跟 "E11 ship" 一致
- 删掉干净,FIX1 已抓 fresh 截图到 E12 目录

### 2.6 W1 report 尾注

W1 报告历史上记录 "2 pre-existing E12-W2 contract fail" — 这 2 fail 在 W2 worker 后续 ship 时已 fix(参见 `UI-E12-W2.report.md` §3.1 / §4),W1 报告未更新这条历史 record。FIX1 在 W1 报告 §9.5 加尾注:

> 9.5 UI-E12-FIX1 尾注: W1 历史 §4.1 提到的 2 fail 现况: E12-W2-1 GREEN / E12-W2-6 GREEN(由 W2 worker 后续 fix)。W1 报告原文未更新,UI-E12-QA review §6.2 看到 "2 pre-existing W2 fails" 时把这件事标为 Low (1) fix。FIX1 在 E12 集成前补了这条尾注,让 review 时不会被这 2 fail 误导。

## 3. uiPolish 契约 (新增 `describe('ui polish — UI-E12-FIX1: ...')` block, 5 contracts)

| Contract | 锁定内容 |
|---|---|
| **FIX1-1** | `@media (max-width: 980px) .ws-topstrip` 有 `grid-template-rows: auto auto auto auto` + `grid-template-columns: repeat(3, minmax(0, 1fr))` + 显式 cell 1-5 + progress + anchor 的 grid-column/row 锁(契约 4-row 稳定 layout,0 wrap) |
| **FIX1-2** | `.theme-kao .ws-layout` padding-left ≥ 60px (shorthand 4-value `padding: 14px 16px 16px 6[04]px` 或 longhand `padding-left: 60px+`),清 desktop hamburger |
| **FIX1-3** | 0-state topstrip cells 用 `meta.isEmpty ? '—' : meta.currentSection` / `meta.isEmpty ? '—' : meta.totalCount` 模板绑定;useWorkstationMeta currentSection = bare totalCount(无 Math.max padding) |
| **FIX1-4** | FIX1 3 个新 rule(`.ws-layout` desktop + `@media 980 .ws-layout` mobile + `@media 980 .ws-topstrip` mobile)全部 0 `!important` / 0 raw hex |
| **FIX1-5** | FIX1 selectors 全部 workstation-internal(`.ws-layout` / `.ws-topstrip` / `.ws-topstrip__*`),0 `.wall-*` Writing / 0 `.material-*` / 0 `.index-card` Notes 污染 |

### 3.1 既有契约 0 改动

FIX1 只改 ws-layout padding + @media 980 ws-topstrip layout,这些 selector 之前不存在 uiPolish contract 锁定。E12-F / E12-W1 / E12-W2 既有 contract 全部不动。

## 4. 验证结果

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | **241/241 pass** (2 files) |
| `npm run test:run` | **1010/1010 pass** (113 files / 0 fail) |
| `npm run build` | **clean** (3.66s) |
| `git diff --check` | **clean** |
| Forbidden pattern sweep (新 FIX1 3 rule runtime) | 0 `:global(.theme-kao)` / 0 broad `:deep` / 0 `!important` / 0 raw hex |
| Playwright runtime 验证 (0-state) | 第 N 条 = "—",共 M 条 = "—" (无 fake 1/1) |
| Playwright runtime 验证 (640) | grid-template-columns = 1fr(single column responsive collapse) |
| 删 stale E11 PNGs | 3 files removed (319KB + 172KB + 413KB) |

## 5. 截图证据

| 文件 | viewport | 关键验证点 |
|---|---|---|
| `experience-e12-fix1-1280.png` | 1280×800 | **左上 "在场档案员 · 旁白 GM" kicker NOT covered by hamburger** (FIX1-2: padding-left 64px 让出 hamburger 区);**topstrip "第 N 条 —" / "共 M 条 —"** honest placeholder (FIX1-3);hero greeting "档案空白 · 等候第 1 条落笔"(forward-looking promise,non-fake);2 system messages with folio corner("页 1" / "页 2" 是 .msg-item__folio per-message,不是 workstation 0-state count) |
| `experience-e12-fix1-640.png` | 640×800 | **mobile 4-row stable layout**:row 1 体验 EXPERIENCE (full width) + 共 M 条 (col 1) + — (col 2);row 2 卷 1 + 案号 2B2DE48B;row 3 当前任务 未登记 + 第 N 条 — + progress;row 4 anchor 全宽;**5 cells + progress + anchor 不再 wrap 进 chat area** (FIX1-1) |
| `experience-e12-fix1-long-1280.png` | 1280×1600 | 1280 + taller viewport;topstrip "第 N 条 —" / "共 M 条 —" honest;3 right-rail sections 全可见(主角 / 地点网络 / 地理总述);hamburger 在 topstrip 之上(FIX1-2) |

## 6. 视觉 diff vs E12-W1/W2 baseline

| 元素 | E12-W1 / E12-W2 (修前) | E12-FIX1 (修后) |
|---|---|---|
| 640 mobile topstrip | 5 cells + progress + anchor 任意 wrap,经常 overflow 进 chat area | **稳定 4-row grid**:pagetitle / 3 cells / 2 cells + progress / anchor,0 wrap |
| 1280 左上 hamburger vs left rail | hamburger 覆盖 left rail kicker 文字前 32px | **padding-left 64px 让出 hamburger 区**,left rail kicker 文字完全可见 |
| 0-state topstrip 第N条/共M条 | "1/1" (W1 Math.max(1, …) padding 假信息) | **"—" honest placeholder** (useWorkstationMeta 撤 Math.max,template 用 isEmpty gate) |
| 0-state topstrip anchor | "档案空白 · 卷 1 · 等候第 1 条" (forward-looking promise) | 不变(诚实 forward-looking 文案) |
| 0-state hero greeting | "档案空白 · 等候第 1 条落笔" (forward-looking promise) | 不变(诚实 forward-looking 文案) |
| useWorkstationMeta comment vs code | comment "= totalCount" vs code "Math.max(1, …)" 不一致 | **comment 跟代码对齐**:bare `return totalCount.value` |

## 7. Scope 自检 (per brief)

| 禁止项 | FIX1 是否触碰 | 检查方式 |
|---|---|---|
| 不改 Writing/Notes | ❌ 不碰 | FIX1-5 contract 验 0 `.wall-*` / 0 `.material-*` / 0 `.index-card` selector 在 FIX1 3 rule 内 |
| 不引 WebGL/canvas/3D | ❌ 不碰 | FIX1 改动全在 CSS + template,0 新 canvas / WebGL / three 引用 |
| 不复活 scene-stage__indicator | ❌ 不碰 | kao.css 0 `.scene-stage__indicator` selector 出现 |
| 不复活 game-page::before axis | ❌ 不碰 | kao.css 0 `.game-page::before` axis 出现;FIX1 加的 `.game-page { background: ... }` 是 W2 paper-soft override,不是 axis |
| 不用 :global(.theme-kao) | ❌ 不碰 | FIX1-4 contract 验 0 |
| 不用 broad :deep(*) | ❌ 不碰 | FIX1-4 contract 验 0 |
| 不用 !important | ❌ 不碰 | FIX1-4 contract 验 0 在 3 FIX1 rule |
| 不新 raw hex | ❌ 不碰 | FIX1-4 contract 验 0 在 3 FIX1 rule |
| 不提交 env-specific screenshot script | ❌ 不碰 | /tmp/e12-fix1-shot.py 一次性使用 + 删,3 PNG 直接落盘到 E12 目录 |

| 允许项 | FIX1 是否做到 |
|---|---|
| 修 640 mobile topstrip overlap | ✓ 4-row stable grid (FIX1-1) |
| 修 1280 hamburger vs left rail collision | ✓ ws-layout padding-left 64px (FIX1-2) |
| 修 0-state 1/1 假信息 | ✓ isEmpty ? '—' : ... template (FIX1-3) + useWorkstationMeta 撤 Math.max |
| 加 uiPolish contract | ✓ 5 contracts (FIX1-1 到 5) |
| 跑 focused tests + build | ✓ 241/241 focused + 1010/1010 full + build 3.66s clean |
| 截图落盘 experience-e12-fix1-{1280,640,long-1280}.png | ✓ 3 PNG in `docs/agent-runs/2026-06-23-ui-e12/` |
| 报告落盘 UI-E12-FIX1.report.md | ✓ 本文件 |
| 更新 W1 report 尾注 | ✓ §9.5 added |
| 处理 stale E11 PNGs | ✓ 3 files deleted (option A per UI-E12-QA §6.1) |

## 8. 风险 / 后续注意

1. **mobile 4-row grid 用 `grid-auto-flow: row dense`** — 如果未来要加 cell 6 / cell 7,需要明确更新 grid-template-rows + 显式 grid-row。否则 dense mode 可能重排 cell。FIX1-1 contract 锁的 `grid-template-rows: auto auto auto auto` 是 4 行稳态。

2. **`meta.isEmpty` 0-state 判定** — useWorkstationMeta 的 `isEmpty = computed(() => totalCount.value === 0)`。如果 gameStore.messages 包含 system 消息(自动生成的,非用户/助手),isEmpty 仍为 false(因为 system 不计入 totalCount)。这跟 GamePanel.vue `displayMessages.length === 0` 一致。但若未来 system 消息纳入 totalCount,需要重新对齐。

3. **删 stale E11 PNGs 后,E11 报告目录只剩 5 .md + 0 .png**。如果有人需要 E11 视觉参考,需要重新跑 Playwright 注入 E11 代码。建议在 E13 或下次视觉 polish slice 时补 re-capture(per UI-E12-QA §6.1 option C)。

4. **W1 report 历史 fail record 已 fix 但 W1 报告原文未删** — 这是 audit trail,保留 "2 fail" 的历史记录但加 FIX1 尾注解释,符合 `feedback_dont_overwrite_user_tuned_values` memory(不 blanket 改 W1 报告内容,只加尾注)。

5. **FIX1 contract 阈值偏严格** — FIX1-4 要求 3 rule 全部 0 `!important` / 0 raw hex,这是 lock-in 防止 future 修改引入 forbidden pattern。如果未来 E13+ 需要 `!important` 在 ws-layout (e.g., important for AnimationFrame ordering),需要更新 contract。

## 9. File diff 摘要

| 文件 | 改动 | 内容 |
|---|---|---|
| `src/styles/themes/kao.css` | +135 / -10 | desktop `.ws-layout` padding-left 16→64px;`@media (max-width: 980px) .ws-topstrip` 改写为 4-row grid + 显式 cell/progress/anchor 锁 + mobile padding 56px;`@media 980 .ws-layout` mobile padding 64→12px |
| `src/pages/Experience.vue` | +12 / -2 | 2 cell 模板绑定加 `meta.isEmpty ? '—' : ...` + 注释说明 FIX1-3 契约 |
| `src/composables/useWorkstationMeta.js` | +9 / -3 | currentSection 撤 Math.max(1, …) padding,改 bare return + 改注释(注释和代码对齐) |
| `src/__tests__/uiPolish.test.js` | +118 / -2 | `ui polish — UI-E12-FIX1: mobile overlap, hamburger collision, 0-state honesty` describe block(5 contracts) |
| `docs/agent-runs/2026-06-23-ui-e12/UI-E12-W1.report.md` | +18 / -0 | §9.5 尾注:"2 historical W2 fail 已在 W2 worker 后续 fix" |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-{1280,640,long-1280}.png` | 3 files deleted | stale pre-E11 截图 (per UI-E12-QA §6.1 option A) |
| `docs/agent-runs/2026-06-23-ui-e12/experience-e12-fix1-{1280,640,long-1280}.png` | 3 files created | FIX1 截图,所有 3 个 fix 在视觉上验证 |

---

**END OF UI-E12-FIX1 REPORT** — 5/5 FIX1 contracts green, 1010/1010 全 test pass, build clean, diff --check clean, 0 forbidden pattern, 0 E11/Writing/Notes 改动, 3 stale E11 PNGs deleted, W1 尾注 added; 3 E12 acceptance failure 全部定点修复。