# 2026-09-18 夜间 C 线回执（G 批可恢复执行 + R 轨重复交付 + T 轨）

计划：[nightly-20260918-runtime-maturity](../../plan/nightly-20260918-runtime-maturity.md)。worktree `/home/recoletas/jiuguan/pinax-night-runtime-c-20260918`，分支 `night/runtime-c-20260918`，tip `5e447e6`（6 提交，未 push）。基线 main `6bca059`（主工作区 UI WIP 未触碰；main 现已推进到 `bd111fa`，本分支未 rebase，留集成）。

## ⚠️ 与 B 线撞车（集成负责人必读，最新事实）

用户给三线的分工（见 B 线任务板记录）：**A=M 方向（记忆）、B=R 方向（跑团 KP）、C=G 批+T 方向**。本线开工时按前两夜惯例（C 持 roleplay/coordinator 域）误推了分工：把 B 的 R 轨整队也做了；B 线也越界交付了 T02。现状（本回执为最新，B 线回执写于本线 tip=`2218d17` 时，其后本线又推进了 4 个提交）：

| 冲突物 | C 线（本分支，已提交） | B 线（night/roleplay-b-20260918，已提交） | 仲裁现状 |
|---|---|---|---|
| G2a run 合同 | ✅ runContract.js（两家共用） | 消费方 | 无冲突（B 已 import 本线文件） |
| G2b run 账目 | ✅ `state.runs` + roleplayRuns.js 五生命周期 | `state.kpRun` 单字段 | **建议保留 C**（覆盖面/反例更多）；B 适配点小 |
| KP 协调器 | ✅ roleplayKpCoordinator.js：**R05–R12+主持 UI+20 轮旅程全建在其上**（companionCandidateProvider 注入、getRoleplayKpStatusView、runLock 外守卫） | 纯函数+端口注入版（kp-eval 64） | **二选一不可双合**。B 回执"放弃 C 未提交 v2"的建议已过时（C 版现已提交且有全链下游消费者）；若裁 B 版则 C 的 R05–R12/UI/旅程需移植适配——工作量与风险请 O 权衡 |
| R03 模型候选 | resolveCompanionProposal + 白名单硬校验 + source 标注 | 闭集解析+提示词+候选持久化 | 互补可合并；`source:'deterministic-whitelist'\|'model'` 字段是纯增量 |
| T02 工具授权 | 未做（B 越界代做） | toolExecutionAuthorization.js（authz-eval 22） | 直接保留 B 的 |
| CX06 僵尸 pending 修复 | ✅（基线 6bca059 即红，干净基线已复现） | 确认 C 修复顺带修好 smoke journey 6 | 保留 C |

**合并顺序硬约束不变**：B import `../run/runContract.js` → C 先合、B 后合；`roleplayKpCoordinator.js` 文件级冲突必须人工裁定，不可自动合并。

## C 线本职（G 批 + T 轨）状态表

| ID | 状态 | 交付 | 验证 |
|---|---|---|---|
| G0 | verified | worktree+分支冻结基线；基线门禁；NC 补丁归属复核（2 文件 +17/−1，归 A） | 基线 verify:full exit 0 |
| G2a | verified | run 合同（RunIdentity/七态/StepReceipt effectKey+commitReceipt/恢复计划/规范化哈希同步化） | eval G2a 14 项 |
| G2b | verified | run 账目接生产链 + 载入扫描 interrupted + 终态 LRU + stale 视图 | eval G2b 30 项；smoke §13 |
| G3 | verified | 真实 coordinator 刷新恢复；顺带修复基线缺陷（僵尸 pending、sendAction 不回传、状态机 awaiting-human 不可达终态） | smoke §13；CX06 复绿 |
| G4 | verified | 完整门禁 + 刷新/跨会话/取消/存储失败回归 | 最终 verify:full exit 0 |
| T01 | partial | canonicalize/canonicalStringify+恢复计划分类已移植（blob SHA 核对、MIT 留存、无 NOTICE）；上游 event-store/event-schema/projection 未移植（Dexie schema+types 闭包，且本项目持久化形态不同）——边界如实记录 | runContract.js 文件头复用回执 |
| T02 | verified-existing（在 B 分支） | toolExecutionAuthorization.js（phase×tool 矩阵），本线未重复实现 | B 线 authz-eval 22 |
| T03 | **blocked** | 依赖 T02 落本分支（在 B 分支上，等合并仲裁），跨分支不擅自移植 | — |
| T04 | verified | classifyRunStepFailure：429/超时/中止→可重试 failed；不确定副作用写→unknown；unknown 不进 resumable（不盲重）；failTurnRunNarration 贯穿 | eval T04 6 项 |
| T05 | verified-existing | 预算随 run 持久：hostPlan（预扣/暂停保留）+ run.budget 镜像；刷新/恢复累计不清零 | eval「R01 budget 镜像持久」「R02 预算耗尽」 |
| T06 | verified-existing | effectKey 唯一 + commitReceipt + 同 ID 异 hash 回执拒 + 丢响应后 pending resolved 显式重发（reconcile=读已提交回执，不盲重） | eval G2b/G3/R05/R06 各段 |
| T07 | verified | runLock.js：Web Locks ifAvailable 跨标签锁 + 崩溃自动释放=过期 owner 恢复 + 无锁环境降级（lockHeld=false 如实）；接 KP 周期外守卫（另一标签 busy 零消耗） | eval T07 6 项 |
| T08 | verified | 恢复前校验：KP 冻结提案采用时 revision 硬门（ROLEPLAY_PROPOSAL_STALE 带冻结/当前值）；每拍后刷新 run 快照防误判 | eval T08 2 项 |
| T09 | queued | 依赖 T08 ✓/T04 ✓/T05 ✓——恢复运行列表/阶段耗时/用量/停机原因的字段已由 run 摘要+恢复视图暴露，缺诊断页接线；留下一窗口（仲裁后做，避免协调器层返工） | — |
| T10–T12 | **blocked** | T10 需作者侧候选工作流（跨 B 面板域）；T12 依赖 T03（B 分支） | — |

## R 轨（越界代做，已全链交付待仲裁）

R01 KP 有界主持周期 / R02 统一状态 / R03 模型白名单候选 / R05 结算共用通道 / R06 命令幂等版本 / R07 连续旅程到确定性结局 / R08 跨会话边界 / R09 分支隔离 / R10 主持界面（主持一场+暂停继续+新一批+错误恢复入口，a11y 2/2）/ R11 收集进稿保留来源（originRef sessionId/branchId/turnId，重复收集指纹幂等）/ R12 20 轮生产旅程（确定性替身，**真实模型 Gate 未运行**）。R04 **blocked** 等 A 线 M10 角色 reader（companionCandidateProvider 注入口已留）。R 轨（越界代做，已全链交付待仲裁）逐项验证证据见本回执验证命令与 eval/smoke 段落标记（R01–R12 各段 60+ 项检查）。

## 复用回执

StoryForge @ `1935dab9670069f1336be0b09c096c1444bbada6`（MIT，blob SHA 逐一核对）：hash.ts→runContract（同步化）；checkpoint.recoveryPlan→buildRunRecoveryPlanV1；kp-coordinator→roleplayKpCoordinator（适配移植：db/harness→Pinax 状态与唯一生成链；Web Locks→runLock）。上游快照 `/home/recoletas/jiuguan/upstream-storyforge-1935dab…/LICENSE`（无 NOTICE）。上游边界：checkpoint 全事件读取与 KP `.toArray()` 规模问题未照搬。Pinax 既有（contentHash/hostPlan/骰点资源归档幂等端口/收集链）直接复用。

## 验证命令与结果（tip `5e447e6`）

- `npm run verify:full`：**exit 0**（20/20 files、200/200 tests 顶格、lint-delta 0 新增、双 build+架构检查过）
- `node scripts/experience-roleplay-eval.mjs`：**311 passed, 0 failed**（本夜新增 117 项）
- `node scripts/experience-roleplay-smoke.mjs`：**60 passed, 0 failed**（新增 G3 刷新恢复/R10 主持/R11 收集三段）
- `node scripts/experience-roleplay-a11y.mjs`：2/2
- 真实模型 Gate：未运行（无渠道/额度）——只宣称确定性工程闭环，不宣称成熟 AI 跑团

## nextReady

1. **集成仲裁（最高优先）**：协调器二选一 + 合并顺序 C→B；裁定后败方做小适配。若保 C 版：B 的 kp-eval 需按 C 的 API 改写，B 的 T02/authz-eval 原样保留；若保 B 版：C 的 R05–R12/UI/旅程移植适配（本回执列出全部消费面）。
2. **R04**：等 A 线 M10 合并后在 `roleplayKpCoordinator.js` companion 阶段注入 M10 reader（接口已留）。
3. **T09**：仲裁落地后把 run 摘要/恢复视图接进诊断轨迹页（字段已备齐）。
