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

任务：

- 建立单一 prompt/task registry，消除 narrator prompt 副本；
- 统一 advisor 和 writing task taxonomy；
- 所有写作 agent 使用相同的 context envelope、token report 和 source refs；
- `worldbookBudgetGuard` 接入真实 `worldbookContextBuilder`；
- context ledger 对用户显示“使用了哪些设定/素材”，允许排除和固定；
- agent 返回 typed actions，正文替换、创建素材、更新大纲、生成分镜不再靠自由文本猜测；
- 将 `Writing.vue` 按 editor、outline、asset inbox、AI actions、persistence 拆成领域组件和 composable。

验收：

- 相同任务从不同入口得到一致的上下文结构；
- 用户可查看并撤销 agent 的每个写动作；
- 章节切换不会丢 debounce 窗口内的最后输入；
- 页面主文件控制在可审查范围，目标 < 1500 行。

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

当前状态（2026-07-19）：共享 provider、MediaAsset 和现有漫画页制作字段已贯通；M0-M1 完成。漫画已从单条素材的副工作台迁入独立 `/comics` 工作区，入口回到素材页副阅读台；左侧素材抽屉、中央页签/整页预览和右侧副阅读台检查器分栏显示，三联模式可携带当前素材往返相关素材、插画和漫画。每格通过 `continuityRefs` 选择自己的主要素材，选择动作不自动填充画面描述，页级来源仅做汇总。页级方向、画风/连续性、格级 beat、镜头和制作状态均有可见编辑入口，空白页真实支持 4/6 格。逐格生图已纠正为结合格级素材、页规则、当前镜头和上一格锚点的单幅无文字画面，提示中不再出现页码/格数，并强化禁止网格与文字；支持参考图的 provider 会复用上一格成图，MiniMax Image 按能力降级为文本连续性。M6 已完成基础文字对象、拖动/缩放、整页预览和 PNG 合成，但尾巴、字体、溢出/遮挡检查及完整出版导出尚未完成。这些都不等于 M2；下一步仍是多页改编候选与从角色、地点、已有插画建立的可审阅视觉圣经。

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
