# 开发日志（精简版）

> 更新规则：这里只记录里程碑、影响范围、用户可感知方式、验证结果和已知风险。详细 diff 以 git 工作区为准，不再追加长流水账。

## 当前状态

| 模块 | 状态 | 关键结果 |
|------|------|----------|
| 会话与运行态 | 完成 | 会话运行态和全局资料拆分，新建/切换/保存/恢复已收口 |
| 世界书上下文 | 完成 | 上下文构建器、命中预览、常驻/高优先级条目、草稿入库已接入 |
| 素材中台 | 完成 | 素材存储、整理体验、写作消费、入纲要、续写参考、转笔记、入世界书已完成 |
| 统一生成任务层 | 完成 | 写作、Copilot、顾问、体验、诗歌、散文、世界书导入已接入；业务层已无 `runGenerationRetryPlan` 直连 |
| 编辑器与统一智能顾问 | 当前主线 | 计划保留 textarea，统一到 OpenClaw 顾问，弱化高频补全 |
| 记忆系统 | 收尾中 | 候选确认、scope 隔离、mem0 同步/读取、本地记忆注入已接入 |
| 统一分镜输出层 | 待启动 | storyboard schema、版本、导出校验尚未统一 |

## 最新里程碑

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
- 记忆去重、冲突策略、批量整理和更清晰的同步状态 UI。

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
- 统一分镜输出层尚未建立 schema，暂不要在旧结构上继续扩导出能力。

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
