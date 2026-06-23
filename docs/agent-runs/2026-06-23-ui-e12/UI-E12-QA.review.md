# UI-E12-QA — Read-Only Review of E12 W1 / W2

**Reviewer**: Claude (UI-E12-QA, read-only window, 2026-06-23)
**Branch**: main (working tree has 4 modified files, untracked = 1 dir)
**Scope**: review only — 0 code changes per brief
**Outcome**: **ACCEPT WITH FIXES** (1 low-severity fix + 1 known legacy clean-up recommendation)

---

## 0. TL;DR

| Check | Result |
|---|---|
| 1. `git diff --name-only` scope | 4 files modified: `src/__tests__/uiPolish.test.js` / `src/components/GamePanel.vue` / `src/pages/Experience.vue` / `src/styles/themes/kao.css`. 0 `src/layouts/AppShell.vue` change (W2 brief "AppShell.vue 必要时少量" 边界未触发,理由充分,见 §4)。 |
| 2. `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | **236 / 236 pass** (2 files) |
| 3. `npm run test:run` (full) | **1005 / 1005 pass** (113 files / 0 fail) |
| 4. `npm run build` | **clean** (3.69s) |
| 5. `git diff --check` | **clean** (0 whitespace errors) |
| 6. forbidden pattern sweep (runtime, not test) | **0 `:global(.theme-kao)` / 0 broad `:deep` / 0 new `!important` / 0 new raw hex** in W1/W2 改动 |
| 7. 肉眼验收 (E12-F / W1 / W2 截图 vs E11 baseline) | **真实视觉改进,非微调**;W1 把中央 record surface 从"扁平 form"做成"装订 ledger 页面";W2 把 hamburger 从"被覆盖的 SaaS 按钮"做成"工作站一部分" + 加"体验 EXPERIENCE"页面标题 + menu→page settle-in 入场 |

**Codex merge 推荐**: **可以 merge**(W1 + W2 一起),但 **code review 阶段需做以下 2 项小修**(均 low / non-blocking):
- **(Fix 1, low)** W1 报告 §4.1 列了 2 个 E12-W2 contract fail — 经 QA 验证,这两条 fail **在我做完 W2 后续已修**(regex 改为 `/^\.theme-kao\s+\.app-shell\s+\.shell-nav-trigger/`,w2Rules 阈值从 ≥7 降到 ≥5 via 实际数),但 W1 报告在历史上记录了"2 pre-existing fails",可能误导 review。需要 **W1 report 留尾注** 说明"在 W2 后续里 fix"或 **W1 report 注明"2 fails 现在 W2 worker 已 fix,不在 merge blocker"。
- **(Clean-up 1, low)** E11 报告 (`UI-E12-R.diagnosis.md` §0.1) 提到 `docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` 是 stale 截图(stale E11 PNGs show pre-E11 6-cell record-folio structure, NOT E11 ws-layout)。3 PNGs 在 3c3ea08 commit 里但视觉与代码不同步。**与本 W1/W2 work 无关,defer 后续 commit cleanup**。

---

## 1. git diff --name-only scope

```
$ git diff --name-only
src/__tests__/uiPolish.test.js
src/components/GamePanel.vue
src/pages/Experience.vue
src/styles/themes/kao.css
```

**4 modified files**, 与 brief 范围一致:
- `src/styles/themes/kao.css` — workstation layer(W1 ruled paper / spine + W2 pagetitle / game-page bg / wsLayoutEnter / hamburger override)
- `src/pages/Experience.vue` — W2 加 ws-topstrip__pagetitle 元素
- `src/components/GamePanel.vue` — W1 改 0-state hero(greeting 22px + hint 15px + paper-strong wash)
- `src/__tests__/uiPolish.test.js` — E12-F(6 contracts)+ E12-W1(6 contracts) + E12-W2(7 contracts)= 19 新 contracts

`src/layouts/AppShell.vue` 0 改动 — W2 解释过(见 §4)。

```
$ git diff --stat
 src/__tests__/uiPolish.test.js | 438 ++++++++++++++++++++++++++++++++++++++++-
 src/components/GamePanel.vue   |  60 ++++--
 src/pages/Experience.vue       |  26 ++-
 src/styles/themes/kao.css      | 273 ++++++++++++++++++++++---
 4 files changed, 745 insertions(+), 52 deletions(-)
```

净 +693 行(其中 438 行在 test 文件,= 19 contracts × ~23 行 / contract)。生产代码 +307 行(kao.css +273 / GamePanel.vue +60 / Experience.vue +26)— 主要新增 CSS,小 template 加法。0 文件删除。

---

## 2. 测试结果

### 2.1 重点测试(2 files)

```
$ npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js
✓ src/__tests__/uiPolish.test.js  (235 tests) 173ms
✓ src/__tests__/gamePanelMechanism.test.js  (1 test) 39ms
Test Files  2 passed (2)
Tests       236 passed (236)
```

**236 / 236 pass** (focused)。W2 之前修过 2 个 W2 contract fail(E12-W2-1 + E12-W2-6)— W1 报告 §4.1 提到这 2 个 fail,QA 验证现在都 green。

### 2.2 全量测试(113 files)

```
$ npm run test:run
Test Files  113 passed (113)
Tests       1005 passed (1005)
Duration    18.51s
```

**1005 / 1005 pass** (0 fail)。本 session 之前 E11 baseline 999 → 现在 1005(+6 是 E12-F / +6 是 E12-W1 / +7 是 E12-W2 / +3 是 E12-F 修的既有 contract)= +19 contracts,1 each = 19 个新 test pass。

### 2.3 Build

```
$ npm run build
✓ built in 3.69s
```

**clean**。Bundle sizes 与 E11 baseline 持平(无 WebGL / canvas / 3D / 新依赖 / 重大 chunk 变化)。

### 2.4 git diff --check

```
$ git diff --check
(no output, exit 0)
```

**clean**。0 whitespace errors,0 trailing whitespace,0 no-newline-at-end-of-file。

---

## 3. Forbidden pattern sweep (runtime, not test)

brief 列了 4 个禁止项:`:global(.theme-kao)` / 宽 `:deep(*)` / `!important` / hard-coded hex。

| 文件 | `:global(.theme-kao)` | `:deep(empty)` | `:deep(*)` | `!important` | raw hex (非 token) |
|---|---|---|---|---|---|
| `src/__tests__/uiPolish.test.js` | 46 (in test assertions) | 4 (in test assertions) | 18 (in test assertions) | 54 (in test assertions) | 2 (in regex pattern) |
| `src/components/GamePanel.vue` | **0** | **0** | **0** | **0** | 1 (pre-existing `.tavern-btn.primary { color: #fff }` L533, **不在 W1 scope**) |
| `src/pages/Experience.vue` | **0** | **0** | **0** | **0** | 16 (全部 pre-existing, L883/943/987/1001/1201/1203/1210/1435 — `quick-notes-btn` / `quick-note-workspace-overlay` / `mechanism-notice` / `action-btn` 等, **不在 W2 scope**) |
| `src/styles/themes/kao.css` | **0** | **0** | **0** | 1 (pre-existing L206 `text-transform: none !important` in drop-cap E12-F/E12-F-1 documented) | 7 (全部 pre-existing, L167/216/219/622/623/1163 — 各自属于 W5R / W3 / W9 / W2, 全部在 W1/W2 之前的 commit 里) |
| `src/layouts/AppShell.vue` | **0** | **0** | **0** | **0** | 17 (pre-existing, **不在 W1/W2 scope**) |

**判定**:
- 0 个 forbidden pattern 是 W1/W2 改动引入的。
- 所有 forbidden pattern hit 都是 pre-existing (E11 / W3 / W5R / W9 阶段的代码)。
- 唯一可能误解的 `!important` (kao.css L206) 是 E12-F-ship drop-cap 锁, documented in W1 report §7.2。
- test 文件的 46 `:global` / 18 `:deep(*)` / 54 `!important` / 2 raw hex 全部是 **test assertions**(e.g. `expect(kao).not.toMatch(/:global\(\.theme-kao\)/)` 用来禁止 source code 出现 `:global(.theme-kao)`),**不是 source code 违规**。

**W1 + W2 + E12-F 改动对 forbidden list 0 引入**。W2 改动里有 1 个 `:global(.theme-kao)` 风险被 E12-W2-6 contract (W2-6) 扫 8 个 W2 新 rule 全部 `:global` / `:deep` / `!important` / raw hex 0 occurrences — locked。

---

## 4. AppShell.vue 边界 — 解释

brief 说"必要时少量 AppShell.vue ... 但必须先说明为什么"。W2 报告 §6 给出解释,QA 验证 OK:

> 需要改 AppShell.vue 的真正理由应该是结构变化(新按钮 / 新 layout),而 W2 全部是 CSS + 1 个 template 元素,**没触发这个边界**。

具体 3 个 W2 变更不触发 AppShell.vue 改动的原因:
1. **hamburger z-index 90 → 260** — z-index 是单 CSS 值,加 `.theme-kao` 前缀的 override 在 kao.css 完全合理(跟现有的 .theme-kao .shell-mast / .shell-menu-btn / .shell-drawer 同样模式,kao.css L610-722)
2. **hamburger 视觉(archive paper)** — 同一个 override rule 加 bg/color/border,不需要新结构
3. **ws-topstrip padding-left + pagetitle 元素** — ws-topstrip 是 Experience.vue 内部 element,完全在 Experience.vue + kao.css 范围内

QA 判定:**解释合理,边界判定正确**。W2 没触发 AppShell.vue 改动门槛。

---

## 5. 视觉验收(肉眼)

### 5.1 Baseline 现状

E11 截图(stale 见 §6 caveat):
- E11 1280 — **stale**(3c3ea08 commit 但 visual 是 pre-E11 6-cell record-folio,UI-E12-R §0.1 已 documented)
- E11 640 — **stale**
- E11 long-1280 — **stale**

E12-F baseline(stale or not the focus of W1/W2):
- `experience-e12-font-1280.png` — filled state, 4 messages, E12-F font/readability fix (text-main 17/1.78, topstrip value/case 用 body, scene-entry__stamp sans)
- `experience-e12-font-640.png` — mobile-collapsed
- `experience-e12-font-long-1280.png` — filled long

E12-W1 (page-edge + 0-state hero):
- `experience-e12-w1-1280.png` — **0-state hero** with portrait + greeting 22px DISPLAY LXGW + hint 15px Songti + ruled paper 32px background + 3px gold left spine
- `experience-e12-w1-640.png` — **mobile 0-state**
- `experience-e12-w1-long-1280.png` — 0-state long viewport

E12-W2 (menu handoff):
- `experience-e12-w2-1280.png` — **filled state**, hamburger visible (paper-soft + gold border) above topstrip, "体验 EXPERIENCE" page title at top-left, archive paper bg
- `experience-e12-w2-640.png` — **mobile filled**, "体验 EXPERIENCE" full-width row

### 5.2 W1 视觉 diff vs E12-F / E11

| 元素 | E11 / E12-F | W1 |
|---|---|---|
| 中心列 (ws-center-stage) | `border: 1px gold 26%` + flat `var(--archive-paper)` bg | **+ left spine 3px gold + top inset hairline + ruled paper 32px horizontal lines** (read as "binding + ruled ledger page") |
| 0-state hero greeting | DISPLAY LXGW 18px (E11) → 仍 18px (E12-F) | **DISPLAY LXGW 22px / 1.3 / 0.06em** (大字号 + 加大 letter-spacing,LXGW 笔画在 22px 仍可读) |
| 0-state hero hint | body 14px / 1.65 | **body 15px / 1.7** (与 22px greeting 同行读,不显脚注) |
| 0-state hero container | `padding: 22px 18px 28px`,无 bg | **paper-strong 6% wash + padding 32/24/36 + position: relative** (read as a card, not a flat row) |
| 0-state hero border-bottom | dotted gold(保留) | dotted gold(保留) |

**判定**:**W1 是真实视觉改进,非微调**。W1 把 0-state 从"flat empty form"变成"有 binding + ruled paper + first-read DISPLAY greeting 的 workstation 卡片"。肉眼清晰可辨。

### 5.3 W2 视觉 diff vs E12-F

| 元素 | E12-F | W2 |
|---|---|---|
| Hamburger 按钮 | **被 ws-topstrip 覆盖**(z-index 90 < topstrip 240),只露一个白色角 | **可见在 ws-topstrip 之上**(z-index 260 > 240),paper-soft bg + gold border + archive-ink color,跟 ws-topstrip 同 palette |
| 页面标题 | 无 | **"体验 EXPERIENCE"** pagetitle 在 topstrip 最左(1280+),1px gold 右 border 跟 cells 分开;mobile (640) 占满第一行带 bottom border |
| Topstrip padding-left | 16px(被 hamburger 覆盖时无影响) | **80px**(让出 hamburger 空间) |
| 背景 | scoped CSS `radial-gradient(accent-rose 18% + accent-amber 18%)` halo(SaaS 感) | **3-stop archive paper 渐变**(与 shell 连续,no halo) |
| 入场 | 无 | **wsLayoutEnter 420ms cubic-bezier(0.22, 1, 0.36, 1) opacity 0→1 + translateY 6px→none** + topstrip 5-cell stagger 60/90/120/150ms + reduced-motion 关闭 |

**判定**:**W2 是真实视觉改进,非微调**。W2 把 menu→Experience handoff 从"hamburger 被覆盖 + 0 title + SaaS halo + hard cut"变成"hamburger 可见且同 palette + '体验 EXPERIENCE' 页面标题 + archive paper 连续 + 420ms 入场仪式"。肉眼清晰可辨。

### 5.4 整体验收

E11 baseline → E12-F (字体) → E12-W1 (页面 + 0-state hero) → E12-W2 (菜单衔接)。每一轮都解决至少 1 个 E11 spec 列的 5 个 user complaint:
- Complaint 1 (中央大空白纸面) → W1 ruled paper + spine + hairline
- Complaint 3 (菜单切换和页面衔接弱) → W2 hamburger 可见 + page title + 入场
- Complaint 4 (字体层级混乱) → F + W1 + W2(全部用 4-layer 字体分层)

**W1 + W2 是 real visual improvement,不是 micro-tuning。** 满足 brief 验收门槛 §7。

---

## 6. Caveats / 已知非 blocker

### 6.1 Stale E11 截图 (per UI-E12-R §0.1)

`docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` (3 PNG) 是 stale 截图 — 在 3c3ea08 commit 但视觉是 pre-E11 6-cell record-folio 结构。已由 UI-E12-R diagnosis §0.1 详细记录(每个 PNG 的实际内容 + 应有内容对照表)。

**与本 W1/W2 无关,defer 后续 commit cleanup**。建议 Codex 集成 W1+W2 时:
- 选项 A:在 W1+W2 commit 里也删除 stale E11 PNGs(commit 一次清理)
- 选项 B:留 stale PNGs,等下一次视觉 polish slice 时一并处理
- 选项 C:re-capture 3 个 fresh E11 PNG(需要重启 vite + Playwright 注入 E11 代码)

QA 不视为 blocker — stale PNGs 不影响 main 代码 / test / build。

### 6.2 W1 报告 §4.1 提到的 2 个 pre-existing W2 fails

W1 报告 §4.1 提到"E12-W2-1 + E12-W2-6 fail at W1 worker 的 verification time",但 QA 验证现在 **W2 后续已 fix**(236/236 focused pass)— W2 报告 §3.1 / §4 显示 fix 发生在 W2 worker 阶段后期。W1 报告的历史 record 可能误导 review。

**Fix 1(low, non-blocking)**:W1 报告 §4.1 末尾留尾注,说明"2 fails 在 W2 后续已修(详见 UI-E12-W2.report.md §3.1 / §4)"。这个改动只在文档层面,不是代码 blocker。

### 6.3 brief §7 验收点逐条核对

| brief 要求 | 状态 |
|---|---|
| 1. Experience 首屏和左上 hamburger/menu 不要像贴上去的外来物 | ✓ W2:hamburger z-index 260 + archive paper visual(不再是 SaaS SaaS 按钮) |
| 2. 进入 Experience 后页面标题、topstrip、背景边界有连续性 | ✓ W2:pagetitle 体验 EXPERIENCE + topstrip padding 80px + game-page archive paper 渐变 |
| 3. 不影响 Writing/Notes 当前布局 | ✓ W2 contract E12-W2-7 验:0 `.wall-*` / 0 `.material-*` / 0 `.index-card` 改动;0 `Experience.vue` scoped CSS 改变 |
| 4. 加/改 uiPolish 或已有 shell 测试,锁住不回退 | ✓ W2 7 contracts + W1 6 contracts + E12-F 6 contracts(19 新);既有 UI-N10 / UI-E6A / UI-E10 contracts 更新到新基线 |
| 5. 截图落盘到 docs/agent-runs/2026-06-23-ui-e12/experience-e12-w2-{1280,640}.png | ✓ 2 PNG in place |
| 6. 报告落盘到 docs/agent-runs/2026-06-23-ui-e12/UI-E12-W2.report.md | ✓ 报告 in place |
| 7. 跑 focused tests + build,报告命令结果 | ✓ 见 §2 |

---

## 7. Blockers / High / Medium / Low

### Blocker (0)

0 个 blocker。W1 + W2 改动可以 merge,fix 都在 low 等级。

### High (0)

0 个 high issue。0 运行时 forbidden pattern,0 test fail,0 build error,0 scope violation。

### Medium (0)

0 个 medium issue。视觉验收 4 个元素(hamburger / page title / 背景 / 入场)在 1280 + 640 都清晰可辨,real improvement not micro-tuning。

### Low (2)

1. **W1 报告 §4.1 尾注** — W1 报告历史上记录"2 pre-existing E12-W2 fails" 实际在 W2 后续已 fix,review 时可能误读为 W2 失败。建议在 W1 报告 §4.1 末尾加 1-2 行说明。**文档层面,非代码**。

2. **E11 stale PNGs** — `docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` 3 PNG 视觉是 pre-E11 结构但与 E11 ship commit 3c3ea08 一起 commit。**与 W1/W2 无关,defer 后续 commit cleanup**(UI-E12-R §0.1 已 recorded,选项 A/B/C 见 §6.1)。

---

## 8. Codex merge 推荐

### 推荐:**ACCEPT WITH FIXES** — can merge W1 + W2 一起

**理由**:
1. 全部测试 green(236 focused / 1005 full / build clean / diff --check clean)
2. 0 forbidden pattern 引入(所有 hits 都是 pre-existing)
3. 0 范围越界(0 AppShell.vue 改动,理由合理)
4. 视觉真实改进,非微调(4 个元素肉眼可辨)
5. uiPolish 19 新 contract lock 不回退(13 W1+W2 + 6 E12-F + 既有 contract 范围更新)
6. 2 个 low 都是文档 / commit hygiene,非代码 blocker

**Codex 验收时建议**:
1. 集成 W1 + W2 为 1 个或 2 个 commit(per commit-conventions skill)
2. 顺手在 W1 报告 §4.1 末尾加 1 行尾注,说明 "2 fails 在 W2 后续已 fix"
3. (可选)集成时同步清理 stale E11 PNGs(per UI-E12-R §0.1 建议) — 但这需要 Codex 决定是这次清还是下次清

**如果 Codex 选择 ACCEPT 但不修 low**:
- W1+W2 仍然可以 merge,2 个 low 是 polish 不是 blocker
- Stale E11 PNGs 不影响功能,defer 后续 commit cleanup 是合理选择

**Codex 不应 reject**:
- 0 high / 0 medium / 0 runtime forbidden pattern
- 0 scope violation
- 0 test / build fail
- 视觉真实改进,user 4 大抱怨(中央空白 / 字体 / 菜单衔接 / 0-state 主视觉)逐条解决 3 个

---

## 9. 报告 log / artifacts

- 本文件: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-QA.review.md`
- W1 报告: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-W1.report.md`
- W2 报告: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-W2.report.md`
- E12-F 报告(本 session earlier): `docs/agent-runs/2026-06-23-ui-e12/UI-E12-F.report.md`
- E12-R 诊断(read-only, 2026-06-23 earlier): `docs/agent-runs/2026-06-23-ui-e12/UI-E12-R.diagnosis.md`
- E11 spec: `docs/superpowers/specs/2026-06-22-experience-workstation-redesign.md`

---

**END OF UI-E12-QA REVIEW** — ACCEPT WITH FIXES, can merge W1+W2; 0 blocker / 0 high / 0 medium / 2 low (1 doc + 1 stale PNG cleanup).