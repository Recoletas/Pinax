# B 线修改指导（O 独立验收，2026-09-15）

状态：**首轮指导已完成；修复后复验发现新的事务落盘阻断，仍为 fix-required。**

> 后续修改以
> [O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md](./O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md)
> 为准。Node 22、API 口径、B12/B13/B14 状态等首轮问题已经修正；新指导针对
> `applyRuntimeSnapshot` 只改 runtime 却写旧 session record，以及当前“在投影内部提前
> saveCurrentSession”会制造半事务存档的问题。本文件以下内容保留为首轮审计记录。

## 已确认成果

- merge-base 为共同基线 `37e0679`，没有 A 线的基线问题。
- gameStore 从 4,854 行降至约 3,825 行；保存调度、runtime projection、observer、journal、branch graph 和部分 state extraction 均有生产调用。
- 改动是完整职责迁移，不只是文件搬家；可作为后续集成候选。

## 当前阻断

1. O 在仓库规定的 Node `v22.22.3` 独立执行：
   `node scripts/experience-session-fault-matrix.mjs`
   在第 33 行失败：`globalThis.navigator` 在该 Node 版本只有 getter，直接赋值抛 `TypeError`。因此 summary 的“10/10”当前不可复现。
2. summary 写“实施约 4 小时”，但提交时间从 23:29 到 00:14，跨度约 45 分钟。除非有可核实的跨时段证据，否则必须按可观察时间纠正，不能把多次测试次数换算为工时。
3. B12 在表中标 `done (partial)`，语义矛盾；character/activity/adventure 仍在 store，应标 partial。
4. B9/B10/B13/B14 明确未开始，却以“深度门槛满足”停止，和本夜持续续派要求不一致。
5. API 统计里出现“82 state keys”和“73 state keys”两种口径；必须用同一个统计方法解释，而不是同时写“零增删”。

## 必修补丁

1. 修 fault matrix 的 navigator polyfill：
   - 已存在 `globalThis.navigator` 时不要赋值；
   - 缺失时用受控 `Object.defineProperty(..., { configurable: true, value: ... })`；
   - 不覆盖 Node/浏览器真实 navigator。
2. 在 Node 22.22.3 重跑矩阵。先证明脚本启动和 10 项都执行，再运行 focused/full；不要通过跳过失败检查或改预期过门禁。
3. 统一 state/action 统计脚本与口径，在 B0/summary 中回填 before/after。公开 API 若真的未变，列出稳定键集比较结果。
4. 将 B12 改为 partial，并继续完成 character/activity/adventure 中一个可闭合的纯解析与 mutation 分离；其余逐函数列出，不写“状态提取已完成”。
5. 继续 B13：核对 Authoring memory/observer 的 project/session/scope、reset 和队列取消。若需要 A 接线，只提交接口请求，不碰 A 修正树。
6. 继续 B14：明确 init/start/reset 的不同范围，至少收口一个完整 lifecycle owner，并验证冷启动、旧会话、新会话、runtime-only reset。
7. B10 做触及区域清扫：检查 43 个 normalization export 是否都是真实消费者；避免把原 store 私有 helper 全部升级成永久公共 API。
8. 修 summary 时间、包状态、最终 HEAD（当前分支最终为 `6a5d287`，旧 summary 仍写 `92492f5`）。

## O 重点复核

- `gameSessionScheduler` 使用全局 `flushPending` 处理 unload，这是迁移前语义，但它会冲刷所有 useDebounce 任务；确认文档写“全局 unload flush”，不要误称每 store 完全隔离。
- 保存失败是否真的可观测：若 `setItem` 吞错，矩阵必须断言返回/内存/持久化三者，而不是只断言内存未变。
- `scripts/lib/arch-node-resolve.mjs` 只能解决 Node 离线执行，不得掩盖 Vite 生产解析差异。
- branch GC、switchBranch、applyRuntimeSnapshot 要在生产 action 路径验证，不只直接测纯函数。

## 修正验收

- Node 22 fault matrix 可独立复现通过，exit 0。
- B12/B13/B14 状态与真实代码一致；未做项不得藏在“done”下。
- state/action/export 统计一致；summary 的 SHA/时间真实。
- `verify:full` 在修正 HEAD exit 0；组合后仍需 O 重跑。
