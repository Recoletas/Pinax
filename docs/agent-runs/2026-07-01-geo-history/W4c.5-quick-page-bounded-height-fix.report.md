# W4c.5: 真正的根因 — `.quick-page` / `.world-map-page` 用 min-height 不让 body 成为 bounded scroll container

> 2026-07-01 CST · Codex on `main` · W4c 修复未生效的 follow-up
>
> **症状**: W4c 加完 `overflow: auto` 到 `.quick-page__body` 和 `position: sticky` 到 `.my-worldbooks` 后，picker 仍滚出视口，部分内容仍不能滚。
>
> **不再**试新的 fix —— 回到 systematic-debugging Phase 1 重新做 root cause analysis。

---

## 1. 用户反馈 (触发再调查)

> "而且左边的设定选世界书部分没有做页面向下滑后的对应处理，部分还是不能下滑"

派 Explore 探子深挖 QuickImport + 周边组件。**收敛到一个上游 sizing bug**:

## 2. 真正的根因

`.quick-page` 用 `min-height: 100vh`（intrinsic sizing）而不是 `height: 100vh`（bounded sizing）：

```css
.quick-page {
  min-height: var(--app-viewport-height, 100vh);  /* 不让 body 真正 bounded */
  display: flex;
  flex-direction: column;
  /* ... */
}
```

连锁反应：
1. `.quick-page` 内容（如 hero + nav + 5-card grid）超过 100vh 时，它**跟着增长**
2. 子元素 `.quick-page__body { flex: 1; overflow: auto }` 跟着 `.quick-page` 一起增长 — 实际 body 高度 = content 高度
3. **body 的内容 fit 进了它自己的 box** → `overflow: auto` 从不触发滚动条
4. **`.my-worldbooks { position: sticky; top: 0 }` 的滚动祖先** — sticky 找最近的 `overflow` 不是 `visible` 的祖先：
   - `.my-worldbooks` → `.quick-page__body` → `.quick-page` → `.shell-content` → `.app-shell` (`overflow: hidden`)
   - body 和 page 都是非 visible 的 overflow 默认值（visible），不参与 sticky 解析
   - sticky 直接 bind 到 `.app-shell`，即整个视口
   - 但 `.app-shell` 是 `overflow: hidden` 的固高容器，**它本身不滚动**
   - 结果：picker 跟 page 一起被裁剪（AppShell 视口以外的都剪）— 实际表现就是"picker 滚出去了"

W4c 教训：`overflow: auto` 和 `position: sticky` 都依赖 **bounded scroll container**。`flex: 1` 在 unbounded parent 里等于"内容多高就多高"。

## 3. 修复

**`src/pages/WorldBookQuickImport.vue`**: 把 `.quick-page` 改为 bounded：

```diff
 .quick-page {
-  min-height: var(--app-viewport-height, 100vh);
+  height: var(--app-viewport-height, 100vh);
   padding: 18px;
   display: flex;
   flex-direction: column;
   gap: 18px;
+  overflow: hidden;
   background: ...;
 }
```

**`src/pages/WorldMapPage.vue`**: 同样改：

```diff
 .world-map-page {
-  min-height: var(--app-viewport-height, 100vh);
+  height: var(--app-viewport-height, 100vh);
   display: flex;
   flex-direction: column;
+  overflow: hidden;
   background: ...;
 }
```

**为什么不是改 min-height 为 0 + 用 flex 父**: 跟 StructuredSettings 行为不一致（后者 `min-height: 100vh` + `title-bar { height: 48px }` 显式 fixed 总高）。WorldBookEditor / StructuredSettings / WorldBookQuickImport / WorldMapPage 现在都用同 1 个模式：`page: height: 100vh; overflow: hidden` + `body: flex:1; min-height:0; overflow: auto`。

## 4. TDD 强化

加 2 个 contract 锁 `height` 防再回退到 `min-height`（W4c 没锁是因为没诊断到这个层级）：

```js
// src/__tests__/uiPolish.test.js
- "WorldBookQuickImport .quick-page__body becomes the bounded scroll container"
+ "WorldBookQuickImport .quick-page is itself bounded (height, not min-height) so the body becomes a real scroll container"
+ "WorldMapPage .world-map-page is bounded (height, not min-height) so its body becomes a real scroll container"
```

每个新 contract 都验证：
- `height: var(--app-viewport-height, ...)` 存在
- `overflow: hidden` 存在
- `min-height: var(--app-viewport-height, ...)` **不在**（防止回退）

## 5. 验证

```
✓ ui polish — WorldBookEditor scroll contract (W4b)                          3/3
✓ ui polish — quick / map pages share the W4b AppShell-bounded scroll contract 5/5
总: 8/8 scroll contracts 全绿

✓ W4 5 核心文件 64/64

npm run build: ✓ built in 4.02s
git diff --check: clean
```

## 6. 改动文件

| 文件 | Δ 行数 | 说明 |
|---|---|---|
| `src/pages/WorldBookQuickImport.vue` | `min-height` → `height`, 加 `overflow: hidden`, +14 行注释 |
| `src/pages/WorldMapPage.vue` | `min-height` → `height`, 加 `overflow: hidden`, +3 行注释 |
| `src/__tests__/uiPolish.test.js` | +28 行（2 个新 contract 锁 height + 防回退 min-height） |

0 个 MyWorldbooksNav 或 gameStore 改动（先前 W4c 已正确）。

## 7. W4c 学到的教训（program-level 笔记）

当看到 "overflow: auto 设了但没生效 + sticky 设了但也没生效" 同时出现，**几乎肯定是滚动祖先断了**。W4c 修了个症状层、没修 bounding 层，导致 fix 看起来"通过测试但浏览器不工作"。

下一步 refactor 机会（out of scope 本轮）：可以加 1 个 lint/约定让 `overflow: auto` 必须配对 `height`/`max-height` + `min-height: 0`。或者写 1 个 helper class `.page-bounded-scroll-container` 统一 4 个 page 的模式。
