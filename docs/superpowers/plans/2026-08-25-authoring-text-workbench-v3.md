# Authoring 文本工作台 v3 实施计划（实验重写版）

**日期：** 2026-08-25  
**状态：** 实验校正完成，待用户确认 Phase 0 原型后实施  
**产品研究：** `../research/authoring-text-workbench-deep-research-20260825.md`  
**结构实验：** `../research/authoring-context-lifecycle-experiment-20260825.md`  
**技术参考：** `../research/deerflow-pinax-agent-research-20260824.md`  
**真源：** 本文件已吸收此前统一创作工作区、块级工作台、场景排练和上下文检查器计划；旧任务单已清理，历史仍可从 Git 查询。

## 1. 重写依据

产品方向不变：一本书使用同一块级编辑器承载探索稿和正文，通过项目级大纲组织路线，通过当前场、世界书和跨章证据辅助原位 Ghost，采纳后才进入正文。

但确定性实验得到 0/6：

| Gate | 结果 | 计划影响 |
| --- | --- | --- |
| resolver / 自动 Ghost / NarrativeKernel 来源对齐 | 失败 | 先关闭上下文 owner，不能叠第四套拼接器 |
| 第五章隔离第十章揭晓 | 失败 | eligibility 必须先于评分与预算 |
| 正文/记忆/世界书冲突裁决 | 失败 | 必须形成 conflict set |
| 摘要保留五个精确事实 | 丢失 4/5 | prose summary 不能作为事实索引 |
| 累计 token 预算 | 失败 | 补 run budget，不重复造 loop guard |
| Ledger 与实际 Kernel 对账 | 失败 | receipt 必须从实际 model call 产生 |

实施顺序冻结为：

```text
真实文本工作台原型
→ 稳定文档/大纲寻址
→ 上下文所有权关闭
→ 时间与冲突门禁
→ 分层事实索引和摘要
→ 实际运行回执与预算
→ 跨章上下文
→ 探索/当前场/世界书/正文闭环
```

前六项未通过时，禁止跨章来源进入生产正文生成。

## 2. 最终产品目标

作者可以：

1. 在同一工作台写正文或创建不必归章的探索文档；
2. 围绕同一情节写不同视角、不同走向和速记片段；
3. 用项目级大纲连接探索、人物线、伏笔与正文章节；
4. 在任意正文位置看到对应当前场，而非整章尾部状态；
5. 决定哪些章节、探索方案和设定参与本次生成；
6. 在光标所在 writing unit 下方得到排版稳定的 Ghost；
7. Tab 采纳后，正文、必要 scene delta、大纲兑现和来源回执原子落地；
8. 丢弃、取消或过期结果零写入。

中央稿面始终是核心。素材、画布、Experience 和独立素材页都不是主闭环前置，可复用、合并、降级或删除。

## 3. 明确不做

- 不新增通用 Agent middleware pipeline；
- 不引入 LangGraph、MCP、递归 sub-agent 或动态 runtime skill；
- 不把开发者 `agent-skills/` 改造成产品能力；
- 不建立第二套编辑器、Ghost 或采纳事务；
- 不用向量库掩盖稳定 ID、时间位置和权威模型缺失；
- 不默认持久化完整正文、prompt 或 trace；
- 不让素材、画布、记忆或 Experience 成为写正文的必经步骤；
- 不先抽象通用知识图谱再寻找作者场景；
- 不在小改后反复跑全量测试或频繁提交。

## 4. 冻结合同

### 4.1 文档与大纲

| role | 真源 | 是否归章 | 默认叙事状态 | 发布 |
| --- | --- | --- | --- | --- |
| `exploration` | 书级 `explorationDocuments[]` | 可选 | hypothesis / intent / alternative | 否 |
| `manuscript` | `book.chapters[]` | 必须 | fact | 是 |

两类文档共用 writingDocument、WritingNotebookEditor、unit/node、批注、snapshot、recovery、Ghost、撤销和排版。差异只存在于 repository、AI 权限和发布语义。

项目大纲只保存简短 intent、层级顺序、少量叙事关系、document/unit/entity refs、章节映射和 adopted/rejected；不得复制探索全文、正文全文或世界书条目。

### 4.2 上下文四轴

`established / intended / speculative` 只作为编译后视图；底层使用：

| 轴 | 值 |
| --- | --- |
| `sourceAuthority` | canonical-manuscript / author-explicit / author-adopted / accepted-derived / imported-reference / machine-detected / machine-generated |
| `narrativeStatus` | fact / constraint / intent / hypothesis / alternative / rejected |
| `temporalRelation` | before-target / at-target / after-target / atemporal / unknown |
| `scope` | project / volume / chapter / scene / writing-unit / selection / run-only |

正文默认规则：目标前 canonical fact、author constraint、adopted intent 可进入；rejected 永不进入；alternative 只进入探索/比较；after-target 正文默认排除，显式钉选后也只能作为 intended reference；时间位置无法解析的正文来源 fail-closed。

### 4.3 四个生命周期对象

1. `ContextCandidateReport`：发现了什么、为什么排除；
2. `CompiledContextManifest`：计划使用什么、采用哪种表示；
3. `ModelCallReceipt`：某次真实调用最终序列化了什么；
4. `AdoptionReceipt`：采纳正文依赖什么，并产生哪些 scene/outline delta。

UI 可折叠，但数据层不得把四者都叫 Ledger。

### 4.4 Target Snapshot 与写入

一次生成冻结 project/document/role/chapter/unit/node/caret，以及 document/unit/node/chapter-order/outline/scene revisions。Ghost 除目标文本外，只校验实际使用的 dependency revisions；无关世界书编辑不得误伤候选。

所有正文 AI 结果先是 Ghost；只有统一采纳事务能修改正文。含 scene move 或 outline fulfillment 的结果首期整体采纳。探索推演不写 canonical scene anchor。observer 只在正文成功持久化后调度；丢弃、失败、stale、abort 零派生写入。

## 5. 目标架构与 owner

```text
DocumentRepository ─┬─ OutlineRepository
                    ├─ SceneProjection
                    └─ ProjectKnowledgeReaders
                               │
                    WritingContextCompiler
          discover → qualify → resolve conflicts
          → select representation → pack
                               │
                  CompiledContextManifest
                    ┌──────────┴──────────┐
               Inline runtime      Narrative runtime
                 one-shot           bounded-agent
                    └──────────┬──────────┘
                       ModelCallReceipt
                               │
                    Candidate → AdoptionTransaction
```

- Compiler 拥有语义选择、资格、冲突、表示和注意力预算；
- runtime 只拥有调用形态、成本/延迟预算、工具循环和停止原因；
- adapter 不得重新匹配世界书或自行挑选章节；
- Kernel 可在 manifest 授权 namespace 内检索，不能越权发现新来源；
- receipt 从真实 provider payload 产生；
- candidate/transaction 拥有 stale、采纳和撤销。

## 6. Phase 0：真实原型与作者流程冻结

### 工作

1. 用真实测试书制作只有正文、未归章探索、双视角探索、探索映射第五章四种状态；
2. 在现有 Authoring DOM 上做最小原型：左侧连续“构思/正文”树、中央真实编辑器、右侧当前大纲/当前场/本次参考；
3. 探索和正文都使用真实 writing unit；
4. 做 1440/1024 截图，390 只确认 pane 互斥；
5. 隐藏素材、画布、Experience 做删除测试；
6. 用户确认命名、密度、标题、右侧层级和 Ghost 几何。

### Gate / 暂停

中央稿面最大；无构思作者可直接写正文；左右栏固定内部滚动；无卡片墙、重复标题和 `01` 装饰。Phase 0 不跑测试。截图未确认不进入 repository。

## 7. Phase 1：共享文档 repository 与稳定寻址

### 文件

`authoringDocumentRepository.js`、`writingDocumentSchema.js`、writing snapshots/recovery、`WritingNotebookEditor.vue`、`Authoring.vue`。

### 工作

1. 冻结 `AuthoringDocumentHandle`；
2. manuscript 继续写 `book.chapters[]`，exploration 写书级 repository；
3. snapshot/recovery/history key 扩为稳定 document key并兼容旧 key；
4. 编辑器只上报 handle + unit/node target；
5. 文档切换执行 save-old → load-new → restore selection/scroll/lock；
6. 统一 typed sourceRef，删除 `worldbook:<entryId>` / `worldbook-entry:<entryId>` 双命名；
7. chapter/exploration/unit/node 都能解析位置与 revision。

### Gate

探索/正文切换、刷新、拆合 unit、批注均稳定；删除探索不删已采纳正文；快速切换不串写；正式 ref 都归属同一 project；exploration 保存不触发 canonical observer。

## 8. Phase 2：左树与统一稿面

### 工作

1. 左栏按“构思 / 正文”连续分组，不用大卡片；
2. 构思包含快速落笔、未编排、按大纲组织、搁置；空态一行；
3. 正文显示 `第一章　章名`，正确缩进，去掉 `01`；
4. 标题全部在白色稿面；
5. 统一 line width、字体、行高、首行缩进、段距、引号、placeholder、Ghost 变量；
6. 保存状态仅变化时短暂出现；
7. 30 章 + 20 探索仍保持紧凑。

### Gate

切换无稿面跳变；中文引号和首行缩进正确；左右栏与中央协调；1440/1024/390 一次只出现合理 pane。

## 9. Phase 3：项目大纲与时间位置真源

### 文件

`chapterOutline.js`、新增 `projectOutlineRepository.js`、`projectOutlineMigration.js`、`manuscriptPositionIndex.js`、`AuthoringOutlinePanel.vue`。

### 工作

1. 书级保存 outline nodes/edges，节点允许零章节映射；
2. 节点关联探索、entity、manuscript unit并标 adopted/rejected；
3. 默认线性视图，人物线/伏笔/未编排为筛选，不先做无限画布；
4. 建立 `chapterOrderRevision` 和 unit order index；
5. manuscript ref 可判断 before/at/after target；
6. 章删/拆/合/重排只更新映射和 order revision；
7. 旧 `chapter.outlineItems` 惰性可重入迁移，分叉进入一次冲突审阅；
8. 迁移未完成时兼容 reader 继续工作，不双写真源。

### Gate

第十章对第五章稳定判为 after-target；重排使旧 order revision 失效；adopted 后 alternative 保留但正文排除；旧章纲零丢失；大纲调整不改正文。

## 10. Phase 4：Context ownership closure

这是 0/6 实验的首个硬修复，不与跨章检索并行。

### 文件

`agentContextContract.js`、profiles/resolver、新增 `writingContextCompiler.js`、`contextCandidateContract.js`、`contextReceipt.js`，以及 `useWritingAgent.js`、`authoringNarrativeContext.js`、`narrativeKernelExecutor.js`、`narrativeKernel.js`。

### 工作

1. Project readers 只返回候选，不拼 prompt、不裁剪；
2. candidate 携带四轴、position、reason、revision、estimated chars、representations；
3. 编译顺序固定为 discover → eligibility → conflict → representation → packing；
4. 自动 Ghost 和 NarrativeKernel 接收同一 compiled manifest；
5. 自动 Ghost 使用 `inline-fast` budget，但不能有另一套 matcher/reader；
6. NarrativeKernel 删除重复语义选择，只序列化 manifest；
7. 工具仅暴露 manifest 授权 namespace；
8. 迁移后删除 legacy inline context owner 和 Kernel 自选来源；
9. UI 暂读 compiled manifest，不再展示旧 resolver ledger；
10. 持续用生命周期 eval 对账。

### Gate / 删除项

同一目标合法来源全集一致，差异只来自声明的 budget；世界书 ref 唯一；Kernel 无越权来源；manifest 来源可映射到 call receipt。pipeline 与 ledger Gate 未通过不进入 Phase 5。

删除自动联想独立语义 builder、resolver/Kernel 双世界书选择、从预编译 ledger 推测实际输入的路径。

## 11. Phase 5：资格与冲突

### 工作

1. eligibility 在评分和预算前执行；
2. 项目不符、revision 缺失、rejected、非法 after-target 直接排除；
3. 显式钉选未来内容改为 intended reference 并明示；
4. 同一命题的正文、世界书、记忆、现场检测和探索组成 conflict set；
5. 时间事件以目标前正文和显式 anchor 为主；基础设定按 claim type 裁决；
6. 无法裁决时正文排除低权威项并报告 unresolved，检查/探索任务可读双方；
7. 用户纠正形成 author-explicit override，不篡改世界书正文。

### Gate

第五章默认排除第十章；钉选后不伪装已发生；“会游泳/不会游泳/怕水”正文只得到一个有效视图；矛盾检查可见双方；explicit anchor 胜过 machine detection；future/conflict Gate 通过。

## 12. Phase 6：事实索引与摘要投影

### 两层输出

1. 结构化事实索引：claim、entity、relation/state change、time/location、evidence；
2. prose continuity：情节概览、章末状态、未决动作。

### 工作

1. unit fact index 为增量单元；scene/range 聚合 unit，chapter continuity 聚合 range；
2. 上层记录子 revision，只重算受影响路径；
3. summary 记录 coverage、facets、known omissions、method；
4. 密码、机制、身体特征、时间承诺不能只靠 prose summary；
5. 模型摘要前确定性裁剪，输入 previous neutral summary + changed units；
6. 摘要成功且来源未变才替换；失败保留旧投影；
7. task view 只存在于 run；exploration summary 保留 hypothesis/alternative；
8. `narrativeSceneSummary` 保留 Experience 兼容，不直接升格。

### Gate

五个精确事实 5/5 由 fact index 召回；prose omission 可解释并可回读证据；单 unit 修改局部失效；失败/stale 不删旧摘要；rejected 不变 fact；summary Gate 通过。

## 13. Phase 7：运行预算与真实回执

### 运行形态

| profile | 任务 | 行为 |
| --- | --- | --- |
| `inline-fast` | 自动 Ghost | one-shot，无规划/工具/临时摘要 |
| `manual-short` | 短续写/改写 | retrieval-one-shot，只读现成索引 |
| `narrative-long` | 长推演/探索落正文 | BeatPlan + 最多两轮检索 + 正文 |
| `analysis-background` | 全书检查 | 分批后台分析，不产正文 Ghost |

### 工作

1. 保留现有轮次、调用、工具结果、超时和重复调用护栏；
2. 增加累计 input/output/total token budget；provider 无 usage 时保守估算；
3. 每次 model call 最终序列化后生成 source/block/representation/chars/tokens/cut receipt；
4. typed outcome：completed、budget-capped、context-truncated、stale、aborted、timeout、grounding-insufficient、loop-capped、invalid-result；
5. 自动 Ghost 新请求 abort 旧请求，光标取消不显示错误；
6. budget-capped 有正文时可显示 degraded Ghost，采纳前明示；
7. trace 默认只存低敏指标和 refs。

### Gate

inline-fast 永不调用工具/摘要；run 不超累计预算；无 usage 也有上限；每次调用与 receipt 对账；UI 区分取消/过期/资料不足/超时。实验达到 6/6 后才进入跨章生产化。

## 14. Phase 8：跨章上下文生产化

### 工作

1. 先发现候选，不立即读全文；
2. 默认优先当前 unit/光标邻域、当前场、adopted outline/exploration、因果前驱、待兑现伏笔、人物变化、前章尾段、一般摘要；
3. 旧章读 fact index + continuity + 必要 excerpt，不灌整章；
4. pays-off 可跨多章命中直接前驱；
5. 作者可本次移除/钉选，不做永久复杂规则编辑器；
6. 日常一行“本次参考 8 项”，展开显示资格、表示、原因、排除和实际使用；
7. order/source/dependency revision 变化使挂起 manifest/candidate stale。

### Gate

第十章兑现可读第一章伏笔；回第三章修订不读第十章；未来钉选显示 intended；同源摘要和全文不重复占预算；receipt 与 UI 对账；缺 revision fail-closed。

## 15. Phase 9：统一探索、推演与 Ghost

### 工作

1. 所有生成统一输入 target snapshot + manifest + instruction + optional scene move；
2. exploration 支持继续、换视角、比较、深化，结果仍原位 Ghost；
3. manuscript 支持自动联想、长续写、按 adopted 探索落正文、选区/批注推演；
4. 页面只允许一个 pending Ghost；
5. Ghost 固定在目标 unit 下，生成/失败/重试/过期共用几何；
6. 普通候选可分句采纳，含 scene/outline delta 只整体采纳；
7. candidate 保存 target/dependency revisions、manifest fingerprint、run outcome；
8. 批注进入同一 candidate owner，采纳后不自动删除；
9. 自动联想在移动光标并稳定数秒后触发，句末符号不是硬门槛；
10. 浏览前文、IME、上下移动光标不出现空“正在续写”。

### Gate

两个探索视角都不改当前场；adopted 后在第五章生成；丢弃零写入；只有实际依赖变化才 stale；Tab 写入目标且排版不跳；前文任意 unit 可推演和联想。

## 16. Phase 10：当前场、世界书、大纲与采纳闭环

### 工作

1. 当前场区分已成立、下一步安排、机器检测及来源；
2. 从世界书选人物/地点时提供纠正当前、安排下一段、作用选段；
3. 纠正立即写 anchor，未来安排只建 intent；
4. 大纲 entity refs 与当前场互通，入场安排写 outline intended，不改世界书；
5. 采纳原子提交 prose + optional scene delta + outline fulfillment；
6. 持久化失败保留可重试事务，不重新生成；
7. 采纳后局部失效摘要并调 observer；
8. 切回前文按该 unit 继承，不读后文 anchor。

### Gate

漏判纠正与未来入场不混淆；世界书 → 当前场 → 大纲 → Ghost → 正文闭环；重存不二次生成/写 scene；撤销恢复可逆部分；observer 失败不改变正文保存事实。

## 17. Phase 11：外围重组与删除

- 速记主动作改为追加当前 exploration 或新建未编排 exploration，旧 notes 显式幂等迁移；
- 复用图片/音频/文件 picker，纯文字试写迁到构思，删除无独特任务的文字卡片舞台；
- 画布复用现有 pan/zoom/board，只引用 outline/exploration/manuscript/asset，Authoring 只显邻域；
- 记忆作为 Compiler reader，不建可见草稿库；
- Experience 建议可创建 exploration unit 或 scene intent，不复制聊天壳；
- 任一外围模块禁用时，探索 → 大纲 → 正文仍完整。

## 18. Phase 12：视觉、中文输入与收口

1. 排版先只提供“小说标准”；
2. 中文引号补齐兼容 selection、IME、undo；
3. current line、unit、worldbook match、annotation、Ghost 分级，同屏一个主强调；
4. 1440 左右固定，1024 右详情钻取/覆盖，390 树与工具互斥 sheet；
5. 右详情锁定不随 caret 换 owner，未锁定面板随 caret；
6. 作家助手只作几何密度参照：两侧白色、中央浅色、正文白稿面、工具栏下留呼吸区；
7. 当前场简略显示在左，点击后右侧打开同一 projection 详情；
8. 保存提示短暂出现，底栏颜色与中央统一。

Gate：5000 字滚动工具不漂移；批注/Ghost/当前块不争强调；30 分钟中文输入无冲突；探索/正文视觉统一；1440/1024/390 无横向溢出和关键焦点丢失。

## 19. 验证与提交节奏

遵守 20 测试文件 / 200 用例预算。实验放 `scripts/`，高风险回归并入现有宿主测试。

| 阶段组 | 统一验证 |
| --- | --- |
| Phase 0 | 截图与用户确认；不跑测试 |
| Phase 1–2 | 一次 repository/editor focused + 三宽度 smoke |
| Phase 3 | 一次 migration/position focused |
| Phase 4–7 | 每个硬 Gate 用 lifecycle eval；阶段组完成后一次 focused，不逐 helper 跑 |
| Phase 8–10 | 一次 context/transaction/scene focused + 真实 Ghost |
| Phase 11–12 | 一次 UI focused + live audit |
| 最终用户验收后 | `npm run verify:full` 一次 |

只在完整可验收阶段闭环后提交；准备提交时使用 `commit-conventions`，不为小修频繁提交。

## 20. 暂停条件

1. Phase 0 未确认，不抽 repository；
2. 两类文档未稳定共用编辑器，不迁移大纲；
3. position/迁移未零丢失，不切换真源；
4. pipeline/ledger 未过，不做后续上下文；
5. future/conflict 未过，不让未来、记忆或探索进入正文；
6. summary 未过，不让 prose summary 代替事实索引；
7. budget/receipt 未过，不扩大 Narrative runtime；
8. lifecycle eval 未 6/6，不生产化跨章；
9. Ghost/采纳未闭环，不接外围；
10. 文本主闭环未验收，不不可逆删除素材页。

## 21. 最终验收故事

用户在“构思”写地下阶梯方案和两个视角，把它们挂到未归章大纲节点，选择莉娜视角并映射第五章。回到第五章中段后，系统只读取此前正文、当前场、第一章伏笔、人物变化、已采用探索和相关世界书；第十章揭晓被排除。右侧一行显示本次参考，展开能看到原文、事实索引、排除原因和实际使用。

用户从当前场选择艾德加，设为下一段入场并长推演。Ghost 出现在目标 unit 下方。丢弃时所有状态不变；再次生成并 Tab 采纳后，正文 unit、入场 scene delta 和大纲兑现回执原子保存，只有相关摘要失效。后续自动联想读取新的当前场。整个过程不需要素材页、画布或 Experience。
