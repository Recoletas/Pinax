# Pinax 产品整合与演进主计划

> 状态：Active / 2026-07-16
>
> 适用分支：`main`
>
> 目标：把当前“功能很多但彼此并列”的 Pinax，收敛为一个从世界构建、冒险涌现、素材沉淀、正文创作到视听改编的连续创作系统。
>
> 本文是当前唯一的产品级实施路线图。`docs/plan/`、`docs/agent-runs/` 与 `docs/superpowers/` 中的旧材料只作为研究、决策和实现证据，不再各自驱动产品优先级。

> **当前执行重心（2026-07-15 调整）**：主线不是继续扩地图引擎，而是让地理真正进入历史、冒险和世界状态。地图 Worker、备份和压力测试属于支撑性 Gate；地图草案、历史开局、PlaceEntity 和玩家历史回流已接通，当前优先完成地点双向 UI、语义审阅、候选具体化和受控状态变化。

> **新增专项（2026-07-16）**：在 Creative Graph 稳定后，素材页增加插画与漫画工作流，分镜页增加异步视频任务，体验页增加可分享路由的联机冒险。三者必须复用统一引用、媒体任务和 runtime event 契约，不在三个巨型页面中各写一套供应商或同步逻辑。

## 1. 结论

Pinax 当前的问题不是“缺少更多按钮”，而是缺少一条贯穿所有功能的对象关系和用户旅程。

现有能力已经覆盖：

- 世界书、结构化设定、快速导入和字段级 AI 生成；
- Voronoi 地图、国家、城市、道路、河流、标记和高清导出；
- 地理语义提取、历史节点生成、历史开局和玩家历史摘要的底层模块；
- 文字冒险、会话、剧情日志、角色、目标、阵营关系、随机机制和记忆；
- 素材库、写作编辑器、Copilot、顾问动作、章节大纲和文本改写；
- 关系画布、分镜版本、镜头导出、图片生成和剪辑包导出。

但这些能力现在主要靠路由跳转、localStorage 键和临时导入动作连接。用户必须自己理解“这一页的结果要去哪里”，系统也无法稳定回答：

- 当前在创作哪个项目、世界、故事线和场景？
- 一段内容来自哪次冒险、哪个历史节点、哪张地图、哪个角色？
- 设定修改后，哪些历史、章节、分镜和视频已经过期？
- 地图上的地点是否就是对话中的当前位置？
- 玩家行为是否真的改变历史，而不是只留下聊天记录？
- 分镜、图片、视频是否属于同一个镜头版本？

所以总体策略是：

```text
先稳定运行边界
  -> 建立统一项目与资产引用
  -> 打通设定 / 地图 / 历史 / 冒险
  -> 打通冒险 / 素材 / 写作 / 分镜
  -> 最后接视频、音频和发布渠道
```

视频接入不是第一阶段。若现在直接在 `ProseEssay.vue` 继续写供应商分支，只会把现有生图代码的耦合复制到更昂贵、更慢、更难恢复的视频任务上。

## 2. 产品北极星

### 2.1 核心承诺

Pinax 是一个“活世界创作系统”：作者建立世界，进入其中体验事件，世界记住选择并继续演化，最后把真实发生过的内容写成作品并改编成分镜或视频。

### 2.2 核心闭环

```text
项目
  ├─ 世界设定
  ├─ 地理地图
  ├─ 世界历史与势力状态
  ├─ 冒险会话与玩家选择
  ├─ 叙事素材与角色档案
  ├─ 章节与正文
  └─ 分镜、图片、视频与音频

设定 -> 地图 -> 历史 -> 冒险 -> 素材 -> 写作 -> 分镜 -> 视听输出
  ^        |        |        |        |        |        |        |
  └────────┴────────┴────────┴────────┴────────┴────────┴────────┘
                  所有结果保留来源、版本和反向引用
```

### 2.3 主用户旅程

1. 创建或导入一个项目，选择模板或空白开始。
2. 在“设定”工作区补齐世界、角色、故事规则；系统展示完成度和冲突，而不是堆多个相似入口。
3. 从设定生成地图草案，用户审阅后确认；地图地点自动成为可引用实体。
4. 从地图和设定生成历史草案，用户选择保留、重写或锁定关键事实。
5. 从一个历史节点或场景进入冒险；GM 使用同一套地点、角色、关系和历史事实。
6. 冒险推进后，系统提议新增事件、人物变化、地点变化和未决线索；用户确认后写回世界。
7. 用户把片段保存为素材，素材自动保留来源，不再手工复制背景信息。
8. 写作时，AI 根据章节目标、相关素材、角色状态和当前世界版本提供建议。
9. 章节转为分镜时，镜头引用原始段落、角色、地点和视觉参考。
10. 分镜镜头提交图片或视频生成任务；任务可暂停、失败重试、切换供应商并记录成本。

## 3. 当前系统审计

### 3.1 已有能力与融合程度

| 领域 | 已有实现 | 当前融合程度 | 主要问题 |
|---|---|---:|---|
| 世界设定 | `worldStore`、快速导入、高级条目、结构化设定 | 中 | 4 个入口视觉和操作层级不一致；草稿、正式条目与结构字段关系弱 |
| 地图 | Voronoi engine、Worker、Canvas renderer、marker CRUD | 中 | 常规重复生成、超时后的 Worker 恢复、语义点审阅和地点双向 UI 已有支撑；地图数据作为可版本化一等资产、20 次压力指标和浏览器 smoke 仍未收口 |
| 历史 | map semantics、history generator、history opening、player history helper | 中 | 地图到历史草案、逐项审阅、历史开局、玩家历史写回和 PlaceEntity 入口已进入生产链；受控状态变化、完整冲突检测和旧 `mapBinding` 的迁移仍需继续 |
| 冒险 | 会话、GM、上下文、日志、事件、机制、记忆 | 中 | 多处 prompt 副本；事件与历史只记录不演化；调试数据多数不可见 |
| 素材 | narrative assets、速记、对话导入、图片资产 | 中 | 已保留旧 `source` 并补 `sourceRefs[]`、内容指纹、同项目同来源去重和批量合并；summarizer 前置、revision/tags、全局检索和跨项目迁移仍未完成 |
| 写作 | 章节、富文本/Markdown、Copilot、顾问、改写 | 中 | 单页超过 5700 行；动作体系双轨；项目上下文与素材引用仍需手工组织 |
| 分镜 | relation canvas、storyboard versions、shot exporter | 中 | `useDirector` 无生产调用；分镜与图像供应商逻辑混在巨型页面中 |
| 图片/漫画 | 共享 provider/config、MediaAsset、素材插画、ComicPage 制作字段 | 中 | 景别/机位/透视、格框、制作阶段和视觉圣经字段已直接接入现有漫画页；仍缺改编分页、自由构图画布、真实阶段生成、文字排版与质检 |
| 视频 | 无正式任务层 | 无 | 不能直接复用当前同步生图逻辑；缺异步任务、回调、资产下载和成本治理 |
| 联机体验 | `ws` 依赖、现有 runtime event、会话与 SSE 文本流 | 低 | 依赖已安装但 Express 未挂 WebSocket server；只有 `/experience` 单机路由，没有房间、成员、重连、权限和权威事件序列 |
| 存储 | localStorage、部分 schema、备份导出 | 低 | 动态键漏备份；写入分散；无事务、迁移注册表和大媒体容量方案 |
| UI/UX | 两套主题、AppShell、工作区导航、浮层 | 中低 | 功能页各自发展；页面巨型化；移动、键盘、错误恢复和状态反馈不统一 |

### 3.2 已确认的技术断点

以下不是推测，已有本地代码和 2026-07-02 综合审计支持：

1. `extractMapSemantics()`、`generateGeoHistory()` 和 `buildPlayerHistoryNodeFromPlotJournal()` 已接入地图草案、历史开局和剧情日志写回；语义点逐项审阅已完成，失败/覆盖恢复和真实浏览器 smoke 仍待补齐。
2. `PlaceEntity` 已通过稳定 `placeId` 把地图引用、历史节点和世界书条目聚合到 runtime 查询；地图、事件日志和结构化设定已完成地点上下文互跳，历史节点 / 条目已有逐项入口，浏览器验证仍待补齐。
3. history generator 的 `{siteId, cellIds, markerIds, routeIds}` 与 runtime 的 `{country, city, scene}` 仍是历史数据中的两类旧绑定；`placeRef` 已作为归一化桥接，但需要继续收敛写入和迁移规则。
4. `runtimeState.historyNode` 已有历史开局的稳定写入者；后续要补的是玩家行动产生的受控世界状态变更，而不是再次增加孤立的读取逻辑。
5. `useDirector.js` 没有生产调用；导演能力主要散落在 `ProseEssay.vue`。
6. narration/system prompt 在多个服务、组件和 store 中复制。
7. `STORAGE_KEYS` 不是所有存储写入的真实目录；动态世界书键、对话角色和若干 UI 偏好已进入备份发现，但迁移注册表、IndexedDB 和大型媒体方案仍缺。
8. `Writing.vue`、`ProseEssay.vue`、`Notes.vue` 和 `Experience.vue` 都已成为 2500-5700 行的页面级应用，继续在页面内部加渠道会快速失控。
9. 共享图片调用、配置、连接测试、响应解析与二进制归档已从页面抽离；`ImageGenRail.vue` 只保留兼容包装，新增漫画或视频必须继续复用 `MediaGenerationDrawer` 和 MediaAsset，不得恢复页面内 provider fetch。
10. 当前 `server/index.js` 直接 `app.listen()`，没有可复用的 HTTP server 实例，也没有 room manager；联机不能靠同步 localStorage 或广播整个 Pinia state 临时拼接。

### 3.3 地图生命周期的剩余风险

地图生成的常规连续操作已经有两层保护：`WorldMapVoronoi.vue` 只保留最后一个待生成配置，新图完成并通过渲染后才替换旧位图；Worker 边界也会剥离 Vue reactive proxy，组件卸载时会清理 Worker 和 Canvas。这意味着“连续点几次重新生成就必然卡死”不是当前代码可以直接下的结论。

当前明确的恢复缺口是：在 Worker 真正卡住并触发 60 秒超时前，超时只会 reject 外层 Promise；如果继续复用该模块级 Worker，下一次重试可能仍拿不到新的计算资源。本计划先补上 timeout -> terminate -> new Worker 的最小闭环，并用定向契约测试锁住；其余渲染 epoch、RAF/导出任务和内存预算属于后续可测的可靠性硬化，不再把它们描述成已确认的卡死根因。

## 4. 架构目标

### 4.1 统一项目模型

新增一个轻量、可迁移的 `ProjectManifest`。第一阶段不一次性搬走所有数据，只负责建立身份、引用和版本边界。

```ts
interface ProjectManifest {
  schemaVersion: number
  id: string
  title: string
  activeWorldbookId: string | null
  activeMapId: string | null
  activeStorylineId: string | null
  createdAt: number
  updatedAt: number
  references: {
    sessionIds: string[]
    manuscriptIds: string[]
    assetIds: string[]
    storyboardDocumentIds: string[]
    mediaJobIds: string[]
  }
}
```

规则：

- 现有 store 仍是各领域状态的 owner，不新增第二套业务状态；
- manifest 只连接领域对象，不复制正文、地图 cells 或聊天消息；
- 所有新对象必须带 `projectId`；旧对象通过一次性 migration 补默认项目；
- 活跃项目切换必须原子更新 worldbook、地图、会话和写作上下文；
- UI 不允许每页自己猜 active worldbook/project。

### 4.2 统一资产引用

所有跨功能流转使用 `ContentRef`，停止仅传一段裸文本：

```ts
interface ContentRef {
  refType: 'worldbook-entry' | 'map-site' | 'history-node' | 'session-message'
    | 'plot-journal' | 'narrative-asset' | 'chapter' | 'storyboard-shot'
    | 'image' | 'video' | 'audio'
  refId: string
  projectId: string
  version?: string | number
  excerpt?: string
}
```

所有素材、章节大纲项、分镜镜头和媒体任务都要保留 `sourceRefs[]`。这会同时解决来源追踪、跳回原文、更新提示、去重和导出归档。

### 4.3 统一生成任务

文本、图片、视频可以共享任务 envelope，但不强行共享供应商参数：

```ts
interface GenerationJob {
  id: string
  projectId: string
  kind: 'text' | 'image' | 'video' | 'audio'
  taskType: string
  provider: string
  model: string
  status: 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  inputRefs: ContentRef[]
  outputRefs: ContentRef[]
  providerJobId?: string
  progress?: number
  attempts: number
  estimatedCost?: number
  actualCost?: number
  error?: { code: string; message: string; retryable: boolean }
  createdAt: number
  updatedAt: number
}
```

文本流仍可即时返回；视频必须使用持久化异步任务。页面只消费任务状态，不直接解析每家供应商的响应。

### 4.4 草稿与正式状态

对 AI 生成的设定、地图、历史、世界变更和媒体统一使用：

```text
draft -> reviewed -> accepted -> superseded / rejected
```

AI 不直接覆盖正式世界。用户确认后才写回；写回产生变更记录和受影响对象列表。

### 4.5 统一媒体资产

插画、漫画格、分镜参考图和视频 take 都进入同一媒体资产目录，不再把 base64、临时 URL 和提示词散落在页面字段里：

```ts
interface MediaAsset {
  id: string
  schemaVersion: number
  projectId: string
  kind: 'image' | 'comic-page' | 'video' | 'audio'
  purpose: 'illustration' | 'comic-panel' | 'storyboard-reference' | 'storyboard-take'
  sourceRefs: ContentRef[]
  parentAssetId?: string
  generationJobId?: string
  provider: string
  model: string
  promptSnapshot: string
  generationParams: Record<string, unknown>
  storageRef: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  status: 'draft' | 'accepted' | 'rejected' | 'superseded'
  createdAt: number
  updatedAt: number
}
```

规则：

- 复用现有抽屉的交互与模型配置迁移，不复制 `callImageAPI()`；
- 页面只提交 `GenerationJob` 并消费 `MediaAsset`，供应商响应只在 adapter 中解析；
- 漫画格不是分镜镜头的别名，两者通过显式 adapter 互转，避免对白排版状态污染视频镜头；
- localStorage 只存 metadata，二进制结果进入 IndexedDB/服务端资产存储；临时供应商 URL 必须在过期前归档；
- 任何结果都保留 prompt snapshot、模型、参数、来源和 take 关系，支持重生成与回退。

### 4.6 联机房间与权威事件流

联机体验借鉴 hack.chat 的低门槛入口：房间名体现在可分享 URL，用户只需昵称即可加入，进入后立即看到在线成员和加入/离开事件。Pinax 不照搬其无日志聊天室模型，而以可恢复的剧情事件为核心。

规范路由：

```text
/experience/online/:roomSlug
/experience?room=:roomSlug  -> 只作兼容并重定向到规范路由
```

房间不广播整个 store，只广播有序事件：

```ts
interface RoomEvent {
  id: string
  roomId: string
  seq: number
  type: 'presence.joined' | 'presence.left' | 'chat.message'
    | 'player.action.proposed' | 'player.action.selected'
    | 'narrative.started' | 'narrative.committed'
    | 'runtime.patch.proposed' | 'runtime.patch.accepted'
    | 'room.snapshot'
  actorId: string
  payload: Record<string, unknown>
  createdAt: number
}
```

规则：

- 服务端分配单调递增 `seq`，客户端按 `lastSeq` 重连补发，重复 `eventId` 幂等丢弃；
- 服务端是房间成员、回合结果和 runtime patch 的权威 owner；客户端仍可保留本地 UI 偏好；
- 房主负责选择世界、启动 LLM 生成、确认世界状态写回；玩家首版提交行动或投票，旁观者只读；
- LLM 文本在生成完成后以一次 `narrative.committed` 发布，避免参与者看到分叉或半截正文；后续再评估受控 token stream；
- API key 永不进入 room event。房主配置只通过现有服务端 chat gateway 的短期请求使用，不广播、不持久化到房间日志；
- 房间默认短期保留，空房 TTL 到期销毁；受保护房间可设置口令摘要，但不把“知道 URL”等同于安全；
- 首版不做正文、设定、地图的多人实时编辑，也不做 CRDT。

## 5. 实施路线

路线按依赖分为 6 个 release gate。每个 gate 必须独立可交付、可回滚、可手测。时间为单人全职粗估，包含测试和文档，不包含大规模视觉资产制作。

## Gate 0：冻结基线与可靠性止血

目标：先让当前功能可重复使用，停止在不稳定底座上继续迁移。

预计：1-2 周。

### G0.1 建立可测基线

当前进度（2026-07-15）：已将 10 条主流程的固定输入、成功判据、持久化副作用和恢复动作写入 [`docs/src/test-status.md`](../src/test-status.md)。当前只完成口径冻结；真实浏览器/API smoke、失败恢复和数据清空后恢复仍未宣称通过。

任务：

- 对当前 dirty worktree 做所有权清单，不混合提交用户现有 WIP；
- 为 10 条主流程建立 smoke checklist：创建世界、导入设定、生成地图、进入历史、冒险 8 轮、存素材、写章节、生成分镜、生成图片、备份恢复；
- 将当前 known failures 分成“基线失败”和“本轮回归”，不再接受笼统的全量红灯；
- 增加固定 demo fixture，避免所有测试依赖随机生成和真实 LLM；
- 给主要页面加错误边界和全局未捕获错误记录，避免白屏无解释。

候选文件：

- `src/main.js`
- `src/router/index.js`
- `src/components/debug/DebugTriage.vue`（若对应分支合入）
- `src/__tests__/integration.test.js`
- `docs/src/test-status.md`

验收：

- 10 条 smoke 流程有输入、期望结果、数据副作用和恢复步骤；
- 任何生成失败都有用户可见错误、重试入口和诊断 id；
- 没有新功能代码进入本 gate。

### G0.2 补强地图生成生命周期

基线说明：常规的“只保留最后一次生成意图”和“旧结果不替换当前地图”已经存在。本阶段先修复异常超时后的恢复能力，再根据压力测试结果决定是否需要继续做渲染调度、导出和内存方面的硬化。

任务：

- `generateMapInWorker()` 保留每任务 request id，并记录当前 Worker owner；
- timeout、cancel、组件卸载和 fatal engine error 都必须 terminate 当前 Worker；
- terminate 后下一次调用创建全新 Worker，不复用疑似卡死实例；
- 现有 pending config、临时 Canvas 和“成功后替换”逻辑保持不变，并用测试覆盖，不重复重写；
- 在压力测试确认存在回归后，再集中管理 RAF、timeout、导出任务和内存预算；
- 高清导出是否拆 Worker 或按 tile 渲染，先以性能数据决定，不在本小步预设实现。

必须新增测试：

- timeout 后 `worker.terminate()` 被调用；
- A 超时后 B 使用新 Worker 并成功；
- A/B/C 快速提交只落 C；
- 组件卸载后迟到结果不 emit；
- render A 迟到不覆盖 map B；
- 连续 20 次 regenerate 不增长活动 Worker、timer 和 RAF 数；
- 大配置被 guard 拒绝或降级，而不是冻结浏览器。

验收指标：

- 20 次连续重新生成无永久 loading、无请求堆积；
- 任一任务取消后 1 秒内 UI 回到可操作状态；
- 1200x800 默认地图生成期间输入响应 P95 < 100ms；
- 生成失败后下一次重试不需要刷新页面；
- DevTools heap 在 10 次生成后回落到首次稳定值的 1.5 倍以内。

### G0.3 存储安全网

当前进度（2026-07-15）：已完成导出侧真实键盘点，动态发现 `worldbook_<id>` / `worldbook:brief:<id>:<section>`，补入 `active_worldbook_id`、`dialogue_characters` 和 Notes 图片提示键，并在备份顶层增加 `schemaVersion`；`createRestorePlan()` 与 `restoreBackup()` 已完成无副作用预览、确认写入、损坏输入拒绝和 quota/storage 失败后的回滚，设置页已接入导入确认。迁移注册表、IndexedDB 和大媒体迁移仍未开始。

任务：

- 枚举所有真实 localStorage 键和动态键；
- 修正备份遗漏：`worldbook_<id>`、`dialogue_characters`、结构化设定 brief 等；
- 备份格式加 `schemaVersion`、项目清单、校验摘要和生成时间；
- 增加 dry-run restore，先报告将新增、覆盖、跳过和不兼容的对象；
- 写入失败必须显示 quota/storage warning，不再只 console.warn；
- 大型图片和未来视频只保存 metadata/Blob reference，不存 base64 到 localStorage。

验收：

- 导出 -> 清空 -> 导入后，世界、会话、素材、章节、分镜和地图配置数量一致；
- [x] 损坏备份不会部分覆盖现有数据；
- [x] 超配额时用户能导出和清理，不丢失当前编辑状态；

## Gate 1：统一产品壳与核心工作流

目标：让用户感觉自己在操作同一个项目，而不是访问多个独立 demo。

预计：2-4 周。

### G1.1 项目上下文

任务：

- 新增 `projectStore` 或同等轻量 manifest owner；
- 首次启动将现有数据归入“默认项目”，迁移可重复执行；
- AppShell 提供当前项目/世界的统一上下文，不在每页重复 picker；
- 路由 query 只用于深链，不作为业务状态唯一来源；
- 新建/切换/删除项目要显示影响对象数量并支持撤销窗口；
- active worldbook、map、session、manuscript 组合非法时自动修复并提示。

验收：

- 切换项目后设定、地图、冒险、素材、写作、画布同时切换；
- 不出现 A 项目的地图配 B 项目的世界书；
- 刷新任意深链可以恢复同一上下文。

### G1.2 设定工作区整合

把当前 4 个入口收敛成一个设定工作区内部的视图：

- `概览`：完成度、最近变更、冲突、生成建议；
- `结构`：世界观、故事、角色、规则；
- `条目`：高级世界书条目和注入设置；
- `地图`：地理编辑与地点实体；
- `历史`：时代、事件、势力和未决线索。

UI 原则：

- 共用同一页标题、世界选择、保存状态、AI 任务状态和 undo；
- 快速导入变为“导入向导”，不是长期平级页面；
- AI 生成结果都进入右侧 review drawer，字段/地图/历史共用状态语言；
- 高级字段渐进展开，默认只显示完成任务所需的最少控制；
- 不在卡片里再套卡片；沿用现有主题 token 和活页档案语法；
- 在 1280、980、760、390 宽度做截图和交互验收。

候选拆分：

- `src/pages/SettingsWorkspace.vue`
- `src/components/settings/SettingsWorkspaceNav.vue`
- `src/components/settings/SettingOverview.vue`
- 复用现有 `StructuredSettingsPanel.vue`、`WorldMapPanel.vue`
- 将 `WorldBookQuickImport.vue` 改为 modal/wizard 或 route overlay

验收：

- 用户无需离开设定工作区即可完成导入、补字段、生成地图、查看历史；
- 任一 AI 草稿均有来源、状态、接受、拒绝和重试；
- 保存状态与错误反馈全页一致。

### G1.3 统一命令与任务反馈

任务：

- 建立全局 task center，展示文本、地图、图片、视频任务；
- toast 只承担短确认，长任务进入 task center；
- 统一 modal stack、Esc、focus return、body scroll lock；
- 统一空状态、错误状态、dirty 状态、保存中、离线和 API 未配置状态；
- 对删除、覆盖、生成大任务提供可预测的确认和撤销。

验收：

- 页面切换不丢任务状态；
- 同时运行任务时用户能看到队列、取消和失败原因；
- 所有 dialog 可键盘关闭并恢复焦点。

### G1.4 体验页叙事会话与阅读系统

#### G1.4.1 问题定义与目标形态

当前体验页已经从传统聊天气泡转向连续正文，但数据和渲染仍停在两个互相冲突的层次：

- `gameStore.messages` 把一次模型回复保存为一条 assistant message；
- `GamePanel.vue` 把整条 message 渲染成一个 `<p>`，只在角色切换时显示一次名称；
- `rpTextRenderer.js` 依靠正则给引号、星号、括号和关键词做行内着色；
- 一个回复内出现旁白、多个角色、动作和心理时，没有可靠的说话者与语义边界；
- 编辑、删除、重写后续属于消息轮次，但视觉上没有清晰保留这层“酒馆会话”来源；
- 当前 17px、页面级行高覆盖和 2em 缩进仍是一套分散的固定排版，尚未形成可调、可回退的阅读配置。

目标不是把页面改回普通聊天软件，也不是把所有生成记录伪装成无来源的小说正文，而是建立：

> **Tavern session shell + editorial reading interior（酒馆式会话骨架 + 编辑阅读内页）**

信息层级固定为：

```text
场景 / 章节边界
  -> 会话轮次（玩家、叙事者、指定角色、系统）
    -> 语义块（叙述、动作、台词、心理、机制事件）
      -> 行内语义（嵌套引语、物品、地点、时间、可触发片段）
```

这里的“会话轮次”继续拥有编辑、删除、重写、候选版本和来源信息；“语义块”只负责阅读组织，不能各自复制一套消息操作。默认表现以无框正文为主，只有压缩完成、错误、机制确认等特殊系统反馈可以使用克制的背景或边框。

#### G1.4.2 调研依据与取舍

**SillyTavern / Tavern：**

- 本地 `/home/recoletas/jiuguan/SillyTavern` 为 `1.17.0-1-g004f1336e`；规划时已核对上游 `release` 的 `1.18.0`，不能把本地版本当作最新实现；
- 新旧版本都提供 `Flat / Bubbles / Document` 三种表现，但底层始终保留 `.mes -> .mes_block -> .ch_name -> .mes_text` 的稳定消息壳；
- Document 模式主要隐藏重复头像、名称和时间并调整正文间距，没有删除编辑、重生成、swipe/候选等消息能力；
- Bubble 模式只用克制的用户/角色承托色区分两方，不依赖大量正文颜色；
- 字号、聊天宽度、时间戳、头像、消息操作和引语/斜体颜色是独立设置，说明阅读表现不应污染消息数据；
- Pinax 应继承“消息来源稳定、当前消息操作可达、表现模式可替换”的原则，不复制 SillyTavern 的面板密度、头像墙或传统气泡外观。

**聊天产品的共同模式：**

- 连续同说话者消息合并视觉身份，只在一组开头显示名称/头像，组内通过间距而不是重复标签分段；
- 时间、编辑、删除等次级信息按 hover、focus、当前消息或长按出现，避免每段都常驻工具栏；
- 用户输入和角色回复保持可扫描差异，但差异首先来自位置、节奏、标签和有限字重，而不是给整片正文刷不同颜色；
- 回复、重试、替代版本绑定到消息轮次，点击任意普通台词不应打开“对话详情”。

**阅读产品：**

- Apple Books 将字号、字体、粗体、行距、两端对齐、页面主题和单双栏作为一套阅读外观配置，证明阅读舒适度应由少量一致参数共同控制；
- WCAG 2.2 Text Spacing 要求界面在用户覆盖到 1.5 倍行高、2 倍段后距、0.12em 字距、0.16em 词距时仍不丢内容或功能；这是一项抗破版要求，不等于默认视觉必须使用这些极值；
- 中文正文不照搬西文每段首行缩进：玩家行动、角色台词、连续叙述和场景开头分别确定段落节奏，避免所有消息统一 `2em` 缩进；
- 默认正文保持现有 Pinax 档案/纸页气质，阅读设置只改变正文变量，不改变三栏工作台、主题色和功能布局。

参考资料：

- SillyTavern 当前上游源码：`https://github.com/SillyTavern/SillyTavern`（`public/index.html`、`public/scripts/power-user.js`、`public/css/toggle-dependent.css`、`public/script.js`）；
- Apple Books 外观设置：`https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/mac`；
- WCAG 2.2 Text Spacing：`https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html`。

#### G1.4.3 数据契约

保留现有 `message.content` 为可编辑、可复制、可送回模型的干净文本，并新增可丢弃、可重建的表现侧车；不得把 HTML 存入 session：

```ts
type NarrativeMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  name?: string
  content: string
  timestamp: number
  isStreaming?: boolean
  presentation?: {
    version: 1
    source: 'model-structured' | 'parser' | 'legacy'
    status: 'provisional' | 'complete' | 'invalid'
    blocks: NarrativeBlock[]
  }
}

type NarrativeBlock = {
  id: string
  kind: 'narration' | 'action' | 'dialogue' | 'thought' | 'system'
  text: string
  speaker?: string
  addressee?: string
  tone?: string
  triggerRef?: string
}
```

约束：

- `content` 永远是事实源；`presentation.blocks` 删除后可以从内容重建；
- block ID 在同一 message 内稳定，由 message ID、顺序和规范化文本摘要生成，不用数组下标充当跨保存引用；
- `speaker` 只能来自明确模型结构、当前对话角色或高置信规则，无法确定时留空并按旁白展示，禁止猜成随机角色；
- `dialogue` 默认只是文本，只有存在 `triggerRef` / `mechanismTrigger` 的片段可点击；
- 编辑一条 message 后只重建该 message 的 blocks，并使依赖它的机制匹配、记忆候选和对话选项标记为待刷新；
- 老 session 无需迁移写回：加载时按 `presentation ?? deriveNarrativePresentation(message)` 懒派生；下一次正常保存才带上 version 1 侧车；
- `rebuildChatHistory()` 继续只发送干净 `content`，不能把渲染标签、颜色类名或 UI 元数据送给模型。

#### G1.4.4 生成、流式与降级策略

第一阶段不增加第二次 LLM 请求。主生成提示词改为请求轻量、可流式解析的叙事块协议，生成服务负责把协议还原为干净正文与侧车：

首选协议采用只允许出现在行首的低歧义 marker，不使用必须等待闭合的整段 JSON，也不让模型输出 HTML：

```text
:::narration
观测舱外的小行星带缓慢偏转。
:::action|陆晨曦
她合上已经泛黄的日记。
:::dialogue|陆晨曦
“那不是自然信号。”
:::thought|陆晨曦
她不愿承认，自己已经等待这句话十七年。
```

marker 仅接受 `narration / action / dialogue / thought / system` 白名单；speaker 去除控制字符和分隔符并限制长度。每遇到下一个合法 marker 就闭合上一块，流末尾闭合最后一块。未知 marker、缺失 marker、重复分隔符和正文中非行首的 `:::` 都按普通文本进入 fallback，不能吞掉内容。

1. 模型优先输出有类型和可选 speaker 的块；协议只描述语义，不包含字体、颜色、HTML 或组件名。
2. 流式阶段保留 `rawBuffer`，增量解析已经闭合的块；当前未闭合块作为 `provisional` 纯文本显示，不能等完整 JSON 结束才显示整条回复。
3. UI 只接收清洗后的文本和 blocks，协议标记不得闪现在正文里，也不得进入 `chatHistory`。
4. 完成时验证 block 类型、文本覆盖率、speaker 长度和顺序；所有 block 拼接后的规范化文本必须与 `content` 等价。
5. 模型未遵守协议时，使用确定性段落解析器降级：空行/换行 -> 引号 -> 星号动作 -> 心理标记 -> 普通叙述；未知 speaker 留空。
6. 连确定性解析也无法产生有效块时，退化成单个 `narration` 或按 message role 生成单个块，页面仍可读、可编辑、可重写。
7. 流式异常保留已生成的干净文本，message 标记 `presentation.status = invalid`，错误反馈另建 system message，不把“生成出错”拼进角色正文。

协议落地前先用 20 组中文 fixture 验证：纯叙述、单人台词、多人轮换、台词中嵌套单引号、动作夹台词、心理活动、场景转换、未闭合引号、Markdown、模型输出格式损坏。fixture 合并进少量 table-driven tests，不增加大量独立 test case。

如果第一阶段真实 provider 的结构遵循率低于 90%，才启用可配置的完成后“结构修复”调用；修复调用必须：

- 只返回 block ranges / speaker，不改写原文；
- 有独立 task type、耗时和 token 记录；
- 失败时静默回到 deterministic parser；
- 默认不用于短消息、玩家消息和已经高置信解析的消息。

#### G1.4.5 渲染组件与视觉层级

将 `GamePanel.vue` 从“消息循环 + 语义解析 + 操作 + 全部样式”拆为：

- `GamePanel.vue`：滚动、空状态、场景边界、消息列表和选择模式；
- `src/components/experience/NarrativeTurn.vue`：轮次身份、分组、编辑/删除/重写/候选操作；
- `src/components/experience/NarrativeBlock.vue`：叙述、动作、台词、心理、系统五类块；
- `src/services/narrativePresentation.js`：协议解析、确定性降级、兼容旧 message；
- `rpTextRenderer.js`：只保留安全转义和真正的行内语义，不再负责猜整个段落是谁说的。

默认视觉规范：

| 内容 | 默认表现 | 禁止项 |
|---|---|---|
| 旁白 | 正文字体、稳定行宽、自然段间距；连续旁白可合并节奏 | 每段重复“旁白”、整段着色、卡片框 |
| 玩家行动 | 较短的独立 turn，略深字重或轻微位置差，保留“我/角色名” | 标准蓝色聊天气泡、过强背景 |
| 角色台词 | 保留引号与现有斜体特征，speaker 只在台词组开头出现；字重比旁白略深 | 每句有框、所有台词可点击、字号突变 |
| 动作 | 与所属角色同组，以温和斜体/字色和前后节奏区分 | 大面积蓝色、单独 badge |
| 心理 | 比动作更内收，使用次级墨色与有限斜体 | 低对比灰、花哨颜色 |
| 嵌套引语 | 继续保留双引号外层特征；单引号/书名式内嵌引语使用温和但不同的 2-3 个语义色 | 玫红、同一蓝色覆盖所有层级 |
| 场景边界 | 无框章节留白、短标题和克制符号 | 横跨正文的重型装饰条 |
| 系统/机制 | 允许淡背景或细边界，压缩提示保持 `【压缩完成】上下文已压缩完成` | 混入普通叙述流 |

分组算法：

- scene message 永远断组；
- role、明确 speaker、在线事件作者或超过 5 分钟时间间隔变化时断组；
- 同一 assistant message 内连续同 speaker 的 dialogue/action/thought 合并为一个视觉组，但仍保留独立 block；
- narration 插入时终止当前 dialogue 组；短动作可以作为相邻台词的 lead/trail，不单独重复 speaker；
- 无 speaker 的台词不继承上一个角色超过当前 message 边界；
- 当前正在流式生成的 turn 保留稳定高度和光标状态，block 类型确认时不得让滚动位置跳动。

#### G1.4.6 Tavern 能力与阅读控制

消息操作保持 Tavern 逻辑但降低常驻噪声：

- 桌面端：hover 或 `focus-within` 显示当前 turn 的编辑、删除、重写后续；最后一条 assistant turn 可显示候选版本/swipe 入口；
- 触屏端：点按 turn 后显示一行紧凑操作，点正文其他位置关闭；不能依赖 hover；
- 操作按钮使用项目现有图标与 tooltip，必须是真正的 `<button>`，避免不可聚焦 span action；
- 编辑仍编辑整条原始 `content`，保存后立即重建 blocks；首版不做逐 block 富文本编辑，避免出现两个事实源；
- quick-note 选择作用于 turn，可在确认页只摘取选中 block；点击普通台词不进入详情；
- 替代生成属于 assistant turn，版本切换后同时切换 content 和 presentation，不把每个版本铺成多条消息。

阅读控制收进体验页现有设置，不新增常驻工具条：

- 三个紧凑预设：`舒展`、`标准`、`紧凑`，默认 `标准`；
- 可选高级项：正文 15-20px、行高 1.6-2.0、阅读列 42-68em、段落节奏、正文/系统主题跟随；
- 字体只在现有 body/display 字体栈中切换，不下载新字体，不允许每类 block 各用一种字体；
- 设置按用户本地保存，不写入项目、session 或联机事件；
- 调整只改 CSS custom properties，例如 `--experience-prose-size`、`--experience-leading`、`--experience-measure`、`--experience-block-gap`；
- 在 WCAG text-spacing override 下不得截字、重叠、遮挡操作或失去可点击机制标记。

#### G1.4.7 联机、持久化与边界

- `/experience/online/:roomSlug` 已直接复用 `Experience.vue -> GamePanel.vue`，所以叙事 renderer 只能有一套；禁止为联机再建一份 message markup；
- 房主广播的权威 narrative event 应携带稳定 message ID、干净 content 和可选 presentation；旧客户端忽略 presentation，新客户端缺失时本地派生；
- 房间左下角聊天仍是成员沟通层，不套用小说 block renderer，也不进入故事 `chatHistory`；
- 在线成员昵称不能被 deterministic parser 当作故事角色；只有权威 narrative event 中明确 speaker 才进入角色台词；
- localStorage 中大型旧会话不做启动时全量重算，当前可见窗口优先派生，其余按进入视口或打开 session 时处理；
- 语义块不是记忆条目。记忆候选继续从完整回复完成后提炼，但可利用 blocks 只选择关键动作、承诺、事实和状态变化，不能把整段台词自动塞入记忆。

#### G1.4.8 分期任务、验收与回退

**M0：基线与设计样本（0.5 天）**

- 固定 20 组中文叙事 fixture 和 6 个真实 session 截图样本；
- 记录 1440、1280、900、390 宽度下正文宽度、每行字数、首屏可见行数和滚动位置；
- 标出当前同色泛滥、speaker 错判、未闭合引号、工具操作不可达和长段疲劳样本。

门禁：没有 fixture 与截图基线，不开始改提示词或 CSS。

**M1：语义契约与兼容解析（1-2 天）**

- 建立 `narrativePresentation.js` 和 schema validator；
- 建立 `buildExperienceNarrativePrompt()`（或同等单一 owner），让初始化、继续、重写和 InputArea 的提示预览读取同一份格式契约，删除 `InputArea.vue` 与 `rebuildChatHistory()` 互相漂移的重复提示；
- 给每条新 message 生成稳定 ID；
- 完成结构协议、流式增量解析、clean content 拼接和 deterministic fallback；
- 旧 session 懒派生，编辑/删除/重写保持原行为。

候选改动边界：`src/stores/gameStore.js`、`src/components/InputArea.vue`、`src/services/generationService.js`、新增的 `src/services/narrativePresentation.js` 与既有 generation fixture；服务端 `/api/chat/stream` 只负责传输 chunk，不解析 UI 语义。

门禁：20 组 fixture 无文本丢失；协议损坏时仍显示完整原文；保存后不出现 HTML/协议标记。

**M2：组件拆分与默认阅读表现（2 天）**

- 拆出 `NarrativeTurn` / `NarrativeBlock`；
- 落实五类 block、speaker group、场景边界和行内嵌套引语；
- 删除旧的整段 role class、drop-cap 与统一 2em 缩进中和新层级冲突的部分；
- 保持 Experience 三栏尺寸和整体 Pinax 主题不变。

门禁：一条 assistant 回复中两名角色 + 旁白可在 3 秒内扫描清楚；无普通台词卡片；无整屏同蓝；文本列不因标签跳动。

**M3：消息操作与 Tavern 连续性（1 天）**

- 恢复语义正确的 turn 操作、触屏入口、键盘 focus 和最后消息候选位置；
- 编辑后重建 blocks，重写后续仍准确截断；
- 仅机制台词可点击，普通台词保持纯阅读行为。

门禁：编辑、删除、重写、quick-note、机制触发各走一遍；键盘和触屏均可完成操作。

**M4：阅读配置、移动端和联机复用（1-2 天）**

- 设置页接入三个阅读预设和 CSS variables；
- 验证 1440 / 1280 / 900 / 760 / 390，浅色/深色、reduced motion 和 text spacing override；
- 双浏览器联机验证房主/成员看到相同叙事分块，成员聊天不混入正文。

门禁：所有宽度无横向滚动、重叠和正文被侧栏遮挡；切换预设不改变消息数据；刷新后设置与 session 恢复。

**M5：真实模型评估与可选结构修复（1 天观察窗口）**

- 至少用已配置的两类 OpenAI-compatible provider 各生成 20 次；
- 记录协议遵循率、speaker 准确率、fallback 率、首块显示延迟、完整回复耗时和用户手动编辑率；
- 只有遵循率低于 90% 或多人台词 speaker 准确率低于 85% 时，才实现完成后结构修复调用。

回退策略：任何 provider 都可关闭 structured narrative，仅保留 deterministic parser；`presentation` 可整体丢弃而不影响原文、历史、重写和 session 加载。

#### G1.4.9 测试预算与完成定义

自动化测试总数继续不超过 200：

- 在现有 `integration.test.js` 中把零散 renderer 断言合并为 1-2 个 table-driven tests；
- 用同一测试覆盖五类 block、嵌套引号、仅 trigger 可点击、malformed fallback 和 clean-content 等价；
- store 契约只增加一个 message round-trip / edit rebuild 场景，必要时替换重复旧断言，不扩测试文件数量；
- 视觉 12 tests 不增加数量，替换其中 Experience 基线，保留桌面与窄屏代表视口；
- 手工 smoke 不计入自动化数量，但必须记录 provider、session、viewport 和结果。

完成定义：

- 多角色回复不再显示为一个身份不明的大段落；
- 叙述、动作、台词、心理可辨，但正文仍像同一篇作品而不是彩色组件集合；
- 普通台词不可点击，机制触发片段有明确且不刺眼的可交互标记；
- 双引号保留斜体/台词特征，内嵌单引号具有温和分层且不使用玫红；
- 轮次编辑、删除、重写、候选和联机同步不因新 renderer 退化；
- 旧 session、格式损坏输出和无结构 provider 都能完整显示原文；
- `verify:full` 通过，核心 + 视觉测试总数不超过 200，并完成指定视口截图审阅。

执行进度（2026-07-24）：G1.4 的指定视口阅读审阅已完成。主题2常规/长会话覆盖 1440、1280、900、760、390 共 10 张截图，无横向滚动、固定层重叠或 console error；交互 smoke 确认五个视口滚动到底后末条正文均与输入区保持 52px 间隔，消息操作可键盘聚焦，移动现场索引可由 Escape 关闭并归还焦点。M4 仍保留双浏览器联机验收，M5 仍需真实 provider 观察；当前 `3001` 的 `/api/chat/test` 返回空 502，因此两项不标记完成。

### G1.5 UI 一致性与工作区重编排

#### G1.5.1 当前审计结论

2026-07-21 使用用户现有的 `5173` 开发服务，对 `experience`、`writing`、`materials`、`prose-essay`、`comics`、`settings/worldbook`、`settings/structured`、`settings/world-map` 做了 `1440x900` 与 `390x844` 实景截图。首轮无状态浏览器因 `themeStore` 默认值落入 `kao`，实际截取的是已暂时搁置的主题1；复核 `AppearanceControls` 与存储键后，重新显式设置 `app_theme_variant=legacy`，完成主题2的同等 16 张截图。两轮均无 console error。

本计划后续只以主题2（内部 variant 名仍为 `legacy`）作为视觉审计、设计和截图验收目标。主题1（内部 `kao`）保留现有游戏化米色设计并冻结，只要求共享行为、路由和数据不发生灾难性回归，不参与本轮视觉统一，也不把它的暖色表现判断为迁移失败。

主题2截图仍确认：“没有整页横向滚动”不能代表响应式正确。多个页面通过裁切或 `overflow-x: hidden` 隐藏了桌面三栏，真实内容仍不可达。

当前问题按严重度排序：

1. **移动端工作区不是重编排，而是桌面布局裁切**
   - 素材页在 390px 只剩左索引和右副阅读台，中间主素材舞台不可见；
   - 卡片画布仍保留左时间轴 + 中央画布并排，中央空状态被挤成逐字竖排；
   - 漫画制作仍保留素材索引 + 页面舞台 + 右编辑台，首屏只看到被截断的舞台；
   - 体验页固定高度和底部输入层夹住空状态选项，能滚动不等于能完整阅读和点击；
   - 写作页正文可用，但顶部模式和工具仍以横向裁切维持，功能发现性不足。

2. **主题2内部的视觉深度仍不一致**
   - 写作、体验、素材和画布已经形成蓝白现代档案的背景与边缘语言；
   - 快速导入、结构化设定和世界地图在主题2下同样是蓝白色系，不存在米色主题串入问题，但仍主要依赖普通 hero、圆角字段卡和大外框，空间场、连续稿页和来源信号不足；
   - 漫画页复用了素材三栏骨架，但中央制作页和右侧流程仍像独立工具，缺少纸页、来源和制作阶段的共同 owner。

3. **空状态放大了结构问题**
   - 素材、画布和漫画把空状态置于巨大的静态工作面中央，同时在顶部或右侧重复提供创建入口；
   - 大面积空白没有形成有方向的 `Contour Field`、来源关系或下一步路径，只留下网格、斜带或点阵；
   - 空状态说明和动作没有占据足够明确的视觉中心，反而让辅助栏比主任务更醒目。

4. **共享壳与页面工作台各自定义层级**
   - `AppShell` 使用罗马数字页签，页面内部又有自己的编号、标题、模式 tab 和工具条；
   - 顾问入口、设置、联机、任务按钮和页面快捷动作分别占据右上、右下或边缘，缺少统一的边缘仪表规则；
   - 页面转场已有方向状态，但视觉空间、纹理和当前工作对象没有参与转场，仍接近通用路由滑动。

5. **超大单文件阻碍一致性修复**
   - `Writing.vue`、`ProseEssay.vue`、`Notes.vue`、`Experience.vue` 分别约 6011、5248、5172、3560 行；
   - 同一文件后段覆盖前段样式，响应式规则与历史修复注释交错，容易出现桌面修好、窄屏被旧规则重新覆盖；
   - 视觉原件已经在文档中定义，但代码层仍主要靠页面私有 class 重复实现。

#### G1.5.2 页面角色与目标状态

| 表面 | Narrative role | 视觉温度 | 目标构图 |
| --- | --- | --- | --- |
| 全局壳 | 工作区导航与状态边缘 | 安静、精确 | 内容优先的薄 mast + 可折叠活动导航 + 统一边缘仪表 |
| 体验 | 沉浸叙事与回合记录 | 沉静、现场感 | 宽阅读流 + 可收起现场索引 + 不遮挡的回合输入 |
| 写作 | 长时间编辑器 | 编辑出版感 | 连续稿页 + 章节索引 + 就地补全/修订，不形成聊天侧栏 |
| 素材 | 可检索资料夹 | 轻快、可扫描 | 索引 + 主素材舞台 + 按任务出现的副阅读台 |
| 卡片画布 | 空间关系编辑器 | 精确、开放 | 全幅可平移画布 + 就近节点工具 + 可收起时间轴/详情 |
| 漫画 | 页级视觉生产台 | 专注、制作感 | 素材来源 + 整页预览 + 当前格制作步骤，移动端一次只处理一层 |
| 设定 | 世界档案编辑器 | 权威、文化感 | 连续设定稿 + 分类索引 + 草稿审阅，不使用表单卡片墙 |
| 地图 | 地理与历史工作面 | 空间感、可解释 | 地图占据主舞台，地理/历史工具贴边，空状态也表达生成路径 |
| Agent / task | 临时建议与结果事务 | 克制、可信 | 来源、diff、应用/撤销和任务状态；不复制独立聊天产品 |

#### G1.5.3 全局硬约束

- 保留现有业务行为和路由，不以视觉优化为由重写 store、生成协议或地图引擎；行为改动另走所属 Gate。
- 本轮视觉实现只修改主题2的蓝白现代档案语言；主题1的米色游戏化设计冻结，不做迁移、重绘或视觉验收。共享模板改动必须保证主题1仍能使用，但不要求两套主题同构。
- 不在 UI 优化中顺手重命名 `kao / legacy` 内部 variant，也不擅自改变默认主题；审计脚本必须显式写入主题2存储值，默认值调整另作产品决策。
- 主内容保持开放，不把正文、设定字段、漫画步骤和空状态全部包装成卡片；有框区域只用于隔离编辑、比较、确认和风险。
- 顶层工作区入口使用相应图标与中文名称，不再使用 `01/02/03`、罗马数字或无语义英文微标制造层级。
- 每个工作面最多两套持续背景纹理，并遵守[空间场纹理语言](../engineering/visual-alignment-workflow.md#空间场纹理语言)；等高线必须具有来源方向，不得覆盖长正文和操作区。
- 390px 下不能靠 `overflow-x: hidden` 通过验收；所有主要内容和动作必须通过模式切换、抽屉或顺序流真实可达。
- 每个状态只保留一个主动作 owner。顶部、空状态、右栏不得同时重复“新建/生成/导入”而没有层级差异。
- 不新增伪数据、假进度、无意义坐标和装饰标签；状态、编号、来源和线路必须来自真实模型。
- 自动化测试总数继续不超过 200；UI 覆盖通过替换现有视觉用例、table-driven 断言和浏览器 smoke 完成。

#### G1.5.4 M0：建立可复现 UI 基线（0.5-1 天）

任务：

- 增加一个非测试计数的浏览器审计脚本，按固定 localStorage fixture 建立空白、常规、长内容、生成中、失败五类状态；
- 审计脚本在页面初始化前显式写入 `app_theme_variant=legacy` 与目标明暗模式，禁止依赖当前默认主题或浏览器残留偏好；
- 默认覆盖 `1440 / 1280 / 980 / 760 / 390`，记录 `scrollWidth`、主内容实际宽度、被裁切元素、fixed/sticky 遮挡和 console error；
- 截图默认写入 gitignored 临时目录，只有最终批准的代表性基线进入 `docs/demo`，不继续堆积每轮过程截图；
- 为每页记录“首要对象、首要动作、滚动 owner、移动端 pane 策略、纹理 owner”五项清单。

候选边界：`scripts/ui-audit.mjs`、现有截图脚本、`docs/engineering/visual-alignment-workflow.md`。

门禁：没有可复现 filled-state 与 mobile-state，不开始该页大范围 CSS 调整。

#### G1.5.5 M1：共享视觉基础与代码 owner（2-3 天）

任务：

- 盘点并收敛主题2使用的 `--archive-*`、表面、文字、边线、信号色、阴影、间距、控件高度、z-index 和 motion token；页面 CSS 只组合 token，不再次发明近似颜色；主题1 token 保持冻结，除共享行为修复外不改视觉值；
- 建立单一图标 owner，使用 `lucide-vue-next` 覆盖菜单、设置、体验、设定、写作、素材、画布、联机、生成、导出、缩放等常见动作；删除重复 inline SVG 和编号式入口；
- 在现有 `folio/` 与 `workbench/` 下收敛少量真实复用原件：`WorkspaceStage`、`InspectorRail`、`EmptyStage`、`SourceSignal`、`EdgeInstrument`、`ContourField`；只有至少两个页面采用后才保留抽象；
- 统一主/次/危险/图标按钮、segmented control、tab、输入框、select、tooltip、focus ring、disabled/loading 状态；
- 把 `Contour Field` 实现为可配置的局部背景层，提供 `narrative / geographic / relation` 三种密度、入口方向、mask 和 reduced-motion，而不是每页复制 radial-gradient 数值；
- 明确背景、工作面、前景三层 z-index，防止顾问入口、聊天、弹窗、sticky footer 和画布控件互相遮挡。

候选边界：`src/styles/`、`src/styles/themes/legacy.css`、`src/layouts/AppShell.vue`、`src/components/folio/`、`src/components/workbench/`；只有共享结构修复确实需要时才触碰冻结的 `kao.css`。

门禁：先让 AppShell + 一个阅读面 + 一个空间面使用新原件并截图确认，再扩展其余页面。

#### G1.5.6 M2：P0 响应式重编排（2-3 天）

任务：

- **体验**：统一为一个明确的垂直滚动 owner；输入区保持可见但不覆盖消息、选项和 API 状态；390px 将现场索引放入可关闭 sheet；
- **素材**：`>=1100` 保留三栏，`760-1099` 变为窄索引 + 主舞台，副阅读台按需覆盖；`<760` 使用“索引 / 内容 / 工具”三模式切换，一次只显示一个 pane；
- **画布**：移动端先显示主画布，时间轴和节点详情进入底部 sheet；顶部命令改为可换行的分组工具带，不让画布空状态逐字竖排；
- **漫画**：移动端按“素材 -> 页面 -> 当前格”任务顺序切换，不把三栏并排缩小；页面预览保持可缩放，当前格工具进入 sheet；
- **写作**：章节列表在窄屏成为抽屉，顶部模式与次级动作折叠为可访问菜单，正文始终拥有至少 `calc(100vw - 24px)` 的有效宽度；
- **设定/地图**：sticky footer、世界书切换器和地图工具不得覆盖最后一项；移动端地图默认全幅，世界树和生成参数按需打开。

门禁：在 390px 上，不依赖横向滚动即可完成每页核心任务；关闭所有 sheet 后焦点回到触发器；软键盘出现时输入和主动作仍可见。

#### G1.5.7 M3：全局壳、模式导航与页面转场（1-2 天）

任务：

- AppShell mast 只保留品牌/当前页、工作区图标导航、真实全局状态和设置；移除罗马数字印章；
- 同一 activity 的子页面使用统一次级页签，避免 shell 标题、页内标题、模式 tab 三次重复当前路径；
- 联机入口、设置、存储状态和任务中心按频率与状态重新分组，不让右上角出现多个同权按钮；
- 把已有 route direction 接入 `PageTransition`：跨工作区采用沿导航轴的抽页/遮罩进入，同工作区模式切换使用短距离层级揭示；
- 转场时背景纹理可缓慢接续，但主内容移动限制在 `180-280ms`，不等待数据、不重置内部滚动、不影响 reduced motion；
- 顾问/Agent 入口使用统一边缘仪表位置，并避让联机聊天、记忆候选、画布工具和移动端 safe area。

门禁：连续切换五个工作区无布局跳动、双滚动或焦点丢失；禁用动效后功能和空间层级仍成立。

#### G1.5.8 M4：阅读面精修（体验 + 写作，2-3 天）

体验页：

- filled-state 下让叙事流成为第一视觉中心，空状态缩短为一段场景入口 + 一个主动作，不保留大块演示框和重复选项；
- 保持 G1.4 的 turn/block 数据结构，以署名、节奏、字重和引号排版区分角色，不恢复气泡墙或整段蓝色；
- 现场索引压缩为时间/人物/地点/事件的真实摘要，展开详情使用边缘信号色而不是蓝色整块填充；
- 等高线只出现在场景边界或现场索引附近，表达事件压力；正文阅读列与输入区保持无纹理；
- hover 操作、触屏操作和编辑态共享一个消息 owner，解决工具靠近时消失、编辑样式跳变和普通台词误触。

写作页：

- 保留当前连续稿页和宽正文轴，收敛章节标题、模式切换、正文与页脚的垂直节奏；
- 把模式、素材、分镜、冒险和版本操作按任务分组，次级动作 hidden-first，清理横向工具条裁切；
- 内联 Copilot 只在光标附近显示建议和接受/拒绝，复杂 diff 进入 `ReviewTray`，不再依赖孤立的右下顾问牌；
- 稿纸基线与边缘等高线只能二选一作为主要背景；长正文列内不叠加点阵、工程网格或动态纹理；
- 完成标题、正文、选区工具、插画环绕和 Markdown/预览间的视觉连续性。

门禁：体验长 session 与写作 5000 字章节连续阅读 10 分钟无明显层级疲劳；用户在 3 秒内能识别当前角色、当前章节和主动作。

#### G1.5.9 M5：创作空间精修（素材 + 画布，2-3 天）

素材页：

- 左侧斜放纸条保留轻微错落、折角和夹片，但统一透视、阴影方向和选中位移，避免每条像不同角度的装饰贴纸；
- 主舞台在空状态只保留一个“新建素材” owner；有内容时让文字或插画占据中心，不由类型条和空槽抢占首屏；
- 相关素材、插画生成、漫画制作作为副阅读台的任务模式，共享同一素材引用和返回路径，不重复显示当前素材名；
- 采用局部等高线 + 小范围点阵，前者从真实来源/当前类型一侧进入，后者只服务索引坐标。

卡片画布：

- 画布成为唯一主舞台；顶部“输入主题”和中央“还没有素材节点”合并为一个上下文敏感入口；
- 工程网格随真实 viewport 平移/缩放，等高线停留在外围世界层，不能和节点关系线竞争；
- 节点选择后就近出现编辑、连接、视频和专业信息工具；全局生成视频只承担多镜头任务，不与单节点视频动作重复；
- 左时间轴与详情 rail 使用按需展开，不永久压缩画布；空状态、节点少、节点密集三种缩放策略分别验收；
- 保持现有拖拽瞬时坐标和批量牌堆逻辑，不在视觉轮次重写交互状态机。

门禁：1440px 下画布有效面积占工作区至少 70%；390px 下能创建节点、选中、打开详情并返回画布；缩放/拖动时背景、节点和关系线保持同一坐标感。

#### G1.5.10 M6：漫画制作台重排（3-4 天）

任务：

- 将漫画页明确拆成“页面计划 / 整页制作 / 当前格制作”三层，而不是素材三栏的静态复制；
- 左侧素材索引只负责给当前格建立 `continuityRefs`，中央整页始终是最大视觉对象，右侧按分镜、构图、草稿、线稿、上色、文字、质检顺序显示当前阶段；
- 空页建立时用真实版式缩略图选择阅读方向、页格和强调格，不用四个普通 select + 一段说明承担全部决策；
- 当前格生成前持续显示原素材、上一格锚点、角色/地点视觉圣经和画面推进，确保“联系”在 UI 中可审阅；
- 对话框提供画布内拖动、八向缩放、尾巴方向、字体/字号/字重/对齐、溢出和遮挡提示；模型始终只生成无字单幅画面；
- 整页预览与缩放预览合并，滚轮/触控缩放和拖拽查看作为主要交互，右栏不再放占位过大的重复预览。

门禁：用户可从四个不同素材建立一页四格漫画，逐格生成并保持视觉联系，添加中文对话框后导出；页面中不存在自动多格、自动英文文字或不可达的缩放区域。

#### G1.5.11 M7：设定、地理与历史视觉统一（3-4 天）

任务：

- 快速导入、结构化设定、高级世界书和地图在主题2下继续绑定蓝白 archive token；不删除或迁移主题1的米色/红棕游戏化主题规则；
- 快速导入页压缩过大的世界书 hero，把“当前世界、来源、条目状态、开始冒险”组织成连续档案首页；
- 结构化设定在主题2中从六张长文本卡片改为“分类索引 + 连续设定稿 + 字段级生成/来源状态”，同一字段只保留一个生成入口；主题1保留现有卡片化游戏面板；
- 地图空状态使用地理参数摘要 + 一个生成动作；有地图时让地图贴近主舞台边缘，世界树、图层、地理语义和历史草案以可收起 rail 覆盖，不再用巨大外框包住空白；
- `Contour Field` 在设定页表达世界结构，在地图页只服务生成前/地图外围；真实地形渲染出现后，装饰等高线主动退场；
- 地理语义点、历史节点和冒险入口统一使用 `SourceSignal`，用户可看见“设定 -> 地点 -> 历史 -> 体验”的真实来源线。

门禁：从世界书导入、补设定、生成地图、审阅历史到进入冒险，页面语言不发生主题跳变；地图和历史信息在 1440/980/390 下均有明确主次。

#### G1.5.12 M8：Agent、任务反馈与浮层统一（2 天）

任务：

- 与 G1.3、G4.2 共用 task/result contract，不为 UI 再建状态；短确认使用 toast，长任务进入 task center，可取消、重试并查看真实失败原因；
- Agent 默认表现为当前工作对象附近的建议、来源标记和修订结果，只有复杂任务才展开窄 `ReviewTray`；
- 统一 modal stack、sheet、popover、tooltip、右键菜单、Esc、focus return 和 body scroll lock；
- 联机聊天、记忆候选、Agent 建议和系统通知各有固定层级与互斥规则，移动端同一时间最多展开一个大型浮层；
- 删除不再挂载的 `ImageGenRail` 兼容壳、失效抽屉样式、重复顾问入口和已被新原件替代的页面 CSS。

门禁：同时触发联机聊天、记忆候选和生成任务时，主内容仍可读、主动作不被遮挡，关闭顺序与焦点返回可预测。

#### G1.5.13 M9：结构清理、性能与长期门禁（2-3 天）

任务：

- 在每组页面视觉方向通过后，再将 `Writing.vue`、`Notes.vue`、`ProseEssay.vue`、`Experience.vue` 的稳定区域拆为有单一 owner 的组件和样式；不先做无视觉收益的全文件重构；
- 删除被后置 selector 覆盖的旧样式、过时修复注释、未挂载组件和重复 media query，记录保留的主题覆盖原因；
- 背景纹理优先 CSS/静态资源，不在动画帧中重算大范围滤镜；检查 route 切换、画布缩放和长 session 滚动的 long task；
- 以现有 188 core + 12 visual 为上限，替换视觉测试覆盖 shell、阅读面、空间面和移动 pane，不新增测试数量；
- `verify:full`、axe、键盘 smoke、reduced motion、200% zoom 和指定视口截图全部通过后才结束。

#### G1.5.14 推荐执行批次

| 批次 | 范围 | 可交付结果 | 依赖 |
| --- | --- | --- | --- |
| UI-A | M0 + M2 的体验/素材/画布/漫画 P0 | 移动端核心任务真实可达，不再靠裁切通过 | 无，立即执行 |
| UI-B | M1 + M3 | 统一 token、图标、工作台原件、mast 与转场 | UI-A 的截图基线 |
| UI-C | M4 | 体验与写作形成稳定阅读/编辑语言 | UI-B |
| UI-D | M5 + M6 | 素材、画布、漫画成为连续视觉创作链 | UI-B，可与 UI-C 分文件并行 |
| UI-E | M7 | 设定、地理、历史切入同一蓝白档案系统 | UI-B，需服从地理/历史数据 owner |
| UI-F | M8 + M9 | Agent/任务/浮层统一，清理历史 CSS 与最终验收 | UI-C/D/E |

UI-A 是当前可靠性前置任务；UI-B-F 是支撑地理、历史和 Creative Graph 的横向工作，不替代这些产品主线。每批只推进一个代表性页面到截图验收，再扩展同组页面，避免再次出现“大范围改完后才发现方向不对”。

执行进度（2026-07-22）：UI-A 已完成。新增 `scripts/ui-audit.mjs`，固定主题2并覆盖八个工作区和 `1440 / 1280 / 980 / 760 / 390`，记录截图、console error、页面尺寸、主要 surface、裁切元素及 fixed/sticky 重叠候选；支持按 route、viewport、`empty / regular / long / loading / error` fixture 过滤运行。常规与长内容真实写入体验会话、素材和画布存储；生成中与失败态通过填写真实输入、点击生成按钮并拦截 `/api/generate` 建立，不伪造组件内部状态。体验页现场索引在窄屏改为可关闭 sheet，素材页改为平板双栏/工具覆盖与手机“索引/内容/工具”，画布改为手机“画布/时间轴与节点”，漫画改为“素材/页面/当前格”。三页 pane 导航已收敛为共享 `WorkspacePaneSwitch`，补齐 radiogroup、方向键、Home/End 和焦点语义；画布生成失败增加可见 `role=alert` 反馈。四页默认主任务、pane 切换、体验 Escape 关闭与焦点归还及桌面/手机动作态均通过 Chromium smoke，主题1只做共享行为回归。下一批进入 UI-B。

执行进度（2026-07-22）：UI-B 已完成。主题2增加语义化表面、信号、阴影、控件高度、z-index 与 motion token；新增基于 `lucide-vue-next` 的 `WorkbenchIcon` 单一图标 owner，以及可配置密度/入口/mask/reduced-motion 的 `ContourField`，由壳、体验阅读面和关系画布复用。AppShell/ActivityBar 移除编号入口和重复 SVG，设定次级页签仅在主题2改用语义图标；主题1保留原页签并隐藏新等高线。route transition 改为监听完整路径，跨 activity 沿导航轴进入，同 activity 短距离层级揭示；顶部 tabs 增加完整键盘移动与焦点跟随。八工作区主题2桌面/手机 16 张截图无 console error、无页面横向溢出，连续五工作区与 reduced-motion smoke 通过。下一批进入 UI-C。

执行进度（2026-07-22）：UI-C 已完成。体验页把 `ContourField` 限定在现场索引，正文以短边角色信号、署名和无框语义块形成阅读节奏；消息级编辑、重写、删除收进同一原生 `details` owner，兼顾 hover、键盘和触屏，空态只保留一个主动作。写作页将标题、工具、参考区、正文和页脚收敛到 880px 连续稿轴，移动端章节索引改为可关闭且归还焦点的 sheet，低频分镜/冒险/返回操作 hidden-first。审计 fixture 增加真实双章节与约 5000 字长稿，空态、长会话、移动编辑、章节切换和主题1共享行为完成 Chromium smoke，未增加测试数量。下一批进入 UI-D。

执行进度（2026-07-23）：UI-D 已完成工作台重排。素材页将辅助列收至 224px / 300px，空态删除 12 格演示蓝图并只保留新建 owner，390px 顶栏改为两层命令结构。卡片画布删除独立 hero 与画布内空态的重复入口，左详情/时间轴收至 236-276px，1440px 主画布占工作区 81%，既有拖拽、牌堆和连线状态机保持不变。漫画页移除复制自素材页的副阅读台模式导航，明确“页面计划 / 整页制作 / 当前格制作”；新建页以格数按钮和真实版式缩略图替代主要 select，中央整页保持最大对象。三页空态/常规态、桌面/手机 12 张截图无 console error 和横向溢出，漫画移动版式切换 smoke 通过。多页改编候选、视觉圣经实体检索和真实四格生成验收仍属于 G4.4 产品实现，不因 UI-D 结项而标记完成。下一批进入 UI-E。

执行进度（2026-07-23）：UI-E 已完成设定链视觉统一。主题2快速导入将大幅 hero 与卡片预设压缩为连续档案首页，并修复移动端 flex 收缩造成的主动作溢出；结构化设定从六卡片墙改为分类索引、连续横线设定稿和字段级单一生成入口，主题1维持原面板。地图空态加入当前世界、地形模板与国家数摘要，沿用顶栏唯一生成动作；移动端世界树默认收起为 40px rail，展开时覆盖地图而非永久挤压主舞台。现有地理语义、历史与冒险入口保持原数据 owner 和来源链，不另造展示状态。主题2在 1440 / 980 / 390 审计无页面横向溢出和非预期 console error，主题1三个设定入口 390px 共享行为 smoke 通过。真实地图数据态仍归地图重复生成与历史开局产品 smoke，不因空态视觉验收而标记完成。下一批进入 UI-F。

执行进度（2026-07-23）：UI-F 已完成视觉与交互层收口。新增共享瞬态层协调器，顾问、记忆候选、联机聊天、角色入口、图片/视频模型选择和时间设置统一 Escape、焦点归还、大型浮层互斥与层级 token；主题2顾问改为窄审阅托盘，记忆改为低干扰档案层，短通知使用 polite status。写作页与主题1体验页改为直接消费 `MediaGenerationDrawer`，删除无逻辑 `ImageGenRail` 兼容壳。主题2八工作区 1440/390 共 16 张常规态截图无页面横向溢出或非预期 console error，顾问/记忆桌面与手机交互 smoke 通过；主题1关键工作区保持共享行为。联机聊天因本地未进入房间舞台，互斥接线仍待双浏览器实测。全局 task center 不在 UI 层复制尚未贯通的状态，待 G4.2 task/result contract 成为真实事实源后实现。至此 G1.5 UI-A 至 UI-F 执行批次完成。

#### G1.5.15 总体验收矩阵

- 路由：欢迎、体验、联机、写作、素材、画布、漫画、快速导入、结构化设定、高级世界书、地图；
- 状态：空白、常规、长内容、生成中、失败、API 未配置、离线恢复；
- 视口：`1440x900`、`1280x800`、`980x800`、`760x900`、`390x844`；
- 输入：鼠标、键盘、触屏、右键、拖拽、滚轮/触控缩放；
- 主题：主题2亮色/暗色作为完整视觉门禁；主题1只做核心路由、表单和主动作可用性 smoke；另检查 `prefers-reduced-motion` 与 200% zoom；
- 每张截图先做 squint test：3 秒内能辨认当前工作区、主对象、主动作和当前状态；装饰不能形成第三视觉中心；
- 每页通过 deletion test：删除不影响任务的信息、重复动作和无语义装饰；
- 每页通过 capacity check：空状态不显得荒芜，filled-state 不溢出，长内容不靠缩小字体塞入。

## Gate 2：地图成为“可玩的地理系统”

目标：地图不只是漂亮图片，而是设定、历史和冒险共同使用的空间模型。

预计：3-5 周。

### G2.1 地图资产与缓存

任务：

- 为地图增加 `mapId`、`projectId`、`schemaVersion`、`generationConfigHash`；
- IndexedDB 保存压缩后的地图数据和缩略图，localStorage 只保留引用；
- 同配置 hash 命中缓存时直接恢复，不每次路由挂载重新生成；
- 区分“修改显示图层”和“重新生成地理结构”，前者不重跑 engine；
- 保存 generation metadata 和性能时间线，便于复现坏 seed；
- 提供 map snapshot/version，用户可比较和恢复上一版。

验收：

- 离开再进入地图页不重新计算；
- 图层切换 < 200ms；
- 同 seed/config 输出可复现；
- 地图版本切换不破坏引用地点。

### G2.2 统一地点实体

引入 `PlaceEntity` 作为地图与叙事的桥，不复制 engine 的所有 cell：

```ts
interface PlaceEntity {
  id: string
  projectId: string
  mapId: string
  kind: 'state' | 'province' | 'burg' | 'site' | 'route' | 'region'
  name: string
  mapRef: { cellIds?: number[]; markerIds?: string[]; routeIds?: string[] }
  parentIds: string[]
  worldbookEntryIds: string[]
  tags: string[]
  narrativeState: { status?: string; controllerId?: string; danger?: number }
}
```

任务：

- 把 state/burg/marker/semantic site 投影成稳定地点实体；
- 用户点击地图可设为当前地点、打开设定、查看历史或开始场景；
- 对话抽取地点时匹配实体，不能只写自由文本 `currentScene`；
- 旧 `{country, city, scene}` 转为 display path，由 place id 作为真实引用；
- 地图重生成时做 place remap，无法匹配的引用进入修复列表。

验收：

- 地图点选地点后 Experience 当前位置立即一致；
- 从对话识别新地点时可确认后创建 marker/place；
- 地图、世界书、历史、素材中的同一地点可互相跳转。

### G2.3 地理编辑与表现

优先做有叙事价值的编辑，不追求完整 GIS：

- 地点搜索、筛选、聚焦和 breadcrumbs；
- 当前地点、历史事件、势力范围、路线和危险区域图层；
- marker 聚合与低缩放级别 LOD，避免标签铺满；
- label collision、hover hit test 和键盘/列表替代入口；
- 地图侧栏展示“这里发生过什么”和“可用作什么场景”；
- 导出支持纯地图、带标签地图、历史地图和分镜参考图。

延后：

- 3D 地球或 WebGPU 重写；
- 全功能手工地形绘制器；
- 实时多人地图协作。

## Gate 3：历史融入与可解释涌现

目标：历史不是一次性生成的 lore，而是驱动开局、事件和世界变化的状态层。

预计：4-6 周。

### G3.1 接通现有历史链

当前进度（2026-07-15）：地图页已接入 `extractMapSemantics()` -> `generateGeoHistory()` 的纯函数管线；用户可在地图生成后逐项审阅语义点，再生成历史草案、预览节点和地点实体数量，最后显式写入 `worldbook.geoHistory`。历史节点已补齐 `placeRef`，进入冒险时写入 `runtimeState.historyNode` 和当前 `worldMapState.placeId`；每个剧情日志窗口会以稳定 ID 写入 `geoHistory.playerNodes`，并携带地点、时间、势力、角色和任务的有限世界状态快照。新增 `PlaceEntity` 索引，聚合同一地点的地图引用、历史节点和世界书条目；地图页现在可按统一地点实体设置冒险当前地点，GM 生成前按当前 `placeId` 通过该索引选择相关历史，再合并最近玩家经历。事件卷、设定页和地图已经支持地点以及历史节点 / 世界书条目的逐项互跳，新提取活动会继承当前地点。涌现候选、LLM 事件草稿和受限状态 delta 已接入：完整文本后生成 0-2 个可解释候选，用户点击通知后才请求严格 schema 事件草稿，在详情中预览“因为 A 和 B，所以 C”的变化并选择应用、拒绝或回滚。运行时已有第一版父事件/状态连续性因果报告；控制权、角色状态、年代冲突和浏览器 smoke 仍未完成。

任务：

- [x] 地图确认后调用 `extractMapSemantics(mapData)`；
- [x] 用户确认语义点后调用 `generateGeoHistory(worldbook, mapSemantics)`；
- [x] 写入 `worldbook.geoHistory` 前走 draft review；
- [x] 历史节点补齐 `placeId` + 地图引用，并在历史开局时写入 runtime；
- [x] `buildPlayerHistoryNodeFromPlotJournal()` 在剧情日志形成后触发，worldbook append/dedup/version 接线完成；
- [x] 玩家经历写回携带有限 `WorldStateSnapshot`，并生成 runtime 审计事件；
- [x] `PlaceEntity` 索引按 `placeId` 聚合地图引用、历史节点和世界书条目，并提供 runtime 查询入口；
- [x] GM 上下文按当前地点选择 geoHistory 节点，并合并最近玩家历史信号；
- [x] 地图页地点实体列表可按 `placeId` 设置冒险当前地点，并同步 `worldMapState`、`historyNode` 和审计事件；
- [x] 事件日志活动可通过 `placeId` 进入地图或结构化设定，设定页与地图可保留同一地点上下文；
- [x] 地图语义点逐项审阅、历史节点 / 世界书条目逐项跳回同一地点；
- [x] 涌现候选收集、评分、稳定去重和生成完成后通知已接入；候选详情可按当前地点和已知角色请求 LLM 具体化。
- [x] LLM 事件草稿使用 `emergent-event-v1` 严格 schema，校验地点、参与者、阵营、选项和顶层 state path；生成中/就绪/失败状态可随会话恢复。
- [x] 受限 state delta 支持预览、用户接受/拒绝、`state_delta` 审计事件、逆操作和后续修改冲突保护回滚。
- [x] 第一版跨事件父链、状态连续性边和快照分歧报告；
- [ ] 控制权/角色状态/年代冲突检测和候选应用后的下游过期标记。

验收：

- [x] 新项目能通过确定性 fixture 走地图 -> 语义点 -> 历史 -> 历史开局；
- [x] GM 上下文能解释当前地点历史节点、参与者、绑定条目和未决线索；
- [x] 剧情日志形成后玩家行为出现在世界书历史时间线上；
- [ ] 一次真实浏览器冒险 smoke，验证刷新/重进后的完整回写链。

### G3.2 世界状态与因果图

建立最小、可解释的世界状态，不引入黑箱全自动模拟：

```ts
interface WorldStateSnapshot {
  turn: number
  time: { eraId: string; dateLabel: string }
  factions: Record<string, FactionState>
  places: Record<string, PlaceState>
  characters: Record<string, CharacterState>
  activeThreads: StoryThread[]
  facts: CanonicalFact[]
}
```

事件结构至少包含：

- `causes[]`：触发事实、事件和玩家选择；
- `participants[]`：角色/势力；
- `placeIds[]`；
- `changes[]`：受控的 state delta；
- `consequences[]`：已发生结果；
- `unresolvedHooks[]`；
- `confidence` 和 `sourceRefs[]`；
- `visibility`：公开、角色知道、GM-only。

任务：

- 统一 direct store mutation 与 runtime event 的关系：状态变更必须同时产生可审计事件；
- 实现受限 state delta apply，字段白名单、验证、预览和回滚；
- 阵营关系、地点控制、角色目标和线索状态由事件变化；
- 每个自动变化必须显示“因为 A 和 B，所以 C”，允许拒绝；
- 冲突检测：同一时间地点、角色生死、控制权、亲属和年代矛盾。

验收：

- 用户可以从任一状态追溯到导致它的事件；
- 拒绝一次建议不会留下半应用状态；
- 回滚事件会恢复相应世界状态并标记下游内容可能过期。

### G3.3 涌现调度器

当前进度（2026-07-15）：已完成候选收集、评分、生成完成后通知、LLM 事件具体化，以及第一版受限状态 delta。`emergenceScheduler.js` 从当前 PlaceEntity/runtime 上下文读取地点、历史线索、参与者、目标和阵营关系，输出最多 2 个稳定候选；`generationEmergence.js` 只允许当前地点、已知参与者/阵营、2-3 个 LLM 选项和顶层 state path；`runtimeEvents.js` 生成不改源状态的预览、应用逆操作和回滚冲突检测；`gameStore` 与 `QuestLog` 已接通生成、预览、应用、拒绝、回滚。下一步是把地点控制、角色目标和线索状态接进更完整的因果图，并对跨事件时间/控制权/角色状态冲突做阻断。

涌现不是随机弹窗。采用候选 -> 评分 -> 生成 -> 审阅 -> 应用：

```text
收集候选
  -> 规则评分（时间、地点、参与者、未决线索、冷却）
  -> 选出 0-2 个候选
  -> LLM 只负责具体化叙事与选项
  -> schema 校验
  -> 文本生成完成后通知
  -> 用户点击查看并选择是否应用
```

候选来源：

- 未决历史线索；
- 阵营冲突和资源压力；
- 地理约束，如边境、贸易枢纽、灾害区和道路中断；
- 角色目标、秘密、承诺和关系变化；
- 玩家长期忽略的任务；
- 时间推进和季节；
- 当前对话主题与最近行动。

硬规则：

- 不再用“神秘使者”之类通用角色兜底覆盖真实参与者；
- 文本未生成完不弹 modal，只显示生成后通知；
- 同角色/事件有冷却和重复惩罚；
- 候选必须说明命中原因；
- LLM 失败时宁可不触发，也不展示模板化假事件；
- 事件选项由 LLM 按当前剧情生成，再做安全 fallback。

验收：

- 50 轮 deterministic simulation 中无同事件连续重复；
- 事件参与者与当前地点/对话/未决线索至少命中一项强关联；
- 用户能看到“为何现在触发”；
- 关闭通知不打断当前文本阅读。

### G3.4 角色连续性

任务：

- 将角色档案、对话角色、世界书角色和 encounter character 合并为稳定 character id；
- 跟踪角色语气、目标、知识边界、关系、秘密、当前位置和状态；
- GM 生成前做角色可知信息过滤，防止角色全知；
- 角色变化作为候选 patch 审阅后写回；
- 关系图和历史事件共用 character/faction ids。

验收：

- 同角色跨会话名称、关系和基本语气保持；
- 角色不会引用自己不知道的 GM-only 事实；
- 角色状态变化可追溯到事件或用户确认。

## Gate 4：创作链路整合

目标：让冒险结果自然成为可写、可编辑、可分镜的内容，而不是在页面间复制粘贴。

预计：7-11 周；媒体资产与联机服务端可在 schema 锁定后并行，页面集成仍需串行。

### G4.1 叙事资产谱系

当前进度（2026-07-15）：`narrativeAssets.js` 保留旧 `source` 兼容形状，并补齐规范化 `sourceRefs[]`、稳定内容指纹和同项目同来源去重；章节选区重复保存会复用原资产，素材页可合并同项目条目并保留来源引用。对话保存前的短摘要、revision/tags、拆分、全局检索和跨项目迁移仍未完成。

任务：

- [x] narrative asset 增加 `projectId`、`sourceRefs[]`、`status`；
- 冒险片段保存前先用已有 summarizer 精简，保留原文引用，不把整段聊天塞进候选；
- [x] 去重基于 source ref + 内容 hash，而不是只看标题；
- [x] 支持同项目素材合并、归档、恢复和章节来源跳回；拆分与多版本 revision 仍待实现；
- 设定草稿、角色事实、事件、分镜种子使用同一生命周期；
- 全局检索按人物、地点、事件、章节和来源过滤。

验收：

- 从对话保存的素材默认是短、可复用的叙事单位；
- 用户仍可一键查看完整原文；
- 同一片段重复保存不会制造多份相同素材。

### G4.2 写作上下文与代理统一

#### G4.2.1 当前审计与问题定义

2026-07-21 对 `useAdvisor`、`AdvisorPanel`、`advisorTaskService`、`services/agents/*`、`useCopilot`、四个页面入口和服务端 OpenClaw 路由完成静态审计。结论是“基础件已存在，但产品链路没有接通”，不能继续通过增加顾问文案或快捷问题修补。

已存在的基础：

- 前端有 task registry、context envelope、result lifecycle、legacy adapter 和写作 action applier；
- `useCopilot` 已具备光标窗口、设定匹配、参考素材预算、ghost text、请求编号、取消、Tab 采纳和 Esc 忽略；
- 写作页能应用文本替换、创建素材、加入纲要和设置参考素材等动作；
- 四个主要创作页面已经共用角色化入口和 `AdvisorPanel`。

实际断点：

- registry 定义了 worldbook、experience、writing、canvas、storyboard、comic 等二十余种任务，但服务端只为少数旧写作任务提供专用指令；未知任务静默退化为“章节体检”；
- `buildAgentEnvelope()` 和服务端 `isNewEnvelopePayload()` 都没有进入 `/api/advisor/task` 主链，优先级、预算、`sourceRefs` 和 drop report 只是未消费的数据结构；
- `writingAgentContext.js` 和 `getWritingQuickActions()` 已写好但没有接入 `Writing.vue`，页面仍手工拼装上下文和旧 scope；
- Agent result 与写作 applier 存在动作命名双轨，例如 `text-patch` 与 `replace_range`，必须依赖兼容层猜测；
- `useAdvisor` 只允许一个全局 in-flight 请求，没有队列、按任务取消、重试策略、历史持久化或真正的 undo transaction；
- 只有写作页传入并显示 `advisorResults`；素材、画布和体验页主要只能看到自由文本建议，无法预览和执行专业动作；
- 素材上下文只有当前正文与数量，选区固定为空；体验上下文只有最近 20 条消息和少量计数，没有地点、历史、记忆、未决线索和角色状态；画布上下文直接发送全部卡片与边，缺少当前选择和视口范围；
- 四页的专业意图仍被重复映射到 `advisor.review.chapter`、`advisor.close.thread`、`advisor.continue.light`，所谓“素材顾问/编导顾问/当场顾问”目前主要是视觉 persona；
- OpenClaw 是顾问唯一执行通道，与常规文本模型配置、能力检测和 provider fallback 没有统一；
- 写作补全虽然在输入事件中调用，但 `autoTrigger: false` 令调用立即退出；除设置参考素材或点击重试外，用户几乎看不到原本计划的轻量补全；
- 当前测试只覆盖合约纯函数的集中 happy path，缺少“页面 -> envelope -> route -> typed result -> preview/apply/undo”的纵向契约。

#### G4.2.2 调研依据与产品取舍

本阶段参考三类成熟模式，但不照搬其界面：

- 本地 SillyTavern `world-info.js` / `openai.js`：世界信息按当前消息扫描激活，支持 constant、关键词、角色过滤、sticky/cooldown、递归激活、注入位置与 token budget；Pinax 应吸收“按任务检索 + 有预算注入 + 可追溯命中”，不复制完整聊天 prompt 堆栈；
- VS Code / GitHub Copilot inline suggestions：补全依附光标、停顿后异步出现、编辑或移动光标即失效，支持采纳、忽略、重试和局部采纳；Pinax 应保持低打扰，不能让每次停顿都弹顾问窗口；
- GitHub Copilot repository/path instructions：稳定规则与当前请求分离；Pinax 应把世界书文风、禁忌、角色事实和页面任务指令作为不同优先级的结构块，而不是拼成一段无法审计的用户问题。

参考入口：

- `SillyTavern/public/scripts/world-info.js`：`getWorldInfoPrompt()`、`checkWorldInfo()`；
- `SillyTavern/public/scripts/openai.js`：prompt order、injection order、`ChatCompletion` token budget；
- <https://code.visualstudio.com/docs/copilot/ai-powered-suggestions>；
- <https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot>。

产品取舍：

- Agent 是“带上下文和可审阅工具的创作助手”，不是无限自主循环，也不允许静默改正文、世界状态或素材；
- persona 只决定名称、语气和默认能力排序，不再复制业务逻辑或 prompt；
- 快速补全、专业动作、开放问答是三种交互，不再全部塞进聊天消息流；
- 默认一次任务一次模型调用；只有结构修复或显式多步任务允许第二次调用，并设置总步数、超时和成本上限；
- 所有写操作先返回 draft action，经过 preview 和 revision 校验后才应用；体验运行时的世界状态变更继续走既有受限 mutation 合约。

#### G4.2.3 目标架构

建立六个清晰层次：

```text
Surface command / inline trigger
  -> AgentTaskDefinition
  -> ContextPolicy + ContextLedger
  -> AgentRunner + ProviderAdapter
  -> AgentResultSchema validator
  -> Preview / Apply transaction / Undo receipt
```

1. `AgentTaskDefinition`
   - 每个任务声明 `taskType`、surface、intent、context policy、output schema、允许工具、超时、最大步骤、温度和 fallback；
   - 前后端从同一份可序列化定义派生 allowlist，删除手工维护的双 registry；
   - 未知任务返回明确的 `400 UNKNOWN_TASK`，禁止静默退化成章节体检。

2. `ContextPolicy`
   - 每个任务显式声明 required / optional blocks、预算、检索深度和排序方式；
   - 选择、当前段落、光标窗口和当前节点属于 direct context；设定、地点、历史、记忆和素材属于 retrieved context；
   - 构建结果必须带 `sourceRefs`、字符/token 估算、截断原因和被丢弃块摘要。

3. `AgentRunner`
   - 统一请求 ID、AbortSignal、deadline、重试、provider capability 和错误码；
   - 优先复用已配置文本生成通道，OpenClaw 作为可选 provider adapter，而不是顾问专属硬依赖；
   - 同一 target + revision + task 的重复请求可短时去重，但不缓存跨 revision 的正文结果。

4. `AgentResultSchema`
   - 收敛为 `summary`、`suggestions[]`、`actions[]`、`citations[]`、`warnings[]`、`usage`；
   - action 只允许 `replace-range`、`insert-at-cursor`、`create-asset`、`update-asset`、`add-outline-item`、`set-reference`、`propose-canvas-patch`、`propose-runtime-candidate`、`submit-generation` 和 `review-only`；
   - 每个 action 必须携带 target、base revision/base text、来源和可读 label；JSON schema 校验失败先做一次确定性修复，仍失败则展示原始文本为不可应用建议。

5. `ApplyTransaction`
   - 先在内存中验证整批 action，再原子应用；禁止当前“前几个动作已写入、后一个失败”的半成功状态；
   - 返回 receipt，记录 before/after revision、实际动作和副作用，用现有编辑器 history 或领域 store 实现一次撤销；
   - target 内容改变后结果自动 stale，可重新基于当前内容生成，不允许强行覆盖。

6. `AgentSession`
   - 以项目 + surface + target 为作用域保存最近任务和 receipt；正文不重复持久化，只存摘要、引用和动作元数据；
   - 页面切换或章节切换取消旧请求；切回页面可看到最近已应用/失败结果，但不会恢复过期 ghost text。

#### G4.2.4 上下文账本与检索策略

统一 envelope 至少包含：

| Block | 来源 | 默认优先级 | 规则 |
| --- | --- | ---: | --- |
| `rules` | task instruction、输出 schema、安全边界 | 1000 | 必须保留，不允许被截断成无效 schema |
| `selection` | 选区/当前格/当前节点 | 900 | 写作修改与局部动作必须存在 |
| `cursor` / `scene` | 光标前后、当前回合、当前镜头 | 820 | 采用前长后短窗口，保留边界位置 |
| `style` | 世界书文风、禁忌、项目指令 | 760 | 与事实分开，支持用户排除 |
| `character` | 当前出场与被提及角色 | 700 | 角色 ID 优先，名称只作 fallback |
| `location` | 当前地点、父级区域、相邻地点 | 660 | 接 PlaceEntity 与地图引用，不发送整张地图 |
| `history` | 当前事件的前因、未决后果 | 620 | 沿因果引用取 1-2 跳，不按全文最近排序 |
| `memory` | 当前角色/线索相关的精简记忆 | 560 | 只取摘要与原文 ref，不重新塞入大段聊天 |
| `references` | 固定素材、已选素材、章节纲要 | 500 | 用户固定项优先于自动检索项 |
| `recent` | 最近编辑/消息/画布动作 | 420 | 设置数量、时间与字符三重上限 |

预算策略：

- 先为规则、直接上下文和输出预留硬预算，再分配 retrieved context；
- 预算以 provider token estimate 为准，字符数只作离线 fallback；
- 选择相关性按显式选择 > ID/引用命中 > 关键词 > 时间邻近排序；
- 允许一轮递归：已命中的地点/角色/事件可再拉取其直接父级或因果前驱，禁止无上限递归；
- 用户能在结果旁展开“本次使用”，查看命中的设定、素材、地点、历史和被截断项，并可 pin/exclude；
- ledger 记录 `sourceRefs` 和 budget report，不记录 API key、完整系统 prompt 或不必要的全文副本。

#### G4.2.5 各页面能力矩阵

| Surface | 首批任务 | 输入范围 | 可应用结果 | 明确不做 |
| --- | --- | --- | --- | --- |
| 写作 | 内联续写、修正选区、改写段落、扩写/压缩、桥接前后文、章节体检、抽取素材/纲要 | 光标、选区、段落、章节纲要、固定素材、命中设定、地点/历史引用 | 文本 patch、素材草稿、纲要条目、参考素材 | 不自动整章重写，不静默保存 |
| 素材 | 精简、分类、拆分、合并候选、重复检测、关联发现、转写作/世界书/分镜 | 当前/多选素材、来源、状态、已有关系 | update/create asset、relation draft、下游引用 | 不用“章节体检”代替素材任务 |
| 画布 | 关系补全、局部整理、冲突发现、生成专业字段、转纲要/分镜候选 | 当前选择、相邻一跳、可见视口、边与 pile | canvas patch preview、字段 patch、outline/storyboard draft | 不发送所有卡片，不直接移动全图 |
| 体验 | 下一步选项、角色一致性、局势摘要、线索回收、涌现候选 | 当前回合、最近语义块、角色、地点、历史、记忆、未决线索 | option、memory draft、runtime candidate、asset draft | 不替玩家选择，不直接改世界状态 |
| 分镜 | 镜头遗漏、轴线/连续性、节奏、转场、镜头提示词、视频任务准备 | 当前镜头、前后镜头、来源文本、角色/地点视觉约定 | shot patch、storyboard draft、generation request | 不把普通 review 直接提交视频 |
| 世界书 | 条目一致性、地理/年代冲突、结构草稿 | 当前条目、显式关联、地理和历史索引 | worldbook draft/patch | 不绕过草案确认 |

角色化入口仅负责显示当前页面最相关的 3-5 个任务和最近一条待处理结果。专业能力来自 task definition 与 tool allowlist，不来自“素材顾问”“编导顾问”等名字。

#### G4.2.6 写作页轻量补全专项

目标是“需要时自然出现的一小段正文”，而不是把顾问聊天搬到光标旁。

触发策略：

- 设置分为关闭 / 手动 / 智能，首次启用后默认智能；偏好按用户保存；
- 智能模式仅在正文编辑态、无选区、非 IME composing、光标未移动且最近输入达到自然停顿时触发；自然停顿包括句末标点、换段或连续输入达到阈值后停顿；
- debounce 从当前 220ms 调整到约 700-900ms，并加入请求完成后的短 cooldown；删除、粘贴大段、Undo/Redo、章节切换和正文过短时不自动触发；
- 每次触发绑定 chapter ID、content revision、cursor position 和 request ID；任一变化立即 abort 并丢弃迟到响应；
- 手动快捷入口不依赖智能模式，可在当前光标强制生成或重试。

生成策略：

- 默认建议 20-90 个中文字符、1-2 句，优先补完当前句或开启下一小步；不生成解释、标题和整段分析；
- 上下文包含当前段落、上一个完整段落、有限后文、章节目标、固定素材和动态命中的角色/地点/设定；
- 采纳整个建议用 Tab，Esc 忽略；增加“采纳到下一标点”的局部采纳，剩余部分保留并重新校验；
- 采纳作为一次 editor history transaction，可一次撤销；采纳后不立即再次触发；
- ghost text 只使用弱化文字，不加卡片、边框或遮挡正文；生成状态放在编辑器边缘，错误不弹 modal；
- 当输出被 normalization 清空时记录原因并静默结束，连续失败达到阈值后暂停智能触发并提示检查模型配置。

质量门槛：

- 迟到响应写入率必须为 0；
- 光标后有文本时，建议不得重复或吞掉后文；
- 80% 以上有效响应能直接作为正文展示，不含“建议如下/作为 AI”等元话语；
- 智能模式每分钟触发和失败次数有上限，避免停顿即请求造成成本与干扰；
- 记录本地聚合指标：trigger、shown、accepted-full、accepted-partial、dismissed、stale、empty、latency、matched refs；默认不上传正文。

#### G4.2.7 交互与 UI 形态

- `GmPersonaLauncher` 保留右下角圆形/紧凑入口，但展开内容改为当前任务、待审阅结果和最近一次动作，不再显示一段固定宣传文案；
- 选中文字时在既有编辑操作附近提供 2-3 个上下文动作；没有选区时不显示“修正选中内容”；
- 专业任务结果进入“结果托盘”：上方是结论与风险，下方按 action 展示 diff、引用和应用范围；自由问答才进入对话流；
- review 结果允许逐条“转为动作/忽略”，不能把建议列表误标成可应用修改；
- 文本 patch 使用行内或并排 diff，素材/画布/分镜使用领域预览；应用、部分应用、撤销、重试和 stale 状态使用同一状态语言；
- 顾问不能以全屏透明 overlay 截断当前工作，桌面端优先使用不遮正文的窄侧托盘，窄屏才使用底部 sheet；
- 页面 persona 可以有不同 icon 和标题，但共用 token、结果组件、键盘行为和无障碍语义。

#### G4.2.8 分期执行

**M0：冻结契约与清除双轨（1 个实现切片）**

- 盘点并冻结首批任务，只保留真正有执行器的 task；
- 统一前后端 task definition、action 名称、result schema 和错误码；
- 未接入任务显式标记 unavailable，删除静默 fallback；
- 将现有测试合并为 2-3 个参数化契约用例，不增加总测试数。

Gate：前后端 task 清单一致；每个 action 都有 validator 和 owner；未知任务明确失败。

**M1：接通 AgentRunner 与 ContextEnvelope（2 个实现切片）**

- `/api/advisor/task` 正式接收 envelope，校验 budget、target revision 和 task policy；
- 将 OpenClaw 与常规文本模型包装为 provider adapter，增加 capability/timeout/fallback；
- 建立 context ledger、token report、source refs 与本地 request trace；
- 修复 context clip：规则块不能以“标记 truncated 后整块不序列化”的方式消失。

Gate：同一 fixture 在前端、HTTP body 和服务端 prompt 中保持同一 source/order；日志可解释每个上下文块为何进入或被丢弃。

**M2：写作补全试点（2 个实现切片）**

- 将 `writingAgentContext.js`、`writingAgentReferences.js` 和 worldbook builder 接入统一 ledger；
- 实现智能触发、IME/粘贴/Undo 抑制、revision 失效、局部采纳、一次撤销和失败熔断；
- 拆出 `useWritingAgent`、`WritingInlineCompletion`，避免继续把状态堆入 `Writing.vue`。

Gate：真实 provider 下完成中文正文 30 次 smoke；无迟到覆盖、无 Tab 缩进回归、无章节串写。

**M3：写作专业动作（2 个实现切片）**

- 接通选区/段落改写、扩写/压缩、前后文桥接、章节体检、抽取素材/纲要；
- result tray 提供 diff、逐项应用、原子事务和撤销 receipt；
- 把 task、上下文、执行与持久化从 `Writing.vue` 拆出，保留页面编排职责。

Gate：所有写动作均可预览、应用、撤销；修改 target 后旧结果自动 stale；`Writing.vue` 先降至 < 3000 行，最终目标 < 1500 行。

**M4：素材与画布专业化（2 个实现切片）**

- 素材接精简/分类/拆分/合并/关系 action，支持多选与来源回看；
- 画布只发送 selection + neighbors + viewport，返回 patch preview 后再写入；
- 删除这两页对旧 `advisor.review.chapter` 的依赖。

Gate：素材和画布至少各有 3 个真正可应用任务；不选择对象时不会发送整个工作区。

**M5：体验与分镜接入地理/历史（2 个实现切片）**

- 体验 Agent 使用语义叙事块、PlaceEntity、历史因果、角色状态、精简记忆和未决线索；
- 下一步选项与涌现候选返回 typed result，继续遵守“正文完成后通知、点击后审阅”；
- 分镜 Agent 使用前后镜头与视觉连续性，generation request 只有确认后才提交媒体网关。

Gate：体验候选能说明命中的地点/历史/角色依据；分镜 review 不会误提交视频任务。

**M6：主动性、评估与收口（1 个实现切片）**

- 只增加三类可关闭的被动提示：写作停顿补全、明显一致性冲突、待处理结果提醒；
- 用本地指标调节触发阈值、上下文预算和建议长度；
- 清理 legacy adapter、旧 scope 与重复 prompt，更新用户文档和 provider 故障提示。

Gate：关闭 Agent 后没有后台请求；主动提示有频率上限；legacy 入口无调用后才删除。

执行进度（2026-07-23）：G4.2 M0-M6 实现 Gate 已全部关闭。M0-M1 建立共享 task / ContextEnvelope、预算/revision policy、ledger、trace 与 provider adapter；M2-M3 完成低打扰补全和写作专业事务；M4 关闭素材与画布专业任务 Gate；M5 完成受限体验候选与分镜 review/generation request，确认提示词不会提交媒体任务。M6 新增统一持久化 Agent 总开关，关闭时取消后台补全并在所有 `useAdvisor` 网络请求前本地阻断；写作补全、明显 revision/领域冲突、待审结果提醒均受频率限制，指标只记录事件、字符数、耗时和短失败原因，最多 120 条。已删除无运行调用且直连旧 generation service 的 `useCopilot`；现代前端与服务端内部使用 canonical task，共享 alias/adapter 只为主题1与旧客户端兼容保留。Chromium 实测待审提醒显示/清除只伴随原任务的 1 次请求，M6 Gate 关闭。M2 真实 provider 中文正文 30 次 smoke 仍待执行，并保留为 G4.2 最终结项条件。

#### G4.2.9 测试预算与验收

测试总量继续保持不超过 200（核心 188、视觉 12）。新增 Agent 覆盖必须通过合并旧测试、参数化和替换低价值快照腾出预算，不按每个 task 复制一套测试。

核心契约集中覆盖：

- task registry 与服务端 allowlist 一致；
- context priority、token budget、递归一跳、pin/exclude 和 sourceRefs；
- schema 校验、未知 action 拒绝、revision stale、原子 apply 与 undo receipt；
- 补全触发抑制、Abort、迟到响应、IME、局部采纳、章节切换；
- 每个 surface 至少一个纵向 fixture，从 context policy 到可应用 result；
- provider timeout、一次 retry、fallback 和敏感字段清理。

视觉 12 个用例不扩容，只替换低价值基线覆盖：桌面结果托盘、窄屏 bottom sheet、ghost text、diff/stale/error 和键盘 focus。

完成定义：

- 用户能清楚区分“内联补全、专业动作、开放问答”；
- 各页面不再把专业任务伪装成章节体检；
- 写作补全在智能模式下可自然出现，并能完整/局部采纳和一次撤销；
- 每条可应用结果都能说明 target、revision 和使用的设定/素材/地点/历史；
- 所有写操作必须预览并可撤销，所有运行时变化必须经过现有受限 mutation；
- p95 首个可见反馈：内联补全 < 2.5s，专业任务 < 8s；超时后提供明确重试或 provider fallback；
- Agent 关闭时网络请求为 0，项目正文和 API 凭据不进入遥测。

#### G4.2.10 候选文件边界与非目标

优先新增/调整：

- `src/services/agents/agentTaskRegistry.js`、`agentContextEnvelope.js`、`agentResultLifecycle.js`；
- `src/services/agentRunner.js`、`agentContextLedger.js`、`agentResultValidator.js`、`agentApplyTransaction.js`；
- `src/composables/useAgentSession.js`、`useWritingAgent.js`；
- `src/components/agent/AgentResultTray.vue`、`AgentContextLedger.vue`、`TextPatchPreview.vue`、`WritingInlineCompletion.vue`；
- `server/routes/advisor.js`、`server/services/agentTaskService.js`、provider adapters；
- 各 surface 只保留 context adapter、command 声明与领域 action executor。

明确非目标：

- 本阶段不做无限自主循环、后台自主改稿、跨用户长期云记忆、向量数据库或全项目自动重构；
- 不为每个 persona 建独立 prompt、store、panel 或 provider；
- 不在 M0-M3 同时重做所有页面 UI，先证明写作纵向闭环，再扩展 surface；
- 不为了 Agent 再建一套 worldbook、地理、历史、素材或媒体数据源，只消费现有 owner 和显式引用。

### G4.3 分镜/导演统一

任务：

- 决定 `useDirector`：接入为正式 owner 或删除，禁止继续双轨；
- 关系画布卡片和 storyboard shot 通过显式 adapter 转换；
- 每个镜头带 sourceRefs、角色、地点、时段、镜头语言、对白、声音、视觉连续性和版本；
- 分镜生成先产生 draft version，确认后成为 current；
- 修改原章节后标记相关镜头 stale，不自动覆盖；
- 将 `ProseEssay.vue` 中图片供应商、导出和导演逻辑拆为服务和面板；
- 保留 Markdown/JSON/剪辑包导出，并增加可重导的 manifest。

验收：

- 一段章节可生成、审阅、修改和版本化分镜；
- 镜头可跳回原文和相关素材；
- 原文变化能提示受影响镜头；
- 分镜导出可再次导入并恢复引用关系。

### G4.4 素材插画与漫画工作流

#### G4.4.1 结论与纠偏

现有实现只完成了“来源素材 -> 4/6 格文字描述 -> 每格一张最终图 -> 简单拼页”的技术原型。它验证了 MediaAsset、来源引用、格级失败隔离和独立文字层，但没有形成真正的漫画生产流程，不能再把它描述为漫画闭环。

漫画的核心不是格数，而是叙事节奏、阅读动线和一组可回退的制作阶段。专业工具允许单独编辑格框尺寸、形状、沟槽和跨格元素；漫画页制作也从页级构图和粗分镜开始，再进入线稿、背景、网点/颜色、效果与文字气泡。参考：[Clip Studio 格框编辑](https://help.clip-studio.com/en-us/manual_en/540_comic/Frames_and_Panels.htm)、[官方单页漫画制作流程](https://tips.clip-studio.com/en-us/articles/3520)、[数字绘画图层模型](https://help.clip-studio.com/en-us/manual_en/180_layers/What_are_layers__63_.htm)。

因此 Pinax 的产品定位调整为：

- 不是“一键生成整页漫画”，而是 AI 辅助的漫画导演与阶段化制作工作台；
- 不在浏览器内重造完整 CSP/Krita 笔刷引擎，首版负责结构化导演、参考管理、阶段生成/上传/替换、页面编排、文字排版、版本回退和导出；
- `/comics` 是独立漫画制作工作区，不隶属于素材页当前选中项；入口与“相关素材 / 插画生成”并列，左侧素材抽屉用于为当前格选材，中央主区是带页签的页面画布，右侧是当前页/当前格的阶段检查器，生成配置不进入中央画布；
- 每一阶段都必须能人工替换。用户上传的草图、线稿或上色稿与 AI 结果同等对待；
- 模型不具备结构控制、身份保持或局部编辑能力时必须明确降级，不能用普通文生图伪装成线稿/上色流程。
- 素材插画不再是正文上方的独立预览框：中央主区按 Word 图片布局语义支持嵌入、四周/紧密环绕、上下和前后层，资产主图及插入正文的 Markdown/MediaAsset 图片都使用原始比例并以拖动/角点缩放直接编辑，文字环绕版式只在图片右键菜单出现；每张图片的锚点与版式属于 MediaAsset/NarrativeAsset 构图元数据，生成参数仍只放右侧副工作台。参考 [Microsoft Word 图片文字环绕](https://support.microsoft.com/en-gb/office/wrap-text-around-a-picture-in-word-bdbbe1fe-c089-4b5c-b85c-43997da64a12) 与 [CSS Shapes Level 1](https://www.w3.org/TR/css-shapes/)。

#### G4.4.2 完整制作管线

漫画项目按以下八阶段推进。阶段可以回退，后续阶段记录其依赖版本；上游修改后，下游标记 `stale`，不静默覆盖。

1. **改编与分页**
   - 从一条或多条素材提取场景、冲突、转折、信息揭示和页尾钩子；
   - 先决定页数、阅读方向、媒介形态（页漫 / 条漫）和目标色制（黑白 / 彩色），再拆页；
   - 每页保存叙事任务、情绪曲线、页首承接、页尾转场，不由用户先选“4 格/6 格”。
2. **视觉圣经**
   - 角色保存正侧面、表情、服装、身高比例、关键道具和禁改特征；
   - 地点保存建立镜头、空间关系、时段、天气、主色和透视参考；
   - 画风保存线条、黑白/彩色方案、网点、笔触、色板和参考来源；
   - 参考图按 `identity / costume / location / prop / style` 分工，不再把三张图片作为无语义数组传给所有格。
3. **页级分镜与阅读动线**
   - LLM 先输出页级 beat，再输出候选格框树，不直接生成最终画面提示词；
   - 格框支持增删、拆分、合并、拖动边界、调整沟槽、出血、跨格和阅读顺序；
   - 页面必须记录视觉焦点和阅读流向。官方案例明确使用透视倾斜、特写和场景线条把视线引向下一格/下一页，而不是均分格子；参考[单页漫画的阅读节奏](https://tips.clip-studio.com/en-us/articles/3520)。
4. **逐格构图草案**
   - 每格保存景别、机位高度、俯仰/倾斜、透视类型、焦点、人物走位、动作线、前中后景和气泡留白；
   - 用户可选择 LLM 构图方案、上传草图，或在画布上调整人物框、头部/视线、地平线、消失点和运动方向；
   - 草图/姿态/深度/边缘作为结构控制，角色参考只负责身份与服装。ControlNet 证明边缘、深度和人体姿态可以作为空间条件；IP-Adapter 的图像提示可与文本和结构控制组合，二者不能混成一个“参考强度”。参考：[ControlNet](https://arxiv.org/abs/2302.05543)、[IP-Adapter](https://arxiv.org/abs/2308.06721)。
5. **草稿与线稿**
   - `rough` 负责构图、动作和剪影，不追求细节；`line` 只在 rough 被采纳后创建；
   - 线稿区分人物、背景和效果线来源，保存父版本、控制图、模型参数和人工替换记录；
   - 单格可重做局部、遮罩修复、扩图或替换整层，禁止重生成整页连带破坏已确认格；
   - 生成服务不支持 edge/sketch control 时，仅提供“生成新草稿”，不提供“保持构图生成线稿”。
6. **颜色或黑白处理**
   - 彩色路线：`line -> flats -> shade/render -> effects`；平涂是独立阶段和区域选择依据，不与光影合并；
   - 黑白路线：`line -> blacks/tones -> effects`，网点、纯黑、速度线和拟声效果保持独立层；
   - 官方工具同样要求线稿层与颜色层分离，自动光影以前也需要已有线稿和颜色层；参考[图层分工](https://help.clip-studio.com/en-us/manual_en/180_layers/What_are_layers__63_.htm)和[线稿/颜色后的光影阶段](https://tips.clip-studio.com/en-us/articles/9941)。
7. **文字、气泡与拟声词**
   - 对白不只是字符串：保存气泡形状、边界框、尾巴指向、字体、字号、方向、对齐、旋转、层级和关联角色；
   - 旁白框、对白气泡、思考气泡和拟声词使用不同对象类型；
   - 自动排版只给候选位置，用户在中央页面拖动/缩放，检查阅读顺序、遮挡焦点和溢出；
   - 气泡必须是可编辑矢量/文本对象。专业工具把文字与气泡绑定并允许移动、变形和合并；参考[Clip Studio 气泡模型](https://help.clip-studio.com/en-us/manual_en/540_comic/Balloons.htm)。
8. **质检、版本与导出**
   - 质检覆盖人物身份/服装、左右手与道具、地点连续性、镜头重复、阅读顺序、气泡溢出、字号、沟槽/出血和缺失阶段；
   - 页漫导出 PNG/WebP/PDF/manifest；条漫提供手机可视区预览、纵向连续画布和按高度切片；参考[Webtoon 可视区与切片导出](https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm)；
   - manifest 保留页面、格框、图层、文字对象、MediaAsset、GenerationJob、模型能力和所有来源；
   - 漫画格转分镜镜头走显式 adapter，只带画面、角色、地点、镜头与对白，不把页框/气泡布局污染视频镜头。

#### G4.4.3 现有漫画页制作模型

直接扩展现有 `ComicPage` 数据，不增加第二个项目存储键，也不为当前本地项目设计迁移流程。`imageTakeIds[]` 保留为生成图片候选；制作阶段单独保存状态，避免把线稿、上色和最终图混成同一层级。

```ts
type ComicFormat = 'page-ltr' | 'page-rtl' | 'webtoon'
type ComicColorMode = 'monochrome' | 'color'
type ProductionStage = 'rough' | 'line' | 'flats' | 'tones' | 'render' | 'effects'
type StageStatus = 'empty' | 'working' | 'review' | 'approved' | 'stale' | 'failed'

interface ComicSequence {
  id: string
  schemaVersion: 2
  projectId: string
  title: string
  format: ComicFormat
  colorMode: ComicColorMode
  readingDirection: 'ltr' | 'rtl' | 'vertical'
  sourceRefs: ContentRef[]
  visualBibleId: string
  pageIds: string[]
  revision: number
  status: 'draft' | 'reviewed' | 'accepted' | 'superseded'
}

interface ComicVisualBible {
  id: string
  characterRefs: Array<{
    entityRef: ContentRef
    identityAssetIds: string[]
    costumeAssetIds: string[]
    expressionAssetIds: string[]
    invariantNotes: string[]
  }>
  locationRefs: Array<{ entityRef: ContentRef; assetIds: string[]; spatialNotes: string[] }>
  propRefs: Array<{ entityRef: ContentRef; assetIds: string[]; invariantNotes: string[] }>
  styleAssetIds: string[]
  palette: string[]
  lineStyle: string
  renderingNotes: string
}

interface ComicPageV2 {
  id: string
  sequenceId: string
  pageNumber: number
  narrativeBeat: string
  pageTurnHook: string
  canvas: { width: number; height: number; bleed: number; safeInset: number }
  panelIds: string[]
  layoutRevision: number
  status: StageStatus
}

interface ComicPanelV2 {
  id: string
  pageId: string
  readingOrder: number
  frame: {
    kind: 'rect' | 'polygon'
    points: Array<{ x: number; y: number }>
    gutter: number
    bleed: boolean
  }
  beat: { action: string; emotion: string; reveal: string; transition: string }
  direction: {
    shotSize: 'extreme-wide' | 'wide' | 'medium' | 'close' | 'extreme-close' | 'insert'
    cameraAngle: 'eye' | 'high' | 'low' | 'bird' | 'worm' | 'dutch' | 'pov'
    perspective: 'flat' | 'one-point' | 'two-point' | 'three-point' | 'fisheye'
    focalPoint: { x: number; y: number }
    horizonY?: number
    vanishingPoints?: Array<{ x: number; y: number }>
    blocking: Array<{ entityRef: ContentRef; box: [number, number, number, number]; facing?: string }>
    motionVectors: Array<{ from: [number, number]; to: [number, number] }>
    balloonSafeZones: Array<[number, number, number, number]>
  }
  continuityRefs: ContentRef[]
  referenceBindings: Array<{
    role: 'identity' | 'costume' | 'location' | 'prop' | 'style' | 'pose' | 'depth' | 'edge'
    assetId: string
    entityRef?: ContentRef
    region?: [number, number, number, number]
    weight?: number
  }>
  production: Record<ProductionStage, ComicStageState>
  letteringObjectIds: string[]
}

interface ComicStageState {
  status: StageStatus
  selectedArtifactId?: string
  artifactIds: string[]
  inputRevision: string
  approvedAt?: number
  error?: { code: string; message: string; retryable: boolean }
}

interface ComicArtifact {
  id: string
  panelId: string
  stage: ProductionStage
  mediaAssetId: string
  parentArtifactIds: string[]
  controlBindings: ComicPanelV2['referenceBindings']
  generationJobId?: string
  origin: 'generated' | 'uploaded' | 'edited'
}

interface ComicLetteringObject {
  id: string
  panelId: string
  type: 'speech' | 'thought' | 'caption' | 'sfx'
  text: string
  speakerRef?: ContentRef
  box: [number, number, number, number]
  tailTarget?: [number, number]
  style: { font: string; size: number; align: string; direction: string; rotation: number }
  zIndex: number
}
```

当前页面直接使用这些字段；没有制作阶段产物时状态为空，已有图片候选只作为当前画面候选，不虚构线稿、平涂或上色结果。

#### G4.4.4 生成能力与降级

扩展图片 provider 能力发现，UI 只显示当前模型真实支持的阶段动作：

```ts
interface ComicImageCapabilities {
  textToImage: boolean
  imageToImage: boolean
  inpaint: boolean
  outpaint: boolean
  identityReference: boolean
  multiSubjectRegional: boolean
  controls: Array<'sketch' | 'edge' | 'pose' | 'depth' | 'segmentation' | 'color'>
  transparentOutput: boolean
}
```

规则：

- `rough` 可使用普通文生图，但必须绑定方向数据和构图草图；
- `line` 需要 image-to-image + sketch/edge 保持，缺少时只允许上传或重新生成独立候选；
- `flats/tones/render` 需要以上一阶段为输入；不支持结构保持时禁用“继续本阶段”，避免返回完全不同构图；
- 多角色格优先使用区域绑定；供应商不支持时提示身份混淆风险并允许逐角色局部修复；
- 每次生成记录实际消费的 identity、pose、edge、depth、mask 和上游 artifact，不能只存一个 prompt；
- 本地 SD WebUI/ComfyUI 可逐步支持 ControlNet/IP-Adapter 工作流；OpenAI/Stability/通用 HTTP 只按其实际 edit/control 能力开放，不写死等价能力；
- 自动一致性评分只是提示，不自动采纳或覆盖用户选择。

#### G4.4.5 工作台信息架构

漫画制作使用独立 `/comics` 三栏工作区，归入“素材”模块但不绑定素材页当前选中项，也不继续复用素材页的插画副工作台：

- **左侧素材抽屉**：沿用素材页的分类索引和便签结构；点击素材只绑定当前格，不把整页重新挂到单条素材；
- **中央页面画布**：顶部管理漫画页序列、页码、阶段完成度和 stale/失败标记，主体始终显示真实页面或条漫画布；格框、构图控制点和气泡只在对应模式显示；
- **右侧副阅读台 / 阶段检查器**：外观和顶部模式导航与素材页一致，可带当前素材返回相关素材或插画生成；主体显示当前页或当前格的叙事 beat、导演参数、参考绑定、阶段链、候选、生成/上传/采纳/回退动作；
- **格级素材绑定**：每格从素材库选择一条主要素材并写入 `ComicPanel.continuityRefs`；`ComicPage.sourceRefs` 只汇总各格来源。提示词、生成归档和来源回跳都读取格级绑定，不用页级来源把整页挂到单个素材下；
- **模型配置**：放在阶段动作的二级菜单或设置弹层，不让每格重复出现完整 provider 表单；
- **中央画布不放生成参数**：用户之前确认的“图在主区、生成在其他区域”继续成立；
- **无嵌套卡片**：阶段链使用紧凑列表/时间线，当前阶段展开，其他阶段只显示状态和选中 artifact；
- **长任务**：批量任务展示页/格/阶段进度，可暂停后续提交、取消未开始任务、失败后只重试失败项。

关键交互：

1. 进入漫画制作 -> 新建漫画项目/页面 -> 为各格选择素材或从多条素材生成 1-3 个分页方案；
2. 选择方案 -> 建视觉圣经 -> 审阅角色/地点/风格参考；
3. 进入分镜模式 -> 调整页序、格框、阅读顺序和每格导演参数；
4. 逐页批准分镜，未批准页不能批量进入线稿；
5. 当前格按 rough/line/color 或 rough/line/tone 路线推进；每阶段选择候选并批准；
6. 文字模式自动给气泡候选位置，用户拖动、缩放、改尾巴和字体；
7. 质检面板列出阻断项和警告；通过后导出或转换为分镜版本。

#### G4.4.6 服务边界与候选文件

- `comicAdaptationService.js`：素材 -> 多页 beat / page turn / panel beat；
- `comicVisualBibleStore.js`：角色、地点、道具、风格参考及不变量；
- `comicPageStore.js`：漫画页、格框、方向、制作阶段、视觉圣经和 stale 传播；
- `comicCompositionService.js`：格框树、阅读顺序、构图约束和规范化坐标；
- `comicProductionService.js`：阶段依赖、artifact lineage、批量任务与 provider 能力门禁；
- `comicLetteringService.js`：文字对象、自动候选位置、溢出和阅读顺序检查；
- `comicContinuityService.js`：角色/地点/道具绑定与跨格一致性报告；
- `comicExportService.js`：PNG/WebP/PDF、条漫切片和可重导 manifest；
- `ComicWorkbench.vue`：页面级编排，不直接调用 provider；
- `ComicStudio.vue`：独立路由工作区，持有页列表、当前页、素材候选和模型配置；
- `ComicCanvas.vue`：格框/构图/文字对象交互；
- `ComicStageInspector.vue`：右侧阶段链与动作；
- `ComicPageEditor.vue`：现有漫画制作入口，逐步承载方向、阶段和分页编辑；
- `Notes.vue`：只持有素材整理和插画生成，不再持有当前漫画项目或漫画制作组件。

#### G4.4.7 分期执行与门禁

**M0：纠偏与冻结（本计划）**

- 把现有实现标记为 v1 原型，停止在 `ComicPageEditor.vue` 上继续叠功能；
- 更新状态、已知问题和 UI 文案，避免把固定格数称为完整漫画排版；
- 冻结 v1 数据写入契约，后续只做兼容修复。

门禁：主计划、状态和已知问题对当前能力描述一致。

**M1：现有漫画页直接补齐制作字段**

状态：已完成（2026-07-16）。现有 `comic_pages_v1` 直接扩展为制作模型，增加画幅、色制、画布、视觉圣经、格框、beat、景别/机位/透视、参考绑定和 rough/line/flats/tones/render/effects 状态；不新增迁移层。

- 现有页直接保存制作字段，旧字段缺省为可编辑的空状态；
- 图片候选仍通过 MediaAsset ID 保存，制作阶段只保存候选引用和审阅状态；
- 修改画面、构图、参考绑定或视觉圣经后，相关阶段直接标记 stale；
- 通过同一 `ComicPageEditor` 先提供方向和阶段检查，再逐步替换为中央画布。

门禁：刷新后同一漫画页能保留景别、机位、透视和阶段状态；批准或修改上游后，下游状态不会继续显示为有效。

**M2：改编、分页与视觉圣经**

- LLM 输出多页方案、页级 beat、页尾钩子和格级 beat，不再要求固定 4/6 格；
- 从 worldbook、地点、角色素材和已有插画组成有语义的参考绑定；
- 视觉圣经可人工增删参考并锁定不变量。

门禁：同一段素材可比较至少两个分页方案；每个角色/地点参考都能跳回来源；未确认视觉圣经不能批量生成。

**M3：中央分镜与构图画布**

- 支持格框拆分/合并/拖边、沟槽、阅读顺序、页漫/条漫画布；
- 支持景别、机位、透视、焦点、人物框、运动向量和气泡安全区；
- 导演数据生成构图提示与控制图，但不直接生成最终 render。

门禁：页面不是固定模板；任意格调整不重置其他格；手机宽度下中央画布和右侧检查器不重叠。

**M4：草稿、线稿与局部修订**

- provider capability matrix 接入 UI；
- rough -> line 阶段链、上传替换、候选采纳、局部遮罩修复和 lineage 落地；
- 支持角色身份参考与 pose/edge/depth 分开绑定；
- 批量任务只推进已批准上游的格。

门禁：不支持结构控制的模型不会出现“保持构图转线稿”；单格失败不影响同页其他格；可以回到任意已批准 artifact。

**M5：彩色/黑白生产路线**

- 彩色增加 flats、render、effects；黑白增加 blacks/tones、effects；
- 色板/网点/线条规则来自 visual bible；
- 每阶段能上传人工结果并继续下游。

门禁：线稿改变会使颜色/网点与效果 stale；平涂和光影可分别替换；黑白项目不显示彩色专属动作。

**M6：文字排版与出版导出**

- 基础切片已完成（2026-07-19）：模型生图与脚本文字分离，脚本内容需明确排入后才成为 `letteringObjects`；对白、心声、旁白和拟声对象可编辑、拖动、缩放并进入整页预览和 PNG，未排入文字不会自动覆盖成图；
- 实现可拖拽气泡、尾巴、旁白框、拟声词、字体与方向；
- 实现文字溢出、焦点遮挡、阅读顺序和安全区检查；
- 导出页漫 PNG/WebP/PDF、条漫连续预览/切片及 v2 manifest。

门禁：导出文字与画面分层生成且没有模型乱码；重新导入 manifest 后对象位置、字体、层级和来源一致。

**M7：连续性质检与分镜转换**

- 生成跨页人物/服装/道具/地点连续性报告；
- 检查镜头景别重复、180 度方向风险、页尾钩子和空白节奏；
- v2 漫画格显式转换为 storyboard draft version，并保留 source refs。

门禁：质检只报告且允许逐项忽略/确认；漫画改动能标记衍生分镜 stale；不自动修改正式漫画页。

#### G4.4.8 测试策略与明确非目标

测试总量继续不超过 200：新增漫画核心契约时，扩展现有 media integration 用例或替换价值更低的重复断言，不新增大量样式字符串测试。

必须覆盖：

- 现有漫画页字段归一化、阶段依赖和 stale 传播；
- stage 依赖与 stale 传播；
- 格框规范化、阅读顺序和条漫切片；
- provider 能力门禁和控制绑定编译；
- 部分批量失败、重试与恢复；
- 气泡溢出/阅读顺序；
- manifest 往返与 sourceRefs；
- 真实浏览器手测：页漫、条漫、窄屏、刷新恢复、导出再导入。

明确非目标：

- 首版不实现完整自由笔刷、压感、矢量钢笔和 PSD/CSP 原生文件编辑器；
- 不承诺任意 provider 都能保持人物一致或执行 line/flats/render 转换；
- 不自动训练角色 LoRA，也不把训练任务塞进浏览器；
- 不允许一次点击跳过所有审阅阶段生成“最终漫画”；
- 不为了展示功能而伪造线稿、平涂或构图阶段：没有真实上游 artifact 就显示缺失。

当前状态（2026-07-19）：共享 provider、MediaAsset 和现有漫画页制作字段已贯通；M0-M1 完成。漫画已从单条素材的副工作台迁入独立 `/comics` 工作区，入口回到素材页副阅读台；左侧素材抽屉、中央页签/整页预览和右侧副阅读台检查器分栏显示，三联模式可携带当前素材往返相关素材、插画和漫画。每格通过 `continuityRefs` 选择自己的主要素材，选择动作不自动填充画面描述，页级来源仅做汇总。页级方向、画风/连续性、格级 beat、镜头和制作状态均有可见编辑入口，空白页真实支持 4/6 格。逐格生图以格级素材、全页视觉约定、上一镜锚点、当前剧情推进和摄影设计为优先；提示中不出现页码/格数。支持参考图的 provider 复用上一格成图，MiniMax Image 不再拼接长负面词串，按能力使用精简文本连续性锚点。M6 已完成基础文字对象、拖动/缩放、整页预览和 PNG 合成，但尾巴、字体、溢出/遮挡检查及完整出版导出尚未完成。这些都不等于 M2；下一步仍是多页改编候选与从角色、地点、已有插画建立的可审阅视觉圣经。

### G4.5 体验联机模式

定位：首版是“多人共同参与一场由房主控制的文字冒险”，不是通用聊天室，也不是多人共同编辑整个项目。

用户流程：

1. 在体验页选择“联机”，创建房间或输入房间名；创建后进入 `/experience/online/:roomSlug` 并可复制邀请地址。
2. 受邀者打开地址，输入昵称后加入；无需注册，昵称冲突时服务端返回可理解错误。
3. 大厅展示房主、玩家、旁观者、连接状态和当前世界摘要；房主可锁房、移除成员、转让房主或结束房间。
4. 每轮玩家提交行动；房主可选一条、合并多条或开启投票，选定后才调用 LLM。
5. 文本生成期间所有人看到统一“生成中”状态；完成后正文作为单个已提交事件出现，再显示世界变化建议。
6. 房主确认 runtime patch 后，所有客户端按同一 `seq` 应用；拒绝或撤销也生成事件，不静默改状态。

服务端拆分：

- 将 `app.listen()` 改为显式 `http.createServer(app)`，把现有 `ws` 挂到 `/ws/rooms`；
- `roomManager` 管成员、角色、TTL、心跳和房主转移；
- `roomEventStore` 管 seq、最近事件环形缓冲、snapshot 和重连；
- `roomProtocol` 做消息 schema 校验、版本协商、幂等和错误码；
- 首版进程内存储，接口按可替换持久层设计；多实例部署前再接 Redis/pub-sub，不在 MVP 伪装支持水平扩容。

客户端拆分：

- `useOnlineRoom` 只处理连接、重连、lastSeq、outbox 和 presence；
- `Experience.vue` 继续复用单机文本渲染和 runtime UI，通过 `experienceSessionAdapter` 接收本地或房间事件；
- 路由参数只标识房间，不承载昵称、口令、API key 或世界状态；
- 断线时禁用有副作用动作，允许查看已接收正文；重连后先补事件，缺口过大则拉 snapshot。

协议最小命令：

```text
client.hello / room.join / room.leave
chat.send / action.propose / action.select / vote.cast
narrative.request / runtime.patch.accept / room.snapshot.request
server.ready / presence.sync / event.append / error / pong
```

可靠性与安全：

- 心跳检测半开连接；重连使用指数退避与抖动，最多一个活动 socket；
- 限制昵称、消息长度、每秒消息数、房间人数和每轮行动数；所有显示文本沿用现有净化逻辑；
- 房主权限在服务端校验，客户端隐藏按钮不算授权；
- 房间口令只保存带 salt 的摘要；日志和错误不得记录口令、API key 或完整 prompt；
- 每个有副作用命令带 `commandId`，服务端重复收到时返回原结果，不重复生成或写回。

候选文件：

- `server/index.js`；
- `server/realtime/roomServer.js`；
- `server/realtime/roomManager.js`；
- `server/realtime/roomProtocol.js`；
- `src/composables/useOnlineRoom.js`；
- `src/services/experienceSessionAdapter.js`；
- `src/components/experience/OnlineRoomPanel.vue`；
- `src/router/index.js`；
- `src/pages/Experience.vue`：只增加模式接线，不内置 socket 状态机。

验收：

- 两个浏览器通过同一邀请 URL 加入，在线成员、聊天、行动和最终正文顺序一致；
- 生成正文只由房主触发一次，其他客户端不会各自调用 LLM；
- 玩家断线后 30 秒内重连，可从 `lastSeq` 补齐且不重复显示；
- 房主断线时按策略暂停生成并在宽限期后转移房主，不产生两个权威 owner；
- 非房主伪造 `runtime.patch.accept`、超长消息和重复 command 均被服务端拒绝或幂等处理；
- 单机体验路由和现有存档行为不回归。

调研依据：hack.chat 客户端直接从 URL query 读取 channel，使用 WebSocket 发送 `{cmd:'join', channel, nick}`，并用 `onlineSet/onlineAdd/onlineRemove` 同步成员；其 README 明确定位为无账号、无日志、短暂聊天室。Pinax 只借鉴 URL 房间和快速加入，不继承无持久剧情、弱权限和聊天室协议：

- <https://github.com/hack-chat/main>
- <https://github.com/hack-chat/main/blob/master/client/client.js>
- <https://github.com/hack-chat/main/blob/master/commands/core/join.js>

## Gate 5：视频、音频与发布渠道

目标：把现有分镜变成供应商无关、可恢复、可核算的媒体生产队列。

预计：3-6 周，取决于供应商账号和真实额度。

### G5.1 先建服务端媒体网关

不能从浏览器直接把供应商 key 发往视频 API。新增 Express media gateway：

- `POST /api/media/jobs` 创建任务；
- `GET /api/media/jobs/:id` 查询统一状态；
- `POST /api/media/jobs/:id/cancel` 取消；
- `POST /api/media/webhooks/:provider` 接收回调；
- `GET /api/media/jobs/:id/assets` 获取已归档结果；
- `GET /api/media/providers` 返回配置与能力，不返回 secret；
- `POST /api/media/providers/test` 做结构化连通性和能力测试；
- provider adapters 负责 create/status/cancel/normalizeError/normalizeAsset；
- key 只在服务端环境或加密凭证库；BYOK 也通过短期 server session，不写日志；
- 下载供应商临时 URL 到项目资产存储，避免过期后作品失效；
- webhook 验签、幂等、重放保护和 allowlist；
- 记录模型、参数、prompt、成本、耗时、policy 状态和原始 provider job id。

自定义 API 不能沿用当前图片配置中“任意请求模板 + 任意响应路径”的松散契约。提供受约束的 `generic-async-http` adapter：

```ts
interface MediaProviderConfig {
  id: string
  modality: 'image' | 'video'
  adapterType: 'minimax-video' | 'runway-video' | 'openai-video' | 'generic-async-http'
  name: string
  baseUrl: string
  auth: { mode: 'bearer' | 'header' | 'none'; headerName?: string; secretRef?: string }
  endpoints: {
    create: { method: 'POST'; path: string }
    status: { method: 'GET' | 'POST'; path: string }
    cancel?: { method: 'POST' | 'DELETE'; path: string }
    asset?: { method: 'GET'; path: string }
  }
  mappings: {
    request: Record<string, string>
    providerJobId: string
    status: string
    progress?: string
    outputUrls?: string
    errorCode?: string
    errorMessage?: string
  }
  statusMap: Record<string, GenerationJob['status']>
  capabilities: VideoProviderCapabilities
}
```

约束：

- 不允许配置任意 JavaScript、任意本地文件路径或把 secret 插进 URL；
- 模板变量只开放 allowlist，例如 `prompt`、`model`、`duration`、`aspectRatio`、`firstFrameUrl`；
- 保存前校验 URL scheme、私网访问策略、路径模板、状态映射和必要字段；
- 连通性测试优先调用无费用的 models/capabilities/status 接口；若供应商只能通过计费生成测试，必须二次确认并明确费用风险；
- 测试结果统一返回 `reachable/authenticated/capabilities/latency/error`，不能只 alert“成功/失败”；
- provider 配置可导出但 secret 永不进入项目备份。

### G5.2 首批渠道策略

首批只接 2 个 direct provider + 1 个可选聚合层，不一次接全市场：

1. MiniMax/Hailuo：国内网络和中文团队接入友好，支持 text/image video、首尾帧或参考图能力；
2. Runway 或 OpenAI Video：提供成熟的任务 id / 状态查询范式，适合作为第二个独立 adapter；
3. fal.ai：仅作为可选聚合/实验渠道，用于快速验证新模型，不成为唯一供应商依赖。

Google Veo 放第二批：能力强，但 Vertex AI 的项目、权限、Cloud Storage 和 long-running operation 增加部署复杂度。

供应商必须通过能力发现表，而不是 UI 写死模型名：

```ts
interface VideoProviderCapabilities {
  textToVideo: boolean
  imageToVideo: boolean
  firstLastFrame: boolean
  referenceImages: boolean
  nativeAudio: boolean
  extendVideo: boolean
  cancel: boolean
  webhook: boolean
  durations: number[]
  aspectRatios: string[]
  resolutions: string[]
}
```

首批实现顺序：先完成 MiniMax adapter 和 `generic-async-http`，用两种不同状态模型验证抽象；再接 Runway 或 OpenAI。自定义 adapter 不是“支持所有 API”的承诺，只支持符合 create -> status -> asset/cancel 契约的异步 HTTP 服务。

### G5.3 镜头到视频工作流

任务：

- 从已确认 storyboard version 创建 video batch；
- 每个 shot 先通过 provider-neutral prompt compiler；
- 支持 `text-to-video` 与 `image-to-video`；首尾帧、角色参考和原生音频只在 provider capability 为真时显示；
- 自动带入角色参考图、地点参考图、首帧和风格 bible；
- 提交前显示预计费用、镜头数、预计时长和不支持参数；
- 支持单镜头试生成，再批量；
- 失败可按原供应商重试或映射到另一供应商；
- 结果进入镜头版本，不直接替换；
- 支持选 take、标记废片、重混/延长、下载和剪辑包更新；
- 页面切换、刷新和服务重启后仍能恢复任务；
- 过期素材在服务端归档后再标 succeeded。

分镜页 UI：

- 镜头卡只显示所选 take、任务状态和一个视频动作入口，不塞完整供应商表单；
- 右侧媒体面板负责 provider、模型、模式、时长、画幅、参考图、成本和提交；
- 单镜头默认试生成，批量提交必须来自已确认 storyboard version；
- queued/running/succeeded/failed/cancelled/expired 有不同状态，关闭面板或切路由不清除任务；
- 结果可逐 take 播放、设为当前、拒绝、重试、换渠道和下载；不在首版实现多轨剪辑。

验收：

- 5 镜头 batch 中单镜头失败不拖垮整批；
- 刷新后任务状态和进度恢复；
- provider A 失败可复制到 provider B，原始参数和映射可审计；
- 每个视频能追溯到 storyboard version、shot、prompt 和参考资产；
- 未确认费用不能批量提交。

### G5.4 音频层

视频稳定后再加入：

- 旁白 TTS；
- 角色配音与授权/同意记录；
- 环境音和音乐 cue；
- shot 级音频时间线；
- 字幕和对白导出；
- 最终剪辑仍交给专业 NLE，Pinax 输出 EDL/manifest/素材包，不自研完整剪辑器。

### G5.5 官方资料依据

截至本计划日期，官方资料显示：

- OpenAI Video API 使用创建 job、查询状态、下载内容的异步模型，并支持 prompt 与可选参考资产：<https://platform.openai.com/docs/api-reference/videos>
- Runway API 创建 image-to-video task 后返回 task id，再查询任务状态：<https://docs.dev.runwayml.com/guides/using-the-api/>
- Google Veo 在 Vertex AI 中使用 long-running operation，模型能力、时长、分辨率和配额因版本不同：<https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text>
- Luma Dream Machine API 同样采用 generation id 和状态查询：<https://docs.lumalabs.ai/docs/video-generation>
- MiniMax 官方 API 支持文本、图片、首尾帧或参考图驱动的视频任务：<https://platform.minimax.io/docs/guides/video-generation>
- fal.ai 对长任务提供 queue 和 webhook：<https://fal.ai/docs/documentation/model-apis/inference/webhooks>

由此得出的架构结论是：视频必须是持久化异步 job，而不是复用当前“页面 await 一个响应”的生图函数。

## Gate 6：产品化与长期能力

目标：当核心闭环稳定后，再扩大到真正可长期使用和发布的产品。

预计：持续推进。

### G6.1 本地优先数据层

- schema migration registry；
- IndexedDB 存大型结构和 Blob；
- localStorage 仅存小偏好和索引；
- 原子写、批写、崩溃恢复和 snapshot；
- 项目包导入导出；
- 离线 shell 和 PWA；
- 多设备同步只在 schema 稳定后选 RxDB/服务端方案；
- 多人协作只在编辑器模型稳定后评估 Yjs，不与基础迁移捆绑。

### G6.2 搜索、知识与一致性

- 全局实体/素材/正文搜索；
- sourceRefs 图遍历和反向引用；
- 设定冲突、角色连续性、时间线和地点一致性检查；
- 大项目再评估 embedding/vector retrieval；小项目先用结构化字段、关键词和引用图；
- AI 回答附使用来源，用户可以固定/排除上下文。

### G6.3 发布与互操作

按真实需求逐步加入：

- Markdown、纯文本、DOCX/EPUB；
- 世界书 JSON 和项目归档包；
- storyboard JSON、Markdown、CSV、Fountain/FDX 映射；
- 可独立打开的 HTML 冒险包；
- 视频素材 manifest、字幕、音频和剪辑包；
- 导出都带版本、license/source metadata 和缺失引用报告。

### G6.4 UX、无障碍与移动

- 统一 responsive shell，不再每页单独处理 `100vh + overflow:hidden`；
- mobile keyboard、safe area、抽屉和底部操作；
- 全局 focus-visible、skip link、dialog focus trap；
- reduced motion、forced colors、最小字号和对比度；
- 键盘可完成主流程；
- 大列表虚拟化或分页；
- 所有状态文本不只靠颜色区分。

### G6.5 安全、隐私与成本

- API key 服务端隔离和日志脱敏；
- 用户输入/模型输出的内容策略和申诉信息；
- prompt injection 边界：世界书和导入文本视为数据，不视为系统指令；
- HTML/Markdown 渲染继续统一 sanitize；
- 媒体输入来源、角色肖像/声音授权和商用条款记录；
- 按 provider/model/project 的预算、限额和费用报告；
- 删除项目时同时删除远端任务和归档资产，或明确保留策略。

### G6.6 可观测性与质量评估

- generation job tracing：task id、provider id、耗时、retry、token/费用；
- context ledger：各来源字符数、截断和命中理由；
- 地图 perf：每阶段耗时、cells、heap、render time；
- emergence eval：相关性、重复率、接受率、角色一致性；
- 写作 eval：用户接受/修改/拒绝，不用单纯“生成成功率”；
- 媒体 eval：镜头采纳率、失败率、平均成本和重试次数；
- debug 工具必须 URL gate，默认不进入普通用户 UI。

## 6. 横向能力优先级

除用户最初提出的 UX、地图、历史和视频外，完整优先级如下：

| 优先级 | 方向 | 为什么现在需要 |
|---:|---|---|
| P0 | 地理语义 -> 历史生产接线 | 这是当前“地图不是图片、历史不是 lore”的第一条可感知闭环 |
| P0 | 地点实体与地图双向联动 | 让同一地点在地图、历史、开场和冒险中使用同一引用 |
| P0 | 历史开局与 runtime 写回 | 没有运行时状态，历史仍然只是一次性入口 |
| P0 | 玩家历史与可解释世界变化 | 让玩家选择真正进入历史，而不是只留在聊天记录 |
| P1 | 统一项目上下文与引用谱系 | 支撑跨世界隔离、来源追溯和下游过期判断 |
| P1 | 角色/势力/因果连续性 | 决定地理约束下的涌现事件是否真实相关 |
| P1 | 设定工作区 UI 整合 | 让地图、历史和设定在同一工作区形成连续操作 |
| P1 | 地图 Worker 生命周期与存储恢复 | 作为地理-历史主线的可靠性支撑，不再单独占用主线 |
| P1 | 生成任务中心 | 支撑长任务、错误恢复和未来视频 |
| P1 | 存储迁移、备份和 IndexedDB | localStorage 无法承载持续增长和媒体 |
| P1 | 共享图片服务与媒体资产目录 | 插画、漫画和视频前先消除页面内重复 provider 逻辑 |
| P2 | 写作 agent/task/prompt 统一 | 降维护成本并提升上下文透明度 |
| P2 | 分镜/导演 owner 统一 | 视频接入前必须解决双轨和巨型页面 |
| P2 | 素材插画与漫画 | 让素材从文本中转层扩展为可追溯视觉创作入口 |
| P2 | 视频 provider gateway | 在 storyboard 和 job 层稳定后接入 |
| P2 | 联机冒险房间 | 在 runtime event 稳定后提供 URL 加入、多人行动和单一权威叙事 |
| P2 | 全局搜索、一致性检查 | 项目变大后才形成明显价值 |
| P2 | 移动、离线、无障碍 | 决定是否能日常使用，而非仅桌面 demo |
| P3 | 音频、字幕和剪辑包 | 视频稳定后的自然扩展 |
| P3 | 多设备同步/协作 | 数据模型稳定后再做，避免同步错误 schema |
| P3 | 插件生态/公开 API | 核心契约稳定后再开放 |

## 7. 推荐迭代顺序

### Iteration A：3 周 Living Atlas / Living History 主线

- 地图结果 -> `extractMapSemantics` -> 历史草案 -> 显式写入 `worldbook.geoHistory`；
- 语义点审阅、历史节点预览和覆盖前确认；
- PlaceEntity v1：统一 `placeId`、地图引用、历史引用和当前地点；
- 历史节点进入冒险时写入 runtime 的地点、参与者、事实和未决线索；
- 章节/里程碑/会话结束时写回玩家历史节点；
- 用确定性 fixture 验收“地图 -> 历史 -> 开局 -> runtime -> 玩家历史”。

退出条件：一次新项目可以从地图生成并确认历史，从历史节点进入冒险，且冒险结果新增一条带来源的玩家历史。

### Iteration B：2 周项目与设定整合

- ProjectManifest v1 和默认项目迁移；
- active context resolver；
- 设定工作区统一壳；
- import wizard；
- 草稿 review drawer 和统一保存状态。

退出条件：用户只在一个设定工作区完成导入、结构设定、条目和地图入口。

### Iteration C：3 周 World State / Emergence

- world state snapshot + state delta preview；
- 历史事件因果、地点控制和阵营关系；
- emergence scheduler v1：候选、评分、LLM 具体化、完成后通知、用户应用；
- 角色和势力连续性最小模型。

退出条件：事件能解释命中地理和历史的原因，用户拒绝事件不会改变世界状态。

### Iteration D：2 周可靠性与数据安全支撑

- 地图 Worker timeout/cancel/new-worker 和 20 次压力验证；
- 备份完整性、restore dry-run、损坏备份保护和 quota warning；
- 统一生成任务错误恢复和可观测性。

退出条件：主线链路已有稳定的恢复、备份和错误反馈，不再以基础设施工作替代产品闭环。

### Iteration E：4 周 Creative Graph / Visual Assets

- ContentRef/sourceRefs；
- 素材精简、去重和跳回来源；
- 写作 context ledger UI；
- typed agent actions；
- storyboard sourceRefs/version/stale；
- `useDirector` 收口。
- 抽离共享图片 provider/config/result parser，删除 `ProseEssay.vue` 重复实现；
- 媒体资产目录与 Blob/IndexedDB 存储；
- 素材插画模式；漫画完成 v2 模型、分页/视觉圣经、分镜构图和 rough -> line 的第一条真实阶段链。

退出条件：对话 -> 素材 -> 章节 -> 分镜全链可追溯；同一素材可产出可恢复插画，并能生成可编辑分页方案、批准构图且至少完成 rough -> line，不再以固定 4/6 格最终图冒充漫画制作。

### Iteration F：3 周 Video MVP

- media job schema + server gateway；
- MiniMax + 第二供应商 adapter；
- 单镜头试生成；
- batch、轮询/webhook、失败重试、成本预估；
- 结果归档到 storyboard shot；
- 重启恢复。

退出条件：5 镜头分镜可以安全提交、恢复、选 take 和导出素材包。

### Iteration G：3 周 Online Experience MVP

- HTTP server + `/ws/rooms`、room manager、协议 schema 和 seq event store；
- `/experience/online/:roomSlug` 创建/加入/邀请/重连；
- 房主、玩家、旁观者权限与 presence；
- 行动提议、选择/投票、单次 LLM 生成和完成后正文提交；
- runtime patch 房主确认、事件补发、snapshot、限流和房间 TTL；
- 双浏览器、断线重连、重复 command、伪造权限和房主转移 smoke。

退出条件：两个浏览器通过同一 URL 完成至少 5 轮冒险，正文、成员和 runtime 状态顺序一致，刷新/短暂断线不丢轮次。

## 8. 工作拆分规则

### 8.1 边界

- 地图 engine、renderer、worker 修改必须单独切片，不与设定 UI 重写混合；
- worldStore schema 迁移、project manifest 和 backup migration 先后串行；
- gameStore runtime/history 变化与 worldbook context builder 必须有端到端契约；
- `Writing.vue`、`ProseEssay.vue` 的拆分先建立行为测试，再移动代码；
- 视频 adapter 可以并行开发，但 job schema 和 normalized error 由一个 owner 先锁定；
- 联机 server 与素材/视频 UI 可并行，但 `GenerationJob`、`MediaAsset` 和 `RoomEvent` schema 各自只能有一个 owner；
- 视觉切片必须有 desktop/mobile 截图，不能只用 source regex 测试代替。

### 8.2 每个切片必须包含

- 用户问题与明确非目标；
- owner 文件清单；
- 数据迁移和 rollback；
- loading/empty/error/offline/cancel 状态；
- focused tests；
- build 和 diff check；
- 手测脚本；
- 状态文档更新；
- 不允许“先留 stub 以后补”作为完成标准。

### 8.3 建议团队并行度

常规功能开发最多 3 条不共享写集的实施流：

1. Reliability/Data：Worker、storage、manifest、jobs；
2. World Runtime：place、history、emergence、character continuity；
3. Product Surface：settings workspace、task center、creative graph UI。

跨流接口先以纯类型/fixture 锁定。不得让多个 worker 同时修改 `gameStore.js`、`worldStore.js`、`AppShell.vue` 或 `ProseEssay.vue`。

对于已冻结跨域契约、能严格分配互斥写集的专项，可以临时扩展到 5 个实现窗口，但必须使用独立 worktree/分支，并另设一个不并行的集成窗口。2026-07-16 的联机、Agent、画布和视频专项采用此模式：A-E 分别独占联机服务端、联机客户端、Agent 基础层、画布和视频网关，F 在合并后统一接 `Experience.vue`、`ProseEssay.vue` 与服务端路由。任务、冻结契约和提示词见 [并行执行包](../agent-runs/2026-07-16-online-agents-canvas-video/README.md)。

## 9. 测试与质量门槛

### 9.1 自动化层次

- Pure contract：schema、migration、ranking、state delta、provider normalization；
- Store integration：project switch、history write-back、job recovery；
- Component：review、cancel、error、stale 和 deep-link；
- E2E smoke：10 条主流程；
- Visual：1280/980/760/390，亮/暗、两主题；
- Performance：地图 20 次 regenerate、1000 素材搜索、50 job 恢复；
- Chaos：Worker hang、provider 429/500/timeout、storage quota、损坏备份、webhook 重放。

测试总量维持当前硬上限 `200`：每增加媒体或联机核心契约测试，必须合并或删除等量的重复 UI/source-regex 测试。优先保留 schema、adapter normalization、重连幂等、权限、任务恢复和一条跨域 smoke，不为每个 provider/按钮复制同构用例。

### 9.2 发布门槛

- P0 数据丢失和永久 loading 为 0；
- 所有 migration 可重跑并有旧版本 fixture；
- 页面切换不取消后台长任务，除非用户明确取消；
- 所有 AI 写回可 review/undo；
- 所有媒体任务可恢复并有成本记录；
- 联机房间的有序事件、权限和幂等命令有契约验证；
- 无新直接 `localStorage.setItem` 绕过存储层；
- 无新页面级 provider-specific fetch；
- 无新巨型页面功能块，新增领域逻辑必须进入 service/composable/component。

## 10. 明确暂缓

以下方向有价值，但现在做会分散主线：

- 3D 地图、WebGPU 全重写；
- 完整 Civilization 式世界模拟；
- 全自动无人审阅的世界演化；
- 自研时间线剪辑器；
- 正文、设定和地图的多人实时编辑/CRDT；
- 公共插件市场；
- 同时接入所有视频供应商；
- 用向量数据库替代现有全部 context 逻辑；
- 为 UI 再增加第三套主题。

## 11. 成功指标

### 用户价值

- 新用户从创建项目到第一次有效冒险 <= 10 分钟；
- 从冒险片段生成可编辑章节草稿 <= 3 个明确动作；
- 从章节到首个可播放视频镜头 <= 10 分钟（不计供应商排队）；
- 80% 的跨页面流转通过引用完成，不需要复制粘贴；
- 用户能解释任一 AI 建议用了哪些设定和素材。

### 质量

- 地图 20 次连续 regenerate 成功率 100%；
- 历史/涌现事件重复率 < 10%，强上下文相关率 > 80%；
- 项目备份恢复对象计数与引用完整率 100%；
- 媒体任务刷新/重启恢复率 100%；
- 联机短断线重连后事件缺失率 0、重复副作用 0；
- 双客户端 5 轮冒险的正文与 runtime `seq` 一致率 100%；
- 角色基础事实冲突在写入前被检测或明确标记。

### 工程

- 新业务写入不再直接散落 localStorage；
- provider-specific 代码只在 adapters；
- `Writing.vue`、`ProseEssay.vue` 等主页面逐步降到 < 1500 行；
- 每个跨域对象都有 projectId、schemaVersion、sourceRefs 或明确不需要它们的理由；
- `docs/PLAN.md` 始终只指向一个 active master plan。

## 12. 下一步

立即执行顺序：

1. 用真实浏览器把地图、历史、冒险、刷新/回滚主线跑通，并完成 Worker 20 次压力指标；
2. 把控制权、角色状态、年代和下游 stale 标记补进因果报告；
3. 继续把地理/历史约束接到素材、写作、分镜的 `sourceRefs` 与 context ledger；
4. 先抽离共享图片 provider 与媒体资产目录，再在素材页落插画/漫画，禁止继续复制 `ImageGenRail` 或 `ProseEssay.vue` 的 fetch；
5. 以 MiniMax + `generic-async-http` 锁定异步视频 adapter，之后接第二个 direct provider；
6. 在 runtime event 契约稳定后实现 `/experience/online/:roomSlug`，首版只做房主权威的多人冒险，不扩成全应用协作；
7. 保留供应商账号、后端 API、WebSocket 反向代理和大媒体存储为独立部署前置，不在前端伪造完成。

第一张实施切片不再是地图生命周期，而是 `G3.1 / 地理-历史生产接线`；该切片已完成地图草案、显式写入、历史开局、PlaceEntity 和玩家历史 runtime 回流。当前切片应继续完成地点双向 UI、语义点审阅和受控世界状态/涌现调度，而不是回到地图引擎扩展。
