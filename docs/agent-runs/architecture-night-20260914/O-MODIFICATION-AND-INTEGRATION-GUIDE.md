# O 修改与集成指导（2026-09-15 独立初验）

状态：三线均已交付分支，但**当前没有一条可直接无条件合并**。先按本文件修正，再进入组合树。

## 独立初验结论

| 线 | 基线 | 代码价值 | 当前阻断 | 处理 |
| --- | --- | --- | --- | --- |
| A | 修正树正确：`37e0679`；复验 `f6e158b` | host/reference owner、死服务删除与 skill 修订方向成立 | reference scope 把函数误作 `.value`，辅助上下文绕过 gate；IME/取消/采纳异常未闭环 | 按 A 二次指导继续修正树 fix-forward；旧错基线分支仍禁止合并 |
| B | 正确：`37e0679`；复验 `fc19801`/`5e0d12c` | gameStore 职责实质迁出；Node 20/22、API 口径及首轮状态已修 | `5e0d12c` 在 `applyRuntimeSnapshot` 内同步/保存会制造半事务；矩阵与 full 虽绿但未覆盖 fresh reload 外层事务 | 按 B 二次指导收口事务提交点 |
| C | 正确：`37e0679`；复验 `8bb8256` | Notes owner 拆分、不同 id 保存失败保护和异步错素材修复成立 | `loadNotes()` 混合刷新/重装；同 id 重载、删除其他素材及异步回调仍可覆盖草稿 | 按 C 二次指导继续 fix-forward |

分线修改文件：

- A 修正树：`a/O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md`（旧错基线指导仍保留）
- B：`b/MODIFICATION_GUIDE.md`
- C：`c/MODIFICATION_GUIDE.md`

## 当前“完成”声明的纠正

- A 修正树 summary 已替代旧错基线 summary，但仍须补精确最终 SHA、scope/IME 修复证据并纠正截图与“无失败”表述。
- B summary 的 4 小时与提交时间跨度不符，且矩阵当前在 Node 22 失败。
- C summary 的起止时间与提交时间不符，保存失败语义判断错误。
- A 在 00:37–07:40 有约 7 小时提交空档却写“连续、无等待”；提交时间不等于 active 时长，但三线都必须给可解释的 active/blocked/waiting 区间，不能用测试轮数折算工时。
- 公共 D1–D8 仍只有各线供稿，README/current-architecture/code-map/known-issues 尚未由 O 正式合入。
- S0–S8 只完成了分线 S2/S3/S4；S1、S5、S6、S7 汇总、S8 一致性仍需 O 实施。不能写“skill 学习闭环完成”。

## 续派顺序

1. **A-R1 生命周期二次收口。** 正确基线修正树已建立；统一 reference 请求前 scope gate，恢复 IME nextTick 时序，区分用户拒绝与临时取消，并补采纳异常回滚。
2. **B-R1 恢复事务收口。** 投影只改内存，switch/undo/failure/regenerate 在最终一致态同步 session 并立即落盘；修恒真/弱断言和脚本 shell 拼接，重跑双 Node 矩阵。
3. **C-R1 数据安全二次收口。** 拆开 catalog refresh 与 editor activation；修同 id 重载、顾问 domain stale 和 mutation 假成功，扩充 J6a–J6d；更新 summary。
4. 三线修正期间，O 串行审阅共享 `uiControlContract.test.js` 修改，不接受两份不同分支各自覆盖。
5. O 同步完成 D1–D8 与 S0/S1/S5/S6/S7/S8；公共文档只按组合后的最终行数/owner 更新。

## 候选组合顺序

1. 从 main `37e0679` 或其后无冲突新基线建立独立 integration worktree。
2. 合入 B 修正分支；运行 gameStore focused + Node 22 fault matrix。
3. 合入 C 修正分支；解决共享测试一次，运行 notes smoke 和保存失败旅程。
4. 最后合入**A 修正分支**，绝不合入旧 `night/arch-a-20260914` 整支。
5. 串行应用三个 skill 修改，执行 agent-maintenance：frontmatter、shims、AGENTS 触发表、重复/冲突规则。
6. 应用 D1–D8：README、src/README、current-architecture、docs 首页/code-map、known-issues/test-status、PLAN/STATUS/LOG/current board。
7. 组合树运行 full 和代表浏览器 Gate；只在组合结果通过后更新最终状态。

## 必须人工看 diff 的风险点

- A：Authoring 不得复活 37e 基线删除的 workflow/页面/Kao 文件；服务删除重新证明消费者。
- B：session writer 的全局 unload flush、switchBranch/GC、runtime restore、observer reset。
- C：失败保存、切换顺序、顾问 revision、异步画布归属、共享源码断言。
- Skills：纠正已有错误规则，不把事故记录无限堆进 SKILL；长案例留回执。
- Docs：备份含正文/素材文字，低敏诊断不含正文；两者不能共用“不含正文”描述。

## 组合验收门槛

- 三条修正分支均以共同基线为祖先，worktree clean，summary SHA/时间/状态真实。
- A 无大规模反向 diff；B 的 fresh reload 矩阵证明 branch/runtime/messages/chatHistory/turnRecords 原子一致；C 的目录刷新、同 id 重载和 mutation 失败均不丢编辑器输入或产生假成功。
- `verify:full`：20/20 文件、200/200 用例、Vite/VitePress、diff 全绿。
- 浏览器脚本至少覆盖 Authoring inline/参考、Experience session/branch、Notes 保存失败/异步归属。
- D1–D8 和 S0–S8 有实际公共文件改动与案例表，不只存在供稿。
- 未做项逐包标 partial/not-started；不得以“夜间全部完成”覆盖上述阻断。

## 禁止动作

不 reset/删除原 worker 分支，不直接 merge 错基线 A，不 force push，不改 server-version，不 push 远端，不借修证据放宽测试预期，不把真实模型或用户视觉判定冒充自动完成。
