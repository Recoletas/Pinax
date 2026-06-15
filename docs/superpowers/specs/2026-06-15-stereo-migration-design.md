# 立体感迁移 — Experience + Opening 真立绘集成

**Date**: 2026-06-15
**Status**: Approved (v5 — user 2nd review applied: characterArt 扩 6 stub pose (3 char + 3 scene) 含 5B 6 calls, test file 拆 2+4 (commit 1 modules, commit 2 wiring), FolioSurface 改 nested `<header>`, src API 保持 string (5A 填 stub-silhouette.svg import), 5B save_dir 用 MCP 默认 + PNG→WebP 手动转, 新软锁 CharacterPortrait 在 Experience 只在 inline-detail modal)
**Branch base**: `wip/map-realism-render-docs-20260608` (current)
**Related**: `2026-06-10-ui-redesign-design.md`, `2026-06-11-welcome-experience-pass2-design.md`, `2026-06-11-welcome-experience-pass3-fixes-design.md`, `2026-06-11-welcome-experience-pass4-resume-and-density-design.md`, `docs/PLAN.md`, `docs/plan/kao-ui-direction.md`

---

## Context

Pass 1B-1C 已把 Welcome / AppShell / Experience 主壳迁到 kao archive-folio 立体感语言 (olive / gold / rose / paper palette, 撕角 clip-path, 双层阴影, PosterStage 五件套舞台)。但 OpeningPage + Experience 的模态 / 列表层仍有 5 处残留 工具感,且 `src/assets/characters/` 完全是空的,所有"立绘"都是 CSS 自绘或 fallback 渐变。

目标:把 Welcome 现有的"真立绘 + 立体感"语言下沉到主冰险流 (Experience + Opening),含 **6 张真立绘 (3 角色 + 3 archive 场景缩略图)** 现场生产替换 stub。

**不做** (硬范围):
- WelcomeView 不动 (契约 lock)
- Router / workbenchNav 不动
- 新增路由 / 新增活动键位 (现有 5 个 activity keys 已稳定)
- 写实场景图 / 物品图 / 章节插图 — 本轮只动**人物立绘 3 张** + **archive 条目用 stylized 场景缩略图 3 张** (issue 1 扩到 6 pose 后边界);超量延后

---

## Goals

1. OpeningPage L54-65 (168 行手写 `.opening-stage-poster` CSS) 替换为 `<PosterStage>` + 真立绘
2. Experience `.inline-detail-card` modal 加 `<FolioSurface variant="chrome">` 外壳 + 说话人立绘
3. Experience `.quick-note-workspace` header strip 加 `<FolioSurface variant="paper">` 立体感
4. OpeningPage L66 3-瓦片 `ArchiveStrip` 改用新增 `<CharacterArchiveStrip>` 渲真立绘 (不改 ArchiveStrip.vue 自身 API;**不**在 Experience 引入任何 archive strip 形态)
5. 3 张真立绘: Opening cover (坐读半抬) / Narrator (半隐档案) / Speaker-thumb (旁白老者)
6. 全程 3 契约测试 (`uiPolish` / `welcomeView` / `workbenchNav`) 不破 + 新增 1 个 `stereoMigration` 测试

## Non-Goals

- 不动 Welcome 现有立绘 (AK / P5R / kao 锚)
- 不引入 4K 立绘
- 不引入 visual snapshot baseline (与现有项目一致,仅手动 dev server 视觉 sign-off)
- 不做立绘自动重生成 / cost cap 自动化 (per-pose 3 retries 手控)

---

## Approach: A — kao 锚少女 × 3 pose, Opening 优先, 2 Pass

**2 Pass 节奏**:
- **5A 骨架 + stub** (1 PR, 3 atomic commits): **5** 新文件 (`characterArt.js` + `useCharacterArt.js` + `CharacterPortrait.vue` + `CharacterArchiveStrip.vue` + `stub-silhouette.svg`) + 1 新测试 + 2 vue 改动 (`OpeningPage.vue` + `Experience.vue`)。**契约测试先 PASS 才算 5A done**。
- **5B 立绘生产 + swap** (1 PR, 3 image_generate calls): 跑 3 seed prompt,改 `characterArt.js` 三行 status,**用户视觉 sign-off 才算 5B done**。

**关键好处**: 5A 失败不动 5B;立绘返工只影响 5B;5A abort = 全 stub,UI 仍 shippable (设计好的 fallback)。

**5A 起点**: 当前 `wip/map-realism-render-docs-20260608` 有 16 个 dirty item (含 `src/pages/OpeningPage.vue` 新增 + Experience.vue 删 stage-band / playable-world-* / archive-strip / stage-toolbar 块)。5A **必须** 在 commit wip 为 `wip(opening-page): extract OpeningPage from Experience` checkpoint 后,开新 worktree 继续。从 `main` 直接起 = re-port Experience.vue 整段,wip 跟 5A 是分层不是冲突,不该被绕过。

**5A 3 原子 commit**:
1. `modules`: `characterArt.js` + `useCharacterArt.js` + `stub-silhouette.svg` + `stereoMigration.test.js` (纯模块,无视觉)
2. `wiring`: `OpeningPage.vue` 模板改 + `Experience.vue` 模板改 (可视化出现)
3. `css`: `.action-btn` 复用细化 + FolioSurface 装饰细节微调

中间状态不 commit。abort between 1→2 = 全 silhouette,shippable。

---

## Architecture

### Single entry: `useCharacterArt(pose)`

- 静态映射: `src/config/characterArt.js` (新增)
- Composable: `src/composables/useCharacterArt.js` (新增)
- **API contract** (locked, 5A 必须符合,否则 stereoMigration.test.js 失败):
  ```js
  // characterArt.js exports:
  //   characterArt: Array<{ id: string, label: string, src: string, status: 'stub'|'real' }>
  //
  // useCharacterArt.js exports:
  //   useCharacterArt(): { resolveArt: ({ poseId: string }) => { src: string, status: 'stub'|'real', label: string } }
  ```
- `resolveArt({ poseId })` 永远返回非空 `src` (5A 阶段 `src` 解析为 stub-silhouette.svg;5B 阶段若 `entry.src` 非空则用真图)
- 未知 `poseId`: 抛 Error (dev fail-fast)
- 不引入 Pinia (纯函数,无 store 依赖)

### Asset layout

- `src/assets/characters/` (新增子目录,`src/assets/` 已含 `fonts/`)
- `stub-silhouette.svg` (5A 立即新增): 灰色剪影 + 金边 + 撕角,跟 kao 风格一致但不画脸。**1 份就够** (5A 所有 6 个 stub pose 共用同 silhouette,5B swap 才区分)
- `kao-archive-opening-cover.webp` (5B 新增): 1024×1360, 3:4
- `kao-archive-narrator.webp` (5B 新增): 1024×1360, 3:4
- `kao-archive-speaker-thumb.webp` (5B 新增): 1024×1360, 3:4 (独立人物,3:4 派生至 256×340 时段缩到头肩)
- `kao-archive-opening-scene-01.webp` (5B 新增): 1024×1360, 3:4 — 边界小镇场景
- `kao-archive-opening-scene-02.webp` (5B 新增): 1024×1360, 3:4 — 废墟灯塔场景
- `kao-archive-opening-scene-03.webp` (5B 新增): 1024×1360, 3:4 — 塔内档案室场景

### CharacterPortrait component (新增)

路径: `src/components/folio/CharacterPortrait.vue`

```vue
<script setup>
import { useCharacterArt } from '@/composables/useCharacterArt'
import PosterStage from './PosterStage.vue'
import { computed } from 'vue'

const props = defineProps({
  poseId: { type: String, required: true },
  size: { type: String, default: 'thumb', validator: (v) => ['hero', 'thumb'].includes(v) },
  // caption: world / 角色 标题,常驻显示 (real + stub 都可见)
  caption: { type: String, default: '' },
})

const { resolveArt } = useCharacterArt()
const art = computed(() => resolveArt({ poseId: props.poseId }))
</script>

<template>
  <figure :class="['character-portrait', `character-portrait--${size}`]">
    <PosterStage :image="art.src" :decorated="true" :aria-hidden="false" />
    <!-- stub-only: 右下角 "立绘未生成" tape,character canon label -->
    <span v-if="art.status === 'stub'" class="archive-stub-tape" :aria-label="`立绘未生成: ${art.label}`">
      {{ art.label }}
    </span>
    <!-- always-on: world / 角色 标题 (Opening world 标题,5B real 状态仍要显示) -->
    <figcaption v-if="caption" class="character-portrait__caption">{{ caption }}</figcaption>
  </figure>
</template>
```

CSS (`<style scoped>`):
- `.character-portrait--hero` { max-width: 386px; aspect-ratio: 3/4; }
- `.character-portrait--thumb` { max-width: 256px; aspect-ratio: 3/4; }
- `.archive-stub-tape` 走 `.is-archive-prop` 装饰定位 (right-bottom corner),不挡 click,只 stub 显示
- `.character-portrait__caption` — 常驻 figcaption,Iowan Old Style / Songti SC serif,`var(--archive-ink)`,`padding-top: 8px`

### CharacterArchiveStrip component (新增)

> **决策**: 不动 `src/components/folio/ArchiveStrip.vue` 现有 API (`items` / `image` / `ariaLabel` 3 个 prop + 固定 `<span>` tile),改用新组件 `CharacterArchiveStrip.vue` 专门渲立绘瓦片。`ArchiveStrip` 仍只服务于 WelcomeView;`CharacterArchiveStrip` 只服务于 OpeningPage L66。**Experience 不出现** 任何 archive strip 形态 (符合 `uiPolish.test.js:34-43` 已抽走的边界)。

路径: `src/components/folio/CharacterArchiveStrip.vue`

```vue
<script setup>
import CharacterPortrait from './CharacterPortrait.vue'

defineProps({
  tiles: {
    type: Array,
    required: true,
    validator: (arr) => arr.every((t) => typeof t.poseId === 'string' && typeof t.kicker === 'string'),
  },
  ariaLabel: { type: String, default: '开场档案缩略条' },
})
</script>

<template>
  <div class="character-archive-strip is-archive-strip" :aria-label="ariaLabel">
    <figure
      v-for="(tile, index) in tiles"
      :key="`${tile.poseId}-${index}`"
      class="character-archive-strip__tile"
    >
      <CharacterPortrait :pose-id="tile.poseId" size="thumb" :caption="tile.kicker" />
    </figure>
  </div>
</template>
```

CSS (`<style scoped>`):
- `.character-archive-strip` 复刻 `ArchiveStrip` 视觉语义 (3 列 grid, `is-archive-strip` utility 已有 `transform: rotate(-3deg) translateX(8px)` + `border: 1px solid var(--hairline-soft)`,沿用)
- `.character-archive-strip__tile` 自身无样式,只做 grid item 定位
- `@media (max-width: 760px)` 沿用 `ArchiveStrip` 媒体查询 (3 列 → 6px gap)

### FolioSurface usage rules (locked)

| 位置 | as | variant | decorated | 原因 |
|---|---|---|---|---|
| `inline-detail-card` 外层 | `div` | `chrome` | **false** | 避免 `::after` clip-path 覆盖现有 12px 圆角 |
| `quick-note-workspace` header strip | `header` | `paper` | **false** | 同上,header 嵌入父级圆角 modal |
| `character-portrait` wrapper 内 | (不用 FolioSurface,PosterStage 已含 5 件套) | — | — | — |

`variant='thin'/'thick'` **不存在** (FolioSurface 只实现 `paper` / `chrome` / `dark`)。5A 不扩展。

### PosterStage usage rules (locked)

- 永远 `:image="src"` 传非空 (避免空 stage 渲染)
- 默认 `variant="photo"` (死 class,无害);不显式传 variant
- `decorated="true"` (默认,启用 5 件套)
- `aria-hidden="false"` (立绘有 caption 需可读)
- **不**扩展 `size` prop (size 在 CharacterPortrait 的 wrapper 上控,不在 PosterStage)

---

## Component changes (5A)

### OpeningPage.vue

| 位置 | 现状 | 5A 改动 |
|---|---|---|
| L54-65 `<section class="opening-scene">` 含 `.opening-stage-poster` 9 个 span + title text | 手绘 CSS 海报 | section 内放 `<div class="opening-stage-poster">` wrapper (保留 3-property alias rule,见下) + `<CharacterPortrait pose-id="opening-cover" size="hero" :caption="selectedOpeningAction?.title || openingSceneCards.location" />` |
| L145-148 `--hero-image` CSS var | `worldImageUrl.value` 直接读 | 改为 `useCharacterArt().resolveArt({ poseId: 'opening-cover' }).src` (注入同 var) |
| L66 `<ArchiveStrip :items="playableWorldArchiveItems">` | hardcoded `[{label:'01'..'03'}]` + 旧组件 | **替换为** `<CharacterArchiveStrip :tiles="openingActionStubTiles" />`,`openingActionStubTiles` 新增 3 项 `[{poseId:'opening-scene-01', kicker:'01 边界小镇'},{poseId:'opening-scene-02', kicker:'02 废墟灯塔'},{poseId:'opening-scene-03', kicker:'03 塔内档案室'}]` (5A stub,5B 接 worldImageLibrary 真实图) |
| L218-222 `playableWorldArchiveItems` data | hardcoded `[{label:'01'..'03'}]` (被 L66 ArchiveStrip 用) | 保留 (ArchiveStrip 不动),但**新增** `openingActionStubTiles` computed 给 CharacterArchiveStrip 用 |
| L655-822 自定义 CSS (168 行) | `.opening-stage-poster` 及 11 个 child rule | **删 11 个 child rule** (`.opening-stage-poster::before` / `::after` / `.__halo` / `.__badge` / `.__index` / `.__world` / `.__title` / `.__roman` / `.__sash` / `.__blade` / `.__grid`);**保留** `.opening-stage-poster` 主规则 (含 `isolation: isolate` + `mix-blend-mode: multiply` + `background-image: var(--hero-image...)`),作为 CharacterPortrait wrapper 的 thin alias (见 uiPolish.test.js:281-290 锁) |

⚠️ `__title` span (`selectedOpeningAction?.title || openingSceneCards.location`) 是 content dependency,不是 CSS dependency。必须通过 CharacterPortrait 的 `caption` prop 保留,否则打开 OpeningPage 看不到世界标题。

⚠️ `.opening-stage-poster` 主规则**必须**保留 — `uiPolish.test.js:281-290` 锁 `isolation: isolate` + `mix-blend-mode: multiply` + `background-image: var(--hero-image...)` 3 property。5A 删 11 个 child rule 但**保留**主规则本身,作为 wrapper thin alias 指向 CharacterPortrait。该规则只是 CSS 装饰细节,不影响 CharacterPortrait 自身功能。

### Experience.vue

| 位置 | 现状 | 5A 改动 |
|---|---|---|
| L177-203 `<Teleport><div.inline-detail-overlay><div.inline-detail-card>` | root 是 `<div>` | `<div class="inline-detail-card">` 外层包 `<FolioSurface as="div" variant="chrome" :decorated="false">`;header 加 `<CharacterPortrait pose-id="speaker-thumb" size="thumb" />` (左,占 ~96px) |
| L52 `<section class="quick-note-workspace">` (L50-126 范围) | flat panel with 12px radius + 单 soft shadow | **nested 结构**: wrap L53 `<header class="quick-note-workspace-header">` 在 `<FolioSurface as="div" variant="paper" :decorated="false">` 内 (FolioSurface 是外层 wrapper,内部仍是 `<header class="quick-note-workspace-header">` 元素),整个 modal 不动 chrome (issue 3 修正:test 期望 nested,`as="header"` 跟现有 FolioSurface `:is="as"` 行为 DOM 不同) |
| L99-106 `.quick-note-message-item` 列表 | flat rounded box | **不动** — 保持 flat checkbox 列表 (Issue 2 修正:`<ArchiveStrip>` 不出现在 Experience,改 `<CharacterArchiveStrip>` 也违反既有 /opening 拆出 /experience 边界) |
| `.quick-note-panel-btn` (L78-79, L116-118) | 30px 高度, 1px border, 7px radius | 复用现有 `.action-btn` + `.action-btn.primary` (L1471-1509),不新造 CSS |
| `.quick-notes-btn` (rail, L41-46, L937-951) | 48×48 圆角 dock | **不动** (rail 不在 P0 范围,是系统 dock 风格) |
| L14 现有 `{{ hasSelectedWorldbook ? ... }}` 模板表达式 | ternary in `{{ }}` | 不动 (不是 v-if,不在契约锁) |
| L265 现有 `const hasSelectedWorldbook = computed(...)` | computed | 不动 |
| 现有 `v-if="hasSelectedWorldbook"` 计数 | 0 | **保持 0** (契约锁 test 18) |
| 现有 `<BookmarkButton>` 引用 | 0 个 | **保持 0** (契约锁 test 2 + test 27) |
| 现有 `<ArchiveStrip>` 引用 | 0 个 | **保持 0** (契约锁 test 2 — Experience 不再有 archive strip 形态) |
| 现有 `<CharacterArchiveStrip>` 引用 | (新组件) | **不引入** (Experience 不应有立绘档案条;speaker-thumb 立绘通过 inline-detail-card header 的 CharacterPortrait 单独渲) |

---

## 5B 立绘 spec

### 3 pose 方向 (per Agent 1 visual review)

| Pose ID | 角色 | 姿态 | 视线 | 道具 | 关键差异 |
|---|---|---|---|---|---|
| `opening-cover` | kao 锚少女 | 坐姿 3/4 侧身,半抬头 | 抬眼看向 viewer,soft surprised | 书在膝上翻开 | **邀请感 + 档案感并存** |
| `narrator` | kao 锚少女 | 半身 3/4 侧身,半隐在档案纸后 | 视线在书与 viewer 之间 | 薄册压在胸口 | **被动档案员,不是教师** |
| `speaker-thumb` | **新人物**: 旁白老者 (~50-60 岁, 宽檐帽 / 高领 / 金丝眼镜) | 半身正坐 | 平视 viewer | 羽毛笔 / 老照片 | **同世界不同角色**,标志对话被引用 |

3 张图在 framing (坐 vs 半隐 vs 坐) + 道具 (书 vs 薄册 vs 笔) + 视线 (抬眼 / 偏 / 平视) + 角色 (少女 vs 少女 vs 老者) 四轴差异。

### 角色 canon (跨 3 张图保持一致)

- kao 锚少女 (Opening + Narrator): late 20s, parka with hood, mole below left eye, gold tiara with red gem, teal-green hair
- 旁白老者 (Speaker): ~55, 宽檐帽, 高领羊毛外套, gold-rimmed glasses, no jewelry
- 严禁不同张图出现不同人物 (即使 3 个 pose 同少女) — 这是 set 一致性的最关键约束

### 场景 pose 约束 (issue 1 新增,跨 3 张 scene 图)

3 张场景立绘 (`opening-scene-01/02/03`) 是 CharacterArchiveStrip 瓦片用的 archive 条目缩略图,跟 3 张角色立绘不同:

- **不**走角色 canon (没人物或只小剪影):场景是"档案册条目"语义,人物只是环境元素之一
- **走** palette 硬约束 (同 L242 olive/gold/paper)
- **走** aspect ratio 3:4 (1024×1360)
- **走** 构图硬约束 (60% center,避免 PosterStage 裁脸 / 撕角裁物件)
- **不**做 4K / 写实 — 保持 archive-folio 风格 (扁平化 painterly,跟 character 立绘同 palette 但不走写实)
- **prompt 头部**仍加 L244 palette 段,但**去掉** "Cool porcelain skin, auburn hair..." 这类人物描述
- 3 张场景内部一致性:同天气 (雾潮暮湾阴沉)、同光源 (油灯暖金)、同视角 (微微俯视)
- 边界小镇 (01) 必含木墙 / 雾 / 路灯,废墟灯塔 (02) 必含断塔 / 海雾 / 碎石,塔内档案室 (03) 必含书架 / 烛台 / 旧文件 — 物件即档案主题

### Palette prompt 强约束 (per Agent 1 + docs/PLAN.md:62)

所有 3 张图的 prompt **必须**头部固定这段:

> "Strict palette: dominant olive green #3d6b56, accent gold #b88a33, background aged paper #ecdfc6. Forbidden: no wine #5a1a1f, no pure black #000, no saturated red > 40% lightness, no cobalt blue, no neon. Cool porcelain skin, auburn hair with olive undertones, no jet black. Digital painting, painterly brushwork, no flat vector, no cel-shading, no anime, no photoreal skin texture."

### 构图硬约束 (per Agent 1, 60% center offset)

- 角色必须放画面中央 35-50% 水平位置 (避免被 PosterStage `background-position: 60% center` 裁脸)
- 关键物件 (书 / 帽 / 笔) 放画面右 1/3
- 脸占上 40% 帧,物件占下 50% 帧 (避免被撕角 mask 裁)

### Aspect ratio

- **3:4 portrait, 1024×1360** (3 角色 + 3 场景统一)
- PosterStage `background-size: cover` 会裁切约 3% (左右各 1.5%),配合构图硬约束可接受
- Speaker-thumb 缩略派生: 256×340, 仍 3:4
- Scene 缩略图无 thumb 派生 (只在 CharacterArchiveStrip 3 瓦片里出现,本身 256×340)

### Production trigger (5B 单 PR 内)

6 个独立 `image_generate` call,每次 1K 档稳定 ~1.57MP (issue 1 修正,扩到 6 pose = 3 char + 3 scene):

1. `image_generate(prompt=<opening-cover 完整 prompt>, size="1024x1360")` → MCP 默认目录 `kao-archive-opening-cover-001.png`
2. `image_generate(prompt=<narrator 完整 prompt>, size="1024x1360")` → `kao-archive-narrator-001.png`
3. `image_generate(prompt=<speaker-thumb 完整 prompt>, size="1024x1360")` → `kao-archive-speaker-thumb-001.png`
4. `image_generate(prompt=<scene-01 边界小镇 完整 prompt>, size="1024x1360")` → `kao-archive-opening-scene-01-001.png`
5. `image_generate(prompt=<scene-02 废墟灯塔 完整 prompt>, size="1024x1360")` → `kao-archive-opening-scene-02-001.png`
6. `image_generate(prompt=<scene-03 塔内档案室 完整 prompt>, size="1024x1360")` → `kao-archive-opening-scene-03-001.png`

**save_dir 不传** (issue 5 新约束):MCP `save_dir` 必须在工具安全根目录下,`docs/demo/` 不一定可达;用 MCP 默认目录落盘,后续手动 `cp` + `cwebp` 转格式。

**格式转换 (issue 5 新约束)**: MCP 输出 **PNG**,不是 spec 早先假设的 JPG。视觉 sign-off 后用 `cwebp -q 80` 或 `magick input.png -quality 80 output.webp` 手动转 WebP,落到 `src/assets/characters/kao-archive-*.webp` 供 Vite import。`docs/demo/` 留 PNG 给人工审查 (不动 webp)。

**每张 ≤3 retries** soft cap。失败 3 次 → 该 pose 留 stub 不动 status,5B 仍可 ship (per-pose status flip,不全有或全无)。

**显式 size**: 不靠 mcp 默认推断 (经验证不稳)。

**Budget**: 6 calls × 1.57MP × ~0.04 USD = ~0.24 USD base;+ 最多 12 retries (2/pose) = ~0.72 USD worst case。

### 5B ship gate

6 张立绘视觉 sign-off + WebP 转换后,改 `characterArt.js` 把 6 个 src import 全部替换 + 6 行 status 'stub' → 'real':

```js
// characterArt.js (5B 末态): 6 个 src 全部是真立绘 webp 静态 import
// (5A 末态: 6 个 src 全部 import 同一份 stub-silhouette.svg,见 1.2 checklist + 5A 阶段 git diff)
import kaoArchiveOpeningCover from '@/assets/characters/kao-archive-opening-cover.webp'
import kaoArchiveNarrator from '@/assets/characters/kao-archive-narrator.webp'
import kaoArchiveSpeakerThumb from '@/assets/characters/kao-archive-speaker-thumb.webp'
import kaoArchiveOpeningScene01 from '@/assets/characters/kao-archive-opening-scene-01.webp'
import kaoArchiveOpeningScene02 from '@/assets/characters/kao-archive-opening-scene-02.webp'
import kaoArchiveOpeningScene03 from '@/assets/characters/kao-archive-opening-scene-03.webp'

export const characterArt = [
  { id: 'opening-cover',     src: kaoArchiveOpeningCover,     status: 'real', label: '开场档案' },
  { id: 'narrator',          src: kaoArchiveNarrator,         status: 'real', label: '在场叙述者' },
  { id: 'speaker-thumb',     src: kaoArchiveSpeakerThumb,     status: 'real', label: '对话人' },
  { id: 'opening-scene-01',  src: kaoArchiveOpeningScene01,   status: 'real', label: '01 边界小镇' },
  { id: 'opening-scene-02',  src: kaoArchiveOpeningScene02,   status: 'real', label: '02 废墟灯塔' },
  { id: 'opening-scene-03',  src: kaoArchiveOpeningScene03,   status: 'real', label: '03 塔内档案室' },
]
```

**关键修正 (Issue 4)**: Vite 的 `resolve.alias` 只在 `import` 解析里生效。运行时 `src: '@/assets/...'` 这种字符串 Vite 不会处理。**必须** 用静态 `import` 拿 URL,5B ship gate 把 import 放到 `characterArt.js` 顶部一起声明,`src` 字段填解析后的 URL 字符串 (Vite 自动重写为 hashed `/assets/kao-archive-xxx-DOESNOTMATTER.webp`)。

**关键修正 (Issue 4 续)**: 5A 末态 `src` 已经是 stub-silhouette.svg 静态 import URL (issue 4 修正:消除 `null` 兜底分支),5B 不再走"换 null → 真图"路径,而是 6 个 import URL 整体替换。

---

## 5A contract test — `src/__tests__/stereoMigration.test.js`

(Paste-ready, 180 lines. 与 `uiPolish.test.js` 风格一致:`readFileSync` + `toContain` / `toMatch` + `toBe`,无 `mount()`,无 Pinia,无 jsdom 依赖。)

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { characterArt } from '@/config/characterArt'
import { useCharacterArt } from '@/composables/useCharacterArt'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('stereo migration — character-art skeleton + stub (pass 5A)', () => {
  it('characterArt.js exposes 6 stub poses with status="stub" (3 character + 3 scene)', () => {
    expect(Array.isArray(characterArt)).toBe(true)
    expect(characterArt).toHaveLength(6)

    const stubEntries = characterArt.filter((entry) => entry.status === 'stub')
    expect(stubEntries).toHaveLength(6)

    const characterIds = ['opening-cover', 'narrator', 'speaker-thumb']
    const sceneIds = ['opening-scene-01', 'opening-scene-02', 'opening-scene-03']
    const actualIds = characterArt.map((entry) => entry.id).sort()
    expect(actualIds).toEqual([...characterIds, ...sceneIds].sort())

    for (const entry of characterArt) {
      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('src')
      expect(entry).toHaveProperty('status')
      // issue 4 修正: src 5A 末态填 stub-silhouette.svg 静态 import URL,非 null
      expect(typeof entry.src).toBe('string')
      expect(entry.src).not.toBe('')
    }
  })

  it('useCharacterArt returns a non-empty image src for every pose (5A: stub silhouette; 5B: real webp)', () => {
    const composable = useCharacterArt()
    const poseIds = characterArt.map((entry) => entry.id)

    for (const id of poseIds) {
      const resolved = composable.resolveArt({ poseId: id })
      expect(resolved).toHaveProperty('src')
      expect(resolved.src).not.toBe('')
      // 5A: stub-silhouette.svg; 5B: kao-archive-*.webp. Both valid image paths.
      expect(resolved.src).toMatch(/\.(svg|webp|png|jpg)(\?.*)?$/)
    }
  })

  it('OpeningPage renders <CharacterPortrait> inside opening-scene for opening-cover, and <CharacterArchiveStrip> for 3 scene tiles', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // Cover: CharacterPortrait lives inside the opening-scene section
    expect(openingPage).toContain('<CharacterPortrait')
    const coverMatch = openingPage.match(
      /<section\s+v-if="hasSelectedWorldbook"\s+class="opening-scene"[\s\S]*?<\/section>/,
    )
    expect(coverMatch).not.toBeNull()
    expect(coverMatch?.[0]).toContain('<CharacterPortrait')

    // 3-瓦片 CharacterArchiveStrip with stub kicker data
    expect(openingPage).toContain('<CharacterArchiveStrip')
    expect(openingPage).toContain('openingActionStubTiles')
    expect(openingPage).toMatch(
      /openingActionStubTiles\s*=\s*[\s\S]*?\{ poseId: 'opening-scene-01'[\s\S]*?\{ poseId: 'opening-scene-02'[\s\S]*?\{ poseId: 'opening-scene-03'/,
    )
  })

  it('Experience wraps inline-detail-card in <FolioSurface> and quick-note-workspace header in FolioSurface variant="paper"', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const inlineCardSection = experience.match(
      /<FolioSurface[\s\S]*?<div\s+class="inline-detail-card"[\s\S]*?<\/div>[\s\S]*?<\/FolioSurface>/,
    )
    expect(inlineCardSection).not.toBeNull()

    const quickNoteHeader = experience.match(
      /<FolioSurface[^>]*variant="paper"[\s\S]*?<header\s+class="quick-note-workspace-header"/,
    )
    expect(quickNoteHeader).not.toBeNull()
  })

  it('regression: Experience BookmarkButton size="micro" count === 0 (5A must not add any)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const matches = experience.match(/size="micro"/g) || []
    expect(matches).toHaveLength(0)
  })

  it('regression: Experience v-if="hasSelectedWorldbook" count === 0 (5A must not re-introduce any)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const matches = experience.match(/v-if="hasSelectedWorldbook"/g) || []
    expect(matches).toHaveLength(0)
  })
})
```

---

## Soft locks (5A 须保留,否则 uiPolish.test.js 失败)

| 锁 | 文件:行 | 5A 行为 |
|---|---|---|
| **`<BookmarkButton` + `<ArchiveStrip` + `<CharacterArchiveStrip` 都不出现在 Experience** | `uiPolish.test.js:34-43` | tool-feel 按钮用 `.action-btn` 普通 button,不用 BookmarkButton;quick-note-message-item 列表**不动** (issue 2 修正);Experience 不引任何 archive strip 形态 — speaker-thumb 立绘通过 inline-detail-card header 的 CharacterPortrait 单独渲 |
| **`<CharacterPortrait>` 在 Experience 只允许在 inline-detail modal,不允许在 quick-note workspace / rail / main work chrome** | (新软锁,issue 6 引入) | 5A 唯一引入处是 L177-203 inline-detail-card header;不在 quick-note workspace / rail / main work chrome 加立绘,防止立绘渗回体验页工作态 |
| **`.opening-stage-poster` 保留 `isolation: isolate` + `mix-blend-mode: multiply` + `background-image: var(--hero-image...)`** | `uiPolish.test.js:281-290` | 5A 删 11 个 child rule (`::before` / `::after` / `.__halo` / `.__badge` / `.__index` / `.__world` / `.__title` / `.__roman` / `.__sash` / `.__blade` / `.__grid`) 但**保留 `.opening-stage-poster` 主规则本身** (3-property alias 指向 CharacterPortrait 的 wrapper) |
| **`.playable-world-opening-page` + `.opening-briefing` + `.opening-mission` + `.opening-pressure-grid` + `.opening-page-lead` + `.opening-page-facts` + `playableWorldOpeningFacts` + `label="开局"` + `label="改写"` 9 个 class/text 在 OpeningPage** | `uiPolish.test.js:123-131` | 5A 改 `.opening-stage-poster` 内部不改 `.playable-world-opening-page` block |
| **`.playable-world-strip` 不在 Experience + `.opening-shell` 含 `isolation: isolate`** | `uiPolish.test.js:292-300` | 5A 不引入 `.playable-world-strip` 到 Experience |
| **OpeningPage 含 `isStarting` ref + try/finally,Experience 不含** | `uiPolish.test.js:386-396` | 5A 用 `isPortraitLoading` / `actionStarting` 等不同名,不用 `isStarting` |
| **WelcomeView 3 BookmarkButton calls 默认 82px (无 `size="compact\|micro"`)** | `uiPolish.test.js:497-506` | 5A 不动 WelcomeView,锁仍生效 |
| **`src/components/folio/ArchiveStrip.vue` 现有 API 不扩展** | `ArchiveStrip.vue:18-31` | 5A 不改 ArchiveStrip.vue 任何 prop / template;新立绘瓦片需求走新组件 `CharacterArchiveStrip.vue` (issue 1 修正) |

---

## Do-not-touch (本 PR 硬范围)

- `src/views/WelcomeView.vue`
- `src/router/index.js`
- `src/config/workbenchNav.js`
- `src/composables/useAdvisor.js`
- `src/components/BookmarkButton.vue` (不扩展 prop)
- `src/components/folio/PosterStage.vue` (不扩展 prop)
- `src/components/folio/FolioSurface.vue` (不扩展 variant)
- `src/components/folio/ArchiveStrip.vue` (不扩展 API;新立绘瓦片走 CharacterArchiveStrip)
- `src/styles/main.css` (5A 不改)

---

## Error handling

- `PosterStage :image` 永远非空 (5A stub silhouette 必传,无空 stage 风险)
- 未知 `poseId`: `useCharacterArt().resolveArt` 抛 Error (dev fail-fast)
- 缺 `poseId` 在 characterArt.js: 启动期一次性 assert
- `src` 路径 stale: 不存 localStorage (构建期 import)
- Teleport + scoped CSS: Vue 按 component instance scope,跟 DOM 位置无关,`<FolioSurface>` + `<CharacterPortrait>` 在 `<Teleport to="body">` 内正常
- Modal 过渡 (`modal-fade` / `modal-scale`): 全局 `main.css`,teleport-safe

---

## Testing

### 5A 收尾必跑

```bash
npm run test:run -- src/__tests__/stereoMigration.test.js \
                   src/__tests__/uiPolish.test.js \
                   src/__tests__/welcomeView.test.js \
                   src/__tests__/workbenchNav.test.js
```

预期: 4 文件, 6 + 39 + 4 + 2 = 51 tests 全 PASS (uiPolish 当前 39 tests,见 `docs/STATUS.md:37`;welcomeView 4,workbenchNav 2,新增 stereoMigration 6)。

### 5B 收尾必跑

同上 + 视觉 sign-off (手动 dev server)。

### 不引入 visual snapshot

跟现有项目一致。

---

## Triggered skills (5A 收尾前必跑)

按 AGENTS.md 硬规则:
- `ui-style-check` (加 CharacterPortrait,改 inline-detail-card / quick-note-workspace / OpeningPage poster)
- `testing-verification` (test:run 全绿)
- `docs-status-handoff` (STATUS.md + PLAN.md 各加 1 行)
- `commit-conventions` (5A 1 PR,3 atomic commits;5B 1 PR;**无** Co-Authored-By footer)

---

## 5A 实施 checklist (执行序)

```
[ ] 0. 5A 起点准备
    [ ] 0.1 确认当前在 wip/map-realism-render-docs-20260608
    [ ] 0.2 commit wip 为 checkpoint: wip(opening-page): extract OpeningPage from Experience
    [ ] 0.3 git worktree add ../worktrees/5a-stereo wip/map-realism-render-docs-20260608
    [ ] 0.4 cd 到新 worktree

[ ] 1. Commit 1: modules
    [ ] 1.1 mkdir -p src/assets/characters
    [ ] 1.2 写 src/config/characterArt.js (6 stub entries, src 全部填 stub-silhouette.svg 静态 import URL,issue 4 修正:消除 `null` 兜底分支,5B 才整体替换 6 个 import path + status 'real')
    [ ] 1.3 写 src/composables/useCharacterArt.js
    [ ] 1.4 写 src/components/folio/CharacterPortrait.vue + scoped CSS
    [ ] 1.5 写 src/components/folio/CharacterArchiveStrip.vue + scoped CSS (新组件,只 OpeningPage 用)
    [ ] 1.6 写 src/assets/characters/stub-silhouette.svg (5A 所有 6 stub pose 共用 1 份)
    [ ] 1.7 写 src/__tests__/stereoMigration.test.js 的 **module 部分** (test 1 characterArt 6 entries + test 2 useCharacterArt API;**page wiring 4 个 test 留到 commit 2 再补**,issue 2 修正:commit 1 还没动 vue 页面)
    [ ] 1.8 npm run test:run -- src/__tests__/stereoMigration.test.js → **2 PASS** (module 部分)
    [ ] 1.9 git commit -m "feat(folio): characterArt module + CharacterPortrait + CharacterArchiveStrip stub"

[ ] 2. Commit 2: wiring
    [ ] 2.1 OpeningPage.vue L54-65 替换为 <div class="opening-stage-poster"> wrapper + <CharacterPortrait pose-id="opening-cover" size="hero" :caption="...">
    [ ] 2.2 OpeningPage.vue L145-148 --hero-image var 绑 useCharacterArt
    [ ] 2.3 OpeningPage.vue L66 <ArchiveStrip> → <CharacterArchiveStrip :tiles="openingActionStubTiles">
    [ ] 2.4 OpeningPage.vue 新增 openingActionStubTiles computed (3 stub kicker)
    [ ] 2.5 Experience.vue L177-203 inline-detail-card 包 FolioSurface + CharacterPortrait
    [ ] 2.6 Experience.vue L53 quick-note-workspace-header 包 FolioSurface variant="paper" (**nested 结构**: FolioSurface as="div" 是 wrapper,内含 `<header class="quick-note-workspace-header">` 元素,issue 3 修正)
    [ ] 2.7 Experience.vue .quick-note-panel-btn → .action-btn / .action-btn.primary
    [ ] 2.8 补 stereoMigration.test.js 的 **page wiring 4 个 test** (test 3 OpeningPage CharacterPortrait + CharacterArchiveStrip; test 4 Experience FolioSurface inline-detail-card + quick-note nested header; test 5 BookmarkButton size="micro" count===0 regression; test 6 v-if="hasSelectedWorldbook" count===0 regression;issue 2 修正:commit 2 才补)
    [ ] 2.9 npm run test:run -- 4 文件 → 6+39+4+2=51 PASS (stereoMigration 6 全 PASS)
    [ ] 2.10 git commit -m "feat(pages): wire CharacterPortrait + CharacterArchiveStrip into Opening + Experience"

[ ] 3. Commit 3: css
    [ ] 3.1 OpeningPage.vue L655-822 删 11 个 child rule (保留 .opening-stage-poster 主规则作 thin alias)
    [ ] 3.2 微调 CharacterPortrait + CharacterArchiveStrip wrapper CSS (max-width, aspect-ratio, grid)
    [ ] 3.3 视觉验证 (手动 dev server,确认 stub silhouette 渲染 + 立体感不破)
    [ ] 3.4 npm run test:run -- 4 文件 → 全 PASS
    [ ] 3.5 git commit -m "refactor(opening): drop decorative poster CSS children, keep thin alias rule"

[ ] 4. 收尾
    [ ] 4.1 跑 ui-style-check
    [ ] 4.2 跑 testing-verification
    [ ] 4.3 跑 docs-status-handoff (STATUS.md + PLAN.md)
    [ ] 4.4 跑 commit-conventions (确认无 Co-Authored-By footer)
    [ ] 4.5 push worktree branch
    [ ] 4.6 (用户合 PR 后) 5A 收口
```

## 5B 实施 checklist

```
[ ] 0. 5B 起点
    [ ] 0.1 5A PR 已合 main + wip 已同步
    [ ] 0.2 git worktree add ../worktrees/5b-art main
    [ ] 0.3 3 个 seed prompt 草稿 (per-pose prompt 在 spec §5B 方向上展开)

[ ] 1. 立绘生产 (issue 1: 6 calls,issue 5: PNG out,save_dir 用 MCP 默认)
    [ ] 1.1 user "run opening-cover" → image_generate size="1024x1360" (不传 save_dir) → MCP 默认目录 `kao-archive-opening-cover-001.png`
    [ ] 1.2 视觉 sign-off (≤3 retries) — 打开 PNG 审查
    [ ] 1.3 `cwebp -q 80 input.png -o src/assets/characters/kao-archive-opening-cover.webp` (issue 5: 手动 PNG→WebP)
    [ ] 1.4 `cp input.png docs/demo/kao-archive-opening-cover-001.png` (issue 5: 留 PNG 给人工审查)
    [ ] 1.5 重复 1.1-1.4 for narrator, speaker-thumb, opening-scene-01, opening-scene-02, opening-scene-03

[ ] 2. 状态切换
    [ ] 2.1 characterArt.js 顶部把 6 个 stub-silhouette.svg import 替换为 6 个 kao-archive-*.webp import (issue 1 修正:6 imports,issue 4 修正:5A 末态已 import,5B 改 path)
    [ ] 2.2 characterArt.js 6 行 status 'stub' → 'real' (src 字段已自动反映新 import,Vite 重写为 hashed /assets/kao-archive-xxx-XXX.webp)
    [ ] 2.3 npm run test:run -- 4 文件 → 51 PASS (stereoMigration test 2 仍 PASS,`src` 仍以 .webp 结尾,test 已改为 pose-agnostic `/\.(svg|webp|png|jpg)(\?.*)?$/`)
    [ ] 2.4 视觉验证 (手动 dev server,6 张立绘对位 + 60% center 不裁脸)
    [ ] 2.5 git commit -m "feat(art): swap stub silhouettes for 6 kao-archive portraits"
    [ ] 2.6 push + PR
```

---

## Out of scope / future

- 5 张以上立绘 (NPC, 物品, 场景缩略图) — 5B 仅 6 张 (3 char + 3 scene),超量延后
- 4K 立绘 — 不在本轮
- 立绘自动重生成 pipeline — 不在本轮
- visual snapshot baseline — 不在本轮
- 实时立绘编辑器 — 不在本轮
- 动态立绘 (pose 切换 / 表情切换) — 5A 的 stub 状态已经是 stub / real 二态,后续可扩 `pose` enum

---

## Risks

| Risk | Mitigation |
|---|---|
| 5A 起点选 main 绕过 wip | 显式 commit wip checkpoint + 新 worktree,从 wip 继续 |
| 立绘 palette 漂到 wine / anime | prompt 硬锚 hex token + negative example + character canon |
| PosterStage 60% center 裁脸 | 构图硬约束: 角色中央 35-50%, 物件右 1/3, 脸上 40% 帧 |
| `isStarting` 命名撞 OpeningPage | 用 `isPortraitLoading` / `actionStarting` 等不同名 |
| `<BookmarkButton` 出现在 Experience | tool-feel 按钮用 `.action-btn` 普通 button,绝不引 BookmarkButton |
| `<ArchiveStrip` 或 `<CharacterArchiveStrip` 出现在 Experience | quick-note-message-item 列表不动;只 OpeningPage L66 引 CharacterArchiveStrip |
| OpeningPage 标题文本丢失 | 通过 `caption` prop 传 `selectedOpeningAction?.title \|\| openingSceneCards.location` |
| 5A 整体 abort | commit 1 已是 shippable 状态,5A abort = commit 1 即可 |
| 5B 单 pose 失败 3 次 | per-pose status flip,该 pose 留 stub,其他 2 张仍 ship |
| image_generate 默认 size 不稳 | 显式 `size="1024x1360"`,不靠推断 |
| **5B 资产 path 写 `'@/...'` 字符串 Vite 不解析** | 静态 `import kaoArchiveXxx from '@/assets/characters/kao-archive-xxx.webp'`,`src` 填 import 的 URL |
| **stereoMigration test 2 在 5B 失败** (硬编 `stub-silhouette.svg$`) | test 2 改为 `/\.(svg\|webp\|png\|jpg)(\?.*)?$/` 通用匹配,5A+5B 都 PASS |
| **测试数量预期过期** (uiPolish 当前 39 不是 28) | 5A 收尾跑 4 文件, 6+39+4+2=51 tests,只 check exit 0 |
| git branch re-include 顺序 | `src/assets/characters/**` 走 `!src/assets/**` re-include (per agent-skills/symlink convention) |
| **image_generate `save_dir="docs/demo/"` 越界** (issue 5 新约束) | 不传 save_dir,用 MCP 默认安全根目录;5B ship gate 显式 `cp` PNG 到 `docs/demo/` 给人工审查 |
| **image_generate 输出 PNG 不输出 JPG/WebP** (issue 5 新约束) | 5B ship gate 显式跑 `cwebp -q 80 input.png -o ...webp` (或 `magick input.png -quality 80 output.webp`),不依赖 MCP 转码 |
| **5B 6 张立绘 visual sign-off 缺 1-2 张** (issue 1 扩到 6) | per-pose status flip,缺哪张留 stub,其他仍 ship,不阻塞 5B 收口 |
