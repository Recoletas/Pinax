# Agent 工具调用施工约束与逐包任务卡

2026-09-28。对应[上位计划](./agent-tool-calling-20260927.md)和[MiniMax 需求/执行报告](./agent-tool-calling-requirements-20260928.md)。本文件将设计决策与施工动作分开，执行者逐包领取，不自行扩展产品范围。

## 1. 对需求报告的裁定

| 项 | 裁定与执行要求 |
|---|---|
| AT-00 前置 | 接受。现有迁出、路径归一化和断言改动保留；剩余门禁未通过，不能跳到新增页面逻辑 |
| 报告数字 | 标为执行者报告值。当前静态核对 HEAD 为 `6f96c92`，存在新 composable 和相关 diff；本轮未复跑其测试，也未验证 Windows，不能继承“全绿”结论 |
| 行数统计 | `wc -l` 与脚本 split 计数可能差 1；统一以 structure-budget-check 输出为门禁，不混用数字 |
| 两个错误路径 | 当前上位计划没有出现报告所引的 `src/views/Authoring.vue` 或 `src/composables/authoringKnowledgeQuerySession.js`。记录为施工路径提醒，不登记为已修复的原文错误 |
| agentExecutionEngine | 接受纠正：仅设置任务使用。助手不改道 settingsTaskDispatcher |
| 旧按钮断言 | 接受“不要恢复按钮”；更新断言需覆盖新行为。字符串中存在 watch/reveal 只证明接线，不证明关闭右栏后图标恢复，必须另有浏览器行为证据 |
| W1/W2/W3 划分 | 用于说明意图，不能作为精确 patch 清单。CSS/i18n/页面含混合改动，WritingNotebookEditor 与 workspace owners 也要列入实际清单；不能声称 W1 与本期完全无交集 |
| C1/C2/C13 | AT-00 当前树补修；AT-02 派生时必须带入完整依赖快照。只带 W2/W3 会漏 AT-00、未跟踪文件及页面依赖 |
| C14 worker 提议 | 本轮不启动 worker。以后交给执行者时按本文件单包执行，不能自行开启广泛并行 |
| 真实模型费用/用户验收 | 与确定性开发分开；暂未跑不阻止无依赖的实现包，但必须阻止声称发布 Gate 通过 |

## 2. 正确调用图与迁移落点

```text
当前助手：Authoring.vue
 → useAuthoringKnowledgeAssistant.ask
 → authoringKnowledgeQuerySession.prepare
 → src/services/advisorTaskService.requestAdvisorTask
 → /advisor/task → server/routes/advisor.js
 → advisorAgentRunner.runAdvisorAgent → textModelAgentProvider.runTextModelAgent
 → 普通 provider 文本请求

当前推演：authoringRehearsal.requestRehearsalStep
 → authoringRehearsalToolRun.runAuthoringRehearsalToolStep
 → generationService.runNarrativeAgentTurn → generation agent-step/stream 路由
 → toolCallingProviderAdapter（模型请求）
 → 浏览器 narrativeToolRegistry（执行资料查询）
 → 下一轮模型请求
```

`textModelAgentProvider` 导入 `resolveProviderEndpoint` 是复用 URL 解析，不能画成它调用了工具运行器。未来助手工具分支接 `runNarrativeAgentTurn` 的已有传输，共享循环在浏览器执行本地 reader；旧 advisor 普通问答保留作明确降级。不在 Express 中读取 localStorage/IndexedDB，不凭空新增服务器项目数据库。

## 3. 执行规则与交付格式

1. 每包开始记录 HEAD、`git status --short`、写集、前包回执和已知红灯。先读本包指定函数，再编辑；禁止按旧行号搜索替换。
2. 一包只处理一个职责；达到本包出口条件后提交回执供复核。未复核不扩大共享接口或同时开始下一轮重构。
3. “迁出”保持函数参数、默认值、返回值、Promise 行为、响应式依赖、watch 注册顺序和副作用次数。不得在搬迁包顺便修业务语义。
4. 不放宽 line/import/bundle/cycle/测试预算；不以删注释、压成一行、修改 exclude 或移走检查对象达标。
5. 发现预期函数不存在、接口不同、需改写集以外文件：记录具体调用方/差异和建议，暂停相关子任务；可继续同包不依赖它的检查，不自行编造替代架构。
6. 回执写 `docs/agent-runs/agent-tool-calling-20260928/AT-xx.md`（拟新增目录）。包含：起止代码标识、改动文件、前后行为、命令/退出码/实际数字、未跑项、残留问题、下一包输入。不得只输出“完成/测试通过”。不自动提交、推送、部署。

### 工作树输入清单

AT-00 完成后由集成者制作输入包：锁定 HEAD；逐文件记录相关已跟踪 diff、未跟踪文件内容/hash及依赖理由。混合页面按完整依赖闭包复制时，非本期 hunk 原样保留并声明，不在新树重构。不得使用忽略未跟踪文件的纯 `git diff` 当完整快照。

新树从记录的 HEAD 建立，先 dry-run 检查 patch，复制清单内未跟踪文件，核对 hash 与差异，再跑基线门禁；不从旧 `6f96c92` 盲目重做已完成修复。主工作树继续保留原 WIP，不 reset、不 stash 全部、不清理未跟踪文件。若 HEAD 已改变，重新制作清单，不能照抄本文件 SHA。

## 4. AT-00：拆成四个独立子包

### AT-00a：既有修复复核

- 读/写范围：`scripts/architecture/structure-budget-check.mjs`、`src/__tests__/uiControlContract.test.js`；只修这两个职责。
- 核对 production file 与 page-owner 路径判断均使用归一化路径；归一化仅用于匹配，不破坏文件系统访问路径。Windows/Linux 证据分别标实机或模拟，不能模拟一次就写双平台实跑。
- 断言跟随已移除锚点的真实行为，保留 Teleport/host/watch 接线检查；不恢复 `authoring-rehearsal-anchor`。
- 出口：experimental edges 与 cycles 为 0；相关断言通过；预算常量 diff 为零。行数/bundle 仍红时写 partial，不宣称 AT-00 完成。

### AT-00b：只迁移现场编辑草稿构造

- 先审已新增的 `useAuthoringSceneRecognition.js`、`useAuthoringWorkspaceOwners.js` 与页面接线；不再新建第二份识别 composable。
- 允许迁移 `Authoring.vue` 的 `handleSceneEditRequest` 中锚点解析、草稿构造和 beginSceneCuration 编排，优先归入已有 `useAuthoringSceneWorkflow.js`。
- 页面保留与编辑器滚动/inspector 打开相关的薄函数；依赖通过已有 ref/getter/callback 显式注入，workflow 不反向 import 页面。用 getter 获取最新 revision/选区，不能初始化时取 `.value` 后永久冻结。
- 保留 recognition 包已导出的同名操作，核对模板、重置 watcher、保存失败和取消返回路径。速记标题、推演内容、防重复语义、角色意图业务保持原样。
- 出口：structure-budget-check 的 Authoring 行数 ≤10900、imports ≤125、cycles=0。先比较净减少量再执行，不承诺“再搬 69 行”就一定达标，因为接线也会增加行数。
- 如果该单一职责迁完仍超限，交回剩余行数、拟迁移函数与依赖表，由集成者指定下一片；禁止重写整个页面。

### AT-00c：独立处理打包体积

- 先重新构建，记录实际 `Authoring-*.js` 文件名/字节数。需求报告中的 1,452,287 B 不替代本次产物。
- 普通静态 import 的函数搬迁通常不减少该 chunk，因此不得用行数减少推断体积下降。
- 检查本包新增同步依赖与重复引用，优先删除有调用图证明无用的引入；若需要异步拆分，只允许隔离非首屏现场面板/辅助能力，并保持加载失败反馈及首次操作行为。
- 需要新增动态 import 时先提交具体模块、调用点、加载状态、依赖图与预计影响方案；不能全局改 manualChunks、移走核心依赖或改体积脚本规避预算。
- 出口：重新构建后的体积检查 ≤1,450,000 B，首次打开相关功能无空白/失效/重复执行；记录拆分后新增 chunk 和总加载字节，不能隐藏总体增量。

### AT-00d：回归与输入包冻结

- 用现有浏览器流程核对：选区浮条、段尾图标悬浮文字、打开/关闭推演、换位再开、现场保存/取消/失败、速记改名。覆盖 1440 和 390；截图实际查看。
- 使用既有服务，不启动或重启用户 dev server；服务不可用时浏览器项标未跑，不伪造证据。
- 出口：适用的定向验证及 `npm run verify:full` 均真实记录；浏览器未跑则仅允许接口设计/只读调查继续，不能声明迁移交互验收通过。冻结输入包后才开始 AT-02 功能代码。

## 5. AT-02–14 逐包卡

以下每行是一张执行卡。开始时复制到本包回执，逐条展开步骤；接口冲突按 §3 第 5 条交回，不能自行选择另一套框架。每包只改列明 owner 及必要的已有测试断言；新增 shared 文件须先在 AT-02 设计回执中明确姓名、导出和调用方。

| 包 | 先读与允许写集 | 按序执行 | 出口/禁止事项 |
|---|---|---|---|
| AT-02 | `shared/generationToolContract.js`、`shared/narrativeAgentContract.js`、现有 run/transcript 合同、`agents/context/manifestToolAuthorization.js` | ①列现有字段/owner；②提交公共循环接口表；③明确哪些字段来自可信调用方；④确定工具名/action/结果和错误类型；⑤补兼容校验 | 交付合法与非法请求/结果各一例、状态转换表、字段调用方表；不能新建第二套 run 持久化或把所有 scope 都写进模型参数 |
| AT-03 | `server/services/toolCallingProviderAdapter.js`、`server/services/providers/` 中现用 adapters/能力探测、generation transport | ①追踪 response.parts 到下一轮请求；②按协议保留必需字段；③能力探测值接请求构造；④验证降级/取消/错误 | 请求与响应 fixture 一一对应，无密钥输出；未知能力不可全设 true；真实 provider 未跑单列，不宣称协议全面兼容 |
| AT-04 | `src/services/agents/narrativeAgentOrchestrator.js`、`narrativeToolRegistry.js`、已冻结公共模块 | ①抽离无 Vue/页面依赖的循环；②注入模型请求/查询执行/任务策略；③保持原 BeatPlan/叙事预算策略；④原入口回归 | 输入相同 fixture，工具顺序、终态、预算一致；本包不接助手 UI、不重写整个 1869 行文件；注册器继续负责执行授权 |
| AT-05 | `authoringKnowledgeQuerySession.js`、现有 project knowledge readers、registry/共享工具白名单 | ①可信范围生成可查询授权；②搜索返回来源；③详情按引用读取；④分页/版本/缺证据错误；⑤结果绑定已读集合 | search→read 可完成；未授权 sourceRef、跨书、过期 cursor 执行前拒绝；新增工具声明同步服务端 validator，不能只加 UI 名称 |
| AT-06 | `useAuthoringKnowledgeAssistant.js`、`AuthoringKnowledgeAssistant.vue`、已有结果校验 | ①保留 prepare；②工具分支走公共循环；③累计证据供最终校验；④追問带有界上下文；⑤取消/重试/阶段接线 | 当前 UI 真实消费新循环且能补查；回引用位置正确；普通 advisor 降级标明；不改 settings dispatcher，不另建聊天页 |
| AT-07 | rehearsal run/path/session 与既有投影 owner、后果合同 | ①字段逐项绑定真实数据源；②区分正文/分支/候选；③确定程序必读的当前状态；④角色未知显式化 | 提供手写正文、本分支、其他分支三组数据样例；不能用模型自由摘要替代事实状态或把未来正文泄给角色 |
| AT-08 | `authoringRehearsal.js`、`authoringRehearsalToolRun.js`、后果合同/提示词 | ①保留 W2 作为基线；②接公共循环；③加入必读状态和受权补查；④校验事件重演与文本重复；⑤有界修复 | 三步连续推演、换分支和已发生动作反例正确；32 字命中只作文本重复信号，不能宣称语义检测完成；无无限自动重试 |
| AT-09 | 已有 `authoringSceneRecognition.js`、`useAuthoringSceneRecognition.js` | ①扩候选 schema；②依赖版本/范围缓存；③single-flight；④否定/回忆/同名；⑤离场/地点候选 | 手写/撤销/别名变化使相关缓存失效；不确定候选不自动写场景；不重复 AT-00 搬迁，不每键调用模型 |
| AT-10 | 既有 SceneCuration/InspectorDetail、识别 composable、薄页面接线 | ①候选勾选；②应用/沿用/取消；③保存成功才续行；④确认期间变更重识别；⑤无变化直接继续 | 旧候选不可确认；取消不再生成；保留图标/段距/键盘/手机行为；不另造现场编辑器 |
| AT-11 | 现有正文采用/撤销 coordinator，识别失效接口 | ①定位所有本期采用路径；②保存成功发实际范围通知；③部分采用；④双击幂等；⑤保存失败重试 | 未采用文本不触发事实升级；撤销失效正确；重试保存不调用 provider；不在模型工具中直接写正文 |
| AT-12 | 既有 run/session repository 与取消链 | ①最小持久字段；②刷新 interrupted；③候选恢复；④服务端传播断开/停止；⑤范围切换隔离 | 刷新不自动计费重跑；旧响应零覆盖；凭据/opaque 不进回执；不添加第二套存储/清理管理 |
| AT-13 | 既有 tests/fixtures、scripts eval/smoke | 每包补对应负例；组合后再跑跨入口；真实质量按上位计划分层 | 新断言合入现有文件且总量≤20/200；不得排除文件绕预算；提供场景结果，不仅统计绿灯 |
| AT-14 | 现有策略开关 owner、PLAN/STATUS/手册/回执 | ①分别标实现/确定性/真实/作者验收；②入口开关与回退；③形成生产适配清单 | 未过真实质量/作者验收不能默认发布；只形成适配方案，本轮不合并生产分支或部署 |

### AT-02 公共循环接口设计必须回答的六件事

1. trusted context、messages、tool catalog、budget、AbortSignal 分别由谁创建，生命周期到哪里结束？
2. `requestModel` 和 `executeTool` 接受什么对象，返回什么规范结果？不可依靠闭包读取当前作品全局状态。
3. `validateFinal` 如何返回 completed / partial / invalid，格式修复如何计入同一预算？
4. provider tool-result、领域查询结果和作者回执的转换在哪一层，如何保持 callId 对应？
5. 哪些 error 允许模型纠正/网络重试，哪些 stale/cancelled/denied 必须停止？
6. 旧正文 orchestrator、助手、推演各给一个适配示例，证明无需改造 settings dispatcher。

AT-02 先交这六项设计与样例供集成者复核，再扩合同；这样把关键接口决策留给复核环节，避免执行者从一句“统一底座”自由发挥。

## 6. 验证命令与报告边界

执行者在正确 Node 环境下按包使用以下现有命令，具体适用脚本先确认其环境要求。Windows 使用该平台可用 shell，不照抄 `source nvm`。

```bash
node --version
node scripts/architecture/structure-budget-check.mjs --enforce
npm run build
node scripts/architecture/authoring-build-size-check.mjs
npm run lint:delta
git diff --check
npm run verify:full
```

本文件列命令不表示本轮规划修订已执行它们。门禁失败记录命令、退出码和具体指标；工程完成声明按 testing-verification 技能执行完整门禁，不能用 focused 测试代替。浏览器、真实模型和人工验收分别记录；外部条件缺失只影响依赖该条件的 Gate，不把未跑写成失败或通过。

对计划维护技能的候选改进：以后下发大型实施计划前，先要求“入口调用图、当前 WIP、结构预算及前置红灯、首包可执行出口”四项基线；仅做概念研究时可省略。本轮先在任务书落实，不修改技能文件。
