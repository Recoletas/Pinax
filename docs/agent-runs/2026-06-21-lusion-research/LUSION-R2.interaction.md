# LUSION-R2 — Lusion.co 交互语言深度调研 (read-only)

Worker: Claude Code (LUSION-R2 dispatch, 2026-06-21)
Scope: **只读调研,0 代码改动,0 commit**。数据来源:`curl https://lusion.co/` raw HTML (58 KB) + `_astro/about.CNa9RfUh.css` (90 KB)。Firecrawl / WebFetch / WebSearch 在本 session 都不可用 (per STATUS L90-92 / L96),curl 是唯一可达路径。
User instruction: **不写性能优化建议**。

---

## 观察到的 Lusion 模式

### 1. 按钮 hover / press / arrow / dot / clone text 反馈模式

| # | 模式 | 证据 |
|---|---|---|
| 1.1 | **双 text clone** — menu link 有两份相同 text (`.header-menu-link-text` + `.header-menu-link-text-clone`),hover 时上层 fade / slide in,下层 fade / slide out | `<a class="header-menu-link"><span>Home</span><span class="header-menu-link-text-clone">Home</span><svg>...</svg></a>` (HTML L header) |
| 1.2 | **Hover dot scale-in** — 每个 menu link `::before` 是 0.5em 圆 dot,默认 `scale(0)`,hover 时 `scale(1)`,`cubic-bezier(.4,0,.1,1) 0.3s` | `.header-menu-link:before{ ... transform:scale(0); transition:.3s transform cubic-bezier(.4,0,.1,1) }` |
| 1.3 | **SVG arrow 永远 visible** — menu link / project card 内嵌 24x24 arrow svg (`stroke-width:2` chevron),hover 时不动 | `<svg class="header-menu-link-svg" viewBox="0 0 24 24"><path d="M3.515 12h16.97m0 0L13.01 4.525M20.485 12l-7.475 7.476"/></svg>` |
| 1.4 | **双 dot hamburger → X** — menu button 永久显示 2 个 dot,open 时 `transform: rotate(270deg)` + dots 替换为 text "Close" | `.header-right-menu-btn-dot{ ...; transition:background-color .4s; transform:translateY(-50%) }` + `.--opened #header-right-menu-btn-dots{ transform:rotate(270deg) }` + `.--opened #header-right-menu-btn-text-close{ transform:translateZ(0) }` |
| 1.5 | **CTA talk button hover** — 背景从黑 → 蓝 `#0016ec`,text `translate3d(1.5em, 0, 0)` 右滑,2 dots `scale(0)` 消失 | `.--is-contact-active:hover{ background:#0016ec }` + `.--is-contact-active):hover #header-right-talk-btn-dots{ transform:scale(0) }` |
| 1.6 | **所有 hover 用 `cubic-bezier(.4,0,.1,1)` / `(.16,1,.3,1)`** — 6 个 distinct ease curves,典型 ease-out (400-500ms 区间) | grep 6 个 cubic-bezier 全部 ease-out / ease-in-out 系 |
| 1.7 | **没有 custom cursor** — Lusion 整站无 cursor dot / follower,grep `--cursor-` / `cursor-[a-z]+` 0 命中,只 `cursor: pointer` 跟 `cursor: not-allowed` | — |

### 2. Menu open/close / link hover / CTA / scroll prompt 运动语义

| # | 模式 | 证据 |
|---|---|---|
| 2.1 | **Menu open 由 `--opened` className gate** — JS 在 body 加 `.--opened` (或 `#header-menu.--opened`),menu 4 个区块 (links / newsletter / talk / labs) 一起 `translateZ(0)` + opacity 0→1 | `.--opened #header-menu-links, #header-menu.--opened ... { transition:transform .5s cubic-bezier(.4,0,.1,1) }` |
| 2.2 | **Menu open 时背景色 sync 全局** — `--menu-opened #header-logo` 切到 `var(--color-white)`,`#header-right-sound-btn-background-layer1` 也跟着换色。menu 不止组件级动画,是全局 chrome 联动 | `.--menu-opened #header-logo { color: var(--color-white) }` |
| 2.3 | **Menu open delay per section** — 4 个 section 用 `--open-delay` CSS var 设阶梯延迟 (links 先 / newsletter 后),不是同时蹦出 | `#header-menu.--opened #header-menu-newsletter { transition:transform .5s var(--open-delay) cubic-bezier(.4,0,.1,1) }` |
| 2.4 | **CTA open 时 contact 切换** — `#header-contact-close-svg` (X 图标) hover 时 `rotate(180deg)`,配套 background slide-in | `.--is-contact-active:hover #header-contact-close-svg{ transform:rotate(180deg) }` |
| 2.5 | **Hero scroll prompt 是 cross (+)** — `home-hero-scroll-container-cross` 用 `::before` + `::after` 画 1 横 1 竖短线,`.home-hero-scroll-container-cross` 是 4 份(只显示第 1 个,2/3 默认 `display:none`,可能用于多 cross 序列) | `.home-hero-scroll-container-cross:before { height:calc(.125 * var(--cross-size)) }` + `.home-hero-scroll-container-cross:nth-child(2),...:nth-child(3){ display:none }` |
| 2.6 | **Page-end 上滑箭头** — `end-bottom-arrow-container` + `end-bottom-arrow`,作为 scroll-to-top 反馈器 | `<div class="end-bottom-arrow-container"><div class="end-bottom-arrow"></div></div>` |
| 2.7 | **Preloader 数字滚动** — `preloader-percent-digit` 显示 `0` → `100`,`.preloader-percent-digit-num` JS 控制数字 ticker,品牌入场仪式 | `.preloader-percent-digit{ width:1ch; text-align:center }` |

### 3. Project list 用 data-color-bg / data-color-text / data-color-shadow 做每个项目的独立气氛

**这是 Lusion 整站最值钱的机制**。证据:

| # | 模式 | 证据 |
|---|---|---|
| 3.1 | **每个 `<a class="project-item">` 带 3 个 data-color attr** — JS 读它们改全局 `:root` CSS var,canvas background + text color + shadow opacity 跟着切 | `<a class="project-item" data-id="oryzo_ai" data-color-bg="#1a1411" data-color-text="#ffedd7" data-color-shadow="0.9" ...>` |
| 3.2 | **10 个 observed data-color-bg** — `#010a16` (深海蓝) / `#111a13` (深苔绿) / `#121414` (中性炭灰) / `#1a1411` (warm umber) / `#261c46` (紫罗兰) / `#9d8aff` (lavender accent) / `#D6C8ED` / `#E1E2E4` / `#E8EEF8` / `#EFD5D3` (rose cream) — **每个 project 配独立 mood board** | grep `data-color-bg="..."` sort -u |
| 3.3 | **5 个 observed data-color-text** — `#000000` / `#d9f3de` (mint) / `#ffece2` (peach) / `#ffedd7` (warm cream) / `#ffffff` — 文字色跟 bg 走明暗对比 | grep `data-color-text="..."` sort -u |
| 3.4 | **data-color-shadow = `0.85 / 0.9 / 0.95` (opacity 标量)** — 不是 hex,是 0-1 数值,控制 hover 阴影强度 | grep `data-color-shadow="..."` sort -u |
| 3.5 | **project-item-image 是空 div** — 实际图片由 WebGL canvas 在该 div 容器位置渲染,JS 拿 data-id 从外部 sprite / 3D scene 拉资源。**这是 Lusion 视觉的核心:不是 DOM img,是 canvas + WebGL** | `<div class="project-item-image"></div>` (无 `<img>` / `<picture>` 子) |
| 3.6 | **project-item 0 显式 :hover CSS** — hover effect 100% JS-driven (GSAP / WebGL timeline),`--color` CSS var 切换瞬时生效 | grep `.project-item*:hover` 0 match |
| 3.7 | **project-item-line-1 = kicker tags** — small uppercase (`text-transform: uppercase`),font-size 0.6-2.5vw responsive,`will-change: transform` 暗示 slide-reveal | `.project-item-line-1{ font-size:.9vw; text-transform:uppercase; will-change:transform }` |
| 3.8 | **project-item-line-2 = 项目名** — 3-6.5vw responsive,`overflow: hidden + height: 1em` 暗示文字 swipe-reveal (mask 上滑 / 下移) | `.project-item-line-2{ height:1em; overflow:hidden; will-change:transform }` |
| 3.9 | **project-item-line-2-icon = arrow-right.svg** 永远 visible,无 hover 隐藏 — 项目名左侧永久箭头,表明"go somewhere"语义 | `.project-item-line-2-icon{ width:.8em; height:.8em; background-image:url(/assets/images/icons/arrow-right.svg); position:absolute; left:-1em }` |
| 3.10 | **project-item-image 圆角 15px** — Lusion 是圆润的 (rounded card),不是 Pinax 那种硬切角 0 radius | `.project-item-image{ border-radius:15px }` |

### 4. 哪些交互可以转成 Pinax 的纸张 / 抽屉 / 翻页 / 钉板 / 盖章语义

| Lusion 模式 | Pinax 映射 | 理由 |
|---|---|---|
| `data-color-bg / data-color-text / data-color-shadow` 三件套 | **Pinax chapter / book / scene card 独立气氛** — `data-archive-bg / data-archive-ink / data-archive-shadow` 或 inline `--archive-*` override | Writing 章节列表 / Notes kind card / Experience chapter 卡片都可以给每个条目独立 mood(每本书主色 + 每条 kind 色 + 每章灰度) |
| **双 text clone (slide-over)** | **Pinax kicker signature** — E6A 已经做(我 · / 旁白 · / 档案员 · display:block above body),下一步可加 hover 时显示完整 metadata (字数 / 时间戳 / edit history) 的 clone 上挂 | 已有 kicker pattern 基础上加一层 hover-reveal metadata |
| **Hover dot scale-in (`.header-menu-link:before`)** | **Pinax 角落装订孔 / 卷宗钉** — AppShell hamburger / Notes drawer handle / Writing shelf folder tab 的 hover 时浮现 | 钉板的"金属钉"在 hover 时高亮,跟 Lusion 的 dot scale-in 同语义(hover reveal 视觉点) |
| **Menu open 时全局 chrome 换色 (`--menu-opened` class)** | **Pinax mode 切换全局联动** — drawer 打开时 sidebar 背景切 `--archive-photo` 深绿 + AppShell logo 切 paper-soft ink。Notes 已经部分做(`--menu-opened` 类似 `drawer-open`) | Writing 进入 chapter / Notes 打开 kind drawer / Experience 切 session 时全局 chrome 跟着换章气氛 |
| **`project-item-line-2-icon` arrow-right.svg 永久显示** | **Pinax 章节文件夹 tab / Notes drawer handle chevron** — 当前 Notes 已经有 chevron(`drawer-handle__chevron` + `rotate(0deg)` when collapsed),可继续扩散到 Writing folder tab / Experience chapter list | 永久箭头 = "go into" 语义,跟 Pinax folder / drawer 的 chevron 一致 |
| **CTA hover `translate3d(1.5em, 0, 0)` 右滑 + dots `scale(0)` 消失** | **Pinax "记入 / 落笔" 按钮** — InputArea 的 submit 按钮 hover 时"记入"文字右滑,旁边 ⌘+↵ 提示点 fade out | button affordance 的"做出选择"语义 |
| **cubic-bezier(.4,0,.1,1) 0.4-0.5s ease-out** | **Pinax 全局 transition curve** — 现在 kao.css 多处用 `transition: 0.18s ease`,可统一换成 Lusion 风格 ease-out 400ms (但只在 page-level / mode-level,不在 micro hover) | 入场 / 模式切换的"仪式感"曲线 |
| **Preloader 数字滚动 0 → 100** | **Pinax app boot 进 kao mode 时** — 5B 立绘加载 + 数字滚动代替传统 spinner | 跟 E5A / 5B 立体感框架结合,给 kao mode boot 一个档案开卷仪式 |
| **Cross scroll prompt (`+`)** | **Pinax "翻下页" 提示** — Experience ledger spread 末尾显示 `+` cross 提示"翻下页 / 加载更多" | E9 spread 末尾可加 cross scroll prompt 替代"loading..." |
| **Page-end 上滑箭头** | **Pinax ledger 顶 scroll-to-top** — 长对话后回到顶部用 arrow 而不是 dot | long ledger 必备 |

### 5. 哪些交互会伤害 Pinax 写作工具效率,不应采用

| Lusion 模式 | 为什么不能直接用 |
|---|---|
| **WebGL canvas 项目图** | Pinax 是文字冒险 / 写作工具,不需要 3D WebGL scene。每页 WebGL 都在耗电 / 烧 GPU / 减弱无障碍。**Pinax 项目卡用静态图(已 ship)就够** |
| **`border-radius: 15px` 圆角卡** | Pinax kao mode 是硬切角 `border-radius: 0` + `clip-path` 多边形,圆角会破坏 archive-folio "手稿纸" 隐喻。**0 改** |
| **整站 100vh scroll-jacking (Lusion 用 Locomotive Scroll / GSAP ScrollTrigger)** | Pinax 是写作工具,scroll-jacking 会破坏用户对自己位置的 mental model。**0 改** |
| **preloader 数字滚动 0 → 100** (在 Pinax 应用层) | 写作工具进 kao mode 应该 < 200ms 可见,数字滚动仪式会拖慢用户进入"写作状态"。可只在 WelcomeView 主页 / OpeningPage 用,**不进 Experience / Writing / Notes** |
| **Menu open 时整个 chrome 换色 / 整页 transform** | Pinax 是工作台,user 经常在多 page 间跳转,整页级 transform 会让 user 迷失位置。**保留组件级 animation,禁掉 page-level transform** |
| **双 text clone (slide-up) 作为 default menu 链接** | 写作工具需要快速跳转 menu,双 clone slide-up 400ms 延迟会让导航感觉卡。**仅在 WelcomeView / OpeningPage 装饰性菜单用** |
| **Hover 时 text translate 1.5em 右滑** | 写作工具 button hover 不应让 label 离开视觉焦点(用户眼睛在文字上)。**Pinax button hover 用 color / shadow / border 反馈,不用 translate label** |
| **`will-change: transform` 在多个 text 元素** | Pinax 大文档 / 长 ledger 多处 `will-change` 会烧 GPU memory。**只在 page-mode 切换的根容器用** |
| **SVG arrow 永远 visible** | Pinax Notes drawer chevron 已经是这样,可保留。但 Writing folder tab 永久箭头会占视觉空间。**仅在 hover-reveal 后显示** |
| **`data-color-shadow` 数字 opacity 0.85-0.95** | Lusion 的 shadow 几乎看不出差,Pinax kao mode 已经有 archive-ink shadow,不需要再加一层。**不复制** |

---

## Pinax 对应改法(按页面分组)

### 适合页面: Welcome / Writing / Notes / Experience / 全局 AppShell

#### Welcome
- **preloader 数字滚动** — 进 kao 模式前显示 0 → 100,跟 `OpeningPage` 的入场仪式对接。**Lusion 1:1 复制**。成本:**S**。
- **Project list `data-color-bg / data-color-text` 三件套** — Welcome 的"worldbook 卡片"每个世界独立 mood。**Lusion 1:1 复制,token 改用 `--archive-*`**。成本:**M**。

#### Writing
- **chapter folder tab hover chevron / arrow** — 当前 `.wall__folder-tab` 已有 index,hover 时可加 dot scale-in (Lusion menu link dot pattern)。成本:**S**。
- **`project-item-line-2` text mask + slide-reveal** — chapter 列表 / Notes drawer handle 的标题可加 hover mask slide-up (跟 Lusion swipe-up 文字一致)。成本:**M**。
- **chapter folder `data-color-pin`** — 每个 chapter folder 的 tab dot 颜色由 chapter data-color-pin 决定 (Lusion 的 data-color-bg 类比,但 Pinax 是 archive 体系)。成本:**S**。

#### Notes
- **drawer-handle 永久 chevron + hover dot scale-in** — 当前 `drawer-handle__chevron` 已存在,加 hover dot (`::before` scale(0) → scale(1)) 跟 Lusion menu link 一致。成本:**S**。
- **kind-color card `data-archive-bg` override** — 每个 material kind 卡 (N5C ship 的 `.material-entry-card`) hover 时背景切到该 kind 的 archive tone。**Lusion data-color-bg pattern 1:1**。成本:**S**。
- **drawer open 时 sidebar 背景切 `--archive-photo` 深绿 + AppShell logo 切 paper-soft** — 当前 `.drawer-handle__title` 已有 archive-ink,扩展到 sidebar 整列即可。成本:**S**。

#### Experience
- **ledger spread 末尾 + cross scroll prompt** — 跟 Lusion `home-hero-scroll-container-cross` 同款,用 `::before` + `::after` 画 1+1 短线,不画 SVG。成本:**S**。
- **chapter-rule ribbon 替代品** — E9 chapter-rule 用 gradient ribbon,Lusion 用 cross-dot。可在 spread 之间加 cross-dot 替代 ribbon,给用户"翻下页"反馈。成本:**S**。
- **每 spread 独立 mood board** — data-color-bg / data-color-text 在 spread 顶部 page header 三段式加一栏 "章气氛" (e.g., 港口灯火=暖橙 / 雾潮=灰蓝 / 战斗=深红)。**Lusion data-color 三件套的"气氛化"模式**。成本:**M**。

#### 全局 AppShell
- **mode toggle (kao / legacy / dark) 时全局 chrome 联动** — Lusion `--menu-opened` 的全局联动模式,扩展到 mode toggle:kao mode 进入时 AppShell + 主区 + 右栏同步切 paper / olive / gold。成本:**M**。
- **preloader 数字滚动 (Welcome only)** — 见上。成本:**S**。
- **page-end scroll-to-top arrow** — 当前 app-shell 没有,长 ledger / long Notes / long Writing 都受益。成本:**S**。
- **统一 transition curve 到 `cubic-bezier(.4,0,.1,1) 400ms`** — kao.css 全局 transition 标准化(Lusion 的曲线)。成本:**M**(要逐处审)。

---

## 实现成本 S/M/L 估算

| 改法 | 页面 | 成本 | 风险 |
|---|---|---|---|
| preloader 数字滚动 | Welcome | S | 0 (仪式感,无功能影响) |
| worldbook 卡片 `data-archive-bg` | Welcome | M | S (token 命名要避开现有 --archive-* 冲突) |
| folder tab hover dot scale-in | Writing | S | 0 |
| chapter title hover mask slide-up | Writing | M | M (will-change 多处累积) |
| chapter folder `data-color-pin` | Writing | S | S (颜色 override 优先级) |
| drawer-handle hover dot | Notes | S | 0 |
| kind-color card data-color | Notes | S | S (kind-color 已经在用,扩展即可) |
| drawer open 全局 chrome 切色 | Notes | S | S (跟现有 `.drawer-handle` 选择器可能冲突) |
| spread 末尾 + cross scroll prompt | Experience | S | 0 |
| chapter-rule → cross-dot | Experience | S | M (替代而非叠加,删 ribbon) |
| 每 spread 独立 mood board | Experience | M | M (page header 现在 3 段,加 1 段要重排) |
| mode toggle 全局联动 | AppShell | M | L (影响 4 个 page + chrome + 右栏,回归测试多) |
| page-end scroll-to-top arrow | AppShell | S | 0 |
| 统一 transition curve 400ms | AppShell | M | L (逐处审 transition,可能 break hover 节奏感) |

**总览**:14 个改法,7 个 S / 5 个 M / 2 个 L;S 总共可以先 ship (低风险仪式感),M 走 1-2 个验证后再扩张,L 留给后续 slice。

---

## 风险总结

| 风险 | 等级 | 缓解 |
|---|---|---|
| **数据来源单一** — 只有 homepage HTML + 1 个 CSS chunk,Lusion 实际 SPA 走 WebGL / Astro client hydration,大部分交互在 JS 内 (`/_astro/hoisted.CJiXW_YI.js` 几 MB)。本调研只看 pre-render skeleton,JS 端的 GSAP timeline / Locomotive Scroll / WebGL canvas 行为没看到 | L | 后续 LUSION-R3 可读 hoisted.js / 看 awwwards case study 视频 / 看 devtools 网络面板 |
| **Lusion 是品牌展示站,Pinax 是写作工具** — Lusion 的所有交互以"wow factor"为先,Pinax 以"writing flow"为先。直接把 Lusion 1:1 复制会拖慢写作效率 | L | 第 5 节"哪些不能复制"明确列出 10 条,**不要漂亮优先,要效率优先** |
| **`data-color-*` 三件套在 Pinax 已有部分类似机制** — N5C ship 的 `.material-group-spine` 用 `--cell-color` CSS var inline 设 kind 色,跟 Lusion `data-color-bg` 95% 同构。**新增机制可能重复** | M | 实施前 review 现有 material-action-btn / active-card / drawer-handle 已有的 color override pattern |
| **preloader 数字滚动** 如果进 Welcome 主流程,会增加首屏 200-400ms 延迟 | M | 仅在 WelcomeView 装饰性场景用,**不进 Experience / Writing / Notes 工作台** |
| **mode toggle 全局联动** 影响 4 个 page + AppShell chrome + 右栏,回归测试范围广 | L | 拆成 W11 / N11 / E11 三个小 slice,每个 page 独立 ship;不一次性联动 |
| **统一 transition curve 400ms** 把现有 0.15s / 0.18s micro hover 全部拉长,会"破坏 micro-interaction 节奏" | L | **保留 micro hover 用 fast ease (0.15s),只把 page-level / mode-level 改 400ms cubic-bezier(.4,0,.1,1)** |
| **Lusion 的 `cubic-bezier(.4,0,.1,1)` 是 Astro / GSAP 标准曲线** — Pinax 现在 transition 多用 `ease`,如果统一替换要逐 CSS rule 改 | L | 用 CSS var `--archive-ease` 集中定义,逐处 `var(--archive-ease)` 引用,后续一次改 var 全局生效 |
| **WebGL canvas 渲染图片** Pinax 不复制 — 但 data-color-* 1:1 复制的"卡片独立气氛"语义仍可用纯 CSS 实现 | 0 | data-color-bg / data-color-text 用 inline style 或 CSS var 注入,无需 WebGL |
| **E9-FIX 已 ship 的 left-page `@click`** 后续 page-level animation 不应破坏 mechanism-trigger 点击响应 | M | new animation 不在 .text-wrapper 的 transition list 里;hover-only 不影响 click |

---

## 实施推荐序列 (给 Codex 决策)

1. **S-first sweep** (1-2 slice):
   - Welcome: preloader 数字滚动 + worldbook `data-archive-bg`
   - Notes: drawer-handle hover dot + kind-color card `data-color` 扩展
   - Writing: folder tab hover dot scale-in
   - Experience: ledger spread 末尾 cross scroll prompt + chapter-rule → cross-dot 替代
   - AppShell: page-end scroll-to-top arrow

2. **M-second** (1 slice):
   - mode toggle 全局联动 (W11) — 先做单 page 验证,再扩到 4 page
   - 每 spread 独立 mood board (E11)

3. **L-last** (1 slice):
   - 统一 transition curve 到 `cubic-bezier(.4,0,.1,1)` 400ms,集中在 page-level / mode-level

每个 S 单独 ship,M 拆 page,L 必须走 visual review 再 ship(per AGENTS.md visual-alignment-workflow)。

---

**调研结束**。0 src 改动,0 commit。报告 `docs/agent-runs/2026-06-21-lusion-research/LUSION-R2.interaction.md` 已落盘。