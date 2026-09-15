# A 线二次验收与修改指导（O，2026-09-15）

状态：**fix-required**。正确基线重建成立，架构方向可保留；显式参考的生产 scope
接线存在一个确定 P0，IME、取消语义与采纳异常边界仍需收口。修完并复验后可进入
`merge-candidate with declared partials`，当前不得合并、push 或同步 `server-version`。

复验对象：`night/arch-a-20260914-fix@f6e158b`，共同基线 `37e0679`。验收期间工作树又出现
host/page/agent 的未提交修正，以及三份单域服务的 staged relocation；这些只视为进行中尝试，
不计入 `f6e158b` 的已提交交付，也不能用本文件记录的旧绿灯替代最终 HEAD 复验。

## 1. 已经成立、不要推倒重来的部分

- merge-base 精确为 `37e0679`，`37e0679...HEAD` 为 `0 2`；原错误基线分支已正确冻结。
- diff 限于 A 域：inline host、显式参考 owner、Authoring 接线、本域测试、skill 与回执；未复活
  Kao、Opening、旧 Welcome 或已迁出的 Authoring workflows。
- `Authoring.vue` 为 12,816 行，没有回退到旧分支的 15,932 行；新 host 223 行、reference
  owner 57 行。
- `writingAgentContext.js`、`writingAgentReferences.js` 在共同基线没有生产消费者；删除两份共
  1,014 行孤儿服务可保留。构建通过进一步证明没有静态生产依赖。
- cursor / IME / selection / interaction owner / adoption 的页面散点向
  `useInlineWritingAgentHost` 收口，方向正确；`ui-style-check` 新增的作者任务连续性、真实截图和
  no-change 规则也合理。
- agent skill shims 全部仍解析到仓库内 `agent-skills/*/SKILL.md`，所有 skill frontmatter 均有
  `name` 与 `description`。
- A12 可继续明确标为 partial；本轮不需要为追求“全部 done”扩大右栏工具写集。

## 2. P0：显式参考并没有绑定真实文档 scope

`activeDocumentSaveScopeKey` 是 `useAuthoringPersistence` 返回的函数，不是 ref/computed；但新接线
在三个生产位置传了 `activeDocumentSaveScopeKey.value`：

- knowledge facade 的 `references` reader；
- `getWritingAgentPageContext()`；
- `useAssetAsCopilotContext()`。

`.value` 始终是 `undefined`，随后被 reference owner 归一成空字符串。因此同章选择/读取看似
正常，实际上参考从未绑定 `book|role|document`。scope watch 最终通常会清理它，但在切书/切章
同拍、watch 尚未执行或别的任务读取路径中，旧参考仍有机会进入新对象请求。现有 composable
单测传入了理想字符串，浏览器旅程只检查同章请求，因此全部绿而没有发现生产接线错误。

必修：

1. 三处全部改为调用 `activeDocumentSaveScopeKey()`，不要引入第二个 scope ref。
2. 建立页面内唯一窄读函数，例如 `readCurrentCopilotReference()`，内部只调用
   `referenceSource.readForScope(activeDocumentSaveScopeKey())`。
3. 所有可能进入模型上下文的路径都从该窄读函数取参考，包括：
   - `getWritingAgentPageContext()`；
   - knowledge facade `references` reader；
   - `buildWritingTaskContext()`；
   - `selectedCopilotReferenceAssets()` / dependency revision 收集。
   目前后两条仍直接读取 `copilotReferenceAsset.value`，不能只修三个 `.value` 就收工。
4. UI 显示可以读取 owner 的只读 ref，但任何 provider/context/manifest 路径必须 fail closed 走
   scope gate。

必须增加真实页面断言：在章 A 选择参考 → 立即切到章 B → 触发 inline 或一个复用
`buildWritingTaskContext` 的写作任务；截获请求，章 A 参考文本/asset ref 必须为零。再回章 A 时，
旧参考应保持已清除，不得静默复活。断言要走生产页面函数，不能只调用 composable。

## 3. P1：IME composition end 的调度时序被改坏

共同基线在 composition end 后用 `nextTick()` 再读取正文并调度；新 host 的
`notifyCompositionEnd()` 立即 `schedule('input')`。compositionend 时 Vue/ProseMirror 的正文同步
可能尚未完成，因此请求指纹与 payload 可能读取组合前文本；随后 input 事件即使补调，也可能与
旧调度产生重复/错误去重。

修法保持 host owner，不把调度散回页面：host 内在结束组合并调用 `finishComposition()` 后，
延迟到 Vue `nextTick` 再构造 payload；执行前重新检查 enabled、composition 状态与 interaction
owner。已有 debounce 可以合并随后到达的普通 input，但测试必须证明 payload 读取的是组合后的
正文，而非只证明 `onInput` 被调用。

当前未提交尝试把 `nextTick(() => writingAgentHost.schedule('input'))` 放回 `Authoring.vue`，虽然恢复
了时间点，却重新让页面拥有调度决策，也遗漏了延迟后的 owner/enable 复核；这不是最终方案。

## 4. P1：scope/tool 取消仍被当成用户拒绝

`notifyDismiss()` 使用默认 `agent.cancel()` 是正确的，因为 Esc/关闭确实是用户拒绝；但
`cancelForScopeChange()` 和 `cancelForToolTakeover()` 也调用默认 cancel。`useWritingAgent.cancel()`
会在默认 `user` reason 下写 `dismissedFingerprint`，导致临时切章、打开工具后返回原落笔处时，
同一建议可能被当作作者明确拒绝而不再触发。

必修：

- scope change 与 tool takeover 传递各自的非 user reason；
- 在 `useWritingAgent` 中把这两类临时取消与 `cursor-move` 一样处理请求去重重臂，但不要写
  dismissed fingerprint；
- 增加“章 A 请求中 → 切章取消 → 返回章 A 同一光标 → 可重新调度”的断言，以及 Esc 后同一
  fingerprint 仍被抑制的对照断言。

## 5. P1：采纳事务的异常边界还不完整

验收期间的未提交尝试已经捕获 mismatch 后 `editor.undo()` 的异常，可保留，但还要处理：

- `adoptionInFlight` 应在任何 `beforeInsert` hook 前建立，避免 hook 同步触发重入窗口；
- `agent.consume()` 抛错时，已插入正文必须尽力 undo，返回 false，并在 finally 复位；当前会让
  插入正文留在稿面且异常外溢；
- `editor.undo()` 自身抛错不得让 host 卡死，但此时不能写成“无可回退物、采纳未提交”——正文
  是否仍在稿面未知，应返回可观察失败，让页面提示用户检查正文；
- `onAdopted` / `afterSync` 的异常语义要明确：consume 后不能假装整笔未发生。最小方案是让这些
  hooks 保持无抛出，并在 host 内隔离 UI 同步异常；不要二次 consume。

在现有 grouped test 内补 consume throw、undo throw、beforeInsert 重入三条子断言即可，不必增加
测试文件或突破 200 用例预算。

## 6. 证据与回执必须纠正

- `summary.md` 的“交付 commit：见 git log”不是冻结证据。最终写精确新 HEAD SHA，并区分实现
  commit 与文档 commit。
- “已知失败：无”与同句的 `rollout-c1-reference-check.mjs` timeout 自相矛盾。应写为“全量与
  已列 Gate 通过；reference Gate timeout 尚未归因/属基线已知项”，不要归类为无失败。
- `fix-a6-reference-selected.png` 画面只显示 inline 请求 500 错误，没有显示已选参考，也不能证明
  请求体包含参考。它只能标为调试截图，不能作为 A6 成功视觉证据。
- `fix-a1-editor-journey.png` 显示可编辑稿面，但也带未保存恢复横幅；可证明页面可打开，不足以
  证明 Esc/撤销/迟到结果合同。行为证据应以可重复 Gate/请求截获 JSON 为主。
- 自报“无提前结束”没有可审计的 active/blocked 时间线，不再作为质量结论。保留实际提交时间和
  执行内容即可。
- 当前测试把十个逻辑场景压在一个 200 行 `it` 内以守 200 上限。无需为本轮重构整个测试套件，
  但新增故障断言应抽本地 helper/分段函数，避免共享 mock 状态和计数跨子场景污染。
- 当前 worktree 正在 staged relocation `writingNotes.js`、`writingSelectionCapture.js`、
  `writingSuggestion.js` 到 `services/agents/authoring/`。这与 A13 原任务一致，可在所有静态/动态
  consumer 更新、构建与全量通过后保留；summary 只能在 relocation 真正进入最终提交后写 done，
  不得再先于代码宣称“三个服务已归域”。不要继续扩大到新的服务批次。

## 7. O 独立复验证据

在 `f6e158b`（随后只有未提交实现尝试）上重新执行：

| 检查 | 结果 |
| --- | --- |
| merge-base / ahead | `37e0679`；`0 2` |
| focused | `authoringAgentWorkflows` 25/25 + `uiControlContract` 6/6，exit 0 |
| `npm run verify:full` | exit 0；20/20 文件、200/200 用例、lint delta、Vite/VitePress build、diff check |
| rehearsal panel Gate | 304/304，exit 0 |
| F2 review/search/history Gate | 33/33，exit 0 |
| skill shim/frontmatter | 全部通过 |
| 人眼查看两张交付图 | 页面可打开；A6 图为 500 错误态，不能证明参考成功 |

这些绿灯证明没有广泛回归，不证明未覆盖的 scope/IME/异常合同正确。

## 8. 最终验收门槛

1. 工作树 clean，summary 写精确最终 SHA。
2. 所有 provider/context/manifest 参考读取统一通过真实文档 scope gate。
3. 跨章同拍请求断言证明旧参考为零；回原章不复活。
4. IME 结束读取组合后的文本，临时 scope/tool 取消可重臂，Esc 拒绝仍抑制。
5. insert/consume/undo 三类异常均不使 host 卡死，不静默留下不明正文。
6. focused、两个页面 Gate、`verify:full` 在最终 clean HEAD 重跑并记录实际退出码。
7. A12 继续诚实标 partial；A14–A16 未做不阻止合并，也不得冒称完成。

满足后状态改为 **merge-candidate with declared partials**，交 O 与 B/C 组合验收。

## 9. 禁止动作

- 不回到错误基线分支，不 cherry-pick 旧 Authoring 大提交。
- 不新增第二份 scope/ref/cursor/composition 可变状态。
- 不用 watch 最终清理替代请求前 fail-closed gate。
- 不删除或放宽现有 stale/interaction owner 门禁来让新断言通过。
- 不修改 B/C 写集，不 merge、不 push、不改 `server-version`。
