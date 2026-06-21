# UI-QA9 — Review of W9 / N9 / E9 (writing demote + notes canvas-pinboard + experience spread)

> **Reviewer**: Claude (UI-QA9 read-only, 2026-06-21)
> **Subject**: Working-tree changes in `main` worktree (uncommitted, 7 files M + reports + screenshots in `docs/agent-runs/2026-06-21-ui-fix/`)
> **Mandate**: 只读 review; 不改代码, 不 commit

---

## Verdict

# **ACCEPT WITH FIXES**

W9 + N9 are solid structural improvements. E9 is the right direction (对开页结构 vs chat 流) but **introduced 1 functional regression + 0 screenshots落盘**. The 3 issues below must be fixed before E9 ship. W9 + N9 can ship independently of E9 fix.

| 子页面 | 单独 verdict |
|---|---|
| **W9 Writing 顶部降级** | ✅ ACCEPT — 188→80px, 删除 5 行冗余, 立体感 5 处签名, 2 截图就位 |
| **N9 Notes 副阅读台画布** | ✅ ACCEPT — N6 浮卡 → 真画布 320px, 多素材并列阅读, 3 截图就位 |
| **E9 Experience 对开页结构** | ⚠️ **ACCEPT WITH FIXES** — 对开页概念正确, 但**破坏 gamePanelMechanism.test.js** + 0 截图 |

---

## 1. 改动范围 (git status)

```
M src/__tests__/uiPolish.test.js        (+455 / -)
M src/__tests__/useCanvasBoard.test.js (+81  / -)
M src/components/GamePanel.vue          (E9 ledger spread template)
M src/composables/useCanvasBoard.js     (N9 bringToFront + focusedZId)
M src/pages/Notes.vue                   (N9 canvas-pinboard 双栏 + handler)
M src/pages/Writing.vue                 (W9 cork 188→80 单行)
M src/styles/themes/kao.css             (W9/N9 各 ~150 行 +)
```

7 修改源文件, 0 新增 component / composable. Per brief N9 brief — N9 claim "0 new file" 成立 (test + 截图不算).

---

## 2. 用户反馈 ↔ 实际改动

### 2.1 Writing 顶部冗余 + 立体感

| 用户原话 | W9 处理 | 验收 |
|---|---|---|
| "顶部 PROJECT · PINAX / 三体同人 / 1本书 / 1章节 / 无标题章节 · 0 字 冗余" | 删 `<span class="wall__project-mark">PROJECT · PINAX</span>` + `<h1 class="wall__project-title">` + 整个 `<div class="wall__project-meta">` (N本书/N章节/无标题章节·0字) | ✅ |
| "顶部冗余现在负作用大, 不能继续占第一视觉层级" | `.wall__cork` 188px → 64-80px (max-height: 80px), flex 单行 -62% 高度 | ✅ |
| "保留必要功能" | 7 功能全保留 (book select / save chip / 收件箱 / 素材库 / 分镜 / 返回 / theme) | ✅ |
| "让主要按钮有更明确的厚度/投影/按下状态, 但不要做成彩色 SaaS 按钮" | book-pill / save-chip / tab / cork / back 5 处统一签名 (1px top paper + 1px bottom ink + outer drop + hover lift -1px + active press +1px); 主色仍 archive-* token, 不上 #3b82f6 | ✅ |
| "阴影位置不对" (来自 UI-R5 上一轮) | cork shadow 从 `8px 底厚 + 18px ambient` 收到 `4px 底厚 + 12px ambient` (-50% / -33%); 各元素分层 inset+outset 而非外加层叠 | ✅ |

**Visual check**: 我已 review `writing-w9-1280.png` (151 KB) + `writing-w9-empty-1280.png` (132 KB). 顶栏 64-80px 单行, book-pill + save-chip + 5 tabs, dossier body 从 y≈80 开始首屏可见 — 用户原话"顶部冗余现在负作用大"已被结构性解决.

### 2.2 Notes 右侧空白 + 真画布逻辑

| 用户原话 | N9 处理 | 验收 |
|---|---|---|
| "右侧大空白不能继续空着" | N6 的 1-3 浮卡升级为右侧 320px 固定 `<aside class="canvas-pinboard">`, 有视觉身份 (paper 渐变 + dashed gold border + inset gold spine 左条) | ✅ |
| "更像画布的多素材并列阅读体验" | 画布内 1-3 张 slip 列堆叠 (240px 单列), 拖拽坐标空间限定在 canvas-pinboard (不再飘到 active-card 之上) | ✅ |
| "把画布拖拽等逻辑拿过来" | `useCanvasBoard` 已 ship N6 + N6F2 (reactive/ref 双模式, 17+11 个测试). N9 加 `bringToFront` + `focusedZId` 让点击/拖拽自动 z-index 浮到顶层 | ✅ |
| "不要死守一次只能看一个" | active-card 主卡仍 1 张 (用户原意保留中央编辑核心), 但**周围 1-3 张 slip 真并列可见** + 点 slip 自动切主卡 + 批量钉入 3 张 | ✅ |

**Visual check**: 我已 review `notes-n9-light-1280.png` (678 KB) + `notes-n9-dark-1280.png` (515 KB) + `notes-n9-640.png` (412 KB). 3 张 slip 在右侧画布列堆叠, 主卡不被遮挡, 暗态下画布不消失 — 用户原话"右侧大空白"已被真画布填满.

### 2.3 Experience 字体 + 值得肯定的设计

| 用户原话 | E9 处理 | 验收 |
|---|---|---|
| "字体不好, 看不到值得肯定的设计" | E6A 已修字体 (body 16px / 1.75 / sans meta / 角色 kicker 14px block); E9 加**对开页结构**作为值得肯定的设计 | ✅ (字体部分由 E6A 解决, 不是本轮 scope) |
| "全部 UI 细节还需要打磨" | E9 ledger spread = 顶部 page header (日期/卷次/角色印章) + 3-column grid (左 sheet / 1px spine / 右 sheet) + 28px 红色 margin rule + 底部 ink stamp "录" 圆形压印 + 长旁白自动"续 · 接上页" | ✅ (结构性, 非微调) |

**Visual check**: ❌ **无截图可查**. E9 report §3 自承认"未生成 — 本沙箱无 Playwright / Chromium". **brief 强制约束 §3 要求 3 张截图, 0 落盘** — 违反 brief.

---

## 3. 是否只是微调? (用户硬要求)

**W9**: 顶部 188px → 64-80px, 删除 5 行冗余元素, 新增 4 处视觉对象 (book-pill / save-chip / 5 shadow signatures). **非微调** — 结构性 cork 降级.

**N9**: N6 浮卡 → 真画布 320px 双栏, useCanvasBoard 新增 bringToFront/focusedZId + Notes 双栏 layout + 批量钉入 handler + kao.css 新增 dashed border + paper 渐变 + 暗态硬化. **非微调** — 真画布多素材并列阅读.

**E9**: 单列 chat 流 → 对开页 record-book spread (3-column grid + spine + ink stamp + continued mark + red rule + 5 new computed). **非微调** — 真正 record-book 结构, 不是 chat bubble 套 record-book 滤镜.

3 个都通过"非微调"标准.

---

## 4. Blocker / High / Medium / Low 问题

### 🔴 Blocker

**B1. [E9] gamePanelMechanism.test.js 失败 — E9 破坏了 mechanism trigger 渲染**

- **现象**: `npm run test:run` 全套跑, 1 fail: `src/__tests__/gamePanelMechanism.test.js > GamePanel mechanism triggers > reopens the mechanism panel when a rendered trigger is clicked`
  - 测试期望: `gameStore.activeMechanism === 'dialogue'` after click `.mechanism-trigger`
  - 实际得到: `null`
- **根因**: E9 把 GamePanel.vue template 从 chat 流重写为 `<article class="ledger-spread">` 对开页结构. 新结构**仍然调用** `renderMessageContent()` → `renderRPText({ mechanismTrigger })` 把 `.mechanism-trigger` 元素塞到 `v-html` 输出, 也**仍然调用** `onTextWrapperClick()` 检查 `event.target.closest('.mechanism-trigger')` 并触发 `gameStore.activateMechanism()`. 但测试 `wrapper.find('.mechanism-trigger').exists()` 返回 false, 说明 `renderRPText` 在新 spread 上下文里**没有生成 mechanism-trigger DOM** (可能因为 `.text-wrapper` 不再是 message 顶层 wrapper, 或 `v-html` 嵌套路径变了).
- **影响**: 用户使用 gameStore.mechanismTrigger 字段的内嵌机制触发 (dialogue / npc / event / item 类型) 在新对开页结构下**完全不工作**. 这是**功能性回归**, 不是视觉微调.
- **修复**: E9 worker 必须 (1) 检查 `rpTextRenderer` 路径, (2) 确保 mechanism-trigger DOM 在新 spread 上下文里被渲染, (3) 让测试通过, (4) 不要只更新测试断言 — 这是用户能用的真实功能, 不能 mock 过去.

### 🟡 High

**H1. [E9] brief 要求 3 张截图, 0 落盘**

- brief §3 明确要求 `experience-e9-1280.png` + `experience-e9-long-1280.png` + `experience-e9-640.png`. 实际**全部缺失**.
- E9 report §3 自承认"沙箱无 Chromium" + "强行写 take-screenshots.mjs 会变成 ship 噪声文件". 这理由不充分 — 沙箱内不存在 chromium 不代表 ship 时也不存在. W9/N9 都用 playwright 跑了截图, E9 不应该例外.
- **修复**: E9 worker 在有 Chromium 的环境 (本地 / staging) 跑 Playwright, seed 6-12 段对话 (推荐 `边境王国 · 雾潮暮湾`), 取 1280 / long-1280 / 640 三张, 放进 `docs/agent-runs/2026-06-21-ui-fix/`. 临时脚本删除 (per AGENTS.md 硬约束).

### 🟢 Medium

**M1. [W9] 5 处立体感签名有效但保存状态视觉降级丢失了"盖印中"语义**

- W9 §8 自承认未做项 #2: "save-chip 在 saving 状态仅 dashed 边, 未做加 '盖印中...' 三字 + spinner"
- W9 §8 未做项 #1: "book-pill 内 SVG arrow 在 dark mode 颜色未做单独调亮"
- 影响: 视觉降级合理 (76x76 圆章 → 12px pill), 但 saving 状态的明确文字 / spinner 缺失, 用户看 saving 时只看到 dashed 边, 不直观.
- 修复: 后续 polish (W10+) 加 saving spinner + "盖印中"文字.

**M2. [N9] 320px canvas-pinboard 挤占 active-card 空间**

- N9 §6.1 自承认: "canvas-pinboard flex 0 0 320px 挤占 active-card 空间 (760→约 480px)"
- 截图验证 active-card 仍可读, 但 760 → 480 是 -37% 空间, 长编辑可能挤.
- 修复: 后续 polish (N10+) 评估 280px / 320px / 360px 哪个平衡最好. 当前 320 是 1-3 张 240px slip 列堆叠的最小可行值, 不能小于 280.

**M3. [E9] 长旁白 280 字符阈值是启发式**

- E9 §5.1 自承认: "长旁白 280 字符阈值是启发式, 可能不是阅读舒适边界"
- 影响: 用户写超过 280 字符的旁白会被标记 "续 · 接上页", 但不会自动翻页 (E12 候选).
- 修复: E12 加 @keyframes pageTurn 自动翻页效果.

**M4. [E9] E9 ledger-spread 内 .msg-item reset 掉了 E6A 的 3px role-color left bar**

- E9 §5.1: "ledger-spread internal `.msg-item` reset 掉了 E6A 的 3px role-color left bar, role 仍通过 kicker ink + sheet 颜色区分"
- 影响: 视觉 role 区分从"3px 左条"降到"kicker ink + sheet 颜色". 截图无法验证 (E9 无截图). 用户体验可能下降.
- 修复: 验证截图后决定是否在 spread 内保留 E6A 的 role-color bar (在 sheet 容器内, 不在 message 顶层).

### ⚪ Low

**L1. [W9] browser 原生 tooltip 替代了 pin-dot 文字标签**

- W9 §8 #3: "browser 原生 tooltip 延迟 1s+ 才出现, 不如原 12px 圆 + 10px 标签 stack 的视觉直接"
- 影响: 用户 hover 章节状态图钉时看不到即时文字标签. 不是核心功能, 后续 polish 加 popover.

**L2. [N9] dark mode 下 paper 与 bg-primary 混合, 视觉对比下降**

- N9 §6.1: "暗态下 paper 与 bg-primary 混合, 视觉对比下降 (从 90% → 78%)"
- 截图 dark-1280 仍可清晰看到 3 张 slip; 不影响可读性. 后续可调深 / 调浅.

**L3. [E9] @media (max-width: 720px) 单列 spread 模式未做 swipe**

- E9 §5.1: "Mobile 单列 spread 模式优化 (目前简单堆叠, 可加 swipe)"
- 后续 E13 polish.

---

## 5. Forbidden patterns 扫描 (req #3)

```
$ grep ":global(.theme-kao)\|broad :deep(\|!important" src/pages/Writing.vue src/pages/Notes.vue src/components/GamePanel.vue src/styles/themes/kao.css src/composables/useCanvasBoard.js
src/pages/Writing.vue:3972:  color: var(--accent) !important;       (pre-existing scoped CSS, NOT W9)
src/pages/Writing.vue:3973:  font-size: 10px !important;            (pre-existing scoped CSS, NOT W9)
src/pages/Writing.vue:4877:  color: transparent !important;          (pre-existing scoped CSS, NOT W9)
src/pages/Writing.vue:4878:  background: transparent !important;     (pre-existing scoped CSS, NOT W9)
src/styles/themes/kao.css:237: text-transform: none !important;     (pre-existing W3 drop-cap, NOT W9/N9/E9)
```

| Pattern | W9 | N9 | E9 | 状态 |
|---|---|---|---|---|
| `:global(.theme-kao)` | 0 new | 0 new | 0 new | ✅ 三方都无新增 |
| broad `:deep(*)` | 0 new | 0 new | 0 new | ✅ 三方都无新增 |
| `!important` | 0 new | 0 new | 0 new | ✅ 4 个 Writing.vue + 1 个 kao.css 都是 pre-existing (N5C / 5C ship), 不在本轮 scope |
| random raw hex | 0 new | 0 new | 0 new | ✅ N9 报告自承认 0 raw hex (color-mix + var(--archive-*)) |
| env-specific screenshot scripts | 0 | 0 | 0 | ✅ N9 报告 `/tmp/shot-n9.py` 不在 repo tree 内 (find 命令验证) |

**W9 / N9 / E9 报告均自承认 0 forbidden pattern 新增 — 与我独立验证一致**.

---

## 6. Stores / Services / Router / OpeningPage / WelcomeView diff 检查

```
$ git diff main --stat -- src/stores src/services src/router src/pages/OpeningPage.vue src/views/WelcomeView.vue src/server
(empty)
```

**0 改动**. 硬约束 100% 保持.

---

## 7. 截图状态 (req #4)

| 期望截图 | 实际 | 状态 |
|---|---|---|
| `writing-w9-1280.png` (W9) | ✅ 151 KB 存在 | ✅ |
| `writing-w9-empty-1280.png` (W9) | ✅ 132 KB 存在 | ✅ |
| `notes-n9-light-1280.png` (N9) | ✅ 678 KB 存在 | ✅ |
| `notes-n9-dark-1280.png` (N9) | ✅ 515 KB 存在 | ✅ |
| `notes-n9-640.png` (N9) | ✅ 412 KB 存在 | ✅ |
| `experience-e9-1280.png` (E9) | ❌ 不存在 | ❌ |
| `experience-e9-long-1280.png` (E9) | ❌ 不存在 | ❌ |
| `experience-e9-640.png` (E9) | ❌ 不存在 | ❌ |

**E9 0/3 截图落盘**. 见 Blocker H1.

---

## 8. 测试 + build 可信性 (req #5)

```
$ npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js
 ✓ src/__tests__/useCanvasBoard.test.js  (21 tests) 13ms
 ✓ src/__tests__/uiPolish.test.js  (168 tests) 155ms
 Test Files  2 passed (2)
      Tests  189 passed (189)

$ npm run test:run
 Test Files  1 failed | 112 passed (113)
      Tests  1 failed | 937 passed (938)
   Duration  22.91s

$ npm run build
✓ built in 4.19s

$ git diff --check
(clean — no whitespace issues)
```

| 检查 | 结果 | 备注 |
|---|---|---|
| uiPolish.test.js | **168/168 pass** ✅ | N9 报告 +14 + E9 报告 +8 (UI-E9 describe block) + W9 报告 +8 (UI-W9 describe block) + 1 E6A contract 更新. N9 + E9 + W9 三方新加都过. |
| useCanvasBoard.test.js | **21/21 pass** ✅ | N6 16 + N9 5 (bringToFront + focusedZId + auto-bring on drag). |
| 全套 | 937/938 (1 fail) | **1 fail = gamePanelMechanism.test.js** (见 Blocker B1). 这是 E9 functional regression, 必须修. 其余 1 fail (heightmap) 在单独跑时通过 — 是 flaky test, pre-existing (per STATUS.md L66). |
| build | **clean** ✅ | W9 报告提到 GamePanel.vue:195 Invalid endtag 已被 E9 重写时 fix. 当前 build 4.19s clean. |
| diff --check | clean ✅ | 无 whitespace 问题. |
| `npm run test:run -- src/__tests__/useCanvasBoard.test.js` | 21/21 ✅ | 独立跑确认. |

**测试可信度**: uiPolish 189/189 全绿 + useCanvasBoard 21/21 全绿. **只有 1 fail** = gamePanelMechanism.test.js (E9 functional regression). 这是真正的 Blocker, 不是 false positive.

---

## 9. 三方单独 verdict

### 9.1 W9 — Writing 顶部降级 ✅ ACCEPT

**Strengths**:
- 结构性降级 (188→80px), 删除 5 行冗余 (PROJECT·PINAX / h1 / meta / pin-num / ribbon / 76x76 stamp)
- 5 处立体感签名统一 (book-pill / save-chip / tab / cork / back)
- 2 截图就位 (filled 1280 + empty 1280)
- 8 uiPolish 契约全绿, 4 反向契约保证旧 wall__pin/stamp/ribbon 不再回归
- 0 forbidden patterns 新增

**Weaknesses** (Medium / Low, 不阻断 ship):
- M1: saving 状态仅 dashed 边, 缺 spinner + "盖印中"文字
- L1: pin-dot 改用 browser tooltip, 失去原 label stack 的视觉直接性

**Verdict**: ✅ ACCEPT. W9 独立 ship OK.

### 9.2 N9 — Notes 副阅读台画布 ✅ ACCEPT

**Strengths**:
- N6 浮卡 → 真画布 320px 双栏 (canvas-pinboard 独立 aside + dashed border + paper 渐变 + spine)
- useCanvasBoard bringToFront + focusedZId (拖拽/点击自动 z-index 浮到顶层)
- onSlipClick + importCheckedToPinboard (批量钉入 N 张)
- 3 截图就位 (light-1280 + dark-1280 + 640 mobile)
- 21/21 useCanvasBoard behavioral tests 全绿 (16 N6 + 5 N9)
- 168/168 uiPolish pass (含 +14 N9 contract)
- 0 forbidden patterns 新增

**Weaknesses** (Medium / Low, 不阻断 ship):
- M2: 320px canvas-pinboard 挤占 active-card 空间 (760 → 480)
- L2: 暗态 paper 与 bg-primary 混合, 视觉对比下降

**Verdict**: ✅ ACCEPT. N9 独立 ship OK.

### 9.3 E9 — Experience 对开页结构 ⚠️ ACCEPT WITH FIXES

**Strengths**:
- 单列 chat 流 → 对开页 record-book spread (3-column grid + spine + red rule + ink stamp)
- 顶部 page header (日期 / 卷次 / 角色印章) + 续 · 接上页 标 + · 留白待续 · 空白页
- 11 新 CSS rules + 2 media queries (reduced-motion + 720px collapse)
- E6A 5 个 record-book 机制 100% 保留 (spine stitch / folio / chapter rule / kicker / message backdrop)
- 0 store mutation / 0 service change / 0 router change
- 0 forbidden patterns 新增

**Weaknesses**:
- **🔴 Blocker B1**: gamePanelMechanism.test.js fail — `.mechanism-trigger` DOM 在新 spread 上下文没生成 (或 onTextWrapperClick 没 propagate). 这是**功能性回归**, 不是视觉问题.
- **🟡 High H1**: brief 要求 3 张截图 (`experience-e9-{1280,long-1280,640}.png`), 0 落盘. 理由"沙箱无 Chromium"不充分 (W9/N9 都用 playwright 跑了).

**Verdict**: ⚠️ **ACCEPT WITH FIXES**. E9 单独 ship 不 OK. 修 B1 + H1 后才 ship OK.

---

## 10. 修复建议 (Codex 决策)

### 最小 ship 路径

1. **W9 直接 ship** (1 commit). 已 AC.
2. **N9 直接 ship** (1 commit). 已 AC. 但建议 N9 先 ship, 然后 W9 在 W2/W3/W4 polish 后续 1 个 commit 跟 N9 一起或分开都行.
3. **E9 不 ship 直到修 B1 + H1**:
   - **B1 fix**: E9 worker 跑 `npm run test:run -- src/__tests__/gamePanelMechanism.test.js` 重现, 然后:
     - 检查 `rpTextRenderer` 在 spread 上下文的输出 (是否仍生成 `.mechanism-trigger` 按钮)
     - 如果没生成, 在 spread 内 `.text-main` 上保留 RP text renderer 路径 (L164 v-html="renderMessageContent(...)")
     - 如果生成了但 click handler 不 fire, 检查 `onTextWrapperClick` 的 `event.target.closest('.mechanism-trigger')` 路径是否仍能从 v-html output 冒泡到 wrapper click handler
     - 不要只更新测试断言 (这是真实功能, 不能 mock 过去)
   - **H1 fix**: E9 worker 在有 Chromium 的环境跑 Playwright, 截 1280 / long-1280 / 640 三张, 落盘 `docs/agent-runs/2026-06-21-ui-fix/`. 如果用户 / Codex 拒绝接受 E9 不 ship 截图, 这是 hard requirement.

### 中期 follow-up (非 ship blocker)

- M1 (W9): saving spinner + "盖印中" 文字
- M2 (N9): 评估 canvas-pinboard 280/320/360px
- M3 (E9): 长旁白自动翻页 (E12)
- M4 (E9): 验证截图后决定是否保留 role-color bar

---

## 11. 总结

| 维度 | W9 | N9 | E9 |
|---|---|---|---|
| 用户反馈解决 | ✅ | ✅ | ✅ (但破坏功能性) |
| 结构性 (非微调) | ✅ | ✅ | ✅ |
| 0 forbidden patterns | ✅ | ✅ | ✅ |
| 截图落盘 | ✅ 2/2 | ✅ 3/3 | ❌ 0/3 |
| uiPolish | ✅ 168/168 | ✅ 168/168 | ✅ 168/168 |
| 全套测试 | 937/938 | 937/938 | **937/938 with 1 functional regression** |
| build | ✅ | ✅ | ✅ |
| diff --check | ✅ | ✅ | ✅ |
| Single verdict | ✅ ACCEPT | ✅ ACCEPT | ⚠️ ACCEPT WITH FIXES |

**总 verdict**: **ACCEPT WITH FIXES**.
- W9 + N9 可立即 ship.
- E9 必须修 **1 functional regression** (mechanism trigger) + **3 截图** 才能 ship.
- 总共 3 commits (W9 / N9 / E9-fixed), 不应合并.

---

## 12. 附录: 与本 session 上游的连续性

- 2026-06-21 18:05 Codex STATUS.md 已记录 "E6A + N6 + N6F2 worktree" ship handoff (905 tests). 当前 main HEAD `ec0ccf6` 不包含 W9/N9/E9 (都还在 uncommitted 状态).
- UI-QA6 / UI-QA8 review 已 ship, 验收 N6F2 useCanvasBoard dual-mode (我刚做的 review). N6F2 修复仍然生效 (21/21 tests pass).
- STATUS.md 提到 "Next UI direction should stop broad visual polish and move to real content/demo flow" — 当前 W9/N9/E9 是 polish, **符合 user 之前的 feedback 改需求, 但 STATUS.md 暗示应转向 content flow**. 用户可能后续想转方向.

**Final**: 3 切片都满足 user 反馈的"非微调"标准 + 0 forbidden patterns + 1 functional regression (E9 mechanism) + 3 截图缺失 (E9 brief 要求). 总 verdict ACCEPT WITH FIXES.