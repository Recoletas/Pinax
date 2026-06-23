# UI-E12-W2 — Menu → Experience page handoff continuity

**Worker**: Claude (UI-E12-W2 window, 2026-06-23)
**Branch**: main (worktree n/a — bounded visual continuity slice, no structural change)
**Status**: 改动落地,验证通过,**未 commit / 未 push**(per brief,Codex 验收后才 commit)
**Scope**: 2 source files + 1 test file + 2 screenshots + 1 report

---

## 1. 一句话验收

**ACCEPT — 7/7 E12-W2 contracts green, 113 files / 1005 tests / 0 fail, build clean, diff --check clean**. /experience 进入连续性问题已定点修复:hamburger 按钮 z-index 从 90 提到 260(高于 ws-topstrip 240)且视觉改成 kao archive paper(不再像贴上去的 SaaS 按钮);topstrip 加 80px 左 padding + 新增"体验 EXPERIENCE"页面标题 kicker(把菜单抽屉 caption 和页面连起来);.game-page 在 kao 模式 override SaaS accent-rose/amber halo 改用 archive paper 渐变;新增 wsLayoutEnter keyframe(opacity 0→1 + translateY 6px→0, 420ms)做 menu→page settle-in 入场仪式(配 prefers-reduced-motion 关闭)。**0 AppShell.vue 结构改动**:hamburger 视觉 override 走 .theme-kao .app-shell .shell-nav-trigger 模式(放在 kao.css 末尾 **@layer wrap 之外**,因为 CSS Cascade Level 5 中 unlayered 规则优先级高于 @layer 规则,AppShell.vue scoped CSS 是 unlayered 所以 layered 规则会输)。

## 2. 改动清单

### 2.1 `src/styles/themes/kao.css` — workstation layer + W2 加法(全部 .theme-kao gated)

| Selector | 位置 | 内容 |
|---|---|---|
| `.theme-kao .app-shell .shell-nav-trigger` | **@layer 之外** (kao.css 末尾) | z-index 90→260, border color → archive-gold 28%, background → archive-paper-soft 渐变, color → archive-ink, box-shadow → inset + 6px 14px archive-ink 16% |
| `.theme-kao .app-shell .shell-nav-trigger:hover` | 同上 | border → archive-olive 36%, color → archive-olive-strong, background 加强 archive-paper |
| `.theme-kao .app-shell .shell-nav-trigger:focus-visible` | 同上 | box-shadow 加 `0 0 0 2px var(--archive-gold)` 焦点环 |
| `.theme-kao .ws-topstrip` | @layer kao 内 | height 80→min-height 80(为 640 mobile 自适应), grid-template-columns `repeat(5, 1fr) auto` → `auto repeat(5, 1fr) auto`(加 pagetitle 列), padding `10px 16px` → `10px 16px 10px 80px`(清 hamburger) |
| `.theme-kao .ws-topstrip__pagetitle` | @layer kao 内 | flex 容器,kicker + name 排成 baseline,1px gold 右 border 跟 cells 分开 |
| `.theme-kao .ws-topstrip__pagetitle-kicker` | @layer kao 内 | body 13px 500 + 0.04em letter-spacing(显示 "体验") |
| `.theme-kao .ws-topstrip__pagetitle-name` | @layer kao 内 | sans 9px 700 + 0.22em letter-spacing + uppercase(显示 "EXPERIENCE") |
| `@media (max-width: 980px) .theme-kao .ws-topstrip` | @layer kao 内 | mobile: pagetitle 占满一行 `grid-column: 1 / -1` + bottom border |
| `.theme-kao .game-page` | @layer kao 内 | 背景 override:`accent-rose/amber` halo → archive-paper 3-stop 渐变(与 shell 连续) |
| `@keyframes wsLayoutEnter` | @layer kao 内 | opacity 0→1 + translateY(6px)→none, 420ms cubic-bezier(0.22, 1, 0.36, 1) |
| `.theme-kao .ws-layout { animation: wsLayoutEnter ... }` | @layer kao 内 | 入场动画应用到 ws-layout |
| `.theme-kao .ws-topstrip__cell:nth-child(2..5)` | @layer kao 内 | stagger 60/90/120/150ms(5 cells 错落出现) |
| `@media (prefers-reduced-motion: reduce)` | @layer kao 内 | 关闭 ws-layout + cell 的 animation(无障碍) |

**关于 hamburger 放 @layer 之外**:这是 W2 实施中发现的 CSS Cascade Level 5 行为。`@layer kao` 是 named layer,而 AppShell.vue scoped CSS 是 unlayered(默认 implicit layer 是 cascade 最高优先级)。即使 specificity 高(0,3,0 vs 0,2,0),@layer kao 里的规则输给 unlayered scoped CSS。把 hamburger override 移到 @layer wrap 之外,让它在 unlayered 默认层,才能赢。其它 W2 规则(topstrip padding / pagetitle / game-page / wsLayoutEnter)放在 @layer kao 内是 OK 的,因为没有 AppShell.vue scoped CSS 跟它们竞争(它们都 work-station 内部 selector)。

### 2.2 `src/pages/Experience.vue` — topstrip 加 page-title 元素

```vue
<section class="ws-topstrip" aria-label="案卷进度条">
  <!-- UI-E12-W2: page title (体验 / Experience) -->
  <div class="ws-topstrip__pagetitle">
    <span class="ws-topstrip__pagetitle-kicker">体验</span>
    <span class="ws-topstrip__pagetitle-name">Experience</span>
  </div>
  <div class="ws-topstrip__cell">...卷...</div>
  ...
</section>
```

**AppShell.vue 不改**:hamburger 视觉 override 走 kao.css 的 `.theme-kao .app-shell .shell-nav-trigger`(解释见 §2.1 注)。理由:hamburger z-index 是单个 CSS 值(不是行为),可以走 theme-system 的 .theme-kao 条件 override 模式(kao.css L610-722 已有多个 .theme-kao .shell-* 规则的先例)。

## 3. uiPolish 契约

新 describe block `ui polish — UI-E12-W2: Menu → Experience page handoff continuity`,7 contracts 锁定:

| Contract | 锁定内容 |
|---|---|
| **E12-W2-1** | `.theme-kao .app-shell .shell-nav-trigger` z-index > 240(高于 ws-topstrip `--z-floating-dock` 240);放 @layer 之外 |
| **E12-W2-2** | `.theme-kao .ws-topstrip` padding-left ≥ 72px(清 hamburger) |
| **E12-W2-3** | `<div class="ws-topstrip__pagetitle">` 含 kicker="体验" + name="Experience" |
| **E12-W2-4** | `.theme-kao .game-page` 背景用 archive paper(无 accent-rose/amber halo) |
| **E12-W2-5** | `@keyframes wsLayoutEnter` + `.theme-kao .ws-layout { animation: ... }` + `prefers-reduced-motion` override |
| **E12-W2-6** | W2 加法 0 `:global(.theme-kao)` / 0 broad `:deep` / 0 `!important` / 0 raw hex(扫 8 个新 rule) |
| **E12-W2-7** | W2 selectors 限定 workstation / hamburger(不污染 `.wall-*` Writing 或 `.material-*` / `.index-card` Notes) |

## 4. 验证结果

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | **236/236 pass** (2 files) |
| `npm run test:run` | **1005/1005 pass** (113 files / 0 fail) |
| `npm run build` | **clean** (3.53s) |
| `git diff --check` | **clean** |
| Playwright 验证 | hamburger z-index **260** (was 90) / ws-topstrip z-index 240 / page title "体验" 可见 |

## 5. 截图证据

| 文件 | viewport | 关键变化 |
|---|---|---|
| `experience-e12-w2-1280.png` | 1280×800 | **hamburger 现在可见**(左上角 46x42 paper-soft 按钮带 gold border,在 ws-topstrip **之上** z-index 260 vs 240);**"体验 EXPERIENCE" 页面标题** 在 topstrip 最左侧 + 1px gold right border 与 cells 分开;center stage 4 messages 正常可读;**背景 paper-soft 渐变** 替代 SaaS accent halo |
| `experience-e12-w2-640.png` | 640×800 | mobile-collapsed:**"体验 EXPERIENCE" 占满第一行**(grid-column 1/-1 + bottom border),5 cells 转 3-column 网格;hamburger 仍可见(z-index 260 > topstrip 240);**布局层级清晰**:page title → cells → center stage → right rail 3 sections |

视觉 diff vs E12-F baseline:
- **before**:hamburger 完全被 ws-topstrip 覆盖(只露一个白色角);页面顶部没有任何 title 标识;背景是 accent-rose / accent-amber SaaS halo;菜单 → 页面切换是 hard cut
- **after**:hamburger 作为工作站一部分(同 paper-soft / archive-gold 视觉);"体验 EXPERIENCE" 标题与菜单抽屉 caption 对应;背景是 archive paper 渐变(从 shell 流入页面);420ms settle-in 入场

## 6. 关于 AppShell.vue 的决策

brief 说"必要时少量 AppShell.vue ... 但必须先说明为什么"。W2 **完全没改 AppShell.vue**,3 个变更都走 kao.css:

| W2 变更 | 为什么不改 AppShell.vue |
|---|---|
| hamburger z-index 90 → 260 | z-index 是单 CSS 值,加 `.theme-kao` 前缀的 override 在 kao.css 完全合理(跟现有的 .theme-kao .shell-mast / .shell-menu-btn / .shell-drawer 同样模式) |
| hamburger 视觉(archive paper) | 同一个 override rule 加 bg/color/border,不需要新结构 |
| ws-topstrip padding-left + pagetitle 元素 | ws-topstrip 是 Experience.vue 内部 element,完全在 Experience.vue + kao.css 范围内 |

需要改 AppShell.vue 的真正理由应该是结构变化(新按钮 / 新 layout),而 W2 全部是 CSS + 1 个 template 元素,**没触发这个边界**。

## 7. 风险 / 后续注意

1. **CSS Cascade Level 5 行为**:`@layer kao` 规则输 unlayered scoped CSS 是 spec 行为。W2 之后任何想 override shell 视觉的 W3+ 改动都需要放 @layer 之外,或者改 AppShell.vue scoped CSS(边界更高)。这个发现也适用于未来 W3+ 的 .shell-drawer / .shell-mast override。
2. **wsLayoutEnter 与现有 @layer kao 动画**:E12-F 已有 `.theme-kao .chapter-list-item .bookmark-button:hover` 用 `kickerPulse` keyframe(kao.css L353-364)。W2 wsLayoutEnter 是 page-level(进入时一次),chapter-list 是 hover 触发,作用域不冲突。reduced-motion 关闭两者即可。
3. **mobile pagetitle 占满行**:在 980 以下 pagetitle 跨整行 + bottom border,作为独立"档案首页标题"语义。1280+ 时是 inline kicker + name 同行排列。如果未来 pagetitle 信息变复杂(如多行 case info),需要另开一个 ws-pagetitle section 而不是 pagetitle 内的多行 stack。
4. **PENDING 截图清理**(per UI-E12-R §0.1 建议):`docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` 是 stale 截图(在 3c3ea08 commit 里但视觉是 pre-E11),在 E12 集成时可清理。
5. **后续可选 polish(非 W2 scope)**:`.ws-topstrip` 加 left-side 阴影/光晕,让"体验 / EXPERIENCE"在视觉上锚定;hamburger 加 0.5px inner gold ring 进一步 archive 化;`.ws-center-stage` 顶部加 1px gold rule 跟 topstrip 接续(目前是 border,5px gold 入侧)。这些都不在 W2 scope,等 W3+。

## 8. File diff 摘要

| 文件 | 改动 | 内容 |
|---|---|---|
| `src/styles/themes/kao.css` | +220 / -10 | ws-topstrip padding + pagetitle-* + @media mobile pagetitle 跨行 + .game-page override + @keyframes wsLayoutEnter + 4 stagger 规则 + reduced-motion override + hamburger 3 个 .theme-kao .app-shell .shell-nav-trigger override 放 @layer 之外 |
| `src/pages/Experience.vue` | +12 / -0 | `<div class="ws-topstrip__pagetitle">` 元素(kicker "体验" + name "Experience")作为 ws-topstrip 第一个 child |
| `src/__tests__/uiPolish.test.js` | +147 / -2 | `ui polish — UI-E12-W2: Menu → Experience page handoff continuity` describe block(7 contracts) |

---

**END OF UI-E12-W2 REPORT** — 7/7 E12-W2 contracts green, 1005/1005 全量 test pass, build clean, diff --check clean, 0 forbidden pattern, 0 AppShell.vue structural change.