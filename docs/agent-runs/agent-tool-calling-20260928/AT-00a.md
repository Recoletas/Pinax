# AT-00a 回执：既有修复复核

2026-09-28｜执行者：MiniMax｜依 `docs/plan/agent-tool-calling-execution-20260928.md` §4 AT-00a
**第 2 版**（第 1 版经审查后修正：命令路径漏 `architecture/`、Node 版本不合规、断言缺保护条件）

## 起止代码标识

- HEAD 全程 `6f96c92c037d3e91857a69b2122a79c3497355f6`，未变；**未 commit、未 stash、未 push、未部署**。
- 本包实际改动文件：`src/__tests__/uiControlContract.test.js`（1 个）。
- 本包复核未改文件：`scripts/architecture/structure-budget-check.mjs`。
- 写集外文件一律未触碰。

## 〇、第 1 版的三处错误（已修正）

| 错误 | 修正 |
|---|---|
| 回执命令写成 `node scripts/structure-budget-check.mjs`，**漏了 `architecture/`** | 全部改为 `node scripts/architecture/structure-budget-check.mjs`，并按此实跑 |
| Linux 侧用 **Node v20.20.2**，不符项目要求 | 项目 `.nvmrc` = **22.22.3**，`package.json engines.node` = `>=22.13.0 <23`，CI 三处均用 `node-version-file: .nvmrc`。已切到 **v22.22.3** 重跑全部验证 |
| 断言只查清理函数出现，未锁定保护条件 | 见 §三，已整条锁定 `!blockPreview.value` 与 `phase !== 'ghosts'` |

## 一、路径归一化复核（structure-budget-check.mjs）

**核对通过，无需修改。**

| 核对点 | 结论 |
|---|---|
| production file 判断用归一化路径 | 是。第 49 行 `!posixPath(path).includes('/__tests__/')` |
| page-owner 判断用归一化路径 | 是。第 76 行 `posixPath(path).includes('/pages/')` |
| 归一化仅用于匹配，不破坏文件系统访问 | 是。`posixPath` 只出现在两个 `.filter()` 谓词内；`graph` 键、`readFileSync(path)`、`resolveRelative`、`relative(root, path)`、`statSync` 全部仍用原始 `path` |
| 预算常量 | 0 增删行 |
| `sep` 来源 | `node:path` 的 `sep`，平台自适应，无硬编码平台假设 |

## 二、平台证据（分别标注，未用一次模拟冒充双平台）

### Linux 实机

- 运行时：Linux Node **v22.22.3**（符合 `.nvmrc` / `engines`）
- `node scripts/architecture/structure-budget-check.mjs --enforce` → **退出码 1**
- 失败原因**仅** `Authoring.vue 10969 > 10900`；`cycles 0`、`experimental edges 0`、`services root JS 14` 均达标

### Windows 实机

- 运行时：Windows Node **v22.18.0**（满足 `>=22.13.0 <23`），仓库经 `\\wsl.localhost` 访问，**非 Windows 本地检出**（此边界如实标注）
- `--enforce` → **退出码 1**，失败原因同样**仅** `Authoring.vue 10969 > 10900`；`cycles 0`、`experimental edges 0`
- 路径分隔符实证：page-owner 输出 `src\pages\WorldBookQuickImport.vue -> ../stores/worldStore`，确为反斜杠，归一化分支被真实触发

### 对照实验（同环境、同 HEAD 脚本另存探针）

```
production experimental edges	2	0
experimental: src\__tests__\integration.test.js -> ../services/experimental/promptBuilder
experimental: src\__tests__\memoryCandidates.test.js -> @/services/experimental/memoryReceipt
```

同环境跑修复后脚本为 `0`。**根因与修复均获实机证据。** 探针已删除，`scripts/architecture/` 恢复为原有 2 个文件。

## 三、断言复核（uiControlContract.test.js）

任务卡要求"断言跟随已移除锚点的真实行为"，且审查要求**锁定保护条件**。最终断言：

```js
// C11 / AT-00a：手动锚点按钮已移除，改为断言两段真实行为接线。
// ① composer 由关转开即自动 reveal 推演面板。
expect(writing).toContain('if ((blockOpen && !previous[0]) || (interventionOpen && !previous[1])) void revealRehearsalComposer()')
// ② 关闭右栏时 abandon/close 未提交 composer，不留失效入口。
expect(writing).toContain("if (!wasOpen || previousTool !== 'rehearsal' || (open && tool === 'rehearsal')) return")
// ②b 保护条件必须整条锁定：已有 blockPreview 候选、ghosts 阶段不得被误清理。
expect(writing).toContain('if (blockComposer.open && !blockPreview.value) abandonBlockComposer({ restoreSelection: false })')
expect(writing).toContain("if (interventionComposer.open && interventionComposer.phase !== 'ghosts') {")
// ③ 已移除的锚点按钮不得回潮。
expect(writing).not.toContain('authoring-rehearsal-anchor')
```

覆盖：auto-reveal 接线、关闭 watcher 的早退条件、**两个保护条件整条**、锚点按钮不得回潮。
保留原有 Teleport host（`:to=`）与 `ref` 断言不变。**未恢复 `authoring-rehearsal-anchor`。**

对应源码 `Authoring.vue:5518-5528`（`revealRehearsalComposer` + 两个 watch）。

## 四、命令与实测数字（全部 Node 22）

| 命令 | 运行时 | 退出码 | 实际数字 |
|---|---|---:|---|
| `node scripts/architecture/structure-budget-check.mjs --enforce` | Linux v22.22.3 | 1 | edges 0、cycles 0、services 14、Authoring **10969**/119 |
| 同上 | Windows v22.18.0 | 1 | edges 0、cycles 0 |
| HEAD 版探针（同环境对照） | Windows v22.18.0 | 1 | edges **2** |
| `node node_modules/vitest/vitest.mjs run src/__tests__/uiControlContract.test.js` | Linux v22.22.3 | 0 | 1 文件 / **6 用例通过** |
| `node node_modules/vitest/vitest.mjs run` | Linux v22.22.3 | 0 | **20 文件 / 200 用例全通过** |
| 预算常量 diff 计数 | — | — | **0** |

行数一律以 `structure-budget-check` 脚本输出为准（`Authoring.vue` = 10969），未与 `wc -l` 混用。

## 五、出口判定

| 出口条件 | 状态 |
|---|---|
| experimental edges = 0 | ✅ Linux + Windows 双实机 + 对照实验 |
| cycles = 0 | ✅ 双实机 |
| 相关断言通过 | ✅ 定向 6/6；全量 200/200 |
| 预算常量 diff = 0 | ✅ |
| 行数 / bundle | ⚠️ 仍红（10969/10900；bundle 本包未重建） |

**本包判定：partial。** AT-00a 职责完成；**AT-00 整体未通过**，行数与体积两条红灯仍在，归 AT-00b / AT-00c。

## 六、未跑项 / 未独立复验项

- **浏览器行为验证未跑**：断言只证明源码接线，**不证明运行时"关闭右栏后入口恢复"正确**。属 AT-00d，本包不冒充通过。
- `npm run build` / `architecture:authoring-build-size-check` 本包未跑（归 AT-00c）。
- `npm run verify:full` 本包未跑（归 AT-00d）。
- **审查方声明**：Windows 结果与 6/6 测试未独立复验。本包已把 Linux 侧全部改用 v22.22.3 重跑，Windows 侧沿用 v22.18.0（满足 engines），两者数字一致。
- Windows 证据的适用边界：非 Windows 本地检出。

## 七、残留问题 / 交回集成者

1. **行数缺口 69 行**：`Authoring.vue` 10969 → 需 ≤10900。识别逻辑已全部迁出；现场编辑草稿构造尚未迁出，即 AT-00b 允许范围。
2. **bundle 缺口 2,287 字节**：上一轮实测 1,452,287 / 1,450,000。AT-00c 须重新构建取本次实测值，旧数字不作依据。
3. 任务卡提示"普通静态 import 的函数搬迁通常不减少该 chunk"——**AT-00b 不得把迁出当作降体积手段**。

## 八、下一包输入（AT-00b）

允许写集：`src/pages/Authoring.vue` 中 `handleSceneEditRequest` 的锚点解析 / 草稿构造 / `beginSceneCuration` 编排，优先并入已有 `src/composables/useAuthoringSceneWorkflow.js`。
硬约束：不得新建第二份识别 composable；workflow 不得反向 import 页面；依赖用 ref/getter/callback 注入且用 getter 取最新值（禁止初始化时 `.value` 冻结）；迁出后行为等价。
出口：行数 ≤10900、imports ≤125、cycles=0；先比较净减少量再执行，不承诺"再搬 69 行"必然达标。
若迁完仍超，交回剩余行数与候选函数表，不得重写整个页面。
