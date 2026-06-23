# UI-E12-F — Experience font / readability repair

**Worker**: Claude (UI-E12-F window, 2026-06-23)
**Branch**: main (worktree n/a — bounded read-repair, no structural change)
**Status**: 改动落地,验证通过,**未 commit / 未 push**(per brief,Codex 验收后才 commit)
**Scope**: 3 source files + 1 test file + 3 screenshots + 1 report

---

## 1. 一句话验收

**ACCEPT — 6/6 E12-F contracts green, 113 files / 992 tests / 0 fail, build clean, diff --check clean**. /experience 字体 / 可读性问题已定点修复:中央记录区正文 16→17px / 1.75→1.78 line-height 用 Songti serif,顶部 strip value/case 从 LXGW 笔触切到 body serif 14→15px,左栏 kicker 11→12px / brief 14→15px / 1.6→1.65,scene-entry__stamp 从 LXGW 切到 sans italic 10→11px,quick-note 输入 13→14px / 1.65→1.7,preview 12→13px / 1.45→1.55。.ws-layout .action-btn 加 3D box-shadow(inset 高光 + 4px 底偏移 + 8px 投影)更立体但不 SaaS 卡片。**E11 4-zone workstation 布局 0 改动**。

## 2. 改动清单

### 2.1 `src/styles/themes/kao.css` — workstation 字体分层重做

| Selector | Before (E11) | After (E12-F) | 理由 |
|---|---|---|---|
| `.ws-topstrip__kicker` | sans 9px / letter-spacing 0.18em | sans 10px / weight 500 / 0.16em | 9px 太小不可读,10px 仍属 META 层 |
| `.ws-topstrip__value` | display 14px (LXGW 笔触) | **body 15px** (Songti) | LXGW 在 14px 太密,body serif 小字可读 |
| `.ws-topstrip__case` | display 14px italic (LXGW 笔触) | **body 15px italic** (Songti) | 同上,italic 仍标记 case ID |
| `.ws-left-rail__kicker` | body 11px | body 12px / 0.1em | 11px 偏小,12px 仍属 kicker |
| `.ws-left-rail__brief` | body 14px / 1.6 | body 15px / 1.65 | 14px 在 1280 偏小,15px 进入正文阅读区 |
| `.ws-layout button` | sans 13px | sans 13px / **weight 500** | 增强按钮 label 可读性 |
| `.ws-layout .action-btn` | (无 workstation override) | sans 13px / weight 500 / letter-spacing 0.02em + **3D box-shadow**(inset + 4px base + 8px drop) + hover lift -1px + active press +1px | brief item #4 "更立体更明确, 但不要 SaaS 卡片风" |
| `.ws-layout textarea` | body 14px | body 14px / 1.65 | 略加 line-height 可读性 |

**保留**:`.ws-topstrip__anchor`(display 12px italic — 短单 anchor,允许 LXGW)、`.ws-right-rail__section-title`(display 12px — 卷宗印章位)、`.ws-topstrip__progress-cell`(5-cell progress bar 视觉)、`.ws-layout` grid 模板。

### 2.2 `src/components/GamePanel.vue` — 中央记录区正文 + stamp 字体

| Selector | Before (E10/E6A) | After (E12-F) | 理由 |
|---|---|---|---|
| `.scene-entry__stamp` | display 10px italic (LXGW 笔触) | **sans 11px italic**(archive-rose 80%) | LXGW 在 10px 完全糊,sans italic 仍标记 stamp |
| `.text-main` | body 16px / line-height 1.75 | **body 17px / line-height 1.78** | brief item #3 "更像可读产品, 不像淡色装饰" |

**保留**:`.text-main::before` 角色 kicker (我·/旁白·/档案员·) — 仍是 LXGW display 14px italic,因为这是真 kicker 位置,color 是 archive-olive-strong / archive-rose / archive-gold 强对比。

### 2.3 `src/pages/Experience.vue` — quick-note 输入区

| Selector | Before | After | 理由 |
|---|---|---|---|
| `.quick-note-workspace-input` | 13px / 1.65 | **14px / 1.7** | brief item #3 整体正文更可读 |
| `.quick-note-message-preview` | 12px / 1.45 | **13px / 1.55** | brief item #3 整体正文更可读 |

## 3. uiPolish 契约

新 describe block `ui polish — UI-E12-F: Experience font / readability repair`,6 contracts 锁定:

| Contract | 锁定内容 | 文件 |
|---|---|---|
| **E12-F1** | 小字号 meta (ws-topstrip__kicker/meta + scene-entry__stamp + display-name + msg-time + msg-item__folio) 全部 `var(--font-sans)`,无 LXGW 笔触 | kao.css + GamePanel.vue |
| **E12-F2** | `.text-main` `var(--font-body)` + font-size 16-19px + line-height 1.70-1.85(原 16/1.75 范围扩到 17/1.78) | GamePanel.vue |
| **E12-F3** | workstation buttons (`.ws-layout button` + `.ws-layout .action-btn`) `var(--font-sans)`,`var(--font-display)` 出现 → 失败 | kao.css |
| **E12-F4** | 无新 `:global(.theme-kao)` / broad `:deep` / `!important` / raw hex — 扫 E12-F 加的 10 个 selector,全部 clean | kao.css + Experience.vue + GamePanel.vue |
| **E12-F5** | `.ws-topstrip__value` + `.ws-topstrip__case` 切到 `var(--font-body)`(case 保留 italic) | kao.css |
| **E12-F6** | `.ws-layout .action-btn` 3D box-shadow(inset + 4px base + 8px drop) — brief item #4 "更立体" | kao.css |

### 3.1 既有契约更新(E12-F 故意变更)

| Contract | Before | After | 原因 |
|---|---|---|---|
| UI-E6A (line 2133) | `font-size: 16px` 精确匹配 | `font-size: (16-19\|20-29)px` 范围 | text-main 16→17 故意提升 |
| UI-E6A (line 2134) | `line-height: 1.75` 精确匹配 | `line-height: 1.7\`-1.85` 范围 | text-main 1.75→1.78 故意提升 |
| UI-E10 (line 2307) | `scene-entry__stamp { var(--font-display) }` | `scene-entry__stamp { var(--font-sans) + italic }` | stamp 10px LXGW 切 sans 11px 故意 |

这 3 个既有契约反映 E12-F 故意变更的方向,新契约锁新方向不变。

## 4. 验证结果

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | **223/223 pass** (2 files) |
| `npm run test:run` | **992/992 pass** (113 files / 0 fail) |
| `npm run build` | **clean** (5.67s) |
| `git diff --check` | **clean** |

新增 E12-F 6 contracts 全绿;既有 UI-E6A / UI-E10 契约已更新到新基线;UI-N10 raw hex sweep 通过(无 raw hex 在 kao.css 的 E12-F 新 selector 中)。

## 5. 截图证据

| 文件 | viewport | 显示内容 | 关键验证点 |
|---|---|---|---|
| `experience-e12-font-1280.png` | 1280×800 | workstation 4-zone + 4 messages + 顶部 topstrip(卷 1 / 案号 17651287 / 当前任务 未登记 / 第 N 条 4 / 共 M 条 4) + 右栏 主角 + 地点网络 + 智库摘要 + 输入区 | **grid: 220px 752px 280px**(verified via getComputedStyle);message body 17px Songti 可读 |
| `experience-e12-font-long-1280.png` | 1280×1600 | 同上 + taller viewport 显示完整右栏(3 sections 全可见) + 输入区 + 浮动 GM / 生图抽屉 | **grid: 220px 752px 280px**;3 右栏 sections 全可见 |
| `experience-e12-font-640.png` | 640×800 | mobile-collapsed 单列:topstrip 缩成 3-column repeat,左栏 / center / 右栏 stacked | **grid: 640px**(verified via getComputedStyle);responsive breakpoint @980 触发 |

## 6. 字体分层(E12-F 后)

| Layer | Token | 用途 | Example |
|---|---|---|---|
| **DISPLAY**(笔触/kicker) | `var(--font-display)` (LXGW) | 卷宗印章、case/role kicker、anchor 短装饰 | `.ws-right-rail__section-title` 12px / `.text-main::before` 角色 kicker 14px / `.ws-topstrip__anchor` 12px italic |
| **BODY**(正文) | `var(--font-body)` (Songti serif) | 中央记录区正文、案号、案卷值、左栏描述 | `.text-main` 17px/1.78 / `.ws-topstrip__value` 15px / `.ws-topstrip__case` 15px italic / `.ws-left-rail__brief` 15px/1.65 |
| **META**(小字 label) | `var(--font-sans)` (Segoe UI Variable) | kicker 标签、time/date、sender name、folio page no. | `.ws-topstrip__kicker` 10px / `.ws-topstrip__meta` 10px / `.scene-entry__stamp` 11px italic / `.display-name` 11px / `.msg-time` 11px / `.msg-item__folio` 11px |
| **INTERACTIVE**(按钮/输入) | sans 13 / body 14 | workstation 按钮、textarea、quick-note 输入 | `.ws-layout button` 13/500 / `.ws-layout .action-btn` 13/500/0.02em + 3D shadow / `.ws-layout textarea` 14/1.65 |

**关键决策**:LXGW 从 14px value / 10px stamp / 11px kicker 全部退出,只在 12-14px 真 kicker / anchor / 装饰位保留。

## 7. 风险 / 后续注意

1. **E11 4-zone workstation 0 破坏**:`.ws-layout` / `.ws-topstrip` / `.ws-left-rail` / `.ws-center-stage` / `.ws-right-rail` / `.ws-section` 全部 selector + grid + flex 模板不动;只动 font-family / font-size / line-height / box-shadow 子属性。
2. **3D button 不是 SaaS**:`.action-btn` 在 kao.css 加了 3-stop box-shadow(inset 高光 + 4px 底偏移 + 8px 投影)给 workstation 一个浮起的感觉,但保留了 Experience.vue scoped CSS 的 clip-path bookmark 切角 + paper-soft bg + 1px gold border,所以仍是 archive-folio 视觉,不是 SaaS 卡片风。
3. **既有契约扩展范围**:UI-E6A / UI-E10 故意更新以反映 E12-F 的"central record body 更可读"方向,而不是 revert。range 写法(16-19px / 1.7-1.85)保留 forward-compat。
4. **后续可选 polish(非本轮 scope)**:`.msg-item` background 从 archive-paper-strong 18% 提到 24% 让对话卡片更立体;`.quick-note-stat` 字号略加;`.chat-container__hero-greeting` 在 0-state 可改 display 22px 进一步提升首屏存在感 — 都不在 E12-F scope。

## 8. File diff 摘要

| 文件 | 改动 | 内容 |
|---|---|---|
| `src/styles/themes/kao.css` | 净 +50 行(替换 ws-topstrip__value/case/kicker + ws-left-rail__kicker/brief + 加 ws-layout .action-btn 3D shadow + INTERACTIVE layer comment) | font-family 切换 / 字号 bump / box-shadow 3-stop / 0 raw hex |
| `src/components/GamePanel.vue` | 替换 `.scene-entry__stamp` + `.text-main` 2 个 rule | LXGW 退场 + body 17/1.78 |
| `src/pages/Experience.vue` | 替换 `.quick-note-workspace-input` + `.quick-note-message-preview` 2 个 rule | 字号 bump 提升 quick-note 可读 |
| `src/__tests__/uiPolish.test.js` | +1 describe block (6 contracts, 88 行) + 3 既有 contract 改 range / swap | E12-F 契约 + 既有契约随 E12-F 调整 |

---

**END OF UI-E12-F REPORT** — 6/6 E12-F contracts green, 992/992 全量 test pass, build clean, diff --check clean, 0 forbidden pattern, 0 structural change.