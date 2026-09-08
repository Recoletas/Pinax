# 人物 IF 与统一创作对象：补充调研和取舍

日期：2026-09-08。仅调研/计划，不代表原型已实施或用户已选择正式产品方案。

承接[原调研](./authoring-character-fate-research-20260908.md)；执行建议见[第四轮夜间任务书](./authoring-overnight-round4-20260908.md)。

## 1. 判断：方向值得做，但不是同时做五个系统

最值得验证的是“作者只改一个条件，就能看到人物如何处理同一个难题”。这比给推演增加更多选项更接近创作价值：作者可以检验人物、发现情节，也可以把喜欢的结果带回正文。

“一切皆文件”可以降低资料组织成本，却不直接产生玩法；空间和回溯需要更严格的状态语义。建议先人物 IF，再资料提炼与薄对象适配，再空间动作，最后选择性记忆回溯。它们共用来源和试验隔离，但不合成一个万能数据库。

这一顺序是工程/产品判断，不是外部论文已验证 Pinax 的结论。若用户选择空间优先，应替换首个玩法目标，不同时扩成两套主原型。

## 2. 本次纠正的源码事实

原调研来自旧 integration 工作树；本轮将原文件逐字保留为 main 工作区的输入快照，SHA256 为 636c00cf1d148cacf883e00d97583e4bcb2b9cfccc8316eb26e5faf00f78341b。以下更新不反写原文。

| 查证对象 | 当前事实 | 计划影响 |
|---|---|---|
| main 05af532 + U 未提交文件 | 已有 src/services/project/knowledgeReadModel；不是 K 从零待建 | 不再派“新建知识底座” |
| K 5baa1b8（代码 8a0442d） | 验收后补了 UI 终态拒绝和启用 stale 旅程；独立失效焦点探针现为一次 prepare、零 mock provider、exit 0 | 老拒绝回退列已修单项复验，不重复修；完整点击/组合仍需新树验证 |
| U 最新 WIP | 延迟 focus 加销毁守卫，全局快捷键改为命名绑定/解绑及统一撤销入口；本次 verify:full exit 0，20/200、双 build/diff | 旧 5 异常不继续写为现存失败；J9 摘要仍失败、双栏/其他输入框需复验 |
| authoringSceneDirectionSet | 同一组需 2–3 个方向，拒绝高度相似行动；action/gain/cost 是提议 | 同组规则可以保留，但不得跨 A/B 强制行为不同；gain/cost 不升级成已经发生 |
| authoringSceneLaboratoryRun | 可冻结 run/session、生成方向、选择和复核依赖；selection 只传一个方向到正文 | 复用调度和采用，新增会话级试验标识；不是复用成世界分支引擎 |
| Authoring 的正文调用 | 选方向后 instruction 当前为空，页面只管理一份活动实验/草稿 | 追加要求和 A/B 必须接到实际请求与旧稿保存，不是 UI 多一个 textarea |
| pressureProjection | participant 投影主要是 ref/name/roles；evidence 摘要来自现有块 | 不含可直接覆盖的正式 belief 字段，也不保证逐人物秘密隔离 |
| authoringDocumentRepository | exploration 可存正文、sourceRefs；规范化舍弃任意新字段，创建随机 ID | 留作构思可复用；结构化试验不能假装随便塞字段会持久化，防重复需调用侧串行化 |
| projectKnowledgeFacade | 只按 readers 解析和排序 authority | 可接薄引用适配，不是授权器或统一写库 |

源码入口：[方向解析](../../src/services/agents/authoring/authoringSceneDirectionSet.js)、[场景 run](../../src/services/agents/authoring/authoringSceneLaboratoryRun.js)、[压力投影](../../src/services/agents/authoring/authoringScenePressureProjection.js)、[探索稿仓储](../../src/services/writing/authoringDocumentRepository.js)、[知识 facade](../../src/services/project/projectKnowledgeFacade.js)。

## 3. 新查一手资料：借机制，不借规模

- Inform 将门建模为地点之间的对象，开关/锁定及动作处理决定可否通行。启示：空间连接和条件是可执行语义，分类文件夹不是。首轮无需地图、物理引擎或通用 DSL。[官方手册 §13](https://inform-fiction.org/manual/html/s13.html)
- ink 运行时将继续输出与等待选择分开，另有保存/加载状态。启示：在关键选择处暂停是正常叙事交互，不必让 Agent 一次自动跑完人生；保存运行状态也不等于角色继承旧循环记忆。[官方运行时文档](https://github.com/inkle/ink/blob/master/Documentation/RunningYourInk.md)
- Anytype 对象具备类型、属性、正文及 space/object 身份。Obsidian 属性是在笔记上增加结构。启示：可让自由输入渐进成为有类型资料，没必要让所有对象共用物理存储和编辑表单。[Anytype](https://developers.anytype.io/docs/guides/get-started/objects/)、[Obsidian](https://obsidian.md/help/properties)
- Generative Agents 的研究架构组合经历记录、检索、反思和规划，作者报告了这些部分对行为可信度的作用。它不是“人物卡写一句性格就能保证一致”，也不证明多 Agent 是 Pinax 当前必需。这里仅核对摘要，不借其研究结论宣称本项目已具备认知隔离。[论文摘要](https://arxiv.org/abs/2304.03442)

本次没有评测上述软件、安装依赖或调用真实模型；外部机制不能代替本项目实页验收。

## 4. IF 原型的四个关键设计修正

### 4.1 改的是显式试验条件，不伪称改掉角色全部人格

现有角色性格是自由文本，不适合凭字符串替换判断某条信念已被完整替代。首版由作者确认一份短场景输入和 A/B 信念条件；两边都标“本次假设”，不声称 A 自动等于正式人物心理。

试验使用同一经作者确认的有限事实包，角色旧全文只供作者查看，不在背后再次全文注入。若不允许局部覆盖后排除原块，就必须提示冲突并停止，不能把新旧信念一起当事实。不得改普通推演的全局上下文规则。

### 4.2 同基线不是分别重新检索两次

一次冻结事实/目标/revision/model 配置，再派生 A/B；除被指定的一条条件和非语义 run 标签外，语义输入相同。条件相同的 A/A 对照也允许运行。不能自动把 A 结果喂给 B，让 B 刻意“换一种”。

每支保存独立 requestId、proposal、作者确认和草稿。改条件创建新代次；迟到结果仅属于旧代次，不能覆盖当前分支。

### 4.3 先提出行动，再由作者确认“按此假设继续”

沿既有方向 action/evidence/gain/cost 展示可能行动，作者选择后才写正文。软关系结果仍标预测或未定；作者确认仅对该 IF 有效，不写正式世界事件。不新增隐藏评审模型或索取内部思维过程。

正文与作者确认不一致时允许标记“与本次选择不符”并退回；结构校验只查身份/引用，不能宣布任意自然语言矛盾已被机器证明。

### 4.4 趣味性不能用 mock 数量验收

夜间 mock 验证操作、请求内容和隔离。真实模型和作者评测后置，保留普通提示词对照：同一事实/约束/模型，比较操作成本、具体选择、作者是否愿意再试及可采用性。相同行动不自动失败，更多冲突也不自动加分。

## 5. 统一对象层：本轮可做的有用小步

只读 adapter 返回 owner/nativeId/project/sourceRevision/capabilities 与可定位引用，正文按需从原 owner 读取；初期覆盖 exploration、worldbook entry（含角色/地点）、chapter，不创建通用写库。逻辑引用包装不能替换所有既有 sourceRef，也不能让模型从引用获得额外权限。

第二步可做“速记→多个对象候选”的预览与来源归档：保留原笔记，确认标题/类型/原文片段，同名仅建议链接。正式建卡应走现有审阅链；本夜没有足够 owner 适配时只留作构思，不能把候选 UI 宣称正式对象转换已完成。

空间动作首轮仅做合成状态的条件裁决实验（开/关/未知、进入/放下/取回，固定出口），不接正式地图和历史。这是储备实验，不与人物 IF 争第一条用户闭环。

## 6. 工程与夜间组织建议

本轮要增加真实队列容量，而不是增加“8h”字样：补旧 U、人物 IF、引用/提炼、反例/恢复/可达性分别产出代码和可检查结果。

owner 启动前真正测试接续，worker 不自验通过；主包被一个难题阻断仍能领取纯状态机、fixture、adapter 等独立包。缺 owner/运行器就报告启动失败，不将普通单次会话冒充夜间执行。任务书既给总队列，也给最先必须交付的路径与不做清单。
