# 助手写作 Skills S01–S05 实施回执（含验收返工）

日期：2026-09-19。计划：[assistant-writing-skills-20260919](../plan/assistant-writing-skills-20260919.md)。
分支 `night/writing-skills-20260919`（worktree `pinax-writing-skills-20260919`，基 main@5e85379）。
本批交付 §7 队列的 S01–S05 五个实施包；S06 起未开工，见文末剩余队列。

## 交付内容

### S01 旅程与故障基线冻结（`scripts/authoring-ui/`）

- 新增 `writing-skills-baseline-check.mjs`（29/29 通过）：冻结既有校对采纳/撤销、
  按批注改写两条写入旅程及故障路径——校对批次全失败保留只读态并可重试、
  采纳后正文再改则撤销入口消失且建议转只读、改写失败可重试、进行中可停止、
  正文变化后候选自动过期且采用禁用。请求载荷/finding/正文前后文本写入
  `tmp/authoring-writing-baseline/baseline.json` 作为可复现 I/O 基线。
- 既有入口本轮实跑核实（不引用旧数字）：
  - `f2-knowledge-assistant-check.mjs` 46/46（含知识接缝浏览器运行时 6 项）；
  - `f2-review-search-history-check.mjs` 33/33。
- 对齐 20260917 UI 线（c445dd4）两处有意变更，journey 脚本此前无人发现已过时：
  1. 工具栏“历史”改开设置记忆页 → F2-6 的 history 段改走“批注工具 → 版本页签”；
  2. 助手快捷任务由按钮组改为“问答范围”下拉 → F2-4 相应断言改下拉选项、
     selectOption 切换与 390 命中区测量。
- 顺带修复 UI 线引入的可访问性回归：助手“问答范围”下拉未纳入 44px 移动端
  命中区规则（`AuthoringKnowledgeAssistant.vue`），390 实测从 31px 恢复 44px。

### S02 Oh Story 首个纯检测函数适配（`writingSkillChecks/`）

- 固定上游 `0ffe7db4fa02489f5d1989e58a22ce62d040a850`：
  - `scripts/writing-skills/upstream/check-degeneration.cjs` 逐字参照（仅加来源
    头、去 shebang），只作对照 fixture，应用代码禁止引用；
  - `public/third-party/oh-story-claudecode-LICENSE.txt` MIT 全文 + Pinax 改造说明。
- `src/services/agents/authoring/writingSkillChecks/checkDegeneration.js`：
  去 fs/path/process/CLI，字符串入/findings 出；findings 带 UTF-16 offset
  locator（start/end/exact 逐字切片）；检测语义（逐行/长句复读、截断、占位
  与元信息泄漏、引号遮蔽/剥离、tier1/tier2）与上游逐条一致。
- 对照 eval `scripts/writing-skills-degeneration-eval.mjs` 7/7：上游 CLI `--json`
  与适配模块同输入行/列/类型/严重度逐条相等；正例 4（含 CRLF offset）、
  反例 3（台词豁免、标题行豁免、front-matter/围栏跳过）双侧零命中。
- 来源清单 `scripts/writing-skills/SOURCES.md` 登记复制/改造/未复制边界。

### S03 shared 方法合同与前后端版本协商

- `shared/writingSkillMethodContract.js`：
  - 首批三个 goal-review 方法注册表（动机/行动因果、铺垫/兑现、节奏/冗余），
    精确 skillId+skillVersion 解析，不用“最新版”兜底；
  - 方法描述校验：禁带文件路径、shell、任意 JS、网络地址；
  - 冻结输入白名单（§5.2 字段集）：未知顶层/嵌套字段、taskKind 不符、缺
    scope.projectId、越权只读能力、非法锁定区间一律 typed 拒绝；
  - 预算顶格（§8.2）：3 目标/6000 字/8 批/批 2 补查/1 格式修复/2 候选/1 修复/
    单任务并发，只降不升；
  - `writingSkillAck` 协商回执（schema+skill 版本+输出 schema）。
- `server/routes/advisor.js`：请求携带 `options.writingSkill` 时校验，未知的
  版本/字段/能力返回 400 `WRITING_SKILL_REJECTED`（附 reason/failures）；
  通过后在响应 `meta.writingSkill` 回带回执。不含该字段的旧请求完全不进此分支。
- eval `scripts/writing-skills-method-contract-eval.mjs` 26/26：合同层 22 项 +
  真实 server 起进程验证未知版本/未知字段 typed 400、旧问答请求不受影响。

### S04 review session 目标/scope/风格/coverage（`authoringReviewSession.js`）

- `createAuthoringReviewSession` 增加可选输入：`goal`（作者目标+技能精确
  解析，未知 skillId/skillVersion 拒绝建 session）、`scopeNodeIds`（显式选区
  scope，只收窄读窗口，完整 index 仍供新鲜度对账）、`styleInputs`（风格消解：
  显式约束 > 本书规则 > 方法默认，同维度先到先得并记录被覆盖来源）。
- session 新增 `goal/scope/styleDirectives/coverage`；coverage 计划以窗口为
  「完整正文逐批读」的可核查单位；`markAuthoringReviewBatchStatus`（未知窗口/
  非法状态 fail closed）、`resetAuthoringReviewCoverage`、
  `buildAuthoringReviewCoverageReport`（evidence 明示 top-k 检索来源，点名未
  授权来源列入 missing）、`summarizeAuthoringReviewCoverage`（空结果区分
  clean-complete 与 partial-insufficient-coverage，§6.A）。
- 批次上下文携带 goal/styleDirectives/coverageWindow 供后续 prompt 组装。
- eval `scripts/writing-skills-goal-review-session-eval.mjs` 24/24。

### S05 方法组合与检查器整合（`writingSkillMethods/` + `writingSkillChecks/`）

- `writingSkillMethods/writingSkillMethods.js`：三个方法文本（动机/行动因果、
  铺垫/兑现、节奏/冗余，含输出要求与禁则）注册对齐 shared 表并通过描述
  校验；`composeWritingSkillReviewPrompt` 只组合当前方法 + 目标 + 公共
  「引用/文风/信息边界」片段 + 已消解风格指令，其他方法文本不进入。
- `writingSkillChecks/runWritingSkillChecks.js`：批次级检查入口——本地校对
  原样复用 `collectLocalAuthoringProofingFindings`（不重复造轮子），退化检测
  按 S02 适配模块逐块扫描、保留 locator 并标注 checker 来源。
- 对照样本 eval `scripts/writing-skills-method-composition-eval.mjs` 13/13
  （正例命中复读/截断/占位与引号规则，干净样本零命中）。

## 验收返工（2026-09-19 二轮，评审反例驱动的修复）

首轮 S01–S05 在 93daf8c 验收为「S03/S04/S05 不通过、S02 有条件通过」，
4 个阻断问题已修复并新增对应反例测试：

1. **方法契约真 fail-closed，未校验内容不再进入提示词**：
   `validateWritingSkillInvocation` 改为逐字段归一化——scope/target/
   revisions/constraints 的值域严格校验（对象/数组/布尔出现在字符串位
   即拒绝，全部限长）；`materialManifest` 收紧为闭合形状 `{sourceRefs[]}`、
   `requestedCoverage` 收紧为 `{sourceRefs[],wholeBook:boolean}`，评审构造的
   `materialManifest.instructions` 注入现在 typed 拒绝。服务端只把归一化
   后的对象传给模型链（`sanitizedOptions`），openclaw prompt 序列化处剥离
   `writingSkill` 兜底。
2. **ack 不再冒充已执行**：新增 `server/services/writingSkillEnforcement.js`
   ——goal-review × `authoring.review.chapter` 时方法组合器真实执行（组合
   指令并入模型问题文本）、退化检查按请求携带的审查目标块真实运行并附在
   `result.writingSkillChecks`，此时 ack `enforcement:'applied'`；其余任务
   一律 `enforcement:'validated-only'` 且不改问题文本、零检查，杜绝
   「已确认、实际没执行」的静默降级。
3. **选区审阅不再越界**：`collectLocalAuthoringProofingFindings` 按
   `coverage.scopeKind==='selection'` 冻结窗口节点过滤（merge 链路同享），
   选第一段时第二段的本地错误不再上报。
4. **coverage 去重叠唯一计数**：coverage 计划按唯一 nodeId 统计
   `totalChars/uniqueNodeCount`，报告新增 `uniqueNodeRead/uniqueNodeRead`、
   `documentRatio`；重叠窗口不再把 readChars 累计到超过全文（评审反例
   830/949 现在反例断言固化在 eval）。
5. **退化定位语义偏移**：`stripQuotedWithIndexMap` 在剥离引号时记录
   剥离后下标→原文 UTF-16 下标映射，长句复读定位换算回原文坐标；新增
   `positive-quoted-repeat.txt` fixture（引号前置复读）断言 exact 落在
   句子本身，上游行/列判定对照保持逐条一致。
6. **预算严格拒绝**：非 number/NaN/Infinity/负数/零一律 typed 拒绝，
   不再静默回落最大预算（`'abc'`/`{}` 反例固化在 eval）。

返工后 eval 规模：degeneration 8/8（新增引号前置反例）、method contract
41/41（新增注入/预算/enforcement 反例）、goal-review session 31/31（新增
重叠唯一计数与 scope 外不上报反例）、method composition 13/13。

## 门禁与真实旅程

- `npm run verify:full` exit 0（S01–S03 后与 S05 后各跑一轮）：20/20 测试文件、
  200/200 用例（预算顶格，本批新增验证全部走 scripts/eval，未占 Vitest 预算）、
  lint 增量干净、双 build、结构预算与 docs build 通过。
- 三条旅程 Gate（返工后终态复跑）：46/46、33/33、29/29；四条 eval：
  degeneration 8/8、method contract 41/41、goal-review session 31/31、
  method composition 13/13。verify:full 在返工后 exit 0。
- 运行方式：worktree 内 `npx vite --port 5219`，`BASE=http://127.0.0.1:5219
  node scripts/authoring-ui/<check>.mjs`；eval 直接 `node scripts/writing-skills-*.mjs`。

## 未做与边界

- 真实 provider/真实稿件未跑：S12 的质量 Gate 保留未运行，本批不宣称方法有效。
- S02 只适配了 `check-degeneration.js`；`check-ai-patterns.js` 等仍未复制（见 SOURCES.md）。
- 客户端发送侧（`requestAdvisorTask` 携带 `options.writingSkill`）仍未接线——
  S04/S05 只交付 session 与方法/检查器域层；进 composable 与 UI 在 S06/S08。
- 方法有效性未经真实模型验证：S12 的质量 Gate 保留未运行。
- enforcement 目前只覆盖 goal-review × `authoring.review.chapter`；其余任务
  kind（finding-rewrite/change-impact）在 S09/S13 接入各自 owner 时从
  validated-only 翻转为 applied，翻转会带反例测试。

## 剩余队列（下一步）

- S06：既有 review 窗口分批、预算/取消/失败批次/开放项接入 run 循环（依赖 S04 ✅）。
- S07：finding 引文/locator/依赖校验、去重和级别区分（依赖 S05 ✅ + S06）。
- S08–S12：助手任务选择薄协调器、意见→rewrite target、锁定区间 patch 校验、
  采纳持久化链路、S12 完整流程 Gate。
