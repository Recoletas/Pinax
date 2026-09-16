# Pinax Web Alpha 夜间硬任务书：试演工具闭环、作者可见回执、完整工作区备份

版本：2026-09-15。预计执行窗口：约 8 小时。执行者拿到本文后直接实现，不再另写调研或产品方案。

## 0. 本夜唯一目标

在当前 `main` 上完成三个可运行、可验收的产品纵切和一轮大文件架构迁移：

1. 普通试演可以在冻结授权范围内调用一次现有 `history_lookup`，并把真实 tool-call / tool-result 留在运行回执中。
2. 作者在右栏只看到可读的“查了什么、依据什么、结果是否仍有效”，不看到原始协议和 JSON；试稿采用后可把一项后果送入现有记忆候选审核链。
3. “完整工作区备份”从只含 localStorage 的 JSON 升级为同时包含来源归档和媒体二进制的 ZIP，并能预览、恢复和失败回滚；旧 JSON 备份继续可用。
4. 完成一组不依赖产品判断的代码硬指标：140 条 ESLint warning 清零、Authoring 历史/恢复整块迁出、首屏不使用的重面板异步分包。

产品纵切与架构迁移都以实际生产代码为交付，不把调研、接口草图、测试数量、截图数量或文档篇幅算作主要成果。

## 1. 已确认基线：不要重复实现

计划编制时 `main` 为 `e69a8a8`，工作树干净。正式执行前 O 必须重新记录实际 SHA；若已前进，以新 SHA 为准，不回退。

以下能力已经存在，本夜禁止另造：

- 试演行动者、对象、在场人物白名单和歧义拦截。
- 知情、承诺、物品、位置四类模拟后果。
- 后果引文校验、每步原子提交、路线隔离、分支比较和转试稿冻结。
- `history_lookup` 工具、`narrativeToolRegistry`、统一 generation tool contract 和 transcript 合同。
- Ghost 可编辑、采用前 revision 复核、采用/撤销事务。
- `memoryCandidates` 的 pending → 确认/拒绝 owner。
- localStorage v1/v2 备份、恢复预览、风险确认和失败回滚。
- 世界书来源归档 IndexedDB 与媒体二进制 IndexedDB。

当前两个确定缺口：

- `src/services/agents/authoring/authoringRehearsal.js` 明确发送 `toolChoice: 'none'`，试演没有真实资料工具循环。
- `src/utils/backupExport.js` 明确写出 `includesIndexedDb: false`，所谓工作区备份不包含来源归档和媒体原件。

## 2. 强制执行规则

### 2.0 并发容量与真实工作量

本文现在是约 40～52 个有效工程小时的任务池，目标是用六个 implementation worker + 一个 O 并发覆盖约 8 小时墙钟，不是声称单个 Agent 八小时可以全部做完。

| 执行域 | 预计有效工程量 | 主交付 |
|---|---:|---|
| A | 5～7h | rehearsal 单工具 runtime、授权、stale、draft/memory proposal |
| B + R-A | 9～12h | 工具/记忆 UI、历史恢复、插画、knowledge reader、协作 controller |
| C | 7～9h | v3 ZIP、两类 IDB、预览、回滚、压力样本 |
| R-N | 5～7h | Notes 两个完整 owner |
| R-P | 5～7h | Prose 两个完整 owner |
| R-X | 7～9h | Experience 四会话 + gameStore 四领域 owner |
| R-S/H/O | 4～6h | 路径归域、lint、预算脚本、组合与修复 |

B 与 R-A 不是一个人串行硬扛：B 在 A2 DTO 冻结后完成 B1～B5；T+3:00 从 B 的已接线基线派生 R-A worker 做 H1/R-A1～R-A3。O 在组合时只接受一个 Authoring 最终分支。

若执行环境最多只有三个 implementation worker，必须按波次运行且把未做项标 partial，不能缩短包或降低指标：第一波 A/C/R-X，第二波 B+R-A/R-N/R-P，第三波 R-S/H/O。三 worker 配置下本文不是 8 小时内全部完成的承诺。

### 2.1 时间与工作量

- 调研上限 25 分钟；只允许沿本文列出的 import 和现有合同定位接缝。
- 三线 T+0 同时开始，T+6:15 前不得因“主任务看起来完成”结束；必须进入本文指定的续作包。
- H0～H3 是必做主任务，不是“有空再做”。A/B/C 任一主线提前完成后立即领取对应 H 包；若三线均未提前完成，O 在 T+4:30 强制拆分 H0 warning 清理，B 在 B5 后继续 H1/H2。
- T+6:30 冻结共享接口，T+6:30～T+8:00 只做组合、真实浏览器复验、修复和交接。
- 禁止重复跑同一套测试填时间；每次验证必须对应新实现或具体修复。

### 2.2 Git 与提交

- 第一波从同一基线建立六个独立 worktree：`night/web-alpha-a`、`night/web-alpha-b`、`night/web-alpha-c`、`night/refactor-notes`、`night/refactor-prose`、`night/refactor-experience`。Authoring 深拆从 B 的完成态继续，不从 base 再开冲突分支；services 归域在 A/C 冻结后从组合基线执行。
- worker 可以各交一个完成态 handoff commit；不得提交 WIP、调研、基线截图或“等待集成”检查点。
- O 最终按 A → B → C 组合并修复冲突，主线最多保留两个提交：
  1. `feat(src): close web alpha authoring and backup flows`
  2. `refactor(src): split page owners and group domain services`
- README/STATUS/LOG/回执并入对应完成提交，不单独产生文档提交。
- 组合验证完成后只 push 一次；不在每条线结束时推送 `main`。

### 2.3 禁止范围

- 不新增通用 Agent 框架、多角色 Agent、第二套 transcript、第二个历史数据库或第二个记忆 store。
- 不把试演模拟后果自动写入世界书、地图、角色卡或正式历史。
- 不重做 Authoring 整体布局，不以拆行数为目标重构 `Authoring.vue`。
- 不碰 C2 协作、Experience、漫画、地图、移动仓库、账号、同步、部署与订阅。
- 不增加空配置页、debug 控制台、原始 tool-call 展示或隐藏推理。
- 不更改现有许可证。

## 3. 写锁与交付物

| 线 | 独占写入 | 可新增 | 禁止触碰 |
|---|---|---|---|
| A：试演工具与记忆接缝 | `shared/*Rehearsal*`、`src/services/agents/authoring/authoringRehearsal*`、`src/services/agents/narrativeToolRegistry.js` 的局部注册、对应 server task 分支、现有试演合同矩阵 | `src/services/agents/authoring/authoringRehearsalToolRun.js` | Vue 页面、CSS、备份模块、公共状态文档 |
| B：作者可见 UI | `AuthoringRehearsalPanel.vue`、`useAuthoringRehearsal*.js`、`useAuthoringRehearsalWorkflow.js`、`Authoring.block-native.css`、`Authoring.vue` 的最小接线、试演浏览器 Gate | 最多一个 `components/authoring/AuthoringRehearsalEvidence.vue` | shared/server/tool registry、备份模块、世界书和 memory owner 内核 |
| C：完整工作区备份 | `src/utils/backupExport.js`、`worldbookSourceArchive.js` 与 `mediaAssetStore.js` 的导入导出 adapter、`SettingsPopup.vue` 的备份区、备份测试/Gate | `src/services/storage/workspaceBackupBundle.js`、`scripts/authoring-ui/workspace-backup-check.mjs` | Authoring 试演、AI 合同、其他设置分区 |
| H：硬指标第二波 | 领取时由 O 按 H0～H3 分配；一次只锁表中指定文件组 | `AuthoringHistoryPanel.vue`、`useAuthoringHistoryWorkflow.js` | 不得与尚未释放的 A/B/C 文件重叠 |
| R-N：Notes 架构 | `Notes.vue`、现有 Notes composables、`services/notes/` | `NotesEditorWorkspace.vue`、`useNotesIllustrationWorkspace.js` | Authoring、Prose、Experience/gameStore |
| R-P：Prose 架构 | `ProseEssay.vue`、现有 canvas composables/services | `useProseCanvasInteraction.js`、`useProseDirectorExport.js` | Authoring、Notes、Experience/gameStore |
| R-X：Experience 架构 | `Experience.vue`、`gameStore.js`、`services/experience/` | 本文 R-X 指定的四个 composable/三个 coordinator | Authoring、Notes、Prose、备份 |
| R-S：services 归域 | A/C 冻结后的 `src/services` 路径和全仓 import-only 修改 | `services/memory/` 等目标目录 | 不允许混入行为修改 |
| O：集成 | `.github/`、`package*.json`（仅三线确有需要）、`docs/`、跨线接缝和最终冲突 | `docs/agent-runs/nightly-web-alpha-20260915/` | 不在冻结后扩产品范围 |

A/B 唯一共享 DTO 由 A 在 A2 完成后冻结；B 只能消费，不可自行补另一种字段。B 若需要 `Authoring.vue` 接线，A 不得同时修改该文件。

## 4. A 线：把现有 history_lookup 接入普通试演

### A0｜确认真实调用链，限时 20 分钟

执行：

1. 从 `requestRehearsalStep()` 跟到 `/advisor/task`、provider 和结果解析。
2. 从 `history_lookup` 注册表跟到 `executeHistoryLookup()` 和 narrative resource index。
3. 记录可直接复用的 transcript、tool schema、authorization 和 executor；不得提出新框架。
4. 用当前 fixture 证明 `toolChoice: none` 时请求中没有工具。

输出：`a/baseline.md`，最多 80 行，列实际文件、调用顺序和一个失败证据。超过 20 分钟仍未定位，报告 blocker，由 O 决定是否停 A；不得用剩余时间继续写调研。

### A1｜建立试演专用的单工具运行器

新增 `authoringRehearsalToolRun.js`，只组合现有能力：

- 输入：冻结 run session、当前路线步骤、结构化行动、settings snapshot、AbortSignal。
- 工具目录只含 `history_lookup`；从当前 manifest 生成 allowlist，不能使用 active store 或模型自报 ID 扩权。
- 每步最多一次成功 lookup；总模型步骤最多 3：初始请求、一次 tool result 后续请求、必要时一次既有格式修复。
- `get/search/trace` 只允许 manifest 已授权的 history IDs 和 scope；越界返回 typed denied result，不改成全库搜索。
- 工具超时、取消、非法参数、空结果均形成有界 tool result；不能因工具失败丢掉作者已输入的行动。
- provider 不支持工具协议时明确返回 `tool-unavailable`，允许按原冻结 envelope 完成普通回应，但不得伪造“已查询”。

禁止复制 `narrativeAgentOrchestrator`。优先抽取或注入它已有的 transcript append、协议映射、toolCallId 校验和超时 helper；若必须改公共 helper，只做无行为变化导出并由 O 复核。

### A2｜冻结 A/B DTO

一次试演 step 在现有字段之外只增加：

```js
toolReceipt: {
  status: 'not-requested' | 'completed' | 'unavailable' | 'denied' | 'failed',
  calls: [{
    toolCallId,
    toolName: 'history_lookup',
    action: 'get' | 'search' | 'trace',
    sourceRefs,
    resultRefs,
    resultCount,
    truncated
  }],
  manifestFingerprint,
  projectRevision
}
```

约束：

- 不保存原始 prompt、完整工具输出、密钥或隐藏推理。
- `sourceRefs/resultRefs` 必须经过 frozen authorization；显示名称留给 B 从已有 source catalog 解析。
- 没有工具调用必须是 `not-requested`，不能写空的 `completed`。
- toolCallId、toolName 与 transcript 必须一一对应；重复、缺 result 或晚到 result 整步失败。
- DTO 进入现有 step 冻结、route fork、rewind、restore 和 draft source；不得另建 tool log store。

A2 完成后立即给 B 一份合法 fixture、denied fixture 和 unsupported fixture。

### A3｜替换 `toolChoice: none` 的生产路径

- `requestRehearsalStep()` 改为调用 A1 运行器。
- 仅当冻结 manifest 存在授权历史候选时向模型声明 `history_lookup`；没有历史资料时不发送空工具目录。
- 模型不调用工具时直接返回现有 rehearsal JSON；不得强迫每一步先查资料。
- 工具返回后最终结果仍走现有 `parseRehearsalResponse()` 和 consequence 校验。
- 工具查询内容计入现有输入/输出预算；不得把完整历史结果再复制一遍进 question。
- 第二步只继承当前路线已经冻结的 tool receipt/result refs；不能读取另一条路线。

### A4｜取消、迟到与 revision 围栏

固定处理以下状态：

1. 工具调用前取消：零工具执行、零 step。
2. 工具执行中取消：executor 停止，晚到结果不追加 transcript。
3. 工具返回后书/章/世界书 revision 变化：provider 最终结果不得进入路线。
4. provider 返回后 revision 变化：沿现有 rehearsal stale 流程拒绝。
5. 切换路线后旧路线请求晚到：只允许按 request generation 丢弃，不写当前路线。
6. denied/unavailable：保留可重试行动，不清 actor/target/draft。

不得新增页面 watcher；全部围栏位于运行器和现有 rehearsal session owner。

### A5｜试稿来源携带实际查阅摘要

- `buildRehearsalDraftSource()` 纳入选定路线各 step 的 `resultRefs` 与 receipt fingerprint。
- 只传选定路线；共同前缀只出现一次。
- 转试稿期间切路、继续一步或修改资料，按现有 source fingerprint 判 stale。
- Ghost 采用回执只记录工具摘要和 source refs，不写完整工具返回。

### A6｜采用后“记住这项变化”的领域接缝

A 只提供纯函数 `buildAdoptedRehearsalMemoryProposal()`：

- 输入必须包含成功的 Ghost adoption receipt、作者最终采用文本定位、选中的 rehearsal consequence。
- 来源改为正式正文 `book/chapter/writingUnit/revision/range`，不能继续引用模拟 step quote 作为长期证据。
- 若作者在 Ghost 中删掉支撑该后果的句子，返回 `unsupported-by-adopted-text`，不创建候选。
- 输出适配现有 `queueMemoryCandidate()` 所需 shape，状态始终为 pending。
- 同一 adoption receipt + consequence fingerprint 幂等。

A 不调用 memory store；实际按钮和队列调用归 B。

### A7｜合同与真实链路验证

并入现有测试预算，不新建大测试套件。必须覆盖：

- no-history 不声明工具。
- 授权 `search` 成功，call/result ID 对齐。
- 请求未授权 ID 被拒绝且零越权内容。
- 重复 tool call、第二次 call、缺 result、超长 result。
- cancel、stale、切路晚到。
- A/B 两路只继承各自 result refs。
- draft source 不串路。
- adopted text 有/无支持语句时 memory proposal 的正反例。

运行：

```bash
node scripts/authoring-rehearsal-consequence-matrix.mjs
npm run smoke:narrative-stream
npm run smoke:narrative-recovery
```

若存在已授权 MiniMax 配置且 O 明确允许本夜用量，再跑 3 场、每场 1 个需要查历史的问题；否则只标 `真实 provider 未运行`，不得读取或回显密钥。

### A8｜提前完成后的强制续作

只有 A0～A7 全部完成且距冻结超过 45 分钟才进入：

1. 让 `history_lookup trace` 的因果链结果也走相同授权与摘要，不增加第二种 receipt。
2. 为工具结果超预算补确定性裁剪：保留 ref、标题和最相关 excerpt，记录 `truncated: true`。
3. 删除 rehearsal 生产路径中已被新运行器完全替代的旧 dead helper/import；用生产 import 搜索证明零消费者。

不进入第二种工具，不做 world/politics lookup。

## 5. B 线：把工具与记忆动作接到现有右栏

### B0｜固定生产基线，限时 20 分钟

使用已有 rehearsal Gate fixture，截取 1440、1024、720×450、390 四档的：

- 两步普通路线。
- 展开局面变化。
- 路线对照。
- 试稿已生成。

只记录遮挡、溢出、重复信息、按钮不可达和工具回执无入口五类事实。不得另做视觉提案或重画整页。

### B1｜新增可复用的“本次查阅”行

在 `AuthoringRehearsalPanel` 的每一步回应下加入一行：

- `completed`：显示“查阅 2 项 · 查看”。
- `not-requested`：不显示任何占位。
- `unavailable`：显示“本次未能查阅资料”，附现有重试入口，不新增按钮组。
- `denied`：显示“请求的资料不在本次参考范围”，提供“查看本次参考”现有入口。
- `failed`：显示“资料查询失败，回应未采用查询结果”。

展开后只列作者可读的来源标题、类型和一句结果摘要；不显示 ref、fingerprint、toolCallId、JSON、provider 名或内部错误码。

若拆组件，只允许新增 `AuthoringRehearsalEvidence.vue`，props 直接消费 A2 DTO，不建立本地副本或 store。

### B2｜消除“回应、局面变化、工具依据”的重复

明确固定结构，不再临场设计：

```text
人物回应（默认展开）
局面变化（有内容才出现，默认收起）
本次查阅（真实调用才出现，一行摘要，按需展开）
继续行动输入
```

- 删除重复的“已读取上下文”“来自当前作品”“依据本次参考”等静态说明。
- `consequenceLines()` 相同文本只出现一次。
- 对照区只比较不同后果；工具来源相同只显示“共同参考”，不同才分列。
- 四步上限状态不再保留禁用输入框。
- 不改现有蓝白 tokens、不加渐变、发光、游戏数值或大卡片。

### B3｜将 A6 接入采用后的现有记忆审核链

在 Ghost 成功采用且存在合法 consequence 时显示单一后续动作：`记住一项变化`。

点击后：

1. 展示当前路线最多两项后果，单选。
2. 允许作者编辑将要记住的文字。
3. 调 A6 构造 proposal。
4. 调现有 `queueMemoryCandidate()`，状态保持 pending。
5. 打开已有记忆候选审核位置；作者确认后才 active。

必须处理：

- Ghost 未采用、保存失败或已撤销：按钮不可用。
- adopted text 不再支持后果：解释“采用稿中找不到依据”，不排队。
- 重复点击：已有候选聚焦，不重复创建。
- 切书/切章：关闭当前提议，不串目标。
- 候选写盘失败：保留编辑文字并允许重试。
- 作者拒绝：不影响正文、试演路线和其他后果。

不得增加新的“正式历史”标签页；复用现有记忆候选 UI。

### B4｜焦点与滚动

- 展开本次查阅不抢正文焦点，不自动滚到最新一步。
- 新工具结果到达时，作者若在回读，只复用现有“有新回应”入口。
- `记住一项变化` 完成或取消后回到原 Ghost/正文位置。
- 720×450 和 390 下所有新按钮 ≥44px；右栏顺序展开不覆盖稿面。
- Esc 只关闭当前最上层的来源详情/记忆提议，不清试演。

### B5｜生产浏览器 Gate

扩展现有 `rehearsal-panel-check.mjs`，不是另写 Mock 页面。必须真实点击：

1. 无工具调用时没有空标题。
2. 一次工具调用后出现可读摘要，DOM 中不存在 toolCallId/fingerprint/原始 ref。
3. denied/unavailable 两种文案和回程动作。
4. A/B 路工具回执不串。
5. 对照展开时共同/不同参考正确。
6. 生成 Ghost → 采用 → 记住变化 → pending 候选 → 确认。
7. adopted text 删除依据后拒绝排队。
8. 保存失败、重复点击、撤销和切章。
9. 1440/1024/720×450/390 无遮挡、横向溢出或不可达按钮。

只保存四张代表图：1440 两步、1440 对照、720×450 采用后、390 来源展开。截图不是完成条件，断言和实际交互才是。

### B6｜提前完成后的强制续作

按顺序执行，不另选题：

1. 删除 `AuthoringRehearsalPanel.vue` 中 A2 新 DTO 接入后失效的旧文案/helper/style。
2. 把来源标题解析复用现有 context/source catalog，删除页面里的字符串猜测。
3. 走一次“设定页修改人物 → 回正文 → 旧试演 stale → 重开 → 查询新历史”的生产旅程并修实际断点。
4. 复跑批注/改写/推演三工具切换，确认工具身份和焦点不串。

## 6. C 线：完整工作区 ZIP 备份与恢复

### C0｜列出现有存储实体，限时 25 分钟

只核对以下事实并形成表：

- `buildBackup()` 当前 localStorage keys 和 secret 排除策略。
- `pinax-source-archive` 的 stores、keyPath、schema version 和可枚举记录。
- `pinax-media/assets` 的 metadata 与 Blob/Data URL 存储形态。
- SettingsPopup 当前导出、预览、确认恢复、清空入口。

输出最多 100 行。不得重新设计数据库或讨论云同步。

### C1｜定义并实现 workspace bundle v3

使用仓库已有 JSZip，文件结构固定为：

```text
pinax-workspace-backup-<timestamp>.zip
├── manifest.json
├── local-storage.json
├── source-archive/artifacts.json
├── source-archive/chunks.json
├── source-archive/workspaces.json
├── media/metadata.json
└── media/binaries/<asset-id>.<ext>
```

`manifest.json` 必须包含：format/version、createdAt、app、每域 recordCount/bytes、文件 SHA-256、excludedSecrets、缺失域和错误域。不得包含 API Key、provider secret、绝对路径或私人诊断日志。

保留原 `buildBackup()/exportAllBackup()` 作为“轻量 JSON 备份”和旧文件兼容，不把同步 API 偷改成 Promise。新增 async `buildWorkspaceBackupBundle()/exportWorkspaceBackupBundle()`。

### C2｜为两个 IndexedDB owner 增加可控导出

在各自 owner 内增加 adapter，不从 SettingsPopup 直接开数据库：

- source archive：枚举 artifact/chunk/workspace，保留 ID、schema、hash 和关联；不重复嵌入源文件二进制，因为当前 owner 本来只保存抽取文字。
- media store：枚举 metadata，逐个读取二进制；外部临时 URL 只记录 metadata，不假装已经备份原件。
- 记录缺失 binary，但不中断其他域导出；manifest 标 `missingBinaryIds`。
- 导出期间 AbortSignal 可取消；取消后不下载半包。
- 单域读取失败返回 typed error，UI 允许退回轻量 JSON 备份。

### C3｜恢复预览与格式校验

新增 async `inspectWorkspaceBackup(file)`，在任何写入前完成：

- ZIP 路径白名单，拒绝 `../`、绝对路径、重复 manifest 和未知可执行文件。
- manifest/version/app 校验。
- 每个声明文件重新计算 SHA-256；不一致整包拒绝。
- localStorage key policy 校验，secret key 默认拒绝导入。
- source/media schema version 校验。
- 显示新增、覆盖、相同、缺失 binary、无法恢复五类计数。
- 旧 JSON 文件继续进入现有 `createRestorePlan()`。

损坏 ZIP、截断 JSON、未知版本、伪造 app、hash 不一致和超出现有域容量限制均不得写任何数据。

### C4｜跨存储恢复与回滚

新增 `restoreWorkspaceBackupBundle()`：

1. 先完成 C3，生成不可变 plan。
2. 捕获所有将被覆盖的 localStorage/IndexedDB 旧记录。
3. 以各域 owner 写入 source/media。
4. 最后调用现有 localStorage restore owner。
5. 任一步失败，按相反顺序恢复本次覆盖/新增记录。
6. 返回每域 `{ ok, written, skipped, rolledBack, rollbackFailed, reason }`。

不得声称浏览器跨 localStorage/IndexedDB 有真正 ACID 事务；但实现必须做到本次可识别写入的补偿回滚。若 rollbackFailed，UI 必须列出受影响域并要求保留当前页面，不能显示成功或自动刷新。

幂等：同一包恢复两次，第二次全部进入 skip，不复制 source/media ID。

### C5｜SettingsPopup 接入

备份区固定为三项：

1. `导出完整工作区（ZIP）`：正文、设定、来源归档、已落盘媒体；显示预计大小与缺失媒体数。
2. `导出轻量备份（JSON）`：不含来源归档和媒体原件。
3. `恢复备份`：接受 ZIP 和旧 JSON，先预览再确认。

文案必须明确：

- 模型密钥始终不进入默认备份。
- 临时外链、尚未落盘媒体和浏览器缓存不保证包含。
- 恢复会覆盖哪些域。

导出中可取消；失败保留页面和已有数据。恢复成功后只在持久化全部确认后刷新应用。

### C6｜确定性测试和生产浏览器 Gate

并入 `backupExport.test.js` 的现有预算，覆盖：

- v2 JSON 继续导出/预览/恢复。
- v3 manifest、hash、secret 排除、source/media round trip。
- Blob、Data URL、空数据库、缺 binary。
- 损坏 ZIP、hash 篡改、未知 store/version、路径穿越。
- localStorage quota、source write fail、media write fail、rollback fail。
- 重复恢复幂等。

新增 `workspace-backup-check.mjs`，真实浏览器执行：

```text
播种一本两章书
→ 人物/地点/世界书条目
→ 一份来源 artifact + chunks
→ 一张真实小体积 PNG Blob
→ 导出 ZIP
→ 记录原 ID/revision/hash
→ 清空 Pinax 数据
→ 导入 ZIP 并预览
→ 确认恢复
→ 刷新
→ 核对正文、设定、来源、媒体与引用
→ 再恢复一次验证幂等
```

再注入一次 IndexedDB 写失败，证明旧数据未被半覆盖。

### C7｜提前完成后的强制续作

1. 增加 `scripts/ci/workspace-backup-smoke.mjs`，无 Key、合成小数据，CI 最长 5 分钟。
2. 为旧 v1/v2 JSON 在恢复成功后提供“一键另存为 v3 ZIP”，不自动执行。
3. 清理 `PINAX_BACKUP_KEYS` 中已退役且无生产写入的 key；每项必须给出 `rg` 证据，仍有兼容读取则保留。
4. 更新用户手册的备份章节，删掉“完整备份”对仅 localStorage JSON 的误称。

### C8｜固定体量的备份压力样本（必做，不属于测试扩写）

用脚本生成并真实写入：64 MB 来源归档上限附近的数据、20 MB 媒体 Blob、100 章书稿和 20 个世界书条目，然后执行一次导出、清空、恢复、刷新核对。

必须记录：ZIP 大小、导出耗时、检查耗时、恢复耗时、失败阶段和浏览器版本。没有预设性能数字，但进程崩溃、主线程永久无响应、生成空 ZIP 或恢复后 hash 不一致均为失败。该样本只保留生成脚本和低敏统计，不提交 80 MB 产物。

## 7. H 线：必须完成的量化代码任务

H 不是第四条同时开工的产品线，而是 A/B/C 完成主包后立即领取的第二波。它解决“功能接缝碰巧简单导致一小时结束”的问题。

### H0｜63 文件、140 条 ESLint warning 全部清零

计划编制基线：

```text
eslint src --ext .js,.vue
0 errors / 140 warnings / 63 files
```

按文件域拆给三线：

- A 完成 A7 后：`src/services/**`、`src/stores/**` 中不属于 C 存储 owner 的 warning。
- B 完成 B5 后：`src/components/**`、`src/pages/**`、`src/composables/**` 中不属于 C 设置/备份文件的 warning。
- C 完成 C6 后：`src/utils/**`、备份/存储 owner 和相关测试 warning。
- O 负责最终余项、冲突和精确计数。

硬性规则：

- 最终必须为 `0 errors / 0 warnings`，不是“无新增 warning”。
- 不修改 ESLint 配置、warning 等级、ignore pattern 或 `lint:delta` 基线。
- 不增加 `eslint-disable`、`/* istanbul ignore */`、无意义 `void variable`。
- 接口要求保留但当前不用的参数可以改为项目规则允许的 `_name`；其余未使用 import、变量、分支和 console 应真实删除或接通。
- 删除变量前检查其初始化是否有副作用；不得为了清 warning 改公开返回 shape。
- 每清一域只跑一次 ESLint，不循环跑 full test。

验收命令：

```bash
./node_modules/.bin/eslint src --ext .js,.vue --max-warnings 0
```

### H1｜Authoring 历史/恢复整块迁出，不做百行小拆

当前基线：`src/pages/Authoring.vue` 12,193 行。以下内容仍由页面直接持有：

- 约 1200～1285 行的版本/恢复模板。
- `writingSnapshots`、`writingRecoveryDraft`、`snapshotLabel/status/preferences` 状态。
- writing snapshot、block history、recovery repository 的直接 imports。
- 创建、删除、恢复、保护快照、自动里程碑和恢复稿动作。

必须一次完成两个 owner：

1. 新建 `AuthoringHistoryPanel.vue`，迁入整个可见面板、列表、偏好设置、恢复稿和操作事件；不是再包一层 `<slot>`。
2. 新建 `useAuthoringHistoryWorkflow.js`，迁入历史加载、快照创建/删除/恢复计划、block history 恢复、偏好保存和状态文案；页面只注入当前 book/chapter/document、editor transaction、持久化/通知 adapter。

与 `useAuthoringPersistence` 的边界固定：Persistence 继续拥有 autosave、pagehide、恢复副本定时写入；History workflow 只读取/展示/采用恢复副本，不创建第二个 timer 或 unload listener。

量化完成条件：

- `Authoring.vue` 净减少至少 350 行，并减少至少 8 个 snapshot/history/recovery 直接 imports。
- 新 component + composable 承担的生产逻辑不少于移除逻辑；禁止把原代码原样塞进一个 1000 行组件后谎称架构改善。
- 页面不再直接调用 `saveWritingSnapshot/deleteWritingSnapshot/listWritingSnapshots/listWritingRecoveryDrafts`；确需保留的保护快照必须通过 workflow 方法。
- 新 workflow 不访问 DOM，不 import `Authoring.vue`，不自己读 route 或 active worldbook。
- 原恢复保护点、autosave flush、单次撤销/重做和保存失败语义保持不变。

必走旅程：手动快照、自动里程碑、block history、未保存恢复稿、删除快照、恢复前保护点、恢复写盘失败、切章后列表刷新。

### H2｜Authoring 重面板异步分包

当前生产 build 基线：

```text
Authoring JS chunk: 1,651,646 bytes
Authoring CSS chunk: 352,147 bytes
```

将以下默认不可见面板从静态 component import 改为 `defineAsyncComponent`：

- `AuthoringSceneLaboratory.vue`
- `AuthoringRehearsalPanel.vue`
- `AuthoringReviewPanel.vue`
- `AuthoringSearchPanel.vue`
- 因果/干预详情中仍被静态纳入、且首屏不渲染的最大两个面板（按 build metafile 实际确认名称）

要求：

- 只延迟 UI component；composable/owner 不因分包复制或改变生命周期。
- 首次打开显示现有轻量 loading/空白保留位，不新增全屏 spinner。
- 加载失败显示可重试错误，关闭后焦点回到触发按钮。
- 快速开关、切章和组件晚到不能重新打开已关闭面板。
- 不改 `chunkSizeWarningLimit`，不通过改文件名或手工合并 vendor 伪造下降。

量化完成条件：

- `Authoring-*.js` ≤ 1,450,000 bytes，较当前至少下降 200,000 bytes。
- 上述面板至少形成 4 个独立 lazy chunks。
- 初始 `/authoring` 在未打开工具时不请求这些 chunk；打开对应工具后只请求一次。
- 1440/390 下搜索、校对、试演和场景实验室首次打开均可用，关闭焦点正确。

若前六个面板仍不足以达到 1,450,000 bytes，继续异步化 `AuthoringKnowledgeAssistant` 和 `AuthoringDualPane` 的非首屏详情组件；不得降低目标。

### H3｜构建产物和事实文档对齐

- 新增一个不依赖第三方分析器的 build-size 脚本，读取 `dist/assets`，找到 `Authoring-*.js` 并以 1,450,000 bytes 为失败上限；加入 `verify:full` 之后的独立 CI step，不改变现有 test budget。
- 更新 `docs/src/known-issues.md` 中已经陈旧的 `Authoring.vue 12,823`、根层 services 72、gameStore 4,854 等数字，以最终树重新统计。
- `docs/engineering/current-architecture.md` 记录 H1 owner 与最终行数，只保留当前事实。
- 删除 STATUS/PLAN 中仍把已完成架构包写成“待执行”的直接矛盾；不重写历史回执。
- 运行 README/文档本地链接检查，修复计划编制时已发现的两个断链：
  - `docs/agent-runs/2026-07-16-online-agents-canvas-video/README.md`
  - `docs/agent-runs/2026-07-16-round2-integration/README.md`
  应改指向现存回执或删掉失效入口，不创建空 README 占位。

## 8. R 线：大文件与目录架构完整迁移

### 8.0 共同原则：什么才算“拆完一刀”

以下规则适用于 R-A/R-N/R-P/R-X/R-S：

- 按完整业务 owner 迁移：状态、派生值、动作、取消/失败、清理和资源释放一起走；禁止只把 100 行 helper 移到新文件。
- 页面保留 DOM ref、组件装配、路由级入口和 host adapter；纯投影、异步生命周期、持久化编排不得继续留在页面。
- 新 composable 不直接 import 页面、router singleton 或 active store 猜目标；依赖通过参数注入，持久 owner 仍是原 repository/store。
- 不复制 reactive state；迁移后旧 refs/functions/imports 必须删除。禁止“旧函数调用新函数但旧状态仍在页面”的假迁移。
- 新组件必须拥有真实模板和交互边界，不得是把 60 个 props 原样转发给 slot 的壳。
- 不修改正式 schema、storage key、路由和用户可见行为；若发现现有 bug，先写最小复现，再在本 owner 内修。
- 每包结束执行 `rg` 证明旧 owner 已消失，并统计页面行数/import 数；没有达到本节硬指标不得标 complete。

计划编制基线：

| 文件/目录 | 行数或数量 | 最终硬上限 |
|---|---:|---:|
| `Authoring.vue` | 12,193 行 / 149 个 import/from | ≤10,900 行 / ≤125 个 import/from |
| `Notes.vue` | 4,263 行 / 25 个 import/from | ≤3,300 行 / ≤18 个 import/from |
| `ProseEssay.vue` | 4,395 行 / 26 个 import/from | ≤3,450 行 / ≤18 个 import/from |
| `Experience.vue` | 4,439 行 / 38 个 import/from | ≤3,550 行 / ≤28 个 import/from |
| `gameStore.js` | 2,990 行 / 38 个 import/from | ≤2,300 行 / ≤30 个 import/from |
| `src/services/` 根层 JS | 42 个 | ≤20 个 |

行数是防止小拆交差的下限，不是设计目标；必须同时满足 owner 消失和行为保持。

### R0｜为架构迁移建立可重复量尺

新增 `scripts/architecture/structure-budget-check.mjs`，只读源码并输出/校验：

- 五个热点文件行数。
- `import`/`from` 模块边数量。
- `src/services` 根层 JS 数。
- 生产相对 import 图中的循环。
- `experimental/` 被 production import 的违规边。
- 页面直接 import repository/storage owner 的清单。

脚本必须支持 `--report`（只报告）与 `--enforce`（超过最终硬上限 exit 1）。实施期间先用 report；所有 R 包组合后才开启 enforce。禁止用删空行、压缩格式或单行塞多个语句满足预算。

### R-A0｜Authoring 历史/恢复 owner

直接执行 H1，作为 Authoring 第一刀。H1 未完成前不得进入 R-A1。

### R-A1｜Authoring 插画 host 整块迁出

当前页面约 2784～3186 行仍持有：来源捕获、移动工具来源、prepared source、打开/关闭、人物参考图、素材保存、插入正文、生成开始/完成/失败/取消和 freshness reconcile。

执行：

1. 扩展现有 `useAuthoringIllustrator.js`，或新增 `useAuthoringIllustratorHost.js`；二选一，不并存两个同义 owner。
2. 将上述完整生命周期迁入；页面只提供当前文档/人物/选区读取器、editor image insertion、通知和 inspector 打开适配器。
3. `updateMediaAsset`、visual brief freshness、prepared source 世代和 generation status 从页面移除。
4. 来源在打开时冻结；生成中切章/切书后迟到图片不得插入新目标。
5. 素材写盘失败保留生成结果与重试动作，不把 UI 标为已保存。

量化要求：Authoring 再净减 ≥320 行、相关直接 imports 减少 ≥5。既有画师入口、人物参考图、本地图片限制、Ghost/正文插入和关闭焦点行为不变。

### R-A2｜Authoring 知识 reader/facade 整块迁出

当前页面约 4989～5250 行仍构建 live reader snapshot、selection window、chapter excerpt、source refs、facade 和 query session 输入。

执行：

1. 新增 `src/services/agents/authoring/authoringKnowledgeReaderHost.js`，承接纯 snapshot/reader/facade 组装。
2. 输入显式为 project/book/chapter/document/unit/selection/revision/worldbook snapshot；禁止服务自己读 active store。
3. 页面只实现 `readLiveDocument()` 与 `readSelection()` 两个 host adapter，知识助手和试演工具复用同一 reader catalog。
4. 删除页面的 `resolveAuthoringReaderSnapshot()`、`buildAuthoringKnowledgeReaders()`、`getAuthoringFacade()` 及只服务它们的 helper/import。
5. 切章、双栏、构思文档和正文四种 source identity 必须保持；未来资料不得因 reader 迁出而进入“截至这里”。

量化要求：Authoring 再净减 ≥260 行、直接 imports 减少 ≥6；新 service 是纯组装/读取，不引入 Vue。

### R-A3｜Authoring 共同排演 controller 整块迁出

当前页面约 5930～6310 行持有 feature flag、动态模块、controller、邀请复制、proposal/vote/generate/promote、receipt flush、focus restore 和 dispose。

执行：

1. 新增 `useAuthoringCollaborationWorkflow.js`，迁入完整 controller 生命周期。
2. 动态 import、连接状态订阅、邀请、离开、销毁和 pending promotion receipt 归同一 composable。
3. 页面只注入 frozen rehearsal artifact、live revision reader、Ghost promotion adapter、inspector open/close 和通知。
4. feature flag 关闭时不得加载 collaboration chunk、注册 controller 或留下 watcher。
5. 卸载、切书、关闭房间、连接失败和 late promotion 必须释放订阅；不得只在 happy path dispose。

量化要求：Authoring 再净减 ≥300 行、直接 imports/动态模块变量减少 ≥4；原共同排演 gate 保持，功能不扩到 C2-4。

### R-A4｜Authoring 组合收口

R-A0～R-A3 后统一检查：

- `Authoring.vue` ≤10,900 行，import/from ≤125。
- 页面不得直接出现 snapshot repository CRUD、media asset freshness orchestration、knowledge facade builder 或 collaboration controller 方法。
- 每个新 owner 有单一 reset/dispose；切书总清理从页面调用一次，不逐个散落 watcher。
- 运行 Authoring 首访、设定往返、推演、校对/搜索、画师、历史恢复、共同排演 flag-off smoke。

若仍超行数，不得靠移动 CSS/空行凑数；继续把同一 owner 遗留补进对应 composable。不要临时再选第五个小功能拆分。

### R-N0｜Notes 基线与现有 owner 对照，限时 20 分钟

确认 `useNotesAssetEditor`、`useNotesAssetCatalog`、`useNotesMaterialAdvisor`、`useNotesIllustrationInteraction` 已有职责，列出页面仍保留的插画呈现/生成/编辑器 DOM 逻辑。不得重写已有 composable。

### R-N1｜插画呈现与媒体生命周期整块迁出

当前 Notes 约 875～1080、1312～1700 行仍包含模型选择、figure target、presentation、媒体保存、Markdown 插入、DOM figure 构建、锚点/文本 offset 和 surface restore。

执行：

1. 新增 `useNotesIllustrationWorkspace.js`，组合现有 `useNotesIllustrationInteraction`，不复制 pointer/selection 状态机。
2. 迁入生成图片保存、媒体引用、presentation 持久化、figure 构建/恢复/增强、selection reset 和迟到生成归属。
3. 页面只注入 rich editor/preview DOM roots、当前 asset/chapter 和通知；DOM helper 可放 `services/notes/illustrationDomAdapter.js`，但业务状态留 composable。
4. 删除 `Notes.vue` 中对应状态、watch、函数和 media imports。

必须覆盖：图片插入、紧密/矩形环绕、拖动/缩放、编辑模式切换、预览恢复、本地媒体缺失、生成中切素材和保存失败。

### R-N2｜Notes 编辑工作区组件化

新建 `NotesEditorWorkspace.vue`，迁入当前资产标题/正文编辑、rich/markdown 切换、预览和插画 surface 的完整模板与局部样式；它直接消费 `useNotesAssetEditor` 和 R-N1 暴露的最小接口。

约束：

- Catalog/sidebar、路由级 asset 选择和页面导航留在 Notes page。
- editor component 不读 route/gameStore，不拥有资产持久化 schema。
- props + emits 总数 ≤24；超过说明边界错误，应该传一个明确 controller，而不是继续加事件。
- 不复制 Markdown/HTML conversion 或 autosave timer。

R-N 完成指标：`Notes.vue` ≤3,300 行、import/from ≤18；插画和编辑器行为 owner 各唯一。若只把 CSS 移到组件但脚本逻辑仍在页面，判失败。

### R-P0｜Prose 当前画布 owner 对照，限时 20 分钟

确认 `useCanvasBoard`、`useCanvasViewport` 和 `proseCanvasRepository` 已拥有的能力；只列页面仍保留的 pointer/link/selection 事务和导演导出流程。

### R-P1｜画布交互会话整块迁出

当前约 1774～2250 行的 card drag、pile detach、edge draft、link/delete mode、pointer capture、RAF 更新和 cancel 清理迁到 `useProseCanvasInteraction.js`。

要求：

- 与 `useCanvasViewport` 共用坐标转换，不复制 geometry。
- pointerdown → move → up/cancel 是一个 session；unmount/visibility change 必须 cancel RAF 和 pointer capture。
- 页面只传 cards/edges 的 mutation adapter 和 viewport DOM ref。
- 拖动失败、目标删除、模式切换和窗口失焦不留下半条 edge 或幽灵 selection。
- 迁出所有只为交互会话存在的 refs/watch/listeners。

### R-P2｜导演导出与视频交接整块迁出

当前约 2377～2755 行的 timeline/cards/source excerpt/fingerprint/source refs/project ID、storyboard version、Markdown/TXT/JSON/ZIP 和 video panel handoff 迁到 `useProseDirectorExport.js`。

要求：

- 纯序列化 helper 下沉到 `services/canvas/proseDirectorExport.js`；下载、状态和视频面板生命周期留 composable。
- 使用现有 storyboard/media owner，不直接写 storage。
- source fingerprint、stale、重复导出、归档媒体和失败重试保持。
- 页面只保留菜单触发和 controller 返回的状态/动作。

R-P 完成指标：`ProseEssay.vue` ≤3,450 行、import/from ≤18。画布交互与导演导出各自拥有单一 dispose/reset；七键 repository 不回流页面。

### R-X0｜Experience 与 gameStore 边界冻结

该线只做兼容面的 owner 迁移，不新增 Experience 功能。先运行现有 session fault matrix，冻结当前 state/action 名称和存档 shape。

### R-X1｜Experience 页面四个完整会话迁出

依次新增并接入：

1. `useExperienceAutoAdvance.js`：timer、pause 判断、schedule/run/stop、人工输入取消和 unmount 清理。
2. `useExperienceCodexWorkspace.js`：打开/关闭、详情栈、地点跳转、section 状态、焦点 trap/restore。
3. `useExperienceSessionWorkflow.js`：session 选择/创建/删除、加载期间状态、失败恢复和 dialog focus。
4. `useExperienceQuickCapture.js`：速记草稿、对话片段选择、保存素材、清空和写盘失败。

页面仅装配 store、router、DOM focus adapter 和现有组件。四个 composable 不互相 import；共享能力走已有 service。

完成指标：`Experience.vue` ≤3,550 行、import/from ≤28；页面不再持有 auto timer、codex detail stack、session CRUD flow 或 quick-note persistence。

### R-X2｜gameStore 涌现与冒险触发 coordinator

将约 434～1157 行的两组完整动作迁到：

- `services/experience/gameEmergenceCoordinator.js`
- `services/experience/adventureTriggerCoordinator.js`

要求：

- coordinator 输入显式 snapshot + repository/effect adapter，返回 patch/receipt；不成为第二个 Pinia store。
- store wrapper 每个动作只做参数读取、调用 coordinator、一次 patch 应用和返回结果，不保留重复验证/回滚分支。
- candidate refresh、draft generate/apply/reject/rollback/clear 一起迁；不得只迁纯 helper。
- prose/storyboard trigger 的 gate、cooldown、生成、durable asset adoption 和失败状态一起迁。
- worldbook/history/memory 正式写入仍走原 owner；部分失败不得伪装成功。

### R-X3｜gameStore 分支事务与机制投影

迁移两块：

1. `services/experience/gameBranchWorkflow.js`：约 1974～2340 行的 find turn、visible chain、regenerate、switch branch、undo extension、candidate list 和 chat history rebuild 计划。
2. `services/experience/experienceMechanismProjection.js`：约 1582～1826 行的 mechanism/milestone/inline event 纯检测与可信 speaker 输入；store 只应用结果。

要求：

- branch workflow 返回一次最终一致 patch + persistence intent；store 只在完整事务结束调用 `commitCurrentSessionNow()`。
- no-AI regenerate 保持严格 no-op。
- failed/cancelled regenerate 恢复旧 branch、post snapshot、visible messages 和 memory filter。
- 机制检测纯函数化，不自行弹 UI、不持 timer、不写 store。

R-X 完成指标：`gameStore.js` ≤2,300 行、import/from ≤30；`Experience.vue` 指标同时满足；session fault matrix 全绿，存档 schema 不变。

### R-S0｜根层 services 归域：只做路径迁移

从 A/C/R 组合后的最新基线执行，禁止与功能修改混在同一个 diff。按以下固定映射移动并全仓更新 import：

```text
services/memory/
  memoryCandidates.js memoryCompaction.js memoryImportance.js
  memoryProvenance.js memoryRetrieval.js memorySync.js memoryTriggers.js

services/writing/
  chapterDetector.js chapterOutline.js encodingDetector.js epubAdapter.js
  writingNameGenerator.js

services/worldbook/
  seedWorldbookPresets.js settingFieldGeneration.js settingPanelSchema.js
  settingPlaceGeneration.js worldbookContextBuilder.js
  worldbookQuickImportHelpers.js worldbookSourceAdapters.js worldbookSourceArchive.js

services/media/
  narrativeAssetRetrieval.js narrativeAssets.js shotExporter.js storyboardStore.js

services/canvas/
  relationCanvas.js

services/experience/
  playerHistory.js runtimeEventCausality.js runtimeEvents.js
```

规则：

- 使用 `git mv`；文件内容除相对 import 修正外不得改变。
- 更新 `src/`、`server/`、`scripts/`、测试和文档中的真实路径。
- 根目录不保留 re-export shim、空 barrel 或同名兼容文件；否则根文件数量没有实际下降。
- 每个目标目录可以有一个 README 更新生命周期说明，但不新增 `index.js` 全量 barrel。
- 动态 import、Vitest mock path、Node 脚本 URL 和 Vite alias 必须一起更新。
- 执行前后导出模块的命名集合必须相同；不得借机改 API。

R-S 完成指标：`src/services` 根层 JS 从 42 降到 ≤20；全仓旧路径 `rg` 为 0；生产 import 图 0 cycle；Vite/VitePress/Node scripts 均能解析。

### R-V｜架构组合验收

必须提供一张前后量尺表，而不是“已优化”：

```text
file/root                 before           after          limit
Authoring.vue             12193 / 149      ? / ?          10900 / 125
Notes.vue                  4263 / 25        ? / ?          3300 / 18
ProseEssay.vue             4395 / 26        ? / ?          3450 / 18
Experience.vue             4439 / 38        ? / ?          3550 / 28
gameStore.js               2990 / 38        ? / ?          2300 / 30
services root JS           42               ?              20
production cycles          0                ?              0
lint warnings              140              ?              0
```

任一行未达到目标，该 R 包标 partial，不得通过删注释、压行、关闭检查或修改预算值变绿。

## 9. O 线：固定检查点与集成

### O0｜T+0

- 记录实际 base SHA、Node 版本、A/B/C/R-N/R-P/R-X 六个 worktree/branch、写锁和开始时间到 `docs/agent-runs/nightly-web-alpha-20260915/board.md`。
- 跑一次基线：`npm run verify:full`、试演 Gate、备份现有测试。
- 运行 R0 `--report`，将五个大文件、根 services、循环和 lint 精确基线写入 board；不得抄计划数字冒充实测。
- 基线失败只记录真实失败；与本夜无关的存量问题不得由 worker 顺手扩大范围。

### O1｜T+0:45

- 收 A0/C0，拒绝任何新框架或数据库重写。
- 确认 A 使用现有 `history_lookup`，C 使用现有两个 IndexedDB owner。
- 检查 B 基线是否来自生产页面，而不是静态 Mock。
- 收 R-N0/R-P0/R-X0：每线必须已经指出旧 owner 与新 owner 的一一映射；只交“建议拆分”而无生产 diff，立即返工。

### O2｜T+1:45

- 冻结 A2 DTO；给 B 正/拒绝/不可用三份 fixture。
- 审 C1 bundle 目录、secret 排除和 hash 规则；禁止 base64 把所有媒体塞进 manifest。
- 检查 R-N1、R-P1、R-X1 的实际迁出：新文件内必须同时出现 state/actions/dispose，原页面对应状态已经减少。
- 任一 worker 已完成当前包，立即派本文下一编号，不允许空等。

### O3｜T+3:00

- 组合 A3 + B1/B2，真实走一次 tool call → readable receipt。
- 审 C3 在写入前是否真的完成全包校验。
- R-N 应进入 N2，R-P 应进入 P2，R-X 应进入 X2；逐项记录当前行数，未净减至少 250 行的线不得声称第一刀完成。
- B 的 DTO 接线冻结后，从 B branch 另建 `night/refactor-authoring`，开始 H1/R-A0；B 原 worker继续 B3～B5，两个 worktree 不同时修改同一区段。
- 检查累计有效代码 diff；只有文档/测试无生产实现的线标红并返工。

### O4｜T+4:15

- 组合 A5/A6 + B3，走 Ghost 采用 → memory pending。
- 对 C4 注入三种存储失败，确认补偿回滚。
- 收 R-N/R-P 第一轮完成态；未达到最终行数时只补本 owner 遗留，不另拆小组件。
- R-X 应进入 X3；Authoring 架构线应完成 H1 并进入 R-A1。
- 开始记录跨线 blocker，不接受 worker 用“接口已交”提前结束。

### O5｜T+5:30

- 三线主包应至少进入 A7、B5、C6。
- 三线分别领取 H0 自己的文件域；B 同时启动 H1，完成 B5 的同一 worker 不得提前结束。
- R-N/R-P 达标后冻结文件；其 worker分别领取 H0 的 components/pages 余项和 H2 分包，不再继续任意拆页面。
- R-X 必须同时报告 Experience 与 gameStore 行数；只完成页面或只完成 store 均为 partial。
- O 建立组合 worktree，按 R-N → R-P → R-X → A → B → C 合入完成态；Authoring 架构 branch 继续基于 B 完成态做 R-A1～R-A3。
- 先修正常生产路径，再修 Gate；禁止放宽断言迁就实现。
- 真实 provider 未授权/不可用不阻塞 fixture，但必须单列未测。

### O6｜T+6:15

- A/B/C 主包完成的线进入 A8/B6/C7，并继续 H0。未完成的线停止扩展，只修 blocker。
- Authoring 架构线必须完成 H1、R-A1、R-A2，R-A3 至少已有完整 controller diff；未达到 10,900 行不能再开别的包。
- H2 若尚未启动，由已冻结的 R-N 或 R-P worker 从最新组合基线接手；不得与 Authoring 架构线同时改 import 区，二者由 O 分两个串行窗口。
- C8 压力样本开始执行；不提交大产物。
- 对照写锁，准备冻结共享文件。

### O7｜T+6:20 功能/页面冻结，启动路径归域

- A/B/C/R-N/R-P/R-X/R-A/H2 停止新增接口，各交一个完成态 handoff commit 和不超过 120 行 summary；没有达标的明确标 partial。
- O 完成页面/功能组合并跑最短关键链：工具合同、rehearsal Gate、backup round trip、Experience fault matrix。
- 从这个组合 SHA 开始 R-S0；此后所有 worker禁止再修改被移动文件或其 import。R-S 只做 `git mv + import path`，发现行为问题记录而不夹带修复。
- H0 剩余 warning 由未参与 R-S 的 worker按 O 分配文件清零。

### O8｜T+7:10～T+8:00 最终门禁与压缩提交

必须执行：

```bash
npm run doctor
node scripts/authoring-rehearsal-consequence-matrix.mjs
node scripts/authoring-ui/rehearsal-panel-check.mjs
node scripts/authoring-ui/workspace-backup-check.mjs
npm run smoke:narrative-stream
npm run smoke:narrative-recovery
npm run ci:authoring-smoke
npm run verify:full
./node_modules/.bin/eslint src --ext .js,.vue --max-warnings 0
# 执行 H3 新增的 Authoring build-size gate
node scripts/architecture/structure-budget-check.mjs --enforce
```

若新增 CI backup smoke，再执行对应命令。失败时只修本夜引入的问题；不得删除测试、降低 lint、跳过失败视口或把 exit 1 写成已知限制。

最终只保留：

- A/B/C/R-N/R-P/R-X/R-A/R-S 短回执。
- 4 张 B 代表图。
- 1 份不含私人内容的 backup manifest 样例。
- 真实命令、exit code、测试数和未测项。

## 10. 完成判定

以下全部成立才可写“本夜完成”：

- 普通试演生产路径不再固定 `toolChoice: none`；有授权历史时可完成一次真实 tool call/result 循环。
- 工具不能查询 manifest 之外的历史；取消、迟到、切路和 revision 变化不会污染当前路线。
- 作者在右栏能核对查阅来源，但看不到内部 ID/JSON/隐藏推理。
- 选定路线的工具 refs 能进入试稿来源，不能串到另一条路线。
- Ghost 保存成功后，作者可把一项仍受最终正文支持的后果送入现有 pending memory 审核；没有自动正式写入。
- 完整 ZIP 备份包含 localStorage、来源归档和已落盘媒体，manifest 有 hash、计数、大小和缺失项。
- ZIP 恢复先预览，失败可补偿回滚，重复恢复幂等；旧 JSON 备份仍可使用。
- 140 条 ESLint warning 清零，未修改规则或增加 suppression。
- Authoring 历史/恢复整块迁出，页面至少净减 350 行、相关直接 imports 至少减少 8 个。
- Authoring 主 JS chunk 不超过 1,450,000 bytes，至少 4 个重面板成为按需 chunk，首次打开和失败重试可用。
- 64 MB 来源 + 20 MB 媒体 + 100 章的备份压力样本完成一次导出/清空/恢复/hash 核对。
- `Authoring.vue` ≤10,900 行 / ≤125 import-from，且历史恢复、插画 host、知识 reader 和共同排演 controller 四个 owner 已迁出。
- `Notes.vue` ≤3,300 行 / ≤18 import-from，插画工作区和编辑器工作区不再由页面持有。
- `ProseEssay.vue` ≤3,450 行 / ≤18 import-from，画布 pointer/link session 与导演导出已迁出。
- `Experience.vue` ≤3,550 行 / ≤28 import-from，auto advance、Codex、session、quick capture 四个会话已迁出。
- `gameStore.js` ≤2,300 行 / ≤30 import-from，涌现、冒险触发、分支事务和机制投影已有领域 owner。
- `src/services` 根层 JS ≤20、旧路径引用为 0、生产相对 import cycle 为 0、production 不依赖 experimental。
- 四档 UI 旅程、无 Key authoring smoke 和 `verify:full` 通过。
- `docs/STATUS.md`、`docs/PLAN.md`、已知问题和用户手册只更新既有事实，不堆一组互相矛盾的新条目。
- 最终 `main` 最多两个大提交（产品纵切、架构迁移各一个），只 push 一次。

任一项未实现必须写成 `partial` 或 `not run`。真实 provider、真实作者视觉和实体设备没有证据时不得标通过。
