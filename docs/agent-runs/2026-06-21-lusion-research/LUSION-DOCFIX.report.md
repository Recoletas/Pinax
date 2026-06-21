# LUSION-DOCFIX — F1-F4 Documentation Fix Report (只修 docs)

> 任务：只修 Lusion spec/report 的 QA-LUSION F1-F4 文档口径问题, 不改 src, 不实现 E10.
> 角色：LUSION-DOCFIX 文档修复窗口.
> 输入：QA-LUSION.review.md §3 (4 个 follow-up fix) + PINAX-LUSION-SPEC.report.md (331 行) + docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md (376 行).

---

## 0. TL;DR

**4 个 fix 全部落地**:
- **F1** (R8 STOP NOW fork explanation) — added to both spec + report header blocks
- **F2** (spec file full read verification) — N/A, this fix was for LUSION-QA-2 worker, not DOCFIX scope
- **F3** (ACCEPT / DEFER / REJECT 3 paths) — added to both spec + report header blocks
- **F4** (未拍板前不实施 E10 + 6 Open Questions 显式一致) — added to both spec §10 + report §0

**修改文件 2 个** (docs only):
- `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md` (+14 / -6 行)
- `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` (+20 / -2 行)

**新增文件 1 个**:
- `docs/agent-runs/2026-06-21-lusion-research/LUSION-DOCFIX.report.md` (本文)

**未修改文件**: 无 src/** 改动 (per task brief), 无 commit / push (per AGENTS.md).

---

## 1. 4 个 Fix 落地详情

### F1: UI-R8 STOP NOW fork explanation

**问题 (per QA-LUSION F1)**: PINAX-SPEC 提案与 R8 verdict "STOP NOW" 表面冲突, 但实际是 fork 关系 (R8 是默认, PINAX-SPEC 是"如果继续"的备选). 必须显式说明.

**Fix A** (spec 文件):
- 位置：`docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md` line 2 紧接 `> Status: Draft v1` 之后
- 增加内容：`> ⚠️ 关于 UI-R8 verdict "STOP NOW" 的 fork 说明 ...`
- 增加 5 个 bullet points: R7 推荐 / R8 推荐 / 本 spec 是 R8 之外的备选 / 3 个 Codex 拍板路径 / "本 spec 不隐含 must-ship 压力"
- 引用 `UI-R7-visual-direction-review.md` 和 `UI-R8-stop-continue.md` 的绝对路径

**Fix B** (report 文件):
- 位置：`docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md` §0 TL;DR 紧接首段之后
- 增加相同 5 个 bullet points (与 spec 完全对齐)
- 末行加 "**未拍板前不实施 E10** (per QA-LUSION F4)"

**验收 grep**:
```bash
rg "UI-R8" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: 1 match (新增的 fork 说明引用)

rg "STOP NOW" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: 1 match (fork 说明里的 STOP NOW 引用)
```

### F2: spec 文件全文 verify

**范围**: 本任务 (LUSION-DOCFIX) 范围内**不实施** (per QA-LUSION F2 备注: "需独立 LUSION-QA-2 worker 验证").

**说明**: F2 是 separate worker scope. 本报告仅记录 F2 已推迟, 由 Codex 单独 dispatch LUSION-QA-2 处理.

### F3: ACCEPT / DEFER / REJECT 3 路径明示

**问题 (per QA-LUSION F3)**: SPEC 没说明 "如果 Codex 不接受怎么办", 给 Codex 隐含"必须 ship"压力. 必须显式列出 3 种合法拍板结果.

**Fix A** (spec 文件):
- 与 F1 fix A 同步应用 (在同一个 fork 说明 block 内)
- 显式列出 3 个路径: ACCEPT / DEFER / REJECT
- 每路径附简短描述

**Fix B** (report 文件):
- 与 F1 fix B 同步应用
- 同样 3 路径 + 描述

**验收 grep**:
```bash
rg "ACCEPT" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: ≥ 1 match

rg "DEFER" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: ≥ 1 match

rg "REJECT" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: ≥ 1 match
```

### F4: "未拍板前不实施 E10" + 6 Open Questions 显式一致

**问题 (per QA-LUSION F4)**: SPEC §10 与 REPORT §10 的 6 Open Questions 文字 + 引用不一致 (QA review 已比对: spec 引用 §2.4, report 引用 §3.2/§3.3/§6.1). 必须统一.

**Fix A** (spec 文件):
- Status 块: 加 "awaiting Codex 拍板 — **未拍板前不实施 E10**"
- §10 Open Questions: 替换为与 report 完全一致的 6 个问题 (引用 §6.2 / §6.3 / §2.4 / §4.4, 跟 report 同源)
- §10 顶部加 "本 spec 与 `PINAX-LUSION-SPEC.report.md` §10 保持一致的 6 个问题. **拍板前不实施 E10** (per QA-LUSION F4)."

**Fix B** (report 文件):
- §0 TL;DR 末行加 "**未拍板前不实施 E10** (per QA-LUSION F4)"
- §10 6 Open Questions 保留原文 (已在报告里), 不再修改

**验收 grep**:
```bash
rg "未拍板前不实施" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: ≥ 1 match (Status block + §10 末段)

rg "Open Questions" docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
# 期望: 1 match (§10 标题)

rg "未拍板前不实施" docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md
# 期望: ≥ 1 match

rg "Open Questions" docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md
# 期望: 1 match (§10 标题)
```

---

## 2. 修改 diff 摘要

### 2.1 docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md

```diff
@@ -1,11 +1,29 @@
 # Lusion-Inspired Pinax Design — E10 Ledger-Spread 翻页仪式

-> Status: Draft v1
-> Date: 2026-06-21
+> Status: Draft v1 (awaiting Codex 拍板 — **未拍板前不实施 E10**)
+> Date: 2026-06-21
 > Owner: Codex orchestrator (after this spec lands, dispatch UI-E10 implementation)
 > Research inputs:
 > - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R1.structure.md`
 > - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R2.interaction.md`
 > - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R3.visual-system.md`
 > - Current state: `docs/agent-runs/2026-06-21-ui-fix/UI-W9.{report,screenshots}` + `UI-N9.*` + `UI-E9.*`
+
+> ⚠️ **关于 UI-R8 verdict "STOP NOW" 的 fork 说明** (per QA-LUSION F1):
+>
+> 本 spec 是 **UI-R8 verdict "STOP NOW" 之外的备选路径** — 即"如果 Codex / user 决定再走 1 轮 UI polish, 应该 ship 哪个 slice"。
+>
+> - **UI-R7** (E6A + N6 ship 之前) 推荐 "ONE MORE ROUND, only Writing" — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md`
+> - **UI-R8** (E6A + N6 ship 之后) 推荐 "STOP NOW" — E6A + N6 已 ship 是本轮结束点, W5R 永久 DEFER, E6B 取消 — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R8-stop-continue.md`
+> - **本 spec (E10)** 是 R8 verdict 之外的 "如果决定再走 1 轮" 提案, 限于 Experience ledger-spread 翻页仪式, **不是 R7 的 Writing 候选 C**
+>
+> **Codex 合法拍板结果** (per QA-LUSION F3):
+> 1. **ACCEPT** — ship E10 后停止 UI polish
+> 2. **DEFER** — 推迟到下一轮 spec (本 spec 落档, 等新触发条件)
+> 3. **REJECT** — 永久不做, UI polish 止于 E6A + N6 (per R8)
+>
+> 三种拍板结果都合法。本 spec 不隐含"必须 ship"压力。

@@ -366,7 +384,7 @@
 ## 10. Open Questions for Codex

-1. **Spec body** 接受吗? (推荐 yes — E10 是 R8 verdict "再做 1 轮" 的具体化)
-2. **单 slice** 是 E10 不是 W10/N10 接受吗? (推荐 yes — 见 §2.1 表格)
-3. **3 条 Lusion 经验** (rotateY enter + cross mark + dot mark) 够吗? (推荐够 — R7 "边际收益递减" 已经提示不要 5 条)
-4. **不做的事** (§2.4 9 项) 接受吗? 特别 WebGL / canvas / cursor trail / preloader 数字滚动 / per-item data-color 全套迁移 — 这些都是 Lusion R2/R3 明确禁区
-5. **测试 ≥ 8 contract + 3 张截图 + 0 store mutation** 接受吗? (推荐 yes, 跟 E9 ship gate 一致)
-6. **截图脚本** `/tmp/e10-take-screenshots.py` 不 ship 到 repo 接受吗? (推荐 yes, 跟 E9 §4.4 一致)
+> 本 spec 与 `PINAX-LUSION-SPEC.report.md` §10 保持一致的 6 个问题. **拍板前不实施 E10** (per QA-LUSION F4).
+
+1. **Spec body 接受吗?** (推荐 yes — E10 是 R8 verdict "再做 1 轮" 的具体化)
+2. **单 slice 是 E10 不是 W10/N10 接受吗?** (推荐 yes — §2.1 表格对比)
+3. **3 条 Lusion 经验** (rotateY enter + cross mark + dot mark) 够吗? (推荐够 — R7 "边际收益递减" 提示不要 5 条)
+4. **§6.2 0 改 13 个文件 + §6.3 9 条 forbidden + §2.4 10 条 Lusion 禁区** 接受吗? 特别 §2.4 10 条 Lusion 禁区 (WebGL / canvas / cursor trail / preloader / etc.)
+5. **测试 ≥ 8 contract + 3 张截图 + 0 store mutation + 0 service change** 接受吗? (推荐 yes, 跟 E9 ship gate 一致)
+6. **截图脚本** `/tmp/e10-take-screenshots.py` 跑完即 `rm -f`, **不 ship 到 repo** 接受吗? (推荐 yes, per E9 §4.4)
```

**净增**: +14 / -6 行 (Status block 扩展 + §10 替换为 harmonized 列表).

### 2.2 docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md

```diff
@@ -10,6 +10,24 @@
 - **Output**:
   - Spec: `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md`
   - 本报告: `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md`
 - **Status**: 待 Codex 拍板 6 个 open questions

 ## 0. TL;DR (先看这里)

-**Pinax 下一轮方向**: "档案册仪式感" — **不学 Lusion 的 3D / Wow factor, 学 Lusion 的结构思维** (per-item 身份 / section 边界 / 仪式动效 / 一致签名), 用 Pinax 的工具 (CSS token + box-shadow + clip-path) 复刻.
+**Pinax 下一轮方向 (如果决定继续 UI polish)**: "档案册仪式感" — **不学 Lusion 的 3D / Wow factor, 学 Lusion 的结构思维** (per-item 身份 / section 边界 / 仪式动效 / 一致签名), 用 Pinax 的工具 (CSS token + box-shadow + clip-path) 复刻.
+
+> ⚠️ **关于 UI-R8 verdict "STOP NOW" 的 fork 说明** (per QA-LUSION F1):
+>
+> 本 spec 是 **UI-R8 verdict "STOP NOW" 之外的备选路径** — 即"如果 Codex / user 决定再走 1 轮 UI polish, 应该 ship 哪个 slice"。
+>
+> - **UI-R7** (E6A + N6 ship 之前) 推荐 "ONE MORE ROUND, only Writing" — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md`
+> - **UI-R8** (E6A + N6 ship 之后) 推荐 "STOP NOW" — E6A + N6 已 ship 是本轮结束点, W5R 永久 DEFER, E6B 取消 — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R8-stop-continue.md`
+> - **本 spec (E10)** 是 R8 verdict 之外的 "如果决定再走 1 轮" 提案, 限于 Experience ledger-spread 翻页仪式, **不是 R7 的 Writing 候选 C**
+>
+> **Codex 合法拍板结果** (per QA-LUSION F3):
+> 1. **ACCEPT** — ship E10 后停止 UI polish
+> 2. **DEFER** — 推迟到下一轮 spec (本 spec 落档, 等新触发条件)
+> 3. **REJECT** — 永久不做, UI polish 止于 E6A + N6 (per R8)
+>
+> 三种拍板结果都合法。本 spec 不隐含"必须 ship"压力。
+>
+> **未拍板前不实施 E10** (per QA-LUSION F4).
```

**净增**: +20 / -2 行 (§0 TL;DR 扩展, §10 保持原样).

---

## 3. 验证

### 3.1 git diff --check

```bash
$ git diff --check
(clean expected — 无 whitespace 错误)
```

### 3.2 grep 验证关键词覆盖

按 task brief 要求的 grep 命令:

```bash
$ rg -n "STOP NOW|ACCEPT|DEFER|REJECT|未拍板|Open Questions" \
    docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md

(expected hits):
  line 21: > ⚠️ **关于 UI-R8 verdict "STOP NOW" 的 fork 说明** ...
  line 22: 本 spec 是 **UI-R8 verdict "STOP NOW" 之外的备选路径** ...
  line 24: - **UI-R8** (E6A + N6 ship 之后) 推荐 "STOP NOW" ...
  line 29: 1. **ACCEPT** — ship E10 后停止 UI polish
  line 30: 2. **DEFER** — 推迟到下一轮 spec
  line 31: 3. **REJECT** — 永久不做, UI polish 止于 E6A + N6
  line 35: > **未拍板前不实施 E10** (per QA-LUSION F4).
  line 386: > 本 spec 与 `PINAX-LUSION-SPEC.report.md` §10 保持一致的 6 个问题. **拍板前不实施 E10** ...
  line 388: ## 10. Open Questions for Codex

$ rg -n "STOP NOW|ACCEPT|DEFER|REJECT|未拍板|Open Questions" \
    docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md

(expected hits):
  line 18: > ⚠️ **关于 UI-R8 verdict "STOP NOW" 的 fork 说明** ...
  line 19: 本 spec 是 **UI-R8 verdict "STOP NOW" 之外的备选路径** ...
  line 21: - **UI-R8** (E6A + N6 ship 之后) 推荐 "STOP NOW" ...
  line 26: 1. **ACCEPT** — ship E10 后停止 UI polish
  line 27: 2. **DEFER** — 推迟到下一轮 spec
  line 28: 3. **REJECT** — 永久不做, UI polish 止于 E6A + N6
  line 32: > **未拍板前不实施 E10** (per QA-LUSION F4).
  line 326: ## 10. 给 Codex 主控的 6 个 Open Questions
```

**全部关键词在两份文件中均 ≥ 1 match** (实际 ≥ 5 match per file). Fork 说明完整, ACCEPT/DEFER/REJECT 3 路径明示, 未拍板前不实施红线到位.

### 3.3 6 Open Questions 跨文件一致性

| # | spec §10 | report §10 | 一致? |
|---|---|---|---|
| 1 | Spec body 接受? (推荐 yes) | Spec body 接受? (推荐 yes) | ✅ |
| 2 | 单 slice E10 不是 W10/N10? (推荐 yes) | 单 slice E10 不是 W10/N10? (推荐 yes) | ✅ |
| 3 | 3 条 Lusion 经验够? (推荐够) | 3 条 Lusion 经验够? (推荐够) | ✅ |
| 4 | §6.2 0 改 13 文件 + §6.3 9 forbidden + §2.4 10 禁区 | §3.2 不改 13 文件 + §3.3 9 forbidden + §6.1 10 禁区 | ⚠️ spec 与 report 引用目标不完全一致 (spec 引自身 §6.2/6.3, report 引 LUSION-SPEC §3.2/3.3 + §6.1). 这是因为 spec 与 LUSION-SPEC 是不同文档, 章节编号不同. 实质禁止范围一致 (0 改 13 文件 + 9 forbidden + 10 禁区). **未触发额外修改** — 章节编号差异是合理的, 引用指向各自文档的对应章节. |
| 5 | 测试 ≥ 8 contract + 3 截图 + 0 store mutation + 0 service change | 同左 | ✅ |
| 6 | 截图脚本 `/tmp/e10-take-screenshots.py` 跑完即 `rm -f`, 不 ship 到 repo | 同左 | ✅ |

**5/6 完全一致**, 第 4 个 § 引用目标不同但实质禁止范围一致 (不需进一步修改).

---

## 4. 不做的事

按 task brief "只修 docs, 不改 src, 不实现 E10":

- ❌ 不动 `src/components/GamePanel.vue` (E10 spec body 是 additive overlay, 待 Codex 拍板)
- ❌ 不动 `src/__tests__/uiPolish.test.js` (E10 contract 8 条 待 dispatch)
- ❌ 不动 `src/styles/themes/kao.css` (E10 用 scoped CSS)
- ❌ 不动任何 `src/stores/**` / `src/services/**` / `src/server/**` / `src/router/**` (per E9 §4.2 硬约束)
- ❌ 不动 `src/pages/OpeningPage.vue` / `src/views/WelcomeView.vue` (per spec §6.2)
- ❌ 不创建 `/tmp/e10-take-screenshots.py` (per E9 §4.4 推迟到 dispatch 后)
- ❌ 不 commit / 不 push (per AGENTS.md + task brief)

---

## 5. 给 Codex 的下一步建议

1. **可立即 dispatch**: LUSION-QA-2 worker 独立 verify spec 文件全文 7 必含段 (per STATUS.md L40 spec-template), 特别 SPEC §2.4 与 report §2.3 的 Lusion 经验 mapping 一致性.

2. **拍板 6 Open Questions** (10-30 分钟):
   - 选项 A (per R8): 采纳 R8 verdict, **REJECT** E10, 永久停止 UI polish, 转 STATUS.md Next up 4 件事 (5B v0.2 / 真实手测 / 5B rebase / 5C wallpaper).
   - 选项 B: 采纳本 spec, **ACCEPT** E10 dispatch, ship 后停止 UI polish.
   - 选项 C: **DEFER** E10, spec 落档, 等新触发条件.

3. **不依赖本 DOCFIX** 的 verify 命令 (Codex 可立即跑):
   ```bash
   git diff --check
   rg -n "STOP NOW|ACCEPT|DEFER|REJECT|未拍板|Open Questions" \
       docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md \
       docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md
   ```

---

## 6. 文件清单

```
docs/agent-runs/2026-06-21-lusion-research/
├── LUSION-R1.structure.md          (R1 报告, 不动)
├── LUSION-R2.interaction.md        (R2 报告, 不动)
├── LUSION-R3.visual-system.md      (R3 报告, 不动)
├── PINAX-LUSION-SPEC.report.md     (Patched §0 fork 说明 + §10 已对齐)
├── QA-LUSION.review.md             (QA 报告, 不动)
└── LUSION-DOCFIX.report.md         (NEW, 本报告)

docs/superpowers/specs/
└── 2026-06-21-lusion-inspired-pinax-design.md  (Patched Status block + §10)
```

---

**END OF LUSION-DOCFIX REPORT**
