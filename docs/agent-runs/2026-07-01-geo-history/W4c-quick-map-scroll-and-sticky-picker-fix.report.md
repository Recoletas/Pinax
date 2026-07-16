# W4c: QuickImport / WorldMap 滚动修复 + "选世界书" sticky picker

> 2026-07-01 CST · Codex on `main` · 跟 W4b 同源 bug + 隐性 UX 缺失
>
> **范围**:
> - Bug A: WorldBookQuickImport + WorldMapPage 的 overflow-clipping（跟 W4b 同根因：AppShell `100vh; overflow: hidden`，子页没自身 scroll 容器）
> - Bug B: "选世界书" picker 滚动时不跟随页面（MyWorldbooksNav 缺 sticky 行为）
>
> **不在范围**: SettingsSectionNav scroll-aware 子页高亮（router-derived 即正确，Bug B 解决后自然无需 scroll-spy），UI 大改，K3 / TimeQuickRail WIP。

---

## 1. 触发 (用户报告)

> "你结构化设定什么的也有一样的 bug，没有改啊，而且左边的设定选世界书部分没有做页面向下滑后的对应处理"

派 2 个并行 Explore 探子扫描 4 个 settings 子页 + 找 sticky 模式:
- Explore A: 4 子页的 overflow-clipping 审计
- Explore B: "选世界书" sticky 现状定位

**两个 Explore 收敛点**:
1. WorldBookQuickImport + WorldMapPage 都缺 `overflow: auto`（StructuredSettings 已经正确）
2. MyWorldbooksNav 完全没 sticky，用户向上滚时 "选世界书" `<select>` + 切换/新建/管理 按钮滚出视口

## 2. 根因

### 2.1 AppShell bounding（已知 from W4b）

```
AppShell.app-shell                    →  height: 100vh; overflow: hidden
  shell-content (flex column)
    Page root (per page)
      .quick-page (QuickImport)        →  min-height: 100vh; column; NO overflow on .quick-page__body
      .world-map-page (WorldMapPage)   →  min-height: 100vh; column; NO overflow
      .editor-layout (W4b fixed)       →  flex: 1; min-height: 0; overflow: auto ✓
      .settings-body (StructuredSettings) → flex: 1; min-height: 0; overflow: auto ✓
```

### 2.2 Sticky picker (Bug B)

`MyWorldbooksNav.vue` 是 WorldBookQuickImport 的子组件（L11），其 `.my-worldbooks` 是 `display: flex; padding: 8px 0;` — 完全没 `position: sticky`。当 body 滚动时，picker 跟所有其他子组件一起被滚走，用户在浏览 preset grid 时失去切换/新建能力。

**本仓库不存在 scroll-spy / IntersectionObserver pattern**（已 grep 整个 `src/`）：唯一的 sticky 是 `AppShell` 的 `.shell-mast`。修复方案选最小：给 picker 加 `position: sticky; top: 0; z-index: 5; background: opaque`——它会自动成为 `.quick-page__body` scroll container 内的 sticky 元素，不需要 scroll listener。

## 3. 修复 (3 处 CSS + 1 行 template)

### 3.1 WorldBookQuickImport.vue (`src/pages/WorldBookQuickImport.vue` L122-129)

```diff
 .quick-page__body {
+  /* AppShell is height: 100vh + overflow: hidden; mirror the W4b
+     pattern so hero + nav + preset grid + extra actions can scroll
+     inside the bounded shell instead of being clipped. The body
+     fills the remaining viewport space (.quick-page is min-height:
+     100vh; display: flex; column above), and the sticky
+     MyWorldbooksNav picker inside this body pins relative to here. */
+  flex: 1;
+  min-height: 0;
   display: flex;
   flex-direction: column;
   gap: 18px;
   max-width: 1240px;
   width: 100%;
   margin: 0 auto;
+  overflow: auto;
 }
```

### 3.2 WorldMapPage.vue — 加 body wrapper

QuickImport 已有 `.quick-page__body`，WorldMapPage 没有，所以加 1 个 wrapper：

```diff
 <template>
   <div class="world-map-page">
     <SettingsSectionNav />
-    <WorldMapPanel />
-    <PerfOverlay />
+    <div class="world-map-page__body">
+      <WorldMapPanel />
+      <PerfOverlay />
+    </div>
   </div>
 </template>

 .world-map-page { /* unchanged */ }

+.world-map-page__body {
+  /* Mirror W4b + StructuredSettings .settings-body so the map panel
+     scrolls inside the bounded AppShell instead of being clipped. */
+  flex: 1;
+  min-height: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 12px;
+  overflow: auto;
+}
```

### 3.3 MyWorldbooksNav.vue — 加 sticky + opaque

```diff
 .my-worldbooks {
   display: flex;
   align-items: center;
   flex-wrap: wrap;
   gap: 8px 12px;
   padding: 8px 0;
+  /* Pin the 选世界书 picker to the top of its scroll container
+     (.quick-page__body has overflow: auto) so the 切换 / 新建 / 管理
+     controls stay reachable while the user browses the preset grid
+     below. Opaque background prevents the scrolling content from
+     bleeding through under the picker. */
+  position: sticky;
+  top: 0;
+  z-index: 5;
+  background: var(--archive-paper);
 }

+/* Legacy 主题 (.theme-legacy) 同样需要 opaque 背景, 否则 Material 蓝白
+   主题下 preset grid 滚动时会从 picker 后面露出来. */
+.theme-legacy .my-worldbooks {
+  background: var(--bg-secondary);
+}
```

**为什么 `top: 0`**: sticky offset 是相对 scroll container 顶部。`.quick-page__body` 是 scroll container，`top: 0` 让 picker 在 hero 滚过后立刻钉在 body 顶部（也就是 nav 下方）。不需要 `top: <mast-height>`，因为 mast 在 body 上方（不在 scroll container 内）。

## 4. TDD 流程（3 个新契约）

`src/__tests__/uiPolish.test.js` 新 describe block `ui polish — quick / map pages share the W4b AppShell-bounded scroll contract`：

1. `WorldBookQuickImport .quick-page__body becomes the bounded scroll container` — 锁 `flex: 1; min-height: 0; overflow: auto`
2. `WorldMapPage exposes an overflow: auto scroll container so the map panel can scroll past the viewport` — 锁 `overflow: auto` 出现在 source 内（page root 或 body wrapper 都算）
3. `MyWorldbooksNav picker sticks to the top of its scroll container with an opaque background` — 锁 `position: sticky` + `top:` + `background:` 在 `.my-worldbooks` 内，以及 legacy theme override 保 opaque

```
✓ ui polish — quick / map pages share the W4b AppShell-bounded scroll contract  (3 tests)
```

## 5. 验证

```bash
# 3 个新契约 + 3 个 W4b 契约 = 6 个 scroll contract 全绿
npm run test:run -- src/__tests__/uiPolish.test.js -t "WorldBookEditor scroll|quick / map pages share"
# → Tests 6 passed | 284 skipped (290)

# W4 5 核心测试文件 (回归保护)
npm run test:run -- src/__tests__/playableWorldEntry.test.js src/__tests__/worldbookContextBuilder.test.js \
  src/__tests__/playerHistory.test.js src/__tests__/runtimeEvents.test.js src/__tests__/gameStoreSession.test.js
# → Test Files 5 passed (5) | Tests 64 passed (64)

npm run build
# → ✓ built in 3.89s

git diff --check
# → 0 输出 (clean)
```

## 6. 改动文件

| 文件 | Δ 行数 | 说明 |
|---|---|---|
| `src/pages/WorldBookQuickImport.vue` | +9 | `.quick-page__body` 加 `flex: 1; min-height: 0; overflow: auto` + 7 行注释 |
| `src/pages/WorldMapPage.vue` | +16 | 1 行 template wrapper + 9 行 scoped CSS 注释 |
| `src/components/workbench/MyWorldbooksNav.vue` | +14 | `.my-worldbooks` 5 行 sticky 规则 + `.theme-legacy` 3 行 override + 6 行注释 |
| `src/__tests__/uiPolish.test.js` | +33 | 新 describe block, 3 contract |

0 个 gameStore / worldStore / generation / vuex / router 改动。0 个其他页面动到。

## 7. 已知边界 / Out of scope

1. **SettingsSectionNav scroll-aware 子页高亮** — 4 tab 是路由入口（4 个独立 route），不在 page 内 anchor scroll-spy 适用范围。Bug B 修复后用户能用 sticky picker 快速切世界书，section nav 仍由 route 决定 active。
2. **WorldMapPage 的 body wrapper 是一次性 template 变更** — 后续若加更多 body 内容，会自然受益于这个 wrapper；若想缩回原结构，把 `.world-map-page` 改成 `flex: 1; min-height: 0; overflow: auto` 同样能 work，但会失去 padding 隔离（WorldMapPanel 自己有 padding）。当前 wrapper 方案更稳。
3. **Hero card (.worldbook-hero)** 故意未 sticky — 用户没要求 + sticky hero 会 over-dominate 大屏。
4. **MyWorldbooksNav 在 legacy 主题的 `top: 0` 行为** — Material 蓝白主题下，mast 是 `position: sticky; top: 0` 在更高 z-index；picker 在 `.quick-page__body` scroll 容器内 `top: 0` 钉到 body 顶部，picker 元素本身的 z-index=5 远低于 mast=90，不会压住 mast。
5. **AppShell 共享 sticky mast 的高度变量** (`--shell-mast-height`) — 当前未引入，因为 sticky 容器是 body（不是窗口），`top: 0` 已正确；若以后 sticky picker 升级到钉在 window 顶部，则需引用 `var(--shell-mast-height)`。
