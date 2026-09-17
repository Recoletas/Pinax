# N-A 回执：资料导入与管理（nightly-20260917）

- Owner：Claude worker（N-A）。基线：`main@c445dd4`（含白天 ABC 组合集成），分支 `night/sources-20260917`，worktree `/home/recoletas/jiuguan/pinax-night-sources-20260917`。
- 任务书：[track-a-sources](../../plan/nightly-20260917-track-a-sources.md)；总计划 [sources-ui-memory](../../plan/nightly-20260917-sources-ui-memory.md)。
- 完成标签（互不替代）：已实施 ✓（下列代码真实存在）；分线验证 ✓（本回执命令与 exit）；组合验证 ✗（未合并，白天 Codex 复验）；真实模型 ✗（未调用，提取链沿用既有 gated 流程）。

## 1. 16 项任务表（每项唯一主状态）

| ID | 状态 | 证据/说明 |
|---|---|---|
| NA01 | completed | §2 调用图 + 两个确认函数丢书上下文代码位置（L683-705/L707-732）+ 绑定位点表 + 10 项缺口清单 |
| NA02 | completed | AC-SOURCE-v1 落为 `shared/sourceContract.js`（SourceRef/证据级校验/来源更新事件，纯函数零依赖）；AC-EXTRACT-v1 沿用既有 settings 调度任务语义（`source.parse`/`settings.foundation.generate`/结构化分区生成），映射写入 §4；混合资料 fixture（粘贴长文+损坏 DOCX+同名 JSON）经真实归档 reader 读取，版本/归属可核对（smoke J1/J2） |
| NA03 | completed | `WorldbookSourcesPanel.vue`：列表/搜索/类型筛选/按块全文预览/软移除/添加入口；1440 与 390 原图已查看（`/tmp/pinax-sources-journey/`）；空/搜索无结果/归档缺失/读取失败状态区分 |
| NA04 | completed | 面板接回 StructuredSettings 页（`?sources=1` 直达展开）；写作右栏 AuthoringWorldbookPanel 新增资料概况行（添加/查看与管理，带 bookId）；刷新与前进后退经 query 保留范围（J2/J3/J4 全程 goto 往返）；回正文由既有 SettingsReturnToManuscript 承接（联动门禁 20/20） |
| NA05 | completed | 未绑定书：确认时 `ensureBookWorldbook` 自动建 `${书名}·资料库` + `bindBookWorldbook` 写 `book.worldbookId`（J1 断言绑定落盘）；已绑定追加不新建库（J2 断言 index 不变）；JSON"新建为独立世界书/新建后更换本书关联"显式分离（J3）；持久化失败注入 → 类型化失败且不误绑（smoke 注入段） |
| NA06 | completed | 多文件批次（好 TXT + 损坏 DOCX 同批）：成功/失败分行展示；未确认草稿刷新后恢复（J4）；memory-only 降级与补持久化沿用既有实现 |
| NA07 | completed | 同名冲突三选：新建独立（默认，J3）/ 并入同名库（`worldbookImportMerge.js`：按名称+类型逐条 新增/更新/跳过，保留目标 id 与结构化引用，J3b 断言 +2 条目且不新建库）/ 取消；复用既有 ST 导入归一（comment/key 字段标准形状经真实导入链验证） |
| NA08 | completed | 选中的资料经 `appendSourcesToWorldbook` 进入绑定库 `sourceDocuments` → StructuredSettingsWorkspace 既有来源栏/分区提取（sourceDigest）→ 草稿审阅 → worldStore 采纳；提取/审阅/采纳链为既有 gated 流程（结构化 gate + 联动 20/20），本夜新增并验证的是"书作用域资料进入该链"的前端（1440 图可见来源栏同一数据） |
| NA09 | partial | 搜索（标题+预览正文）与类型筛选、按块预览（J1 断言 >3000 字含尾部关键事实）已交；**多选批量操作、预览内正文定位、重命名未做** |
| NA10 | partial | 内容 hash 去重沿用归档既有实现（同内容复用 artifact）；来源更新事件合同已定义（`buildSourceUpdatedEvent`）；**同名异内容版本链与失效传播未接** |
| NA11 | completed | 消费者清单（NA01 §消费者表）：右栏/正文匹配/叙事内核/Experience/地图/结构化字段生成均读绑定世界书；联动门禁与结构化 gate 复验通过 |
| NA12 | partial | 合同层区分（archiveRef+sourceRevision=证据级；仅预览=参考级）已定义；**"资料用途选择"UI 与禁用资料不进请求的开关未做** |
| NA13 | partial | 软移除（列表移出、归档原件保留、可重新添加）+ 说明文案已交（J5 断言归档存活）；**删除前引用影响预览（历史/素材/共享库反查）未做** |
| NA14 | partial | 大小/编码/配额沿用既有 ingestion 合同（64MB 预检、编码探测、memory-only 降级）+ 本夜持久化失败注入；**20MB PDF 本轮未重测** |
| NA15 | completed | ZIP 组合往返（J6）：导出含 `source-archive/{artifacts,chunks,workspaces}.json` + factLedger 域声明（白天集成回归点）→ 清空 IDB+localStorage → 恢复 → 资料面板/归档全部还原（3 artifacts/3 chunks/1 workspace）；失败补偿沿用 bundle 既有域补偿（backupExport gate） |
| NA16 | completed | 入口收敛：创建工作区现可从设定页未绑定空态、资料面板、写作右栏三处带 bookId 进入，同一工作面；旧 `workspaceId` 草稿恢复保留；verify:full exit 0 |

## 2. NA01 盘点结果（已完成交付）

### 导入流程调用图

1. **多文件**：`WorldBookQuickImport.vue openAdvanced('import')` → `settings-worldbook/create` → `WorldbookCreationWorkspace.parseFiles()` → `settingsDispatcher('source.parse')` → `worldbookSourceParser`（Worker）→ `worldbookSourceAdapters` → `saveSourceArchiveBundle` → IDB `pinax-source-archive`（artifacts/chunks/workspaces）。
2. **粘贴**：`addPastedSource()` → 同上（配额满降级 memory-only，确认前补持久化）。
3. **JSON**：`onJsonChange` → `buildWorldbookImportPreview` → `confirmJsonImport` → `worldStore.importFromSillyTavern`。
4. **基调 AI**：`generateFoundation` → `selectSourceChunks` → `settings.foundation.generate` → `confirmFoundation` → `createWorldbookFromPayload`。
5. **高级编辑器 JSON**：`WorldBookEditor.confirmImportFromPreview` → 同 3。
6. **懒迁移**：`loadWorldbook` → `migrateLegacyWorldbookSources`。

### 两个确认函数丢书上下文的位置（修复前）

`WorldbookCreationWorkspace.vue` `confirmJsonImport()`/`confirmFoundation()`：只 `setActiveWorldbook(created.id)` + `router.push({name:'settings-structured'})`（无 bookId）；`book.worldbookId` 全程未写；页面无 bookId 概念。**本夜修复**：两函数 + 新增 `confirmAppendSources` 均按 `?bookId` 上下文执行"未绑定建库绑定 / 已绑定追加 / 显式更换"，返回 query 携带 bookId。

### 绑定位点表与缺口清单

见 git 历史版本回执（`831bbcb` 前稿）与 NA01 报告；核心缺口 10 项中本夜修复 1/2/3（部分）/6/10，其余进入 §1 partial 项。

## 3. 真实验证命令与 exit

| 命令 | 结果 |
|---|---|
| `BASE=…:5179 node scripts/sources-journey-smoke.mjs`（隔离 profile） | **exit 0**：J1 未绑定导入+自动建库绑定+面板计数/分块全文预览（>3000 字含尾部关键事实）；J2 已绑定追加（index 不变）+ 好/坏文件分批；NA05 持久化失败注入（不误绑）；J3 同名冲突独立新建；J4 刷新恢复；J5 软移除后归档存活；J3b 并入同名库（+2 条目、无新库）；J6 ZIP 往返（3 artifacts/3 chunks/1 workspace + factLedger 域）；390 无横向溢出 |
| `BASE=…:5179 node scripts/authoring-ui/settings-linkage-check.mjs` | **pass 20/20**（回归） |
| `npm run verify:full` | **exit 0**（20/20 文件、200/200 用例、lint delta、双 build、架构预算、diff、VitePress） |
| 截图 | `/tmp/pinax-sources-journey/sources-panel-{1440,390}.png` 已查看 |

## 4. 合同交接（AC-SOURCE-v1 / AC-EXTRACT-v1）

- **AC-SOURCE-v1**：`shared/sourceContract.js`（N-A 提供）。证据级 SourceRef 必须具备 `archiveRef + sourceRevision + contentHash + scope`；仅预览为参考级；`buildSourceUpdatedEvent` 供 N-C 失效证据。
- **AC-EXTRACT-v1**：以既有 settings 调度任务为合同本体——`source.parse`（文件→chunks，含 failures/needs-ocr）、`settings.foundation.generate`、结构化分区生成（输入含 sourceDigest，输出进唯一草稿审阅）。N-C 的记忆提取任务复用同一 job/状态/取消语义，目标字段区分 `setting|memory`。
- 无 C worker 在场：合同以文件+本文档登记，白天组合时由 N-C 消费并复验。

## 5. 未完队列（下一批首任务）

1. NA13 删除前引用影响预览（反查历史证据/素材/共享库）。
2. NA09 重命名/多选/预览正文定位；NA12 资料用途选择与禁用开关。
3. NA10 版本链与失效传播接 N-C 证据校验（AC-SOURCE-v1 事件已定义）。
4. NA14 20MB 文本型 PDF 与实体设备性能本轮未重测。
5. 真实模型提取质量样本（未授权渠道，未运行）。

## 6. 边界声明

- 未调用真实模型/付费渠道；未操作用户真实书稿、5173 服务与浏览器数据；未动 C2/server-version/package.json；STATUS/PLAN/LOG 未改（白天 Codex 统一）。
- 写集：`shared/sourceContract.js`、`src/services/worldbook/worldbookProjectSources.js`、`WorldbookSourcesPanel.vue`、`WorldbookCreationWorkspace.vue`、`StructuredSettings.vue`、`AuthoringWorldbookPanel.vue`（+Authoring.vue 1 行 prop）、`scripts/sources-journey-smoke.mjs`、本回执。zip/reader 未再改（白天已集成）。
