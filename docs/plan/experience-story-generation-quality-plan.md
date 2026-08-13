# 体验页故事生成质量第二阶段计划

状态：待执行。日期：2026-08-13。归属：`G1.4 Experience Reading`、`G4.6 Narrative Context Runtime`。

本计划承接 [体验页叙事连续性与可读性计划](./experience-narrative-continuity-plan.md)。上一阶段已经解决生成 intent、隐藏控制消息、同消息续接、基础 ContinuityFrame、回合事务和半自动上限；本阶段不重做这些基础设施，只处理真实使用中仍然存在的故事质量问题。

## 1. 当前问题

真实体验表明，单句式回复已有改善，但正文仍不像一段完整故事：

1. 单次生成量偏少，人物和事件还没形成关系就结束，下一轮只能重新起势。
2. 模型知道“要连贯”，却不知道当前场景究竟要完成什么，只能用动作、神态和环境细节填充篇幅。
3. 多个人物缺少各自的即时目的，常轮流重复看、停顿、皱眉、转身、握紧等低信息动作。
4. 描写与因果推进分离，出现大量气氛、光影、声音和身体反应，但它们不改变信息、关系、目标或局势。
5. ContinuityFrame 保存了地点、尾句和少量状态，却没有保存“本场景正在完成的任务”和“最近已经写过、不要再写的动作与意象”。
6. 当前有界补全主要判断长度、结束原因和句末标点。一个有句号但没有完成任何叙事进展的短段仍会被当作合格结果。

结论：根因不是单纯 token 不够，也不是缺少更多文风禁句，而是系统把“一次生成”定义成了没有局部计划的自由续写。模型每轮只看见历史和写作要求，没有一个稳定、可完成、能跨段延续的场景任务。

## 2. 产品调研与取舍

### 2.1 可借鉴部分

- **SillyTavern**：continue 是延长当前 assistant 内容；Author's Note 可以放在靠近最近正文的位置，适合短而强的当轮方向。Pinax 已采用前者，后者对应现有导演注和 turn note，不需要引入完整 Prompt Manager。[官方 Author's Note 文档](https://docs.sillytavern.app/usage/core-concepts/authors-note/)
- **NovelAI**：Storyteller 模式把正文视为连续文本；Memory、Author's Note、Lorebook 分别承担长期事实、近期写作方向和按需资料，不让所有信息混成一层。[Story Settings](https://docs.novelai.net/en/text/editor/storysettings/)、[Lorebook](https://docs.novelai.net/en/text/lorebook/)
- **AI Dungeon**：AI Instructions、Story Summary、Plot Essentials 和 Story Cards 分工明确，说明长期事实、故事摘要、当轮指令和相关世界资料应分层进入上下文。[Memory System](https://help.aidungeon.com/faq/the-memory-system)、[Plot Essentials](https://help.aidungeon.com/faq/plot-essentials)
- **Sudowrite**：把 Scene 当作自然写作原子，先列出场景要发生的关键时刻，再生成连贯 prose；其 First Draft 通常生成约 800-1000+ 英文词，说明完整场景草稿不能只靠数百字符的自由续写。[Scenes & Draft](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/scenes--chapter-prose/49p5MTVxTKkVFEC5rVUzpY)、[The Basics](https://docs.sudowrite.com/getting-started/dQph1snuwbfMWG9wRjsNug/the-basics/po46R9SPcwQ6D7Uzq7tbkP)
- **Re3 / DOC**：长故事连贯性来自“计划 -> 按当前状态写 passage”，更细的层级大纲进一步提高情节连贯、提纲相关和趣味性；这支持在正文前加入轻量局部计划，但不意味着 Pinax 需要多 Agent 编剧团队。[Re3](https://arxiv.org/abs/2210.06774)、[DOC](https://arxiv.org/abs/2212.10077)

### 2.2 Pinax 的取舍

Pinax 是互动叙事，不是一次生成整章。因此不照搬 Sudowrite 的章节工作流，也不引入 Re3 的多候选重排和全文重写。采用以下最小结构：

```text
长期事实 / 世界资料     现有 Kernel + 只读工具
故事到目前为止         scene summary
当前场景如何继续       SceneThread
本轮具体要写成什么     NarrativeBeatPlan
最终用户可见内容       一次较长 prose，必要时一次同 transcript 补全
```

## 3. 产品目标

1. 默认一次 `respond` 能形成约 3-6 个自然段的可阅读故事进展，而不是一段姿态描写。
2. 一个回合至少完成一项有意义变化：信息被确认/否定、人物关系改变、目标取得进展、障碍发生作用、行动产生后果。不是要求每轮制造反转。
3. 对话场景先回答上一句的语义，再选择必要动作；不能用神态和环境描写回避回答。
4. 同场人物有不同即时目的，不要求每个人每轮都表演动作。
5. 环境和感官细节只有在影响动作、判断、信息或情绪走向时保留。
6. 场景可以安静、缓慢和低事件密度，但不能“没有变化只有描写”。
7. 用户仍只看到连续正文；局部计划、重复抑制和场景线程不新增常驻面板。

## 4. 核心设计

### 4.1 SceneThread：跨回合的场景线程

新增一个轻量、可随分支快照恢复的软状态。它服务于写作协调，不是世界事实真源，也不能直接修改世界书或 runtime canonical facts。

```text
SceneThread
  id / revision / sourceRefs
  sceneRef / place / time
  mode                 dialogue | action | investigation | transition | mixed
  purpose              这场戏为何存在，一句话
  currentObjective     当前局部目标
  immediateObstacle    眼前真正起作用的阻力
  activeQuestion       当前等待回答的问题或未完成交换
  cast[]
    characterId / name
    immediateIntent    本场景此刻想得到什么
    lastMeaningfulMove 最近一次改变局势的行动，不是姿态
  establishedProgress  最近 2-3 项已经发生的有效变化
  recentRepetitions    最近两轮已使用的动作、姿态、环境意象，最多 6 项
  exitConditions       哪些变化意味着本场景可结束或转场
```

构建原则：

- 地点、时间、人物身份来自现有 runtime 和 confirmed facts。
- purpose、currentObjective、activeQuestion、即时人物意图属于叙事软状态，可以由本轮计划更新，但必须随 turn record 保存和回滚。
- `recentRepetitions` 不是永久禁词，只防止连续两三轮无因果复写；当旧动作产生新后果时允许回收。
- 地点显著变化、时间跳跃、主要人物组合变化或 currentObjective 完成时，结束旧 SceneThread 并建立新线程。

### 4.2 NarrativeBeatPlan：每轮短计划

`open/respond/advance` 在写正文前，使用同一 provider、同一 request 和同一 transcript 产生一个受 schema 约束的局部计划。`extend` 默认复用当前计划和 endCondition，不重新规划。

```text
NarrativeBeatPlan
  sceneThreadRevision
  intent
  mode
  responseObligation   玩家本轮输入必须得到什么回应
  causalSteps[]        2-4 个有因果顺序的变化，不是段落模板
  characterMoves[]     只列本轮真正需要行动/说话的人及目的
  functionalDetails[]  最多 2 个细节，并注明它影响什么
  revealOrChange       本轮最终新增的信息、关系、目标或局势变化
  endCondition         正文写到什么状态可以自然停下
  avoidRepeats[]       本轮不要重复的动作、姿态和意象
  targetChars
```

执行方式：

1. 在现有叙事 transcript 中增加内部控制调用 `submit_narrative_beat_plan`。
2. 它不是世界工具，不查询或写入外部状态，只提交并校验本轮计划；不计入 grounding evidence。
3. schema 无效时只允许一次 typed repair；失败后显示可重试错误，不静默退回无计划自由续写。
4. 合法计划作为短 system/control message追加到同一 transcript，随后才生成流式正文。
5. 不为同一计划生成多个候选，不增加 reranker，不增加独立“编剧 Agent”。

### 4.3 正文生成契约

现有长篇行文规则应缩短，重点从“禁止什么”转为“完成当前计划”：

- 开头直接承接 `responseObligation` 或上一段未完成动作，不重新布置已知场景。
- 按 `causalSteps` 写出一段连续经历；步骤可以合并到自然段，不显示编号。
- 对话先有语义回应，动作只承担潜台词、阻碍或后果，删除无功能的轮流表演。
- `functionalDetails` 之外可以使用已有场景细节，但新增细节不得超过计划预算。
- `revealOrChange` 必须在正文中发生；不能只暗示“似乎有事”后结束。
- 到达 `endCondition` 后自然停止，不强制悬念、选择题或新神秘事件。
- 世界书 writing style 只影响措辞、视角和句法，不得覆盖 BeatPlan 的因果顺序。

### 4.4 长度与节奏

把当前 450-1000 字符的默认目标提高，但不把所有模式写成同样长度：

| intent | 默认目标 | 说明 |
|---|---:|---|
| `open` | 1200-1800 中文字符 | 建立人物、现场、局部目标和可行动条件 |
| `respond` | 900-1500 中文字符 | 默认完整故事回合 |
| `advance` | 800-1400 中文字符 | 推进 NPC/环境后果，不替玩家决定 |
| `extend` | 500-900 中文字符 | 补完当前计划或延长同一动作链 |

同时将 provider 输出预算提高到足以容纳计划、工具结果和正文：普通回合建议 `2400-2800 maxTokens`，开场建议 `3000`。实际值需用当前 MiniMax/OpenAI-compatible 渠道各跑一轮确认，不能只按字符比例推算。

体验设置中只增加一个三级“叙事展开度”：

- 紧凑：目标区间约 0.65 倍；
- 标准：上表区间，默认；
- 展开：目标区间约 1.35 倍。

使用现有设置弹层中的 segmented control，不在输入区增加常驻按钮。明确短答、纯确认或用户导演注要求简短时允许低于区间。

### 4.5 有界补全调整

当前“有句号即完成”的规则不再足够。补全规则改为：

1. `finishReason=length`：维持一次补全。
2. 非明确短答且低于当前展开度的最低目标约 70%：允许一次补全。
3. 补全提示携带同一个 BeatPlan，要求写到 `revealOrChange/endCondition`，不只说“继续上一句”。
4. 一次补全后无论质量如何都停止；不增加自动审稿、第三次生成或后台无限改写。
5. `extend` 本身不再因低于普通 `respond` 长度而自动补全。

## 5. 实施阶段

### Q0：冻结真实问题样本

目标：只建立足够复现问题的样本，不建设复杂评测平台。

任务：

1. 选 3 个真实场景：持续对话、多人冲突、安静调查。
2. 每个场景手动运行 4 轮，保留 `/tmp` 输出：当前版本正文、每轮字符数、用户一句人工备注。
3. 人工只标四项：是否回应上一轮、是否有有效变化、是否重复动作、描写是否有功能。

退出条件：三类问题均可稳定看见；不要求统计显著性，不把 smoke 变成发布评分系统。

### Q1：展开度与正文契约先行

修改范围：

- `shared/narrativeGenerationIntentContract.js`
- `src/services/agents/narrativeVoicePolicy.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/stores/gameStore.js`
- 体验设置 owner

任务：

1. 接入新的 intent 字符区间和 2400-3000 token 预算。
2. 删除重复、抽象且相互覆盖的行文指令，保留因果、玩家控制权和功能性细节三类规则。
3. 增加“叙事展开度”设置，默认标准。
4. 将补全最低阈值与 intent/展开度关联。

退出条件：真实 provider 的 `respond` 不再稳定停在 300-500 字符；明确短答不被强行扩成长篇；延迟仍可接受。

### Q2：SceneThread

修改范围：

- 新增 `shared/narrativeSceneThreadContract.js`
- 新增 `src/services/agents/narrativeSceneThread.js`
- `src/stores/gameStore.js`
- turn snapshot / session normalize / backup owner

任务：

1. 定义 SceneThread schema、归一化、revision 和场景切换条件。
2. 从现有 runtime、presentation、active goal 和最近正文构建首个线程。
3. 将 SceneThread 纳入 turn pre/post snapshot、分支切换、撤销、刷新和备份恢复。
4. 先只生成并审计 SceneThread，不改变正文 prompt，确认它不会串分支或把软状态升级为事实。

退出条件：连续四轮保持同一场景目标；转场后建立新线程；重生成、撤销和刷新恢复一致。

### Q3：BeatPlan 同 transcript 接入

修改范围：

- 新增 `shared/narrativeBeatPlanContract.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- provider step normalization owner
- ContextLedger / turn receipt

任务：

1. 增加内部 `submit_narrative_beat_plan` 控制调用及严格 schema。
2. `open/respond/advance` 先计划再写正文；`extend` 复用当前计划。
3. 将 BeatPlan 注入最终 prose step，并把 `planRevision`、模式、目标长度和是否补全写入低敏 trace；不保存计划中的完整故事文本到长期 metrics。
4. 失败、取消和 provider 不支持时给出 typed error；沿用现有停止与重试 UI。

退出条件：最终正文和资料工具仍在同一 transcript；每轮最多增加一个计划步骤；用户仍只看到一次连续流式正文。

### Q4：重复抑制和场景推进闭环

任务：

1. BeatPlan 从最近两轮正文中识别最多 6 个重复动作/意象，写入 `avoidRepeats`。
2. 为在场角色分配不同 `immediateIntent`；没有作用的角色不强制说话或动作。
3. 正文提交后，将计划中的有效变化、人物 meaningful move 和已用细节写回 SceneThread 软状态。
4. 补全提示引用原计划的 endCondition，避免补全再次起势。

退出条件：三轮对话中不再让多人重复同类姿态；调查场景的细节能够推动判断或行动；正文达到 endCondition 后停止。

### Q5：真实模型验收与收口

只做小规模、可读的验收：

1. 使用当前主要 provider 跑 Q0 的 3 个场景，每个 4 轮。
2. 与 Q0 基线并排阅读，不隐藏版本也可以；当前阶段目标是发现明显问题，不是论文级盲测。
3. 四项人工判断中，每个场景至少 3 轮同时满足：回应上一轮、有有效变化、无明显重复、描写有功能。
4. 检查标准展开度下多数 `respond` 落在约 900-1500 中文字符；短对白例外单独记录。
5. 跑现有 contract/full verification，并手工检查停止、重试、继续、分支和刷新各一次。

## 6. 测试预算

不增加大型 smoke 或大量 exact prompt 测试。新增测试控制在 8-12 个高价值断言：

1. 展开度正确映射 intent 字符区间和 token 预算。
2. BeatPlan schema 拒绝空 response obligation、无变化的 causal steps 和过量细节。
3. `respond/advance` 需要计划，`extend` 复用计划。
4. 计划与 prose 保持同一 transcript 和 requestId。
5. 计划失败最多修复一次，取消能同时终止计划和正文。
6. SceneThread 随提交、撤销、分支和刷新恢复。
7. 明确短答不补全；普通短而未完成的 respond 最多补全一次。

产品质量仍以 Q0/Q5 的 12 轮真实阅读为主，smoke 只验证链路能跑通。

## 7. 非目标

- 不建立多 Agent 编剧、审稿、润色流水线。
- 不为每轮生成多个候选再排序。
- 不自动生成整章，也不把体验页变成 Sudowrite。
- 不用情感分析、词性分析或复杂中文 NLP 管线硬判文采。
- 不把字符数作为唯一质量标准；长度只提供完成场景拍的空间。
- 不把 SceneThread 或 BeatPlan 写入世界书、confirmed facts 或历史真源。
- 不重做体验页 UI；只在现有设置中增加展开度。

## 8. 推荐执行顺序

```text
Q0 三组真实基线
 -> Q1 先扩大有效生成单元
 -> Q2 建立跨回合场景线程
 -> Q3 同 transcript 局部计划
 -> Q4 重复抑制与计划闭环
 -> Q5 12 轮真实阅读验收
```

Q1 是快速改善，Q2-Q4 是解决“没有写故事感”的核心。不能只做 Q1：单纯加长会把当前无意义描写放大；也不能跳过 Q1 只做计划：输出空间不足时，再好的计划仍会被压成提要。

---

## 9. Q0/Q5 手动操作指引（需真实 provider）

Q0（冻结基线）与 Q5（真实阅读验收）需要可用 API key 与人工阅读，无法由自动化代码完成。步骤如下：

### Q0：冻结三个真实问题场景基线

1. 准备一份 provider 配置（`provider/baseUrl/apiKey/model`），例如 `scripts/provider.json`。
2. 起本地前端：`npm run dev`（前端 `http://127.0.0.1:5173`）。
3. 在体验页手动运行 3 个场景各 4 轮（持续对话 / 多人冲突 / 安静调查），把每轮正文、每轮字符数、一句人工备注保留到 `/tmp` 或任意笔记。
4. 每轮只标四项：①是否回应上一轮 ②是否有有效变化 ③是否重复动作 ④描写是否有功能。
5. 退出条件：三类问题（起势重复、无变化只有描写、低信息动作轮换）能稳定看见即可，不要求统计显著性。

### Q5：真实模型验收（与 Q0 并排阅读）

1. 保持 Q0 的 provider 配置与前端运行。
2. 跑多轮连续评测（含 BeatPlan 计划先行 + SceneThread）：
   `npm run smoke:narrative-production -- --continuity --config scripts/provider.json --output /tmp/pinax-q5`
3. 阅读 `/tmp/pinax-q5/review-cases.json` 的正文，与 Q0 基线并排对比（不隐藏版本也可以）。
4. 判定：每个场景至少 3 轮同时满足 Q0 的四项；标准展开度下多数 `respond` 落在约 900-1500 中文字符（短对白例外单独记录）。
5. 跑现有验证：`npm run verify:full`；再手工检查停止、重试、继续、分支、刷新各一次。
6. 如需发布门禁：`npm run gate:narrative-release -- --matrix <matrix.json>`（质量阈值见本计划 §4.4 与连续性计划 §7）。
