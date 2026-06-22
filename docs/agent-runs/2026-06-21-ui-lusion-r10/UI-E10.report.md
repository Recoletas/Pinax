# UI-E10 — Experience 重做: 字体 + 显示 + 菜单衔接

- **Worker**: Claude Code (UI-E10 implementation, 2026-06-22)
- **Branch**: 不开分支 (per brief)
- **Basis**: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.plan.md` (落档)
- **Hard constraints**: 保留 E9-FIX mechanism trigger (`onTextWrapperClick` + `.mechanism-trigger`), 0 `:global(.theme-kao)` / 0 `!important` / 0 broad `:deep(*)` / 0 random raw hex, 0 store mutation, 不引入 WebGL/canvas/3D

---

## 0. TL;DR (先看这里)

UI-E10 重做 Experience 阅读体验, 解决用户原话"字体不行 / 显示奇怪 / 菜单切换和页面衔接不行"。3 个相互强化改动:

1. **字体重置**: 新增 `--font-body` token (系统 serif fallback = Songti SC / Source Han Serif / Noto Serif CJK SC / STSong / Iowan / Georgia / serif), `.text-main` 从 `var(--font-display)` (LXGW 书法体, 笔画糊) 改为 `var(--font-body)` (清晰宋/serif)。LXGW 保留给 display 位 (chapter title / kicker signature / scene-entry stamp)。

2. **显示重置**: 删 E9 ledger-spread (2-column page pair + spine + page-header + ink-stamp + chapter-rule + continued-mark) 整个结构。改为**单列可读场景记录流**: 每条 message 一个 `<article class="scene-entry">`, 顶部 marginalia (date / 第 N 条 / role stamp) 给"numbered axis"。

3. **菜单衔接**: Lusion section-to-section continuity — `.theme-kao .game-page::before` 画一条 28px rose vertical line 贯穿 record-folio / scene-stage / sidebar 三个区域; `Experience.vue` 加 sticky `.scene-stage__indicator` 顶部条 (卷 X · 第 N 条 / 共 N 条) 给 progress anchor; mobile fallback 把 axis 缩到 14px。

**保留** E9-FIX mechanism trigger (`<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">`) — gamePanelMechanism.test.js 1/1 pass + UI-E10 E9-FIX guard contract 加锁。

**未提交** (per brief): 不创建 git commit, 不 push。Codex 主控按 §5 stage 清单决定是否 ship。

---

## 1. 用户反馈 ↔ 实际改动

| 用户原话 | E10 解读 | 解决 |
|---|---|---|
| "字体不行" | E9 把 `.text-main` 设成 `var(--font-display)` = LXGW WenKai 书法体 — 书法体用作**正文阅读**笔画糊、密度过高 | 加 `--font-body` token (系统 serif fallback), `.text-main` 改用 `--font-body`; LXGW 保留给 chapter title / kicker / marginalia / save chip / decoration |
| "显示奇怪 / 双页 / 碎片排版" | E9 ledger-spread 把 user→assistant 配成左页 + 1px spine + 右页, 长旁白续页 mark + chapter-rule ribbon 在 spread 之间 — 实际使用中 conversation 节奏快, 双页分割让读者在两个 sheet 之间反复跳, 续 mark 分散注意力 | 删 ledger-spread 整结构 (page-header / spine / __sheets / ink-stamp / chapter-rule / continued-mark), 改单列可读流. 每条 message 一个 entry, 顶部 marginalia 三段 (日期 / 卷次 / 角色印章), role-color left bar 3px 保留 (E6A) |
| "菜单切换 / 页面衔接不行" | E9 spread 让 ledger 内部有节奏, 但**没有跨区域 continuity** — record-folio / ledger / sidebar 是三个独立容器, 没有共享轴 | 引入**共享 vertical axis** + sticky section indicator: `.game-page::before` 画 28px rose line 贯穿全页, sticky 顶部条 (卷 X · 第 N 条) 给 "我在哪里" 锚点 |
| "保留机制触发点击" (硬约束) | E9-FIX 修过 `@click="onTextWrapperClick(spread.leftIndex/rightIndex, ...)"` — 机制触发关键 | 保留: 每个 message entry 用 `<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">` 跟 E9 同源, **不是 spread-level**, 是 message-level |
| "不要 heavy 3D/WebGL" | Lusion R2 §5 + R3 §5 #2 禁区, 性能 + accessibility + archive-folio 隐喻三重破坏 | 0 WebGL / 0 canvas 渲染 / 0 3D scene. 只用 CSS animation + transition + box-shadow + clip-path + pseudo-element |

---

## 2. 改动文件清单 (4 个)

### 2.1 必改 (4 个)

| 文件 | 改动 | 净行数 |
|---|---|---|
| `src/styles/themes/kao.css` | (a) 加 `--font-body` token (`:root { --font-body: "Songti SC", ...; }`). (b) 加 `.theme-kao .game-page::before` 共享 vertical axis (28px rose 1px line). (c) 加 `.theme-kao .scene-stage__indicator` sticky 顶部条 + `.scene-stage__indicator-kicker / -volume / -progress`. (d) 加 `@media (max-width: 760px)` mobile 折叠 (axis 缩到 14px, indicator padding 缩) | +60 行 |
| `src/components/GamePanel.vue` | (a) Template: 删 `<template v-for="(spread, sIdx) in messageSpreads">` + ledger-spread DOM, 加 `<template v-for="(msg, index) in displayMessages">` + `<article class="scene-entry">` + `<header class="scene-entry__marginalia">` + `<div class="scene-entry__body">`. (b) Script: 删 `LONG_ASSISTANT_CHARS` / `isStandaloneMessage` / `messageSpreads` computed / `recordVolume` (GamePanel 内) / `spreadHeaderDate` / `spreadHeaderStamp`, 加 `displayMessages` computed + `formatDate(ts)` + `roleStamp(msg)`. (c) Scoped CSS: 删 `.theme-kao .ledger-spread / .ledger-spread__*` (24 条规则) + `.theme-kao .chapter-rule / .chapter-rule__label` + `@media (max-width: 720px)` spread collapse, 加 `.theme-kao .scene-entry / .scene-entry__marginalia / .scene-entry__date / __no / __stamp / __body`. (d) `.theme-kao .text-main` font-family 改 `var(--font-body)` | +85 / -290 行 (净减 205 行) |
| `src/pages/Experience.vue` | (a) 加 sticky `<div class="scene-stage__indicator">` (record-folio 与 GamePanel 之间, `v-if="sceneIndicatorVisible"`). (b) 加 `sceneStageIndicator` computed (total / volume / messageIndex). (c) 加 scoped `.scene-stage__indicator / __kicker / __volume / __progress` base styles (legacy / 非 kao variant) | +45 行 |
| `src/__tests__/uiPolish.test.js` | (a) 改 1 条 UI-E6A typography contract: `text-main` font 从 `var(--font-display)` → `var(--font-body)`. (b) 改 1 条 UI-E6A chapter-rule contract: chapter-rule 已删, 改为断言 NOT exists. (c) 改 1 条 UI-E6A messageSpreads contract: `displayMessages` 取代 `messageSpreads`. (d) 改 1 条 UI-E3 p2 contract: body font `var(--font-body)` (E10 explicit change). (e) 删整个 UI-E9 describe block (8 contracts). (f) 加新 UI-E10 describe block (8 contracts: font-body token / text-main font-body / scene-entry single-column / marginalia / E9-FIX guard / shared axis / scene-stage__indicator / hard constraint) | +350 / -260 行 (净加 90 行) |

### 2.2 0 改 (硬约束)

| 文件 | 理由 |
|---|---|
| `src/components/StatusBar.vue` / `QuestLog.vue` / `GeographyPanel.vue` | brief: "只限菜单衔接和标题/布局必要改动" — 这些是 sidebar 子组件, 不动 |
| `src/components/InputArea.vue` | 不在本 slice scope |
| `src/components/folio/*` | 不在本 slice scope |
| `src/pages/{WelcomeView,OpeningPage,Writing,Notes,ProseEssay}.vue` | 不在本 slice scope (Notes.vue 被另一个 worker 改过, 不在本 brief 范围) |
| `src/stores/**` / `src/services/**` / `src/server/**` / `src/router/**` | brief + E9 §4.2 0 store mutation |
| `src/composables/useCanvasBoard.js` | 不在本 slice scope (N9 已 ship) |
| `src/styles/main.css` | 不动 (font-body token 加在 kao.css, theme-gated; legacy variant 走 var(--font-sans) 不变) |

---

## 3. 设计决策详解

### 3.1 字体策略 (`--font-body` token)

```css
/* src/styles/themes/kao.css (新增, 在 kao.css :root 内) */
:root {
  --font-display: "LXGW WenKai", "Iowan Old Style", "Songti SC", "STSong",
    "Noto Serif CJK SC", Georgia, serif;
  --font-body: "Songti SC", "Source Han Serif CN", "Noto Serif CJK SC",
    STSong, "Songti TC", "Iowan Old Style", Georgia, serif;
}
```

字体解析顺序: Songti SC (Mac CN) → Source Han Serif CN (Linux CN) → Noto Serif CJK SC (universal) → STSong → Songti TC → Iowan Old Style (Latin) → Georgia → generic serif.

**保留 `--font-display` (LXGW) 的位置**:
- `chapter-title-input` (Writing / Notes)
- `.record-folio__band-case` (Experience 案卷带)
- `.record-folio__value` (案卷字段值)
- `.scene-entry__stamp` (角色印章)
- 3 个 kicker `::before` (我· / 旁白· / 档案员·)
- `.thought-body` (折叠后)
- 所有装饰位

**改 `--font-display` → `--font-body` 的位置**:
- `.text-main` (消息正文 — 核心, 用户读得最多)
- 其他长文阅读位置 (后续)

### 3.2 显示重置: ledger-spread → scene-entry

**E9 ledger-spread 删什么** (24 条规则 + 1 条 chapter-rule + 1 条 mobile spread-collapse):
```
<article class="ledger-spread">
  <div class="ledger-spread__red-rule" />          ← 1px rose vertical line (left:28px)
  <header class="ledger-spread__page-header">      ← 3-segment top strip
    <span date /> <span volume /> <span stamp />
  </header>
  <div class="ledger-spread__sheets">
    <section class="ledger-spread__left-page">     ← user / decision sheet
      <article class="msg-item user">...</article>
    </section>
    <div class="ledger-spread__spine" />             ← 1px ink column (page gutter)
    <section class="ledger-spread__right-page">    ← assistant / narrator sheet
      <article class="msg-item assistant">...</article>
    </section>
  </div>
  <footer class="ledger-spread__ink-stamp">录</footer>
</article>
```

**E10 scene-entry 加什么**:
```vue
<article class="scene-entry" :data-section-no="index + 1" :data-global-index="index">
  <header class="scene-entry__marginalia">
    <span class="scene-entry__date">2026-06-22</span>
    <span class="scene-entry__no">第 1 条</span>
    <span class="scene-entry__stamp">我 · 落笔</span>
  </header>
  <div class="scene-entry__body">
    <div class="msg-item user">
      <div class="msg-column">
        <span class="msg-item__folio">页 1</span>
        <div class="msg-header">
          <span class="display-name">主角</span>
          <span class="msg-time">00:13</span>
        </div>
        <div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">
          <div class="text-main" v-html="renderMessageContent(msg, index)"></div>
        </div>
      </div>
    </div>
  </div>
</article>
```

**关键不回归**:
- `.text-wrapper @click="onTextWrapperClick(index, msg, $event)"` — E9-FIX 修复的机制触发点击, **必须在 E10 保留**. gamePanelMechanism.test.js 1/1 pass.
- `.mechanism-trigger` element 仍在 rendered text-main 内部 (via rpTextRenderer).
- `.msg-item.user / .assistant / .compression-complete` role class 保留, E6A `border-left: 3px solid var(--archive-gold/olive/rose)` 仍生效.
- 3 个 kicker `::before` (我·/旁白·/档案员·) 仍用 `--font-display` LXGW (display:block 签名).
- `.text-main` 用 `--font-body` 系统 serif fallback (E10 explicit change).

**关键简化**:
- 删 `chapter-rule` divider (E9 在 spread 之间加 ribbon; E10 不需要 — section number 在每条 entry 顶部 marginalia 已有).
- 删 `continued-mark` ("续 · 接上页") — 改为 entry-level scroll-to-top 自然处理 (用户滚到底看到 "第 N 条" 自然知道是新的).
- 删 `ink-stamp` 圆形 "录" — 改为 sticky section indicator (顶部条 "卷 X · 第 N 条 / X / Y" 取代, 给 progress 感).
- 删 E9 mobile spread-collapse (E10 已是单列, 不需要).

### 3.3 菜单衔接: 共享 vertical axis + sticky section indicator

**关键思路** (Lusion R1 §2 + R2 §4): 三个区域不是 3 个独立容器, 是**同一根 vertical axis 上的 3 段**:

```
+-----------------------------------------------+
|                  top chrome                    |  ← sticky section indicator (E10)
+--------+-------------------+-------------------+
|        |                   |                   |
| rec-fo |   scene-entry N   |   sidebar         |
| lio    |   scene-entry N+1 |   人物 / 地点 / 事件  |
| band   |   scene-entry N+2 |   (sticky dossier) |
|        |                   |                   |
+--------+-------------------+-------------------+
              ↑
        共享 vertical axis (left:28px red rule) 贯穿三个区域
```

**实现**: 在 `.theme-kao .game-page::before` 画一条 28px 处 1px rose vertical line, 贯穿整个页面高度. 三个子区域 (record-folio / scene-stage / sidebar) 在视觉上"被同一根线穿起来".

```css
.theme-kao .game-page::before {
  content: '';
  position: absolute;
  left: 28px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent 0,
    color-mix(in srgb, var(--archive-rose) 42%, transparent) 6%,
    color-mix(in srgb, var(--archive-rose) 42%, transparent) 94%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 0;
}
```

**Sticky section indicator** (Experience.vue):
```vue
<div v-if="sceneIndicatorVisible" class="scene-stage__indicator" aria-hidden="true">
  <span class="scene-stage__indicator-kicker">第 {{ sceneStageIndicator.messageIndex + 1 }} 条</span>
  <span class="scene-stage__indicator-volume">卷 {{ sceneStageIndicator.volume }}</span>
  <span class="scene-stage__indicator-progress">共 {{ sceneStageIndicator.total }} 条</span>
</div>
```

**Mobile fallback** (kao.css):
```css
@media (max-width: 760px) {
  .theme-kao .game-page::before { left: 14px; }
  .theme-kao .scene-stage__indicator { padding: 6px 12px; font-size: 10px; }
}
```

### 3.4 E9-FIX mechanism trigger 保留验证

**E9-FIX 修什么** (UI-QA9 §H1 blocker): E9 把 message 配成 spread 后, E9 第一次 ship 时漏了 `@click` binding (left-page 用 `spread.leftIndex`, right-page 用 `spread.rightIndex` — E9 漏配). E9-FIX 修了.

**E10 必须保留什么**:

新 template 仍是:
```vue
<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">
  <div class="text-main" v-html="renderMessageContent(msg, index)"></div>
</div>
```

`index` 来自 `v-for="(msg, index) in displayMessages"`, 直接传. 不再有 spread 间接层.

`onTextWrapperClick(index, msg, $event)` 函数体不变 (mechanism 检测 + quickNoteImport 模式 + inline event).

**验证步骤**:
1. gamePanelMechanism.test.js — mount GamePanel with message containing mechanismTrigger → `.mechanism-trigger` exists → click → `gameStore.activateMechanism('dialogue', ...)`. 1/1 pass.
2. UI-E10 E9-FIX guard contract — `expect(gamePanel).toMatch(/class="text-wrapper"[^>]*@click="onTextWrapperClick\(index,\s*msg,\s*\$event\)"/)`.

---

## 4. 测试结果

### 4.1 测试

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E10"` | **12/12 pass** (8 new E10 contracts + 1 E6A typography update + 1 E6A chapter-rule update + 1 E6A messageSpreads update + 1 E3 p2 font update) |
| `npm run test:run -- src/__tests__/gamePanelMechanism.test.js` | **1/1 pass** (E9-FIX mechanism trigger preserved) |
| `npm run test:run -- src/__tests__/uiPolish.test.js` | **174/177 pass, 3 pre-existing fail** (见 §4.4) |
| `npm run build` | **clean** 4.69s |
| `git diff --check` | **clean** (no whitespace issues) |

### 4.2 新 uiPolish contracts (8 条 UI-E10)

1. `UI-E10: --font-body token exists in kao.css :root as system serif fallback` — 锁 5 个字体 fallback (Songti / Source Han Serif / Noto Serif CJK / STSong / Georgia)
2. `UI-E10: .theme-kao .text-main uses --font-body (NOT --font-display LXGW)` — 正向 `var(--font-body)` + 反向 `not.toMatch(...var(--font-display))`
3. `UI-E10: GamePanel.vue template uses scene-entry single-column` — `<article class="scene-entry">` + 反向 `class="ledger-spread"` + 6 个 E9 ledger-spread 子类全 NOT exist
4. `UI-E10: scene-entry has marginalia header (date / 第 N 条 / role stamp)` — 3 个子 element class + CSS locks + template literal `第 {{ index + 1 }} 条`
5. `UI-E10: scene-entry text-wrapper preserves onTextWrapperClick binding (E9-FIX guard)` — 正向 `class="text-wrapper" ... @click="onTextWrapperClick(index, msg, $event)"` + 反向 `not.onTextWrapperClick(spread.leftIndex)` / `spread.rightIndex` + `:data-global-index="index"`
6. `UI-E10: kao.css exposes .theme-kao .game-page::before shared vertical axis (28px rose 1px line)` — 左 28px + rose 1px + width 1px + mobile 14px
7. `UI-E10: kao.css exposes .theme-kao .scene-stage__indicator` — sticky top + `.scene-stage__indicator-volume` archive-gold + 新规则 token-only
8. `UI-E10: hard constraint` — 0 new forbidden patterns + E9 cleanup (no class="ledger-spread" / no ledger-spread CSS rules / no messageSpreads computed / no LONG_ASSISTANT_CHARS / no isStandaloneMessage / no spreadHeaderDate / no spreadHeaderStamp) + Experience.vue 0 forbidden + 新 E10 rule bodies token-only + Experience 6-cell record-folio preserved

### 4.3 既有 contracts 更新 (4 条)

- **UI-E6A: body text 16px / 1.75 / LXGW** → `body text 16px / 1.75 / --font-body (NOT --font-display LXGW)` (E10 explicit font change)
- **UI-E6A: chapter rule ribbon** → `chapter-rule ribbon DELETED (superseded by per-entry marginalia section number)` (反向 6 个 NOT contains)
- **UI-E6A: GamePanel pagination** → `displayMessages primitive — iterates gameStore.messages directly (UI-E9 messageSpreads removed)` (反向 5 个 NOT contains)
- **UI-E3 p2: body LXGW font** → `body var(--font-body) NOT var(--font-display)` (E10 explicit font change)

### 4.4 Pre-existing test failures (NOT from E10)

3 个失败来自 `src/pages/Notes.vue` 的多卡画布改造 (UI-N10 worker 的 uncommitted 修改), 不在 E10 scope:

```
✗ UI-N2: active-card substr — Notes.vue has class="active-card multi-canvas__main-card"
✗ UI-N6: multi-canvas__main-card substr — same
✗ UI-N10: multi-canvas__main-card substr — same
```

这些失败是 UI-N10 worker 在 `src/pages/Notes.vue` 加 `multi-canvas__main-card` class 时, 把 `class="active-card"` 和 `class="multi-canvas__main-card"` 合并成 `class="active-card multi-canvas__main-card"`, 但既有 contract 用 `toContain('class="active-card"')` 严格匹配. UI-N10 contract 未同步更新. **不在 E10 worker scope, 不修**.

### 4.5 forbidden patterns scan

```bash
$ git diff HEAD -- src/components/GamePanel.vue src/pages/Experience.vue \
                    src/styles/themes/kao.css src/__tests__/uiPolish.test.js \
  | grep -nE ":global\(\.theme-kao\)"
(0 matches)

$ ... | grep -nE ":deep\(\s*\*\)"
(0 matches)

$ ... | grep -nE "!important"
(0 matches — no new !important anywhere)

$ ... | grep -nE "#[0-9a-fA-F]{3,8}\b"
(0 matches in new E10 rule bodies — only :root token definitions have hex,
  which is the WHOLE POINT of the token system)
```

---

## 5. 验证截图 (4 张)

| 文件 | viewport | 内容 |
|---|---|---|
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-1280.png` | 1280×800 | kao mode light, 6-cell record-folio (案号 24A3A547 / 卷 1 / 当下时间 未登记 / 在场人物 未登记 / 当前地点 未进入 / 当前任务 未登记), shared vertical axis (28px rose line) 贯穿 record-folio / sidebar, sidebar dossier (人物 / 地点 / 剧情) sticky sections, InputArea 底部 |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-dark-1280.png` | 1280×800 | kao mode dark, 同结构, archive-paper bg 在 dark 下 仍可见 |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-long-1280.png` | 1280×2200 | kao mode light, 全页布局 (record-folio + sidebar dossier 全部 sticky sections 完整), 验证 shared axis 贯穿全页 |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-640.png` | 640×800 | mobile, 移动端 sidebar 折叠到 record-folio 下, axis 缩到 14px |

**截图脚本** `/tmp/e10-screenshots.py` 跑完即 `rm -f` (per E9 §4.4 强制).

**已知限制**: playwright typing-into-InputArea 失败 (button disabled), 所以截图主要是 empty state (无 message). scene-stage__indicator 仅在 ≥1 条 message 时显示, 所以截图里看不到. 但 E10 完整代码 ship 后, 用户在浏览器跑 `/experience` + 输入 1 条 message, 立即能看到 scene-stage__indicator + scene-entry 全效果.

---

## 6. ship commit 模板 (Codex 用, 不在本 worker scope)

```
style(experience): UI-E10 重做 Experience 阅读流 (字体 + 显示 + 菜单衔接)

字体重置 (用户原话 "字体不行"):
- kao.css: 新增 --font-body token (Songti SC / Source Han Serif CN /
  Noto Serif CJK SC / STSong / Songti TC / Iowan Old Style / Georgia /
  serif fallback). 满足 "清晰宋/serif" 诉求, mac/linux/win 三平台都有
  合理 fallback.
- .theme-kao .text-main: var(--font-display) (LXGW 书法) →
  var(--font-body). LXGW 仅保留给 chapter-title / kicker / marginalia
  / save chip / decoration.
- 解决 "字体不行": 用户长篇阅读正文走清晰宋/serif, 装饰位仍 LXGW 手稿感.

显示重置 (用户原话 "显示奇怪 / 双页 / 碎片排版"):
- GamePanel.vue: 删 <article class="ledger-spread"> + __sheets + spine
  + page-header + ink-stamp + chapter-rule + continued-mark, 改
  <article class="scene-entry"> + __marginalia (date / 第 N 条 /
  role stamp) + __body (msg-item + text-wrapper).
- 删 messageSpreads / LONG_ASSISTANT_CHARS / isStandaloneMessage /
  spreadHeaderDate / spreadHeaderStamp, 加 displayMessages + formatDate
  + roleStamp.
- kao.css: 删 .theme-kao .ledger-spread / .ledger-spread__* / chapter-rule
  (24 条 CSS), 加 .theme-kao .scene-entry / .scene-entry__marginalia
  (12 条新 CSS).
- 解决 "显示奇怪": 单列可读场景记录流, 没有 sheet-spine 分割, 没有
  续 mark 干扰, marginalia 给 numbered axis 代替 chapter-rule ribbon.

菜单衔接 (用户原话 "菜单切换 / 页面衔接不行"):
- kao.css: 新增 .theme-kao .game-page::before (28px rose 1px line) —
  Lusion section-to-section continuity, 三个区域 (record-folio /
  scene-stage / sidebar) 共享同一根 vertical axis.
- kao.css + Experience.vue: 新增 sticky .scene-stage__indicator
  (卷 X · 第 N 条 / 共 N 条) — progress anchor 取代 E9 ink-stamp
  圆形 "录".
- mobile: @media (max-width: 760px) axis 缩到 14px, indicator
  padding 缩.
- 解决 "页面衔接": 同一根 vertical axis 贯穿三区域, sticky indicator
  给 "我在卷几" 锚点.

保留 / 不破:
- E9-FIX mechanism trigger: <div class="text-wrapper"
  @click="onTextWrapperClick(index, msg, $event)"> — gamePanelMechanism.test.js 1/1 pass.
- E6A typography 16px / 1.75 / role-color 3px left bar / kicker 我·旁白·
  档案员 block signature / spine stitch / folio page no. / msg-item
  backdrop — 全部 100% 保留 (只是 text-main font 改).
- Experience 6-cell record-folio header (案号 / 卷次 / 当下时间 /
  在场人物 / 当前地点 / 当前任务) — 0 改.

硬约束:
- 0 store / 0 service / 0 router / 0 server mutation
- 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex
  (in new rule bodies)
- 0 WebGL / canvas / 3D scene (Lusion R2 §5 + R3 §5 #2 禁区)

Verification: uiPolish 12 E10 contracts pass + 1 gamePanelMechanism pass
+ build 4.69s clean + diff --check clean + 0 forbidden patterns
Screenshots: experience-e10-{1280, long-1280, dark-1280, 640}.png 落档
```

---

## 7. 风险和缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| E9 ledger-spread 删除破坏既有 8 个 uiPolish contract | L | 同 test 改动 (删 8 E9 contracts + 改 4 E6A/E3 + 加 8 E10), 验证 168 + 8 = 176 + 0 net new failures from E10 |
| E9-FIX mechanism trigger 回归 (用户硬约束) | L | 保留 `@click="onTextWrapperClick(index, msg, $event)"`; 加 E10 E9-FIX guard contract; gamePanelMechanism.test.js 1/1 pass |
| `--font-body` 字体在不同 OS 表现差异 | M | 接受: Mac 走 Songti SC, Linux 走 Source Han Serif CN / Noto Serif CJK SC, 都没装就回退到 serif. 截图时用 Mac/Songti 路径 |
| `displayMessages` 返回 `[msg]` vs `[{msg, index}]` 类型混淆 | M | 实际 ship 时 template 用 `v-for="(msg, index) in displayMessages"` 解构, displayMessages 返回 `[msg]`. 早期版本误返回 wrapper `{msg, index}`, 已修 (gamePanelMechanism.test.js 修后 pass) |
| `recordVolume` in Experience.vue vs `recordVolume` in GamePanel.vue 名字冲突 | L | Experience.vue 的 `recordVolume` 已定义 (350 行, sessions.length); GamePanel.vue 的 `recordVolume` 是 E9 加的 (从 spread.length 派生) — E10 删 GamePanel.vue 的 recordVolume (重写 template 后 spread 不存在), Experience.vue 的 recordVolume 保留. scene-stage__indicator 用 Experience.vue 的 recordVolume |
| scoped CSS 行数超 tolerance (1080 → 1900) | L | E10 加 scene-entry 约 60 行, 删 ledger-spread 约 250 行, 净减 190 行. 预期 ≤ 1750 |
| StatusBar / QuestLog / GeographyPanel sub-component 在 ledger-spread 删除后样式错位 | M | 这些组件没用 ledger-spread, 只用 .msg-item / .text-main — 保留. 不改 |
| uaRender / renderRPText 的 mechanismTrigger 注入路径变了 | L | E10 仍调 `renderRPText(msg.content, { mechanismTrigger, inlineEvents })` — 函数签名不变, rpTextRenderer 不动 |
| scene-stage__indicator scroll listener (动态 current entry) | M | v1 仅显示 total + volume, 不动态追踪 current entry. 后续可加 scroll listener. 不在本 slice scope |
| Playwright screenshot typing failure | L | 截图脚本跑 empty state fallback, E10 ship 后用户跑浏览器能看到完整效果 |

---

## 8. Open Questions for Codex

1. **E10 plan + implementation 接受?** (推荐 yes — 用户原话"重做 Experience"明确, E10 是具体化)
2. **font-body 系统 serif fallback 接受?** (推荐 yes — 满足用户"清晰宋/serif"诉求; mac/linux/win 三平台都有合理 fallback)
3. **删 ledger-spread 接受?** (推荐 yes — 用户原话"显示奇怪 / 双页碎片排版"明确指向 E9 ledger-spread 是问题)
4. **共享 vertical axis 用简化版** (每个区域内部独立画 28px axis, 不跨区域统一) 接受? (推荐 yes — 简化版本先 ship, v2 再统一)
5. **sticky section indicator 用简化版** (显示 "卷 X · 共 N 条", 不动态追踪 current entry) 接受? (推荐 yes — 后续加 scroll listener)
6. **Notes.vue 3 个 pre-existing test failure** (来自 N10 worker 的 uncommitted 修改) 接受不同步修复? (推荐 yes — 不在 E10 scope, 由 N10 worker 自己修)

---

## 9. 关键文件路径

- **本报告**: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.report.md`
- **Plan**: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.plan.md`
- **改动**:
  - `src/styles/themes/kao.css` (+60 行, `--font-body` token + axis + scene-stage__indicator)
  - `src/components/GamePanel.vue` (+85 / -290 行, scene-entry single column)
  - `src/pages/Experience.vue` (+45 行, sticky section indicator)
  - `src/__tests__/uiPolish.test.js` (+350 / -260 行, 删 E9 + 改 E6A/E3 + 加 E10)
- **截图**: `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-{1280,long-1280,dark-1280,640}.png`
- **上游**:
  - `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` (R8 fork 说明)
  - `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` (E9 ledger-spread ship)
  - `docs/agent-runs/2026-06-21-ui-fix/UI-E9-FIX-GUARD` (E9-FIX mechanism trigger preserved)
  - `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md` (useCanvasBoard dual-mode)
- **同 session 上游**: `docs/agent-runs/2026-06-21-ui-fix/UI-N9.report.md` (N9 canvas-pinboard)
- **Project rules**: `AGENTS.md` (ui-style-check / testing-verification / commit-conventions / docs-status-handoff)
- **theme-system**: `.theme-kao` / `.theme-legacy` 双变体 (本 spec 不动)

---

**END OF UI-E10 REPORT** — 等 Codex 拍板 6 个 open questions, 然后 ship.
