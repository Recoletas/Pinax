# Pinax 项目标准范式 `pinax-project@1`（2026-10-06）

> 模式：**Obsidian/VS Code**——项目是磁盘任意位置的自包含文件夹（可整体拷贝迁移），应用只维护「打开过哪些项目」的注册表（存在应用侧数据目录，靠近代码安装位置）。
> 实现：`server/services/localMirrorService.js`（createProjectAt/openProjectAt/listProjects/resolveBookDir）；桌面阶段（schema v2）由 `electron/projects` 内核采纳同一范式。

## 1. 文件夹契约

```
<任意位置>/<项目名>/
  .pinax/project.json     # 标记文件（marker）：{schemaVersion:1, spec:"pinax-project@1",
                          #  projectId:"proj_*", name, kind, createdAt, updatedAt}
  <kind 模板目录…>
```
- **marker 规则**：目录含可解析的 `.pinax/project.json` 且 `spec === "pinax-project@1"` 即为 pinax 项目；`open` 校验 marker，`create` 要求目标目录为空（或不存在）。
- **kind 注册机制**：`KIND_TEMPLATES`（localMirrorService.js）注册目录模板；新增项目类型 = 加一条模板 + spec 文档登记。
- 同步语义：托管内容子目录（正文/大纲/世界书/构思/资料/日志）每次同步整体重建；**kind 模板目录永不被清扫删除**（空目录保留）。**「约束」目录是用户手写自由区**：不参与同步重建，经 `GET /api/localmirror/rules` 读回后作为 Kernel `local-rules` 块（与规则块同级）注入生成。

## 2. kind 模板

| kind | 目录 |
|---|---|
| `novel` 小说 | 正文/ 大纲/（大纲.md+outline.json） 世界书/（manifest.json+<分组>/*.md） 构思/ 资料/（sources.json+*.md） 日志/（修订史/ 体验会话/ 助手对话/ 记忆台账.json） 约束/（*.md/*.txt，作者手写约束） 媒体清单.json |
| `screenplay` 剧本 | 剧本/（<集>/<场>.md，内容映射待扩展） 人物/ 场景/ 大纲/ 世界书/ 资料/ 日志/ 约束/ 媒体清单.json |
| `generic` 通用 | 文档/ 资料/ 日志/ 约束/ |

文件命名：Windows 非法字符消毒 + 80 字符截断 + 同名去重（-2/-3）；原子写（tmp+rename）。

## 3. 应用侧数据（"代码安装位置附近"）

位置：`PINAX_APP_DATA` env > Web 模式 `<server目录>/.pinax-app/`（gitignored）> 桌面阶段 Electron `userData`。
- `projects.registry.json` — 打开过的项目：`[{projectId, bookId, name, kind, rootPath, lastOpenedAt, lastSyncAt}]`（bookId 绑定 = 浏览器作品 ↔ 项目文件夹）。
- `index.json` — 项目索引（全部项目摘要），由 `POST /api/localmirror/index` 写入。

## 4. API（Web 模式）

| 端点 | 说明 |
|---|---|
| `POST /api/localmirror/projects/create` | `{path,name,kind,bookId?}` 任意空目录建库；**公网部署 403** |
| `POST /api/localmirror/projects/open` | `{path,bookId?}` 打开已有项目（校验 marker）；**公网部署 403** |
| `GET  /api/localmirror/projects` | 注册表列表 |
| `POST /api/localmirror/sync` | 落点 = 注册表按 bookId 绑定的项目根 > 文档根 `<homedir>/Documents/Pinax`（兼容旧行为） |
| `GET  /api/localmirror/rules` | `?path=<项目根>` 或 `?bookId=<绑定书 ID>` 读回「约束」目录（*.md/*.txt ≤8，kind 按文件名判：禁用→forbidden/文风→style/备注→note/其余 rule）；**公网部署 403** |
| `GET  /api/localmirror/appdata` | 查询应用侧数据目录 |

安全闸：open/create 是任意路径能力面，`PINAX_PUBLIC_ORIGINS` 非空（公网部署）一律 403 `ERR_LOCAL_ONLY`；绝对路径校验、建库要求空目录。

## 6. 导入层（2026-10-06，全局工程化）

全局导入管线 `src/services/import/importPipeline.js`：**文件夹选择 → 递归走查 → 一书+资料分类 → 解析/归档**。

- **选择方式**：File System Access API `showDirectoryPicker`（Chrome/Edge）优先；不可用回落 `webkitdirectory` input。拖拽仍只收文件（文件夹拖拽走查未做）。
- **一书+资料语义**：根目录 `.txt/.md/.markdown` 合并为一本书（文件名=章节名，按路径排序；文件内 `#` 标题再切章，单文件多章时加「文件名 · 」前缀）；子目录全部文件 + 根目录 `.pdf/.docx/.epub` 归为资料（世界书源档案管线：`parseSourceFilesWithWorker` → `archiveSourceDocuments`，IndexedDB）。
- **上限**：200 文件 / 单文件 20MB / 书稿 100 万字符 / 走查深度 8；跳过 `.pinax`/`node_modules`/隐藏目录。
- **归档时机**：选择时只分类预览，确认导入后才写资料归档（`archiveMaterialEntries`）。
- **自动建项目**：设置「本地项目 → 默认项目新建位置」配置后，导入确认与新建空书都会自动 `<root>/<书名>` 建项目文件夹并绑定 bookId（`ensureProjectForBook`，冲突/失败静默回落文档根镜像）。
- **统一项目资料面板（2026-10-07）**：`ProjectInfoPanel`（全局单例 `useProjectInfoPanel`，非独立页面）承载新建/编辑/导入绑定三模式——字段：书名/简介/语言/世界书/kind/文件夹位置。**「全部都是本地项目」**：create/attach 的 path 可省，服务端回落 `<mirrorRoot>/<name>`（Documents\Pinax）；edit 模式经 `POST /projects/update` 同步 marker+registry（name/kind 随时可改）。书卡 hover 出「修改项目配置/删除项目」（删除=删书+摘注册表，磁盘保留）。导入确认后自动弹 attach 模式。
- **设置面**：设置弹窗「本地项目」节——默认新建位置 / 读取位置 / 注册表状态行；轻模块 `src/services/localMirrorSettings.js`（node 可加载）。
- 验证：`scripts/local-import-check.mjs`（walk/分类/payload，12 项）；真机混放文件夹全链（建书 2 章 → 建项目 → 同步落项目根）。
- 验证：`scripts/local-import-check.mjs`（walk/分类/payload，12 项）；真机混放文件夹全链（建书 2 章 → 建项目 → 同步落项目根）。

## 5. 阶段映射（原 5 节，随 6/7 节更新）

- **阶段一（本轮）**：Web 模式，路径经 API 显式给出；文件为读拷贝（浏览器真源）。导入层已接「默认位置自动建项目」。
- **阶段二（Electron 文件为真源）**：原生对话框选目录（`dialog.showOpenDialog` 先例已有）；`shared/desktopProjectContract.js` 现正则只认 `manuscript|reference` .txt，schema v2 需按本范式放开 kind/目录/扩展名（.md）；`.pinax/` 内核（SQLite 日志/锁/备份）与本范式的 marker 合并设计。
- **阶段三**：双向对账（revision+hash 内核已备）。

## 7. Agent 统一调度：能力任务面与工具化（2026-10-07，P4-A 已交付）

**终态口径：一个模型（kit provider registry）+ 一个通路（kit 任务面 agent 循环）+ 提示词管线工具化（agent 统一调度）。**

- **能力任务模式**：任务面 `taskKind=capability` + `capability.{systemPrompt, submitTool}`——系统提示=任务指令卡（含输出协议），强制提交工具（BeatPlan 模式）：agent 先用资料工具取证，调用 submit 工具即终态（回执随快照 `capabilityResult` 回传）；预算耗尽未提交 → `PINAX_ADAPTER_NO_SUBMISSION` 显式失败；提交后收敛闸只保留 submit 工具。
- **submit 契约**：`shared/capabilityToolContracts.js`（模型面 schema，宽松形状；语义校验在宿主既有归一化器）。已交付三件：`submit_review_findings`（审校 findings）、`submit_knowledge_answer`（问答 claims/calculations）、`submit_memory_claims`（记忆三元组，quote 逐字约束）。
- **代理层**：`server/services/capabilityTaskRunner.js`——advisor 任务 → capability 任务 → submit 回执序列化为 advice JSON → `createAdvisorTaskResponse` 既有解析/模板/语义修复原样工作。门控：`authoring.review.chapter` / `authoring.knowledge.query` / `memory.extraction` 三切片在任务面健康时走 agent 循环，不可达回落漏斗直连（双层 fail-open）。
- **模型面**：capability 任务与写作 agent 同源（kit provider registry /model 热切）。

### P4-B 工具化地图（剩余族，按同模板逐片）

| taskType 族 | submit_* 工具 | schema 来源 | UI 契约保留方式 |
|---|---|---|---|
| authoring.rewrite/expand/shorten/insert/complete.inline、materials.refine | submit_text_patch / submit_rewrite_candidates | writingReplacementContract + writingCandidateContract | useAuthoringRewriteWorkflow L179 / useWritingAgent L448 不变 |
| authoring.review.selection | submit_closure_options | summary/issues/action 协议（openclaw L464-474） | legacyAdapter L176 透传 |
| authoring.scene.directions | submit_scene_directions | openclaw L346-369 | planner 签名不变 |
| authoring.rehearsal.step | submit_rehearsal_step | authoringRehearsalConsequenceContract（quote/ref 授权校验留宿主） | authoringRehearsal L54 不变 |
| materials.classify/split/relate | submit_material_actions | typedActions 协议 openclaw L228-270 | useNotesMaterialAdvisor 动作表不变 |
| canvas.organize/relate/transition | submit_canvas_actions | openclaw L272-313 | ProseEssay applyCanvasAdvisorResult 不变 |
| storyboard.review / video.prompt | submit_storyboard_actions | openclaw L421-462 | StoryboardVideoPanel apply 不变 |
| authoring.next-actions / dialogue-options / experience.next-actions | submit_action_options | runtime-candidate 协议；experienceAgentResults 校验器改吃回执 | Experience.vue validator 不变 |
| authoring.emergence | submit_emergence_review | openclaw L403-419；重试协议 → 工具 repair 循环 | generationEmergence 不变 |
| authoring.context.compact | submit_memory_summary | contextCompression 协议 | normalizeSummaryText 不变 |
| settings.*（9 个） | submit_setting_draft(s) | structuredSettingContract + structuredGenerationContract | settings review-draft 管线不变 |
| observer.*.derive / memory.derive | 后置（可 submit_derived_*） | authoringObservationContract | 派生状态消费面不变 |

**注（2026-10-08 实测口径）**：本表是施工前地图，实际交付的 submit 工具名以 `shared/capabilityToolContracts.js` 为准——typedActions 族（materials/canvas/storyboard/next-actions/emergence）统一为 `submit_typed_actions`（actionTypes 白名单按任务约束）、review.selection/asset.summarize 为 `submit_default_advice`、rewrite 族为 `submit_rewrite_result`；条目键已全部 canonical（`experience.*` 前缀清零，D7 裁定）。context.compact / settings.* / observer.* 未并入工具表，仍走漏斗直连。

随 P4-B 退役：chat.js 普通生成并入 authoring.continue agent、promptRegistry 退役、17 张 openclaw 指令卡迁 kit 技能库、advisor 路由整体变薄代理。
