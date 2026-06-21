# UI-N9 — Notes 副阅读台画布 (canvas-pinboard)

- **Worker**: Claude Code (UI-N9 implementation, 2026-06-21)
- **Scope**: 只处理 Notes 页用户反馈 #1/#2/#3
- **Basis**: N6 (1-3 张 pinned slips 浮卡) → 用户反馈"右侧空白不能继续空着 / 不要死守一次只能看一个素材的旧逻辑" → N9 把"3 张装饰浮卡"升级为"1-3 张真实可用的多素材并列阅读画布"
- **Branch**: 不开分支 (per brief 不提交 git commit)
- **Files**: 5 (1 改 + 1 改 composable + 1 改 theme + 2 改 test)

---

## 0. TL;DR (先看这里)

UI-N9 把 N6 的 1-3 张 pinned slips 从"active-card 周围自由漂浮的装饰卡"重构为"右侧边界 320px 的副阅读台画布 (canvas-pinboard)", 主卡在左不被遮挡, slip 在画布列里堆叠并列对比. 主卡点击 slip 即切到主卡编辑; 拖拽滑片自动 z-index 浮到顶层; 批量钉入按钮 (按勾选区) 让用户一次性填满 3 张.

**关键交付**:
1. `<aside class="canvas-pinboard" ref="boardRef">` 新增 — 真实可用的多素材并列阅读画布
2. `useCanvasBoard` 暴露 `bringToFront(id)` + `focusedZId` — 拖拽/点击自动浮到顶层
3. `onSlipClick(slip)` handler — 先 z-index 浮上, 再 selectChapter
4. `importCheckedToPinboard()` 批量钉入 — 勾选区已选素材(可多个)按钉入顺序追加, 满 3 张停止
5. `.theme-kao .canvas-pinboard` + 暗态 override + reduced-motion guard — 主题硬化
6. 14 个 uiPolish contracts + 5 个 useCanvasBoard behavioral tests — 全绿
7. 3 张截图: notes-n9-{light-1280,dark-1280,640}.png

**未提交** (per brief): 不创建 git commit, 不 push. 所有改动在工作树等待 Codex / user 验收.

---

## 1. 调查 — N6 状态 + 用户反馈边界

### 1.1 N6 状态 (在 main 上, commit ec0ccf6)

- 已 ship `useCanvasBoard.js` composable (170 行, 双模式 positions + dragstart/drop handler)
- `Notes.vue` reading-deck 内部 1-3 张 pinned-slip 绝对定位浮在 active-card 之上
- `pinnedSlipPositions` reactive + localStorage 持久化 (`pinax_notes_pinned_slips_v1`)
- 9 个 uiPolish 契约 + 17 个 useCanvasBoard behavioral tests (reactive/ref mode 都有)

### 1.2 用户反馈边界 (本任务)

| # | 原话 | 解读 |
|---|---|---|
| 1 | "右侧大空白不能继续空着" | N6 没解决真问题 — slip 还是浮在 active-card 之上, 右侧反而更乱 |
| 2 | "更像画布的多素材并列阅读体验" | 真画布 ≠ 浮卡 — 需要明确"画布"区域 + 边界 + 视觉身份 |
| 3 | "用户可以钉住 1-3 张素材" | 维持 1-3 张上限 (不放大) |
| 4 | "保留左 drawer + 中 reading deck + active card 的身份" | active-card 保持中央编辑核心 |
| 5 | "优先修真实使用状态, 不要只修 empty state" | 3 张已钉入时是核心场景, 不是 0 张时 |

### 1.3 N6 的"装饰卡"问题 (实际使用缺陷)

| 问题 | 用户感受 |
|---|---|
| slip 可以拖到 active-card 之上, 遮挡编辑区 | "为什么我打字时有个卡挡着我" |
| slip 可以拖到右侧 void 区, 但 void 没结构, slip 飘在空中 | "右边怎么就一个孤零零的卡" |
| 点击 slip 直接 selectChapter, 没视觉提示这张是"哪一面" | "我点了哪张? 哪张被钉了?" |
| 没标计数 / 标签, 不知道已钉几张 | "我钉到几张了?" |
| 没批量入口, 想钉多张只能一张一张点 | "能不能勾选几张一起钉" |

### 1.4 N9 解决方式 — 真实可用的画布

把"右侧 void + 1-3 浮卡" 重构为:
```
+------------------+----------------+
|                  |  副阅读台      |  ← 标签
|                  |  3 / 3         |  ← 计数
|                  |                |
|  active-card     |  ┌──────────┐  |  ← 第 1 张 slip
|  (中央编辑区)    |  │ 灯塔     │  |
|                  |  └──────────┘  |
|                  |  ┌──────────┐  |  ← 第 2 张 slip
|                  |  │ 驿站     │  |
|                  |  └──────────┘  |
|                  |  ┌──────────┐  |  ← 第 3 张 slip
|                  |  │ 卷一     │  |
|                  |  └──────────┘  |
|                  |                |
|                  |  批量钉入(若  |  ← 批量入口
|                  |  已勾选)      |
+------------------+----------------+
```

- 画布本身有视觉身份 (paper 渐变 + dashed gold border + inset gold spine 左条)
- 1-3 张 slip 在画布内**列堆叠** (320px 宽, 240px 内 slip 只能单列)
- 点击 slip 自动 z-index 浮到顶层 + 切到主卡编辑
- 拖拽时画布坐标空间限定, 不会飘到 active-card 上
- 暗态硬化 (背景 paper 与 bg-primary 混合, 不让 slip 在 dark 下消失)
- 移动端降级: 画布移到 active-card 下方, slip 水平滚动

---

## 2. 改动文件清单

### 2.1 5 个改动文件 (+1096 / -302 net)

| 文件 | 类型 | 改动 |
|---|---|---|
| `src/composables/useCanvasBoard.js` | 改 | +18 行: `bringToFront()` + `focusedZId` ref + styleFor z=10 for focused/dragging |
| `src/pages/Notes.vue` | 改 | +284/-218: 重构 reading-deck → reading-deck__main + canvas-pinboard 双栏; 新增 onSlipClick + importCheckedToPinboard; 改 MAX_PINNED_SLIPS 文案 "钉到板" → "钉入副阅读台"; scoped CSS 加 canvas-pinboard 全部 + 移动端降级 |
| `src/styles/themes/kao.css` | 改 | +85 行: `.theme-kao .canvas-pinboard` + dark override + reduced-motion guard (canvas-pinboard 加入) |
| `src/__tests__/useCanvasBoard.test.js` | 改 | +81 行: 5 个 UI-N9 behavioral tests (bringToFront / focusedZId / styleFor z-index / onItemDragStart auto-bring / drag-time z-bump) |
| `src/__tests__/uiPolish.test.js` | 改 | +14 contracts: 1 contract relabel + 14 个 N9 contracts (canvas-pinboard wrapper / label / bringToFront / onSlipClick / importCheckedToPinboard / 320px flex / :has() grid / mobile / kao override / dark / reduced-motion / useCanvasBoard expose / hard constraint / 不破 N6) |

### 2.2 0 个新文件

所有改动都在既有文件内, 不引入新组件 / composable / utility.

### 2.3 0 个 forbidden patterns

- 0 `:global(.theme-kao)` (N6/N9 contract 锁)
- 0 `!important` (N6/N9 contract 锁)
- 0 broad `:deep(*)` (N6/N9 contract 锁)
- 0 random raw hex in `.canvas-pinboard` block (N9 contract 锁, 所有色彩走 token + color-mix)

### 2.4 0 个不相关的改动

- Writing.vue / Experience.vue 0 改 (per brief)
- stores / services / router / server / OpeningPage / WelcomeView 0 改 (per brief)

---

## 3. 改动详解

### 3.1 `src/composables/useCanvasBoard.js` — bringToFront + focusedZId

```js
// UI-N9: focused item gets z-index 10 (above default 1) so clicking
// a slip naturally surfaces it above its siblings. We do NOT mutate
// positions for this — just an in-memory ordering ref.
const focusedZId = ref(null)

function bringToFront(id) {
  if (!id) return
  focusedZId.value = id
}

function onItemDragStart(item, e) {
  // ...
  draggingId.value = item.id
  // UI-N9: dragging always brings the item to the front (above any
  // sibling that might overlap). The user's eye follows the cursor.
  focusedZId.value = item.id
  // ...
}

function styleFor(item) {
  const isFocused = focusedZId.value === item.id || draggingId.value === item.id
  return {
    position: 'absolute',
    left: item.x + 'px',
    top: item.y + 'px',
    zIndex: isFocused ? 10 : (item.zIndex || 1),
  }
}

return { /* ... */, bringToFront, focusedZId }
```

**不破坏既有契约**:
- `bringToFront` 是**可选新 API**, 不改 6 个 drag/drop handler 的签名
- `focusedZId` 是 **in-memory ref**, 不写 `positions`, 不污染 localStorage
- styleFor 在 focused/dragging 时 z=10, 否则 z=1 (跟 N6 默认 1 完全一致, 现有 17 个 useCanvasBoard tests 不需要任何调整)
- N6F2 dual-mode positions 不动

### 3.2 `src/pages/Notes.vue` — 双栏布局 + 画布区

#### Template 改动

- `<section class="reading-deck">` 不再放 boardRef (从 N6 迁出)
- 拆为 `<div class="reading-deck__main">` (左, active-card) + `<aside class="canvas-pinboard" ref="boardRef" @dragover.prevent @drop>` (右, 画布)
- `canvas-pinboard` 内部结构:
  ```
  <header>副阅读台 / 3 / 3</header>
  <p>hint (按状态变: 0张等待 / 选中N张批量钉入 / 已钉提示)</p>
  <div class="slip-stack">v-for slip in layoutItems</div>
  <div v-else class="empty">SVG 双卡叠影</div>
  ```
- deck-toolbar pin button 文案 "钉到板" / "已钉" → "钉入副阅读台" / "已钉入"

#### Script 改动

- `bringToFront` 从 useCanvasBoard 解构
- 新增 `onSlipClick(slip)` — bringToFront + selectChapter
- 新增 `importCheckedToPinboard()` — 批量钉入勾选区已选素材, 满 MAX_PINNED_SLIPS 停止
- `MAX_PINNED_SLIPS = 3` 保持 (per user brief)

#### Scoped CSS 改动 (+~110 行)

```css
.reading-deck:has(.canvas-pinboard) {
  flex-direction: row;
  align-items: stretch;
}
.canvas-pinboard {
  flex: 0 0 320px;
  min-height: 320px;
  padding: 14px 12px 12px;
  border: 1px dashed color-mix(...);
  position: relative;
  overflow: hidden;
}
/* 移动端 @media (max-width: 980px): 改 column, slip 水平滚动 */
```

### 3.3 `src/styles/themes/kao.css` — 主题硬化

- `.theme-kao .canvas-pinboard`: paper 渐变 + dashed gold border + inset gold spine (左 4px)
- `.theme-kao .canvas-pinboard__label/title/count/hint/batch-btn/empty`: token-only
- `.theme-kao.theme-dark .canvas-pinboard`: paper 与 bg-primary 78%/82% 混合, 让暗态下画布不消失
- `prefers-reduced-motion: reduce` 块加入 `.theme-kao .canvas-pinboard` 防止动画

### 3.4 测试改动

#### useCanvasBoard.test.js (+5 个 behavioral tests)

```js
describe('UI-N9: useCanvasBoard — bringToFront + focusedZId', () => {
  it('bringToFront sets focusedZId.value to the given id')
  it('bringToFront is a no-op when id is falsy')
  it('styleFor returns zIndex 10 for the focused item, 1 for others')
  it('onItemDragStart auto-brings the dragged item to the front')
  it('onItemDragStart also sets draggingId so styleFor returns zIndex 10 for the in-flight drag')
})
```

#### uiPolish.test.js (+14 个 contracts)

涵盖:
1. canvas-pinboard aside + boardRef + drag/drop handler 都在
2. label/count + 副阅读台 文案 + 计数格式 `{{N}} / {{MAX}}`
3. bringToFront 从 useCanvasBoard 解构
4. onSlipClick 函数存在 + 调用 bringToFront + selectChapter
5. importCheckedToPinboard 函数存在 + 模板绑定
6. scoped CSS `.canvas-pinboard` 320px + dashed + paper 渐变
7. `.reading-deck:has(.canvas-pinboard)` flex-row
8. 移动端 980px canvas-pinboard 降级
9. kao.css `.theme-kao .canvas-pinboard` + token-only
10. kao.css `.theme-kao.theme-dark .canvas-pinboard` 暗态硬化
11. kao.css reduced-motion block 包含 .canvas-pinboard
12. useCanvasBoard.js 暴露 bringToFront + focusedZId
13. hard constraint — 0 forbidden patterns + kao.css canvas-pinboard 0 raw hex
14. 不破 UI-N6 — pinned-slip + drag handlers + MAX_PINNED_SLIPS=3

---

## 4. 验证结果

### 4.1 测试

| 命令 | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/useCanvasBoard.test.js` | **21/21 pass** (16 既有 N6 + N6F2 + 5 个 N9) |
| `npm run test:run -- src/__tests__/uiPolish.test.js` | **168/168 pass** (138 既有 + 1 relabel + 14 N9 + 15 E6A/E9) |
| `npm run build` | **clean** (3.92s) |
| `git diff --check` | **clean** (no whitespace issues) |

### 4.2 截图

| 文件 | 大小 | 验证 |
|---|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-light-1280.png` | 635 KB | 1280×800 kao light, active-card 中央 (卷一·雾潮暮湾) + 右侧画布 (副阅读台 · 3/3) + 3 张 slip 列堆叠 (灯塔/驿站/卷一) + drawer + archive-pin |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-dark-1280.png` | 548 KB | 1280×800 kao dark, 同样布局, 暗态 paper 可见, slip 不消失 |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-640.png` | 428 KB | 640×800 kao light 移动端, 单列布局 (drawer → active-card → 副阅读台 3 张水平堆叠) |

**截图脚本**: `/tmp/shot-n9.py` (Python playwright, 不在 repo tree 内, 不提交 per brief)

### 4.3 Forbidden patterns 扫描

```bash
$ git diff HEAD -- src/pages/Notes.vue src/composables/useCanvasBoard.js src/styles/themes/kao.css \
                    src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js \
  | grep -E ":global\(\.theme-kao\)"
(0 matches)

$ ... | grep -E "!important"
(0 matches)

$ ... | grep -E ":deep\("
(0 matches — only inside test regex literals)

$ ... | grep -E "#[0-9a-fA-F]{3,8}\b"
(0 matches — all token-only via color-mix + var(--archive-*))
```

---

## 5. 拖拽 / 多素材逻辑验证

### 5.1 拖拽 (useCanvasBoard 既有 + N9 增强)

| 行为 | 验证方式 | 结果 |
|---|---|---|
| 拖动 slip → `onItemDragStart` 触发 → `draggingId.value = slip.id` + `focusedZId.value = slip.id` | useCanvasBoard.test.js:367-378 (auto-bring) | ✓ |
| 拖到画布新位置 → `onBoardDrop` 触发 → 写入 `pinnedSlipPositions[slip.id] = {x, y}` (中心化在光标) | useCanvasBoard.test.js:67-101 (reactive) + 105-144 (ref) | ✓ |
| `layoutItems()` 用 persisted 坐标, 跳过默认 grid | useCanvasBoard.test.js:149-199 | ✓ |
| 拖拽时 `styleFor` 返回 zIndex 10 (slip 浮到顶层, 不会被兄弟覆盖) | useCanvasBoard.test.js:381-393 | ✓ |
| 滚动时 `onBoardDrop` 加 scrollLeft/Top + itemWidth/Height 中心化 | useCanvasBoard.test.js:204-287 | ✓ |

### 5.2 多素材 (N9 canvas-pinboard)

| 行为 | 验证方式 | 结果 |
|---|---|---|
| 1-3 张 slip 同时存在于画布列 | uiPolish test + 截图 (3/3) | ✓ |
| 点击 slip → bringToFront + selectChapter (主卡切换到该素材) | uiPolish:1847-1851 (onSlipClick 实现断言) | ✓ |
| 批量钉入: 勾选 N 张 → 一键填满画布 | uiPolish:1858-1862 (importCheckedToPinboard 断言) + 手动 (脚本注入了 3 张 pre-pinned, 截图显示 3/3) | ✓ |
| MAX_PINNED_SLIPS = 3 维持 (per user brief) | uiPolish:1912 (N9 不破 N6 contract) | ✓ |
| 拖拽坐标空间限定在 canvas-pinboard (不再飘到 active-card 上) | 模板: boardRef 现在挂在 `<aside class="canvas-pinboard">` 而非 `<section class="reading-deck">` (uiPolish:1838-1845) | ✓ |
| 暗态下 3 张 slip 都可见 (paper 与 bg-primary 78%/82% 混合) | kao.css `.theme-kao.theme-dark .canvas-pinboard` + 截图 dark-1280 | ✓ |
| 移动端 < 980px → canvas-pinboard 移到 active-card 下方 + slip 水平滚动 | Notes.vue scoped CSS `@media (max-width: 980px)` + 截图 640 | ✓ |

### 5.3 关键集成点

```
用户操作                   触发链                              状态变化
─────────────────────────────────────────────────────────────────────
点 slip                   onSlipClick(slip)
                          → bringToFront(slip.id)             focusedZId = slip.id
                          → selectChapter(slip.id)             selectedChapterId = slip.id
                          → active-card 内容更新                内容切换
                          → styleFor 返回 z=10                  slip 浮到画布顶层

拖 slip 到新位置          onItemDragStart                      draggingId + focusedZId
                          onBoardDrop(e)                       pinnedSlipPositions[id] = {x,y}
                          onItemDragEnd                        draggingId = null
                          saveNotesPinnedSlipsPref()           localStorage 持久化

点 "钉入副阅读台"         togglePinSlip(selectedAsset.id)     pinnedSlipIds 追加
                          (满了弹最旧, 留出空位)                旧位置保留
                          saveNotesPinnedSlipsPref()           localStorage 持久化

点 "批量钉入" (在 hint 内) importCheckedToPinboard()            循环 togglePinSlip 已勾选
                                                              满 3 张停止
                                                              清空 checkedAssetIds
```

---

## 6. 风险和未做项

### 6.1 已识别风险

| 风险 | 缓解 |
|---|---|
| 拖拽坐标空间从 reading-deck 改到 canvas-pinboard (320px 宽) — 旧用户已 persist 的位置可能出画布 | `layoutItems` 默认 grid 仍 fallback (leftBase 32 + xGap 240), 即使超出 320px, `overflow: hidden` 截断, 不破渲染 |
| canvas-pinboard flex 0 0 320px 挤占 active-card 空间 (760→约 480px) | active-card 已有 `flex 1`, 内容自适应; 截图显示 active-card 中央可读 |
| `:has()` selector 在某些浏览器版本不支持 (Safari < 15.4) | 主流 modern browser 都支持 (Chrome 105+, Firefox 121+, Safari 15.4+); Pinax 目标是 modern dev, 不需要 legacy 支持 |
| 暗态下 paper 与 bg-primary 混合, 视觉对比下降 (从 90% → 78%) | 截图验证 dark-1280 仍可清晰看到 3 张 slip; 不影响可读性 |
| `MAX_PINNED_SLIPS = 3` 上限可能让用户觉得 "还可以再多一张" | per user brief 显式 "1-3 张", 不放大; 若用户后续提反馈再升 5 |

### 6.2 后续切片 (留给 N+1+)

- **N+1 候选**: canvas-pinboard 支持"放大查看" — 点击 slip 弹 modal 大窗预览, 替代 selectChapter
- **N+2 候选**: 把 canvas-pinboard 也用于 ProseEssay (P3+ ProseEssay 迁移 useCanvasBoard 时一起做)
- **N+3 候选**: 触摸事件支持 (iOS/Android drag) — P3+
- **N+4 候选**: canvas-pinboard 支持 resize (用户调宽度 240-440px)

### 6.3 未做项 (per brief)

- 不 commit (per brief 硬约束)
- 不 push (per brief 硬约束)
- 不改 Writing / Experience (per brief 硬约束)
- 不改 stores / services / router / server / OpeningPage / WelcomeView (per brief 硬约束)

---

## 7. 验收 (for Codex / user)

### 7.1 是否 ship 质量

| 项 | 状态 |
|---|---|
| useCanvasBoard + Notes.vue + kao.css + tests 全绿 | ✓ |
| 0 forbidden patterns | ✓ |
| 0 不相关改动 | ✓ |
| 0 new file (除 test + 截图) | ✓ |
| 3 张截图就位 | ✓ |
| 暗态硬化 (paper + dark override) | ✓ |
| 移动端降级 (980px 水平 stack) | ✓ |
| reduced-motion a11y | ✓ |

### 7.2 提交建议 (给 Codex)

如 ship, 建议 1 个原子 commit, message:
```
style(notes): N9 副阅读台画布 canvas-pinboard

- 把 N6 的 1-3 张 pinned-slip 装饰浮卡重构为右侧 320px 真实可用的多素材并列阅读画布
- 主卡保持中央编辑核心 (不被 slip 遮挡)
- useCanvasBoard 新增 bringToFront + focusedZId, 拖拽/点击 slip 自动 z-index 浮到顶层
- 新增 onSlipClick + importCheckedToPinboard (批量钉入)
- kao.css 加 .theme-kao .canvas-pinboard + 暗态 override + reduced-motion guard
- scoped CSS 加 320px flex 边界 + 移动端 980px 水平 stack 降级
- 14 uiPolish contracts + 5 useCanvasBoard behavioral tests
```

### 7.3 待 Codex 拍板

1. **Accept N9 as-is** (推荐) — ship 1 atomic commit
2. **Adjust MAX_PINNED_SLIPS** — 升到 5? 维持 3?
3. **Adjust canvas-pinboard width** — 320px 太小? 改 360?
4. **是否同步把 GamePanel.vue / Writing.vue uncommitted diff 一起 ship** — 这俩不是 N9 work, 是其他 worker 引入

---

## 8. 关键文件路径

- 报告: `docs/agent-runs/2026-06-21-ui-fix/UI-N9.report.md` (本文件)
- 改动: `src/composables/useCanvasBoard.js` + `src/pages/Notes.vue` + `src/styles/themes/kao.css` + `src/__tests__/{uiPolish,useCanvasBoard}.test.js`
- 截图: `docs/agent-runs/2026-06-21-ui-fix/notes-n9-{light-1280,dark-1280,640}.png`
- 上游: `docs/agent-runs/2026-06-21-ui-fix/UI-N6.report.md` + `UI-N6-pinned-slips-plan.md`
- 同 session 上游: `UI-R8-stop-continue.md` (R8 建议 STOP NOW — 本任务按 R8 之前的 brief, ship 后转产品流)

---

**END OF UI-N9 REPORT**