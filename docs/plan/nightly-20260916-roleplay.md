# 2026-09-16 夜间 C 线：借鉴 StoryForge 的跑团闭环

> 2026-09-17 当前状态：C首批已提交 `0f0eea2`，未组合验收、未获用户试玩确认。**继续执行请读[48项续跑任务](./nightly-20260917-roleplay-continuation.md)与[ABC无O调度](./nightly-20260917-ac-dispatch.md)**。下文R00–R29保留首批规格；旧文O夜间职责已交ABC，不能以首批掷骰入口作为整线完成。

## 1. 本夜究竟交付什么

交付一段能真正玩的、能失败恢复的短冒险：选定已有世界书与角色，明确本场目标，提出行动，必要时先确认一次确定性检定，看到主持回应和可追溯的结果，继续、暂停、刷新恢复，最后显式把一段经历收藏为素材。全部继续使用 Pinax 的工作台标签、体验会话、回合事务和资料所有权。

优先级不是“增加更多面板”，而是把以下四件事做可靠：

1. 玩家知道现在轮到谁、可以做什么，以及为何要检定。
2. 骰点和机械结果不由模型临时编造，重复请求不重复扣资源。
3. 回复失败不丢行动、不偷偷重掷、不污染另一会话或分支。
4. 读起来仍是一个故事；工具、日志和规则按需展开，与首页设计一致。

最低交付只承诺**轻量 2d6、单一人类角色、单次动作**。完整 AI KP 自动轮转、AI 同伴、同机交接、规则包编辑器、联网多人、完整战术桌面属于后续，不靠把入口画出来冒充完成。

## 2. 调研方法、证据强度与固定版本

调查日期：2026-09-16。上游仓库：[yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge)。使用 GitHub tree API 确认本次基线为 `cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed`，再通过固定 SHA 的 raw 源逐个读取相关实现。浏览器 README 是产品范围证据，源码是静态实现证据；**没有启动上游产品、没有运行上游测试、没有据此宣称上游真实模型质量优秀**。

审阅用 clone 路径曾创建于 `/tmp/pinax-storyforge-rpg-20260916`；下载慢时改用固定 raw 文件读取，临时目录不是交付物或唯一证据来源。夜间若上游发生变化，不自动跟最新；重新比对、更新来源清单后才采用。

### 2.1 实际读过的上游文件

以下链接均固定到调查 SHA，不把文件名存在当作功能完成的证据。

| 来源 | 实际观察 | 对 Pinax 的意义 |
|---|---|---|
| [README](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/README.md) | 明示本地单人 + AI 同伴或同机交接；原创 2d6；公共联网尚未部署 | 跑团与远程联机必须分开验收 |
| [dice.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/dice.ts) | 闭合骰式语法、数量/骰面/修正上限；uint32 拒绝采样避免模偏差；可注入确定性样本；有抽样 trace | 优先直接适配的纯算法候选，不重新手写一套骰式解析 |
| [storyforge-rule-pack.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/storyforge-rule-pack.ts) | 规则数据明确 2d6 的成功/部分成功/失败前进、属性与资源；机械结果交给确定性规则引擎 | 先借鉴少量明文规则，不把整个规则 DSL 和所有资源系统一起搬入 |
| [runtime-commands.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/runtime-commands.ts) | commandId、baseSequence、baseStateHash；冻结运行源校验；同 ID 不同内容拒绝 | 同一行动有稳定身份、旧状态不能被异步结果覆盖 |
| [kp-coordinator.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/kp-coordinator.ts) | directing / narrating / npc / companion 分工；可恢复 run；真人回合、选择、安全暂停、结局都会停止；预算默认 4 且范围 1–8；Web Locks + inFlight | 借鉴有界主持与显式交还控制，首夜不引入多模型自动循环 |
| [viewer-projection.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/viewer-projection.ts) | GM/player/spectator 投影，角色私密字段、线索可见性、近期动作、资源和行动权限 | UI 与模型都读取权限裁剪后的投影，不把完整世界书交给每个角色 |
| [information-boundary.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/information-boundary.ts) | NFKC/标点归一和私密片段匹配；注释明确不承诺语义不披露 | 只能作为纵深防御，不能包装成“不会剧透”的安全证明 |
| [runtime-branch.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/lib/ttrpg/runtime-branch.ts) | 按回放位置克隆参与者/媒体侧表；分支不携带旧媒体 lease | 分支恢复不只是复制聊天文本，外部副作用需明确截断位置 |
| [TtrpgPlayTable.tsx](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/ttrpg/TtrpgPlayTable.tsx) | 起团约定、角色与模式、当前行动者、行动/目标选择、暂停、检查点、隐私交接；统一 perform 包裹取消/错误/重读 | 借鉴完整流程和状态命名，不复制 React 页面进入 Vue |
| [TtrpgTabletopSurface.tsx](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/src/components/ttrpg/TtrpgTabletopSurface.tsx) | token 控制权、移动、距离、迷雾与图层，基于 viewer projection | 这是后续能力，不在本夜重造地图；它的微小字号也不是 Pinax 视觉基准 |
| [R-TTRPG4E-information-boundaries.test.ts](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/tests/regression/R-TTRPG4E-information-boundaries.test.ts) | 包含截断 JSON 阻断、标点绕过、公开证据授权、误传全量 GM 投影再次裁剪的断言 | 转译为 Pinax 自己的攻击性用例，不能以“上游有测试”替代本地验收 |

### 2.2 值得吸收的经验与不照抄的部分

**吸收：**提出行动与结算分离；确定性 receipt；玩家/主持/旁观者投影分离；有预算的自动主持；冻结玩法来源；检查点可恢复；规则数据与表现层解耦。

**不照抄：**上游全套 ProductBuild/ProductRelease/数据库结构、React/Zustand 页面、默认每次事件滚到底部、战术桌面的小字号、完整 d20/d100/能力装备规则、自动多角色循环、把私密字符串过滤当成语义安全。Pinax 目前的稳定 owner 与已接受主页视觉必须保留。

## 3. 开源复用与许可证工作单

[上游 LICENSE](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/LICENSE) 为 MIT，版权标注 `Copyright (c) 2026 yuanbw2025`。本仓库根许可证是 PolyForm Noncommercial 1.0.0，不能因此删除被复用第三方代码的 MIT 声明，也不在这条线擅自变更 Pinax 根许可证。

实施前必须完成：

- 对实际复制/翻译的文件保存 upstream URL、SHA、原路径、原版权/许可、修改说明；统一第三方声明文件由 O 管理。
- 优先移植 `dice.ts` 的解析、范围校验和拒绝采样纯函数；去掉上游 type barrel 依赖，保留原算法与归属说明。适配文件候选 `src/services/experience/roleplay/third-party/storyforgeDice.js`。
- 不把来源清单写成“整个 StoryForge 已引入”。没有复制的架构只写“设计借鉴”；代码复用与设计参考分别标注。
- 2d6 原始规则文件内另有第一方内容许可元数据；导入完整规则正文前确认其具体范围及与根 MIT 的关系。首夜可用独立编写的轻量规则说明，算法来源仍保留；不能用重命名掩盖实际复制。
- 仓库还包含 SRD 5.2.1 / CC BY 4.0 许可路径，不能从根 MIT 推断所有模组、规则和媒体均同许可。本夜不复制 D&D 品牌、第三方模组、美术或示例角色设定。
- 若复用函数需要上游数据库/发布系统的大量依赖，停止整包引入，改取纯函数或接口思想并在回执说明理由。
- RNG 不用模型生成，也不用 `eval` 解析；不把可预测本地骰点宣传为远程防作弊。离线可复现与竞技公平是两个不同目标。

## 4. Pinax 现状：已有基础不能推倒

| 本地实际路径 | 现状 | 本夜处理 |
|---|---|---|
| `src/pages/Experience.vue` | 记录流 + `GamePanel` + `InputArea` + 右侧现场索引；已有本地演示、会话/人物/素材入口 | 保留一个页面 owner，小组件切片，不另建独立游戏应用壳 |
| `src/composables/useExperienceSessionWorkflow.js` | 按来源会话、世界书、当前会话、最近会话恢复；新建会话和世界书选择 | 增加明确模式/来源提示，测试显式失效来源是否错误落到另一会话 |
| `src/services/experience/experienceTurnCoordinator.js` | 单一 in-flight controller；生成前快照；流式占位、提交、取消和失败回滚；读取 branch memory filter | 继续唯一 AI 回合协调器；结构化检定作为窄输入，不旁路发第二条请求 |
| `src/services/experience/gameBranchWorkflow.js` | 非破坏性重生成、祖先链可见性、切分支恢复 post snapshot、失败回原分支 | 检定 receipt 和 pending 状态必须同样按分支归属 |
| `shared/narrativeTurnContract.js` | pending/committed/failed；内含 receipt、pre/post 快照；归一化只保留 committed；上限 50 | **不能把 pending 检定塞进 turnRecords 就声称刷新可恢复**；需要明确独立 session pending 字段/兼容归一化接缝 |
| `src/services/experience/gameSessionScheduler.js` | 500ms 去抖写会话；强制 flush 返回实际写入成功；不创建另一套 storage | 用户确认骰点前先 durable 保存；失败只报失败，不进入模型生成 |
| `src/services/experience/experienceMechanismProjection.js` | legacy 中文正则识别战斗/交易/任务/对话 | 只保持提示用途；新检定结果不能从这套正则推导或重复应用 |
| `src/services/experience/gameRuntimeProjection.js` / `gameSessionNormalization.js` | 快照/恢复 inventory、quests、flags、场景等 | 只添加必要命名空间，旧数据无新字段时明确保持自由叙事模式 |
| `src/services/agents/narrativeKernel.js` / `narrativeToolRegistry.js` | 世界书激活、按需工具与有界上下文 | 不改回整本资料 eager 注入；C 只提交审定的动作与结果 |
| `src/services/memory/memoryCandidates.js` | 当前作用域候选来源，分支过滤由回合链控制 | C 不改 candidate owner；历史接线由 A/O 提供只读端口与提交后事件 |
| `src/pages/OnlineExperience.vue` / `src/services/collaboration/` | 存在旧兼容与新 C2 边界，C2 分线尚有集成门禁 | 不借单人跑团改动顺手合入联机分支，不新增公共房间服务 |

### 4.1 最重要的技术差距

Pinax 已有叙事事务，不缺“让模型讲故事”。缺的是与叙事回合相邻、却不可由叙事随意改写的轻规则结算闭环。上游持久事件流比本地 50 回合/200 runtime event 热窗口更完整；本夜不能通过简单提高数组上限冒充永久历史，也不能清掉热窗口绕开存储压力。

现有 bootstrap 会回退最近会话，适合通用体验但不一定适合用户显式打开的跑团存档。来源会话不存在时，应显示“存档不存在/选择另一个”并停止自动生成，不能静默进入另一世界。这是需先复验的高风险行为，不在没有实证前泛称现有所有入口都有 bug。

## 5. 用户流程与 UI 硬约束

### 5.1 单一工作台，不新增第三层页面栏

入口仍是首页左栏的体验/跑团能力、现有 `/experience` 路由。外层 `AppShell` 和 `WorkspaceTabs` 保留唯一顶部标签。当前世界、冒险标题、会话状态只在必要位置出现，不再排一行“Pinax / 创作 / 书名 / 跑团 / 会话名”。修改导航合同必须提交 O，不由 C 独占改共享 shell。

视觉角色：工作台中的**可游玩记录**，不是聊天 IM，也不是复古卡牌皮肤。工作距离：长时间阅读为主，数值确认短时发生。温度：中性亮/暗底色 + 当前主题信号色。容量：1440px 阅读与资料并存，900px 资料可收起，390px 单列读写。

冻结 8 条约束：

1. 一套顶部 workspace tab、一套页内工具栏；不重复品牌、书单、文件菜单。
2. 1440px 时主区随窗口展开，正文行宽受控但剩余宽度用于真实资料栏；资料关闭后居中阅读，不能留一整块看似漏渲染的固定空列。
3. 主要正文建议 16–18px、1.75–1.9 行高；规则解释/工具标签不低于当前统一控件字号，禁止上游 9–10px 样式直接复制。
4. 主要按钮只有“提交行动”或当前必需确认动作；暂停、重试、另起走法、保存点放对的位置，不让 6 个同等强调按钮并列。
5. 行动输入随内容自动长高，最大编辑高度有明确展开入口；正文/输入不得出现不明双重滚动。
6. 回读历史不自动拉回底部。显示“有新回应”，用户点击后定位；尊重 reduced-motion。
7. 检定以嵌入当前回合的轻量行呈现：动作、规则、骰点、修正、结果；详细计算与出处折叠，不常驻满屏 JSON。
8. 手机侧栏是可关闭资料层，不遮住提交、停止与输入；关闭恢复焦点，软键盘待实体设备单独验。

### 5.2 从开场到收尾

- 首次：选择关联世界书 → 选择一位已有角色/以无指定角色游玩 → 输入短目标 → 选择“自由叙事”或“轻规则 2d6”。不得自动把所有旧会话改成规则模式。
- 开场：展示本场目标、场景与当前人物的真实摘要；缺内容时给创建资料入口，不伪造已识别场景。
- 行动：先写自然语言。默认直接叙事；玩家显式选择需要检定时，确认属性修正/意图/风险。首夜不强制每一句话都投骰。
- 确认：摘要清楚说明成功、代价、失败前进的大致方向；规则快照与动作冻结。确认后生成一次骰点并先保存回执，再让主持叙述。
- 回应：主体是叙事，骰点条可折叠；模型如果与机械结果矛盾，原结果不变，回复进入待重试/可读诊断，不悄悄改骰点。
- 继续：保留输入焦点与可见现场，下一轮不用重复起团设置。
- 暂停：停止当前请求；已保存的检定存在，未确认的动作仍是草稿。重新打开时说明处于“已检定、等待回应”。
- 收尾：显示本场摘要与已确认结果；“收藏为素材”仍通过现有 provenance owner。不得自动写入小说正文、世界书或正式记忆。

## 6. 回合协议：先冻结，再结算，再叙述

下列为**待 O 冻结的最小合同建议**，不是已经存在的 schema。

```text
roleplayAction
  schemaVersion, actionId, sessionId, branchId, worldbookId
  baseTurnId, baseRuntimeRevision, sourceWorldbookRevision
  actorRef, targetRef?, rawInput, mode
  ruleSnapshot { ruleId, version, expression, modifier, thresholds }
  status: draft | confirmed | resolved | narrating | committed | cancelled
  resolution? { dice[], modifier, total, outcome, rngTrace, resolvedAt }
  narrationTurnId?, retryCount, lastErrorCode?
```

`baseRuntimeRevision` 必须来自可验证的会话状态版本/哈希接缝，不能随便用 `Date.now()` 充当 concurrency guard。需要持久字段时由 O 审批与 A 对齐。命令身份采用 `actionId`，同 ID 同 payload 可恢复；同 ID 异 payload 必须拒绝。C 不直接采用上游数值 ID 和 project/worldGroup/work 全套对象层级。

跨线冻结要求：现有 `experienceTurnCoordinator` 始终是唯一回合提交 owner；只有成功提交后才产出版本化 `TurnReceiptV1`。与 [A 线任务书](./nightly-20260916-memory.md) 第 4.2 / 8 节统一：`scope: ScopeRef`、`schemaVersion`、`receiptId`、`turnId`、`parentTurnId`、`branchId`、`commandId`、规则版本、结构化骰点/结果、状态变更引用、证据引用、`committedAt`、`payloadHash`。本线的 `actionId` 是一次动作身份；`commandId` 必须有明确且稳定的映射，不能用重试次数换 ID。失败/取消作为失败诊断，不伪装正式回合。A 提供 `appendCommittedTurnReceipt`，按 receipt 身份幂等接受；重放只回放已保存 receipt，禁止重新掷骰或请求 AI。ledger 真实 API 接线由 O 完成，C 不直接 import 新 Dexie。

`ScopeRef` 一致定义为 `{ bookId: string|null, worldbookId: string|null, sessionId: string|null, branchId: string|null, domain: 'author'|'book'|'worldbook'|'session' }`；跑团回执使用 `domain: 'session'`，`sessionId` 与 `branchId` 必填，无关联书时 `bookId` 显式为 null。不能以 `bookId || worldbookId` 合成 projectId；无归属 legacy 数据保持待归属。scopeKey 使用规范编码，不使用裸字符串拼接；顶层 branchId 与 scope.branchId 不一致时拒绝。

归档可靠性与 A 线一致：O 将 pending archive receipt 和成功会话快照放入原 owner 的同一次 durable 写入，之后 drain 到 ledger；归档失败保留 outbox，显示“回合已保存，历史归档待重试”。清理 outbox 失败时可重复 drain，但不得重新执行游戏动作；已经成功的回合不因归档错误回滚后再掷骰。共享提交接线未完成时，单线可交付，三线永久历史组合门禁仍保持未通过。

### 6.1 状态迁移与失败位置

| 位置 | 持久要求 | 失败时行为 |
|---|---|---|
| 草稿 → 确认 | 输入可恢复，明确 session/branch/source | 未确认不投骰，不耗模型 |
| 确认 → 已结算 | 骰点和规则回执先 durable 提交 | 写入失败不启动生成；重试不丢确认输入 |
| 已结算 → 叙述中 | 使用相同 actionId/回执和既有 coordinator | 取消/429/超时仍保留已结算回执 |
| 叙述中 → 已提交 | 回合已提交，receipt 引用动作；标记完成必须幂等 | 写盘失败按既有事务回滚并保留可恢复 pending，不能出现两份已完成回合 |
| 用户选择另起走法 | 产生新 actionId/branch，由旧分支 owner 管理 | 明示这是重试故事/重掷的新尝试，而非“恢复请求” |
| 删除会话/换世界 | Abort + session identity 失效 | 迟到回复不得写入新会话；已删 session 不自动重建 |

最小本夜采取“不自动机械扣资源”的轻规则模式：回执决定成功程度并约束叙述，资源增减仍不制造未经定义的第二写路径。若后续要扣血/背包，必须将 ledger 与正文提交分别定义、断电可恢复，再开启。

### 6.2 叙事与规则的边界

- 玩家输入是动作意图，不是“直接设置成功/物品数量”的命令。
- 模型可提出建议，但不能修改 result、dice、ruleSnapshot 或 actor 控制权。
- 首夜不再添加一个“判断是否检定”的默认模型调用；避免玩家每次等待两轮、成本翻倍。
- 已结算结果作为小型只读事实进入既有 NarrativeKernel 输入。改 context/task catalog 的公共合同只由 O 接入，不能直连供应商 API。
- 无法可靠解析模型 outcome 时，不从自然语言正则反推骰点。展示明确待修复并允许重试同一结果。
- 接口回执中只记录必要来源 ID/hash/状态；用户正文与提示词不进入普通诊断日志。

## 7. 与历史/记忆 A 线的接缝

A 线有数据库优化，本夜 C 线不复制历史表、Dexie 实例或 memoryCandidates owner。先用离线 adapter 验证，晚于 O 冻结的真实 API 才替换。

需求端口：

```text
readRoleplayHistory({ scope, sessionId, branchId, throughTurnId, viewerRef, limit })
  -> bounded public evidence + source refs + excluded reasons

recordCommittedRoleplayEvidence({ scope, sessionId, branchId, turnId, actionId, receiptRef })
  -> { ok, reason, retryable, eventId? }
```

以上名字是需求草案，不强制 A 引入同名 API。只读查询失败时必须可区分“没有记录”和“数据库不可用”，不能把失败变成空历史后让模型胡编。

规则：

- 记忆只可读当前分支祖先链的已确认内容；其他分支、其他会话、角色私密知识禁止混入。
- 当前世界书是设定真源；跑团本场结果不直接写回 canonical worldbook。
- 回合失败不生成“成功经历”记忆。最终提交后只发送幂等 evidence，是否成为正式事实仍经 A 的审核规则。
- 历史数据库暂不可用不应把已经可保存的本地故事吞掉；保留重试回执，向用户如实说明“历史归档待重试”。
- 永久 ledger 的历史清理、基线迁移、备份/恢复归 A/O。C 必须提交“超过 50 回合、200 事件”的测试夹具，但不自行提高上限。
- 角色视角未获得正式权限标签时，不承诺完整 GM 秘密隔离；首夜可以不向模型提供秘密字段，不能把全库秘密塞进去再靠提示词约束。

## 8. 文件所有权与集成顺序

C 独占建议写集：

- `src/services/experience/roleplay/**`：轻规则纯函数、动作合同、投影和最小 adapter。
- `src/components/experience/roleplay/**`：起团设置、动作检定、结果回执组件。
- `src/composables/useExperienceRoleplayWorkflow.js`：UI 到既有回合 owner 的薄协调。
- `scripts/experience-roleplay-smoke.mjs`、`scripts/fixtures/roleplay/**`：显式离线浏览器旅程与夹具。
- 本任务书与 C 独立回执文件。

需 C 提交 patch、O 单窗口接入的共享文件：

- `src/pages/Experience.vue`、`src/stores/gameStore.js`。
- `experienceTurnCoordinator.js`、`gameSessionNormalization.js`、`gameSessionScheduler.js`、`gameRuntimeProjection.js`、`shared/narrativeTurnContract.js`。
- `src/services/agents/narrativeKernel.js`、`narrativeAgentOrchestrator.js`、统一 task catalog/allowlist/context profile。
- `src/layouts/AppShell.vue`、`WorkspaceTabs.vue`、route adapter、router、共享 CSS/token。
- `package.json` / lock、第三方声明、测试核心公共文件、STATUS / PLAN / LOG。

C 禁写：A 的 memory/history database 仓储、B 的漫画/media owner、任何 C2 协议/服务、server-version、共享主题大范围重置。若 O 将 Experience 明确独占授权给 C，可写本页，但仍不可改共享 store/协议；所有权变更需记录在任务板。

## 9. 分阶段可执行任务（R00–R29）

### A. 0:00–0:45：基线、复用与一条可验收路径

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R00 | 读取集成基线 SHA、STATUS、实际运行页面；列出旧会话兼容样本 | 输出所有权表与当前体验截图；不启动第二套默认端口服务 |
| R01 | 固定上游 SHA 与许可，选定骰式纯函数复用范围 | 来源清单含原路径、hash、MIT 原文、修改说明；不导入媒体 |
| R02 | 画出旧 coordinator 与新动作三阶段数据流，和 O/A 冻结字段 | 明确谁保存 pending、谁提交 narration、谁归档历史；不留双 owner |
| R03 | 创建原创 3 场景调查夹具：至少一次成功、代价和受挫前进 | 可不调用模型完成“动作→已结算→待叙事”的状态演示 |

### B. 0:45–2:00：规则与动作身份

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R04 | 移植选定骰式解析/拒绝采样纯函数，使用注入 RNG | 上下界、非法式、固定样本逐一一致，不存在 eval |
| R05 | 建立最小轻规则定义：2d6 + 明确修正 + 3 档结果 | 6/7/9/10 边界明确；声明简化规则，不冒称完整 D&D/CoC |
| R06 | 建立 action envelope 归一化与校验 | 空输入、无效 actor、跨会话、无穷/NaN 修正、旧 revision 拒绝 |
| R07 | 明确 confirmed/resolved/committed 持久语义与幂等 key | 同 ID 同内容读旧回执；同 ID 新内容冲突；恢复不再抽骰 |
| R08 | 构建本地展示投影，分开规则明文、回执、叙事 | UI 不直接拿 raw runtime/prompt；不泄露第三者资料 |

### C. 2:00–3:15：一个完整视觉切片

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R09 | 起团设置切片：世界/角色/目标/模式，不复杂向导 | 旧会话默认自由叙事；新建不会覆盖原会话 |
| R10 | 输入区检定确认切片 | 玩家清楚看到本次骰式与后果等级；取消确认不产生骰点 |
| R11 | 回合内检定条、展开详情、失败重试位 | 正文是视觉主体；查看一次就能理解结果和下一步 |
| R12 | 1440/900/390 与暗色截图、自查不协调点 | 查看实际图片；小片通过后才替换整页局部，不只用 DOM 断言 |
| R13 | 历史阅读滚动与键盘焦点、reduced-motion | 回读不抢滚动；Enter/输入法合成不误提交；Escape 回焦 |

### D. 3:15–4:45：接通既有事务与恢复

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R14 | 通过 O 接入 session pending 字段与归一化 | 刷新能恢复已结算等待叙述，不受 committed-only turn 裁剪吞掉 |
| R15 | 通过 O 向 coordinator 提交冻结动作/回执 | 仅一条生产模型链；legacy 自由叙事行为不变 |
| R16 | 处理取消、超时、429、响应解析失败 | 骰点不变、草稿不丢、重试不重复结果；旧有效正文保留 |
| R17 | 处理双击、双标签、切会话、删除会话、迟到响应 | 同一行动一次成功；身份变化后结果拒绝，不污染其他世界 |
| R18 | 配额失败与 durable 失败 gate | 未持久化不发送模型；没有绿色“已保存”假状态 |
| R19 | 分支、重新生成和新尝试区分 | 重试同一次叙述用旧骰点；换走法显式新身份，旧分支可回来 |

### E. 4:45–5:45：记录、资料与闭环

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R20 | A 只读 adapter 合同测试，用隔离 fake 验证分支与 viewer | 只取实际授权证据；数据库故障不伪装为空历史 |
| R21 | 已提交 evidence 出站回执与重试 | 失败/取消不归档成功事件，同 action 不生成重复历史 |
| R22 | “收藏为素材”及返回正文来源链 | 复用现有 owner，保存精确会话/回合/消息 refs，不自动写小说 |
| R23 | 旧数据与大样本回归 | 无 roleplay 字段兼容，50+回合/200+事件不谎报永久存档已完成 |

### F. 5:45–8:00：冻结、独立复核、交付

| 编号 | 动作与输出 | 完成标准 |
|---|---|---|
| R24 | 执行第 10 节全部适用离线用例 | 回执逐项标 passed/failed/blocked，不用总绿隐藏未跑项 |
| R25 | 单窗口集成，组合 A/B 后回归首页→设定→体验→漫画→文档 | 标签不复制、来源不丢、页面布局无新断裂 |
| R26 | `npm run verify:full`，遵守 20 文件/200 用例总预算 | 明确 exit code 与真实 summary；不排除测试凑预算 |
| R27 | 如有明确授权渠道与费用预算，再做真实模型小矩阵 | 无渠道则只标外部门禁，不用 mock 冒充质量通过 |
| R28 | 检查回滚补丁、数据兼容、第三方声明、手册入口 | 关功能后旧会话仍能阅读、可导出，无破坏迁移 |
| R29 | 晨间交接：操作路径、截图、已知问题、剩余任务 | 独立人员 15 分钟能重现主流程；用户视觉与趣味性仍待确认 |

时间是预算不是保证。2 小时合同/存储接缝未冻结：停止新功能扩张，交付纯规则 + UI 原型 + 恢复设计；不得靠新增另一套 session store 赶进度。6 小时功能冻结，剩余只修阻断问题、测试与回执。

## 10. 离线验收矩阵（36 个场景）

核心断言并入现有 `gameStoreSession.test.js` / `narrativeKernelExecutor.test.js` 的相关用例；不要另加 Vitest 文件使总量超过 20/200。浏览器真实操作走显式 smoke，用于旅程、布局、持久化与路由行为，不作为隐藏核心用例的借口。

| ID | 操作/输入 | 必须观测的结果 |
|---|---|---|
| V01 | 首访无世界书 | 清楚提供设定入口，不自动发起模型请求 |
| V02 | 已有自由叙事会话 | 无迁移弹窗强迫改模式；正文/分支仍可读 |
| V03 | 明确不存在的 sessionId | 提示失效并让用户选择，不偷偷进入全库最近会话 |
| V04 | 两书两世界来回切换 | 标题、角色、资料、存档严格归属当前会话 |
| V05 | 有效骰式带空格/大小写 | 归一化一致；与原函数语义相同 |
| V06 | 超大 count/sides/modifier、注入表达式、NaN | 本地拒绝，无 eval、无模型调用、无存储副作用 |
| V07 | 注入拒绝区 uint32 样本再给合法样本 | 正确重采样，trace 计数一致；测试不能无限挂起 |
| V08 | 总和恰好 6/7/9/10 | 三档边界符合冻结规则 |
| V09 | 确认前取消 | 零骰点、零已提交回执 |
| V10 | 确认时双击 | 唯一 actionId，只产生一次分辨结果 |
| V11 | 相同 actionId 重发相同内容 | 返回同一回执，不重复 RNG |
| V12 | 相同 actionId 改修正/角色 | 冲突拒绝，不覆盖旧回执 |
| V13 | 确认保存抛 quota | 不发模型，输入/旧会话保留，错误可见 |
| V14 | 检定后刷新 | 看到原骰点与“待回应”，不自动重掷 |
| V15 | 模型请求超时/429 | 可重试同一回执，无第二个骰点 |
| V16 | 生成中停止 | 请求 abort，回执保留，旧有效消息不消失 |
| V17 | 回复与失败结果矛盾 | 不把 failure 改 success；按修复/重试合同显示 |
| V18 | 生成中切换世界/会话 | 旧请求晚到被拒绝，新会话无旧文本 |
| V19 | 生成中删除当前会话 | 不自动复活已删会话 |
| V20 | 开两个浏览器标签同时确认 | 至少一个明确冲突/忙状态，不双完成 |
| V21 | 提交结果后写盘失败 | 按冻结策略回滚/保留 pending；不同时显示两份成功 |
| V22 | 从已提交回合另起走法 | 新 branch/action，与恢复旧请求区分 |
| V23 | 切回旧分支 | 恢复对应地点/人物/检定，不显示新分支私有回执 |
| V24 | 分支失败后恢复原分支 | 原正文和运行态一致，无悬挂“生成中” |
| V25 | A 查询返回另一 session/branch 的证据 | adapter 拒绝；不进入 provider payload |
| V26 | A 查询失败 | 与“未找到”区分，提示受限，不伪造记忆 |
| V27 | GM/其他人物秘密夹具 | 玩家/UI/公开叙述 payload 均不含未授权字段 |
| V28 | 已正式公开相同事实 | 合法来源可正常使用，不粗暴屏蔽全部同词语句 |
| V29 | 失败/取消回合投递历史 | 无成功事实；重复成功投递幂等 |
| V30 | 收藏素材重复点击与返回源 | 一份素材、精确来源，书稿不被自动改写 |
| V31 | 51+ 回合、201+ runtime events | 热窗口行为明确，归档门禁未通过时不宣称全量可恢复 |
| V32 | 1440/900/390、亮/暗、200%缩放 | 主按钮可见、文字可读，无整块无意义固定空栏、无横向越界 |
| V33 | 长回应回读时追加 token | 不抢滚动；新回应入口正确 |
| V34 | 中文输入法 Enter、Tab、Escape | 不误提交，焦点不丢，弹层关后回触发点 |
| V35 | 首页→体验→漫画→文档→体验 | 统一标签外壳，当前会话/待回应状态保留，无重复品牌栏 |
| V36 | workspace ZIP 备份恢复含 pending/committed 样本 | 恢复原身份/骰点，未知 schema 拒绝，密钥不进入公开诊断 |

矩阵中的并发、pending 和 ZIP 若依赖 O/A 接缝未交付，必须标 blocked；不得仅在内存测试通过后将整条跑团线标完成。

## 11. 真实模型与主观体验门禁

只有用户已授权的具体渠道、预算和可用凭据才可运行；凭据从受控配置读取，不复制到文档/CLI 参数/截图。当前用户请求是计划，不表示本轮已经授权耗费模型预算或整夜自动运行。

建议最小 12 次样本：3 个原创场景（询问信息、冒险行动、道德抉择）× 2 档对照结果（成功/失败或代价）× 2 次延续。固定动作、角色、已知信息、骰点 receipt，比较叙事是否尊重结果，而不是比较随机骰运气。

每次记录：渠道/模型标识、耗时、输入输出粗计数、成功/失败原因、是否违反机械结果、是否替真人作决定、是否越权知情、是否提供可继续行动、是否重复开场。原始样本应放受控证据位置，公开摘要不泄露用户作品或密钥。

硬门禁：结构/作用域错误 0；机械结果反转 0；用户选择被擅自代答 0；明确受限信息泄露 0。出现任一项即修复或缩小功能，不以“语言看着不错”掩盖。

软质量由用户 10–15 分钟试玩确认：回应是否具体、失败是否继续推动局势、角色是否有动机、下一步是否自然、交互是否过多。模型 API 返回 200 不等于好玩，离线通过不等于真实体验完成。

## 12. 风险、停止条件与回滚

| 风险 | 预防 | 停止/回滚条件 |
|---|---|---|
| 引入第二套存储 owner | pending/receipt 只经现有 session owner；A 只归档 | 为赶工需要新 localStorage 命名空间时先停交 O 审核 |
| pending 被旧归一化丢掉 | 专门刷新夹具，明确 committed-only turn 行为 | 无法恢复已掷骰不允许开启生产入口 |
| 新规则污染自由叙事 | opt-in 模式、旧数据默认关闭、无自动迁移 | 旧会话任何正文/回合不一致即回滚接线 |
| 与 A 双写不一致 | commit 后幂等 evidence、失败有 outbox/重试回执 | 数据库失败导致正文丢失，停止归档接线 |
| scope 混淆与秘密外泄 | 前置裁剪，actor/source 白名单，静态攻击夹具 | 任何跨世界/分支泄漏阻断合并 |
| 规则过度膨胀 | 首夜只 2d6、不自动扣资源、不新增战术地图 | 核心纵切未闭环却开始做装备/法术即回到优先级 |
| 复制第三方内容许可不清 | 纯代码优先，逐文件声明，不拷模组媒体 | 来源许可无法确认则不引入对应内容 |
| UI 与主页继续割裂 | 使用现有 token/chrome，小片截图先验 | 依赖另起顶栏、重复导航才能运转则重做切片 |
| 修改联机公共服务 | 写集隔离，不碰 C2 | 需 host/房间/服务部署能力时转后续计划 |

回滚不是删除用户的新存档。优先关闭新模式入口、保留兼容读取与导出；运行时代码使用独立提交或补丁可逆；有新 schema 时旧版本拒绝未知数据而不是覆盖。回滚演练必须包含：已结算未叙述、已提交一轮、分支两条、历史归档失败、备份恢复五种样本。

## 13. 一夜之后的储备路线（不可冒称本夜承诺）

**一级储备（只有 R00–R29 适用硬门禁全绿且剩余时间充足才选一项）：**明确开始/暂停/结束的短冒险摘要、单一只读角色知识投影深化、当前回合检索定位。不得增加 schema 或共享写集；完成必须附新增验收证据。一级储备不足以放开 AI 同伴或联机。

**二级储备（后续独立夜间/用户选择后再启动）：**下面九类深功能，需要各自合同和门禁，不用剩余几十分钟仓促搭空壳。

1. **R-next-1：有界 AI KP。** 在单人检定可靠后引入 decision/narration/actor 分工；默认最多一个 AI actor 行动，人工交还点显式。不得为了“像上游”把每次请求变成 4–8 次模型调用。
2. **R-next-2：AI 同伴。** 每人独立知识投影、目标和 action budget；真人的反应/选择必须等待确认；同伴不能代替真人消耗资源。
3. **R-next-3：场景与线索。** 明确锁定/公开/已发现状态，失败前进让调查不因一次失误死锁。先测试原创 3 场景模组，再扩写生产向导。
4. **R-next-4：角色卡与资源账。** actor ID、能力使用、装备/道具与状态效果必须走 deterministic ledger；不通过自由文本 regex 自动扣值。
5. **R-next-5：模组构建/发布冻结。** 作者编辑世界书不应静默改写已有冒险；定义运行源版本与显式升级方案。参考上游 source hash，不照搬它的整个产品平台。
6. **R-next-6：同机交接。** 隐私锁屏、视角切换、输入清空、控制权确认；明确设备拥有者仍可读底层本地数据，不宣称强秘密保护。
7. **R-next-7：远程多人。** 作为 C2 单独 integration window：host epoch、ACK/幂等、resume、授权、加密与双浏览器门禁完成后再接 action envelope；单机 mock 不能替代。
8. **R-next-8：地图/战术桌面。** 复用 Pinax 地图 owner 和稳定 PlaceEntity；后续再评估 token、距离、迷雾，不本夜增加第三个地图引擎。
9. **R-next-9：长期战役。** A 永久历史验证后支持跨场会话、版本演化、角色认知传播与补充规则；旧热窗口不能作为全量 ledger。

## 14. 晨间必须交出的回执

C worker 输出 `docs/agent-runs/nightly-20260916/roleplay-summary.md`，正文按以下顺序：基线/最终 SHA → 实际完成的 R 编号 → 未完成原因 → 文件列表 → 上游复用与许可清单 → 精确命令/exit code → 36 项矩阵状态 → 1440/900/390/暗色截图 → 真实模型是否运行 → 旧数据/回滚证据 → 用户 15 分钟试玩路线。

截图至少包括：起团选择、已结算待回应、正常读写、失败重试、手机展开资料。不能只截空态和最漂亮的一屏；不把存储/模型错误藏在裁切之外。

完成标签分开写：`计划完成`、`已实施`、`分线验证`、`组合验证`、`真实模型通过`、`用户确认`。本文件目前只有第一项。既有项目规则已要求证据和小片视觉验收，本轮无需追加新的 agent 规则，按现有规则执行即可。

## 15. 可复制的 worker 启动 brief

```text
你负责 Pinax 夜间 C 跑团优化线（A记忆/B漫画，R编号仅为任务ID）。先完整读取 AGENTS.md、docs/STATUS.md、
当前本地 LOCAL.md（若非空）、本任务书和触发的 canonical skills。
从集成 owner 给出的干净 main SHA 创建独立 worktree，不使用旧 C2 分支。
目标：保留现有 Experience/coordinator，实现 opt-in 轻量 2d6 单人动作闭环：
起团→动作确认→一次性确定性结算→持久回执→既有叙事生成→失败可恢复→收藏素材。
上游固定 cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed；优先适配 dice.ts 纯函数，保留 MIT。
按 R00–R29 执行，2h 接缝未冻结先收缩，6h 功能冻结，不凭时间耗尽宣称完成。
独占 experience/roleplay 目录、新 composable、自己的 smoke/fixture/回执。
共享 store/coordinator/schema/route/shell/package/lock/backup/ledger 只提交补丁给 O，
未经 owner 变更授权不得直接写；不得 import 新 Dexie 或另造存储真源。
已成功提交才生成 TurnReceiptV1，ScopeRef 对齐 A 文档，有 bookId/worldbookId/sessionId/branchId/domain；
失败取消不产正式回合，重放不掷骰不调模型，A ledger 幂等接线由 O 完成。
旧自由叙事默认不变，pending 检定不能被 committed-only turn normalize 丢弃。
先做单一1440/390视觉切片再扩展；遵循已接受主页风格，不增加顶栏或漂浮面板。
用36项离线矩阵验收并如实标blocked；核心测试不能超过20文件/200用例。
完成前 verify:full + 浏览器实屏，写精确exit code、截图、来源许可及未完成项。
真实模型须已有明确渠道/费用授权；无则保留外部门禁，不调用新付费服务。
不合入C2、不部署、不push、不扩大为完整AIKP；最多选一级储备一项。
交接 docs/agent-runs/nightly-20260916/roleplay-summary.md，等待 O 独立复验。
```
