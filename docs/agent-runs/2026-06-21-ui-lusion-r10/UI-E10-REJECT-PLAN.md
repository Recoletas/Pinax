# UI-E10-REJECT-PLAN — Experience 重做 2.0

- **Author**: Claude Code (UI-E10-REJECT-PLAN window, 2026-06-22)
- **Role**: 只读 / 不改 src / 不改 plan+report / 只落档本 markdown
- **Basis**:
  - `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.report.md` (E10 ship attempt)
  - `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.plan.md` (E10 plan)
  - 截图 `experience-e10-{1280, long-1280, dark-1280, 640}.png` (本 plan §1 直接审视)
  - `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` (E9 ledger-spread 历史)
  - `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` (Lusion 调研)
- **结论先行**: E10 不接受. 保留 `--font-body` token + 删 `ledger-spread` + `displayMessages` 单列流这 3 个零件, 其余 revert. 进入 E10-REMAKE (本 plan §3 方案 B).

---

## 0. 一句话结论

**E10 把"字体"修了,把"布局"打散了. 用户的 4 个抱怨里 "字体不行" 是 4 个里最不重要的一项, E10 优先修了它, 留下了另外 3 个 (显示奇怪 / 菜单衔接 / 整体烂) 完全没修. 这是把力气花在最低 ROI 的地方. 需要 E10-REMAKE 用结构重做路线解决剩下 3 个.**

| 抱怨 | E10 修了? | 怎么修的 | 实际效果 |
|---|---|---|---|
| 字体不行 | ✅ 部分 | 新增 `--font-body` token, `.text-main` 改用之 | ✓ 真修了, 但只修了一个角色 |
| 显示奇怪 | ❌ 没修 | 删 ledger-spread 改 scene-entry | 中央仍然是空白纸面, 没有主视觉 |
| 菜单切换和衔接 | ❌ 没修 | 加 28px rose axis + sticky indicator | 一根线不解决问题; indicator 在空态根本不显示 |
| 整体烂 | ❌ 没修 | 没动 | 截图证明仍然烂 |

---

## 1. E10 截图诊断 (5 处失败)

### 1.1 中央是巨大的空白纸面 (致命)

`experience-e10-1280.png` 中央区域 (`<article class="scene-entry">` 容器) 是 **100% 空白 archive-paper 底色**, 没有 message 内容, 没有 illustration, 没有 CTA, 没有 placeholder. **记录**: 用户进入 `/experience` 的第一眼看到的就是 1.6MB 像素的 archive-paper 空白. 这就是 "整体烂" 的字面意义.

**根因**: E10 的页面组合假设中央会有 message 流, 但 message 流只在新对话启动后才填满. 0-message 态 → 空白. E9 ledger-spread 时代同样空白, 但 E9 的空白上有 ink-stamp 圆章 + chapter-rule ribbon + 双页装订线 — 这些视觉锚点暗示"档案正在等第一条记录". E10 删了所有这些, 留纯空白.

### 1.2 record-folio 是 6 格 "未登记" 墙 (高优)

`record-folio` 在中央顶部, 6 个 cell (案号 24A3A547 / 卷 1 / 当下时间 / 在场人物 / 当前地点 / 当前任务) 全部 "未登记" / "未进入" / "未记入". **6 格空白 form fields** 比没有更糟 — 用户感觉"我在填一个永远空着的表".

**根因**: 6 cell 是 record-book 信息密度的假设 (案卷格式), 但实际 0-message 时所有 cell 都空, 看起来像空 form. record-folio 是 6A E3 时代设计的, 当时假设"用户已经有冒险数据, record-folio 显示". 0 状态下没有 fallback 视觉.

### 1.3 右栏是空 stat cards (致命)

右栏 `<aside class="sidebar">` 显示 3 个 dossier section (人物 / 地点 / 剧情):
- 人物: 单人物卡 "主角色" + 一根 平稳 进度条 (没数据)
- 地点: 0/0 grid + "暂无地点数据" 文字
- 剧情: 全空

**3 个 dossier 全是空**, 而且 dossier 之间是 border-top 分隔, 视觉上像 3 个相同 empty state 堆叠.

### 1.4 28px vertical axis 完全看不见 (中)

`kao.css .theme-kao .game-page::before { left: 28px; ... }` 这条共享 axis 在 record-folio 的 `border` 后面被遮住, 在 sidebar 区域又被 sticky elements 切断. 截图里看不到一条连续的线. axis 设计意图是 "贯穿三区域", 但实现上 record-folio 自己有 `border + clip-path`, sidebar 也有自己的 border, axis 只是"在他们之间偶尔露出来一段".

**根因**: axis 假设 record-folio / scene-stage / sidebar 是 **连续的 vertical strip**, 但实际每个区域都是独立的 visual container with own border/clip-path. axis 没穿透它们的 visual hierarchy.

### 1.5 sticky indicator 完全不显示 (中)

`scene-stage__indicator` 条件 `v-if="sceneIndicatorVisible"` (`sceneStageIndicator.total > 0`), 0-message 态下不显示. 用户在 0-message 态打开页面根本看不到这个 indicator. 这就是 "菜单衔接不行" 的实例: 衔接设计是为有内容的状态服务的, 无内容时它就不存在了, 用户更没方向感.

### 1.6 dark mode 几乎不可区分 (低)

`experience-e10-dark-1280.png` 和 light 几乎一样. `--archive-paper` 在 dark 下自动覆盖为 `#eee3d2` (浅米色), 跟 light 几乎一致. dark mode 验收失效.

---

## 2. E10 哪些改动值得保留 / 哪些 revert

### 2.1 保留 (3 个零件都是独立 improvement)

| 改动 | 为什么值得保留 |
|---|---|
| `--font-body` token (kao.css) | 系统 serif fallback 解决了 "字体不行" 的部分. 跨 3 page 都受益, 后续可铺到 Writing / Notes 正文 |
| `.theme-kao .text-main { font-family: var(--font-body); }` (GamePanel scoped) | 真改了正文字体, 用户原话 "字体不行" 修了 |
| `displayMessages` 单列 computed (替代 `messageSpreads` 双页) | 结构上更简单, 单列流 = 真"读场景记录"而非"翻对开页". N6F2 dual-mode + bringToFront + onSlipClick 等 sub-composable 改动也保留 |

### 2.2 Revert (3 类改动没解决问题或引入了新问题)

| 改动 | 为什么 revert |
|---|---|
| 删 ledger-spread → scene-entry 单列 entry | 修了 1 个用户抱怨 ("显示奇怪" 的双页排版), 但留下了 4 个新问题 (空白纸面 / 无 hero / 无 progress / axis 不可见). 应该重做, 不是把 ledger-spread 删了就够 |
| `kao.css .game-page::before` 28px shared vertical axis | 设计意图正确, 实现失败 — record-folio / sidebar 的独立 visual container 把 axis 切断了. 应该用更可见的方式 (顶部 section progress bar, 不用 1px line) |
| `Experience.vue` sticky `.scene-stage__indicator` | 0-message 态不显示, 设计对有内容态有效, 对 0 态无用. 应该改为 "section state" indicator (空态显示 "档案空白 · 等候第 1 条落笔", 有内容态显示 "第 N 条 / 卷 X / 共 M 条"), 永远显示 |

### 2.3 Decision: 部分保留 + 部分 revert

具体 revert 操作 (Codex 主控执行, 不在本 worker scope):
- **保留**: kao.css `--font-body` token + GamePanel.vue `.text-main` font 改 + `displayMessages` computed 保留
- **Revert**: kao.css `.theme-kao .scene-stage__indicator` (删) + `.theme-kao .game-page::before` 28px axis (删) + Experience.vue `<div class="scene-stage__indicator">` (删) + `sceneStageIndicator` computed (删) + scoped base CSS
- **继续**: GamePanel.vue 的 `<article class="scene-entry">` 单列结构保留 (这是真改进)
- **继续**: 删 `chapter-rule / ledger-spread / __sheets / spine / page-header / ink-stamp / continued-mark` 全部 (E9 双页机制本身有问题, 删除对)

**这条决策的本质**: E10 的"字体+scene-entry 单列"是真改进, 留下; E10 的"axis + indicator"是装饰性改动, 没解决问题, revert.

---

## 3. 方案 A — 保守修复 (在 E10 基础上重排, 不重做架构)

### 3.1 思路

E10 架构基本正确, 失败的是**填充物**. 修中央空白 + 修右栏空 stat + 修 indicator 隐藏问题.

### 3.2 改动清单 (3 文件)

| 文件 | 改动 |
|---|---|
| `src/pages/Experience.vue` | (1) 加 empty-state hero block: 0-message 态时中央显示 `<CharacterPortrait pose-id="narrator" size="hero">` (5B v0.1 narrator 立绘已经 ship, 用上) + 简短 greeting "档案空白, 等候第 1 条落笔" + 3 个 quick action 按钮 (新建 / 续写 / 速记). 有 message 时 hero block 自动折叠到顶部 80px strip (留个 character + 当前任务 1 行). (2) 把 record-folio 从 6 cell 缩到 1 hero cell "当前任务 · 卷 1", 其他字段下放到 sidebar (案号 → sidebar footer, 时间 → sidebar 时间线, 人物 → sidebar 人物 section, 地点 → sidebar 地点 section, 任务 → 主 hero cell). (3) sticky indicator 改为 always-on: 0-message 态显示 "档案空白 · 卷 1 · 等候第 1 条", 有 message 态显示 "卷 1 · 第 N 条 / 共 M 条". |
| `src/components/StatusBar.vue` + `GeographyPanel.vue` + `QuestLog.vue` | (1) 0-data 态不显示空白 stat card, 而是显示 inline hint "暂无人物 · 在对话中遇到的角色会自动出现在这里". (2) 有 data 时显示 actual card content (人物卡有 portrait + name + 当前状态; 地点卡有 mini map; 剧情卡有 entry list). 改成**功能性 section**, 不是统计 dashboard. |
| `src/components/GamePanel.vue` | 0-message 态时 scene-entry 容器显示 "等待第 1 条 message" 引导卡片 (有 character portrait + 提示文字 + quick prompt examples), 而不是空 paper. 有 message 时正常渲染 scene-entry. |

### 3.3 字体方案 (A)

| 位置 | Token | 字号 |
|---|---|---|
| 中央 message 正文 (`.text-main`) | `--font-body` (E10 已 ship) | 16px / 1.75 |
| 中央 message kicker (`.msg-item.user .text-main::before` 我·) | `--font-display` LXGW (保持手稿感) | 14px / 500 |
| 角色名 + 时间 (`.display-name` / `.msg-time`) | `--font-sans` | 11px / italic |
| 角色名 sidebar 人物卡 (`<CharacterPortrait>` caption) | `--font-display` LXGW | 10px |
| 时间 sidebar / indicator tabular nums | `--font-sans` + `font-variant-numeric: tabular-nums` | 11px |
| 按钮 (新建 / 续写 / 速记 / 输入区) | `--font-sans` | 13px |
| 右栏 section 标题 (人物 / 地点 / 剧情) | `--font-display` LXGW (archive 章名) | 12px / 500 / letter-spacing 0.16em |
| 中央 empty state hero 提示文字 | `--font-body` (主) | 18px / 600 |
| record-folio 主 cell 值 | `--font-display` LXGW (手稿感) | 16px |

### 3.4 菜单衔接方案 (A)

- **共享 vertical axis**: 删 28px rose line, 改 3 区域**统一顶部 progress bar** (`<div class="section-progress">` 顶部 sticky, 显示 "卷 X · 第 Y 条 / 共 Z 条" + 5-cell 进度条 [开卷 · 当前 · 在场 · 发生 · 落笔]). 这条 bar 在 3 个区域上方, 是真正的 "section-to-section continuity" (Lusion 词汇, 但用进度条实现, 不是装饰线).
- **record-folio / sidebar 衔接**: record-folio 1 个 hero cell "当前任务 · 卷 1" → 用户点 cell 进入 sidebar 的 "事件卷" section 看具体任务. 这是 functional 衔接, 不是视觉衔接.
- **左 drawer (None in current) / sidebar 衔接**: Experience 页没有左 drawer, 只有右侧 sidebar. 跨区域 continuity 走顶部 progress bar + 中央 message stream 的 content type tag (每条 scene-entry 顶部 marginalia 的 `roleStamp` 已经标了 "我·落笔" / "旁白·续页" / "档案员·备忘" — 这是 functional 标签, sidebar 同步显示当前 role).

### 3.5 借鉴 Lusion 的地方

- **Strong viewport composition** (R3 §1.2): 顶部 sticky bar + 中央 hero + 中央 message stream + 右栏 dossier 4 段, 各占 viewport 特定比例, 不留空白. Lusion 的 project-card 是 viewport-quadrant, 我们用比例分配.
- **Item rhythm** (R3 §3.4): 每条 scene-entry 的 marginalia / role / content 有固定节奏, sidebar 每 section 有相同节奏 (label / list / empty hint), 不破节奏.
- **不抄**: WebGL / canvas / cursor trail / 整页 transform / preloader.

### 3.6 风险

- **风险**: empty state hero 是新组件, 需要 `CharacterPortrait` 接受 `size="hero"` 参数 (5B v0.1 narrator 立绘可用). 如果 hero 立绘没 ship, fallback 到 illustration.
- **风险**: StatusBar / QuestLog / GeographyPanel 改 empty state 文字会破既有 contract (需要同步 uiPolish test).
- **优势**: 不动 GamePanel scoped CSS 的 scene-entry 实现 (已 ship + 测试过), 只补 empty state.

---

## 4. 方案 B — 结构重做 ("现场控制台 + 记录流" 一屏工作台) ★ 推荐

### 4.1 思路

E10 失败的根本原因不是"字体"或"axis 看不见", 而是**页面组合 (composition) 还是"顶部 record-folio + 中央空 ledger + 右侧 dossier" 的旧结构**. 这是 E2 时代 (2026-06-19) ship 的 "Site Record Book" 改写 — 6-cell 顶部 + record 主体 + right rail — 当时是进步, 但 0-message 态暴露了: 这个 layout 假设有内容才成立, 没内容就是空.

**结构重做** = **single-screen workstation composition**, 类似 Lusion 的 project hero (R3 §1.2 5 层 z-index) + IDE (left rail / editor / right rail). 一屏 4 段同时可见, 每段都有内容 (空态也有功能性 placeholder, 不是空白).

### 4.2 页面组合 (4 段, 比例 18:54:28)

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOP STRIP (80px sticky)                                              │
│ 卷 1 · 案号 24A3A547 · 当前任务: 未登记 · 第 1 条 / 共 1 条          │ ← 5-section progress bar
├──────────────────────┬──────────────────────────┬───────────────────┤
│ LEFT RAIL (260px)    │ CENTER STAGE (1fr)        │ RIGHT RAIL (300px)│
│                      │                          │                   │
│ HERO BLOCK           │ HERO CHARACTER (320x320) │ DOssIER STACK     │
│ 5B v0.1 narrator     │ + 3 quick action CTA     │ ┌───────────────┐ │
│ portrait + 旁白 GM  │ (续写 / 速记 / 切场景)  │ │ 人物 1/3      │ │
│ kicker 1 行         │                          │ ├───────────────┤ │
│                      │                          │ │ 地点 0/0      │ │
│                      │ ────────────────────     │ ├───────────────┤ │
│                      │ MESSAGE STREAM (1fr)    │ │ 剧情 0/0      │ │
│                      │ scene-entry #1           │ └───────────────┘ │
│                      │ scene-entry #2           │                   │
│                      │ ... (scrollable)         │                   │
│                      │                          │                   │
│                      │ ────────────────────     │                   │
│                      │ INPUTAREA (sticky bottom)│                   │
│                      │ [textarea + 4 个动作]    │                   │
└──────────────────────┴──────────────────────────┴───────────────────┘
```

**4 段同时可见, 一屏不滚动.** 0-message 态时 message stream 显示 1 个引导 entry ("档案空白 · 等候第 1 条落笔" + 3 quick prompts), 不空.

### 4.3 Lusion 借鉴的具体点

- **Strong viewport composition** (R3 §1.2): 一屏 4 段, 各占固定比例, 不留空白 (Lusion: project-card 占 viewport-quadrant). 我们的对应: 中央 HERO CHARACTER (320×320) 是视点锚点, 用户进 `/experience` 第一眼看到 narrator 立绘 (5B v0.1 ship).
- **Section-to-section continuity** (R3 §3.3): 顶部 TOP STRIP 是真正的 "section" 锚点 (Lusion 的 scroll indicator), 显示卷/任务/条数. 三个区域**共享同一根水平 baseline** — 顶部 strip 下方都是 `top: 80px; bottom: 0` 的区域, 同一 viewport 上下文.
- **Per-item data-color** (R2 §3.1 Lusion 最值钱): sidebar 人物 / 地点 / 剧情 cards 每条带独立 data-color (kind / region / arc). 我们已有 7 类 kind token + 4 个 arc token (need to add), 不重发明.
- **Strong typography hierarchy** (R3 §1.4): display (LXGW 28px) / body (font-body 16px) / meta (sans 11px) 三层 opacity 阶梯.
- **不抄**: WebGL / canvas / cursor trail / 整页 transform / preloader.

### 4.4 改动清单 (4 文件)

| 文件 | 改动 |
|---|---|
| `src/pages/Experience.vue` | **重写 template**: 拆 `<div class="game-layout">` 为 `<div class="ws-layout">` (workstation), 内部 4 段 grid: `ws-topstrip` + `ws-left-rail` + `ws-center-stage` + `ws-right-rail`. 删 `.record-folio` 6-cell grid (下放到 right rail 或 top strip). 删 `<aside class="sidebar">` 3-section dossier, 改成 right rail 单一 stack (`ws-right-rail`). GamePanel 从中央移到 ws-center-stage. InputArea 从底部移到 ws-center-stage 的 sticky bottom. |
| `src/components/GamePanel.vue` | (a) hero character portrait block 在 ws-center-stage 顶部: `<CharacterPortrait pose-id="narrator" size="hero">` + 3 quick action buttons (续写 / 速记 / 切场景). 0-message 态显示引导 entry "档案空白 · 等候第 1 条落笔", 1+ message 态显示 hero + scene-entry 流. (b) `displayMessages` 保留. (c) `--font-body` 保留. |
| `src/styles/themes/kao.css` | (a) `.theme-kao .ws-topstrip` sticky 80px top: 卷 / 案号 / 当前任务 / 进度 5 cell. (b) `.theme-kao .ws-layout` grid-template-columns `260px 1fr 300px` (desktop), `@media (max-width: 980px)` 改 `1fr` (left rail collapse to top strip). (c) 删 `.theme-kao .game-page::before` 28px axis (本 plan §2.2 revert). (d) 删 `.theme-kao .scene-stage__indicator` (本 plan §2.2 revert). (e) `.theme-kao .ws-right-rail` dossier stack: 人物 / 地点 / 剧情 3 section, 每 section header LXGW 12px + 实际内容 (empty 态显示 inline hint). |
| `src/components/{StatusBar,GeographyPanel,QuestLog}.vue` | 重写 empty state + 加入 ws-right-rail section 适配. 不动核心功能, 只改视觉 wrapper. |

### 4.5 字体方案 (B) — 强类型分层

| 位置 | Token | 字号 | 用途 |
|---|---|---|---|
| **DISPLAY** (手稿感) | | | |
| `.ws-topstrip__case` | `--font-display` LXGW | 14px / 500 | 案号 / 当前任务主文字 |
| `.scene-entry__stamp` | `--font-display` LXGW | 10px / italic | 角色印章 (我·落笔 / 旁白·续页 / 档案员·备忘) |
| `.msg-item.kicker::before` | `--font-display` LXGW | 14px / 500 | 我· / 旁白· / 档案员· |
| `.ws-right-rail__section-title` | `--font-display` LXGW | 12px / 500 / letter-spacing 0.16em | 人物 / 地点 / 剧情 section 名 |
| **BODY** (宋/serif 可读) | | | |
| `.text-main` | `--font-body` Songti/Georgia | 16px / 1.75 | message 正文 |
| `.ws-left-rail__kicker` | `--font-body` | 14px / 600 | 旁白 GM kicker |
| `.scene-entry__no` | `--font-body` | 12px / 500 | 第 N 条 section number |
| **META** (sans) | | | |
| `.ws-topstrip__meta` | `--font-sans` | 10px / letter-spacing 0.12em | 顶部 meta (案号 / 时间 / 进度) |
| `.display-name` | `--font-sans` | 11px / italic | 角色名 |
| `.msg-time` | `--font-sans` | 11px / italic / tabular-nums | 时间 |
| `.ws-right-rail__stat` | `--font-sans` | 10px / tabular-nums | 0/0 / 1/3 stat numbers |
| **INTERACTIVE** | | | |
| button text | `--font-sans` | 13px | 续写 / 速记 / 切场景 / 记入 |
| input placeholder | `--font-sans` | 13px / italic | "输入你的行动..." |
| textarea | `--font-body` | 16px / 1.65 | 用户输入正文 |

**字体规则**: DISPLAY 永远 LXGW (装饰, 不读长文). BODY 永远 system serif (长文, 可读). META 永远 sans (短, 11px 以下). INTERACTIVE 看场景 (按钮 sans, 长输入 serif). 这 4 层是 **互斥的**, 任何位置只用 1 层, 不会 "display + body 混用".

### 4.6 菜单 / 右栏 / 中央 衔接方案 (B)

- **共享 anchor**: `ws-topstrip` 是唯一的 section anchor (卷 X / 当前任务 / 第 N 条 / 共 M 条 / 进度条 5 cell). 3 个区域都在 topstrip 之下, 都从 topstrip 读取 `currentSection / currentVolume / totalCount` (从 `sceneStageIndicator` computed 派生). 用户视野从顶部 80px 处向下, 永远知道"我在卷几 / 第几条".
- **左 rail / 中央 衔接**: 左 rail hero character 是 narrator 立绘, 中央 hero character 也是 narrator 立绘 (same portrait). 用户在两处看到**同一个 narrator 角色**, 知道"左边的 GM 跟中间是同一个人". 这是 functional 衔接, 不是视觉线.
- **中央 / 右栏 衔接**: 中央 scene-entry 顶部 marginalia `roleStamp` (我·落笔 / 旁白·续页) 跟右栏人物 section 自动高亮当前 active 角色. user 发 user message → 右栏人物 section 高亮 user 角色; assistant message → 高亮 narrator 角色. 这是 functional 衔接 (state-driven highlight).
- **快捷动作 / 输入 衔接**: InputArea 3 个 quick action (续写 / 速记 / 切场景) 跟 ws-topstrip 当前任务联动. 当前任务为空 → 续写按钮激活; 当前任务有 active quest → 切场景激活. state-driven CTA.

### 4.7 风险

- **风险 1**: 重写 `Experience.vue` template 是大改动, 可能破既有 contract. 必须先加 uiPolish E11 contracts (ws-layout / ws-topstrip / ws-right-rail 等) 再实施, 逐步替换.
- **风险 2**: StatusBar / QuestLog / GeographyPanel 重写 empty state 会破既有 contract. 同上, 加 E11 contracts 锁新结构.
- **风险 3**: CharacterPortrait size="hero" 可能没 ship. 5B v0.1 narrator 立绘是 ship 的 (`kao-archive-narrator.webp`), 但 CharacterPortrait 是否支持 size="hero" 不确定. 实施前先 grep.
- **风险 4**: 一屏 4 段在小屏 (640px) 会挤. mobile fallback: left rail collapse 到 top strip, right rail collapse 到 bottom, 中央 message stream 占满. `grid-template-columns: 1fr` 在 ≤980px.
- **风险 5**: 工作流变更 (从单 record folio → 4 段 workstation) 影响 user mental model. 需要 ship 后让用户跑一次, 反馈是否 "更清晰".

### 4.8 验证截图 (B)

3 张必跑:
- `experience-e11-1280.png` — 1280×800, 4 段 workstation layout, hero character portrait visible, topstrip with 5-cell progress, right rail dossier with 3 sections
- `experience-e11-long-1280.png` — 1280×2200, 多 messages 时 scroll, scene-entry 单列流, right rail dossier 跟随 scroll (sticky)
- `experience-e11-640.png` — 640×800, mobile, left rail collapse, 1fr center

**已知限制**: 截图 typing-into-InputArea 仍可能失败 (per E10 report §5). ship 后用户跑浏览器能看到完整效果.

---

## 5. 推荐 — 方案 B

### 5.1 为什么 B 不 A

| 维度 | A 保守修复 | B 结构重做 ★ |
|---|---|---|
| **修中央空白** | 加 empty state hero block (1 文件改) | 一屏 4 段 composition, 没有中央空白位置 (架构层消除) |
| **修 record-folio 6 格 "未登记"** | 缩到 1 cell, 其他下放 (1 文件改) | topstrip 5 cell, 没有 6-cell form wall |
| **修右栏空 stat** | 改 empty state 文字 (3 文件改) | dossier 改 functional section (人员 / 地点 / 剧情 各是 card list, 不是 stat card) |
| **修 axis 不可见** | 改顶部 progress bar (1 文件改) | 共享 topstrip, 3 区域都从 topstrip 读 anchor |
| **修 indicator 隐藏** | 改 always-on 文字 (1 文件改) | topstrip always-on, 0 态显示 "档案空白 · 卷 1 · 等候" |
| **改动 scope** | 4 文件, 改动量小 | 4 文件, 改动量大但都是 template + CSS |
| **破既有 contract 风险** | 中 (1 文件加 contract, 3 文件改 empty state) | 高 (template 大改, contract 同步) |
| **修用户"整体烂"** | ❌ 部分 (中央仍有空白纸风险, 0 态 hero 弱) | ✅ 完全 (4 段都填满) |
| **Lusion 借鉴深度** | 浅 (progress bar 借鉴 top strip) | 深 (4 段 composition 借鉴 Lusion viewport-quadrant + per-item color + section anchor) |
| **风险** | 低 | 中-高 (scope 大) |
| **边际收益** | 中 (修了 4 个问题中的 3 个, 第 4 个仍弱) | 高 (修了 4 个问题 + 引入工作台 composition) |
| **后续 polish 路径** | 还要再做 1-2 轮修残余 | 1 轮 ship 后可接 5B v0.2 / 立体感 / runtime 收口 |

### 5.2 实施次序

1. **Week 1**: 写 E11 spec (本 plan §4 详细化) + Codex 拍板
2. **Week 2**: 实施 E11 (4 文件改) + uiPolish contracts (≥ 12) + 3 截图 + 报告
3. **Week 3**: 真手测 7 天 + 用户反馈, 调整

### 5.3 文件边界

| 文件 | 改? | 备注 |
|---|---|---|
| `src/pages/Experience.vue` | ✅ 重写 template | **本 slice 核心** |
| `src/components/GamePanel.vue` | ✅ 加 hero block + 改 scoped CSS | hero 是新元素, scene-entry 保留 |
| `src/styles/themes/kao.css` | ✅ 删 axis + indicator, 加 ws-* rules | 删 2 段, 加 4 段 |
| `src/components/{StatusBar,QuestLog,GeographyPanel}.vue` | ✅ 改 empty state + 接 ws-right-rail | scoped CSS 小改 |
| `src/components/folio/CharacterPortrait.vue` | ❌ 不改 (已 ship, hero size 通过现有 size prop 复用) | — |
| `src/components/InputArea.vue` | ❌ 不改 (放 ws-center-stage 底部, 用现有 wrapper) | — |
| `src/components/folio/*` | ❌ 不改 | — |
| `src/components/{GmPersonaLauncher,AdvisorPanel,ImageGenRail}.vue` | ❌ 不改 (浮层组件, 不在 4 段内) | — |
| `src/stores/**` / `src/services/**` / `src/router/**` | ❌ 不改 | — |
| `src/pages/{WelcomeView,OpeningPage,Writing,Notes}.vue` | ❌ 不改 | — |

### 5.4 测试

| 命令 | 期望 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` | ≥ baseline + 12 E11 contracts pass |
| `npm run build` | clean |
| `git diff --check` | clean |
| 3 截图 (`experience-e11-{1280, long-1280, 640}.png`) | 落档, 一屏可见 4 段 + 中央 message 流 |
| forbidden patterns | 0 `:global(.theme-kao)` / 0 `!important` / 0 broad `:deep(*)` / 0 random raw hex in new rules |
| mechanism trigger | gamePanelMechanism.test.js 1/1 pass (E9-FIX guard 保留) |

### 5.5 Ship commit (Codex 用, 不在本 worker scope)

```
style(experience): E11 Experience 现场控制台 + 记录流

结构重做 (E10 修复失败后):
- Experience.vue: 4 段 workstation layout (topstrip + left rail +
  center stage + right rail), 各占 viewport 特定比例. 删 record-folio
  6-cell form wall + sidebar 3-dossier stat stack.
- GamePanel.vue: 加 hero block (5B v0.1 narrator portrait + 3 quick
  action), scene-entry 单列流保留. 0-message 态显示引导, 不空.
- kao.css: 删 28px shared axis (E10 不可见) + scene-stage__indicator
  (E10 隐藏), 加 ws-topstrip + ws-layout + ws-right-rail rules.
- StatusBar / QuestLog / GeographyPanel: 改 empty state (functional
  hint 不再是 "0/0" stat card).

保留 (E10 留下来的好改动):
- kao.css --font-body token (Songti / Georgia 系统 serif fallback)
- GamePanel.vue .text-main font-family: var(--font-body)
- GamePanel.vue displayMessages 单列 computed (替代 E9 messageSpreads)
- GamePanel.vue scene-entry + marginalia 结构 (单列可读流)

Revert (E10 不可救药的改动):
- kao.css .theme-kao .game-page::before 28px axis
- kao.css .theme-kao .scene-stage__indicator sticky bar
- Experience.vue sceneStageIndicator computed + 条件显示

字体分层 (4 层互斥):
- DISPLAY: --font-display LXGW 装饰位 (topstrip / marginalia stamp / kicker / section title)
- BODY: --font-body system serif 可读 (message 正文 / hero text / section number)
- META: --font-sans 短 (案号 / 角色名 / 时间 / stat / tabular-nums)
- INTERACTIVE: button sans 13px / textarea serif 16px

菜单 / 右栏 / 中央 衔接 (functional 不是装饰线):
- topstrip 5-cell progress 是唯一的 section anchor (卷 / 案号 / 任务 / 条数 / 进度)
- 左 rail narrator portrait = 中央 hero narrator portrait (functional: 同一人)
- 中央 scene-entry roleStamp → 右栏人物 section 自动高亮 active 角色
- InputArea 3 quick action 跟 topstrip 当前任务 state-driven 联动

硬约束:
- 0 store / 0 service / 0 router mutation
- 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex
- 0 WebGL / canvas / 3D scene (Lusion R2 §5 + R3 §5 #2 禁区)
- E9-FIX mechanism trigger 保留: <div class="text-wrapper"
  @click="onTextWrapperClick(index, msg, $event)">

Verification: uiPolish 12 E11 contracts pass + 1 gamePanelMechanism
pass + build clean + diff --check clean + 0 forbidden patterns
Screenshots: experience-e11-{1280, long-1280, 640}.png 落档
```

---

## 6. Codex 决策路径

1. **ACCEPT B (推荐)**: 写 E11 spec → ship → 用户跑 1 周反馈 → 调. 1 轮解决.
2. **ACCEPT A**: ship A → 用户跑 1 周反馈 → 发现仍有空白 → 走 B. 2 轮解决.
3. **DEFER**: E10 落档 (跟 R8 verdict 一致), 不再 polish, 转内容流 (5B v0.2 立绘 / 立体感 plan / runtime 收口).
4. **REJECT 全部**: E10 + 本 plan 都 reject, 永久不做 Experience 重做, 转内容流.

---

## 7. 关键参考

- **当前 E10**: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-E10.{plan,report}.md` + `experience-e10-{1280,long-1280,dark-1280,640}.png`
- **Lusion 调研**: `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` (8 条可迁移原则 + 5 条禁区)
- **历史 verdict**: `UI-R7-visual-direction-review.md` (ONE WRITING ROUND) + `UI-R8-stop-continue.md` (STOP NOW) — 都被 E10 + 本 plan 推翻了
- **E9 ledger-spread**: `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` — E10 删 ledger-spread 是对的, 但删了之后没有补 hero, 留下空白
- **Project rules**: `AGENTS.md` (ui-style-check / testing-verification / commit-conventions / docs-status-handoff)
- **Theme**: `.theme-kao` / `.theme-legacy` 双变体 (本 plan 不动)

---

**END OF UI-E10-REJECT-PLAN** — 等 Codex 拍板决策路径. 推荐 ACCEPT B.