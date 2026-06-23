# UI-E12-QA2 — Read-Only Review of FIX1 (PASS 2 of W1/W2)

**Reviewer**: Claude (UI-E12-QA2, read-only window, 2026-06-23)
**Branch**: main (working tree has 5 modified files, untracked = 1 dir)
**Scope**: review only — 0 code changes per brief
**Outcome**: **NEEDS FIXES** (640 layout overlap + folio corner still hardcoded)

---

## 0. TL;DR

| Check | Result |
|---|---|
| 1. `git diff --name-only` scope | 5 files modified: `src/__tests__/uiPolish.test.js` / `src/components/GamePanel.vue` / `src/composables/useWorkstationMeta.js` / `src/pages/Experience.vue` / `src/styles/themes/kao.css` — 5th file (`useWorkstationMeta.js`) is W1 扩展,brief "必要时可碰" 已 covered。**scope OK**。 |
| 2. 640 overlap (体验 / topstrip / 输入区) | ❌ **FAIL — 5 元素在 640 顶部互相堆叠** |
| 3. 1280 readability (hamburger / pagetitle / left rail) | ⚠️ pagetitle + topstrip + left rail 3 列清晰,但汉堡按钮在视口外不可见 |
| 4. Folio corner hardcoded `1 / 1` | ❌ **STILL FAIL — `GamePanel.vue:25` 仍写死 `<span class="chat-container__hero-folio-page">1 / 1</span>`** |
| 5. Stale E11 PNGs (`experience-e11-*.png`) | ❌ **STILL 3 个 stale PNG 未删除 / 未覆盖**(与本 QA2 同 commit 的 fix1 没动) |
| 6. forbidden pattern sweep (runtime) | ✅ 0 `:global(.theme-kao)` / 0 broad `:deep` / 0 新 `!important` / 0 新 raw hex(W1+W2+FIX1 引入) |
| 7a. focused test (uiPolish + gamePanelMechanism) | ✅ **236 / 236 pass** |
| 7b. full test (113 files) | ✅ **1005 / 1005 pass** |
| 7c. build | ✅ **clean** (3.70s) |
| 7d. git diff --check | ✅ **clean** (exit 0) |

**Codex merge 推荐**: **NEEDS FIXES**

**理由**:
- 640 layout overlap 严重 — brief 验收点 §2 红线("只要 640 还有重叠,直接 NEEDS FIXES")
- folio corner `1 / 1` 写死 — criterion #4 红线("不能写死 misleading `1 / 1`,注释和显示一致")
- stale E11 PNGs 未清理 — 与本 FIX1 无关,但 QA1 已 deferred 一次,本次仍 deferred 算 acceptable

**FIX1 部分完成**:
- ✅ Topstrip honest placeholder(`Experience.vue:56,60` 加 `meta.isEmpty ? '—' : …` 三元 gating,0-state 显示 "—" 而不是 fake "1/0" 或 "1/1")
- ✅ currentSection revert 回 bare `return totalCount`(移除 W1 的 `Math.max(1, …)` padding)
- ❌ Folio corner `1 / 1` 未跟随修正(仍是 hardcoded literal)

---

## 1. git diff --name-only scope

```
$ git diff --name-only
src/__tests__/uiPolish.test.js
src/components/GamePanel.vue
src/composables/useWorkstationMeta.js
src/pages/Experience.vue
src/styles/themes/kao.css
```

**5 modified files**:
- `src/styles/themes/kao.css` — W1 center spine + ruled paper + tab strip + dead orphan 删除
- `src/components/GamePanel.vue` — W1 hero 工作台 + folio corner + dark mode wash + 760px breakpoint
- `src/pages/Experience.vue` — W1 tab strip + handleQuickAction 扩展 + FIX1 topstrip `isEmpty` gating
- `src/composables/useWorkstationMeta.js` — W1 `currentSection` 别名修复 + FIX1 revert 回 bare + 注释更新
- `src/__tests__/uiPolish.test.js` — 6 W1 contracts + 4 既有 contract update

vs brief 4-file scope,brief 第 1 段说 "必要时可碰 `src/composables/useWorkstationMeta.js`",所以 5th file 在范围内。

**无意外文件**(无 `src/stores/` / `src/services/` / `src/router/` / `src/server/` / `src/layouts/AppShell.vue` 改动)。

```
$ git diff --stat (approximate, 与 QA1 时段比)
 src/__tests__/uiPolish.test.js       | ~560 ++++++++-
 src/components/GamePanel.vue         | ~110 +++-
 src/composables/useWorkstationMeta.js | ~13 ++-
 src/pages/Experience.vue             | ~30 ++-
 src/styles/themes/kao.css            | ~280 ++++--
 5 files changed, ~990 insertions(+), ~80 deletions(-)
```

净 +910 行(其中 560 行在 test 文件 = ~26 contracts × ~22 行)。生产代码净 +350 行,主要是 W1 + W2 扩展。

---

## 2. 测试结果

### 2.1 focused test

```
$ npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js
✓ src/__tests__/uiPolish.test.js  (235 tests) 174ms
✓ src/__tests__/gamePanelMechanism.test.js  (1 test) 37ms
Test Files  2 passed (2)
Tests       236 passed (236)
```

**236 / 236 pass** ✅

### 2.2 full test

```
$ npm run test:run
Test Files  113 passed (113)
Tests       1005 passed (1005)
Duration    19.18s
```

**1005 / 1005 pass** ✅(0 fail,0 skip new)

### 2.3 build

```
$ npm run build
✓ built in 3.70s
```

**clean** ✅

### 2.4 git diff --check

```
$ git diff --check
exit: 0
```

**clean** ✅

---

## 3. Forbidden pattern sweep (runtime, not test)

| 文件 | `:global(.theme-kao)` | `:deep(empty)` | `:deep(*)` | `!important` | raw hex |
|---|---|---|---|---|---|
| `src/__tests__/uiPolish.test.js` | 47 (asserts) | 4 (asserts) | 18 (asserts) | 56 (asserts) | 2 (regex) |
| `src/components/GamePanel.vue` | **0** | **0** | **0** | **0** | 1 (pre-existing `#fff` L554) |
| `src/pages/Experience.vue` | **0** | **0** | **0** | **0** | 16 (all pre-existing) |
| `src/composables/useWorkstationMeta.js` | **0** | **0** | **0** | **0** | **0** |
| `src/styles/themes/kao.css` | **0** | **0** | **0** | 1 (pre-existing drop-cap `text-transform: none !important` L206) | 7 (token defs in `:root.theme-kao` + `.theme-kao.theme-dark` L36-59) |

**判定**:
- W1 + W2 + FIX1 改动 **0 forbidden pattern 引入**
- 所有 hit 都是 pre-existing(E11 / W3 / W5R / W9 阶段代码 + token definitions)
- test 文件的 47 `:global` / 18 `:deep(*)` / 56 `!important` / 2 raw hex 全部是 test assertions(negative match 用于禁止 source code 出现 forbidden pattern)
- useWorkstationMeta.js 是全 clean

✅ **criterion #6 PASS**

---

## 4. 视觉验收

### 4.1 ⚠️ Criterion #2 — 640 overlap (FAIL)

`experience-e12-w1-640.png`(W1 阶段截图,FIX1 后未重抓)显示:

**5 元素在 640 顶部互相堆叠**:
1. **最顶层**: "在场档案员 · 旁白 GM" + ws-left-rail kicker (在 ws-left-rail 列内,但 @media 980px breakpoint 把它转成 row,挤到顶部)
2. **次层**: "卷 三 · 1 · 卷1 · 等候第 1 条" topstripAnchor 文字
3. **再次**: "体验 EXPERIENCE" pagetitle(占满第一行)
4. **再次**: 5-cell topstrip(卷 / 案号 / 当前任务 / 第N条 / 共M条 挤在 1 行 cell 内)
5. **底部**: hero greeting "档案空白 · 等候第 1 条落笔" 跟 progress cell 共占一行

视觉上 5 元素全部 visible 在 viewport top 200px 内,但都挤在一起,**没有任何 breathing room**,读起来像"5 张便签纸堆在桌面"而非"分层 workstation layout"。

**根因**:
- `@media (max-width: 980px) .ws-topstrip { grid-template-columns: repeat(3, 1fr); grid-auto-rows: auto; }`(kao.css L2530-2534)把 5 cell 强行塞进 3 列,加上 progress cell + pagetitle + anchor = 7 个 children 排进 3 列 grid,严重溢出
- `@media (max-width: 980px) .ws-left-rail { flex-direction: row; overflow-x: auto; }`(kao.css L2552-2556)把 left rail 转成水平 scroll row,跟 topstrip 顶部碰撞
- 980 breakpoint 把 ws-layout 折叠成 1fr(grid-template-columns: 1fr),但 left rail + topstrip + center stack 顺序未优化
- 760px breakpoint 又把 hero 切成 1 列,但此时 topstrip 已经挤得不能再挤

**判定**: ❌ **NEEDS FIXES** per brief "只要 640 还有重叠,直接 NEEDS FIXES"

**FIX1 没动 640 layout**:
- FIX1 仅修了 topstrip `isEmpty ? '—' : value` gating(`Experience.vue:56,60`)+ currentSection revert
- FIX1 没动 ws-topstrip / ws-left-rail 的 @media rules,所以 640 overlap 仍存在

### 4.2 ⚠️ Criterion #3 — 1280 readability (PARTIAL)

`experience-e12-w1-1280.png`(W1 阶段截图,FIX1 后未重抓):

**1280 layout OK**:
- 体验 EXPERIENCE pagetitle 在 topstrip 最左(W2 ship),1px gold 右 border 跟 cells 分开
- 5-cell topstrip 横向铺开(卷 / 案号 / 当前任务 / 第N条 / 共M条)+ progress cell 5 框
- 在场档案员 kicker 在 ws-left-rail 列内,不与 topstrip 碰撞
- 右栏 tab strip "卷宗一(active DISPLAY LXGW 10px) / 卷宗二 / 卷宗三" 顶部对齐
- Center 0-state hero block:portrait + greeting 22px + hint 15px + 3 CTA + folio corner "PENDNG · 1 / 1"

**汉堡按钮**:
- 视口截图中不可见 — 因为 viewport 顶部从 y=0 开始,而 hamburger 是 `position: fixed; top: 16px; left: 16px`,应该在 viewport 左上角
- 但视口左边缘看到 "体验 EXPERIENCE" pagetitle,这意味着 hamburger 在视口外侧 / 被 ws-layout padding 遮盖 / z-index 仍 wrong
- 需要 viewport 截图扩大 / fullPage screenshot 才能确认 hamburger 位置

**判定**: ⚠️ **1280 layout OK,但 hamburger 不可见,需 fullPage 截图确认**

### 4.3 ❌ Criterion #4 — Folio corner hardcoded (STILL FAIL)

`src/components/GamePanel.vue:22-26`:

```vue
<span class="chat-container__hero-folio" aria-hidden="true">
  <span class="chat-container__hero-folio-case">{{ caseNoShort }}</span>
  <span class="chat-container__hero-folio-sep">·</span>
  <span class="chat-container__hero-folio-page">1 / 1</span>
</span>
```

**问题**:
- `1 / 1` 是 hardcoded literal,不是 computed
- 注释说"page index shows currentSection vs totalCount",但模板里没有 `{{ ... }}` 表达式,只是 static text
- 在 0-state(totalCount=0),显示 "1 / 1" 暗示有 1 条 message,**misleading**
- 注释与显示**不一致**(criterion #4 红线)

**FIX1 应跟随修正但未做**:
- FIX1 把 topstrip 的 `第N条` + `共M条` 改成 `meta.isEmpty ? '—' : value`
- 但 GamePanel.vue 的 folio corner 是 hero block 内部元素,FIX1 没动
- 一致做法:folio corner 应该是 `{{ currentSectionShort }} / {{ totalCountShort }}` 或者 `isEmpty ? '— / —' : '1 / N'`

**判定**: ❌ **NEEDS FIXES** per criterion #4 红线

### 4.4 ⚠️ Criterion #5 — Stale E11 PNGs (STILL DEFERRED)

`docs/agent-runs/2026-06-22-ui-e11/experience-e11-{1280,long-1280,640}.png` — 3 PNGs:

- committed in `3c3ea08 feat(experience): ship workstation layout`
- 视觉是 pre-E11 6-cell record-folio + sidebar 3-card 结构,**不是 E11 ws-layout**
- 与本 QA2 working tree 完全不同
- UI-E12-R.diagnosis.md §0.1 已 detailed anomaly
- UI-E12-QA.review.md §6.1 已 deferred 一次
- 本 QA2 检查仍未清理

**判定**: ⚠️ **仍 deferred**,与 FIX1 无关,但 user 应注意到 stale PNGs 仍在 commit 历史

**Codex merge 推荐**:
- 选项 A(强烈推荐):在 FIX1 集成 commit 里 `git rm docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png`,清理 stale 截图
- 选项 B(accept-able):留 stale PNGs,等下一次 visual polish slice 一并处理

---

## 5. FIX1 部分改动明细 (与 QA1 baseline 比)

| 文件 | QA1 baseline | QA2 (FIX1 后) | 改动 |
|---|---|---|---|
| `src/composables/useWorkstationMeta.js:49-63` | `return totalCount.value` (旧) → `Math.max(1, totalCount.value)` (W1) | revert 回 `return totalCount.value` + 注释更新("FIX1 reverted the previous W1 Math.max padding") | ✅ honest count(0 when empty) |
| `src/pages/Experience.vue:48-60` | `{{ meta.currentSection }}` + `{{ meta.totalCount }}` (W1) | `{{ meta.isEmpty ? '—' : meta.currentSection }}` + `{{ meta.isEmpty ? '—' : meta.totalCount }}` | ✅ 0-state shows "—" not fake count |
| `src/components/GamePanel.vue:25` (folio corner) | `<span ...>1 / 1</span>` (W1) | **未改** | ❌ 仍 hardcoded |
| `src/components/GamePanel.vue:952` (comment) | `ID + page index "1 / 1".` | **未改** | ❌ 注释与显示仍不一致 |

**FIX1 完成度**: 2/3 = 67%

---

## 6. Blockers / High / Medium / Low

### Blocker (2)

1. **640 layout overlap** — 5 元素在 viewport top 200px 内堆叠,无可读 breathing room
   - 修复方向:
     - 选项 A:在 980 breakpoint 把 ws-topstrip 切到 `grid-template-columns: 1fr`(单列垂直 stack),而非 `repeat(3, 1fr)`(3 列水平 squeeze)
     - 选项 B:在 640 breakpoint 把 ws-topstrip `display: none`(隐藏次要 metadata,只留 pagetitle + 当前任务 + 共M条)
     - 选项 C:加 `.ws-topstrip--compact` mobile variant,重排 5 cell + progress + anchor
   - **影响**: 所有 640 viewport 用户,首屏看不清 layout
   - **criterion**: §2 红线

2. **Folio corner hardcoded `1 / 1`** — `GamePanel.vue:25` 仍写死 literal,注释不匹配显示
   - 修复方向:
     - 改成 `{{ meta.isEmpty ? '— / —' : `${currentSectionShort} / ${totalCountShort}` }}`,从 useWorkstationMeta import
     - 或者删除 folio corner 的 page 部分,只保留 case ID 印章("PENDNG" 即可,跟 currentSection / totalCount 解耦)
   - **影响**: 0-state 用户看到 misleading "1 / 1"
   - **criterion**: §4 红线

### High (0)

0 high issue。

### Medium (1)

1. **Hamburger 不可见** — 1280 截图左边缘看到 "体验 EXPERIENCE" pagetitle,但 hamburger button 应在 fixed top:16 left:16,可能在视口外 / 被遮盖
   - 修复方向:重新跑 fullPage screenshot 确认 hamburger 位置 + 验证 W2 ship 时 z-index 260 > topstrip 240 是否生效
   - **影响**: 1280 viewport 无法验证 hamburger visibility
   - **criterion**: §3 partial(其他部分 OK)

### Low (2)

1. **Stale E11 PNGs** — 3 PNGs 仍是 pre-E11 视觉,未清理(per UI-E12-R §0.1 + UI-E12-QA §6.1 两次 deferred)

2. **FIX1 没出 report + screenshots** — `UI-E12-FIX1.report.md` + `experience-e12-fix1-{1280,long-1280,640}.png` 全部缺失,无法做完整 visual diff vs FIX1 baseline

---

## 7. Codex merge 推荐

### 推荐:**NEEDS FIXES**

**理由**:
1. **brief 验收点 §2 红线**:"只要 640 还有重叠,直接 NEEDS FIXES" — 5 元素在 640 顶部堆叠,违反此红线
2. **brief 验收点 §4 红线**:"不能写死 misleading `1 / 1`,注释和显示一致" — `GamePanel.vue:25` 仍 hardcoded
3. 其他 criterion (#1 #3 #5 #6 #7) 全部 PASS 或 PARTIAL
4. 0 high severity issue,但 2 个 blocker 都是 brief 显式验收点

**Codex 验收时建议**:

1. **集成 FIX1 时追加 2 个 patch(都 ≤ 30 行, low risk)**:
   - **FIX1-A (640 overlap)**:在 kao.css @media 980/640 block 把 `.ws-topstrip` 改成单列垂直 stack,或者加 `.ws-topstrip--compact` mobile variant
   - **FIX1-B (folio corner)**:把 `GamePanel.vue:25` 的 `1 / 1` 改成 `{{ meta.isEmpty ? '— / —' : `${currentSectionShort} / ${totalCountShort}` }}`,从 `useWorkstationMeta` import `currentSection` + `totalCount` computed 到 GamePanel.vue

2. **顺手清理 stale E11 PNGs**:`git rm docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png`(per UI-E12-R §0.1 + UI-E12-QA §6.1 两次 deferred)

3. **重抓 3 张 fix2 截图**:`experience-e12-fix2-{1280,long-1280,640}.png` 验证 640 overlap 修复后效果

4. **出 `UI-E12-FIX2.report.md`**:documentation hygiene,记录 FIX1 + FIX2 改动 + 验收

**如果 Codex 选择只 ACCEPT partial(只修 1 个 blocker)**:
- FIX1-A(640)不修,1280+long 用户体验 OK,但 640 mobile 完全不可用,**不建议**
- FIX1-B(folio)不修,0-state 用户看到 misleading "1 / 1",**可接受但应该修**

**Codex 不应 reject**:
- 0 high / 0 medium / 0 runtime forbidden pattern / 0 scope violation / 0 test-build fail
- 视觉真实改进(W1 + W2),FIX1 修复了 topstrip honest placeholder

---

## 8. 报告 log / artifacts

- 本文件: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-QA2.review.md`
- QA1(前一 round): `docs/agent-runs/2026-06-23-ui-e12/UI-E12-QA.review.md`
- W1 报告(扩展版): `docs/agent-runs/2026-06-23-ui-e12/UI-E12-W1.report.md`
- W2 报告: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-W2.report.md`
- E12-F 报告: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-F.report.md`
- E12-R 诊断: `docs/agent-runs/2026-06-23-ui-e12/UI-E12-R.diagnosis.md`
- E11 spec: `docs/superpowers/specs/2026-06-22-experience-workstation-redesign.md`

**FIX1 缺失 artifacts**(应存在但不存在):
- `UI-E12-FIX1.report.md` ❌
- `experience-e12-fix1-{1280,long-1280,640}.png` ❌

QA2 基于 W1 阶段截图 + FIX1 in-code 改动验证。FIX1 visual diff 无法做(无 fix1 PNGs)。

---

**END OF UI-E12-QA2 REVIEW** — **NEEDS FIXES**: 2 blocker(640 overlap + folio corner hardcoded); 0 high / 1 medium(hamburger 不可见) / 2 low(stale PNGs + FIX1 missing artifacts)。236/1005 focused/full test pass, build clean, 0 forbidden pattern 引入。