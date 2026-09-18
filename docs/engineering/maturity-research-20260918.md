# 历史/记忆、跑团与 Agent 成熟度调研（2026-09-18）

本轮是源码调研与下一夜计划，不是实现验收。Pinax 基线为 main `6bca059` 加当前未提交 UI/资料 WIP；没有启动 worker、合并分支、调用付费模型或部署。执行入口见[夜间计划](../plan/nightly-20260918-runtime-maturity.md)。

## 结论：已有可用切片，尚未形成长期可靠的运行系统

不用百分比衡量三个定位不同的项目。这里分为：L1 单点功能；L2 生产链闭环且有故障验证；L3 跨刷新、长历史、多角色与并发仍保持正确；L4 有长期使用及真实模型评测证据。分级针对能力，不代表整款产品评级。

| 能力 | Pinax 当前证据 | 参照实现 | 差距判断 |
|---|---|---|---|
| 正文历史/修订 | 已有版本、恢复、备份与按书隔离；上一轮验证过 209 修订 | Utopia 主要解决知识演变，不能替代文稿版本 | 不重建历史存储；补历史解释及来源关联 |
| 确认事实与双时间读取 | 提案/确认/纠正、故事轴与记录轴、生产 reader、ZIP 已接通 | Utopia 进一步处理区间收口、迟到事实、撤销、实体合并历史与派生关系 | 基础接近 L2；时序写入和治理距 L3 仍有一层核心能力 |
| 长期检索 | 有冻结 cursor、分页、来源投影；部分分支仍整批读入 | Utopia 有数据库时序查询与历史向量召回，但也有明确未完项 | 不能用“1 万条通过”推导所有查询都有界 |
| 角色知识 | 同伴只取场景公开投影，明确返回知识 reader unavailable | StoryForge 按参与者/角色投影并校验受限内容 | 安全降级存在，个体获知/遗忘/分支知识尚未闭环 |
| 跑团规则 | 2d6、资源、线索、场景、结局、待回应及归档已实现 | StoryForge 有正式命令、状态版本校验、KP 阶段协调与候选采用 | 规则切片达到 L2；自主 KP/同伴仍在 L1–L2 之间 |
| 工具调用 | 真实 plan/evidence/write 循环、预算、超时、取消、工具结果回传及 revision 检查 | StoryForge 有事件流、投影重放、检查点及候选/采用恢复 | 单轮执行有基础；统一持久 run 与副作用恢复是主要 L3 缺口 |
| 实际质量 | 有确定性测试和浏览器回归；当前没有本轮真实模型样本 | 上游源码存在评测入口，不等于已经证明其线上质量 | 双方都不能仅凭源码宣称 L4 |

## 固定的外部证据

2026-09-18 经 `git ls-remote ... HEAD` 确认，并通过固定 SHA 的 GitHub tree/raw 读取。没有把本机旧 clone 当最新版本，也没有运行上游全套测试。

- Utopia：[`ca4678084da46311c1d24cb65d05f340d8903e54`](https://github.com/deeplethe/utopia/tree/ca4678084da46311c1d24cb65d05f340d8903e54)，Apache-2.0；本机 clone 仍为 `dbb92981`。关键代码：[temporal.rs](https://github.com/deeplethe/utopia/blob/ca4678084da46311c1d24cb65d05f340d8903e54/crates/utopia-store/src/temporal.rs)，关键决策：[0019](https://github.com/deeplethe/utopia/blob/ca4678084da46311c1d24cb65d05f340d8903e54/docs/decisions/0019-the-second-clock-can-be-rewound.md)、[0022](https://github.com/deeplethe/utopia/blob/ca4678084da46311c1d24cb65d05f340d8903e54/docs/decisions/0022-an-unknown-date-is-not-an-open-one.md)、[0026](https://github.com/deeplethe/utopia/blob/ca4678084da46311c1d24cb65d05f340d8903e54/docs/decisions/0026-a-decision-records-why.md)、[0027](https://github.com/deeplethe/utopia/blob/ca4678084da46311c1d24cb65d05f340d8903e54/docs/decisions/0027-an-automatic-merge-is-gated-by-what-it-can-undo.md)。
- StoryForge：[`1935dab9670069f1336be0b09c096c1444bbada6`](https://github.com/yuanbw2025/storyforge/tree/1935dab9670069f1336be0b09c096c1444bbada6)，MIT，版权 `2026 yuanbw2025`。关键代码：[KP coordinator](https://github.com/yuanbw2025/storyforge/blob/1935dab9670069f1336be0b09c096c1444bbada6/src/lib/ttrpg/kp-coordinator.ts)、[runtime commands](https://github.com/yuanbw2025/storyforge/blob/1935dab9670069f1336be0b09c096c1444bbada6/src/lib/ttrpg/runtime-commands.ts)、[checkpoint](https://github.com/yuanbw2025/storyforge/blob/1935dab9670069f1336be0b09c096c1444bbada6/src/lib/agent/run/checkpoint.ts)、[tool registry](https://github.com/yuanbw2025/storyforge/blob/1935dab9670069f1336be0b09c096c1444bbada6/src/lib/agent/tool-registry.ts)。

上游也有边界：Utopia 0019 明列历史全文召回、证明链版本与图页双时间控件未完全收口；0027 的执行 gate 当前只覆盖合并，并非所有 Agent 写操作。StoryForge 检查点仍有全事件读取，KP 待恢复查找也有 `.toArray()`，其规模表现不能照单全收。上游实现是可复用参照，不是无缺陷标准答案。

## Pinax 源码核查及优先风险

### 记忆：有更正操作，不等于有完整时序协调

`src/services/memory/ledger/factLedger.js` 已有 `correctFact`，更正保留旧版本；缺口不是“不能改事实”，而是新断言到来时对同一状态关系自动提出区间收口、迟到补录和冲突解释，并在确认后原子保存。Utopia `reconcile_new_fact`、`close_superseded`、`close_with_unknown_end`、`correct_interval` 可作为算法与反例来源。不能把所有关系都当单值状态：事件、永恒关系和多值关系需要不同策略。

`queryFacts.js:140` 的 recordedAt 截止解析读取整个 scope 的 decisions；`:171` 起 subject 分支逐主体 `.toArray()`，主体最多 8 个并不限制版本总量。普通分页有 MAX_SCAN，但不能覆盖这两条路径。首夜应加入单主体大量版本的反例，而不是重复普通分页样本。

`ledgerProductionAdapter.js` 先投影最多 12 条，再做关键词过滤。这证明“接入生产”不等于“能找到较旧但相关的事实”；应以大量新无关记录覆盖旧相关记录的查询验证召回，保留预算与 completeness，而不是直接扩大 prompt。

`storyInterval.js` 读取会把缺乏时间证据标成 unknown；展示函数对无 end 的描述也应纳入 unknown/open 一致性反例。未知时间不能因 UI 文案变成“此后一直成立”。

### 跑团：主持预算与模型主持是两回事

`roleplayHost.js` 每步完成回到 `awaiting-player`，提供确定性预算和停机边界；尚不能据此宣称完整自主 KP。`roleplayCompanion.js` 当前选择第一个公开线索动作或出口，`buildCompanionKnowledgeContext` 返回 `scenario-public-only`、空 facts 和 `unavailable:character-knowledge-reader`。这是有意避免泄漏的降级，不是模型理解角色目标后的行动。

StoryForge KP 已调用 director / narration / GM actor / AI player 的生成与采用链，遇到真人回应、选择、暂停、预算就停；通过 checkpoint 查找未完成候选，并有 Web Locks 与进程内锁。值得复用的是这个协调闭环，不能只抄阶段名称或界面。

### Agent：单轮控制较完整，持久性和作用域需要贯穿

`agentExecutionEngine.js` 是路由分发器；实质循环在 `narrativeAgentOrchestrator.js:898` 起，已经处理计划工具、资料查询、正文、预算、取消、资料 revision 变更与结果轨迹。`agentResultTransaction.js` 检查 effectPolicy 和 revision 后调用 adapter；它本身不保证多个存储写入原子，也不能证明所有 adapter 失败后可安全重试。

目前检查的循环中 transcript、工具结果和预算主要在函数内存；领域里的 outbox/归档/候选恢复不能直接当作通用 run 检查点。先对一个生产工作流接入持久 run，验证完成步骤不重复、未知外部结果不自动重试，再讨论推广。权限检查必须在调用执行处成立，而不只是从 prompt 隐藏工具；beat-plan 特殊分支应做阶段权限回归，目前不把它未经验证地定性为漏洞。

## 旧分支去重

`git log main..branch` 不能直接判定未集成，因为上次有选择集成。对 `night/memory-quality-20260917` 实际文件 diff：memory 服务尚有 extractionRunner 的单飞 guard，以及 extractionJobStore 的来源一致性字段增补（合计 2 文件、17 additions/1 deletion）；先复验后选择性接入，不能整分支覆盖 main。来源 UI 在当前 WIP 另有补丁，必须单独核对。

`night/roleplay-20260916` 虽仍有很多 main 不包含的提交 SHA，其交付代码已通过集成进入主线，不能按 commit 数重新排工；以当前 `roleplayHost` / `roleplayCompanion` 和真实调用路径为准。原 AX/CX/NC 编号只保留追溯，不继续把旧回执数字充当当前完成度。

## 复用优先，而非重新设计整套框架

用户明确要求成熟开源实现优先复用。每项开发前提交可复用清单：固定 SHA、原文件、许可证、依赖闭包、直接移植/适配移植/不适用理由、上游测试和本地验证。禁止只有“借鉴思路”却重新写出已有的等价模块。

| 来源 | 优先复用对象 | 适配边界与停止条件 |
|---|---|---|
| StoryForge `src/lib/agent/run/` | checkpoint 的哈希/重放校验，以及其 hash、event-schema、projection 依赖 | 先读完整依赖闭包；优先移植可独立纯函数，再接 Pinax scope/store adapter。不能单拷 checkpoint 后伪造 event store |
| StoryForge `src/lib/ttrpg/` | KP 协调、命令幂等/版本校验、角色投影与受限内容检查 | 复用协调逻辑，替换本项目状态与生成采用端口；保留现有骰子/资源实现。文本泄漏检查不能替代输入投影权限 |
| StoryForge 评测 | 刷新恢复、重复 command、真人接管等可独立 fixture/断言 | 移植适用场景，不为搬测试引入整套产品数据库或 React UI |
| Utopia `temporal.rs` 与 temporal bench | 时序协调算法、冲突判定和迟到/未知终点反例 | Rust/Postgres 不能直接导入 Vue/Dexie。先评估纯算法的最小跨语言移植；保留来源、语义与许可。首夜不引入 Rust 服务，不移植整个知识图谱 |
| Pinax 既有领域模块 | 确认账本、预算、骰子、outbox、工具 provider adapter | 这些已经存在，不以“统一”为由替换成第二份实现 |

直接移植/翻译衍生代码保留版权、许可与修改说明，检查上游 NOTICE（如有）和文件级许可；复用代码不自动授权复用人物、剧本、图片等素材。具体可独立文件仍需执行阶段读取全文和依赖核验，本轮不把候选清单写成已经完成移植。
