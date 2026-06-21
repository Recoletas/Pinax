# UI-MERGE9 — Integration Prep Review (W9 + N9 + E9-FIX + Lusion docs)

- **Reviewer**: Claude (UI-MERGE9, 2026-06-21)
- **Role**: 只读 / 检查是否可提交 / 不改代码 (per brief)
- **Scope**: 当前 working tree 7 src files M + 19 untracked docs/agent-runs + 8 required screenshots + 1 spec
- **Basis**: `git log -1` = `ec0ccf6 style(pages): ship record-book ledger and pinned material slips`
- **Verdict**: **ACCEPT WITH FIXES** (1 minor doc 口径修复可同 commit)

---

## 0. TL;DR (先看这里)

| 检查项 | 状态 |
|---|---|
| 7 src 文件 M | ✅ 全部 W9+N9+E9 scope, 无越界改动 |
| 8 张要求截图 | ✅ 全部存在 (writing-w9-2 + notes-n9-3 + experience-e9-3) |
| Lusion 5 文档 | ✅ 全部落盘 (R1+R2+R3+SPEC+QA+DOCFIX) |
| W9/N9/E9 reports | ✅ 3 报告 + QA9 review 全部落盘 |
| 测试 | ✅ 190/190 pass (uiPolish 168 + useCanvasBoard 21 + gamePanelMechanism 1) |
| build | ✅ clean 4.12s |
| git diff --check | ✅ clean |
| forbidden patterns | ✅ 0 命中 (test regex literal 除外) |

**Verdict**: **ACCEPT WITH FIXES** — 1 个 doc 口径修复 (UI-MERGE8-cleanup-plan.md 引用注释) 可同 1 个 commit 落地.

---

## 1. 源码范围 (git diff --name-only HEAD)

```
M src/__tests__/uiPolish.test.js        (+462)    ← W9 8 + N9 14 + E9 8 + 既有 N6/N5C 延续 + 1 个 N6 契约 relabel
M src/__tests__/useCanvasBoard.test.js (+81)     ← N6F2 dual-mode 21 + N9 5 behavioral
M src/components/GamePanel.vue          (+530/-166)  ← E9 ledger-spread 对开页结构
M src/composables/useCanvasBoard.js     (+18/-4)    ← N9 bringToFront + focusedZId (内含 N6F2 dual-mode fix)
M src/pages/Notes.vue                   (+313/-194)  ← N9 canvas-pinboard 双栏 + onSlipClick + importCheckedToPinboard
M src/pages/Writing.vue                 (+141/-75)   ← W9 cork 188→80 单行 + 5 处立体感签名
M src/styles/themes/kao.css             (+239/-94)   ← W9+N9 共用 theme-kao override + dark + reduced-motion
```

### 1.1 各 slice 文件归属 (验证)

| Slice | 必改文件 | 实际改 | 状态 |
|---|---|---|---|
| W9 (Writing 顶部降级) | Writing.vue + kao.css + uiPolish.test.js | 全部改 | ✅ |
| N9 (Notes 副阅读台画布) | Notes.vue + useCanvasBoard.js + kao.css + uiPolish.test.js + useCanvasBoard.test.js | 全部改 | ✅ |
| E9 (Experience 对开页) | GamePanel.vue + uiPolish.test.js | 全部改 | ✅ |
| **不动的 0 改** (per brief) | Writing/Experience/Notes 互不污染 + stores/services/router/server/OpeningPage/WelcomeView | 全部 0 改 (per `git diff HEAD --name-only` 排除) | ✅ |

### 1.2 跨 slice 边界 (验证)

| 检查 | 状态 |
|---|---|
| Writing.vue 改不改 Notes / Experience 行为 | ✅ grep 无 `notes-` / `experience-` 引用 |
| Notes.vue 改不改 Writing / Experience 行为 | ✅ grep 无 `writing-` / `experience-` 引用 |
| GamePanel.vue 改不改 Notes / Writing 行为 | ✅ 仅 `<article class="ledger-spread">` + `<template v-for="(spread, sIdx) in messageSpreads">` 局部 |
| kao.css 改动全部 `.theme-kao` gated | ✅ grep 无 leak (test regex literal 除外) |
| useCanvasBoard.js 不引入 store mutation | ✅ 无 `store.<method> =` 或 `gameStore.<method> =` |

---

## 2. 截图清单 (8 张, 全部就位)

| 文件 | 大小 | 改 | 状态 |
|---|---|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/writing-w9-1280.png` | 151 KB | W9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/writing-w9-empty-1280.png` | 132 KB | W9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-light-1280.png` | 678 KB | N9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-dark-1280.png` | 515 KB | N9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n9-640.png` | 412 KB | N9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-1280.png` | 247 KB | E9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-long-1280.png` | 525 KB | E9 | ✅ |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e9-640.png` | 178 KB | E9 | ✅ |

**重要修复**: UI-QA9 §2 H1 blocker "E9 3 截图 0 落盘" — **已修复**. 当前 3 张 E9 截图 (1280 / long-1280 / 640) 全部就位.

---

## 3. Lusion 文档 (5+1, 全部落盘)

| 文件 | 大小 | 状态 |
|---|---|---|
| `docs/agent-runs/2026-06-21-lusion-research/LUSION-R1.structure.md` | 26 KB | ✅ |
| `docs/agent-runs/2026-06-21-lusion-research/LUSION-R2.interaction.md` | 19 KB | ✅ |
| `docs/agent-runs/2026-06-21-lusion-research/LUSION-R3.visual-system.md` | 24 KB | ✅ |
| `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` | 18 KB | ✅ (含 LUSION-DOCFIX 4 fix) |
| `docs/agent-runs/2026-06-21-lusion-research/QA-LUSION.review.md` | 19 KB | ✅ |
| `docs/agent-runs/2026-06-21-lusion-research/LUSION-DOCFIX.report.md` | 16 KB | ✅ |
| `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md` | 19 KB | ✅ |

**LUSION-DOCFIX 修复内容** (per QA-LUSION F1-F4):
- **F1** spec + report header 加 "R8 STOP NOW fork explanation"
- **F3** spec + report header 加 "ACCEPT / DEFER / REJECT 3 路径"
- **F4** spec §10 + report §0 加 "未拍板前不实施 E10"
- 4 个 fix 全部落地 (per LUSION-DOCFIX.report.md §0)

**E10 状态**: 未实施. grep `ledgerSpreadEnter / continued-cross / isLastSpread` 在 GamePanel.vue 全部 0 命中 (per QA-LUSION §0).

---

## 4. 验证命令结果

```bash
$ npm run test:run -- src/__tests__/gamePanelMechanism.test.js src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js

 ✓ src/__tests__/useCanvasBoard.test.js  (21 tests) 12ms
 ✓ src/__tests__/uiPolish.test.js        (168 tests) 130ms
 ✓ src/__tests__/gamePanelMechanism.test.js (1 test) 50ms

 Test Files  3 passed (3)
      Tests  190 passed (190)
```

```bash
$ npm run build
✓ built in 4.12s
```

```bash
$ git diff --check
(clean — 0 whitespace issues)
```

```bash
$ git diff HEAD -- src/components/GamePanel.vue src/pages/Notes.vue src/pages/Writing.vue \
                    src/composables/useCanvasBoard.js src/styles/themes/kao.css \
                    src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js \
  | grep -nE ":global\(\.theme-kao\)"
(matches all inside test regex literals, not actual usage)

$ ... | grep -nE ":deep\("
(matches all inside test regex literals, not actual usage)

$ ... | grep -nE "!important"
(0 matches)

$ ... | grep -nE "#[0-9a-fA-F]{3,8}\b"
(0 matches — no raw hex)
```

**Forbiddens: 0 真实命中** (test regex literal 内的匹配是验证禁止 pattern 缺失的断言, 正确用法).

---

## 5. 不应 stage 的 untracked 文件 (12 个)

按 `git status --short` 实际列出, **不** 进 1 个 atomic commit:

| 文件 | 大小 | 类别 | 理由 |
|---|---|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md` | 40 KB | E6 plan | E6A + E9 已 ship, plan 是中间产物 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-E6A.report.md` | 14 KB | E6A report | E6A 是 E9 的前置, E9 ship 后 E6A 是中间产物 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-N6-pinned-slips-plan.md` | 40 KB | N6 plan | N9 supersede, plan 是中间产物 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-N6-pre-impl-check.md` | 6.5 KB | N6 pre-check | N6 pre-check 已落档, N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/UI-N6.report.md` | 19 KB | N6 report | N6 是 N9 的前置, N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md` | 13 KB | N6F2 report | N6F2 fix 已合到 main useCanvasBoard.js (per N9 bringToFront 同源), 但报告是另一个 worktree (`feat/n6f2-canvas-board-fix` 1bd38ec) 的产物, 不应在 main commit |
| `docs/agent-runs/2026-06-21-ui-fix/UI-QA6.review.md` | 19 KB | QA6 review | QA7 + QA9 supersede, 中间 review |
| `docs/agent-runs/2026-06-21-ui-fix/UI-QA7.review.md` | 18 KB | QA7 review | QA9 supersede (QA7 在 N6F2 阶段, 不含 W9 + E9 verdict) |
| `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md` | 15 KB | R7 review | R8 supersede, R7 是在 E6A + N6 ship 之前 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-R8-stop-continue.md` | 17 KB | R8 review | R8 已被 LUSION 调研 supersede (PINAX-LUSION-SPEC.report.md §0 fork 说明) |
| `docs/agent-runs/2026-06-21-ui-fix/UI-W5R-apply-or-drop.md` | 13 KB | W5R decision | W5R DEFER, W9 是替代方案. 决策已通过 W9 ship 落地 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-W5R.report.md` | 11 KB | W5R report | W5R DEFER, W9 ship 后报告归档 |
| `docs/agent-runs/2026-06-21-ui-fix/UI-SHOT6.report.md` | 12 KB | SHOT6 report | SHOT6 是 N6 阶段截图, N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/UI-MERGE8-cleanup-plan.md` | 20 KB | UI-MERGE8 plan | 旧的 merge 计划, 不属于本轮 merge scope |

**策略**: 这 14 个 untracked 文件 **不在 stage 范围**, 但保留在 working tree (本地参考). Codex 验收后可在另一个 cleanup commit 删 (per docs-status-handoff skill).

### 5.1 不应 stage 的旧 baseline 截图 (8 个)

| 文件 | 大小 | 改 | 理由 |
|---|---|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/writing-fix-1280.png` | 146 KB | W2 baseline | 旧 baseline, W9 已 ship |
| `docs/agent-runs/2026-06-21-ui-fix/writing-fix-empty-1280.png` | 134 KB | W2 baseline | 旧 baseline |
| `docs/agent-runs/2026-06-21-ui-fix/writing-w5r-1280.png` | 161 KB | W5R (DEFER) | W5R DEFER, 报告归档即可 |
| `docs/agent-runs/2026-06-21-ui-fix/writing-w5r-empty-1280.png` | 134 KB | W5R (DEFER) | 同上 |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-1280.png` | 598 KB | N6 baseline | N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-dark-1280.png` | 487 KB | N6 baseline | N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-640.png` | 392 KB | N6 baseline | N9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-1280.png` | 198 KB | E6A baseline | E9 supersede |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-long-1280.png` | 196 KB | E6A baseline | E9 supersede |

### 5.2 不应 stage 的旧 research 残留 (4 个)

| 文件 | 大小 | 类别 | 理由 |
|---|---|---|---|
| `docs/agent-runs/2026-06-19-ui-redesign-research/UI-DETAIL1.craft-audit.md` | ? | 旧 research | 2026-06-19 redesign research, 不属本轮 Lusion spec scope |
| `docs/agent-runs/2026-06-20-ui-e5/` (整个目录) | 23 KB | 旧 research | 2026-06-20 E5 read-only brief, E5 没 ship, brief 归档 |
| `docs/agent-runs/2026-06-20-ui-polish-p2/UI-N5-design-brief.md` | ? | 旧 brief | N5 brief 是 N6/N9 的设计 input, 已 ship |
| `docs/agent-runs/2026-06-20-ui-polish-p2/UI-R5.diagnosis.md` | ? | 旧 diagnosis | R5 是上一轮 (P2 polish) diagnosis, 已 ship |

**总计不应 stage**: 14 reports + 9 旧截图 + 4 旧 research = **27 untracked files** (15 reports / docs + 9 pngs + 4 research items).

---

## 6. Stage 清单 (精确 git add)

### 6.1 7 src 文件 (modified)

```bash
git add \
  src/__tests__/uiPolish.test.js \
  src/__tests__/useCanvasBoard.test.js \
  src/components/GamePanel.vue \
  src/composables/useCanvasBoard.js \
  src/pages/Notes.vue \
  src/pages/Writing.vue \
  src/styles/themes/kao.css
```

### 6.2 8 required screenshots (untracked)

```bash
git add \
  docs/agent-runs/2026-06-21-ui-fix/writing-w9-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/writing-w9-empty-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/notes-n9-light-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/notes-n9-dark-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/notes-n9-640.png \
  docs/agent-runs/2026-06-21-ui-fix/experience-e9-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/experience-e9-long-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/experience-e9-640.png
```

### 6.3 W9 / N9 / E9 / QA9 reports (untracked, 必落档)

```bash
git add \
  docs/agent-runs/2026-06-21-ui-fix/UI-W9.report.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-N9.report.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-QA9.review.md
```

### 6.4 Lusion 调研 + Spec + QA + DOCFIX (untracked, 必落档)

```bash
git add \
  docs/agent-runs/2026-06-21-lusion-research/LUSION-R1.structure.md \
  docs/agent-runs/2026-06-21-lusion-research/LUSION-R2.interaction.md \
  docs/agent-runs/2026-06-21-lusion-research/LUSION-R3.visual-system.md \
  docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md \
  docs/agent-runs/2026-06-21-lusion-research/QA-LUSION.review.md \
  docs/agent-runs/2026-06-21-lusion-research/LUSION-DOCFIX.report.md \
  docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
```

### 6.5 Stage 后总数

- 7 src M
- 8 png (required screenshots)
- 4 reports (W9/N9/E9/QA9)
- 7 Lusion + spec docs
- = **26 files**

---

## 7. Commit message (1 atomic commit, per AGENTS.md commit-conventions)

```
style(pages): ship W9 + N9 + E9 archive-folio polish + Lusion spec

W9 — Writing 顶部降级 (188→80px cork 单行)
- src/pages/Writing.vue: wall__cork 整段重写 (单行 flex, 删 mark + h1 + meta)
- src/styles/themes/kao.css: .theme-kao .wall__* 系列 (cork max-height 80,
  book-pill / save-chip / tab / cork / back 5 处立体感签名)
- src/__tests__/uiPolish.test.js: 8 W9 contracts + 2 反向更新

N9 — Notes 副阅读台画布 (canvas-pinboard)
- src/pages/Notes.vue: reading-deck 拆双栏 (reading-deck__main + canvas-pinboard)
- src/composables/useCanvasBoard.js: bringToFront + focusedZId + N6F2 dual-mode
- src/styles/themes/kao.css: .theme-kao .canvas-pinboard + dark + reduced-motion
- src/__tests__/uiPolish.test.js: 14 N9 contracts (含 1 N6 relabel)
- src/__tests__/useCanvasBoard.test.js: 5 N9 behavioral + N6F2 dual-mode 21

E9 — Experience 对开页 ledger-spread
- src/components/GamePanel.vue: <article class="ledger-spread"> + messageSpreads
- src/__tests__/uiPolish.test.js: 8 E9 contracts + 1 E6A 更新

Lusion 调研 + 下一轮 spec
- docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
- docs/agent-runs/2026-06-21-lusion-research/{R1,R2,R3,PINAX-SPEC,QA-LUSION,LUSION-DOCFIX}.md

Verification: 190/190 test pass (uiPolish 168 + useCanvasBoard 21 + gamePanelMechanism 1),
build 4.12s clean, git diff --check clean, 0 forbidden patterns,
8 required screenshots 落盘 (writing-w9-2 + notes-n9-3 + experience-e9-3).

E10 (ledger-spread 翻页仪式) **未实施** — per LUSION-DOCFIX F4 + QA-LUSION F3:
R8 "STOP NOW" 已推荐本轮结束, E10 是备选路径, Codex / user 未拍板前不 ship.

Out of scope (per R8 verdict):
- W5R (永久 DEFER, W9 是替代)
- E6B (永久 cancel)
- E10 (待 Codex 拍板)
- per-item mood board (N10+ scope)
- z-tier + easing token 跨页基础设施 (UI-X1 scope)
```

---

## 8. ACCEPT WITH FIXES — 1 处口径修复建议

### F1 (minor): `UI-MERGE8-cleanup-plan.md` 引用

旧 merge 计划 `UI-MERGE8-cleanup-plan.md` 在 working tree 里, 但**不在本轮 stage 范围** (§5 列). 这是 OK 的, 但如果 Codex 想"全文档同步" (即把旧 merge plan 一并归档), 可选:

**Option A (推荐)**: 不 stage 旧 plan. 留 working tree (本地参考), 后续 docs-status-handoff 时再删. 本 commit 干净.

**Option B (可选)**: 把 `UI-MERGE8-cleanup-plan.md` 加到 stage 列表 + commit message 注明"deprecated, kept for history". 适合 Codex 想要"全归档同步"的场景.

**建议**: Option A. 本 commit 应该是"ship 范围" + "ship evidence (报告+截图)" + "future direction (Lusion spec)", 不包括历史归档. 历史归档留给后续 docs-status-handoff / cleanup commit.

---

## 9. ACCEPT vs ACCEPT WITH FIXES 决定

**Verdict**: **ACCEPT WITH FIXES**

理由:
1. **ACCEPT 部分**: 7 src + 8 截图 + 4 报告 + 7 Lusion 文档 = 26 files, 全部 ship 质量 (190/190 测试 + build + diff clean + 0 forbidden)
2. **WITH FIXES 部分**: F1 (merge plan 归档策略) 是 decision, 不是 blocker. Option A (推荐) 不改任何文件, Option B 是可选的扩展.

**Codex 拍板路径**:
- 接受本 review → 1 atomic commit 按 §6 + §7 (推荐 Option A)
- Option B 路径 → commit message 加 1 行 + 1 个额外 file (UI-MERGE8-cleanup-plan.md)
- REJECT 路径 → 不 commit, 继续 polish

---

## 10. 关键文件路径

- **本报告**: `docs/agent-runs/2026-06-21-ui-fix/UI-MERGE9.review.md`
- **Stage 源**: 7 src files (per §6.1)
- **Stage 截图**: 8 PNG (per §6.2)
- **Stage 报告**: UI-W9/N9/E9/QA9 (per §6.3)
- **Stage Lusion**: 7 docs (per §6.4)
- **不 stage**: 27 untracked (per §5)
- **上游 review**: UI-QA9.review.md (3 slice ACCEPT WITH FIXES + E9 1 regression 已修)
- **上游 spec**: docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md (含 LUSION-DOCFIX F1-F4)

---

## 11. Codex 主控 checklist (commit 前 verify)

```
[ ] git status -s | grep -E "^.M|^M" | wc -l == 7 (modified src files)
[ ] git status -s | grep "^??" | wc -l == 27 (untracked, 26 to stage + 1 MERGE8 optional)
[ ] git diff --staged --stat | grep -E "src/.*\.vue|src/composables/useCanvasBoard\.js|src/styles/themes/kao\.css|src/__tests__/(uiPolish|useCanvasBoard)\.test\.js" | wc -l == 7
[ ] npm run test:run -- src/__tests__/gamePanelMechanism.test.js src/__tests__/uiPolish.test.js src/__tests__/useCanvasBoard.test.js → 190/190 pass
[ ] npm run build → clean
[ ] git diff --staged --check → clean
[ ] commit message per §7 (no Co-Authored-By footer per AGENTS.md commit-conventions §1)
[ ] git log -1 show → confirm 7 src + 19 docs/png (or 26 with MERGE8)
```

**预期最终状态**: `git status` clean + 1 commit on main + origin push ready (per AGENTS.md Codex 主控).

---

**END OF UI-MERGE9 REVIEW** — 落档后 Codex 拍板 commit。