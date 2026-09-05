# Authoring 上下文生命周期实验

**日期：** 2026-08-25  
**状态：** deterministic experiment complete  
**目的：** 为文本工作台 v3 计划验证上下文所有权、未来信息隔离、冲突处理、摘要保真、运行预算与 Ledger 对账，不评价模型文风。

## 1. 实验方法

使用同一份《雾港纪事》fixture、同一章正文和同一章末光标，分别调用现有三条生产上下文构建链：

1. `resolveAgentContext(authoring.continue)` 的 canonical profile/envelope/ledger；
2. `buildWritingAgentInput()` 的自动联想 envelope/ledger；
3. `buildAuthoringNarrativeContext()` → `buildNarrativeKernel()` 的长推演实际 Kernel。

另构造：

- 第十章揭晓作为第五章落笔处的未来来源；
- 正文/记忆/世界书关于“艾德加是否会游泳”的冲突；
- 五个放在每条消息第三句的精确事实，检查启发式摘要；
- Narrative runtime 的现有预算常量审计。

复现：

```bash
npm run eval:authoring-context-lifecycle
```

作为未来硬门禁运行：

```bash
npx vite-node scripts/authoring-context-lifecycle-eval.mjs --gate
```

## 2. 总结果

| Gate | 结果 |
| --- | --- |
| 三条上下文链来源对齐 | 失败 |
| 未来章节硬隔离 | 失败 |
| 矛盾事实显式裁决 | 失败 |
| 摘要保留指定关键事实 | 失败 |
| 累计 token 预算 | 失败 |
| Ledger 与 Kernel 实际输入对账 | 失败 |

结果是 **0/6 Gate 通过**。这不是说现有生成完全不可用，而是证明当前架构不能提供 v3 所需的可解释、跨章、安全上下文保证。

## 3. 实验 A：三条上下文链对账

### 观察

- canonical resolver 使用 `narrative-scene` profile，包含 rules/style/scene/character/location/history/memory/worldbook；
- 自动联想只形成 rules/scene/references/worldbook；
- NarrativeKernel 实际形成 rules/turn/scene/projection/lore/recent/continuity/style；
- 三条链连世界书引用命名都不一致：`worldbook:<id>` 与 `worldbook-entry:<id>` 并存；
- Kernel 实际使用 writing node/message refs，但 canonical ledger 不知道这些 refs；
- canonical resolver 纳入了 future history 和 memory，但本次 Kernel 没有消费它们；
- Kernel 自己匹配出的 constant rule 没出现在 canonical ledger。

### 结论

当前 ledger 是“resolver 曾计划提供的内容”，不是“模型实际看到的内容”。自动联想、通用 Agent 和 NarrativeKernel 各自拥有选择、裁剪与来源表达，不能直接在其上增加第四套 Context Manifest。

### 计划约束

计划必须先冻结单一 ownership：

- Context Compiler 负责发现、资格、冲突、表示和打包；
- runtime adapter 只能序列化或按已授权索引检索；
- execution receipt 从实际 model call 产生；
- 自动 Ghost 和 NarrativeKernel 复用同一个 compiled manifest，允许不同 budget profile，不允许不同语义规则。

## 4. 实验 B：未来信息隔离

### 观察

第五章任务的 facade 返回 `chapter:chapter-10:unit-reveal` 后，`resolveAgentContext` 原样把它加入 envelope。block 没有 `temporalRelation`，resolver 也不知道章节顺序或目标 unit 位置。

### 结论

现有 priority/budget 只能决定“留谁”，不能判断“谁有资格进入”。未来泄漏不能靠 reader 自觉、降低 priority 或 prompt 文案阻止。

### 计划约束

必须在评分之前建立 eligibility gate：

1. 解析 sourceRef 到项目、文档、章节和 unit；
2. 使用冻结的 outline/chapter order revision 判断 before/at/after target；
3. after-target canonical prose 默认排除；
4. 作者显式钉选后只能以 intended/reference 进入；
5. 无法解析时间位置的正文来源 fail-closed。

## 5. 实验 C：矛盾事实

### 观察

同一 envelope 同时保留：

- 第十章：“艾德加其实会游泳”；
- 记忆：“艾德加怕水”；
- 世界书：“艾德加不会游泳”。

没有 conflict set、winner、shadowed 或 unresolved 标记。

### 结论

现有 resolver 是按 block kind 和 priority 装箱，不是事实裁决器。让模型临场判断会导致不同 provider、不同调用位置得出不同结果。

### 计划约束

需要在编译阶段做字段/命题级冲突分组；冲突策略按任务和事实类型决定，不能使用一个全局数值分数。无法安全裁决时应把冲突显式交给“检查/探索”任务，正文 Ghost 默认排除低权威冲突项。

## 6. 实验 D：摘要信息损失

### 方法

把五个精确事实放到各条旧消息的第三句：密码、身体特征、机制限制、时限、钥匙位置。保留最近两条消息，让前七条进入 `resolveNarrativeSceneSummary()` 的启发式路径。

### 结果

只保留 1/5：

- 保留：日落前必须返回码头；
- 丢失：7319；
- 丢失：左手缺少小指；
- 丢失：每次只能亮起一颗星；
- 丢失：北墙第三块砖。

原因不是字符预算耗尽，而是 heuristic 对每条 assistant message 优先取命中正则的句子，否则只取前两句。摘要虽保存全部 message refs，却没有声明 facets、known omissions 或每条事实的证据映射。

### 结论

现有 scene summary 适合体验会话的粗略连续性，不适合作为正文章节事实索引。`sourceRefs` 只能证明“读过这些消息”，不能证明摘要保留了哪些事实。

### 计划约束

- 不把现有 heuristic summary 直接升级为跨章真源；
- 持久化摘要应分 unit fact index、scene/range summary、chapter continuity；
- 精确事实与关系变化必须保存结构化 claim + evidence ref；
- prose summary 只负责叙事概览；
- 摘要声明 coverage、facets 和 known omissions；
- 任务定向视图不得冒充持久中性摘要。

## 7. 实验 E：运行预算

### 已有护栏

- evidence rounds：2；
- calls per turn：6；
- model steps：8；
- tool result chars：7200；
- whole-run timeout：100 秒；
- 相同 tool + args 第三次阻止；
- provider retry / repair：各 1。

### 缺口

没有：

- cumulative input token limit；
- cumulative output token limit；
- total token limit。

usage 被累计和记录，但不会触发运行终止。provider 不返回 usage 时也没有运行级保守估算预算。

### 结论

原 DeerFlow 报告建议新增 loop guard 是重复建设；Pinax 已有更严格的局部重复调用阻止。真正值得吸收的是独立 TokenBudget 和可见 stop reason。

## 8. 实验 F：Ledger 对账

### 结果

Kernel 使用但 canonical ledger 未列出的来源包括：

- 当前章；
- 五个 writing node/message refs；
- constant 世界规则。

canonical ledger 列出但 Kernel 未消费的来源包括：

- 第十章未来揭晓；
- 记忆条目；
- resolver rules ref；
- resolver scene projection ref。

### 结论

当前 UI 如果展示 canonical ledger，会同时出现漏报和误报。未来必须区分：candidate report、compiled manifest、call receipt、adoption receipt。

## 9. 对下一版计划的直接影响

下一版计划在实现跨章读取之前，必须增加一个“Context ownership closure”阶段：

1. 盘点并冻结三个现有入口的语义 owner；
2. 定义正交的来源权威、叙事状态、时间关系和 scope；
3. 建立 eligibility → conflict → representation → packing 编译顺序；
4. 让自动 Ghost 和 NarrativeKernel 消费同一个 compiled manifest；
5. 从实际 model call 生成 receipt；
6. 将摘要拆为结构化事实索引与 prose continuity 两层；
7. 补累计 token budget 和 typed stop reason；
8. Ghost stale 检查加入实际依赖 revision，而非只检查正文目标。

在这些条件闭环前，不应实施全书跨章上下文，也不应新增全局 middleware pipeline。

