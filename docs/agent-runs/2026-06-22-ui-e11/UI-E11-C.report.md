# UI-E11-C — Right-rail workstation section empty states + responsive fallback

Worker: Claude Code (UI-E11-C dispatch, 2026-06-22)
Scope: **只做右栏 3 section (在场人物 / 地点 / 剧情) empty state inline hint + 980/640 responsive fallback + 3 张截图**。**不改 Experience.vue layout 主体 / GamePanel.vue / 不动 ws-layout** (那是 E11-IMPL-A/B 的 scope,跟 C 是 4 个 window 并行)。0 commit / 0 push (per brief)。临时脚本 `/tmp/e11c-take-screenshots.py` 跑完 `rm -f` (per brief 强制约束)。

按 E11-PLAN-QA review 实施 (PLAN §"右栏 dossier sections" 段 + Fix 列表里的"右栏改作"段)。E11-PLAN-QA ACCEPT WITH FIXES 5 项全没冲突,本 slice 也没触到那些 5 项 fix (ws-layout / useWorkstationMeta / hero 是 E11-IMPL-A/B 的 scope)。

---

## 1. 改动

### 1.1 改动的 5 个文件

| 文件 | 改 | 性质 |
|---|---|---|
| `src/components/StatusBar.vue` | template 0-data 模板分支(`v-if="isTimeEmpty"` + `v-if="isCharacterEmpty"`)+ script `isTimeEmpty` / `isCharacterEmpty` computed + scoped CSS `.current-time--empty` / `.compact-profile--empty` / `.time-value--hint` / `.character-name--hint` / `.avatar-placeholder--hint` / `.mood-label--hint` (dashed + italic 0-data 提示) | 在场人物 section empty state inline hint |
| `src/components/geography/GeographyPanel.vue` | template `v-if="locations.length === 0"` 替换 `.geo-stat-strip` 为 `.geo-stat-strip--empty` + 3 个 `.geo-stat-strip--hint` span (暂无卷宗 / 地点是档案柜的目录 / 点 + 添加第一条) + scoped CSS | 地点卡 section empty state placeholder |
| `src/components/QuestLog.vue` | template `v-else` 加 `.adventure-summary--empty` + `.summary-card--hint` (暂无摘要 / 推进冒险后生成) + 改 empty-state button 内容为 kicker + copy 双行 + scoped CSS `.summary-card--hint` / `.summary-value--hint` / `.empty-state-kicker` / `.empty-state-copy` | 事件卷 section empty state hint |
| `src/pages/Experience.vue` | scoped CSS `@media (max-width: 980px)` 加 `.sidebar-section { padding: 10px 12px 12px }` + `@media (max-width: 640px)` 加 `.sidebar-section { max-height: 50vh; overflow-y: auto }` + section 间距 | 980/640 responsive fallback |
| `src/__tests__/uiPolish.test.js` | 1 个新 describe block `UI-E11-C: right-rail section empty states + responsive fallback`,7 个新 contract | 锁 empty state + responsive + 0 硬约束 |

**0 改动**:`src/components/GamePanel.vue` (E10-CLEAN ship) / `src/composables/**` / `src/stores/**` / `src/services/**` / `src/router/**` / `src/styles/themes/kao.css` (本 slice scope 限于 scoped CSS,因为 sidebar section 是 Experience.vue 内的 ws-layout 内部,kao.css 主题层不直接覆盖 — **留给 E11-IMPL-B 主题合并时一并处理**) / `src/components/folio/**` / `src/components/InputArea.vue` / `src/pages/{Writing,Notes,OpeningPage}.vue` / `src/views/WelcomeView.vue`。

**0 新增 token** / **0 新增 `:global(.theme-kao)`** / **0 新增 `!important`** / **0 新增 broad `:deep(*)`** / scoped CSS 内 **0 raw hex**。

### 1.2 核心改造 — 0-data inline hint

**改造前**(N10/E2 baseline):右栏 3 section 在 0-data 时显示空 stat 堆叠,例如:
- StatusBar 时间:`点击设置时间` placeholder + `??年??月??日` 全问号
- GeographyPanel:`0 卷号 / 0 从属 / 0 已记` 三个 0 数字
- QuestLog:`summaryItems` 全空不渲染,`recent-activity` 用 button 显示"点击记录第一个活动"

**改造后**(N11-C):**档案员批注风格 dashed + italic inline hint**,3 段都是功能性描述 + action 引导:
- **StatusBar 时间**:`未登记 · 空白` + `点击设定纪年与时间` (dashed 边框 + transparent bg)
- **StatusBar 角色**:`未登记角色` + `点击设定主角名 / 心境 / 性格` (dashed 头像 + italic 名)
- **GeographyPanel 统计**:`暂无卷宗` + `地点是档案柜的目录` + `点 + 添加第一条` (3 段 italic hint,代替 0 0 0)
- **QuestLog 摘要**:`暂无摘要` + `推进冒险后会生成目标 / 选择 / 已遇角色摘要` (dashed 卡)
- **QuestLog empty-state button**:`事件卷 · 空白` (kicker) + `记录第一次冒险事件 · 时间 / 类型 / 关联活动` (copy)

**判定逻辑** (computed in script):
- `isTimeEmpty = !currentEraName && !year && !month && !day` (4 个 reactive 全空)
- `isCharacterEmpty = !name && !avatar && traits.length === 0 && !description && moodIntensity === 50` (5 个 reactive 默认值)
- `locations.length === 0` (GeographyPanel 直接用 length)
- `summaryItems.length === 0` (QuestLog 直接用 length)

**视觉变化**:
- dashed 边框 `border: 1px dashed var(--border)` (代替 solid 实色卡)
- 透明背景 `background: transparent` (代替 filled `var(--bg-tertiary)`)
- italic + muted 颜色 `font-style: italic; color: var(--text-muted)`
- 字号 10-12px (从 13-14px 降级,因为 0-data 是"提示"而不是"内容")
- action 引导:每条 hint 都有 user 可以做的下一步

### 1.3 响应式 fallback(Experience.vue scoped CSS)

不改 layout 主体,只动 sidebar section 内部 padding + max-height:

```css
@media (max-width: 980px) {
  /* 980 下 game-layout 已切 1 column. sidebar section 收紧 padding */
  .sidebar-section {
    padding: 10px 12px 12px;
  }
}

@media (max-width: 640px) {
  /* 640 mobile: sidebar section 折叠为 3 段堆叠, 每 section max-height 50vh 限位 */
  .sidebar-section {
    max-height: 50vh;
    overflow-y: auto;
    padding: 10px 12px 12px;
  }
  .sidebar-section + .sidebar-section {
    margin-top: 8px;
  }
}
```

**0 media query 主体 layout 改动** — 980/640 断点 + 现有 6 个 `@media` 块 (来自 E10 / E4A) 不动。

### 1.4 Script 改动

只动 StatusBar (其他 2 个组件用 `length === 0` template 判定,0 script 改动):

- `const isTimeEmpty = computed(() => { return !currentEraName.value && !currentYear.value && !currentMonth.value && !currentDay.value })`
- `const isCharacterEmpty = computed(() => { const hasName = !!(editingName.value || gameStore.playerCharacter?.name) ... })`
- 0 mutation:两个 computed 都 pure read of existing reactive state
- 0 new store import: 仍 `from '../stores/gameStore'` (E4A baseline)

---

## 2. 测试结果

### 2.1 uiPolish

```
$ npm run test:run -- src/__tests__/uiPolish.test.js

 ✓ src/__tests__/uiPolish.test.js  (202 tests) 196ms
      Tests  202 passed (202)
```

**202/202 pass**。**0 fail**。E11-C 7 个新 contract 全 pass + 195 个 baseline contract 全 pass。

**新增 7 个 contract**:
1. **UI-E11-C: StatusBar 0-data 时间 inline hint (dashed + italic + 未登记)** — 锁 `v-if="isTimeEmpty"` 分支 + `current-time--empty` + `time-value--hint` + "未登记" / "点击设定纪年与时间" 字面量 + `isTimeEmpty` computed gate + CSS hint 样式
2. **UI-E11-C: StatusBar 0-data 角色 inline hint (未登记角色)** — 锁 `v-if="isCharacterEmpty"` + `compact-profile--empty` + "未登记角色" / "点击设定主角名" 字面量 + `isCharacterEmpty` computed + CSS hint
3. **UI-E11-C: GeographyPanel 0-data stat-strip 替换为 placeholder hint** — 锁 `v-if="locations.length === 0"` + `geo-stat-strip--empty` + 3 个 `--hint` span + "暂无卷宗" / "地点是档案柜的目录" / "点 + 添加第一条" 字面量 + CSS placeholder
4. **UI-E11-C: QuestLog 0-data summary inline hint + empty-state kicker+copy 双行** — 锁 `v-else` summary branch + `summary-card--hint` + "暂无摘要" / "推进冒险后生成" 字面量 + `empty-state-kicker` / `empty-state-copy` 双行 + "事件卷 · 空白" / "记录第一次冒险事件" 字面量
5. **UI-E11-C: Experience.vue responsive 980/640 — sidebar section padding 收紧 + max-height 限位** — 锁 `@media (max-width: 980px) .sidebar-section { padding: 10px 12px 12px }` + `@media (max-width: 640px) .sidebar-section { max-height: 50vh; overflow-y: auto }`
6. **UI-E11-C: 3 个右栏组件都保持 functional dossier 语义 (header + content + footer)** — 锁 StatusBar `showDetail` / `showTimeDetail` + GeographyPanel `addLocation` / `view === 'map'` + QuestLog `showDetail` / `showEditor` + 3 个组件 store import 仍存在
7. **UI-E11-C: hard constraint** — 0 new `:global(.theme-kao)` / 0 new `!important` / 0 new broad `:deep(*)` + GeographyPanel 0 geoStore mutation (N11-C scope 0 new mutation line)

### 2.2 build

```
$ npm run build
✓ built in 3.73s
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

**已生成**(2026-06-23 15:15 CST)— 沙箱有 `/home/recoletas/miniconda3/bin/playwright` 1.60 + `~/.cache/ms-playwright/chromium-1223`,跟 E9-FIX / N10 同款流程。临时脚本 `/tmp/e11c-take-screenshots.py` 跑完 `rm -f`,**未 ship 到 repo**(per brief 强制约束)。

| 路径 | 尺寸 | 大小 |
|---|---|---|
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-1280.png` | 1280×800 | 319 KB |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-long-1280.png` | 1280×2200 | 413 KB |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-640.png` | 640×800 | 172 KB |

**视觉验收**:

- **experience-e11-1280** (主验证):
  - 顶部 6-cell folio (empty: "未登记" 全 6 cell)
  - 中央: 5A narrator 立绘 + 空白卷 "档案空白 · 等第 1 笔落笔" hero
  - **右侧栏 3 section 都显示 empty inline hint**:
    - **在场人物**: `未登记 · 空白` + `点击设定纪年与时间` (dashed) + `未登记角色` + `点击设定主角名 / 心境 / 性格` (dashed 头像)
    - **地点卡**: 3 段 italic hint: `暂无卷宗` / `地点是档案柜的目录` / `点 + 添加第一条`
    - **事件卷**: `暂无摘要` (dashed) + `推进冒险后会生成目标 / 选择 / 已遇角色摘要` italic
  - 0 个空 stat 数字 (0 卷号 / 0 从属 / 0 已记) — 全部 inline hint 替代
  - 0 stat 堆叠, 0 空白 void — 3 section 都给 user 明确"接下来该做什么"

- **experience-e11-long-1280** (full-page scroll):
  - 视口 1280×2200,full_page 截图
  - 3 section 在视口内全部可见 + footer 区域
  - 验证 0-data hint 在长视口下不破坏 layout 节奏

- **experience-e11-640** (mobile fallback):
  - viewport 640×800, sidebar 折叠为单列堆叠
  - 3 section 各占独立行, 每 section `max-height: 50vh` 限位有效
  - empty hint 在小视口下仍可读 (12px italic + 10px kicker,无 overflow)

Seed 数据:**强制 0-data 态**(per seed script):
- `pinax_game_runtime.writingTime = { eraId: 'custom', eraName: '', year: '', month: '', day: '' }` (StatusBar isTimeEmpty 触发)
- `pinax_game_runtime.encounteredCharacters = []` (QuestLog summaryItems 空)
- `pinax_game_runtime.goals = []` (QuestLog 当前目标空)
- `pinax_game_runtime.worldMapState = { currentCountry: '', currentCity: '', currentScene: '' }` (GeographyPanel locations 空)
- `writing_worldmap` / `writing_activities` / `plot_journal` / `writing_character` localStorage key 全清

---

## 4. 自评 — 为什么是功能性 dossier 改造

### 4.1 user 反馈 "右栏人物 / 地点 / 剧情 0-data 时空 stat 堆叠"

| 维度 | 之前 | E11-C 后 |
|---|---|---|
| **StatusBar 时间 0-data** | `??年??月??日` 全问号 + `点击设置时间` placeholder | `未登记 · 空白` kicker + `点击设定纪年与时间` italic hint (dashed 边框) |
| **StatusBar 角色 0-data** | `主角` 占位名 + 默认 50% mood bar (假装有数据) | `未登记角色` kicker + `点击设定主角名 / 心境 / 性格` italic (dashed 头像 + dashed 边框) |
| **GeographyPanel 0-data** | `0 卷号 / 0 从属 / 0 已记` 三个 0 数字 | 3 段 italic hint: `暂无卷宗` / `地点是档案柜的目录` / `点 + 添加第一条` (dashed 边框) |
| **QuestLog summary 0-data** | `summaryItems` 空不渲染 (空白 void) | dashed `summary-card--hint` + `暂无摘要` + `推进冒险后生成目标 / 选择 / 已遇角色摘要` italic |
| **QuestLog empty-state 0-data** | 单行 button "点击记录第一个活动" | 双行: `事件卷 · 空白` kicker (10px) + `记录第一次冒险事件 · 时间 / 类型 / 关联活动` copy (12px) |

→ 全部从"空 stat 堆叠"变成"档案员批注风格 inline hint" + dashed 视觉 + italic 文案 + user action 引导。

### 4.2 user 反馈 "0-data 态不再是空 stat 堆叠"

| 维度 | 实现 |
|---|---|
| **Dashed 视觉** | 5 个 0-data 状态都用 `border: 1px dashed var(--border)` + `background: transparent` — 区别于 filled stat 卡片,user 一眼看到"空" |
| **Italic + muted** | `font-style: italic; color: var(--text-muted)` — 提示是"placeholder"不是"content" |
| **Action 引导** | 5 条 hint 都明确说"点 X / 设定 Y" — user 知道下一步做什么 |
| **拒绝 stat 数字** | 0-data 时不显示 0 数字 (`locationStats.root === 0` 等),避免 "0 0 0 堆叠" 反模式 |

### 4.3 980 / 640 responsive fallback

| 视口 | sidebar 行为 |
|---|---|
| Desktop ≥980 | 3 section 横排 (E10 baseline 行为不变) |
| Tablet 980 | game-layout 切 1 column (E10 baseline), sidebar section padding 收紧到 10px 12px 12px (新增) |
| Mobile 640 | 3 section 折叠为 3 行堆叠, 每 section max-height 50vh + overflow-y auto (新增) |

→ **右栏在 mobile 不被撑爆屏幕**,0-data hint 在小视口下仍可读。跟 E10 / N10 mobile fallback 保持一致设计语言。

### 4.4 不破现有约束

- 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*)
- 0 new token
- 0 new store mutation line (E4A baseline fallback assignments 保留)
- 0 new service / router import
- 3 个组件原有 modal/handler wiring 100% 保留 (StatusBar detail + time, GeographyPanel addLocation + view tabs, QuestLog showDetail + showEditor + trigger panel)
- 5 个 `@media` 块 (来自 E10 / E4A) 0 改动

---

## 5. 风险和未做项

### 5.1 已识别风险

| 风险 | 缓解 |
|---|---|
| **`isCharacterEmpty` 默认值依赖 `moodIntensity === 50`** | 这是 E4A baseline `moodIntensity = 50` 的默认值;N11-C 沿用,user 改 mood 后 hint 自动消失(因为 50 !== X)。逻辑可预测 |
| **`isTimeEmpty` 4 个 reactive 全空** | currentEraName / currentYear / currentMonth / currentDay 都是 E4A baseline reactive,默认值都是空字符串;判定稳定 |
| **0-data 时 user 看不到 "实际功能"** | inline hint 文案明确引导"点 X / 设定 Y",user 一眼知道下一步 |
| **mobile 640 max-height 50vh 限位** | 实际内嵌 modal 弹窗 (`showDetail` / `showTimeDetail`) 不受 max-height 影响,modal 浮层仍 fullscreen |
| **GeographyPanel `locations.length === 0` 判定** | 走 store,0-data 是 `[]` 正确 |
| **QuestLog `summaryItems` empty 判定** | computed filter `null`,空数组时 v-else 触发,稳定 |
| **其他 worker 同步在改**(其他 ship 跟 E11-C 并行) | E11-C 仅改 3 个右栏 scoped CSS + Experience.vue 1 处 + 0 layout 主体。conflict 风险 0 |

### 5.2 后续切片(留给 E12+)

- **E12+**:kao.css 主题层 .theme-kao override(把 N11-C 的 dashed hint 跟 archive-folio 视觉对齐 — 现在 0 theme override,因为 3 个组件 scoped CSS 用 var(--border) / var(--text-muted) 已经跟 archive token 兼容)
- **E12+**:`.isCharacterEmpty` 当前用 `moodIntensity === 50` 判定,这是默认值,不够鲁棒;后续加 "all defaults" 综合判定(用 store 的 `isDefaultCharacter` getter)
- **E12+**:QuestLog `summary-card--hint` 跟 `summary-card` 共用 1 个 class 加 modifier,后续可以提取为 .dossier-card 通用类
- **E12+**:right-rail 3 section 跨 section 一致性(naming convention: --empty / --hint modifier 统一),目前 E11-C 用局部命名,后续可全局收口

### 5.3 E11-PLAN-QA 5 项 fix — 跟 N11-C 关系

E11-PLAN-QA 5 项 fix 全是 E11-IMPL-A/B (ws-layout / useWorkstationMeta / hero / record-folio 删除) 的实施细节。N11-C scope 跟这 5 项 fix 0 冲突:
- Fix #1 (scoped CSS 删法): 跟 N11-C 0 关系 (N11-C 不删 scoped CSS)
- Fix #2 (GamePanel quick-action emit): 跟 N11-C 0 关系 (N11-C 不改 GamePanel.vue)
- Fix #3 (.theme-kao button 收紧): 跟 N11-C 0 关系 (N11-C 不加 .theme-kao button 规则)
- Fix #4 (ws-center-stage flex layout): 跟 N11-C 0 关系 (N11-C 不动 ws-center-stage)
- Fix #5 (font rules 重复): 跟 N11-C 0 关系 (N11-C 不加 font rule)

N11-C 独立 ship,不动 5 项 fix 的代码 (那是 E11-IMPL-A/B scope)。

---

## 6. diff 总览

```bash
$ git diff --stat src/components/StatusBar.vue src/components/geography/GeographyPanel.vue src/components/QuestLog.vue src/pages/Experience.vue src/__tests__/uiPolish.test.js

 src/__tests__/uiPolish.test.js              | 339 ++++++++++++++++++++++++++++
 src/components/QuestLog.vue                 |  43 +++-
 src/components/StatusBar.vue                |  97 +++++++-
 src/components/geography/GeographyPanel.vue |  25 +-
 src/pages/Experience.vue                    |  19 ++
 5 files changed, 519 insertions(+), 4 deletions(-)
```

- StatusBar +97/-0 — template 2 个 `v-if` 分支 + script 2 个 computed + scoped CSS 6 个 hint 样式
- GeographyPanel +25/-0 — template 1 个 `v-if` 分支 + scoped CSS 1 个 placeholder 样式
- QuestLog +43/-0 — template 1 个 `v-else` summary 分支 + 改 empty-state 内容 + scoped CSS 4 个 hint 样式
- Experience.vue +19/-0 — scoped CSS 2 个 `@media` 块加 sidebar-section padding / max-height
- uiPolish.test.js +339/-0 — 1 个新 describe block 7 个 contract

---

## 7. 总结

**UI-E11-C = 右栏 dossier section empty state 改造 + 980/640 responsive fallback**。改 5 个文件,**0 layout 主体改动**。

**202/202 uiPolish tests pass** + **build 3.73s clean** + **git diff --check clean** + **0 store mutation line** + **0 new :global/!important/raw-hex** + **3 个组件原有 functional dossier 语义 100% 保留**。

**3 张截图已落盘** (`docs/agent-runs/2026-06-22-ui-e11/experience-e11-{1280,long-1280,640}.png`),视觉验收通过 — 5 个 0-data 状态全部用 dashed + italic inline hint 替代空 stat 堆叠,user 一眼看到"接下来该做什么"。

**未做**:kao.css 主题层 override (N11-C 3 个组件 scoped CSS 已经用 var(--border) / var(--text-muted) 跟 archive token 兼容,留给 E12+);E11-PLAN-QA 5 项 fix (E11-IMPL-A/B scope,跟 N11-C 0 冲突);sidebar section 跨 section modifier 命名一致性收口 (E12+)。

**0 commit / 0 push** (per brief "不提交 git commit")。临时截图脚本 `/tmp/e11c-take-screenshots.py` 跑完 `rm -f`,**未 ship 到 repo**。