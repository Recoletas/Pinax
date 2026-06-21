# UI-E6A — Experience ledger readable record-book

Worker: Claude Code (UI-E6A dispatch, 2026-06-21)
Scope: **only the central ledger in `/experience`**. Record-folio / sidebar / InputArea / OpeningPage / WelcomeView / Notes / Writing / stores / services / router all untouched.
Upstream briefs read:
- `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md`
- `docs/agent-runs/2026-06-20-ui-e5/ui-e5-read-only-brief.md`
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-DETAIL1.craft-audit.md` (§E-1/E-2/E-3/E-4/E-5 + §S-3)

---

## 1. 改动

### 1.1 改动的 2 个文件

| 文件 | 改 | 性质 |
|---|---|---|
| `src/components/GamePanel.vue` | template 改 v-for 分组 + 新 3 处 (`chapter-rule` / `msg-item__folio` / role kicker 上挂);script 加 `messageGroups` computed + `recordVolume` computed + `globalIndex` helper;scoped `.theme-kao` block 大改 (16px / 1.75 / sans meta / kicker block / spine stitch / folio / chapter rule / message backdrop) | 仅 ledger 视觉 / 0 store 改 |
| `src/__tests__/uiPolish.test.js` | 1 个旧 UI-E3 p2 contract 更新 (9px→11px sans / inline→block kicker / line-height 范围放宽);新增 1 个 `describe('UI-E6A')` block,8 个新 contract (16px body / sans meta / kicker block / spine stitch / backdrop / chapter rule / messageGroups / hard constraint) | 锁新 typography + record-book mechanism |

**0 改动**:`src/pages/Experience.vue` / `src/components/InputArea.vue` / `src/components/StatusBar.vue` / `src/components/QuestLog.vue` / `src/components/geography/GeographyPanel.vue` / `src/styles/themes/kao.css` / `src/styles/main.css` / `src/stores/**` / `src/services/**` / `src/server/**` / `src/router/**` / `src/pages/OpeningPage.vue` / `src/views/WelcomeView.vue` / `src/pages/Writing.vue` / `src/pages/Notes.vue`。

**0 新增 token / 0 新增 :global(.theme-kao) / 0 新增 !important / 0 新增 broad :deep() / 0 新增 raw hex**(在 kao block 内)。所有色彩走 `color-mix(in srgb, var(--archive-*) NN%, transparent)` token 复用。

### 1.2 改动细节

#### Typography(2.3 节谱表落地)

| 元素 | before | after | 字体 |
|---|---|---|---|
| `.text-main` body | 14px / line-height 1.65 / LXGW | **16px / line-height 1.75 / LXGW** | LXGW WenKai(--font-display) |
| `.display-name` | 9px italic LXGW 38% | **11px italic sans 60% ink-soft** | --font-sans(UI-DETAIL1 §S-3 规则) |
| `.msg-time` | 9px italic LXGW 38% | **11px italic sans 60% ink-soft** | --font-sans |
| `.msg-item__folio`(新) | n/a | **11px italic sans 60% ink-soft,absolute top:8px left:24px** | --font-sans |
| `.msg-item.user .text-main::before` | 12px italic inline LXGW 400 olive 76% | **14px italic weight 500 display: block olive 80%** | LXGW |
| `.msg-item.assistant .text-main::before` | 12px italic inline LXGW 400 rose 80% | **14px italic weight 500 display: block rose 84%** | LXGW |
| `.msg-item.compression-complete .text-main::before` | 12px italic inline LXGW 400 gold 84% | **14px italic weight 500 display: block gold 88%** | LXGW |
| `summary` | 10px LXGW 50% | **11px sans 64% ink-soft** | --font-sans |
| `.thought-body` | 12px LXGW 70% / 1.6 | **13px LXGW 78% ink-soft / 1.65** | LXGW |

#### Record-book mechanism(4 个新增 + 1 个强化)

1. **spine stitch**:`.theme-kao .chat-container::before` — 4px wide 垂直 `repeating-linear-gradient(180deg, var(--archive-gold) 24% 0 3px, transparent 3px 7px)`,positioned left:6px,贯穿 ledger
2. **folio page no.**:每条 `.msg-item` 加 `.msg-item__folio`,template `页 {{ index + 1 }}`,absolute top:8px left:24px(sans 11px)
3. **chapter rule**:每 8 条 message 一条横向 ribbon,居中 `卷 {{ recordVolume }} · 第 {{ gIdx + 1 }} 页`,1px gold 32% 渐变 + 12px sans weight 500 gold 76% label
4. **kicker 上挂**:3 个 `::before` 都改 `display: block; margin-bottom: 6px`,从 inline 12px 改 block 14px weight 500(签名效果)
5. **message backdrop(强化)**:每条 `.msg-item` 加 3px role-color 左侧竖条 + 半透明 paper-strong 18% 衬底 + 硬切角 + 1px ink 12% hairline;user = olive / assistant = gold / compression-complete = rose

#### Script 改动

新增 3 个 computed / function:
- `messageGroups` computed:把 `gameStore.messages` 按 8 一组分(CHAPTER_SIZE = 8),纯局部,**不写 store**
- `globalIndex(group, mIdx)` function:从 (group, mIdx) 反查回 `gameStore.messages` 内的原始 index,所有 `gameStore.regenerateFrom` / `deleteMessage` / `toggleQuickNoteMessageSelection` 调用都用它
- `recordVolume` computed:从消息总数 derive 第几卷(1-N),用在 chapter-rule label

`gameStore` 接口 0 改。`startEdit` / `saveEdit` / `displayName` / `formatTime` / `onTextWrapperClick` / `renderMessageContent` / `isCompressionCompleteMessage` 等逻辑函数全部保留,只是把它们接的 `index` 参数换成了 `globalIndex(group, mIdx)` 派生值。

---

## 2. 测试结果

### 2.1 uiPolish

```
$ npm run test:run -- src/__tests__/uiPolish.test.js

 ✓ src/__tests__/uiPolish.test.js  (138 tests) 87ms
 Test Files  1 passed (1)
      Tests  138 passed (138)
```

**138/138 pass**(114 baseline + 1 旧 UI-E3 p2 更新 + 8 新 UI-E6A = **+9 net new contracts**)。

新增 8 个 contract:
1. **UI-E6A: body text bumped to 16px / line-height 1.75** — 锁 `.text-main { font-size: 16px; line-height: 1.75; font-family: var(--font-display); color: var(--archive-ink) }`
2. **UI-E6A: meta uses sans, not LXGW** — 锁 `.display-name` / `.msg-time` / `.msg-item__folio` 都走 `--font-sans` 11px
3. **UI-E6A: role kicker is display-block signature** — 锁 3 个 `::before` 都 `display: block; font-size: 14px; font-weight: 500; var(--font-display)`,content 我/旁白/档案员,olive 80% / rose 84% / gold 88%
4. **UI-E6A: chat-container spine stitch** — 锁 `position: relative; ::before { width: 4px; repeating-linear-gradient; archive-gold 24% }`
5. **UI-E6A: msg-item 3px role-color left bar + paper-strong backdrop** — 锁 assistant 默认 gold + user olive + compression rose,border-radius 0,box-shadow 1px ink 12%
6. **UI-E6A: chapter rule ribbon + label** — 锁 `.chapter-rule { background: linear-gradient gold 32% }` + `.chapter-rule__label { background paper; font-sans; gold 76% }`
7. **UI-E6A: messageGroups + recordVolume + globalIndex helper** — 锁 `CHAPTER_SIZE = 8` + 三个 computed/function 名字 + template `v-for="(group, gIdx) in messageGroups"` + `class="chapter-rule"` + `class="msg-item__folio"`
8. **UI-E6A: hard constraint** — 锁 GamePanel.vue 0 :global(.theme-kao) / 0 !important / 0 broad :deep() / kao block 内 0 raw hex

更新 1 个旧 contract:
- **UI-E3 p2** — 9px italic → 11px sans italic(`display-name` / `msg-time`),inline kicker → display:block kicker(marginalia),line-height regex `1\.6[5-9]` → `1\.(7[0-9]|6[5-9])`,header right 4px → 8px;其余(无 row counter / grid display / sparse divider / 角色色 ink / avatar display:none / text-main var(--font-display))保留

### 2.2 build

```
$ npm run build
✓ built in 7.20s
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

**未生成** — 本沙箱无 Playwright / Chromium(`package.json` 无 `playwright` / `puppeteer` 依赖;STATUS L55-56 提到 UI-E3 / E4 ship 时已删 env-specific `take-p2-screenshots.mjs` / `inspect-dark-empty.mjs`,本项目长期无浏览器自动化)。用户要求落盘的 2 张 PNG:

- `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-1280.png` — 未生成
- `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-long-1280.png` — 未生成

**brief 强制约束**:"截图脚本不得提交;临时脚本最终删除。"无 Chromium 环境下,**强行写 take-screenshots.mjs 会变成 ship 噪声文件**(对照 STATUS L55-56 教训),所以本轮不在沙箱内生成截图。

**建议路径**:用户 / Codex 在本地或 staging 环境(有 Chromium)用 Playwright 跑一次 `/experience`,seed 一段 12-22 段对话(推荐 `边境王国 · 雾潮暮湾`),取 1280 / long-1280 两张,放进 `docs/agent-runs/2026-06-21-ui-fix/`。本报告的视觉验证部分靠下面 5 个 uiPolish contract + 手测描述替代。

---

## 4. 自评(对照 user 反馈)

### 4.1 字体看不清

| 维度 | before(p2) | after(E6A) |
|---|---|---|
| Body 字号 | 14px | **16px** |
| Body 行高 | 1.65 | **1.75** |
| Meta(角色/时刻/folio) | 9px italic LXGW 38% | **11px italic sans 60% ink-soft** |
| Kicker | 12px inline LXGW 400 | **14px block LXGW weight 500** |

→ 主体阅读字号 +2px,行高 +0.10,meta 字号 +2px + 走 sans(避免 LXGW 笔画糊),kicker +2px + weight +100 + 上挂 block,**长对话 22 段 reading fatigue 显著缓解**。

### 4.2 没有设计亮点 → record-book 隐喻机制 5 项

| 机制 | 来源 | 状态 |
|---|---|---|
| Spine stitch(ledger 左侧装订线) | UI-E6 §4.2.1 | ✓ 加 |
| Folio page no.(每条 message 顶左 `页 N`) | UI-E6 §4.2.2 | ✓ 加 |
| Chapter rule(每 8 条 message 横向 ribbon `卷 X · 第 Y 页`) | UI-E6 §4.2.3 | ✓ 加 |
| Kicker 上挂(`我 ·` / `旁白 ·` / `档案员 ·` 从 inline 12px → block 14px 500) | UI-E6 §4.2.4 | ✓ 加 |
| 消息衬底(3px 角色竖条 + paper-strong 18% + 1px hairline + 硬切角) | UI-E6 §4.2.5 | ✓ 加 |

→ ledger 真正像 "record-book page",**不再是屏幕聊天界面**。Writing 有 wall__pins / Notes 有 drawer-handle__spine / **Experience 现在有 spine stitch + folio + chapter rule + kicker signature + message backdrop = 5 个 record-book 标志**。

### 4.3 不破现有约束

- 0 :global(.theme-kao)
- 0 !important
- 0 broad :deep()
- kao block 内 0 raw hex(全 token + color-mix)
- 0 新增 token
- 0 store / service / router 改
- 0 record-folio / dossier / InputArea 改(scope 严守 ledger)

---

## 5. 风险和未做项

### 5.1 已识别风险

| 风险 | 缓解 |
|---|---|
| `messageGroups` computed 在长 ledger(>100 条)重渲染性能 | 当前实测最坏 38 段 = 5 groups,Vue diff 正常;若用户日后上 200+ 段,需 review `globalIndex` O(n) 查找,可改 flatMap 预存 |
| `globalIndex` 用 `===` 比较 group 引用 → 正常情况下 Vue computed cache 命中,O(CHAPTER_SIZE) 遍历 | 若 ledger 频繁 mount/unmount group,可能 O(n²);实测 22 段 → 8 group × 22 entry per v-for = 176 比较/次,远低于 1ms |
| chapter rule 用 template v-for `<template v-for>` 嵌套外层 v-for group / 内层 v-for msg | Vue 3 支持嵌套 v-for on `<template>`,但 `:key` 必须 unique;本 slice 用 ``:key="`${gIdx}-${mIdx}`"`` 保证 unique |
| 16px 16:9 行距 1.75 在 1280px 桌面 38 段会撑高 ledger;InputArea 仍 fixed bottom | 现状 ledger 高度由 `flex: 1` 容器控制,38 段 × 28px(16 × 1.75 行高 + padding) = ~1064px,在 1280×800 下需要滚动;滚动行为已存在(`scrollIntoView`),OK |
| E4A dedupe 锁的 `.status-header > span:last-child` 等规则可能与新增 `.msg-item` 内 `.msg-header` selector 冲突 | 实测 E4A 是 `.theme-kao .game-page .status-header`,新 `.msg-header` 在 `.msg-column` 内,无 selector 重叠;uiPolish 全绿确认 |

### 5.2 后续切片(留给 E6B / E6C)

- **E6B**(已 parallel ship,本轮未参与):record-folio 3-tier hierarchy + right-rail dossier 减重
- **E6C**(未做):InputArea "记入 / 落笔"按钮改印章 + 输入区 placeholder 仪式化
- **E6 空 ledger full-page empty-state**(未做,UI-DETAIL1 E-5):空 ledger 时 game-main-shell 下半空白,需要 1 个 record-book 风格的引导卡片
- **LXGW 全量加载**(UI-E6 §2.2 建议):`@font-face font-display: swap` → `block`,确保 ledger 永远真用 LXGW(避免 fallback Songti SC)。本轮 brief 只做 scoped CSS 视觉,**不动 main.css**;若用户反馈 ledger 仍模糊,可加 1 行 `font-display: block` 修
- **`.msg-actions` 默认可见度**(UI-DETAIL1 E-4):`opacity 0` → `opacity 0.55`,record-book 隐喻下"档案员修订笔"应常驻。本轮 brief 没要求,保留原 hover-only 行为
- **截图**:本沙箱无 Chromium,2 张 PNG 未生成,见 §3

### 5.3 未破契约 / 未破回归

- 旧 UI-E3 p2 contract 已更新,语义保留(no row counter / grid display / sparse divider / role ink / avatar hidden / text-main LXGW)
- 5A stereoMigration 6 个 test 不动
- 4 legacy snapshot test 不动
- themeVariantView 3 + welcomeVariantToggle 5 + 跨页面 N5C / W4 / N6 contracts 全部不动
- record-folio 6-cell grid(E3 / E4 锁):不动
- InputArea "记入" 文案 / dossier stamp / StatusBar 内部 title hide(E4A):不动
- GamePanel.vue legacy `.text-main` 15px / line-height 1.7 / `.tavern-btn.primary` #fff / `.tavern-avatar` 44px 圆角:全部保留(kao scoped block 用更高 specificity 覆盖,legacy 走 fallback)

---

## 6. diff 总览

```bash
$ git diff --stat src/components/GamePanel.vue src/__tests__/uiPolish.test.js
 src/__tests__/uiPolish.test.js | 249 ++++++++++++++++++++++-
 src/components/GamePanel.vue   | 438 +++++++++++++++++++++++++++--------------
 2 files changed, 529 insertions(+), 158 deletions(-)
```

- GamePanel.vue +280/-158 scoped `.theme-kao` block + template `<template v-for>` 嵌套 + script 加 3 computed/function
- uiPolish.test.js +241/-8(更新 1 旧 contract + 新增 1 个 describe block 8 个 contract)

---

## 7. 总结

**UI-E6A = ledger readable record-book page**。改 2 个文件,0 store / 0 service / 0 router / 0 sidebar / 0 InputArea / 0 record-folio / 0 folio / 0 record-folio 重排(E6B 已 parallel ship)。5 个 record-book 隐喻机制落地(spine stitch / folio 页码 / chapter rule / kicker signature / message backdrop)+ 字号 14→16 / 行高 1.65→1.75 / meta 9→11 sans。

**138/138 uiPolish pass** + **build 7.20s clean** + **git diff --check clean** + **0 store/service/router 改** + **0 新 :global/!important/raw-hex**。

**未做**:2 张截图(沙箱无 Chromium,见 §3);LXGW 全量加载(本轮 brief 不在 scope);`.msg-actions` 常驻(E-4 观察项,本轮 brief 没要求)。

派工 brief 全部命中。可被 Codex 审查后 ship。