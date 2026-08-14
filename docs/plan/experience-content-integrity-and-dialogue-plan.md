# 体验页内容完整性与角色对白第三阶段计划

状态：待执行。日期：2026-08-13。归属：`G1.4 Experience Reading`、`G4.6 Narrative Context Runtime`。

本计划承接 [体验页叙事连续性与可读性计划](./experience-narrative-continuity-plan.md) 与 [体验页故事生成质量第二阶段计划](./experience-story-generation-quality-plan.md)。第二阶段的 intent、SceneThread、BeatPlan、较长生成预算和一次有界补全已经接入，但用户真实试用只证明“短句式回复有所改善”，没有通过整体质量验收。本阶段不再扩大 Agent 数量，也不继续堆叠文风禁句，而是修正数据生命周期、传输标记、说话者身份、阅读样式和 SceneThread 闭环。

## 1. 本轮验收结论

结论：**第二阶段实现 Gate 部分通过，真实体验 Gate 未通过。**

已经生效的部分：

1. `respond/open/advance` 已先产生结构化 BeatPlan，再生成正文。
2. 标准档目标长度和 token 预算已提高，低于目标的普通回复最多补全一次。
3. SceneThread 已进入回合快照、分支、撤销和刷新恢复路径。
4. 单句即结束的频率有所降低，说明长度预算和补全链确实生效。

仍不通过的部分及代码证据：

1. **删除正文不等于删除持久化内容。** `deleteMessage()` 只移除 `messages[index]` 并重建 `chatHistory`；对应 turn record、前后快照、memory candidate、runtime event 和 inline event 没有统一清理。更严重的是每个 runtime snapshot 都复制完整 `messages` 和 `chatHistory`，而恢复函数根本不读取这两个字段，导致正文被多份保存，存储量随回合数近似二次增长。
2. **生成篇幅与阅读密度概念重名。** `useExperienceNarrativeExpansion` 的“紧凑/标准/展开”只影响后续请求；`useExperienceReadingPreferences` 的“紧凑/标准/舒展”才会立即改变已有正文。当前 UI 虽有提示，但名称仍让用户误以为“紧凑”会重排已经生成的文字。
3. **marker parser 只覆盖理想格式。** 完整解析只接受行首半角 `:::kind`；流式保护只扣住最后一行的少数半成品。全角冒号、marker 紧跟上一句、带空格的流式半行、围栏变体或同一行多个 marker 都可能进入 legacy fallback，最终显示 `:::narration`。
4. **任意字符串都可能成为说话者。** marker 中的名字只要非空就会得到 hash speaker id；不要求命中 SceneCast、世界书角色、玩家或当前对话角色。legacy 文本正则同样会把“门外的声音”“控制台”“广播”等语法主语当成角色。
5. **对白样式存在三个 owner。** `Experience.vue`、`experience-reading.css`、`GamePanel.vue` 同时定义 dialogue/action/speaker，字号、字重和斜体规则互相冲突，最终效果取决于选择器优先级。
6. **SceneThread 没有形成真实闭环。** 场景未切换时 builder 直接返回旧 thread，不刷新最近重复项和新出现的问题；提交后又把 BeatPlan 的 `revealOrChange` 写成下一轮 `currentObjective`，把“本轮已经发生的结果”误作“下一轮要完成的目标”。当前重复提取还是无分词的 2-4 字定长切片，无法可靠识别“再次皱眉/转身/望向窗外”这类语义重复。
7. **强拉到字符下限会放大填充描写。** 最新补全规则把所有未达到目标下限的中长正文再续一次，即使第一段已经自然结束。它改善了长度，却可能让第二次调用用光影、声音和身体反应补足字符数。

因此不能把现状记为“计划完成”。用户实测已经是有效的 Q5 反证，不需要再用高要求 smoke 重复证明问题存在。

## 2. 调研结论与产品取舍

### 2.1 可借鉴部分

- NovelAI 把 **Output Length** 与 **Text Settings / Max Line Width** 分开：前者控制之后的 AI 输出，后者控制现有编辑器内容的阅读表现。Pinax 应采用同样的概念分离，不做“切换生成档位后自动重写旧正文”。[NovelAI FAQ](https://docs.novelai.net/en/faq/)、[Interface Settings](https://docs.novelai.net/en/text/usersettings/interface/)
- NovelAI 的编辑历史是分支时间线，同时另设 Trim Story / Flatten Story 清除不再需要的分支历史。这说明“编辑可恢复历史”和“物理释放存储”是两个不同操作，但 Pinax 当前的普通删除按钮没有表达这种区别，也没有任何压缩动作。[NovelAI Editor](https://docs.novelai.net/en/text/editor/)、[Story Settings](https://docs.novelai.net/en/text/editor/storysettings/)
- 本地 SillyTavern 将说话者作为消息结构中的 `name` 保存，群聊从已知成员表选择角色；它不会从任意正文名词生成角色身份。Pinax 的块级对白可以更适合小说阅读，但身份来源也必须回到已知角色表，而不是信任模型字符串。
- W3C 中文排版要求把单双引号视为正式中文标点，并明确中文正文有自身的字体和强调习惯。对白区分应优先使用引号、段落节奏、名字和克制色彩，不依赖大幅字号变化、整段高饱和颜色或聊天气泡。[中文排版需求](https://www.w3.org/TR/clreq/)
- Web Storage 容量有限，达到额度会抛出 `QuotaExceededError`。Pinax 当前以 localStorage 为主，不能把完整正文重复塞进每个回合快照后只靠 UI 隐藏。[MDN Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### 2.2 Pinax 的取舍

1. 体验页仍是“酒馆式互动 + 小说式阅读”，不改成常见聊天软件的左右气泡。
2. 生成长度与阅读排版完全分开；旧正文不被档位切换偷偷改写。
3. marker 永远只是传输协议，用户可见正文和持久化 clean content 中都不得出现。
4. 说话者必须来自“可发言实体注册表”。机器人、AI、动物或特殊存在可以发言，判断依据是设定身份，不是“像不像人名”。
5. 删除正文必须真实减少持久化体积，但不为此破坏仍被活动分支引用的回合拓扑。
6. 不新增自动审稿模型、中文分词依赖、第二次角色识别 LLM 或多候选重排。

## 3. 目标状态

```text
模型流式原文
  -> marker 流式扫描与完整归一化
  -> clean content + presentation blocks
  -> speaker registry 校验
  -> 单一阅读样式 owner
  -> message / turn provenance
  -> 引用感知删除与 session compaction
```

用户最终看到和存储的是：

- 一份可继续生成的 clean 正文；
- 一份轻量 presentation block 元数据；
- 只包含运行时状态的回合快照；
- 可追踪到 message/turn 的事件与待审记忆；
- 明确区分“后续生成篇幅”和“当前阅读密度”的设置。

## 4. 实施阶段

### P0：冻结五个最小复现，不扩建 smoke

目标：为确定性缺陷建立小夹具，不把浏览器 smoke 变成质量评测平台。

任务：

1. 保存一个含 6-10 轮长正文的 session fixture，记录删除前 `writing_sessions` 的序列化字节数。
2. 保存 6 种 marker 变体：正常、全角冒号、行内 marker、围栏、流式分块截在 `:::nar`、同一行 marker。
3. 保存 4 种 speaker：已知角色、角色别名、未知人物、非角色名词；另保留一个设定明确可说话的非人角色。
4. 保存双人连续对白和叙述夹对白各一条，作为桌面/390px 的视觉样本。
5. 从用户当前实测只保留 3 类生成样本：重复动作、无功能描写、跨轮目标漂移。每类 2 轮即可，不要求评分或统计显著性。

退出条件：每个缺陷能稳定复现一次；不要求真实 provider smoke 自动判“文笔合格”。

### P1：回合快照瘦身与删除事务

修改范围：

- `shared/narrativeTurnContract.js`
- `src/stores/gameStore.js`
- `src/services/memoryCandidates.js`
- `src/services/runtimeEvents.js`
- session normalize / backup owner

任务：

1. 新增单一 `normalizeRuntimeSnapshot()`，只保留 `applyRuntimeSnapshot()` 真正读取的字段。立即从新旧 pre/post snapshot 中剔除 `messages`、`chatHistory` 和其它未消费副本。
2. session load/save 时统一经过该归一化。旧会话下一次保存即可完成一次性瘦身，不增加单独迁移页面。
3. extension segment 不再同时长期保存完整 `rawContent`、`cleanContent` 和 blocks。提交成功后只保留 clean content、blocks、turnId 和必要来源；原始 marker 文本只允许存在于本轮内存 trace，且不进入长期 metrics。
4. 将 `deleteMessage(index)` 改为一个原子删除事务：先按 messageId 查 owning turn/segment，再统一处理 messages、chatHistory、inline events、runtime event provenance 和待审 memory candidates，最后只保存一次。
5. runtime event 新增 `messageId` 与 `turnId` 来源。旧事件没有来源时保留到正常上限淘汰，不用索引猜测删除。
6. 仅删除“唯一来源就是该回合、且仍为 pending/local-only”的记忆候选；用户已确认或已同步的长期记忆不自动删除，只移除失效 source ref 并标记来源缺失。
7. turn record 仍被活动分支或候选分支引用时保留轻量拓扑和 runtime snapshot，但移除已删除 messageId；完全不可达的 turn 与其快照由引用感知 GC 删除。
8. 删除较早正文时不得静默把后续 runtime 回滚。若其 turn 仍有后代，删除的是正文节点和相关展示来源，分支状态拓扑保持；需要回滚后续的操作继续由“重写后续/撤销续接”承担。

退出条件：

- 删除一条 1000 字以上 assistant 正文并保存后，`writing_sessions` 序列化大小至少减少该正文及 presentation 的实际字节，不再因快照副本几乎不变。
- 连续 20 回合时 session 增长接近线性；同一正文不再出现在每个后续 snapshot。
- 刷新、分支切换、重写后续和撤销续接仍能恢复正确 runtime。

### P2：拆开“生成篇幅”和“阅读密度”

修改范围：

- `src/composables/useExperienceNarrativeExpansion.js`
- `src/composables/useExperienceReadingPreferences.js`
- `src/components/workbench/SettingsPopup.vue`
- 体验页现有阅读节奏入口

任务：

1. 将“叙事展开度”改名为“单次续写篇幅”，选项改为“简短 / 标准 / 充分”；设置说明第一句明确写“仅影响之后生成”。底层旧值 `compact/standard/expanded` 可继续兼容，不做存储迁移。
2. 将现有阅读选项明确命名为“阅读密度”，保留“紧凑 / 标准 / 舒展”。切换后立即作用于所有已显示正文。
3. 两组控件不放在同一行，不共享“紧凑/标准”之外的说明，避免用户把生成长度误当 CSS 排版。
4. 不自动压缩、扩写或重写历史正文。已有内容的视觉紧凑由阅读密度负责；内容改写继续走显式编辑或写作页。

退出条件：用户无需阅读长提示即可判断一个控制后续生成、一个控制当前页面；阅读密度切换立即改变旧正文，续写篇幅切换不改旧正文。

### P3：marker 协议解析器收口

修改范围：

- `src/services/narrativePresentation.js`
- 流式 message update owner
- `src/__tests__/integration.test.js`

任务：

1. 把当前逐行正则整理成一个小型 scanner，显式维护 `pending marker line / current block / plain text` 三种状态；流式 chunk 末尾只要可能是 marker 前缀就暂存，不立即渲染。
2. 仅在段首协议位置归一化半角/全角三冒号、可选空格、大小写和 text/markdown 围栏；不全局替换用户正文中的普通 `:::`。
3. 支持 marker 与内容同一行、marker 紧跟上一块末尾后换行、连续 marker 和关闭围栏；同一物理行出现第二个 marker 时按协议边界切块。
4. 完整解析结束后执行 transport sanitizer：可识别的 marker 必须被消费；孤立的近似 marker 只移除协议头，保留其后的正文。
5. 最终 `message.content`、`presentation.content` 和持久化 segment 都使用 clean content。`presentation.hasMarkers` 只记录来源，不承担重新清洗。
6. legacy parser 只负责旧无 marker 内容，不应再次看见已识别的 transport marker。

退出条件：P0 六种变体在流式中不闪出 marker，完成后 clean content 不含 `:::narration/dialogue/action/thought/system`；普通正文中的代码 `a ::: b` 不被误删。

### P4：可信说话者注册表与保守识别

修改范围：

- 新增 `shared/narrativeSpeakerContract.js`
- `src/stores/gameStore.js`
- `src/services/narrativePresentation.js`
- `src/services/agents/narrativeKernel.js`

数据结构：

```text
NarrativeSpeakerRegistry
  entries[]
    speakerId
    displayName
    aliases[]
    entityType
    canSpeak
    source            player | active-dialogue | scene-cast | worldbook | runtime
```

任务：

1. 从玩家、当前对话角色、SceneCast、encountered characters 和世界书角色条目构建注册表；按稳定实体 id 合并别名，不再只生成 `name -> hash`。
2. marker speaker 解析返回 `verified / unresolved / message-fallback` 三种状态。只有 verified 或可信 message fallback 才显示 speaker label。
3. 未知 marker 名称保留在低敏 `speakerRaw` 供诊断，但 block 只作为“未署名对白”渲染，不创建新的 speakerId，不写入 encountered characters。
4. legacy 的“某某说：”正则只负责找到候选字符串；候选必须命中注册表或别名才能署名。未命中时仍可识别为 dialogue，但不显示错误角色名。
5. `声音、广播、门、屏幕、风、系统提示` 等不靠黑名单决定能否发言；若它们在世界书中是 `canSpeak=true` 的实体则正常通过，否则 unresolved。
6. 说话者纠错先不新增常驻 UI。第一阶段通过修正设定角色名/别名后重解析消息；只有真实试用仍频繁需要逐条纠错，才在现有消息操作菜单增加“更正说话者”。

退出条件：已知角色和别名稳定映射到同一 speakerId；未知人物不再显示伪造姓名；设定明确的非人角色仍可正确署名。

### P5：对白阅读样式单一 owner

修改范围：

- `src/styles/experience-reading.css`
- `src/pages/Experience.vue`
- `src/components/GamePanel.vue`
- `src/components/experience/NarrativeTurn.vue`
- `src/components/experience/NarrativeBlock.vue`

任务：

1. `experience-reading.css` 成为主题2正文块的唯一 owner；删除 `Experience.vue` 和 `GamePanel.vue` 中重复的 dialogue/action/thought/speaker 声明，只保留容器级布局。
2. 保持小说式连续正文，不使用气泡、卡片或整段背景。对白正文与叙述使用同一基础字号和行高，避免角色切换时版面跳动。
3. speaker label 只在连续 speaker group 的第一块显示：小号正体、略高于正文的字重，并在名字左侧使用一条短而克制的角色色标。色彩只落在名字和色标，不把整段对白染色。
4. 双引号内的真实对白保留轻斜体特征；叙述夹对白只让引号范围变化，不把整段叙述倾斜。单双嵌套引号继续按中文标点渲染，内层只做温和的第二强调色。
5. 未署名对白仍有对白段落节奏，但不显示“未知”“旁白”或错误名词。相邻不同角色之间增加一档段距；同角色连续多块不重复名字。
6. action 回正体，thought 只保留轻微斜体与低对比，不再与 dialogue 竞争。普通对白不增加点击详情。
7. 角色色由 speakerId 映射到 4-6 个低饱和主题色，只作短色标，不使用大面积蓝白渐变。

退出条件：桌面与 390px 下，双人连续对白能在 1 秒内扫出角色切换；正文行高和字号不跳；没有框、气泡、横向溢出或大片角色色。

### P6：SceneThread 和补全逻辑纠偏

修改范围：

- `src/services/agents/narrativeSceneThread.js`
- `shared/narrativeSceneThreadContract.js`
- `shared/narrativeBeatPlanContract.js`
- `src/services/agents/narrativeAgentOrchestrator.js`
- `src/stores/gameStore.js`

任务：

1. 场景未切换时也刷新 thread：合并最新 active question、实际在场角色、最近有效变化和滚动重复项，而不是直接返回 previous。
2. `currentObjective` 只表示仍未完成的场景目标。BeatPlan 的 `revealOrChange` 写入 `recentOutcome/establishedProgress`，不得覆盖 currentObjective。
3. `establishedProgress` 采用滚动合并，保留最近 3 项；不能每轮清空后只存本轮计划。
4. 放弃无分词的任意 2-4 字切片。重复项优先来自 BeatPlan 的 `characterMoves.action` 和 `functionalDetails.detail`，再补少量确定性的动作短语；保持最多 6 项，不引入分词库或额外 LLM。
5. BeatPlan 的动作必须描述“谁为达成什么而做什么，并造成什么结果”。把纯“观察环境 / 神情变化 / 气氛加重”且没有 result 的步骤视为无效计划，允许现有的一次 typed repair。
6. 最终计划中的 `targetChars` 由应用根据 intent 和续写篇幅写入，忽略模型自行选择的值。
7. 将“低于完整目标下限必补全”恢复为保守规则：截断、句子未完或低于目标约 70% 且未到 end condition 时补全一次；自然结束的中长正文不为凑字符强拉第二段。
8. 补全只携带尚未完成的 beat/result，不重复整份计划，不重新引入人物、环境或悬念。

退出条件：连续三轮中 currentObjective 不会变成上一轮结果；recent repetitions 每轮更新；标准档多数回复有完整变化，但不会仅为达到 900 字继续堆描写。

## 5. 验证预算

自动化只覆盖确定性合同，控制在 10-14 个高价值断言，不为每个文案样本建立测试：

1. snapshot normalize 不保存 messages/chatHistory/raw marker content。
2. 删除事务清理 message provenance、待审候选和不可达 turn，并真实降低序列化字节数。
3. 六种 marker fixture 在 complete/provisional 两种模式均不泄漏协议文本。
4. 已知、别名、未知、可发言非人四类 speaker 得到正确 trust 状态。
5. 生成篇幅只改变 intent range；阅读密度 CSS 立即作用于已有块。
6. SceneThread 同场刷新、目标不被 outcome 覆盖、进度和重复项滚动合并。
7. 自然结束的中长回复不强制补全；截断回复仍最多补全一次。

浏览器 smoke 只做操作验证：

- 删除一条正文后刷新，正文不恢复且设置页存储量下降；
- 切换阅读密度，旧正文立即变化；
- 桌面与 390px 查看一段双人对白，marker 不闪现、角色名不误判、无溢出。

真实 provider 只做 3 个场景、每个 3 轮的人工复读。记录“是否回应、是否推进、是否重复、是否堆描写”四项即可；它是产品验收，不是 automated smoke 的退出码。任一场景仍连续两轮出现同一低信息动作或目标漂移，就保留为未通过。

## 6. 推荐顺序

```text
P0 最小复现
 -> P1 快照瘦身与删除事务
 -> P2 设置语义拆分
 -> P3 marker 不泄漏
 -> P4 speaker 可信身份
 -> P5 对白排版统一
 -> P6 SceneThread / 补全纠偏
 -> 3 x 3 轮真实复读
```

P1、P3、P4 是数据正确性，优先于视觉打磨。P5 必须在 speaker trust 稳定后做，否则只会把错误角色名显示得更明显。P6 放最后，是为了先排除 marker、身份和存储噪声，再判断剩余问题是否真来自生成策略。

## 7. 非目标

- 不自动用 LLM 重写全部历史正文。
- 不迁移到 IndexedDB；先消除 localStorage 内无意义的正文副本。
- 不建立新的多 Agent 编剧或审稿链。
- 不用人名词典判断角色，不排斥设定中的非人说话者。
- 不把体验页改成聊天气泡，也不恢复主题1游戏化 UI。
- 不用 smoke 自动评价“文学性”，不要求几十轮或统计显著性。
- 不在本阶段重做分支 UI、联机协议或世界书实体模型。
