# Pinax 共享业务内核统一计划（Web / Pinix / Next）

日期：2026-10-31  
状态：执行中（主Pinax Core迁移，尚未全部完成）  
目标读者：主Pinax与Pinix维护者；Next仅保留历史对照

> 当前范围更正（2026-11-06）：主Pinax的Core抽取及Pinix复用；暂停Next适配工作。0.13的已实现模块和历史验证保留，但“全部分工前置完成”结论撤回。0.14已抽取媒体、0.15资料归档/解析、0.16体验/跑团；SQLite启用属于单独的平台接线。平台IO/网络/SDK保留在Host。

## 分工前置进度（2026-11-06，继续迁移）

主Pinax与Pinix固定消费独立 `@pinax/core` **0.16.0**，来源`e56a0bc133efdb675be17af95f0967cdf2e11e16`；Next未随本轮升级。Core 0.16.0（e56a0bc）已抽取体验/跑团业务：共享运行时状态与动作、完整回合事务、会话/分支恢复、检定/骰点/回执、场景/资源/同伴、主持步骤、观察器及触发流程。gameStore只绑定共享运行时，原服务路径转发或注入Host端口。状态容器、浏览器存储/去抖、Web Locks、安全随机源、模型通道与页面事件留Host；保留原ID、存储键和版本，不迁作者数据。本轮Web/Pinix verify:full均exit0（30文件290例 / 20文件200例），两端跑团315项与会话故障矩阵20项通过；Core85例、245模块Node独立导入、静态检查和隔离npm消费通过。两端真实浏览器验证离线生成/重试、冻结骰点、刷新恢复、失败分支隔离与取消落盘；Pinix mobile:check/build/sync通过。未做APK/真机或真实模型质量验收。

| 公共接口 | 已实施内容 | Host边界与剩余接线 |
|---|---|---|
| 领域 Service / Store | 作品、章节、设定条目、大纲、笔记、资料；合入大纲端点存在性检查 | A提供平台存储；B调用服务。图片/归档/素材的语义不能仅凭名字强行合并 |
| `createProjectTransactionService` | projectId、operationId、entityType/entityId、expectedRevision；统一修订和幂等回执 | A提供明确隔离的key映射、持久化及平台并发锁；不把多个普通Store调用宣称为原子事务 |
| `createJournaledWriteStore` | 写前日志、回读确认、失败逆向补偿、崩溃恢复；可带expected快照 | Web助手现有多键采用已接此Core协调器，保留原日志格式；跨介质不是ACID |
| `createDurableTransactionService` | 异步flush明确成功后才确认durable，失败返回PERSISTENCE_PENDING，重试同操作不重复增修订 | A对接移动镜像/文件fsync；UI等待结果，失败保留草稿与重试入口 |
| `createAssistantProposalEngine` | 冻结/定位、依赖、冲突、采纳、拒绝、撤销及保护快照计算 | B提供编辑器和人物卡投影；所有正式保存通过Host事务，不允许直接把计算结果当已保存 |
| 审阅与权限合同 | 已处理决定、去重、结束审阅、权限判断、工具schema与富关系归一 | Web已调用；运行器候选包携带同一固定Core合同，不依赖开发仓库的node_modules |

**前置完成后拟分配的首批任务（组员实施未启动）**：A把持久化/恢复/备份适配接到公共接口；B完成移动编辑器、章节组织与审阅呈现；C先交付一个完整媒体生成→保存→重开→失败恢复流程，随后持续承担漫画/视频等方向。任务按方向分工，后续功能属于各方向的长期范围，并非取消。跨组共享合同、版本与集成由维护者负责。

0.13接通了当时列出的运行/二进制端口，但清单遗漏漫画页、分镜/版本及生成业务等Host实现。UI、SDK、HTTP、文件fsync、原生镜像与数据库打开是保留的平台职责，不能为追求“所有文件进Core”抹掉Host边界。Next的漫画记录/Comfy引用依旧是原能力，不声称已自动下载产物；后续媒体生成闭环由C在已接公共端口上实现。

0.14实际入口：`createComicPageRepository`、`createStoryboardRepository`、`createComicProductionService`、`createComicAdaptationService`、`createComicScriptService`与`createShotExporter`，加来源/图片桥及渠道配置仓储。原路径仅转发或注入Host端口。Pinix草稿保存接`saveComicPageDraft`，三个漫画显示/编辑组件读取同一显示选择，阶段产物不再被当成普通图片候选；未重做UI布局。模型偏好广播由Web注入，Pinix继续原有字符串写入；图片选择键补齐备份与键分类。

0.15已接的资料端口：`createSourceArchiveRepository({ archiveStore, idFactory })`，store提供`readAll/readMany/snapshot/write`；跨表批次在提交结束后返回`{ok:true}`。`createSourceParser`和`createEpubReader`分别注入库加载与ZIP端口。数据库仍为`pinax-source-archive`版本1/三个id-keyPath表，既有ID与哈希保留；分块原文相等才共享，已复现的`costarring/liquid`旧FNV碰撞不再合并。创建工作区的未完成输入及中断状态保留。原文件二进制保存范围不扩大。

0.16已接的体验端口：`createExperienceRuntime`返回`createState/actions`，由原Pinia owner绑定。`createExperienceTurnCoordinator`保留完整回合提交/失败恢复，不拆成独立半事务；生成、记录、状态读取与通知由Host注入。跑团工作流依赖工厂实例自己的历史端口和安全随机源；Web Locks仅由Host取得并传入。所有存档仍沿用原schema/ID/存储键。分支恢复只选择committed回合，避免失败快照被误采用。

| 当前核对范围 | 代码入口 | 结果与边界 |
|---|---|---|
| 体验与跑团 | Core `experience/`；Host `gameStore`和原服务路径 | 已抽取并在两端实际消费，不再列为待抽取；Host保留状态容器和平台能力。两端315项跑团、20项会话矩阵与真实浏览器恢复旅程通过，非真实模型质量证据 |
| SQLite应用接线 | `server/services/projectCatalogDb.js`及派生目录模块 | 离线隔离检查已有，尚未接实际应用；不属于本批Core规则搬迁，后续由平台方向接入 |
| 后续交付验收 | 各Host与组员任务 | 跨设备/真机/真实模型和平台存储接线单列，不因共享包可导入而自动完成；Next按作者要求暂停 |

前面已列业务批次现已通过实际Host接线；这不等于所有平台迁移、后续功能或产品验收完成。后续按原A/B/C方向分工，避免继续用“抽Core”承包新的功能建设。

## 历史执行顺序（2026-11-05，当前范围以上表为准）

作者将后续工作重心明确为底层分离。执行顺序如下；下表区分已经实施与后续设计，不把导出接口当作 Host 已接入。

| 顺序 | 范围 | 当前结果 / 下一交付 |
|---|---|---|
| 1 | 独立包消费 | Web 章节 adapter/composable 与离线 Catalog 改为引用 `@pinax/core` 0.8.0；固定 tarball、来源记录及 lockfile 已写入。11-06已更新0.9.0并执行包消费验证 |
| 2 | 统一写入事务 | 公共合同/日志协调/幂等回执及durable flush门面已实施；Web助手已接共享日志。各Host真实原子落盘、跨进程锁与各领域Store接入仍由适配器负责 |
| 3 | 共享 Harness | 权限/工具合同、proposal计算与工作集、采纳/拒绝/撤销/审阅完成决定已抽取并接Web；原生Pi会话/上下文编译/任务执行已抽到Core并由Host注入SDK、模型和存储；Next主入口已通过同一原生Pi装配执行，提案/审计、取消、分支可见历史与原项目归属已接；旧手写循环仅兼容 |
| 4 | 三端适配 | Pinix页面真实章节调用已接，书籍/大纲/速记/条目编辑和上下文同步Core；Next各载体文件工具/JSONL/章节已接；Web/Pinix双槽/版本/世界书完整状态与记忆候选/账本已共享。Agent实际执行和媒体/素材及二进制端口已接；设备真机仍未验 |
| 5 | 官方扩展合同 | 待设计：视图/工具/供应商/导入导出适配的注册与能力声明；不绕过 Core 写入，不允许插件直接操作 Host 存储键 |

依赖边界：**Host UI → Core usecases/contracts；Host composition 注入 adapters → Core ports**。Core 不读取 Vue、DOM、localStorage、Node fs 或平台全局对象。平台存储形态保持不同，业务身份和冲突语义必须一致。文件项目内容仍是事实源，SQLite Catalog 仍是可重建投影；浏览器数据不因切包自动转文件。

事务抽取的第一合同应覆盖：`projectId/entityId/expectedRevision/operationId`、持久化成功回执、失败不发布成功、重复提交幂等；跨实体写入需要 adapter 明确事务能力，不能用多个普通 Store 调用假装原子事务。project/entity/revision/operation与flush合同已实施，但不代表所有Host和跨实体存储都已具备原子保证。

Harness 抽取先分离纯状态机和业务命令，再接内容/事务/模型/会话存储端口。现有 Pi 循环保留为运行器适配；上下文业务编译可共享，网络传输/模型调用由 adapter 承接。首个切片应明确验证“采纳、拒绝、撤销、结束审阅”相同输入在三端产生相同决定，避免把当前 Vue 工作集逻辑整份复制到移动或 Next。

官方插件先做可信、随发行交付的模块；通用写作业务语义保留在 Core，可选工具与视图通过扩展合同注册。哪些现有功能要拆成可选插件仍需逐域决定；本轮没有建立插件市场或任意代码加载器。

旧 `packages/core` 的大纲校验已移交独立包，src已退为转发兼容层；历史合同用例暂留作实际包消费回归，不再允许作为第二业务实现演进。

11-05历史记录：当轮只完成固定包消费和抽取边界整理，未做测试/构建/门禁、数据迁移、服务重启或部署。11-06已按上文验证公共基线，不再用这条历史记录表示当前未验证。

## 1. 目标与范围

### 1.1 目标

建立一套**共享业务内核（Business Core）**，让 Web、Pinix Mobile、Next 极简版共用同一套业务规则、数据模型、Agent/上下文、工具、保存/迁移/备份实现。以后业务变更只在 Core 中修改，三端不再各自复制一份实现。

### 1.2 非目标

- 不要求三端 UI 像素一致；UI 可以分别演进。
- 不先做插件市场、第三方生态、云同步、账号体系。
- 不为了“换底座”而重写现有业务；优先从现有最成熟实现抽取。
- 不把 Pinix 或 Next 直接当成新内核；它们是 Host。
- 不在本计划内解决真实模型质量、APK 真机全量验收、iOS、商店发布。

## 2. 现状与问题

当前实际存在三份业务实现：

| 端 | 现状 | 主要问题 |
|---|---|---|
| Web/main | 业务最完整，但散落在 `src/services`、Vue 组件、server 服务中 | 没有独立 Core，业务与 UI/平台耦合 |
| Pinix | 旧 Pinax 业务代码复制树 + Capacitor Android 适配层 | 与 Web 业务漂移；localStorage + 原生双槽快照只是恢复桥 |
| Next | `next/carriers` / `next/runtime` 另写一套章节、世界书、大纲、上下文、工具实现 | 与 Web/Pinix 不共享，行为持续分叉 |

共同后果：

1. 同一业务规则要在三处修改，长期必然漂移。
2. 数据真源不统一：Web 浏览器存储、Pinix 原生快照、Next 文件目录。
3. Agent/上下文/工具各自实现，行为不一致。
4. 新功能无法做到“改一次，三端生效”。

## 3. 目标架构

```text
                 Pinax Business Core
        ┌──────────────┼──────────────┐
     Web Host      Pinix Host      Next Host
   (Vue 完整版)   (Capacitor)     (Electron 极简)
        │              │               │
   Browser/Server   Native/Remote   Filesystem
     adapters         adapters        adapters
```

### 3.1 Core 内容

- `domain/`：作品、章节、世界书、大纲、构思、资料、素材、漫画、体验、记忆/事实账本等领域模型。
- `usecases/`：创建、编辑、保存、修订、候选采用、备份、迁移、同步冲突。
- `agent/`：上下文编译、工具定义与执行、会话、候选、作者确认采用。
- `contracts/`：schema、revision、事件、错误码、序列化格式。
- `ports/`：Storage、Network、Clock、ID、Secrets、HostCapabilities 等端口接口。
- `migrations/`：旧 localStorage、旧项目、备份 ZIP、移动快照 → Core 数据。
- `tests/`：业务合同测试，供所有 Host 共用。

### 3.2 Host 内容

- Web：Vue 页面、路由、浏览器/服务端适配器。
- Pinix：Capacitor 页面、原生存储、返回键/键盘/分享、远程或本地内核适配。
- Next：三栏 UI、文件系统适配器、Electron 窗口。
- 可选共享 UI kit：设计 token、基础控件、编辑器壳；页面布局允许不同。

### 3.3 依赖规则

- Core 不 import Vue/React/DOM/Electron/Capacitor/Node fs。
- Host 不写业务规则，只调用 Core + 平台 adapter。
- 三端共享 contracts/schema/错误码。
- 旧代码迁移、备份、候选采用只在 Core。
- 官方插件生态是后续扩展层，不把写作/漫画等业务模块拆出 Core。

## 4. 数据与存储策略

### 4.1 原则

- **Core 拥有业务真源，StoragePort 决定落地方式。**
- 不新增“总数据库”；按数据类型分层：作者内容、业务元数据、派生索引。
- 文件、SQLite、localStorage、原生快照都只是 adapter，不改变业务语义。

### 4.2 存储端口

```ts
interface ProjectStore {
  listProjects(): Promise<ProjectRef[]>
  open(ref: ProjectRef): Promise<ProjectSession>
  read(path: ProjectPath): Promise<TextFile>
  write(path: ProjectPath, text: string, expectedRevision: number): Promise<WriteResult>
  listAssets(): Promise<AssetRef[]>
  readAsset(ref: AssetRef): Promise<Uint8Array>
}
```

- Web：`BrowserProjectStore`（localStorage/IndexedDB）或 `ServerProjectStore`。
- Pinix：`NativeProjectStore`（SAF/Filesystem/SQLite/OPFS）。
- Next：`FilesystemProjectStore`。
- 远程：`RemoteProjectStore`（HTTP/WS）。

### 4.3 迁移与同步

- 定义可移植项目包（zip 或目录），资产用内容哈希。
- revision/冲突语义在 Core；跨设备同步由独立 `SyncProvider` 插件实现，不进 Core。
- 旧 Pinix 双槽快照只作为迁移来源，不作为新真源。
- 旧完整工作区 ZIP 是首选迁移入口；先做 dry-run，再落盘。

### 4.4 记忆与索引

- 事实账本用 append-only 事件 + 可重建索引；不与 git 历史混用。
- RAG/搜索/SQLite 索引为派生，可删除重建，不进备份。
- 密钥不进 Core 数据、备份或日志；由 Host 的安全存储持有。

## 5. 里程碑

| 阶段 | 内容 | 交付物 | 退出条件 |
|---|---|---|---|
| M0 基线盘点 | 盘点 Web/Pinix/Next 的业务 owner、数据 owner、Agent 链、重复实现 | 对照表、Core SDK v0、选定首个纵切片 | 三端 owner/依赖/合同清单完成 |
| M1 Core 骨架 | 建立 `packages/core`、ports、contracts、测试工装 | Core 包、浏览器/Node 两个最小 adapter、合同测试 | 一个纵切片在 Web + Pinix 通过 |
| M2 写作内核 | 章节、构思、大纲、保存/修订、候选采用 | writing domain/usecases、迁移器、写作合同测试 | Web/Pinix 正文/大纲/构思读写一致 |
| M3 设定与资料 | 世界书、资料、约束、来源归档 | worldbook/reference domain、上下文块、迁移器 | 世界书/资料三端读写一致，来源不丢 |
| M4 Agent 与上下文 | 上下文编译、工具目录/执行、会话、候选、采用、HITL | agent/context/tools/sessions、Tool Catalog、写策略 | 同一候选在 Web/Pinix/Next 行为一致 |
| M5 Pinix 集成 | Pinix 改为 Core 的 Host，保留 Capacitor 平台层 | Native adapters、API origin、lifecycle、分享、快照迁移 | Web/Pinix 用同一 Core，移动验收模板通过 |
| M6 Next 集成 | Next 改为 Core 的极简 Host，删除平行实现 | Next carriers → Core usecases、filesystem adapter、视图绑定 | Next 验收通过，行为与 Web/Pinix 一致 |
| M7 数据迁移 | 旧 ZIP/旧项目/移动快照 → Core 项目 | 迁移向导、migration.json、幂等与回滚 | 真实备份 dry-run 通过，可重复导入 |
| M8 后续域与生态 | 素材/漫画/视频/体验/联机/地图/记忆、同步、插件生态 | 各域插件/适配器、SyncProvider、第三方示例 | 另行评审，不阻塞 Core v1 |

M0–M7 是 Core v1 主线；M8 拆成独立批次，不在本计划承诺全部完成。

## 6. 纵向切片（先证明“只改 Core”）

1. **章节读写**：`chapter.read/save` + revision + 原子写，Web/Pinix/Next 各一个 adapter。
2. **世界书条目**：条目读写 + 上下文块 + 来源保留。
3. **候选采用**：生成 → 审阅 → 采用 → durable ack → 恢复；三端同一实现。
4. **备份恢复**：旧完整工作区 ZIP → 新项目；dry-run、幂等、回滚。

每个切片必须先写 Core 合同测试，再接 Host，不接受“先搬 UI 再补协议”。

## 7. 验收与证据

### 7.1 业务一致

- Core 合同测试全绿；三端 Host 不再有重复业务实现。
- 同一真实项目：章节数、字数、世界书条目数、候选采用结果、备份恢复结果一致。
- 所有写路径都经过 Core；没有 Host 直接操作业务存储。

### 7.2 移动端专项

- `mobile:check`、`mobile:sync` 通过。
- APK 构建成功后，按 Pinix 验收模板验证：启动恢复、中文 IME、前后台、返回键、备份、分享、长章性能。
- 不把 Web 通过等同于真机通过。

### 7.3 数据安全

- 迁移前后源数据不变；`migration.json` 记录源哈希、计数、跳过、失败、目标哈希。
- 重复导入幂等；失败可回滚；不自动删除旧数据。
- 密钥、媒体、派生索引的边界在迁移报告中显式说明。

### 7.4 工程门禁

- 继承 Web 的 `verify:full` 预算，不降低旧基线；首个 Core 切片新增 2 文件 / 15 用例，总预算从 20/200 显式抬到 22/215。
- Core 新增独立合同测试，三端 CI 均运行。
- Next 保留其验收链；Pinix 保留移动检查链。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 大重构导致行为回归 | 纵切片、双跑对照、feature flag、保留旧路径回退 |
| localStorage 同步 API 与异步 adapter 不兼容 | 在 Core 内统一 async usecase；同步工作集作为 adapter 缓存，不当真源 |
| Node/浏览器/移动依赖差异 | Core 只用平台无关 TS；文件/SQLite/网络/worker 全部走 ports |
| 数据迁移丢失 | dry-run、源只读、migration.json、幂等、回滚、真实备份核对 |
| UI 继续漂移 | 业务只许在 Core；UI 差异单独评审，不借 UI 改动业务 |
| 性能（长章/大媒体） | 100 章/30 万字基准、二进制独立资产、索引派生、移动真机测量 |
| 许可与生态边界 | 参考 agent-foundation/DSH 只借设计，不复制代码；第三方插件另行评审 |

## 9. 需要拍板的决策

1. **Core 运行形态**：默认“平台无关 TypeScript 包，三端内嵌”；远程服务作为可选 Host adapter。
2. **数据真源**：由 Core 的业务模型 + StoragePort 决定，不强制全部改为文件目录；文件/浏览器/原生只是 adapter。
3. **插件生态时序**：Core v1 不做第三方市场；官方业务模块在 Core，第三方扩展点在 M8 后开放。
4. **UI 复用程度**：共享 UI kit 与合同，页面布局允许不同；不追求三端一套 UI。
5. **跨仓共享形态（已拍板 2026-10-31）**：`@pinax/core` 是**独立仓库 + 独立 npm 包**，目标为**私有**仓库 `github.com/Recoletas/pinax-core`（owner 沿用现有 `Recoletas`），Pinax/Pinix/Next 各自引用打包产物。不选 monorepo（三端发布/CI/授权链不同，且会把 Web 门禁压给移动/极简端），不选 git submodule（版本与内容易失同步）。0.x 阶段消费方固定版本（exact pin，不用浮动 range），正式发布走私有 registry / GitHub Packages；本地开发可用 `file:` 指向 `npm pack` tarball，CI 必须用可追溯版本。发布配置（registry/可见性）与远程创建待作者备好 `gh`/私有仓库再落，不在本机擅自建公开面或发不可撤销的包版本。依赖方向仍是 `core <- adapters <- hosts`。

## 10. 立即行动（本周）

1. 建立三端 owner/依赖/合同对照表，标出所有重复实现。
2. 选定“章节读写 + revision + 原子写”为首个纵切片。
3. 创建 `packages/core` 与 `ports/contracts/tests` 骨架，先让 Web 调用 Core。
4. 给 Pinix 做第一个 Native adapter，复用其 Capacitor/生命周期/分享/原生快照迁移。
5. 写 Core 合同测试，Web + Pinix 先通过，再接 Next。
6. 同步更新本文件与 STATUS；不把“计划”写成“已实施”。

## 11. Definition of Done（Core v1）

- Web、Pinix、Next 都通过同一 Core 完成章节/大纲/构思/世界书/资料/候选采用/备份恢复。
- 三端不再有重复业务 owner；所有业务变更只在 Core。
- Core 合同测试、Web `verify:full`、Pinix `mobile:check/sync`、Next 验收链均通过。
- 至少一个真实旧备份完成 dry-run → 导入 → 复核；迁移报告可审计。
- Pinix 至少完成一次 APK 构建与真机最小矩阵；未完成项在 STATUS 明确标注。
- 文档说明 Core 的边界、ports、数据真源、迁移路径、未完成的移动端/媒体/生态事项。

## 附：建议包结构

```text
packages/
  core/
    domain/
    usecases/
    agent/
    contracts/
    ports/
    migrations/
    tests/
  adapters-browser/
  adapters-native/
  adapters-filesystem/
  adapters-server/
  ui-web/
  ui-mobile/
  ui-minimal/
  ui-kit/
```

依赖方向：`core <- adapters <- hosts`；Host 不直接依赖其他 Host 的业务实现。
