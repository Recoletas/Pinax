# 立体感迁移 5A + 5B 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 welcome 立体感立绘语言下沉到 OpeningPage + Experience,5A 跑 3 atomic commits 把骨架 + 契约测试 + CSS 收口落地,5B 跑 6 image_generate + cwebp 手动 PNG→WebP + characterArt.js swap 把 6 张真立绘换上 stub。

**Architecture:** 5A 一次性落地 4 个新模块 (`characterArt.js` + `useCharacterArt.js` + `CharacterPortrait.vue` + `CharacterArchiveStrip.vue` + `stub-silhouette.svg` 共用) + OpeningPage / Experience 2 个 vue 页面 wiring + 1 个新契约测试 `stereoMigration.test.js` (6 tests: 2 module-level in commit 1 + 4 page wiring in commit 2)。3 个 atomic commit 节奏:modules → wiring → CSS。5B 是 procedure work:per-pose `image_generate` + `cwebp` 手动 PNG→WebP + `cp` PNG 到 docs/demo/ + per-pose status flip,1 commit ship gate。零新依赖、零 router 改动、零 WelcomeView 改动、零 store 改动。

**Tech Stack:** Vue 3 + Vite + Vitest contract tests (readFileSync + regex) + image_generate MCP (gpt-image-2, 1K 档 1024×1360) + `cwebp` (libwebp) 或 `magick` (ImageMagick) PNG→WebP 转换。

**Spec reference**: `docs/superpowers/specs/2026-06-15-stereo-migration-design.md` (commit `d140f00`, v5)
**Branch**: `wip/map-realism-render-docs-20260608` (起点) → `5a-stereo` worktree (5A) → 等合 main → `5b-art` worktree (5B)
**Commits**: 5A = 3 atomic commits (modules / wiring / css),5B = 1 commit (ship gate)。合计 4 commit / 2 PR (5A 1 PR + 5B 1 PR)

---

## File Structure

### 5A — 新增文件 (6)

| File | Lines (approx) | Responsibility |
|---|---|---|
| `src/assets/characters/stub-silhouette.svg` | ~30 | 6 个 stub pose 共用 1 份的灰色剪影 + 金边 + 撕角 SVG,kao archive 风格 |
| `src/config/characterArt.js` | ~15 | 6 个 pose 静态映射 (3 char + 3 scene),5A 末态 src 全部 import stub-silhouette.svg,5B swap 6 个 import path + status 'real' |
| `src/composables/useCharacterArt.js` | ~15 | 纯函数 composable,`resolveArt({ poseId })` 返回 `{ src, status, label }`,未知 poseId 抛 Error |
| `src/components/folio/CharacterPortrait.vue` | ~50 | Folio 风格的 figure 组件,props `{ poseId, size, caption }`,内含 PosterStage + stub tape (status='stub' 时) + figcaption (常驻) |
| `src/components/folio/CharacterArchiveStrip.vue` | ~35 | 3-瓦片立绘缩略条,props `{ tiles: [{poseId, kicker}], ariaLabel }`,内含 CharacterPortrait grid + kicker figcaption |
| `src/__tests__/stereoMigration.test.js` | ~150 | 6 个契约测试:test 1 characterArt 6 entries + test 2 useCharacterArt API (commit 1) + test 3 OpeningPage wiring + test 4 Experience wiring + test 5 BookmarkButton size="micro" count===0 regression + test 6 v-if="hasSelectedWorldbook" count===0 regression (commit 2) |

### 5A — 修改文件 (3)

| File | Lines (approx change) | Responsibility |
|---|---|---|
| `src/pages/OpeningPage.vue` | +30 / -180 (净 -150) | 4 处 wiring:① L54-65 加 `<div class="opening-stage-poster">` wrapper + `<CharacterPortrait pose-id="opening-cover" size="hero" :caption="...">`;② L66 替换 `<ArchiveStrip :items="playableWorldArchiveItems">` 为 `<CharacterArchiveStrip :tiles="openingActionStubTiles">`;③ L145-148 `--hero-image` 绑 `useCharacterArt().resolveArt({ poseId: 'opening-cover' }).src`;④ L218-222 保留 `playableWorldArchiveItems` data + 新增 `openingActionStubTiles` computed;⑤ L655-822 删 11 个 child CSS rule 保留主规则作 thin alias |
| `src/pages/Experience.vue` | +20 / -5 (净 +15) | 3 处 wiring:① L177-203 inline-detail-card 外层包 `<FolioSurface as="div" variant="chrome" :decorated="false">` + header 内加 `<CharacterPortrait pose-id="speaker-thumb" size="thumb">`;② L53 quick-note-workspace-header 在 `<FolioSurface as="div" variant="paper" :decorated="false">` 内 (**nested 结构**);③ L78-79 / L116-118 `.quick-note-panel-btn` → `.action-btn` / `.action-btn.primary` |
| `docs/STATUS.md` | +5 / -2 | 加 5A landing 条目到 "Recently done" + 5B in-flight 条目 |

### 5B — 新增文件 (6 webp + 6 demo png)

| File | Source | Responsibility |
|---|---|---|
| `src/assets/characters/kao-archive-opening-cover.webp` | `cwebp -q 80` of MCP-output PNG | 3 角色立绘之一,1024×1360 3:4,Opening 少女坐读半抬 |
| `src/assets/characters/kao-archive-narrator.webp` | 同上 | Narrator 少女半隐档案 |
| `src/assets/characters/kao-archive-speaker-thumb.webp` | 同上 | 旁白老者平视 |
| `src/assets/characters/kao-archive-opening-scene-01.webp` | 同上 | 边界小镇场景缩略 |
| `src/assets/characters/kao-archive-opening-scene-02.webp` | 同上 | 废墟灯塔场景缩略 |
| `src/assets/characters/kao-archive-opening-scene-03.webp` | 同上 | 塔内档案室场景缩略 |
| `docs/demo/kao-archive-opening-cover-001.png` | `cp` MCP output | 人工审查副本 (PNG) |
| `docs/demo/kao-archive-narrator-001.png` | 同上 | 同上 |
| `docs/demo/kao-archive-speaker-thumb-001.png` | 同上 | 同上 |
| `docs/demo/kao-archive-opening-scene-01-001.png` | 同上 | 同上 |
| `docs/demo/kao-archive-opening-scene-02-001.png` | 同上 | 同上 |
| `docs/demo/kao-archive-opening-scene-03-001.png` | 同上 | 同上 |

### 5B — 修改文件 (1)

| File | Lines (approx change) | Responsibility |
|---|---|---|
| `src/config/characterArt.js` | +6 / -7 (净 -1) | 顶部 6 个 import 从 `stub-silhouette.svg` 改为 6 个 `kao-archive-*.webp`;6 行 `status: 'stub'` → `status: 'real'` (src 字段自动反映新 import) |

---

## Pre-flight (read once before starting)

- **Spec** (authoritative): `docs/superpowers/specs/2026-06-15-stereo-migration-design.md` (v5, commit `d140f00`)
- **Spec R1 mitigation** (5A 末态 src 是 string,非 null): `characterArt.js` 5A 末态必须 6 个 `src` 字段都填 stub-silhouette.svg 静态 import URL,**不允许** null 或空字符串。useCharacterArt 不需要 null 兜底分支。
- **Spec R2 mitigation** (Vite alias 只在 import 解析): 5A + 5B 都**必须**用静态 `import kaoArchiveXxx from '@/assets/...'` 拿 URL,不能写 `src: '@/assets/...'` 字符串。Vite 不会处理运行时字符串里的 alias。
- **Spec R3 mitigation** (`as="header"` vs nested): FolioSurface 在 quick-note 改造用 **nested 结构**:`<FolioSurface as="div" variant="paper" :decorated="false">` 是 wrapper,内含 `<header class="quick-note-workspace-header">` 元素。**不要**写 `as="header"` (FolioSurface `:is="as"` 行为跟嵌套 DOM 不同,test 会失败)。
- **Spec R4 mitigation** (5A test 拆 2+4): commit 1 只写 test 1 + test 2,expect 2 PASS。commit 2 才补 test 3-6,expect 6+39+4+2=51 PASS。**不要**在 commit 1 写完所有 6 个 test (commit 1 还没动 vue 页面,wiring 断言会失败)。
- **Spec R5 mitigation** (5B save_dir 不传): image_generate **不要**传 `save_dir="docs/demo/"` (MCP 安全根可能不包含 docs/demo)。用 MCP 默认目录,5B ship gate 显式 `cp` PNG 到 docs/demo/ 给人工审查。
- **Spec R6 mitigation** (5B 输出 PNG → WebP): MCP image_generate 输出 **PNG**,不是 spec 早先假设的 JPG。5B ship gate 显式跑 `cwebp -q 80 input.png -o output.webp` 手动转,**不要**依赖 MCP 转码。
- **AGENTS.md hard rules**: invoke skills in this order:
  - Before Task 1-3 (test/UI/CSS changes) → `ui-style-check`
  - Before Task 4 / Task 12 (full validation) → `testing-verification`
  - Before Task 4 / Task 12 (docs sync) → `docs-status-handoff`
  - Before Task 4 / Task 12 (final commit) → `commit-conventions`
- **Test runner**: `npm run test:run -- <file>` (Vitest, not `npm test` watch mode)
- **Dev server**: `npm run dev` (Vite, port 5177 default; auto-bumps if occupied)
- **Build**: `npm run build` (Vite production build)
- **Hairline check**: `git diff --check` (whitespace / merge marker safety)
- **5B tools**: 确认 `cwebp --version` 或 `magick --version` 至少一个可用;`cp` 走 coreutils
- **5B image_generate MCP**: 必须用户手动 "run" (per user feedback memory:不主动调图);每张 ≤3 retries,失败留 stub status='stub' 不动

---

# Phase 5A — 骨架 + stub (1 PR, 3 atomic commits)

## Task 0: 5A 起点 — WIP checkpoint + worktree

**Files:**
- (no source file changes)

- [ ] **Step 1: 检查 git 状态**

Run: `git status`
Expected: working tree clean, branch `wip/map-realism-render-docs-20260608`, ahead of origin by 22 commits (含 v5 spec `d140f00` + STATUS `1020136` + 先前累积)

- [ ] **Step 2: 起点确认 — v5 spec + STATUS 已 commit**

Run: `git log --oneline -3`
Expected: 看到 `1020136 docs(status): v5 spec approved,转 writing-plans` 在最顶

- [ ] **Step 3: 创建 5A worktree**

Run:
```bash
git worktree add ../worktrees/5a-stereo -b feat/5a-stereo-migration wip/map-realism-render-docs-20260608
cd ../worktrees/5a-stereo
git status
```
Expected: 在新 worktree,branch `feat/5a-stereo-migration`,working tree clean

---

## Task 1: 5A Commit 1 — modules (characterArt + useCharacterArt + CharacterPortrait + CharacterArchiveStrip + stub-silhouette + 2 module tests)

**Files:**
- Create: `src/assets/characters/stub-silhouette.svg`
- Create: `src/config/characterArt.js`
- Create: `src/composables/useCharacterArt.js`
- Create: `src/components/folio/CharacterPortrait.vue`
- Create: `src/components/folio/CharacterArchiveStrip.vue`
- Create: `src/__tests__/stereoMigration.test.js` (test 1 + test 2 only)

- [ ] **Step 1: 写 `src/assets/characters/stub-silhouette.svg`**

Create directory and write the SVG:

```bash
mkdir -p src/assets/characters
```

Write file `src/assets/characters/stub-silhouette.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1360" width="1024" height="1360">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ecdfc6"/>
      <stop offset="100%" stop-color="#d9c8a8"/>
    </linearGradient>
    <linearGradient id="silhouette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a4a44" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#2a3530" stop-opacity="0.95"/>
    </linearGradient>
    <clipPath id="torn-corner">
      <path d="M0,0 L1024,0 L1024,1320 L1000,1340 L960,1320 L920,1360 L880,1330 L840,1350 L800,1320 L0,1320 Z"/>
    </clipPath>
  </defs>
  <rect width="1024" height="1360" fill="url(#paper)"/>
  <g clip-path="url(#torn-corner)">
    <ellipse cx="512" cy="500" rx="180" ry="220" fill="url(#silhouette)"/>
    <path d="M 200 900 Q 512 700 824 900 L 824 1360 L 200 1360 Z" fill="url(#silhouette)"/>
    <path d="M0,1320 L100,1280 L160,1340 L220,1290 L280,1360 L0,1360 Z" fill="#ecdfc6"/>
  </g>
  <rect x="20" y="20" width="984" height="1320" fill="none" stroke="#b88a33" stroke-width="2" opacity="0.6"/>
</svg>
```

Run: `ls -la src/assets/characters/stub-silhouette.svg`
Expected: file exists, ~1.2 KB

- [ ] **Step 2: 写 `src/config/characterArt.js`**

Create directory and write file `src/config/characterArt.js`:

```js
import stubSilhouette from '@/assets/characters/stub-silhouette.svg'

export const characterArt = [
  { id: 'opening-cover',     src: stubSilhouette, status: 'stub', label: '开场档案' },
  { id: 'narrator',          src: stubSilhouette, status: 'stub', label: '在场叙述者' },
  { id: 'speaker-thumb',     src: stubSilhouette, status: 'stub', label: '对话人' },
  { id: 'opening-scene-01',  src: stubSilhouette, status: 'stub', label: '01 边界小镇' },
  { id: 'opening-scene-02',  src: stubSilhouette, status: 'stub', label: '02 废墟灯塔' },
  { id: 'opening-scene-03',  src: stubSilhouette, status: 'stub', label: '03 塔内档案室' },
]
```

- [ ] **Step 3: 写 `src/composables/useCharacterArt.js`**

Create directory and write file `src/composables/useCharacterArt.js`:

```js
import { characterArt } from '@/config/characterArt'

export function useCharacterArt() {
  function resolveArt({ poseId }) {
    if (typeof poseId !== 'string' || poseId === '') {
      throw new Error(`useCharacterArt: poseId must be a non-empty string, got ${JSON.stringify(poseId)}`)
    }
    const entry = characterArt.find((e) => e.id === poseId)
    if (!entry) {
      throw new Error(`useCharacterArt: unknown poseId "${poseId}"`)
    }
    return { src: entry.src, status: entry.status, label: entry.label }
  }
  return { resolveArt }
}
```

- [ ] **Step 4: 写 `src/components/folio/CharacterPortrait.vue`**

Write file `src/components/folio/CharacterPortrait.vue`:

```vue
<script setup>
import { computed } from 'vue'
import { useCharacterArt } from '@/composables/useCharacterArt'
import PosterStage from './PosterStage.vue'

const props = defineProps({
  poseId: { type: String, required: true },
  size: { type: String, default: 'thumb', validator: (v) => ['hero', 'thumb'].includes(v) },
  caption: { type: String, default: '' },
})

const { resolveArt } = useCharacterArt()
const art = computed(() => resolveArt({ poseId: props.poseId }))
</script>

<template>
  <figure :class="['character-portrait', `character-portrait--${size}`]">
    <PosterStage :image="art.src" :decorated="true" :aria-hidden="false" />
    <span
      v-if="art.status === 'stub'"
      class="archive-stub-tape"
      :aria-label="`立绘未生成: ${art.label}`"
    >{{ art.label }}</span>
    <figcaption v-if="caption" class="character-portrait__caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.character-portrait {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  margin: 0;
}
.character-portrait--hero { max-width: 386px; width: 100%; aspect-ratio: 3/4; }
.character-portrait--thumb { max-width: 256px; width: 100%; aspect-ratio: 3/4; }
.archive-stub-tape {
  position: absolute;
  right: 8px;
  bottom: 8px;
  pointer-events: none;
  padding: 4px 10px;
  font: italic 11px/1.2 var(--font-serif);
  color: var(--archive-ink);
  background: var(--archive-paper);
  border: 1px solid var(--hairline-soft);
  border-radius: 2px;
  transform: rotate(-2deg);
}
.character-portrait__caption {
  padding-top: 8px;
  font: 400 14px/1.4 var(--font-serif);
  color: var(--archive-ink);
}
</style>
```

- [ ] **Step 5: 写 `src/components/folio/CharacterArchiveStrip.vue`**

Write file `src/components/folio/CharacterArchiveStrip.vue`:

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
      v-for="tile in tiles"
      :key="tile.poseId"
      class="character-archive-strip__tile"
    >
      <CharacterPortrait :pose-id="tile.poseId" size="thumb" />
      <figcaption class="character-archive-strip__kicker">{{ tile.kicker }}</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.character-archive-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.character-archive-strip__tile {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.character-archive-strip__kicker {
  padding-top: 6px;
  font: italic 12px/1.3 var(--font-serif);
  color: var(--archive-ink);
  text-align: center;
}
@media (max-width: 760px) {
  .character-archive-strip { gap: 6px; }
}
</style>
```

- [ ] **Step 6: 写 `src/__tests__/stereoMigration.test.js` (test 1 + 2 only,commit 2 才补 test 3-6)**

Write file `src/__tests__/stereoMigration.test.js`:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { characterArt } from '@/config/characterArt'
import { useCharacterArt } from '@/composables/useCharacterArt'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('stereo migration — character-art skeleton + stub (pass 5A commit 1: modules)', () => {
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
      // 5A 末态: src 是 stub-silhouette.svg 静态 import URL,非 null
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
      expect(resolved).toHaveProperty('status')
      expect(['stub', 'real']).toContain(resolved.status)
      expect(resolved).toHaveProperty('label')
      expect(typeof resolved.label).toBe('string')
    }
  })
})

// NOTE: page wiring tests (test 3 OpeningPage + test 4 Experience + test 5-6 regressions)
// are added in commit 2. Commit 1 has no vue page changes yet.
```

- [ ] **Step 7: 跑测试,expect 2 PASS**

Run: `npm run test:run -- src/__tests__/stereoMigration.test.js`
Expected: `Test Files  1 passed (1)`,`Tests  2 passed (2)`,exit 0

如果 FAIL:
- `Cannot find module '@/config/characterArt'` → 检查 `src/config/characterArt.js` 是否存在,vite alias 是否 OK
- `useCharacterArt is not a function` → 检查 `src/composables/useCharacterArt.js` 是否 export `useCharacterArt`
- `expected 6 to be 3` → 检 characterArt 数组长度,可能有 entry 漏写

- [ ] **Step 8: git commit**

Run:
```bash
git add src/assets/characters/stub-silhouette.svg \
        src/config/characterArt.js \
        src/composables/useCharacterArt.js \
        src/components/folio/CharacterPortrait.vue \
        src/components/folio/CharacterArchiveStrip.vue \
        src/__tests__/stereoMigration.test.js
git diff --check --cached
git commit -m "feat(folio): characterArt module + CharacterPortrait + CharacterArchiveStrip stub"
```

Expected: commit landed,6 files changed,~250 insertions,no Co-Authored-By footer

---

## Task 2: 5A Commit 2 — wiring (OpeningPage + Experience + 4 page tests)

**Files:**
- Modify: `src/pages/OpeningPage.vue` (4 sites: CharacterPortrait in section, CharacterArchiveStrip at L66, --hero-image var, openingActionStubTiles computed)
- Modify: `src/pages/Experience.vue` (3 sites: FolioSurface wrap inline-detail-card + CharacterPortrait, FolioSurface wrap quick-note-workspace-header, .quick-note-panel-btn → .action-btn)
- Modify: `src/__tests__/stereoMigration.test.js` (append test 3-6)

- [ ] **Step 1: 读 OpeningPage.vue L50-230 现状,定位 4 个改造点**

Run: `sed -n '50,75p;145,160p;215,230p' src/pages/OpeningPage.vue`
Expected: 看到 `<section class="opening-scene">` (L54-65 含 9 个 span + title),`--hero-image` CSS var 声明 (L145-148),`<ArchiveStrip :items="playableWorldArchiveItems">` (L66),`playableWorldArchiveItems` data (L218-222)

记录 L54-65 完整 opening-scene 块和 L66 ArchiveStrip 调用 和 L218-222 data,下一步 Edit 用。

- [ ] **Step 2: OpeningPage.vue 加 CharacterPortrait 进 opening-scene section**

在 `<section class="opening-scene">` 内 (L54-65 范围内,任意 title 元素之后) 加 CharacterPortrait。先用 Edit 工具替换 opening-scene 块的整段内容,保留主 wrapper div + title,内加 CharacterPortrait。

具体 edit (基于实际 L54-65 内容调整):

```vue
<!-- inside <section class="opening-scene"> -->
<div class="opening-stage-poster">
  <CharacterPortrait
    pose-id="opening-cover"
    size="hero"
    :caption="selectedOpeningAction?.title || openingSceneCards.location"
  />
</div>
```

注:wrapper `class="opening-stage-poster"` 是必要的 thin alias,见 spec L195 / L388 (3-property alias rule 由 uiPolish.test.js:281-290 锁)。**不要**删 `class="opening-stage-poster"` wrapper。

- [ ] **Step 3: OpeningPage.vue L66 替换 ArchiveStrip → CharacterArchiveStrip**

用 Edit 工具替换:

old:
```vue
<ArchiveStrip :items="playableWorldArchiveItems" />
```

new:
```vue
<CharacterArchiveStrip :tiles="openingActionStubTiles" />
```

- [ ] **Step 4: OpeningPage.vue L218-222 保留 playableWorldArchiveItems + 新增 openingActionStubTiles computed**

在 `<script setup>` 块内,`playableWorldArchiveItems` 后面 (或附近) 加:

```js
const openingActionStubTiles = computed(() => [
  { poseId: 'opening-scene-01', kicker: '01 边界小镇' },
  { poseId: 'opening-scene-02', kicker: '02 废墟灯塔' },
  { poseId: 'opening-scene-03', kicker: '03 塔内档案室' },
])
```

注:`openingActionStubTiles` 是 stub state 5A 末态,5B swap 时改 `poseId` 改 `kicker` 或保留。**不要**删 `playableWorldArchiveItems` (spec L194 issue 1 修正:ArchiveStrip 仍引用它)。

- [ ] **Step 5: OpeningPage.vue L145-148 --hero-image CSS var 绑 useCharacterArt**

定位 L145-148 现状,Edit:

old (假设):
```js
const heroImage = computed(() => worldImageUrl.value)
```

new:
```js
const { resolveArt } = useCharacterArt()
const heroImage = computed(() => resolveArt({ poseId: 'opening-cover' }).src)
```

或 (如果原代码是直接读 CSS var):

old:
```css
--hero-image: v-bind(worldImageUrl);
```

new:
```css
--hero-image: v-bind(heroImage);
```

(基于实际 L145-148 内容调整;关键是 src 从 `worldImageUrl` 切到 `useCharacterArt().resolveArt({ poseId: 'opening-cover' }).src`)

- [ ] **Step 6: OpeningPage.vue `<script setup>` 加 import**

在 `<script setup>` 顶部加:

```js
import { useCharacterArt } from '@/composables/useCharacterArt'
```

确认 `computed` 已 import (OpeningPage 已用 computed,应该已经在)。

- [ ] **Step 7: 跑 OpeningPage wiring 中间验证 (test 3 还没写,先做 type check)**

Run: `npm run build 2>&1 | tail -30`
Expected: `built in XXXms` 0 错误 (可能有 chunkSize 警告但无 fail)

如果 FAIL: 检查 import 路径、computed 定义、CharacterPortrait / CharacterArchiveStrip props 名称 (kebab-case 在 template, camelCase 在 script)。

- [ ] **Step 8: 读 Experience.vue L50-210 现状,定位 3 个改造点**

Run: `sed -n '50,55p;78,80p;115,120p;175,210p' src/pages/Experience.vue`
Expected: 看到 L52 `<section class="quick-note-workspace">`,L53 `<header class="quick-note-workspace-header">`,L78-79 / L116-118 `.quick-note-panel-btn` 用法,L177-203 `<Teleport><div class="inline-detail-overlay"><div class="inline-detail-card">`

记录这 4 处,下一步 Edit 用。

- [ ] **Step 9: Experience.vue L177-203 inline-detail-card 包 FolioSurface + 加 CharacterPortrait**

把 L177-203 范围的 `<div class="inline-detail-card">` 外层包 FolioSurface (variant="chrome"),header 内加 CharacterPortrait。

new template (替换原 inline-detail-card 整个 div + 内部):
```vue
<FolioSurface as="div" variant="chrome" :decorated="false" class="inline-detail-card">
  <header class="inline-detail-card-header">
    <CharacterPortrait
      pose-id="speaker-thumb"
      size="thumb"
      :caption="inlineDetailState?.speaker || '对话人'"
    />
  </header>
  <!-- 原有 inline-detail-card body 内容保持不动 -->
</FolioSurface>
```

具体边界:找到现有 `<div class="inline-detail-card">` 和对应 `</div>`,外层包 FolioSurface,内层 div 改名 (FolioSurface 自己渲染为 div)。或保留内层 div 单独保留 class,FolioSurface 作外层 wrapper。

**最简实现**:FolioSurface 加 class="inline-detail-card",内层 div 不动。具体看 Experience.vue 实际写法。

- [ ] **Step 10: Experience.vue L53 quick-note-workspace-header 包 FolioSurface (nested 结构)**

L52-54 范围原:
```vue
<section class="quick-note-workspace">
  <header class="quick-note-workspace-header">
    <!-- 现有 header 内容 -->
  </header>
```

新 (nested 结构 — FolioSurface 是外层 wrapper,内含 `<header>` 元素):
```vue
<section class="quick-note-workspace">
  <FolioSurface as="div" variant="paper" :decorated="false" class="quick-note-workspace-header-wrap">
    <header class="quick-note-workspace-header">
      <!-- 现有 header 内容保持不动 -->
    </header>
  </FolioSurface>
```

**不要**写 `as="header"` (spec R3 修正:FolioSurface `:is="as"` 行为跟 nested DOM 不同,test 会失败)。必须是 `as="div"` + 内含 `<header>` 元素。

- [ ] **Step 11: Experience.vue `.quick-note-panel-btn` → `.action-btn` / `.action-btn.primary`**

定位 L78-79 / L116-118 现状,Edit:

old (假设):
```vue
<button class="quick-note-panel-btn" @click="...">...</button>
```

new:
```vue
<button class="action-btn" @click="...">...</button>
```

如果是主 CTA (新建 / 确认):
```vue
<button class="action-btn primary" @click="...">...</button>
```

**不要**删 .quick-note-panel-btn CSS (从 main.css 收口 — 但 main.css 在 do-not-touch 列表,见 spec L407,本轮不动 main.css;`action-btn` CSS 已经存在于 main.css L1471-1509,复用即可)。

- [ ] **Step 12: Experience.vue `<script setup>` 加 import**

在 `<script setup>` 顶部加:

```js
import { useCharacterArt } from '@/composables/useCharacterArt'
import CharacterPortrait from '@/components/folio/CharacterPortrait.vue'
import FolioSurface from '@/components/folio/FolioSurface.vue'
```

(基于 Experience.vue 实际已有 import 决定是 add 还是合并)

- [ ] **Step 13: 补 stereoMigration.test.js test 3-6 (4 个 page wiring tests)**

Edit `src/__tests__/stereoMigration.test.js` 在 commit 1 的 `describe(...)` 块**后面** append 新 describe 块:

```js
describe('stereo migration — page wiring (pass 5A commit 2)', () => {
  it('OpeningPage renders <CharacterPortrait> inside opening-scene for opening-cover, and <CharacterArchiveStrip> for 3 scene tiles', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('<CharacterPortrait')
    const coverMatch = openingPage.match(
      /<section\s+v-if="hasSelectedWorldbook"\s+class="opening-scene"[\s\S]*?<\/section>/,
    )
    expect(coverMatch).not.toBeNull()
    expect(coverMatch?.[0]).toContain('<CharacterPortrait')

    expect(openingPage).toContain('<CharacterArchiveStrip')
    expect(openingPage).toContain('openingActionStubTiles')
    expect(openingPage).toMatch(
      /openingActionStubTiles\s*=\s*[\s\S]*?\{ poseId: 'opening-scene-01'[\s\S]*?\{ poseId: 'opening-scene-02'[\s\S]*?\{ poseId: 'opening-scene-03'/,
    )
  })

  it('Experience wraps inline-detail-card in <FolioSurface> and quick-note-workspace header in FolioSurface variant="paper" (nested structure)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const inlineCardSection = experience.match(
      /<FolioSurface[\s\S]*?inline-detail-card[\s\S]*?<\/FolioSurface>/,
    )
    expect(inlineCardSection).not.toBeNull()
    expect(experience).toContain('<CharacterPortrait')

    // nested structure: FolioSurface as="div" 是 wrapper,内含 <header class="quick-note-workspace-header">
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

- [ ] **Step 14: 跑 4 个测试文件,expect 6+39+4+2=51 PASS**

Run:
```bash
npm run test:run -- \
  src/__tests__/stereoMigration.test.js \
  src/__tests__/uiPolish.test.js \
  src/__tests__/welcomeView.test.js \
  src/__tests__/workbenchNav.test.js
```
Expected: 4 files, 51 tests, all PASS, exit 0

如果 FAIL:
- `expected openingActionStubTiles to match ...` → 检查 OpeningPage.vue computed 顺序
- `expected <FolioSurface...variant="paper"...> to match` → 检查 nested 结构,确认 `<header class="quick-note-workspace-header">` 在 FolioSurface 内
- `expected 0 but received 1` (size="micro") → 搜 Experience.vue 找漏加的 size="micro"
- `expected 0 but received N` (v-if hasSelectedWorldbook) → 5A 不允许新增 v-if hasSelectedWorldbook 引用,移除

- [ ] **Step 15: 跑 build 验证**

Run: `npm run build 2>&1 | tail -20`
Expected: built successfully, 0 errors

- [ ] **Step 16: git commit**

Run:
```bash
git add src/pages/OpeningPage.vue src/pages/Experience.vue src/__tests__/stereoMigration.test.js
git diff --check --cached
git commit -m "feat(pages): wire CharacterPortrait + CharacterArchiveStrip into Opening + Experience"
```

Expected: 3 files changed, ~+150 / -5 (净 +145), no Co-Authored-By footer

---

## Task 3: 5A Commit 3 — CSS cleanup (OpeningPage 删 11 child rules,保留主规则作 thin alias)

**Files:**
- Modify: `src/pages/OpeningPage.vue` (delete 11 child CSS rules at L655-822)

- [ ] **Step 1: 读 OpeningPage.vue L655-822 现状,定位 11 个 child rules**

Run: `sed -n '655,822p' src/pages/OpeningPage.vue`
Expected: 看到 `.opening-stage-poster` 主规则 + 11 个 child rules (`.opening-stage-poster::before` / `::after` / `.__halo` / `.__badge` / `.__index` / `.__world` / `.__title` / `.__roman` / `.__sash` / `.__blade` / `.__grid`)

记录主规则起止行 + 11 个 child rules 起止行。

- [ ] **Step 2: 删 11 个 child rules,保留主规则**

Edit `src/pages/OpeningPage.vue`,**只删 child rules**,**不要**碰主规则 `.opening-stage-poster` 的 3 property (`isolation: isolate` + `mix-blend-mode: multiply` + `background-image: var(--hero-image...)`)。主规则由 uiPolish.test.js:281-290 契约锁。

具体:用 Edit 工具,old_string = 第一个 child rule 起始行,new_string = "" (或下一个非 child 规则的起始行)。

如果 11 个 child rules 是连续块,一次 Edit 删整块更高效。

- [ ] **Step 3: 跑 4 个测试文件,expect 51 PASS (主规则保留所以契约测试还过)**

Run:
```bash
npm run test:run -- \
  src/__tests__/stereoMigration.test.js \
  src/__tests__/uiPolish.test.js \
  src/__tests__/welcomeView.test.js \
  src/__tests__/workbenchNav.test.js
```
Expected: 51 PASS, exit 0

如果 FAIL: 检查 `.opening-stage-poster` 主规则 3 property 是否还在 (uiPolish.test.js:281-290 锁)。

- [ ] **Step 4: 跑 build 验证**

Run: `npm run build 2>&1 | tail -15`
Expected: built successfully

- [ ] **Step 5: 视觉验证 (手动 dev server)**

Run (in background): `npm run dev &`
Wait 5s, then: `curl -s http://127.0.0.1:5177/opening -o /tmp/opening.html && grep -c 'opening-stage-poster' /tmp/opening.html`
Expected: `1` (主规则还在 + wrapper 引用)

Open browser (or skip if no Chromium / Playwright — spec R11 safety net):
- 访问 `/opening` → 应该看到 stub silhouette 灰色剪影 (kao archive 风格) 替代原 CSS 海报
- 访问 `/experience` → 点开 inline-detail modal → 看到 speaker-thumb stub silhouette 在 modal header
- 访问 `/experience` → 打开 quick-note workspace → header 应该有 paper variant 立体感

如果视觉有破:`Ctrl+Z` 撤回 commit,检查 child rules 是否有遗漏未删 (主规则还在所以 CSS 不会崩,但视觉可能少 11 层装饰效果)。

Stop dev server: `pkill -f "vite" || true`

- [ ] **Step 6: git commit**

Run:
```bash
git add src/pages/OpeningPage.vue
git diff --check --cached
git commit -m "refactor(opening): drop decorative poster CSS children, keep thin alias rule"
```

Expected: 1 file changed, ~-100 (11 个 child rules 净删), no Co-Authored-By footer

---

## Task 4: 5A 收口 — 全量验证 + 文档 + 推分支

**Files:**
- Modify: `docs/STATUS.md` (加 5A landing 条目)
- (no source file changes)

- [ ] **Step 1: invoke `ui-style-check` skill**

Run: Use Skill tool → `ui-style-check`
Expected: skill 给出 ui 风格检查清单,逐条过 (palette 复用现有 token,3D shadow 走 var(--archive-shadow) 等)

- [ ] **Step 2: invoke `testing-verification` skill**

Run: Use Skill tool → `testing-verification`
Expected: skill 跑全量测试 + build + diff --check,确认 5A 没回归

- [ ] **Step 3: invoke `docs-status-handoff` skill**

Run: Use Skill tool → `docs-status-handoff`
Expected: skill 提示更新 docs/STATUS.md "Recently done" + docs/LOG.md

- [ ] **Step 4: 更新 docs/STATUS.md — 加 5A landing 条目**

Edit `docs/STATUS.md`,在 "Recently done" 区块顶部加:

```markdown
- 2026-06-15 HH:MM CST — Claude on `feat/5a-stereo-migration`: 5A 骨架 + stub 落地。新增 5 文件 (`src/assets/characters/stub-silhouette.svg` + `src/config/characterArt.js` + `src/composables/useCharacterArt.js` + `src/components/folio/CharacterPortrait.vue` + `src/components/folio/CharacterArchiveStrip.vue`) + `src/__tests__/stereoMigration.test.js` (6 tests: 2 module + 4 page wiring);`src/pages/OpeningPage.vue` 删 11 child CSS rules (保留 .opening-stage-poster 主规则作 thin alias),`src/pages/Experience.vue` FolioSurface wrap inline-detail-card (含 speaker-thumb CharacterPortrait) + nested quick-note-workspace-header,`.quick-note-panel-btn` 复用 `.action-btn`。3 atomic commits:feat(folio) modules → feat(pages) wiring → refactor(opening) css。验证:`npm run test:run -- 4 文件` 通过 (6+39+4+2=51 tests);`npm run build` 通过;`git diff --check` 通过。5B 等 PR 合 main 后开 5b-art worktree。
```

(HH:MM 改实际时间)

- [ ] **Step 5: invoke `commit-conventions` skill (最后保险检查 3 个 commit 格式)**

Run: Use Skill tool → `commit-conventions`
Expected: skill 确认 3 个 commit 都没 Co-Authored-By footer,1 commit/feature,消息简短说"为什么"

- [ ] **Step 6: 跑全量 test 收尾**

Run: `npm run test:run 2>&1 | tail -10`
Expected: `Test Files  XX passed (XX)`,`Tests  6XX passed`,exit 0 (允许 stderr warnings)

- [ ] **Step 7: 跑 visual-verification (Playwright,有就用)**

Run: `npm run test:run -- src/__tests__/visual-verification.test.js 2>&1 | tail -10`
Expected: 12 tests PASS (或环境无 Playwright 时 exit 0 / skip — spec R11 safety net 维持 deferred)

- [ ] **Step 8: 推 worktree 分支**

Run:
```bash
git push -u origin feat/5a-stereo-migration
```
Expected: 3 commits pushed, branch up-to-date on origin

- [ ] **Step 9: 5A 收口 (用户合 PR 后)**

(Gate: 用户合 PR 到 main 后,本 session 不阻塞)

等用户合 PR 后:
- sync `main` 到 `wip/map-realism-render-docs-20260608`: `cd /home/recoletas/jiuguan/text-game-framework && git merge --no-ff main -m "merge: 5A 立体感骨架 + stub"`
- 更新 `docs/STATUS.md` 把 "Next up" 区的 5B 项移到 "In flight"
- 5B 起点 = `main` (per spec §0.2)

---

# Phase 5B — 立绘生产 + swap (1 PR, 6 image_generate calls + cwebp + 1 commit ship gate)

## Task 5: 5B 起点 — 5B worktree + 6 seed prompts

**Files:**
- Create: `worktrees/5b-art` (git worktree)
- (no source file changes in 5A's 5a-stereo worktree)

- [ ] **Step 1: 确认 5A PR 已合 main**

Run: `cd /home/recoletas/jiuguan/text-game-framework && git log main --oneline -5 | grep -i "5A\|stereo"`
Expected: 看到 5A landing commit (或 merge commit) 在 main 上

- [ ] **Step 2: 创建 5B worktree 从 main**

Run:
```bash
cd /home/recoletas/jiuguan/text-game-framework
git worktree add ../worktrees/5b-art -b feat/5b-stereo-art main
cd ../worktrees/5b-art
git status
```
Expected: 在新 worktree,branch `feat/5b-stereo-art`,working tree clean

- [ ] **Step 3: 确认 cwebp 或 magick 可用**

Run: `cwebp --version 2>/dev/null || magick --version 2>/dev/null`
Expected: 至少一个工具的 version 输出 (另一个 not found 也没事)

如果都 not found:装 `libwebp` (apt: `sudo apt install webp`) 或 `imagemagick` (`sudo apt install imagemagick`),再重跑。

- [ ] **Step 4: 草稿 3 张角色立绘 seed prompt**

基于 spec §5B 角色 canon (L228-230) + palette 硬约束 (L242) 草 3 个 prompt,每个 prompt 头部固定 palette 段 (L244 原文)。

3 个 seed prompt 结构 (完整 prompt 留到 Task 6-8 per-pose 时展开):

- **opening-cover**: kao 锚少女 late 20s, parka with hood, mole below left eye, gold tiara with red gem, teal-green hair;坐姿 3/4 侧身半抬头,抬眼看向 viewer soft surprised;膝上翻开书;inviting + archival 双重感
- **narrator**: 同 kao 锚少女 (canon 一致);半身 3/4 侧身半隐在档案纸后;视线在书与 viewer 之间;薄册压在胸口;passive archivist not teacher
- **speaker-thumb**: **新人物** ~55 旁白老者, 宽檐帽, 高领羊毛外套, gold-rimmed glasses, no jewelry;半身正坐;平视 viewer;羽毛笔 / 老照片;标志对话被引用

(完整 prompt 写到 `<worktree>/5b-prompts.md` 留档,3 张立绘跑时一字不漏复制)

- [ ] **Step 5: 草稿 3 张场景立绘 seed prompt**

基于 spec §5B 场景 pose 约束 (新增段) 草 3 个 prompt:

- **opening-scene-01 边界小镇**: 雾潮暮湾阴沉,油灯暖金,微微俯视;木墙 / 雾 / 路灯;同 weather + light source + perspective
- **opening-scene-02 废墟灯塔**: 同 weather + light + perspective;断塔 / 海雾 / 碎石
- **opening-scene-03 塔内档案室**: 同 weather + light + perspective;书架 / 烛台 / 旧文件

(完整 prompt 写到 `5b-prompts.md` 留档)

---

## Task 6: 5B Pose 1 — opening-cover (立绘生产 + 视觉 sign-off + WebP + demo cp)

**Files:**
- Create: `src/assets/characters/kao-archive-opening-cover.webp`
- Create: `docs/demo/kao-archive-opening-cover-001.png`

- [ ] **Step 1: user "run opening-cover" → 调 image_generate MCP**

(per user feedback memory:用户手动 run,不主动调)

User prompts:
```
image_generate prompt=<opening-cover 完整 prompt from 5b-prompts.md> size="1024x1360" basename="kao-archive-opening-cover"
```

Expected: MCP 返回成功,落盘到 MCP 默认目录,例如 `<default>/kao-archive-opening-cover-001.png`

- [ ] **Step 2: 视觉 sign-off (≤3 retries)**

User 用图像查看器打开 PNG。检查清单:
- palette 是否 olive / gold / paper (无 wine / anime)
- kao 锚少女 一致性 (parka hood, mole, tiara, teal-green hair)
- 构图:脸占上 40%,物件右 1/3 (避免 PosterStage 60% center 裁脸)
- 邀请感 + 档案感并存 (不只微笑要看出"档案册开页"语义)

如果 ❌:`image_generate` 调 1 次,改 prompt 调整 → 重新生成。最多 3 retries。
如果 3 次后仍不通过:**保留 stub** (`status: 'stub'` 不动,`src` 留 stub-silhouette.svg)。该 pose 5B 不 ship。其他 pose 继续。

- [ ] **Step 3: PNG → WebP 转换**

Run: `cwebp -q 80 <MCP default path>/kao-archive-opening-cover-001.png -o src/assets/characters/kao-archive-opening-cover.webp`
Expected: webp file 落盘,~50-150 KB

如果用 magick: `magick <input>.png -quality 80 src/assets/characters/kao-archive-opening-cover.webp`

- [ ] **Step 4: cp PNG 到 docs/demo 给人工审查**

Run: `cp <MCP default path>/kao-archive-opening-cover-001.png docs/demo/kao-archive-opening-cover-001.png`
Expected: docs/demo 落 PNG 副本

- [ ] **Step 5: 标记本 pose 状态**

如果 sign-off 通过:本 pose 进入 ship gate 队列。
如果 3 retries 失败:本 pose 留 stub,**不**进入 ship gate。characterArt.js 该 entry 保持 `status: 'stub'` + `src: stubSilhouette`。

---

## Task 7: 5B Pose 2 — narrator

**Files:**
- Create: `src/assets/characters/kao-archive-narrator.webp`
- Create: `docs/demo/kao-archive-narrator-001.png`

- [ ] **Step 1-5: 重复 Task 6 的 5 个 step,pose 名换为 narrator**

(完整步骤同 Task 6,把 `kao-archive-opening-cover` 全部替换为 `kao-archive-narrator`)

---

## Task 8: 5B Pose 3 — speaker-thumb

**Files:**
- Create: `src/assets/characters/kao-archive-speaker-thumb.webp`
- Create: `docs/demo/kao-archive-speaker-thumb-001.png`

- [ ] **Step 1-5: 重复 Task 6 的 5 个 step,pose 名换为 speaker-thumb**

---

## Task 9: 5B Pose 4 — opening-scene-01 (边界小镇)

**Files:**
- Create: `src/assets/characters/kao-archive-opening-scene-01.webp`
- Create: `docs/demo/kao-archive-opening-scene-01-001.png`

- [ ] **Step 1-5: 重复 Task 6 的 5 个 step,pose 名换为 opening-scene-01**

视觉 sign-off 注意:场景立绘**不**走人物 canon (spec L246 场景 pose 约束段);palette + 3:4 + 60% center + 物件分布仍要。

---

## Task 10: 5B Pose 5 — opening-scene-02 (废墟灯塔)

**Files:**
- Create: `src/assets/characters/kao-archive-opening-scene-02.webp`
- Create: `docs/demo/kao-archive-opening-scene-02-001.png`

- [ ] **Step 1-5: 重复 Task 6 的 5 个 step,pose 名换为 opening-scene-02**

---

## Task 11: 5B Pose 6 — opening-scene-03 (塔内档案室)

**Files:**
- Create: `src/assets/characters/kao-archive-opening-scene-03.webp`
- Create: `docs/demo/kao-archive-opening-scene-03-001.png`

- [ ] **Step 1-5: 重复 Task 6 的 5 个 step,pose 名换为 opening-scene-03**

---

## Task 12: 5B ship gate — characterArt.js swap + commit

**Files:**
- Modify: `src/config/characterArt.js` (6 imports swap + 6 status flip,per-pose:只翻 sign-off 通过的)

- [ ] **Step 1: 列出 sign-off 通过的 pose**

列出 6 个 pose 中 sign-off 通过的 (≤6 个,可能 <6 个如果 3 retries 失败):

例:假设 5/6 通过 (scene-02 失败):
- opening-cover ✓
- narrator ✓
- speaker-thumb ✓
- opening-scene-01 ✓
- opening-scene-02 ✗ (留 stub)
- opening-scene-03 ✓

- [ ] **Step 2: 替换 6 个 import,只把通过的 pose import 真图,失败 pose 仍 import stub**

Edit `src/config/characterArt.js`:

new content (基于 sign-off 结果调整 import + src 字段):

```js
import stubSilhouette from '@/assets/characters/stub-silhouette.svg'
import kaoArchiveOpeningCover from '@/assets/characters/kao-archive-opening-cover.webp'
import kaoArchiveNarrator from '@/assets/characters/kao-archive-narrator.webp'
import kaoArchiveSpeakerThumb from '@/assets/characters/kao-archive-speaker-thumb.webp'
import kaoArchiveOpeningScene01 from '@/assets/characters/kao-archive-opening-scene-01.webp'
// import kaoArchiveOpeningScene02 from '@/assets/characters/kao-archive-opening-scene-02.webp'  // sign-off failed, kept stub
import kaoArchiveOpeningScene03 from '@/assets/characters/kao-archive-opening-scene-03.webp'

export const characterArt = [
  { id: 'opening-cover',     src: kaoArchiveOpeningCover,   status: 'real', label: '开场档案' },
  { id: 'narrator',          src: kaoArchiveNarrator,       status: 'real', label: '在场叙述者' },
  { id: 'speaker-thumb',     src: kaoArchiveSpeakerThumb,   status: 'real', label: '对话人' },
  { id: 'opening-scene-01',  src: kaoArchiveOpeningScene01, status: 'real', label: '01 边界小镇' },
  { id: 'opening-scene-02',  src: stubSilhouette,           status: 'stub', label: '02 废墟灯塔' },
  { id: 'opening-scene-03',  src: kaoArchiveOpeningScene03, status: 'real', label: '03 塔内档案室' },
]
```

(实际替换按 sign-off 结果调整;失败的 pose 不加 import + 保持 stubSilhouette + status='stub')

- [ ] **Step 3: 跑 4 个测试文件,expect 51 PASS (test 2 仍过,因 src 仍以 .svg|webp 结尾)**

Run:
```bash
npm run test:run -- \
  src/__tests__/stereoMigration.test.js \
  src/__tests__/uiPolish.test.js \
  src/__tests__/welcomeView.test.js \
  src/__tests__/workbenchNav.test.js
```
Expected: 51 PASS, exit 0

如果 FAIL test 1: 检查 characterArt.js 数组 6 个 entry 是否完整,id 列表是否对 (sorted 与 expect 一致)

- [ ] **Step 4: 视觉验证 (手动 dev server)**

Run: `npm run dev &`
Open `/opening` → 应该看到 opening-cover 真立绘替代 stub,3 个 scene tile 至少 2 个真图(可能 1 个 stub if scene-02 失败)
Open `/experience` → 点 inline-detail modal → speaker-thumb 真立绘

Stop dev server: `pkill -f "vite" || true`

- [ ] **Step 5: 跑 build 验证**

Run: `npm run build 2>&1 | tail -15`
Expected: built successfully, 0 errors

- [ ] **Step 6: git commit**

Run:
```bash
git add src/config/characterArt.js src/assets/characters/kao-archive-*.webp docs/demo/kao-archive-*.png
git diff --check --cached
git commit -m "feat(art): swap stub silhouettes for 6 kao-archive portraits"
```

(如果只 N/6 通过,commit message 改 "swap 5 stub silhouettes for 5 kao-archive portraits (1 pose retries exhausted)")

Expected: 8 files changed (1 js + 6 webp + 1 demo png,如果 5/6 通过; 6/6 通过则 13 files),no Co-Authored-By footer

---

## Task 13: 5B 收口 — 全量验证 + 文档 + 推分支

**Files:**
- Modify: `docs/STATUS.md` (加 5B landing 条目)

- [ ] **Step 1: invoke `ui-style-check` skill**

Run: Use Skill tool → `ui-style-check`
Expected: 立绘 palette + 构图 + 撕角与 WelcomeView 风格一致,无新 CSS 漂移

- [ ] **Step 2: invoke `testing-verification` skill**

Run: Use Skill tool → `testing-verification`
Expected: 全量 87 files / 619+ tests 通过,build 通过

- [ ] **Step 3: invoke `docs-status-handoff` skill**

Run: Use Skill tool → `docs-status-handoff`
Expected: 提示更新 docs/STATUS.md "Recently done"

- [ ] **Step 4: 更新 docs/STATUS.md — 加 5B landing 条目**

Edit `docs/STATUS.md`,在 "Recently done" 顶部加:

```markdown
- 2026-06-15 HH:MM CST — Claude on `feat/5b-stereo-art`: 5B 立绘生产 + swap 落地。N/6 sign-off 通过 (K/O 个 pose retries 耗尽,留 stub),6 张 webp 落 `src/assets/characters/`,6 张 png 落 `docs/demo/` 人工审查副本,`src/config/characterArt.js` 6 个 import swap + per-pose status flip (通过的 → 'real',失败的 → 'stub')。1 commit ship gate。验证:`npm run test:run -- 4 文件` 通过 (51 tests);`npm run build` 通过;`git diff --check` 通过;手动 dev server `/opening` 看到真立绘替代 stub,`/experience` inline-detail modal 看到 speaker-thumb 真图。
```

(HH:MM 改实际时间;N/O 改实际数字)

- [ ] **Step 5: invoke `commit-conventions` skill**

Run: Use Skill tool → `commit-conventions`
Expected: 5B commit 无 Co-Authored-By footer,消息简短

- [ ] **Step 6: 推 worktree 分支**

Run: `git push -u origin feat/5b-stereo-art`
Expected: 1 commit pushed

- [ ] **Step 7: 5B 收口 (用户合 PR 后)**

等用户合 PR 后:
- sync `main` 到 `wip/map-realism-render-docs-20260608`: `cd /home/recoletas/jiuguan/text-game-framework && git merge --no-ff main -m "merge: 5B 立绘生产 + swap"`
- 更新 `docs/STATUS.md` "In flight" 移除 5B 项,"Recently done" 留条目
- 5B spec + plan 标记为 done (在本 plan 文件底部加 changelog 段)

---

## Self-Review Checklist (controller's inline check)

实施前 controller 自查:

1. **Spec coverage**:
   - 5A goal 1 (4 new folio components) → Task 1 ✓
   - 5A goal 2 (1:1 wiring on Opening + Experience) → Task 2 ✓
   - 5A goal 3 (delete 11 child CSS rules, keep thin alias) → Task 3 ✓
   - 5A goal 4 (no ArchiveStrip in Experience) → Task 2 test 3 + soft lock 表 7th row 锁 ✓
   - 5A goal 5 (no BookmarkButton/ArchiveStrip/CharacterArchiveStrip in Experience) → Task 2 test 4-5 + soft lock 表 1st/2nd/8th row 锁 ✓
   - 5A contract test (6 tests,2+4 split) → Task 1 step 6 (test 1+2) + Task 2 step 13 (test 3-6) ✓
   - 5A 3 atomic commits → Task 1 / Task 2 / Task 3 各 1 commit ✓
   - 5B 6 image_generate calls → Task 6-11 各 1 call ✓
   - 5B save_dir 不传 + PNG→WebP → Task 6-11 step 1+3 ✓
   - 5B characterArt.js swap → Task 12 ✓
   - 5B 1 commit ship gate → Task 12 ✓
   - 5B per-pose status flip → Task 12 step 1+2 ✓

2. **Placeholder scan**:
   - 0 TBD / TODO / fill-in
   - 所有 Edit step 都有具体代码 (characterArt / useCharacterArt / CharacterPortrait / CharacterArchiveStrip / stereoMigration.test.js / OpeningPage / Experience 5 个具体 sub-edits)
   - 0 "implement later" / "appropriate error handling" / "similar to Task N"

3. **Type consistency**:
   - characterArt.js: `id`, `label`, `src`, `status` 4 个字段在 5A 末态 (status='stub', src=stubSilhouette) 和 5B 末态 (status='real' or 'stub', src=kaoArchive* or stubSilhouette) 保持一致
   - useCharacterArt.js: `resolveArt({ poseId })` 返回 `{ src, status, label }` 3 字段,test 1 + test 2 都用同一形状
   - CharacterPortrait props: `{ poseId, size, caption }` — 5A 全用这 3 个,5B 不加新 prop
   - CharacterArchiveStrip props: `{ tiles, ariaLabel }` — 5A 全用这 2 个,5B 不加新 prop
   - FolioSurface props: 复用现有 `{ as, variant, decorated }` — **不**扩展(do-not-touch 列表)
   - 测试 expectation 数字:6 entries / 51 tests / 0 size="micro" / 0 v-if="hasSelectedWorldbook" / 6 PASS ship gate

4. **Do-not-touch compliance**:
   - WelcomeView.vue:0 changes ✓
   - router/index.js:0 changes ✓
   - workbenchNav.js:0 changes ✓
   - useAdvisor.js:0 changes ✓
   - BookmarkButton.vue:0 changes (5A 不扩展 prop) ✓
   - PosterStage.vue:0 changes ✓
   - FolioSurface.vue:0 changes (5A 不扩展 variant) ✓
   - ArchiveStrip.vue:0 changes (5A 不扩展 API) ✓
   - main.css:0 changes (5A 不改) ✓

5. **Soft lock compliance**:
   - uiPolish.test.js 39 tests:5A 不动 uiPolish 任何契约 (软锁表 7 行全保留) ✓
   - welcomeView 4 tests:5A 不动 WelcomeView ✓
   - workbenchNav 2 tests:5A 不动 router / nav ✓
   - 5A 新增 stereoMigration 6 tests,只锁 characterArt + folio 组件,不锁 WelcomeView / Experience 既有内容 ✓

6. **Risks covered**:
   - Issue 1 (poseId mismatch) → 6 entries in characterArt.js 1.2 ✓
   - Issue 2 (test schedule) → 2+4 split in Task 1 step 6 + Task 2 step 13 ✓
   - Issue 3 (FolioSurface nested) → Task 2 step 10 用 as="div" 不用 as="header" ✓
   - Issue 4 (src: string) → 5A 末态 src 全部 stubSilhouette import URL,no null ✓
   - Issue 5 (MCP save_dir / PNG) → Task 6-11 step 1 不传 save_dir + step 3 cwebp ✓
   - Issue 6 (CharacterPortrait soft lock Experience) → 软锁表 8th row + test 4 inline-detail-card 唯一引用 ✓
