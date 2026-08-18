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

#### G1.2.1 说明驱动世界书的联网研究

方向调整（2026-08-01）：结构化设定成为设定活动的默认主入口。一键 AI 已收缩为“创作基调初始化”，不再进入下述完整世界书研究链，也不生成具体实体；它只返回世界概述与创作规则字段，三条常驻基础约束由本地生成，创建后直接进入结构化设定。下述 M1-M3 作为按字段研究和证据审阅能力保留，后续接入地点、历史、制度等具体结构字段，而不是恢复一次性大包生成。

问题：旧链只有一次普通 JSON 生成。模型既不能确认用户说明里哪些部分需要外部资料，也没有来源、冲突或事实/创作边界；只靠模型训练知识会让真实历史、地理、制度和技术细节变得陈旧或空泛。

目标链路：

```text
用户说明
  -> 世界书 agent 判断是否需要外部依据
  -> （需要时）调用 web_search
  -> 受限 Search Gateway + 正文证据
  -> 工具结果回到同一临时 transcript
  -> 世界书 JSON（basis + sourceRefs）
  -> 来源/条目审阅
  -> 用户确认后写入 worldbook owner
```

**M1：可用 agent 研究闭环（已完成，2026-08-01）**

- 后端 `/api/research/search` 支持 Brave Search、Tavily 和由 `SEARXNG_BASE_URL` 固定配置的 SearXNG；Brave/Tavily 使用官方固定端点，不接受浏览器传任意 URL；每轮最多 4 个查询、每查询 6 项、总计 16 项，单查询 12 秒超时；
- 世界书生成复用 provider-neutral `agent-turn`，模型自行决定是否调用 `web_search`；工具调用、assistant 消息、tool result 和最终 JSON 保持在同一临时 transcript 内；
- `auto` 搜索渠道由服务端从已配置的 Brave/Tavily/SearXNG 中选择，页面不再暴露搜索渠道、API Key、查询数量或测试检索；工具协议不可用时回退普通 JSON 生成，不伪装为已完成研究；
- 搜索片段作为不可信数据，提示词明确禁止执行网页指令和复制长句；模型输出 `basis=research|mixed|creative` 与 `sourceRefs[]`，归一层只保留本次真实存在的 `S<n>`；
- 世界书保存 research manifest（provider、queries、sources、warnings、timestamp），条目只保存 sourceRefs 和 basis；服务端不保存世界书说明或搜索结果。

**M2：来源质量与正文证据（已完成，2026-08-01）**

- 为来源建立 domain signal、来源类型和质量标签；优先标记政府/军事、大学/学术文化机构与官方参考文档，标签只表达域名信号，不宣称事实已被验证；
- 新增 `/api/research/fetch` 受限正文抓取：只访问搜索结果中的公开 `http/https` URL，阻止 localhost、私网/保留地址、带凭据 URL、超过 3 次的重定向、超大响应和非文本 MIME；按 10 秒超时、1MB 响应和有限正文字符预算提取文本，不向模型提交 HTML/脚本；
- agent 工具自动尝试前 4 个来源的正文证据，失败来源保留搜索摘要并写入 warning；生成提示明确区分 `正文证据` 与 `搜索摘要`，世界书 manifest 保留该层级；
- 当前未把搜索摘要或网页正文自动升级为已核验事实，也未把网页内容当作指令执行。freshness、多语种查询策略、robots/caching 和正文段落级定位进入后续 M3/M4。

**M3：声明、冲突与内部审阅（M3a、M3b-1、M3b-2a 已完成）**

- **M3a（已完成，2026-08-01）**：生成结果归一为受限 claim ledger（`id/type/text/basis/sourceRefs/confidence/status`），冲突归一为两条声明之间的审阅关系；条目只保留存在的 `claimIds`，并把 `reviewState` 与研究快照关联；
- **M3a（已完成）**：研究 manifest 内部保留冲突声明、受影响条目和来源状态；排除来源会保留审计记录，将依赖声明标记为 `stale`，过滤条目的失效 `sourceRefs`；
- **M3b-1（已完成，2026-08-01）**：正文抓取结果拆为受限 `P<n>` 证据块；claim 增加 `evidenceRefs`，提示词要求声明指向正文块或明确的搜索摘要定位，来源预览显示可用定位；
- **M3b-1（已完成）**：研究快照生成稳定 `fingerprint/sourceFingerprint/claimFingerprint`，来源 URL、标题、正文、证据块、声明、输入说明或生成参数变化会标记旧预览为 stale，导入继续阻断；重新生成会建立新 revision；
- **M3b-2a（已完成，2026-08-01）**：内部研究服务保留单次定向补查、来源去重、正文定位和 revision 指纹能力；agent 首轮只允许有限工具轮次，不做无界搜索；
- **M3b-2b（当前方向调整）**：不继续扩展独立“资料检索”面板、渠道配置或人工查询工作流；若后续需要审阅，只新增最小的世界书条目级证据入口，不恢复独立检索区。

**M4：迭代研究与质量 Gate**

- 只在模型明确需要外部事实时调用 `web_search`，最多 2 个工具轮次、每轮单次查询和有限来源，不允许无界 Agent 搜索；内部记录查询数、来源数、耗时和错误，不把检索控制面暴露给用户；
- 建立历史城市、现实职业、硬科幻技术、纯架空世界和恶意网页片段五类 fixture；统计来源覆盖率、无效引用率、冲突发现率、创作/事实误标率和手工删改率；
- 真实渠道 Gate：无效引用率为 0，恶意网页指令采用率为 0；真实事实条目至少 80% 有可打开来源，纯架空说明不得被强行搜索结果污染。

渠道依据：[Brave Web Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get)、[Tavily Search API](https://tavilyai.mintlify.app/documentation/api-reference/endpoint/search)、[SearXNG Search API](https://docs.searxng.org/dev/search_api.html)。

#### G1.2.2 结构化设定生成链重构

**问题定性（2026-08-02）**

当前字段生成不是可靠的结构化生成，而是“普通文本请求 + XML 边界 + 正则过滤 + 全量重试”：

- 单字段可发送最多 28000 字符、生成 2400 token、等待 90 秒；解析失败后用同等输出预算从头再生成一次；
- 分区生成按 4-6 个字段串行调用，同一份世界书约束和原始资料被重复选择、序列化和发送；
- `<setting-content>` 只是一条提示词约定，模型可以漏掉闭合标签、先输出思考、只输出残片，或者在正文中回显任务说明；
- 普通 `/api/generate` 只向调用端返回正文和输入裁剪元数据，没有 `finishReason`、refusal、reasoning token、输出 token 和缓存命中，调用端无法区分截断、仅思考、协议不支持和真正的内容质量失败；
- 当前二次请求对所有“无效正文”一视同仁，不能保留整节中已合格字段，也不能根据错误原因选择修复动作。

该链路直接导致“慢”和“首轮无有效值”同时出现。后续不再把增加提示词、扩大 token、补正则或增加第二个校验模型作为主方案。

**目标形态**

```text
浏览器内当前 worldbook owner
  -> 客户端上下文编译器（确定性预算、来源引用、revision）
  -> POST /api/generate/structured
  -> 服务端固定 schema registry + provider capability resolver
  -> 原生 JSON Schema / 强制单工具 / JSON object 能力降级
  -> 分离 reasoning、refusal、finish reason 与 usage
  -> 本地格式校验 + 设定语义校验
  -> 字段级草稿与错误映射
  -> 用户审阅采纳
  -> 按稳定 section.field 引用 upsert 当前世界书条目
```

结构化生成只是世界书编辑器的受限生成操作，不是自主 Agent：普通字段不开放搜索、地图、历史或叙事工具，也不运行多步工具循环。只有字段明确进入 G1.2.1 的真实资料研究任务时，才在同一临时 transcript 中调用 `web_search`，研究结果完成后仍通过本节定义的结构化最终输出协议提交草稿。

**关键决策**

1. 直接替换现有 `<setting-content>` 主链，不做新旧双写、静默影子请求或长期 fallback；Git 负责回退。
2. 新建 provider-neutral 结构化生成契约，但复用 G4.6.13 的 URL 规范化、鉴权、能力缓存、响应解析、AbortSignal 和 typed provider error。
3. 服务端只接受 allowlist 中的 `schemaId`，不允许浏览器提交任意 JSON Schema；避免协议膨胀、缓存失效和任意工具定义。
4. 世界书仍由浏览器 localStorage owner 持有。客户端只发送本次生成所需的受限上下文包；服务端不保存世界书正文、资料摘录、API Key 或模型思考。
5. 模型返回只负责草稿内容，不负责产生保存状态、来源 ID、revision、字段标签或错误信息；这些均由本地确定性逻辑生成。
6. 整节默认一次请求返回全部字段。语义校验未通过时保留有效字段，只对失败字段发起一次选择性修复；不重跑整个分区。
7. 原生 schema、特定工具选择和 JSON mode 都不可用时明确返回“当前渠道不支持可靠结构化设定生成”，不再退回不可观测的 XML 文本猜测。

**协议与数据契约**

新增共享契约建议：

- `shared/structuredSettingContract.js`
  - 统一 `sectionKey / fieldKey / entryType / controlType / maxLength`；
  - 暴露 `setting-field.v1`、`setting-section.v1` 的 request/response 校验；
  - 前端 `settingPanelSchema.js` 改为消费共享定义，避免前后端字段表漂移；
- `shared/structuredGenerationContract.js`
  - 定义 provider、schemaId、context、target、options 和 result envelope；
  - 限制消息/上下文/字段数、输出长度、超时和 requestId；
  - 定义稳定错误码和不含正文的 metrics 元数据。

单字段请求：

```json
{
  "schemaVersion": 1,
  "schemaId": "setting-field.v1",
  "requestId": "...",
  "provider": { "id": "...", "baseUrl": "...", "apiKey": "...", "model": "...", "format": "..." },
  "target": { "worldbookId": "...", "worldbookRevision": "...", "sectionKey": "world", "fieldKeys": ["origin"] },
  "context": {
    "globalConstraints": "...",
    "confirmedSettings": "...",
    "currentValues": { "origin": "..." },
    "relatedEntries": [],
    "sourceExcerpts": [],
    "userBrief": "..."
  }
}
```

成功响应：

```json
{
  "schemaVersion": 1,
  "requestId": "...",
  "schemaId": "setting-field.v1",
  "mode": "native-json-schema",
  "drafts": { "origin": "可直接进入审阅的正文" },
  "fieldErrors": {},
  "meta": {
    "provider": "...",
    "model": "...",
    "finishReason": "stop",
    "latencyMs": 0,
    "attemptCount": 1,
    "inputChars": 0,
    "inputTokens": 0,
    "outputTokens": 0,
    "reasoningTokens": 0,
    "cachedInputTokens": 0
  }
}
```

分区响应仍使用同一 envelope，`drafts` 必须只包含请求中的字段键。Schema 约束所有请求字段存在且值为字符串；本地再按 `controlType` 校验内容形态。模型不得生成 `ok`、`warnings`、`sourceRefs` 或 UI 文案，以免把模型判断冒充系统状态。

**供应商能力矩阵与选择算法**

每个 `provider + normalized URL + model + protocol` 缓存以下能力：

- `nativeJsonSchema`：能否严格遵守指定 JSON Schema；
- `jsonObject`：能否至少返回 JSON object；
- `toolCalls`、`specificToolChoice`、`strictToolSchema`：能否强制单个提交工具及严格参数；
- `reasoningControl`：`none / split / unavoidable`；
- `finishReason`、`usage`、`cachedTokens`：响应是否可观测；
- `maxOutputTokens` 和已验证协议路径。

运行时只执行一条确定性选择链：

1. `nativeJsonSchema`：首选；服务端固定 schema 直接约束解码。
2. `specificToolChoice && toolCalls`：定义唯一的 `submit_setting_draft`，强制调用并读取参数；工具只作为结果提交边界，不执行副作用，也不进入 Agent 循环。
3. `jsonObject`：返回固定 `{ drafts: {} }`，进行严格 JSON 与字段 allowlist 校验；标记 `mode=json-object-fallback`。
4. 均不可用：typed unsupported error，UI 引导用户测试渠道或选择兼容模型。

协议细则：

- OpenAI Responses / Chat：优先 `json_schema`；读取 refusal、incomplete、finish reason 与 usage；
- Anthropic：支持时使用 `output_config.format`；thinking block 永不进入草稿解析器；首次 schema grammar 编译延迟单独记录，后续复用稳定 schema；
- MiniMax M3 Responses：显式 `reasoning: { effort: "none" }`，使用稳定 `prompt_cache_key`，读取 `output_text/status/incomplete_details/usage`；
- MiniMax M2.x：推理不可关闭，必须分离 reasoning；只有探测确认 schema 或可强制提交工具时才进入可靠模式，不能因为 `/models` 成功就宣称字段生成可用；
- 通用 OpenAI-compatible：对实际能力做小请求 probe，不按 provider 名猜测；400 只降级被拒绝的高级能力，401/403、限流和网络错误不得错误降级为“格式不支持”。

能力结果沿用现有缓存，但结构化能力与叙事工具能力分别记录，不能以 `toolCalls=true` 推导 `nativeJsonSchema=true`。连接测试增加一个最小 `setting-field.v1` probe，返回实际模式、延迟和失败步骤。

**上下文编译与质量约束**

将当前每字段重复执行的匹配与摘录改为“每次操作编译一次”：

- `globalConstraints`：世界概述、禁写、文风和常驻条目，建议上限 3000 字；
- `confirmedSettings`：目标字段之外的已确认结构设定，按当前分区优先，建议上限 4000 字；
- `relatedEntries`：按字段类型、关键词、稳定引用和同类条目排序，最多 10 条、建议上限 4000 字；
- `sourceExcerpts`：按来源 ID、关键词和段落评分选择，保留文档与段落引用，建议上限 4000 字；
- `currentValues + userBrief`：动态内容放在最后，建议上限 3000 字；
- 总上下文硬上限先设为 16000 字，并通过真实样本调整，不再默认放宽到 28000 字。

分区请求只选择一次共同约束和资料；字段特有约束以短对象附在 `targets[]` 中。静态指令、schema 和稳定世界前提置于前缀，当前字段、用户要求与 revision 置于末尾，提升 OpenAI/MiniMax 的前缀缓存命中率。缓存只复用 provider 侧 token 前缀，不在服务端保存用户正文。

输出预算按任务而非存储容量分配：

| controlType | 单字段目标 | 单字段输出预算 | 本地语义校验 |
|---|---:|---:|---|
| `textarea` | 200-600 中文字 | 800-1200 token | 完整句、非任务复述、不过度重复既有内容 |
| `chips` | 2-8 个对象 | 200-400 token | 每行单一对象、去重、名称非空 |
| `tags` | 3-10 个标签 | 120-240 token | 短标签、去重、无解释段落 |
| `list` | 3-8 条规则 | 300-600 token | 每行可检查规则、无空泛标题 |

整节预算按字段类型汇总并设置总上限，世界观/故事/创作规则通常不超过 2800 token，角色分区不超过 1400 token。`maxLength=2000` 继续只是编辑器存储上限，不能再直接成为模型默认写作目标。

**格式校验、语义校验与修复策略**

校验拆为两层：

1. 协议层：JSON 是否可解析、schemaId/字段键/类型/required/additionalProperties 是否合规、是否 refusal/length/incomplete。
2. 设定层：最小信息量、最大长度、控制类型格式、提示词回显、任务分析措辞、与硬约束的确定性冲突信号。

错误决策表：

| 错误 | 动作 |
|---|---|
| 网络断开、408、429、5xx | 同模式最多重试一次，使用短退避并保留 requestId 关联 |
| 原生 schema 参数 400 | 缓存该能力为不可用，降级到强制工具或 JSON object；不重复同参数 |
| `finishReason=length` / incomplete | 保留已通过字段，只缩小失败字段批次并降低目标长度重试一次 |
| refusal / content filter | 不重试，不显示或保存 reasoning，返回明确字段错误 |
| JSON 合法但部分字段语义失败 | 返回有效字段；失败字段组成一个修复请求，不携带无效原回复 |
| reasoning-only / 空正文 | 若有更低能力模式则降级一次，否则返回协议错误；不靠正则猜正文 |
| revision 已变化 | 丢弃到期结果并提示重新生成，不覆盖用户生成期间的编辑 |
| 用户取消 | AbortSignal 立即终止上游 fetch，结果不得进入审阅态 |

一次用户操作最多两次上游请求：首轮 + 一次有明确原因的修复或协议降级。禁止“格式修复一次、内容修复一次、网络再重试一次”的叠加式请求风暴。

**分区生成行为**

- 用户点击“生成本节”后只显示真实阶段：`整理约束 -> 请求模型 -> 校验草稿`，不伪造逐字段百分比；
- 首轮请求同时生成该节全部字段，使起源、地理、历史、势力和规则能互相约束；
- 当前已有内容作为修订基线进入 `currentValues`，schema 描述要求保留未被高优先级事实否定的内容；
- 返回后逐字段建立独立 draft/revision/source snapshot，全部保持待审阅；
- 有效字段立即可审阅，失败字段显示具体原因并允许单独补生成；
- 批量生成不在循环中把前一草稿当成已确认事实，也不提前 upsert 世界书。字段关系由同一次分区输出保证，只有采纳后的内容才进入下次操作的 confirmed context。

这会替换当前“前一个未审草稿约束后一个字段”的串行行为，避免早期错误级联污染整个分区。

**前端与服务端改动边界**

主要文件：

- `src/services/settingFieldGeneration.js`：改为上下文编译、请求构造、字段级语义校验；删除 XML 抽取和普通生成重试主链；
- `src/services/api.js`：增加 `sendStructuredGeneration`，透传 AbortSignal 和 typed error；
- `src/components/worldbook/StructuredSettingsPanel.vue`、`StructuredSettingsWorkspace.vue`：使用真实阶段状态、取消、部分成功和 revision 防覆盖；
- `src/components/worldbook/SettingDraftReview.vue`：展示字段级失败，不展示模型思考和原始 provider payload；
- `server/routes/structuredGeneration.js`：专用端点、请求校验、AbortController、错误映射；
- `server/services/structuredGenerationRunner.js`：模式选择、一次修复上限、metrics；
- `server/services/providers/*`：在现有 adapter 上增加结构化 request/response 组装，不复制鉴权和 URL 规则；
- `shared/structuredSettingContract.js`、`shared/structuredGenerationContract.js`：共享字段表、schema registry key、request/result envelope；
- `server/routes/generate.js`：只注册新路由；普通 `/api/generate` 暂不承担结构化字段协议。

G4.6.13 后续若引入 AI SDK，可让 `structuredGenerationRunner` 内部改用 `generateText + Output.object`，但本节不以新增 SDK 为前置条件，也不把 SDK 迁移和世界书字段修复绑成一次大改。

**实施阶段**

**S0：基线与失败分类**

- 冻结当前 XML 完整、缺闭合标签、reasoning-only、单字残片、合法 JSON、截断、refusal、MiniMax 分离/未分离 reasoning 的脱敏 fixture；
- 记录单字段和世界观整节当前请求数、输入字符、首轮有效率和耗时作为 before baseline；
- 给现有失败统一归类，不再只有“AI 未返回可用设定草稿”。

验收：至少能稳定复现用户遇到的三类失败；fixture 不包含 API Key 和真实世界书正文。

**S1：共享字段与结构化协议**

- 建立共享字段定义、两个 schemaId、request/result validator 和 typed error；
- 服务端拒绝未知 schema、额外字段、超限上下文和不属于目标分区的字段键；
- 保持现有 localStorage worldbook schema 与 `section.field` 稳定引用不变，不做数据迁移。

验收：字段表前后端单一来源；非法请求在访问模型前失败；不增加新的世界书存储 owner。

**S2：Provider 结构化适配与能力探测**

- 完成 OpenAI Responses、OpenAI Chat、Anthropic 和 MiniMax M3 Responses 结构化请求；
- 扩展 probe/cache/downgrade，加入 schema、specific tool choice、reasoning control 和 usage；
- 所有 adapter 输出统一的 `draft payload + finishReason + usage + refusal + mode`，reasoning 独立丢弃。

验收：fixture 覆盖四协议、400 降级、401/403 不降级、length、refusal、reasoning-only；probe 不读取用户世界书。

**S3：单字段主链替换**

- `generateSettingFieldDraft` 切换专用端点；
- 移除 `<setting-content>` 依赖、可见思考正则和普通文本全量重试；
- 接入实际取消、revision 防覆盖、字段格式和信息量校验；
- UI 显示 typed error 与当前实际模式，不暴露原始思考。

验收：100 个 fixture/模拟返回中思考泄漏为 0；一次成功只发 1 个请求；取消后不产生草稿。

**S4：整节单请求与部分修复**

- 分区生成改为一次 `setting-section.v1`；
- 逐字段返回 draft/error，保留有效兄弟字段；
- 只对语义失败或截断字段组成一次选择性修复请求；
- 删除串行草稿累积逻辑和 cooperative-only abort。

验收：世界观六字段正常路径只有 1 次请求、最坏不超过 2 次；一个字段失败不丢失其他五个；生成期间手动编辑不会被旧结果覆盖。

**S5：上下文预算与缓存友好编排**

- 将匹配、原文摘录和结构摘要提升到操作级缓存，按 worldbook revision + section + brief fingerprint 失效；
- 固定前缀/动态后缀排序，MiniMax M3/OpenAI 发送稳定 cache key；
- 记录但不持久化输入字符、token、cached token 和裁剪 warning；
- 用空世界书、长小说资料、已有 50+ 条目和冲突硬约束四类样本调预算。

验收：相同整节不重复计算六次摘录；上下文不超过 16000 字；裁剪优先丢低相关来源，不丢硬约束和当前内容。

**S6：UI 状态、错误恢复与文档**

- 生成状态改为阶段状态，加入取消和字段级失败重试；
- 连接测试显示“文本可用 / 结构化设定可用 / 实际模式 / reasoning 状态”，不把模型列表成功等同于生成可用；
- 更新本 workflow，移除 XML 行为说明，补充渠道兼容性和隐私边界；
- 保持主题1冻结，只保证共享交互不回归；主题2不在本阶段重做视觉结构。

验收：错误能够区分超时、限流、格式能力不足、截断、拒绝、过期和取消；无技术栈泄漏式错误；键盘和窄屏可以取消与审阅。

**S7：真实渠道 Gate 与旧链清理**

- 使用当前保存配置对 MiniMax M3 Responses、一个 OpenAI-compatible 和一个 Anthropic-compatible 渠道分别执行单字段 10 次、整节 5 次；
- 清理生产链中的 XML 输出协议、解析器调用和已无调用的 retry attempt；历史 XML parser 只在兼容 fixture 完成迁移后删除，本地 reasoning/prompt-echo 校验保留为最终正文安全阀，不再作为传输协议；
- 不删除通用 `generationRetry`，其他普通 JSON 任务仍可独立使用；
- 完成代码、文档、浏览器与隐私审计后再标记本节完成。

量化 Gate：

- 原生 schema 渠道首轮协议有效率 100%，首轮可审阅内容率至少 95%；
- JSON object fallback 首轮可审阅内容率至少 90%，否则该渠道标记为不支持字段生成；
- 思考、提示词和 XML marker 泄漏率 0；
- 单字段正常请求数 1，整节正常请求数 1，任一操作上游请求数不超过 2；
- 相比 S0，整节 P50 总耗时至少下降 50%，P95 不超过 45 秒；
- 取消后 1 秒内前端结束等待，服务端上游请求实际 abort；
- 采纳前 worldbook/entries 不变化，过期 revision 不覆盖新编辑；
- metrics、日志和错误响应不包含 API Key、完整上下文、资料正文或模型思考。

当前执行状态（2026-08-02）：S0-S6 与 S7 revision 防覆盖/生产 prompt 清理代码切片已完成；`npm run smoke:structured-settings -- --dry-run` 已覆盖本地三协议夹具，但只会报告 `fixtureReady`，不能替代真实发布门禁。真实三渠道 Gate、性能统计与历史 fixture 最终清理仍未执行。

**S8：结构化设定草稿的局部意见修订（已完成）**

问题定义：当前结构化设定只有“采纳 / 丢弃 / 手动改文本”，用户无法表达“保留其中一部分、反对另一部分、按意见重新组织”。如果把 AI 修改直接塞进条目管理，正式条目、结构化字段和未采纳草稿会出现第二套状态；如果把 Agent 做成独立聊天，又会丢失当前字段、差异和 revision。因此修订动作的入口固定在 `SettingDraftReview`，生成能力复用结构化 provider runner，正式写入仍只经过现有采纳路径。

目标交互：用户在单字段 AI 草稿中填写修改意见，例如“保留潮汐和旧灯塔，删除神明设定，补充三个历史阶段”，点击“按意见修订”；系统把当前正式字段、当前草稿、已确认结构化设定、相关条目、原始资料和意见送入设定 Agent，返回同一字段的完整新草稿。新草稿仍停留在审阅态，显示相对于上一版本的差异，用户可在多个修订版本间回看、撤销、继续修改，只有“采纳到世界书”才 upsert 正式条目。

契约与状态：

- 新增 `setting-revision.v1`，目标仍只能是一个 `section.field`；响应只能包含该字段的完整正文，不返回 patch 指令、不直接写 worldbook、不返回思考过程。
- 修订请求明确分层 `authoritativeContent`（正式字段）、`draftContent`（待审草稿）、`previousVersions`（当前版本之前的有限历史版本）、`revisionInstruction`（用户意见）、`keepFacts`（用户明确保留的事实）和 `rejectFacts`（用户明确反对的内容）；当前草稿和本次意见优先，历史版本只用于找回事实，模型不能因意见改写更高优先级的硬约束。
- 草稿记录 `draftId`、`parentDraftId`、`revisionNumber`、`sourceDraftHash`、`worldbookRevision`、`revisionInstruction` 和 `content`。同一字段只能有一个当前审阅版本，旧版本可回退但不能覆盖正式条目。
- 修订期间字段或世界书发生变化时，结果标记 stale 且不进入当前草稿；失败、取消、超时不会丢失上一版；修订中的意见和草稿只保存在浏览器本地草稿存储，不进入 metrics、日志、联机广播或条目正式内容。

实现拆分：

- S8-A 契约：扩展 `shared/structuredSettingContract.js` 与 `shared/structuredGenerationContract.js` 的 schema、上下文和错误边界；新增可复用的修订请求构造/哈希函数，保持 `setting-field.v1` 与 `setting-section.v1` 兼容。
- S8-B 服务：在 `src/services/settingFieldGeneration.js` 新增 `generateSettingDraftRevision()`，沿用 `/api/generate/structured`、能力缓存、最多两次请求和 revision guard；修订 prompt 必须给出正式字段、当前草稿、意见和锁定事实的优先级，不允许复用快速导入 Agent 的整库写入逻辑。
- S8-C UI：在 `src/components/worldbook/SettingDraftReview.vue` 增加意见输入、按意见修订、版本导航、撤销当前修订和状态反馈；在 `StructuredSettingsPanel.vue` 管理修订 AbortController、版本链、草稿恢复和 stale 判断。`WorldBookEditor.vue` 不增加 AI 修订入口，只继续提供条目人工维护。
- S8-D 验证与文档：在既有 `agentContracts` / `worldBookQuickImport` 用例中加入契约、保留/反对意见和修订上下文断言，不增加测试 item；已完成 1440/390 主题2审阅区 smoke、真实浏览器修订/回退 smoke、`verify:full` 和脱敏检查。

失败与安全门槛：

- 空意见、只有空白或超过 1600 字直接在浏览器拦截，不请求模型；修订必须绑定一个当前草稿，不能对正式字段直接执行隐藏写入。
- 上游返回未知字段、思考文本、prompt echo、空正文或超长正文时，整版修订失败，上一版保持可用；不能把部分 payload 当成完整修订采纳。
- 用户点击“采纳”时同时校验 `worldbookRevision` 与 `sourceDraftHash`；任一过期都提示重新修订，不覆盖用户新编辑的字段。
- 验收标准：保留/删除/新增意见能够体现在新草稿中；正式条目在点击采纳前完全不变；撤销恢复上一版；刷新后未采纳版本仍可审阅；取消后 1 秒内结束等待；主题2窄屏无溢出；总测试项保持 200。

**测试与验证**

- 测试总量继续保持核心 188 + 视觉 12 = 200，不新增 test item；在现有 `agentContracts`、`integration` 和 worldbook 测试项内使用 table-driven cases 替换低价值重复断言；
- 聚焦验证覆盖 contract、四类 adapter、能力降级、partial repair、abort、revision、localStorage owner 和稳定条目引用；
- 浏览器验证 `/settings/structured` 的单字段、整节、取消、部分失败、采纳、刷新恢复，视口为 1440 / 760 / 390；
- `npm run verify:full` 必须通过；不启动或重启用户已有服务；
- 真实 provider smoke 单独记录 provider/model/protocol/mode/latency/usage，不保存正文和 Key。

调研依据：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)、[OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)、[Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)、[MiniMax Responses API](https://platform.minimaxi.com/docs/api-reference/responses-create)、[MiniMax Prompt 缓存](https://platform.minimaxi.com/docs/api-reference/text-prompt-caching)、[MiniMax 工具使用与交错思维链](https://platform.minimaxi.com/docs/guides/text-m3-function-call)。

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

执行进度（2026-08-01）：presentation schema 升至 v3。确定性 fallback 只把纯台词或明确说话结构归为 dialogue，混合叙述只对引号内文本做行内渲染；短对白、弯单引号、书名式双引号、CRLF、轻微 marker 偏差和代码围栏均纳入兼容。生成侧参考 SillyTavern 的 Main Prompt、Example Messages 与近末轮 Author's Note 分层，使用长期行文契约 + 最近正文样本 + 本轮注释，抑制复述、情绪总结、均匀感官罗列和无因果危机。M5 增加模板句率与手动编辑率指标，不以单次主观样例宣告文风完成。

#### G1.4.10 体验页叙事排版二次收口（2026-08-08，R2 执行中）

这一阶段不再修改 `presentation v3` 的事实契约，也不把体验页改回聊天气泡。目标是把已经能区分叙述、对白、动作、心理和系统信息的 renderer，从“许多样式同时生效”收口成一套适合连续中文阅读的排版系统：正文优先、角色清楚、交互可达、长会话不疲劳。

##### A. 市场调研结论与 Pinax 取舍

| 参考对象 | 值得吸收 | 不应照搬 |
| --- | --- | --- |
| Apple Books / Kindle | 阅读外观入口隐藏在 `Aa`；字号、字重、行距、段距、页边距、对齐与主题作为一组偏好；宽屏仍控制正文行长 | 双页翻页、出版物固定分页不适合实时增长的会话流 |
| Readium CSS | 用 CSS variables 分离基础字号、行高、段距、首行缩进和用户覆盖；阅读主题是参数组合，不改正文数据 | 不引入 EPUB pagination、publisher stylesheet 覆盖和整套 Readium 依赖 |
| SillyTavern Document mode | 保留稳定的消息壳、编辑、重生成和候选能力；隐藏重复头像、名称、时间与旧消息操作，正文成为第一视觉层 | 不复制头像墙、插件面板密度、气泡色和每条消息右侧整排操作 |
| 微信读书 / Kindle 中文阅读样本 | 单一正文字体、稳定基线、克制颜色、进度与工具退到边缘；长时间阅读依靠字号和节奏，不靠语义彩虹 | 体验页仍是互动叙事，不能把玩家回合和角色来源全部抹成无来源小说 |
| Disco Elysium 等叙事游戏 | 强说话者入口、选项与正文明确分层，短回合扫描很快 | HUD 式固定窄栏、全大写标签和高频技能色不适合 Pinax 长回复 |
| W3C CLReq / WCAG / USWDS | 中文标点与缩进按中文习惯处理；允许 text-spacing 覆盖；长文本控制 measure，英文通用建议为 45-90 字符、约 66 字符为常见目标 | 不把西文词距和字符数机械当作中文成书规范；最终以中文实测行长为准 |

调研来源：

- Apple Books 外观设置：`https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/mac`
- Kindle 文本显示设置：`https://digprjsurvey.amazon.com/csad/help/node/T5Y94BzSCGwm0vd75W`
- Readium CSS variables：`https://readium.org/css/docs/CSS19-api.html`
- SillyTavern 本地源码：`/home/recoletas/jiuguan/SillyTavern/public/style.css` 与 `public/css/toggle-dependent.css`
- W3C 中文排版需求：`https://www.w3.org/TR/clreq/`
- WCAG 2.2 Text Spacing：`https://www.w3.org/WAI/WCAG22/Understanding/text-spacing`
- USWDS Typography / Measure：`https://designsystem.digital.gov/components/typography/`

Pinax 的定位固定为：

> **连续叙事阅读面 + 可追溯的酒馆回合壳。**

普通正文无框、无气泡、无整段底色；角色、回合和机制只通过有限的排版信号出现。主题2 `legacy` 是本轮视觉目标，主题1 `kao` 冻结，只做共享行为回归保护。

##### B. 当前实现审计

2026-08-08 使用现有 `5173` 服务运行 `regular / long × 1440 / 980 / 760 / 390` 共 8 张主题2截图，0 个非预期 console error。截图和报告位于 `/tmp/pinax-experience-type-audit/`。结构稳定，但排版存在以下根因：

1. `readingProfileVars` 已声明 `--experience-measure: 60-68em`，正文规则却使用 `max-width: none`，因此阅读列宽设置完全没有生效；宽屏只是在更宽的工作面里继续拉长行。
2. 默认正文写成 `17px`，但全局 UI 默认 `zoom = 0.85`，最终物理显示约为 `14.45px`。阅读字号和工具缩放被错误绑定，用户把界面缩小后正文也一起变小。
3. `.prose / .narrative-block / .rp-*` 同时散落在 `Experience.vue`、`GamePanel.vue`、`NarrativeTurn.vue`、`legacy.css` 和 `kao.css`，相关命中约 248 行。页面级高 specificity 覆盖主题级规则，当前值很难从任一文件单独判断。
4. 一段对白可能同时命中 `narrative-block--dialogue` 和 `.rp-dialogue` 两层斜体、字重与颜色；动作、心理、world intro 也都使用斜体，导致不同语义反而看起来相似，整页斜体密度过高。
5. `.prose__body` 使用 `2em` 缩进，dialogue/action/thought 又分别重置缩进和添加左 margin；turn gap、block gap、role gap 叠加后，段落节奏没有单一 owner。
6. 地点正则会把每次“来到/进入/穿过……”后的片段都渲染成粗体蓝色点线。重复地点在一个长回复中每次都强调，形成用户此前指出的“大量相同蓝色渲染”。
7. message speaker 与 block speaker 可能同时出现；纯叙述开头还可能显示“旁白”。角色身份并不一定更清楚，反而增加重复标签。
8. 当前 `long` 审计 fixture 由编号短句反复拼接，能发现滚动和溢出，却不能代表真实 AI 的长自然段、叙述夹对白、多人轮换和密集实体文本，视觉门禁覆盖不足。
9. 移动端阅读本身可达，但底部 tip/通知和输入区会同时争夺最后一屏；操作菜单与文字选择也缺少专门的碰撞验收。

##### C. 可验证硬约束

1. 普通叙述、对白、动作和心理都不得使用卡片、聊天气泡或整段背景；只有系统、错误、压缩完成和明确机制结果可以有克制承托面。
2. 主题2标准档正文的**最终物理字号**目标为桌面 `17-18px`、移动端 `17px` 左右；全局 UI zoom 在 `1 / 0.95 / 0.9 / 0.85` 之间变化时，正文不得跌破 `16px`。
3. 桌面标准档完整行以约 `52-66` 个中文全角字为目标，紧凑档上限约 `68`，舒展档约 `48-58`；不得重新缩回 720px 窄列，也不得在 1440px 工作面里留下无意义的大块断裂空白。
4. 一个普通文本行最多同时出现“正文基线 + 一种语义强调 + 一种真实交互提示”三层信号；颜色不能代替角色名，也不能为每次地点命中重复染蓝。
5. 纯叙述不显示“旁白”；玩家 turn 只在组首显示一次身份；明确角色 speaker 只在对白组首显示一次；message 级与 block 级 speaker 不得重复。
6. 双引号对白继续保留现有斜体特征；嵌套单引号、书名式引语可以温和分色，但不得全部同色、不得使用玫红、不得改变字号。
7. 普通对白仍不可点击。只有真实 `mechanismTrigger` 可以交互，并使用一个紧邻文本的矿物黄/钢青小标记表达，不恢复细线、按钮框或整句蓝底。
8. 编辑、删除、重写只属于 turn；桌面 hover/focus 与移动端主动点按都能稳定触达，文字选择期间不得抢走 selection 或让按钮消失。
9. 阅读设置只改变 CSS variables 与本地偏好，不修改 message、presentation、联机事件或模型上下文。
10. 主题1截图不得发生排版重设计；主题2在 `1440 / 1280 / 980 / 760 / 390`、长短会话、四档 UI zoom 下无截字、横向滚动、输入遮挡和通知覆盖末条正文。

##### D. 目标排版系统

**阅读几何：**

| 档位 | 最终物理字号 | 行高 | 正文 measure | block gap | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| 紧凑 | `16-16.5px` | `1.62-1.68` | `64-68em` | `0.42-0.5em` | 快速回看、短屏幕高度 |
| 标准 | `17-18px` | `1.74-1.82` | `60-64em` | `0.62-0.72em` | 默认长时间阅读 |
| 舒展 | `18-19px` | `1.88-1.96` | `54-58em` | `0.86-0.96em` | 大屏或低视觉压力 |

- `measure` 约束 `.prose-reading-plane`，不约束整个 `.ws-center-stage`；工作面继续铺满中间区域，正文在其内部保持适宜行长。
- 1440px 常见布局下标准档接近铺满主区，不重新制造过去的窄列；只有超宽屏才出现有意的阅读留白。
- 新增 `--app-ui-zoom` 数值变量。正文 CSS size 使用 `目标物理字号 / uiZoom` 反补偿，输入正文同步保持不低于 `16px`，工具栏仍跟随全局缩放。
- 中文正文默认左对齐，不强制浏览器两端对齐；禁止通过任意 `letter-spacing` 拉开中文正文。

**语义层级：**

| 内容 | 目标表现 |
| --- | --- |
| 叙述 | `var(--font-body)`、正常字重、稳定段距；自然段可首行缩进，但场景首段、speaker 后首段和短段不缩进 |
| 玩家行动 | 组首显示玩家名 + 一条短暖色 source signal；正文略深字重，不整体染色、不整体左移 1.5em |
| 角色对白 | speaker 使用 12-13px sans、只出现一次；引号正文保持 body 字体、轻斜体和约 500 字重，不额外包框 |
| 动作 | 正常体或极轻墨色差，用前后节奏区分；不再与对白、心理一起全斜体 |
| 心理 | 保留轻斜体和次级墨色，但对比度不得低于正文可读阈值 |
| 场景边界 | 一次垂直留白 + 短标题/符号；不画横贯工作面的重装饰 |
| 系统/压缩/错误 | 允许小面积承托面，与普通正文完全分流 |

**行内强调预算：**

- 正则推断的地点与时间只做低对比语义提示，不使用粗体蓝色点线；同类型、同内容在一个 turn 内只强调第一次。
- 有真实详情可打开的物品才保留可点击表现；没有实体引用的文本不得伪装成链接。
- `mechanismTrigger` 在对白末尾增加小型可聚焦标记，标记本身持有 tooltip/ARIA，正文不变成按钮。
- 嵌套引语用现有三组温和 token，但颜色差异控制在正文附近，斜体特征由外层对白继承。

##### E. 文件责任重排

**新增：**

- `src/styles/experience-reading.css`：主题2正文几何、turn/block rhythm、speaker、行内语义和响应式的唯一视觉 owner；所有规则以 `.theme-legacy .game-page` 为边界。
- `src/composables/useExperienceReadingPreferences.js`：三个阅读预设、localStorage、UI zoom 反补偿和 CSS variable 映射。
- `src/services/narrativeReadingLayout.js`：纯函数负责 turn speaker、block group、重复语义强调预算和场景断组；不修改 presentation 数据。

**修改：**

- `src/pages/Experience.vue`：接入 reading composable，把顶栏 select 收为现有图标体系下的 `Aa`/文本外观 popover；移除页面内 prose/rp 排版规则，只保留页面布局与工作面尺寸。
- `src/components/GamePanel.vue`：增加 `.prose-reading-plane`，只负责滚动、消息循环、编辑委托和点击委托；删除迁移到专用样式文件的主题2排版，保留主题1现状。
- `src/components/experience/NarrativeTurn.vue`：输出明确的 turn/group data attributes；操作菜单保持 turn owner，文字选择与移动点按状态稳定。
- `src/components/experience/NarrativeBlock.vue`：按 kind 使用语义段落结构，speaker 与 trigger marker 有独立可访问节点；不在模板中决定颜色。
- `src/services/rpTextRenderer.js`：接收 inline decoration policy，区分推断提示、可点击实体与机制触发；去掉重复地点/时间的高强度输出。
- `src/styles/themes/legacy.css`：删除已迁入 `experience-reading.css` 的旧 Experience prose/rp 重复规则，只保留主题 token 和其他页面规则。
- `src/stores/themeStore.js`：在 `<html>` 同步 `--app-ui-zoom`，供阅读面和视口反补偿共用，不让组件读取 DOM dataset 猜缩放。
- `scripts/ui-audit.mjs`：把 Experience long fixture 换成真实中文长自然段、多人对白、动作/心理、重复地点、嵌套引语和机制触发；报告加入物理字号、行高、measure、每行估算字数、强调字符比例与末条正文/输入区间距。

**测试更新但不增加测试 item：**

- `src/__tests__/integration.test.js`：现有 narrative renderer table 增加纯叙述无“旁白”、speaker 去重、普通对白不可点击、重复地点只强调一次、trigger marker 可聚焦。
- `src/__tests__/visual-verification.test.js`：替换现有 Experience 视觉基线，不新增第 13 个视觉用例。
- 必要时在现有 UI 契约测试内部替换旧 selector 断言，不新建以 CSS 字符串为主的大测试文件。

##### F. 分阶段执行计划

**R0：真实基线与 1440px 样板，0.5 天**

1. 固定 6 组内容样本：长叙述、双人对白、叙述夹对白、动作/心理、重复地点/时间/物品、系统/机制消息。
2. 在 `1440 × 900`、主题2、UI zoom `0.85 / 1` 下记录当前物理字号、正文宽度、首屏行数、强调比例和截图。
3. 只在静态 prototype 中验证三套正文几何与两套 speaker 方案，不先改所有视口。
4. 用户确认标准档的字号、行长、speaker 和对白节奏后才进入 R1；未确认时只迭代这一张代表截图。

门禁：用户能在一屏内快速指出玩家、叙述和角色对白；正文不显小；没有大面积蓝色、斜体墙或重新出现的窄列空白。

**R1：样式 owner 与字号/行长收口，1 天**

1. 建立 `experience-reading.css` 和 reading preferences composable。
2. 将主题2 prose/rp 规则从三个 owner 迁出，逐项删除重复规则并做 computed-style 对照。
3. 接入 `--app-ui-zoom`，验证四档 UI zoom 下物理字号稳定。
4. 让 `--experience-measure` 真正约束阅读面，并保留宽工作台构图。

门禁：同一视觉属性只有一个 theme2 owner；`0.85` zoom 下标准正文不低于 `16px`；1440px 标准档行长落入约 52-66 个中文字符。

**R2：turn/block 节奏与角色识别，1-1.5 天**

进度（2026-08-09）：已移除纯叙述的“旁白” turn 署名，玩家 turn 只在组首显示身份；明确角色继续由 block speaker 署名。主题2阅读面已取消玩家正文额外横向缩进，动作回正体、心理保留轻斜体，叙述缩进只由 narration block owner 决定。R2 的跨 turn speaker group 与真实会话截图仍待继续验收。体验页半自动恢复持续推进，但每拍走独立 `auto` 模式并以最近正文末句为唯一连续锚点，禁止无因果回带较早人物、物件和线索，可随时停止。

1. 用 `narrativeReadingLayout` 统一 scene、role、speaker 和时间断组规则。
2. 纯叙述隐藏“旁白”；玩家与明确角色仅在组首署名。
3. 消除 message speaker 与 block speaker 双重显示。
4. 只保留对白/心理需要的斜体，动作回到正常体；统一 turn gap 与 block gap，删除 margin 叠加。
5. 场景首段、speaker 后首段、短玩家行动和普通叙述分别执行明确缩进规则。

门禁：一条含两名角色、两段叙述、动作和心理的回复，角色切换在 3 秒内可扫描；同一角色名不连续重复；整页不呈现同一种斜体。

**R3：行内语义与消息操作降噪，1 天**

1. 给 rp renderer 增加来源/交互等级和 turn 内去重预算。
2. 推断地点/时间降为低强度，只有真实详情和机制触发保留交互暗示。
3. trigger 改为紧邻对白的小标记，普通对白完全无 pointer/click handler 视觉。
4. turn 操作按钮只在 hover、focus、open 或移动端主动选择时出现；扩大命中区但不侵入正文列。
5. 文字选择期间冻结操作显隐，编辑态保留选区与清晰的保存/取消位置。

门禁：重复地点十次只强调第一次；普通对白点击无副作用；trigger 可由鼠标、键盘和触屏打开；编辑/删除/重写不再因 hover gap 消失。

**R4：阅读外观入口与响应式，1 天**

1. 将顶栏常驻 select 收入一个阅读外观 popover，保留紧凑/标准/舒展三预设和恢复默认。
2. 980/760px 保持单一阅读 scroll owner；390px 去掉对白额外左移，speaker 与正文使用完整可用宽度。
3. 校验 TipBanner、通知、输入区、Agent 状态和最后一条正文的垂直避让；任何 fixed 层不得覆盖可读正文和发送动作。
4. 处理 `prefers-reduced-motion`、200% browser zoom、WCAG text-spacing override 和长英文/URL/CJK 标点换行。

门禁：五个代表视口无横向滚动、截字和覆盖；阅读 popover 可用 Escape 关闭并归还焦点；刷新后偏好恢复但不改变 session。

**R5：真实会话验收与收口，0.5-1 天**

1. 使用至少 6 个现有真实 session，不用编号重复句代替内容；覆盖古风、现代、科幻、多人对白和长段落。
2. 运行 `regular / long × 1440 / 1280 / 980 / 760 / 390 × zoom 0.85 / 1` 截图矩阵；对中间 zoom 档做 computed metrics，不必全部截图。
3. 双浏览器联机确认房主与成员使用同一 renderer，成员聊天不进入正文排版。
4. 运行完整构建、现有核心测试、12 个视觉测试和 diff check。

验证命令：

```bash
UI_AUDIT_ROUTES=experience UI_AUDIT_STATES=regular,long UI_AUDIT_WIDTHS=1440,1280,980,760,390 node scripts/ui-audit.mjs
npm run verify:full
```

发布门槛：

- 标准档正文最终物理字号符合门槛，四档 UI zoom 无“界面偶尔整体变小”回归；
- 行长、行高和段落节奏在长会话中稳定，滚动 10 分钟后仍能快速找到上一轮玩家行动和当前角色；
- 普通 turn 无框、普通对白不可点击、机制触发清楚但不密集；
- 强调字符比例在普通 turn 中原则上不超过约 15%，重复实体不重复强调；
- 主题2截图由用户确认，主题1代表截图无意外重排；
- `verify:full` 通过，不新增自动化测试总数。

回退边界：专用 stylesheet、reading composable 和 reading layout 都是表现层；任何阶段失败都可回到现有 `presentation v3 + content`，不迁移或改写历史消息，不影响上下文、记忆、联机和模型生成。

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

### G1.6 块级写作 Notebook 与边注审阅系统（2026-08-10，计划完成）

当前进度（WNB-1、WNB-2、WNB-3 当前候选闭环和 WNB-4 场景/跨块批注/多块候选/章节审稿阶段已完成）：WNB-0 数据契约、6 组真实章节 fixture、Markdown 往返、100k 中文章节测量和隔离 Vue/Tiptap editor spike 已完成；章节现在通过 `useWritingDocument` 加载/保存 `chapter.editorDocument`，同时保留 Markdown 投影。`Writing.vue` 只挂载单一 `WritingNotebookEditor` 实时编辑面，不再保留源码/阅读模式切换；选区、基础格式、分隔线、取名、查找/替换、右键操作和内联补全输入均已通过 editor bridge 接通。写作页独立顾问入口、浮动顾问和顾问面板已移除，批注、改写候选、章节审查和版本检查器成为唯一审阅入口；块使用无卡片浅色轨道和当前块高亮。WNB-2 的 `writingAnnotations` sidecar 已按 `blockId + TextPosition + TextQuote` 重定位选区：前文插入/块移动保持 ID，拆分生成共享 `parentId` 子批注，合并重新绑定，删除或无法唯一匹配时进入 orphan。WNB-3 新增共享候选契约和改写检查器：最多三个候选、原文/候选 diff、锁定片段保留校验、chapter/document/block revision stale gate，以及 Notebook 单 transaction 采纳和撤销。WNB-4 已完成场景数据过滤、跨块批注、多块候选和章节审稿，候选和审查不会直接覆盖正文。WNB-5 已完成版本、恢复和质量 Gate；当前进入 WNB-6 的常用 Markdown、多片段批注与查找同类。

当前 UI 收口补充：正文选区统一为主题蓝色，实时编辑面在选区光标收束端显示“批注 / 素材”浮条，并处理应用 zoom 与视口翻转；顶栏只在原始 Markdown 辅助模式保留对应入口。新批注输入和已保存批注都在右侧边注轨道按 DOM 选区中点定位，并对相邻边注就近避让；不再向段落插入 widget，也不在检查器底部弹出输入卡。块/场景/全章过滤与解决/恢复状态入口已删除；批注只保留原位编辑、按批注改写和级联删除，采用改写后同步删除来源批注。旧 `parentId` 回复折叠为补充记录，版本默认只显示最近三份检查点。窄屏没有足够边栏空间时检查器成为正文后的顺序列表。

#### G1.6.1 产品决策

写作页采用“连续小说稿 + 隐形写作单元 + 右侧边注检查器”，吸收 Notebook 的稳定 cell、显式拆分/合并和候选审阅，但不引入 Python kernel、执行计数、输入/输出框或 `.ipynb` 文件格式。排版段落不是写作单元：一个写作单元可包含多段正文，正文仍是一篇连续稿件，不变成卡片墙；单元边界只在悬停、聚焦、批注或 AI 修改时显现。

公开的最小结构只有：

- `prose`：普通正文段落，也是首版 AI 修改的最小原子；
- `scene-heading`：场景边界，可携带地点、时间、POV、出场角色、目标和结果；
- `divider`：无标题转场或时间跳跃；
- `author-note`：作者备注，不进入出版正文，但可作为当前场景的 AI 约束；
- `source-reference`：素材或世界书来源引用，默认折叠且不进入出版正文。

对白、心理、动作不拆成专有块，仍属于小说正文。首版只允许单块替换和光标插入；跨块改写必须等稳定锚点、批注重定位和单块 stale gate 全部通过后再开放。

#### G1.6.2 调研结论与取舍

| 参考对象 | 采用 | 不采用 |
| --- | --- | --- |
| Jupyter / nbformat 4.5 | 每个 cell 有稳定唯一 ID；块可移动、拆分、合并；内容与块元数据分离 | 命令/编辑双模式、运行按钮、kernel、输出区、代码式边框 |
| VS Code Notebook AI | AI 修改按 cell 定位；候选可逐项 Keep/Undo；一次 AI 操作形成可撤销单元 | 常驻聊天面板、面向代码的 agent 工具和执行状态 |
| Quarto margin column | 正文和页边信息使用不同列；边注不污染正文；窄屏时边注离开固定 margin | 固定出版页几何和脚注编号体系 |
| Cornell Notes | 主体内容旁保留问题、提示和反思区域 | 教学用“线索栏 + 页底总结”的固定纸面比例 |
| Scrivener Inspector | 检查器跟随当前文档；支持固定 inspector；笔记、元数据、快照、评论分区 | 把每个段落变成 Binder 文件，或复制其拟物界面 |
| Notion comments | 块级和选区级评论；Default/Minimal 两种显示密度；评论状态可解决/恢复 | 所有段落常显块柄、斜杠菜单和数据库式卡片语言 |
| Word / Google Docs review | 修改与评论分离；建议必须接受或拒绝；可顺序导航未处理修改 | 把正文长期染成修订颜色，或允许 AI 直接写入正式稿 |
| Novelcrafter / LivingWriter / Sudowrite | 场景/章节上下文、Story Bible/Codex 引用、选区 Rewrite、章节分析转待办 | 一次把整本书塞给模型、章节级直接覆盖、泛化聊天替代明确修改目标 |
| W3C Web Annotation | `TextPositionSelector + TextQuoteSelector(exact/prefix/suffix)` 复合锚点；无法可靠重定位时进入 orphan | 仅依赖字符 offset 或模糊匹配后静默挂到错误段落 |
| Tiptap / ProseMirror | Vue 3 接入、schema、transaction、selection mapping、开源核心、UniqueID | Tiptap Cloud、商业 Comments/Version History/Tracked Changes 作为产品依赖 |

研究依据：

- Jupyter cell ID：`https://nbformat.readthedocs.io/en/5.2.0/format_description.html`
- JupyterLab cell 交互：`https://jupyterlab.readthedocs.io/en/stable/user/notebook.html`
- VS Code Notebook AI：`https://code.visualstudio.com/docs/agents/guides/notebooks-with-ai`
- Quarto margin column：`https://quarto.org/docs/authoring/article-layout.html`
- Cornell Notes：`https://lsc.cornell.edu/notes.html`
- Scrivener Inspector：`https://www.literatureandlatte.com/blog/get-to-know-the-scrivener-inspector`
- Notion comments：`https://www.notion.com/help/comments-mentions-and-reminders`
- Word Track Changes：`https://support.microsoft.com/en-US/Word/training/track-changes-in-word`
- Novelcrafter：`https://www.novelcrafter.com/`
- LivingWriter AI Analysis：`https://guides.livingwriter.com/product-documentation/ai-features/ai-analysis`
- W3C Web Annotation：`https://www.w3.org/TR/annotation-model/`
- Tiptap Vue 3 / UniqueID / performance：`https://tiptap.dev/docs/editor/getting-started/install/vue3`、`https://tiptap.dev/docs/editor/extensions/functionality/uniqueid`、`https://tiptap.dev/docs/guides/performance`
- ProseMirror transaction：`https://prosemirror.net/docs/guide/`

#### G1.6.3 当前实现与真实迁移面

当前 `Writing.vue` 使用整章单个 `textarea`，选区、段落、顾问替换、素材回插和内联补全都依赖 Markdown 字符 offset。`applyAdvisorReplacement` 与 `writingAgentTransaction` 通过 `baseText + range` 防止旧结果覆盖，但前文发生变化后，未变段落的绝对位置也会失效。章节正文以 `chapter.content` 存入 `writing_books`，备份导出、素材来源回跳、章节纲要、分镜草稿和 Agent ContextLedger 都会读取这一字符串。

因此实现时必须遵守：

1. 结构化 editor document 是唯一可编辑真源；`chapter.content` 只保留为每次保存同步生成的 Markdown 投影，任何代码不得直接编辑该投影。
2. 所有下游改为调用 `getChapterMarkdown(chapter)` / `getChapterPlainText(chapter)`，禁止各自猜 `editorDocument` 或继续直接读取旧字符串。
3. 旧章节首次打开时执行一次 Markdown -> editor document 导入；成功写回之前保留原字符串，解析失败不得覆盖原文。
4. 不长期维护 textarea 编辑器和块编辑器两个可写模式。Markdown 视图首版降为只读源码预览；确认 transaction round-trip 稳定后再决定是否提供高级源码编辑。
5. `Writing.vue` 不再继续吸收编辑器内部状态；编辑器、检查器、批注和 AI 候选必须有独立 owner。

#### G1.6.4 目标布局与交互

桌面布局保持三段，但主次关系重排：

```text
章节/场景索引 220-240px | 连续稿 minmax(620px, 1fr) | 检查器 300-340px
```

- 左栏：保留书/章导航，只展开当前章的场景索引；场景显示标题、字数、未解决批注数和状态，不显示每个普通段落。
- 中栏：一个 ProseMirror editor instance 承载整章，不为每个块建立独立 textarea/editor；正文最大阅读宽度约 `58-66em`，工作面剩余空间用于 gutter 和边注关系，不制造大块空白。
- 左 gutter：默认无内容；块 hover/focus 时显示拖动、批注、AI 改写三个图标，命中区稳定但不把正文挤动。
- 块信号：只允许 2-3px 短边色条、极浅 active wash 和小型状态点；普通块无框、无卡片、无圆角承托面。
- 右检查器：只保留 `批注 / 版本` 两个顶层视图；改写属于具体批注的内联操作，不建立第三个常驻 tab。
- 检查器默认跟随当前块；提供“固定”图标，固定后切换正文焦点不改变右栏内容，吸收 Scrivener Inspector lock 的价值。
- 980px 以下右栏改为可关闭 side sheet；760px 以下章节与检查器通过现有 `WorkspacePaneSwitch` 进入“章节 / 正文 / 批注”，正文为默认 pane；390px 检查器使用底部 sheet。
- 批注正文属于右侧检查器内的边注轨道：桌面端的新建输入与已保存批注都按选区中点显示，并与编辑面共享滚动；窄屏改为检查器内的顺序列表。正文内只有不改变行宽的 inline decoration，不插入 widget。边注提供原位编辑、定位、按批注改写和删除；不保留解决/恢复状态入口，历史回复仅折叠显示为补充记录。批注不写入出版 Markdown。

键盘和输入规则：

- `Enter` 只在当前写作单元内新建正文段落，`Shift+Enter` 插入软换行；不再把每次回车解释为新写作单元。
- 写作单元只通过场景标题/分隔线、体验回合导入或显式“从此处分开”创建；单元起点的 `Backspace` 不隐式吞并来源边界，合并必须从轻量单元操作执行。普通方向键只移动光标，不引入 Jupyter command mode。
- 中文 IME composition 期间禁止自动保存投影、块拖动、slash command 和 AI 补全抢占。
- 跨块选择允许复制、删除、批注和收为素材；首版 AI 改写只对单块或单块内选区启用。
- 文字选择期间冻结 gutter 和浮动工具显隐，避免当前顾问按钮难以点击的问题复发。

#### G1.6.5 文档、批注与候选契约

```ts
interface WritingDocumentV2 {
  schemaVersion: 2
  revision: number
  content: JSONContent
  updatedAt: string
}

interface WritingAnnotation {
  id: string
  chapterId: string
  blockId: string
  blockRevision: number
  selector?: {
    start: number
    end: number
    exact: string
    prefix: string
    suffix: string
  }
  kind: 'comment' | 'rewrite-request' | 'review-finding' | 'locked-span'
  body: string
  status: 'open' | 'resolved' | 'orphaned'
  parentId?: string
  createdBy: 'user' | 'agent'
  createdAt: string
  updatedAt: string
}

interface WritingCandidate {
  id: string
  taskType: 'writing.revise.block.v1' | 'writing.revise.selection.v1'
  chapterId: string
  blockId: string
  baseDocumentRevision: number
  baseBlockRevision: number
  baseHash: string
  instruction: string
  operation: 'replace-block' | 'replace-selection' | 'insert-after'
  before: string
  replacement: string
  preservedSpanIds: string[]
  sourceRefs: SourceRef[]
  status: 'generating' | 'ready' | 'accepted' | 'rejected' | 'stale' | 'failed'
  createdAt: string
}
```

每个写作单元使用稳定 `unitId + unitRevision`，其内部标题、段落、列表等排版节点使用 `nodeId`；两者不得继续共用含混的 `blockId`。Tiptap UniqueID 只负责节点身份，单元 revision、来源、批注、锁定和候选仍由 Pinax 管理。AI 候选不嵌入 ProseMirror document，也不写入 Markdown；只有采纳时才生成一次带 `origin: 'ai-candidate'` 元数据的 editor transaction。

#### G1.6.6 锚点重定位与拆分/合并规则

批注定位按以下顺序执行，任一层不唯一时不得继续猜：

1. 命中 `blockId`，且 `start/end` 对应文本仍等于 `exact`；
2. 在同一 block 内用 `exact + prefix + suffix` 唯一命中；
3. 在同一 scene 内用完整 quote 唯一命中，并更新 blockId；
4. 无唯一结果时标记 `orphaned`，在检查器提供“重新关联”，绝不静默挂到相似句。

结构操作的确定性规则：

- 拆分：左块保留原 ID，右块获得新 ID；选区批注按位置迁移，跨越切点的批注拆成两个共享 `parentId` 的关联批注；整块批注留在左块。
- 合并：前块 ID 存活；后块 ID 写入本次 transaction 的 alias map，相关批注迁移并重算 selector。
- 移动：ID、revision 和批注不变，只更新文档顺序。
- 删除：批注进入 orphan archive，不随正文永久删除；撤销删除时按 transaction map 恢复。
- 粘贴：外部内容生成新 ID；内部复制也生成新 ID，避免两个块共享身份。
- Markdown 导入：按节点顺序生成 ID；重复导入不能作为稳定同步机制，只用于一次性迁移或显式“替换全文”。

#### G1.6.7 AI 改写、审稿与上下文边界

块级改写只发送：

- 目标块或选区完整文本；
- 前两块、后一块的裁剪文本；
- 当前 scene 的标题、目标、POV、地点、时间、出场角色与场景摘要；
- 当前块未解决的 `rewrite-request`、用户本次指令和锁定片段；
- 章节纲要中与 scene/sourceRefs 命中的项目；
- 经现有 ContextLedger 按需检索的世界书、素材和角色事实；
- 一小段同章文风样本。

不发送整本书、整份世界书或所有历史候选。模型返回结构化 candidate，不返回思考过程，不直接执行编辑 transaction。服务端和本地共同校验：

1. `blockId/baseRevision/baseHash` 仍匹配；
2. replacement 是可用正文，不含分析、标题包装、JSON 或提示词复述；
3. 每个 `locked-span` 的 exact 文本仍存在且顺序不变；
4. POV、角色名和 sourceRefs 中的硬事实没有无依据改写；
5. 单块结果不擅自新增多个场景或删除相邻块。

右栏改写流程固定为：

```text
写要求 -> 生成候选 -> 前后差异 -> 采纳全部 / 采纳选句 / 插入后方 / 拒绝
```

“再次生成”保留上一候选，单个目标最多保存 3 个未决候选。采纳选句必须先创建基于当前 candidate 的新 replacement，再走同一 stale/lock 校验，不允许绕开 transaction gate。

章节审稿是另一条只读链：`writing.review.chapter.v1` 先按 scene/固定块数分批，输出 `review-finding` 批注，类型限于重复、衔接、POV、角色连续性、时间、设定冲突、节奏和语言问题。审稿 Agent 默认不改正文；用户勾选批注后才转成块级改写请求。弱相似度、泛化文风评价和无定位“建议更生动”不得入列。

#### G1.6.8 版本、存储与恢复

- 编辑器内撤销：沿用 ProseMirror history，用户连续输入按正常输入事务合并；一次 AI 采纳始终是一个独立 undo unit。
- 持久快照：只在显式“建立版本”、AI 候选采纳前、整章导入前建立；不按每次按键保存全文快照。
- block 历史：每块最多保留最近 5 次已采纳 AI 版本；未决候选最多 3 个。
- chapter 快照：每章最多 20 个，超限先删除未命名且最旧的自动快照；用户命名快照不自动删除。
- localStorage 预算：快照优先保存被修改 block 的 before/after 和 transaction metadata，不复制整章；完整命名快照超出预算时要求用户先导出/清理，不静默覆盖。
- 自动保存：IME 结束或 transaction 静默 600-900ms 后，原子更新 `editorDocument + markdown projection + revision`；保存失败保留内存稿并给出可重试状态。
- 备份：`backupExport` 同时导出 editor document、annotations、candidates、snapshots 和 Markdown 投影；恢复先校验 schema，再恢复正式稿，未决 AI 候选可单独跳过。

#### G1.6.9 技术选型与代码 owner

依赖只采用开源编辑核心：

- `@tiptap/vue-3`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- `@tiptap/extension-unique-id`

不采用 Tiptap Cloud、商业 Comments、Version History、Tracked Changes、Pages 或 AI 扩展。实现前记录 package 精确版本和许可证；若 UniqueID 当前发布版许可证不符合仓库限制，则用 ProseMirror plugin 在 transaction 中维护 `blockId`，产品契约不变。

新增 owner：

- `src/components/writing/WritingNotebookEditor.vue`：唯一 editor instance、selection、gutter、键盘、IME、transaction 事件；
- `src/components/writing/WritingInspector.vue`：批注/改写/版本和 fixed/follow 状态；
- `src/components/writing/WritingBlockGutter.vue`：块级动作与状态信号；
- `src/components/writing/WritingCandidateDiff.vue`：candidate 差异和局部采纳；
- `src/services/writing/writingDocumentSchema.js`：schema、导入、序列化和 Markdown/plain-text 投影；
- `src/services/writing/writingAnnotations.js`：复合锚点、重定位、split/merge/delete alias；
- `src/services/writing/writingCandidates.js`：candidate 状态机、stale/lock 校验和保留上限；
- `src/services/writing/writingSnapshots.js`：block/chapter snapshot 与预算；
- `src/composables/useWritingDocument.js`：章节加载、transaction、autosave 和 save error；
- `src/composables/useWritingInspector.js`：active/fixed target、过滤和焦点归还。

修改边界：

- `Writing.vue` 只保留页面编排、书/章选择、素材入口和路由；旧 textarea、ghost selection layer、DOM offset 格式化和手工 selection API 在功能平替后删除。
- `useWritingAgent` 和 `useAdvisor` 继续负责请求生命周期与统一 provider，不另建第二套 AI transport；写作页结果 UI 迁入 inspector。
- `writingAgentContext` 改为接收 block/scene target 与 sourceRefs；旧 absolute range 只留给历史结果 stale 展示，不再生成新结果。
- `writingSelectionCapture`、章节纲要、shot exporter、素材回插和备份全部通过 writing document selector；素材来源增加 `blockId + quote selector`。
- 主题2样式进入独立 `src/styles/writing-notebook.css`；主题1只保证编辑、保存、导出和焦点可用，不执行 notebook 视觉重设计。

性能约束：整章只挂一个 editor；普通 paragraph 使用原生 DOM renderer，不为每段挂 Vue NodeView；editor 与 inspector 隔离响应式更新；Markdown 投影按保存节流生成，不在每个 transaction 同步全量 parse。Tiptap 官方长文本样例覆盖 20 万词，但 Pinax 仍以真实中文、批注和 Agent 插件组合做自己的门禁，不用官方 demo 替代测量。

#### G1.6.10 分阶段执行

**WNB-0：契约、真实 fixture 与编辑器 spike**

1. 固定 6 份真实章节 fixture：空章、5k、20k、100k 中文字符、多人对白、Markdown 混合格式；记录导入前 hash、段落数、字数和导出文本。
2. 在独立组件 spike 中验证 Vue 3、中文 IME、跨段选择、撤销、粘贴、拖动、UniqueID、Markdown round-trip 和 100k 字符输入延迟。
3. 建立 `WritingDocumentV2`、annotation/candidate/snapshot schema 与数据不变量；不先接 AI。
4. 审计 Tiptap 依赖许可证和产物体积，确认不拉入 Cloud/Pro 扩展。

Gate：正文 round-trip 零丢字；block ID 在普通编辑/撤销/移动后稳定；100k 字符下输入 P95 < 50ms；旧章节未成功保存新结构前原文不被覆盖。

**WNB-1：编辑器底座与现有功能平替**

1. 接入单 editor instance、段落/场景/divider/note/reference schema、gutter 和自动保存。
2. 平替标题、字数、查找、基础格式、Markdown 预览、撤销重做和章节切换。
3. 将素材提取/回插、章节纲要、分镜导出、普通导出和备份切到统一 selector。
4. 完成后删除 textarea 写路径和 DOM 字符 offset owner，不保留双编辑器开关。

Gate：旧功能行为对等；跨章节切换不串 selection/undo；导出 Markdown 和旧正文语义一致；刷新恢复后 block ID 不变。

**WNB-2：手工批注与检查器**

1. 实现块级/选区批注、thread、解决/恢复、简洁/展开密度、active/fixed inspector。
2. 实现复合锚点和 split/merge/move/delete/paste 规则；orphan 可重新关联。
3. 完成桌面三栏、980 side sheet、760 pane switch 和 390 bottom sheet。

Gate：前文插入、块移动、拆分合并后批注归属正确；无唯一匹配时 100% orphan、不误挂；键盘可遍历批注并返回锚点。

**WNB-3：块级 AI 候选**

1. 新增 `writing.revise.block.v1` / `writing.revise.selection.v1` 结构化 task；复用现有 provider 和 ContextLedger。
2. 实现改写请求、锁定片段、生成取消、最多三候选、diff、采纳/拒绝/选句和单 transaction undo。
3. 把现有顾问快捷动作映射到当前 block/selection；移除写作页重复的泛化 Advisor 浮层入口。

Gate：模型不能直接写正文；target 改变后旧 candidate 自动 stale；锁定片段零丢失；应用与撤销后文档/投影 revision 一致。

**WNB-4：场景、多块与审稿批注**

1. 场景索引、折叠、摘要、状态和未解决批注计数接入左栏。
2. 先开放跨块批注和收为素材，再开放多块 AI 修改；多块 candidate 必须逐块预览和原子提交。
3. 章节审稿按 scene/块批次生成可定位 findings；用户选择 finding 后进入 WNB-3 改写链。

Gate：审稿无定位建议为 0；一批失败不丢其他 findings；跨块原子提交任一 stale 时整批不写入。

**WNB-5：版本、质量和发布 Gate**

1. 接入 block 历史、命名 chapter snapshot、存储预算、备份恢复和崩溃恢复。
2. 完成真实 provider 30 次块改写与 10 章审稿 smoke，统计可用候选率、stale、锁定失败、手动编辑率、首候选延迟和无效 finding。
3. 完成主题2桌面/移动视觉审阅与主题1共享行为回归；删除遗留 selection/textarea/advisor 兼容代码。

Gate：见下一节完成定义。

**WNB-6：真实 Live Preview、多片段批注与查找同类（当前执行）**

调研后的取舍：Obsidian 的 Live Preview 是“排版结果常显、当前编辑位置局部露出语法”，不是在富文本与源码之间反复切页；Tiptap Markdown 扩展目前仍是 beta，且 Markdown 转换不承载评论数据，因此不替换 Pinax 已有的结构化文档真源与批注 sidecar。W3C Web Annotation 允许一个批注拥有多个 target，ProseMirror 也能表示多 range selection，但浏览器原生非连续选区难以跨输入、滚动和重定位稳定保存。Pinax 因此采用显式“收集片段”流程，而不把 Ctrl 多选 DOM 当作状态真源。查找同类吸收 VS Code semantic search 的分层检索思路：本地确定性召回负责广搜，模型只复核短名单，不把整章或整本直接交给模型搜索。

1. **先修正写作单元模型**：当前 schema 把每个顶层段落都赋予 `blockId`，导致 Enter 直接制造业务块、版本和 AI 目标过碎。升级为 `WritingDocumentV3 -> WritingUnit[] -> block+`：`writingUnit` 是含稳定 `unitId` 的 Tiptap wrapper，可容纳多个标题、段落、列表和引用；内部节点只承担排版与精确锚点。该阶段必须先于多片段批注和查找同类。
2. **Live Preview 可见化**：只保留一个实时编辑面，删除源码/阅读切换。光标进入标题、引用、列表、代码块或行内 mark 时局部露出 Markdown 标记；当前第一切片已覆盖标题、引用、粗体、斜体、删除线和行内代码。不能把尚未覆盖列表与代码块的投影描述为完整 Live Preview。
3. **常用 Markdown 往返**：在新单元 schema 内补齐有序/无序/任务列表、围栏代码及语言、链接和既有标题/引用/分隔线，禁止继续把列表和代码块压平成普通段落；每类节点必须通过 Markdown -> document -> Markdown 文本无损和编辑 transaction 门禁。
4. **多片段批注契约**：`WritingAnnotation` 增加有序 `targets[]`；每个 target 保存 `unitId + nodeId + revision + TextQuote + TextPosition`。用户通过正文选区浮条“加入当前批注”收集不连续片段；正文用克制的青蓝关联标记，右侧仍只显示一条边注。
5. **查找同类**：先按稳定单元/段落/句切分当前章或当前书，使用字符 n-gram、词项重合、结构模式和距离/多样性做本地召回；仅把 8-12 条短片段交给模型复核。用户勾选后才加入该批注的 `targets[]`，模型失败时保留本地结果，不伪造自动结论。
6. **多目标改写**：每个 target 生成独立 patch，并沿用单 transaction 原子提交。任一 target 缺失、重叠、unit/node revision stale 或候选与原文相同，整批拒绝，不允许部分写回。

**WNB-6A 写作单元详细设计（已完成，2026-08-18）**

完成摘要：schema v3、v2 一次转换、单元内多段编辑、显式 split/merge/move、批注/候选/版本/恢复的 `unitId + nodeId` 迁移，以及体验回合带来源原子导入均已落地。集成审查同时补齐段中 split 的单事务语义、split offset 批注迁移、格式 revision、invalid-v3 guard、导入消息唯一性和目的地弹窗的键盘/滚动生命周期。下一阶段回到常用 Markdown、`targets[]` 与查找同类。

数据层分为三层，不再用“块”同时指代三种对象：

```ts
interface WritingUnitV3 {
  type: 'writingUnit'
  attrs: {
    unitId: string
    unitRevision: number
    kind: 'passage' | 'scene' | 'note' | 'source'
    sceneId?: string
    originRefs: WritingOriginRef[]
  }
  content: EditorBlockNode[] // 1..n 个标题、段落、列表、引用等
}
```

- **排版节点**：段落、标题、列表项等；Enter 只新增段落节点。`nodeId` 服务选区、批注和 transaction mapping，不单独出现在版本栏或 AI 任务列表。
- **写作单元**：局部创作、来源、版本和 Agent 上下文的稳定容器；可以包含多段小说正文。单元内部编辑使 `unitRevision` 单调增加。
- **场景**：章节导航和上下文范围，可包含多个写作单元；场景标题不是每段正文的容器，也不强迫长场景成为一个巨大 AI 改写目标。

体验页与写作页的对应关系：

- 一次**已经提交成功的 assistant 回合**默认导入为一个写作单元，保留 `sessionId / branchId / turnId / messageId / worldbookId` 来源；回合内叙述、对白和动作解析成同一单元内的多个排版节点。
- 这个一对一关系是最好的**初始来源边界**，但不是永久编辑边界。单次生成可能跨越两个节拍或过长，作者可显式拆分；两个短回合也可合并。拆分后的两个单元都保留原 `originRefs`，合并时来源去重并集，回跳和审计不丢失。
- 玩家输入与 assistant 正文不混成同一出版单元；玩家输入作为来源上下文保留，需要写入小说时由用户明确采纳或由改编任务生成候选。

交互规则：

- `Enter` 新段落，`Shift+Enter` 软换行；连续写十段仍是一个写作单元。
- 场景标题、分隔线和体验回合导入可以创建自然单元；其他拆分通过光标附近的轻量“从此处分开”动作，合并通过相邻单元操作。可以提供 Jupyter 同源的 `Ctrl/Cmd+Shift+-` 快捷键，但不引入 Edit/Command 双模式。
- 单元边界只在当前单元、来源回跳、批注或 AI 候选存在时显示短边信号；不画 cell 外框，不显示执行序号、运行按钮或输出区。
- AI 的“上下文单元”和“实际修改范围”分开：上下文可读取当前单元、相邻单元和所属场景，patch 仍只覆盖用户选区或模型明确定位的段落范围，避免一个长回合被整块重写。

直接实施顺序：

1. 建立 schema v3 fixture 和 `writingUnit` Tiptap node，冻结 Enter/显式 split/merge/move/undo、IME 与 Markdown 投影契约。
2. 一次性把现有 schema v2 文档转换为 v3，按场景标题/分隔线聚合连续正文；迁移完成后删除“每段一个业务 block”的运行路径，不长期维护双 schema 编辑逻辑。
3. 改写批注、候选、快照、块历史和质量 Gate，使其分别消费 `unitId` 与 `nodeId`；历史 UI 的“块”统一改称“片段”或“写作单元”。
4. 体验页提交链增加明确的“收进稿件”事务，将一次 assistant 回合转换成一个带来源的单元；分支重生成不得静默覆盖已导入稿件，只产生新来源 revision。
5. 收口 UI：普通输入看不到单元卡片；当前单元仅显示轻量边缘信号和必要操作。完成后再继续 `targets[]` 与查找同类。

Gate：同一单元连续 Enter 20 次后 `unitId` 数量不变；显式 split/merge 可单 transaction 撤销且正文零丢失；批注跨 split/merge 要么精确迁移、要么明确 orphan；体验回合导入保留完整来源并允许回跳；AI 候选不能因单元过长而默认覆盖整单元；10 万字、中文 IME、1440/980/390 和 200% zoom 通过。

Gate：1440/980/390 下语法槽不改变普通段落行宽；10 万字章节查找可取消且不阻塞输入；同类结果零自动写入；同一 target 零重复；旧批注读取无数据丢失；多目标采用满足全有或全无；常用 Markdown 往返不丢正文。明确不引入浏览器原生非连续选区作为 owner、不把整本正文直接发送给模型、不新增第二套评论系统。

研究依据：

- Obsidian Live Preview 与默认编辑视图：`https://help.obsidian.md/Live+preview+update`、`https://obsidian.md/help/settings`
- Tiptap Markdown 双向转换及 beta 边界：`https://tiptap.dev/docs/editor/markdown`、`https://tiptap.dev/docs/editor/markdown/api/editor`
- W3C Web Annotation 多 target：`https://www.w3.org/TR/annotation-model/`
- ProseMirror SelectionRange：`https://prosemirror.net/docs/ref/`
- Word 非连续选择与页边评论：`https://support.microsoft.com/en-gb/topic/how-to-select-items-that-are-not-next-to-each-other-8b9c1be9-cca3-935a-7cbf-94403aa48d2e`、`https://support.microsoft.com/en-US/Word/using-modern-comments-in-word`
- VS Code semantic search：`https://code.visualstudio.com/docs/agents/reference/workspace-context`
- JupyterLab cell 编辑/命令模式与显式 cell 操作：`https://jupyterlab.readthedocs.io/en/latest/user/notebook.html`、`https://jupyterlab.readthedocs.io/en/4.4.x/user/commands.html`
- nbformat 多行 Markdown cell 与稳定 cell id：`https://nbformat.readthedocs.io/en/5.2.0/format_description.html`
- Cmd Markdown 的同步预览、快捷格式、目录与批注：`https://www.zybuluo.com/cmd/`、`https://www.zybuluo.com/mdeditor`
- 知乎长篇创作与按小节 AI 校对：`https://www.zhihu.com/parker/campaign/1886006781253224212`

#### G1.6.11 测试矩阵与完成定义

自动化优先参数化并入现有写作、Agent、备份和视觉契约，避免按每个细节新建测试文件。必须覆盖：

- schema import/export、ID 唯一性、Markdown round-trip；
- IME、split/merge/move/paste/undo 的 transaction contract；
- quote/position anchor 重定位与 orphan；
- candidate stale、lock、diff、apply、undo 和多块原子性；
- 素材回插、章节纲要、分镜、备份恢复读取同一投影；
- 空章/长章/错误/生成中/批注密集的现有视觉用例替换，不增加无意义截图数量。

浏览器矩阵：`1440 / 1280 / 980 / 760 / 390`，UI zoom `1 / 0.85 / 0.75`，亮/暗主题2；主题1做书章切换、输入、保存、导出和恢复 smoke。输入覆盖鼠标、键盘、触屏、中文 IME、跨块选择、拖拽和 200% browser zoom。

完成定义：

- 普通阅读时看不出卡片墙；3 秒内能识别当前场景、当前块和未解决批注；
- 10 万中文字符章节输入、选择和滚动可用，编辑器状态变化不会重渲染整个页面；
- 批注在移动和局部编辑后保持，错误重定位为 0；无法确定时明确 orphan；
- AI 永远先成为 candidate，直接覆盖正式正文为 0；stale candidate 覆盖为 0；锁定片段丢失为 0；
- 现有素材、纲要、分镜、导出、备份与 Agent 来源链无数据断裂；
- localStorage 超限不会静默丢稿，恢复失败保留原始 Markdown；
- `Writing.vue` 在 WNB-3 后降至 < 3000 行，WNB-5 目标 < 1500 行；
- `npm run verify:full`、真实章节 fixture、真实 provider Gate 和指定截图全部通过后才标记完成。

#### G1.6.12 明确延后与禁止项

- 首版不做多人实时协作、CRDT/Yjs、评论通知和权限；数据契约保留 `createdBy`，但不提前建设协作后端。
- 不做真正 Jupyter kernel、代码 cell、输出 cell 和 `.ipynb` 导入导出。
- 不为每个段落建立独立 editor，不用多个 textarea 拼 Notebook。
- 不把批注、AI 指令、候选或 sourceRefs 写进出版 Markdown。
- 不允许模型直接 dispatch editor transaction，也不把整章自动重写作为默认入口。
- 不采用 Tiptap Cloud/Pro 评论、版本、分页和 AI 能力；开源核心不能满足时优先实现最小 ProseMirror plugin，而不是改变产品数据契约。
- 不在块周围常驻边框、工具条、序号和运行按钮；块结构服务编辑与追溯，不改变 Pinax 连续稿纸视觉。

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

当前进度（2026-08-03）：`PlaceEntity` 已能聚合 `geoHistory.placeRefs`、历史节点和世界书条目，地图页也会把明确地点条目投影为稳定 marker；但这仍属于“生成后落点”。世界书地点尚未完整约束地图的国家、区域、河流、道路和地点层级，重生成后的绑定修复也没有形成可审阅合同。下面的 G2.4 负责补齐这部分，不另建第二套地点实体。

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

### G2.4 世界书约束型 Living Atlas（当前地图主计划）

当前进度（2026-08-05）：M0-M2 已完成，M3 已完成有限地点关系编译、生成后核验及国家/道路/沿河直接求解切片，M4 核心版本事务完成，M5 候选筛选前置收口，M7 第一视觉切片完成。`compileWorldbookMapConstraints()` 只接受正式且 confirmed 的世界书地点，将聚落落点、区域/国家 anchor，以及明确声明的归属区域、所属国家、同国/异国、相邻、沿河和通路关系交给引擎；普通正文和 provisional 地名不会升级为硬事实。指定国家、同国/异国关系会形成国界扩张种子和连通走廊，明确通路优先进入路网，confirmed 河流和沿河地点会复用自然河道或形成 drainage 支流；全部关系生成后仍逐项返回 `satisfied / relaxed / impossible`。作者确认坐标不会为迁就随机结果而被静默改写。资料 rail 显示关系和放宽/冲突原因，历史草案最多消费 12 个真实命名且非重复锚点。父子区域和相邻关系尚未直接参与区域求解，关系型 remap 评分、LOD/碰撞/聚类与真实地点操作 smoke 仍待完成。

#### G2.4-A 结构化地点目录（当前优先执行）

问题判断：继续从“地理环境”长文中用后缀、引号和关系词猜地名，只能改善少量 fixture，无法可靠区分专名、泛称、修辞、区域标题和描述中的设施。结构化设定必须直接维护地点事实；地图不应承担把散文反向解析成数据库的职责。

当前进度（2026-08-06）：Luna 完成 A0-A4 代码纵向链，Codex 完成合同、数据保真、UI 和浏览器审查修正。结构化设定的世界观分区现有正式地点目录、完整 CRUD、删除影响确认和 `setting-places.v1` 分批整理审阅；逐项采纳不会使无关草稿过期。地图生产已停止消费地理概述正文，只读取正式地点、显式关系与 geo-history。A5 的核心 188 + 视觉 12、双构建、diff check、1440/390 无溢出审计及两草稿逐项采纳浏览器 fixture 已通过；真实外部 provider 的地点整理质量与发布门槛仍待执行。

目标链路：

```text
地理概述（叙事正文，只作创作依据）
  -> AI / 本地整理为地点草稿（带原文证据，不写库）
  -> 逐项编辑、去重、确认
  -> 独立世界书 location 条目（作者事实真源）
  -> 地图地点清单、约束、绑定和历史
```

**A0：数据合同与唯一真源**

- 不新增 `placeStore`、`structuredPlaces` 或地图地点副本；正式地点仍是 `worldbook.entries` 中拥有稳定 entry ID 的地点条目。
- 增加统一地点负载归一器，字段包括：`name`、`aliases`、`kind`、`scale`、`parentRef`、`factionRef`、`terrainHints`、`relations`、`description`、`sourceEvidence`、`reviewState` 和既有 `mapBinding`。所有自由文本、AI 草稿、旧类型和 SillyTavern 条目先经过同一归一器。
- `kind` 使用有限词表：`continent / region / city / town / village / port / fortress / academy / site / river / route`；未知值保留为 `site` 并显示待修正，不由地图猜测。
- 关系使用稳定类型：`parent / state / adjacent / river / route / same-state / different-state`。优先保存 entry ID；草稿阶段只允许 target name，采纳时解析，悬空引用保持 unresolved。
- 地理概述字段 `world.geography` 继续同步自己的“地理环境”条目，但该总述条目标记为 overview，不能直接成为地图地点或名称种子。

退出条件：同一地点在设定页、世界书高级条目、地图和 PlaceEntity 中共享 entry ID；没有第二份可独立编辑的数据。

**A1：设定页地点目录与编辑工作流**

- 在主题2“世界观 / 地理环境”下加入连续式地点目录，不做卡片墙；顶部只显示搜索、类型筛选、“新建地点”和“从概述整理”。主题1只保证入口和表单可达，不重做视觉。
- 左侧紧凑列表显示名称、类型、所属区域和状态；右侧编辑当前地点的名称、别名、类型/层级、所属区域/势力、地理条件、关系、描述和关键词。
- 新建先形成本地 draft，名称和类型通过校验后一次性写入；编辑复用 `updateEntry`；删除必须显示地图绑定、历史引用和关系引用影响，不能静默级联删除。
- 保存前执行名称空值、同名/别名冲突、自引用、父子循环、互斥地理条件和悬空关系校验。错误只阻止当前地点，其他地点仍可编辑。
- 保存成功后当前世界书 revision 更新，地图已生成时相关绑定进入 stale/待重新读取；不自动重新生成地图。

退出条件：用户不打开高级条目页即可完整建立、修改、删除和查找地点；1440/980/390 与 200% zoom 下主要动作可达。

**A2：从地理概述整理地点草稿**

- 新增严格 `setting-places.v1` 响应合同。模型只返回地点数组，不返回坐标、cell、地图对象 ID 或最终绑定；每项必须包含名称、类型、描述、证据摘录和可选关系。
- 请求只发送地理概述、相关正式地点的紧凑索引、全局硬约束及用户补充要求。长概述按语义段落分批，每批限制地点数和输出预算；批次失败不丢失其他批次。
- 本地规则只负责预切段、schema 校验、去重和明显泛称过滤，不再自行断言“后缀像地点就是真地点”。模型输出必须能回指原文证据；不存在于输入的名称标为低置信建议，默认不勾选。
- 草稿按 `新增 / 可能重复 / 更新已有 / 关系待解析 / 无效` 分组。用户可逐项修改、合并、采纳或忽略；禁止“一键全部写入”。
- 采纳采用逐项 revision guard：同批采纳第一项后，剩余草稿不会整批过期；只在其依赖的概述片段或目标条目发生变化时标 stale。
- 上游不支持 schema、截断、空响应或部分无效时保留有效草稿并显示字段级错误；不得退回把普通文本当 JSON 猜测，也不得把 reasoning 写入名称或描述。

退出条件：用户给出的城市清单能形成可编辑草稿；泛称误入正式地点为 0；单批局部失败和逐项采纳均不丢失已审内容。

**A3：世界书写入、旧资料整理与互操作**

- 草稿采纳统一调用地点条目 CRUD，写入 `type: location`、关键词、关系、来源证据和结构化地点元数据；不把多个城市重新拼回一个 textarea 条目。
- 对当前“地理环境”总述提供显式“整理已有概述”动作；旧数据保持可读，不启动时自动迁移、不删除原文。整理完成后总述仍保留，正式地点成为地图唯一可执行来源。
- 普通 Pinax 备份完整保留地点扩展字段；SillyTavern 导出将核心事实降解为正文与关键词，并通过 Pinax extension 保留可往返的结构化负载。
- 高级条目页编辑同一地点后，设定页立即读取更新；地点目录不得通过缓存覆盖高级页修改。

退出条件：备份恢复、Pinax 往返和高级条目编辑不丢名称、类型、关系、证据及绑定；旧概述原文不丢失。

**A4：地图消费边界切换**

- `collectWorldbookLocationEntries()` 默认只返回正式地点条目、显式地点关系和 geo-history 引用；地理概述正则结果不再自动进入地图清单、marker、名称池或历史候选。
- 为设定页“整理草稿”保留独立的 provisional extractor/AI adapter，但它不能被地图直接调用。删除“为了让地图看见地点而继续扩充后缀正则”的路线。
- 正式地点按 `kind / terrainHints / relations` 编译地图约束。城市、河流、路线和区域只匹配同类地图对象；无法满足时保持 unbound 并报告，不降级为随机点。
- 地图资料 rail 提示“正式地点 N / 未整理概述 1”，并深链回设定页地点目录；不在地图页重复提供地点正文编辑器。

退出条件：地图中每个作者地点都能追溯到正式 entry ID；概述中的修辞和泛称不再进入地图；正式地点覆盖率 100%。

**A5：验证、指标和删除旧启发式**

- 复用现有测试 item，测试总量保持核心 188 + 视觉 12 = 200。扩充现有 worldbook/map 集成项覆盖：并列城市、区域标题、双字地点、同名异地、父子关系、局部采纳、revision guard、备份往返和地图只读正式条目。
- 浏览器 smoke 覆盖：手工新建、从概述整理、编辑关系、采纳两项、刷新、切换世界书、地图重新读取、解除/确认绑定，以及 1440/980/390 和 200% zoom。
- 质量门槛：正式地点误识别 0；同名误合并 0；逐项采纳导致无关草稿过期 0；地图无来源地点 0；概述和正式条目往返信息丢失 0。
- 达到门槛后删除地图侧正文地点提取；仅保留设定页整理入口的段落切分与 schema 校验。真实 provider 未通过前不得声称 AI 整理发布就绪。

执行顺序：`A0 -> A1 -> A2 -> A3 -> A4 -> A5`。A0-A1 先形成手工可用的完整地点目录；A2-A3 接入可审阅的 AI 整理；A4 最后切换地图消费，避免 UI 尚不可用时让旧世界书地点消失。每阶段都必须保持世界书原文和现有地图可读，不使用破坏性启动迁移。

#### 目标与问题定义

这轮优化不再通过提高 `burgDensity`、扩大名称池或从长篇“地理环境”中猜更多地名来制造“已经接入世界书”的表象。目标是建立一条可验证的生产链：

```text
世界书地点事实
  -> 地点清单与约束归一
  -> 地图绑定审阅
  -> 受世界书约束的地图生成 / 重生成
  -> PlaceEntity 空间索引
  -> 地理语义与历史候选
  -> 体验 Agent 按需查询
```

现有实现的主要缺口：

1. `worldbookMapBridge.js` 已能读取明确地点、`relations.locations`、`geoHistory.placeRefs` 和部分地理总述，但地点大多只影响名称池和生成后 marker；“A 城属于 B 国”“C 河流经 D 盆地”“E 商道连接 F 与 G”等关系没有约束地图拓扑。
2. 无同名 burg 时，地点通过稳定哈希落到陆地 cell，能保证不漂移，却不能保证气候、国家、河流、邻接和叙事描述合理。
3. 世界书、地图引擎 burg/marker、历史 `mapBinding` 之间缺少可见的绑定审阅。自动匹配错误时，用户无法清楚地改绑、锁定或确认“尚未落图”。
4. 地图重生成会产生新的 cell、burg、route ID；当前没有“保留已确认地点 -> 预览漂移 -> 修复失配 -> 再提交”的事务边界。
5. `extractMapSemantics()` 仍会从引擎产物推导泛化区域。近期已经过滤编号占位名和重复锚点，但语义候选还没有优先围绕世界书地点及其真实关系展开。
6. 地图资产缓存、重复生成压力指标、标签密度与移动端工作面仍未完全收口，继续影响地点审阅的可靠性。

#### 唯一真源与数据合同

- **世界书条目是作者事实真源**：地点名称、别名、类型、归属、叙事描述和明确关系只能由世界书正式条目或用户确认的草稿提供。
- **地图资产是空间真源**：cell、坐标、地形、河流、道路、国家边界和渲染图层由某个 `mapId + generationConfigHash` 对应的地图版本持有。
- **`PlaceEntity` 是查询投影**：它聚合条目、地图绑定、历史和运行时状态，不复制世界书正文，也不保存另一份可独立编辑的地点事实。
- **`geoHistory.placeRefs` 扩展为绑定载体**：可增加 `binding` 与 revision 元数据，但不创建平行的 `mapPlaces` store。`geographyStore.markers` 仍只是当前地图的渲染投影。
- **生成内容先审阅**：引擎推导出的聚落、区域和路线可以成为“建议新地点”，但不能直接写入世界书；世界书地点也不能在没有报告的情况下被强行塞入不相容地形。

建议在现有 place ref 上扩展以下形状；字段名以实现前的 fixture 审计为准，不单独引入第二个实体类型：

```ts
interface PlaceBinding {
  placeId: string
  worldbookEntryIds: string[]
  aliases: string[]
  kind: 'state' | 'province' | 'burg' | 'site' | 'route' | 'river' | 'region'
  parentPlaceIds: string[]
  mapId: string
  mapRef: {
    cellIds?: number[]
    markerIds?: string[]
    burgId?: number
    stateId?: number
    riverIds?: number[]
    routeIds?: number[]
  }
  constraints: {
    hard?: Array<'land' | 'water' | 'coast' | 'same-state' | 'different-state'>
    biomeHints?: string[]
    relationRefs?: Array<{ type: string; targetPlaceId: string }>
  }
  status: 'unbound' | 'auto-matched' | 'confirmed' | 'conflict' | 'stale'
  sourceRevision: string
  mapRevision: string
  match: { method: 'exact' | 'alias' | 'relation' | 'manual' | 'fallback'; score: number }
}
```

来源优先级必须固定：

1. 用户已确认绑定和手工地图标记；
2. 明确地点条目及其稳定 `section.field` / entry ID；
3. 世界书显式关系、地点层级和已确认 `placeRefs`；
4. 经用户审阅的地理总述提取结果；
5. 地图引擎生成的 state/burg/river/route；
6. 纯算法语义区域。

低优先级来源不能覆盖高优先级事实。纯算法结果不得获得看似正式的“沃土 11”“边境荒域 2”名称；没有名称时展示地形描述和来源，不伪装成世界书地点。

#### M0：冻结基线与诊断夹具（0.5-1 天）

任务：

- 建立 4 组不新增 test item 的地图夹具：单大陆城邦、多国大陆、群岛港口、已有历史的旧世界书；每组包含城市、区域、河流、路线、父子地点和别名。
- 记录当前链路中每个地点从 entry -> seed -> burg/marker -> placeRef -> history node 的 ID、名称和丢失位置。
- 对同 seed、刷新、切换世界书和连续重生成采集地图 revision、Worker 生命周期、生成耗时、主线程长任务和 marker 数量。
- 把当前启发式地名提取标为 `provisional` 来源，区分“明确地点”“关系引用”“正文推断”“引擎生成”。

Owner：`worldbookMapBridge.js`、`placeEntity.js`、`placeRefs.js`、`WorldMapPanel.vue` 及现有地图历史集成测试。

退出条件：四组 fixture 都能产出逐地点追踪报告；所有静默丢失、错误合并和漂移都能落入明确错误分类，而不是只看到地图上“有没有点”。

#### M1：地点清单与关系归一（1.5-2 天）

任务：

- 将地点收集拆为纯函数 `collect -> normalize -> resolve relations -> validate`，不在 Vue 组件内继续堆分支。
- 只把明确的地点条目直接视为地点；地理总述中的名称提取进入待审清单，不自动获得 confirmed 状态。
- 统一中英文别名、旧 `place/city/town/landmark` 类型、稳定 entry ID 和 `placeId`；同名不同地点不能只按规范化名称合并。
- 建立父级区域、所属国家、河流流经、道路连接、邻接、沿海/岛屿等有限关系词表；无法识别的关系保留原引用并显示 unresolved，不由模型静默补全。
- 校验悬空引用、循环父子关系、同一地点互斥类型和重复别名；错误只阻止相关地点绑定，不阻断整张地图。

Owner：`src/services/ai/worldbookMapBridge.js`、`src/services/worldHistory/placeRefs.js`、`placeEntity.js`、`worldStore.js` 的既有更新边界。

退出条件：明确地点提取覆盖率 100%；同名异地不误合并；每个地点都显示来源 entry、关系、约束和审阅状态；不再依赖增加 `burgDensity` 才能“看见”地点。

#### M2：地点绑定审阅工作台（2-3 天）

任务：

- 在地图页增加紧凑的“地点绑定”视图，按 `未落图 / 自动匹配 / 已确认 / 冲突 / 已过期` 分组；地图仍是主舞台，不建立卡片墙。
- 自动匹配依次使用稳定绑定、同名、别名、父级区域、国家和邻接关系；置信度不足时保持 unbound，不使用随机陆地点伪装成功。
- 用户可从地点列表聚焦地图、将地点绑定到 burg/marker/route/region、解除绑定、在地图上新建锚点并确认；键盘和移动端提供列表替代入口。
- 每个绑定显示“来自哪个世界书条目、为何匹配、当前地图对象、受哪些关系约束”；冲突给出可执行修复，不只显示失败。
- 批量确认只处理无冲突的高置信匹配；任何手工确认都写入 place ref 的 revision，不回写随机坐标到世界书正文。

Owner：`WorldMapPanel.vue`、`WorldMapVoronoi.vue`、新的轻量 geography 子组件、共享 `SourceSignal`；主题2完整实现，主题1只保证操作可达。

退出条件：用户能在同一地图页完成全部明确地点的确认或标记为暂不落图；每次操作可撤销；1440/980/390 下地图、地点列表和修复动作均可达且无覆盖。

#### M3：世界书约束型地图生成（3-5 天）

任务：

- 在调用 engine 前把已确认地点关系编译成有限 `MapGenerationConstraints`，禁止直接把世界书正文传入 engine。
- 区分硬约束与软提示：陆海/沿海/岛屿/同国/异国可作为硬约束；气候、规模、繁荣度和相对方向优先作为可评分软约束。
- 生成顺序调整为“地形 -> 水系/国家 -> 约束候选槽 -> 聚落/路线 -> 名称”，让地点关系影响位置选择，不再只在生成后贴 marker。
- 对每项约束返回 `satisfied / relaxed / impossible` 和理由；无可行解时保留地点未绑定，不擅自改世界书。
- 国家、城市、河流和路线名称只消费类型相符的名字池；中文世界书默认不混入英文随机名，除非世界书本身包含对应语言风格。
- 保持 ADR-0003 的模板、sub-RNG 和 contract 机制，不恢复已废弃的 `realism.level`，不把本轮扩大为完整 GIS 或地图引擎重写。

Owner：`voronoiMapAdapter.js`、`worldbookMapBridge.js`、`engine/generate.ts`、`settlements.ts`、`nations.ts`、`rivers.ts`、道路生成模块和共享地图类型。

当前实现切片（2026-08-05）：`compileWorldbookMapConstraints()` 只接受 confirmed entry，并将聚落/地点编译为带 `land / coast / water / river` 的有限约束；confirmed 区域/国家编译为 anchor。明确声明的 `parent/state/same-state/different-state/adjacent/river/route` 会进入有限拓扑合同。`state/same-state/different-state` 先组成地点组，明确国家优先、无明确国家时选择最近首都；分组地点和通往首都的陆路走廊作为多源 Dijkstra 辅助种子，仍经过平滑与去飞地。冲突首都不会强制合并。明确 `route` 在随机道路前使用同一 A* 路网优先铺设并保留作者命名。独立河流和地点 `river` 关系编译成必经点：自然河道命中时复用，否则沿既有 drainage 上下游创建支流；河口采样退化只允许从更高相邻陆地补来水，不改变高度图。所有关系仍在国家、河流和道路完成后核验；无法满足时只进入报告，不移动作者确认坐标或改写世界书。M3 剩余工作是让 `parent/adjacent` 参与区域候选求解，并补更多冲突 fixture。

退出条件：fixture 中的沿海港口落在海岸、河流地点绑定真实河流、父子地点位于同一合理区域、显式连接地点存在可追踪路线；无法满足的约束全部可见，零静默篡改。

#### M4：重生成、版本与失配修复（2-3 天）

任务：

- 重生成前冻结 confirmed bindings，生成到临时 map version 后执行 remap，不立即替换当前地图。
- remap 按稳定对象、名称/别名、区域关系和空间邻近评分；旧 cell ID 绝不能被当作跨地图稳定 ID。
- 提交前展示“保持、移动、失配、关系冲突、新增地图对象”摘要；只有用户确认后原子切换 `mapId/mapRevision` 与绑定。
- 世界书在生成期间发生修改时，只将受影响地点标 stale；不要让一个条目变化使整张地图和全部建议无条件失效。
- 提供恢复上一地图版本及绑定 revision 的入口；运行时当前位置指向失配地点时保留 placeId，并要求修复后再更新 mapRef。

Owner：G2.1 地图资产层、`geographyStore.js`、`WorldMapPanel.vue`、`placeRefs.js`、备份导入导出。

当前实现（2026-08-05）：地图参数与 AI 配置先作为候选交给 Worker；地图数据和临时 Canvas 成功后，若存在 confirmed 地点，候选仍不交换当前位图，而是按名称/别名、约束报告生成保持/移动/冲突/失配清单。用户逐项选择后才提交新图、配置、marker 和绑定 revision；条目指纹只使生成后被编辑的地点过期。每世界保留最近 5 个轻量 revision，可恢复配置、marker 与 mapBinding 快照，不保存 cells。M4 核心事务已完成；后续增强只补关系/空间邻近评分和完整运行时回滚 smoke，不再另建版本系统。

退出条件：已确认地点未经用户同意不漂移；重生成失败时旧地图完全可用；单地点 stale 不污染其他绑定；恢复旧版本后历史和体验入口仍能定位同一 placeId。

#### M5：地理语义与历史候选围绕真实地点生成（2-3 天）

任务：

- `extractMapSemantics()` 先消费 confirmed PlaceEntity、真实道路/河流/国家关系，再补充少量纯地形机会点。
- 语义候选标题优先使用世界书地点名；算法区域只显示“某地点北侧高地”等相对描述，不生成编号占位专名。
- 候选评分加入世界书相关性、关系完整度、历史可用性和来源可信度；同一道路、同一小片 cell 或同一地点的重复类别合并为一项并保留多重理由。
- 地理筛选默认最多 12 项，但不再预选 24/24；默认保留覆盖不同地点和关系类型的高分项，用户可从地图补选。
- 历史草案只消费用户确认的地点绑定和语义候选；地点失配、冲突或 stale 时不得作为确定历史事实。

Owner：`mapSemantics.js`、`geoHistoryPipeline.js`、历史草案审阅区、`placeEntity.js`。

退出条件：占位地点 0；重复锚点 0；历史节点地点引用 100% 可回到地图或明确显示未绑定；候选理由能解释关联了哪条世界书事实和哪项地图特征。

#### M6：运行时按需地理查询（1.5-2 天）

任务：

- `geo_lookup current/get/nearby/route` 只读取 confirmed PlaceEntity 和当前 map revision，返回地点层级、邻接、路线、地形及相关历史的有界摘要。
- 体验页切换当前位置、地图进入场景、历史开局继续使用同一 placeId；工具调用不复制整张地图，也不能修改绑定。
- 世界书条目更新后使相关查询缓存失效；stale/conflict 状态进入工具证据元数据，模型不能把它当确认事实。
- 地图、结构化设定、历史节点和体验现场继续互相深链，并保留返回来源页面的上下文。

Owner：现有 Narrative Resource Index、`geo_lookup` 工具、`experienceSessionAdapter.js`、地图/设定路由入口。

退出条件：地理工具目标证据命中率 >= 90%；无关远方地点不进入上下文；地图与体验当前地点一致率 100%；工具不建立第二份地点缓存真源。

#### M7：地图表现与交互收口（2-4 天，可在 M2 合同稳定后并行）

任务：

- 按来源与状态区分世界书地点、引擎地点、历史节点、当前位置和冲突绑定；使用克制的颜色/形状差异，不用大面积卡片或持续铺满标签。
- 增加标签碰撞、缩放级 LOD、marker clustering、选中地点的关系线和来源筛选；低缩放保留国家/区域，高缩放再展示城市/站点。
- 地图全幅作为主舞台，绑定、图层、历史和生成参数使用可收起 rail；装饰等高线在真实地图出现后退场。
- 修复移动端地图手势、面板遮挡、底部安全区和列表替代操作；200% zoom 下不依赖小字塞信息。
- 导出分别支持纯地图、世界书地点、历史图层和当前场景参考图，导出内容与当前可见筛选一致。

Owner：`WorldMapPanel.vue`、`WorldMapVoronoi.vue`、renderer 图层、主题2 token 和既有响应式断点。

当前实现切片（2026-08-05）：地图恢复为主舞台，世界书来源、地点绑定、地理筛选、历史草案与地点实体收进可收起资料 rail；工具栏持续显示当前世界书及地点数，并提供重新读取、快速导入和管理入口。主题2 topographic 配色、海岸、国界和国家标签已完成第一轮克制化处理，1440/390 空态与 1440 确定性实图无 console error 或横向溢出。LOD、标签碰撞、聚类、来源筛选和分层导出仍待后续切片。

退出条件：1440/980/760/390 与 200% zoom 可辨认主对象、主动作和地点状态；100 个地点时标签不铺满，列表搜索仍可访问全部地点；主题1不发生视觉重做。

#### M8：可靠性、性能与发布门禁（1.5-2 天）

任务：

- 真实浏览器连续 regenerate 20 次，记录成功率、每阶段耗时、RAF/timer、Worker 数、主线程长任务和可用时的 heap 回落。
- 取消与超时必须终止旧 Worker，迟到结果不得覆盖新 revision；组件卸载后无孤儿 Worker/Canvas listener。
- 地图打开时优先恢复已保存资产和绑定，世界书异步加载只增量同步受影响地点，不全量重生成。
- 保留当前 188 核心 + 12 视觉 = 200 tests 上限：通过扩充现有 test item 覆盖合同，不为每个阶段机械新增测试条目。
- 完成四组 fixture 的桌面/窄屏、刷新、世界书切换、重生成、历史开局、冒险写回和回滚 smoke。

发布指标：

| 指标 | 门槛 |
|---|---:|
| 明确世界书地点进入地点清单 | 100% |
| 已确认地点在地图可达或明确标为暂不落图 | 100% |
| 同名异地误合并 | 0 |
| 未报告的约束放宽 / 地点丢失 | 0 |
| 重生成后 confirmed 地点无授权漂移 | 0 |
| 地理候选编号占位名 / 重复锚点 | 0 |
| 地图与体验当前 placeId 一致率 | 100% |
| 20 次连续 regenerate 成功率 | 100% |
| 1200x800 生成期间输入响应 P95 | < 100ms |
| 已保存地图再次进入的结构重算 | 0 次 |

#### 执行顺序、并行边界与回退

```text
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6
             \                  /
              -> M7 ---------->
M0 ---------------------------> M8
```

- M0-M2 串行，先让地点事实和绑定可见；在这之前不继续通过增加随机城市数量修补表象。
- M3 只修改生成约束和 engine 边界，M7 只修改展示与交互，两者可在数据合同冻结后用不重叠文件并行。
- M4 必须在 M3 后执行；没有临时地图版本和 remap 审阅前，不开放“保留地点重生成”的承诺。
- M5-M6 只消费 confirmed bindings；不得为了赶进度读取 provisional marker 当正式事实。
- 每阶段保持旧地图可读。新 binding 字段采用懒归一和缺省状态，不做破坏性整库迁移；失败时回退到旧地图 + 未绑定清单，而不是回退到随机落点并显示为成功。
- 地图 engine、renderer、世界书合同和地图 UI 分成独立提交切片；每片完成定向测试、浏览器 smoke、`verify:full` 和差异审查后再进入下一阶段。

#### 明确不做

- 不做完整 GIS、3D 地球、WebGPU 重写或自由手绘地形编辑器；
- 不让 LLM 直接决定坐标、cell ID 或绕过审阅写世界书；
- 不从长篇正文抽取所有专有名词并自动当地点；
- 不为地图另建世界书副本、地点副本或运行时影子数据库；
- 不恢复 `realism.level`，不以本轮地点融合为理由重写整个 Azgaar 管线；
- 不重做冻结的主题1，只维持共享功能可达与基本回归。

## Gate 3：历史融入与可解释涌现

目标：历史不是一次性生成的 lore，而是驱动开局、事件和世界变化的状态层。

预计：4-6 周。

### G3.1 接通现有历史链

当前进度（2026-08-05）：地图页已接入 `extractMapSemantics()` -> `generateGeoHistory()` 的纯函数管线；用户可在地图生成后逐项审阅语义点，再生成历史草案、预览节点和地点实体数量，最后显式写入 `worldbook.geoHistory`。历史节点已补齐 `placeRef`，进入冒险时写入 `runtimeState.historyNode` 和当前 `worldMapState.placeId`；每个剧情日志窗口会以稳定 ID 写入 `geoHistory.playerNodes`，并携带地点、时间、势力、角色和任务的有限世界状态快照。新增 `PlaceEntity` 索引，聚合同一地点的地图引用、历史节点和世界书条目；地图页现在可按统一地点实体设置冒险当前地点，GM 生成前按当前 `placeId` 通过该索引选择相关历史，再合并最近玩家经历。事件卷、设定页和地图已经支持地点以及历史节点 / 世界书条目的逐项互跳，新提取活动会继承当前地点。涌现候选、LLM 事件草稿和受限状态 delta 已接入：完整文本后生成 0-2 个可解释候选，用户点击通知后才请求严格 schema 事件草稿，在详情中预览“因为 A 和 B，所以 C”的变化并选择应用、拒绝或回滚。候选评分会消费当前地点状态/控制/危险度、同地点角色目标/知识和最近已确认因果变化；活动冲突会移除不可信字段，stale 事件不会进入候选依据。运行时因果报告已升级到 v2：受控记录地点控制、角色状态与写作年代，检测未经确认的控制权转移、复活、年代切换和时间回退，并沿父链/状态连续性边传播 rollback 或活动冲突造成的 stale；体验 Agent 与 Narrative Kernel 只接收压缩摘要，不接收完整事件日志。地图请求现在会对长世界观和地点上下文做分段压缩并使用 14000 字符输入预算；`burgNames` 会作用于所有聚落层级，耗尽后才回退风格内置名称，地图引擎生成的道路名只作为未绑定预览，地理历史候选要求与世界书地点匹配。真实浏览器刷新/重进 smoke 仍未完成。

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
- [x] 控制权/角色状态/年代冲突检测和候选应用后的下游过期标记；活动冲突与已回滚事实会以受限摘要进入体验 Agent。
- [x] 涌现候选评分消费活动因果变化、地点控制/危险度、角色目标和知识引用；冲突字段降级且 stale 事件不得作为候选依据。

验收：

- [x] 新项目能通过确定性 fixture 走地图 -> 语义点 -> 历史 -> 历史开局；
- [x] GM 上下文能解释当前地点历史节点、参与者、绑定条目和未决线索；
- [x] 剧情日志形成后玩家行为出现在世界书历史时间线上；
- [ ] 一次真实浏览器冒险 smoke，验证刷新/重进后的完整回写链。

### G3.2 世界状态与因果图

当前进度（2026-07-30）：`placeStates`、`characterStates`、`characterRelations`、`canonicalFacts`、`writingTime` 已进入 session runtime、联机受限 patch 和 state delta 白名单；关系只允许有限亲属类型，canonical fact 只允许 subject/predicate/标量 value/状态/置信度/来源。用户确认应用与回滚时记录归一化 before/after 和转移证明。因果报告 v3 检测控制权、复活、年代、亲属和 canonical fact 改写；跨分支合并读取各来源分支最后状态，对每个差异根要求显式 `chosenBranchId`，并建立 `branch-merge` 因果边。活动冲突及下游继续 stale，冲突关系/事实不会进入 Narrative Kernel、Experience ContextEnvelope 或涌现候选证据。主题 2 的结构化设定工作区已加入因果审阅带：可展开冲突、查看来源事件、确认当前状态或采用与当前结果一致的来源分支；审阅写入非上下文 `runtime-conflict-resolution` 事件，刷新后仍可追溯，伪造/不匹配分支不能清除冲突。结构损坏类冲突仍要求先修复事件。真实浏览器刷新/回滚 smoke 仍待完成。

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

- [x] 统一当前受控状态变更与 runtime event 的关系：涌现应用、回滚和联机同步共用可审计事件；
- [x] 实现受限 state delta apply，字段白名单、验证、预览和回滚；
- 阵营关系、地点控制、角色目标和线索状态由事件变化；
- [x] 每个涌现自动变化显示“因为 A 和 B，所以 C”，允许拒绝；
- [x] 冲突检测覆盖同一时间地点、角色生死、控制权、亲属、canonical fact、年代和显式跨分支合并差异；
- [x] 在历史/设定审阅界面显示关系、事实与分支冲突，并支持查看来源事件、确认当前状态或逐项确认来源分支。

验收：

- 用户可以从任一状态追溯到导致它的事件；
- 拒绝一次建议不会留下半应用状态；
- 回滚事件会恢复相应世界状态并标记下游内容可能过期。

### G3.3 涌现调度器

当前进度（2026-07-30）：已完成候选收集、评分、生成完成后通知、LLM 事件具体化，以及受限状态 delta。`emergenceScheduler.js` 从当前 PlaceEntity/runtime 上下文读取地点、历史线索、参与者、目标和阵营关系，输出最多 2 个稳定候选；候选评分现已加入当前地点状态/控制者/危险度、同地点存活角色目标/知识引用、未冲突亲属关系/canonical fact 和最近已确认因果变化，保存有界 `causalState` 与最多 8 个 source refs。地点控制冲突会移除不可信控制者，角色状态冲突会阻止对应角色驱动候选，亲属/事实冲突会屏蔽双方证据，rollback/stale 事件不会作为当前事实或来源。`generationEmergence.js` 只允许已知实体和严格白名单状态根，并把冲突代码作为警告而非事实；`runtimeEvents.js` 负责预览、逆操作、回滚冲突和因果 v3；`gameStore` 与 `QuestLog` 已接通生成、预览、应用、拒绝、回滚。下一步是补真实浏览器刷新、重进、回滚与冲突审阅可见性。

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

当前进度（2026-07-30）：`narrativeAssets.js` 保留旧 `source` 兼容形状，并补齐规范化 `sourceRefs[]`、稳定内容指纹和同项目同来源去重；章节选区重复保存会复用原资产，素材页可合并同项目条目并保留来源引用。体验保存素材与接受涌现草稿时会记录会话消息、当前历史节点、地图地点和剧情日志；素材进入章节/纲要后继承上游来源，导出分镜后继续保留到 storyboard document、写作 ContextLedger、分镜 Agent evidence refs 和视频任务。引用按继承来源优先，统一去重并限制为 12 条。对话保存前的短摘要、revision/tags、拆分、全局检索和跨项目迁移仍未完成。

任务：

- [x] narrative asset 增加 `projectId`、`sourceRefs[]`、`status`；
- [x] 地理/历史/会话/剧情日志来源沿素材 -> 章节/纲要 -> 分镜 -> Agent/视频任务保持可追溯，并进入写作与分镜 context ledger；
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
  artifactLineage: Array<{
    id: string
    parentAssetId?: string
    inputRevision: string
    origin: 'generated' | 'uploaded' | 'edited'
    createdAt?: number
  }>
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
- `comicPageStore.js`：漫画页、序列、格框、方向、制作阶段、视觉圣经和 stale 传播；视觉圣经随同一序列原子保存，不增加第二个存储 owner；
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

状态：实现完成（2026-07-30），真实文本模型与浏览器人工 smoke 保留为外部门禁。

- LLM 输出多页方案、页级 beat、页尾钩子和格级 beat，不再要求固定 4/6 格；
- 从 worldbook、地点、角色素材和已有插画组成有语义的参考绑定；
- 视觉圣经可人工增删参考并锁定不变量。

门禁：同一段素材可比较至少两个分页方案；每个角色/地点参考都能跳回来源；未确认视觉圣经不能批量生成。

实现结果：

- `/comics` 的“页面计划 / 整页制作 / 当前格”已成为真实工作态；页面计划允许从左侧同时选择最多 8 条素材，生成 2-3 个候选并查看每页 beat、页尾钩子和可展开的格级 beat；
- `comicAdaptationService` 使用现有文本模型配置生成严格 JSON，限制每个方案至少 2 页、每页 1-8 格，并把对白/旁白与无文字画面描述分离；
- worldbook 条目、PlaceEntity、角色素材、地点/道具素材和已有插画组成语义参考目录；视觉圣经可增删、锁定不变量并跳回世界书条目、地图地点或素材；
- 多页通过既有 `comic_pages_v1` 原子写入，同一序列共享视觉圣经；任何修改都会把确认状态和下游阶段标记为待审，确认前禁用批量补齐，单格人工制作仍可继续；
- 现有 media integration 用例内覆盖双候选、多页/自由格数、语义引用往返、多选素材、计划交互和确认门禁，不增加测试总数。

**M3：中央分镜与构图画布**

状态：代码门禁完成（2026-07-30），桌面/窄屏真实拖拽 smoke 保留为外部门禁。

- 支持格框拆分/合并/拖边、沟槽、阅读顺序、页漫/条漫画布；
- 支持景别、机位、透视、焦点、人物框、运动向量和气泡安全区；
- 导演数据生成构图提示与控制图，但不直接生成最终 render。

门禁：页面不是固定模板；任意格调整不重置其他格；手机宽度下中央画布和右侧检查器不重叠。

实现结果：

- 中央 `ComicCompositionCanvas` 直接显示实际漫画页，格框可纵/横拆分、无产物格合并、八向拖边并单独调整沟槽；阅读顺序与几何分离，页漫/右翻页漫/条漫共用同一画布契约；
- 人物框、运动向量、焦点、地平线和气泡安全区形成可视控制图，景别/机位/透视继续在右侧集中编辑；上述数据直接编译进单格生图构图提示，模型不绘制文字与气泡；
- `getComicPanelRect()` 成为预览、生图比例、裁切和 PNG 导出的统一几何 owner，消费持久 `frame` 与沟槽，不再以固定模板覆盖自由构图；
- 构图持久化按格比较 frame/direction，只把变化格的制作阶段标记 stale；纯顺序调整保留其他格几何和阶段。980px 以下继续使用“素材 / 页面 / 当前格”互斥 pane；
- 现有 media integration 用例内覆盖拆合、拖边算法、沟槽、条漫、stale 隔离、导演控制、提示词和中央工具栏，不增加测试总数。

**M4：草稿、线稿与局部修订**

状态：代码门禁完成（2026-07-30），真实 provider 质量与浏览器文件/拖拽操作保留为外部门禁。

- provider capability matrix 接入 UI；
- rough -> line 阶段链、上传替换、候选采纳、局部遮罩修复和 lineage 落地；
- 支持角色身份参考与 pose/edge/depth 分开绑定；
- 批量任务只推进已批准上游的格。

门禁：不支持结构控制的模型不会出现“保持构图转线稿”；单格失败不影响同页其他格；可以回到任意已批准 artifact。

实现结果：

- 图片 provider 暴露统一的文生图、图生图、局部遮罩、身份参考和独立结构控制能力；SD WebUI/OpenAI 接入真实 mask 参数，通用 HTTP 新增 `mask_image` 与带角色的 `control_images_json` 模板变量，MiniMax/基础 ComfyUI 不伪装支持本地参考或修订；
- 当前格制作区加入真实阶段工作台：草稿/线稿生成、人工上传替换、候选切换与大图预览、显式确认、遮罩修订，以及角色身份/服装/地点/道具/风格和 pose/edge/depth 参考绑定；M5 前的平涂、网点、上色和效果只显示状态，不提前开放假生成动作；
- `ComicStageState.artifactLineage[]` 与 MediaAsset `parentAssetId` 共同保存候选来源、上游、输入 revision 和生成/上传/编辑来源；漫画页 schema 升到 5，继续沿用 `comic_pages_v1` 与缺省归一化，不增加迁移 owner；
- 确认候选时校验当前分镜、视觉圣经和已批准上游的稳定输入指纹，旧候选不能从 stale 状态直接恢复有效；切换或批准上游会继续标记下游 stale；
- 批量线稿只选择草稿已批准且目标阶段为空/失效/失败的格；逐格顺序执行并分别记录失败，一格缺失上游二进制不会覆盖同页其他格的已生成线稿；
- 现有 media integration 单测试内覆盖能力矩阵、SD 遮罩请求、阶段谱系、旧 revision 拒绝、批量筛选、真实内存 rough -> approve -> line 和失败隔离，不增加测试总数。

**M5：彩色/黑白生产路线**

状态：代码门禁完成（2026-07-30），真实 provider 后期质量与浏览器上传操作保留为外部门禁。

- 彩色增加 flats、render、effects；黑白增加 blacks/tones、effects；
- 色板/网点/线条规则来自 visual bible；
- 每阶段能上传人工结果并继续下游。

门禁：线稿改变会使颜色/网点与效果 stale；平涂和光影可分别替换；黑白项目不显示彩色专属动作。

实现结果：

- `comicProductionService` 使用按色制解析的唯一阶段路线：彩色为 `rough -> line -> flats -> render -> effects`，黑白为 `rough -> line -> tones -> effects`；黑白效果真实消费已确认网点稿，彩色和黑白专属阶段互相拒绝；
- 平涂、网点、上色与效果都要求已确认上游和真实 image-to-image 能力；各阶段继续支持人工上传、候选切换、确认、遮罩修订与 MediaAsset 父子谱系，不支持保持上游画面的模型只允许上传；
- 阶段提示分别约束平涂不加光影、网点保持纯黑白、上色不重画色区、效果不遮挡叙事焦点，并按阶段消费视觉圣经的限定色板、线条规则、上色/网点规则和统一画风；
- 视觉连续性设置补齐限定色板编辑；修改色板、线条、网点规则、统一画风或色制会提升 revision、撤回视觉圣经确认并让已有阶段 stale。切换色制保留旧路线 artifact 作为可追溯历史，但不显示为当前路线动作；
- 右侧阶段工作台只显示当前色制阶段，以紧凑规则带展示真实色板 swatch、线条和网点/色光规则；批量可推进任意非草稿阶段，但序列视觉圣经未确认时返回空任务，逐格失败继续隔离；
- 现有 media integration 单测试内覆盖真实内存彩色 line -> flats -> render -> effects、黑白人工 line -> tones -> effects、提示规则、父链、色制专属门禁和上游替换 stale，不增加测试总数。

**M6：文字排版与出版导出**

- 状态：代码门禁完成（2026-08-01），真实字体渲染、PDF 阅读器和浏览器拖拽保留为外部门禁；
- 基础切片已完成（2026-07-19）：模型生图与脚本文字分离，脚本内容需明确排入后才成为 `letteringObjects`；对白、心声、旁白和拟声对象可编辑、拖动、缩放并进入整页预览和 PNG，未排入文字不会自动覆盖成图；
- 文字层现在保存 `textDirection`、`rotation` 和 `tailTarget`，编辑器/整页预览共用拖动、八向缩放和气泡尾巴事件；导出绘制横排、竖排、旋转、对白/心声尾巴和 SFX；
- 出版质检检查文字溢出、文字框重叠、视觉焦点遮挡、安全区、竖排对齐和对白尾巴；最终画面优先读取当前色制路线最后阶段的已选 MediaAsset，旧 `selectedTake` 仅作兼容回退；
- 导出页漫 PNG/WebP/PDF，竖向条漫按不截断格框的 1600px 上限切片；manifest 保留 schema `version: 5` 并新增 `manifestVersion: 2`，保证来源、层级、字体、位置与阶段谱系可重导。

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

当前状态（2026-08-01）：共享 provider、MediaAsset 和现有漫画页制作字段已贯通；M0-M6 完成代码门禁。漫画已从单条素材的副工作台迁入独立 `/comics` 工作区，页面计划可多选素材、比较多页方案、审阅页/格节拍，并从世界书、地点、角色素材和已有插画建立可回跳、可锁定的语义视觉圣经。中央构图工作台支持自由格框拆合/拖边、沟槽、阅读顺序、页漫/条漫和格级导演控制；当前格可沿 artifact lineage 分别推进彩色草稿/线稿/平涂/上色/效果和黑白草稿/线稿/网点/效果，任一阶段均可人工替换，provider 能力不足时生成动作明确禁用。文字层已支持字体、方向、旋转、尾巴、溢出/遮挡/安全区质检和 PNG/WebP/PDF、条漫切片、v2 manifest；下一步进入 M7 连续性质检与分镜转换，M2-M6 的真实模型质量和桌面/窄屏浏览器操作仍需在服务可用时 smoke。

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

### G4.6 体验叙事 Agent 与按需世界上下文

当前质量专项：[体验页叙事连续性与可读性计划](./experience-narrative-continuity-plan.md)。该计划不替换 G4.6.13 的单 transcript、工具证据和回合事务，而是在其上修复隐藏 continue 污染玩家历史、长回复尾部丢失、短碎提示词和半自动重复起势；执行顺序为 C0-C7，首个用户可验收切片是 C0-C3。

定位：把体验页从“生成前一次性拼装世界书、记忆和运行时文本，再进行一次流式生成”升级为受控的叙事 Agent。地理、历史、世界书和记忆继续由现有 store / service 持有，模型只通过少量只读工具按需取得证据；最终叙事仍沿用现有流式文本协议、阅读渲染和候选状态事务。

本节只参考可验证的公开材料：

- OpenCode 活跃公开仓库为 MIT 许可的 [`anomalyco/opencode`](https://github.com/anomalyco/opencode)，早期 [`opencode-ai/opencode`](https://github.com/opencode-ai/opencode) 已归档，不能把两代实现混为一谈；
- OpenCode 的公开 `session/prompt.ts` 使用有明确结束条件的 step loop，根据 `tool-calls / stop / compact` 继续或退出，并在达到 agent step 上限时注入终止提示；
- `session/tools.ts`、`tool/registry.ts`、`tool/tool.ts` 分别承担会话工具解析、工具发现/模型筛选、参数校验和统一执行；工具结果经过截断，旧工具输出还能在 compaction 中单独裁剪；
- OpenCode 对 JSON Schema、消息和模型参数做 provider-specific transform，并把权限、取消、重试、循环检测和工具状态作为运行时事实，而不是 UI 猜测；
- Anthropic 公开资料将 Claude Code 描述为“收集上下文 -> 行动 -> 验证”的工具循环，并建议在少量预加载与 just-in-time retrieval 之间采用混合策略。

2026-03-31 的 npm source map 事故已由多家媒体确认，Claude Code 源码曾被公开暴露；但公开暴露不等于 Anthropic 以开源许可证授权使用（[Axios](https://www.axios.com/2026/03/31/anthropic-leaked-source-code-ai)、[TechCrunch](https://techcrunch.com/2026/04/01/anthropic-took-down-thousands-of-github-repos-trying-to-yank-its-leaked-source-code-a-move-the-company-says-was-an-accident/)、[InfoQ](https://www.infoq.com/news/2026/04/claude-code-source-leak/)）。因此不直接读取、复制或依据该未授权专有源码复刻实现；Pinax 的实现只建立在本仓库数据模型、公开协议、官方文档和有明确许可证的公开开源代码之上。

#### G4.6.1 当前事实与问题边界

当前体验主叙事链路：

```text
gameStore.generateAIResponse()
  -> buildGeoHistoryRuntimeContext()
  -> buildWorldbookContext()
  -> buildScopedMemoryRecallContext()
  -> worldbook / memory / runtime 变为 system messages
  -> runGenerationStreamTask()
  -> parseNarrativePresentation()
  -> chatHistory / runtime event / memory candidate
```

这不是“把完整数据库全部塞给模型”：世界书已有 constant、history-bound、关键词和 token budget；地理历史只取当前地点附近的小切片；记忆也有排序和条目长度限制。但它仍然是 pre-inference eager retrieval：

1. 检索发生在模型理解本轮意图之前，模型不能决定本轮是否需要历史、地点或角色资料；
2. 第一次关键词未命中后不能换查询、沿实体关系继续读取或请求某个条目详情；
3. 世界简介、写作风格、示例和结构化设定仍可能因一次条目命中而整体进入高优先级消息；
4. `memoryQuery` 混入已选世界书和运行时文本，容易强化第一次检索的偏差；
5. 世界书普通内容与真正的硬规则都以 system prose 出现，数据与指令的信任边界不够清楚；
6. 现有 `/api/generate/stream` 只规范化文本，不保留 provider 的 tool call / tool result 结构；
7. 全量会话继续累积，服务端只在字符预算超限时裁剪，没有对历史工具结果、场景摘要和最近完整轮次分别管理；
8. 条目概率随机激活适合氛围或涌现，不适合作为事实检索；同一输入可能得到不同事实集合，难以复现和审计。

G4.2 已提供可复用基础，但不能直接冒充主叙事 Agent：

- `ContextEnvelope`、revision、sourceRefs、ledger、trace 和 provider adapter 已覆盖专业任务；
- `experience.next-actions / experience.emergence` 是受限候选任务，仍使用一次性 envelope；
- 写作、画布和分镜事务已经证明“模型给建议，owner 校验并提交”可行；
- `PlaceEntity`、geo-history runtime context 和 scoped memory 已具备稳定引用与局部读取入口。

主叙事循环必须作为 G4.2 上层的新运行时，复用这些契约，不把所有专业 Agent 改成无限循环。

#### G4.6.2 目标架构与控制流

概念边界：

- **Resource**：世界书条目、PlaceEntity、历史节点、玩家历史、已确认记忆和 runtime snapshot；
- **Tool**：查询、读取、追溯这些资源的受控函数；
- **Kernel**：每轮必需且足够小的场景工作集；
- **Agent loop**：模型请求工具、应用执行、结果回传、模型继续的有限状态机；
- **Transaction**：最终叙事产生的世界变化候选，经过 owner 校验和用户确认后写回。

```text
Experience turn
  -> buildNarrativeKernel()
  -> Agent round 1 (non-streaming, tool choice auto)
      -> final intent ------------------------------┐
      -> tool calls -> validate -> local execute    |
                       -> capped tool results        |
                       -> Agent round 2              |
                           -> optional final tools   |
                           -> Agent round 3 / stop   |
                                                     v
  -> final narrative stream
  -> parseNarrativePresentation()
  -> deterministic continuity validation
  -> runtime / memory / emergence candidates
  -> existing review and transaction owners
```

状态机至少包含：

```text
idle
  -> preparing-kernel
  -> deciding
  -> awaiting-tools
  -> executing-tools
  -> deciding
  -> streaming-final
  -> validating
  -> completed | cancelled | failed | fallback
```

每次状态变化写入结构化 trace。页面只能根据 trace 显示“查阅地点 / 追溯历史 / 组织叙事”等短状态，不展示、保存或伪造模型内部思维过程。

#### G4.6.3 最小常驻内核

常驻内容按职责而不是按数据来源划分：

| Block | 内容 | 首版预算 | 说明 |
|---|---|---:|---|
| `rules` | 叙事身份、玩家控制权、输出标记、安全与禁止事项 | 900 chars | 硬约束，不从普通世界书内容推断 |
| `turn` | 当前玩家输入、输入类型、请求时间 | 1200 chars | 不允许被工具结果覆盖 |
| `scene` | 当前地点/时间、在场角色、当前动作、对话对象 | 1800 chars | 使用稳定 ID，并保留短显示名 |
| `recent` | 最近 2 个完整语义轮次 | 3600 chars | 保留对话归属和 presentation 语义，不只留纯文本 |
| `continuity` | 当前目标、未决动作、上一轮已确认状态变化 | 1600 chars | 只放强连续性事实 |
| `style` | 极短风格指纹 | 600 chars | 示例文本不默认常驻 |
| `tool_catalog` | 4 个领域工具的名称、用途和 schema | provider 实际 token | 不加载无关写工具 |

硬规则来自明确字段：`forbidden`、`rule` 类型 constant 条目和产品级玩家控制权规则。普通 lore、角色传记、地点长描述、历史详情、示例文本、远方地图信息和长期记忆全部退出常驻内核。

Kernel 必须能够支持“不调用工具也能完成的轻动作”，例如观察眼前物品、继续当前一句对话或执行已经明确的短动作；否则模型会把工具调用当成每轮税费。

#### G4.6.4 首批只读工具

首批只提供四个领域工具。相关操作通过 `action` 收敛，避免为每种实体和动作创建几十个工具：

| Tool | Actions | 主要用途 | 不得承担 |
|---|---|---|---|
| `world_lookup` | `search / get / related` | 角色、组织、地点 lore、物品、规则和普通条目 | 修改世界书、生成新设定 |
| `geo_lookup` | `current / get / nearby / route` | 地点详情、上下级区域、邻接、路线与地理约束 | 改当前位置、重新生成地图 |
| `history_lookup` | `search / get / trace` | 按地点、人物、时间、因果和未决线索追溯事件 | 写入历史、触发随机事件 |
| `memory_lookup` | `search / get` | 项目/会话范围的已确认经历、关系和事实 | 自动确认候选记忆 |

统一输入约束：

```ts
interface NarrativeReadToolInput {
  action: string
  query?: string
  ids?: string[]
  filters?: {
    entityTypes?: string[]
    placeIds?: string[]
    characterIds?: string[]
    timeRange?: { from?: string; to?: string }
    scopes?: Array<'project' | 'session'>
  }
  limit?: number
  cursor?: string
}
```

统一结果契约：

```ts
interface NarrativeToolResult {
  tool: string
  action: string
  query: string
  revision: string
  items: Array<{
    id: string
    type: string
    title: string
    summary: string
    relations?: Array<{ type: string; targetId: string }>
    sourceRefs: string[]
    matchReasons: string[]
  }>
  truncated: boolean
  nextCursor?: string
  warnings: string[]
}
```

约束：

- 每次最多返回 6 项、总计 4200 字符、单项摘要最多 520 字符；
- `get` 可返回更完整单项，但仍限制 2800 字符；
- 参数先过共享 schema，非法参数作为 typed tool error 返回模型，允许在轮数预算内修正一次；
- 结果只包含数据，不夹带“你必须如何回答”的指令；
- 所有条目带 canonical ID、revision、sourceRefs 和 matchReasons；
- 找不到内容返回成功的空集合，不用虚构占位数据；
- 同一轮相同参数按 `tool + args + resourceRevision` 缓存；
- factual lookup 不执行概率抽样；随机性只保留在 emergence scheduler。

#### G4.6.5 检索与索引

不把“模型会调用工具”误当成检索质量已经解决。工具执行仍使用确定性、可解释的本地检索：

1. **实体精确层**：ID、名称、别名、关键词和显式绑定；
2. **结构过滤层**：类型、placeId、参与者、时间范围、项目/会话 scope；
3. **图扩展层**：PlaceEntity 邻接、history links、entry bindings 和角色/组织关系，默认深度 1；
4. **文本排序层**：中文 token、BM25/关键词覆盖、近期性、当前地点和显式引用加权；
5. **可选语义层**：只作为召回补充，不替代 ID 和图约束；首版不强依赖远端向量库。

新增 `NarrativeResourceIndex`：

- 由 active worldbook、geoHistory、player history 和 confirmed memories 建立分域索引；
- 使用各 owner 的 revision 增量重建，不在每次工具调用中全量扫描 localStorage；
- 保存规范化 token、aliases、placeIds、participants、time bounds、relation targets 和 sourceRefs；
- 索引属于可重建缓存，不进入项目真相源和备份；
- 工具查询只读取 owner snapshot，不持有第二份可编辑世界状态。

当前 `buildWorldbookContext()` 只在 M0/M1 期间用于记录旧链基线。M2 provider 协议通过后直接切换体验主链，并在同一提交中移除它在 `generateAIResponse()` 中的生产调用；不做双写、长期 fallback 或第二套检索规则。`memoryQuery` 由按需工具输入取代，不再把已命中的大段世界书文本作为查询主体。

#### G4.6.6 浏览器、服务端与供应商边界

Pinax 的主要项目数据在浏览器 localStorage / IndexedDB，首版工具执行应留在浏览器：

```text
Browser
  NarrativeAgentOrchestrator
  NarrativeResourceIndex
  ReadToolRegistry
  world / game / memory stores
        |
        | normalized agent turn
        v
Express
  provider capability resolver
  OpenAI-compatible adapter
  Anthropic adapter
  typed unsupported-provider error
        |
        v
Model API
```

服务端新增 provider-neutral agent turn，不接触完整项目数据库：

```text
POST /api/generate/agent-turn
  -> { kind: 'tool_calls', calls[], usage, finishReason }
  -> { kind: 'final_ready', text?, usage, finishReason }
  -> typed provider / schema / protocol error
```

第一、二轮使用非流式 agent turn，便于可靠取得完整 tool calls。确认模型不再请求工具后，最终叙事仍调用现有 stream endpoint；最终调用带入本轮 kernel、经过裁剪的工具结果和“现在输出正文”的明确约束。

provider adapter 统一：

- OpenAI-compatible：`tools / tool_choice / assistant.tool_calls / tool messages`；
- Anthropic：`tools / tool_use / tool_result / stop_reason`；
- 自定义兼容渠道：只有显式 capability test 通过后才能启用；
- Cohere 和未知 provider 首版默认 `supportsTools=false`，连通性测试明确提示该渠道暂不支持体验 Agent，不静默回退旧上下文链；
- capability 至少包括 `toolCalls`、`parallelToolCalls`、`strictSchema`、`streamToolCalls`、`structuredOutput`；
- 不以模型名称字符串猜完整能力，配置结果可被用户连通性测试和运行错误降级修正。

不引入 OpenCode 的 Effect runtime、数据库层或完整 AI SDK。Pinax 只借鉴层次和协议，继续使用现有 Vue service、Pinia owner、Express route 和 fetch/SSE 基础。

内部工具首版也不需要启动 MCP server。工具注册表采用 MCP-compatible 的 name/description/schema/result 思路，等未来确有外部编辑器访问世界书的需求时再增加协议适配，不让远程协议增加本地叙事延迟。

#### G4.6.7 循环、预算、压缩与恢复

首版硬限制：

- 最多 2 轮工具结果回传，最多 3 次模型决策；
- 每轮最多 4 个并行只读调用，整轮最多 6 个工具调用；
- 工具结果进入模型的累计上限 7200 字符；
- 整个 agent turn 软时限 12 秒，单工具本地执行 800ms；
- 连续 2 次同名同参调用立即返回 loop error，不执行第三次；
- 用户取消、切换会话、重新生成或房主失去权威时，AbortSignal 终止当前 loop；
- 最终正文开始流式输出后不再允许工具调用，避免正文半途停下查询；
- 工具阶段失败返回 typed error 并清理本轮占位、trace 和未提交结果；认证、协议和内容安全错误不得盲目重试，也不偷偷改走旧 eager path。

长会话采用分层压缩，不直接复制 coding agent 的通用 summary：

1. 保留最近 2 个完整语义轮次；
2. 更早轮次压成 scene summary，包含已确认事实、角色关系变化、地点变化、未决线索和 sourceRefs；
3. 旧工具结果只保留工具名、参数摘要、命中 IDs 和最终采用的 sourceRefs，删除大段返回内容；
4. 已进入世界状态或已确认记忆的事实不在会话摘要中重复保存全文；
5. 压缩产物带 `coversMessageIds`、resource revisions 和生成时间；
6. revision 不匹配时仅重建受影响块，不把整个历史重新展开；
7. UI 仍只显示“【压缩完成】上下文已压缩完成”，内部结构不暴露为正文。

这对应 OpenCode 将消息压缩和旧工具输出裁剪分开的做法，但 Pinax 的保护对象是叙事事实与来源，而不是文件修改记录。

#### G4.6.8 权限、安全与状态写入

读工具默认允许访问当前项目，但仍通过统一 policy：

- `world_lookup / geo_lookup / history_lookup` 只能读 active worldbook 及其关联地图/历史；
- `memory_lookup` 必须显式限定 project/session scope，不能跨项目搜索；
- 联机模式仅房主浏览器执行本地工具，其他成员只收到短工具状态和最终权威事件；
- 工具 trace 不记录 API key、完整 prompt、完整世界书内容或完整记忆，只记录参数摘要、IDs、字符数、耗时和错误码；
- 用户创作的普通条目按 untrusted data 处理，不能通过内容文本提升为 system instruction；
- 只有 schema 中明确标记的 hard rule 才进入 kernel，规则来源必须可在 ledger 中追踪；
- 只读叙事 Agent 没有 `write_worldbook`、`move_player`、`append_history`、`confirm_memory` 等工具；
- 叙事产生的移动、关系、物品、历史或记忆变化继续形成 typed candidate，由现有 owner/revision/transaction 校验；
- tool result 中引用不存在、revision 过期或跨项目 ID 时整项拒绝，不能部分采用。

首版不为纯读取弹权限框。未来新增有副作用工具时，必须像现有专业 Agent 一样进入审阅托盘，并提供 diff、来源、应用和撤销；不能复用“读工具默认允许”策略。

#### G4.6.9 体验与联机表现

单机体验：

- 输入提交后立即建立 assistant placeholder，但正文区不显示空白大块；
- 工具阶段在输入区附近显示单行状态，例如“查阅旧港 · 2 条历史”，状态完成后自动淡出；
- 用户可从上下文台账查看本轮用了哪些资源及其来源，不显示内部推理；
- 最终正文开始后恢复现有逐字/分块渲染、对话样式和操作工具；
- 重新生成创建新的 agent turn，不复用上一轮未完成工具结果。

联机体验：

- 房主是唯一 generation owner，也是唯一工具 executor；
- `narrative.request` 产生一个 commandId，工具阶段广播低敏感状态事件，最终正文仍只提交一次；
- 房主断线或转让期间取消未完成 loop；新房主不能接管旧浏览器中的本地工具快照，只能从同一输入重新发起新 command；
- 成员端不接收世界书工具原文，避免联机房间变成项目数据导出通道；
- trace 和 runtime candidate 随权威 event seq 对齐，重连不会重复显示工具状态或提交正文。

#### G4.6.10 分期执行

**M0：契约、基线和可观测性（已完成，2026-07-29）**

- 固化 `NarrativeKernel`、`NarrativeToolCall`、`NarrativeToolResult`、`NarrativeAgentTurn` 和 capability schema；
- 用现有 ContextLedger 记录当前 eager path 的输入字符、来源、命中和生成耗时；
- 建立至少 40 个离线场景夹具：轻动作、旧事件、跨地点历史、同名角色、角色关系、路线、空检索、恶意条目、长会话和 unsupported provider；
- 标记当前输出中的事实矛盾、无依据人物、错误地点历史和上下文字符基线；
- 生产正文暂不切换；`lastContextLedger` 同时记录最小 Kernel 与旧链字符/命中基线。

Gate 已通过：`npm run eval:narrative-context` 的 40/40 场景通过，固定 snapshot 的 kernel/resource/audit revision 可重复；ledger 只记录统计、短预览和 sourceRefs；测试总量仍为 200。

**M1：本地资源索引与只读工具（已完成，2026-07-29）**

- 实现 `NarrativeResourceIndex` 和四个 read tool executor；
- exact ID、aliases、结构过滤、图扩展和文本排序分层实现；
- schema validation、revision、sourceRefs、缓存、截断和 typed empty/error 齐全；
- 通过 `scripts/narrative-context-eval.mjs` 直接调用工具，不接模型。

Gate 已通过：世界书、地点/路线、世界历史/玩家历史和 project/session 记忆共 40 个场景目标证据全部命中；跨 scope 记忆为空集合，非法 schema/limit 返回 typed error；相同 snapshot+args 复用同一 revision 和调用缓存。

**M2：统一 tool-call provider 协议（代码完成，2026-07-29；真实 provider Gate 待验证）**

- 新增 provider-neutral `/api/generate/agent-turn`；
- 完成 OpenAI-compatible 和 Anthropic 请求/响应转换；
- 保留 assistant tool call 与 tool result 的结构，不再压成纯文本；
- 实现 capability test、invalid-schema、partial call、parallel calls、cancel、timeout 和 provider error；
- Cohere 返回明确 capability error；custom/unknown 依照显式 format 或现有 OpenAI-compatible 约定尝试，协议不兼容时返回 typed error，不静默降级。

代码 Gate 已通过：provider-neutral route、两类 adapter、结构保留、并行调用、invalid/partial call、取消、超时、429/5xx 和 typed failure 均有契约断言，核心 188 + 视觉 12 保持不变。发布 Gate 待完成：至少两个真实兼容 provider 完成“请求工具 -> 本地结果 -> 继续 -> 最终响应”；协议错误不会返回假正文；已知没有工具能力的渠道在生成前明确阻止并给出可操作错误。

**M3：工具选择与检索评估（并入 M2/M4，不做影子生产链）**

- provider adapter 契约测试直接运行模型工具选择，生产代码不维持一套影子 eager 链；
- 比较模型调用、当前关键词命中和夹具目标证据；
- 记录 over-call、under-call、空调用、重复调用、无效参数、额外延迟和上下文节省；
- 调整工具描述、action 边界和结果字段，不根据个别示例堆 prompt 特判。

Gate：有资料需求的夹具工具选择正确率至少 85%；轻动作中至少 70% 不调用工具；有效调用中至少 85% 返回被最终任务需要的证据；无循环超过硬限制。

**M4：直接切换体验主链（代码完成，2026-07-29；生产 Gate 待验证）**

- `generateAIResponse()` 只负责页面生命周期，Agent loop 下沉到独立 orchestrator；
- 支持工具 provider 使用 kernel + 最多两轮只读工具，最终正文单独流式生成；
- unsupported、超时和协议失败按错误类别结束本轮并清理临时状态；
- `parseNarrativePresentation()`、消息操作、记忆候选和 runtime candidate 行为保持；
- 同一提交删除 `generateAIResponse()` 中世界书/地理历史/长期记忆的 eager 注入，不保留双写或长期兼容分支。

Gate：普通不调用工具轮次的首 token 延迟相对 baseline 增量不超过 300ms；调用一次工具时 300ms 内出现可理解状态；最终叙事不包含工具 JSON、内部状态或未处理标记；取消和重新生成没有孤儿调用。

代码 Gate 已通过：`generateAIResponse()` 已直接切换到独立 orchestrator，旧世界书、地理历史、长期记忆和 Mem0 eager 注入从体验生成链删除；两轮/四并行/六调用、同参第三次阻止、7200 字符结果预算、取消清理与稳定占位 ID 均有现有契约测试断言。最终正文仅接收 Kernel、实际工具证据和当前输入，并继续使用既有流式 presentation parser。40/40 本地检索 eval、核心 188 + 视觉 12、双构建与 diff check 通过。生产 Gate 仍待真实 provider 测量首 token、状态出现时延、正文泄漏率和孤儿调用。

**M5：缩减 eager context 与长会话管理（代码完成，2026-07-29；真实质量 Gate 并入 M6）**

- 普通世界书、历史、长期记忆和示例退出 supported-provider 常驻上下文；
- 保留 hard rules、scene kernel、最近轮次和必要连续性；
- 实现 scene summary、旧工具结果 pruning 和 revision-aware compaction；
- ContextLedger 增加 kernel/tool/summary/fallback 分区和实际使用量；
- 当前 builder 退出体验主叙事链，只保留仍有明确调用者的写作/触发器用途。

Gate：无关轮次上下文字符较 baseline 中位数下降至少 40%；40 个夹具的事实矛盾率不高于 baseline，地点/历史相关任务的有效证据率明显提升；长会话压缩后仍能追踪来源和未决线索。

代码 Gate 已通过：普通世界书、历史、长期记忆和固定示例均已退出体验主链常驻上下文；长会话以 revision-aware 场景摘要、最近四条消息和必要连续性进入 Kernel。摘要按 project/session/source revision 缓存并随会话保存，旧消息编辑后重建；手动上下文摘要可继续进入新 Kernel。最终生成前裁剪同轮重复工具证据，跨轮不保留旧结果；ContextLedger 和 audit 区分 kernel/summary/tool，并记录实际与裁剪字符。固定 40 轮 eval 从完整历史基线 6514 字符降至 1964 字符，下降 69.85%，40/40 资源检索仍通过；核心 188 + 视觉 12 与双构建通过。真实模型事实矛盾率、地点/历史证据采用率与生产中位数继续在 M6 的 60 轮观察中验收。

**M6：联机、UI 和生产门禁（3-5 天）**

- 工具状态接入体验页现有瞬态层和 ContextLedger，不增加独立 Agent 聊天窗；
- 联机只由房主执行，状态与最终正文进入有序事件；
- 真实 provider 运行不少于 60 轮，覆盖不调用、单轮调用、多跳、空结果、取消、超时和 typed failure；
- A/B 检查 token、首 token、总耗时、工具次数、采用证据、错误事实和用户重试率；
- 通过门禁后直接发布主链；若回归不可接受，回退切换提交，不在运行时保留第二套链路。

Gate：

- 95% 轮次不超过 2 轮工具结果回传；
- 重复同参调用不会执行第三次；
- supported provider 的工具协议成功率至少 98%；
- typed failure 清理率 100%，且用户能看到真实失败原因；
- 地点/历史夹具中的无依据事实较 baseline 至少下降 30%；
- 双浏览器联机每个 commandId 只有一次模型调用 owner 和一次最终正文；
- 主题2 1440/390 不增加遮挡、横向溢出或空白正文占位；
- 核心测试 + 视觉测试总量继续不超过 200。

代码阶段进度（2026-07-29）：M6 本地实现已完成。体验页在正文与输入之间复用低干扰瞬态层，只展示场景核对、资料查阅、续写和短失败原因，不暴露工具参数或思考过程；执行轮数与调用数进入 ContextLedger。联机协议新增有序 `narrative.status`，稳定 `requestId` 贯穿房主请求、状态、唯一正文和 runtime patch。服务端从原请求事件恢复权威行动文本，拒绝非房主状态、无对应请求和同请求重复完成；成员空会话不再自动初始化模型，房主失权或断线会取消本地 loop。生产观测以同一 `requestId` 记录 provider/model 枚举、决策/首段/总耗时、工具轮次/调用/证据、token、上下文字符、结果与失败清理，最多保留 120 轮且不保存正文、prompt、Base URL 或 API key。`npm run report:narrative-production -- --input <metrics.json> [--annotations <quality.json>] [--baseline <baseline.json>]` 输出门槛、分位数和 A/B 差值；缺少 60 轮、typed failure 或事实标注时不会判定发布就绪。现有 Agent/会话测试内增加服务端级权限、顺序、幂等、60 轮汇总、隐私和清理覆盖，测试总量不增加；主题2体验页常规/长会话的 1440/390 共 4 张截图无横向溢出、固定层重叠或 console error。

外部 Gate 执行工具也已完成：`npm run smoke:narrative-production -- --config <provider.json>` 通过实际体验输入顺序运行 60 个合成场景，生成无正文 metrics、合成输出复核文件和人工标注模板；场景覆盖 no-tool、世界/地理/历史/记忆、multi-hop、empty result、continuity 及受控 429/timeout。`npm run smoke:online-narrative -- --config <provider.json>` 通过两个隔离 Chromium context 加入同一 URL，验证成员提案、房主唯一调用和 requested/completed 的 `requestId` 一致性。runner 不启动服务，不将 provider config 写入报告，且 `--dry-run` 与共享 fixture 契约已通过。真实 OpenAI-compatible 与 Anthropic/MiniMax 结果、人工事实 A/B、真实取消/重生成和双浏览器实机仍是发布门禁，不能由 dry-run 或本地夹具替代。

#### G4.6.11 候选文件与所有权

共享契约：

- `shared/narrativeAgentContract.js`；
- `shared/generationToolContract.js`；
- 复用 `shared/agentContextContract.js` 的 sourceRefs / revision / ledger 规则。

浏览器运行时：

- `src/services/agents/experienceNarrativeAgent.js`；
- `src/services/agents/narrativeToolRegistry.js`；
- `src/services/agents/tools/worldLookup.js`；
- `src/services/agents/tools/geoLookup.js`；
- `src/services/agents/tools/historyLookup.js`；
- `src/services/agents/tools/memoryLookup.js`；
- `src/services/agents/narrativeResourceIndex.js`；
- `src/stores/gameStore.js` 只做入口与页面状态接线。

服务端：

- `server/routes/generationAgent.js`；
- `server/services/toolCallingProviderAdapter.js`；
- `server/services/providers/openAiToolAdapter.js`；
- `server/services/providers/anthropicToolAdapter.js`；
- `server/routes/chat.js` 保留文本与最终 streaming owner，不继续塞领域工具逻辑。

UI：

- `src/components/experience/NarrativeAgentStatus.vue`；
- 复用/扩展 `AgentContextLedger.vue`；
- `Experience.vue` 只接状态和取消，不内置工具执行器。

#### G4.6.12 测试预算、回滚与非目标

测试继续服从 200 上限：

- 在现有 `gameStoreSession`、agent contract 和 provider tests 中参数化增加 tool loop 场景，先删除或合并等量低价值重复断言；
- schema、provider normalization、loop termination、abort、typed failure 和 sourceRef 校验使用纯契约测试；
- 40 个质量夹具与 60 轮真实 provider 属于 eval/smoke，不按每个案例生成一个 Vitest；
- 浏览器 smoke 覆盖单机、长会话、取消、重新生成和双浏览器房主权威。

回滚策略：

- 以 M2 provider 协议提交和 M4 主链切换提交作为两个清晰 Git 回退点，不维护运行时双链；
- 新索引全部可重建，不修改存档 schema；
- agent trace 只作诊断，删除 trace 不影响会话和世界状态；
- 新路径失败不得写入半成品 assistant 正文、候选记忆或 runtime patch；
- 回退只恢复代码路径，不需要迁移或回滚用户数据。

明确非目标：

- 不实现无限自主 Agent、多 Agent 叙事团队或后台自行推进剧情；
- 不展示 chain-of-thought，也不把“思考中”伪造成模型推理记录；
- 不让主叙事 Agent 直接写世界书、移动玩家、确认记忆或提交历史；
- 不要求首版部署向量数据库、MCP server 或 OpenCode 的运行时框架；
- 不把所有专业 Agent、写作补全和媒体生成改成同一个循环；
- 不替换现有 narrative presentation parser 和主题2阅读设计；
- 不直接读取、复制或依据已公开暴露但未获开源许可的 Claude Code 专有源码实现或验证功能。

#### G4.6.13 单 transcript 工具运行时纠偏计划（R0-R8）

状态：R0-R8 与 2026-08-14 P0-P5 运行时收口已完成。2026-08-18 真实性 MVP 又加入 selected-speaker 有界 voice profile、world→politics 只读链和 detached shadow critic；critic 不构成第二条生产生成链，不能改可见正文，只保存 allowlist 低敏指标且不保存原文/内容指纹。剩余工作是真实 provider 矩阵、取消/重连 smoke 与发布收口。以下设计记录继续作为协议真源。

##### 纠偏结论

当前实现并不是完整的 provider tool loop，而是两个逻辑会话：

```text
Kernel -> 资料调度请求 -> 浏览器工具 -> READY
                                      -> 新建普通 /api/chat/stream -> 正文
```

`runNarrativeToolLoop()` 虽然把 assistant tool call 与 tool result 回传给调度模型，但 `runNarrativeAgentGeneration()` 最终重新构造只有 Kernel + 压缩 evidence 的正文消息；调度 transcript、provider content blocks、reasoning signature、tool call ID 与修复历史不会进入最终生成。非法参数、缺失调用和空响应目前还可能直接进入无工具 fallback，导致“页面可用”掩盖“事实依据已丢失”。

目标改为单一临时 transcript：

```text
Experience turn
  -> NarrativeKernel + current user message
  -> provider step 0 (tools=auto)
      -> terminal text ------------------------------------------┐
      -> assistant content blocks + tool calls                   |
           -> browser validates policy and executes read tools   |
           -> append exact assistant step + typed tool results   |
           -> provider step 1 with the same transcript           |
                -> repair / more tools / terminal text ----------|
  -> normalized final text stream or completed terminal text     |
  -> narrative presentation parser                               |
  -> continuity validation / runtime candidates / memory         |
                                                               v
                                                        committed message
```

硬规则：

- 同一轮的 system、user、assistant content blocks、tool calls 和 tool results 必须属于同一个 transcript；禁止在取得工具结果后清空会话重新生成正文。
- 当前玩家输入必须是 transcript 中真实的 `user` message，不再只埋在 system JSON 的 `turn` block 中。
- provider 返回了可用终态正文时直接采用，不再丢弃后让模型重复写一遍。
- 需要额外最终流式请求时，必须在同一 transcript 后追加受控 finalization message，并设置 `toolChoice=none`；不得重建干净 prompt。
- reasoning 文本不展示、不写 localStorage、不写 trace；但 provider 要求回传的 thinking signature、redacted data、encrypted reasoning 或 reasoning field 必须在本轮内原样保留。
- 世界书、地图、历史和记忆继续由原 owner 持有；工具运行时只有快照读取权，不建立第二份事实库，不改变三种世界书导入流程。
- 首版仍只有四个只读领域工具；不借机引入写工具、MCP server、多 Agent 或无限自主循环。

调研依据：

- OpenAI 官方 function calling 要求把 assistant tool call 与对应 `tool_call_id` 的 tool result 追加回原消息序列，再让模型继续；严格模式要求完整 JSON Schema 约束：<https://developers.openai.com/api/docs/guides/function-calling>。
- Anthropic 官方要求回传原 assistant `content` 和 user `tool_result`，并以 `tool_use_id` 对齐；thinking/tool blocks 的顺序属于消息协议：<https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>。
- MiniMax 当前推荐 Anthropic-compatible 路径并支持 thinking/interleaved thinking，同时保留 OpenAI-compatible 路径：<https://platform.minimaxi.com/docs/guides/text-generation>。
- Vercel AI SDK 已提供多步 tool loop、`stopWhen`、tool error parts、step callbacks、OpenAI-compatible 自定义 base URL 和统一流事件；Pinax 使用它承担供应商协议解析，不把领域 policy 交给 SDK：<https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling>、<https://ai-sdk.dev/providers/openai-compatible-providers>。
- OpenCode 的 MIT 公开实现将 session loop、stream processor、tool registry 和 provider transform 分层，并专门保留 reasoning/provider metadata、工具状态、doom-loop 检测与 provider-specific message transform：<https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/prompt.ts>、<https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/processor.ts>、<https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/provider/transform.ts>。Pinax 只借鉴边界，不复制其 Effect、数据库、权限系统或 coding-agent prompt。

##### 目标文件与职责

新增：

- `shared/narrativeTranscriptContract.js`：单轮临时 transcript、content part、tool result、step、finish reason、provider metadata allowlist 与大小限制的唯一共享契约。
- `src/__tests__/fixtures/narrative-tool-transcripts/`：脱敏后的 OpenAI Chat/Responses、Anthropic、MiniMax 与畸形兼容响应；fixture 只保留协议结构，不保存真实正文、世界书、API key 或完整 reasoning。
- `server/services/providers/providerCapabilityResolver.js`：静态安全默认值、真实 probe 结果、运行期降级和 provider/model/baseUrl 维度缓存。
- `server/services/providers/openAiResponsesToolAdapter.js`：OpenAI Responses API 的 function call/output 与 response item 转换；Chat Completions 继续由现有 adapter 负责。
- `server/services/providers/minimaxToolAdapter.js`：MiniMax Anthropic/OpenAI 两条兼容路径的鉴权、温度、thinking 回传与已知字段差异；结构转换复用基础 adapter。
- `src/services/agents/narrativeAgentPolicy.js`：grounding 等级、步骤/调用/token/deadline 预算、可重试分类、repair 次数和 fallback 决策。

修改：

- `package.json`、`package-lock.json`：把 `ai`、`@ai-sdk/openai`、`@ai-sdk/openai-compatible`、`@ai-sdk/anthropic` 和 `zod` 声明为直接服务端依赖，禁止依赖 `mem0ai` 偶然带入的 SDK 版本。
- `shared/generationToolContract.js`：由简化 role/content/toolCalls 消息升级为 transcript step request/response；旧字段只在路由输入边界短期解析，本轮结束不持久化。
- `shared/narrativeAgentContract.js`：保留领域工具 schema，补严格 schema 版本、`isError`、`evidenceRefs`、cursor 和 control metadata；不承载 provider 消息结构。
- `server/services/toolCallingProviderAdapter.js`：降为 provider factory + capability/policy bridge；具体消息、流和 reasoning 转换交给 AI SDK provider 与薄 adapter。
- `server/services/providers/openAiToolAdapter.js`：完整保留 text/refusal/reasoning/tool-call parts，按能力发送 strict 与 parallel 参数，不再只解析 `choices[0].message.content`。
- `server/services/providers/anthropicToolAdapter.js`：完整保留原 content block 顺序、thinking signature/redacted data、tool_use 与 stop reason；映射 `disable_parallel_tool_use`。
- `server/routes/generationAgent.js`：提供规范化 step 与 SSE stream，返回 typed events，不执行浏览器工具。
- `server/routes/chat.js`：`/chat/test` 从“只访问 models”升级为文本 + 工具往返 capability probe；普通聊天仍保留，体验主叙事完成切换后不再通过它拼接工具 evidence。
- `src/services/api.js`、`src/services/generationService.js`：新增 agent step/stream 客户端和 typed SSE parser；普通写作/顾问调用不受影响。
- `src/services/agents/narrativeAgentOrchestrator.js`：改为单 transcript 有限状态机，删除独立 decision persona、`READY` 文本协议和 clean-prompt final fallback。
- `src/services/agents/narrativeToolRegistry.js`：工具执行接收 deadline、AbortSignal、snapshot revision 与 policy context；工具错误一律形成可回传 part。
- `src/services/agents/narrativeResourceIndex.js`：实现 cursor、稳定排序、结果版本和 stale 检查；保留 active-worldbook owner 与可重建缓存。
- `src/services/agents/narrativeProductionMetrics.js`、`src/services/agents/narrativeContextAudit.js`、`src/services/contextLedger.js`：记录 step/tool/result/repair/fallback 统计，不记录正文、reasoning、API key 或 opaque signature。
- `src/stores/gameStore.js`：继续只管理 placeholder、取消、提交和后处理；不得内置 provider transcript 转换。
- `src/components/experience/NarrativeAgentStatus.vue`：显示“核对场景 / 查阅资料 / 修正查询 / 组织正文”的真实阶段，不显示工具参数或内部 reasoning。
- `src/services/onlineExperienceBridge.js`、`src/composables/useOnlineRoom.js`：继续保证房主唯一 loop owner；广播低敏感 step 状态，不广播工具原文和 opaque metadata。
- `scripts/narrative-context-eval.mjs`、`scripts/narrative-production-smoke.mjs`、`scripts/narrative-production-report.mjs`、`scripts/online-narrative-smoke.mjs`：适配单 transcript 指标和真实 provider 矩阵。
- `src/__tests__/agentContracts.test.js`、`src/__tests__/gameStoreSession.test.js`、`src/__tests__/onlineRoom.test.js`：在现有 test item 内扩展参数矩阵；总测试数继续不超过 200。

##### R0：冻结失败样本和协议基线（已完成）

- [x] 从当前实现生成五组脱敏 fixture：OpenAI Chat Completions tool call、OpenAI Responses function call、Anthropic tool_use、MiniMax Anthropic thinking + tool_use、OpenAI-compatible 空/畸形响应。
- [x] fixture 包含完整响应、content block 顺序、call ID、参数增量、finish/stop reason、usage 和允许回传的 provider metadata；不包含 key、完整用户世界书和完整 reasoning 文本。
- [x] 在现有 `agentContracts.test.js` 单测试内部完成旧链 characterization，锁定 final request 丢失 transcript、thinking signature 丢失、invalid call fallback 和 capability 硬编码这四类缺陷；未把预期失败断言提交到共享分支。
- [x] R0 交付 fixture、旧链 characterization 和可运行 baseline 断言；`npm run verify:contract -- src/__tests__/agentContracts.test.js` 通过，测试 item 数仍为 1。
- [x] 冻结旧链指标字段：tool protocol success、empty response、invalid args、repair、evidence adoption、final non-empty、总耗时；临时回退成功不计为工具协议成功。

Gate（已通过）：每个已知缺陷都有可复现 fixture 和稳定错误码；没有依赖线上随机输出才能触发的回归断言。

提交边界：`test(agent): freeze tool protocol fixtures and baseline`；提交时不允许保留预期失败测试。

##### R1：建立 provider-neutral 单 transcript 契约（已完成）

- [x] 新建 `shared/narrativeTranscriptContract.js`，固定以下 part，而不是继续把全部 provider 内容压成字符串：

```ts
type NarrativeTranscriptPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text?: string; opaque?: Record<string, unknown> }
  | { type: 'refusal'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: object }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: object; isError: boolean }

interface NarrativeTranscriptMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  parts: NarrativeTranscriptPart[]
  providerMetadata?: Record<string, unknown>
}

interface NarrativeAgentStep {
  requestId: string
  stepIndex: number
  messages: NarrativeTranscriptMessage[]
  finishReason: 'tool-calls' | 'stop' | 'length' | 'content-filter' | 'error' | 'unknown'
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number }
}
```

- [x] `reasoning.text` 默认在归一化和序列化后清空；只允许 opaque allowlist 保存 `signature`、`redactedData`、`encryptedContent`、`reasoningContent` 等供应商要求的本轮回传字段，单 part 与整轮都有字符上限。
- [x] transcript validator 强制 assistant tool-call 与随后 tool-result 的 ID 一一对应，拒绝重复 ID、孤立结果、未知工具、超长 metadata 和角色顺序错误；允许显式标记尚待执行的当前 step。
- [x] 当前用户输入以真实 user part 写入；Kernel 仍是 system data block，但不重复嵌入同一输入。
- [x] transcript 契约只提供临时内存对象和脱敏序列化结果；不接入 session、备份导出、联机事件或 ContextLedger 的持久化路径。
- [x] 用现有唯一契约测试覆盖 OpenAI/Responses、Anthropic、MiniMax fixture 形态，以及 normalize -> serialize -> normalize 往返。

Gate（已通过）：同一 fixture 的 provider 形态可映射到统一 part；normalize -> serialize -> normalize 后 tool call ID、block 顺序、tool result 和 opaque metadata 保持，reasoning 正文、未知 metadata 和 secret 不进入序列化对象。

提交边界：`feat(agent): add ephemeral narrative transcript contract`；当前工作树未创建 commit。

##### R2：引入协议引擎和真实能力协商

- [ ] 直接声明 AI SDK 依赖，使用 `generateText/streamText` 的 response messages、steps、tool-error parts 和 normalized stream；Pinax 自己保留预算、权限、owner、证据与提交 policy。
- [ ] `providerCapabilityResolver` 输出：

```ts
interface NarrativeProviderCapabilities {
  protocol: 'openai-chat' | 'openai-responses' | 'anthropic' | 'unsupported'
  text: boolean
  toolCalls: boolean
  parallelToolCalls: boolean
  strictSchema: boolean
  streamToolCalls: boolean
  reasoningRoundTrip: 'none' | 'field' | 'content-block' | 'encrypted'
  toolChoiceModes: Array<'auto' | 'none' | 'required' | 'specific'>
  source: 'static-safe-default' | 'probe' | 'runtime-downgrade'
  checkedAt: number
}
```

- [x] 静态默认保持保守：custom OpenAI-compatible 未 probe 前只声明 text；工具、parallel、strict 和 reasoning round-trip 由显式格式或 probe 打开。
- [x] `/api/chat/test` 先执行最小文本请求，再执行“强制调用 echo_probe -> 回传结果 -> 得到最终 `PROBE_OK`”的两步工具探测；每步独立返回 status、error code 和 latency。
- [x] probe 不读取项目数据，只使用固定 schema 与固定短文本；结果缓存键为 provider + baseUrl host/path + model + protocol，不包含 API key，配置维度变化自动生成新缓存键。
- [x] UI 连接测试通过结构化返回和可见消息区分“文本可用”“工具可用”“工具结果往返”；文本成功但工具失败时不再显示为完整可用。
- [x] 探测收到 400 unsupported parameter 时，只关闭 strict/parallel 等对应 capability 并重试一次；401/403 保留鉴权错误，不降级能力。

Gate：模型列表接口成功不能再冒充工具能力成功；同一 provider 可出现 text=true/toolCalls=false 的真实状态，体验页据 grounding policy 决定允许轻动作或阻止事实敏感轮次。

提交边界：`feat(agent): probe provider tool capabilities`。

##### R3：供应商 transcript 保真 adapter

- [ ] OpenAI Chat adapter 使用 assistant `tool_calls` + role=`tool`/`tool_call_id` 完整往返；仅在 capability=true 时发送 `parallel_tool_calls` 和 strict schema。
- [ ] OpenAI Responses adapter 使用 response output items、`function_call`、`function_call_output` 和显式 transcript；默认 `store:false`，不依赖 provider 保存项目会话。
- [ ] Anthropic adapter 原样保留 assistant content block 顺序；tool result 使用 user content block 并按 `tool_use_id` 对齐；thinking signature/redacted thinking 只做本轮回传。
- [ ] MiniMax Anthropic 路径作为首选，显式处理 Bearer + Anthropic headers、推荐温度和 interleaved thinking；OpenAI-compatible 路径保留为独立能力结果，不与 Anthropic probe 共用结论。
- [ ] adapter 不根据模型名字假装支持功能；模型名只提供安全默认参数，最终能力来自配置/probe/runtime downgrade。
- [ ] refusal、content filter、length、empty response、malformed JSON、partial tool input、重复 call ID 和 provider error body 全部映射稳定 typed error。
- [ ] provider 原始错误只保留短 request/trace ID、HTTP status 和脱敏 preview；API key、完整 request body、完整 reasoning 不进日志。

Gate：四类 provider fixture 都能完成“用户 -> tool call -> tool result -> terminal text”；Anthropic/MiniMax thinking 回传不再导致第二步 400；OpenAI strict/parallel 参数只在已验证时发送。

提交边界：`feat(agent): preserve provider tool transcripts`。

##### R4：将浏览器编排器改为单 transcript 有限状态机

- [x] 删除体验主链中 `buildNarrativeDecisionMessages()` 的独立“资料调度器 + READY”路径；第一步使用统一叙事 system policy、Kernel 和真实 user message。旧函数仍作为历史 characterization 保留，但生产入口不再调用。
- [x] `runNarrativeAgentGeneration()` 已切换为 `runNarrativeAgentLoop()`，每步只允许以下转移：

```text
preparing -> requesting-step
requesting-step -> executing-tools | finalizing | completed | failed
executing-tools -> requesting-step | failed
finalizing -> streaming-final -> completed | failed
any-active-state -> cancelled
```

- [x] assistant step 和所有并行 tool results 先完整追加 transcript，再进入下一步；最终请求继续携带 call/result 关系，不再只传压缩 evidence。
- [x] provider 已返回终态正文时直接交给体验提交回调，不重复请求；只返回 readiness/control signal 时，在原 transcript 后追加 finalization message，并使用 `toolChoice=none`。
- [x] finalization 请求复用同一 provider 配置、Kernel/resource revision 和 requestId；resource revision 改变会取消当前轮次。
- [x] 最多 4 个 model steps、2 个工具结果轮次、6 个领域调用，trace 记录 `terminalMode`、step 数和 transcript 消息数。
- [x] 相互独立的同 step 调用并行执行；同一 step 内不拆出第二个 clean prompt，依赖关系交给模型下一步处理。
- [x] placeholder 只有收到终态正文后才提交；工具 preamble、READY、JSON 和半截正文不会通过生成回调进入消息、记忆候选或 runtime event。

Gate：最终正文的直接父 transcript 必须包含本轮所有已采用 tool result；不存在第二套 clean prompt；no-tool、one-tool、parallel、multi-hop 和 terminal-text-direct 五条路径均只有一个 requestId 和一个 committed assistant message。

提交边界：`refactor(agent): use one transcript for narrative tools`。

##### R5：修复、重试、fallback 与循环控制

- [x] 非法 JSON、schema mismatch、未知工具和缺失参数不再直接 fallback；当前 transcript 会追加一次明确的修复指令，模型只允许修复一次，仍失败则终止。
- [x] tool executor timeout、空结果和 stale revision 都作为带 `isError=true` 的工具结果进入 transcript；模型可以换查询或明确依据不足，不能把工具内部异常冒充 provider 异常。
- [ ] 错误策略固定为：

| 类型 | 自动动作 | 用户结果 |
|---|---|---|
| 401/403/API key | 不重试 | 立即显示配置错误 |
| 408/429/5xx/network | deadline 内指数退避 + jitter 重试 1 次 | 仍失败则保留可重试错误 |
| invalid/unknown tool call | typed tool error，模型修复 1 次 | 再错则结束，不普通续写 |
| tool timeout/empty | typed tool result，允许换查询 | 达到预算后根据 grounding policy 结束 |
| provider empty response | 同 transcript 重试 1 次 | 再空则协议失败 |
| unsupported tools | 跳过工具 loop | 仅 grounding=optional 可普通续写；required 明确阻止 |
| content filter/refusal | 不重试、不 fallback | 显示供应商拒绝原因 |
| cancel/session switch/host loss | 立即 abort | 清理 placeholder 和未提交状态 |

- [x] `groundingPolicy` 由 Kernel 的确定性字段产生：轻动作和眼前对话为 `optional`；历史追溯、路线/空间关系、canonical 冲突和世界规则核验为 `required`；不再依赖失败后的临时 prompt 判断。
- [x] 叙事 Agent 不再提供 direct fallback：invalid call、空响应、required 轮次和普通终态都沿同一 transcript/step stream 收束；非 Agent 的 `/api/chat/stream` 仍独立服务写作等任务。
- [x] loop detector 使用规范化 tool + canonical args + resource revision；第三次相同调用形成 doom-loop error，并终止或请求用户重试，不能继续烧 token。
- [x] total、step、tool 三层 deadline 已接入；工具超时会先 abort 传给 registry 的 AbortSignal，再返回 typed result，不只返回 `Promise.race` 的表面错误。chunk idle 随流式事件阶段处理。

Gate：畸形工具调用可修复时恢复正文，不可修复时不产生无证据正文；所有取消路径无孤儿 fetch、工具 Promise、placeholder、联机完成事件或 runtime patch。

提交边界：`fix(agent): repair tool calls without silent fallback`。

##### R6：工具检索质量与证据约束

- [x] 保留四领域工具，但按 step 动态启用 active tools：当前地点轻动作不加载 history/memory；明确历史或旧关系问题才开放对应工具，减少 schema token 和误调用。
- [x] `cursor` 实现 `revision + domain + sortKey + itemId` 的 opaque 分页；资源 revision 或资料域变化时返回 stale/domain mismatch，而不是继续使用旧页。
- [x] 搜索排序固定为 exact ID/name/alias -> 结构过滤/当前地点 -> 文本 token 匹配 -> 更新时间与稳定 ID；语义召回只作可选补充，不新增远端向量依赖。
- [x] `related/trace/nearby/route` 返回显式 relation path、edge type、depth 和 sourceRefs；模型不再只看到一段无路径的自然语言关系。
- [x] 每个结果增加 `trust: canonical | confirmed-memory | runtime-confirmed | draft` 和 `conflictState: clean | active-conflict | stale`；active conflict/stale 默认不满足 grounding，只作为 warning 返回。
- [x] finalization 前运行 deterministic evidence validator：正文结果携带 Kernel/tool sourceRefs，冲突或无法关联的内容只标记风险，不自动改写正文。
- [x] 工具缓存以 active resource revision 和规范化 call arguments 为边界；worldbook 条目、关系、历史位置和冲突状态进入 revision 指纹，变化后旧缓存不复用。
- [x] 现有世界书、地图、历史和 Agent 契约回归保持通过；动态工具目录不改变 import owner 或默认世界书选择。

Gate：40 个本地 fixture 继续全部命中目标证据；同名实体、跨地点历史、冲突事实和 stale memory 不误采用；导入三路径与 active-worldbook selection 保持原行为。

提交边界：`feat(agent): strengthen narrative evidence retrieval`。

##### R7：流事件、体验状态、联机与审计

- [x] `/api/generate/agent-step/stream` 只输出规范化 SSE event：`step.start`、`tool.input.delta`、`tool.call`、`text.delta`、`step.finish`、`usage`、`error`；raw provider chunk 不直接透传浏览器。
- [x] tool input delta 只用于内部组装和取消，不在 UI 展示；参数在 step 完成并过 schema 后才执行。
- [x] UI 只展示低敏感状态、工具领域和命中数量；不得展示 reasoning、完整 query、完整结果、provider signature 或“模型内心活动”。
- [x] ContextLedger 增加 transcript revision、step count、tool call/result refs、repair count、grounding policy、terminal mode 和 fallback reason；内容正文仍由 message owner 保存。
- [x] 联机只由房主维护 transcript 和调用工具；成员只接收带 requestId/seq 的状态与最终正文，host loss 会取消旧 transcript，新房主必须从原输入新建 requestId。
- [x] 生产 metrics 增加 `protocol`, `capabilitySource`, `toolRepairCount`, `reasoningRoundTrip`, `terminalMode`, `groundingPolicy`, `orphanedCallCount`；不保存 opaque metadata。
- [x] 体验 status 组件覆盖停止/取消、失败重试、普通续写状态和无消息状态；主题1只保持行为兼容，不做视觉重构。

Gate：单机与双浏览器都只有一个生成 owner；取消/重连/房主转移没有重复正文；主题2 1440/390 无新增遮挡、横向溢出和空白占位。

提交边界：`feat(experience): expose trustworthy narrative agent status`。

##### R8：测试、真实渠道 Gate、切换与清理

- [x] 不新增 Vitest item：本阶段没有增加 Vitest 文件或测试 item；新增的 stream handler 是独立 smoke runner，不改变核心测试计数。
- [x] 聚焦命令已固化并执行：

```bash
npx vitest run src/__tests__/agentContracts.test.js
npx vitest run src/__tests__/gameStoreSession.test.js src/__tests__/onlineRoom.test.js
npm run eval:narrative-context
npm run verify:full
npm run smoke:narrative-stream
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run --count 60
npm run smoke:online-narrative -- --dry-run
```

R8-A 已完成：生产 smoke 与双浏览器 smoke 都改为观察 `/api/generate/agent-step/stream`，受控限流/超时改为标准 `error` SSE；新增 `smoke:narrative-stream` 覆盖 tool-call、final-text、typed-error 三类无 provider handler 自检。真实 provider 仍未配置，因此不把本地 Gate 误记为发布 Gate。

R8-B runner 已完成：`npm run smoke:narrative-matrix` 会按固定渠道目录发现配置，分别运行 60 轮生产 smoke，并在独立产物目录写入每渠道指标与总 `matrix.json`。没有配置的渠道明确标记为 `not-configured`；`releaseReady` 只有在所有渠道实际执行、指标完整且质量审阅通过时才可能为 true。CLI 使用显式 `.js` 模块边界，不依赖 Vite 的无扩展名解析，因此可在 Node 环境独立自检。

R8-C 已完成：生产叙事只保留 `/api/generate/agent-step/stream`，删除旧 `/agent-turn` 路由、普通 JSON Agent API、旧资料调度 loop、READY 控制提示和专用 clean-prompt builder。最终正文在同一 transcript 直接完成，不再发起独立收束或静默普通续写 fallback；普通 `/api/chat/stream` 仍由写作等非 Agent 任务使用。

R8-D runner 已完成：`npm run gate:narrative-release -- --matrix <matrix.json>` 会读取矩阵及各渠道 metrics/annotations，逐渠道输出样本、协议、终态非空、修复、required grounding、transcript 对齐、失败清理、证据命中、无依据事实下降、no-tool 延迟和 orphaned call 闸门。缺少真实渠道或人工标注时输出具体阻断原因并保持 `releaseReady: false`。

R8-E 已完成：新增 `npm run smoke:narrative-recovery`，直接对标准 SSE handler 做 response abort、provider 迟到结果和 typed error 三类恢复自检。连接关闭后 provider 收到 AbortSignal，迟到的 `text.delta/step.finish` 不再写入响应，typed error 保持低敏错误码并正常结束流；该 smoke 不替代真实 provider 的取消/host loss Gate。

- [ ] 真实 provider 矩阵至少包含：OpenAI Chat/Responses 中一条、Anthropic Messages 一条、MiniMax Anthropic-compatible 一条；MiniMax OpenAI-compatible 作为兼容对照，不替代推荐路径。
- [ ] 每条 provider 执行至少 60 轮：20 no-tool/light、20 world/geo/history/memory、10 multi-hop/parallel、5 invalid/repair、5 cancel/timeout/rate-limit；人工标注事实、证据采用和无依据新增。
- [x] 发布评估器已落地：质量标注通过 `annotations.json` 的 `quality.repairRequired/repairSucceeded`、`quality.evidenceHit`、`quality.unsupportedFacts` 和 `quality.baselineUnsupportedFacts` 进入独立 release gate；缺少标注不会被当作通过。
- [ ] 发布门槛：

| 指标 | 门槛 |
|---|---:|
| supported provider tool transcript 成功率 | >= 98% |
| terminal 正文非空率 | >= 99% |
| invalid call 一次修复成功率 | >= 90% |
| required-grounding 静默无工具正文 | 0 |
| tool call/result ID 对齐率 | 100% |
| 取消/切换/host loss 清理率 | 100% |
| 地理/历史目标证据命中率 | >= 90% |
| 地理/历史无依据事实相对旧链 | 至少下降 30% |
| no-tool p95 额外延迟 | <= 600ms |
| orphaned provider/tool calls | 0 |

- [x] 完成切换后删除 `NARRATIVE_TOOL_FALLBACK_CODES` 中 invalid/missing/empty 的普通续写路径、旧 `READY` decision prompt 和 narrative 专用 clean-prompt final 调用；普通 `/api/chat/stream` 继续服务写作等非 Agent 调用。R8-C 已移除旧 `/agent-turn` 路由、API fallback 与未导出的 legacy loop。
- [ ] 更新 `docs/STATUS.md`、`docs/PLAN.md`、`docs/LOG.md`、known issues 和用户配置说明；真实 provider 未过门槛前只能标为“实现 Gate 完成”，不能标为发布完成。
- [ ] 不做数据迁移：transcript 是临时态，现有 session/message/worldbook schema 不变；回滚只需回退 R4/R7 切换提交，资源索引仍可重建。

最终 Gate：`verify:full` 维持 200 项并通过；三条真实 provider 主路径通过；用户在体验页能看到正文、真实资料状态和可操作错误，且工具调用不再是正文前一次孤立预检。

##### 执行顺序与并行边界

```text
R0 fixtures
  -> R1 transcript contract
      -> R2 capability resolver -----┐
      -> R3 provider adapters --------+-> R4 browser loop
                                      |     -> R5 recovery policy
      -> R6 retrieval/evidence -------┘          -> R7 UI/online/metrics
                                                        -> R8 real gates/cleanup
```

- R2 与 R3 可由两个独立 worktree 并行，但都只依赖已经冻结的 R1 契约；合并前由同一人处理 shared contract 冲突。
- R6 可与 R2/R3 并行，禁止修改 provider adapter 和 orchestrator；只拥有 resource index、tool registry 与领域 executors。
- R4/R5 必须串行，由单一 owner 修改 `narrativeAgentOrchestrator.js` 与 `gameStore.js`。
- R7 在 R4/R5 合并后执行，避免 UI 和联机围绕过时状态名开发。
- 每个提交先跑聚焦测试，R4、R5、R7、R8 各跑一次 `verify:full`；不启动或重启用户的 dev server。

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
2. 以 MiniMax + `generic-async-http` 的现有异步视频 adapter 完成真实渠道 smoke，之后接第二个 direct provider；
3. 对 `/experience/online/:roomSlug` 做双浏览器房主权威、断线恢复和受控 runtime patch 实机验收；
4. 保留供应商账号、后端 API、WebSocket 反向代理和大媒体存储为独立部署前置，不在前端伪造完成。

第一张实施切片不再是地图生命周期，而是 `G3.1 / 地理-历史生产接线`；该切片已完成地图草案、显式写入、历史开局、PlaceEntity 和玩家历史 runtime 回流。当前切片应继续完成地点双向 UI、语义点审阅和受控世界状态/涌现调度，而不是回到地图引擎扩展。
