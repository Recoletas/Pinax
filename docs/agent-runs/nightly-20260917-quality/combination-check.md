# 三线组合验收记录

时间：2026-09-18 01:00。执行者：N-B 会话（在 N-A/N-C 回执完成后主动补位 §6「组合后再跑一次」）。
性质：**验证运行**，不构成第四条集成线——分支仅供白天参考，正式合并按依赖拓扑由 Codex 执行。

2026-09-18 白天由 Codex 独立复验；结果通过，并以 merge commit `c7ca33b` 合入 `main`。以下夜间预演结果保留，新增结果以白天复验为准。

## 组合树

`night/quality-integration-check-20260918@c732932` = main@c445dd4 + N-A(`3ca3b0d`) + N-C(`c01d209`) + N-B(`63c7db1`)。
三线按序合并**零冲突**（写区互不相交：N-A=worldbook/sources、N-C=memory/Authoring、N-B=UI 壳/标注）。

## 结果

| 门禁 | 结果 |
| --- | --- |
| verify:full（20 文件/200 用例、lint、双 build、预算、diff、VitePress） | exit 0 |
| 架构预算 | Authoring 10868/10900、Experience 3546/3550、gameStore 30/30 —— 全部在限 |
| ui-controls-audit（12 路由 × 1440/390 × 亮暗） | serious/critical = 0 |
| workspace-tabs-interaction-smoke | 5/5 |

## 白天独立验收

| 门禁 | 结果 |
| --- | --- |
| `npm run verify:full` | exit 0；20/20 文件、200/200 用例，lint、生产 build、结构/构建预算、diff、VitePress 全通过 |
| `node scripts/memory-quality-check.mjs` | exit 0；15/15，含噪声准入、会话合并、引文校验、来源更新和 UI→任务→提案旅程 |
| `node scripts/sources-journey-smoke.mjs` | exit 0；按书绑定、好坏文件分批、冲突处理、软移除、ZIP 往返与 390px 溢出检查通过 |
| `memory-ledger-smoke` / `memory-ledger-continuation-smoke` | exit 0；UI/响应式/控制台、1 万事实与回执、5 千旁路记录、双页竞争通过 |
| `memory-history-smoke` / `settings-linkage-check` | exit 0；209 修订与恢复、ZIP/配额/作用域，以及设定联动 20/20 通过 |
| `workspace-tabs-interaction-smoke` / `ui-controls-audit` | exit 0；5/5；12 路由 × 1440/390 × 亮暗无 serious/critical 问题 |

## 遗留（白天）

- A 侧装配阻塞已由组合后的资料旅程与记忆质量门禁解除。
- 真实 LLM 提取样本、ZIP 中途失败注入、真机 IME 未执行，不计入本次通过范围。
- 结构余量偏紧：`Authoring.vue` 10868/10900，`Experience.vue` 3546/3550；本次均未越线。
