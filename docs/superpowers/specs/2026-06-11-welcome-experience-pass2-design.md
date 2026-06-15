# WelcomeView + Experience — Pass 2 Design Spec

**Date**: 2026-06-11
**Status**: Draft v3 — post-8-subagent review (round 1 + round 2), awaiting user re-review
**Owner**: Pinax / text-game-framework
**Extends**: [2026-06-10-ui-redesign-design.md](./2026-06-10-ui-redesign-design.md) (Phase A-C 已落地,见 STATUS.md Recently done 2026-06-10 22:15)
**Related**: [docs/src/known-issues.md](../../src/known-issues.md) (本轮新发现 R6/R7/R8 待加入 known-issues 若 mitigation 失效)
**Scope (in)**: `src/views/WelcomeView.vue`, `src/pages/Experience.vue`, `src/styles/main.css` (新增 z-index tokens + 新 utility), `src/components/folio/PosterStage.vue` (追加 1 个 feGaussianBlur)
**Scope (out — do not touch per `docs/STATUS.md:25-27`)**: `src/stores/gameStore.js`, `src/services/worldbookContextBuilder.js`, `src/services/generation*`, `src/components/StatusBar.vue`

## 1. Goal

用户 2026-06-10 晚反馈 4 个问题,在 Phase A-C 落地后仍未完全解决,本轮一次性收齐:

1. **Issue 1 (体验页)**: Experience 页显示还有问题(CTA 倾斜过大 / Hero 标题 640px 溢出 / 浮动层 z-index 打架 / floating bottom 公式散落)
2. **Issue 2 (01 按钮被挡)**: Welcome 页 980px 断点下 01 按钮被拼贴纸片"吃掉"
3. **Issue 3 (主图过渡)**: 主图(kao.jpg)和暗背景之间是硬切 polygon,需要软过渡
4. **Issue 4 (小图散乱)**: 当前 3 张拼贴纸片可读但不够不规则/散乱,需要 Contact Sheet 中密度

4 个问题的设计方向已通过 visual companion (http://localhost:52847/) 锁定:
- **Fade = 油画相片 (B)**
- **Collage = Contact Sheet 中密度 (A3)** — 当前 3 张 → 7 张
- **01 按钮修法 = isolation: isolate (A)**
- **Experience = 一次性综合修 (A)**

## 2. Locked decisions (4)

### 2.1 Fade transition = 油画相片 (B)
来源屏: `fade-approach.html` (用户 2026-06-10 晚选 B)

**机制**(均**新叠加**,非"复用已有"):

1. **主图边缘软边羽化**: 在 `PosterStage.vue` `<filter id="pinax-paper-tear">`(行 19-40)的现有 `feDisplacementMap` 后串 `feGaussianBlur stdDeviation="3"`。
   - 注:虽然屏 B(`fade-approach.html`)用 CSS `filter: blur(14px)` + 0.5 saturate + 0.62 brightness 演示,但 WelcomeView/PosterStage 的实施栈是 **SVG 滤镜链**(已有 feTurbulence + feDisplacementMap),所以在 SVG 层叠加 feGaussianBlur 一致;**不**复制屏 B 的 CSS filter chain(否则要拆现有 mask 链,改面大)。
   - `stdDeviation="3"` 是 SVG userSpaceOnUse 像素单位,对应屏 B 14px CSS blur 的视觉效果约 1/3 ≈ 等效(SVG blur 自带 feDisplacementMap 已乘 6-7 的位移,叠加 3 是软边,不是大模糊)。

2. **色温向暗背景靠**: 在 `WelcomeView.vue` 加新规则 `.welcome-stage-haze::after`(或直接挂在 `.welcome-stage-art::after` 不行 — 见下"冲突澄清")。
   - **冲突澄清**(子 agent #5 round-2 catch):`.welcome-stage-art::after`(`WelcomeView.vue:543-552`)**已被占用**(26% 宽度的 polygon 切纸条 + `clip-path`)。spec v2 写"加到 `.welcome-stage-art::after`"会覆盖现有规则 → **改用 `.welcome-stage-haze::after`**(`.welcome-stage-haze` 在 `WelcomeView.vue:581` 已声明 `inset: 0`,加 `::after` 安全)。
   - 规则: `.welcome-stage-haze::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(120,50,30,0.25) 65%, rgba(60,20,18,0.55) 100%); mix-blend-mode: multiply; }`

3. **Cream overlay 统一基底**: `.welcome-poster-stage::before` 新加(`WelcomeView.vue:501-` 的 `.welcome-poster-stage` 类**目前没有 `::before` 或 `::after`**,`grep` 确认安全)。
   - 规则: `.welcome-poster-stage::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(245,235,221,0.18) 0%, rgba(245,235,221,0.05) 50%, transparent 100%); mix-blend-mode: multiply; z-index: 1; }`
   - `z-index: 1` 让 overlay 在 `.welcome-stage-backdrop`(默认 0)之上,但在 `.welcome-command-stack`(z-index: 2)之下。**注意配合 §2.3 的 `isolation: isolate`**(把 mix-blend-mode 限制在 stage stacking context 内)。

**实现位置总结**:
- `src/components/folio/PosterStage.vue` 行 19-40 `<filter>` 内 `<feDisplacementMap>` 后追加 `<feGaussianBlur stdDeviation="3" />`(1 行 SVG)
- `src/views/WelcomeView.vue` 行 581 `.welcome-stage-haze` 块后追加 `.welcome-stage-haze::after` 规则(7 行 CSS)
- `src/views/WelcomeView.vue` 行 501-510 `.welcome-poster-stage` 块后追加 `.welcome-poster-stage::before` 规则(7 行 CSS)
- **0 template diff,只动 1 个 SVG 节点 + 2 个 CSS 规则**

**brightness 阈值**(R1 mitigation 内联):
- 起点: `PosterStage.vue:126` `filter: saturate(0.95) contrast(0.96) brightness(0.96)` → 96% 亮度
- 叠加 2 层 multiply(色温 0.25-0.55 alpha + cream 0.05-0.18 alpha)后实测约 86-88% 亮度
- **阈值**: 若用户/Codex 主观觉得偏暗,Step 3 第二轮试错: `PosterStage.vue:126` 把 `brightness(0.96)` 改 `brightness(1.10)`;若仍偏暗(目测 < 90%),**改用 `mix-blend-mode: soft-light` 替代 `multiply`** 在两层 overlay 上(暗化收敛到 5% 内,但失去"档案册融入"感)
- 验证手段:Step 7b 1280px 截图肉眼对比 + 浏览器 DevTools `getComputedStyle(...).filter` 看实际值

### 2.2 Collage = Contact Sheet 中密度 (A3)
来源屏: `collage-density.html` (用户 2026-06-11 早选 A3)

**结构变化**: 当前 `WelcomeView.vue:27-29` 3 张 tile (`--a`/`--b`/`--c`) → **7 张 tile** (`--1`/`--2`/.../`--7`)。

**7-tile 精确尺寸 / 位置 / 旋转 / z-index**(直抄 `collage-density.html:49-55` A3 数值,**子 agent #5/#7 round-2 catch**):

| tile | width | height | top | left | rotate | z-index | mask 复用 |
|---|---|---|---|---|---|---|---|
| `--1` | 175px | 130px | 14% | 12% | -7°  | 3 | tear-a (torn-1) |
| `--2` | 145px | 175px |  8% | 36% |  9°  | 5 | tear-b (torn-2) |
| `--3` | 130px |  95px | 30% | 26% | -12° | 2 | tear-c (torn-3) |
| `--4` | 180px | 120px | 28% | 50% |  6°  | 4 | tear-a (torn-1) |
| `--5` | 115px | 110px | 50% | 14% | -4°  | 1 | tear-b (torn-2) |
| `--6` | 160px | 110px | 56% | 32% |  11° | 6 | tear-c (torn-3) |
| `--7` | 120px | 150px | 48% | 60% | -8°  | 2 | tear-a (torn-1) |

- 单位:`px` (跟屏一致;`WelcomeView.vue` 现有 `min(28vw, 420px)` 也是混合 px,无冲突)
- **mask 策略澄清**(子 agent #5 round-2 catch): 屏 A3 用 CSS `clip-path: polygon()`,但 WelcomeView 现有实现是 **SVG `feDisplacementMap` 滤镜 + 内联 `mask-image: url("data:image/svg+xml;utf8,...polygon...")`**(见 `WelcomeView.vue:312-318, 336-337`)。两者**不等价**。**继续用 SVG mask 路径**(已工作,Step 3 加 feGaussianBlur 也是 SVG 链),不切 CSS clip-path(否则失去 feDisplacementMap 的撕纸抖动)。3 套 mask-image SVG 数据 URL **复用现有 `--a/--b/--c`**(`WelcomeView.vue:336, 347, 358`),只是搬到新 tile 上。
- **6px cream 边框**(子 agent #5 round-2 catch):`.welcome-collage-tile` 共享规则(行 303)`border: 6px solid color-mix(...)` 是 Pinax 设计 token 一部分(档案册纸片),**保留**,不切屏 A3 的 1px 黑边。
- **z-index 范围**(子 agent #5 round-2 catch): tile 1-6 是 backdrop 内 stacking,**新加 `--z-stage-decor: 2`** 作为命名(替代裸数字)。WelcomeView tile 与 Experience 5/6 z-index 是不同 stacking context(Welcome 在 `.welcome-stage-poster` 内,Experience 在 `.playable-world-strip` 内),不冲突,但 `isolation: isolate` 让它们物理隔离更安全。

**散落小物**(从 0 → 4 件,精确数值直抄 `collage-density.html:79-103` A3):

| prop | type | top | left/right | rotate |
|---|---|---|---|---|
| `prop-tape-1` | tape | 10% | left 30% | -3° |
| `prop-tape-2` | tape | 44% | right 8% |  6° |
| `prop-fold-1` | corner-fold | 6% | left 10% | — |
| `prop-stain-1` | coffee-stain | 60% | right 18% | 25° |

- 新增 utility class `.is-archive-prop`(`main.css`),只放共享 `box-shadow: none; border-radius: 0; position: absolute;` 等共享属性。`is-archive-prop--tape` / `--fold` / `--stain` 三个 modifier 放各自尺寸 + 渐变。
- `.is-archive-prop` 共享 CSS:
  ```css
  .is-archive-prop { position: absolute; pointer-events: none; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
  .is-archive-prop--tape { width: 70px; height: 20px; background: rgba(245,235,221,0.55); border: 1px solid rgba(183,138,52,0.5); }
  .is-archive-prop--fold { width: 28px; height: 28px; background: linear-gradient(225deg, rgba(0,0,0,0.45) 50%, transparent 50%); box-shadow: none; }
  .is-archive-prop--stain { width: 42px; height: 36px; background: radial-gradient(ellipse, rgba(120, 70, 30, 0.55) 0%, transparent 60%); border-radius: 50%; filter: blur(2px); box-shadow: none; }
  ```

**Test contract 更新**:
- `welcomeView.test.js:14-29` + `uiPolish.test.js:61-80` 当前**不**断言 `welcome-collage-tile--a/b/c` 存在(子 agent #1 round-1 验证 `grep` 0 命中),所以 3 → 7 tile 改名 `--1...--7` 不撞旧断言。
- **新增** 7 个 tile literal 断言(`welcomeView.test.js`):`welcome-collage-tile--1` 到 `welcome-collage-tile--7`
- **新增** 4 个 prop 断言(`welcomeView.test.js`):`is-archive-prop--tape` × 2、`is-archive-prop--fold` × 1、`is-archive-prop--stain` × 1
- **新增** `.welcome-stage-poster` 含 `isolation: isolate` 断言(`uiPolish.test.js`)

### 2.3 01 按钮修法 = isolation: isolate (A)

**根因**(子 agent #1 round-1 验证):
- `WelcomeView.vue:255-258` `.welcome-stage-poster` 当前**无** `isolation`
- 980px 断点(`@media (max-width: 980px)` 行 791-844)下,01 按钮 `.welcome-command-stack` 变 `left: 24px; right: 24px; width: auto`(全宽)
- `.welcome-collage-tile--a` (28vw, `left: -2vw`,`mix-blend-mode: multiply`) 水平覆盖按钮左上 ~256px
- `multiply` 把 cream 纸跟按钮渐变背景相乘 → 视觉上"按钮消失"在纸片里
- 关键澄清: `.welcome-primary-link` **自身无** `z-index`,靠父级 `.welcome-command-stack` 的 `z-index: 2`(`WelcomeView.vue:651`)。isolation 隔离的是 stacking context,不影响父级 z-index。

**修法 — 默认**: 1 行 CSS,在 `WelcomeView.vue:255-258` `.welcome-stage-poster` 加 `isolation: isolate` — 把 mix-blend-mode 限制在 stage stacking context 内,不再泄漏到外层 z-index 2 元素。

**Fallback (R3 mitigation 内联)**: 若 Step 7b 1280px 截图发现 7-tile 失去"穿透暗背景"氛围(子 agent #2 round-1 R3 false dichotomy 指出),Step 5 之后追加一次小修:把 `isolation: isolate` 从 `.welcome-stage-poster` **挪到 `@media (max-width: 980px)` 块内 scoped**,桌面端保留原 multiply(由 980px 断点把按钮变全宽是遮挡的根因,不需在桌面端隔离)。

**决策点**: Step 3/4 完成后先用默认全局 isolation,Step 7b 截图后用户/Codex 决定要不要挪到 980px scoped。

### 2.4 Experience 综合修 (A)
来源: subagent 诊断 `Experience.vue` 4823 行,3 个独立问题。

**980px 断点位置澄清**(子 agent #1/2 round-1 验证):
- `Experience.vue:4752` **已有** `@media (max-width: 980px)` 块(覆盖 `.playable-world-strip::after` / `.playable-world-spread` / `.playable-world-pressure-grid` 等)
- spec v1 写"插在 760px 之前"是错的(file 中 760px 是 WelcomeView 的,不是 Experience 的;Experience 只有 980/640/760 三个断点分别在 4752/4787/3962)
- **正确做法**: 新规则 append 到现有 `4752` 块**内部**,不要在文件新位置插新块(source order 决定 cascade 落点)

**Hero 标题 640px 改**:
- `clamp(38px, 12vw, 54px)` (`Experience.vue:4794`) → `clamp(32px, 9vw, 46px)`

**`.stage-command` 980px 断点内改**(append 到 4752 块):
- **现状实测**(子 agent #7 round-2 critical correction):`Experience.vue:2062` `transform: perspective(600px) rotateY(-18deg) skewX(-14deg)`(**spec v2 错写成 `perspective(1500px) rotateX(10deg) rotateY(-20deg) skewX(-18deg)` 已修正**)
- hover 状态(`Experience.vue:2091`):`transform: translate3d(0, -2px, 0) perspective(600px) rotateY(-18deg) skewX(-14deg)`
- 980px 断点改:**base + hover 同步降级**为 `transform: skewX(-8deg)` 和 `transform: translate3d(0, -2px, 0) skewX(-8deg)`(去掉 perspective + rotateY,只留温和 skewX)
- `transform-origin: left center`(`Experience.vue:2063`)**保留**(skewX 仍需要)
- `min-height: 50px`(原 62px)
- 760px 断点已有 `min-height: 56px`(`Experience.vue:3992`),不需要动

**`.playable-world-stage-poster` 980px 断点内改**(append 到 4752 块):
- 现状: `height: 316px` (`Experience.vue:1764`),640px 断点 246px (`Experience.vue:4801`)
- spec v1 写"高度没限制"是错的(实际 316px)
- **正确做法**: 980px 断点加 `max-height: 280px` + `height: auto`,降 36px 给浮动 dock 留空间

**Z-index 命名 token**(`main.css` `:root` 新加 — 子 agent #1/2 round-1 验证现状):
- 现状(`main.css:4-6`): `--z-floating-rail: 220` / `--z-floating-dock: 240` / `--z-floating-action: 260` **已存在**
- `.mechanism-notice` `z-index: 248` **硬编码**(`Experience.vue:2763`),不是 token
- **本轮新加**(4 个新 token,append 到 main.css 现有 z-index 块之后,行 7-10):
  ```css
  --z-stage-decor:        2;    /* .welcome-collage-tile / 装饰背景层 */
  --z-stage-hero:         5;    /* .playable-world-stage-* 装饰层 */
  --z-stage-cta:          6;    /* .stage-command */
  --z-mechanism-notice: 248;    /* 替换 .mechanism-notice 硬编码 248 */
  ```
- `.mechanism-notice` (`Experience.vue:2763`) 改 `z-index: var(--z-mechanism-notice)`
- **不要**在 main.css 新加 `--z-floating-dock: 240`(已存在,会重复)

**浮动层 bottom 公式统一**:
- 现状: `.mechanism-notice` 默认 `calc(92px + env(safe-area-inset-bottom, 0px))`(`Experience.vue:2761`),980px 断点 86px (`Experience.vue:2948`),640px 断点未改
- `.quick-notes-rail` / `.game-image-gen-rail` 各自有不同 bottom 公式
- 980px 断点(append 到 4752 块)统一改:
  ```css
  .mechanism-notice,
  .quick-notes-rail,
  .game-image-gen-rail {
    bottom: calc(150px + env(safe-area-inset-bottom, 0px));
  }
  ```
- 640px 断点(`Experience.vue:4787`)单独 override mechanism-notice → 维持现状或同步公式

## 3. Implementation order (12 steps, 风险从低到高)

> **Skill triggers per AGENTS.md hard rules**:
> - **Before Step 1 / 4 / 5**(UI 改动): 调 `ui-style-check` skill
> - **Before Step 6b / 7b**(代码完成前): 调 `testing-verification` skill
> - **Step 7c / 7d**(文档同步): 调 `docs-status-handoff` skill
> - **Before Step 8 commits**: 调 `commit-conventions` skill
> 顺序见 AGENTS.md §51: `ui-style-check → testing-verification → docs-status-handoff → commit-conventions`

1. **Step 1**: `main.css` 加 4 个新 z-index token(`--z-stage-decor: 2` / `--z-stage-hero: 5` / `--z-stage-cta: 6` / `--z-mechanism-notice: 248`) + `.is-archive-prop` utility class 及 3 个 modifier(`--tape` / `--fold` / `--stain`) — 0 风险
2. **Step 2**: `WelcomeView.vue:255-258` `.welcome-stage-poster` 加 `isolation: isolate` (1 行) — 0 风险(R3 fallback 见 §2.3)
3. **Step 3**: `PosterStage.vue` `<defs>` 加 `feGaussianBlur stdDeviation="3"` + `WelcomeView.vue` `.welcome-stage-haze::after`(**非 `.welcome-stage-art::after`,已被占**) + `.welcome-poster-stage::before` 加 multiply overlay — 中等风险(R1 brightness 阈值 1.10,fallback soft-light)
4. **Step 6a (TDD,前置 test)**: 加断言(此步跑 test 必红,实现还没改):
   - `welcomeView.test.js`:
     - 7 个 `welcome-collage-tile--1` ... `welcome-collage-tile--7` literal 断言
     - 4 个 prop 断言:`is-archive-prop--tape` × 2、`is-archive-prop--fold` × 1、`is-archive-prop--stain` × 1
   - `uiPolish.test.js`:
     - `.welcome-stage-poster` 含 `isolation: isolate` 断言
     - 4 个新 z-index token 名 literal 断言(`--z-stage-decor` / `--z-stage-hero` / `--z-stage-cta` / `--z-mechanism-notice`)
     - assertion template:`expect(welcomeViewSource).toContain('welcome-collage-tile--1');` 同理 1-7,prop 4 个
5. **Step 4**: `WelcomeView.vue:27-29, 329-360` 3 → 7 tile 重构(table §2.2 7 行数值) + 4 件散落小物(table §2.2 prop 4 行)+ **R6 mitigation**(7-tile 位置避开 left 10%/top 10%(Act 01)和 right 0/top 26-16%(PINAX),table §2.2 已避开 — 7 个 tile 中只有 --3 (top 30% left 26%) 离 Act 01 较近,需 Step 7b 1280px 截图确认不遮挡) + **R7 mitigation**(`@media (max-width: 760px)` 块行 846- 内加 `.welcome-collage-tile { display: none; }` 规则) — Step 6a 断言在此翻绿
6. **Step 5**: `Experience.vue:4752` 980px 块 append 4 条新规则:
   - `.stage-command { min-height: 50px; transform: skewX(-8deg); }`
   - `.stage-command:hover:not(:disabled) { transform: translate3d(0, -2px, 0) skewX(-8deg); }`
   - `.playable-world-stage-poster { max-height: 280px; height: auto; }`
   - 浮动层 bottom 统一(3 个 class 共享 150px 公式)
   - + `Experience.vue:2763` 改 `z-index: var(--z-mechanism-notice)` token
   - + `Experience.vue:4794` Hero 标题改 `clamp(32px, 9vw, 46px)`
   - Step 6a 的 z-index 断言在此翻绿
7. **Step 6b (test 跑全量,前面调 `testing-verification` skill)**:
   - `npm run test:run` 全量
   - `npm run test:run -- src/__tests__/visual-verification.test.js`(若存在)
   - `npm run build`
   - `npm run docs:build`(VitePress 文档构建,STATUS.md 验证矩阵要求,子 agent #8 round-2 catch)
   - `git diff --check`
   - 全部全绿才进 Step 7
8. **Step 7a (dev server)**: `npm run dev` 启动(端口约定 `127.0.0.1:5177` per STATUS.md 历史;若被占,Vite 自动 5178/5179,记录实际端口),访问 `/welcome` `/experience` 返回 200。timeout 60s。
9. **Step 7b (手动截图,前面调 `ui-style-check` skill)**:
   - viewport: 1280×800 / 980×800 / 760×800 三档
   - 路径: `/welcome` 和 `/experience` 共 6 张
   - 工具: Chrome DevTools "Capture full size screenshot"(Ctrl+Shift+P)或 `npx playwright screenshot`
   - 格式: PNG,文件名 `welcome-1280.png` `welcome-980.png` `welcome-760.png` `experience-1280.png` 等
   - 存路径: `docs/demo/pass2-screenshots/`
   - **R8 mitigation**: 若可用 Safari,同尺寸再截一次;若 Safari 在模糊边缘出现 1-2px 灰带,Step 3 把 `feGaussianBlur stdDeviation` 从 3 → 2
10. **Step 7c (STATUS.md,前面调 `docs-status-handoff` skill)**: 在 `Recently done` 顶部新增一条 `2026-06-11 HH:MM CST` 记录,格式参考 STATUS.md 2026-06-10 22:15 entry:
    ```markdown
    - 2026-06-11 HH:MM CST — Claude on wip/map-realism-render-docs-20260608: Pass 2 收尾,4 个 Issue 全部修完(Welcome 主图软过渡 / 01 按钮可见 / 7-tile A3 中密度 / Experience 综合修)。验证:`npm run test:run` (全绿)、`npm run build` (通过)、`npm run docs:build` (通过)、`git diff --check` (clean)。截图见 docs/demo/pass2-screenshots/。
    ```
    + 更新 STATUS.md "Next up" 区域,移除"Welcome/Experience pass 2"或标记 done(子 agent #8 round-2 catch)
11. **Step 7d (LOG.md,前面调 `docs-status-handoff` skill)**: 同步更新 `docs/LOG.md`,本轮是"新 Issue 修完"记录,常规 practice。格式:
    ```markdown
    ## 2026-06-11
    - Pass 2 落地: WelcomeView 主图软过渡 (PosterStage feGaussianBlur + welcome-stage-haze::after + welcome-poster-stage::before)、7-tile A3 中密度 (3→7 tile + 4 件 prop)、isolation: isolate 救 01 按钮; Experience 综合修 (.stage-command skewX(-8deg) / Hero clamp(32px, 9vw, 46px) / .playable-world-stage-poster max-height 280px / 浮动层 bottom 150px / .mechanism-notice z-index token); main.css 4 新 z-index token + .is-archive-prop utility。Spec: docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md (v3 + 8-subagent review)。
    ```
    + 若 R6/R7/R8 fallback 触发,更新 `docs/src/known-issues.md`(子 agent #8 round-2 catch)
12. **Step 8 (commit,前面调 `commit-conventions` skill)**: 按 commit-conventions(无 Co-Authored-By footer,默认 1 个,本轮拆 **2 commit**):
    - **commit 1 (Welcome 视觉)**: Step 1 (main.css token + utility) + Step 2-4 + Step 6a 的 welcomeView/uiPolish 部分。验证: `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js` 全绿再交。
      ```
      ui(welcome): apply pass 2 — soft fade, 7-tile A3 collage, isolation fix

      - PosterStage: feGaussianBlur stdDeviation=3 串在现有 feDisplacementMap 后
      - WelcomeView: 3 tile (--a/b/c) → 7 tile (--1..--7) per A3 mock + 4 件 prop
      - WelcomeView: .welcome-stage-poster isolation: isolate 救 01 按钮 980px
      - WelcomeView: 760px 加 .welcome-collage-tile display: none(R7)
      - WelcomeView: .welcome-stage-haze::after 加色温 multiply, .welcome-poster-stage::before 加 cream multiply
      - main.css: 4 个新 z-index token (--z-stage-decor/hero/cta/mechanism-notice) + .is-archive-prop utility
      - test: welcomeView.test.js 加 7-tile + 4-prop 断言, uiPolish.test.js 加 isolation + 4 token 断言
      ```
    - **commit 2 (Experience 综合)**: Step 5 + Step 6b + Step 7a-7d。验证: `npm run test:run` 全量 + `npm run build` + `npm run docs:build` + `git diff --check` 全绿再交。
      ```
      ui(experience): apply pass 2 — stage-command 降级, 浮动层公式统一

      - Experience.vue:4752 980px 块 append: .stage-command transform/min-height 降级, .playable-world-stage-poster max-height 280px, 浮动层 bottom 150px 统一
      - Experience.vue:2763 .mechanism-notice z-index 用 var(--z-mechanism-notice) 替代硬编码 248
      - Experience.vue:4794 Hero 标题改 clamp(32px, 9vw, 46px) 避免 640px 溢出
      - docs/STATUS.md: Recently done 加 2026-06-11 记录, Next up 移除 pass 2
      - docs/LOG.md: 加 2026-06-11 落地记录
      - docs/demo/pass2-screenshots/: 6 张验证截图
      ```

预估总耗时: ~4 小时,1 个 session 可完成。

## 4. Hard constraints (must not regress)

继承 `2026-06-10-ui-redesign-design.md §4`:
- 14+ WelcomeView class literals 保留(子 agent #1 round-1 验证实际 17+ literal)
- 8 `display:none` shell 保留(`welcome-(persona-note|dossier|...)` × 7 + `welcome-workbench-copy` × 1)
- CSS token contracts (`--accent-text` / `.btn-primary`) 保留

新增:
- `WelcomeView.vue` 的 7 个 `welcome-(persona-note|dossier|...)` literal 仍为 `display:none`(Step 4 改动不触及)
- `isolation: isolate` 加在 `.welcome-stage-poster` 上(Step 2),Step 3/4 改动不能移除
- `main.css:4-6` 现有 z-index token 不删不加,本轮只**追加** L7-10 新 4 个
- 6px cream 边框(`.welcome-collage-tile` 共享规则行 303)**保留**,不改 1px 黑边
- SVG mask 路径(`feDisplacementMap` + 内联 `mask-image` polygon SVG)**保留**,不切 CSS clip-path
- 子 agent #1 round-1 注:`uiPolish.test.js:61-80` 不引 CSS token(只检查 8 个 `display:none` shell + `material-selection-bar` 等具体 class),不是 spec v1 说的"引用 CSS token",这是**表述修正**,非回归

## 5. Risks (8 条)

- **R1 (fade 偏暗)**: 2 层 multiply 叠加 + 现有 brightness(0.96) 实测约 86-88% 亮度。**Mitigation (Step 3 内联,§2.1)**: brightness 阈值 1.10,超阈值 fallback 到 `mix-blend-mode: soft-light`(暗化收敛 5%)。改回软光后失去"档案册融入"感但避免偏暗。
- **R2 (collage test 影响)**: 子 agent #1 round-1 验证现有 test 不断言 `--a/b/c`,3→7 改名安全;**Mitigation (Step 6a 内联)**: 但 7 个新 tile + 4 个 prop 需要新断言,否则改名后丢失 contract。
- **R3 (isolation 影响 blend)**: `isolation: isolate` 让 `welcome-collage-tile` 的 `mix-blend-mode: multiply` 被关进 stage stacking context 内,不再与 stage 外的 `.welcome-stage-act` "Act 01" 和 `.welcome-stage-code` "PINAX" 字 multiply。视觉上,纸片回到 cream 原色。**Mitigation (Step 2/Step 7b 内联,§2.3)**: fallback 为 980px `@media` 块内 scoped isolation(桌面端保留原 multiply);Step 7b 截图后由用户决定。
- **R4 (980px 断点位置)**: 子 agent #2 round-1 验证 `Experience.vue:4752` 已有 980px 块。新规则**必须 append 到该块内部**,不能在文件新位置插新块(否则 source order 冲突,640px 块无法 override)。**Mitigation (Step 5 内联)**: 改前 `grep -n '@media' src/pages/Experience.vue` 确认 4752 块当前内容;改后 `npm run test:run` + 浏览器 980px viewport 验证。
- **R5 (浮动层按钮互点 — 降级 low)**: 子 agent #2 round-1 验证 3 个 floating dock 位置不重叠(`quick-notes-rail` 右上 / `mechanism-notice` 居中底部 / `game-image-gen-rail` 右下),物理上互点概率低。`mechanism-notice` `<Transition>` 3s 自动消失。`pointer-events: auto` 是子按钮层,非 dock 整体,不影响。保留为 low 风险,Step 5 验证。
- **R6 (7-tile 盖字)**: 子 agent #2 round-1 新发现。`WelcomeView.vue:266-292` 右上 "PINAX" `writing-mode: vertical-rl` + 左上 "Act 01" 标签在 `z-index` 默认 0 层(backdrop 内),与新 7-tile 同 backdrop 容器,DOM 顺序后于字面元素 → 视觉上 7-tile 会盖字。**Mitigation (Step 4 内联)**: 7-tile A3 数值检查:Act 01 在 (10px, 10px) ≈ (~1%, ~1%);PINAX 在 (right 10px, top 26px-bottom 16px) ≈ 整个右边缘。7 个 tile (table §2.2) 中 --3 (top 30%, left 26%) 离 Act 01 区域较近但不重叠;--4/--7 (left 50%/60%) 不碰 PINAX 右边缘(因为 PINAX 在 right 10px,7 个 tile 左缘最右是 60%,中间留 ~38% 空间)。**Step 7b 1280px 截图肉眼确认不遮挡**;若遮挡,把 7-tile 改成 `z-index: var(--z-stage-decor)` (2) 让字面元素提到 `z-index: 3`。
- **R7 (760px 断点缺隐藏)**: 子 agent #2 round-1 新发现。`WelcomeView.vue:846` 760px 断点**未**隐藏任何 tile(只在 980px 隐藏 `--b/--c/note`);新增 `--1...--7` 后 760px 无 hide 规则,7 张 tile 在手机端仍渲染 → 性能 + 可读性回归。**Mitigation (Step 4 内联)**: 760px 断点(`WelcomeView.vue:846-` 块内)加 `.welcome-collage-tile { display: none; }`(只保留主图,无可视化拼贴),让验收-3 通过。
- **R8 (3 层滤镜浏览器灰带)**: 子 agent #2 round-1 新发现。`feGaussianBlur` + `mix-blend-mode: multiply` + `isolation: isolate` 三层在 Chrome vs Safari 渲染管线不一致,可能在模糊边缘半透明区出现 1-2px 灰带。**Mitigation (Step 7b 内联)**: 截图时同时跑 Chrome 和 Safari(若可用);若 Safari 出现灰带,改 `feGaussianBlur stdDeviation` 从 3 → 2 缩小模糊半径。若仍灰,记录到 `docs/src/known-issues.md`。

## 6. Acceptance criteria (引用 step 编号)

- [ ] Step 6b 通过: `npm run test:run` 全量 + `npm run build` + `npm run docs:build` + `git diff --check` 全部全绿(`visual-verification.test.js` 若存在则一并跑)
- [ ] Step 7a 通过: `npm run dev` 启动,`/welcome` `/experience` 返回 200
- [ ] Step 7b 截图(共 6 张): `/welcome` × 1280/980/760px + `/experience` × 1280/980/760px,存 `docs/demo/pass2-screenshots/`,文件名格式见 §3 Step 7b
- [ ] 验收-1 (Welcome 页 1280px): 主图与暗背景软过渡明显(目测不再是"切纸刀"硬切) + 7 tile 中心 2/3 聚拢(per A3 数值)+ 01 按钮清晰可见
- [ ] 验收-2 (Welcome 页 980px): 01 按钮**不被**纸片"吃掉"(R6 验证)
- [ ] 验收-3 (Welcome 页 760px): 7 tile 隐藏(只剩主图,R7 验证)
- [ ] 验收-4 (Experience 页 1280px): `.stage-command` 3D 倾斜不再夸张(目测 `skewX(-8deg)`,base + hover 都改了)
- [ ] 验收-5 (Experience 页 640px): Hero 标题不溢出首屏(目测 `clamp(32px, 9vw, 46px)` 起作用)
- [ ] 验收-6 (Experience 页 980px): 浮动层不互点,`mechanism-notice` `z-index` 用 `var(--z-mechanism-notice)` token(DevTools Computed 验证)
- [ ] 验收-7 (STATUS.md): `Recently done` 顶部新增一条 2026-06-11 记录,格式 per §3 Step 7c
- [ ] 验收-8 (LOG.md): 同步更新本轮记录,格式 per §3 Step 7d
- [ ] 验收-9 (commit): 2 commit 落地,无 Co-Authored-By footer,commit message 描述清楚改了什么(per §3 Step 8 templates)

## 7. Out of scope (本轮不碰)

- 不改 `AppShell.vue` / `WorkbenchPageHero.vue` / `QuestLog.vue`
- 不改 `gm-persona/*` 组件
- 不引入新依赖
- 不重写 `PosterStage.vue` 的整个 SVG defs,只追加 1 个 `feGaussianBlur`
- 不调整 palette / typography / 1px hairline 等既定的 grammar-sticky 决策(`2026-06-10-ui-redesign-design.md §3`)
- **不**改 `src/components/folio/*` 其余 3 个组件(Phase B 已落地;`PosterStage.vue` 仅追加 1 个 feGaussianBlur),`welcomeView.test.js` 验证的 `<PosterStage` `<FolioSurface` `<BookmarkButton` `<ArchiveStrip` 引用不删
- 不切 CSS clip-path 替代 SVG mask(保留现有 feDisplacementMap 撕纸抖动)
- 不改 6px cream 边框为 1px 黑边(保留 Pinax 设计 token)

---

## Self-review (v3, post-8-subagent review)

**8-subagent review summary** (round 1 #1-#4 + round 2 #5-#8, 2026-06-11):
- **Round 1**:
  - #1 (code accuracy): 6 处事实错误,均已修
  - #2 (risks): 5 条改 + 3 条新,均已纳入 §5
  - #3 (test contract): 2 处 acceptance 矛盾 + 2 处 assertion 缺失,均已纳入 §3 Step 6a + §6
  - #4 (implementation order): Step 6 拆 TDD + 5 遗漏 step + commit 粒度 2 个,均已纳入 §3 + §6
- **Round 2**:
  - #5 (visual fidelity): 6 个 issue
    - feGaussianBlur stdDeviation=3 vs 屏 B CSS blur 14px 差异 → §2.1 已澄清 SVG vs CSS 不同栈
    - `.welcome-stage-art::after` 已被占 → §2.1 改用 `.welcome-stage-haze::after`
    - 7-tile 缺具体值 → §2.2 加 7 行 table
    - 屏 A3 用 CSS clip-path / WelcomeView 用 SVG mask → §2.2 澄清"继续用 SVG mask"
    - 6px cream 边框 vs 屏 1px 黑边 → §2.2 + §4 澄清"保留"
    - Welcome z-index 2 / Experience 5-6 不同 stacking → §2.2 + §2.4 加 `--z-stage-decor`
  - #6 (cross-section consistency): 8 个矛盾
    - R1/R3/R6/R7 mitigation 未集成 → §3 + §5 均加"内联 (Step X)"标注
    - §7 vs §2.1 folio 措辞 → §7 改"其余 3 个组件,PosterStage 仅追加 feGaussianBlur"
    - 7-tile 缺具体值 → §2.2 已加
    - Step 6 acceptance unreachable → §6 已加 `docs:build`
  - #7 (implementation gaps): 12 处 — 全部 critical 已修
    - 7-tile + 4-prop 表格 → §2.2 已加
    - **`.stage-command` 原值修正** → §2.4 改对(`perspective(600px) rotateY(-18deg) skewX(-14deg)`)
    - `.is-archive-prop` CSS → §2.2 补全 4 个 modifier
    - dev server port / 截图工具 / commit template / TDD assertion template → §3 Step 7a/7b/8 + Step 6a 加
    - 760px hide 在 Step 4 → §3 Step 4 + R7 mitigation 加
  - #8 (project conventions): 12 个 gap
    - commit / STATUS / LOG / docs:build / 4 个 skill triggers / known-issues / Next up / PLAN → §3 Step 6b/7c/7d/8 + 顶部"Skill triggers"块 + §6 + §3 各 step 已加

**Placeholder scan**: 无 TBD/TODO。所有 4 个决策(B / A3 / A / A)有明确 implementation step + 精确数值(table)。

**Internal consistency**:
- §2.1 fade 改 PosterStage SVG defs + WelcomeView `.welcome-stage-haze::after` + `.welcome-poster-stage::before`(已澄清 art::after 冲突)
- §2.2 collage 改 WelcomeView template + main.css `.is-archive-prop` utility,7-tile 数值精确,mask 策略明确"保留 SVG"
- §2.3 改 WelcomeView CSS 1 行 + R3 fallback 明确
- §2.4 改 Experience.vue(`.stage-command` 原值已修正)+ main.css token,4 处改动无文件冲突
- §3 12 步顺序无循环依赖(1→2→3→6a→4→5→6b→7a→7b→7c→7d→8),4 个 skill trigger 嵌入合适位置
- §4 + §7 不冲突(folio 措辞统一)
- §5 R1-R8 全部有 Mitigation 标注集成位置
- §6 9 条 acceptance 引用具体 step 编号 + 验收数值

**Scope check**: 单个 implementation plan,4 个产品改动 + 1 个 utility 新增 + 4 个 token 新增 + 11 个 test 断言新增 + 2 个文档更新 + 2 个 commit。聚焦。

**Ambiguity check**:
- §2.1 "软边 3-4px" → SVG `feGaussianBlur stdDeviation="3"`,具体
- §2.2 7-tile / 4-prop → table 形式列出 width/height/top/left/rotate/z-index/mask
- §2.3 "1 行 CSS" → `WelcomeView.vue:255-258` `isolation: isolate`,具体行号
- §2.4 980px 断点 → append 到 `Experience.vue:4752` 块,具体行号 + 数值
- §3 Step 6a TDD,Step 6b 全量,顺序明确;assertion template 已给
- §3 Step 8 commit 粒度 2 个,template 已给
- §5 R1-R8 全部 Mitigation 内联到 Step X
- §6 9 条引用 step 编号 + 数值

无重大歧义。Ready for user re-review。

---

**User feedback pass** (待): 用户 review 后如有调整,改 §2-§7 后重走 self-review。
