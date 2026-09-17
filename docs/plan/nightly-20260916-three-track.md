# 2026-09-16 三线夜间总计划：记忆历史、漫画、跑团

> **2026-09-17更新：本文件保留首批计划证据，当前调度改用[ABC续跑修订](./nightly-20260917-ac-dispatch.md)。A/C已有首批提交，尚未组合验收；夜间O取消，共享实现交ABC，白天Codex统一合并。A/C续跑各48任务，原O接线/早收工安排不再生效。**
> 用户要求：先整理提交推送，再充分调研 Utopia 和 StoryForge，制定三条并行、详尽、可执行的夜间路线。
> 已整理的运行时基线：`main@f74545b`，已推送 `origin/main`。实际开工时冻结包含本计划的最终 main SHA，不能拿研究时的脏树开三条分支。

## 1. 阅读入口与目标

| 线 | 详细任务书 | 主交付 | 必须守住的边界 |
|---|---|---|---|
| A：历史/记忆 | [Utopia 参考的数据库与事实账本](./nightly-20260916-memory.md) | 来源、候选、正式事实、更正、双时间、恢复与按书审核 | 旧同步候选不一夜全迁；作者知识不等于角色知情 |
| B：漫画 | [StoryForge 参考的漫画工作台](./nightly-20260916-comics.md) | 页目录/画布/检查器，编辑保存、候选采用、防重复请求、导出 | 复用已有六阶段/排字/构图；不回写小说与设定 |
| C：跑团 | [StoryForge 参考的单人跑团闭环](./nightly-20260916-roleplay.md) | opt-in 轻量 2d6、一次性结算、叙事接线、暂停恢复 | 保留现有 coordinator；不冒称 AI KP/远程联机完成 |
| O：集成与验收 | 本文 | 共同身份、共享接口、存储恢复、合并与组合门禁 | 不把分线 mock 成功当三线已接通 |

三条线同时研发，但不同时争夺同一全局文件。A 的数据库深化不能阻塞 B 的手工漫画和 C 的纯规则研发；O 前半夜冻结并接共享窄接口，后半夜集中验证。
任务数量是拆解粒度，不是工时或质量证明；所有 P0 是目标闭环，超过可用窗口必须 partial，不靠降低门禁“按时完成”。

## 2. 当前成果已整理到哪里

本轮先整理了 45 个运行时/验证/文档文件：书架主页、默认封面、统一工作台标签、连续设定正文、文档标签、跨页公共表面、Dexie 记忆修订归档和 ZIP 补偿。

- 运行时提交：`f74545b feat(src): unify author workspace and archive memory history`。
- 推送回执：`e69a8a8..f74545b main -> main`；包含此前本地领先的 4 个提交，没有 force push。
- `npm run verify:full` exit 0：20 文件 / 200 测试、lint 0 warnings、应用/文档 build、架构预算与 diff。
- `node scripts/memory-history-smoke.mjs` exit 0：209 修订、刷新、作用域隔离、冲突/备份往返/配额恢复。
- 本轮重跑发现 smoke 仍定位旧“备份”按钮，更新为现有“备份与恢复”入口后通过；未因失败删掉数据库断言。
- 没有删除分支，没有合入 C2 冻结成果，没有同步或部署 `server-version`，没有重启用户服务。
- UI 统一已提交不代表用户已认可全部视觉；详细数据库新模型尚未实现。

## 3. 调研结论与复用策略

### 3.1 Utopia

研究版本：[60df635d6924127c9a57e98acbd99e43bdd92d08](https://github.com/deeplethe/utopia/tree/60df635d6924127c9a57e98acbd99e43bdd92d08)，Apache-2.0。
实际查看事实/证据 SQL、pending/memory/temporal/record_axis/graph Rust 路径及相关 ADR/数据库测试。
最值得借鉴的是“记录原句不等于确认事实”、独立待审队列、事实更正链与两个时间轴、统一查询谓词。
本地旧副本的 ADR0019 尚写 planned；最新上游已实施多层记录轴，任务书已按最新固定源码纠正。也明确其全文历史和图控件仍有边界。

采用方法：继续直接使用已引入的 Dexie；复用 Pinax 的时间/身份/来源/只读模型；必要时移植 Utopia 小策略并保留出处，不把 Rust/PostgreSQL 全服务嵌进浏览器。

### 3.2 StoryForge

漫画与跑团共同固定：[cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed](https://github.com/yuanbw2025/storyforge/tree/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed)，根代码许可 MIT。
研究通过 tree/raw 固定源码与官方样例图；未运行其产品或真实模型，不能将源码存在推断为完美体验。

- 漫画：页对象工作台、冻结来源与候选、revision 采用围栏、未知请求防重、分镜与视觉成品分级检查。上游当前兼容图片 transport 有只发文字的局限，不宣称参考图一致性已解决。
- 跑团：骰式解析/拒绝采样是可直接移植的小算法；行动确认、机械结算与主持叙述分离；有界主持、权限投影、恢复检查点值得借鉴。
- 不复制整个 React/数据库/Agent 平台，不照搬样例漫画图片、模组和第三方规则媒体；内容权利逐件确认。
- 本地单人/同机交接与公共联网完全分开。现有 C2 仍按自身门禁管理，不因为跑团工作完成而自动结项。

## 4. 共同基线与开工前门禁

O 在用户明确启动后执行：

1. 读取 AGENTS、STATUS、非空 LOCAL、对应 canonical skills、当前架构和本计划。
2. 检查 `git status`、当前 main、origin 差异、现有 worktree；用户新 WIP 保留，不擅自 stash/reset。
3. 冻结 base SHA、开发服务地址、测试 profile、上游 SHA、独占写集、模型权限。
4. 在新且明确的目录建 A/B/C 独立 worktree；名字最多三条功能分支+一个必要集成树，不制造按任务编号分支。
5. 本夜运行时代码原则上由项目约定的 Claude worker 实施，Codex 做设计/验收；本次研究使用的是两个窄范围研究 agent，不等于已经启动实现 worker。
6. 更新 `docs/agent-runs/current.md` 的真实 owner、路径、开始时间、状态和输出；计划路径不能冒充已存在 worktree。
7. 先准备合成两书两库、共享库、缺来源、旧 schema、跨分支夹具；不读取用户浏览器私稿当测试数据。
8. 独立 worker 需要浏览器看自己的变更时使用 O 分配的隔离端口/进程与临时 profile；不得对用户 5173 进程操作，也不能把 main 服务截图充当未合入 worktree 的效果。
9. 没有用户批准的渠道/预算只用确定性 mock/本地授权媒体。用户要求做计划不等于批准真实生成费用。

## 5. 写入所有权

| Owner | 可写范围 | 不能自改 |
|---|---|---|
| A | memory 账本模块、MemoryHistoryWorkspace、A smoke/架构与回执 | 游戏提交点、全局 reader/backup/schema 公共接线 |
| B | ComicStudio、漫画专属组件/服务/composable、B smoke/手册与回执 | 共享媒体存储/provider、全局 UI、记忆与体验 |
| C | experience/roleplay 新域、专属组件/composable、C smoke/回执 | 主 store、coordinator、session normalization、全局合同 |
| O | package/lock、THIRD_PARTY_NOTICES、shared 公共类型、主 store/提交接缝、backup、reader adapters、路由/标签、公共测试、STATUS/PLAN/LOG | 不代替用户确认审美/趣味/素材权利 |

默认 C 对 Experience 页面与 coordinator 只提补丁；O 可在任务板明确将单个页面临时转给 C，转锁前所有原 owner 停写。服务域写集不能因为目录相似就自动包含共享 store。
A schema 的内部表定义可由 A 实现；O 冻结对外合同和备份兼容，不要求 O 手写 A 所有数据库代码。
功能工作包不需要每包一个 commit；分线在完成/自审后收敛成默认 1 个、必要时最多 2 个功能提交，禁止推 WIP 检查点。

## 6. 四份跨线合同

### K1：身份与只读来源

共同 `ScopeRef` 使用 `{domain, bookId, worldbookId, sessionId, branchId}`，无关联项显式 null；不能让混合 projectId 同时代表书与库。
来源快照使用稳定 sourceRefs、sourceRevision、contentHash、capturedAt 和可见范围；运行时页面传身份，经可信应用边界验证，不信任模型自行填写 bookId。
没有本书关联的独立跑团允许 bookId=null，但 session/worldbook/branch 必须有效；漫画页默认需要明确书归属，无归属旧页独立隔离。
公共接口结果：`{ok, reason, retryable, ...value}`，失败与合法空集合不同；异步返回时复核 request scope 和 selection token。

### K2：版本化回合回执

```text
TurnReceiptV1 {
  schemaVersion: 1,
  receiptId, commandId, actionId?, turnId, parentTurnId,
  scope: ScopeRef,
  rulesVersion?, resolutionRef?, stateDeltaRefs[], evidenceRefs[],
  committedAt, payloadHash
}
```

- receiptId 在提交前确定，重试复用；同 ID 不同 hash 拒绝。
- 只在现有回合 owner 成功 durable 提交后向历史域投递正式回执。
- 已掷骰但未获得叙事属于 session pending，不是 committed turn；现有归一化只保留 committed 的 50 回合结构不能承担 pending 恢复。
- O 将 session pending 和 archive outbox 纳入既有会话 durable 写入及 normalization/projection/backup。
- A 的 `appendCommittedTurnReceipt`（建议接口名）只做校验/幂等审计，不能扣资源、掷骰或调用 provider。
- 本夜 C 的轻规则不自动机械扣资源；若以后增加则另冻结状态结算事务，不能借此回执旁路写 gameStore。

### K3：历史读取与知识授权

正式事实查询显式区分 `storyAt` 与 `recordedAsOf`；回合查询显式带 branch 可见祖先链与 viewer。
O 将 A reader 接到已有 project/knowledge/narrative index 链，不新增可越权读取全库的 tool。
legacy 偏好、正式事实、会话事件、推断摘要返回不同类型；不因为“active”就统一称已证实事实。
B 只消费冻结资料快照，生成完成不写回事实；C 已提交经历也不自动成为世界设定。
角色知情未实现时须显式 unavailable/缩小资料范围，不拿作者 as-of 充当角色 learnedAt。

### K4：完整备份与恢复

新数据库域必须有 export/validate/import/compensate 接口，O 接统一 ZIP。
新包需要声明必要域/最低读取能力，避免旧客户端忽略新事实后仍说“完整恢复”；旧 v3 包照常导入，缺少新域显示准确缺口。
restore 开始前预览范围/体积/冲突；成功必须跨域一致，失败只补偿本次新增数据，不清空原库。
新 schema 超前、同 ID 异内容、丢 Blob、缺来源引用都需有明确策略；hash 校验是损坏检测，不是信任任意导入内容的权限证明。
冻结导出期间的来源/媒体/事实版本，不能用户编辑一次就把同一包变成前后不一致。

## 7. 并行调度与 O 工作包

| 检查点 | A | B | C | O 的必做动作 |
|---|---|---|---|---|
| T0～0:45 | 现状/schema/scope | 归属/选择 owner | 规则/恢复 owner | base、K1/K2、写锁、旧数据样本 |
| T+0:45～2:00 | 事务纵切 | 一页视觉切片 | 纯规则与 action | 冻结 session pending/outbox/K4 提案；看实际截图 |
| T+2:00～3:30 | 更正/双时间 | 多页/保存 | 检定 UI | 公共 reader 接口、共享保存接缝，禁止新平行 store |
| T+3:30～5:00 | 审核 UI/迁入 | 候选/请求恢复 | 真实 coordinator 接线 | A/C 纵切及 ZIP，验证故障行为 |
| T+5:00～6:30 | P0修复或储备 | P0修复或储备 | P0修复或储备 | 收可合并提交、跨线 fixture；停止扩大共享 schema |
| T+6:30～8:00 | 修复交接 | 修复交接 | 修复交接 | 合并、全仓/浏览器组合、回滚演练、晨间回执 |

时间是推荐 8 小时预算，不是本轮已设定的运行时间。用户若指定其他窗口，保留最后约 20% 用于组合验证，优先缩储备而非缩数据门禁。
O 每 45～60 分钟收短摘要：任务 ID、变更文件、真实命令/exit、证据、阻塞、下一包。worker final 只是交付候选，O 验收后才能标 done。
提前完成取各线一级储备；二级涉及未授权共享数据/新服务则留后续，不为了“跑满夜晚”制造风险。

O 工作包清单：

- O01：共同基线、干净工作树与不重叠写集。
- O02：scope/source/receipt 共享合同及独立错误 fixture。
- O03：session pending 可恢复，修复 committed-only 归一化接缝。
- O04：提交快照与 archive outbox 同 owner durable 保存。
- O05：A ledger + C producer 幂等接线；故障注入后不重新掷骰。
- O06：新事实投影接既有 reader，legacy 迁移去重，权限前置。
- O07：新域 ZIP 声明、校验、恢复补偿和未知 schema。
- O08：B 共享媒体/provider 缺口的最小适配；不整包复制上游服务。
- O09：依赖与许可证一次性登记，核心测试预算统筹。
- O10：跨页面标签/书身份/全局样式回归，查看截图。
- O11：分线 diff 自审与独立复验，确定集成顺序。
- O12：最终 verify:full、组合 smoke、功能/真实模型/用户门禁分别记录。

## 8. 合并顺序与失败处理

推荐 **共享合同 → A 账本 → C 跑团模块及 O 接线 → B 漫画 → 最终组合**。B 可在 A/C 等待时先集成其无共享依赖小片，但不在同一窗口抢改全局文件。

合并前每线必须交 diff、真实验证、来源清单、数据兼容和未完成表；未通过不得只因“没有冲突”而合。
冲突由 O 对照唯一 owner 处理，不选 ours/theirs 机械覆盖；同一天用户新改动先保留并评估。
不合入旧 C2 分支、不强推、不部署生产、不删除旧 worktree 或恢复 refs。用户若明确授权生产适配，待 main 验证后单独同步 server-version。
已写入新数据的功能回滚优先关闭新入口并保留兼容读取/导出，不用 revert 代码掩盖 schema 已经变化；数据删除必须另获明确授权。

## 9. 三线组合验收矩阵

分线共 98 个场景外，O 至少完成以下跨域检查；不要求新增 Vitest 用例数量，沿用 20 文件/200 用例上限及显式浏览器旅程。

| Gate | 联合操作 | 结果 |
|---|---|---|
| O-G01 | 两书不同库，各建记忆/漫画/会话 | scope 与 UI 一致，无串书 |
| O-G02 | 两书共一世界书 | 共享设定可见；书稿/漫画/会话私有资料隔离 |
| O-G03 | 主页→设定→漫画→跑团→文档→返回 | 仅一套标签壳，无重复品牌，未保存输入不丢 |
| O-G04 | 作者接受并更正事实，再查询旧记录时点 | 旧/新版本可分辨，来源冻结 |
| O-G05 | 查询故事过去与作者过去两种组合 | 两轴独立，未知时刻不伪补墙钟 |
| O-G06 | 采用 AI 候选前后分别请求模型 | 前不混入正式事实，后仅在授权 scope 可见 |
| O-G07 | C 已掷骰、请求失败、刷新恢复 | 同 action 同骰点，未重复 RNG/provider 副作用 |
| O-G08 | C 成功提交，A 数据库写入失败 | 正文仍保存；outbox 可重试；无重复回合 |
| O-G09 | A 已归档、会话 outbox 清理失败 | 重排队幂等，正式账本一份 |
| O-G10 | 回退并另起分支，查询历史 | 祖先链可见，其余分支不泄漏；账本未被删 |
| O-G11 | B 请求中改字/换书/删格 | 晚结果不覆盖当前对象；超时不自动重发 |
| O-G12 | B 网络成功媒体持久失败 | 只重试保存；原选中图可用 |
| O-G13 | 全域 ZIP 备份/隔离恢复/重复恢复 | 身份、来源、版本、骰点、媒体一致且幂等 |
| O-G14 | ZIP 中途失败/同ID异内容/未来schema | 明确拒绝或补偿，不清除已有数据 |
| O-G15 | 两标签同时确认同事实/行动 | 冲突可见，无双完成；不伪称跨端一致性 |
| O-G16 | GM/他书/别分支秘密夹具 | UI、model payload、诊断不越域 |
| O-G17 | 1440/900/390/暗色/长文/空态/失败态 | 原图已查看，不让截图只覆盖最好看一屏 |
| O-G18 | 1,000回执/10k事实/40漫画页合成样本 | 分页/热窗口/保存可用，记录实际性能而非编造指标 |

数据安全、归属、幂等、恢复失败任一为 fail，阻断相关功能开启或合并。真实性能无实测则 not-run，不能用预期值填成绩。
如果只完成了单线独立验收，写“分线已通过、组合未通过”；不要把未接线的 adapter mock 成功当 O-G08/O-G13 通过。

## 10. 证据、截图与晨间交付

执行后目录拟为 `docs/agent-runs/nightly-20260916/`，目前不生成假完成回执。

- `memory-summary.md`：A 的任务/30场景/迁移/事实轴/证据。
- `comics-summary.md`：B 的31任务/32场景/视觉/导出/真实图片门禁。
- `roleplay-summary.md`：C 的30任务/36场景/规则恢复/真实模型门禁。
- `integration-summary.md`：O 的18组合场景、最终 SHA、命令/exit、全域备份恢复、未完成清单。
- `source-reuse.md`：实际移植范围、原路径/SHA/许可证；与单纯设计参考分开。
- 截图使用非私稿 fixture，写视口、主题、路由与样本；提交必要压缩证据，不塞进数百 MB 原始日志/模型输出。

晨间 15 分钟复验建议：

1. 首页打开某书，进入记忆，审核一条有来源候选，更正，再回看旧记录时点。
2. 漫画打开两页样本，选格改长对白，换图候选、明确采用、阅读/导出。
3. 跑团发起一次检定，确认骰点，故意触发确定性失败，刷新重试保持原骰点。
4. 切另书/另分支确认隔离，再导出完整备份，在隔离 profile 恢复。
5. 看未完成表：全文历史/完整角色知情/AI KP/远程联机/图像质量分别处于什么层级。

## 11. 完成定义与不做事项

“计划完成”：四份任务书、源码冻结、范围/所有权/验收清楚，本轮只交这一层。
“已实施”：真实代码存在；“分线验证”：该线命令与浏览器通过；“组合验证”：O 在合并后复验；“真实模型通过”：有授权真实渠道样本；“用户确认”：用户认可视觉/创作体验。
这些标签不得互相替代。

本轮/本夜默认不做：迁移所有浏览器数据到云、换整个前端框架、启动 Utopia 后端、复制 StoryForge 整站、合入联机分支、自动付费生成、清理用户素材、改根许可证、部署 exe 或线上生产。
A30、B28～B31、C 的 R-next 列是后续路线，不纳入一夜“全完成”承诺。
现有 skills 已覆盖唯一 owner、真实验证与视觉小切片；这轮发现的问题属于把既有规则落实到新任务，**不需要新规则**。
