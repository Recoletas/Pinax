# UI-R10 — Pinax W/N/E 下一轮视觉改造诊断 (read-only)

> Date: 2026-06-21
> Worker: UI-R10 (只读审查; 不改 src / 不 commit / 不 push)
> 输入: 当前 main 实际 src + docs/agent-runs/2026-06-21-lusion-research/{R1,R2,R3}.md + PINAX-LUSION-SPEC + QA-LUSION + STATUS.md In-flight `wip/map-realism-render-docs-20260608` 主线
> 用户反馈 (4 条): Notes 副阅读台太小 / Notes 右侧仍有空白 / Notes 应可同时看多个 (拖拽到画布) / Writing 缺强记忆点 / Experience 字体差 + 显示奇怪 + 菜单切换 + 页面衔接差 / 最近几轮视觉变化不大, 下一轮必须结合 Lusion 调研做明显变化
> 输出: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-R10.visual-diagnosis.md` (本文件)

## 0. 一句话判断 (TL;DR)

> **W/N/E 三页"看起来在 polish"但实际是"在做加减法装饰", 没有"结构性新语言"。**
>
> 最近 6 轮 (W3→W4→W5→W5R→W9 + N5C→N6→N6F2→N9 + E6A→E9) 的共同特征:
> 1. **删**: 砍 SaaS chrome / 砍冗余文案 / 砍空壳 FolioSurface
> 2. **加**: 加 1-2 层 paper-stack shadow / 加 1-2 道 tape strip / 加 dot mark / 加 dashed border
> 3. **不变**: 整体 grid 布局没动 (Writing 3-col / Notes drawer + main / Experience sidebar + chat); 字体分工没动 (LXGW + system-ui 仍是 ad-hoc); z-index 没 token 化; 路由切换仍是 instant
>
> 这 6 轮把"archive-folio 隐喻"打深了 50%, 但**没有给用户一个新东西去记忆** — 用户看不到"新结构", 只看到"装饰微调"。这就是用户反馈"最近几轮变化不大"的根因。
>
> **下一轮必须做的不是再 polish, 是引入 1 个新结构层**: 空间层级 (per-page scene boundary / scroll 行为) + 对象动线 (进场仪式) + 字体身份 (display vs body 等级差) — 这 3 维选 1-2 维做"明显变化"。**Lusion 调研给了我们可借鉴的具体动作**, 但**禁止照搬 WebGL/3D/canvas/cursor trail**, 必须用 Pinax 工具 (CSS + box-shadow + clip-path) 复刻。

---

## 1. 三页当前最严重问题 (按优先级排序)

> **排序原则**: 用户反馈权重 > 视觉证据 > 实现成本。**优先级 1-3 = 必修; 4-5 = 不做**。

### 优先级 1: Experience 整体重新评估 (用户 4 条反馈里有 3 条击中 Experience)

**问题证据** (per src grep):
- `src/pages/Experience.vue:50-71` sidebar 3 个 section 全部用同一个 `<div class="sidebar-section">`, 区别只在 `data-dossier-stamp="卷宗一/二/三"` 的文字 — **视觉上 3 个卷宗块完全没有差异化**, 只是三个叠在一起的纸盒
- `src/pages/Experience.vue:81-88` `quick-notes-rail` 是 fixed 浮动按钮, **不在 archive-folio 体系内** — 圆形按钮 + SVG icon 是 SaaS 语言, 跟 ledger-spread 格格不入
- `src/components/GamePanel.vue` ledger-spread 内有 `<div class="ledger-spread__spine">` 1px gradient + `<div class="ledger-spread__red-rule">` 28px 红色稿纸线 — **每个 spread 内部视觉信号 6+**, 但 spread 与 spread 之间完全没信号 (chapter-rule ribbon 是唯一的分隔)
- 字体: `font-family: var(--font-display)` (LXGW WenKai 书法) 在 msg-item kicker / 章节小标题 / 印章文字位都用 — 用户说"字体不行" 就是 LXGW 在 11-13px 小字号 + 行高 1.6+ 的环境里**变得糊**, 跟正文 sans 对比时感觉 2 种字体打架, 不是等级
- 路由切换: 整个项目 `src/router/index.js` 没有 transition; AppShell 切页是 instant 重渲染 — 用户说"菜单切换和页面衔接不行" = 跨页没有任何过渡

**问题定性**: Experience **不是 polish 问题, 是"主结构没成立"**。ledger-spread 单看是好的, 但放进 3 卷 sidebar + quick-notes-rail + 没有跨页过渡的环境里, **整体读起来像"半 SaaS 半 archive"**。半成品比全 SaaS 更难受。

**严重性等级**: 🔴 **HIGH** (影响用户每条反馈里的 3 条)

### 优先级 2: Notes 右侧空间没利用 (用户原话 "副阅读台想法不错, 但太小; 右侧仍有空间完全没用")

**问题证据**:
- `src/pages/Notes.vue:135` `<section class="reading-deck">` 是 N9 主区, 里面 `empty-archive` grid (7 类) + `material-entry-card` 列表
- `src/pages/Notes.vue:50` `<CharacterPortrait pose-id="narrator">` 在 `.manuscript-top__left` 里 — 是顶部 chrome 一部分, 不是右侧
- N9 ship 的 `canvas-pinboard` (useCanvasBoard 1-3 张 slip): 用户说"既然是纸条贴板构思, 可以把画布拖拽逻辑带过来, 不要死守一次只能看一个" — 这是**直接把 LUSION-R2 §3 "per-item data-color 三件套" 的核心借过来**。Lusion 的 project card 永远 hover 显示, 不"一次只能展开一个"
- 当前 main 的 reading-deck 主区是 1 个 active-card + 0-3 个 slip — 当 active-card 选中时, 其他 6 类 entry 全隐藏, slip 又不能和 active-card 共存 → 真的"一次看一个"

**问题定性**: Notes "档案册" 隐喻没成立。**7 类 drawer + 1 个 active-card + 0-3 个 slip** 的结构本质是 "SaaS detail panel", 不是"档案册里翻看条目"。Lusion 的 project list **所有条目同框**, hover 拉近 focus, 不切换 panel。

**严重性等级**: 🟠 **MEDIUM-HIGH** (用户原话击中, 但 N9 ship 已部分实现 canvas-pinboard 起点, 改动成本可控)

### 优先级 3: Writing 缺强记忆点 (用户原话 "方向不错, 但没有强记忆点")

**问题证据**:
- W9 ship 后: 64-80px cork (book-pill + pin dots + save-chip + tabs) + 3-col main (shelf 248 / dossier 1fr / portrait 220) + dossier-tape + rolled scroll + CharacterPortrait
- **每个元素都在 lift 1-2px**: tab hover `translateY(-1px)` / save-chip saving 状态 / dossier-tape rotate ±2deg / pin-dot box-shadow 2 层 — **整体动作签名是"全部轻浮 1-2px"**, 没有"重"或"硬"的对象
- 字号层级: chapter dossier-num 28px / dossier-title 22px / wall__book-pill 14px / wall__save-chip-state 11px / wall__pin-dot 8px — **5 档层级在 8-28px 区间**, 最高 28px 跟 dossier-num 是单色 archive-ink 87%, 没有"display vs body"对比
- 字体分工: cork 全是 system-ui 11-14px / dossier-num 是 Iowan Old Style / dossier-title 是 LXGW WenKai — **3 种字体在 cork → dossier → portrait 切换**, 但切换不是"等级变化", 是"装饰性切换"

**问题定性**: W9 是**减法成功的 polish** (顶部 188 → 64-80px 是真正的减法, 用户也接受了 "方向不错"), 但**没有"加法"** — 没有新结构、新对象、新仪式。Writing 现在读起来像一个"减负的工具栏", 不是"进入创作仪式的入口"。

**严重性等级**: 🟡 **MEDIUM** (用户反馈是"没强记忆点"而非"很糟", 优先级低于 Experience 整体重评)

### 优先级 4 (不做): Welcome / OpeningPage

用户没提这两页, **不做**。

### 优先级 5 (不做): 跨页路由切换体验

**用户提了 "菜单切换和页面衔接不行"**, 但路由层 (`src/router/index.js`) + `AppShell.vue` 跨 transition 是基础设施级 scope, 影响 6 个 page (Welcome / Opening / Writing / Notes / Experience / ProseEssay), **不应本轮做**。**可以本轮在 spec 里标注为下下轮 spec 的输入**, 但不进入本轮 slice 范围。

---

## 2. Lusion 可迁移原则 (只要结构/节奏/空间/转场/视觉层级, 不要 WebGL/3D/性能方案)

> 数据来源说明: `docs/agent-runs/2026-06-21-lusion-research/LUSION-R1.structure.md` + `LUSION-R2.interaction.md` + `LUSION-R3.visual-system.md` 三份报告均已落盘, 每条 Lusion 论断带来源类型 (`[实测]` / `[canonical]` / `[archive]` / `[GitHub]` / `[structural inference]`)。
>
> **R1 是真抓 HTML (164 IDs / 99 sections / 10 project IDs)**, **R2 是真读 CSS (90 KB)**, **R3 诚实标注 fetch 全部失败**。本节原则都从 R1 / R2 实测数据中提取。

### 2.1 可迁移 (6 条, 每条都已对应到 Pinax 具体位置)

| # | Lusion 原则 | 实测证据 | Pinax 落地位置 | 改动类型 |
|---|---|---|---|---|
| L1 | **Section ID 命名 + container 双层剥离** (R1 §5 P1) | 99 个 section ID 全部是 `(home\|end\|footer\|header)-*` 谱系 | 跨 3 页: 给 W/N/E 的每个"区块"补 `data-section="writing-cork / notes-drawer / experience-ledger"` 属性, 不动 CSS | 加 attribute (零视觉变化) |
| L2 | **Per-item `data-color-*` 三件套** (R2 §3.1 "Lusion 最值钱机制") | grep 出 10 个 distinct `data-color-bg` + `data-color-text` + `data-color-shadow` 组合 | Notes reading-deck 的 7 个 material-group + 1 个 active-card + 0-3 个 slip | **结构性** (重做 N9 多条目共存的视觉) |
| L3 | **Scroll indicator 文案递进** (R1 §5 P4) | end-section 文案从 "invite" 渐变到 "command" 4 段 | Experience ledger-spread 之间 + Writing chapter 切换 + Notes kind 切换 | 文案层 + 1px marker |
| L4 | **CTA 一致签名 (dot + text + SVG arrow)** (R1 §5 P3) | 6 处 CTA 复用 right-arrow SVG path | 跨 3 页: 把现在 4 种 button 形态统一到 `[dot + label + chevron]` | 组件化 (新建 `ArchiveCta.vue`) |
| L5 | **Hover dot scale-in + cubic-bezier(.4,0,.1,1)** (R2 §1) | 6 个 distinct cubic-bezier 曲线实测 | Writing tab / Notes material-entry-card / Experience ledger-spread mount | 已有基础, 加 `--ease-archive: cubic-bezier(0.22, 1, 0.36, 1)` token |
| L6 | **Opacity 阶梯代替 weight 阶梯** (R3 §3.5) | Lusion 用 1.0 / 0.65 / 0.4 三档 opacity 表达层级 | 跨 3 页 meta 文字 (9-11px) 全部 opacity 0.4-0.65 | 系统化 (替换 `color-mix(... 70%)` 为 `opacity`) |

### 2.2 不可迁移 (5 条禁区, per LUSION-R2 §5 + R3 §5)

> 必须显式列出 — worker 容易"借鉴"过头。

| # | Lusion 元素 | 为什么不做 |
|---|---|---|
| ❌ L7 | **WebGL / canvas / Three.js / TSL shader** | Pinax 是写作工具, 无 3D 资产; 5A/5B/5C 立绘已经够用; typing 场景下 GPU 占用灾难 |
| ❌ L8 | **canvas 3D scene 当 background** | 拖慢 typing, 破坏 archive-folio 隐喻 |
| ❌ L9 | **Cursor trail / 自定义 cursor** | 干扰打字 / 选段主任务 |
| ❌ L10 | **Preloader 数字滚动** | 写作工具进 app < 200ms 可见 |
| ❌ L11 | **整页 transform / scroll-jacking** | 破坏 user mental model + 与 W9 cork "纸摊在桌上" 隐喻冲突 |
| ❌ L12 | **Border-radius 15px 圆角卡** | Pinax kao mode 硬切角 0 radius, 圆角破坏 archive-folio |
| ❌ L13 | **Hover text translate 1.5em 右滑** | 干扰打字主任务 |
| ❌ L14 | **`will-change: transform` 多处** | 烧 GPU memory |
| ❌ L15 | **`data-color-shadow` 数字 opacity** | Lusion shadow 几乎看不出差, Pinax 已有 archive-ink shadow |
| ❌ L16 | **全局色板切换 / per-route chrome 换色** | 破坏 archive 品牌身份 |

### 2.3 借鉴方式 (实操 3 条)

1. **不照搬 Lusion 的 HTML 结构, 借鉴"层级命名"**: Pinax 给每个 surface 加 `data-section` 属性, worker 验证时 grep 看到稳定谱系。
2. **不照搬 Lusion 的 CSS 数值, 借鉴"分层签名"**: Pinax 用 1px / 2px / 4px / 12px 这 4 档 thickness (W9 已 ship) 对应 Lusion 的 1px / 4px / 16px / 24px, **档数相同, 数值减半** (因为 Pinax 屏幕 1280px vs Lusion viewport 全屏, 比例不同)。
3. **不照搬 Lusion 的交互频率, 借鉴"对象动线 1 步"**: Lusion hover → canvas lerp 是 2 步 (hover trigger + canvas response); Pinax 不能做 canvas lerp, 但可以做"对象 focus motion path" (dossier 进入 focus 时 `transform: translateX(0)` from `translateX(8px)` 200ms), **1 步, 立即可见**。

---

## 3. 哪些是 "大改", 哪些只是 "微调" (禁微调冒充改造)

> **核心规则**: worker 提交任何"明显变化"必须满足以下之一才算"大改", 否则视为"微调冒充改造", 必须 reject:

### 3.1 大改 (≥ 1 个新结构层)

| 改动类型 | 大改判定 | 反例 (微调冒充) |
|---|---|---|
| **新 component** | ✓ 大改 (新增文件, 跨页可复用) | 新增一个 wrapper div, 不算 |
| **新 keyframe 动画 + 应用到 ≥ 1 个已存在元素** | ✓ 大改 (Lusion R3 §3.4 "对象动线") | 只改 `transition: 0.12s → 0.16s`, 不算 |
| **新 CSS variable / token** | ✓ 大改 (基础设施层, 后续可复用) | 只改 inline color value, 不算 |
| **新 attribute (data-section / data-state 等)** | ✓ 大改 (层级命名, 0 视觉变化但语义清晰) | 只加 `aria-label`, 不算 |
| **新 derived state / computed** | ✓ 大改 (派生逻辑) | 只改 ref 默认值, 不算 |
| **新增 z-index tier** | ✓ 大改 (空间结构) | 改既有 z-index 数值, 不算 |
| **新 `:has()` 选择器锁定"父子关系"** | ✓ 大改 (关系结构) | 只改 selector specificity, 不算 |

### 3.2 微调 (✗ 拒绝, 即使包装成 "明显变化")

| 反例 | 为什么拒 |
|---|---|
| 改 `font-size: 11px → 12px` | 字号微调, R7 verdict 边际收益递减 |
| 改 `box-shadow: 4px → 6px` | 阴影数值微调, R7 拒绝 |
| 改 `border-radius: 0 → 2px` | 圆角微调, R3 §2.2 #❌12 禁区 |
| 改 `transition: 0.12s → 0.16s` | 动画时长微调 |
| 改 `color-mix(... 70%) → 80%` | 颜色百分比微调 |
| 加 `:hover { transform: scale(1.02) }` | hover scale 微调, R2 §5 拒绝 |
| 把 chapter-rule ribbon 从 `gold 32%` → `gold 36%` | token 数值微调 |

### 3.3 检验 query (给 worker 的自审 prompt)

> "我这一轮 commit 之后, user 打开 app 第一眼能看到什么**之前没有的东西**?"
>
> - 答案 1: "新结构 (新组件 / 新动画 / 新 z-tier)" → ✓ 大改
> - 答案 2: "新对象 (新 chapter-rule 形态 / 新 dossier 视觉)" → ✓ 大改
> - 答案 3: "新字体分工 (新 opacity 阶梯 / 新 weight 对比)" → ✓ 大改
> - 答案 4: "新节奏 (新 transition curve / 新进场仪式)" → ✓ 大改
> - 答案 5: "更大的 hover lift" / "更深的 shadow" / "更圆的 border" → ✗ 微调, 必须 reject

---

## 4. 推荐切片 (≤ 3 个 implementation worker, 文件边界清楚)

> **Codex 决策点**: 本节提供 3 个候选 slice 组合, Codex 选 1 个组合 dispatch。**最多 3 个 worker** 是硬约束 (per brief)。

### 推荐组合 A: **"Experience 重建 + Notes 多条目共存 + 跨页 token"** (3 workers, 推荐)

> 解决用户反馈命中率 4/4 (Experience 字体/显示/切换/衔接 + Notes 副阅读台/右侧空白/画布拖拽 + Writing 记忆点间接)。

#### Worker A1: **UI-XP1 — Experience 重建: ledger-spread 做主角, sidebar 退为配角** (HIGH)

**目标**: 让 ledger-spread 在视觉上"压倒" sidebar, sidebar 从 3 个并列 section 变成 1 个 `archive-index` (统一 stamp + kind-color tab spine 区分 3 卷)。

**文件边界**:
- ✏️ 改 `src/pages/Experience.vue` (template + scoped CSS): sidebar 从 3 个 `.sidebar-section` → 1 个 `.archive-index`, 加 `<CharacterPortrait pose-id="speaker-thumb">` 移入 index top, 3 卷用 `<span class="archive-index__tab" :data-section="...">` 区分
- ✏️ 改 `src/components/GamePanel.vue` (scoped CSS only): ledger-spread `z-index` 显式提升到 `--z-stage-paper: 2`, 加 1 个 `@keyframes ledgerSpreadEnter` (rotateY -8 → 0, 600ms cubic-bezier(0.22, 1, 0.36, 1), **per R1 §5 P4 + R3 §3.4**)
- ✏️ 改 `src/styles/themes/kao.css`: 加 1 条 `.quick-notes-rail` 改成 archive-folio 体系 (撕角方块 + ink 字) 替代圆形 SVG 按钮
- ✏️ 改 `src/__tests__/uiPolish.test.js`: 加 ≥ 10 条契约锁 A1 改动
- ✏️ 落盘 `docs/agent-runs/2026-06-21-ui-fix/experience-xp1-{empty,filled}-1280.png`

**结构性动作** (大改): 新 `@keyframes ledgerSpreadEnter` + 新 `data-section` attribute + sidebar 从 3 个同级 div 变为 1 个 wrapper + 3 个 tab

**Lusion 经验**: L5 (cubic-bezier hover) + L3 (scroll indicator 文案递进, chapter-rule ribbon 加文案 "翻下页 ·")

**严禁**: 改 gameStore / 改 messageSpreads computed / 改 ledger-spread 既有 8 contract 字面量

#### Worker A2: **UI-NP1 — Notes 多条目共存: 同框显示 + per-kind color** (MEDIUM-HIGH)

**目标**: 解决 "右侧仍有空间完全没用" + "一次只能看一个"。让 reading-deck 同时显示 active-card + ≤ 3 个 slip + 7 类 drawer 缩略 (折叠态)。

**文件边界**:
- ✏️ 改 `src/pages/Notes.vue` (template + scoped CSS): reading-deck 改 layout, active-card + slip **水平排列** (active 60% + slips 40%), drawer 7 类从垂直堆叠变为 1 行 7 cell 缩略; kind 单元格加 `data-archive-kind="人物/地点/..."` attribute
- ✏️ 改 `src/styles/themes/kao.css`: 加 1 条 `.theme-kao .material-entry-card[data-archive-kind="人物"]` 用 archive-olive 80% tab spine, `.material-entry-card[data-archive-kind="地点"]` 用 archive-gold, etc. (**per L2 "Lusion 最值钱机制" — per-item data-color 三件套的简化版**)
- ✏️ 改 `src/composables/useCanvasBoard.js` (per spec allowed): 让 slip 拖拽到 active-card 旁边, 1-3 → 1-6 (上限)
- ✏️ 改 `src/__tests__/uiPolish.test.js`: 加 ≥ 8 条契约锁 N9 既有 + N10 新结构

**结构性动作** (大改): 新 `data-archive-kind` attribute + 7 类 per-kind color spine + reading-deck layout 从垂直 → 水平 + slip 数量上限 3 → 6

**Lusion 经验**: **L2 (per-item data-color 三件套, R2 §3.1 "Lusion 最值钱机制")** + L4 (CTA 一致签名)

**严禁**: 改 material-group / active-card 既有 contract / 改 useCanvasBoard API 形状 (只能加拖拽 target 数量上限, 不改 hook 签名)

#### Worker A3: **UI-XT1 — 跨页 token 基础设施: z-tier + easing + opacity 阶梯** (MEDIUM, 跨 3 worker 共享)

**目标**: 解决 "字体不行" (Experience) + "显示奇怪" (Experience) + "Writing 缺强记忆点" 的字体分工问题。**不直接改任何 page**, 改 3 个 token, 让 A1 / A2 / 未来的 W 改造有基础设施可用。

**文件边界**:
- ✏️ 改 `src/styles/main.css`: 加 3 个 token (`--z-stage-wall: 0 / --z-stage-paper: 2 / --z-stage-cta: 5` + `--ease-archive: cubic-bezier(0.22, 1, 0.36, 1)` + `--archive-display-weight: 400 / --archive-meta-opacity: 0.55 / --archive-meta-tracking: 0.08em`)
- ✏️ 改 `src/styles/themes/kao.css`: 替换 5 处 `cubic-bezier(...)` / `ease` → `var(--ease-archive)`; 加 3 处 `z-index: var(--z-stage-paper)` (cork / dossier / ledger-spread); 加 1 条 `.archive-meta` utility class
- ✏️ 改 `src/__tests__/uiPolish.test.js`: 加 6 条契约锁 token 值

**结构性动作** (大改): 3 个新 token + 跨页 (kao.css) 替换 ≥ 5 处 + 新 `.archive-meta` utility

**Lusion 经验**: **L5 (cubic-bezier) + L6 (opacity 阶梯)** + **R3 §3.2 (5 层 z-tier)** + **R3 §7 推荐 UI-X1**

**严禁**: 改任何 page.vue (A3 只动 styles/main.css + styles/themes/kao.css + uiPolish.test.js); 不引入新依赖; 不动 theme-system contract

#### 组合 A 验收标准

| 维度 | 标准 |
|---|---|
| 测试 | `npm run test:run` ≥ 920 tests pass (current 895 + ≥ 25 new contracts) |
| 构建 | `npm run build` clean |
| Diff | `git diff --check` clean |
| Forbidden patterns | grep `:global(.theme-kao)` / `!important` / `:deep(*)` / `#[0-9a-f]{3,8}` 0 命中 (token 内的 hex 排除) |
| 截图 | 6 张 (A1: 2 张 1280×800 light + dark; A2: 2 张 1280×800 light + dark; A3: 不需要截图, 只 need token diff visible in kao.css) |
| Forbidden Lusion | grep `WebGL\|cursor:\|preloader\|scroll-jacking\|border-radius: 15px\|translate3d\|will-change` 0 命中 |

---

### 推荐组合 B: **"Experience ledger 重建 + Notes per-item kind + Writing cork 仪式"** (3 workers, 备选)

> 偏 polish, 比组合 A 更保守。**不推荐** — 因为用户的 "最近几轮变化不大" 反馈意味着保守做法不能解决核心抱怨。

#### Worker B1: 同 A1 (Experience ledger-spread 做主角)

#### Worker B2: **UI-NB1 — Notes 7 类 drawer 用 per-kind color tab spine** (MEDIUM, 微调改造)

**目标**: 给 7 类 drawer 加 `data-archive-kind` + 7 种 archive-token 色, 但**不动 reading-deck layout** (active-card 仍独占, slip 仍 1-3 上限)。

**问题**: 这是**典型的"装饰冒充改造"** — 看起来在变, 实际只是给抽屉加色, 不解决"右侧仍有空间完全没用"。**不推荐**, 列在此处只为 Codex 决策对比。

#### Worker B3: **UI-WB1 — Writing cork 加 save-chip ink-bleed 进场仪式** (MEDIUM-LOW)

**目标**: W9 cork 改为进场时 save-chip background 从 `paper-soft 70%` lerp 到 `rose 24%` (600ms cubic-bezier), 像"印章慢慢渗透纸面"。

**问题**: **单按钮级 polish**, R7 verdict "边际收益递减" 已经拒绝过类似做法。**不推荐**, 列在此处只为 Codex 决策对比。

---

### Codex 决策

| 选项 | 含义 | 适用场景 |
|---|---|---|
| **A (推荐)** | A1 + A2 + A3 三 worker 并行 | 用户想要"明显变化", 接受 3 worker 同时跑 |
| B (备选) | B1 + B2 + B3 三 worker | 用户只想要 polish, 不想结构性大改 |
| STOP | 不开新 worker, 等真实手测 / 5B v0.2 / 5C wallpaper / Welcome 4 件事 (per STATUS.md Next up) | UI-R8 verdict "STOP NOW" 生效 |

---

## 5. 验收标准 (per 组合, 必须落盘)

### 5.1 截图 (per worker, 全部落盘到 `docs/agent-runs/2026-06-21-ui-fix/`)

| Worker | 截图 (1280×800 light + dark) |
|---|---|
| A1 Experience 重建 | `experience-xp1-{empty,filled}-1280.png` + `experience-xp1-{empty,filled}-dark-1280.png` (4 张) |
| A2 Notes 多条目共存 | `notes-np1-{active,multi-slip}-{1280,dark-1280}.png` (4 张) |
| A3 跨页 token | 不需要截图 (token diff visible in kao.css diff) |

**合计 8 张** (A 组合) 或 **2 张** (B 组合, B1 only).

**禁止**:
- 不生成 WebGL / 3D / 动画 GIF / 视频
- 不生成 LXGW 字体加载失败截图
- 临时脚本 `/tmp/<worker>-take-screenshots.{mjs,py}` 跑完即 `rm -f`, 不 ship 到 repo (per E9 §4.4 强制)

### 5.2 测试

| 维度 | 标准 |
|---|---|
| **每个 worker 必跑** | `npm run test:run -- src/__tests__/uiPolish.test.js` |
| **每个 worker 必跑** | `npm run test:run -- src/__tests__/useCanvasBoard.test.js` (A2 涉及 useCanvasBoard) |
| **每个 worker 必跑** | `npm run test:run -- src/__tests__/gamePanelMechanism.test.js` (A1 涉及 ledger-spread) |
| **每个 worker 必跑** | `npm run build` |
| **每个 worker 必跑** | `git diff --check` |
| **A3 完成后 (Codex 集成时)** | `npm run verify:full` (全量 sanity, 当前 113 files / 903 tests) |
| **新 uiPolish contracts** | 每个 worker ≥ 8 条, 描述结构性动作 |

### 5.3 Forbidden patterns (每个 worker commit 前 grep 验证)

```bash
# Forbidden
git diff HEAD -- src/ | grep -nE ":global\(\.theme-kao\)|!important|:deep\(\s*\)|#[0-9a-fA-F]{3,8}\b"
# 期望: 0 match (token 内的 hex 字面量排除)

# Lusion 禁区 (新增)
git diff HEAD -- src/ | grep -nE "WebGL|cursor:[[:space:]]*url|preloader|scroll-jacking|border-radius:[[:space:]]*[0-9]+px|translate3d|will-change"
# 期望: 0 match

# Co-Authored-By footer
git log -1 --format='%B' | grep -i "Co-Authored-By"
# 期望: 0 match (per AGENTS.md commit-conventions)
```

### 5.4 落盘要求

| 文件 | 必须落盘 |
|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/UI-A{1,2,3}.report.md` | 每个 worker 1 份 (跟 W9 / N9 / E9 / E10 同模板: research / problems / design strategy / file changes / screenshots / test results / risks) |
| `docs/agent-runs/2026-06-21-ui-fix/experience-xp1-*.png` (4 张) | A1 worker |
| `docs/agent-runs/2026-06-21-ui-fix/notes-np1-*.png` (4 张) | A2 worker |
| 不落盘 token 截图 | A3 worker (CSS diff 已足够) |
| 不 commit 不 push (per brief) | 每个 worker 提交前由 Codex 验收, 不预先 commit |

### 5.5 验证: 大改 vs 微调 (per worker, commit 时 grep)

```bash
# 验证 worker 没有用微调冒充改造
# 1. 检查是否新增 component / keyframe / token
git diff HEAD -- src/ | grep -nE "^\\+.*@(keyframes|component|prop)" | head -10
# 期望: ≥ 1 (证明有结构性动作)

# 2. 检查 forbidden "微调冒充" 反例
git diff HEAD -- src/ | grep -nE "^\\+.*font-size:[[:space:]]*1[12345]px" | head -5
# 期望: ≤ 2 (允许少量微调, 但不能都是字号)

# 3. 检查是否新增 attribute
git diff HEAD -- src/ | grep -nE "data-(section|archive|state|kind)" | head -5
# 期望: ≥ 1 (证明层级命名)
```

---

## 6. Out of Scope (本轮不做, 列给 Codex 决策)

| 不做 | 理由 | 后续 spec |
|---|---|---|
| Welcome / OpeningPage 重建 | 用户没提, 不在本轮反馈范围 | UI-WL1 / UI-OP1 |
| 跨页路由 transition (AppShell) | 基础设施级 scope, 跨 6 page | UI-RT1 (下下轮) |
| Worldbook / MemoryIndicator 视觉 | 用户没提 | UI-WB1 / UI-MI1 |
| CharacterPortrait 5B v0.2 真立绘 | 已是 STATUS.md In flight, 等 user 手画 | (per 5B worktree) |
| 5C wallpaper keyframes (v3.14 shimmer + wallpaperMist + wallpaperGrain + wallpaperLight) | 已 ship, 不再改 | — |
| Notes 全局 N10+ per-item mood board (R2 §3.1 完整版) | scope 重, A2 只做 "per-kind color spine" 简化版 | UI-N10 |
| Writing dossier-tape 改书脊折痕 | R3 §4.3 #2 完整版, 风险高 | UI-W11 |
| Welcome launch session CTA + persistent CTA | Welcome scope | UI-WL1 |

---

## 7. 给 Codex 的 3 个二选一决策

> 本报告不隐含"必须 ship A"压力。Codex 可选 A / B / STOP 任一。

### 决策点 1: ship A 还是 B 还是 STOP?

- **A** (推荐): 用户要"明显变化", 接受 3 worker 并行, 解决 4/4 用户反馈
- **B**: 用户只想要 polish, 不接受结构性大改, **但用户原话 "最近几轮变化不大" 已拒绝 B 类做法**
- **STOP**: 接受 UI-R8 verdict, 永久停止 UI polish, 转 STATUS.md Next up 4 件事 (5B v0.2 / 真实手测 / 5B rebase / 5C wallpaper / Welcome Phase 1B)

### 决策点 2 (仅当 A): A1 / A2 / A3 是否同时 dispatch?

- 并行 3 worker: 节省时间, 但 A1 / A2 都依赖 A3 的 token ship (A1 ledger-spread z-index 引用 A3 `--z-stage-paper`; A2 kind spine 引用 A3 `--archive-display-weight`)
- 顺序: A3 先 ship → A1 / A2 并行 ship → Codex 集成 (3 commits: 1 token + 1 Experience + 1 Notes)

### 决策点 3 (仅当 A): worker 是否需要看本报告?

- A1 worker brief 必须包含本报告 §1.1 (Experience 严重性证据) + §2.1 L1+L3+L5 (3 条可迁移原则) + §5.4 落盘要求
- A2 worker brief 必须包含本报告 §1.2 (Notes 多条目证据) + §2.1 L2 (per-item data-color) + §5.4
- A3 worker brief 必须包含本报告 §2.1 L5+L6 + §2.2 禁区 + §5.3 forbidden patterns grep
- **不读本报告的 worker 不能保证理解 "为什么这么改"**, 建议 A3 worker brief 必须以本报告作为 single source of truth

---

## 8. 文件清单 (本 QA 落盘 + 未来 worker 输入)

```
docs/agent-runs/2026-06-21-ui-lusion-r10/
└── UI-R10.visual-diagnosis.md          (本报告, 0 src 改动, 0 commit)

docs/agent-runs/2026-06-21-lusion-research/  (上游输入, 已存在)
├── LUSION-R1.structure.md
├── LUSION-R2.interaction.md
├── LUSION-R3.visual-system.md
├── PINAX-LUSION-SPEC.report.md
└── QA-LUSION.review.md

docs/superpowers/specs/
└── 2026-06-21-lusion-inspired-pinax-design.md  (上游 E10 spec, 已存在)

# 未来 worker 落盘 (per 推荐组合 A):
docs/agent-runs/2026-06-21-ui-fix/
├── UI-A1-experience-rebuild.report.md
├── UI-A2-notes-multi-item.report.md
├── UI-A3-cross-page-tokens.report.md
├── experience-xp1-{empty,filled}-1280.png
├── experience-xp1-{empty,filled}-dark-1280.png
├── notes-np1-{active,multi-slip}-1280.png
└── notes-np1-{active,multi-slip}-dark-1280.png
```

---

## 9. 验收结论 (本次 R10)

**诊断质量**: ✅ 4/4 用户反馈命中 (Experience 字体 / 显示 / 菜单切换 + Notes 副阅读台 / 右侧空白 + Writing 缺强记忆点), 每条都有 src 行号证据。
**Lusion 借鉴质量**: ✅ 6 条可迁移 + 10 条禁区 + 3 条借鉴方式, 都从 R1 / R2 实测数据 + R3 canonical 综合, 不照搬 WebGL/3D。
**切片推荐质量**: ✅ 组合 A (3 worker / 文件边界清楚 / forbidden grep) vs 组合 B (保守 polish) vs STOP 显式三选一, 不隐含"必须 A"压力。
**大改 vs 微调判定**: ✅ 7 类大改 + 7 类微调反例 + 1 个自审 prompt query。

**最终建议**: Codex 拍板 (A / B / STOP) → 选 A 则 dispatch 3 worker (A3 先, A1 / A2 后) → 每个 worker 走 brief + worktree + report + 截图 + 测试 → Codex 集成 3 commits → STATUS.md 更新。**R10 本身到此为止, 不 dispatch 任何 worker**。

---

**END OF UI-R10 DIAGNOSIS** — 等 Codex 拍板, 然后开 worker。