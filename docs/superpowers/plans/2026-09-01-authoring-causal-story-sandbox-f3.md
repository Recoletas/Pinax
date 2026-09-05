# Authoring F3 因果故事沙盒与活故事图谱计划

**日期：** 2026-09-01
**状态：** F3-0～F3-5 已完成；下一窗口为 C2-3 一个 intervention 的共同排演整合
**上位产品真源：** [Pinax integrated product roadmap](../../plan/pinax-integrated-product-roadmap.md)
**前置执行计划：** [Authoring F2 作家助手成熟编辑器能力对齐](./2026-09-01-authoring-writer-assistant-parity-f2.md)
**协作接入计划：** [Authoring C2 创作协作平台](./2026-09-01-authoring-collaboration-platform-c2.md)
**能力前置：** [Authoring F1 双态故事实验室](./2026-08-31-authoring-scene-laboratory-f1.md)、[Authoring 文本工作台 v3](./2026-08-25-authoring-text-workbench-v3.md)
**调研输入：** [F5 同人/IP/世界意志](../research/2026-09-01-f5-fanfic-deep-research.md)、[F6 非同人趣味方向](../research/2026-09-01-f6-pinax-interestingness-directions.md)

## 0. 执行结论

F2-1～F2-7 的代码与自动化 Gate 已完成，资料助手、画师、校对、全文搜索、自动历史与最终响应式验收均已提供正式接口；视觉截图仍可按用户意见做小切片修正，但不再阻止 F3 的领域实现。F3 现在开始执行，同时允许 C2 在独立 worktree 推进协议与可靠性底座。

F3 的核心闭环固定为：

```text
作者改变正文中的一个故事条件
  → 助手证据接口解释原条件和相关资料
  → 场景实验室在零正式写入下排演少量后续
  → 搜索/校对索引补充可能受影响的文本位置
  → 作者在双栏中逐组审阅可编辑 Ghost
  → 自动历史保护修改前状态
  → 统一采用回执写入正文及作者明确确认的现场/大纲/历史/世界事实
  → 画师可把已选场景或排演分支转成有来源的视觉 brief
```

F3 不是互动小说制作器，也不是自动修整本书的 Agent。它是正文里的**因果故事沙盒**：作者拨动故事的一根线，人物、地点、历史、世界事实和后文以有依据、可预览、可撤回的方式回应。

## 1. 当前状态与唯一执行顺序

### 1.1 当前事实

- F2-1 已完成构思、速记与推演夹归位；
- F2-2 已完成真实第二窗、章节/速记编辑、资料查看、活动窗命令 owner 和主副窗状态隔离的可见主链；
- F2-3 已完成快捷切换、正文实体歧义、活动窗智能快捷词、五类取名与显式建为世界书条目；
- `AuthoringEntitySelection` 已冻结为纯选择合同，插入文字与创建条目独立；创建成功返回稳定 `worldbook-entry:<id>`，同名与未绑定状态均 fail-closed；
- F2-4 资料助手已完成：`AuthoringEvidenceEnvelope` 统一七类资料 authority、稳定 locator/revision 和精确只读 source authorization；未保存主稿/速记与副栏 target 进入同一冻结边界，回答 stale 后仍可回看但不可冒充 fresh；
- F2-5 已冻结 `AuthoringVisualBrief`，F2-6 已冻结 `AuthoringReviewFinding`、稳定位置索引与自动历史边界，F2-7 四组真实页面 Gate 合计 152/152；
- F3-0 已完成：纯内存 `NarrativeIntervention`、`TypedNarrativeLink`、有界影响投影与 stale 对账已冻结；四组 fixture 中 C 均为 0 误报/0 漏报，A/B 各有 2–3 个误报；
- F3-1 已接“改变一个故事条件”的单一正文入口；可见页面仍由单一 integration owner 逐切片接入；
- F3-1A 完成 `AuthoringInterventionSession`；F3-1B 已把正文块下表单接入该 session，桌面原位、390 bottom sheet，提交前后均不请求正文模型或写正式数据；
- F3-2～F3-4B 已贯通确定/候选影响、排演范围、分组 Ghost、单组/多组采用、真实回响与安全撤销；多组保持一个 umbrella receipt，后续手改组不会被撤销覆盖；
- F3-5 已完成当前章只读活故事投影：场景/节拍、人物/地点/线索和显式因果/兑现均从 canonical refs 即时派生，不形成第二数据源；
- C2 同期只做协议、持久化、身份、恢复、安全和 transport，不修改 Authoring 核心页面；两轨在 F3-2 后通过纯 artifact adapter 合流。

### 1.2 执行顺序

| 顺序 | 执行切片 | 同时冻结的复用接口 |
|---|---|---|
| 1 | F2-3B 取名质量收口 | `AuthoringEntitySelection`：插入文字与创建条目分离 |
| 2 | F2-4 资料助手完整闭环（已完成） | `AuthoringEvidenceEnvelope`：证据、locator、revision、授权 |
| 3 | F2-5 画师完整闭环（已完成） | `AuthoringVisualBrief`：选区/单元/当前场/以后排演分支的统一视觉输入 |
| 4 | F2-6 校对、全文搜索、自动历史（已完成） | `AuthoringReviewFinding`、`AuthoringPositionIndex`、历史保护边界 |
| 5 | F2-7 自动化与真实页面 Gate（已完成，视觉意见可小修） | `AuthoringSurfaceHandle`：正文、双栏、sheet、抽屉的统一定位/恢复 |
| 6 | F3-0 深调研与离线 fixture（已完成） | 4/4 对照通过并冻结 intervention/typed-link/影响投影 |
| 7 | F3-1 单一干预入口（已完成） | 从一个正文条件形成零写入、可撤销的 intervention |
| 8 | F3-2～F3-4 因果沙盒闭环（已完成） | 影响组、分组 Ghost、采用/撤销；与 C2 共同排演合流 |
| 9 | F3-5 活故事图谱最小投影（已完成） | 同一事实的场景/因果视图，不建第二数据源 |

F3-0/F3-1 与 C2-0/C2-1 并行。F3 不感知 room/socket；C2 不重算因果或证据。F3-2 稳定后只通过 `CollaborableArtifact` 与 `CollaborationPromotionRequest` 两个中立合同合流。

## 2. F2 各能力如何接入 F3

### 2.1 F2-3 快捷词与取名

- 快捷词继续只是输入辅助，不承担世界事实识别；
- 取名候选插入正文与“创建人物/地点/组织/道具/能力条目”严格分开；
- 显式建条目后返回稳定 `worldbook-entry:<id>`，可立刻加入当前场或以后用于 intervention；
- 同名冲突沿现有正文实体歧义选择，不生成第二套实体 matcher；
- F3 改变角色/地点条件时复用同一实体选择器。

### 2.2 F2-4 资料助手

F2-4 不只是一个聊天 UI，它必须输出可复用的证据合同：

```text
AuthoringEvidenceEnvelope
  projectId
  queryIntent
  claims[]
    text
    authority: manuscript | worldbook | outline | history | scene | memory | suggestion
    confidence: supported | partial | unsupported
    evidenceRefs[]
  evidence[]
    sourceRef
    locator
    excerpt
    revision
  missingInformation[]
  createdAt
  fingerprint
```

F3 用它回答：原条件从哪里来、哪些人物知道、哪些文本明确依赖、资料是否已变化。助手和 F3 不得各建一套 source authorization、检索器或 locator。

### 2.3 F2-5 画师

画师按原计划完整实现，并新增统一输入合同：

```text
AuthoringVisualBrief
  projectId
  sourceKind: selection | writing-unit | scene | rehearsal-branch
  sourceRefs[]
  sourceRevisions{}
  proseExcerpt
  scene
    characterRefs[]
    locationRef
    time
    visualFacts[]
  authorDirection
  referenceAssetIds[]
  fingerprint
```

现有实现已消费 `selection / writing-unit / scene`；F3 冻结 `RehearsalBranch` adapter 后增加 `rehearsal-branch`，无需改画师 provider、媒体存储和结果采用链。

打通后的体验：

- 作者在排演中选中“暴雨中的追逐”，可直接送画师预览氛围；
- 图片结果保留该分支、人物、地点和文本单元 source refs；
- 放弃排演分支不会删除已显式保存的素材，但素材显示“来源分支未进入正文”；
- 图片永远不能反向自动写正文或世界书。

### 2.4 F2-6 校对、全文搜索和自动历史

校对与搜索输出统一 finding，而不是只渲染列表：

```text
AuthoringReviewFinding
  id
  kind: proofing | consistency | search | dependency-candidate
  target
    documentId / chapterId / unitId / nodeId / revision
  reason
  evidenceRefs[]
  confidence
  status
```

- F2 校对只处理错字、标点、语病、称谓和明确一致性问题；
- F3 可以把同一位置索引用于发现 `mentions/similar-to` 候选，但候选不能直接决定修改；
- 全文搜索结果继续是稳定 `unit/node` locator，F3 不再扫描整章字符串；
- 自动历史在 F3 生成跨章 Ghost 前建立保护边界，采用事务仍使用自己的 receipt；
- 恢复历史后，旧影响组和助手回答按 revision 变为 stale。

### 2.5 F2-2/F2-7 多窗与表面恢复

- 影响组点击目标时复用现有双栏打开另一章；
- 资料证据继续在只读资料窗显示；
- 主副窗活动 owner 决定 Ghost 和写命令归属；
- 移动端用内容 sheet 顺序审阅，不缩放成双栏或无限画布；
- 打开/关闭助手、画师、影响组和历史都必须恢复原 caret、selection、scrollTop 与焦点。

### 2.6 C2 协作接缝

F3 从开始就为协作保留可序列化投影，但不引入任何网络依赖：

- `NarrativeIntervention`、direction set、`CausalImpactGroup`、`RehearsalBranch` 各提供纯 `toCollaborableArtifact()`；
- 投影只能包含作者明确共享的 visible payload、稳定 locator/revision、authority、evidence refs 与 fingerprint；
- 投影不得携带 repository、Vue ref、函数、AbortController、provider config、完整 evidence envelope 或未授权来源；
- C2 可让 reviewer 对 artifact 提方向、投票和评论，但不能修改 F3 对象；
- 房主选择后，C2 只返回 `CollaborationPromotionRequest`；Authoring bridge 复核 live revision/fingerprint/host epoch 后调用 F3 本地方法；
- 远端 branch 提升为 Ghost 后，后续编辑、history、persist、observer、adoption 和 undo 全归 F3/Authoring，本地断网不影响完成；
- F3 adoption receipt 只向房间投影低敏状态，不同步正文 diff、世界书变更内容或内部 transaction。

首个协作纵切固定为“一个 intervention + 少量方向 + 一个选中 branch”，通用 writingUnit 改稿、助手答案和画师候选在共同排演稳定后再接。

## 3. F3 产品原则

1. **正文是唯一主舞台。** intervention、排演和 Ghost 围绕目标 writingUnit，不要求跳到素材页或 Experience。
2. **writingUnit 是稳定编辑容器。** scene/beat/history/worldbook claim 拥有上层语义，不能把所有事实塞进文本块。
3. **一次只改变一个明确条件。** 首期不接受“把整本书改好”。
4. **显式关系决定影响，模型只补候选。** 词法和未来向量结果不得直接进入修改集合。
5. **排演零正式写入。** 未采用分支不写正文、当前场、大纲、历史、世界书或记忆。
6. **影响组先解释再生成。** 作者先看为什么受影响，再决定是否请求该组 Ghost。
7. **每组原子，整批可选。** 一个 stale 组不拖垮其他独立 fresh 组。
8. **作者故意偏离优先。** 可声明为有意改变并覆盖旧事实，不重复警告。
9. **不以数值制造戏剧。** 不保存 1–10 张力、好感度、风险值或作者货币。
10. **不建立第二套基础设施。** 复用 F1/F2 的 session、evidence、Ghost、revision、历史和媒体接口。

## 4. 两条核心用户循环

### 4.1 当前场景排演

```text
光标位于目标 writingUnit
  → 从当前场选择人物/地点“仅带入排演”
  → 形成有来源的场景压力和 2–3 个方向
  → 比较假设、行动、眼前所得、代价和可能变化
  → 选择一个方向生成连续可编辑 Ghost
  → 采用后才更新正文及明确 scene/outline delta
  → 可将所选场景发送画师或保存到构思
```

普通续写、短 Ghost、批注改写不强制经过排演。

### 4.2 已有文本的因果介入

```text
选择一个 writingUnit 或其中明确事实
  → 改变人物/地点/环境/事件/知识/时间中的一个条件
  → 查看原条件证据
  → 得到最多 3 个有理由的影响组
  → 在双栏中生成并编辑需要的 Ghost
  → 自动历史保护修改前状态
  → 选择若干 fresh 组采用
  → 回执说明正文、现场、大纲、历史和世界事实的真实变化
```

## 5. 最小数据合同

F3-0 先使用内存合同和 fixture，验证后才决定持久字段。

### 5.1 NarrativeIntervention

```text
NarrativeIntervention
  id / projectId
  target: documentId / chapterId / unitId / nodeId / revision
  operation:
    add-presence | remove-presence | change-location | change-time
    replace-fact | change-event | change-knowledge | reframe-function
  subjectRef
  before
  after
  authorIntent
  evidenceFingerprint
  createdAt
```

- `before` 必须来自 live evidence，不能由模型猜；
- `after` 必须由作者输入或确认；
- 一次 intervention 只有一个主要 operation；
- 采用前只存在当前 session。

### 5.2 TypedNarrativeLink

| relation | 用途 | 可直接进入确定影响 |
|---|---|---|
| `depicts` | 文本描写实体/状态 | 只证明关联 |
| `asserts` | 正文明确断言事实 | 是 |
| `reveals` | 人物/读者获知事实 | 是 |
| `changes` | 文本改变事实/状态 | 是 |
| `present-in` | 人物在 scene/beat 出场 | 是 |
| `located-at` | 场景/事件发生地点 | 是 |
| `knows` | 人物在该时点已知事实 | 仅显式来源 |
| `causes` | 事件/节拍直接导致另一项 | 仅显式大纲/历史关系 |
| `precedes` | 时间顺序 | 不能单独证明因果 |
| `depends-on` | 后文成立依赖前置事实 | 是 |
| `mentions` | 词法提及 | 否，只是候选 |
| `similar-to` | 文本相似 | 否，只是候选 |

禁止 generic BFS，也禁止“角色出场，因此场景依赖其全部设定”。每类 intervention 使用单独的边白名单。

### 5.3 CausalImpactGroup

```text
CausalImpactGroup
  id / interventionFingerprint
  reason
  relationPath[]
  evidenceRefs[]
  targets[]
  confidence: established | plausible | uncertain
  suggestedAction: review | rewrite | update-fact | update-event | intentional-divergence
  dependencies[]
  status: pending | drafting | fresh | adopted | ignored | stale | failed
```

- 默认最多 3 组，作者展开后最多 5 组；
- `plausible/uncertain` 默认不勾选；
- 同一 target 不能被两组重复改写；
- 组内原子，组间按依赖和 target 冲突决定能否批量采用。

### 5.4 RehearsalBranch

```text
RehearsalBranch
  sessionFingerprint
  interventionFingerprint
  directionFingerprint
  assumptions[]
  proposedBeat
  proposedUnits[]
  projectedEffects[]
  sourceRefs[]
  status: draft | selected | discarded | promoted | stale
```

默认只在内存。作者明确“保存到构思”才成为探索文档；明确“用于正文”才进入现有 Ghost 采纳链。

## 6. F3-0 深调研与离线实验

### 6.1 调研范围

- Scrivener：section、synopsis、corkboard 和正文重排的同源关系；
- Plottr：timeline、scene card、plotline、人物/地点关联与正文脱节边界；
- Novelcrafter：scene beat、Codex tracking/progression、Matrix、revision；
- Sudowrite：Story Bible、Canvas、Import、Rewrite 与章节生成；
- Ink/Inky：play-as-you-write、状态、选择和源码/预览定位；
- Failbetter QBN：storylet 的出现条件与明确 outcome；
- Wildermyth：人物历史、关系、选择后果和重复事件失去新鲜感；
- Obsidian Canvas/JSON Canvas：自由投影与真源文件的关系。

每个来源记录精确 URL、观察日期、可见事实、可复用点和不可照搬点。无出处百分比不得进入决策表。

### 6.2 四个 fixture

1. **当前场加人物：** 给目标段加入世界书人物并排演三种方向。
2. **环境变化：** 暴雨改为停电，只影响依赖照明、交通或能见度的文本。
3. **旧事件改写：** “钥匙烧毁”改为“被藏起”，识别后文的无钥匙前提、替代方案和人物知识。
4. **历史时间变化：** 事件提前三天，识别明确时间、行程、人物在场和历史前后关系。

每个 fixture 包含 5–8 个 writingUnit、一个 scene/beat、2–4 条世界事实、1–3 条显式关系和至少一个无关相似文本。

### 6.3 三组对照

- A：普通 AI 聊天回答“可能影响哪里”；
- B：只用全文关键词搜索；
- C：Pinax typed links + F2 evidence/position index + 有界模型补候选。

人工评估找全率、误报、理由可理解性、采用信心和方向差异；不发明单一 AI 趣味分数。

### 6.4 进入实现的 Gate

- 至少 3/4 fixture 中 C 比 A/B 更少误报且理由更清楚；
- 所有 established 影响均有可点击证据；
- 无关相似文本不进入默认影响组；
- 至少两条排演方向产生真正不同的因果后续；
- 不需要向 writingUnit 塞入完整人物/地点/历史 schema；
- 不需要向量数据库才能完成首期闭环。

### 6.5 F3-0 实际结果（2026-09-02）

- 调研记录：[F3-0 因果故事沙盒调研与离线对照](../research/2026-09-02-authoring-causal-sandbox-f3-0.md)；
- 纯内存合同位于 `src/services/agents/authoring/authoringCausalSandbox.js`，不修改 `writingUnit`、worldbook、history 或 localStorage schema；
- 四组 fixture 与 A/B/C 对照由 `npm run eval:authoring-causal-sandbox` 固定执行；
- C 在 4/4 中均为 0 误报、0 漏报，A/B 每组有 2–3 个误报；
- established 影响均带稳定 target、可读 reason 和精确 evidence refs；未知证据与跨项目关系 fail-closed；
- `mentions/similar-to` 只进入展开候选，`precedes` 单独存在不会被提升为 established；
- 默认最多三组、只沿 operation 白名单扩展两跳；每组输出“最小修补/连锁推演”两个不同目标集合；
- 修改正文 revision 后旧 intervention 会 stale。F3-0 Gate 已通过，下一项为 F3-1。

## 7. F3-1 局部介入与排演 UI

### 7.0 已完成的运行边界（F3-1A）

- `AuthoringKnowledgeQuerySession.prepare()` 支持 `requiredSourceRefs`；未知、跨 scope 或时序不可见来源直接失败，不以搜索结果碰巧命中代替作者明确目标；
- `AuthoringInterventionSession` 在一次 prepare 中冻结位置索引、目标正文证据、可选世界书对象证据和 intervention；
- reconcile 同时核对正文位置 revision 与 evidence revision，任一缺失/变化均标 stale；AbortSignal 在读位置、读证据前后都阻止迟到 session；
- F3-1A 不修改 `Authoring.vue`，不请求正文模型，不写正式数据。F3-1B 再接下面的块下界面。

### 7.1 已完成的块下入口（F3-1B）

- 有正文的 writingUnit 间隙在“推演下一段”旁显示次级“改变条件”；探索速记和空章不开该入口；
- 表单只公开事件、事实、时间、作用四种正文条件，以及“原先 / 改为 / 目的”，不展示 manifest、receipt、token 或候选 ID；
- “先看影响”当前只冻结目标节点、项目 position index 和 F2 evidence envelope，零 provider、零正文/现场/大纲/记忆写入；
- 同一来源变化后调用 session reconcile；位置或证据失效时保留作者输入并标 stale，重新核对创建新 session；关闭和迟到任务均由 AbortSignal/version guard 收口；
- 桌面在正文内容轴原位展开；720px 以下 Teleport 到 body 的全宽 bottom sheet，避免 ProseMirror stacking context 穿透，同时保持正文 scrollTop；
- focused UI 12/12、F3 离线 fixture 4/4、Vite build 与 1440/390 实页门禁通过。影响理由和可点击证据由 F3-2A 接入，不在本切片伪造空卡片。
- 2026-09-04 视觉纠偏：入口继续与正文融合，但必须直接说明“先看这项变化会影响哪里”；展开态从内部分类表单改为作者问题“如果这里不是这样”，四类 operation 使用完整动作语言并各自解释应填写什么，“修改目的”降到可选展开项，主动作保持“先看影响”。

### 入口

- 当前场人物/地点：`加入当前场` 与 `仅带入排演`；
- writingUnit 块间入口：`推演本场` 旁的次级动作 `改变条件`；
- 选区条只在明确事实性文本上提供 `改变故事条件`，普通润色仍归批注/重写；
- 不新增全局“游戏版”顶栏，不随光标移动自动出现。

### 块下界面

```text
改变故事条件
对象：钥匙
原先：第三章被烧毁                  [查看依据]
改为：被莉娜藏起
目的：让钥匙在第七章重新出现

[先看影响] [排演当前场]
```

未确认前不请求正文模型；切章、目标 revision 或证据变化使 session stale；移动端使用正文 sheet 并恢复原 caret/scroll。

## 8. F3-2 影响传播与审阅组

传播顺序：

1. 从 intervention 的 live target 和 explicit evidence 开始；
2. 只沿 operation 对应的 typed-link 白名单传播；
3. 到 scene/beat/history/worldbook/outline owner 后定位 writingUnit；
4. 用 F2 搜索/校对位置索引补 `plausible/uncertain` 候选；
5. 按路径、target 和原因合并为最多 3 个默认组；
6. 检查依赖、target 冲突和 revision。

UI 按原因组织，不做全书结果墙：

```text
可能需要调整 · 3 组

第七章 · 无钥匙进入仓库
依赖：第三章“钥匙已经烧毁”
[查看两处依据] [生成修改草稿]

第五章 · 莉娜向艾德加隐瞒钥匙下落
依赖：人物知识差异
[查看依据] [保留不改]
```

无证据时只能说“可能相关”，不能宣称“必须修改”。某证据变化只使依赖它的组 stale。

### 8.1 已完成的确定影响切片（F3-2A）

- 不新增持久关系仓库；只读复用项目大纲中作者明确建立的 `causes` 边，并通过稳定 unit/node ref 定位正文；
- 默认最多两跳、三组。章节共现不算关系，`foreshadows`、`alternative`、`parallel` 只保留为非确定候选；
- prepare 冻结关系端点证据、关系 revision 与影响组；正文、证据或关系删除、改型、新增都会让旧 session stale；
- 块下只显示“可能需要调整”、作者可读位置、原因与可展开依据；无确定影响时明确告知普通提及不会自动列入；
- 该切片零 provider、零 Ghost、零正文/现场/大纲/记忆写入。focused UI 12/12、F3 Gate 5/5 与 1440/390 真实页门禁通过。

### 8.2 已完成的非确定候选审阅（F3-2B）

- 已有 `plausible/uncertain` 投影收进默认折叠的“可能相关”，不与确定影响混排；
- 每个候选说明为何只是待核对，并允许本次排除或保留不改；决定只存在当前 composer session，重新核对、切换目标或关闭即清除；
- 候选独立限制为最多五项，正文、证据或任何关系 revision 变化继续使旧 session stale；
- 1440/390 真实页面验证默认折叠、展开审阅、44px 移动操作、零水平滚动与零正文/现场/大纲/记忆写入；
- 本切片没有“生成修改草稿”，分组 Ghost 仍由 F3-3 统一接入。

### 8.3 F3-3 的进入条件

- 先从确定影响、候选审阅决定和当前 session fingerprint 冻结唯一排演范围；
- “最小修补”与“连锁推演”必须拥有不同目标集合，且保留不改的目标只能作为约束、不能生成替换稿；
- 选择一个方向并再次通过 live reconcile 后，才允许请求正文 provider；
- Ghost、采用、失败重试与撤销继续沿用 F1/C1 的单 owner，不为因果沙盒复制第二套编辑事务。

## 9. F3-3 分组 Ghost、画师与多窗

- 一次排演最多保留 3 个短分支，选择后才生成连续正文 Ghost；
- 影响组点击“生成修改草稿”后，复用 F2 双栏打开目标章节；
- 每组 Ghost 可独立编辑、重试、放弃和 stale；
- 编辑 Ghost 不触发正文 autosave、短 Ghost、记忆 observer 或其他组生成；
- 选择的排演分支可通过 `AuthoringVisualBrief` 打开画师；
- 图片结果保留 branch/scene/unit/entity source refs；
- 画师失败、取消或迟到结果不影响排演与正文事务。

### 9.1 已完成的排演范围冻结（F3-3A）

- 新增一次性 `AuthoringInterventionRehearsalScope` 与 selection receipt，绑定原 intervention session fingerprint；
- 所有“可能相关”必须先明确排除或保留，缺一项即 fail-closed；
- 确定影响才可成为 rewrite target；保留项只进入 unchanged constraints，排除项不进入 target 或 evidence authorization；
- “最小修补 / 连锁推演”目标集合必须不同；只有一项确定影响时第二方向为“保留后果”，即只改原条件、保持后文；
- 方向选择只冻结内存回执，正文、现场、大纲、记忆与 localStorage 写入均为零。

### 9.2 已完成的可编辑分组 Ghost（F3-3B）

- 选择范围后先以原 session 做一次 live reconcile，stale 在 provider 前拒绝；
- 单一 provider request 只接收 intervention、selection receipt 与其精确 evidence subset；
- 每个 rewrite target 返回独立可编辑 Ghost，默认不进入正文，保留/排除目标不生成 Ghost；
- 同章 Ghost 位于对应 writingUnit 下，跨章目标通过 F2 双栏定位；关闭、失败、取消或迟到结果保持零正式写入；
- 本切片只完成生成和编辑，不接采用、批量事务或 observer，后者统一留给 F3-4。

F3-3B 实现补充：原条件本身始终是第一项 Ghost，所选确定影响才形成后续 Ghost；provider 返回未知、重复或缺失 target 会整轮失败。每组可独立编辑、重新生成和放弃，单组重试仍先后 reconcile 且只携带该组证据。同章使用对应 writingUnit 的 block gap，跨章复用 F2 可编辑双栏并定位目标，排演期间临时收起副栏目录；关闭后恢复原双栏能力。该切片生成时所有结果仅存页面内存且没有正文按钮；F3-4A 随后仅为 fresh 结果开放单组采用，stale 结果仍不可采用。

## 10. F3-4 采用、历史与回响

实际执行切片：F3-4A 接通 fresh 单组，采用前 reconcile 整个 intervention session，并以 canonical position index 的 document/unit/node revision 核对目标；同章与跨章分别复用 Notebook、F2 双栏的单一 ProseMirror transaction。采用前留 `before-adoption` 保护快照；正文替换与 persist 分离，失败时保留内存正文和 Ghost，只允许重试保存，成功后才调度 observer。

F3-4B 已完成：至少两个 fresh、无 target 冲突且为单节点替换的 Ghost 可形成一个 `AuthoringInterventionUmbrella` 回执。实现按章复用 canonical 文本 patch，以一次 book repository 保存持久化所有章节；自动历史对每个受影响章保留一份共享 umbrella transaction id 的逻辑保护集，不替代 receipt。单组回执也归一到同一撤销 owner。撤销按回执逆序检查 after text 与 unit/node revision，只恢复仍安全的组；有后续手改时隔离该组并明示报告，不覆盖新内容。采用仅调度一次 observer，不额外请求 provider，且当前只改正文；回响因此明确报告未修改现场、大纲或世界事实。反馈条随当前活动主/副窗呈现，390px 下不再被双栏 sheet 拦截撤销。

- 当前 beat 采用继续使用 F1 beat 级原子事务；
- 一个跨章影响组形成一个原子正文/sidecar 事务；
- 多个无依赖、无 target 冲突且 fresh 的组可形成 umbrella adoption；
- stale/失败组被隔离，不回滚已成功且独立的组；
- 自动历史在批量采用前创建一次保护快照，不能代替 adoption receipt；
- “撤销本次介入”按 umbrella receipt 逆序撤销仍安全的组；有后续手改时明确拒绝破坏性撤销；
- 世界书/历史事实只有在独立 `update-fact/update-event` 组被作者确认后才写入；
- observer 只对成功持久化结果调度一次；保存失败只重试 persist。

采用回响只展示真实变化：修改的 writingUnit、现场/大纲/历史/世界事实、未采用组、stale/失败组、观察任务和可撤销边界。禁止展示模型推测的“世界更紧张”之类结论。

## 11. F3-5 活故事图谱最小投影

F3-0～F3-4 通过后才执行。首期只做当前章节的“场景与因果”投影：

```text
场景/节拍纵向序列
  × 人物 / 地点 / 未决线程轻量泳道
  + causes / reveals / changes / payoff 关系筛选
```

- 节点必须指向 canonical scene/beat/writingUnit/history/worldbook ref；
- 点击节点复用双栏或资料窗；
- 可从节点发起 intervention；
- 首期不支持直接拖动重排正文；
- 地图、完整时间线和人物关系图以后消费同一 typed links，不在本阶段并行实现；
- 390 使用线性列表，不缩小无限画布。

实际完成：新增纯函数 `buildAuthoringLivingStoryProjection()`，以当前项目、章节、canonical document 和 position index 为强制边界；每个节拍保留 project/document/unit/node revision locator，场景只按显式 sceneId、scene heading、scene anchor 或连续正文分组。人物/地点来自当前场锚点及精确无歧义的世界书命中，线索来自定位到本章 writingUnit 的项目大纲节点；只有大纲显式 `causes` 与 `foreshadows` 分别投影为“导致”与“兑现”，相邻、相似或普通提及不推断关系。结果 deep-freeze 并带确定性 fingerprint，不提供保存或 mutation API。

可见入口没有增加工具 rail 项，而是在既有右侧“现场”下提供“当前场 / 场景与因果”两个页签。桌面保持窄栏纵向序列，390 复用原 inspector sheet 形成线性列表；人物/地点、节拍和“改变这里”分别复用世界书详情、正文定位与 F3 intervention。focused UI 12/12、F3 离线 Gate 5/5（37 checks）、1440/390 真实页面 24/24 及最终 `verify:full`（20/20 文件、200/200 用例、Vite/VitePress build、diff check）通过；打开、筛选、定位和发起 intervention 均未修改正文、现场、世界书或记忆。

## 12. 故障矩阵

| 故障 | 正确结果 |
|---|---|
| 目标正文 revision 改变 | intervention stale，零生成/零采用 |
| 证据删除或解绑 | 只使依赖该证据的组 stale |
| provider 空返回/超时 | 保留作者输入和已有组，零正式写入 |
| 单组 Ghost 保存失败 | 保留编辑结果，只重试 persist |
| 多组选中时一组 stale | 隔离该组，其他独立组仍可采用 |
| 两组命中同一 target | 合并或要求二选一，禁止后写覆盖前写 |
| 采用后立即撤销 | 正文及仍可逆 sidecar 按 receipt 恢复 |
| 采用后手改目标 | 拒绝破坏后续修改，指出不可撤销组 |
| observer 失败 | 正文保存事实不变，记录一次低敏失败 |
| 切书/切章 | 迟到结果留在原 session |
| IME composition | 不开介入、不刷新候选、不接管按键 |
| 画师迟到结果 | 留在原 visual brief session，不插入当前章 |

## 13. 真实验收与截图

### 旅程

1. 从当前场把角色仅带入排演，采用一个多 writingUnit beat，并送画师形成场景候选。
2. 修改环境条件，只有显式依赖环境的文本进入影响组。
3. 修改早期事件，跨章生成两个 Ghost 组，采用一个、忽略一个。
4. 修改历史时间，一组 stale，另一组仍可采用。
5. 把冲突声明为有意改变，后续不重复提示旧事实。
6. 多组采用后撤销，历史快照与采用回执职责清楚。

### 截图

最终只保留：

1. 1440 目标块下 intervention 与可点击依据；
2. 1440 三个有原因的影响组；
3. 1440 双栏跨章 Ghost；
4. 1440 排演分支进入画师；
5. 390 intervention sheet 与焦点恢复；
6. F3-5 通过后另保留 1440/390 活故事投影。

中间截图只放 `/tmp`，每个视觉切片确认后清理失败产物。

## 14. 测试节奏

1. F2-3B：取名/快捷词 focused + 1440/390；
2. F2-4：evidence/locator/source authorization/stale focused + 助手真实页；
3. F2-5：visual brief/媒体 bridge/迟到结果 + 1440/390；
4. F2-6/F2-7：校对、搜索、历史、完整 Authoring 旅程与 F2 最终截图；
5. F3-0：只跑离线 fixture 对照；C2 同期只跑自身 protocol/repository focused Gate；
6. F3-1/F3-2：intervention/impact focused + 两张真实页面，并验证 artifact JSON round-trip；
7. F3-3/F3-4：Ghost/adoption/history/media failure matrix；C2-3 合流时另跑双浏览器/host-loss/断线矩阵；
8. F3-5：响应式与视觉 Gate；共同排演只重拍受影响的 1440/1024/390 切片；
9. F3 或 C2 大阶段分别准备交付时各只跑一次 `verify:full`，合流后再跑一次联合全量门禁。

不得每加一个字段或改一处 CSS 就跑全量测试，也不得用组件快照代替真实 Authoring 页面。

## 15. 并行与文件所有权

高风险共享 owner：

- `src/pages/Authoring.vue`
- `src/components/writing/WritingNotebookEditor.vue`
- AuthoringRunSession / Context Manifest
- Ghost/adoption/history transaction
- worldbook/history/outline repository adapters
- `docs/STATUS.md`

同一阶段只能由一个 integration owner 接线。当前并行关系改为：

- F3 worktree/主工作树独占上述高风险 owner，以及 intervention、typed-link、impact、Ghost/adoption 实现；
- C2 独立 worktree 只修改 collaboration protocol/repository/transport、旧 Experience compatibility 和自身 fixture；
- 两边在 F3-2 前只共享中立 JSON fixture，不互相 import 未合流源码；
- F3-2 后由 integration owner 抽取/冻结 `CollaborableArtifact` adapter；C2 不得直接序列化 F3 私有对象；
- C2-3 共同排演 UI 与 F3 页面接线作为单独 integration window，由一个 owner 完成；
- 独立 worktree 必须记录 base、owner、写集与回收条件，集成后及时删除。

画师工作仍不得重写素材页 provider 或媒体 store，只使用既有 visual-brief adapter。C2 暂时失败、关闭或未配置时，F3 单人本地循环必须完整通过原 Gate。

## 16. 明确不做

- 不以环境音、Streak、徽章、作者货币作为核心趣味；
- 不强制雪花法、七点结构或六种情感弧；
- 不做 1–10 张力、好感度或风险 HUD；
- 不做 generic claim BFS 或向量直接决定修改范围；
- 不自动扫描并改写全书；
- 不新建第二套世界书、历史、地图、记忆、Ghost、证据或媒体 store；
- 不把临时排演写入 canonical 当前场；
- 不先建无限画布和完整 Timeline；
- 不因 F3 而取消或缩水 F2 资料助手、画师、校对、搜索、历史和视觉验收。

## 17. Go / No-Go

只有以下结果成立才进入活故事图谱：

- 作者能说清每个影响为什么出现；
- 影响组比普通聊天和全文搜索显著减少噪声；
- 排演产生作者原本没想到但符合证据的方向；
- 作者敢于编辑并采用 Ghost；
- 双栏、助手、画师、历史与 F3 使用同一来源身份，没有串状态；
- 跨章采用与撤销没有制造不可信感。

若多数影响仍靠模型自由联想、需要大量人工维护 schema、或与普通聊天无明显差异，则保留 F2 完整工具与 F1 当前场排演，停止跨章自动传播，不用图谱掩盖机制失败。

## 18. 完成标准

- F2-3～F2-7 全部按原目标完善并通过视觉验收；
- 助手、画师、校对/搜索、历史和多窗分别提供可复用接口；
- F3 不复制这些基础设施；
- 作者可以从当前 writingUnit 或当前场明确发起 intervention；
- 排演零正式写入，选择后才进入 Ghost；
- 影响传播只沿 operation 对应的 typed links；
- 默认影响组不超过 3 个且都有可点击理由；
- 跨章 Ghost 分组独立 fresh/stale 并可局部采用；
- 画师能消费已选场景/分支且保持来源；
- 自动历史与 adoption receipt 各司其职；
- 四个 fixture、六条真实旅程、五视口/IME/迟到/stale Gate 通过；
- 用户确认该循环比普通聊天、关键词搜索和静态卡片墙更有趣、更可信。
