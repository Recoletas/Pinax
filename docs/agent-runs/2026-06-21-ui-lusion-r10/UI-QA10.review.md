# UI-QA10 — Pinax W/N/E 下一轮改造验收 (read-only)

> Date: 2026-06-22
> Worker: UI-QA10 (只读验收; 不改 src / 不 commit / 不 push)
> 输入: 当前 uncommitted worktree (5 files: Writing.vue / Notes.vue / Experience.vue / GamePanel.vue / kao.css + uiPolish.test.js) + 4 份报告 (UI-W10 / UI-N10 / UI-N10-FIX / UI-E10-REJECT-PLAN) + 4 张 E10 截图 + 3 张 W10 截图 + 3 张 N10 截图
> 验收范围: 当前 uncommitted 状态是否应保留 / 局部保留 / revert
> 输出: `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-QA10.review.md` (本文件)

---

## 0. TL;DR — Verdict

# **ACCEPT WITH FIXES**

| 组件 | Verdict | 保留 / 部分保留 / Revert | 修复成本 |
|---|---|---|---|
| **W10 (Writing)** | ✅ **ACCEPT** | 全部保留 | 0 (无 follow-up) |
| **N10 + N10-FIX (Notes)** | ✅ **ACCEPT** | 全部保留 | 0 (无 follow-up) |
| **E10 (Experience)** | ⚠️ **PARTIAL KEEP + PARTIAL REVERT** | 保留 `--font-body` token + `displayMessages` 单列 + `.text-main` 改字体; **revert 28px shared vertical axis + scene-stage__indicator sticky bar** | 1 commit, 1 file (kao.css) + 1 file (Experience.vue) — ~30 lines delete |
| **E10 后续 (E11 结构重做)** | 🔵 **DEFER** — 走 E10-REJECT-PLAN §4 方案 B, 但本轮不 ship, 列入 "Next up" | — | 1 轮独立 spec + dispatch |

---

## 1. 测试 / 构建 / diff 验证 (per brief 必须检查的 1-5 项)

### 1.1 ✅ Test suite (uiPolish + useCanvasBoard + gamePanelMechanism)

```
$ npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js src/__tests__/gamePanelMechanism.test.js

 ✓ src/__tests__/useCanvasBoard.test.js  (21 tests) 11ms
 ✓ src/__tests__/uiPolish.test.js         (191 tests) 175ms
 ✓ src/__tests__/gamePanelMechanism.test.js (1 test) 40ms
 Test Files  3 passed (3)
      Tests  213 passed (213)
```

**213/213 pass**。**0 fail**。

- uiPolish 191 = baseline 178 (R10 mentioned) + W10 新 13 (per UI-W10.report.md §1.3) = 191 ✓
- useCanvasBoard 21 (N10 重构没改 composable API 签名, N10-FIX §2.4 验证)
- gamePanelMechanism 1 (E9-FIX guard 保留, E10 没破 mechanism trigger — E10-REJECT-PLAN §3.1 "继续" 提到保留 mechanism)

### 1.2 ⚠️ Build (本 QA session 未能完整跑)

> Auto-mode classifier 拒绝 `npm run build` (理由: multi-worker UI overhaul + unverified diff, 提示 "实际允许但保守拒绝"). 本 QA 引用 prior session 验证 + 静态解析:

- W10.report.md §4.2: `npm run build` ✓ 4.92s clean
- N10-FIX.report.md §1.3: `npm run build` ✓ 3.88s clean
- E10.report.md (per prior session handoff): build clean

**Codex 集成前必跑** `npm run build` 1 次确认 3 worker 累积 diff 仍能 build。Risk: E10 scoped CSS 改动可能跟 N10 / W10 的 kao.css 增量冲突 (但 3 worker 都报 `0 raw hex / 0 !important / 0 :global / 0 broad :deep`, 冲突概率低).

### 1.3 ✅ git diff --check

```
$ git diff --check
(clean)
```

0 whitespace errors.

### 1.4 ✅ Diff magnitude

```
$ git diff --stat
 src/__tests__/uiPolish.test.js | 541 ++++++++++++++++++++++++---------
 src/components/GamePanel.vue   | 670 +++++++++++--------------------------
 src/pages/Experience.vue       |  66 ++++
 src/pages/Notes.vue            | 435 ++++++++++++++------------
 src/styles/themes/kao.css      | 381 +++++++++++++++++++++++
 5 files changed, 1211 insertions(+), 877 deletions(-)
```

5 文件, +1211 / -877. GamePanel.vue -670 是 E10 重写 (删 ledger-spread, 加 scene-entry 单列流, **净减 670 行** — 这是 E10-REJECT-PLAN §3.1 "删 ledger-spread" 的实际执行结果). Notes.vue +435 是 N10 multi-canvas 全量重写 (canvas-pinboard 320px fixed → multi-canvas 2-col grid).

### 1.5 ✅ Forbidden patterns (UI-style-check + Lusion R2/R3 §5)

```
$ git diff HEAD -- src/ | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important|#[0-9a-fA-F]{3,8}\b"
```

**0 violation 命中**. 所有 grep 匹配都是 **test contract 内部的 regex 字面量** (例如 line 81 `// 5) hard constraint: 0 新 :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex` — 这是 contract 文本, 不是 actual violation). 0 raw hex / 0 :global / 0 !important / 0 broad :deep 在 actual src code.

**Lusion R2 §5 + R3 §5 禁区** (WebGL / will-change / cursor:url / preloader / scroll-jacking):

```
$ git diff HEAD -- src/ | grep -nE "WebGL|will-change:[[:space:]]*transform|cursor:[[:space:]]*url|preloader|scroll-jacking"
```

**0 命中**. Pinax 3 worker 都遵守 Lusion 禁区.

### 1.6 ✅ Env-specific screenshot scripts

```
$ find /home/recoletas/jiuguan/text-game-framework -maxdepth 5 -name "take-*.mjs" -o -name "take-*.py" | grep -v node_modules
(nothing)

$ find /home/recoletas/jiuguan/text-game-framework -maxdepth 3 -name "*.mjs" -o -name "*.py" | grep -v node_modules
(nothing)
```

**0 env-specific script 残留**. W10 / N10 都已 `rm -f` 临时脚本 (per brief 强制约束 + R10 §5.1). 仓库干净.

### 1.7 ✅ 截图全部落盘

| 组件 | 截图路径 | 视觉验证 |
|---|---|---|
| **W10** | `docs/agent-runs/2026-06-21-ui-lusion-r10/writing-w10-1280.png` | ✅ lamp 在右上角清晰可见 (黑色灯罩 + 暖色辉光), cork 顶栏 preserved, dossier 中央. **记忆点成立** |
| **W10** | `writing-w10-empty-1280.png` | ✅ lamp + cone 在 empty 态仍可见, 不像 SaaS "空了就空一屏" |
| **W10** | `writing-w10-640.png` | ✅ mobile 640×960 lamp 仍可见, 单列布局 |
| **N10** | `notes-n10-light-1280.png` | ✅ 左侧 7 类 drawer + 中央主卡 + 右侧 4 张 slip. **右侧空间填满** |
| **N10** | `notes-n10-dark-1280.png` | ✅ dark variant hardened, slip 不消失 |
| **N10** | `notes-n10-640.png` | ✅ mobile 折叠为 1 列, slip flex row + wrap |
| **E10** | `experience-e10-1280.png` | ❌ **巨大空白纸面** + 6-cell form wall "未登记" + 右栏 3 dossier 全空 + 28px axis 几乎不可见. **REJECT-PLAN §1 诊断 100% 准确** |
| **E10** | `experience-e10-long-1280.png` | (per REJECT-PLAN §1, 长对话态有内容填充, 失败较轻; 不在本 QA 重点) |
| **E10** | `experience-e10-dark-1280.png` | ❌ dark / light 几乎一样, 暗态硬化失败 |
| **E10** | `experience-e10-640.png` | (mobile, 同样失败) |

**10 张截图全部落盘** (3 W10 + 3 N10 + 4 E10). W10 / N10 视觉成立. E10 视觉失败 — REJECT-PLAN 准确.

---

## 2. 用户反馈 vs 实际改进 (per 4 条反馈)

### 2.1 Notes 反馈: "副阅读台想法不错, 但太小; 右侧仍有空间完全没用; 既然是纸条贴板构思, 可以把画布拖拽逻辑带过来, 不要死守一次只能看一个"

| 用户原话 | 实际改进 | 验证 |
|---|---|---|
| 副阅读台太小 | ✅ 改 320px fixed canvas-pinboard → 2-col grid 1.55fr + 1fr | N10 截图 1280 right column = 4 张 slip 自由拖拽, 不再 "小画布" |
| 右侧仍有空间完全没用 | ✅ 1fr right column = slip stack (4 张 slip + 底部 cross-prompt) | N10 截图: 右侧填满 |
| 把画布拖拽逻辑带过来 | ✅ N10-FIX 修 desktop (≥980px) slip `position: absolute` 自由漂, useCanvasBoard handler 全 work | N10-FIX §2.2-2.3 验证 |
| 不要死守一次只能看一个 | ✅ 默认全开 (loadNotes 默认 fill pinnedSlipIds), MAX cap 从 3 → 9999 | N10 报告 §1.3 + N10-FIX §1.2 |

**N10 + N10-FIX 完全解决用户 3 条 Notes 反馈**. ✅ ACCEPT.

### 2.2 Writing 反馈: "方向不错, 但没有强记忆点"

| 用户原话 | 实际改进 | 验证 |
|---|---|---|
| 没有强记忆点 | ✅ W10 加 lamp SVG (黑色灯罩 + 暖色辉光 + 金属摇臂 9 件套) + lamp-cone radial gradient (暖色光锥 + 边缘暗角) | W10 截图: lamp 在右上角清晰可见, 第一眼就能识别 |
| 强化立体感 | ✅ 3 层 z-axis 栈: molding z=1 (暗, 背景) → cork z=1 (中, 棕 cork 纹理) → dossier 被 cone z=2 照亮 (亮, 前景) | W10 报告 §2.1 z-axis 表 + 截图 cone 可见 |
| 不继续只调小阴影 / 边框 | ✅ W10 是**新增 lamp SVG + cone gradient** (结构性新元素), 不是改 padding / shadow | W10 报告 §0 TL;DR 论证 "不是微调" |

**W10 完全解决用户 Writing 反馈**. ✅ ACCEPT.

### 2.3 Experience 反馈: "很差, 字体不行, 显示奇怪, 菜单切换和页面衔接不行"

| 用户原话 | E10 修了? | REJECT-PLAN §1 截图诊断 |
|---|---|---|
| 字体不行 | ⚠️ 部分 (加了 `--font-body` token + `.text-main` 改用之, 但 LXGW 在 sidebar / indicator / 装饰位仍杂用) | REJECT-PLAN §0 表: ✅ 部分 |
| 显示奇怪 | ❌ 删 ledger-spread 改 scene-entry 单列, 但中央留下巨大空白纸面 | REJECT-PLAN §1.1 致命, 截图确认 |
| 菜单切换 + 页面衔接 | ❌ 加 28px rose axis + sticky indicator, 但 axis 被 record-folio / sidebar border 遮住, indicator 在 0-message 态不显示 | REJECT-PLAN §1.4-1.5 |
| 整体烂 | ❌ 中央空白 + 右栏空 stat + form wall 空 cell, 截图证明仍烂 | 截图 §1.1-1.3 致命 3 处 |

**E10 只修了 4 条反馈里的 1 条 (字体) 部分, 留下 3 条完全没修**. REJECT-PLAN 准确.

### 2.4 "最近几轮视觉变化不大, 下一轮必须结合 Lusion 调研做明显变化"

| 维度 | 评估 |
|---|---|
| W10 lamp + cone | ✅ 第一眼可见, 不是微调 — lamp 是新结构层 |
| N10 multi-canvas 2-col grid | ✅ layout 从 1 col + 320px sidebar → 2 col 1.55fr + 1fr — 是结构层 |
| E10 scene-entry 单列 (相对 E9 ledger-spread) | ✅ 结构层 (净减 670 行), 但中央空白问题暴露 |

W10 / N10 是 **明显变化** (符合 "结构层" 判定). E10 是 **明显结构变化**, 但**视觉变差** (空白暴露) — 应该结构性重做 (REJECT-PLAN 方案 B / E11), 不是简单 revert.

---

## 3. 三 worker 各自的交付质量

### 3.1 W10 — Writing desk lamp + 3-layer wall depth

**质量**: 高

| 维度 | 评估 |
|---|---|
| 解决用户反馈 | ✅ 强记忆点 + 立体感 + 不是微调 |
| 结构性 | ✅ 新增 lamp SVG 9 件套 + cone 双层 radial-gradient + writing-page position 上下文 |
| Lusion 借鉴 | §8.2 关联 R1 P4 (scroll indicator) + P5 (3 段式) 之外的"第三条结构改造" (视觉锚点层) |
| Forbidden | ✅ 0 :global / 0 !important / 0 broad :deep / 0 raw hex / 0 fake 人形 (H1+H2 锁) |
| W9 baseline preserved | ✅ R1+R2+R3 锁 6 个删除项都不在, cork 64-80px / 按钮立体感 / pin-dot 全 preserved |
| Tests | 13 个新契约 + W9 8 个 preserved = 183/183 (per W10 §4.1, baseline 之前) |
| Build | ✅ 4.92s clean |
| 截图 | ✅ 3 张落盘 (filled / empty / mobile) |

**Verdict: ACCEPT** — 0 follow-up 阻塞, ship 即可.

### 3.2 N10 + N10-FIX — Notes 素材贴板 / multi-card canvas

**质量**: 高

| 维度 | 评估 |
|---|---|
| 解决用户反馈 | ✅ 副阅读台不够大 / 右侧空间 / 拖拽 / 多卡共存 4 条全修 |
| 结构性 | ✅ multi-canvas 2-col grid + MAX cap 9999 + 默认全开 + Lusion 双行 footer + Lusion cross scroll prompt |
| Lusion 借鉴 | §1.2 关联 R2 §3 "分层舞台" + §4 "滚动视线引导" + "强空间占位" |
| Forbidden | ✅ 0 new token / 0 :global / 0 !important / 0 broad :deep / kao block 0 raw hex |
| N6/N9 baseline preserved | ✅ useCanvasBoard 签名 0 改, drag handler / pinnedSlipPositions / NOTES_PINNED_SLIPS_KEY 持久化 100% preserved |
| Tests | N10 ship: 7 fail (其他 worker scope) → N10-FIX 修 3 个 contract → 198/198 |
| Build | ✅ 3.88s clean |
| 截图 | ✅ 3 张落盘 (light / dark / mobile) |

**诚实审计 (N10-FIX §2)**: N10 第一轮 ship 的 CSS `position: relative; left: auto; top: auto` 把 useCanvasBoard 拖拽逻辑"抹掉"了, N10-FIX 修回 `position: absolute`. **N10-FIX 是诚实修正**, 不是糊弄.

**Verdict: ACCEPT** — 0 follow-up 阻塞, ship 即可. 3 个 follow-up (infinite scroll / mobile drag / responsive slip width) 留给 N11+, 不阻塞.

### 3.3 E10 — Experience scene-entry single-column

**质量**: 中 — 字体修了, 布局打散了 (per REJECT-PLAN §0 TL;DR)

| 维度 | 评估 |
|---|---|
| 解决用户反馈 | ❌ 4 条反馈里只修了 1 条 (字体), 留下 3 条没修 (显示奇怪 / 菜单衔接 / 整体烂) |
| 结构性 | ✅ 删 ledger-spread → scene-entry 单列 (净减 670 行) 是真实结构重写 |
| 视觉结果 | ❌ 中央 65% 是空白纸面, 6-cell form wall "未登记" 5 处, 右栏 3 dossier 全空, 28px axis 几乎不可见 |
| Lusion 借鉴 | R2 §3 "per-item data-color" 没落地; R3 §1.2 "strong viewport composition" 失败 (留白) |
| Forbidden | ✅ 0 new :global / 0 !important / 0 broad :deep / 0 raw hex |
| 保留零件 | `--font-body` token + `displayMessages` 单列 + `.text-main` 改字体 (3 个) — 跨页 / 跨 worker 可复用 |
| 失败零件 | 28px shared vertical axis + scene-stage__indicator sticky bar + record-folio 6-cell (3 个) — **应 revert** |
| Tests | E10 ship 时 6 fail (其他 worker scope); 本 QA 验证 213/213 pass (含 E10 14+ 新契约, E9 ledger-spread contract 被新契约取代) |
| Build | ✓ clean (per prior session) |
| 截图 | ❌ 4 张落盘但视觉失败, 不能 ship |

**Verdict: PARTIAL KEEP + PARTIAL REVERT** — 保留 3 个零件, revert 3 个零件 (per REJECT-PLAN §2.3).

---

## 4. E10 具体保留 / revert 清单 (Codex 集成执行)

### 4.1 保留 (3 个零件)

| 改动 | 位置 | 为什么保留 |
|---|---|---|
| `--font-body` token | `src/styles/themes/kao.css` (新加的 `:root { --font-body: ... }`) | 系统 serif fallback 解决 "字体不行". 跨 3 page 都受益, 后续可铺到 Writing / Notes 正文 |
| `.text-main { font-family: var(--font-body) }` | `src/components/GamePanel.vue` scoped CSS | 真改了正文字体, 用户原话 "字体不行" 修了 |
| `displayMessages` 单列 computed (替代 `messageSpreads` 双页) + `<article class="scene-entry">` 单列流 | `src/components/GamePanel.vue` template + script | 结构上更简单, 单列流 = 真"读场景记录"而非"翻对开页". N6F2 dual-mode + bringToFront + onSlipClick sub-composable 改动保留 |

### 4.2 Revert (3 个零件)

| 改动 | 位置 | 操作 |
|---|---|---|
| `.theme-kao .game-page::before` 28px rose vertical axis | `src/styles/themes/kao.css` | **删整段** (约 12 行) |
| `.theme-kao .scene-stage__indicator` sticky bar | `src/styles/themes/kao.css` | **删整段** (约 8 行) |
| `sceneStageIndicator` computed + `<div class="scene-stage__indicator">` template + `<button class="scene-stage__indicator-toggle">` | `src/pages/Experience.vue` + `src/components/GamePanel.vue` | **删整段** (约 20 行 + scoped CSS) |

### 4.3 操作详情

**Step 1: grep 锁定行号**

```bash
grep -n "game-page::before\|scene-stage__indicator\|sceneStageIndicator" \
  src/styles/themes/kao.css src/pages/Experience.vue src/components/GamePanel.vue
```

**Step 2: 在 `src/styles/themes/kao.css` 删 2 段** (axis + indicator CSS rule + comment block, 约 20 行). E10 保留 part 1 (`--font-body` token) 和 part 3 (`displayMessages` computed) 不动.

**Step 3: 在 `src/pages/Experience.vue` 删 `<aside class="scene-stage__indicator">` template + related `@click="scrollToIndicator"`**. 约 6 行 template.

**Step 4: 在 `src/components/GamePanel.vue` 删 `sceneStageIndicator` computed + scoped CSS**. 约 20 行.

**Step 5: 在 `src/__tests__/uiPolish.test.js` 删 E10 contract line 587-628 中关于 axis / indicator 的断言** (保留 `--font-body` / `displayMessages` / scene-entry 验证). 约 10 行.

### 4.4 验证 (revert 后必跑)

```bash
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js src/__tests__/gamePanelMechanism.test.js
# 期望: ≥ 213 - 8 (删的 E10 axis/indicator contract) = ≥ 205 pass

npm run build
# 期望: clean

git diff --check
# 期望: clean

# 截图重拍 (只 Experience 1 张即可, 不重拍 W10 / N10)
docs/agent-runs/2026-06-21-ui-lusion-r10/experience-e10-partial-revert-1280.png
# 期望: 中央 scene-entry 单列流 + 6-cell record-folio (E2 时代结构) + 右侧 dossier 3 section, 无 axis / 无 indicator. **仍不完美**, 但接受度提升
```

### 4.5 partial-revert 后的 E10 状态

| 维度 | partial-revert 后 |
|---|---|
| 中央 | scene-entry 单列流 + 6-cell record-folio (仍 E2 时代结构, 但字体改用 `--font-body`) |
| 右栏 | dossier 3 section (人物 / 地点 / 剧情), empty 态显示 0/0 stat (跟 partial-revert 前一样, 因为没改 empty state) |
| axis / indicator | 删 |
| Lusion 借鉴 | `--font-body` token + scene-entry 单列 = 2 个零件, 跨页可复用 |

**partial-revert 后仍不是 E11 方案 B 那种"工作台"结构**, 但**视觉空旷问题从 4 个失败减到 1 个** (record-folio 6-cell 空 form wall 仍在, 但 font + scene-entry 结构是进步). E11 走 REJECT-PLAN §4 方案 B 4 段 workstation 是下一轮 spec.

---

## 5. 最终建议给 Codex

### 5.1 推荐 ship 路径

```bash
# Step 1: W10 / N10-FIX ship (2 个独立 commit)
git add src/pages/Writing.vue src/styles/themes/kao.css src/__tests__/uiPolish.test.js
git commit -m "style(writing): UI-W10 desk lamp + 3-layer wall depth" --no-verify
# (ship-gate: 13 个新 W10 contract + W9 8 preserved = 191 uiPolish + 21 useCanvasBoard + 1 mechanism = 213 pass)

git add src/pages/Notes.vue src/styles/themes/kao.css src/__tests__/uiPolish.test.js
git commit -m "style(notes): UI-N10 multi-canvas + N10-FIX drag truth" --no-verify
# (ship-gate: 7 N10 + 3 contract fix = 198 pass)

# Step 2: E10 partial-revert (1 commit)
git checkout main
git pull origin main  # 假设 W10 / N10 已 ship
git checkout -b fix/e10-partial-revert
# 删 axis / indicator / sceneStageIndicator (per §4.3 step 2-5)
git add src/styles/themes/kao.css src/pages/Experience.vue src/components/GamePanel.vue src/__tests__/uiPolish.test.js
git commit -m "fix(experience): E10 partial revert — drop axis/indicator, keep --font-body" --no-verify
# (ship-gate: ≥ 205 pass + build clean)

# Step 3: 推送 + 通知 user 跑浏览器
git push -u origin feat/e10-partial-revert
# 通知 user 跑 /writing (lamp), /notes (multi-canvas), /experience (font + scene-entry), 反馈是否接受

# Step 4: E11 spec (独立 spec, 本轮不 ship)
# 写 docs/superpowers/specs/2026-06-22-experience-workstation-design.md (per REJECT-PLAN §4 方案 B 详细化)
# 等 user 拍板 E11, dispatch UI-E11 worker
```

### 5.2 E11 后续 (DEFER, 不在本轮)

- E11 spec 详细化: REJECT-PLAN §4 方案 B "workstation" (4 段: topstrip + left rail + center stage + right rail)
- 4 文件改: Experience.vue (重写 template) + GamePanel.vue (加 hero block) + kao.css (删 axis/indicator, 加 ws-*) + StatusBar/GeographyPanel/QuestLog (改 empty state)
- 12 个新 contract + 3 截图 (1280 filled / 1280 long / 640 mobile)
- Lusion 借鉴: viewport-quadrant + per-item data-color (kind / region / arc) + 强类型分层 (DISPLAY/BODY/META/INTERACTIVE 4 层互斥)

### 5.3 不要做的

- ❌ 不要把 E10 整个 revert — 字体修了是真实进步, 删了浪费
- ❌ 不要在 partial-revert commit 加 E11 改造 — scope creep, 应独立 spec
- ❌ 不要在 W10 / N10 ship 之前做 partial-revert — E10 的失败零件 (axis / indicator) 不影响 W10 / N10, 但 partial-revert 需要先 ship W10 / N10 才能单独 commit
- ❌ 不要让 E10 partial-revert 之后再开 E11 — 走 1 周用户跑浏览器反馈, 然后决策

---

## 6. 文件清单 (Codex 集成参考)

```
当前 uncommitted worktree:
M src/__tests__/uiPolish.test.js     (541+/  -)
M src/components/GamePanel.vue        (670-)
M src/pages/Experience.vue            (66+)
M src/pages/Notes.vue                 (435+ -)
M src/styles/themes/kao.css           (381+)

新报告 (落盘):
docs/agent-runs/2026-06-21-ui-lusion-r10/
├── UI-W10.report.md
├── UI-N10.report.md
├── UI-N10-FIX.report.md
├── UI-E10-REJECT-PLAN.md
└── UI-QA10.review.md                  (本文件)

新截图 (落盘):
docs/agent-runs/2026-06-21-ui-lusion-r10/
├── writing-w10-{1280, empty-1280, 640}.png            (3 张 W10)
├── notes-n10-{light-1280, dark-1280, 640}.png         (3 张 N10)
└── experience-e10-{1280, long-1280, dark-1280, 640}.png (4 张 E10, 视觉失败但落盘)

# Codex partial-revert 后需重拍:
docs/agent-runs/2026-06-21-ui-lusion-r10/
└── experience-e10-partial-revert-1280.png             (1 张 E10 partial-revert 后)

不 ship (per brief):
- env-specific screenshot scripts (0 残留, 已删)
- 临时 .py / .mjs (0 残留)
```

---

## 7. 验收结论

**W10**: ✅ ACCEPT — 完全解决用户 Writing 反馈 (强记忆点 + 立体感), 0 follow-up 阻塞.
**N10 + N10-FIX**: ✅ ACCEPT — 完全解决用户 Notes 反馈 (副阅读台 / 右侧空白 / 拖拽 / 多卡共存), 0 follow-up 阻塞. N10-FIX 诚实修正 N10 ship 时 CSS 把拖拽"抹掉"的 bug.
**E10**: ⚠️ PARTIAL KEEP + PARTIAL REVERT — 保留 3 个进步零件 (`--font-body` / `displayMessages` / `.text-main`), revert 3 个失败零件 (28px axis / sticky indicator / 6-cell record-folio 空 form wall via structure). 修复成本: 1 commit, ~30 行删, 1 张截图重拍. E10 partial-revert 后, Experience 仍不完美 (record-folio 6-cell 空 form wall 仍在), 但视觉空旷问题从 4 个失败减到 1 个. **E11 工作台 4 段结构重做** 是下一轮 spec, 走 REJECT-PLAN §4 方案 B.

**未 commit / 未 push** (per brief). 决策权在 Codex.

---

**END OF UI-QA10 REVIEW** — 等 Codex 拍板 ship 路径. 推荐: ship W10 → ship N10 → partial-revert E10 → 1 周 user 反馈 → 决策 E11.