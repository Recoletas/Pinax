# UI-R8 — Stop or Continue 复审 (在 E6A + N6 + N6F 修完之后)

- **Author**: Claude Code (UI-R8 reviewer, read-only, 不改代码)
- **Date**: 2026-06-21
- **Status**: Review v1 (待 Codex 拍板)
- **Basis**: R7 (1a92bff 之后) → E6A + N6 + N6F 落地 → QA7 ACCEPT WITH FIXES
- **关键事实**: R7 在 E6A / N6 实施**之前**写, 现在 E6A + N6 已 ship 质量 (138/138 uiPolish + 887/887 全测 + build clean + diff clean + 5 张截图 + dark gate 通过), 改变了 R7 的判断基础

---

## 0. TL;DR (先看这里)

**Verdict: STOP NOW — 在 E6A + N6 commit 之后, 立刻停止 UI polish, 转 STATUS.md Next up 4 件事。**

3 个 1-句答案:
1. **E6A + N6 已经是本轮的结束点**, 不是 R7 预期的"ONE WRITING ROUND", 因为 E6A + N6 在 Experience + Notes 两页上**已经 ship 了"结构层"改动** (5 个 record-book 机制 + 1-3 张 pinned slips), 等于把 R7 预期的"再一轮"提前做了。Writing 那页现在做候选 C 是边际收益递减, 因为 W 已经在 R5-2 落地 cork 墙 + dossier + portrait slot 的视觉骨架, 没有未解决的"结构缺口"驱动新改动
2. **W5R 应该永久 DEFER, 不再 apply**, 因为它是减法 (188px → 64-80px + 删冗余), 不是新语言, 跟 E6A + N6 的结构突变不在同一收益级别
3. **E6B 应该取消**, 因为 E6A 已经给 Experience 落了 record-book 主体语言, E6B 改 sidebar 6-cell grid + 去 KPI 是组件级大改 (跟 1a92bff 改 GamePanel +147 行同等风险), UI-R7 已经判过 "风险高于收益"

---

## 1. Q1 — E6A + N6 是否已经足够作为本轮结束点

### 1.1 E6A + N6 真正做了什么

| Slice | 改动 | 第一眼变化 |
|---|---|---|
| **E6A** | `GamePanel.vue` ledger → record-book page: 16px body / 1.75 行高 / 11px sans meta / spine stitch 4px 装订线 / folio 页码 / 每 8 条 chapter rule / kicker block 14px 500 / 3px 角色竖条 + paper-strong 衬底 | ledger 从"屏幕聊天"变"案卷本", 5 个 record-book 机制**叠加**, 主体阅读字号 +2px |
| **N6** | `Notes.vue` 加 1-3 张 pinned slips + `useCanvasBoard` composable (170 行) + localStorage 持久化 + dark 硬化 + 移动端 stacking | 右侧 void 消失, 1-3 张可拖浮卡**填满**负空间 |
| **N6F** | QA6 3 个 blocker 全修 (msg-header right 8→4px / GamePanel comment 去 `:global(.theme-kao)` 字面量 / N5C ceiling 950→1900) | 行为层收口, 0 视觉变化 |

### 1.2 这跟 R7 说的"边际收益变小"矛盾吗?

**不矛盾**, 因为:
- R7 时点 = 1a92bff (P2 polish) 之后, working tree **没有** E6A / N6
- R7 当时评估的"4 轮 polish 收益曲线 `+++ → + → + → +`"基于 **P2 阶段的视觉** (writing-fix / notes-drawer / experience-record-book 1280 截图)
- E6A + N6 是 R7 之后**新起的两个 dispatch**, 实际是 R7 评估时**没预期到的"再一轮"**
- E6A 在 Experience 上加了 5 个 record-book 机制 (R7 候选 A/B 都没建议改 ledger 主体), N6 在 Notes 上填了右侧 void (R7 候选 A/B 是改侧栏 drawer)
- **R7 候选 C "Writing 章节侧栏卡片堆叠" 是 R7 时 plan B**, 但 E6A + N6 已经在另两页 ship 了"等量级"改动, 三页连续 ship 边际收益明显递减

### 1.3 QA7 验证质量

| 项 | 状态 |
|---|---|
| `git diff --check` | clean ✅ |
| `npm run test:run -- src/__tests__/uiPolish.test.js` | 138/138 ✅ |
| `npm run test:run` (full) | 887/887 ✅ |
| `npm run build` | clean 3.52s ✅ |
| Forbidden patterns (`:global(.theme-kao)` / `:deep()` / `!important` / raw hex) | 0 ✅ |
| 5 张截图 (E6A 2 + N6 3) | 就位 ✅ |
| N6 dark gate (html.class + localStorage 双断言) | 通过 ✅ |
| E6A ledger visual (chapter rule `卷 1 · 第 3 页` / 18+32 段) | 验证 ✅ |

**这是真 ship 质量**, 不是细节修补。

### 1.4 答案

**是的, E6A + N6 + N6F 已经足够作为本轮结束点。** 理由:

1. **结构层改动已经 ship**: record-book 5 机制 + pinned slips 是第一眼可看的变化, 跟 R7 "边际收益变小"评估的"细节修补"不是一类
2. **三页再继续 = 同质化加深**: Notes 已有 pinned slips, Experience 已有 record-book ledger, Writing 候选 C 是侧栏卡片堆叠撕角 — 都是"档案/卷宗"语言的小变形, 不是新语言
3. **QA7 已给 merge recommendation**: "ACCEPT WITH FIXES", 路径 A 推荐 1 个原子 commit, scope 完整 (4 src + 1 new + 12 docs + 5 screenshots), 不应该再扩大

---

## 2. Q2 — W5R 是下一轮唯一 UI 工作, 还是 defer

### 2.1 W5R 现状 (来自 UI-W5R-apply-or-drop.md)

- 报告 + 截图全部就位 (`UI-W5R.report.md` + `writing-w5r-{1280,empty}.png`)
- **代码改动没进 worktree**: `git diff HEAD --name-only` 中 Writing.vue 是 0 改动, kao.css 也没 W5R 的 `.wall__save-chip*`
- 当前 working tree 仍是 W2 状态 (188px cork / PROJECT · PINAX / wall__stamp 76x76 / wall__ribbon 96px)
- W5R-apply-or-drop.md 已 DEFER: "等待 N6 + E6A commit 后再考虑 apply"

### 2.2 W5R 跟 E6A + N6 不在同一收益级别

| 维度 | E6A + N6 | W5R |
|---|---|---|
| 性质 | **加法**: 5 record-book 机制 + 1-3 浮卡 | **减法**: 188px → 64-80px + 删 76x76 印章 + 删 96px 丝带 + 删 4 枚 pin label |
| 第一眼 | ledger 主体 + Notes 右侧 void, 大 | cork 墙高度 108px 缩小, 小 |
| 风险 | 138 测覆盖 + QA7 验证 | 跟 N6/E6A 同文件 (kao.css), 一起 commit 难 review |
| 解决 user 反馈 | "字体看不清" + "没有设计亮点" + "右侧空白" | "顶部冗余" + "按钮不够立体" (但 R5 已部分解决) |

### 2.3 答案

**W5R 应该永久 DEFER, 不再 apply。** 理由:

1. **R5 已部分解决 user 反馈**: 1a92bff (P2 polish) 已经把 Writing 顶部冗余的 4 个角 pin + watermark 删了, W5R 还能删的 (PROJECT · PINAX / h1 / 76x76 印章 / 96px 丝带) 是减法的二次方, 边际小
2. **W5R 解决的不是"未解决问题"**: 用户原话 "顶部冗余" 在 P2 已经"从负收益变成无干扰" (per W5R-apply-or-drop.md §2), W5R 再做是过度修正
3. **跟 E6A + N6 比收益差一个数量级**: E6A 加 5 个机制, N6 加 1-3 张浮卡 — 都是第一眼可见; W5R 只是把 cork 高度从 188 缩到 80, 第一眼只看到"顶部没那么高了", 不是新语言
4. **commit 风险**: W5R 改 kao.css 同文件 (N6 已加 67 行, E6A 0 行), atomic apply 让 commit 难 review
5. **user 决定**: QA7 §9 F2 已明确 "W5R 是否合入 (由 user 决定, 截图 + 报告已就位)", 留档即可, 不在 R8 范围内推 apply

**Trigger 触发**: 如果 user 在 E6A + N6 commit 后, **主动** 说 "Writing 顶部还是冗余" 或 "需要再薄", 再重新评估 W5R apply。否则永久 DEFER。

---

## 3. Q3 — E6B 应该取消 / 推迟 / 还是必须做

### 3.1 E6B 现状 (来自 UI-E6A.report.md §5.2 + UI-E6-implementation-plan.md)

- E6B = record-folio 3-tier hierarchy + right-rail dossier 减 KPI (即 6-cell grid → 3-tier + sidebar 去 KPI)
- 报告存在 (`UI-E6-implementation-plan.md` 40 KB)
- **代码改动没进 worktree**: `git diff HEAD --name-only` 中 Experience.vue 是 0 改动, 仍是 E4 baseline
- E6A 报告明确: "E6B 已 parallel ship, 本轮未参与" — 但 grep 实际**没 ship**, E6A §1.1 "0 改动 src/pages/Experience.vue"

### 3.2 E6B 跟 E6A 的关系

| 维度 | E6A | E6B |
|---|---|---|
| 范围 | **中央 ledger** (`GamePanel.vue`) | **侧栏 record-folio + 右栏 dossier** (`Experience.vue`) |
| 性质 | 主体语言 (record-book page) | 容器减重 (3-tier + 去 KPI) |
| 第一眼变化 | 5 个 record-book 机制叠加, 大 | sidebar 减密度, 中 |
| 风险 | 138 测覆盖 + QA7 验证 | UI-R7 标记 "GeographyPanel 改 SVG 化 = 改技术栈, 1-2 天工作量 + 高风险" |

### 3.3 答案

**E6B 应该取消 (无限推迟, 任何形式 polish 都不做)。** 理由:

1. **E6A 已经给 Experience 落了 record-book 主体语言** (5 个机制), E6B 改 sidebar 是同一语言的同质化加深, 不是新语言
2. **R7 已经判过**: "GeographyPanel 改造风险高 (改技术栈), InputArea 改造中等。两者都有 P1 已知 follow-up, 但那些 follow-up 是'组件内部一致性', 不是'新视觉'"
3. **E6B 改 1 组件 + kao.css ~150 行**, 跟 1a92bff 改 GamePanel +147 行同等量级, 已经踩过 1 次风险
4. **R7 §1.4 已识别 Experience 饱和**: "E4 (P2) GamePanel 改 record-book page... 已经到顶; 右侧 world dossier 跟中央 record-book 同质化"
5. **产品流价值更高**: STATUS.md Next up 4 件事 (5B v0.2 / 立体感 plan / AppShell chrome / runtime 收口 / 真手测) 比 E6B 高

**Trigger 触发**: 如果 user 明确说 "Experience sidebar 还是 dashboard 网格感" + 主动要求, 重新评估 E6B 单独立项。否则永久取消。

---

## 4. Q4 — 下一步是否转向内容 / 真实手测 / 5B v0.2, 而不是继续 UI

### 4.1 STATUS.md Next up 5 件事 (per L97-104)

| # | 任务 | 状态 | 价值 |
|---|---|---|---|
| 1 | **5B v0.2 user 手画终稿覆写 v0.1 micu 占位** | 等 user, briefs 就位 | 第一眼变化 +++++ (整个右侧 portrait slot 从灰色人变真立绘) |
| 2 | **5A PR merge → 5b rebase** | 等 user 决定合 PR, technical 操作 | 解锁 5B 工作流 |
| 3 | **UI shell Phase 1B**: WelcomeView kao 档案册首页 + AppShell chrome | spec 就位, 未实施 | 系统级 chrome 收口 |
| 4 | **Runtime skeleton Stage 3a/3b/4 收口**: trigger / 剧情日志 / live demo | 实施中 | 工程流质量 |
| 5 | **Content/demo 真手测**: 边境王国 · 雾潮暮湾 10-15 分钟真实手测 | **7 天没真手测** (per STATUS L102) | 内容反馈闭环 |

### 4.2 为什么产品流价值高于 UI 第 5 轮

| 维度 | UI 第 5 轮 (Writing 候选 C / E6B / W5R) | 产品流 4 件事 |
|---|---|---|
| 价值 | 边际收益递减, 同质化加深 | 4 件都是新价值 (5B = 立绘 / 立体感 plan = 产品流 / chrome = 系统 / runtime = 工程) |
| 时间 | 2-3 天 × 1 件事 (CodingAgent 成本) | 5-7 天 × 4 件事 (含 user 行为 5B) |
| 风险 | 中 (组件级大改 / kao.css 叠加) | 低 (R8 不涉及 UI 大改) |
| 用户感受 | "视觉变化不大" 持续 | "产品进了一步" |
| 信任透支 | 高 (第 5 轮 = 知道收益小还做) | 低 (新方向 = 信任注入) |

### 4.3 答案

**是的, 下一步应该转向内容 / 真实手测 / 5B v0.2, 而不是继续 UI。** 理由:

1. **用户原话 "最近视觉变化不大" 是 honest signal**: 4 轮 polish 后已经察觉到边际收益, 第 5 轮 = 信任透支
2. **7 天没真手测**: STATUS.md L102 明确 "边境王国 · 雾潮暮湾 7 天没真手测", 这是最严重的"已知未做"
3. **5B v0.2 是 user 行为驱动**: 不在 worker 控制下, 不阻塞 worker 排期
4. **产品流 4 件事 = 4 个新价值**: 立体感 plan doc / AppShell chrome / runtime 收口 / 真手测, 每一件都是 5-10× 价值于一轮 UI polish
5. **AGENTS.md "Branch model"**: Phase 1B 路径明确 "WelcomeView → AppShell → Phase 1C 三页在场感", 立体感/真手测属于主线, UI polish 属于支线
6. **CodingAgent 编排原则**: "Optimize for quality, not token cost" — 不是说把所有 token 都花在 UI polish, 是说每个方向要花够; UI polish 已经花了 4 轮, 产品流 0 轮

---

## 5. Q5 — 明确建议

# **STOP NOW — 在 E6A + N6 commit 之后, 立刻停止 UI polish**

### 5.1 立即执行 (本 session)

1. **Commit E6A + N6** 按 QA7 §8 路径 A 推荐: 1 个原子 commit `style(pages): ship E6A record-book messages + N6 pinned slips`, scope = 4 src + 1 new composable + 12 docs + 5 screenshots
2. **不 commit W5R**: W5R 是 deferred patch, 不在本次 commit scope
3. **不 commit GamePanel uncommitted diff** — 等等, GamePanel 已经被 E6A commit 包含进去了 (E6A 改的就是 GamePanel.vue +212/-190), 没问题
4. **update STATUS.md**: 把 E6A + N6 ship 写入 Recently done, Next up 调整为产品流 4 件事

### 5.2 不再做的事 (本轮 + 后续)

| 不做 | 原因 |
|---|---|
| **Writing 候选 C** (R7 建议) | E6A + N6 已经 ship 等量级改动, 再做 = 同质化; 第一眼收益低于 E6A/N6 |
| **W5R apply** | 减法收益, 已 DEFER; user 不主动提就永久 DEFER |
| **E6B** | 组件级大改, 风险高于收益; user 不主动提就永久取消 |
| **任何 UI polish P3 微调** | "微调" 是 R7 §2 列出的不做项, 包括 focus ring / 字号 / color-mix / 撕角 SVG / hover state |
| **新增 contract 5/10/20 条** | 测试覆盖不是用户看的 |
| **暗态 box-shadow 数值微调** | 用户不会逐像素对比 |

### 5.3 转向 (下个 dispatch)

按优先级:
1. **真手测** (STATUS L102 已知 7 天没做) — 跑 `边境王国 · 雾潮暮湾` 10-15 分钟, 补 content patch + demo case + 分镜节点
2. **5B v0.2** (等 user 手画) — briefs 就位, 等 user 丢图到 inbox
3. **立体感 v5 plan doc 落地** — spec 已写, 落 plan + 排 Phase 1B WelcomeView
4. **AppShell chrome 统一** — Phase 1B 第 2 步
5. **Runtime skeleton Stage 3a/3b/4 收口** — 工程流, 不与 1-4 冲突可并行

---

## 6. 为什么 R7 "ONE WRITING ROUND" 在 R8 不再适用

| 维度 | R7 时点 (1a92bff 之后) | R8 时点 (E6A + N6 + N6F 之后) |
|---|---|---|
| Working tree | 仅 N6 uncommitted (10:49 前) | E6A + N6 + N6F 全 ship, QA7 ACCEPT |
| R7 评估的"4 轮轨迹" | `+++ → + → + → +` | R7 没把 E6A + N6 算进轨迹 |
| 实际收益曲线 | R7 看到的是 4 轮 polish | R8 看到的是 4 轮 polish + 1 轮 E6A+N6 (结构突变 +) |
| R7 候选 C 必要性 | Writing 仍是 "cork + dossier + portrait" 视觉骨架, 缺 "环境叙事" | Writing 已经稳, 候选 C 是 "侧栏卡片堆叠撕角", 跟 Notes 撕角语言重复 |
| R7 候选 A (5B v0.2) | 等 user | 仍等 user, 不在 worker 控制下 |
| R7 候选 B (cork 挂大图) | 依赖 5B v0.2 | 仍依赖 5B v0.2 |

**关键变化**: R7 时点, Experience / Notes 都没结构突变, 所以 R7 建议 "ONE WRITING ROUND 候选 C"; R8 时点, Experience + Notes 都已经 ship 结构突变 (E6A + N6), 等于把 R7 预期的"再一轮"提前做了, Writing 现在做候选 C 是 "再再一轮", 边际收益最低。

**不是 R7 错**, 而是 R7 没预料到 E6A + N6 会在 R7 之后 ship。这是事实变化, 不是判断变化。

---

## 7. 反向 sanity check (如果这判断错了)

### 7.1 反方观点: "E6A + N6 还没 commit, 不能算本轮结束"

**回应**: E6A + N6 在 working tree 已经在状态 ✅, QA7 给的 "ACCEPT WITH FIXES", 1 个原子 commit 即可落地 (per QA7 §8 路径 A)。本 session 应执行 commit, 然后按 R8 §5.3 转向。

### 7.2 反方观点: "R7 候选 C 第一眼可看, 应该做完"

**回应**: 候选 C 是 "章节侧栏卡片堆叠撕角", 跟 Notes pinned slip + Experience ledger chapter rule 是同语言再变形, 不是新语言。第一眼"可看"≠第一眼"新"。E6A + N6 已经 ship 5+1 个新机制, Writing 候选 C 加 1 个堆叠撕角 = 边际 < 5%。

### 7.3 反方观点: "E6B 是 E6A 的姐妹切片, 应该一起做"

**回应**: E6A 是 ledger 主体语言, E6B 是 sidebar 容器减重, 不是 "姐妹", 是 "父 + 装饰"。父已经在, 装饰可以省略 (record-book 主体语言成立即可)。R7 §1.4 已判 "Experience 视觉已经饱和"。

### 7.4 反方观点: "W5R 截图就在, 不 apply 浪费"

**回应**: W5R 报告 + 截图保留作 design history (跟 W5 旧截图 `writing-fix-*.png` 已留档同理)。W5R 不 apply 不等于"没用", 等于"暂不 ship"。当 user 主动提反馈再评估。

### 7.5 反方观点: "现在 STOP 是不是偷懒"

**回应**: 不是偷懒, 是尊重用户原话 "视觉变化不大" + STATUS.md Next up 4 件事积压 7 天 + 真手测积压 7 天。**CodingAgent 价值 = 判断哪些**不**做**, 不是把所有"可做的"都做了。

---

## 8. 给 Codex 主控的 5 件事 checklist

1. **合并 E6A + N6** 按 QA7 §8 路径 A 推荐 1 个原子 commit (建议 message: `style(pages): ship E6A record-book messages + N6 pinned slips`)
2. **更新 STATUS.md**:
   - Recently done 加 E6A + N6 + N6F entry
   - Next up 调整: 移除 "三页 next aesthetic polish", 加重真手测 / 5B v0.2 / 立体感 plan / AppShell chrome / runtime 收口
3. **W5R 维持 DEFER** (不 apply, 不删, 留作 design history)
4. **E6B 维持 cancel** (不实施, 不在 polish scope)
5. **派下一个 dispatch**: 真手测 (优先级 1), 因为积压 7 天最长

---

## 9. 关键文件路径

- 本文件: `docs/agent-runs/2026-06-21-ui-fix/UI-R8-stop-continue.md`
- 上游评审: `UI-R7-visual-direction-review.md` (R8 改写 R7 结论, 因 E6A + N6 已 ship)
- 上游评审: `UI-W5R-apply-or-drop.md` (W5R DEFER, R8 升级为永久 DEFER)
- ship 报告: `UI-E6A.report.md` + `UI-N6.report.md` + `UI-SHOT6.report.md` + `UI-QA6.review.md` + `UI-QA7.review.md`
- 当前 working tree 状态: `git status` 显示 4 src + 1 new + 12 docs + 5 screenshots
- 上下文: `docs/STATUS.md` L52-56 (P2 polish handoff) + L93-104 (Next up 4 件事)
- 项目规则: `AGENTS.md` Hard rules (ui-style-check / testing-verification / commit-conventions / docs-status-handoff)

---

**END OF UI-R8 REVIEW**