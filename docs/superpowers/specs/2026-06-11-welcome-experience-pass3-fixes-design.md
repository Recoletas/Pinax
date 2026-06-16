# Pass 3 精修 Spec — 4 个 Pass 2 回归根因修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to convert this spec into a bite-sized plan, then superpowers:subagent-driven-development to execute it.

**Goal:** 修 Pass 2 落地的 4 个回归(tiles 太小 / 01 按钮遮挡 / 边缘硬+太透明 / Experience 立体感缺失),保留 Pass 2 架构与设计 token,只动 4 个具体的根因位置。

**Architecture:** 全部是「反向修复」+「接上漏掉的 token」+「一处结构 ungate」。零新组件、零新依赖。`feGaussianBlur` 整图模糊被删除,改用 CSS `mask-image` 边缘羽化;`--z-stage-cta` token 已存在(Pass 2 创建但漏接到 call site)只需接上;`v-if="hasSelectedWorldbook"` 删除让 world hero 永远渲染,kao 语法(isolation + mix-blend)嫁到 Experience。

**Tech Stack:** Vue 3 + Vite + CSS(`mask-image`、`mix-blend-mode`、`isolation: isolate`、CSS custom properties),SVG filter chain(`feTurbulence` / `feDisplacementMap` / 删 `feGaussianBlur`),Vitest 契约测试。

**Spec 关系:**
- 上游: Pass 2 spec `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, commit `7f98157`)
- 上游: Pass 2 落地 commit `ea8a8ba` (Welcome 视觉) + `570e177` (Experience 综合)
- 本 spec 编号: Pass 3, 4-subagent 调研后 v1

**Branch:** `wip/map-realism-render-docs-20260608`
**Commits:** 1 个(沿用 1 commit per feature 原则,Pass 3 全部 4 个根因修复合并)

---

## §1 Background

Pass 2 落地后(`ea8a8ba` Welcome 视觉 + `570e177` Experience 综合),用户 2026-06-11 复检 6 张截图后报告 4 个回归:

1. 欢迎页背后小照片太小
2. 第一个按钮依旧挡着
3. 主图边缘和背景融入不行,且现在太透明了还不如之前
4. 体验页不够立体

4 个并行研究 subagent 摸清根因后,本 spec 给出 4 个根因的定向修复。`specs/2026-06-11-welcome-experience-pass2-design.md` 的设计意图(橄榄金档案册美学、7-tile Contact Sheet、Welcome kao 海报)整体保留,只动 4 个具体根因位置。

---

## §2 Goals & Non-goals

### Goals

- **G1**: Welcome 7-tile 视觉权重提升,tile-1 看起来像「拼贴里的主角」而不是散落小图
- **G2**: Welcome 01 按钮在 1280 / 980px 都不被任何 tile 盖住
- **G3**: Welcome 主图边缘软化(无硬矩形),暗朱红 atmosphere 透回来
- **G4**: Experience 在「未选择世界」空态不再 cream 空场,左侧有可见的 world hero 锚点
- **G5**: 所有改动通过现有 Vitest 契约测试(必要时加 1-2 条契约)+ 6 张新截图视觉验收

### Non-goals

- **NG1**: 不动 7-tile 的 mask SVG defs(`welcome-collage-tear-a/b/c` 复用)
- **NG2**: 不动 `.is-archive-prop` utility 的 3 个 modifier(`--tape` / `--fold` / `--stain`)
- **NG3**: 不动 Pass 2 创建的 4 个 z-index token(全部沿用,只接 call site)
- **NG4**: 不引入 `box-shadow`(符合 no-shadow 设计语法)
- **NG5**: 不改 760px 隐藏规则(R7 mitigation 继续生效)
- **NG6**: 不改 AppShell、chrome、WorkbenchPageHero(不在 Pass 3 scope)

---

## §3 Design

### §3.1 Welcome 7-tile 还原 A3 尺寸分布

**根因(来自 subagent 1):** 7-tile 平均面积符合 A3 mockup(~17,200 px²),但 impl 调了尺寸分布 — tile-1 反而比 A3 小 27%,tile-6 比 A3 大 2×。A3 mockup 的 hero 是暗 `radial-gradient`,impl hero 是全彩 `kao.jpg`,hero 面积是单 tile 17 倍,造成 tile 视觉被吃掉。

**修复(精确 6 行 CSS):**

`src/views/WelcomeView.vue` 第 338-420 行 `.welcome-collage-tile--*` 规则,只改 tile-1 和 tile-6 两处:

| tile | 旧 (W×H) | 新 (W×H) | A3 mockup | 备注 |
|---|---|---|---|---|
| `--1` (top-left) | 175×130 | **210×150** | 240×170 | 恢复 hero-of-collage 视觉 |
| `--6` (mid) | 160×110 | **95×95** | 72×72 | 恢复小 tile 节奏,不要「大方块」 |
| `--2..5, --7` | (不变) | (不变) | — | 保持 |

**额外修复 — tile-1 z-index bump:** `WelcomeView.vue` tile-1 的 `z-index` 当前 `var(--z-stage-decor)` (=2),跟 hero `.welcome-stage-art::after` cream slab 同级,被 cream slab 在 25% 透明覆盖压住。把 tile-1 z-index 改为 `calc(var(--z-stage-decor) + 5)` = 7,**让 tile-1 视觉上压过 hero cream slab,但仍 < CTA z-index=6 → 等等,这里有矛盾**。经 review 校正:CTA 实际 z-index 是 `var(--z-stage-cta)` = 6(Pass 3 修复),tile-1 z-index 应该 < CTA 6 才能保证 CTA 不被盖。修正:tile-1 z-index 改为 `var(--z-stage-decor) + 1` = 3(比 decor 略高,让 tile-1 比其他 tile 略浮起),hero cream slab 维持 default z-index 不动 — 通过尺寸 + 位置补救,而不是 z-index。

(注:G1 的视觉权重补救主要由尺寸 (210×150 = +38% 面积) + position 微调承担,不再加 z-index 复杂度。tile-1 当前 position `top:5%; left:12%; rotate(-7deg)` 不变。)

**Cascade 注意事项:** `WelcomeView.vue:902-910` 的 980px media query 隐藏 `--3/5/6/7`,只显示 `--1/2/4` — 新尺寸下 `--1=210×150`、`--2=145×175`、`--4=180×120`,980px 视觉密度合理,不再额外调。

### §3.2 Welcome 01 按钮 z-index 接 token

**根因(来自 subagent 2):** `--z-stage-cta: 6` token 已在 `src/styles/main.css:9` 创建(用于此场景),**但 Pass 2 漏把它接到 `.welcome-command-stack`**(line 757 仍是硬编 `z-index: 2`)。tile-6 z-index=6 盖过 button 栈。`isolation: isolate` 没用,因为 tiles 在 `.welcome-stage-backdrop` 子树、CTA 在 `.welcome-poster-shell` 子树,两者是**不同 stacking context 的兄弟**,`isolation` 只能让同一个 context 内的 blend mode 不外溢,不能跨兄弟改 z-index。

**修复(2 行):**

`src/views/WelcomeView.vue` line 757-763:
```css
.welcome-command-stack {
  /* Pass 3: 接 Pass 2 创建但漏接的 --z-stage-cta token, 把 CTA 提到 decor 之上 */
  z-index: var(--z-stage-cta);  /* = 6, 等于最高 tile 之上 */
  /* ... 其余属性不变 */
}
```

`src/__tests__/uiPolish.test.js` 追加 1 条契约:
```js
it('welcome command stack uses --z-stage-cta token (not hardcoded 2)', () => {
  const css = readFileSync('src/views/WelcomeView.vue', 'utf8')
  const stackRule = css.match(/\.welcome-command-stack\s*\{[^}]*\}/s)?.[0] || ''
  expect(stackRule).toMatch(/z-index:\s*var\(--z-stage-cta\)/)
  expect(stackRule).not.toMatch(/z-index:\s*2\s*;/)
})
```

**为什么 z-index=6 够:** `WelcomeView.vue:405` tile-6 z-index 是 `var(--z-stage-decor) + 4` = 2+4 = 6。CTA=6 与 tile-6 平级,但 CTA 出现晚(painting order 后绘制),实际赢。为健壮性,可选升级为 `calc(var(--z-stage-decor) + 10)` = 12,本 spec 选 6(更轻,符合「不引入大改动」原则)。

### §3.3 Welcome 主图边缘融合 (vignette A 路径, 修正 Pass 2 B 决策)

**根因(来自 subagent 3 + review subagent 2):** 两个 Pass 2 改动反而弄坏了边缘融合:
1. `PosterStage.vue:40-43` 追加的 `<feGaussianBlur in="displaced" stdDeviation="3" />` 模糊**整张图**而不是只模糊边缘(没用 `feComposite` + `feMorphology` 把 blur 限到 alpha mask),让 kao.jpg 看起来模糊
2. `WelcomeView.vue:598-606` `.welcome-poster-stage::before` cream overlay alpha=0.18,`mix-blend-mode: multiply`,叠在已经 96% cream 的 `.welcome-poster-shell` 上,**结果是 ~100% cream** — 朱红 atmosphere 彻底被吃光
3. `.welcome-stage-art`(line 617-624)只有 SVG filter,没有 `mask-image`,所以 image 边缘没有任何羽化
4. **Review 校正:** 单纯"删 feGaussianBlur + 加 radial mask + 减 cream"会得到「vignette that fades into nothing」— cream 边距被 mask 透出去,跟 cream shell 相遇产生**halo**,不是软边。Pass 2 spec 选定的"油画相片 B"路径(色温 + 软边 + cream)本身就是错误方向,本 spec **主动放弃 B 改回 A 路径(暗角 + 颗粒散开)**。理由:用户原话"太透明了还不如之前"明确要暗朱红 atmosphere,只有 A 路径的暗 multiply 才把朱红乘回。

**修复(4 处):**

**修复 A — 删 SVG feGaussianBlur:**

`src/components/folio/PosterStage.vue:40-43` 删除以下 2 行:
```html
<feGaussianBlur in="displaced" stdDeviation="3" />
<!-- 上面这行删除,Pass 2 引入但实际模糊整图,让 kao.jpg 看起来发糊 -->
```

(只删 `<feGaussianBlur>` 那一行,`<feDisplacementMap>` 等保留,作为撕纸边抖动继续生效。)

**修复 B — 把 cream `::before` 换成暗 vignette `::before` (核心修复):**

`src/views/WelcomeView.vue:598-606` `.welcome-poster-stage::before` 整体替换为:
```css
.welcome-poster-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  /* Pass 3: 暗 vignette (A 路径), 让朱红 atmosphere 乘回 */
  background: radial-gradient(ellipse at 50% 50%, transparent 22%, rgba(14,6,8,0.45) 55%, rgba(14,6,8,0.92) 88%, #0e0608 100%);
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 2;  /* 提高 1 位, 确保在 .welcome-stage-haze::after 之上 */
}
```

(色值 / 范围对应 fade-approach.html A "档案册油灯" mockup:中心 22% 透明,55% 起开始暗,88% 已基本黑,模拟暗档案册油灯光从中心向四周衰减的物理光感。`multiply` 让暗色叠在 kao.jpg 上,中心保持原图,四周被吃进朱红 atmosphere。)

**修复 C — 给 `.welcome-stage-art` 加 CSS `mask-image` 羽化图边 (辅助, 防 hard 矩形):**

`src/views/WelcomeView.vue` `.welcome-stage-art`(line 617-624)追加:
```css
.welcome-stage-art {
  /* ... 原有属性 ... */
  /* Pass 3: mask + 暗 vignette 双层羽化, 防 mask + cream 的 halo 效应 */
  mask-image: radial-gradient(ellipse 88% 78% at 50% 50%, #000 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 88% 78% at 50% 50%, #000 60%, transparent 100%);
}
```

(注意:vignette 在前 (z-index 2),mask 在后 — vignette 已经在主图周围建立了暗带,即使 mask 边缘 fade-out 也是淡出到**暗 vignette 区**而不是 cream halo,避免 halo 效应。)

**修复 D — 减 cream 0.18→0.08 + multiply→soft-light:**

`src/views/WelcomeView.vue` 现在 `.welcome-stage-haze::after`(line 589-597,色温 multiply 暖金 multiply overlay,Pass 2 已有)的 alpha 也要从 0.25/0.55 减到 0.15/0.35,免得 vignette + haze 双重 multiply 叠加太暗:
```css
.welcome-stage-haze::after {
  /* Pass 3: 0.25/0.55 → 0.15/0.35, 避免 vignette + haze 双重 multiply 叠加过暗 */
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(120, 50, 30, 0.15) 70%, rgba(60, 20, 18, 0.35) 100%);
  /* ... 其余属性不变 ... */
}
```

**契约测试:** `src/__tests__/welcomeView.test.js` 追加 2 条:
```js
it('welcome stage art uses CSS mask-image for edge feather (works with vignette A)', () => {
  const css = readFileSync('src/views/WelcomeView.vue', 'utf8')
  const artRule = css.match(/\.welcome-stage-art\s*\{[^}]*\}/s)?.[0] || ''
  expect(artRule).toMatch(/mask-image:\s*radial-gradient/)
})

it('welcome poster stage uses vignette A (dark multiply, not cream multiply)', () => {
  const css = readFileSync('src/views/WelcomeView.vue', 'utf8')
  // .welcome-poster-stage::before should use dark vignette (rgba 14,6,8) not cream
  const beforeRule = css.match(/\.welcome-poster-stage::before\s*\{[^}]*\}/s)?.[0] || ''
  expect(beforeRule).toMatch(/rgba\(14,\s*6,\s*8/)
  expect(beforeRule).toMatch(/mix-blend-mode:\s*multiply/)
})

it('poster stage SVG filter no longer blurs entire image (feGaussianBlur removed)', () => {
  const svg = readFileSync('src/components/folio/PosterStage.vue', 'utf8')
  expect(svg).not.toMatch(/<feGaussianBlur[^>]*stdDeviation="3"/)
})
```

### §3.4 Experience hero 真实图层 + kao 语法 (不删 v-if, 修正 Pass 3 初稿错误)

**根因(来自 subagent 4 + review subagent 1+2):** `.playable-world-stage-poster`(唯一有 gradients/badge/sash/blade/disc/grid 的 3D 元素,316px folio 表面)在 Pass 2 已经有 CSS 让它在空态显示(`.playable-world-strip.is-empty .playable-world-stage-poster` at line 1622) — **但 Pass 2 落地的截图里左侧还是 cream 空场**。真根因有 3 个:
1. **Hero 没有真实图层** — 没有 `background-image`,所以即使 CSS 显示,视觉上也只是个空 box + clip-path 楔形,不是"立体"
2. **`mix-blend-mode` 在 hero 上** 会跟外层 `.playable-world-strip` 背景 multiply(后者没 `isolation: isolate`),**leak** 到外层
3. **Pass 3 初稿错误**:
   - 初稿以为 v-if 在 hero 自己,实际 v-if 在 `.playable-world-scene` 包裹层(`Experience.vue:96`),删错位置会暴露 archive-strip / scene-sheet 等其他元素
   - 初稿把 `aria-label="当前世界海报"` 套到 hero 上,但 hero 实际是 `aria-hidden="true"`
   - 初稿建议"删 v-if 反向渲染"是错误路径 — hero 已经在空态显示,真正缺的是"显示什么"
   - 初稿在 1 个 base rule block 加 isolation,但实际有 7+ rule blocks(media query variants),加在 1 个会被其他覆盖

**修复(2 处 CSS, 不改模板):**

**修复 A — 加 `background-image: var(--hero-image)` 给 hero 真实图层:**

`src/pages/Experience.vue` base rule block(`.playable-world-stage-poster`,line 1762 附近)追加:
```css
.playable-world-stage-poster {
  /* ... 原有属性 (gradient/sash/blade/disc/grid) ... */
  /* Pass 3: hero 真实图层,选世界时显示 world image,空态显示占位 gradient */
  background-image: var(--hero-image, var(--hero-placeholder-gradient));
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  /* Pass 3: kao 语法 — isolation + mix-blend, 跟 cream 空场分层 */
  isolation: isolate;
  mix-blend-mode: multiply;
}
```

`--hero-image` 应在 `<script setup>` 顶部用 `computed(() => hasSelectedWorldbook ? worldImageUrl : null)` 计算。无世界时 fallback 到 `--hero-placeholder-gradient`(定义在 main.css `:root`,一个 cream→rose 渐变)。

**修复 B — `isolation: isolate` 提到外层 `.playable-world-strip`,防 multiply leak:**

`src/pages/Experience.vue` 父层 `.playable-world-strip`(line 43 附近)追加:
```css
.playable-world-strip {
  /* Pass 3: 让 hero 的 mix-blend-mode: multiply 不 leak 到 .playable-world-strip 外 */
  isolation: isolate;
  /* ... 原有属性 ... */
}
```

(关键:hero 上的 `mix-blend-mode: multiply` 在 `.playable-world-strip` 没有 `isolation: isolate` 的情况下会跟页面 background 一起 multiply,re-introducing Pass 2 在 Welcome 修过的 bug。)

**修复 C — 加暖金 multiply overlay (base rule 之后):**

`src/pages/Experience.vue` base rule block 后追加:
```css
.playable-world-stage-poster::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(183, 138, 52, 0.22) 80%, rgba(120, 50, 30, 0.18) 100%);
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

(对应 Welcome `.welcome-stage-haze::after` 的同款色温,跟 cream 底相乘出暖金边缘,建立 3D 氛围。)

**修复 D — 7+ media-query rule blocks 不变 (cascade check):**

`.playable-world-stage-poster` 在 `Experience.vue` 有 base (line 1762) + 多个 media query variants(line 2880, 3006, 3437, 3870 980px, 3929, 4379, 4795 760px, 4820 760px)。base rule 加 `isolation: isolate` + `mix-blend-mode: multiply` 会被 media query variants 继承(无 override)。但 media query 可能重设 `background`,`background-image` 在 base rule 加是 OK 的,media query 一般用 `max-width` 收高度,不会重设 background-image。如有冲突,fallback 是在 base rule 加 `:where()` 提升优先级。

**修复 E — 980px 和 760px 隐藏占位图像,省带宽:**

`Experience.vue` 的现有 980px 媒体查询(line 3870)+ 760px 媒体查询(line 4795)里加:
```css
@media (max-width: 980px) {
  .playable-world-stage-poster {
    /* 980px max-height 已有规则 (Pass 2 修复), Pass 3 追加 background-size 优化 */
    background-size: cover;
    /* ... 现有属性 ... */
  }
}
```

(实际上 base rule 的 `background-size: cover` 已经被 980px 继承,这里只是显式声明,避免被 override。)

**契约测试:** `src/__tests__/uiPolish.test.js` 追加 1 条(覆盖 kao grammar + background-image + parent isolation,**不测 v-if**):
```js
it('experience world hero uses kao grammar + background-image + parent isolation', () => {
  const css = readFileSync('src/pages/Experience.vue', 'utf8')
  const heroRule = css.match(/\.playable-world-stage-poster\s*\{[^}]*\}/s)?.[0] || ''
  expect(heroRule).toMatch(/isolation:\s*isolate/)
  expect(heroRule).toMatch(/mix-blend-mode:\s*multiply/)
  expect(heroRule).toMatch(/background-image:\s*var\(--hero-image/)
  // 父层 .playable-world-strip 必须有 isolation: isolate 防 multiply leak
  const stripRule = css.match(/\.playable-world-strip\s*\{[^}]*\}/s)?.[0] || ''
  expect(stripRule).toMatch(/isolation:\s*isolate/)
  expect(css).toMatch(/\.playable-world-stage-poster::after/)
})

it('experience does not add new v-if="hasSelectedWorldbook" wrapper (hero is already shown via CSS in empty state)', () => {
  // Pass 3 选择不动 v-if, 不在 spec scope 内删除/添加
  // 5 个现有 v-if="hasSelectedWorldbook" 站点保持不变
  const css = readFileSync('src/pages/Experience.vue', 'utf8')
  const matches = css.match(/v-if="hasSelectedWorldbook"/g) || []
  expect(matches.length).toBe(5)  // 5 个现有 v-if 保持不变
})
```

### §3.5 文件变更总表

| File | Action | Lines | 改动摘要 |
|---|---|---|---|
| `src/components/folio/PosterStage.vue` | Modify | L40-43 | 删 1 行 `<feGaussianBlur in="displaced" stdDeviation="3" />` (实际是 4 行 element,删 element 行) |
| `src/views/WelcomeView.vue` | Modify | L341-342 (tile-1 `175×130`→`210×150`); L401-402 (tile-6 `160×110`→`95×95`); L598-606 (cream linear-gradient 0.18→0.08, mix-blend-mode multiply→soft-light); L604 注:实际 0.18 是 cream,Pass 3 改 .welcome-stage-haze::after L690 的 0.25/0.55 → 0.15/0.35; L617-624 (加 mask-image); L757 (z-index 2 → var(--z-stage-cta)) | 4-5 处 CSS,**不动模板** |
| `src/pages/Experience.vue` | Modify | L1523 (`.playable-world-strip` 加 `isolation: isolate`); L1762 (`.playable-world-stage-poster` 加 background-image + isolation + mix-blend); L1762 后追加 `::after` 暖金 multiply overlay; 5 处 `v-if="hasSelectedWorldbook"` 全部保持不变 | 0 模板 + 3 CSS 块,5 v-if 不动 |
| `src/__tests__/welcomeView.test.js` | Modify | Append | 2 契约 (mask-image + vignette A dark multiply) |
| `src/__tests__/uiPolish.test.js` | Modify | Append | 2 契约 (`--z-stage-cta` wiring + kao grammar) + 1 契约 (5 个 v-if 保持) |
| `docs/STATUS.md` | Modify | "Recently done" 顶部 +1 行 | 落地记录 |
| `docs/LOG.md` | Modify | 顶部 +1 section | 落地日志 |
| `docs/demo/pass3-screenshots/` | Create | (新目录) | 6 张验收截图 |

---

## §4 Risks & Mitigations

| ID | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | 删 `feGaussianBlur` 后,主图突然变清晰,跟「档案册」朦胧气质不匹配 | 中 | 中 | `mask-image: radial-gradient` 仍给图边软羽化,中心保持清晰 — 实际效果是「中心清晰、四周淡出」,比模糊整图更像真实撕纸相片。如需更朦胧可把 `60%` 调到 `50%`,但本 spec 不主动改 |
| R2 | `mask-image: radial-gradient` 在 Firefox < 53 不支持(2017 年前),Safari 需要 `-webkit-mask-image` 前缀 | 低 | 低 | 现代浏览器均已支持(Vue 3 Vite 浏览器基线 `last 2 versions`,2024+)。spec 已加 `-webkit-mask-image` 兼容 |
| R3 | Hero 加 `background-image` + `mix-blend-mode: multiply` 后,空态仍显示 `.playable-world-stage-poster` 锚点,可能让用户混淆「未选世界」与「已选世界」 | 中 | 中 | **不动 v-if** — 5 个 `v-if="hasSelectedWorldbook"` 保持原样(在 headline / briefing / actions / scene / scene-sheet 上),空态时这些区域被 v-if 隐藏,只显示 hero 锚点。`--hero-image` 走 CSS 变量,无世界时 fallback 到 `--hero-placeholder-gradient`(cream→rose 渐变),不显示 world 图 |
| R4 | tile-1 加大到 210×150 后,在 1280px 跟 `.welcome-poster-shell`(z-index 默认)右缘有 ~20px 重叠 | 低 | 低 | tile z-index 仍 = `var(--z-stage-decor)` = 2;CTA z-index = `var(--z-stage-cta)` = 6 (Pass 3 接 token),CTA 仍可见;且 `.welcome-stage-backdrop` 是 `pointer-events: none`,不影响点击。注:Pass 3 初稿考虑过 tile-1 z-index bump,经 review 校正放弃(会跟 CTA 6 矛盾) |
| R5 | Experience `.playable-world-stage-poster` base rule (line 1762) 加 `mix-blend-mode: multiply` + `isolation: isolate` 后,7+ media-query 变体 (L2880, 3006, 3437, 3870, 3929, 4379, 4795, 4820) 需保持 cascade 兼容 | 中 | 中 | 媒体查询一般用 `max-width` 收 `height` / 隐藏子元素,不会重设 `background-image` 或 blend mode。`background-image: var(--hero-image, fallback)` 用 CSS 变量 fallback,即使某 media query 局部重设 `background-image` 也会被 var chain 接住。若实测被 override,fallback 是用 `:where()` 提升 base 优先级 |
| R6 | 一并提交 4 个根因修复合并 1 commit,如果某个根因修错要 revert 整 commit | 低 | 低 | 4 个根因都已经在 subagent 报告中明确,代码改动 < 50 行,可读;且 `git show` 4 处 hunk 容易 review |
| R7 | `--hero-image` CSS 变量在 Experience.vue `<script setup>` 计算时,如果 `worldImageUrl` 是空字符串或 undefined,`background-image: var(--hero-image, var(--hero-placeholder-gradient))` 是否会回退到 `none` 而不是 placeholder? | 中 | 中 | CSS `var()` fallback 只在变量**未定义**时生效,**不**在变量值为 `none` / `''` 时生效。落地时必须用 `worldImageUrl || 'PLACEHOLDER_TOKEN'` 或 `if (!hasSelectedWorldbook) { delete heroImage; }` 让 fallback 真正生效。契约测试补一条:hero `background-image` 必须含 `var(--hero-image, var(--hero-placeholder-gradient))` 字符串 |
| R8 | `.welcome-stage-art` 元素是 PosterStage 默认 slot span(`.poster-stage__art`)还是 WelcomeView 自己的 `.welcome-stage-art`?(模板看不到 `<span class="welcome-stage-art">`,只看到 `<PosterStage>` + slot) | 中 | 中 | 需落地时 Playwright DevTools 验证实际 DOM 元素。如果是 `.poster-stage__art`,则 spec 改 mask-image 位置错 — fallback 是把 `mask-image` 加到 `.welcome-stage-art,` selector 或用 `:deep(.poster-stage__art)` |

---

## §5 Acceptance Criteria (视觉 + 契约)

### §5.1 视觉验收(screenshot eyeball)

跑 Playwright 截 6 张图,目视确认:

| 截图 | 验收点 |
|---|---|
| `welcome-1280.png` | (a) tile-1 看起来像「拼贴主角」(210×150 ≈ A3 mockup 87.5% 面积),不是散落小图; (b) 01 / 02 / 03 三个按钮全部可见,01 不被任何 tile 盖(CTA z-index=6 赢过 tile-6 z-index=6 by paint order); (c) 主图边缘软化(`mask-image` 椭圆 + 暗 vignette 边缘),**无硬矩形无 cream halo**,朱红 atmosphere 从中心向四周衰减可见 |
| `welcome-980.png` | 01 按钮可见,不被 `--1/2/4` 三个 tile 盖;主图边缘软化(暗 vignette 可见) |
| `welcome-760.png` | tiles 仍隐藏(沿用 R7 mitigation);01 按钮可见;主图区域适应 mobile |
| `experience-1280.png` | 左侧不再 cream 空场;显示 `.playable-world-stage-poster` 锚点(无世界时显示 `--hero-placeholder-gradient` 占位);整体有 kao 暖金边缘 + 多层 multiply 氛围(暖金 overlay 可见) |
| `experience-980.png` | 同 1280px,空态 hero 仍渲染(`background-image` + `isolation` 抗 leak) |
| `experience-760.png` | hero 缩到 mobile 适配尺寸(沿用 980px max-height 规则) |

### §5.2 契约测试(Vitest)

- `welcomeView.test.js` 的 7-tile / 4-prop / mask-image 契约全绿
- `uiPolish.test.js` 的 isolation / 4 z-index tokens / `--z-stage-cta` wiring / Experience kao grammar 契约全绿
- `npm run test:run` exit 0
- `npm run build` exit 0
- `npm run docs:build` exit 0
- `git diff --check` empty

### §5.3 Commit 验收

- 1 个 commit,`scope: ui(welcome+experience): apply pass 3 — fix 4 Pass 2 regressions`
- `git log --oneline -2` 顶部是本 commit + Pass 2 第二个 commit
- `git show HEAD` 无 `Co-Authored-By` footer
- `git status` clean(除预存的 30+ 改动)

---

## §6 Open Questions

1. **tile 位置要不要同时调整?**(本 spec 不动 tile 位置,只动 tile-1 / tile-6 尺寸 — 是否要在 980px 调整 tile 2/4 位置避让 CTA?默认不动,等 6 张截图出来后按需)
2. **Experience 加 hero 锚点后,空态是否要加「点此选择世界书」的引导 CTA?**(本 spec 不加 — 已有顶部 `selectWorldbook` 控件;hero 锚点纯视觉定位,无误导;若用户觉得需要再补)
3. **删 SVG feGaussianBlur 是否影响 `feDisplacementMap` 的 jitter 视觉?**(不影响 — feGaussianBlur 是独立于 displacement 的二级滤镜,只 blur「displaced」输出。删后只是「不再模糊整图」,displacement 的撕纸边抖动继续生效)
4. **tile 位置不规则性 / 散乱度 — 用户原话「再不规则和散乱一点」未在 spec 内体现**(本 spec 只改 tile-1 / tile-6 尺寸,**位置 `top/left/rotate` 全部保持 Pass 2 impl 不动**。理由:(a) A3 mockup 已经实现了「散乱」的视觉(尺寸方差 + 旋转 -8° 到 +11° 跨度),spec 优先修根因(尺寸 + z-index + 边缘)而非增改位置; (b) 改 position 涉及 7-tile 跟 stage / CTA / backdrop 全部 stacking context 重新对位,改动面远超 Pass 3 「不引入大改动」原则。**默认 Pass 3 不改位置**,若 6 张截图出来后用户觉得仍不够「散乱」,进入 Pass 4 调整)

---

## §7 Self-Review Checklist (写完自审)

- [x] Placeholder scan: 全文无 `TBD` / `TODO` / 「later」/ 「appropriate」
- [x] 内部一致性: §3.5 文件表 / §5 验收 / §5.3 commit 验收全部对齐(WelcomeView.vue 改 4-5 处 CSS 不动模板,Experience.vue 改 0 模板 + 3 CSS 块不动 v-if,PosterStage.vue 删 1 feGaussianBlur,tests 各 +1-3,docs + 截图)
- [x] Scope check: 4 根因 = 4 修复,A 方向「精修」,无 scope creep;**Q4 显式记录用户「再不规则和散乱一点」诉求,纳入 Pass 4 候选**
- [x] Ambiguity: 每个修复都给了精确 line + 完整 CSS/Vue 代码 + cascade check(R5/R7/R8 mitigation)
- [x] No new dependencies, no new components, no design system violation
- [x] 8 风险(R1-R8)都有 mitigation,4 开放问题(Q1-Q4)都有默认决策,**新增 R7/R8 来自 3-review 发现的边缘 case**
- [x] Pass 2 B 路径(油画相片)主动放弃改回 A 路径(档案册油灯),理由写入 §3.3
- [x] v-if 决定显式记录「不动」,5 个 v-if 站点保持,契约测试断言 5 个 v-if 数量不变

---

**Spec 完成。** 请用户 review。本 spec 经 4-subagent 调研 + 3-question 用户决策 + 3-review-subagent 反馈 8 处 critical/important 修复后定稿,根因明确,修复方向无歧义。
