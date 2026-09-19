# 助手写作 Skills 接入：调研、设计与实施任务书

日期：2026-09-19。状态：**实施中**——S01–S03 已交付（见[回执](../agent-runs/writing-skills-s01-s03-20260919.md)：旅程基线 46/46、33/33、29/29，Oh Story 适配 fixture 对照 7/7，方法合同 eval 26/26，verify:full exit 0）；真实 provider/稿件质量 Gate 仍未运行，S04 起按队列继续。代码核查基线 `e48d011`，承接[产品主计划](./pinax-integrated-product-roadmap.md)、[F2 助手工作台](../superpowers/plans/2026-09-01-authoring-writer-assistant-parity-f2.md)与[夜间运行时计划](./nightly-20260918-runtime-maturity.md)，不另立产品主线。

## 1. 决策与完成定义

采用用户报告的方向：把成熟写作方法接入现有助手，由同一个任务入口选择问答、目标审稿、局部改写和修改影响检查。Skill 负责方法与材料需求，程序负责资料授权、版本、目标定位、锁定范围和正式写入。

当前最关键的差距是**作者意图到既有能力之间缺少闭环**。换一个长系统提示词无法解决定位、误覆盖、版本恢复和保存反馈问题。首批必须完整交付：

```mermaid
flowchart LR
  A[作者目标与审查范围] --> B[冻结正文版本与获准资料]
  B --> C[按目标审稿：位置、证据、建议]
  C --> D[作者选择一条意见]
  D --> E[既有局部改写：差异与锁定检查]
  E --> F[作者采纳：版本复核、保存、撤销]
  F --> G[原意见更新状态及关联影响待复查]
```

第一批完成不是“增加三张任务卡”或“能返回 JSON”，而是作者不复制粘贴意见即可完成这条流程，保存失败可重试，修改原文后旧候选不能覆盖。

范围：现有 Authoring 助手和正文工作区。保留资料问答、校对、改写原入口作为快捷入口，共用同一工作流。暂不做多 Agent、Skill 商店、任意脚本执行、外部插件加载、独立追踪数据库或自动全书改写。运行时推广可借用夜间 run 合同，但不等待其全部完成，也不宣称已有通用持久化。

## 2. 外部证据与可复用资产

### 2.1 核查方法和可信边界

本轮实际读取公开官网/官方文档以及 Oh Story 源码；未登录商业产品操作，不把官网功能描述视为实机交互验收。用户给出的报告作为研究输入，不替代一手证据。获取时间为 2026-09-19。

| 来源 | 本次核实内容 | 采用方式及限制 |
|---|---|---|
| [Oh Story](https://github.com/zenstory-ai/oh-story-claudecode) | 固定 `0ffe7db4fa02489f5d1989e58a22ce62d040a850`；`story-review` 1.1.1，根 LICENSE 为 MIT；有统一 finding、分批连续性、风格裁决、修订事务及本地文本检查 | 可适配方法文本与纯检测逻辑；不是经过 Pinax 真实稿件验证的成熟度保证 |
| [Novelcrafter 功能页](https://www.novelcrafter.com/features)及[提示词类型](https://www.novelcrafter.com/help/docs/prompts/prompt-types) | 四种任务类型：场景生成、总结、文本替换、Workshop Chat；有 Prompt Components、上下文选项 | 借鉴按任务组合方法与材料；商业实现代码未获取，不能宣称复用其代码 |
| [Novelcrafter Prompt Preview](https://www.novelcrafter.com/help/docs/prompts/prompt-preview)、[嵌套函数](https://www.novelcrafter.com/help/reference/prompts/nesting-functions) | 可预览实际发送的 prompt；组件/函数可以复合取用资料 | Pinax 展示实际上下文清单与裁剪原因；不引入新的任意表达式语言 |
| [Sudowrite Rewrite](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/rewrite/9hkeezeUsCiUCG4dRdEqjS) | 选区触发、若干改写目标、在历史侧栏提供候选；文档标示单次可选至 6000 words | 借鉴明确输入/目标/候选；此页不足以证明所有任务均硬性保护设定/锁定文字；不照抄英语长度限额 |
| [Lex 官网](https://lex.page/) | AI Feedback、改写、Comments、Versions、Commands；Track Changes 仍写 Coming soon | 反馈就近工作可参考；“每条 AI 意见自动定位并改写”的完整链未在本轮证实，是 Pinax 设计目标 |
| NovelAI Context Viewer | `https://docs.novelai.net/text/editor/contextviewer/` 及两个候选路径均抓取失败 | 本轮未核实，不据此宣称产品现状；上下文透明方案已有 Novelcrafter 一手证据支撑 |

### 2.2 Oh Story 逐项取舍

固定源码入口：[story-review](https://github.com/zenstory-ai/oh-story-claudecode/blob/0ffe7db4fa02489f5d1989e58a22ce62d040a850/skills/story-review/SKILL.md)。本轮只读取，不运行其中命令，不继承其运行时指令。

| 上游路径（相对 `skills/story-review/`） | 直接可取部分 | Pinax 必须改造/排除部分 |
|---|---|---|
| `SKILL.md`：统一 Findings Schema、跨批审查 | location/issue/建议的结构；未解决问题摘要；乱序修订仅触发有关后续范围 | 文件行号换为稳定正文 locator；不用默认 full 多 Agent；不强制平台留存、黄金三章标准 |
| `references/review-quality.md` | 动机、阻碍、选择、代价、关系变化、伏笔兑现的提问方法 | “不能天气开场”“一章不超三个概念”等为特定偏好，不能成为通用错误；作者文风优先 |
| `references/style-resolution.md` | 当前请求、本书风格与默认方法按维度消解冲突；不能用风格借口捏造事实 | 由既有书级规则/显式偏好读取，不扫描目录，不创建 `.deslop-whitelist`；不自动学习推断偏好 |
| `references/tracking-transaction.md` | revision 前置校验；修订旧章后区分该章变化与最新状态；派生数据不可反向覆盖事实 | 不搬 `_tracking-state.json`、文件锁、作者记忆库及派生 Markdown；接 Pinax 正文、账本和 worldbook owner |
| `scripts/check-degeneration.js` | `scanDocument` 及重复、截断、占位/元信息检测函数可适配 | 拆掉 fs/path/process/CLI，输入字符串返回带 offset 的 finding；引用/元小说/故意复沓必须有反例 |
| `scripts/check-ai-patterns.js`、`style-whitelist.js` | 句式/词密度检测与显式豁免思想，可择取规则函数 | 上游有较强风格门禁，Pinax 默认 advisory；不是“AI 生成概率”，不自动改稿、不自动判严重问题 |
| `scripts/normalize-punctuation.js`、`tracking_commit.py`、`author_memory_commit.py` | 可研究测试案例与事务思路 | 本批不移植自动文件改写与追踪数据库，标点已有本地校对时优先复用既有实现 |

复用工序：固定 SHA → 列实际复制文件/函数 → 保留版权与 MIT 全文 → 上游规则 fixture 与 Pinax locator fixture 对照 → 记录改造差异。计划落点为现有 agents/authoring 域下的 `writingSkillMethods/` 与 `writingSkillChecks/`（拟新增）；若纯函数依赖比预估大，先抽最小可测子集，不能另写同功能大脚本规避复用要求。

加入第三方声明和 `public/third-party/` 许可证应与实际代码适配同批发生。本轮只做研究，没有把上游代码写入生产仓库。不存在已完成的许可证集成。

## 3. Pinax 真实基线与缺口

| 现有 owner | 已核实能力 | 此方案新增的接缝 |
|---|---|---|
| `src/components/authoring/AuthoringKnowledgeAssistant.vue`、`src/composables/useAuthoringKnowledgeAssistant.js` | 输入/任务意图、取消重试、证据打开；`ask` 固定调用 `authoring.knowledge.query`，无证据可返回资料不足 | 统一任务选择及结构化 finding 行；问答继续走原链，不把新任务全塞进 query prompt |
| `authoringKnowledgeQuerySession.js`、`authoringKnowledgeAnswerContract.js` | 资料 envelope、来源授权、revision 对账；当前默认 MAX_EVIDENCE=28、MAX_CONTEXT_CHARS=28000 | 审稿需要完整所选正文的分批计划；28 条检索命中不等于通读全章/全书；补 coverage 报告 |
| `useAuthoringReviewWorkflow.js` | 冻结 source、最多六节点/重叠一节点的窗口、逐批 `writing.chapter.health`、finding 合并、定位/采纳/撤销、stale 检查 | 固定校对问题改为可选目标与方法；增加任务预算、跨批开放项和失败批次重试；校对的替换逻辑不直接承担创意意见改写 |
| `authoringReviewSession.js` | 本地引号/标点/重复检查、来源证据与 review transaction | 扩展 goal、evidence/coverage、定位歧义、意见状态；继续用此 session，不另建审稿数据库 |
| `useAuthoringRewriteWorkflow.js`、`shared/writingCandidateContract.js` | 单段/选区/多片段候选、diff、原文 revision、锁定片段、采用回调 | 从 finding 组装 frozen rewrite target；强化锁定片段校验，目前单候选入口的 `.includes(segment.text)` 不是完整位置保护 |
| `server/services/advisorTaskService.js`、`server/services/openclawService.js`、共享 task 合同 | 已有 knowledge/review/rewrite task 和解析入口 | 前后端统一支持 skillVersion/goal/finding；服务端白名单与 schema 同步，不能只改前端 |
| `project/knowledgeReadModel`、`memory/ledger/knowledgeLedger.js` | 项目证据读模型和角色知识 API；部分角色读取仍是注入端口 | author 事实与角色知情必须分开组装；未接通时不能承诺“自动角色一致性全覆盖” |
| 现有 manuscript position、search、worldbook revision、context manifest | 可检索、定位、核对正式来源 | 影响分析补变更前后对照、后续候选检索与覆盖状态；未见完整生产级影响传播任务 |
| `experience/run/runContract.js` | 跑团 run 的步骤/预算/回执，已本地整合 | 如复用，先提取兼容适配，禁止在作者助手中假设跑团恢复即通用恢复可用 |

这里的“已核实”是源码接线核查，不是本轮真实 provider 验收。最近推演采纳曾因初始化顺序卡在待保存，说明新能力尤其需要完整 UI 旅程验收，不能仅测方法函数。

## 4. 作者工作流与界面合同

沿用现有助手侧栏：顶部只呈现“任务 / 范围”，下面输入作者要求。常用任务为“问资料、审稿、按意见修改、查修改影响”；不新增首页、技能商店或独立助手窗口。

1. 作者输入“看这一章主角为什么突然信任对方，别改台词”。明确选择“审稿”后无需额外模型路由；自然语言可建议任务，低置信度时展示可改的任务选择，不默默切换写入模式。
2. 默认范围为当前选区；无选区则当前章。顶部显示当前书/章或双栏活动文档，切换作用域即取消当前请求。全书范围须作者选择，预先展示规模和预计批数。
3. 开始前冻结范围、目标、文风、限制、来源版本。显示“正在读取本章”“正在检查第 2/5 批”“正在核对引用”等真实事件；只有模型未返回时显示耗时，不用假阶段或虚构百分比。
4. 输出问题列表：位置摘要、严重程度、原文依据、为何影响作者目标、建议。最多先展开优先的 8 条，其余可展开；总数与已读范围真实可见。
5. 点“定位”在正文高亮原句；返回助手保留滚动位置。“生成修改候选”才调用已有改写；展示原文/候选差异与锁定内容，允许编辑后再验锁。
6. 采纳是唯一正式写入动作。成功后候选收起，意见显示“已修改，待复核”；不能因为点击采纳就说逻辑问题已解决。可撤销，撤销后意见状态同步。
7. 跨章意见允许先打开对应章，但不会因导航自动采纳。目标缺失/多处匹配时只读，并提供重新定位；不猜最近相似段落。
8. 390px 使用既有窄屏工作面，在意见/原文/候选间保留返回位置；长结果从开头呈现，用户回读时不抢滚动。快捷键、IME、选区保持与现有正文工具共享 owner。

上下文详情折叠展示：必读正文、补充资料、未纳入/被裁剪/无法读取资料、时间和知情范围。默认不展示工具 ID、JSON、token 明细；需要排障时再展开技术诊断。

视觉是扩展现有安静工具面，不做彩色 Skill 卡片墙。实现前按 UI skill 再读相邻组件并冻结 1440/900/390、明暗主题样例；本轮仅方案，不冒充视觉验收。

## 5. 结构与权限设计

### 5.1 最小方法描述（不是执行脚本）

每个内置方法包含 `id/version/taskKind/title`、支持范围、必需材料、方法文本、输出 schema、允许的只读能力、检查器、来源 SHA/license、评测版本。首批方法：动机/行动因果、铺垫/兑现、节奏/冗余；人物一致性作为前三者的证据维度，第二批独立校准。

描述只引用注册方法与检查器 ID，不能携带文件路径、shell、任意 JS 或网络地址。任务载入只选当前目标相关的方法和公共“引用/文风/信息边界”片段，不把全部 references 送入模型。

拟新增 `useAuthoringAssistantWorkflow` 作为薄协调器：选择既有 workflow、维护当前任务与回程；不接管正式写入。方法描述与结果 schema 放既有 `shared` task 域，方法文本放 agents/authoring 域，服务端与浏览器 provider 采用同一版本标识。`Authoring.vue` 只装配，不把流程继续塞回页面；严格保持现有结构预算。

### 5.2 输入、问题与候选

冻结输入建议字段：

```text
invocationId, taskKind, skillId, skillVersion, goal
scope: projectId, documentRole, documentId, chapterIds, branchId?
target: unitId, nodeId, range, exactQuote, prefix, suffix
revisions: document + node/unit + evidence + style
constraints: lockedRanges[], forbiddenChanges[], viewpointActorRef?, storyCutoff?
materialManifest, budget, requestedCoverage
```

沿用已有 locator 的 UTF-16 编辑 offset 约定，字数展示另算；禁止 JS code point 数与 ProseMirror offset 混用。`prefix/suffix` 帮助解释歧义，不足以绕过 revision。

问题在既有 finding 上扩展：`id/category/severity/target/evidenceRefs/explanation/suggestion/status`，另加 `goalId`、`evidenceQuotes`、`epistemicKind`（事实冲突/推断/审美建议/缺资料）、`affectedRefs`、`coverageRef`。单章定位必须有真实 nodeId 与可逐字核验的 quote；跨章冲突至少给冲突两端依据。纯审美意见无需伪造“客观证据”，但要指出实际段落与目标关系。

模型建议的范围、权限与 sourceRef 必须在冻结白名单中核对。拒绝新增 bookId/scope、不存在的引用、超出目标的 patch；格式修复最多一次，不能用宽松字符串解析把错误响应当成功。

生成候选时携带原 finding ID/修订号和作者附加要求，复用 `writing.fix.selection` / `writing.fix.paragraph` 与多片段合同。意见本身不得直接转换成编辑器命令。

### 5.3 锁定与写入

文字锁必须冻结 nodeId、原文范围、exactText/hash、出现身份。优先只对未锁定区间生成 patch，程序拒绝与锁定范围重叠；按文档倒序应用 patch，保证范围外字节不变。不接受“锁定句在另一处重新出现所以通过”。多片段、重复句、Unicode、候选手工编辑都走同一校验。

“不要改变人物动机/结局/关系”是语义限制，不可宣称能由 hash 证明。作为生成约束与采纳前复核，明确列风险并保留作者裁决；确需硬保护时锁定承载该事实的原文范围。

采纳时再次校验目标和全部必需依赖版本 → 现有保护版本/编辑事务 → 保存 → 成功回执/撤销。保存失败保留候选与仅重试保存；观察器、意见统计失败不得反向把已保存正文标为未保存。幂等键绑定 invocation/finding/candidate，不允许重复采纳插入两次。

### 5.4 工具与资料边界

本批以程序编排的确定检索为主，模型无需先拥有任意工具循环。若遇到缺依据需要补查，由现有工具 registry 暴露有界只读适配（正文范围、来源摘录、人物资料、知识/事实查询），能力名以实际注册表为准，不假设现有 narrative 工具可直接用于 review。

| 阶段 | 可用能力 | 不可做 |
|---|---|---|
| 审稿/影响查证 | 冻结范围读取、有界检索、显式授权来源摘要 | 模型扩大书籍/分支范围、改正文、改事实、执行脚本 |
| 候选生成 | 读取选定 finding、目标段及授权证据，返回有限 patch | 自动写入、增添未授权角色秘密、改变锁定区域 |
| 采纳 | 用户动作触发现有 commit owner | 模型自发 commit、跨书写入、用旧候选绕过 revision |

作者审稿可查看作者授权的真相，但人物台词/限知叙述不能因此获得秘密。按任务分别装配“作者解释证据”和“可写入该视角的证据”，后者由角色知识/故事时间过滤；读不到知识记录时明确缺资料，不回退为“全部设定皆知”。现有注入 reader 必须生产接线后才开放该保证。

## 6. 三项能力的实施深度

### A. 目标驱动审稿

目标不是“全面给分”，而是围绕作者要求做有限判断。顺序为：确定范围与风格 → 本地检查（已有重复/标点优先复用）→ 完整正文窗口逐批读 → 检索相关资料 → 输出/核引文 → 去重排序。

相邻窗口重叠只为上下文，问题以 canonical node/range 去重。长篇先登记 `planned/completed/failed/skipped` 范围；跨批继承开放问题摘要须保留证据 ID，不把模型摘要写成正式事实。空结果必须区分“检查完成没有明确问题”和“材料不足/请求失败”。严重度由具体影响描述支持，风格偏好不能升级成事实冲突。

### B. 意见转局部改写

从原问题定位重建目标，作者可缩小选区、补充要求和锁定台词；再生成 1–2 个候选。默认只改该处，不自动修改证据引用的其他章节。显示解决目标和改动位置，不要承诺“问题已解决”。采纳后以该局部和关联证据做一次可选复核；失败时意见保留“待复核”。

第一批也必须覆盖保存失败、重复点击、刷新与切章，而非留到后续再补。审稿记录是可丢弃/恢复的工作流数据，正文真源仍只有现有 repository。

### C. 修改影响检查

输入必须有可信的 change set：变更对象、变更前后 revision、被改事实/原文及作者指定后续范围。若无旧版本，只能做“当前一致性检查”，不能宣称由这次修改造成。

检索先按稳定实体 ID、引用、别名、相关事实/承诺找到候选章段，再对照原文判断。输出分“有双端证据的冲突”“可能受影响，待作者确认”“已检查未发现”“未检查”。词面命中不是依赖证明；剧情隐性因果无法保证穷尽，须报告召回范围与未覆盖部分。

章节顺序由 manuscript position 提供，不等同故事时间；倒叙/插叙按时间资料解释。改早章不会自动覆盖当前角色知识状态或删除后续记忆：只生成复查项，事实修订仍经过既有审批/账本路径。删除来源、重命名人物、章节重排、多个版本必须单独验收。

结果放现有助手/历史变更的“检查影响”入口，默认列清单，可逐条定位和生成候选；没有“一键修正全书”。任务取消/预算耗尽后保留已检查范围，可续查剩余部分但重新验证依赖。

## 7. 执行队列与文件所有权

按依赖连续完成三批，不能把第一条提示词上线或一次绿色测试当整计划结束。下表为实施包而非时间承诺；实际工作量由接口核查和评测决定，不以虚构夜间工时凑满计划。

| 包 | 实施与主要 owner（现有文件优先） | 依赖 | 完成证据 |
|---|---|---|---|
| S01 | 冻结旧助手/校对/改写实际旅程及故障基线，`scripts/authoring-ui/` | 无 | 真实页面可重现路径与输入/输出，不仅源码匹配 |
| S02 | Oh Story 来源清单、许可证、首个纯检测函数适配 | S01 | 固定 SHA、原始 fixture 与适配 fixture 一致；无 fs/CLI 进入前端 |
| S03 | shared 方法/task/schema 白名单、前后端版本协商 | S01 | 未知版本/字段/工具被拒绝，旧问答行为保持 |
| S04 | review session 增加作者目标、scope、style resolution、coverage | S03 | 已读范围可核查，不把 Top-K 当全量 |
| S05 | 三个目标方法最小组合及检查器整合 | S02,S04 | 方法有对照样本，现有标点规则不重复造轮子 |
| S06 | 既有 review 窗口分批、预算/取消/失败批次/开放项 | S04 | 中断保留已完成批次，重试不重复所有请求 |
| S07 | finding 引文/locator/依赖校验、去重和级别区分 | S05,S06 | 伪引用/歧义/过期只读，有证据的定位成功 |
| S08 | 助手任务选择、目标/范围与结果行，薄协调器 | S03,S07 | 1440/900/390 连贯操作，无新页面 |
| S09 | finding→既有 rewrite target，意见/候选稳定关联 | S07,S08 | 不复制粘贴即可生成局部候选，范围外不变 |
| S10 | 锁定区间及 patch 校验前后端贯通 | S09 | 重复句/跨段/多片段/候选编辑负例全部拒绝 |
| S11 | 采纳/持久化/撤销/意见状态/返回位置联动 | S09,S10 | 失败只重试保存、双击幂等、旧候选不能覆盖 |
| S12 | 第一批组合 Gate 与小样本真实稿件校准 | S01–S11 | 完整首流程，硬门禁与质量结果分别报告 |
| S13 | change set 接历史 revision、worldbook 变更；缺旧版降级 | S12 | before/after 真实可追溯，不做假因果 |
| S14 | 实体/引用/别名候选检索和后续范围 coverage | S13 | 显式依赖样本召回全部，隐性召回单独报告 |
| S15 | 双端证据冲突、时间/知情过滤生产接线 | S14 | 倒叙/秘密/信念与事实区分负例通过 |
| S16 | 影响结果→定位/候选、停止/续查/版本失效 | S15 | 多章只读清单，逐条采纳，零自动全书写入 |
| S17 | 工作流恢复：已有存储 owner 下持久 session/result refs | S06,S16 | 刷新标 interrupted，不自动重发模型；ZIP/清理政策明确 |
| S18 | 轻量 run 合同适配、超时/预算/工具回执与跨标签采用围栏 | S17 | HTTP 与 HTTPS 降级差异明确，未支持环境不假称互斥 |
| S19 | 人物一致性/文风/伏笔专项方法扩充与反例校准 | S12,S15 | 只有效果达标的方法进入默认入口 |
| S20 | 真实稿件盲评、误报分析、成本/延迟、失败自救 | S16–S19 | 发布质量门禁；未达标明确降级不改成假通过 |
| S21 | 原问答/校对/改写及知识范围回归、视觉/可访问性 | S20 | 原功能通过，键盘/IME/读稿位置不回退 |
| S22 | 主计划/手册/已知限制/回执、干净检出与最终门禁 | S21 | 可交接版本、所有未完成项准确，未部署不称上线 |

检查点：S12 第一条完整流程；S16 三能力闭环；S22 发布候选。前批通过后继续有依赖就绪的下一包，真实稿件暂不可用时继续确定性/负例与接口工作，但真实质量 Gate 保留未运行。已有夜间 M06/M10/T09 等依赖只接所需生产切片，不复制第二套实现。

文件写集：UI 在既有 assistant/review/rewrite 组件及 composables；方法/引用处理在 agents/authoring；跨端 schema 在 shared；provider 解析在 server/services 既有 owner；正文/世界书/账本各自 commit owner 不变。若以后安排多工作流开发必须按这些写集隔离，本次不启动其他 agent。

## 8. 验收矩阵和真实质量门槛

### 8.1 硬门禁：必须全部通过

- 当前书/章/活动双栏正确；跨书、跨分支、角色秘密未授权不得读取或输出至候选。
- 必需引文可逐字核验且 locator 唯一；不存在来源、被删除来源、错引用、资料中的恶意指令均不得提升权限。
- 采纳范围外零修改；锁定片段原位置/顺序/出现身份不变，emoji、重复文字、多 patch、跨段分别验证。
- 请求期间正文/证据/风格变化、切书、刷新、迟到结果、取消和超时不能写回新目标。
- 保存失败/IndexedDB 不可用/配额满保留可恢复工作；再次保存不重新生成、不重复应用；观察器失败不污染已保存回执。
- “无问题”仅用于完整成功检查；窗口失败/检索截断/缺资料显示 partial 与具体范围。
- 工具参数伪造 scope、超出白名单、无限补查、重复 tool call、未知 skill/schema 版本全部 fail closed。
- 长文本从开头可读，用户滚动不被抢回；空格/斜杠、中文 IME、Tab/Escape、窄屏回程与 stale 操作可用。

核心 Vitest 保持 ≤20 文件/200 用例，在既有用例中扩反例；长期质量与压力矩阵使用显式 scripts/eval。正式批次执行 `npm run verify:full` 及新完整浏览器旅程；已有问答 `f2-knowledge-assistant-check`、校对和改写实际脚本入口先由 S01 核实再登记，不能引用旧报告数字代替本轮跑数。

### 8.2 真实稿件质量：提议的上线门槛，不是现有成绩

样本分开发集与保留集：至少 12 组章段任务，覆盖动机/铺垫/节奏/人物知情四类；另至少 6 个变更影响任务（有冲突、无冲突、隐性关系、倒叙、同名、缺旧版）。至少一半保留到方法冻结后。作者选择有权使用的稿件和渠道；本轮没有发真实模型请求。

同一模型/预算对比“当前通用审稿提示”与“方法+程序检查”。盲评维度：定位正确、证据相关、建议能否落实、误报、保留文风、是否引入新事实、候选修改幅度。不能用模型自评分或采纳率单独证明质量。

建议初始阈值：有效引用/作用域/锁定/旧稿保护等硬错误为 0；可定位建议 ≥95%；作者认为有帮助的问题 ≥70%；明确事实冲突 precision ≥90%；保留集至少 8/12 目标任务不劣于基线，其中至少 6/12 明显更好。统计分母、弃权/缺资料、两位评审分歧（若有人力）全部报告；小样本只作为内测门槛，不外推整体成熟度。

修改影响：确定性人工标注显式引用/实体依赖 fixture 必须全召回；真实隐性因果报告 recall 与 precision，不承诺全书漏检为零。无问题样本必须纳入，防止上游“审查就是找问题”让模型硬凑意见。

建议默认预算：每任务最多 3 个审稿目标；每批正文约 6000 中文字符并受模型 token 余量约束；默认最多 8 批/任务，超出显示待续而非静默裁剪；每批至多 2 次补查、1 次格式修复；单条改写最多 2 候选、1 次修复。均为待校准初值，S06 需与现有 provider timeout/output budget 对齐。并发默认单任务，重试沿用已完成批次；不通过无限自我修订刷出“通过”。

记录首个状态出现时间、首条可用 finding、总耗时 P50/P95、请求数、输入/输出 token（渠道可返回才记录）、错误率；无法得知费用时显示未知，不伪造价格。以真实预算选择可用模型，不把慢模型等待掩盖为连续假进度。

## 9. 发布与退路

按三个批次分别启用任务种类；旧只读问答继续可用。某方法质量不达标时只禁用该方法，不让用户丢失正文或已生成候选。内置方法固定版本，旧结果保留生成版本；更新方法不自动重新生成或修改原稿。

采用状态机必须区分：idle → preparing → running → validating → ready/partial → candidate → applying → saved/persist-failed；cancelled/stale/interrupted 作为显式出口。状态存储加入既有清理/备份 owner，有 TTL/容量和用户清理入口，密钥与原始 prompt 不进入公共诊断。工作流恢复是派生工作记录，不成为第二份人物/情节真源。

本次计划无需依赖某商业产品代码可获得；确定可复用的部分来自 MIT Oh Story 及 Pinax 自身现有工作流。商业产品只作为交互证据。方法有效性、真实模型遵约和隐性因果召回仍需要上述评测。

## 10. 本轮交付边界

已完成：基线源码核查、Oh Story 固定版本/许可证与部分方法/脚本阅读、Novelcrafter/Sudowrite/Lex 官方公开资料核对、方案和连续实施队列。未完成：运行时实现、上游代码适配、商业产品登录实机复刻、NovelAI 最新文档核实、真实稿件/模型验收。不会因为本文存在就更新功能完成状态。

维护规则不新增：现有证据分级与完整旅程验收要求已能约束本任务，重点是实际执行。后续最先启动 S01–S03，并以 S12 的完整作者流程作为第一轮可用交付。
