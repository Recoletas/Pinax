# A 线：让推演继承真实的分支后果

从属于[夜间总任务书](../pinax-nightly-storyforge-public-alpha-20260913.md)。本线是实施计划，所有任务初始未完成。A00–A09为主队列，A10–A13为提前完成或暂缺主包依赖时的工作库存。目标480分钟，逐包估算405–555分钟，包含修复和分线封板；上界可能超过一晚，按总任务书的冻结/残余规则收口。

## A 的交付故事

莉娜知道账册被调包。作者在同一起点试两种行动：告诉艾德加、隐瞒。随后两路都请他守门。A 路应继承“艾德加已知调包”，B 路不得被 A 的秘密污染；艾德加提出的条件也应留在各自路线。作者打开对照，一眼看见知情与承诺区别，选一条生成试稿。整个试演过程中，正式人物资料、世界书和正文都不被自动修改。

本线负责状态、请求与来源。C 负责页面、指引和对照显示。**没有经过正常按钮及服务端链路的结果，不能标为生产完成。**

## 1. 已有链路与准确写集

```text
Authoring.vue（C owner）
  → useAuthoringRehearsal.js（A）
  → authoringRehearsal.js（A）
  → requestAdvisorTask / 既有统一任务通道
  → server/openclawService.js 输出约束（A）
  → server/advisorTaskService.js buildAdvisorResult（A）
  → parseRehearsalResponse（A）
  → 对指定 route 原子发布 response + consequences（A）
  → AuthoringRehearsalPanel（C）
  → 冻结所选路线 draftSource（A）
  → runAuthoringTurn / Ghost / 既有采纳事务（C 接线，既有 owner 执行）
```

独占：

- `src/services/agents/authoring/authoringRehearsal.js`
- `src/composables/useAuthoringRehearsal.js`
- 新 `src/services/agents/authoring/authoringRehearsalConsequences.js`、`authoringRehearsalDraftSource.js`，必要时一个知情投影 helper；不要每个函数一个文件。
- 新 `shared/authoringRehearsalConsequenceContract.js`；`shared/agentCapabilityContract.js` 中 rehearsal 这一行的局部协议更新须 O01 审查。
- `server/services/advisorTaskService.js`、`server/services/openclawService.js` 的 rehearsal 分支，不顺手改其他 AI 任务。
- `scripts/authoring-ui/rehearsal-real-sample.mjs`，`src/__tests__/authoringTurnComposer.test.js` 的相关合同断言。

条件写权：`authoringScenePressureProjection.js`只在A01复现后按单一权限表修正；`server/services/textModelAgentProvider.js`中rehearsal的token上限仅A02/O01核准后局部调整；`memoryCandidates.js`等记忆owner仅A11经O批准的薄接缝。不得改`Authoring.vue`、面板CSS、package、C的浏览器Gate。

## 2. O01 冻结的最小语义合同

### 2.1 身份、权威与范围

- 每个 action 有稳定 `actorRef`、`targetRefs[]`；显示姓名不是主键。旧字符串 action 保持可传，但姓名必须唯一映射，否则返回可处理歧义，不能取第一个同名人。
- route、request、step ID 由应用生成。模型回显的 routeId/stepId 不构成写入授权；最终 response 永远绑定请求时捕获的 owner。
- 所有后果权威为 `simulated`，生命周期与当前推演相同；不存 localStorage、不生成正式 runtime event、不修改角色卡。
- 起始事实仅从本次冻结的授权资料与作者明确确认的条件获得；人物角色、私有事实和计划入场不由一个名字匹配函数推断。
- 未知知情状态不是“不知道”，也不是“公开事实”。只有作者明确确认“该人物尚不知情”才能展示“尚未获知”；“作者没告诉他”仍可能有其他获知来源，不能据此判不知道。其余显示“这条路未记录此信息”。
- A提供会话级条件冻结接口，C06接正常UI：一条事实、已知者、作者明确不知情者，未指定者均unrecorded。factKey由应用生成，作者声明标为本次假设，作为独立有界的baseline来源，不伪造正式世界书evidenceRef。修改条件生成新baseline/generation，旧步保留可读但不混到新条件中；不修改已冻结manifest本体。

### 2.2 两类必做后果

```js
// 语义示例；精确导出与字段在 O01 的 contract.md 中冻结。
{
  kind: 'knowledge',
  knowerRef: '已授权人物引用',
  factKey: '本次已冻结的秘密/事实标识',
  state: 'learned',
  source: { kind: 'action', evidenceRefs: [], quote: '本次作者行动中的告知原句' }
}
{
  kind: 'commitment',
  promisorRef: '已授权人物引用',
  beneficiaryRef: '另一已授权人物引用或空',
  commitmentKey: '已有承诺标识或由应用创建的新标识',
  state: 'promised', // 或 conditioned / refused / withdrawn
  content: '守住档案室门口',
  condition: '先让我看到账册',
  source: { kind: 'response', evidenceRefs: [], quote: '回应中的承诺原句' }
}
```

不支持任意 JSON patch、对象路径写入、自由数值关系、全球物品创建。起始明确事实可被某人得知；“新出现的未知秘密”先保留在文本/待核对结果中，不自动注册为全局事实。知识只支持本夜验证过的取得状态，不凭空实现失忆、撒谎改变事实真值或全局撤销他人认知。

承诺身份：已有承诺的更新必须引用原key；同一冻结议题（例如两路都提出的守门请求）由应用分配稳定issueKey，回应可按该议题比较。不同新承诺若没有共同议题依据，保持独立而非按相似文字自动合并。模型不拥有key分配和跨路等价裁决权。

### 2.3 结果、验证和预算

- 保留 `response/change/choices/evidenceRefs`；新增版本化后果段，通过同一 shared 校验进入 server 和 client。版本兼容策略由 A02/O01 明确，不新建平行 task ID。
- 每步默认至多2条后果；source.kind为action/response，quote必须在请求时捕获的对应原文中精确存在。已完成的“告诉秘密”可由action支持，不强迫模型在回应重演行动；新承诺必须有回应依据。evidence引用属于冻结授权或本次明确假设目录，不能要求模型给不存在的正式世界书事件ref。
- `text/content/condition/quote`都有字符上限；同时冻结模型max_tokens、结果maxOutputChars和整份JSON序列化上限，三者不能互相替代。当前textModelAgentProvider把rehearsal固定1200 tokens；先用含两条完整后果的合法样本量截断，再由O批准确有需要的小幅调整，不只增前端字符数。输入仍遵守既有transcript单text part 8000上限。
- 出现非法 ref、同一步相反结论、不可执行 transition 时整批不提交；原 response 留作本次待核对结果，旧已提交 route 不动。
- 引文存在只证明出处可定位，不证明“承诺”在语义上真的成立。模糊表态不自动上升为确定承诺；作者可重试或放弃本次结果，不能静默丢 delta 后继续声称已追踪因果。
- 旧四字段结果是 `legacy/untracked`：仍可阅读和转试稿，但不能从 change 正则编造知识。继续前由作者重开有明确起始条件的新试演，或显式确认能追踪的起始条件。当前 session 本来不跨刷新持久化，无需数据库迁移。

### 2.4 提供给 C 的读模型与动作

- 当前路：`routeId`、`stateFingerprint`、`consequences`、`consequenceIssues`、`status`。
- 对照：按同一 fact/commitment key 匹配的 `differences[]`，包含双方可读状态、人物名、来源步；共同前缀不重复。
- 动作：冻结本次条件、兼容的`advance`、丢弃本次无效响应、显式重试，以及原有fork/restore/reset。
- 转稿：`buildRehearsalDraftSource` 同时冻结 routeId、step IDs、prefixFingerprint、stateFingerprint、已验证本路线文字和目标 revision。
- C 只呈现这些字段。不得在模板中累计知识、不从自然语言猜变化、不另外调模型给对照写摘要。

## 3. 主任务队列

### A00 · 基线反例与生产协议清点（20–30 分钟）

依赖 O00。读正常一步请求实际 shape、服务端归一化和前端 parser，记录字段在哪里会被剥除；记录 createRoute 的浅复制以及转 Ghost 异步读 steps 的时点。

用三种人物情形写最小复现：已在场、明确授权下一段入场、只在计划中尚未生效。不要凭 `planned` 字面一律放行或一律排除。保存结果到本线回执。

完成：真实链路和两组正反输入可复现；向 C/O 交首版 DTO。无源代码必要改动时标 `verified-existing`，立即进入 A01。

### A01 · 人物稳定身份与入场时点（40–55 分钟）

依赖 A00。为选项和行动意图使用已有 participant.ref，保留姓名显示与旧字符串调用兼容。重名必须可区分；没有稳定 ref 的人物不能作为结构化后果主语。

依据 frozen scene intent 定义 responder 权限：已在场可回应；本次获作者授权入场的人仅在对应入场事件生效后回应；纯未来计划没有当前台词权限。本路线离场状态若尚未实现，应维持明确支持边界，而不是推导出不存在的自动入场。

反例：同名两人、未知 ref、换行动者后保留旧 target、自指、下一段入场时点未到、无其他人物。无人物时环境推演仍可工作，不强迫建立人物库。

完成：实际发出的允许行动者/回应者集合与期望一致；UI 所需选择字段交 C，前后端同时拒绝越界。

### A02 · 两类后果贯通服务端与前端（50–70 分钟）

依赖 A01/O01。实现 shared 归一化、输出版本、server prompt、`buildAdvisorResult` 和 client parse，保留 `typedActions=[]`、无正文自动替换。

建立同一份 wire fixture，经过真实服务端公开处理路径后回前端，确认后果没有丢失或被另一个 summary/replacement 字段误执行。数组、字段和总长度都验证，未知字段按合同处理而非沿对象 spread 无界透传。

反例：合法文本+非法人物 delta、超长 quote、未知 fact、缺版本、空后果、旧 v1、无效 JSON、返回 shape 被 server 裁字段。

完成：从正常 `requestAdvisorTask` 入口得到两个合法带来源后果，旧任务不回归；本包结束即交 C 第一份可接线 DTO，不等 A 全线结束。

### A03 · 不可变分支账本与状态提交（50–65 分钟）

依赖 A02。从 frozen baseline + 本路线前缀计算 state。step 的文字和后果作为一个结果提交；验证不通过时不先追加文字再回滚 delta。

parent step/后果对象深冻结或等价不可变处理。分叉仅继承共同前缀的有效事件，后续彼此独立；同一 request/step 重复返回只应用一次。承诺拒绝、有条件接受、明确撤回保留不同状态，不能统一压为“信任加深”。

反例：A→fork B 后修改 B 的 nested delta 不改 A；撤回到第1步不能继续带第3步秘密；同一步 replay；非法批次不能留下一半知识；删除/淘汰旧路后的迟到结果。

完成：A/B 同一问题拥有不同有效后果，往返恢复后仍一致，正式 storage 无新增写入。

### A04 · 实際请求中的角色知情与第二步承接（45–60 分钟）

依赖 A03。为本次允许回应者建立已确认事实、本路新得知事实和未知项的薄视图；复用现有只读函数时先证明它没有偷偷初始化/迁移 store。当前 K 桥不包含角色知识，不得当作现成事实库使用。

下一步实际 question/envelope 加入有界累计状态。只包含选定路线，不能带另一条路正文、后果或 UI 对照摘要。参与者名单、行为对象和事实 refs 使用同一份授权源。

检查最终发送数据：如果旁白仍收到作者秘密，明确记录；本夜可以保证分支记录和许可视图正确，不能形式化保证单模型不会把读到的秘密说漏。不要为解决这个限制临时创建多角色 agent 链。

完成：两条路第二步请求明确不同且各自正确；超预算时 fail-closed 或按已定义非必需项策略裁剪，不通过追加 required 原文绕预算。

### A05 · 对照、矛盾与可处理失败（35–50 分钟）

依赖 A03/A04。实现纯 `compareRouteConsequences`，按对象和状态比较，不比较句子相似度。同一承诺条件不同要展示条件差异；某路未记录要区分于明确拒绝/未知。

本步正文与结构机械上矛盾、引用不合法或源 quote 缺失时返回 `needs-review`，保留输入和以前回应。提供给 C 明确重试/弃掉的动作与原因，不让作者看到协议名/堆栈。不用中文正则裁决所有文学语义。

接口完成：DTO和比较正反例经O确认成为api-ready，立即允许A06与C06继续。最终纵切在O02/O03核对正常UI中的C06差异展示后accepted；公共前缀不计为分歧，相同状态可无差异。A05不得等待C06全部完成才交接口。

### A06 · 选路转试稿的完整冻结（40–55 分钟）

依赖A04及A05的api-ready。A交`buildRehearsalDraftSource`，C接Authoring生成入口；接口自审可先交，跨UI最终accepted由O统一完成。点击时同时捕获路线、步前缀、状态及编辑目标；异步reconcile后仍使用该冻结快照，不能重新读取“此刻的rehearsal.steps”拼入旧route ID。

试稿生成仅传选定路线，现有 Ghost 的目标版本和来源检查继续生效。没有自行把后果注册为正式 scene、worldbook 或 memory；也不让 `worldChanges:[]` 变成根据散文猜出来的列表。

反例：A 点生成马上切 B、生成中继续 A、已有异路 Ghost、正文手改后 stale、流式失败重试、取消后晚返回。已有明确后果与作者后续改过的试稿不能被宣称始终相同。

完成：正常按钮生成的稿只包含选定路，来源 fingerprint 可核对，编辑/采纳/撤销走既有事务。

### A07 · 故障恢复与请求预算收口（35–50 分钟）

依赖 A02–A06。集中检查取消、超时、重新开始、书/章/绑定变化、显式重试。保留草拟行动、行动者/对象、旧路线；任何 rejected/stale 不改为可继续状态。

明确每次点击 request attempt；清楚区分模型修复和用户重试。正常一步不额外请求“摘要/裁判”，失败不后台无限重跑。与 C06 的模型设置回程合作，配置弹窗关闭后仍返回原 route/action。

完成：故障旅程 J08/J09/J10 跑通，失败分母有记录，未新增共享 watcher 或可写全局状态。

### A08 · 三场真实模型与三份所选路试稿（55–75 分钟）

依赖 A06/A07 与 C06 实接线。延用现有 MiniMax 服务端注入方式，使用合成作品；先修采样脚本的路线身份和读取，再开始计费请求。

三场分别为：秘密透露/隐瞒、请求合作/拒绝交换、同意守门/有条件守门。每场两路各两步，共12次最终请求；每场从一条指定路线生成一份试稿。A/B必须根相同、ID不同；第二步记录父状态，不能把切换失败后的同一步输出读两遍。

记录每次尝试、模型/渠道、原始结果、预期知情、实际后果、第二步是否继承、人物是否有目标/保留。采用前后正式数据变化单独核对；合成样本可归档，真实用户作品不得进入公开回执。

通过标准：身份/引用/分支隔离12/12；第二步6/6承接；三组差异有具体因果；三份稿不串路。逐条阅读秘密越界与承诺真实性，任一关键语义失败不能用结构通过抵销。达到总任务书30次 attempts预算停止采样，保留质量红项。

### A09 · 分线自审、拒收修复与封板（35–45 分钟）

依赖 A00–A08；模型受外部条件阻断时保留其状态，其他包正常封板。审查正常生产调用、正式零写入、schema下游和旧路径兼容，重点寻找“独立测试过了但没人调用”的模块。

完成后依据项目 skill 做分线 `verify:full`，交 O 可复验的 tree/commit、变更摘要和未验项。A 不能自己给跨线 UI 标 accepted。若 C 仍在接线，继续独立储备或配合修接口，不结束整个夜间会话。

## 4. 自动续接的储备任务

### A10 · 有来源的物品与位置后果（60–90 分钟）

前置：A00–A09 主功能可用；冻结前有≥90分钟，C可接相同后果列表。先物品，再位置，每个作为可单独合入切片。

物品只处理本场已明确的稳定对象：持有、交付、拒收。未知物品不创建世界条目；一把钥匙不能同时被两人持有，失败交付不扣旧持有者。位置仅用授权地点 ref、进入/离开，离場后的回应资格走A01相同规则。改变只在本路线，不能触发正式地图或现场写入。

完成：物品转移后第二步可用，换路原持有关系恢复；地点超出授权目录被拒绝。无法取得稳定对象时只完成可证明的一类，剩余标未实现。

### A11 · 采纳后的显式记忆候选（90–150 分钟，跨 C13）

前置：A06与真实采用 receipt 成立，C13有对应确认入口，O给出现有memory owner写锁；必须在T+5:00之前共同启动。

顺序：正文保存成功→从实际已采用且作者改过的正文定位来源→作者选中一项“记住”→现有 `queueMemoryCandidate` 生成 pending→现有确认/拒绝→确认后才 active。试稿删掉承诺原句时，不得沿用模拟 quote 直接入记忆；无法定位则保留人工候选编辑，不冒称有正文证据。

页面现有候选投影会过滤普通pending；A/C必须让该显式来源候选可达、刷新后可继续审阅。保存失败不入队，重复点击幂等，取消/拒绝零正式记忆，不把 step ref 当长期来源。无法完整实现，则整片不合入，不能留下不可见pending。

### A12 · 原 P3 的一个受限只读查询切片（60–90 分钟，条件包）

前置：主队列完成、现有统一工具执行器能在同一冻结权限内使用，O确认不需要新增多agent/通用DSL。先写实际授权目录和请求预算，再接一个现有只读资料查询。

最多一次成功 lookup，然后完成一步；工具结果只引用本场本书已授权资料，缺失/stale/取消不拓宽到全世界书。必须抓到真实 tool call→tool result→后续回复；模型没调用时报告未覆盖。工具不可用按同样已授权初始资料明确降级，权限拒绝不被当可重试网络错误。

仅合同侦察不算已实现 P3。工具闭环需要更大改造时交具体阻断和下一切片，继续A10/A13，不反复搭新框架。

### A13 · 有界节奏约束的小实验（45–70 分钟）

前置：没有安全红项，A08有基准样本，剩余模型预算足够；与C只需一个次级选项，不能新建配置页。

优先读取既有作者要求中“克制推进/允许冲突升级”，只改变请求约束；无明确选择默认现状。不得为满足节奏凭空出现陌生人、脚步或灾难。用同一场的少量可审读对照判断目标/代价是否更明确，不能以字数和感叹号证明有趣。

若样本无改善，保持实验结果供决策，不默认启用。禁止自动危机评分器、作者货币和关系数值系统。

## 5. A 线不能越过的验收边界

一份最终回应可同时“schema通过、人物行为失败”。报告必须能表达这种情况。单模型看到作者秘密时，角色知情视图只能约束生成，不能证明信息隔离已被数学保证。任何 formal writes 都必须来自既有显式采纳/记忆确认；内存后果不属于正式世界历史。

本线 summary 控制在500字左右，详细样本和矩阵链接出去；给O的交付先列红项、再列提交和生产调用证据。
