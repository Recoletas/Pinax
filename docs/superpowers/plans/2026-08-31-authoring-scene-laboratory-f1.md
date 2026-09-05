# Authoring F1 双态故事实验室第一阶段实施计划

**日期：** 2026-08-31
**状态：** F1-0–F1-7 自动化 Gate 已完成；首轮最终截图未通过用户视觉确认，正在收敛实验室信息层级与移动端现场，之后重新截图并做真实作者文本盲读
**上位产品真源：** [Pinax integrated product roadmap](../../plan/pinax-integrated-product-roadmap.md)
**前置实现：** [Authoring 真实页面可见切片推进计划](./2026-08-29-authoring-visible-slice-rollout.md) 的 C1-0–C1-7
**调研输入：** [F1 30 秒闭环机制调研](../research/2026-08-31-f1-30sec-loop-mechanic-brainstorm.md)
**视觉方法：** [视觉对齐工作流](../../engineering/visual-alignment-workflow.md)

## 0. 执行结论

下一阶段不开发两套 Pinax，也不复制一份游戏化 Authoring。产品继续只有一个正文、一个项目真源和一个 Authoring 工作台；第一阶段只让同一落笔处具备两种任务状态：

- **写作态**：作者已知道要写什么，继续使用短 Ghost、直接长推演、重写、批注和查设定；安静、低干扰、无选项税。
- **推演态**：作者明确点击“推演本场”，或从当前场把一个人物/地点“带入推演”；系统先展示一个有来源的场景压力和 2–3 个因果方向，作者选定后再进入现有可编辑 Ghost。

F1 的唯一产品闭环是：

```text
落笔处 / 当前场
  → 从世界书带入人物或地点（可选）
  → 有证据的场景压力
  → 2–3 个“行动 / 眼前所得 / 代价”方向
  → 选一条形成一个场景节拍草稿
  → 同一可编辑 Ghost 中调整正文与轻量单元边界
  → 一次采纳为若干稳定 writingUnit
  → 只显示本次事务真实产生的正文、现场与历史回响
```

F1 不以“增加多少游戏机制”为成功标准。成功标准是：作者在不离开正文、不进入聊天页、不理解内部 schema 的情况下，能在约 30 秒的人机操作时间内完成一次有意义的剧情选择；模型等待时间单独记录，不拿等待时间伪装交互效率。

## 1. 为什么现在做这一刀

### 1.1 C1 已经提供可信底座

C1 已经完成并冻结以下能力：

- 稳定的 project/document/chapter/writingUnit/node/caret 目标；
- 一次性 `AuthoringRunSession`、最终 manifest 与实际 provider receipt；
- 当前场人物/地点的“纠正当前 / 安排下一段 / 仅供本次”三种作用域；
- 最多三条速记/素材的本次参考；
- 长推演与当前块重写共用可编辑 Ghost；
- 采纳、放弃、撤销/重做、保存失败重试、迟到结果与 stale 隔离；
- observer 与记忆候选恰好执行一次；
- 固定左右栏、块下 Ghost、1024 覆盖检查器和 390 sheet。

F1 必须把这些能力组合成作者能感知的故事任务，不能重写第二条生成和采纳链。

### 1.2 SoloEnt 证明外壳成立，但没有解决 F1

本地 SoloEnt 0.8.2 与公开手册显示，它当前采用：

- VS Code 三栏工作区；
- Cline 衍生的 Plan / Act Agent；
- 本地文件项目；
- `SOLOENT.md` 项目摘要与详情文件指针；
- Rules / Workflows / Skills；
- BYOK、官方模型和订阅。

可借鉴的是稳定三栏、布局聚焦、本地项目、摘要后按指针展开、Agent 权限透明和工作流产品化。不能照搬的是：

- Plan / Act 只是“先讨论 / 允许改文件”，不是故事推演；
- 人物、地点和当前状态主要靠 Markdown 约定与 Agent 维护，缺少稳定实体、revision 和原子事务；
- 通用 Agent 直接改文件，不如 Pinax 的 Ghost → 编辑 → 采纳边界安全；
- 没有“加入人物后场面如何变化”的实时领域反馈。

因此 F1 的目标不是追平 SoloEnt 的 Agent 壳，而是使用 Pinax 已有领域真源做出它没有的场景实验能力。

## 2. 八条不可退让的产品约束

1. **正文仍是唯一主舞台。** 推演态出现在目标 writingUnit 下方，不打开第二编辑器，不跳到 Experience，不把正文缩成聊天附件。
2. **作者明确触发。** 光标移动、停留、改字、空格、斜杠、保存和记忆观察都不能自动启动 F1；只有“推演本场”或明确的“带入推演”动作能进入。
3. **普通续写不强制戏剧化。** 写作态的短 Ghost、直接长续写与重写保持原语义；只有推演态要求方向包含真实取舍。
4. **方向不是风格按钮。** 禁止“紧张 / 温柔 / 文学”等同一事件的语气变体；每条必须改变人物行动或信息处置，并写清眼前所得与代价。
5. **证据先于建议。** 人物、地点、关系、目标、未决事件和规则必须来自本次冻结 session；缺少证据时明确说“当前信息不足”，不得编造一个压力维持 UI 热闹。
6. **选择仍是草稿，不是事实。** 未选方向、落选方向和方向规划结果都不写正文、当前场、世界书、记忆、素材、大纲或 localStorage。
7. **采纳回响必须来自真实事务。** 只显示 adoption receipt 中实际发生的 scene/outline 变化；observer 候选、模型声称和推测后果不能冒充世界变化。
8. **一个工作台，两种密度。** 第一阶段不增加全局“工具版 / 游戏版”开关；先用显式任务态验证价值，连续真实使用成立后再考虑常驻布局预设。
9. **writingUnit 不是完整场景。** 它只承担稳定寻址、局部编辑、移动、批注与事务边界，允许只含一段，也允许包含少数连续段落；“完整行动/发现/代价”由上层 beat，“完整时间地点与在场状态”由 scene 承担。
10. **块类型不得一维互斥。** “环境”是对象，“描写”是叙事功能，“改变世界”是作用；后续只使用多轴语义侧写，禁止把环境/描写/动作/对话做成一排互斥 `unitKind`。
11. **分类不能替代因果。** 下游影响优先沿稳定 unit 引用、世界书属性、历史事件和场景/节拍关系判断；文本相似或向量召回最多发现漏标候选，不得直接决定需要修改哪些正文。

## 3. 明确不做

以下内容不属于 F1 第一阶段，出现需求时登记到后续候选，不顺手实现：

- 两个独立产品、两套路由、两份正文或两套 Authoring 组件树；
- 作者等级、货币、连续签到、经验值、成就和 RPG HUD；
- 每场强制 progress clock / countdown clock；
- 自动创建永久伏笔、永久钩子或世界事实；
- 角色私密想法、角色知识账本与信息不对称持久化 schema；
- 未选择方向自动进入记忆或探索文档；
- 一次生成多个完整长文版本；
- 多镜头、多角色视角矩阵和 swipe 版本历史；
- 自动 Sticky Trigger、自动强冲突和每次采纳后的 hard move；
- 新 observer 类型或新的长期记忆写入路径；
- 完整素材页搬入 Authoring、素材管理重构或素材成为 F1 前置；
- 历史/政治系统扩建、地图 P1.7 region/local LOD、地图渲染器修改；
- `PINAX.md` 导出、技能市场或自定义工作流编辑器；
- 为 F1 拆分整份 `Authoring.vue` 的大重构。
- 自动重写所有受影响后文，或把一次“世界意志介入”直接提交为多处正式修改；F1 只建立可解释影响范围与可审阅草稿边界。
- 把 AI 推断的环境/人物/事件标签立即写进正文 schema；第一阶段先做按 `unitId + unitRevision` 失效的派生投影，验证稳定后再决定是否进入持久 sidecar。

## 3.1 文本块设计纠偏：借 Jupyter 的分层，不复制它的扁平结构

[Jupyter nbformat](https://nbformat.readthedocs.io/en/5.2.0/format_description.html) 的 cell 只保留少数基础类型，把稳定 ID、metadata、source 和 output 分开；cell 无须独自构成完整论证。[Jupyter Cell ID JEP](https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html) 进一步把可跨修改引用的身份从 tags 中独立出来。Scrivener 的正文文档同样允许自由粒度并外附 synopsis/label/status，[Plottr Scene Cards](https://docs.plottr.com/article/58-timeline-starter-templates)、[Campfire Timeline](https://www.campfirewriting.com/timeline-maker) 与 [Aeon narrative order](https://www.aeontimeline.com/guides/organize-a-separate-story-structure) 则把场景卡、canon event、人物地点和叙述顺序放在正文容器之外。F1 采用相同分层原则，但补上小说特有的 scene/beat：

```text
chapter
└── scene：时间 / 地点 / POV / 在场人物
    └── beat：一次行动、发现、决策或状态改变
        └── writingUnit：一至数段，可移动、批注、重写和追溯
            └── paragraph/node：光标、选区和精确 patch 锚点

正交关系图：worldbook claim / history event / entity ref
```

因此现有 WNB-6A 的 `unitId + nodeId`、split/merge/move 和 revision 继续保留；需要纠正的是“固定三段装箱”和“整次 AI 多段输出必为一个单元”的默认策略，而不是推翻稳定身份模型。

## 4. 信息所有权与页面构图

### 4.1 左侧当前场：只负责“现在是什么”

`AuthoringSceneRail` 保持当前场简报，不变成方向列表或任务面板：

- 时间；
- 在场人物；
- 当前地点；
- 一个最重要的未决事件；
- “调整”与“推演本场”入口。

左栏不得显示完整世界书详情、长解释、生成进度或三个方向。点击人物、地点或事件仍在右侧检查器打开详情。

### 4.2 右侧当前场详情：只负责“拿什么进入本次”

右侧继续承担当前场与世界书的连接：

- 纠正当前人物/地点并显式保存；
- 让某人物下一段入场；
- 让某地点成为下一段地点；
- 仅把人物/地点带入本次推演；
- 查看该实体的世界书来源；
- 地点若已有 `PlaceEntity` / map binding，只显示一行只读地图摘要与“在地图中打开”。

第一阶段调整动作语言，减少用户理解内部作用域的负担：

| 现有内部语义 | 作者可见动作 |
|---|---|
| current correction | 加入当前场 / 设为当前地点，最后“保存当前场” |
| next-passage | 让他下一段入场 / 下一段转到这里 |
| run-only | 带入本次推演 |

动作的持久化边界不变。右侧选择 run-only 或 next-passage 后，中央目标 writingUnit 下方才进入场景实验室；右栏自身不生成正文。

### 4.3 中央块下实验室：负责“接下来可能怎样”

F1 使用现有 block widget / composer 位置，在目标 writingUnit 后显示连续的 Review Tray，不使用浮动聊天卡：

```text
正文 writingUnit

┆ 推演本场
┆ 场景压力：莉娜必须决定是否让艾德加看见星图的回应。
┆ 依据：莉娜的目标 · 艾德加待入场 · 星图回应规则
┆
┆ ① 先隐瞒异象
┆    眼前所得：保住调查主动权
┆    代价：艾德加会察觉她有所隐瞒
┆
┆ ② 让他共同验证
┆    眼前所得：更快确认石柱规律
┆    代价：秘密和控制权同时交出去
┆
┆ ③ 借异象试探他
┆    眼前所得：观察艾德加是否早已知情
┆    代价：一次误判就会暴露莉娜的怀疑
```

视觉规则：

- 与正文使用同一内容轴、同一可读宽度和相同左右起点；
- 仅用一条低强度页边信号区分临时推演；
- 不为压力、依据和每条方向分别套卡片；
- 标题、行动、所得、代价形成文字层级，不能用三种高饱和颜色；
- 选中方向后才出现一个明确主动作“按此推演”；
- 可返回换方向；一旦开始生成，不允许重复发起；
- 方向阶段不显示 token、schema、候选 ID 或置信度小数。

### 4.4 Ghost：继续负责“写成什么”，同时允许校正单元边界

选定方向后，实验室原位过渡到现有 `AuthoringBlockComposer` / `AuthoringBlockDraft`：

- 顶部保留一行已选方向摘要，可返回方向阶段；
- 作者仍可补充导演注；
- 生成正文进入现有可编辑 Ghost；
- Ghost 仍是一张连续稿面，不显示卡片墙；系统只在段间给出低强度的建议单元边界；
- 作者可在段间执行“在此拆分 / 与上段合并”，无需理解 `unitId`；
- 一个节拍草稿可以形成一个或多个 writingUnit，每个单元通常一至三段，但“完整”不是硬门槛；
- 作者修改后采用、恢复原稿或丢弃；
- 不增加第二种候选正文组件；
- 不改变短 Ghost 的 Tab / 渐进采纳行为。

### 4.5 回响：负责“刚才确实改变了什么”

采纳完成后，在新 writingUnit 页边短暂出现结果，默认数秒后退成左栏的真实更新信号：

- `正文已加入（3 个文本单元）`；
- `艾德加进入当前场`；
- `地点改为藏剑庐`；
- `大纲节点“发现星图”已完成`。

显示规则：

- 正文变化来自编辑器采纳结果；
- 现场/大纲变化来自 adoption receipt；
- 若只有正文变化，只短暂显示“已纳入正文”，不伪造“世界发生变化”；
- 记忆候选继续走原有低干扰候选，不进入本次回响；
- 保存失败时显示“正文已暂存，尚未保存”，重试仅保存；
- observer 失败不得撤销已保存正文，也不得宣称现场已刷新。
- 文本单元数量来自实际 adoption result；不展示 AI 推断的“环境块/动作块”作为游戏奖励。

## 5. 数据与调用合同

### 5.1 `ScenePressureProjection`：纯函数，只整理证据

新增一个 Authoring 领域纯投影，不访问 store、localStorage 或 provider：

```js
{
  kind: 'authoring-scene-pressure-projection',
  version: 1,
  targetFingerprint,
  sessionFingerprint,
  availability: 'ready' | 'insufficient' | 'conflict',
  participants: [{ ref, name, roles: [] }],
  location: { ref, name, mapStatus } | null,
  evidence: [{ ref, kind, label, summary, revision }],
  pressureSeeds: [{
    kind: 'goal-conflict' | 'relationship-friction' | 'information-gap' |
      'unresolved-event' | 'location-rule' | 'explicit-author-intent',
    subjectRefs: [],
    evidenceRefs: [],
    summary
  }],
  exclusions: [{ ref, reason }]
}
```

来源只允许：

- 当前 writingUnit 的 caret 前缀和 C1 允许的前文窗口；
- 当前场 projection；
- 本次明确加入的 worldbook 人物/地点；
- manifest 实际入选的角色目标、关系、地点规则；
- 已确认的未决事件；
- 最多三条作者本次参考；
- 已采纳大纲；
- 已有 confirmed `PlaceEntity` 的一跳只读地点摘要。

禁止来源：

- 整本世界书；
- 未选素材；
- 其他章节全文；
- stale observer 结果；
- 未确认 emergence 候选；
- 远方地图、全量历史或政治资料；
- 模型自己新造的实体和规则。

`ScenePressureProjection` 不负责写出漂亮方向，也不声称推测是事实。它只提供受 revision 保护的证据集合和可能形成取舍的压力种子。

### 5.2 `SceneDirectionSet`：一次受限的临时规划

方向具有语义创造性。为了避免把三条模板排列冒充剧情推演，F1 允许在作者明确进入推演态后增加一次短结构化规划调用，但必须满足：

- 复用已冻结的 `AuthoringRunSession`；
- 不增加第二次上下文检索；
- 不开放 world/memory/geo 工具；
- 最大输出只覆盖三条短方向；
- 失败不自动重试多轮；
- 结果只存在当前内存；
- 关闭、切章、切书或 session stale 立即丢弃。

合同：

```js
{
  kind: 'authoring-scene-direction-set',
  version: 1,
  sessionFingerprint,
  pressureFingerprint,
  pressure: {
    statement,
    evidenceRefs: []
  },
  directions: [{
    id,
    title,
    action,
    immediateGain,
    cost,
    evidenceRefs: []
  }]
}
```

严格校验：

- 只能返回 2–3 条；
- `evidenceRefs` 必须是投影允许集合的子集；
- 不得出现未知专名、未知地点或未知人物；
- 每条必须同时有行动、眼前所得和代价；
- 任意两条不能只是同义改写或语气变化；
- 方向不能包含完整正文，不写 scene/outline/state delta；
- 方向标题短，所得和代价各只表达一个主要结果；
- 证据不足时返回 typed `insufficient-evidence`，UI 不生成模板凑数。

规划失败的退路是保留作者指令，并提供“直接生成普通推演稿”；不能在后台悄悄换成无证据的三选一。

### 5.3 `AuthoringSceneLabRun`：一次临时运行，不是新真源

页面只保存一个内存对象：

```js
{
  target,
  runSession,
  pressureProjection,
  directionSet,
  selectedDirectionId,
  phase,
  failure
}
```

状态机：

```text
idle
→ preparing-context
→ planning-directions
→ ready
→ direction-selected
→ generating-prose
→ editable-ghost
→ adopting
→ adopted

任一异步阶段 → failed | stale | abandoned
```

约束：

- 页面同一时刻只有一个 scene lab owner；
- C1 的短 Ghost、长 Ghost、重写和 F1 继续共用全局生成互斥；
- 方向准备后正文、当前场、世界书、本次参考或地点绑定变化，整体 stale；
- 选择方向后执行正文前再调用现有 live dependency collector；
- 使用同一 frozen session，不重新捞一份可能不同的上下文；
- 同 session 内重复查看方向不重调模型；改变人物/地点/指令才新建 session；
- 不持久化方向缓存，不在刷新后恢复落选方向。

### 5.4 方向如何进入正文生成

`authoringTurnContract` 增加可选、run-only 的 `selectedDirection`，只包含：

- direction ID；
- action；
- immediateGain；
- cost；
- evidenceRefs；
- direction set fingerprint。

它进入本轮 turn，不进入世界书、scene anchor 或记忆。Narrative Kernel 的职责是把作者选定的因果方向写成一段正文，不得在正文阶段重新换方向。

如果作者修改 Ghost：

- 修改后的正文照常采纳；
- 模型原稿的自动 scene/outline delta 继续按 C1 规则丢弃；
- 作者此前明确选择的 next-passage 人物/地点 intent 仍按 receipt 规则兑现；
- 回响按最终实际事务计算，不按方向文字计算。

### 5.5 地点与地图只做只读轻桥

为了完成当前状态中已经排定的“当前场地点 → 世界书地点 → 地图”闭环，F1 在不修改地图引擎的前提下读取：

```text
scene location worldbook-entry:<id>
→ PlaceEntity
→ confirmed map binding（若存在）
→ 地图名 / 所属区域 / 一跳相邻 / 是否已落图
```

用途只有两个：

- 右侧地点详情显示一行真实摘要并打开现有地图标签页；
- location-rule 压力种子可引用已经确认的地点规则或一跳关系。

不得：

- 为了 F1 自动绑定地点；
- 把随机坐标写回世界书；
- 读取整张地图；
- 启动 region/local LOD；
- 让未落图地点阻止推演。

### 5.6 `UnitSemanticProjection`：多轴侧写，不是新的正文类型

F1-2 已完成的 `ScenePressureProjection` 保持不变。F1-4 以后新增纯派生侧写，只用于解释草稿边界、影响范围和后续实验，不写入 `WritingUnitV3.attrs`：

```js
{
  kind: 'authoring-unit-semantic-projection',
  version: 1,
  unitId,
  unitRevision,
  narrativeFunctions: ['description' | 'action' | 'dialogue' |
    'interiority' | 'exposition' | 'transition'],
  subjects: [{ kind: 'character' | 'location' | 'environment' |
    'object' | 'rule' | 'event', ref: 'canonical-ref-or-empty' }],
  effects: ['depicts' | 'asserts' | 'reveals' | 'changes'],
  evidenceRefs: [],
  confidence,
  source: 'deterministic' | 'generation-hint' | 'author-confirmed'
}
```

规则：

- 三个轴都允许多值；“环境描写”应是 `description × environment × depicts`，不能被迫在“环境/描写”中二选一；
- `changes` 必须有明确世界书 claim、历史 event 或当前场 delta 依据；出现环境词不等于改变世界；
- 侧写以 `unitId + unitRevision` 为缓存键，正文变化立即失效，不做打字时后台反复重算；
- AI 结果默认只是建议，作者确认的显式引用优先；低置信侧写只影响提示，不得扩大正式写入范围；
- F1 不新增 localStorage key，不把整章送去分类，不用向量库填补证据。

### 5.7 `SceneBeatDraft`：完整性上移到 beat，正文下沉为轻量单元

所选方向不直接等同一个 writingUnit，而先形成一次内存节拍草稿：

```js
{
  kind: 'authoring-scene-beat-draft',
  version: 1,
  sessionFingerprint,
  directionFingerprint,
  beat: {
    action,
    immediateGain,
    cost,
    evidenceRefs: []
  },
  prose,
  proposedUnits: [{
    draftUnitId,
    paragraphRange: { from, to },
    semanticProjection,
    boundaryReason: 'scene-transition' | 'rhetorical-shift' |
      'event-change' | 'length-guard' | 'author-split'
  }]
}
```

边界策略：

1. 标题、分隔线、作者注和来源引用继续独立；
2. 明确时间/地点/POV 转换必须断开；
3. 行动结果、对话轮和环境描写的功能发生明显转换时可以建议断开；
4. 同一短描写或同一连续对白不得为了“分类纯净”被切成碎块；
5. 长度只作为上限保护，不再把“恰好三段”当语义；
6. 建议边界在 Ghost 中可见、可撤销、可拆分/合并；作者确认前不是正文事实。

生成阶段不得为侧写再发一次模型请求。优先由本次正文响应携带受限 boundary hints；渠道不支持时使用段落/结构确定性降级，并明确标为 `length-guard`，不能伪装成理解了语义。

### 5.8 影响范围：设定断言与历史事件正交于文本块

F1 只建立影响解释，不自动批改后文：

```text
仅改措辞
  → 当前 writingUnit

修改地点/人物/规则的设定断言
  → 同一 canonical claim 的显式引用块 + 同场冲突

修改已经发生的事件
  → history event 的下游因果边 + 引用该事件的 beat/scene

修改当前场状态
  → 当前 scene 后续 beat + adoption receipt 允许的 scene delta
```

文本相似度只能列出“可能漏掉显式引用”的待审候选，不能越过 claim/event/scene 关系直接进入修改集合。后续真正的“世界意志修正”必须沿这套图生成多处 Ghost diff，由作者逐组或整批确认；不属于 F1 自动落地范围。

## 6. 可见状态清单

每个状态必须在真实页面有明确而克制的呈现：

| 状态 | 中央块下 | 右侧 / 左侧 | 作者动作 |
|---|---|---|---|
| idle | 仅块间“推演下一段 / 推演本场”入口 | 当前场简报 | 进入推演 |
| preparing-context | 一行“正在核对本场依据” | 选择暂时锁定 | 取消 |
| planning-directions | 保留依据骨架，不显示假方向 | 当前场仍可读，不可改 | 取消 |
| ready | 压力 + 2–3 条方向 | 证据可点回详情 | 选择方向 |
| direction-selected | 单条增强，其余退后 | 无重复摘要 | 按此推演 / 换方向 |
| generating-prose | 原位生成状态 | 不显示另一套生成状态 | 取消 |
| editable-ghost | 连续 Ghost + 克制的建议单元边界 | 实际参考摘要 | 修改 / 拆分 / 合并 / 采用 / 丢弃 |
| insufficient | 说明缺什么，不造选项 | 可去当前场添加人物/地点 | 补信息 / 普通推演 |
| failed | 本阶段错误和保留的作者输入 | 不弹全局错误卡 | 重试该阶段 / 普通推演 |
| stale | 方向保留可读但不可采用 | 标出哪个来源变化 | 重新核对 |
| persist-failed | Ghost 保持、编辑器锁定事务 | 当前场不提前更新 | 再次保存 |
| adopted | 页边短回响，含实际新增单元数 | 左栏真实更新 | 撤销 |

## 7. 实施切片

### F1-0：基线冻结与地点轻桥（已完成）

目标：先让当前场地点在右侧详情中可靠地串到已有世界书地点与地图，不开始方向生成。

任务：

1. 冻结 C1 三张基线截图、24 项最终视觉 Gate 和 31 项故障 Gate；后续 F1 不修改其成功定义。
2. 建立只读 location projection：canonical worldbook ref、PlaceEntity、map binding 状态和可打开路由。
3. 当前场地点详情显示“世界书来源 / 已落图或未落图 / 打开地图”；没有绑定时保持普通世界书地点，不显示伪坐标。
4. 1440 与 390 各截图一次，确认右侧没有变成地图小卡片，打开地图使用既有 workspace tab。

退出条件：同一地点可从当前场跳到世界书和地图；关闭地图后回到原书、原章、原 selection；未绑定地点不报错、不自动绑定。

### F1-1：纯 UI 场景实验室原型（已完成）

目标：先确认页面信息编排，不接 provider，不改采纳事务。

任务：

1. 用固定《雾港纪事》fixture 在真实块下渲染压力、三条方向、选中与 insufficient 状态。
2. 右侧从人物/地点点击“带入本次推演”，中央实验室更新；左栏保持摘要。
3. 只实现状态切换和焦点/滚动保护，不生成正文。
4. 1440 主状态、1024 右栏覆盖、390 当前场 sheet → 中央实验室三张对照；反复校对到正文轴、段距、信号色和方向层级稳定。

本切片需要用户视觉确认后才进入生产接线。方向未确认时不扩展全部状态样式。

退出条件：第一眼仍是正文；块下实验室不呈卡片墙；打开/关闭及右侧选择不改变正文 scrollTop、selection 和 writingUnit 几何。

### F1-2：压力投影与方向合同（已完成，后续不得改变 fingerprint 语义）

目标：建立唯一证据投影和临时方向状态，不写任何正式数据。

任务：

1. 实现 `ScenePressureProjection` 纯函数及稳定 fingerprint。
2. 实现 `SceneDirectionSet` parser、validator、重复方向检查、未知实体检查和 typed failure。
3. 从现有 `prepareSession()` 冻结一次 C1 session；方向规划与后续正文复用它。
4. 新增一次受限 structured planning 调用；禁工具、限输出、一次失败后由作者选择重试。
5. 用六组固定场景人工阅读：双人物目标冲突、待入场人物、地点规则、未决事件、作者显式参考、证据不足。

退出条件：六组中不存在未知实体；每个 ready fixture 至少两条方向在行动上不同；insufficient fixture 不输出模板方向；执行前后 localStorage 零变化。

### F1-3：当前场人物/地点 → 生产推演态

目标：把三个已有界面变成一条动作链。

任务：

1. 左栏事件空态改为明确“推演本场”，定位当前 writingUnit。
2. 右侧人物/地点保留“保存当前场”，将 run-only / next-passage 作者文案改为本计划语言。
3. run-only 或 next-passage 选择后打开同一块下实验室并保留现有 intent contract。
4. 当前场有未保存纠正时继续 fail-closed，不能带着未保存事实去规划方向。
5. 当前场人物上限、条目 stale、切换世界书和删除条目继续沿用 C1 门禁。
6. F1-1 的固定 fixture 与 `f1Prototype=1` 仅作为已完成视觉证据，不得继续成为生产数据旁路；生产 UI 只读取 F1-2 的正式 run 状态。

退出条件：作者能从当前场添加世界书人物、看到压力改变并辨认该人物为何影响方向；采纳前 scene anchor、正文、大纲和记忆仍为零写入。

### F1-4：文本单元边界与多轴语义校准（已完成）

目标：在接正文生产前，先证明“短而稳定的编辑单元 + scene/beat 上层 + 正交语义侧写”能处理真实小说，不把一次推演压成巨块，也不退回一段一块。

任务：

1. 建立 `UnitSemanticProjection` 与 `SceneBeatDraft` 纯合同；不修改 F1-2 压力/方向 fingerprint，不新增持久字段。
2. 选取至少三类固定样本：环境铺陈、多人对白、行动导致世界状态改变；另取一章真实导入小说作为长文样本。
3. 对比当前固定三段分组与新建议边界，人工标记“错误合并 / 过度切碎 / 跨场景 / 可接受”四类结果。
4. 验证三轴分类：叙事功能、对象、作用允许多值；重点区分 `environment × depicts` 与 `environment × changes`。
5. Ghost 中只显示细分隔/页边刻度，选中边界才显示“拆分 / 合并”；正文常态不展示类型徽章、彩色卡片或置信度。
6. 定义显式作者修正优先级和 revision 失效；本切片不启动打字观察器，不进行自动后文修改。

退出条件：场景转换漏切为 0；纯因“恰好三段”产生的边界为 0；环境描写不会被误报成历史变化；多人对白不会按每段碎裂；作者可在不离开 Ghost 的情况下调整所有建议边界。

### F1-5：方向 → 分段 Ghost → 多 writingUnit 预览（已完成）

目标：选定方向后仍只调用现有正文生产链，但结果先成为一个 beat 草稿，并在同一 Ghost 中形成可校正的轻量 writingUnit 计划。

任务：

1. 为 turn 增加可选 `selectedDirection`，保存 fingerprint 和证据 refs。
2. 选择“按此推演”前复核 live dependencies；同一 session stale 就阻止正文调用。
3. Narrative Kernel 接收方向作为明确作者意图，不再生成第二组方向，不允许工具越权补设定。
4. 同一次正文响应产生 prose 与有界 boundary hints；不为分类/分段追加 provider 调用。无 hints 时走诚实的确定性降级。
5. 原位进入 `AuthoringBlockDraft`；正文仍连续可编辑，建议边界随段落编辑更新或失效，作者可显式拆分/合并。
6. 采用前展示最终将形成的单元数和每个单元首句预览，但不显示内部 ID；编辑、恢复、丢弃和保存失败重试继续复用 C1。
7. 直接普通推演保持原路径；若其输出超过边界上限，也只使用同一轻量边界预览，不强制先经过方向规划。

退出条件：所选方向能在 Ghost 中辨认；落选方向不进入 prompt、receipt、正文、记忆或任何持久化；一次多段推演不再必然成为一个巨型 writingUnit；边界调整不重调模型；普通推演不增加方向规划调用。

### F1-6：原子批量采纳、真实回响与故障闭环

目标：将确认后的一个 beat 草稿原子写为一个或多个 writingUnit，并给出真实反馈，但不制造虚假世界状态。

任务：

1. 扩展现有 adoption transaction，使 `proposedUnits[]` 在同一次正文/sidecar 保存中获得稳定 unitId、共同 origin ref 与同一 sceneId；禁止循环逐个保存。
2. 批量采纳中任一单元、scene intent 或 outline delta 校验失败时整批不落地；首次 persist 失败仍只允许“再次保存”，不重新规划或生成。
3. 撤销/重做以整次 beat adoption 为边界，同时恢复全部新单元、现场和合法大纲变化；块内之后的独立编辑仍使用既有 unit 历史。
4. 从 editor result + adoption receipt 构建纯 `AdoptionImpactProjection`；页边显示实际新增单元数、现场和大纲变化，无 scene/outline delta 时不宣称世界改变。
5. `UnitSemanticProjection` 只解释“这批文字主要做了什么”；只有 receipt 中实际确认的 scene delta、worldbook claim 或 history event 才可显示 `changes`。
6. observer / memory 候选继续走原有通知，不混入回响；覆盖放弃、方向规划失败、正文空返回、迟到、stale、首次保存失败、observer 失败和撤销/重做。
7. 回响出现与退场不得推动正文、抢走焦点或形成永久“已保存”状态栏。

退出条件：展示项与 receipt 逐项相等；批量采纳不存在半数落地；虚假世界变化为 0；保存失败重试模型调用为 0；放弃与落选方向正式写入为 0；一次撤销能完整移除本次所有新增单元及其合法 sidecar。

### F1-7：视觉、移动端与第一阶段冻结

目标：完成真实用户任务、截图和整轮门禁，再决定是否升级为常驻双态布局。

任务：

1. 1440：当前场加入人物 → 三方向 → 连续 Ghost → 调整单元边界 → 批量采纳 → 回响完整旅程。
2. 1024：右侧覆盖检查器与块下实验室同时存在，正文不重排。
3. 390：当前场 sheet 选择人物后回到正文实验室；sheet 独立滚动、44px 触控、键盘不遮主动作。
4. 900 与 200% zoom：方向文字换行、长人物名、长地点名、长代价不横向溢出。
5. 深浅主题、reduced motion、键盘、Esc、IME 和快速连续操作审计。
6. 导入小说样本复验：连续阅读时看不见卡片墙，选中时能辨认 writingUnit，场景/对白/环境/行动样本边界符合 F1-4 校准结果。
7. 只保留三张最终证据，其余 `/tmp` 和过期截图清理。

退出条件：完成第 9 节全部 Gate；用户按真实截图确认方向后，F1 第一阶段才算视觉完成。

## 8. 真实用户旅程

### J1：写作态不被打扰

作者移动光标、输入、删除、空格、输入 `/`、触发短 Ghost、打开普通长推演。F1 不自动出现；普通长推演不先生成方向。

### J2：从当前场带入人物

作者点击当前场 → 人物 → 搜索世界书中的艾德加 → “带入本次推演” → 返回正文块下看到艾德加参与的压力与方向。关闭实验室后无任何持久化。

### J3：安排下一段入场

作者选择“让他下一段入场” → 选择方向 → Ghost → 将环境铺陈与人物行动拆成两个轻量单元 → 采用。两个单元与艾德加入场同批保存；回响按实际结果显示；一次撤销同时恢复。

### J4：地点与地图

作者查看当前地点 → 看到世界书来源与地图状态 → 打开地图标签 → 返回原书原章 → 选择“下一段转到这里” → 采纳后现场地点改变。

### J5：证据不足

空当前场、无明确人物目标、无地点规则和未决事件时，系统说明缺少的资料，允许直接普通推演或去当前场添加人物；不输出“谨慎/冒险/折中”。

### J6：Ghost 被作者大改

作者选择方向后大幅修改 Ghost，并合并/拆分建议边界。过期 semantic projection 失效；模型原 scene/outline delta 丢弃，显式 next-passage intent 按 C1 兑现，回响只显示实际 receipt。

### J7：方向 stale

方向生成后，作者在另一入口修改正文、世界书条目或当前场。原方向保留可复制和查看依据，但“按此推演”禁用并要求重新核对；不会调用正文模型。

### J8：迟到与快速切换

规划中切章、切书、关闭实验室再打开另一个 writingUnit。旧结果迟到不得覆盖新实验室，不恢复旧人物意图，不改当前 route。

### J9：保存失败

Ghost 已插入但首次 persist 失败。页面锁定本事务并显示“再次保存”；重试不重新规划方向、不重新生成正文、不重复插入、不重复 observer。

### J10：移动端往返

390px 从正文打开当前场 sheet，选人物，关闭 sheet 后焦点落到块下实验室；方向、Ghost、边界调整与采用动作都在单一正文滚动中可达，无嵌套横滚。

### J11：导入小说与环境介入辨析

导入一章同时包含环境铺陈、多人对白、行动转折和跨场景转换的小说。系统不按每段成块，也不固定每三段成块；作者选择一段环境描写时，可看到 `描写 × 环境 × 呈现` 的解释。把“雨色更暗”作为措辞/设定调整时只列同 claim 的明确引用；把“洪水冲垮桥梁”确认为事件变化时才沿历史/后续 beat 列出待审影响，不自动改写。

## 9. 验收 Gate

### 9.1 产品价值 Gate

用固定 fixture 与至少一组真实作者自有文本人工完成：

| 指标 | 门槛 |
|---|---:|
| ready 场景输出有效方向 | 100% |
| 未知人物/地点/规则 | 0 |
| 仅为语气或风格差异的方向组 | 0 |
| 每条同时具备行动、眼前所得、代价 | 100% |
| 方向 evidence ref 可打开真实来源 | 100% |
| evidence 不足时仍硬凑三条 | 0 |
| 作者从进入推演到发起正文生成的操作步骤 | 不超过 4 个主动作 |
| 未选方向持久化 | 0 |
| 场景转换被合并进同一 writingUnit | 0 |
| 仅因固定三段上限产生的语义边界 | 0 |
| 环境呈现被误判成历史事件 | 0 |
| 单次 provider 正文调用之外的自动分类调用 | 0 |

这里不设“模型一定写得有趣”的伪自动分数。最终采用人工盲读：隐藏方向顺序，判断三条是否真的导致不同后续；连续失败的 fixture 回到合同和上下文修正，不通过增加更多机制掩盖。

### 9.2 事务 Gate

- 规划方向、切换方向、关闭实验室：正文/现场/世界书/素材/记忆/大纲写入均为 0；
- 采纳前写入为 0；
- 采纳时正文 + scene intent +合法 outline delta 只 persist 一次；
- 一次 beat 的多个 writingUnit 必须单事务全成或全败，不允许部分插入；
- 保存失败重试只 persist，不调用方向或正文 provider；
- observer 与记忆候选最多一次；
- 撤销/重做正文、现场和大纲保持同一事务边界；
- stale/迟到结果正式写入为 0；
- 跨书、跨章、跨 writingUnit 的方向复用为 0。
- semantic projection 与 draft boundary 必须受 unit/session revision 保护，stale 后不得扩大影响范围。

### 9.3 UI Gate

- 第一眼先看到正文，不先看到方向卡片或 Agent 状态；
- 实验室、Ghost 与目标 writingUnit 同轴；
- Ghost 常态保持连续稿面，建议边界不得变成独立卡片；只有 hover/选中/调整时显露单元范围；
- 左右栏不随正文滚动；
- 打开/关闭右栏和实验室不改变正文 `scrollTop`、caret、selection；
- 1440 / 1024 / 900 / 390 / 200% zoom 无横向溢出；
- 390 sheet 独立滚动、主动作 44px、safe-area 正确；
- loading/ready/insufficient/error/stale/persist-failed/adopted 均有真实状态；
- 键盘 Tab 顺序、Enter/Space 激活、Esc 退出、焦点归还正确；
- `prefers-reduced-motion` 下没有位移过渡；
- 同屏只有一个主强调，Ghost 出现后方向强调退场。

### 9.4 回归 Gate

必须证明以下旧功能无回归：

- 短 Ghost 与渐进采纳；
- 普通长推演；
- 当前块重写；
- writingUnit split/merge/move、批注锚点、块历史与整批撤销；
- 批注、查找、大纲、设定、历史和上下文详情；
- 当前场三作用域；
- 最多三条本次参考；
- C1 故障矩阵；
- workspace tabs 路由恢复；
- 主题2亮/暗模式与 390 sheet。

## 10. 测试与截图纪律

遵守项目既有“完成足够大的行为切片后再测试”的约束：

1. **计划与原型期**：只读代码、静态检查和截图校对，不跑全量测试。
2. **F1-0 / F1-1 Gate**：已经完成相关浏览器旅程与截图，不因本次计划修订重跑。
3. **F1-2 Gate**：已经完成 focused 2 文件 / 12 用例、Vite build 与 diff check；稳定 fingerprint 与正式能力目录不回炉。
4. **F1-3–F1-5 Gate**：生产当前场、语义/边界校准与分段 Ghost 完整接通后，集中运行一次 focused contract + browser journey。
5. **F1-6 Gate**：原子批量采纳与故障矩阵整体完成后一次性跑 focused fault Gate。
6. **F1-7 整轮 Gate**：最后才运行 `verify:full`、Vite/VitePress build 和 diff check。

修一个文案、间距、函数或断言后不立即重跑全量；集中完成同类修正，再复验一次。只有编译无法载入、schema 崩溃或页面完全打不开等阻断错误可提前做最小检查。

测试文件预算继续保持 20：

- 压力/方向合同并入 `authoringAgentWorkflows.test.js`；
- turn/session/receipt 并入 `authoringTurnRuntime.test.js`；
- 当前场交互并入 `authoringSceneRail.test.js`；
- composer/ghost UI 合同并入 `authoringTurnComposer.test.js`；
- 不为每个新纯函数新建宿主测试文件。

浏览器 Gate 新增独立 `scripts/authoring-ui/f1-scene-lab-check.mjs`，复用现有 fixture、runner、provider mock 和 artifact 管理，不复制一套浏览器基础设施。

截图规则：

- 过程产物统一放 `/tmp/pinax-authoring-f1/`；
- 每轮最多保留基线、当前版和一张必要失败证据；
- 用户确认后仓库只保留：1440 方向态、1440 Ghost/回响态、390 sheet 往返态；
- 每张优先裁到工作台必要区域，单张建议不超过 1.5MB；
- 过期图、浏览器 profile、trace 和 provider mock 输出及时清理；
- 不启动、停止或重启用户已有 5173 服务。

## 11. 文件所有权与预计改动面

### 新增文件（上限）

- `src/services/agents/authoring/authoringScenePressureProjection.js`
- `src/services/agents/authoring/authoringSceneDirectionSet.js`
- `src/services/agents/authoring/authoringUnitSemanticProjection.js`
- `src/services/agents/authoring/authoringSceneBeatDraft.js`
- `src/services/agents/authoring/authoringAdoptionImpactProjection.js`
- `src/components/authoring/AuthoringSceneLaboratory.vue`
- `scripts/authoring-ui/f1-scene-lab-check.mjs`

是否需要单独的 `AuthoringSceneLaboratory.vue` 以真实 diff 为准；如果现有 `AuthoringBlockComposer` 能在不形成条件分支泥团的情况下承载方向阶段，则扩展现有组件，不为了文件整洁强拆。

### 主要修改文件

- `src/pages/Authoring.vue`：唯一页面编排 owner、内存状态机、现有 session 与 Ghost 接线；
- `src/components/authoring/AuthoringSceneRail.vue`：推演本场入口；
- `src/components/authoring/AuthoringSceneCuration.vue`：人物/地点动作语言与进入实验室；
- `src/components/authoring/AuthoringBlockComposer.vue`：已选方向摘要与普通推演兼容；
- `src/components/authoring/AuthoringBlockDraft.vue`：只在必要时显示方向来源，不改变编辑合同；
- `src/components/writing/WritingNotebookEditor.vue`：复用现有 split/merge 与页边信号呈现 draft unit boundary，不引入卡片式第二编辑器；
- `src/services/agents/authoring/authoringTurnContract.js`：可选 run-only direction；
- `src/services/agents/authoring/authoringNarrativeRun.js` / `narrativeKernelExecutor.js`：复用 session 的方向规划与正文执行边界；
- `src/services/agents/authoring/authoringRunSessionAdapter.js`：一次 prepare、live dependency 复核；
- `src/services/agents/authoring/writingAdoptionTransaction.js`：把一次 beat draft 的一个或多个 writingUnit 作为同一原子事务插入，并供 impact projection 读取 receipt；
- 现有四个测试宿主与 Authoring UI fixture。

### 不应修改

- 地图 renderer、worker、生成算法与 P1.6 Gate；
- 素材页、画布页和完整 Experience 页面；
- 新的 localStorage key；
- 世界书 entry schema；
- 记忆 schema；
- `writingUnit` schema；
- C1 已保留的最终截图和 Gate 含义。

## 12. 代码审查重点

实施期间逐函数检查以下风险：

1. 是否意外在方向阶段调用了现有正文生成；
2. 是否重新读取上下文导致方向与正文使用两份不同 session；
3. 是否把落选方向塞入 recent messages、memory 或 sourceRefs；
4. 是否通过 `directorNote` 字符串拼接丢失 direction fingerprint；
5. 是否把模型输出的 pressure / cost 当作 scene fact；
6. 是否在 Ghost 被编辑后仍应用模型原 scene/outline delta；
7. 是否把 observer candidate 算作世界回响；
8. 是否在保存失败重试时再次调用任一 provider；
9. 是否因右栏选择重建编辑器或改变 selection；
10. 是否让当前场编辑、普通推演和 F1 争夺两个 owner；
11. 是否为了复用 Experience emergence 把 runtime state、玩家 choice 或合法但无关的 state delta 带进 Authoring；
12. 是否新增了不能由 receipt 或 source ref 解释的 UI 状态。
13. 是否把“环境/描写/动作/对话”错误实现成互斥枚举，而不是 function/subject/effect 三轴；
14. 是否仍因固定三段或一次生成来源把整段长推演强塞进一个 writingUnit；
15. 是否为边界分类偷偷追加 provider 请求，或在打字/改字后触发重复分类；
16. 是否把 `depicts/asserts` 当作 `changes`，从而无依据扩大历史或后文影响范围；
17. 批量采纳、保存失败、撤销/重做是否可能只处理 proposedUnits 的一部分。

## 13. 第一阶段完成后的决策，而不是预承诺

F1-7 通过并由用户连续真实使用后，才回答是否提供常驻双态：

- 如果作者经常从当前场进入、会比较方向、会调整节拍/单元边界再采纳，升级为 Authoring 的“写作 / 推演”布局预设；
- 如果方向只在卡文时偶尔使用，保持“推演本场”显式工具，不增加全局模式；
- 如果方向质量依赖大量手工补设定，先改善当前场与世界书目标/关系表达，不增加游戏机制；
- 如果用户只想直接得到正文，保持写作态默认，绝不强迫经过 F1。

只有在这个闭环被证明后，后续阶段才可评估：

- 临时多视角草稿；
- 显式保存为探索文档；
- 角色知识差异；
- 从真实回响显式“保存为世界事实”；
- 把经验证的 `UnitSemanticProjection` 提升为可持久、可手工纠正的 sidecar，并用于导入小说批量审阅；
- 沿 worldbook claim / history event / scene-beat 关系生成“世界意志修正”的多处 Ghost diff；
- 可安装的推演工作流；
- `PINAX.md` 只读项目驾驶舱导出。

## 14. 完成定义

F1 第一阶段只有同时满足以下条件才算完成：

1. 当前场人物/地点、块下方向、节拍草稿、分段 Ghost、原子批量采纳与真实回响形成一条真实页面闭环；
2. 写作态的短 Ghost、普通长推演和重写没有增加步骤或自动干扰；
3. 方向证据全部可追溯，未知实体和模板三选一为 0；
4. 未选、放弃、失败、迟到和 stale 的正式写入为 0；
5. 保存失败重试与 observer 恰好一次继续成立；
6. writingUnit 不再以“完整场景”或“固定三段”为成功定义；一个 beat 可形成若干轻量单元，环境描写与环境事件可被正确区分；
7. 地点能从当前场到世界书及已有地图，只读、不自动绑定；
8. 1440 / 1024 / 900 / 390 / 200% zoom、键盘、IME 和 reduced-motion 通过；
9. 三张最终截图由用户确认；
10. focused Gate、C1 回归和最终 `verify:full` 全绿；
11. `/tmp` 过程资产清理，仓库只保留批准证据，状态文档同步。

在此之前，不宣称 Pinax 已经拥有“双模式”或“游戏化写作”；只能称为“场景实验室 F1 进行中”。
