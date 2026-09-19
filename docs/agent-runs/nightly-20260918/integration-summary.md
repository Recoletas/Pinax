# 2026-09-19 夜间交付组合验收

证据等级：组合验证；不是用户视觉确认或真实模型质量验收。本轮仅本地合并，不推送、不部署。

## 范围与裁决

基线 main `bd111fa`；冻结 A `19f5386`、B `d21f793`、C `48e2fcf`。独立集成树 `pinax-integration-20260919`，分支 `integration/nightly-20260919`。

采用 A 的记忆域与阶段工具门禁、C 的 run/跑团生产链及连续旅程、B `1e9e005` 的工具授权；B 的回滚状态重取与严格候选思想适配进唯一 C KP。不是三条来源分支的全量 ancestry merge。保留全部来源分支/工作树，B 未跟踪 run 副本未纳入。主线今日 UI/CI 与 HTTP UUID 修复保留。

组合审查修复：保存失败必须停机；生成前落盘预算与 pending；sendAction 回滚替换状态后重新定位 live run；异步换会话不得写入新会话；模型返回空候选不冒充确定性成功；同伴候选拒绝额外字段/超长文本；角色知识 scope 缺失时拒绝；采用后清理候选。新增失败注入并复验。

复用保留源码归属与固定版本说明，补 StoryForge MIT / Utopia Apache-2.0 声明及许可证。Utopia LICENSE 内容完整，与上游只差尾部空行。

## 实际验证

以下均在组合树运行，浏览器评测使用隔离测试数据，不调用付费模型、不接触用户数据。

| 命令（scripts 下） | 实际结果 |
|---|---|
| experience-roleplay-eval.mjs | exit 0，315 passed / 0 failed；含保存失败、回滚替换 live state、换会话、候选越权反例 |
| experience-roleplay-smoke.mjs | exit 0，60 passed / 0 failed，含连续旅程与刷新恢复 |
| agents-tool-authz-eval.mjs / agent-tool-guards-eval.mjs | exit 0，22/22 与浏览器 10/10 |
| extraction-singleflight-eval.mjs | exit 0，并发恰好一个 skipped，结束释放 |
| memory-retrieval-bounds-eval.mjs | exit 0，单主体 100 页无重复；多主体 900 条/9 页；扫描有界与 partial-scan-limit |
| memory-temporal-coordination-eval.mjs | exit 0，10/10 |
| memory-temporal-adoption/endpoints/revert-eval.mjs | 三个命令均 exit 0，含真实 IndexedDB 与采用 UI |
| memory-knowledge-eval.mjs / memory-companion-reader-eval.mjs | 均 exit 0，角色/作用域/双时间/秘密隔离；reader 为注入端口 |
| memory-evidence-audit-eval.mjs | exit 0，数据与 UI；revision provider 是注入 fixture |
| memory-extraction-cache-eval.mjs / memory-history-ui-eval.mjs | 均 exit 0，LRU50/修订、事实/来源/更正/重试 |
| http-uuid-smoke.mjs | exit 0，非安全 HTTP 原生 UUID 缺失及 localhost 两种环境通过 |
| npm run ci:workspace-backup-smoke | exit 0，真实 ZIP 下载/恢复/刷新/重复导入与 IndexedDB 写失败补偿通过 |

十万条规模评测的来源脚本只走 250 页/50000 条却硬编码“完整”，已修正为最多 600 页并强制断言全部 100000 条与 cursor 耗尽。`PINAX_SCALE_EVAL_URL=http://127.0.0.1:5267 node scripts/memory-scale-query-eval.mjs` exit 0：500 页/100000 唯一项，最终 complete；单页扫描 P50/P95 均 500，查询延迟 P50 6 ms / P95 12 ms（不是全流程耗时）。深埋匹配返回 partial-scan-limit，20499 扫描/460 ms；分页中更正快照隔离通过。

最终工程门禁：`npm run verify:full` exit 0；20/20 files、200/200 tests、lint、Vite、架构预算、diff、VitePress 均通过。测试预算未扩容，production cycles 为 0。

实际查看本轮跑团主持截图：主动作清晰、沿用既有场景和正文工作区；横向辅助动作仍密集，不能算 UI 精修完成。历史 UI 有功能回归，本轮未单独完成所有尺寸的视觉验收。

## 后续边界（不预记完成）

- M06 来源审计 provider、M10 角色知识 reader 已有接口/fixture，不等于真实来源 revision 和生产同伴读取接线。
- R03/R04 模型同伴为可注入 seam，director 为确定性逻辑；未做真实模型长期质量验收。
- run 恢复在跑团范围；外部生成与本地回执之间的崩溃窗口、未完成 narration 的精确重用、待确认候选连续点击语义仍需专项收口，不承诺 exactly-once。预算预扣与已完成回执并非通用事务引擎。
- Web Locks 缺失的 HTTP 环境只有同实例互斥，不保证跨标签锁。
- 提取缓存按来源/修订/原文冻结，身份列表变化会重校验但不会重新生成候选；后续把 prompt/身份上下文纳入键。
- T09–T12、通用叙事/作者侧持久化推广仍未完成；其余储备不因共享合同自动结项。

下一轮从整合后 main 续作，优先补真实 provider/知识/来源审计接线及上述恢复窗口，再推广通用工具链。技能约束影响：保留核心测试预算，通过显式 eval 扩展反例、重跑完整门禁，按证据纠正状态；本次无需新增技能规则。
