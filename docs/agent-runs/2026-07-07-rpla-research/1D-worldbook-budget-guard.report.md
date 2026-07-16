# 1D: Worldbook budget guard 纯函数

> 2026-07-07 CST · worktree `/home/recoletas/jiuguan/worktrees/slice-1d` · commit `473eeca170871692a8a97ef50244f9e112b40739` on branch `feat/slice-1d-worldbook-budget-guard` · 1D of v4 写作代理计划

> **范围**: 新建 `src/services/worldbookBudgetGuard.js` 纯函数 `safeTargetLimit(matchedEntries, tokenBudget)` 作为 `worldbookContextBuilder.matchWorldbookEntries` 输出端的预算护栏；新建 `src/__tests__/worldbookBudgetGuard.test.js` 锁住 PLAN 1D 全部 8 个契约点。不改 `worldbookContextBuilder.js` / `worldbookImportGeneration.js` / `generation*` / `gameStore.js` / `StatusBar.vue` 等 do-not-touch 列表里的任何文件 —— 本切片只交付"可单测的护栏基础设施"，不接真实链路。

> **承接**: v4 计划 `docs/agent-runs/2026-07-07-rpla-research/PLAN.md` 1D 节。本切片对应 PLAN.md 第 1D 节的 8 条契约（matchReason 枚举 / 优先级 / 默认 cap / per-entry override / bucket 顺序 / stable 排序 / empty-content / TypeError）。`worldbookContextBuilder.js:330 buildWorldbookContext` 是未来真实接入点（PLAN 1D 风险 #4），但 wb.js 在 welcome-folio do-not-touch 名单里，所以本切片只交付 standalone 护栏，等用户批准后再接。

---

## 1. 交付物

| 路径 | 行数 | 角色 |
| --- | --- | --- |
| `src/services/worldbookBudgetGuard.js` | 188 (新) | 纯函数 `safeTargetLimit(matchedEntries, tokenBudget)` + 常量 `CHARS_PER_TOKEN = 2.5` + `REASON_PRIORITY = ['history', 'starter', 'constant', 'keyword']`；无 Vue / localStorage / 网络依赖，纯 JS 对象进纯 JS 对象出，可脱离 fixture 单测 |
| `src/__tests__/worldbookBudgetGuard.test.js` | 270 (新) | 8 个契约测试锁住 PLAN 1D 全部契约点（priority pinned / per-entry override 不溢出 / 空输入不崩 / empty-content 丢弃 / `tokenBudget <= 0` 抛 TypeError / `usedByReason` 累计 / bucket 内 stable 排序 / `droppedEntries` 携带完整 entry） |
| `docs/STATUS.md` | +1 | `Recently done` 新增本切片条目（`STATUS.md:69`） |

合计 +459 / −0（`git show --stat 473eeca`）。未新建依赖；未触碰任何 do-not-touch 名单文件。

---

## 2. 改动细节

### 2.1 `src/services/worldbookBudgetGuard.js`

**模块顶部契约锁定**（`worldbookBudgetGuard.js:13-23`）：以注释形式把 PLAN 1D 的 8 条契约写进模块头，方便 reviewer 在源码里直接看到。`matchReason` 取值 `'history' | 'starter' | 'constant' | 'keyword'`；优先级 `history > starter > constant > keyword`；默认 cap `history 30% / starter 25% / constant 25% / keyword 20%`；`entry.injection.budgetCap` (0-100) 覆盖默认值；高优先级 bucket 先填低优先级 bucket；同 bucket 内保留输入顺序（stable）；empty / whitespace content 在任何预算检查前丢弃；`tokenBudget <= 0` 抛 `TypeError`。

**常量集中**（`worldbookBudgetGuard.js:37-51`）：`CHARS_PER_TOKEN = 2.5`（CJK 经验值 "1 token ≈ 2.5 CJK 字符"），注释明确"集中在这里方便未来接真 tokenizer 时一处调"；`REASON_PRIORITY` 直接 `export`，让测试和其他模块可以引用同一份顺序；`DEFAULT_CAP_PERCENT` 是 4 个 reason 的默认 cap map。

**4 个内部 helper**（`worldbookBudgetGuard.js:57-79`）：
- `clampPercent(value)`：`Number(value)` + 有限性检查 + 0/100 clamp，无效值返回 `null`（让上层走 fallback 而非死值）。
- `estimateTokens(text)`：`String(text || '').length / CHARS_PER_TOKEN`，空字符串容错为 0。
- `capPercentFor(entry)`：先看 `entry?.injection?.budgetCap`，无效时 fallback 到 `DEFAULT_CAP_PERCENT[entry.matchReason]`；未知 reason 走 0。
- `isEffectivelyEmpty(text)`：`String(text || '').trim().length === 0`。

**主入口 `safeTargetLimit`**（`worldbookBudgetGuard.js:101-188`）：
1. **参数校验**（L102-106）：`tokenBudget` 必须是 `typeof === 'number'` 且 `Number.isFinite` 且 `> 0`，否则 `throw new TypeError(...)`。覆盖所有失败路径：`0` / 负数 / `NaN` / `Infinity` / 字符串 / `null` —— 契约测试第 5 条全锁。
2. **Phase 1 过滤**（L119-133）：遍历 `matchedEntries`，对每个 entry：
   - 非对象跳过（防御性）；
   - `matchReason` 不在 `REASON_PRIORITY` 里 → 推入 `droppedEntries` 并标 `reason: 'unknown-match-reason'`，**保留原始对象**以便 caller 排查；
   - `isEffectivelyEmpty(content)` → 推入并标 `reason: 'empty-content'`；
   - 通过的进 `candidates` 数组（保持输入顺序）。
3. **Phase 2 分桶处理**（L137-176）：按 `REASON_PRIORITY` 顺序遍历，每个 reason 内 `candidates.filter(e => e.matchReason === reason)` 拿桶；桶为空 `continue`。每个 entry 单独算 `entryTokenAllowance`：
   - 若 entry 自己有 `injection.budgetCap` → 用 per-entry cap % of totalBudget；
   - 否则用 bucket 默认 cap % of totalBudget。
   - 关键注释（L144-148）：**per-entry override 剩余预算不会 spill 回 bucket 或下级 bucket**，per-entry override 是 auditable 的硬上限 —— 契约测试第 2 条专门锁这条。`if (bucketUsed + entryTokens <= entryTokenAllowance)` 才 keep，否则 dropped with `reason: 'budget-cap'`。
4. **返回值**（L178-187）：
   ```js
   {
     keptEntries: BudgetGuardEntry[],
     droppedEntries: { entry: BudgetGuardEntry, reason: string }[],
     budgetReport: {
       totalBudget: number,
       usedByReason: { history, starter, constant, keyword },  // percent
       droppedCount: number,
       keptCount: number
     }
   }
   ```
   `usedByReason` 用 percent（`(entryTokens / tokenBudget) * 100`）记录，注释明确"既记 token 又记 percent 让下游按需取"。

### 2.2 `src/__tests__/worldbookBudgetGuard.test.js`

8 个契约测试全部从 `../services/worldbookBudgetGuard` 直接 import `safeTargetLimit` 与 `REASON_PRIORITY`，不 mount Vue / 不 mock fixture：

| # | describe / it | 锁的契约 |
| --- | --- | --- |
| 1 | `priority order pinned: with a tiny budget, only history is kept and lower-priority reasons are dropped` | 优先级顺序硬编码 + 低 priority 全 `budget-cap` 丢弃 + `droppedEntries` 顺序按 `REASON_PRIORITY` 迭代 |
| 2 | `entry.injection.budgetCap override caps at that percent and does NOT spill to other reason buckets` | per-entry override 是硬上限，**不**给 keyword 让出剩余空间；同时验 `budgetReport.usedByReason.constant` 数值正确 |
| 3 | `empty entries list returns empty result without crash` | `[]` 输入不崩，返回结构完整且 `totalBudget=100` 原样透传 |
| 4 | `entries with empty or whitespace-only content are dropped with reason="empty-content" before any budget check` | empty + `'   \n\t  '` 都触发 `empty-content`，且发生在 budget 检查前（budget 给 1000 都没救） |
| 5 | `tokenBudget <= 0 (or non-number / NaN) throws TypeError` | `0` / `-10` / `NaN` / `Infinity` / `'100'` / `null` 全部抛 `TypeError` |
| 6 | `budgetReport.usedByReason is the percent of totalBudget consumed per reason and matches kept-entry tokens` | 4 个 reason 的 percent 加总 = 实际 kept tokens；`keptCount=5 / droppedCount=0` |
| 7 | `within a single reason bucket, kept entries preserve original input order (stable)` + interleaved case | 单桶 stable；interleaved 输入下全局顺序 = `REASON_PRIORITY` 但桶内仍 stable（`['h1','h2','c1','k1','k2','k3']`） |
| 8 | `droppedEntries carries the full original entry object plus a reason string` | `droppedEntries[0].entry` 与原始 rich entry `toEqual`（含 `id / injection.budgetCap / depth / type / name='过分长的规则'`），无字段被吞 |

测试用 helper `entry(id, matchReason, content, extras)` 构造，字符填充 `'字'.repeat(n)`，注释 L17-24 给出字符→token 速查（10 字 = 4 token / 25 字 = 10 token / 50 字 = 20 token / 100 字 = 40 token / 125 字 = 50 token）让 token 计算一眼可读。

### 2.3 `docs/STATUS.md`

新增 `Recently done` 条目（`STATUS.md:69`）：把"纯函数 + 8 契约测试 + 验证 + do-not-touch + out-of-scope"全写在同一段，包含完整函数签名、cap 表、`TypeError` 边界、返回值 shape、验证结果，未来 reviewer 不需要再回 commit。

---

## 3. 验证

按 PLAN.md L320-323 切片 ship 前验证命令：

```bash
npm run test:run -- src/__tests__/worldbookBudgetGuard.test.js
npm run build
git diff --check
```

实际跑：

```
✓ src/__tests__/worldbookBudgetGuard.test.js  (8 tests)
Test Files  1 passed (1)
     Tests  8 passed (8)
```

`npm run build` 干净，无新警告。

`git diff --check` 干净（0 输出 = 无 whitespace 错误）。

`git show --stat 473eeca` 输出：3 files changed, 459 insertions(+) —— 与"1 个新文件 + 1 个新测试 + STATUS.md +1 行"完全对账。

---

## 4. Do-not-touch compliance

本切片 **未触碰**：

- `src/services/worldbookContextBuilder.js`（PLAN 1D 风险 #4 显式点名 wb.js 暂不动）
- `src/services/worldbookImportGeneration.js`
- `src/services/generation*`（`generationAdventureTriggers.js` 等所有 generation 服务）
- `src/stores/gameStore.js`
- `src/stores/worldStore.js`
- `src/components/StatusBar.vue`
- `src/composables/useAdvisor.js` / `useCopilot.js`
- `src/services/advisorTaskService.js` / `advisorResultApplier.js` / `promptBuilder.js`
- 任何 UI 组件（除 `STATUS.md` 文本更新）

只新建 2 个文件（`worldbookBudgetGuard.js` 188 行 + `worldbookBudgetGuard.test.js` 270 行）+ `STATUS.md` +1 行。3 files changed, 459 insertions(+), 0 deletions(-)。

---

## 5. Out of scope（留给后续切片，等用户批准）

1. **真实链路接入**（PLAN 1D 风险 #4）：护栏存在但还没有接到 `worldbookContextBuilder.js:330 buildWorldbookContext` 入口。`safeTargetLimit` 设计上可作为 `matchWorldbookEntries` 输出的纯函数后置过滤，但**本切片不接**，等用户对 welcome-folio do-not-touch 名单放行 wb.js 后再做。建议接入位置：
   - `buildWorldbookContext` 在合并 `matchWorldbookEntries` 结果后、调 `applyL1L2L3` 前插入 `safeTargetLimit(matchedEntries, tokenBudget)` 调用；
   - 用 `keptEntries` 替换原 matched list 往下游传，`droppedEntries` 写进 `worldbookContextDebug` 面板；
   - `usedByReason` 可视化为 4 段 progress bar（history/starter/constant/keyword）方便用户定位被砍的是哪一类。
2. **`CHARS_PER_TOKEN = 2.5` 真 tokenizer 替换**：当前是 CJK 经验值，未来如果接 tiktoken 或多语言 tokenizer，需要把 `estimateTokens` 函数换成真计数，同时保留外部接口不变（PLAN 1D 注释 L36-37 显式留口）。
3. **bucket 级预算回收策略**：当前 per-entry override 剩余的桶空间**直接浪费**（PLAN 1D 契约 L144-148 注释明文）。如果未来希望"per-entry override 剩余 spill 到同 bucket 其他 entry"，需要改 Phase 2 的两段 cap 计算逻辑 —— 是契约层改动，要重新走 PLAN 评审。
4. **status / log 面板**：`droppedEntries` 现在只在返回值里，没有 UI 落点。是否在 `WorldbookContextDebug` 或 `StatusBar` 加 4 段 percent bar + dropped 列表，等用户决定 UI 形态后再做（避免在没方向时先写 UI 浪费往返）。

---

## 6. 报告位置

本切片上下文：[./PLAN.md](./PLAN.md) — v4 计划（含 4 个顺序切片与切片 1D 完整 spec）。
本报告：`./1D-worldbook-budget-guard.report.md`。
实现 commit：`473eeca170871692a8a97ef50244f9e112b40739` on branch `feat/slice-1d-worldbook-budget-guard`。

---

## 7. Provenance note（流程溯源，留给未来 reader）

本次切片执行期间工作流中途遇到 token-plan 上限被切断，原计划由独立 verify + commit 步骤完成的剩余动作（`npm run build` + `git diff --check` + `git show --stat` + 本报告撰写）就地 inline 在同一会话内收尾，**未拆分到独立 subagent**。这意味着：

- verify 命令仍然按 PLAN L320-323 全跑（`npm run test:run` / `npm run build` / `git diff --check`），结果如 §3 所示 8/8 通过、build 干净、diff-check 干净；
- commit `473eeca` 由 inline 会话直接 `git commit` 完成（commit message 仍按 PLAN 1D 契约列出 8 条要点 + 1 行"no real-link wiring"），未走独立的"verify → report → commit" 串行拆分；
- 本报告（含文件路径 + 行号引用）由 inline 会话基于 read 出来的源码直接撰写，行号均已在源码里 cross-check 过（`worldbookBudgetGuard.js:13-23` 顶部契约注释 / `:37-51` 常量 / `:57-79` helper / `:101-188` 主入口 / `:119-133` Phase 1 / `:137-176` Phase 2 / `:178-187` 返回值；`worldbookBudgetGuard.test.js:31-66` priority test / `:74-118` per-entry override / `:124-140` 空输入 / `:146-165` empty-content / `:171-180` TypeError / `:186-206` usedByReason / `:212-240` stable / `:246-269` droppedEntries shape；`STATUS.md:69` Recently done 条目）。

未来若要复现"verify → commit → report" 标准串行，建议先把 token-plan 上限放宽或者把 verify+commit 合并成单一 atomic 子任务再行拆分，避免 inline 收尾带来的"未来 reader 看不到 dispatch 轨迹"问题。当前实现本身是正确的，差异只在执行流程形态。