# 1B: DebugTriage 只读排查面板

> 2026-07-08 CST · worktree `/home/recoletas/jiuguan/worktrees/slice-1b` · commit `c04aa78dc1f6e9e71d83586c2edda93a13ae13a3` on branch `feat/slice-1b-debug-triage` · 1B of v4 计划

> **范围**: v4 计划 `docs/agent-runs/2026-07-07-rpla-research/PLAN.md` 第 1B 节。交付**只读** DebugTriage overlay —— 第一个直接消费 `gameStore.lastContextLedger / lastMemoryRecall / lastMemoryContext / runtimeEvents` 的用户可见面板，作为后续 `useApiSettings` / `worldbookContextBuilder` 调试的统一入口。**不动** `gameStore / worldbookContextBuilder / generation* / StatusBar / worldStore`。

> **承接**: 用户在 v4 计划评审时明确的设计决策：
>
> 1. **URL `?debug=1` gate**（同时支持 `?debugTriage=1` 别名）：无菜单 UI、无 localStorage、无 sessionStorage；只在 URL 上挂 flag 才出现，刷新 / 关 tab 即消失。
> 2. **4 个 panel 一并交付**：A 生成性能 / B context ledger / C 记忆召回 / D 运行时事件；不留 stub、不留空 panel。
> 3. **AppShell 右下角 fixed overlay**：作为 AppShell 子节点挂载（与 `<RouterView>` 同级），`position: fixed; bottom: 12px; right: 12px; width: 360px; max-height: calc(100vh - 24px); z-index: 9999`，浮在所有路由内容之上。
> 4. **不接写入**：纯 inspector；点击 ledger part 复制 preview / 编辑事件 / 触发 store action 等写动作留待 follow-up 切片。

---

## 1. 交付物

| 路径 | 行数 | 角色 |
| --- | --- | --- |
| `src/composables/useDebugMode.js` | 49 (新) | URL flag 检测：`checkQueryString(qs)` 纯函数（jsdom-free 单元测试用）+ `useDebugMode()` reactive composable，`onMounted` 挂 `popstate` 监听，back/forward 在 debug ↔ 非 debug URL 之间切时自动 toggle |
| `src/components/debug/DebugTriage.vue` | 325 (新) | 4 个 panel：A 生成性能（共享 `usePerf` singleton）+ B 上次 context ledger parts 表格（source / title / chars / preview）+ C 上次记忆召回 dl + lastMemoryContext 可折叠 pre + D 运行时事件时间线（last 30，type / branchId / parentId / ts）。整组件只用 `var(--...)` token，无 raw hex / 无 `:global` / 无 `!important` |
| `src/__tests__/useDebugMode.test.js` | 36 (新) | 5 测试：`?debug=1` / `?debugTriage=1` 双 flag / 缺 flag / `debug=0` / 非字符串输入 / reactive `enabled` 初值 |
| `src/__tests__/debugTriageContracts.test.js` | 121 (新) | 12 source-level 契约测试：4 panel header 存在 / `data-panel` 4 个 attribute（perf/ledger/memory/events）/ 无 `gameStore.x = ...` 写入 / 无 `gameStore.method()` 调用 / scoped style 无 raw hex / 无 `:global` / 无 `!important` / `<aside v-if="enabled">` root gate / `position: fixed; bottom: 12px; right: 12px; z-index: 9999` |
| `src/layouts/AppShell.vue` | +4 / −0 | 新 import `DebugTriage from '../components/debug/DebugTriage.vue'`（`AppShell.vue:9`）+ 1 个 `<DebugTriage />` 挂载点（`AppShell.vue:292`，紧跟 `</RouterView>` 之后、`</div>` 之前） |
| `docs/STATUS.md` | +1 | `Recently done` 新增本切片条目（`STATUS.md:69`） |

合计 6 files changed, 539 insertions(+), 0 deletions(-)。无新依赖；不动 gameStore / worldbookContextBuilder / generation* / StatusBar / worldStore。

---

## 2. 改动细节

### 2.1 `src/composables/useDebugMode.js`

**导出 `checkQueryString(qs)` 纯函数**（`useDebugMode.js:16-21`）：接受任意 querystring（带或不带 `?` 前缀），用 `URLSearchParams` 解析，`debug === '1'` 或 `debugTriage === '1'` 任一命中即返回 `true`。非字符串、空字符串、`null`、`undefined` 全部安全返回 `false`。**纯函数 + 无 jsdom 依赖**让契约测试可以脱离 `window.history` 直接跑。

**`useDebugMode()` reactive composable**（`useDebugMode.js:31-49`）：返回 `{ enabled: ref<boolean> }`；`onMounted` 调用 `check()` 读 `window.location.search` + 挂 `popstate` 监听；`onBeforeUnmount` 解绑。**无 localStorage / 无 sessionStorage / 无 menu UI / 无事件总线** —— 每一次刷新都是从 URL 重新读，per-session ephemeral 是显式契约，不留隐性持久化。

### 2.2 `src/components/debug/DebugTriage.vue`

**root gate**（`DebugTriage.vue:17`）：`<aside v-if="enabled" class="debug-triage" aria-label="Debug triage panel">`。`enabled` 为 `false` 时整组件不渲染（`v-if` 而非 `v-show`），DOM 上零存在。

**Panel A 生成性能**（`DebugTriage.vue:24-42`）：通过共享 `usePerf().latest` 拿最近一次生成的 `{totalMs, seed, timings[]}`。表格列 阶段 / 耗时 / 占比，按 `durationMs` 降序排，`percent = durationMs / totalMs * 100`。`totalMs` `< 1000` 显示 ms，否则显示 s。无 perf 数据时显示 `暂无生成记录`。

**Panel B 上次 context ledger parts**（`DebugTriage.vue:45-63`）：从 `gameStore.lastContextLedger.parts` 读，列 source / title / chars / preview。preview 用 `word-break: break-word; white-space: pre-wrap; max-width: 180px` 限宽不爆列。无 ledger 时显示 `暂无 ledger`。

**Panel C 上次记忆召回**（`DebugTriage.vue:66-83`）：dl 网格展示 `query / source / includedCount / totalItems / excludedCount / contentChars / queryTerms`（queryTerms 截前 8 个 + `(+N)` 标注）。`lastMemoryContext` 是 `<details>` 折叠块，仅在 `lastMemoryContext` 非空时挂载，点开看完整 raw text。无 recall 时显示 `暂无记忆召回`。

**Panel D 运行时事件时间线**（`DebugTriage.vue:86-104`）：取 `gameStore.runtimeEvents.slice(-30).reverse()`（最新在上），列 type / branchId / parentId / ts（ts 转 UTC HH:MM:SS.mmm ISO 子串）。表头带 `recentEvents.length / totalEvents` 计数。无事件时显示 `暂无运行时事件`。

**脚本只读性**（`DebugTriage.vue:108-161`）：所有 gameStore 字段都是 `computed` getter（`ledgerParts / memoryRecall / lastMemoryContext / totalEvents / recentEvents`），**没有 `gameStore.x = ...` 写入**，**没有 `gameStore.method()` 调用** —— 契约测试第 6 + 7 项用正则 `gameStore\.\w+\s*=` 与 `gameStore\??\.\w+\s*\(` 锁死这两个反模式，未来 reviewer 一眼能看到。

**scoped style 全 token 化**（`DebugTriage.vue:163-326`）：背景 `--bg-secondary`、边框 `--border`、阴影 `--shadow-floating`、正文 `--text-primary`、二级文 `--text-secondary`、弱化文 `--text-muted`、强调 `--accent`、字体 `--font-mono`。**0 个 raw hex**、**0 个 `:global`**、**0 个 `!important`**（契约测试 3 项 grep 全锁）。layout 是 `position: fixed; bottom: 12px; right: 12px; width: 360px; max-height: calc(100vh - 24px); z-index: 9999` + `display: flex; flex-direction: column; gap: 6px`，与 AppShell 现有 fixed overlay 同语言（不引入新 z-index 体系）。

### 2.3 `src/__tests__/useDebugMode.test.js`（5 测试）

| # | 锁的契约 |
| --- | --- |
| 1 | `?debug=1` / `debug=1`（无前导 `?`）均返回 `true` |
| 2 | `?debugTriage=1` / `debugTriage=1`（别名 flag）均返回 `true` |
| 3 | `?foo=bar` / `?debug=0` / `?debugTriage=0` / `?debug=true` 全部返回 `false`（值必须严格 `=== '1'`） |
| 4 | 非字符串输入（`null` / `undefined` / `123`）安全返回 `false` |
| 5 | `useDebugMode().enabled` 初值是 `boolean false` |

测试只 import 纯函数与 composable 工厂，**不 mount Vue / 不 mock window**（composable 在 jsdom 环境里 mount 会有 Vue onMounted warning，但不影响断言；见 §3 stderr 备注）。

### 2.4 `src/__tests__/debugTriageContracts.test.js`（12 测试）

四组 describe：

**Panel headers（4 测试）**：4 个 panel header 字符串 + `data-panel` 4 个 attribute（`perf / ledger / memory / events`）。

**Read-only contract（2 测试）**：`<script setup>` 块不含 `gameStore.\w+\s*=` 写入，不含 `gameStore.\w+\.(push|splice|pop|shift|unshift|sort|reverse)` 数组变更；逐行扫描 `gameStore` 引用，不允许 `gameStore.method(...)` 调用。

**CSS hygiene（3 测试）**：scoped style 不含 `#[0-9a-fA-F]{3,8}`（无 raw hex）、不含 `:global`、不含 `!important`。

**Mount contract（3 测试）**：`<aside ... v-if="enabled">` 在 root；scoped style 含 `position: fixed` + `bottom: 12px` + `right: 12px` + `z-index: 9999`。

源码读取用 `readFileSync(... 'utf8')` + 正则，不走 Vue Test Utils / Pinia —— 单元测试运行时间 < 10ms，未来重构组件内部实现不会因为 props / events 调整而红。

### 2.5 `src/layouts/AppShell.vue`

**新 import**（`AppShell.vue:9`）：`import DebugTriage from '../components/debug/DebugTriage.vue'`。

**新挂载点**（`AppShell.vue:292`）：在 `<main class="shell-content">` 内 `<RouterView>` 之后、`.app-shell` 闭合 `</div>` 之前，加一行 `<DebugTriage />` + 一行注释 `<!-- Debug overlay: read-only, gated by ?debug=1 (see useDebugMode.js). -->`（`AppShell.vue:291`）。挂载位置选择 AppShell 根节点内部、`<RouterView>` 之后 —— 保证：
- 不在 drawer / mast / overlay 的 z-index 体系内，与 `shell-overlay (z=88) / shell-drawer (z=89) / shell-mast (z=90)` 不冲突；
- 切换任意 route 都不会 unmount，事件时间线与 ledger 状态保留；
- `useDebugMode().enabled` 为 false 时 `v-if` 整组件不渲染，DOM 零成本。

### 2.6 `docs/STATUS.md`

新增 `Recently done` 条目（`STATUS.md:69`），记录 4 panel 内容 + 测试分布 + 验证命令 + out-of-scope，与本报告同源。

---

## 3. 验证

按 PLAN 切片 ship 前验证命令：

```bash
npx vitest run src/__tests__/debugTriageContracts.test.js src/__tests__/useDebugMode.test.js
```

实际跑：

```
 ✓ src/__tests__/debugTriageContracts.test.js  (12 tests) 5ms
 ✓ src/__tests__/useDebugMode.test.js  (5 tests) 5ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
   Duration  1.14s
```

`useDebugMode.test.js` stderr 里两条 `[Vue warn]: onMounted is called when there is no active component instance...` —— 这是 jsdom 环境里直接调 `useDebugMode()` 工厂（不通过 Vue 组件 setup）触发的 **预期内** 警告（契约测试只测 `enabled.value` 初值，不挂生命周期），**断言 5/5 仍然 pass**。

`npm run build` 干净，无新警告。

`git diff --check` 干净（0 输出 = 无 whitespace 错误）。

`git show --stat c04aa78` 输出：

```
docs/STATUS.md                             |   1 +
src/__tests__/debugTriageContracts.test.js | 122 +++++++++++
src/__tests__/useDebugMode.test.js         |  37 ++++
src/components/debug/DebugTriage.vue       | 326 +++++++++++++++++++++++++++++
src/composables/useDebugMode.js            |  49 +++++
src/layouts/AppShell.vue                   |   4 +
6 files changed, 539 insertions(+)
```

对账：本节 6 文件 + 539 insertions + 0 deletions 完全一致。

---

## 4. Do-not-touch compliance

本切片 **未触碰**：

- `src/stores/gameStore.js`（4 个被读字段：`lastContextLedger / lastMemoryRecall / lastMemoryContext / runtimeEvents` 全部通过 `useGameStore()` 直接读 reactive，不调任何 action）
- `src/stores/worldStore.js`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`（`generationAdventureTriggers.js` 等所有 generation 服务）
- `src/components/StatusBar.vue`
- `src/composables/useAdvisor.js` / `useCopilot.js`
- `src/services/advisorTaskService.js` / `advisorResultApplier.js` / `promptBuilder.js` / `writingAgentContext.js`
- 任何其他 UI 组件（除 `AppShell.vue` 加 1 import + 1 mount + 1 注释 = `AppShell.vue:9 / :291 / :292`）

只动 5 个 src 文件（`useDebugMode.js` 新建 + `DebugTriage.vue` 新建 + 2 测试文件新建 + `AppShell.vue` +4 行）+ `STATUS.md` +1 行。`git diff c04aa78^ c04aa78 -- src/stores/gameStore.js src/services/worldbookContextBuilder.js src/services/generation* src/components/StatusBar.vue src/stores/worldStore.js` 输出为空 —— do-not-touch 名单 0 触碰。

---

## 5. Out of scope（留给后续切片）

1. **写入动作**：用户在本切片评审时明确**不**实现点击 ledger part 复制 preview / 双击事件跳到对应 route / 右键事件触发 store action 等写动作。本面板纯 inspector，写入路径会污染 store、污染事件时间线、污染 ledger，与"只读排查"定位冲突。follow-up 切片可加：
   - panel B 每行 `part.preview` 加 copy-to-clipboard button（不进 store，只读 `navigator.clipboard.writeText`）；
   - panel D 每行 `branchId / parentId` 加 click-to-jump（路由到对应 branch，需 `useRouter` 接入）；
   - panel A 加 export-perf-as-json（`Blob` 下载，不进 store）。
2. **持久化激活状态**：当前 URL flag 每次刷新都要重新打。是否做"用户上一次打开 debug 模式自动恢复"的 `localStorage.debugTriage=true` 记忆，需要先与用户对齐"debug 是诊断工具而非用户偏好"的定位 —— 改 `localStorage` 就把"诊断 ephemeral"破坏成"用户长期开关"，本切片不做。
3. **从 debug 面板直接调用 store action**：例如 `clearRuntimeEvents` / `clearLastContextLedger` / 强制重新触发 `requestAdventureTrigger`。这些是写入，留在 follow-up；本切片先验证"读链路"全部正确再开"写链路"。
4. **完整 Pinia mount 测试**：当前契约测试用源码 regex 锁表面，**没**用 `@vue/test-utils` mount + Pinia 真实 store。原因：mock `useGameStore` + `usePerf` 单例让 mount 测试既 brittle 又跑得慢，与"快速反馈"目标冲突。等用户决定要不要进一步锁运行时行为（store 字段命名变了要立刻 fail）再补。
5. **per-panel 折叠 / 关闭按钮**：当前 4 panel 始终展开。如需"折叠 D / 关掉整个面板"，需要新增 store 或 URL param（`?debug=1&dtCollapse=events`）—— 与 §1 的 URL-only 哲学一致但没做，本切片报告里**显式承认**这一点。

---

## 6. 报告位置

本切片上下文：[./PLAN.md](./PLAN.md) — v4 计划（含 4 个顺序切片与切片 1B 完整 spec）。
本报告：`./1B-debug-triage-panel.report.md`。
实现 commit：`c04aa78dc1f6e9e71d83586c2edda93a13ae13a3` on branch `feat/slice-1b-debug-triage`。