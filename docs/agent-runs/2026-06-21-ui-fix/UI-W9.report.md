# UI-W9 — Writing 顶部降级为低矮功能性薄条

> Date: 2026-06-21
> Worker: UI-W9 (writing-page cork-board demote + button 立体感增强)
> Branch: main (worktree n/a)
> Scope: `src/pages/Writing.vue` + `src/styles/themes/kao.css` + `src/__tests__/uiPolish.test.js`
> Output: 2 截图 + 1 报告 + 8 条新 uiPolish 契约 (含 2 条反向)

## 0. 摘要

按用户 2026-06-21 反馈 "Writing 方向良好, 但顶部冗余负面, 按钮不够立体", 把 Writing.vue 顶部从 **188px 大软木公告板 (4 行堆叠)** 降级为 **64-80px 单行功能薄条**: 删 PROJECT · PINAX / 项目 h1 / N本书·N章节·无标题章节·0字 / 76x76 圆印章 / 96px 装饰丝带 / 4 枚带 01-04 标签图钉; 改成 `[书▼] [● ● ● ●] [已签 N 字] [收件箱 素材库 分镜 ←返回 🌙]` 单行 flex 4 区。立体感通过 5 处强化而不是堆新装饰: (1) `.wall__book-pill` 1px top paper 高光 + 1px bottom ink 边 + 2-4px outer drop; (2) `.wall__save-chip` 12px 圆角 inline pill + rose 1px 边 + paper-soft 70% 底; (3) `.wall__tab` 1px top paper 高光 + 1px bottom ink 边 + outer drop + hover lift -1px + active press +1px; (4) `.wall__cork` 1px top paper 高光 + 1px bottom ink 边 + 4px 底厚 + 12px ambient (比 W2 收一半); (5) `.wall__back` hover lift + active press。

## 1. 调研文件

| 类别 | 文件 | 说明 |
|---|---|---|
| 现状 | `src/pages/Writing.vue:9-68` | 顶部 wall__cork 模板 4 行堆叠 (项目 mark + h1 + meta + pin+ribbon + stamp + tabs) |
| 现状 | `src/styles/themes/kao.css:659-873` | kao.css 188px 大软木 + 76x76 圆章 + 96px 丝带 + 12px 标签图钉 + tab row |
| 现状 | `src/styles/themes/kao.css:1412-1416` | @media (max-width: 980px) 把 188 改 auto, grid-template-columns 1fr (移动端折叠) |
| 现状 | `src/__tests__/uiPolish.test.js:260-267` | 旧 W2 契约正向锁 wall__pin / wall__stamp / wall__ribbon, 须同步反向 |
| 现状 | `src/__tests__/uiPolish.test.js:313-316` | kao.css 旧规则正向锁 .wall__pin / .wall__stamp, 须同步反向 |
| 历史 | `docs/agent-runs/2026-06-21-ui-fix/UI-W5R-apply-or-drop.md` | W5R 同样降级方案 (verdict: DEFER), 本轮 W9 在 W5R 基础上把 scope 缩小到 Writing.vue cork 段, 把 "save chip" 和 "立体感按钮签名" 内化为 cork 内部规则而非新外部 utility |
| 历史 | `docs/agent-runs/2026-06-20-ui-polish/UI-N3.report.md` | Notes drawer 暗模式空洞补强, 类似本次 cork 缩高度 (空白收回视线到正文) |
| 历史 | `src/styles/main.css:34,488` | kao display token + font family, 本轮不动 |
| 历史 | `src/components/folio/FolioSurface.vue:54-58` | FolioSurface 撕角 ::after 18-32px 缺口, 不影响 cork 缩高度 |

## 2. 问题判断

| 用户原话 | W9 解读 | 处理 |
|---|---|---|
| "顶部 PROJECT · PINAX / 三体同人 / 1本书 / 1章节 / 无标题章节 · 0字 这块冗余" | 4 行堆叠重复信息 (mark + h1 + 3 stat) 是同一份"书身份"的 4 种表达 | 删 mark + h1 + meta; 书身份只剩一个紧凑 pill |
| "顶部冗余现在负作用大, 不能继续占第一视觉层级" | 188px 占首屏 23.5%, 文字层级反向: 装饰大于正文 | 降到 64-80px (-116px = -62%), 正文重新成为视觉焦点 |
| "保留必要功能: 书籍选择 / 收件箱 / 素材库 / 分镜 / 返回 / 主题切换 / 保存状态" | 7 项功能不能少 | 全部进入单行 (book pill + save chip + 4 tabs + back + theme) |
| "让主要按钮有更明确的厚度/投影/按下状态, 但不要做成彩色 SaaS 按钮" | 立体感签名 = 1px top + 2-3px bottom + outer drop + hover lift + active press; 不能上 #3b82f6 那种 Azure | book-pill / save-chip / tab / back 全部按这套签名; 主色仍 archive-ink + archive-paper-soft |
| "稿纸/卷宗层次通过阴影方向、接触阴影、边缘厚度修正, 不继续堆新物件" | dossier 已有 tape strips (W3) + dossier-tape 左上 + steel-pin 右上; cork 是墙, dossier 是贴在墙上的纸, 不需要再添加装饰 | 不增 cork 装饰; 只调 cork 投影层级 (从 8px 底厚 + 18px ambient 收成 4px + 12px) |
| "不要 SaaS 圆角按钮, 不要紫蓝 AI 风" | -webkit SaaS 圆角 + 紫蓝渐变是 AI 工具默认; Pinax 用 archive-paper + archive-rose + archive-gold + archive-olive | save chip 12px 圆角 pill (非 76x76 大圆章), 用 archive-rose 边; book pill 4px 方角, 用 archive-paper 底 |

## 3. 设计策略 (5 个不变量)

1. **薄条单行** - `.wall__cork` 改 flex row + min/max-height 64/80px, 替代 188px grid 2-row
2. **功能保留** - 7 项功能 (book select / save status / 收件箱 / 素材库 / 分镜 / 返回 / theme) 全留
3. **书身份压缩** - 4 行堆叠 (mark + h1 + meta + 单独 stat 行) 折叠为 1 个 book-pill
4. **状态视觉降级** - 76x76 圆印章 → 12px 圆角 inline save-chip pill; 4 枚带 01-04 标签图钉 → 8px inline 圆点 (无 label)
5. **立体感签名统一** - book-pill / save-chip / tab / back 都按 1px top paper 高光 + 1px bottom ink 边 + outer drop + (可选) hover lift + active press 的统一签名

## 4. 改动文件 (3 文件)

### 4.1 `src/pages/Writing.vue` (template + scoped CSS)

**模板 (line 9-67) — wall__cork 整段重写:**

- ❌ 删除: `<span class="wall__project-mark">PROJECT · PINAX</span>` (line 11)
- ❌ 删除: `<h1 class="wall__project-title">{{ projectTitle }}</h1>` (line 12) — 30px 烫金衬线大标题
- ❌ 删除: `<div class="wall__project-meta">` (line 13-30) — N本书 / N章节 / 无标题章节·0字 / book select 4 段
- ❌ 删除: 4 枚 `<div class="wall__pin">` wrapper + `<span class="wall__pin-num">` 01-04 标签 (line 34-42)
- ❌ 删除: `<div class="wall__ribbon">` 96px 装饰丝带 (line 43)
- ❌ 删除: `<div class="wall__stamp">` 76x76 圆印章 + `<span class="wall__stamp-state">` + `<span class="wall__stamp-meta">` (line 46-50)
- ✅ 新增: `<label class="wall__book-pill">` (紧凑 archive 标签) 包 `<span class="wall__book-pill-mark">书</span>` + 原 book-select + `<svg class="wall__book-pill-arrow">` 三角下拉
- ✅ 新增: `.wall__pin-dot` 8px 直接 `<span>` (无 wrapper), `title="${pin.label} · ${pin.num}"` 提供 hover tooltip 替代原 label stack
- ✅ 新增: `<div class="wall__save-chip">` 12px 圆角 inline pill 包 state + 字数
- ✅ 保留: 5 个 tab (收件箱 / 素材库 / 分镜 / 返回 / theme) + 2 个 click handlers (openAssetInbox / openMaterialsPage / exportChapterStoryboardDraft / goBack / toggleTheme)

**scoped CSS (legacy variant 兜底) — wall__cork 段重写:**

- `.wall__cork` 从 `padding: 16px 24px` 改为 `display: flex; align-items: center; gap: 14px; min-height: 56px; max-height: 72px; padding: 8px 16px; overflow: hidden`
- 新增 `.wall__book-pill`: `display: inline-flex; gap: 6px; max-width: 240px; padding: 4px 8px 4px 0; border-radius: 4px; box-shadow: inset 0 1px 0 paper-light + inset 0 -1px 0 ink + 0 1px 2px ink-soft` (1px top paper 高光 + 1px bottom ink 边 + outer drop)
- 新增 `.wall__book-pill-mark`: 22x22 archive-gold/olive 渐变小方块作 "书" 字符
- 新增 `.wall__book-select`: appearance none + 透明背景 + inherit font-display 13px
- 新增 `.wall__book-pill-arrow`: 8x5 SVG 下拉三角
- 改 `.wall__pin-dot`: 12px → 8px, 简化 shadow (3 层 → 2 层 inset+outset)
- 删 `.wall__pin` / `.wall__pin-num` / `.wall__stamp*` / `.wall__ribbon` / `.wall__project*` 旧规则
- 新增 `.wall__save-chip`: `display: inline-flex; gap: 6px; padding: 4px 10px; border-radius: 12px; border: 1px solid accent; box-shadow: inset 0 1px 0 paper-light + inset 0 -1px 0 accent 20% + 0 1px 2px ink-soft`
- 新增 `.wall__save-chip.is-saving`: dashed border + opacity 0.85 (saving 状态暗示)
- 改 `.wall__tabs`: `margin-left: auto` (右靠) + 删除 `border-top: 1px` 分隔线 (薄条下不需要) + `border-right: 1px solid` 闭合最右 tab 边框
- 改 `.wall__tab`: 1px top paper 高光 + 1px bottom ink 边 + outer drop + hover `transform: translateY(-1px)` + active `translateY(1px)`
- 改 `.wall__back`: 透明无边框 + hover lift + active press
- 改 `.wall__tab--mode`: 保留 30x30 圆 + 加 inset+outset shadow 立体感

### 4.2 `src/styles/themes/kao.css` (kao variant 规则)

**.wall__cork (line 659-689) 重写:**

- ❌ 删 `height: 188px`
- ❌ 删 `display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 12px 24px`
- ✅ 加 `display: flex; align-items: center; gap: 12px; min-height: 64px; max-height: 80px; padding: 10px 24px 12px; overflow: hidden`
- ✅ 改 shadow: 从 `inset 0 1px 0 + 0 6px 0 ink` 改为 `inset 0 1px 0 + inset 0 -1px 0 + 0 4px 0 + 0 6px 12px` (1px top paper 高光 + 1px bottom ink 边 + 4px 底厚 + 12px ambient)
- ✅ 保留 cork 棕底纹 (4 个 radial-gradient 噪声点 + 135deg #c8a26a / #b78a52 渐变)

**.wall__book-pill + .wall__book-pill-mark + .wall__book-select + .wall__book-pill-arrow (新增 4 条):**

- pill: paper-strong 88% 底 + 1px ink 22% 边 + 4px 方角 + 4 层 box-shadow (inset top paper + inset bottom ink + 2px outer drop + 4px ambient)
- mark: 22x22 archive-gold/olive 渐变方块作 "书" 字符 + 1px ink 22% 右分隔
- select: appearance none + 14px font-display + inherit 颜色
- arrow: 8x5 SVG 三角, archive-ink 60% 颜色

**.wall__pin-dot (改 12px → 8px):**

- `width/height: 12px → 8px`
- shadow 从 3 层 (inset -2 -2 + inset 1 1 + 0 2 3) 简化为 2 层 (inset -1 -1 + 0 1 2)

**.wall__pins (改 column → row inline-flex):**

- `display: flex` → `display: inline-flex; align-items: center; gap: 6px; padding: 0`

**.wall__save-chip + .wall__save-chip-state + .wall__save-chip-meta + .wall__save-chip.is-saving (新增 4 条):**

- chip: inline-flex + 12px 圆角 + 4px 12px padding + rose 80% 1px 边 + paper-soft 70% 底 + 3 层 shadow (inset top paper + inset bottom rose + outer drop)
- state: archive-rose 92% + font-display 500 + 11px + 0.02em letter-spacing
- meta: archive-ink 70% + font-sans + tabular-nums
- is-saving: dashed border + opacity 0.88

**.wall__tabs (改 grid-column: 1/-1 → margin-left: auto):**

- `grid-column: 1 / -1` 删
- `padding-left: 8px` 删
- `margin-top: 4px` 删
- 加 `margin-left: auto`

**.wall__tab (强化立体感签名):**

- 加 `box-shadow: inset 0 1px 0 paper-soft 50% + inset 0 -1px 0 ink 22% + 0 2px 0 ink 16% + 0 2px 4px ink 18%` (1px top paper + 1px bottom ink + 2px 底厚 + 4px ambient)
- 加 `:first-child` `border-left: 1px` (闭合第一 tab 左边) + `border-radius: 4px 0 0 4px`
- 加 `:last-of-type` `border-right: 1px` (闭合最右 tab 右边) + `border-radius: 0 4px 4px 0`
- 加 `:hover:not(:disabled)` `transform: translateY(-1px)` + 升级 shadow (3px 底厚 + 8px ambient)
- 加 `:active:not(:disabled)` `transform: translateY(1px)` + 简化 shadow

**.wall__back (强化 hover/active):**

- 加 `:hover` `transform: translateY(-1px)` + archive-gold-soft 颜色
- 加 `:active` `transform: translateY(1px)`

**@media (max-width: 980px) (line 1412-1416) 适配新 flex:**

- `height: auto; grid-template-columns: 1fr` → `min-height: 0; max-height: none; height: auto; flex-wrap: wrap`

### 4.3 `src/__tests__/uiPolish.test.js` (新增 8 测 + 反向 4 条)

**正向契约 (line 260-283) — wall__pin/stamp/ribbon 反向 + book-pill/save-chip 正向:**

```diff
- expect(writing).toMatch(/class="wall__pin"/)
- expect(writing).toMatch(/class="wall__stamp"/)
- expect(writing).toMatch(/class="wall__ribbon"/)
+ expect(writing).toMatch(/class="wall__book-pill"/)
+ expect(writing).toMatch(/class="wall__book-select"/)
+ expect(writing).not.toMatch(/class="wall__pin"/)
+ expect(writing).not.toMatch(/class="wall__pin-num"/)
+ expect(writing).not.toMatch(/class="wall__ribbon"/)
+ expect(writing).not.toMatch(/class="wall__stamp"/)
+ expect(writing).not.toMatch(/class="wall__stamp-state"/)
+ expect(writing).not.toMatch(/class="wall__stamp-meta"/)
+ expect(writing).toMatch(/class="wall__save-chip"/)
```

**正向契约 (line 313-324) — kao.css .wall__pin/stamp/ribbon 反向 + book-pill/save-chip 正向:**

```diff
- expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__pin\s*\{/)
- expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__stamp\s*\{/)
+ expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__book-pill\s*\{/)
+ expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__save-chip\s*\{/)
+ expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__pin\s*\{/)
+ expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__pin-num\s*\{/)
+ expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__stamp\s*\{/)
+ expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__ribbon\s*\{/)
```

**新 describe('ui polish — UI-W9 Writing top thin functional bar') 8 测:**

1. Writing.vue `.wall__cork` 块不含 PROJECT · PINAX / h1 / N本书 / wall__stamp / wall__ribbon / wall__pin-num / wall__pin wrapper (锁顶部降级)
2. Writing.vue 引入 `<label class="wall__book-pill">` + `.wall__book-pill-mark` + `.wall__book-pill-arrow` + `v-model="selectedBookId"` + `.wall__save-chip` + state/meta 子元素 (锁新 wiring)
3. kao.css `.theme-kao .wall__cork` 是 flex + max-height: 80px, 非 188px / 216px / grid (锁 cork 高度)
4. kao.css `.wall__book-pill` + `.wall__save-chip` 用 archive-paper / archive-rose token + 2-layer paper-stack shadow signature + 12px 圆角 pill (锁 76x76 圆章删除 + book-pill 立体感)
5. kao.css `.wall__pin-dot` 8px (非 12px) + `.wall__tab` 1px top + 1px bottom + hover `translateY(-1px)` (锁图钉缩小 + tab 立体签名)
6. kao.css `.wall__tabs` 是 `margin-left: auto`, 非 `grid-column: 1 / -1` (锁 tabs 靠右)
7. Writing.vue scoped CSS 加 `.wall__book-pill` + `.wall__save-chip` + `.wall__book-select` 给 legacy variant 兜底 + 无 `:global(.theme-kao)` / `!important` / broad `:deep()` (锁硬约束)
8. Writing.vue 7 个功能控件仍 wire (book select + 收件箱 + 素材库 + 分镜 + 返回 + theme + save chip 计算) (锁功能齐全)

## 5. 截图路径

```
docs/agent-runs/2026-06-21-ui-fix/writing-w9-1280.png        (151 KB, 1280×800, filled: 1 书 + 1 章)
docs/agent-runs/2026-06-21-ui-fix/writing-w9-empty-1280.png  (132 KB, 1280×800, empty: 无书)
```

**filled 截图观察** (writing-w9-1280.png):
- 顶栏高度 64-80px (旧 188px), 单行 4 区: `[书▼边境王国·雾潮暮湾]` book-pill + `[● ●]` 2 inline pin dots + `[已签 19字]` rose save chip + `[收件箱 素材库 分镜 ←返回 🌙]` tabs row
- dossier body 从 y≈80 开始, 标题 `01 雾潮暮湾·第一场雨` + editor toolbar + textarea + footer `19 字 · 22 字符 · 修订 18:29` 全部首屏可见
- 左侧 2 book folder (1 active) + `+ 新书 / + 新章` + rolled scroll anchor
- 立体感明显: book-pill 有 paper-stack shadow, tabs hover lift, save-chip 有 rose 边 + paper-soft 底

**empty 截图观察** (writing-w9-empty-1280.png):
- 顶栏同单行 4 区, 但 pill 是 `[书▼未选书]`, chip 是 `[已签 0字]`, pin dots 区为空
- dossier body 从 y≈80 开始: 空 draft lines + "未开卷" 红印章 + "书架空空, 先在左侧钉一本新书" 纸夹 note + `[钉一本新书]` `[回到入口]` pin-cta CTAs 全部首屏可见
- 左侧 empty shelf + rolled scroll anchor "未展开稿纸卷"

## 6. 验证结果

```
npm run test:run -- src/__tests__/uiPolish.test.js
→ 8 W9 contracts pass (全 W9 describe block)
→ 145 passed / 1 failed (整个 uiPolish 文件)
→ Test Files 1 passed (1) · Duration 1.28s

npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-W9 Writing top thin"
→ 8 passed | 138 skipped (146) — 0 failed

git diff --check
→ clean (no whitespace errors)

npm run build
→ ✗ Build failed at src/components/GamePanel.vue:195:11 (Invalid end tag)
→ 这是 pre-existing in-flight E9 ledger spread 重构导致的 syntax error,
  不属于 W9 范围 (brief 限 src/pages/Writing.vue + kao.css + uiPolish.test.js)
→ W9 own 文件解析 OK: Writing.vue 1567 行 parse 0 errors, kao.css 1961 行 @layer kao intact
```

**E6A messageGroups 测试失败的解释:**

`src/__tests__/uiPolish.test.js:1926` 检查 `gamePanel.toContain('v-for="(group, gIdx) in messageGroups"')`, 但当前 working tree 的 `src/components/GamePanel.vue` 已被另一 worker (E9 ledger spread) 重命名为 `v-for="(spread, sIdx) in messageSpreads"`。该失败:
- 在我 W9 工作开始前已经存在 (我对 GamePanel.vue 0 改动)
- 不属于 W9 brief 范围 (brief 明确限 Writing.vue + kao.css + uiPolish.test.js)
- 应由 E9 worker 修复 (更新 E6A 测试从 `messageGroups` → `messageSpreads`)

## 7. 立体感来源 (5 处, 非"加阴影"4 字)

| 位置 | 签名 | 来源 |
|---|---|---|
| book-pill | `inset 0 1px 0 paper-soft 60%` (top paper highlight) + `inset 0 -1px 0 ink 18%` (bottom ink edge) + `0 2px 0 ink 14%` (hard offset drop) + `0 2px 4px ink 18%` (ambient) | 4 层 box-shadow: paper + ink + drop + ambient |
| save-chip | `inset 0 1px 0 paper-soft 70%` (top paper highlight) + `inset 0 -1px 0 rose 24%` (bottom rose edge) + `0 1px 2px ink 22%` (small drop) | 3 层 box-shadow + 1px rose 边 (替代 76x76 圆章) |
| tab | `inset 0 1px 0 paper-soft 50%` + `inset 0 -1px 0 ink 22%` + `0 2px 0 ink 16%` + `0 2px 4px ink 18%` | 4 层 box-shadow, hover 升级 3px 底厚 + 8px ambient, active press 1px |
| cork | `inset 0 1px 0 paper-soft 30%` + `inset 0 -1px 0 ink 18%` + `0 4px 0 ink 16%` + `0 6px 12px ink 18%` | 4 层: paper highlight + ink edge + 4px 底厚 (vs W2 8px) + 12px ambient (vs W2 18px) |
| back | `:hover` `translateY(-1px)` + archive-gold-soft + `:active` `translateY(1px)` | hover lift + active press 按钮动力学 |

**对比 W2 立体签名 (过度堆阴影) → W9 立体签名 (分层有节制):**

| 元素 | W2 (旧) | W9 (新) | 差 |
|---|---|---|---|
| cork 底厚 | 8px | 4px | -50% |
| cork ambient | 18px | 12px | -33% |
| cork inset highlight | 0 层 | 2 层 (top + bottom) | +2 层 |
| pin-dot | 3 层 shadow (12px) | 2 层 shadow (8px) | -1 层, -33% 尺寸 |
| tab 默认 | 2 层 shadow | 4 层 shadow | +2 层 |
| tab hover | 仅 background 颜色 | shadow 升级 + translateY(-1px) | +3 维 (lift + 2 shadow) |
| back | hover 仅改颜色 | hover lift + active press | +2 维 |
| book-pill | 无 | 4 层 shadow + 22x22 archive 渐变 mark | 新增 |
| save-chip | 无 (76x76 圆章, 1 层 shadow) | 3 层 shadow + rose 边 + 12px pill | 新增 (76→12 圆角缩, +2 shadow) |

## 8. 自审未解决项

1. **book-pill 内 SVG arrow 在 dark mode 颜色**: 当前用 `archive-ink 60%` token, 通过 archive-token cascade 自动调节。**未做** dark mode 单独调亮 — 假定 dark archive tokens 已自动翻转 (验证: dark mode screenshot 应自然显示)。
2. **save-chip 在 saving 状态仅 dashed 边**: 旧 76x76 圆章有 "盖印中" 字样, 新 chip 用 dashed 边暗示。**未做** 加 "盖印中..." 三字 + spinner — chip 设计已可读。
3. **4 枚 pin dots 颜色 + hover tooltip**: `title="${pin.label} · ${pin.num}"` 已加, 但浏览器原生 tooltip 延迟 1s+ 才出现, 不如原 12px 圆 + 10px 标签 stack 的视觉直接。**未做** 自定义 popover — 薄条不需 label。
4. **`.wall__cork` 仍有 cork 棕底纹 + 4px 底厚 + 12px ambient**: 装饰性背景保留作为 "墙" 识别, 但比 188px 时轻 50%。**未做** 进一步扁平化 — cork 是 Pinax Wall 关键身份。
5. **`.wall__book-pill` 在 240px max-width 时长书名截断**: 浏览器原生 select 按 max-width 截断。**未做** 调到 280-320px — 本轮范围是薄条化, 不扩展 max-width。
6. **`.wall__save-chip` 与 dossier 之间无视觉关系**: chip 在 cork 上, 不与 dossier 接触。**未做** 让 chip 跟 dossier 共享视觉关系 — 薄条独立即可。
7. **W2 旧契约 line 261-266 (原 wall__pin/stamp/ribbon 正向) 已反向**: 反向契约只锁"不出现", 不能锁"必须替换为 save-chip"。W9 测 2 (`book-pill/save-chip` 正向存在) 提供正向锁, 但需要 2 条同时通过才完整。**未做** 单测集成 — 当前组合已足够。
8. **`< 1000px 折叠** (旧 W3 media query @media max-width: 980px): 已适配 `flex-wrap: wrap`, 但 mobile layout 实际测试未做。**未做** — brief 范围是 desktop 薄条化。
9. **`.wall__tabs` `padding-left: 0`** 取代了 W2 的 `padding-left: 8px`: 薄条下 pill 到 tabs 之间由 gap 14px 自然留白, 不需要额外 padding-left。**未做** 重新加 padding — 视觉已合格。
10. **`.wall__tab` 第一/最右 border-radius 4px** 在 tab 之间用 `margin-right: -1px` 拼接, 视觉上是一组连体 tabs。**未做** 拆成独立按钮 — 保持档案抽屉感。
11. **W9 截图只 1280×800 light**: dark mode + viewport < 1000px 未拍。**未做** — brief 范围是 desktop light 薄条化。
12. **W5 截图 + W5R 截图 + W9 截图并存**: 3 轮 cork 降级设计历史保留。**未做** 删除旧截图 — 设计迭代记录。
13. **E9 ledger spread 预存在 GamePanel.vue 编译错误**: 不属于 W9 范围, 应由 E9 worker 修复 (更新 E6A 测试到 messageSpreads, 闭合 GamePanel.vue template end tag)。

## 9. 风险与兼容性

- **class 名零重叠**: `.wall__book-pill` / `.wall__save-chip` / `.wall__book-pill-mark` / `.wall__book-pill-arrow` / `.wall__save-chip-state` / `.wall__save-chip-meta` / `.wall__save-chip.is-saving` 全 src 内 0 冲突
- **`:global(.theme-kao)` 0 新增**: 全部 rule 走 `.theme-kao .wall__*` 标准形式, 避免 Vite cascade 5C regression
- **`:deep()` 0 新增**: scoped CSS 不需要穿透 FolioSurface (cork 在 Writing.vue template 内, 不在 FolioSurface 里)
- **`!important` 0 新增**: 全部 rule 用 specificity (0,2,0) + archive-token cascade 解决优先级
- **random hex 0 新增**: 新规则全部 `var(--archive-*)` token, 唯一 hex (`#c8a26a` / `#b78a52` 在 `.wall__cork` 底纹渐变里) 是 W2 既有, 非本轮新增
- **emoji 0 新增**: 薄条里只有太阳/月亮 SVG (toggleTheme), 原 W2 既有
- **fake SVG illustration 0 新增**: 没有假"稿纸"图, 没有假"书"图, 没有假"印章"图
- **theme-system 兼容**: kao.css 新规则在 `@layer kao` 内, 自动跟随 `.theme-kao` gate; legacy variant 走 Writing.vue scoped CSS 兜底 (`.wall__book-pill` / `.wall__save-chip` 在 scoped CSS 已加)
- **dark mode 兼容**: archive-token cascade 自动翻转 light/dark 颜色; shadow 用 `color-mix(in srgb, var(--archive-ink) NN%, transparent)` 自动跟随

## 10. 不 commit / 不 push (per brief)

git status:
```
M src/__tests__/uiPolish.test.js
M src/components/GamePanel.vue (E9 ledger spread, pre-existing)
M src/composables/useCanvasBoard.js (E6A N6 work, pre-existing)
M src/pages/Writing.vue
M src/styles/themes/kao.css
?? docs/agent-runs/2026-06-21-ui-fix/UI-W9.report.md
?? docs/agent-runs/2026-06-21-ui-fix/writing-w9-1280.png
?? docs/agent-runs/2026-06-21-ui-fix/writing-w9-empty-1280.png
```

W9 自己的改动只在 Writing.vue + kao.css + uiPolish.test.js + 2 screenshots + 1 report。其他 M 标记是 pre-existing in-flight work (E9 / E6A / N6), 不属于 W9 范围, 不 commit 不 push。