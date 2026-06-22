# UI-E10 — Experience 重构:字体 + 显示 + 菜单衔接

> **Owner**: Claude Code (UI-E10 worker, 2026-06-21)
> **Branch**: 不开分支 (per brief)
> **Basis**: `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` §0 + `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` (E9 ledger-spread ship)
> **Predecessor**: UI-E9 (ledger-spread 对开页) — **E10 不是 polish E9, 是因为用户反馈"显示奇怪 / 双页碎片排版", 整体重做 Experience 阅读流**
> **Hard constraints**: 保留 E9-FIX mechanism trigger (`onTextWrapperClick` + `.mechanism-trigger`), 0 `:global(.theme-kao)` / 0 `!important` / 0 broad `:deep(*)` / 0 raw hex, 0 store mutation, 不引入 WebGL/canvas/3D

---

## 0. 摘要

用户反馈 Experience 页"字体不行 / 显示奇怪 / 菜单切换和页面衔接不行", 要求**结合 Lusion 调研重做**。E10 = 3 个相互强化的改动:

1. **字体重置**: 加 `--font-body` token (系统 serif fallback = 宋/serif 体系), 把正文 `.text-main` 从 LXGW 书法体换成可读 serif。LXGW 只保留给 display 位 (chapter title / kicker signature / save chip)。
2. **显示重置**: 删 E9 的 ledger-spread (2-column page pair / 1px spine / page-header / ink-stamp / chapter-rule) 整个结构。改为**单列可读场景记录流**: 每条 message 一个清晰 entry, 顶部 page-marginalia (date + section number + role stamp), 左侧 28px red margin rule 作为 permanent vertical axis, role-color left bar 改 3px (保留 E6A)。
3. **菜单衔接**: Lusion section-to-section continuity — 三个区域 (record-folio 顶部 / 消息流 / sidebar 右侧) **共享同一条 vertical axis**(同 X 位置 28px red margin rule), 顶部 sticky section indicator (卷 X · 第 Y 条) 给"我在哪里"的连续感。Mobile 折叠为单列保留 axis。

**保留** E9-FIX mechanism trigger (`<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">`) + E6A folio / kicker / role-color bar — **不回归**.

---

## 1. 用户反馈 ↔ 实际改动

| 用户原话 | E10 解读 | 解决 |
|---|---|---|
| "字体不行" | E9 把 `.text-main` 设成 `var(--font-display)` = LXGW WenKai 书法体 — 书法体用作**正文阅读**太重, 笔画糊 | 加 `--font-body` token (系统 serif fallback), `.text-main` 改用 `--font-body`; LXGW 只保留给 display 位 (chapter title, kicker, save chip, decoration) |
| "显示奇怪 / 双页 / 碎片排版" | E9 ledger-spread 把 user→assistant 配成左页 + 1px spine + 右页, 长旁白自动续到下页 — 实际使用中 conversation 节奏快, 双页分割让读者在两个 sheet 之间反复跳; 长旁白续页 mark + 续字样分散注意力 | 删 ledger-spread 整个结构 (page-header / spine / __sheets / __ink-stamp / chapter-rule / __continued-mark), 改单列可读流. 每条 message 一个 entry, 顶部 marginalia 三段 (日期 / 卷次 / 角色印章), role-color left bar 3px (保留 E6A 视觉) |
| "菜单切换 / 页面衔接不行" | E9 spread 让 ledger 内部有节奏, 但**没有跨区域 continuity** — record-folio / ledger / sidebar 是三个独立容器, 没有共享轴, 用户视线跳来跳去没有"我在哪里"的连续感 | 引入**共享 vertical axis**: 三个区域 (record-folio / 消息流 / sidebar) 共享同一条 left-edge 红色 margin rule (28px), 顶部 sticky section indicator (卷 X · 第 Y 条) 给"我在卷几"的 progress 锚点 |
| "保留机制触发点击" (硬约束) | E9-FIX 加了 `@click="onTextWrapperClick(spread.leftIndex/rightIndex, ...)"` — 是机制触发能用的关键 | 保留: 每个 message entry 用 `<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">` 跟 E9 同源, **不是 spread-level**, 是 message-level |
| "不要 heavy 3D/WebGL" | Lusion R2 §5 + R3 §5 #2 禁区, Performance + accessibility + archive-folio 隐喻三重破坏 | 0 WebGL / 0 canvas 渲染 / 0 3D scene. 只用 CSS animation + transition + box-shadow + clip-path + pseudo-element |

---

## 2. 改动文件清单 (4 个)

### 2.1 必改

| 文件 | 改动 |
|---|---|
| `src/styles/themes/kao.css` | (1) 新增 `--font-body` token: `Songti SC, "Source Han Serif CN", "Noto Serif CJK SC", STSong, "Iowan Old Style", Georgia, serif`. (2) 删 `.theme-kao .ledger-spread / .ledger-spread__*` 系列 (24 条规则, 全部走). (3) 加 `.theme-kao .scene-entry / .scene-entry__marginalia / .scene-entry__body / .scene-entry__axis-rule` 系列 (单列可读流 + 共享 axis). (4) `.theme-kao .text-main` 改 `--font-body`. (5) `.theme-kao .game-page` 加 sticky section indicator + 共享 axis (`::before` 画左侧 1px vertical axis 贯穿全页) |
| `src/components/GamePanel.vue` | (1) `<template v-for="(spread, sIdx) in messageSpreads">` → `<template v-for="(msg, index) in displayMessages">`. (2) 删 ledger-spread / sheets / spine / page-header / ink-stamp / continued-mark / chapter-rule DOM. (3) 加 `<article class="scene-entry" :data-section-no="index + 1">` 包装每条 message, 顶部 `<header class="scene-entry__marginalia">` (3 段: 日期 / 第 N 条 / 角色印章), body 保留 `.msg-item` + `.text-wrapper`. (4) `.text-wrapper` 改 `@click="onTextWrapperClick(index, msg, $event)"` (不再用 spread.leftIndex/rightIndex). (5) 删 `messageSpreads` computed + `recordVolume` + `spreadHeaderDate` + `spreadHeaderStamp` + `isStandaloneMessage` + `LONG_ASSISTANT_CHARS` — 用 `displayMessages` 替换 (per-message 显示数组). (6) 删 scoped CSS `.ledger-spread / .ledger-spread__*` 全部, 加 `.scene-entry` 系列 |
| `src/pages/Experience.vue` | (1) `<section class="record-folio">` 加 `.record-folio__axis-marker` (小条 "I / II / III" 序号, sticky 顶部). (2) `<GamePanel>` 周围包 `<section class="game-stage">` 给共享 axis 容器. (3) `<aside class="sidebar">` 加 `.sidebar__axis-marker` 同步. (4) `.game-page` 加 sticky `<div class="scene-stage__indicator">` 顶部条 (卷 X · 第 Y 条 / X / Y), mobile 折叠. (5) 0 改 InputArea / StatusBar / QuestLog / GeographyPanel — brief 明确"只限菜单衔接和标题/布局必要改动", 这些是 sidebar 子组件不是"菜单", 不动 |
| `src/__tests__/uiPolish.test.js` | (1) 删 UI-E9 ledger-spread 8 contracts (CSS 关键字匹配失效). (2) 加 UI-E10 7 contracts: scene-entry / axis-rule / shared vertical axis / sticky section indicator / font-body / dark mode / reduced-motion. (3) 保留 E6A 既有 contract (typography 16px / kicker block / spine stitch / chapter rule / folio / msg-item backdrop / display-name sans / kicker 我·旁白·档案员 / hard constraint). 保留 E9 既有 mechanical trigger 不依赖 spread 的部分 (renderMessageContent / mechanismTrigger inline events). (4) 删 1 个 E9 chapter-rule contract (chapter-rule 删除) |
| `src/__tests__/gamePanelMechanism.test.js` | 0 改 — 验证 mechanism trigger 仍能点 (`.mechanism-trigger` click → `gameStore.activateMechanism('dialogue', ...)`). E10 重写 GamePanel template 但保留 `.text-wrapper @click="onTextWrapperClick"`, test 不需要改 |

### 2.2 0 改 (硬约束)

| 文件 | 理由 |
|---|---|
| `src/components/StatusBar.vue` / `QuestLog.vue` / `GeographyPanel.vue` | brief: "只限菜单衔接和标题/布局必要改动" — 这些是 sidebar 子组件, 不动 |
| `src/components/InputArea.vue` | 不在本 slice scope |
| `src/components/folio/*` | 不在本 slice scope |
| `src/pages/{WelcomeView,OpeningPage,Writing,Notes,ProseEssay}.vue` | 不在本 slice scope |
| `src/stores/**` / `src/services/**` / `src/server/**` / `src/router/**` | brief + E9 §4.2 0 store mutation |
| `src/styles/main.css` | 0 改 (font-body token 加在 kao.css 内, theme-gated; legacy variant 走 var(--font-sans) 不变) |
| `src/composables/**` | 不在本 slice |

---

## 3. 设计决策详解

### 3.1 字体策略 (`--font-body` token)

```css
/* src/styles/themes/kao.css (new) */
:root {
  /* UI-E10: system serif fallback for readable body text. LXGW 霞鹜文楷
     (--font-display) is too dense / brushy for long passages. Body text
     now resolves to Songti SC (Mac) → Source Han Serif CN (Linux/Win) →
     Noto Serif CJK SC (universal) → STSong → Iowan Old Style (Latin) →
     Georgia → serif. This is the readable 宋/serif combination the user
     asked for. */
  --font-body: "Songti SC", "Source Han Serif CN", "Noto Serif CJK SC",
    STSong, "Iowan Old Style", "Songti TC", Georgia, serif;
}
```

`.theme-kao .text-main` 改 `font-family: var(--font-body)` (从 `var(--font-display)` 改).

**保留** `--font-display` (LXGW) 的位置:
- `chapter-title-input` (Writing / Notes)
- `.record-folio__band-case` (Experience 案卷带)
- `.record-folio__value` (案卷字段值 — 这是 metadata 视觉装饰, 保持书法手稿感)
- `.scene-entry__marginalia__stamp` (角色印章 — 1 行显示, 不需要长篇可读)
- `.kicker` 系列 (3 个 `::before` "我·" / "旁白·" / "档案员·")
- `.thought-body` (`.details > .thought-body` 折叠后的 thought)
- `wall__stamp` / `dossier-tape` 等装饰
- 所有 `.kicker` / decorative label 位置

**改** `--font-display` → `--font-body` 的位置:
- `.text-main` (消息正文 — 这是核心, 用户读得最多的位置)
- `.thought-wrapper` 外层 (.thought-body 内部折叠保留 LXGW)

### 3.2 显示重置: ledger-spread → scene-entry

**E9 ledger-spread 删什么**:
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
<article
  class="scene-entry"
  :class="msg.role"
  :data-section-no="index + 1"
  :data-global-index="index"
>
  <header class="scene-entry__marginalia" aria-hidden="true">
    <span class="scene-entry__date">{{ formatDate(msg.timestamp) }}</span>
    <span class="scene-entry__no">第 {{ index + 1 }} 条</span>
    <span class="scene-entry__stamp">{{ roleStamp(msg.role) }}</span>
  </header>
  <div class="scene-entry__body">
    <div class="msg-item" :class="msg.role">
      <div class="msg-column">
        <span class="msg-item__folio">页 {{ index + 1 }}</span>
        <div class="msg-header">
          <span class="display-name">{{ displayName(msg) }}</span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div
          class="text-wrapper"
          @click="onTextWrapperClick(index, msg, $event)"
        >
          <div class="text-main" v-html="renderMessageContent(msg, index)"></div>
        </div>
      </div>
    </div>
  </div>
</article>
```

**关键不回归**:
- `.text-wrapper @click="onTextWrapperClick(index, msg, $event)"` — E9-FIX 修复的机制触发点击, **必须在 E10 保留** (per brief).
- `.mechanism-trigger` element 仍在 rendered text-main 内部 (via rpTextRenderer) — 测试 `wrapper.find('.mechanism-trigger').trigger('click')` 仍能找到.
- `.msg-item.user / .assistant / .compression-complete` role class 保留, E6A `border-left: 3px solid var(--archive-gold/olive/rose)` 仍生效.

**关键简化**:
- 删 `chapter-rule` divider (E9 在 spread 之间加 ribbon; E10 不需要 — section number 在每条 entry 顶部 marginalia 已有)
- 删 `continued-mark` ("续 · 接上页") — 改为 entry-level scroll-to-top 自然处理 (用户滚到底看到 "第 N 条" 自然知道是新的)
- 删 `ink-stamp` 圆形 "录" — 改为 sticky section indicator (顶部条 "卷 X · 第 Y 条 / X / Y" 取代, 给 progress 感)

### 3.3 菜单衔接: 共享 vertical axis

**关键思路** (Lusion R1 §2 + R2 §4): 三个区域不是 3 个独立容器, 是**同一根 vertical axis 上的 3 段**:

```
+-----------------------------------------------+
|                  top chrome                    |  ← sticky section indicator
+--------+-------------------+-------------------+
|        |                   |                   |
| rec-fo |   scene-entry N   |   sidebar         |
| lio    |   ----------------- |   --------------  |
| band   |   scene-entry N+1 |   卷宗一 人物      |  ← 共享 28px vertical axis
|        |   ----------------- |   卷宗二 地点      |
|        |                   |   卷宗三 事件      |
|        |                   |                   |
+--------+-------------------+-------------------+
              ↑
        共享 vertical axis (left:28px red rule) 贯穿三个区域
```

**实现**: 在 `.game-page` 上加 `::before` 画一条 28px 处 1px rose vertical line, 贯穿整个页面高度. 三个子区域 (record-folio / scene-stage / sidebar) 在视觉上"被同一根线穿起来".

```css
.theme-kao .game-page {
  position: relative;
}
.theme-kao .game-page::before {
  content: '';
  position: absolute;
  left: calc(50% - var(--game-page-half-width, 540px) + 28px);
  /* 28px 是 vertical axis X 坐标, 三个区域都从同一 X 开始 */
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent 0,
    color-mix(in srgb, var(--archive-rose) 48%, transparent) 4%,
    color-mix(in srgb, var(--archive-rose) 48%, transparent) 96%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 1;
}
```

注: 实际 X 坐标需要 `calc()` 基于 record-folio 容器左边缘 + 28px. **第一版用简化版本** — 在每个区域内部独立画 axis (record-folio__axis / scene-stage__axis / sidebar__axis, 都是 28px red rule), 等 v1 ship 后再统一. **保证 1 个改动文件 + 不破 contract**.

### 3.4 顶部 sticky section indicator

```vue
<!-- src/pages/Experience.vue -->
<div class="scene-stage__indicator" v-if="messagesCount > 0">
  <span class="scene-stage__indicator-kicker">第 {{ currentSection }} 条</span>
  <span class="scene-stage__indicator-volume">卷 {{ recordVolume }}</span>
  <span class="scene-stage__indicator-progress">
    共 {{ messagesCount }} 条
  </span>
</div>
```

```css
.theme-kao .scene-stage__indicator {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper) 88%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper-soft) 76%, transparent) 100%);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 56%, transparent);
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--archive-ink) 72%, transparent);
}
```

`currentSection` 来自 `<GamePanel>` emit (滚动到哪条 entry 时更新) — **第一版简化**: 显示 "卷 X · 共 N 条", 不动态追踪 current entry, 后续加 scroll listener.

### 3.5 mobile fallback

```css
@media (max-width: 760px) {
  /* mobile: 三个区域折叠为单列, axis 仍保留但变细 */
  .theme-kao .game-page::before {
    left: 14px;  /* axis 从 28px → 14px */
  }
  .theme-kao .scene-entry__marginalia {
    font-size: 10px;
    gap: 6px;
  }
  .theme-kao .scene-entry {
    padding-left: 22px;  /* 减 8px 让 mobile 更紧凑 */
  }
}
```

---

## 4. 如何避免破坏 E9-FIX mechanism trigger

### 4.1 E9-FIX 修复了什么

E9 把 message 配成 spread 后, 之前 `<div class="text-wrapper" @click="onTextWrapperClick(msgIndex, msg, $event)">` 还在, 但**因为 E9 把 text-wrapper 拆到 left-page 和 right-page 两个 section, left-page 的 @click 用了 `spread.leftIndex`, right-page 用了 `spread.rightIndex`** — E9 第一次 ship 时漏了 `@click` binding (UI-QA9 §H1 "E9 1 functional regression" = mechanism trigger 不工作), E9-FIX 修了这个.

测试 (gamePanelMechanism.test.js) 验证: `.mechanism-trigger` click → `gameStore.activeMechanism === 'dialogue'`.

### 4.2 E10 必须保留什么

**E10 重写 template** (删 ledger-spread, 改 v-for over messages). 新 template 仍是:
```vue
<div
  class="text-wrapper"
  @click="onTextWrapperClick(index, msg, $event)"
>
  <div class="text-main" v-html="renderMessageContent(msg, index)"></div>
</div>
```

**注意**: `index` 来自 `v-for="(msg, index) in displayMessages"`, 直接传 `index`. 不再有 `spread.leftIndex / spread.rightIndex` 间接层.

**注意**: `onTextWrapperClick(index, msg, $event)` 函数签名不变, 函数体保留 E9 的 mechanism 检测 (`.mechanism-trigger` closest 检测) + quickNoteImport 模式 + inline event 检测.

**测试不需要改** — `.mechanism-trigger` 是 `renderMessageContent` (rpTextRenderer) 输出的子元素, E10 仍调 `renderMessageContent`, 仍输出 mechanism-trigger, 测试仍能 find + click.

### 4.3 mechanism trigger 验证步骤

1. 在 E10 实施前, 跑测试 baseline:
   ```bash
   npm run test:run -- src/__tests__/gamePanelMechanism.test.js
   ```
   应该 1/1 pass.

2. E10 实施后, 跑同一测试:
   - pass = E9-FIX 保留成功
   - fail = 立刻回头找 `@click="onTextWrapperClick"` 哪里漏了

3. 在 uiPolish contract 加 1 条锁 "E10 template still has `onTextWrapperClick` on text-wrapper":
   ```js
   it('UI-E10: scene-entry text-wrapper preserves onTextWrapperClick binding (E9-FIX guard)', () => {
     const gamePanel = readProjectFile('src/components/GamePanel.vue')
     expect(gamePanel).toMatch(/class="text-wrapper"[^>]*@click="onTextWrapperClick/)
   })
   ```

---

## 5. 测试策略

### 5.1 必跑

```bash
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js
```

### 5.2 uiPolish test 改动清单 (≥ 7 条 UI-E10 + 1 条 E9-FIX guard)

**删** (E9 ledger-spread 相关, template 改后失效):
1. `UI-E9: GamePanel.vue template uses <article class="ledger-spread"> + 3-segment page header + ink-stamp footer`
2. `UI-E9: spread left/right sheets + middle spine + red margin rule + continued mark + BOTH sheets wire @click handler`
3. `UI-E9: GamePanel.vue template iterates messageSpreads (NOT messageGroups) — chapter-rule now keys on spread index`
4. `UI-E9: scoped .theme-kao CSS implements book-spread layout: 3-column grid (left / spine / right) + red rule + ink-stamp`
5. `UI-E9: GamePanel.vue implements messageSpreads computed — pairs adjacent user + assistant into left + right sheets, falls back to single-page spread`
6. `UI-E9: scoped .theme-kao CSS drops msg-item border-left / padding inside the spread`
7. `UI-E9: hard constraint — 0 new :global / !important / :deep(*) + 0 store mutation`
8. `UI-E6A: chapter-rule ribbon (chapter-rule 删除, E9 contract 失效)`

**改** (E6A typography 保留, 但 `.text-main` 改 `--font-body`):
- 1 条 `UI-E6A: body text bumped to 16px / line-height 1.75 / LXGW retained` → 改为 `body text 16px / line-height 1.75 / var(--font-body) NOT LXGW`

**加** (UI-E10 新 contract):
1. `UI-E10: --font-body token exists in kao.css as system serif fallback (Songti SC / Source Han Serif / Noto Serif CJK SC / STSong / Iowan Old Style / Georgia / serif)`
2. `UI-E10: .theme-kao .text-main uses --font-body (NOT --font-display LXGW) for readable body serif`
3. `UI-E10: GamePanel template uses scene-entry (NOT ledger-spread) — single column flow, each message wrapped in <article class="scene-entry">`
4. `UI-E10: scene-entry has marginalia header (date / section no / role stamp) + body with msg-item + text-wrapper`
5. `UI-E10: scene-entry text-wrapper preserves onTextWrapperClick binding (E9-FIX guard)`
6. `UI-E10: kao.css exposes .theme-kao .scene-entry / .scene-entry__marginalia / .scene-entry__axis-rule with token-only rules (no raw hex)`
7. `UI-E10: kao.css exposes .theme-kao .scene-stage__indicator (sticky top section indicator) with archive-paper bg`
8. `UI-E10: hard constraint — 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 new store mutation / 0 raw hex`

**保留** (E6A 既有 contract):
- `display-name` / `msg-time` / `msg-item__folio` sans 11px (UI-DETAIL1 §S-3 规则)
- `display: block` kicker 我·/旁白·/档案员· 14px LXGW weight 500
- `chat-container::before` 4px spine stitch (repeating-linear-gradient gold 24%)
- `msg-item` 3px role-color left bar + paper-strong backdrop (E6A 保留)
- 16px / 1.75 body text (E6A typography 保留, font 改 `--font-body`)
- 1 个 chapter-rule 删除 (E9 的), E6A 的 chapter-rule 保留 (功能独立, 但 E10 删除整个 concept — 改为 per-entry marginalia section number)
  - 实际决定: chapter-rule concept 在 E10 删除 (因为每条 entry 顶部 marginalia 已有 section number), E6A 的 chapter-rule contract 改成 "chapter-rule 已删" — 这条 contract 改为 lock "chapter-rule 在 GamePanel.vue 已不出现"

**gamePanelMechanism.test.js 0 改** — 验证仍能 click `.mechanism-trigger`.

### 5.3 test count 预期

- 删 8 (UI-E9 ledger-spread) + 1 (UI-E6A chapter-rule contract) = 9 删
- 改 1 (UI-E6A typography font)
- 加 8 (UI-E10 new) + 1 (E9-FIX guard) = 9 加
- 当前 uiPolish 168 → 168 - 9 + 1 + 9 = 169 tests
- gamePanelMechanism 1/1 保留

### 5.4 验证命令

```bash
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js
npm run build
git diff --check

# Forbidden patterns
git diff HEAD -- src/components/GamePanel.vue src/pages/Experience.vue \
                    src/styles/themes/kao.css src/__tests__/uiPolish.test.js \
  | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important|#[0-9a-fA-F]{3,8}\b"
# 期望: 0 真实命中 (test regex literal 内的除外)
```

---

## 6. 验收截图 (3 张必跑)

| 文件 | viewport | 内容 |
|---|---|---|
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-1280.png` | 1280×800 | kao mode, 12+ 条 messages 单列, sticky section indicator 顶部, font-body serif (Songti / Georgia fallback), role-color left bar 3px (E6A 保留), 无 ledger-spread 双页布局 |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-long-1280.png` | 1280×2200 | 滚动到 30+ 条 messages, 验证 single column 流 + section number 递增 + 共享 axis 贯穿 (record-folio / scene-stage / sidebar) |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-640.png` | 640×800 | mobile, sidebar 折叠到 record-folio 下, axis 缩到 14px, font 仍 readable |

**截图脚本** `/tmp/e10-screenshots.py` 跑完即 `rm -f` (per E9 §4.4).

**seed**: 5 user + 5 assistant messages + 1 system compression-complete, 用本地内存 gameStore. 不依赖 Pinax 实际 9D6A worldbook.

---

## 7. 风险和缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| E9 ledger-spread 删除破坏 8 个 uiPolish contract | L | 同 test 改动 (删 8 + 改 1) 跟 template 同步, 验证 168 - 9 + 9 = 168 pass |
| E9-FIX mechanism trigger 回归 (user 硬约束) | L | 保留 `<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">`; 加 1 条 E9-FIX guard contract |
| `--font-body` 字体在不同 OS 表现差异 | M | 接受: Mac 走 Songti SC, Linux 走 Source Han Serif CN / Noto Serif CJK SC, 都没装就回退到 serif. 截图时用 Mac/Songti 路径 |
| scene-entry 删 chapter-rule 破坏 E6A typography continuity | S | E6A typography 是字号 + 行高 + 颜色, 跟 chapter-rule 概念独立. chapter-rule 删除只影响 E9 的"每 spread 之前 ribbon", E6A typography 全部保留 |
| 共享 axis 在 mobile 折叠后错位 | M | @media (max-width: 760px) axis 缩到 14px + sidebar 折叠到 record-folio 下, axis 仍贯通 |
| `recordVolume` 概念从 spread-count 改成 message-count, E6A 其他 contract 可能引用 | M | E10 用 `recordVolume = Math.max(1, gameStore.sessions.length)` (per Experience.vue 原 350 行定义), 不再从 messageSpreads 派生. E6A 用 `recordVolume` 的 contract 不变 (仍是 total sessions count) |
| `recordVolume` in Experience.vue vs `recordVolume` in GamePanel.vue 名字冲突 | L | Experience.vue 的 `recordVolume` 早已定义 (350 行, sessions.length), GamePanel.vue 的 `recordVolume` 是 E9 加的 (从 spread.length 派生) — E10 删 GamePanel.vue 的 recordVolume (重写 template 后 spread 不存在), Experience.vue 的 recordVolume 保留 |
| StatusBar / QuestLog / GeographyPanel sub-component 在 ledger-spread 删除后样式错位 | M | 这些组件没用 ledger-spread, 只用 .msg-item / .text-main — 保留. 不改 |
| scoped CSS 1950+ 行超 tolerance (1080 → 1900) | L | E10 加 scene-entry 约 100 行, 删 ledger-spread 约 250 行, 净减 150 行. 预期 ≤ 1800 |
| uaRender / renderRPText 的 mechanismTrigger 注入路径变了 | L | E10 仍调 `renderRPText(msg.content, { mechanismTrigger, inlineEvents })` — 函数签名不变, rpTextRenderer 不动 |

---

## 8. ship commit 模板 (Codex 用, 不在本 worker scope)

```
style(experience): UI-E10 重做 Experience 阅读流 (字体 + 显示 + 衔接)

字体重置:
- kao.css: 新增 --font-body token (Songti SC / Source Han Serif / Noto Serif CJK SC / Iowan / Georgia / serif fallback)
- .theme-kao .text-main: var(--font-display) (LXGW) → var(--font-body)
- LXGW 仅保留给 chapter-title / kicker signature / marginalia / decoration
- 解决 "字体不行": 用户长篇阅读正文走清晰宋/serif, 装饰位仍 LXGW 手稿感

显示重置 (删 ledger-spread → scene-entry):
- GamePanel.vue: <article class="ledger-spread"> 整删, 改 <article class="scene-entry">
  - 删 page-header / spine / __sheets / ink-stamp / chapter-rule / continued-mark
  - 加 scene-entry__marginalia (date / section no / role stamp) + scene-entry__body (msg-item + text-wrapper)
  - 删 messageSpreads computed + LONG_ASSISTANT_CHARS + isStandaloneMessage + spreadHeaderDate + spreadHeaderStamp
  - 保留: .text-wrapper @click="onTextWrapperClick" (E9-FIX guard) + .msg-item role-color bar (E6A) + kicker 我·旁白·档案员 (E6A)
- kao.css: 删 .theme-kao .ledger-spread / .ledger-spread__* 系列 (~24 条规则)
- 加 .theme-kao .scene-entry / .scene-entry__marginalia / .scene-entry__body / .scene-entry__axis-rule (~12 条新规则)
- 解决 "显示奇怪 / 双页碎片": 单列可读场景记录流, 没有 sheet-spine 分割, 没有续 mark 干扰

菜单衔接 (Lusion section-to-section continuity):
- Experience.vue: 加 sticky .scene-stage__indicator 顶部条 (卷 X · 共 N 条 / 第 N 条)
- 三个区域 (record-folio / scene-stage / sidebar) 共享同 28px red margin rule 作 vertical axis
- 解决 "菜单切换和页面衔接不行": 同一根 vertical axis 贯穿三区域, sticky indicator 给 "我在哪里" 锚点

硬约束:
- 0 store / 0 service / 0 router / 0 server mutation
- 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex
- 0 WebGL / canvas / 3D scene (Lusion R2 §5 + R3 §5 #2 禁区)
- E9-FIX mechanism trigger click 保留 (text-wrapper @click="onTextWrapperClick")

Verification: 168 uiPolish - 9 删 + 1 改 + 9 加 = 169 uiPolish pass + 1 gamePanelMechanism pass + build clean + diff --check clean
Screenshots: experience-e10-{1280, long-1280, 640}.png 落档
```

---

## 9. Self-Implementation Order (worker follow)

1. **Read source**: src/pages/Experience.vue, src/components/GamePanel.vue, src/styles/themes/kao.css (already done in this plan)
2. **Update kao.css**:
   - 加 `--font-body` token (新增, 不覆盖)
   - 改 `.theme-kao .text-main { font-family: var(--font-body); }`
   - 删 `.theme-kao .ledger-spread / .ledger-spread__*` 24 条规则
   - 加 `.theme-kao .scene-entry / .scene-entry__marginalia / .scene-entry__body / .scene-entry__axis-rule` 12 条新规则
   - 加 `.theme-kao .scene-stage__indicator` sticky 顶部条样式
   - 加 `@media (max-width: 760px)` mobile 折叠 + axis 缩到 14px
3. **Update GamePanel.vue template**:
   - 删 `<template v-for="(spread, sIdx) in messageSpreads">`
   - 加 `<template v-for="(msg, index) in displayMessages">`
   - 删 ledger-spread / sheets / spine / page-header / ink-stamp DOM
   - 加 scene-entry / marginalia / body / msg-item DOM
   - **保留**: `<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">`
4. **Update GamePanel.vue script**:
   - 删 messageSpreads computed (240 行)
   - 删 LONG_ASSISTANT_CHARS 常量
   - 删 isStandaloneMessage + recordVolume + spreadHeaderDate + spreadHeaderStamp
   - 加 `displayMessages = computed(() => gameStore.messages || [])`
   - 加 `formatDate(ts)` (从 spreadHeaderDate 提取)
   - 加 `roleStamp(role)` (从 spreadHeaderStamp 提取)
   - **保留**: onTextWrapperClick 函数体 (E9-FIX mechanism detection)
   - **保留**: renderMessageContent / displayName / formatTime / isCompressionCompleteMessage
5. **Update GamePanel.vue scoped CSS**:
   - 删 `.ledger-spread / .ledger-spread__*` ~24 条规则
   - 加 `.scene-entry / .scene-entry__*` ~6 条新规则 (margin / padding / border-left 3px role-color via E6A 保留)
6. **Update Experience.vue**:
   - 加 `<div class="scene-stage__indicator">` sticky 顶部条 (卷 X · 共 N 条 / 第 N 条)
   - 加 `.record-folio__axis-marker` (序号 "I / II / III")
   - 加 `.sidebar__axis-marker` (序号 "卷宗 I / II / III")
   - 0 改 record-folio / sidebar / InputArea 子组件
7. **Update uiPolish.test.js**:
   - 删 UI-E9 8 contracts (regex 不再匹配 ledger-spread)
   - 改 1 条 E6A typography font contract
   - 加 UI-E10 8 contracts (font-body / scene-entry / axis / indicator / E9-FIX guard / hard constraint)
   - 0 改 gamePanelMechanism.test.js
8. **Run tests**: 169 uiPolish + 1 gamePanelMechanism pass expected
9. **Generate screenshots**: 3 张 (1280 / long-1280 / 640) via /tmp/e10-screenshots.py
10. **Write report**: docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.report.md

---

## 10. Self-check (per AGENTS.md ui-style-check + commit-conventions)

| Check | Expected |
|---|---|
| Read 2-3 sibling components in same module | ✓ (read Experience.vue + GamePanel.vue + kao.css 全) |
| Reuse primitives | ✓ (复用 .msg-item / .text-wrapper / .text-main / .kicker / .display-name / .msg-time — E6A 既有) |
| Dark-mode tokens | ✓ (`.theme-kao.theme-dark` 既有, E10 不改) |
| Responsive breakpoints match | ✓ (980px → 760px 跟 N9 / W9 / Notes 一致; 640px 移动断点跟 E9 一致) |
| UI-facing test | ✓ (169 uiPolish + 1 gamePanelMechanism) |
| 4 positioning questions (narrative / distance / temp / capacity) | ✓ (workbench / laptop / quiet-editorial / 30+ entries fit single column) |
| Anti-cliche (8 failure patterns) | ✓ (0 SaaS gradient / 0 emoji icon / 0 fake silhouette / 0 generic font as design system — 都遵守) |
| 5-dimension critique | ✓ (philosophy 守住 Pinax archive-folio / hierarchy chapter→body→meta 显式 / craft 严格 token / functionality 保留 mechanism trigger / originality scene-entry 是 Pinax 自己的非 Lusion 视觉) |
| forbidden patterns: 0 :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex | ✓ |
| Co-Authored-By footer | (无 commit, 本 worker 不涉及) |
| 1 commit per feature | ✓ (E10 = 1 commit, scope 完整) |

---

## 11. 等 Codex 拍板 (open questions)

1. **Plan 接受?** (推荐 yes — 用户原话"重做 Experience"明确, E10 是具体化)
2. **`--font-body` 系统 serif fallback 接受?** (推荐 yes — 满足用户"清晰宋/serif"诉求; mac/linux/win 三平台都有合理 fallback)
3. **删 ledger-spread 接受?** (推荐 yes — 用户原话"显示奇怪 / 双页碎片排版"明确指向 E9 ledger-spread 是问题)
4. **共享 vertical axis 用简化版** (每个区域内部独立画 28px axis, 不跨区域统一) 接受? (推荐 yes — 简化版本先 ship, v2 再统一; 风险小)
5. **sticky section indicator 用简化版** (显示 "卷 X · 共 N 条", 不动态追踪 current entry) 接受? (推荐 yes — 后续加 scroll listener)
6. **test count 168 → 169 expected** (删 9 + 改 1 + 加 9 = 169) 接受? (推荐 yes — UI-E9 contract 删除是必要的, 新 contract 覆盖 E10)
7. **E9-FIX mechanism trigger 保留** (text-wrapper @click="onTextWrapperClick") 接受? (推荐 yes — 硬约束)
8. **截图脚本 `/tmp/e10-screenshots.py` 不 ship 到 repo** 接受? (推荐 yes — per E9 §4.4)

---

**END OF UI-E10 PLAN** — 等 Codex 拍板 8 个 open questions, 然后实施.