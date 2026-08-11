# Pinax 体验页酒馆能力对齐计划（审阅修订版）

> 日期：2026-08-11
> 状态：完成事实审计，等待按阶段执行
> 归属：从属于 `G1.4 Experience Reading` 与 `G4.6 Narrative Context Runtime`，不是新的产品主线
> 说明：目录名沿用现有文档位置，本计划不依赖 Superpowers、brainstorming 或外部 skill 工作流。

## 1. 审阅结论

原计划有可取的参考资料，但不能直接执行。主要问题不是任务不够细，而是把“体验页对齐”扩张成 60 个跨产品模式，并把大量 contract、store 和孤立组件当成完成结果。

原计划存在以下核心错误：

1. **范围失控**：插件市场、通用 provider registry、Story Bible、Universe、写作 Quick Edit、边注、TTS、Onboarding 等不属于体验页当前缺口。
2. **重复建设**：Pinax 已有 SSE step stream、AbortController、停止/重试、有限工具循环、重复调用阻断、typed error、ContextLedger、世界书预算、联机房主权威、备份恢复和多 provider adapter。
3. **空壳交付**：多个任务只创建 component/store/contract，不接入 `Experience.vue`、`gameStore` 或叙事运行时，用户最终看不到能力。
4. **错误优化**：叙事工具 cache 在每个生成回合重新创建，当前 `Map` 不会跨会话无限增长；为它引入 `lru-cache` 解决不了真实问题。流式期间也没有逐 chunk 保存会话，因此“debounced session save”缺少事实依据。
5. **状态不一致风险**：当前 `regenerateFrom()` 会截断消息并重新生成，但没有以同一事务回滚地点、人物、时间、记忆候选和运行时事件。这比增加 60 个表层模式更优先。
6. **测试策略失控**：原计划约新增 55 个文件，并为每个字段新建测试文件，会扩大已经较重的验证基线，也不利于验证端到端行为。
7. **错误理解参考项目**：SillyTavern 的价值不在于复制所有按钮，而在于可检查的上下文、可恢复的回合、清晰的人物身份、按需激活的世界信息，以及生成失败时不丢失用户控制。

因此，本计划不再按“来源项目数量”组织，而按 Pinax 的真实用户流程和数据所有权组织。

## 2. 调研依据

### 2.1 本地事实

- 本地 SillyTavern：`/home/recoletas/jiuguan/SillyTavern`，版本 `1.17.0`，提交 `004f1336e`（2026-03-30）。
- 工具注册参考：`SillyTavern/public/scripts/tool-calling.js`。
- 世界信息参考：`SillyTavern/public/scripts/world-info.js`。
- 群组回复参考：`SillyTavern/public/scripts/group-chats.js`。
- 提示词与 Author's Note 参考：`SillyTavern/public/scripts/openai.js`、`authors-note.js`。
- 聊天分支、检查点和消息操作参考：SillyTavern chat/message 管理代码。

### 2.2 官方资料

- [SillyTavern Function Calling](https://docs.sillytavern.app/for-contributors/function-calling/)
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)
- [SillyTavern Author's Note](https://docs.sillytavern.app/usage/core-concepts/authors-note/)
- [SillyTavern Group Chats](https://docs.sillytavern.app/usage/core-concepts/groupchats/)
- [SillyTavern Chatting](https://docs.sillytavern.app/usage/chatting/)
- [SillyTavern Prompt Manager](https://docs.sillytavern.app/usage/prompts/prompt-manager/)

### 2.3 取舍原则

吸收：

- 用户能知道本轮 AI 使用了什么事实与指令。
- 重新生成、编辑和分支不会破坏原回合，也不会留下幽灵状态。
- 角色身份在长叙事中稳定、可检查、可手动干预。
- 世界信息按任务与当前场景激活，有预算、有来源、有确定性。
- 失败、取消、重连和长会话恢复都能回到明确状态。

不照搬：

- 不复制酒馆的面板密度、头像墙、每条消息常驻按钮和完整 STscript。
- 不恢复 eager 全量世界书注入。
- 不允许插件在浏览器中任意访问 DOM、存储和内部 API。
- 不把作者指令做成任意 role/depth 的底层 prompt 编辑器。
- 不把联机玩家、故事角色和 Agent 工具混成同一“群聊成员”。
- 不为了“对齐”重新实现已经存在的 SSE、provider adapter、记忆后端或备份格式。

## 3. 当前能力矩阵

| 能力 | 当前事实 | 判断 |
|---|---|---|
| 单 transcript 工具循环 | 已有四个只读工具、typed repair、grounding、重复调用阻断 | 保留，不重写 |
| 生成状态 | 已有 `NarrativeAgentStatus`，显示核对、查阅、续写、失败与重试 | 增强具体来源，不建 kernel pill |
| 流式与停止 | 已有 SSE step stream、placeholder、AbortController、迟到结果隔离 | 只补浏览器行为验收 |
| 世界书上下文 | 已有 constant/selective、关键词扫描、预算、来源预览 | 激活语义仍不完整 |
| 提示词查看 | `InputArea` 已显示上下文、世界书、历史、系统概览 | 缺少按回合回执和差异 |
| 重新生成 | `regenerateFrom()` 会破坏性截断后续消息 | P0 风险 |
| 编辑/删除 | 能修改消息并重建 chat history | 缺少运行时状态回滚 |
| 分支/候选回复 | 运行时事件已有 branch 概念，消息层没有稳定分支模型 | 核心缺口 |
| 角色区分 | presentation v3 能标注 speaker，体验页可选单个 dialogue character | 缺少稳定 cast 与 speakerId |
| 联机 | URL 房间、房主唯一生成、有序事件与状态广播已存在 | 不等同于 NPC 群聊 |
| 记忆 | 已有候选、作用域、来源引用与 Mem0 配置 | 不建第二套 vector store |
| 备份 | 已有版本化 Pinax 备份、预览和原子恢复 | 回合级检查点仍不足 |
| 长会话性能 | 已有压缩和有限上下文；流式逐 chunk 更新正文 | 先测量，再决定 batching/virtualization |

## 4. 目标体验

用户在体验页完成一轮操作时，应形成以下闭环：

```text
输入行动 / 指定角色 / 写本轮导演注
                ↓
建立不可变 turn request 与 pre-turn runtime snapshot
                ↓
Agent 按需查世界书、地理、历史、记忆
                ↓
低干扰状态显示真实阶段，不显示思维链
                ↓
流式生成正文并形成 turn receipt
                ↓
正文、运行时变化、记忆候选作为一个 turn transaction 提交
                ↓
用户可编辑、重试、建立候选或从此处分支
                ↓
切换分支时正文与运行时状态同步恢复
```

## 5. 不可破坏的架构约束

1. 世界书、地图、历史、记忆和运行时状态仍由现有 store/service 持有；模型只有只读工具权限。
2. 最终正文继续来自同一 provider transcript，不恢复“先检索再另起一次正文请求”。
3. 每个生成回合只有一个 `requestId`、一个输入 revision 和一个提交事务。
4. 任何消息编辑、删除、重试、候选切换和分支切换，都必须处理对应的 runtime snapshot。
5. 主题2继续使用连续叙事阅读面，不改成聊天气泡墙。
6. 主题1只做共享行为回归，不进行视觉重设计。
7. 联机房间只广播低敏状态和已提交结果；API key、完整 prompt、工具参数和隐藏推理不离开房主。
8. 不创建第二个输入栏、第二个消息 store、第二个 Agent 状态机或第二个记忆向量库。
9. 新 UI 必须接入现有组件并在真实路由可达；“组件已创建但未挂载”不算完成。
10. 默认功能保持克制，高级控制收进现有输入区选项和回合详情。

## 6. 执行阶段

### R0：冻结事实基线与失败样本

**目标**：先证明真正的问题，不以新增组件数量作为进度。

任务：

1. 固定六类体验 fixture：空会话、常规会话、长会话、工具调用、流式失败、联机会话。
2. 增加包含地点变化、角色状态、记忆候选和机制触发的三轮事务 fixture。
3. 记录以下现状：
   - 编辑第 N 条消息后，后续 runtime state 是否残留；
   - 从第 N 条重生成后，旧事件、记忆候选和当前位置是否残留；
   - 取消、失败、刷新后是否留下 streaming placeholder；
   - 同一回合实际命中的世界书条目、工具证据和预算；
   - 100、300、800 条消息时的滚动、首 token 展示和 chunk 更新开销。
4. 把每个问题归类为数据一致性、运行时、交互、视觉或性能问题。

门禁：

- 至少有一个自动化 fixture 能稳定复现 destructive regenerate 的状态不一致。
- 性能优化必须有 PerformanceObserver、浏览器 trace 或可重复时间数据，不接受主观“感觉慢”。
- 不新增业务能力。

### R1：回合事务、检查点与非破坏性重试（P0）

**目标**：先解决体验页最危险的状态一致性问题。

候选文件：

- `shared/narrativeTurnContract.js`（新增）
- `src/stores/gameStore.js`
- `src/services/runtimeEvents.js`
- `src/services/runtimeEventCausality.js`
- `src/components/experience/NarrativeTurn.vue`
- `src/components/GamePanel.vue`

数据结构：

```text
NarrativeTurnRecord
  id / requestId / parentTurnId / branchId
  inputRevision / worldRevision / resourceRevision
  userMessageIds / assistantMessageIds
  preRuntimeSnapshotRef / postRuntimeSnapshotRef
  candidateIds / activeCandidateId
  status / createdAt / committedAt
```

任务：

1. 在请求 provider 前保存轻量 `preRuntimeSnapshot`，覆盖当前位置、时间、角色状态、关系、canonical facts、目标、key choices、运行时事件游标和记忆候选游标。
2. 将正文、runtime delta、机制触发和记忆候选包装为同一 turn transaction；正文成功但状态提交失败时不得留下“半成功”回合。
3. 将 `regenerateFrom(index)` 改为创建同一父回合的 sibling candidate，而不是立即销毁旧正文。
4. 用户切换候选时：
   - 恢复该候选对应的 post snapshot；
   - 将其后代回合标记为另一分支，不静默删除；
   - 重新建立 chat history 和 ContextLedger cursor。
5. 编辑或删除历史消息时先显示影响范围：正文、地点、人物、事件和记忆候选。
6. 建立检查点和“从此处分支”，分支保存消息与 runtime snapshot；返回父分支时完整恢复。
7. snapshot 采用增量 delta + 周期性完整检查点，限制 localStorage 增长；配额不足时拒绝创建新分支并保留当前会话。
8. 联机只允许房主创建和切换权威叙事分支；成员收到新的 branchId、turnId 和 committed snapshot 摘要。

门禁：

- 重试不会丢失旧回复，候选之间可来回切换。
- 编辑第 3 轮后，第 4 轮以后产生的地点、人物和记忆状态不会残留在新分支。
- 刷新后活动分支、候选和运行时状态一致。
- 联机成员不会出现正文属于分支 B、运行时状态仍属于分支 A 的情况。
- 分支写入失败不会覆盖最后一个可恢复会话。

### R2：本轮导演注与上下文回执（P0）

**目标**：吸收 Author's Note 与 Prompt Inspector 的价值，但不开放任意底层 prompt 拼装。

候选文件：

- `shared/narrativeDirectorNoteContract.js`（新增）
- `src/services/agents/narrativeKernel.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/stores/gameStore.js`
- `src/components/InputArea.vue`
- `src/components/experience/NarrativeTurn.vue`
- `src/components/experience/NarrativeAgentStatus.vue`

导演注产品模型：

- **仅下一轮**：成功提交或明确取消后消费；失败重试仍保留。
- **当前场景**：地点、时间段或分支变化时失效。
- **当前会话**：持续生效，用户主动关闭。
- 默认最多 800 字，不支持执行脚本和任意 system/user/assistant role 注入。

固定优先级：

```text
安全与渠道约束
> 已确认世界规则 / 禁写边界 / canonical facts
> 当前行动与场景事实
> 用户导演注
> 文风与最近正文样本
```

任务：

1. 在现有输入区选项中加入“本轮导演注”，不增加常驻大面板。
2. 导演注作为显式 kernel block，记录 scope、revision、chars 和是否命中；不得覆盖 canonical fact。
3. 为每个已提交回合建立低敏 `TurnReceipt`：
   - kernel/version revision；
   - 使用的导演注 scope；
   - 命中的世界书 entry IDs 和预算；
   - 工具名称、成功/失败、证据 refs；
   - scene summary revision；
   - provider/model 枚举、耗时和 token 汇总；
   - 不保存 API key、Base URL、完整系统 prompt 和隐藏 reasoning。
4. 扩展现有提示词详情，不新建重复 Prompt Inspector。默认显示结构化回执；开发模式才允许看脱敏 block 内容。
5. “与上一轮比较”做 block manifest diff，而不是对完整 prompt 字符串做 DiffMatchPatch。
6. `NarrativeAgentStatus` 在真实工具事件到达时显示“查阅世界书/地图/历史/记忆”，结束后折叠为一条回执，不列出模型参数。

门禁：

- 用户能回答“为什么这一轮知道这个事实”和“本轮导演注是否生效”。
- 导演注失败重试不丢失，成功后一次性注释不会重复进入下一轮。
- 回执不包含密钥、完整隐藏 prompt 或 reasoning。
- 世界规则与导演注冲突时，正文遵守世界规则，并在回执中标记冲突。

### R3：世界书激活语义收口（P1）

**目标**：让导入字段和实际检索行为一致，提升可解释性，而不是复制世界书所有高级开关。

候选文件：

- `src/services/worldbookContextBuilder.js`
- `src/services/agents/narrativeResourceIndex.js`
- `src/services/agents/tools/worldLookup.js`
- `src/stores/worldStore.js`
- 世界书条目编辑组件

任务：

1. 定义 Pinax 原生激活模式：
   - `constant`：仅规则、文风、禁写等允许常驻；
   - `keyword`：主关键词任一命中；
   - `selective`：主关键词命中，且次关键词满足 any/all 条件；
   - `bound`：由 placeId、characterId、historyId 或 sourceRef 直接绑定。
2. 为拉丁文本提供 `caseSensitive` 与 `wholeWord`；中文默认短语匹配，不暴露无意义的大小写选项。
3. 任意 JavaScript regex 暂不进入默认运行时。只有在采用可中止 worker 或 RE2 类安全执行器并建立长度/耗时门禁后，才开放兼容 regex。
4. 导入的 `probability`、`cooldown`、`depth` 等字段必须二选一：
   - 显式映射到 Pinax 可验证语义；或
   - 标记为兼容保留、运行时不生效。
   禁止 UI 显示已支持但 builder 实际忽略。
5. 不实现 `min-activations` 强行补足无关条目。无命中时只允许类型受限、数量受限的 starter 条目，并在回执中说明。
6. 对同组冲突条目执行确定性选择：confirmed 优先于 draft，绑定证据优先于文本命中，新 revision 不能静默覆盖 canonical fact。
7. 递归激活最多一轮，只允许已命中条目的显式 relation 引出相关条目；禁止用生成内容继续无限扫描。
8. 世界书预览显示“为何命中、为何未进入预算、是否 stale/conflict”，并与真实工具索引使用同一 matcher。

门禁：

- 相同 seed、会话和资源 revision 得到相同命中顺序。
- UI 中每个激活字段都能在 builder 中找到真实行为。
- 无命中时不会为了满足数量而注入无关人物或地点。
- 恶意长关键词、无效兼容 regex 和冲突条目不能阻塞生成。

### R4：场景角色编排，而不是照搬群聊（P1）

**目标**：解决“当前是谁在说话、为什么由他回应、多人场景身份容易混淆”，同时保持连续叙事阅读。

候选文件：

- `shared/narrativeCastContract.js`（新增）
- `src/services/agents/narrativeKernel.js`
- `src/services/agents/narrativeVoicePolicy.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/stores/gameStore.js`
- `src/components/experience/NarrativeTurn.vue`
- 现有角色/现场索引组件

角色模型：

```text
SceneCastMember
  characterId / displayName / aliases
  sourceRef / present / muted
  role / talkativeness / lastSpokeTurnId
  knowledgeRefs / relationshipRefs
```

首版模式：

- **导演选择**：结合当前场景、点名、目标、关系和最近发言确定本轮 speaker 候选。
- **手动点名**：用户强制指定一个在场角色回应。
- **旁观**：角色留在场景中，但不主动发言。

任务：

1. 从 confirmed 人物条目、当前位置参与者和 runtime character state 构建 scene cast，不从正文正则临时发明角色。
2. 每个 dialogue block 保存稳定 `speakerId`，`speakerName` 只作显示快照；改名后仍能追溯同一角色。
3. 一个 provider step 只给一个主 speaker 的完整角色卡；其他角色只提供受预算限制的场景参与摘要，避免人格合并。
4. 多人同轮对白允许 presentation v3 输出多个 speaker block，但每个 block 必须映射到 scene cast；未知 speaker 降级为未确认，不写入人物状态。
5. 手动点名入口放在现有现场索引或输入区附件菜单，不增加横向角色按钮墙。
6. 自动模式必须记录 speaker selection reason，例如点名、目标相关、关系冲突、上轮回应。
7. 联机人类成员与 NPC scene cast 使用不同 contract；玩家昵称不能自动成为 NPC 角色卡。
8. 暂不实现 SillyTavern 的 List/Pooled 连续多请求模式。只有真实多人跑团表明需要逐角色独立生成时，再评估调用成本和顺序控制。

门禁：

- 两名角色连续对话时，speakerId 不因别名或模型措辞漂移。
- 手动点名只影响当前回合，不永久改变角色权重。
- 不在场或 muted 角色不会因普通背景提及频繁抢答。
- 联机玩家身份、NPC 身份和叙事工具身份完全分离。

### R5：记忆候选、压缩与恢复对齐（P1）

**目标**：复用现有记忆 owner，提高可控性与追溯性，不再建立第二套向量数据库。

候选文件：

- `server/services/memoryService.js`
- 现有 memory candidate/store/service
- `src/services/agents/tools/memoryLookup.js`
- `src/stores/gameStore.js`
- 现有记忆候选 UI

任务：

1. 记忆写入继续采用候选制；AI 回复不能直接把大段正文写入长期记忆。
2. 候选保存：精简事实、scope、sourceRef、turnId、speaker/place/time、confidence、revision 和提取方式。
3. 对话记忆只保留“谁对谁说了什么关键事实/承诺/冲突”，不保存整段台词。
4. 上下文压缩生成 scene summary 时，只消费已确认事实、当前活动线索和必要的最近回合，不把未确认候选升级为事实。
5. memory lookup 返回 provenance、conflict、stale 和 eligibleEvidence；最终正文只能把 eligible 项作为 required grounding。
6. 分支切换时，分支后产生的 session memory candidate 随 turn transaction 隔离；project memory 不自动回滚，但必须保留来源分支并在冲突时暂停使用。
7. 备份继续使用现有 `backupExport`；只将 turn/checkpoint、branch metadata 和 memory revision 纳入现有 schema，不创建独立 chat backup 格式。
8. Mem0 或本地检索不可用时返回 typed unavailable，不静默改用大段全文扫描。

门禁：

- 新增记忆候选的正文长度受控，且每条都有 turn/sourceRef。
- 分支 A 的未确认记忆不会污染分支 B。
- 压缩前后关键人物、地点、承诺和未决线索保持一致。
- 记忆服务失败不阻止轻叙事，但 required fact 请求会明确失败或降级提示。

### R6：输入动作与高级控制收口（P2）

**目标**：提供少量高频快捷操作，不引入完整 STscript 或第二套命令语言。

任务：

1. 先定义 typed `ExperienceAction`，所有按钮、快捷键和文本命令调用同一 action dispatcher。
2. 首批动作仅包括：
   - 停止当前生成；
   - 重试当前回合；
   - 继续上一回复；
   - 从当前回合建立分支；
   - 设置仅下一轮导演注；
   - 手动点名角色；
   - 压缩当前上下文；
   - 导出当前会话。
3. 文本命令仅作为上述 action 的快捷别名，不允许任意脚本、循环、变量和 DOM 操作。
4. 输入以 `/` 开头时显示小型建议菜单；普通中文输入不被 parser 截获。
5. destructive action 必须二次确认或提供可撤销结果；联机成员不能执行房主专属动作。
6. `Escape` 继续优先停止生成或关闭当前 transient layer；快捷键在输入法组合和 textarea 编辑时不得误触发。

门禁：

- 按钮、快捷键和命令得到相同 action receipt。
- 不存在 `/retry` 返回 stub 但没有实际重试的情况。
- 中文输入法、移动端和联机成员权限通过浏览器 smoke。

### R7：有证据的性能与可访问性优化（P2）

**目标**：只修复测量确认的瓶颈。

任务：

1. 如果 provider chunk 频率造成每秒大量 Vue 更新，则在现有 `onChunk` 边界按 `requestAnimationFrame` 合并渲染；完整原始文本仍在内存累计，不能丢 chunk。
2. 只有 300/800 消息 fixture 出现可重复长任务或滚动卡顿，才引入窗口化；窗口化必须保留：
   - 当前阅读锚点；
   - 文本选择与复制；
   - 屏幕阅读器可访问的当前回合；
   - 搜索/定位历史消息。
3. modal/sheet 继续复用现有 transient-layer 协调、Escape 和焦点归还，不新建另一套 focus trap。
4. 首个本地状态应在提交后立即可见；首 token 指标区分 UI 响应、provider 首事件和首正文，不用 skeleton 掩盖真实慢请求。
5. provider-specific prompt cache 只在真实渠道数据证明收益后分别接入，不向不支持的渠道发送未知字段。
6. 生成完成后释放 turn registry、AbortController 和临时 transcript；通过 heap snapshot 判断是否存在真实保留链。

门禁：

- 100/300/800 消息基线都有前后对照。
- chunk batching 不改变最终文本、presentation block 和停止语义。
- 200% zoom、390px、键盘和 reduced-motion 下核心回合操作可达。
- 不以新增依赖或组件数量代替性能结果。

## 7. 删除或延期的原计划任务

### 直接删除

- Agent task `MODULE_NAME` 排序。
- 每服务一份 manifest 的插件架构。
- 通用 extension marketplace。
- 新建 provider registry。
- 新建 vector store。
- 新建 Story Bible / Universe store。
- 体验页写作 Quick Edit、Margin Feedback、Prose Augmentation。
- 独立 kernel status pill、breadcrumb 和 advisor command palette。
- 独立 autosave/reminder 与第二套 project file contract。
- `shepherd.js` onboarding。
- `cmdk`、`lru-cache` 的无证据引入。
- 未接线的 `ExperienceInputBar`、Plan/Act toggle、UserRulePrompt 等空壳。

### 已有能力，不重复实现

- SSE step stream。
- AbortController 停止与迟到结果隔离。
- stream failure typed error 与 retry。
- tool loop guard、repair budget、grounding policy。
- provider capability probe 与多 adapter。
- 世界书 token budget 和上下文预览。
- Pinax 版本化备份。
- 联机房主唯一生成和状态广播。

### 延期到真实需求出现

- 完整 STscript 或任意 slash 脚本。
- 多角色 List/Pooled 连续调用。
- TTS。
- 任意 JavaScript regex 世界书触发。
- 全量消息虚拟化。
- provider prompt cache。
- 自动学习用户规则并提升为永久系统规则。

## 8. 测试预算

不再采用“一个模式一个测试文件”。优先扩展现有测试：

- `agentContracts`：导演注、turn receipt、工具状态和隐私字段。
- `gameStoreSession`：turn transaction、候选、分支、刷新恢复和失败回滚。
- 现有 worldbook 测试：激活模式、预算、冲突和确定性排序。
- `onlineRoom`：房主分支权威、成员同步和失权恢复。
- 现有 visual fixture：1440、760、390 的输入区、回合菜单和上下文回执。

允许新增的独立测试文件最多两个：

1. `narrativeTurnContract`，因为它是新的跨 store 原子边界。
2. `experienceActionContract`，仅在 R6 实施时新增。

其他断言必须并入现有参数化测试，或者替换重复的 exact-shape 测试。执行每个阶段时记录实际测试总数，不沿用原计划错误的“固定 200 项”描述，也不无控制扩张。

## 9. 分阶段验收矩阵

| 阶段 | 自动化 | 浏览器 | 真实 provider | 双浏览器联机 |
|---|---|---|---|---|
| R0 | 必须 | 必须 | 可选 | 可选 |
| R1 | 必须 | 必须 | 不需要 | 必须 |
| R2 | 必须 | 必须 | 必须 | 抽查 |
| R3 | 必须 | 必须 | 必须 | 不需要 |
| R4 | 必须 | 必须 | 必须 | 必须 |
| R5 | 必须 | 必须 | 必须 | 抽查 |
| R6 | 必须 | 必须 | 不需要 | 必须 |
| R7 | 必须 | 必须 | 必须 | 抽查 |

每阶段共同 Gate：

1. `npm run verify:full` 通过。
2. `git diff --check` 通过。
3. 不启动或重启用户已有 dev server。
4. 主题2完成 1440/390 审计，主题1只做共享行为回归。
5. 新能力在真实 `/experience` 路由可达，不接受孤立 story/demo 作为完成证据。
6. 失败路径有 typed error、可恢复状态和明确 owner。

## 10. 实施顺序

推荐顺序：

```text
R0 基线
  → R1 回合事务与分支
  → R2 导演注与上下文回执
  → R3 世界书激活语义
  → R4 场景角色编排
  → R5 记忆与恢复
  → R6 输入动作
  → R7 性能与可访问性
```

不能并行的部分：

- R1 与任何会修改 `gameStore` 回合生命周期的任务。
- R2 与 R3 的 receipt/matcher owner。
- R4 与 presentation speaker contract。
- R5 与分支 snapshot schema。

可以在 R1 稳定后并行的部分：

- R3 世界书 matcher 与 R4 cast contract，前提是分别拥有文件。
- R6 action parser 与 R7 只读性能基线。

## 11. 完成定义

计划不是以“60 个模式全部加入”为完成标准，而是以下五件事同时成立：

1. 历史回合可重试、编辑、切换候选和分支，正文与运行时状态始终一致。
2. 用户能控制本轮叙事方向，并能查看 AI 实际使用的世界信息和工具证据。
3. 多人物场景有稳定角色身份，手动点名和自动选择都可解释。
4. 记忆、压缩、刷新和联机不会把旧分支或未确认候选误当成当前事实。
5. 长会话性能优化有数据支持，并且没有破坏连续中文阅读、选择复制和可访问性。

达到以上条件后，Pinax 才算吸收了 SillyTavern 的核心体验优势，而不是在现有界面上堆叠一批来源不同的按钮。
