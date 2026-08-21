# 体验叙事规划与正文阶段隔离设计

## 背景与问题

体验页的正式叙事链要求模型先提交结构化 BeatPlan，再查询资料并写正文。当前实现让这些步骤共用一份 transcript。结果是正文请求中持续存在：

- `submit_narrative_beat_plan` 工具名与工具说明；
- BeatPlan 的 assistant tool-call、tool result 和修复消息；
- “计划已确认”“写到这个状态就停下”等控制话语。

这不是单纯的提示词服从问题。模型在写正文时仍能看到这些高频控制词，因此会把它们仿写进可见文本，形成“提交本轮叙事拍计划”或“故事在这里自然停下，等待下一步行动”等泄漏。对最终正文做正则删除只能覆盖已知表面句式，还可能误删合法叙事，不能解决信息边界错误。

## 目标

1. open、respond、advance 仍必须先生成并校验 BeatPlan。
2. BeatPlan 工具协议、调用历史、修复对话不得进入正文阶段 transcript。
3. 正文阶段只接收经过裁剪的场景约束和只读资料工具。
4. `endCondition` 必须是场景内可观察状态，不能描述“故事结束”或“等待玩家下一步”。
5. 最后一句落在场景内的动作、台词或事实，不评价故事结构。
6. 不新增正常路径上的模型调用，不引入默认正文后处理或二次重写。
7. 保留资料预算、补全、取消、超时、usage 汇总、trace 和 SceneThread 写回语义。

## 非目标

- 不增加 RLHF、偏好模型或在线训练链。
- 不接入实验性的真实性局部编辑器。
- 不扩大人工评测矩阵。
- 不修改体验页 UI、世界书结构或 provider 配置。
- 不承诺杜绝所有机器腔；本次只关闭已确认的控制协议泄漏和元叙事结束诱因。

## 方案选择

采用“结构化规划阶段 + 干净正文阶段”的双 transcript 设计。

没有采用以下方案：

- 最终输出正则清洗：无法覆盖未知变体，且可能误伤故事正文。
- 发现泄漏后整段重试：增加延迟和费用，仍把污染上下文交给模型。
- 另起独立规划模型：增加配置、调用与一致性成本，当前没有必要。

## 架构

### 1. 规划阶段

`runNarrativeAgentLoop` 在需要规划的 intent 下先创建专用 planner transcript。该 transcript 包含 Kernel、真实会话历史、当前用户输入和规划字段要求，但只声明 `submit_narrative_beat_plan` 一个工具。

调用时按 provider 协议强制选择这个具体工具：

- Anthropic/MiniMax Anthropic-compatible：`{ type: 'tool', name }`
- OpenAI Responses：`{ type: 'function', name }`
- OpenAI Chat-compatible：`{ type: 'function', function: { name } }`

同时关闭并行工具调用，规划阶段不启用 thinking。官方接口均支持强制指定工具；仓库现有结构化生成与能力探测也已经使用相同形状。[OpenAI tool choice](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal?lang=python)；[Anthropic tool choice](https://docs.anthropic.com/ko/docs/agents-and-tools/tool-use/implement-tool-use)。

响应必须恰好包含一个 BeatPlan 工具调用。参数通过现有 `validateNarrativeToolCall` / BeatPlan contract 校验。协议或字段不合法时，规划 transcript 内允许一次定向修复；修复内容不会进入正文 transcript。成功后应用覆盖 `targetChars`，生成 `planRevision`，并累计规划 usage 与 trace。

### 2. 正文阶段

规划成功后创建一份全新的 prose transcript。它重新注入同一 Kernel、真实历史和当前用户输入，并增加一个 system 级的“本轮场景约束”块。约束只包含：回应义务、因果步骤、角色动作、功能细节、必须落地的变化、场景内结束状态、避免重复、模式指引和目标长度。

正文 transcript 中不得出现：

- `submit_narrative_beat_plan`；
- BeatPlan 工具定义；
- 规划阶段 assistant/tool 消息；
- “提交计划”“计划已确认”“等待玩家下一步”等控制话语。

正文阶段只声明 Kernel 中的只读工具。`politics_lookup` 仍保持先成功查询 worldbook 后才暴露的现有门禁。资料工具调用和结果继续在正文 transcript 内串联，因此现有 grounding、重复调用防护、资料字符预算和两轮 evidence 预算不变。

extend 不创建新 BeatPlan，继续沿用当前行为；它直接进入干净正文阶段，且不注入不存在的计划。

### 3. 场景内结束条件

BeatPlan schema 对 `endCondition` 的描述改为“最后一个可观察场景状态”。校验层拒绝明显的元叙事条件，例如：

- 等待玩家、角色或读者作下一步选择；
- 故事、叙事、剧情在这里结束、停下或告一段落；
- 留待下一轮、下一步或后续行动。

该校验发生在结构化计划边界，不扫描或改写最终正文。合法例子包括“莉娜把伪造印章放到艾德加面前”“门闩落下，两人确认走廊无人”。

正文行文契约同步改为：最后一句必须落在场景内的动作、台词或已确认事实；不总结本轮、不宣布停笔、不等待玩家选择。补全提示只引用“场景内结束状态”，不再使用“叙事拍计划”“写到结束条件”等元语言。

## 数据流

```text
Kernel + history + turn
        |
        v
planner transcript -- forced BeatPlan tool --> validate/repair once
        |                                      |
        |                                      v
        |                                  BeatPlan + revision
        |                                      |
        +--------------------------------------+
                                               v
                         fresh prose transcript + compact scene constraints
                                               |
                                  read-only evidence tools (optional)
                                               |
                                               v
                                      visible story prose
```

规划 transcript 只存活于本次函数调用内，不写入最终 `transcript` / `baseMessages`。返回的 `beatPlan` 仍供 gameStore 更新 SceneThread；trace 只保留低敏 revision、mode、轮数、耗时和调用计数。

## 错误与恢复

- 规划返回普通文本或错误工具：转换成可修复的 BeatPlan 协议错误，在规划 transcript 内修复一次。
- BeatPlan 字段非法：保留现有 typed code，修复一次后仍失败则终止本轮。
- 规划超时：沿用 35 秒步骤预算和 100 秒整轮保护。
- 正文资料工具失败：沿用 unavailable 结果与现有 grounding 判定。
- 正文阶段误调规划工具：因为工具未声明，在 provider/客户端契约边界直接拒绝，不执行。
- 正文最终文本不再做关键词清洗或自动重写；结构隔离是主防线。

## 可观察性与兼容性

- `trace.phases.plan` 记录规划调用及修复轮次；evidence/write/completion 语义不变。
- `usage` 汇总规划和正文全部调用。
- `totalCalls` 继续包含 BeatPlan 控制调用，避免指标口径静默变化；`toolRounds` 也保留整轮总工具轮次口径。
- 返回的 transcript、revision、message count 和 `baseMessages` 仅描述干净正文阶段。
- `planRevision`、`beatMode`、`targetChars` 与 SceneThread 写回保持兼容。

## 测试与验收

在现有 `src/__tests__/agentContracts.test.js` 内增加回归断言：

1. 第一请求只声明 BeatPlan，使用与 provider 协议匹配的 specific tool choice，关闭并行调用。
2. 第二个及后续正文请求从消息和工具目录中完全排除 BeatPlan 工具名与规划历史。
3. 正文请求仍含裁剪后的回应义务、因果变化、关系动作和合法场景结束状态。
4. BeatPlan 修复只发生在 planner transcript，修复完成后正文 transcript 仍干净。
5. OpenAI Chat、OpenAI Responses、Anthropic/MiniMax 三种 specific tool choice 形状正确。
6. 明显元叙事 `endCondition` 被 typed validation 拒绝，场景内状态通过。
7. 资料查询、预算耗尽、有界补全、usage、trace 和 SceneThread 相关既有断言继续通过。

验证范围：定向 Vitest、完整 `verify:full`、叙事 recovery smoke、production dry-run 和 `git diff --check`。若没有现成开发服务，不为本次非 UI 改动启动服务。

## 自审结果

- 无 TBD/TODO 或依赖未定的接口。
- 正常路径仍是一次规划调用加一次正文调用，未增加默认模型调用。
- planner 与 prose 的权限、历史和错误恢复边界明确。
- 元叙事校验只作用于结构化计划，不退化为用户已否定的最终文本正则清洗。
