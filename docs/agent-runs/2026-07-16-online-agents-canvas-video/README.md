# Online / Agents / Canvas / Video Parallel Execution Pack

状态：待执行

日期：2026-07-16

目标：用五个互不争抢核心文件的并行窗口完成联机、Agent 基础契约、画布可靠性和视频任务网关，再用一个串行窗口完成页面接线。此执行包是主路线图的实施任务板，不是新的产品路线图。

## 1. 本轮交付边界

本轮要得到四项可运行的纵向能力：

1. 联机模式已有真实 WebSocket 房间、URL 加入、昵称、在线成员、聊天、动作提议、断线续传和房主权限；不再只是路线图描述。
2. 写作、体验和素材/画布可共享 Agent 任务、上下文和结果契约；本轮先统一基础层，页面入口的视觉合并留给后续小切片。
3. 卡片关系画布在缩放、拖动、容器变化和大量连线时更稳定，不重写整页，也不改漫画自由格框。
4. 分镜视频已有服务端异步任务网关、MiniMax 与通用异步 HTTP adapter、配置测试和前端任务客户端；最终接线窗口再把它放进现有分镜工作流。

明确不做：

- 不做全文、世界书或地图的多人实时协同编辑。
- 不让联机服务端直接持有完整 Pinia/localStorage store。
- 不在本轮彻底重构 `Writing.vue`、`Experience.vue` 或 `ProseEssay.vue`。
- 不实现视频时间线编辑器、音频、字幕烧录或发布平台上传。
- 不建立新的 provider 配置体系；视频配置沿用现有自定义 API 配置原则，密钥只在服务端使用。
- 不启动用户已经运行的 dev server。

## 2. 窗口与依赖

| 窗口 | 建议工具 | 可并行 | 主要产物 | 难度 |
|---|---|---:|---|---|
| A 联机服务端 | Claude Code | 是 | 房间、事件日志、快照、重连、权限、WS 路由 | 中 |
| B 联机客户端 | OpenCode | 是 | 在线路由、加入页、房间面板、WS composable | 中 |
| C Agent 基础统一 | Claude Code | 是 | 任务目录、上下文信封、结果生命周期、兼容层 | 中 |
| D 画布优化 | OpenCode | 是 | 视口/几何工具、连线批处理、拖动与键盘操作 | 中 |
| E 视频任务网关 | Claude Code | 是 | GenerationJob、adapter、路由、前端任务客户端 | 中 |
| F 最终接线 | Claude Code | 否 | 合并 A-E 后接 Experience/分镜、收口测试与文档 | 中 |

A-E 必须使用不同 worktree 或至少不同分支。F 只能在 A-E 的成果已合并后开始。

## 3. 文件所有权

### A 联机服务端

独占：

- `server/realtime/**`
- `server/routes/rooms.js`
- `server/index.js`
- A 自己新增的测试文件

禁止修改：`src/**`、`server/routes/media.js`、`server/media/**`。

### B 联机客户端

独占：

- `src/pages/OnlineExperience.vue`
- `src/components/experience/OnlineRoomPanel.vue`
- `src/composables/useOnlineRoom.js`
- `src/services/experienceSessionAdapter.js`
- `src/router/index.js`
- B 自己新增的测试文件

禁止修改：`src/pages/Experience.vue`、`server/**`。

### C Agent 基础统一

独占：

- `src/services/agents/**`
- `src/composables/useAdvisor.js`
- `src/services/advisorTaskService.js`
- `server/services/advisorTaskService.js`
- C 自己新增的测试文件

禁止修改：页面组件、`AdvisorPanel.vue`、联机与媒体文件。

### D 画布优化

独占：

- `src/services/canvasGeometry.js`
- `src/composables/useCanvasViewport.js`
- `src/composables/useCanvasBoard.js`
- `src/components/canvas/**`
- `src/pages/ProseEssay.vue`
- D 自己新增的测试文件

禁止修改：Agent、联机、视频文件。`ProseEssay.vue` 只做画布相关小范围接入，禁止整页改写。

### E 视频任务网关

独占：

- `server/media/**`
- `server/routes/media.js`
- `src/services/media/videoJobService.js`
- E 自己新增的测试文件

禁止修改：`server/index.js`、`src/composables/useDirector.js`、页面组件。

### F 最终接线

F 在合并后可以修改：

- `server/index.js`
- `src/pages/Experience.vue`
- `src/pages/ProseEssay.vue`
- `src/composables/useDirector.js`
- 与测试总量和文档收口直接相关的文件

F 不再重新设计 A-E 的底层契约。

## 4. 冻结契约

### 4.1 RoomEvent

服务端是唯一排序者。客户端命令可以重试，事件不能因重连重复应用。

```js
{
  id: 'evt_<id>',
  roomId: 'room_<id>',
  seq: 42,
  type: 'chat.message',
  actorId: 'member_<id>',
  commandId: 'cmd_<client-generated-id>',
  payload: {},
  createdAt: 'ISO-8601'
}
```

首版事件类型：

- `room.member.joined`
- `room.member.left`
- `room.member.updated`
- `chat.message`
- `action.proposed`
- `action.selected`
- `vote.cast`
- `narrative.requested`
- `narrative.completed`
- `runtime.patch.accepted`

客户端命令：

- `room.join { commandId, roomSlug, nickname, requestedRole, lastSeq }`
- `room.leave { commandId }`
- `chat.send { commandId, text }`
- `action.propose { commandId, text }`
- `action.select { commandId, proposalId }`
- `vote.cast { commandId, proposalId }`
- `room.snapshot.request { commandId, lastSeq }`
- `ping { sentAt }`

服务端消息：

- `server.ready`
- `room.joined`
- `room.snapshot`
- `event.append`
- `presence.sync`
- `error`
- `pong`

`room.snapshot` 至少包含 `room`、`members`、`recentEvents`、`lastSeq`。首版房间只在进程内保存，限制事件条数、消息长度、昵称长度和房间人数；进程重启丢失必须在 UI 说明，不在本轮接数据库。

### 4.2 Agent 契约

```js
// AgentTaskDefinition
{
  id: 'experience.next-actions',
  taskType: 'experience.next-actions',
  surfaces: ['experience'],
  intent: 'generate-options',
  contextPolicy: 'experience-turn',
  resultMode: 'suggestions',
  capabilities: ['text']
}

// AgentContextEnvelope
{
  version: 1,
  projectId: null,
  surface: 'experience',
  target: { type: 'turn', id: null, revision: null },
  blocks: [{ kind: 'selection', priority: 100, content: {}, sourceRefs: [] }],
  budget: { maxChars: 16000, usedChars: 0, truncated: false }
}

// AgentResult
{
  id: 'agent_result_<id>',
  taskType: 'experience.next-actions',
  status: 'completed',
  summary: '',
  suggestions: [],
  actions: [],
  sideEffects: [],
  baseRevision: null,
  createdAt: 'ISO-8601'
}
```

约束：

- 任务定义集中登记，页面不再各自发明同名 quick action。
- 上下文按 block 优先级裁剪，保留 `sourceRefs`，不得把整份长文无条件塞入 prompt。
- 结果默认是草稿；只有显式 apply 才产生 side effect。
- 现有 `useAdvisor` API 必须保持兼容，C 不在本轮改三个大页面。
- OpenClaw、copilot、director 暂不强制合并实现，只通过统一 task/context/result 契约获得后续接入点。

Agent surface/task 矩阵：

| Surface | 首批 task id | 关键上下文 | 结果与显式 apply |
|---|---|---|---|
| 设定/世界书 | `worldbook.import.structure`、`worldbook.geography.review`、`worldbook.history.draft` | 导入片段、条目、地理约束、年代和规则 | 结构化草案；审阅后写 worldbook/history |
| 体验 | `experience.next-actions`、`experience.emergence`、`experience.memory.compress` | 当前轮、角色状态、地点、历史、未决线索、短记忆 | 对话选项、事件候选、精简记忆；正文完成后通知，接受后写 runtime |
| 写作 | `writing.continue`、`writing.rewrite`、`writing.review` | 选区、前后文、风格、来源账本、禁写规则 | patch/suggestion；revision 未变化时才能应用 |
| 素材/关系画布 | `canvas.organize`、`canvas.relate`、`media.illustration.prompt` | 选中素材、关系、来源引用、角色/地点视觉规则 | 布局/关系/提示词草案；用户确认后改画布或提交图片任务 |
| 分镜/导演 | `storyboard.generate`、`storyboard.review`、`storyboard.video.prompt` | 已确认文本、镜头版本、关系、参考图、连续性约束 | 分镜版本/镜头修改/视频 prompt；不覆盖旧版本 |
| 漫画 | `comic.adapt`、`comic.visual-bible`、`comic.panel.compose` | 页级 beat、角色地点、视觉圣经、当前格和阶段状态 | 分页/构图草案；按阶段确认并标记下游 stale |
| 全局顾问 | `advisor.general`、`advisor.explain` | 当前 surface 的高优先级摘要，不默认读取全项目 | 只给建议或可审阅 action，不直接改 store |

C 窗口负责 registry、context policy、legacy alias 和结果生命周期；它不负责一次性迁移所有大页面。后续页面接入必须按上表逐项替换旧 quick action，并保留旧调用别名直到对应 surface 已验证。

### 4.3 GenerationJob

```js
{
  id: 'job_<id>',
  projectId: null,
  modality: 'video',
  providerId: 'minimax-video',
  model: '',
  status: 'queued',
  progress: 0,
  input: {
    prompt: '',
    durationSeconds: 5,
    aspectRatio: '16:9',
    sourceRefs: [],
    referenceImages: []
  },
  providerJobId: null,
  outputs: [],
  error: null,
  attempts: 0,
  createdAt: 'ISO-8601',
  updatedAt: 'ISO-8601'
}
```

状态只能按 `queued -> submitted -> running -> succeeded | failed | cancelled` 前进。错误统一为：

```js
{ code, message, retryable, providerStatus, details }
```

服务端 API：

- `POST /api/media/jobs`
- `GET /api/media/jobs/:id`
- `POST /api/media/jobs/:id/cancel`
- `GET /api/media/providers`
- `POST /api/media/providers/:id/test`

adapter 接口：

- `getCapabilities(config)`
- `testConnection(config)`
- `submit(job, config)`
- `poll(job, config)`
- `cancel(job, config)`
- `normalizeError(error)`

首版 job store 可在进程内保存；输出必须是可归档的 URL/元数据，不把视频二进制塞进 localStorage。provider key 不得返回浏览器或进入日志。

## 5. 测试与验证纪律

- 当前最终基线是 18 files / 200 tests；最终合并后仍必须 `<= 200`。
- A-E 每个窗口最多新增 3 个高价值测试，只测契约、权限、幂等、状态机或几何，不测 CSS 文本和重复按钮。
- 并行窗口不得为了腾名额删除它不理解的旧测试。F 统一把新测试合并进现有测试，或删除等量低价值重复断言。
- A-E 只运行自己的定向测试、`npm run build`（确有前端改动时）和 `git diff --check`；不要五个窗口同时跑 `verify:full`。
- F 运行最终 `npm run verify:full`，核对测试数量，并做联机协议和视频 mock smoke。
- 所有窗口均不得启动 dev server；真实视频 provider 调用不是自动测试前提。

## 6. 合并顺序

1. 合并 C（Agent 基础契约），独立于其余模块。
2. 合并 D（画布优化），确认 `ProseEssay.vue` 冲突仅限画布区域。
3. 合并 E（视频网关），此时暂不注册路由。
4. 合并 A（联机服务端），由它保留 `server/index.js` 的 WS 改造。
5. 合并 B（联机客户端与路由）。
6. 运行 F：注册 media route、把联机会话接到体验运行时、把视频任务接到分镜、收口测试和文档。

## 7. 完成定义

- 两个浏览器窗口可通过同一 URL 加入房间，看到成员、聊天和动作提议；重连不会重复消息，非房主不能执行房主命令。
- 三个现有 Advisor 使用面保持原行为，底层任务定义、上下文构建和结果规范来自同一基础层。
- 关系画布拖动、缩放、resize 后连线不漂移；连线更新按帧合并，大量节点时不因每次 pointermove 触发全量同步布局。
- 用 mock provider 可以创建、轮询、取消视频任务；MiniMax 和通用异步 HTTP adapter 都经过统一 normalization。
- 分镜确认版本可以提交视频任务并查看状态，完成结果能归档到现有 MediaAsset/来源引用体系。
- `npm run verify:full`、文档构建和 `git diff --check` 通过，测试总数不超过 200。

## 8. 窗口提示词

- [A：联机服务端](./prompt-a-online-server.md)
- [B：联机客户端](./prompt-b-online-client.md)
- [C：Agent 基础统一](./prompt-c-agent-contracts.md)
- [D：画布优化](./prompt-d-canvas-optimization.md)
- [E：视频任务网关](./prompt-e-video-gateway.md)
- [F：最终接线与验收](./prompt-f-integration.md)
