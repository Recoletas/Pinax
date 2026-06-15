# Agent Workflow Velocity — Verify / Skeleton / Skill Hygiene / 6-Stage Workflow

**Date**: 2026-06-15
**Status**: Draft v3 (pending review; v3 = v2 + 2 review passes: title-block convention fix, 设想 mixed trigger, soft lock clarification, R5/R12 校正, plan 文件澄清, commit scope 修正)
**Stage**: 方案 (this spec sits at 方案 level in the 6-stage chain — see §Self-Application)
**Branch base**: `wip/map-realism-render-docs-20260608` (current)
**Related**:
- `2026-06-08-internal-agent-workflow-design.md`（原 agent 基础设施 spec；本文是其 follow-up）
- `AGENTS.md` / `docs/STATUS.md` / `docs/plan/README.md` / `docs/superpowers/README.md`（本文改 / 引用的 4 个项目级 doc）
- 6 阶段框架综合：设想/规划/计划/重点/安排/方案（公文体 5 段 + 重点横切），见 §Context §2

---

## 重点

> **本段自示范 G9**（每个 spec/plan 顶部必含 1-3 句成功标准）。agent 改动本 spec 任何一段前，先回看这 3 句。

1. **结构化减负**：把验证链、跨 doc 一致、阶段判断、节奏判断四类高频手写动作，从 agent 记忆转成结构化输入（`verify:contract`/`verify:full` 分档、frontmatter `stage:` 标签、spec 顶部 `## 重点` 段、`docs/superpowers/specs/README.md` 转换门禁）；agent 起手不再靠猜。
2. **不破 7-skill 体系**：7/7 仍 cap，6 阶段框架**不**引入新 skill；所有改动 1-2 行级；frontmatter `description:` trigger 不动；`AGENTS.md` §Hard rules 主表 6 个 trigger → skill 对应关系不动。
3. **单 PR 单 commit ship gate**：全部改动落 9 文件（v1 7 + v2 新增 1 个 `docs/templates/spec-template.md` + 1 个 `docs/superpowers/specs/README.md`）；`verify:full` 仍绿；`uiPolish` (39) + `welcomeView` (4) + `workbenchNav` (2) 契约不退；执行完跑 4 个 triggered skill。

---

## Context

### §1 现状审计（v1 数据）

`AGENTS.md` (2026-06-08) 第一版铺好 7 skill + shim + STATUS + LOCAL。审计这层设施时发现，agent 仍觉得"workflow 不够自动智能" — 根因不是 skill 没用，是 **"该结构化的事"还压在 agent 记忆和手写纪律上**。

| # | 现状 | 痛点量化 |
|---|---|---|
| A | `package.json:17` `verify = test:run && build` | ~25 handoff 实际跑 7 个命令的子集，每次手抄；用户两次说"不要跑那么多验证"，~7/25 是 contract-only |
| B | 8 篇 research doc 骨架 6/8 不带 TL;DR | 5/8 推荐段形态分裂（Copy+Avoid / Recommendation / Tier 1-4） |
| E1 | `worldbook-workflow` skill ↔ guide drift | 2 个 phantom surface + 1 个 missing 段（同名冲突策略） |
| E2 | `AGENTS.md` discovery paths 缺 3 项 | 实际 6 个 discovery 点，文档列 4 个 |
| E3 | `commit-conventions` step 4 ↔ `testing-verification` step 1 重叠 | 同一 `test:run` 被两 skill 各自要求 |
| E4 | `AGENTS.md` L17 First action 脆弱 | "If available" 无检测，agent 靠猜 |
| F | subagent 评审数 4/8/12，spec 版本 1-5 | 样本 4 例 subagent、2 例多版本 spec，**数据不够定硬上限** |

### §2 6 阶段框架（v2 新增）

公文体 / PMBOK / Shape Up / KEP / Google Design Doc 全部同构 6 段（中文叫法不同）：

| # | 阶段 | 抽象层级 | 时间尺度 | 公文标志词 | 主体 | PMBOK 7e | KEP |
|---|---|---|---|---|---|---|---|
| 1 | **设想** | 愿景 | ≥ 10y | "…的初步设想 / 战略设想" | 领导层 | Vision | Motivation |
| 2 | **规划** | 战略 | 3-10y | "…规划纲要 / 总体规划" | 决策层 | Portfolio Plan | — |
| 3 | **方案** | 执行 | 项目期 | "…实施方案 / …技术方案" | 执行层 | Requirements Plan | **Proposal (KEP body)** |
| 4 | **计划** | 战术 | 季/年 | "…年度计划 / …工作计划" | 管理层 | PM Plan | Implementation |
| 5 | **重点** | **横切** | 时间无关 | "重点任务 / 重点项目" | 决策层 | Success Metrics | **Graduation Criteria** |
| 6 | **安排** | 操作 | 日/周 | "…安排 / …部署" | 操作层 | Schedule | Test Plan |

**关键洞见**：`重点` 不是第 5 阶段，是**横切**于 规划/计划 之间的"选择过滤器" — 中庸"博学→审问→慎思→明辨→笃行"五步 = 博学(设想+规划) → **审问(重点)** → 慎思(方案) → 明辨(方案→计划) → 笃行(安排)。**每个有完整流程的项目都有这 6 段**，叫法不同但结构同构。

**两个值得抄的样板**：
- **KEP (K8s)**: 每份 proposal 自带"Graduation Criteria"（alpha → beta → GA），把重点内嵌进 spec 不再单独维护。
- **Shape Up (Basecamp)**: 显式砍掉 sprint plan，把 计划+安排 压成一份 scope+hill chart。

### §3 当前项目映射（v2 新增）

| 6 阶段 | 项目现有 artifact | 标记 | 评价 |
|---|---|---|---|
| 1 设想 | `docs/plan/character-driven-arc.md` + `kao-ui-direction.md` | **未标记** | 内容对，但 agent 不知道这是"设想" |
| 2 规划 | `docs/PLAN.md` | **未标记** | 内容对，但和 research docs 混在 `docs/plan/` 下 |
| 3 方案 | `docs/superpowers/specs/YYYY-MM-DD-*-design.md` | **半对** | 文件名 -design 暗示"方案"，但 body 500+ 行混了方案+计划+重点 |
| 4 计划 | `docs/superpowers/plans/YYYY-MM-DD-*.md` | **半对** | 文件名暗示"计划"，但 body 也混了方案元素 |
| 5 重点 | 散落在各 doc 顶部 / 软锁表 | **未结构化** | 6/8 research docs 无 TL;DR；spec 软锁表 ≠ 重点（重点=成功标准，软锁=不退化） |
| 6 安排 | `docs/STATUS.md` + `docs/LOG.md` | **半对** | 安排 + handoff history 混在一起；多 agent 安排（谁 / 哪个 worktree）只是 implicit in branch name |

### §4 合并后的 gap 清单

| # | Gap | 解决（对应 Goal） |
|---|---|---|
| G-A 验证链手抄 | A 类 | G1, G2 |
| G-B research 骨架分裂 | B 类 | G3 |
| G-E1 skill ↔ guide drift | E 类 | G4 |
| G-E2 discovery paths 缺 3 项 | E 类 | G5 |
| G-E3 触发重叠 | E 类 | G6 |
| G-E4 First action 脆弱 | E 类 | G7 |
| G-F 节奏信号缺失 | F 类 | G8 |
| **G-6.1 spec 顶部无 重点** | 6 阶段 | G9 |
| **G-6.2 doc 阶段标签缺失** | 6 阶段 | G10 |
| **G-6.3 设想 阶段缺失** | 6 阶段 | G11 |
| **G-6.4 安排 doc 缺失** | 6 阶段 | G12 |
| **G-6.5 spec→plan 转换门禁缺失** | 6 阶段 | G13 |
| **G-6.6 spec 体例未自示范** | 6 阶段 | G14（自示范） |

**显式不做**（用户 2026-06-15 拍板）：
- C 类（STATUS.md 改 YAML source-of-truth）— 等 hooks 验证完
- D 类（PreToolUse hook 自动化 hard rules）— 审计后 marginal value
- 强制拆 spec 为方案+计划两份（O3）— 风险大，**新 feature opt-in**
- 强制所有 feature 立项前写 设想（O4）— **仅 v3+ multi-version spec 触发**
- 新增 skill（cap=7）

---

## Goals（14 个 = 8 旧 + 6 新）

### A. 验证链结构化
1. **`verify` 脚本分档**：`verify:contract`（test:run -- paths + build + diff --check） / `verify:full`（test:run + build + diff --check + docs:build + visual） / `verify` = `verify:full` 兼容默认。Agent 按改动范围选档，**强制尊重**"不要跑那么多验证"约束。
2. **`testing-verification` skill 同步**：把"跑 X / Y / Z"那一步改成"按 scope 选 `verify:contract` 或 `verify:full`，贴该档的 summary 一行"。

### B. Research 骨架
3. **Research doc 5 段写作约定**：在 `docs/plan/README.md` 末尾加 5 条约束：preamble / TL;DR / 候选矩阵 / Pinax Recommendation / Sources；统一 Recommendation 子标题为 `### N.1 Copy / ### N.2 Avoid / ### N.3 Open questions`。**不**改造前 6 篇，新写必套。

### E. Skill / AGENTS 卫生
4. **Skill ↔ guide 对齐**：`worldbook-workflow` skill 删 2 个 phantom surface（context injection / structured settings），补 guide §3 同名冲突策略的引用。
5. **`AGENTS.md` discovery paths 补 2 条**：`.superpowers/brainstorm/`（项目内 brainstorm scratch，不是 skill）+ `.claude/settings.json` 里 `enabledPlugins: {superpowers, context7}` 是真正生效的 plugin 入口。
6. **触发重叠去重**：`commit-conventions` step 4 改成"确认 `testing-verification` 已在本 session 跑过"，不再重复 `test:run` 命令。
7. **First action fallback 明示**：`AGENTS.md` L17 加一句"如果 Claude plugin 和 Codex global skill 都不可用，第一条回复显式说明"。

### F. 节奏 soft 信号
8. **Soft 节奏信号**：`commit-conventions` 加 1 行 soft 警告（≥3 不相关顶层目录时自问能否拆 commit）；`docs/superpowers/README.md` 加经验值段（<3 subagent = 不够，>8 = 信号 spec 本身有问题）。

### 6 阶段落地（v2 新增）
9. **spec 顶部 重点 段**：每个 spec/plan 顶部、`## Context` 之前，必含 1-3 句成功标准（**不**是 1 段散文）。模板固化在 `docs/templates/spec-template.md`（新建）。**自示范**：本 spec 顶部已有 `## 重点` 段（见顶部）。
10. **`Stage:` 标签**（title-block 风格，匹配现有 spec 约定 — 见 `2026-06-15-stereo-migration-design.md` metadata 块）：每个 spec/plan 顶部 metadata 块加 `**Stage**: 设想|规划|方案|计划|重点|安排` 6 取 1；agent 起手 `grep -rE "^\*\*Stage\*\*:" docs/` 即可见项目 6 阶段全景。本 spec 自标 `Stage: 方案`（见 metadata）。
11. **设想 阶段触发条件**（混合策略）：
    - **事后补救**（默认）：spec 走到 v3+ multi-version 时，在 spec 顶部加 1 页 `## 设想` 段（≤ 200 字，回答 3 问：5-10 年后长什么样 / 用户为什么在乎 / 不做的代价）。承认 v1→v2→v3 期间已付出代价。
    - **事前 opt-in**（建议）：新 feature 立项前若符合以下任一条件，主动写 1 页 `## 设想` 段：
      - spec scope 横跨 ≥ 3 个不相关顶层目录（如同时 `src/views/` + `src/stores/` + `docs/`）
      - 涉及 5B 类外部资产生产（image_generate / image_edit 等 6+ call）
      - user 显式要求"先聊一下"
    - **不**强制所有 feature 立项前都写（避免 trivial polish 拖慢）。
12. **安排 段从 STATUS 拆出或显式段**：`docs/STATUS.md` 顶部加 `## 当前安排` 段，明示 owner / worktree / branch / deadline 4 字段；不动 4 段主结构（In flight / Blocked / Recently done / Next up）。
13. **spec → plan 转换门禁**：`docs/superpowers/specs/README.md`（新建）加 1 段 "spec → plan 转换门禁 checklist"，6 条：(a) metadata 块有 `**Stage**:` 标签（spec/plan 取对应阶段）；(b) 重点 是 1-3 句成功标准；(c) Context / Goals / Non-Goals / Approach / Architecture 5 段都答完；(d) Non-Goals ≥ 3 条；(e) Self-Application 明示上下游；(f) Risks ≥ 1 行 mitigation。不通过就回 spec 改。
14. **本 spec 自身用 6 阶段框架结构化（自示范）**：本 spec 在 §Self-Application 明示自己在 6 阶段链中的位置（见 §Self-Application）。

---

## Non-Goals

- 不动 7 个 skill 之外的任何 agent 基础设施
- 不新增 skill（cap=7）
- 不引入 hooks / 自动脚本调度 / git hook / pre-commit 工具
- 不动 `docs/STATUS.md` 的 4 段主结构
- 不动 `docs/PLAN.md` / `docs/LOG.md` 的现有结构
- 不做"用 `marked` / YAML 渲染 STATUS.md"的 C 类工作
- 不强制改造前 6 篇 research doc
- 不动 `docs/superpowers/specs/` 下 9 份历史 spec / 6 份 plan
- 不动 9 份历史 spec/plan 的 frontmatter（即使是"补 stage 标签"也不回溯）
- 不改 `ui-style-check` skill（最大那个，6019 bytes，独立 PR）
- 不强制拆 spec 为方案+计划两份（新 feature opt-in 即可）
- 不强制所有 feature 立项前写 设想
- 不引入 `commitlint` / `husky` / `lefthook` 等新依赖
- 不动 `LOCAL.md`（user-only 写入）

---

## Approach

**单 PR，1 commit**（per `commit-conventions` rule 5）。改动 9 个文件（v1 7 + v2 新增 1 个 `docs/templates/spec-template.md` + 1 个 `docs/superpowers/specs/README.md`），全部 1-2 行级。

**6 阶段框架作为元方法**嵌入 4 类旧改动：

| 旧改动 | 在 6 阶段链中的位置 |
|---|---|
| A (verify 分档) | 影响 计划 + 安排 阶段的执行（用对档） |
| B (research 骨架) | 影响 设想 阶段的产物（research = 设想 的实例） |
| E (skill hygiene) | 影响 方案 阶段的产物（skill = 方案 的子集） |
| F (soft cadence) | 影响 重点 阶段的产物（cadence = 重点 在时间维度的应用） |
| 6 阶段框架本身 | 影响所有阶段的**结构**（标签 + 重点 + 门禁） |

**无 contract 测试新增**（理由同 v1：没新组件 / 新接口需要 lock；改动是结构化输入而非行为契约）。

---

## Architecture

### 改动文件清单（v2 共 9 文件）

| # | 文件 | 改动类型 | 关联 Goal | 新 / 改 |
|---|---|---|---|---|
| 1 | `package.json` | scripts 扩 2 行 + verify 默认值重定向 | G1 | 改 |
| 2 | `agent-skills/testing-verification/SKILL.md` | body step 1-3 措辞改"按 scope 选档" | G2 | 改 |
| 3 | `agent-skills/worldbook-workflow/SKILL.md` | body step 2 改 5 surface → 3 surface + step 3.5 | G4 | 改 |
| 4 | `AGENTS.md` | §Skill discovery paths 补 2 条 + §First action step 1 fallback | G5, G7 | 改 |
| 5 | `agent-skills/commit-conventions/SKILL.md` | body step 4 触发重叠 + step 6 soft 警告 | G6, G8 | 改 |
| 6 | `docs/plan/README.md` | 末尾加 5 条 "研究文档写作约定" 段 | G3 | 改 |
| 7 | `docs/superpowers/README.md` | §使用规则 后插 "spec/plan 节奏经验" 段 | G8 | 改 |
| 8 | `docs/templates/spec-template.md` | **新建**：spec/plan 必含 10 段模板（其中 7 段必含：重点 / Context / Goals / Non-Goals / Approach / Architecture / Self-Application + metadata 块 + Out of scope + Risks） | G9, G10 | 新 |
| 9 | `docs/superpowers/specs/README.md` | **新建**：spec 目录自述 + spec→plan 转换门禁 checklist | G13 | 新 |

不删任何文件。

### 9 个文件的 frontmatter 改动

按 G10 阶段标签原则，下列 doc 在**未来**（本 spec 实施完成 + 新 spec/plan 落地时）应加 `stage:` 标签。**本 spec 自身**已加：

| 文件 | 应加 stage | 备注 |
|---|---|---|
| **本 spec（自身）** | `stage: 方案` | **本 spec 顶部已加**（见 metadata） |
| `docs/PLAN.md` | `stage: 规划` | 由本 spec 不动（Non-Goal）；未来 G14 类 spec 改造时再加 |
| `docs/plan/character-driven-arc.md` | `stage: 设想` | 由本 spec 不动；同上 |
| `docs/plan/kao-ui-direction.md` | `stage: 设想`（视觉执行层子设想） | 同上 |
| 8 篇 research doc | `stage: 设想`（每篇） | 由本 spec 不动；新写 research 必加（template G3 + G10 联合约束） |
| 9 份历史 spec | `stage: 方案` | **不**回溯（Non-Goal） |
| 6 份历史 plan | `stage: 计划` | **不**回溯（Non-Goal） |
| `docs/STATUS.md` | `stage: 安排`（混合） | 由本 spec 不动；G12 加 `## 当前安排` 段时不加 stage 标签 |
| 7 份 `agent-skills/*/SKILL.md` | （无 stage — skill 是工具，不是 stage 产物） | 不加 |

**关键设计点**：frontmatter 阶段标签**只**对未来新写 / 新落地的 doc 强制；本 spec 实施过程**不**回溯改 15+ 历史文件（Non-Goal）。模板（文件 8）固化要求"新写 spec/plan 必带 stage + 重点"。

---

## Component changes

### 1. `package.json`

| 位置 | 现状 | 改后 |
|---|---|---|
| L17 | `"verify": "npm run test:run && npm run build"` | `"verify": "npm run verify:full"` |
| L17 后插入 | — | `"verify:contract": "vitest run -- && vite build && git diff --check"` |
| L17 后插入 | — | `"verify:full": "vitest run && vite build && git diff --check && vitepress build docs/src && vitest run src/__tests__/visual-verification.test.js"` |

**`verify` 默认改向 `verify:full`**：`npm run verify` 调用强度升级（test:run + build + diff:check + docs:build + visual），`&&` 短路让不可达子步不掩盖。**新增 `verify:contract`**：承载用户 "不要跑那么多验证" 约束。`vitest run --` 后接 paths 由 agent 在命令行追加（`-- src/__tests__/uiPolish.test.js`）。

### 2. `agent-skills/testing-verification/SKILL.md`

| 位置 | 现状 | 改后 |
|---|---|---|
| L10-11 | "1. Run `npm run test:run` and confirm exit code 0.\n2. Run `npm run build` and confirm exit code 0." | "1. 按改动范围选 verify 档：纯代码契约 → `npm run verify:contract -- <contract-paths>`；含文档 / 视觉 → `npm run verify:full`。`npm run verify` 走 full 档。\n2. 确认 exit code 0 + 贴该档的 summary 一行（如 `verify:full: 87 files / 619 tests / build OK / diff clean / docs OK / visual OK`）。" |
| L12 | "3. If UI changed, run the visual snapshot tests..." | "3. **跳过**（已并入 `verify:full` 的 visual 子步）。" |
| L13 | "4. State the verification commands and their results..." | （保留，措辞不动） |

**summary 格式约定**（agent 自填到 STATUS / LOG handoff）：
- `verify:contract` 成功: `verify:contract: <files> / <tests> / build OK / diff clean`
- `verify:full` 成功: `verify:full: <files> / <tests> / build OK / diff clean / docs OK / visual OK`
- 任一失败: `verify:full: FAIL at <step>: <error 1 line>`

### 3. `agent-skills/worldbook-workflow/SKILL.md`

| 位置 | 现状 | 改后 |
|---|---|---|
| L11 | "2. **Classify the surface** of the change: quick import / advanced editor / SillyTavern import-export / context injection / structured settings." | "2. **Classify the surface** of the change: quick import (`/experience/worldbook` 普通入口) / advanced editor (`/experience/worldbook/advanced` 高级设置) / SillyTavern import-export. 注：`context injection` / `structured settings` 是 guide §4 / §5 内部的子概念，不是独立 surface。" |
| L13 后插入 | — | "3.5. **同名冲突策略**（guide §3）：替换 / 重命名 / 同名新建三选一时必须显式选，禁止默认行为；覆盖前显示现有 vs 导入的条目数变化。" |

### 4. `AGENTS.md`

#### 4a. §Skill discovery paths 补 2 条

| 位置 | 现状 | 改后 |
|---|---|---|
| L56-58 | 3 条 path | + 2 条新 path：Codex global (`~/.codex/skills/`) + 项目内 scratch (`.superpowers/brainstorm/`，**不是** skill)；加 1 条 plugin 入口说明（`.claude/settings.json` 之前完全没提） |

#### 4b. §First action step 1 加 fallback

| 位置 | 现状 | 改后 |
|---|---|---|
| L17 | "1. If available, invoke \`superpowers:using-superpowers\`..." | "1. Try to invoke \`superpowers:using-superpowers\` (Claude plugin name) or \`using-superpowers\` (Codex global skill name). **如果两者都不可用，第一条回复里显式说**"superpowers 套件不可用，本 session 按裸 `AGENTS.md` 流程执行"。" |
| L21 | "If a required tool/skill is unavailable, say so briefly and continue with the remaining steps." | （保留，不重复） |

### 5. `agent-skills/commit-conventions/SKILL.md`

| 位置 | 现状 | 改后 |
|---|---|---|
| L13 | "4. Verify \`npm run test:run\` passes locally for the staged scope..." | "4. 确认 \`testing-verification\` skill 已在**本 session**跑过（harness 自查 handoff 历史 / 或显式调用）。如果 staged scope 是纯文档 / 纯 spec / 纯非运行时代码（无 vitest 覆盖），可豁免但**必须**在 commit message 末尾加一行 \`(skip test:run — <reason>)\`。" |
| L14 后插入 | — | "6. **Soft 警告**（不强制）：如果 \`git diff --staged --stat\` 显示 ≥ 3 个不相关顶层目录（如同时 \`src/\` + \`docs/\` + \`agent-skills/\`），停下来自问：能否按 concern 拆成多个 commit？本项目最近 50 commit 审计显示 5/50 (10%) 是 mega-completion rollup，多数本可拆。拆不开时记得在 commit body 解释"为何合一"。" |

### 6. `docs/plan/README.md`

在末尾"## 使用规则"段**后**插入：

```markdown
## 研究文档写作约定

> 本节约束 `docs/plan/*-research-*.md` 的骨架。已有 8 篇不强制改造，新写的研究 doc 必套。

新写 research doc 时必含 5 段，按顺序：

1. **Preamble / 工具声明**（开头）— 显式说明本 session 可用工具（Firecrawl / WebSearch / WebFetch / Context7 / curl），缺失的工具要写"n/a — <reason>"，不写"未跑通"这种模糊话。
2. **TL;DR / 结论先行**（preamble 之后，正文之前）— ≤ 200 字，含 3 件事：候选范围、推荐对象、推荐理由。**不**是详细论证，是给读者 30 秒拿到 punchline。
3. **候选矩阵**（`## 1. <Matrix>` 第一节）— 一张主比较表，列含 name / 关键 feature / 维护状态 / 与 Pinax 当前栈的契合度。表后跟 1-2 段解释不直白看表的隐含 trade-off。
4. **Pinax Recommendation**（正文倒数第二节）— 子标题统一为：
   - `### N.1 Copy` — 应借鉴的具体模式
   - `### N.2 Avoid` — 应避开的反模式
   - `### N.3 Open questions` — 没解决、留给后续调研的问题
5. **Sources**（末尾）— 引用列表，含 source type（canonical docs / blog / demo / curl-only）和访问日期。

不强制：表格 / 章节深度 / 候选数量（按需展开）。但 5 段顺序不能换。
```

### 7. `docs/superpowers/README.md`

在"## 使用规则"段**后**插入：

```markdown
## spec / plan 节奏经验（不强制，仅参考）

> 本节是过去 9 份 spec / 6 份 plan 的观察值，样本小，**不**作为硬规则。

- **Spec 版本数**：6/9 spec 1 版过；2/9 (pass2 / stereo-migration) 走了 3+ 版。**>3 版**通常是 spec scope 过大或 user 视角有未对齐的硬约束，建议停下来重新定义 scope。
- **Subagent 评审数**：样本 4 例，最少 4 最多 12，中位 8。**<3** 通常不够（漏边缘 case / 代码 / 架构任一视角）；**>8** 是信号 — 要么 spec 本身模糊需要重新对齐，要么评审维度重叠。
- **Plan 存在与 feature 复杂度的关系**：multi-pass UI 重设计都有 plan；single-pass polish 无 plan。**复杂度跟踪**不是覆盖率，强行写 plan for trivial 反而拖慢。
- **修/改 commit 比例**：近 30 commit 是 17:12（1.42）— 返工 > 新功能。立体感迁移 v1→v5 期间 6/12 是 review-iteration docs。这是 spec 多版的合理代价，**不**是失败信号。
- **Per-feature commit**：5/50 (10%) 是 mega-completion（>20 文件）。`commit-conventions` skill 已有 soft 警告"≥3 不相关顶层目录"自问能否拆，不设硬规则。
```

### 8. `docs/templates/spec-template.md`（新建）

```markdown
# Spec / Plan Template (Pinax)

> **本模板用 6 阶段框架**（设想/规划/方案/计划/重点/安排）。新建 spec 必含：
> 1. metadata 块标 `**Stage**:`（6 取 1，title-block 风格匹配现有 spec 约定）
> 2. 顶部 `## 重点` 段（1-3 句成功标准，**不**是散文）
> 3. `## Context` / `## Goals` / `## Non-Goals` / `## Approach` / `## Architecture` 5 段（**按此顺序**）
> 4. 末尾 `## Self-Application`（本 spec 在 6 阶段链中的位置）

---

## metadata 块（必含，title-block 风格）

```markdown
**Date**: YYYY-MM-DD
**Status**: Draft  # Draft | Approved | Superseded
**Stage**: 方案    # 设想 | 规划 | 方案 | 计划 | 重点 | 安排
```

## 重点（必含，1-3 句）

> 把"完成这件事意味着什么"用 1-3 句说清。不是 1 段散文，**不**超过 3 句。

1. **成功标准 1**: [可验证的具体结果]
2. **成功标准 2**: [可验证的具体结果]
3. **成功标准 3（可选）**: [可验证的具体结果]

## Context（必含）

为什么做 / 之前是什么状态 / 触发条件。

## Goals（必含）

每个 Goal 1 行陈述，必须可验证（"完成 X"而不是"做好 X"）。

## Non-Goals（必含，≥ 3 条）

明确**不**做什么。Non-Goals 少 = spec scope 模糊。

## Approach（必含）

高层方法 / 选择的方案 / 关键 trade-off。**不**写 component-level 改动（那是 Architecture 段）。

## Architecture（必含）

文件 / 模块 / 接口级改动。**不**超过 200 行（超过 = 该拆 spec 方案+计划两份）。

## Self-Application（必含）

本 spec 自身在 6 阶段链中的位置 + 它依赖的上游 / 它产出的下游。

```markdown
- **设想（上游）**: `path/to/上游设想doc.md`
- **本 spec（方案）**: 本文件
- **计划（下游）**: `path/to/下游计划doc.md`（如适用）
```

## Out of scope / future

未来可做但本轮不做。

## Risks

| Risk | Mitigation | 残留风险 |
```

### 9. `docs/superpowers/specs/README.md`（新建）

```markdown
# specs/ 目录自述

> 这里存的是 spec/plan 设计草案。**新建 spec 必走 `docs/templates/spec-template.md` 模板**。

## 6 阶段框架

本目录 spec 默认在 6 阶段链的 **方案** 位置。`docs/superpowers/plans/` 下的 plan 在 **计划** 位置。

新建 spec 时**不**强制先写 **设想** 阶段（位于 `docs/plan/*.md` 下的 research / character-driven-arc / kao-ui-direction 等），**仅**当 spec 走到 v3+ multi-version 时补写 1 页 `## 设想` 段。

## spec → plan 转换门禁 checklist

**当 spec 走到 "user-approved,转 writing-plans" 状态**时，agent 在写 `docs/superpowers/plans/<name>.md` 前必须自查：

- [ ] (a) metadata 块有 `**Stage**: 方案`（spec）/ `**Stage**: 计划`（plan）
- [ ] (b) 顶部 `## 重点` 段是 1-3 句成功标准（**不**是 1 段散文）
- [ ] (c) `## Context` / `## Goals` / `## Non-Goals` / `## Approach` / `## Architecture` 5 段都答完（**不**留 placeholder）
- [ ] (d) `## Non-Goals` 至少 3 条
- [ ] (e) `## Self-Application` 段明示上下游
- [ ] (f) `## Risks` 段有 ≥ 1 行 mitigation

不通过任一条 → 回 spec 改，**不**进 plan。

## 当前仍会被引用

- [2026-06-08-internal-agent-workflow-design.md](./2026-06-08-internal-agent-workflow-design.md)
- [2026-06-15-agent-workflow-velocity-design.md](./2026-06-15-agent-workflow-velocity-design.md)
- [2026-06-15-stereo-migration-design.md](./2026-06-15-stereo-migration-design.md)
- （其他 5 份历史 spec）

## 使用规则

- 当前事实不写在这里；落实后的结果回填 `docs/PLAN.md`、`docs/LOG.md` 或 `src/` 下的事实文档。
- 旧 spec / plan 如果失效，应在正文显式标 `SUPERSEDED` 或给出替代入口。
- 调试当前行为问题时，不要从这里起步，先看 `src/code-map.md` 和 `src/known-issues.md`。
- 旧 spec **不**回溯补 frontmatter / 重点 / Self-Application（避免回归 + 边际价值低）。
```

---

## Soft locks

| 锁 | 文件:行 | 改后行为 |
|---|---|---|
| **`verify` 默认值语义保留** | `package.json:17` | `npm run verify` 调用强度升级（从 test:run+build 到完整链），前者是后者子集，不退化 |
| **`testing-verification` 仍触发于"声明 done 前"** | skill frontmatter | trigger 不扩不缩 |
| **7 个 skill 数量不变** | `agent-skills/*/SKILL.md` | 改后仍是 7 个，frontmatter `description:` 不删 |
| **`AGENTS.md` Hard rules 主表不动** | `AGENTS.md:51` | 6 个 trigger → skill 对应关系不重排；本次只动 §Skill discovery paths 和 §First action |
| **`docs/STATUS.md` 主结构不动** | `docs/STATUS.md:9,11,35,39,69` | In flight / Blocked / Recently done / Next up 4 段不重命名不重排；G12 允许在顶部加 `## 当前安排` metadata 段（独立于 4 段主结构之外） |
| **`worldbook-workflow` skill 仍 5 步结构** | skill body | 改后仍是 5 步（加 step 3.5），frontmatter `description` 不改 |
| **`commit-conventions` skill 触发不扩** | skill body | 改后是 6 步（加 step 6 soft 警告），frontmatter `description` 不改 |
| **9 份历史 spec 不回溯** | `docs/superpowers/specs/*.md` | 不补 metadata 块 / 重点 / Self-Application（避免回归） |
| **6 份历史 plan 不回溯** | `docs/superpowers/plans/*.md` | 同上 |
| **`docs/PLAN.md` 不动** | `docs/PLAN.md` | 内容不动；不加 `**Stage**:` 标签 |
| **8 份 research doc 不回溯** | `docs/plan/*-research-*.md` | 不补 metadata 块 / TL;DR；新写必套模板 |

---

## Do-not-touch

- `AGENTS.md` §Project snapshot（L1-13）
- `AGENTS.md` §First action step 2 / step 3（L18, L19）
- `AGENTS.md` §Branch model（L23-27）
- `AGENTS.md` §Multi-agent workflow（L29-34）
- `AGENTS.md` §Hard rules 主表（L51-53）
- `AGENTS.md` §Local notes（L60-62）
- `docs/STATUS.md` 现有 25 条 Recently done + 2 条 In-flight + 1 条 Blocked（L9-77）
- `docs/PLAN.md` 全文
- `docs/LOG.md` 全文
- `docs/superpowers/specs/` 下 9 份历史 spec 全文
- `docs/superpowers/plans/` 下 6 份历史 plan 全文
- `agent-skills/agent-maintenance/SKILL.md` 全文
- `agent-skills/docs-status-handoff/SKILL.md` 全文
- `agent-skills/map-engine-workflow/SKILL.md` 全文
- `agent-skills/ui-style-check/SKILL.md` 全文
- 7 份 `.agents/skills/<name>` symlink + 7 份 `.claude/skills/<name>` symlink
- `package.json` `dependencies` / `devDependencies`（L22-54）— 不动
- `package.json` L5-16 scripts（除 L17 verify 系列扩字段）
- `.gitignore` 全文

---

## Testing

**本文不新增 contract 测试**（理由同 v1：没新组件 / 新接口需要 lock）。验证方式：

### 收尾必跑

```bash
# 1. verify:contract 档可调起
npm run verify:contract -- src/__tests__/uiPolish.test.js

# 2. verify:full 档可调起
npm run verify:full

# 3. 7 个 skill frontmatter 仍合法
for f in agent-skills/*/SKILL.md; do
  head -5 "$f" | grep -q "^name:" && head -5 "$f" | grep -q "^description:" || echo "BROKEN: $f"
done

# 4. 7 个 skill body 步数仍 ≤ 6（commit-conventions 加 step 6 后正好 6，仍合规）
for f in agent-skills/*/SKILL.md; do
  steps=$(grep -cE "^[0-9]+\. \*\*|^[0-9]+\. " "$f" || true)
  echo "$f: $steps numbered steps"
done

# 5. 7 个 skill 文件大小不超 ui-style-check (6019 bytes) 太多
ls -la agent-skills/*/SKILL.md | sort -k5 -n

# 6. AGENTS.md 仍能被现有 7 个 skill 引用（无断链）
for f in agent-skills/*/SKILL.md; do
  grep -oE "AGENTS\.md|docs/STATUS\.md|docs/PLAN\.md|docs/LOG\.md|docs/src/[a-z-]+\.md|docs/guides/[a-z-]+\.md" "$f" | sort -u
done

# 7. 3 个 README 段可读
grep -A 1 "## 研究文档写作约定" docs/plan/README.md
grep -A 1 "## spec / plan 节奏经验" docs/superpowers/README.md
grep -A 1 "## spec → plan 转换门禁" docs/superpowers/specs/README.md

# 8. spec template 必含 7 段标题
grep -cE "^## (重点|Context|Goals|Non-Goals|Approach|Architecture|Self-Application)" docs/templates/spec-template.md
# 期望: 7 (重点 + Context + Goals + Non-Goals + Approach + Architecture + Self-Application)

# 9. 本 spec 自身 重点 + frontmatter stage 标签 + Self-Application 都齐
head -20 docs/superpowers/specs/2026-06-15-agent-workflow-velocity-design.md | grep -E "Stage: 方案|## 重点"
grep -A 1 "## Self-Application" docs/superpowers/specs/2026-06-15-agent-workflow-velocity-design.md

# 10. 已有 contract 测试不退
npm run test:run -- src/__tests__/uiPolish.test.js \
                   src/__tests__/welcomeView.test.js \
                   src/__tests__/workbenchNav.test.js

# 11. 全量 + build + diff 仍是 ship gate
npm run verify
```

预期：
- 步骤 1-9 全部 echo 无 `BROKEN:` / 无 broken link
- 步骤 8: 7 个段标题
- 步骤 9: 顶部有 `Stage: 方案` 和 `## 重点`；中后部有 `## Self-Application`
- 步骤 10: 4 文件全 PASS（39 + 4 + 2 = 45 tests）
- 步骤 11: exit 0（verify:full 输出应包含 87 files / 619 tests + build OK + diff clean + docs OK + visual OK）

### 不引入

- visual snapshot baseline（与现有项目一致）
- commitlint / husky / pre-commit hook（不在本文范围）
- new test file（无新组件 / 新接口）
- contract test 新断言（无新行为契约）

---

## Triggered skills（收尾前必跑）

按 `AGENTS.md` 硬规则：

- `agent-maintenance`（改 `AGENTS.md` / `agent-skills/` 触发；本文触发）
- `docs-status-handoff`（改 `docs/plan/README.md` / `docs/superpowers/README.md` / 新建 `specs/README.md` 触发；本文触发）
- `commit-conventions`（准备 commit 触发；本文收尾触发）
- `testing-verification`（声明 done 前触发；本文收尾触发）

不触发：
- `ui-style-check`（无 UI 改动）
- `map-engine-workflow`（无地图改动）
- `worldbook-workflow`（无世界书改动；只改 `worldbook-workflow` skill body，不算该 skill 自身的"修改"）

---

## Self-Application（v2 自示范 — G14）

本 spec 自身用 6 阶段框架结构化：

| 6 阶段 | 本 spec 对应 | 内容位置 |
|---|---|---|
| **设想** | 本 spec 的"为什么" | 审计 4 类手动重复 + 6 阶段框架研究 |
| **规划** | 本 spec 的"在哪条项目主线上" | `wip/map-realism-render-docs-20260608` 上的 agent workflow velocity 优化 |
| **方案** | 本 spec 自身 | 14 Goal + 9 文件改动 + 软锁 + 测试 |
| **计划** | §Implementation checklist | 单 PR 单 commit，按 10 步走 |
| **重点** | 顶部 `## 重点` 段 | 3 句成功标准（结构化减负 / 不破 7-skill / 单 PR ship） |
| **安排** | worktree + branch + 1 commit | `../worktrees/agent-velocity-0615` + 1 commit + push + 合 PR |

**依赖链**：
- **上游（不在本文）**：`2026-06-08-internal-agent-workflow-design.md`（原 agent 基础设施 spec；本 spec 是其 follow-up）
- **本 spec（方案）**：本文件
- **下游（无独立 plan 文件）**：本 spec 自含 §Implementation checklist（10 步 + 验证），per `commit-conventions` rule 5 "default 1 commit per feature, max 2"，不另开 `docs/superpowers/plans/*.md` 文件。10 步对应 1 个 commit 内的小步，**不**需要拆 plan。

**自示范的可见信号**：
1. 顶部 metadata 有 `Stage: 方案`（G10 自示范）
2. 顶部 `## 重点` 段是 3 句成功标准（**不**是 1 段散文）（G9 自示范）
3. `## Goals` 14 条全部可验证（**不**含"做好 X"）（template G9 自示范）
4. `## Non-Goals` 14 条 ≥ 3 条（template G13 (d) 自示范）
5. 本 §Self-Application 明示 6 阶段位置 + 上下游（template G14 自示范）

---

## Implementation checklist

```
[ ] 0. 起点准备
    [ ] 0.1 确认当前在 wip/map-realism-render-docs-20260608
    [ ] 0.2 git status 干净（无未提交 / 未跟踪）
    [ ] 0.3 git worktree add ../worktrees/agent-velocity-0615 wip/map-realism-render-docs-20260608
    [ ] 0.4 cd 到新 worktree

[ ] 1. 改 package.json（L17 verify 系列扩字段）
    [ ] 1.1 L17 改 "verify": "npm run verify:full"
    [ ] 1.2 L17 后插入 "verify:contract" 行
    [ ] 1.3 L17 后插入 "verify:full" 行
    [ ] 1.4 cat package.json | jq '.scripts' 确认 JSON 合法

[ ] 2. 改 agent-skills/testing-verification/SKILL.md（L10-12 措辞改档）
    [ ] 2.1 step 1 改"按改动范围选 verify 档"
    [ ] 2.2 step 2 改"贴该档的 summary 一行"
    [ ] 2.3 step 3 改"跳过（已并入 verify:full）"
    [ ] 2.4 step 4 / step 5 不动

[ ] 3. 改 agent-skills/worldbook-workflow/SKILL.md（L11 surface 改 3 个 + 加 step 3.5）
    [ ] 3.1 L11 5 surface → 3 surface，加"注：context injection / structured settings 是子概念"
    [ ] 3.2 L13 后插 step 3.5 引用 guide §3
    [ ] 3.3 L14 / L15 不动

[ ] 4. 改 AGENTS.md（§Skill discovery paths 补 2 条 + §First action step 1 加 fallback）
    [ ] 4.1 §Skill discovery paths 段末加 3 条（Codex global + 项目内 scratch + plugin 入口）
    [ ] 4.2 §First action step 1 改 "If available" → "Try to invoke" + 加 fallback 明示
    [ ] 4.3 §First action step 2 / step 3 不动
    [ ] 4.4 §Hard rules 主表不动

[ ] 5. 改 agent-skills/commit-conventions/SKILL.md（step 4 改触发重叠 + 加 step 6 soft 警告）
    [ ] 5.1 L13 step 4 改"确认 testing-verification 已跑过" + 豁免条款
    [ ] 5.2 末行加 step 6 soft 警告
    [ ] 5.3 step 1 / 2 / 3 / 5 不动

[ ] 6. 改 docs/plan/README.md（末尾加研究文档写作约定段）
    [ ] 6.1 cat docs/plan/README.md | tail -5 确认插入位置
    [ ] 6.2 末尾"## 使用规则"后插 "## 研究文档写作约定" 段

[ ] 7. 改 docs/superpowers/README.md（§使用规则 后插 spec/plan 节奏经验段）
    [ ] 7.1 cat docs/superpowers/README.md | tail -5 确认插入位置
    [ ] 7.2 "## 使用规则" 段后插 "## spec / plan 节奏经验" 段

[ ] 8. 新建 docs/templates/spec-template.md
    [ ] 8.1 写文件时自动创建目录（无需 mkdir）
    [ ] 8.2 写入 spec-template.md（见 §Component changes 8）

[ ] 9. 新建 docs/superpowers/specs/README.md
    [ ] 9.1 写入 specs/README.md（见 §Component changes 9）
    [ ] 9.2 确认 frontmatter 6 阶段框架自述 + spec→plan 转换门禁 6 条

[ ] 10. 收尾
    [ ] 10.1 跑 §Testing 步骤 1-11
    [ ] 10.2 跑 agent-maintenance（确认 7 skill 仍合法 + AGENTS.md 引用未断）
    [ ] 10.3 跑 docs-status-handoff（更新 STATUS.md In-flight → Recently done）
    [ ] 10.4 跑 commit-conventions（确认无 Co-Authored-By footer + format + 1 commit）
    [ ] 10.5 跑 testing-verification（verify:full 全绿）
    [ ] 10.6 git commit -m "chore(workflow): verify 档分档 + research 骨架 + 4 skill 卫生 + 6 阶段框架落地"
    [ ] 10.7 push worktree branch + 合 PR
```

---

## Out of scope / future

- C 类（STATUS.md 改 YAML source-of-truth）— 等 hooks 验证完再议
- D 类（PreToolUse hook 自动化 hard rules）— 审计后判定维护成本 > 边际价值
- 强制拆 spec 为方案+计划两份（O3）— 风险大，**新 feature opt-in**
- 强制所有 feature 立项前写 设想（O4）— **仅 v3+ multi-version spec 触发**
- `ui-style-check` skill 改造（6019 bytes / 95 行）— 太大，独立 PR 处理
- `agent-maintenance` / `docs-status-handoff` / `map-engine-workflow` skill 改造 — 不在本轮范围
- research doc 前 6 篇改造 — 不强制，回归风险 > 价值
- 9 份历史 spec + 6 份历史 plan 回溯补 frontmatter / 重点 / Self-Application — **不**做
- 8 份 research doc 回溯补 TL;DR / stage 标签 — **不**做
- `docs/PLAN.md` / `docs/LOG.md` 任何结构改动
- `LOCAL.md` 任何写入（user-only）
- 新增任何 skill / 新增任何 commitlint / husky / lefthook 依赖
- Pre-commit git hook（`commit-msg` / `pre-commit`）安装
- Codex 侧 PreToolUse 等价物（Codex CLI 当前无）
- 自动化 STATUS.md 更新（hook 已被 D 类显式排除）
- "1 commit per feature" 硬规则实现（数据样本不够）

---

## Risks

| # | Risk | Mitigation | 残留风险 |
|---|---|---|---|
| R0 | **PreToolUse hook 未做**（用户审计后排除） | `commit-conventions` skill + agent 自觉（已 100% 命中） | Codex 侧 commit 仍裸奔，依赖同 skill 文本双读 |
| R1 | `verify:full` 跑不通时 `&&` 短路会**部分静默** | `&&` 短路，agent 看到哪步失败；§Testing Step 11 显式跑 | 部分子步不可达会**部分静默**（exit 0 但 visual 没跑） |
| R2 | `worldbook-workflow` skill ↔ guide 对齐后，guide 仍可能 drift | guide §3 同名冲突策略显式引用，agent 改这块时直接看 guide | guide 后续若有改动，skill 引用**不**自动跟 |
| R3 | AGENTS.md §Skill discovery paths 补 3 条后，路径列表仍可能过期 | 5 条 path 是当前 5 个实际 discovery 点全列 | 无自动检测 |
| R4 | `commit-conventions` step 6 soft 警告被 agent 忽略 | soft 而非 hard，agent 自由裁量 | 5/50 mega-commit 比例可能不下降 |
| R5 | `docs/plan/README.md` 写入约定后，已有 8 篇 research doc 不套 | 显式说明"已有 8 篇不强制改造" | 跨 doc 形态分裂短期持续；新 doc 起套 |
| R6 | `docs/superpowers/README.md` 经验值段误导（数据样本小） | 段首明说"样本小，**不**作为硬规则" | agent 可能误把"8 subagent 上限"当硬规则 |
| R7 | `verify:contract --` 后接 paths 的语法依赖 agent 调用习惯 | vitest run -- 支持接 paths | agent 偶尔忘 `--` |
| R8 | `package.json` scripts 改动后 npm 解析失败 | §Implementation 1.4 显式 `jq` 验 JSON 合法 | 拼写错导致 verify 整套不可调 |
| R9 | research doc 写作约定第 4 段子标题强制统一后，少数 doc 段落不自然 | 子标题是 `### N.x` 形式，已有 worldbook 那篇类似 | 个别 doc 看起来"为了套模板而套" |
| R10 | 用户已花 5+ 消息调过的 7 个 skill 文字被本文微调 | 改动限制在 1-2 行/文件；不改 frontmatter trigger；不改 §结构 | 个别措辞偏离用户原意（review 时捕） |
| **R11** | **新增 G9 重点 段后，旧 spec 不回溯补 → 短期内"新 spec 有 重点 / 旧 spec 无"分裂** | Non-Goal 显式说明不回溯；新 spec 起必套 | 短期内 spec 体例不齐 |
| **R12** | **新增 G10 `Stage:` 标签后，agent grep 短期内只找到本 spec + 未来新 spec；9 历史 spec / 6 历史 plan / 8 research doc 都不回溯 → grep 输出稀疏** | template 要求新 spec 必带 Stage + 重点；plan 也加 | 短期内 6 阶段分布不均（方案占多数，设想 / 重点 / 安排 罕见） |
| **R13** | **G11 设想 触发条件（v3+ multi-version）** 实际是事后触发而非事前 → 不能阻止早期 v1→v2→v3 的 5 版代价 | 显式说明是事后补救；不强制所有 feature 立项前都写 | 多版本 spec 仍会发生产生 v3 才补 设想 的"事后合理化" |
| **R14** | **G12 安排 段加在 STATUS 顶部** 但 STATUS 4 段结构（In flight / Blocked / Recently done / Next up）不动 → 实际是 5 段，可能与 4 段约定不符** | 显式标 `## 当前安排` 为"前置 metadata"段，**不**计入 4 段 | 阅读 STATUS 时多 1 段，需要约定"顶部看安排 / 中间看状态"两段阅读顺序 |
| **R15** | **G13 spec → plan 转换门禁** 是软纪律不是 hook，agent 可能跳过 | 写在 `specs/README.md` 显眼位置；§Implementation Step 9 显式写 | agent 仍可能漏跑门禁 |
| **R16** | **G14 自示范** → 本 spec 自身就是模板的实例，agent 抄本 spec 写新 spec 时可能误把"agent workflow velocity"上下文带过去 | template 是参数化版本（不含本 spec 上下文），新 spec 走 template 走 | 个别 spec 体例看起来像 agent-velocity 的衍生 |
| **R17** | **6 阶段框架本身未被 user 验证**（本 spec 是第一份应用）— 6 阶段对 Pinax 实际工作流是否合适，需 1-2 个新 feature 落地后才知道 | 本 spec 是 v1 试用，v2 仍可改 | 6 阶段框架本身被推翻 → R11-R16 全部返工 |
