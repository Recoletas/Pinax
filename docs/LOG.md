# 开发日志（精简版）

> 更新规则：这里只记录里程碑、影响范围、用户可感知方式、验证结果和已知风险。详细 diff 以 git 工作区为准，不再追加长流水账。

## 当前状态

| 模块 | 状态 | 关键结果 |
|------|------|----------|
| 会话与运行态 | 完成 | 会话运行态和全局资料拆分，新建/切换/保存/恢复已收口 |
| 世界书上下文 | 完成 | 上下文构建器、命中预览、常驻/高优先级条目、草稿入库已接入 |
| 素材中台 | 完成 | 素材存储、整理体验、写作消费、入纲要、续写参考、转素材、入世界书已完成 |
| 统一生成任务层 | 完成 | 写作、Copilot、顾问、体验、诗歌、散文、世界书导入已接入；业务层已无 `runGenerationRetryPlan` 直连 |
| 编辑器与统一智能顾问 | 完成 | 顾问已统一到 OpenClaw，动作化输入和结果应用已落地 |
| 记忆系统 | 基本完成 | 候选确认、scope 隔离、mem0 同步/读取、本地记忆注入、同步状态可见、批量确认/拒绝、批量改 scope、批量归档、已归档视图、基础冲突提示、替换旧记忆、合并旧记忆、本地相似提示、远端精确去重、规则型重复提示已接入，细节暂缓 |
| 统一分镜输出层 | 当前主线 | `StoryboardDocument`、版本对象和结构化校验已启动，散文/诗歌/体验/章节草稿都会同步落到统一文档，主入口导出已统一到校验保存入口 |
| 产品信息架构 | 进行中 | 一级导航、欢迎页和首页入口已开始改成体验/写作/设定/分镜，素材页和相关快捷入口也已接上，诗歌/散文已降到二级入口 |

## 最新里程碑

### 2026-05-27 - 素材接口与快捷面板收口

状态：完成

变更：
- 体验、写作、诗歌和散文里的快捷保存、跳转和来源提示统一改成“素材”语义，相关入口接到 `/materials`。
- `narrativeAssets`、`writingNotes` 和快捷面板的用户可见提示统一改成素材词汇，避免新旧界面混用。

用户可感知：
- 体验、写作、诗歌和散文里的快捷入口现在都更像同一套素材工作台，不再反复露出“笔记”语义。

最近验证：
- `src/__tests__/narrativeAssets.test.js` 通过。
- `src/__tests__/writingNotes.test.js` 通过。
- `src/__tests__/workbenchNav.test.js` 通过。
- `npm run build` 通过。

### 2026-05-27 - 笔记页统一为素材页

状态：完成

变更：
- 原“笔记”页的界面语言统一改成“素材”，保留底层写作笔记存储实现，但不再向用户暴露“笔记”作为主入口。
- 路由路径从 `/notes` 收口到 `/materials`，旧地址保留兼容跳转。
- 一级导航中的写作二级入口只显示“素材”，欢迎页和首页也统一使用“素材整理”作为入口文案。

用户可感知：
- 写作侧不再先看到“笔记”，而是直接进入素材整理和素材编辑。

最近验证：
- `src/__tests__/workbenchNav.test.js` 通过。
- `npm run build` 通过。

### 2026-05-27 - 一级导航与首页入口收口

状态：完成

变更：
- 一级导航从诗歌/散文改成设定/分镜，诗歌和散文改为分镜工作台下的二级入口。
- 欢迎页和首页快捷入口同步切到体验、写作、设定、素材和分镜的工具链词汇。
- 路由标题改为更贴近工作区的命名，并新增一级导航收口测试。

用户可感知：
- 进入工作台后，先看到的是体验、写作、设定和分镜，不再把诗歌/散文当成并列产品中心。

最近验证：
- `src/__tests__/workbenchNav.test.js` 通过。
- `src/__tests__/storyboardStore.test.js` 通过。
- `npm run build` 通过。

### 2026-05-27 - 分镜导出统一保存入口收口

状态：完成

变更：
- 新增 `saveValidatedStoryboardVersion()`，把分镜导出的校验与保存收口到同一个服务入口。
- 体验页、写作页、诗歌页和散文编导页现在都通过统一保存入口写入 `StoryboardDocument`，各自只处理来源提取和用户提示。
- 补充分镜导出服务测试，覆盖统一保存入口的成功和失败路径。

用户可感知：
- 体验、写作、诗歌和散文的分镜导出现在会先统一校验，再写入版本历史，错误提示更一致。

最近验证：
- `src/__tests__/storyboardStore.test.js` 通过。
- `src/__tests__/integration.test.js` 通过。
- `src/__tests__/narrativeAssets.test.js` 通过。
- `npm run build` 通过。

### 2026-05-27 - 体验素材与章节草稿接入统一分镜

状态：完成

变更：
- 体验页新增统一分镜草稿导出，会把当前会话素材整理成 `StoryboardDocument` 版本并导出 Markdown。
- 写作页新增当前章节分镜草稿导出，会优先使用章节纲要，必要时回退到正文分段。
- `shotExporter` 新增体验素材和章节片段的统一提取器，`narrativeAssets` 支持按来源筛选，方便只抓当前会话素材。
- 散文编导模式的统一分镜导出现在会先做结构校验，再写入版本历史并导出 Markdown / JSON / Premiere。

用户可感知：
- 在体验页点“分镜草稿”，或在写作页点“分镜”，都会得到版本化的统一分镜草稿，不再只是页面私有导出。
- 在散文编导模式下导出分镜时，会先提示校验错误，避免写入无效版本。

最近验证：
- `src/__tests__/integration.test.js` 通过。
- `src/__tests__/narrativeAssets.test.js` 通过。
- `src/__tests__/storyboardStore.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 诗歌编导树接入统一分镜导出

状态：完成

变更：
- 诗歌灵感工坊编导模式的 Markdown 导出改为统一分镜导出入口，会同步写入 `StoryboardDocument` 版本。
- `extractShotsFromPoetryLab()` 现在能直接适配诗歌树节点、边关系和现有额外字段，能从当前页面结构提取统一 shots。
- 补充集成测试，覆盖诗歌树节点到统一分镜的映射和转场解析。

用户可感知：
- 在诗歌编导模式下导出 Markdown 时，除了得到分镜稿，还会写入统一版本历史，后续和散文编导走同一条出口。

最近验证：
- `src/__tests__/integration.test.js` 通过。
- `src/__tests__/storyboardStore.test.js` 通过。
- `src/__tests__/useDirector.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 编导组合函数接入统一分镜文档

状态：完成

变更：
- `useDirector` 不再只围着旧 snapshot 记录转，而是直接写入和恢复统一 `StoryboardDocument` 版本。
- `snapshotHistory` 现在反映统一版本历史，诗歌/散文加载会落到同一套文档和版本对象。
- 补充 `useDirector` 单测，覆盖统一文档落地和版本恢复。

用户可感知：
- 编导相关的保存和恢复行为不变，但底层已经收口到统一分镜对象，后续迁移旧页面导出会更顺。

最近验证：
- `src/__tests__/useDirector.test.js` 通过。
- `src/__tests__/storyboardStore.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 统一分镜文档与版本对象启动

状态：进行中

变更：
- 新增 `STORYBOARD_DOCUMENTS` 存储键，分镜开始从页面 snapshot 过渡到统一 `StoryboardDocument`。
- `storyboardStore` 新增文档创建、列表、版本追加、当前版本恢复和结构化校验结果。
- 旧 `saveStoryboardSnapshot()` 保持兼容，同时同步写入统一文档和版本。
- 补充分镜文档、版本恢复、结构化校验和旧 snapshot 兼容测试。

用户可感知：
- 现有页面行为不变；底层已经开始把诗歌/散文分镜结果收束到同一套版本化对象，为后续统一分镜入口和导出校验打基础。

最近验证：
- `src/__tests__/storyboardStore.test.js` 通过。
- `src/__tests__/storage.test.js` 通过。
- `src/__tests__/integration.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆批量归档与恢复

状态：完成

变更：
- 记忆候选面板新增“已归档”视图，待确认项可批量归档，归档项可恢复回待确认或已确认状态。
- `memoryCandidates` 新增 `archiveMemoryCandidate()`、`batchArchiveMemoryCandidates()` 和 `restoreMemoryCandidate()`，归档会落到 `stale` 状态并记录原状态。
- 补充归档、批量归档和恢复单测。

用户可感知：
- 候选处理完后可以先归档收起，之后再切到已归档视图恢复，不必靠拒绝来清空。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `src/__tests__/memorySync.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆相似与远端精确去重

状态：完成

变更：
- `memoryCandidates` 新增 `similarTo` 和保守相似度检查，高度相似内容会先标“相似重复”，不直接进入冲突流程。
- 记忆面板新增“相似重复”标记和说明。
- mem0 同步前会搜索同 scope/type 的远端记忆，精确相同内容会复用远端 ID，不重复写入。

用户可感知：
- 高度相似但不完全相同的候选会被单独提示；远端已有完全相同记忆时，同步结果会显示为已匹配远端记忆。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `src/__tests__/memorySync.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆合并旧记忆

状态：完成

变更：
- 记忆候选在出现基础冲突时可以直接合并旧记忆。
- 合并动作会把新候选和冲突旧记忆的内容去重拼接成一条新记忆，并把旧记忆标记为 `stale`。
- 补充合并流程单测，覆盖合并内容、候选转 active 和旧记忆降级。

用户可感知：
- 看到冲突提醒后，可以选择保留两边信息并合并为一条新记忆，而不是只能确认或替换。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆替换旧记忆

状态：完成

变更：
- 记忆候选在出现基础冲突时可以直接一键替换旧记忆。
- 替换动作会把冲突的已确认记忆标记为 `stale`，只做本地收口，不主动删除远端记录。
- 补充替换流程单测，覆盖冲突候选替换成功、旧记忆降级和替换后状态收口。

用户可感知：
- 看到冲突提醒后，可以直接用新候选替换旧记忆，不必先手工把旧条逐条清理掉。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆基础冲突提示

状态：完成

变更：
- `memoryCandidates` 在入队和编辑时会对同 scope、scopeId、kind 下的已确认记忆做保守冲突检查，并写入 `conflictsWith`。
- 记忆面板会对候选显示“可能冲突”提示，提醒作者先比对再确认，不自动替换已有记忆。
- 补充基础冲突提示单测，覆盖同类已确认记忆、不同 scopeId 和完全重复内容三种情况。

用户可感知：
- 看到同类已确认记忆和当前候选内容不一致时，会先收到冲突提醒，而不是直接被系统吞掉。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆候选批量改 scope

状态：完成

变更：
- 记忆候选面板的待确认批量区新增目标作用域和 Scope ID 入口，支持对已选候选批量改 scope。
- `memoryCandidates` 新增 `batchUpdateMemoryCandidateScope()`，批量迁移会复用既有候选更新逻辑并继续刷新重复标记。
- 补充批量改 scope 的服务单测，覆盖多条迁移、global-author 清空 `scopeId` 和缺少 `Scope ID` 的拦截。

用户可感知：
- 选中多条待确认记忆后，可以直接移动到目标作用域，不必逐条打开编辑再改。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆规则型重复提示

状态：部分完成

变更：
- `memoryCandidates` 新增保守内容 hash 和 `duplicateOf` 标记，入队和编辑时会检查同 scope、scopeId、kind 下的完全重复内容。
- 重复源优先选择已确认记忆，再选择待确认记忆。
- 记忆面板会对疑似重复项显示提示，但不自动合并、拒绝或替换。

用户可感知：
- 待确认候选里出现明显重复内容时，会看到“疑似重复”标记，方便手动拒绝或保留。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `src/__tests__/memorySync.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆候选批量整理第一步

状态：部分完成

变更：
- 记忆候选面板新增待确认项批量选择、全选可见、批量确认和批量拒绝。
- 批量确认会沿用单条确认的同步链路，并汇总本地保留、已同步和失败结果。
- 已确认视图暂不做批量整理，批量改 scope、归档、去重和冲突处理后续再补。

用户可感知：
- 在待确认记忆较多时，可以一次处理一组候选，不必逐条确认或拒绝。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `src/__tests__/memorySync.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆同步状态面板化

状态：完成

变更：
- 记忆候选面板新增“待确认 / 已确认”视图切换，已确认项可以直接看到同步状态。
- `memoryCandidates` 新增 `syncStatus`、`remoteId`、`lastSyncedAt` 和 `lastSyncError`，确认、拒绝和 active 候选都保留可读状态。
- `memorySync` 返回更明确的同步结果，支持 local-only、syncing、synced 和 failed 的状态流转与重试。

用户可感知：
- 确认记忆后不再只是“消失”，而是能在已确认列表里看到它是仅本地、同步中、已同步还是失败，并可直接重试同步。

最近验证：
- `src/__tests__/memoryCandidates.test.js` 通过。
- `src/__tests__/memorySync.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 顾问路由与结果解析服务化

状态：完成

变更：
- 新增 `server/services/advisorTaskService.js`，把顾问 JSON 解析、目标元数据附加和返回壳规范化从路由中抽出。
- `/api/advisor/task` 与 `/api/advisor/advice` 现在复用同一条服务化处理链，路由层只负责入参校验和错误转译。
- 补充服务层单元测试，覆盖 fenced JSON、默认任务类型、替换型结果和普通审阅建议。

用户可感知：
- 顾问结果的结构化解析更稳定，应用修改卡片不再依赖路由里临时拼装的逻辑。

最近验证：
- `src/__tests__/serverAdvisorTaskService.test.js` 通过。
- `src/__tests__/advisorResultApplier.test.js` 通过。
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 顾问修改应用校验服务化

状态：完成

变更：
- 新增 `advisorResultApplier`，统一处理顾问替换结果的范围校验、原文校验和替换产物。
- 写作页不再内联维护替换校验细节，只消费 `applyAdvisorReplacement()` 的结果。
- 补充替换成功、原文过期、范围无效、非替换类型的单元测试。

用户可感知：
- “应用修改”行为不变，但过期和无效范围判断更稳定，为后续更多顾问结果类型复用打基础。

最近验证：
- `src/__tests__/advisorResultApplier.test.js` 通过。
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 顾问可应用修改第一版

状态：部分完成

变更：
- OpenClaw 对选区/段落修正任务会被要求返回结构化 JSON，包含 `summary`、`replacement` 和 `issues`。
- `/api/advisor/task` 会解析结构化返回，并把 `targetRange`、`baseText`、`replacement` 放进 `AdvisorResult`。
- `AdvisorPanel` 增加可应用修改卡片，支持“应用修改 / 忽略”。
- 写作页应用修改前会校验原文范围和 `baseText`，若正文已变化则标记建议过期，不做替换。

用户可感知：
- 对“修正选中内容”和“修正当前段落”生成结构化结果时，顾问面板会出现可直接应用到正文的修改卡片。
- 如果生成后用户已经改过目标文本，应用会被阻止并提示建议过期。

最近验证：
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - AdvisorTask 协议落地

状态：部分完成

变更：
- 新增 `/api/advisor/task`，统一顾问请求开始携带 `taskType`、`target` 和 `options`。
- 前端 `advisorTaskService` 增加 `requestAdvisorTask()`，将写作页动作 scope 标准化为 `advisor.fix.selection`、`advisor.fix.paragraph`、`advisor.close.thread`、`advisor.review.chapter` 和 `advisor.continue.light`。
- `useAdvisor` 支持动作对象输入，并保存最近的结构化 `advisorResults`。
- OpenClaw service 根据 `taskType` 注入任务指令和目标范围，服务端返回统一 `result` 外壳。

用户可感知：
- 顾问面板显示仍是文本建议，但后端已经能区分选区修正、段落修正、收线、体检和轻续写任务，为后续“应用修改”打基础。

最近验证：
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 写作页顾问动作接入

状态：部分完成

变更：
- `AdvisorPanel` 的快捷项支持动作对象，可配置禁用状态，同时兼容原来的字符串问题。
- 写作页顾问快捷项改为修正选中内容、修正当前段落、自动收线、章节体检、轻续一句。
- 写作页顾问请求会携带当前选区、当前段落、光标窗口、章节纲要和续写参考素材。
- 文本选区状态现在会随编辑器光标同步，选区类动作可按状态禁用。

用户可感知：
- 打开写作页顾问后，首先看到的是动作入口而不是泛泛问题。
- 未选中文本时，“修正选中内容”不可点击；选中文本后可直接让顾问针对选区给建议。

最近验证：
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 统一智能顾问入口收口

状态：完成

变更：
- 新增 `/api/advisor/advice` 统一顾问入口，前端 `useAdvisor` 改为单后端调用。
- `AdvisorPanel` 去掉 AI / OpenClaw 切换，只保留统一智能顾问标题和消息输入。
- 写作页、体验页、笔记页、诗歌页、散文页移除了页面级 `openclawAdvice()` 手写请求。
- 写作页 Copilot 默认自动触发关闭，改为弱补全模式。

用户可感知：
- 顾问面板不再显示后端切换按钮。
- 写作页不再在输入停顿后高频自动续写，只有显式触发时才会生成建议。

最近验证：
- `src/__tests__/advisorTaskService.test.js` 通过。
- `src/__tests__/useAdvisor.test.js` 通过。
- `src/__tests__/openclawService.test.js` 通过。
- `src/__tests__/useCopilot.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 工具链规划重构

状态：完成

变更：
- 将规划主语言从“诗歌页 / 散文页 / 体验页”改为“叙事创作工具链”。
- 新增编辑器与统一智能顾问专题。
- 明确后续主线为编辑器顾问、记忆收尾、统一分镜和信息架构收口。
- 补充 OpenClaw 前置边界、顾问结构化返回协议、记忆同步字段和 storyboard 缺失类型。

用户可感知：
- 短期界面不变；后续开发入口和优先级会按工具链阶段推进。

验证：
- 文档变更，未执行代码验证。

### 2026-05-26 - 文档精简

状态：完成

变更：
- 精简 `docs/PLAN.md`、`docs/README.md`、`docs/plan/*.md`。
- 将已完成事项标成完成，把当前推进点收敛到 `current-execution-plan.md`。
- 将本日志从长流水账压缩为里程碑表。

用户可感知：
- 后续继续开发前只需要先看 `docs/PLAN.md` 和 `docs/plan/current-execution-plan.md`，不用每次通读所有计划。

验证：
- `git diff --check` 通过

### 2026-05-26 - 生成服务收口

状态：完成

已完成：
- `sendChat()` 只允许 `api.js` 和 `generationRetry.js` 调用。
- `sendChatStream()` 只允许 `api.js` 和 `generationService.js` 调用。
- `runGenerationTask()` 已接入写作扩展、改写、Copilot、体验整理。
- `runGenerationStreamTask()` 已接入创作顾问和小说体验主生成。
- 诗歌工坊、散文随笔、世界书快速导入已改为通过专用 service 调用 `runGenerationTask()`。
- `experienceStore` 也已收口到 `runGenerationTask()`。
- 任务元数据 `taskType`、`promptVersion`、`attemptName` 已透传 API 层。

用户可感知：
- 界面操作基本不变。
- 生成日志能区分 `writing.copilot`、`advisor.review`、`narrative.init`、`narrative.continue` 等任务。
- 诗歌、散文和世界书导入的生成请求现在也会带上独立任务标签，方便排查和分析。
- 体验页和游戏对话链路也统一走任务化生成入口。

最近验证：
- `src/__tests__/generationFeatureServices.test.js` 通过。
- `src/__tests__/architectureGuard.test.js` 通过。
- `npm run build` 通过。

剩余：
- 无。

### 2026-05-26 - 体验素材闭环完成

状态：完成

已完成：
- 体验页速记、选段和“整理体验”可沉淀为素材。
- 写作页素材工作面板支持筛选、详情、批量处理。
- 素材可插入正文、作为续写参考、进入章节纲要、转成笔记、写入世界书、归档或拒绝。
- 章节纲要保存到当前章节 `outlineItems`，并参与 Copilot 上下文。

用户可感知：
- 在体验页整理素材后，到写作页点“素材”即可继续处理。
- 在写作页选素材点“续写参考”或“入纲要”，编辑器顶部会显示对应状态。

最近验证：
- `chapterOutline.test.js`、`useCopilot.test.js` 通过。
- `writingNotes.test.js` 通过。
- `npm run build` 通过。

### 2026-05-26 - 记忆系统主链路完成

状态：基本完成

已完成：
- 记忆默认作用域落地。
- 候选面板支持 scope 筛选、编辑、确认。
- 已确认记忆注入体验生成。
- mem0 同步和读取兜底接回。

用户可感知：
- 左下角记忆候选面板可以查看、编辑和确认记忆。
- 配置 mem0 后确认记忆会尝试同步；生成时可读回远端记忆兜底。

最近验证：
- `memoryCandidates.test.js`、`memorySync.test.js`、`useMem0Scope.test.js`、`gameStoreSession.test.js` 相关组合通过。
- `npm run build` 通过。

剩余：
- 记忆的更强语义去重和批量整理细化。

### 2026-05-25 至 2026-05-26 - 会话与世界书稳定完成

状态：完成

已完成：
- 会话运行态快照、保存、恢复、世界书绑定。
- 新建会话初始化和世界书选择提示多轮修复。
- 世界书上下文构建器、注入预览、常驻/高优先级条目。
- 世界书草稿通过素材收件箱确认入库。

用户可感知：
- 新建/切换会话时状态栏和上下文跟随当前会话。
- 世界书命中和注入内容可预览，草稿不会直接污染正式世界书。

最近验证：
- `gameStoreSession.test.js` 相关用例通过。
- `worldbookContext`、`worldbookDraftAssets` 相关用例通过。

## 已知风险

- 新会话初始化曾出现角色名复用，疑似缓存或旧上下文污染；后续碰初始化逻辑时优先复查 prompt、运行态快照和请求传参。
- OpenClaw 统一顾问依赖 Gateway 可用性；实现时必须给出明确错误和降级说明。
- 业务层已无直接 `runGenerationRetryPlan()` 调用，后续新任务不要绕开任务层。
- 统一分镜输出层已建立第一版 schema 和版本对象；后续导出和旧页面迁移不要绕过 `StoryboardDocument`。

## 以后追加格式

```md
### YYYY-MM-DD - 标题

状态：完成 / 进行中 / 回退

变更：
- ...

用户可感知：
- ...

验证：
- ...
```
