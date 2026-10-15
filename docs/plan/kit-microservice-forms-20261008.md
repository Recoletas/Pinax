# kit 微服务形态调研（2026-10-08）

> 触发问题：「kit 的能力可以以微服务的形式启动吧，你调研下」
> 本文纯调研，未改任何代码、未起任何服务。所有 `path:line` 可复核；相对路径中 `kit/` = `D:\storyflow-kit\`（兄弟仓，非 vendored），其余 = `D:\pinax-storyharness\`。
> 关联件：`docs/plan/kit-runtime-plan-revision-20261008.md`（本文 §5 改写它的 G1 / P1-a / Q1）。

---

## §0 结论先行

1. **能，而且不是"能不能做"的问题——kit 已经有 4 个可独立启动的服务面，外加一套 Windows 常驻运维件。** 真正要决策的是：Pinax 消费哪几个面、监督权归谁、以及构建产物缺口怎么补。

2. **四个面分别是**：内核 HTTP 面 `:8421`（Fastify，动词/立项/会话全通）、协议面 `:8431`（node:http，生产线直驱 + agent 会话 + 面板静态）、Pinax 任务面 `:8451`（node:http，任务级 SSE）、MCP stdio 面（无端口）。`kit/storyharness/src/web.ts:1-4` 的头部注释就是这套拓扑的自述。

3. **构建能力只有 core 有，storyharness 没有；但 core 的产物不入库。** `kit/core/package.json` 有 `build: tsc -p tsconfig.json` 与 `bin.miniflow: ./dist/cli.js`，本机 `kit/core/dist/` 实测顶层 50 项、递归 **64 个 `.js`**（含 `cli.js`/`http.js`/`mcp.js`/`agent-mcp.js`）——**然而 `core/.gitignore:1` 就是 `dist/`，`git ls-files core/dist` = 0**，所以那是本机跑过 build 的遗留，新克隆机器上没有。`kit/storyharness/package.json` 则连 `build`/`dist`/`bin`/`exports`/`files` 全无，只能 `tsx` 跑源码。**而 Pinax 唯一在消费的 8451 恰好在 storyharness 里** —— 这条决定了 §5 的施工顺序。

4. **但 kit 把 `node_modules` 入库了**，所以"兄弟仓自带运行时"这个前提真成立：`git ls-files` 实测 core 6470 个、storyharness 11861 个（含 `tsx` 30 个文件），`kit/.gitignore:11` 注释自述「已入库的 core/storyharness node_modules 不受影响」。克隆下来 `npx tsx src/cli.ts web` 即可跑，不需要 `npm install`。

5. **Pinax 今天只消费 8451，一共 5 处引用**（4 处服务端 + 1 处浏览器默认值），且 `server/services/storyAgentRuntime.js` 已经是一套完整的"微服务客户端 + 进程监督器"：先探 `/healthz` 复用、不通则 spawn 兄弟仓、轮询等健康 20s、超时 kill 并回落原生链、带 `PINAX_STORYAGENT_ENABLED=0` 总开关。**8421 与 8431 在 Pinax 全仓零引用**（实测 grep，见 §8）。

6. **kit 侧那套常驻运维件当前是坏的。** 实测 2026-10-08 12:23：计划任务 `kit-guard` 装着、每 5 分钟 fires（`LastRunTime 12:23:01`、`LastTaskResult 0`、`State Ready`），但 `:8421`/`:8431`/`:30142` 三个探针全 down，且 `%TEMP%\kit-core.log`（10-05 01:53）与 `%TEMP%\kit-web.log`（10-06 05:37）两天多没有新增一行 → 重启链根本没执行到写日志那步。**8451 之所以活着，恰恰因为它是 Pinax 自己 spawn 的，不依赖 kit 守护。**

7. **因此修订版 PRD 的 Q1 应该改选 ③（维持子进程），不是 ①（内嵌）。** 理由：内嵌要先把 storyharness 变成可 `import` 的 JS 包（上游 PR），而现有子进程形态已经跑通并带 fail-open，且 kit 入库 `node_modules` 让"兄弟仓自带 tsx"这个依赖是稳的（结论 4）；同时 kit 侧守护不可靠这一点说明**监督权必须留在 Pinax 侧**，内嵌反而会把"谁负责拉起"这个问题变模糊。代价是生产依赖 kit 源码树（`storyAgentRuntime.js:27,36` 两处硬编码兄弟仓相对路径），这条要靠上游给 storyharness 补 `build` 才能解掉，属于**独立的上游工作项，不应阻塞 Pinax 侧文档与收口**。

---

## §1 四个可独立启动的服务面

| # | 面 | 端口 | 启动命令 | HTTP 实现 | 鉴权 | 绑定地址 | JS 产物 | 健康探针 |
|---|---|---|---|---|---|---|---|---|
| 1 | 内核 HTTP 面 | 8421（占用自动顺延 +20） | `cd core && npx tsx src/cli.ts up --port 8421`<br>或 `npm run serve`（= `tsx src/http.ts`）<br>或 `node dist/cli.js up`（**需先 `npm run build`；`dist/` 被 gitignore，新克隆机器上没有**） | Fastify + `@fastify/cors` | **无** | `127.0.0.1` 硬编码 | **有 build 脚本 + `bin.miniflow`，但产物不入库**（`core/.gitignore:1`；本机 64 个 `.js` 是本地 build 遗留） | `/api/v1/openapi.json` |
| 2 | 协议面 | 8431 | `cd storyharness && npx tsx src/cli.ts serve --port 8431`<br>或 `... cli.ts web`（连带拉内核） | node:http | **有**：HMAC 无状态 token，cookie/Bearer 双通道；非 loopback 绑定且无口令 = **拒起服务** | `cfg.serve.hostname ?? 127.0.0.1` | 无（只能 tsx） | `/api/hub` |
| 3 | Pinax 任务面 | 8451 | `cd storyharness && npm run serve:pinax`（= `tsx src/pinax/serve.ts`） | node:http | **无** | `cfg.host`，默认 `127.0.0.1` | 无（只能 tsx） | `/healthz` |
| 4 | MCP stdio 面 | — | `cd core && npx tsx src/cli.ts mcp`<br>或 `node dist/mcp.js`（`kit/README.md:180` 口径，同样需先 build） | stdio transport | n/a | n/a | 同面 1（有 build，产物不入库） | n/a |

### 1.1 内核 HTTP 面（:8421）

进程面三命令（`up`/`serve`/`mcp`）刻意与内核动词表分离，`kit/core/src/cli.ts:2` 的自述是「内核动词由 `verbs.ts` 唯一声明；本文件只管『参数解析 + 进程面』」。`up` 与 `serve` 同实现，差别只在 `up` 多了端口顺延与 `--open`：

- `kit/core/src/cli.ts:76` `const want = Number(flags.port ?? 8421)`
- `kit/core/src/cli.ts:77` `pickFreePort(want, want + 20)`，实现在 `:115-127`（逐个 `net.createServer().listen(p,"127.0.0.1")` 试探）；`:82` 顺延时打 stderr 提示，全占则 `:79` 报错退出
- `kit/core/src/cli.ts:87` → `startHttp(kernel, chosen)`；`kit/core/src/http.ts:266` `await app.listen({ port, host: "127.0.0.1" })`
- `kit/core/src/cli.ts:37` 的 usage 行写明这一面是「内核 API + legacy 页面端点 + 静态页 **同进程单端口**」

路由面两套并存：REST 版本化 `v1`（表在 `kit/core/src/api-v1.ts:150` `V1_ROUTES`，`API_VERSION = "v1"` 在 `:52`；含 `GET /api/v1` 自描述 `:152`、`GET /api/v1/verbs` `:166`、`POST /api/v1/verbs/:verb` `:184`、projects/state/graph/artifacts/journal/live/stream(SSE)/diagnostics/snapshots/config(GET+PUT)/workbench-payload/gate/rerun `:201-340`），以及 legacy `/api/*`（冻结契约 `kit/contracts/http-openapi.json`，只标弃用不改载荷，见 `kit/core/src/http.ts:2`）。legacy 面上另有 agent 会话 CRUD + rename + delete + turn（`kit/core/src/http.ts:188-215`）与 `/api/agent/model`（`:177,181`）。

**三面同源**是这一面的核心设计：`kit/core/src/cli.ts:42` 写明「动词表唯一源：`core/src/verbs.ts` —— CLI / HTTP(`POST /api/verbs/<verb>`) / MCP 三面均由其派生」，`kit/core/src/mcp.ts:5-8` 记录了此前 MCP 面手写 7 个 tool 与 CLI 13 动词不同步的教训，现已改为遍历 `VERBS`。

### 1.2 协议面（:8431）

`kit/storyharness/src/serve.ts:1-2` 自述：「协议面守护进程：生产线直驱（`/status` `/start` `/stop`）＋ agent 会话 API（**镜像内核 http.ts 形状** —— 工作台对话页签只切 API 基址即换脑，渲染零改动）」。端点清单逐条写在 `:6-25` 的头部注释里，含 `/api/login`、`/api/logout`、`/login`、`/api/agent/model`(GET+POST)、`/api/projects/:id/agent/sessions`(清单/新建/全文/stats/rename/delete/turn-SSE)、`/api/panel/files|raw|preview`、以及 `POST /api/kernel-verb` —— 后者是**对内核面的白名单代理**（`:25`：白名单 `flow_init/run/next/effect/kb_search/kb_read/worldbook_search`，`?trim=1` 剥提示词大文本）。`worldbook/telemetry/changes/canvas` 四类面板端点已 `410` 退役（`:24`）。

- 入口：`kit/storyharness/src/serve.ts:91` `startServe(kernel, cfg, port = 8431, opts)`；`:1164` `server.listen(port, host, ...)`
- 绑定：`:99` `const host = cfg.serve?.hostname ?? "127.0.0.1"`
- **fail-closed**：`:107-108` —— 未启用鉴权却要绑非 loopback 时直接 `throw`，错误文案要求「设 `SH_PASSWORD` / 配置 `serve.password`，或改回 127.0.0.1」
- 鉴权实现全在纯函数层 `kit/storyharness/src/auth.ts`：`:3` 无状态 token = `HMAC(expiry)`（服务重启不掉登录态，**手机经隧道不必每次重输口令**），`:4` fail-closed 口径（绑非 loopback 却没口令 → config 层自动生成强口令写 credentials 文件），`:5` 本机缺省形态零改变（不设 `SH_PASSWORD` = 不鉴权，但仍只绑 127.0.0.1），`:15` 只认标准点分四段的 127 段（`127.0.0.1.evil.com` 后缀伪装必须拒），`:71` 登录限流 5 次/30s，`:97-104` 限流键取 `cf-connecting-ip`/`x-forwarded-for`（隧道场景 socket 恒为 127.0.0.1，否则一人输错全员锁），`:139` CORS 从 `*` 收紧为 loopback 源 + 显式白名单
- 静态面：`:223-258` 托管 `/panel/`，优先 kitapp 的 `next build` 静态导出（`panel/kitapp/out`，`PAGES_BASE_PATH=/panel`），无产物回落 `panel/` 白名单后缀目录（零构建直出），并做路径越界与后缀白名单双重拦截
- 启动日志会自报鉴权态（实测 `%TEMP%\kit-web.log`）：`协议面 http://127.0.0.1:8431 … 鉴权未启用（仅本机可访问；对外绑定请设 SH_PASSWORD）`

### 1.3 Pinax 任务面（:8451）

这是 Pinax 唯一消费的面，也是 2026-10-06 P2 迁进 kit 的那一块。

- 入口：`kit/storyharness/src/pinax/serve.ts:6` 全文只有一句 `startServer()`；`:1-3` 自述「Pinax 任务面启动件（P2 口径统一）：pinax-adapter 运行时迁入 kit 后的入口。配置面不变：`PINAX_ADAPTER_CONFIG` 指定路径 > `<storyharness>/.external/pinax-adapter.json` > 默认（127.0.0.1:8451）。启动：`npm run serve:pinax`」
- 监听：`kit/storyharness/src/pinax/server.ts:326` `server.listen(cfg.port, cfg.host, ...)`；`:332` 有 `import.meta.url` 直跑守卫
- 端点：`:1-4` 头部注释 + `:314` 的 404 回执自报清单 —— `POST /v1/pinax/tasks`（开跑 + SSE）、`POST /v1/pinax/tasks/:id/resume`、`POST /v1/pinax/tasks/:id/cancel`、`GET /v1/pinax/tasks/:id`、`GET /v1/pinax/contract`（`:301`）、`GET /healthz`（`:166`）、`GET|POST /model`（`:169,173`，统一模型漏斗：状态/热切换）、`POST /v1/pinax/complete[/stream]`（`:183`，一次性补全转发）
- 健康回执实测：`{"ok":true,"service":"pinax-adapter","port":8451,"model":"openai.dots3-note-prev"}`
- 配置：`kit/storyharness/src/pinax/config.ts:30-44` `DEFAULTS`（`port 8451`/`host 127.0.0.1`/`tasksDir "tasks"`/`provider "zai"`/`model "glm-5.3"`/`thinking "medium"`/budget 四项/`allowedOrigins: []`）；`:73-82` 环境变量覆写序（`PINAX_ADAPTER_PORT|HOST|TASKS_DIR|PROVIDER|MODEL|BASE_URL|THINKING`，key 取 `MINIFLOW_AGENT_KEY ?? ZAI_API_KEY ?? fileCfg.apiKey ?? MINIMAX_API_KEY`，且 `MINIMAX_API_KEY` 单独存在时自动切 minimax 内建档）
- **不读工作区环境变量**：实测 `grep -rn "resolveWorkspaceRoot|workspaceRoot|STORYHARNESS_WORKSPACE" kit/storyharness/src/pinax/` 零命中。该面所有路径都从 `pkgRoot()`（`:48-50`，= `storyharness/`）解析。所以 kit `AGENTS.md:61` 记的「用户环境变量 `STORYHARNESS_WORKSPACE` 指向 storymasterv4，漏 set 会静默落到 v4」这个坑**只影响 8431 协议面与批调度器**（`kit/storyharness/src/config.ts:48`、`kit/storyharness/src/scheduler.ts:9`），不影响 Pinax 这条链。

### 1.4 MCP stdio 面

`kit/core/src/mcp.ts:1` 自述「动词表派生的 tools + 故事上下文派生的 resources / prompts（stdio transport）。**交付不自动注册进宿主**」。`:9-12` 记录 R4 补的四类只读资源（世界书图/词条/运行态/产物正文）与两个提示模板（世界书体检/裁决辅助），目的是让宿主能「看见故事」而不是只「命令内核」；清单本身也派生自同文件的 `MCP_RESOURCES`/`MCP_PROMPTS`，测试直接对着两张表断言，不在别处抄第二份名单。

另有反方向的一面：`kit/core/src/agent-mcp.ts:1-3` —— 把**用户配置的外部 MCP server**（stdio）的工具接进 pi-agent 对话流工具环，配置在 `<repoRoot>/.external/agent-mcp.json`，工具名内联为 `mcp__<server>__<tool>` 防撞名。

---

## §2 三套互不知情的进程监督器

微服务化的难点从来不是"能不能起"，而是"谁负责拉起、谁负责巡检、挂了谁管"。kit + Pinax 现在**同时存在三套监督器，彼此不知道对方存在，也没有统一拓扑文档**。

### 2.1 `web.ts` —— 一条命令拉全栈（进程内监督）

`kit/storyharness/src/web.ts:1-4` 自述这是「dsh `dsh web` 减法形态：shell 一条命令拉起全栈并自动开浏览器。① 内核 HTTP 面（core up，默认 8421：动词/立项全通）② 本包协议面（默认 8431，进程内 `startServe`）：pi 单脑 agent 会话 + 生产线直驱（前端已随 2026-10-02 切割离仓：无页面服务；界面由外部宿主经 adapter 协议接入）」。

它的做法是**声明式运行时规格**（`kit/storyharness/src/web.ts:41-42,60`，逐字摘录）：

```ts
interface RuntimeSpec { command: string; cwd?: string; port?: number; health?: string }   // :41
interface ManifestRuntime { kernel?: RuntimeSpec; ui?: RuntimeSpec }                      // :42
const kernelSpec: RuntimeSpec = rt.kernel ?? {                                            // :60
  command: "npx tsx src/cli.ts up --port {port}", cwd: "core", port: kernelPort, health: "/" };
```

规格从 `<workspaceRoot>/.storyharness.json` 的 `runtime.kernel` 读；**实测两个仓都没有这个清单文件**（`ls` 双双 No such file），所以目前只能走上面这份缺省。行为要点：`:64` 先 `ping` 内核健康端点，通则**复用不重起**，不通才 `:66` `quietSpawn`（命令里的 `{port}` 占位符在这一步替换）；`waitUp` 600ms 轮询、内核最长等 120s；退出时 SIGINT 清理子进程。`quietSpawn` 带一条 Windows 硬约束：子进程 stdio 必须 piped 且被排空，否则 Windows 上 python 孙进程会 `0xC0000142` 失败，连带打死 `whereami`/`quality_scan`。

### 2.2 `scripts/ops/` —— Windows 常驻微服务运维件（计划任务监督）

`kit/scripts/ops/README.md:3` 开宗明义：「微服务化后的常驻服务栈：三个服务各自独立隐藏启动器 + 统一守护巡检 + 一键停/查。全程无 cmd 窗口。」

| 服务 | 端口 | 启动器 | 健康探针 | 日志（`%TEMP%`） |
|---|---|---|---|---|
| 内核（core，编排） | 8421 | `kit-core.vbs` | `/api/v1/openapi.json` | `kit-core.log` |
| 协议面（storyharness web） | 8431 | `kit-web.vbs` | `/api/hub` | `kit-web.log` |
| 面板 dev 热更（kitapp） | 30142 | `kit-app.vbs` | `/` | `kitapp-dev.log` |

（表出自 `kit/scripts/ops/README.md:5,9-11`。注意第三行是 `next dev` 热更面板，不是生产形态。）

守护链：计划任务 `kit-guard`（每 5 分钟）→ `wscript //B kit-guard.vbs` → `kit-guard.bat` 对三服务做 `curl --fail --noproxy "*" --max-time 4` 探针，非 2xx 即视为挂、经对应 `.vbs` 隐藏拉起；日志单文件超 2MB 自动轮转 `.old`。`kit-guard.bat:3` 记了为什么用 HTTP 探针而不是 netstat：「a hung process still LISTENs」。重建命令（管理员）：`schtasks /Create /TN kit-guard /TR "wscript.exe //B D:\storyflow-kit\scripts\ops\kit-guard.vbs" /SC MINUTE /MO 5 /F`。另有 `kit-status.bat`（健康报告，exit 0 = 全绿）与 `kit-stop.bat`（按端口 `netstat -ano | findstr LISTENING` → `taskkill /F /T`）。

README 的「纪律（为什么是这套形态）」四条（`:33-38`）是这套形态的存在理由，逐条都有踩坑史：

- `:35` **长驻服务不挂在 agent 会话进程树下** —— 会被环境周期性回收（`serve.py` / `next dev` / core 全中过招），计划任务走的 svchost 作业树不受影响。
- `:36` **一切无窗** —— `.vbs` 以窗口 style 0 拉起，巡检/重启都不弹 cmd。
- `:37` **工作区必须显式钉** —— `set STORYHARNESS_WORKSPACE=D:\storyflow-kit`；用户环境变量指向 storymasterv4，漏 set 会静默落到 v4。（`kit-core.vbs` 与 `kit-web.vbs` 实测都内联了这句 `set`；`kit-app.vbs` 没有，因为它不碰工作区。）
- `:38` **日志是真相** —— 排障看 `%TEMP%\kit-*.log`，不看窗口。

kit `AGENTS.md:61` 还补了两条：一是 `curl` 调 8431 记得 `--noproxy "*"`（本机系统代理会截 127.0.0.1 的请求）；二是 **`.vbs` 必须纯 ASCII，中文注释会被 WSH 按 ANSI 读坏** —— 这条对 §3 的修复方案是硬约束，谁去改 `kit-guard.vbs` 都不能顺手加中文注释。

### 2.3 `storyAgentRuntime.js` —— Pinax 侧监督（宿主监督）

`server/services/storyAgentRuntime.js:1-4` 自述：「Optional local runtime. Since the P2 unification (2026-10-06) the pi-agent task plane lives in storyflow-kit (`storyharness/src/pinax`, canonical). This helper probes the loopback plane and, when the kit repo is available locally, spawns it with the Pinax-side config. **Public browsers reach it only through the guarded `/api/storyagent` proxy.**」

完整决策链（行号即证据）：

| 步骤 | 行 | 行为 |
|---|---|---|
| 总开关 | `:22` | `PINAX_STORYAGENT_ENABLED === '0'` → 直接返回 null |
| 端点 | `:23` | `PINAX_ADAPTER_ENDPOINT` ?? `http://127.0.0.1:8451` |
| 配置注入 | `:24-25` | `PINAX_ADAPTER_CONFIG` ?? `<pinax>/adapters/pinax-adapter/.external/pinax-adapter.json` —— **配置文件留在 Pinax 仓，运行时在 kit 仓** |
| 入口定位 | `:26-27` | `PINAX_KIT_SERVE_TS` ?? `<pinax>/../storyflow-kit/storyharness/src/pinax/serve.ts`（**硬编码兄弟仓相对路径**） |
| 无密钥早退 | `:28` | 三个 key 全无且配置文件不存在 → null |
| **复用** | `:30` | `probeHealthz(endpoint)` 通 → 返回空壳句柄，不 spawn |
| 入口缺失 | `:32-35` | warn 并回落原生链 |
| tsx 定位 | `:36-40` | 用 kit 自己的 `node_modules/tsx/dist/cli.mjs`；没有则 warn「start `npm run serve:pinax` in storyflow-kit manually」并回落 |
| **spawn** | `:41-45` | `spawn(process.execPath, [tsxCli, serveTs], { cwd, env: {...env, PINAX_ADAPTER_CONFIG}, stdio: 'ignore' })` |
| 等健康 | `:48-55` | 500ms 轮询、上限 `SPAWN_WAIT_MS = 20000`；子进程提前退出即判失败 |
| 失败兜底 | `:56-59` | warn + `child.kill()` + 返回 null → agent 路由回落原生链 |

**两处与 §2.1/§2.2 不一致的细节值得注意**：一是 `stdio: 'ignore'`（`:44`），而 `web.ts` 的 `quietSpawn` 明确警告 Windows 下 stdio 不 piped+排空会让孙进程 `0xC0000142`；本次未实测这条是否在 8451 链上复现（该链是否 spawn python 孙进程未查），列为待核。二是 spawn 时 `env: {...env}` 原样继承、未显式钉 `STORYHARNESS_WORKSPACE`；按 §1.3 的实测这**不构成缺陷**（该面不读此变量），但如果将来 Pinax 改为消费 8431 或调批调度，就必须补上。

---

## §3 实测现场（2026-10-08 12:23，本机）

| 探针 | 结果 | 解读 |
|---|---|---|
| `http://127.0.0.1:8421/` | `000`（连接失败） | 内核面 **down** |
| `http://127.0.0.1:8431/` | `000` | 协议面 **down** |
| `http://127.0.0.1:30142/` | `000` | 面板 dev **down** |
| `http://127.0.0.1:8451/` | `404` + JSON | 任务面 **up**（404 是它自己的 not-found 回执，正文列出 6 个端点） |
| `http://127.0.0.1:8451/healthz` | `{"ok":true,"service":"pinax-adapter","port":8451,"model":"openai.dots3-note-prev"}` | 任务面健康，模型档 = dots3-note-prev |
| `Get-ScheduledTaskInfo kit-guard` | `LastRunTime 2026/10/8 12:23:01`、`LastTaskResult 0`、`NextRunTime 12:28:00`、`NumberOfMissedRuns 0`、`State Ready` | 守护任务**装着且在跑** |
| 任务主体 | `UserId=Administrator`、`LogonType=Interactive`、`RunLevel=Limited` | 交互式登录用户态，非 SYSTEM |
| `%TEMP%\kit-core.log` | 1592 B，mtime **10-05 01:53** | 两天多无新增 |
| `%TEMP%\kit-web.log` | 4896 B，mtime **10-06 05:37** | 两天多无新增 |
| `%TEMP%\kitapp-dev.log` | 243022 B，mtime **10-05 01:55** | 同上 |
| `C:\Windows\Temp\kit-*.log` | 不存在 | 排除"日志写到另一个 TEMP"这一解释 |

**这三件事凑在一起是矛盾的**：守护每 5 分钟跑一次并报告成功，三个服务全 down，而重启本应写入的日志两天多没长一个字节。所以重启链没有执行到 `npx tsx` 那一步。

`LastTaskResult 0` 不能当作"巡检成功"的证据：`kit-guard.vbs` 用的是 `CreateObject("Wscript.Shell").Run "...", 0, False`，第三个参数 `False` = 不等待，wscript 立刻退出、任务立刻报 0，`.bat` 作为孤儿继续跑。也就是说**任务返回码与巡检结果完全解耦**。

**根因未确证**，本文不编故事。可检验的候选（按可能性排序，都需要用户亲手验，因为验法要起长驻服务）：

1. 计划任务的作业对象在任务"完成"（wscript 立即退出）时回收了孤儿 `cmd`，`.bat` 没跑到探针就被杀。验法：把 `kit-guard.vbs` 的 `False` 改 `True`（等待），或直接让计划任务指向 `.bat`。
2. 计划任务上下文里 `curl` 不在 PATH → `if errorlevel 1` 成立 → 拉 `.vbs` → `.vbs` 里 `npx` 也不在 PATH → cmd 在 `&&` 链前段就断，重定向没发生所以无日志。验法：在 `.bat` 开头加一行 `echo %PATH% >> %TEMP%\kit-guard-trace.log`。
3. `.vbs` 关联被改（`wscript` 不是 `.vbs` 默认宿主）。验法：`assoc .vbs` / `ftype`。

**本次没有执行任何拉起动作**。理由是 kit `AGENTS.md:61` 与 `scripts/ops/README.md:35` 都明写「长驻服务别从 agent 会话进程树里起（会被环境周期性回收）」——我正是 agent 会话进程树。要复现请用户自己在**独立终端**里跑 §8 的命令。另注：真要改 `kit-guard.vbs` 时**不能加中文注释**（`AGENTS.md:61`：`.vbs` 必须纯 ASCII，中文会被 WSH 按 ANSI 读坏）。

顺带一个反证性的观察：**8451 是全栈里唯一活着的服务，而它恰好是唯一由宿主（Pinax Express）自己 spawn 并轮询健康的那个**。这为 §0 结论 7「监督权留在 Pinax 侧」提供了现场证据。

---

## §4 安全面：三面的鉴权与 CORS 口径不一致

| 面 | 鉴权 | CORS | 绑定 | 风险评述 |
|---|---|---|---|---|
| 8421 内核 | 无 | `origin: true`（**全反射**，`kit/core/src/http.ts:21`） | `127.0.0.1` 硬编码（`:266`） | 只绑 loopback 挡住了远端，但**任意本机网页都能跨源读它**（含 `POST /api/verbs/:verb` 写操作、`PUT /api/v1/projects/:id/config`）。这是 localhost CORS 反射的经典面。 |
| 8431 协议面 | HMAC token + 登录限流 + fail-closed | loopback 源 + 显式白名单（`kit/storyharness/src/auth.ts:139`） | 可配，非 loopback 无口令即拒起（`serve.ts:107-108`） | **三面里唯一做对的**。设计口径明确写了隧道场景（手机经 Cloudflare 访问），限流键取真实客户端 IP。 |
| 8451 任务面 | 无 | `allowedOrigins: []`，注释即「空 = **反射 `*`**（开发态）」（`kit/storyharness/src/pinax/config.ts:26-27,43`） | `cfg.host` 默认 `127.0.0.1` | 与 8421 同类。缓解因素：`storyAgentRuntime.js:4` 声明浏览器只经 guarded `/api/storyagent` 代理访问；而**唯一直连 8451 的浏览器代码 `src/components/authoring/StoryAgentBetaPanel.vue:31,195,223` 实测 0 importer**（`grep -c` on `src/App.vue` = 0，全仓内容检索仅命中 docs/.zcode/_staging），即反射 CORS 目前服务于一个未挂载的组件。 |

**待裁定项，不是本次要动的**：若确认 8451 只被 Pinax 服务端消费，则 `allowedOrigins` 应从反射 `*` 收成 Pinax 源白名单或直接关掉；8421 同理。但 8421 的 CORS 是 kit 上游口径，改动要走上游。另注：`docs/plan/worldbook-unification-abc-20261008.md:9` 记载上游作者刻意把 `StoryAgentBetaPanel` 以「校验/测试专用，不写入书稿/世界书」的新契约保留在 main 并明确「勿再删」——所以**不能靠删组件来收窄 CORS**，只能改配置。这条与我此前 `rightdock-prd-20261008.md` §4 移除矩阵把它当"死代码 0 importer"列入清理项**冲突**，以「勿再删」为准，移除矩阵待修（见 §6）。

---

## §5 对修订版 PRD 的三处改写

### 5.1 G1 要改：8421 不是幻觉，是被混用了

`docs/plan/kit-runtime-plan-revision-20261008.md:27` 的 G1 现在写「端口是 **8451**（不是 8421）」。这个纠偏本身过了头：**8421 真实存在**，是 kit 内核 HTTP 面的缺省端口（`kit/core/src/cli.ts:76`），且有独立的 OpenAPI 契约与运维启动器。原 PRD 说"走 8421 HTTP"不是凭空编造，而是把**内核面**与 **Pinax 任务面**混为一谈。

准确表述应为：Pinax 当前消费的是 **8451 任务面**；8421 内核面与 8431 协议面**真实存在但 Pinax 零引用**（实测见 §8）。原 PRD 的"内嵌进 Express 进程、不再走 HTTP"这个**形态判断**依然是错的，这一点 G1 纠得对。

### 5.2 P1-a 要改：不是"kit 没有 JS 产物"，而是"storyharness 没有"

修订版 PRD 的 P1-a 把「kit 必须先产出 JS 产物」当成内嵌的前置上游 PR。实测更细：

- `kit/core` **已有** `build: tsc -p tsconfig.json`、`bin: { miniflow: "./dist/cli.js" }`；本机 `core/dist/` 顶层 50 项、递归 64 个 `.js`（含 `cli.js`/`http.js`/`mcp.js`/`agent-mcp.js`），**但 `core/.gitignore:1` = `dist/`、`git ls-files core/dist` = 0**，所以那是本地 build 遗留，不是仓库既成事实。字段上还缺 `main`/`exports`/`files`（`node -e` 实测均为 `undefined`），所以即便 build 了也还不能被 `import '@storyflow/core'` 正常解析。
- **反过来，kit 把 `node_modules` 入库了**（`git ls-files` 实测 core 6470 / storyharness 11861，含 `tsx` 30 个文件；`kit/.gitignore:11` 注释自述）。这一条对 Q1 是实质利好：维持子进程形态所依赖的"兄弟仓自带 tsx 运行时"是仓库保证，不是本机巧合。
- `kit/storyharness` **完全没有**：无 `build`、无 `dist`、无 `bin`、无 `exports`、无 `files`，只有 `typecheck/start/serve:pinax/test/verify:pack` 五个 script。

而 8451 任务面在 storyharness 里。所以 P1-a 的真实工作量是**给 storyharness 补构建**（含 `pinax/` 子树的 `.ts` → `.js`，以及它对 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 的依赖处理），比"给 core 补 exports"重得多。这也进一步支持 §0 结论 7：不要把 Pinax 的收口卡在这件事上。

### 5.3 Q1 应改选 ③，并把"监督权归属"单列一问

修订版 PRD `:111` 的 Q1 三选项：① kit 加 build 出 dist + exports（上游 PR，最干净）② Pinax 生产依赖 tsx（最快，把 TS 运行时带进生产）③ 维持子进程、只改文档口径（零施工）。原文倾向 ①。

调研后改为**倾向 ③，① 降级为独立上游工作项**，依据三条：

1. ③ 不是"放弃目标"，而是**承认已经落地的形态就是微服务形态**——Pinax 侧已有探测/复用/spawn/等健康/失败回落/总开关六件套，kit 侧已有声明式 `RuntimeSpec` 与计划任务守护。缺的是文档口径和几处收口，不是架构。
2. ① 的收益（脱 tsx、脱源码树）真实存在，但它解的是"生产依赖兄弟仓源码"这个问题，而**这个问题在 §3 的现场证据下不是最痛的**：最痛的是 kit 侧守护当前不工作、以及三套监督器无统一拓扑。先修这两个，比先补构建收益高。
3. ② 应该直接排除：把 `tsx` 带进 Pinax 生产依赖，换来的是"能在 Pinax 进程里 import TS 源码"，但 storyharness 无 `exports`，import 路径仍然是深链源码树，等于付了成本没拿到收益。

**新增待裁定 Q（建议编号 Q7）**：监督权归属。三套监督器（`web.ts` 进程内 / `kit-guard` 计划任务 / `storyAgentRuntime` 宿主）要不要收敛成一套？我的建议是**分层而不合并**：8451 归 Pinax 监督（宿主知道自己要不要 agent 能力，且现有 fail-open 依赖这个探测结果），8421/8431 归 kit 守护（但要先修好），`web.ts` 保留为 kit 自己的开发态一键起。代价是拓扑得写进文档，否则下一个人还会以为只有一套。

---

## §6 顺带发现（与本次问题相关，均**未动手**）

1. **`rightdock-prd-20261008.md` §4 移除矩阵有一处要撤**：它把 `src/components/authoring/StoryAgentBetaPanel.vue`（35 KB、实测 0 importer）当死代码列入清理项，但 `docs/plan/worldbook-unification-abc-20261008.md:9` 记载上游作者已用新契约（「校验/测试专用，不写入书稿/世界书」）刻意保留它于 main，并写明「我方退役方向被上游改写——以 main 现状为准，**勿再删**」。以「勿再删」为准。该文件最后由上游 merge `92294d2` 触碰（`git log` 实测仅 1 条提交）。
2. **`.storyharness.json` 在两个仓都不存在**，所以 `web.ts` 的声明式 `RuntimeSpec` 目前完全走缺省值。如果将来要让 Pinax 声明"我要哪个内核、什么端口、什么健康端点"，这个清单文件就是现成的挂载点，不需要新造协议。
3. **`core/dist/` 与 `node_modules` 的入库口径是一对反差**，已上升为 §0 结论 3/4 与 §5.2，此处只留取证命令：`git check-ignore -v core/dist/cli.js`（命中 `core/.gitignore:1`）、`git ls-files core/dist | wc -l`（0）、`git ls-files storyharness/node_modules | wc -l`（11861）。

---

## §7 待裁定清单

| # | 问题 | 选项 | 我的倾向 |
|---|---|---|---|
| M1 | Pinax 与 kit 的耦合形态（= 修订版 PRD Q1） | ① 上游补 storyharness build 后内嵌 ② Pinax 生产依赖 tsx ③ 维持子进程 + 扶正文档口径 | **③**，① 转独立上游项，② 排除 |
| M2 | 监督权归属（新增） | 全归 kit 守护 / 全归 Pinax / **分层**（8451 归宿主，8421+8431 归 kit） | **分层**，并把拓扑写进 `docs/engineering/` |
| M3 | kit-guard 当前不工作，谁修 | 我在 Pinax 侧记录为已知问题 / 提到 kit 上游修 / 用户本机手工修 | 先**记录**（本次纯调研），修法需用户亲手起服务验，见 §3 三条候选 |
| M4 | 8421 与 8451 的 CORS 反射要不要收 | 收（8451 归 Pinax 可自主改配置；8421 走上游）/ 不收（只绑 loopback 已够） | **8451 收**（`allowedOrigins` 填 Pinax 源），8421 提上游 |
| M5 | Pinax 要不要开始消费 8421 或 8431 | 只留 8451 / 加 8431 的 `/api/kernel-verb` 白名单代理（可拿到 flow 编排能力而不自己起内核）/ 加 8421 直连 | **暂只留 8451**；若右侧工作台要 flow 编排，优先走 8431 代理（它有鉴权） |
| M6 | `docs/plan/rightdock-prd-20261008.md` §4 移除矩阵撤掉 Beta 面板那一行 | 撤 / 保留待上游再确认 | **撤**（依据 §6.1 的「勿再删」） |

---

## §8 复现命令

```bash
# ── 一、四个面的入口与端口（应命中 cli.ts:76 的 8421、serve.ts:91 的 8431、config.ts:31 的 8451）
grep -n "8421" /d/storyflow-kit/core/src/cli.ts
grep -n "port = 8431\|8431" /d/storyflow-kit/storyharness/src/serve.ts | head -3
grep -n "port: 8451\|host:" /d/storyflow-kit/storyharness/src/pinax/config.ts

# ── 二、构建产物差异（P1-a 改写依据）
node -e "const c=require('/d/storyflow-kit/core/package.json'),s=require('/d/storyflow-kit/storyharness/package.json');
  console.log('core  scripts:',Object.keys(c.scripts),'bin:',c.bin,'exports:',c.exports);
  console.log('sh    scripts:',Object.keys(s.scripts),'bin:',s.bin,'exports:',s.exports)"
ls /d/storyflow-kit/core/dist/cli.js /d/storyflow-kit/core/dist/mcp.js   # 本机存在（本地 build 遗留）
ls /d/storyflow-kit/storyharness/dist                                    # 应 No such file

# ── 二之补、入库口径反差（§0 结论 3/4 依据）
cd /d/storyflow-kit && git check-ignore -v core/dist/cli.js              # 应命中 core/.gitignore:1
cd /d/storyflow-kit && git ls-files core/dist | wc -l                    # 应 0（产物不入库）
cd /d/storyflow-kit && git ls-files core/node_modules | wc -l            # 实测 6470（依赖入库）
cd /d/storyflow-kit && git ls-files storyharness/node_modules | wc -l    # 实测 11861
cd /d/storyflow-kit && git ls-files storyharness/node_modules/tsx | wc -l # 实测 30（tsx 随仓走）

# ── 三、Pinax 只消费 8451（应命中 5 处，且 8421/8431 零命中）
grep -rn "8451" server/ src/ shared/ --include=*.js --include=*.ts --include=*.vue
grep -rn "8421\|8431" server/ src/ shared/ --include=*.js --include=*.ts --include=*.vue   # 实测 0 命中

# ── 四、运维件与守护状态（§3 现场）
cat /d/storyflow-kit/scripts/ops/README.md
ls -la "$TEMP"/kit-core.log "$TEMP"/kit-web.log "$TEMP"/kitapp-dev.log
powershell.exe -NoProfile -Command "Get-ScheduledTaskInfo -TaskName kit-guard | Format-List LastRunTime,LastTaskResult,NextRunTime; (Get-ScheduledTask -TaskName kit-guard).Principal | Format-List UserId,LogonType,RunLevel"

# ── 五、活体探针（只读；--noproxy 是本机系统代理会截 127.0.0.1 的必需项，见 kit AGENTS.md:61）
for p in 8421 8431 8451 30142; do printf "%s: " $p; curl -s -o /dev/null -w "%{http_code}\n" --noproxy "*" --max-time 2 http://127.0.0.1:$p/; done
curl -s --noproxy "*" http://127.0.0.1:8451/healthz

# ── 六、要亲手起服务时（务必用独立终端，不要从 agent 会话起 —— kit AGENTS.md:61）
cd /d/storyflow-kit && wscript scripts/ops/kit-guard.vbs     # 巡检一次，挂了才拉
cd /d/storyflow-kit && scripts/ops/kit-status.bat            # exit 0 = 全绿
cd /d/storyflow-kit/storyharness && npx tsx src/cli.ts web   # 一条命令拉 8421+8431
cd /d/storyflow-kit/storyharness && npm run serve:pinax      # 单起 8451
```

---

## §9 本次调研的边界（不可考项）

- **未起任何服务、未改任何代码、未 commit。** 所有"能起"的判断来自源码与运维件阅读 + 8451 的活体探针，不是来自我把 8421/8431 起起来跑通。
- kit-guard 失效的**根因未确证**，§3 只列可检验候选，不做归因。
- `stdio: 'ignore'`（`storyAgentRuntime.js:44`）是否会在 8451 链上触发 `web.ts` 记载的 Windows `0xC0000142` 孙进程问题，**未查也未实测**（需先确认该链是否 spawn python 孙进程）。
- 8451 的 `/healthz` 是唯一取到活体回执的端点；8421/8431 的载荷未取样（服务 down），端点清单来自源码路由表与 `serve.ts:6-25` 头部注释，**不是来自活体 OpenAPI**。
- `core/dist/` 的入库口径已查实（gitignore + `git ls-files` = 0，见 §5.2），但**未验证 `npm run build` 当前能否在本机跑通**——本机那 64 个 `.js` 是历史产物，是否与 `core/src/` 当前状态同步未查。
- `~\.dsh\.credentials.yaml` 与 `adapters/pinax-adapter/.external/` 内的密钥文件**刻意未读**。
