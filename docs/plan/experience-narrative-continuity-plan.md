# 体验页叙事连续性与可读性计划

状态：待执行。日期：2026-08-13。归属：`G1.4 Experience Reading`、`G4.6 Narrative Context Runtime`。

## 1. 目标与结论

这轮不再把问题归因于单纯的 `maxTokens`。当前体验页的主要故障是生成语义、上下文尾部和提示词共同把每次续写塑造成一个独立的短场景：模型先重新起势，集中写一组复杂感官或动作细节，很快停在新的小钩子；下一次续写又重复同一结构。提高输出预算只能减少物理截断，不能自动改善故事连续性。

目标是让体验页稳定形成连续、可读的中文叙事：

1. 玩家输入后得到一个具有反应、发展和自然落点的完整叙事回合，而不是一两段“文学化小片段”。
2. “继续上一回复”真正延长上一条 assistant 正文，不伪造用户行动，不重新介绍场景。
3. 半自动推进形成有因果关系的叙事拍，在决策点、场景转折或安全上限处暂停，不以 900ms 周期无限制造短回复。
4. 长会话保留当前动作链、未完成台词、角色即时意图和场景位置，不只保留事件摘要。
5. 质量改进由固定中文场景、自动指标和真实 provider 人工 A/B 共同证明，不以“prompt 改得更长”作为完成依据。

## 2. 调研证据与根因

### 2.1 当前实现直接诱导短而密的输出

| 位置 | 当前行为 | 后果 |
|---|---|---|
| `src/services/agents/narrativeVoicePolicy.js` | 每段只承担一个推进；普通续写只推进一个小台阶 | 模型把每次调用理解为必须快速收束的微型段落 |
| `src/services/agents/narrativeAgentOrchestrator.js` | auto 模式要求“一个短小后果”“停在可回应事实” | 半自动天然生成大量碎片，而非连续段落 |
| `src/components/InputArea.vue` | 快捷继续要求“只推进一个可观察变化” | UI、turn note 和 system policy 三层重复强化短输出 |
| `src/pages/Experience.vue` | 半自动每约 900ms 再发一次同类隐藏提示 | 每轮重新构造 prompt、重新起势并再次收束 |

### 2.2 “继续”目前不是文本续接，而是隐藏用户回合

`gameStore.sendAction({ hidden: true })` 虽不显示消息，仍会：

- 向 `chatHistory` 写入一条 `user` 消息；
- 追加一个 `source: user` 的 runtime turn event；
- 让 Kernel 的 `latestUser` 变成“自动续写/继续”指令；
- 建立新的 assistant 消息和新的叙事回合。

连续半自动会快速积累相似的隐藏 user 消息。这些控制指令挤占最近历史，也让状态、记忆和分支把“系统要求继续”误认成玩家行动。

### 2.3 最近上下文保留了错误的一端

`narrativeKernel.compactMessages()` 只保留最近 4 条，每条截取前约 820 字。长回复最关键的结尾动作、最后一句台词和未完成落点反而被丢弃。`buildNarrativeTurnNote()` 再从这份已截头的文本计算“最后锚点”，可能锚定到回复中段。

最近对话目前作为 Kernel JSON 发送，而不是按 user/assistant 角色进入临时 transcript。模型需要先从一大块结构化数据中还原对话，再响应最后一条独立 user 指令，连续文本能力没有被充分利用。

### 2.4 scene summary 保存“发生过什么”，没有保存“正在如何继续”

启发式摘要主要提取剧情事件、玩家行动、实体、关键对白和未决线索；它缺少：

- 当前动作进行到哪一步；
- 最后说话人及对话是否等待回应；
- 人物在场位置、朝向和手中物；
- 当前局部目标与阻力；
- 最近已经使用过的意象和细节；
- 下一段必须承接而不能复述的句子或动作。

保留最近 4 条消息也不足以弥补这一点，尤其当其中混入隐藏继续指令时。

### 2.5 SillyTavern 可借鉴的是 continue 语义，不是整套聊天结构

本地 `SillyTavern/public/scripts/openai.js` 的 continue 路径会把待续的 assistant 内容移到聊天末端，追加简短 continue nudge；支持的 provider 还能使用 assistant prefill。它把 continue 定义为“延长上一条消息”，而不是开始一个新用户回合。

Pinax 应提炼这一点，但继续保留自己的 Kernel、工具证据、回合快照、结构化 marker 和玩家控制权。首版使用通用的尾部锚点与真实角色历史；assistant prefill 只有在 provider capability 明确支持且通过真实 Gate 后才启用。

## 3. 生成语义重构

新增统一的 `NarrativeGenerationIntent`，替代现在含混的 `init / continue / auto-advance` 字符串：

```text
respond
  触发：玩家提交可见行动或台词
  输出：新的 assistant message
  目标：完整叙事回合，回应玩家并推进一个有内部发展的 scene beat

extend
  触发：继续上一回复、模型 finish_reason=length、用户主动要求补完
  输出：追加到上一条 assistant message 的新 segment
  目标：从最后一句直接续接，不重述场景，不新增 user turn

advance
  触发：半自动在没有新玩家行动时推进
  输出：新的 assistant message；同一次 beat 内部允许有界 extend
  目标：推进 NPC、环境或既有因果，但不得替玩家作决定

open
  触发：新会话开场
  输出：新的 assistant message
  目标：建立可行动现场，不做世界观说明书
```

建议新增 `shared/narrativeGenerationIntentContract.js`，由 `InputArea`、`Experience`、`gameStore`、orchestrator、metrics 和联机请求共同使用。旧字符串只在会话读取边界归一化，不建立长期双轨。

## 4. 目标数据结构

### 4.1 ContinuityFrame

新增 `src/services/agents/narrativeContinuityFrame.js`，在每次生成前确定性构建低敏、可测试的连续性框架：

```text
ContinuityFrame
  sceneRef / place / time
  playerLastAction
  latestAssistantMessageId
  assistantTail          最后 500-900 字，必须保留正文尾部
  lastBlock              kind / speakerId / text
  pendingExchange        等待回应的说话人、问题或动作
  activeGoal             当前局部目标
  immediateObstacle      已确认的眼前阻力
  castPositions          仅在场角色及当前 place/status
  openThreads            最多 4 条正在活动的线索
  recentMotifs           最近两轮已使用的物件/声响/意象，防止无因果复写
  sourceRefs / revision
```

数据优先来自 presentation blocks、runtime state、turn records 和 confirmed facts。首版不增加额外 LLM 调用；无法确定的字段保持空值，禁止正则猜人物状态。

### 4.2 assistant message segments

为了让 `extend` 可回滚、可分支且不破坏旧消息，assistant message 增加可选 `segments[]`：

```text
segments[]
  id / turnId / intent
  rawContent / cleanContent
  createdAt / sourceRequestId
```

旧消息没有 `segments` 时，在首次 extend 时将现有正文包装为只读 base segment。`message.content` 和 `presentation` 始终由已提交 segments 拼接派生，现有渲染层仍读取一个 message，不出现新卡片或新说话人标签。

extension turn record 使用 `kind: extension`、`baseMessageId`、`segmentId`、`parentTurnId`，`userMessageIds` 为空。失败只删除 pending segment 并恢复 pre snapshot；分支切换按 segment 所属 turn 恢复，不允许一个 assistant message 的未提交尾部泄漏到其他分支。

## 5. 分阶段实施

### C0：固定基线与问题样本

**修改文件**

- `scripts/lib/narrative-gate-fixture.mjs`
- `scripts/narrative-production-smoke.mjs`
- `scripts/narrative-production-report.mjs`
- `src/__tests__/agentContracts.test.js`

**任务**

1. 新增 6 组连续叙事 fixture，每组 6-8 轮：双人持续对话、动作追逐、安静调查、多人现场、场景转移、长回复截尾。
2. 每组同时执行 `respond -> extend -> advance`，记录每轮输出字数、段落数、首句、末句、speaker、上一锚点和 finish reason。
3. 自动计算：短回合率、相邻开头相似度、末尾锚点命中、重复意象、无来源新专名、段落碎片率。
4. 保存当前真实 provider 输出作为 baseline；评测正文只进入 `/tmp` review artifact，不写入长期 metrics 或仓库。

**Gate**

- 能稳定复现“隐藏 continue 占据 history”“长回复只保留开头”“auto 连续短回复”三项问题。
- baseline 报告区分协议成功与叙事质量，不能再用成功率掩盖短碎输出。

### C1：生成 intent 与控制消息隔离

**新增文件**

- `shared/narrativeGenerationIntentContract.js`

**修改文件**

- `shared/experienceActionContract.js`
- `src/components/InputArea.vue`
- `src/pages/Experience.vue`
- `src/stores/gameStore.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/services/agents/narrativeProductionMetrics.js`
- `src/services/experienceSessionAdapter.js`
- `server/realtime/wsHandler.js`

**任务**

1. 将按钮、slash command、半自动和玩家输入统一映射为四种 intent。
2. `extend/advance` 控制指令不写入 `chatHistory`、runtime user event、玩家历史或记忆候选。
3. `respond` 仍保留可见 user message 和完整回合事务。
4. metrics 明确记录 `open/respond/extend/advance`，不再把 auto 归入普通 continue。
5. 联机只有房主执行 intent；成员提案仍只能产生 `respond`，不能远程触发房主无限 advance。

**Gate**

- 连续点击“继续”后 user 消息数、玩家行动事件数保持不变。
- 普通玩家输入的消息、事件、分支和在线广播行为不变。
- 旧会话与旧 action 字符串可一次归一化读取。

### C2：真实角色历史与 ContinuityFrame

**新增文件**

- `src/services/agents/narrativeContinuityFrame.js`

**修改文件**

- `src/services/agents/narrativeKernel.js`
- `src/services/agents/narrativeSceneSummary.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/services/contextCompression.js`
- `src/stores/gameStore.js`

**任务**

1. Kernel 的 recent 不再统一截前 820 字；普通历史使用头尾保留，最后 assistant 强制保留尾部。
2. 临时 transcript 以真实 role 放入最近 6-10 条 user/assistant 消息；Kernel 中只保留连续性元数据和引用，删除重复正文 JSON。
3. `extend` 把最后 assistant tail 放在 transcript 尾部，并追加一句短 nudge；不再附带多层“小步/短小”说明。
4. scene summary 升级为 `summary + continuity checkpoint`：长期摘要保存事实，ContinuityFrame 保存当前进行态，二者职责分离。
5. 手动上下文压缩必须保留当前 ContinuityFrame；未确认记忆仍不能升级为事实。

**Gate**

- 1200 字 assistant 回复的最后动作和最后台词完整进入下一轮上下文。
- 压缩前后 `pendingExchange`、当前地点、在场角色、局部目标和最后动作一致。
- transcript 不重复同时携带完整 recent JSON 和同一组 role messages。

### C3：从“微小片段”改为“完整叙事拍”

**修改文件**

- `src/services/agents/narrativeVoicePolicy.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/components/InputArea.vue`
- 世界书 writing style 注入边界

**任务**

1. 删除全局“每段只承担一个推进”“只推进一个小台阶”“宁可停在短促事实”等硬约束。
2. 新契约要求一个回合通常包含：承接 -> 人物/环境反应 -> 至少一次有因果的发展 -> 自然落点。它是结构目标，不要求固定四段。
3. 段落按语义组织：一个自然段可以包含相连动作与一句对白；不得每句话切 marker，也不得为了长度堆景物。
4. `respond` 默认目标约 450-1000 个中文字符，`extend` 约 250-700，`advance` 约 350-800；这些是评测区间，不是运行时硬凑字数。
5. 复杂度预算：普通回合最多引入一个必要的新现场细节；无已有因果时不得新增神秘人物、异响、密信、反转或专名。
6. 结尾允许自然停顿、完成一轮对话或形成明确行动条件，不强制每轮都留下悬念或玩家选项。
7. 世界书文风只控制词汇、视角和节奏，不得覆盖玩家控制权、连续性和复杂度预算。

**Gate**

- 同一场景连续三轮不再重复“重新描写环境 -> 复杂细节 -> 新钩子”的结构。
- 对话场景至少回应上一句的语义，不用动作描写回避回答。
- 安静场景允许低事件密度，但不能用无关感官清单填满目标长度。

### C4：同消息续接与原子提交

**修改文件**

- `src/stores/gameStore.js`
- `shared/narrativeTurnContract.js`
- `src/services/narrativePresentation.js`
- `src/components/GamePanel.vue`
- `src/components/experience/NarrativeTurn.vue`

**任务**

1. 实现 assistant `segments[]` 和派生正文。
2. extend streaming 写入 pending segment；完成后一次解析合并 presentation，避免 marker 接缝泄漏或 speaker 重复。
3. 状态提取、机制触发、内联事件和记忆候选只消费本次新 segment，但在最终聚合 message 上保留正确索引。
4. extension turn 与正文 segment、post snapshot、memory candidate IDs 原子提交。
5. 编辑整条消息时明确失效后续 segment revision；重生成与分支可从 base turn 或指定 extension turn 开始。
6. UI 仍显示连续正文；可在消息操作菜单中提供低调的“撤销本次续接”，不新增分段卡片或状态条。

**Gate**

- extend 成功后 assistant 消息数量不变，正文和平滑 marker 块增加。
- provider 失败、取消、刷新和分支切换均不留下半个 segment。
- 记忆与机制不会因聚合全文重复提取旧内容。

### C5：有界补全控制器

**修改文件**

- `src/services/agents/narrativeAgentOrchestrator.js`
- provider response normalization owner
- `src/stores/gameStore.js`
- `src/services/agents/narrativeProductionMetrics.js`

**任务**

1. 当 provider 明确 `finishReason=length` 时，在同一 request/turn 内自动执行一次 extend，并聚合为同一正文。
2. 正常 stop 但输出极短时，仅在同时满足“少于约 180 中文字符、没有完成回应、没有可辨认自然落点”时允许一次补全；纯短对白和用户明确要求简短不触发。
3. 每个 respond/advance 最多一次自动补全，总 token 和总时限仍受现有 Agent 上限控制。
4. 补全只要求完成当前动作链，不允许重写前文；第二次仍失败则提交已有有效正文并在 receipt 标记 `incomplete`，不无限抽卡。
5. provider 支持 assistant prefill 时先通过 capability 与真实渠道 Gate，再作为优化启用；首版通用路径不依赖它。

**Gate**

- 截断样本能合并为一条完整正文，工具调用和正文仍在同一 transcript。
- 正常短对白不会被强行扩写成长篇。
- 任意回合最多增加一次模型调用，取消信号能同时终止补全。

### C6：半自动节奏重做

**修改文件**

- `src/pages/Experience.vue`
- `src/components/InputArea.vue`
- `src/stores/gameStore.js`
- 现有 transient status 组件

**任务**

1. 删除“每 900ms 永久续一小段”的循环语义。半自动改为一次最多推进 2-3 个完整 beat。
2. 每个 beat 完成后检查暂停条件：出现玩家决策、直接向玩家提问、地点切换、机制通知、角色冲突升级、达到连续次数上限或用户开始输入。
3. 无暂停条件时等待阅读友好的间隔再 advance；不把等待状态渲染成新消息。
4. 用户输入、Esc、停止按钮、失去房主权限或页面切换立即取消后续调度和正在进行的补全。
5. 按钮文字仍保持简洁，但 tooltip 和无障碍名称区分“继续上一段”与“半自动推进”。

**Gate**

- 半自动不会无限运行，不会每秒制造新消息。
- 用户开始输入后不再抢跑下一轮。
- 连续 beat 之间地点、人物、动作链保持一致，并在明确决策点停下。

### C7：质量评测、真实 provider A/B 与发布

**修改文件**

- `scripts/lib/narrative-gate-fixture.mjs`
- `scripts/narrative-production-smoke.mjs`
- `scripts/narrative-production-report.mjs`
- `scripts/narrative-release-gate.mjs`
- `docs/STATUS.md`、`docs/LOG.md` 和用户手册相关段落

**自动指标**

- `shortTurnRate`：非明确短答场景中，少于 240 中文字符的回合比例。
- `openingSimilarityRate`：相邻 assistant 开头 80 字的字符 3-gram/Jaccard 高相似比例。
- `tailAnchorCarryRate`：上一轮末尾人物、动作或台词在下一轮得到回应的比例。
- `fragmentedParagraphRate`：大量单句短段或每句一个 marker 的比例。
- `unexplainedNoveltyRate`：不在输入、Kernel 或工具证据中的新专名/神秘事件比例。
- `playerAgencyViolationRate`：替玩家决定、行动或总结心理的比例。

**人工标注维度**

每条 1-5 分：因果连续、角色声音、信息密度、段落节奏、细节必要性、自然落点、整体可读性。标注时同时展示 baseline 与新版本，隐藏版本名。

**发布阈值**

1. 三类已配置真实渠道分别完成至少 12 组多轮场景；不配置的渠道明确记为未验收。
2. `shortTurnRate <= 10%`，`openingSimilarityRate <= 8%`，`fragmentedParagraphRate <= 10%`。
3. `tailAnchorCarryRate >= 90%`，玩家控制权违规为 0。
4. 人工连续性和可读性平均分相对 baseline 至少提升 0.8，且任一渠道不退化超过 0.3。
5. P95 延迟增长不超过 35%，平均模型步骤不超过 baseline + 0.6；有界补全不能成为每轮常态。
6. `verify:full`、1440/390 浏览器审计、取消/重生成、双浏览器房主权威和 20 轮刷新恢复均通过。

## 6. 测试控制

本计划不恢复此前被删除的大量 exact-shape 测试。优先扩展：

- `agentContracts.test.js`：intent、transcript 顺序、ContinuityFrame、一次补全；
- `gameStoreSession.test.js`：隐藏控制不入历史、segment 原子提交、刷新与分支；
- `onlineRoom.test.js`：成员权限和房主 intent 广播；
- 现有 UI audit：输入接管、停止和窄屏布局。

如现有文件无法清楚表达 segment 状态机，最多新增一个 `narrativeContinuityContract.test.js`。新增断言应替换低价值重复断言，测试总量不因本计划无控制增长。

## 7. 回滚策略

1. C1-C3 可通过单一 feature flag 回退到旧 prompt，但旧隐藏 user 写入不得恢复。
2. C4 上线前备份 schema 不升版；`segments` 是消息可选字段，关闭功能后仍可由聚合 `content` 正常读取。
3. 自动补全、半自动多 beat 和 provider prefill 分别独立开关，出现延迟或兼容问题时单独关闭。
4. 每阶段先在本地 fixture 与一个真实 provider 验证，再进入全部 provider；不一次同时改 prompt、事务、摘要和 UI 后才定位问题。

## 8. 非目标

- 不建立多 Agent 编剧团队或后台无限自主故事。
- 不让 LLM 直接改世界书、确认记忆或写核心 runtime state。
- 不用固定字数、固定四段式或强制悬念制造另一种模板化。
- 不照搬 SillyTavern 的全部 prompt manager、采样参数和消息 UI。
- 不在这一轮重做体验页视觉风格；只处理与连续生成、停止和同消息续接直接相关的交互。

## 9. 推荐执行顺序

```text
C0 基线
 -> C1 intent 与控制隔离
 -> C2 ContinuityFrame / transcript
 -> C3 完整叙事拍
 -> C4 同消息续接事务
 -> C5 有界补全
 -> C6 半自动节奏
 -> C7 真实渠道 A/B 与发布
```

C1-C3 是首个可用切片，应一起完成后交给用户体验；C4 涉及消息与分支事务，单独验收；C5-C7 在前两者稳定后推进。不能先继续提高 token 或添加更多文风禁句，因为那会掩盖而非解决错误的生成语义。
