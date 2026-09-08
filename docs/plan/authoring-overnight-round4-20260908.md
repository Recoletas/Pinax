# 第四轮夜间任务书：补旧账，做可玩的单条件人物 IF

日期：2026-09-08。状态：**计划待执行，未启动 worker/运行器、未开始计时；不代表 8h 运行已安排。**

从属 G1.2/G3/G4.6 与既有 Authoring 体验路线。输入：[原始人物/空间研究](./authoring-character-fate-research-20260908.md)、[本轮源码及一手资料复核](./authoring-character-fate-followup-20260908.md)、[第三轮任务书](./authoring-overnight-round3-20260907.md)。

默认建议人物信念 IF 优先，作者参与模糊结果确认、只采用正文；空间/回溯不并开正式主线。用户若选空间优先，启动前替换 U45–47 的目标并重新冻结合同，不能执行到一半自行改产品方向。

## 1. 这次不是再把同一张短单写长

用户明确要求增加工作量。本轮列出 **U 10 包、K 8 包、owner 4 包、后续加深 6 包**，每包都有独立产物/反例；不是按文件拆数量。主目标和后续队列分开，但后续就绪任务也在授权执行范围内，不必等早晨逐包批准。

优先交付三个作者能感知的结果：

1. 普通试演终于支持“按这个方向，但……”→重试保旧稿→采用/撤销/重做→另一稿留作构思。
2. 从当前场选一个人物，固定情境，只改一句信念，比较 A/B 行动；选中一支后写成可编辑草稿，另一支不污染正文。
3. 资料助手的安全接线闭环与薄对象引用支持上述体验，不在后台绕过终态/扩大范围，也不创建另一套事实库。

第二层交付：速记提炼候选预览、正式 reader 分阶段测量、混合故障/长流程、无障碍；再有时间做隔离空间规则实验。主目标没有完成，不得把第二层产物包装成替代品。

8h 是执行上限，不是任务量估算或最低耗时承诺。正常停止只有：全部可执行队列经独立验收耗尽；达到截止；或真正缺少外部条件且独立包也全部耗尽。约两小时就停止时，必须逐项说明剩余队列为何不可领取，不能只写“准备交接”。

## 2. 最新基线与旧账：先复验，不重复修

启动前重新读取 STATUS、git HEAD、dirty diff 与交接；下面是编制时事实，不是未来锁定版本。

| 位置/任务 | 编制时事实 | 本轮承接 |
|---|---|---|
| main 工作区 | /home/recoletas/jiuguan/pinax-integration-20260906；05af532 + U 三个未提交代码/脚本文件及文档 | O40 保存含 untracked 的真实快照，不在 main 做夜间实现 |
| K 分支 | night/round3-k-20260907-k01，5baa1b8，代码 8a0442d，未合 main | K41 从最新冻结 K 增量复验 |
| U 销毁后 commands 异常 | 已新增守卫，本次 main verify:full exit 0；全局快捷键已命名/解绑/走统一入口 | U41 不重复修已修点，补生命周期/其他输入面/副栏反例 |
| K 拒绝后 UI 回退 | 本次正式 composable 失效焦点探针已一次 prepare、零 mock provider、exit 0 | K41/K42 验证新树完整路径，不沿用旧失败结论 |
| U31/J9 | 最新 U 摘要仍 4000ms 超时，尚未关闭 | U42 |
| U32 搜索 | 非 dual 分支修正，不等于双栏全矩阵通过 | U43 |
| U33 采用历史 | 有修复候选，需新树完整事务与销毁/焦点验证 | U41/U48 |
| U34 追加要求 | 未实现，已有最小状态机不等于功能 | U44 |
| U35 三类样板 | 未完整交付 | U49，不被新生日样板全部替代 |
| U36 留作构思 | 未实现 | U48 |
| K31–33 预算/关闭/终态 | 已有有效修复及 Gate，不重造 | K41/K43 |
| K34 启用来源 stale | 最新补丁新增旅程，需独立重跑 | K42 |
| K35/K-D1 | 组合攻击/跨层边界仍需扩大 | K43/D42 |
| K36 | 已有正式 localStorage reader 总耗时，未齐分阶段归因 | K48 |

第三轮暂停于“普通单次会话”，不是已跑完整晚。U 把第三轮摘要写在第二轮目录，本轮禁止继续混用；main 的旧 STATUS/日志也不能替代真实 diff。

## 3. O40：启动门槛——过不了，不发夜间 start

owner 在睡前完成，不把没人负责的事情留给“明早统一验收”：

1. 保存 U 全树增量/未跟踪文件清单、K HEAD、共同祖先、计划 hash；记录恢复路径。禁止 reset/clean、整支合回旧 integration、覆盖其他会话改动。
2. 创建 U/K 两个独立 worktree、各自端口和可写缓存，生成同一 run-id 的共享板；禁止在 main 实现。node_modules 可读依赖可以复用，可写 Vite/Vitest 缓存必须隔离。
3. 明确谁保持 owner 运行、谁实现、谁做独立审核；worker 不能兼任自己成果的 accepted reviewer。没有第二个 reviewer 时保留 ready，不冒充 accepted。
4. 用既有可恢复方式实跑：任务一结束→自动领取任务二；模拟非零/无产物/超时退出→保留断点、不得误标成功；owner 审核不通过→回到 needs-fix→继续可执行包。命令、进程、退出码和下一领取记录必须可查。
5. 若现有环境没有续接机制，允许一个仅服务本轮的薄脚本，不做通用 agent 平台。最多 45min 排障；仍不可用就报告“夜间启动失败”，**不能降级成普通单次然后宣称夜间已启动**。用户另行批准单次工作才切换运行模式。
6. 网络先拦再导航：临时浏览器 context + 合成项目，HTTP/WebSocket 外发默认拒绝；生成只用明确 mock handler。所有未匹配模型请求使 Gate 失败。已有 5173/5175 不启停。

共享板固定字段：id、owner、base、dependencies、allowedFiles、status、codeTree、requiredChecks、evidence、start/end、下一包、blockedReason。状态 queued→running→ready-for-review→accepted；worker 不写 accepted。同一计划 hash；实际开始/6h/8h 截止在 O40 通过时填写，不预填。

## 4. O41：先冻合同和文件责任，再让两线同时动

本轮新增只限会话级 IF 合同与薄只读 adapter，不新增 provider task ID、manifest 权限、shared 全局 schema、世界书持久字段或历史账本。具体新文件命名在 O41 登记，下面职责和字段不可随意缩掉。

### 4.1 IF 合同 v0（内存态，不是数据库）

- Experiment：experimentId、generation、projectId、targetRef、baselineFingerprint、sourceRevisions、actorRef、factRefs、A/B belief、modelConfig、branchStates。
- baselineFacts 由同一次冻结输入产生；作者确认参与试验的短事实包。A/B 只有 belief 值不同，标签/requestId 可不同但不能影响故事语义。
- Branch：branchId、requestId、inputFingerprint、proposalSet、selectedProposal、authorAssumptions、draft、failure/stale；每支只保留当前稿+上一稿。
- Proposal：复用既有 direction 的 action/evidenceRefs/entityRefs/gain/cost；gain/cost 一律预测。作者补充/确认结果存在会话 sidecar，不写回正式关系/事件。
- Lifecycle：editing→frozen→planning→awaiting-choice→drafting→ready；cancelled/failed/stale 保留已得结果，不恢复旧采用许可。编辑共同事实使两支都 stale；只改 B 条件生成新的 B 代次，A 仍可读，但跨代对比明确标记。
- 精确相同输入/条件可以产生相同行动；同组方向的去重只在各组内做，不跨 A/B 比较。

### 4.2 实际上下文与写入边界

belief 不存在于当前正式角色结构，首版 A/B 都是作者声明的试验假设。不能从自由性格文本抽一句就宣称完成全人格覆盖。

原型 planner 与正文都使用同一有限试验事实包，不额外注入角色旧全文/旧稿/另一支输出。作者看到的完整角色资料与模型本次允许输入分开。若现有 runtime 不能安全替换该场景块，owner 可修改局部 scene run/context assembler 接缝并补既有合同测试；不得通过简单尾部 prompt “忽略以上”遮盖冲突。

只用现有方向规划与正文生成任务：默认 A/B 各一次方向请求，作者选择的支再一次正文请求；另一支正文需显式点击。完整双稿最多 4 次成功业务请求（不含用户明确重试），禁止隐藏评审循环或自动反复生成直到出现差异。实际传输的 bounded retry 另计 attempt/失败，不伪装只发一次。

正文采用走原事务；试验选择不创建世界事实、不改正式信念、不写 runtime event。超出有限事实包的秘密/他人记忆不纳入首版；界面不宣称“严格逐角色认知已实现”。

### 4.3 写集

| Owner | 写集 |
|---|---|
| U | Authoring.vue、Notebook、SceneLaboratory、BlockDraft/Composer、IdeaShelf 与既有 scene run/intent/runtime 的 UI 接线；新增 IF composable/比较组件；U journey/mock；既有 uiControlContract/authoringTurnRuntime 测试 |
| K | knowledgeReadModel、knowledge query session、useAuthoringKnowledgeAssistant/其组件、K scripts；新增纯 IF baseline/branch contract helper 与只读 object adapter、提炼候选 parser；既有 authoringAgentWorkflows 测试 |
| owner | 共享板/文档、仅本轮续接与拒收检查脚本；接口/局部 context assembler 交接窗口；隔离集成候选 |

K 的纯 IF helper 不依赖 K 浏览器开关或新 query session，便于独立交接给 U。O41 先冻导出签名和正反 fixture；U 可用合同 double 开发，但真 helper 未接入前不得 accepted。owner 按文件/提交交接，不能把整个未验收 K 分支偷偷合进 U。

双方需同一文件时申请写锁，暂停该文件而非整线；共享测试文件由指定 owner 串行收口。禁止以“没有写集”为理由搁置已明确的页面接线。

## 5. U 队列：10 个具体交付包

### U41 · 生命周期与撤销安全复验

依赖 O40；入口 Notebook focus 回调、Authoring history handler、统一 undo/redo。先重跑最新树旧五异常；再做卸载/切书/路由重入、焦点在输入框/搜索/助手、副栏和 composition、已 defaultPrevented 的快捷键。必要修复必须取消或隔离旧回调，不继续新增全局匿名处理器。

产物：零 uncaught 的全量日志、命名 handler 生命周期测试、正文/scene/unit/source/batch undo 前后快照。离开编辑器后不能偷走输入焦点或撤销另一栏。已通过的不重复改。

### U42 · J9 全选与组合态专项

依赖 O40，U41 可并行诊断。保留原失败，跟踪 DOM/PM selection、AllSelection 标记、composition owner、transaction、request token、mock 时序；真实 Ctrl/Cmd+A 路径与合成 composition 分开。

门槛：J9 synthetic 10/10、J1 20/20，保留全失败分母；正反选区/多 unit/空章/撤销后全选、迟到 Ghost 不改变目标结构；禁止以私有 selectAll 或加 timeout 掩盖真实键盘失败。90min 无新进展登记反例转 U44/45 纯状态工作，不把整个夜晚停在这里；采用 gate 仍不能越过。

### U43 · 搜索与多编辑面身份

依赖 U41。主/副栏×同/异章×关闭/返回原处×restore:false；焦点落在结果所属栏，不使用第一个 PM 代替目标身份。删除命中、切书、返回前源变更、长文滚动、搜索框里撤销不得改正文。

门槛 J11 10/10 + 双栏矩阵；返回结果可添加批注，非目标章 hash 不变，浮条不会抢章名位置。对没有缺陷的布局只交证据。

### U44 · 普通试演追加要求，必须接到真实调用

依赖 O41；不用等 IF 新 UI。选方向下加“按这个方向，但……”默认空输入；“按新要求再试”创建新 requestId，冻结方向/追加要求/目标和 refs。实际 runAuthoringTurn instruction 不得仍为空。

状态依第三轮 U34：旧稿保留、重复点击单请求、失败保留要求、取消不清旧稿、来源变化拒绝采用。产物含状态机断言和正常 UI→捕获 transport 的证据；只有 textarea 或纯 helper 不能通过。

### U45 · 人物 IF 入口与单变量编辑

依赖 O41/K44 合同；K helper 未到可先 fixture。只从既有当前场/人物“试演”入口展开“只改一个条件”，不新增顶级页面或第二个助手。

显示人物、同一情境、原条件 A、试验条件 B；A 默认作者填写/确认，不自动装作来自正式角色卡。事实包可检查，唯一改动置顶；关闭前提示仅会话内保存，可留作构思。正式角色卡/hash 不变。

门槛：能不看说明完成输入；缺人物/事实/目标给就地说明；长名字换行可读，状态/⇄/×不抢标题，360/390 下不强塞两栏，Tab/Esc/IME 行为明确。

### U46 · A/B 行动提议与作者暂停点

依赖 U45/K44。A/B 独立请求、共用 frozen baseline；先显示行动/依据/预测代价，再展正文。默认一个活动支，桌面可紧凑对照，手机 A/B 切换保留滚动；不自动打开四张长文卡。

作者选择行动并确认“按此假设继续”，可调整尚未确定结果；没有关系增减数值游戏，没有模型内部思维链。只确认当前支，不连带确认另一支。允许 A/B 相同行动并说明依据不同/尚无差异，不强制制造争吵。

门槛：成功/同动作/证据不足/未知引用/部分失败五条 UI 路径；没有选择不启动正文，选中后请求只含本支。作者补充假设必须标假设，不能冒充 source evidence。

### U47 · IF 写成草稿与跨支隔离

依赖 U46/K45、U41/42 安全 gate 后方可验收采用。复用原 Ghost/BlockDraft，不新建正文写库；当前/上一稿按 experiment+branch+generation 保存，切支不共用编辑 buffer。

产物：A 慢 B 快、取消 A、B 改条件、源资料更新、换书、双击采用等交叉旅程；零串稿/旧许可复活。正文与已确认行动不符时，作者可标记并重试，不宣称已有自动语义裁决器。采用一支后重新检查另一支目标，不能继续按旧锚点盲写。

### U48 · 留作构思与采用后的可恢复性

依赖 U44 或 U47 已有稿即可开始，后续补另一链。复用 createExplorationDocument/IdeaShelf，将正文、条件、来源版本说明存为可读内容及已支持 sourceRefs；不塞仓储会丢弃的未知字段。

明确写“留作构思”，不是“保存完整世界分支”。重复点击/保存失败不重建、不丢稿；改名/打开/编辑/删除能正常完成，原章不变；来源删除仍能读已存文本，但不能恢复旧采用 token。采用→撤销→重做验证 unit/scene/批注一致。

### U49 · 六种情境的完整作者旅程

依赖 U44/U47/U48，fixtures 可提前写。保留旧三类：档案被动过的保密/关系、暴雨停电约束、无世界书普通稿；新增生日守诺、合作救援、同一行动两种理由。

每类至少原条件/追加要求或 B 条件、取消/失败保留、采用或放弃；生日必须 A/A 控制组与单变量输入 diff。mock 根据输入分支改变或保持行动，不写死“修改成功”；记录用户动作、模型 attempt、hash、source refs、截图。夜间只报交互/合同通过，真实趣味性待作者。

### U50 · 速记提炼候选预览（第二层，不抢主闭环）

依赖 U48/K47，主目标已有 ready 候选后领取。复用探索稿入口，选一段速记→预览人物/地点/物品候选及原文依据→作者改标题/丢弃/选择已有对象→把整理结果留作构思。

首夜不直接批量写 worldStore：暂不承诺正式建卡。必须显示“候选，尚未创建正式设定”，同名只建议、不自动合并。若既有正式审阅入口能无协议变更承接，由 owner 单独签收后接；否则保留预览边界，不制造隐式写库。

门槛：“阿禾/戒指/小屋”拆为多个候选，标题不吞全文；再次操作不自动重复保存，原速记改动会让旧候选 stale，链接/引用不能绕授权。

## 6. K 队列：8 个交付包，不再重复造知识底座

### K41 · 最新修复的独立反例与关闭兼容

依赖 O40。从 5baa1b8 或更新冻结树开始；复跑失效焦点正式 composable 反例，预期一次 prepare、零 provider、作者看见停止原因且原问题保留。复跑 required-tiny、zero-invalid、off 跨旧 main、已有 52/13/6/17 门禁；如果新增 Gate 数变化保留旧断言含义。

不得把已修问题再写一个修复提交；产物是新树证据和真正新增回归。默认关闭应无额外读取/trace 敏感信息，不只检查没有 UI 标志。

### K42 · 真实助手取消/过期/焦点范围

依赖 K41。启用点击→点来源→追问→修改/删除来源→旧回答 stale/下次 typed 拒绝；分别测试阅读中取消、换书、换绑定、切换助手实例、关闭重开和点一个不可映射正文来源。

核查取消 signal 是否实际传入 prepare 的 knowledgeReadModel，并在 reader 返回后阻止发布；不能只看 provider 收到 abort。核查模块级 focusedEvidenceSourceRef 是否串实例、旧焦点是否无提示持续限制无关新问题。需要收口到本实例时直接修，不新增全局 window 状态作业务真源。

门槛：实际 UI click gate，trace 仅测试或低敏，最终 envelope ref 范围、prepare/provider 次数、取消后零发布；来源改 stale 不用 page.evaluate 直接调 session 替代。旧路径/自由问行为单列，不静默取消作者选定范围。

### K43 · 全链终态×预算×必需来源故障矩阵

依赖 K41；部分可与 K42 独立。从正式 composable 到 prepare 到 bridge 再回调用方检查，不再只测最底层函数。

矩阵轴：requested/required 空/相等/子集/不相交；items 1/2、chars 1/恰好/少1；预取消/读取中取消/发布前取消；无绑定/桥异常/来源删改/重复 ID。全笛卡尔过大时确定性 pairwise + 必测高风险三元组合，登记 seed 与覆盖表。

门槛：成功不得超最终输出合同预算，必需项不满足 typed 停止；故障降级不能绕预算/required 或扩大点名范围；信号异常不当成允许查询全库。每个新失败归约最小例，保留失败分母。

### K44 · IF 冻结输入与单变量 pure helper

依赖 O41，K41 不阻断纯逻辑开发。实现 §4.1 的 baseline/branch 派生与校验，只吃已授权 caller 输入，不自行搜全库；配置、facts、target/revisions 固定一次。

门槛：A/B canonical semantic diff 仅一个 belief；同条件 A/A 完全同语义；篡改其他事实/actor/target/来源 revision 拒绝；无凭据引用拒绝。新旧信念不能在同一输入同时作为现行条件。控制字段/另一支提议不进入作者正文。

交付导出签名、正反 fixture、纯 helper 与脚本；与 U 合同 double 对比必须一致，不能只发 ADR。

### K45 · IF 并发/失效与正式写入隔离

依赖 K44。请求 token 按 experiment/branch/generation，取消隔离；切项目整体失效；baseline 来源变化双支失效；编辑单支生成新代次不伪装同一实验结果。

门槛：两个项目相同角色定义/同名人物、A/B 反序返回、旧失败晚到、旧稿重新选中、采用后另支目标改变；formal book/worldbook/event/memory hash 零变更（除作者明确正文采用）。mock memory spy 验证没有隐式角色记忆写入。

仅实现会话状态机，不做永久循环/关系账本。由 U47 实际消费后才算完成集成。

### K46 · 统一创作对象的薄只读适配

依赖 O41，可独立于 IF。在现有 owner 上适配 exploration、chapter、worldbook-entry 三类（角色/地点为 entry 能力，不造新实体）。返回逻辑 owner/nativeId/project/container/revision/capabilities、原生 sourceRef/locator；按需读正文。

latest 与 pinned 两种读法显式区分：没有旧快照就 typed unavailable，不假造历史；标题/目录变更不改身份，删除不解释为故事死亡。同名/跨书/共享世界书定义与项目状态分离。

门槛：真实 readers + 合成仓库、零额外正式存储、来源变化/删除/未授权类型；facade 排序不当作授权。至少一个 U 消费入口（候选链接/IF 来源）接入后才可称用户能力，否则只报模块交付。

### K47 · 速记多对象提炼候选合同

依赖 K46；与 U50 冻结接口。模型输出仅候选名称/类型/原文片段 locator/建议已有 ref；原文 hash、revision、requestId 绑定。复用现有允许的建议任务，若实际任务无法承载格式，先交纯 parser+fixture，不擅增注册任务。

门槛：空名/全文当名/无依据/同名/恶意 ref/源改动/重复返回；候选来源片段必须在原文，链接已有对象仍走授权 adapter。重复提炼可复用同一 source+revision+selection+条件的会话结果，改源不得误复用。不宣称自然语言实体消歧已正确。

### K48 · 成本拆解与历史/空间接口差距

依赖 K41，IF/adapter 完成后补增量。在合成项目正式 readers 上分阶段量 read/clone/freeze/catalog/query/bridge/pack，冷/热、p50/p95、bytes、取消残留；1k/5k 两档，不使用用户项目。

复跑原 1k p95≤100ms 建议线并记录机器/负载；失败先定位不擅建 Worker/缓存库。K-D1 已由 K43 接续；H0 ADR 仅更新本轮产生的 evidence/branch/定义与状态差距，不重写同一研究。未来 history/realm 只列接口需求，不接 I1 或迁移。

## 7. O42：候选接续与拒收机制

默认顺序：U41/42/43→U44→U45/46→U47/48→U49→U50；K41/42/43 与 K44/45 可按依赖交错，再 K46/47/48。关键路径为 O41→K44/U45→U46→K45/U47→U48/U49；安全缺口阻断采用，不阻断独立 prototype 状态/只读工作。

owner 每个 ready 候选运行固定反例，核对 diff、真实调用和证据，再接受或退回具名问题。worker 等审核时领取独立就绪包，不停止整个会话。每 30min 更新 active 包；同问题 30min 无新证据换方法，90min 无进展转独立包。新 UI 先拍基线和第一片截图，不将所有修改攒到最后。

T+90min 容量核对不是“重新估一下小时”：列出已接受/待审/未领包，若主线提前交完就实际领取第二层和 §8。T+6h 停止接新功能，仅修复/补已有验收证据；T+8h 冻结输出。写更多 summary 或反复跑同一绿灯，不算新包。

任一缺口需要新权限/付费渠道/数据迁移/未选产品方向时，局部 blocked；不能越界，但其他 ready 包继续。队列真的全部完成才允许提前交付，并报告实测时长。

## 8. 加深队列：再有时间就做这些

| ID | 前置 | 实际产物及接受标准 |
|---|---|---|
| D41 连续作者使用 | U49 | 六情境穿插双栏、搜索、改要求、切支、保存失败、撤销重做；至少一条 20 步混合旅程，非目标数据/hash、请求分母全程记录 |
| D42 拒绝回退变形攻击 | K43 | 不少于 30 个确定 seed，做预算单调、添加无关秘密不影响输出、分支交换不串数据、上下游 typed 状态一致；独立 oracle 不调用受测实现求预期 |
| D43 可访问性/小高度 | U47/U50 | 1440/1024/390/360/720×450/560×450；深浅、200% 缩放、键盘与 reduced-motion。仅受改面，标题/rail/模态回焦点/错误提示全部截图与动作取证 |
| D44 开关与旧项目兼容 | K46/U48 | 缺失字段、只正文无世界书、旧 exploration refs、同名/重命名/删除；flag off 不额外读取，保存原旧格式不丢字段；不做批量迁移 |
| D45 小屋空间纯实验 | K44/45 主包及 U 主目标已有候选 | 合成状态中一地点、一入口、一人物一物品、固定出口共同时间；开/关/未知、进入/放下/取回、重复动作/半失败/取消的纯 reducer 和动作记录；不改地图/store/正式历史，不声称作者可玩的空间 UI 已实现 |
| D46 晨间质量评测包 | U49 | 普通提示词与结构化 IF 同事实同模型配置的输入导出、A/A/A-B 标签盲化、人工评分表与调用预算说明；不执行付费生成。评估实际选择、事实忠实、作者控制成本、愿不愿再试，不以冲突更多为高分 |

D45 不是偷偷立项异世界引擎：不支持倍率、嵌套世界、死亡回归、人物记忆继承、任意自然语言规则。用户另选空间优先才把它提升为产品主目标。

## 9. O43：冻结、验收、晨间交付

每线独立目录 docs/agent-runs/<本轮run-id>/<u|k>/，禁止复用 round2 目录。summary 首屏列“能操作什么/未做什么/失败/第一条验收动作”；所有任务绑定最终 code tree（含真实 dirty 快照 hash），不能只引用旧 HEAD。

门禁分四层，不互相顶替：

1. 静态/合同：既有核心不超过 20 文件/200 用例；新增组合在 scripts，不能改 Vitest include 绕预算。
2. 正式链：当前最终树 verify:full exit 0；异常计数必须 0。K 原 eval/bridge/hardening/seam + U J1/J9/J11 重复门槛。
3. 浏览器：源自各自 worktree 的页面，开关状态、请求数、成功和失败都存档；U 普通/IF→采用/留构思，K 启用→修改来源→stale/拒绝。不能用直接函数调用替代点击链。
4. 产品：真实模型效果、真实中文输入法/移动软键盘、用户视觉与趣味性保留晨间待验；mock 全绿不能把这一层也标通过。

owner 可在隔离候选树串行组合通过审查的 U/K 增量并复跑混合旅程，不推进 main，不 push，不启用生产开关。两线冻结后不再一边生成证据一边改代码；任何修改使受影响旧证据失效，重新绑定。

晨间 30–45min 验收顺序：先失败/续接记录→普通写作/搜索/重做→追加要求保旧稿→生日 A/B→采用/留作构思→助手修改来源与终态→看第二层候选与空间纯实验边界。用户决定是否合并、视觉定稿和真实渠道评测，不自动上线。

## 10. 明确禁止与本轮文档边界

不新增数据库/任意脚本解释器/新模型任务层级，不改正式角色字段和关系历史，不开角色秘密检索/I1，不靠世界书换绑定表达穿越，不用文件移动解释空间动作；不整体重写 Character/Outline 或手机目录堆叠，不挤压章节名。

执行时依次使用适用的 ui-style-check、worldbook-workflow、testing-verification、docs-status-handoff；提交使用 commit-conventions。视觉按现有 visual-alignment-workflow，内容与作者动作优先，debug 状态不占主视觉。

本轮仅编制研究与任务书、同步入口和状态；没有自动建立上述执行机制。文档门禁通过只代表文档/当前基线通过，不代表第四轮任何实现包已交付。
