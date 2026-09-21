# B 线：C2-3 联机共同排演 Pilot 与可靠性（48 项）

> 上级计划：[跑团 / 联机 / 漫画夜间总计划](./nightly-20260919-roleplay-online-comics.md)  
> 范围：现有 C2-3“一个 intervention 的共同排演”，不扩到 C2-4 通用改稿、助手、生图或全文协作。  
> 架构：继续使用服务端权威事件协议、客户端密文和 SQLite repository；今晚不引入 Yjs/CRDT，不建立第二套房间系统。

## B0. 当前事实与启动基线（B01–B06）

| ID | 任务 | 验收证据 |
|---|---|---|
| B01 | 从当时 main 建独立工作树，记录 base/tip/dirty；确认 C2 feature flag 默认关闭，关闭时不注册访客路由/控制器/表面 | 启动与 bundle 检查；默认用户零新增入口/请求 |
| B02 | 运行现有 collaboration fault/transport/authoring bridge/room/contract 矩阵，建立当前通过数和耗时 | 当前 base 的 exit code；不能引用 C2-2 旧分支数字 |
| B03 | 核对 `PLAN` 所述 C2-3 完成事实与代码：create、fragment invite、join、proposal/vote、host select/generate、promote、adopt receipt | 生产调用图与逐步 fixture；缺一步就列真实差距，不重做已有步骤 |
| B04 | 审计 StoryForge 固定 SHA 的 room authority/gateway/realtime hub/transactional persistence 与故障测试 | 复用表含 direct/adapt/reference/reject、许可证；不得替换 Pinax 已冻结 protocol v2 |
| B05 | 冻结协议/存储版本、角色权限、事件类型、最大 payload、TTL 与 host epoch 语义；禁止执行中随意扩协议 | 一页 contract snapshot 与兼容策略；新字段默认拒绝或 preserve 明确 |
| B06 | 建两套测试身份和一个低敏 intervention fixture；密钥只在 URL fragment/客户端测试内存，不写仓库、服务端或日志 | fixture 无用户正文/密钥；日志扫描基线通过 |

阶段 Gate：当前纵切能在 fixture transport 下完整跑通；若基线红灯先修复，再进 B1。

## B1. WSS、心跳、背压与连接生命周期（B07–B12）

| ID | 任务 | 验收证据 |
|---|---|---|
| B07 | 统一 Web/Electron 端点解析：`https`→`wss`、明确 development loopback 例外、禁止 silent downgrade；邀请 fragment 不随 handshake 发送 | URL/Origin/fragment 矩阵；服务端访问日志零 key |
| B08 | 服务端校验 Origin allowlist、协议版本、认证/房间凭据和角色；拒绝缺失/伪造/跨房间请求 | 允许、缺 Origin、恶意 Origin、过期 invite、撤销 invite 逐项结果 |
| B09 | 实装/核对 ping-pong heartbeat 与 liveness：服务端终止无响应连接，客户端区分离线/超时/主动关闭并进入有界恢复 | 模拟半开连接，能在规定窗口清理；无无限 spinner |
| B10 | 重连采用指数退避+jitter+上限+取消；后台标签/离线事件不制造连接风暴，重新在线后恢复 | 断网 60 秒/切后台/恢复，连接次数和最终状态可检查 |
| B11 | 输入消息、帧、解压后内容和房间队列均有大小/速率限制；`permessage-deflate` 默认关闭，除非专项内存/吞吐证明开启 | oversize/fragment flood/rate burst 被稳定拒绝，服务存活；配置回执 |
| B12 | 依据 `bufferedAmount`/发送队列做背压：低价值 presence 可丢/合并，权威事件不可静默丢；慢消费者被限流或断开并可恢复 | 慢客户端 fixture、队列上限、内存增长与恢复结果 |

阶段 Gate：loopback `wss` 或等价隔离 TLS 环境完成连接、心跳、断开、重连和慢消费者；缺公共证书不阻塞后续。

## B2. 权威状态、ACK 与服务重启恢复（B13–B18）

| ID | 任务 | 验收证据 |
|---|---|---|
| B13 | 每个 host-only 命令校验 room role、host epoch、client seq/command id；旧 host 的迟到生成/选择不得提交 | 主持转移前后并发反例，旧 epoch 零正式写入 |
| B14 | ACK 与幂等语义贯穿 proposal/vote/select/promotion/adoption receipt；同 command 重发只产生一条权威事件 | 断 ACK 后重发、双击、两个 tab 重放都只提交一次 |
| B15 | 客户端检测 seq gap/乱序/重复，缺口走 snapshot/resume；不能在不完整本地状态上继续提交 | 丢第 N 条、乱序、重复、过期 snapshot 四类矩阵 |
| B16 | server restart 后从 SQLite 恢复房间、成员、host epoch、已选 proposal、promotion/adoption 终态和 TTL；不恢复瞬时 presence | 中途重启三处：投票前、生成后、promotion 后；客户端最终一致 |
| B17 | 写入事务失败、磁盘 busy/quota、进程在 commit 前后退出时，不发假 ACK；未知提交可通过 command id 查询/恢复 | 故障注入给 SQLite 行、事件流和客户端状态三方证据 |
| B18 | grace/host transfer/revoke/expiry：主持短暂断线可恢复，超时后明确转移或封存；已撤销成员不能借 resume 重新加入 | 时间边界与并发重连矩阵；无双 host |

阶段 Gate：服务重启和 host transfer 后完整房间仍可继续，所有副作用 exactly-once 或有明确 unknown/reconcile 语义。

## B3. C2-3 共同排演完整产品漏斗（B19–B24）

| ID | 任务 | 验收证据 |
|---|---|---|
| B19 | 房主从 fresh intervention 建房，冻结目标、允许来源与候选方向；stale/已采用/跨书 intervention 拒绝建房 | 入口生产调用而非测试 helper；冻结 fingerprint 可检查 |
| B20 | 邀请页只展示 allowlist 片段、角色、房间状态和明确加入动作；失败区分过期、撤销、版本不兼容、网络和密钥错误 | 两身份浏览器截图与错误矩阵；不泄漏全书/设定 |
| B21 | reviewer 创建/修改/撤回 proposal，所得/代价有界，不能伪造 sourceRef、目标或 host 权限 | 合法/越权/过期/stale proposal 结果；低敏事件可审计 |
| B22 | 投票、房主选择和选择变更语义明确；并发投票/撤票/选择只由权威顺序决定 | 两 reviewer fixture 或多客户端脚本，无本地多数覆盖服务端 |
| B23 | 只有房主设备调用模型生成 branch；生成中主持转移/断线/结果迟到时，由 epoch 和 frozen input 决定接受或拒绝 | 服务端不见模型 key/正文全量；旧 host 结果不能 promotion |
| B24 | promotion 只形成本地 Ghost，adoption 仍走既有本地事务；成功后回传低敏 adopted receipt，失败/撤销不伪装采用 | proposal→selected→generated→promoted→adopted 全漏斗与失败漏斗 |

阶段 Gate：两个隔离浏览器 context 从建房到采用完整通过；无需真人即可完成工程 Gate，但不得冒充真人 pilot。

## B4. 安全、隐私与滥用边界（B25–B30）

| ID | 任务 | 验收证据 |
|---|---|---|
| B25 | 全链检查邀请 key 仅存在 fragment/客户端短期存储，Referer、analytics、server request、SQLite、异常和截图默认不含 key | 自动日志扫描 + 人工抽查；发现泄漏先停功能修复 |
| B26 | 消息级 authorization：不能仅在连接时校验；成员被撤销/角色变化后，旧连接的下一条消息立即受新权限约束 | 撤销后 proposal/vote/resume 均拒绝 |
| B27 | 房间/身份/IP 或等价低敏维度的连接、join、proposal、vote、snapshot 请求有界限流和 GC | burst/慢速/大量假房间矩阵；limiter 不无限增长 |
| B28 | 密文 envelope 校验版本、nonce/id、大小和重放；服务器只保留必要 metadata，不尝试解密内容 | tamper/replay/cross-room envelope 拒绝；日志无密文全文 |
| B29 | 错误、审计和 metrics 低敏化：不记正文、proposal 全文、密钥、模型输入/输出或稳定用户指纹；保留可诊断 error code/阶段 | 日志字段白名单与样本扫描 |
| B30 | 房间删除/TTL/撤销/导出语义明确：清理正式记录、断开连接、拒绝 resume；导出只给授权方且默认低敏 | maintenance 执行前后 SQLite/连接/客户端检查 |

阶段 Gate：OWASP 对应反例表逐项有测试或明确不适用理由；“使用 WSS”不能代替消息权限和滥用控制。

## B5. 浏览器、尺寸、主题与恢复体验（B31–B36）

| ID | 任务 | 验收证据 |
|---|---|---|
| B31 | 用两个真实隔离浏览器 context/profile 运行主漏斗，不能用同一 localStorage 身份伪装两人 | 两个稳定 client id/role，独立连接与 UI 截图 |
| B32 | 网络故障矩阵：offline、延迟、乱序、丢 ACK、断 5/30/120 秒、服务重启；UI 显示正在重连/已恢复/需重新加入 | 无重复提交、无永久 spinner；恢复后状态与服务器一致 |
| B33 | 1440、1024/900、390 的 host/reviewer/join 三表面，亮/暗主题；长 proposal、中文、错误、无内容、多人列表不溢出 | 截图人工检查 + 基本可操作断言 |
| B34 | 键盘/焦点/可访问名称/状态播报；连接变化不抢正文焦点，模态关闭后回原触发点 | keyboard journey；390 触控目标和滚动可用 |
| B35 | 切书/关标签/返回/刷新时房间身份与 resume 范围明确；另一作品不能继承当前房间或解密上下文 | 两书两房间矩阵，迟到事件不污染当前作品 |
| B36 | 若环境可打 packaged Electron，实测邀请打开、WSS、休眠恢复与系统代理；否则完成 transport/build 前置并准确记 external gate | Electron 证据独立于 Web，不用浏览器结果冒充 |

阶段 Gate：Web 双浏览器主漏斗 + 网络故障 + 三尺寸实际截图通过；Electron 能跑则额外通过，不能跑不阻塞 B6。

## B6. Pilot、观测与无真人替补（B37–B42）

| ID | 任务 | 验收证据 |
|---|---|---|
| B37 | 写 15 分钟真人 pilot 脚本：建房、扫码/复制邀请、加入、提议、投票、选择、生成、promotion、采用、断线恢复 | 每步成功标准、观察问题、隐私说明与退出/清理步骤 |
| B38 | 只记录低敏漏斗与耗时：join、reconnect、proposal、selected、generated、promoted、adopted、errorCode；不收正文/提议原文 | 数据字典、opt-in 与导出/清理方法 |
| B39 | 若可找到用户，完成至少 5 次真实双人 session，至少含一次断线；分别记录主持/评审是否理解 selected/promoted/adopted | 5 份独立 session 回执；不能用 agent/browser 自动化凑真人数量 |
| B40 | 无真人时运行至少 20 房间自动 soak：交错加入/离开/投票/重连/TTL/重启，检查资源释放和权威一致性 | 房间/连接/limiter/SQLite 增长统计，零悬挂任务 |
| B41 | 测量局域/loopback 基线延迟、snapshot 大小、事件积压、重连次数、最大队列；设告警阈值但不伪造公网结论 | 原始测量和环境说明；性能失败进入修复，不只记录 |
| B42 | 整理 self-host/TLS/WSS 运行手册、feature flag、Origin、反代、密钥轮换、备份/清理与回滚；公共部署仍需另行授权 | 新环境可按文档启动 loopback/测试服务；不写入真实秘密 |

阶段 Gate：真人条件满足则完成 B39；否则 B37/B38/B40/B41/B42 全部通过并将 B39 单列 `blocked-external`，不得整线提前停止。

## B7. C2-4 Go/No-Go 与封板（B43–B48）

| ID | 任务 | 验收证据 |
|---|---|---|
| B43 | 汇总协议、传输、恢复、安全、UI、soak/pilot 场景，每项唯一状态；核对没有用 fixture 成绩冒充真人/WSS/Electron | 场景表、日志、截图、真实环境标记 |
| B44 | 运行全部 collaboration 专项、相关浏览器 Gate 和 `npm run verify:full`；保持核心 Vitest ≤20/200 | exit code 与 summary；build/lint/结构/diff/docs 全绿 |
| B45 | diff 自审：协议兼容、migration 可回滚、feature flag 默认关闭、密钥/日志扫描、无新依赖/死代码 | 自审 checklist 和回滚命令；数据库先备份后迁移 |
| B46 | 写 C2-4 决策记录：只有 5 次真人 pilot 且 join/reconnect/理解度/安全门禁通过才 `GO`；否则 `NO-GO` 并列具体原因 | 不因为工程 Gate 全绿自动进入 C2-4；今晚不实现 C2-4 |
| B47 | 提交可独立审查的干净 commit，不推送/部署；回执列 base/tip、文件、migration、配置、端口、清理方法 | `git status --short` 干净，SHA 和回滚边界明确 |
| B48 | 完成最终回执与明日首条命令；若仍有本地可做失败项，继续修复，不以“等待真人”掩盖 | 任务板与回执一致；外部项与工程缺陷分开 |

## B 线明确不做

- 不做多人同时编辑同一段正文，不引入 Yjs/CRDT/awareness 数据层。
- 不扩 C2-4 通用改稿、助手、生图、全文/设定/地图实时协作。
- 不把联机房间与跑团房间强行合并；跑团联网需要另行产品合同。
- 不部署公网服务、不修改真实 DNS/证书/反代、不使用生产用户数据。
- 不把 presence 当权威数据，也不把服务端收到密钥/明文作为“调试便利”。

## B 线拒收条件

- feature flag 关闭仍注册访客路由或打包明显协作代码路径。
- 只有连接时鉴权，消息不做权限校验；旧 host 迟到结果可提交。
- 重连依赖无限重试、无 heartbeat、无 payload/背压限制。
- 服务重启后靠清空房间“恢复”；或 ACK 发出但 SQLite 未持久化。
- 只跑一个浏览器/localStorage 身份，却声称双人联机通过。
- 没跑 5 次真人却写 pilot 通过；没有公共 TLS 却写公网可用。
- 因等待真人、证书或 Electron 而跳过 B40–B45 的本地任务。
