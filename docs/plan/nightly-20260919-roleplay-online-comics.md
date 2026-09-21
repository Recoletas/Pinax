# 2026-09-19 夜间计划：跑团、联机、漫画成熟化

> 状态：**计划已编制，尚未启动 agent、未改运行时代码、未创建分支、未提交或部署。**  
> 冻结基线：`main@04ed7c8`；执行前必须重新确认 main tip 与工作树。  
> 分工：A=跑团，B=联机，C=漫画，D=全产品长期/视觉巡检；**不设 O 线**。夜间各线完成自己的生产接线、故障验证和回执，白天由 Codex 统一审查、合并与回归。  
> 详细队列：[A 跑团 48 项](./nightly-20260919-track-a-roleplay.md) · [B 联机 48 项](./nightly-20260919-track-b-collaboration.md) · [C 漫画 48 项](./nightly-20260919-track-c-comics.md) · [D 全产品巡检 64 项 + 12 个生成质量 Gate](./nightly-20260919-track-d-product-audit.md)

## 1. 今晚不是从零开发

| 方向 | 当前已有 | 真正缺口 | 今晚完成口径 |
|---|---|---|---|
| 跑团 | 原创场景、2d6 结算、动作合同、待回应恢复、归档、轻量 KP/run 基础；现有离线评测 315 项、smoke 60 项 | 真实同伴 provider 与角色知情尚未进入生产闭环；外部生成和本地落盘之间仍有崩溃窗；跨会话战役、重复确认、迟到响应和长跑质量需补齐 | 从生产入口跑通“选择/同伴候选→确定性结算→叙述→持久化→恢复→收集正文”；现有 MiniMax 文本渠道已获用户授权，真实模型长局是必跑 Gate，确定性故障任务仍须独立全绿 |
| 联机 | C2-0～C2-2 底座和 C2-3 共同排演代码纵切已完成：房主权威、密文房间、提议/投票/选择、房主生成、promotion、adoption receipt | 真实双人 pilot、WSS 环境、断网/重连/服务重启、背压和用户对漏斗的理解度未验；`STATUS` 中旧“尚未合入”表述已过时 | 先把 C2-3 做成可试运行且可诊断的功能；至少完成确定性双浏览器与故障矩阵。5 次真人双人 pilot 是外部 Gate，不因暂时缺人而阻塞工程队列；通过前不得扩到 C2-4 |
| 漫画 | M2～M6 已有按书页面目录、视觉圣经、画格工作区、生成请求围栏、逐张保存/只重试保存、排字与 PNG/WebP/PDF 出版链 | M7 连续性质检、正文到分镜的稳定转换、跨刷新生产恢复、真实图片成品验收和长项目压力仍不足 | 用固定故事做出可恢复、可追溯、可发布的 2 页样张；现有 MiniMax 生图/图文渠道已获用户授权，8–12 格真实样张和截图图文复核是必跑 Gate，fixture 仍负责故障复现 |

因此本计划不重建已有薄底座，不把旧任务全部重新跑一遍，也不把“已有接口再次包装”计作新成果。每项任务必须指向当前缺口、生产消费者或可复现故障。

## 2. 调研结论与取舍

### 2.1 StoryForge：借合同与反例，不搬整套产品

本次调研固定上游 `yuanbw2025/storyforge@58892a5ba9776ab22ea7443d7836758568608b50`，许可证为 MIT。执行者若复制或改写任何代码，必须先做逐文件复用审计并更新既有第三方声明；仅参考思想或测试反例不伪装成代码复用。

| 上游证据 | 可吸收经验 | Pinax 处理 |
|---|---|---|
| [`kp-coordinator.ts`](https://github.com/yuanbw2025/storyforge/blob/58892a5ba9776ab22ea7443d7836758568608b50/src/lib/ttrpg/kp-coordinator.ts)、`runtime-event-reducer`、`continuity-state`、`information-boundary` | KP 阶段显式化、事件归约、会话连续性、主持/玩家/角色可见性分离 | 只适配到现有 roleplay workflow/ledger/actor 端口；骰子、资源与事实仍由本地确定性引擎决定，模型不得直接写状态 |
| [`room-authority.ts`](https://github.com/yuanbw2025/storyforge/blob/58892a5ba9776ab22ea7443d7836758568608b50/src/lib/online/room-authority.ts)、`room-gateway`、`transactional-persistence`、在线恢复测试 | 服务端权威、host epoch、事务持久化、重连后的快照/事件一致性 | 与 Pinax C2 方向一致；用于补故障矩阵，不替换已经完成的 v2 协议、SQLite repository 和密文边界 |
| [`durable-production.ts`](https://github.com/yuanbw2025/storyforge/blob/58892a5ba9776ab22ea7443d7836758568608b50/src/lib/comic/durable-production.ts)、`qa.ts`、`release-book.ts` | 生产任务与成品分离、连续性/发布 QA、冻结发布版本 | 适配 Pinax 已有 page store、request guard、lettering 和导出；不照搬 React UI 或另建一套数据库 |

明确不采用：整套 React/Dexie 页面、第二套作品真源、上游未真实支持的参考图/seed/inpainting 承诺、把社区预览描述当生产证明。上游 README 也明确其通用 OpenAI-compatible 图片适配器仍是文本请求，不能据此宣称 Pinax 已具备参考图一致性。

### 2.2 联机协议与安全

- [`ws`](https://github.com/websockets/ws) 官方说明指出，断开的连接可能无法被双方及时感知，应使用 ping/pong 心跳；服务端压缩默认关闭，开启 `permessage-deflate` 会增加显著性能和内存成本。因此今晚补心跳、超时、`bufferedAmount`/负载上限与背压测试，压缩默认继续关闭，除非有专项基准证明值得开启。
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)要求校验 Origin、鉴权授权、消息大小/速率、敏感日志和 DoS 边界。B 线把这些变成可执行反例，而不是只写安全说明。
- [Yjs 官方离线文档](https://docs.yjs.dev/getting-started/allowing-offline-editing)证明 CRDT 能通过 IndexedDB 支持本地优先同步，但当前 C2-3 是“提议/选择/生成/采用”的事件流程，不是多人同时编辑同一段正文。今晚不引入 Yjs；若以后进入 C2-4 同文协作，再单独评估 CRDT、awareness 与正式数据的边界。

### 2.3 产品设计原则

1. **模型不拥有事实。** 模型产出候选动作、叙述或画面，确定性状态、权限、资源、版本和采用动作由本地/服务端合同控制。
2. **生成成功不等于保存成功。** 图片、叙述、联机分支都要区分 provider 已返回、本地待持久化、持久化完成、结果未知；重试保存不得再次发起可能收费的生成。
3. **恢复是主流程。** 刷新、断网、切书、服务重启、迟到响应、重复点击都要有明确终态，而不是只覆盖理想路径。
4. **外部 Gate 不阻塞内部队列。** MiniMax 文本、生图和图文渠道已获用户授权，应实际运行；若渠道临时故障，执行者先完成 fixture、故障注入、存储、UI 和文档任务并继续重试。缺真人搭档、公共 TLS 或 Electron 环境时同样继续替补队列，只把对应外部 Gate 记为 `blocked-external`。
5. **不靠任务数量凑完成。** 48 项是细化后的依赖图。一个提交可覆盖多项，但每项必须分别给证据；重复运行同一测试不能算多个任务。

## 3. 执行拓扑

### 3.1 分支与工作树

| 线 | 建议工作树 | 分支 | 基线 |
|---|---|---|---|
| A 跑团 | `/home/recoletas/jiuguan/pinax-night-roleplay-20260919` | `night/roleplay-maturity-20260919` | `main@04ed7c8` |
| B 联机 | `/home/recoletas/jiuguan/pinax-night-collaboration-20260919` | `night/collaboration-pilot-20260919` | `main@04ed7c8` |
| C 漫画 | `/home/recoletas/jiuguan/pinax-night-comics-20260919` | `night/comics-continuity-20260919` | `main@04ed7c8` |
| D 全产品巡检 | `/home/recoletas/jiuguan/pinax-night-product-audit-20260919` | `night/product-audit-20260919` | `main@04ed7c8` |

执行前：确认根工作树没有需保留的未提交修改；从当时 main tip 建树；若 tip 已变化，在回执写真实 base，不偷偷 reset/rebase 用户 WIP。各线只提交本线文件和回执，不更新共享 `STATUS.md`、`PLAN.md`、`LOG.md`；白天统一更新。

### 3.2 精确写锁

**A 独占：**

- `src/services/experience/roleplay/**`
- `src/components/experience/roleplay/**`
- A 新增的 `scripts/experience-roleplay-*.mjs`、fixture 与 `docs/agent-runs/nightly-20260919/track-a-*`
- 现有 Experience 生产接线如必须修改，限窄适配；不得顺手重构整个 `Experience.vue` 或 `gameStore.js`

**B 独占：**

- `shared/collaboration/**`
- `server/repositories/collaboration/**`、`server/routes/collaboration.js`、明确的 collaboration WebSocket 装配
- `src/services/collaboration/**`、`src/components/collaboration/**`
- B 新增的 `scripts/collaboration-*.mjs`、fixture 与 `docs/agent-runs/nightly-20260919/track-b-*`

**C 独占：**

- `src/services/comic/**`
- `src/components/comic/**`、`src/composables/useComic*`、`src/pages/ComicStudio.vue`
- `scripts/comics-*.mjs`、漫画 fixture 与 `docs/agent-runs/nightly-20260919/track-c-*`

**D 独占：**

- `scripts/product-audit/**`、`tmp/product-audit/**` 与 `docs/agent-runs/nightly-20260919/track-d-*`
- 默认只写巡检 harness、fixture、artifact manifest 和简洁报告；符合 D 线“小修条件”的 P2/P3 才能改未被 A/B/C 持锁的生产文件
- D 不修改 A/B/C 分支、不充当夜间合并树；相关问题给 seed、最短复现、截图和建议 owner

**共享禁区：** `package.json`/lock、全局路由、AppShell、公共样式、核心 Vitest 配置、第三方总声明默认不改。确有必要时，先在本线回执给最小 diff、理由和建议 owner，继续做不依赖该改动的任务；不得因为等待共享文件而整线停工。禁止新增大型依赖、第二套数据库、第二套媒体存储或绕过测试预算。

### 3.3 交接与依赖

A/B/C 三条功能线原则上无运行时代码依赖：A 的跑团不依赖 B 的网络房间；B 用既有共同排演 artifact，不接管跑团；C 使用当前作品/来源/媒体合同，不导入 A/B 内部模块。D 先审当前 main，在 A/B/C tip 冻结后可用一次性只读工作树复验，但不合并它们。发现公共合同缺口时优先写窄 adapter 或 fixture proposal，不建立循环 merge。

白天建议审查顺序：

1. 分别读 A/B/C/D tip、WIP、任务板、复用审计和巡检报告，验证声称与实际 diff 一致。
2. A、B、C 各自在隔离树过专项 Gate；D 的小修与大问题逐项审查，不因其中一线失败抹掉其他成果。
3. 按实际无环拓扑合并 A/B/C；D 的 harness 可独立合入，小修在对应功能线之后逐项选择，每次合入后跑受影响专项，最终一次 `verify:full`。
4. 真实模型、真人 pilot、公共部署、真实设备和人工审美仍是独立证据，不用模拟结果冒充。

## 4. 连续执行合同：防止“跑一点就阻塞”

每线启动后建立任务板 `docs/agent-runs/nightly-20260919/track-{a|b|c|d}-current.md`。任务状态只能是：`queued`、`active`、`pass`、`fail`、`partial`、`not-run`、`blocked-external`。`implemented` 不是完成状态；旧代码存在但未在当前 base 实测，只能记 `not-run` 或补测后 `pass-existing`（在说明中标明）。

每完成一个 6 项阶段，必须：

1. 更新任务板的证据、命令、exit code、受影响生产入口和首个未完成项。
2. 运行该阶段最小专项 Gate；失败先修，不把红灯留给白天集成。
3. 立即领取下一阶段或替补队列；**阶段总结、一次提交、专项全绿、接口完成都不是停止理由。**
4. 只剩真实外部条件时，先执行所有“无外部条件替补任务”；直到本线全部本地任务结束，才能把外部 Gate 留给白天。

允许结束整线的条件只有：

- 48 项及替补队列均有唯一终态，所有可在本地完成的项已 `pass`，外部项有清楚的重现步骤和所需条件；或
- 用户明确叫停；或
- 连续三次采用不同安全方案仍被同一个外部权限/环境条件阻塞，并且所有独立任务均已完成。回执必须列三次尝试，不能只写“环境不支持”。

遇到以下情况不得继续扩功能，先修复：跨书/跨分支泄漏、重复收费/重复掷骰/重复发布、丢失已生成结果、未来 schema 被破坏、恢复导致旧状态覆盖新状态、邀请密钥进入服务端或日志、测试预算超限。

## 5. 四线阶段与最小交付

| 阶段 | A 跑团 | B 联机 | C 漫画 |
|---|---|---|---|
| 0 基线 | 315/60 当前评测、差距、上游复用审计 | C2-3 现状、feature flag、协议/安全基线 | M2-M6 现状、样张 fixture、复用审计 |
| 1 核心 | provider/角色知情生产接线 | WSS/心跳/背压/恢复 | 连续性真源与检查器 |
| 2 可靠性 | 请求意图、结果哈希、崩溃窗、幂等 | host epoch、ACK、seq gap、SQLite 重启 | 正文→分镜、来源 revision、stale |
| 3 连续性 | 战役/支路/角色资源/未来 schema | 共同排演全漏斗与错误态 | 多页/相邻画格、批量生产与跨刷新 |
| 4 质量 | 有界 KP、失败推进、秘密边界、长跑 | 安全、隐私、限流、密文与日志 | 画面/结构 QA、参考能力真实降级 |
| 5 产品 | 状态、恢复、归档、窄屏/键盘 | 双浏览器、三尺寸、暗色、Electron 条件 Gate | 缩略图/画布/检查器、排字与可访问性 |
| 6 出口 | 收集到正文、来源、撤销/失败 | 5 次 pilot 或完整替补 soak/readiness | 冻结发布、PNG/WebP/PDF 与恢复 |
| 7 封板 | 20/100 轮、真实模型独立 Gate、回执 | C2-4 go/no-go，不通过不扩 | 2 页样张、长项目压力、回执 |

最低可见成果：A 至少从真实跑团入口完成一次可恢复的主持回合和跨会话继续；B 至少用两个独立浏览器上下文完成 create→join→proposal→vote→select→generate→promote→adopt 并经过断网/服务重启；C 至少用固定来源完成 2 页、8–12 格、可恢复且可导出的样张。缺模型/图片/真人只影响相应“真实”标签，不影响其他工程完成。

D 独立执行[64 项全产品巡检与 12 个生成质量 Gate](./nightly-20260919-track-d-product-audit.md)：至少 5,000 个独立 persona、1,000,000 次长期动作、24 个浏览器身份/240 次 session、500 张产品截图、240 次 MiniMax 文本调用和 60 张真实生图；小问题按严格边界自行修复，大问题进入不超过 100 行的总报告。截图、trace 和视频采用 2 GiB 硬上限及滚动删减，绝不触碰用户数据或其他 agent 产物。

## 6. 验证预算与证据

- 核心 Vitest 总量保持 **≤20 文件 / ≤200 用例**。重复边界优先放 `scripts/` 显式 eval/smoke，核心断言并入既有用例；禁止改 exclude、后缀或另建配置绕预算。
- 日常先跑本线专项；每线最终交付前跑 `npm run verify:full`，必须记录 exit code、20/200、双 build、lint/结构/diff/docs 结果。
- 浏览器验证必须检查真实截图，不以 DOM 存在代替布局正确；至少 1440、1024/900、390，亮/暗主题。涉及 IME、拖拽、系统休眠、Electron 或真人理解度而实际未跑时必须明确 `not-run`。
- 用户已明确授权现有 MiniMax 文本、生图和图文模型调用。A 至少跑 72 个固定文本样本并完成 3 个真实 20 轮战役；C 至少完成一套 2 页/8–12 格真实样张并为失败/修复保留独立调用；D 至少抽样 240 次真实文本、60 次真实生图和 100 张产品截图的图文审查，并按指令遵循、事实/人物/因果、语言退化、画面主体/构图/缺陷/连续性实际评分。调用量可按失败扩展，不设费用上限，但禁止无限重试、并发压测第三方端点或泄漏密钥/用户私稿；真实结果与 fixture Gate 分开记录。
- 每线回执包括：base/tip、文件清单、上游复用与许可证、任务状态表、生产消费者、专项命令/exit、故障证据、截图、真实 Gate、未完成项、回滚边界、明日首条命令。

## 7. 外部条件缺失时的替补队列

| 缺失条件 | 不等待，继续做 |
|---|---|
| MiniMax 文本渠道临时故障 | A 继续 provider adapter、fixture、畸形/取消/迟到/重复/保存失败、20/100 轮确定性长跑和泄漏矩阵；恢复后补跑真实模型 Gate，不能以 fixture 永久替代 |
| MiniMax 生图/图文渠道临时故障 | C 先用固定图/作者导入图完成连续性、跨刷新、排字、发布和备份；D 继续其他巡检。渠道恢复后补跑真实样张与图文截图审查 |
| 无第二位真人 | B 用两个隔离浏览器 profile/context 和脚本驱动完整漏斗、断网/重连/重启/节流；另准备 15 分钟真人 pilot 脚本和低敏记录表 |
| 无公共 TLS/WSS | B 使用本机测试证书/loopback WSS 做传输验证，交自托管配置和公共部署 checklist；不伪称公网可用 |
| 无 packaged Electron | B 完成 Web、Electron transport 单测和打包前检查；记录准确阻塞条件，不用浏览器结果冒充 Electron |
| 跨线文件被占用 | 写最小 adapter/contract proposal 与 fixture，完成本线其余阶段；不修改他线写锁，不空等 |

## 8. 明日统一验收的拒收条件

出现任一项，相关线退回，不进入 main：

- 只新增 service/接口/测试，没有生产入口消费者。
- 用 mock 成功证明真实 IndexedDB/SQLite/媒体持久化；或生成保存失败时悄悄重发模型。
- 任务表大量写“完成”但没有逐项命令/fixture/截图/生产入口。
- 放宽校验、吞错误、把 `unknown` 当 `completed`、把 stale 结果写回当前作品。
- B 在 pilot 通过前扩 C2-4、引入 CRDT 或多人全文编辑；A 让模型直接修改骰子/资源；C 把无图片/无参考能力标为视觉 QA 通过。
- 更改用户 WIP、私钥、真实 `.env`、生产服务、5173 进程，或未经授权推送/部署。
- `verify:full` 不为 exit 0，核心测试超过 20/200，或文档声称与实际 diff 不符。

## 9. 最终完成定义

本计划的“完成”是四条线各自交付可独立审查的干净 commit 与完整回执，不代表自动合并、推送或部署。白天 Codex 验收后才能更新 main；某条线失败，不阻止其他合格成果被独立评估。D 的大问题报告也不等于对应功能已经修复。

产品口径保持克制：离线确定性 Gate 全绿只能称“工程可靠性闭环”；有真实 provider 小样本才能称“真实渠道可用”；跑过 5 次真人共同排演或真实漫画样张人工检查后，才能称对应 pilot 通过。任何单阶段提前完成后都继续领取后续任务，不能再次出现“做了几项就把整线报完成”的情况。
