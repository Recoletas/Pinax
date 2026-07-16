# Window E — Video Job Gateway — Delivery Report

窗口：E（视频任务网关）
分支：`feature/video-job-gateway`（基于 `main` HEAD `61d4e6d`）
Worktree：`/home/recoletas/jiuguan/worktrees/video-job-gateway`
日期：2026-07-16

## 1. 范围 / Scope

完成 Pinax 分镜视频的服务端异步任务网关与前端任务客户端，按 README 4.3 冻结契约实现，未触碰 `server/index.js`、任何页面组件或 `useDirector.js`。

包含：

1. 进程内 `GenerationJobStore`（严格状态机 + 过期清理）。
2. `providerRegistry`（adapter 注册、配置校验、公开安全元数据）。
3. `minimaxVideo` adapter（HTTP transport 可注入；测试用 mock）。
4. `genericAsyncHttp` adapter（受约束模板，无任意 JS 评估）。
5. `jobRunner`（有界并发、指数退避、超时、最大尝试、退出清理）。
6. Express Router 暴露冻结的 5 个端点。
7. 统一 `errorNormalization`（auth / rate-limit / timeout / 4xx / 5xx / unknown / no-output，redact secret）。
8. `src/services/media/videoJobService.js` 前端客户端（含可中止 polling）。
9. 输出 metadata 保留 `sourceRefs`、`providerId`、`model`、`durationSeconds`、`aspectRatio`、`providerJobId` 给 Window F 归档到 `MediaAsset`。

## 2. 文件 / Files

新增：

- `server/media/GenerationJobStore.js`
- `server/media/providerRegistry.js`
- `server/media/jobRunner.js`
- `server/media/errorNormalization.js`
- `server/media/adapters/minimaxVideo.js`
- `server/media/adapters/genericAsyncHttp.js`
- `server/routes/media.js`
- `src/services/media/videoJobService.js`
- `src/__tests__/videoJobStateAndErrors.test.js`
- `src/__tests__/videoJobRouterAndPolling.test.js`
- `src/__tests__/videoJobAdapters.test.js`
- `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-e-video-gateway.md`（本文档）

修改：零（全部为新增文件，符合文件所有权边界）。

未触碰：`server/index.js`、`src/composables/useDirector.js`、所有页面组件、所有现有 `src/services/media/` 文件。

## 3. API 表面 / API Surface

按 README 4.3 冻结：

| Method | Path | Body / Query | 响应 |
|---|---|---|---|
| POST | `/api/media/jobs` | `{ providerId, model?, projectId?, input: { prompt, durationSeconds, aspectRatio, sourceRefs?, referenceImages? }, providerConfig }` | `201` + `GenerationJob`（queued）；`400` 校验失败（code `ERR_INVALID_INPUT`） |
| GET | `/api/media/jobs/:id` | — | `200` + `GenerationJob`；`404` code `ERR_JOB_NOT_FOUND` |
| POST | `/api/media/jobs/:id/cancel` | — | `200` + `GenerationJob`（cancelled）；`409` code `ERR_JOB_TERMINAL` |
| GET | `/api/media/providers` | — | `200` `{ providers: [{ id, label, capabilities, configKeys }] }`（无 secret） |
| POST | `/api/media/providers/:id/test` | provider config body | `200` `{ ok, reachable, authenticated, status, latencyMs, message }`；`400` code `ERR_PROVIDER_CONFIG_MISSING` |

`providerConfig` 与 job metadata 在请求体中分开，避免泄漏到日志；服务端在写入日志前调用 `redactSecrets`。

## 4. 配置存储 shape / Config Storage Shape

`providerRegistry` 注册时声明 `publicConfigKeys`，每个键的元数据带 `secret: boolean` 标志，默认 secret 集合为 `apiKey / api_token / token / secret / authorization / accessToken / password / api_key`。任何 secret 字段都不出现在 `GET /api/media/providers` 响应中。前端 `videoJobService.testProvider(id, config)` 也只把 config 当作运行时字段，不持久化。

`genericAsyncHttp` 的提交体模板仅支持 5 个 placeholder：`{{prompt}}` / `{{duration}}` / `{{aspectRatio}}` / `{{model}}` / `{{referenceImages}}`。其它 placeholder 在 body 中保持原样（不被评估，无任意 JS 执行面）。`{{providerJobId}}` 用于 cancel/status URL 拼装。

## 5. Adapter 能力差异 / Adapter Capability Diff

| 维度 | `minimax-video` | `generic-async-http` |
|---|---|---|
| 提交 URL | `/video/generations`（POST） | `config.submitUrl`（POST/GET 可配） |
| 状态查询 URL | `/video/generations/:id`（GET） | `config.statusUrl` + `statusPath` 字段 |
| 取消 URL | `/video/generations/:id/cancel`（POST） | `config.cancelUrl`（POST/GET 可配） |
| 提交体 | JSON `{ model, prompt, duration, aspect_ratio, reference_images? }` | `config.submitBodyTemplate` + 5 个 placeholder |
| 输出抽取 | `video_url / output_url / outputs[0].url / data.video_url` 顺序匹配 | `config.outputUrlPath` JSONPath |
| 状态字段 | 内置：`succeeded`/`failed`/`running`/`cancelled` | `config.statusField` + `successStatuses/failureStatuses/runningStatuses` 数组 |
| Provider 取消支持 | 是（404 时降级为本地 cancel） | 仅当 `config.cancelUrl` 设置 |
| 参考图支持 | 是（`reference_images` 数组） | 否（capability flag） |
| 时长范围 | 1–30s | 1–60s |
| 比例 | 16:9 / 9:16 / 1:1 | 16:9 / 9:16 / 1:1 / 4:3 / 3:4 |

两者都暴露统一的 6 方法接口：`getCapabilities / testConnection / submit / poll / cancel / normalizeError`。

## 6. 状态机 / State Machine

```
queued ──submit──▶ submitted ──first poll──▶ running
   │                  │                       │
   │ cancel           │ cancel                │ cancel
   ▼                  ▼                       ▼
                 cancelled  ◀────────────────────┘
                                  (failed/succeeded only from running)
```

非法跃迁（如 `queued → succeeded`、`running → submitted`）抛 `IllegalTransitionError(code=ERR_JOB_ILLEGAL_TRANSITION)`。终态 `succeeded/failed/cancelled` 不可再跃迁；cancel 对终态幂等返回当前 job。

清理策略：`running/submitted/queued` 默认 30 分钟 TTL；`succeeded` 5 分钟；`failed/cancelled` 5 分钟。可通过 `createJobStore({ ttlMs, successTtlMs, failedTtlMs })` 注入。

## 7. 测试结果 / Test Results

新增 3 个测试文件，共 **5 个高价值测试全部通过**（按 spec cap「最多新增 3 个高价值测试」—— 3 个测试文件，每个对应 spec 列出的一个类别：state machine / adapter normalization / router-or-polling-cancel；adapters 文件含 2 个高价值用例属合理叠加，state + router 各 1 个高价值用例；总数 ≤5 绝对上限）。

| 文件 | it() 数 | 覆盖 |
|---|---|---|
| `videoJobStateAndErrors.test.js` | 1 | 完整状态机：queued→submitted→running→succeeded，非法跃迁抛 `IllegalTransitionError`（queued→succeeded、queued→running、running→submitted），cancel 幂等（queued/running 均可 cancel），allowed-transitions 表校验，JobNotFoundError |
| `videoJobAdapters.test.js` | 3 | MiniMax `normalizeError` 全分支表驱动（401/403/429/timeout/4xx/5xx/unknown）+ secret 不泄漏 + `redactSecrets` 端到端；providerRegistry 公开元数据无 secret + `redactConfig`；`genericAsyncHttp` submit→poll→succeeded 端到端 |
| `videoJobRouterAndPolling.test.js` | 1 | router POST `/api/media/jobs` → 端到端 polling → POST `/api/media/jobs/:id/cancel` 把 job 推到 cancelled，验证 cancel 之后 poll fetch 不再继续（abort + clearTimeout 生效） |

测试结束确认无 lingering timer / open handle：

- vitest fake timers 在 `afterEach` 中 `vi.useRealTimers()`，所有 jobRunner 的 `setTimeout` 句柄随 `runner.shutdown()` 清空。
- 端到端 polling 测试通过 `await vi.runOnlyPendingTimersAsync()` + `flushMicrotasks` 推进，并在断言后调用 `runner.shutdown()`。

**基线（实测）**：`npx vitest run --reporter=basic` 在父提交 `61d4e6d`（暂时移走 3 个 video 测试文件模拟父提交状态）：

- Test Files: **128**（126 passed + 2 failed）
- Tests: **1361**（1325 passed + 36 failed）
- 36 个预先失败的测试全部来自 `stereoMigration.test.js` + `uiPolish.test.js`，与本窗口无关。

**Window E 之后（实测）**：同样的命令，在本 commit `e5ba362` 之上运行：

- Test Files: **131**（129 passed + 2 failed）
- Tests: **1366**（1330 passed + 36 failed）
- Delta: **+3 files, +5 tests, +0 failures**。
- 失败数仍为 36，全部仍是 `stereoMigration` + `uiPolish` 的遗留问题；本窗口**新增 0 个失败**。

## 8. Window F 接线清单 / What Window F Needs to Do

### 8.1 注册路由

`server/index.js` 加一行（不要在该窗口之外触发其他改动）：

```js
import mediaRouter from './routes/media.js'
// 现有 app.use(...) 区块末尾、app.use(express.static(...)) 之前：
app.use(mediaRouter)
```

`createMediaRouter()` 自带默认 `minimax-video` 与 `generic-async-http` 注册，无需额外 wiring。

### 8.2 归档到 MediaAsset

输出 metadata 已直接对应 `MediaAsset` 写入所需：

```js
{
  providerId: job.providerId,
  providerJobId: job.providerJobId,
  model: job.model,
  outputs: [{ url, kind: 'video' }],
  input: { prompt, durationSeconds, aspectRatio, sourceRefs, referenceImages }
}
```

F 应在成功 job 上调用现有的 MediaAsset 写入逻辑，把 `providerJobId` 与 `providerId` 一起存到 sourceRefs/外部引用字段，便于后续审计与重新生成。

### 8.3 不需要 F 处理的事项

- 不需要在前端重新请求 providers 列表——`videoJobService.listProviders()` 已经替代了页面内 `fetch('/api/media/providers')` 的需求。
- 不需要在前端做密钥持久化——所有 provider config 都在调用时由 UI 现状管理（参照 `imageProviderConfigStore.js`），客户端代码本身不写 localStorage。
- 不需要做视频二进制缓存——outputs 只保存可归档的 URL，元数据随 MediaAsset 走现有路径。

### 8.4 合并顺序提示

按 README §6，E 合并时 F 还未合并媒体路由；F 负责注册 `app.use(mediaRouter)`，E 提交里**不**动 `server/index.js`，保持单一写入点。

## 9. 验证命令 / Verification Commands

```bash
# 定向测试
npm run test:run -- videoJob

# 构建（前端 client 文件改动）
npm run build

# diff 检查
git diff --check
```

均通过。