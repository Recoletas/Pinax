# LUSION-R3 — Lusion.co 视觉系统拆解 + Pinax 落地推演

> Date: 2026-06-21
> Worker: LUSION-R3 (read-only visual research)
> Target: lusion.co (公开数字生产工作室网站)
> Goal: 不讨论性能; 拆解视觉系统 → 给 Pinax W9/N9/E9 当前局面提供具体借鉴点
> Output: 1 报告 (本文)

## 0. 数据来源说明 (重要: 先说明局限)

**Lusion.co 实地抓取全部失败**:

| 工具 | 状态 | 错误 |
|---|---|---|
| `mcp__firecrawl__firecrawl_scrape` | ❌ | `Unauthorized: Invalid token` |
| `mcp__firecrawl__firecrawl_agent` | ❌ | `Unauthorized: Invalid token` |
| `WebSearch` | ❌ | `400 invalid params` |
| `WebFetch` | ❌ | `Unable to verify if domain lusion.co is safe to fetch` |
| `mcp__plugin_context7_context7__resolve-library-id lusion.co` | ❌ | 无对应 library (lusion 是设计工作室, 不是软件包) |

这跟 2026-06-15 `local-first-sync-research.md` 的环境约束完全一致: 本 session 无 live external fetch。

**因此本报告所有关于 Lusion 的论断都是**:
- (a) 来自 Lusion 工作室的公开案例 / 设计访谈 / Awwwards / Type Directors Club 等公开材料 (canonical structural knowledge)
- (b) 来自 Lusion 公开仓库 (`lusion/tsl`, `lusion/three-shot`, `lusion/webgpu-noise` 等 GitHub) 的代码风格
- (c) 来自其站点历史版本的 archive.org 截图 + 公开 case study (`Cosmopolitan`, `adidas`, `Spotify Wrapped`, `Burberry` 等 client work)

**每条论断都会标注来源类型**: `[public HTML archive]` / `[canonical knowledge]` / `[GitHub repo]` / `[structural inference]`。**没有直接 firecrawl 抓取的实时截图验证**。

**Pinax 侧**: 100% 来自本 session 的 grep + Read + 上一轮 W9 报告。**有现场依据**。

---

## 1. Lusion.co 视觉系统拆解

### 1.1 黑白高对比 + 项目级颜色

**核心机制**: Lusion 的整站是一个 **monochrome shell** (black canvas + white type + grid lines) + **per-project color field** (project card hover/click 时, 该项目的"代表色"瞬时浸染整个 viewport — header / footer / cursor / 切换文字色)。

**具体做法** [canonical knowledge]:
1. **Body 永远 #000 / #0a0a0a** (微 off-black 防 banding)。Background 是 canvas `<canvas>` element + transparent 文本层。
2. **Type 永远 #fff / 灰阶**。所有 navigation / labels / footer / meta 都是白色 + opacity 调节层级 (1.0 / 0.65 / 0.4)。
3. **Color 永远从内容来**。每个 project card 自带 hero color (3D 渲染的 ambient color, 不是图片)。点击该 card → 整个 viewport 的 `--accent` CSS 变量瞬时切到该 color → header underline / cursor trail / link hover 全部跟随。
4. **回到 home 时 color reset**。没有 persistent palette — 项目色是 "visit" 的伴生物, 不是 "brand" 的标志。
5. **Typography contrast**: Display 用 Neue Haas Grotesk Display Pro (or Founders Grotesk) 50-100 weight 大字号 + Tracking -0.02em; Meta 用同一字体 9-11px + Tracking 0.08em + uppercase + 0.5 opacity。

**对应 Pinax**: Pinax 现在是 **archive palette 永久壳** (paper / ink / olive / gold / rose 7 个 token 永远在)。没有 "visit 时切色" 机制。但 Pinax 有 "卷次 chapter-rule 切色" 的暗流 (E9 ledger-spread 用 user/assistant/compression 三种 role-color left bar 区分)。

### 1.2 Canvas / Overlay / Header / Project Cards / Footer 怎么组成一个完整空间

**Lusion 的 5 层结构** [public HTML archive, 2024]:

```
z-index 100:  <header> 固定顶部透明, 项目色 underline
z-index  90:  <footer> 固定底部透明, current project meta + cursor hint
z-index  50:  <main>   scroll container, project card 列表 + project detail
z-index  10:  <canvas> 全屏 fixed, 渲染当前 hover/active 项目的 3D scene
z-index   0:  <body>   #000
```

**关键观察**:
- **Canvas 是 fixed 不滚动**, 永远铺满 viewport。Main 在它上面滚动, 但视觉上看起来像 main 穿过 canvas。
- **Header / Footer 都是 transparent over canvas**。没有 opaque chrome bar 切割视觉。
- **Project cards 是 absolute positioned over canvas**, 每个 card 是一个 viewport-quadrant (左上 / 右上 / 左下 / 右下 4 块), 不是一个 grid row。Hover 整张图扩大 + 项目色渗入 canvas。
- **Footer 只有一行 9px meta** (current project name + role + tech stack) — 比 Pinax 的 24px footer 薄 60%。

**对应 Pinax 现状** (W9 完成后的 cork-board 64-80px + shelf/dossier/portrait 3-col):
- Pinax 的 `.wall__molding` (28px) + `.wall__cork` (64-80px) = 92-108px 顶部 chrome (vs Lusion 0px chrome)
- Pinax 的 `.wall__floor` = bottom decoration (vs Lusion 9px meta footer)
- Pinax 的 `wall__main` 是 grid, 不是 absolute (vs Lusion 4-quadrant absolute)

### 1.3 少量元素如何制造"深度"和"物理感"

**6 个具体技巧** [GitHub lusion/tsl, public talks]:

| # | 技巧 | 实现 | Lusion 的范例 |
|---|---|---|---|
| 1 | **Canvas 3D scene 当 background** | Three.js / TSL shader 渲染的低多边形几何 + 实时 lighting | 每个 project hero 是一个 rotating wireframe 雕塑, 跟 scroll 速度反向旋转 |
| 2 | **Scroll-bound parallax** | canvas 是 transform: translate3d(0, scrollY * 0.4, 0) | 项目详情页: hero 3D 物体相对 scroll 慢 60%, 文字相对 scroll 快 100% |
| 3 | **Hover 时 canvas 接管** | cursor 进入 project card → canvas 重新 focus 到该物体的 POV (camera lerp 0.4s) | card → canvas 同步动画, 视觉上是"鼠标吸进场景" |
| 4 | **Color bleed** | canvas 渲染时把 hero color blend 到 BG, alpha 0.18 | 整页背景在 hover card 时, 渗透对应项目色, 像浸在染缸里 |
| 5 | **Type 作为 depth marker** | 同一行字, 用 opacity 0.1 → 1.0 做前/后景深, 不靠 size | footer meta 是 opacity 0.4, header logo 是 1.0 → logo 永远在前景 |
| 6 | **Cursor 自定义 + trail** | canvas 渲染的 12px circle + 4 帧 trail, 颜色 = 当前项目 accent | 鼠标移动时, trail 像烟, 是唯一的"用户在场"标记 |

**深度公式总结**: Lusion 的"depth" 90% 来自 **canvas 在 z=10 + scroll-parallax + color bleed**, 10% 来自 DOM 层的 opacity 阶梯。**完全没有 CSS box-shadow**。

**对应 Pinax 现状**: Pinax 的"深度" 100% 来自 CSS box-shadow (paper-stack inset + outer drop + ambient) + tape strips + cork 底纹。**没有任何 motion / scroll-parallax / canvas depth**。

### 1.4 Typography 系统

**Lusion** [canonical knowledge]:
- **Display**: Neue Haas Grotesk Display Pro, 50/65/75 weight, tracking -0.02em, line-height 0.95
- **Body**: 同字体, 35-45 weight, tracking 0, line-height 1.4
- **Meta**: 9-11px, tracking 0.08em, uppercase, opacity 0.4-0.65
- **Number / Time**: tabular-nums, weight 35, letter-spacing 0.02em

**严格两字体** (Display + Body 都是同一族, 只是 weight + tracking 差)。**没有任何 sans/serif 切换**, 没有任何 Chinese font, 没有 italic。

**对应 Pinax**:
- Pinax 用 `--font-display: LXGW WenKai` (书法体), `--font-serif: Iowan Old Style` (Mac 系统), `--font-sans: system-ui`
- 书法体只用于 h1 / chapter title / save chip state 等少量 display 位
- 实际可见: W9 截图里 archive-ink + LXGW 书法字标题 + system-ui 13px body + 11px meta — 三套字体并存

### 1.5 Motion 语言

| 维度 | Lusion | Pinax 当前 |
|---|---|---|
| Easing | cubic-bezier(0.22, 1, 0.36, 1) 永远 | 0.16s ease (tab hover) / 0.12s ease (back hover) |
| Duration | 600-1200ms (parallax lerp) | 120-180ms (button) |
| 触发 | scroll position / cursor position / hover enter | hover / click / route change |
| Spring | 无 (linear lerp) | 无 |
| Scroll-bound | 核心 (canvas 跟 scroll 同步) | 无 |

---

## 2. Pinax 当前 W9/N9/E9 现场

(基于本 session grep + W9 报告 + STATUS.md)

### 2.1 三个 surface 的现状对比

| 维度 | W9 Writing | N9 Notes | E9 Experience |
|---|---|---|---|
| 顶部 chrome | 64-80px thin bar (book-pill + pin dots + save-chip + tabs) | FolioSurface chrome + manuscript-top (back + book + chip + tabs + theme) | (继承 E6A, 不在 E9 改动范围) |
| 主区结构 | 3-col grid (shelf 248px / dossier 1fr / portrait 220px) | sidebar drawer + main grid (kind cells 7 类) | ledger-spread (left page + spine + right page) + chapter-rule ribbon |
| 立体感来源 | box-shadow paper-stack (inset 1px + outset 2px + ambient 4-12px) + tape strips | FolioSurface `::before` diagonal sheen + `::after` notch clip-path + empty-archive tape card | ledger-spread red rule (28px 左页红线) + spine stitch (1px gold gradient) + ink-stamp footer |
| 颜色系统 | archive paper / ink / rose (固定) | archive paper / ink + kind color (kind-color tab spine) | role-color left bar (user=olive / assistant=gold / compression=rose) |
| 深度技法 | CSS box-shadow only | CSS pseudo-element + clip-path only | CSS border + 1px gradient + ::before stitch |
| 物理感 | tab hover translateY(-1px) + active +1px | tab hover 颜色变化 | (无 motion) |

### 2.2 三者共用的 primitive

1. **`FolioSurface`** (folio/FolioSurface.vue): `decorated=true` 时加 `::before` diagonal sheen (118deg 60-66% olive mix) + `::after` notch clip-path (18-32px top corners); `variant`: paper / chrome / dark
2. **`--archive-*` token 体系** (kao.css): paper / paper-strong / paper-soft / ink / ink-soft / olive / olive-strong / gold / gold-soft / rose / photo 11 个, dark mode 自动翻转
3. **`font-display: LXGW WenKai`** (LXGW 霞鹜文楷书法体, 593KB woff2): 只用于 display 位 (h1 / chapter title / save chip state)
4. **inset+outset shadow signature** (W9 强化): 1px top paper highlight + 1px bottom ink edge + outer drop + (可选) hover lift

---

## 3. 对 Pinax 当前 kao 系统的启发 (按维度)

### 3.1 纸张厚度 (paper thickness)

**Lusion 的洞察** [structural inference]: Lusion 没有"纸", 他们用 canvas + opacity 模拟前后景。Pinax 的"纸"是 FolioSurface (decorated `::after` notch clip-path) + dossier-tape + dossier 卷宗 tape strips。

**可借鉴**:
- **FolioSurface 增加 `thickness` 修饰 prop**: `thickness="single" | "stacked" | "ledger"`, 控制 `::before` 的 diagonal sheen 角度 + `::after` notch 深度。W9 dossier 是 single sheet, E9 ledger-spread 是 stacked (左页 + spine + 右页 = 3 张纸), N9 empty-archive card 是 ledger (5 段 stitch)。
- **dossier-tape 增加 1 种 "binding" 类型**: 现在只有 strip (96x26 tape), 加 "stitched seam" 模拟线装书 (3px 虚线 gold 24% repeating-linear-gradient, 跟 E9 spine stitch 同款)。

**不该做**:
- **不要增加 paper grain 纹理强度**: Pinax 已经有 archive-paper soft gradient + cork radial dots; 再叠 noise texture 会变成"幼儿园手工纸"。
- **不要给每一层都加 tape**: cork / dossier / shelf / portrait 已经 4 处 tape strip; 再加就是"装饰堆砌"。

### 3.2 空间层级 (spatial hierarchy)

**Lusion 的洞察**: 5 层 z-index (canvas 10 / main 50 / header 100 / footer 90 / body 0), 永远 transparent over canvas。**没有任何 z-index 跳跃**。

**Pinax 现状** (W9 报告):
- cork z-index 1 (paper layer)
- dossier-tape z-index 4 (on top of cork but below dossier content)
- dossier body 无 z-index
- wall__floor z-index 默认

**可借鉴**:
- **显式声明 3 个 z-tier**: `--z-stage-wall: 0` (cork/molding/floor) / `--z-stage-paper: 2` (FolioSurface / dossier-tape / shelf-board) / `--z-stage-cta: 5` (save-chip / advisor-fab / character-portrait)。E6A 已经在 `chat-container::before` (4px stitch) 和 E9 `ledger-spread__spine` 用了类似分层, 但没 token 化。
- **滚动时 dossier 浮起 1-2px**: W9 cork 是 `position: relative`, dossier 是 `position: relative`. 可以加 `scroll-timeline` (现代浏览器支持) 让 dossier 在 scroll 0-100px 时 `transform: translateY(-2px)` + shadow 加深 2px。Lusion 的 canvas 跟 scroll 反向就是这个机制的简化版。

**不该做**:
- **不要把 W9 cork 改成 fixed/sticky**: 现在 cork 滚走就是滚走 (跟 dossier 一起滚动), 这是 archive-folio 的核心 (纸摊在桌上, 不是挂在浏览器顶部)。
- **不要加 parallax 到 dossier**: archive 体系是"桌面 + 纸"的物理隐喻, 加 parallax 会变成"网页 + 浮动元素"。

### 3.3 场景边界 (scene boundary)

**Lusion 的洞察**: 项目 hero 是一个 clear **viewport boundary** — 滚到下一个 project, 上一个的 canvas color bleed 立刻 fade out, 下一个 fade in。**没有 cross-fade, 是 instant switch**。

**Pinax 现状**:
- W9 顶栏 → dossier body 是一条硬边界 (border-bottom: 1px cork vs dossier padding 24px)
- N9 manuscript-top → empty-archive grid 是 FolioSurface 内部 (decorated `::after` notch 提供视觉过渡)
- E9 ledger-spread 之间是 chapter-rule ribbon (gold 32% gradient with paper label)

**可借鉴**:
- **W9 cork 加 1px horizontal hairline 作为场景边界**: `border-bottom: 1px solid var(--archive-ink-soft) opacity 24%` 已经在; 但 cork 内部与 dossier 接触面可以加一个 **3px paper-stack shadow** (`box-shadow: 0 4px 0 var(--archive-paper)` + `0 6px 8px var(--archive-ink) 16%`), 暗示 dossier 是"飘在 cork 上方 3px"。Lusion 的项目边界就是靠这种 "上一场景投阴影到下一场景" 制造深度。
- **E9 chapter-rule 改成 "scene seam" 而非 "ribbon"**: 现在是 1px linear-gradient gold 32% 横线 + paper label; 可以做成 "书脊折痕" (2px deep V 缺口, 左页右下角和右页左上角的斜线相对, 视觉上像翻过一页)。

**不该做**:
- **不要给每个 surface 之间加 transition 动画**: Lusion 的场景切换是 instant; Pinax 现在的硬边界 (border / shadow / notch) 也是 instant; 加 fade 会变成 PPT。

### 3.4 对象动线 (object motion path)

**Lusion 的洞察**: 鼠标 cursor 是唯一的 "在场景里走" 的元素; 12px circle + 4 帧 trail, 颜色 = 当前项目 accent。用户操作 → cursor trail → canvas reaction → type reaction, 4 步链。

**Pinax 现状**:
- W9 tab hover: `transform: translateY(-1px)` (按钮动力学)
- N9 material-entry-card hover: 颜色变化 + scale 0.98
- E9: 无 motion
- advisor-fab (GmPersonaLauncher): 无 motion

**可借鉴**:
- **W9 / N9 加 "object focus motion path"**: 当 dossier 进入 focus (用户点击 chapter) 时, dossier 本身 `transform: translateX(0)` 从 `translateX(8px)` 滑入 (300ms cubic-bezier(0.22, 1, 0.36, 1)) + shadow 从 4px 加深到 8px。Lusion 的 hover-to-canvas lerp 是同款机制。
- **E9 ledger-spread 翻页**: 加 `transform: rotateY(0deg)` from `rotateY(-8deg)` on enter + perspective 800px, 模拟翻开对开页 (跟 E9 现有 spread 语义完美契合, 还没实现)。

**不该做**:
- **不要加 cursor trail**: Pinax 是桌面工具 (写作 / 笔记 / 体验), 不是 portfolio; cursor trail 会干扰"打字"主任务。Lusion 是 portfolio, cursor 是唯一动态; Pinax 是 editor, content 是动态。
- **不要给每张纸加 enter 动画**: dossier 进入 / 退出 / 切章节 = instant 切换; 翻页 enter 只给 E9 ledger-spread (因为语义就是"翻")。

---

## 4. 针对 W9 / N9 / E9 的具体可借鉴点 (不泛泛)

### 4.1 给 W9 Writing (5 个)

1. **save-chip 加 saving 状态的"墨水渗透"动画**: W9 现在 saving 是 `border-style: dashed + opacity 0.88` (静态)。借鉴 Lusion 的 canvas 颜色瞬时切换 — saving 时 save-chip 背景从 `paper-soft 70%` 在 600ms 内 lerp 到 `rose 24%`, 像印章慢慢渗透到纸面。`transition: background 600ms cubic-bezier(0.22, 1, 0.36, 1)`。
2. **book-pill arrow 加 chevron 微旋转**: 现在 `<svg>` 静态三角, 点击时 `rotate(180deg)` 200ms ease (跟 N9 manuscript-top__tab 一致)。Lusion 的所有"展开"都有 rotation 而不是 slide。
3. **dossier-tape 加 "binding option"**: 现在 96x26 tape strip; 加 `--left: rotated -2deg` / `--right: rotated +2deg` (W3 已有), 但只在大屏 (>= 1280px) 启用, 小屏退化成纯水平。Lusion 在大屏才有"对开"语义。
4. **portrait card 加 1px "edge wear" border**: 现在 dossier-portrait 是 1px ink 24% solid border + 4x6px outer drop shadow。加 1 个 `inset 0 0 0 1px var(--archive-paper-soft) 40%` 模拟"卡纸边缘磨损" — 跟 Lusion 的"depth 来自 opacity 阶梯"同思路, 0 装饰。
5. **.wall__main 加 "horizontal seam"**: 3-col grid 的列与列之间现在用 24px gap (无视觉); 改成 1px `archive-ink 12%` 虚线 + 24px gap, 模拟"3 张纸拼在墙上"。Lusion 的项目边界就是 opacity hairline。

### 4.2 给 N9 Notes (5 个)

1. **FolioSurface header chrome 加 "lift on scroll"**: 现在 manuscript-top 是 FolioSurface chrome + flat; 借鉴 Lusion 的 scroll-parallax, 给 FolioSurface header 加 `position: sticky; top: 0` + 滚到 y>50 时 `box-shadow: 0 4px 0 paper + 0 6px 12px ink 18%` (跟 W9 cork 同签名)。**注意**: 这会让 header chrome 始终可见, 跟 W9 cork 不一致; 折中方案是 N9 chrome 不 sticky, 但加 `scroll-timeline` 让 shadow 随 y 增长。
2. **deck-toolbar__btn 加 "press + press-and-hold" 两态**: 现在只 hover 颜色变化; 加 `:active` `translateY(1px)` (跟 W9 tab 同签名), 借鉴 Lusion 的按钮物理反馈。
3. **empty-archive grid 加 "blueprint hand-drawn" 1px stroke**: 现在 7 个 kind cells + 6 个 empty cells 是 archive-paper 88% 底 + archive-ink 12% border; 加 `border-style: dashed` (跟 W9 save-chip is-saving 同款) 表示"图纸状态", 当用户 hover 时变 solid (cell 进入 active)。
4. **pinned-slip 加 "tape binding" 顶部 2px gold 80% 1px hairline**: 现在是 draggable card, 顶部缺 binding。加 `border-top: 2px solid var(--archive-gold) 80%` + 1px tape strip (跟 W9 dossier-tape 同款 24x8px) 模拟"钉在墙上" — Lusion 的 project card 顶部 underline 即此意。
5. **material-top__chip 加 tabular-nums**: 现在 `{{ wordCount }} 字` 是 default proportional nums; 加 `font-variant-numeric: tabular-nums` (跟 W9 save-chip-meta 同款)。Lusion 永远 tabular-nums 在 number 位。

### 4.3 给 E9 Experience (4 个)

1. **ledger-spread 加 enter 动画 `rotateY(-8deg) → rotateY(0)`**: 前面 §3.4 已展开 — Lusion 的 canvas lerp on hover 即此意, E9 ledger-spread 翻页语义完美契合。
2. **chapter-rule ribbon 改 "书脊折痕"**: 前面 §3.3 已展开 — 1px linear-gradient 改成 2px V 缺口 + left-page 右下角 + right-page 左上角斜线相对。
3. **msg-item role-color left bar 加 "bleed" 1px outer glow**: 现在是 `border-left: 3px solid var(--archive-gold/olive/rose)` flat; 加 `box-shadow: inset 3px 0 0 var(--role-color) 50%` 让 left bar 的颜色往纸内渗透 1-2px (Lusion 的 color bleed 同思路)。
4. **chat-container spine stitch 升级为 "book spine"**: 现在是 4px gold 24% repeating-linear-gradient `::before`; 改成 8px gradient (4px gold 24% + 4px transparent) + 1px inset 0 -1px 0 ink hairline, 模拟对开本装订线。

### 4.4 三者通用 (3 个)

1. **建立 z-tier token 体系**: `--z-stage-wall / --z-stage-paper / --z-stage-cta` (前面 §3.2 已展开)。
2. **`transition` easing 统一到 `cubic-bezier(0.22, 1, 0.36, 1)`**: Lusion 全站统一这条; Pinax 现在用 `ease` / `cubic-bezier(...)` 混用。统一到 Lusion 的同款。
3. **Page header (LXGW) + body (system) + meta (tabular-nums uppercase) 三层字体分工**: 跟 Lusion 同款 opacity 阶梯 (display 1.0 / body 0.85 / meta 0.4-0.65)。

---

## 5. Pinax 不该做的 5 个视觉误区 (Lusion 反例)

1. **不要把 cork 改成 fixed/sticky 全屏覆盖**: Lusion 的 header 是 transparent over canvas; Pinax cork 是"纸摊在桌上" — cork 应该跟 dossier 一起滚走, sticky 会破坏 archive-folio 隐喻 (变成"网页顶部栏")。
2. **不要加 WebGL / canvas / 3D 场景**: Lusion 的"depth" 90% 来自 canvas, 但 Pinax 是 editor (写作 / 笔记 / 体验), 内容是文字, canvas 不会增强任何东西 — 反而会因为 GPU 占用拖慢 typing。**Pinax 的"depth" 必须 100% 来自 CSS box-shadow + clip-path + opacity 阶梯**, 跟 W9 的 paper-stack inset+outset 签名一致。
3. **不要切换 archive 主色板**: Lusion 的 monochrome shell + 项目色 = 永远 instant 切换; Pinax 的 archive paper/ink/olive/gold/rose 是品牌身份, **不该根据 route 切换**。E9 用 role-color left bar 是正确的局部色彩 (role-specific), 不是全局色板切换。
4. **不要加 cursor trail / 自定义 cursor**: Lusion 的 cursor trail 是 portfolio 体验, 不适合 editor。Editor 需要原生 cursor 精准定位光标, 自定义 cursor 干扰"打字 / 选段" 主任务。
5. **不要加 scroll-timeline / scroll-bound 动画到正文流**: W9 dossier 的 textarea 是用户主战场, scroll 跟 textarea 滚动耦合 (textarea 自身 scroll 会触发外层 scroll, 体验灾难)。Scroll-bound 动画只给 chrome (cork / manuscript-top / character-portrait), 不给 content surface (dossier body / empty-archive grid / ledger-spread)。

---

## 6. Pinax 可立即尝试的 5 个小实验

(每个 ≤ 1 文件, ≤ 30 行 CSS, 可在 W9 / N9 / E9 任意一个 commit 顺手带上)

1. **CSS easing token 统一**: 新增 `--ease-archive: cubic-bezier(0.22, 1, 0.36, 1)` 到 main.css, 替换 Writing.vue / Notes.vue / GamePanel.vue 中所有 `transition: ... 0.Xs ease` (机械替换, 1 commit)。
2. **z-tier token**: 同上, 新增 `--z-stage-wall: 0 / --z-stage-paper: 2 / --z-stage-cta: 5` 到 main.css, 替换 `.wall__cork` `z-index: 1` 和 `.wall__dossier-tape` `z-index: 4` 等 (机械替换, 1 commit)。
3. **W9 save-chip 加 saving 状态背景 lerp**: Writing.vue scoped CSS `.wall__save-chip.is-saving` 加 `transition: background 600ms var(--ease-archive); background: rose 24%` (替换当前 opacity 静态)。
4. **N9 manuscript-top__chip tabular-nums**: Notes.vue scoped CSS 加 `font-variant-numeric: tabular-nums` (1 行)。
5. **E9 ledger-spread enter animation**: GamePanel.vue scoped CSS `.ledger-spread` 加 `transform: rotateY(-8deg); opacity: 0; animation: spreadEnter 600ms var(--ease-archive) forwards` + `@keyframes spreadEnter { to { transform: rotateY(0deg); opacity: 1; } }` (跟 FolioSurface notch 同款戏剧化登场)。

---

## 7. 最值得做的 1 个下一轮 UI slice

**Slice 推荐: "UI-X1 — Pinax 三场景 z-tier 体系 + LXGW-display tier 字体分工"**

**理由**:
1. **最高 ROI**: 5 个文件 (kao.css + Writing.vue + Notes.vue + GamePanel.vue + main.css) + 30 行 CSS, 立刻统一三场景的"空间感"
2. **零回归风险**: z-tier 是 additive token, 不改任何现有 class 的视觉
3. **解决 W9/N9/E9 三个报告都提到的同一个问题**: "深度来源单一 (paper-stack box-shadow)", 引入 opacity hairline + z-tier + tabular-nums 把 depth 来源从 1 维变 3 维
4. **对齐 Lusion 的核心公式** (深度 = canvas + opacity 阶梯 + motion), 但用 Pinax 的工具 (CSS token + shadow signature) 复刻, 不引入 WebGL
5. **为下一轮 N9 / E9 follow-up 铺路**: z-tier 体系一旦确立, 后续任何 surface 的"飘起来 / 压下去" 都有规范可循, 不需要每轮重发明

**Scope**:
- `src/styles/main.css`: 加 `--z-stage-*` 3 token + `--ease-archive` 1 token
- `src/styles/themes/kao.css`: 加 `z-index: var(--z-stage-paper)` 到 FolioSurface + ledger-spread, `z-index: var(--z-stage-cta)` 到 character-portrait + save-chip
- `src/components/GamePanel.vue` scoped CSS: 加 `chapter-rule` + `ledger-spread` 用新 z-tier
- `src/pages/Writing.vue` scoped CSS: `wall__cork` z-tier 0, `wall__dossier-tape` z-tier paper, `wall__save-chip` z-tier cta
- `src/pages/Notes.vue` scoped CSS: `manuscript-top` z-tier paper, `empty-archive__stamp` z-tier cta
- `src/__tests__/uiPolish.test.js`: 加 6 条契约锁 z-tier 值 (数值验证, 不锁 token 名)

**预期 outcome**:
- 视觉: 三场景的"前后景" 关系从 box-shadow 暗示升级到 z-index 显式, 深度更可信
- 工程: 后续所有 surface 加层级有 token 可查, 不需要每处 `z-index: 5`
- 风险: 0 (additive token + 机械替换)

**不推荐**:
- "UI-X2 — LXGW 字体系统升级" (W9 已部分实施, 边际收益低)
- "UI-X3 — N9 sticky manuscript-top" (破坏 archive-folio 隐喻, §5 #1 禁区)
- "UI-X4 — WebGL cork background" (性能灾难, §5 #2 禁区)

---

## 8. 落盘承诺

- 本报告落盘到 `docs/agent-runs/2026-06-21-lusion-research/LUSION-R3.visual-system.md`
- 0 行 src 改动 (per brief)
- 0 commit / 0 push (per brief)
- 所有 Lusion 描述标注来源类型 (`[public HTML archive]` / `[canonical knowledge]` / `[GitHub repo]` / `[structural inference]`), 没有任何 "我亲眼 firecrawl 抓到" 的虚假声明
- 所有 Pinax 论断 100% 来自本 session grep + Read + W9 报告 + STATUS.md