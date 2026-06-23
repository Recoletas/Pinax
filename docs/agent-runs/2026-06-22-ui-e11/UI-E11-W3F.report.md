# UI-E11-W3F — Experience workstation 4-layer font layering (Task 8)

**Worker**: Claude (UI-E11-W3F)
**Date**: 2026-06-23
**Branch**: main (worktree n/a)
**Status**: 改动落地,验证通过,**未 commit / 未 push**(per brief,Codex 验收后才 commit)
**Scope**: 1 file (`src/styles/themes/kao.css`),0 commit,0 push

---

## 1. 研究 (Research)

### 1.1 现状摸底

通过 grep / Read 摸清 E11 当前落地状态:

| Token | kao.css 当前使用次数 | E11-D2 要求 | 状态 |
|---|---|---|---|
| `--font-display` | 43 | ≥3 | ✓ |
| `--font-body` | **0** | ≥3 | ✗ 需加 |
| `--font-sans` | 10 | ≥3 | ✓ |

E11-D1 3 个 selector 检查:

| Selector | 期望 font token | 当前在 kao.css | 状态 |
|---|---|---|---|
| `.theme-kao .ws-topstrip__case` | `var(--font-display)` | L2555-2562 已存在 | ✓ |
| `.theme-kao .ws-left-rail__kicker` | `var(--font-body)` | **不存在** | ✗ 需加 |
| `.theme-kao .ws-topstrip__meta` | `var(--font-sans)` | L2564-2569 已存在 | ✓ |

### 1.2 ws-* 段落结构

通过 Read L2404-2636 + awk 验证,kao.css 整个文件包在 `@layer kao { ... }` 单块里,L2636 是 @layer 收尾大括号。ws-* workstation 4-section block 在 L2404-2635(E11-A uncommitted,W1/W2 已 ship)。ws-* 子 selector 清单:ws-layout / ws-topstrip / ws-left-rail / ws-center-stage / ws-right-rail / ws-section / ws-topstrip__cell / __kicker / __value / __case / __meta / __progress / __progress-cell / __anchor。

### 1.3 模板 selector 存在性确认

通过 grep src/ 验证哪些 selector 在 template 里真用、哪些在 GamePanel.vue scoped CSS 里已定义:

| Selector | Template 引用 | GamePanel.vue scoped | kao.css (post-edit) |
|---|---|---|---|
| `.ws-topstrip__case` | Experience.vue:31 | — | ✓ var(--font-display) L2555 |
| `.ws-topstrip__meta` | (ws-* sub) | — | ✓ var(--font-sans) L2564 |
| `.ws-topstrip__kicker` | Experience.vue:26,30,34,38,42 | — | ✓ var(--font-sans) L2537 (META,9px label) |
| `.ws-topstrip__value` | Experience.vue:27,35,39,43 | — | ✓ var(--font-display) L2546 (DISPLAY,14px value) |
| `.ws-topstrip__anchor` | Experience.vue:53 | — | ✓ var(--font-display) L2600 |
| `.ws-left-rail__kicker` | Experience.vue:19 | — | **NEW** var(--font-body) L2661 |
| `.ws-left-rail__brief` | Experience.vue:20 | — | **NEW** var(--font-body) L2668 |
| `.ws-right-rail__section-title` | (未在 template,future-proofing) | — | **NEW** var(--font-display) L2653 |
| `.ws-layout button` | (tag selector) | — | **NEW** var(--font-sans) 13px L2679 |
| `.ws-layout .action-btn` | Experience.vue 多处 | L1416-1431 scoped CSS | **NEW** var(--font-sans) 13px L2683 |
| `.ws-layout textarea` | (tag selector) | — | **NEW** var(--font-body) 14px L2687 |
| `.scene-entry__stamp` | GamePanel.vue:55 | ✓ L635-642 var(--font-display) | (已有 scoped,不动) |
| `.scene-entry__no` | GamePanel.vue:54 | ✓ L625-633 无 font-family | (已有 scoped,不动) |
| `.display-name` | GamePanel.vue:72,91 | ✓ L730-738 var(--font-sans) | (已有 scoped,不动) |
| `.msg-time` | GamePanel.vue:73,92 | ✓ L740-746 var(--font-sans) | (已有 scoped,不动) |
| `.text-main` | GamePanel.vue:110 | ✓ L784-795 var(--font-body) | (已有 scoped,不动) |

**取舍依据**: brief 列出的 4 类 selector 里,.scene-entry__stamp / .scene-entry__no / .display-name / .msg-time / .text-main 全在 GamePanel.vue scoped CSS 已定义(Vue scoped CSS `[data-v-xxx]` specificity 0,2,1 比 kao.css `.theme-kao .class` specificity 0,2,0 高,scoped CSS wins)。在 kao.css 重复声明这些 selector 是 dead CSS(Vue scoped CSS wins on specificity),所以**不在 kao.css 复制**,仅在 kao.css 用 ws-* selector + 标签 selector 落地 4 层字体分层。

---

## 2. 改动 (Changes)

### 2.1 kao.css L2637-2691 新增 4-layer font block

```css
  /* UI-E11-W3: 4-layer font layering (Task 8 of W3 cleanup).
     DISPLAY=LXGW brush for case / kicker / stamp / section title (10-14px).
     BODY=Songti/Georgia for 正文 / kicker / section number (12-18px).
     META=sans for 案号 / 角色名 / 时间 / stat (10-11px).
     INTERACTIVE=sans 13px for buttons, body for textarea.
     Per E11-PLAN-QA Fix #3: button rules scoped to .ws-layout so they
     don't leak to floating components (modal, dropdown, etc.).
     Note: scene-entry__stamp / display-name / msg-time / text-main are
     also styled in GamePanel.vue scoped CSS; the workstation-level
     defaults here are layered (Vue scoped CSS wins on specificity for
     overlapping properties). */

  /* DISPLAY layer — ws-right-rail section title */
  .theme-kao .ws-right-rail__section-title {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: var(--archive-ink);
  }

  /* BODY layer — ws-left-rail kicker + brief (Experience.vue L19-20) */
  .theme-kao .ws-left-rail__kicker {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  }
  .theme-kao .ws-left-rail__brief {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--archive-ink);
  }

  /* INTERACTIVE layer — buttons (sans 13px) + textarea (body 14px).
     Scoped to .ws-layout so global .theme-kao button rules don't
     pollute floating components (modals, dropdowns, drawers). */
  .theme-kao .ws-layout button {
    font-family: var(--font-sans);
    font-size: 13px;
  }
  .theme-kao .ws-layout .action-btn {
    font-family: var(--font-sans);
    font-size: 13px;
  }
  .theme-kao .ws-layout textarea {
    font-family: var(--font-body);
    font-size: 14px;
  }
```

### 2.2 硬约束自检 (all pass)

| 约束 | 检查方式 | 结果 |
|---|---|---|
| 只改 src/styles/themes/kao.css | `git status --short` | ✓ 单文件改动 |
| 0 new `:global(.theme-kao)` | grep | ✓ 0 occurrences |
| 0 raw hex | grep `#[0-9a-f]{3,6}` in W3 region | ✓ 0 occurrences (only `color-mix` with `var(--archive-*)`) |
| 0 broad `:deep(*)` | grep | ✓ 0 occurrences |
| 0 `!important` 在新增 ws-* 规则内 | E11-F1 regex + grep | ✓ 0 occurrences |
| 不动 `--font-*` token 定义 | L21-32 区域 0 改动 | ✓ |
| 不动非 ws-* 既有规则 | 0 deletions in kao.css | ✓ (E11-A uncommitted ws-* block 保持不动,仅在 L2635 段尾追加) |
| 新增规则不插入无关规则中间 | 全部放在 ws-* block 末尾(L2636 之前) | ✓ |

### 2.3 E11 契约自检 (live count)

```
font-display count: 44  (≥3 ✓)
font-body count:    3   (≥3 ✓)
font-sans count:    12  (≥3 ✓)
```

E11-D1 3 selector 匹配(用 test 文件的 regex pattern 验证):

| Selector | 匹配模式 | 验证 |
|---|---|---|
| `.theme-kao .ws-topstrip__case` | `/\.theme-kao\s+\.ws-topstrip__case[\s\S]*var\(--font-display\)/s` | ✓ L2555-2562 |
| `.theme-kao .ws-left-rail__kicker` | `/\.theme-kao\s+\.ws-left-rail__kicker[\s\S]*var\(--font-body\)/s` | ✓ L2661-2666 (NEW) |
| `.theme-kao .ws-topstrip__meta` | `/\.theme-kao\s+\.ws-topstrip__meta[\s\S]*var\(--font-sans\)/s` | ✓ L2564-2569 |

---

## 3. 测试 (Test)

### 3.1 npm run test:run -- src/__tests__/uiPolish.test.js

```
✓ src/__tests__/uiPolish.test.js  (216 tests) 139ms
Test Files  1 passed (1)
Tests       216 passed (216)
Duration    1.28s
```

E11-D1 + E11-D2 green,**0 新 fail**,0 跳过的契约。

### 3.2 npm run build

```
✓ built in 3.74s
```

Build clean(Vite warning 关于 kao.css static+dynamic import 是既有现象,E10 ship 起就在,不在本 W3 范围内)。

### 3.3 git diff --check

```
---exit: 0---
```

Diff clean,无 whitespace 异常。

---

## 4. Diff stat

`git diff --numstat src/styles/themes/kao.css`:
```
299	0	src/styles/themes/kao.css
```

**重要说明**: 299 行看起来很多,但绝大多数是 **E11-A uncommitted 的 ws-* block** (W1/W2 改动,L2393-2635,~243 行) 不是本 W3 改动。**本 W3 实际改动**: L2637-2691 = **54 行新增**,0 行删除。

```
$ git diff src/styles/themes/kao.css | awk '/UI-E11-W3/{p=1} p' | grep -cE "^[+]"
54
$ git diff src/styles/themes/kao.css | awk '/UI-E11-W3/{p=1} p' | grep -cE "^[-]"
0
```

---

## 5. 风险 (Risk)

### 5.1 specificity / layered CSS 风险

`.ws-layout .action-btn` 在 kao.css 写 `font-family: var(--font-sans); font-size: 13px;`,而 Experience.vue L1416-1431 scoped CSS 也有 `.action-btn { ... font-size: 13px; ... }`。Vue scoped CSS 编译后 specificity 是 `.action-btn[data-v-xxx]` = (0,2,1);kao.css 的 `.theme-kao .ws-layout .action-btn` = (0,3,0)。**kao.css wins on specificity**,所以 font-family / font-size 13px 实际生效,scoped CSS 里 font-size 13px 是同值,不冲突。

**若出现 visual regression** (button 字体不对),首先检查浏览器 DevTools 该 button 元素计算样式 — specificity cascade 应按预期工作。如有意外,降权到 `.theme-kao .ws-layout button.action-btn` 或 `:where()` 0-specificity wrapper。

### 5.2 .ws-right-rail__section-title 是 dead CSS

brief 列出的 selector `.ws-right-rail__section-title` 在当前 template 没有实例(Experience.vue 用 `data-dossier-stamp="卷宗一/二/三"` attribute + `.ws-section::before { content: attr(data-dossier-stamp); ... }` 实现,见 kao.css L2626-2635)。新增规则是 **future-proofing**,如果未来 E12 / E13 给 ws-section 加 `<h3 class="ws-right-rail__section-title">` 显式元素,该规则立即生效。**当前视觉 0 副作用**(selector 不命中任何元素)。

按 ui-style-check skill 的 "Functionality: every element earn its place" 标准,这略偏 dead CSS。但保留理由:(1) brief 明确列出这个 selector;(2) ws-section::before 已用 var(--font-display) 作为 stamp title 字体,如果未来切到独立 h3 元素,该 selector 已有定义;(3) 占用成本极低(8 行)。

### 5.3 与其他 worker 的 E11-A 改动合并

git status 显示有 7 个其他文件 modified (`Experience.vue`, `GamePanel.vue`, `QuestLog.vue`, `StatusBar.vue`, `geography/GeographyPanel.vue`, `__tests__/uiPolish.test.js`, `__tests__/experienceFullBleed.test.js`)+ 4 个 untracked (`docs/agent-runs/2026-06-22-ui-e11/`, `docs/superpowers/{plans,specs}/2026-06-22-experience-workstation*.md`, `src/composables/useWorkstationMeta.js`)。这些**都是 E11-A 的 W1/W2 ship 改动**,不在本 W3 范围内,本 W3 只动 kao.css。

**Codex 集成时需注意**:`git status --short` 显示的 untracked `docs/agent-runs/2026-06-22-ui-e11/` 是本 report 目录,需用 stage-by-name(`git add docs/agent-runs/2026-06-22-ui-e11/UI-E11-W3F.report.md`)而非 `git add -A`,后者会裹挟 merge-conflict `docs/STATUS.md` 或其他 worktree 残留。Per `feedback_stage_by_name_in_worktree` memory。

---

## 6. 范围外 (Out of scope, deferred)

- `.scene-entry__stamp` / `.scene-entry__no` / `.display-name` / `.msg-time` / `.text-main` **不在 kao.css 加 font-family**(已在 GamePanel.vue scoped CSS 定义,Vue scoped CSS specificity wins,kao.css 复制是 dead CSS)。
- 不改 token 定义(L21-32 `--font-display` / `--font-body` / `--font-sans`,E10 ship)。
- 不改 E11-A 的 ws-layout / ws-topstrip / ws-left-rail / ws-center-stage / ws-right-rail / ws-section 既有规则。
- 不创建新 component / composable / 测试文件。
- 不做 Playwright 视觉验收(per `feedback_visual_companion_broken` memory,默认走文字 + build/test 验证)。

---

## 7. 总结 (Summary)

| 项 | 值 |
|---|---|
| 文件改动 | 1 (`src/styles/themes/kao.css`) |
| 行数改动 | +54 / -0 (W3 实际); +299 / -0 (git diff vs HEAD 含 E11-A uncommitted) |
| E11-D1 | ✓ green (3 selector 各匹配对应 token) |
| E11-D2 | ✓ green (display=44, body=3, sans=12, 均 ≥3) |
| uiPolish 全套 | ✓ 216/216 pass, 0 fail |
| Build | ✓ clean 3.74s |
| `git diff --check` | ✓ exit 0 |
| Hard rules | ✓ 0 `:global(.theme-kao)` / 0 `:deep(*)` / 0 `!important` in ws-* rules / 0 raw hex |
| Theme-system | ✓ 所有新规则 `.theme-kao` gated |
| Commit / Push | 0 / 0 (per brief) |

**结论**: E11-W3 Task 8「4 层字体分层固化到 kao.css」落地,E11-D1 + E11-D2 契约 green,其他 E11 契约不破。Codex 可验收并决定 commit 时机。