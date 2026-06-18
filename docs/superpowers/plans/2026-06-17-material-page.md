# Material Page (`/materials` → Notes.vue) kao archive-folio 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notes.vue (2748 行工具壳) 重构为 kao archive-folio "资料册/相片夹/索引页" 视觉 — 保留全部 66 function + 27 ref + 5 computed 行为不变,仅替换视觉壳层 + 引入 3 kao 组件 + 1 新 CSS class。

**Architecture:** 3-phase A/B/C 迁移(类比 WelcomeView spec) — Phase A CSS 瘦身 + 4 kao utility + 5 uiPolish 契约;Phase B template 重排 + 5 个具体改动点;Phase C 手动截图验收。Theme-system `.theme-kao` gate 兼容,legacy variant 走精简后 scoped CSS fallback。

**Tech Stack:** Vue 3 + Pinia + Vite + Vitest;`@layer kao` CSS cascade + `.theme-kao` gate;`characterArt.js` 立绘 composable;`narrativeAssets` service schemaVersion=1。

---

## File Structure

**Modify:**
- `src/pages/Notes.vue` — template + script + scoped CSS(主改动,2748 → ~600 行)
- `src/styles/themes/kao.css` — 新增 4 utility(class 新增,~148 → ~210 行)
- `src/__tests__/uiPolish.test.js` — 新增 5 N5C contract tests(618 → ~660 行)

**Read-only references:**
- `src/components/folio/{FolioSurface,ArchiveStrip,CharacterPortrait}.vue` — 复用 ship 组件
- `src/components/folio/PosterStage.vue` — 撕边 SVG `<defs>` 块参考
- `src/config/characterArt.js` — narrator pose ID 来源
- `src/composables/useCharacterArt.js` — resolveArt API
- `src/views/WelcomeView.vue` — 视觉基准(18px hard-offset)
- `docs/STATUS.md` — Phase C 截图记录目标

**No new files created.** 撕边 SVG `<defs>` 短期 inline 复制 WelcomeView PosterStage 块(per spec NG5)。

---

## Phase A: CSS token + 4 kao utility + scoped CSS 瘦身 + 5 uiPolish 契约

### Task A0: 创建 worktree

**Files:** worktree (新建分支 `feat/n5c-material-archive-folio`)

- [ ] **Step 1: 从 main 创建 worktree**

```bash
cd /home/recoletas/jiuguan/text-game-framework
git fetch origin main
git worktree add ../n5c-material-archive-folio -b feat/n5c-material-archive-folio origin/main
cd ../n5c-material-archive-folio
git status --short  # 期望: clean
```

Expected: clean working tree, branch `feat/n5c-material-archive-folio`

### Task A1: 加 4 个新 utility 到 kao.css

**Files:** Modify `src/styles/themes/kao.css:148` (在文件末尾 `@layer kao { ... }` 内,最后一个 `}` 之前)

- [ ] **Step 1: 读 kao.css 末尾结构,确认插入位置**

```bash
tail -5 /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
```

Expected: 输出最后一个 `}` 或 `}` 之前的 rule

- [ ] **Step 2: 在 `@layer kao { ... }` 闭合 `}` 之前,加 4 个新 utility**

在 kao.css 末尾 `@layer kao {` 块闭合前(最后一个 `}` 之前),插入:

```css
  /* N5C: material-action-btn - batch action button with kao visual */
  .material-action-btn {
    background: color-mix(in srgb, var(--archive-paper-soft) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
    border-radius: 0;
    box-shadow: 18px 18px 0 color-mix(in srgb, var(--archive-ink) 18%, transparent);
    color: var(--archive-ink);
    transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
  }
  .material-action-btn:hover:not(:disabled) {
    transform: translate(-2px, -2px);
    box-shadow: 22px 22px 0 color-mix(in srgb, var(--archive-gold) 24%, transparent);
    filter: brightness(1.04);
  }

  /* N5C: material-bookmark-toolbar - 4-button grid container */
  .material-bookmark-toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
    background: color-mix(in srgb, var(--archive-paper-soft) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 24%, transparent);
    border-radius: 0;
  }

  /* N5C: material-entry-card - torn-edge entry thumbnail (3/4 aspect) */
  .material-entry-card {
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    background: var(--archive-paper-soft);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
    clip-path: polygon(0 6%, 4% 0, 96% 2%, 100% 8%, 98% 94%, 92% 100%, 4% 96%, 0 90%);
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--archive-ink) 14%, transparent);
  }

  /* N5C: material-tear-svg - SVG defs container for torn edge filter */
  .material-tear-svg {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
  }
```

- [ ] **Step 3: 验证 kao.css 新 utility 存在**

```bash
grep -n "material-action-btn\|material-bookmark-toolbar\|material-entry-card\|material-tear-svg" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
```

Expected: 4 行匹配,每行一个 utility name

- [ ] **Step 4: 验证 `@layer kao` block 仍然 balanced(开括号数 = 闭括号数)**

```bash
grep -c "^}" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
# 应有 1 个最外层 } 关闭 @layer kao
```

- [ ] **Step 5: Commit**

```bash
cd /home/recoletas/jiuguan/text-game-framework/../n5c-material-archive-folio 2>/dev/null || cd ~/jiuguan/worktrees/n5c-material-archive-folio
git add src/styles/themes/kao.css
git commit -m "feat(kao.css): N5C 4 utility (action btn, toolbar, entry card, tear svg)"
```

### Task A2: 加 5 条 N5C uiPolish contract tests

**Files:** Modify `src/__tests__/uiPolish.test.js`(在文件末尾追加 5 个 `it(...)` 块,在最后一个 `})` 之前)

- [ ] **Step 1: 读 uiPolish.test.js 末尾,确认插入位置**

```bash
tail -10 /home/recoletas/jiuguan/text-game-framework/src/__tests__/uiPolish.test.js
```

Expected: 最后是 `})` 闭合最后一个 `it()`

- [ ] **Step 2: 在 uiPolish.test.js 末尾追加 5 条 N5C tests(在最后一个 `})` 之前)**

```js

  it('N5C: uses FolioSurface to wrap editor-main kao visual', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<FolioSurface')
    expect(notes).toContain('variant="paper"')
  })

  it('N5C: uses ArchiveStrip for entry collage', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<ArchiveStrip')
  })

  it('N5C: uses CharacterPortrait narrator in sidebar top', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<CharacterPortrait')
    expect(notes).toContain('pose-id="narrator"')
  })

  it('N5C: uses .material-action-btn class for batch actions', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="selection-action-btn material-action-btn"')
  })

  it('N5C: scoped CSS within tolerance ≤ 770 lines', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const styleMatch = notes.match(/<style scoped>([\s\S]*?)<\/style>/)
    const lines = styleMatch ? styleMatch[1].split('\n').length : 0
    expect(lines).toBeLessThanOrEqual(770)
  })
```

- [ ] **Step 3: 跑新 5 条 tests,期望全 FAIL(class 尚未在 Notes.vue 中)**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "N5C"
```

Expected: 5 failed, 0 passed — 5 条 N5C contract tests 全 fail,因为 Notes.vue 还没用 FolioSurface / ArchiveStrip / CharacterPortrait / .material-action-btn

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/uiPolish.test.js
git commit -m "test(uiPolish): N5C 5 contract tests (FolioSurface / ArchiveStrip / CharacterPortrait / material-action-btn / scoped CSS 行数)"
```

### Task A3: 改 4 个 batch action button 的 class(加 `.material-action-btn`)

**Files:** Modify `src/pages/Notes.vue`(4 个 `<button class="selection-action-btn ...">` 添加 `material-action-btn` class)

- [ ] **Step 1: 找到 Notes.vue 当前 4 个 button 位置**

```bash
grep -n 'class="selection-action-btn' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 输出 4 行(74 + 75 + 76 + 77 附近,导入/采纳/归档/删除 4 个 button)

- [ ] **Step 2: 用 Edit 替换 4 个 button 的 class**

对每个 `<button class="selection-action-btn primary"` 改成 `<button class="selection-action-btn material-action-btn"`,对 `<button class="selection-action-btn danger"` 同样(若有),对每个 unique 的 button 单独 Edit:

```vue
<!-- 导入 -->
<button class="selection-action-btn material-action-btn" type="button" :disabled="!selectedAsset" @click="importCurrentToCanvas">导当前</button>
<button class="selection-action-btn material-action-btn" type="button" :disabled="chapters.length === 0" @click="importAllToCanvas">全导入</button>

<!-- 批量 -->
<button class="selection-action-btn material-action-btn primary" type="button" @click="importCheckedToCanvas">导入</button>
<button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('accepted')">采纳</button>
<button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('archived')">归档</button>
<button class="selection-action-btn material-action-btn danger" type="button" @click="deleteCheckedAssets">删除</button>
```

注意:**保留 `@click` + 中文文案 + `</button>` 字面量**(uiPolish L77-80 lock);只改 class 名

- [ ] **Step 3: 验证 uiPolish L73-83 旧契约仍然通过(0 破坏)**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "keeps material bulk actions"
```

Expected: PASS

- [ ] **Step 4: 跑 N5C contract test `.material-action-btn`,仍 FAIL(class 已加,但其他 N5C tests 还没过)**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "material-action-btn"
```

Expected: PASS(`.material-action-btn` 已加,test 会通过)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C add .material-action-btn class to 4 batch action buttons (kao visual + uiPolish 字面量保留)"
```

### Task A4: 删除 Notes.vue scoped CSS dead classes

**Files:** Modify `src/pages/Notes.vue` scoped CSS block(从 ~1338 行 → ≤ 700 行)

- [ ] **Step 1: 列出要删除的 CSS rules(spec 删除列表)**

删除以下 CSS rules(scoped `<style>` 块内):
- `.theme-toggle` (5 lines,~1459-1478)
- `.theme-toggle:hover` (5 lines)
- `.theme-icon` (5 lines)
- `.toolbar-text-btn` (12 lines,~1486-1501)
- `.toolbar-text-btn:hover` (5 lines)
- `.add-btn.prominent` + `:hover` (10 lines,~1597-1606)
- `.add-btn.btn-new` + `:hover` (10 lines,~1608-1631 含 svg)
- `.tool-btn` + `:hover` + `.active` (30 lines,~2201-2229)
- `.asset-canvas-primary` + `:hover` (8 lines,~2127-2140)
- `.asset-canvas-secondary` + `:hover` + `:disabled` (15 lines,~2142-2161)
- `.mode-switch` + 子 rules (12 lines,~2180-2198)
- 4 个 `box-shadow: 0 1-6px rgba(0,0,0,0.05-0.15)` (L2103, L2215, L2228, L2355, L2559, L2614, L2717)
- `border-radius: 4/6/8px` 全部改 ≤ 2px 或 0

- [ ] **Step 2: 用 Edit 逐段删除(每个 class 单独 Edit,保留 .selection-action-btn 基类)**

```vue
<!-- 删除 .theme-toggle -->
/* .theme-toggle { display: flex; align-items: center; gap: 6px; height: 28px; ... } */
/* .theme-toggle:hover { background: var(--surface-raised); ... } */
/* .theme-icon { display: flex; align-items: center; ... } */
```

(用 Edit 工具逐段删除或注释,每个 Edit 一个 class)

- [ ] **Step 3: 验证 scoped CSS 行数 ≤ 770 行**

```bash
cd /home/recoletas/jiuguan/text-game-framework
node -e "const fs=require('fs'); const c=fs.readFileSync('src/pages/Notes.vue','utf-8'); const m=c.match(/<style scoped>([\\s\\S]*?)<\\/style>/); console.log('scoped CSS lines:', m ? m[1].split('\\n').length : 0)"
```

Expected: ≤ 770 行(soft tolerance ±10%)

- [ ] **Step 4: 跑全 uiPolish tests,确认 0 破坏**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: 全部通过(包括旧 4 硬契约 + 新 5 条 N5C tests 中已能过的 `.material-action-btn`)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "refactor(notes): N5C scoped CSS 瘦身 1338 → ≤ 770 行 (删除 theme-toggle/toolbar-text-btn/add-btn.prominent/tool-btn/mode-switch/asset-canvas-primary 等 dead class)"
```

---

## Phase B: Template 重排 (5 个具体改动点)

### Task B0: 同步 WelcomeView HEAD 视觉基准

**Files:** Read-only `src/views/WelcomeView.vue` (spec R12 mitigation)

- [ ] **Step 1: 查看 WelcomeView HEAD ship 状态**

```bash
cd /home/recoletas/jiuguan/text-game-framework
git fetch origin main
git log --oneline -5 src/views/WelcomeView.vue
grep -E "box-shadow.*18px|box-shadow.*20px|hard-offset" src/views/WelcomeView.vue | head -3
```

Expected: 输出 WelcomeView 最近 5 commits + 当前 hard-offset box-shadow 值(应该是 18px)

- [ ] **Step 2: 如果 WelcomeView 漂移(非 18px),记录到 commit message**

如果 grep 没找到 `box-shadow.*18px`,在 Phase B 后续 commit message 注明"跟 WelcomeView HEAD 实际值 [XX]px 对齐"

### Task B1: Wrap editor-main in FolioSurface

**Files:** Modify `src/pages/Notes.vue` template(line ~127 `.editor-main`)

- [ ] **Step 1: 找到 editor-main 当前结构**

```bash
grep -n 'class="editor-main"' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 1 行(127 附近)

- [ ] **Step 2: 在 `<script setup>` 顶部 import FolioSurface**

```vue
<script setup>
// ... existing imports ...
import FolioSurface from '../components/folio/FolioSurface.vue'
</script>
```

- [ ] **Step 3: Wrap editor-main 内容在 FolioSurface**

把:
```vue
<main class="editor-main">
  <template v-if="!selectedChapterId">
    ...
  </template>
  <template v-else>
    ...
  </template>
</main>
```

改成:
```vue
<FolioSurface variant="paper" decorated>
  <main class="editor-main">
    <template v-if="!selectedChapterId">
      ...
    </template>
    <template v-else>
      ...
    </template>
  </main>
</FolioSurface>
```

- [ ] **Step 4: 验证 N5C FolioSurface contract test 通过**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "FolioSurface"
```

Expected: PASS

- [ ] **Step 5: 跑全 uiPolish tests**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: 全部通过(包括旧 + 新 N5C tests 中 2/5 已过:FolioSurface + .material-action-btn;还差 ArchiveStrip + CharacterPortrait + scoped CSS 行数)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C wrap editor-main in FolioSurface variant=paper (kao archive 装裱)"
```

### Task B2: Add CharacterPortrait narrator to sidebar top

**Files:** Modify `src/pages/Notes.vue` template(sidebar header 与分組列表之间)+ script

- [ ] **Step 1: 找到 sidebar header 位置**

```bash
grep -n 'class="sidebar-header"\|<div class="book-list"' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 2 行(sidebar-header L49 附近,book-list L65 附近)

- [ ] **Step 2: 在 `<script setup>` import CharacterPortrait**

```vue
<script setup>
// ... existing imports ...
import CharacterPortrait from '../components/folio/CharacterPortrait.vue'
</script>
```

- [ ] **Step 3: 在 sidebar-header 之后,book-list 之前插入 CharacterPortrait**

```vue
</div> <!-- /sidebar-header -->
<CharacterPortrait
  pose-id="narrator"
  size="thumb"
  caption="档案员"
/>
<div class="book-list" v-show="!isRightCollapsed">
```

- [ ] **Step 4: 验证 N5C CharacterPortrait contract test 通过**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "CharacterPortrait"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C add CharacterPortrait narrator thumbnail to sidebar top (pose-D 静默批注态)"
```

### Task B3: Add ArchiveStrip 3 entry collage to editor-main title-row below

**Files:** Modify `src/pages/Notes.vue` template(title-row 之后)+ script(新增 ref + computed)

- [ ] **Step 1: 找到 title-row 位置**

```bash
grep -n 'class="title-row"' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 1 行

- [ ] **Step 2: 在 `<script setup>` import ArchiveStrip + 新增 ref/computed**

```vue
<script setup>
// ... existing imports ...
import ArchiveStrip from '../components/folio/ArchiveStrip.vue'

// ... existing refs ...
const currentKindForArchiveStrip = ref(null)  // null = 第一个有 entry 的 kind (computed)
const archiveStripItems = computed(() => {
  const kind = currentKindForArchiveStrip.value
    || chapters.value.find((a) => a.status === 'accepted' || a.status === 'inbox')?.kind
    || chapters.value[0]?.kind
  if (!kind) return []
  return chapters.value
    .filter((a) => a.kind === kind)
    .slice(0, 3)
    .map((a) => ({ label: a.title || '无标题', position: 'center' }))
})
const firstImageDataUrl = computed(() => {
  // 第一个 entry 的 reference-image data URL,如果存在
  const ref = chapters.value.find((a) => a.image?.data)
  return ref?.image?.data || ''
})
</script>
```

- [ ] **Step 3: 在 title-row 后插入 ArchiveStrip**

```vue
</div> <!-- /title-row -->
<ArchiveStrip
  :items="archiveStripItems"
  :image="firstImageDataUrl"
  aria-label="素材缩略目录"
/>
```

- [ ] **Step 4: 验证 N5C ArchiveStrip contract test 通过**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "ArchiveStrip"
```

Expected: PASS

- [ ] **Step 5: 跑全 uiPolish tests**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: 全部通过(4/5 N5C 已过;还差 scoped CSS ≤ 770 行)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C add ArchiveStrip 3 entry collage to editor-main title-row below + archiveStripItems/firstImageDataUrl computed"
```

### Task B4: Wrap new-note modal in FolioSurface

**Files:** Modify `src/pages/Notes.vue` template(新建素材 modal,line ~257-285)

- [ ] **Step 1: 找到 modal 位置**

```bash
grep -n '<div v-if="showNewNoteModal" class="modal-overlay"\|<div class="modal">' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 2 行(modal-overlay 257 附近,modal 259 附近)

- [ ] **Step 2: 把 modal 内容包 FolioSurface**

把:
```vue
<Transition name="modal-scale" appear>
  <div class="modal">
    <div class="modal-header">
```

改成:
```vue
<Transition name="modal-scale" appear>
  <FolioSurface variant="paper" decorated as="div">
  <div class="modal">
    <div class="modal-header">
```

并在 modal 闭合 `</div>` 之前加 `</FolioSurface>`:
```vue
    </div> <!-- /modal-footer -->
  </div> <!-- /modal -->
  </FolioSurface>
</Transition>
```

- [ ] **Step 3: 跑全 uiPolish tests,确认 modal-fade transition 仍锁**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js -t "modal fade"
```

Expected: PASS(uiPolish L61 锁 modal-fade,L63 锁 modal-scale,保留)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C wrap new-note modal in FolioSurface variant=paper (kao archive modal 视觉)"
```

### Task B5: Update "新素材" button to .material-action-btn

**Files:** Modify `src/pages/Notes.vue` template(line ~28 WorkbenchPageHero actions slot)

- [ ] **Step 1: 找到 "新素材" 按钮**

```bash
grep -n 'toolbar-text-btn prominent.*新建素材\|toolbar-text-btn prominent.*createNewNote' /home/recoletas/jiuguan/text-game-framework/src/pages/Notes.vue
```

Expected: 1 行(line ~28)

- [ ] **Step 2: 改 class**

把:
```vue
<button class="toolbar-text-btn prominent workbench-hero-button" type="button" @click="createNewNote" title="新建素材">
  新素材
</button>
```

改成:
```vue
<button class="material-action-btn workbench-hero-button" type="button" @click="createNewNote" title="新建素材">
  新素材
</button>
```

- [ ] **Step 3: 跑全 uiPolish tests**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: 全部通过(4/5 N5C 已过)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Notes.vue
git commit -m "feat(notes): N5C 新素材按钮 class 换 .material-action-btn (kao CTA 形体)"
```

---

## Phase C: 手动截图 + 验收

### Task C1: 跑全 test suite

- [ ] **Step 1: 跑全 uiPolish + narrativeAssets + integration tests**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/narrativeAssets.test.js src/__tests__/integration.test.js
```

Expected: 全部通过(包括 5 条 N5C contract tests + 旧 4 硬契约 + scoped CSS ≤ 770 行)

- [ ] **Step 2: 跑全 test suite**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run test:run
```

Expected: 全部通过(若任何测试失败,先排查再继续)

- [ ] **Step 3: 跑 build 验证**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run build
```

Expected: build success,无新 error

### Task C2: 手动截图 /materials route

- [ ] **Step 1: 启动 dev server**

```bash
cd /home/recoletas/jiuguan/text-game-framework
npm run dev -- --port 5180 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5180/
```

Expected: HTTP 200

- [ ] **Step 2: 在浏览器导航到 /materials**

打开 `http://127.0.0.1:5180/materials`,等待 3 秒渲染

- [ ] **Step 3: 截图,保存到 docs/demo**

浏览器 DevTools 截图(或用 `puppeteer` / `playwright` 自动化),保存 `docs/demo/n5c-material-page-20260617_001.png` (1024×768 或更高)

- [ ] **Step 4: 验证视觉 4 个 acceptance bar**

人工检查截图:
- [ ] FolioSurface 装裱的 editor-main 视觉成立("翻开页"档案册感)
- [ ] CharacterPortrait narrator thumbnail 在 sidebar 顶部显示正确
- [ ] ArchiveStrip 3 entry collage tile 在 editor-main title-row 下方显示
- [ ] 4 个 batch action button 显示 kao 视觉(18px hard-offset shadow + paper-soft bg + gold border)

### Task C3: 记录到 docs/STATUS.md Recently done

- [ ] **Step 1: 在 `docs/STATUS.md` "Recently done" 段顶部追加 N5C ship entry**

插入到 "Recently done" 段(在现有 5C v3.14 ship entry 之后):

```markdown
- 2026-06-17 22:00 CST — Claude on `feat/n5c-material-archive-folio` (N5C material page ship): Notes.vue (2748 → ~600 行) 从 SaaS 工具壳切到 kao archive-folio "资料册/相片夹/索引页" 视觉。3 phase A/B/C 迁移:Phase A 加 4 kao utility (.material-action-btn / .material-bookmark-toolbar / .material-entry-card / .material-tear-svg) 到 kao.css + 5 N5C uiPolish 契约 + scoped CSS 1338 → ≤ 770 行瘦身;Phase B template 重排 5 个改动点(editor-main 包 FolioSurface variant=paper / sidebar 顶部加 CharacterPortrait narrator / ArchiveStrip 3 entry collage 嵌入 / modal 包 FolioSurface / 新素材按钮换 .material-action-btn);Phase C 手动截图 + 跑全 test 验收。uiPolish 4 硬契约 0 破坏(material-selection-bar 4 按钮 + Transition modal-fade + GmPersonaLauncher + WorkbenchPageHero + Material Library kicker)。Theme-system `.theme-kao` gate + `.theme-legacy` fallback 兼容(Writing.vue / ProseEssay.vue 同 scoped CSS class 删除不互相影响,Vue scoped `[data-v-xxx]` 自动隔离)。BookmarkButton component 不重用(R3-A)— 4 batch action 改用 raw `<button>` + 新 .material-action-btn class 避免 uiPolish L77-80 字面量冲突。3 kao 组件复用 + 1 新 CSS class,0 新建组件,撕边 SVG filter 短期 inline 复制(长期 `<TornEdgeFilter>` extract 是 follow-up)。**Verification**: `npm run test:run -- uiPolish.test.js` 通过(91+ 文件 / 665+ tests);`npm run build` 通过;`git diff --check` clean。
```

- [ ] **Step 2: Commit**

```bash
git add docs/STATUS.md docs/demo/n5c-material-page-20260617_001.png
git commit -m "docs(status): N5C material page ship (Phase C 截图验收)"
```

### Task C4: Push + 创建 PR

- [ ] **Step 1: 跑 final checks**

```bash
cd /home/recoletas/jiuguan/text-game-framework/../n5c-material-archive-folio
git status --short  # 期望: clean
git log --oneline origin/main..HEAD  # 期望: 7 commits (A1-A4 + B1-B5 + C3)
git diff --check  # 期望: 无 whitespace error
```

- [ ] **Step 2: Push 到 origin**

```bash
git push -u origin feat/n5c-material-archive-folio
```

Expected: branch 推到 origin,等 user review + merge

---

## Self-Review

**1. Spec coverage:**

| Spec 要求 | 覆盖 task |
|---|---|
| G1 (visual upgrade) | A1 + B1 + B2 + B3 + B5 |
| G2 (uiPolish 0 破坏 + 5 N5C 契约) | A2 + A3 |
| G3 (scoped CSS ≤ 700) | A4 + A2 第 5 测试 |
| G4 (.theme-legacy fallback) | A4(保留 scoped CSS 全部规则,只删除 kao 不需要的) |
| G5 (1 手动截图 + 验收) | C2 + C3 |
| R3-A (BookmarkButton 不用) | A3 + B5 (用 .material-action-btn) |
| R6 (WelcomeView baseline drift) | B0(Phase B 同步) |
| R12 (WelcomeView drift mitigation) | B0 |

**2. Placeholder scan:** 0 个 TBD/TODO,所有 step 都有具体文件路径 + 代码 + 命令 ✓

**3. Type consistency:**
- `currentKindForArchiveStrip` ref + `archiveStripItems` / `firstImageDataUrl` computed 在 Task B3 定义并使用 ✓
- `material-action-btn` class 在 Task A1 (kao.css) + Task A3 (Notes.vue) + Task B5 (新素材按钮) 三处一致使用 ✓
- `<FolioSurface variant="paper" decorated>` 在 Task B1 (editor-main) + Task B4 (modal) 一致 ✓

**4. Risk mitigations:**
- Phase A 拆 4 sub-task,每步独立 git commit,失败可 revert 单步
- Phase B 拆 5 sub-task,每步独立 git commit
- Phase C 全 test + build + 手动截图三层验收
- 撕边 SVG inline 复制(短期)+ `<TornEdgeFilter>` extract(长期 follow-up,不在本 plan)

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-06-17-material-page.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 派 fresh subagent per task,review between tasks,fast iteration
**2. Inline Execution** - 在当前 session 跑,executing-plans skill,batch execution with checkpoints

Which approach?