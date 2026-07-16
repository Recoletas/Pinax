# W4b: WorldBookEditor 滚动修复 (advanced settings AI section 被截断)

> 2026-07-01 CST · Codex on `main` · 紧急 hotfix
>
> **范围**: `/settings/worldbook/advanced` 的 create tab 下半部分（"AI 生成世界书"）被 AppShell 截断，只能看到上半"从小说片段 / JSON 提炼"section。CSS-only 修复，1 个属性 + 1 行注释。
>
> **不在范围**: UI 大改、UI-K6/theme-system 调整、TimeQuickRail feature (其他 worker WIP)、K3 Experience.vue refactor (其他 worker WIP)。

---

## 1. 症状 (用户报告)

> "世界书的高级设置部分显示有 bug，只能看到前面的从小说片段导入，下面的 ai 概况生成只有部分出现。"

`/settings/worldbook/advanced` (`WorldBookEditor.vue`) 的 create tab：
- 顶段 `div.create-section[data-section="import"]` ("从小说片段 / JSON 提炼") 完整可见
- 底段 `div.create-section[data-section="ai"]` ("AI 生成世界书") 只露半截
- 没有滚动条提示还有内容

## 2. 根因 (Phase 1: systematic-debugging)

派 2 个并行 Explore 探子扫描，收敛到同 1 个根因：

```
AppShell.app-shell                    →  height: 100vh; overflow: hidden     (L304-307)
  shell-content                       →  flex: 1 1 auto; min-height: 0       (L772-786)
    .worldbook-page (WorldBookEditor) →  min-height: 100vh; display: flex    (L1747-1754)
      .editor-header                  →  52px (flex-shrink: 0)
      <SettingsSectionNav />          →  36px (flex-shrink: 0)
      .editor-layout                  →  flex: 1; min-height: 0; display: grid; gap: 12px   (L1784-1791)
                                                                                            ⚠️ NO overflow: auto
        aside (sidebar)               →  240px wide
        .editor-main                  →  display: flex; flex-direction: column              (L1844-1849)
          .editor-tabs                →  ~36px
          .card (create tab)          →  2 stacked .create-section (rows=6 + rows=5 textareas + form)
            create-section [import]    →  完整可见 (~250px)
            <hr class="create-divider">
            create-section [ai]        →  被截断 (~400px 只露 ~150px)
```

`.worldbook-page` 用 `min-height: 100vh` 而非 `height: 100vh`，内容超出时页面会变高，但 AppShell 是 `100vh; overflow: hidden` → 底部被裁切。
`.editor-layout` 和 `.editor-main` **都没有 `overflow: auto`**，所以没有内部滚动条，用户看不到 "还有内容被裁了" 的提示。

**对照工作正常的 `StructuredSettings.vue`（同 AppShell 内）**：
```css
.settings-body { flex: 1; min-height: 0; overflow: auto; }   /* L206-211 */
```

**这就是缺失的 `overflow: auto`**。

## 3. 修复 (1 处 CSS)

`src/pages/WorldBookEditor.vue` L1784-1791 `.editor-layout` 加 `overflow: auto`：

```diff
 .editor-layout {
   flex: 1;
   min-height: 0;
   display: grid;
   grid-template-columns: 240px minmax(0, 1fr);
   gap: 12px;
   padding: 12px;
+  /* AppShell is height: 100vh + overflow: hidden; without an internal
+     scroll container, the create tab's stacked "novel snippet import" +
+     "AI generation worldbook" sections get clipped at the bottom.
+     Mirror StructuredSettings.vue .settings-body so the editor scrolls
+     inside the bounded shell. */
+  overflow: auto;
 }
```

**为什么是 `.editor-layout` 而不是 `.editor-main`**：
- `.editor-layout` 是 `flex: 1; min-height: 0` 的 grid 容器，被 `worldbook-page` (flex column) 约束到视口内剩余高度
- 加 `overflow: auto` 后，整个布局（sidebar + main）一起在 bounded shell 内滚动
- 这是 mirror `StructuredSettings.vue` 的最小变更（不需要新加 template 节点）
- 副作用：sidebar 240px 也会一起滚动 — 在 create tab 高度 700-900px 的场景下完全可以接受

**为什么不动 `.worldbook-page`**：保持 `min-height: 100vh`（内容短时撑到 viewport，看起来"满"），不强行绑死 `height: 100vh`。

## 4. TDD 流程 (3 个新契约)

`src/__tests__/uiPolish.test.js` 新增 describe block `ui polish — WorldBookEditor scroll contract: create tab is reachable inside the bounded AppShell`：

1. `declares overflow: auto on the editor layout so the create tab can scroll past the viewport` — TDD 红灯，确认 `WorldBookEditor.vue` source 缺失
2. `keeps .editor-layout as a flex: 1 + min-height: 0 child so the scroll context is bounded` — 锁 `flex: 1` + `min-height: 0` 仍在
3. `still preserves the .editor-layout 2-column grid (sidebar + main)` — 锁 2-column grid 不被改坏

```
✓ src/__tests__/uiPolish.test.js > ...WorldBookEditor scroll contract  (3 tests)
```

## 5. 验证

```bash
# 3 个新契约
npm run test:run -- src/__tests__/uiPolish.test.js -t "WorldBookEditor scroll"
# → Tests 3 passed | 284 skipped (287)

# W4 5 核心测试文件 (回归保护)
npm run test:run -- src/__tests__/playableWorldEntry.test.js src/__tests__/worldbookContextBuilder.test.js \
  src/__tests__/playerHistory.test.js src/__tests__/runtimeEvents.test.js src/__tests__/gameStoreSession.test.js
# → Test Files 5 passed (5) | Tests 64 passed (64)

npm run build
# → ✓ built in 3.88s

git diff --check
# → 0 输出 (clean)
```

## 6. 回归分析 (无回归)

修改前/后 uiPolish fail 数对比 (3 次重跑)：

| 状态 | fail | pass | total |
|---|---|---|---|
| 1. 仅 W4 后 (HEAD 当时, 35 baseline) | 35 | 246 | 281 |
| 2. W4 + 我的 fix (现在, **HEAD ≠ W4**) | 92 | 195 | 287 |
| 3. W4 + 我的 fix 但 revert `.editor-layout` CSS | 93 | 194 | 287 |

第 2 vs 第 3 行的对比（93 → 92）证明：**我的 CSS fix 让 1 个新契约测试从 93 中脱颖而出变成 92**。换言之，**修复前 1 个失败测试因 fix 而变 pass**（实际是 3 个新契约的其中 1 个明确变绿；另外 2 个是从未在 baseline 跑过、所以 baseline 不计入），**没有造成任何回归**。

第 2 vs 第 1 行的对比（35 → 92）显示的 57 个 fail 增量，**全部是 pre-existing WIP**：
- **18 个 E11-A 失败**：K3 refactor 把 Experience.vue 改成 2-region (drop ws-left-rail, grid 1fr 320px)，但 E11-A tests 还锁旧的 3-region (ws-left-rail, grid 260px 1fr 300px) — 早于本次 fix 的 K3 改的
- **~30+ 个 UI-E11-C / UI-E17 失败**：W1 worker 把这些 test 改成要求 `<TimeQuickRail>` + `rail-mode="codex"`，但 TimeQuickRail feature 还没落 Experience.vue — W1 worker 的 wip test 改动
- **2 个 StatusBar 时间 hint 失败**：同样 W1 worker WIP

E11-A / E11-C / E17 / N5C / W2 / W10 / N10 等其它 35 个 baseline fail 都是不同 round 的 stale WIP contract，参见 STATUS.md 多 round 记录。

## 7. 改动文件

| 文件 | Δ 行数 | 说明 |
|---|---|---|
| `src/pages/WorldBookEditor.vue` | +7 | `.editor-layout` 加 `overflow: auto` + 5 行注释 |
| `src/__tests__/uiPolish.test.js` | +75 (3 tests) | 新 describe block, 3 个 contract |

0 个其他 src 文件改动。0 个 gameStore / worldStore / generation 改动。0 个依赖。

## 8. 已知边界 / Out of scope

1. **`scrollIntoView({block: 'start'})` on `?section=ai` deep link** (L928-936) 之前因没有 scroll container 而 no-op; 现在能 work 但需要 browser 实测。
2. **Sidebar (240px) 也跟着滚动** — create tab 高度超 viewport 时整个 layout 一起滚; 后续可拆 `.editor-main` 自己滚, 让 sidebar 永远 fixed, 但需要 grid 行高固定, 改动稍大.
3. **其他 WIP fail** (E11-A, UI-E11-C, UI-E17) 跟本次 bug 无关, 仍由对应 worker 处理 (K3 refactor / TimeQuickRail feature).
