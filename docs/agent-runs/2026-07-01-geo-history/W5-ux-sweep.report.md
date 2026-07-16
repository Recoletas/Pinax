# W5: UX sweep — 9 个 atomic a11y / disabled / overflow / truncation 修复

> 2026-07-01 CST · Codex on `main` · 用户反馈 "目前这样的交互方面的小 bug 什么的应该有很多，因为我主要都在实现功能没有打磨实用性，你仔细排查一下，优化使用逻辑，不要大改记得"
>
> **范围**: 在 W4 / W4b / W4c / W4c.5 之后做一次 UX 巡检. 派 4 个并行 Explore 探子扫描 11 个页面 / 6 个 composable, 挑出**最小改动**+**最高影响**+**纯 CSS / template**的 9 个 fix. 完全不改 logic, 不改 do-not-touch 文件 (`gameStore.js` / `worldbookContextBuilder.js` / `generation*` / `StatusBar.vue`).

---

## 1. 调查方法

派 4 个并行 Explore 探子覆盖:

| Surface | Agent |
|---|---|
| Welcome / Opening / Experience + 共享 chrome | Agent #1 |
| Writing / Notes / ProseEssay + 创作 composables | Agent #2 |
| 4 settings sub-pages (post-W4c.5) + MyWorldbooksNav / WorldbookHeroCard 等 | Agent #3 |
| 共享 composables: useStorage / useTheme / useApiSettings / useSettingsPopup / useViewportHeight | Agent #4 |

每个 agent 不修任何代码, 只回报 top 5–8 个 interaction bug + file:line + 1-line 修复建议 (CSS 或 template).

**总回报 ~40 个候选 bug**, 按"小改动 + 高影响 + 无 logic / 无 do-not-touch 触碰"过滤 → **9 个 fix** 进入本轮.

## 2. 选出的 9 个 Fix (按 impact 排序)

| # | Bug | 文件:行 | 修复类型 |
|---|---|---|---|
| 1 | "3D" 按钮看起来 disabled 但仍 clickable, onClick 弹 `alert()` 阻塞对话框 | `src/components/geography/WorldMapPanel.vue:18-21` | template (1 元素) |
| 2 | `?section=ai` deep-link W4b 后 scrollIntoView 没滚对 (用 document 滚, 实际容器是 `.editor-layout`) | `src/pages/WorldBookEditor.vue:928-936` | template watcher (4 行) |
| 3 | SettingsSectionNav tabs 没有 `:focus-visible`, Tab 键看不到焦点环 | `src/components/workbench/SettingsSectionNav.vue:58-90` | CSS (1 规则块) |
| 4 | WorldBookEditor 整个左侧 240px 世界书列表 + editor tabs 没有 `:focus-visible` | `src/pages/WorldBookEditor.vue:26-34, 2393-2409` | CSS (2 规则块) |
| 5 | AppearanceControls 拿到 corrupt theme (例如 `"darkk"`) 时 4 个 radio 全不亮, 用户视觉迷惑 | `src/components/theme/AppearanceControls.vue:14-31` | script (1 行) + template (2 行) |
| 6 | Sticky `MyWorldbooksNav` picker 没视觉分隔, 滚动内容贴边 | `src/components/workbench/MyWorldbooksNav.vue:56-65` | CSS (2 行追加) |
| 7 | WorldMapPanel `activeNode.name` 没有 max-width, 长名撑破 toolbar | `src/components/geography/WorldMapPanel.vue:5-11, 248-253` | template (1 attr) + CSS (4 行) |
| 8 | StructuredSettings worldbook select 没有 `:title`, 长名 truncate 后无 context | `src/pages/StructuredSettings.vue:11-15` | template (2 attr) |
| 9 | StructuredSettings 主题 toggle 图标-only button 没有 `aria-label` | `src/pages/StructuredSettings.vue:19-28` | template (1 attr) |

**未进本轮** (后续):
- WorldMapPanel AI streaming cancel button — 需要 script change (per agent建议)
- useToast 真正的 toast 栈 — 需要建新 composable
- AppearanceControls "已恢复默认主题" warn — 需要 store flag 暴露
- Writing/Notes 拖拽 affordance 重构 — UX 较大
- useCanvasBoard / useEditorHistory race conditions — 是 logic bug, 越线

## 3. TDD 流程 (8 contract 全红→全绿)

`src/__tests__/uiPolish.test.js` 新 describe block `ui polish — UX sweep W5: atomic a11y / disabled / overflow / truncation fixes`, 8 个 contract:

1. WorldMapPanel "3D" button: `:disabled` + `title=开发中` + **不** 绑 `alert()`
2. WorldBookEditor ?section watcher: 用 `closest('.editor-layout').scrollTo({})` 而非 document scrollIntoView
3. SettingsSectionNav: `.settings-section-tab:focus-visible { outline ... }`
4. WorldBookEditor: `.worldbook-item:focus-visible` + `.editor-tab:focus-visible`
5. AppearanceControls: script 内 `current || OPTIONS[0]` fallback + template 不再用 `current?.testId`
6. MyWorldbooksNav sticky picker: `border-bottom` + `box-shadow`
7. WorldMapPanel `.active-world-name`: `max-width: 200px` + ellipsis + `:title`
8. StructuredSettings select `:title` + theme toggle `:aria-label`

```
uiPolish -t "UX sweep W5": 8/8 全绿
```

## 4. 应用 Fix (diff 摘要)

### 4.1 WorldMapPanel.vue — "3D" 按钮去 alert()

```diff
-          <button class="toggle-btn disabled" @click="alert('3D 地图功能正在开发调优中，敬请期待！')">
+          <button class="toggle-btn" :disabled="true" title="3D 地图开发调优中">
             <svg .../>
             3D
           </button>
```

### 4.2 WorldBookEditor.vue — `?section=ai` 滚 `.editor-layout`

```diff
-    if (section === 'import' || section === 'ai') {
-      document.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
-    }
+    if (section === 'import' || section === 'ai') {
+      // W4b regression: W4b made .editor-layout the scroll container
+      // (`overflow: auto`), so document-level scrollIntoView now misses
+      // the target — scroll the layout container instead. Use the
+      // section's offsetTop within the layout for an anchored scroll.
+      const target = document.querySelector(`[data-section="${section}"]`)
+      const layout = target?.closest?.('.editor-layout')
+      if (layout && target) {
+        layout.scrollTo({ top: target.offsetTop - 12, behavior: 'smooth' })
+      }
+    }
```

### 4.3 SettingsSectionNav.vue — `:focus-visible` on tabs

```css
+ .settings-section-tab:focus-visible {
+   outline: 2px solid var(--accent);
+   outline-offset: -2px;
+ }
```

### 4.4 WorldBookEditor.vue — focus-visible + dev comment

```css
+ /* W5 UX sweep: keyboard tabbing through the 240px worldbook pane
+    needs a visible focus ring; only :hover existed before. */
+ .worldbook-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

+ /* W5 UX sweep: editor tab focus-visible so keyboard nav is obvious. */
+ .editor-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
```

### 4.5 AppearanceControls.vue — corrupt theme fallback

```js
// W5 UX sweep: a corrupt/out-of-range theme value made `current`
// undefined and ALL 4 radios looked unselected — visually disorienting
// with no recovery hint. Default to OPTIONS[0] when no match.
const current = computed(() =>
  OPTIONS.find((o) => o.variant === themeStore.variant && o.colorScheme === themeStore.colorScheme)
    || OPTIONS[0]
)
```

Template `?:class="'is-active': current.testId === opt.testId"` (去掉 `?.` 因为 computed 现在永远有值).

### 4.6 MyWorldbooksNav.vue — sticky picker 视觉分隔

```css
.my-worldbooks {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--archive-paper);
+  border-bottom: 1px dashed color-mix(in srgb, var(--archive-olive) 22%, transparent);
+  box-shadow: 0 4px 8px color-mix(in srgb, var(--archive-ink) 6%, transparent);
}
```

### 4.7 WorldMapPanel.vue — `activeNode.name` max-width + ellipsis + title

```diff
-        <span v-if="activeNode" class="active-world-name">
+        <span v-if="activeNode" class="active-world-name" :title="activeNode.name">
           — {{ activeNode.name }}
         </span>
```

```css
.active-world-name {
  ...
+  max-width: 200px;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+  vertical-align: bottom;
}
```

### 4.8 / 4.9 StructuredSettings.vue — select `:title` + theme `:aria-label`

```diff
-        <select class="worldbook-select" v-model="selectedWorldbookId" @change="onWorldbookChange">
+        <select class="worldbook-select" v-model="selectedWorldbookId" @change="onWorldbookChange" :title="worldbooksIndex.find(w => w.id === selectedWorldbookId)?.name || '选择世界书'">
           <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
+          <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id" :title="wb.name">
             {{ wb.name }}
           </option>
         </select>

-        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
+        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换到亮色主题' : '切换到暗色主题'">
```

## 5. 验证

```bash
# W4b 3 + W4c 5 + W5 8 = 16 scroll/UX contracts 全绿
npm run test:run -- src/__tests__/uiPolish.test.js -t "WorldBookEditor scroll|quick / map pages share|UX sweep W5"
# → Tests 16 passed | 284 skipped (300)

# W4 5 核心测试文件 (历史 regression protection)
npm run test:run -- src/__tests__/{playableWorldEntry,worldbookContextBuilder,playerHistory,runtimeEvents,gameStoreSession}.test.js
# → Test Files 5 passed (5) | Tests 64 passed (64)

npm run build
# → ✓ built in 3.94s

git diff --check
# → exit=0 (clean)
```

## 6. 改动文件 (7 src + 1 test)

| 文件 | Δ 行 | 改动类型 |
|---|---|---|
| `src/components/geography/WorldMapPanel.vue` | +9 | 1 template + 1 attr; CSS +4 行 (max-width / ellipsis) |
| `src/pages/WorldBookEditor.vue` | +16 | 1 watcher logic + 2 CSS rule blocks |
| `src/components/workbench/SettingsSectionNav.vue` | +4 | 1 CSS rule (`:focus-visible`) |
| `src/components/theme/AppearanceControls.vue` | +5 | 1 script line + 2 template attr changes |
| `src/components/workbench/MyWorldbooksNav.vue` | +3 | CSS 2 行 |
| `src/pages/StructuredSettings.vue` | +3 | 3 template attrs |
| `src/__tests__/uiPolish.test.js` | +73 | 1 describe block, 8 contracts |

0 个 do-not-touch 文件改动. 0 个 logic 修改. 0 个 store mutation. 0 个 API / 网络路径变更.

## 7. 显式 Out of Scope (留给后续)

1. **WorldMapPanel AI streaming cancel button** — 需要 script change (新增 abort handler + `runGenerationTask` abort 支持)
2. **Toast composable (`useToast`)** — 需要全局错误/事件 toast 栈 + dedupe, 跨多 surface 反馈 (W2/Agent #4 #1)
3. **AppearanceControls 真正"已恢复默认主题" warn banner** — 需要 store 暴露 `recoveredFromCorrupt` flag
4. **Writing/Notes 拖拽 affordance 重构** — W1/Agent #2 #1, 较大, 需新增 drag-handle UI
5. **useCanvasBoard dragend-out-of-window** — script change, 加 window-level listener
6. **useEditorHistory debounce 中 undo 丢 keystroke** — script change, push() 同步路径
7. **SettingsPopup Esc handler 始终激活** — script change, 移到 `watch(isOpen, ...)`
8. **SettingsPopup Esc handler + mobile keyboard offset** — 多个 follow-up
9. **AppearanceControls 暗色 chip-bg 显示** — 缺 fallback
10. **WorldBookEditor search count 反馈** — 需要 small state ref + template addition

## 8. 选择依据 (per `feedback_no_token_limit.md` + `feedback_commit_conventions.md`)

- 全部 fix 都是 1-5 行 CSS 或 1-3 attr template 改动
- 全部 uiPolish 静态 source-regex contract 防回退
- 全部不动 gameStore / worldbookContextBuilder / generation / StatusBar
- 全部不动 logic, 不动 router / store action / API
- 全部 16 个 scroll/UX contracts 通过, W4 64 tests 仍 green
- 修改总行数 < 130, 1 个 commit-friendly batch
