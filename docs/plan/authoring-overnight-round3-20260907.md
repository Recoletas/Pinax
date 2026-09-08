# 第三轮夜间任务：补齐第二轮，交付可控试演与安全资料闭环

日期：2026-09-07。状态更新（2026-09-08）：**已执行、部分交付；后续转[第四轮任务书](./authoring-overnight-round4-20260908.md)。没有整夜续接证据，不能按全包完成处理；验收后局部修复见第四轮最新基线。** 以下为当时原定目标。

执行真源改为本文；[第二轮](./authoring-overnight-round2-20260906.md)保留需求细节，但不得沿用其“待执行”和 worker 自报全 done。上位仍为 [体验计划](./authoring-ux-and-story-play-plan-20260905.md) A2–A4、[并行建设计划](./authoring-parallel-foundation-plan-20260905.md) K/I0/E0/H0。

## 1. 两次失败后，必须改的不是任务数量

上一版存在三个实际问题：以未经实测的小时数估任务量；把启动、续接、done 判定留给 worker 自报；要求 K 页面闭环，却没有明确分配实际 composable 调用入口。U 以“需要设计”退出，K 以 CLI 和默认关闭页面测试替代启用验收，都没有达到目标。

本轮采用 **启动验收 → 实现候选 → 独立拒收/通过 → 接续队列**。worker 只能交 `ready-for-review`，不能把自己写的 summary 当 `accepted`。昨晚的绿灯只有在同一受验代码与相应功能路径上才有效。

这不是要求工作满 8h 才结束。8h 是用户睡眠期间的默认运行上限；不再给每线“5–9h 工作量”这类无依据估算。要保证的是：目标未交付、仍有就绪任务时不能退出；完整交付真的提前完成，才可诚实报告提前完成。重复跑同一绿色测试和写更多摘要不算新成果。

**早晨应获得的完整变化：**

1. U：输入/查找返回可靠；“选走向→追加一句要求→生成新稿→保留旧稿→采用/撤销/重做”能完整操作；另一稿可显式留作构思。
2. K：资料助手正常 UI 路径能在隔离启用环境消费安全接缝；取消、预算、必需来源、默认关闭兼容不互相绕过；来源变化使旧答案失效。
3. 一份绑定最终代码树的独立验收报告；不合格就列出确切失败，不把“部分交付”写成整夜完成。

## 2. 最新事实：补昨晚，但不重复已修工作

编制本文时：main 为 `05af532`；U 有 3 个未提交代码/脚本文件，仍在 main 工作区。K 已从被验收的 `bfce8f5` 更新至 `d3978d1`（修复代码 `53ecc72`），尚未合 main。启动时必须再次核对，不硬编码旧 HEAD。

| 第二轮任务/问题 | 最新状态与本轮处置 |
|---|---|
| U01 网络隔离 | 有真实 provider opt-in 修复；仍须验证导航前拦截、实际请求计数及续接。转 O0/U31 |
| U02 J1/J9 | 独立 J1 单次过；J9 仍 4000ms 超时，未达最低交付。转 U31 |
| U03 搜索 | J11 单次过；新增 `!surface?.pane` 与正常 main/dual 身份不符。转 U32 |
| U04 采用/撤销/重做、可达性 | 部分审计，redo 遗留未关闭。转 U33 |
| U05 追加要求 | 未实施；“需要设计”不是范围外阻断。本轮固定最小交互与状态机。转 U34 |
| U06 样板/冻结 | 没有全链与最终 tree 交付。转 U35/O2 |
| U-R1/R2/R3 | 未见完整交付；分别转 U33、U35、U36，不再漏在摘要后面 |
| K21–23 清单/硬化/桥接 | 已有有效代码和矩阵，保留；以新增组合边界复验，不重建。转 K31–33 |
| 取消、零预算、必需来源未点名 | 对 d3978d1 复跑单项探针，均已 typed 拒绝；仅判“单项复验通过”，不是整条接缝通过 |
| 必需来源 × 有效小预算 | **新组合复现仍失败**：两条已点名且必需的资料，budget={maxOutputItems:1,maxOutputChars:1}，最终 ready 并补回两条原文。转 K31 |
| default-off 指纹 | 最新代码同输入/now 与 main 的 session fingerprint 仍不同。转 K32 |
| K24 故障降级/取消边界 | 单项修复后仍须覆盖桥构建失败、无绑定、异常和中途取消，不能只测 K query 正常返回的 aborted。转 K33 |
| K25/K26 页面 | 新增浏览器动态 import 运行时断言；回执已承认不是点击旅程。转 K34，明确给调用入口写集 |
| K-R1/R2/R3 | 变形矩阵/内存仓基准/ADR 草案已有；扩大到组合门禁与真实 reader 成本，ADR 只复核缺口、不重写。转 K35/K36 |

以上判断依本地源代码与合成探针，不代表真实 provider、真实 Windows IME 或移动软键盘已验收。

### K 组合失败的可移植复现规格

不依赖 /tmp 才能接续：使用正式 `createAuthoringKnowledgeQuerySession`，注入内存 repositories；book=review-book、worldbook=review-world，两条条目 key/other，正文均非空；queryIntent=whole-book、question=钥匙、固定 now。

- normal：接缝 enabled、sourceRefs=[key]，只发布 key。
- pre-abort：同上，signal 已 abort，零证据、零执行模型。
- zero-budget：items/chars 都 0，按当前合同属无效输入，typed 拒绝；不能将其误写成“合法空预算测试”。
- missing-required：required=[other]、requested=[key]，typed 拒绝。
- **required-tiny**：required=requested=[key,other]，合法正预算 items=1/chars=1，必须因必需来源无法容纳而 typed 拒绝，不能补回原文绕过限制。
- off：不传接缝参数；对同一 fixture/now，比较上一稳定 main 的完整规范化 session，至少 fingerprint、evidence、authorization、revision 完全一致。

执行者须将这些规格落实成带断言、失败 exit 非零的正式 Gate。上一轮仅打印结果的探针 exit 0 不算通过。

## 3. O0：睡前启动验收——没有这一关，不叫整夜任务已启动

由一个明确的启动/集成 owner 负责；可分别委派 U/K，但不在本轮写计划时启动。owner 不与 worker 并写代码，独立审核和后续合并由 owner 承担。启动记录应同时覆盖 U/K，不能一张板写“U 未派发”，另一处实际在 main 改 U。

### 3.1 保全、基线与所有权

1. 只读检查 main/U dirty/K 最新 HEAD；含未跟踪文件保存 U 真实快照、校验 hash 和可恢复路径。禁止 reset/clean 或假装 main 干净；旧 `text-game-framework` 不作为开发源。
2. 在隔离候选中封装 U 当前增量；K 从最新冻结 K 分支续接。允许两条线具有不同代码基线，**明确记录各自 base 和共同祖先 05af532**；不要为凑共同 base 把未验收 K 强行合 main。晨间再串行合成。
3. 各创建独立 round3 worktree/branch，U/K 都不在 main 写实现；复制本计划为同一版本，记录计划 hash。源码 base、计划版本、允许写集各自登记。
4. 核验独立 Vite/Vitest 可写缓存、端口、服务 PID、源码根；安装/缓存问题仅处理本线，不改共享 package/lock。不启停用户已有 5173/5175。
5. 浏览器采用临时 context、合成 fixture，导航前建立 HTTP/WebSocket 外发拦截。生成只走显式 mock；没有 mock handler 的生成请求必须使 Gate 失败，不能落到真实后端。

### 3.2 续接必须真的跑一次

先复用已有可恢复执行方式；若没有，O0 的交付是一个仅面向本任务的薄启动/续接脚本，不建通用 agent 平台。启动方式、命令、进程归属、断点文件由 owner 实际运行验证，不能只写“请持续执行”。

睡前用两段无业务写入的短任务测试：第一段完成并退出 → 同一 run 自动读取队列 → 执行第二段。再模拟 worker 非零退出及无产物退出，证明不会标 accepted，能保留断点并领取独立就绪包/报告阻断。测试控制异常恢复次数，不无限重启。

若 owner 无法提供续接证据，则本次只能登记“普通单次会话”，必须告知用户，不能声称已经安排 8h 无人值守。准备环节最多一个 60min 排障窗口，仍失败先交启动阻断，不耗夜晚在无上限基础设施开发上。

### 3.3 队列是结构化状态，不是自由文字

每包必须登记：

`id / owner / base / dependencies / allowedFiles / status / implementationTree / requiredChecks / evidencePaths / startedAt / finishedAt / activeMinutes(unknown允许) / blockedReason / nextReady`

状态：queued → running → ready-for-review → accepted；失败则 needs-fix；外部缺失才 blocked。worker 无权直接写 accepted，owner 必须执行固定门禁且审查结果。不接受“有设计工作”“实现复杂”“测试还得改”作为外部阻断。

requiredChecks 的预期由本文冻结，worker 不得在修产品时顺带删掉安全断言。允许修不合法测试驱动，但要保留原失败、解释它为什么不模拟真实交互，并用正常用户操作补覆盖。

O0 通过才签发 start；板上填写实际 UTC/本地开始、T+6h 功能冻结、T+8h 截止、owner 和服务归属。本计划不预填不存在的开始时间。

## 4. O1：夜间推进规则

- worker 每包结束、长包每 30min 写进度。owner 每次候选交付必须确认它绑定的代码树并独立运行最小反例；自动检查不能代替代码判断，但可以阻止缺证据的 done。
- 一个单项通过后自动领取下一个就绪包；前两小时必须出现目标包的实际设计/实现进展或具体依赖失败，不能只把初始修复包装成整轮成果。
- 诊断 30min 无新证据先换方法；同问题累计 90min 仍无进展，记录最小输入、已排除原因与下一实验，转不依赖它的任务。安全问题只阻断受影响路径，不替整线制造退出理由。
- T+6h 不再接新功能，只修本轮回归、验证、归档。T+8h 按最终树交付；不能为凑时长重复测试，也不擅自加 I1、数据库或付费生成。
- 所有主包 accepted 后，先做 §8 跨包反例和加深队列；全部可执行项均 accepted 才允许“队列耗尽”。其余为 blocked 时由 owner逐项确认，摘要为部分交付。
- owner 不可用时 worker 可继续独立就绪工作并交 ready-for-review，但不能冒称 accepted/整轮完成。夜间不合 main、不 push、不上线。

## 5. U：把昨晚缺的写作与玩法补成闭环

### U31 · 输入/右键/IME（承接 U01/U02）

入口：Notebook composition capture/settling、blank-area click、页面右键恢复；journey runner/mock。

先保留昨晚 J9 失败，分别观察 DOM selection、PM selection、activeElement、composition owner 和 request token。实际 Ctrl+A 不工作时必须核实快捷键/焦点，不用私有 exposed selectAll 把用户失败藏掉。原生 IME 不可用时保留 synthetic 合同与真实设备待验两个状态。

交付门槛：J1 20/20、J9 synthetic 10/10（保留全部失败分母）；另覆盖主/副栏、正反选区、空章、全选替换、Esc/Enter/Tab、切章/关闭、迟到 Ghost。组合中零误采纳/结构变更，组合结束一次正确提交；书签 stale 拒绝修改，不因“focus 成功”恢复权限。不能只延长 timeout。

若 U31 暂未收口，可做 U34 的纯状态机和 U35 的离线样板；相关可编辑新路径保持未验收，不绕过输入门禁。

### U32 · 查找回到正确编辑面（承接 U03）

入口：captureCurrentWritingSurface、closeSearchPanel、全局 selection 清理、搜索面板。

固定行为：未导航关闭回到原位置；点击结果后关闭留在结果位置及所属主/副栏；显式“返回原处”才回原锚点；restore:false 不抢焦点。删除/换书/stale 不能恢复旧选区；点击正文后不强拉回。

去掉无效 `!surface?.pane` 判断或改为真实目标身份，不使用 document.querySelector 的第一个 PM 代替活动栏。测试只走点击/键盘，不能通过 Vue 私有实例强制补选区。

门槛：J11 10/10；主/副栏×同/异章、未导航/已导航、关闭/返回原处、来源修改/删除各有用例；关闭后可在命中字符上添加批注，非目标正文/hash 不变，选区方向与滚动位置符合动作。

### U33 · 采用/撤销/重做与可达性（承接 U04/U-R1）

入口：既有 Ghost 采纳事务、redoGhostAdoption/redoNotebookEdit、BlockDraft、双栏标题与工具栏。

先复现 U 回执所称 redo 失败并与基线对照；已有遗留也属于本轮明确修复范围，不能再写“非本轮引入所以不做”。复用原 undo/redo，不增加独立历史栈。

门槛：草稿手改→采用→一次撤销→一次重做，正文、单元身份、scene delta、批注/来源一致；保存失败只重试保存，不重新生成；取消/迟到/双击零重复采用。原文与非目标章 hash 有前后证据。

1440/1024/390/360、720×450/560×450，深浅与键盘检查主动作可达。保留最终展开 composer、手机目录堆叠、Worldbook 内容优先；状态/交换/关闭不挤章名。只修实测缺口，不再次全页重排。无问题的项交具体证据即可，不重复改。

### U34 · 作者追加一句要求（承接未做的 U05，设计在此定下）

不新建一整套试演 UI：在现有 SceneLaboratory 选中方向下，加入默认空的一行/可增高输入“按这个方向，但……”和一个“按新要求再试”按钮；旧作者意图、方向摘要可回看。使用当前样式原语，手机换行不盖住底 rail。

采用会话内最小状态：

- idle：当前稿可编辑；追加文字尚未提交，不改变 frozen direction。
- preparing/generating：生成新 requestId，冻结原方向引用、追加要求、target/revisions；保留 previousDraft，只能停止新请求，不能把旧 token 套给新稿。
- ready：当前新稿和上一份稿可切换查看，各自保留编辑文字；切回不等于恢复采用许可。
- cancelled/failed：旧稿和追加文字保留；不得自动再规划一组方向。
- stale：保留可读稿，拒绝原位采用，明确重新选择目标。

入口：SceneLaboratory、authoringSceneLaboratoryRun、现有 run/intent 接缝及 Authoring 的 U 侧调用。追加要求通过现有 instruction 表达，不新增 shared/provider 协议；无法复用时交具名合同差距和失败例，而不是“需要设计”。仅当前与上一份会话内稿，不做无限分支树。

门槛：按钮两次快速点击只有一个新请求；实际请求含作者补充要求；改要求后重新校验来源/目标；取消保旧稿；过期任一稿不能采用；换书不串写。先交状态机断言，再接 UI，但状态机 alone 不能把本包标 accepted。

### U35 · 三类可玩样板与质量边界（承接 U06/U-R2）

样板固定：①总册被动过，莉娜想保密且维持与艾德加关系；②暴雨/停电等物理约束；③无世界书普通稿。各跑原意图、追加要求、冲突要求、取消保旧稿四种路径。

方向 action/gain/cost 须在行动/信息分配/代价上不同；mock 根据收到的要求改变响应，不能写死“修改成功”。检查实际 prompt/transport 约束传递，冲突不可无声忽略。已有 source refs 的事实与作者假设分开呈现。

门槛：三类全部可按正常 UI 进入→选方向→补一句→查看新旧稿→采用或放弃；每类有步骤、截图、请求计数、正文 hash。只证明可玩交互和合同，不宣称真实模型更有趣。真实模型渠道/费用/用户盲读仍待明确批准。

### U36 · 另一稿留作构思（补 U-R3）

显式“留作构思”复用已有 exploration repository/IdeaShelf；保存一份稿件、原意图及现有合同可表达的来源引用。作者可以改名、打开、编辑和删除；未点击不自动建档。

门槛：保存失败不丢当前稿；重复点击不重复创建；原章 hash 不变；来源删除仍可读但旧采用许可不复活；重新试写创建新 session。字段无法表达时保留缺口而不新增存储 schema，此项标 blocked，其他可验包继续。

## 6. K：先修组合边界，再把开关真正接到作者路径

### K31 · 预算与 required refs 共同成立

从最新 `d3978d1` 而不是旧失败版本开始。保留已修的单项拒绝；移除“预算裁掉的 required 原样 append”这种绕过。

冻结策略：硬安全/预算优先；required refs 必须全部在明确请求集合内且能容纳，否则 typed 失败。成功则所需 refs 全在最终 evidence、最终条数/字符都不超预算；不得一边 ready 一边缺必需来源，也不得为保 required 扩预算。

矩阵至少覆盖 requested/required 的空、相等、真子集、不相交、目录外；items 1/2/上限，chars 1/恰好/少1；桥接截断与最终 F2 装箱后的交叉。0 是非法预算，不冒充有效小预算。返回的 metadata/diagnostics 按合同计数，不能只量 excerpt。

接受证据：§2 required-tiny 原本能失败的断言现在通过；正常大预算控制组不回归；实际 provider envelope 同预算/引用结论一致。核心断言并入既有测试，不绕过 20/200 上限。

### K32 · 默认关闭与身份兼容

固定策略：off 保持旧 fingerprint 哈希输入，而非无条件增加 null 字段。关闭时不新增源读取、桥接查询或模型调用；允许安全的编译依赖存在，但不能把“无 UI 标记”当“行为逐位不变”。

接受证据：同一内存仓/固定 now/旧 main 基线的规范化 session 与 off 新版本比较；fingerprint、evidence、authorization、revision 全等。启用与关闭各重复 prepare、来源变更后对账正确；不拿两次新版输出相等代替跨版本比较。

### K33 · 终态、取消和故障降级

固定策略：aborted/denied/invalid/必需来源不足/预算不足均不回退重检索；运行故障才可降级，且仅在“本次点名 ∩ 原 F2 授权目录”内，绝不退回整个 scopedCatalog。

signal 在入口、异步 reader 返回、桥构建前后、最终发布前检查；若底层不能真取消，至少阻止结果发布和后续 provider。默认关闭旧路径不顺手改接口语义。

接受矩阵：预取消、读取中取消、桥不可用、无绑定、不可映射来源、内部异常、绑定变化、重复 ID 与 required 组合；每条记录最终状态、证据、调用次数。主动抛异常验证异常分支，不用正常 query 的 aborted 单例代表所有取消路径。终态零发布，故障降级不增加范围。

### K34 · 真正的现有助手点击闭环（补 K25/K26）

**本轮明确开放 K 写集**：`useAuthoringKnowledgeAssistant.js`、现有 KnowledgeAssistant 组件及 K 的 query session/bridge；不新增聊天页面或设置页。若需要 Authoring.vue 新 prop，由 owner 在独立接缝窗口做一个具名最小适配，U 暂停该文件；K 不偷偷并写。

默认 feature flag 关闭；使用既有约定或新增默认 false 的构建/依赖开关（名称在 O0 冻结），测试环境可开启，不自动开启正式用户会话。生产调用仍走原 ask→prepare→executeQuery→answer→reconcile。

点名范围来自可信调用方的当前来源/已有 F2 检索选中结果，不接受模型自报授权、不硬编码 fixture ID。无法提供明确受控来源时保留旧路径，并注明本次未用 K；不能每个问题都假装启用。

验收必须由作者能操作的入口触发：打开现有助手→询问/查选中资料→mock 回答→点击来源→修改该来源→旧答案 stale；另测停止、换书、换绑、双栏未保存稿。可为测试启用开关、注入初始 fixture、拦截 transport；**不得在 page.evaluate 中直接调 prepare 来替代这条点击路径**。

同时断言本次实际进入 K（低敏测试 trace/spy 计数即可），并检查真实发送的 envelope。原默认关闭 UI 27 项继续过，新运行时 6 项可保留但不冒充点击 Gate。不新增第二次 provider 请求。

### K35 · 接入组合回归（补 K-R1、旧 K25）

既有 eval/bridge/hardening 全跑，再补 K31–34 交叉：角色/作者边界、两个项目共用世界书、through-target/whole-book、liveSource、主/副栏、来源新增/删/改、关闭/取消/迟到、默认关/开。

仅作者视角、既有已授权世界书/历史资料；记忆若保留映射必须沿原 accepted 权限，不扩大首轮启用范围；角色秘密、任意历史时点、未来正文、未采用假设与历史工具不开放。

接受证据：secret 增加不改变可见结果/诊断；来源或 scope 变化废弃旧许可；早退/异常不会走另一条路径补回被拒内容。每条有 seed、实际结果与预期，失败分母不删。

### K36 · 真实读取成本与历史草案收口（补 K-R2/R3）

保留已完成 H0 ADR，只对验收发现的预算/状态/作用域边界补差距，不重写一份相同研究冒充新交付。

基准分内存仓与浏览器合成项目正式 reader 两层，分别测读/clone/freeze/catalog/K query/bridge/装箱，记录冷/热、p50/p95、序列化大小和取消后是否有残留工作。用真实 reader 不等于使用用户真实数据；不动用户项目。

1k 查询 p95≤100ms 为已有建议门槛，性能劣化先定位；不引入 Worker/永久缓存/SQLite 新库掩盖。测量不支持的项明确保留，不把内存仓耗时写成 IndexedDB 性能。H0 仍是待评审设计，不实施历史账本/迁移。

## 7. 写集、测试和权限

| Owner | 专属写集 |
|---|---|
| U | Authoring.vue 的写作/试演/搜索接缝、Notebook、BlockComposer/Draft、SceneLaboratory、AdoptionImpact、IdeaShelf、现有 scene run/intent 调用；U journey/mock/runner、U/F1/双栏/搜索浏览器脚本；既有 authoringTurnComposer/uiControlContract/authoringTurnRuntime 测试 |
| K | knowledgeReadModel、authoringKnowledgeQuerySession、useAuthoringKnowledgeAssistant、已有 KnowledgeAssistant 组件；独立 K eval/benchmark、f2-knowledge-assistant-check；既有 authoringAgentWorkflows 测试 |
| owner | 本轮启动/验收薄脚本、共享板/计划/状态；双方都需要的最小页面 prop/helper 交接；晨间合成验证 |

新文件应放本线目录并登记。涉及 shared/schema、工具注册、store 或测试预算变化必须退回 owner 判定，不在夜间自行扩权。页面接缝移交期间记录锁的获得/释放；未拿到锁可推进本线其他包，不能等到整线退出。

执行时：UI 用 ui-style-check；世界书/上下文用 worldbook-workflow；验收用 testing-verification；状态用 docs-status-handoff；提交用 commit-conventions。全量核心预算不超过 20 文件/200 用例，实验矩阵采用显式 scripts。

本轮禁止真实付费模型/外网素材、I1 历史 tool call、永久历史写库、全仓库清理、手机目录方案擅自更换、整页重写、生产开关自动启用、main/server-version 合并/push。模型质量、视觉冻结和真实软键盘仍由晨间决定。

## 8. 主包后仍有时间：加深而不是重复空跑

以下也是执行本文时的可接续范围，前置满足后自动领取：

1. **U 混合长程旅程**：三种样板穿插输入法、查找、双栏、再试、保存失败、撤销重做；不是独立按钮各过一次。记录实际请求数与每步目标/hash。
2. **K 故障交叉**：预算边界 × 必需来源 × 取消时点 × 换绑，用确定 seed 生成有界样本，独立 oracle 验证终态与范围；把发现归约为最小失败例。
3. **owner 合成兼容候选**：仅在两线可交接且用户批准执行本文的隔离验收范围内，构建临时合成树做 U 新稿/取消与 K 助手查询交错测试；不推进 main。冲突由单 owner 解，不交给 worker互改。
4. **无障碍与响应式补漏**：只限受改面，键盘、长名称、两档缩放、小高度、深浅、reduced-motion、正常滚动可达；不扩全站审美重构。

没有具体新检查/反例的“再跑一次全量”不算领取新包。所有主包与以上就绪项 accepted 后才允许提前结束；若真提前完成，报告实测耗时，不发明“工作了 8h”。

## 9. O2：交付与晨间验收

每线独立 `docs/agent-runs/<run-id>/<u|k>/{progress,summary,verification}.md`；大日志/截图在本线 tmp。共享板由 owner 维护。summary 首屏必须回答作者能做什么、没做什么、失败项、第一条验收动作。

每个 accepted 必须带：最终 code tree、source base、计划 hash、命令/exit/分母、页面源/开关状态、全部失败、产物路径、独立 reviewer 结论。测试通过与用户视觉/真实模型判断分开。归档不得只引用会消失的 /tmp 探针；必要 fixture 和正式检查脚本纳入本线提交。

最终代码冻结后跑专项 + verify:full；代码再改则旧证据失效。按 concern 收口提交，列出全部 tracked/untracked；只提交文档不改变 code tree，但必须准确引用最后代码 SHA。停止自己的服务并释放写锁，不在共享 main“再补一点”。

晨间约 30min：

- 先核对 O0 续接记录、两线冻结、代码树和失败；先看失败，不先看总通过数。
- U：实际 Ctrl+A/组合态→查找关闭→正确栏批注；追加一句再试→取消保旧稿→采用→撤销→重做→留作构思，观察小屏和长标题。
- K：同 fixture 开/关真实助手点击链；required-tiny 必须拒绝，取消零内容；改来源后 stale；确认本次是否真的用了 K。
- owner 比较 accepted 与 ready-for-review，整轮目标未达即部分交付。用户另行决定是否合并、启用 I0、进行真实模型评估；不自动 push。

## 10. 可直接派发的指令

### 启动/集成 owner

执行本文 O0，先保全 main 的 U WIP 和最新 K 冻结分支，给双方独立工作区及明确写集。先跑续接/异常退出两段自检，未成功不要称整夜已启动。独立运行固定反例后才能将 worker 的 ready-for-review 改 accepted；接受后派下一就绪包，拒收则返回确切差异。O0 没有实际启动和续接记录时，本轮仍只是单次会话。夜间不推进 main、不启用正式开关。

### U worker

补完 U31–U36，不重做已确认布局。J9、搜索身份、redo、追加要求、三类样板、留作构思都要逐项交付；“需要设计”不算阻断，按本文最小状态机实现。安全包受阻就转独立状态机/样板，不隐藏失败。提交 ready-for-review 后继续就绪包，不自行宣布整轮完成；T+6h 冻结功能，最终按树复验，停止本线写入。

### K worker

从最新冻结 K 续接，先按 §2 单项与组合探针区分已修/仍失败，完成 K31–K36。required 不能绕预算，default-off 保持旧指纹，终态不降级扩范围。本文明确给出 composable/组件接线写集，K34 必须通过现有助手正常点击跑到新接缝，不用浏览器 import/CLI 替代。页面 prop 需要交接时找 owner，不并写 U 文件；完整矩阵和正式 reader 基准通过后交 ready-for-review，默认开关仍关。

## 11. 本轮文档交付边界

只编制本计划和同步状态，不启动 O0、不建立夜间运行器、不实施 U/K 修复、不合并。文档 verify:full 只验证当前工作树门禁，不等于第三轮任务完成；实际结果记 LOG。
