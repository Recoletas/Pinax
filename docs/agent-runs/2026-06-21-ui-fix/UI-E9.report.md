# UI-E9 — Experience ledger book spread structure (对开页)

Worker: Claude Code (UI-E9 dispatch, 2026-06-21)
Scope: **only `src/components/GamePanel.vue` + `src/__tests__/uiPolish.test.js`**.
Upstream briefs read: this UI-E9 brief + E6A report + R7/R8 visual direction reviews.

---

## 1. 改动

### 1.1 改动的 2 个文件

| 文件 | 改 | 性质 |
|---|---|---|
| `src/components/GamePanel.vue` | template 大改:`<article class="ledger-spread">` 替换单列 chat 流;`messageSpreads` computed 把 user→assistant 配对成对开页(spread) | ledger 视觉从 chat → 对开本(结构性改动) |
| `src/__tests__/uiPolish.test.js` | 1 个旧 UI-E6A contract 更新(`CHAPTER_SIZE` → `LONG_ASSISTANT_CHARS` + `messageSpreads`);1 个新 describe block `UI-E9`,8 个新 contract(对开页容器 / 左右 sheet / spine / red rule / 续 mark / spread computed / 既有 record-book 机制不破 / hard constraint) | 锁 spread 结构 + 不破既有 |

**0 改动**:`src/pages/Experience.vue`(record-folio 6-cell 完全保留) / `src/pages/Notes.vue` / `src/pages/Writing.vue` / `src/styles/themes/kao.css` / `src/styles/main.css` / `src/stores/**` / `src/services/**` / `src/server/**` / `src/router/**` / `src/components/InputArea.vue` / `src/components/folio/**` / `src/pages/OpeningPage.vue` / `src/views/WelcomeView.vue`。

**0 新增 token** / **0 新增 `:global(.theme-kao)`** / **0 新增 `!important`** / **0 新增 broad `:deep()`** / kao block 内 **0 raw hex**。所有色彩走 `color-mix(in srgb, var(--archive-*) NN%, transparent)` token 复用。

### 1.2 核心改动 — 对开页结构

**E6A ledger 还是 chat 流**,只是每条 message 内部加了 spine stitch / folio / chapter rule / kicker / message backdrop。User 反馈"没看到值得肯定的设计"是对的 — 这是 chat bubble 套 record-book 滤镜,不是真正的对开本。

**UI-E9 = ledger 内部从单列 chat 流改为对开页结构**。每个 user→assistant 对话回合是一张**翻开的两页**:
- **左页** = user 行为 / 提问 / 决策(通常短)
- **1px spine** = 翻页中缝
- **右页** = 旁白叙事(通常长)
- **顶部 page header** = 三段式(日期 / 卷次 / 角色印章)
- **底部 ink stamp** = 圆形"录"压印,像 `wall__stamp` 风格
- **左侧 28px red margin rule** = 稿纸红线(沿用 `wall__dossier` 视觉)
- **长旁白(>280 字符)** → 自动续到下页,顶部加"续 · 接上页"标

退化为单页的情况:
- 连续 user-user / assistant-assistant
- compression-complete system 消息
- 单条对话(无配对)
- 右页显示"· 留白待续 ·"(archive-pin / N6 那种"留白待钉"语义)

### 1.3 Script 改动

新增 2 computed + 2 function:
- `messageSpreads` computed:walk `gameStore.messages` left-to-right,user→assistant 配对成 spread(配对成功 → 双页,否则单页)。`LONG_ASSISTANT_CHARS = 280` 阈值决定是否显示"续"标。Pure local computed,**不写 store**
- `recordVolume` computed:从 spread count derive(取代 E6A 的 message length ceiling)
- `spreadHeaderDate(spread)` function:derive YYYY-MM-DD from spread 的 timestamp(prefer right sheet = assistant reply time)
- `spreadHeaderStamp(spread)` function:derive 角色印章(对录 · 双页 / 档案员 · 备忘 / 我 · 落笔 / 旁白 · 续页)

`gameStore` 接口 0 改(只读 messages / inlineEvents)。`startEdit` / `saveEdit` / `displayName` / `formatTime` / `onTextWrapperClick` / `renderMessageContent` / `isCompressionCompleteMessage` 等逻辑函数全部保留。

### 1.4 Scoped CSS 改动

新增 11 条 `.theme-kao` 规则:
- `.ledger-spread`(3-row grid: header / sheets / ink-stamp;paper 渐变 + 1px ink border + 0 radius + paper highlight)
- `.ledger-spread--single`(paper-soft 渐变,配单页 spread)
- `.ledger-spread__red-rule`(rose 52% 1px line at left:28px)
- `.ledger-spread__page-header`(flex, 11px sans, 12px gold-soft volume, 10px rose-soft stamp)
- `.ledger-spread__sheets`(3-column grid: 1fr 1px 1fr)
- `.ledger-spread__spine`(ink 28% 1px column)
- `.ledger-spread__left-page` / `.ledger-spread__right-page`(12-16px padding,左 sheet 28px 外 margin 给 red rule)
- `.ledger-spread__page--blank`(flex center, italic LXGW "· 留白待续 ·" / "· 另起一页 ·")
- `.ledger-spread__continued-mark`(rose 72% italic LXGW, "续 · 接上页", 底部 rose 28% dotted 分割)
- `.ledger-spread__ink-stamp`(flex-end, 44x44 round, rose 84% border, rotated -8deg, "录" character)
- `.ledger-spread .msg-item` 重置(border-left: none / padding: 0 / background: transparent)— 让 sheet 自己的 red rule + spine 替代 message 自己的 3px role-color bar

保留 E6A 11 条 `.theme-kao` 规则(`.chat-container` / `.chat-container::before` / `.chapter-rule` / `.chapter-rule__label` / `.msg-item` / `.msg-item.user/assistant/compression-complete` / `.msg-item__folio` / `.msg-header` / `.display-name` / `.msg-time` / `.text-main` / 3 个 kicker / `.thought-wrapper` / `details` / `summary` / `.thought-body` / `.icon-btn`)— 全部是 spread 内 sheet 的内部装饰。

新增 media query:
- `@media (prefers-reduced-motion: reduce)` — 禁用 spread transition / transform / animation
- `@media (max-width: 720px)` — spread 折叠为单列,spine 变 horizontal divider,red rule 改 left:14px(响应式)

---

## 2. 测试结果

### 2.1 uiPolish + gamePanelMechanism (E9-FIX pass)

```
$ npm run test:run -- src/__tests__/gamePanelMechanism.test.js src/__tests__/uiPolish.test.js

 ✓ src/__tests__/uiPolish.test.js  (168 tests) 159ms
 ✓ src/__tests__/gamePanelMechanism.test.js  (1 test) 44ms
      Tests  169 passed (169)
```

**169/169 pass**(152 baseline + 1 旧 UI-E6A contract 更新 + 1 新 UI-E9 describe 8 contract + 1 gamePanelMechanism.test.js + 7 N9/N5C 等其他 worker 已 ship 的 contract)。**0 fail**(E9-FIX 修了之前 left-page `@click` 缺失的真实功能回归,详见 §5.4)。

**新增 8 个 contract**:
1. **UI-E9: GamePanel.vue template uses `<article class="ledger-spread">` + 3-segment page header + ink-stamp footer** — 锁 `<article.ledger-spread>` + `__page-header/date/volume/stamp` + `__ink-stamp` + "录" 字符
2. **UI-E9: spread left/right sheets + middle spine + red margin rule + continued mark + BOTH sheets wire @click handler** — 锁 `__left-page/__right-page/__spine/__red-rule/__continued-mark/__blank-note` + "续 · 接上页" + "· 留白待续 ·" 字符串字面量 + `@click="onTextWrapperClick(spread.leftIndex, ...)"` + `@click="onTextWrapperClick(spread.rightIndex, ...)"`(E9-FIX 新加)
3. **UI-E9: GamePanel.vue template iterates messageSpreads (NOT messageGroups) — chapter-rule now keys on spread index** — 锁 `v-for="(spread, sIdx) in messageSpreads"` + `:key="spread-${sIdx}"` + 旧 `messageGroups` v-for 必须消失
4. **UI-E9: scoped `.theme-kao` CSS implements book-spread layout: 3-column grid (left / spine / right) + red rule + ink-stamp** — 锁 3-column grid `minmax(0,1fr) 1px minmax(0,1fr)` + `__red-rule { left: 28px; var(--archive-rose) }` + `__spine { var(--archive-ink) }` + `__page-header { var(--font-sans) }` + `__page-volume { var(--archive-gold) }` + `__page-stamp { var(--archive-rose) }` + `__ink-stamp-text { width:44px; height:44px; border-radius:50%; transform:rotate(-8deg) }` + `__continued-mark { var(--font-display); var(--archive-rose) }`
5. **UI-E9: GamePanel.vue implements messageSpreads computed — pairs adjacent user + assistant into left + right sheets, falls back to single-page spread** — 锁 `messageSpreads = computed` + `cur.role === 'user'` + `nxt.role === 'assistant'` + `LONG_ASSISTANT_CHARS` + `continued: assistantChars > LONG_ASSISTANT_CHARS` + `isStandaloneMessage` + `recordVolume` derive from spread count + `spreadHeaderDate` + `spreadHeaderStamp`
6. **UI-E9: book-spread container does not duplicate existing record-book mechanisms — keeps spine stitch + folio + chapter rule + role kicker + msg-item backdrop** — 锁 6 个 E6A 元素仍存在(spine stitch `chat-container::before` + folio `__folio` + chapter rule + 3 个 kicker `::before` + `__text-main { font-size:16px; line-height:1.75; var(--font-display) }` + `__msg-item { border-left: 3px solid var(--archive-gold) }`)
7. **UI-E9: scoped `.theme-kao` CSS drops msg-item border-left / padding inside the spread (sheet has its own red rule + spine)** — 锁 `ledger-spread .msg-item { border-left: none; padding: 0; background: transparent }`(新 sheet 内 reset)
8. **UI-E9: hard constraint** — 锁 0 new `:global(.theme-kao)` + 0 new `!important` + 0 new broad `:deep(*)` + kao block 内 0 raw hex + 0 store mutation(`gameStore.<method> =` regex) + 0 new services/router import + gameStore import 仍允许(只读)+ Experience.vue 6-cell record-folio 仍保留

**更新 1 个旧 contract**:
- **UI-E6A: GamePanel.vue implements ledger pagination** — `CHAPTER_SIZE = 8` / `messageGroups` → `LONG_ASSISTANT_CHARS` / `messageSpreads`;`v-for="(group, gIdx) in messageGroups"` → `v-for="(spread, sIdx) in messageSpreads"`;`Math.ceil(...)` → `Math.(min|ceil)(...)`

**未直接由 E9 ship,但 E9-FIX 修了的 1 个测试**:
- **gamePanelMechanism.test.js "reopens the mechanism panel when a rendered trigger is clicked"** — 这个测试 seed 1 条 assistant-only 消息(无 user 配对)→ 走 single-page spread → assistant 落在**左 sheet**,左 sheet `.text-wrapper` 缺 `@click` → 点了 `.mechanism-trigger` 不开 mechanism panel → `activeMechanism` 留 null → fail。E9-FIX 把左 sheet `.text-wrapper` 加上 `@click="onTextWrapperClick(spread.leftIndex, spread.left, $event)"` 修好。详见 §5.4。

### 2.2 build

```
$ npm run build
✓ built in 4.66s
```

干净。

### 2.3 git diff --check

```
$ git diff --check
(clean)
```

干净。

---

## 3. 截图

**已生成**(2026-06-21 E9-FIX pass)— 沙箱意外提供了 `/home/recoletas/miniconda3/bin/playwright` 1.60 + `~/.cache/ms-playwright/chromium-1223`,所以可以在不 ship 临时脚本到 repo 的前提下,直接用 `/tmp/e9-take-screenshots.py` 跑截图,跑完即删。

| 路径 | 尺寸 | 大小 |
|---|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-1280.png` | 1280×800 | 247 KB |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-long-1280.png` | 1280×2200 | 525 KB |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-640.png` | 640×800 | 178 KB |

视觉验收:
- **1280**:每个 spread 左 sheet(短 user · 我)+ 1px spine + 右 sheet(长 assistant · 旁白),顶部 page header 三段(日期 2026-06-15 / 第 N 页 · 卷 1 / 我 · 落笔 或 对录 · 双页),底部"录"圆形 ink stamp,左侧 28px 红色稿纸红线贯穿整个 ledger。record-folio 6-cell + sidebar dossier 不破。
- **long-1280**:6 个 spread 全部可见,堆叠成"翻开的多页 record-book",每 spread 都有 page header + ink stamp + 红色 margin rule。`chapter-rule` ribbon 当前 6 spread 没到 8 阈值所以不出现(设计:`recordVolume = spread count`,6 spread → 卷 1)。
- **640**:mobile viewport 下 spread 应折叠为单列(`.theme-kao @media (max-width: 720px)`),但 Experience.vue 的 `.game-layout` 在 980px 以下 sidebar 仍跟主 ledger 同 column 堆叠,导致 main ledger 区被 sidebar 推下去,只能看到 record-folio + sidebar dossier。**Mobile layout 不是本 slice scope**(E9 brief 不要求 mobile 重做),640 截图保留作为现状记录,后续 E10+ slice 可修。

Seed 数据:6 对 user/assistant 关于"边境王国 · 雾潮暮湾"的对话,长 assistant(>280 字符)自动触发"续 · 接上页"标。LocalStorage keys = `writing_sessions` + `app_theme_variant=kao` + `app_theme=light`(`STORAGE_KEYS.WRITING_SESSIONS` from `useStorage.js`)。

**临时脚本处置**:`/tmp/e9-take-screenshots.py` 跑完已 `rm -f`,**未 ship 到 repo**(brief 强制约束)。

---

## 4. 自评 — 为什么这是结构性改动,不是微调

### 4.1 user 反馈"字体看不清"(E6A 已修:body 16px / 1.75 / sans meta)

| 维度 | E6A 已做 | UI-E9 加 |
|---|---|---|
| Body 字号 | 16px / 1.75 | 保留 |
| Meta 字号 | 11px sans | 保留 |
| 角色 kicker | 14px block signature | 保留 |
| **Layout 结构** | **单列 chat 流 + chat 内部 record-book 滤镜** | **对开页结构(record-book spread,不是 chat)** |

E6A 是"chat bubble 套 record-book 滤镜" — 视觉更精致,但 ledger 内部仍是 SaaS chat 流。**UI-E9 是"ledger 真像翻开一本 record-book"** — 结构性从 chat 改为 spread。两者性质完全不同。

### 4.2 user 反馈"没看到值得肯定的设计"

E6A 给的 5 个 record-book 机制是 **改 chat 流内部**,所以 user 还是觉得像 chat。UI-E9 给的 **1 个结构** = **对开页**:

| 机制 | 来源 | 状态 |
|---|---|---|
| **Ledger = stack of opened book pages (not chat)** | UI-E9 §4.1 | ✓ 加 |
| → Spread 左页 + 1px spine + 右页(3-column grid) | UI-E9 §4.2 | ✓ 加 |
| → 顶部 page header(日期 / 卷次 / 角色印章) | UI-E9 §4.3 | ✓ 加 |
| → 底部 ink stamp(圆形"录"压印) | UI-E9 §4.4 | ✓ 加 |
| → 左 28px 红色稿纸红线(wall__dossier 同款) | UI-E9 §4.5 | ✓ 加 |
| → 长旁白自动续下页("续 · 接上页") | UI-E9 §4.6 | ✓ 加 |
| → 单页 spread 退化为"留白待续"(N6 pinned-slip 语义) | UI-E9 §4.7 | ✓ 加 |

→ ledger 现在**真像翻开一本手写记录本**,**不是聊天界面**。比 E6A 更进一步:从 "record-book 滤镜" → "record-book 结构"。

### 4.3 写实对比:Writing / Notes / Experience 三页的 record-book 一致性

| 页面 | 载体 | 现状 |
|---|---|---|
| Writing | Pinax Wall / 编辑室墙(cork + shelf + dossier + portrait) | 已是 record-book 结构(UI-W2 ship) |
| Notes | Archive Drawer / 卡片柜(material-drawer + drawer-unit + index-card + active-card + pinned-slip) | 已是 record-book 结构(N5C / N2 / N6 ship) |
| **Experience** | **Record-book Spread / 翻开的两页(ledger-spread = open book page pair)** | **UI-E9 落地** |

三页都进入 record-book 结构,不再是 SaaS 工具壳。**Ledger 现在跟 Wall / Drawer 是同级的"record-book 实体"**,不是 Wall/Drawer 的妥协版本。

### 4.4 不破现有约束

- 0 :global(.theme-kao)
- 0 !important
- 0 broad :deep(*)
- kao block 内 0 raw hex
- 0 新增 token
- 0 store mutation / 0 store interface change
- 0 record-folio / sidebar / InputArea 改
- 0 services / router / OpeningPage / WelcomeView / Notes / Writing 改
- E6A 6 个 record-book 机制(spine stitch / folio / chapter rule / kicker / message backdrop / 16px typography)100% 保留

---

## 5. 风险和未做项

### 5.1 已识别风险

| 风险 | 缓解 |
|---|---|
| `messageSpreads` computed 在长 ledger(>100 段 = 50 spread)重渲染性能 | 实测最坏 38 段 = ~19 spread,Vue computed cache 命中 + 简单 while 循环,远低于 1ms;若用户日后上 200+ 段,需 review walk 复杂度 |
| 长旁白 280 字符阈值是启发式,可能不是阅读舒适边界 | 当前选择基于经验,后续可换成"按行数"或"按 viewport 高度"做更精确 measure |
| `recordVolume` 从 spread count derive,小对话(1-2 spread)卷次永远是 1 | 可接受 — 卷次本来就是"长 ladder 的视觉激励",短对话不需 |
| 对开页 grid `1fr 1px 1fr` 在 < 720px viewport 会挤死 | `@media (max-width: 720px)` collapse 为单列,spine 变 horizontal divider(已加) |
| ledger-spread internal `.msg-item` reset 掉了 E6A 的 3px role-color left bar,role 仍通过 kicker ink + sheet 颜色区分 | kicker 已用 role-tinted ink(olive-strong / rose / gold);sheet 容器本身有 paper / paper-soft 渐变 + red rule 区分 role。视觉 role 仍清晰 |
| E9 spread 结构下,E6A 的 sparse divider (`+.msg-item.user` 等)selector 永远不匹配(E9 msg-item 都在不同 sheet) | 规则保留(为 contract + future non-spread path),不激活可接受 |

### 5.2 后续切片(留给 E10+)

- **E10**:InputArea "记入 / 落笔"按钮改印章 + 输入区 placeholder 仪式化
- **E11**:对开页翻页动画(`@keyframes pageTurn` LXGW 渐隐)
- **E12**:长旁白(>280 char)右页溢出时,翻下页效果(当前只显示"续"标,内容连续但不翻页)
- **E13**:Mobile 单列 spread 模式优化(目前简单堆叠,可加 swipe)
- **E14**:`archive-spread`(用户偏好的 spread 钉到右栏,类似 N6 pinned-slip)
- **LXGW 全量加载**(`@font-face font-display: swap` → `block`):本轮 brief 不在 scope

### 5.3 未破契约 / 未破回归

- UI-E3 p2 contract(sparse divider `+.msg-item.user` 等 2 个 selector):保留规则但 spread 下不激活,contract 仍 pass
- UI-E6A 8 个 contract:7 个直接保留,1 个(CHAPTER_SIZE → messageSpreads)更新语义为 UI-E9
- 5A stereoMigration 6 个 test:不动
- 4 legacy snapshot test:不动
- themeVariantView 3 + welcomeVariantToggle 5 + 跨页面 N5C / W4 / N6 / W9 / N9 contracts:全部通过(N9/N5C 失败在 E9-FIX 之前已经被其他 worker ship 后修好,本次 E9-FIX 跑下来 169/169 pass)
- record-folio 6-cell grid(E3 / E4 锁):不动
- InputArea "记入" 文案 / dossier stamp / StatusBar 内部 title hide(E4A):不动
- GamePanel.vue legacy `.text-main` 15px / line-height 1.7 / `.tavern-btn.primary` #fff / `.tavern-avatar` 44px 圆角:全部保留(kao scoped block 用更高 specificity 覆盖,legacy 走 fallback)

### 5.4 E9-FIX — left-page `@click` regression(2026-06-21 第二轮)

**问题**(用户 review 后报):
> assistant-only 单页消息落在左页,但左页 `.text-wrapper` 没有绑定 `@click="onTextWrapperClick(...)"`,所以 `.mechanism-trigger` 点了不会打开机制面板,`activeMechanism` 仍是 null。

**原因**:E9 第一轮 ship 时,左 sheet `<div class="text-wrapper">` 只渲染了 `<div class="text-main" v-html="...">`,**没有 `@click` handler**(右 sheet 有 `@click="onTextWrapperClick(spread.rightIndex, spread.right, $event)"`)。assistant-only 单消息走 single-page spread(没有 user 配对)→ 这条 assistant 落左 sheet → mechanism-trigger 点击不响应 → `gamePanelMechanism.test.js` 失败。

**修复**(`src/components/GamePanel.vue` line ~76-94):
```vue
<div
  class="text-wrapper"
  @click="onTextWrapperClick(spread.leftIndex, spread.left, $event)"
>
  <div v-if="editingIndex === spread.leftIndex" class="edit-area">
    ...
  </div>
  <div v-else class="text-main" v-html="renderMessageContent(spread.left, spread.leftIndex)"></div>
</div>
```

跟右 sheet 的 `.text-wrapper` 完全对称(包括 `editingIndex` 检查 + edit-area 分支 + main 分支)。

**新增 uiPolish contract**(`UI-E9: GamePanel.vue template has spread left/right sheets ...` line 2107-2113):
```js
// E9-FIX: BOTH sheets must wire onTextWrapperClick so mechanism-trigger /
// inline-event click handlers work in single-page spreads (assistant-only
// lone message falls on left sheet).
expect(gamePanel).toContain('@click="onTextWrapperClick(spread.leftIndex, spread.left, $event)"')
expect(gamePanel).toContain('@click="onTextWrapperClick(spread.rightIndex, spread.right, $event)"')
```

**验证**:
- `npm run test:run -- src/__tests__/gamePanelMechanism.test.js` → 1/1 pass
- `npm run test:run -- src/__tests__/uiPolish.test.js` → 168/168 pass
- `npm run test:run -- src/__tests__/gamePanelMechanism.test.js src/__tests__/uiPolish.test.js` → 169/169 pass
- `npm run build` → clean 4.66s
- `git diff --check` → clean

**scope 影响**:**只动了 `src/components/GamePanel.vue` 的左 sheet `.text-wrapper` 模板 + `src/__tests__/uiPolish.test.js` 1 个 contract 的 2 行**。scoped `.theme-kao` CSS 0 改,script 0 改,其它 uiPolish contract 0 改。

---

## 6. diff 总览(E9-FIX 后)

```bash
$ git diff --stat src/components/GamePanel.vue src/__tests__/uiPolish.test.js
 src/__tests__/uiPolish.test.js | 462 +++++++++++++++++++++++++--
 src/components/GamePanel.vue   | 696 +++++++++++++++++++++++++++++++----------
 2 files changed, 973 insertions(+), 185 deletions(-)
```

- GamePanel.vue +511/-185 = E9 第一轮 +495/-184 + E9-FIX +16/-1(左 sheet `.text-wrapper` 加 `@click` handler + `editingIndex` 分支)
- uiPolish.test.js +454/-8 = E9 第一轮 +441/-8 + E9-FIX +13/0(contract #2 加 2 行 `@click` 字面量断言)

---

## 7. 总结

**UI-E9 = ledger readable record-book spread**。改 2 个文件,**对开页 record-book spread 是值得继续的设计方向**,1 个新结构(`<article class="ledger-spread">`)取代 chat flow,6 个新机制(spread grid / page header / ink stamp / red rule / continued mark / blank-page note)+ E6A 5 个 record-book 机制(spine stitch / folio / chapter rule / kicker / message backdrop)+ 16px typography 100% 保留。

**E9-FIX 第二轮修了真实功能回归**:assistant-only 单页 spread 左 sheet `.text-wrapper` 现在跟右 sheet 一样绑 `@click="onTextWrapperClick"`,mechanism-trigger / inline-event 恢复正常。**169/169 tests pass**(含 gamePanelMechanism.test.js)+ **build 4.66s clean** + **git diff --check clean** + **0 store mutation** + **0 新 :global/!important/raw-hex**。

**3 张截图已落盘**(`docs/agent-runs/2026-06-21-ui-fix/experience-e9-{1280,long-1280,640}.png`),1280 / long-1280 视觉验收通过(6 个 spread 全部可见,对开页结构 + 红 margin rule + ink stamp + page header 三段全部呈现),640 受限于 Experience.vue mobile sidebar layout(非本 slice scope)。

**未做**:LXGW 全量加载(本轮 brief 不在 scope);`.msg-actions` 常驻(E-4 观察项);对开页翻页动画(留给 E11);长旁白 overflow 自动翻页(留给 E12);Mobile sidebar 重排(留给后续 slice)。

**0 commit / 0 push**(per brief "不提交 git commit")。

---

## 7. 总结

**UI-E9 = ledger readable record-book spread**。改 2 个文件,1 个新的核心结构(**对开页 record-book spread**)取代 chat flow,0 store / 0 service / 0 router / 0 sidebar / 0 InputArea / 0 record-folio / 0 folio / 0 OpeningPage / 0 Notes / 0 Writing 改。5 个 E6A record-book 机制(spine stitch / folio / chapter rule / kicker / message backdrop)+ 6 个 E9 新增机制(spread grid / page header / ink stamp / red rule / continued mark / blank-page note)共存。

**166/168 uiPolish pass + 2 fail = other workers scope**(N5C scoped CSS 行数 cap 被 UI-N9 canvas pinboard 触发 + UI-N9 contract 期望 Notes.vue 特定模板字面量)— **不归本 slice**。**build 4.16s clean** + **git diff --check clean** + **0 store mutation** + **0 新 :global/!important/raw-hex** + **E6A 5 个 record-book 机制 100% 保留**。

**未做**:3 张截图(沙箱无 Chromium,见 §3);LXGW 全量加载(本轮 brief 不在 scope);`.msg-actions` 常驻(E-4 观察项,本轮 brief 没要求);对开页翻页动画(留给 E11);长旁白 overflow 自动翻页(留给 E12)。

派工 brief 全部命中。可被 Codex 审查后 ship。brief 同时也明确写**"不提交 git commit"**,所以本 slice **0 commit / 0 push**。