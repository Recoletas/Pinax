# Pinax C2 创作协作平台：联机可靠性、工作台接入与共同排演计划

**日期：** 2026-09-01；2026-09-02 按 F3 并行推进重排
**状态：** C2-0/C2-1 可与 F3-0～F3-2 并行；Authoring 可见接线等待联合接缝 Gate
**适用端：** 当前 Web 验证端、未来 Electron 打包端、可选自托管中继
**前置：** F2 的 evidence / visual brief / review finding / surface handle 接口；F3 的局部介入、排演、分组 Ghost 与采用回执
**不属于本阶段：** 多人同时直接改正文、整本项目云同步、公开房间广场、团队账号与计费

## 0. 结论

现有联机不能直接“搬进 Authoring”。它是一个绑定旧 `/experience/online/:roomSlug` 的多人文字冒险原型，已经证明了 URL 入房、房主唯一调用模型、服务端按序广播事件。但它还没有形成可恢复身份、持久房间、权限边界、完整快照、命令确认、桌面远端连接或 Authoring 资料作用域。

下一步也不应直接上 Yjs/CRDT 和多人光标。Pinax 当前最值得做的首个创作协作产品是：

> **共同排演 / 审阅房间**：作者只分享当前场景、writingUnit、影响组或视觉候选；受邀者可定位评论、提出方向、投票和给出改写建议；只有作者本机能调用模型和修改正式项目，选中的建议先成为可编辑 Ghost，经现有 revision、history 和 adoption receipt 校验后才进入正文。

这不是缩小联机，而是在完成底座之后先交付一条 Pinax 特有、能和文本块/设定/历史/推演串起来的协作闭环。真实共同编辑保留为后续独立决策，不污染当前 Authoring 正文所有权。

### 0.1 2026-09-02 并行决策

F3 已进入执行期，C2 不再等待 F3 完整结束，但也不与 F3 同时修改 Authoring 核心页面。两条线采用“**领域先并行、接缝早冻结、页面后合流**”的方式：

| 时间窗 | F3 轨 | C2 轨 | 允许交换的产物 | 禁止事项 |
|---|---|---|---|---|
| A | F3-0 fixture、typed links、纯 intervention/impact projection | C2-0 v2 协议、故障 fixture、room materializer | 稳定 locator、revision、artifact kind、fixture JSON | C2 import F3 Vue/component；F3 发送 WS 消息 |
| B | F3-1 局部介入与本地排演 | C2-1 持久房间、身份、ACK、epoch、安全 | `CollaborableArtifact`、proposal target、stale reason | 两边修改 `Authoring.vue`、Ghost/adoption owner |
| C | F3-2 影响组与解释链 | C2-2 transport、Web/Electron relay | impact-group/branch 的只读 share adapter | relay 直接读取 repository/localStorage |
| D | F3-3 分组 Ghost 前 | C2-3 共同排演纵切 | 单一 integration owner 接 Authoring 协作 surface | 两个 worktree 同时改工作台和 CSS |
| E | F3-4 采用/撤销稳定后 | C2-4 通用审阅、助手、画师接线 | promotion request、adoption receipt、room receipt | 远端事件直接写正文/世界书/历史 |

关键路径因此调整为：

```text
F3 本地因果闭环 ───────────────┐
  stable artifact adapters      ├─→ 共同排演可见纵切 → 通用审阅
C2 协议/持久化/transport ───────┘
```

C2 不阻塞 F3 的单人体验；F3 也不能把网络状态写进自身领域合同。断网、无人加入或协作功能关闭时，F3 必须保持完整可用。

### 0.2 首个联合纵切

并行后的首个可见产品不再是泛化“改稿审阅”，而是范围更小、与 F3 同时成熟的共同排演：

1. 房主从一个 fresh `NarrativeIntervention` 创建临时房间；
2. 分享冻结的目标片段、原条件证据和 2–3 个本地方向，不分享整书；
3. reviewer 可提出一个方向、补充所得/代价、投票；
4. 房主选择后，只有房主设备调用 F3/模型生成 `RehearsalBranch`；
5. 房间成员只读审阅 branch；
6. 房主将 branch 提升为本地分组 Ghost，之后完全退出网络所有权；
7. F3 正式 adoption 成功后，C2 只同步一个不含正文的 adopted receipt 摘要。

这一纵切同时验证联机价值、F3 趣味性和隐私边界；通过后才扩展到任意 writingUnit 改稿、资料助手答案和画师候选。

## 1. 代码现状审计

### 1.1 已有能力

| 能力 | 当前 owner | 可复用价值 |
|---|---|---|
| URL 房间 | `OnlineExperience.vue`、rooms REST | 邀请链接和 workspace tab 可继续复用概念 |
| 有序事件 | `RoomEventStore.js` 的 `seq` | 可升级为持久事件流与 gap 恢复协议 |
| 房主唯一生成 | `wsHandler.js`、`experienceSessionAdapter.js` | 符合“作者持有模型凭据与正式写权限”原则 |
| 动作提案/投票/选定 | `OnlineRoomPanel.vue` | 可抽象成方向、改写、影响决定和视觉候选提案 |
| 受限运行时广播 | `onlineExperienceBridge.js` | 可参考 allowlist 思路，但不能直接用于 Authoring |
| 双浏览器真实模型 smoke | `online-narrative-smoke.mjs` | 可扩展为故障、权限和 Authoring 旅程 |

### 1.2 当前不能接受的可靠性问题

1. 房间只存在进程内 `Map`，服务重启后全部丢失；事件最多保留 100 条，首次快照只带最近 20 条。
2. 断线立即删除成员并立刻转移房主；`claimMember()` 的同昵称房主恢复分支因成员已经删除而基本不可达。
3. 身份只有昵称，没有稳定成员凭据、resume token 或邀请密钥；客户端甚至在无法按 ID 找到自己时按同昵称推断房主。
4. 房主没有 epoch/lease。旧房主的迟到 AI 结果、重连后的新房主、同一 request 的重复完成之间没有确定性 fence。
5. 幂等只扫描仍保留的事件；超过 100 条后旧 `commandId` 可再次执行。
6. 没有命令 ACK / reject / retry 状态；socket 未打开时 `sendCommand()` 静默丢弃。
7. 客户端只忽略旧 seq，没有发现 `lastSeq + 1` 缺口并要求完整快照的恢复机制。
8. 快照不是 materialized state；长房间或迟加入者无法恢复完整提案、投票、聊天和叙事状态。
9. 提案没有生命周期；选定不存在的 proposal 也会成功，同一提案可多次选定，同一成员可重复投票。
10. `runtime.patch.accept` 服务端缺少严格 schema、字段尺寸和路径上限；WS server 也未显式设置 `maxPayload`。
11. `GET /api/rooms` 公开列出全部房间；slug 同时承担可发现标识和访问凭据。
12. chat event 不固化显示身份，成员离开后历史消息可能失去昵称。

### 1.3 当前不能直接接入 Authoring 的模型问题

- 协议只认识 adventure narrative、runtime patch、chat、action，不认识项目、文档、writingUnit、node、revision 或证据。
- 客户端桥直接面向旧 Experience store，没有 transport/domain/presentation 分层。
- 房间默认假设所有成员都打开同一套体验状态；受邀审阅者实际上未必在本地拥有作者的书。
- 没有“只分享本段/本场/本影响组”的 manifest。若直接接工作台，只能走两个危险极端：看不到足够证据，或把整本 localStorage 暴露给房间。
- 当前 WebSocket 地址由 `window.location.host` 推导。打包应用若没有同源 Express 服务，就无法连接公网协作中继。

## 2. 外部证据与取舍

### 2.1 文档协作的产品教训

- Google Docs 把查看、评论、建议和编辑分开；建议不会直接改变原文，必须由 owner 接受或拒绝。Pinax 应复用这个所有权模型，但把建议升级为带 `unit/node/revision/evidence` 的写作提案。
- Liveblocks 将 room 的 storage 与 comments 权限分开，并支持只允许评论、不允许写存储。Pinax 也应按能力授权，不使用一个笼统的 `member` 权限。
- Plottr Pro 已提供 Web/桌面实时同步与共同编辑，但其官方页面仍把针对具体项目元素的 commenting 列为后续能力。这说明“同步成功”不是写作协作闭环，元素级定位、提案生命周期和 owner 决策更重要。

### 2.2 CRDT 的技术结论

- Yjs 可用 `y-indexeddb` 保留离线更新，并可组合网络 provider；Hocuspocus 提供认证、只读连接、数据库/SQLite 持久化和横向扩展。
- 这些能力适合未来真正的并发富文本编辑，但不会自动解决 Pinax 的来源授权、AI 房主、场景作用域、Ghost 采用和历史保护。
- 因而本计划只冻结“以后可以换成 CRDT transport”的边界，不在 C2 首期迁移正文模型。只有真实用户持续要求同段并写，并且建议式协作已稳定后，才开启独立 C3 评审。

参考：

- Yjs offline support: https://docs.yjs.dev/getting-started/allowing-offline-editing
- Hocuspocus authentication/read-only: https://tiptap.dev/docs/hocuspocus/guides/authentication
- Hocuspocus persistence: https://tiptap.dev/docs/hocuspocus/guides/persistence
- Liveblocks permissions: https://liveblocks.io/docs/authentication/permissions
- Google Docs suggested edits: https://support.google.com/docs/answer/6033474
- Plottr Pro collaboration: https://docs.plottr.com/article/10-plottr-pro-setup-guide

## 3. 产品定义：三类房间，不做一个万能联机页

### 3.1 `experience`

保留现有多人冒险语义，迁移到协议 v2 后继续兼容。成员提出行动，房主选择并唯一生成。它不再承担创作协作的 UI 或数据合同。

### 3.2 `rehearsal`（首个纵切）

与 F3 共同排演：成员不是直接写正文，而是为同一局部介入提出后续方向、所得/代价、角色反应和影响取舍。房主选定后由房主模型生成分支；成员继续评论、投票；最终只有房主能把某个分支提升为分组 Ghost。

首期只共享一个 intervention session，不开放跨章任意浏览，也不把 F3 的全部影响图发送给房间。

### 3.3 `authoring-review`（共同排演稳定后）

作者从正文、当前场、资料助手答案、校对 finding 或视觉候选发起审阅：

1. 选择明确分享范围；
2. 系统生成只读分享包；
3. 受邀者定位评论或提出改写；
4. 作者在右栏审阅；
5. 建议先提升为本地 Ghost；
6. 作者可继续编辑；
7. 采用时走正式 revision/history/receipt 链。

首期角色：

- `host`：正式项目 owner、唯一 AI owner、唯一 adoption owner；
- `reviewer`：可评论、回复、提案、投票；
- `spectator`：只读与反应；
- `editor`：保留枚举但 C2 不开放，避免权限名字先于行为落地。

## 4. 核心合同

### 4.1 `CollaborationShareManifest`

```ts
type CollaborationShareManifest = {
  schemaVersion: 1
  shareSessionId: string
  roomKind: 'authoring-review' | 'rehearsal'
  projectFingerprint: string
  scope: {
    kind: 'current-unit' | 'current-scene' | 'evidence-answer'
      | 'impact-group' | 'rehearsal-branch' | 'visual-candidate'
    documentRef?: StableDocumentRef
    unitRefs?: StableUnitRef[]
    sourceRevisions: Record<string, string | number>
  }
  visibleArtifacts: SharedArtifact[]
  redactions: string[]
  expiresAt: string
  fingerprint: string
}
```

约束：

- `projectFingerprint` 只用于一致性，不暴露本地路径或 raw localStorage key；
- manifest 必须显式列出正文片段、世界书条目、大纲节点、历史节点、当前场或媒体预览中哪些可见；
- 未列出的书、章节、提示词、工具调用、API key、记忆候选、隐藏 critic 数据一律不可从房间读取；
- 分享建立后是冻结快照。作者本地资料变化时标为 stale，不静默替换审阅对象。

### 4.2 `CollaborationProposal`

```ts
type CollaborationProposal = {
  id: string
  roomId: string
  actorId: string
  kind: 'comment' | 'direction' | 'rewrite' | 'impact-decision' | 'visual-vote'
  target: StableLocator
  baseRevision: string | number
  body: string
  replacementText?: string
  evidenceRefs?: StableEvidenceRef[]
  status: 'open' | 'selected' | 'rejected' | 'withdrawn' | 'stale' | 'adopted'
  createdAt: string
  updatedAt: string
}
```

- proposal 必须定位到分享包中的对象，不能以房间内任意字符串猜正文位置；
- 同一 proposal 每个成员最多一个当前 vote，再次投票是替换而不是追加；
- selected 不等于 adopted；selected 只表示进入作者本地 Ghost/排演链；
- source revision 不匹配时 proposal 变 stale，允许重新定位或复制为新建议，不允许直接采用。

### 4.3 协议 v2 房间身份与命令

房间：

- `roomId` 是内部身份；`roomSlug` 只用于可读路由；`inviteSecret` 才提供加入授权；
- 服务端只存 invite secret 的 hash；链接可撤销并可设置 TTL；
- `roomKind`、share manifest fingerprint、owner、roles、capabilities 显式持久化；
- 移除公开 room list；按邀请码或已认证账号访问。

成员：

- 首次加入返回 `memberId + resumeToken`；token 轮换且仅本机安全存储；
- 短断线进入 grace 状态，不立即删除；默认 30 秒后才判定离开；
- 同昵称永远不能恢复身份或取得房主权限。

房主：

- 房间维护单调递增 `hostEpoch`；
- 所有特权命令带 epoch；服务端拒绝旧 epoch；
- AI 请求由 `requestId + hostEpoch + shareSessionId + manifestFingerprint` 唯一标识；
- host loss 先取消/隔离旧请求，grace 到期后再确定性选举，任何时刻最多一个有效 owner。

事件与命令：

- command 有明确 `accepted/rejected` ACK，客户端维护 pending、超时与安全重试；
- 幂等表与事件截断分离，按 room + commandId 持久化；
- append log 与 materialized snapshot 同时持久化；快照包含成员、提案生命周期、投票、评论线程、生成状态和最后 seq；
- 返回 `minRetainedSeq`。客户端发现 seq gap 或 lastSeq 早于保留窗口时强制取快照；
- 服务端对每类 payload 做 schema、字符数、数组数、嵌套深度、允许 locator 和总字节验证，并设置 WS `maxPayload`。

### 4.4 F3 与 C2 的唯一接缝

F3 领域对象不能直接成为网络协议。C2 只消费一层无行为、可序列化、只读 adapter：

```ts
type CollaborableArtifact = {
  schemaVersion: 1
  artifactId: string
  kind: 'intervention' | 'direction-set' | 'impact-group' | 'rehearsal-branch'
  target: StableLocator
  sourceRevisions: Record<string, string | number>
  evidenceRefs: StableEvidenceRef[]
  visiblePayload: unknown
  authority: 'author-frozen' | 'derived-established' | 'derived-plausible'
  fingerprint: string
}

type CollaborationPromotionRequest = {
  roomId: string
  shareSessionId: string
  proposalId: string
  artifactFingerprint: string
  hostEpoch: number
  liveTargetRevision: string | number
}
```

职责分配：

- F3 提供 `toCollaborableArtifact()`，只决定哪些字段可共享，不知道 room、socket、member 或在线状态；
- C2 保存和传输 artifact，不重新计算证据、影响关系或方向；
- C2 选定 proposal 后只发 `CollaborationPromotionRequest`；
- Authoring integration bridge 复核 room、host epoch、artifact fingerprint 与 live revision，再调用 F3 既有本地方法；
- F3 返回本地 Ghost/session identity，C2 不持有 Ghost 内容、编辑器 transaction 或保存重试权；
- adoption receipt 由 F3 产生，C2 只投影 `adopted/rejected/stale` 和目标标题等低敏摘要。

任何 `isOnline`、`roomId`、`memberId` 或 socket 状态进入 `NarrativeIntervention`、`CausalImpactGroup`、`RehearsalBranch`，均视为架构回归。

### 4.5 公网中继的内容加密边界

Pinax 面向作者，分享的是未发表文本。公开 relay 上线前，访问控制之外还应加入客户端内容加密：

- `inviteSecret` 只负责服务器加入授权；`contentKey` 独立放在 URL fragment，不随 HTTP/WS 请求发给 relay；
- 正文摘录、证据正文、方向正文、评论和 branch preview 使用 WebCrypto AES-GCM，以每条消息独立 nonce 加密；
- relay 只读取 room、actor、seq、artifact kind、权限、过期时间和密文字节大小，用于排序、限流和持久化；
- 服务端 schema 校验明文控制 envelope，并对 ciphertext/数组/总包尺寸设硬上限；
- 房主的模型调用仍在房主设备解密后执行，relay 不需要正文明文；
- 邀请撤销可阻止未来连接，但无法让已经取得 content key 的成员“忘记”内容，UI 必须如实说明；
- 本地开发和旧 Experience compatibility 可暂时使用 `encryption: none`，但该模式不得对公网 Authoring 分享开放。

首期不承诺成员级密钥轮换或可搜索密文；成员被移除后创建新 share session/content key，旧分享按 TTL 清理。

## 5. 分层架构

```text
Authoring / Experience / Rehearsal UI
             │
Collaboration domain
  room · manifest · proposal · adoption bridge
             │
Collaboration client
  pending ACK · seq gap · snapshot · resume · host epoch
             │
CollaborationTransport
  RemoteWebSocketTransport | DesktopLanRelayTransport(later)
             │
Protocol v2 relay
  auth · capabilities · durable events · snapshots · TTL
             │
CollaborationRepository
  SQLite MVP | production adapter later
```

硬边界：

- `useOnlineRoom` 不再同时拥有 socket、房间领域和页面投影；拆成 transport、protocol client、domain projection 三层。
- Authoring 和 Experience 只能消费 domain API，不能各自拼 WS 消息。
- 正文 repository、世界书、历史、地图、记忆、素材和媒体仍由现有 owner 持有；协作层只保存显式分享包、讨论和提案。
- 远端事件不能直接写本地项目。唯一写入口是作者端 adoption bridge。
- relay 通过 `CollaborationRepository` 接口访问 room/event/snapshot/idempotency，不让 WebSocket handler 直接写 SQLite；单实例 MVP 使用 SQLite，未来生产适配可以替换存储而不改 wire protocol。
- materializer 必须是纯函数：`previousSnapshot + acceptedEvent -> nextSnapshot`。重放事件和读取持久快照结果必须一致。

## 6. Web 与打包软件接入

### 6.1 Remote relay 是首个共同能力

Web 与 Electron 都通过配置的 HTTPS/WSS endpoint 使用同一协议。客户端不能再默认假设 WS 与页面同源：

- Web 可用同源默认值，并允许部署注入 `collaborationBaseUrl`；
- Electron 从安全配置读取远端 relay，renderer 不持有服务端密钥；
- relay 故障不影响本地写作、保存、历史和 Ghost；只把房间置为离线/待重连；
- 作者的模型 key 仍只在作者设备，成员端不得获得 provider config。

Web 与桌面版本可能不同，因此握手必须包含 `protocolVersion`、`clientBuild` 与支持的 feature flags。服务端只在明确兼容区间内降级；不认识的强制语义不得静默忽略，返回 `upgrade-required` 或 `feature-unsupported`。旧 v1 Experience 通过兼容 adapter 迁移，不要求 v2 永久背负页面私有字段。

### 6.2 LAN relay 作为后续可选项

如果真实用户明确需要“不上传云端、同一局域网协作”，再由 Electron main 启动本机 relay：随机端口、一次性邀请码、明确网卡绑定、防火墙说明、关闭应用即停止。它复用 v2 协议和 transport 接口，不另造一套联机状态。

首期不承诺：离线跨互联网协作、NAT 穿透、P2P、后台永久托管。

## 7. Authoring 可见接入

### 7.1 入口与布局

- 顶部工作台只显示轻量 presence/连接状态，不塞房间管理卡片；
- 右 rail 增加“协作”，与批注、设定、助手共享同一 inspector surface owner；
- 从选区、当前 writingUnit、当前场、资料答案、校对 finding、F3 影响组或画师候选的就地菜单发起“共享审阅”；
- 右栏默认是当前对象的讨论与建议，不是全房间聊天瀑布；房间成员与连接详情收进次级视图；
- 390px 使用全高 sheet，关闭恢复 selection、scrollTop 和触发控件焦点。

### 7.2 受邀者体验

受邀者打开链接后进入 workspace tab：`协作审阅 · 场景名`。即使本地没有这本书，也能看到：

- 明确的只读片段/场景；
- 作者授权的当前场、设定、历史或证据；
- 可定位的评论与提案；
- 排演房间的方向/所得/代价与投票；
- 当前内容是否已 stale、房主是否在线、自己具有什么权限。

不显示作者左侧整本书目录，不自动创建一本本地书，不允许通过浏览器路由猜其他章节。

### 7.3 作者采用闭环

```text
远端建议
  → 校验 room/share/target/baseRevision
  → 提升为本地可编辑 Ghost
  → 作者修改
  → adoption 前自动历史保护
  → 正式事务写入
  → receipt 回写 proposal=adopted
```

任何一步失败都不伪造 adopted：

- 断线：保留本地 Ghost，房间回执进入待同步；
- revision stale：禁止覆盖，提供重新定位/对照；
- 保存失败：沿用现有“只重试保存”，不重复 editor 写入；
- 房主变化：旧 host 的 adoption ACK 和 AI completion 因 epoch 失效；
- 关闭房间：已经提升到本地的 Ghost 仍由本地 session 管理，远端不再控制它。

## 8. 与 F2/F3 现有能力的接口

| 能力 | 分享对象 | 协作动作 | 回到正式项目的方式 |
|---|---|---|---|
| F2-2 双栏 | 另一章或资料 locator 的只读切片 | 对照评论 | 作者在副栏打开 proposal target |
| F2-4 资料助手 | `AuthoringEvidenceEnvelope` 的授权子集 | 追问、纠错、补证据 | 新答案仍由房主执行，分享过滤后的 envelope |
| F2-5 画师 | 低分辨率/有 TTL 的 visual candidate | 评论、投票、选择 | 原始资产仍归作者媒体 store |
| F2-6 校对 | `AuthoringReviewFinding` | 讨论、改写建议 | 提升为 Ghost 后采用 |
| 当前场/世界书/历史 | manifest 中显式可见条目 | 指出冲突、提出条件变化 | 形成 F3 intervention 草案，不直写条目 |
| F3 排演 | direction、impact group、branch | 共导演、投票、补充因果 | 房主生成并提升分组 Ghost |

新增的协作合同只引用这些现有接口，不复制搜索、证据、画师、历史或位置索引。

## 9. 执行阶段

### C2-0：冻结证据与协议迁移边界

1. 保存现有双浏览器 happy-path 基线和协议 fixture；
2. 为当前缺陷写 server/client 合同测试：重连身份、host loss、重复命令/投票、seq gap、快照、越权、payload 上限；
3. 定义 v2 envelope、room kind、capability、ACK/error、host epoch 和版本协商；
4. v1 Experience 只通过兼容 adapter 使用 v2，不允许新 Authoring 代码依赖 v1 消息；
5. 冻结 share manifest、proposal、`CollaborableArtifact` 和 promotion request 最小 schema；
6. 与 F3-0 共用四类 fixture 的稳定 locator/revision，但两边各自产生投影，不互相 import 运行时代码；
7. 建立 wire compatibility fixtures：v1 adapter、v2 当前版、未知未来字段、强制升级四种情况。

退出 Gate：旧 happy path 仍可描述；所有已知失败都有可重复 RED 证据；v2 类型不依赖 Vue 页面或具体 store；F3 artifact 经 JSON round-trip 后 fingerprint、locator、revision 和 authority 不变。

### C2-1：联机可靠性与安全底座

1. 冻结 `CollaborationRepository`，以 SQLite 实现 room、member lease、idempotency、event log、snapshot 和 schema migration；
2. invite secret hash、TTL、撤销、resume token、capability enforcement；
3. disconnect grace、host epoch、确定性接管和旧请求 fence；
4. proposal/vote/chat materializer 与完整 snapshot；
5. command ACK/retry、gap detection、snapshot recovery；
6. payload schema/size/path allowlist、WS `maxPayload`、按 IP/room/member 分层限流；
7. 删除公开 room list，日志不得记录 invite secret、正文、密钥和 provider key；
8. 加入 room/artifact/comment TTL、按房间配额、显式删除和过期清理 receipt；
9. 为未来公网 Authoring 分享实现 client-side encrypted artifact fixture；旧 Experience compatibility 暂保明文。

退出 Gate：服务重启、短断线、host loss、重复命令、事件截断、恶意 payload、未授权命令全部通过故障矩阵；事件全量重放与 materialized snapshot 深度一致；relay 无法从加密 fixture 读取正文。

### C2-2：transport 抽象与 Web/Electron 远端 relay

1. 从 `useOnlineRoom` 拆出 transport 与 protocol client；
2. `RemoteWebSocketTransport` 支持可配置 WSS、连接状态、abort、backoff、ACK pending；
3. Web 同源部署继续工作；Electron renderer 经安全配置连接远端；
4. app 离线时本地 Authoring 无功能降级，协作状态可恢复；
5. 完成 WebCrypto artifact codec、content key fragment 解析与错误状态；
6. 握手协商 build/protocol/feature flags，明确 unsupported/upgrade-required；
7. 不在本阶段做 LAN relay，只保留接口和安全威胁模型。

退出 Gate：同一房间可由 Web↔Web、Electron↔Web 使用；任一端断网不损坏本地项目；成员端网络日志无模型凭据或正文明文；关闭协作 feature flag 后 F3 行为和 bundle 主路径不变。

### C2-3：F3 共同排演 MVP（首个可见纵切）

严格按可见切片推进：

1. fresh intervention → `CollaborableArtifact` → 建立 rehearsal room；
2. 受邀只读目标片段、原条件与授权证据，提出 direction/所得/代价；
3. 成员一人一票，房主选定；只有房主设备发起 F3 branch generation；
4. branch 回房间只读审阅，revision/host epoch/fingerprint 任一变化即 stale；
5. 房主执行 promotion request，bridge 复核后在本地形成分组 Ghost；
6. Ghost 编辑、保存、history、采用和撤销完全复用 F3，不再依赖房间在线；
7. adoption 成功后回传低敏状态 receipt，失败/放弃/stale 不伪造 adopted；
8. 1440/1024/390 截图逐切片校对，再扩到完整页面。

退出 Gate：受邀者不能浏览未分享内容；member 产生零模型请求；一次选择只有一个有效 branch completion；建议永不直接写正文；断线、host loss、stale、保存失败、撤销/重做均无双写。

### C2-4：通用 Authoring 审阅与 F2 工具接线

1. 当前 writingUnit/scene 定位评论与 rewrite proposal；
2. F3 impact group 讨论和 `impact-decision`；
3. F2 助手授权 evidence answer 分享与纠错 proposal；
4. F2 画师低分辨率候选预览、投票和 TTL 清理；
5. proposal → 本地 Ghost/history/adoption 的通用 promotion bridge；
6. Experience v2 迁移完成后退役旧页面内联 socket/domain 逻辑；
7. 邀请制小规模 pilot，记录加入成功、恢复成功、proposal→promotion→adoption 漏斗与失败原因，不记录正文。

退出 Gate：视觉原图和项目资料不越权；不同 artifact kind 共享同一权限/恢复/过期合同；所有正式写入仍只有本地事务；至少完成一轮双人真实使用观察，而非只跑自动脚本。

### C2-5：是否进入真正共同编辑的决策 Gate

仅在以下证据同时成立时评估 Yjs + y-indexeddb + Hocuspocus：

- 至少一批真实作者持续使用 C2-3/C2-4，而非一次演示；
- 高频反馈明确是“希望同时直接改同一正文”，不是评论/建议流程太慢；
- writingUnit、node、批注 targets、history 与桌面项目 owner 已稳定；
- 能承担账号、存储、密钥、备份、滥用、删除请求和服务可用性成本。

否则停止在建议式协作，不为了技术完整性引入 CRDT。

## 10. 验收矩阵

### 10.1 协议与故障

- 两浏览器、Web↔Electron、房主/审阅者/旁观者三角色；
- 30 秒内断线恢复相同 memberId 与 host；grace 后只产生一个新 host epoch；
- 旧房主迟到 completion、旧 adoption ACK、旧 runtime patch 全部被拒绝；
- seq 缺口触发 snapshot，不用不完整事件猜状态；
- 服务重启后房间按 TTL 恢复，或返回明确 expired，不能假装新空房；
- command retry、重复 vote、重复 completion 恰好执行一次；
- 20/100/1000+ 事件后提案、投票、讨论和生成状态一致；
- 过大 payload、未知 path、越权 capability、伪造昵称/epoch/token 被拒绝。

### 10.2 隐私

- guest 收到的只有 manifest allowlist；
- 不包含未分享章节、完整 localStorage、API key、provider 配置、隐藏提示词、工具参数、记忆候选原文；
- 公网 relay 上 artifact/comment/branch 内容为客户端密文，content key 不出现在 HTTP/WS/服务端日志；
- visual preview 到期不可访问，原始资产仍在 host；
- server 日志和错误不回显 secret/正文；
- 邀请链接撤销后新连接失败，已有连接按策略关闭或降权。

### 10.3 Authoring 行为

- 评论定位稳定 `unit/node/revision`，切章和双栏不会串目标；
- proposal 提升为 Ghost 前零正文写入；
- 作者编辑 Ghost 后能采用，不能要求一次性全吞；
- stale proposal 不覆盖新正文；
- adoption 只产生一次 editor transaction、一次 persist、一次 observer 调度；
- 保存失败只重试保存；撤销覆盖完整采用组；
- 关闭/重开 inspector、1024 覆盖层、390 sheet 均恢复 selection/scrollTop/focus；
- 房间离线不会触发记忆候选、自动联想或 AI 重复请求。

### 10.4 视觉证据

每个可见切片保留批准后的固定机位图，过程图只进 `/tmp` 并及时清理：

1. 1440 作者当前 writingUnit + 协作右栏；
2. 1440 受邀只读审阅 tab；
3. 1024 inspector overlay 不挤压正文；
4. 390 评论/提案 sheet；
5. 1440 F3 共同排演 + 分组 Ghost；
6. Electron 产品态远端房间连接。

截图必须同时核对信息层级、正文宽度、锚点、滚动、焦点、空态、断线态、stale 态、长昵称/长建议和深浅主题，不以“组件出现”代替验收。

## 11. 并发与提交纪律

- F3 主工作台由当前 integration owner 接线；C2-0～C2-2 必须在独立 worktree/branch `feature/collaboration-v2-foundation` 执行，base commit 在开工时写入任务板，不从未提交 WIP 隐式继承文件。
- F3 独占：`src/pages/Authoring.vue`、`Authoring.block-native.css`、`WritingNotebookEditor.vue`、scene laboratory、typed-link/impact projection、Ghost/adoption/history、worldbook/history/outline adapter。
- C2 独占：新 `shared/collaboration/*`、新 `server/realtime/v2/*`、新 `server/repositories/collaboration/*`、新 `src/services/collaboration/*`、旧 Experience compatibility adapter 和 collaboration smoke/fixture。
- 在 C2-3 前，C2 不得修改 Authoring 页面、正文 editor、F3 领域对象、Ghost owner、worldbook/history/media store；F3 不得修改 WebSocket handler、room repository 或 collaboration protocol。
- 两轨唯一共享的是纯类型/fixture 约定。若 `StableLocator` 等当前定义仍位于 F3 私有目录，integration owner 先抽取中立合同；C2 不反向 import 页面或 composable。
- `docs/STATUS.md` 由 integration owner 更新；两个 worktree 不同时改它。各轨过程状态写各自短 summary，合流后由 owner 汇总。
- C2-3 进入 Authoring 前必须安排单一 integration window：先冻结 F3 artifact adapter，再合 C2 foundation，最后由一个 owner 增加协作 surface 和 promotion bridge。
- 每个阶段先完成完整逻辑切片再跑 focused Gate；只有大阶段收口才跑 `verify:full`，不为细小改动频繁执行全量测试。
- 提交按协议底座、客户端 transport、Authoring bridge、可见 UI/截图分逻辑整理；不混入当前大量 Authoring WIP。
- worktree 合流并验证后立即回收；不得长期保留已合并分支、重复依赖目录或 `/tmp` 截图。

## 12. 第一阶段实际执行顺序

当前不应立刻做右栏。C2 第一阶段与刚启动的 F3 并行，按以下顺序：

1. integration owner 记录 F3 当前 base、C2 worktree base、两边写集和 C2-3 合流条件；
2. F3 继续本地 intervention/impact fixture；同时 C2 给 v1 补故障 fixture；
3. 两边共同确认 locator/revision/artifact JSON fixture，随后各自实现，不互相 import；
4. C2 写 v2 纯合同、repository 和 materializer，不连接 Vue；
5. C2 完成 resume token、grace、host epoch、ACK、gap recovery、权限、配额和 payload 安全；
6. C2 完成 transport/WebCrypto，并用旧 Experience compatibility adapter 跑双浏览器故障矩阵；
7. F3-2 影响组稳定后，integration owner 冻结 `toCollaborableArtifact()` 与 promotion request；
8. 仅当 F3 本地分支和 C2 relay 分别通过各自 Gate，才进入 C2-3 共同排演第一张可见切片；
9. 共同排演真实双人观察通过后，再扩通用审阅、助手和画师。

这样 C2 的前半段不抢 F3 页面施工，F3 又会从第一天产出可分享的稳定对象。第一轮结束时两条轨分别拥有“可信本地因果对象”和“可信网络搬运层”；只有二者都成立，才组合成共同排演，而不是先做一个好看的在线面板再补数据语义。

## 13. Pilot、运营与停止条件

C2-4 前只做邀请制、2–6 人、短 TTL 房间。没有真实用户时不建设账号组织、公开广场、永久云项目、消息推送或横向扩容。

只记录低敏指标：

- create→join 成功率与耗时；
- reconnect 恢复相同 member/host 的比例；
- direction proposal、selected、promoted、adopted 数量；
- stale/rejected/timeout/upgrade-required 原因计数；
- duplicate completion、越权写入、未分享内容泄漏必须恒为零。

进入通用审阅的最低证据：

- 至少完成 5 次真实双人共同排演，不要求都是外部用户；
- 多数 session 至少产生一个作者认为有价值的方向，而非只把聊天搬进右栏；
- join/reconnect 不需要开发者手工修房间；
- 作者理解 selected、promoted、adopted 的区别；
- relay 成本和房间数据规模可测且可删除。

若共同排演没有比共享聊天/语音带来更清楚的证据和采用链，停止 C2-4，不扩展 CRDT、通用审阅或公开服务；保留可靠 relay 供旧 Experience 使用。
