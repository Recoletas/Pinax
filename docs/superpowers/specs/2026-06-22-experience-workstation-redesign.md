# Experience Workstation Redesign — E11 现场控制台 + 记录流

> **本文是只读设计 spec**：不改 src / 不改 plan+report / 只落档本 markdown。等 Codex 拍板后由 `writing-plans` 转 plan。

**Date**: 2026-06-22
**Status**: Draft
**Stage**: 方案

## 重点

1. 把 `/experience` 从「顶部 record-folio 6 格空表单 + 中央空白纸面 + 右侧空 stat 堆叠」改成「4 段现场控制台 workstation」——一屏不空, 0-message 态也有真主视觉。
2. 顶部 sticky topstrip (卷 / 案号 / 当前任务 / 条数 / 5-cell 进度条) 是唯一的 section anchor, 中央 / 左 / 右 3 段都从 topstrip 读上下文, 替代 E10 不可见的 28px axis。
3. 强类型字体分层: **DISPLAY (LXGW) / BODY (Songti) / META (sans) / INTERACTIVE (sans+serif)** 4 层互斥, 修 E10 「字体层级混乱」。

## Context

### 用户 5 个抱怨（2026-06-21 起反复反馈）
1. **中央大空白纸面**：0-message 态进入 `/experience` 第一眼是 100% 空白 archive-paper
2. **右栏空 stat / 空 dossier**：3 个 dossier section (人物 / 地点 / 剧情) 0 数据时显示空 grid + 「暂无」文字
3. **菜单切换和页面衔接弱**：0 态切到有内容时无方向感, 顶部 record-folio 6 cell 永远「未登记」像空表单
4. **字体层级混乱**：LXGW 装饰字体误用正文, 缺强类型分层
5. **0-message 态没有主视觉**：没立绘, 没引导 entry, 没 CTA

### E10 失败诊断（`UI-E10-REJECT-PLAN.md` §1）
E10 修了「字体」(部分) 但留下 4 个失败: 中央空白, record-folio 6 格空表单, 28px axis 不可见, sticky indicator 在 0 态不显示。

### E10-CLEAN 已落地（2026-06-22 main `c2754f7` / `03f4c94` 之后的 `9633168` 等）
保留：`--font-body` token / `.text-main` font-family / `displayMessages` 单列 computed / `scene-entry` 结构 / E9-FIX mechanism-trigger click。
删除：`scene-stage__indicator` (template + computed + kao.css + scoped CSS) / 28px `game-page::before` shared vertical axis / E9 双页机制残留。

### 触发
STATUS.md 「Next up」第 1 条明确点名「E11 Experience workstation redesign: user explicitly says `/experience` still feels wrong and the next round should continue in the Lusion-informed direction」。`UI-E10-REJECT-PLAN.md` §4 已给出方案 B 详细思路, 本 spec 落档为可执行方案。

## Goals

1. `/experience` 0-message 态: 第一眼可见 narrator 立绘 (5B v0.1 `kao-archive-narrator.webp` ship) + 引导 entry + 3 个 quick action CTA, 不空。
2. 顶部 sticky topstrip (80px) always-on, 0 态显示「档案空白 · 卷 1 · 等候第 1 条」, 有内容态显示「卷 X · 第 N 条 / 共 M 条」+ 5-cell 进度条。
3. 右栏 dossier (人物 / 地点 / 剧情) 改成 functional section, 0 态显示 inline hint「暂无 X · 在对话中遇到会自动出现」, 有内容态显示真实 card list。
4. 中央 / 左 / 右 3 段一屏同时可见 (4 段 workstation composition), viewport 比例 18:54:28 (topstrip / center / side rails)。
5. 字体分层固化 4 层互斥 (DISPLAY / BODY / META / INTERACTIVE), kao.css 出 4 套 token 规则 + uiPolish 契约锁。
6. E9-FIX mechanism-trigger click 保留 (E10 已 ship)。
7. 不动 store / service / router / 5B 立绘 / theme-system。
8. uiPolish 新增 ≥ 12 条 E11 契约, 全部 pass; gamePanelMechanism 1/1 pass; build clean; diff --check clean。

## Non-Goals

1. **不做 WebGL / canvas / 3D scene / cursor trail / scroll-jacking** (Lusion R2/R3 禁区, per E10-REJECT-PLAN §4.3)。
2. **不把 28px axis 或 `scene-stage__indicator` 加回来** (per E10-CLEAN 2026-06-22 删除决定)。
3. **不做跨页基础设施** (z-tier + easing token 跨页 spec, 留给单独 spec)。
4. **不做 per-item data-color 全套迁移** (留给 N10+, per E10-REJECT-PLAN §4.3)。
5. **不改 store / service / router** (per E10 hard rules, 0 mutation)。
6. **不动 CharacterPortrait / FolioSurface / InputArea / GmPersonaLauncher / AdvisorPanel / ImageGenRail / CharacterBackdrop**。
7. **不动 5B 立绘文件 / characterArt config** (5B v0.1 ship 后 5B v0.2 user 手画走自己流程)。
8. **不做 opening 页 / welcome 页 / writing 页 / notes 页 polish** (本轮 E scope 严格)。
9. **不做新的 ambient animation / cursor-follow effect** (Lusion R3 §5 禁区)。
10. **不做 mobile-first 重构** (mobile fallback 在 ≤980px 折叠 left rail 到 top strip, 不重做 input/gesture)。

## Approach

### 2 方案对比

| 维度 | A 保守修复 | B 结构重做 ★ |
|---|---|---|
| **思路** | 在 E10 架构基础上修填充物, 4 文件小改 | 重做 4 段 workstation composition, 架构层消除空白位置 |
| **修中央空白** | 加 empty state hero block (1 文件改) | 一屏 4 段, 没有中央空白位置 (架构层消除) |
| **修 record-folio 6 格** | 缩到 1 hero cell, 其他下放 | topstrip 5 cell, 没有 6-cell form wall |
| **修右栏空 stat** | 改 empty state 文字 (3 文件改) | dossier 改 functional section (人员 / 地点 / 剧情 card list) |
| **修 axis 不可见** | 改顶部 progress bar | 共享 topstrip anchor, 3 区域从 topstrip 读 |
| **修 indicator 隐藏** | 改 always-on 文字 | topstrip always-on, 0 态显示「档案空白 · 卷 1」 |
| **改动 scope** | 4 文件, 改动量小 | 4 文件, 改动量大但都是 template + CSS |
| **破既有 contract 风险** | 中 (1 文件加 contract, 3 文件改 empty state) | 高 (template 大改, contract 同步) |
| **修用户「整体烂」** | 部分 (中央仍有空白纸风险) | 完全 (4 段都填满) |
| **Lusion 借鉴深度** | 浅 (progress bar 借鉴 top strip) | 深 (4 段 composition 借鉴 Lusion viewport-quadrant + per-item color + section anchor) |
| **风险** | 低 | 中-高 (scope 大) |
| **边际收益** | 中 (修 4 个问题中 3 个) | 高 (修 4 个问题 + 引入工作台 composition) |

### 推荐: 方案 B

**理由**：E10-REJECT-PLAN §4.1 已论证 E10 失败的根本原因不是字体也不是装饰线, 而是**页面组合还是「顶部 record-folio + 中央空 ledger + 右侧 dossier」的旧结构**。A 在旧结构上修填充物, 永远有空白位置; B 重做 composition, 架构层消除空白位置。Lusion 借鉴更深, 边际收益更高。

### B 方案关键 trade-off

| 决策 | 取舍 |
|---|---|
| 一屏 4 段, viewport 比例 18:54:28 | Lusion 「strong viewport composition」, 但要求 ≥1280px 才舒服; ≤980px 折叠 left rail 到 top strip, ≤640px 进一步 collapse |
| 中央 hero character 320×320 | 5B v0.1 narrator 立绘 (kao-archive-narrator.webp) 复用, 不重生成; 但 0-message 态立绘出现「档案员在等」叙事 |
| topstrip 80px sticky | 跟 5A `wall__lamp` memory point 同样的 sticky 模式, 复用 `position: sticky; top: 0`; 但占 viewport 高度, 小屏要折叠 |
| 4 段 grid `260px 1fr 300px` | E10 sidebar 248px 改 300px, 给人物 / 地点 / 剧情 section 多 50px 横向空间; 但 `<980px` 折叠后中央仍 1fr |
| 字体分层 4 层互斥 | DISPLAY 永远 LXGW 装饰 / BODY 永远 Songti 可读 / META 永远 sans / INTERACTIVE 看场景; 强类型, 不混用; 但 Learning curve, 写新规则要选 token |

## Architecture

### 4 段 workstation composition (viewport 比例 18:54:28)

```
┌──────────────────────────────────────────────────────────────────────┐
│ WS-TOPSTRIP (80px sticky, z-index 高)                                 │
│ ┌──────┬───────────┬───────────┬──────────┬───────────┬───────────┐  │
│ │ 卷   │ 案号      │ 当前任务  │ 第 N 条  │ 共 M 条   │ 5-cell    │  │
│ │ 1    │ 24A3A547  │ 未登记    │ 0        │ 0         │ 进度条    │  │
│ └──────┴───────────┴───────────┴──────────┴───────────┴───────────┘  │
├──────────────────┬──────────────────────────┬────────────────────────┤
│ WS-LEFT-RAIL     │ WS-CENTER-STAGE (1fr)    │ WS-RIGHT-RAIL          │
│ (260px)          │                          │ (300px)                │
│                  │                          │                        │
│ ┌──────────────┐ │ ┌──────────────────────┐ │ ┌──────────────────┐  │
│ │ HERO BLOCK   │ │ │ HERO CHARACTER       │ │ │ DOssIER STACK    │  │
│ │ narrator GM  │ │ │ 320x320              │ │ │ ┌──────────────┐ │  │
│ │ kicker 1行   │ │ │ <CharacterPortrait   │ │ │ │ 人物 0/0     │ │  │
│ │              │ │ │  pose-id="narrator"  │ │ │ │ empty hint   │ │  │
│ │              │ │ │  size="hero">        │ │ │ ├──────────────┤ │  │
│ │              │ │ │ + 3 quick action CTA │ │ │ │ 地点 0/0     │ │  │
│ │              │ │ │  (续写 / 速记 /      │ │ │ │ empty hint   │ │  │
│ │              │ │ │   切场景)            │ │ │ ├──────────────┤ │  │
│ │              │ │ └──────────────────────┘ │ │ │ 剧情 0/0     │ │  │
│ │              │ │ ┌──────────────────────┐ │ │ │ empty hint   │ │  │
│ │              │ │ │ MESSAGE STREAM       │ │ │ └──────────────┘ │  │
│ │              │ │ │ <article scene-entry>│ │ └──────────────────┘  │
│ │              │ │ │ scene-entry #N       │ │                        │
│ │              │ │ │ (scrollable)         │ │                        │
│ │              │ │ └──────────────────────┘ │                        │
│ │              │ │ ┌──────────────────────┐ │                        │
│ │              │ │ │ INPUTAREA (sticky    │ │                        │
│ │              │ │ │  bottom, 4 actions)  │ │                        │
│ │              │ │ └──────────────────────┘ │                        │
│ └──────────────┘ │                          │                        │
└──────────────────┴──────────────────────────┴────────────────────────┘
```

### 文件边界 (改 / 删 / 保留)

#### ✅ 改 (4 文件)

| 文件 | 改动 |
|---|---|
| `src/pages/Experience.vue` | **重写 template** 拆 `<div class="game-layout">` 为 `<div class="ws-layout">`, 内部 4 段 grid: `ws-topstrip` + `ws-left-rail` + `ws-center-stage` + `ws-right-rail`。删 `<section class="record-folio">` 6-cell grid (下放到 topstrip + right rail)。删 `<aside class="sidebar">` 3-section dossier, 改成 right rail 单一 stack。GamePanel 从中央移到 ws-center-stage。InputArea 从底部移到 ws-center-stage 的 sticky bottom。删 6 个 record-folio computeds (recordCaseNo / recordVolume / recordTime / recordCharacters / recordLocation / recordObjective) — 这些字段的派生迁入 `useWorkstationMeta` composable (新), 见下。**scoped CSS 删** `.game-layout` / `.game-main-shell` / `.sidebar` / `.record-folio` 全部旧规则; **新增** `.ws-layout` / `.ws-topstrip` / `.ws-left-rail` / `.ws-center-stage` / `.ws-right-rail` 4 段 grid。 |
| `src/components/GamePanel.vue` | (a) 加 hero character portrait block 在 ws-center-stage 顶部: `<CharacterPortrait pose-id="narrator" size="hero">` + 3 quick action buttons (续写 / 速记 / 切场景)。0-message 态显示引导 entry「档案空白 · 等候第 1 条落笔」+ 3 quick prompts, 1+ message 态显示 hero + scene-entry 流。(b) `displayMessages` 单列 computed 保留。(c) `--font-body` token 保留。(d) 新增 `<section class="chat-container__hero" v-if="displayMessages.length === 0">` 0-state entry block (引导 + 3 prompts)。 |
| `src/styles/themes/kao.css` | (a) 新增 `.theme-kao .ws-topstrip` sticky 80px top: 卷 / 案号 / 当前任务 / 进度 5 cell (5-cell progress bar `grid-template-columns: repeat(5, 1fr)` 横向进度条, fill cell 显示已发生 section)。(b) 新增 `.theme-kao .ws-layout` grid-template-columns `260px 1fr 300px` (desktop ≥1280px), `@media (max-width: 1280px)` 改 `220px 1fr 280px`, `@media (max-width: 980px)` 改 `1fr` (left rail collapse 到 top strip, right rail collapse 到 bottom)。(c) 删 `.theme-kao .record-folio` / `.theme-kao .record-folio__band` / `__grid` / `__cell` / `__kicker` / `__value` 全部 (E10-CLEAN 已删 axis + indicator, 这一步删 record-folio)。(d) 删 `.theme-kao .sidebar` 全部规则 (L1976-2108 整段)。(e) 新增 `.theme-kao .ws-right-rail__section` dossier stack 容器: 人物 / 地点 / 剧情 3 section, 每 section header LXGW 12px + section title + empty hint 或 card list。(f) 新增 4 套字体分层 token 规则固化 (DISPLAY / BODY / META / INTERACTIVE), 见下。 |
| `src/components/{StatusBar,QuestLog,GeographyPanel}.vue` | scoped CSS 不改核心功能, **只加 1 个 .ws-section-* wrapper class** (`.ws-section` 人物 / 地点 / 剧情 适配), 加 `.ws-section__empty-hint` empty state 文字 (替代 0 态的「暂无 X」stat card)。3 文件各加 ~5-10 行 CSS + 1 个 empty-hint block。 |

#### ➕ 新增 (1 文件)

| 文件 | 内容 |
|---|---|
| `src/composables/useWorkstationMeta.js` | 4 个 ref / computed: `currentVolume` / `caseNo` / `currentTask` / `currentSection` / `totalCount`, 全部从 `gameStore` 派生 (无 store mutation), 供 topstrip + left rail + right rail 3 段共用, 替代原 Experience.vue 内 6 个 record-folio computeds。**所有 ws-* 区域从 `useWorkstationMeta()` 读上下文, 不再各自读 store** — 这是 functional 衔接, 不是装饰线。 |

#### ❌ 删除 (1 文件 / 1 段)

| 文件 | 内容 |
|---|---|
| `src/pages/Experience.vue` 6 个 computeds | `recordCaseNo` / `recordVolume` / `recordTime` / `recordCharacters` / `recordLocation` / `recordObjective` 全部移到 `useWorkstationMeta`, template 内 `{{ recordXxx }}` 改为 `{{ meta.xxx }}` |
| `src/pages/Experience.vue` `<section class="record-folio">` block | 整个 6-cell grid 删除, topstrip 替代 |

#### 🔒 保留 (0 改, 硬约束)

| 文件 | 理由 |
|---|---|
| `src/components/folio/CharacterPortrait.vue` | 已 ship, `size="hero"` 复用 (max-width 386px, 3:4 aspect ratio, per `folio/CharacterPortrait.vue:35`) |
| `src/components/folio/FolioSurface.vue` | 不在 4 段 composition 内, 不动 |
| `src/components/InputArea.vue` | 移到 ws-center-stage sticky bottom, 用现有 wrapper, 不改内部 |
| `src/components/GamePanel.vue` scoped CSS `.text-main` font-family | `--font-body` token 保留 (E10 ship, 用户原话「字体不行」修了) |
| `src/components/GamePanel.vue` `displayMessages` computed | 单列流 = 真「读场景记录」(E10 ship), 保留 |
| `src/components/GamePanel.vue` `<div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)">` | E9-FIX mechanism-trigger click 保留 (gamePanelMechanism.test.js 1/1 pass) |
| `src/styles/themes/kao.css` `--font-display` / `--font-body` / `--font-sans` | 已 ship 3 套 token, 不重发明 |
| `src/stores/**` / `src/services/**` / `src/router/**` | 0 mutation (per E10 hard rules) |
| `src/components/{GmPersonaLauncher,AdvisorPanel,ImageGenRail,MilestoneModal,MechanismPanel,Character,SessionPicker}.vue` | 浮层组件, 不在 4 段内 |
| `src/pages/{WelcomeView,OpeningPage,Writing,Notes,ProseEssay}.vue` | 本轮 E scope 严格 |
| `src/assets/characters/kao-archive-*.webp` | 5B v0.1 ship 立绘, 不动 |
| `src/config/characterArt.js` | 5B v0.1 ship config, 不动 |
| `src/composables/useCharacterArt.js` | 5A ship composable, 不动 |

### 字体分层 (4 层互斥)

| 层 | Token | 字号 | 用途 | kao.css 新增规则 |
|---|---|---|---|---|
| **DISPLAY** (装饰) | `--font-display` LXGW | 10-14px | topstrip case / kicker / marginalia stamp / section title / dossier stamp | `.theme-kao .ws-topstrip__case` / `.theme-kao .scene-entry__stamp` / `.theme-kao .ws-right-rail__section-title` |
| **BODY** (长文) | `--font-body` Songti/Georgia | 12-18px | message 正文 / hero text / section number / thought body | `.theme-kao .text-main` (已 ship) / `.theme-kao .ws-left-rail__kicker` / `.theme-kao .scene-entry__no` |
| **META** (短) | `--font-sans` | 10-11px | 案号 / 角色名 / 时间 / stat / tabular-nums | `.theme-kao .ws-topstrip__meta` / `.theme-kao .display-name` (已 ship) / `.theme-kao .msg-time` (已 ship) |
| **INTERACTIVE** (输入+按钮) | `--font-sans` (按钮) / `--font-body` (textarea) | 13-16px | 按钮 / input placeholder / textarea | `.theme-kao button` / `.theme-kao textarea` |

**规则**：4 层互斥, 任何位置只用 1 层 token, 不会「display + body 混用」。uiPolish 契约锁每层至少有 3 处使用。

### Lusion 借鉴的具体点

| Lusion 原则 | 出处 | Pinax 落地 |
|---|---|---|
| Strong viewport composition | R3 §1.2 | 4 段 workstation, viewport 比例 18:54:28, 各占固定比例, 不留空白 |
| Section-to-section continuity | R3 §3.3 | topstrip 80px sticky 是唯一 section anchor, 3 区域从 topstrip 读 |
| Per-item data-color | R2 §3.1 (Lusion 最值钱) | right rail 人物 / 地点 / 剧情 section per-item kind-color (已有 7 类 kind token + 4 个 arc token) |
| Strong typography hierarchy | R3 §1.4 | DISPLAY / BODY / META / INTERACTIVE 4 层互斥, opacity 阶梯 |
| 抄 | — | — |
| 不抄 | R2 §5 + R3 §5 #2 | WebGL / canvas / 整页 transform / cursor trail / preloader / scroll-jacking |

### Functional 衔接 (不是装饰线)

| 区域衔接 | 机制 |
|---|---|
| **topstrip → 3 段** | `useWorkstationMeta()` composable 是 single source of truth, topstrip 持有 state, 3 段 reactivity 读 |
| **左 rail narrator ↔ 中央 hero narrator** | 同一 poseId (`narrator`), 同一 art (`kao-archive-narrator.webp`), 用户在两处看到同一人 |
| **中央 scene-entry roleStamp ↔ 右栏人物 section** | user 发 user message → 右栏人物 section 高亮 user 角色; assistant → 高亮 narrator 角色 (state-driven highlight) |
| **InputArea 3 quick action ↔ topstrip 当前任务** | 当前任务为空 → 续写按钮激活; 当前任务有 active quest → 切场景激活 (state-driven CTA) |

### 测试契约 (≥ 12 条 E11 contracts + 1 既有)

```javascript
// 新增 src/__tests__/uiPolish.test.js describe('UI-E11 Experience workstation', () => {
describe('UI-E11 Experience workstation', () => {
  // §A workstation composition (4 contracts)
  it('E11-A1: Experience.vue template has ws-layout root with ws-topstrip + ws-left-rail + ws-center-stage + ws-right-rail')
  it('E11-A2: ws-layout grid-template-columns is "260px 1fr 300px" in kao.css')
  it('E11-A3: ws-topstrip has position: sticky; top: 0 and height ~80px')
  it('E11-A4: ws-right-rail has 3 sections with data-dossier-stamp attribute')

  // §B topstrip anchor (3 contracts)
  it('E11-B1: useWorkstationMeta exports currentVolume / caseNo / currentTask / currentSection / totalCount')
  it('E11-B2: ws-topstrip shows "档案空白 · 卷 1 · 等候" when totalCount === 0')
  it('E11-B3: 5-cell progress bar renders one filled cell per currentSection')

  // §C 0-state hero (2 contracts)
  it('E11-C1: GamePanel hero block has <CharacterPortrait pose-id="narrator" size="hero"> in 0-state')
  it('E11-C2: 3 quick action buttons (续写 / 速记 / 切场景) present in 0-state, gated on currentTask')

  // §D font layering (2 contracts)
  it('E11-D1: 4 layers exist (DISPLAY LXGW / BODY Songti / META sans / INTERACTIVE mix) in kao.css')
  it('E11-D2: each layer has ≥ 3 selectors using it, no layer overlap on same element')

  // §E delete verify (1 contract)
  it('E11-E1: 0 references to .record-folio / .scene-stage__indicator / game-page::before in kao.css + Experience.vue')

  // §F forbidden patterns (1 contract, hard gate)
  it('E11-F1: 0 new :global(.theme-kao) / 0 new !important / 0 broad :deep(*) / kao block 0 raw hex / 0 store mutation')

  // 既有 (E9-FIX mechanism-trigger click, 保留)
  it('E9-FIX: <div class="text-wrapper" @click="onTextWrapperClick(index, msg, $event)"> present in GamePanel.vue')
})
```

**Pass criterion**: 13 contracts pass + 1 E9-FIX pass + `npm run test:run` 全量 pass + `npm run build` clean + `git diff --check` clean + 0 forbidden patterns。

### 截图验收 (3 张必跑)

| 文件 | viewport | 验收点 |
|---|---|---|
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-1280.png` | 1280×800 light + dark | 4 段 workstation 一屏可见, hero narrator 立绘可见, topstrip 5-cell 进度条, right rail dossier 3 section + empty hint |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-long-1280.png` | 1280×2200 | 多 messages 时 scroll, scene-entry 单列流, topsticky 跟随 scroll, right rail dossier 跟随 scroll (sticky) |
| `docs/agent-runs/2026-06-22-ui-e11/experience-e11-640.png` | 640×800 mobile | left rail collapse 到 top strip, 1fr center stage, 右栏 collapse 到 bottom |

**临时截图脚本** `/tmp/e11-take-screenshots.py` 跑完即 `rm -f`, **不 ship 到 repo** (per E9 §4.4 + AGENTS.md hard rule #11)。

### Forbidden patterns (硬约束)

| 禁止 | 理由 |
|---|---|
| 0 `:global(.theme-kao)` | Lusion R2 §1 + E10 hard rule |
| 0 `!important` | R3 §3 + Pinax convention |
| 0 broad `:deep(*)` | R3 §5 #5 + Pinax convention |
| kao block 0 raw hex | Lusion 颜色有 data-color, Pinax 用 `var(--archive-*)` |
| 0 store mutation | E10 hard rule |
| 0 service / router change | E10 hard rule |
| 0 WebGL / canvas / Three.js | Lusion R3 §5 #2 禁区 |
| 0 cursor trail / custom cursor | Lusion R3 §5 #4 禁区 |
| 0 preloader 数字滚动 | Lusion R2 §5 禁区 |
| 0 整页 transform | Lusion R2 §5 禁区, 工作台 user mental model 保护 |
| 0 scroll-jacking | Lusion R2 §5 禁区 + 用户 mental model |
| 0 加回 28px axis / scene-stage__indicator | E10-CLEAN 2026-06-22 已删, 永不复辟 |

### Out of scope (后续轮次)

| 候选 | 来源 | 优先级 |
|---|---|---|
| N10 per-item mood board | R2 §3 + R3 §4.2 #2 | 高 (per-item 身份是 Lusion 最值钱机制, 但本轮 E scope) |
| W10 save-chip ink-bleed | R3 §4.1 #1 | 中 (单按钮 polish) |
| UI-X1 z-tier + easing token 跨页基础设施 | R3 §7 | 中 (跨 3 页, 需要单独 spec) |
| Welcome launch session CTA + persistent CTA | R1 §5 P6+P8 | 中 (Welcome scope) |
| Worldbook 卡片 data-archive-bg | R3 §4.0 #2 | 中 (Welcome scope) |
| 5B v0.2 narrator 立绘 user 手画 | 5B ship 流程 | 独立流程 (per user 2026-06-15 16:30 决定) |
| Tiptap v3 migration | 调研报告 | 独立流程 |
| Writing.vue / Notes.vue / ProseEssay.vue 视觉同构 | Phase 1C 规划 | 后续 phase |

## Self-Application

- **设想（上游）**: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10-REJECT-PLAN.md` §4 方案 B 详细思路 + `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md` Lusion R1/R2/R3 借鉴清单
- **本 spec（方案）**: 本文件 `docs/superpowers/specs/2026-06-22-experience-workstation-redesign.md`
- **计划（下游）**: 待 Codex 拍板后, 由 `writing-plans` skill 转 `docs/superpowers/plans/2026-06-22-experience-workstation.md` (预计 8-12 tasks)
- **Reports**: 待 plan 实施后由 UI-E11 worker 出 `UI-E11.{plan,report,review}.md` + screenshots 落档 `docs/agent-runs/2026-06-22-ui-e11/`

## Risks

| Risk | Mitigation | 残留风险 |
|---|---|---|
| 重写 `Experience.vue` template 是大改动, 可能破既有 contract | 先加 13 条 uiPolish E11 contracts 锁新结构, 再实施 (TDD) | 中 |
| StatusBar / QuestLog / GeographyPanel 加 `.ws-section` wrapper class 破既有 contract | 同上, uiPolish 锁, scoped CSS 增量不改原有 | 低 |
| CharacterPortrait `size="hero"` 在 0-state 显示 narrator 立绘, 但 narrator 立绘是 ship 的 stub | 5B v0.1 `kao-archive-narrator.webp` 144KB 已 ship, 复用无虞; 若 stub 状态退回则显示 `.archive-stub-tape` (现有 fallback) | 低 |
| 一屏 4 段在小屏 (≤640px) 会挤, mobile fallback 折叠 | `@media (max-width: 980px)` `grid-template-columns: 1fr`, left rail collapse 到 top strip, right rail collapse 到 bottom | 低 |
| 工作流变更 (从单 record folio → 4 段 workstation) 影响 user mental model | ship 后让用户跑 1 周反馈; ship commit 注明「如需 revert 走 R8 STOP NOW 路径」 | 中 |
| 4 段 grid 在 1280-1420px viewport 跟 Notes/Writing 的 WS pattern 冲突 (N6 / W10 还没起 workstation) | 本轮 E scope 严格, 不引入跨页 workstation 约定, 后续如 W10/N10 立项再做 cross-page 协调 | 中 |
| `useWorkstationMeta` composable 新增, 跟 gameStore 耦合度测试不足 | uiPolish E11-B1 contract 锁 composable 5 个 exports shape; 实施时跑 `npm run test:run -- src/composables` 全量 | 低 |
| topsticky 80px 跟 Notes.vue N6 pinboard sticky 视觉冲突 (跨页 chrome) | E11 topstrip 不污染 AppShell, scoped 在 `.theme-kao .ws-topstrip` 内; 跨页 sticky 协调留给后续 spec | 低 |

---

**END OF SPEC** — 等 Codex 拍板, 然后 dispatch UI-E11 implementation. 推荐方案 B.